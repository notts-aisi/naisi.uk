import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import ApplicationEmail from "@/emails/ApplicationEmail";
import { formPlaceFactsFor } from "@/lib/applications/handover/board";
import { loadPublishPlan, pressBatch, type PlannedFacilitator, type PlannedPerson } from "@/lib/courses/allocationPublish";
import type { PreviewEmail, PreviewKind, PublishPreview } from "@/lib/courses/getReady/preview";
import { fullNameOfUser } from "@/lib/courses/programmeLead";
import { PUBLISH_ADMIN_ONLY } from "@/lib/courses/publishWords";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseApplication, rowIsServedTo } from "@/lib/firestore/courseApplications";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * PUBLISH'S TWO EMAILS, AS EACH PERSON WILL GET THEM (board st-publish), for
 * Publish's own page: who a press emails, by name, and the first email of
 * each kind, drawn exactly as the mail door draws it.
 *
 * THE SAME CALLERS AS PUBLISH, decided the same way: an admin, the lead of
 * the programme that names the run, or one of the run's track leads on a run
 * the application form does not fill (`runStaffingOf`), and nobody the run
 * holds a row from the form for who is not served it (`rowIsServedTo`).
 *
 * THE SAME EMAILS AS A PRESS. The plan is Publish's own (`loadPublishPlan`),
 * read as the press and "Send a test to me" read it, and the people and
 * facilitators named are the ones a press sends to now (`pressBatch`), in
 * the order it sends them. The email shown of each kind is the first one a
 * press would send, the one "Send a test to me" sends its presser, and it is
 * drawn by the template the mail door draws every course email with
 * (`ApplicationEmail`, given the subject, the blocks and the subject again
 * as the preheader, as `sendCourseApplicationEmail` gives them), so its
 * bytes are the email's own. Nothing is sent, stamped or recorded.
 *
 * NO ADDRESS LEAVES: names, the subject and the email's own body, which
 * carries none (a group's page and a programme's page are this site's).
 * Who it is from and where replies go are the mail door's own settings.
 */

type Ctx = { params: Promise<{ runId: string }> };

/** Each person once, in the order given, by the whole name on their account. */
function namesOf(
  recipients: readonly (PlannedPerson | PlannedFacilitator)[],
  fullName: (uid: string, fallback: string) => string,
): PreviewKind["names"] {
  const seen = new Set<string>();
  const names: PreviewKind["names"] = [];
  for (const recipient of recipients) {
    if (seen.has(recipient.uid)) continue;
    seen.add(recipient.uid);
    names.push({ uid: recipient.uid, name: fullName(recipient.uid, recipient.name) });
  }
  return names;
}

async function drawn(
  recipient: PlannedPerson | PlannedFacilitator | null,
  fromName: string | undefined,
  fullName: (uid: string, fallback: string) => string,
): Promise<PreviewEmail | null> {
  if (!recipient?.email) return null;
  const { subject, blocks } = recipient.email;
  return {
    to: fullName(recipient.uid, recipient.name),
    subject,
    // The mail door's own: the template's sender name, else the site's.
    from: fromName ?? process.env.SMTP_FROM_NAME ?? "NAISI",
    replyTo: process.env.EMAIL_DEFAULT_REPLY_TO?.trim() || null,
    html: await render(ApplicationEmail({ subject, blocks, preheader: subject })),
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
  // standing on the run, exactly as Publish reads them.
  const appSnap = await db.collection("courseApplications").where("runId", "==", runId).limit(500).get();
  const rows = appSnap.docs.map((d) => normalizeCourseApplication(d.id, d.data() ?? {}));
  const served = rows.filter((a) => rowIsServedTo(a, staffing));
  const accepted = served.filter((a) => a.status === "accepted");
  // As Publish reads it: a card that says "Gave their place back" is nobody
  // the press writes to, so their email is never shown either.
  const formPlaces = await formPlaceFactsFor(db, staffing, accepted.filter((a) => a.fromForm !== null), []);
  const plan = await loadPublishPlan(db, run, {
    accepted,
    adminOnly: served.length < rows.length,
    formPlaces,
  });
  if (plan.adminOnly) return NextResponse.json({ error: PUBLISH_ADMIN_ONLY }, { status: 403 });

  const batch = pressBatch(plan);
  // The whole name on each account, as the programme's tabs name people.
  const uids = [...new Set([...batch.people, ...batch.facilitators].map((recipient) => recipient.uid))];
  const accounts = uids.length ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid))) : [];
  const nameByUid = new Map(accounts.filter((snap) => snap.exists).map((snap) => [snap.id, fullNameOfUser(snap.data() ?? {})] as const));
  const fullName = (uid: string, fallback: string) => nameByUid.get(uid) ?? fallback;

  const person = batch.people.find((candidate) => candidate.email) ?? null;
  const facilitator = batch.facilitators.find((candidate) => candidate.email) ?? null;
  const preview: PublishPreview = {
    incubator: plan.incubator,
    people: {
      emails: batch.people.length,
      names: namesOf(batch.people, fullName),
      email: await drawn(person, plan.templates.allocated.fromName, fullName),
    },
    facilitators: {
      emails: batch.facilitators.length,
      names: namesOf(batch.facilitators, fullName),
      email: await drawn(facilitator, plan.templates.facilitating.fromName, fullName),
    },
    refusals: plan.refusals,
  };
  return NextResponse.json(preview);
}
