import { NextResponse } from "next/server";
import { runsEvents } from "@/lib/events/reach";
import { runsSurveyAfter } from "@/lib/events/surveyAfterAccess";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { pressAnswer } from "@/lib/surveys/events/sending";
import { SURVEY_AFTER_REFUSAL, sendItNow } from "@/lib/surveys/events/setUp";

type Ctx = RouteContext<"/api/events/[id]/survey-after/send">;

/**
 * "SEND IT NOW (21)" on an event's Survey after tab: the survey
 * its event set up, emailed now rather than when it would go by itself, to
 * the people it goes to, with the one question for the people who had a
 * place and weren't checked in where the step asked for it. Until its email
 * has gone, from the event's start, and never with a test first (its words
 * are fixed, and the editor's step shows them);
 * the job sends nothing more of it but its reminder.
 *
 * WHO: the event's author and collaborators while they stand, and admins
 * (`runsSurveyAfter`), so an organiser who isn't an admin can send their
 * own event's survey; its results stay admins' alone. Anybody else who runs
 * events is told the event is not there, and everybody else is refused on
 * the session before anything is read.
 *
 * Body `{ emails }`: the number on the button. When the people it reaches
 * have changed, nothing is sent and the answer carries the new number.
 * Answered with counts, never an address. A notice, surface `event-survey`
 * (docs/notifications.md).
 */
export async function POST(req: Request, ctx: Ctx) {
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

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const emails = raw && typeof raw === "object" ? (raw as { emails?: unknown }).emails : undefined;
  if (typeof emails !== "number" || !Number.isInteger(emails) || emails < 0) {
    return NextResponse.json({ error: SURVEY_AFTER_REFUSAL.body }, { status: 400 });
  }

  const answer = pressAnswer(await sendItNow(db, { event, presserUid: viewer.uid, emails, now: new Date() }));
  return NextResponse.json(answer.body, { status: answer.status, headers: answer.headers });
}
