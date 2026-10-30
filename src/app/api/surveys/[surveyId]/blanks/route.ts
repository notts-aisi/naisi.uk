import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { ownRowFor, recordBlanks } from "@/lib/surveys/blanksStore";
import { isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * "SEND MY ANSWERS" SIGNED IN, ON THE QUESTIONS LEFT BLANK: the same as from
 * the link of blanks, for the person whose session it is, once an admin has
 * pressed for them. There is no uid in the request: the row is the caller's
 * own, and a survey they have no row on is refused in one sentence.
 *
 * Refused during a view-as session, so an admin looking at the site as a
 * member can never answer as them. Body `{ answers }`.
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
  if (!isSurveyId(surveyId) || answers === null || typeof answers !== "object") {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  const target = survey ? await ownRowFor(db, survey, actor.uid) : null;
  if (!target) return NextResponse.json({ error: REFUSAL.notYours }, { status: 404 });

  const outcome = await recordBlanks(db, { target, token: null, raw: answers, via: "signed-in", now: new Date() });
  if (!outcome.ok) {
    return NextResponse.json(outcome.missing ? { error: outcome.error, missing: outcome.missing } : { error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json({ ok: true });
}
