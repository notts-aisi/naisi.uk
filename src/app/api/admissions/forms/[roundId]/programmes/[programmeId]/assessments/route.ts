import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { askAboutProgramme, loadProgrammeMarks } from "@/lib/applications/assessment/run";
import type { ProgrammeAsk } from "@/lib/applications/assessment/types";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Claude across one programme's list of applications, for an admin.
 *
 * GET answers the marks Claude and Pangram left on each application: Claude's
 * lean for this programme, and how many answers Pangram thought worth a look.
 * Read only; asking for them is the application's own route.
 *
 * POST asks Claude about the whole programme, from the reads already stored:
 * `{ kind: "overview" }` for a comparison (a shortlist, the borderline, the
 * clear no's, who is worth a second look, who would suit another programme),
 * or `{ kind: "question", question }`. Neither answer is stored. A name in a
 * question is swapped for the label Claude knows that person by before it is
 * sent (`src/lib/applications/assessment/programmeInput.ts`).
 *
 * Only an admin, refused before the body is read or anything is looked up,
 * then whatever the programme's list itself would refuse
 * (`loadProgrammeBoard`). A POST may take most of the backend's 300-second
 * request limit: a comparison of a large programme takes Claude a minute or
 * two.
 */
export const maxDuration = 290;

const ONLY_ADMINS = "Only an admin can see assessments.";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ONLY_ADMINS }, { status: 403 });

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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: "Only an admin can ask Claude about a programme." }, { status: 403 });
  }

  const { roundId, programmeId } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: { kind?: unknown; question?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  let ask: ProgrammeAsk;
  if (body?.kind === "overview") ask = { kind: "overview" };
  else if (body?.kind === "question" && typeof body.question === "string") ask = { kind: "question", question: body.question };
  else {
    return NextResponse.json({ error: "Ask for an overview, or ask a question." }, { status: 400 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await askAboutProgramme(db, user, roundId, programmeId, ask);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(
    "overview" in result ? { overview: result.overview } : { answer: result.answer, question: result.question },
    { headers: { "Cache-Control": "no-store" } },
  );
}
