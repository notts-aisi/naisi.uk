import { NextResponse } from "next/server";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { addGroup } from "@/lib/courses/groupTimes/act";
import { parseNewGroup } from "@/lib/courses/groupTimes/rules";
import { REFUSAL } from "@/lib/courses/groupTimes/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * ADD A GROUP to the course run a programme names, from the Groups tab's
 * Times view ("Add a group", and "Use for a group" for a new one):
 * `{ name, weekday, start, minutes, places }`. `places` is a whole number,
 * or null for no limit.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`,
 * the gate of the Groups tab). A reviewer of the programme is refused;
 * anybody with no role on it is told the programme is not there. A view-as
 * session is turned away first.
 *
 * WHAT IS REFUSED, after that: a length no group may last (the group
 * editor's lengths and those the run's groups have), places a group on this
 * run may not have, the name of a group the run already has, and a run with
 * as many groups as the board can show. See `src/lib/courses/groupTimes/`.
 *
 * The group starts as the run editor starts one: nobody in it, no
 * facilitator and no room. Nobody is emailed. The answer is built field by
 * field.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export type GroupAddedAnswer = {
  ok: true;
  groupId: string;
  groupName: string;
  meets: string;
  message: string;
};

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseNewGroup(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: REFUSAL.noProgramme }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: REFUSAL.notYoursAdd }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? REFUSAL.runGone : REFUSAL.noRun }, { status: 409 });
  }

  const result = await addGroup(db, view.run.id, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const answer: GroupAddedAnswer = {
    ok: true,
    groupId: result.groupId,
    groupName: result.groupName,
    meets: result.meets,
    message: result.message,
  };
  return NextResponse.json(answer);
}
