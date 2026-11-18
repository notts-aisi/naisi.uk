/**
 * THE WORDS OF THE WEEK'S ROOMS AND THE TERM'S ROOMS, in one place, for the
 * pages, the paste box and the download alike. No imports, so the browser and
 * the server say the same thing.
 *
 * These are staff pages: an admin and a programme's lead read them, and no
 * member ever sees a word from here. What a group is told when its room
 * changes is the one-week change's own notice (`oneWeekNoticeWords` in
 * `../sessionChange/words.ts`), never anything here.
 */

/** "1 room", "2 rooms": a count and its noun. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// The week's rooms
// ---------------------------------------------------------------------------

export const WEEK_ROOMS_TITLE = "The week’s rooms";
export const WEEK_ROOMS_EYEBROW = "One week at a time, every programme";
export const WEEK_ROOMS_LEDE = "A room changed here is for that week. For every week, change it on the group’s page.";
export const ALL_PROGRAMMES = "All programmes";
export const PROGRAMMES_CRUMB = "Programmes";

/** "15 groups", above the table. */
export function groupsCountWords(n: number): string {
  return count(n, "group", "groups");
}

/** The week picker's label for one week: "w/c Mon 9 Nov". */
export function weekOfWords(mondayWords: string): string {
  return `w/c ${mondayWords}`;
}

export const THIS_WEEK = "this week";
export const NEXT_WEEK = "next week";
export const NO_SESSIONS_MARK = "no sessions";
export const PREVIOUS_WEEK = "Previous week";
export const NEXT_WEEK_LINK = "Next week";
export const WEEKS_NAV = "Weeks";
export const VIEWS_NAV = "Programmes";

/** The line of counts above the table. */
export function summaryWords(counts: {
  notBooked: number;
  linksSet: number;
  away: number;
  online: number;
  requests: number;
}): string[] {
  return [
    `${counts.notBooked} not booked`,
    count(counts.linksSet, "link set", "links set"),
    `${count(counts.away, "person", "people")} away`,
    `${counts.online} joining online`,
    count(counts.requests, "request waiting", "requests waiting"),
  ];
}

export const COLUMN = {
  group: "Group",
  when: "Day and time",
  campus: "Campus",
  room: "This week’s room",
  link: "Link",
  away: "Away",
  online: "Online",
  requests: "Requests",
} as const;

export const NOT_BOOKED = "Not booked";
export const NO_LINK = "No link";
export const LINK_EVERY_WEEK = "Set: every week";

/** "Set: week 3 only": a link for that week alone. */
export function linkWeekOnlyWords(weekNumber: number): string {
  return `Set: week ${weekNumber} only`;
}

/** The requests cell: "1 waiting", or "0". */
export function requestsCellWords(n: number): string {
  return n > 0 ? `${n} waiting` : "0";
}

/** The room field's name for a screen reader: "Room for AGI Strategy, Group A". */
export function roomFieldLabel(programmeName: string, groupName: string): string {
  return `Room for ${programmeName}, ${groupName}`;
}

/** Why a row's room is not changed here, in place of the field. */
export const ROW_STATE = {
  cancelled: "Called off",
  online: "Online this week",
  met: "Met",
  started: "Started",
} as const;

/** Beside a room a one-week change set. */
export const MOVED_THIS_WEEK = "Moved this week";

/** Under a changed field while the change route's preview is asked. */
export const CHECKING = "Checking…";

/** Under a changed field once the preview has answered: "Emails 5 people". */
export function rowEmailsWords(emails: number): string {
  return emails === 0 ? "Emails nobody" : `Emails ${count(emails, "person", "people")}`;
}

/** Above the button: the board's words. */
export const SAVE_NOTE = "Changing a room emails that group: it’s a notice.";

/** Under the reason: there is one for every room saved in one press. */
export const REASON_HINT = "One reason for every room saved here. It goes into each group’s email.";

/**
 * The button, counting what it saves and whom it emails: "Save 2 rooms and
 * email 2 groups (10 people)". With nobody to email, "Save 2 rooms".
 */
export function saveButtonWords(rooms: number, groups: number, people: number): string {
  const save = `Save ${count(rooms, "room", "rooms")}`;
  if (people === 0) return save;
  return `${save} and email ${count(groups, "group", "groups")} (${count(people, "person", "people")})`;
}

export const SAVING = "Saving…";
/** The button before anything has been changed. */
export const NOTHING_TO_SAVE = "Save rooms";
/** Beside the button while a changed field is still being checked. */
export const WAIT_FOR_CHECKS = "Checking each change first.";
/** Beside the button while the reason is empty. */
export const REASON_NEEDED = "Give a reason first. The groups see it.";

/** A row once its room is saved: what the update did comes after. */
export const ROOM_SAVED = "Room saved.";
/** A row whose room is saved with nobody to email. */
export const ROOM_SAVED_NOBODY_TOLD = "Room saved. Nobody was told.";

/** After a press: how many went through and how many were refused. */
export function savedSummaryWords(saved: number, refused: number): string {
  const done = `${count(saved, "room", "rooms")} saved`;
  return refused === 0 ? `${done}.` : `${done}, ${count(refused, "was refused", "were refused")}: each says why.`;
}

export const DOWNLOAD = "Download";
export const PASTE_OPEN = "Paste rooms from a spreadsheet";

export const NO_SESSIONS_TITLE = "No sessions this week";
export const NO_SESSIONS_LEDE = "Weeks with sessions show their groups here.";
export const NEXT_WEEK_WITH_SESSIONS = "Go to the next week with sessions";
export const LAST_WEEK_WITH_SESSIONS = "Go to the last week with sessions";

/** The phone's filter over the rows. */
export const SHOW_LABEL = "Show";
export const SHOW = {
  all: "All",
  notBooked: "Not booked",
  requests: "Requests",
} as const;

/** The way between the two pages. */
export const TO_TERM_ROOMS = "The term’s rooms";
export const TO_WEEK_ROOMS = "The week’s rooms";

// ---------------------------------------------------------------------------
// The paste box
// ---------------------------------------------------------------------------

export const PASTE_TITLE = "Paste rooms from a spreadsheet";
export const PASTE_CLOSE = "Close";
export const PASTE_LEDE =
  "Two columns, group then room, copied straight from a sheet. A programme’s name can be short: its first word or its initials.";
export const PASTE_LABEL = "Paste here";

/** "These rooms are for w/c Mon 16 Nov only." */
export function pasteWeekWords(weekWords: string): string {
  return `These rooms are for ${weekWords} only.`;
}

export const PASTE_COLUMN = { pasted: "Pasted", matched: "Matched to", room: "Room" } as const;

/** "AGI Strategy, Group A". */
export function matchedWords(programmeName: string, groupName: string): string {
  return `${programmeName}, ${groupName}`;
}

export const PASTE_STATE = {
  new: "New: was not booked",
  same: "No change",
  noRoom: "No room on this line.",
  roomLink: "A room can’t be a link.",
  roomLine: "A room is one line.",
  none: "No match. Choose the group.",
} as const;

/** A line that changes a room: "Was Portland A21". */
export function wasWords(room: string): string {
  return `Was ${room}`;
}

/** A room over the field's limit. */
export function roomTooLongWords(limit: number): string {
  return `Too long: a room is at most ${limit} characters.`;
}

/** "No match. Did you mean AGI Strategy, Group K?" */
export function didYouMeanWords(matched: string): string {
  return `No match. Did you mean ${matched}?`;
}

/** "Use Group K". */
export function takeSuggestionWords(groupName: string): string {
  return `Use ${groupName}`;
}

/** "Two groups match: AGI Strategy or Technical AI Safety?" when two; "3 groups match. Choose one." beyond. */
export function ambiguousWords(programmeNames: readonly string[]): string {
  if (programmeNames.length === 2 && programmeNames[0] !== programmeNames[1]) {
    return `Two groups match: ${programmeNames[0]} or ${programmeNames[1]}?`;
  }
  return `${programmeNames.length} groups match. Choose one.`;
}

export const CHOOSE = "Choose";
export const CHOOSE_PLACEHOLDER = "Choose a group";

/** The group is on an earlier line already. */
export function duplicateWords(lineNumber: number): string {
  return `This group is on line ${lineNumber} already.`;
}

/** A group whose room cannot be changed this week: "Not this week: met". */
export function notThisWeekWords(state: string): string {
  return `Not this week: ${state.toLowerCase()}.`;
}

/**
 * "6 lines: 4 are ready (2 new rooms, 2 unchanged) and 2 need you. Nothing is
 * saved until you press Save."
 */
export function pasteSummaryWords(parts: { lines: number; changes: number; unchanged: number; needYou: number }): string {
  const ready = parts.changes + parts.unchanged;
  const readyBits = [count(parts.changes, "new room", "new rooms"), `${parts.unchanged} unchanged`].join(", ");
  const head = `${count(parts.lines, "line", "lines")}: ${ready} ${ready === 1 ? "is" : "are"} ready (${readyBits})`;
  const tail = parts.needYou > 0 ? ` and ${parts.needYou} ${parts.needYou === 1 ? "needs" : "need"} you` : "";
  return `${head}${tail}. Nothing is saved until you press Save.`;
}

export const CANCEL = "Cancel";

// ---------------------------------------------------------------------------
// The term's rooms
// ---------------------------------------------------------------------------

export const TERM_ROOMS_TITLE = "The term’s rooms";
export const TERM_ROOMS_LEDE =
  "Each group’s room, week by week. Open a week to change a room there: nothing is changed on this page.";

/** A column: "Week 3". */
export function weekColumnWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** What a cell can say beside the room. */
export const CELL_MARK = {
  notUsual: "Not the usual room",
  moved: "Moved",
  cancelled: "Called off",
  online: "Online",
  met: "Met",
} as const;

/** A week the group has no session in. */
export const NO_SESSION = "No session";

/** A programme with no groups that meet. */
export const NO_GROUPS = "No groups meet on this programme yet.";

/** Before a cell's room, for a screen reader: "Group A, week 3, Tue 17 Nov:". */
export function cellLinkLabel(groupName: string, weekNumber: number, day: string): string {
  return `${groupName}, week ${weekNumber}, ${day}:`;
}

/** The download's file names. */
export function weekFileName(mondayKey: string): string {
  return `rooms-week-of-${mondayKey}.csv`;
}

export function termFileName(): string {
  return "rooms-term.csv";
}

/** The download's own column names, beyond the table's. */
export const CSV_COLUMN = { programme: "Programme", week: "Week" } as const;
