/**
 * THE WORDS OF A GROUP'S PAGE: the page under a programme's Groups tab where
 * admins and the programme's lead run one group, and the facilitator's cut of
 * it on their own group page. Every button, label, empty state and line, in
 * one place, so the page in the browser and the tests say the same thing.
 *
 * The words the design gives are copied exactly, with their apostrophes; the
 * ones it does not give are written in the same voice. No imports beyond the
 * house's own pure words, so a client component and a server page share
 * this file.
 *
 * Every time of day is printed through the house clock (`clockWords`,
 * `hoursWords`, `londonClockLabel`), never as the stored "18:00".
 */

import { lengthWords } from "../sessionLength";
import { clockWords, dayWords, hoursWords, namesWords, peopleWords, slotRangeWords } from "../sessionChange/words";

// ---------------------------------------------------------------------------
// Where the page is
// ---------------------------------------------------------------------------

/** The group's page, under the programme's Groups tab. */
export function groupPagePath(roundId: string, programmeId: string, groupId: string): string {
  return `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/groups/${encodeURIComponent(groupId)}`;
}

/** The way back, beside the programme's name. */
export const GROUPS = "Groups";

/** Where a told group's time used to be a control: "Change it on Group C’s page". */
export function changeOnGroupPageWords(groupName: string): string {
  return `Change it on ${groupName}’s page`;
}

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

export const TAKE_THE_REGISTER = "Take the register";

/** "Write to Group C". */
export function writeToWords(groupName: string): string {
  return `Write to ${groupName}`;
}

/** "Facilitators:" or "Facilitator:" before the names; "Lead and facilitator:" is not ours to know. */
export function facilitatorsLabel(count: number): string {
  return count === 1 ? "Facilitator:" : "Facilitators:";
}

/** The header's count of the group's people: fellows only, never its facilitators. */
export function groupPeopleWords(count: number): string {
  return peopleWords(count);
}

/** Where the term is, as the chip beside the group's name says it. */
export type TermChip =
  | { kind: "today"; weekNumber: number }
  | { kind: "tomorrow"; weekNumber: number }
  | { kind: "on"; weekNumber: number; dateKey: string }
  | { kind: "finished" }
  | { kind: "new" };

/** "Week 2 is tomorrow", "Week 2 is today", "Week 2 on Sat 14 Nov", "Finished", "New". */
export function termChipWords(chip: TermChip): string {
  switch (chip.kind) {
    case "today":
      return `Week ${chip.weekNumber} is today`;
    case "tomorrow":
      return `Week ${chip.weekNumber} is tomorrow`;
    case "on":
      return `Week ${chip.weekNumber} on ${dayWords(chip.dateKey)}`;
    case "finished":
      return "Finished";
    case "new":
      return "New";
  }
}

// ---------------------------------------------------------------------------
// How the group meets
// ---------------------------------------------------------------------------

/** "How Group C meets". */
export function howMeetsTitle(groupName: string): string {
  return `How ${groupName} meets`;
}

export const DAY_AND_TIME = "Day and time";
export const LENGTH = "Length";
export const ROOM = "Room";
export const MEETING_LINK = "Meeting link";
export const FACILITATORS = "Facilitators";

export const CHANGE = "Change";
export const SET_THE_LINK = "Set the link";
export const SET_THE_TIME = "Set the time";
export const SET_THE_ROOM = "Set the room";
export const ADD_A_FACILITATOR = "Add a facilitator";

export const NOT_SET_YET = "Not set yet";
export const NONE_SET = "None set";
export const NOBODY_YET = "Nobody yet";
/** The group's standing link, when it has one: never the link itself. */
export const LINK_SET = "Set for every week";

/** "Wednesdays, 3pm to 5pm", the group's day and time, with a comma after the day. */
export function dayAndTimeWords(weekday: number, hhmm: string, minutes: number): string {
  const said = slotRangeWords(weekday, hhmm, minutes);
  const [day, ...rest] = said.split(" ");
  return rest.length > 0 ? `${day}, ${rest.join(" ")}` : said;
}

/** "2 hours", or "" with no length. */
export function lengthLine(minutes: number): string {
  return Number.isInteger(minutes) && minutes > 0 ? lengthWords(minutes) : "";
}

/** "Portland A21, University Park", "Portland A21", "Room to be confirmed, University Park". */
export function roomLine(room: string, campusLabel: string): string {
  const where = room.trim() || ROOM_TO_BE_CONFIRMED;
  return campusLabel ? `${where}, ${campusLabel}` : where;
}

export const ROOM_TO_BE_CONFIRMED = "Room to be confirmed";

/** Under how the group meets, on the page admins and the lead use. The design's words. */
export const WHO_CHANGES_WHAT =
  "Leads and admins change the regular time, room and facilitators. Facilitators change one week and set the link.";

/** Under how the group meets, on the facilitator's page: "Claudia or an admin changes the regular time or room." */
export function facilitatorWhoLine(leadFirstName: string | null): string {
  return leadFirstName
    ? `${leadFirstName} or an admin changes the regular time or room.`
    : "An admin changes the regular time or room.";
}

/** The facilitator's own words above their choices: one week and the link. */
export function facilitatorCanLine(leadFirstName: string | null): string {
  return `You can change one week and set the link. ${leadFirstName ?? "An admin"}${leadFirstName ? " or an admin" : ""} changes the regular time.`;
}

export const CHANGE_ONE_WEEK = "Change one week";

// ---------------------------------------------------------------------------
// The tabs and the weeks
// ---------------------------------------------------------------------------

export const WEEK_BY_WEEK = "Week by week";
export const HISTORY = "History";

/** What a week is, as its pill and its card say it. */
export type WeekState = "met" | "didnt-happen" | "no-register" | "today" | "tomorrow" | "cancelled" | "moved" | "online" | "upcoming";

export const WEEK_STATE_WORDS: Record<WeekState, string> = {
  met: "met",
  "didnt-happen": "didn’t happen",
  "no-register": "no register",
  today: "today",
  tomorrow: "tomorrow",
  cancelled: "cancelled",
  moved: "moved",
  online: "online",
  upcoming: "",
};

/** "Wed 4 Nov · met", "Wed 18 Nov": the line under "Week 1" on its pill. */
export function weekPillLine(dateKey: string, state: WeekState): string {
  const said = WEEK_STATE_WORDS[state];
  const day = dayWords(dateKey);
  return said ? `${day} · ${said}` : day;
}

/** "Week 2". */
export function weekWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** "Week 2 · How fast", above a week's card; "Week 2 · moved for this week" when it is. */
export function weekEyebrow(weekNumber: number, title: string, change: "online" | "moved" | "cancelled" | "pushed" | null): string {
  const what =
    change === "moved"
      ? "moved for this week"
      : change === "online"
        ? "online this week"
        : change === "cancelled"
          ? "cancelled"
          : change === "pushed"
            ? "moved back a week"
            : title.trim();
  return what ? `Week ${weekNumber} · ${what}` : `Week ${weekNumber}`;
}

/** "Wed 11 Nov, 3pm to 5pm". */
export function weekWhenWords(dateKey: string, hhmm: string, minutes: number): string {
  return [dayWords(dateKey), hoursWords(hhmm, minutes)].filter(Boolean).join(", ");
}

/** "Portland A21, University Park · with Rahul", "Online · with Rahul", "Room to be confirmed". */
export function weekWhereWords(where: { room: string; campusLabel: string; online: boolean }, facilitatorFirstNames: readonly string[]): string {
  const place = where.online ? "Online" : roomLine(where.room, where.campusLabel);
  const withWho = facilitatorFirstNames.length > 0 ? `with ${namesWords(facilitatorFirstNames)}` : "";
  return [place, withWho].filter(Boolean).join(" · ");
}

/** "Thu 12 Nov, 3pm to 5pm. Usually Wednesdays, 3pm, Portland A21." under a week moved on its own. */
export function usuallyWords(weekday: number, hhmm: string, room: string): string {
  const day = slotRangeWords(weekday, hhmm, 0);
  if (!day) return "";
  const [days, ...clock] = day.split(" ");
  const said = clock.length > 0 ? `${days}, ${clock.join(" ")}` : days;
  return room.trim() ? `Usually ${said}, ${room.trim()}.` : `Usually ${said}.`;
}

export const CHANGE_THIS_WEEK = "Change this week";
export const PUT_IT_BACK = "Put it back as usual";
export const PUT_IT_RIGHT = "Put it right";

/** "Week 2’s session was Mon 9 Nov, 1pm, and nobody took its register." */
export function noRegisterLine(weekNumber: number, dateKey: string, hhmm: string): string {
  return `Week ${weekNumber}’s session was ${dayWords(dateKey)}, ${clockWords(hhmm)}, and nobody took its register.`;
}

/** A week whose register was taken: its time is what the register says. */
export const MET_LINE = "This session met and its register has been taken, so its time stays as it is.";

/** A cancelled week. */
export const CANCELLED_LINE = "There’s no session this week. The week’s work is still on the programme page.";

// The chips on a week's card.
export const NO_LINK_YET = "No meeting link yet";
export const LINK_FOR_WEEK = "Meeting link set";

/** "1 joining online: Sofia", "Nobody joining online". */
export function joiningOnlineChip(names: readonly string[]): string {
  return names.length === 0 ? "Nobody joining online" : `${names.length} joining online: ${namesWords(names)}`;
}

/** "1 can’t make it: Grace", "Nobody has said they can’t make it". */
export function cantMakeItChip(names: readonly string[]): string {
  return names.length === 0 ? "Nobody has said they can’t make it" : `${names.length} can’t make it: ${namesWords(names)}`;
}

// The group's people for one week.
export type WeekSaid = "coming" | "online" | "cant";

export const WEEK_SAID_WORDS: Record<WeekSaid, string> = {
  coming: "Coming",
  online: "Joining online",
  cant: "Can’t make it",
};

/** "Group C’s people for week 2". */
export function weekPeopleTitle(groupName: string, weekNumber: number): string {
  return `${groupName}’s people for week ${weekNumber}`;
}

/** While a week chosen on the page is read: its work is on its way. */
export function weekOnItsWayWords(weekNumber: number): string {
  return `Reading week ${weekNumber}’s work…`;
}

/** Remind's panel, as the page's dialog names it. */
export const REMIND = "Remind";

export const PERSON = "Person";
export const THIS_SESSION = "This session";

/** Under the list: who is left out of the count, and why. */
export function facilitatorsApartLine(names: readonly string[]): string {
  if (names.length === 0) return "";
  return `${namesWords(names)} ${names.length === 1 ? "holds a place too, and is counted with the facilitators" : "hold places too, and are counted with the facilitators"}.`;
}

/** No weeks to show: the run has no start date or the group no time. */
export const NO_WEEKS_YET = "There are no weeks to show yet: the programme’s run has no start date, or the group has no time.";

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

export const NOBODY_IN_GROUP_TITLE = "Nobody is in this group yet";
export const NOBODY_IN_GROUP_LINE = "Place people on People in groups. They show here, week by week, once someone is in the group.";
export const OPEN_PEOPLE_IN_GROUPS = "Open People in groups";

export const NO_HISTORY_LINE =
  "Nothing has changed yet. Each change to the group’s time, room, link or people is kept here from the day it’s made.";

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export const WHO_CHANGED_WHAT = "Who changed what";

export type HistoryFilter = "everything" | "time-and-room" | "people" | "link" | "registers";

export const HISTORY_FILTERS: readonly { value: HistoryFilter; label: string }[] = [
  { value: "everything", label: "Everything" },
  { value: "time-and-room", label: "Time and room" },
  { value: "people", label: "People" },
  { value: "link", label: "Link" },
  { value: "registers", label: "Registers" },
];

/** A filter that leaves nothing: "Nothing under Link yet." */
export function nothingUnderWords(label: string): string {
  return `Nothing under ${label} yet.`;
}

/** When the list is the newest part of a longer history. */
export const HISTORY_MORE = "These are the newest changes. Older ones are kept but not shown here.";

// ---------------------------------------------------------------------------
// The change panel
// ---------------------------------------------------------------------------

/** "Change Group C’s time or room", the panel's title on the page admins and the lead use. */
export function changePanelTitle(groupName: string): string {
  return `Change ${groupName}’s time or room`;
}

/** "Change week 4", the panel's title on the facilitator's page. */
export function changeWeekTitle(weekNumber: number): string {
  return `Change week ${weekNumber}`;
}

/** "Put week 2 right", the panel's title for a week that passed with no register. */
export function putRightTitle(weekNumber: number): string {
  return `Put week ${weekNumber} right`;
}

export const CLOSE = "Close";
export const CANCEL = "Cancel";

export const WHICH_SESSIONS = "Which sessions?";
export const JUST_ONE_WEEK = "Just one week";
export const JUST_ONE_WEEK_HINT = "Move it, hold it online or cancel it. Other weeks stay as they are.";
export const FROM_A_WEEK_ONWARDS = "From a week onwards";
export const FROM_A_WEEK_ONWARDS_HINT = "A new regular day, time, length or room. Earlier weeks keep the dates they really met.";

export const WHICH_WEEK = "Which week?";
export const WHICH_WEEK_HINT = "Every week is here, past ones too, so a session that didn’t take place can be put right.";
export const FROM_WHICH_WEEK = "From which week?";

/** "What’s happening to week 2?". */
export function whatsHappeningTo(weekNumber: number): string {
  return `What’s happening to week ${weekNumber}?`;
}
export const WHAT_HAPPENED = "What happened?";

export const MOVE_IT = "Move it";
export const MOVE_IT_HINT = "A new day, time or room, for this week only.";
export const HOLD_IT_ONLINE = "Hold it online";
export const HOLD_IT_ONLINE_HINT = "Same time, online. The link goes on the programme page.";
/** Why Hold it online is not offered: the week has no link. */
export function noLinkForWeekHint(weekNumber: number): string {
  return `Week ${weekNumber} has no meeting link yet. Set the link first, then hold it online.`;
}
export const CANCEL_KEEP_PACE = "Cancel and keep pace";
/** "No session this week. Week 3 stays on Wed 18 Nov." */
export function keepPaceHintWords(next: { weekNumber: number; dateKey: string } | null): string {
  return next ? `No session this week. Week ${next.weekNumber} stays on ${dayWords(next.dateKey)}.` : "No session this week.";
}
export const CANCEL_PUSH_BACK = "Cancel and push the rest back a week";
export const PUSH_BACK_HINT = "This week’s session meets a week later, and each later week follows.";
/** Why Cancel and push the rest back is not offered: a later week's register was taken. */
export const PUSH_BACK_LATER_MET = "A later week has already met, so the rest can’t be pushed back.";
export const PUT_BACK_HINT = "Back to the group’s usual day, time and room for this week.";

export const MET_AT_ANOTHER_TIME = "It met at another time";
export const MET_AT_ANOTHER_TIME_HINT = "Say when. Nothing is emailed: it has already happened.";
export const HASNT_MET_YET = "It hasn’t met yet: move it";
export const HASNT_MET_YET_HINT = "Pick a new time and tell the group.";

export const DAY = "Day";
export const STARTS = "Starts";
export const STARTED = "Started";
export const ROOM_FIELD = "Room";
export const CAMPUS_FIELD = "Campus";
export const ROOM_TBC = "Room to be confirmed";
export const ROOM_TBC_HINT = "People see “Room to be confirmed” until you set it. Setting it later emails the group.";
export const KEEP_GROUP_CAMPUS = "The group’s own";

export const REASON_NEEDED = "Reason, shown to the group (needed)";
export const REASON_OPTIONAL = "Reason, shown to the group (optional)";
export const REASON_KEPT = "Reason, kept in the group’s history";

/** "Email Group J anyway", the tick under a correction, off unless ticked. */
export function emailAnywayWords(groupName: string): string {
  return `Email ${groupName} anyway`;
}
/** "Off. It would reach 5 people." / "On. It reaches 5 people." */
export function emailAnywayLine(on: boolean, emails: number): string {
  return on ? `On. It reaches ${peopleWords(emails)}.` : `Off. It would reach ${peopleWords(emails)}.`;
}

/** "Week 2’s time has passed and nobody took its register, so it moves too. ..." */
export function startsPassedWords(weekNumber: number, dateKey: string): string {
  return `Week ${weekNumber}’s time has passed and nobody took its register, so it moves too. If it did meet on ${dayWords(dateKey)}, take that register first and start from week ${weekNumber + 1}.`;
}

/** "Week 2 · Wed 11 Nov, 3pm · tomorrow", one option of Which week. */
export function weekOptionWords(weekNumber: number, dateKey: string, hhmm: string, state: WeekState): string {
  const when = [dayWords(dateKey), clockWords(hhmm)].filter(Boolean).join(", ");
  const said =
    state === "no-register"
      ? "passed, no register taken"
      : state === "met"
        ? "met"
        : state === "didnt-happen"
          ? "didn’t happen"
          : WEEK_STATE_WORDS[state];
  return [`Week ${weekNumber}`, when, said].filter(Boolean).join(" · ");
}

export const WHAT_WILL_HAPPEN = "What will happen";

/** The change went through and its update did not: "Tell the group and email 7 people". */
export function tellAgainWords(emails: number): string {
  return emails > 0 ? `Tell the group and email ${peopleWords(emails)}` : "Tell the group";
}
export const CHECKING = "Working out what would happen…";
export const SAVING = "Saving…";

/** "Notice to Group C’s 6 and Rahul", above the email. */
export function noticeToWords(input: { groupName: string; incubator: boolean; people: number; facilitatorNames: readonly string[] }): string {
  const owner = input.incubator ? "the incubator’s" : `${input.groupName}’s`;
  const parts = [...(input.people > 0 ? [`${owner} ${input.people}`] : []), ...input.facilitatorNames];
  return parts.length > 0 ? `Notice to ${namesWords(parts)}` : "Notice";
}

/** The answers the email asks for, under a new regular time. */
export const CAN_YOU_MAKE_IT = "Can you make this time? Yes · Most weeks, not all · No";

// ---------------------------------------------------------------------------
// Set the link
// ---------------------------------------------------------------------------

export const LINK_FIELD = "Meeting link";
export const LINK_HINT = "Shown on the programme page only, never in an email. Nobody is emailed.";
/** "Week 2 only". */
export function weekOnlyWords(weekNumber: number): string {
  return `Week ${weekNumber} only`;
}
export const EVERY_WEEK = "Every week";
export const SAVE_THE_LINK = "Save the link";
/** Said once a link is saved: nobody is emailed. */
export function linkSavedWords(weekNumber: number, everyWeek: boolean): string {
  return everyWeek
    ? `The meeting link is set for every week, from week ${weekNumber}. Nobody was emailed.`
    : `The meeting link is set for week ${weekNumber}. Nobody was emailed.`;
}
/** No session left that a link could be set on. */
export const NO_SESSION_FOR_LINK = "There’s no session still to come, so there’s nothing to set a link for.";

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

/** "Change Group C’s room". */
export function roomPanelTitle(groupName: string): string {
  return `Change ${groupName}’s room`;
}
export const ROOM_PANEL_HINT = "The room the group meets in every week. One week’s room is changed with Change this week.";

// ---------------------------------------------------------------------------
// A group that is not this programme's
// ---------------------------------------------------------------------------

export const GROUP_NOT_HERE_TITLE = "That group isn’t here";
export const GROUP_NOT_HERE_LINE =
  "It may have been archived, or it belongs to another programme. This programme’s groups are on its Groups tab.";
export const GO_TO_GROUPS = "Go to Groups";

// ---------------------------------------------------------------------------
// The run editor, once the groups have gone out
// ---------------------------------------------------------------------------

/** Under the run's start date once Publish has sent its groups out. */
export const START_DATE_READ_ONLY =
  "The groups have gone out, so the start date can’t change here: a new one would move every group’s weeks, the ones that met included.";

/** Above the run's week plan once Publish has sent its groups out: why it is read only, and what a group's break is instead. */
export const WEEK_PLAN_READ_ONLY =
  `The groups have gone out, so the week plan can’t change here: the groups’ weeks are dated from it. For a break in one group’s weeks, use ${CANCEL_PUSH_BACK} on that group’s page, which never moves a week that has met.`;

/**
 * A save from a page opened before the groups went out, that would have
 * changed the start date, the week plan or a group's day, time or length, and
 * that the database refused: in place of its "Missing or insufficient
 * permissions.".
 */
export const GONE_OUT_SINCE_OPENED =
  "The groups have gone out since this page opened, so this can’t change here. Reload the page.";

/**
 * The error a refused save shows. A permission refusal of a save that would
 * have changed one of those becomes GONE_OUT_SINCE_OPENED; every other error,
 * and any refusal of a save that changed none of them, is returned as it was.
 */
export function goneOutSinceOpened(err: unknown, changesTime: boolean): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  return changesTime && code === "permission-denied" ? new Error(GONE_OUT_SINCE_OPENED) : err;
}

/** Above a group card's day, time and length once its run's groups have gone out. */
export const SLOT_READ_ONLY_LABEL = "Day, time and length";

/** Under them: where they change now. */
export const SLOT_READ_ONLY_LINE =
  "The groups have gone out, so the time changes on the group’s page, from a week onwards, with the group told and earlier weeks kept where they met.";

/** No programme names the run, so there is no group page to link to. */
export const SLOT_NO_PAGE_LINE =
  "The groups have gone out, so the time can’t change here. Ask an admin to name this run on its programme, where each group has a page.";
