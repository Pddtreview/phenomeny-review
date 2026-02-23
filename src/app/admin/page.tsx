"use client";

import { useState, FormEvent } from "react";
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
        body: JSON.stringify({ title, content, status }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }

      router.push("/");
    } catch {
      setError("Failed to submit article.");
      setSubmitting(false);
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
          </select>
        </div>

        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.button} type="submit" disabled={isBusy}>
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>
    </main>
  );
}
