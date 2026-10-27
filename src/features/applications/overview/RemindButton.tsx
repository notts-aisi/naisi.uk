"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./ProgrammeOverview.module.css";

/**
 * "Remind Grace", with "Emails 1 person" beside it (board wk-overview): the
 * register reminder, now, to the facilitators of one group.
 *
 * The confirm says who it emails and how many, and there is no test step:
 * the reminder is one short email to the group's own facilitators. The press
 * sends the count it showed, and the route refuses a press whose count no
 * longer matches, so nobody is emailed by a number they did not see. Once
 * it has gone the page is read again, and the card says who was reminded.
 */
export default function RemindButton({
  roundId,
  programmeId,
  groupId,
  sessionKey,
  label,
  count,
  countLine,
  confirm,
}: {
  roundId: string;
  programmeId: string;
  groupId: string;
  sessionKey: string;
  /** "Remind Grace". */
  label: string;
  count: number;
  /** "Emails 1 person". */
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
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/registers/remind`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId, sessionKey, emails: count }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string; emailed?: number };
      if (!res.ok) throw new Error(body.error ?? "The reminder couldn’t be sent. Try again.");
      const emailed = typeof body.emailed === "number" ? body.emailed : 0;
      setSent(`Sent. ${emailed === 1 ? "1 person was" : `${emailed} people were`} emailed.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The reminder couldn’t be sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.remind}>
      <div className={styles.remindRow}>
        <button type="button" className={styles.remindButton} onClick={() => void press()} disabled={busy}>
          {busy ? "Sending…" : label}
        </button>
        <span className={styles.remindCount}>{countLine}</span>
      </div>
      {error && (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      )}
      {sent && (
        <p className={styles.sent} role="status">
          {sent}
        </p>
      )}
    </div>
  );
}
