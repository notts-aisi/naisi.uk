import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { teamPagePerson } from "@/lib/courses/teamPage/access";
import { parseLink } from "@/lib/courses/teamPage/model";
import { addLink } from "@/lib/courses/teamPage/write";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "ADD A LINK" ON A TEAM'S PAGE (board in-team's Team links): a label and an
 * https address, up to the page's limit, added by anybody in the team.
 *
 *   POST { label, url }  ->  { ok: true, id }
 *
 * WHO WRITES: somebody among the team's people now who has been told their
 * team (`teamPagePerson`); one 403 for everybody else. ORDER: view-as
 * refused, the session, the body (a 400 with a sentence, before anything is
 * read), the database, the gate, the write (which refuses a run that has
 * ended and a page that is full). The answer carries the new link's id and
 * nothing else; the page reads its links on the server. Nobody is emailed.
 */

export type LinkAdded = { ok: true; id: string };

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
  const parsed = parseLink(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gate = await teamPagePerson(db, user, runId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const done = await addLink(db, gate.person, parsed.value);
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  const answer: LinkAdded = { ok: true, id: done.id };
  return NextResponse.json(answer);
}
