"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Invalid password.");
        setSubmitting(false);
        return;
      }

      router.push("/admin");
    } catch {
      setError("Login failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.main}>
      <h1 className={styles.heading}>Admin Login</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div>
          <label className={styles.label} htmlFor="password">Password</label>
          <input
            id="password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
