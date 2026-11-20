import type { OverviewGroup } from "@/app/api/courses/runs/[runId]/overview/route";
import { youFacilitateWords } from "./facilitatingMenu";
import type { GuideLink, GuideRead } from "./facilitatorGuide/links";
import { facilitatorGuidePath } from "./facilitatorGuide/model";
import { FACILITATOR_GUIDE, guideForWeekWords } from "./facilitatorGuide/words";
import { expectedWords, ticketHeading } from "./facilitatorPageWords";

/**
 * THE GROUPS A FACILITATOR'S HOME IS ABOUT, across every live run they
 * facilitate on: which one Home shows (the one that meets next), how many
 * there are, and the words of the cards that carry the others. The admin's
 * Home asks the same questions for an admin who facilitates.
 *
 * Read from each run's overview (`GET /api/courses/runs/[runId]/overview`),
 * which every facilitator's Home already asks for the run it shows; somebody
 * who facilitates on two runs has the second run's overview read too, and
 * nothing more. Pure, with no server import, so Home in the browser and the
 * tests decide by the same rule.
 */

/** One live run somebody facilitates on, with the groups its overview gave them. */
export type RunGroups<Run> = {
  run: Run;
  /** Each group the overview carries for them, in the overview's order. */
  groups: readonly OverviewGroup[];
};

/** One group, with the run it is on. */
export type GroupOnRun<Run> = { run: Run; group: OverviewGroup };

/**
 * When a group meets next, as a key that sorts in time: its next session's
 * day and start, or a key after every day for a group with no session ahead.
 */
export function meetsNextKey(group: OverviewGroup): string {
  const next = group.calendar.nextSession;
  return next ? `${next.dateKey} ${next.startTimeLocal}` : "9999";
}

/**
 * The groups somebody FACILITATES out of an overview's: the overview also
 * carries the group of a place they hold, which a facilitator who takes part
 * may hold in another group of the same run. With the run's own list of the
 * groups they facilitate (`/api/courses/me`'s `facilitates`), only those;
 * without one (a facilitator the run knows by an older row), every group
 * the overview gives, as Home always read it.
 */
export function facilitatedOf(
  groups: readonly OverviewGroup[],
  facilitates: readonly { groupId: string }[] | undefined,
): OverviewGroup[] {
  if (!facilitates || facilitates.length === 0) return [...groups];
  const ids = new Set(facilitates.map((each) => each.groupId));
  return groups.filter((group) => ids.has(group.id));
}

/**
 * Every group across the runs, the one that meets next first. Groups that
 * meet at the same moment, and groups with no session ahead, keep the order
 * of the runs and then of each overview, so one run reads exactly as it
 * always did.
 */
export function byMeetingNext<Run>(runs: readonly RunGroups<Run>[]): GroupOnRun<Run>[] {
  const all = runs.flatMap(({ run, groups }) => groups.map((group) => ({ run, group })));
  return all
    .map((item, at) => ({ item, at, key: meetsNextKey(item.group) }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.at - b.at)
    .map(({ item }) => item);
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/**
 * Above the group Home shows, for somebody with more than one: today's
 * sentence. With a run that did not answer, its group might meet sooner, so
 * only the count is said (`allAnswered` false): "You facilitate 3 groups."
 */
export function facilitateGroupsWords(count: number, allAnswered = true): string {
  return allAnswered ? `You facilitate ${count} groups. This is the one that meets next.` : `You facilitate ${count} groups.`;
}

/** The way to every group somebody facilitates: My programmes, which lists each one. */
export const SEE_THEM_ALL = "See them all";
export const MY_PROGRAMMES_PATH = "/learn";

/** The card for the groups Home does not show, on another course. */
export function otherGroupsTitle(count: number): string {
  return count === 1 ? "Your other group" : "Your other groups";
}

/** "Group B · Technical AI Safety": a group and its course, each part that is known. */
export function groupAndCourseWords(groupName: string, courseTitle: string): string {
  return [groupName.trim(), courseTitle.trim()].filter(Boolean).join(" · ");
}

/** "Thu 12 Nov, 5pm · Monica Partridge E02": when a group meets next and where, each part that is known. */
export function nextMeetingWords(dateKey: string, startTimeLocal: string, room: string | null): string {
  return [ticketHeading(dateKey, startTimeLocal), (room ?? "").trim()].filter(Boolean).join(" · ");
}

/** The admin's card's eyebrow: "You facilitate Group C". */
export function adminCardEyebrow(groupName: string): string {
  return youFacilitateWords([groupName]);
}

/** Under the admin's card's heading: "Portland A21 · 7 expected", each part that is known. */
export function roomAndExpectedWords(room: string | null, expected: number | null): string {
  return [(room ?? "").trim(), expected !== null && expected > 0 ? expectedWords(expected) : ""].filter(Boolean).join(" · ");
}

/** On the card for the other groups, when a run did not answer. */
export const NOT_ALL_LOADED = "We couldn’t load all your groups just now.";

/**
 * Somebody on two courses who takes part in one: "You’re taking part in AGI
 * Strategy too: your own week, with its readings and questions, is on its
 * programme’s page." One line for each course they take part in, whichever
 * group Home shows.
 */
export function takingPartInWords(courseTitle: string): string {
  const course = courseTitle.trim();
  return course
    ? `You’re taking part in ${course} too: your own week, with its readings and questions, is on its programme’s page.`
    : "You’re taking part too: your own week, with its readings and questions, is on your programme’s page.";
}

/**
 * THE ONE GUIDE LINK on the card for the other groups: "Facilitator guide for
 * week 3" when the guide has that week, else "Facilitator guide", the guide's
 * own page, as the session card's rule falls back to it (a read that failed
 * included, the reader being one the guide admits). None for a guide with
 * nothing loaded, which the rule never links to, and none with no course:
 * the row then has the way to the group alone. The group shown keeps the
 * full rule.
 */
export function oneGuideLink(read: GuideRead, courseId: string, weekNumber: number | null): GuideLink | null {
  if (!courseId || read.kind === "empty") return null;
  if (read.kind === "loaded" && weekNumber !== null && read.weeks.includes(weekNumber)) {
    return { href: facilitatorGuidePath(courseId, { kind: "week", weekNumber }), label: guideForWeekWords(weekNumber) };
  }
  return { href: facilitatorGuidePath(courseId), label: FACILITATOR_GUIDE };
}
