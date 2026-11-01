import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { sendEmail } from "@/lib/email/send";
import { getCurrentUser } from "@/lib/firebase/session";
import { SURVEYS_COLLECTION, isCheckIn, isEventSurvey } from "@/lib/firestore/surveys";
import { eventNamesOffDay } from "@/lib/surveys/events/records";
import { namesOffDayFor } from "@/lib/surveys/namesOff";
import { canRunSurveys, isOpen, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { prepareSurveyTest, recordSurveyTest } from "@/lib/surveys/sending";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * "SEND A TEST TO ME" (sv-send-programme): the survey's email, or its
 * reminder, as it would go now, signed by the presser, to the address on
 * their own session and nobody else's, marked as a test. Its button opens the
 * survey through the survey's test link, which keeps nothing.
 *
 * A test that reached its sender is recorded with the wording it was made of,
 * and the send it rehearses is refused until there is one for the wording in
 * force (`src/lib/surveys/emails.ts`). Transactional: it reaches only the
 * person who asked for it, so no preference is passed over.
 *
 * Admins only. Body `{ email: "survey" | "reminder" }`.
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
  const email = raw && typeof raw === "object" ? (raw as { email?: unknown }).email : undefined;
  if (!isSurveyId(surveyId) || (email !== "survey" && email !== "reminder")) {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }
  if (!actor.email) return NextResponse.json({ error: REFUSAL.noEmailOnFile }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });
  // A leaving survey is never sent: it reaches each person as they leave (Q46).
  if (survey.kind === "leaving") return NextResponse.json({ error: REFUSAL.leavingNotSent }, { status: 409 });
  // Nor is a check-in: its group's facilitator opens it from the register.
  if (isCheckIn(survey)) return NextResponse.json({ error: REFUSAL.checkInNotSent }, { status: 409 });
  const now = new Date();
  // A survey after an event opens at the event before its email goes, so its
  // email has gone once its first press has.
  const emailed = isEventSurvey(survey) ? survey.presses.some((press) => press.kind === "first") : survey.firstSentAt !== null;
  if (email === "survey" && emailed) return NextResponse.json({ error: REFUSAL.alreadySent }, { status: 409 });
  if (email === "reminder" && !emailed) return NextResponse.json({ error: REFUSAL.notSentYet }, { status: 409 });
  if (survey.firstSentAt && !isOpen(survey, now)) return NextResponse.json({ error: REFUSAL.closedSend }, { status: 409 });
  if (!survey.closesAt || survey.closesAt.getTime() <= now.getTime()) {
    return NextResponse.json({ error: REFUSAL.closesPast }, { status: 409 });
  }
  // The survey's page says when names come off, so a test of it is refused
  // while that cannot be worked out, as the send is. Until the first send the
  // day follows the run's sessions, so it is worked out again here.
  if (!survey.firstSentAt) {
    const day = isEventSurvey(survey) ? await eventNamesOffDay(db, survey) : await namesOffDayFor(db, survey.runId, now);
    if (!day) return NextResponse.json({ error: REFUSAL.noNamesOff }, { status: 409 });
    if (day !== survey.namesOffOn) {
      await db.collection(SURVEYS_COLLECTION).doc(survey.id).update({ namesOffOn: day });
      survey.namesOffOn = day;
    }
  }

  const prepared = await prepareSurveyTest(db, survey, email, { uid: actor.uid, address: actor.email });
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });

  // To the presser's own address and nobody else's: a test is no notice. The
  // message is written out here, kind and all, so the senders guard can read
  // which address it comes from.
  const { message } = prepared;
  let delivery: "sent" | "held" | "suppressed";
  try {
    const result = await sendEmail({
      to: message.to,
      subject: message.subject,
      react: message.react,
      replyTo: message.replyTo,
      fromName: message.fromName,
      kind: "course-test",
      actorUid: message.actorUid,
      referenceId: message.referenceId,
    });
    delivery = result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
  } catch (err) {
    console.error("[surveys test] send failed", surveyId, err);
    return NextResponse.json({ error: "That test could not be sent. Try again in a minute." }, { status: 502 });
  }
  // Held or suppressed, it reached nobody, so it is no test.
  if (delivery !== "sent") return NextResponse.json({ ok: true, delivery, recorded: false });
  await recordSurveyTest(db, survey.id, email, actor.uid, prepared.wording);
  return NextResponse.json({ ok: true, delivery, recorded: true });
}
