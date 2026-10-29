import { CAMPUS_LABEL, CAMPUS_REFUSAL } from "./campusWords";

/**
 * WHERE A GROUP MEETS, AS A CAMPUS: `courseGroups.campus`.
 *
 * Three campuses and no others (Zach, 29 Oct 2026, "the only options"):
 * University Park, Jubilee and Online. Null is "not chosen yet", which is
 * every group made before campuses existed, and every group until somebody
 * chooses. A room is where in a campus a group meets and is released
 * separately; the campus is what a group is told first.
 *
 * WHO SETS IT: whoever edits a group in the run editor (the group card, a
 * client-direct write the rules hold to exactly these values), and the
 * programme's lead or an admin on the Groups tab, through
 * `PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/campus`.
 * Setting it emails nobody.
 *
 * WHERE IT IS SHOWN: wherever a member reads their group's time (the head of
 * their programme's page, their calendar), and where a room would be shown
 * and there is none yet, the campus stands in for it (`roomOrCampus`).
 *
 * Pure, so the browser, the server and the tests read one answer.
 */

export type GroupCampus = "university-park" | "jubilee" | "online";

/** The three, in the order a control offers them. */
export const GROUP_CAMPUSES: readonly GroupCampus[] = ["university-park", "jubilee", "online"];

export function isGroupCampus(value: unknown): value is GroupCampus {
  return typeof value === "string" && (GROUP_CAMPUSES as readonly string[]).includes(value);
}

/**
 * A stored campus, or null. Anything that is not one of the three reads as
 * "not chosen yet", the widest safe state: a garbled value never names a
 * campus nobody chose.
 */
export function campusOf(raw: unknown): GroupCampus | null {
  return isGroupCampus(raw) ? raw : null;
}

/**
 * The campus route's body, `{ campus }`: one of the three, or null to clear
 * it. Nothing else is a campus, and a body without the key says nothing, so
 * both are refused rather than read as "not chosen".
 */
export function parseCampusBody(
  raw: unknown,
): { ok: true; value: GroupCampus | null } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: CAMPUS_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  if (!Object.hasOwn(body, "campus")) return { ok: false, error: CAMPUS_REFUSAL.notACampus };
  if (body.campus === null) return { ok: true, value: null };
  return isGroupCampus(body.campus) ? { ok: true, value: body.campus } : { ok: false, error: CAMPUS_REFUSAL.notACampus };
}

/** "Jubilee", or "" for no campus. */
export function campusLabel(campus: GroupCampus | null): string {
  return campus ? CAMPUS_LABEL[campus] : "";
}

/**
 * The room, or where a room would be and there is none yet, the campus:
 * "Portland A13", "Jubilee", "Online", or "" with neither.
 */
export function roomOrCampus(room: string, campus: GroupCampus | null): string {
  return room.trim() || campusLabel(campus);
}
