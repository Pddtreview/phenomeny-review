import { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "AI Models — Release History & Timeline | Phenomeny Review",
  description:
    "Browse AI models, explore release timelines, parent companies, and ecosystem evolution.",
};

interface ModelCard {
  id: string;
  name: string;
  slug: string;
  parentName: string | null;
  parentSlug: string | null;
  firstRelease: string | null;
  latestActivity: string | null;
}

async function getModels(): Promise<ModelCard[]> {
  const { data: models, error } = await supabase
    .from("entities")
    .select("id, name, slug, parent_id")
    .eq("type", "model");

  if (error || !models) return [];

  const modelIds = models.map((m: { id: string }) => m.id);
  const parentIds = [
    ...new Set(
      models
        .map((m: { parent_id: string | null }) => m.parent_id)
        .filter(Boolean) as string[]
    ),
  ];

  const [parentsResult, timelinesResult] = await Promise.all([
    parentIds.length > 0
      ? supabase
          .from("entities")
          .select("id, name, slug")
          .in("id", parentIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("timelines")
      .select("entity, event_date")
      .in("entity", modelIds)
      .order("event_date", { ascending: true }),
  ]);

  const parents = parentsResult.data || [];
  const timelines = timelinesResult.data || [];

  const parentMap = new Map<string, { name: string; slug: string }>();
  for (const p of parents) {
    parentMap.set(p.id, { name: p.name, slug: p.slug });
  }

  const timelinesByModel = new Map<string, string[]>();
  for (const t of timelines) {
    if (!t.event_date) continue;
    const arr = timelinesByModel.get(t.entity) || [];
    arr.push(t.event_date);
    timelinesByModel.set(t.entity, arr);
  }

  const cards: ModelCard[] = models.map(
    (m: { id: string; name: string; slug: string; parent_id: string | null }) => {
      const parent = m.parent_id ? parentMap.get(m.parent_id) : null;
      const dates = timelinesByModel.get(m.id) || [];

      return {
        id: m.id,
        name: m.name,
        slug: m.slug,
        parentName: parent?.name ?? null,
        parentSlug: parent?.slug ?? null,
        firstRelease: dates.length > 0 ? dates[0] : null,
        latestActivity: dates.length > 0 ? dates[dates.length - 1] : null,
      };
    }
  );

  cards.sort((a, b) => {
    if (!a.latestActivity && !b.latestActivity) return 0;
    if (!a.latestActivity) return 1;
    if (!b.latestActivity) return -1;
    return b.latestActivity.localeCompare(a.latestActivity);
  });

  return cards;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ModelsPage() {
  const models = await getModels();

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:5000");

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": baseUrl },
      { "@type": "ListItem", "position": 2, "name": "Models", "item": `${baseUrl}/models` },
    ],
  };

  return (
    <div className={styles.main}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <Link href="/" className={styles.back}>
        ← Home
      </Link>
      <h1 className={styles.heading}>AI Models</h1>
      <p className={styles.subheading}>
        {models.length} {models.length === 1 ? "model" : "models"} tracked
      </p>

      {models.length === 0 ? (
        <p className={styles.empty}>No models found yet.</p>
      ) : (
        <div className={styles.grid}>
          {models.map((m) => (
            <div
              key={m.id}
              className={styles.card}
              data-testid={`card-model-${m.id}`}
            >
              <Link
                href={`/entities/${m.slug}`}
                className={styles.cardName}
              >
                {m.name}
              </Link>
              {m.parentName && m.parentSlug && (
                <Link
                  href={`/entities/${m.parentSlug}`}
                  className={styles.parentLink}
                >
                  {m.parentName}
                </Link>
              )}
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {m.firstRelease
                      ? new Date(m.firstRelease).getFullYear()
                      : "—"}
                  </span>
                  <span className={styles.statLabel}>First Release</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {m.latestActivity ? formatDate(m.latestActivity) : "—"}
                  </span>
                  <span className={styles.statLabel}>Latest Activity</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
