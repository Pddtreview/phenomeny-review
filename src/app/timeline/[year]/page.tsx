import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export const revalidate = 300;

interface TimelinePageProps {
  params: { year: string };
}

interface TimelineEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_type: string | null;
  source_url: string | null;
  entityId: string;
  entityName: string;
  entitySlug: string;
  entityType: string;
}

interface CompanyGroup {
  name: string;
  slug: string;
  events: TimelineEvent[];
}

function parseYear(yearStr: string): number | null {
  const num = parseInt(yearStr, 10);
  if (isNaN(num) || num < 1900 || num > 2100) return null;
  return num;
}

async function getTimelineEvents(year: number): Promise<TimelineEvent[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data: events, error } = await supabase
    .from("timelines")
    .select("id, title, description, event_date, event_type, source_url, entity")
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true });

  if (error || !events || events.length === 0) return [];

  const entityIds = [...new Set(events.map((e: { entity: string }) => e.entity))];

  const { data: entities } = await supabase
    .from("entities")
    .select("id, name, slug, type")
    .in("id", entityIds);

  const entityMap = new Map<string, { name: string; slug: string; type: string }>();
  if (entities) {
    for (const ent of entities) {
      entityMap.set(ent.id, { name: ent.name, slug: ent.slug, type: ent.type });
    }
  }

  return events.map((e: any) => {
    const ent = entityMap.get(e.entity);
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      event_date: e.event_date,
      event_type: e.event_type,
      source_url: e.source_url,
      entityId: e.entity,
      entityName: ent?.name ?? "Unknown",
      entitySlug: ent?.slug ?? "",
      entityType: ent?.type ?? "unknown",
    };
  });
}

function groupByCompany(events: TimelineEvent[]): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();

  for (const event of events) {
    const key = event.entitySlug || event.entityId;
    if (!groups.has(key)) {
      groups.set(key, {
        name: event.entityName,
        slug: event.entitySlug,
        events: [],
      });
    }
    groups.get(key)!.events.push(event);
  }

  const result = Array.from(groups.values());
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  release: "Release",
  upgrade: "Upgrade",
  security: "Security",
  regulation: "Regulation",
  funding: "Funding",
  partnership: "Partnership",
  leadership: "Leadership",
  research: "Research",
  infrastructure: "Infrastructure",
  first_appearance: "First Appearance",
  other: "Other",
};

export async function generateMetadata({ params }: TimelinePageProps): Promise<Metadata> {
  const year = parseYear(params.year);
  if (!year) return { title: "Timeline Not Found" };

  return {
    title: `AI Timeline ${year} — Model Releases & Industry Events | Phenomeny Review`,
    description: `Explore AI model releases and industry events from ${year}.`,
  };
}

export default async function TimelineYearPage({ params }: TimelinePageProps) {
  const year = parseYear(params.year);
  if (!year) notFound();

  const events = await getTimelineEvents(year);
  const companyGroups = groupByCompany(events);

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
      { "@type": "ListItem", "position": 2, "name": "Timeline", "item": `${baseUrl}/timeline` },
      { "@type": "ListItem", "position": 3, "name": String(year), "item": `${baseUrl}/timeline/${year}` },
    ],
  };

  return (
    <main className={styles.main}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <Link href="/" className={styles.back}>← Home</Link>

      <h1 className={styles.heading}>AI Timeline — {year}</h1>
      <p className={styles.subheading}>
        {events.length} {events.length === 1 ? "event" : "events"} across{" "}
        {companyGroups.length} {companyGroups.length === 1 ? "entity" : "entities"}
      </p>

      {events.length === 0 ? (
        <p className={styles.empty}>No timeline events found for {year}.</p>
      ) : (
        <div className={styles.groups}>
          {companyGroups.map((group) => (
            <section key={group.slug} className={styles.group}>
              <h2 className={styles.groupName}>
                <Link href={`/entities/${group.slug}`} className={styles.groupLink}>
                  {group.name}
                </Link>
              </h2>
              <div className={styles.eventList}>
                {group.events.map((event) => (
                  <div key={event.id} className={styles.eventCard}>
                    <div className={styles.eventHeader}>
                      <span className={styles.eventDate}>
                        {formatDate(event.event_date)}
                      </span>
                      {event.event_type && (
                        <span
                          className={styles.eventType}
                          data-type={event.event_type}
                        >
                          {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                        </span>
                      )}
                    </div>
                    <h3 className={styles.eventTitle}>{event.title}</h3>
                    {event.description && (
                      <p className={styles.eventDescription}>{event.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
