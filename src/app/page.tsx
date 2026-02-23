import { createClient } from "@supabase/supabase-js";
import styles from "./page.module.css";

async function fetchArticles() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { data: null, error: "Supabase environment variables are not configured." };
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase.from("articles").select("*");

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

      <div className={styles.status}>
        {error ? (
          <p className={styles.error}>{error}</p>
        ) : data && data.length > 0 ? (
          <p className={styles.success}>Found {data.length} article{data.length !== 1 ? "s" : ""}.</p>
        ) : (
          <p className={styles.success}>Database connected successfully — no articles yet.</p>
        )}
      </div>
    </main>
  );
}
