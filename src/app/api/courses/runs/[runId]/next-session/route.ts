import { NextResponse } from "next/server";
import { getRunAccess } from "@/features/courses/runAccess";
import { isAddressableId } from "@/lib/addressableId";
import { nextSessionAnswersFor, type NextSessionAnswers } from "@/lib/courses/nextSession/answers";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * WHAT THE CARD FOR THE CALLER'S NEXT SESSION CAN BE TOLD, for Home, which
 * learns the run in the browser: exactly what their programme page is handed
 * by its server page (`nextSessionAnswersFor`, the one function both ask), so
 * Home's card and the programme page's say the same thing and offer the same
 * buttons, a week they visit another group included. Everything else the card
 * draws comes from the overview, as on the programme page.
 *
 * ORDER: somebody signed out is refused, then an id that addresses nothing,
 * then the programme page's own gate (`getRunAccess`: no such run, or a run
 * being destroyed, reads as missing), then anybody not taking part, who has
 * nothing to be told: a facilitator with no place, a programme's lead, an
 * admin with no place. Only the caller's own: there is no way to spell
 * another person's place here.
 *
 * `viewAs`: an admin is looking at Home as the member, so the card is drawn
 * and nothing on it can be pressed (every route behind it refuses too).
 *
 * Reads only. Nobody is emailed.
 */

type Ctx = { params: Promise<{ runId: string }> };

export type NextSessionReply = NextSessionAnswers & { viewAs: boolean };

export async function GET(_req: Request, ctx: Ctx) {
  const { runId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!runId || !isAddressableId(runId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getRunAccess(runId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.isEnrolled) return NextResponse.json({ error: "You aren't taking part in this programme." }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const answers = await nextSessionAnswersFor(db, {
    user: access.user,
    run: access.run,
    enrolment: access.enrolment,
    groups: access.groups,
    takesPart: access.isEnrolled,
    now: new Date(),
  });
  const reply: NextSessionReply = { ...answers, viewAs: markerIsLive(await getImpersonator(), access.user.uid) };
  return NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
}
