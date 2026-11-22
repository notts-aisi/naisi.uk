import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { loadRunPanel } from "@/lib/applications/handover/load";
import { isId } from "@/lib/applications/normalise";
import { ONLY_AN_ADMIN_REMOVES_ROLES, readRoleList, removeFromRunRole } from "@/lib/courses/runCareful/roles";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Take one person off one of the older roles of the run a programme names, a
 * track lead or a run facilitator, from the Course run section of its
 * Settings ("Remove…"). Nobody is added here.
 *
 * ADMIN ONLY, decided before the body is read, as the section is: every
 * other session is forbidden whether or not the form exists.
 *
 * In order: a view-as session is refused; the session (401); an admin (403);
 * the body (400: `list` is `trackLeads` or `runFacilitators`, `uid` an id);
 * then `removeFromRunRole`: the form and the programme (404), a run named
 * (409), and in one transaction the run on the site (404), not being
 * destroyed (409) and the person on that list (409). It answers with the
 * section read again. It emails nobody.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ONLY_AN_ADMIN_REMOVES_ROLES }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as { list?: unknown; uid?: unknown };
  const list = readRoleList(body.list);
  if (list === null || !isId(body.uid)) {
    return NextResponse.json({ error: "Say which list, and who to take off it." }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let removed: Awaited<ReturnType<typeof removeFromRunRole>>;
  try {
    removed = await removeFromRunRole(db, user, roundId, programmeId, list, body.uid);
  } catch (err) {
    console.error("[run roles] could not remove", roundId, programmeId, err);
    return NextResponse.json({ error: "Could not take them off. Try again." }, { status: 500 });
  }
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });

  const outcome = await loadRunPanel(db, user, roundId, programmeId);
  if (outcome.status !== "ok") {
    return NextResponse.json({ error: "That programme is not on this form." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, panel: outcome.panel });
}
