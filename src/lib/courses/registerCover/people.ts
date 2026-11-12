import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { firstNameOfUser, programmeLedBy, standingUserOf } from "@/lib/courses/programmeLead";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";

/**
 * THE PEOPLE A COVER IS ABOUT, read from their accounts: the group's
 * facilitators whose place it takes, and the person a session is given to.
 * First names and display names only; an address is read by the one send
 * that needs it and never handed back.
 */

/** A facilitator whose place a cover takes. */
export type CoveredFacilitator = {
  uid: string;
  firstName: string;
  /** The name they go by: what anybody reading the history may be shown. */
  name: string;
};

/**
 * The group's facilitators who still stand behind the role, in the group's
 * order: the people whose place somebody covering takes, "Josh" in "in
 * Josh's place".
 */
export async function facilitatorsByFirstName(
  db: Firestore,
  group: Pick<CourseGroupDoc, "facilitatorUids">,
): Promise<CoveredFacilitator[]> {
  const uids = [...new Set(group.facilitatorUids)].filter((uid) => uid && !uid.includes("/"));
  if (uids.length === 0) return [];
  const snaps = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
  const out: CoveredFacilitator[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (!isNamedWithStanding(standingUserOf(snap.id, data), "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    out.push({ uid: snap.id, firstName: firstNameOfUser(data) || displayNameOf(data), name: displayNameOf(data) });
  }
  return out;
}

/** The roles of an approved account: not waiting, not refused. */
const APPROVED_ROLES = new Set(["member", "committee", "admin"]);

/** The person a session is given to, as the cover route needs them. */
export type CoverPerson = {
  uid: string;
  firstName: string;
  /**
   * The name they go by: what people taking part are shown, and what the
   * group's history keeps, so any reader of either may be shown it.
   */
  name: string;
  /** On the committee, or an admin: "from the committee" in the group's notice. */
  committee: boolean;
  /** Their account's address, or "": read for the one email they are sent, never handed back. */
  address: string;
  /** Their stored account, read as the session shape the standing table takes (`standingUserOf`). */
  standing: SessionUser;
  /** Whether they facilitate a group with these facilitators, held to the bar they were appointed behind. */
  facilitates: (facilitatorUids: readonly string[]) => boolean;
};

/**
 * An APPROVED account (member, committee or admin; never pending or
 * rejected), or null. Whether they run anything the session may be given
 * for is `runsThingsOn`'s question, asked of this person next.
 */
export async function approvedPerson(db: Firestore, uid: string): Promise<CoverPerson | null> {
  if (!uid || uid.includes("/") || uid.length > 128) return null;
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const role = typeof data.role === "string" ? data.role : "";
  if (!APPROVED_ROLES.has(role)) return null;
  return {
    uid: snap.id,
    firstName: firstNameOfUser(data) || displayNameOf(data),
    name: displayNameOf(data),
    committee: role === "committee" || role === "admin",
    address: typeof data.email === "string" ? data.email.trim() : "",
    standing: standingUserOf(snap.id, data),
    facilitates: (facilitatorUids) =>
      isNamedWithStanding(standingUserOf(snap.id, data), "courseGroups.facilitatorUids", [...facilitatorUids]),
  };
}

/** Most groups one run's facilitators are looked for in: the Facilitators view's own bound. */
const MAX_RUN_GROUPS = 50;

/**
 * WHO MAY BE GIVEN ONE SESSION OF A RUN'S GROUP: somebody who already runs
 * things, never any account. The privacy policy says a facilitator's
 * session may be taken by "someone else running the programme", and tells
 * people taking part that others taking part see only their names, so a
 * fellow is never given another group's register. Admitted, each held to the
 * bar they were appointed behind:
 *
 *  - an admin, or a member of the committee;
 *  - the lead of the programme that names the run;
 *  - one of the run's track leads;
 *  - a facilitator of one of the run's groups that still meets.
 *
 * Everybody else is refused by the cover route in one sentence
 * (`COVER_REFUSAL.notRunning`), and the person picker on the group's page
 * lists the same people (`coverCandidatesOf`).
 */
export async function runsThingsOn(
  db: Firestore,
  run: { id: string; trackLeadUids: unknown },
  person: Pick<CoverPerson, "standing">,
): Promise<boolean> {
  const standing = person.standing;
  if (standing.role === "admin" || standing.role === "committee") return true;
  if (isNamedWithStanding(standing, "courseRuns.trackLeadUids", run.trackLeadUids)) return true;
  if (await programmeLedBy(db, standing, run.id)) return true;
  // One equality on one field, the Facilitators view's own read: no declared index.
  const groups = await db.collection("courseGroups").where("runId", "==", run.id).limit(MAX_RUN_GROUPS).get();
  return groups.docs.some((doc) => {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    return group.runId === run.id && !group.archived && isNamedWithStanding(standing, "courseGroups.facilitatorUids", group.facilitatorUids);
  });
}
