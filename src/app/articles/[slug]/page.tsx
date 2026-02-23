import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface ArticlePageProps {
  params: { slug: string };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (error || !data) {
    notFound();
  }

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>← Back to articles</Link>
      <h1 className={styles.title}>{data.title}</h1>
      <div className={styles.content}>{data.content}</div>
    </main>
  );
}
