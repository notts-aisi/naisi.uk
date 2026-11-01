import type { GridRow } from "@/lib/audience/kind";
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
