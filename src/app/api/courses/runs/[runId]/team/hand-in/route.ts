import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { teamPagePerson } from "@/lib/courses/teamPage/access";
import { parseHandIn } from "@/lib/courses/teamPage/model";
import { saveHandIn } from "@/lib/courses/teamPage/write";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "HAND IN FOR THE TEAM" (board en-handin-phone): the team's one hand-in, a
 * link, a summary of up to 200 words and who did what, made or changed by
 * anybody in the team until 23:59 in London on the day it is due.
 *
 *   POST { url, summary, whoDidWhat, shared }  ->  { ok: true }
 *
 * `shared` is the box "I’ve shared this with George and Lily": whoever
 * presses says the team can open the link, and the press is refused without
 * it when anybody else is in the team.
 *
 * WHO WRITES: somebody among the team's people now who has been told their
 * team (`teamPagePerson`); one 403 for everybody else. The lead and admins
 * read every team's hand-in on the Teams tab and write none. ORDER: view-as
 * refused, the session, the body (a 400 with a sentence, before anything is
 * read), the database, the gate, then the write, which refuses after the
 * deadline and on a run that has ended. Nobody is emailed.
 */

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
  const parsed = parseHandIn(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gate = await teamPagePerson(db, user, runId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const done = await saveHandIn(db, gate.person, parsed.value, new Date());
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  return NextResponse.json({ ok: true });
}
