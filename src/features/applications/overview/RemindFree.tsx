"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { remindedFreeWords } from "@/lib/courses/getReady/words";
import styles from "./ProgrammeOverview.module.css";

/**
 * "Remind 3 people", with "Emails 3 people" beside it (boards st-overview and
 * st-overview-phone): an email, now, to each person holding a place who has
 * not said when they are free, while that is still theirs to add.
 *
 * Every button that emails says how many it reaches (C20), and the confirm
 * says who. The press sends the count it showed, and the route refuses a
 * press whose count no longer matches, so nobody is emailed by a number they
 * did not see. Once it has gone the page is read again, and the card says who
 * was reminded today.
 */
export default function RemindFree({
  roundId,
  programmeId,
  label,
  count,
  countLine,
  confirm,
}: {
  roundId: string;
  programmeId: string;
  /** "Remind 3 people". */
  label: string;
  count: number;
  /** "Emails 3 people". */
  countLine: string;
  /** The question the confirm asks, with the count in it. */
  confirm: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function press() {
    if (busy || !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/when-free/remind`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: count }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string; emailed?: number; failed?: number };
      if (!res.ok) throw new Error(body.error ?? "The reminder couldn’t be sent. Try again.");
      setSent(remindedFreeWords(typeof body.emailed === "number" ? body.emailed : 0, typeof body.failed === "number" ? body.failed : 0));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The reminder couldn’t be sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.readyRemind}>
      <button type="button" className={styles.readyRemindButton} onClick={() => void press()} disabled={busy}>
        {busy ? "Sending…" : label}
      </button>
      <span className={styles.readyRemindCount}>{countLine}</span>
      {error ? (
        <p className={styles.readyRemindProblem} role="alert">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p className={styles.readyRemindResult} role="status">
          {sent}
        </p>
      ) : null}
    </div>
  );
}
