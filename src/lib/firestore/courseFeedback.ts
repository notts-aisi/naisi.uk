/**
 * FEEDBACK ON SOMEBODY'S WEEK OF A COURSE, AND THE EMAILS THAT SAY IT IS
 * THERE (privacy v15, "Feedback": written by a person on the team running the
 * programme, showing their name, on the week's page, with an email to say it
 * is waiting).
 *
 * `courseFeedback/{autoId}`: ONE PIECE OF FEEDBACK, a short comment signed
 * with its writer's name, on one person's week. Many pieces may be on one
 * week, from different people.
 *  - `runId`, `uid` (whose work it is), `weekId`, `weekNumber`.
 *  - `on`: what it is about, `{ kind: "writtenAnswer", itemId }` (the week's
 *    written answer, by its block's id) or `{ kind: "week" }` (the week as a
 *    whole).
 *  - `text`: the comment. Never a level, a mark or a number.
 *  - `byUid`, `byRole`: who wrote it, and as what (`facilitator` of the
 *    person's group, the programme's `lead`, or an `admin`), stored when it
 *    is written, so the person's page signs it as it was written.
 *  - `createdAt`, `editedAt` (null until it is changed).
 *  - `emailedAt`, `emailedByUid`, `emailDelivery`: once the email that says
 *    it is there has gone (or was held, or stopped by the do-not-email list),
 *    when, by whose press, and what became of it. Null and "" until then.
 *    From then on it is never in a batch again, and its writer can no longer
 *    change or delete it.
 *  - `emailClaimedAt`, `sendId`: a press that has claimed it and is sending
 *    its email. A claim holds it for one press only; one left behind by a
 *    press that stopped is let go after `FEEDBACK_CLAIM_STALE_MS`.
 *
 * `courseFeedbackSends/{autoId}`: THE BATCH'S OWN RECORD, one row per press:
 * `kind: "test"` (a test that reached whoever pressed it, which unlocks their
 * press for a day) or `kind: "send"` (who pressed, when, how many people and
 * pieces, which piece ids, and what became of the emails). The one press in
 * progress on a run is the row `press__{runId}` (`kind: "press"`).
 *
 * FEEDBACK WRITTEN BEFORE THIS RECORD EXISTED lives on the written answer's
 * own row (`courseExerciseResponses.feedback`, with rubric levels) and is
 * never moved: it is read as one piece, already emailed
 * (`src/lib/courses/feedback/model.ts`).
 *
 * WHO READS IT: the routes and the server pages, on the Admin SDK, after
 * their own gates. `firestore.rules` refuses every browser, admins included.
 *
 * WHAT TAKES IT AWAY: deleting the account of the person it is about, or of
 * its writer (by `uid` and `byUid`), and destroying the run (by `runId`).
 *
 * Pure, with no imports, so a page in the browser can read the shape.
 */

export const COURSE_FEEDBACK_COLLECTION = "courseFeedback";
export const COURSE_FEEDBACK_SENDS_COLLECTION = "courseFeedbackSends";

export const FEEDBACK_ROLES = ["facilitator", "lead", "admin"] as const;
export type FeedbackRole = (typeof FEEDBACK_ROLES)[number];

/** What a piece is about: the week's written answer, by its block's id, or the week as a whole. */
export type FeedbackOn = { kind: "writtenAnswer"; itemId: string } | { kind: "week" };

/** What became of the email that said a piece was there. */
export type FeedbackDelivery = "sent" | "held" | "suppressed";

/** How long a press's claim on a piece holds before another press may take it: longer than any request lives. */
export const FEEDBACK_CLAIM_STALE_MS = 5 * 60_000;

/** The caps a piece is held to: "Short and specific beats long". */
export const FEEDBACK_LIMITS = { words: 300, chars: 3_000 } as const;

/** The press in progress on a run: one row, taken in a transaction, let go when the press ends. */
export function feedbackPressId(runId: string): string {
  return `press__${runId}`;
}

/** One piece, read. */
export type CourseFeedbackDoc = {
  id: string;
  runId: string;
  uid: string;
  weekId: string;
  weekNumber: number;
  on: FeedbackOn;
  text: string;
  byUid: string;
  byRole: FeedbackRole;
  createdAt: Date | null;
  editedAt: Date | null;
  emailedAt: Date | null;
  emailedByUid: string;
  emailDelivery: FeedbackDelivery | null;
  emailClaimedAt: Date | null;
  sendId: string;
};

type Raw = Record<string, unknown>;

function instant(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function onOf(value: unknown): FeedbackOn {
  const raw = value && typeof value === "object" ? (value as Raw) : {};
  if (raw.kind === "writtenAnswer" && typeof raw.itemId === "string" && raw.itemId) {
    return { kind: "writtenAnswer", itemId: raw.itemId };
  }
  return { kind: "week" };
}

/** A stored piece, read. Never throws. */
export function normalizeCourseFeedback(id: string, data: Raw): CourseFeedbackDoc {
  const role = FEEDBACK_ROLES.find((candidate) => candidate === data.byRole) ?? "admin";
  const delivery = data.emailDelivery === "sent" || data.emailDelivery === "held" || data.emailDelivery === "suppressed" ? data.emailDelivery : null;
  return {
    id,
    runId: str(data.runId),
    uid: str(data.uid),
    weekId: str(data.weekId),
    weekNumber: typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) && data.weekNumber > 0 ? data.weekNumber : 0,
    on: onOf(data.on),
    text: str(data.text),
    byUid: str(data.byUid),
    byRole: role,
    createdAt: instant(data.createdAt),
    editedAt: instant(data.editedAt),
    emailedAt: instant(data.emailedAt),
    emailedByUid: str(data.emailedByUid),
    emailDelivery: delivery,
    emailClaimedAt: instant(data.emailClaimedAt),
    sendId: str(data.sendId),
  };
}

/** A press is sending its email now: its claim is younger than a press can live. */
export function feedbackIsClaimed(piece: Pick<CourseFeedbackDoc, "emailedAt" | "emailClaimedAt">, now: Date): boolean {
  return (
    piece.emailedAt === null &&
    piece.emailClaimedAt !== null &&
    now.getTime() - piece.emailClaimedAt.getTime() < FEEDBACK_CLAIM_STALE_MS
  );
}

/** Its email is still owed: not emailed, and no press is sending it. */
export function feedbackEmailOwed(piece: Pick<CourseFeedbackDoc, "emailedAt" | "emailClaimedAt">, now: Date): boolean {
  return piece.emailedAt === null && !feedbackIsClaimed(piece, now);
}

/** One row of the batch's own record, read. */
export type CourseFeedbackSendDoc = {
  id: string;
  runId: string;
  kind: "test" | "send" | "press";
  byUid: string;
  at: Date | null;
};

/** A stored row of the batch's record, read. Never throws. */
export function normalizeCourseFeedbackSend(id: string, data: Raw): CourseFeedbackSendDoc {
  const kind = data.kind === "test" || data.kind === "send" || data.kind === "press" ? data.kind : "send";
  return { id, runId: str(data.runId), kind, byUid: str(data.byUid), at: instant(data.at) };
}
