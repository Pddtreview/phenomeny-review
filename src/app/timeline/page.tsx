import { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "AI Industry Timeline — Model Releases & Events | Phenomeny Review",
  description:
    "Explore yearly AI model releases, funding events, security incidents, and regulatory milestones.",
};

interface YearSummary {
  year: number;
  count: number;
}

async function getYears(): Promise<YearSummary[]> {
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
    .sort((a, b) => b.year - a.year);
}

export default async function TimelineIndexPage() {
  const years = await getYears();

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>← Home</Link>

      <h1 className={styles.heading}>AI Industry Timeline</h1>
      <p className={styles.subheading}>
        {years.length} {years.length === 1 ? "year" : "years"} of tracked activity
      </p>

      {years.length === 0 ? (
        <p className={styles.empty}>No timeline events found yet.</p>
      ) : (
        <div className={styles.grid}>
          {years.map((y) => (
            <Link
              key={y.year}
              href={`/timeline/${y.year}`}
              className={styles.card}
              data-testid={`card-year-${y.year}`}
            >
              <span className={styles.year}>{y.year}</span>
              <span className={styles.badge}>
                {y.count} {y.count === 1 ? "event" : "events"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
