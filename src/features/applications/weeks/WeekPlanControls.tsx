"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { MAX_BREAK_LABEL } from "@/lib/courses/weekPlanEdit/model";
import {
  ADD_A_BREAK,
  ADD_A_WEEK,
  ADD_THE_BREAK,
  BREAK_AFTER,
  BREAK_LABEL,
  BREAK_LABEL_EXAMPLE,
  CANCEL,
  KEEP_IT,
  KEEP_LEFT,
  KEEP_THE_BREAK,
  MATCH_PAGES,
  MOVE_DOWN,
  MOVE_IT,
  MOVE_UP,
  REMOVE_ASK,
  REMOVE_LEFT,
  REMOVE_LEFT_BODY,
  REMOVE_LEFT_TITLE,
  REMOVE_THE_BREAK,
  afterWeekWords,
  controlName,
  keepWeekWords,
  leftBehindWords,
  moveTitle,
  putBackWords,
  removeBreakBody,
  removeBreakTitle,
  removeWeekBody,
  removeWeekTitle,
  removeWeekWords,
  removeWhoWords,
} from "@/lib/courses/weekPlanEdit/words";
import styles from "./weeks.module.css";
import own from "./weekPlan.module.css";

/**
 * THE WEEK PLAN'S CONTROLS on a programme's Weeks tab, each a press of the
 * one checked route (`POST /api/courses/runs/[runId]/week-plan`): Move up,
 * Move down and Remove… beside each week and break, and Add a week and Add a
 * break under the list. The page offers only what the route would take, and
 * the route asks again in one transaction with its write, so whatever it
 * refuses is said here in its own words. Every press sends the plan as the
 * page drew it, so a press made on an older drawing is refused, never taken
 * on another plan. Once the route has answered the page is read again.
 * Nobody is emailed.
 */

type Step =
  | { action: "add-week" }
  | { action: "add-break"; afterWeek: number; label: string }
  | { action: "move"; index: number; direction: "up" | "down" }
  | { action: "remove"; index: number }
  | { action: "match-pages" }
  | { action: "put-back"; address: string }
  | { action: "remove-left"; address: string };

async function sendStep(runId: string, planKey: string, step: Step): Promise<string> {
  const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/week-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...step, planKey }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new Error(body.error ?? "That didn’t change. Try again.");
  return body.message ?? "";
}

/** The busy flag, the route's last refusal, and a press that refreshes the page after it. */
function useStep(runId: string, planKey: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  async function press(step: Step): Promise<boolean> {
    setBusy(true);
    setProblem(null);
    setSaid(null);
    try {
      setSaid(await sendStep(runId, planKey, step));
      router.refresh();
      return true;
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t change. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, problem, said, press, setProblem };
}

export type PlanRowEntry =
  | { kind: "week"; weekNumber: number; title: string; hasPage: boolean }
  | { kind: "break"; label: string };

/** Move up, Move down and Remove… for one week or break, each only where the page was told the route would take it. */
export function PlanRowControls({
  runId,
  planKey,
  index,
  entry,
  up,
  down,
  remove,
  laterWeeks,
  anybodyOnRun,
  upNotices = [],
  downNotices = [],
  removeNotices = [],
}: {
  runId: string;
  planKey: string;
  index: number;
  entry: PlanRowEntry;
  up: boolean;
  down: boolean;
  remove: { ask: true } | { refusal: string } | null;
  laterWeeks: boolean;
  anybodyOnRun: boolean;
  /** What a move or the removal changes for people outside the plan, said in its question; a move with none asks nothing. */
  upNotices?: string[];
  downNotices?: string[];
  removeNotices?: string[];
}) {
  const hydrated = useHydrated();
  const { busy, problem, press, setProblem } = useStep(runId, planKey);
  const [asking, setAsking] = useState(false);
  const [moving, setMoving] = useState<"up" | "down" | null>(null);
  const movePress = (direction: "up" | "down") => {
    if ((direction === "up" ? upNotices : downNotices).length > 0) setMoving(direction);
    else void press({ action: "move", index, direction });
  };
  const what = entry.kind === "week" ? `week ${entry.weekNumber}` : entry.label;
  if (!up && !down && !remove) return null;

  function pressRemove() {
    if (!remove) return;
    if ("refusal" in remove) setProblem(remove.refusal);
    else setAsking(true);
  }

  return (
    <div className={own.controls}>
      <div className={own.buttons}>
        {up && (
          <button type="button" className={styles.button} aria-label={controlName(what, "up")} onClick={() => movePress("up")} disabled={!hydrated || busy}>
            {MOVE_UP}
          </button>
        )}
        {down && (
          <button type="button" className={styles.button} aria-label={controlName(what, "down")} onClick={() => movePress("down")} disabled={!hydrated || busy}>
            {MOVE_DOWN}
          </button>
        )}
        {remove && (
          <button type="button" className={styles.button} aria-label={controlName(what, "remove")} onClick={pressRemove} disabled={!hydrated || busy}>
            {REMOVE_ASK}
          </button>
        )}
      </div>
      {problem && (
        <p className={own.refusal} role="alert">
          {problem}
        </p>
      )}

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        ariaLabel={entry.kind === "week" ? removeWeekTitle(entry.weekNumber) : removeBreakTitle(entry.label)}
        width="sm"
      >
        {(dismiss) => (
          <section className={own.dialog} aria-labelledby={`plan-remove-${index}`}>
            <h2 id={`plan-remove-${index}`} className={styles.subheading}>
              {entry.kind === "week" ? removeWeekTitle(entry.weekNumber) : removeBreakTitle(entry.label)}
            </h2>
            {entry.kind === "week" ? (
              <>
                <p>{removeWeekBody(entry.weekNumber, entry.title, entry.hasPage, laterWeeks)}</p>
                <p className={styles.muted}>{removeWhoWords(anybodyOnRun)}</p>
              </>
            ) : (
              <p>{removeBreakBody(laterWeeks)}</p>
            )}
            {removeNotices.length > 0 && <p>{removeNotices.join(" ")}</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={dismiss} disabled={busy}>
                {entry.kind === "week" ? keepWeekWords(entry.weekNumber) : KEEP_THE_BREAK}
              </button>
              <button
                type="button"
                className={`${styles.button} ${own.buttonCareful}`}
                onClick={() => void press({ action: "remove", index }).then(() => setAsking(false))}
                disabled={busy}
              >
                {entry.kind === "week" ? removeWeekWords(entry.weekNumber) : REMOVE_THE_BREAK}
              </button>
            </div>
          </section>
        )}
      </Modal>

      <Modal open={moving !== null} onClose={() => setMoving(null)} ariaLabel={moveTitle(what, moving ?? "up")} width="sm">
        {(dismiss) => (
          <section className={own.dialog} aria-labelledby={`plan-move-${index}`}>
            <h2 id={`plan-move-${index}`} className={styles.subheading}>
              {moveTitle(what, moving ?? "up")}
            </h2>
            <p>{(moving === "down" ? downNotices : upNotices).join(" ")}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={dismiss} disabled={busy}>
                {KEEP_IT}
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => {
                  const direction = moving ?? "up";
                  void press({ action: "move", index, direction }).then(() => setMoving(null));
                }}
                disabled={busy}
              >
                {MOVE_IT}
              </button>
            </div>
          </section>
        )}
      </Modal>
    </div>
  );
}

/** Add a week and Add a break, under the list, each only while the route would take it. */
export function PlanAdd({
  runId,
  planKey,
  addWeek,
  addBreak,
}: {
  runId: string;
  planKey: string;
  addWeek: boolean;
  addBreak: { afterWeeks: number[]; hint: string } | null;
}) {
  const hydrated = useHydrated();
  const { busy, problem, said, press } = useStep(runId, planKey);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [after, setAfter] = useState<number | null>(null);
  if (!addWeek && !addBreak) return null;
  const chosen = after ?? addBreak?.afterWeeks[0] ?? 1;

  return (
    <div className={own.add}>
      <div className={own.buttons}>
        {addWeek && (
          <button type="button" className={styles.button} onClick={() => void press({ action: "add-week" })} disabled={!hydrated || busy}>
            {ADD_A_WEEK}
          </button>
        )}
        {addBreak && (
          <button type="button" className={styles.button} onClick={() => setOpen(true)} disabled={!hydrated || busy}>
            {ADD_A_BREAK}
          </button>
        )}
      </div>
      {said && !problem && (
        <p className={styles.done} role="status">
          {said}
        </p>
      )}
      {problem && !open && (
        <p className={own.refusal} role="alert">
          {problem}
        </p>
      )}

      {addBreak && (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel={ADD_A_BREAK} width="sm">
          {(dismiss) => (
            <form
              className={own.dialog}
              aria-labelledby="plan-add-break"
              onSubmit={(event) => {
                event.preventDefault();
                void press({ action: "add-break", afterWeek: chosen, label }).then((ok) => {
                  if (!ok) return;
                  setOpen(false);
                  setLabel("");
                  setAfter(null);
                });
              }}
            >
              <h2 id="plan-add-break" className={styles.subheading}>
                {ADD_A_BREAK}
              </h2>
              <label className={own.field}>
                <span className={own.fieldLabel}>{BREAK_LABEL}</span>
                <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={BREAK_LABEL_EXAMPLE} maxLength={MAX_BREAK_LABEL} required />
              </label>
              <label className={own.field}>
                <span className={own.fieldLabel}>{BREAK_AFTER}</span>
                <Select value={String(chosen)} onChange={(event) => setAfter(Number(event.target.value))}>
                  {addBreak.afterWeeks.map((n) => (
                    <option key={n} value={n}>
                      {afterWeekWords(n)}
                    </option>
                  ))}
                </Select>
              </label>
              <p className={styles.muted}>{addBreak.hint}</p>
              {problem && (
                <p className={own.refusal} role="alert">
                  {problem}
                </p>
              )}
              <div className={styles.actions}>
                <button type="button" className={styles.button} onClick={dismiss} disabled={busy}>
                  {CANCEL}
                </button>
                <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`} disabled={busy || !label.trim()}>
                  {ADD_THE_BREAK}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}

/** While the plan is out of step with its pages: the one control, which moves no page and deletes nothing. */
export function MatchPages({ runId, planKey }: { runId: string; planKey: string }) {
  const hydrated = useHydrated();
  const { busy, problem, said, press } = useStep(runId, planKey);
  return (
    <div className={own.add}>
      <div className={own.buttons}>
        <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void press({ action: "match-pages" })} disabled={!hydrated || busy}>
          {MATCH_PAGES}
        </button>
      </div>
      {said && !problem && (
        <p className={styles.done} role="status">
          {said}
        </p>
      )}
      {problem && (
        <p className={own.refusal} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/** A page after the plan's last week: put it back as the next week, remove it, or the sentence that says how. */
export function LeftBehind({
  runId,
  planKey,
  address,
  title,
  putBack,
  remove,
  notices = [],
}: {
  runId: string;
  planKey: string;
  address: string;
  title: string;
  putBack: { weekNumber: number } | { sentence: string };
  remove: boolean;
  /** What putting it back or removing it changes for people outside the plan. */
  notices?: string[];
}) {
  const hydrated = useHydrated();
  const { busy, problem, press } = useStep(runId, planKey);
  const [asking, setAsking] = useState(false);
  return (
    <div className={own.left}>
      <p>{leftBehindWords(title)}</p>
      {"sentence" in putBack ? (
        <p className={styles.muted}>{putBack.sentence}</p>
      ) : null}
      {notices.length > 0 && <p className={styles.muted}>{notices.join(" ")}</p>}
      <div className={own.buttons}>
        {"weekNumber" in putBack && (
          <button type="button" className={styles.button} onClick={() => void press({ action: "put-back", address })} disabled={!hydrated || busy}>
            {putBackWords(putBack.weekNumber)}
          </button>
        )}
        {remove && (
          <button type="button" className={styles.button} onClick={() => setAsking(true)} disabled={!hydrated || busy}>
            {REMOVE_LEFT}
          </button>
        )}
      </div>
      {problem && (
        <p className={own.refusal} role="alert">
          {problem}
        </p>
      )}
      <Modal open={asking} onClose={() => setAsking(false)} ariaLabel={REMOVE_LEFT_TITLE} width="sm">
        {(dismiss) => (
          <section className={own.dialog} aria-labelledby={`plan-left-${address}`}>
            <h2 id={`plan-left-${address}`} className={styles.subheading}>
              {REMOVE_LEFT_TITLE}
            </h2>
            <p>{leftBehindWords(title)}</p>
            <p>{REMOVE_LEFT_BODY}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={dismiss} disabled={busy}>
                {KEEP_LEFT}
              </button>
              <button
                type="button"
                className={`${styles.button} ${own.buttonCareful}`}
                onClick={() => void press({ action: "remove-left", address }).then(() => setAsking(false))}
                disabled={busy}
              >
                {REMOVE_LEFT}
              </button>
            </div>
          </section>
        )}
      </Modal>
    </div>
  );
}
