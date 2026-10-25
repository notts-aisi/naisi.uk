import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRunEnd } from "@/lib/courses/finishing/record";
import { courseApplicationId, normalizeCourseApplication } from "@/lib/firestore/courseApplications";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * WHO MAY LEAVE A COURSE RUN THEMSELVES, and what their leaving gives back.
 *
 * Two kinds of run can be left, behind the typed confirmation:
 *
 *  - AN OPEN RUN: the seat the person took from the session picker. Leaving
 *    gives the seat back to the group.
 *  - A RUN THE TERM'S APPLICATION FORM PLACES PEOPLE ON, for somebody whose
 *    place on it came from the form (the row an admin's hand-over wrote on
 *    the run's own list carries `fromForm`). Leaving takes them out of their
 *    group and gives their place on the form back, as "I can’t make it"
 *    does, so the programme's places and lists agree with the run.
 *
 * Anybody else on a run that takes people by placement (they applied to the
 * run itself, on its older form) is still told that leaving is not something
 * they can do themselves: their place has no form to go back to, and an
 * admin's Remove is how they come off.
 *
 * LEAVING CLOSES WHEN THE RUN'S LAST SESSION IS OVER, the moment who finished
 * opens (`runEndOf(...).over`, the one answer who finished asks): the board
 * for after the end draws no way out. Somebody who finished keeps their
 * finished record, and nothing after the end gives a place on the form back.
 * A run whose sessions cannot be dated is never over, so it can still be left.
 *
 * The route that takes somebody off a run (`DELETE .../enrol`) and every page
 * that offers "Leave the programme" ask this one function, so the link is
 * drawn exactly where the route will take the press, and the line is drawn
 * here and nowhere else.
 *
 * Reads the caller's OWN row on the run's list, at the one id that is theirs,
 * and nothing else of it but where it came from; then, only for somebody who
 * could leave, the run's groups, for when its last session ends.
 */

export type LeavePath =
  /** An open run: the seat goes back to the group. */
  | { kind: "open" }
  /** A run the form placed them on: their place on this form's programme goes back too. */
  | { kind: "form"; roundId: string; programmeId: string };

/**
 * The answer: the way out, or why there is none.
 *  - `not-theirs`: no seat they can leave themselves.
 *  - `ended`: the run's last session is over.
 */
export type LeaveAnswer = { path: LeavePath } | { closed: "not-theirs" | "ended" };

/** The seat's way out, whatever the clock says, or null for a seat that is not theirs to leave. */
async function wayOut(db: Firestore, run: Pick<CourseRunDoc, "id" | "enrolMode">, uid: string): Promise<LeavePath | null> {
  if (run.enrolMode === "open") return { kind: "open" };
  if (!uid || uid.includes("/")) return null;
  const snap = await db.collection("courseApplications").doc(courseApplicationId(run.id, uid)).get();
  if (!snap.exists) return null;
  const row = normalizeCourseApplication(snap.id, snap.data() ?? {});
  // Belt to the id's brace: a row that does not say it is this person's on
  // this run is nobody's way off it.
  if (row.uid !== uid || row.runId !== run.id || row.fromForm === null) return null;
  return { kind: "form", roundId: row.fromForm.roundId, programmeId: row.fromForm.programmeId };
}

export async function leavePathFor(db: Firestore, run: CourseRunDoc, uid: string, now: Date): Promise<LeaveAnswer> {
  const path = await wayOut(db, run, uid);
  if (!path) return { closed: "not-theirs" };
  if ((await readRunEnd(db, run, now)).end.over) return { closed: "ended" };
  return { path };
}
