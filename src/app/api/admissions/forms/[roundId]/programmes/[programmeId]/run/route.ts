import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { loadRunPanel } from "@/lib/applications/handover/load";
import { NOT_AN_ADMIN, setProgrammeRun } from "@/lib/applications/handover/run";
import { isId } from "@/lib/applications/normalise";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * The course run a programme places its people on.
 *
 *  - `GET` is everything the "Course run" panel on the programme's Settings
 *    tab shows: the runs it can name, the run it names, what stops a
 *    hand-over, and how the people who hold a place compare with that run's
 *    own list.
 *  - `PUT` names the run, or clears it.
 *
 * ADMIN ONLY, and decided before anything is read: placing people on a run
 * is part of running the term, which is not a lead's job. So every other
 * caller gets the same refusal whether or not the form or the programme
 * exists.
 *
 * NOTHING HERE TELLS AN APPLICANT ANYTHING, puts anybody on a run or sends
 * an email. Naming a run only says where a later hand-over will put people.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

const NO_PROGRAMME = "That programme is not on this form.";

export async function GET(_req: Request, ctx: Ctx) {
  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_AN_ADMIN }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadRunPanel(db, user, roundId, programmeId);
  if (outcome.status === "not-admin") {
    return NextResponse.json({ error: NOT_AN_ADMIN }, { status: 403 });
  }
  if (outcome.status === "none") {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }
  return NextResponse.json({ panel: outcome.panel });
}

/** The run a request names: an id, or null for no run. Undefined when it is neither. */
function readRunId(raw: unknown): string | null | undefined {
  const body = (raw && typeof raw === "object" ? raw : {}) as { runId?: unknown };
  if (body.runId === null || body.runId === "") return null;
  return isId(body.runId) ? body.runId : undefined;
}

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_AN_ADMIN }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const runId = readRunId(raw);
  if (runId === undefined) {
    return NextResponse.json({ error: "Pick a run from the list, or No run yet." }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let saved: Awaited<ReturnType<typeof setProgrammeRun>>;
  try {
    saved = await setProgrammeRun(db, user, roundId, programmeId, runId);
  } catch (err) {
    console.error("[programme run] could not save", roundId, programmeId, err);
    return NextResponse.json({ error: "Could not save that run. Try again." }, { status: 500 });
  }
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  // The panel is redrawn from what is stored now, so the picker and what
  // stops a hand-over are right after the change.
  const outcome = await loadRunPanel(db, user, roundId, programmeId);
  if (outcome.status !== "ok") {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }
  return NextResponse.json({ ok: true, changed: saved.value.changed, panel: outcome.panel });
}
