import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { parseCampusBody, type GroupCampus } from "@/lib/courses/campus";
import { setGroupCampus } from "@/lib/courses/campusSet";
import { CAMPUS_REFUSAL } from "@/lib/courses/campusWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A GROUP'S CAMPUS, from the Groups tab: `{ campus }`, one of
 * "university-park", "jubilee" and "online", or null for none chosen
 * (`src/lib/courses/campus.ts`).
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`,
 * the gate of the Groups tab and of the programme's `groups/[groupId]/time`
 * route). A reviewer of the programme is refused; anybody with no role on it
 * is told the programme is not there. A view-as session is turned away first.
 *
 * WHAT IS REFUSED, after that: a group that is not one of the run's, or is
 * archived. A campus may change after Publish has told people their group,
 * as a room may (`src/lib/courses/campusSet.ts`).
 *
 * Nobody is emailed. The answer is built field by field.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; groupId: string }> };

export type GroupCampusAnswer = {
  ok: true;
  changed: boolean;
  groupId: string;
  groupName: string;
  campus: GroupCampus | null;
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
  const parsed = parseCampusBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: CAMPUS_REFUSAL.noProgramme }, { status: 404 });
  }
  if (!groupId || !isAddressableId(groupId)) return NextResponse.json({ error: CAMPUS_REFUSAL.noGroup }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: CAMPUS_REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: CAMPUS_REFUSAL.notYours }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? CAMPUS_REFUSAL.runGone : CAMPUS_REFUSAL.noRun }, { status: 409 });
  }

  const result = await setGroupCampus(db, view.run.id, groupId, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const answer: GroupCampusAnswer = {
    ok: true,
    changed: result.changed,
    groupId: result.groupId,
    groupName: result.groupName,
    campus: result.campus,
    message: result.message,
  };
  return NextResponse.json(answer);
}
