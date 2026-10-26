import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { normalizeCourse } from "@/lib/firestore/courses";
import { crestForProgramme, type HoldsCrest, type ShownCrest } from "./resolve";

/**
 * THE STORED CRESTS A PAGE HANDS THE RESOLVER, read on the server.
 *
 * Reads only: which crest is shown is `./resolve.ts`'s to say. Nothing here
 * reads a review, a decision, an application or who holds a role, so a page
 * any visitor can load, and the application form's own page, may import it.
 * The forms are never read here; the run's crests, which need them, are
 * `./runs.ts`'s.
 *
 * A course is read whatever its status: a crest is a mark beside a name a
 * visitor can already see, and every page has to show one programme the same
 * way. A course that is not there holds no crest.
 */

/** A string Firestore takes as one document id. Anything else names no course. */
export function canBeDocumentId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 1500 &&
    !id.includes("/") &&
    id !== "." &&
    id !== ".." &&
    !/^__.*__$/.test(id)
  );
}

/**
 * The courses with these ids, as the resolver takes them, in one read. An id
 * that could not be one, and a course that is not there, are left out, and the
 * resolver reads a missing course as one with no crest.
 */
export async function courseCrests(
  db: Firestore,
  courseIds: Iterable<string | null | undefined>,
): Promise<Map<string, HoldsCrest>> {
  const ids = [...new Set([...courseIds].filter(canBeDocumentId))];
  const found = new Map<string, HoldsCrest>();
  if (ids.length === 0) return found;
  const snaps = await db.getAll(...ids.map((id) => db.collection("courses").doc(id)));
  for (const snap of snaps) {
    // The course's own reader, so a stored crest is read one way everywhere.
    if (snap.exists) found.set(snap.id, normalizeCourse(snap.id, snap.data() ?? {}));
  }
  return found;
}

/**
 * What each programme on a form shows beside its name, by programme id: its
 * own crest, else its course's, else the emblem (null). For the form's own
 * page, where a person ranks the programmes.
 */
export async function formCrests(db: Firestore, form: ApplicationForm): Promise<Record<string, ShownCrest>> {
  // Every programme the form carries, closed ones too: what one shows does not
  // depend on whether it takes applications. Walked, never read by a key.
  const programmes = Object.values(form.programmes);
  const courses = await courseCrests(
    db,
    programmes.map((programme) => programme.courseId),
  );
  const shown: Record<string, ShownCrest> = {};
  for (const programme of programmes) {
    shown[programme.id] = crestForProgramme(programme, courses.get(programme.courseId ?? ""));
  }
  return shown;
}
