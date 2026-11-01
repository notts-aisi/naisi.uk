import type { ResolvedSession } from "./sessions";
import {
  registerFollowUpTaskId,
  registerTaskPayload,
  sessionDateLabel,
} from "./unmarkedRegisters";
import type { SourceRef, TaskDoc } from "@/lib/firestore/tasks";

/**
 * THE CARD THAT SAYS A GROUP'S "WEEK N IS OPEN" IS HELD.
 *
 * "Week N is open" on its schedule goes out whole or not at all: when a fact
 * it carries is empty (the group's room, the week's title, what the week asks
 * for), the email is held rather than sent without it. Held silently, nobody would
 * know a group was about to go without its email, so the job tells the
 * programme's lead and the admins with a card on their boards, the same way
 * an unfinished register is chased. Born notified: like every register card it
 * emails nobody.
 *
 * ONE CARD PER GROUP PER SESSION. The id is deterministic and the job creates
 * it once; the job archives it itself once the email has gone.
 *
 * ITS POINTER CARRIES NO SESSION KEY, on purpose. Pushing a register archives
 * the register cards that point at that session (`archiveRegisterFollowUp` in
 * the push route asks for `sourceRef.sessionKey`), and finishing a register
 * says nothing about whether the week's email can go. Without the key that
 * query cannot reach this card, while the run's destroy sweep, which asks only
 * for the source and the run, still takes it with the run.
 *
 * PURE, like the module it borrows its shape from.
 */

/** `course-register__{runId}__{groupId}__{sessionKey}__email`. Construct-only. */
export function heldEmailTaskId(
  runId: string,
  groupId: string,
  sessionKeyValue: string,
): string {
  return `${registerFollowUpTaskId(runId, groupId, sessionKeyValue)}__email`;
}

export type HeldEmailCopyArgs = {
  courseTitle: string;
  groupName: string;
  weekNumber: number;
  dateKey: string;
  /** What is empty, as phrases ("the group’s room", "what week 4 asks for"). */
  missing: readonly string[];
};

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function heldEmailTitle(args: HeldEmailCopyArgs): string {
  return `Week ${args.weekNumber}’s email held: ${args.groupName || "a group"}`;
}

export function heldEmailDescription(args: HeldEmailCopyArgs): string {
  const day = sessionDateLabel(args.dateKey);
  const session = day ? `week ${args.weekNumber} on ${day}` : `week ${args.weekNumber}`;
  const group = args.groupName || "This group";
  const course = args.courseTitle || "a course";
  return [
    `${group} on ${course} has not been sent “Week ${args.weekNumber} is open”, about ${session}. It is held because it is missing ${listOf(args.missing)}.`,
    "",
    "It goes out by itself as soon as that is filled in, as long as the session is still ahead. If the session starts first, the group gets no email for that week.",
    "",
    "What to do: fill in what is missing. A group’s day, time and room are on the group; a week’s title and what it asks for are in the week editor.",
  ].join("\n");
}

export type HeldEmailTaskArgs = {
  runId: string;
  groupId: string;
  session: Pick<ResolvedSession, "weekNumber" | "sessionKey" | "dateKey">;
  courseTitle: string;
  groupName: string;
  missing: readonly string[];
  /** From `registerTaskCompleters`: the run's lead when it has one, then the admins. */
  completerUids: readonly string[];
  /** An admin uid, never "". */
  creatorUid: string;
  /** The session's start: after it the email can no longer go. */
  dueDate: Date;
  now: Date;
  limits: { title: number; description: number };
};

export function buildHeldEmailTask(args: HeldEmailTaskArgs): Omit<TaskDoc, "id"> {
  const copy: HeldEmailCopyArgs = {
    courseTitle: args.courseTitle,
    groupName: args.groupName,
    weekNumber: args.session.weekNumber,
    dateKey: args.session.dateKey,
    missing: args.missing,
  };
  // No `sessionKey`: see the module header.
  const sourceRef: SourceRef = {
    cohortId: args.runId,
    weekNumber: args.session.weekNumber,
    groupId: args.groupId,
  };
  return registerTaskPayload({
    title: heldEmailTitle(copy).slice(0, args.limits.title),
    description: heldEmailDescription(copy).slice(0, args.limits.description),
    creatorUid: args.creatorUid,
    completerUids: args.completerUids,
    dueDate: args.dueDate,
    sourceRef,
    now: args.now,
  });
}
