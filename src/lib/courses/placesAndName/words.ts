/**
 * A GROUP'S PLACES AND ITS NAME, changed on the group's page under its
 * programme: the two rows of "How Group C meets", their panels, what saving
 * says, the History lines, and what the two routes refuse.
 *
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/places
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/name
 *
 * A group's places are its own limit (`courseGroups.capacity`): people are
 * placed up to it, and the group shows Full when it is reached. They are not
 * what the programme's public page says about places, which is set on
 * Settings. Neither change emails anybody.
 *
 * Where a sentence already exists on the site it is reused, not rewritten:
 * the blank name and the name's length (Times' Add a group and the older
 * group card), and every refusal of a number (`placesProblem`, which is
 * Times' own sentence and then `groupCapacityError`'s).
 *
 * Pure: a client component and a server route share this file.
 */

import { REFUSAL as TIMES_REFUSAL } from "../groupTimes/words";
import { peopleWords } from "../sessionChange/words";

// ---------------------------------------------------------------------------
// The two rows of "How Group C meets"
// ---------------------------------------------------------------------------

export const PLACES = "Places";
export const NAME = "Name";
export const RENAME = "Rename";

/** "8 places", "1 place", "No limit": a group's own limit, alone. */
export function placesWords(capacity: number | null): string {
  if (capacity === null) return "No limit";
  return capacity === 1 ? "1 place" : `${capacity} places`;
}

/** "8 places · 6 in the group", "No limit · 6 in the group", "1 place · 12 in the group". */
export function placesRowWords(capacity: number | null, inGroup: number): string {
  return `${placesWords(capacity)} · ${inGroup} in the group`;
}

// ---------------------------------------------------------------------------
// The places panel
// ---------------------------------------------------------------------------

/** "Change Group C’s places". */
export function placesPanelTitle(groupName: string): string {
  return `Change ${groupName}’s places`;
}

/** Under the title. */
export function placesLede(groupName: string): string {
  return `How many people ${groupName} takes. People are placed up to this number, and ${groupName} shows Full when it’s reached.`;
}

export const PLACES_FIELD = "Places";

/** What the places can't go below: the people in the group, and the freed places offered in it and not answered. */
export type PlacesFloor = { inGroup: number; freedOffers: number };

/** The smallest number of places the group may have. */
export function floorOf(floor: PlacesFloor): number {
  return floor.inGroup + floor.freedOffers;
}

/** "6 people in it", "1 person in it", "6 people in it and 1 freed place offered". */
function holdsWords(floor: PlacesFloor): string {
  const people = `${peopleWords(floor.inGroup)} in it`;
  if (floor.freedOffers === 0) return people;
  const offered = floor.freedOffers === 1 ? "1 freed place offered" : `${floor.freedOffers} freed places offered`;
  return floor.inGroup === 0 ? offered : `${people} and ${offered}`;
}

/**
 * The field's hint: "Leave it empty for no limit. Group C has 6 people in it,
 * so it can’t be fewer than 6." With nobody in the group and nothing offered,
 * the first sentence alone.
 */
export function placesHint(groupName: string, floor: PlacesFloor): string {
  const empty = "Leave it empty for no limit.";
  if (floorOf(floor) === 0) return empty;
  return `${empty} ${groupName} has ${holdsWords(floor)}, so it can’t be fewer than ${floorOf(floor)}.`;
}

/** Keeps the group's own limit apart from what the programme's public page says. */
export function placesOwnLimitNote(groupName: string): string {
  return `This is ${groupName}’s own limit. What the programme’s public page says about places is set on Settings, under Dates and places.`;
}

export const EMAILS_NOBODY = "This emails nobody.";
export const SAVE_PLACES = "Save places";
export const CANCEL = "Cancel";
export const SAVING = "Saving…";

/**
 * The refusal below the floor: "Group C has 6 people in it, so its places
 * can’t go below 6. Move somebody out first, or set 6 or more." With freed
 * places offered and not answered, they are counted and named too.
 */
export function belowFloorWords(groupName: string, floor: PlacesFloor): string {
  const least = floorOf(floor);
  return `${groupName} has ${holdsWords(floor)}, so its places can’t go below ${least}. Move somebody out first, or set ${least} or more.`;
}

/** "Group C now takes 10. Nobody was emailed." */
export function placesSavedWords(groupName: string, capacity: number | null): string {
  return capacity === null
    ? `${groupName} now has no limit. Nobody was emailed.`
    : `${groupName} now takes ${capacity}. Nobody was emailed.`;
}

/** The History line, beside who changed it: "Changed the places from 8 to 10." */
export function placesHistoryWords(before: number | null, after: number | null): string {
  const said = (capacity: number | null) => (capacity === null ? "no limit" : String(capacity));
  return `Changed the places from ${said(before)} to ${said(after)}.`;
}

// ---------------------------------------------------------------------------
// The name panel
// ---------------------------------------------------------------------------

/** "Rename Group C". */
export function renamePanelTitle(groupName: string): string {
  return `Rename ${groupName}`;
}

export const NAME_FIELD = "Group name";
export const NAME_HINT =
  "The name shows in every email, register and calendar entry from now on. Nobody is emailed about the change.";
export const SAVE_THE_NAME = "Save the name";

/** "Group B is already one of this run’s groups. Give Group C another name." */
export function nameTakenWords(takenName: string, groupName: string): string {
  return `${takenName} is already one of this run’s groups. Give ${groupName} another name.`;
}

/** "Group C is now Wednesday afternoons. Nobody was emailed." */
export function renamedWords(before: string, after: string): string {
  return `${before} is now ${after}. Nobody was emailed.`;
}

/** The History line, beside who renamed it: "Renamed Group C to Wednesday afternoons." */
export function renameHistoryWords(before: string, after: string): string {
  return `Renamed ${before} to ${after}.`;
}

// ---------------------------------------------------------------------------
// What the two routes refuse
// ---------------------------------------------------------------------------

export const PLACES_REFUSAL = {
  body: TIMES_REFUSAL.body,
  /** Times' own sentence for a number that is not one. */
  notANumber: TIMES_REFUSAL.places,
  notYours: "Only the programme’s lead and admins can change a group’s places here.",
  noProgramme: TIMES_REFUSAL.noProgramme,
  noRun: TIMES_REFUSAL.noRun,
  runGone: TIMES_REFUSAL.runGone,
  noGroup: TIMES_REFUSAL.noGroup,
  archived: "That group has been archived, so its places can’t change.",
} as const;

export const NAME_REFUSAL = {
  body: TIMES_REFUSAL.body,
  /** The older group card's own sentence, and Times'. */
  blank: TIMES_REFUSAL.name,
  tooLong: TIMES_REFUSAL.nameLong,
  notYours: "Only the programme’s lead and admins can rename a group here.",
  noProgramme: TIMES_REFUSAL.noProgramme,
  noRun: TIMES_REFUSAL.noRun,
  runGone: TIMES_REFUSAL.runGone,
  noGroup: TIMES_REFUSAL.noGroup,
  archived: "That group has been archived, so it can’t be renamed.",
} as const;
