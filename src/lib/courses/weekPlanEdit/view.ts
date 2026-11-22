import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { dayRangeWords } from "@/lib/courses/sessionChange/words";
import { WEEK_HISTORY_SUBCOLLECTION, WEEK_LOCK_SUBCOLLECTION } from "@/lib/courses/weekEdit/paths";
import { addDaysToKey, isValidDateKey } from "@/lib/courses/weekPlan";
import { weekDocId } from "@/lib/firestore/courses";
import { guideWeeksOf } from "./guide";
import { applyStep, planHasDrifted, planKeyOf, type PlanStep } from "./model";
import {
  EMPTY_ADDRESS,
  docHolds,
  judgeChange,
  lockIsLive,
  namingOf,
  readDone,
  runOf,
  standingOf,
  standingRefusal,
  storedPlan,
  type AddressHolds,
  type PlanFacts,
} from "./facts";
import { ADD_BREAK_HINT, DRIFTED_AND_DONE, PLAN_CAN_CHANGE, addBreakHintOwnCalendars, breakDaysWords } from "./words";

/**
 * THE WEEK PLAN AS THE WEEKS TAB DRAWS IT: every week and break of the run a
 * programme names, in order, and for each only the controls the route would
 * take right now, asked of the same judgement the route asks
 * (`judgeChange`), with the sentence under the list for where the run
 * stands. Read for an admin or the programme's lead, after the tab's own
 * gate. Nothing is written.
 *
 * A REMOVAL is offered with its question when the route would take it. A
 * week the route would never remove for what it holds (blocks, material
 * written before blocks, saved versions, something in the facilitators'
 * guide, an editor at work, too much to move) is offered "Remove…" too, and
 * pressing it says why, as the drawing does for a week with blocks in it.
 * While weeks and breaks stay where they are for the whole run, no move and
 * no removal is offered at all, and the sentence under the list says why.
 */

/** What pressing "Remove…" does: asks first, or says why it cannot. */
export type RemovalOffer = { ask: true } | { refusal: string };

export type PlanEntryView =
  | {
      kind: "week";
      index: number;
      weekNumber: number;
      weekId: string;
      title: string;
      hasPage: boolean;
      up: boolean;
      down: boolean;
      remove: RemovalOffer | null;
      laterWeeks: boolean;
    }
  | { kind: "break"; index: number; label: string; range: string; up: boolean; down: boolean; remove: RemovalOffer | null; laterWeeks: boolean };

export type WeekPlanView = {
  runId: string;
  planKey: string;
  entries: PlanEntryView[];
  addWeek: boolean;
  /** The weeks a break can go after, with the form's hint; null when no break can be added. */
  addBreak: { afterWeeks: number[]; hint: string } | null;
  /** The sentence under the list. */
  line: string;
  anybodyOnRun: boolean;
};

export async function loadWeekPlanView(db: Firestore, runId: string, now: Date = new Date()): Promise<WeekPlanView | null> {
  const runRef = db.collection("courseRuns").doc(runId);
  const [runSnap, naming] = await Promise.all([runRef.get(), namingOf(db, runId)]);
  const raw = runSnap.exists ? ((runSnap.data() ?? {}) as Record<string, unknown>) : undefined;
  const run = runOf(runId, raw);
  if (!run || !raw || !naming) return null;
  const plan = storedPlan(raw);
  const stamped = standingOf(raw, run);

  // Every address a step could touch: the plan's own and each number's.
  const weeksInPlan = plan.filter((entry) => entry.kind === "week").length;
  const addresses = new Set<string>();
  for (const entry of plan) if (entry.kind === "week") addresses.add(entry.weekId);
  for (let n = 1; n <= weeksInPlan; n += 1) addresses.add(weekDocId(n));

  const weeks = runRef.collection("weeks");
  const [weekSnap, done, guideWeeks, under] = await Promise.all([
    weeks.get(),
    stamped === "open" ? readDone(db, run, naming) : Promise.resolve({ done: null, anybodyOnRun: true, ownCalendars: [] as string[], told: false }),
    guideWeeksOf(db, run.courseId),
    Promise.all(
      [...addresses].map(async (address) => {
        const [history, locks] = await Promise.all([
          weeks.doc(address).collection(WEEK_HISTORY_SUBCOLLECTION).count().get(),
          weeks.doc(address).collection(WEEK_LOCK_SUBCOLLECTION).get(),
        ]);
        return [address, { history: history.data().count, locks: locks.docs.map((doc) => (doc.data() ?? {}) as Record<string, unknown>) }] as const;
      }),
    ),
  ]);
  const docs = new Map(weekSnap.docs.map((doc) => [doc.id, (doc.data() ?? {}) as Record<string, unknown>] as const));
  const counted = new Map(under);
  const holds = (address: string): AddressHolds => {
    const below = counted.get(address);
    const base = { ...EMPTY_ADDRESS, ...docHolds(docs.get(address)) };
    if (!below) return base;
    return { ...base, history: below.history, locks: below.locks.length, liveLock: below.locks.some((lock) => lockIsLive(lock, now)) };
  };
  const standing = done.told ? "gone-out" : stamped;
  const facts: PlanFacts = { standing, done: done.done, anybodyOnRun: done.anybodyOnRun, ownCalendars: done.ownCalendars, guideWeeks, holds };
  const judge = (step: PlanStep): string | null => {
    const applied = applyStep(plan, step);
    return applied.ok ? judgeChange(facts, applied.change) : "";
  };

  const closed = standingRefusal(standing) !== null || facts.done !== null;
  const start = isValidDateKey(run.startDate) ? run.startDate : null;
  let weekNumber = 0;
  const entries: PlanEntryView[] = plan.map((entry, index) => {
    const up = !closed && index > 0 && judge({ kind: "move", index, direction: "up" }) === null;
    const down = !closed && index < plan.length - 1 && judge({ kind: "move", index, direction: "down" }) === null;
    let remove: RemovalOffer | null = null;
    if (!closed) {
      const refusal = judge({ kind: "remove", index });
      remove = refusal === null ? { ask: true } : refusal ? { refusal } : null;
    }
    const laterWeeks = plan.slice(index + 1).some((later) => later.kind === "week");
    if (entry.kind === "break") {
      const from = start ? addDaysToKey(start, index * 7) : null;
      const range = from ? breakDaysWords(dayRangeWords(from, addDaysToKey(from, 6))) : breakDaysWords("");
      return { kind: "break", index, label: entry.label, range, up, down, remove, laterWeeks };
    }
    weekNumber += 1;
    const address = weekDocId(weekNumber);
    const held = docHolds(docs.get(address));
    return { kind: "week", index, weekNumber, weekId: address, title: held.title, hasPage: held.exists, up, down, remove, laterWeeks };
  });

  const addWeek = judge({ kind: "add-week" }) === null;
  const afterWeeks: number[] = [];
  for (let n = 1; n <= weeksInPlan; n += 1) {
    if (judge({ kind: "add-break", afterWeek: n, label: "Break" }) === null) afterWeeks.push(n);
  }
  const hint = facts.ownCalendars.length > 0 ? addBreakHintOwnCalendars(facts.ownCalendars) : ADD_BREAK_HINT;

  let line = standingRefusal(standing) ?? facts.done ?? PLAN_CAN_CHANGE;
  if (standing === "open" && facts.done !== null && planHasDrifted(plan)) line = DRIFTED_AND_DONE;

  return {
    runId: run.id,
    planKey: planKeyOf(plan),
    entries,
    addWeek,
    addBreak: afterWeeks.length > 0 ? { afterWeeks, hint } : null,
    line,
    anybodyOnRun: facts.anybodyOnRun,
  };
}
