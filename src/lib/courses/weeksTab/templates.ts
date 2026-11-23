import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import {
  COURSE_TEMPLATES_COLLECTION,
  normalizeCourseTemplate,
  templateRowOrder,
  toTemplateRow,
  type CourseTemplateRow,
} from "@/lib/firestore/courseTemplates";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import { templateWeekIsEmpty } from "./fill";

/**
 * THE SAVED TEMPLATES OF A RUN'S COURSE, for "Copy weeks from the course" on
 * a programme's Weeks tab: the programme's lead and admins, after
 * `loadProgrammeRun` has admitted them.
 *
 * The same rows `GET /api/courses/[courseId]/templates` lists (one equality
 * on `courseId`, newest first, `templateRowOrder`), each with the name of
 * whoever saved it as the reader is shown names (`nameForViewer`: staff see
 * full names), read from their account where it still stands and from the
 * name stored on the template otherwise, the day it was saved, and its count
 * of weeks: the weeks that hold something (`templateWeekIsEmpty`), the same
 * weeks Copy it in would write, so an empty page saved with the term is not
 * counted. A template keeps no week plan, so there is no break to count.
 *
 * Nothing in a template is anybody's work: its weeks are authored content,
 * and its evidence is three counts (`TemplateRetrospective`).
 */

/** One course's templates listed, at most: the route's own ceiling. */
const MAX_TEMPLATES = 200;

export type TemplateListRow = {
  id: string;
  label: string;
  /** "Mon 19 Oct", or null for a template with no saved time. */
  savedOn: string | null;
  /** Who saved it, by the names rule for the reader. */
  savedBy: string;
  weeks: number;
};

/** The course's templates as the route lists them: one equality on one field, so no declared index. */
export async function courseTemplateRows(db: Firestore, courseId: string): Promise<CourseTemplateRow[]> {
  if (!courseId) return [];
  const snap = await db.collection(COURSE_TEMPLATES_COLLECTION).where("courseId", "==", courseId).limit(MAX_TEMPLATES).get();
  return snap.docs.map((doc) => toTemplateRow(normalizeCourseTemplate(doc.id, doc.data() ?? {}))).sort(templateRowOrder);
}

/** The rows the page draws, newest first. */
export async function loadTemplateList(db: Firestore, courseId: string, viewer: NameViewer): Promise<TemplateListRow[]> {
  const rows = await courseTemplateRows(db, courseId);
  const uids = [...new Set(rows.map((row) => row.savedByUid).filter((uid) => uid !== ""))];
  const accounts = uids.length > 0 ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
  // Each template's weeks, to count the ones that hold something: one list per template, a handful per course.
  const counts = await Promise.all(
    rows.map(async (row) => {
      const weeks = await db.collection(COURSE_TEMPLATES_COLLECTION).doc(row.id).collection("weeks").get();
      return weeks.docs.filter((doc) => !templateWeekIsEmpty((doc.data() ?? {}) as Record<string, unknown>)).length;
    }),
  );
  const names = new Map<string, string>();
  for (const snap of accounts) {
    if (snap.exists) names.set(snap.id, nameForViewer(viewer, accountNamesOf(snap.data() ?? {}), ""));
  }
  return rows.map((row, i) => {
    const at = row.savedAt ? new Date(row.savedAt) : null;
    const day = at && !Number.isNaN(at.getTime()) ? dayWords(londonDateKey(at)) : "";
    return {
      id: row.id,
      label: row.label.trim() || "A template with no name",
      savedOn: day || null,
      savedBy: names.get(row.savedByUid) || row.savedByName.trim() || "NAISI member",
      weeks: counts[i],
    };
  });
}
