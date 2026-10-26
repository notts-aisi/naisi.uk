import type { SurveyAudience, SurveyProgrammeKind } from "@/lib/firestore/surveys";
import type { SurveyChoiceQuestion, SurveyQuestion } from "./items";
import type { IncubatorStrand, SurveyStage } from "./templates";

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
 * survey page's card for its template.
 */
export const STAGE_WORDS: Record<SurveyStage, { name: string; title: string; card: string; cardLine: string }> = {
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
};

/** "AGI Strategy: before", the admins' name for a programme's survey at a stage. */
export function surveyNameFor(programmeName: string, stage: SurveyStage): string {
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
export function introFor(stage: SurveyStage, questions: number, minutes: number): string {
  const size = `It’s ${questionsWords(questions)} and takes ${minutesWords(minutes)}.`;
  switch (stage) {
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
  skippable: "Every question can be skipped.",
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
} as const;

/** "Page 1 of 3". */
export function pageWords(n: number, of: number): string {
  return `Page ${n} of ${of}`;
}

/** "Pick up to 3", above a pick-any question with a limit. */
export function pickUpToWords(n: number): string {
  return `Pick up to ${n}`;
}

/** "It closes on Wed 4 Nov. Once sent, your answers can’t change." */
export function closingWords(closesAt: Date): string {
  return `It closes on ${dayWords(closesAt)}. Once sent, your answers can’t change.`;
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
  /** Which of the programme's surveys it is: a follow-up compares with what was said during it. */
  stage?: SurveyStage;
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
  points.push(
    "Nothing you say here affects your place or a future application.",
    "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.",
    `Your name comes off on ${dateKeyWords(facts.namesOffOn)}, two years after the ${facts.programmeKind} ends. The totals stay.`,
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
  lede: "Only admins make and send surveys.",
  newSurvey: "New survey",
  kairos: "Kairos",
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
  namesOff: "Names come off",
  labelled: "Answers sent after someone’s first session are labelled, so the comparison can leave them out.",
  close: "Close it now",
  closeConfirm: "Close it now: no more answers",
  closeKeep: "Keep it open",
  closeSure: "Nobody will be able to answer after this, and it can’t be opened again.",
  closedNow: "Closed. It takes no more answers.",
} as const;

/** Who a survey reaches, in the Send tab's words, by who it is for and when. */
export type AudienceKind = "start" | "end" | "followUps";

/** Which of the three a survey's audience and stage make it. */
export function audienceKindOf(audience: SurveyAudience, stage: SurveyStage): AudienceKind {
  if (audience.kind === "followUps") return "followUps";
  return stage === "after" ? "end" : "start";
}

const HOLDING: Record<AudienceKind, string> = {
  start: "holding a place",
  end: "still holding a place",
  followUps: "who said yes to follow-ups",
};

const JOINED: Record<AudienceKind, string> = {
  start: "who joined since",
  end: "who joined since",
  followUps: "who said yes since",
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

/** "20 of 32 have answered. It closes on Wed 4 Nov." */
export function progressWords(answered: number, of: number, closesAt: Date, closed: boolean): string {
  return `${answered} of ${of} have answered. ${closed ? `It closed on ${dayWords(closesAt)}.` : `It closes on ${dayWords(closesAt)}.`}`;
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

/** "12 answers from the 20 people it was sent to (60%)." */
export function answersRateWords(answers: number, sent: number): string {
  if (answers === 0) return sent > 0 ? `No answers yet from the ${peopleWords(sent)} it was sent to.` : "No answers yet.";
  const counted = `${answers} ${answers === 1 ? "answer" : "answers"}`;
  return sent > 0 ? `${counted} from the ${peopleWords(sent)} it was sent to (${rateOf(answers, sent)}).` : `${counted}.`;
}

/** "12 answered, 60% of the 20 it was sent to", beside each question. */
export function answeredRateWords(n: number, sent: number, verb = "answered"): string {
  return sent > 0 ? `${n} ${verb}, ${rateOf(n, sent)} of the ${sent} it was sent to` : `${n} ${verb}`;
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
  consentNoRow: "You weren’t sent the survey that asks this, so there’s nothing to change.",
} as const;

/** The count on the button no longer matches: nothing was sent, and the page is told the new number. */
export function countChangedWords(now: number): string {
  return `Nothing was sent: the number of people this reaches is now ${now}. Check the list and press again.`;
}
