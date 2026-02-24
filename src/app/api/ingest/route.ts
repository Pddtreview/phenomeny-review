import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropicClient, ANTHROPIC_API_KEY } from "@/lib/anthropic";

const SYSTEM_PROMPT = `
You are an intelligence analysis engine.

Rewrite the provided article into a neutral, analytical intelligence brief.

Remove marketing tone.
No hype.
Technical significance.
Geopolitical impact.

Select category strictly from:

AI
AI Governance
AI Operations
Quantum
Space
Biotech
India–China
USA Europe
Intelligence Brief

Return STRICT JSON ONLY:

{
  "title": "",
  "content": "",
  "summary": "",
  "category": "",
  "timeline_event": {
    "entity": "",
    "date": "",
    "title": "",
    "description": ""
  }
}

If no timeline_event exists, return null.
No markdown.
No commentary.
Only valid JSON.
`;

function checkAuth(request: NextRequest): boolean {
  const adminAuth = request.cookies.get("admin-auth")?.value;
  const adminSecret = process.env.ADMIN_SECRET;
  return !!adminSecret && adminAuth === adminSecret;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function getUniqueSlug(baseSlug: string): Promise<string> {
  const { data } = await supabase
    .from("articles")
    .select("slug")
    .like("slug", `${baseSlug}%`);

  if (!data || data.length === 0) return baseSlug;

  const existing = new Set(data.map((row: { slug: string }) => row.slug));
  if (!existing.has(baseSlug)) return baseSlug;

  let counter = 2;
  while (existing.has(`${baseSlug}-${counter}`)) counter++;
  return `${baseSlug}-${counter}`;
}

function stripHtml(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<aside[\s\S]*?<\/aside>/gi, "");
  text = text.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, " ");
  return text.trim();
}

interface AiResult {
  title: string;
  content: string;
  summary: string;
  category: string;
  timeline_event: {
    entity: string;
    date: string;
    title: string;
    description: string;
  } | null;
}

export async function POST(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    let body: { url?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const { url } = body;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "url is required." }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid URL format." }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("articles")
      .select("id, title")
      .eq("source_url", url)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Already ingested: "${existing[0].title}"`,
          duplicate: true,
          existing_id: existing[0].id,
        },
        { status: 409 }
      );
    }

    let fetchRes: Response;
    try {
      fetchRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PhenomenyBot/1.0)",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch URL: ${err.message}` },
        { status: 400 }
      );
    }

    if (!fetchRes.ok) {
      return NextResponse.json(
        { success: false, error: `URL returned ${fetchRes.status} ${fetchRes.statusText}` },
        { status: 400 }
      );
    }

    const html = await fetchRes.text();
    const cleanedText = stripHtml(html).slice(0, 15000);

    if (cleanedText.length < 100) {
      return NextResponse.json(
        { success: false, error: "Extracted text too short — possibly paywalled or empty page." },
        { status: 422 }
      );
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: "ANTHROPIC_API_KEY is not configured." },
        { status: 500 }
      );
    }

    let aiRaw: string;
    try {
      const response = await anthropicClient.post("/messages", {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: cleanedText,
          },
        ],
      });

      aiRaw = response.data?.content?.[0]?.text;
      if (!aiRaw) {
        return NextResponse.json(
          { success: false, error: "Empty response from Anthropic." },
          { status: 500 }
        );
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || "Unknown Anthropic error";
      return NextResponse.json(
        { success: false, error: `AI request failed: ${msg}` },
        { status: 500 }
      );
    }

    let parsed: AiResult;
    try {
      const cleaned = aiRaw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to parse AI response as JSON." },
        { status: 500 }
      );
    }

    if (!parsed.title || !parsed.content) {
      return NextResponse.json(
        { success: false, error: "AI response missing required title or content." },
        { status: 500 }
      );
    }

    const baseSlug = generateSlug(parsed.title);
    const slug = await getUniqueSlug(baseSlug);

    const articleInsert = {
      title: parsed.title,
      content: parsed.content,
      slug,
      status: "published",
      publish_at: new Date().toISOString(),
      source_url: url,
    };

    console.log("[ingest] Inserting article (category omitted to isolate schema cache issue)");

    const { data: articleData, error: articleError } = await supabase
      .from("articles")
      .insert(articleInsert)
      .select("id")
      .single();

    if (articleError) {
      console.error("[ingest] Article insert error:", JSON.stringify(articleError, null, 2));
      return NextResponse.json(
        { success: false, error: `Article insert failed: ${articleError.message}` },
        { status: 500 }
      );
    }

    console.log("[ingest] Article inserted successfully, id:", articleData.id);

    if (parsed.timeline_event && parsed.timeline_event.entity) {
      const { error: timelineError } = await supabase
        .from("timelines")
        .insert({
          entity: parsed.timeline_event.entity,
          title: parsed.timeline_event.title,
          description: parsed.timeline_event.description,
          event_date: parsed.timeline_event.date,
          source_url: url,
          confidence: 0.85,
        });

      if (timelineError) {
        console.error("Timeline insert failed:", timelineError.message);
      }
    }

    return NextResponse.json({
      success: true,
      slug,
      article_id: articleData.id,
    });
  } catch (err: any) {
    console.error("Ingest error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
