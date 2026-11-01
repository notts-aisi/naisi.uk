import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { readScheduleAsk } from "@/lib/courses/explainers/model";
import { scheduleExplainer } from "@/lib/courses/explainers/schedule";
import { EXPLAINER_WORDS } from "@/lib/courses/explainers/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "SCHEDULE FOR 4 GROUPS", from a week's review: an explainer at the start of
 * each chosen group's next session. FOR AN ADMIN ALONE, decided on the
 * session before the body, the params or the database are read, as the
 * review's own routes are. A view-as session is turned away first.
 *
 * POST `{ topic, explainerUid, minutes, sessions: [{ groupId, sessionKey }] }`:
 * the admin's topic (one line, at most 120 characters), who explains (read
 * on the server: somebody on the committee, or an admin), how long (5, 10, 15
 * or 20 minutes), and each group's next session as the page showed it. Makes
 * one record, one task per session for whoever explains, and emails them
 * once if their task emails are on (`src/lib/courses/explainers/schedule.ts`).
 * Nobody in the groups is emailed: their session tickets show it at once.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; weekId: string }> };

const isWeekId = (value: unknown): value is string => typeof value === "string" && /^w\d{2}$/.test(value);

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: EXPLAINER_WORDS.onlyAdmins }, { status: 403 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const read = readScheduleAsk(raw);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  const { roundId, programmeId, weekId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: EXPLAINER_WORDS.notHere }, { status: 404 });
  if (!isWeekId(weekId)) return NextResponse.json({ error: EXPLAINER_WORDS.badWeek }, { status: 400 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const scheduled = await scheduleExplainer(db, user, { roundId, programmeId, weekId, ask: read.ask }, new Date());
  if (!scheduled.ok) return NextResponse.json({ error: scheduled.error }, { status: scheduled.status });
  return NextResponse.json(
    { explainerId: scheduled.explainerId, tasks: scheduled.tasks, emailed: scheduled.emailed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
