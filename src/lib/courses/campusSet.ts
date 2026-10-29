import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import type { GroupCampus } from "./campus";
import { CAMPUS_REFUSAL, campusSavedWords } from "./campusWords";

/**
 * THE CAMPUS ROUTE'S ONE WRITE: a group's campus, from the Groups tab
 * (`PUT .../programmes/[programmeId]/groups/[groupId]/campus`).
 *
 * WHO MAY is decided by the route before anything here runs (the
 * programme's lead or an admin, `loadProgrammeRun`). What is decided here is
 * whether the group is one of the run's and still runs, inside one
 * transaction that reads what it decides on.
 *
 * Unlike a group's time, a campus may change after Publish has told people
 * their group, as its room may in the run editor: nothing anybody was told
 * stops being true about when they meet. NOBODY IS EMAILED. The group's
 * `updatedAt` moves, so a calendar that holds the group's sessions takes the
 * new place on its next fetch.
 */

export type CampusRefusal = { ok: false; status: 404 | 409; error: string };

export type CampusSet = {
  ok: true;
  /** False when the group already had this campus: nothing was written. */
  changed: boolean;
  groupId: string;
  groupName: string;
  campus: GroupCampus | null;
  /** The sentence the page shows. */
  message: string;
};

export async function setGroupCampus(
  db: Firestore,
  runId: string,
  groupId: string,
  campus: GroupCampus | null,
): Promise<CampusSet | CampusRefusal> {
  const ref = db.collection("courseGroups").doc(groupId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: CAMPUS_REFUSAL.noGroup };
    const group = normalizeCourseGroup(snap.id, snap.data() ?? {});
    if (group.runId !== runId) return { ok: false, status: 404, error: CAMPUS_REFUSAL.noGroup };
    if (group.archived) return { ok: false, status: 409, error: CAMPUS_REFUSAL.archived };
    const name = group.name.trim() || "This group";
    const message = campusSavedWords(name, campus);
    if (group.campus === campus) {
      return { ok: true, changed: false, groupId: group.id, groupName: name, campus, message };
    }
    tx.update(ref, { campus, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, changed: true, groupId: group.id, groupName: name, campus, message };
  });
}
