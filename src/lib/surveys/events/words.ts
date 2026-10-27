import type { EventAudience } from "@/lib/firestore/surveys";
import { dateKeyWords, dayWords, minutesWords, paragraphsOf, peopleWords, questionsWords, type SurveyEmailWords } from "../words";

/**
 * EVERY SENTENCE A SURVEY AFTER AN EVENT SAYS, in one place: New survey's
 * card, the answer page and its confidential box, the QR code's page, the
 * two emails, the Send tab and the event's Survey after tab. The words are
 * the boards' (sv-new, sv-social-phone, sv-privacy, sv-send, sv-results,
 * ev-manage), with their apostrophes, changed only where Zach's answers of 25
 * October 2026 changed what is true (Q42, Q43, Q44, names kept two years).
 * Every value comes from a record and arrives here as an argument.
 *
 * No imports but words and types, so the server and the browser say a
 * survey alike. Dates are read in London.
 */

const TZ = "Europe/London";

/** "Sunday", read in London. */
export function weekdayWords(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long" }).format(at);
}

// ---------------------------------------------------------------------------
// Making one (sv-new, "After a social")
// ---------------------------------------------------------------------------

export const TEMPLATE_WORDS = {
  card: "After a social",
  line: "A QR code at the event, then an email to the people who came.",
  event: "Event",
  who: "Who it emails",
  came: "Everyone who came, with an email",
  signups: "Everyone who signed up",
  closes: "It closes on",
  closesNote: "At 23:59 that day. You can change it until it opens.",
  make: "Make the survey",
  making: "Making it…",
  none: "No event can have a survey yet: a survey after an event is for a published one, until a week after it.",
} as const;

/** The Questions tab's lock, before and after a survey after an event opens. */
export const LOCK_WORDS = {
  editing: "The questions lock once it opens, at the event with its QR code or with its email, whichever comes first.",
  fixed: "This survey has opened, so its words and questions are fixed.",
} as const;

/** "After VR games night": what admins call it. */
export function eventSurveyName(title: string): string {
  return `After ${title}`;
}

/** "How was VR games night?": what people see at the top, and the email's subject. */
export function eventSurveyTitle(title: string): string {
  return `How was ${title}?`;
}

/** "Thanks for coming on Sunday. 5 quick questions, about a minute.": the intro, which opens the email. */
export function eventIntro(startAt: Date, questions: number, minutes: number): string {
  return `Thanks for coming on ${weekdayWords(startAt)}. ${questions} quick ${questions === 1 ? "question" : "questions"}, ${minutesWords(minutes)}.`;
}

/** "VR games night · Sun 1 Nov". */
export function eventLine(title: string, startAt: Date | null): string {
  return startAt ? `${title} · ${dayWords(startAt)}` : title;
}

/** "Event: VR games night, Sun 1 Nov", beside the survey's name on its pages. */
export function eventMeta(title: string, startAt: Date | null): string {
  return startAt ? `Event: ${title}, ${dayWords(startAt)}` : `Event: ${title}`;
}

/** "Event: Sun 1 Nov", under the survey's name on the list. */
export function eventListLine(startAt: Date | null): string {
  return startAt ? `Event: ${dayWords(startAt)}` : "Event";
}

/** What each of the two audiences is called. */
export const AUDIENCE_WORDS: Record<EventAudience["kind"], string> = {
  "event-came": TEMPLATE_WORDS.came,
  "event-signups": TEMPLATE_WORDS.signups,
};

const JOINED_WORDS: Record<EventAudience["kind"], string> = { "event-came": "who came since", "event-signups": "who signed up since" };

/** The send button for people who came since: "Send to the 2 who came since". */
export function joinedButtonFor(kind: EventAudience["kind"], n: number): string {
  return `Send to the ${n} ${JOINED_WORDS[kind]}`;
}

/** "Emailed the 2 who came since", the head of its line in what went. */
export function joinedSentHead(kind: EventAudience["kind"], n: number): string {
  return `Emailed the ${n} ${JOINED_WORDS[kind]}`;
}

/** "Emails 14 people.", under the choice of who it goes to. */
export function emailsWords(n: number): string {
  return `Emails ${peopleWords(n)}.`;
}

/** The Send tab's other words for a survey after an event (sv-send). */
export const SEND_TAB_WORDS = {
  whoHeading: "Who answers",
  who: "People at an event",
  whoLine: "Its sign-ups or the people who came, and a QR code there.",
  event: "Event",
  emailHeading: "The email",
  linkLine: "Each email has its own link, so nobody signs in.",
  noReminders: "No reminders go on their own. You can remind people by hand from this page.",
  emailed: (kind: EventAudience["kind"]) => (kind === "event-came" ? "It went to everyone who came, with an email." : "It went to everyone who signed up."),
  atEvent: "At the event",
  byEmail: "By email",
  results: "Results",
  eventGone: "The event this survey is about is no longer on the site, so nothing more can be sent.",
} as const;

/** "At the event: the QR code" on the Send tab (sv-send). */
export const CODE_CARD_WORDS = {
  heading: "At the event: the QR code",
  upSince: (since: string, answers: number) => `Up since ${since} · ${answers} ${answers === 1 ? "answer" : "answers"}`,
  notOpen: "It takes answers once you open it.",
  switchedOff: "This code is switched off in Short links, so a scan lands on /links.",
  noCode: "Its code is made when you open it.",
  download: "Download PNG",
  fullScreen: "Show full screen",
  who: "Signed in, people answer straight away, with their name. Signed out, it asks them to sign in, and tells a guest to use the link in their email. The email skips anybody who has answered.",
  oneEach: "Each event gets its own code. A code is never made for one person.",
  open: "Open it",
  opening: "Opening…",
  openNote: "Opening it fixes its questions and words, as sending does. Nobody is emailed when you press it.",
  failed: "It couldn’t be opened. Try again in a minute.",
  offline: "It couldn’t be opened. Check your connection and try again.",
} as const;

/** The refusals a person can act on, word for word. */
export const EVENT_REFUSAL = {
  pickEvent: "Pick the event the survey is about.",
  pickAudience: "Pick who it emails: everyone who came, or everyone who signed up.",
  noEvent: "That event isn’t here any more.",
  notPublished: "Publish the event first: a survey after an event is for the people who signed up or came.",
  undated: "The event has no date, so the day names come off can’t be worked out. Give it its date first.",
  closesBefore: "The survey after an event can’t close before the event. Pick its day or a later one.",
  tooLate: "That event was more than a week ago, so its survey would reach people too late.",
  hasOne: "This event has its survey already.",
  noSignup: "Nobody signs up for this event, so its survey can only go to the people who came.",
  notEvent: "This survey isn’t one after an event.",
  opened: "This survey is open already.",
  emailedOnce: "This survey’s email has gone already. Send it to people who came since instead.",
  notEmailed: "This survey’s email hasn’t gone yet.",
  audienceFixed: "Who this survey emails was fixed by its first email.",
  notOpen: "This survey isn’t taking answers yet.",
  notForYou: "This survey is for the people who came to the event or signed up for it.",
} as const;

// ---------------------------------------------------------------------------
// The confidential box (sv-privacy, "An event survey")
// ---------------------------------------------------------------------------

export type EventBoxFacts = {
  /** "2028-11-01". */
  namesOffOn: string;
  /** The person's whole name when they answer signed in, else null. */
  signedInAs: string | null;
  /** Whether they came, rather than only signed up; null on a test, which is nobody's. */
  came: boolean | null;
};

/**
 * The box at the top of a survey after an event, point by point, as
 * sv-privacy words it, with two years for names (Zach, 26 October 2026) and
 * nothing anonymous (Q43): an answer keeps the person's name, and the box says
 * it is kept with the fact that they came, or signed up.
 */
export function eventBoxPoints(facts: EventBoxFacts): { points: string[]; note: string } {
  const who = facts.signedInAs
    ? `You’re signed in as ${facts.signedInAs}, so only NAISI’s admins can see who said what.`
    : "Only NAISI’s admins can see who said what.";
  return {
    points: [
      who,
      "Nothing you say here affects anything you sign up for.",
      "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.",
      `Your name comes off on ${dateKeyWords(facts.namesOffOn)}, two years after the event. The totals stay.`,
    ],
    note:
      facts.came === null
        ? "We keep each answer with the name of the person who sent it, and whether they came."
        : facts.came
          ? "We keep your answers with your name, and that you came, so nobody is emailed it twice."
          : "We keep your answers with your name, and that you signed up, so nobody is emailed it twice.",
  };
}

// ---------------------------------------------------------------------------
// The two emails (sv-send, "The email")
// ---------------------------------------------------------------------------

const CONFIDENTIAL_LINE = "It’s confidential: only NAISI’s admins can see who said what.";

function signOffOf(signer: string): string[] {
  return signer ? [signer, "For NAISI"] : ["NAISI"];
}

export type EventEmailFacts = {
  /** "How was VR games night?". */
  title: string;
  intro: string;
  questions: number;
  minutes: number;
  eventTitle: string;
  closesAt: Date;
  signer: string;
};

export const EVENT_EMAIL_BUTTON = "Answer the survey";

/** The survey's email, to everybody it reaches, each with their own link. */
export function eventSurveyEmailWords(facts: EventEmailFacts): SurveyEmailWords {
  return {
    subject: facts.title,
    paragraphs: [...paragraphsOf(facts.intro), CONFIDENTIAL_LINE, `It closes on ${dayWords(facts.closesAt)}.`],
    button: EVENT_EMAIL_BUTTON,
    signOff: signOffOf(facts.signer),
  };
}

/** The reminder, to the people it was emailed to who have not answered. */
export function eventReminderEmailWords(facts: EventEmailFacts): SurveyEmailWords {
  return {
    subject: `A reminder: ${questionsWords(facts.questions)} about ${facts.eventTitle}, by ${dayWords(facts.closesAt)}`,
    paragraphs: [
      `You haven’t answered yet. It’s ${questionsWords(facts.questions)} and takes ${minutesWords(facts.minutes)}.`,
      CONFIDENTIAL_LINE,
      `It closes on ${dayWords(facts.closesAt)}.`,
    ],
    button: EVENT_EMAIL_BUTTON,
    signOff: signOffOf(facts.signer),
  };
}

/** "Mon 1 Nov 2028, two years after the event." */
export function eventNamesOffWords(key: string): string {
  return `${dateKeyWords(key)}, two years after the event.`;
}

export { peopleWords };
