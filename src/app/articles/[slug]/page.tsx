import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface ArticlePageProps {
  params: { slug: string };
}

async function getArticle(slug: string) {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const article = await getArticle(params.slug);

  if (!article) {
    return { title: "Article Not Found" };
  }

  const description = article.content.length > 160
    ? article.content.slice(0, 160) + "…"
    : article.content;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000");

  return {
    metadataBase: new URL(baseUrl),
    title: `${article.title} | Phenomeny Review™`,
    description,
    alternates: {
      canonical: `/articles/${params.slug}`,
    },
    openGraph: {
      title: article.title,
      description,
      type: "article",
      siteName: "Phenomeny Review™",
      url: `/articles/${params.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const article = await getArticle(params.slug);

  if (!article) {
    notFound();
  }

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>← Back to articles</Link>
      {article.category && (
        <span className={styles.category}>{article.category}</span>
      )}
      <h1 className={styles.title}>{article.title}</h1>
      <time className={styles.date}>
        {new Date(article.publish_at || article.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </time>
      <div className={styles.content}>{article.content}</div>
    </main>
  );
}
