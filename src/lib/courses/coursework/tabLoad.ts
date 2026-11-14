import "server-only";
import { readsGroupIdFor } from "@/lib/courses/weekCopy";
import type { Firestore } from "firebase-admin/firestore";
import type { ProgrammeRunView } from "@/lib/applications/handover/programmeRun";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { listPlaceHolders } from "@/lib/applications/people/load";
import { readRunCoursework } from "@/lib/courses/facilitatorWeek/readers";
import { boxesReaderForStaff } from "@/lib/courses/fillInBoxes/access";
import { resolveGroupCalendar, type GroupCalendar } from "@/lib/courses/groupResolve";
import { readPackCaseRecords } from "@/lib/courses/packsAndCases/readers";
import { weekOpensOn } from "@/lib/courses/weekPlan";
import { readFirstReadsKeptFrom, readRunWeekRecords } from "@/lib/courses/weekWork/firstRead";
import { liveGroupsOf, ownerFactsFromSeat, reviewerFactsOf, writtenReviewRole } from "@/lib/courses/writtenAnswers/access";
import type { SessionUser } from "@/lib/firebase/session";
import { weekDocId } from "@/lib/firestore/courses";
import { accountsToName, openCoursework, peopleOf, programmePathOf, readRunSeats } from "./load";
import {
  NO_WORK,
  chooseOneIdsOf,
  filterHref,
  readFilter,
  rowsInGroup,
  showCounts,
  type CourseworkFilter,
  type CourseworkPerson,
  type CourseworkSection,
  type CourseworkShow,
  type CourseworkViewer,
} from "./model";
import { WAITING_SHOWN, courseworkRows, sectionsOf, tabWeekOf, waitingList, type WaitingRow } from "./overview";
import { questionHref } from "./question";
import { columnsOf, namesOf, weeksRead } from "./reads";
import { NOT_IN_A_GROUP_YET } from "./words";

/**
 * A PROGRAMME'S COURSEWORK TAB, READ (Zach, Fri 30 Oct; redrawn Fri 13 Nov
 * 2026), on the server, for the programme's lead and admins.
 *
 * THE GATE comes first, from the form, before the run is read
 * (`openCoursework` in `./load.ts`, through `loadProgrammeRun`): an admin or
 * the programme's lead. A reviewer is answered `not-yours`, anybody with no
 * role on the programme as for a programme that is not there.
 *
 * WHAT IS READ, after it, and never a word anybody wrote: the form and who
 * holds a place (`listPlaceHolders`); the run's live groups and its seats;
 * the run's weeks and each group's own copies; every week record on the run
 * with the times answers were first read, in ONE read through the store of
 * those times (`readRunWeekRecords`), the records handed on so they are not
 * read again, and the day the site began keeping those times
 * (`readFirstReadsKeptFrom`); every reflection, box, written answer and tick
 * on the run as counts, states and facts (`readRunCoursework`, with no words
 * for anybody); each person's pack in the Choose ones their weeks count, for
 * whether a week is done; the names of everybody listed. Private notes and
 * survey answers never. Nothing is written.
 *
 * THE FLAGS (`./overview.ts`) are worked out only for the people whose work
 * this reader may read (`writtenReviewRole` over `ownerFactsFromSeat`, the
 * gate every reading page asks): never the reader's own row, an admin and the
 * lead included, and to the lead nobody whose placement Publish has not told.
 * A box counts only for a reader the boxes' own gate admits
 * (`boxesReaderForStaff`). The page is handed whether each flag is true,
 * never a time anything was read, and never who read it: nothing keeps who.
 *
 * A PLACEMENT is shown to this viewer only where `placementIsShownTo` says
 * so (`peopleOf`): an admin sees every one, the lead only those Publish has
 * told.
 */

export type CourseworkTabView = {
  roundId: string;
  programmeId: string;
  programmeName: string;
  viewer: CourseworkViewer;
  columns: Array<{ weekNumber: number; title: string }>;
  /** The run's live groups, for the filter and the sections' heads, in the one order every tab lists them, each with its facilitators by name. */
  groups: Array<{ id: string; name: string; facilitators: string[] }>;
  filter: CourseworkFilter;
  sections: CourseworkSection[];
  counts: { holding: number; facilitating: number; waiting: number };
  /** Each filter's count: the people it would show of the chosen group. */
  showCounts: Record<CourseworkShow, number>;
  /** The lead's first name, for the line about who opens the tab; null with no lead. */
  leadFirstName: string | null;
  /** Every row's name by account, whatever the filter: the panels under the table name people by it. */
  names: Record<string, string>;
  /** The week the tab is on: at phone width, one week at a time, and "Read one question". Null with no columns. */
  week: { weekNumber: number; asked: boolean } | null;
  /** The page of one question across the chosen group (the first group when none is), on that week; null with no group. */
  questionHref: string | null;
  /** What waits for this reader's feedback, oldest first, of the chosen group: the first ten, or all when asked. */
  waiting: { rows: WaitingRow[]; total: number; allHref: string | null };
};

export type CourseworkTabOutcome =
  | { status: "none" }
  | { status: "not-yours" }
  | { status: "blank"; view: ProgrammeRunView }
  | { status: "ok"; view: CourseworkTabView };

/** What the address may ask of the tab. */
export type CourseworkTabQuery = {
  group?: unknown;
  waiting?: unknown;
  notdone?: unknown;
  late?: unknown;
  unread?: unknown;
  changed?: unknown;
  week?: unknown;
  list?: unknown;
};

/** The address's word for the whole list of what waits for feedback. */
export const ALL_WAITING = "all";

export async function loadCourseworkTab(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  query: CourseworkTabQuery,
): Promise<CourseworkTabOutcome> {
  const gate = await openCoursework(db, actor, roundId, programmeId);
  if (gate.status !== "ok") return gate;
  const { view, run, form, viewer } = gate;

  const now = new Date();
  const [holders, groups, { enrolments, seats }, runWeeks, programme, facts, weekRecords, keptFrom] = await Promise.all([
    listPlaceHolders(db, form, view.programmeId),
    liveGroupsOf(db, run.id),
    // One equality on one field: the run's seats.
    readRunSeats(db, run.id),
    weeksRead(db, run.id, null),
    runProgrammeOf(db, run.id),
    reviewerFactsOf(db, actor, run.id),
    // Every week record on the run and the first reads on them: one equality on the run, read once.
    readRunWeekRecords(db, run.id),
    readFirstReadsKeptFrom(db),
  ]);
  const [groupWeeks, names, coursework] = await Promise.all([
    Promise.all(groups.map(async (group) => [group.id, await weeksRead(db, run.id, group.id)] as const)),
    namesOf(db, accountsToName(groups, holders, seats), actor),
    // Counts, states and facts for everybody; the words of nobody.
    readRunCoursework(db, { run, liveGroups: groups, now, enrolments, weekRecords: weekRecords.records }, null),
  ]);
  const weeksOf = new Map(groupWeeks);
  const columns = columnsOf(run, runWeeks);
  const people = peopleOf({ viewer, groups, holders, seats, names });
  // The copies of every group a shown person's weeks name and that no longer meets: somebody moved mid-term out of a
  // group archived since is still read, week by week, on that group's copy (`copiesOf`). Nothing for everybody else.
  const archivedCopies = [...new Set(people.flatMap((person) => (person.readsCopies ?? []).map((entry) => entry.groupId)))].filter(
    (id) => !weeksOf.has(id),
  );
  for (const [id, weeks] of await Promise.all(archivedCopies.map(async (id) => [id, await weeksRead(db, run.id, id)] as const))) {
    weeksOf.set(id, weeks);
  }
  const weekOf = (groupId: string | null, weekNumber: number) =>
    groupId ? (weeksOf.get(groupId)?.get(weekNumber) ?? null) : (runWeeks.get(weekNumber) ?? null);
  // Each person's pack in the Choose ones the weeks they read count, by id: a
  // week with a pathway is done only once its pack's reading is ticked.
  const packRecords = await readPackCaseRecords(
    db,
    run.id,
    people.flatMap((person) =>
      columns.flatMap((column) => chooseOneIdsOf(weekOf(readsGroupIdFor(person, column.weekNumber), column.weekNumber)).map((blockId) => ({ uid: person.uid, blockId }))),
    ),
  );
  const packs = new Map<string, Map<string, string>>();
  for (const record of packRecords.values()) {
    if (!record.packId) continue;
    const own = packs.get(record.uid) ?? new Map<string, string>();
    own.set(record.blockId, record.packId);
    packs.set(record.uid, own);
  }
  // Each group's calendar (the run's own for somebody in no group), resolved
  // once on one clock: the last week that has begun on it, and the day each
  // week opens (`weekOpensOn`, the first day of the slot `currentWeekFor`
  // anchors to when it decides a week has begun).
  const calendars = new Map<string | null, GroupCalendar>();
  const calendarOf = (groupId: string | null) => {
    let found = calendars.get(groupId);
    if (!found) {
      const group = groupId ? (groups.find((candidate) => candidate.id === groupId) ?? null) : null;
      found = resolveGroupCalendar(run, group, now);
      calendars.set(groupId, found);
    }
    return found;
  };
  // Whose work this reader may read, by the one gate every reading page asks: never their own.
  const boxesRead = boxesReaderForStaff(facts) !== null;
  const readingOf = (person: CourseworkPerson) => {
    const owner = ownerFactsFromSeat(person.uid, seats.get(person.uid) ?? null, groups, { isAdmin: facts.isAdmin });
    return owner && writtenReviewRole(actor, facts, owner, groups).mayReview ? { boxes: boxesRead } : null;
  };
  const programmePath = programmePathOf(view);
  const base = `${programmePath}/coursework`;
  const groupList = groups.map((group) => ({
    id: group.id,
    name: group.name.trim() || "Untitled group",
    facilitators: group.facilitatorUids.filter(Boolean).map((uid) => names.get(uid) ?? "NAISI member"),
  }));
  const groupIds = groupList.map((group) => group.id);
  const filter = readFilter(query, groupIds);
  const rows = courseworkRows({
    columns,
    people,
    workOf: (uid) => ({ ...(coursework.work.get(uid) ?? NO_WORK), packs: packs.get(uid) ?? new Map() }),
    weekOf,
    personHref: (uid) => `${base}/${encodeURIComponent(uid)}`,
    standingOf: (uid, weekNumber) => ({ submittedAt: coursework.states.submittedOf(uid, weekNumber), due: coursework.states.dueOf(uid, weekNumber) }),
    reachedOf: (person) => calendarOf(person.readsGroupId).currentWeek?.anchorWeekNumber ?? 0,
    opensOf: (person, weekNumber) => weekOpensOn(calendarOf(person.readsGroupId).calendar, weekNumber),
    readingOf,
    firstReadsOf: (uid, weekNumber) => weekRecords.firstReads.get(uid)?.get(weekDocId(weekNumber)) ?? new Map(),
    keptFrom,
  });
  // The chosen group's people: what each filter counts, the week the tab is on, and the list of what waits.
  const inGroup = rowsInGroup(rows, filter.group, groupIds);
  const week = tabWeekOf(query, columns, inGroup);
  const waiting = waitingList(inGroup);
  const all = query.list === ALL_WAITING;
  const questionGroup = groupIds.includes(filter.group) ? filter.group : (groupIds[0] ?? null);
  return {
    status: "ok",
    view: {
      roundId: view.roundId,
      programmeId: view.programmeId,
      programmeName: view.programmeName,
      viewer,
      columns,
      groups: groupList,
      filter,
      sections: sectionsOf(rows, { groups: groupList, filter, notInAGroupTitle: NOT_IN_A_GROUP_YET }),
      counts: {
        holding: people.filter((person) => !person.facilitating).length,
        facilitating: people.filter((person) => person.facilitating).length,
        waiting: rows.filter((row) => row.noFeedback).length,
      },
      showCounts: showCounts(inGroup),
      leadFirstName: programme?.leadFirstName ?? null,
      names: Object.fromEntries(rows.map((row) => [row.uid, row.name])),
      week,
      questionHref:
        questionGroup && week
          ? questionHref(`${programmePath}/question?group=${encodeURIComponent(questionGroup)}`, { weekNumber: week.weekNumber, questionId: null })
          : null,
      waiting: {
        rows: all ? waiting : waiting.slice(0, WAITING_SHOWN),
        total: waiting.length,
        allHref: !all && waiting.length > WAITING_SHOWN ? withList(filterHref(base, filter, week?.asked ? week.weekNumber : null)) : null,
      },
    },
  };
}

/** A tab address with the whole list of what waits asked for. */
function withList(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}list=${ALL_WAITING}`;
}
