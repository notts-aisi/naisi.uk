import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { GROUP_FIELD_LIMITS, normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { placesInGroup } from "../groupArchive/plan";
import { freedOffersIn, freedOffersQuery } from "../groupArchive/read";
import { groupHistoryRow } from "../groupChange/facts";
import { placesProblem, sameName } from "../groupTimes/rules";
import {
  NAME_REFUSAL,
  PLACES_REFUSAL,
  belowFloorWords,
  floorOf,
  nameTakenWords,
  placesHistoryWords,
  placesSavedWords,
  renameHistoryWords,
  renamedWords,
  type PlacesFloor,
} from "./words";

/**
 * THE PLACES ROUTE'S AND THE NAME ROUTE'S ONE WRITE EACH: a group's own
 * limit (`capacity`) and its name, from the group's page under its programme.
 *
 * WHO MAY is decided by the route before anything here runs (the
 * programme's lead or an admin, `loadProgrammeRun`). What is decided here,
 * inside ONE transaction that reads what it decides on, so a person placed
 * between the page's read and the press is counted:
 *
 *  - the group is one of the run's and still runs (not archived);
 *  - PLACES pass the site's rule for a group's capacity (`placesProblem`:
 *    Times' own sentence for a number that is not one, then
 *    `groupCapacityError`, at most 40 and none left out on an
 *    open-enrolment run), and can't go below the people in the group plus
 *    the freed places offered in it and not answered (`floorOf`). People are
 *    counted as the Groups tab counts them (`placesInGroup`: learner places
 *    on the run whose group it is and who have not left), never by the
 *    stored `memberCount`. A group already below that floor is refused a
 *    save that leaves its number as it is, too: only a number at least the
 *    floor, or no limit, is saved;
 *  - a NAME is trimmed with its spaces folded, not blank, at most 80
 *    characters, and not the name of another live group of the run, compared
 *    as Add a group compares (`sameName`).
 *
 * A change writes the field, `updatedAt`, and one row of the group's History
 * in the same transaction. NOBODY IS EMAILED. A press for what the group
 * already has writes nothing.
 */

export type Refusal = { ok: false; status: 400 | 404 | 409; error: string };

type Actor = Pick<SessionUser, "uid" | "displayName">;

/** The body `{ places }`: a number, or null for no limit. */
export function parsePlacesBody(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: PLACES_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "places")) return { ok: false, error: PLACES_REFUSAL.body };
  if (!("places" in body)) return { ok: false, error: PLACES_REFUSAL.notANumber };
  const places = body.places;
  if (places === null) return { ok: true, value: null };
  if (typeof places !== "number" || !Number.isFinite(places)) return { ok: false, error: PLACES_REFUSAL.notANumber };
  return { ok: true, value: places };
}

/** The body `{ name }`: text, trimmed with its spaces folded, not blank, at most the field's limit. */
export function parseNameBody(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: NAME_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "name")) return { ok: false, error: NAME_REFUSAL.body };
  if (typeof body.name !== "string") return { ok: false, error: NAME_REFUSAL.blank };
  const value = body.name.replace(/\s+/g, " ").trim();
  if (!value) return { ok: false, error: NAME_REFUSAL.blank };
  if (value.length > GROUP_FIELD_LIMITS.name) return { ok: false, error: NAME_REFUSAL.tooLong };
  return { ok: true, value };
}

export type PlacesSet = {
  ok: true;
  /** False when the group already had this number: nothing was written. */
  changed: boolean;
  groupId: string;
  groupName: string;
  places: number | null;
  /** The people in the group and the freed places offered in it, as the transaction counted them. */
  floor: PlacesFloor;
  /** The sentence the page shows. */
  message: string;
};

export async function setGroupPlaces(
  db: Firestore,
  runId: string,
  groupId: string,
  places: number | null,
  actor: Actor,
): Promise<PlacesSet | Refusal> {
  const groupRef = db.collection("courseGroups").doc(groupId);
  const runRef = db.collection("courseRuns").doc(runId);
  // One equality each, so no declared index: every place on the run, and the
  // applications a freed place in this group's name was offered on.
  const placesQuery = db.collection("courseEnrolments").where("runId", "==", runId);
  const offersQuery = freedOffersQuery(db, groupId);
  return db.runTransaction(async (tx) => {
    const [groupSnap, runSnap, placesSnap, offersSnap] = await Promise.all([
      tx.get(groupRef),
      tx.get(runRef),
      tx.get(placesQuery),
      tx.get(offersQuery),
    ]);
    if (!groupSnap.exists) return { ok: false, status: 404, error: PLACES_REFUSAL.noGroup };
    const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
    if (group.runId !== runId) return { ok: false, status: 404, error: PLACES_REFUSAL.noGroup };
    if (group.archived) return { ok: false, status: 409, error: PLACES_REFUSAL.archived };
    if (!runSnap.exists) return { ok: false, status: 409, error: PLACES_REFUSAL.runGone };
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

    const problem = placesProblem(places, run.enrolMode);
    if (problem) return { ok: false, status: 400, error: problem };

    const name = group.name.trim() || "This group";
    const enrolments = placesSnap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
    const floor: PlacesFloor = {
      inGroup: placesInGroup({ group, places: enrolments }).length,
      freedOffers: freedOffersIn(offersSnap, group.id),
    };
    // Below the floor is refused, a press that leaves the number as it is
    // included: no limit is never below it.
    if (places !== null && places < floorOf(floor)) {
      return { ok: false, status: 409, error: belowFloorWords(name, floor) };
    }

    const message = placesSavedWords(name, places);
    if (group.capacity === places) {
      return { ok: true, changed: false, groupId: group.id, groupName: name, places, floor, message };
    }
    tx.update(groupRef, { capacity: places, updatedAt: FieldValue.serverTimestamp() });
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      groupHistoryRow({
        kind: "group-places-changed",
        run: { id: runId },
        group,
        actor,
        detail: placesHistoryWords(group.capacity, places),
        before: { places: group.capacity },
        after: { places },
        emailed: 0,
      }),
    );
    return { ok: true, changed: true, groupId: group.id, groupName: name, places, floor, message };
  });
}

export type NameSet = {
  ok: true;
  /** False when the group already had this name: nothing was written. */
  changed: boolean;
  groupId: string;
  /** The name it has now. */
  groupName: string;
  /** The sentence the page shows. */
  message: string;
};

export async function renameGroup(
  db: Firestore,
  runId: string,
  groupId: string,
  name: string,
  actor: Actor,
): Promise<NameSet | Refusal> {
  const groupRef = db.collection("courseGroups").doc(groupId);
  // One equality, so no declared index: the run's groups, as Add a group reads them.
  const groupsQuery = db.collection("courseGroups").where("runId", "==", runId);
  return db.runTransaction(async (tx) => {
    const [groupSnap, groupsSnap] = await Promise.all([tx.get(groupRef), tx.get(groupsQuery)]);
    if (!groupSnap.exists) return { ok: false, status: 404, error: NAME_REFUSAL.noGroup };
    const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
    if (group.runId !== runId) return { ok: false, status: 404, error: NAME_REFUSAL.noGroup };
    if (group.archived) return { ok: false, status: 409, error: NAME_REFUSAL.archived };

    const was = group.name.trim() || "This group";
    if (group.name === name) {
      return { ok: true, changed: false, groupId: group.id, groupName: name, message: renamedWords(was, name) };
    }
    // Another live group of the run with this name, compared as Add a group
    // compares (case and spacing aside). The group itself never counts, so a
    // change of case alone is a rename.
    const taken = groupsSnap.docs
      .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
      .find((other) => other.id !== group.id && other.runId === runId && !other.archived && sameName(other.name, name));
    if (taken) return { ok: false, status: 409, error: nameTakenWords(taken.name.trim(), was) };

    tx.update(groupRef, { name, updatedAt: FieldValue.serverTimestamp() });
    tx.set(
      db.collection(COURSE_AUDIT_COLLECTION).doc(),
      groupHistoryRow({
        kind: "group-renamed",
        run: { id: runId },
        group,
        actor,
        detail: renameHistoryWords(was, name),
        before: { name: group.name },
        after: { name },
        emailed: 0,
      }),
    );
    return { ok: true, changed: true, groupId: group.id, groupName: name, message: renamedWords(was, name) };
  });
}
