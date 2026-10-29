import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { parseRoomBody, setGroupRoom } from "@/lib/courses/roomSet";
import { ROOM_REFUSAL } from "@/lib/courses/roomWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A GROUP'S ROOM, from the Groups tab: `{ room }`, the room it meets in every
 * week ("" for none), the same field as the run editor's group card's
 * "Location". One week's room is "Change a session"'s.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`, the
 * gate of the Groups tab and of the campus and time routes beside this one).
 * A reviewer of the programme is refused; anybody with no role on it is told
 * the programme is not there. A view-as session is turned away first.
 *
 * WHAT IS REFUSED, after that: a group that is not one of the run's, or is
 * archived (`src/lib/courses/roomSet.ts`). Nobody is emailed. The answer is
 * built field by field.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; groupId: string }> };

export type GroupRoomAnswer = {
  ok: true;
  changed: boolean;
  groupId: string;
  groupName: string;
  room: string;
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
  const parsed = parseRoomBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: ROOM_REFUSAL.noProgramme }, { status: 404 });
  }
  if (!groupId || !isAddressableId(groupId)) return NextResponse.json({ error: ROOM_REFUSAL.noGroup }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: ROOM_REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: ROOM_REFUSAL.notYours }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? ROOM_REFUSAL.runGone : ROOM_REFUSAL.noRun }, { status: 409 });
  }

  const result = await setGroupRoom(db, view.run.id, groupId, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const answer: GroupRoomAnswer = {
    ok: true,
    changed: result.changed,
    groupId: result.groupId,
    groupName: result.groupName,
    room: result.room,
    message: result.message,
  };
  return NextResponse.json(answer);
}
