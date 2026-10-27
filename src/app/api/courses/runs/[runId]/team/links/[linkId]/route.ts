import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { teamPagePerson } from "@/lib/courses/teamPage/access";
import { removeLink } from "@/lib/courses/teamPage/write";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "REMOVE" BESIDE A LINK ON A TEAM'S PAGE: the team's links are the team's,
 * so anybody in the team may remove one, whoever added it.
 *
 *   DELETE  ->  { ok: true }
 *
 * WHO: somebody among the team's people now who has been told their team
 * (`teamPagePerson`); one 403 for everybody else. A link on another team's
 * page, or no link at all, is one 404 for them, so an id says nothing about
 * anybody else's page. ORDER: view-as refused, the ids, the session, the
 * database, the gate, the removal.
 */

export async function DELETE(_req: Request, ctx: { params: Promise<{ runId: string; linkId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId, linkId } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(linkId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gate = await teamPagePerson(db, user, runId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const done = await removeLink(db, gate.person, linkId);
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status });
  return NextResponse.json({ ok: true });
}
