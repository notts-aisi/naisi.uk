"use client";

import { useEffect, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { LastReminded } from "@/lib/courses/groupWeekWork/model";
import * as R from "@/lib/courses/groupWeekWork/words";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import styles from "./GroupPage.module.css";

/**
 * REMIND, AS A PANEL (a side panel at a computer, a sheet on a phone): who it
 * emails by name, when each was last reminded, a warning for anybody
 * reminded in the last day, the email word for word, and one button that
 * says how many it emails ("Send to 2 people").
 *
 * Everything is the route's (`POST /api/courses/groups/[groupId]/remind`):
 * asked with `preview: true` when the panel opens, then pressed with the
 * count it showed. A count that changed in between comes back as a 409 with
 * the new one, and the panel asks again before anybody can send. Nothing
 * here decides who is reminded.
 */

type Preview = {
  weekNumber: number;
  count: number;
  people: Array<{ uid: string; name: string; lastReminded: LastReminded | null; recent: boolean }>;
  email: { from: string; subject: string; greeting: string; paragraphs: string[]; button: string } | null;
};

export default function RemindPanel({
  groupId,
  weekNumber,
  only,
  onClose,
  onDone,
}: {
  groupId: string;
  weekNumber: number;
  /** One person ("Remind Daniel"), or null for everybody whose week isn't done. */
  only: { uid: string; firstName: string } | null;
  onClose: () => void;
  /** The press went: what it came to, in a sentence. */
  onDone: (said: string) => void;
}) {
  const hydrated = useHydrated();
  const [answered, setAnswered] = useState<{ nonce: number; preview: Preview | null; problem: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const path = `/api/courses/groups/${encodeURIComponent(groupId)}/remind`;
  const onlyUid = only?.uid ?? null;

  // Ask what a press would do when the panel opens, and again (`nonce`) after
  // a press whose count had changed. Every state change comes after the
  // request, and an answer to a question no longer asked is dropped.
  useEffect(() => {
    let stale = false;
    const asked = nonce;
    void (async () => {
      let next: { nonce: number; preview: Preview | null; problem: string | null };
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week: weekNumber, ...(onlyUid ? { uid: onlyUid } : {}), preview: true }),
        });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; preview?: Preview; error?: string } | null;
        next =
          response.ok && body?.preview
            ? { nonce: asked, preview: body.preview, problem: null }
            : { nonce: asked, preview: null, problem: body?.error ?? UNKNOWN_OUTCOME };
      } catch {
        next = { nonce: asked, preview: null, problem: UNKNOWN_OUTCOME };
      }
      if (!stale) setAnswered(next);
    })();
    return () => {
      stale = true;
    };
  }, [path, weekNumber, onlyUid, nonce]);

  const loading = answered?.nonce !== nonce;
  const preview = answered?.preview ?? null;
  const shownProblem = problem ?? (loading ? null : (answered?.problem ?? null));

  async function send() {
    if (!preview || preview.count === 0) return;
    setSending(true);
    setProblem(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: weekNumber, ...(onlyUid ? { uid: onlyUid } : {}), count: preview.count }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; said?: string; error?: string } | null;
      if (response.ok && body?.ok) {
        onDone(body.said ?? R.remindSentWords({ sent: 0, justReminded: 0, suppressed: 0, held: 0, failed: 0 }));
        return;
      }
      setProblem(body?.error ?? UNKNOWN_OUTCOME);
      // The count changed while the panel was open: ask again before anybody can send.
      if (response.status === 409) setNonce((n) => n + 1);
    } catch {
      setProblem(UNKNOWN_OUTCOME);
    } finally {
      setSending(false);
    }
  }

  const count = preview?.count ?? 0;
  const recent = (preview?.people ?? []).filter((person) => person.recent).map((person) => person.name);
  const onlyName = only ? only.firstName : null;

  return (
    <section className={styles.panel} aria-labelledby="remind-title" data-testid="remind-panel">
      <div className={styles.panelHead}>
        <h2 id="remind-title" className={styles.panelTitle}>
          {preview ? R.remindPanelTitle({ count, weekNumber, onlyName }) : onlyName !== null ? R.remindOneWords(onlyName) : R.REMIND}
        </h2>
        <button type="button" className={styles.button} onClick={onClose}>
          {R.CLOSE}
        </button>
      </div>
      {loading && !preview ? (
        <p className={styles.panelLede}>{R.PREVIEWING}</p>
      ) : preview ? (
        <>
          {count === 0 ? (
            <p className={styles.panelLede}>{R.nobodyToRemindWords(weekNumber)}</p>
          ) : (
            <>
              <p className={styles.panelLede}>{R.remindLede({ weekNumber, onlyName })}</p>
              <ul className={styles.remindList}>
                {preview.people.map((person) => (
                  <li key={person.uid} className={styles.remindPerson} data-testid="remind-person">
                    <span className={styles.remindName}>{person.name}</span>
                    <span className={styles.remindLast}>{R.lastRemindedLine(person.lastReminded)}</span>
                  </li>
                ))}
              </ul>
              {recent.length > 0 && (
                <p className={styles.panelWarn} role="status">
                  {R.recentWarningWords(recent)}
                </p>
              )}
              {preview.email && (
                <div className={styles.notice} data-testid="remind-email">
                  <p className={styles.noticeTo}>{R.noticeFromWords(preview.email.from)}</p>
                  <p className={styles.noticeSubject}>{preview.email.subject}</p>
                  {preview.email.greeting && <p className={styles.noticeLine}>{preview.email.greeting}</p>}
                  {preview.email.paragraphs.map((paragraph) => (
                    <p key={paragraph} className={styles.noticeLine}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : null}
      {shownProblem && (
        <p className={styles.problem} role="status">
          {shownProblem}
        </p>
      )}
      {preview && count > 0 && (
        <button
          type="button"
          className={`${styles.buttonPrimary} ${styles.remindSend}`}
          disabled={!hydrated || sending || loading}
          onClick={() => void send()}
          data-testid="remind-send"
        >
          {sending ? R.SENDING : R.sendToWords(count)}
        </button>
      )}
    </section>
  );
}
