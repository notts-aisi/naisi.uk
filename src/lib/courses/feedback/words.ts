import { londonClockLabel, londonDayLabel } from "../londonLabels";
import { namesAnd } from "../writtenAnswerWords";
import type { FeedbackDelivery, FeedbackOn } from "@/lib/firestore/courseFeedback";
import type { EmailAbout, OwnFeedbackCard } from "./model";

/**
 * EVERY WORD FEEDBACK SAYS: its cards on the person's week page, "Your
 * feedback" on the review page, "Feedback to write" for the people running a
 * group, "Feedback to send" on the programme's Overview, the batch email, and
 * the routes' refusals. One file, so the pages, the routes and the email say
 * one thing.
 *
 * Never "mark", "grade" or "score", and no pronoun for a person: their name.
 * Days as "Wed 18 Nov", times in the house clock ("3pm", "10:02am"). The
 * programme's senior leads do not exist yet, so the words name the people
 * who do this today: admins send the emails.
 */

/** "Sun 15 Nov, 10:02am". */
function dayClock(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

// ---------------------------------------------------------------------------
// The person's week page
// ---------------------------------------------------------------------------

export const FEEDBACK_HEADING = "Feedback";
export const FROM_THE_NAISI_TEAM = "From the NAISI team";
export const YOUR_FACILITATOR = "Your facilitator";

/** A card's heading: "Feedback from Rahul" for their facilitator, "From the NAISI team" for the lead or an admin. */
export function cardHeadingWords(card: Pick<OwnFeedbackCard, "byRole" | "byName">): string {
  if (card.byRole !== "facilitator") return FROM_THE_NAISI_TEAM;
  return card.byName ? `Feedback from ${card.byName}` : "Feedback from your facilitator";
}

/**
 * The line under a card's heading: "Your facilitator · Sat 14 Nov", "Claudia,
 * who leads AGI Strategy · Sun 15 Nov", "Zach · Mon 16 Nov". `programme` is
 * the programme's short name, or "" with none.
 */
export function cardByWords(card: Pick<OwnFeedbackCard, "byRole" | "byName" | "at">, programme: string): string {
  const day = card.at ? londonDayLabel(new Date(card.at)) : "";
  let who: string;
  if (card.byRole === "facilitator") who = YOUR_FACILITATOR;
  else if (card.byRole === "lead") who = card.byName ? `${card.byName}, who leads ${programme || "the programme"}` : `Who leads ${programme || "the programme"}`;
  else who = card.byName;
  return [who, day].filter(Boolean).join(" · ");
}

/**
 * The same line as the people running the group read it, about somebody
 * else's week: "Sofia’s facilitator · Sat 14 Nov", and the team's as the
 * person reads it.
 */
export function staffCardByWords(card: Pick<OwnFeedbackCard, "byRole" | "byName" | "at">, programme: string, firstName: string): string {
  if (card.byRole !== "facilitator") return cardByWords(card, programme);
  const day = card.at ? londonDayLabel(new Date(card.at)) : "";
  return [`${firstName}’s facilitator`, day].filter(Boolean).join(" · ");
}

/** "Feedback from Rahul", the line a week's written answer and This week's row lead to the cards with. */
export function feedbackLinkWords(card: Pick<OwnFeedbackCard, "byRole" | "byName">): string {
  if (card.byRole === "facilitator") return cardHeadingWords(card);
  return card.byName ? `Feedback from ${card.byName}` : "Feedback from the NAISI team";
}

// ---------------------------------------------------------------------------
// Writing feedback: the review page's "Your feedback", the person page's
// ---------------------------------------------------------------------------

export const YOUR_FEEDBACK = "Your feedback";
export const FEEDBACK_HINT =
  "Optional: write it when there’s time, when it’s needed, or when they’ve asked a question. It’s signed with your name.";
export const COMMENT = "Comment";
export const SAVE_FEEDBACK = "Save feedback";
export const SAVE_CHANGES = "Save changes";
export const SAVING = "Saving…";
export const CHANGE = "Change";
export const DELETE = "Delete";
export const KEEP_IT = "Keep it";
export const NOT_EMAILED_YET = "Not emailed yet";
export const BEING_EMAILED = "Being emailed now";
export const FEEDBACK_ON_THE_WEEK = "Feedback on the week";
export const WEEK_FEEDBACK_HINT =
  "For the week as a whole, not one answer. It’s signed with your name and shows on their week page as soon as you save it.";

/** "Shows on Sofia’s week 2 page as soon as you save." */
export function showsOnWords(firstName: string, weekNumber: number): string {
  return `Shows on ${firstName}’s week ${weekNumber} page as soon as you save.`;
}

/** What the page says once a piece is saved: where it shows now, and that the email waits for an admin's batch. */
export function savedWords(firstName: string, weekNumber: number): string {
  return `Saved. ${firstName} can read it on the week ${weekNumber} page now. ${firstName} will be emailed when an admin sends the feedback emails.`;
}

/** What the page says once a piece's words are changed. */
export function changedWords(firstName: string, weekNumber: number): string {
  return `Changed. ${firstName} reads the new words on the week ${weekNumber} page now.`;
}

/** What the page says once a piece is deleted. */
export function deletedWords(firstName: string): string {
  return `Deleted. ${firstName} won’t see it any more.`;
}

/** "Delete this feedback? Sofia won’t see it any more." */
export function deleteConfirmWords(firstName: string): string {
  return `Delete this feedback? ${firstName} won’t see it any more.`;
}

/** "Written by Claudia, Sun 15 Nov, 10:02am", with its last change when it was changed. */
export function writtenByWords(name: string, at: Date | null, editedAt: Date | null): string {
  const written = at ? `Written by ${name}, ${dayClock(at)}` : `Written by ${name}`;
  return editedAt ? `${written}. Changed ${dayClock(editedAt)}` : written;
}

/** Where a piece's email stands, for the people running the group. */
export function emailStateWords(firstName: string, emailed: { at: string | null; delivery: FeedbackDelivery } | null, sending: boolean): string {
  if (sending) return BEING_EMAILED;
  if (!emailed) return NOT_EMAILED_YET;
  if (emailed.delivery === "held") return `Not emailed: this copy of the site doesn’t email ${firstName}’s address.`;
  if (emailed.delivery === "suppressed") return `Not emailed: ${firstName}’s address is on the do-not-email list.`;
  return emailed.at ? `Emailed to ${firstName} on ${londonDayLabel(new Date(emailed.at))}` : `Emailed to ${firstName}`;
}

export const FEEDBACK_NOT_SAVED = "That feedback didn’t save. Check your connection and try again.";
export const WRITE_IT_FIRST = "Write the feedback before you save it.";

/** A piece over its cap. */
export function feedbackTooLongWords(limit: number): string {
  return `That’s over ${limit} words. Short and specific beats long: cut it down.`;
}

// ---------------------------------------------------------------------------
// The routes' refusals
// ---------------------------------------------------------------------------

export const SAY_WHOSE_WEEK = "Say whose week, which week and what the feedback is on.";
export const SAY_WHICH_FEEDBACK = "Say which feedback.";
export const ONLY_ITS_WRITER = "Only whoever wrote this feedback can change it.";
export const ONLY_ITS_WRITER_OR_AN_ADMIN = "Only whoever wrote this feedback, or an admin, can delete it.";
export const FEEDBACK_NOT_DELETED = "That didn’t delete. Check your connection and try again.";
export const NOT_A_FEEDBACK_WEEK = "That week isn’t one feedback is given on here.";
export const NOT_READABLE_YET = "That week hasn’t been submitted yet, so there’s nothing to give feedback on.";
export const ANSWER_EMPTY = "That written answer is empty, so there’s nothing to give feedback on. Leave feedback on the week instead.";
export const FEEDBACK_NOT_HERE = "That feedback isn’t here any more. Reload the page.";
export const ALREADY_EMAILED = "Its email has gone, so it can’t change now.";
export const BEING_EMAILED_REFUSAL = "Its email is being sent right now, so it can’t change. Try again in a few minutes.";

// ---------------------------------------------------------------------------
// Feedback to write (the group page, Home, the lead's Attendance tab)
// ---------------------------------------------------------------------------

export const FEEDBACK_TO_WRITE = "Feedback to write";
export const NOTHING_TO_WRITE = "Nothing to write";
export const WRITE_FEEDBACK = "Write feedback";
export const TO_WRITE_LINE =
  "People see your feedback on their page as soon as you save it; the email telling them goes in a batch.";

/**
 * How many written answers wait for feedback: "3 week 2 answers", "1 week 2
 * answer", "3 answers from weeks 2 and 3", or "Nothing to write".
 */
export function toWriteWords(weeks: readonly number[]): string {
  const count = weeks.length;
  if (count === 0) return NOTHING_TO_WRITE;
  const distinct = [...new Set(weeks)].sort((a, b) => a - b);
  const noun = count === 1 ? "answer" : "answers";
  if (distinct.length === 1) return `${count} week ${distinct[0]} ${noun}`;
  return `${count} ${noun} from weeks ${namesAnd(distinct.map(String))}`;
}

// ---------------------------------------------------------------------------
// Feedback to send (the programme's Overview)
// ---------------------------------------------------------------------------

export const FEEDBACK_TO_SEND = "Feedback to send";
export const BATCH_INTRO =
  "Feedback shows on each person’s page as soon as it’s saved. These emails tell them it’s there. Facilitators, the programme’s lead and admins write feedback; admins send the emails.";
export const ADMINS_SEND = "An admin sends these emails.";
export const EMAIL_IT = "Email it";
export const PERSON = "Person";
export const GROUP = "Group";
export const FEEDBACK_ON = "Feedback on";
export const WRITTEN_BY = "Written by";
export const SAVED = "Saved";
export const THE_EMAIL_EACH_PERSON_GETS = "The email each person gets";
export const ONE_EMAIL_PER_PERSON = "One email per person, however many pieces they have.";
export const SEND_TEST = "Send a test to me";
export const TEST_FIRST_LINE = "Send a test to yourself first. A test unlocks this for a day.";
export const NOT_IN_A_GROUP = "No group";

/** "Week 2 written answer", "Week 2 as a whole": what a piece is on. */
export function feedbackOnWords(weekNumber: number, on: FeedbackOn["kind"]): string {
  return on === "writtenAnswer" ? `Week ${weekNumber} written answer` : `Week ${weekNumber} as a whole`;
}

/** "Email Sofia Marin about this feedback", the name a row's tick box is read by. */
export function tickLabelWords(name: string, on: string): string {
  return `Email ${name} about this feedback: ${on}`;
}

/** "Send 6 emails". */
export function sendEmailsWords(people: number): string {
  return `Send ${people} ${people === 1 ? "email" : "emails"}`;
}

/**
 * The line over the list: "7 pieces of feedback for 6 people aren’t emailed
 * yet. The last send was Sun 8 Nov.", or that there is nothing to send.
 */
export function waitingLineWords(pieces: number, people: number, lastSend: Date | null, anyEver: boolean): string {
  const last = lastSend ? ` The last send was ${londonDayLabel(lastSend)}.` : "";
  if (pieces === 0) {
    return anyEver ? `Every piece of feedback has been emailed.${last}` : "Nobody has saved any feedback yet.";
  }
  const piecesWords = `${pieces} ${pieces === 1 ? "piece" : "pieces"} of feedback`;
  const peopleWords = `${people} ${people === 1 ? "person" : "people"}`;
  return `${piecesWords} for ${peopleWords} ${pieces === 1 ? "isn’t" : "aren’t"} emailed yet.${last}`;
}

/** "Feedback for 1 person can’t be emailed: Sofia Marin has no address on file." */
export function noAddressWords(names: readonly string[]): string {
  return `Feedback for ${names.length} ${names.length === 1 ? "person" : "people"} can’t be emailed: ${namesAnd(names)} ${names.length === 1 ? "has" : "have"} no address on file.`;
}

export const NOTHING_TICKED = "Tick the feedback to email first.";
export const TEST_FIRST = "Send a test to yourself first, then press again.";
export const NOBODY_TO_TEST = "There’s no feedback to email, so there’s no email to test.";
export const NO_ADDRESS_FOR_TEST = "Your account has no email address on file, so there is nowhere to send a test.";
export const PRESS_IN_PROGRESS = "Somebody is sending this programme’s feedback emails right now. Wait a minute, then press again.";
export const ADMINS_ONLY = "Only an admin can send the feedback emails.";
export const NO_RUN_HERE = "There’s no programme run here.";

/** The numbers on the button are no longer what a press would send. */
export function countMovedWords(pieces: number, people: number): string {
  return `There are now ${pieces} ${pieces === 1 ? "piece" : "pieces"} of feedback to email, to ${people} ${people === 1 ? "person" : "people"}. Check the list, then press again.`;
}

/** What a test did. */
export function testSaidWords(delivery: FeedbackDelivery, subject: string): string {
  if (delivery === "sent") return `A test is on its way to you: “${subject}”.`;
  if (delivery === "suppressed") {
    return "Your address is on the do-not-email list, so the test wasn’t sent. Nothing changes until one reaches you.";
  }
  return "This copy of the site doesn’t send to your address, so the test was held. Nothing changes until one reaches you.";
}

/** What a press did, line by line. */
export type FeedbackSendReport = { sent: number; held: number; suppressed: number; failed: string[]; noAddress: string[] };

export function sendReportWords(report: FeedbackSendReport): string[] {
  const out: string[] = [];
  if (report.sent > 0) out.push(`${report.sent} ${report.sent === 1 ? "email" : "emails"} sent.`);
  if (report.held > 0) out.push(`${report.held} held by this copy of the site, which doesn’t email ${report.held === 1 ? "that address" : "those addresses"}.`);
  if (report.suppressed > 0) {
    out.push(`${report.suppressed} not sent: ${report.suppressed === 1 ? "that address is" : "those addresses are"} on the do-not-email list.`);
  }
  if (report.failed.length > 0) {
    out.push(`Couldn’t email ${namesAnd(report.failed)}: still to send, so the next press tries again.`);
  }
  if (report.noAddress.length > 0) out.push(noAddressWords(report.noAddress));
  if (out.length === 0) out.push("Nothing was sent: another press had sent it already.");
  return out;
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

export const READ_YOUR_FEEDBACK = "Read your feedback";
export const PASTE_IT = "Or paste this into your browser:";

/** "New feedback on your AGI Strategy work", or "New feedback on your work" with no programme name. */
export function emailSubjectWords(programme: string): string {
  return programme ? `New feedback on your ${programme} work` : "New feedback on your work";
}

/** "[TEST] New feedback on your AGI Strategy work". */
export function testSubjectWords(subject: string): string {
  return `[TEST] ${subject}`;
}

/** "Hi Sofia,", or null with no name to greet. */
export function greetingWords(firstName: string): string | null {
  return firstName ? `Hi ${firstName},` : null;
}

/**
 * The email's one sentence: "Rahul has left feedback on your week 2 written
 * answer.", "Rahul and Claudia have left feedback on your work in week 2.",
 * "Rahul has left feedback on your work in weeks 2 and 3."
 */
export function emailLeadWords(about: EmailAbout): string {
  const who = about.names.length > 0 ? namesAnd(about.names) : "The NAISI team";
  const has = about.names.length > 1 ? "have" : "has";
  let what: string;
  if (about.weeks.length > 1) what = `your work in weeks ${namesAnd(about.weeks.map(String))}`;
  else if (about.allOnTheAnswer) what = `your week ${about.weeks[0] ?? ""} written answer`;
  else what = `your work in week ${about.weeks[0] ?? ""}`;
  return `${who} ${has} left feedback on ${what}.`;
}
