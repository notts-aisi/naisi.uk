import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { LedProgramme } from "@/lib/courses/programmeLead";
import { chooseOnesOf, talksOf } from "@/lib/courses/packsAndCases/model";
import { readGroupWeek, weekWorkOf, type DrawPerson } from "@/lib/courses/packsAndCases/readers";
import { CASE, NOT_GIVEN_YET, chooseOneHeadingWords } from "@/lib/courses/packsAndCases/words";
import { loadWrittenReview } from "@/lib/courses/writtenAnswers/reviewPage";
import type { ReviewPerson } from "@/lib/courses/writtenAnswers/reviewPage";
import { facilitatesOnRun, liveGroupsOf } from "@/lib/courses/writtenAnswers/access";
import { WRITTEN_ANSWER } from "@/lib/courses/writtenAnswerWords";
import { personWeekStateOf } from "@/lib/courses/groupWeekWork/model";
import { weekAsksForWriting, weekWritingNeeds } from "@/lib/courses/weekWork/model";
import { loadPeopleWeekFacts, loadRunWeekStates } from "@/lib/courses/weekWork/readers";
import { groupSessionAt } from "@/lib/courses/weekWork/sessionDue";
import { NOT_STARTED, STARTED, groupSessionWords, personWeekTone } from "@/lib/courses/weekWork/words";
import { weekTaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { resolveSessions } from "@/lib/courses/sessions";
import { NOT_CHOSEN_YET, TO_GIVE_FEEDBACK, feedbackByWords, weekColumnWords } from "./words";

/**
 * THIS WEEK'S WORK'S OTHER COLUMNS ("Pathway", "Written
 * answer", "Case"), for the week a group's page shows, worked out on the
 * server after the page's own gate, through the pieces' own readers and
 * nothing else:
 *
 *  - THE WEEK (the week stays open): where each person's week stands, by the
 *    one meaning of done every page uses (`src/lib/courses/weekWork/`):
 *    "Done on time", "Done late" with how late beside it, "2 of 3 done",
 *    "Started", "Not started" or "Joined late". Each cell is worked out by
 *    the same function the group's page counts the week with
 *    (`personWeekStateOf`), so its "4 of 6 have done week 1" and these
 *    cells can never disagree. Nothing is reopened now, so
 *    no cell carries a reopen. A facilitator's own row is worked out only
 *    for the programme's lead and admins, the only people who read a
 *    facilitator's own work, and so whether it was late: never for a
 *    co-facilitator, and never for somebody holding a place here who
 *    facilitates another of the run's groups. The column's note is when the
 *    group meets that week ("Meets Wed 3pm", "Met Wed 3pm"). Drawn for a
 *    week that asks for something written.
 *  - PATHWAY AND CASE: `weekWorkOf`, the packs' reader for this table. A pack
 *    the person picked is shown to the group's facilitators, the programme's
 *    lead and admins (privacy v7, "Pathways and cases"), except a
 *    facilitator's own pick, which only the lead and admins see. A column is
 *    drawn only for a week that has its block: a Choose one for Pathway (its
 *    own title heads it, as its week page heads it), a talk that hands out
 *    cases for Case.
 *  - WRITTEN ANSWER: `loadWrittenReview`, the reader the written answer's
 *    review page had, so each cell says what that page said of the same
 *    answer, to the same reader, by the one gate: "Not started", "Started"
 *    (never how long, nor what it says, until it is sent or the session has
 *    started: privacy v17), "To give feedback" (a link to the reading view of
 *    the person's week at the answer), "Feedback · Rahul" (who has left
 *    feedback on it, a link there too). A person the reader may
 *    not review gets no cell. Drawn only for a week with a written answer.
 *
 * Who the rows are is This week's work's own (`loadGroupWeek`): a facilitator
 * is never shown a facilitator's own row, the lead and admins are. Plain data
 * leaves here; the page draws it.
 */

/**
 * One cell: its words, the address it leads to when it is a link, and for the
 * week's column the count beside it and how it is drawn; on a written
 * answer's, how late it was sent.
 */
export type WorkCell = {
  text: string;
  href: string | null;
  detail?: string | null;
  tone?: "done" | "partly" | "none";
  /** On a written answer's cell: how long after the session it was last sent (ms), or null when not after it. */
  lateMs?: number | null;
};

/** One column: its head, a cell for each person it says something of, by uid, and a note beside the table's head. */
export type WorkColumnData = {
  key: "week" | "pathway" | "written" | "case";
  label: string;
  cells: Record<string, WorkCell>;
  /** "Meets Wed 3pm", "Met Wed 3pm": when the group meets that week, for the week's column. */
  note?: string | null;
};

/** What a written answer's cell says, as the written answers' review loader groups the same answer. */
function writtenCell(person: ReviewPerson, href: string): WorkCell {
  if (person.readable && person.hasFeedback) return { text: feedbackByWords(person.feedbackByNames), href, lateMs: person.sentLateMs };
  if (person.readable && person.words > 0) return { text: TO_GIVE_FEEDBACK, href, lateMs: person.sentLateMs };
  return { text: person.state === "not-started" ? NOT_STARTED : STARTED, href: null };
}

export async function loadWorkColumns(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    actor: SessionUser;
    /** The reader, as the packs' reader asks: an admin, or the programme's lead (the programme they lead). */
    viewer: { isAdmin: boolean; leadOf: LedProgramme | null };
    /** The week This week's work shows. */
    weekNumber: number;
    /** Everybody in the group's draw, its facilitators too. */
    people: readonly DrawPerson[];
    /** The reading view of one person's week at the written answer, as this reader reaches it. */
    reviewHref: (uid: string, weekNumber: number) => string;
    now: Date;
  },
): Promise<WorkColumnData[]> {
  const { run, group, actor, viewer, weekNumber, people, reviewHref, now } = input;
  const week = await readGroupWeek(db, run.id, group.id, weekNumber);
  if (!week) return [];
  const chooseOne = chooseOnesOf(week.blocks)[0] ?? null;
  const givesCases = talksOf(week.blocks).some((talk) => talk.groups.some((caseGroup) => caseGroup.cases.length > 0));
  const [work, review] = await Promise.all([
    chooseOne || givesCases ? weekWorkOf(db, run.id, week, people, viewer) : Promise.resolve(null),
    loadWrittenReview(db, actor, run, group, weekNumber, now),
  ]);

  const columns: WorkColumnData[] = [];
  if (weekAsksForWriting(week.blocks)) {
    // Where each person's week stands, by the one meaning of done.
    const liveGroups = await liveGroupsOf(db, run.id);
    const states = await loadRunWeekStates(db, { run, liveGroups, now });
    // A facilitator's own week, and so whether it was late, is the lead's and
    // admins' alone: this group's facilitators, and anybody holding a place
    // here who facilitates another of the run's live groups, as the card
    // above and the written answers' review loader (`facilitatesOnRun`) have it.
    const seesOwnWork = viewer.isAdmin || viewer.leadOf !== null;
    const shown = people.filter((person) => seesOwnWork || !(person.facilitates || facilitatesOnRun(person.uid, liveGroups)));
    const facts = await loadPeopleWeekFacts(db, {
      runId: run.id,
      weekNumber,
      blocks: week.blocks,
      uids: shown.map((person) => person.uid),
    });
    const tasks = weekTaskNeeds(week.blocks);
    const asks = weekWritingNeeds(week.blocks);
    const cells: Record<string, WorkCell> = {};
    for (const person of shown) {
      const own = facts.get(person.uid);
      if (!own) continue;
      const due = states.dueOf(person.uid, weekNumber);
      const state = personWeekStateOf({ tasks, asks, pieces: [], facts: own, submittedAt: states.submittedOf(person.uid, weekNumber), due });
      const line = { progress: state.progress, doneAt: state.progress.doneAt, due };
      cells[person.uid] = { text: state.text, href: null, detail: state.detail, tone: personWeekTone(line) };
    }
    const meets = groupSessionAt({ sessionLists: [resolveSessions(run, group)], toldAt: null }, weekNumber);
    columns.push({ key: "week", label: weekColumnWords(weekNumber), cells, note: meets ? groupSessionWords(meets, now) : null });
  }
  if (work && chooseOne && work.packTitle) {
    const none = chooseOne.givenBy === "fellow" ? NOT_CHOSEN_YET : NOT_GIVEN_YET;
    columns.push({
      key: "pathway",
      // The Choose one's title, as its week page heads it: "Pathway", or a list's own line, capitalised.
      label: chooseOneHeadingWords(chooseOne) || work.packTitle,
      cells: Object.fromEntries(people.map((person) => [person.uid, { text: work.cells.get(person.uid)?.pack ?? none, href: null }])),
    });
  }
  if (review.answer && review.weekNumber === weekNumber) {
    const cells: Record<string, WorkCell> = {};
    for (const person of [...review.toGive, ...review.feedbackSent, ...review.notSent]) {
      cells[person.uid] = writtenCell(person, reviewHref(person.uid, weekNumber));
    }
    columns.push({ key: "written", label: WRITTEN_ANSWER, cells });
  }
  if (work && givesCases) {
    columns.push({
      key: "case",
      label: CASE,
      cells: Object.fromEntries(people.map((person) => [person.uid, { text: work.cells.get(person.uid)?.case ?? NOT_GIVEN_YET, href: null }])),
    });
  }
  return columns;
}
