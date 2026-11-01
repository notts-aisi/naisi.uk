import { londonDateKey } from "@/lib/courses/weekPlan";
import { clockWords, dateKeyWords, dayWords, minutesWords, questionsWords } from "../words";

/**
 * EVERY SENTENCE A CHECK-IN SAYS: the register's card, the member's page, its
 * box, its email, its card on Home, the admins' pages and the Check-ins view of
 * a programme's Surveys tab, in one place. Every
 * value comes from a record and arrives here as an argument; times print in
 * the house's clock ("3pm", "11pm", "12:30am"), read in London.
 *
 * "The check-in" is this survey, and only this survey: the words of checking
 * people in at an event's door ("the door list", "check people in") are never
 * used here.
 *
 * No imports but other words and the London calendar, so the server and the
 * register's card word a check-in alike.
 */

/** Whether two instants fall on the same London day. */
export function sameLondonDay(a: Date, b: Date): boolean {
  return londonDateKey(a) === londonDateKey(b);
}

/** "How was week 3?": the check-in's title, on its page and its card. */
export function checkInTitle(weekNumber: number): string {
  return `How was week ${weekNumber}?`;
}

/** "AGI Strategy: check-in, Group C, week 3": the admins' name for one check-in. */
export function checkInName(programmeName: string, groupName: string, weekNumber: number): string {
  return `${programmeName}: check-in, ${groupName}, week ${weekNumber}`;
}

/** "Wed 18 Nov, 3pm": when a session started. */
export function sessionWhenWords(startsAt: Date): string {
  return `${dayWords(startsAt)}, ${clockWords(startsAt)}`;
}

/**
 * The line under the title on the member's page: "Group C, today at 3pm." on
 * the session's own London day, and "Group C, Wed 18 Nov, 3pm." on any other,
 * so a late session's check-in answered after midnight never says "today".
 */
export function sessionLineWords(groupName: string, startsAt: Date | null, now: Date): string {
  if (!startsAt) return `${groupName}.`;
  return sameLondonDay(startsAt, now) ? `${groupName}, today at ${clockWords(startsAt)}.` : `${groupName}, ${sessionWhenWords(startsAt)}.`;
}

/** "11pm", or "12:30am on Thu 19 Nov" when it closes on another London day than `from`. */
export function closesClockWords(closesAt: Date, from: Date): string {
  return sameLondonDay(closesAt, from) ? clockWords(closesAt) : `${clockWords(closesAt)} on ${dayWords(closesAt)}`;
}

// ---------------------------------------------------------------------------
// The member's page
// ---------------------------------------------------------------------------

export const CHECK_IN_PAGE_WORDS = {
  /** The eyebrow's first part, and the page's own name in its bar. */
  eyebrow: "Check-in",
  send: "Send check-in",
} as const;

/** The eyebrow's second part: "2 minutes". */
export function checkInMinutesWords(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Under the Send button: "It closes at 11pm. Once sent, your answers can’t change." */
export function checkInClosingWords(closesAt: Date, now: Date): string {
  return `It closes at ${closesClockWords(closesAt, now)}. Once sent, your answers can’t change.`;
}

// ---------------------------------------------------------------------------
// The confidential box, at the top of the page
// ---------------------------------------------------------------------------

export type CheckInBoxFacts = {
  /** The programme lead's first name, or null when the programme has no lead who stands. */
  leadName: string | null;
  /** "AGI Strategy". */
  programmeName: string;
  /** "2028-12-09". */
  namesOffOn: string;
  programmeKind: "fellowship" | "incubator";
};

/**
 * The box at the top of a check-in, point by point: who sees who said what,
 * what the lead sees, what the group's facilitators see, and the day the
 * person's name comes off, the sentence every survey's box carries.
 */
export function checkInBoxPoints(facts: CheckInBoxFacts): string[] {
  const points = ["Only NAISI’s admins see who said what."];
  if (facts.leadName) points.push(`${facts.leadName}, who leads ${facts.programmeName}, sees totals and comments without names.`);
  points.push("Your facilitators see your group’s totals, never your answers.");
  const day = dateKeyWords(facts.namesOffOn);
  if (day) points.push(`Your name comes off on ${day}, two years after the ${facts.programmeKind} ends. The totals stay.`);
  return points;
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

/** The email's own words, in the shape every survey email takes. */
export type CheckInEmailFacts = {
  title: string;
  groupName: string;
  startsAt: Date | null;
  questions: number;
  minutes: number;
  programmeName: string;
  closesAt: Date;
  /** The opener's first name, or "" when their account has none. */
  signer: string;
};

/** The line every check-in email carries about who sees what. */
export const CHECK_IN_CONFIDENTIAL_LINE =
  "It’s confidential: only NAISI’s admins can see who said what. Your facilitators see your group’s totals, never your answers.";

export function checkInEmailWords(facts: CheckInEmailFacts): { subject: string; paragraphs: string[]; button: string; signOff: string[] } {
  const when = facts.startsAt ? `${facts.groupName}, ${sessionWhenWords(facts.startsAt)}.` : `${facts.groupName}.`;
  return {
    subject: `${facts.title} ${questionsWords(facts.questions)} for ${facts.programmeName}`,
    paragraphs: [
      `${when} Tell us how the session went while it’s fresh. It’s ${questionsWords(facts.questions)} and takes ${minutesWords(facts.minutes)}.`,
      CHECK_IN_CONFIDENTIAL_LINE,
      `It closes at ${clockWords(facts.closesAt)} on ${dayWords(facts.closesAt)}.`,
    ],
    button: "Answer the check-in",
    signOff: facts.signer ? [facts.signer, "For NAISI"] : ["NAISI"],
  };
}

// ---------------------------------------------------------------------------
// The card on Home and My programmes
// ---------------------------------------------------------------------------

export const CHECK_IN_CARD_WORDS = {
  eyebrow: "A check-in for you",
} as const;

/** "Closes 11pm" on the day, "Closes Thu 19 Nov, 12:30am" on another. */
export function checkInCardClosesWords(closesAt: Date, now: Date): string {
  return sameLondonDay(closesAt, now) ? `Closes ${clockWords(closesAt)}` : `Closes ${dayWords(closesAt)}, ${clockWords(closesAt)}`;
}

// ---------------------------------------------------------------------------
// The register's card (the group's facilitators and admins)
// ---------------------------------------------------------------------------

export const CHECK_IN_CARD = {
  title: "Last 10 minutes: the check-in",
  body: "Open it and everyone gets it on their phone. While they fill it in, go round the room: one highlight, and one thing that could go better.",
  takeRegisterFirst: "Take the register first: the check-in goes to the people marked here.",
  open: "Open",
  closed: "Closed",
  showCode: "Show the QR code",
  closeNow: "Close it now",
  keepOpen: "Keep it open",
  closing: "Closing…",
  opening: "Opening…",
  codeTitle: "Scan to answer the check-in",
  codeLine: "Everybody marked here can open it from this code, signed in on their phone.",
  codeDone: "Done",
  tooFew: "Too few answers to show.",
  notReached: "That didn’t reach the site. Check your connection, then try again.",
} as const;

/** The button that opens it: "Open it for the 6 here". */
export function openButtonWords(here: number): string {
  return `Open it for the ${here} here`;
}

/** What the press did: "It’s open. 6 people emailed." */
export function openedWords(emailed: number): string {
  return `It’s open. ${emailed === 1 ? "1 person" : `${emailed} people`} emailed.`;
}

/** While it is open: "4 of 6 have sent it". */
export function sentSoFarWords(answered: number, of: number): string {
  if (answered === 0) return of === 1 ? "The 1 here hasn’t sent it yet" : `None of the ${of} have sent it yet`;
  return `${answered} of ${of} ${answered === 1 ? "has" : "have"} sent it`;
}

/** Under the open card: "It closes by itself at 11pm. Then you see your group’s totals, never who said what." */
export function closesByItselfWords(closesAt: Date, now: Date): string {
  return `It closes by itself at ${closesClockWords(closesAt, now)}. Then you see your group’s totals, never who said what.`;
}

/** The question in front of "Close it now": "Close the check-in? 2 of 6 haven’t sent it." */
export function closeConfirmWords(answered: number, of: number): string {
  const left = of - answered;
  const again = "and it can’t be opened again.";
  if (left <= 0) return `Close the check-in? Everybody here has sent it, ${again}`;
  if (answered === 0) return of === 1 ? `Close the check-in? The 1 here hasn’t sent it, ${again}` : `Close the check-in? None of the ${of} have sent it, ${again}`;
  return `Close the check-in? ${left} of ${of} ${left === 1 ? "hasn’t" : "haven’t"} sent it, ${again}`;
}

/** The count on the button no longer matches the register: nothing was sent. */
export function hereChangedWords(now: number): string {
  return `Nothing was sent: the register now marks ${now} here. Check it and press again.`;
}

/** Over a closed check-in's totals: "Week 3’s check-in, Group C". */
export function totalsHeadingWords(weekNumber: number, groupName: string): string {
  return `Week ${weekNumber}’s check-in, ${groupName}`;
}

/** "4.2 of 5". */
export function outOfFive(mean: number): string {
  return `${(Math.round(mean * 10) / 10).toFixed(1)} of 5`;
}

/** One part named unclear, with how many named it: "Compute as a lever (3)". */
export type UnclearCount = { label: string; count: number };

/** A closed check-in's totals, as the facilitators read them: never a comment and never who. */
export type TotalsFacts = {
  answered: number;
  of: number;
  useful: number | null;
  confident: number | null;
  /** How many said most or all of the reading, or null when the week asked nothing about reading. */
  readMost: number | null;
  /** Each part (and "Something else") named unclear by somebody, most first. */
  unclear: UnclearCount[];
};

/**
 * The totals in one line: "Useful: 4.2 of 5 · 5 of 6
 * answered · 4 did most or all of the reading · Unclear: Compute as a lever
 * (3)". Confidence sits after usefulness.
 */
export function totalsLineParts(totals: TotalsFacts): string[] {
  const parts: string[] = [];
  if (totals.useful !== null) parts.push(`Useful: ${outOfFive(totals.useful)}`);
  if (totals.confident !== null) parts.push(`Confident: ${outOfFive(totals.confident)}`);
  parts.push(`${totals.answered} of ${totals.of} answered`);
  if (totals.readMost !== null) parts.push(`${totals.readMost} did most or all of the reading`);
  parts.push(
    totals.unclear.length === 0
      ? "Nothing unclear"
      : `Unclear: ${totals.unclear
          .slice(0, 3)
          .map((each) => `${each.label} (${each.count})`)
          .join(", ")}`,
  );
  return parts;
}

/** Below the floor: "2 of 6 answered. Too few answers to show." */
export function tooFewWords(answered: number, of: number): string {
  return `${answered} of ${of} answered. ${CHECK_IN_CARD.tooFew}`;
}

// ---------------------------------------------------------------------------
// The programme's Surveys tab: each week's check-ins, for its lead and admins
// ---------------------------------------------------------------------------

/**
 * The Check-ins view of a programme's Surveys tab. The lead and admins read
 * each week with every group's answers together, never a group's alone, and
 * only once every group's check-in that week has closed and the week's
 * check-ins are fixed, which the scheduler does at its next tick; an admin
 * also has a row for each group's check-in, leading to its own pages, and a
 * line on a check-in opened after its week was fixed.
 */
export const CHECK_INS_TAB_WORDS = {
  nothingYet: "No week has begun yet.",
  waiting: "Shows shortly after every group’s check-in this week has closed.",
  none: "No group opened a check-in this week.",
  useful: "Useful",
  confident: "Confident",
  reading: "Did most or all of the reading",
  unclear: "What was unclear",
  nothingUnclear: "Nobody named anything unclear.",
  inTheirWords: "In their words",
  noComments: "Nobody wrote anything here.",
  groups: "Each group’s check-in",
  groupsLine:
    "Only admins see these. Each check-in’s own pages open who said what, one person at a time, and every opening is recorded.",
  results: "Results",
  whoAnswered: "Who answered",
  open: "Open",
  closed: "Closed",
  /** On an admin's row for a check-in opened after its week's check-ins were fixed: the lead's week leaves it out. */
  openedAfterWeek: "Not counted in the week above: it opened after the week had already shown.",
} as const;

/** The line under the view's row: what a week shows and from how many answers. */
export function checkInsTabLine(totalsFrom: number, commentsFrom: number): string {
  return `Every group’s check-ins together, week by week, without names. A week shows shortly after every group’s check-in that week has closed: totals from ${totalsFrom} answers, comments from ${commentsFrom}.`;
}

/** Below the floor for totals: "2 of 6 answered. Totals show from 3, so nobody can be worked out." */
export function weekTooFewWords(answered: number, of: number, totalsFrom: number): string {
  return `${answered} of ${of} answered. Totals show from ${totalsFrom}, so nobody can be worked out.`;
}

/** Below the floor for comments: "Comments show from 5 answers, so nobody can be worked out." */
export function commentsFromWords(commentsFrom: number): string {
  return `Comments show from ${commentsFrom} answers, so nobody can be worked out.`;
}

/** "33 of 46 · 72%": how many said most or all of the reading, of everybody who answered it. */
export function readingShareWords(most: number, of: number): string {
  return `${most} of ${of} · ${of > 0 ? Math.round((most * 100) / of) : 0}%`;
}

/** An admin's row for one group's check-in: "Group C · Wed 18 Nov, 3pm". */
export function groupCheckInWords(groupName: string, startsAt: Date | null): string {
  return startsAt ? `${groupName} · ${sessionWhenWords(startsAt)}` : groupName;
}

/** What a link on an admin's row says to assistive technology: "Who answered: Group C, week 3". */
export function checkInLinkLabel(action: string, groupName: string, weekNumber: number): string {
  return `${action}: ${groupName}, week ${weekNumber}`;
}

// ---------------------------------------------------------------------------
// Refusals, word for word
// ---------------------------------------------------------------------------

export const CHECK_IN_REFUSAL = {
  body: "That request didn’t arrive in a shape this page understands. Reload the page and try again.",
  noSession: "That isn’t one of this group’s sessions.",
  undated: "This session has no date or time, so it has no check-in. Give the group its sessions first.",
  notHeld: "This session didn’t happen, so it has no check-in.",
  early: "The check-in opens when the session starts.",
  past: "This session’s check-in time has passed.",
  alreadyOpen: "The check-in for this session has been opened already.",
  nobody: CHECK_IN_CARD.takeRegisterFirst,
  tooMany: "More than 40 people are marked here, which is more than one check-in reaches. Ask an admin.",
  notOpen: "This check-in isn’t open, so there’s nothing to close.",
  noNamesOff:
    "The programme’s last session has no date yet, so the day names come off can’t be worked out. Give its groups their sessions first.",
  noProgramme: "This group’s run isn’t a programme’s yet, so it has no check-in. Ask an admin to name the run on the programme.",
  noAddress: "The site doesn’t know its own address, so no email could carry a link. Nothing was opened.",
  inFlight: "The check-in is opening. Wait a moment, then reload the page.",
} as const;

// ---------------------------------------------------------------------------
// The admins' pages
// ---------------------------------------------------------------------------

export const CHECK_IN_ADMIN_WORDS = {
  /** The Send tab's name for a check-in. */
  tab: "Opening",
  /** The list's heading over each programme's check-ins. */
  listHeading: "Check-ins",
  listLede: "One for each session a group’s facilitator opened it at. Each opens on its results, who answered and its questions.",
  opened: "Opened",
  emailed: "Emailed",
  joined: "Marked here later",
  closes: "Closes",
  closed: "Closed",
  namesOff: "Names come off",
  questions: "Questions",
  fixed: "A check-in’s questions are made from the group’s own copy of the week when it opens, and never change.",
} as const;

/** "Opened by Rahul on Wed 18 Nov, 4:52pm, for the 6 marked here." */
export function openedByWords(name: string, at: Date | null, count: number): string {
  const when = at ? ` on ${dayWords(at)}, ${clockWords(at)}` : "";
  return `Opened by ${name || "a facilitator"}${when}, for the ${count} marked here.`;
}

/** "2 more marked here after it opened, with no email." */
export function joinedLaterWords(n: number): string {
  return n === 1 ? "1 more marked here after it opened, with no email." : `${n} more marked here after it opened, with no email.`;
}

/** The list's line for one programme: "12 check-ins, 1 open now". */
export function checkInsCountWords(count: number, open: number): string {
  const all = `${count} ${count === 1 ? "check-in" : "check-ins"}`;
  return open > 0 ? `${all}, ${open} open now` : all;
}

/** One check-in's row on the admins' list: "Week 3 · Group C · Wed 18 Nov". */
export function checkInRowWords(weekNumber: number, groupName: string, startsAt: Date | null): string {
  return [`Week ${weekNumber}`, groupName, startsAt ? dayWords(startsAt) : ""].filter(Boolean).join(" · ");
}
