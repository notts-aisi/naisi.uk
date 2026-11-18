import { notToldWords, UNKNOWN_OUTCOME } from "../sessionChange/words";
import { postedWords } from "../updates/words";
import type { RoomRow } from "./model";
import { ROOM_SAVED, ROOM_SAVED_NOBODY_TOLD } from "./words";

/**
 * HOW THE WEEK'S ROOMS PRESSES THE ONE WRITER, with no React in it, so the
 * page and its tests press exactly the same way. Every request goes through
 * `post`, which the page makes from `fetch` and a test from the route
 * handlers themselves.
 *
 * A room changed in a row is a one-week change of that session
 * (`POST /api/courses/groups/[groupId]/session/change`, kind `move`) to the
 * same day and the same start, in the new room; a field emptied is "Room to
 * be confirmed", as the group's page says it. The same route, the same body,
 * the same refusals, the same history row: nothing here writes anything the
 * route would not.
 *
 * TELLING THE GROUP is the route's answer, posted on to the group through the
 * updates route (`/api/courses/runs/[runId]/updates`) exactly as answered,
 * its facilitators with it: the notice's words and who it reaches are the
 * route's, and the count on the button is checked by both before anything
 * changes or anything is sent. Whether to tell is decided as the group's
 * page decides it (`tells` below): whenever somebody can be told, and never
 * past what one send can take.
 */

/** One request to a route: its status and its body, or null when no answer came. */
export type Post = (url: string, body: unknown) => Promise<{ status: number; body: Record<string, unknown> | null } | null>;

/** What the writer's preview said about one room in one row. */
export type RoomPreview =
  | { room: string; status: "loading" }
  | { room: string; status: "refused"; error: string }
  | {
      room: string;
      status: "ok";
      /** Every email the group's notice would send, its facilitators with standing among them. */
      emails: number;
      /** The group would be told: somebody to tell, and not over what one send takes. */
      tells: boolean;
      /** More than one send can take: the room may be saved, and the group told from Messages. */
      overCap: boolean;
    };

/** The update the change route answers with, posted on as answered. */
export type GroupUpdate = { groupId: string; title: string; message: string; emailCount: number; withFacilitators?: boolean };

/** What a press did to one row: saved (and who was told), or refused, with a sentence; and an update still to post. */
export type RoomOutcome = {
  tone: "done" | "problem";
  text: string;
  /** The room was saved: it went through, whatever became of telling the group. */
  saved: boolean;
  /** The update that did not go, to post again with Tell the group. */
  pending?: { runId: string; update: GroupUpdate };
  /** The count the route says the button should have said. */
  emails?: number;
};

export function changeUrl(row: Pick<RoomRow, "groupId">): string {
  return `/api/courses/groups/${encodeURIComponent(row.groupId)}/session/change`;
}

export function updatesUrl(runId: string): string {
  return `/api/courses/runs/${encodeURIComponent(runId)}/updates`;
}

/** The move a room change is: the same day and start, in the room, or Room to be confirmed when it is empty. */
export function moveOf(row: Pick<RoomRow, "dateKey" | "start">, room: string) {
  const typed = room.trim();
  return { dateKey: row.dateKey, time: row.start, room: typed, roomToBeConfirmed: typed === "" };
}

/** The writer's answer to `preview: true` for one room, read as the row draws it. */
export async function askPreview(post: Post, row: RoomRow, room: string): Promise<RoomPreview> {
  const typed = room.trim();
  const answer = await post(changeUrl(row), {
    week: row.weekNumber,
    dateKey: row.dateKey,
    kind: "move",
    move: moveOf(row, typed),
    preview: true,
  });
  const error = typeof answer?.body?.error === "string" ? answer.body.error : null;
  if (!answer || answer.status !== 200 || answer.body?.ok !== true) {
    return { room: typed, status: "refused", error: error ?? UNKNOWN_OUTCOME };
  }
  const told = ((answer.body.preview as Record<string, unknown> | undefined)?.told ?? {}) as Record<string, unknown>;
  const emails = typeof told.emails === "number" ? told.emails : 0;
  const people = typeof told.people === "number" ? told.people : 0;
  const overCap = told.refused === true;
  return { room: typed, status: "ok", emails, overCap, tells: !overCap && (people > 0 || emails > 0) };
}

/** How many a row's press would email, as its button counts it. */
export function emailsOf(preview: RoomPreview | null | undefined): number {
  return preview?.status === "ok" && preview.tells ? preview.emails : 0;
}

/** Posts the update the change route answered with, and says what became of it. */
export async function tellGroup(post: Post, runId: string, update: GroupUpdate): Promise<RoomOutcome> {
  const answer = await post(updatesUrl(runId), {
    to: "group",
    groupId: update.groupId,
    title: update.title,
    message: update.message,
    email: update.emailCount > 0,
    ...(update.emailCount > 0 ? { emailCount: update.emailCount } : {}),
    // A change to the group's session reaches its facilitators too.
    ...(update.withFacilitators === true ? { withFacilitators: true } : {}),
  });
  const notTold = (why: string, next: GroupUpdate = update): RoomOutcome => ({
    tone: "problem",
    text: `${ROOM_SAVED} ${notToldWords(why)}`,
    saved: true,
    pending: { runId, update: next },
  });
  if (!answer) return notTold("we couldn’t tell whether the update went through.");
  const sentence = typeof answer.body?.error === "string" ? answer.body.error : null;
  if (answer.status === 409 && typeof answer.body?.emails === "number") {
    return notTold(sentence ?? "the number of people it emails has changed.", { ...update, emailCount: answer.body.emails });
  }
  if (answer.status !== 200 || answer.body?.ok !== true) return notTold(sentence ?? "the update didn’t go through.");
  const tally = answer.body.email as { sent?: number; held?: number; suppressed?: number; failed?: number } | null;
  return {
    tone: "done",
    saved: true,
    text: `${ROOM_SAVED} ${postedWords(
      tally ? { sent: tally.sent ?? 0, held: tally.held ?? 0, suppressed: tally.suppressed ?? 0, failed: tally.failed ?? 0 } : null,
    )}`,
  };
}

/**
 * ONE GROUP'S ROOM, THROUGH THE WRITER: the press with the reason and the
 * count its preview gave, then the update it answers with. A count that no
 * longer holds is answered 409 with the new one and nothing changed; the
 * outcome carries the new count for the row to press again.
 */
export async function saveRoom(
  post: Post,
  row: RoomRow,
  room: string,
  preview: Extract<RoomPreview, { status: "ok" }>,
  reason: string,
): Promise<RoomOutcome> {
  const tell = preview.tells;
  const answer = await post(changeUrl(row), {
    week: row.weekNumber,
    dateKey: row.dateKey,
    kind: "move",
    move: moveOf(row, room),
    reason: reason.trim(),
    tell,
    ...(tell ? { emailCount: preview.emails } : {}),
  });
  if (!answer) return { tone: "problem", text: UNKNOWN_OUTCOME, saved: false };
  const sentence = typeof answer.body?.error === "string" ? answer.body.error : null;
  if (answer.status === 409 && typeof answer.body?.emails === "number") {
    return { tone: "problem", text: sentence ?? UNKNOWN_OUTCOME, saved: false, emails: answer.body.emails };
  }
  if (answer.status !== 200 || answer.body?.ok !== true) return { tone: "problem", text: sentence ?? UNKNOWN_OUTCOME, saved: false };
  const update = answer.body.update as GroupUpdate | null;
  if (!update) return { tone: "done", text: ROOM_SAVED_NOBODY_TOLD, saved: true };
  return tellGroup(post, row.runId, update);
}
