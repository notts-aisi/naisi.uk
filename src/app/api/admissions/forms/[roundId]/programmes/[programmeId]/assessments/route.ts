import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { loadProgrammeMarks } from "@/lib/applications/assessment/run";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * The marks Claude and Pangram left on one programme's list of applications,
 * for an admin: Claude's lean for this programme, and how many answers
 * Pangram thought worth a look. Read only; asking for them is the
 * application's own route.
 *
 * Only an admin, refused before anything is read, then whatever the
 * programme's list itself would refuse (`loadProgrammeBoard`).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: "Only an admin can see assessments." }, { status: 403 });
  }

  const { roundId, programmeId } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await loadProgrammeMarks(db, user, roundId, programmeId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(
    { marks: result.marks, configured: result.configured },
    { headers: { "Cache-Control": "no-store" } },
  );
}
