import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { changeConsent, isConsentPurpose } from "@/lib/surveys/consent";
import { isSurveyId, readPerson, readSurvey } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * A PERSON CHANGES A CONSENT SIGNED IN: the same as from their personal link,
 * for the person whose session it is, on a survey they were sent. There is
 * no uid in the request: the row changed is the caller's own.
 *
 * Refused during a view-as session, so an admin looking at the site as a
 * member can never change what the member said. Body `{ purpose, given }`.
 */
export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });

  const { surveyId } = await ctx.params;
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" ? (raw as { purpose?: unknown; given?: unknown }) : {};
  if (!isSurveyId(surveyId) || !isConsentPurpose(body.purpose) || typeof body.given !== "boolean") {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  const person = survey ? await readPerson(db, survey.id, { kind: "account", uid: actor.uid }) : null;
  if (!survey || !person || person.sentAt === null) {
    return NextResponse.json({ error: REFUSAL.notYours }, { status: 404 });
  }

  const outcome = await changeConsent(db, { survey, person, purpose: body.purpose, given: body.given });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, given: outcome.given });
}
