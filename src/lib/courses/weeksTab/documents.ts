import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRunGlossary, readRunStartHere } from "@/lib/courses/guide/model";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { dayWords } from "@/lib/courses/sessionChange/words";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseDocumentKey as GuideDocumentKey } from "@/lib/courses/facilitatorGuide/model";

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
 * changed). The course's two are read by the tab's page, after it has asked
 * that gate itself (`facilitatorGuideWriter`, then `readCourseDocumentsLoaded`),
 * and handed in here; this module never reaches the guide's store.
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

/** What the page read of the course's two, behind the facilitator guide's loader gate. */
export type CourseDocumentsRead = Array<{ key: GuideDocumentKey; title: string | null; savedAt: Date | null }>;

/**
 * The card, for the caller: an admin's rows, or no rows for anybody else (the
 * page draws the lead's one line). `course` is what the page read of the
 * course's two behind the loader's gate, or null when it read nothing.
 */
export async function loadCourseDocuments(
  db: Firestore,
  user: SessionUser,
  run: { runId: string },
  course: CourseDocumentsRead | null,
): Promise<CourseDocuments> {
  const admin = user.role === "admin";
  const rows: CourseDocumentRow[] = [];
  if (!admin) return { admin, rows };
  const snap = await db.collection("courseRuns").doc(run.runId).get();
  const raw = snap.data() ?? {};
  rows.push({ key: "start-here", name: "Start here", whose: "run", loaded: readRunStartHere(raw) !== null, title: null, loadedOn: null });
  rows.push({ key: "glossary", name: "Glossary", whose: "run", loaded: readRunGlossary(raw) !== null, title: null, loadedOn: null });
  for (const doc of course ?? []) {
    if (doc.key !== "handbook" && doc.key !== "printables") continue;
    rows.push({
      key: doc.key,
      name: doc.key === "handbook" ? "Handbook" : "Printables",
      whose: "course",
      loaded: doc.title !== null,
      title: doc.title,
      loadedOn: doc.title !== null && doc.savedAt ? dayWords(londonDateKey(doc.savedAt)) || null : null,
    });
  }
  return { admin, rows };
}
