"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./article-feed.module.css";

const CATEGORIES = [
  "All",
  "AI",
  "AI Governance",
  "AI Operations",
  "Quantum",
  "Space",
  "Biotech",
  "India–China",
  "USA Europe",
  "Intelligence Brief",
];

interface Article {
  id: string;
  title: string;
  content: string;
  slug: string;
  category: string | null;
  created_at: string;
  publish_at: string | null;
}

export default function ArticleFeed({ articles }: { articles: Article[] }) {
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered =
    activeCategory === "All"
      ? articles
      : articles.filter((a) => a.category === activeCategory);

  return (
    <>
      <nav className={styles.categoryNav}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`${styles.categoryButton} ${activeCategory === cat ? styles.categoryActive : ""}`}
            type="button"
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No articles in this category yet.</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((article) => (
            <article key={article.id} className={styles.card}>
              <Link href={`/articles/${article.slug}`} className={styles.cardLink}>
                {article.category && (
                  <span className={styles.categoryPill}>{article.category}</span>
                )}
                <h2 className={styles.cardTitle}>{article.title}</h2>
                <p className={styles.cardSnippet}>
                  {article.content.length > 160
                    ? article.content.slice(0, 160) + "…"
                    : article.content}
                </p>
                <time className={styles.cardDate} suppressHydrationWarning>
                  {new Date(article.publish_at || article.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </time>
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
