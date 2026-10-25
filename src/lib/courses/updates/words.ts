import type { CourseUpdateEmail, CourseUpdateTo } from "@/lib/firestore/courseUpdates";

/**
 * THE WORDS OF UPDATES, in one place: the composer's, the three pages' and
 * the route's. No imports beyond a type, so the composer in the browser and
 * the route on the server say the same thing in the same words.
 *
 * The words the boards draw are copied exactly (wk-messages option B,
 * wk-programme, wk-fac-group, st-fac-before-phone), with their apostrophes.
 * The words they do not draw (an empty list, a refusal, a held email, a
 * writer whose account is gone, the test's marking) are written in the same
 * voice and listed for Claude Design in the build notes.
 */

/** Where a reply to an update's email goes: said on the page, and set on every email. */
export const UPDATE_REPLY_TO = "ai-safety@uonsu.com";

/**
 * How many updates a member's programme page shows before "Show older
 * updates". The board draws two from the week it shows; three holds a
 * typical week whole (the lead's update for the week, the group's own, and
 * one more such as a room change) and keeps the section to about a phone
 * screen, so Your group stays close below it.
 */
export const UPDATES_SHOWN_FIRST = 3;

/** What an update shows for its writer once their account has been deleted. */
export const UPDATE_WRITER_GONE = "NAISI";

/** What a group with no name is called. The same words the run's other tabs use. */
export const UNNAMED_GROUP = "Untitled group";

/** Counts, grouped the British way: "4,000". A number format, so no time zone is involved. */
const COUNT_FORMAT = new Intl.NumberFormat("en-GB");

/** "1,200": the site's numbers, grouped. */
export function countWords(n: number): string {
  return COUNT_FORMAT.format(Math.max(0, Math.floor(n)));
}

/** "1 person", "31 people". */
export function peopleWords(n: number): string {
  return n === 1 ? "1 person" : `${countWords(n)} people`;
}

/** "141 / 4,000": the count under a field, as the board writes it. */
export function counterWords(used: number, max: number): string {
  return `${countWords(used)} / ${countWords(max)}`;
}

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

export const COMPOSER_HEADING = "New update";
export const TO_LABEL = "To";
export const TO_HINT = "Or a group, or the facilitators";
export const TITLE_LABEL = "Title";
export const MESSAGE_LABEL = "Message";
export const EMAIL_SWITCH_LABEL = "Also email it";
export const TEST_BUTTON = "Send a test to me";
export const TEST_SENDING = "Sending a test…";
export const POSTING = "Posting…";
/** Under "Also email it" when the audience is over what one send can take. */
export const TOO_MANY_TO_EMAIL = "Too many people to email in one send";

/** One choice in the composer's To: "Everyone on AGI Strategy (31)", "Group B (7)", "The facilitators (5)". */
export function audienceOptionLabel(
  to: CourseUpdateTo,
  names: { programme: string; group: string },
  people: number,
): string {
  if (to === "everyone") return `Everyone on ${names.programme} (${countWords(people)})`;
  if (to === "facilitators") return `The facilitators (${countWords(people)})`;
  return `${names.group} (${countWords(people)})`;
}

/** Under "Also email it": "Emails 31 people", or why it cannot. */
export function emailSwitchWords(emails: number): string {
  return emails > 0 ? `Emails ${peopleWords(emails)}` : "Nobody to email yet";
}

/** The button that posts: "Post and email 31 people" with the switch on, "Post" with it off. */
export function postButtonWords(email: boolean, emails: number): string {
  return email && emails > 0 ? `Post and email ${peopleWords(emails)}` : "Post";
}

/** The facilitator's way to the composer for their own group: "Write to Group B (8)". */
export function writeToGroupWords(group: string, people: number): string {
  return `Write to ${group} (${countWords(people)})`;
}

/** The line under it, from st-fac-before-phone. */
export function writeToGroupLine(emails: number): string {
  return emails > 0
    ? `Posts an update to the group and emails ${peopleWords(emails)}. Replies go to ${UPDATE_REPLY_TO}.`
    : "Posts an update to the group. Nobody in it can be emailed yet.";
}

/** What the composer says after a press. */
export function postedWords(email: { sent: number; held: number; suppressed: number; failed: number } | null): string {
  if (!email) return "Posted.";
  const parts: string[] = [];
  if (email.sent > 0) parts.push(`emailed to ${peopleWords(email.sent)}`);
  if (email.held > 0) parts.push(`${countWords(email.held)} held, because this copy of the site doesn’t email them`);
  if (email.suppressed > 0) parts.push(`${countWords(email.suppressed)} not emailed: do-not-email list`);
  if (email.failed > 0) parts.push(`${countWords(email.failed)} couldn’t be sent`);
  if (parts.length === 0) return "Posted.";
  const [first, ...rest] = parts;
  return `Posted and ${first}${rest.length ? `; ${rest.join("; ")}` : ""}.`;
}

/** What the composer says when it cannot tell whether a press went through. */
export const UNKNOWN_OUTCOME =
  "We couldn’t tell whether that went through. Check the updates below before you press again.";

/** What the composer says when "Send a test to me" did not reach the route. */
export const TEST_FAILED = "The test didn’t go. Try again.";

/** What the composer says after "Send a test to me". `at` is "1:32am". */
export function testWords(delivery: "sent" | "held" | "suppressed", at: string): string {
  if (delivery === "held") return "The test was held, not sent: this copy of the site doesn’t email your address.";
  if (delivery === "suppressed") return "Your address is on the do-not-email list, so the test was not sent.";
  return `Test sent to you at ${at}.`;
}

/** The subject of the test email: the title, marked. */
export function testSubject(title: string): string {
  return `[TEST] ${title}`;
}

// ---------------------------------------------------------------------------
// The lists
// ---------------------------------------------------------------------------

export const UPDATES_HEADING = "Updates";
export const SHOW_OLDER = "Show older updates";
export const NO_UPDATES_YET = "No updates yet.";
export const UPDATES_DID_NOT_LOAD = "The updates didn’t load.";
export const TRY_AGAIN = "Try again";

/**
 * Who an update was to, on a member's page: "to everyone on AGI Strategy",
 * "to Group B", "to the facilitators".
 */
export function toWordsForReader(
  to: CourseUpdateTo,
  names: { programme: string; group: string | null },
): string {
  if (to === "everyone") return `to everyone on ${names.programme}`;
  if (to === "facilitators") return "to the facilitators";
  return `to ${names.group ?? UNNAMED_GROUP}`;
}

/** Who an update was to, on a staff list: "Everyone", "Group B", "Facilitators". */
export function toWordsForStaff(to: CourseUpdateTo, group: string | null): string {
  if (to === "everyone") return "Everyone";
  if (to === "facilitators") return "Facilitators";
  return group ?? UNNAMED_GROUP;
}

/** What the email beside an update did, on a staff list: "Emailed to 7". */
export function emailedWords(email: CourseUpdateEmail | null): string {
  if (!email) return "Not emailed";
  if (!email.settled) return "Email not finished";
  const parts = [`Emailed to ${countWords(email.sent)}`];
  if (email.held > 0) parts.push(`${countWords(email.held)} held`);
  if (email.suppressed > 0) parts.push(`${countWords(email.suppressed)} on the do-not-email list`);
  if (email.failed > 0) parts.push(`${countWords(email.failed)} failed`);
  return parts.join(" · ");
}

/** A member's line under an update's title: "Rahul · to Group B · Mon 16 Nov". */
export function readerMetaWords(writer: string, toWords: string, day: string): string {
  return `${writer} · ${toWords} · ${day}`;
}

/** A staff list's line under an update's title: "Rahul → Group B · Mon 16 Nov · Emailed to 7". */
export function staffMetaWords(writer: string, toWords: string, day: string, emailed: string): string {
  return `${writer} → ${toWords} · ${day} · ${emailed}`;
}

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

export const REFUSAL = {
  body: "Expected a JSON object body.",
  to: "Choose who the update is to.",
  group: "Choose a group.",
  title: "Give the update a title.",
  titleLine: "The title must be one line.",
  message: "Write a message.",
  email: "Choose whether to email it.",
  emailCount: "Say how many people the button said it would email.",
  test: "Choose whether this is a test.",
  ownGroupOnly: "You can write to your own group only.",
  groupGone: "That group isn’t on this programme any more. Choose another.",
  nobodyToEmail: "Nobody it’s to can be emailed yet. Turn off Also email it to post it.",
  overCap:
    "This would email more than one send can take, so nothing was posted or sent. Post it without emailing, or ask an admin.",
  noTestAddress: "Your account has no email address on file to send a test to.",
} as const;

/** "You’ve sent 10 tests in the last hour. Try again shortly." */
export function tooManyTestsWords(limit: number): string {
  return `You’ve sent ${countWords(limit)} tests in the last hour. Try again shortly.`;
}

/** "You’ve posted 10 updates in the last hour. Try again shortly." */
export function tooManyPostsWords(limit: number): string {
  return `You’ve posted ${countWords(limit)} updates in the last hour. Try again shortly.`;
}

/** "The title must be 150 characters or fewer." */
export function tooLongWords(field: "title" | "message", max: number): string {
  return `The ${field} must be ${countWords(max)} characters or fewer.`;
}

/** The count on the button is a promise: the press is refused when it no longer holds. */
export function countChangedWords(emails: number): string {
  return `The number of people this emails has changed to ${countWords(emails)}. Check it, then press again.`;
}
