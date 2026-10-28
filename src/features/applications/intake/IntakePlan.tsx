"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { own } from "@/lib/applications/keys";
import type { DecisionOp } from "@/lib/applications/intake/advice";
import type { IntakeRow, IntakeView } from "@/lib/applications/intake/run";
import styles from "./IntakePlan.module.css";

/**
 * Plan the intake, for an admin: the whole term on one page, in the order it
 * is done.
 *
 *  1. READ EVERYONE. The browser walks the applications with no read or no
 *     clean Pangram check, two at a time, through the same assessment route
 *     the review screen uses, so each is read once and every rule that route
 *     keeps is kept. Stop halts it after the two in hand.
 *  2. PLAN. The intake route drafts who goes where; with Claude, it adds
 *     Claude's changes and facilitator lists, kept only where they fit.
 *  3. APPLY. Each person's decisions are made through the decision route, one
 *     at a time, and a person's next decision waits for their last. Nobody is
 *     emailed: decision day still does that.
 *
 * Clear all reads deletes every stored read and Pangram check on the form, so
 * the term can be read again under the same instructions.
 */

type Sent = { ok: boolean; status: number; data: Record<string, unknown>; error: string };
type Step = { label: string; ok: boolean; detail?: string };
type Progress = { done: number; total: number; failed: { name: string; reason: string }[]; stopped: string | null };

const STANDING: Record<string, string> = {
  accepted: "accepted",
  "to-review": "not decided",
  pooled: "pooled",
  declined: "declined",
};

/** `outcomeFor`'s kinds, for somebody with no place as the decisions stand. */
const OUTCOME: Record<string, string> = {
  undecided: "Not decided yet",
  "needs-outcome": "Pooled, needs an outcome",
  "no-offer": "Pooled, no offer",
  invited: "Pooled, invited elsewhere",
  declined: "Declined",
};

async function send(url: string, method: string, body: unknown): Promise<Sent> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    ok: response.ok,
    status: response.status,
    data,
    error: typeof data.error === "string" ? data.error : `It answered ${response.status}.`,
  };
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default function IntakePlan({ roundId, initial }: { roundId: string; initial: IntakeView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [view, setView] = useState<IntakeView>(initial);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [reading, setReading] = useState(false);
  const stop = useRef(false);
  const [confirming, setConfirming] = useState<"apply" | "clear" | null>(null);
  const [applying, setApplying] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [showEveryone, setShowEveryone] = useState(false);
  const [cleared, setCleared] = useState<string | null>(null);

  const form = `/api/admissions/forms/${encodeURIComponent(roundId)}`;
  const shortOf = new Map(view.programmes.map((p) => [p.id, p.shortName] as const));
  const nameOf = (id: string | null) => (id ? (shortOf.get(id) ?? "a closed programme") : "No place");
  const busy = planning || reading || applying;

  const unread = view.rows.filter((row) => !row.hasRead || !row.hasPangram);
  const needClaude = view.rows.filter((row) => !row.hasRead).length;
  const needPangram = view.rows.filter((row) => !row.hasPangram).length;
  const changed = view.rows.filter((row) => row.ops.length > 0);
  // People the plan would move by undoing a decision already made: Apply leaves them for a person.
  const held = view.rows.filter((row) => row.held !== null);
  const opCount = changed.reduce((sum, row) => sum + row.ops.length, 0);

  const plan = async (askClaude: boolean) => {
    setPlanning(true);
    setError(null);
    setSteps([]);
    setConfirming(null);
    try {
      const answer = await send(`${form}/intake`, "POST", { askClaude });
      if (!answer.ok) setError(answer.error);
      else setView(answer.data.intake as IntakeView);
    } catch {
      setError("That couldn’t be sent. Check your connection and try again.");
    } finally {
      setPlanning(false);
    }
  };

  const readEveryone = async () => {
    stop.current = false;
    setReading(true);
    setError(null);
    const queue = [...unread];
    const state: Progress = { done: 0, total: queue.length, failed: [], stopped: null };
    setProgress({ ...state });
    let claudeOff = false;
    let pangramOff = false;
    const halt = (why: string) => {
      state.stopped = why;
      stop.current = true;
    };
    const worker = async () => {
      for (let row = queue.shift(); row && !stop.current; row = queue.shift()) {
        const url = `${form}/applications/${encodeURIComponent(row.uid)}/assessment`;
        const programmeId = row.ranked[0]?.programmeId ?? null;
        try {
          if (!row.hasRead && !claudeOff) {
            const answer = await send(url, "POST", { part: "claude", programmeId });
            if (!answer.ok) {
              state.failed.push({ name: row.name, reason: `Claude: ${answer.error}` });
              if (answer.status === 409 || /refused this site/.test(answer.error)) {
                claudeOff = true;
                if (pangramOff || row.hasPangram) halt(`Claude: ${answer.error}`);
              }
            }
          }
          if (!row.hasPangram && !pangramOff) {
            const answer = await send(url, "POST", { part: "pangram", programmeId });
            const check = (answer.data.assessment as { pangram?: { failed?: { reason: string }[] } } | undefined)?.pangram;
            const reason = !answer.ok ? answer.error : (check?.failed?.[0]?.reason ?? null);
            if (reason) {
              state.failed.push({ name: row.name, reason: `Pangram: ${reason}` });
              if (answer.status === 409 || /no API credit|refused this site/.test(reason)) {
                pangramOff = true;
                if (claudeOff) halt(`Pangram: ${reason}`);
              }
            }
          }
        } catch {
          state.failed.push({ name: row.name, reason: "That couldn’t be sent. Check your connection." });
        }
        state.done += 1;
        setProgress({ ...state, failed: [...state.failed] });
      }
    };
    await Promise.all([worker(), worker()]);
    if (stop.current && !state.stopped) state.stopped = "Stopped.";
    setProgress({ ...state, failed: [...state.failed] });
    setReading(false);
    await plan(false);
  };

  const apply = async () => {
    setConfirming(null);
    setApplying(true);
    setError(null);
    const done: Step[] = [];
    const note = (step: Step) => {
      done.push(step);
      setSteps([...done]);
    };
    const words = (op: DecisionOp) =>
      op.decision === "accept"
        ? `accept on ${nameOf(op.programmeId)}`
        : `pool on ${nameOf(op.programmeId)} (${op.poolReason === "better-fit" ? "better fit elsewhere" : "capacity"})`;
    try {
      for (const row of changed) {
        for (const op of row.ops) {
          const answer = await send(`${form}/applications/${encodeURIComponent(row.uid)}/decision`, "PUT", {
            programmeId: op.programmeId,
            decision: op.decision,
            poolReason: op.poolReason,
          });
          note({ label: `${row.name}: ${words(op)}`, ok: answer.ok, detail: answer.ok ? undefined : answer.error });
          // Their next decision depends on this one: leave them for a person.
          if (!answer.ok) break;
        }
      }
      note({ label: "Done. Nobody has been emailed: decision day tells people.", ok: true });
      router.refresh();
    } catch {
      note({ label: "That couldn’t be sent. Check your connection; what is ticked above was saved.", ok: false });
    } finally {
      setApplying(false);
    }
    await plan(false);
  };

  const clearAll = async () => {
    setConfirming(null);
    setError(null);
    setPlanning(true);
    try {
      const answer = await send(`${form}/intake/clear`, "POST", { confirm: true });
      if (!answer.ok) setError(answer.error);
      else setCleared(`Cleared ${String(answer.data.deleted ?? 0)}.`);
    } catch {
      setError("That couldn’t be sent. Check your connection and try again.");
    } finally {
      setPlanning(false);
    }
    await plan(false);
  };

  const rows = showEveryone ? view.rows : [...changed, ...held];

  return (
    <div className={styles.page}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.panel} aria-labelledby="intake-read">
        <h2 id="intake-read" className={styles.title}>
          1. Read everyone
        </h2>
        <p className={styles.line}>
          Claude reads each application once, blind first and then with the committee’s scores and comments, with a
          lean for every programme the person ranked. Pangram checks their long answers together in one request.
          {" "}
          {view.rows.length - needClaude} of {view.rows.length} read by Claude, {view.rows.length - needPangram} checked by
          Pangram.
        </p>
        {unread.length > 0 ? (
          <p className={styles.line}>
            Roughly {money(needClaude * 0.1)} to {money(needClaude * 0.25)} of Claude credit and {money(needPangram * 0.3)} to{" "}
            {money(needPangram * 0.5)} of Pangram credit. Top Pangram up first: it stops when its credit runs out.
          </p>
        ) : null}
        <div className={styles.actions}>
          {reading ? (
            <button type="button" className={styles.quiet} onClick={() => (stop.current = true)}>
              Stop after these two
            </button>
          ) : (
            <button
              type="button"
              className={styles.button}
              disabled={!hydrated || busy || unread.length === 0 || (!view.claudeConfigured && needPangram === 0)}
              onClick={() => void readEveryone()}
            >
              {unread.length === 0 ? "Everyone has been read" : `Read the ${unread.length} not yet read`}
            </button>
          )}
          {progress ? (
            <span className={styles.line} aria-live="polite">
              {progress.done} of {progress.total} done
              {progress.stopped ? `. ${progress.stopped}` : reading ? ", two at a time. Keep this tab open." : "."}
            </span>
          ) : null}
        </div>
        {progress && progress.failed.length > 0 ? (
          <details className={styles.details}>
            <summary>Not read ({progress.failed.length})</summary>
            <ul className={styles.list}>
              {progress.failed.map((entry, i) => (
                <li key={i}>
                  {entry.name}: {entry.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="intake-plan">
        <h2 id="intake-plan" className={styles.title}>
          2. Plan the intake
        </h2>
        <p className={styles.line}>
          The draft puts each person on the highest programme they ranked that has room and would have them, preferring
          the lead’s acceptances, then Claude’s leans, then the committee’s scores. Claude then suggests changes across
          the term and who should facilitate. Only suggestions that fit the rankings, the leads’ declines and the places
          are kept.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={!hydrated || busy || !view.claudeConfigured}
            onClick={() => void plan(true)}
          >
            {planning ? "Working it out…" : "Plan with Claude"}
          </button>
          <button type="button" className={styles.quiet} disabled={!hydrated || busy} onClick={() => void plan(false)}>
            Draft only, without Claude
          </button>
          {planning ? <span className={styles.line}>Claude takes a minute or two.</span> : null}
        </div>

        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Programme</th>
                <th scope="col">Places</th>
                <th scope="col">Hold a place now</th>
                <th scope="col">In the plan</th>
              </tr>
            </thead>
            <tbody>
              {view.programmes.map((programme) => (
                <tr key={programme.id}>
                  <th scope="row">
                    {programme.shortName}
                    {programme.note ? <span className={styles.note}>{programme.note}</span> : null}
                  </th>
                  <td>{programme.places ?? "No limit"}</td>
                  <td>{programme.placedNow}</td>
                  <td className={programme.places !== null && programme.inPlan > programme.places ? styles.over : undefined}>
                    {programme.inPlan}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.claude?.notes ? <p className={styles.notes}>{view.claude.notes}</p> : null}

        <div className={styles.rowsHead}>
          <h3 className={styles.subtitle}>
            {changed.length === 0
              ? "The plan matches the decisions as they stand"
              : `${changed.length} ${changed.length === 1 ? "person" : "people"} whose decisions would change`}
            {held.length > 0 ? `, and ${held.length} left for you` : ""}
          </h3>
          <label className={styles.toggle}>
            <input type="checkbox" checked={showEveryone} onChange={(e) => setShowEveryone(e.target.checked)} />
            Show everyone ({view.rows.length})
          </label>
        </div>
        {rows.length > 0 ? (
          <ul className={styles.people}>
            {rows.map((row) => (
              <PersonRow key={row.uid} row={row} nameOf={nameOf} />
            ))}
          </ul>
        ) : null}

        {view.facilitators.length > 0 || view.shouldFacilitate.length > 0 ? (
          <div className={styles.facilitators}>
            {view.facilitators.length > 0 ? (
              <div>
                <h3 className={styles.subtitle}>Facilitators, from those who offered</h3>
                <ul className={styles.list}>
                  {view.facilitators.map((f) => (
                    <li key={`${f.uid}:${f.programmeId}`}>
                      <strong>{f.name}</strong> for {nameOf(f.programmeId)}
                      {f.why ? <span className={styles.line}> · {f.why}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {view.shouldFacilitate.length > 0 ? (
              <div>
                <h3 className={styles.subtitle}>Didn’t offer, but worth asking</h3>
                <ul className={styles.list}>
                  {view.shouldFacilitate.map((f) => (
                    <li key={`${f.uid}:${f.programmeId}`}>
                      <strong>{f.name}</strong> for {nameOf(f.programmeId)}
                      {f.why ? <span className={styles.line}> · {f.why}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {view.claude && view.claude.dropped.length > 0 ? (
          <details className={styles.details}>
            <summary>Claude suggestions that didn’t fit ({view.claude.dropped.length})</summary>
            <ul className={styles.list}>
              {view.claude.dropped.map((entry, i) => (
                <li key={i}>
                  {entry.suggestion}: {entry.why}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="intake-apply">
        <h2 id="intake-apply" className={styles.title}>
          3. Apply
        </h2>
        <p className={styles.line}>
          Makes {opCount} {opCount === 1 ? "decision" : "decisions"} through the usual decision route, as you. It only
          fills in decisions nobody has made yet: a lead’s Accept, Pool or Decline is never changed. A person whose
          decision is refused is left for you, with why. Nobody is emailed until decision day.
        </p>
        <div className={styles.actions}>
          {confirming === "apply" ? (
            <>
              <button type="button" className={styles.button} disabled={!hydrated || busy} onClick={() => void apply()}>
                Yes, make {opCount} {opCount === 1 ? "decision" : "decisions"}
              </button>
              <button type="button" className={styles.quiet} onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.button}
              disabled={!hydrated || busy || opCount === 0}
              onClick={() => setConfirming("apply")}
            >
              {applying ? "Applying…" : "Apply this plan"}
            </button>
          )}
        </div>
        {steps.length > 0 ? (
          <ol className={styles.steps}>
            {steps.map((step, i) => (
              <li key={i} className={step.ok ? styles.stepOk : styles.stepFailed}>
                {step.ok ? "✓" : "✗"} {step.label}
                {step.detail ? <span className={styles.line}> · {step.detail}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section className={styles.quietPanel} aria-labelledby="intake-clear">
        <h2 id="intake-clear" className={styles.subtitle}>
          Clear all reads
        </h2>
        <p className={styles.line}>
          Deletes every Claude read and Pangram check on this form, so the whole term can be read again. The
          applications, scores and comments are untouched. Reading everyone again costs the credit above.
        </p>
        <div className={styles.actions}>
          {confirming === "clear" ? (
            <>
              <button type="button" className={styles.danger} disabled={!hydrated || busy} onClick={() => void clearAll()}>
                Yes, clear every read
              </button>
              <button type="button" className={styles.quiet} onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className={styles.quiet} disabled={!hydrated || busy} onClick={() => setConfirming("clear")}>
              Clear all reads
            </button>
          )}
          {cleared ? <span className={styles.line}>{cleared}</span> : null}
        </div>
      </section>
    </div>
  );
}

function PersonRow({ row, nameOf }: { row: IntakeRow; nameOf: (id: string | null) => string }) {
  const now = row.now.programmeId ? `On ${nameOf(row.now.programmeId)}` : (own(OUTCOME, row.now.outcome) ?? row.now.outcome);
  return (
    <li className={styles.person}>
      <div className={styles.personHead}>
        <strong>{row.name}</strong>
        <span className={styles.line}>
          {now} → <strong>{nameOf(row.plan)}</strong>
          {row.hasRead ? "" : " · not read by Claude"}
        </span>
      </div>
      <ol className={styles.ranked}>
        {row.ranked.map((entry) => (
          <li key={entry.programmeId}>
            {entry.shortName}: {own(STANDING, entry.standing) ?? entry.standing}
            {entry.lean ? `, Claude ${entry.lean}` : ""}
            {entry.score !== null ? `, score ${entry.score.toFixed(1)}` : ""}
            {entry.facilitates ? ", would facilitate" : ""}
          </li>
        ))}
      </ol>
      {row.claudeWhy ? <p className={styles.why}>Claude: {row.claudeWhy}</p> : null}
      {row.held ? <p className={styles.held}>{row.held}</p> : null}
      {row.ops.length > 0 ? (
        <p className={styles.line}>
          Apply would{" "}
          {row.ops
            .map((op) =>
              op.decision === "accept"
                ? `accept on ${nameOf(op.programmeId)}`
                : `pool on ${nameOf(op.programmeId)} (${op.poolReason === "better-fit" ? "better fit" : "capacity"})`,
            )
            .join(", then ")}
          .
        </p>
      ) : null}
    </li>
  );
}
