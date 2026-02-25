import Link from "next/link";
import { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import styles from "./archive.module.css";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "AI Evolution Archive — Phenomeny Review",
  description:
    "The complete structured record of artificial intelligence development. Every company, model, breakthrough and regulatory event from 1950 to today.",
  alternates: {
    canonical: "/archive",
  },
  openGraph: {
    title: "AI Evolution Archive — Phenomeny Review",
    description:
      "The complete structured record of artificial intelligence development.",
    type: "website",
  },
};

interface YearGroup {
  year: number;
  count: number;
}

interface TypeCount {
  type: string;
  count: number;
}

async function fetchArchiveData() {
  const [entitiesRes, timelinesRes, entityTypesRes] = await Promise.all([
    supabase.from("entities").select("id", { count: "exact", head: true }),
    supabase.from("timelines").select("id, event_date", { count: "exact" }),
    supabase.from("entities").select("type"),
  ]);

  const totalEntities = entitiesRes.count ?? 0;
  const totalTimelines = timelinesRes.count ?? 0;

  const yearCounts = new Map<number, number>();
  for (const row of timelinesRes.data || []) {
    if (row.event_date) {
      const y = new Date(row.event_date).getFullYear();
      if (y >= 1900 && y <= 2100) {
        yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
      }
    }
  }
  const yearGroups: YearGroup[] = Array.from(yearCounts.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year);

  const typeCounts = new Map<string, number>();
  for (const row of entityTypesRes.data || []) {
    if (row.type) {
      typeCounts.set(row.type, (typeCounts.get(row.type) || 0) + 1);
    }
  }
  const entityTypes: TypeCount[] = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const totalTypes = entityTypes.length;

  return { totalEntities, totalTimelines, totalTypes, yearGroups, entityTypes };
}

export default async function ArchivePage() {
  const { totalEntities, totalTimelines, totalTypes, yearGroups, entityTypes } =
    await fetchArchiveData();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle} data-testid="text-archive-title">
          THE COMPLETE RECORD
        </h1>
        <p className={styles.heroSubtitle}>
          Structured archive of AI development — entities, timelines, and relationships.
        </p>
      </section>

      <div className={styles.statsRow}>
        <div className={styles.statBlock}>
          <span className={styles.statValue} data-testid="text-stat-entities">
            {totalEntities}
          </span>
          <span className={styles.statLabel}>Entities</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statValue} data-testid="text-stat-timelines">
            {totalTimelines}
          </span>
          <span className={styles.statLabel}>Timeline Events</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statValue} data-testid="text-stat-years">
            {yearGroups.length}
          </span>
          <span className={styles.statLabel}>Years Tracked</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statValue} data-testid="text-stat-types">
            {totalTypes}
          </span>
          <span className={styles.statLabel}>Entity Types</span>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Timeline by Year</h2>
        {yearGroups.length === 0 ? (
          <p className={styles.empty}>No timeline data yet.</p>
        ) : (
          <div className={styles.yearGrid}>
            {yearGroups.map((y) => (
              <Link
                key={y.year}
                href={`/timeline/${y.year}`}
                className={styles.yearCard}
                data-testid={`card-archive-year-${y.year}`}
              >
                <span className={styles.yearLabel}>{y.year}</span>
                <span className={styles.yearCount}>
                  {y.count} {y.count === 1 ? "event" : "events"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Entities by Type</h2>
        {entityTypes.length === 0 ? (
          <p className={styles.empty}>No entities tracked yet.</p>
        ) : (
          <div className={styles.typeGrid}>
            {entityTypes.map((t) => (
              <div
                key={t.type}
                className={styles.typeCard}
                data-testid={`card-entity-type-${t.type}`}
              >
                <span className={styles.typeName}>{t.type}</span>
                <span className={styles.typeCount}>{t.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
