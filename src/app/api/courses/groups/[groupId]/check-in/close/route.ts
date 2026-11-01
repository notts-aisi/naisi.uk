import { NextResponse } from "next/server";
import { gateGroupRegister, isAddressableId } from "@/lib/courses/registerAccess";
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
 * (`gateGroupRegister`: the group's live facilitators and admins), asked
 * before the body is read, so a missing, archived or somebody else's group
 * is one 403.
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

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const session = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { session?: unknown }).session : undefined;
  if (!isSessionKey(session)) return NextResponse.json({ error: CHECK_IN_REFUSAL.body }, { status: 400 });

  const outcome = await closeCheckIn(db, { runId: gated.runId, group: gated.group, sessionKey: session, now: new Date() });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true });
}
