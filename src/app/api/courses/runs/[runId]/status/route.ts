import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { canApproveCourse } from "@/lib/firestore/users";
import { COURSE_RUN_STATUSES, type CourseRunStatus } from "@/lib/firestore/courses";
import { moveRunStatus } from "@/lib/courses/runStatusMove";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";

/**
 * Move a run along its lifecycle. Gated to admins and `approveCourse`
 * holders — the same two-person rule as events: a drafter may author a run's
 * content, but opening applications or declaring a cohort finished changes
 * what the world sees and what the apply route accepts.
 *
 * The transition table decides WHICH move is legal, and this route is the only
 * status path the admin UI uses.
 *
 * The table lives in `@/lib/courses/runStatus` so the run editor's dropdown is
 * built from the same data and can never offer a move this route refuses.
 * The move itself, with every check it makes, is `moveRunStatus`
 * (`@/lib/courses/runStatusMove`), the one path the job that completes a run
 * when its work closes takes too.
 *
 * LEAVING DRAFT IS A ONE-WAY DOOR for the week plan, so the move also owns
 * the last check on it (`draftExitBlocker`, `@/lib/courses/draftExit`).
 *
 * `through: "running"` is the programme's Settings' "Mark it completed now"
 * on a run whose stored status is still Applications open or closed: two
 * moves of the table, to Running and then to Completed (`stepsThroughRunning`).
 * Without it, a move must be one entry of the table, as it always was.
 */

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canApproveCourse(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let body: { status?: unknown; through?: unknown };
  try {
    body = (await req.json()) as { status?: unknown; through?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const next = body.status;
  if (!COURSE_RUN_STATUSES.includes(next as CourseRunStatus)) {
    return NextResponse.json({ error: "Unknown run status" }, { status: 400 });
  }
  const nextStatus = next as CourseRunStatus;
  if (body.through !== undefined && body.through !== "running") {
    return NextResponse.json({ error: "A move can only step through Running." }, { status: 400 });
  }

  // Read, checked and written in one transaction: see `moveRunStatus` for
  // each check in order (a missing run, a run being destroyed, the status it
  // already has, the table, the week ids on leaving draft).
  const moved = await moveRunStatus(db, runId, nextStatus, { throughRunning: body.through === "running" });
  if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });
  return NextResponse.json({ ok: true, status: moved.status });
}
