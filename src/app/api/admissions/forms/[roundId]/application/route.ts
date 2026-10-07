import { NextResponse } from "next/server";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { requireApplicant } from "@/lib/admissions/applicantSession";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { loadOwnApplication } from "@/lib/applications/repo";
import { isDraftError, readDraft } from "@/lib/applications/applicant/draft";
import {
  projectApplicationForOwner,
  projectFormForApplicant,
  projectQuestionSetForApplicant,
} from "@/lib/applications/applicant/project";
import {
  APPLICANT_RATE_LIMITS,
  TOO_MANY_ATTEMPTS,
  applicationsPaused,
  readJsonBody,
  tooManyAttempts,
} from "@/lib/applications/applicant/requests";
import {
  ApplicantError,
  FORM_NOT_FOUND,
  loadAccount,
  loadVisibleForm,
  saveDraft,
} from "@/lib/applications/applicant/store";
import { formWindowRefusal } from "@/lib/applications/applicant/window";

/**
 * One person's own application to an application form.
 *
 *   GET - what an applicant may know about the form, its question sets, and
 *         their own application
 *   PUT - save the draft, creating the application on the first save
 *
 * Sending is a different act with a different contract (a save accepts a
 * half-written form, a send does not), so it has its own route beside this
 * one: `POST .../application/send`.
 *
 * ## Whose application
 *
 * The caller's, always. The document is addressed by the SESSION's uid, so
 * there is no id in the path or the body that could name somebody else's. The
 * gate is the applicant's (`requireApplicant`): an account still waiting to be
 * approved is admitted, on purpose, because "make an account, then apply" is
 * the whole journey at a fair, and a refused account is turned away.
 *
 * ## What comes back
 *
 * Three projections, each a list of fields (`applicant/project.ts`): the
 * form without anything about who leads, reviews or scores a programme, each
 * question without its scored flag, and the caller's own application. Scores,
 * comments and decisions live in collections this route's import graph cannot
 * reach, which `tests/applications-boundary.test.mjs` holds.
 *
 * ## A draft form is not a form
 *
 * A form that is still being written, or has been archived, answers with the
 * same 404 as a round that does not exist.
 */

type Ctx = { params: Promise<{ roundId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { roundId } = await ctx.params;

  const caller = await requireApplicant();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  try {
    const now = new Date();
    const loaded = await loadVisibleForm(db, roundId, now);
    if (!loaded) return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });
    const [application, account] = await Promise.all([
      loadOwnApplication(db, loaded.form, user.uid),
      loadAccount(db, user.uid),
    ]);
    return NextResponse.json({
      form: projectFormForApplicant(loaded.form, now),
      sets: loaded.sets.map(projectQuestionSetForApplicant),
      application: application ? projectApplicationForOwner(application) : null,
      account: account.about,
    });
  } catch (err) {
    console.error("[applications] read failed", roundId, err);
    return NextResponse.json({ error: "Could not load your application." }, { status: 500 });
  }
}

/**
 * Save the draft.
 *
 * The body is `{ draft }`: everything the form is showing. It is CLEANED, not
 * validated (`applicant/draft.ts`): a half-written form saves, and what is
 * stored is only ever what this form could have asked for. The whole draft is
 * replaced each time, so the stored copy is the screen the applicant last saw.
 *
 * Refused outside the form's window, with the sentence that says which side
 * of it this is. The deadline is a promise to everybody who met it.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId } = await ctx.params;

  // The per-address throttle runs before the session is looked up, because
  // the point of a throttle is to cap cost and the lookup is part of the cost.
  const limits = APPLICANT_RATE_LIMITS;
  const ipHit = rateLimit(`applications:save:ip:${clientIp(req)}`, limits.saveIpMax, limits.windowMs);
  if (!ipHit.ok) {
    return NextResponse.json(
      { error: TOO_MANY_ATTEMPTS },
      { status: 429, headers: { "Retry-After": String(ipHit.retryAfterSeconds) } },
    );
  }

  const caller = await requireApplicant();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  const uidHit = rateLimit(`applications:save:uid:${user.uid}`, limits.saveUidMax, limits.windowMs);
  if (!uidHit.ok) return tooManyAttempts(uidHit.retryAfterSeconds);

  const body = await readJsonBody(req);
  const given = body?.draft;
  if (!given || typeof given !== "object" || Array.isArray(given)) {
    return NextResponse.json(
      { error: "There was nothing to save. Reload the page and try again." },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const loaded = await loadVisibleForm(db, roundId, now);
    if (!loaded) return NextResponse.json({ error: FORM_NOT_FOUND }, { status: 404 });

    const refusal = formWindowRefusal(loaded.form, now);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

    const [account, paused] = await Promise.all([loadAccount(db, user.uid), applicationsPaused(db)]);
    const draft = readDraft(given, loaded.form, loaded.sets, account.about);
    if (isDraftError(draft)) return NextResponse.json({ error: draft.error }, { status: 400 });

    const outcome = await saveDraft(
      db,
      loaded.form,
      {
        uid: user.uid,
        // From the SESSION, never the body: an applicant must not be able to
        // put somebody else's address on a document the committee will email.
        email: user.email ?? null,
        displayName: user.displayName?.trim() || account.about.preferredName,
      },
      draft,
      paused,
    );

    const saved = await loadOwnApplication(db, loaded.form, user.uid);
    return NextResponse.json({
      ok: true,
      created: outcome === "created",
      savedAt: new Date().toISOString(),
      application: saved ? projectApplicationForOwner(saved) : null,
    });
  } catch (err) {
    if (err instanceof ApplicantError) return err.toResponse();
    // Two first saves raced, and this one lost. The application exists now,
    // so the form's next save lands as an ordinary one.
    if ((err as { code?: number }).code === 6) {
      return NextResponse.json(
        {
          error:
            "Your application was being started in another tab. Nothing is lost, and this will be saved again in a moment.",
          retry: true,
        },
        { status: 409 },
      );
    }
    console.error("[applications] save failed", roundId, err);
    return NextResponse.json({ error: "Could not save your application." }, { status: 500 });
  }
}
