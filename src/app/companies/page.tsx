import { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "AI Companies — Models, Timeline & Ecosystem | Phenomeny Review",
  description:
    "Browse AI companies, explore their models, release timelines, and ecosystem connections.",
};

interface CompanyCard {
  id: string;
  name: string;
  slug: string;
  modelCount: number;
  firstModelYear: number | null;
  latestActivity: string | null;
}

async function getCompanies(): Promise<CompanyCard[]> {
  const { data: companies, error } = await supabase
    .from("entities")
    .select("id, name, slug")
    .eq("type", "company")
    .order("name");

  if (error || !companies) return [];

  const companyIds = companies.map((c: { id: string }) => c.id);

  const [modelsResult, timelinesResult] = await Promise.all([
    supabase
      .from("entities")
      .select("id, parent_id, created_at")
      .eq("type", "model")
      .in("parent_id", companyIds),
    supabase
      .from("timelines")
      .select("entity, event_date")
      .in("entity", companyIds)
      .order("event_date", { ascending: true }),
  ]);

  const models = modelsResult.data || [];
  const timelines = timelinesResult.data || [];

  const modelsByCompany = new Map<string, typeof models>();
  for (const m of models) {
    const arr = modelsByCompany.get(m.parent_id) || [];
    arr.push(m);
    modelsByCompany.set(m.parent_id, arr);
  }

  const timelinesByCompany = new Map<string, typeof timelines>();
  for (const t of timelines) {
    const arr = timelinesByCompany.get(t.entity) || [];
    arr.push(t);
    timelinesByCompany.set(t.entity, arr);
  }

  return companies.map((c: { id: string; name: string; slug: string }) => {
    const companyModels = modelsByCompany.get(c.id) || [];
    const companyTimelines = timelinesByCompany.get(c.id) || [];

    let firstModelYear: number | null = null;
    const dates = companyTimelines
      .map((t) => t.event_date)
      .filter(Boolean)
      .sort();
    if (dates.length > 0) {
      firstModelYear = new Date(dates[0]).getFullYear();
    }

    let latestActivity: string | null = null;
    if (dates.length > 0) {
      latestActivity = dates[dates.length - 1];
    }

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      modelCount: companyModels.length,
      firstModelYear,
      latestActivity,
    };
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function CompaniesPage() {
  const companies = await getCompanies();

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
      { "@type": "ListItem", "position": 2, "name": "Companies", "item": `${baseUrl}/companies` },
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
      <h1 className={styles.heading}>AI Companies</h1>
      <p className={styles.subheading}>
        {companies.length} {companies.length === 1 ? "company" : "companies"} tracked
      </p>

      {companies.length === 0 ? (
        <p className={styles.empty}>No companies found yet.</p>
      ) : (
        <div className={styles.grid}>
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/entities/${c.slug}`}
              className={styles.card}
              data-testid={`card-company-${c.id}`}
            >
              <h2 className={styles.cardName}>{c.name}</h2>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{c.modelCount || "—"}</span>
                  <span className={styles.statLabel}>
                    {c.modelCount > 0
                      ? c.modelCount === 1 ? "Model" : "Models"
                      : "Tracked entity"}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {c.firstModelYear ?? "—"}
                  </span>
                  <span className={styles.statLabel}>{c.firstModelYear ? "First Year" : "Tracked entity"}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {c.latestActivity ? formatDate(c.latestActivity) : "—"}
                  </span>
                  <span className={styles.statLabel}>{c.latestActivity ? "Latest Activity" : "Tracked entity"}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
