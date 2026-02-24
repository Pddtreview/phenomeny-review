"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

const STATUSES = ["auto_extracted", "human_reviewed", "verified", "disputed"] as const;

interface Claim {
  id: string;
  claim_type: string;
  subject_id: string | null;
  object_id: string | null;
  predicate: string | null;
  structured_payload: Record<string, string> | null;
  source_url: string | null;
  confidence: number | null;
  revision: number;
  is_current: boolean;
  verification_status: string;
  created_at: string;
  updated_at: string | null;
  subject: { name: string; slug: string; type: string } | null;
  object: { name: string; slug: string; type: string } | null;
}

export default function AdminClaimsPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/claims");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setClaims(json.data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  async function handleStatusChange(claimId: string, newStatus: string) {
    setUpdatingId(claimId);
    try {
      const res = await fetch("/api/admin/claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: claimId, verification_status: newStatus }),
      });
      if (res.ok) {
        setClaims((prev) =>
          prev.map((c) =>
            c.id === claimId
              ? { ...c, verification_status: newStatus, updated_at: new Date().toISOString() }
              : c
          )
        );
      }
    } catch {
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Claims Management</h1>
        <Link href="/admin" className={styles.backLink}>
          ← Back to Admin
        </Link>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading claims…</div>
      ) : claims.length === 0 ? (
        <div className={styles.empty}>No claims found.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Subject</th>
                <th>Predicate</th>
                <th>Object</th>
                <th>Rev</th>
                <th>Current</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td>
                    <span
                      className={`${styles.typeBadge} ${
                        claim.claim_type === "relationship"
                          ? styles.typeRelationship
                          : styles.typeTimeline
                      }`}
                    >
                      {claim.claim_type}
                    </span>
                  </td>
                  <td>
                    {claim.subject ? (
                      <>
                        <span className={styles.entityName}>{claim.subject.name}</span>
                        <span className={styles.entityType}>{claim.subject.type}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {claim.predicate ? (
                      <span className={styles.predicate}>{claim.predicate}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {claim.object ? (
                      <>
                        <span className={styles.entityName}>{claim.object.name}</span>
                        <span className={styles.entityType}>{claim.object.type}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={styles.revision}>{claim.revision}</td>
                  <td>
                    <span
                      className={`${styles.currentBadge} ${
                        claim.is_current ? styles.currentTrue : styles.currentFalse
                      }`}
                    />
                    {claim.is_current ? "Yes" : "No"}
                  </td>
                  <td>
                    <select
                      className={styles.statusSelect}
                      value={claim.verification_status}
                      onChange={(e) => handleStatusChange(claim.id, e.target.value)}
                      disabled={updatingId === claim.id}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={styles.date}>
                    {new Date(claim.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
