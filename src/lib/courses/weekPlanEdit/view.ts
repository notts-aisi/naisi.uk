import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { dayRangeWords } from "@/lib/courses/sessionChange/words";
import { WEEK_HISTORY_SUBCOLLECTION, WEEK_LOCK_SUBCOLLECTION } from "@/lib/courses/weekEdit/paths";
import { addDaysToKey, isValidDateKey } from "@/lib/courses/weekPlan";
import { weekDocId, type WeekPlanEntry } from "@/lib/firestore/courses";
import { guideWeeksOf } from "./guide";
import { MAX_PLAN_ENTRIES, applyStep, planHasDrifted, planKeyOf, type PlanChange, type PlanStep } from "./model";
import {
  EMPTY_ADDRESS,
  docHolds,
  judgeChange,
  judgeMatch,
  judgePutBack,
  judgeRemoveLeft,
  leftBehindOf,
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
import {
  ADD_BREAK_HINT,
  ADD_ONLY_LINE,
  FIRST_SESSIONS_MOVE,
  NOBODY_EMAILED,
  OUT_OF_STEP_LINE,
  PLAN_CAN_CHANGE,
  PLAN_FULL,
  PUBLIC_PAGES_CHANGE,
  addBreakHintOwnCalendars,
  breakDaysWords,
} from "./words";

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
 * pressing it says why, as the design does for a week with blocks in it.
 * While weeks and breaks stay where they are for the whole run, no move and
 * no removal is offered at all, and the sentence under the list says why.
 *
 * A PLAN OUT OF STEP with its pages offers no step at all but Match the plan
 * to the pages, with the line saying why. A page after the plan's last week
 * is listed under the plan with what can be done with it: put back as the
 * next week, removed when it holds no more than its title and settings and
 * nothing is kept, or the sentence that says how to reach it.
 */

/** What pressing "Remove…" does: asks first, or says why it cannot. */
export type RemovalOffer = { ask: true } | { refusal: string };

/**
 * What a move or a removal changes that people outside the plan will notice,
 * said in its question: every group's first session, once decision day has
 * begun (week 1 starts a week earlier or later), and the course's public week
 * pages, when this run is the course's showcase and a week's number changes.
 * Empty when neither: a move then needs no question.
 */
export type Notices = string[];

type Shared = { up: boolean; down: boolean; remove: RemovalOffer | null; laterWeeks: boolean; upNotices: Notices; downNotices: Notices; removeNotices: Notices };

export type PlanEntryView =
  | ({ kind: "week"; index: number; weekNumber: number; weekId: string; title: string; hasPage: boolean } & Shared)
  | ({ kind: "break"; index: number; label: string; range: string } & Shared);

/** A page after the plan's last week, and what can be done with it here. */
export type LeftBehindView = {
  address: string;
  title: string;
  /** The week it would be put back as, or why it cannot be put back here. */
  putBack: { weekNumber: number } | { sentence: string };
  remove: boolean;
};

export type WeekPlanView = {
  runId: string;
  planKey: string;
  entries: PlanEntryView[];
  addWeek: boolean;
  /** The weeks a break can go after, with the form's hint; null when no break can be added. */
  addBreak: { afterWeeks: number[]; hint: string } | null;
  /** The plan is out of step with its pages: the one control is Match the plan to the pages. */
  matchPages: boolean;
  leftBehind: LeftBehindView[];
  /** The sentence under the list. */
  line: string;
  anybodyOnRun: boolean;
};

/** The place in the plan of its first week, or -1. */
function firstWeekIndex(plan: readonly WeekPlanEntry[]): number {
  return plan.findIndex((entry) => entry.kind === "week");
}

/** What a change says in its question beyond itself (`Notices`). */
export function noticesOf(
  plan: readonly WeekPlanEntry[],
  change: PlanChange,
  context: { decisionDayBegun: boolean; showcase: boolean },
): Notices {
  const out: Notices = [];
  if (context.decisionDayBegun && firstWeekIndex(plan) !== -1 && firstWeekIndex(plan) !== firstWeekIndex(change.plan)) out.push(FIRST_SESSIONS_MOVE);
  if (context.showcase && (change.renumbered.length > 0 || change.removed !== null)) out.push(PUBLIC_PAGES_CHANGE);
  if (out.length > 0) out.push(NOBODY_EMAILED);
  return out;
}

export async function loadWeekPlanView(db: Firestore, runId: string, now: Date = new Date()): Promise<WeekPlanView | null> {
  const runRef = db.collection("courseRuns").doc(runId);
  const [runSnap, naming] = await Promise.all([runRef.get(), namingOf(db, runId)]);
  const raw = runSnap.exists ? ((runSnap.data() ?? {}) as Record<string, unknown>) : undefined;
  const run = runOf(runId, raw);
  if (!run || !raw || !naming) return null;
  const plan = storedPlan(raw);
  const stamped = standingOf(raw, run);
  const drifted = planHasDrifted(plan);

  const weeks = runRef.collection("weeks");
  const weekSnap = await weeks.get();
  const docs = new Map(weekSnap.docs.map((doc) => [doc.id, (doc.data() ?? {}) as Record<string, unknown>] as const));
  const left = drifted ? [] : leftBehindOf(plan, docs.keys());

  // Every address a step could touch: the plan's own, each number's, the pages after its last week and the next one.
  const weeksInPlan = plan.filter((entry) => entry.kind === "week").length;
  const addresses = new Set<string>(left);
  for (const entry of plan) if (entry.kind === "week") addresses.add(entry.weekId);
  for (let n = 1; n <= Math.min(weeksInPlan + 1, MAX_PLAN_ENTRIES); n += 1) addresses.add(weekDocId(n));

  const [done, guideWeeks, under, courseSnap] = await Promise.all([
    stamped === "open"
      ? readDone(db, run, naming)
      : Promise.resolve({ done: null, anybodyOnRun: true, ownCalendars: [] as string[], told: false, decisionDayBegun: true }),
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
    run.courseId ? db.collection("courses").doc(run.courseId).get() : Promise.resolve(null),
  ]);
  const counted = new Map(under);
  const holds = (address: string): AddressHolds => {
    const below = counted.get(address);
    const base = { ...EMPTY_ADDRESS, ...docHolds(docs.get(address)) };
    if (!below) return base;
    return { ...base, history: below.history, locks: below.locks.length, liveLock: below.locks.some((lock) => lockIsLive(lock, now)) };
  };
  const standing = done.told ? "gone-out" : stamped;
  const facts: PlanFacts = {
    standing,
    drifted,
    decisionDayBegun: done.decisionDayBegun,
    done: done.done,
    anybodyOnRun: done.anybodyOnRun,
    ownCalendars: done.ownCalendars,
    guideWeeks,
    holds,
  };
  // The course's public week pages read this run when it is the course's showcase and out of draft.
  const showcase = courseSnap?.exists === true && courseSnap.get("showcaseRunId") === run.id && run.status !== "draft" && !run.archived;
  const context = { decisionDayBegun: facts.decisionDayBegun, showcase };
  const tryStep = (step: PlanStep): { refusal: string | null; notices: Notices } => {
    const applied = applyStep(plan, step);
    if (!applied.ok) return { refusal: "", notices: [] };
    return { refusal: judgeChange(facts, applied.change), notices: noticesOf(plan, applied.change, context) };
  };

  const closed = standingRefusal(standing) !== null || drifted || facts.done !== null;
  const start = isValidDateKey(run.startDate) ? run.startDate : null;
  let weekNumber = 0;
  let offered = false;
  const entries: PlanEntryView[] = plan.map((entry, index) => {
    const upStep = !closed && index > 0 ? tryStep({ kind: "move", index, direction: "up" }) : null;
    const downStep = !closed && index < plan.length - 1 ? tryStep({ kind: "move", index, direction: "down" }) : null;
    const removeStep = closed ? null : tryStep({ kind: "remove", index });
    const up = upStep?.refusal === null;
    const down = downStep?.refusal === null;
    const remove: RemovalOffer | null =
      removeStep === null ? null : removeStep.refusal === null ? { ask: true } : removeStep.refusal ? { refusal: removeStep.refusal } : null;
    if (up || down || (remove && "ask" in remove)) offered = true;
    const shared: Shared = {
      up,
      down,
      remove,
      laterWeeks: plan.slice(index + 1).some((later) => later.kind === "week"),
      upNotices: up ? (upStep?.notices ?? []) : [],
      downNotices: down ? (downStep?.notices ?? []) : [],
      removeNotices: remove && "ask" in remove ? (removeStep?.notices ?? []) : [],
    };
    if (entry.kind === "break") {
      const from = start ? addDaysToKey(start, index * 7) : null;
      const range = from ? breakDaysWords(dayRangeWords(from, addDaysToKey(from, 6))) : breakDaysWords("");
      return { kind: "break", index, label: entry.label, range, ...shared };
    }
    weekNumber += 1;
    const address = weekDocId(weekNumber);
    const held = docHolds(docs.get(address));
    return { kind: "week", index, weekNumber, weekId: address, title: held.title, hasPage: held.exists, ...shared };
  });

  const addWeek = !drifted && tryStep({ kind: "add-week" }).refusal === null;
  const afterWeeks: number[] = [];
  if (!drifted) {
    for (let n = 1; n <= weeksInPlan; n += 1) {
      if (tryStep({ kind: "add-break", afterWeek: n, label: "Break" }).refusal === null) afterWeeks.push(n);
    }
  }
  const hint = facts.ownCalendars.length > 0 ? addBreakHintOwnCalendars(facts.ownCalendars) : ADD_BREAK_HINT;

  const leftBehind: LeftBehindView[] =
    standingRefusal(standing) !== null
      ? []
      : left.map((address) => {
          const refusal = judgePutBack(facts, plan, address);
          return {
            address,
            title: docHolds(docs.get(address)).title,
            putBack: refusal === null ? { weekNumber: weeksInPlan + 1 } : { sentence: refusal },
            remove: judgeRemoveLeft(facts, plan, address) === null,
          };
        });

  const matchPages = drifted && judgeMatch(facts) === null;
  const line =
    standingRefusal(standing) ??
    (drifted ? OUT_OF_STEP_LINE : (facts.done ?? (offered ? PLAN_CAN_CHANGE : addWeek || afterWeeks.length > 0 ? ADD_ONLY_LINE : PLAN_FULL)));

  return {
    runId: run.id,
    planKey: planKeyOf(plan),
    entries,
    addWeek,
    addBreak: afterWeeks.length > 0 ? { afterWeeks, hint } : null,
    matchPages,
    leftBehind,
    line,
    anybodyOnRun: facts.anybodyOnRun,
  };
}
