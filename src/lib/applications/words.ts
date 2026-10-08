import type {
  ApplicationResultKind,
  PoolReason,
  ProgrammeDecisionKind,
} from "./model";

/**
 * THE WORDS THIS SYSTEM USES, ONE WAY EACH.
 *
 * The committee decides Accept or Pool. Somebody who is pooled is a "pooled
 * applicant", and hears one of two things on decision day: an "invitation" to
 * something they did not pick, or "No offer this time". Nobody is ever
 * waitlisted or rejected, in the interface or in an email, and
 * `tests/applications-model.test.mjs` holds every label below to that.
 */

/** "1st", "2nd", "3rd", "4th". */
export function ordinal(n: number): string {
  const whole = Math.max(0, Math.floor(n));
  const lastTwo = whole % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${whole}th`;
  const last = whole % 10;
  if (last === 1) return `${whole}st`;
  if (last === 2) return `${whole}nd`;
  if (last === 3) return `${whole}rd`;
  return `${whole}th`;
}

/** "1st choice". */
export function choiceLabel(n: number): string {
  return `${ordinal(n)} choice`;
}

/**
 * An author's own name for a set of questions, as a screen calls the set:
 * "Shared" reads "Shared questions", and a name that already says it is
 * questions ("A few questions for everyone") is left exactly as it is.
 *
 * For the set asked of everybody, whose name is only ever its author's. The
 * applicant's step, the review screen and a programme's settings all name it
 * through this, so the three cannot come to call it different things.
 */
export function namedAsQuestions(label: string): string {
  const name = label.trim();
  return /(^|[^a-z])questions?([^a-z]|$)/i.test(name) ? name : `${name} questions`;
}

/** Where one application stands with one programme, as a lead sees it. */
export type ProgrammeStanding = "to-review" | "accepted" | "pooled" | "declined";

export const PROGRAMME_STANDING_LABEL: Record<ProgrammeStanding, string> = {
  "to-review": "To review",
  accepted: "Accepted",
  pooled: "Pooled",
  declined: "Declined",
};

export const PROGRAMME_DECISION_STANDING: Record<ProgrammeDecisionKind, ProgrammeStanding> = {
  accept: "accepted",
  pool: "pooled",
  decline: "declined",
};

export const POOL_REASON_LABEL: Record<PoolReason, string> = {
  capacity: "Capacity",
  "better-fit": "Better fit",
};

/** The decision-day groups, as the committee names them. */
export const RESULT_LABEL: Record<ApplicationResultKind, string> = {
  accepted: "You’re in",
  invited: "Invitation",
  "no-offer": "No offer this time",
  declined: "Declined",
};

/**
 * Words no applicant ever reads about a programme decision. Lower case; the
 * guard compares case-insensitively. An event can still have a waiting list,
 * which is why this is checked against this system's own copy and not the
 * whole site.
 */
export const WORDS_APPLICANTS_NEVER_SEE = ["waitlist", "wait list", "rejected", "rejection"] as const;
