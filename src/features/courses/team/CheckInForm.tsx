"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { TEAM_PAGE_LIMITS } from "@/lib/courses/teamPage/model";
import {
  UPDATE_SAVED,
  NOT_SAVED,
  OFFLINE,
  SAVE_UPDATE,
  SAVING,
  THIS_WEEKS_UPDATE,
  WHATS_IN_THE_WAY,
  WHAT_WE_DID,
} from "@/lib/courses/teamPage/words";
import styles from "./team.module.css";

/**
 * "THIS WEEK’S UPDATE" (board in-team): two boxes and "Save update",
 * with who reads it said beside the button, as the privacy policy promises.
 *
 * The boxes are uncontrolled, so whatever is typed before the page's script
 * arrives is kept, and the button is disabled until it has (`useHydrated`):
 * a press is never lost. A save posts this week's number with the words; the
 * route refuses a week that is not this one. Then the page is drawn again
 * from the server.
 */

type Props = {
  runId: string;
  weekNumber: number;
  did: string;
  inTheWay: string;
  /** The run still takes writing: not ended, cancelled or archived. */
  canSave: boolean;
  /** "Zach, your team and admins see this." */
  whoLine: string;
};

export default function CheckInForm({ runId, weekNumber, did, inTheWay, canSave, whoLine }: Props) {
  const id = useId();
  const hydrated = useHydrated();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.current || busy) return;
    const data = new FormData(form.current);
    setBusy(true);
    setSaid(null);
    setProblem(null);
    try {
      const response = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/team/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekNumber,
          did: String(data.get("did") ?? ""),
          inTheWay: String(data.get("inTheWay") ?? ""),
        }),
      });
      const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (response.ok) {
        setSaid(UPDATE_SAVED);
        router.refresh();
      } else {
        setProblem(typeof answer.error === "string" ? answer.error : NOT_SAVED);
      }
    } catch {
      setProblem(OFFLINE);
    }
    setBusy(false);
  }

  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={`${styles.h2} ${styles.h2Spaced}`}>
        {THIS_WEEKS_UPDATE}
      </h2>
      <form ref={form} onSubmit={submit} noValidate>
        <label htmlFor={`${id}-did`} className={styles.label}>
          {WHAT_WE_DID}
        </label>
        <textarea
          id={`${id}-did`}
          name="did"
          rows={3}
          className={styles.textarea}
          defaultValue={did}
          maxLength={TEAM_PAGE_LIMITS.checkIn}
          disabled={!canSave}
        />
        <div className={styles.fieldGap} aria-hidden="true" />
        <label htmlFor={`${id}-way`} className={styles.label}>
          {WHATS_IN_THE_WAY}
        </label>
        <textarea
          id={`${id}-way`}
          name="inTheWay"
          rows={2}
          className={styles.textarea}
          defaultValue={inTheWay}
          maxLength={TEAM_PAGE_LIMITS.checkIn}
          disabled={!canSave}
        />
        <div className={styles.actions}>
          {canSave ? (
            <button type="submit" className={styles.button} disabled={!hydrated || busy}>
              {busy ? SAVING : SAVE_UPDATE}
            </button>
          ) : null}
          <p className={styles.who}>{whoLine}</p>
        </div>
        {said ? (
          <p className={styles.said} role="status">
            {said}
          </p>
        ) : null}
        {problem ? (
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        ) : null}
      </form>
    </section>
  );
}
