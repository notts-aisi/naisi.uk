import "server-only";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { NamingProgramme } from "@/lib/courses/programmeLead";
import type { GuideWeeksReader } from "./guide";
import { WEEK_HISTORY_SUBCOLLECTION, WEEK_LOCK_SUBCOLLECTION } from "@/lib/courses/weekEdit/paths";
import { applyStep, breakLabelOf, finalSources, planKeyOf, touchedAddresses, type PlanStep, type StepProblem } from "./model";
import {
  EMPTY_ADDRESS,
  docHolds,
  judgeChange,
  lockIsLive,
  readDone,
  runOf,
  standingOf,
  standingRefusal,
  stillNames,
  storedPlan,
  type AddressHolds,
} from "./facts";
import {
  BREAK_LABEL_PROBLEM,
  CANNOT_MOVE,
  MOVED,
  NOT_NAMED,
  NO_SUCH_ENTRY,
  PLAN_FULL,
  PLAN_STALE,
  RUN_GONE,
  breakAddedWords,
  breakRemovedWords,
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
  step: PlanStep,
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
      const applied = applyStep(plan, step);
      if (!applied.ok) {
        const [status, error] = PROBLEM[applied.why];
        throw new Refusal(error, status);
      }
      const change = applied.change;
      const touched = touchedAddresses(change);

      const weekSnap = await tx.get(weeks);
      const docs = new Map(weekSnap.docs.map((doc) => [doc.id, (doc.data() ?? {}) as Record<string, unknown>] as const));
      const stored = new Map<string, Stored>();
      await Promise.all(
        touched.map(async (address) => {
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

      const [{ done, anybodyOnRun, ownCalendars, told }, guideWeeks] = await Promise.all([
        readDone(db, run, naming, tx),
        guideWeeksOf(run.courseId, tx),
      ]);
      const refusal = judgeChange({ standing: told ? "gone-out" : standing, done, anybodyOnRun, guideWeeks, ownCalendars, holds }, change);
      if (refusal) throw new Refusal(refusal, 409);

      // ---- The writes ----
      const ref = (address: string): DocumentReference => weeks.doc(address);
      for (const [address, final] of finalSources(change)) {
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
      const moved = new Set(touched);
      for (const week of change.weeks) {
        if (moved.has(week.target)) continue;
        const doc = docs.get(week.target);
        if (doc && doc.weekNumber !== week.weekNumber) tx.update(ref(week.target), { weekNumber: week.weekNumber });
      }
      tx.update(runRef, { weekPlan: change.plan, updatedAt: FieldValue.serverTimestamp() });

      if (step.kind === "add-week") {
        const added = change.weeks[change.weeks.length - 1];
        return { ok: true, message: weekAddedWords(added.weekNumber, docs.has(added.target) && !moved.has(added.target)) };
      }
      if (step.kind === "add-break") return { ok: true, message: breakAddedWords(breakLabelOf(step.label), step.afterWeek) };
      if (step.kind === "move") return { ok: true, message: MOVED };
      if (change.removed) return { ok: true, message: weekRemovedWords(change.removed.weekNumber) };
      const gone = plan[step.index];
      return { ok: true, message: breakRemovedWords(gone && gone.kind === "break" ? gone.label : "The break") };
    });
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}
