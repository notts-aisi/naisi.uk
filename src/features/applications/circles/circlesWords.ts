import type { SessionSlot } from "@/lib/admissions/availability";
import { listInWords } from "@/lib/applications/review/people";
import { clockLabel } from "@/lib/applications/review/availabilityView";
import { lengthWords } from "@/lib/courses/sessionLength";

/**
 * WHAT CIRCLES SAYS, in one place: the run's groups as rings, each person's
 * panel, a suggestion drawn over the rings as a preview, every change it
 * would send listed before the press, and what saved and what did not after
 * it. Refusals of a placement are the board's own words
 * (`notMovedWords` in `../groups/peopleInGroupsWords.ts`), never a code.
 *
 * A person is named and never given a pronoun. No dash of either kind.
 * Pure, with no server import.
 */

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** "Tue 6pm". */
export function whenWords(session: Pick<SessionSlot, "weekday" | "startTimeLocal">): string {
  return `${DAY[session.weekday] ?? ""} ${clockLabel(minutesOf(session.startTimeLocal))}`;
}

/** "Tue 6pm for 2 hours". */
export function sessionWords(session: SessionSlot): string {
  return `${whenWords(session)} for ${lengthWords(session.durationMinutes)}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const TITLE = "Circles";

export const LEDE =
  "Each ring is one of the run’s groups, with the people in it now. Click a person to see their week against every group’s time, what Claude made of their application and their Pangram flags, and to move them. A move saves straight away, as on People in groups. Nobody is emailed: Publish tells people their group. Only admins see this.";

/** "40 on the run’s list · 34 in a group · 6 not in a group · 3 placed and not told yet". */
export function countsLine(counts: { onList: number; inAGroup: number; notInAGroup: number; untold: number | null }): string {
  const parts = [`${counts.onList} on the run’s list`, `${counts.inAGroup} in a group`, `${counts.notInAGroup} not in a group`];
  if (counts.untold !== null && counts.untold > 0) parts.push(`${counts.untold} placed and not told yet`);
  return parts.join(" · ");
}

/** People holding a place who cannot be placed yet. */
export function notOnListWords(names: readonly string[]): string {
  const shown = names.length > 6 ? [...names.slice(0, 6), `${names.length - 6} more`] : [...names];
  const verb = names.length === 1 ? "holds a place but isn’t" : "hold a place but aren’t";
  return `${listInWords(shown)} ${verb} on the run’s list yet, so they can’t be placed. Hand them over on the Settings tab.`;
}

export const GO_TO_SETTINGS = "Go to Settings";

export const BEFORE_DECISIONS =
  "Decisions haven’t gone out yet, so nobody is on the run. Suggest groups to preview them from the decisions as they stand; there is nothing to apply until decisions have gone out.";

export const NO_GROUPS = "This run has no groups yet. Add one below, or suggest groups.";

// ---------------------------------------------------------------------------
// The rings
// ---------------------------------------------------------------------------

export const NO_TIME_YET = "No time yet";
export const NEW_GROUP = "new group";
export const NEW_TIME = "new time";
export const FACILITATING = "Facilitating";
export const LEAD = "Lead";
export const BACK_UP = "Back-up";
export const NOT_TOLD = "Not told yet";
export const MOVES_IN = "Moves in";
export const MOVE_HERE = "Move here";
export const MOVE_HERE_CANT = "Move here (can’t make it)";

/** "Group A · 7 of 8", or "Group A · 7" for a group with no limit. */
export function seatsLine(name: string, count: number, room: number | null): string {
  return room === null ? `${name} · ${count}` : `${name} · ${count} of ${room}`;
}

/** Under a ring: its facilitators who hold no place on the run. */
export function facilitatingOutside(names: readonly string[]): string {
  return `Facilitating, with no place on the run: ${listInWords(names)}`;
}

export function moveAria(name: string, group: string): string {
  return `Move ${name} to ${group}`;
}

/** What is wrong with a group as it stands, a sentence each. */
export const WARN = {
  near: (name: string) => `${name} is near their time, not in it: check with them.`,
  cant: (name: string) => `${name} didn’t mark this time as free on their application.`,
  over: (count: number, room: number) => `${count} people, and room for ${room}.`,
  noFacilitator: "No facilitator.",
  noBackUp: (name: string) => `${name} didn’t offer to facilitate, and nobody here who did is backing them up.`,
};

export const LEGEND =
  "Click a person to see their week and what Claude made of their application, then click a ring, or a group on their chart, to move them. A red tag is somebody who didn’t mark that time as free, “!” is a Pangram flag, and “Not told yet” is somebody Publish hasn’t told their group.";

// ---------------------------------------------------------------------------
// One person
// ---------------------------------------------------------------------------

export const OPEN_APPLICATION = "Open their application";
export const AS_A_FACILITATOR = (level: string) => `As a facilitator: ${level}.`;
export const LEAN = (lean: string) => `Claude’s lean: ${lean}. `;
export const STRENGTHS = (items: readonly string[]) => `Strengths: ${items.join("; ")}.`;
export const CONCERNS = (items: readonly string[]) => `Concerns: ${items.join("; ")}.`;
export const PANGRAM_FLAG = "Pangram flagged answers";
export const ROLE_VERB = { lead: "leads", second: "backs up" } as const;
export const PERSON_PANEL = "The person you picked";
export const POTENTIAL: Record<string, string> = { high: "Strong", medium: "Possible", low: "Unlikely" };
export const OFFERED = "Offered to facilitate.";
export const DIDNT_OFFER = "Didn’t offer to facilitate.";
export const TOLD = " Publish has told them their group.";
export const LITTLE_MARKED = " Marked under 4 hours in the week.";
export const NOT_READ = "Claude hasn’t read their application.";
export const NO_WEEK = "They haven’t said when they’re free, so nothing is shaded.";

export function pangramLine(flags: number | null): string {
  if (flags === null) return "Pangram: not checked.";
  if (flags === 0) return "Pangram: nothing flagged.";
  return `Pangram: ${plural(flags, "answer", "answers")} worth a look. Read them before deciding; a flag is never a finding on its own.`;
}

export function thinLine(thin: number): string {
  return `${plural(thin, "answer", "answers")} thin or brief.`;
}

/** Where they are, and how to move them. */
export function whereLine(group: string | null): string {
  return group
    ? `In ${group}. Pick a group on the chart, or click another ring, to move them.`
    : "Not in a group. Pick a group on the chart, or click a ring, to put them in it.";
}

/** Somebody who facilitates a group: why they cannot be dragged, and what to do. */
export function facilitatesLine(group: string): string {
  return `Facilitates ${group}, so they sit in it and can’t be moved to another group. To move them, change who facilitates ${group} first.`;
}

export const START_A_GROUP = "Or start a new group at a time they marked:";

/** "3 of 6 not in a group, 12 in all". */
export function startCounts(leftOut: number, outside: number, everybody: number): string {
  return `${leftOut} of ${outside} not in a group, ${everybody} in all`;
}

export const MAKE_FACILITATOR = (group: string) => `Make them a facilitator of ${group}`;
export const STOP_FACILITATING = (group: string) => `Stop facilitating ${group}`;
export const STOP_CONFIRM = (name: string, group: string) =>
  `Take ${name} off ${group}’s facilitators?\n\nThey stay in the group as one of its people. Nobody is emailed.`;
export const ASK_THEM = "Ask them";
export const ASK_THEM_WHY = "They didn’t offer, so ask them first, from Groups, Facilitators, under “Didn’t offer, but worth asking”.";
export const TAKE_OUT = "Take out of groups";
export const MAKE_LEAD = "Make lead";
export const MAKE_BACK_UP = "Make back-up";
export const NOT_A_FACILITATOR = "Not a facilitator";
export const DONE = "Done";
export const PREVIEW_NOT_OFFERED = "They didn’t offer, so Apply won’t make them a facilitator: ask them from Groups, Facilitators.";
export const FACILITATORS_VIEW = "Go to Facilitators";

// ---------------------------------------------------------------------------
// What a live change said
// ---------------------------------------------------------------------------

export function movedWords(name: string, group: string | null): string {
  return group ? `${name} is in ${group} now.` : `${name} is out of groups now.`;
}

export function facilitatorSavedWords(name: string, group: string, added: boolean): string {
  return added ? `${name} facilitates ${group} now.` : `${name} no longer facilitates ${group}.`;
}

export function groupAddedWords(name: string, session: SessionSlot): string {
  return `${name} added: ${sessionWords(session)}.`;
}

export function timeSavedWords(name: string, session: SessionSlot): string {
  return `${name} meets ${whenWords(session)} now.`;
}

export const CONNECTION = "That couldn’t be sent. Check your connection and try again.";
export const READ_AGAIN_FAILED = "Saved, but the groups couldn’t be read again. Reload the page to see them.";

// ---------------------------------------------------------------------------
// Adding a group, and a group's time
// ---------------------------------------------------------------------------

export const ADD_A_GROUP = "Add a group";
export const ADD_THIS_GROUP = "Add this group";
export const DAY_LABEL = "Day";
export const STARTS_LABEL = "Starts";

/** "3 of the 6 not in a group, and 12 of all 40, can make Tue 6pm for 2 hours." */
export function newGroupCounts(leftOut: number, outside: number, everybody: number, all: number, session: SessionSlot): string {
  return `${leftOut} of the ${outside} not in a group, and ${everybody} of all ${all}, can make ${sessionWords(session)}.`;
}

export const REMOVE_GROUP = (people: number) =>
  people === 0
    ? "Remove this group"
    : `Remove this group (${people === 1 ? "its 1 person goes" : `its ${people} people go`} to “Not in a group”)`;

export const CHANGE_TIME = "Change its time";
export const SAVE_TIME = "Save the time";
export const CANCEL = "Cancel";
export const TIME_TOLD = "Publish has told people this time, so change it from Sessions.";

// ---------------------------------------------------------------------------
// Not in a group
// ---------------------------------------------------------------------------

export function notInAGroupTitle(count: number): string {
  return `Not in a group (${count})`;
}

export const REASON: Record<string, string> = {
  "no-week": "said nothing about when they are free",
  "fits-none": "can make none of these times",
  "no-room": "no room in a group they can make",
};
export const TAKEN_OUT = "taken out of their group";

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export const SESSIONS_OF = "Sessions of";
export const SESSION_LENGTH = "Session length";
export const NEW_DAY = "Day of the new group";
export const NEW_START = "Start of the new group";
export const SUGGEST = "Suggest groups";
export const SUGGEST_WITH_CLAUDE = "Suggest with Claude";
export const SUGGESTING = "Working it out…";
export const CLAUDE_TAKES_A_MINUTE = "Claude takes a minute or two.";

/** The switch that lets a suggestion seat afresh everybody placed and not told. */
export function startAgainWords(count: number): string {
  return `Start again: rearrange everyone not yet told (the ${plural(count, "person", "people")} placed and not told yet may move; nobody told, and no facilitator, ever does)`;
}

export const SUGGEST_LINE =
  "A suggestion keeps everybody where they are, and each facilitator in the group they facilitate, and seats the people not in a group: the people who offered to facilitate first, at times they can make. It is a preview over the rings: nothing is saved until you press Apply.";

export const PREVIEW_LINE =
  "A preview over the run’s groups. Highlighted: who moves, new groups, new times and new facilitators. Moving somebody here changes the preview only; nothing is saved until you press Apply.";

export const PREVIEW_BEFORE_DECISIONS =
  "A preview, from the decisions as they stand. Places can still change before decision day, and nobody is on the run yet, so there is nothing to apply.";

export const CLOSE_PREVIEW = "Close the preview";
export const OPTIONS = "Options";
export const CLAUDES_PICK = "Claude’s pick";
export const FOR = "For";
export const AGAINST = "Against";
export const DIDNT_FIT = (n: number) => `Claude suggestions that didn’t fit (${n})`;
export const OPTION = (key: string) => `Option ${key}`;
export const UNDO = (key: string) => `Undo my changes to option ${key}`;
export const NOTHING_TO_ARRANGE = "Nobody to arrange yet: nobody holds a place on this programme.";
export const NO_TIME_FOUND =
  "No group time could be worked out: the people here who marked a real week have no time in common, or everybody marked under 4 hours. Add a group below, then suggest again.";

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export function applyLabel(count: number): string {
  return `Apply ${plural(count, "change", "changes")}`;
}
export const APPLYING = "Applying…";
export const NOTHING_TO_APPLY = "This preview changes nothing: everybody in it is where they are now.";
export const APPLY_LINE = "Only these are sent, in this order. Nobody is emailed: Publish tells people their group.";
export const CHANGES_TITLE = "What Apply would change";

export const CHANGE = {
  addGroup: (name: string, session: SessionSlot, room: number) => `Add ${name}: ${sessionWords(session)}, room for ${room}.`,
  time: (name: string, session: SessionSlot, was: string | null) =>
    `Give ${name} a new time: ${whenWords(session)}${was ? ` (it was ${was})` : " (it had none)"}.`,
  move: (name: string, from: string, to: string) => `Move ${name} from ${from} to ${to}.`,
  put: (name: string, to: string) => `Put ${name} in ${to}.`,
  takeOut: (name: string, from: string) => `Take ${name} out of ${from}.`,
  facilitate: (names: readonly string[], group: string) =>
    `${listInWords(names)} ${names.length === 1 ? "facilitates" : "facilitate"} ${group}.`,
  ask: (name: string, group: string) =>
    `${name} didn’t offer to facilitate ${group}: nothing is sent for them. Ask them from Groups, Facilitators.`,
};

export const RESULT = {
  groupMade: (name: string) => `${name} added.`,
  groupFailed: (name: string, why: string) => `${name} wasn’t added: ${why}`,
  timeSaved: (name: string, session: SessionSlot) => `${name} meets ${whenWords(session)} now.`,
  timeFailed: (name: string, why: string) => `${name}’s time wasn’t changed: ${why}`,
  placed: (name: string, group: string | null) => (group ? `${name} is in ${group}.` : `${name} is out of groups.`),
  placesFailed: (why: string) => `Nobody was moved: ${why}`,
  facilitating: (names: readonly string[], group: string) =>
    `${listInWords(names)} ${names.length === 1 ? "facilitates" : "facilitate"} ${group}.`,
  facilitatingFailed: (group: string, why: string) => `${group}’s facilitators weren’t changed: ${why}`,
  stopped: "Stopped there, and read the groups again. What is still to do is in the preview: press Apply again to send the rest.",
  done: "Done. Nobody has been emailed: Publish tells people their group.",
};

// ---------------------------------------------------------------------------
// Asking Claude
// ---------------------------------------------------------------------------

export const ASK_TITLE = "Ask Claude about these groups";
export const ASK_LINE_LIVE =
  "About the groups as they are on your screen. Claude also sees how many people on each programme can meet at each time, so you can ask about joint sessions. Nothing is saved; moves it suggests open as a preview.";
export const ASK_LINE_PREVIEW = (key: string) =>
  `About option ${key} as it is on your screen, your changes included. Claude also sees how many people on each programme can meet at each time, so you can ask about joint sessions. Nothing is saved.`;
export const ASK_PLACEHOLDER =
  "For example: the governance and alignment streams should meet together for the first two sessions. Which times work for both?";
export const ASK_BUTTON = "Ask Claude";
export const ASK_ARIA = "Your question for Claude";
/** "Amara Okafor to Group B: why". */
export const MOVE_TO = (name: string, group: string, why: string) => `${name} to ${group}${why ? `: ${why}` : ""}`;
export const ASK_THINKING = "Claude is thinking…";
export const ASK_TAKES = "This can take a minute.";
export const ASK_YOU = "You";
export const ASK_ABOUT = (key: string) => ` (about option ${key})`;
export const ASK_ABOUT_LIVE = " (about the groups as they were)";
export const PREVIEW_MOVES = (n: number) => (n === 1 ? "Preview this move" : `Preview these ${n} moves`);
export const PREVIEWED = "In the preview";
export const LEFT_OUT = (items: readonly string[]) => `Left out because they don’t fit: ${items.join("; ")}.`;
export const CLAUDES_MOVES = "Claude’s moves";
export const SOMEBODY = "Somebody";
export const A_GROUP = "a group";

// ---------------------------------------------------------------------------
// The lead, and the Times view's link
// ---------------------------------------------------------------------------

export const ADMINS_ONLY_TITLE = "Circles is for admins";
export const ADMINS_ONLY =
  "Circles shows each person’s marked week and what Claude made of their application, which only admins see. People in groups has everybody, and every move.";
export const GO_TO_PEOPLE_IN_GROUPS = "Go to People in groups";

export const TIMES_LINK_TITLE = "Arrange groups";
export const TIMES_LINK =
  "Circles draws each group as a ring with its people, each person’s week against the groups’ times, and suggestions with or without Claude over the groups as they are.";
export const TIMES_LINK_ACTION = "Open Circles";

/** No run to draw. */
export function noRunWords(programme: string): string {
  return `${programme} doesn’t name a course run, or the one it names is no longer on the site. Name one on the Settings tab, under Course run.`;
}
