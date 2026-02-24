import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const adminAuth = request.cookies.get("admin-auth")?.value;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || adminAuth !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("claims")
    .select("id, claim_type, subject_id, object_id, predicate, structured_payload, source_url, confidence, revision, is_current, verification_status, created_by, updated_by, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entityIds = new Set<string>();
  for (const c of data || []) {
    if (c.subject_id) entityIds.add(c.subject_id);
    if (c.object_id) entityIds.add(c.object_id);
  }

  let entityMap: Record<string, { name: string; slug: string; type: string }> = {};
  if (entityIds.size > 0) {
    const { data: entities } = await supabase
      .from("entities")
      .select("id, name, slug, type")
      .in("id", [...entityIds]);

    if (entities) {
      for (const e of entities) {
        entityMap[e.id] = { name: e.name, slug: e.slug, type: e.type };
      }
    }
  }

  const enriched = (data || []).map((c) => ({
    ...c,
    subject: c.subject_id ? entityMap[c.subject_id] || null : null,
    object: c.object_id ? entityMap[c.object_id] || null : null,
  }));

  return NextResponse.json({ success: true, data: enriched });
}

export async function PATCH(request: NextRequest) {
  const adminAuth = request.cookies.get("admin-auth")?.value;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || adminAuth !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, verification_status } = body;

  const allowed = ["auto_extracted", "human_reviewed", "verified", "disputed"];
  if (!id || !allowed.includes(verification_status)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const { error } = await supabase
    .from("claims")
    .update({
      verification_status,
      updated_by: "admin",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
