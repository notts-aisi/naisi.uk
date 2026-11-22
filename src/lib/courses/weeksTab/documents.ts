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
 * FOR AN ADMIN. The programme's lead is given one line instead ("Course
 * documents: an admin loads these.") and no row: the run's two are loaded
 * through an admins-only route, and the Handbook and Printables are shared by
 * every run of the course, live ones included, so a lead does not load them
 * here (the facilitator guide's own gate, `facilitatorGuideWriter`, is not
 * changed). Each row is read only once that loader's gate has admitted the
 * caller.
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
  /** The caller is an admin: they load all four. Nobody else is given a row. */
  admin: boolean;
  rows: CourseDocumentRow[];
};

/** The card, for the caller: an admin's rows, or no rows for anybody else (the page draws the lead's one line). */
export async function loadCourseDocuments(
  db: Firestore,
  user: SessionUser,
  run: { runId: string; courseId: string },
): Promise<CourseDocuments> {
  const admin = user.role === "admin";
  const rows: CourseDocumentRow[] = [];
  if (admin) {
    const snap = await db.collection("courseRuns").doc(run.runId).get();
    const raw = snap.data() ?? {};
    rows.push({ key: "start-here", name: "Start here", whose: "run", loaded: readRunStartHere(raw) !== null, title: null, loadedOn: null });
    rows.push({ key: "glossary", name: "Glossary", whose: "run", loaded: readRunGlossary(raw) !== null, title: null, loadedOn: null });
  }
  const writer = admin && run.courseId ? await facilitatorGuideWriter(db, user, run.courseId) : null;
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
  return { admin, rows };
}
