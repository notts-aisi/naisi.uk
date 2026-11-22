import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { parseNameBody, renameGroup } from "@/lib/courses/placesAndName/set";
import { NAME_REFUSAL } from "@/lib/courses/placesAndName/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A GROUP'S NAME, from its page under the programme: `{ name }`. Every
 * reader takes the name live (an email at the time it is sent, the
 * registers, search, the calendar feed, whose entries are keyed by ids and
 * so update in place), so the next of each uses the new one. Copies already
 * made keep the old one: emails sent, open task cards, survey check-ins and
 * earlier History lines.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`, the
 * gate of the group's page and of the room, campus, time and places routes
 * beside this one). A reviewer of the programme is refused; anybody with no
 * role on it is told the programme is not there. A view-as session is turned
 * away first.
 *
 * WHAT IS REFUSED: a name that is blank once trimmed and its spaces folded,
 * or longer than 80 characters, before anything is read; then, in one
 * transaction (`src/lib/courses/placesAndName/set.ts`), a group that is not
 * one of the run's or is archived, and a name another live group of the run
 * already has, compared as Add a group compares. A change writes one row of
 * the group's History. NOBODY IS EMAILED. The answer is built field by field.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; groupId: string }> };

export type GroupNameAnswer = {
  ok: true;
  changed: boolean;
  groupId: string;
  groupName: string;
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
  const parsed = parseNameBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NAME_REFUSAL.noProgramme }, { status: 404 });
  }
  if (!groupId || !isAddressableId(groupId)) return NextResponse.json({ error: NAME_REFUSAL.noGroup }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: NAME_REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: NAME_REFUSAL.notYours }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? NAME_REFUSAL.runGone : NAME_REFUSAL.noRun }, { status: 409 });
  }

  const result = await renameGroup(db, view.run.id, groupId, parsed.value, user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const answer: GroupNameAnswer = {
    ok: true,
    changed: result.changed,
    groupId: result.groupId,
    groupName: result.groupName,
    message: result.message,
  };
  return NextResponse.json(answer);
}
