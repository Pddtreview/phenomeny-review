import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface ClaimInfo {
  revision: number;
  verification_status: string;
  confidence: number | null;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  const includeHistory = _request.nextUrl.searchParams.get("include_history") === "true";

  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("id, name, slug, type, parent_id, summary, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (entityError) {
    return NextResponse.json(
      { error: `Database error: ${entityError.message}` },
      { status: 500 }
    );
  }

  if (!entity) {
    return NextResponse.json(
      { error: "Entity not found" },
      { status: 404 }
    );
  }

  const relSelect = "id, subject_id, object_id, predicate, source_url, confidence, is_active, valid_from, valid_to, created_at, updated_at";

  let outQuery = supabase.from("entity_relationships").select(relSelect).eq("subject_id", entity.id);
  let inQuery = supabase.from("entity_relationships").select(relSelect).eq("object_id", entity.id);

  if (!includeHistory) {
    outQuery = outQuery.eq("is_active", true);
    inQuery = inQuery.eq("is_active", true);
  }

  const [outRes, inRes, timelineRes] = await Promise.all([
    outQuery,
    inQuery,
    supabase
      .from("timelines")
      .select("id, title, description, event_date, event_type, source_url, confidence, created_at")
      .eq("entity", entity.id)
      .order("event_date", { ascending: true }),
  ]);

  const allRels = [...(outRes.data || []), ...(inRes.data || [])];
  const timelineEvents = timelineRes.data || [];

  let claimMap: Record<string, ClaimInfo> = {};
  let timelineClaimMap: Record<string, ClaimInfo> = {};

  const claimFetches: Promise<void>[] = [];

  if (allRels.length > 0) {
    claimFetches.push(
      supabase
        .from("claims")
        .select("subject_id, object_id, predicate, revision, verification_status, confidence, created_at")
        .eq("claim_type", "relationship")
        .eq("is_current", true)
        .then(({ data: claims }) => {
          if (claims) {
            for (const c of claims) {
              const key = `${c.subject_id}|${c.object_id}|${c.predicate}`;
              claimMap[key] = {
                revision: c.revision,
                verification_status: c.verification_status,
                confidence: c.confidence,
                created_at: c.created_at,
              };
            }
          }
        })
    );
  }

  if (timelineEvents.length > 0) {
    claimFetches.push(
      supabase
        .from("claims")
        .select("subject_id, structured_payload, revision, verification_status, confidence, created_at")
        .eq("claim_type", "timeline")
        .eq("is_current", true)
        .eq("subject_id", entity.id)
        .then(({ data: claims }) => {
          if (claims) {
            for (const c of claims) {
              const p = c.structured_payload as Record<string, string> | null;
              if (p) {
                const key = `${c.subject_id}|${p.event_type}|${p.event_date}|${p.title}`;
                timelineClaimMap[key] = {
                  revision: c.revision,
                  verification_status: c.verification_status,
                  confidence: c.confidence,
                  created_at: c.created_at,
                };
              }
            }
          }
        })
    );
  }

  await Promise.all(claimFetches);

  const outIds = new Set<string>();
  const inIds = new Set<string>();

  for (const r of outRes.data || []) outIds.add(r.object_id);
  for (const r of inRes.data || []) inIds.add(r.subject_id);

  const relatedEntityIds = [...new Set([...outIds, ...inIds])];

  let relatedEntities: Record<string, { id: string; name: string; slug: string; type: string }> = {};
  if (relatedEntityIds.length > 0) {
    const { data: related } = await supabase
      .from("entities")
      .select("id, name, slug, type")
      .in("id", relatedEntityIds);

    if (related) {
      for (const r of related) {
        relatedEntities[r.id] = r;
      }
    }
  }

  function enrichWithClaim(r: any) {
    const key = `${r.subject_id}|${r.object_id}|${r.predicate}`;
    const claim = claimMap[key] || null;
    return {
      ...r,
      claim: claim
        ? {
            revision: claim.revision,
            verification_status: claim.verification_status,
            confidence: claim.confidence,
            created_at: claim.created_at,
          }
        : null,
    };
  }

  const relationshipsOut = (outRes.data || []).map((r) => ({
    ...enrichWithClaim(r),
    object: relatedEntities[r.object_id] || null,
  }));

  const relationshipsIn = (inRes.data || []).map((r) => ({
    ...enrichWithClaim(r),
    subject: relatedEntities[r.subject_id] || null,
  }));

  const timeline = timelineEvents.map((t: any) => {
    const key = `${entity.id}|${t.event_type}|${t.event_date}|${t.title}`;
    const claim = timelineClaimMap[key] || null;
    return {
      ...t,
      claim: claim
        ? {
            revision: claim.revision,
            verification_status: claim.verification_status,
            confidence: claim.confidence,
            created_at: claim.created_at,
          }
        : null,
    };
  });

  return NextResponse.json({
    entity,
    relationships_out: relationshipsOut,
    relationships_in: relationshipsIn,
    timeline,
  });
}
