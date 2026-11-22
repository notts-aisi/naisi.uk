import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { parsePlacesBody, setGroupPlaces } from "@/lib/courses/placesAndName/set";
import { PLACES_REFUSAL } from "@/lib/courses/placesAndName/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A GROUP'S PLACES, from its page under the programme: `{ places }`, a whole
 * number, or null for no limit. The group's own limit (`capacity`): people
 * are placed up to it and the group shows Full when it is reached. What the
 * programme's public page says about places is Settings', never this.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`, the
 * gate of the group's page and of the room, campus and time routes beside
 * this one). A reviewer of the programme is refused; anybody with no role on
 * it is told the programme is not there. A view-as session is turned away
 * first.
 *
 * WHAT IS REFUSED, after that, in one transaction
 * (`src/lib/courses/placesAndName/set.ts`): a group that is not one of the
 * run's, or is archived; a number the site's rule for a group's capacity
 * refuses; and a number below the people in the group plus the freed places
 * offered in it and not answered, a press that leaves the number as it is
 * included. A change writes one row of the group's History. NOBODY IS
 * EMAILED. The answer is built field by field.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; groupId: string }> };

export type GroupPlacesAnswer = {
  ok: true;
  changed: boolean;
  groupId: string;
  groupName: string;
  places: number | null;
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
  const parsed = parsePlacesBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: PLACES_REFUSAL.noProgramme }, { status: 404 });
  }
  if (!groupId || !isAddressableId(groupId)) return NextResponse.json({ error: PLACES_REFUSAL.noGroup }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: PLACES_REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: PLACES_REFUSAL.notYours }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? PLACES_REFUSAL.runGone : PLACES_REFUSAL.noRun }, { status: 409 });
  }

  const result = await setGroupPlaces(db, view.run.id, groupId, parsed.value, user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const answer: GroupPlacesAnswer = {
    ok: true,
    changed: result.changed,
    groupId: result.groupId,
    groupName: result.groupName,
    places: result.places,
    message: result.message,
  };
  return NextResponse.json(answer);
}
