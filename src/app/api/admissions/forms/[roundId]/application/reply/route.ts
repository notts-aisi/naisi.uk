import { NextResponse } from "next/server";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { requireApplicant } from "@/lib/admissions/applicantSession";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { approveAfterAcceptedInvitation } from "@/lib/applications/accounts/afterReply";
import { isId } from "@/lib/applications/keys";
import { loadForm, loadOwnApplication } from "@/lib/applications/repo";
import { projectApplicationForOwner } from "@/lib/applications/applicant/project";
import {
  APPLICANT_RATE_LIMITS,
  TOO_MANY_ATTEMPTS,
  readJsonBody,
  tooManyAttempts,
} from "@/lib/applications/applicant/requests";
import { ApplicantError, FORM_NOT_FOUND } from "@/lib/applications/applicant/store";
import { isFormVisible } from "@/lib/applications/applicant/window";
import { recordReply } from "@/lib/applications/status/record";
import { isReply } from "@/lib/applications/status/replies";

/**
 * An applicant's reply to what decision day told them.
 *
 * The body is `{ reply }`, one of four: `coming` and `cant-make-it` from
 * somebody who holds a place, `accept-invitation` and `decline-invitation`
 * from somebody who was invited. What each does, and every refusal, is
 * decided in `src/lib/applications/status/replies.ts` against the caller's
 * own application as it stands inside the transaction that writes it.
 *
 * ## What it touches
 *
 * The caller's OWN application, addressed by the session's uid, and the
 * form's counters when the reply moves the application's status. It reads no
 * decision and no review, which is why it cannot be asked about anybody's
 * outcome but the one already published on the caller's own document.
 *
 * ## Accepting an invitation approves an account that is still waiting
 *
 * The one reply that turns an invitation into a place (`tookPlace`) is an
 * acceptance, so once it has been written the caller's own account is
 * approved if it was waiting, in the name of the admin who sent the
 * decisions. That happens AFTER the reply's transaction has committed and
 * can never fail the reply: the rule, and why, is in
 * `src/lib/applications/accounts/afterReply.ts`. No other reply, and no
 * other kind of account, is touched.
 *
 * ## What it does not do
 *
 * It emails nobody.
 *
 * ## A form a stranger may not learn about
 *
 * A form that is still a draft, or has been archived, answers a caller with
 * no application on it exactly as a form that does not exist. Somebody who
 * did apply on it can still reply, as they can still read their page.
 */

type Ctx = { params: Promise<{ roundId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  // Before the session is looked up, so a flood costs nothing but a count.
  const limits = APPLICANT_RATE_LIMITS;
  const ipHit = rateLimit(`applications:reply:ip:${clientIp(req)}`, limits.sendIpMax, limits.windowMs);
  if (!ipHit.ok) {
    return NextResponse.json(
      { error: TOO_MANY_ATTEMPTS },
      { status: 429, headers: { "Retry-After": String(ipHit.retryAfterSeconds) } },
    );
  }

  const caller = await requireApplicant();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const uidHit = rateLimit(`applications:reply:uid:${user.uid}`, limits.sendUidMax, limits.windowMs);
  if (!uidHit.ok) return tooManyAttempts(uidHit.retryAfterSeconds);

  // The body is checked before any document is read.
  const body = await readJsonBody(req);
  const reply = body?.reply;
  if (!isReply(reply)) {
    return NextResponse.json(
      { error: "That reply was not one this page sends. Reload the page and try again." },
      { status: 400 },
    );
  }

  // Set once the form is in hand: whether a caller with no application on it
  // may be told that it exists.
  let hidden = true;
  try {
    const now = new Date();
    const form = isId(roundId) ? await loadForm(db, roundId) : null;
    if (!form) return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });
    hidden = !isFormVisible(form, now);

    const recorded = await recordReply(db, form, user.uid, reply, now);
    // After the reply has committed. It answers, and never throws.
    if (recorded.tookPlace) await approveAfterAcceptedInvitation(db, form, user.uid);

    const mine = await loadOwnApplication(db, form, user.uid);
    return NextResponse.json({
      ok: true,
      changed: recorded.changed,
      application: mine ? projectApplicationForOwner(mine) : null,
    });
  } catch (err) {
    if (err instanceof ApplicantError) {
      // No application of theirs on a form they may not be told about.
      if (hidden && err.status === 404) {
        return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });
      }
      return err.toResponse();
    }
    console.error("[applications] reply failed", roundId, err);
    return NextResponse.json({ error: "Could not record your reply." }, { status: 500 });
  }
}
