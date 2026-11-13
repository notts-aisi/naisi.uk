import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readPersonPrivateNotes, readRunCoursework } from "@/lib/courses/facilitatorWeek/readers";
import type { WeekViewer } from "@/lib/courses/facilitatorWeek/model";
import {
  byOldest,
  changedSinceFeedback,
  staffCardOf,
  staffLegacyCardOf,
  type AboutVersion,
  type CardNames,
  type StaffFeedbackCard,
} from "@/lib/courses/feedback/model";
import { cardNamesOf, legacyRoleOf } from "@/lib/courses/feedback/readers";
import { boxesReaderFor } from "@/lib/courses/fillInBoxes/access";
import { resolveGroupCalendar, resolveWeekDoc } from "@/lib/courses/groupResolve";
import { readGroupWeek, readLastReminded, remindableOf } from "@/lib/courses/groupWeekWork/load";
import { personWeekStateOf, weekPiecesOf, type Bucket, type LastReminded } from "@/lib/courses/groupWeekWork/model";
import { courseCardOf } from "@/lib/courses/predictions/own";
import { besideScopeOf, type ReportLinesView } from "@/lib/courses/sessionReports/beside";
import { readReportLinesAbout } from "@/lib/courses/sessionReports/readers";
import { resolveSessions } from "@/lib/courses/sessions";
import { dueMoment } from "@/lib/courses/weekBlocks/due";
import { isBlockWeek, type WeekBlock, type When, type WordRange } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import { readDraftGrade } from "@/lib/courses/weekReview/store";
import { REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import { afterItsDeadline, lateBy, sessionHasStarted, weekWritingNeeds, type WeekDue } from "@/lib/courses/weekWork/model";
import { loadPeopleWeekFacts } from "@/lib/courses/weekWork/readers";
import { mayRateWorkOf, workRatingRoleOf } from "@/lib/courses/workRatings/access";
import type { TeamRatingsView } from "@/lib/courses/workRatings/model";
import { loadTeamRatings } from "@/lib/courses/workRatings/readers";
import {
  facilitatesOnRun,
  facilitatingOnRunOf,
  ownerFactsOf,
  reviewableIn,
  writtenReviewRole,
  type OwnerFacts,
  type ReviewerFacts,
} from "@/lib/courses/writtenAnswers/access";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseEnrolment, placementIsShownTo, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { exerciseResponseId } from "@/lib/firestore/courseExercises";
import type { CourseFeedbackDoc } from "@/lib/firestore/courseFeedback";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourse, weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { writtenAnswerWords } from "./input";
import { readAnswerReading, type AnswerReading } from "./pangramReadings";
import { personWeeks, shownWorkKeys, workKey, type PersonAnswerWrite, type PersonWeek, type PersonWeekFeedback } from "./model";
import { personAnchorId, questionHref, shownAnswerIds } from "./question";
import { byShownName, neighboursOf, openingWeek, readingHref } from "./reading";
import { columnsOf, namesOf, weeksRead } from "./reads";
import { personAskedThen } from "../weekEdit/askedThen";
import type { AskedWords } from "../weekEdit/wordsThen";

/**
 * ONE PERSON'S WEEK, READ (the reading view): one loader, reached through
 * two doors, each of which has asked its own gate before this file reads a
 * word of anybody's.
 *
 *  - THE PROGRAMME'S SIDE (`loadPersonCoursework` in `./load.ts`, at
 *    `.../programmes/[programmeId]/coursework/[uid]?week=N`): an admin or the
 *    programme's lead (`loadProgrammeRun`), and somebody who is a row of the
 *    programme's Coursework tab.
 *  - THE FACILITATOR'S SIDE (`loadGroupPersonWeek` below, at
 *    `/learn/[runId]/group/[groupId]/coursework/[uid]?week=N`): the group's
 *    the group's reading pages' own gate (the group's live facilitator, the
 *    programme's lead, an admin), then, for the person named, the one gate
 *    on whose work a reader may act on (`reviewableIn`, which asks
 *    `writtenReviewRole`): a facilitator never reads a co-facilitator's own
 *    work, and nobody reads their own.
 *
 * WHAT EACH READER IS HANDED is decided by the readers every other page asks,
 * none of them decided again here:
 *  - a written answer's words as `readableAnswer` hands them (inside
 *    `readRunCoursework`): before the person's session the words as last
 *    sent, once it has started the latest;
 *  - fill-in boxes only where `boxesReaderFor` answers;
 *  - private notes on the material only where `privateNotesOf` says
 *    (`readPersonPrivateNotes`): the group's facilitators and admins, never
 *    the programme's lead, and a facilitator's own note an admin's alone;
 *  - feedback cards and whether the reader may write one, by
 *    `writtenReviewRole`;
 *  - ratings for the team only for a reader `mayRateWorkOf` admits (an admin
 *    or the programme's lead on work they may review), never a facilitator;
 *  - Claude's draft grade for an admin alone, on an answer they may review,
 *    only while the words it graded are still the words read, and only once
 *    that admin has saved their own rating for the team of those words (Zach,
 *    Fri 13 Nov 2026; a rating of earlier words does not count): before then
 *    the view is handed only the review's line saying it shows then
 *    (`draftGradeWaits`), never anything of the grade;
 *  - the sealed prediction as a row for an admin alone, never on their own
 *    week: the card is opened through its own route, which records the
 *    opening first. This file reads nothing of the card (not even which week
 *    it opens in for the person: that is on the card), only the course's two
 *    weeks it is filled in and opened on;
 *  - beside the written answer, as the written answer's review page read them
 *    before this view replaced it (its address forwards here): Pangram's last
 *    reading of it for an admin alone (privacy v13: what Pangram returns is
 *    seen by admins only), never the lead or a facilitator, on an answer they
 *    may review and its readers may read, read as it is kept and never sent
 *    (`readAnswerReading`); and what the week's session reports say about the
 *    person (privacy v15, "Session reports"), their own lines and nothing
 *    else of a report, every report's for an admin or the programme's lead,
 *    a facilitator's own reports' alone for a facilitator (`besideScopeOf`,
 *    `readReportLinesAbout`), never on the reader's own page;
 *  - "After its deadline" (staff only): first sent after the answer's own
 *    deadline but before the session (`afterItsDeadline`).
 *
 * Nothing here writes, sends or records that anything was read.
 */

/** Who the week is, as the door hands them. */
export type ReadingPerson = {
  uid: string;
  /** By the names rule for the reader. */
  name: string;
  /** Facilitates a live group of the run: their own coursework. */
  facilitating: boolean;
  /** The group the reader is shown them in, or null: not in a group yet, to this reader. */
  groupId: string | null;
  /** The group whose copy of each week they read; null reads the run's own. */
  readsGroupId: string | null;
  /** To an admin: placed in a group Publish has not told them about yet. */
  notToldYet: boolean;
};

/** One person or week to step to. */
export type ReadingStep = { label: string; href: string };

/** One reading as its tick, with when and how late. */
export type ReadingTick = { at: Date | null; lateMs: number | null };

/** The view of one person's week, as the page draws it. */
export type PersonWeekView = {
  door: "programme" | "group";
  runId: string;
  /** The programme's short name, or the run's course title. */
  programmeName: string;
  viewer: WeekViewer;
  viewerFirstName: string;
  person: {
    uid: string;
    name: string;
    firstName: string;
    facilitating: boolean;
    /** Their group, where this reader may see it; null: not in a group yet. */
    groupName: string | null;
    notToldYet: boolean;
  };
  /** The reader is the person (the programme's lead or an admin on their own page, as the programme's side has always allowed). */
  self: boolean;
  weekNumber: number;
  /** How many weeks the run teaches, for "week 1 of 6"; 0 with none to count. */
  weeksTotal: number;
  /** The week as the person reads it: its parts, answer, boxes, sources and the feedback on the week as a whole. */
  week: PersonWeek;
  /** The written answer's labelled boxes, by id, in the week's order; none for an answer of one box. */
  answerBoxes: Array<{ id: string; label: string }>;
  /** When each reading was ticked, by source id, with how late. */
  ticks: Record<string, ReadingTick>;
  /** Where their week stands, in the words the group's page says it; null for a week with nothing to count. */
  state: { text: string; detail: string | null; bucket: Bucket } | null;
  /** The session they were due at that week, for "Group C met Wed 4 Nov, 3pm". */
  due: WeekDue;
  /** Feedback on the written answer: its cards, the reader's own changeable piece, and whether they may write one now. */
  answerFeedback: PersonWeekFeedback | null;
  /**
   * The answer has changed since the version the newest piece of feedback on
   * it was about: that version, who wrote the piece and the ids of every card
   * about that same version (drawn under it). Null otherwise.
   */
  changed: ChangedSince | null;
  /**
   * The page of one question across the person's group, on this door, on this
   * week (the switch "One question, whole group"); null for somebody in no
   * group this reader may open.
   */
  questionHref: string | null;
  /**
   * The answers this page puts in front of its reader in full, which the page
   * names once drawn so the time each was first read is kept
   * (`/api/courses/runs/[runId]/first-read`); null for a reader who may not
   * act on the person's work (their own page among them) or nothing shown.
   */
  firstRead: { weekId: string; ids: string[] } | null;
  /** Ratings for the team, for an admin or the programme's lead on work they may review; null for everybody else. */
  team: TeamRatingsView | null;
  /**
   * The written answer's range of words, for "The question · 250 to 350
   * words"; null with none set or no answer.
   */
  answerRange: WordRange | null;
  /**
   * The written answer was first sent after its own deadline but before the
   * session ("After its deadline", staff only); false otherwise, and when it
   * was late.
   */
  afterDeadline: boolean;
  /**
   * Pangram's last reading of the written answer, as the chip beside when it
   * was sent: for an admin alone, on an answer they may review and its readers
   * may read; null for everybody else, and when it was never checked.
   */
  pangram: AnswerReading | null;
  /**
   * What the week's session reports say about the person, beside an answer
   * its readers may read (`besideScopeOf`): every report's lines for an admin
   * or the programme's lead, the lines of the reports the reader wrote for a
   * facilitator, never the rest of a report; null for a reader handed no line,
   * the person themselves among them.
   */
  reportLines: ReportLinesView | null;
  /**
   * Claude's draft grade, for an admin alone, with the review's own words,
   * once that admin has saved their own rating of the answer; null when there
   * is none, it is out of date, or they have not rated it yet.
   */
  draftGrade: { line: string; grade: string } | null;
  /**
   * A grade in date waits for the admin's own rating: the review's own line
   * saying so, drawn in the grade's place; null otherwise. A fixed line, never
   * anything of the grade.
   */
  draftGradeWaits: string | null;
  /** The sealed prediction's row, for an admin alone, on the weeks the course's card is filled in and opened on. */
  prediction: { runId: string; uid: string; name: string } | null;
  /** Whether private notes were read for this reader. */
  notesShown: boolean;
  /** The words each answered question had when first written, where reworded since (keyed as work is). */
  askedThen: Record<string, AskedWords>;
  /** Nothing of the week is written or ticked: what the empty state says, and Remind where it reaches them. */
  empty: {
    ticked: number;
    of: number;
    lastReminded: LastReminded | null;
    /** Remind (by hand, one person, this week) reaches them, by its own rule; the group it is pressed on. */
    remind: { groupId: string } | null;
  } | null;
  nav: {
    previousPerson: ReadingStep | null;
    nextPerson: ReadingStep | null;
    previousWeek: ReadingStep | null;
    nextWeek: ReadingStep | null;
    /** The way back: the group's page, or the Coursework tab for somebody in no group. */
    back: ReadingStep;
    /** The crumb at the top: the Coursework tab, or the group's page. */
    crumb: ReadingStep;
  };
};

/** What a door hands the loader, after its own gate. */
export type ReadingDoor = {
  door: "programme" | "group";
  run: CourseRunDoc;
  liveGroups: readonly CourseGroupDoc[];
  facts: ReviewerFacts;
  viewer: WeekViewer;
  person: ReadingPerson;
  /** The person's group's people this reader may read, for previous and next: in any order. */
  people: ReadonlyArray<{ uid: string; name: string }>;
  /** The week the address asked for, as given. */
  askedWeek: unknown;
  programmeName: string;
  /** The door's path before a person (".../coursework"). */
  base: string;
  /** The page of one question across the person's group on this door for a week, or null with no group to open. */
  questionHref: (weekNumber: number) => string | null;
  /** Every place on the run, as the door has read them already for its own gate: not read again. */
  enrolments: readonly CourseEnrolmentDoc[];
  back: ReadingStep;
  crumb: ReadingStep;
};

/**
 * ONE PERSON'S WEEK, as `actor` may read it, through the door that let them
 * in. Null for a run with no week written as blocks.
 */
export async function readPersonWeek(db: Firestore, actor: SessionUser, input: ReadingDoor): Promise<PersonWeekView | null> {
  const { run, liveGroups, facts, viewer, person } = input;
  const uid = person.uid;
  const now = new Date();
  const [runWeeks, coursework] = await Promise.all([
    weeksRead(db, run.id, null),
    // Everything written and ticked on the run, the words only for this person: the answer as its readers may read it.
    readRunCoursework(db, { run, liveGroups, now, enrolments: input.enrolments }, uid),
  ]);
  const weeks = person.readsGroupId ? await weeksRead(db, run.id, person.readsGroupId) : runWeeks;
  const columns = columnsOf(run, runWeeks);
  const work = coursework.work.get(uid);
  const withWork = new Set<number>(
    [...(work?.reflections ?? []), ...(work?.boxes ?? [])].map((key) => Number(key.split(" ")[0])),
  );
  for (const [key, state] of work?.answers ?? []) if (state !== "not-started") withWork.add(Number(key.split(" ")[0]));
  for (const column of columns) {
    const week = weeks.get(column.weekNumber);
    if (week?.sources.some((source) => work?.ticked.has(source.id))) withWork.add(column.weekNumber);
  }
  const readsGroup = person.readsGroupId ? (liveGroups.find((group) => group.id === person.readsGroupId) ?? null) : null;
  const opening = openingWeek({
    columns: columns.map((column) => column.weekNumber),
    asked: input.askedWeek,
    withWork,
    reached: resolveGroupCalendar(run, readsGroup, now).currentWeek?.anchorWeekNumber ?? 0,
  });
  if (!opening) return null;
  const n = opening.weekNumber;
  const column = columns.find((each) => each.weekNumber === n) ?? { weekNumber: n, title: "" };
  const weekOf = (weekNumber: number) => weeks.get(weekNumber) ?? null;
  const shownGroup = person.groupId ? (liveGroups.find((group) => group.id === person.groupId) ?? null) : null;
  const due = coursework.states.dueOf(uid, n);

  const [boxesReader, notes, owner, card, blockWeek] = await Promise.all([
    boxesReaderFor(db, actor, run.id, uid),
    readPersonPrivateNotes(db, run.id, viewer, { uid, name: person.name, firstName: person.name, own: person.facilitating }, [
      { weekNumber: n, sourceIds: new Set((weekOf(n)?.sources ?? []).map((source) => source.id)) },
    ]),
    ownerFactsOf(db, run.id, uid, liveGroups, { isAdmin: facts.isAdmin }),
    // The sealed prediction's weeks: the course's card, never the person's own record.
    facts.isAdmin && actor.uid !== uid ? courseCardOf(db, run) : Promise.resolve(null),
    resolveWeekDoc(db, run.id, person.readsGroupId, weekDocId(n)),
  ]);
  const role = owner ? writtenReviewRole(actor, facts, owner, liveGroups) : null;
  const mayWrite = role?.mayReview === true;

  const answerId = weekOf(n)?.answer?.id ?? null;
  const stored = answerId ? (coursework.writes.answers.get(workKey(n, answerId)) ?? null) : null;
  const pieces = coursework.feedback.filter((piece) => piece.weekNumber === n);
  const cardNames = await cardNamesOf(db, [uid, actor.uid, stored?.feedback?.byUid ?? "", ...pieces.map((piece) => piece.byUid)]);
  const { onTheAnswer, onTheWeek, ownAnswerPiece, ownWeekPiece, readSavedAt, changed, answerReadable } = feedbackOnAWeek({
    answerId,
    stored,
    pieces,
    cardNames,
    reader: { uid: actor.uid, isAdmin: facts.isAdmin, now },
    groupFacilitatorUids: shownGroup?.facilitatorUids ?? [],
  });
  // Feedback on the week once it may be read: the session has started, the answer may be read, or the old Submit was pressed.
  const weekReadable = sessionHasStarted(due, now) || stored?.piece != null || coursework.states.submittedOf(uid, n) !== null;

  const [week] = personWeeks({
    columns: [column],
    weekOf,
    writes: coursework.writes,
    boxesRead: boxesReader !== null,
    notes,
    // Feedback on the answer is written beside it here.
    writtenHref: () => null,
    feedbackOf: () => ({ cards: onTheWeek.filter((each) => each !== ownWeekPiece), own: ownWeekPiece, open: mayWrite && weekReadable }),
  });

  const answerBoxes = weekOf(n)?.answer?.boxes ?? [];
  // The written answer's block as the person's copy of the week asks it: its range of words and its own deadline's rule.
  const answerBlock =
    answerId && blockWeek.week && isBlockWeek(blockWeek.week) ? (weekWrittenAnswers(blockWeek.week).find((each) => each.id === answerId) ?? null) : null;
  // What the week's session reports say about the person: whose reports' lines this reader sees, by the review page's own rule.
  const beside = role ? besideScopeOf({ uid: actor.uid, isAdmin: facts.isAdmin, isLead: facts.isLead }, uid, role.mayReview) : null;
  const [team, draft, askedThen, state, pangram, reportLines, afterDeadline] = await Promise.all([
    owner && answerId && answerReadable && mayRateWorkOf(actor, facts, owner, liveGroups)
      ? loadTeamRatings(db, {
          runId: run.id,
          uid,
          weekId: weekDocId(n),
          itemId: answerId,
          viewer: { uid: actor.uid, role: workRatingRoleOf(facts) },
          // For whether the answer has changed since each rating.
          answer: stored?.piece ?? null,
        })
      : Promise.resolve(null),
    // Claude's draft grade: an admin's alone, on an answer they may review, against the words read now.
    facts.isAdmin && mayWrite && answerId && answerReadable && stored
      ? readDraftGrade(db, {
          runId: run.id,
          weekId: weekDocId(n),
          rowId: exerciseResponseId(run.id, uid, weekDocId(n), answerId),
          words: writtenAnswerWords(answerBoxes, { text: stored.text, boxes: stored.boxes }),
        })
      : Promise.resolve(null),
    // Only beside words this page shows: never a written answer its readers may not read yet.
    personAskedThen(db, run.id, uid, person.readsGroupId, shownWorkKeys([week])),
    weekStateOf(db, { runId: run.id, weekNumber: n, uid, blocks: blockWeek.week && isBlockWeek(blockWeek.week) ? (blockWeek.week.blocks as WeekBlock[]) : null, submittedAt: coursework.states.submittedOf(uid, n), due }),
    // Pangram's last reading of the answer: an admin's alone, on an answer they may review and its readers may read,
    // against the words read now. Read as it is kept: nothing is sent to Pangram.
    facts.isAdmin && mayWrite && answerId && answerReadable && stored
      ? readAnswerReading(db, {
          runId: run.id,
          uid,
          rowId: exerciseResponseId(run.id, uid, weekDocId(n), answerId),
          words: writtenAnswerWords(answerBoxes, { text: stored.text, boxes: stored.boxes }),
        })
      : Promise.resolve(null),
    // The person's own lines in the week's session reports, beside an answer its readers may read, as `besideScopeOf` lets this reader see them.
    beside && answerId && answerReadable ? readReportLinesAbout(db, { runId: run.id, uid, weekNumber: n, scope: beside }) : Promise.resolve(null),
    afterDeadlineOf(db, { run, group: readsGroup, weekNumber: n, rule: answerBlock?.due ?? null, firstSentAt: stored?.sentAt ?? null, due }),
  ]);

  // The admin's own rating of the words read now: a rating of earlier words (`changedSince`) does not count.
  const ratedNow = team?.mine != null && !team.mine.changedSince;

  // Nothing of the week written, sent or ticked: the empty state, and Remind where it reaches them.
  const nothing =
    week.counted &&
    week.ticked === 0 &&
    week.parts.every((part) => part.prompts.every((prompt) => prompt.answer === null)) &&
    (week.answer === null || week.answer.state === "not-started") &&
    !(week.boxes ?? []).some((box) => box.text);
  const remindGroup = readsGroup && !person.facilitating && person.groupId === readsGroup.id ? readsGroup : null;
  const empty = nothing ? await emptyOf(db, { run, group: remindGroup, weekNumber: n, uid, actorUid: actor.uid, now, ticked: week.ticked, of: week.sources.length }) : null;

  const ticks: Record<string, ReadingTick> = {};
  for (const source of week.sources) {
    if (!source.ticked) continue;
    const at = work?.tickedAt?.get(source.id) ?? null;
    ticks[source.id] = { at, lateMs: lateBy(at, due) };
  }

  const ordered = byShownName(input.people);
  const people = neighboursOf(ordered, (each) => each.uid, uid);
  const stepWeek = neighboursOf(columns, (each) => each.weekNumber, n);
  const firstName = cardNames.firstName(uid) || person.name;
  return {
    door: input.door,
    runId: run.id,
    programmeName: input.programmeName,
    viewer,
    viewerFirstName: cardNames.firstName(actor.uid),
    person: {
      uid,
      name: person.name,
      firstName,
      facilitating: person.facilitating,
      groupName: shownGroup ? shownGroup.name.trim() || "Untitled group" : null,
      notToldYet: person.notToldYet,
    },
    self: actor.uid === uid,
    weekNumber: n,
    // The run's taught weeks, written as blocks or not, for "week 3 of 6".
    weeksTotal: new Set(run.weekPlan.flatMap((entry) => (entry.kind === "week" ? [entry.weekNumber] : []))).size,
    week,
    answerBoxes: answerBoxes.map((box) => ({ id: box.id, label: box.label })),
    ticks,
    state,
    due,
    answerFeedback: answerId
      ? {
          // A piece about the very words read carries no earlier version to stack under it.
          cards: sideCardsOf(onTheAnswer, ownAnswerPiece, readSavedAt),
          own: ownAnswerPiece,
          open: mayWrite && answerReadable,
        }
      : null,
    changed,
    questionHref: input.questionHref(n),
    // What the page shows in full, named to be kept as first read: only by somebody who may act on the work.
    firstRead: mayWrite && shownAnswerIds(week).length > 0 ? { weekId: weekDocId(n), ids: shownAnswerIds(week) } : null,
    team,
    answerRange: answerBlock?.words ?? null,
    afterDeadline,
    pangram,
    reportLines,
    // The grade only once the admin has saved their own rating of the words read now; before then, only that one waits.
    draftGrade: draft && ratedNow ? { line: REVIEW_WORDS.gradesLine, grade: REVIEW_WORDS.gradeOf(draft.grade) } : null,
    draftGradeWaits: draft !== null && !ratedNow ? REVIEW_WORDS.gradeAfterYourRating : null,
    prediction: card && (n === card.sealWeek || n === card.openWeek) ? { runId: run.id, uid, name: person.name } : null,
    notesShown: notes !== null,
    askedThen,
    empty,
    nav: {
      previousPerson: people.previous ? { label: people.previous.name, href: readingHref(input.base, people.previous.uid, n) } : null,
      nextPerson: people.next ? { label: people.next.name, href: readingHref(input.base, people.next.uid, n) } : null,
      previousWeek: stepWeek.previous ? { label: String(stepWeek.previous.weekNumber), href: readingHref(input.base, uid, stepWeek.previous.weekNumber) } : null,
      nextWeek: stepWeek.next ? { label: String(stepWeek.next.weekNumber), href: readingHref(input.base, uid, stepWeek.next.weekNumber) } : null,
      back: input.back,
      crumb: input.crumb,
    },
  };
}

/** What changed since feedback on a written answer: the version the newest out-of-date piece was about, who wrote it, and every card about that version. */
export type ChangedSince = { about: AboutVersion; byName: string; cardIds: string[] };

/**
 * THE FEEDBACK ON ONE PERSON'S WEEK, as the reading pages draw it (one
 * person's week, and one question across a group): every piece, feedback
 * given before pieces existed among them, oldest first, split into those on
 * the written answer and those on the week as a whole; the reader's own
 * pieces while they may change; whether the answer may take feedback (its
 * readers may read it and what they read holds words); and, when the answer
 * has changed since the version the newest piece on it was about, that
 * version and the cards about it. `pieces` are the person's pieces of that
 * week, read after the page's gate.
 */
export function feedbackOnAWeek(input: {
  answerId: string | null;
  stored: PersonAnswerWrite | null;
  pieces: readonly CourseFeedbackDoc[];
  cardNames: CardNames;
  reader: { uid: string; isAdmin: boolean; now: Date };
  /** The person's group's facilitators, for who signed feedback given before pieces existed. */
  groupFacilitatorUids: readonly string[];
}): {
  onTheAnswer: StaffFeedbackCard[];
  onTheWeek: StaffFeedbackCard[];
  ownAnswerPiece: StaffFeedbackCard | null;
  ownWeekPiece: StaffFeedbackCard | null;
  /** ISO 8601: when the words read were saved, or null. */
  readSavedAt: string | null;
  /**
   * The newest piece on the answer whose version is no longer the words read,
   * and the cards about that version: what the reading view stacks under the
   * earlier version. It may be an older piece than the newest.
   */
  changed: ChangedSince | null;
  /** The answer's state, as a row says it: the NEWEST piece on it was about earlier words (`changedSinceFeedback`). */
  changedSinceNewest: boolean;
  answerReadable: boolean;
} {
  const { answerId, stored, cardNames, reader } = input;
  const cards: StaffFeedbackCard[] = byOldest([
    ...(answerId && stored?.feedback
      ? [staffLegacyCardOf(answerId, stored.feedback, legacyRoleOf(stored.feedback.byUid, input.groupFacilitatorUids), cardNames, reader)]
      : []),
    // Each piece with the version of the answer it was about, when the answer has changed since.
    ...input.pieces.map((piece) => staffCardOf(piece, cardNames, reader, stored?.piece ?? null)),
  ]);
  const onTheAnswer = cards.filter((each) => each.on === "writtenAnswer");
  const onTheWeek = cards.filter((each) => each.on === "week");
  const ownAnswerPiece = [...onTheAnswer].reverse().find((each) => each.mine && each.mayChange && !each.legacy) ?? null;
  const ownWeekPiece = [...onTheWeek].reverse().find((each) => each.mine && each.mayChange) ?? null;
  // Feedback on the answer once its readers may read it and what they read holds words.
  const answerReadable = stored?.piece != null && stored.words > 0;
  // The newest piece on the answer whose version is no longer the words read: the version it was about.
  // A card's `about` is told against the answer's newest save, and before the session its readers may be
  // reading an earlier, sent version (`readableAnswer`): a piece about the very words read is about no change.
  const readSavedAt = stored?.changedAt ? stored.changedAt.toISOString() : null;
  const outdated = [...onTheAnswer].reverse().find((each) => each.about !== null && each.about.savedAt !== readSavedAt) ?? null;
  const changed =
    outdated?.about && answerReadable
      ? {
          about: outdated.about,
          byName: outdated.byName,
          cardIds: onTheAnswer.filter((each) => each.about?.savedAt === outdated.about?.savedAt).map((each) => each.id),
        }
      : null;
  // Whether the answer has changed since feedback, as a row says it: by the newest piece on it alone.
  const changedSinceNewest = answerReadable && changedSinceFeedback(onTheAnswer, readSavedAt);
  return { onTheAnswer, onTheWeek, ownAnswerPiece, ownWeekPiece, readSavedAt, changed, changedSinceNewest, answerReadable };
}

/** The cards beside an answer: all but the reader's own changeable piece, a piece about the very words read with no earlier version stacked under it. */
export function sideCardsOf(onTheAnswer: readonly StaffFeedbackCard[], own: StaffFeedbackCard | null, readSavedAt: string | null): StaffFeedbackCard[] {
  return onTheAnswer.filter((each) => each !== own).map((each) => (each.about && each.about.savedAt === readSavedAt ? { ...each, about: null } : each));
}

/**
 * WHERE THE PERSON'S WEEK STANDS, in the words the group's page says it
 * (`personWeekStateOf`): what they did of the week, as counts and times
 * (`loadPeopleWeekFacts`, never a word), against the session they were due
 * at. Null for a week not written as blocks.
 */
async function weekStateOf(
  db: Firestore,
  input: { runId: string; weekNumber: number; uid: string; blocks: WeekBlock[] | null; submittedAt: Date | null; due: WeekDue },
): Promise<PersonWeekView["state"]> {
  if (!input.blocks) return null;
  const tasks = weekTaskNeeds(input.blocks);
  const asks = weekWritingNeeds(input.blocks);
  const facts = await loadPeopleWeekFacts(db, { runId: input.runId, weekNumber: input.weekNumber, blocks: input.blocks, uids: [input.uid] });
  const own = facts.get(input.uid);
  if (!own) return null;
  const state = personWeekStateOf({
    tasks,
    asks,
    pieces: weekPiecesOf(input.blocks, tasks, asks),
    facts: own,
    submittedAt: input.submittedAt,
    due: input.due,
  });
  return { text: state.text, detail: state.detail, bucket: state.bucket };
}

/**
 * "AFTER ITS DEADLINE" (staff only), as the written answer's review page
 * worked it out: first sent after the answer's own deadline (`dueMoment` with
 * its block's rule, on the calendar of the group whose copy of the week the
 * person reads, with the course's time for work due the day before), but
 * before the session they were due at. Sent after that session it is late
 * instead; never sent, or with no session, it is neither. The course is read
 * only for an answer first sent before its session.
 */
async function afterDeadlineOf(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc | null; weekNumber: number; rule: When | null; firstSentAt: Date | null; due: WeekDue },
): Promise<boolean> {
  const { run, firstSentAt, due } = input;
  if (!input.rule || !firstSentAt || due.at === null || firstSentAt.getTime() >= due.at.getTime()) return false;
  const courseSnap = run.courseId ? await db.collection("courses").doc(run.courseId).get() : null;
  const dayBefore = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}).dayBeforeDueTime : null;
  const deadline = dueMoment(resolveSessions(run, input.group), input.weekNumber, input.rule, dayBefore);
  return afterItsDeadline(firstSentAt, deadline?.at ?? null, due);
}

/**
 * THE EMPTY STATE: how many readings are ticked, of how many, when they were
 * last reminded about the week, and whether Remind reaches them (by hand,
 * this person and this week, through its own route and panel). Remind is
 * offered on the group the person reads and holds a place in, never for a
 * facilitator's own week, by the rule its route keeps (`remindableOf`).
 */
async function emptyOf(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc | null; weekNumber: number; uid: string; actorUid: string; now: Date; ticked: number; of: number },
): Promise<NonNullable<PersonWeekView["empty"]>> {
  const base = { ticked: input.ticked, of: input.of, lastReminded: null, remind: null };
  if (!input.group) return base;
  const got = await readGroupWeek(db, { run: input.run, group: input.group, weekNumber: input.weekNumber, uids: [input.uid], now: input.now });
  if (!got.ok) return base;
  const reminded = await readLastReminded(db, { run: input.run, group: input.group, read: got.read, uids: [input.uid] });
  return {
    ...base,
    lastReminded: reminded.last.get(input.uid) ?? null,
    remind: remindableOf(got.read, { uid: input.uid, told: true, presserUid: input.actorUid }) ? { groupId: input.group.id } : null,
  };
}

// ---------------------------------------------------------------------------
// The facilitator's door
// ---------------------------------------------------------------------------

export type GroupPersonWeekOutcome = { status: "refused" } | { status: "blank" } | { status: "ok"; view: PersonWeekView };

/**
 * WHOSE WEEKS A READER MAY OPEN IN ONE GROUP, from the group's side: the one
 * gate on whose work a reader may act on (`reviewableIn`, which asks
 * `writtenReviewRole` person by person), over every placement on the run
 * this reader is shown (`placementIsShownTo`: an admin sees one before it is
 * told). The group's page asks it for which names lead to the reading view,
 * and the reading view's own door and the page of one question across the
 * group (`./questionLoad.ts`) ask it before reading anybody's work, so a link
 * is never drawn to a page that would refuse it. `told` is whose placement
 * Publish has told them, asked about a caller who is no admin. One equality
 * on the run.
 */
export async function readableInGroup(
  db: Firestore,
  actor: SessionUser,
  input: { run: CourseRunDoc; group: CourseGroupDoc; liveGroups: readonly CourseGroupDoc[]; facts: ReviewerFacts },
): Promise<{ owners: OwnerFacts[]; seats: Map<string, CourseEnrolmentDoc>; told: Set<string>; enrolments: CourseEnrolmentDoc[] }> {
  const { run, group, liveGroups, facts } = input;
  const enrolSnap = await db.collection("courseEnrolments").where("runId", "==", run.id).get();
  const enrolments = enrolSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
  const live = new Set(liveGroups.map((each) => each.id));
  const seats = new Map<string, CourseEnrolmentDoc>();
  // Whose placement Publish has told them: they read their group's copy of a week only then.
  const told = new Set<string>();
  for (const seat of enrolments) {
    if (
      seat.runId === run.id &&
      seat.role === "learner" &&
      (seat.status === "active" || seat.status === "completed") &&
      seat.groupId !== null &&
      live.has(seat.groupId) &&
      placementIsShownTo(seat, { isAdmin: facts.isAdmin })
    ) {
      seats.set(seat.uid, seat);
      if (placementIsShownTo(seat, { isAdmin: false })) told.add(seat.uid);
    }
  }
  const owners: OwnerFacts[] = [...seats.values()].map((seat) => ({ uid: seat.uid, placedGroupId: seat.groupId }));
  return { owners: reviewableIn(actor, facts, group, owners, liveGroups), seats, told, enrolments };
}

/**
 * AN ARCHIVED GROUP'S FELLOWS, for the page of one question behind its door
 * alone (`./questionLoad.ts`), and only for an admin. Admins bypass
 * archiving, and the archived group's reflections with names, the page that
 * page replaced, showed an admin its fellows' reflections under their names,
 * in the weeks the group taught: nothing else of theirs, and nobody else. So
 * this answers, for an admin on an archived group, everybody holding a place
 * in it, as that page listed them (`loadFacilitatorGroup`'s people), but
 * anybody whose work is a facilitator's own (`facilitatingOnRunOf`), the
 * people `readableInGroup` already answers and the admin themselves; and
 * nobody for anybody else or on a live group. They are never readable
 * through `readableInGroup`: the reading view of one person's week refuses
 * them, as it always did, and nothing of theirs can be written or noted as
 * read. Pure: it asks the run's places `readableInGroup` read already.
 */
export function archivedGroupFellows(
  actor: Pick<SessionUser, "uid">,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    liveGroups: readonly CourseGroupDoc[];
    facts: ReviewerFacts;
    enrolments: readonly CourseEnrolmentDoc[];
    /** Whose work the reader may read in the group already (`readableInGroup`): never listed again. */
    readable: readonly OwnerFacts[];
  },
): OwnerFacts[] {
  const { run, group, liveGroups, facts } = input;
  if (!group.archived || !facts.isAdmin) return [];
  const own = facilitatingOnRunOf(group, liveGroups);
  const listed = new Set(input.readable.map((owner) => owner.uid));
  const out: OwnerFacts[] = [];
  for (const seat of input.enrolments) {
    if (
      seat.runId !== run.id ||
      seat.role !== "learner" ||
      !(seat.status === "active" || seat.status === "completed") ||
      seat.groupId !== group.id ||
      !placementIsShownTo(seat, { isAdmin: facts.isAdmin }) ||
      own.has(seat.uid) ||
      seat.uid === actor.uid ||
      listed.has(seat.uid)
    ) {
      continue;
    }
    listed.add(seat.uid);
    out.push({ uid: seat.uid, placedGroupId: group.id });
  }
  return out;
}

/**
 * ONE PERSON OF A GROUP, ONE WEEK, from the group's side. The page has asked
 * its own gate (the group's reading pages': the group's live
 * facilitator, the programme's lead, an admin) and hands what it read.
 * `uid` must then be somebody this reader may review in this group
 * (`reviewableIn`: its fellows, and for the lead and admins its facilitators'
 * own work), or the answer is a refusal and nothing of theirs is read.
 */
export async function loadGroupPersonWeek(
  db: Firestore,
  actor: SessionUser,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    liveGroups: readonly CourseGroupDoc[];
    facts: ReviewerFacts;
    /** The reader facilitates this group, while they stand. */
    facilitatesThisGroup: boolean;
    uid: string;
    askedWeek: unknown;
    programmeName: string;
    groupPath: string;
    /** The run's home under /learn, the lead's way back. */
    runHome: string;
  },
): Promise<GroupPersonWeekOutcome> {
  const { run, group, liveGroups, facts } = input;
  const { owners: readable, seats, told: toldSeats, enrolments } = await readableInGroup(db, actor, { run, group, liveGroups, facts });
  if (!readable.some((owner) => owner.uid === input.uid)) return { status: "refused" };

  const names = await namesOf(db, readable.map((owner) => owner.uid), actor);
  const nameOf = (uid: string) => names.get(uid) ?? "NAISI member";
  // Their place in this group, if they hold one.
  const held = seats.get(input.uid) ?? null;
  const seat = held && held.groupId === group.id ? held : null;
  const facilitating = facilitatesOnRun(input.uid, liveGroups);
  // The group whose weeks a facilitator reads: the first live group they run, in the run's order, as the Coursework tab counts them.
  const runs = liveGroups.find((each) => each.facilitatorUids.includes(input.uid)) ?? null;
  const told = seat !== null && toldSeats.has(seat.uid);
  const groupPath = input.groupPath;
  // The group's page admits its live facilitators and admins; the lead, who has no page for the group here, goes back to the run's home.
  const groupLabel = group.name.trim() || "Your group";
  const back: ReadingStep =
    input.facilitatesThisGroup || facts.isAdmin ? { label: groupLabel, href: groupPath } : { label: input.programmeName, href: input.runHome };
  const view = await readPersonWeek(db, actor, {
    door: "group",
    run,
    liveGroups,
    facts,
    viewer: facts.isAdmin ? "admin" : input.facilitatesThisGroup ? "facilitator" : "lead",
    person: {
      uid: input.uid,
      name: nameOf(input.uid),
      facilitating,
      groupId: group.id,
      // A facilitator reads the group they run; a fellow the group's copy once Publish has told them, the run's own before.
      readsGroupId: runs ? runs.id : told ? group.id : null,
      notToldYet: seat !== null && !told,
    },
    people: readable.map((owner) => ({ uid: owner.uid, name: nameOf(owner.uid) })),
    askedWeek: input.askedWeek,
    programmeName: input.programmeName,
    base: `${groupPath}/coursework`,
    enrolments,
    // One question across this group, on the same week, landing on this person.
    questionHref: (weekNumber) => `${questionHref(`${groupPath}/question`, { weekNumber, questionId: null })}#${personAnchorId(input.uid)}`,
    back,
    crumb: back,
  });
  return view ? { status: "ok", view } : { status: "blank" };
}
