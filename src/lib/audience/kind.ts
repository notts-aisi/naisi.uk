import type { NotificationCategory } from "@/lib/firestore/notifications";
import type { Tag } from "./tags";

/**
 * HOW A MESSAGE TO A SELECTION WOULD BE SENT: AS A PROGRAMME NOTICE, OR BY
 * EACH PERSON'S SETTINGS. The two classes a message to chosen people can be
 * (docs/notifications.md); the third, transactional, answers something the
 * person did and is never a message somebody writes to a list.
 *
 * A NOTICE is somebody running a programme writing to the people they run it
 * for, about running it, so it reaches them whatever their settings say. The
 * people a writer runs are worked out from the records by the loader: an
 * admin runs every programme of the term; a programme's lead runs the people
 * holding a place on it and its facilitators; a facilitator runs the people
 * in their group. The picker's whole-send rule (Messages) is a notice only
 * when every tag it includes is about a programme (holding a place,
 * facilitating, leading, a programme's own tags, a group, or a person named
 * one by one) and every person it reaches is somebody the writer runs. A tag
 * about an event, a subscription, a role or a track is news, not running a
 * programme, whoever happens to be in it.
 *
 * BY THEIR SETTINGS reads exactly one row of each person's settings, the one
 * the writer chooses, never a mix of two: the newsletter, event announcements
 * or course announcements. The tags suggest one (an event's tags suggest
 * event announcements) and the writer can change it. The tasks row is not
 * offered: it is for the tasks and worksheets somebody volunteered for, not
 * for messages to a list.
 *
 * A send that decides person by person (an event's invitation, where the
 * programme's people get a notice and everybody else the events row) asks
 * the same facts through `Policy` "per-person".
 *
 * Pure, with type-only imports.
 */

/** A row of the settings grid a message by settings may read. */
export type GridRow = Extract<NotificationCategory, "newsletter" | "events" | "courses">;
export const GRID_ROWS: readonly GridRow[] = ["newsletter", "events", "courses"];

export function isGridRow(value: unknown): value is GridRow {
  return typeof value === "string" && (GRID_ROWS as readonly string[]).includes(value);
}

export type SendMode = "notice" | "grid";

/**
 * "whole": the send is one class for everybody (Messages). "per-person": each
 * person is a notice when the writer runs them (under the one programme the
 * send names, when it names one) and by their settings otherwise (an event's
 * invitation).
 */
export type Policy = "whole" | "per-person";

/** Tags that are about running a programme, so may go as a programme notice. */
function isProgrammeTag(tag: Tag): boolean {
  switch (tag.kind) {
    case "term":
      return tag.part === "holding" || tag.part === "facilitating" || tag.part === "leading";
    case "programme":
    case "group":
    case "person":
      return true;
    case "event":
    case "subscribed":
    case "role":
    case "track":
      return false;
  }
}

/** Whether a selection's included tags allow a notice at all. Nothing included allows nothing. */
export function tagsAllowNotice(include: readonly Tag[]): boolean {
  return include.length > 0 && include.every(isProgrammeTag);
}

/**
 * The row a selection suggests, from what it includes: an event's tag, or the
 * event announcements' subscribers, suggest event announcements; the
 * newsletter's subscribers suggest the newsletter; everything else, course
 * announcements, which is the row a programme's optional mail reads.
 */
export function suggestedRow(include: readonly Tag[]): GridRow {
  if (include.some((tag) => tag.kind === "event" || (tag.kind === "subscribed" && tag.channel === "events"))) {
    return "events";
  }
  if (include.some((tag) => tag.kind === "subscribed" && tag.channel === "newsletter")) return "newsletter";
  return "courses";
}

/**
 * The mode of a whole send: a notice when the tags allow one and the writer
 * runs everybody it reaches; otherwise by their settings. Nobody at all is
 * no send, and reads as by their settings.
 */
export function wholeMode(include: readonly Tag[], everybodyIsRun: boolean, nobody: boolean): SendMode {
  if (nobody) return "grid";
  return tagsAllowNotice(include) && everybodyIsRun ? "notice" : "grid";
}
