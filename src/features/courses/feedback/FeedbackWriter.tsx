"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import type { FeedbackSaved } from "@/app/api/courses/runs/[runId]/feedback/route";
import type { StaffFeedbackCard } from "@/lib/courses/feedback/model";
import {
  COMMENT,
  DELETE,
  FEEDBACK_NOT_SAVED,
  KEEP_IT,
  NOT_EMAILED_YET,
  SAVE_CHANGES,
  SAVE_FEEDBACK,
  SAVING,
  changedWords,
  deleteConfirmWords,
  deletedWords,
  savedWords,
  showsOnWords,
  writtenByWords,
} from "@/lib/courses/feedback/words";
import { countWords } from "@/lib/courses/writtenAnswers/model";
import { commentCountWords } from "@/lib/courses/writtenAnswerWords";
import styles from "./feedback.module.css";

/**
 * "YOUR FEEDBACK": one reader's piece of feedback on one person's week, on
 * its written answer (the review page) or on the week as a whole (the
 * Coursework tab's person page). Saving puts it on the person's week page
 * straight away and emails nobody; the page says so, and that the email
 * waits for an admin's batch. While its email has not gone the writer can
 * change its words or delete it; once it has, the card beside this one shows
 * it and this one starts a new piece.
 *
 * Every write goes through `/api/courses/runs/[runId]/feedback`, which asks
 * the one gate again. Nothing here takes a press or a word until React has
 * the page, so nothing typed before then is lost. Once a write has gone
 * through, the page is drawn again from the server.
 */
export default function FeedbackWriter({
  runId,
  uid,
  firstName,
  weekNumber,
  on,
  own,
  viewerName,
  title,
  hint,
  mayWrite,
}: {
  runId: string;
  /** Whose week. */
  uid: string;
  /** The first name they go by. */
  firstName: string;
  weekNumber: number;
  on: { kind: "writtenAnswer"; itemId: string } | { kind: "week" };
  /** The reader's own piece while its email has not gone, which this card changes; null to start one. */
  own: StaffFeedbackCard | null;
  /** The first name the reader goes by, for "Written by". */
  viewerName: string;
  title: string;
  hint: string;
  mayWrite: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const fieldId = useId();
  const [text, setText] = useState(own?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const base = `/api/courses/runs/${encodeURIComponent(runId)}/feedback`;
  const weekId = `w${String(weekNumber).padStart(2, "0")}`;
  const words = countWords(text);
  const changed = own ? text.trim() !== own.text.trim() : text.trim().length > 0;
  const canSave = hydrated && mayWrite && !busy && words > 0 && changed;

  const call = async (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>): Promise<FeedbackSaved | { ok: true }> => {
    const res = await fetch(base, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & Partial<FeedbackSaved>) | null;
    if (!res.ok || !out?.ok) throw new Error(out?.error ?? FEEDBACK_NOT_SAVED);
    return out as FeedbackSaved | { ok: true };
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      if (own) {
        await call("PATCH", { id: own.id, text });
        setSaid(changedWords(firstName, weekNumber));
      } else {
        await call("POST", {
          uid,
          weekId,
          on: on.kind,
          ...(on.kind === "writtenAnswer" ? { itemId: on.itemId } : {}),
          text,
        });
        setSaid(savedWords(firstName, weekNumber));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : FEEDBACK_NOT_SAVED);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!own || busy) return;
    setBusy(true);
    setError(null);
    try {
      await call("DELETE", { id: own.id });
      setConfirming(false);
      setText("");
      setSaid(deletedWords(firstName));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : FEEDBACK_NOT_SAVED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.writer} aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`} className={styles.writerTitle}>
        {title}
      </h2>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.field}>
        <label htmlFor={fieldId} className={styles.label}>
          {COMMENT}
        </label>
        <textarea
          id={fieldId}
          className={styles.textarea}
          rows={5}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          disabled={!hydrated || !mayWrite || busy}
        />
        <div className={styles.fieldFoot}>
          <span>{showsOnWords(firstName, weekNumber)}</span>
          <span className={styles.count}>{commentCountWords(words)}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void save()} disabled={!canSave}>
          {busy && !confirming ? SAVING : own ? SAVE_CHANGES : SAVE_FEEDBACK}
        </button>
        {own?.mayDelete && (
          <button type="button" className={styles.textButton} onClick={() => setConfirming(true)} disabled={!hydrated || busy}>
            {DELETE}
          </button>
        )}
      </div>
      {said && (
        <p className={styles.result} role="status">
          {said}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {own && (
        <p className={styles.meta}>
          {writtenByWords(viewerName || own.byName, own.at ? new Date(own.at) : null, own.editedAt ? new Date(own.editedAt) : null)}
          {" · "}
          {NOT_EMAILED_YET}
        </p>
      )}
      {confirming && own && (
        <Modal open onClose={() => setConfirming(false)} ariaLabel={deleteConfirmWords(firstName)} width="sm">
          {(dismiss) => (
            <div className={styles.dialog}>
              <h2 className={styles.dialogTitle}>{deleteConfirmWords(firstName)}</h2>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.dialogActions}>
                <Button type="button" variant="ghost" onClick={dismiss} disabled={busy}>
                  {KEEP_IT}
                </Button>
                <Button type="button" onClick={() => void remove()} disabled={busy}>
                  {DELETE}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
