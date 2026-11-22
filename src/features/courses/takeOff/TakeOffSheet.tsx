"use client";

import { useEffect, useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import { ASKING, LINE_LIMIT, TAKING_OFF, type TakeOffSheet as SheetWords } from "@/lib/courses/takeOff/words";
import styles from "./TakeOffSheet.module.css";

/**
 * TAKE SOMEBODY OFF THE RUN, AS A QUESTION: a sheet rising from the bottom on
 * a phone, a dialog wider, in place of the browser's own confirmation. Both
 * boards open it (the card's menu on People in groups, and Remove on the
 * older allocation board), so there is one question however somebody is
 * taken off.
 *
 * Everything it says is the route's (`POST
 * /api/courses/runs/[runId]/enrolments/[uid]/remove`): asked with
 * `preview: true` when the sheet opens, then pressed with the count of emails
 * it showed and the line typed for the person. A count that changed in
 * between comes back as a 409 with the new one, and the sheet asks again
 * before anybody can press. Nothing here decides who is emailed.
 */

type Preview = { emails: number; sheet: SheetWords; limit: string | null };

/** What a press that did not go through says, when the route said nothing. */
const UNKNOWN = "That didn’t go through. Reload the page and try again.";

export default function TakeOffSheet({
  runId,
  uid,
  onClose,
  onDone,
}: {
  runId: string;
  uid: string;
  onClose: () => void;
  /** The press went: what it came to, in the route's sentence. */
  onDone: (said: string) => void;
}) {
  const hydrated = useHydrated();
  const boxId = useId();
  const [nonce, setNonce] = useState(0);
  const [answered, setAnswered] = useState<{ nonce: number; preview: Preview | null; problem: string | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pressing, setPressing] = useState(false);
  const [line, setLine] = useState("");
  const base = `/api/courses/runs/${encodeURIComponent(runId)}/enrolments/${encodeURIComponent(uid)}`;

  // Ask what a press would do when the sheet opens, and again (`nonce`) after
  // a press whose count had changed. An answer to a question no longer asked
  // is dropped.
  useEffect(() => {
    let stale = false;
    const asked = nonce;
    void (async () => {
      let next: { nonce: number; preview: Preview | null; problem: string | null };
      try {
        const response = await fetch(`${base}/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview: true }) });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; preview?: Preview; error?: string } | null;
        next =
          response.ok && body?.preview?.sheet
            ? { nonce: asked, preview: body.preview, problem: null }
            : { nonce: asked, preview: null, problem: body?.error ?? UNKNOWN };
      } catch {
        next = { nonce: asked, preview: null, problem: UNKNOWN };
      }
      if (!stale) setAnswered(next);
    })();
    return () => {
      stale = true;
    };
  }, [base, nonce]);

  const loading = answered?.nonce !== nonce;
  const preview = loading ? null : (answered?.preview ?? null);
  const shownProblem = problem ?? (loading ? null : (answered?.problem ?? null));

  async function press() {
    if (!preview) return;
    setPressing(true);
    setProblem(null);
    try {
      const response = await fetch(`${base}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: preview.emails, ...(line.trim() ? { line: line.trim() } : {}) }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; said?: string; error?: string } | null;
      if (response.ok && body?.ok) {
        onDone(body.said ?? "");
        return;
      }
      setProblem(body?.error ?? UNKNOWN);
      // The count changed while the sheet was open: ask again before anybody can press.
      if (response.status === 409) setNonce((n) => n + 1);
    } catch {
      setProblem(UNKNOWN);
    } finally {
      setPressing(false);
    }
  }

  const sheet = preview?.sheet ?? null;
  const off = !hydrated || pressing || !preview || preview.limit !== null;

  return (
    <Modal open onClose={onClose} ariaLabel={sheet?.title ?? ASKING} width="sm" sheet>
      {(dismiss) => (
        <section className={styles.sheet} aria-labelledby={`${boxId}-title`} data-testid="take-off-sheet">
          <h2 id={`${boxId}-title`} className={styles.title}>
            {sheet?.title ?? ASKING}
          </h2>
          {sheet && (
            <>
              <p className={styles.line}>{sheet.seat}</p>
              <p className={styles.line}>{sheet.emailed}</p>
              {sheet.box && (
                <Field id={`${boxId}-line`} label={sheet.box.label} hint={sheet.box.hint}>
                  <Input
                    id={`${boxId}-line`}
                    value={line}
                    maxLength={LINE_LIMIT}
                    disabled={pressing}
                    onChange={(event) => setLine(event.target.value)}
                  />
                </Field>
              )}
            </>
          )}
          {preview?.limit && (
            <p className={styles.problem} role="status">
              {preview.limit}
            </p>
          )}
          {shownProblem && (
            <p className={styles.problem} role="status">
              {shownProblem}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={dismiss} disabled={pressing}>
              {sheet?.keep ?? "Close"}
            </Button>
            {sheet && (
              <Button type="button" variant="danger" onClick={() => void press()} disabled={off}>
                {pressing ? TAKING_OFF : sheet.go}
              </Button>
            )}
          </div>
        </section>
      )}
    </Modal>
  );
}
