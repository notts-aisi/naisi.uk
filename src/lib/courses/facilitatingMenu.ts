import { isAddressableId } from "@/lib/addressableId";
import { couldBeFollowed } from "@/lib/courses/followable";
import { slotWords } from "@/lib/courses/sessionChange/words";

/**
 * THE FACILITATING PART OF THE MENU: what the shell is told about the groups
 * the person signed in facilitates, and the one test of which groups count.
 *
 * WHO: anybody named as a facilitator of a LIVE group (not archived, the
 * account still standing behind the role) of a LIVE run (there, not being
 * destroyed, not archived, and neither a draft nor completed nor cancelled).
 * That is the group page's own test and Home's (`liveRunsOf`), not the term's
 * application form, so it holds from the day somebody is made a facilitator,
 * before groups are published. Messages keeps its own rule (after Publish).
 *
 * WHAT: per group its id, its run's id, its name, when it meets and its room,
 * and per course its id and title, for the guide. NAMED FIELDS ONLY, never a
 * group document handed on: no meeting link, no address, nobody's name. A
 * room that could be followed (a link or an address typed into it,
 * `couldBeFollowed`) is left out, as the emails leave it out.
 *
 * The rows are read on the server (`facilitatingMenuRead.ts`) and answered by
 * `GET /api/messages`, which the shell asks once when it mounts. Pure, so
 * the shell parses the answer with the same shape the route writes.
 */

/** One group the person facilitates, as the menu draws it. */
export type FacilitatingGroup = {
  groupId: string;
  runId: string;
  /** "Group C", or "" for a group with no name (the menu says `UNNAMED_GROUP_WORDS`). */
  name: string;
  /** "Wednesdays 3pm", or "" with no day or time. */
  slot: string;
  /** "Portland A21", or "" with no room or one that could be followed. */
  room: string;
  /** The course the run is of: the guide is the course's. */
  courseId: string;
  /** "AGI Strategy". */
  courseTitle: string;
};

/** The fields the menu reads, in the order the answer writes them. */
export const FACILITATING_FIELDS = ["groupId", "runId", "name", "slot", "room", "courseId", "courseTitle"] as const;

/** A run whose groups are no longer, or not yet, anybody's to run. */
const NOT_LIVE_STATUSES = new Set(["draft", "completed", "cancelled"]);

/** What of a run decides whether its groups count. */
export type MenuRunFacts = {
  status: string;
  archived: boolean;
  destroying: boolean;
  courseId: string;
};

/** Does a group of this run count for the menu? The run as normalised, with `destroying` read off the stored document. */
export function runCountsForMenu(run: MenuRunFacts): boolean {
  return !run.destroying && !run.archived && !NOT_LIVE_STATUSES.has(run.status) && isMenuId(run.courseId);
}

/**
 * An id the menu may build an address from: one document's id
 * (`isAddressableId`, the guide's gate's own test), and at most 200
 * characters. The one copy, for the read and the shell alike.
 */
export function isMenuId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && isAddressableId(value);
}

const oneLine = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/** The menu's name for a group that has none. */
export const UNNAMED_GROUP_WORDS = "Your group";

/**
 * One row, projected field by field from a live group and its run. Only what
 * is named here ever leaves: the group's meeting link, its notes, its people
 * and its facilitators are never read.
 */
export function facilitatingRowOf(
  group: { id: string; runId: string; name: string; session: { weekday: number; startTimeLocal: string; location: string } },
  run: { courseId: string; courseTitle: string },
): FacilitatingGroup {
  const room = oneLine(group.session.location);
  return {
    groupId: group.id,
    runId: group.runId,
    name: oneLine(group.name),
    slot: slotWords(group.session.weekday, group.session.startTimeLocal),
    room: room && !couldBeFollowed(room) ? room : "",
    courseId: run.courseId,
    courseTitle: oneLine(run.courseTitle),
  };
}

/**
 * The answer's list as the shell reads it: every row with each field a
 * string and both ids plain, anything else dropped. Not a list: none.
 */
export function parseFacilitating(raw: unknown): FacilitatingGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: FacilitatingGroup[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (!FACILITATING_FIELDS.every((field) => typeof r[field] === "string")) continue;
    if (!isMenuId(r.groupId) || !isMenuId(r.runId) || !isMenuId(r.courseId)) continue;
    out.push({
      groupId: r.groupId,
      runId: r.runId,
      name: r.name as string,
      slot: r.slot as string,
      room: r.room as string,
      courseId: r.courseId,
      courseTitle: r.courseTitle as string,
    });
  }
  return out;
}

/** The courses of these groups, each once, in the order their groups meet. */
export function facilitatingCourses(groups: readonly FacilitatingGroup[]): { courseId: string; courseTitle: string }[] {
  const seen = new Map<string, string>();
  for (const group of groups) if (!seen.has(group.courseId)) seen.set(group.courseId, group.courseTitle);
  return [...seen].map(([courseId, courseTitle]) => ({ courseId, courseTitle }));
}

// ---------------------------------------------------------------------------
// The short list of guides, for somebody facilitating on two courses or more
// ---------------------------------------------------------------------------

/** The list's heading. */
export const FACILITATOR_GUIDES = "Facilitator guides";

/**
 * Under a course's row: "You facilitate Group C", "You facilitate Group A and
 * Group B". A group with no name is said as one: "You facilitate a group with
 * no name", "You facilitate Group A and a group with no name", "You
 * facilitate 2 groups with no name". "" with no groups.
 */
export function youFacilitateWords(groupNames: readonly string[]): string {
  const named = groupNames.map((name) => name.trim()).filter(Boolean);
  const unnamed = groupNames.length - named.length;
  const parts = [...named];
  if (unnamed === 1) parts.push("a group with no name");
  if (unnamed > 1) parts.push(`${unnamed} groups with no name`);
  if (parts.length === 0) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `You facilitate ${list}`;
}
