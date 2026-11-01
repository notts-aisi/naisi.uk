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
import { dueMoment, isLate } from "../weekBlocks/due";
import { isBlockWeek, partsOf, type When, type WordRange } from "../weekBlocks/model";
import type { Prose } from "../weekBlocks/prose";
import { weekWrittenAnswers } from "../weekBlocks/reader";
import { londonDateKey } from "../weekPlan";
import {
  liveGroupsOf,
  reviewableIn,
  reviewerFactsOf,
  writtenReviewRole,
  type OwnerFacts,
  type ReviewRole,
  type ReviewerFacts,
} from "./access";
import {
  answerNameOf,
  answerState,
  isWordCountedAnswer,
  readWrittenAnswer,
  type AnswerState,
  type WrittenAnswerRecord,
} from "./model";
import { workIsReadable, type WeekWorkState } from "../weekWork/model";
import { loadRunWeekStates } from "../weekWork/readers";
import { byOldest, staffCardOf, staffLegacyCardOf, type StaffFeedbackCard } from "../feedback/model";
import { legacyRoleOf, readWeekFeedback } from "../feedback/readers";
import { mayRateWorkOf, workRatingRoleOf } from "../workRatings/access";
import type { TeamRatingsView } from "../workRatings/model";
import { loadTeamRatings } from "../workRatings/readers";
import { writtenAnswerWords } from "../coursework/input";
import { readAnswerReading, type AnswerReading } from "../coursework/pangramReadings";

/**
 * WHAT THE REVIEW PAGE SHOWS (boards wk-review, wk-review-phone), worked
 * out on the server once, after the page's gate, for the group's
 * facilitators' page and the lead's page alike.
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
 * answer or on the week as a whole. The person open on the page carries
 * every piece on their week as a card, with feedback given before pieces
 * existed (the answer row's own `feedback`, with rubric levels) as one more,
 * already emailed; and the reader's own piece on the answer, while its email
 * has not gone, for "Your feedback" to change. No rubric level is given here
 * any more.
 *
 * THE READING GATE (privacy v15): an answer's words, and its count of words,
 * leave here only when `workIsReadable` says its readers may read it: the
 * week submitted or locked, or the answer sent before weeks were submitted.
 * Until then the page says only that it is started ("Started"), and a week
 * reopened reads "Reopened, not submitted again". Where each week stands is
 * read once for the run (`loadRunWeekStates`).
 *
 * RATINGS FOR THE TEAM (`src/lib/courses/workRatings/`, privacy v15): the
 * person open on the page carries every rating on their answer, and the
 * reader's own, only for a reader who gives and reads them (an admin, or the
 * programme's lead: `mayRateWorkOf`). For anybody else, a facilitator above
 * all, `team` is null and no rating is read. Pangram's last reading of the
 * answer is read for an admin alone (`pangram`), never for the lead.
 *
 * Reads: the run's groups and the reader's standing (the gate's), the run's
 * enrolments by one equality, the group's own copy of the week, each
 * person's row by its id, the week's feedback by two equalities, the names,
 * and the course's time for work due the day before; for an admin or the
 * lead, the open answer's ratings by two equalities, and for an admin its
 * Pangram reading by its id. No query needs a declared index.
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
  /**
   * Its words may be read (`workIsReadable`): the week submitted or locked, or
   * the answer sent before weeks were submitted. Never the words, nor their
   * count, otherwise.
   */
  readable: boolean;
  /** Where their week stands, and when it was submitted or locked (ISO 8601). */
  week: { state: WeekWorkState["kind"]; at: string | null; joinedLate: boolean };
  /** ISO 8601: first sent, never moved; null for a draft or nothing. */
  firstSentAt: string | null;
  /** First sent after the group's due moment. Staff only. */
  late: boolean;
  /** Its count of words, while it may be read; 0 otherwise. */
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

export type ReviewSelected = {
  person: ReviewPerson;
  /** An answer of one box. */
  text: string;
  /** An answer in labelled boxes, box id to words, or null. */
  boxes: Record<string, string> | null;
  editedAt: string | null;
  /** Every piece of feedback on their week, oldest first, the reader's own changeable piece on the answer left out. */
  cards: StaffFeedbackCard[];
  /** The reader's own piece on the answer while its email has not gone: what "Your feedback" changes. */
  own: StaffFeedbackCard | null;
  /** What the reader may do with this answer: give feedback, and reopen the week. */
  role: ReviewRole;
  /**
   * Ratings for the team on this answer, for an admin or the programme's
   * lead; null for every other reader, a facilitator above all, for whom no
   * rating is read.
   */
  team: TeamRatingsView | null;
  /** Pangram's last reading of this answer, for an admin alone; null for everybody else, and when it was never checked. */
  pangram: AnswerReading | null;
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
  selected: ReviewSelected | null;
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
 * The review page for one group, as `actor` may see it. `askedWeek` and
 * `askedPerson` come from the address and are checked here: a week the
 * group does not teach, or somebody the reader may not review, is ignored.
 */
export async function loadWrittenReview(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  askedWeek: number | null,
  askedPerson: string | null,
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
  // Three names each: the one the reader is shown a person by (the names
  // rule), the name they go by, which signs feedback for every reader, and
  // its first word, for a sentence.
  const shownName = new Map<string, string>();
  const goByName = new Map<string, string>();
  const firstName = new Map<string, string>();
  for (const snap of userSnaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    shownName.set(snap.id, nameForViewer(actor, accountNamesOf(data), "NAISI member"));
    goByName.set(snap.id, fullNameOfUser(data));
    firstName.set(snap.id, firstNameOfUser(data) || fullNameOfUser(data));
  }

  const due = answer ? dueMoment(resolveSessions(run, group), weekNumber, answer.due, dayBeforeTime) : null;
  const personOf = (owner: OwnerFacts): ReviewPerson => {
    const record = records.get(owner.uid) ?? null;
    const facilitates = liveGroups.some((candidate) => candidate.facilitatorUids.includes(owner.uid));
    const standing = states.stateOf(owner.uid, weekNumber);
    const readable = record !== null && workIsReadable(standing, record);
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
      week: {
        state: standing.kind,
        at: standing.kind === "submitted" || standing.kind === "locked" ? standing.at.toISOString() : null,
        joinedLate: standing.kind === "open" && standing.by === "joined-late",
      },
      firstSentAt: record?.firstSentAt ? record.firstSentAt.toISOString() : null,
      late: record?.firstSentAt ? isLate(record.firstSentAt, due) : false,
      words: readable ? (record?.words ?? 0) : 0,
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
  // never sent, when its week locked at the session.
  const sentKey = (person: ReviewPerson) => person.firstSentAt ?? (person.week.state === "locked" ? person.week.at : null) ?? "";
  const bySent = (a: ReviewPerson, b: ReviewPerson) => sentKey(a).localeCompare(sentKey(b)) || a.name.localeCompare(b.name);
  // Only an answer its readers may read is given feedback on or opened here.
  const toGive = all.filter((person) => person.readable && person.words > 0 && !person.hasFeedback).sort(bySent);
  const feedbackSent = all.filter((person) => person.readable && person.hasFeedback).sort(bySent);
  const opened = new Set([...toGive, ...feedbackSent].map((person) => person.uid));
  const started = (person: ReviewPerson) => person.state !== "not-started";
  const notSent = all
    .filter((person) => !opened.has(person.uid))
    .sort((a, b) => (started(a) === started(b) ? a.name.localeCompare(b.name) : started(a) ? -1 : 1));

  // Who is open on the page: the one asked for, if the reader may review
  // them and may read their answer; else the first waiting, else the first
  // with feedback.
  const readable = [...toGive, ...feedbackSent];
  const chosen =
    (askedPerson ? readable.find((person) => person.uid === askedPerson) : undefined) ?? toGive[0] ?? feedbackSent[0] ?? null;
  let selected: ReviewSelected | null = null;
  if (chosen && answer && chosen.readable) {
    const record = records.get(chosen.uid) ?? null;
    const owner = people.find((candidate) => candidate.uid === chosen.uid) as OwnerFacts;
    const role = writtenReviewRole(actor, facts, owner, liveGroups);
    const names = { firstName: (uid: string) => firstName.get(uid) ?? "", goByName: (uid: string) => goByName.get(uid) ?? "" };
    const reader = { uid: actor.uid, isAdmin: facts.isAdmin, now };
    const cards = byOldest([
      ...(record?.feedback
        ? [staffLegacyCardOf(answer.id, record.feedback, legacyRoleOf(record.feedback.byUid, group.facilitatorUids), names, reader)]
        : []),
      ...(piecesOf.get(chosen.uid) ?? []).map((piece) => staffCardOf(piece, names, reader)),
    ]);
    // "Your feedback" changes the reader's newest piece on the answer while it may change.
    const own =
      [...cards].reverse().find((card) => card.mine && card.mayChange && card.on === "writtenAnswer" && !card.legacy) ?? null;
    // Ratings for the team, read for an admin or the programme's lead and for
    // nobody else; Pangram's reading of the answer for an admin alone.
    const [team, pangram] = await Promise.all([
      mayRateWorkOf(actor, facts, owner, liveGroups)
        ? loadTeamRatings(db, {
            runId: run.id,
            uid: chosen.uid,
            weekId,
            itemId: answer.id,
            viewer: { uid: actor.uid, role: workRatingRoleOf(facts) },
          })
        : Promise.resolve(null),
      facts.isAdmin && record
        ? readAnswerReading(db, {
            runId: run.id,
            uid: chosen.uid,
            rowId: exerciseResponseId(run.id, chosen.uid, weekId, answer.id),
            words: writtenAnswerWords(answer.boxes, record),
          })
        : Promise.resolve(null),
    ]);
    selected = {
      person: chosen,
      text: record?.text ?? "",
      boxes: record?.boxes ?? null,
      editedAt: record?.editedAt ? record.editedAt.toISOString() : null,
      cards: cards.filter((card) => card !== own),
      own,
      role,
      team,
      pangram,
    };
  }

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
    selected,
    viewer: { uid: actor.uid, firstName: firstName.get(actor.uid) ?? "", isAdmin: facts.isAdmin },
    programme: programme?.shortName ?? "",
    todayKey: londonDateKey(now),
  };
}
