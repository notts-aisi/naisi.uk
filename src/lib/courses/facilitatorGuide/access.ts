import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourse } from "@/lib/firestore/courses";

/**
 * WHO MAY READ A COURSE'S FACILITATOR GUIDE: the one gate.
 *
 *  - an admin;
 *  - a facilitator of a LIVE group (not archived) on a run of the course,
 *    while their account still stands behind the role
 *    (`isNamedWithStanding`), the run being there and not mid-destroy;
 *  - the lead of a programme that names a run of the course, while they still
 *    stand as one (`programmeLedBy`, the one answer to who leads a run).
 *
 * Nobody else: not a run's track lead, reviewer or run-level facilitator, not
 * a facilitator of another course, and never anybody taking part, whose
 * group's facilitators read this beside them. A group's facilitators take
 * part in the course themselves as well (Zach, 26 Oct 2026); they read it
 * because they facilitate.
 *
 * WHAT IT GIVES BACK is a `GuideReader`, the only thing the store's reads
 * take (`src/lib/courses/facilitatorGuide/store.ts`), so no page or route can
 * read a document without having asked here first. It is minted in this file
 * and nowhere else; `tests/course-facilitator-guide-guard.test.mjs` holds
 * that, and walks every page and route that reaches the store.
 *
 * ONE ANSWER FOR EVERYBODY REFUSED: null, whether the course is missing, the
 * id is not one, or the caller is not one of the three. The pages turn it
 * into one calm sentence, so nobody learns which courses exist.
 *
 * Reads: the course, then (for anybody who is not an admin) the course's
 * groups and their runs by one equality each, then the course's runs and the
 * forms for a lead. No query needs a composite index.
 */

declare const MINTED_HERE: unique symbol;

/** Proof that the gate admitted this caller to this course's guide. */
export type GuideReader = {
  readonly courseId: string;
  readonly courseTitle: string;
  /** Which of the three doors let them in. */
  readonly as: "admin" | "facilitator" | "lead";
  readonly [MINTED_HERE]: true;
};

/** Proof that the caller may load documents into this course's guide: an admin, or the lead of a programme naming a live run of it. */
export type GuideWriter = {
  readonly courseId: string;
  readonly [MINTED_HERE]: true;
};

function mintReader(courseId: string, courseTitle: string, as: GuideReader["as"]): GuideReader {
  return { courseId, courseTitle, as } as GuideReader;
}

/** The course, while it is there and not being destroyed. */
async function liveCourse(db: Firestore, courseId: string): Promise<{ title: string } | null> {
  const snap = await db.collection("courses").doc(courseId).get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  if (raw.destroying === true) return null;
  return { title: normalizeCourse(snap.id, raw).title };
}

/** Does this caller facilitate a live group on a live run of this course? */
async function facilitatesOnCourse(db: Firestore, user: SessionUser, courseId: string): Promise<boolean> {
  const groups = await db.collection("courseGroups").where("courseId", "==", courseId).get();
  const runIds = new Set<string>();
  for (const doc of groups.docs) {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    if (group.archived || !isNamedWithStanding(user, "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    if (isAddressableId(group.runId)) runIds.add(group.runId);
  }
  // The group's run, read again: it has to be a run of this very course, and
  // one still there. A group's own `courseId` is not taken on trust.
  for (const runId of runIds) {
    const run = await db.collection("courseRuns").doc(runId).get();
    const raw = run.data() ?? {};
    if (run.exists && raw.courseId === courseId && raw.destroying !== true) return true;
  }
  return false;
}

/** Does this caller lead a programme that names a live run of this course? */
async function leadsOnCourse(db: Firestore, user: SessionUser, courseId: string): Promise<boolean> {
  const runs = await db.collection("courseRuns").where("courseId", "==", courseId).get();
  for (const doc of runs.docs) {
    if ((doc.data() ?? {}).destroying === true) continue;
    if (await programmeLedBy(db, user, doc.id)) return true;
  }
  return false;
}

/**
 * THE GATE. A reader of this course's facilitator guide, or null for
 * everybody it does not admit (see the module comment).
 */
export async function facilitatorGuideReader(
  db: Firestore,
  user: SessionUser | null,
  courseId: string,
): Promise<GuideReader | null> {
  if (!user || !isAddressableId(courseId)) return null;
  const course = await liveCourse(db, courseId);
  if (!course) return null;
  if (user.role === "admin") return mintReader(courseId, course.title, "admin");
  if (await facilitatesOnCourse(db, user, courseId)) return mintReader(courseId, course.title, "facilitator");
  if (await leadsOnCourse(db, user, courseId)) return mintReader(courseId, course.title, "lead");
  return null;
}

/**
 * The loader's gate: an admin, on an id that is one, decided on the session
 * alone (the admin's loader page and the run's Weeks tab); and the lead of a
 * programme that names a live run of the course, while they still stand as
 * one, on a course that is there and not being destroyed: the Weeks tab's
 * "Facilitator guide" box (board pr-weeks) is theirs. The same lead the
 * reader gate admits (`leadsOnCourse`), so nobody may write a guide they may
 * not read. Everybody else: null, the same refusal.
 */
export async function facilitatorGuideWriter(db: Firestore, user: SessionUser, courseId: string): Promise<GuideWriter | null> {
  if (!isAddressableId(courseId)) return null;
  if (user.role === "admin") return { courseId } as GuideWriter;
  if (!(await liveCourse(db, courseId))) return null;
  if (await leadsOnCourse(db, user, courseId)) return { courseId } as GuideWriter;
  return null;
}
