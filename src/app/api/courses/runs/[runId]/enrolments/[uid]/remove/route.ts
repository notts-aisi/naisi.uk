import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { formPlaceFactsFor } from "@/lib/applications/handover/board";
import { applicationRef, loadForm } from "@/lib/applications/repo";
import { givePlaceBack, placeGoingBack, readPlaceToGiveBack } from "@/lib/applications/status/record";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { leavePathFor } from "@/lib/courses/leaving";
import { gaveTheirPlaceBack } from "@/lib/courses/placeGivenBack";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { takeOffLimitRefusal, takeOffLimitsIn } from "@/lib/courses/takeOff/limits";
import { planTakeOff, type TakeOffPlan } from "@/lib/courses/takeOff/plan";
import { sendTakeOffEmails } from "@/lib/courses/takeOff/send";
import { ALREADY_OFF, FINISHED, changedWords, doneWords, historyWords, parseTakeOffLine, sheetWords } from "@/lib/courses/takeOff/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import {
  GROUPS_BY_WEEK_LIMITS,
  courseEnrolmentId,
  enrolmentIsPutBack,
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
  type CourseEnrolmentStatus,
} from "@/lib/firestore/courseEnrolments";
import {
  courseApplicationId,
  normalizeCourseApplication,
  rowIsServedTo,
  type CourseApplicationStatus,
} from "@/lib/firestore/courseApplications";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { courseRunChannel, normalizeCourseRun } from "@/lib/firestore/courses";
import { unsubscribe } from "@/lib/firestore/subscriptions";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { onlineWordsGoWithVisitsIn } from "@/lib/courses/joiningOnline/gone";
import { visitLimitRefusal, visitLimitsIn } from "@/lib/courses/visit/limits";

/**
 * Take one person off a run: their enrolment flips to `status:"removed"` and
 * its `groupId` clears, releasing the seat, in one transaction with the
 * group's `memberCount` decrement. Every caller asks first, in a sheet
 * (`src/features/courses/takeOff/TakeOffSheet.tsx`, on People in groups and
 * on the older allocation board): `preview: true` writes nothing and answers
 * every sentence the sheet prints, and the press sends back the count of
 * emails the sheet showed.
 *
 * WHO MAY TAKE SOMEBODY OFF: admins ∪ the run's `trackLeadUids` ∪ the lead of
 * the programme that names the run (`runStaffingOf`): the allocation gate,
 * asked BEFORE the run is looked for, so somebody with no right is answered
 * the same 403 whether the run exists or not, and only a caller the gate
 * admits is told a run is not found. And of the people on the run, only
 * somebody whose row the board serves the caller (`rowIsServedTo`): a row the
 * application form placed is an admin's and the programme lead's, so a run's
 * track lead is answered about such a person as about a uid with no place on
 * the run, before anything about them is read, by the preview and the press
 * alike. Somebody with no row on the run's list (an open run's own sign-up)
 * is anybody's on the gate, as before.
 *
 * WHO IS EMAILED, after the commit (`planTakeOff` and `sendTakeOffEmails` in
 * `src/lib/courses/takeOff/`): the person, always ("Your place on AGI
 * Strategy has ended"); their group's facilitators, only when Publish had
 * told them their group ("Rahul has left Group C"); the hosts' facilitators
 * of each visit still to come, the visit's own called-off email as it always
 * was. Nobody else, and NO REASON IN ANY EMAIL: the optional `line` staff
 * type goes in the person's email alone, and is never stored or logged.
 * The count is the sheet's: the press sends it back (`emails`, none meaning
 * 0), and the transaction works it out again from what it read and refuses a
 * different one (409, with the count as it is now), so a caller that does
 * not send the count it was shown is refused, never emails silently. A press
 * that emails is held to the take-off limits (`takeOffLimitsIn`), and one
 * that ends a visit still to come to the visits' own besides, claimed in the
 * removal's own write: at either it is refused (429) with nothing written.
 * A failed send never undoes the removal; the answer says how many went.
 *
 * It records WHEN (`droppedOutAt`, the field leaving writes) and WHO
 * (`removedByUid`), so the programme's Overview, its Attendance tab and the
 * group's register say the day somebody went, whichever way they went, and
 * Course run's "Taken off the programme" says who took them off and when. And
 * one line on the group's History, under People: "Maya Rao took Rahul Mehta
 * off the run." (`member-taken-off`).
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
 * SOMEBODY WHO GAVE THEIR PLACE BACK ON THE FORM (before Publish told them
 * their group, so their seat stayed where it was put: `gaveTheirPlaceBack`,
 * the board's own answer) is taken off the same way, by the same preview and
 * press: no place goes back, so the sheet does not say one does, and their
 * email says their place has ended "as you asked". Their row on the run's
 * own list is not changed by an ordinary take-off: it stays `accepted`, and
 * Course run lists them under "Taken off the programme".
 *
 * FROM COURSE RUN (`closeRow: true`, an admin's alone), the same take-off of
 * somebody who gave their place back also CLOSES THEIR ROW on the run's own
 * list, in the same transaction: the row goes to `withdrawn` and the run's
 * `applicationCounts` move from accepted to withdrawn, so nothing is left
 * accepted and counted. Refused (409, nothing written) unless the row is one
 * the form put there and still accepted, and the person gave their place back
 * (`gaveTheirPlaceBack`). The sheet, the emails and everything else are the
 * ordinary take-off's. No route reopens a withdrawn row.
 *
 * NOBODY WHO LEFT BY THEMSELVES IS REMOVED. A seat withdrawn by its owner
 * (either door: "Leave the programme" on their programme's page, or "I can’t
 * make it" on their application page once Publish has told them their group)
 * has already freed its place in the group, and turning it into a removal
 * would close the run to them as for somebody staff took off, and take back
 * the page that says they left. So the route refuses it, the preview and the
 * press alike, in a sentence that says they left, and when, and writes
 * nothing. The boards offer no Take off for such a seat either. Nor is a
 * seat recorded as finished (`completed`) taken off: the programme is over
 * for them, and its email would say their place has ended.
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
 * A VISIT STILL TO COME IS CALLED OFF WITH ITS HOST TOLD. Every one-week
 * visit on the place goes with the removal; for each whose session has not
 * started and is happening, the host's facilitators are sent the visit's
 * approved called-off email after the commit (`visitsEndedByRemoval` and
 * `sendRemovalVisitEmails` in `src/lib/courses/visit/removed.ts`), counted
 * with the rest.
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
    public emails: number | null = null,
  ) {
    super(message);
  }
}

/**
 * What stops a seat being taken off, the preview and the press alike, from
 * the seat and the run's groups as read: a facilitator's row, a facilitator
 * who holds a place, somebody who left by themselves, somebody recorded as
 * finished. Throws the refusal;
 * returns when nothing stops it.
 */
function refuseWhatCannotGo(existing: Record<string, unknown>, place: CourseEnrolmentDoc, groups: readonly CourseGroupDoc[], runId: string, uid: string): void {
  if (existing.role === "facilitator") {
    throw new RemoveError("That's a facilitator enrolment. Unassign them in the group editor instead.", 409);
  }
  const facilitated = groups.find((group) => group.runId === runId && !group.archived && group.facilitatorUids.includes(uid));
  if (facilitated && existing.status === "active") {
    throw new RemoveError(facilitatesGroupLine(facilitated.name.trim() || "a group"), 409);
  }
  // Somebody who left by themselves, by either door: their seat is already
  // free, and nothing here is theirs to change. Refused with the day they
  // left, before anything is written (see the note at the top).
  if (existing.status === "withdrawn") throw new RemoveError(leftByThemselvesLine(place.droppedOutAt), 409);
  // Somebody recorded as finished: the programme is over for them, and an
  // email saying their place has ended would be untrue. No board offers it.
  if (existing.status === "completed") throw new RemoveError(FINISHED, 409);
}

const BODY_FIELDS: readonly string[] = ["preview", "emails", "line", "closeRow"];

/** Course run's take-off closes a row only for somebody who gave their place back. */
const ROW_NOT_OPEN = "Their row on the run’s list isn’t open, so there’s nothing to close.";
const STILL_HOLDS_PLACE = "They still hold their place, so their row on the run’s list stays as it is.";

/**
 * The body: none, `{ preview: true }`, or the count of emails the sheet
 * showed and the line for the person; `closeRow: true` from Course run on
 * either. Null when it is malformed.
 */
async function readBody(req: Request): Promise<{ preview: boolean; emails: number; line: unknown; closeRow: boolean } | null> {
  const text = await req.text().catch(() => "");
  if (!text.trim()) return { preview: false, emails: 0, line: undefined, closeRow: false };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // Only the three fields the sheet sends, as a request's own body is held.
  if (Object.keys(raw).some((key) => !BODY_FIELDS.includes(key))) return null;
  const { preview, emails, line, closeRow } = raw as { preview?: unknown; emails?: unknown; line?: unknown; closeRow?: unknown };
  if (preview !== undefined && typeof preview !== "boolean") return null;
  if (emails !== undefined && !(typeof emails === "number" && Number.isInteger(emails) && emails >= 0)) return null;
  if (closeRow !== undefined && typeof closeRow !== "boolean") return null;
  return { preview: preview === true, emails: typeof emails === "number" ? emails : 0, line, closeRow: closeRow === true };
}

export async function POST(req: Request, ctx: Ctx) {
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

  // The gate before the run: somebody with no right on it is answered the
  // same whether the run exists or not. A run that is not there has no
  // track leads, so only an admin or the lead of a programme naming its id
  // is told it is not found.
  const runSnap = runId.includes("/") ? null : await db.collection("courseRuns").doc(runId).get();
  const stored = runSnap && runSnap.exists ? normalizeCourseRun(runSnap.id, runSnap.data() ?? {}) : null;
  const staffing = await runStaffingOf(db, actor, stored ?? { id: runId, trackLeadUids: [] });
  const isAdmin = staffing.isAdmin;
  if (!doesTrackLeadWork(staffing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!stored) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const run = stored;

  // The body first: a malformed one gets the one answer, whoever the uid is.
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Expected no body, or a JSON object." }, { status: 400 });
  const typed = parseTakeOffLine(body.line);
  if (!typed.ok) return NextResponse.json({ error: typed.error }, { status: 400 });
  // Closing a row on the run's own list is Course run's, an admin's section.
  if (body.closeRow && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // A person whose row the board does not serve this caller is answered as a uid with no place, before
  // anything about them is read: the preview's sentences and the press's emails alike.
  const rowRef = db.collection("courseApplications").doc(courseApplicationId(runId, uid));
  const rowSnap = await rowRef.get();
  const row = rowSnap.exists ? normalizeCourseApplication(rowSnap.id, rowSnap.data() ?? {}) : null;
  if (row && !rowIsServedTo(row, staffing)) {
    return NextResponse.json({ error: "Enrolment not found" }, { status: 404 });
  }

  const enrolmentRef = db
    .collection("courseEnrolments")
    .doc(courseEnrolmentId(runId, uid));

  // What every sentence calls the run: the programme that names it, or the course.
  const naming = await readNamingProgramme(db, runId);
  const programmeName = naming?.shortName || run.courseTitle.trim() || "the run";
  const fallbackName = row?.displayName ?? "";

  // Where the seat's place on the form came from, as leaving reads it, and
  // the form it goes back to, read before the transaction (see the note at
  // the top). A round that is no longer a form has no place on it to give
  // back, and the removal goes ahead without it.
  const now = new Date();
  const leaving = await leavePathFor(db, run, uid, now);
  const fromForm = "path" in leaving && leaving.path.kind === "form" ? leaving.path : null;
  const form = fromForm ? await loadForm(db, fromForm.roundId) : null;

  // Whether they gave their place back on the form themselves: the board's
  // own answer, from the facts its cards are drawn from.
  const groupsNow = (await db.collection("courseGroups").where("runId", "==", runId).get()).docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}));
  const placeFacts = row?.fromForm
    ? await formPlaceFactsFor(db, staffing, [row], groupsNow.map((group) => ({ id: group.id, session: group.session })))
    : new Map();
  const askedOf = (place: CourseEnrolmentDoc) => gaveTheirPlaceBack(placeFacts.get(uid), { putBack: enrolmentIsPutBack(place) });

  if (body.preview) {
    // Everything a press would do, read now: writes nothing.
    const snap = await enrolmentRef.get();
    if (!snap.exists || snap.data()?.uid !== uid || snap.data()?.runId !== runId) {
      return NextResponse.json({ error: "Enrolment not found" }, { status: 404 });
    }
    const existing = snap.data() ?? {};
    const place = normalizeCourseEnrolment(snap.id, existing);
    try {
      refuseWhatCannotGo(existing, place, groupsNow, runId, uid);
    } catch (err) {
      if (err instanceof RemoveError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
    if (place.status === "removed") return NextResponse.json({ error: ALREADY_OFF }, { status: 409 });
    if (body.closeRow) {
      if (!row?.fromForm || row.status !== "accepted") return NextResponse.json({ error: ROW_NOT_OPEN }, { status: 409 });
      if (!askedOf(place)) return NextResponse.json({ error: STILL_HOLDS_PLACE }, { status: 409 });
    }
    const givesPlaceBack =
      form !== null && fromForm !== null && place.status === "active" && placeGoingBack(await applicationRef(db, form.round.id, uid).get(), form, fromForm.programmeId, now) !== null;
    const plan = await planTakeOff((refs) => db.getAll(...refs), db, {
      run,
      place,
      groups: groupsNow,
      actor,
      now,
      programmeName,
      givesPlaceBack,
      fallbackName,
      told: placementIsTold(place),
    });
    const limit =
      plan.emails > 0
        ? ((await takeOffLimitRefusal(db, runId, { uid, firstName: plan.facts.firstName }, actor.uid)) ??
          (plan.visits.emails > 0 ? await visitLimitRefusal(db, runId, uid, actor.uid) : null))
        : null;
    return NextResponse.json({
      ok: true,
      preview: {
        emails: plan.emails,
        visits: plan.visits.ended.map((each) => ({ hostName: each.host.name.trim() || "Untitled group", weekNumber: each.weekNumber })),
        sheet: sheetWords(plan.facts),
        limit,
      },
    });
  }

  // What the transaction read and decided, for the emails after the commit.
  let planned: TakeOffPlan | null = null;
  let asked = false;
  try {
    await db.runTransaction(async (tx) => {
      planned = null;
      const [snap, runGroups, rowNow] = await Promise.all([
        tx.get(enrolmentRef),
        // One equality on one field: who facilitates the run's groups.
        tx.get(db.collection("courseGroups").where("runId", "==", runId)),
        // Their row on the run's own list, when Course run closes it.
        body.closeRow ? tx.get(rowRef) : Promise.resolve(null),
      ]);
      if (!snap.exists) throw new RemoveError("Enrolment not found", 404);
      const existing = snap.data() ?? {};

      // The doc id is built from (runId, uid); a mismatch means a hand-made
      // doc. Fail closed rather than remove the wrong person.
      if (existing.uid !== uid || existing.runId !== runId) {
        throw new RemoveError("Enrolment not found", 404);
      }
      const stored = normalizeCourseEnrolment(snap.id, existing);
      const groups = runGroups.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}));
      refuseWhatCannotGo(existing, stored, groups, runId, uid);

      const status = existing.status as CourseEnrolmentStatus;
      // Idempotent: a double-clicked press shouldn't surface a failure, and
      // must not decrement the counter twice or email anybody again.
      if (status === "removed") return;

      // From Course run: their row is closed in this same act, so it has to
      // be open, the form's, and theirs to close.
      const closing = body.closeRow
        ? (() => {
            const fresh = rowNow && rowNow.exists ? normalizeCourseApplication(rowNow.id, rowNow.data() ?? {}) : null;
            if (!fresh?.fromForm || fresh.status !== "accepted") throw new RemoveError(ROW_NOT_OPEN, 409);
            if (!askedOf(stored)) throw new RemoveError(STILL_HOLDS_PLACE, 409);
            return true;
          })()
        : false;

      // The place on the form, read before anything is written (a
      // transaction takes every read first). Only a seat still on the run
      // gives it back. Null when there is no place there to give back, and
      // the removal goes ahead without it.
      const place =
        form && fromForm && status === "active"
          ? await readPlaceToGiveBack(tx, db, form, uid, fromForm.programmeId, now)
          : null;

      // Who it emails, as this transaction read them: the count the sheet
      // showed, or nothing is written.
      const plan = await planTakeOff((refs) => tx.getAll(...refs), db, {
        run,
        place: stored,
        groups,
        actor,
        now,
        programmeName,
        givesPlaceBack: place !== null,
        fallbackName,
        // Their group's facilitators are emailed only once Publish had told them it.
        told: placementIsTold(stored),
      });
      if (plan.emails !== body.emails) throw new RemoveError(changedWords(plan.facts.people), 409, plan.emails);
      // Their word that they are joining online, on the host's register of
      // each visit still to come, goes with the visit (`onlineWordsGoWithVisitsIn`).
      const wordsGo = await onlineWordsGoWithVisitsIn(tx, db, { run, uid, visits: stored.visits ?? [], now });
      // Held to the take-off limits, and a visit still to come to the visits'
      // own, claimed with the removal's own writes.
      const limits = plan.emails > 0 ? await takeOffLimitsIn(tx, db, runId, { uid, firstName: plan.facts.firstName }, actor.uid) : null;
      if (limits?.refusal) throw new RemoveError(limits.refusal, 429);
      const visitLimits = plan.visits.emails > 0 ? await visitLimitsIn(tx, db, runId, uid, actor.uid) : null;
      if (visitLimits?.refusal) throw new RemoveError(visitLimits.refusal, 429);
      limits?.write();
      visitLimits?.write();

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

      // The weeks they spent, or were to spend, at another group's session: kept beside the removal, so a
      // host's register is never taken for the register of a group they belonged to (`listGroups`). A place
      // removed before, put back and removed again keeps the weeks its first removal kept too.
      const visitsWhenRemoved = [
        ...(stored.visitsWhenRemoved ?? []),
        ...(stored.visits ?? []).map((each) => ({ weekNumber: each.weekNumber, groupId: each.groupId })),
      ]
        .filter((each, at, all) => all.findIndex((other) => other.weekNumber === each.weekNumber && other.groupId === each.groupId) === at)
        .sort((a, b) => a.weekNumber - b.weekNumber)
        // Within the stored list's bound, the latest weeks kept: the latest mark is the one asked.
        .slice(-GROUPS_BY_WEEK_LIMITS.entries);
      tx.update(enrolmentRef, {
        status: "removed" satisfies CourseEnrolmentStatus,
        groupId: null,
        // The stamp certifies "emailed about their current group"; there is
        // no current group any more, and a future re-placement must earn a
        // fresh placement email on the next publish.
        allocatedEmailAt: FieldValue.delete(),
        // And the group it was about, beside it, as every writer that
        // clears the stamp clears it.
        toldGroupId: FieldValue.delete(),
        // An answer about the group's time was about a group they are no
        // longer in.
        timeAnswer: FieldValue.delete(),
        // And the record of which group they were in from which week: with
        // no group it would disagree with the place.
        groupsByWeek: FieldValue.delete(),
        // And any one-week visit to another group's session still to come:
        // somebody taken off the run goes to no session of it.
        visits: FieldValue.delete(),
        ...(visitsWhenRemoved.length > 0 ? { visitsWhenRemoved } : {}),
        // WHEN THEY WERE TAKEN OFF, in the field leaving writes, so the
        // programme's Overview, its Attendance tab and the register say
        // "Left Fri 13 Nov" for both kinds of leaving. Somebody who left by
        // themselves never reaches this write (refused above), so the day
        // they left is never overwritten.
        droppedOutAt: FieldValue.serverTimestamp(),
        // AND WHO, for Course run's "Taken off the programme".
        removedByUid: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (place) givePlaceBack(tx, place);
      if (closing) {
        tx.update(rowRef, {
          status: "withdrawn" satisfies CourseApplicationStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(db.collection("courseRuns").doc(runId), {
          "applicationCounts.accepted": FieldValue.increment(-1),
          "applicationCounts.withdrawn": FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      wordsGo();
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
      // One line on the group's History, under People. Never the line typed
      // for the person.
      if (plan.group) {
        tx.create(
          db.collection(COURSE_AUDIT_COLLECTION).doc(),
          groupHistoryRow({
            kind: "member-taken-off",
            run,
            group: plan.group,
            actor: { uid: actor.uid, displayName: actor.displayName ?? "" },
            detail: historyWords(actor.displayName ?? "", plan.historyName),
            emailed: plan.emails,
            subjectUid: uid,
          }),
        );
      }
      planned = plan;
      asked = askedOf(stored);
    });
  } catch (err) {
    if (err instanceof RemoveError) {
      return NextResponse.json({ error: err.message, ...(err.emails !== null ? { emails: err.emails } : {}) }, { status: err.status });
    }
    console.error("[courses remove] transaction failed", runId, uid, err);
    return NextResponse.json({ error: "Couldn't remove that enrolment." }, { status: 500 });
  }

  const done = planned as TakeOffPlan | null;
  // Already off the run: nothing was written, and nobody is emailed again.
  if (!done) return NextResponse.json({ ok: true, emails: { sent: 0, suppressed: 0, failed: 0 }, said: `${ALREADY_OFF} Nobody was emailed.` });

  // Post-commit, best-effort: drop them from the cohort channel so run
  // announcements stop. Failure is acceptable degradation: the removal
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

  // The person, their group's facilitators and each visit's host's, told after the commit.
  const emails = await sendTakeOffEmails(done, { actorUid: actor.uid, runId, runLabel: run.label, asked, line: typed.value });
  const said = doneWords({
    firstName: done.facts.firstName,
    programmeName,
    people: done.facts.people,
    personOnly: done.recipients.length === 1 && done.recipients[0].as === "person" && done.visits.emails === 0,
    emails: done.emails,
    sent: emails.sent,
  });
  return NextResponse.json({ ok: true, emails, said });
}
