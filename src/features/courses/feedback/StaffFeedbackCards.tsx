"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import InitialsChip from "@/components/ui/InitialsChip";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import type { StaffFeedbackCard } from "@/lib/courses/feedback/model";
import {
  DELETE,
  FEEDBACK_NOT_DELETED,
  KEEP_IT,
  cardHeadingWords,
  deleteConfirmWords,
  emailStateWords,
  feedbackOnWords,
  staffCardByWords,
} from "@/lib/courses/feedback/words";
import styles from "./feedback.module.css";

/**
 * THE FEEDBACK ON ONE PERSON'S WEEK, AS THE PEOPLE RUNNING THE GROUP READ IT
 * (the review page, the Coursework tab's person page): each piece signed as
 * the person reads it, what it is on, and whether its email has gone.
 * Feedback given before pieces existed is one of them, already emailed.
 *
 * Delete is drawn on a piece the reader may delete (`mayDelete`, worked out
 * on the server: its writer's until its email has gone, any piece for an
 * admin, never one a press is sending), with a confirm; the route asks the
 * gate again. Nothing else changes here: a writer changes their own words in
 * "Your feedback".
 */
export default function StaffFeedbackCards({
  cards,
  runId,
  firstName,
  weekNumber,
  programme,
}: {
  cards: StaffFeedbackCard[];
  runId: string;
  /** The first name of the person the feedback is about. */
  firstName: string;
  weekNumber: number;
  /** The programme's short name, for "Claudia, who leads AGI Strategy". */
  programme: string;
}) {
  if (cards.length === 0) return null;
  return (
    <ul className={styles.cards} role="list">
      {cards.map((card) => (
        <li key={card.id} className={styles.card}>
          <div className={styles.cardHead}>
            {card.chip ? (
              <InitialsChip name={card.chip.name} uid={card.chip.uid} size="sm" />
            ) : (
              <span className={styles.teamChip} aria-hidden="true">
                N
              </span>
            )}
            <div className={styles.cardWho}>
              <p className={styles.cardHeading}>{cardHeadingWords(card)}</p>
              <p className={styles.cardBy}>{staffCardByWords(card, programme, firstName)}</p>
            </div>
          </div>
          {card.on === "week" && <p className={styles.cardOn}>{feedbackOnWords(weekNumber, "week")}</p>}
          {card.text && <p className={styles.cardText}>{card.text}</p>}
          {card.lines.length > 0 && (
            <ul className={styles.cardLines} role="list">
              {card.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className={styles.cardFoot}>
            <p className={card.emailed || card.sending ? styles.emailState : styles.emailStateOwed}>
              {emailStateWords(firstName, card.emailed, card.sending)}
            </p>
            {card.mayDelete && <DeleteButton runId={runId} id={card.id} firstName={firstName} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeleteButton({ runId, id, firstName }: { runId: string; id: string; firstName: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // With no answer at all (no connection), the words for a delete that didn't go, never the browser's own.
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/feedback`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch(() => null);
      const out = res ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null) : null;
      if (!res || !res.ok || !out?.ok) throw new Error(out?.error || FEEDBACK_NOT_DELETED);
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : FEEDBACK_NOT_DELETED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.textButton} onClick={() => setConfirming(true)} disabled={!hydrated}>
        {DELETE}
      </button>
      {confirming && (
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
    </>
  );
}
