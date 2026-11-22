import { NextResponse } from "next/server";
import { openAccessNeeds } from "@/lib/courses/teamAsk/openAccessNeeds";
import { ACCESS_DIDNT_OPEN } from "@/lib/courses/teamAsk/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * OPEN WHAT A MEMBER WROTE IN AN ACCESS-NEEDS ASK: admins only, never the
 * person who sent it. Takes no body. A POST, because every opening writes its
 * record: a `courseAudit` row of kind `access-needs-read` and the ask's own
 * `opened` history entry, in the transaction that reads the words
 * (`src/lib/courses/teamAsk/openAccessNeeds.ts`, the one module that reads
 * them). If the record cannot be written, the words are not returned.
 *
 * View-as is refused first, then the session; anybody but an admin is one
 * 403 before anything is read, and an admin is told a missing ask is
 * missing. Its answer is { ok, words, tellFacilitator }, to the admin who
 * pressed, and nothing else ever answers with either. Nothing is emailed and
 * nothing is logged of what was written.
 */

export type OpenAccessNeedsAnswer = { ok: true; words: string; tellFacilitator: boolean };

export async function POST(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  try {
    const opened = await openAccessNeeds(db, actor, requestId, "access-needs-read", new Date());
    if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status });
    const answer: OpenAccessNeedsAnswer = { ok: true, words: opened.value.words, tellFacilitator: opened.value.tellFacilitator };
    return NextResponse.json(answer, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // The read and its record are one transaction: it did not commit, so
    // nothing was recorded and nothing is shown.
    console.error("[access needs] could not open and record", requestId, err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: ACCESS_DIDNT_OPEN }, { status: 500 });
  }
}
