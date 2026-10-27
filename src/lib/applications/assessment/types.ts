/**
 * WHAT AN ASSESSMENT IS, as it is stored and as an admin's screen is sent it.
 *
 * Types only, with no server import, so a client component can read them.
 */

export type Lean = "strong" | "borderline" | "weak";

/** Claude's read of one application for one programme. */
export type ClaudeRead = {
  lean: Lean;
  leanReason: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  reviewers: string;
  fit: string;
  toWeigh: string[];
  thinAnswers: string[];
  /** The model that answered, as Anthropic reported it. */
  model: string;
  /** ISO instant. */
  at: string;
};

/**
 * A read as it is stored: Claude's words still say "Reviewer A", and which
 * account each letter was is kept beside them, never a name.
 */
export type StoredClaudeRead = ClaudeRead & {
  /** The hash of what was sent (`AssessmentInput.fingerprint`). */
  fingerprint: string;
  reviewerUids: Record<string, string | null>;
};

/** Pangram's reading of one answer. */
export type PangramAnswer = {
  key: string;
  question: string;
  words: number;
  label: string;
  headline: string;
  fractionAi: number;
  fractionAiAssisted: number;
  fractionHuman: number;
  /** Pangram called some of it AI or AI-assisted: worth a person's look. */
  worthALook: boolean;
};

export type PangramCheck = {
  answers: PangramAnswer[];
  /** Answers that were long enough and could not be checked, with why. */
  failed: { key: string; question: string; reason: string }[];
  /** How many answers were too short to send. */
  tooShort: number;
  /** ISO instant. */
  at: string;
};

/** What the review screen's assessment block is sent. */
export type AssessmentView = {
  claudeConfigured: boolean;
  pangramConfigured: boolean;
  /** Claude's read for the programme the screen is open under, names put back. */
  claude: ClaudeRead | null;
  /** The answers or the reviews have changed since Claude's read was made. */
  claudeOutOfDate: boolean;
  pangram: PangramCheck | null;
};

/** One row's marks on a programme's list of applications. */
export type AssessmentMark = {
  lean: Lean | null;
  /** How many answers Pangram thought worth a look. Null when not checked. */
  worthALook: number | null;
};

export type AssessmentPart = "claude" | "pangram";
