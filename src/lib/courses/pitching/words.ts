import { clockWords, namesInWords } from "@/lib/courses/facilitatingEmail";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import type { RunPitchSettings } from "@/lib/firestore/courses";

/**
 * PITCHING WEEK'S WORDS, built from records.
 *
 * The sentences in-pitch-phone draws ("Pick up to 3 you’d join before
 * tonight’s session at 6pm.", "Edit until 6pm", "2 of 3 picked", "Zach makes
 * the teams on Thu 19 Nov. Teams are 2 to 4 people.") with every value in
 * them taken from a setting or from the group's own calendar. Times and days
 * are London's: a session's day is the civil date its calendar gives it and
 * its time is the wall clock it was set at, so nothing here re-zones an
 * instant.
 *
 * Pure, and built on the server: the page's client code reads these as
 * finished sentences. The one it works out again after a press, "2 of 3
 * picked", is `pickedWords` in `./model`, which the browser can load.
 */

/** When a group's session in pitching week starts: its London day and its wall clock. */
export type SessionStart = {
  /** The instant, for comparing with now. */
  at: Date;
  /** The London civil date it falls on, "YYYY-MM-DD". */
  dateKey: string;
  /** The wall clock it starts at, "HH:MM". */
  startTimeLocal: string;
};

/** From five in the afternoon a session that day is tonight's. */
const EVENING_FROM_HOUR = 17;

function clockOf(start: SessionStart): string {
  return clockWords(start.startTimeLocal) ?? "";
}

function dayOf(start: SessionStart): string {
  return formatRunStartShort(start.dateKey) ?? "";
}

/** "tonight’s session at 6pm", "today’s session at 1pm", "the session on Thu 12 Nov at 6pm". */
export function sessionWords(start: SessionStart, now: Date): string {
  if (londonDateKey(now) === start.dateKey) {
    const hour = Number(start.startTimeLocal.slice(0, 2));
    return `${hour >= EVENING_FROM_HOUR ? "tonight’s" : "today’s"} session at ${clockOf(start)}`;
  }
  return `the session on ${dayOf(start)} at ${clockOf(start)}`;
}

/**
 * The line under "Pitching week": how things stand, then what is left to do
 * and by when.
 *
 *  - open, with a pick limit: "Pitches are in. Pick up to 3 you’d join before
 *    tonight’s session at 6pm." (the board's words);
 *  - open, with no pick limit: "... You can pitch until tonight’s session at
 *    6pm.", because nobody can pick yet;
 *  - after the session has started: "Pitching closed at 6pm on Thu 12 Nov,
 *    when your group’s session started.";
 *  - when the group's calendar gives that week no session: it says so.
 */
export function ledeWords(input: {
  pitchCount: number;
  pickLimit: number | null;
  start: SessionStart | null;
  now: Date;
}): string {
  const { pitchCount, pickLimit, start, now } = input;
  if (!start) {
    return "Your group’s session that week has no time yet, so pitching hasn’t opened.";
  }
  if (now.getTime() >= start.at.getTime()) {
    return `Pitching closed at ${clockOf(start)} on ${dayOf(start)}, when your group’s session started.`;
  }
  const state = pitchCount > 0 ? "Pitches are in." : "No pitches yet.";
  const session = sessionWords(start, now);
  return pickLimit !== null
    ? `${state} Pick up to ${pickLimit} you’d join before ${session}.`
    : `${state} You can pitch until ${session}.`;
}

/** "Edit until 6pm" on the session's day, "Edit until 6pm on Thu 12 Nov" before it. */
export function editUntilWords(start: SessionStart, now: Date): string {
  return londonDateKey(now) === start.dateKey
    ? `Edit until ${clockOf(start)}`
    : `Edit until ${clockOf(start)} on ${dayOf(start)}`;
}

/**
 * "Pitched by Aditya Rao and Ellie Morgan". On a person's own pitch they are
 * "you": "Pitched by you", "Pitched by you and Ellie Morgan".
 */
export function pitchedByWords(names: readonly string[], ownPartner: string | null | undefined): string {
  if (ownPartner !== undefined) {
    return ownPartner ? `Pitched by you and ${ownPartner}` : "Pitched by you";
  }
  return `Pitched by ${namesInWords(names)}`;
}

/**
 * "Zach makes the teams on Thu 19 Nov. Teams are 2 to 4 people." Each half
 * only when its setting is there, and the lead's first name only when a lead
 * is known; null when neither half has anything to say.
 */
export function teamsWords(settings: RunPitchSettings, leadFirstName: string | null): string | null {
  const parts: string[] = [];
  if (settings.teamsMadeOn) {
    const day = formatRunStartShort(settings.teamsMadeOn);
    if (day) {
      parts.push(leadFirstName ? `${leadFirstName} makes the teams on ${day}.` : `The teams are made on ${day}.`);
    }
  }
  if (settings.teamSize) {
    const { min, max } = settings.teamSize;
    parts.push(
      min === max
        ? `Teams are ${min} ${min === 1 ? "person" : "people"}.`
        : `Teams are ${min} to ${max} people.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/** "Incubator: Alignment Research · Week 3", or the course's title when no programme names the run. */
export function eyebrowWords(
  programme: { kind: "fellowship" | "incubator"; shortName: string } | null,
  courseTitle: string,
  weekNumber: number,
): string {
  const where = programme
    ? `${programme.kind === "incubator" ? "Incubator" : "Fellowship"}: ${programme.shortName}`
    : courseTitle;
  return where ? `${where} · Week ${weekNumber}` : `Week ${weekNumber}`;
}

/** "6 would join". */
export function wouldJoinWords(count: number): string {
  return `${count} would join`;
}
