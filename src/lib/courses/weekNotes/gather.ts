import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { loadAnswers } from "@/lib/courses/coursework/gather";
import type { CourseworkAnswer, CourseworkWeek, NoteFeedback, NoteRating, NoteWeek } from "@/lib/courses/coursework/input";
import { readOwnFeedback, readWeekFeedback } from "@/lib/courses/feedback/readers";
import { liveGroupsOfRun } from "@/lib/courses/weeksTab/load";
import { sessionHasStarted } from "@/lib/courses/weekWork/model";
import { readRunForWork } from "@/lib/courses/weekWork/own";
import { loadRunWeekStates, type RunWeekStates } from "@/lib/courses/weekWork/readers";
import { readPersonRatings, readWeekRatings } from "@/lib/courses/workRatings/readers";
import type { CourseFeedbackDoc } from "@/lib/firestore/courseFeedback";
import type { CourseWorkRatingDoc } from "@/lib/firestore/courseWorkRatings";
import { reviewUseFrom } from "@/lib/legal/reviewUse";

/**
 * WHAT A NOTE ABOUT A PERSON IS DRAFTED FROM (privacy v18: "It is drafted
 * after your session, usually about a week after it, and uses your work on
 * that week as it stands then, sent or not, with the feedback, ratings and
 * comments people on the team gave it"), read on the Admin SDK after each
 * caller's own door: the end-of-week notes' page and draft route (an
 * admin's), and the profile's "Draft a note with Claude" (an admin's).
 * `noteDraftInput` (`src/lib/courses/coursework/input.ts`) builds the message
 * from what this hands it, and decides what of it goes.
 *
 * WHICH WEEKS: a week is drawn on once the session the person was due at for
 * it has started (`weekDueOf`, read through `loadRunWeekStates`: the same
 * "due" every other reader of work asks, `sessionHasStarted`), and never
 * before. A week with no such session for them (no group, no time set,
 * joined after it started) is not drawn on. The week's old Submit counts for
 * nothing here: a week submitted under it is a week like any other.
 *
 * WHAT OF IT: the person's work as it stands at `now`, through the
 * coursework's one reader (`loadAnswers`, handed the same sessions and clock,
 * which marks each row counted under version 13): each reflection and each
 * box as last saved, and each written answer as its latest saved words,
 * sent or not, which is how its readers read it once that session has
 * started (`readableAnswer`). Then the feedback on those weeks (through
 * feedback's own readers), the ratings for the team of their written answers
 * (through the ratings' own readers), and the accounts of the person and of
 * everybody who wrote or rated, for each one's version 15 moment
 * (`reviewUseFrom`). Never a survey or check-in, a session report, Claude's
 * own grades or a register: this file imports none of their code, and
 * `tests/week-notes.test.mjs` holds that.
 *
 * Every query is equalities only, filtered again in memory, so nothing needs
 * a declared index.
 */

/** Everything one person's draft is built from, before `noteDraftInput` decides what goes. */
export type PersonNoteSources = {
  /** Their weeks whose session has started, each with its questions and when its work was read. */
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

/** The session each person on a run is due at, by week, and the clock it is told against. */
type RunSessions = { dueOf: RunWeekStates["dueOf"]; now: Date };

/**
 * The sessions everybody on the run is due at (`loadRunWeekStates`, the one
 * sum), at `now`; null for a run that is gone, which draws on no week.
 */
async function sessionsOnRun(db: Firestore, runId: string, now: Date): Promise<RunSessions | null> {
  const [run, liveGroups] = await Promise.all([readRunForWork(db, runId), liveGroupsOfRun(db, runId)]);
  if (!run) return null;
  const states = await loadRunWeekStates(db, { run, liveGroups, now });
  return { dueOf: states.dueOf, now };
}

/** Whether `uid`'s week `weekNumber` is drawn on: the session they were due at for it has started. */
function drawnOn(sessions: RunSessions | null, uid: string, weekNumber: number): boolean {
  return sessions !== null && sessionHasStarted(sessions.dueOf(uid, weekNumber), sessions.now);
}

/**
 * ONE PERSON'S SOURCES on one run, over `weeks` (one week for the end-of-week
 * draft, every week of the run for the profile's): the weeks of them whose
 * session they were due at has started, their work in those weeks as it
 * stands (one equality on `uid`), their feedback and ratings on them
 * (equalities on `uid` and `runId`), and the accounts.
 */
export async function gatherPersonNote(
  db: Firestore,
  input: { runId: string; uid: string; weeks: readonly CourseworkWeek[]; now: Date },
): Promise<PersonNoteSources> {
  const { runId, uid, now } = input;
  const [sessions, pieces, rated] = await Promise.all([
    sessionsOnRun(db, runId, now),
    readOwnFeedback(db, runId, uid),
    readPersonRatings(db, { runId, uid }),
  ]);
  const weeks: NoteWeek[] = input.weeks.filter((week) => drawnOn(sessions, uid, week.weekNumber)).map((week) => ({ week, asOf: now }));
  const weekIds = new Set(weeks.map((entry) => entry.week.weekId));
  // Each answer as it stands now, read against the same sessions and clock.
  const answers =
    sessions && weeks.length > 0
      ? await loadAnswers(
          db,
          runId,
          weeks.map((entry) => entry.week),
          new Set([uid]),
          { session: sessions },
        )
      : ([] as CourseworkAnswer[]);
  const feedback = pieces.filter((piece) => weekIds.has(piece.weekId)).map(noteFeedbackOf);
  const ratings = rated
    .filter((rating) => weekIds.has(rating.weekId))
    .map(noteRatingOf)
    .filter((rating): rating is NoteRating => rating !== null);
  const moments = await momentsOf(db, [uid, ...feedback.map((piece) => piece.byUid), ...ratings.map((rating) => rating.raterUid)]);
  return {
    weeks,
    answers: answers.filter((answer) => answer.uid === uid && weekIds.has(answer.weekId)),
    feedback,
    ratings,
    from: moments.get(uid) ?? null,
    writerFrom: moments,
  };
}

/**
 * EVERYBODY'S SOURCES FOR ONE WEEK of a run, for the week's Notes page: the
 * sessions everybody is due at, the week's coursework by the people whose
 * session has started (one equality on `runId`, or on `uid` for one), the
 * week's feedback and ratings (equalities on `runId` and `weekId`), and every
 * account named. Built to hand `noteDraftInput` exactly what
 * `gatherPersonNote` would for each person, so the page's count of what would
 * go and its out-of-date check agree with a press.
 */
export async function gatherWeekNotes(
  db: Firestore,
  input: { runId: string; week: CourseworkWeek | null; weekId: string; people: ReadonlySet<string>; now: Date },
): Promise<Map<string, PersonNoteSources>> {
  const { runId, week, weekId, people, now } = input;
  const [sessions, pieces, rated] = await Promise.all([
    sessionsOnRun(db, runId, now),
    readWeekFeedback(db, runId, weekId),
    readWeekRatings(db, { runId, weekId }),
  ]);
  const drawn = new Set(week ? [...people].filter((uid) => drawnOn(sessions, uid, week.weekNumber)) : []);
  // Each answer as it stands now, read against the same sessions and clock (as `gatherPersonNote` reads them).
  const answers =
    week && sessions && drawn.size > 0 ? await loadAnswers(db, runId, [week], drawn, { session: sessions }) : ([] as CourseworkAnswer[]);
  const feedback = pieces.filter((piece) => drawn.has(piece.uid));
  const ratings = rated.filter((rating) => drawn.has(rating.uid));
  const moments = await momentsOf(db, [...people, ...feedback.map((piece) => piece.byUid), ...ratings.map((rating) => rating.raterUid)]);
  const out = new Map<string, PersonNoteSources>();
  for (const uid of people) {
    const weeks: NoteWeek[] = week && drawn.has(uid) ? [{ week, asOf: now }] : [];
    out.set(uid, {
      weeks,
      answers: answers.filter((answer) => answer.uid === uid && answer.weekId === weekId),
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

/** Whether a person's week is drawn on now: the session they were due at for it has started. */
export async function weekIsDrawnOn(db: Firestore, input: { runId: string; uid: string; weekNumber: number; now: Date }): Promise<boolean> {
  return drawnOn(await sessionsOnRun(db, input.runId, input.now), input.uid, input.weekNumber);
}
