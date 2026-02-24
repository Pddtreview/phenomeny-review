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
  const decoded = decodeURIComponent(name);

  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .eq("slug", decoded)
    .single();

  if (error || !data) return null;
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

async function getTimelineEntries(entityName: string) {
  const { data, error } = await supabase
    .from("timelines")
    .select("*")
    .eq("entity", entityName)
    .order("event_date", { ascending: false });

  if (error || !data) return [];
  return data;
}

export default async function EntityPage({ params }: EntityPageProps) {
  const entity = await getEntity(params.name);

  if (!entity) {
    notFound();
  }

  const [articles, timeline] = await Promise.all([
    getRelatedArticles(entity.id),
    getTimelineEntries(entity.name),
  ]);

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>← Home</Link>

      <h1 className={styles.heading}>{entity.name}</h1>
      <span className={styles.typeBadge}>{entity.type}</span>

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

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Timeline</h2>
        {timeline.length === 0 ? (
          <p className={styles.empty}>No timeline events found.</p>
        ) : (
          <ul className={styles.timelineList}>
            {timeline.map((event: any) => (
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
        )}
      </section>
    </main>
  );
}
