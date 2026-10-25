import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { own } from "@/lib/applications/keys";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { courseEnrolmentId, normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { leavePathFor, type LeaveAnswer } from "./leaving";

/**
 * WHERE SOMEBODY'S PLACE ON THE FORM STANDS ON THE RUN ITS PROGRAMME NAMES:
 * in a group Publish has told them about, gone from that run by their own
 * act, or neither.
 *
 * A place on the term's application form becomes a seat in a group of the run
 * the programme names once an admin places them and Publish emails them their
 * group. From then on giving the place back is leaving the programme (Q12): the
 * person leaves their group at once, by "Leave the programme" on their
 * programme's page or by "I can’t make it" on their application page, and both
 * are the one leave (`leavePathFor` in `./leaving.ts` decides, `leaveRun` in
 * `./leaveRun.ts` writes). Two places ask this one function, so they cannot
 * disagree about which side of that line somebody is on:
 *
 *  - THE REPLY ROUTE, for "I can’t make it": somebody in a group leaves it
 *    (or is refused in leaving's words when leaving is closed to them), and
 *    everybody else gives their place back on the form as before groups went
 *    out;
 *  - THEIR OWN APPLICATION PAGE, and the list of their applications: in a
 *    group, it points them to their programme's page and says what giving the
 *    place back now means; once they have left, it says so, and when.
 *
 * IN A GROUP means the seat is theirs (a learner's, on this run, at the one id
 * that is theirs), active, in a group, and TOLD: `placementIsTold`, the fact
 * Publish's email stamps. It is asked as a fact and not of the viewer, because
 * the person's own page says what they have been told: an admin's own
 * placement nobody has told them about reads, to them too, as a place on the
 * form. A seat taken off by staff (`removed`) is not one they left, and a run
 * in open enrolment is not a run the form places people on: both are neither.
 *
 * THE WAY OUT is `leavePathFor`'s answer, held to this place: a seat whose row
 * came from another programme or another form is not this place's to give
 * back, and is answered as a seat that is not theirs.
 *
 * Reads the run, the caller's own seat, and, for somebody in a group, the
 * group's name and what `leavePathFor` reads. Never anybody else's seat, and
 * nothing of the application.
 */

export type PlaceOnRun =
  /** No group Publish has told them about, and no run they left: the place is a place on the form. */
  | { kind: "not-in-a-group" }
  /** In a group of the run, told. */
  | {
      kind: "in-a-group";
      run: CourseRunDoc;
      /** The group's name ("Group B"), or null when the record names none. */
      groupName: string | null;
      /** Whether they can leave it themselves now, and their way out: `leavePathFor`, held to this place. */
      leave: LeaveAnswer;
    }
  /** Left the run by their own act, by either door. */
  | { kind: "left"; runId: string; leftOn: Date | null };

const NOT_IN_A_GROUP: PlaceOnRun = { kind: "not-in-a-group" };

/** One path segment, so `doc()` is never handed a path. */
const isSegment = (id: string): boolean => id.length > 0 && !id.includes("/") && id !== "." && id !== "..";

export async function readPlaceOnRun(
  db: Firestore,
  form: ApplicationForm,
  programmeId: string,
  uid: string,
  now: Date,
): Promise<PlaceOnRun> {
  const runId = own(form.programmes, programmeId)?.runId ?? null;
  if (!runId || !isSegment(runId) || !isSegment(uid)) return NOT_IN_A_GROUP;

  const [runSnap, seatSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get(),
  ]);
  // A run being destroyed is refused to everybody, so it is no run to be in.
  if (!runSnap.exists || runSnap.data()?.destroying === true) return NOT_IN_A_GROUP;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  if (run.enrolMode === "open") return NOT_IN_A_GROUP;
  if (!seatSnap.exists) return NOT_IN_A_GROUP;

  const seat = normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {});
  // Belt to the id's brace: a row that does not say it is this person's
  // learner seat on this run is nobody's.
  if (seat.uid !== uid || seat.runId !== runId || seat.role !== "learner") return NOT_IN_A_GROUP;
  // Until Publish has emailed them their group, the run is shut to them and
  // their place is a place on the form, as it was before they were placed.
  // Leaving keeps the stamp, so somebody who left is told too.
  if (!placementIsTold(seat)) return NOT_IN_A_GROUP;
  if (seat.status === "withdrawn") return { kind: "left", runId, leftOn: seat.droppedOutAt };
  if (seat.status !== "active" || !seat.groupId || !isSegment(seat.groupId)) return NOT_IN_A_GROUP;

  const [groupSnap, answer] = await Promise.all([
    db.collection("courseGroups").doc(seat.groupId).get(),
    leavePathFor(db, run, uid, now),
  ]);
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const groupName = group && group.runId === runId ? group.name.trim() || null : null;
  return { kind: "in-a-group", run, groupName, leave: heldToThePlace(answer, form.round.id, programmeId) };
}

/**
 * The way out, for this place: leaving gives back the place its row on the
 * run's list came from, so a row that names another form or programme is no
 * way out of this one.
 */
function heldToThePlace(answer: LeaveAnswer, roundId: string, programmeId: string): LeaveAnswer {
  if ("closed" in answer) return answer;
  const { path } = answer;
  if (path.kind !== "form" || path.roundId !== roundId || path.programmeId !== programmeId) {
    return { closed: "not-theirs" };
  }
  return answer;
}
