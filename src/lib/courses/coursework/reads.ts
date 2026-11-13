import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveWeekDocs } from "@/lib/courses/groupResolve";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import { courseworkWeekOf, type CourseworkWeek } from "./model";

/**
 * THE READS EVERY COURSEWORK PAGE SHARES, on the server, each after its
 * caller's own gate: the Coursework tab and one person's week on the
 * programme's side (`./load.ts`), and one person's week on the facilitator's
 * side (`./readingLoad.ts`). Nothing here decides who may read anything.
 */

/** Names on accounts, by uid, as `viewer` is shown them (the names rule), as the lead's tabs name people. */
export async function namesOf(db: Firestore, uids: readonly string[], viewer: NameViewer): Promise<Map<string, string>> {
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const docs = await db.getAll(...unique.map((uid) => db.collection("users").doc(uid)));
  return new Map(
    docs
      .filter((doc) => doc.exists)
      .map((doc) => [doc.id, nameForViewer(viewer, accountNamesOf(doc.data() ?? {}), "NAISI member")] as const),
  );
}

/** The weeks of the run's plan written as blocks, week 1 first: the tab's columns, and the weeks a person's page steps through. */
export function columnsOf(run: CourseRunDoc, runWeeks: ReadonlyMap<number, CourseworkWeek | null>): Array<{ weekNumber: number; title: string }> {
  return run.weekPlan
    .flatMap((entry) => (entry.kind === "week" ? [entry.weekNumber] : []))
    .filter((weekNumber, index, all) => all.indexOf(weekNumber) === index)
    .sort((a, b) => a - b)
    .flatMap((weekNumber) => {
      const week = runWeeks.get(weekNumber);
      return week ? [{ weekNumber, title: week.title }] : [];
    });
}

/** Every week a group reads (its own copy over the run's), or the run's own for `null`, by week number. */
export async function weeksRead(db: Firestore, runId: string, groupId: string | null): Promise<Map<number, CourseworkWeek | null>> {
  const entries = await resolveWeekDocs(db, runId, groupId);
  return new Map(entries.map((entry) => [entry.week.weekNumber, courseworkWeekOf(entry.week)] as const));
}
