import Link from "next/link";
import { supabase } from "@/lib/supabase";
import SubscribeForm from "@/components/subscribe-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface Article {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

async function fetchArticles(): Promise<{ data: Article[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export default async function HomePage() {
  const { data, error } = await fetchArticles();

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Phenomeny Review™</h1>
      <p className={styles.description}>AI-powered editorial platform</p>

      {error ? (
        <p className={styles.error}>{error}</p>
      ) : !data || data.length === 0 ? (
        <p className={styles.empty}>No articles yet</p>
      ) : (
        <ul className={styles.list}>
          {data.map((article) => (
            <li key={article.id} className={styles.item}>
              <Link href={`/articles/${article.id}`} className={styles.link}>
                <h2 className={styles.itemTitle}>{article.title}</h2>
                <p className={styles.snippet}>
                  {article.content.length > 150
                    ? article.content.slice(0, 150) + "…"
                    : article.content}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <SubscribeForm />
    </main>
  );
}
