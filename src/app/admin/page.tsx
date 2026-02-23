"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const AI_ACTIONS = [
  { key: "clarity", label: "Clarity" },
  { key: "aggressive", label: "Aggressive" },
  { key: "analytical", label: "Analytical" },
  { key: "summary", label: "Summary" },
  { key: "twitter", label: "Twitter" },
  { key: "linkedin", label: "LinkedIn" },
] as const;

interface Article {
  id: string;
  title: string;
  content: string;
  slug: string;
  status: string;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState("draft");
  const [publishAt, setPublishAt] = useState("");

  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [busyArticleId, setBusyArticleId] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    try {
      const res = await fetch("/api/articles");
      const json = await res.json();
      if (json.success && json.data) {
        setArticles(json.data);
      }
    } catch {
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setError("");
    setGenerating(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      const json = await res.json();

      if (json.error) {
        setError(json.error);
        setGenerating(false);
        return;
      }

      setTitle(json.title);
      setContent(json.content);
      setGenerating(false);
    } catch {
      setError("Failed to generate article.");
      setGenerating(false);
    }
  }

  async function handleAiEdit(action: string) {
    if (!content.trim()) return;
    setError("");
    setEditing(action);

    try {
      const res = await fetch("/api/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, action }),
      });

      const json = await res.json();

      if (json.error) {
        setError(json.error);
        setEditing(null);
        return;
      }

      setContent(json.result);
      setEditing(null);
    } catch {
      setError("AI edit failed.");
      setEditing(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          status,
          ...(status === "scheduled" && publishAt
            ? { publish_at: new Date(publishAt).toISOString() }
            : {}),
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }

      setTitle("");
      setContent("");
      setStatus("draft");
      setPublishAt("");
      setTopic("");
      setSubmitting(false);
      fetchArticles();
    } catch {
      setError("Failed to submit article.");
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(article: Article) {
    const newStatus = article.status === "published" ? "draft" : "published";
    setBusyArticleId(article.id);

    try {
      const res = await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const json = await res.json();

      if (json.success) {
        setArticles((prev) =>
          prev.map((a) => (a.id === article.id ? { ...a, status: newStatus } : a))
        );
      }
    } catch {
    } finally {
      setBusyArticleId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyArticleId(id);

    try {
      const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
      const json = await res.json();

      if (json.success) {
        setArticles((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
    } finally {
      setBusyArticleId(null);
    }
  }

  const isBusy = generating || submitting || !!editing;

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>New Article</h1>

      <div className={styles.generateRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Enter a topic…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <button
          className={styles.generateButton}
          type="button"
          onClick={handleGenerate}
          disabled={isBusy || !topic.trim()}
        >
          {generating ? "Generating…" : "Generate with AI"}
        </button>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div>
          <label className={styles.label} htmlFor="title">Title</label>
          <input
            id="title"
            className={styles.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={styles.label} htmlFor="content">Content</label>
          <textarea
            id="content"
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        </div>

        <div className={styles.editSection}>
          <span className={styles.editLabel}>AI Edit:</span>
          <div className={styles.editButtons}>
            {AI_ACTIONS.map(({ key, label }) => (
              <button
                key={key}
                className={styles.editButton}
                type="button"
                onClick={() => handleAiEdit(key)}
                disabled={isBusy || !content.trim()}
              >
                {editing === key ? "…" : label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={styles.label} htmlFor="status">Status</label>
          <select
            id="status"
            className={styles.select}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>

        {status === "scheduled" && (
          <div>
            <label className={styles.label} htmlFor="publishAt">Publish At</label>
            <input
              id="publishAt"
              className={styles.input}
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              required
            />
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.button} type="submit" disabled={isBusy}>
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>

      <section className={styles.articlesSection}>
        <h2 className={styles.articlesHeading}>All Articles</h2>
        {loadingArticles ? (
          <p className={styles.articlesEmpty}>Loading…</p>
        ) : articles.length === 0 ? (
          <p className={styles.articlesEmpty}>No articles yet.</p>
        ) : (
          <ul className={styles.articlesList}>
            {articles.map((article) => (
              <li key={article.id} className={styles.articleItem}>
                <div className={styles.articleInfo}>
                  <span className={styles.articleTitle}>{article.title}</span>
                  <span
                    className={
                      article.status === "published"
                        ? styles.badgePublished
                        : styles.badgeDraft
                    }
                  >
                    {article.status}
                  </span>
                  <span className={styles.articleDate}>
                    {new Date(article.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.articleActions}>
                  <button
                    className={styles.actionButton}
                    type="button"
                    onClick={() => handleToggleStatus(article)}
                    disabled={busyArticleId === article.id}
                  >
                    {article.status === "draft" ? "Publish" : "Unpublish"}
                  </button>
                  <button
                    className={styles.deleteButton}
                    type="button"
                    onClick={() => handleDelete(article.id)}
                    disabled={busyArticleId === article.id}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
