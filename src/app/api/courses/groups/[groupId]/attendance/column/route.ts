import { NextResponse } from "next/server";
import { gateGroupRegister, isAddressableId, loadRegisterMembers, marksExcused } from "@/lib/courses/registerAccess";
import { correctColumn, parseColumnPress, sessionOfPress } from "@/lib/courses/registerCorrection/column";
import { CORRECTION_REFUSAL } from "@/lib/courses/registerCorrection/words";
import { resolveSessions } from "@/lib/courses/sessions";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * CORRECT A WHOLE COLUMN OF A FINISHED REGISTER: it was held online, its
 * lines belong to another session, it was taken for the wrong session, it
 * didn't happen, or it did happen after all
 * (`src/lib/courses/registerCorrection/column.ts` says what each writes).
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * Admins and the people leading the programme (its lead and the run's track
 * leads: `leads` on the register's gate). A facilitator of the group is told
 * to ask for a correction instead; anybody else, a missing group and an
 * archived one are the register gate's one 403 (an admin is told a group is
 * missing). A run's track lead by that alone (not `marksExcused`) is held to
 * the excusal rule: excused among the lines "It did happen" writes only
 * where an excusal stands, and no press of theirs leaves a line where one
 * stands absent or not marked, on this session or on the one a move takes
 * its lines to. Either is refused in one sentence before anything is
 * written.
 *
 * ── ORDER ───────────────────────────────────────────────────────────────────
 * View-as is refused first, then the session, then the register's own gate,
 * then who may correct, and only then the body (`parseColumnPress`): a
 * reason is needed for a press, and a preview (`preview: true`) may be asked
 * before one is written. Then the run and the session.
 *
 * Nobody is emailed by a correction. "It didn't happen" answers with the
 * notice's words when Tell the group was ticked, and its page posts them to
 * the group through the updates route, exactly as "Change a session" does.
 */
export async function POST(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  if (!gated.isAdmin && !gated.leads) {
    return NextResponse.json(
      { error: gated.facilitates ? CORRECTION_REFUSAL.facilitator : "Forbidden" },
      { status: 403 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: CORRECTION_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseColumnPress(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const press = parsed.value;

  const runSnap = await db.collection("courseRuns").doc(gated.runId).get();
  if (!runSnap.exists || runSnap.data()?.destroying === true) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  // Who decides excusals, handed on: a run's track lead by that alone sets
  // excused only where an excusal stands, and leaves no line where one
  // stands absent or not marked; either is refused before anything is
  // written (`excusalRefusal` in `registerCorrection/column.ts`).
  const decidesExcusals = await marksExcused(db, actor, gated, run);
  const sessions = resolveSessions(run, gated.group);
  const session = sessionOfPress(sessions, press);
  if (!session) {
    return NextResponse.json(
      { error: `Week ${press.weekNumber} isn't a taught session of this group's schedule.` },
      { status: 400 },
    );
  }
  const { members } = await loadRegisterMembers(db, run.id, groupId, { isAdmin: gated.isAdmin, role: actor.role }, session.weekNumber);

  try {
    const answer = await correctColumn(
      { db, actor, run, group: gated.group, sessions, session, members, now: new Date(), decidesExcusals },
      press,
    );
    return NextResponse.json(answer.body, { status: answer.status });
  } catch (err) {
    console.error("[courses register column] failed", groupId, err);
    return NextResponse.json({ error: "That correction didn’t go through, so nothing was changed." }, { status: 500 });
  }
}
