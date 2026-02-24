import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

  const relationshipsOut = (outRes.data || []).map((r) => ({
    ...r,
    object: relatedEntities[r.object_id] || null,
  }));

  const relationshipsIn = (inRes.data || []).map((r) => ({
    ...r,
    subject: relatedEntities[r.subject_id] || null,
  }));

  return NextResponse.json({
    entity,
    relationships_out: relationshipsOut,
    relationships_in: relationshipsIn,
    timeline: timelineRes.data || [],
  });
}
