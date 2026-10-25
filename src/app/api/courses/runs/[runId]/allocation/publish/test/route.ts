import { NextResponse } from "next/server";
import { loadPublishPlan, pressBatch, recordPublishTest } from "@/lib/courses/allocationPublish";
import { PUBLISH_ADMIN_ONLY } from "@/lib/courses/publishWords";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { sendCourseApplicationEmail, type CourseEmailDelivery } from "@/lib/email/courseApplicationEmails";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseApplication, rowIsServedTo } from "@/lib/firestore/courseApplications";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * "Send a test to me" on a run's allocation board: the first person's real
 * "your group" email and the first facilitator's real "You’re facilitating"
 * email, exactly as a press of Publish would send them now, each marked as a
 * test, to the address on the caller's own session.
 *
 * THE SAME CALLERS AS PUBLISH, decided the same way: an admin, the lead of
 * the programme that names the run, or one of the run's track leads on a run
 * the application form does not fill. The address is the session's and is
 * never taken from the request, so a test reaches nobody but whoever asked
 * for it. It tells no applicant or facilitator anything, and stamps no
 * enrolment and no marker.
 *
 * A TEST THAT REACHES ITS SENDER IS RECORDED against the run, with the
 * wording it was made from (`recordPublishTest`), and Publish refuses to send
 * until there is one for the wording in force. A test this copy of the site
 * held, or one to an address on the do-not-email list, reached nobody and is
 * not recorded.
 *
 * "The first" is the first a press would send: `pressBatch` puts the people
 * owed an email first and the facilitators after, each in the plan's order.
 * When a press would send nobody of one kind, the test has no email of that
 * kind to show, and sends the other alone.
 */

type Ctx = { params: Promise<{ runId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!actor.email) {
    return NextResponse.json(
      { error: "Your account has no email address on file, so there is nowhere to send a test." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  const staffing = await runStaffingOf(db, actor, run);
  if (!doesTrackLeadWork(staffing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The run's rows, each asked who it is served to with the caller's own
  // standing on the run, exactly as Publish reads them: the test is
  // Publish's first emails.
  const appSnap = await db.collection("courseApplications").where("runId", "==", runId).limit(500).get();
  const rows = appSnap.docs.map((d) => normalizeCourseApplication(d.id, d.data() ?? {}));
  const served = rows.filter((a) => rowIsServedTo(a, staffing));
  const accepted = served.filter((a) => a.status === "accepted");
  const plan = await loadPublishPlan(db, run, {
    accepted,
    adminOnly: served.length < rows.length,
  });
  if (plan.adminOnly) return NextResponse.json({ error: PUBLISH_ADMIN_ONLY }, { status: 403 });
  if (plan.refusals.length > 0) {
    return NextResponse.json(
      { error: ["No test was sent.", ...plan.refusals].join(" "), reasons: plan.refusals },
      { status: 409 },
    );
  }

  const batch = pressBatch(plan);
  const person = batch.people.find((candidate) => candidate.email) ?? null;
  const facilitator = batch.facilitators.find((candidate) => candidate.email) ?? null;
  const letters = [
    ...(person?.email ? [{ kind: "allocated" as const, email: person.email }] : []),
    ...(facilitator?.email ? [{ kind: "facilitating" as const, email: facilitator.email }] : []),
  ];
  if (letters.length === 0) {
    return NextResponse.json(
      { error: "Publishing now would send no email, so there is nothing to test." },
      { status: 409 },
    );
  }

  const deliveries: CourseEmailDelivery[] = [];
  try {
    for (const letter of letters) {
      deliveries.push(
        await sendCourseApplicationEmail({
          kind: letter.kind,
          to: actor.email,
          composed: letter.email,
          fromName: plan.templates[letter.kind].fromName,
          uid: actor.uid,
          runId,
          test: true,
        }),
      );
    }
  } catch (err) {
    console.error("[allocation publish test] send failed", runId, err);
    return NextResponse.json({ error: "That test could not be sent. Try again in a minute." }, { status: 502 });
  }

  // Held or suppressed: nothing reached anybody, so it is not a test.
  const delivery: CourseEmailDelivery = deliveries.includes("held")
    ? "held"
    : deliveries.includes("suppressed")
      ? "suppressed"
      : "sent";
  if (delivery !== "sent") {
    return NextResponse.json({ ok: true, delivery, emails: letters.length, recorded: false });
  }
  try {
    await recordPublishTest(db, runId, actor.uid, plan.wording);
  } catch (err) {
    console.error("[allocation publish test] could not record the test", runId, err);
    return NextResponse.json(
      { error: "The test was sent to you, but it could not be recorded. Send it again in a minute." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, delivery, emails: letters.length, recorded: true });
}
