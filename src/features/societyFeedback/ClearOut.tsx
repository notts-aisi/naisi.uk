"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { CLEAR_WORDS, dayKeyWordsWithYear } from "@/lib/societyFeedback/words";
import styles from "./societyFeedback.module.css";

/**
 * CLEARING OUT BY HAND, at the yearly review: choose a day, be told how many
 * entries were sent before it, and confirm that number. Nothing here runs by
 * itself. The day can be no later than the same day a year before today, here
 * and at the route, so a press only ever deletes feedback more than a year
 * old: what the privacy policy says, done once a year, keeps none for more
 * than two years. It starts on that latest day.
 */
export default function ClearOut({ latestDay, oldestLine, dueLine }: { latestDay: string; oldestLine: string; dueLine: string | null }) {
  const router = useRouter();
  const [day, setDay] = useState(latestDay);
  const [counted, setCounted] = useState<{ day: string; count: number } | null>(null);
  const [busy, setBusy] = useState<"" | "counting" | "deleting">("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function count() {
    setBusy("counting");
    setError("");
    setStatus("");
    setCounted(null);
    try {
      const response = await fetch(`/api/admin/anonymous-feedback/clear?before=${encodeURIComponent(day)}`, { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as { count?: number; error?: string };
      if (!response.ok || typeof result.count !== "number") {
        setError(result.error ?? CLEAR_WORDS.failed);
        return;
      }
      if (result.count === 0) setStatus(CLEAR_WORDS.none(dayKeyWordsWithYear(day)));
      else setCounted({ day, count: result.count });
    } catch {
      setError(CLEAR_WORDS.failed);
    } finally {
      setBusy("");
    }
  }

  async function clear(confirmed: { day: string; count: number }) {
    setBusy("deleting");
    setError("");
    try {
      const response = await fetch("/api/admin/anonymous-feedback/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ before: confirmed.day, count: confirmed.count }),
      });
      const result = (await response.json().catch(() => ({}))) as { deleted?: number; left?: number; count?: number; error?: string };
      if (response.status === 409 && typeof result.count === "number") {
        // The number changed since it was counted: show the new one to confirm.
        setCounted(result.count > 0 ? { day: confirmed.day, count: result.count } : null);
        if (result.count === 0) setStatus(CLEAR_WORDS.none(dayKeyWordsWithYear(confirmed.day)));
        return;
      }
      if (!response.ok || typeof result.deleted !== "number") {
        setError(result.error ?? CLEAR_WORDS.failed);
        return;
      }
      setCounted(null);
      const left = typeof result.left === "number" ? result.left : 0;
      setStatus(left > 0 ? CLEAR_WORDS.doneWithMore(result.deleted, left, dayKeyWordsWithYear(confirmed.day)) : CLEAR_WORDS.done(result.deleted));
      router.refresh();
    } catch {
      setError(CLEAR_WORDS.failed);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={styles.clear} aria-labelledby="clear-out-heading">
      <h2 id="clear-out-heading" className={styles.clearHeading}>
        {CLEAR_WORDS.heading}
      </h2>
      <p className={styles.status}>{CLEAR_WORDS.line}</p>
      <p className={styles.status}>{oldestLine}</p>
      {dueLine && <p className={styles.status}>{dueLine}</p>}
      <div className={styles.clearRow}>
        <div className={styles.field}>
          <label htmlFor="clear-before" className={styles.label}>
            {CLEAR_WORDS.beforeLabel}
          </label>
          <Input
            id="clear-before"
            type="date"
            className={styles.dateInput}
            value={day}
            max={latestDay}
            onChange={(event) => {
              setDay(event.target.value);
              setCounted(null);
              setStatus("");
            }}
          />
        </div>
        <button type="button" className={styles.small} disabled={busy !== "" || !day} onClick={() => void count()}>
          {busy === "counting" ? CLEAR_WORDS.counting : CLEAR_WORDS.count}
        </button>
      </div>
      {counted && (
        <div className={styles.field} role="alert">
          <p className={styles.status}>{CLEAR_WORDS.confirm(counted.count, dayKeyWordsWithYear(counted.day))}</p>
          <div className={styles.actions}>
            <button type="button" className={`${styles.small} ${styles.danger}`} disabled={busy !== ""} onClick={() => void clear(counted)}>
              {busy === "deleting" ? CLEAR_WORDS.deleting : CLEAR_WORDS.delete(counted.count)}
            </button>
            <button type="button" className={styles.small} disabled={busy !== ""} onClick={() => setCounted(null)}>
              {CLEAR_WORDS.keep}
            </button>
          </div>
        </div>
      )}
      {status && (
        <p className={styles.status} role="status">
          {status}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
