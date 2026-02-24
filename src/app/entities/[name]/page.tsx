import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface EntityPageProps {
  params: { name: string };
}

async function getEntity(name: string) {
  const decoded = decodeURIComponent(name).toLowerCase();

  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .eq("slug", decoded)
    .maybeSingle();

  if (error) {
    console.error("[entity] Fetch error for slug:", decoded, error.message);
    return null;
  }
  if (!data) {
    console.log("[entity] No entity found for slug:", decoded);
    return null;
  }
  return data;
}

export async function generateMetadata({ params }: EntityPageProps): Promise<Metadata> {
  const entity = await getEntity(params.name);

  if (!entity) {
    return { title: "Entity Not Found" };
  }

  const title = `${entity.name} — AI Intelligence Timeline | Phenomeny Review™`;
  const description = `Explore ${entity.name}'s AI developments, related articles, research milestones, and innovation timeline.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Phenomeny Review™",
    },
  };
}

async function getRelatedArticles(entityId: string) {
  const { data, error } = await supabase
    .from("article_entities")
    .select("article_id")
    .eq("entity_id", entityId);

  if (error || !data || data.length === 0) return [];

  const articleIds = data.map((row: { article_id: string }) => row.article_id);

  const { data: articles, error: articlesError } = await supabase
    .from("articles")
    .select("id, title, slug, publish_at, status")
    .in("id", articleIds)
    .eq("status", "published")
    .order("publish_at", { ascending: false });

  if (articlesError || !articles) return [];
  return articles;
}

async function getEvolutionModels(companyId: string) {
  const { data: models, error } = await supabase
    .from("entities")
    .select("id, name, slug, created_at")
    .eq("parent_id", companyId)
    .eq("type", "model");

  if (error || !models || models.length === 0) return [];

  const modelIds = models.map((m: any) => m.id);

  const { data: timelineRows } = await supabase
    .from("timelines")
    .select("entity, event_date")
    .in("entity", modelIds)
    .order("event_date", { ascending: true });

  const firstEventMap: Record<string, string> = {};
  if (timelineRows) {
    for (const row of timelineRows) {
      if (!firstEventMap[row.entity]) {
        firstEventMap[row.entity] = row.event_date;
      }
    }
  }

  return models
    .map((m: any) => ({
      ...m,
      first_event: firstEventMap[m.id] || null,
    }))
    .sort((a: any, b: any) => {
      const da = a.first_event ? new Date(a.first_event).getTime() : Infinity;
      const db = b.first_event ? new Date(b.first_event).getTime() : Infinity;
      return da - db;
    });
}

async function getTimelineEntries(entityId: string) {
  const { data, error } = await supabase
    .from("timelines")
    .select("*")
    .eq("entity", entityId)
    .order("event_date", { ascending: false });

  if (error || !data) return [];
  return data;
}

export default async function EntityPage({ params }: EntityPageProps) {
  const entity = await getEntity(params.name);

  if (!entity) {
    notFound();
  }

  const isModel = entity.type === "model" && entity.parent_id;
  const isCompany = entity.type === "company";

  const [articles, timeline, evolution, parentCompany, siblings] = await Promise.all([
    getRelatedArticles(entity.id),
    getTimelineEntries(entity.id),
    isCompany ? getEvolutionModels(entity.id) : Promise.resolve([]),
    isModel
      ? supabase.from("entities").select("id, name, slug").eq("id", entity.parent_id).maybeSingle().then(r => r.data)
      : Promise.resolve(null),
    isModel
      ? supabase.from("entities").select("id, name, slug").eq("parent_id", entity.parent_id).eq("type", "model").neq("id", entity.id).then(r => r.data || [])
      : Promise.resolve([]),
  ]);

  const schemaTypeMap: Record<string, string> = {
    company: "Organization",
    lab: "Organization",
    institution: "Organization",
    regulator: "Organization",
    person: "Person",
    country: "Place",
    event: "Event",
    model: "SoftwareApplication",
  };

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": schemaTypeMap[entity.type] || "Thing",
    "name": entity.name,
    "url": `${baseUrl}/entities/${entity.slug}`,
  };

  let snapshot: {
    totalModels: number;
    firstModelYear: string | null;
    latestModelName: string | null;
    totalTimelineEvents: number;
    mostRecentActivity: string | null;
  } | null = null;

  let crossCompanyExposure: { id: string; name: string; slug: string; frequency: number }[] = [];
  let modelGrowth: { year: string; count: number }[] = [];

  if (isCompany && evolution.length > 0) {
    const modelIds = evolution.map((m: any) => m.id);
    const allEntityIds = [entity.id, ...modelIds];

    const { count: timelineCount } = await supabase
      .from("timelines")
      .select("id", { count: "exact", head: true })
      .in("entity", allEntityIds);

    const { data: recentRow } = await supabase
      .from("timelines")
      .select("event_date")
      .in("entity", allEntityIds)
      .order("event_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const withDates = evolution.filter((m: any) => m.first_event);
    const sorted = [...withDates].sort((a: any, b: any) =>
      new Date(a.first_event).getTime() - new Date(b.first_event).getTime()
    );

    snapshot = {
      totalModels: evolution.length,
      firstModelYear: sorted.length > 0
        ? new Date(sorted[0].first_event).getFullYear().toString()
        : null,
      latestModelName: sorted.length > 0 ? sorted[sorted.length - 1].name : null,
      totalTimelineEvents: timelineCount || 0,
      mostRecentActivity: recentRow?.event_date
        ? new Date(recentRow.event_date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : null,
    };

    const yearMap: Record<string, Set<string>> = {};
    for (const m of evolution) {
      if (m.first_event) {
        const yr = new Date(m.first_event).getFullYear().toString();
        if (!yearMap[yr]) yearMap[yr] = new Set();
        yearMap[yr].add(m.id);
      }
    }
    modelGrowth = Object.entries(yearMap)
      .map(([year, ids]) => ({ year, count: ids.size }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }

  if (isCompany) {
    const { data: companyArticleLinks } = await supabase
      .from("article_entities")
      .select("article_id")
      .eq("entity_id", entity.id);

    if (companyArticleLinks && companyArticleLinks.length > 0) {
      const articleIds = companyArticleLinks.map((r: any) => r.article_id);

      const { data: coEntities } = await supabase
        .from("article_entities")
        .select("entity_id")
        .in("article_id", articleIds)
        .neq("entity_id", entity.id);

      if (coEntities && coEntities.length > 0) {
        const freqMap: Record<string, number> = {};
        for (const row of coEntities) {
          freqMap[row.entity_id] = (freqMap[row.entity_id] || 0) + 1;
        }

        const coEntityIds = Object.keys(freqMap);

        const { data: coCompanies } = await supabase
          .from("entities")
          .select("id, name, slug")
          .in("id", coEntityIds)
          .eq("type", "company");

        if (coCompanies) {
          crossCompanyExposure = coCompanies
            .map((c: any) => ({ ...c, frequency: freqMap[c.id] || 0 }))
            .sort((a: any, b: any) => b.frequency - a.frequency);
        }
      }
    }
  }

  return (
    <main className={styles.main}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/" className={styles.back}>← Home</Link>

      <h1 className={styles.heading}>{entity.name}</h1>
      <span className={styles.typeBadge}>{entity.type}</span>

      {snapshot && (
        <section className={styles.snapshotSection}>
          <div className={styles.snapshotGrid}>
            <div className={styles.snapshotCard}>
              <span className={styles.snapshotValue}>{snapshot.totalModels}</span>
              <span className={styles.snapshotLabel}>Models</span>
            </div>
            <div className={styles.snapshotCard}>
              <span className={styles.snapshotValue}>{snapshot.firstModelYear || "—"}</span>
              <span className={styles.snapshotLabel}>First Model Year</span>
            </div>
            <div className={styles.snapshotCard}>
              <span className={styles.snapshotValue}>{snapshot.latestModelName || "—"}</span>
              <span className={styles.snapshotLabel}>Latest Model</span>
            </div>
            <div className={styles.snapshotCard}>
              <span className={styles.snapshotValue}>{snapshot.totalTimelineEvents}</span>
              <span className={styles.snapshotLabel}>Timeline Events</span>
            </div>
            {snapshot.mostRecentActivity && (
              <div className={styles.snapshotCard}>
                <span className={styles.snapshotValue}>{snapshot.mostRecentActivity}</span>
                <span className={styles.snapshotLabel}>Most Recent Activity</span>
              </div>
            )}
          </div>
        </section>
      )}

      {crossCompanyExposure.length > 0 && (
        <section className={styles.exposureSection}>
          <h2 className={styles.sectionHeading}>Frequently Appears With</h2>
          <div className={styles.exposureList}>
            {crossCompanyExposure.map((co: any) => (
              <Link
                key={co.id}
                href={`/entities/${co.slug}`}
                className={styles.exposureItem}
              >
                <span className={styles.exposureName}>{co.name}</span>
                <span className={styles.exposureBadge}>{co.frequency}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {modelGrowth.length > 0 && (() => {
        const maxCount = Math.max(...modelGrowth.map(g => g.count));
        return (
          <section className={styles.growthSection}>
            <h2 className={styles.sectionHeading}>Model Growth</h2>
            <div className={styles.growthChart}>
              {modelGrowth.map((g) => (
                <div key={g.year} className={styles.growthRow}>
                  <span className={styles.growthYear}>{g.year}</span>
                  <div className={styles.growthBarTrack}>
                    <div
                      className={styles.growthBar}
                      style={{ width: `${(g.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className={styles.growthCount}>{g.count}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Related Articles</h2>
        {articles.length === 0 ? (
          <p className={styles.empty}>No related articles found.</p>
        ) : (
          <ul className={styles.articleList}>
            {articles.map((article: any) => (
              <li key={article.id} className={styles.articleItem}>
                <Link href={`/articles/${article.slug}`} className={styles.articleLink}>
                  {article.title}
                </Link>
                <span className={styles.articleDate}>
                  {article.publish_at
                    ? new Date(article.publish_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {entity.type === "company" && evolution.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Evolution</h2>
          <div className={styles.evolutionList}>
            {(() => {
              let lastYear: string | null = null;
              const latestIdx = evolution.length - 1;
              return evolution.map((model: any, idx: number) => {
                const year = model.first_event
                  ? new Date(model.first_event).getFullYear().toString()
                  : null;
                const showYear = year && year !== lastYear;
                if (year) lastYear = year;
                const isLatest = idx === latestIdx;

                return (
                  <div key={model.id}>
                    {showYear && (
                      <div className={styles.evolutionYearLabel}>{year}</div>
                    )}
                    <div
                      className={`${styles.evolutionItem} ${isLatest ? styles.evolutionItemLatest : ""}`}
                      style={{ animationDelay: `${idx * 80}ms` }}
                    >
                      <span className={`${styles.evolutionDot} ${isLatest ? styles.evolutionDotLatest : ""}`} />
                      <div className={styles.evolutionContent}>
                        <div className={styles.evolutionNameRow}>
                          <Link href={`/entities/${model.slug}`} className={styles.evolutionName}>
                            {model.name}
                          </Link>
                          {isLatest && (
                            <span className={styles.evolutionBadge}>Latest</span>
                          )}
                        </div>
                        <span className={styles.evolutionDate}>
                          {model.first_event
                            ? new Date(model.first_event).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>
      )}

      {isModel && (parentCompany || siblings.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Ecosystem</h2>
          {parentCompany && (
            <p className={styles.ecosystemParent}>
              Developed by{" "}
              <Link href={`/entities/${parentCompany.slug}`} className={styles.ecosystemLink}>
                {parentCompany.name}
              </Link>
            </p>
          )}
          {siblings.length > 0 && (
            <div className={styles.ecosystemSiblings}>
              <p className={styles.ecosystemLabel}>
                Other models from {parentCompany?.name || "this company"}
              </p>
              <ul className={styles.ecosystemList}>
                {siblings.map((s: any) => (
                  <li key={s.id} className={styles.ecosystemItem}>
                    <Link href={`/entities/${s.slug}`} className={styles.ecosystemLink}>
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Timeline</h2>
        {timeline.length === 0 ? (
          <p className={styles.empty}>No timeline events found.</p>
        ) : (
          (() => {
            const EVENT_TYPE_ORDER = [
              "release", "upgrade", "security", "regulation", "funding",
              "partnership", "leadership", "research", "infrastructure", "other",
            ];
            const EVENT_TYPE_LABELS: Record<string, string> = {
              release: "Releases",
              upgrade: "Upgrades",
              security: "Security",
              regulation: "Regulation",
              funding: "Funding",
              partnership: "Partnerships",
              leadership: "Leadership",
              research: "Research",
              infrastructure: "Infrastructure",
              other: "Other",
            };
            const grouped: Record<string, any[]> = {};
            for (const event of timeline) {
              const type = event.event_type || "other";
              if (!grouped[type]) grouped[type] = [];
              grouped[type].push(event);
            }
            for (const type of Object.keys(grouped)) {
              grouped[type].sort((a: any, b: any) => {
                const da = a.event_date ? new Date(a.event_date).getTime() : 0;
                const db = b.event_date ? new Date(b.event_date).getTime() : 0;
                return db - da;
              });
            }
            return EVENT_TYPE_ORDER
              .filter((type) => grouped[type] && grouped[type].length > 0)
              .map((type) => (
                <div key={type} className={styles.timelineGroup}>
                  <h3 className={styles.timelineGroupHeading}>
                    {EVENT_TYPE_LABELS[type] || type}
                  </h3>
                  <ul className={styles.timelineList}>
                    {grouped[type].map((event: any) => (
                      <li key={event.id} className={styles.timelineItem}>
                        <span className={styles.timelineDate}>
                          {event.event_date
                            ? new Date(event.event_date).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </span>
                        <div className={styles.timelineContent}>
                          <strong className={styles.timelineTitle}>{event.title}</strong>
                          {event.description && (
                            <p className={styles.timelineDescription}>{event.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ));
          })()
        )}
      </section>
    </main>
  );
}
