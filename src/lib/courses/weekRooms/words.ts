/**
 * THE WORDS OF THE WEEK'S ROOMS AND THE TERM'S ROOMS, in one place, for the
 * pages, the paste box and the download alike. No imports, so the browser and
 * the server say the same thing.
 *
 * These are staff pages: an admin and a programme's lead read them, and no
 * member ever sees a word from here. What a group is told when its room
 * changes is the room-only change's own notice (`roomNoticeWords` in
 * `../sessionChange/roomWords.ts`), never anything here.
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
/** A week with no room: what a row or a cell reads, and the control that takes a room off. */
export const TO_BE_CONFIRMED = "To be confirmed";
/** The control beside a room field that takes the room off. */
export function toBeConfirmedLabel(where: string): string {
  return `Room to be confirmed for ${where}`;
}

/** Where a week's room comes from, beside it. Nothing beside a week with none: it reads To be confirmed. */
export const ROOM_SOURCE = {
  week: "This week only",
  usual: "Usual room",
} as const;
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

/** Beside a room whose session a one-week move moved (a room set here never does). */
export const MOVED_THIS_WEEK = "Moved this week";

/** Under a changed field while the change route's preview is asked. */
export const CHECKING = "Checking…";

/** Under a changed field once the preview has answered: "Emails 5 people". */
export function rowEmailsWords(emails: number): string {
  return emails === 0 ? "Emails nobody" : `Emails ${count(emails, "person", "people")}`;
}

/** Beside the tick. */
export const SAVE_NOTE = "With Tell the group on, each group whose room changes is emailed: it’s a notice.";

/** The reason's label: it is optional for a room. */
export const REASON_LABEL = "Reason (optional)";
/** Under the reason: there is one for every room saved in one press. */
export const REASON_HINT = "One reason for every room saved here. With Tell the group on, it goes into each group’s email.";

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
/** Under a field whose room changes only in case or spacing. */
export const SPELLING_ONLY = "Only its spelling changes, so nobody is emailed.";
/** The button before anything has been changed. */
export const NOTHING_TO_SAVE = "Save rooms";
/** Beside the button while a changed field is still being checked. */
export const WAIT_FOR_CHECKS = "Checking each change first.";
/** A row once its room is saved: what the email did comes after. */
export const ROOM_SAVED = "Room saved.";
/** A row whose room is saved with nobody to email. */
export const ROOM_SAVED_NOBODY_TOLD = "Room saved. Nobody was told.";
/** A row whose room is saved and whose email did not go, or not to everybody. */
export function roomSavedNotToldWords(failed: number): string {
  return `${ROOM_SAVED} ${count(failed, "email", "emails")} didn’t go, so tell them with an update from Messages.`;
}
/** A row whose count changed since it was checked: nothing changed, and it is asked again. */
export const ASKED_AGAIN = "Nothing was saved for this group. Check its new count, then press Save again.";

/** Groups whose room was saved and who were not told, after a press, still on the page: they stay until the page is left. */
export function notToldSummaryWords(groups: readonly string[]): string {
  return `Saved but not told: ${groups.join(", ")}.`;
}

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
  "Two columns, group then room, copied straight from a sheet. A programme’s name can be short: its first word or its initials. An empty room, TBC or a dash means to be confirmed.";
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
  new: "New: was to be confirmed",
  same: "No change",
  roomLink: "A room can’t be a link.",
  roomLine: "A room is one line.",
  none: "No match. Choose the group.",
} as const;

/** A line that takes a room off: "To be confirmed. Was Portland A21". */
export function clearWords(was: string): string {
  return `To be confirmed. Was ${was}`;
}

/** A line with something in a column after its room. */
export const IGNORED_COLUMN = "A third column was ignored.";

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
 * "6 lines: 4 are ready (2 changes, 2 unchanged) and 2 need you. Nothing is
 * saved until you press Save."
 */
export function pasteSummaryWords(parts: { lines: number; changes: number; unchanged: number; needYou: number }): string {
  const ready = parts.changes + parts.unchanged;
  const readyBits = [count(parts.changes, "change", "changes"), `${parts.unchanged} unchanged`].join(", ");
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
  "Each group’s room, week by week. Fill in rooms for weeks still to come here, as far ahead as you like.";

/** Above the grid's button: saving here tells nobody. */
export const GRID_SAVE_NOTE =
  "Saving here emails nobody. To tell a group about a change, save it on that week’s page, where Tell the group is.";

/** The grid's button: "Save 34 rooms. Emails nobody." */
export function gridSaveWords(rooms: number): string {
  return rooms === 0 ? "Save rooms" : `Save ${count(rooms, "room", "rooms")}. Emails nobody.`;
}

/** After a grid save: how many went through and how many were refused. */
export function gridSavedWords(saved: number, refused: number): string {
  const done = `${count(saved, "room", "rooms")} saved. Nobody was emailed.`;
  return refused === 0 ? done : `${done} ${count(refused, "was refused", "were refused")}: each says why.`;
}

/** A cell's field, for a screen reader: "Room for Group A, week 3, Tue 17 Nov". */
export function cellFieldLabel(groupName: string, weekNumber: number, day: string): string {
  return `Room for ${groupName}, week ${weekNumber}, ${day}`;
}

/** The grid's paste box. */
export const GRID_PASTE_OPEN = "Paste a block from a spreadsheet";
export const GRID_PASTE_TITLE = "Paste a block of rooms";
export const GRID_PASTE_LEDE =
  "The first column names the group, then one column a week. A first line of weeks (Week 3, w3, 3, or a date in that week) says which week each column is; without one, the columns are the grid’s weeks from its first. An empty cell, TBC or a dash means to be confirmed.";

/** Which week each column was taken as, for one programme: "AGI Strategy: week 1, week 2, not a week". */
export function columnsTakenWords(programmeName: string, weeks: readonly (number | null)[], header: boolean): string {
  const said = weeks.map((week) => (week === null ? "not a week" : `week ${week}`)).join(", ");
  return `${programmeName}, columns ${header ? "read from the first line" : "taken in order"}: ${said}.`;
}

/** A cell that will not be saved: "Week 3 skipped: met." */
export function skippedWords(weekNumber: number | null, why: string): string {
  const reason = why.replace(/\.$/, "").replace(/^Not this week: /, "");
  return weekNumber === null ? "A column with no week, skipped." : `Week ${weekNumber} skipped: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
}

/** One cell of a pasted line: "Week 3: George Green B06. Was Portland A21". */
export function cellLineWords(weekNumber: number, words: string): string {
  return `Week ${weekNumber}: ${words}`;
}

/** A block's count line. */
export function blockSummaryWords(parts: { changes: number; skipped: number; needYou: number }): string {
  const bits = [count(parts.changes, "room to change", "rooms to change"), `${parts.skipped} skipped`];
  const tail = parts.needYou > 0 ? `, and ${count(parts.needYou, "line needs", "lines need")} you` : "";
  return `${bits.join(", ")}${tail}. Nothing is saved until you press Save.`;
}

/** A changed cell, before Save. */
export const CELL_CHANGED = "Changed";
/** The grid's link from a cell to its week. */
export const OPEN_WEEK = "Open week";

/** A column: "Week 3". */
export function weekColumnWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** What a cell can say beside the room. */
export const CELL_MARK = {
  moved: "Moved",
  cancelled: "Called off",
  online: "Online",
  met: "Met",
  started: "Started",
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
