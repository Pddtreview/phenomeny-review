import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json(
      { success: false, error: "Email is required." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("subscribers").insert({ email });

  if (error) {
    return NextResponse.json({ success: false, error: error.message });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
