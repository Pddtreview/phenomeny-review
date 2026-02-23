import { NextRequest, NextResponse } from "next/server";
import { anthropicClient } from "@/lib/anthropic";

const ACTIONS: Record<string, string> = {
  clarity:
    "Rewrite the following text for maximum clarity. Preserve the original meaning but improve readability, sentence structure, and flow. Return only the rewritten text.",
  aggressive:
    "Rewrite the following text in a bold, aggressive, high-conviction editorial tone. Make it punchy and assertive. Return only the rewritten text.",
  analytical:
    "Rewrite the following text in a deeply analytical, evidence-driven tone suitable for an intelligence publication. Return only the rewritten text.",
  summary:
    "Summarize the following text into a concise executive summary of 2-3 paragraphs. Capture all key points. Return only the summary.",
  twitter:
    "Convert the following text into a compelling Twitter/X thread. Use numbered tweets, each under 280 characters. Return only the thread.",
  linkedin:
    "Convert the following text into a professional LinkedIn post. Use a compelling hook, clear structure, and a call to engagement. Return only the post.",
};

export async function POST(request: NextRequest) {
  const adminAuth = request.cookies.get("admin-auth")?.value;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || adminAuth !== adminSecret) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { content, action } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json(
      { error: "content is required and must be a string." },
      { status: 400 }
    );
  }

  if (!action || !ACTIONS[action]) {
    return NextResponse.json(
      { error: `action must be one of: ${Object.keys(ACTIONS).join(", ")}` },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured." },
      { status: 500 }
    );
  }

  try {
    const response = await anthropicClient.post("/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system:
        "You are an expert editorial assistant for Phenomeny Review™, an intelligence publication. Follow the instruction precisely and return only the transformed text with no preamble or explanation.",
      messages: [
        {
          role: "user",
          content: `${ACTIONS[action]}\n\n---\n\n${content}`,
        },
      ],
    });

    const result = response.data?.content?.[0]?.text;

    if (!result) {
      return NextResponse.json(
        { error: "No response from Anthropic." },
        { status: 502 }
      );
    }

    return NextResponse.json({ result });
  } catch (err: any) {
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
