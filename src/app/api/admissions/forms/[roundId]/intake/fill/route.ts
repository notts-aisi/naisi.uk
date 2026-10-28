import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { fillPlacements } from "@/lib/applications/intake/placement";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Place everyone not yet placed as suggested", for an admin:
 * `{ people: [{ uid, programmeId }] }`, as the Placements list showed them.
 *
 * Each person is placed only if nobody has placed them yet (no programme has
 * accepted them) and the suggestion needs no decision already made changed:
 * it never overrides a lead or an admin
 * (`src/lib/applications/intake/placement.ts`). Everybody it leaves is
 * answered with why. Nobody is emailed.
 *
 * Only an admin, refused before the body is read; a view-as session is
 * refused first.
 */
export const maxDuration = 290;

const MAX_PEOPLE = 300;

export async function POST(req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: "Only an admin can place people." }, { status: 403 });
  const { roundId } = await ctx.params;
  if (!isAddressableId(roundId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { people?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw = Array.isArray(body?.people) ? body.people : null;
  if (!raw || raw.length === 0 || raw.length > MAX_PEOPLE) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_PEOPLE} people to place.` }, { status: 400 });
  }
  const people: { uid: string; programmeId: string | null }[] = [];
  for (const entry of raw) {
    const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const ok =
      typeof e.uid === "string" &&
      isAddressableId(e.uid) &&
      (e.programmeId === null || (typeof e.programmeId === "string" && isAddressableId(e.programmeId)));
    if (!ok) return NextResponse.json({ error: "Each person needs a uid and a programme, or null for no place." }, { status: 400 });
    people.push({ uid: e.uid as string, programmeId: e.programmeId as string | null });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const result = await fillPlacements(db, user, roundId, people);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ placed: result.placed, left: result.left }, { headers: { "Cache-Control": "no-store" } });
}
