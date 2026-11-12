import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { GROUP_FIELD_LIMITS, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { couldBeFollowed } from "./followable";
import { groupHistoryRow } from "./groupChange/facts";
import { historyDetail, roomHeadline, ROOM_TO_BE_CONFIRMED } from "./groupChange/words";
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
 * editor. People see it on their programme page, and the group's `updatedAt`
 * moves so a calendar takes the new place on its next fetch. NOBODY IS
 * EMAILED unless the press asks to tell the group (`parseRoomTell`): then the
 * route sends "A room set or changed" to the group's told people and its
 * facilitators, with the count on the button checked first. Either way a
 * change writes one row of the group's history in the same transaction. One
 * week's room is "Change a session"'s, never this.
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

/** The words a press may add to `{ room }`: whether to tell the group, and the count its button showed. */
export type RoomTell = { tell: boolean; emailCount: number };

/**
 * `tell` (optional, false when missing) and `emailCount` (needed with
 * `tell`): the room route's way to tell the group. A room a reader could
 * follow is refused only when the group is to be told, since the room then
 * goes into an email.
 */
export function parseRoomTell(raw: unknown, room: string): { ok: true; value: RoomTell } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: ROOM_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (key !== "room" && key !== "tell" && key !== "emailCount") return { ok: false, error: ROOM_REFUSAL.body };
  }
  if (body.tell !== undefined && typeof body.tell !== "boolean") return { ok: false, error: ROOM_REFUSAL.tell };
  const tell = body.tell === true;
  if (!tell) return { ok: true, value: { tell: false, emailCount: 0 } };
  if (typeof body.emailCount !== "number" || !Number.isInteger(body.emailCount) || body.emailCount < 0) {
    return { ok: false, error: ROOM_REFUSAL.emailCount };
  }
  if (couldBeFollowed(room)) return { ok: false, error: ROOM_REFUSAL.roomLink };
  return { ok: true, value: { tell, emailCount: body.emailCount } };
}

export async function setGroupRoom(
  db: Firestore,
  runId: string,
  groupId: string,
  room: string,
  /** Who pressed, and how many the button said it would email: the history row's. */
  history?: { actor: Pick<SessionUser, "uid" | "displayName">; emailed: number },
): Promise<(RoomSet & { group: CourseGroupDoc }) | RoomRefusal> {
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
      return { ok: true, changed: false, groupId: group.id, groupName: name, room, message, group };
    }
    tx.update(ref, { "session.location": room, updatedAt: FieldValue.serverTimestamp() });
    if (history) {
      const was = group.session.location.trim();
      tx.set(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({
          kind: "group-room-changed",
          run: { id: runId },
          group,
          actor: history.actor,
          detail: historyDetail({ headline: roomHeadline(room), before: was || ROOM_TO_BE_CONFIRMED, emailed: history.emailed }),
          before: { room: was },
          after: { room },
          emailed: history.emailed,
        }),
      );
    }
    return {
      ok: true,
      changed: true,
      groupId: group.id,
      groupName: name,
      room,
      message,
      group: { ...group, session: { ...group.session, location: room } },
    };
  });
}
