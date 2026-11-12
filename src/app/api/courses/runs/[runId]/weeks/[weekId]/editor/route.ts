import { NextResponse } from "next/server";
import { loadWeekEditor } from "@/lib/courses/weekEdit/editor";
import { loadEditWeek, weekEditGate } from "@/lib/courses/weekEdit/gate";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * THE WEEK AS THE IN-PLACE EDITOR NEEDS IT.
 *
 *   GET ...  the week's blocks, and beside each block by id: whether it is
 *            edited in place, its fields as the editor's boxes hold them,
 *            the fingerprint a save echoes, and how many people have ticked
 *            it, answered it or sent it (counts only, never a name). Then
 *            whether the week is live, for how many groups and people, how
 *            many have started it, which groups read their own copy (a save
 *            here does not reach them), and the week's lock as the reader
 *            stands to it. Writes nothing.
 *
 * WHO: an admin or the lead of the programme that names the run
 * (`weekEditGate`), as for every editing route. The page reads it again
 * after each save.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

export async function GET(_req: Request, ctx: Params) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const { runId, weekId } = await ctx.params;
  const gated = await weekEditGate(db, actor, { runId, weekId });
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const loaded = await loadEditWeek(db, runId, weekId);
  if ("status" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const view = await loadWeekEditor(db, loaded, actor.uid, new Date());
  return NextResponse.json({
    runId: view.runId,
    weekId: view.weekId,
    weekNumber: view.weekNumber,
    title: view.title,
    hasPage: view.hasPage,
    blockWeek: view.blockWeek,
    live: view.live,
    fingerprint: view.fingerprint,
    blocks: view.blocks,
    items: view.items,
    reach: view.reach,
    lock: view.lock,
  });
}
