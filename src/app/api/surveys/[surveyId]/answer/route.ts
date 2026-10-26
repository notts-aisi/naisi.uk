import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { recordAnswer } from "@/lib/surveys/answer";
import { isSurveyId, readPerson, readSurvey } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * "SEND MY ANSWERS" SIGNED IN: the same as from a personal link, for the
 * person whose session it is, on a survey they were sent. There is no uid in
 * the request: the row answered is the caller's own, and a survey they were
 * not sent is refused in one sentence.
 *
 * Refused during a view-as session, so an admin looking at the site as a
 * member can never answer as them. Body `{ answers, consents? }`: `consents`
 * is what the survey's consent boxes say, kept on the caller's own row.
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
  const answers = raw && typeof raw === "object" ? (raw as { answers?: unknown }).answers : undefined;
  const consents = raw && typeof raw === "object" ? (raw as { consents?: unknown }).consents : undefined;
  if (!isSurveyId(surveyId) || answers === null || typeof answers !== "object") {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  const person = survey ? await readPerson(db, survey.id, { kind: "account", uid: actor.uid }) : null;
  if (!survey || !person || person.sentAt === null) {
    return NextResponse.json({ error: REFUSAL.notYours }, { status: 404 });
  }

  const outcome = await recordAnswer(db, { survey, person, raw: answers, consents, via: "signed-in", now: new Date() });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true });
}
