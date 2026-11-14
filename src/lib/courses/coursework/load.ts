import "server-only";
import { copiesOf } from "@/lib/courses/weekCopy";
import type { Firestore } from "firebase-admin/firestore";
import type { PlaceHolder } from "@/lib/applications/handover/holders";
import { loadProgrammeRun, type ProgrammeRunView } from "@/lib/applications/handover/programmeRun";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { listPlaceHolders } from "@/lib/applications/people/load";
import { loadForm } from "@/lib/applications/repo";
import { liveGroupsOf, reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseEnrolment, placementIsShownTo, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import type { CourseworkPerson, CourseworkViewer } from "./model";
import { personAnchorId, questionHref } from "./question";
import { readPersonWeek, type PersonWeekView } from "./readingLoad";
import { namesOf } from "./reads";
import { BACK_TO_COURSEWORK } from "./words";

/**
 * A PROGRAMME'S COURSEWORK, READ (Zach, Fri 30 Oct): the gate and the rows
 * the Coursework tab and one person's page share, and one person's page, on
 * the server, for the programme's lead and admins. `./model.ts` says who is a
 * row, which week each reads and what a cell says; the tab itself is read by
 * `./tabLoad.ts`, with this file's gate and rows.
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

export type Gate =
  | { status: "none" }
  | { status: "not-yours" }
  | { status: "blank"; view: ProgrammeRunView }
  | { status: "ok"; view: ProgrammeRunView; run: CourseRunDoc; form: ApplicationForm; viewer: CourseworkViewer };

export async function openCoursework(db: Firestore, actor: SessionUser, roundId: string, programmeId: string): Promise<Gate> {
  const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (outcome.status !== "ok") return outcome;
  const { view } = outcome;
  if (!view.run) return { status: "blank", view };
  const [runSnap, form] = await Promise.all([db.collection("courseRuns").doc(view.run.id).get(), loadForm(db, view.roundId)]);
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true || !form) return { status: "blank", view: { ...view, blank: "run-gone" } };
  return { status: "ok", view, run: normalizeCourseRun(runSnap.id, runSnap.data() ?? {}), form, viewer: view.viewer };
}

/**
 * The run's seats (one equality on the run), every one as read, and by uid
 * the seats on this run: the rows of the tab and a person's page are made
 * from them by `peopleOf`, which asks of each placement whether it may be
 * shown to the caller.
 */
export async function readRunSeats(db: Firestore, runId: string): Promise<{ enrolments: CourseEnrolmentDoc[]; seats: Map<string, CourseEnrolmentDoc> }> {
  const snap = await db.collection("courseEnrolments").where("runId", "==", runId).get();
  const enrolments = snap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
  const seats = new Map<string, CourseEnrolmentDoc>();
  for (const seat of enrolments) if (seat.runId === runId && seat.uid) seats.set(seat.uid, seat);
  return { enrolments, seats };
}

/** A seat that places somebody in one of the run's live groups, active or finished. */
export function placedIn(seat: CourseEnrolmentDoc | undefined | null, groups: readonly CourseGroupDoc[]): seat is CourseEnrolmentDoc & { groupId: string } {
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
export function peopleOf(input: {
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
      // Somebody moved mid-term is read, week by week, on the copy they saw.
      readsCopies: told && placed ? copiesOf(placed, input.groups) : null,
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
export function accountsToName(groups: readonly CourseGroupDoc[], holders: readonly PlaceHolder[], seats: ReadonlyMap<string, CourseEnrolmentDoc>): string[] {
  const holding = new Set(holders.map((holder) => holder.uid));
  return [
    ...groups.flatMap((group) => group.facilitatorUids),
    ...holders.map((holder) => holder.uid),
    ...[...seats.entries()].filter(([uid, seat]) => !holding.has(uid) && placedIn(seat, groups)).map(([uid]) => uid),
  ];
}

/** The programme's pages, written out from ids, never from stored text. */
export function programmePathOf(view: Pick<ProgrammeRunView, "roundId" | "programmeId">): string {
  return `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;
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

  const [holders, groups, { enrolments, seats }, facts] = await Promise.all([
    listPlaceHolders(db, form, view.programmeId),
    liveGroupsOf(db, run.id),
    // One equality on one field: the run's seats, for the people of the person's section.
    readRunSeats(db, run.id),
    reviewerFactsOf(db, actor, run.id),
  ]);
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
    // One question across the person's group, on the same week, landing on them. None for somebody in no group.
    questionHref: (weekNumber) =>
      person.groupId
        ? `${questionHref(`${programmePath}/question?group=${encodeURIComponent(person.groupId)}`, { weekNumber, questionId: null })}#${personAnchorId(uid)}`
        : null,
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
