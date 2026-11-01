import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { runsEvents } from "@/lib/events/reach";
import { runsSurveyAfter } from "@/lib/events/surveyAfterAccess";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { firstPressOf } from "@/lib/surveys/events/after";
import { eventSurveyOf } from "@/lib/surveys/events/records";
import { SURVEY_AFTER_REFUSAL } from "@/lib/surveys/events/setUp";
import { prepareSurveyTest } from "@/lib/surveys/sending";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = RouteContext<"/api/events/[id]/survey-after/test">;

/**
 * "SEND A TEST TO ME" beside "Send it now" on an event's Survey after tab:
 * the survey's email as the presser's own press would send it now, signed
 * by them, to the address on their own session and nobody else's, marked as
 * a test. Its button opens the survey through its test link, which keeps
 * nothing. Offered, never required: no send waits for it, so it is
 * not recorded. Transactional: it reaches only the person who asked for it.
 *
 * WHO: as "Send it now" (`runsSurveyAfter`), until the survey's email has
 * gone. Body: none.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!runsEvents(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const snap = /^[A-Za-z0-9_-]{1,128}$/.test(id) ? await db.collection("events").doc(id).get() : null;
  const event = snap?.exists ? normalizeEvent(id, snap.data() ?? {}) : null;
  if (!event || !runsSurveyAfter(event, viewer)) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!viewer.email) return NextResponse.json({ error: REFUSAL.noEmailOnFile }, { status: 400 });

  const survey = await eventSurveyOf(db, event.id);
  if (!survey) return NextResponse.json({ error: SURVEY_AFTER_REFUSAL.noSurvey }, { status: 409 });
  if (!survey.auto) return NextResponse.json({ error: SURVEY_AFTER_REFUSAL.adminMade }, { status: 409 });
  if (firstPressOf(survey)) return NextResponse.json({ error: REFUSAL.alreadySent }, { status: 409 });
  const now = new Date();
  if (survey.closedAt || !survey.closesAt || survey.closesAt.getTime() <= now.getTime()) {
    return NextResponse.json({ error: REFUSAL.closesPast }, { status: 409 });
  }

  const prepared = await prepareSurveyTest(db, survey, "survey", { uid: viewer.uid, address: viewer.email });
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
    console.error("[survey after test] send failed", event.id, err);
    return NextResponse.json({ error: "That test could not be sent. Try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, delivery });
}
