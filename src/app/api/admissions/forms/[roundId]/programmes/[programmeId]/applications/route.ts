import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { decideMany, parseBulkDecision } from "@/lib/applications/review/decide";
import { loadProgrammeBoard } from "@/lib/applications/review/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * One programme's applications, for its lead, its reviewers and admins.
 *
 * GET is the list a programme's lead works from: who applied, where the
 * programme sits in each person's ranking, the section score this caller may
 * see, and where each application stands. POST accepts or pools several of
 * them at once.
 *
 * Who may call either is decided from the form by `src/lib/applications/access.ts`,
 * inside the two functions this file hands the request to. A caller with no
 * role on the programme is answered "Not found", in the same words as for a
 * form that does not exist. Every field of the answer is chosen in
 * `src/lib/applications/review/board.ts`: a name and a degree, never an
 * address, and a score only where a first review is no longer blind.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { roundId, programmeId } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await loadProgrammeBoard(db, user, roundId, programmeId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ board: result.board });
}

/**
 * Accept or pool the selected applications. One transaction per application,
 * under the same rules as a single decision, and the answer says how many
 * changed and which were refused and why. Nothing is written to any
 * applicant's own document and nobody is emailed.
 */
export async function POST(
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseBulkDecision(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await decideMany(db, user, roundId, programmeId, parsed);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ result: outcome.result });
}
