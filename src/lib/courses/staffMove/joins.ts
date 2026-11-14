import { groupStretchesOf, type PlaceByWeek } from "../groupsByWeek";
import { weeksWords } from "./words";

/**
 * SOMEBODY MOVED INTO A GROUP MID-TERM, ON THAT GROUP'S PAGE FOR A WEEK BEFORE
 * THEY JOINED IT: not one of that week's people (not in its work, not
 * expected at its session, no word said, no register line), but listed with
 * them as the board draws it: "Leo Park", "Joins Group F from week 3, with
 * weeks 1 and 2 to read", chip "New from week 3". Their name still leads to
 * the reading view. Kept apart from the page's other lines, so a line of
 * another kind can join the list beside it.
 *
 * Pure.
 */

export type JoinsLater = {
  /** The week they join the group. */
  fromWeek: number;
  /** The weeks before it they spent elsewhere, whose work the group's facilitators read: from their first. */
  weeksToRead: number[];
};

/**
 * Whether the place joins `groupId` after `weekNumber` (its next stretch in
 * the group starts later), and from which week: null for somebody in the
 * group that week, or never in it.
 */
export function joinsLaterOf(place: PlaceByWeek & { joinedWeekNumber?: number }, groupId: string, weekNumber: number): JoinsLater | null {
  const stretch = groupStretchesOf(place).find((each) => each.groupId === groupId && each.fromWeek > weekNumber);
  if (!stretch) return null;
  const from = Number.isInteger(place.joinedWeekNumber) && (place.joinedWeekNumber ?? 1) > 1 ? (place.joinedWeekNumber as number) : 1;
  const weeksToRead: number[] = [];
  for (let week = from; week < stretch.fromWeek; week += 1) weeksToRead.push(week);
  return { fromWeek: stretch.fromWeek, weeksToRead };
}

/** "Joins Group F from week 3, with weeks 1 and 2 to read", or "Joins Group F from week 3". */
export function joinsLaterWords(groupName: string, joins: JoinsLater): string {
  const group = groupName.replace(/\s+/g, " ").trim() || "the group";
  const weeks = weeksWords(joins.weeksToRead);
  return weeks ? `Joins ${group} from week ${joins.fromWeek}, with ${weeks} to read` : `Joins ${group} from week ${joins.fromWeek}`;
}

/** The chip: "New from week 3". */
export function newFromWeekWords(fromWeek: number): string {
  return `New from week ${fromWeek}`;
}
