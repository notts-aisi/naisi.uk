import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { loadForm } from "@/lib/applications/repo";
import { givePlaceBack, readPlaceToGiveBack } from "@/lib/applications/status/record";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { leavePathFor } from "@/lib/courses/leaving";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  type CourseEnrolmentStatus,
} from "@/lib/firestore/courseEnrolments";
import { courseApplicationId } from "@/lib/firestore/courseApplications";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { courseRunChannel, normalizeCourseRun } from "@/lib/firestore/courses";
import { unsubscribe } from "@/lib/firestore/subscriptions";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";

/**
 * Remove one learner from a run: their enrolment flips to `status:"removed"`
 * and its `groupId` clears, releasing the seat, in one transaction with the
 * group's `memberCount` decrement.
 *
 * WHO MAY REMOVE: admins ∪ the run's `trackLeadUids` ∪ the lead of the
 * programme that names the run (`runStaffingOf`): the allocation gate.
 *
 * It records WHEN (`droppedOutAt`, the field leaving writes), so the
 * programme's Overview, its Attendance tab and the group's register say the
 * day somebody went, whichever way they went.
 *
 * A SEAT THE APPLICATION FORM PLACED GIVES ITS PLACE ON THE FORM BACK, in the
 * same transaction, exactly as leaving gives it (`readPlaceToGiveBack` and
 * `givePlaceBack` in `src/lib/applications/status/record.ts`), with no reason
 * written on the application. So the person's application page stops saying
 * their group is on its way, and every count of the programme's places and
 * list of its people agrees with the run the moment they are off it. Where
 * the seat's place came from is leaving's own answer (`leavePathFor` in
 * `src/lib/courses/leaving.ts`): the form and the programme the seat's row
 * on the run's list names, and nothing once the run's last session is over,
 * when no place on the form goes back. Only a seat still on the run gives its
 * place back. Putting somebody back afterwards gives it to them again on the
 * form (the allocate route), as it does for somebody who left.
 *
 * NOBODY WHO LEFT BY THEMSELVES IS REMOVED. A seat withdrawn by its owner
 * (either door: "Leave the programme" on their programme's page, or "I can’t
 * make it" on their application page once Publish has told them their group)
 * has already freed its place in the group, and turning it into a removal
 * would close the run to them as for somebody staff took off, and take back
 * the page that says they left. So the route refuses it in a sentence that
 * says they left, and when, and writes nothing. The board offers no Remove
 * for such a seat either: it offers Remove on an active seat only.
 *
 * A SOFT removal, deliberately: the enrolment doc survives. The deterministic
 * doc id (`courseEnrolments/{runId}__{uid}`) is the one-enrolment-per-(run,
 * uid) invariant, so the row is that person's entire history on the run:
 * deleting it would let a later re-placement mint a "fresh" enrolment with no
 * memory. Re-admission is the allocate route flipping this same row back to
 * "active" (which also re-clears/re-earns the placement-email stamp via the
 * cleared `groupId`). That route needs an accepted application, so a member
 * who signed themselves up comes back through the reinstate route instead.
 *
 * FACILITATOR ROWS ARE OUT OF SCOPE: a `role:"facilitator"` enrolment is
 * managed by the group facilitators route (which retires it when the person
 * is unassigned). Refused here so the board can't quietly strip someone's
 * facilitator access under the guise of un-placing a learner.
 *
 * SO IS A FACILITATOR WHO HOLDS A PLACE, while they facilitate one of the
 * run's live groups: their row is a learner's, but taking them off the run
 * would leave a group's facilitator who is no longer on it. They are taken
 * off the group's facilitators first (which leaves their place where it
 * is), and then removed like anybody else, as leaving asks of them too
 * (`leavePathFor`). Asked of the run's groups inside the transaction, so an
 * appointment made while this runs makes it run again.
 */

type Ctx = { params: Promise<{ runId: string; uid: string }> };

/**
 * NOT DRAWN. Remove, for a facilitator who holds a place: they come off the
 * group's facilitators first, and then off the run. Written in the boards'
 * voice.
 */
function facilitatesGroupLine(groupName: string): string {
  return `They facilitate ${groupName}. Take them off its facilitators first, on the Facilitators view, then remove them.`;
}

/**
 * The refusal for a seat whose person left by themselves: that they left, on
 * which day in London (as the grid and the register say it, "Fri 6 Nov"), and
 * that there is nothing to do. Not drawn on any board: written in the boards'
 * voice and listed in the build notes for the boards' designers to confirm.
 */
function leftByThemselvesLine(leftAt: Date | null): string {
  const day = leftAt ? formatRunStartShort(londonDateKey(leftAt)) : undefined;
  return day
    ? `They left on ${day}, so their seat is already free and there’s nothing to remove.`
    : "They left by themselves, so their seat is already free and there’s nothing to remove.";
}

class RemoveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId, uid } = await ctx.params;
  if (!runId || !uid) {
    return NextResponse.json({ error: "Enrolment not found" }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  const staffing = await runStaffingOf(db, actor, run);
  const isAdmin = staffing.isAdmin;
  if (!doesTrackLeadWork(staffing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const enrolmentRef = db
    .collection("courseEnrolments")
    .doc(courseEnrolmentId(runId, uid));

  // Where the seat's place on the form came from, as leaving reads it, and
  // the form it goes back to, read before the transaction (see the note at
  // the top). A round that is no longer a form has no place on it to give
  // back, and the removal goes ahead without it.
  const now = new Date();
  const leaving = await leavePathFor(db, run, uid, now);
  const fromForm = "path" in leaving && leaving.path.kind === "form" ? leaving.path : null;
  const form = fromForm ? await loadForm(db, fromForm.roundId) : null;

  try {
    await db.runTransaction(async (tx) => {
      const [snap, runGroups] = await Promise.all([
        tx.get(enrolmentRef),
        // One equality on one field: who facilitates the run's groups.
        tx.get(db.collection("courseGroups").where("runId", "==", runId)),
      ]);
      if (!snap.exists) throw new RemoveError("Enrolment not found", 404);
      const existing = snap.data() ?? {};

      // The doc id is built from (runId, uid); a mismatch means a hand-made
      // doc. Fail closed rather than remove the wrong person.
      if (existing.uid !== uid || existing.runId !== runId) {
        throw new RemoveError("Enrolment not found", 404);
      }

      if (existing.role === "facilitator") {
        throw new RemoveError(
          "That's a facilitator enrolment. Unassign them in the group editor instead.",
          409,
        );
      }
      const facilitated = runGroups.docs
        .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
        .find((group) => group.runId === runId && !group.archived && group.facilitatorUids.includes(uid));
      if (facilitated && existing.status === "active") {
        throw new RemoveError(facilitatesGroupLine(facilitated.name.trim() || "a group"), 409);
      }

      const status = existing.status as CourseEnrolmentStatus;
      // Somebody who left by themselves, by either door: their seat is
      // already free, and nothing here is theirs to change. Refused with the
      // day they left, before anything is written (see the note at the top).
      if (status === "withdrawn") {
        throw new RemoveError(leftByThemselvesLine(normalizeCourseEnrolment(snap.id, existing).droppedOutAt), 409);
      }
      // Idempotent: a double-clicked Remove shouldn't surface a failure, and
      // must not decrement the counter twice.
      if (status === "removed") return;

      // The place on the form, read before anything is written (a
      // transaction takes every read first). Only a seat still on the run
      // gives it back. Null when there is no place there to give back, and
      // the removal goes ahead without it.
      const place =
        form && fromForm && status === "active"
          ? await readPlaceToGiveBack(tx, db, form, uid, fromForm.programmeId, now)
          : null;

      const groupId =
        typeof existing.groupId === "string" && existing.groupId
          ? existing.groupId
          : null;
      // `memberCount` counts enrolments that are both active AND grouped
      // (the allocate route's definition), so only that state releases a
      // seat.
      const heldSeat = status === "active" && groupId !== null;
      // `courseRuns.enrolledCount` is the OTHER counter, and it counts a
      // narrower set: active AND self-enrolled, whatever group they are in
      // (see the field's doc comment on `CourseRunDoc`). Removing somebody
      // who signed themselves up has to give it back, or a run whose whole
      // open-enrolled cohort was removed still reads as populated and the
      // enrol-mode route refuses to reopen it. An allocated learner was
      // never counted by it, so removing one moves nothing.
      const heldOpenSeat = status === "active" && existing.selfEnrolled === true;

      tx.update(enrolmentRef, {
        status: "removed" satisfies CourseEnrolmentStatus,
        groupId: null,
        // The stamp certifies "emailed about their current group"; there is
        // no current group any more, and a future re-placement must earn a
        // fresh placement email on the next publish.
        allocatedEmailAt: FieldValue.delete(),
        // WHEN THEY WERE TAKEN OFF, in the field leaving writes, so the
        // programme's Overview, its Attendance tab and the register say
        // "Left Fri 13 Nov" for both kinds of leaving. Somebody who left by
        // themselves never reaches this write (refused above), so the day
        // they left is never overwritten.
        droppedOutAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (place) givePlaceBack(tx, place);
      if (heldSeat && groupId) {
        tx.update(db.collection("courseGroups").doc(groupId), {
          memberCount: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (heldOpenSeat) {
        tx.update(db.collection("courseRuns").doc(runId), {
          enrolledCount: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (err instanceof RemoveError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[courses remove] transaction failed", runId, uid, err);
    return NextResponse.json({ error: "Couldn't remove that enrolment." }, { status: 500 });
  }

  // Post-commit, best-effort: drop them from the cohort channel so run
  // announcements stop. Failure is acceptable degradation — the removal
  // itself has committed, and `unsubscribe()` flips a (email, channel) row
  // that may not even exist yet if allocation was never published.
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    let email =
      userSnap.exists && typeof userSnap.data()?.email === "string"
        ? (userSnap.data()?.email as string)
        : "";
    if (!email) {
      // Deleted account: fall back to the address captured at apply time,
      // which is the one the publish route would have subscribed.
      const appSnap = await db
        .collection("courseApplications")
        .doc(courseApplicationId(runId, uid))
        .get();
      const appEmail = appSnap.exists ? appSnap.data()?.email : null;
      email = typeof appEmail === "string" ? appEmail : "";
    }
    if (email) {
      await unsubscribe(db, {
        email,
        channel: courseRunChannel(runId),
        actor: {
          kind: isAdmin ? "admin" : "member",
          uid: actor.uid,
          label:
            actor.displayName?.trim() || (isAdmin ? "Admin" : staffing.leadOf ? "Programme lead" : "Track lead"),
        },
      });
    }
  } catch (err) {
    console.warn("[courses remove] cohort unsubscribe failed", runId, uid, err);
  }

  return NextResponse.json({ ok: true });
}
