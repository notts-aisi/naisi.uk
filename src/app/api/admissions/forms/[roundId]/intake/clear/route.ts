import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { clearReads } from "@/lib/applications/assessment/clear";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Clear all reads: delete every stored Claude read and Pangram check on one
 * form, for an admin, `{ confirm: true }`. The applications and the reviews
 * are untouched (`src/lib/applications/assessment/clear.ts`).
 *
 * Only an admin, refused before the body is read; a view-as session is
 * refused first. The body has to say `confirm: true`, so a stray POST
 * clears nothing.
 */
export async function POST(req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: "Only an admin can clear the reads." }, { status: 403 });
  }

  const { roundId } = await ctx.params;
  if (!isAddressableId(roundId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body?.confirm !== true) {
    return NextResponse.json({ error: "Say confirm: true to clear every read." }, { status: 400 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await clearReads(db, user, roundId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ deleted: result.deleted }, { headers: { "Cache-Control": "no-store" } });
}
