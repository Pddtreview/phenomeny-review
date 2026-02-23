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

  return {
    title: `${article.title} | Phenomeny Review™`,
    description,
    openGraph: {
      title: article.title,
      description,
      type: "article",
      siteName: "Phenomeny Review™",
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
      <h1 className={styles.title}>{article.title}</h1>
      <div className={styles.content}>{article.content}</div>
    </main>
  );
}
