import "server-only";
import type { Firestore } from "firebase-admin/firestore";
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
 * The route that takes somebody off a run (`DELETE .../enrol`) and every page
 * that offers "Leave the programme" ask this one function, so the link is
 * drawn exactly where the route will take the press.
 *
 * Reads the caller's OWN row on the run's list, at the one id that is theirs,
 * and nothing else of it but where it came from.
 */

export type LeavePath =
  /** An open run: the seat goes back to the group. */
  | { kind: "open" }
  /** A run the form placed them on: their place on this form's programme goes back too. */
  | { kind: "form"; roundId: string; programmeId: string };

export async function leavePathFor(
  db: Firestore,
  run: Pick<CourseRunDoc, "id" | "enrolMode">,
  uid: string,
): Promise<LeavePath | null> {
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
