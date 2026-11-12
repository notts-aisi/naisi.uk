import { NextResponse } from "next/server";
import { historyRows } from "@/lib/courses/weekEdit/editor";
import { loadEditWeek, weekEditGate } from "@/lib/courses/weekEdit/gate";
import { weekFingerprint } from "@/lib/courses/weekEdit/model";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A WEEK'S HISTORY: every save, newest first.
 *
 *   GET ...  each save in the list's words: when, who (by first name), its
 *            one line ("Part 2: new link for Katja Grace’s reading"), who it
 *            is for, what it kept of people's work, whether people were told
 *            and how many, and whether it is what the week holds now. Writes
 *            nothing. A week never changed here has no saves.
 *
 * WHO: an admin or the lead of the programme that names the run
 * (`weekEditGate`): a history says who edited and when, which is for them
 * alone. Compare one save with now or with another, and restore it, at
 * `history/[saveId]`.
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
  const fingerprint = weekFingerprint(isBlockWeek(loaded.week) ? loaded.week.blocks : []);
  const saves = await historyRows(db, runId, weekId, fingerprint);
  return NextResponse.json({ weekNumber: loaded.weekNumber, fingerprint, saves });
}
