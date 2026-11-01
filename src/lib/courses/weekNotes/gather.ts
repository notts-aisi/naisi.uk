import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { loadAnswers } from "@/lib/courses/coursework/gather";
import type { CourseworkAnswer, CourseworkWeek, NoteFeedback, NoteRating, NoteWeek } from "@/lib/courses/coursework/input";
import { readOwnFeedback, readWeekFeedback } from "@/lib/courses/feedback/readers";
import { readRunWeekWork, readWeekWork } from "@/lib/courses/weekWork/readers";
import { readPersonRatings, readWeekRatings } from "@/lib/courses/workRatings/readers";
import type { CourseFeedbackDoc } from "@/lib/firestore/courseFeedback";
import type { CourseWorkRatingDoc } from "@/lib/firestore/courseWorkRatings";
import type { CourseWeekWorkDoc } from "@/lib/firestore/courseWeekWork";
import { reviewUseFrom } from "@/lib/legal/reviewUse";

/**
 * WHAT A NOTE ABOUT A PERSON IS DRAFTED FROM (privacy v15: "using only the
 * work they submitted and the feedback, ratings and comments people on the
 * team gave it"), read on the Admin SDK after each caller's own door: the
 * end-of-week notes' page and draft route (an admin's), and the profile's
 * "Draft a note with Claude" (an admin's). `noteDraftInput`
 * (`src/lib/courses/coursework/input.ts`) builds the message from what this
 * hands it, and decides what of it goes.
 *
 * What it reads, and nothing else: where each week stands (the week's own
 * record: a week counts only while it is submitted, and a reopen takes that
 * away), the person's coursework through the coursework's one reader
 * (`loadAnswers`, which marks each row counted under version 13), the
 * feedback on their weeks (through feedback's own readers), the ratings for
 * the team of their written answers (through the ratings' own readers), and
 * the accounts of the person and of everybody who wrote or rated, for each
 * one's version 15 moment (`reviewUseFrom`). Never a survey
 * or check-in, a session report, Claude's own grades or a register: this
 * file imports none of their code, and `tests/week-notes.test.mjs` holds
 * that.
 *
 * Every query is equalities only, filtered again in memory, so nothing needs
 * a declared index.
 */

/** Everything one person's draft is built from, before `noteDraftInput` decides what goes. */
export type PersonNoteSources = {
  /** Their weeks that are submitted now, each with its questions and when it was submitted. */
  weeks: NoteWeek[];
  answers: CourseworkAnswer[];
  feedback: NoteFeedback[];
  ratings: NoteRating[];
  /** Their own privacy v15 moment, or null. */
  from: Date | null;
  /** Each feedback writer's and rater's privacy v15 moment. */
  writerFrom: Map<string, Date | null>;
};

type Raw = Record<string, unknown>;

/** Accounts per addressed read, well inside `getAll`'s limits. */
const ACCOUNT_BATCH = 300;

/** Each account's privacy v15 moment, by uid; an account that has gone has none. */
async function momentsOf(db: Firestore, uids: Iterable<string>): Promise<Map<string, Date | null>> {
  const out = new Map<string, Date | null>();
  const unique = [...new Set(uids)].filter((uid) => uid && !uid.includes("/"));
  for (let at = 0; at < unique.length; at += ACCOUNT_BATCH) {
    const snaps = await db.getAll(...unique.slice(at, at + ACCOUNT_BATCH).map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) out.set(snap.id, snap.exists ? reviewUseFrom((snap.data() ?? {}) as Raw) : null);
  }
  return out;
}

/** A piece of feedback as a note's draft reads it: a comment, with when its words were last written. */
export function noteFeedbackOf(piece: CourseFeedbackDoc): NoteFeedback {
  return {
    id: piece.id,
    weekId: piece.weekId,
    itemId: piece.on.kind === "writtenAnswer" ? piece.on.itemId : null,
    byUid: piece.byUid,
    role: piece.byRole,
    text: piece.text,
    at: piece.editedAt ?? piece.createdAt,
  };
}

/** A rating for the team as a note's draft reads it, or null for one off the scale, which no reader shows. */
export function noteRatingOf(rating: CourseWorkRatingDoc): NoteRating | null {
  if (rating.rating === null || !rating.itemId) return null;
  return {
    weekId: rating.weekId,
    itemId: rating.itemId,
    raterUid: rating.raterUid,
    role: rating.raterRole,
    rating: rating.rating,
    comment: rating.comment,
    at: rating.updatedAt ?? rating.createdAt,
  };
}

/** The weeks of `weeks` this person has submitted, from their stored week records. */
function submittedWeeks(weeks: readonly CourseworkWeek[], recordOf: (weekId: string) => CourseWeekWorkDoc | null): NoteWeek[] {
  const out: NoteWeek[] = [];
  for (const week of weeks) {
    const submittedAt = recordOf(week.weekId)?.submittedAt ?? null;
    if (submittedAt) out.push({ week, submittedAt });
  }
  return out;
}

/**
 * ONE PERSON'S SOURCES on one run, over `weeks` (one week for the end-of-week
 * draft, every week of the run for the profile's): their week records by
 * address, their coursework (one equality on `uid`), their feedback and
 * ratings on the run (equalities on `uid` and `runId`), and the accounts.
 */
export async function gatherPersonNote(
  db: Firestore,
  input: { runId: string; uid: string; weeks: readonly CourseworkWeek[] },
): Promise<PersonNoteSources> {
  const { runId, uid } = input;
  const [records, answers, pieces, rated] = await Promise.all([
    Promise.all(input.weeks.map((week) => readWeekWork(db, runId, uid, week.weekId))),
    loadAnswers(db, runId, input.weeks, new Set([uid])),
    readOwnFeedback(db, runId, uid),
    readPersonRatings(db, { runId, uid }),
  ]);
  const byWeek = new Map(input.weeks.map((week, index) => [week.weekId, records[index] ?? null]));
  const weekIds = new Set(input.weeks.map((week) => week.weekId));
  const feedback = pieces.filter((piece) => weekIds.has(piece.weekId)).map(noteFeedbackOf);
  const ratings = rated
    .filter((rating) => weekIds.has(rating.weekId))
    .map(noteRatingOf)
    .filter((rating): rating is NoteRating => rating !== null);
  const moments = await momentsOf(db, [uid, ...feedback.map((piece) => piece.byUid), ...ratings.map((rating) => rating.raterUid)]);
  return {
    weeks: submittedWeeks(input.weeks, (weekId) => byWeek.get(weekId) ?? null),
    answers: answers.filter((answer) => answer.uid === uid),
    feedback,
    ratings,
    from: moments.get(uid) ?? null,
    writerFrom: moments,
  };
}

/**
 * EVERYBODY'S SOURCES FOR ONE WEEK of a run, for the week's Notes page: the
 * run's week records (one equality on `runId`), the week's coursework by
 * `people` (one equality on `runId`), the week's feedback and ratings
 * (equalities on `runId` and `weekId`), and every account named. Built to
 * hand `noteDraftInput` exactly what `gatherPersonNote` would for each
 * person, so the page's count of what would go and its out-of-date check
 * agree with a press.
 */
export async function gatherWeekNotes(
  db: Firestore,
  input: { runId: string; week: CourseworkWeek | null; weekId: string; people: ReadonlySet<string> },
): Promise<Map<string, PersonNoteSources>> {
  const { runId, week, weekId, people } = input;
  const [records, answers, pieces, rated] = await Promise.all([
    readRunWeekWork(db, runId),
    week && people.size > 0 ? loadAnswers(db, runId, [week], people) : Promise.resolve([] as CourseworkAnswer[]),
    readWeekFeedback(db, runId, weekId),
    readWeekRatings(db, { runId, weekId }),
  ]);
  const feedback = pieces.filter((piece) => people.has(piece.uid));
  const ratings = rated.filter((rating) => people.has(rating.uid));
  const moments = await momentsOf(db, [...people, ...feedback.map((piece) => piece.byUid), ...ratings.map((rating) => rating.raterUid)]);
  const out = new Map<string, PersonNoteSources>();
  for (const uid of people) {
    out.set(uid, {
      weeks: week ? submittedWeeks([week], (id) => records.get(uid)?.get(id) ?? null) : [],
      answers: answers.filter((answer) => answer.uid === uid),
      feedback: feedback.filter((piece) => piece.uid === uid).map(noteFeedbackOf),
      ratings: ratings
        .filter((rating) => rating.uid === uid)
        .map(noteRatingOf)
        .filter((rating): rating is NoteRating => rating !== null),
      from: moments.get(uid) ?? null,
      writerFrom: moments,
    });
  }
  return out;
}

/** Whether a person's week is submitted now: their week record says so, and nothing has reopened it since. */
export async function weekIsSubmitted(db: Firestore, input: { runId: string; uid: string; weekId: string }): Promise<boolean> {
  return (await readWeekWork(db, input.runId, input.uid, input.weekId))?.submittedAt != null;
}
