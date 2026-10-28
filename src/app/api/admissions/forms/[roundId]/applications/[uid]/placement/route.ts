import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { loadPlacement, placePerson } from "@/lib/applications/intake/placement";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * One person's placement, the one source of truth for it
 * (`src/lib/applications/intake/placement.ts`): the Placement box beside
 * their application, whichever programme it is opened from, and the
 * Placements list on Plan the intake.
 *
 * GET reads it. PUT `{ programmeId }` (one they ranked, or null for no place)
 * is an admin's own pick: it writes the per-programme decisions that make it
 * so, through the decision route's own writer, and may change decisions
 * already made; the box has said whose first. Nobody is emailed.
 *
 * Only an admin, refused before anything is read; a view-as session is
 * refused before a PUT. Not found for anybody not in the term, the admin's
 * own application included.
 */
type Ctx = { params: Promise<{ roundId: string; uid: string }> };

const ONLY_ADMINS = "Only an admin can place somebody.";

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ONLY_ADMINS }, { status: 403 });
  const { roundId, uid } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(uid)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const result = await loadPlacement(db, user, roundId, uid);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ placement: result.placement }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ONLY_ADMINS }, { status: 403 });
  const { roundId, uid } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(uid)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { programmeId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const programmeId = body?.programmeId;
  if (programmeId !== null && !(typeof programmeId === "string" && isAddressableId(programmeId))) {
    return NextResponse.json({ error: "Say which programme to place them on, or null for no place." }, { status: 400 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const result = await placePerson(db, user, roundId, uid, programmeId, "pick");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ placement: result.placement }, { headers: { "Cache-Control": "no-store" } });
}
