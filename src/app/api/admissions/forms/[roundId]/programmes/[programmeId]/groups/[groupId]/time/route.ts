import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { changeGroupTime } from "@/lib/courses/groupTimes/act";
import { parseChangeTime } from "@/lib/courses/groupTimes/rules";
import { REFUSAL } from "@/lib/courses/groupTimes/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A GROUP'S DAY AND START, from the Groups tab's Times view ("Change", and
 * "Use for a group" on a group that exists): `{ weekday, start, from }`,
 * where `from` is the day and start the dialog showed when it was opened.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`,
 * the gate of the Groups tab). A reviewer of the programme is refused;
 * anybody with no role on it is told the programme is not there. A view-as
 * session is turned away first.
 *
 * WHAT IS REFUSED, after that: a group that is not one of the run's, or is
 * archived; a dialog opened on a time that has changed since (409); and a
 * group Publish has told somebody the time of (409, pointing to Change a
 * session, which moves one week and tells the group). See
 * `src/lib/courses/groupTimes/`.
 *
 * Nobody is emailed. The answer is built field by field.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; groupId: string }> };

export type GroupTimeAnswer = {
  ok: true;
  changed: boolean;
  groupId: string;
  groupName: string;
  meets: string;
  message: string;
};

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId, groupId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseChangeTime(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: REFUSAL.noProgramme }, { status: 404 });
  }
  if (!groupId || !isAddressableId(groupId)) return NextResponse.json({ error: REFUSAL.noGroup }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: REFUSAL.notYoursChange }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? REFUSAL.runGone : REFUSAL.noRun }, { status: 409 });
  }

  const result = await changeGroupTime(db, view.run.id, groupId, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const answer: GroupTimeAnswer = {
    ok: true,
    changed: result.changed,
    groupId: result.groupId,
    groupName: result.groupName,
    meets: result.meets,
    message: result.message,
  };
  return NextResponse.json(answer);
}
