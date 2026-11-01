import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";

/**
 * THE WORDS OF A SESSION REPORT: the facilitator's page that writes one, the
 * route's refusals, the lead's page that reads them and the row on the
 * Surveys tab that leads there.
 *
 * Every name, week, day and time is a slot the caller fills from a record.
 * Times go through the house clock (`londonClockLabel`), never a stored wall
 * clock. No pronoun is guessed: a person is named. No sentence carries a dash
 * of either kind. Pure, with one import of the house date words, so the
 * server pages, the form in the browser and the tests read the same
 * sentences.
 */

export const REPORT_WORDS = {
  /** The phone bar's title. */
  barTitle: "Session report",
  /** Under a finished register, the way on to the report on its session. */
  next: "Next: two minutes on how it went.",
  /** Set in capitals by the page's style. */
  eyebrow: "After the register · 2 minutes",
  how: "How did the session go?",
  howLow: "Badly",
  howHigh: "Really well",
  wentWell: "What went well?",
  didnt: "What didn’t?",
  unclear: "What seemed unclear to the group?",
  somethingElse: "Something else",
  engaged: "Who engaged well?",
  notRead: "Did anyone seem not to have done the readings?",
  needsHand: "Anyone who might need a hand?",
  optional: "Optional",
  send: "Send report",
  sending: "Sending…",
  sent: "Report sent.",
  failed: "Your report wasn’t sent. Check your connection and try again.",
  /** Under the people questions, before anybody is down as here. */
  nobodyHere: "Nobody is down as here on this session’s register yet.",
  /** Under "Anyone who might need a hand?" with nobody on the register. */
  nobodyInGroup: "Nobody in the group is on the register yet.",
  /** Before the group's first session has started. */
  nothingYet: "Reports open when the group’s first session starts.",
  /** The closed page's heading over the report its writer sent. */
  whatYouSent: "What you sent",
  /** The closed page with no report from its writer. */
  noneSent: "You didn’t send a report on this session.",
} as const;

/** "Week 3", or "Week 3, session 2" for a week's second meeting. */
export function sessionName(weekNumber: number, occurrence = 1): string {
  return occurrence > 1 ? `Week ${weekNumber}, session ${occurrence}` : `Week ${weekNumber}`;
}

/** The page's heading: "How did week 3 go?". */
export function reportTitle(weekNumber: number, occurrence = 1): string {
  return `How did ${lowerFirst(sessionName(weekNumber, occurrence))} go?`;
}

/**
 * The line under the heading: "Group C, Wed 18 Nov. Claudia and admins read
 * this. Nobody in the group does on the site, though anyone can ask for
 * what’s written about them." Admins alone when the run has no lead.
 */
export function reportIntro(groupName: string, day: string, leadFirstName: string): string {
  const where = [groupName.trim() || "Your group", day].filter(Boolean).join(", ");
  const readers = leadFirstName.trim() ? `${leadFirstName.trim()} and admins read this.` : "Admins read this.";
  return `${where}. ${readers} Nobody in the group does on the site, though anyone can ask for what’s written about them.`;
}

/** "What made Aisha stand out?" */
export function standOutLabel(firstName: string): string {
  return `What made ${firstName.trim() || "them"} stand out?`;
}

/** "A word about Leo" */
export function aWordAboutLabel(firstName: string): string {
  return `A word about ${firstName.trim() || "them"}`;
}

/** "Anything for Claudia or the admins?", or "Anything for the admins?" when the run has no lead. */
export function forLeadLabel(leadFirstName: string): string {
  return leadFirstName.trim() ? `Anything for ${leadFirstName.trim()} or the admins?` : "Anything for the admins?";
}

/** "Wed 18 Nov at 6pm". */
function at(instant: Date): string {
  return `${londonDayLabel(instant)} at ${londonClockLabel(instant)}`;
}

/** "Sent Wed 18 Nov at 8:14pm." */
export function sentLine(sentAt: Date): string {
  return `Sent ${at(sentAt)}.`;
}

/**
 * How long the report can still be changed: until the group's next session
 * starts ("You can change it until week 4 starts, Tue 24 Nov at 6pm."), or,
 * after the group's last session, until the day a week on.
 */
export function changeUntilLine(closesAt: Date, nextWeekNumber: number | null): string {
  return nextWeekNumber !== null
    ? `You can change it until week ${nextWeekNumber} starts, ${at(closesAt)}.`
    : `You can change it until ${at(closesAt)}.`;
}

/** "Week 4’s report opens when the session starts, Tue 24 Nov at 6pm." */
export function opensLine(weekNumber: number, occurrence: number, opensAt: Date): string {
  return `${sessionName(weekNumber, occurrence)}’s report opens when the session starts, ${at(opensAt)}.`;
}

/** "Week 3’s report closed when week 4 started, Tue 24 Nov at 6pm." */
export function closedLine(weekNumber: number, occurrence: number, closesAt: Date, nextWeekNumber: number | null): string {
  const name = sessionName(weekNumber, occurrence);
  return nextWeekNumber !== null
    ? `${name}’s report closed when week ${nextWeekNumber} started, ${at(closesAt)}.`
    : `${name}’s report closed ${at(closesAt)}, a week after the session.`;
}

/** A session that was called off, or the register says did not happen: no report. */
export function noReportLine(weekNumber: number, occurrence: number): string {
  return `${sessionName(weekNumber, occurrence)} didn’t happen, so it has no report.`;
}

// ---------------------------------------------------------------------------
// The route's refusals: sentences a person can act on
// ---------------------------------------------------------------------------

export const REPORT_REFUSAL = {
  body: "That report couldn’t be read. Reload the page and send it again.",
  session: "That report doesn’t name one of the group’s sessions.",
  how: "Pick how the session went, from 1 to 5, before you send it.",
  /** An admin who facilitates no live group here. */
  notYours: "Session reports are written by the group’s facilitators, each their own.",
  pickedCame: "Somebody you picked isn’t down as here on the register any more. Reload the page to see who is.",
  pickedGroup: "Somebody you picked isn’t in the group any more. Reload the page to see who is.",
  parts: "The week’s parts have changed since the page opened. Reload the page and tick them again.",
} as const;

/** "What went well is too long: keep it to 2,000 characters." */
export function tooLongWords(what: string, limit: number): string {
  return `${what} is too long: keep it to ${limit.toLocaleString("en-GB")} characters.`;
}

/** What each free-text answer is called in a refusal. */
export const ANSWER_NAMES = {
  wentWell: "What went well",
  didnt: "What didn’t go well",
  forLead: "Your note for the lead and admins",
  aboutOne: "What you wrote about somebody you picked",
} as const;

/** "Week 4’s report opens when the session starts." */
export function notOpenRefusal(weekNumber: number, occurrence: number): string {
  return `${sessionName(weekNumber, occurrence)}’s report opens when the session starts.`;
}

/** "Week 3’s report has closed: it could be changed until the group’s next session started." */
export function closedRefusal(weekNumber: number, occurrence: number, nextWeekNumber: number | null): string {
  const name = sessionName(weekNumber, occurrence);
  return nextWeekNumber !== null
    ? `${name}’s report has closed: it could be changed until week ${nextWeekNumber} started.`
    : `${name}’s report has closed: it could be changed for a week after the session.`;
}

// ---------------------------------------------------------------------------
// The lead's page, and the row on the Surveys tab
// ---------------------------------------------------------------------------

export const RUN_REPORTS_WORDS = {
  title: "Session reports",
  back: "Surveys",
  line:
    "What each group’s facilitators reported after each session, with names. Only the programme’s lead and admins read these: " +
    "nobody in a group does on the site, though anyone can ask for what’s written about them.",
  none: "No facilitator has sent a report yet.",
  /** The writer of a report whose account was deleted. */
  writerGone: "A former facilitator",
  how: "How it went",
  wentWell: "What went well",
  didnt: "What didn’t",
  unclear: "What seemed unclear",
  engaged: "Engaged well",
  notRead: "Seemed not to have done the readings",
  needsHand: "Might need a hand",
  forLead: "For the lead and admins",
  /** A part the report ticked that the week no longer names. */
  partGone: "A part since taken out of the week",
  refusalTitle: "Only the programme’s lead and admins can read session reports",
  refusalBody: "Session reports name the people in each group, so only the programme’s lead or an admin can open them.",
  refusalAction: "Go to applications",
  /** The Surveys tab's row. */
  tabTitle: "Session reports",
  tabAction: "Read them",
} as const;

/** "4 of 5". */
export function howWords(how: number): string {
  return `${how} of 5`;
}

/** "Sent Wed 18 Nov at 8:14pm", or "Sent Wed 18 Nov at 8:14pm, changed Thu 19 Nov at 9am". */
export function sentWords(sentAt: Date | null, updatedAt: Date | null): string {
  if (!sentAt) return "";
  const first = `Sent ${at(sentAt)}`;
  return updatedAt && updatedAt.getTime() - sentAt.getTime() >= 60_000 ? `${first}, changed ${at(updatedAt)}` : first;
}

/** The Surveys tab's line under "Session reports". */
export function tabLineWords(count: number): string {
  const how = count === 0 ? "None yet: each group’s facilitators can send one after each session." : `${count === 1 ? "1 report" : `${count} reports`} from the groups’ facilitators, with names.`;
  return `${how} Only you and admins read them.`;
}

function lowerFirst(textValue: string): string {
  return textValue ? `${textValue.charAt(0).toLowerCase()}${textValue.slice(1)}` : textValue;
}
