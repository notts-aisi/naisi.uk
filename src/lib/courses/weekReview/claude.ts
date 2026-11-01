import "server-only";
import { askClaudeForJson } from "@/lib/ai/claude";
import { FAIRNESS } from "@/lib/courses/coursework/claude";
import type { StoredGrade, StoredHand, StoredTheme } from "@/lib/firestore/courseWeekReviews";
import { readGrades, readHands, readThemes } from "./check";
import type { GradesInput, HandsInput, ThemesInput } from "./input";

/**
 * CLAUDE ON A WEEK (privacy v15): the three asks of the week review, each
 * one request through `askClaudeForJson`, the site's one door to Anthropic,
 * and all three sent side by side so the press fits inside one request to
 * the site. What each is sent is built in `input.ts`; what comes back is
 * checked in `check.ts` before anything is kept. Nothing here stores
 * anything.
 *
 * Every ask carries the coursework fairness lines, and three more where they
 * bite: never quote a check-in, never say who wrote one, and rest who might
 * need a hand on answers and reports alone (that request is sent no
 * check-in at all).
 */

const NEVER_QUOTE = "Never quote a check-in: say what check-ins say in your own words.";
const NEVER_ATTRIBUTE = "Never say or guess who wrote a check-in. Check-ins carry no name or number for a person on purpose.";
const ONLY_ANSWERS_AND_REPORTS = "Rest who might need a hand only on the fellow's own answers and on what facilitators' reports say about them.";

const SOCIETY = "NAISI, a student AI safety society at the University of Nottingham";

const GRADES_SYSTEM = [
  `You help the admins of ${SOCIETY} choose which written answers on one of its courses to read first.`,
  'You are given one week\'s written-answer questions (Q1, Q2 and so on) and every answer sent to each, each answer labelled only by an id ("A12"). Nothing tells you who wrote an answer, on purpose: judge each answer on its own.',
  "Give every answer a draft grade from 1 to 10, a whole number, on the team's scale: 1 barely engages with the question; 4 engages, but stays general or misreads the material; 7 is a clear, specific answer that uses the week's material well; 10 is exceptional thinking, precise, original and well argued. Grade every answer you are given, once each.",
  "A draft grade only helps the team choose what to read first. It is never shown to the writer and never becomes a mark.",
  FAIRNESS,
].join("\n\n");

const GRADES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["grades"],
  properties: {
    grades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["answer", "grade"],
        properties: { answer: { type: "string" }, grade: { type: "integer" } },
      },
    },
  },
};

const THEMES_SYSTEM = [
  `You help the admins of ${SOCIETY} see what the people on one of its courses found hard in one week.`,
  'You are given the week\'s parts (P1, P2 and so on) and questions (Q1, Q2), the answers and reflections people sent (each by an id like "A12", with the question it answers and its writer\'s group), the check-ins people answered at the end of their group\'s session, pooled by group ("C4"), and what each group\'s facilitator reported after the session ("R2").',
  "Name up to six things that several people found hard this week, the most widespread first. For each: a short title of under ten words; the part of the week it is about, by its P label, or an empty string when none fits; the ids it rests on, as answers, check-ins and reports; and one sentence saying what the difficulty was. Name only something more than one item supports, and cite only ids you were given.",
  NEVER_QUOTE,
  NEVER_ATTRIBUTE,
  'Refer to groups only by their labels ("Group 3"), and never guess who anybody is.',
  FAIRNESS,
].join("\n\n");

const THEMES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themes"],
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "part", "answers", "checkIns", "reports", "detail"],
        properties: {
          title: { type: "string" },
          part: { type: "string" },
          answers: { type: "array", items: { type: "string" } },
          checkIns: { type: "array", items: { type: "string" } },
          reports: { type: "array", items: { type: "string" } },
          detail: { type: "string" },
        },
      },
    },
  },
};

const HANDS_SYSTEM = [
  `You help the admins of ${SOCIETY} notice who on one of its courses might need a hand this week, so that a person can look.`,
  'You are given the week\'s questions, the answers and reflections people sent (each by an id like "A12", labelled with the fellow who wrote it, "Fellow 3", the same fellow everywhere, and their group), and what each group\'s facilitator reported after the session ("R2"), with the people it names as labels.',
  "Name the fellows whose own writing, or what a report says about them, suggests they might need a hand: struggling with the material, falling behind, or seeming lost or discouraged. For each, one plain sentence saying what you noticed, and the ids it rests on: their own answers, and the reports that speak of them. Name nobody the writing gives no reason to: a short or plain answer is not a reason on its own. At most fifteen, the most in need first.",
  ONLY_ANSWERS_AND_REPORTS,
  "This is a reason for a person to look, never a judgement about anybody. Refer to people only by their labels, and never guess who anybody is.",
  FAIRNESS,
].join("\n\n");

const HANDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hands"],
  properties: {
    hands: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fellow", "why", "answers", "reports"],
        properties: {
          fellow: { type: "string" },
          why: { type: "string" },
          answers: { type: "array", items: { type: "string" } },
          reports: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

/** How long each of the three may take: side by side, inside the route's limit. */
const CALL_MS = 230_000;

type Asked<T> = { ok: true; value: T; model: string } | { ok: false; reason: string };

/** Draft grades for the week's written answers, checked. */
export async function askForGrades(input: GradesInput): Promise<Asked<StoredGrade[]>> {
  const answer = await askClaudeForJson({
    system: GRADES_SYSTEM,
    message: input.message,
    schema: GRADES_SCHEMA,
    effort: "medium",
    maxTokens: 8_000,
    timeoutMs: CALL_MS,
  });
  if (!answer.ok) return answer;
  return { ok: true, value: readGrades(answer.value, input), model: answer.model };
}

/** What people found hard, checked. */
export async function askForThemes(input: ThemesInput): Promise<Asked<StoredTheme[]>> {
  const answer = await askClaudeForJson({
    system: THEMES_SYSTEM,
    message: input.message,
    schema: THEMES_SCHEMA,
    effort: "medium",
    maxTokens: 6_000,
    timeoutMs: CALL_MS,
  });
  if (!answer.ok) return answer;
  return { ok: true, value: readThemes(answer.value, input), model: answer.model };
}

/** Who might need a hand, checked. */
export async function askForHands(input: HandsInput): Promise<Asked<StoredHand[]>> {
  const answer = await askClaudeForJson({
    system: HANDS_SYSTEM,
    message: input.message,
    schema: HANDS_SCHEMA,
    effort: "medium",
    maxTokens: 6_000,
    timeoutMs: CALL_MS,
  });
  if (!answer.ok) return answer;
  return { ok: true, value: readHands(answer.value, input), model: answer.model };
}

/** The system prompts, for the tests that read every line that would go. */
export const WEEK_REVIEW_SYSTEMS = { grades: GRADES_SYSTEM, themes: THEMES_SYSTEM, hands: HANDS_SYSTEM } as const;
