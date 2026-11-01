import { NextResponse } from "next/server";
import { runsEvents } from "@/lib/events/reach";
import { runsSurveyAfter } from "@/lib/events/surveyAfterAccess";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { SURVEY_AFTER_REFUSAL, changeSurveyAfter, parseSurveyAfter } from "@/lib/surveys/events/setUp";

type Ctx = RouteContext<"/api/events/[id]/survey-after">;

/**
 * THE SURVEY AFTER A PUBLISHED EVENT, CHANGED: the Survey after tab's Save
 * (`changeSurveyAfter`). Its questions until it opens; who gets it, when it
 * goes and the question for people who didn't come until it has gone; its
 * reminder until that has gone; whether its QR code shows at any time.
 * Switched off before it opens, its draft goes; switched on, it is set up.
 * Before publishing the setting is part of the event's form, saved by the
 * editor, and this refuses.
 *
 * WHO: the event's author and collaborators while they stand, and admins
 * (`runsSurveyAfter`). Anybody else who runs events is told the event is not
 * there, exactly as for an event that is not; everybody else is refused on
 * the session before anything is read. Emails nobody.
 *
 * Body: the whole setting, `{ on, items, who, missed, when, hours, reminder,
 * showCode }`.
 */
export async function PATCH(req: Request, ctx: Ctx) {
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
  const setting = parseSurveyAfter(raw);
  if (!setting) return NextResponse.json({ error: SURVEY_AFTER_REFUSAL.body }, { status: 400 });

  const done = await changeSurveyAfter(db, { event, setting, byUid: viewer.uid, now: new Date() });
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  return NextResponse.json({ ok: true });
}
