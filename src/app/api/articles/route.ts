import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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
  const { title, content } = body;

  if (!title || !content) {
    return NextResponse.json(
      { success: false, error: "title and content are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("articles")
    .insert({ title, content })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message });
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
