import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropicClient, ANTHROPIC_API_KEY } from "@/lib/anthropic";

async function insertTimelineWithClaim(params: {
  entityId: string;
  title: string;
  description: string;
  eventDate: string;
  eventType: string;
  sourceUrl: string;
  confidence: number;
}) {
  const { entityId, title, description, eventDate, eventType, sourceUrl, confidence } = params;

  const { data: existing } = await supabase
    .from("timelines")
    .select("id")
    .eq("entity", entityId)
    .eq("event_type", eventType)
    .eq("event_date", eventDate)
    .eq("title", title)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("[ingest] Duplicate timeline event, skipping:", title);
    return { inserted: false, error: null };
  }

  const { error: timelineError } = await supabase
    .from("timelines")
    .insert({
      entity: entityId,
      title,
      description,
      event_date: eventDate,
      event_type: eventType,
      source_url: sourceUrl,
      confidence,
    });

  if (timelineError) {
    console.error("[ingest] Timeline insert failed:", timelineError.message);
    return { inserted: false, error: timelineError };
  }

  const { error: claimErr } = await supabase
    .from("claims")
    .insert({
      claim_type: "timeline",
      subject_id: entityId,
      structured_payload: { event_type: eventType, event_date: eventDate, title, description },
      source_url: sourceUrl,
      confidence,
      revision: 1,
      is_current: true,
    });

  if (claimErr) {
    console.error("[ingest] Timeline claim insert failed:", claimErr.message);
  } else {
    console.log("[ingest] Timeline + claim created:", title);
  }

  return { inserted: true, error: null };
}

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
    { "name": "", "type": "company | model | country | lab | regulator | venue" }
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
      "event",
      "venue"
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
    const REJECTED_PATTERNS = /\b(party|parties|wing|wings)\b/i;
    const VENUE_ONLY_PATTERNS = /\b(arena|stadium|hall|center|centre|convention center)\b/i;

    function passesContextualFilter(entity: { name: string; type: string }, articleCategory: string, articleContent: string): boolean {
      const nameLower = entity.name.trim().toLowerCase();

      if (REJECTED_PATTERNS.test(nameLower)) {
        return false;
      }

      if (entity.type !== "venue" && VENUE_ONLY_PATTERNS.test(nameLower)) {
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

    let firstCompanyId: string | null = null;
    const modelEntityIds: string[] = [];

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
          modelEntityIds.push(entityId);
        }
        if (entity.type === "company" && !firstCompanyId) {
          firstCompanyId = entityId;
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

      if (firstCompanyId && modelEntityIds.length > 0) {
        console.log("[ingest] Linking models to company:", firstCompanyId);
        console.log("[ingest] Model IDs:", modelEntityIds);

        const { data: updateResult, error: parentError } = await supabase
          .from("entities")
          .update({ parent_id: firstCompanyId })
          .in("id", modelEntityIds)
          .is("parent_id", null)
          .select();

        console.log("[ingest] Link result:", JSON.stringify(updateResult));

        if (parentError) {
          console.error("[ingest] Parent link failed:", parentError.message);
        } else {
          console.log(`[ingest] Parent linkage complete: ${updateResult?.length || 0} models linked`);
        }
      }

      for (const modelId of modelEntityIds) {
        const { data: existingTimeline } = await supabase
          .from("timelines")
          .select("id")
          .eq("entity", modelId)
          .limit(1);

        if (!existingTimeline || existingTimeline.length === 0) {
          await insertTimelineWithClaim({
            entityId: modelId,
            title: "First appearance in repository",
            description: parsed.title || "",
            eventDate: new Date().toISOString().slice(0, 10),
            eventType: "first_appearance",
            sourceUrl: url,
            confidence: 0.7,
          });
        }
      }
    }

    if (parsed.entities && Array.isArray(parsed.entities) && parsed.entities.length > 0) {
      for (const entity of parsed.entities) {
        const entityName = normalizeEntityName(entity.name || "");
        if (!entityName) continue;

        const entitySlug = entityName
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const { data: existingEnt } = await supabase
          .from("entities")
          .select("id, summary")
          .eq("slug", entitySlug)
          .limit(1)
          .single();

        if (existingEnt && !existingEnt.summary) {
          try {
            const summaryResponse = await anthropicClient.post("/messages", {
              model: "claude-sonnet-4-20250514",
              max_tokens: 600,
              system: `You are a concise encyclopedia writer. Write a 200–300 word structured summary about the given entity. Cover: what it is, its significance in the AI/tech landscape, key products or contributions, and notable milestones. Use neutral, analytical tone. No markdown. No headers. Plain text only.`,
              messages: [
                {
                  role: "user",
                  content: `Write a 200–300 word summary about: ${entityName} (type: ${entity.type})`,
                },
              ],
            });

            const summaryText = summaryResponse.data?.content?.[0]?.text;
            if (summaryText && summaryText.trim().length > 50) {
              const { error: summaryUpdateError } = await supabase
                .from("entities")
                .update({ summary: summaryText.trim() })
                .eq("id", existingEnt.id)
                .is("summary", null);

              if (summaryUpdateError) {
                console.error("[ingest] Summary update failed for", entityName, summaryUpdateError.message);
              } else {
                console.log("[ingest] Summary generated for:", entityName);
              }
            }
          } catch (summaryErr: any) {
            console.error("[ingest] Summary generation failed for", entityName, summaryErr.message);
          }
        }
      }
    }

    const ALLOWED_PREDICATES = [
      "partnered_with",
      "acquired",
      "invested_in",
      "competes_with",
      "developed",
      "regulates",
      "funded_by",
      "subsidiary_of",
      "spun_off",
      "collaborated_with",
      "supplies_to",
      "licensed_from",
    ];

    if (parsed.entities && Array.isArray(parsed.entities) && parsed.entities.length >= 2) {
      const entityNames = parsed.entities
        .map((e: { name: string }) => normalizeEntityName(e.name || ""))
        .filter(Boolean);

      if (entityNames.length >= 2) {
        try {
          const relPrompt = `From the following article text and list of entities, extract relationships between entities.

Entities: ${entityNames.join(", ")}

Allowed predicates (use ONLY these):
${ALLOWED_PREDICATES.join(", ")}

Return STRICT JSON array only. No markdown. No commentary.
Each element: {"subject": "", "predicate": "", "object": "", "confidence": 0.0}

Rules:
- subject and object MUST be from the entity list above
- predicate MUST be from the allowed list
- confidence between 0.0 and 1.0
- If no relationships exist, return []

Article text:
${parsed.content.slice(0, 3000)}`;

          const relResponse = await anthropicClient.post("/messages", {
            model: "claude-sonnet-4-20250514",
            max_tokens: 800,
            system: "You extract entity relationships from text. Return only valid JSON arrays. No markdown.",
            messages: [{ role: "user", content: relPrompt }],
          });

          const relRaw = relResponse.data?.content?.[0]?.text;
          if (relRaw) {
            const cleaned = relRaw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            const relationships = JSON.parse(cleaned);

            if (Array.isArray(relationships)) {
              for (const rel of relationships) {
                if (!rel.subject || !rel.predicate || !rel.object) continue;
                if (!ALLOWED_PREDICATES.includes(rel.predicate)) continue;

                const subjectName = normalizeEntityName(rel.subject);
                const objectName = normalizeEntityName(rel.object);
                if (!subjectName || !objectName) continue;

                const subjectSlug = subjectName.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
                const objectSlug = objectName.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");

                const [subjectRes, objectRes] = await Promise.all([
                  supabase.from("entities").select("id").eq("slug", subjectSlug).limit(1).single(),
                  supabase.from("entities").select("id").eq("slug", objectSlug).limit(1).single(),
                ]);

                if (!subjectRes.data || !objectRes.data) {
                  console.warn("[ingest] Relationship entity not found:", subjectName, "or", objectName);
                  continue;
                }

                const subjectId = subjectRes.data.id;
                const objectId = objectRes.data.id;
                const confidence = typeof rel.confidence === "number" ? Math.min(1, Math.max(0, rel.confidence)) : 0.7;

                const { data: exactMatch } = await supabase
                  .from("entity_relationships")
                  .select("id")
                  .eq("subject_id", subjectId)
                  .eq("object_id", objectId)
                  .eq("predicate", rel.predicate)
                  .eq("is_active", true)
                  .limit(1);

                if (exactMatch && exactMatch.length > 0) {
                  console.log("[ingest] Active identical relationship exists:", subjectName, rel.predicate, objectName);
                  continue;
                }

                const { data: samePredicateRows } = await supabase
                  .from("entity_relationships")
                  .select("id")
                  .eq("subject_id", subjectId)
                  .eq("predicate", rel.predicate)
                  .eq("is_active", true);

                let maxRevision = 0;

                if (samePredicateRows && samePredicateRows.length > 0) {
                  const idsToDeactivate = samePredicateRows.map((r) => r.id);
                  const now = new Date().toISOString();
                  const today = now.slice(0, 10);
                  await supabase
                    .from("entity_relationships")
                    .update({
                      is_active: false,
                      valid_to: today,
                      updated_at: now,
                    })
                    .in("id", idsToDeactivate);

                  const { data: oldClaims } = await supabase
                    .from("claims")
                    .select("id, revision")
                    .eq("claim_type", "relationship")
                    .eq("subject_id", subjectId)
                    .eq("predicate", rel.predicate)
                    .eq("is_current", true);

                  if (oldClaims && oldClaims.length > 0) {
                    for (const c of oldClaims) {
                      if (c.revision > maxRevision) maxRevision = c.revision;
                    }
                    await supabase
                      .from("claims")
                      .update({ is_current: false, updated_at: now })
                      .in("id", oldClaims.map((c) => c.id));
                  }

                  console.log("[ingest] Deactivated", idsToDeactivate.length, "prior relationship(s) for", subjectName, rel.predicate);
                }

                const nowInsert = new Date().toISOString();
                const todayInsert = nowInsert.slice(0, 10);
                const { error: relInsertError } = await supabase
                  .from("entity_relationships")
                  .insert({
                    subject_id: subjectId,
                    object_id: objectId,
                    predicate: rel.predicate,
                    source_url: url,
                    confidence,
                    is_active: true,
                    valid_from: todayInsert,
                    updated_at: nowInsert,
                  });

                if (relInsertError) {
                  console.error("[ingest] Relationship insert failed:", relInsertError.message);
                } else {
                  const { error: claimErr } = await supabase
                    .from("claims")
                    .insert({
                      claim_type: "relationship",
                      subject_id: subjectId,
                      object_id: objectId,
                      predicate: rel.predicate,
                      structured_payload: null,
                      source_url: url,
                      confidence,
                      revision: maxRevision + 1,
                      is_current: true,
                    });
                  if (claimErr) {
                    console.error("[ingest] Claim insert failed:", claimErr.message);
                  } else {
                    console.log("[ingest] Relationship + claim created:", subjectName, rel.predicate, objectName, "rev", maxRevision + 1);
                  }
                }
              }
            }
          }
        } catch (relErr: any) {
          console.error("[ingest] Relationship extraction failed:", relErr.message);
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

      const timelineEntityName = parsed.timeline_event.entity;
      const timelineEntitySlug = timelineEntityName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const { data: timelineEntity } = await supabase
        .from("entities")
        .select("id")
        .eq("slug", timelineEntitySlug)
        .limit(1)
        .single();

      if (timelineEntity) {
        await insertTimelineWithClaim({
          entityId: timelineEntity.id,
          title: parsed.timeline_event.title,
          description: parsed.timeline_event.description || "",
          eventDate: parsed.timeline_event.date,
          eventType: eventType,
          sourceUrl: url,
          confidence: 0.85,
        });
      } else {
        console.warn("[ingest] Timeline entity not found in DB:", timelineEntityName);
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
