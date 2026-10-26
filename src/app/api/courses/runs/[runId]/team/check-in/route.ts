import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { teamPagePerson } from "@/lib/courses/teamPage/access";
import { parseCheckIn } from "@/lib/courses/teamPage/model";
import { saveCheckIn } from "@/lib/courses/teamPage/write";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * THIS WEEK'S CHECK-IN ON A TEAM'S PAGE (board in-team): "What we did" and
 * "What’s in the way", one per team per taught week, saved by anybody in
 * the team.
 *
 *   POST { weekNumber, did, inTheWay }  ->  { ok: true, weekNumber }
 *
 * WHO WRITES: somebody among the team's people now who has been told their
 * team (`teamPagePerson`), and nobody else: not the lead or an admin, who
 * read it, not another team, not somebody who left. One 403 for everybody
 * else, so a run id says nothing.
 *
 * ORDER: view-as refused, the session, the body (a 400 with a sentence a
 * person can act on, before anything is read), the database, the gate, then
 * the write, which refuses a run that has ended and a week that is not this
 * week by the team's group's own calendar.
 *
 * NOTHING IS READ BACK. There is no GET: the team's page reads its check-in
 * on the server, and `firestore.rules` refuses every browser. Nobody is
 * emailed.
 */

export type CheckInSaved = { ok: true; weekNumber: number };

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseCheckIn(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gate = await teamPagePerson(db, user, runId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const done = await saveCheckIn(db, gate.person, parsed.value, new Date());
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  const answer: CheckInSaved = { ok: true, weekNumber: done.weekNumber };
  return NextResponse.json(answer);
}
