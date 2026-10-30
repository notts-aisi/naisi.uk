import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isInTerm } from "@/lib/applications/decisions";
import { placeHoldersOn, type PlaceHolder } from "@/lib/applications/handover/holders";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadForm } from "@/lib/applications/repo";
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
  const [applications, decisions, people] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    loadRunPeople(db, runId),
  ]);
  const holders = placeHoldersOn(form, programmeId, applications.filter(isInTerm), decisions);
  const weeks = await loadRunWeeks(db, runId, [...people.facilitatorsOf.keys()]);
  return { ok: true, viewer: view.viewer, runId, programmeName: view.programmeName, holders, people, weeks };
}

/**
 * Everybody on the run whose name could be typed into somebody's words, each
 * name with the words it becomes unless they are numbered: the people holding
 * a place ("a fellow") and the facilitators ("a facilitator"), every name
 * they go by.
 */
export async function runPeopleToScrub(db: Firestore, door: CourseworkDoor): Promise<RunPerson[]> {
  const uids = [...door.holders.map((holder) => holder.uid), ...door.people.facilitators];
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
  return out;
}

/** The people whose answers may be read for the programme: holding a place, never a facilitator's own work. */
export function fellowsOf(door: CourseworkDoor): Set<string> {
  return new Set(door.holders.map((holder) => holder.uid).filter((uid) => !door.people.facilitators.has(uid)));
}
