import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { askWeekReview } from "@/lib/courses/weekReview/store";
import { REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { REVIEW_PARTS, type ReviewPart } from "@/lib/firestore/courseWeekReviews";

/**
 * "REVIEW WITH CLAUDE" ON ONE WEEK OF A PROGRAMME (privacy v15), FOR AN ADMIN
 * ALONE: what Claude returns is seen by admins only. Decided on the session
 * before the params, the body or the database are read, the way the best
 * answers route decides, so the programme's lead, a reviewer and everybody
 * else stop here; the review's own door (`openWeekReview`, `adminOnly`)
 * refuses them again before the run is read. A view-as session is turned
 * away first.
 *
 * POST `{ seen, part? }`: `seen` is the hash of what the page said would be
 * sent, and a press whose page saw something else is refused (409) rather
 * than sending what nobody was shown; `part` ("grades", "themes" or
 * "hands") asks for one part again. Sends up to three requests to Anthropic
 * side by side, with numbers in place of names, keeps what comes back with
 * the run, and answers which parts came back. The page is drawn on the
 * server again to show them. `src/lib/courses/weekReview/` holds the rules.
 */

export const maxDuration = 290;

type Ctx = { params: Promise<{ roundId: string; programmeId: string; weekId: string }> };

const isWeekId = (value: unknown): value is string => typeof value === "string" && /^w\d{2}$/.test(value);
const isPart = (value: unknown): value is ReviewPart => typeof value === "string" && (REVIEW_PARTS as readonly string[]).includes(value);

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: REVIEW_WORDS.onlyAdmins }, { status: 403 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" ? (raw as { seen?: unknown; part?: unknown }) : {};
  if (typeof body.seen !== "string" || !/^[0-9a-f]{32}$/.test(body.seen)) return NextResponse.json({ error: REVIEW_WORDS.badSeen }, { status: 400 });
  if (body.part !== undefined && body.part !== null && !isPart(body.part)) return NextResponse.json({ error: REVIEW_WORDS.badPart }, { status: 400 });
  const { roundId, programmeId, weekId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: REVIEW_WORDS.notHere }, { status: 404 });
  if (!isWeekId(weekId)) return NextResponse.json({ error: REVIEW_WORDS.badWeek }, { status: 400 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const asked = await askWeekReview(
    db,
    user,
    { roundId, programmeId, weekId, seen: body.seen, part: isPart(body.part) ? body.part : null },
    new Date(),
  );
  if (!asked.ok) return NextResponse.json({ error: asked.error }, { status: asked.status });
  return NextResponse.json({ asked: asked.asked }, { headers: { "Cache-Control": "no-store" } });
}
