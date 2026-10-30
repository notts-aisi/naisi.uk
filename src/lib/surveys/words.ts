import type { SurveyAudience, SurveyKind, SurveyProgrammeKind } from "@/lib/firestore/surveys";
import type { SurveyChoiceQuestion, SurveyQuestion } from "./items";
import type { IncubatorStrand, SurveyTemplate } from "./templates";

/**
 * EVERY SENTENCE A SURVEY SAYS, in one place: the answer page, the
 * confidential box, the two emails and the admins' pages. The words are the
 * boards' (sv-before-phone, sv-privacy, sv-send-programme, sv-list), with
 * their apostrophes; every value in them comes from a record and arrives
 * here as an argument.
 *
 * No imports but a type, so the server and the browser word a survey alike.
 * Dates are read in London, never the machine's own zone.
 */

const TZ = "Europe/London";

// ---------------------------------------------------------------------------
// Dates and counts
// ---------------------------------------------------------------------------

function parts(at: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...options }).formatToParts(at)) {
    out[part.type] = part.value;
  }
  return out;
}

/** "Wed 4 Nov", read in London. */
export function dayWords(at: Date): string {
  const p = parts(at, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "9am", "9:52am", "12pm", read in London. */
export function clockWords(at: Date): string {
  const p = parts(at, { hour: "numeric", minute: "2-digit", hourCycle: "h23" });
  const hour = Number(p.hour);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return p.minute === "00" ? `${twelve}${suffix}` : `${twelve}:${p.minute}${suffix}`;
}

/** "Thu 29 Oct, 9am". */
export function dayAndClockWords(at: Date): string {
  return `${dayWords(at)}, ${clockWords(at)}`;
}

/** "Wed 4 Nov, 23:59", where the time of day is the point. */
export function deadlineWords(at: Date): string {
  const p = parts(at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** "Sat 9 Dec 2028" for a civil date "2028-12-09", or "" for anything else. */
export function dateKeyWords(key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  // Noon UTC is the same calendar day in London whatever the season.
  const at = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return "";
  const p = parts(at, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

/** "1 question", "6 questions". */
export function questionsWords(n: number): string {
  return `${n} ${n === 1 ? "question" : "questions"}`;
}

/** "about 3 minutes", "about a minute". */
export function minutesWords(n: number): string {
  return n === 1 ? "about a minute" : `about ${n} minutes`;
}

/** "1 person", "30 people". */
export function peopleWords(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

/** "Rahul", "Rahul and Sofia", "Rahul, Sofia and Tom". */
export function namesInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// The programme
// ---------------------------------------------------------------------------

const KIND_WORD: Record<SurveyProgrammeKind, string> = { fellowship: "Fellowship", incubator: "Incubator" };

/** "Fellowship: AGI Strategy". */
export function programmeLine(kind: SurveyProgrammeKind, name: string): string {
  return `${KIND_WORD[kind]}: ${name}`;
}

/** The before survey is week 1's: "Week 1", beside the programme on the answer page. */
export const BEFORE_WEEK = "Week 1";

/** "Week 6", beside the programme on the survey at its end. */
export function weekWords(n: number): string {
  return `Week ${n}`;
}

// ---------------------------------------------------------------------------
// Making a survey
// ---------------------------------------------------------------------------

/**
 * Each stage's words: what the admins call its survey ("AGI Strategy: after"),
 * the title people see (and the start of its email's subject), and the New
 * survey page's card for its template. The leaving survey's card is sv-new's
 * words; its title is written in the boards' voice, for the admin to change.
 */
export const STAGE_WORDS: Record<SurveyTemplate, { name: string; title: string; card: string; cardLine: string }> = {
  before: {
    name: "before",
    title: "Before you start",
    card: "Before the programme",
    cardLine: "Where people start: their study, how they found us, career stage and plans, what they know and who, what stands in the way, and what they want from it. Asked in week 1.",
  },
  after: {
    name: "after",
    title: "At the end",
    card: "At the end of the programme",
    cardLine: "The same core questions again, a look back at where they started, what the programme did, how it went and what’s next. It pairs with the survey before, person by person.",
  },
  followUp6: {
    name: "six months on",
    title: "Six months on",
    card: "Six months on",
    cardLine: "What people are doing now, their share of working time on AI safety, what they have applied to, and the core questions again. Only for people who said yes to follow-ups.",
  },
  followUp12: {
    name: "a year on",
    title: "A year on",
    card: "A year on",
    cardLine: "The same follow-up questions again, a year after the programme. Only for people who said yes to follow-ups.",
  },
  leaving: {
    name: "leaving",
    title: "Why you left",
    card: "Leaving a programme",
    cardLine: "Linked from the leaving screen and email. Replaces today’s outside form.",
  },
};

/** "AGI Strategy: before", the admins' name for a programme's survey at a stage. */
export function surveyNameFor(programmeName: string, stage: SurveyTemplate): string {
  return `${programmeName}: ${STAGE_WORDS[stage].name}`;
}

/** "AGI Strategy: before". */
export function beforeSurveyName(programmeName: string): string {
  return surveyNameFor(programmeName, "before");
}

/** What people see at the top of the before survey, and the start of its email's subject. */
export const BEFORE_TITLE = STAGE_WORDS.before.title;

/**
 * A survey's intro as made, from the number of questions and minutes in it.
 * Its paragraphs open the email; the editor changes them.
 */
export function introFor(stage: SurveyTemplate, questions: number, minutes: number): string {
  const size = `It’s ${questionsWords(questions)} and takes ${minutesWords(minutes)}.`;
  switch (stage) {
    case "leaving":
      return `Tell us why you left, so we can do better. ${size}`;
    case "before":
      return `Week 1 is open. Before you get going, tell us where you’re starting from. ${size}\n\nWe’ll ask the same at the end.`;
    case "after":
      return `The same questions as week 1, then some about how it went and what’s next. ${size}`;
    default:
      return `You said we could ask how things have gone since the programme. ${size}`;
  }
}

/** The before survey's intro as made: the board's words, with its number of questions and minutes. */
export function beforeIntro(questions: number, minutes: number): string {
  return introFor("before", questions, minutes);
}

/** An incubator's strand, as the New survey page offers it. */
export function strandWords(strand: IncubatorStrand, line: string): string {
  return `${strand === "alignment" ? "Alignment" : "Governance"}: “${line}”`;
}

/** An intro's paragraphs: split at blank lines, each with its spaces tidied. */
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
}

// ---------------------------------------------------------------------------
// The answer page
// ---------------------------------------------------------------------------

export const ANSWER_WORDS = {
  eyebrow: "Survey",
  /** Under the intro (Zach, 30 Oct 2026: every survey question is required unless marked optional). */
  required: "Every question needs an answer unless it’s marked optional.",
  /** After it, on a survey whose form has a box asking the person's permission: consent is theirs to give. */
  permission: "The boxes asking your permission are up to you.",
  /** Beside the words of a question whose Required switch is off. */
  optional: "(optional)",
  /** Beside a required question left blank, when Next or Send is pressed. */
  blank: "This question needs an answer.",
  /** Beside an agreement grid with a line left blank. */
  blankLines: "This question needs an answer on every line.",
  tickMany: "Tick as many as apply",
  chooseOne: "Choose one",
  fromProfile: "From your profile. Change it if it’s not right.",
  mostFirst: "Tick some above first.",
  consent: "Consent",
  next: "Next",
  back: "Back",
  send: "Send my answers",
  sending: "Sending…",
  thanks: "Thank you. Your answers are in.",
  tryAgain: "Your answers didn’t send. Check your connection and press Send my answers again.",
  /** The box under a long answer (sv-privacy, sv-after-phone, sv-social-phone), unticked until ticked. */
  quote: "You can quote this, without my name",
  quoteLine: "We might put it in a report for the committee or our funder, Kairos, or on our site.",
} as const;

/**
 * The line under a survey's intro: every question needs an answer unless it
 * is marked optional, and, on a form with a box asking the person's
 * permission (a consent block, the Kairos box, the quote tick), that those
 * boxes are up to them.
 */
export function answerRuleWords(asksPermission: boolean): string {
  return asksPermission ? `${ANSWER_WORDS.required} ${ANSWER_WORDS.permission}` : ANSWER_WORDS.required;
}

/** "Question 3 still needs an answer.", "Questions 3, 5 and 7 still need an answer." */
export function missingWords(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Question ${numbers[0]} still needs an answer.`;
  const all = numbers.map(String);
  const listed = `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
  return `Questions ${listed} still need an answer.`;
}

/** "Page 1 of 3". */
export function pageWords(n: number, of: number): string {
  return `Page ${n} of ${of}`;
}

/** "Pick up to 3", above a pick-any question with a limit. */
export function pickUpToWords(n: number): string {
  return `Pick up to ${n}`;
}

/**
 * "It closes on Wed 4 Nov. Once sent, your answers can’t change." A leaving
 * survey has no closing day, so it says only the second sentence.
 */
export function closingWords(closesAt: Date | null): string {
  const once = "Once sent, your answers can’t change.";
  return closesAt ? `It closes on ${dayWords(closesAt)}. ${once}` : once;
}

/**
 * Changing a consent later, on the person's own survey page: where it stands,
 * the button that changes it, and what it says once changed.
 */
export const CONSENT_WORDS = {
  followUps: {
    yes: "You said we may contact you at 6 and 12 months with a short follow-up survey.",
    no: "You haven’t said we may contact you at 6 and 12 months.",
    stop: "Stop the follow-ups",
    start: "Contact me at 6 and 12 months",
    stopped: "Done. We won’t send you the follow-ups.",
    started: "Done. We’ll send you a short survey at 6 and 12 months.",
    failed: "That didn’t change. Check your connection and try again.",
  },
} as const;

/** What a test link shows where a person would see an earlier answer of their own. */
export function pipeTestWords(words: string): string {
  return `${words} what each person wrote at the start shows here.`;
}

/** An earlier answer of the person's own, as shown above a question: "At the start you said: “…”". */
export function pipedWords(words: string, text: string): string {
  return `${words} “${text}”`;
}

/** The state a link or a signed-in page can find a survey in, in words. */
export const STATE_WORDS = {
  noSurvey: {
    title: "This link doesn’t open a survey",
    body: "It may have been copied wrongly, or the survey is no longer here. If you were sent a survey, open the link in that email again.",
  },
  notYours: {
    title: "This survey isn’t one you were sent",
    body: "Surveys go to the people they are about, each with their own link.",
  },
  answered: (sentAt: Date | null) => ({
    title: "You’ve answered",
    body: sentAt ? `You sent your answers on ${dayWords(sentAt)}. Thank you.` : "Thank you.",
  }),
  closed: (closedOn: Date) => ({
    title: "This survey has closed",
    body: `It closed on ${dayWords(closedOn)}, so it takes no more answers.`,
  }),
  test: "This is a test of the survey’s link. Nothing you send from here is kept, so there is no Send button.",
} as const;

// ---------------------------------------------------------------------------
// The confidential box (sv-privacy, "A programme survey")
// ---------------------------------------------------------------------------

export type ConfidentialFacts = {
  /** Which of the programme's surveys it is: a follow-up compares with what was said during it; leaving has its own words. */
  stage?: SurveyKind;
  /** The programme lead's first name, or null when the programme has no lead who stands. */
  leadName: string | null;
  /**
   * The first names of the person's group's facilitators, or null when they
   * are in no group they have been told about yet.
   */
  facilitatorNames: readonly string[] | null;
  /** "2028-12-09". */
  namesOffOn: string;
  programmeKind: SurveyProgrammeKind;
};

export const CONFIDENTIAL_HEADING = "Confidential";

/**
 * The box at the top of a programme survey, point by point, as sv-privacy
 * words it. Two things in it come from records about the person: the lead,
 * and their group's facilitators. Somebody in no group they have been told
 * about yet is told about their facilitators without names.
 */
export function confidentialPoints(facts: ConfidentialFacts): { points: string[]; note: string } {
  const who: string[] = [];
  if (facts.leadName) who.push(`${facts.leadName} sees totals and comments, never names.`);
  const facilitators = facts.facilitatorNames;
  if (facilitators === null) {
    who.push("Your facilitators never see your answers.");
  } else if (facilitators.length === 1) {
    who.push(`${facilitators[0]} never sees your answers.`);
  } else if (facilitators.length > 1) {
    who.push(`${namesInWords(facilitators)} never see your answers.`);
  }
  const points = ["Only NAISI’s admins can see who said what."];
  if (who.length > 0) points.push(who.join(" "));
  const names = `Your name comes off on ${dateKeyWords(facts.namesOffOn)}, two years after the ${facts.programmeKind} ends. The totals stay.`;
  if (facts.stage === "leaving") {
    // sv-privacy's leaving box, with the words that said it was anonymous
    // replaced by what confidential means here (Q46): listed in the build
    // notes for the boards' designers to confirm.
    points.push(
      "Nothing you say changes your account or a future application.",
      "Totals may go in reports to the committee and our funder, Kairos.",
      names,
    );
    return { points, note: "We ask who you are so each person answers once." };
  }
  points.push(
    "Nothing you say here affects your place or a future application.",
    "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.",
    names,
  );
  const followUp = facts.stage === "followUp6" || facts.stage === "followUp12";
  return {
    points,
    note: followUp
      ? "We ask who you are so we can compare your answers with what you said during the programme."
      : "We ask who you are so we can compare your answers at the start and the end.",
  };
}

// ---------------------------------------------------------------------------
// The two emails (HANDOFF, "Emails, word for word")
// ---------------------------------------------------------------------------

export type SurveyEmailWords = {
  subject: string;
  paragraphs: string[];
  /** The words on the button that opens the person's own link. */
  button: string;
  /** "Zach", "For NAISI": who presses the button signs it. */
  signOff: string[];
};

/** Where replies to every survey email go. */
export const SURVEY_REPLY_TO = "ai-safety@uonsu.com";

/** The From name the site sends a survey as. The address is the site's own. */
export const SURVEY_FROM_NAME = "NAISI";

const CONFIDENTIAL_LINE = "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.";

function signOffOf(signer: string): string[] {
  return signer ? [signer, "For NAISI"] : ["NAISI"];
}

export type EmailFacts = {
  /** "Before you start". */
  title: string;
  intro: string;
  questions: number;
  minutes: number;
  programmeName: string;
  closesAt: Date;
  /** The first name of whoever presses the button, or "" when their account has none. */
  signer: string;
};

/** The survey's own email, to everybody holding a place, each with their own link. */
export function surveyEmailWords(facts: EmailFacts): SurveyEmailWords {
  return {
    subject: `${facts.title}: ${questionsWords(facts.questions)} for ${facts.programmeName}`,
    paragraphs: [...paragraphsOf(facts.intro), CONFIDENTIAL_LINE, `It closes on ${dayWords(facts.closesAt)}.`],
    button: `Answer the ${questionsWords(facts.questions)}`,
    signOff: signOffOf(facts.signer),
  };
}

/** The reminder, to the people who have not answered. */
export function reminderEmailWords(facts: EmailFacts): SurveyEmailWords {
  return {
    subject: `A reminder: ${questionsWords(facts.questions)} for ${facts.programmeName}, by ${dayWords(facts.closesAt)}`,
    paragraphs: [
      `You haven’t answered yet. It’s ${questionsWords(facts.questions)} and takes ${minutesWords(facts.minutes)}.`,
      CONFIDENTIAL_LINE,
      `It closes on ${dayWords(facts.closesAt)}.`,
    ],
    button: `Answer the ${questionsWords(facts.questions)}`,
    signOff: signOffOf(facts.signer),
  };
}

/** A test's subject: the email's own, marked. */
export function testSubject(subject: string): string {
  return `[TEST] ${subject}`;
}

/** The line a test carries above the email's own words. */
export const TEST_LINE =
  "This is a test, sent to you alone. Its button opens the survey as people will see it; nothing you send from there is kept.";

// ---------------------------------------------------------------------------
// The admins' pages
// ---------------------------------------------------------------------------

/** "1, 4 and 7". */
function pointsList(points: readonly number[]): string {
  return namesInWords(points.map(String));
}

/**
 * A question's kind in a few words, as the editor and the read-only list name
 * it (sv-edit: "Choose one", "Pick any", "1 to 5 for each line").
 */
export function questionTypeWords(question: SurveyQuestion): string {
  switch (question.type) {
    case "singleChoice": {
      const choice = question as SurveyChoiceQuestion;
      if (choice.look === "agree") return "Agree or disagree";
      if (choice.look === "points") return "Choose one, every point described";
      if (choice.look === "menu") return choice.profile ? "Choose one from a menu, offered from the profile" : "Choose one from a menu";
      return choice.scores ? "Choose one, each answer counts as a number" : "Choose one";
    }
    case "multipleChoice": {
      const choice = question as SurveyChoiceQuestion;
      if (choice.most) return "Pick any, then the one that mattered most";
      if (choice.maxPicks) return pickUpToWords(choice.maxPicks);
      return "Pick any";
    }
    case "rating":
      return `1 to ${question.rating?.max ?? 5}`;
    case "lines":
      return question.scale.points ? `1 to ${question.scale.max} for each line, every point described` : `1 to ${question.scale.max} for each line`;
    case "scale":
      return question.anchors.length > 0
        ? `${question.min} to ${question.max}, words at ${pointsList(question.anchors.map((anchor) => anchor.at))}`
        : `${question.min} to ${question.max}`;
    case "percent":
      return "0 to 100%";
    case "number":
      return "A number";
    case "shortText":
      return "Short answer";
    case "longText":
      return "Long answer";
    default:
      return "";
  }
}



export const LIST_WORDS = {
  title: "Surveys",
  /**
   * sv-list's lede, the board's words. Its second sentence waited for the
   * lead's Surveys tab, which is built (`(tabs)/surveys`), so it is true now.
   */
  lede: "Only admins make and send surveys. Leads see results for their own programme, in its Surveys tab.",
  newSurvey: "New survey",
  kairos: "Kairos",
  /** sv-public, reached from the list: what goes on a programme's public page. */
  publicNumbers: "Public numbers",
  open: "Open",
  drafts: "Drafts",
  closed: "Closed",
  confidential: "Confidential",
  empty: "No surveys yet. Make one from New survey.",
  notSent: "Not sent yet",
  remind: "Remind",
  results: "Results",
  edit: "Edit",
  howTitle: "How surveys work",
  howConfidential: "We know who answered. Only admins see who said what.",
  /** sv-list, a leaving survey's row: it has no closing day. */
  neverCloses: "No closing date",
} as const;

/** "20 of 32". */
export function answeredOf(answered: number, of: number): string {
  return `${answered} of ${of}`;
}

/** "12 haven’t answered". */
export function notAnsweredWords(n: number): string {
  return `${n} haven’t answered`;
}

export const TAB_WORDS = {
  results: "Results",
  answered: "Who answered",
  questions: "Questions",
  send: "Send",
} as const;

/** "Closes Wed 4 Nov", "Closed Wed 4 Nov". */
export function closesWords(at: Date, closed: boolean): string {
  return `${closed ? "Closed" : "Closes"} ${dayWords(at)}`;
}

export const SEND_WORDS = {
  sent: "Sent",
  seeEmail: "See the email",
  hideEmail: "Hide the email",
  joinedSince: "Joined since",
  saidYesSince: "Said yes since",
  remind: "Remind",
  test: "Send a test to me",
  testing: "Sending a test…",
  from: "From",
  replyTo: "Reply to",
  to: "To",
  sentAt: "Sent",
  remindersGoTo: "Reminders go only to people who haven’t answered. Nobody else is told who has.",
  summary: "Summary",
  who: "Who",
  closes: "Closes",
  /** The summary's row once it has closed, as the head's chip says it. */
  closed: "Closed",
  namesOff: "Names come off",
  labelled: "Answers sent after someone’s first session are labelled, so the comparison can leave them out.",
  close: "Close it now",
  closeConfirm: "Close it now: no more answers",
  closeKeep: "Keep it open",
  closeSure: "Nobody will be able to answer after this, and it can’t be opened again.",
  closedNow: "Closed. It takes no more answers.",
} as const;

/**
 * The summary's row for when a survey closes (B4): "Closes" and the deadline,
 * "Wed 11 Nov, 23:59", while it can still take answers; once it has closed,
 * "Closed" and the day it did, "Tue 27 Oct" (closed by hand, the day of the
 * hand; else the deadline's day), the one date the page's head and its
 * progress line say. Null with no closing time and not closed.
 */
export function summaryClosesWords(
  survey: { closesAt: Date | null; closedAt: Date | null },
  closed: boolean,
): { label: string; value: string } | null {
  const ended = survey.closedAt ?? survey.closesAt;
  if (closed && ended) return { label: SEND_WORDS.closed, value: dayWords(ended) };
  return survey.closesAt ? { label: SEND_WORDS.closes, value: deadlineWords(survey.closesAt) } : null;
}

/** Who a survey reaches, in the Send tab's words, by who it is for and when. */
export type AudienceKind = "start" | "end" | "followUps" | "leaving";

/** Which of the four a survey's audience and stage make it. */
export function audienceKindOf(audience: SurveyAudience, stage: SurveyKind): AudienceKind {
  if (audience.kind === "followUps") return "followUps";
  if (audience.kind === "leaving") return "leaving";
  return stage === "after" ? "end" : "start";
}

const HOLDING: Record<AudienceKind, string> = {
  start: "holding a place",
  end: "still holding a place",
  followUps: "who said yes to follow-ups",
  leaving: "who left the programme",
};

const JOINED: Record<AudienceKind, string> = {
  start: "who joined since",
  end: "who joined since",
  followUps: "who said yes since",
  leaving: "who left since",
};

/** "Emailed the 30 people holding a place". */
export function firstSentWords(n: number, kind: AudienceKind = "start"): string {
  return `Emailed the ${peopleWords(n)} ${HOLDING[kind]}`;
}

/** "Emailed the 2 who joined since: Hannah Brooks and Nina Petrova". */
export function joinedSentWords(names: readonly string[], n: number, kind: AudienceKind = "start"): string {
  return names.length > 0 ? `Emailed the ${n} ${JOINED[kind]}: ${namesInWords(names)}` : `Emailed the ${n} ${JOINED[kind]}`;
}

/** "Reminded the 12 who hadn’t answered". */
export function remindedWords(n: number): string {
  return `Reminded the ${n} who hadn’t answered`;
}

/**
 * "20 of 32 have answered. It closes on Wed 4 Nov." With `notReached`
 * (`notReachedWords`) once somebody it was sent to has left without
 * answering: "3 of 8 have answered, and 1 who hasn’t no longer holds a
 * place. It closes on Wed 4 Nov."
 */
export function progressWords(answered: number, of: number, closesAt: Date, closed: boolean, notReached = ""): string {
  const who = notReached ? `${answered} of ${of} have answered, and ${notReached}.` : haveAnsweredWords(answered, of);
  return `${who} ${closed ? `It closed on ${dayWords(closesAt)}.` : `It closes on ${dayWords(closesAt)}.`}`;
}

/**
 * Not drawn: the people a programme survey was sent to who have not answered
 * and are no longer in its audience, so its Remind does not reach them ("1
 * who hasn’t no longer holds a place"), or "" for nobody. Listed in the build
 * notes for the boards' designers to confirm.
 */
export function notReachedWords(n: number, kind: AudienceKind): string {
  if (n <= 0) return "";
  const who = n === 1 ? "1 who hasn’t" : `${n} who haven’t`;
  if (kind === "followUps") return `${who} no longer ${n === 1 ? "says" : "say"} yes to follow-ups`;
  return `${who} no longer ${n === 1 ? "holds" : "hold"} a place`;
}

/** "Email 30 people". */
export function emailButtonWords(n: number): string {
  return `Email ${peopleWords(n)}`;
}

/** "Send to the 2 who joined since". */
export function joinedButtonWords(n: number, kind: AudienceKind = "start"): string {
  return `Send to the ${n} ${JOINED[kind]}`;
}

/** "Nobody new since Fri 30 Oct. ...", the board's words when nobody has joined since. */
export function nobodyNewWords(since: Date, kind: AudienceKind = "start"): string {
  if (kind === "followUps") {
    return (
      `Nobody new since ${dayWords(since)}. When someone says yes to follow-ups after you’ve sent it, ` +
      "a button here sends it to them, like “Send to the 1 who said yes since”."
    );
  }
  return (
    `Nobody new since ${dayWords(since)}. When someone takes a place after you’ve sent it, ` +
    "a button here sends it to them, like “Send to the 2 who joined since”."
  );
}

/** "12 haven’t answered. Nothing goes until you press the button." */
export function remindLeadWords(n: number): string {
  return n === 0 ? "Everybody it was sent to has answered." : `${n} haven’t answered. Nothing goes until you press the button.`;
}

/** "Test sent to you at 9:52am", or with the day when it was not today. */
export function testSentWords(at: Date, now: Date = new Date()): string {
  return dayWords(at) === dayWords(now) ? `Test sent to you at ${clockWords(at)}` : `Test sent to you on ${dayWords(at)} at ${clockWords(at)}`;
}

/** "Everyone holding a place on AGI Strategy (32)". */
export function audienceWords(programmeName: string, n: number, kind: AudienceKind = "start"): string {
  if (kind === "followUps") return `Everyone on ${programmeName} who said yes to follow-ups (${n})`;
  return `Everyone ${HOLDING[kind]} on ${programmeName} (${n})`;
}

/** "Sat 9 Dec 2028, two years after the programme ends." */
export function namesOffWords(key: string): string {
  return `${dateKeyWords(key)}, two years after the programme ends.`;
}

/** "6 questions · about 3 minutes". */
export function sizeWords(questions: number, minutes: number): string {
  return `${questionsWords(questions)} · ${minutesWords(minutes)}`;
}

// ---------------------------------------------------------------------------
// Results: n and the response rate beside every number, and the change
// ---------------------------------------------------------------------------

/** A number as results print it: whole when it is, else to one place. */
export function numberWords(value: number | null, unit = ""): string {
  if (value === null) return "";
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit === "%" ? `${shown}%` : unit ? `${shown} ${unit}` : shown;
}

/** "60%" of `of`, or "" when it was sent to nobody. */
function rateOf(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "";
}

/**
 * How the people a survey's rate is of came to it: it was sent to them, or,
 * for a leaving survey, which nobody sends, it reached them as they left.
 */
export type ReachWord = "it was sent to" | "it reached";

/** "12 answers from the 20 people it was sent to (60%)." */
export function answersRateWords(answers: number, sent: number, reach: ReachWord = "it was sent to"): string {
  if (answers === 0) return sent > 0 ? `No answers yet from the ${peopleWords(sent)} ${reach}.` : "No answers yet.";
  const counted = `${answers} ${answers === 1 ? "answer" : "answers"}`;
  return sent > 0 ? `${counted} from the ${peopleWords(sent)} ${reach} (${rateOf(answers, sent)}).` : `${counted}.`;
}

/** "12 answered, 60% of the 20 it was sent to", beside each question. */
export function answeredRateWords(n: number, sent: number, verb = "answered", reach: ReachWord = "it was sent to"): string {
  return sent > 0 ? `${n} ${verb}, ${rateOf(n, sent)} of the ${sent} ${reach}` : `${n} ${verb}`;
}

/** "15 answers.", "No answers yet.": how many, with no "of" (a survey after an event). */
export function answersWords(answers: number): string {
  return answers === 0 ? "No answers yet." : `${answers} ${answers === 1 ? "answer" : "answers"}.`;
}

/** "12 answered, 80% of the 15 answers", beside each question when every rate is of the answers. */
export function answeredOfAnswersWords(n: number, answers: number, verb = "answered"): string {
  return answers > 0 ? `${n} ${verb}, ${rateOf(n, answers)} of the ${answers} ${answers === 1 ? "answer" : "answers"}` : `${n} ${verb}`;
}

/** "Compared, person by person, with AGI Strategy: before (24 answers)." */
export function pairedWithWords(pairs: readonly { name: string; answers: number }[]): string {
  if (pairs.length === 0) return "";
  const each = pairs.map((pair) => `${pair.name} (${pair.answers} ${pair.answers === 1 ? "answer" : "answers"})`);
  return `Compared, person by person, with ${namesInWords(each)}.`;
}

export const RESULT_WORDS = {
  namesOff: "Names have come off, so answers no longer pair person by person. The totals stay.",
  beforeAndAfter: "Before and now",
  lookingBack: "Looking back",
  then: "Then",
  now: "Now",
  consents: "Consent",
  toggleLeaveOut: "Leave out before-survey answers sent after someone’s first session",
  toggleCountAll: "Count every answer",
} as const;

/** "Of the 20 who answered it both times, against AGI Strategy: before: 12 moved up, 6 stayed, 2 moved down." */
export function movedWords(both: number, against: string, up: number, same: number, down: number): string {
  if (both === 0) return `Nobody has answered it both times yet (${against}).`;
  return `Of the ${both} who answered it both times (${against}): ${up} moved up, ${same} stayed, ${down} moved down.`;
}

/** "Average 1.8 then, 2.9 now (up 1.1). Middle value 2 then, 3 now." */
export function averagesWords(
  before: { mean: number | null; median: number | null },
  after: { mean: number | null; median: number | null },
  unit: string,
): string {
  if (before.mean === null || after.mean === null) return "";
  const shift = after.mean - before.mean;
  const moved = shift === 0 ? "no change" : `${shift > 0 ? "up" : "down"} ${numberWords(Math.abs(shift), unit === "%" ? "points" : unit)}`;
  const middle = before.median !== null && after.median !== null ? ` Middle value ${numberWords(before.median, unit)} then, ${numberWords(after.median, unit)} now.` : "";
  return `Average ${numberWords(before.mean, unit)} then, ${numberWords(after.mean, unit)} now (${moved}).${middle}`;
}

/** "2.3 → 3.9, 20 of 25 moved up", a line of a grid. */
export function lineMovedWords(before: number | null, after: number | null, up: number, both: number): string {
  if (both === 0 || before === null || after === null) return "Nobody answered it both times yet.";
  return `${numberWords(before)} → ${numberWords(after)}, ${up} of ${both} moved up`;
}

/** "Counts of the 25 people who answered it both times (AGI Strategy: before)." */
export function countsOfWords(both: number, against: string, multiple: boolean): string {
  return `Counts of the ${peopleWords(both)} who answered it both times (${against}).${multiple ? " People could pick any, so the counts can add up to more." : ""}`;
}

/** "12 of the 20 it was sent to said yes: Contact me at 6 and 12 months ...". */
export function consentCountWords(yes: number, of: number, label: string): string {
  return `${answeredRateWords(yes, of, "said yes")}: ${label}.`;
}

/** The refusals a person can act on, word for word. */
export const REFUSAL = {
  notSignedIn: "Sign in to do this.",
  adminOnly: "Only an admin can do this with a survey.",
  noSurvey: "That survey isn’t here any more.",
  body: "That request didn’t arrive in a shape this page understands. Reload the page and try again.",
  sent: "This survey has been sent, so its questions, words and closing date can’t change.",
  closed: "This survey has closed, so it takes no more answers.",
  closedSend: "This survey has closed, so nothing more can be sent.",
  answered: "You’ve already sent your answers to this survey. They can’t change.",
  noLink: "That link doesn’t open a survey you can answer.",
  testLink: "This is a test link, so nothing sent from it is kept.",
  notYours: "This survey isn’t one you were sent.",
  formGone: "The form this survey’s people came from is no longer here, so it can’t be sent to anybody.",
  noNamesOff:
    "The programme’s last session has no date yet, so the day names come off can’t be worked out. Give its groups their sessions first.",
  noAddress: "The site doesn’t know its own address, so no email could carry a link. Nothing was sent.",
  noEmailOnFile: "Your account has no email address on file, so there is nowhere to send a test.",
  noTest: "Nobody has sent themselves a test of this email yet. Send yourself one before you send it.",
  staleTest: "This email’s words changed after the last test. Send yourself a test again before you send it.",
  alreadySent: "This survey has already been sent. Send it to people who joined since instead.",
  notSentYet: "This survey hasn’t been sent yet.",
  nobody: "There is nobody to send this to.",
  inFlight: "Another send of this survey is going out. Try again in a minute.",
  closesPast: "The closing day has to be today or later.",
  strand: "Pick which research this incubator does: it words the first line of its skills question.",
  consentNotAsked: "This survey doesn’t ask that.",
  leavingNotSent: "A leaving survey isn’t sent: once it’s open, it reaches each person as they leave the programme.",
  notLeaving: "Only a leaving survey is opened. Send this one from its Send tab.",
  alreadyOpen: "This survey is open already.",
  consentNoRow: "You weren’t sent the survey that asks this, so there’s nothing to change.",
} as const;

/** The count on the button no longer matches: nothing was sent, and the page is told the new number. */
export function countChangedWords(now: number): string {
  return `Nothing was sent: the number of people this reaches is now ${now}. Check the list and press again.`;
}

// ---------------------------------------------------------------------------
// The cards (Q50 B): a survey waiting for somebody, on Home, My programmes and
// week 1's page
// ---------------------------------------------------------------------------

/**
 * A card's own words (HANDOFF, "Home and My programmes": "A survey for you:
 * Before you start · about 3 minutes · Answer"). What it is, how long, when
 * it closes and "Answer", and never how many others have answered.
 */
export const CARD_WORDS = {
  eyebrow: "A survey for you",
  answer: "Answer",
} as const;

/** "14 questions, about 5 minutes", how long a survey takes, as its card says it. */
export function cardSizeWords(questions: number, minutes: number): string {
  return `${questionsWords(questions)}, ${minutesWords(minutes)}`;
}

// ---------------------------------------------------------------------------
// The survey at the end, on its programme's own pages (Q48 B): Home in the
// last week (wk-lastweek-phone) and the programme page once the programme is
// over (en-after-phone, en-after-nofinish-phone). The boards' words, every
// number, day and name in them from the survey's own record and the group's;
// the words for a day the boards do not draw are in their voice and listed in
// the build notes for the boards' designers to confirm.
// ---------------------------------------------------------------------------

export const END_CARD_WORDS = {
  /** While it is theirs to answer ("cards call the after survey 'The survey at the end'"). */
  heading: "The survey at the end",
  /** Once they have sent it (en-after-phone). */
  sentHeading: "Your survey at the end",
  /** Its button in the last week (wk-lastweek-phone). */
  open: "Open the survey",
  /** Its button once the programme is over (en-after-nofinish-phone). */
  answer: "Answer it",
} as const;

/** "About 5 minutes", "About a minute": a sentence of its own. */
function aboutWords(minutes: number): string {
  return minutes === 1 ? "About a minute" : `About ${minutes} minutes`;
}

/** "5 minutes", "a minute": the time the facilitators leave for it. */
function forWords(minutes: number): string {
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

/**
 * What it asks: "the same 6 questions as week 1, then how it went", the
 * questions it shares with the programme's survey before it; with none
 * shared, "23 questions on how it went".
 */
export function endCardAsksWords(facts: { questions: number; sameAsStart: number }): string {
  return facts.sameAsStart > 0
    ? `the same ${questionsWords(facts.sameAsStart)} as week 1, then how it went`
    : `${questionsWords(facts.questions)} on how it went`;
}

/** "Rahul", "Rahul and Sofia", "Rahul, Sofia and Tom". */
function andWords(firstNames: readonly string[]): string {
  return firstNames.length <= 1 ? (firstNames[0] ?? "") : `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]}`;
}

/**
 * Who leaves the group the time: "Rahul and Sofia leave you 5 minutes for it
 * and step out of the room", with one facilitator "Tom leaves ... and steps
 * out". They are the group's facilitators who hold no place in it
 * (`whoStepsOut`): a facilitator who holds one answers it too, and is never
 * named as stepping out.
 *
 * When every facilitator of the group holds a place in it, nobody steps out,
 * and the line says so: "Priya takes it too, so nobody steps out of the
 * room." (listed in the build notes for the boards' designers to confirm).
 * Nothing at all while who steps out is not known, or the group has no
 * facilitator: never a guess.
 */
function leaveYouWords(
  facilitators: { stepOut: readonly string[]; takePart: readonly string[] } | null,
  minutes: number,
  online: boolean,
): string | null {
  if (!facilitators) return null;
  const { stepOut, takePart } = facilitators;
  if (stepOut.length > 0) {
    const one = stepOut.length === 1;
    const away = online ? `${one ? "steps" : "step"} away from the call` : `${one ? "steps" : "step"} out of the room`;
    return `${andWords(stepOut)} ${one ? "leaves" : "leave"} you ${forWords(minutes)} for it and ${away}`;
  }
  if (takePart.length === 0) return null;
  const nobody = online ? "nobody steps away from the call" : "nobody steps out of the room";
  return `${andWords(takePart)} ${takePart.length === 1 ? "takes" : "take"} it too, so ${nobody}`;
}

/**
 * The card in the last week, over its button: "At the end of tonight’s
 * session: the same 6 questions as week 1, then how it went. About 5
 * minutes. Rahul and Sofia leave you 5 minutes for it and step out of the
 * room." `when` is "tonight" or "today" on the last session's own day (the
 * notice's rule: "tonight" from 5pm), or the day before it comes ("At the
 * end of your last session, on Tue 8 Dec: ..."). An online session's
 * facilitators "step away from the call". Who steps out is `leaveYouWords`'.
 */
export function endCardLastWeekWords(input: {
  when: "tonight" | "today" | { day: string };
  questions: number;
  sameAsStart: number;
  minutes: number;
  /** The group's facilitators' first names, split by `whoStepsOut`; null while not known. */
  facilitators: { stepOut: readonly string[]; takePart: readonly string[] } | null;
  online: boolean;
}): string {
  const at =
    input.when === "tonight"
      ? "At the end of tonight’s session"
      : input.when === "today"
        ? "At the end of today’s session"
        : `At the end of your last session, on ${input.when.day}`;
  const leave = leaveYouWords(input.facilitators, input.minutes, input.online);
  return `${at}: ${endCardAsksWords(input)}. ${aboutWords(input.minutes)}.${leave ? ` ${leave}.` : ""}`;
}

/** Under the button in the last week: "It closes on Fri 18 Dec." */
export function endCardClosesWords(closesOn: string): string {
  return `It closes on ${closesOn}.`;
}

/**
 * Once the programme is over (en-after-nofinish-phone): "The same 6
 * questions as week 1, then how it went. About 5 minutes. It closes on Fri
 * 18 Dec."
 */
export function endCardAfterWords(input: { questions: number; sameAsStart: number; minutes: number; closesOn: string | null }): string {
  const asks = endCardAsksWords(input);
  const parts = [`${asks.charAt(0).toUpperCase()}${asks.slice(1)}.`, `${aboutWords(input.minutes)}.`];
  if (input.closesOn) parts.push(endCardClosesWords(input.closesOn));
  return parts.join(" ");
}

/** Once they have sent it: "Sent Tue 8 Dec. Thank you." ("Sent. Thank you." when the day is not on record.) */
export function endCardSentWords(sentOn: string | null): string {
  return sentOn ? `Sent ${sentOn}. Thank you.` : "Sent. Thank you.";
}

/** Under it: "It’s here until Sat 9 Dec 2028, when your name comes off your answers." */
export function endCardKeptWords(keptUntil: string): string {
  return `It’s here until ${keptUntil}, when your name comes off your answers.`;
}

// ---------------------------------------------------------------------------
// The leaving survey's tab, for admins (Q46): opened, never sent
// ---------------------------------------------------------------------------

export const OPEN_WORDS = {
  /** The tab that is a sent survey's Send. */
  tab: "Open",
  heading: "Open it",
  how:
    "Nobody presses send. Once it’s open, everybody who leaves the programme by their own hand gets their own link to it: " +
    "on the page that says they left, and in the email that says so. Nobody who stays is sent it, and it has no closing day.",
  fixes: "Opening it fixes its questions and words, as sending does. Nobody is emailed when you press it.",
  see: "See it as people will",
  open: "Open it",
  opening: "Opening…",
  failed: "It couldn’t be opened. Try again in a minute.",
  unreachable: "It couldn’t be opened. Check your connection and try again.",
  reached: "Reached",
} as const;

/** "Everyone who leaves AGI Strategy", who a leaving survey is for. */
export function leaversWords(programmeName: string): string {
  return `Everyone who leaves ${programmeName}`;
}

/** "Open since Thu 29 Oct." */
export function openSinceWords(at: Date): string {
  return `Open since ${dayWords(at)}.`;
}

/** "3 people have left since it opened, and 1 has answered." ("and nobody has answered yet" for none.) */
export function reachedWords(reached: number, answered: number): string {
  const left = reached === 1 ? "1 person has left" : `${reached} people have left`;
  const told = answered === 0 ? "nobody has answered yet" : answered === 1 ? "1 has answered" : `${answered} have answered`;
  return reached === 0 ? "Nobody has left since it opened." : `${left} since it opened, and ${told}.`;
}

// ---------------------------------------------------------------------------
// Reaching somebody who left (Q46): the page that says they left, and the
// leaving email
// ---------------------------------------------------------------------------

/**
 * The leaving survey's card on the page that says somebody left
 * (wk-left-phone). The board drew "Tell us why, anonymously" and "This survey
 * never records who answers, even when you’re signed in.", which are untrue
 * of a confidential survey (Q46): these are the nearest true words, listed in
 * the build notes for the boards' designers to confirm.
 */
export const LEAVING_CARD_WORDS = {
  heading: "Tell us why",
  answer: "Answer",
} as const;

/** "3 questions, about a minute. It’s confidential: only NAISI’s admins can see who said what." */
export function leavingCardLine(size: string): string {
  return `${size}. It’s confidential: only NAISI’s admins can see who said what.`;
}

/**
 * The leaving email's line for the leaving survey, around the person's own
 * link, in place of the outside form's: "We’d like to know why you left, so
 * we can do better: tell us in 3 questions, about a minute. It’s
 * confidential: ...". Not drawn on any board: written in the boards' voice.
 */
export function leavingEmailWords(questions: number, minutes: number): { before: string; text: string; after: string } {
  return {
    before: "We’d like to know why you left, so we can do better:",
    text: `tell us in ${questionsWords(questions)}`,
    after: `, ${minutesWords(minutes)}. It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.`,
  };
}

// ---------------------------------------------------------------------------
// A programme's survey results, for its lead (Q49 A)
// ---------------------------------------------------------------------------

export const LEAD_RESULTS_WORDS = {
  line: "Totals and comments, never a name, from the first answer. Only the programme’s lead and NAISI’s admins see them; facilitators never do.",
  notYours: "Only the programme’s lead and admins read its survey results.",
  notHere: "That survey isn’t one of this programme’s.",
} as const;

// ---------------------------------------------------------------------------
// The lead's Surveys tab (sv-programme, Q41, Q49 A)
// ---------------------------------------------------------------------------

/**
 * The words of a programme lead's Surveys tab: the board's where it draws
 * them. Where the records hold something other than what the board drew (the
 * questionnaire replaced the board's questions, and Q41 and Q49 took away
 * the floors and the wait for a survey to close), the words are in the
 * board's voice, listed in the build notes for the boards' designers to
 * confirm.
 */
export const LEAD_TAB_WORDS = {
  changed: "What changed",
  seeBeforeAndAfter: "See before and after",
  noneBoth: "Nobody has answered both the before and the after yet.",
  /**
   * What changed, when people answered both surveys and nobody answered the
   * questions it compares both times, so there is no row to draw (B2).
   */
  noneCompared: "Nobody has answered the questions on career plans or confidence both times yet.",
  careerPlans: "Career plans",
  considering: "Considering, planning or already doing it",
  confidence: "Confidence and knowledge",
  /** C4, in public numbers' words for it. */
  explaining: "Explaining the case that advanced AI could be catastrophic, and the main objections",
  beliefs: "Beliefs about AI",
  beliefsTitle: "What people think about AI",
  seeBeliefs: "See them at the start and the end",
  surveys: "This programme’s surveys",
  surveysLine: "Results show as answers come in, never with a name.",
  nothingSent: "No survey has gone out for this programme yet.",
  seeResults: "See results",
  ratingsTitle: "Ratings",
  ratingsLine: "What each group’s facilitators said about their fellows, and your own ratings of the facilitators.",
  seeRatings: "See ratings",
  anonymousTitle: "What to keep, change and drop",
  anonymousLine: "Answers to the anonymous form the survey at the end links to.",
  seeAnswers: "See answers",
  howItWent: "How it went",
  weeks: "The weeks",
  outOf5: "Out of 5",
  sources: "Sources people rated",
  sourcesLine: "From the ratings on each week’s page: totals, never a name, out of 5. A source shows once 3 people have rated it.",
  highest: "Rated highest",
  lowest: "Rated lowest",
  facilitators: "Your facilitators",
  onlyYou: "Only you and admins",
  facilitatorsNote: "Your facilitators don’t see this. Pass on the gist in your own words, never fellows’ words or the numbers.",
  inTheirWords: "In their words",
  noComments: "Nobody has written anything here yet.",
  refusalTitle: "Only the programme’s lead and admins can open Surveys",
  refusalBody: "Surveys shows the totals and comments of the programme’s surveys, so only the programme’s lead or an admin can open it.",
  refusalAction: "Go to applications",
} as const;

/** "23 of 31 have answered.": how many have answered of the people it was sent to, as the Send tab says it. */
export function haveAnsweredWords(answered: number, of: number): string {
  return `${answered} of ${of} have answered.`;
}

/** The same sentence in its two parts, for a card that sets the count apart: "23 of 31" and "have answered.". */
export function haveAnsweredParts(answered: number, of: number): { count: string; rest: string } {
  return { count: `${answered} of ${of}`, rest: "have answered." };
}

/**
 * "The after survey" on the lead's Overview once the programme is over
 * (en-finish): how many have answered, and the way to the Surveys tab. The
 * board's "Results show in Surveys once it closes on Fri 18 Dec, so nobody can
 * be worked out from one new answer." and "Totals show from 3 answers,
 * comments from 5." were taken away by Q49 A (results as answers come in) and
 * Q41 (no floors), so the line says what the tab does, in its own words:
 * listed in the build notes for the boards' designers to confirm.
 */
export const AFTER_SURVEY_CARD_WORDS = {
  heading: "The after survey",
  resultsBefore: "Results show in ",
  resultsLink: "Surveys",
  resultsAfter: " as answers come in, never with a name.",
} as const;

/** "25 answered both the before and the after. Only they are compared." */
export function answeredBothWords(n: number): string {
  return `${n} answered both the before and the after. Only they are compared.`;
}

/** "12 moved up a stage, 11 stayed, 2 moved down." */
export function stagesMovedWords(up: number, same: number, down: number): string {
  return `${up} moved up a stage, ${same} stayed, ${down} moved down.`;
}

/** "22 of 25 moved up." */
export function ofMovedUpWords(up: number, of: number): string {
  return `${up} of ${of} moved up.`;
}

/** "Beliefs are reported, never targets: the fellowship doesn’t aim to move them one way." */
export function beliefsLineWords(kind: SurveyProgrammeKind): string {
  return `Beliefs are reported, never targets: the ${kind} doesn’t aim to move them one way.`;
}

/** "29 of 32 answered · closed Wed 4 Nov", "3 of 8 answered · closes Wed 4 Nov", "1 of 1 answered · no closing date". */
export function leadSurveyLineWords(answers: number, of: number, closes: Date | null, closed: boolean): string {
  const when = closes ? `${closed ? "closed" : "closes"} ${dayWords(closes)}` : "no closing date";
  return `${answers} of ${of} answered · ${when}`;
}

/** "27 answers", the count beside a section's heading. */
export function answersCountWords(n: number): string {
  return `${n} ${n === 1 ? "answer" : "answers"}`;
}

/** "4.4", one decimal, always. */
export function oneDecimalWords(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** "Average, out of 5 · 27 answers". */
export function averageOutOfWords(max: number, answers: number): string {
  return `Average, out of ${max} · ${answersCountWords(answers)}`;
}

/** "Averages, from 1 Not valuable to 5 Very valuable." */
export function averagesFromWords(min: number, minLabel: string, max: number, maxLabel: string): string {
  return `Averages, from ${min}${minLabel ? ` ${minLabel}` : ""} to ${max}${maxLabel ? ` ${maxLabel}` : ""}.`;
}

/** "Net promoter score +40, from 25 answers: the share at 9 or 10 less the share at 0 to 6." */
export function promoterScoreWords(score: number, answers: number): string {
  return `Net promoter score ${score > 0 ? `+${score}` : score}, from ${answers} answers: the share at 9 or 10 less the share at 0 to 6.`;
}

/**
 * The caption under the facilitator line: its scale, the question it is a
 * line of, and that it is every group's answers together. "Average out of 5,
 * from 1 Not valuable to 5 Very valuable, of “How valuable was each part?” in
 * the survey at the end. Every group’s answers together, not each
 * facilitator’s."
 */
export function facilitatorLineWords(question: string, max: number, minLabel: string, maxLabel: string): string {
  const scale = `from 1${minLabel ? ` ${minLabel}` : ""} to ${max}${maxLabel ? ` ${maxLabel}` : ""}`;
  return `Average out of ${max}, ${scale}, of “${question}” in the survey at the end. Every group’s answers together, not each facilitator’s.`;
}

/** "24 ratings". */
export function ratingsCountWords(n: number): string {
  return `${n} ${n === 1 ? "rating" : "ratings"}`;
}

/** "5 of 18", the comments shown of a question's. */
export function shownOfWords(shown: number, total: number): string {
  return `${shown} of ${total}`;
}

/** "See all 18". */
export function seeAllWords(total: number): string {
  return `See all ${total}`;
}

// ---------------------------------------------------------------------------
// One person's answers, for admins (sv-person)
// ---------------------------------------------------------------------------

/**
 * The page an admin opens from Who answered: one person's answers to each of
 * a programme's surveys, the change questions start and end side by side, or
 * to a survey after an event. The board's words where it draws them; where it
 * draws none (a follow-up's column, a survey not answered, nothing to open),
 * words in its voice, listed in the build notes for the boards' designers to
 * confirm. No pronoun stands for the person: the site does not know theirs.
 */
export const PERSON_WORDS = {
  /** While the opening is being recorded and the answers read. */
  opening: "Opening the answers…",
  /** The page's heading when nothing was opened. */
  heading: "One person’s answers",
  notice: "Only admins can open one person’s answers, and each opening is logged.",
  usually: "Usually for a request to see or delete someone’s answers.",
  changeTitle: "The change questions",
  question: "Question",
  noAnswer: "No answer",
  notAnswered: "Not answered",
  notSent: "Not sent",
  namesOffTitle: "Names come off",
  stayInTotals: "Their answers stay in the totals.",
  whoOpenedTitle: "Who has opened this",
  tryAgain: "Try again",
  /** The person's name, when their account is gone. */
  accountGone: "A deleted account",
  /** A guest the event's list no longer holds, as Who answered names them. */
  guestGone: "A guest no longer on the list",
  notRecorded: "We couldn’t record that you opened these answers, so they stay closed. Try again.",
  nobodyHere: "There’s nobody by that address on this survey.",
  namesOff: "Names have come off this survey’s answers, so there are none of anybody’s to open. The answers stay in the totals.",
  deleted: "This account has been deleted, so its name has come off its answers and there are none to open.",
} as const;

/** Each survey's column, by its kind: "Start" and "End" as the board draws them. */
export const PERSON_COLUMN_WORDS: Record<SurveyKind, string> = {
  before: "Start",
  after: "End",
  followUp6: "Six months on",
  followUp12: "A year on",
  leaving: "Leaving",
  event: "Answers",
};

/** "Only admins can open one person’s answers, and each opening is logged. You opened this at 11:04am." */
export function personNoticeWords(at: Date): string {
  return `${PERSON_WORDS.notice} You opened this at ${clockWords(at)}.`;
}

/** "The same 6 at the start and at the end." */
export function sameQuestionsWords(n: number): string {
  return n === 1 ? "The same question at the start and at the end." : `The same ${n} at the start and at the end.`;
}

/** "The after survey only.", under a survey's own questions beside the change questions. */
export function onlyThisSurveyWords(kind: "before" | "after"): string {
  return `The ${STAGE_WORDS[kind].name} survey only.`;
}

/** "Answered both", "Answered all 3", "Answered", "Answered 1 of 2", "Hasn’t answered". */
export function answeredSummaryWords(answered: number, of: number): string {
  if (answered === 0) return "Hasn’t answered";
  if (answered < of) return `Answered ${answered} of ${of}`;
  if (of === 1) return "Answered";
  return of === 2 ? "Answered both" : `Answered all ${of}`;
}

/** "Sent Thu 29 Oct, 9am. Not answered.", for a survey somebody was sent and has not answered. */
export function sentNotAnsweredWords(sentAt: Date | null): string {
  return sentAt ? `Sent ${dayAndClockWords(sentAt)}. ${PERSON_WORDS.notAnswered}.` : `${PERSON_WORDS.notAnswered}.`;
}

/** "Amara’s name comes off on Sat 9 Dec 2028." */
export function nameComesOffWords(firstName: string, key: string): string {
  return `${firstName}’s name comes off on ${dateKeyWords(key)}.`;
}

/** "AGI Strategy: before, Sat 9 Dec 2028", when the person's surveys come off on different days. */
export function surveyComesOffWords(surveyName: string, key: string): string {
  return `${surveyName}, ${dateKeyWords(key)}`;
}

/** "Zach Levin · Mon 21 Dec, 11:04am", one opening in Who has opened this. */
export function openingLineWords(name: string, at: Date | null): string {
  return at ? `${name} · ${dayAndClockWords(at)}` : name;
}

/** "Amara Okafor has no answers here to open." */
export function nothingToOpenWords(name: string): string {
  return `${name} has no answers here to open.`;
}

/** "End: Since the programme started, have you…", when the end's wording of a change question differs. */
export function otherWordingWords(column: string, title: string): string {
  return `${column}: ${title}`;
}

/**
 * The scale under a question, from its own words: "1 Not at all to 5 Very",
 * "1 Poor to 5 Excellent", "Pick any". Nothing for a choose-one, a text or a
 * number.
 */
export function personScaleWords(question: SurveyQuestion): string {
  switch (question.type) {
    case "lines": {
      const low = question.scale.points?.[0] ?? question.scale.minLabel;
      const high = question.scale.points?.[question.scale.max - 1] ?? question.scale.maxLabel;
      return low && high ? `1 ${low} to ${question.scale.max} ${high}` : `1 to ${question.scale.max}`;
    }
    case "rating": {
      const max = question.rating?.max ?? 5;
      const low = question.rating?.minLabel ?? "";
      const high = question.rating?.maxLabel ?? "";
      return low && high ? `1 ${low} to ${max} ${high}` : `1 to ${max}`;
    }
    case "scale": {
      const low = question.anchors.find((anchor) => anchor.at === question.min)?.label ?? "";
      const high = question.anchors.find((anchor) => anchor.at === question.max)?.label ?? "";
      return low && high ? `${question.min} ${low} to ${question.max} ${high}` : `${question.min} to ${question.max}`;
    }
    case "percent":
      return question.ends.min && question.ends.max ? `0% ${question.ends.min} to 100% ${question.ends.max}` : "0 to 100%";
    case "multipleChoice":
      return questionTypeWords(question);
    default:
      return "";
  }
}
