import "server-only";
import { askClaudeForJson } from "@/lib/ai/claude";
import type { OverviewEntry, ProgrammeOverview } from "./types";

/**
 * CLAUDE ACROSS A WHOLE PROGRAMME: a comparison of its applications, and a
 * question an admin asks about them.
 *
 * Both read `programmeInput.ts`'s message: Claude's own reads of each
 * application, numbered, with the list's numbers. Neither is stored. Both are
 * reading aids for the admin who decides, and the instructions say so, as
 * `claudeRead.ts`'s do for one application.
 */

const SYSTEM = `You help the committee of NAISI, the Nottingham AI Safety Initiative (a student society at the University of Nottingham), make decisions on applications to one of its programmes: fellowships and research incubators on AI safety, governance and strategy.

You are given your own earlier reads of each application to this programme, one per applicant, with the committee's score and where each decision stands. Applicants are numbered ("Applicant 3") and reviewers lettered ("Reviewer B"); a letter means the same reviewer throughout. An admin reads what you write beside the list and decides. You never decide, and nothing you write is sent to an applicant.

How to work:
- Compare the applications with each other, on the evidence in the reads: understanding, quality of thinking, engagement, and fit for this programme. The committee's scores and comments are evidence, not the answer.
- Do not mark anybody down for their English or their background, and do not guess at personal characteristics.
- A Pangram flag is a reason for a person to look again, never a finding on its own. Do not judge AI use yourself.
- An applicant Claude has not read yet: say so where it matters, and never guess what they wrote.
- Refer to people only by their labels. Be concrete and brief, in British English.`;

const entry = (extra: Record<string, unknown> = {}) => ({
  type: "object",
  additionalProperties: false,
  required: ["applicant", "why", ...Object.keys(extra)],
  properties: {
    applicant: { type: "string", description: 'The label, exactly as given: "Applicant 3".' },
    why: { type: "string", description: "One sentence." },
    ...extra,
  },
});

const list = (description: string, item = entry()) => ({ type: "array", description, items: item });

const OVERVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overall", "shortlist", "borderline", "notThisTime", "secondLook", "elsewhere"],
  properties: {
    overall: { type: "string", description: "Three or four sentences on the field as a whole." },
    shortlist: list("The strongest, best first, up to the number of places (or about a third when places are not set)."),
    borderline: list("Those who could go either way."),
    notThisTime: list("A clear no on this evidence."),
    secondLook: list("People worth a second look before deciding: reviewers disagree, thin evidence, a Pangram flag, or not read yet."),
    elsewhere: list(
      "People who would suit another programme better.",
      entry({ programme: { type: "string", description: "The other programme, as the reads name it." } }),
    ),
  },
};

const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string", description: "The answer, in short paragraphs or a short list." } },
};

const LABEL = /^Applicant \d+$/;

function entriesFrom(value: unknown, withProgramme = false): OverviewEntry[] {
  if (!Array.isArray(value)) return [];
  const out: OverviewEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const applicant = typeof raw.applicant === "string" ? raw.applicant.trim() : "";
    const why = typeof raw.why === "string" ? raw.why.trim() : "";
    if (!LABEL.test(applicant) || !why) continue;
    const programme = withProgramme && typeof raw.programme === "string" ? raw.programme.trim() : undefined;
    out.push(programme ? { applicant, why, programme } : { applicant, why });
  }
  return out;
}

/** Check Claude's comparison field by field. Labels that are not labels are dropped. */
export function overviewFrom(value: unknown): Omit<ProgrammeOverview, "at" | "read" | "total"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const overall = typeof raw.overall === "string" ? raw.overall.trim() : "";
  if (!overall) return null;
  return {
    overall,
    shortlist: entriesFrom(raw.shortlist),
    borderline: entriesFrom(raw.borderline),
    notThisTime: entriesFrom(raw.notThisTime),
    secondLook: entriesFrom(raw.secondLook),
    elsewhere: entriesFrom(raw.elsewhere, true),
  };
}

export type OverviewResult =
  | { ok: true; overview: Omit<ProgrammeOverview, "at" | "read" | "total"> }
  | { ok: false; reason: string };

export async function askForOverview(message: string): Promise<OverviewResult> {
  const answer = await askClaudeForJson({
    system: SYSTEM,
    message,
    schema: OVERVIEW_SCHEMA,
    effort: "medium",
    maxTokens: 16_000,
    timeoutMs: 240_000,
  });
  if (!answer.ok) return answer;
  const overview = overviewFrom(answer.value);
  return overview ? { ok: true, overview } : { ok: false, reason: "Claude’s answer couldn’t be read. Try again." };
}

export type QuestionResult = { ok: true; answer: string } | { ok: false; reason: string };

export async function askAboutTheProgramme(message: string, question: string): Promise<QuestionResult> {
  const answer = await askClaudeForJson({
    system: SYSTEM,
    message: `${message}\n\n# The admin's question\n\n${question}`,
    schema: QUESTION_SCHEMA,
    effort: "medium",
    maxTokens: 8_000,
    timeoutMs: 180_000,
  });
  if (!answer.ok) return answer;
  const text =
    answer.value && typeof answer.value === "object" && typeof (answer.value as { answer?: unknown }).answer === "string"
      ? ((answer.value as { answer: string }).answer).trim()
      : "";
  return text ? { ok: true, answer: text } : { ok: false, reason: "Claude’s answer couldn’t be read. Try again." };
}
