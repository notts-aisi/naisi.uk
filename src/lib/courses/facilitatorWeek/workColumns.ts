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
import { DRAFT, NOT_STARTED, WRITTEN_ANSWER } from "@/lib/courses/writtenAnswerWords";
import { NOT_CHOSEN_YET, TO_GIVE_FEEDBACK, feedbackSentByWords } from "./words";

/**
 * THIS WEEK'S WORK'S OTHER COLUMNS (board wk-fac-group: "Pathway", "Written
 * answer", "Case"), for the week a group's page shows, worked out on the
 * server after the page's own gate, through the two pieces' own readers and
 * nothing else:
 *
 *  - PATHWAY AND CASE: `weekWorkOf`, the packs' reader for this table. A pack
 *    the person picked is shown to the group's facilitators, the programme's
 *    lead and admins (privacy v7, "Pathways and cases"), except a
 *    facilitator's own pick, which only the lead and admins see. A column is
 *    drawn only for a week that has its block: a Choose one for Pathway (its
 *    own title heads it, as its week page heads it), a talk that hands out
 *    cases for Case.
 *  - WRITTEN ANSWER: `loadWrittenReview`, the review page's reader, so each
 *    cell says what the review page says of the same answer, to the same
 *    reader, by the one gate: "Not started", "Draft", "To give feedback" (a
 *    link to it on the review page), "Feedback sent · Rahul". A person the
 *    reader may not review gets no cell. Drawn only for a week with a written
 *    answer.
 *
 * Who the rows are is This week's work's own (`loadGroupWeek`): a facilitator
 * is never shown a facilitator's own row, the lead and admins are. Plain data
 * leaves here; the page draws it.
 */

/** One cell: its words, and the address it leads to when it is a link. */
export type WorkCell = { text: string; href: string | null };

/** One column: its head, and a cell for each person it says something of, by uid. */
export type WorkColumnData = { key: "pathway" | "written" | "case"; label: string; cells: Record<string, WorkCell> };

/** What a written answer's cell says, as the review page groups the same answer. */
function writtenCell(person: ReviewPerson, href: string): WorkCell {
  switch (person.state) {
    case "sent":
    case "opened":
      return { text: TO_GIVE_FEEDBACK, href };
    case "feedback":
      return { text: feedbackSentByWords(person.feedbackByName), href: null };
    case "draft":
      return { text: DRAFT, href: null };
    case "not-started":
      return { text: NOT_STARTED, href: null };
  }
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
    /** The review page's address for one person's answer that week, as this reader reaches it. */
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
    loadWrittenReview(db, actor, run, group, weekNumber, null, now),
  ]);

  const columns: WorkColumnData[] = [];
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
