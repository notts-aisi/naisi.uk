import "server-only";
import { askClaudeForJson } from "@/lib/ai/claude";

/**
 * CLAUDE ON COURSEWORK (privacy v13): the two asks, each one request through
 * `askClaudeForJson`, the site's one door to Anthropic. What they are sent is
 * built in `model.ts` (labels, never names) from counted answers only; this
 * file says what is asked and checks what comes back. Nothing here stores
 * anything: the callers decide (the profile's note draft is never stored; an
 * end-of-week note's draft and the best answers are kept with the run).
 *
 * Both are told the same three things the applications feature tells Claude:
 * never judge somebody's English, never judge whether AI wrote anything, and
 * a thin answer is thin.
 */

/** The fairness lines every coursework request carries, the week review's among them. */
export const FAIRNESS = [
  "Never mark anybody down for their English: many are writing in a second language.",
  "Never say or guess whether anything was written with AI. That is not your question.",
  "Judge what people think and how they engage with the material, not how polished the prose is. A thin or generic answer is thin, however well written.",
  "Write in plain British English. Never use an em dash or an en dash.",
].join(" ");

const NOTE_SYSTEM = [
  "You help the admins of NAISI, a student AI safety society at the University of Nottingham, keep short notes about the people on its courses.",
  "You are given one fellow's submitted coursework from one programme, week by week: their written answers, reflections and boxes they filled in, each under the question it answers. Under the work is what people on the team said about it: written feedback, each from \"their facilitator\", \"the programme's lead\" or \"an admin\", and ratings from 1 to 10 on the team's scale, each by a rater with a number (\"Rater 1\", the same rater everywhere), their role and a comment.",
  "Write a short note for other admins about this fellow: how they engage with the course, the strengths their work shows, anything worth following up, and whether they might one day facilitate a group or help run the society. For that last point the committee cares about values and engagement, not only polish.",
  "The team's feedback, ratings and comments are other people's views of the work, not facts about the fellow. Weigh them as views beside the work itself, and when a point comes from the team, say whose view it is.",
  "Refer to the person only as \"the fellow\", and to a rater only by their number (\"Rater 1\"). Labels like \"another fellow\", \"a facilitator\" or \"someone running the programme\" stand for other people: never guess who anybody is.",
  "Base everything on the work and the team's words shown. Only some of their work may be shown, on purpose, so never treat a missing answer as one they skipped.",
  FAIRNESS,
  "Keep it under 150 words, in two or three short paragraphs, with no headings and no lists.",
].join("\n\n");

const NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["note"],
  properties: { note: { type: "string" } },
};

/** Claude's draft of a note and the model that wrote it, or the reason there is none. */
export async function askForNoteDraft(message: string): Promise<{ ok: true; note: string; model: string } | { ok: false; reason: string }> {
  const answer = await askClaudeForJson({
    system: NOTE_SYSTEM,
    message,
    schema: NOTE_SCHEMA,
    effort: "medium",
    maxTokens: 2_000,
    timeoutMs: 150_000,
  });
  if (!answer.ok) return answer;
  const note = (answer.value as { note?: unknown } | null)?.note;
  if (typeof note !== "string" || !note.trim()) return { ok: false, reason: "Claude’s answer couldn’t be read. Try again." };
  return { ok: true, note: note.trim(), model: answer.model };
}

const BEST_SYSTEM = [
  "You help the lead and the admins of a NAISI course (a student AI safety society at the University of Nottingham) see the strongest thinking in a week's coursework across a whole programme.",
  "You are given one week's questions (Q1, Q2 and so on) and every answer to each, labelled by the fellow who wrote it (\"Fellow 3\"; the same fellow has the same label on every question).",
  "For each question, pick up to three of the strongest answers, each with a one-line reason saying what makes it strong. Pick fewer when fewer are strong; pick none when none is. Only pick a label that answered that question.",
  "Then write one or two sentences on what the people on the programme as a whole found hard this week, from the answers.",
  "Refer to people only by their labels. Never guess who anybody is.",
  FAIRNESS,
].join("\n\n");

const BEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions", "hard"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "picks"],
        properties: {
          question: { type: "string" },
          picks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["fellow", "reason"],
              properties: { fellow: { type: "string" }, reason: { type: "string" } },
            },
          },
        },
      },
    },
    hard: { type: "string" },
  },
};

export type BestAnswersAnswer = {
  /** By question label ("Q1"): up to three picks, each a fellow's label and a reason. */
  picks: Record<string, Array<{ label: string; reason: string }>>;
  hard: string;
  model: string;
};

/**
 * Claude's picks, checked: only questions that were asked, only labels that
 * answered that question, at most three each, one per fellow, reasons on one
 * line and cut short.
 */
export async function askForBestAnswers(
  message: string,
  answered: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<{ ok: true; answer: BestAnswersAnswer } | { ok: false; reason: string }> {
  const answer = await askClaudeForJson({
    system: BEST_SYSTEM,
    message,
    schema: BEST_SCHEMA,
    effort: "medium",
    maxTokens: 6_000,
    timeoutMs: 200_000,
  });
  if (!answer.ok) return answer;
  return { ok: true, answer: { ...readBestAnswers(answer.value, answered), model: answer.model } };
}

const oneLine = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** What came back, kept to what fits. Pure: exported for the tests. */
export function readBestAnswers(
  value: unknown,
  answered: ReadonlyMap<string, ReadonlySet<string>>,
): Omit<BestAnswersAnswer, "model"> {
  const raw = (value && typeof value === "object" ? value : {}) as { questions?: unknown; hard?: unknown };
  const picks: BestAnswersAnswer["picks"] = {};
  for (const entry of Array.isArray(raw.questions) ? raw.questions : []) {
    const question = oneLine((entry as { question?: unknown })?.question, 10);
    const labels = answered.get(question);
    if (!labels || picks[question]) continue;
    const kept: Array<{ label: string; reason: string }> = [];
    for (const pick of Array.isArray((entry as { picks?: unknown }).picks) ? (entry as { picks: unknown[] }).picks : []) {
      const label = oneLine((pick as { fellow?: unknown })?.fellow, 20);
      const reason = oneLine((pick as { reason?: unknown })?.reason, 300);
      if (!labels.has(label) || !reason || kept.some((other) => other.label === label)) continue;
      kept.push({ label, reason });
      if (kept.length === 3) break;
    }
    picks[question] = kept;
  }
  return { picks, hard: oneLine(raw.hard, 600) };
}
