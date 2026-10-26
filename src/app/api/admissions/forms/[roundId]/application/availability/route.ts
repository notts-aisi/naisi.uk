import { NextResponse } from "next/server";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { requireApplicant } from "@/lib/admissions/applicantSession";
import { clientIp, rateLimit } from "@/lib/rateLimit";
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
import { changeWhenFree, readFreeDays } from "@/lib/applications/status/whenFree";

/**
 * "Change when you’re free" (Q7: boards st-application-phone, st-late-phone):
 * `PUT` with `{ days }`, the week painted on the form's own grid, from the
 * caller's own application page.
 *
 * Somebody holding a place on a fellowship may change it until Publish has
 * told them their group. Who, what and every refusal are
 * `src/lib/applications/status/whenFree.ts`; this route reads the body before
 * any document, holds the caller to the applicant's gate and the send's rate
 * limits, and answers with their own application as it now stands. A view-as
 * session is refused first: the application is its owner's.
 *
 * A form that is still a draft, or has been archived, answers a caller with
 * no application on it exactly as a form that does not exist.
 */

type Ctx = { params: Promise<{ roundId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  // Before the session is looked up, so a flood costs nothing but a count.
  const limits = APPLICANT_RATE_LIMITS;
  const ipHit = rateLimit(`applications:free:ip:${clientIp(req)}`, limits.sendIpMax, limits.windowMs);
  if (!ipHit.ok) {
    return NextResponse.json(
      { error: TOO_MANY_ATTEMPTS },
      { status: 429, headers: { "Retry-After": String(ipHit.retryAfterSeconds) } },
    );
  }

  const caller = await requireApplicant();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const uidHit = rateLimit(`applications:free:uid:${user.uid}`, limits.sendUidMax, limits.windowMs);
  if (!uidHit.ok) return tooManyAttempts(uidHit.retryAfterSeconds);

  // The body is checked before any document is read.
  const parsed = readFreeDays(await readJsonBody(req));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let hidden = true;
  try {
    const now = new Date();
    const form = isId(roundId) ? await loadForm(db, roundId) : null;
    if (!form) return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });
    hidden = !isFormVisible(form, now);

    const { changed } = await changeWhenFree(db, form, user.uid, parsed.days, now);
    const mine = await loadOwnApplication(db, form, user.uid);
    return NextResponse.json({ ok: true, changed, application: mine ? projectApplicationForOwner(mine) : null });
  } catch (err) {
    if (err instanceof ApplicantError) {
      if (hidden && err.status === 404) return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });
      return err.toResponse();
    }
    console.error("[applications] when you’re free failed", roundId, err);
    return NextResponse.json({ error: "Could not save when you’re free." }, { status: 500 });
  }
}
