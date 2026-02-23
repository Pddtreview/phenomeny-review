import { NextRequest, NextResponse } from "next/server";
import { anthropicClient } from "@/lib/anthropic";

const SYSTEM_PROMPT =
  "You are an expert geopolitical and AI analyst writing for an intelligence publication called Phenomeny Review™. Write in analytical, authoritative tone.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic } = body;

    if (!topic || typeof topic !== "string") {
      return NextResponse.json(
        { error: "topic is required and must be a string." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key is not configured." },
        { status: 500 }
      );
    }

    const response = await anthropicClient.post("/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write a publication-ready article on the following topic: "${topic}"

Requirements:
- Generate a strong, compelling article title
- Write 800–1200 words of article content
- Return ONLY valid JSON in this exact format, with no other text:
{"title": "Your Title Here", "content": "Your article content here..."}`,
        },
      ],
    });

    const raw = response.data?.content?.[0]?.text;

    if (!raw) {
      return NextResponse.json(
        { error: "No response from Anthropic." },
        { status: 502 }
      );
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse generated content." },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.title || !parsed.content) {
      return NextResponse.json(
        { error: "Generated content is missing title or content." },
        { status: 502 }
      );
    }

    return NextResponse.json({ title: parsed.title, content: parsed.content });
  } catch (err: any) {
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
