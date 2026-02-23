import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function checkAuth(request: NextRequest): boolean {
  const adminAuth = request.cookies.get("admin-auth")?.value;
  const adminSecret = process.env.ADMIN_SECRET;
  return !!adminSecret && adminAuth === adminSecret;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const { status } = body;

  if (!status || (status !== "draft" && status !== "published")) {
    return NextResponse.json(
      { error: "status must be 'draft' or 'published'." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("articles")
    .update({ status })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase
    .from("articles")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
