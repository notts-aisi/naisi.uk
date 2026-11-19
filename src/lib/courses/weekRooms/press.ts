import { roomAsStored } from "../sessionChange/room";
import { postedWords } from "../updates/words";
import type { RoomRow } from "./model";
import { ASKED_AGAIN, UNKNOWN_HERE, ROOM_SAVED, ROOM_SAVED_NOBODY_TOLD, roomSavedNotToldWords } from "./words";

/**
 * HOW THE WEEK'S ROOMS AND THE TERM'S ROOMS PRESS THE ONE WRITER, with no
 * React in it, so the pages and their tests press exactly the same way. Every
 * request goes through `post`, which a page makes from `fetch` and a test
 * from the route handler itself.
 *
 * A room is the room-only change of that week
 * (`POST /api/courses/groups/[groupId]/session/change`, kind `room`): the
 * week's room and nothing else, never its day or time, and the week is not
 * marked moved. A field emptied, or "TBC", is To be confirmed.
 *
 * TELLING THE GROUP is the route's own, in the same request: with Tell the
 * group on, the route checks the count the preview gave, saves the room, then
 * emails that week's people and the group's facilitators, and answers with
 * what went. A count that changed, fell to nobody or passed one send's limit
 * is answered 409 with the new facts and nothing changed; the row takes them
 * and asks again.
 *
 * The term's grid presses the same kind with several weeks of one group at
 * once and Tell the group off: it emails nobody.
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
      /** The group can be told: somebody to tell, and not over what one send takes. */
      tells: boolean;
      /** More than one send can take: the room may be saved, and the group told from Messages. */
      overCap: boolean;
      /** Only its case or spacing changes: saved, and nobody is told. */
      quiet?: boolean;
    };

/** What a press did to one row: saved (and who was told), or refused, with a sentence. */
export type RoomOutcome = {
  tone: "done" | "problem";
  text: string;
  /** The room was saved, whatever became of telling the group. */
  saved: boolean;
  /** Saved, with Tell the group on, and somebody was not told. */
  notTold?: boolean;
  /** The count changed since the preview: the facts to ask again with. */
  asked?: { emails: number; overCap: boolean };
};

export function changeUrl(row: Pick<RoomRow, "groupId">): string {
  return `/api/courses/groups/${encodeURIComponent(row.groupId)}/session/change`;
}

/** The writer's answer to `preview: true` for one room, read as the row draws it. */
export async function askPreview(post: Post, row: Pick<RoomRow, "groupId" | "weekNumber" | "dateKey">, room: string): Promise<RoomPreview> {
  // The room as it would be stored: "TBC" and the like are no room.
  const typed = roomAsStored(room);
  const answer = await post(changeUrl(row), {
    kind: "room",
    weeks: [{ week: row.weekNumber, dateKey: row.dateKey, room: typed }],
    preview: true,
  });
  const error = typeof answer?.body?.error === "string" ? answer.body.error : null;
  if (!answer || answer.status !== 200 || answer.body?.ok !== true) {
    return { room: typed, status: "refused", error: error ?? UNKNOWN_HERE };
  }
  const said = (answer.body.preview ?? {}) as Record<string, unknown>;
  const told = (said.told ?? {}) as Record<string, unknown>;
  const emails = typeof told.emails === "number" ? told.emails : 0;
  const overCap = told.refused === true;
  const quiet = said.quiet === true;
  return { room: typed, status: "ok", emails, overCap, tells: !quiet && !overCap && emails > 0, quiet };
}

/** How many a row's press would email with Tell the group on, as its button counts it. */
export function emailsOf(preview: RoomPreview | null | undefined): number {
  return preview?.status === "ok" && preview.tells ? preview.emails : 0;
}

/**
 * ONE GROUP'S ROOM FOR ONE WEEK, THROUGH THE WRITER: the room, the reason and,
 * with `tell` on and somebody to tell, the count its preview gave.
 */
export async function saveRoom(
  post: Post,
  row: Pick<RoomRow, "groupId" | "weekNumber" | "dateKey">,
  room: string,
  preview: Extract<RoomPreview, { status: "ok" }>,
  reason: string,
  tell: boolean,
): Promise<RoomOutcome> {
  const telling = tell && preview.tells;
  const answer = await post(changeUrl(row), {
    kind: "room",
    weeks: [{ week: row.weekNumber, dateKey: row.dateKey, room: room.trim() }],
    reason: reason.trim(),
    tell: telling,
    ...(telling ? { emailCount: preview.emails } : {}),
  });
  if (!answer) return { tone: "problem", text: UNKNOWN_HERE, saved: false };
  const sentence = typeof answer.body?.error === "string" ? answer.body.error : null;
  if (answer.status === 409 && typeof answer.body?.emails === "number") {
    return {
      tone: "problem",
      text: `${sentence ?? UNKNOWN_HERE} ${ASKED_AGAIN}`,
      saved: false,
      asked: { emails: answer.body.emails, overCap: answer.body.overCap === true },
    };
  }
  if (answer.status !== 200 || answer.body?.ok !== true) return { tone: "problem", text: sentence ?? UNKNOWN_HERE, saved: false };
  const email = answer.body.email as { planned?: number; sent?: number; held?: number; suppressed?: number; failed?: number } | null;
  if (!email) return { tone: "done", text: ROOM_SAVED_NOBODY_TOLD, saved: true };
  const tally = { sent: email.sent ?? 0, held: email.held ?? 0, suppressed: email.suppressed ?? 0, failed: email.failed ?? 0 };
  if (tally.failed > 0) return { tone: "problem", text: roomSavedNotToldWords(tally.failed), saved: true, notTold: true };
  return { tone: "done", text: `${ROOM_SAVED} ${postedWords(tally)}`, saved: true };
}

/** One week's room in a grid press. */
export type GridWeek = { weekNumber: number; dateKey: string; room: string };

/** What a grid press did for each week of one group: saved, or refused with the writer's sentence. */
export type GridOutcome = Map<number, { saved: boolean; text: string }>;

/**
 * SEVERAL WEEKS OF ONE GROUP, FROM THE TERM'S GRID: one request, one
 * transaction, Tell the group off. Each week refused says why and the rest are
 * saved. A request that was refused whole (or never answered) says so for
 * every week.
 */
export async function saveGroupWeeks(post: Post, groupId: string, weeks: readonly GridWeek[]): Promise<GridOutcome> {
  const out: GridOutcome = new Map();
  const answer = await post(changeUrl({ groupId }), {
    kind: "room",
    weeks: weeks.map((week) => ({ week: week.weekNumber, dateKey: week.dateKey, room: week.room.trim() })),
    tell: false,
  });
  const whole = (text: string) => {
    for (const week of weeks) out.set(week.weekNumber, { saved: false, text });
    return out;
  };
  if (!answer) return whole(UNKNOWN_HERE);
  const sentence = typeof answer.body?.error === "string" ? answer.body.error : null;
  if (answer.status !== 200 || answer.body?.ok !== true) return whole(sentence ?? UNKNOWN_HERE);
  const rooms = Array.isArray(answer.body.rooms) ? (answer.body.rooms as Array<Record<string, unknown>>) : [];
  for (const week of weeks) {
    const said = rooms.find((each) => each.week === week.weekNumber);
    if (!said) out.set(week.weekNumber, { saved: false, text: UNKNOWN_HERE });
    else if (said.saved === true) out.set(week.weekNumber, { saved: true, text: ROOM_SAVED });
    else out.set(week.weekNumber, { saved: false, text: typeof said.error === "string" ? said.error : UNKNOWN_HERE });
  }
  return out;
}
