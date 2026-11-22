import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { facilitatorGuideWriter } from "@/lib/courses/facilitatorGuide/access";
import { readCourseDocumentsLoaded } from "@/lib/courses/facilitatorGuide/store";
import { readRunGlossary, readRunStartHere } from "@/lib/courses/guide/model";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { dayWords } from "@/lib/courses/sessionChange/words";
import type { SessionUser } from "@/lib/firebase/session";

/**
 * THE COURSE DOCUMENTS CARD, first on a programme's Weeks tab: the run's Start
 * here and Glossary, and the course's Handbook and Printables, each with
 * whose it is, whether it is loaded and when, and its loader.
 *
 * Each row is offered only to somebody its loader admits, decided by that
 * loader's own gate, so the card is never a second way round one:
 *
 *  - Start here and the Glossary are loaded through `/api/courses/runs/
 *    [runId]/guide/[doc]`, which admits admins only: an admin's rows alone.
 *  - The Handbook and Printables are loaded through `/api/courses/[courseId]/
 *    facilitator-guide/[slot]`, whose gate (`facilitatorGuideWriter`) admits
 *    an admin and the lead of a programme that names a live run of the
 *    course: both see them.
 *
 * WHEN. A course document keeps the time it was last saved (`updatedAt` on
 * its guide row), so it says "Loaded on Mon 19 Oct". The run's two are kept on
 * the run's own document, whose time any save of the run moves, so they say
 * only whether they are loaded. Nothing is written here.
 */

export type CourseDocumentKey = "start-here" | "glossary" | "handbook" | "printables";

export type CourseDocumentRow = {
  key: CourseDocumentKey;
  /** "Start here", "Glossary", "Handbook", "Printables". */
  name: string;
  whose: "run" | "course";
  loaded: boolean;
  /** The title of a course document loaded now, for its loader to name; null for the run's two and a document not loaded. */
  title: string | null;
  /** "Mon 19 Oct", for a course document that keeps its time; null otherwise. */
  loadedOn: string | null;
};

export type CourseDocuments = {
  /** The caller is an admin: they load all four. */
  admin: boolean;
  rows: CourseDocumentRow[];
};

/** The card, for the caller, or null when no loader admits them for any row. */
export async function loadCourseDocuments(
  db: Firestore,
  user: SessionUser,
  run: { runId: string; courseId: string },
): Promise<CourseDocuments | null> {
  const admin = user.role === "admin";
  const rows: CourseDocumentRow[] = [];
  if (admin) {
    const snap = await db.collection("courseRuns").doc(run.runId).get();
    const raw = snap.data() ?? {};
    rows.push({ key: "start-here", name: "Start here", whose: "run", loaded: readRunStartHere(raw) !== null, title: null, loadedOn: null });
    rows.push({ key: "glossary", name: "Glossary", whose: "run", loaded: readRunGlossary(raw) !== null, title: null, loadedOn: null });
  }
  const writer = run.courseId ? await facilitatorGuideWriter(db, user, run.courseId) : null;
  if (writer) {
    const loaded = await readCourseDocumentsLoaded(db, writer, ["handbook", "printables"]);
    for (const doc of loaded) {
      rows.push({
        key: doc.key as CourseDocumentKey,
        name: doc.key === "handbook" ? "Handbook" : "Printables",
        whose: "course",
        loaded: doc.title !== null,
        title: doc.title,
        loadedOn: doc.title !== null && doc.savedAt ? dayWords(londonDateKey(doc.savedAt)) || null : null,
      });
    }
  }
  return rows.length > 0 ? { admin, rows } : null;
}
