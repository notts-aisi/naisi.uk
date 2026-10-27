import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { isEventSurvey } from "@/lib/firestore/surveys";
import { testRefusal } from "@/lib/surveys/emails";
import { audienceKindFrom } from "@/lib/surveys/events/create";
import { pressAnswer, pressEventSend } from "@/lib/surveys/events/sending";
import { EVENT_REFUSAL } from "@/lib/surveys/events/words";
import { namesOffDayFor } from "@/lib/surveys/namesOff";
import { canRunSurveys, isOpen, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { pressSend, signerOf, testStateFor } from "@/lib/surveys/sending";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * SEND A PROGRAMME SURVEY (sv-send-programme): "Email 30 people", the first
 * send, to everybody holding a place; then "Send to the 2 who joined since",
 * the same email to whoever holds a place and has not been sent it.
 *
 * Body `{ to: "everyone" | "joined", emails }`, where `emails` is the number
 * on the button pressed: when it is not the number the survey would reach
 * now, nothing is sent and the answer carries the new number.
 *
 * The first send is refused until the presser has sent themselves a test of
 * this wording, and it is claimed once, so two presses send it once. Each
 * email is a notice (`docs/notifications.md`), one address per message, with
 * the person's own link. Admins only. Answers with counts, never addresses.
 *
 * A survey after an event is sent by its own rules
 * (`src/lib/surveys/events/sending.ts`): its first email may name who it
 * goes to (`audience`: "came" or "signups"), which that email fixes, and it
 * may have opened at the event before any email went.
 */
export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId } = await ctx.params;
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" ? (raw as { to?: unknown; emails?: unknown; audience?: unknown }) : {};
  const to = body.to;
  const emails = body.emails;
  // Who a survey after an event's first email goes to, when the press names it.
  const audience = body.audience === undefined ? null : audienceKindFrom(body.audience);
  if (
    !isSurveyId(surveyId) ||
    (to !== "everyone" && to !== "joined") ||
    typeof emails !== "number" ||
    !Number.isInteger(emails) ||
    emails < 0 ||
    (body.audience !== undefined && !audience)
  ) {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });
  // A leaving survey is never sent: it reaches each person as they leave (Q46).
  if (survey.kind === "leaving") return NextResponse.json({ error: REFUSAL.leavingNotSent }, { status: 409 });
  const now = new Date();

  if (isEventSurvey(survey)) {
    const emailed = survey.presses.some((press) => press.kind === "first");
    if (to === "everyone") {
      if (emailed) return NextResponse.json({ error: EVENT_REFUSAL.emailedOnce }, { status: 409 });
      if (survey.closedAt || !survey.closesAt || survey.closesAt.getTime() <= now.getTime()) {
        return NextResponse.json({ error: REFUSAL.closesPast }, { status: 409 });
      }
      const refusal = testRefusal(testStateFor(survey, "survey", await signerOf(db, actor.uid)));
      if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
    } else {
      if (audience) return NextResponse.json({ error: EVENT_REFUSAL.audienceFixed }, { status: 409 });
      if (!emailed) return NextResponse.json({ error: EVENT_REFUSAL.notEmailed }, { status: 409 });
      if (!isOpen(survey, now)) return NextResponse.json({ error: REFUSAL.closedSend }, { status: 409 });
    }
    const answer = pressAnswer(
      await pressEventSend(db, to === "everyone" ? "first" : "joined", { survey, presserUid: actor.uid, emails, audience, now }),
    );
    return NextResponse.json(answer.body, { status: answer.status, headers: answer.headers });
  }

  let namesOffOn = survey.namesOffOn;
  if (to === "everyone") {
    if (survey.firstSentAt) return NextResponse.json({ error: REFUSAL.alreadySent }, { status: 409 });
    if (survey.closedAt || !survey.closesAt || survey.closesAt.getTime() <= now.getTime()) {
      return NextResponse.json({ error: REFUSAL.closesPast }, { status: 409 });
    }
    // The day names come off is promised on the survey's page, and fixed now.
    namesOffOn = await namesOffDayFor(db, survey.runId, now);
    if (!namesOffOn) return NextResponse.json({ error: REFUSAL.noNamesOff }, { status: 409 });
    // The Publish lock: a test of this very wording, signed by this presser.
    const refusal = testRefusal(testStateFor(survey, "survey", await signerOf(db, actor.uid)));
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  } else {
    if (!survey.firstSentAt) return NextResponse.json({ error: REFUSAL.notSentYet }, { status: 409 });
    if (!isOpen(survey, now)) return NextResponse.json({ error: REFUSAL.closedSend }, { status: 409 });
  }

  const outcome = await pressSend(db, to === "everyone" ? "first" : "joined", {
    survey,
    presserUid: actor.uid,
    emails,
    namesOffOn,
    now,
  });
  if (!outcome.ok) {
    const headers = outcome.retryAfterSeconds ? { "Retry-After": String(outcome.retryAfterSeconds) } : undefined;
    return NextResponse.json(
      outcome.emails === undefined ? { error: outcome.error } : { error: outcome.error, emails: outcome.emails },
      { status: outcome.status, headers },
    );
  }
  const { sent, held, suppressed, failed, noAddress } = outcome.tally;
  return NextResponse.json({ ok: true, sent, held, suppressed, failed, noAddress });
}
