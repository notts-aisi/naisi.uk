import {
  normalizeAnswers,
  normalizePredictionQuestions,
  weekNumberOf,
  type PredictionAnswers,
  type PredictionQuestions,
} from "../courses/predictions/model";

/**
 * `coursePredictions/{runId}__{uid}`: ONE PERSON'S SEALED PREDICTIONS ON ONE
 * RUN (Zach's extra (d); the course's card is `CourseDoc.predictionCard`,
 * `src/lib/courses/predictions/model.ts`). One document per person per run,
 * made by their first answer, holding both cards:
 *
 *  - THE FIRST CARD (`start`), filled in in the week the course's card is
 *    sealed in. It saves as they type until they seal it (`sealedAt`). From
 *    then nothing changes it, and nobody but an admin reads it, its owner
 *    included, until the week it opens in (`opensInWeek`, the course's week
 *    at the moment it was sealed) has opened to their group.
 *  - THE SECOND CARD (`now`), the same questions asked again in that week. It
 *    saves as they type until they open their sealed card (`openedAt`), and
 *    from then both are shown to them side by side and neither changes.
 *
 * THE QUESTIONS (`card`) are a copy of the course's card, taken at the
 * person's first answer: an admin changing the course's card later changes
 * nothing anybody has started, so both cards always ask the same questions.
 *
 * WHO READS IT: its owner, on their own week pages, as the rule above allows;
 * and an admin, at any time, through one route that records each opening
 * BEFORE it reads anything of the card (`src/lib/firestore/recordOpenings.ts`).
 * Nobody else: not the group's facilitators (a facilitator who holds a place
 * included), not the programme's lead, not another fellow.
 *
 * WHO WRITES IT: one route on the Admin SDK, in the owner's own name only
 * (`/api/courses/runs/[runId]/predictions`). `firestore.rules` refuses every
 * browser, the owner and admins included.
 *
 * WHAT TAKES IT AWAY: deleting the owner's account
 * (`src/lib/firestore/accountDeletion.ts`, by `uid`) and destroying the run
 * (`src/lib/firestore/courseDeletion.ts`, by `runId`). Leaving the programme
 * does not: the card stays for admins, and nothing shows it to somebody who
 * left.
 *
 * Pure, with relative imports only, so a page in the browser can read the
 * shape.
 */

export const COURSE_PREDICTIONS_COLLECTION = "coursePredictions";

/**
 * The record's id. Construct-only: built from its two parts and never
 * parsed, so nobody can spell a record that is not the one these two name.
 */
export function predictionsRecordId(runId: string, uid: string): string {
  return `${runId}__${uid}`;
}

export type CoursePredictionsDoc = {
  /** `predictionsRecordId(runId, uid)`. */
  id: string;
  runId: string;
  uid: string;
  /** The run's course, whose card the questions were copied from. */
  courseId: string;
  /** The questions as this person was given them, from their first answer. Null before it. */
  card: PredictionQuestions | null;
  start: {
    answers: PredictionAnswers;
    /** When they sealed it; null while it is still theirs to change. */
    sealedAt: Date | null;
    /** The week it opens in, fixed when it was sealed. */
    opensInWeek: number | null;
    updatedAt: Date | null;
  };
  now: {
    answers: PredictionAnswers;
    /** When they opened their sealed card beside these answers. */
    openedAt: Date | null;
    updatedAt: Date | null;
  };
  createdAt: Date | null;
};

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

const isRaw = (value: unknown): value is Raw => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * A stored record, or null for one that cannot say whose it is or which run
 * it belongs to. Answers are kept only where they answer a question on the
 * record's own copy of the card.
 */
export function normalizeCoursePredictions(id: string, data: Raw): CoursePredictionsDoc | null {
  const runId = typeof data.runId === "string" ? data.runId : "";
  const uid = typeof data.uid === "string" ? data.uid : "";
  if (!runId || !uid) return null;
  const card = normalizePredictionQuestions(data.card);
  const questions = card?.questions ?? [];
  const start = isRaw(data.start) ? data.start : {};
  const now = isRaw(data.now) ? data.now : {};
  const sealedAt = tsToDate(start.sealedAt);
  return {
    id,
    runId,
    uid,
    courseId: typeof data.courseId === "string" ? data.courseId : "",
    card,
    start: {
      answers: normalizeAnswers(start.answers, questions),
      sealedAt,
      opensInWeek: sealedAt ? weekNumberOf(start.opensInWeek) : null,
      updatedAt: tsToDate(start.updatedAt),
    },
    now: {
      answers: normalizeAnswers(now.answers, questions),
      openedAt: tsToDate(now.openedAt),
      updatedAt: tsToDate(now.updatedAt),
    },
    createdAt: tsToDate(data.createdAt),
  };
}
