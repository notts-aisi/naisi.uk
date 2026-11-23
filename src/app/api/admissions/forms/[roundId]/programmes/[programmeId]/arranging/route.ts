import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadLeadArranging } from "@/lib/applications/arrange/circles";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A PROGRAMME'S GROUPS AS THEY ARE, FOR THE PROGRAMME'S LEAD'S ARRANGING,
 * which the lead opens with "Suggest groups" on People in groups: read when
 * it opens, and again after each change it saves. `?minutes=` counts
 * sessions of that length. The reading a lead's suggestion is worked out
 * from (`loadLeadArranging` in `src/lib/applications/arrange/circles.ts`):
 * only the run's rows the board serves the caller, and each person's week
 * only where the caller may read the application, with no read from Claude
 * or Pangram. An admin is answered the same, and reads the fuller `circles`
 * GET on their own screen.
 *
 * For an admin and the programme's lead, once decisions have gone out; a
 * reviewer is refused in a sentence, and anybody with no role on the
 * programme is answered as for a programme that is not there. A view-as
 * session is refused first, as the suggestion route refuses it. NOTHING IS
 * WRITTEN AND NOTHING IS ASKED OF CLAUDE.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { roundId, programmeId } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const minutes = new URL(req.url).searchParams.get("minutes") ?? undefined;
  const outcome = await loadLeadArranging(db, user, roundId, programmeId, { minutes });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ circles: outcome.view }, { headers: { "Cache-Control": "no-store" } });
}
