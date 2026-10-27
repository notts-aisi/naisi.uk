/**
 * `courseExerciseResponses/{runId}__{uid}__{weekId}__{exerciseId}` — one
 * member's response to one weekly exercise. ALL writes go through server
 * routes (`allow write: if false` in rules): the response-type gate — a
 * "text" exercise must receive text, a "link" exercise a URL — compares the
 * submission against the exercise DEFINITION on the week doc, a cross-doc
 * check Firestore rules cannot express.
 *
 * The deterministic doc id makes one response per (run, member, week,
 * exercise) structural: the submit route upserts this exact path, so edits
 * replace rather than duplicate, and "editable until reviewed" is a status
 * check, not a query.
 *
 * Member content is plain text (`text`) or a validated URL (`linkUrl`) —
 * typed `string`, never `Block[]`, rendered as text nodes only. No rich
 * text, no uploads (locked product decision 7).
 *
 * ── THREE KINDS OF ROW ──────────────────────────────────────────────────────
 * The same store holds a week written as blocks' REFLECTIONS (boards
 * st-week1-phone, wk-week-phone; Q30): one row per reflection box, its id
 * `exerciseResponseId(runId, uid, weekId, promptId)`, `exerciseId` holding
 * the prompt's id and `kind: "reflection"`. It holds a block week's FILL-IN
 * BOXES the same way (board wk-week6-phone, week 6's action plan): one row
 * per box, `exerciseId` holding the box's id and `kind: "fillIn"`. A row with
 * no `kind` is an exercise answer, as every row stored before either is.
 *
 * A REFLECTION OR A FILL-IN BOX IS NEVER REVIEWED AND NEVER SENT: each is a
 * box its writer fills in as they type (its routes,
 * `runs/[runId]/reflections/[promptId]` and
 * `runs/[runId]/fill-in-boxes/[boxId]`), it never carries `submittedAt`, a
 * verdict or feedback, and nothing that reviews, queues or counts answers may
 * treat it as one. Every reader of this store says which kinds it reads: a
 * reader of answers leaves both out with `isOwnBoxResponse`, and a reader of
 * one kind asks for exactly that kind (`isReflectionResponse`,
 * `isFillInResponse`), because the two are read by different people and in
 * different ways (a reflection may be read out without its writer's name,
 * Q37; nothing says that of an action plan).
 * `tests/course-reflection-store-readers.test.mjs` walks the tree for a
 * reader that does not say. Deletion (an account's, and the run's destroy)
 * and the guards that refuse to renumber a run with answers read every row of
 * every kind, on purpose.
 */

/** What a row holds: an answer to an exercise (or a written answer), a reflection, or a fill-in box. */
export type ResponseKind = "exercise" | "reflection" | "fillIn";

/** Whether a stored row is a reflection. Only a stored "reflection" is one. */
export function isReflectionResponse(data: { kind?: unknown } | null | undefined): boolean {
  return data?.kind === "reflection";
}

/** Whether a stored row is a fill-in box. Only a stored "fillIn" is one. */
export function isFillInResponse(data: { kind?: unknown } | null | undefined): boolean {
  return data?.kind === "fillIn";
}

/**
 * Whether a stored row is a box its writer fills in as they type (a
 * reflection or a fill-in box) rather than an answer: never sent, never
 * reviewed, never counted as an answer. Every reader of answers leaves these
 * out by asking this, so a new kind of box is left out everywhere at once.
 */
export function isOwnBoxResponse(data: { kind?: unknown } | null | undefined): boolean {
  return isReflectionResponse(data) || isFillInResponse(data);
}

/** The most a reflection box holds, in characters. */
export const REFLECTION_MAX_CHARS = 4000;

/** The most one fill-in box holds, in characters: a reflection box's measure. */
export const FILL_IN_MAX_CHARS = REFLECTION_MAX_CHARS;

export type ExerciseReviewStatus = "unreviewed" | "seen" | "needs-work" | "approved";

export const REVIEW_STATUSES: ExerciseReviewStatus[] = [
  "unreviewed",
  "seen",
  "needs-work",
  "approved",
];

export const REVIEW_STATUS_LABEL: Record<ExerciseReviewStatus, string> = {
  unreviewed: "Unreviewed",
  seen: "Seen",
  "needs-work": "Needs work",
  approved: "Approved",
};

/**
 * Length budgets for submissions + review feedback. The submit/review routes
 * are the security boundary; these power the client counters.
 */
export const EXERCISE_LIMITS = {
  responseText: 4000,
  linkUrl: 500,
  reviewerComment: 2000,
} as const;

export type CourseExerciseResponseDoc = {
  /** Firestore doc id: `exerciseResponseId(runId, uid, weekId, exerciseId)`. */
  id: string;
  runId: string;
  uid: string;
  /** Week doc id ("w03"), not a week number — stable across copy-forward. */
  weekId: string;
  /** The exercise's id, a reflection's prompt id or a fill-in box's id (see `kind`). */
  exerciseId: string;
  /** "reflection" or "fillIn" only where stored; every other row is an exercise answer. */
  kind: ResponseKind;
  /**
   * Asserted by the submit route against the exercise definition — stored so
   * the review queue renders without re-reading the week doc.
   */
  responseType: "text" | "link";
  /** Present iff responseType === "text". Plain text (see module comment). */
  text?: string;
  /** Present iff responseType === "link". Passed `validateSubmissionUrl`. */
  linkUrl?: string;
  submittedAt: Date | null;
  reviewStatus: ExerciseReviewStatus;
  /**
   * Singular by design — one facilitator owns a review verdict. Course code
   * deliberately never reuses the tasks vocabulary (`reviewerUids`).
   */
  reviewerUid?: string;
  /** Facilitator feedback shown to the member. */
  reviewerComment?: string;
  reviewedAt?: Date | null;
  updatedAt?: Date | null;
};

/**
 * Deterministic doc id — one response per (run, member, week, exercise),
 * structurally (see module comment). CONSTRUCT-ONLY — NEVER PARSE: every part
 * is stored as a field, and `__`-splitting is ambiguous because `slugId`-made
 * run ids already contain `__`.
 */
export function exerciseResponseId(
  runId: string,
  uid: string,
  weekId: string,
  exerciseId: string,
): string {
  return `${runId}__${uid}__${weekId}__${exerciseId}`;
}

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

export function normalizeExerciseResponse(
  id: string,
  data: Raw,
): CourseExerciseResponseDoc {
  const reviewStatus = data.reviewStatus as ExerciseReviewStatus;
  const doc: CourseExerciseResponseDoc = {
    id,
    runId: str(data.runId),
    uid: str(data.uid),
    weekId: str(data.weekId),
    exerciseId: str(data.exerciseId),
    kind: isReflectionResponse(data) ? "reflection" : isFillInResponse(data) ? "fillIn" : "exercise",
    responseType: data.responseType === "link" ? "link" : "text",
    submittedAt: tsToDate(data.submittedAt),
    reviewStatus: REVIEW_STATUSES.includes(reviewStatus) ? reviewStatus : "unreviewed",
    updatedAt: tsToDate(data.updatedAt),
  };
  if (typeof data.text === "string" && data.text) {
    doc.text = data.text;
  }
  if (typeof data.linkUrl === "string" && data.linkUrl) {
    doc.linkUrl = data.linkUrl;
  }
  if (typeof data.reviewerUid === "string" && data.reviewerUid) {
    doc.reviewerUid = data.reviewerUid;
  }
  if (typeof data.reviewerComment === "string" && data.reviewerComment) {
    doc.reviewerComment = data.reviewerComment;
  }
  const reviewedAt = tsToDate(data.reviewedAt);
  if (reviewedAt) doc.reviewedAt = reviewedAt;
  return doc;
}
