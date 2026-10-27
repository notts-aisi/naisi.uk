import "server-only";
import { askClaudeForJson } from "@/lib/ai/claude";
import type { ClaudeRead, Lean } from "./types";

/**
 * CLAUDE'S READ OF ONE APPLICATION, for the admin who decides it.
 *
 * It is a reading aid and nothing more. It never fills in a decision, it is
 * shown only to admins, and the privacy policy says a person takes every
 * decision. The prompt holds Claude to what the answers and the reviews say:
 * it is told not to mark anybody down for their English or their polish, not
 * to guess at who they are, and not to guess whether a person used AI, which
 * is Pangram's job and only on answers long enough to check.
 *
 * The system prompt is a constant, so every read is made under the same
 * instructions and a change to them is a change to this file.
 */

const SYSTEM = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), make decisions on applications to its programmes: fellowships and research incubators on AI safety, governance and strategy.

You are given one application, with the programme it is being decided for, and what the committee's reviewers scored and wrote. An admin reads your assessment beside the application and decides. You never decide, and nothing you write is sent to the applicant.

How to assess:
- Judge what the answers show: understanding of the area, quality of thinking, specific engagement with the questions, and how well the person and the programme suit each other. Reward substance over length.
- Do not mark anybody down for their English, their spelling, their writing polish or their background. Many applicants write in a second language.
- Do not guess at a person's age, gender, nationality, health or any other personal characteristic, and do not use any you notice.
- Do not try to judge whether an answer was written with AI. That is checked separately. You may say an answer is generic or does not engage with the question.
- Use the reviewers' scores and comments as evidence, not as the answer. Say plainly where reviewers agree, where they disagree, and whether you agree with them and why.
- Refer to reviewers only by the labels you are given ("Reviewer A"), never "they said" without a label.
- Be concrete: point to what an answer said. Be brief: short sentences, no padding, British English.
- "lean" is your overall view for this programme: "strong" (a clear yes), "borderline" (could go either way), or "weak" (a clear no on this evidence).`;

const LEANS: readonly Lean[] = ["strong", "borderline", "weak"];

const stringList = (description: string) => ({
  type: "array",
  description,
  items: { type: "string" },
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lean", "leanReason", "summary", "strengths", "concerns", "reviewers", "fit", "toWeigh", "thinAnswers"],
  properties: {
    lean: { type: "string", enum: [...LEANS] },
    leanReason: { type: "string", description: "One sentence: why that lean." },
    summary: { type: "string", description: "Two or three sentences: who this applicant is and what they want from the programme." },
    strengths: stringList("Up to four, each pointing to what an answer said."),
    concerns: stringList("Up to four, each pointing to what an answer said. Empty when there are none."),
    reviewers: { type: "string", description: "Where the reviewers agree and disagree, by label, and whether you agree. Say so when nobody has reviewed it." },
    fit: { type: "string", description: "How well they suit this programme, against the other programmes they ranked." },
    toWeigh: stringList("Up to three questions the person deciding should weigh."),
    thinAnswers: stringList("Questions whose answers were blank, generic or did not engage, each with a few words on why. Empty when none."),
  },
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const list = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, max) : [];

/** Check Claude's object field by field. Anything malformed is null. */
export function claudeReadFrom(value: unknown): Omit<ClaudeRead, "model" | "at"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const lean = LEANS.find((entry) => entry === raw.lean);
  const summary = text(raw.summary);
  if (!lean || !summary) return null;
  return {
    lean,
    leanReason: text(raw.leanReason),
    summary,
    strengths: list(raw.strengths, 4),
    concerns: list(raw.concerns, 4),
    reviewers: text(raw.reviewers),
    fit: text(raw.fit),
    toWeigh: list(raw.toWeigh, 3),
    thinAnswers: list(raw.thinAnswers, 8),
  };
}

export type ClaudeReadResult =
  | { ok: true; read: Omit<ClaudeRead, "at"> }
  | { ok: false; reason: string };

export async function askForClaudeRead(message: string): Promise<ClaudeReadResult> {
  const answer = await askClaudeForJson({
    system: SYSTEM,
    message,
    schema: SCHEMA,
    effort: "medium",
    maxTokens: 12_000,
    timeoutMs: 150_000,
  });
  if (!answer.ok) return answer;
  const read = claudeReadFrom(answer.value);
  if (!read) return { ok: false, reason: "Claude’s answer couldn’t be read. Try again." };
  return { ok: true, read: { ...read, model: answer.model } };
}
