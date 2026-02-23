"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import styles from "../../page.module.css";

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
  publish_at: string | null;
  created_at: string;
}

export default function EditArticlePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft");
  const [publishAt, setPublishAt] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadArticle() {
      try {
        const res = await fetch("/api/admin/articles");
        const json = await res.json();

        if (json.success && json.data) {
          const article = json.data.find((a: Article) => a.id === id);
          if (article) {
            setTitle(article.title);
            setContent(article.content);
            setStatus(article.status);
            if (article.publish_at) {
              const dt = new Date(article.publish_at);
              const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16);
              setPublishAt(local);
            }
          } else {
            setError("Article not found.");
          }
        }
      } catch {
        setError("Failed to load article.");
      } finally {
        setLoading(false);
      }
    }

    loadArticle();
  }, [id]);

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
      const res = await fetch(`/api/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          status,
          ...(status === "scheduled" && publishAt
            ? { publish_at: new Date(publishAt).toISOString() }
            : status === "published"
              ? { publish_at: new Date().toISOString() }
              : { publish_at: null }),
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }

      router.push("/admin");
    } catch {
      setError("Failed to update article.");
      setSubmitting(false);
    }
  }

  const isBusy = submitting || !!editing;

  if (loading) {
    return (
      <main className={styles.main}>
        <p className={styles.articlesEmpty}>Loading article…</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Edit Article</h1>

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
          {submitting ? "Saving…" : "Save Changes"}
        </button>
      </form>
    </main>
  );
}
