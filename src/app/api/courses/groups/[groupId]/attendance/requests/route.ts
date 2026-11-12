import { NextResponse } from "next/server";
import { gateGroupRegister, isAddressableId } from "@/lib/courses/registerAccess";
import { REQUEST_REFUSAL } from "@/lib/courses/registerCorrection/words";
import { askForCorrection, parseAsk } from "@/lib/courses/requests/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * ASK FOR A CORRECTION of one line of a finished register: what it should
 * say, and why (`src/lib/courses/requests/decide.ts`). For the group's
 * facilitators with standing, after Finish, when they can no longer change
 * the line themselves; it lands on the Requests page for an admin or the
 * programme's lead to approve or decline. Nobody is emailed.
 *
 * ORDER: view-as first, then the session, then the register's own gate
 * (one 403 for anybody with no part in the group, a missing group and an
 * archived one; an admin is told a group is missing), then whether the
 * caller facilitates it (somebody who corrects registers is told to correct
 * it themselves), and only then the body.
 */
export async function POST(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
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
  if (!gated.facilitates) {
    return NextResponse.json(
      { error: gated.isAdmin || gated.leads ? REQUEST_REFUSAL.corrects : "Forbidden" },
      { status: 403 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: REQUEST_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseAsk(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const outcome = await askForCorrection(db, actor, { gated, press: parsed.value, now: new Date() });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.detail }, { status: outcome.status });
  return NextResponse.json({ ok: true, request: outcome.value });
}
