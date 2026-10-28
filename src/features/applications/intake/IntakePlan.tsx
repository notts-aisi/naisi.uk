"use client";

import { useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { PlacementView } from "@/lib/applications/intake/placement";
import type { IntakeView } from "@/lib/applications/intake/run";
import styles from "./IntakePlan.module.css";
import PlacementBox from "./PlacementBox";

/**
 * Plan the intake, for an admin: the whole term on one page, in the order it
 * is done.
 *
 *  1. READ EVERYONE. The browser walks the applications with no read or no
 *     clean Pangram check, two at a time, through the same assessment route
 *     the review screen uses. Stop halts it after the two in hand.
 *  2. PLAN. Claude suggests a placement for everybody across every
 *     programme, kept with each application, and a facilitator shortlist.
 *  3. PLACEMENTS. Everybody as their Placement box shows them
 *     (`./PlacementBox.tsx`, the same box beside each application): pick for
 *     anybody, or press the one button that places everybody nobody has
 *     placed yet as suggested. That button never changes a decision a lead or
 *     an admin already made. Nobody is emailed: decision day does that.
 *
 * Clear all reads deletes every stored read, Pangram check and suggestion on
 * the form, so the term can be read again under the same instructions.
 */

type Sent = { ok: boolean; status: number; data: Record<string, unknown>; error: string };
type Progress = { done: number; total: number; failed: { name: string; reason: string }[]; stopped: string | null };
type Filter = "everyone" | "open" | "differs" | "flagged" | "fill";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "everyone", label: "Everyone" },
  { id: "open", label: "Not placed yet" },
  { id: "fill", label: "The button would place" },
  { id: "differs", label: "Suggestion differs" },
  { id: "flagged", label: "Pangram flagged" },
];

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

/** Where the decisions place somebody now, as the box compares it: a programme, "none", or null while a decision is owed. */
const nowOf = (person: PlacementView): string | null =>
  person.now.kind === "placed" ? person.now.programmeId : person.now.kind === "no-place" ? "none" : null;

function matches(person: PlacementView, filter: Filter): boolean {
  switch (filter) {
    case "open":
      return person.now.kind === "open";
    case "fill":
      return person.fill !== null && "ops" in person.fill;
    case "differs":
      return person.suggestion !== null && (person.suggestion.programmeId ?? "none") !== nowOf(person);
    case "flagged":
      return (person.flags ?? 0) > 0;
    default:
      return true;
  }
}

export default function IntakePlan({ roundId, initial }: { roundId: string; initial: IntakeView }) {
  const hydrated = useHydrated();
  const [view, setView] = useState<IntakeView>(initial);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [reading, setReading] = useState(false);
  const stop = useRef(false);
  const [confirming, setConfirming] = useState<"fill" | "clear" | null>(null);
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState<{ placed: number; left: { name: string; why: string }[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("everyone");
  const [cleared, setCleared] = useState<string | null>(null);

  const form = `/api/admissions/forms/${encodeURIComponent(roundId)}`;
  const people = view.people;
  const nameOfUid = new Map(people.map((p) => [p.uid, p.name] as const));
  const shortOf = new Map(view.programmes.map((p) => [p.id, p.shortName] as const));
  const busy = planning || reading || filling;

  const unread = people.filter((p) => !p.read.claude || !p.read.pangram);
  const needClaude = people.filter((p) => !p.read.claude).length;
  const needPangram = people.filter((p) => !p.read.pangram).length;
  const toFill = people.filter((p) => p.fill !== null && "ops" in p.fill);
  const shown = people.filter((p) => matches(p, filter));

  const plan = async (askClaude: boolean) => {
    setPlanning(true);
    setError(null);
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
      for (let person = queue.shift(); person && !stop.current; person = queue.shift()) {
        const url = `${form}/applications/${encodeURIComponent(person.uid)}/assessment`;
        const programmeId = person.choices[0]?.programmeId ?? null;
        try {
          if (!person.read.claude && !claudeOff) {
            const answer = await send(url, "POST", { part: "claude", programmeId });
            if (!answer.ok) {
              state.failed.push({ name: person.name, reason: `Claude: ${answer.error}` });
              if (answer.status === 409 || /refused this site/.test(answer.error)) {
                claudeOff = true;
                if (pangramOff || person.read.pangram) halt(`Claude: ${answer.error}`);
              }
            }
          }
          if (!person.read.pangram && !pangramOff) {
            const answer = await send(url, "POST", { part: "pangram", programmeId });
            const check = (answer.data.assessment as { pangram?: { failed?: { reason: string }[] } } | undefined)?.pangram;
            const reason = !answer.ok ? answer.error : (check?.failed?.[0]?.reason ?? null);
            if (reason) {
              state.failed.push({ name: person.name, reason: `Pangram: ${reason}` });
              if (answer.status === 409 || /no API credit|refused this site/.test(reason)) {
                pangramOff = true;
                if (claudeOff) halt(`Pangram: ${reason}`);
              }
            }
          }
        } catch {
          state.failed.push({ name: person.name, reason: "That couldn’t be sent. Check your connection." });
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

  const fill = async () => {
    setConfirming(null);
    setFilling(true);
    setError(null);
    setFilled(null);
    try {
      const answer = await send(`${form}/intake/fill`, "POST", {
        people: toFill.map((p) => ({ uid: p.uid, programmeId: p.suggestion?.programmeId ?? null })),
      });
      if (!answer.ok) {
        setError(answer.error);
      } else {
        const placed = Array.isArray(answer.data.placed) ? answer.data.placed.length : 0;
        const left = (Array.isArray(answer.data.left) ? (answer.data.left as { uid: string; why: string }[]) : []).map(
          (entry) => ({ name: nameOfUid.get(entry.uid) ?? entry.uid, why: entry.why }),
        );
        setFilled({ placed, left });
      }
    } catch {
      setError("That couldn’t be sent. Check your connection; anybody already placed stays placed.");
    } finally {
      setFilling(false);
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

  const replace = (next: PlacementView) =>
    setView((was) => ({ ...was, people: was.people.map((p) => (p.uid === next.uid ? { ...next, suggestion: p.suggestion } : p)) }));

  // Counts from the boxes, so a pick shows at once.
  const placedOn = (id: string) => people.filter((p) => p.now.kind === "placed" && p.now.programmeId === id).length;

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
          lean for every programme the person ranked. Pangram checks their long answers together in one request.{" "}
          {people.length - needClaude} of {people.length} read by Claude, {people.length - needPangram} checked by Pangram.
        </p>
        {unread.length > 0 && !reading ? (
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
          2. Plan
        </h2>
        <p className={styles.line}>
          Claude suggests a placement for everybody, across every programme, and who should facilitate. Decisions already
          made stand: it never suggests undoing a lead’s Accept, Pool or Decline. Its suggestions are kept with each
          application, so they show beside it too.
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
            Refresh
          </button>
          {planning ? <span className={styles.line}>Claude takes a minute or two.</span> : null}
        </div>

        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Programme</th>
                <th scope="col">Places</th>
                <th scope="col">Placed now</th>
                <th scope="col">Suggested</th>
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
                  <td className={programme.places !== null && placedOn(programme.id) > programme.places ? styles.over : undefined}>
                    {placedOn(programme.id)}
                  </td>
                  <td>{programme.suggested}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.claude?.notes ? <p className={styles.notes}>{view.claude.notes}</p> : null}

        {view.facilitators.length > 0 || view.shouldFacilitate.length > 0 ? (
          <div className={styles.facilitators}>
            {view.facilitators.length > 0 ? (
              <div>
                <h3 className={styles.subtitle}>Facilitators, from those who offered</h3>
                <ul className={styles.list}>
                  {view.facilitators.map((f) => (
                    <li key={`${f.uid}:${f.programmeId}`}>
                      <strong>{f.name}</strong> for {shortOf.get(f.programmeId) ?? "a programme"}
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
                      <strong>{f.name}</strong> for {shortOf.get(f.programmeId) ?? "a programme"}
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

      <section className={styles.panel} aria-labelledby="intake-placements">
        <h2 id="intake-placements" className={styles.title}>
          3. Placements
        </h2>
        <p className={styles.line}>
          Everybody, with where the decisions place them now and the plan’s suggestion. Pick for anybody: a pick that
          changes somebody else’s decision says whose first, and is recorded as yours. The button places only people
          nobody has placed yet, and never changes a decision already made. Nobody is emailed until decision day.
        </p>
        <div className={styles.actions}>
          {confirming === "fill" ? (
            <>
              <button type="button" className={styles.button} disabled={!hydrated || busy} onClick={() => void fill()}>
                Yes, place {toFill.length} {toFill.length === 1 ? "person" : "people"}
              </button>
              <button type="button" className={styles.quiet} onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.button}
              disabled={!hydrated || busy || toFill.length === 0}
              onClick={() => setConfirming("fill")}
            >
              {filling
                ? "Placing…"
                : toFill.length === 0
                  ? "Nobody left for the button to place"
                  : `Place the ${toFill.length} not yet placed as suggested`}
            </button>
          )}
        </div>
        {filled ? (
          <div className={styles.line} role="status">
            Placed {filled.placed}.{filled.left.length > 0 ? ` Left for you (${filled.left.length}):` : ""}
            {filled.left.length > 0 ? (
              <ul className={styles.list}>
                {filled.left.map((entry, i) => (
                  <li key={i}>
                    {entry.name}: {entry.why}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className={styles.filters} role="group" aria-label="Show">
          {FILTERS.map((each) => (
            <button
              key={each.id}
              type="button"
              aria-pressed={filter === each.id}
              className={filter === each.id ? `${styles.filter} ${styles.filterOn}` : styles.filter}
              onClick={() => setFilter(each.id)}
            >
              {each.label} ({people.filter((p) => matches(p, each.id)).length})
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className={styles.line}>Nobody here.</p>
        ) : (
          <div className={styles.people}>
            {shown.map((person) => (
              <PlacementBox key={person.uid} apiBase={form} view={person} compact onPlaced={replace} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.quietPanel} aria-labelledby="intake-clear">
        <h2 id="intake-clear" className={styles.subtitle}>
          Clear all reads
        </h2>
        <p className={styles.line}>
          Deletes every Claude read, Pangram check and suggestion on this form, so the whole term can be read again. The
          applications, scores, comments and decisions are untouched. Reading everyone again costs the credit above.
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
