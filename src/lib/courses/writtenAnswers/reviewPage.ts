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
  answerPiece,
  answerState,
  isWordCountedAnswer,
  readWrittenAnswer,
  type AnswerState,
  type WrittenAnswerRecord,
} from "./model";
import { afterItsDeadline, lateBy, type DueBy } from "../weekWork/model";
import { loadRunWeekStates } from "../weekWork/readers";
import { lastSentAt, readableAnswer, sameWords, versionAtSession, type ReadVersion } from "../weekWork/versions";
import { byOldest, staffCardOf, staffLegacyCardOf, type AboutVersion, type StaffFeedbackCard } from "../feedback/model";
import { legacyRoleOf, readWeekFeedback } from "../feedback/readers";
import { mayRateWorkOf, workRatingRoleOf } from "../workRatings/access";
import type { TeamRatingsView } from "../workRatings/model";
import { loadTeamRatings } from "../workRatings/readers";
import { writtenAnswerWords } from "../coursework/input";
import { readAnswerReading, type AnswerReading } from "../coursework/pangramReadings";
import { besideScopeOf, type ReportLinesView } from "../sessionReports/beside";
import { readReportLinesAbout } from "../sessionReports/readers";
import { askedThenFor, writtenAtOf } from "../weekEdit/askedThen";
import type { AskedWords } from "../weekEdit/wordsThen";

/**
 * WHAT THE REVIEW PAGE SHOWS, worked
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
 * THE READING GATE (privacy v17, "Changing your work"): an answer's words,
 * and its count of words, leave here only as `readableAnswer` says its
 * readers may read them: before the session the person is due at, the words
 * as LAST SENT (a change since is not read until it is sent again); once that
 * session has started, the latest words, sent or not. Never sent, before the
 * session, the page says only that it is started ("Started"). The session
 * each person is due at is read once for the run (`loadRunWeekStates`).
 *
 * WHAT A PAGE IS HANDED TO LABEL IT (the week stays open): when the answer
 * last changed and was last sent, how long after the session each was (late
 * is always from the session), whether it was first sent after its own
 * deadline but before the session ("After its deadline", staff only), the
 * version as it stood at the session when that differs from the one shown,
 * and on each piece of feedback the version it was about when the answer has
 * changed since.
 *
 * RATINGS FOR THE TEAM (`src/lib/courses/workRatings/`, privacy v15): the
 * person open on the page carries every rating on their answer, and the
 * reader's own, each saying whether the answer has changed since it, only
 * for a reader who gives and reads them (an admin, or the programme's lead:
 * `mayRateWorkOf`). For anybody else, a facilitator above
 * all, `team` is null and no rating is read. Pangram's last reading of the
 * answer is read for an admin alone (`pangram`), never for the lead.
 *
 * THE REPORT BESIDE THE WORK (`src/lib/courses/sessionReports/beside.ts`,
 * privacy v15's "Session reports"): the person open on the page carries what
 * that week's session reports say about them, their own lines and nothing
 * else of a report (`reportLines`). The programme's lead and admins see every
 * report's lines; a facilitator of the person's group sees only the lines of
 * the reports they wrote, never a co-facilitator's. Read only once the gate
 * has let the reader review the answer, and nothing is emailed.
 *
 * Reads: the run's groups and the reader's standing (the gate's), the run's
 * enrolments by one equality, the group's own copy of the week, each
 * person's row by its id, the week's feedback by two equalities, the names,
 * and the course's time for work due the day before; for an admin or the
 * lead, the open answer's ratings by two equalities, and for an admin its
 * Pangram reading by its id; the session reports that pick the open person
 * (an admin or the lead) or that the reader wrote (a facilitator), by one
 * clause, and the names of their other writers. No query needs a declared
 * index.
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

export type ReviewSelected = {
  person: ReviewPerson;
  /** An answer of one box, as its readers read it (`readableAnswer`). */
  text: string;
  /** An answer in labelled boxes, box id to words, or null, as its readers read it. */
  boxes: Record<string, string> | null;
  /** ISO 8601: when the words shown were last saved; `latest` when they are the answer's latest words. */
  shown: { savedAt: string | null; latest: boolean };
  /** The answer as it stood when the session started, when that differs from the words shown; null otherwise. */
  atSession: AboutVersion | null;
  /** Every piece of feedback on their week, oldest first, the reader's own changeable piece on the answer left out. */
  cards: StaffFeedbackCard[];
  /** The reader's own piece on the answer while its email has not gone: what "Your feedback" changes. */
  own: StaffFeedbackCard | null;
  /** What the reader may do with this answer: give feedback. */
  role: ReviewRole;
  /**
   * Ratings for the team on this answer, for an admin or the programme's
   * lead; null for every other reader, a facilitator above all, for whom no
   * rating is read.
   */
  team: TeamRatingsView | null;
  /** Pangram's last reading of this answer, for an admin alone; null for everybody else, and when it was never checked. */
  pangram: AnswerReading | null;
  /**
   * What the week's session reports say about the person (`besideScopeOf`):
   * every report's lines for an admin or the programme's lead, the lines of
   * the reports the reader wrote for a facilitator, never the rest of a
   * report; null for a reader who is handed no line.
   */
  reportLines: ReportLinesView | null;
  /**
   * The question as it was worded when this answer was first written (its
   * words, word range and due rule), ONLY where it has been reworded in place
   * since; null otherwise. So no answer is shown as if it answered words it
   * never saw (`src/lib/courses/weekEdit/askedThen.ts`).
   */
  askedThen: AskedWords | null;
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
  // When each person first wrote their answer, for the words the question had then.
  const writtenAt = new Map<string, Date | null>();
  if (answer && people.length > 0) {
    const snaps = await db.getAll(
      ...people.map((owner) => db.collection("courseExerciseResponses").doc(exerciseResponseId(run.id, owner.uid, weekId, answer.id))),
    );
    snaps.forEach((snap, index) => {
      const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
      if (data && !isReflectionResponse(data) && isWordCountedAnswer(data) && data.uid === people[index].uid) {
        records.set(people[index].uid, readWrittenAnswer(data));
        writtenAt.set(people[index].uid, writtenAtOf(data));
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

  // The block's own deadline, for "After its deadline" (staff only).
  const deadline = answer ? dueMoment(resolveSessions(run, group), weekNumber, answer.due, dayBeforeTime) : null;
  const readOf = new Map<string, ReadVersion | null>();
  const personOf = (owner: OwnerFacts): ReviewPerson => {
    const record = records.get(owner.uid) ?? null;
    const facilitates = liveGroups.some((candidate) => candidate.facilitatorUids.includes(owner.uid));
    const due = states.dueOf(owner.uid, weekNumber);
    // What its readers read of it, if anything: the one answer.
    const read = record ? readableAnswer(answerPiece(record), due.at, now) : null;
    readOf.set(owner.uid, read);
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
    const piece = record ? answerPiece(record) : null;
    const cards = byOldest([
      ...(record?.feedback
        ? [staffLegacyCardOf(answer.id, record.feedback, legacyRoleOf(record.feedback.byUid, group.facilitatorUids), names, reader)]
        : []),
      // Each piece on the answer with the version it was about, when the answer has changed since.
      ...(piecesOf.get(chosen.uid) ?? []).map((given) => staffCardOf(given, names, reader, piece)),
    ]);
    // "Your feedback" changes the reader's newest piece on the answer while it may change.
    const own =
      [...cards].reverse().find((card) => card.mine && card.mayChange && card.on === "writtenAnswer" && !card.legacy) ?? null;
    // Ratings for the team, read for an admin or the programme's lead and for
    // nobody else; Pangram's reading of the answer for an admin alone; what
    // the week's session reports say about the person, as `besideScopeOf`
    // lets this reader see them.
    const beside = besideScopeOf({ uid: actor.uid, isAdmin: facts.isAdmin, isLead: facts.isLead }, chosen.uid, role.mayReview);
    const [team, pangram, reportLines, askedThen] = await Promise.all([
      mayRateWorkOf(actor, facts, owner, liveGroups)
        ? loadTeamRatings(db, {
            runId: run.id,
            uid: chosen.uid,
            weekId,
            itemId: answer.id,
            viewer: { uid: actor.uid, role: workRatingRoleOf(facts) },
            // For whether the answer has changed since each rating.
            answer: piece,
          })
        : Promise.resolve(null),
      facts.isAdmin && record
        ? readAnswerReading(db, {
            runId: run.id,
            uid: chosen.uid,
            rowId: exerciseResponseId(run.id, chosen.uid, weekId, answer.id),
            // Against the words its readers read: never words they may not read yet.
            words: writtenAnswerWords(answer.boxes, readOf.get(chosen.uid) ?? { text: "", boxes: null }),
          })
        : Promise.resolve(null),
      beside ? readReportLinesAbout(db, { runId: run.id, uid: chosen.uid, weekNumber, scope: beside }) : Promise.resolve(null),
      askedThenFor(db, run.id, weekId, group.id, [{ key: chosen.uid, itemId: answer.id, writtenAt: writtenAt.get(chosen.uid) ?? null }]),
    ]);
    // The words its readers read (`readableAnswer`): as last sent before the session, the latest after it.
    const shown = readOf.get(chosen.uid) ?? null;
    const atSession = piece ? versionAtSession(piece, states.dueOf(chosen.uid, weekNumber).at, now) : null;
    selected = {
      person: chosen,
      text: shown?.text ?? "",
      boxes: shown?.boxes ?? null,
      shown: { savedAt: shown?.savedAt ? shown.savedAt.toISOString() : null, latest: shown?.latest ?? false },
      atSession:
        atSession && shown && !sameWords(atSession, shown)
          ? { text: atSession.text, boxes: atSession.boxes, words: atSession.words, savedAt: atSession.savedAt ? atSession.savedAt.toISOString() : null }
          : null,
      cards: cards.filter((card) => card !== own),
      own,
      role,
      team,
      pangram,
      reportLines,
      askedThen: askedThen.get(chosen.uid) ?? null,
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
