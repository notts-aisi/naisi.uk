import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { PlaceHolder } from "@/lib/applications/handover/holders";
import { loadProgrammeRun, type ProgrammeRunView } from "@/lib/applications/handover/programmeRun";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { listPlaceHolders } from "@/lib/applications/people/load";
import { loadForm } from "@/lib/applications/repo";
import { readPersonPrivateNotes, readRunCoursework } from "@/lib/courses/facilitatorWeek/readers";
import { boxesReaderFor } from "@/lib/courses/fillInBoxes/access";
import { fullNameOfUser } from "@/lib/courses/programmeLead";
import { resolveWeekDocs } from "@/lib/courses/groupResolve";
import { liveGroupsOf } from "@/lib/courses/writtenAnswers/access";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  NO_WORK,
  courseworkSections,
  courseworkWeekOf,
  personWeeks,
  readFilter,
  type CourseworkFilter,
  type CourseworkPerson,
  type CourseworkSection,
  type CourseworkViewer,
  type CourseworkWeek,
  type PersonWeek,
} from "./model";
import { NOT_IN_A_GROUP_YET } from "./words";

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
 * every reflection, box, written answer and tick on the run
 * (`readRunCoursework`, one equality on the run per store, words only for the
 * one person whose page is drawn); and the names of the facilitators and of
 * whoever gave feedback. A private note is read only on a person's page and
 * only for an admin (`readPersonPrivateNotes`); a person's boxes only once
 * their gate has answered (`boxesReaderFor`). Survey answers never. Nothing
 * is written.
 *
 * A PLACEMENT is shown to this viewer only where `placementIsShownTo` says
 * so: an admin sees every one, the lead only those Publish has told. The
 * question is asked twice per seat, once about the viewer (which group the
 * row sits in) and once about a viewer who is no admin (whether the person
 * has been told, so which copy of a week they read).
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

/** Whole names on accounts, by uid, as the lead's tabs name people. */
async function namesOf(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const docs = await db.getAll(...unique.map((uid) => db.collection("users").doc(uid)));
  return new Map(docs.filter((doc) => doc.exists).map((doc) => [doc.id, fullNameOfUser(doc.data() ?? {})] as const));
}

/** The weeks of the run's plan written as blocks, week 1 first: the tab's columns. */
function columnsOf(run: CourseRunDoc, runWeeks: ReadonlyMap<number, CourseworkWeek | null>): Array<{ weekNumber: number; title: string }> {
  return run.weekPlan
    .flatMap((entry) => (entry.kind === "week" ? [entry.weekNumber] : []))
    .filter((weekNumber, index, all) => all.indexOf(weekNumber) === index)
    .sort((a, b) => a - b)
    .flatMap((weekNumber) => {
      const week = runWeeks.get(weekNumber);
      return week ? [{ weekNumber, title: week.title }] : [];
    });
}

/** Every week a group reads (its own copy over the run's), or the run's own for `null`, by week number. */
async function weeksRead(db: Firestore, runId: string, groupId: string | null): Promise<Map<number, CourseworkWeek | null>> {
  const entries = await resolveWeekDocs(db, runId, groupId);
  return new Map(entries.map((entry) => [entry.week.weekNumber, courseworkWeekOf(entry.week)] as const));
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
  /** Names on accounts, for facilitators and for anybody placed with no place on the form. */
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
    fellow(holder.uid, holder.name, input.seats.get(holder.uid));
  }
  for (const [uid, seat] of input.seats) {
    if (seen.has(uid) || !placedIn(seat, input.groups)) continue;
    seen.add(uid);
    fellow(uid, input.names.get(uid) ?? "NAISI member", seat);
  }
  return people;
}

/** The people `peopleOf` names from their accounts: facilitators, and anybody placed with no place on the form. */
function accountsToName(groups: readonly CourseGroupDoc[], holders: readonly PlaceHolder[], seats: ReadonlyMap<string, CourseEnrolmentDoc>): string[] {
  const holding = new Set(holders.map((holder) => holder.uid));
  return [
    ...groups.flatMap((group) => group.facilitatorUids),
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

/** The feedback page for one person's answer in one week: a person in a group this viewer sees, or a facilitator's own. */
function writtenHrefOf(programmePath: string, person: Pick<CourseworkPerson, "uid" | "groupId">, weekNumber: number): string | null {
  if (!person.groupId) return null;
  return `${programmePath}/written?group=${encodeURIComponent(person.groupId)}&week=${weekNumber}&person=${encodeURIComponent(person.uid)}`;
}

export async function loadCourseworkTab(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  query: { group?: unknown; waiting?: unknown },
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
    namesOf(db, accountsToName(groups, holders, seats)),
    readRunCoursework(db, { run, liveGroups: groups, now: new Date() }, null),
  ]);
  const weeksOf = new Map(groupWeeks);
  const columns = columnsOf(run, runWeeks);
  const people = peopleOf({ viewer, groups, holders, seats, names });
  const programmePath = programmePathOf(view);
  const groupList = groups.map((group) => ({ id: group.id, name: group.name.trim() || "Untitled group" }));
  const filter = readFilter(query, groupList.map((group) => group.id));
  const build = (wanted: CourseworkFilter) =>
    courseworkSections({
      columns,
      groups: groupList,
      people,
      workOf: (uid) => coursework.work.get(uid) ?? NO_WORK,
      weekOf: (groupId, weekNumber) => (groupId ? (weeksOf.get(groupId)?.get(weekNumber) ?? null) : (runWeeks.get(weekNumber) ?? null)),
      personHref: (uid) => `${programmePath}/coursework/${encodeURIComponent(uid)}`,
      writtenHref: (person, weekNumber) => writtenHrefOf(programmePath, person, weekNumber),
      filter: wanted,
      notInAGroupTitle: NOT_IN_A_GROUP_YET,
    });
  const everybody = build({ group: "all", waiting: false }).flatMap((section) => section.rows);
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
// One person's page
// ---------------------------------------------------------------------------

export type PersonCourseworkView = {
  roundId: string;
  programmeId: string;
  programmeName: string;
  /** The programme's course run: an admin's notes about the person are written from it. */
  runId: string;
  viewer: CourseworkViewer;
  person: {
    uid: string;
    name: string;
    facilitating: boolean;
    /** Their group, where this viewer may see it; null: not in a group yet. */
    groupName: string | null;
    notToldYet: boolean;
  };
  /** Newest week first. */
  weeks: PersonWeek[];
  /** Whether private notes were read for this viewer: admins only. */
  notesShown: boolean;
};

export type PersonCourseworkOutcome =
  | { status: "none" }
  | { status: "not-yours" }
  | { status: "blank"; view: ProgrammeRunView }
  /** The person holds no place on the programme and facilitates none of its run's groups. */
  | { status: "not-here"; programmeName: string }
  | { status: "ok"; view: PersonCourseworkView };

export async function loadPersonCoursework(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  uid: string,
): Promise<PersonCourseworkOutcome> {
  const gate = await openCoursework(db, actor, roundId, programmeId);
  if (gate.status !== "ok") return gate;
  const { view, run, form, viewer } = gate;

  const [holders, groups, seatSnap, runWeeks] = await Promise.all([
    listPlaceHolders(db, form, view.programmeId),
    liveGroupsOf(db, run.id),
    // Their own seat on the run, by its address.
    db.collection("courseEnrolments").doc(courseEnrolmentId(run.id, uid)).get(),
    weeksRead(db, run.id, null),
  ]);
  const facilitates = groups.some((group) => group.facilitatorUids.includes(uid));
  const holder = holders.find((candidate) => candidate.uid === uid) ?? null;
  const seat = seatSnap.exists ? normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {}) : null;
  const seats = new Map<string, CourseEnrolmentDoc>(seat && seat.uid === uid && seat.runId === run.id ? [[uid, seat]] : []);
  // A row of the tab, or nobody's page: a place on the form, a group facilitated, or a seat in a live group.
  if (!facilitates && !holder && !placedIn(seats.get(uid), groups)) return { status: "not-here", programmeName: view.programmeName };

  const mine = groups.filter((group) => !facilitates || group.facilitatorUids.includes(uid));
  const holding = holder ? [holder] : [];
  const names = await namesOf(db, accountsToName(mine, holding, seats).filter((candidate) => candidate === uid));
  const [person] = peopleOf({ viewer, groups: mine, holders: holding, seats, names }).filter((candidate) => candidate.uid === uid);
  if (!person) return { status: "not-here", programmeName: view.programmeName };

  const weeks = person.readsGroupId ? await weeksRead(db, run.id, person.readsGroupId) : runWeeks;
  const columns = columnsOf(run, runWeeks);
  const weekOf = (weekNumber: number) => weeks.get(weekNumber) ?? null;
  const [coursework, boxesReader, notes] = await Promise.all([
    readRunCoursework(db, { run, liveGroups: groups, now: new Date() }, uid),
    boxesReaderFor(db, actor, run.id, uid),
    readPersonPrivateNotes(
      db,
      run.id,
      viewer,
      { uid, name: person.name, firstName: person.name, own: person.facilitating },
      columns.map((column) => ({ weekNumber: column.weekNumber, sourceIds: new Set((weekOf(column.weekNumber)?.sources ?? []).map((source) => source.id)) })),
    ),
  ]);
  const feedbackNames = await namesOf(
    db,
    [...coursework.writes.answers.values()].flatMap((answer) => (answer.feedback?.byUid ? [answer.feedback.byUid] : [])),
  );
  const programmePath = programmePathOf(view);
  const group = person.groupId ? (groups.find((candidate) => candidate.id === person.groupId) ?? null) : null;
  return {
    status: "ok",
    view: {
      roundId: view.roundId,
      programmeId: view.programmeId,
      programmeName: view.programmeName,
      runId: run.id,
      viewer,
      person: {
        uid,
        name: person.name,
        facilitating: person.facilitating,
        groupName: group ? group.name.trim() || "Untitled group" : null,
        notToldYet: person.notToldYet,
      },
      weeks: personWeeks({
        columns,
        weekOf,
        writes: coursework.writes,
        boxesRead: boxesReader !== null,
        notes,
        nameOf: (byUid) => feedbackNames.get(byUid) ?? null,
        writtenHref: (weekNumber) => writtenHrefOf(programmePath, person, weekNumber),
      }),
      notesShown: notes !== null,
    },
  };
}
