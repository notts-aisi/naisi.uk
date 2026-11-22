import { NextResponse } from "next/server";
import { replyToTeamMessage } from "@/lib/courses/teamAsk/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * REPLY TO A MESSAGE TO THE TEAM: admins only, never the person who sent it.
 * The body is `{ reply }`: one paragraph, no link, up to 600 characters. The
 * reply is stored on the message, closes it, and is emailed to the person,
 * through its own door (`src/lib/email/teamAskEmail.ts`); a second reply is
 * refused. Anybody but an admin is one 403 before anything is read; an admin
 * is told a missing message is missing, before the reply is checked.
 *
 * View-as is refused first, then the session. The work is
 * `src/lib/courses/teamAsk/decide.ts`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // A body that is not JSON reads as an empty one: the gate answers first.
  const raw: unknown = await req.json().catch(() => null);
  const outcome = await replyToTeamMessage(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
