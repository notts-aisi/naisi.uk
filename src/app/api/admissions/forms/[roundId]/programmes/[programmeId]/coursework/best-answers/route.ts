import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { askBestAnswers, loadBestAnswers } from "@/lib/courses/coursework/bestAnswers";
import { BEST_WORDS, COURSEWORK_DOOR_WORDS } from "@/lib/courses/coursework/claudeWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * CLAUDE'S BEST ANSWERS TO ONE WEEK (privacy v13), on the programme's
 * Coursework tab, FOR AN ADMIN ALONE (privacy v15: what Claude returns is seen
 * by admins only). Decided on the session before the query or the body is
 * read, the way Pangram's routes decide, so the programme's lead, a reviewer
 * and everybody else stop here; the tab's own door (`openCourseworkDoor`, with
 * `adminOnly`) then refuses them again before the run is read.
 *
 * GET `?week=w03` answers what Claude last found for that week, with names
 * put back, whether it is out of date, and how many answers would be sent and
 * how many are not included yet. It writes nothing and sends nothing.
 *
 * POST `{ weekId }` sends that week's counted answers (labels, never names)
 * to Anthropic, keeps what comes back with the run and answers the same
 * view. A view-as session is turned away first. It may take most of the
 * backend's request limit. `src/lib/courses/coursework/bestAnswers.ts` holds
 * the rules; nothing a Pangram check found is ever in it.
 */

export const maxDuration = 290;

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

const isWeekId = (value: unknown): value is string => typeof value === "string" && /^w\d{2,3}$/.test(value);

export async function GET(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: BEST_WORDS.onlyAdmins }, { status: 403 });
  const { roundId, programmeId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.notHere }, { status: 404 });
  const week = new URL(req.url).searchParams.get("week");
  if (!isWeekId(week)) return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.badWeek }, { status: 400 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const loaded = await loadBestAnswers(db, user, roundId, programmeId, week);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { claude, week: shown, result, outOfDate, sendable, notIncluded } = loaded.view;
  return NextResponse.json(
    { claude, week: shown, result, outOfDate, sendable, notIncluded },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: BEST_WORDS.onlyAdmins }, { status: 403 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const weekId = raw && typeof raw === "object" ? (raw as { weekId?: unknown }).weekId : undefined;
  if (!isWeekId(weekId)) return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.badWeek }, { status: 400 });
  const { roundId, programmeId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.notHere }, { status: 404 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const asked = await askBestAnswers(db, user, roundId, programmeId, weekId);
  if (!asked.ok) return NextResponse.json({ error: asked.error }, { status: asked.status });
  const { claude, week, result, outOfDate, sendable, notIncluded } = asked.view;
  return NextResponse.json(
    { claude, week, result, outOfDate, sendable, notIncluded },
    { headers: { "Cache-Control": "no-store" } },
  );
}
