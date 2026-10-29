import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { loadCircles } from "@/lib/applications/arrange/circles";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A PROGRAMME'S GROUPS AS THEY ARE, for Circles to read again after each
 * change it saves: `?minutes=` counts sessions of that length, as the page
 * does. The same reading the page is drawn from (`loadCircles` in
 * `src/lib/applications/arrange/circles.ts`): who sits in which of the run's
 * groups, who facilitates each, who sits in none, and who holds a place but
 * is not on the run's list.
 *
 * Only an admin, refused before anything is read: it carries each person's
 * marked week and Claude's earlier read of their application. NOTHING IS
 * WRITTEN AND NOTHING IS ASKED OF CLAUDE; every change Circles makes goes
 * through the site's own routes.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: "Only an admin can open Circles." }, { status: 403 });
  }

  const { roundId, programmeId } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(programmeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const minutes = new URL(req.url).searchParams.get("minutes") ?? undefined;
  const outcome = await loadCircles(db, user, roundId, programmeId, { minutes });
  if (outcome.status !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ circles: outcome.view }, { headers: { "Cache-Control": "no-store" } });
}
