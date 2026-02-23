import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getUniqueSlug(baseSlug: string): Promise<string> {
  const { data } = await supabase
    .from("articles")
    .select("slug")
    .like("slug", `${baseSlug}%`);

  if (!data || data.length === 0) {
    return baseSlug;
  }

  const existing = new Set(data.map((row: { slug: string }) => row.slug));

  if (!existing.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (existing.has(`${baseSlug}-${counter}`)) {
    counter++;
  }

  return `${baseSlug}-${counter}`;
}

export async function GET() {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message });
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, content, status, publish_at } = body;

  if (!title || !content) {
    return NextResponse.json(
      { success: false, error: "title and content are required." },
      { status: 400 }
    );
  }

  const articleStatus = status || "draft";
  const validStatuses = ["draft", "published", "scheduled"];

  if (!validStatuses.includes(articleStatus)) {
    return NextResponse.json(
      { success: false, error: "status must be 'draft', 'published', or 'scheduled'." },
      { status: 400 }
    );
  }

  if (articleStatus === "scheduled" && !publish_at) {
    return NextResponse.json(
      { success: false, error: "publish_at is required when status is 'scheduled'." },
      { status: 400 }
    );
  }

  let articlePublishAt = publish_at || null;

  if (articleStatus === "published" && !articlePublishAt) {
    articlePublishAt = new Date().toISOString();
  }

  const baseSlug = generateSlug(title);
  const slug = await getUniqueSlug(baseSlug);

  const { data, error } = await supabase
    .from("articles")
    .insert({ title, content, slug, status: articleStatus, publish_at: articlePublishAt })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message });
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
