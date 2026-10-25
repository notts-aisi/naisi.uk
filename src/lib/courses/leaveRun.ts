import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { loadForm } from "@/lib/applications/repo";
import { givePlaceBack, readPlaceToGiveBack } from "@/lib/applications/status/record";
import { sendCourseDroppedOutEmail } from "@/lib/email/courseEnrolmentEmails";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { readCoursesConfig } from "@/lib/firestore/config";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentStatus,
} from "@/lib/firestore/courseEnrolments";
import { courseRunChannel, type CourseRunDoc } from "@/lib/firestore/courses";
import { courseTaskId, MIRRORED_TASK_SOURCE } from "@/lib/firestore/courseTasks";
import { unsubscribe } from "@/lib/firestore/subscriptions";
import type { LeavePath } from "./leaving";

/**
 * WHAT LEAVING A COURSE RUN WRITES, for both doors.
 *
 * Somebody leaves a run from their programme page ("Leave the programme", the
 * enrol route's `DELETE`, behind the course's title typed to confirm), and
 * somebody in a group Publish has told them about who replies "I can’t make
 * it" on their application page leaves it the same way (the reply route,
 * behind the reply's own two presses and its reason). Both routes ask
 * `leavePathFor` (`./leaving.ts`) whether the person may leave, and hand its
 * answer here; this is the one place what leaving writes is written, so the
 * two doors cannot come to write two different things.
 *
 * IRREVERSIBLE, by decision: the seat is freed, the nudges stop, and coming
 * back is something somebody else has to do.
 *
 * ## The transaction
 *
 * It reads the caller's OWN seat, at the one id that is theirs, and leaves
 * only a seat that is theirs to leave: a learner's, active, and shown to them
 * (`placementIsShownTo`: a placement Publish has not told its owner about is
 * answered as no seat at all, as every reader answers it, because the run is
 * shut to them and saying anything else would tell them they are placed). A
 * seat already left is a second press: nothing is written and the answer is
 * the same. Then, in one transaction:
 *
 *  - the seat is `withdrawn`, with the day (`droppedOutAt`) and the reason
 *    (`dropOutReason`, read by the programme's lead and admins and by nobody
 *    else). The group and Publish's stamp, `allocatedEmailAt`, are KEPT: a
 *    facilitator's register lists who left their group, read only, with the
 *    marks they had, and the stamp is what still shows the person their own
 *    row afterwards (the page that says they left), under the one rule every
 *    reader asks. Nothing reads a seat that has left as a placement: every
 *    reader of a group also asks for an active seat, and the allocate route
 *    clears the stamp when it puts somebody who left back;
 *  - on a run the term's application form places people on, their place on
 *    the form goes back exactly as "I can’t make it" gives it
 *    (`readPlaceToGiveBack` and `givePlaceBack` in
 *    `src/lib/applications/status/record.ts`), with NO reason on the
 *    application, so every count of the programme's places and every list of
 *    its people agrees with the run the moment the person has left. Whether
 *    that place can then be offered to somebody else is the freed places
 *    rules' to say (their window closes at the end of the run's week 1);
 *  - the group's `memberCount` goes down, and an open run's `enrolledCount`
 *    for a seat it counted.
 *
 * ## After the commit, best effort
 *
 * One log line, off the cohort's mailing list, the week cards gone from their
 * tasks, and one email to them and nobody else ("You've left ..."). Their
 * facilitators read it on the register, and the programme's lead and admins
 * on the programme's Overview, with the reason when one was given. A failure
 * of any of these is logged and never turns the leave into an error.
 */

/**
 * How many weeks back the sweep looks for this member's mirrored My Work
 * cards. The mirror is created lazily, one card per cohort week, so the most
 * a live run can have produced is one per week of its plan; 60 is
 * `weekDocId`'s own ceiling and therefore covers every run that can exist.
 */
const MAX_MIRROR_WEEKS = 60;

/** Why the seat the transaction read is not one this person can leave now. */
export type SeatRefusal = "no-seat" | "facilitator" | "not-on-it";

/** What a refusal is answered with: the enrol route's own sentences, as they always were. */
export const SEAT_REFUSALS: Readonly<Record<SeatRefusal, { status: 404 | 409; error: string }>> = {
  "no-seat": { status: 404, error: "You're not signed up for this course." },
  facilitator: {
    status: 409,
    error: "You're on this course as a facilitator. Ask an admin to stand you down.",
  },
  "not-on-it": { status: 409, error: "You're not on this course any more." },
};

export type LeaveResult =
  /**
   * They are off the run. `dropped` is whether THIS call took them off, as
   * opposed to a second press arriving after the first had committed: only
   * the first writes the log line, the list, the cards and the email.
   */
  | { kind: "left"; dropped: boolean; feedbackUrl: string }
  /** Nothing was written. */
  | { kind: "refused"; why: SeatRefusal; status: 404 | 409; error: string };

class SeatError extends Error {
  constructor(readonly why: SeatRefusal) {
    super(why);
  }
}

/**
 * Takes the caller off the run, in the way `path` says (`leavePathFor`'s
 * answer: the caller's own way out). `reason` is what they said, already
 * trimmed to its limit, or null. An unexpected failure of the transaction
 * throws, and the route answers it in its own words; nothing after the commit
 * throws.
 */
export async function leaveRun(
  db: Firestore,
  input: { run: CourseRunDoc; path: LeavePath; user: SessionUser; reason: string | null; now: Date },
): Promise<LeaveResult> {
  const { run, path, user, reason, now } = input;
  const runId = run.id;
  const enrolmentRef = db.collection("courseEnrolments").doc(courseEnrolmentId(runId, user.uid));

  // The form a placed seat's place goes back to, read before the transaction:
  // the place is read against its programmes and its grid. A round that is no
  // longer a form has no place on it to give back, and leaving goes ahead.
  const form = path.kind === "form" ? await loadForm(db, path.roundId) : null;

  let leftGroupId: string | null = null;
  // Whether THIS call is the one that took them off, as opposed to a
  // double-tapped confirm arriving after the first has committed. Everything
  // after the commit (the audit row, the unsubscribe, the task sweep, the
  // email) hangs off it, so a second press is a quiet answer rather than a
  // second confirmation email about a course somebody left a moment ago.
  let dropped = false;

  try {
    await db.runTransaction(async (tx) => {
      // Reset per attempt: Firestore retries a contended transaction, and a
      // flag carried over from a discarded attempt would report work that
      // never committed.
      dropped = false;
      const snap = await tx.get(enrolmentRef);
      if (!snap.exists) throw new SeatError("no-seat");
      const row = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
      if (row.uid !== user.uid || row.runId !== runId) throw new SeatError("no-seat");
      // A placement Publish has not told them about is no seat to them: the
      // run is shut to them, and the answer is the one with no row at all.
      if (!placementIsShownTo(row, { isAdmin: user.role === "admin" })) throw new SeatError("no-seat");
      if (row.role !== "learner") throw new SeatError("facilitator");
      // Idempotent: a double-tapped confirm must not decrement a counter
      // twice, and must not read as a failure to the member.
      if (row.status === "withdrawn") return;
      if (row.status !== "active") throw new SeatError("not-on-it");

      // The place on the form, read before anything is written (a
      // transaction takes every read first). Null when there is no place
      // there to give back, and leaving goes ahead without it.
      const place =
        form && path.kind === "form"
          ? await readPlaceToGiveBack(tx, db, form, user.uid, path.programmeId, now)
          : null;

      leftGroupId = row.groupId;
      dropped = true;

      tx.update(enrolmentRef, {
        status: "withdrawn" satisfies CourseEnrolmentStatus,
        // When they left: the date their programme page, their register and
        // the programme's Overview all say.
        droppedOutAt: FieldValue.serverTimestamp(),
        // Stored as a real null rather than omitted, so a later leave that
        // collects nothing overwrites an earlier value rather than leaving a
        // stale sentence attached to the row.
        dropOutReason: reason,
        // Publish's stamp, `allocatedEmailAt`, is KEPT: they were told about
        // the group this row still names, and it is what shows them their
        // own row now that they have left (see the note at the top).
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (place) givePlaceBack(tx, place);
      // `groupId` is KEPT. `memberCount` counts enrolments that are both
      // active AND grouped (the allocate route's definition), so a withdrawn
      // row holds no seat whatever its `groupId` says, and keeping it is what
      // lets a facilitator see which of their sessions someone left.
      if (row.groupId) {
        tx.update(db.collection("courseGroups").doc(row.groupId), {
          memberCount: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      // `enrolledCount` counts SELF-ENROLLED active rows only, which is the
      // narrower condition the account-deletion sweep already uses. An
      // allocated learner on a run that has since been flipped to open mode
      // was never counted by it, and uncounting them here would drive the
      // number negative and then wedge the enrol-mode route, which reads it
      // as "is anybody on this run".
      if (row.selfEnrolled) {
        tx.update(db.collection("courseRuns").doc(runId), {
          enrolledCount: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (err instanceof SeatError) return { kind: "refused", why: err.why, ...SEAT_REFUSALS[err.why] };
    throw err;
  }

  const config = await readCoursesConfig(db).catch(() => null);
  const feedbackUrl = config?.dropOutFeedbackUrl ?? "";

  // A repeat of an already-committed leave: the answer is the same, and the
  // feedback link is still worth handing back, but nothing is written or
  // sent a second time.
  if (!dropped) return { kind: "left", dropped: false, feedbackUrl };

  // ── Everything after the commit is best effort ────────────────────────────
  // The member has left; none of the tidying below may turn that into an
  // error they see. Each step logs its own failure.

  // The audit row goes AFTER the commit, and that is a deliberate departure
  // from the enrol-mode route's audit-first ordering. There the actor is an
  // admin and a spare row is harmless; here a row saying a member left when
  // they did not would send a facilitator chasing somebody who is still in
  // the room. The enrolment document is itself a durable record (status,
  // `droppedOutAt`, `dropOutReason`), so this row is the searchable index of
  // the event rather than its only trace.
  //
  // IT SAYS WHAT WAS DONE, NEVER WHAT THEY SAID. The log of course actions
  // outlives the account, and records what happened; the reason they gave is
  // kept with their seat alone, for the programme's lead and admins, and goes
  // with their account. So the row carries no reason, and does not say
  // whether one was given.
  try {
    await db.collection(COURSE_AUDIT_COLLECTION).add({
      kind: "enrolment-dropout",
      runId,
      groupId: leftGroupId,
      subjectUid: user.uid,
      actorUid: user.uid,
      actorName: user.displayName ?? "",
      targetLabel: run.label || runId,
      detail: "Left the course.",
      at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[courses leave] audit row failed", runId, user.uid, err);
  }

  await unsubscribeFromCohort(db, runId, user);
  await deleteMirroredTasks(db, run, user.uid);

  if (user.email) {
    // Fire and forget, the RSVP-submit pattern: the member must not wait on
    // the mail provider to see their own confirmation.
    void sendCourseDroppedOutEmail({
      to: user.email,
      name: user.displayName?.trim() || "NAISI member",
      courseTitle: run.courseTitle,
      runLabel: run.label,
      feedbackUrl,
      uid: user.uid,
      runId,
    }).catch((err) => {
      console.error("[courses leave] email failed", runId, user.uid, err);
    });
  }

  return { kind: "left", dropped: true, feedbackUrl };
}

/** Stop the cohort mail. Non-fatal: the row may not even exist. */
async function unsubscribeFromCohort(db: Firestore, runId: string, user: SessionUser) {
  if (!user.email) return;
  try {
    await unsubscribe(db, {
      email: user.email,
      channel: courseRunChannel(runId),
      actor: {
        kind: "member",
        uid: user.uid,
        label: user.displayName?.trim() || "NAISI member",
      },
    });
  } catch (err) {
    console.warn("[courses leave] cohort unsubscribe failed", runId, user.uid, err);
  }
}

/**
 * Clear this member's mirrored My Work cards for the run they just left.
 *
 * ADDRESSED BY DETERMINISTIC ID, never by query. `courseTaskId(runId, week,
 * uid)` names every card the mirror can have created, one per cohort week, so
 * the sweep is a bounded `getAll` over the run's own week plan rather than a
 * three-filter query that would need a composite index on `tasks`.
 *
 * Each candidate is VERIFIED before it is deleted: the doc must carry the
 * mirror's `source` and list this member as a completer. A task's id says
 * nothing about who made it, so the id alone is never trusted.
 *
 * `recursiveDelete` rather than a plain delete: a mirror behaves like a
 * personal task, so it can carry comments and activity, and a parent-doc
 * delete leaves subcollections behind.
 */
async function deleteMirroredTasks(db: Firestore, run: CourseRunDoc, uid: string) {
  try {
    const weekCount = Math.min(
      MAX_MIRROR_WEEKS,
      run.weekPlan.filter((e) => e.kind === "week").length,
    );
    if (weekCount === 0) return;
    const refs = Array.from({ length: weekCount }, (_, i) =>
      db.collection("tasks").doc(courseTaskId(run.id, i + 1, uid)),
    );
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() ?? {};
      const isOurMirror =
        data.source === MIRRORED_TASK_SOURCE &&
        Array.isArray(data.completerUids) &&
        (data.completerUids as unknown[]).includes(uid);
      if (!isOurMirror) continue;
      await db.recursiveDelete(snap.ref);
    }
  } catch (err) {
    console.warn("[courses leave] mirrored task cleanup failed", run.id, uid, err);
  }
}
