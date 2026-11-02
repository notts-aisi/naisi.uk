import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { weekDocId } from "./courses";

/**
 * `checkInWeeks/{runId}__w03`: EACH WEEK OF A PROGRAMME'S CHECK-INS, AS IT
 * FIRST SHOWED THE PROGRAMME'S LEAD (docs/surveys.md, "Check-ins at the end of
 * a session"). One document per course run and week, holding the ids of the
 * week's check-ins at the moment the week was first whole: every session of it
 * that can have a check-in past its check-in time, and none of its check-ins
 * open.
 *
 * A WEEK'S CHECK-INS ARE FIXED WHEN IT FIRST SHOWS. The lead's Check-ins view
 * and the Overview read a week only once it has one of these, and then only
 * the check-ins it names (`readProgrammeCheckIns`). A check-in opened for that
 * week afterwards, because a group's session was dated or moved later, never
 * joins it: an admin's row for it says so, and the lead's week stays as it
 * first showed.
 *
 * WRITTEN ONLY BY THE SCHEDULER, by the `surveys-check-in-weeks` job
 * (`freezeWholeWeeks` in `src/lib/surveys/checkIns/weeks.ts`), with
 * `.create()`: a week is fixed once, by whichever tick gets there first, and
 * nothing changes it afterwards. No page and no GET route writes it. Read only
 * on the server; the rules block is deny-all, admins included.
 *
 * WHAT TAKES IT AWAY: the run's destroy (`src/lib/firestore/courseDeletion.ts`,
 * by `runId`), with the run it belongs to. It holds survey ids, a run and a
 * week, and nothing about a person, so an account's deletion has nothing of
 * it to find, and names coming off a check-in leave it too.
 */

export const CHECK_IN_WEEKS_COLLECTION = "checkInWeeks";

export type CheckInWeekDoc = {
  /** `{runId}__w03` (`checkInWeekId`). */
  id: string;
  runId: string;
  weekNumber: number;
  /** The week's check-ins, by survey id, as they were when it was fixed. Empty when no group had opened one. */
  surveyIds: string[];
  /** When the job fixed it. */
  frozenAt: Date | null;
};

/** A week's record, by its run and its number: `{runId}__w03`, the week's own doc id after the run's. */
export function checkInWeekId(runId: string, weekNumber: number): string {
  return `${runId}__${weekDocId(weekNumber)}`;
}

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

export function normalizeCheckInWeek(id: string, data: Raw): CheckInWeekDoc {
  const weekNumber = typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) ? data.weekNumber : 0;
  const surveyIds = Array.isArray(data.surveyIds)
    ? [...new Set(data.surveyIds.filter((value): value is string => typeof value === "string" && value !== ""))]
    : [];
  return {
    id,
    runId: typeof data.runId === "string" ? data.runId : "",
    weekNumber,
    surveyIds,
    frozenAt: tsToDate(data.frozenAt),
  };
}

/**
 * Every fixed week of a run, by its number: one equality on `runId`. A record
 * that names another run, or no week, is not one of them.
 */
export async function readCheckInWeeks(db: Firestore, runId: string): Promise<Map<number, CheckInWeekDoc>> {
  const out = new Map<number, CheckInWeekDoc>();
  if (!runId || runId.includes("/")) return out;
  const snap = await db.collection(CHECK_IN_WEEKS_COLLECTION).where("runId", "==", runId).get();
  for (const doc of snap.docs) {
    const week = normalizeCheckInWeek(doc.id, (doc.data() ?? {}) as Raw);
    if (week.runId !== runId || week.weekNumber < 1 || doc.id !== checkInWeekId(runId, week.weekNumber)) continue;
    out.set(week.weekNumber, week);
  }
  return out;
}

/** Whether a write failed because the document is already there. */
function alreadyThere(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === 6 || e?.code === "already-exists" || (typeof e?.message === "string" && e.message.includes("ALREADY_EXISTS"));
}

/**
 * FIX ONE WEEK: create its record with these check-ins. True when this call
 * made it; false when the week was fixed already, by an earlier tick or by
 * one running beside this one, whose record stands as it is.
 */
export async function createCheckInWeek(db: Firestore, runId: string, weekNumber: number, surveyIds: readonly string[]): Promise<boolean> {
  try {
    await db
      .collection(CHECK_IN_WEEKS_COLLECTION)
      .doc(checkInWeekId(runId, weekNumber))
      .create({ runId, weekNumber, surveyIds: [...surveyIds], frozenAt: FieldValue.serverTimestamp() });
    return true;
  } catch (err) {
    if (alreadyThere(err)) return false;
    throw err;
  }
}
