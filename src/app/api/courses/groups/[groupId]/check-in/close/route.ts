import { NextResponse } from "next/server";
import {
  coveredSessionsOf,
  gateGroupRegister,
  isAddressableId,
  readSessionRegister,
  registerSessionAccess,
} from "@/lib/courses/registerAccess";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { closeCheckIn } from "@/lib/surveys/checkIns/close";
import { isSessionKey } from "@/lib/surveys/checkIns/sessionRead";
import { CHECK_IN_REFUSAL } from "@/lib/surveys/checkIns/words";

type Ctx = { params: Promise<{ groupId: string }> };

/**
 * "CLOSE IT NOW": the check-in of one of the group's sessions takes no more
 * answers from this moment and is never opened again (`closeCheckIn`).
 * Nobody is emailed. Body `{ session }`.
 *
 * View-as is refused first; then the register's own gate
 * (`gateGroupRegister`), asked before the body is read, so a missing,
 * archived or somebody else's group is one 403; then the session's own door
 * (`registerSessionAccess`): the group's live facilitators and admins, and
 * whoever took that session's register in a facilitator's place while it
 * holds. A lead who has not taken it is refused.
 */
export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const now = new Date();
  const staff = gated.isAdmin || gated.facilitates;
  if (!staff && (await coveredSessionsOf(db, gated.group, actor.uid, now)).length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const session = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { session?: unknown }).session : undefined;
  if (!isSessionKey(session)) return NextResponse.json({ error: CHECK_IN_REFUSAL.body }, { status: 400 });
  if (!staff) {
    const register = await readSessionRegister(db, gated.runId, gated.group.id, session);
    if (!registerSessionAccess(gated, { uid: actor.uid, sessionKey: session, cover: register?.cover ?? null, now }).checksIn) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const outcome = await closeCheckIn(db, { runId: gated.runId, group: gated.group, sessionKey: session, now });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true });
}
