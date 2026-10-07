import { NextResponse } from "next/server";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { requireApplicant } from "@/lib/admissions/applicantSession";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import {
  loadOwnAccessRequirements,
  readAccessRequirementsInput,
  saveOwnAccessRequirements,
} from "@/lib/applications/applicant/accessRequirements";
import {
  APPLICANT_RATE_LIMITS,
  TOO_MANY_ATTEMPTS,
  readJsonBody,
  tooManyAttempts,
} from "@/lib/applications/applicant/requests";
import { ApplicantError, FORM_NOT_FOUND, loadVisibleForm } from "@/lib/applications/applicant/store";
import { formWindowRefusal } from "@/lib/applications/applicant/window";

/**
 * One person's own access-requirements answer on an application form.
 *
 *   GET - what the caller wrote, to put back in their own box
 *   PUT - save what the caller has typed
 *
 * The answer is kept apart from the application and is not part of the draft
 * or of what is sent, so it has a route of its own and the application's
 * routes beside this one never carry it. Where it is stored, and why, is in
 * `src/lib/applications/applicant/accessRequirementsDoc.ts`.
 *
 * ## Whose answer
 *
 * The caller's, always. The row is addressed by the SESSION's uid, so there
 * is no id in the path or the body that could name somebody else's.
 *
 * ## Refused during a view-as session, the read included
 *
 * "Only ever the caller's own" is exactly what a view-as session breaks: it
 * swaps the session for the member's, so the uid addressed here would be the
 * member's and the read would hand an admin that person's answer with nothing
 * recording it. An admin reads this answer through the staff route, where
 * every read is recorded. So both handlers refuse while a view-as session is
 * live, the GET as well as the PUT.
 *
 * ## The same window as the draft
 *
 * A save is refused outside the form's window with the sentence a draft save
 * is refused with. A form that is still a draft, or archived, answers with the
 * same 404 as a round that does not exist.
 */

type Ctx = { params: Promise<{ roundId: string }> };

/** An answer is for the page that asked for it and is not to be kept by anything in between. */
const NOT_KEPT = { "Cache-Control": "no-store" };

export async function GET(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  const caller = await requireApplicant();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  try {
    const loaded = await loadVisibleForm(db, roundId, new Date());
    if (!loaded) return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });
    const accessRequirements = await loadOwnAccessRequirements(db, loaded.form, user.uid);
    return NextResponse.json({ accessRequirements }, { headers: NOT_KEPT });
  } catch (err) {
    console.error("[applications] access requirements read failed", roundId, err);
    return NextResponse.json(
      { error: "Could not load what you wrote under Access requirements." },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  // The same throttles as a draft save, on a count of their own, and the
  // per-address one before the session is looked up for the same reason.
  const limits = APPLICANT_RATE_LIMITS;
  const ipHit = rateLimit(
    `applications:access-requirements:ip:${clientIp(req)}`,
    limits.saveIpMax,
    limits.windowMs,
  );
  if (!ipHit.ok) {
    return NextResponse.json(
      { error: TOO_MANY_ATTEMPTS },
      { status: 429, headers: { "Retry-After": String(ipHit.retryAfterSeconds) } },
    );
  }

  const caller = await requireApplicant();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const uidHit = rateLimit(
    `applications:access-requirements:uid:${user.uid}`,
    limits.saveUidMax,
    limits.windowMs,
  );
  if (!uidHit.ok) return tooManyAttempts(uidHit.retryAfterSeconds);

  const body = await readJsonBody(req);
  const given = readAccessRequirementsInput(body?.accessRequirements);
  if (!given.ok) return NextResponse.json({ error: given.error }, { status: 400 });

  try {
    const now = new Date();
    const loaded = await loadVisibleForm(db, roundId, now);
    if (!loaded) return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });

    const refusal = formWindowRefusal(loaded.form, now);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

    const accessRequirements = await saveOwnAccessRequirements(
      db,
      loaded.form,
      user.uid,
      given.value,
    );
    return NextResponse.json({ ok: true, accessRequirements }, { headers: NOT_KEPT });
  } catch (err) {
    if (err instanceof ApplicantError) return err.toResponse();
    console.error("[applications] access requirements save failed", roundId, err);
    return NextResponse.json(
      { error: "Could not save what you wrote under Access requirements." },
      { status: 500 },
    );
  }
}
