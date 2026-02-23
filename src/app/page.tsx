import Image from "next/image";
import ArticleFeed from "@/components/article-feed";
import SubscribeForm from "@/components/subscribe-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface Article {
  id: string;
  title: string;
  content: string;
  slug: string;
  category: string | null;
  created_at: string;
  publish_at: string | null;
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
      <header className={styles.header}>
        <Image
          src="/images/logo.png"
          alt="Phenomeny Review"
          width={56}
          height={56}
          className={styles.logo}
          priority
        />
        <div>
          <h1 className={styles.title}>Phenomeny Review™</h1>
          <p className={styles.subtitle}>AI-Powered Editorial Intelligence</p>
        </div>
      </header>

      <section className={styles.hero}>
        <h2 className={styles.heroTitle}>
          The editorial lens on AI, quantum, space & geopolitics.
        </h2>
        <p className={styles.heroDescription}>
          Deep analysis meets AI-augmented insight. Published for decision-makers who read before they act.
        </p>
      </section>

      {error ? (
        <p className={styles.error}>{error}</p>
      ) : !data || data.length === 0 ? (
        <p className={styles.empty}>No articles published yet. Check back soon.</p>
      ) : (
        <ArticleFeed articles={data} />
      )}

      <SubscribeForm />

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Phenomeny Review™</span>
        <span className={styles.footerDot}>·</span>
        <span>All rights reserved</span>
      </footer>
    </main>
  );
}
