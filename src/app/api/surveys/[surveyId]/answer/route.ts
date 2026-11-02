import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { isEventSurvey } from "@/lib/firestore/surveys";
import { recordAnswer } from "@/lib/surveys/answer";
import { mayAnswerSignedIn } from "@/lib/surveys/events/audience";
import { recordEventAnswer } from "@/lib/surveys/events/store";
import { EVENT_REFUSAL } from "@/lib/surveys/events/words";
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
 * member can never answer as them. Body `{ answers, consents?, kairos? }`:
 * `consents` is what the survey's consent boxes say, kept on the caller's own
 * row, and `kairos` the Kairos choice when they changed it on the form, kept
 * on their own record.
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
  const kairos = raw && typeof raw === "object" ? (raw as { kairos?: unknown }).kairos : undefined;
  if (!isSurveyId(surveyId) || answers === null || typeof answers !== "object") {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  // A survey after an event is answered signed in with its QR code, by
  // whoever signed up or came, whose row is made as they answer.
  if (survey && isEventSurvey(survey)) {
    // The one question for people who had a place and weren't checked in is
    // answered from its email alone: no QR code or page offers it signed in.
    if (survey.audience.kind === "event-missed") return NextResponse.json({ error: EVENT_REFUSAL.notForYou }, { status: 404 });
    if (!(await mayAnswerSignedIn(db, survey.audience.eventId, actor.uid))) {
      return NextResponse.json({ error: EVENT_REFUSAL.notForYou }, { status: 404 });
    }
    const kept = await recordEventAnswer(db, {
      survey,
      respondent: { kind: "account", uid: actor.uid },
      token: null,
      raw: answers,
      via: "signed-in",
      now: new Date(),
    });
    if (!kept.ok) return refused(kept);
    return NextResponse.json({ ok: true });
  }
  const person = survey ? await readPerson(db, survey.id, { kind: "account", uid: actor.uid }) : null;
  if (!survey || !person || person.sentAt === null) {
    return NextResponse.json({ error: REFUSAL.notYours }, { status: 404 });
  }

  const outcome = await recordAnswer(db, { survey, person, raw: answers, consents, kairos, via: "signed-in", now: new Date() });
  if (!outcome.ok) return refused(outcome);
  return NextResponse.json({ ok: true });
}

/**
 * A refusal in one sentence, with the ids of the required questions left
 * blank when that is why (`missing`), so the form says so beside each one.
 */
function refused(outcome: { status: number; error: string; missing?: string[] }) {
  return NextResponse.json(outcome.missing ? { error: outcome.error, missing: outcome.missing } : { error: outcome.error }, { status: outcome.status });
}
