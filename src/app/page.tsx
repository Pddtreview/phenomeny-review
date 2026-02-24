import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ArticleFeed from "@/components/article-feed";
import SubscribeForm from "@/components/subscribe-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface Article {
  id: string;
  title: string;
  content: string;
  slug: string;
  category: string | null;
  created_at: string;
  publish_at: string | null;
}

interface YearSummary {
  year: number;
  count: number;
}

async function fetchTimelineYears(): Promise<YearSummary[]> {
  const { data, error } = await supabase
    .from("timelines")
    .select("event_date")
    .not("event_date", "is", null);

  if (error || !data) return [];

  const yearCounts = new Map<number, number>();
  for (const row of data) {
    const y = new Date(row.event_date).getFullYear();
    if (y >= 1900 && y <= 2100) {
      yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
    }
  }

  return Array.from(yearCounts.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year)
    .slice(0, 3);
}

interface CompanyPreview {
  id: string;
  name: string;
  slug: string;
  modelCount: number;
  latestActivity: string | null;
}

interface ModelPreview {
  id: string;
  name: string;
  slug: string;
  parentName: string | null;
  parentSlug: string | null;
  latestActivity: string | null;
}

async function fetchTopCompanies(): Promise<CompanyPreview[]> {
  const { data: companies } = await supabase
    .from("entities")
    .select("id, name, slug")
    .eq("type", "company");

  if (!companies || companies.length === 0) return [];

  const companyIds = companies.map((c: any) => c.id);

  const [modelsRes, timelinesRes] = await Promise.all([
    supabase.from("entities").select("parent_id").eq("type", "model").in("parent_id", companyIds),
    supabase.from("timelines").select("entity, event_date").in("entity", companyIds).order("event_date", { ascending: false }),
  ]);

  const modelCounts = new Map<string, number>();
  for (const m of modelsRes.data || []) {
    modelCounts.set(m.parent_id, (modelCounts.get(m.parent_id) || 0) + 1);
  }

  const latestByCompany = new Map<string, string>();
  for (const t of timelinesRes.data || []) {
    if (t.event_date && !latestByCompany.has(t.entity)) {
      latestByCompany.set(t.entity, t.event_date);
    }
  }

  return companies
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      modelCount: modelCounts.get(c.id) || 0,
      latestActivity: latestByCompany.get(c.id) || null,
    }))
    .sort((a: CompanyPreview, b: CompanyPreview) => {
      if (!a.latestActivity && !b.latestActivity) return 0;
      if (!a.latestActivity) return 1;
      if (!b.latestActivity) return -1;
      return b.latestActivity.localeCompare(a.latestActivity);
    })
    .slice(0, 3);
}

async function fetchTopModels(): Promise<ModelPreview[]> {
  const { data: models } = await supabase
    .from("entities")
    .select("id, name, slug, parent_id")
    .eq("type", "model");

  if (!models || models.length === 0) return [];

  const modelIds = models.map((m: any) => m.id);
  const parentIds = [...new Set(models.map((m: any) => m.parent_id).filter(Boolean))] as string[];

  const [parentsRes, timelinesRes] = await Promise.all([
    parentIds.length > 0
      ? supabase.from("entities").select("id, name, slug").in("id", parentIds)
      : Promise.resolve({ data: [] }),
    supabase.from("timelines").select("entity, event_date").in("entity", modelIds).order("event_date", { ascending: false }),
  ]);

  const parentMap = new Map<string, { name: string; slug: string }>();
  for (const p of parentsRes.data || []) {
    parentMap.set(p.id, { name: p.name, slug: p.slug });
  }

  const latestByModel = new Map<string, string>();
  for (const t of timelinesRes.data || []) {
    if (t.event_date && !latestByModel.has(t.entity)) {
      latestByModel.set(t.entity, t.event_date);
    }
  }

  return models
    .map((m: any) => {
      const parent = m.parent_id ? parentMap.get(m.parent_id) : null;
      return {
        id: m.id,
        name: m.name,
        slug: m.slug,
        parentName: parent?.name ?? null,
        parentSlug: parent?.slug ?? null,
        latestActivity: latestByModel.get(m.id) || null,
      };
    })
    .sort((a: ModelPreview, b: ModelPreview) => {
      if (!a.latestActivity && !b.latestActivity) return 0;
      if (!a.latestActivity) return 1;
      if (!b.latestActivity) return -1;
      return b.latestActivity.localeCompare(a.latestActivity);
    })
    .slice(0, 3);
}

async function fetchArticles(): Promise<{ data: Article[] | null; error: string | null }> {
  try {
    const nowISO = new Date().toISOString();

    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .or("status.eq.published,status.eq.scheduled")
      .lte("publish_at", nowISO)
      .order("publish_at", { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    const dueScheduled = (data || []).filter((a: any) => a.status === "scheduled");
    if (dueScheduled.length > 0) {
      const ids = dueScheduled.map((a: any) => a.id);
      await supabase
        .from("articles")
        .update({ status: "published" })
        .in("id", ids);
    }

    return { data: data as Article[], error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || "Failed to fetch articles." };
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function HomePage() {
  const [{ data, error }, timelineYears, topCompanies, topModels] = await Promise.all([
    fetchArticles(),
    fetchTimelineYears(),
    fetchTopCompanies(),
    fetchTopModels(),
  ]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Image
          src="/images/logo-full.png"
          alt="Phenomeny Review™ — Tech Review & Intelligence"
          width={320}
          height={60}
          className={styles.logoFull}
          priority
        />
      </header>

      <section className={styles.hero}>
        <h2 className={styles.heroTitle}>
          The editorial lens on AI, quantum, space & geopolitics.
        </h2>
        <p className={styles.heroDescription}>
          Deep analysis meets AI-augmented insight. Published for decision-makers who read before they act.
        </p>
      </section>

      {timelineYears.length > 0 && (
        <section className={styles.timelineSection}>
          <h2 className={styles.timelineHeading}>Explore AI by Year</h2>
          <div className={styles.timelineGrid}>
            {timelineYears.map((y) => (
              <Link
                key={y.year}
                href={`/timeline/${y.year}`}
                className={styles.timelineCard}
                data-testid={`card-timeline-${y.year}`}
              >
                <span className={styles.timelineYear}>{y.year}</span>
                <span className={styles.timelineBadge}>
                  {y.count} {y.count === 1 ? "event" : "events"}
                </span>
              </Link>
            ))}
          </div>
          <Link href="/timeline" className={styles.timelineViewAll}>
            View Full Timeline →
          </Link>
        </section>
      )}

      {topCompanies.length > 0 && (
        <section className={styles.exploreSection}>
          <h2 className={styles.exploreHeading}>Explore Companies</h2>
          <div className={styles.exploreList}>
            {topCompanies.map((c) => (
              <Link
                key={c.id}
                href={`/entities/${c.slug}`}
                className={styles.exploreCard}
                data-testid={`card-top-company-${c.id}`}
              >
                <div className={styles.exploreCardLeft}>
                  <span className={styles.exploreCardName}>{c.name}</span>
                  {c.latestActivity && (
                    <span className={styles.exploreCardMeta}>{formatDate(c.latestActivity)}</span>
                  )}
                </div>
                <span className={styles.exploreBadge}>
                  {c.modelCount} {c.modelCount === 1 ? "model" : "models"}
                </span>
              </Link>
            ))}
          </div>
          <Link href="/companies" className={styles.exploreViewAll}>
            View All Companies →
          </Link>
        </section>
      )}

      {topModels.length > 0 && (
        <section className={styles.exploreSection}>
          <h2 className={styles.exploreHeading}>Explore Models</h2>
          <div className={styles.exploreList}>
            {topModels.map((m) => (
              <div key={m.id} className={styles.exploreCard} data-testid={`card-top-model-${m.id}`}>
                <div className={styles.exploreCardLeft}>
                  <Link href={`/entities/${m.slug}`} className={styles.exploreCardName}>
                    {m.name}
                  </Link>
                  <div className={styles.exploreCardMetaRow}>
                    {m.parentName && m.parentSlug && (
                      <Link href={`/entities/${m.parentSlug}`} className={styles.exploreParentLink}>
                        {m.parentName}
                      </Link>
                    )}
                    {m.latestActivity && (
                      <span className={styles.exploreCardMeta}>{formatDate(m.latestActivity)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link href="/models" className={styles.exploreViewAll}>
            View All Models →
          </Link>
        </section>
      )}

      {error ? (
        <p className={styles.error}>{error}</p>
      ) : !data || data.length === 0 ? (
        <p className={styles.empty}>No articles published yet. Check back soon.</p>
      ) : (
        <ArticleFeed articles={data} />
      )}

      <SubscribeForm />

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Phenomeny Review™</span>
        <span className={styles.footerDot}>·</span>
        <span>All rights reserved</span>
      </footer>
    </main>
  );
}
