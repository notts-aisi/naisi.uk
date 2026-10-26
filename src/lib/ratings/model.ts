/**
 * RATINGS: what a group's facilitators say about each fellow at the end of a
 * programme (the programme impact questionnaire's facilitator rating, F1 to
 * F5, and on an incubator its mentor rating, M1 to M3; Zach, Mon 26 Oct 2026).
 * Staff only, and never shown to the person rated: they are the raters' own
 * form, not survey answers.
 *
 * ## Who rates whom
 *
 * A facilitator is a fellow of the group they run (Zach, 26 Oct), so:
 *
 *  - nobody rates themselves;
 *  - a group's facilitator rates the fellows of their group, and never a
 *    co-facilitator of it, whatever else either of them is;
 *  - the programme's lead or an admin rates a facilitator (and may rate any
 *    fellow, for a group whose facilitators cannot).
 *
 * Nobody is modelled as an incubator's mentor (teams have people and a
 * project, and no mentor), so an incubator's facilitators give its mentor
 * rating too, on the same form.
 *
 * ## The one collection: `programmeRatings`
 *
 * Server-only in both directions: firestore.rules shuts it to every browser.
 * Two kinds of document, told apart by `kind`:
 *
 *  - `programmeRatings/{runId}__{raterUid}__{ratedUid}` (`kind: "rating"`):
 *    one rater's answers about one fellow, `{ runId, groupId, raterUid,
 *    ratedUid, answers, savedAt }`. The rater changes it until it is
 *    deleted; clearing every answer deletes it.
 *  - `programmeRatings/{runId}` (`kind: "sheet"`): the day of the run's last
 *    session (`lastSessionOn`), written with the run's first rating. The job
 *    that takes names off surveys (`surveys-names-off`) reads every sheet by
 *    one equality on `kind` and deletes a run's ratings two years after that
 *    day, the day names come off its surveys, with the two-year rule kept in
 *    one place (`src/lib/surveys/namesOff.ts`).
 *
 * F1, the sessions a fellow came to, is never typed or stored: it is read
 * from the register each time it is shown, so a register corrected later is
 * what the rating shows.
 *
 * Pure: no reads, so the page's client form can share the questions and the
 * parser with the route.
 */

export const RATINGS_COLLECTION = "programmeRatings";

/** The id of one rater's rating of one fellow on one run. */
export function ratingId(runId: string, raterUid: string, ratedUid: string): string {
  return `${runId}__${raterUid}__${ratedUid}`;
}

/** The id of a run's sheet: the day its ratings are deleted. */
export function ratingSheetId(runId: string): string {
  return runId;
}

/** What the programme is: an incubator's form adds the mentor rating. */
export type RatingsProgrammeKind = "fellowship" | "incubator";

/** The answers to F5. */
export type NextStepAnswer = "no" | "maybe" | "yes" | "strongYes";

export const NEXT_STEP_ANSWERS: readonly NextStepAnswer[] = ["no", "maybe", "yes", "strongYes"];

/** One rater's answers about one fellow. Every question can be left out. */
export type RatingAnswers = {
  f2?: number;
  f3?: number;
  f4?: number;
  f5?: NextStepAnswer;
  m1?: number;
  m2?: number;
  m3?: number;
};

export type RatingKey = keyof RatingAnswers;

/** Words at one point of a scale. */
export type RatingAnchor = { at: number; label: string };

export type RatingQuestion =
  | { key: Exclude<RatingKey, "f5">; kind: "scale"; title: string; min: number; max: number; anchors: RatingAnchor[]; short: string }
  | { key: "f5"; kind: "choice"; title: string; options: { id: NextStepAnswer; label: string }[]; short: string };

/**
 * The facilitator rating, word for word from the questionnaire. F1 is read
 * from the register, so it is not a question here. The words at 1 and 5 of
 * F2 and F3 are the site's own (the questionnaire gives none), listed in the
 * build notes for the boards' designers to confirm.
 */
export const FACILITATOR_QUESTIONS: readonly RatingQuestion[] = [
  {
    key: "f2",
    kind: "scale",
    title: "Engagement in discussion",
    min: 1,
    max: 5,
    anchors: [
      { at: 1, label: "Low" },
      { at: 5, label: "High" },
    ],
    short: "engagement",
  },
  {
    key: "f3",
    kind: "scale",
    title: "Grasp of the material",
    min: 1,
    max: 5,
    anchors: [
      { at: 1, label: "Low" },
      { at: 5, label: "High" },
    ],
    short: "grasp",
  },
  {
    key: "f4",
    kind: "scale",
    title: "How much does improving AI outcomes seem to drive them?",
    min: 1,
    max: 5,
    anchors: [
      { at: 1, label: "Incidental" },
      { at: 3, label: "One motivation among several" },
      { at: 5, label: "Their main motivation" },
    ],
    short: "drive",
  },
  {
    key: "f5",
    kind: "choice",
    title: "Would you recommend them for a more demanding next step (incubator, SPAR, MATS-level)?",
    options: [
      { id: "no", label: "No" },
      { id: "maybe", label: "Maybe" },
      { id: "yes", label: "Yes" },
      { id: "strongYes", label: "Strong yes" },
    ],
    short: "next step",
  },
];

/** The mentor rating, word for word from the questionnaire's incubator additions. */
export const MENTOR_QUESTIONS: readonly RatingQuestion[] = [
  {
    key: "m1",
    kind: "scale",
    title: "How strongly do you support this research continuing?",
    min: 1,
    max: 10,
    anchors: [
      { at: 1, label: "Fine if it stops" },
      { at: 5, label: "On the fence" },
      { at: 10, label: "Very disappointed if it stopped" },
    ],
    short: "support for the research",
  },
  {
    key: "m2",
    kind: "scale",
    title: "Research or technical skill for their chosen direction",
    min: 1,
    max: 10,
    anchors: [
      { at: 1, label: "Novice" },
      { at: 5, label: "Typical junior researcher in the area" },
      { at: 10, label: "Could lead a project" },
    ],
    short: "skill",
  },
  {
    key: "m3",
    kind: "scale",
    title: "How independently can they steer a research direction?",
    min: 1,
    max: 10,
    anchors: [
      { at: 1, label: "Needs constant guidance" },
      { at: 5, label: "Notices when stuck" },
      { at: 10, label: "Picks good directions alone" },
    ],
    short: "independence",
  },
];

/** The questions a programme's form asks: the facilitator rating, and on an incubator the mentor rating after it. */
export function ratingQuestionsFor(kind: RatingsProgrammeKind): readonly RatingQuestion[] {
  return kind === "incubator" ? [...FACILITATOR_QUESTIONS, ...MENTOR_QUESTIONS] : FACILITATOR_QUESTIONS;
}

/** The F5 answer that marks somebody among the strongest, and the M1 score from which an incubator's does. */
export const STRONGEST = { nextStep: "strongYes" as NextStepAnswer, research: 8 } as const;

export type RatingDoc = {
  id: string;
  runId: string;
  groupId: string;
  raterUid: string;
  ratedUid: string;
  answers: RatingAnswers;
  savedAt: Date | null;
};

export type RatingSheetDoc = {
  runId: string;
  /** "YYYY-MM-DD": the day of the run's last session. Its ratings are deleted two years on. */
  lastSessionOn: string;
};

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The answers as stored, each read against its question; anything else is dropped. */
export function readRatingAnswers(raw: unknown): RatingAnswers {
  const out: RatingAnswers = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Raw;
  for (const question of [...FACILITATOR_QUESTIONS, ...MENTOR_QUESTIONS]) {
    const value = r[question.key];
    if (question.kind === "choice") {
      if (typeof value === "string" && (NEXT_STEP_ANSWERS as readonly string[]).includes(value)) out.f5 = value as NextStepAnswer;
      continue;
    }
    if (typeof value === "number" && Number.isInteger(value) && value >= question.min && value <= question.max) {
      out[question.key] = value;
    }
  }
  return out;
}

/** A stored rating, or null for one that is not whole. */
export function normalizeRating(id: string, data: Raw): RatingDoc | null {
  if (data.kind !== "rating") return null;
  const runId = str(data.runId);
  const raterUid = str(data.raterUid);
  const ratedUid = str(data.ratedUid);
  if (!runId || !raterUid || !ratedUid || id !== ratingId(runId, raterUid, ratedUid)) return null;
  return {
    id,
    runId,
    groupId: str(data.groupId),
    raterUid,
    ratedUid,
    answers: readRatingAnswers(data.answers),
    savedAt: tsToDate(data.savedAt),
  };
}

/** A stored sheet, or null for one that is not whole. */
export function normalizeRatingSheet(id: string, data: Raw): RatingSheetDoc | null {
  if (data.kind !== "sheet") return null;
  const runId = str(data.runId);
  if (!runId || id !== ratingSheetId(runId) || typeof data.lastSessionOn !== "string" || !DATE_KEY.test(data.lastSessionOn)) {
    return null;
  }
  return { runId, lastSessionOn: data.lastSessionOn };
}

export type ParsedRating = { ok: true; answers: RatingAnswers } | { ok: false; problem: string };

/**
 * One rater's answers from a request, held to the programme's questions:
 * every question may be left out, a scale takes a whole number in its range,
 * F5 one of its four answers, and a question the form does not ask is
 * refused. Nothing else of the request is kept.
 */
export function parseRatingAnswers(raw: unknown, kind: RatingsProgrammeKind): ParsedRating {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, problem: RATING_PROBLEMS.shape };
  const asked = ratingQuestionsFor(kind);
  const r = raw as Raw;
  for (const key of Object.keys(r)) {
    if (!asked.some((question) => question.key === key)) return { ok: false, problem: RATING_PROBLEMS.notAsked };
  }
  const out: RatingAnswers = {};
  for (const question of asked) {
    const value = r[question.key];
    if (value === undefined || value === null) continue;
    if (question.kind === "choice") {
      if (typeof value !== "string" || !(NEXT_STEP_ANSWERS as readonly string[]).includes(value)) {
        return { ok: false, problem: RATING_PROBLEMS.nextStep };
      }
      out.f5 = value as NextStepAnswer;
      continue;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < question.min || value > question.max) {
      return { ok: false, problem: `“${question.title}” takes a whole number from ${question.min} to ${question.max}.` };
    }
    out[question.key] = value;
  }
  return { ok: true, answers: out };
}

/** Whether a rating says anything. A rating with nothing in it is deleted, not kept. */
export function ratingIsEmpty(answers: RatingAnswers): boolean {
  return Object.keys(answers).length === 0;
}

export const RATING_PROBLEMS = {
  shape: "That rating didn’t arrive in a shape this page understands. Reload the page and try again.",
  notAsked: "One of those questions isn’t on this programme’s rating.",
  nextStep: "Pick No, Maybe, Yes or Strong yes for the next step.",
} as const;
