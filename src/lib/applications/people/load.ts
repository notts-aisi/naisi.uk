import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { groupTagOf } from "@/lib/courses/programmeAttendance";
import type { SessionUser } from "@/lib/firebase/session";
import { enrolmentHasLeft, normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { canReadApplication, opensProgrammeGroups, roleOnProgramme } from "../access";
import { isInTerm } from "../decisions";
import { isTimed } from "../freedPlaces/groups";
import { placeHoldersOn } from "../handover/holders";
import { RUNS_COLLECTION, readRun } from "../handover/run";
import { own } from "../keys";
import type { ApplicationForm } from "../normalise";
import { isId } from "../normalise";
import { loadForm } from "../repo";
import { listDecisions, listSentApplications } from "../staffRepo";
import { programmePeople, type PeopleGroup, type PeopleSeat } from "./model";
import type { PeopleView } from "./views";
import { placesSentence } from "./words";

/**
 * A PROGRAMME'S PEOPLE TAB, READ (board st-people), and the count beside the
 * tab.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`opensProgrammeGroups`), decided
 * from the form's own settings before anybody is read. A reviewer is answered
 * `not-yours` and anybody with no role on the programme as for a programme
 * that is not there, both before any application, decision or run is read.
 *
 * NOBODY IS READ UNTIL DECISIONS HAVE BEEN SENT. Who holds a place is a
 * person's to be told on decision day: before the term is marked as sent the
 * tab says so and lists nobody. After it, everybody who holds a place is
 * counted, an admin who applied included, exactly as the hand-over and the
 * times picture count them, so the tab's 30 is theirs.
 *
 * WHAT IS READ: the form; every sent application on it and every decision;
 * the run the programme names, its groups and each seat on it (one equality
 * on one field each, so no declared index). The rows are built field by
 * field in `./model.ts`: names, degree lines, groups, replies with their
 * days, fit marks and where each place stands, and for somebody who gave a
 * place back the reason and the day. No address, no access requirement, no
 * painted week, no answer and no reason somebody gave for leaving the run
 * leaves this module.
 *
 * WHAT IS WRITTEN: nothing.
 */

export type PeopleOutcome =
  | { status: "ok"; view: PeopleView }
  /** No form here, no such programme on it, or no role on it. */
  | { status: "none" }
  /** A role on the programme that is neither an admin's nor its lead's. Only the form was read. */
  | { status: "not-yours" };

const GROUPS_COLLECTION = "courseGroups";

/** The run's live groups in the board's order, each with its letter and, if it has one, its weekly session. */
async function groupsOf(db: Firestore, runId: string): Promise<PeopleGroup[]> {
  const snap = await db.collection(GROUPS_COLLECTION).where("runId", "==", runId).get();
  return snap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived && group.runId === runId)
    .sort(compareGroupsByMeeting)
    .map((group) => {
      const name = group.name.trim() || "Untitled group";
      return {
        id: group.id,
        name,
        tag: groupTagOf(name),
        // The weekly slot and nothing else: no room and no meeting link. A
        // group with no day and time yet has no session to make or miss, as
        // "Fits none of the 4 times" counts on the freed places page.
        session: isTimed(group, runId)
          ? {
              weekday: group.session.weekday,
              startTimeLocal: group.session.startTimeLocal,
              durationMinutes: group.session.durationMinutes,
            }
          : null,
      };
    });
}

/**
 * Each learner's seat on the run, by uid: its group, and whether it has left
 * the run. Every seat, told or not: the programme's lead and admins place
 * people, and see where they put them before Publish tells anybody, as the
 * allocation board shows them. Nobody else reaches this.
 */
async function seatsOf(db: Firestore, runId: string): Promise<Map<string, PeopleSeat>> {
  const snap = await db.collection("courseEnrolments").where("runId", "==", runId).get();
  const seats = new Map<string, PeopleSeat>();
  for (const doc of snap.docs) {
    const seat = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (seat.runId !== runId || seat.role !== "learner" || !seat.uid) continue;
    // The day somebody left the run, and nothing they said: a leaver's reason
    // is read out on the programme's Overview, its one reader.
    seats.set(seat.uid, { groupId: seat.groupId, left: enrolmentHasLeft(seat.status) ? { at: seat.droppedOutAt } : null });
  }
  return seats;
}

export async function loadProgrammePeople(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<PeopleOutcome> {
  if (!isId(roundId) || !isId(programmeId)) return { status: "none" };
  const form = await loadForm(db, roundId);
  if (!form) return { status: "none" };
  const programme = own(form.programmes, programmeId);
  if (!programme) return { status: "none" };
  // Who leads it, from the form's settings, asked at the point of use.
  const role = roleOnProgramme(actor, form, programmeId);
  if (role === null) return { status: "none" };
  if (!opensProgrammeGroups(role)) return { status: "not-yours" };

  const view: PeopleView = {
    roundId: form.round.id,
    programmeId: programme.id,
    programmeName: programme.shortName.trim() || programme.name.trim(),
    viewer: role === "admin" ? "admin" : "lead",
    blank: "not-sent",
    sentence: placesSentence(0, 0),
    counts: { everyone: 0, coming: 0, "havent-said": 0, "not-said-free": 0, "gave-back": 0, invited: 0 },
    rows: [],
  };
  // Nobody is listed, or counted, until everybody has been told.
  if (form.decisionsSentAt === null) return { status: "ok", view };

  const runSnap = programme.runId ? await db.collection(RUNS_COLLECTION).doc(programme.runId).get() : null;
  const read = runSnap?.exists ? readRun(runSnap.id, runSnap.data()) : null;
  // A run being destroyed is no run to read groups or seats from.
  const runId = read && !read.destroying ? read.run.id : null;
  const [applications, decisions, groups, seats] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    runId ? groupsOf(db, runId) : Promise.resolve<PeopleGroup[]>([]),
    runId ? seatsOf(db, runId) : Promise.resolve(new Map<string, PeopleSeat>()),
  ]);

  const programmePath = `/admin/admissions/forms/${encodeURIComponent(form.round.id)}/programmes/${encodeURIComponent(programme.id)}`;
  const model = programmePeople({
    form,
    programmeId: programme.id,
    applications,
    decisions,
    viewer: {
      uid: actor.uid,
      // The review screens' own rule for who may open one application.
      canRead: (ranked, joined) => canReadApplication(actor, form, ranked, joined),
    },
    groups,
    seats,
    programmePath,
    runNamed: runId !== null,
  });
  return { status: "ok", view: { ...view, blank: null, sentence: model.sentence, counts: model.counts, rows: model.rows } };
}

/**
 * How many people hold a place on the programme now: the number beside the
 * People tab. The same `holdsPlaceOn` the tab's own rows ask, over the people
 * in the term, so the tab's number is the number of rows it says hold a
 * place. Null until decisions have been sent, when nobody holds one yet.
 */
export async function countPlaceHolders(
  db: Firestore,
  form: ApplicationForm,
  programmeId: string,
): Promise<number | null> {
  if (form.decisionsSentAt === null) return null;
  const [applications, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  // Counted from the people in the term, like every other count of places.
  return placeHoldersOn(form, programmeId, applications.filter(isInTerm), decisions).length;
}
