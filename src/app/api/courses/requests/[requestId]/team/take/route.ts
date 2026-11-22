import { NextResponse } from "next/server";
import { takeTeamMessage } from "@/lib/courses/teamAsk/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * TAKE A MESSAGE TO THE TEAM: an admin says they are dealing with it. Admins
 * only, never the person who sent it. Takes no body. Emails nobody. Anybody
 * but an admin is one 403 before anything is read; an admin is told a
 * missing message is missing.
 *
 * View-as is refused first, then the session. The work is
 * `src/lib/courses/teamAsk/decide.ts`.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await takeTeamMessage(db, actor, requestId, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
