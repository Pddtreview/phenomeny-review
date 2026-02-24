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

export default async function HomePage() {
  const [{ data, error }, timelineYears] = await Promise.all([
    fetchArticles(),
    fetchTimelineYears(),
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
