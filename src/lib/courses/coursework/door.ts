import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isInTerm } from "@/lib/applications/decisions";
import { placeHoldersOn, type PlaceHolder } from "@/lib/applications/handover/holders";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadForm } from "@/lib/applications/repo";
import { readRunLead } from "@/lib/courses/programmeLead";
import { COURSE_EXPLAINERS_COLLECTION } from "@/lib/firestore/courseExplainers";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { listDecisions, listSentApplications } from "@/lib/applications/staffRepo";
import type { SessionUser } from "@/lib/firebase/session";
import { loadAccountNames, loadRunPeople, loadRunWeeks, type RunPeople } from "./gather";
import type { CourseworkWeek, RunPerson } from "./input";
import { COURSEWORK_DOOR_WORDS } from "./claudeWords";

/**
 * THE DOOR TO A PROGRAMME'S COURSEWORK FOR CLAUDE AND PANGRAM: the same door
 * as the programme's Coursework tab. Decided from the form before the run is
 * read (`loadProgrammeRun`): an admin or the programme's lead; a reviewer is
 * told it is theirs; anybody with no role on the programme, or no programme,
 * is answered as a programme that is not there. Pangram's routes then turn
 * the lead away too (`adminOnly`).
 *
 * Behind it: who holds a place on the programme now (`placeHoldersOn`, the
 * People tab's set), the run's live groups and facilitators, and the run's
 * weeks with coursework.
 */

export type DoorRefusal = { ok: false; status: number; error: string };

export type CourseworkDoor = {
  ok: true;
  viewer: "admin" | "lead";
  runId: string;
  programmeName: string;
  /** Everybody holding a place on the programme now, by name. */
  holders: PlaceHolder[];
  people: RunPeople;
  weeks: CourseworkWeek[];
};

/** A run before decision day, as far as coursework goes: nobody. */
const NOBODY: RunPeople = { facilitatorsOf: new Map(), facilitators: new Set(), groupOf: new Map() };

export async function openCourseworkDoor(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  options: { adminOnly?: string } = {},
): Promise<CourseworkDoor | DoorRefusal> {
  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return { ok: false, status: 404, error: COURSEWORK_DOOR_WORDS.notHere };
  if (outcome.status === "not-yours") return { ok: false, status: 403, error: COURSEWORK_DOOR_WORDS.notYours };
  const { view } = outcome;
  if (options.adminOnly && view.viewer !== "admin") return { ok: false, status: 403, error: options.adminOnly };
  if (!view.run) return { ok: false, status: 409, error: COURSEWORK_DOOR_WORDS.noRun };
  const runId = view.run.id;

  const form = await loadForm(db, roundId);
  if (!form) return { ok: false, status: 404, error: COURSEWORK_DOOR_WORDS.notHere };
  // Nobody holds a place until decision day, and a list of everybody read
  // before it could tell the person looking where their own application
  // stands: so nothing is read until the term is marked as sent.
  if (form.decisionsSentAt === null) return { ok: true, viewer: view.viewer, runId, programmeName: view.programmeName, holders: [], people: NOBODY, weeks: [] };
  const [applications, decisions, people] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    loadRunPeople(db, runId),
  ]);
  const holders = placeHoldersOn(form, programmeId, applications.filter(isInTerm), decisions);
  const weeks = await loadRunWeeks(db, runId, [...people.facilitatorsOf.keys()]);
  return { ok: true, viewer: view.viewer, runId, programmeName: view.programmeName, holders, people, weeks };
}

/** What the name of somebody running the programme becomes in words that leave the site. */
export const RUNNING_LABEL = "someone running the programme";

/**
 * The people running the programme beyond its groups, whose names may be
 * typed into anybody's words ("as Claudia said in the session", "Maya's
 * explainer helped"): the programme's lead, the run's helpers (its track
 * leads), every admin, and everybody who has explained on the run, a
 * cancelled explainer's included. Ids only.
 */
export async function runStaffUids(db: Firestore, runId: string): Promise<string[]> {
  const [lead, runSnap, admins, explainers] = await Promise.all([
    readRunLead(db, runId),
    db.collection("courseRuns").doc(runId).get(),
    // One equality on one field; ids only, as the register's tasks read them.
    db.collection("users").where("role", "==", "admin").select().get(),
    // The run's explainers: one equality on one field, and only who explains.
    db.collection(COURSE_EXPLAINERS_COLLECTION).where("runId", "==", runId).select("explainerUid").get(),
  ]);
  const helpers = runSnap.exists ? normalizeCourseRun(runSnap.id, runSnap.data() ?? {}).trackLeadUids : [];
  const explaining = explainers.docs
    .map((doc) => (doc.data() ?? {}).explainerUid)
    .filter((uid): uid is string => typeof uid === "string" && uid.length > 0);
  return [...new Set([...(lead ? [lead.uid] : []), ...helpers, ...admins.docs.map((doc) => doc.id), ...explaining])].filter(Boolean);
}

/**
 * Everybody whose name could be typed into somebody's words, each name with
 * the words it becomes unless they are numbered: the people holding a place
 * ("a fellow"), and anybody else with a seat on the run, such as somebody
 * who joined it after decision day ("a fellow" too); the facilitators ("a
 * facilitator"); and the people running the programme ("someone running the
 * programme": its lead, the run's helpers and every admin), every name they
 * go by.
 */
export async function runPeopleToScrub(db: Firestore, door: CourseworkDoor): Promise<RunPerson[]> {
  const [staff, seats] = await Promise.all([
    runStaffUids(db, door.runId),
    // Every seat on the run, whatever its state: one equality on the run.
    db.collection("courseEnrolments").where("runId", "==", door.runId).get(),
  ]);
  const seated = seats.docs
    .map((doc) => (doc.data() ?? {}).uid)
    .filter((uid): uid is string => typeof uid === "string" && uid.length > 0);
  const uids = [...door.holders.map((holder) => holder.uid), ...door.people.facilitators, ...staff, ...seated];
  const names = await loadAccountNames(db, uids);
  const out: RunPerson[] = [];
  for (const holder of door.holders) {
    const label = door.people.facilitators.has(holder.uid) ? "a facilitator" : "a fellow";
    for (const name of new Set([holder.name, ...(names.get(holder.uid) ?? [])])) {
      if (name.trim()) out.push({ uid: holder.uid, name, label });
    }
  }
  for (const uid of door.people.facilitators) {
    if (door.holders.some((holder) => holder.uid === uid)) continue;
    for (const name of names.get(uid) ?? []) out.push({ uid, name, label: "a facilitator" });
  }
  const listed = (uid: string) => door.people.facilitators.has(uid) || door.holders.some((holder) => holder.uid === uid);
  for (const uid of new Set(seated)) {
    if (listed(uid)) continue;
    for (const name of names.get(uid) ?? []) out.push({ uid, name, label: "a fellow" });
  }
  for (const uid of staff) {
    if (listed(uid) || seated.includes(uid)) continue;
    for (const name of names.get(uid) ?? []) out.push({ uid, name, label: RUNNING_LABEL });
  }
  return out;
}

/** The people whose answers may be read for the programme: holding a place, never a facilitator's own work. */
export function fellowsOf(door: CourseworkDoor): Set<string> {
  return new Set(door.holders.map((holder) => holder.uid).filter((uid) => !door.people.facilitators.has(uid)));
}
