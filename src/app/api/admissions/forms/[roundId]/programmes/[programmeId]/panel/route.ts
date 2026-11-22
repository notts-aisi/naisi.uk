import { NextResponse } from "next/server";
import { loadBoardPanel } from "@/lib/applications/handover/boardPanel";
import { isId } from "@/lib/applications/normalise";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

const NO_PROGRAMME = "That programme is not on this form.";
const NOT_YOURS = "Only this programme’s lead or an admin can see its groups.";

/**
 * THE PERSON'S PANEL ON PEOPLE IN GROUPS, for everybody on the board in one
 * call (`loadBoardPanel` in `src/lib/applications/handover/boardPanel.ts`):
 * when each person is free, drawn only where the reader may read their
 * application and otherwise answered with nothing derived from it; the way
 * to their page and application; whether they offered to facilitate; and
 * Claude's and Pangram's earlier reads for an admin alone.
 *
 * The Groups tab's own gate, from the form: an admin and the programme's
 * lead. A reviewer is told the groups are the lead's (403); a form, a
 * programme or a role that is not there is the same 404. NOTHING IS WRITTEN,
 * NOBODY IS EMAILED AND NOTHING IS ASKED OF CLAUDE.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ roundId: string; programmeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { roundId, programmeId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadBoardPanel(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: NOT_YOURS }, { status: 403 });
  return NextResponse.json({ panel: outcome.view }, { headers: { "Cache-Control": "no-store" } });
}
