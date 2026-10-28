import "server-only";
import { askClaudeForJson } from "@/lib/ai/claude";
import { own } from "../keys";
import type { Lean, ProgrammeLean, StoredApplicationRead } from "./types";

/**
 * CLAUDE'S READ OF ONE APPLICATION, for the admin who decides it, in TWO
 * PASSES, as the committee's own reviewers read: blind first.
 *
 *  1. THE BLIND PASS. Claude reads the application alone, with nothing the
 *     committee scored or wrote, and gives its own view. That view is kept
 *     (`independent`), so an admin sees what Claude thought before it knew
 *     what anybody else did.
 *  2. THE SECOND PASS. Claude is handed the application again, its own
 *     first view, and everything the committee scored and wrote, and gives
 *     the read the screen shows: where it agrees with the committee, where it
 *     does not, and whether seeing them changed its mind and why. With nobody
 *     on the committee yet, there is no second pass and the first view is the
 *     read.
 *
 * It is a reading aid and nothing more. It never fills in a decision, it is
 * shown only to admins, and the privacy policy says a person takes every
 * decision. Both prompts hold Claude to what the answers say: not to mark
 * anybody down for their English or their polish, not to guess at who they
 * are, and not to guess whether a person used AI, which is Pangram's job and
 * only on answers long enough to check.
 *
 * The prompts are constants, so every read is made under the same
 * instructions and a change to them is a change to this file.
 */

const ABOUT = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), make decisions on applications to its programmes: fellowships and research incubators on AI safety, governance and strategy. An admin reads your assessment beside the application and decides. You never decide, and nothing you write is sent to the applicant.

How to assess:
- Judge what the answers show: understanding of the area, quality of thinking, specific engagement with the questions, and how well the person and the programme suit each other. Reward substance over length.
- Do not mark anybody down for their English, their spelling, their writing polish or their background. Many applicants write in a second language.
- Do not guess at a person's age, gender, nationality, health or any other personal characteristic, and do not use any you notice.
- Do not try to judge whether an answer was written with AI. That is checked separately. You may say an answer is generic or does not engage with the question.
- Be concrete: point to what an answer said. Be brief: short sentences, no padding, British English.
- Give a "lean" for EACH programme listed: "strong" (a clear yes for that programme), "borderline" (could go either way), or "weak" (a clear no on this evidence), with its reason and how well they fit it against their other choices. Name each programme exactly as listed.`;

const BLIND = `${ABOUT}

This is your FIRST read. You are given the application alone, without anything the committee scored or wrote, so that your view is your own. Say what you think, for each programme listed.`;

const SECOND = `${ABOUT}

This is your SECOND read. You are given the application, your own first read of it (made without seeing the committee), and what the committee's reviewers scored and wrote. Weigh their views as evidence, not as the answer. In "reviewers", say where they agree and disagree with each other and with your first read, by label ("Reviewer A"), and whether seeing them changed your view and why. Change your lean only for a reason you can name.`;

const LEANS: readonly Lean[] = ["strong", "borderline", "weak"];

const stringList = (description: string) => ({
  type: "array",
  description,
  items: { type: "string" },
});

const READ_FIELDS = {
  summary: { type: "string", description: "Two or three sentences: who this applicant is and what they want." },
  strengths: stringList("Up to four, each pointing to what an answer said."),
  concerns: stringList("Up to four, each pointing to what an answer said. Empty when there are none."),
  programmes: {
    type: "array",
    description: "One entry for each programme listed.",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["programme", "lean", "leanReason", "fit"],
      properties: {
        programme: { type: "string", description: "The programme's name, exactly as listed." },
        lean: { type: "string", enum: [...LEANS] },
        leanReason: { type: "string", description: "One sentence: why that lean for this programme." },
        fit: { type: "string", description: "How well they suit this programme, against their other choices." },
      },
    },
  },
  toWeigh: stringList("Up to three questions the person deciding should weigh."),
  thinAnswers: stringList("Questions whose answers were blank, generic or did not engage, each with a few words on why. Empty when none."),
};

const BLIND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(READ_FIELDS),
  properties: READ_FIELDS,
};

const SECOND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...Object.keys(READ_FIELDS), "reviewers"],
  properties: {
    ...READ_FIELDS,
    reviewers: {
      type: "string",
      description: "Where the reviewers agree and disagree, by label, with each other and with your first read, and whether that changed your view.",
    },
  },
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const list = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, max) : [];

type ReadBody = Omit<StoredApplicationRead, "model" | "at" | "fingerprint" | "reviewerUids" | "independent">;

/**
 * Check Claude's object field by field, and its programmes against the ones
 * the message listed (`programmes`, short name to id). Anything malformed is
 * null; a programme Claude named that was not listed is dropped.
 */
export function claudeReadFrom(value: unknown, programmes: readonly { id: string; shortName: string }[]): ReadBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const summary = text(raw.summary);
  if (!summary) return null;
  const leans: Record<string, ProgrammeLean> = {};
  for (const entry of Array.isArray(raw.programmes) ? raw.programmes : []) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const named = text(item.programme).toLowerCase();
    const programme = programmes.find((p) => p.shortName.toLowerCase() === named);
    const lean = LEANS.find((x) => x === item.lean);
    if (!programme || !lean) continue;
    leans[programme.id] = { lean, leanReason: text(item.leanReason), fit: text(item.fit) };
  }
  if (Object.keys(leans).length === 0) return null;
  return {
    summary,
    strengths: list(raw.strengths, 4),
    concerns: list(raw.concerns, 4),
    reviewers: text(raw.reviewers),
    toWeigh: list(raw.toWeigh, 3),
    thinAnswers: list(raw.thinAnswers, 8),
    programmes: leans,
  };
}

/** The first read, written out for the second pass to weigh. */
function firstReadWords(read: ReadBody, programmes: readonly { id: string; shortName: string }[]): string {
  return [
    "# Your first read, made without seeing the committee",
    `Summary: ${read.summary}`,
    ...programmes.flatMap((p) => {
      const lean = own(read.programmes, p.id);
      return lean ? [`${p.shortName}: ${lean.lean}. ${lean.leanReason}`] : [];
    }),
    read.strengths.length ? `Strengths: ${read.strengths.join(" | ")}` : "",
    read.concerns.length ? `Concerns: ${read.concerns.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type ClaudeReadResult =
  | { ok: true; read: Omit<StoredApplicationRead, "at" | "fingerprint" | "reviewerUids"> }
  | { ok: false; reason: string };

export async function askForClaudeRead(input: {
  application: string;
  committee: string;
  reviewed: boolean;
  programmes: readonly { id: string; shortName: string }[];
}): Promise<ClaudeReadResult> {
  // 1. Blind.
  const first = await askClaudeForJson({
    system: BLIND,
    message: input.application,
    schema: BLIND_SCHEMA,
    effort: "medium",
    maxTokens: 12_000,
    timeoutMs: 130_000,
  });
  if (!first.ok) return first;
  const blind = claudeReadFrom(first.value, input.programmes);
  if (!blind) return { ok: false, reason: "Claude’s answer couldn’t be read. Try again." };
  const independent: StoredApplicationRead["independent"] = {
    summary: blind.summary,
    programmes: Object.fromEntries(
      Object.entries(blind.programmes).map(([id, lean]) => [id, { lean: lean.lean, leanReason: lean.leanReason }]),
    ),
  };

  // With nobody on the committee yet, the first read is the read.
  if (!input.reviewed) {
    return {
      ok: true,
      read: { ...blind, reviewers: "Nobody on the committee has reviewed this application yet.", independent, model: first.model },
    };
  }

  // 2. With the committee.
  const second = await askClaudeForJson({
    system: SECOND,
    message: `${input.application}\n\n${firstReadWords(blind, input.programmes)}\n\n${input.committee}`,
    schema: SECOND_SCHEMA,
    effort: "medium",
    maxTokens: 12_000,
    timeoutMs: 130_000,
  });
  if (!second.ok) return second;
  const read = claudeReadFrom(second.value, input.programmes);
  if (!read) return { ok: false, reason: "Claude’s answer couldn’t be read. Try again." };
  return { ok: true, read: { ...read, independent, model: second.model } };
}
