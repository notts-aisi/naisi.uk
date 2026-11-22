import "server-only";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { NamingProgramme } from "@/lib/courses/programmeLead";
import type { GuideWeeksReader } from "./guide";
import { WEEK_HISTORY_SUBCOLLECTION, WEEK_LOCK_SUBCOLLECTION } from "@/lib/courses/weekEdit/paths";
import { weekDocId } from "@/lib/firestore/courses";
import {
  applyStep,
  breakLabelOf,
  finalSources,
  matchedPlan,
  planHasDrifted,
  planKeyOf,
  touchedAddresses,
  type PlanAction,
  type PlanChange,
  type StepProblem,
} from "./model";
import {
  EMPTY_ADDRESS,
  docHolds,
  judgeChange,
  judgeMatch,
  judgePutBack,
  judgeRemoveLeft,
  lockIsLive,
  readDone,
  runOf,
  standingOf,
  standingRefusal,
  stillNames,
  storedPlan,
  type AddressHolds,
  type PlanFacts,
} from "./facts";
import {
  BREAK_LABEL_PROBLEM,
  CANNOT_MOVE,
  LEFT_REMOVED,
  MATCHED,
  MOVED,
  NOT_NAMED,
  NO_SUCH_ENTRY,
  PLAN_FULL,
  PLAN_STALE,
  RUN_GONE,
  breakAddedWords,
  breakRemovedWords,
  putBackDoneWords,
  weekAddedWords,
  weekRemovedWords,
} from "./words";

/**
 * ONE STEP OF A RUN'S WEEK PLAN, TAKEN IN ONE TRANSACTION
 * (`POST /api/courses/runs/[runId]/week-plan`, after its gate).
 *
 * Read in the transaction, so a change that lands first makes it run again:
 * the run, that the programme still names it, the run's weeks, what every
 * touched address holds under it (its saved versions and its edit lock),
 * everything the owner's rule asks (`readDone`) and the guide's week numbers
 * (handed in by the route, `./guide.ts`, so this module never reaches the
 * guide's store).
 * Then `judgeChange`, the judgement the page asked, and only then the writes:
 *
 *  - each touched address is given exactly what its new week's address held
 *    (`finalSources`): the week's document as stored, every field kept, with
 *    the week number it now carries, and every saved version under it with
 *    its own id; whatever the address held that does not belong there is
 *    deleted, and every edit lock under it is let go (a live one refuses the
 *    whole step first);
 *  - a removed week's address is emptied only when the judgement found it
 *    holding no more than its title and settings and no saved version;
 *  - a week left where it was whose stored number is not its number is given
 *    its number;
 *  - the run's plan, each week's `weekId` its own number's address.
 *
 * Matching a plan to its pages writes the plan alone. Removing a page left
 * after the plan's last week deletes that page and its lock, and nothing
 * else. Putting one back adds a week at the end, its page moved there with
 * everything under it when it sat further on.
 *
 * Nothing else is written, the facilitators' guide never, and nobody is
 * emailed.
 */

export type PlanAnswer = { ok: true; message: string } | { ok: false; status: 400 | 404 | 409; error: string };

class Refusal extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

const PROBLEM: Record<StepProblem, [400 | 409, string]> = {
  "no-such-entry": [409, NO_SUCH_ENTRY],
  "no-such-week": [409, NO_SUCH_ENTRY],
  "cannot-move": [400, CANNOT_MOVE],
  full: [409, PLAN_FULL],
  label: [400, BREAK_LABEL_PROBLEM],
};

type Stored = { doc: Record<string, unknown> | undefined; history: Map<string, Record<string, unknown>>; locks: Map<string, Record<string, unknown>> };

function sizeOf(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

export async function changeWeekPlan(
  db: Firestore,
  runId: string,
  naming: NamingProgramme,
  step: PlanAction,
  planKey: string,
  guideWeeksOf: GuideWeeksReader,
  now: Date = new Date(),
): Promise<PlanAnswer> {
  const runRef = db.collection("courseRuns").doc(runId);
  const weeks = runRef.collection("weeks");
  try {
    return await db.runTransaction(async (tx): Promise<PlanAnswer> => {
      const runSnap = await tx.get(runRef);
      const raw = runSnap.exists ? ((runSnap.data() ?? {}) as Record<string, unknown>) : undefined;
      const run = runOf(runId, raw);
      if (!run || !raw) throw new Refusal(RUN_GONE, 404);
      if (!(await stillNames(db, naming, runId, tx))) throw new Refusal(NOT_NAMED, 409);
      const standing = standingOf(raw, run);
      const closed = standingRefusal(standing);
      if (closed) throw new Refusal(closed, 409);

      const plan = storedPlan(raw);
      if (planKeyOf(plan) !== planKey) throw new Refusal(PLAN_STALE, 409);
      const taught = plan.filter((entry) => entry.kind === "week").length;

      // The change, worked out before anything else is read. A page put back
      // is Add a week with that page as the new week's own: taken as it
      // stands at the next address, or moved there from further on.
      let change: PlanChange | null = null;
      if (step.kind === "put-back") {
        const added = applyStep(plan, { kind: "add-week" });
        if (!added.ok) throw new Refusal(PROBLEM[added.why][1], PROBLEM[added.why][0]);
        const last = added.change.weeks[added.change.weeks.length - 1];
        change = {
          ...added.change,
          weeks: [...added.change.weeks.slice(0, -1), { ...last, source: step.address === last.target ? null : step.address }],
        };
      } else if (step.kind !== "match-pages" && step.kind !== "remove-left") {
        const applied = applyStep(plan, step);
        if (!applied.ok) {
          const [status, error] = PROBLEM[applied.why];
          throw new Refusal(error, status);
        }
        change = applied.change;
      }
      const touched =
        step.kind === "remove-left" ? [step.address] : step.kind === "put-back" ? [step.address, weekDocId(taught + 1)] : change ? touchedAddresses(change) : [];

      const weekSnap = await tx.get(weeks);
      const docs = new Map(weekSnap.docs.map((doc) => [doc.id, (doc.data() ?? {}) as Record<string, unknown>] as const));
      const stored = new Map<string, Stored>();
      await Promise.all(
        [...new Set(touched)].map(async (address) => {
          const [history, locks] = await Promise.all([
            tx.get(weeks.doc(address).collection(WEEK_HISTORY_SUBCOLLECTION)),
            tx.get(weeks.doc(address).collection(WEEK_LOCK_SUBCOLLECTION)),
          ]);
          stored.set(address, {
            doc: docs.get(address),
            history: new Map(history.docs.map((doc) => [doc.id, (doc.data() ?? {}) as Record<string, unknown>] as const)),
            locks: new Map(locks.docs.map((doc) => [doc.id, (doc.data() ?? {}) as Record<string, unknown>] as const)),
          });
        }),
      );
      const holds = (address: string): AddressHolds => {
        const at = stored.get(address);
        const doc = at?.doc ?? docs.get(address);
        if (!at) return { ...EMPTY_ADDRESS, ...docHolds(doc) };
        return {
          ...docHolds(doc),
          history: at.history.size,
          locks: at.locks.size,
          liveLock: [...at.locks.values()].some((lock) => lockIsLive(lock, now)),
          bytes: sizeOf(doc) + [...at.history.values()].reduce((sum, record) => sum + sizeOf(record), 0),
        };
      };

      const [{ done, anybodyOnRun, ownCalendars, told, decisionDayBegun }, guideWeeks] = await Promise.all([
        readDone(db, run, naming, tx),
        guideWeeksOf(run.courseId, tx),
      ]);
      const facts: PlanFacts = {
        standing: told ? "gone-out" : standing,
        drifted: planHasDrifted(plan),
        decisionDayBegun,
        done,
        anybodyOnRun,
        guideWeeks,
        ownCalendars,
        holds,
      };
      const refusal =
        step.kind === "match-pages"
          ? judgeMatch(facts)
          : step.kind === "put-back"
            ? judgePutBack(facts, plan, step.address)
            : step.kind === "remove-left"
              ? judgeRemoveLeft(facts, plan, step.address)
              : judgeChange(facts, change as PlanChange);
      if (refusal) throw new Refusal(refusal, 409);

      // ---- The writes ----
      const ref = (address: string): DocumentReference => weeks.doc(address);
      if (step.kind === "match-pages") {
        // The plan's addresses rewritten to the pages people see: no page moves, nothing is deleted.
        tx.update(runRef, { weekPlan: matchedPlan(plan), updatedAt: FieldValue.serverTimestamp() });
        return { ok: true, message: MATCHED };
      }
      if (step.kind === "remove-left") {
        // Only a page with no more than its title and settings and no saved version (`judgeRemoveLeft`).
        tx.delete(ref(step.address));
        for (const id of stored.get(step.address)?.locks.keys() ?? []) tx.delete(ref(step.address).collection(WEEK_LOCK_SUBCOLLECTION).doc(id));
        return { ok: true, message: LEFT_REMOVED };
      }
      const made = change as PlanChange;
      for (const [address, final] of finalSources(made)) {
        const here = stored.get(address);
        const from = final.from ? stored.get(final.from) : undefined;
        const doc = from?.doc;
        if (doc) tx.set(ref(address), { ...doc, weekNumber: final.weekNumber });
        else if (here?.doc) tx.delete(ref(address));
        const history = from?.history ?? new Map<string, Record<string, unknown>>();
        for (const id of here?.history.keys() ?? []) {
          if (!history.has(id)) tx.delete(ref(address).collection(WEEK_HISTORY_SUBCOLLECTION).doc(id));
        }
        for (const [id, record] of history) tx.set(ref(address).collection(WEEK_HISTORY_SUBCOLLECTION).doc(id), record);
        for (const id of here?.locks.keys() ?? []) tx.delete(ref(address).collection(WEEK_LOCK_SUBCOLLECTION).doc(id));
      }
      // A week left where it was carries its own number.
      const moved = new Set(touchedAddresses(made));
      for (const week of made.weeks) {
        if (moved.has(week.target)) continue;
        const doc = docs.get(week.target);
        if (doc && doc.weekNumber !== week.weekNumber) tx.update(ref(week.target), { weekNumber: week.weekNumber });
      }
      tx.update(runRef, { weekPlan: made.plan, updatedAt: FieldValue.serverTimestamp() });

      if (step.kind === "put-back") return { ok: true, message: putBackDoneWords(taught + 1) };
      if (step.kind === "add-week") {
        const added = made.weeks[made.weeks.length - 1];
        return { ok: true, message: weekAddedWords(added.weekNumber, docs.has(added.target) && !moved.has(added.target)) };
      }
      if (step.kind === "add-break") return { ok: true, message: breakAddedWords(breakLabelOf(step.label), step.afterWeek) };
      if (step.kind === "move") return { ok: true, message: MOVED };
      if (made.removed) return { ok: true, message: weekRemovedWords(made.removed.weekNumber) };
      const gone = plan[step.index];
      return { ok: true, message: breakRemovedWords(gone && gone.kind === "break" ? gone.label : "The break") };
    });
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}
