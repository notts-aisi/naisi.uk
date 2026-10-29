import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { GROUP_FIELD_LIMITS, normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { ROOM_REFUSAL, roomSavedWords } from "./roomWords";

/**
 * THE ROOM ROUTE'S ONE WRITE: the room a group meets in every week, from the
 * Groups tab (`PUT .../programmes/[programmeId]/groups/[groupId]/room`), the
 * same field the run editor's group card calls "Location".
 *
 * WHO MAY is decided by the route before anything here runs (the
 * programme's lead or an admin, `loadProgrammeRun`). What is decided here is
 * whether the group is one of the run's and still runs, inside one
 * transaction that reads what it decides on.
 *
 * A room may change after Publish has told people their group, as in the run
 * editor. NOBODY IS EMAILED: people see it on their programme page, and the
 * group's `updatedAt` moves so a calendar takes the new place on its next
 * fetch. One week's room is "Change a session"'s, never this.
 */

export type RoomRefusal = { ok: false; status: 404 | 409; error: string };

export type RoomSet = {
  ok: true;
  /** False when the group already had this room: nothing was written. */
  changed: boolean;
  groupId: string;
  groupName: string;
  room: string;
  /** The sentence the page shows. */
  message: string;
};

/** The body `{ room }`: text up to the field's limit, trimmed; "" for none. */
export function parseRoomBody(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: ROOM_REFUSAL.body };
  const room = (raw as Record<string, unknown>).room;
  if (typeof room !== "string") return { ok: false, error: ROOM_REFUSAL.notText };
  const value = room.replace(/\s+/g, " ").trim();
  if (value.length > GROUP_FIELD_LIMITS.location) return { ok: false, error: ROOM_REFUSAL.tooLong };
  return { ok: true, value };
}

export async function setGroupRoom(
  db: Firestore,
  runId: string,
  groupId: string,
  room: string,
): Promise<RoomSet | RoomRefusal> {
  const ref = db.collection("courseGroups").doc(groupId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: ROOM_REFUSAL.noGroup };
    const group = normalizeCourseGroup(snap.id, snap.data() ?? {});
    if (group.runId !== runId) return { ok: false, status: 404, error: ROOM_REFUSAL.noGroup };
    if (group.archived) return { ok: false, status: 409, error: ROOM_REFUSAL.archived };
    const name = group.name.trim() || "This group";
    const message = roomSavedWords(name, room);
    if (group.session.location.trim() === room) {
      return { ok: true, changed: false, groupId: group.id, groupName: name, room, message };
    }
    tx.update(ref, { "session.location": room, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, changed: true, groupId: group.id, groupName: name, room, message };
  });
}
