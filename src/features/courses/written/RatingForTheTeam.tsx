"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import type { WorkRatingCleared, WorkRatingSaved } from "@/app/api/courses/runs/[runId]/work-ratings/route";
import { WORK_RATING_SCALE, type TeamRatingRow, type TeamRatingsView } from "@/lib/courses/workRatings/model";
import {
  CLEAR_IT,
  CLEAR_MY_RATING,
  COMMENT_FOR_THE_TEAM,
  KEEP_IT,
  NOT_RATED_YET,
  RATING_CLEARED,
  RATING_FOR_THE_TEAM,
  RATING_NOT_CLEARED,
  RATING_NOT_SAVED,
  RATING_SAVED,
  RATING_SCALE_LINE,
  SAVE_RATING,
  SAVING,
  SOMEBODY_ON_THE_TEAM,
  WHAT_THE_TEAM_SAID,
  WHO_READS_RATINGS,
  YOUR_RATING,
  clearConfirmWords,
  neverShownWords,
  outOfTenWords,
  ratedWords,
  raterRoleWords,
  saidDayWords,
} from "@/lib/courses/workRatings/words";
import { countWords } from "@/lib/courses/writtenAnswers/model";
import { commentCountWords } from "@/lib/courses/writtenAnswerWords";
import styles from "./workRatings.module.css";

/**
 * RATING FOR THE TEAM, AND WHAT THE TEAM SAID (privacy v15, "Ratings for the
 * team"): on a written answer's review page, beside the feedback, for an
 * admin or the programme's lead alone. The page hands it `team` only for
 * them (`loadWrittenReview`), so a facilitator's page draws none of it and
 * carries no rating.
 *
 * "Rating for the team" is the reader's own rating of the answer: a whole
 * number from 1 to 10 (ten radio buttons, each a 44px target) and a comment
 * for the team, both needed before it saves, changed by saving again and
 * cleared with a confirm. "What the team said" lists every rating on the
 * answer, oldest first, the reader's own among them, or says the reader has
 * not rated it yet. Nothing is emailed, and the person never sees any of it.
 *
 * Every write goes through `/api/courses/runs/[runId]/work-ratings`, which
 * asks the gate again. Nothing here takes a press until React has the page;
 * once a write has gone through, the page is drawn again from the server.
 */
export default function RatingForTheTeam({
  runId,
  uid,
  firstName,
  weekNumber,
  team,
}: {
  runId: string;
  /** Whose answer. */
  uid: string;
  /** The first name they go by. */
  firstName: string;
  weekNumber: number;
  team: TeamRatingsView;
}) {
  return (
    <>
      <YourRating runId={runId} uid={uid} firstName={firstName} weekNumber={weekNumber} team={team} />
      <WhatTheTeamSaid team={team} />
    </>
  );
}

function YourRating({ runId, uid, firstName, weekNumber, team }: { runId: string; uid: string; firstName: string; weekNumber: number; team: TeamRatingsView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const mine = team.mine;
  const [rating, setRating] = useState<number | null>(mine?.rating ?? null);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const base = `/api/courses/runs/${encodeURIComponent(runId)}/work-ratings`;
  const weekId = `w${String(weekNumber).padStart(2, "0")}`;
  const words = countWords(comment);
  const changed = mine ? rating !== mine.rating || comment.trim() !== mine.comment.trim() : rating !== null || comment.trim().length > 0;
  const canSave = hydrated && !busy && rating !== null && words > 0 && changed;

  // Every failure throws words to show: the route's refusal, or, with no
  // answer at all (no connection), the line for what was being done. Never
  // the browser's own error text.
  const call = async (method: "PUT" | "DELETE", body: Record<string, unknown>): Promise<WorkRatingSaved | WorkRatingCleared> => {
    const fallback = method === "DELETE" ? RATING_NOT_CLEARED : RATING_NOT_SAVED;
    const res = await fetch(base, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const out = res ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null) : null;
    if (!res || !res.ok || !out?.ok) throw new Error(out?.error || fallback);
    return { ok: true };
  };

  const save = async () => {
    if (!canSave || rating === null) return;
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      await call("PUT", { uid, weekId, itemId: team.itemId, rating, comment });
      setSaid(RATING_SAVED);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : RATING_NOT_SAVED);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!mine || busy) return;
    setBusy(true);
    setError(null);
    try {
      await call("DELETE", { uid, weekId });
      setConfirming(false);
      setRating(null);
      setComment("");
      setSaid(RATING_CLEARED);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : RATING_NOT_CLEARED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <h2 id={`${id}-title`} className={styles.title}>
          {RATING_FOR_THE_TEAM}
        </h2>
        <span className={styles.whoChip}>{WHO_READS_RATINGS}</span>
      </div>
      <fieldset className={styles.scale} disabled={!hydrated || busy} aria-describedby={`${id}-scale`}>
        <legend className={styles.label}>{YOUR_RATING}</legend>
        <div className={styles.options}>
          {WORK_RATING_SCALE.map((n) => (
            <label key={n} className={rating === n ? `${styles.option} ${styles.optionOn}` : styles.option}>
              <input
                type="radio"
                name={`${id}-rating`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className={styles.optionInput}
                aria-label={outOfTenWords(n)}
              />
              <span aria-hidden="true">{n}</span>
            </label>
          ))}
        </div>
        <p id={`${id}-scale`} className={styles.scaleLine}>
          {RATING_SCALE_LINE}
        </p>
      </fieldset>
      <div className={styles.field}>
        <label htmlFor={`${id}-comment`} className={styles.label}>
          {COMMENT_FOR_THE_TEAM}
        </label>
        <textarea
          id={`${id}-comment`}
          className={styles.textarea}
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
          disabled={!hydrated || busy}
        />
        <div className={styles.fieldFoot}>
          <span>{neverShownWords(firstName)}</span>
          <span className={styles.count}>{commentCountWords(words)}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void save()} disabled={!canSave}>
          {busy && !confirming ? SAVING : SAVE_RATING}
        </button>
        {mine && (
          <button type="button" className={styles.textButton} onClick={() => setConfirming(true)} disabled={!hydrated || busy}>
            {CLEAR_MY_RATING}
          </button>
        )}
      </div>
      {said && (
        <p className={styles.result} role="status">
          {said}
        </p>
      )}
      {error && !confirming && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {mine && <p className={styles.meta}>{ratedWords(mine.at ? new Date(mine.at) : null, mine.changedAt ? new Date(mine.changedAt) : null)}</p>}
      {confirming && mine && (
        <Modal open onClose={() => setConfirming(false)} ariaLabel={clearConfirmWords(firstName)} width="sm">
          {(dismiss) => (
            <div className={styles.dialog}>
              <h2 className={styles.dialogTitle}>{clearConfirmWords(firstName)}</h2>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.dialogActions}>
                <Button type="button" variant="ghost" onClick={dismiss} disabled={busy}>
                  {KEEP_IT}
                </Button>
                <Button type="button" onClick={() => void clear()} disabled={busy}>
                  {CLEAR_IT}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}

/** Every rating on the answer, oldest first, or that the reader has not rated it yet. */
function WhatTheTeamSaid({ team }: { team: TeamRatingsView }) {
  const id = useId();
  return (
    <section className={styles.card} aria-labelledby={`${id}-said`}>
      <h2 id={`${id}-said`} className={styles.title}>
        {WHAT_THE_TEAM_SAID}
      </h2>
      <ul className={styles.said} role="list">
        {team.said.map((row) => (
          <SaidRow key={row.raterUid} row={row} />
        ))}
        {!team.mine && (
          <li className={styles.saidRow}>
            <p className={styles.saidHead}>
              <span className={styles.saidName}>{team.viewer.name || SOMEBODY_ON_THE_TEAM}</span>
              <span className={styles.saidRole}>{raterRoleWords(team.viewer.role)}</span>
              <span className={styles.notRated}>{NOT_RATED_YET}</span>
            </p>
          </li>
        )}
      </ul>
    </section>
  );
}

function SaidRow({ row }: { row: TeamRatingRow }) {
  const day = saidDayWords(row.at, row.changedAt);
  return (
    <li className={styles.saidRow}>
      <p className={styles.saidHead}>
        <span className={styles.saidName}>{row.name || SOMEBODY_ON_THE_TEAM}</span>
        <span className={styles.saidRole}>{raterRoleWords(row.role)}</span>
        <span className={styles.ratingChip}>{outOfTenWords(row.rating)}</span>
        {day && <span className={styles.saidDay}>{day}</span>}
      </p>
      <p className={styles.saidComment}>“{row.comment}”</p>
    </li>
  );
}
