import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { weekIsReady } from "@/lib/courses/weekReady";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseWeek } from "@/lib/firestore/courses";

/**
 * MARK A WEEK READY, OR TAKE IT BACK (board pr-weeks, Q35):
 * `PUT /api/courses/runs/[runId]/weeks/[weekId]/ready` with `{ ready: true }`
 * or `{ ready: false }`.
 *
 * Ready is stored on the RUN's week as `ready`, `readyAt` and `readyByUid`,
 * and this route is their only writer: the rules keep every browser off all
 * three. What it means and what it opens is `src/lib/courses/weekReady.ts`
 * (week 1, to everybody holding a place, before groups go out).
 *
 * WHO. The lead of the programme that names the run, while they stand
 * (`programmeLedBy`, the lead's half of the gate every run route a lead
 * passes asks, `runStaffingOf`), and admins. Nobody else: not the run's
 * track leads, its reviewers or a group's facilitators. Every other caller
 * gets the same 403, decided before anything of the run is read, so the
 * answer never says whether a run or a week exists. The order: view-as,
 * session (401), the body (400), the gate (403), the address (404), then the
 * run and the week.
 *
 * WHAT IT REFUSES. Marking ready a week that is not published (409): a ready
 * week is always a published one, and publishing is the run's week editor's
 * (an admin's, for now). Taking Ready back is always allowed, published or
 * not, and leaves Published as it is.
 *
 * Read and written in one transaction, so a week unpublished between the
 * read and the write is not marked ready. A view-as session is refused first.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

/** The week document id the plan uses: "w01" to "w60". */
const WEEK_ID = /^w(\d\d)$/;

/** The one answer to everybody the route is not for. */
const NOT_YOURS = "Only the programme’s lead and admins can mark a week ready.";

export type WeekReadyAnswer = {
  ok: true;
  week: {
    weekId: string;
    weekNumber: number;
    ready: boolean;
    /** ISO 8601 when it was marked, or null when it is not ready. */
    readyAt: string | null;
  };
};

/** A stored time as a Date, or null. */
function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

/** Thrown out of the transaction to refuse with a status. */
class ReadyRefusal extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function PUT(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { ready?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say whether the week is ready: { \"ready\": true } or false." }, { status: 400 });
  }
  if (typeof body?.ready !== "boolean") {
    return NextResponse.json({ error: "Say whether the week is ready: { \"ready\": true } or false." }, { status: 400 });
  }
  const ready = body.ready;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The gate, before anything of the run is read: only the forms, for whether
  // the caller leads the programme that names this run.
  const { runId, weekId } = await ctx.params;
  const isAdmin = actor.role === "admin";
  if (!isAdmin && (!isAddressableId(runId) || (await programmeLedBy(db, actor, runId)) === null)) {
    return NextResponse.json({ error: NOT_YOURS }, { status: 403 });
  }
  const match = WEEK_ID.exec(weekId);
  if (!isAddressableId(runId) || !match || Number(match[1]) < 1 || Number(match[1]) > 60) {
    return NextResponse.json({ error: "That isn’t a week of a run: weeks are w01 to w60." }, { status: 404 });
  }

  const runRef = db.collection("courseRuns").doc(runId);
  const weekRef = runRef.collection("weeks").doc(weekId);
  const weekNumber = Number(match[1]);

  let readyAt: Date | null;
  try {
    readyAt = await db.runTransaction(async (tx): Promise<Date | null> => {
      const [runSnap, weekSnap] = await Promise.all([tx.get(runRef), tx.get(weekRef)]);
      if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) {
        throw new ReadyRefusal("That run isn’t on the site.", 404);
      }
      if (!weekSnap.exists) {
        throw new ReadyRefusal(`Week ${weekNumber} has no page on this run yet.`, 404);
      }
      const week = normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {});
      if (!ready) {
        tx.update(weekRef, { ready: false, readyAt: FieldValue.delete(), readyByUid: FieldValue.delete() });
        return null;
      }
      if (!week.published) {
        throw new ReadyRefusal(
          `Week ${weekNumber} isn’t published yet, so it can’t be marked ready. An admin publishes it in the run’s week editor.`,
          409,
        );
      }
      // Marked already: nothing to write, and the first mark keeps its time.
      if (weekIsReady(week)) return dateOf((weekSnap.data() ?? {}).readyAt);
      tx.update(weekRef, { ready: true, readyAt: FieldValue.serverTimestamp(), readyByUid: actor.uid });
      return new Date();
    });
  } catch (err) {
    if (err instanceof ReadyRefusal) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses week ready] write failed", runId, weekId, err);
    return NextResponse.json({ error: "Couldn’t save that just now. Try again." }, { status: 500 });
  }

  const answer: WeekReadyAnswer = {
    ok: true,
    week: { weekId, weekNumber, ready, readyAt: readyAt ? readyAt.toISOString() : null },
  };
  return NextResponse.json(answer);
}
