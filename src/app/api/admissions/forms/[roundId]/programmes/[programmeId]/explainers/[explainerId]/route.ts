import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { cancelExplainer } from "@/lib/courses/explainers/schedule";
import { EXPLAINER_WORDS } from "@/lib/courses/explainers/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * CANCEL AN EXPLAINER, from a week's review: FOR AN ADMIN ALONE, decided on
 * the session before the params or the database are read. A view-as session
 * is turned away first.
 *
 * DELETE: the explainer, which must be on the run this programme names, is
 * stamped cancelled and its tasks are closed, so it comes off every session
 * ticket. The record is kept; nobody is emailed, so an email that has gone
 * is never followed by another (`src/lib/courses/explainers/schedule.ts`).
 * Cancelling one already cancelled closes nothing more.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; explainerId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: EXPLAINER_WORDS.onlyAdmins }, { status: 403 });
  const { roundId, programmeId, explainerId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: EXPLAINER_WORDS.notHere }, { status: 404 });
  if (!isAddressableId(explainerId) || explainerId.length > 200) return NextResponse.json({ error: EXPLAINER_WORDS.badId }, { status: 400 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const cancelled = await cancelExplainer(db, user, { roundId, programmeId, explainerId }, new Date());
  if (!cancelled.ok) return NextResponse.json({ error: cancelled.error }, { status: cancelled.status });
  return NextResponse.json({ archived: cancelled.archived }, { headers: { "Cache-Control": "no-store" } });
}
