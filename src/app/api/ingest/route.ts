import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { supabase } from "@/lib/supabase";
import { anthropicClient, ANTHROPIC_API_KEY } from "@/lib/anthropic";

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

async function fetchAndClean(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PhenomenyBot/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, aside, iframe, noscript, form, .ad, .advertisement, .sidebar, .menu, .nav").remove();

  const title =
    $("article h1").first().text().trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Untitled";

  const articleEl = $("article").first();
  let text: string;

  if (articleEl.length) {
    text = articleEl.find("p, h2, h3, h4, blockquote, li").map(function () {
      return $(this).text().trim();
    }).get().filter(Boolean).join("\n\n");
  } else {
    text = $("main, .content, .post, .entry, .article, body").first()
      .find("p, h2, h3, h4, blockquote, li").map(function () {
        return $(this).text().trim();
      }).get().filter(Boolean).join("\n\n");
  }

  if (!text || text.length < 100) {
    text = $("body").find("p").map(function () {
      return $(this).text().trim();
    }).get().filter(Boolean).join("\n\n");
  }

  return { title, text: text.slice(0, 15000) };
}

const EXTRACTION_PROMPT = `You are an intelligence analyst for Phenomeny Review™, an AI-powered editorial intelligence engine.

You will receive raw text extracted from a news article about AI, technology, geopolitics, quantum computing, space, or biotech.

Your job is to produce STRICT structured JSON output. No commentary. No markdown. Only valid JSON.

Return this exact structure:
{
  "article": {
    "title": "A clear, editorial-quality headline (rewritten for intelligence clarity)",
    "content": "A structured intelligence brief of 300-600 words. Write in analytical editorial style. Include: context, key developments, implications, and strategic significance. Use paragraph breaks."
  },
  "timeline_event": {
    "entity": "The primary organization, government, or actor involved (e.g. 'OpenAI', 'European Commission', 'China MIIT')",
    "title": "One-line event summary (under 120 characters)",
    "description": "2-3 sentence factual description of the event for timeline tracking",
    "event_date": "YYYY-MM-DD format. Use the article's date if mentioned, otherwise use today's date.",
    "confidence": 0.85
  }
}

Rules:
- confidence is a float between 0.0 and 1.0 indicating how confident you are in the extraction accuracy
- entity must be a specific named organization, company, or government body — never generic
- event_date must be a valid date in YYYY-MM-DD format
- content must be original analytical writing, NOT a copy of the source text
- Do NOT wrap in markdown code blocks. Return raw JSON only.`;

interface IngestResult {
  article: {
    title: string;
    content: string;
  };
  timeline_event: {
    entity: string;
    title: string;
    description: string;
    event_date: string;
    confidence: number;
  };
}

async function extractIntelligence(sourceTitle: string, sourceText: string): Promise<IngestResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const response = await anthropicClient.post("/messages", {
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Source headline: ${sourceTitle}\n\n---\n\nSource text:\n${sourceText}`,
      },
    ],
    system: EXTRACTION_PROMPT,
  });

  const raw = response.data?.content?.[0]?.text;
  if (!raw) {
    throw new Error("Empty response from Anthropic.");
  }

  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: IngestResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse Anthropic response as JSON.");
  }

  if (!parsed.article?.title || !parsed.article?.content) {
    throw new Error("Anthropic response missing article fields.");
  }
  if (!parsed.timeline_event?.entity || !parsed.timeline_event?.title) {
    throw new Error("Anthropic response missing timeline_event fields.");
  }

  return parsed;
}

export async function POST(request: NextRequest) {
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
    return NextResponse.json(
      { success: false, error: "url is required." },
      { status: 400 }
    );
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid URL format." },
      { status: 400 }
    );
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

  let sourceTitle: string;
  let sourceText: string;

  try {
    const cleaned = await fetchAndClean(url);
    sourceTitle = cleaned.title;
    sourceText = cleaned.text;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Failed to fetch URL: ${err.message}` },
      { status: 502 }
    );
  }

  if (sourceText.length < 100) {
    return NextResponse.json(
      { success: false, error: "Extracted text too short — possibly paywalled or empty page." },
      { status: 422 }
    );
  }

  let intelligence: IngestResult;
  try {
    intelligence = await extractIntelligence(sourceTitle, sourceText);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `AI extraction failed: ${err.message}` },
      { status: 500 }
    );
  }

  const baseSlug = generateSlug(intelligence.article.title);
  const slug = await getUniqueSlug(baseSlug);

  const { data: articleData, error: articleError } = await supabase
    .from("articles")
    .insert({
      title: intelligence.article.title,
      content: intelligence.article.content,
      slug,
      status: "published",
      publish_at: new Date().toISOString(),
      source_url: url,
    })
    .select()
    .single();

  if (articleError) {
    return NextResponse.json(
      { success: false, error: `Article insert failed: ${articleError.message}` },
      { status: 500 }
    );
  }

  const { data: timelineData, error: timelineError } = await supabase
    .from("timelines")
    .insert({
      entity: intelligence.timeline_event.entity,
      title: intelligence.timeline_event.title,
      description: intelligence.timeline_event.description,
      source_url: url,
      confidence: intelligence.timeline_event.confidence,
      event_date: intelligence.timeline_event.event_date,
    })
    .select()
    .single();

  if (timelineError) {
    return NextResponse.json({
      success: true,
      warning: `Article saved but timeline insert failed: ${timelineError.message}`,
      article: articleData,
      timeline: null,
    });
  }

  return NextResponse.json({
    success: true,
    article: articleData,
    timeline: timelineData,
  }, { status: 201 });
}
