import type { SurveyProfileField } from "./items";

/**
 * WHAT A SURVEY OFFERS FROM A PERSON'S PROFILE: the answer a menu question
 * starts on, when the profile holds it, which the person can change before
 * sending. Two questions can be offered: their level of study and their
 * subject.
 *
 * Only what the profile actually holds is offered:
 *
 *  - LEVEL from `profile.status`: a master's, a PhD, staff (an employee or a
 *    post-doc) and "other" each have an answer. An undergraduate's profile
 *    does not say which year, and a foundation year has no answer of its own,
 *    so neither is offered.
 *  - SUBJECT from `profile.subject`, which is typed freely: offered only when
 *    exactly one subject's words are in it, so "BA Philosophy" offers
 *    Philosophy and "Philosophy, Politics and Economics" offers nothing.
 *
 * Pure: the answer page reads the profile on the server and asks this.
 */

/** The answers of the level question that a profile can offer, by option id. */
export const LEVEL_OPTION = {
  ug1: "o_ug1",
  ug2: "o_ug2",
  ug3: "o_ug3",
  ug4: "o_ug4",
  masters: "o_masters",
  phd: "o_phd",
  staff: "o_staff",
  other: "o_other",
} as const;

/** The answers of the subject question, by option id. */
export const SUBJECT_OPTION = {
  cs: "o_cs",
  maths: "o_maths",
  physicsEngineering: "o_physeng",
  law: "o_law",
  politics: "o_politics",
  philosophy: "o_philosophy",
  economics: "o_economics",
  other: "o_other",
} as const;

const LEVEL_BY_STATUS: Record<string, string> = {
  masters: LEVEL_OPTION.masters,
  phd: LEVEL_OPTION.phd,
  employee: LEVEL_OPTION.staff,
  postdoc: LEVEL_OPTION.staff,
  other: LEVEL_OPTION.other,
};

/** The words that put a typed subject in one of the question's subjects. */
const SUBJECT_WORDS: readonly [string, RegExp][] = [
  [SUBJECT_OPTION.cs, /\bcomput(?:er|ers|ing|ation|ational)\b|\bsoftware\b/i],
  [SUBJECT_OPTION.maths, /\bmath(?:s|ematics|ematical)?\b|\bstatistics\b/i],
  [SUBJECT_OPTION.physicsEngineering, /\bphysics\b|\bengineering\b/i],
  [SUBJECT_OPTION.law, /\blaw\b|\bLLB\b/i],
  [SUBJECT_OPTION.politics, /\bpolitics\b|\bpolitical\b|\binternational relations\b/i],
  [SUBJECT_OPTION.philosophy, /\bphilosoph(?:y|ical)\b/i],
  [SUBJECT_OPTION.economics, /\beconomics\b|\beconomic\b/i],
];

/** The profile values an offer reads. */
export type ProfileFacts = { status: string; subject: string };

/**
 * The option a profile offers for one menu question, or null when the profile
 * does not hold it or the question no longer has that answer.
 */
export function offerFromProfile(field: SurveyProfileField, profile: ProfileFacts, optionIds: readonly string[]): string | null {
  let offered: string | null = null;
  if (field === "level") {
    offered = LEVEL_BY_STATUS[profile.status] ?? null;
  } else {
    const subject = profile.subject.trim();
    const matches = subject ? SUBJECT_WORDS.filter(([, words]) => words.test(subject)).map(([id]) => id) : [];
    offered = matches.length === 1 ? matches[0] : null;
  }
  return offered !== null && optionIds.includes(offered) ? offered : null;
}

/** The profile values an offer reads, from a stored account. Nothing else of it. */
export function profileFactsOf(account: Record<string, unknown>): ProfileFacts {
  const profile = account.profile && typeof account.profile === "object" ? (account.profile as Record<string, unknown>) : {};
  return {
    status: typeof profile.status === "string" ? profile.status : "",
    subject: typeof profile.subject === "string" ? profile.subject : "",
  };
}
