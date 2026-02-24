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

Extract only clearly mentioned entities from the article.
Do not hallucinate entities.
Maximum 8 entities.
If none are clearly mentioned, return an empty array.

Return STRICT JSON ONLY:

{
  "title": "",
  "content": "",
  "summary": "",
  "category": "",
  "entities": [
    { "name": "", "type": "company | model | country | lab | regulator" }
  ],
  "timeline_event": {
    "entity": "",
    "date": "",
    "title": "",
    "description": "",
    "event_type": "release | upgrade | security | regulation | funding | partnership | leadership | research | infrastructure | other"
  }
}

You MUST always return event_type in timeline_event.
Do NOT invent new labels.
Choose the closest match from the allowed values.
If uncertain, use "other".

event_type MUST be one of:
- release → new product or model launch
- upgrade → major version improvement
- security → breach, vulnerability, or data issue
- regulation → government action or policy
- funding → investment or financial event
- partnership → collaboration between entities
- leadership → CEO change or executive shift
- research → published breakthrough or paper
- infrastructure → data centers, compute expansion
- other → none of the above

If no timeline_event exists, set timeline_event to null.
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
  entities: { name: string; type: string }[];
  timeline_event: {
    entity: string;
    date: string;
    title: string;
    description: string;
    event_type?: string;
  } | null;
}

async function logIngestion(source_url: string, status: string, startTime: number, error_message?: string) {
  try {
    await supabase.from("ingestion_logs").insert({
      source_url,
      status,
      processing_time_ms: Date.now() - startTime,
      ...(error_message ? { error_message } : {}),
    });
    console.log("[ingest] Logged:", status);
  } catch (e) {
    console.error("[ingest] Failed to write ingestion log:", e);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

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
      await logIngestion(url, "duplicate", startTime);
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
    const fetchStart = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      fetchRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PhenomenyBot/1.0)",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err: any) {
      const fetchDuration = Date.now() - fetchStart;
      console.log("[ingest] Fetch time:", fetchDuration);
      if (err.name === "AbortError") {
        await logIngestion(url, "fetch_error", startTime, "Request timed out after 10s");
        return NextResponse.json(
          { success: false, error: "Request timed out." },
          { status: 408 }
        );
      }
      await logIngestion(url, "fetch_error", startTime, err.message);
      return NextResponse.json(
        { success: false, error: `Failed to fetch URL: ${err.message}` },
        { status: 400 }
      );
    }

    const fetchDuration = Date.now() - fetchStart;
    console.log("[ingest] Fetch time:", fetchDuration);

    if (!fetchRes.ok) {
      const errMsg = `URL returned ${fetchRes.status} ${fetchRes.statusText}`;
      await logIngestion(url, "fetch_error", startTime, errMsg);
      return NextResponse.json(
        { success: false, error: errMsg },
        { status: 400 }
      );
    }

    const contentType = fetchRes.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      await logIngestion(url, "fetch_error", startTime, `Unsupported content type: ${contentType}`);
      return NextResponse.json(
        { success: false, error: "Unsupported content type" },
        { status: 400 }
      );
    }

    const html = await fetchRes.text();
    let cleanedText = stripHtml(html);
    if (cleanedText.length > 15000) {
      cleanedText = cleanedText.slice(0, 15000);
      console.warn("[ingest] Content truncated");
    }

    if (cleanedText.length < 100) {
      await logIngestion(url, "fetch_error", startTime, "Extracted text too short");
      return NextResponse.json(
        { success: false, error: "Extracted text too short — possibly paywalled or empty page." },
        { status: 422 }
      );
    }

    if (!ANTHROPIC_API_KEY) {
      await logIngestion(url, "ai_validation_error", startTime, "ANTHROPIC_API_KEY not configured");
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
        await logIngestion(url, "ai_validation_error", startTime, "Empty response from Anthropic");
        return NextResponse.json(
          { success: false, error: "Empty response from Anthropic." },
          { status: 500 }
        );
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || "Unknown Anthropic error";
      await logIngestion(url, "ai_validation_error", startTime, msg);
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
      await logIngestion(url, "ai_validation_error", startTime, "Failed to parse AI response as JSON");
      return NextResponse.json(
        { success: false, error: "Failed to parse AI response as JSON." },
        { status: 500 }
      );
    }

    if (!parsed.title || !parsed.content) {
      await logIngestion(url, "ai_validation_error", startTime, "AI response missing required title or content");
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
      await logIngestion(url, "insert_error", startTime, articleError.message);
      return NextResponse.json(
        { success: false, error: `Article insert failed: ${articleError.message}` },
        { status: 500 }
      );
    }

    console.log("[ingest] Article inserted successfully, id:", articleData.id);

    const ALLOWED_ENTITY_TYPES = [
      "company",
      "model",
      "country",
      "lab",
      "regulator",
      "person",
      "institution",
      "event"
    ];

    const GENERIC_ENTITY_BLOCKLIST = [
      "ai",
      "artificial intelligence",
      "technology",
      "tech",
      "industry",
      "government",
      "company",
      "corporation",
      "startup",
      "platform",
      "system",
      "model",
      "research",
      "institute"
    ];

    const AI_CATEGORIES = ["AI", "AI Governance", "AI Operations"];
    const AI_KEYWORDS = /\b(ai|artificial intelligence|model|research|regulation)\b/i;
    const EVENT_KEYWORDS = /\b(ai|summit|expo|conference)\b/i;
    const INSTITUTION_KEYWORDS = /\b(university|institute|lab|research)\b/i;
    const REJECTED_PATTERNS = /\b(party|parties|wing|wings|venue|arena|stadium|hall|center|centre|convention center)\b/i;

    function passesContextualFilter(entity: { name: string; type: string }, articleCategory: string, articleContent: string): boolean {
      const nameLower = entity.name.trim().toLowerCase();

      if (REJECTED_PATTERNS.test(nameLower)) {
        return false;
      }

      if (entity.type === "person") {
        if (!AI_CATEGORIES.includes(articleCategory)) return false;
        if (!AI_KEYWORDS.test(articleContent)) return false;
      }

      if (entity.type === "event") {
        if (!EVENT_KEYWORDS.test(nameLower)) return false;
      }

      if (entity.type === "institution") {
        if (!INSTITUTION_KEYWORDS.test(nameLower)) return false;
      }

      return true;
    }

    const CORPORATE_SUFFIXES = /\s+(Inc\.?|Corporation|Corp\.?|Ltd\.?|LLC|Plc|PLC)$/i;

    function normalizeEntityName(raw: string): string {
      let name = raw.trim();
      name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      name = name.replace(CORPORATE_SUFFIXES, "");
      name = name.replace(/[,.\s]+$/, "");
      name = name.replace(/\s+/g, " ").trim();
      return name;
    }

    const modelEntities: { id: string; name: string }[] = [];
    let firstCompanyName: string | null = null;

    if (parsed.entities && Array.isArray(parsed.entities) && parsed.entities.length > 0) {
      for (const entity of parsed.entities) {
        if (!entity.name || typeof entity.name !== "string" || !entity.name.trim()) {
          console.warn("[ingest] Entity rejected:", entity.name);
          continue;
        }
        if (!entity.type || !ALLOWED_ENTITY_TYPES.includes(entity.type)) {
          console.warn("[ingest] Entity rejected:", entity.name);
          continue;
        }
        if (entity.name.trim().length < 2) {
          console.warn("[ingest] Entity rejected:", entity.name);
          continue;
        }
        if (/^\d+$/.test(entity.name.trim())) {
          console.warn("[ingest] Entity rejected:", entity.name);
          continue;
        }
        if (GENERIC_ENTITY_BLOCKLIST.includes(entity.name.trim().toLowerCase())) {
          console.warn("[ingest] Entity rejected:", entity.name);
          continue;
        }
        if (!passesContextualFilter(entity, parsed.category || "", parsed.content || "")) {
          console.warn("[ingest] Rejected contextual entity:", entity.name);
          continue;
        }

        const entityName = normalizeEntityName(entity.name);
        console.log("[ingest] Normalized entity:", entityName);

        if (!entityName) continue;

        const entitySlug = entityName
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const { data: existingEntity } = await supabase
          .from("entities")
          .select("id")
          .eq("slug", entitySlug)
          .limit(1)
          .single();

        let entityId: string;

        if (existingEntity) {
          entityId = existingEntity.id;
        } else {
          const { data: newEntity, error: insertEntityError } = await supabase
            .from("entities")
            .insert({ name: entityName, slug: entitySlug, type: entity.type })
            .select("id")
            .single();

          if (insertEntityError || !newEntity) {
            console.error("[ingest] Entity insert failed:", entityName, insertEntityError?.message);
            continue;
          }
          entityId = newEntity.id;
        }

        if (entity.type === "model") {
          modelEntities.push({ id: entityId, name: entityName });
        }
        if (entity.type === "company" && !firstCompanyName) {
          firstCompanyName = entityName;
        }

        const { error: linkError } = await supabase
          .from("article_entities")
          .upsert(
            { article_id: articleData.id, entity_id: entityId },
            { onConflict: "article_id,entity_id" }
          );

        if (linkError) {
          console.error("[ingest] Entity link failed:", entityName, linkError.message);
        } else {
          console.log("[ingest] Linked entity:", entityName);
        }
      }

      if (firstCompanyName && modelEntities.length > 0) {
        const companySlug = firstCompanyName
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const { data: companyEntity } = await supabase
          .from("entities")
          .select("id")
          .eq("slug", companySlug)
          .limit(1)
          .single();

        if (companyEntity) {
          for (const model of modelEntities) {
            const { error: parentError } = await supabase
              .from("entities")
              .update({ parent_id: companyEntity.id })
              .eq("id", model.id)
              .is("parent_id", null);

            if (parentError) {
              console.error(`[ingest] Parent link failed for ${model.name}:`, parentError.message);
            } else {
              console.log(`[ingest] Linked model ${model.name} to parent ${firstCompanyName}`);
            }
          }
        }
      }
    }

    console.log(
      "[ingest] timeline_event raw object:",
      JSON.stringify(parsed.timeline_event, null, 2)
    );
    console.log(
      "[ingest] raw event_type:",
      parsed.timeline_event?.event_type
    );

    const ALLOWED_EVENT_TYPES = [
      "release",
      "upgrade",
      "security",
      "regulation",
      "funding",
      "partnership",
      "leadership",
      "research",
      "infrastructure",
      "other"
    ];

    const EVENT_TYPE_KEYWORD_MAP: [string, string][] = [
      ["release", "release"],
      ["launch", "release"],
      ["upgrade", "upgrade"],
      ["update", "upgrade"],
      ["security", "security"],
      ["breach", "security"],
      ["regulation", "regulation"],
      ["policy", "regulation"],
      ["government", "regulation"],
      ["funding", "funding"],
      ["investment", "funding"],
      ["partnership", "partnership"],
      ["collaboration", "partnership"],
      ["leadership", "leadership"],
      ["ceo", "leadership"],
      ["research", "research"],
      ["paper", "research"],
      ["infrastructure", "infrastructure"],
      ["data center", "infrastructure"],
    ];

    function normalizeEventType(raw: string | undefined): string {
      if (!raw) return "other";
      const lower = raw.toLowerCase().trim();
      if (ALLOWED_EVENT_TYPES.includes(lower)) return lower;
      for (const [keyword, mapped] of EVENT_TYPE_KEYWORD_MAP) {
        if (lower.includes(keyword)) return mapped;
      }
      return "other";
    }

    if (parsed.timeline_event && parsed.timeline_event.entity) {
      const eventType = normalizeEventType(parsed.timeline_event.event_type);

      const { error: timelineError } = await supabase
        .from("timelines")
        .insert({
          entity: parsed.timeline_event.entity,
          title: parsed.timeline_event.title,
          description: parsed.timeline_event.description,
          event_date: parsed.timeline_event.date,
          event_type: eventType,
          source_url: url,
          confidence: 0.85,
        });

      if (timelineError) {
        console.error("Timeline insert failed:", timelineError.message);
      }
    }

    await logIngestion(url, "success", startTime);

    return NextResponse.json({
      success: true,
      slug,
      article_id: articleData.id,
      entities: parsed.entities || [],
    });
  } catch (err: any) {
    console.error("Ingest error:", err);
    const sourceUrl = (err as any)?._sourceUrl || "unknown";
    await logIngestion(sourceUrl, "internal_error", startTime, err.message || "Unknown error");
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
