import { own } from "@/lib/applications/keys";
import type { FormQuestion, RsvpAnswer } from "@/lib/firestore/events";
import type { StaffName } from "@/lib/names/staffName";

/**
 * THE WORDS OF AN EVENT'S SIGN-UP REQUESTS, and which of a request's answers
 * an organiser the Students' Union does not recognise is shown.
 *
 * Pure and client safe: the requests route builds a card's lines with these,
 * the Sign-ups page draws them, and the tests run them.
 */

/** One line of the small card under a request's name. `kind` picks its colour; the words say it. */
export type AboutKind = "place" | "facilitates" | "offered" | "member" | "notMember" | "guest";

export type AboutLine = { kind: AboutKind; words: string };

export const REQUEST_WORDS = {
  /** Somebody who asked without signing in: nothing ties the request to an account. */
  guest: "Guest, no account",
  /** Holds SU membership this year, as everybody but an admin is told it. */
  member: "SU member",
  notMember: "Not an SU member",
  /** Where an admin is told the membership came from: the SU's list of people who bought it. */
  bought: "SU member: bought",
  /** An admin recorded it by hand. */
  byAdmin: "SU member: marked by an admin",
  /** On the SU's list with a tier that was not bought (comped or staff). */
  fromList: "SU member: on the SU’s list",
  /** Their application said yes to facilitating. Admins only. */
  offered: "Offered to facilitate",
  /** What a place on a programme says before Publish has told its owner a group, or when it has none. */
  notInGroup: "not in a group yet",
} as const;

/** "AGI Strategy · Group K", or "AGI Strategy · not in a group yet". */
export function placeWords(programme: string, group: string | null): string {
  return `${programme} · ${group ?? REQUEST_WORDS.notInGroup}`;
}

/** "Facilitator · AGI Strategy, Group C". */
export function facilitatesWords(programme: string, group: string): string {
  return `Facilitator · ${programme}, ${group}`;
}

/** "Open Priya Shah’s page": the way to an admin's page for the person, by their name, never a pronoun. */
export function openPageWords(name: string): string {
  return `Open ${name}’s page`;
}

/** "Waiting for a decision (4)". */
export function waitingHeading(count: number): string {
  return `Waiting for a decision (${count})`;
}

/** "Sign-ups · 4 waiting", or "Sign-ups" with nobody waiting: the editor's way to the page. */
export function signupsButtonWords(waiting: number): string {
  return waiting > 0 ? `Sign-ups · ${waiting} waiting` : "Sign-ups";
}

/**
 * The head of the Sign-ups page: "21 confirmed of 30", "4 waiting", "3 on the
 * waiting list". With no limit on places, "21 confirmed". Nobody waiting, and
 * nobody on the waiting list, say nothing.
 */
export function signupCountWords(counts: {
  confirmed: number;
  capacity: number | null;
  waiting: number;
  waitlisted: number;
}): string[] {
  const words = [
    counts.capacity !== null ? `${counts.confirmed} confirmed of ${counts.capacity}` : `${counts.confirmed} confirmed`,
  ];
  if (counts.waiting > 0) words.push(`${counts.waiting} waiting`);
  if (counts.waitlisted > 0) words.push(`${counts.waitlisted} on the waiting list`);
  return words;
}

/** An answer as words: "Yes", "Vegan, Nut allergy", "Other: no onions". Empty for no answer. */
export function answerText(a: RsvpAnswer | undefined): string {
  if (a === undefined || a === null) return "";
  if (typeof a === "string") return a;
  if (typeof a === "boolean") return a ? "Yes" : "No";
  if (Array.isArray(a)) return a.join(", ");
  if (typeof a === "object") {
    const obj = a as { checked?: string[]; other?: string };
    const parts: string[] = [];
    if (Array.isArray(obj.checked) && obj.checked.length > 0) parts.push(...obj.checked);
    if (obj.other) parts.push(`Other: ${obj.other}`);
    return parts.join(", ");
  }
  return "";
}

/**
 * WHETHER A QUESTION MAY CARRY A DIETARY OR ACCESSIBILITY ANSWER.
 *
 * The privacy policy says dietary and accessibility answers are used only to
 * run the event, and an organiser the Students' Union does not recognise is
 * not shown them. An event's questions are written by its organisers, so
 * there is no field that says which ones they are: they are read, and when in
 * doubt a question is counted as one, because leaving an answer out costs the
 * organiser a line and showing one costs the person their health details.
 *
 * Counted as one:
 *  - the allergies checklist, whatever it is called;
 *  - a question whose words (its label, help text or example) are about food,
 *    diet, allergies, health, access, disability or needs;
 *  - a catch-all ("Anything else we should know?", "Notes"), where people
 *    write exactly that;
 *  - a follow-up to one of those ("If yes, please specify").
 */
const ABOUT_FOOD_HEALTH_OR_ACCESS =
  /\b(?:diets?|dietary|allerg\w*|intoleran\w*|foods?|eat|eating|eats|meals?|menu|lunch|dinner|breakfast|snacks?|drinks?|pizzas?|burgers?|toppings?|vegan|vegetarian|pescatarian|halal|kosher|gluten|coeliac|celiac|lactose|dairy|nuts?|access|accessible|accessibility|disab\w*|mobility|wheelchairs?|step-free|hearing|deaf|sight|visual\w*|impair\w*|medical|medication|medicines?|health|conditions?|needs?|requirements?|support|religio\w*|faith)\b/i;

const CATCH_ALL = /\banything else\b|\banything (?:we|i|you) should know\b|\bnotes?\b|\bcomments?\b|\bother information\b/i;

const FOLLOW_UP =
  /^\s*(?:if (?:yes|so|you|any|there)\b|please (?:specify|give|tell|describe|explain|list|say)\b|tell us more\b|give details\b|details\b|which ones?\b|what (?:are|is) (?:they|it)\b|say more\b)/i;

function wordsOf(q: FormQuestion): string {
  const placeholder = "placeholder" in q && typeof q.placeholder === "string" ? q.placeholder : "";
  return [q.label, q.helpText ?? "", placeholder].join(" ");
}

/**
 * The questions of an event that may carry a dietary or accessibility answer,
 * by id. A follow-up counts when the question before it does.
 */
export function foodHealthOrAccessQuestions(questions: readonly FormQuestion[]): Set<string> {
  const out = new Set<string>();
  questions.forEach((q, i) => {
    const words = wordsOf(q);
    const followsOne = i > 0 && out.has(questions[i - 1].id) && FOLLOW_UP.test(q.label);
    if (q.type === "dietaryAllergies" || ABOUT_FOOD_HEALTH_OR_ACCESS.test(words) || CATCH_ALL.test(words) || followsOne) {
      out.add(q.id);
    }
  });
  return out;
}

/** One answer as a request shows it: the question, then what they said. */
export type AnswerLine = { question: string; answer: string };

/** A question before its answer: "Dietary needs:", but "Why would you like to come?" keeps its own mark. */
export function questionLead(question: string): string {
  return /[?:!.]$/.test(question) ? question : `${question}:`;
}

/**
 * A request's answers, in the order the event asks them, leaving out the
 * questions it was not answered. `withFoodHealthAndAccess` is false for an
 * organiser the Students' Union does not recognise, who is shown no answer
 * to a question that may carry dietary or accessibility details.
 */
export function answerLines(
  questions: readonly FormQuestion[],
  answers: Record<string, RsvpAnswer>,
  options: { withFoodHealthAndAccess: boolean },
): AnswerLine[] {
  const hidden = options.withFoodHealthAndAccess ? new Set<string>() : foodHealthOrAccessQuestions(questions);
  const lines: AnswerLine[] = [];
  for (const q of questions) {
    if (hidden.has(q.id)) continue;
    const answer = answerText(own(answers, q.id));
    if (answer) lines.push({ question: q.label.trim() || "A question", answer });
  }
  return lines;
}

/** One request for a place, as the person looking at the Sign-ups page is sent it. */
export type SignupRequestView = {
  /** The sign-up's own id, which Approve and Turn down are addressed by. */
  id: string;
  /** The name by the rule for this viewer: the full name for the committee, else the name people go by. */
  name: StaffName;
  /** When they asked, as an instant; null on a sign-up that never recorded it. */
  askedAt: string | null;
  /** Their address, for admins and SU-recognised committee alone. */
  email: string | null;
  /** Their answers to the event's questions, without dietary and accessibility ones for anybody else. */
  answers: AnswerLine[];
  /** The card. */
  about: AboutLine[];
  /** The person's page, for an admin, when the request has an account. */
  page: string | null;
  /** A test sign-up an admin made. */
  test: boolean;
};

/** What `GET /api/events/[id]/signups` answers. */
export type SignupRequestsAnswer = {
  requests: SignupRequestView[];
  /** Whether the caller may approve and turn down, so the buttons show only for them. */
  decides: boolean;
};
