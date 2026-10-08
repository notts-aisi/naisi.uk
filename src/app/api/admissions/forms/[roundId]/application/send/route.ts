import { NextResponse } from "next/server";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { requireApplicant } from "@/lib/admissions/applicantSession";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { loadOwnApplication } from "@/lib/applications/repo";
import { sendHoldFor } from "@/lib/applications/applicant/join";
import { projectApplicationForOwner } from "@/lib/applications/applicant/project";
import {
  APPLICANT_RATE_LIMITS,
  TOO_MANY_ATTEMPTS,
  applicationsPaused,
  tooManyAttempts,
} from "@/lib/applications/applicant/requests";
import {
  ApplicantError,
  FORM_NOT_FOUND,
  loadAccount,
  loadVisibleForm,
  sendApplication,
} from "@/lib/applications/applicant/store";
import { formWindowRefusal } from "@/lib/applications/applicant/window";

/**
 * Send an application: the one act that turns what somebody has been writing
 * into the application the committee reads.
 *
 * ## It takes no answers
 *
 * The request has no content in it. The send reads the draft that is STORED,
 * holds it to the form (`issuesFor`), and when nothing is wrong copies it
 * into `sent`, all in one transaction (`applicant/store.ts`). The form saves
 * first and then calls this, so what is read by a reviewer is exactly what
 * the applicant last saw the site say it had saved.
 *
 * When something is missing the answer is a 400 carrying `issues`: each one
 * names the step to go back to and says what is wrong in a sentence.
 *
 * ## It can be pressed again
 *
 * An applicant can change their answers until the form closes. Each send
 * replaces `sent` whole. Only the first one changes the application's status,
 * and that one moves the round's counters in the same transaction.
 *
 * ## It waits for a join request, and for the university address
 *
 * Saving never waits for either. Sending does, and the two reasons are in
 * `sendHoldFor` (`applicant/join.ts`): an account that has signed in and
 * never sent a join request has no name or address to put in front of a
 * reviewer, and an account that is still waiting to be approved has to have
 * followed the link emailed to its university address first, because being
 * accepted approves it. Both are read off the caller's own account, never
 * off the draft or the request, and both answer as a missing answer does: a
 * 400 with one issue that names the step to go to.
 *
 * ## Nothing is sent to anybody
 *
 * This route writes one document and emails nobody. Everybody hears on
 * decision day, which is a different route and an admin's to press.
 */

type Ctx = { params: Promise<{ roundId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  // Before the session is looked up, so a flood costs nothing but a count.
  const limits = APPLICANT_RATE_LIMITS;
  const ipHit = rateLimit(`applications:send:ip:${clientIp(req)}`, limits.sendIpMax, limits.windowMs);
  if (!ipHit.ok) {
    return NextResponse.json(
      { error: TOO_MANY_ATTEMPTS },
      { status: 429, headers: { "Retry-After": String(ipHit.retryAfterSeconds) } },
    );
  }

  const caller = await requireApplicant();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const uidHit = rateLimit(`applications:send:uid:${user.uid}`, limits.sendUidMax, limits.windowMs);
  if (!uidHit.ok) return tooManyAttempts(uidHit.retryAfterSeconds);

  try {
    const now = new Date();
    const loaded = await loadVisibleForm(db, roundId, now);
    if (!loaded) return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });

    const refusal = formWindowRefusal(loaded.form, now);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

    const paused = await applicationsPaused(db);
    if (paused) return NextResponse.json({ error: paused }, { status: 503 });

    const account = await loadAccount(db, user.uid);
    const hold = sendHoldFor({ joined: account.joined, role: user.role, about: account.about });
    if (hold) {
      return NextResponse.json(
        {
          error: hold.message,
          issues: [{ step: hold.step, questionId: hold.questionId, message: hold.message }],
        },
        { status: 400 },
      );
    }

    const outcome = await sendApplication(
      db,
      loaded,
      {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName?.trim() || account.about.preferredName,
      },
      account.about,
    );

    const sent = await loadOwnApplication(db, loaded.form, user.uid);
    return NextResponse.json({
      ok: true,
      first: outcome === "sent",
      application: sent ? projectApplicationForOwner(sent) : null,
    });
  } catch (err) {
    if (err instanceof ApplicantError) return err.toResponse();
    console.error("[applications] send failed", roundId, err);
    return NextResponse.json({ error: "Could not send your application." }, { status: 500 });
  }
}
