import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRunCoursework } from "@/lib/courses/facilitatorWeek/readers";
import type { WeekViewer } from "@/lib/courses/facilitatorWeek/model";
import type { StaffFeedbackCard } from "@/lib/courses/feedback/model";
import { cardNamesOf } from "@/lib/courses/feedback/readers";
import { boxesReaderFor } from "@/lib/courses/fillInBoxes/access";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { readFirstReads, readFirstReadsKeptFrom } from "@/lib/courses/weekWork/firstRead";
import { mayRateWorkOf, workRatingRoleOf } from "@/lib/courses/workRatings/access";
import type { TeamRatingsView } from "@/lib/courses/workRatings/model";
import { loadTeamRatings } from "@/lib/courses/workRatings/readers";
import { facilitatesOnRun, writtenReviewRole, type ReviewerFacts } from "@/lib/courses/writtenAnswers/access";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
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
  type QuestionFilter,
  type ReadState,
  type WeekQuestion,
} from "./question";
import { byShownName, neighboursOf, openingWeek, readingHref } from "./reading";
import { feedbackOnAWeek, readableInGroup, sideCardsOf, type ReadingStep } from "./readingLoad";
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
  /** Feedback on a written answer, the reader's own changeable piece apart. */
  cards: StaffFeedbackCard[];
  own: StaffFeedbackCard | null;
  /** The reader may write feedback on it now. */
  mayWrite: boolean;
  /** Ratings for the team: an admin or the programme's lead alone. */
  team: TeamRatingsView | null;
  /** The reading view of their week, at this question. */
  weekHref: string;
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
  filter: QuestionFilter;
  programmeName: string;
  /** This page's address before its week, question and filter (`?group=` on the programme's side). */
  base: string;
  /** The reading view of one person's week on this door, before a person (".../coursework"). */
  personBase: string;
  back: ReadingStep;
  crumb: ReadingStep;
};

/** A reflection's or a box's words as the row draws them. */
function boxAnswer(written: WrittenBox | undefined): QuestionAnswer | null {
  const text = written?.text.trim() ?? "";
  if (!written || !text) return null;
  return { text: written.text, boxes: [], savedAt: written.at, savedLateMs: written.lateMs, sentAt: null, sentLateMs: null };
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
  const [runWeeks, groupWeeks, names, coursework] = await Promise.all([
    weeksRead(db, run.id, null),
    weeksRead(db, run.id, group.id),
    namesOf(db, uids, actor),
    // Everything written on the run, the words only for the people this reader may read.
    readRunCoursework(db, { run, liveGroups, now, enrolments }, uids),
  ]);
  const columns = columnsOf(run, runWeeks);
  // The weeks anybody listed has written something in: a reflection, a box, or a written answer started.
  const withWork = new Set<number>();
  for (const uid of uids) {
    const work = coursework.work.get(uid);
    for (const key of [...(work?.reflections ?? []), ...(work?.boxes ?? [])]) withWork.add(Number(key.split(" ")[0]));
    for (const [key, state] of work?.answers ?? []) if (state !== "not-started") withWork.add(Number(key.split(" ")[0]));
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
  const question = chosenQuestion(questions, input.askedQuestion);
  const at = question ? questions.findIndex((each) => each.id === question.id) : -1;
  const ordered = byShownName(owners.map((owner) => ({ ...owner, name: names.get(owner.uid) ?? "NAISI member" })));
  const filter = input.filter;
  const hrefAt = (questionId: string | null, chosen: QuestionFilter) => questionHref(input.base, { weekNumber: n, questionId, filter: chosen });

  const cardNames = await cardNamesOf(db, [
    actor.uid,
    ...uids,
    ...coursework.feedback.filter((piece) => piece.weekNumber === n).map((piece) => piece.byUid),
    ...[...coursework.writesOf.values()].flatMap((writes) => [...writes.answers.values()].map((answer) => answer.feedback?.byUid ?? "")),
  ]);
  const [firstReads, keptFrom] = question
    ? await Promise.all([readFirstReads(db, { runId: run.id, weekId, uids }), readFirstReadsKeptFrom(db)])
    : [new Map<string, Map<string, Date>>(), null];

  const rows: QuestionRow[] = [];
  if (question) {
    const key = workKey(n, question.id);
    const built = await Promise.all(
      ordered.map(async (owner): Promise<QuestionRow | null> => {
        const uid = owner.uid;
        const writes = coursework.writesOf.get(uid);
        const base = {
          uid,
          name: owner.name,
          firstName: cardNames.firstName(uid) || owner.name,
          facilitating: facilitatesOnRun(uid, liveGroups),
          notToldYet: owner.placedGroupId === group.id && !told.has(uid),
          anchor: personAnchorId(uid),
          weekHref: `${readingHref(input.personBase, uid, n)}#${questionAnchorId(question.id)}`,
        };
        const readSince = firstReads.get(uid)?.get(question.id) ?? null;
        if (question.kind !== "answer") {
          // A fill-in box is read only by those its own gate admits.
          if (question.kind === "box" && (await boxesReaderFor(db, actor, run.id, uid)) === null) return null;
          const answer = boxAnswer(question.kind === "reflection" ? writes?.reflections.get(key) : writes?.boxes.get(key));
          return {
            ...base,
            answer,
            notSent: false,
            // A reflection or a box takes no feedback: read once a time is kept; unread only if changed since times were kept.
            read: readStateOf(
              { shownInFull: answer !== null, readSince, readableSince: readableSinceOf({ kind: "box", savedAt: answer?.savedAt ?? null }), feedbackPieces: 0 },
              keptFrom,
            ),
            // A reflection and a fill-in box take no feedback of their own.
            feedback: null,
            late: answer?.savedLateMs != null,
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
              }
            : null;
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
          notSent: stored !== null && stored.state !== "not-started" && lastSent === null,
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
  const first = shown[0] ?? rows[0] ?? null;
  const drawn = shown.filter((row) => row.answer !== null);
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
    nav: {
      previousQuestion: steps.previous ? { label: steps.previous.text, href: hrefAt(steps.previous.id, filter) } : null,
      nextQuestion: steps.next ? { label: steps.next.text, href: hrefAt(steps.next.id, filter) } : null,
      personWeek: first ? first.weekHref : null,
      back: input.back,
      crumb: input.crumb,
    },
    // What this page puts in front of its reader in full: the answers of the people the filter keeps.
    firstRead: question && drawn.length > 0 ? { weekId, people: drawn.map((row) => ({ uid: row.uid, ids: [question.id] })) } : null,
  };
}
