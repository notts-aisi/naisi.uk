import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { sendCourseApplicationEmail, type CourseEmailDelivery } from "@/lib/email/courseApplicationEmails";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  claimFacilitatorEmail,
  loadPublishPlan,
  pressBatch,
  publishTestBlocker,
  releasePressLock,
  settleFacilitatorEmail,
  takePressLock,
  type PlannedFacilitator,
  type PlannedPerson,
} from "@/lib/courses/allocationPublish";
import { emptyPublishReport, PUBLISH_ADMIN_ONLY, type PublishReport } from "@/lib/courses/publishWords";
import { normalizeCourseApplication, rowIsServedTo } from "@/lib/firestore/courseApplications";
import { courseEnrolmentId } from "@/lib/firestore/courseEnrolments";
import { courseRunChannel, normalizeCourseRun } from "@/lib/firestore/courses";
import { subscribe } from "@/lib/firestore/subscriptions";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { mirrorCourseDecisionToPush } from "@/lib/push/courseNotifications";

/**
 * Publish the allocation: the moment placements stop being a draft on a board
 * and become the cohort. Everyone placed gets their "your group" email and
 * joins the run's cohort channel, and each facilitator of a group with
 * somebody in it gets "You’re facilitating", once per group.
 *
 * WHO MAY PUBLISH: admins ∪ the run's `trackLeadUids`, the same gate as the
 * board and the allocate route. A RUN THE APPLICATION FORM FILLS IS AN
 * ADMIN'S: when any row the form wrote is on the run, anybody else is refused
 * with a sentence, before anything is done.
 *
 * WHAT A PRESS DOES, AND WHAT STOPS IT, is worked out by `loadPublishPlan`
 * (`src/lib/courses/allocationPublish.ts`), the same plan the board's count
 * and "Send a test to me" read, so the three cannot disagree. Every refusal
 * below happens before anything is stamped or sent:
 *
 *  1. "EVERYONE PLACED" IS A PRECONDITION. Publishing refuses (409, with
 *     names) while any accepted applicant lacks an active, grouped
 *     enrolment. Somebody with no seat would silently never be told.
 *  2. SO IS "EVERY EMAIL CAN BE WRITTEN". Each person's email and each
 *     facilitator's is composed before anything goes, and publishing refuses
 *     (409) with sentences an admin can act on when one cannot be. NO EMAIL
 *     FROM THIS ROUTE CARRIES AN UNFILLED TOKEN OR A MEETING LINK.
 *  3. A TEST FIRST. A press that would send an email is refused until
 *     somebody has sent themselves a test of the wording in force now
 *     ("Send a test to me", the `test` route beside this one). Changing the
 *     wording in Email designs needs a fresh test.
 *  4. THE NUMBER ON THE BUTTON IS A PROMISE. The body says how many emails
 *     the board showed, and the press is refused when that is no longer
 *     what it would send.
 *  5. ONE PRESS AT A TIME. A press holds the run while it works
 *     (`takePressLock`), and reads its plan only once it holds it, so two
 *     presses cannot both send to the same people.
 *
 * RE-PUBLISH IS EXPECTED, not an error: late acceptances get placed, someone
 * gets moved, publish runs again and reaches exactly the people owed an
 * email. A person's `enrolment.allocatedEmailAt` is written after their
 * email went (a move clears it), and a facilitator's marker is claimed before
 * theirs goes and given back if it fails. The run-level
 * `allocationPublishedAt` re-stamps on every publish.
 *
 * WHAT HAPPENED IS SAID IN FULL: the answer counts what went to people and to
 * facilitators, what this copy of the site held, what the do-not-email list
 * stopped, whose send failed (they are still owed, and the next press tries
 * them) and who has no address. The board turns that into sentences with
 * `publishResultLines`.
 *
 * This mail is TRANSACTIONAL (the recipient is owed it), so it goes to the
 * proven `users.email` directly rather than through the notification
 * preferences. The cohort-channel subscribe beside it is what the later
 * announcement emails fan out over.
 *
 * It is also one of the two moments that PUSH: being placed is an answer the
 * member has been waiting for. The push is mirrored, for each person whose
 * email went, in a second pass after the email loop, respects their
 * `notifications.push.courses` switch, names the course and the group and
 * nothing else, and cannot fail a publish. Facilitators are not pushed.
 */

type Ctx = { params: Promise<{ runId: string }> };

/**
 * Hard cap on the placement pushes, which are sent in a second pass AFTER the
 * email loop and therefore on whatever is left of the same 60s budget once
 * the cap on emails and its pacing sleeps have spent most of it. Each push is
 * one Firestore read plus a POST per enabled device.
 *
 * Recipients past this cap keep their email and their stamp and simply get no
 * notification, and a re-publish will not send it later (the stamp is already
 * written). That is the right way round: the mirror only repeats what the
 * email already said, so losing it costs the member nothing.
 */
const MAX_PUSHES_PER_REQUEST = 50;

const SLEEP_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** One email this press sends: a person's, or a facilitator's. */
type Letter =
  | { kind: "allocated"; who: PlannedPerson }
  | { kind: "facilitating"; who: PlannedFacilitator };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The number the board showed on its button, read before any document.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const emails = raw && typeof raw === "object" ? (raw as { emails?: unknown }).emails : undefined;
  if (typeof emails !== "number" || !Number.isInteger(emails) || emails < 0) {
    return NextResponse.json(
      { error: "Say how many emails this press is for. Reload the page and press Publish again." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runRef = db.collection("courseRuns").doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  const isAdmin = actor.role === "admin";
  const isTrackLead = isNamedWithStanding(
    actor,
    "courseRuns.trackLeadUids",
    run.trackLeadUids,
  );
  if (!isAdmin && !isTrackLead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── One press at a time ───────────────────────────────────────────────────
  // Held before the plan is read, so a second press reads what the first one
  // left and cannot send to anybody it told.
  const lock = await takePressLock(db, runId, actor.uid);
  if (!lock.ok) {
    return NextResponse.json(
      {
        error: "Another press of Publish for this run is still sending. Wait a minute, then reload the page.",
        unplaced: [],
      },
      { status: 409 },
    );
  }

  try {
    // A row the application form put here is an admin's (`rowIsServedTo`):
    // a run that holds one is an admin's to publish, and anybody else's press
    // is refused below without a word about who is on it.
    const appSnap = await db.collection("courseApplications").where("runId", "==", runId).limit(500).get();
    const rows = appSnap.docs.map((d) => normalizeCourseApplication(d.id, d.data() ?? {}));
    const accepted = rows.filter((a) => a.status === "accepted" && rowIsServedTo(a, { isAdmin }));
    const plan = await loadPublishPlan(db, run, {
      accepted,
      adminOnly: !isAdmin && rows.some((row) => row.fromForm !== null),
    });
    if (plan.adminOnly) {
      return NextResponse.json({ error: PUBLISH_ADMIN_ONLY, unplaced: [] }, { status: 403 });
    }

    // ── The preconditions ───────────────────────────────────────────────────
    if (plan.unplaced.length > 0) {
      const n = plan.unplaced.length;
      return NextResponse.json(
        {
          error: `${n} accepted applicant${n === 1 ? " is" : "s are"} not placed in a group yet. Everyone must be placed before allocation can be published.`,
          unplaced: plan.unplaced,
        },
        { status: 409 },
      );
    }
    if (plan.refusals.length > 0) {
      return NextResponse.json(
        {
          error: ["Nothing was published and nobody was emailed.", ...plan.refusals].join(" "),
          reasons: plan.refusals,
          unplaced: [],
        },
        { status: 409 },
      );
    }

    const batch = pressBatch(plan);
    if (batch.emails > 0) {
      const untested = publishTestBlocker(plan.test.state);
      if (untested) {
        return NextResponse.json({ error: `Nothing was published. ${untested}`, unplaced: [] }, { status: 409 });
      }
    }
    if (batch.emails !== emails) {
      const would = `${batch.emails} ${batch.emails === 1 ? "email" : "emails"}`;
      return NextResponse.json(
        {
          error: `Nothing was published. Since this page loaded, publishing has come to send ${would}, not ${emails}. Reload the page and check again.`,
          unplaced: [],
        },
        { status: 409 },
      );
    }

    // The publish fact, stamped before the sends: re-publish is allowed and
    // re-stamps. If the process dies mid-send, the stamps and markers record
    // exactly who was reached, and running publish again finishes the job.
    await runRef.update({
      allocationPublishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const channel = courseRunChannel(runId);
    const actorLabel =
      actor.displayName?.trim() || (isAdmin ? "Admin" : "Track lead");
    const report: PublishReport = { ...emptyPublishReport(), noAddress: batch.noAddress, more: batch.more };
    const fromName = {
      allocated: plan.templates.allocated.fromName,
      facilitating: plan.templates.facilitating.fromName,
    };
    /** People whose email went, for the push pass below the loop. */
    const placed: { uid: string; groupName: string }[] = [];
    const counted = (letter: Letter, delivery: CourseEmailDelivery) => {
      const side = letter.kind === "allocated" ? report.people : report.facilitators;
      side[delivery] += 1;
    };

    // WHO THIS PRESS WRITES TO is the plan's decision, never the request's:
    // the people owed their group's email, then the facilitators owed theirs,
    // in the order and to the number the board showed.
    const peopleRecipients = batch.people;
    const facilitatorRecipients = batch.facilitators;
    const letters: Letter[] = [
      ...peopleRecipients.map((who): Letter => ({ kind: "allocated", who })),
      ...facilitatorRecipients.map((who): Letter => ({ kind: "facilitating", who })),
    ];
    for (const letter of letters) {
      const { who } = letter;
      // `pressBatch` takes only people with an address and an email written.
      if (!who.to || !who.email) continue;

      if (letter.kind === "facilitating") {
        // Claimed before it goes: of two presses, only one can send it.
        if (!(await claimFacilitatorEmail(db, runId, letter.who, actor.uid))) {
          report.alreadyTold += 1;
          continue;
        }
      } else {
        // Channel membership first, then the email that mentions the course.
        // `confirmed: true` via `inboxProven`: this is the account's own
        // sign-in address. Non-fatal: a bookkeeping failure must not block
        // the email the person is owed.
        try {
          await subscribe(db, {
            email: who.to,
            channel,
            audience: "user",
            audienceId: who.uid,
            source: "course-allocation",
            actor: {
              kind: isAdmin ? "admin" : "member",
              uid: actor.uid,
              label: actorLabel,
            },
            inboxProven: true,
            name: who.name,
          });
        } catch (err) {
          console.warn("[allocation publish] subscribe failed", runId, who.uid, err);
        }
      }

      try {
        const delivery = await sendCourseApplicationEmail({
          kind: letter.kind,
          to: who.to,
          composed: who.email,
          fromName: fromName[letter.kind],
          uid: who.uid,
          runId,
        });

        if (letter.kind === "allocated") {
          // The stamp goes AFTER the send: it is the once-only guard, so it
          // must record "told", never "tried". A held or a suppressed email
          // is settled too, as decision day settles one: it is not retried.
          await db
            .collection("courseEnrolments")
            .doc(courseEnrolmentId(runId, who.uid))
            .update({
              allocatedEmailAt: FieldValue.serverTimestamp(),
              allocatedEmailDelivery: delivery,
              updatedAt: FieldValue.serverTimestamp(),
            });
          // Owed the mirror push only when the email really went. Recorded
          // here and sent after the loop, never inside it: see the pass below.
          if (delivery === "sent") placed.push({ uid: who.uid, groupName: who.groupName });
        } else {
          await settleFacilitatorEmail(db, letter.who, delivery);
        }
        counted(letter, delivery);
        await sleep(SLEEP_MS);
      } catch (err) {
        // Per recipient: one bad address must not strand the rest. Nothing
        // records them as told, so the next press tries them again.
        console.error("[allocation publish] send failed", runId, letter.kind, who.uid, err);
        if (letter.kind === "facilitating") {
          await settleFacilitatorEmail(db, letter.who, "failed").catch((release) => {
            console.error("[allocation publish] could not give a facilitator's claim back", runId, who.uid, release);
          });
        }
        report.failed.push(who.name);
      }
    }

    // THE PLACEMENT PUSH PASS, over the people this press emailed.
    //
    // Deliberately not inside the loop above. There, each push added a serial
    // Firestore read and an un-timed HTTPS POST per device to a body already
    // spending SLEEP_MS per recipient under a 60s request budget, so a slow
    // push service could eat the budget the EMAILS need. Out here every email
    // and every once-only stamp is already written, so a request that dies
    // mid-pass loses only a mirror of something already sent.
    //
    // Hanging the pass off the stamps keeps the exactly-once property: a
    // re-publish only reaches the newly stamped.
    //
    // Awaited, because Cloud Run may reap work that outlives the response. The
    // mirror never throws, and with no VAPID configuration it returns before
    // doing any I/O at all.
    for (const { uid, groupName } of placed.slice(0, MAX_PUSHES_PER_REQUEST)) {
      await mirrorCourseDecisionToPush(uid, {
        title: "You've got a place",
        // `groupName` is a group's name: committee-authored text, not member
        // text, so it is interpolated rather than passed through MemberText.
        body: `${run.courseTitle}: you're in ${groupName}. The details are in your email.`,
        url: `/learn/${encodeURIComponent(runId)}`,
      });
    }

    return NextResponse.json({ ok: true, report, unplaced: [] });
  } finally {
    await releasePressLock(db, runId, lock.token).catch((err) => {
      console.error("[allocation publish] could not release the run", runId, err);
    });
  }
}
