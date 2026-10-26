import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { normalizeCourse } from "@/lib/firestore/courses";

/**
 * THE CREDIT LINE, AS A PROGRAMME'S SETTINGS SHOW IT: the line every
 * certificate of the course carries after its weeks. It is the course's
 * (`CourseDoc.credit`), set on the course's own page; the programme's
 * Settings show it read-only, with the way to change it.
 *
 * Read by the course the programme is tied to, which is the course of the
 * run it names (a run is named from that course's own runs), and nothing of
 * the run: a lead's Settings page reads nothing of the run itself. Null for a
 * course that is not there.
 */
export type CreditFacts = {
  /** As the certificate prints it after the dot, or "" for none. */
  credit: string;
  courseId: string;
  courseTitle: string;
};

export async function readCreditFacts(db: Firestore, courseId: string): Promise<CreditFacts | null> {
  if (!courseId || courseId.includes("/")) return null;
  const snap = await db.collection("courses").doc(courseId).get();
  if (!snap.exists) return null;
  const course = normalizeCourse(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  return { credit: course.credit, courseId: course.id, courseTitle: course.title };
}
