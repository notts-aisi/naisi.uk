import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { programmeLedBy } from "../programmeLead";

/**
 * WHO READS SOMEBODY'S FILL-IN BOXES (week 6's action plan), IN ONE PLACE
 * (Q30 C; Zach, Mon 26 Oct: facilitators are fellows, and a facilitator's own
 * work is the lead's and admins'). The one reader of somebody else's boxes,
 * `GET /api/courses/runs/[runId]/fill-in-boxes`, asks `boxesReaderFor` before
 * a single box is read; the week page's line under the boxes says the same
 * (the overview's `answersReadBy`).
 *
 * THE RULE. What a person writes in their boxes is read by them (on their own
 * week page, through `my-exercises`, never here), and by:
 *  - an admin, and the lead of the programme that names the run while they
 *    stand (`programmeLedBy`), for anybody's boxes on the run, a leaver's
 *    included: what somebody wrote stays in the records for them;
 *  - the live facilitators of the group a FELLOW sits in (somebody placed in
 *    a live group, told by Publish, active or finished), each while they
 *    stand;
 * and nobody else. A FACILITATOR'S OWN boxes (anybody who facilitates a live
 * group of the run, holding a place there or not) are the lead's and admins'
 * alone: never a co-facilitator's, never another facilitator's. Never another
 * fellow's. Archived groups staff nobody, as everywhere else.
 *
 * The same people as a written answer's readers
 * (`src/lib/courses/writtenAnswers/access.ts`, `writtenReviewRole`, on its own
 * branch); the two are to become one function.
 */

/** The run's groups read for who facilitates: the overview route's own bound. */
const MAX_GROUPS = 50;

/** Why a caller may read somebody's boxes: the gate's answer, never shown to anybody. */
export type BoxesReader = "admin" | "lead" | "facilitator";

/**
 * May `actor` read `ownerUid`'s fill-in boxes on this run, and as whom? Null
 * for no. The admin's and the lead's answers read nothing of the owner; the
 * facilitator's reads the run's groups (one equality on the run) and the
 * owner's own row on it (one addressed read).
 */
export async function boxesReaderFor(
  db: Firestore,
  actor: SessionUser,
  runId: string,
  ownerUid: string,
): Promise<BoxesReader | null> {
  if (actor.role === "admin") return "admin";
  if (await programmeLedBy(db, actor, runId)) return "lead";
  // The writer reads their own on their week page, not through anybody's gate.
  if (!actor.uid || actor.uid === ownerUid) return null;

  const [groupSnap, enrolSnap] = await Promise.all([
    db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS).get(),
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, ownerUid)).get(),
  ]);
  const liveGroups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => !group.archived);

  // A facilitator's own boxes are the lead's and admins' alone.
  if (liveGroups.some((group) => group.facilitatorUids.includes(ownerUid))) return null;

  const enrolment = enrolSnap.exists ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {}) : null;
  const placed =
    enrolment !== null &&
    enrolment.uid === ownerUid &&
    enrolment.runId === runId &&
    enrolment.role === "learner" &&
    (enrolment.status === "active" || enrolment.status === "completed") &&
    enrolment.groupId !== null &&
    // A placement Publish has not told its owner about is nobody's to read yet.
    // The caller is not an admin: an admin was answered at the top.
    placementIsShownTo(enrolment, { isAdmin: false });
  if (!placed) return null;

  const group = liveGroups.find((candidate) => candidate.id === enrolment.groupId) ?? null;
  if (group && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids)) return "facilitator";
  return null;
}
