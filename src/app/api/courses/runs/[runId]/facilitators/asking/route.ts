import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadFacilitatorsModel } from "@/lib/courses/facilitatorAsks/load";
import { NO_PROGRAMME } from "@/lib/courses/facilitatorAsks/words";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * THE FACILITATORS VIEW, as one model (board st-facilitators): each group of
 * the run with who facilitates it and who has been asked, the email the last
 * person asked got exactly as it went, the run's training, and the people who
 * said on the application form they would like to facilitate the programme
 * that names the run, with where each stands and whether they may be asked.
 * Read only: asking, reminding and the training go through the programme's
 * own routes under `.../programmes/[programmeId]/facilitators`.
 *
 * WHO MAY READ is the lead of the programme that names the run, or an admin,
 * decided from the form (`loadFacilitatorsModel`, through the programme's
 * own gate) before the run's people are read. A reviewer of the programme is
 * refused; anybody else, a run's track lead included, is told there is no
 * programme here, as is everybody for a run no programme names.
 *
 * NO ADDRESS IS IN IT. Names, the line under a name, the answers to the form's
 * facilitator questions and nothing else of any application, and the email as
 * it went, which holds none.
 */

type Ctx = { params: Promise<{ runId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isAddressableId(runId)) return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const naming = await readNamingProgramme(db, runId);
  if (!naming) return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });

  const outcome = await loadFacilitatorsModel(db, actor, naming.roundId, naming.programmeId, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  if (outcome.model.runId !== runId) return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  return NextResponse.json(outcome.model);
}
