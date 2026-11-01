import type { GridRow } from "@/lib/audience/kind";
import { rowInASentence } from "@/lib/audience/words";
import type { CourseUpdateTo } from "@/lib/firestore/courseUpdates";
import type { MessageTally } from "@/lib/firestore/messageSends";

/**
 * THE WORDS OF MESSAGES, in one place: the page's, the composer's, the
 * routes' and the email's. No server import, so the composer in the browser
 * and the routes on the server say the same thing in the same words. The
 * picker's own words ("Who is this for?", the count, who is left out and why,
 * how it would be sent) are `src/lib/audience/words.ts`.
 *
 * British English, sentence case, no dashes.
 */

/** Counts, grouped the British way: "4,000". A number format, so no time zone is involved. */
const COUNT_FORMAT = new Intl.NumberFormat("en-GB");

export function countWords(n: number): string {
  return COUNT_FORMAT.format(Math.max(0, Math.floor(n)));
}

/** "1 person", "23 people". */
export function peopleWords(n: number): string {
  return n === 1 ? "1 person" : `${countWords(n)} people`;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export const PAGE_WORDS = {
  title: "Messages",
  lede: "Choose who a message is for, send yourself a test, then send it.",
  /** For an approved account that runs nothing Messages can write to. */
  notForYou:
    "Messages is for the people who run a programme or a group: admins, a programme’s lead and a group’s facilitators. " +
    "There is nothing here for your account to write to yet.",
} as const;

/** On a programme's Messages tab: the way to Messages, set to that programme. */
export const OPEN_IN_MESSAGES = {
  link: "Write in Messages",
  line: "Messages writes to this programme’s people, or to anybody else you run something for, and can post it here as well.",
} as const;

/** Messages, started with one tag: the address a programme's Messages tab links to. */
export function messagesHrefFor(tagId: string): string {
  return `/messages?for=${encodeURIComponent(tagId)}`;
}

/** Write and Sent, the two halves of Messages, as the pills under the title. */
export const TAB_WORDS = { nav: "Messages", write: "Write", sent: "Sent" } as const;

/**
 * Where the old composers on a run's pages hand over: the cohort's card on a
 * run's home, for the people it opens Messages for.
 */
export const HANDOVER_WORDS = {
  cohortTitle: "The whole cohort",
  cohortNote: "Messages writes to everyone holding a place on this programme, and can post it on the programme’s page as well.",
} as const;

// ---------------------------------------------------------------------------
// Sent
// ---------------------------------------------------------------------------

export const SENT_WORDS = {
  /** Under the title, for an admin, who reads every send. */
  ledeAdmin:
    "Every send to people on the site, newest first, with who it reached. A message from Messages also says who was left out, and why.",
  /** Under the title, for a programme's lead or a group's facilitator. */
  lede: "What was sent from Messages to the people you run, newest first, with who it reached and who was left out.",
  earlier: "Earlier",
  later: "Later",
  /** Nothing in the window. */
  nothing: "Nothing was sent in these two weeks.",
  nothingYours: "Nothing was sent to the people you run in these two weeks.",
  /** The email log held more rows in the window than the page reads at once. */
  capped:
    "These two weeks hold more emails than this page reads at once, so their oldest sends may be missing here. Every email is listed under Email delivery.",
  /** The tags of a message, for a screen reader, and each one's sign. */
  tagsLabel: "Who it was for",
  included: "Included",
  leftOut: "Left out",
  seeWho: "See who",
  emailed: "Emailed",
  notEmailed: "Not emailed",
  leftOutTitle: "Left out, and why",
  why: "Why",
  people: "People",
  you: "you",
  /** A send whose record never settled: what its emails did is not known for everybody. */
  cutOff: "This send stopped before it finished, so what became of some of its emails isn’t known.",
  posted: "Also posted on the programme’s page.",
  /** Who sent a send the site made, or one whose writer is no account. */
  site: "NAISI",
  /** A writer or a person whose account has since been deleted. */
  gone: "An account since deleted",
  /** The people who were emailed, and their outcomes, for an admin. */
  held: "Held: this copy of the site doesn’t email them",
  suppressed: "Not emailed: do-not-email list",
  bounced: "Bounced or marked as spam",
  failed: "Couldn’t be sent",
  unknown: "Not known: the send stopped first",
} as const;

/** "Sent from Mon 19 Oct to Sun 1 Nov." `first` and `last` are the window's days, said in London. */
export function sentWindowWords(first: string, last: string): string {
  return `Sent from ${first} to ${last}.`;
}

/** "by Zachary Levin", "by you", "by NAISI": who sent a send. */
export function byWords(from: string): string {
  return `by ${from}`;
}

/** "1 person with no account", "3 people with no account": guests, walk-ins and addresses no account holds. */
export function noAccountWords(n: number): string {
  return `${peopleWords(n)} with no account`;
}

/** How a message from Messages went: "Programme notice", or "By their settings: event announcements". */
export function sentModeWords(mode: "notice" | "grid", row: GridRow | null): string {
  if (mode === "notice") return "Programme notice";
  return row ? `By their settings: ${rowInASentence(row)}` : "By their settings";
}

/**
 * A message from Messages, in numbers: "23 emailed · 2 left out · 1 held".
 * A send that stopped before it finished says how many it was to email, and
 * nothing of what it did.
 */
export function messageCountsWords(
  counts: { emailed: number; leftOut: number; sent: number; held: number; suppressed: number; failed: number },
  settled: boolean,
): string {
  if (!settled) return `${countWords(counts.emailed)} to be emailed · ${countWords(counts.leftOut)} left out`;
  const parts = [`${countWords(counts.sent)} emailed`, `${countWords(counts.leftOut)} left out`];
  if (counts.held > 0) parts.push(`${countWords(counts.held)} held`);
  if (counts.suppressed > 0) parts.push(`${countWords(counts.suppressed)} on the do-not-email list`);
  if (counts.failed > 0) parts.push(`${countWords(counts.failed)} couldn’t be sent`);
  return parts.join(" · ");
}

/** Another sender's send, in numbers: "38 emailed · 2 bounced · 1 held". */
export function logCountsWords(counts: { emailed: number; bounced: number; held: number; suppressed: number }): string {
  const parts = [`${countWords(counts.emailed)} emailed`];
  if (counts.bounced > 0) parts.push(`${countWords(counts.bounced)} bounced or marked as spam`);
  if (counts.held > 0) parts.push(`${countWords(counts.held)} held`);
  if (counts.suppressed > 0) parts.push(`${countWords(counts.suppressed)} on the do-not-email list`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

export const COMPOSER_WORDS = {
  /** The composer's heading, for a screen reader: the page's own words say the rest. */
  heading: "Write a message",
  subject: "Subject",
  message: "Message",
  test: "Send a test to me",
  testSending: "Sending a test…",
  sending: "Sending…",
  post: "Also post it on the programme’s page",
  /** A programme notice to one group, which pushes as the group email did. */
  pushes: "A notice to one group also goes as a notification to any device its people have set up.",
  /** Under the buttons while there is nothing chosen. */
  chooseFirst: "Add a tag to choose who this is for.",
  /** While the count is being worked out. */
  counting: "Counting who this reaches…",
  /** Somebody is in the tags and nobody can be emailed. */
  nobody: "Nobody here can be emailed.",
  /** A subject or a message is still empty. */
  writeFirst: "Add a subject and a message.",
  /** No test of these words has reached the writer. */
  testFirst: "Send yourself a test of these words first.",
  /** The words changed since the test that reached the writer. */
  testStale: "You changed the words since your test. Send yourself another first.",
  /** What the composer says when it cannot tell whether a send went. */
  unknown: "We couldn’t tell whether that went through. Check your inbox before you press again.",
  /** "Send a test to me" did not reach the route. */
  testFailed: "The test didn’t go. Try again.",
} as const;

/** The button that sends: "Send to 23 people", or "Send" while there is nobody to email. */
export function sendButtonWords(emailed: number): string {
  return emailed > 0 ? `Send to ${peopleWords(emailed)}` : "Send";
}

/** What the composer says after "Send a test to me". `at` is "5:38pm". */
export function testResultWords(delivery: "sent" | "held" | "suppressed", at: string): string {
  if (delivery === "held") {
    return "The test was held, not sent: this copy of the site doesn’t email your address. A send waits for a test that reaches you.";
  }
  if (delivery === "suppressed") {
    return "Your address is on the do-not-email list, so the test was not sent. A send waits for a test that reaches you.";
  }
  return `Test sent to you at ${at}. Check it, then send.`;
}

/** What the composer says after a send. `posted` names the programme whose page it was posted on, or is null. */
export function sentWords(tally: MessageTally, posted: string | null): string {
  const parts: string[] = [];
  if (tally.sent > 0) parts.push(`Sent to ${peopleWords(tally.sent)}`);
  if (tally.held > 0) parts.push(`${countWords(tally.held)} held, because this copy of the site doesn’t email them`);
  if (tally.suppressed > 0) parts.push(`${countWords(tally.suppressed)} not emailed: do-not-email list`);
  if (tally.failed > 0) parts.push(`${countWords(tally.failed)} couldn’t be sent`);
  const said = parts.length > 0 ? `${parts.join("; ")}.` : "Nothing was sent.";
  return posted ? `${said} Posted on ${posted}’s page too.` : said;
}

/** Under the post switch: where the message stays. */
export function postWords(programme: string, to: CourseUpdateTo, group: string | null): string {
  if (to === "facilitators") return `${programme}’s facilitators keep it under Updates on the programme’s page.`;
  if (to === "group" && group) return `${group} keeps it under Updates on ${programme}’s page, as well as in their email.`;
  return `Everyone on ${programme} keeps it under Updates on the programme’s page, as well as in their email.`;
}

// ---------------------------------------------------------------------------
// The routes' refusals
// ---------------------------------------------------------------------------

export const MESSAGE_REFUSAL = {
  notSignedIn: "Sign in to write a message.",
  notApproved: "Your account can’t write messages.",
  notAWriter: "Messages is for admins, a programme’s lead and a group’s facilitators.",
  body: "That isn’t a message we can read.",
  subject: "Add a subject.",
  subjectLine: "The subject has to fit on one line.",
  message: "Add a message.",
  count: "The number on the button is missing. Reload the page and try again.",
  post: "Say whether to post it on the programme’s page as well.",
  nobody: "Nobody here can be emailed, so nothing was sent.",
  noTestAddress: "There’s no address on your account to send a test to.",
  notPostable: "That can only go on a programme’s page when it is to one programme’s people or one group, with nobody left out.",
  noRun: "That programme has no course run to post on, so nothing was sent.",
  notYourPage: "You can’t post on that programme’s page, so nothing was sent.",
  untested: "Send yourself a test of these words first. Nothing was sent.",
  staleTest: "The words changed after your last test. Send yourself another first. Nothing was sent.",
  unreadable: "Could not check the send limit. Try again in a moment.",
  testNotSent: "That test could not be sent. Try again in a minute.",
  testNotRecorded: "The test was sent to you, but it could not be recorded. Send it again in a minute.",
  notConfigured: "Server not configured",
} as const;

/** "The subject can be at most 150 characters." */
export function tooLongWords(field: "subject" | "message", max: number): string {
  return `The ${field} can be at most ${countWords(max)} characters.`;
}

/** The count on the button no longer holds. */
export function countChangedWords(emailed: number): string {
  return `Who this reaches changed since it was counted: it would now email ${peopleWords(emailed)}. Nothing was sent. Check it, and press again.`;
}

/** Over what one send can take: refused whole, never trimmed. */
export function overCeilingWords(emails: number, max: number): string {
  return `This would send ${countWords(emails)} emails, over the ${countWords(max)} one send can take. Nothing was sent: choose fewer people.`;
}

/** Too many tests in the hour. */
export function tooManyTestsWords(limit: number): string {
  return `You’ve sent yourself ${countWords(limit)} tests in the last hour. Try again shortly.`;
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

/** The subject of the test email: the subject, marked. */
export function testSubject(subject: string): string {
  return `[TEST] ${subject}`;
}

/**
 * Why a message by their settings reached somebody, at its foot, before the
 * link that unsubscribes them from that row. An account's yes is the row of
 * its settings; a guest's is their own subscription to the row's list, and no
 * guest is on a list for course announcements.
 */
export function becauseWords(row: GridRow, guest: boolean): string {
  if (guest) {
    return row === "newsletter"
      ? "You’re getting this because you subscribed to the newsletter."
      : "You’re getting this because you subscribed to event announcements.";
  }
  if (row === "newsletter") return "You’re getting this because you said yes to the newsletter.";
  if (row === "events") return "You’re getting this because you said yes to event announcements.";
  return "You’re getting this because course announcements are switched on in your settings.";
}

/** The words around the unsubscribe link: "You can [unsubscribe] at any time." */
export const UNSUBSCRIBE_WORDS = { before: "You can ", link: "unsubscribe", after: " at any time." } as const;
