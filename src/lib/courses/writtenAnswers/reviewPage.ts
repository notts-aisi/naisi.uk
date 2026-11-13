import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import {
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { exerciseResponseId, isReflectionResponse } from "@/lib/firestore/courseExercises";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourse, weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { memberCurrentWeek, resolveCalendar, resolveWeekDoc } from "../groupResolve";
import { firstNameOfUser, fullNameOfUser } from "../programmeLead";
import { resolveSessions } from "../sessions";
import { dueMoment } from "../weekBlocks/due";
import { isBlockWeek, partsOf, type When, type WordRange } from "../weekBlocks/model";
import type { Prose } from "../weekBlocks/prose";
import { weekWrittenAnswers } from "../weekBlocks/reader";
import { londonDateKey } from "../weekPlan";
import { liveGroupsOf, reviewableIn, reviewerFactsOf, type OwnerFacts, type ReviewerFacts } from "./access";
import {
  answerNameOf,
  answerPiece,
  answerState,
  isWordCountedAnswer,
  readWrittenAnswer,
  type AnswerState,
  type WrittenAnswerRecord,
} from "./model";
import { afterItsDeadline, lateBy, type DueBy } from "../weekWork/model";
import { loadRunWeekStates } from "../weekWork/readers";
import { lastSentAt, readableAnswer } from "../weekWork/versions";
import { readWeekFeedback } from "../feedback/readers";

/**
 * THE PAGE IS RETIRED (Fri 13 Nov 2026): the written answer's review page's
 * addresses forward to the reading views
 * (`src/lib/courses/coursework/forwards.ts`), and the reading view of one
 * person's week shows what its open answer showed, by the same rules. This
 * loader stays as the reader behind This week's work's Written answer column
 * (`src/lib/courses/facilitatorWeek/workColumns.ts`), which draws its lists
 * of people and nothing else. So it works out those lists alone: it opens
 * nobody's answer, and reads no rating, no Pangram reading, no session
 * report's lines and no earlier wording of a question.
 *
 * WHAT IT WORKS OUT, on the server once, after the page's gate, for the
 * group's facilitators' page and the lead's page alike.
 *
 * Every person on it is somebody the reader may review, by the one gate
 * (`reviewableIn`, `writtenReviewRole`): for a facilitator, the group's
 * fellows but its facilitators; for the lead and admins, those and the
 * group's facilitators' own answers. Grouped as the board draws: "To give
 * feedback on" (an answer they may read, with no feedback from anyone yet),
 * "With feedback", "Not submitted yet" (everybody else). "Late" travels
 * here, to staff, and nowhere a writer reads.
 *
 * FEEDBACK IS A SIGNED COMMENT (`src/lib/courses/feedback/`): any number of
 * pieces on a person's week, from different people, each on the written
 * answer or on the week as a whole. Each person carries whether anybody has
 * left feedback on their answer and who, first names only, oldest first;
 * never the pieces themselves.
 *
 * THE READING GATE (privacy v17, "Changing your work"): an answer's words,
 * and its count of words, leave here only as `readableAnswer` says its
 * readers may read them: before the session the person is due at, the words
 * as LAST SENT (a change since is not read until it is sent again); once that
 * session has started, the latest words, sent or not. Never sent, before the
 * session, the page says only that it is started ("Started"). The session
 * each person is due at is read once for the run (`loadRunWeekStates`).
 *
 * WHAT EACH PERSON CARRIES (the week stays open): when the answer last
 * changed and was last sent, how long after the session each was (late is
 * always from the session), and whether it was first sent after its own
 * deadline but before the session ("After its deadline", staff only).
 *
 * Reads: the run's groups and the reader's standing (the gate's), the run's
 * enrolments by one equality, the group's own copy of the week, each
 * person's row by its id, the week's feedback by two equalities, the names,
 * and the course's time for work due the day before. No query needs a
 * declared index.
 */

export type ReviewPerson = {
  uid: string;
  /**
   * The name by the names rule for the reader (`nameForViewer`): the
   * committee and admins see "Priya Shah (Pri)", a facilitator who is not on
   * it the name people go by.
   */
  name: string;
  firstName: string;
  state: AnswerState;
  /** Its words may be read (`readableAnswer`): sent, or the session they were due at has started. */
  readable: boolean;
  /**
   * The page as it was before the week stayed open, until it is redrawn:
   * always "open" now (nothing is submitted, locked or reopened), with no
   * time, and whether they joined their group after the week's session.
   */
  week: { state: "open" | "submitted" | "locked" | "reopened"; at: string | null; joinedLate: boolean };
  /** The session they were due at that week (ISO 8601), or null with none; `by` says why. */
  due: { at: string | null; by: DueBy };
  /** ISO 8601: first sent, never moved; null for a draft or nothing. */
  firstSentAt: string | null;
  /** ISO 8601: last sent; null for a draft or nothing. */
  sentAt: string | null;
  /** Changed since it was last sent: before the session its readers read it as sent. */
  changedSinceSent: boolean;
  /** ISO 8601: when its words last changed, while it may be read; null otherwise. */
  changedAt: string | null;
  /** How long after the session its words last changed (ms), while it may be read; null when not after it. */
  changedLateMs: number | null;
  /** How long after the session it was last sent (ms); null when not after it, or never sent. */
  sentLateMs: number | null;
  /** The page as it was: first sent after the session it was due at ("Late"). Staff only. */
  late: boolean;
  /** First sent after its own deadline, but before the session ("After its deadline"). Staff only. */
  afterDeadline: boolean;
  /** Its count of words, as its readers read it (`readableAnswer`), while it may be read; 0 otherwise. */
  words: number;
  openedAt: string | null;
  openedByUid: string | null;
  openedByName: string | null;
  /** Feedback on their written answer from anyone: a piece on it, or feedback given before pieces existed. */
  hasFeedback: boolean;
  /** Who left it, each once, oldest first: their uids and first names. */
  feedbackByUids: string[];
  feedbackByNames: string[];
  /** Their own answer as somebody who facilitates a group of the run: the lead's and admins'. */
  facilitates: boolean;
};

export type ReviewPageModel = {
  runId: string;
  group: { id: string; name: string };
  weekNumber: number;
  weekId: string;
  /** The group's taught weeks, in its own plan order. */
  weeks: number[];
  /** The week's written answer, or null when the week has none. */
  answer: {
    id: string;
    prompt: Prose;
    boxes: Array<{ id: string; label: string; hint: string }>;
    words: WordRange | null;
    due: When;
    /** "your threat model". */
    answerName: string;
  } | null;
  toGive: ReviewPerson[];
  feedbackSent: ReviewPerson[];
  notSent: ReviewPerson[];
  viewer: { uid: string; firstName: string; isAdmin: boolean };
  /** The programme's short name, for "Claudia, who leads AGI Strategy"; "" when no programme names the run. */
  programme: string;
  /** Today in London, for "at 9:58am" against "on Tue 17 Nov at 9:58am". */
  todayKey: string;
};

/** Every told placement on the run, as the gate reads an owner. */
function ownersOf(
  enrolments: readonly CourseEnrolmentDoc[],
  liveGroups: readonly CourseGroupDoc[],
  viewer: { isAdmin: boolean },
): OwnerFacts[] {
  const live = new Set(liveGroups.map((group) => group.id));
  return enrolments
    .filter(
      (enrolment) =>
        enrolment.role === "learner" &&
        (enrolment.status === "active" || enrolment.status === "completed") &&
        enrolment.groupId !== null &&
        live.has(enrolment.groupId) &&
        placementIsShownTo(enrolment, viewer),
    )
    .map((enrolment) => ({ uid: enrolment.uid, placedGroupId: enrolment.groupId }));
}

/** The week the page opens on when none is asked for: the group's own, or its first taught week. */
function defaultWeek(run: CourseRunDoc, group: CourseGroupDoc, weeks: readonly number[], now: Date): number {
  let week = weeks[0] ?? 1;
  try {
    const current = memberCurrentWeek(run, group, now);
    const target = current.weekNumber ?? (current.anchorWeekNumber > 0 ? current.anchorWeekNumber : null);
    if (target !== null && weeks.includes(target)) week = target;
  } catch {
    // A calendar with no usable start date: the first taught week stands.
  }
  return week;
}

/**
 * One group's written answers for a week, as `actor` may see them: the lists
 * of people alone. `askedWeek` is checked here: a week the group does not
 * teach is ignored.
 */
export async function loadWrittenReview(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  askedWeek: number | null,
  now: Date,
  given?: { liveGroups: CourseGroupDoc[]; facts: ReviewerFacts },
): Promise<ReviewPageModel> {
  const liveGroups = given?.liveGroups ?? (await liveGroupsOf(db, run.id));
  const facts = given?.facts ?? (await reviewerFactsOf(db, actor, run.id));
  const weeks = resolveCalendar(run, group).weekPlan.flatMap((entry) => (entry.kind === "week" ? [entry.weekNumber] : []));
  const weekNumber = askedWeek !== null && weeks.includes(askedWeek) ? askedWeek : defaultWeek(run, group, weeks, now);
  const weekId = weekDocId(weekNumber);

  const [enrolSnap, resolved, courseSnap, programme] = await Promise.all([
    db.collection("courseEnrolments").where("runId", "==", run.id).get(),
    resolveWeekDoc(db, run.id, group.id, weekId),
    run.courseId ? db.collection("courses").doc(run.courseId).get() : Promise.resolve(null),
    runProgrammeOf(db, run.id).catch(() => null),
  ]);
  const enrolments = enrolSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
  const owners = ownersOf(enrolments, liveGroups, { isAdmin: facts.isAdmin });
  const people = reviewableIn(actor, facts, group, owners, liveGroups);
  const dayBeforeTime = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}).dayBeforeDueTime : null;

  const week = resolved.week;
  const block = week && isBlockWeek(week) ? (weekWrittenAnswers(week)[0] ?? null) : null;
  const fullBlock =
    week && isBlockWeek(week) && block
      ? (partsOf(week.blocks).flatMap((part) => part.blocks).find((child) => child.id === block.id) ?? null)
      : null;
  const part = week && isBlockWeek(week) && block ? (partsOf(week.blocks).find((candidate) => candidate.id === block.partId) ?? null) : null;
  const answer =
    block && fullBlock && fullBlock.type === "writtenAnswer"
      ? {
          id: block.id,
          prompt: fullBlock.prompt,
          boxes: fullBlock.boxes.map((box) => ({ id: box.id, label: box.label, hint: box.hint })),
          words: fullBlock.words,
          due: fullBlock.due,
          answerName: answerNameOf(part?.title ?? ""),
        }
      : null;

  // Where each person's week stands, for whether their answer may be read, and the week's feedback.
  const [states, weekFeedback] = await Promise.all([
    loadRunWeekStates(db, { run, liveGroups, enrolments, now }),
    readWeekFeedback(db, run.id, weekId),
  ]);
  const reviewable = new Set(people.map((owner) => owner.uid));
  const piecesOf = new Map<string, typeof weekFeedback>();
  for (const piece of weekFeedback) {
    if (!reviewable.has(piece.uid)) continue;
    piecesOf.set(piece.uid, [...(piecesOf.get(piece.uid) ?? []), piece]);
  }
  const onTheAnswer = (uid: string) =>
    (piecesOf.get(uid) ?? []).filter((piece) => answer !== null && piece.on.kind === "writtenAnswer" && piece.on.itemId === answer.id);
  // Each person's row, by its id: nobody's but theirs.
  const records = new Map<string, WrittenAnswerRecord>();
  if (answer && people.length > 0) {
    const snaps = await db.getAll(
      ...people.map((owner) => db.collection("courseExerciseResponses").doc(exerciseResponseId(run.id, owner.uid, weekId, answer.id))),
    );
    snaps.forEach((snap, index) => {
      const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
      if (data && !isReflectionResponse(data) && isWordCountedAnswer(data) && data.uid === people[index].uid) {
        records.set(people[index].uid, readWrittenAnswer(data));
      }
    });
  }

  // Names: the people, and whoever opened, reopened or left feedback.
  const nameUids = new Set<string>([actor.uid, ...people.map((owner) => owner.uid)]);
  for (const record of records.values()) {
    for (const uid of [record.openedByUid, record.reopenedByUid, record.feedback?.byUid ?? ""]) if (uid) nameUids.add(uid);
  }
  for (const piece of weekFeedback) if (piece.byUid && reviewable.has(piece.uid)) nameUids.add(piece.byUid);
  for (const uid of group.facilitatorUids) nameUids.add(uid);
  const userSnaps = await db.getAll(...[...nameUids].map((uid) => db.collection("users").doc(uid)));
  // Two names each: the one the reader is shown a person by (the names
  // rule), and the first word of the name they go by, for a sentence.
  const shownName = new Map<string, string>();
  const firstName = new Map<string, string>();
  for (const snap of userSnaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    shownName.set(snap.id, nameForViewer(actor, accountNamesOf(data), "NAISI member"));
    firstName.set(snap.id, firstNameOfUser(data) || fullNameOfUser(data));
  }

  // The block's own deadline, for "After its deadline" (staff only).
  const deadline = answer ? dueMoment(resolveSessions(run, group), weekNumber, answer.due, dayBeforeTime) : null;
  const personOf = (owner: OwnerFacts): ReviewPerson => {
    const record = records.get(owner.uid) ?? null;
    const facilitates = liveGroups.some((candidate) => candidate.facilitatorUids.includes(owner.uid));
    const due = states.dueOf(owner.uid, weekNumber);
    // What its readers read of it, if anything: the one answer.
    const read = record ? readableAnswer(answerPiece(record), due.at, now) : null;
    const readable = read !== null;
    const sent = record ? lastSentAt(answerPiece(record)) : null;
    // Who left feedback on the answer, each once, oldest first: feedback from before pieces, then the pieces.
    const writers: string[] = [];
    const given = [
      ...(record?.feedback ? [{ byUid: record.feedback.byUid, at: record.feedback.sentAt }] : []),
      ...onTheAnswer(owner.uid).map((piece) => ({ byUid: piece.byUid, at: piece.createdAt })),
    ].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
    for (const entry of given) if (entry.byUid && !writers.includes(entry.byUid)) writers.push(entry.byUid);
    return {
      uid: owner.uid,
      name: shownName.get(owner.uid) ?? "NAISI member",
      firstName: firstName.get(owner.uid) ?? "NAISI member",
      state: answerState(record),
      readable,
      week: { state: "open", at: null, joinedLate: due.by === "joined-late" },
      due: { at: due.at ? due.at.toISOString() : null, by: due.by },
      firstSentAt: record?.firstSentAt ? record.firstSentAt.toISOString() : null,
      sentAt: sent ? sent.toISOString() : null,
      changedSinceSent: Boolean(sent && record?.savedAt && record.savedAt.getTime() > sent.getTime()),
      // Of the words its readers read: never when a change not sent yet was saved.
      changedAt: read?.savedAt ? read.savedAt.toISOString() : null,
      changedLateMs: read ? lateBy(read.savedAt, due) : null,
      sentLateMs: lateBy(sent, due),
      late: lateBy(record?.firstSentAt ?? null, due) !== null,
      afterDeadline: afterItsDeadline(record?.firstSentAt ?? null, deadline?.at ?? null, due),
      words: readable ? (read?.words ?? 0) : 0,
      openedAt: record?.openedAt ? record.openedAt.toISOString() : null,
      openedByUid: record?.openedAt ? record.openedByUid || null : null,
      openedByName: record?.openedAt && record.openedByUid ? (firstName.get(record.openedByUid) ?? null) : null,
      hasFeedback: given.length > 0,
      feedbackByUids: writers,
      feedbackByNames: writers.map((uid) => firstName.get(uid) ?? ""),
      facilitates,
    };
  };
  const all = people.map(personOf);
  // Oldest first, as the review queue lists them: when it was first sent, or,
  // never sent, from the session they were due at, since when it may be read.
  const sentKey = (person: ReviewPerson) => person.firstSentAt ?? (person.readable ? person.due.at : null) ?? "";
  const bySent = (a: ReviewPerson, b: ReviewPerson) => sentKey(a).localeCompare(sentKey(b)) || a.name.localeCompare(b.name);
  // Only an answer its readers may read is given feedback on or opened here.
  const toGive = all.filter((person) => person.readable && person.words > 0 && !person.hasFeedback).sort(bySent);
  const feedbackSent = all.filter((person) => person.readable && person.hasFeedback).sort(bySent);
  const opened = new Set([...toGive, ...feedbackSent].map((person) => person.uid));
  const started = (person: ReviewPerson) => person.state !== "not-started";
  const notSent = all
    .filter((person) => !opened.has(person.uid))
    .sort((a, b) => (started(a) === started(b) ? a.name.localeCompare(b.name) : started(a) ? -1 : 1));

  return {
    runId: run.id,
    group: { id: group.id, name: group.name.trim() || "Your group" },
    weekNumber,
    weekId,
    weeks,
    answer,
    toGive,
    feedbackSent,
    notSent,
    viewer: { uid: actor.uid, firstName: firstName.get(actor.uid) ?? "", isAdmin: facts.isAdmin },
    programme: programme?.shortName ?? "",
    todayKey: londonDateKey(now),
  };
}
