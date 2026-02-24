import Image from "next/image";
import { supabase } from "@/lib/supabase";
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
  try {
    const nowISO = new Date().toISOString();

    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .or("status.eq.published,status.eq.scheduled")
      .lte("publish_at", nowISO)
      .order("publish_at", { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    const dueScheduled = (data || []).filter((a: any) => a.status === "scheduled");
    if (dueScheduled.length > 0) {
      const ids = dueScheduled.map((a: any) => a.id);
      await supabase
        .from("articles")
        .update({ status: "published" })
        .in("id", ids);
    }

    return { data: data as Article[], error: null };
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
          src="/images/logo-full.png"
          alt="Phenomeny Review™ — Tech Review & Intelligence"
          width={320}
          height={60}
          className={styles.logoFull}
          priority
        />
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
