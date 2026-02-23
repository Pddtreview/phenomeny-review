"use client";

import { useState, FormEvent } from "react";
import styles from "./subscribe-form.module.css";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const json = await res.json();

      if (!json.success) {
        setStatus("error");
        setMessage(json.error || "Something went wrong.");
        return;
      }

      setStatus("success");
      setMessage("Subscribed successfully.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Failed to subscribe.");
    }
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>The Intelligence Brief</h3>
      <p className={styles.subtext}>Weekly AI & tech digest. No noise — only signal.</p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className={styles.button} type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "…" : "Subscribe"}
        </button>
      </form>
      {message && (
        <p className={`${styles.message} ${status === "success" ? styles.success : styles.error}`}>
          {message}
        </p>
      )}
    </div>
  );
}
