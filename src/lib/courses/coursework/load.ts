import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { PlaceHolder } from "@/lib/applications/handover/holders";
import { loadProgrammeRun, type ProgrammeRunView } from "@/lib/applications/handover/programmeRun";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { listPlaceHolders } from "@/lib/applications/people/load";
import { loadForm } from "@/lib/applications/repo";
import { readRunCoursework } from "@/lib/courses/facilitatorWeek/readers";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { readPackCaseRecords } from "@/lib/courses/packsAndCases/readers";
import { liveGroupsOf, reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseEnrolment, placementIsShownTo, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  NO_WORK,
  chooseOneIdsOf,
  courseworkSections,
  readFilter,
  type CourseworkFilter,
  type CourseworkPerson,
  type CourseworkSection,
  type CourseworkViewer,
} from "./model";
import { readPersonWeek, type PersonWeekView } from "./readingLoad";
import { columnsOf, namesOf, weeksRead } from "./reads";
import { BACK_TO_COURSEWORK, NOT_IN_A_GROUP_YET } from "./words";

/**
 * A PROGRAMME'S COURSEWORK, READ (Zach, Fri 30 Oct): the Coursework tab and
 * one person's page, on the server, for the programme's lead and admins.
 * `./model.ts` says who is a row, which week each reads and what a cell says;
 * this file reads and hands the pages what they draw.
 *
 * THE GATE comes first, from the form, before the run is read
 * (`loadProgrammeRun`, the Groups and Attendance tabs' own): an admin or the
 * programme's lead. A reviewer is answered `not-yours`, anybody with no role
 * on the programme as for a programme that is not there.
 *
 * WHAT IS READ, after it: the form, and who holds a place on the programme
 * (`listPlaceHolders`, the People tab's set by the same test, nobody before
 * decisions have gone out); the run, its live groups and its seats (one
 * equality on the run each); the run's weeks and each group's own copies;
 * every reflection, box, written answer and tick on the run, and where each
 * week stands (`readRunCoursework`, one equality on the run per store, words
 * only for the one person whose page is drawn); for the tab, each person's
 * pack in the Choose ones their weeks count, by id, for whether a week is
 * done; and the names of the facilitators and of whoever gave feedback. One
 * person's week is read by the reading view's own loader
 * (`./readingLoad.ts`, `readPersonWeek`), which this file's door hands the
 * person after the gate: a private note only there and only where
 * `privateNotesOf` says (on this side, an admin; never the lead), a person's
 * boxes only once their gate has answered (`boxesReaderFor`). Survey answers
 * never. Nothing is written.
 *
 * A PLACEMENT is shown to this viewer only where `placementIsShownTo` says
 * so: an admin sees every one, the lead only those Publish has told. The
 * question is asked twice per seat, once about the viewer (which group the
 * row sits in) and once about a viewer who is no admin (whether the person
 * has been told, so which copy of a week they read).
 *
 * NAMES, by the names rule for the person looking (`nameForViewer`): the
 * committee and admins see "Priya Shah (Pri)", a lead who is not on the
 * committee the name people go by. Every row is named off its account; the
 * name on a place's record stands in only where the account has gone.
 */

type Gate =
  | { status: "none" }
  | { status: "not-yours" }
  | { status: "blank"; view: ProgrammeRunView }
  | { status: "ok"; view: ProgrammeRunView; run: CourseRunDoc; form: ApplicationForm; viewer: CourseworkViewer };

async function openCoursework(db: Firestore, actor: SessionUser, roundId: string, programmeId: string): Promise<Gate> {
  const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (outcome.status !== "ok") return outcome;
  const { view } = outcome;
  if (!view.run) return { status: "blank", view };
  const [runSnap, form] = await Promise.all([db.collection("courseRuns").doc(view.run.id).get(), loadForm(db, view.roundId)]);
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true || !form) return { status: "blank", view: { ...view, blank: "run-gone" } };
  return { status: "ok", view, run: normalizeCourseRun(runSnap.id, runSnap.data() ?? {}), form, viewer: view.viewer };
}

/** A seat that places somebody in one of the run's live groups, active or finished. */
function placedIn(seat: CourseEnrolmentDoc | undefined | null, groups: readonly CourseGroupDoc[]): seat is CourseEnrolmentDoc & { groupId: string } {
  return (
    !!seat &&
    seat.role === "learner" &&
    (seat.status === "active" || seat.status === "completed") &&
    seat.groupId !== null &&
    groups.some((group) => group.id === seat.groupId)
  );
}

/**
 * Each person a row, with the group this viewer is shown them in and the
 * group whose weeks they read: the facilitators of the run's live groups
 * first, then everybody holding a place who facilitates none, then anybody
 * else placed in one of the run's live groups (a seat an admin made on the
 * run itself, with no place on the form behind it), who is taking part all
 * the same and whose coursework the group's pages already show.
 */
function peopleOf(input: {
  viewer: CourseworkViewer;
  groups: readonly CourseGroupDoc[];
  holders: readonly PlaceHolder[];
  seats: ReadonlyMap<string, CourseEnrolmentDoc>;
  /** Names on accounts, by the names rule for the viewer: everybody whose account is there. */
  names: ReadonlyMap<string, string>;
}): CourseworkPerson[] {
  const people: CourseworkPerson[] = [];
  const seen = new Set<string>();
  for (const group of input.groups) {
    for (const uid of group.facilitatorUids) {
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const name = input.names.get(uid) ?? input.holders.find((holder) => holder.uid === uid)?.name ?? "NAISI member";
      people.push({ uid, name, facilitating: true, groupId: group.id, readsGroupId: group.id, notToldYet: false });
    }
  }
  const fellow = (uid: string, name: string, seat: CourseEnrolmentDoc | undefined) => {
    const placed = placedIn(seat, input.groups) ? seat : null;
    // Which group the row sits in, to this viewer: an admin sees every placement, the lead only a told one.
    const shown = placed !== null && placementIsShownTo(placed, { isAdmin: input.viewer === "admin" });
    // Whether Publish has told them: they read their group's copy of a week only then.
    const told = placed !== null && placementIsShownTo(placed, { isAdmin: false });
    people.push({
      uid,
      name,
      facilitating: false,
      groupId: shown && placed ? placed.groupId : null,
      readsGroupId: told && placed ? placed.groupId : null,
      notToldYet: shown && !told,
    });
  };
  for (const holder of input.holders) {
    if (seen.has(holder.uid)) continue;
    seen.add(holder.uid);
    // The name on their place's record stands in only for an account that has gone.
    fellow(holder.uid, input.names.get(holder.uid) ?? holder.name, input.seats.get(holder.uid));
  }
  for (const [uid, seat] of input.seats) {
    if (seen.has(uid) || !placedIn(seat, input.groups)) continue;
    seen.add(uid);
    fellow(uid, input.names.get(uid) ?? "NAISI member", seat);
  }
  return people;
}

/** The people `peopleOf` names from their accounts: facilitators, everybody holding a place, and anybody placed with no place on the form. */
function accountsToName(groups: readonly CourseGroupDoc[], holders: readonly PlaceHolder[], seats: ReadonlyMap<string, CourseEnrolmentDoc>): string[] {
  const holding = new Set(holders.map((holder) => holder.uid));
  return [
    ...groups.flatMap((group) => group.facilitatorUids),
    ...holders.map((holder) => holder.uid),
    ...[...seats.entries()].filter(([uid, seat]) => !holding.has(uid) && placedIn(seat, groups)).map(([uid]) => uid),
  ];
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export type CourseworkTabView = {
  roundId: string;
  programmeId: string;
  programmeName: string;
  viewer: CourseworkViewer;
  columns: Array<{ weekNumber: number; title: string }>;
  /** The run's live groups, for the filter, in the one order every tab lists them. */
  groups: Array<{ id: string; name: string }>;
  filter: CourseworkFilter;
  sections: CourseworkSection[];
  counts: { holding: number; facilitating: number; waiting: number };
  /** The lead's first name, for the line about who opens the tab; null with no lead. */
  leadFirstName: string | null;
  /** Every row's name by account, whatever the filter: the panels under the table name people by it. */
  names: Record<string, string>;
};

export type CourseworkTabOutcome =
  | { status: "none" }
  | { status: "not-yours" }
  | { status: "blank"; view: ProgrammeRunView }
  | { status: "ok"; view: CourseworkTabView };

/** The programme's pages, written out from ids, never from stored text. */
function programmePathOf(view: ProgrammeRunView): string {
  return `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;
}

/** The review page for one person's answer in one week, where feedback on it is written: a person in a group this viewer sees, or a facilitator's own. */
function writtenHrefOf(programmePath: string, person: Pick<CourseworkPerson, "uid" | "groupId">, weekNumber: number): string | null {
  if (!person.groupId) return null;
  return `${programmePath}/written?group=${encodeURIComponent(person.groupId)}&week=${weekNumber}&person=${encodeURIComponent(person.uid)}`;
}

export async function loadCourseworkTab(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  query: { group?: unknown; waiting?: unknown; notdone?: unknown },
): Promise<CourseworkTabOutcome> {
  const gate = await openCoursework(db, actor, roundId, programmeId);
  if (gate.status !== "ok") return gate;
  const { view, run, form, viewer } = gate;

  const [holders, groups, seatSnap, runWeeks, programme] = await Promise.all([
    listPlaceHolders(db, form, view.programmeId),
    liveGroupsOf(db, run.id),
    // One equality on one field: the run's seats.
    db.collection("courseEnrolments").where("runId", "==", run.id).get(),
    weeksRead(db, run.id, null),
    runProgrammeOf(db, run.id),
  ]);
  const seats = new Map<string, CourseEnrolmentDoc>();
  for (const doc of seatSnap.docs) {
    const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (seat.runId === run.id && seat.uid) seats.set(seat.uid, seat);
  }
  const [groupWeeks, names, coursework] = await Promise.all([
    Promise.all(groups.map(async (group) => [group.id, await weeksRead(db, run.id, group.id)] as const)),
    namesOf(db, accountsToName(groups, holders, seats), actor),
    readRunCoursework(db, { run, liveGroups: groups, now: new Date() }, null),
  ]);
  const weeksOf = new Map(groupWeeks);
  const columns = columnsOf(run, runWeeks);
  const people = peopleOf({ viewer, groups, holders, seats, names });
  const weekOf = (groupId: string | null, weekNumber: number) =>
    groupId ? (weeksOf.get(groupId)?.get(weekNumber) ?? null) : (runWeeks.get(weekNumber) ?? null);
  // Each person's pack in the Choose ones the weeks they read count, by id: a
  // week with a pathway is done only once its pack's reading is ticked.
  const packRecords = await readPackCaseRecords(
    db,
    run.id,
    people.flatMap((person) =>
      columns.flatMap((column) => chooseOneIdsOf(weekOf(person.readsGroupId, column.weekNumber)).map((blockId) => ({ uid: person.uid, blockId }))),
    ),
  );
  const packs = new Map<string, Map<string, string>>();
  for (const record of packRecords.values()) {
    if (!record.packId) continue;
    const own = packs.get(record.uid) ?? new Map<string, string>();
    own.set(record.blockId, record.packId);
    packs.set(record.uid, own);
  }
  // The last week that has begun on each group's calendar (the run's own for
  // somebody in no group), for which weeks a row is not done in.
  const now = new Date();
  const reached = new Map<string | null, number>();
  const reachedOf = (groupId: string | null) => {
    if (!reached.has(groupId)) {
      const group = groupId ? (groups.find((candidate) => candidate.id === groupId) ?? null) : null;
      reached.set(groupId, resolveGroupCalendar(run, group, now).currentWeek?.anchorWeekNumber ?? 0);
    }
    return reached.get(groupId) ?? 0;
  };
  const programmePath = programmePathOf(view);
  const groupList = groups.map((group) => ({ id: group.id, name: group.name.trim() || "Untitled group" }));
  const filter = readFilter(query, groupList.map((group) => group.id));
  const build = (wanted: CourseworkFilter) =>
    courseworkSections({
      columns,
      groups: groupList,
      people,
      workOf: (uid) => ({ ...(coursework.work.get(uid) ?? NO_WORK), packs: packs.get(uid) ?? new Map() }),
      weekOf,
      personHref: (uid) => `${programmePath}/coursework/${encodeURIComponent(uid)}`,
      writtenHref: (person, weekNumber) => writtenHrefOf(programmePath, person, weekNumber),
      standingOf: (uid, weekNumber) => ({ submittedAt: coursework.states.submittedOf(uid, weekNumber), due: coursework.states.dueOf(uid, weekNumber) }),
      reachedOf: (person) => reachedOf(person.readsGroupId),
      filter: wanted,
      notInAGroupTitle: NOT_IN_A_GROUP_YET,
    });
  const everybody = build({ group: "all", waiting: false, notDone: false }).flatMap((section) => section.rows);
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
      sections: build(filter),
      counts: {
        holding: people.filter((person) => !person.facilitating).length,
        facilitating: people.filter((person) => person.facilitating).length,
        waiting: everybody.filter((row) => row.waiting).length,
      },
      leadFirstName: programme?.leadFirstName ?? null,
      names: Object.fromEntries(everybody.map((row) => [row.uid, row.name])),
    },
  };
}

// ---------------------------------------------------------------------------
// One person's week: the reading view's programme door
// ---------------------------------------------------------------------------

export type PersonCourseworkView = PersonWeekView & {
  roundId: string;
  programmeId: string;
};

/** A person's page on a run with no week to read: who they are, and what the column beside them needs. */
export type NoWeeksView = {
  roundId: string;
  programmeId: string;
  runId: string;
  viewer: CourseworkViewer;
  self: boolean;
  programmeName: string;
  person: { uid: string; name: string; groupName: string | null; facilitating: boolean; notToldYet: boolean };
  crumb: { label: string; href: string };
};

export type PersonCourseworkOutcome =
  | { status: "none" }
  | { status: "not-yours" }
  | { status: "blank"; view: ProgrammeRunView }
  /** The person holds no place on the programme and facilitates none of its run's groups. */
  | { status: "not-here"; programmeName: string }
  /**
   * None of the run's weeks is written as blocks: no week to read. The page
   * still names the person and carries the column of what the team keeps
   * about them, as it always did.
   */
  | { status: "no-weeks"; view: NoWeeksView }
  | { status: "ok"; view: PersonCourseworkView };

/**
 * ONE PERSON'S WEEK ON THE PROGRAMME'S SIDE (the reading view, at
 * `.../coursework/[uid]?week=N`): the same gate as ever (`openCoursework`:
 * an admin or the programme's lead), then the person must be a row of the
 * Coursework tab (a place on the form, a group of the run facilitated, or a
 * seat in one of its live groups), or the page says calmly that they are
 * not. Previous and next are the people of the same section of the tab, in
 * its order. Everything about the week is read by the one loader both doors
 * share (`readPersonWeek`), behind the readers every page asks.
 */
export async function loadPersonCoursework(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  uid: string,
  askedWeek: unknown = null,
): Promise<PersonCourseworkOutcome> {
  const gate = await openCoursework(db, actor, roundId, programmeId);
  if (gate.status !== "ok") return gate;
  const { view, run, form, viewer } = gate;

  const [holders, groups, seatSnap, facts] = await Promise.all([
    listPlaceHolders(db, form, view.programmeId),
    liveGroupsOf(db, run.id),
    // One equality on one field: the run's seats, for the people of the person's section.
    db.collection("courseEnrolments").where("runId", "==", run.id).get(),
    reviewerFactsOf(db, actor, run.id),
  ]);
  const enrolments = seatSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
  const seats = new Map<string, CourseEnrolmentDoc>();
  for (const seat of enrolments) if (seat.runId === run.id && seat.uid) seats.set(seat.uid, seat);
  const facilitates = groups.some((group) => group.facilitatorUids.includes(uid));
  const holder = holders.find((candidate) => candidate.uid === uid) ?? null;
  // A row of the tab, or nobody's page: a place on the form, a group facilitated, or a seat in a live group.
  if (!facilitates && !holder && !placedIn(seats.get(uid), groups)) return { status: "not-here", programmeName: view.programmeName };

  const names = await namesOf(db, accountsToName(groups, holders, seats), actor);
  const people = peopleOf({ viewer, groups, holders, seats, names });
  const person = people.find((candidate) => candidate.uid === uid);
  if (!person) return { status: "not-here", programmeName: view.programmeName };

  const programmePath = programmePathOf(view);
  const tab = { label: BACK_TO_COURSEWORK, href: `${programmePath}/coursework` };
  const group = person.groupId ? (groups.find((candidate) => candidate.id === person.groupId) ?? null) : null;
  const programme = await runProgrammeOf(db, run.id);
  const read = await readPersonWeek(db, actor, {
    door: "programme",
    run,
    liveGroups: groups,
    facts,
    viewer,
    person,
    // The people of the same section of the tab: one group, or everybody in no group yet.
    people: people.filter((candidate) => candidate.groupId === person.groupId),
    askedWeek,
    programmeName: programme?.shortName || view.programmeName,
    base: `${programmePath}/coursework`,
    enrolments,
    // The programme's review page for the person's group: the lead's and admins', as this page is. None for somebody in no group.
    reviewHref: (weekNumber) => writtenHrefOf(programmePath, person, weekNumber),
    back: group ? { label: group.name.trim() || "Untitled group", href: `${programmePath}/groups/${encodeURIComponent(group.id)}` } : tab,
    crumb: tab,
  });
  if (!read) {
    return {
      status: "no-weeks",
      view: {
        roundId: view.roundId,
        programmeId: view.programmeId,
        runId: run.id,
        viewer,
        self: actor.uid === uid,
        programmeName: programme?.shortName || view.programmeName,
        person: {
          uid,
          name: person.name,
          groupName: group ? group.name.trim() || "Untitled group" : null,
          facilitating: person.facilitating,
          notToldYet: person.notToldYet,
        },
        crumb: tab,
      },
    };
  }
  return { status: "ok", view: { ...read, roundId: view.roundId, programmeId: view.programmeId } };
}
