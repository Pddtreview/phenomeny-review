import Link from "next/link";
import SubscribeForm from "@/components/subscribe-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface Article {
  id: string;
  title: string;
  content: string;
  slug: string;
  created_at: string;
}

async function fetchArticles(): Promise<{ data: Article[] | null; error: string | null }> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000");

  try {
    const res = await fetch(`${baseUrl}/api/articles`, { cache: "no-store" });
    const json = await res.json();

    if (!json.success) {
      return { data: null, error: json.error || "Failed to fetch articles." };
    }

    return { data: json.data, error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || "Failed to fetch articles." };
  }
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
              <Link href={`/articles/${article.slug}`} className={styles.link}>
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
