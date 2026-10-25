import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { liveGroupsOf, runEndOf } from "@/lib/courses/finishing/runEnd";
import { courseApplicationId, normalizeCourseApplication } from "@/lib/firestore/courseApplications";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
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
 * TWO DOORS, ONE LEAVE. Somebody leaves from their programme page ("Leave the
 * programme", the enrol route's `DELETE`), and somebody in a group Publish
 * has told them about who replies "I can’t make it" on their application page
 * leaves the same way (the reply route, through `readPlaceOnRun` in
 * `./placeOnRun.ts`, which asks this function). Both routes, and every page
 * that offers either way out, ask this one function, so a way out is offered
 * exactly where a press will be taken, and the line is drawn here and nowhere
 * else. What leaving then writes is `leaveRun` (`./leaveRun.ts`), for both.
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

/**
 * Whether the run's last session is over: who finished's own answer
 * (`runEndOf`) over the run's live groups, read with one equality on the
 * run's groups. Read here rather than through who finished's record module
 * because the person's own application page asks it too, and nothing that
 * builds an applicant's page loads the staff side's modules.
 */
async function runIsOver(db: Firestore, run: CourseRunDoc, now: Date): Promise<boolean> {
  const snap = await db.collection("courseGroups").where("runId", "==", run.id).get();
  const groups = liveGroupsOf(
    run.id,
    snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})),
  );
  return runEndOf(run, groups, now).over;
}

export async function leavePathFor(db: Firestore, run: CourseRunDoc, uid: string, now: Date): Promise<LeaveAnswer> {
  const path = await wayOut(db, run, uid);
  if (!path) return { closed: "not-theirs" };
  if (await runIsOver(db, run, now)) return { closed: "ended" };
  return { path };
}
