import { pitchSettingsError, storedPitchSettings, type RunPitchSettings } from "@/lib/firestore/courses";
import type { TeamsFrom } from "@/lib/courses/teams/model";

/**
 * PITCHING WEEK'S SETTINGS, as the card on a programme's Groups, Pitches
 * sets them: how the run's teams are made (`CourseRunDoc.teamsFrom`) and the
 * run's part of pitching week (`RunPitchSettings`: how many pitches each
 * person may pick, the smallest and largest team, and the day teams are
 * made). The same fields the run editor's Pitching week section saves, in
 * the same stored shape (`storedPitchSettings` and `teamsFrom`), with every
 * check it makes: a whole number in range or blank for each box, the
 * smallest and largest team given together or both left blank, the smaller
 * first, a real date, and one of the two ways or not set yet.
 *
 * WHICH WEEK is pitching week is not set here: it is the tick on that week's
 * own settings on the Weeks tab, and the week the pitching pages read is the
 * lowest-numbered week ticked (`readPitchingWeek`). The card only says it.
 *
 * Pure, with nothing server-only, so the card checks what it sends with the
 * same function the route checks what arrives.
 */

/** What the card sends and the route takes: every setting, each a value or null. */
export type PitchingWeekInput = {
  teamsFrom: TeamsFrom | null;
  settings: RunPitchSettings;
};

/** The body's keys, every one of them sent. */
export const PITCHING_WEEK_KEYS = ["teamsFrom", "pickLimit", "teamSizeMin", "teamSizeMax", "teamsMadeOn"] as const;

/** The board's words, and the older section's choices of how teams are made. */
export const PITCHING_WEEK = "Pitching week";
export const TEAMS_MADE_FROM = "Teams are made from";
export const PICKS_EACH = "Pitches each person may pick";
export const SMALLEST_TEAM = "Smallest team";
export const LARGEST_TEAM = "Largest team";
export const TEAMS_MADE_ON = "Teams are made on";
export const TEAMS_SHOW = "Teams show on the Teams tab once they’re made.";
export const SAVE_PITCHING_WEEK = "Save pitching week";
export const MADE_FROM_CHOICES: readonly { value: "" | TeamsFrom; label: string }[] = [
  { value: "", label: "Not set yet" },
  { value: "pitches", label: "The pitches from pitching week" },
  { value: "agenda", label: "The agenda people ranked on the application form" },
];

/** "Week 4 · Wed 25 Nov", or "Week 4" while no group meets that week. */
export function pitchingWeekChip(weekNumber: number, firstSession: string | null): string {
  return firstSession ? `Week ${weekNumber} · ${firstSession}` : `Week ${weekNumber}`;
}
/** (MINE) For a programme whose teams are made from the agenda and which has no pitching week. */
export const NO_PITCHING_WEEK_NEEDED = "Teams are made from the agenda people ranked, so no pitching week is needed.";
/** (MINE) Under the card, for a programme with no Teams tab. */
export const PICKS_ONLY_HERE = "This programme has no teams, so only how many pitches each person may pick is set here.";

/** The answers and refusals, as the lead reads them. */
export const PITCHING_WEEK_SAVED = "Pitching week saved.";
export const SIZES_TOGETHER = "Give the smallest and the largest team together, or leave both blank.";
/** (MINE) */
export const NOT_A_WAY = "Teams are made from the pitches, from the agenda, or not set yet.";
/** (MINE) */
export const SEND_EVERY_SETTING = "Send every setting of pitching week, each a value or null.";
/** (MINE) */
export const PITCHING_WEEK_NOT_YOURS = "Only the programme’s lead and admins can set pitching week.";
/** (MINE) */
export const PITCHING_NO_RUN = "This programme doesn’t name a course run yet, so there is no pitching week to set.";
/** (MINE) Once the run has a team, how teams are made stays as it is: changing it would hide the teams already made. */
export const TEAMS_MADE_ALREADY = "This run has teams already, so how its teams are made stays as it is.";

/**
 * A typed box as a whole number, null when blank, NaN when it is not one:
 * the run editor's reading, so "3" is 3 and "3.5" or "three" is refused.
 */
export function wholeOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** One of the two ways, or null for anything else. */
function wayOf(value: unknown): TeamsFrom | null {
  return value === "pitches" ? "pitches" : value === "agenda" ? "agenda" : null;
}

/** Why these settings cannot be saved, or null: the run editor's checks, in its order. */
export function pitchingWeekError(input: PitchingWeekInput): string | null {
  const { teamsFrom, settings } = input;
  if (teamsFrom !== null && teamsFrom !== "pitches" && teamsFrom !== "agenda") return NOT_A_WAY;
  return pitchSettingsError(settings);
}

/** The card's boxes, as typed, read into what is sent: the sizes refused unless given together. */
export function inputFromBoxes(boxes: {
  madeFrom: string;
  pickLimit: string;
  teamMin: string;
  teamMax: string;
  teamsMadeOn: string;
}): { ok: true; input: PitchingWeekInput } | { ok: false; error: string } {
  const min = wholeOrNull(boxes.teamMin);
  const max = wholeOrNull(boxes.teamMax);
  if ((min === null) !== (max === null)) return { ok: false, error: SIZES_TOGETHER };
  const way = wayOf(boxes.madeFrom);
  if (boxes.madeFrom !== "" && way === null) return { ok: false, error: NOT_A_WAY };
  const input: PitchingWeekInput = {
    teamsFrom: way,
    settings: {
      pickLimit: wholeOrNull(boxes.pickLimit),
      teamSize: min !== null && max !== null ? { min, max } : null,
      teamsMadeOn: boxes.teamsMadeOn.trim() || null,
    },
  };
  const problem = pitchingWeekError(input);
  return problem ? { ok: false, error: problem } : { ok: true, input };
}

/** What goes over the wire: the five stored values. */
export function bodyOf(input: PitchingWeekInput): Record<(typeof PITCHING_WEEK_KEYS)[number], string | number | null> {
  return { teamsFrom: input.teamsFrom, ...storedPitchSettings(input.settings) };
}

/**
 * The route's reading of a body: every key present, each a value of its kind
 * or null, then the same checks as the card.
 */
export function parsePitchingWeekBody(raw: unknown): { ok: true; input: PitchingWeekInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: SEND_EVERY_SETTING };
  const body = raw as Record<string, unknown>;
  if (!PITCHING_WEEK_KEYS.every((key) => Object.prototype.hasOwnProperty.call(body, key))) return { ok: false, error: SEND_EVERY_SETTING };
  const { teamsFrom, pickLimit, teamSizeMin, teamSizeMax, teamsMadeOn } = body;
  const numberOrNull = (value: unknown) => value === null || typeof value === "number";
  if (
    !(teamsFrom === null || typeof teamsFrom === "string") ||
    !numberOrNull(pickLimit) ||
    !numberOrNull(teamSizeMin) ||
    !numberOrNull(teamSizeMax) ||
    !(teamsMadeOn === null || typeof teamsMadeOn === "string")
  ) {
    return { ok: false, error: SEND_EVERY_SETTING };
  }
  if ((teamSizeMin === null) !== (teamSizeMax === null)) return { ok: false, error: SIZES_TOGETHER };
  const way = wayOf(teamsFrom);
  if (teamsFrom !== null && way === null) return { ok: false, error: NOT_A_WAY };
  const day = typeof teamsMadeOn === "string" ? teamsMadeOn.trim() : "";
  const input: PitchingWeekInput = {
    teamsFrom: way,
    settings: {
      pickLimit: pickLimit as number | null,
      teamSize: teamSizeMin !== null && teamSizeMax !== null ? { min: teamSizeMin as number, max: teamSizeMax as number } : null,
      teamsMadeOn: day || null,
    },
  };
  const problem = pitchingWeekError(input);
  return problem ? { ok: false, error: problem } : { ok: true, input };
}

/** The same settings, stored: compared field by field so a save that changes nothing writes nothing. */
export function sameSettings(a: PitchingWeekInput, b: PitchingWeekInput): boolean {
  return a.teamsFrom === b.teamsFrom && JSON.stringify(bodyOf(a)) === JSON.stringify(bodyOf(b));
}
