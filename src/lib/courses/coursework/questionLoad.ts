import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRunCoursework } from "@/lib/courses/facilitatorWeek/readers";
import type { WeekViewer } from "@/lib/courses/facilitatorWeek/model";
import type { StaffFeedbackCard } from "@/lib/courses/feedback/model";
import { cardNamesOf } from "@/lib/courses/feedback/readers";
import { facilitatorsOwnLine, namedReadersLine } from "@/lib/courses/facilitatorWeek/words";
import { boxesReaderFor } from "@/lib/courses/fillInBoxes/access";
import { resolveCalendar, resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { resolveSessions } from "@/lib/courses/sessions";
import { dueMoment } from "@/lib/courses/weekBlocks/due";
import type { WordRange } from "@/lib/courses/weekBlocks/model";
import { askedThenFor } from "@/lib/courses/weekEdit/askedThen";
import { earlierQuestionWords } from "@/lib/courses/weekEdit/wordsThen";
import { readFirstReads, readFirstReadsKeptFrom } from "@/lib/courses/weekWork/firstRead";
import { afterItsDeadline } from "@/lib/courses/weekWork/model";
import { mayRateWorkOf, workRatingRoleOf } from "@/lib/courses/workRatings/access";
import type { TeamRatingsView } from "@/lib/courses/workRatings/model";
import { loadTeamRatings } from "@/lib/courses/workRatings/readers";
import { facilitatesOnRun, writtenReviewRole, type ReviewerFacts } from "@/lib/courses/writtenAnswers/access";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourse, weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { workKey, type CourseworkWeek, type WrittenBox } from "./model";
import {
  chosenQuestion,
  feedbackStateOf,
  filterCounts,
  filterRows,
  personAnchorId,
  questionAnchorId,
  questionHref,
  readStateOf,
  readableSinceOf,
  toggled,
  weekQuestionsOf,
  type FeedbackState,
  type FirstOfKind,
  type QuestionFilter,
  type ReadState,
  type WeekQuestion,
} from "./question";
import { byShownName, neighboursOf, openingWeek, readingHref } from "./reading";
import { archivedGroupFellows, feedbackOnAWeek, readableInGroup, sideCardsOf, type ReadingStep } from "./readingLoad";
import { columnsOf, namesOf, weeksRead } from "./reads";
import { WRITTEN_ANSWER, partHeadingWords } from "./words";

/**
 * ONE QUESTION, THE WHOLE GROUP (Fri 13 Nov 2026): one loader, reached through
 * two doors, each of which has asked its own gate before this file reads a
 * word of anybody's.
 *
 *  - THE PROGRAMME'S SIDE (`.../programmes/[programmeId]/question?group=G`):
 *    an admin or the programme's lead (`openLeadDoor`), any live group of the
 *    programme's run.
 *  - THE FACILITATOR'S SIDE (`/learn/[runId]/group/[groupId]/question`): the
 *    reading view's own gate on that side (the group's live facilitator, the
 *    programme's lead, an admin).
 *
 * WHOSE ANSWERS: the people of the group this reader may read
 * (`readableInGroup`, which asks `reviewableIn` and so `writtenReviewRole`
 * person by person): its fellows, and for the lead and admins its
 * facilitators' own work too; a facilitator never a co-facilitator's own, and
 * nobody their own. On a fill-in box, only those `boxesReaderFor` admits.
 *
 * AN ARCHIVED GROUP, behind its door, for an admin (`archivedGroupFellows`):
 * the page this one replaced, the group's reflections with names, showed an
 * admin its fellows' reflections under their names, in the weeks the group
 * taught, and nothing else of theirs. So on a REFLECTION, in a week the
 * archived group teaches, its fellows are listed too, each row what that page
 * drew of a reflection (the name, the words, when it was saved, how late, the
 * words as they stood at the session, the question as it was when written,
 * and "Nothing written yet"), and nothing more: no link to their week (whose
 * page refuses them), no "Not told yet", no read state, nothing named to the
 * first-read route. On a fill-in box, on the written answer and in a week
 * the group does not teach they are not listed. The week the page opens on
 * when none is named counts only their reflections in the weeks the group
 * taught, so it says nothing about anything else of theirs.
 *
 * WHAT EACH READER IS HANDED is the readers' own, none decided again here:
 * the words as `readRunCoursework` hands them (a written answer as
 * `readableAnswer` does: before the person's session the words as last sent,
 * once it has started the latest); the feedback cards and whether the reader
 * may write one, as the reading view of one person's week builds them
 * (`feedbackOnAWeek`); the team's ratings only for a reader `mayRateWorkOf`
 * admits, never a facilitator.
 *
 * WHEN EACH ANSWER WAS FIRST READ (`readFirstReads`): read for the people
 * listed, and shown as "Not read yet" on an answer nobody on the team has
 * opened, as it stood when this reader arrived, by `readStateOf` (a time
 * kept, or feedback on the answer, is read; with neither, unread only when it
 * became readable in the words shown since the site began keeping read times,
 * `readFirstReadsKeptFrom`, and before then, or with none begun, neither).
 * Never who read it.
 * Nothing here writes: the page names the answers it drew once it has drawn
 * them.
 */

/** One person's answer to the question, as this reader may read it. */
export type QuestionAnswer = {
  /** An answer of one box, or a reflection's or a fill-in box's words. */
  text: string;
  /** A written answer in labelled boxes, in the week's order; empty otherwise. */
  boxes: Array<{ label: string; text: string }>;
  /** A reflection or box: when it was last saved. A written answer: when the words read last changed, where after it was sent or never sent. */
  savedAt: Date | null;
  savedLateMs: number | null;
  /** A written answer: when it was last sent, and how late. */
  sentAt: Date | null;
  sentLateMs: number | null;
  /** The answer as it stood when the session started, where it differs from the words shown; null otherwise. */
  atSession: { text: string; boxes: Array<{ label: string; text: string }> } | null;
  /** The question's words when this answer was first written, where it has been reworded since; null otherwise. */
  askedThen: string | null;
};

/** One person of the group, on the question. */
export type QuestionRow = {
  uid: string;
  name: string;
  firstName: string;
  facilitating: boolean;
  /** To an admin: placed in this group, and Publish has not told them yet. */
  notToldYet: boolean;
  /** The id their row carries, for the switch from their week to land on them. */
  anchor: string;
  /** Their answer in full; null with nothing written, or nothing its readers may read yet. */
  answer: QuestionAnswer | null;
  /** A written answer started and never sent. */
  notSent: boolean;
  read: ReadState;
  feedback: FeedbackState;
  late: boolean;
  /** A written answer first sent after its own deadline but before the session ("After its deadline", staff only). */
  afterDeadline: boolean;
  /** Nothing written, and they joined their group after that week's session ("Joined late"). */
  joinedLate: boolean;
  /** Feedback on a written answer, the reader's own changeable piece apart. */
  cards: StaffFeedbackCard[];
  own: StaffFeedbackCard | null;
  /** The reader may write feedback on it now. */
  mayWrite: boolean;
  /** Ratings for the team: an admin or the programme's lead alone. */
  team: TeamRatingsView | null;
  /** The reading view of their week, at this question; null for an archived group's fellow, whose week never opens. */
  weekHref: string | null;
};

export type QuestionView = {
  door: "programme" | "group";
  runId: string;
  programmeName: string;
  groupName: string;
  viewer: WeekViewer;
  viewerFirstName: string;
  weekNumber: number;
  weeksTotal: number;
  weekTitle: string;
  /** The question; null for a week that asks nothing written. */
  question: WeekQuestion | null;
  /** The written answer's range of words, for "The question · 250 to 350 words"; null for any other question or none set. */
  range: WordRange | null;
  /** Where the question sits among the week's: 1-based, and how many. */
  position: { at: number; of: number };
  /** The written answer's labelled boxes, for the version a piece of feedback was about. */
  answerBoxes: Array<{ id: string; label: string }>;
  filter: QuestionFilter;
  counts: { everybody: number; unread: number; noFeedback: number; late: number };
  /** Each filter's link: everybody clears them all, each other switches its own. */
  filterHrefs: { everybody: string; unread: string; noFeedback: string; late: string };
  /** Whether the question can take feedback: the written answer alone does. */
  takesFeedback: boolean;
  /** The people the filter keeps, in the group's order. */
  rows: QuestionRow[];
  /** The people this reader may read at all, before the filter. */
  everybody: number;
  /** Who reads a facilitator's own work, under the rows, for the lead and admins when any row is a facilitator's own; null otherwise. */
  ownLine: string | null;
  /**
   * On a reflection, on the group's side, for a reader who may open the page
   * where lines are picked to read out (the group's live facilitators and
   * admins): who reads reflections with names, and the way to that page.
   */
  readOut: { line: string; href: string } | null;
  nav: {
    previousQuestion: ReadingStep | null;
    nextQuestion: ReadingStep | null;
    /** "One person, one week": the first person shown, on this week, at this question; null with nobody. */
    personWeek: string | null;
    back: ReadingStep;
    crumb: ReadingStep;
  };
  /** The answers drawn in full, named once drawn so the time each was first read is kept; null with none. */
  firstRead: { weekId: string; people: Array<{ uid: string; ids: string[] }> } | null;
  /**
   * On the programme's side alone, the lead's and admins' choice of group: a
   * link per live group of the run, in the one order every tab lists them,
   * each keeping the week, the question and the filters the address named, the
   * one shown marked. Null behind the group's door, where a facilitator's page
   * is the one group's own, and with one group to choose from.
   */
  groups: Array<{ id: string; name: string; href: string; current: boolean }> | null;
};

/** What a door hands the loader, after its own gate. */
export type QuestionDoor = {
  door: "programme" | "group";
  run: CourseRunDoc;
  group: CourseGroupDoc;
  liveGroups: readonly CourseGroupDoc[];
  facts: ReviewerFacts;
  viewer: WeekViewer;
  askedWeek: unknown;
  askedQuestion: unknown;
  /** The kind of question the address asks to open on when it names none (`first=`), or null. */
  askedFirst: FirstOfKind | null;
  filter: QuestionFilter;
  programmeName: string;
  /** This page's address before its week, question and filter (`?group=` on the programme's side). */
  base: string;
  /** The reading view of one person's week on this door, before a person (".../coursework"). */
  personBase: string;
  back: ReadingStep;
  crumb: ReadingStep;
  /** The programme's lead's first name, for who reads a facilitator's own work; null with none who stands. */
  leadFirstName: string | null;
  /** The page where lines are picked to read out for this group, on a reflection, for a reader it admits; null otherwise. */
  readOutHref: ((weekNumber: number) => string) | null;
  /**
   * The groups the reader may choose between on this door, in their order,
   * and this page's address before its week, question and filter for each:
   * the programme's side alone (every live group of the run, which its door
   * admits the lead and admins to). Null behind the group's door.
   */
  groupChoice: { groups: ReadonlyArray<{ id: string; name: string }>; base: (groupId: string) => string } | null;
};

/** A reflection's or a box's words as the row draws them. */
function boxAnswer(written: WrittenBox | undefined, askedThen: string | null): QuestionAnswer | null {
  const text = written?.text.trim() ?? "";
  if (!written || !text) return null;
  return {
    text: written.text,
    boxes: [],
    savedAt: written.at,
    savedLateMs: written.lateMs,
    sentAt: null,
    sentLateMs: null,
    atSession: written.atSession ? { text: written.atSession, boxes: [] } : null,
    askedThen,
  };
}

/**
 * ONE QUESTION OF ONE WEEK ACROSS ONE GROUP, as `actor` may read it, through
 * the door that let them in. Null for a run with no week written as blocks.
 */
export async function loadGroupQuestion(db: Firestore, actor: SessionUser, input: QuestionDoor): Promise<QuestionView | null> {
  const { run, group, liveGroups, facts } = input;
  const now = new Date();
  // Whose work this reader may read in the group: the one gate, person by person, before a word is read.
  const { owners, told, enrolments } = await readableInGroup(db, actor, { run, group, liveGroups, facts });
  const uids = owners.map((owner) => owner.uid);
  // An archived group's fellows, for an admin: their reflections alone, in the weeks the group taught.
  const fellows = archivedGroupFellows(actor, { run, group, liveGroups, facts, enrolments, readable: owners });
  const fellowUids = new Set(fellows.map((fellow) => fellow.uid));
  const taught = new Set(fellows.length > 0 ? resolveSessions(run, group, resolveCalendar(run, group)).map((session) => session.weekNumber) : []);
  const [runWeeks, groupWeeks, names, coursework] = await Promise.all([
    weeksRead(db, run.id, null),
    weeksRead(db, run.id, group.id),
    namesOf(db, [...uids, ...fellowUids], actor),
    // Everything written on the run, the words only for the people this reader may read (an archived group's fellows'
    // reflections among them, and nothing else of theirs is used).
    readRunCoursework(db, { run, liveGroups, now, enrolments }, [...uids, ...fellowUids]),
  ]);
  const columns = columnsOf(run, runWeeks);
  // The weeks anybody listed has written something in: a reflection, a box, or a written answer started. An archived
  // group's fellow counts only by what this page may show of them, a reflection in a week the group taught.
  const withWork = new Set<number>();
  for (const uid of uids) {
    const work = coursework.work.get(uid);
    for (const key of [...(work?.reflections ?? []), ...(work?.boxes ?? [])]) withWork.add(Number(key.split(" ")[0]));
    for (const [key, state] of work?.answers ?? []) if (state !== "not-started") withWork.add(Number(key.split(" ")[0]));
  }
  for (const uid of fellowUids) {
    for (const key of coursework.work.get(uid)?.reflections ?? []) {
      const weekNumber = Number(key.split(" ")[0]);
      if (taught.has(weekNumber)) withWork.add(weekNumber);
    }
  }
  const opening = openingWeek({
    columns: columns.map((column) => column.weekNumber),
    asked: input.askedWeek,
    withWork,
    reached: resolveGroupCalendar(run, group, now).currentWeek?.anchorWeekNumber ?? 0,
  });
  if (!opening) return null;
  const n = opening.weekNumber;
  const weekId = weekDocId(n);
  // The group's own copy of the week, as its people read it.
  const week: CourseworkWeek | null = groupWeeks.get(n) ?? runWeeks.get(n) ?? null;
  const questions = week ? weekQuestionsOf(week, { part: partHeadingWords, answer: WRITTEN_ANSWER }) : [];
  const question = chosenQuestion(questions, input.askedQuestion, input.askedFirst);
  const at = question ? questions.findIndex((each) => each.id === question.id) : -1;
  // The people listed on this question: everybody this reader may read, and on a reflection in a week the archived
  // group taught, its fellows.
  const listsFellows = question?.kind === "reflection" && taught.has(n);
  const listed = [...owners, ...(listsFellows ? fellows : [])];
  const listedUids = listed.map((owner) => owner.uid);
  const ordered = byShownName(listed.map((owner) => ({ ...owner, name: names.get(owner.uid) ?? "NAISI member" })));
  const filter = input.filter;
  const hrefAt = (questionId: string | null, chosen: QuestionFilter) => questionHref(input.base, { weekNumber: n, questionId, filter: chosen });

  const cardNames = await cardNamesOf(db, [
    actor.uid,
    ...listedUids,
    ...coursework.feedback.filter((piece) => piece.weekNumber === n && !fellowUids.has(piece.uid)).map((piece) => piece.byUid),
    ...uids.flatMap((uid) => [...(coursework.writesOf.get(uid)?.answers.values() ?? [])].map((answer) => answer.feedback?.byUid ?? "")),
  ]);
  const [firstReads, keptFrom] = question
    ? await Promise.all([readFirstReads(db, { runId: run.id, weekId, uids }), readFirstReadsKeptFrom(db)])
    : [new Map<string, Map<string, Date>>(), null];

  const key = question ? workKey(n, question.id) : "";
  // The question's words when each listed person first wrote to it, where it has been reworded since: beside words this page shows.
  const asked = question
    ? await askedThenFor(
        db,
        run.id,
        weekId,
        group.id,
        listedUids.flatMap((uid) => {
          const writes = coursework.writesOf.get(uid);
          if (question.kind === "answer") {
            const stored = writes?.answers.get(key);
            return stored && stored.words > 0 ? [{ key: uid, itemId: question.id, writtenAt: stored.writtenAt ?? null }] : [];
          }
          const written = question.kind === "reflection" ? writes?.reflections.has(key) : writes?.boxes.has(key);
          return written ? [{ key: uid, itemId: question.id, writtenAt: coursework.work.get(uid)?.writtenAt?.get(key) ?? null }] : [];
        }),
      )
    : new Map();
  const askedThenOf = (uid: string) => (question ? earlierQuestionWords(asked.get(uid), question.text) : null);
  // The written answer's own deadline on this group's calendar, for "After its deadline" (staff only), as the written
  // answer's review page worked it out: the course is read only when somebody first sent theirs before their session.
  const sentEarly =
    question?.kind === "answer" &&
    uids.some((uid) => {
      const sentAt = coursework.writesOf.get(uid)?.answers.get(key)?.sentAt ?? null;
      const due = coursework.states.dueOf(uid, n);
      return sentAt !== null && due.at !== null && sentAt.getTime() < due.at.getTime();
    });
  const deadline = sentEarly && week?.answer?.due ? await answerDeadline(db, { run, group, weekNumber: n, rule: week.answer.due }) : null;

  const rows: QuestionRow[] = [];
  if (question) {
    const built = await Promise.all(
      ordered.map(async (owner): Promise<QuestionRow | null> => {
        const uid = owner.uid;
        const writes = coursework.writesOf.get(uid);
        // An archived group's fellow, listed on a reflection: what the reflections with names drew, and nothing more.
        const fellow = fellowUids.has(uid);
        const base = {
          uid,
          name: owner.name,
          firstName: cardNames.firstName(uid) || owner.name,
          facilitating: !fellow && facilitatesOnRun(uid, liveGroups),
          notToldYet: !fellow && owner.placedGroupId === group.id && !told.has(uid),
          anchor: personAnchorId(uid),
          // Never a link to a page that would refuse it: a fellow's week does not open.
          weekHref: fellow ? null : `${readingHref(input.personBase, uid, n)}#${questionAnchorId(question.id)}`,
        };
        const readSince = firstReads.get(uid)?.get(question.id) ?? null;
        const due = coursework.states.dueOf(uid, n);
        if (question.kind !== "answer") {
          // A fill-in box is read only by those its own gate admits.
          if (question.kind === "box" && (await boxesReaderFor(db, actor, run.id, uid)) === null) return null;
          const answer = boxAnswer(question.kind === "reflection" ? writes?.reflections.get(key) : writes?.boxes.get(key), askedThenOf(uid));
          return {
            ...base,
            answer,
            notSent: false,
            // A reflection or a box takes no feedback: read once a time is kept; unread only if changed since times were kept.
            // An archived group's fellow's: neither, since no read of their work is kept.
            read: fellow
              ? null
              : readStateOf(
                  { shownInFull: answer !== null, readSince, readableSince: readableSinceOf({ kind: "box", savedAt: answer?.savedAt ?? null }), feedbackPieces: 0 },
                  keptFrom,
                ),
            // A reflection and a fill-in box take no feedback of their own.
            feedback: null,
            late: answer?.savedLateMs != null,
            afterDeadline: false,
            joinedLate: !fellow && answer === null && due.by === "joined-late",
            cards: [],
            own: null,
            mayWrite: false,
            team: null,
          };
        }
        const stored = writes?.answers.get(key) ?? null;
        const pieces = coursework.feedback.filter((piece) => piece.uid === uid && piece.weekNumber === n);
        const { onTheAnswer, ownAnswerPiece, readSavedAt, changedSinceNewest, answerReadable } = feedbackOnAWeek({
          answerId: question.id,
          stored,
          pieces,
          cardNames,
          reader: { uid: actor.uid, isAdmin: facts.isAdmin, now },
          groupFacilitatorUids: group.facilitatorUids,
        });
        const mayReview = writtenReviewRole(actor, facts, owner, liveGroups).mayReview;
        const lastSent = stored ? (stored.lastSentAt ?? stored.sentAt) : null;
        // The words read changed after they were last sent, or were never sent: when, and how late.
        const changedShown = stored?.changedAt && (!lastSent || stored.changedAt.getTime() > lastSent.getTime()) ? stored.changedAt : null;
        const answer: QuestionAnswer | null =
          stored && answerReadable
            ? {
                text: stored.boxes ? "" : stored.text,
                boxes: stored.boxes ? (week?.answer?.boxes ?? []).map((box) => ({ label: box.label, text: stored.boxes?.[box.id] ?? "" })) : [],
                savedAt: changedShown,
                savedLateMs: changedShown ? stored.changedLateMs : null,
                sentAt: lastSent,
                sentLateMs: lastSent ? stored.sentLateMs : null,
                atSession: stored.atSession
                  ? {
                      text: stored.atSession.boxes ? "" : stored.atSession.text,
                      boxes: stored.atSession.boxes ? (week?.answer?.boxes ?? []).map((box) => ({ label: box.label, text: stored.atSession?.boxes?.[box.id] ?? "" })) : [],
                    }
                  : null,
                askedThen: askedThenOf(uid),
              }
            : null;
        const notSent = stored !== null && stored.state !== "not-started" && lastSent === null;
        const team =
          answerReadable && mayRateWorkOf(actor, facts, owner, liveGroups)
            ? await loadTeamRatings(db, {
                runId: run.id,
                uid,
                weekId,
                itemId: question.id,
                viewer: { uid: actor.uid, role: workRatingRoleOf(facts) },
                // For whether the answer has changed since each rating.
                answer: stored?.piece ?? null,
              })
            : null;
        return {
          ...base,
          answer,
          notSent,
          // Any feedback on the answer, on whatever version, says somebody on the team opened it to write that; otherwise
          // unread only if the words shown became readable since times were kept (saved, sent, or their session began).
          read: readStateOf(
            {
              shownInFull: answer !== null,
              readSince,
              readableSince: readableSinceOf({ kind: "answer", savedAt: stored?.changedAt ?? null, lastSentAt: lastSent, sessionStart: coursework.states.dueOf(uid, n).at }),
              feedbackPieces: onTheAnswer.length,
            },
            keptFrom,
          ),
          // Changed since feedback by the newest piece on the answer alone.
          feedback: feedbackStateOf({ takesFeedback: answerReadable, pieces: onTheAnswer.length, changed: changedSinceNewest }),
          late: answer !== null && (answer.sentLateMs !== null || answer.savedLateMs !== null),
          // First sent after its own deadline, before the session: the review page's chip, beside a send that was not late.
          afterDeadline: answer !== null && afterItsDeadline(stored?.sentAt ?? null, deadline, due),
          joinedLate: answer === null && !notSent && due.by === "joined-late",
          cards: sideCardsOf(onTheAnswer, ownAnswerPiece, readSavedAt),
          own: ownAnswerPiece,
          mayWrite: mayReview && answerReadable,
          team,
        };
      }),
    );
    for (const row of built) if (row) rows.push(row);
  }

  const shown = filterRows(rows, filter);
  const steps = question ? neighboursOf(questions, (each) => each.id, question.id) : { previous: null, next: null };
  // The switch to one person's week lands on the first person whose week opens.
  const first = shown.find((row) => row.weekHref !== null) ?? rows.find((row) => row.weekHref !== null) ?? null;
  // Never an archived group's fellow's, whose work the route marks for nobody.
  const drawn = shown.filter((row) => row.answer !== null && !fellowUids.has(row.uid));
  // The choice of group keeps what the address named and nothing it did not: the week when it was one of the run's,
  // the question when it is the one shown (else the kind `first=` asked for), and the filters.
  const choice = input.groupChoice;
  const kept = {
    weekNumber: opening.asked ? n : null,
    questionId: question && typeof input.askedQuestion === "string" && input.askedQuestion === question.id ? question.id : null,
    first: input.askedFirst,
    filter,
  };
  return {
    door: input.door,
    runId: run.id,
    programmeName: input.programmeName,
    groupName: group.name.trim() || "Untitled group",
    viewer: input.viewer,
    viewerFirstName: cardNames.firstName(actor.uid),
    weekNumber: n,
    // The run's taught weeks, written as blocks or not, for "week 3 of 6".
    weeksTotal: new Set(run.weekPlan.flatMap((entry) => (entry.kind === "week" ? [entry.weekNumber] : []))).size,
    weekTitle: week?.title ?? "",
    question,
    range: question?.kind === "answer" ? (week?.answer?.words ?? null) : null,
    position: { at: at + 1, of: questions.length },
    answerBoxes: week?.answer?.boxes ?? [],
    filter,
    counts: filterCounts(rows),
    filterHrefs: {
      everybody: hrefAt(question?.id ?? null, { unread: false, noFeedback: false, late: false }),
      unread: hrefAt(question?.id ?? null, toggled(filter, "unread")),
      noFeedback: hrefAt(question?.id ?? null, toggled(filter, "noFeedback")),
      late: hrefAt(question?.id ?? null, toggled(filter, "late")),
    },
    takesFeedback: question?.kind === "answer",
    rows: shown,
    everybody: rows.length,
    // Who reads a facilitator's own work, where one is listed: only ever to the lead and admins, who alone are shown one.
    ownLine:
      input.viewer !== "facilitator" && shown.some((row) => row.facilitating)
        ? facilitatorsOwnLine(input.viewer === "lead" ? { firstName: "", isReader: true } : input.leadFirstName ? { firstName: input.leadFirstName, isReader: false } : null)
        : null,
    readOut:
      question?.kind === "reflection" && input.readOutHref
        ? { line: namedReadersLine(group.name.trim() || "Your group", input.leadFirstName), href: input.readOutHref(n) }
        : null,
    nav: {
      previousQuestion: steps.previous ? { label: steps.previous.text, href: hrefAt(steps.previous.id, filter) } : null,
      nextQuestion: steps.next ? { label: steps.next.text, href: hrefAt(steps.next.id, filter) } : null,
      personWeek: first ? first.weekHref : null,
      back: input.back,
      crumb: input.crumb,
    },
    // What this page puts in front of its reader in full: the answers of the people the filter keeps.
    firstRead: question && drawn.length > 0 ? { weekId, people: drawn.map((row) => ({ uid: row.uid, ids: [question.id] })) } : null,
    groups:
      choice && choice.groups.length > 1
        ? choice.groups.map((each) => ({ id: each.id, name: each.name, href: questionHref(choice.base(each.id), kept), current: each.id === group.id }))
        : null,
  };
}

/**
 * The written answer's own deadline on the group's calendar (`dueMoment` with
 * its block's rule and the course's time for work due the day before), for
 * "After its deadline": one read of the course.
 */
async function answerDeadline(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; weekNumber: number; rule: NonNullable<NonNullable<CourseworkWeek["answer"]>["due"]> },
): Promise<Date | null> {
  const { run } = input;
  const courseSnap = run.courseId ? await db.collection("courses").doc(run.courseId).get() : null;
  const dayBefore = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}).dayBeforeDueTime : null;
  return dueMoment(resolveSessions(run, input.group), input.weekNumber, input.rule, dayBefore)?.at ?? null;
}
