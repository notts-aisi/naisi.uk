import { EXPLAINER_TASK_SOURCE } from "@/lib/firestore/courseTasks";
import { TASK_FIELD_LIMITS, type SourceRef, type TaskDoc } from "@/lib/firestore/tasks";
import { explainerTaskDescription, explainerTaskTitle, type ExplainerWhere } from "./words";

/**
 * AN EXPLAINER'S TASK FOR ONE SESSION, for whoever gives it.
 *
 *  - THE SESSION'S DAY, TIME AND ROOM, and nothing of the group: no name of
 *    anybody in it, none of their work, and never the link to join an online
 *    session (`where` is what an email may print: a room, "Online" or
 *    nothing).
 *  - `assignees-only`, the explainer its one completer and the admin who
 *    scheduled it its creator: it never sits on the committee board.
 *  - DUE when the session starts.
 *  - BORN NOTIFIED (`initialNotifyAt`): the route sends whoever explains one
 *    email for every session at once, on their tasks row, so the task system
 *    never sends one per task.
 *  - ITS POINTER (`sourceRef`) names the run, the week, the group and the
 *    session: the run's destroy sweeps it with the run.
 *
 * Pure: the tests read the exact task.
 */

export type ExplainerTaskArgs = {
  runId: string;
  groupId: string;
  groupName: string;
  sessionKey: string;
  weekNumber: number;
  startsAt: Date | null;
  where: ExplainerWhere;
  topic: string;
  minutes: number;
  programme: string;
  /** The admin who scheduled it, by the name whoever explains sees them by. */
  askedBy: string;
  creatorUid: string;
  explainerUid: string;
  now: Date;
};

export function buildExplainerTask(args: ExplainerTaskArgs): Omit<TaskDoc, "id"> {
  const sourceRef: SourceRef = {
    cohortId: args.runId,
    weekNumber: args.weekNumber,
    groupId: args.groupId,
    sessionKey: args.sessionKey,
  };
  return {
    title: explainerTaskTitle(args.topic, args.groupName, args.startsAt, TASK_FIELD_LIMITS.title),
    description: explainerTaskDescription({
      askedBy: args.askedBy,
      minutes: args.minutes,
      topic: args.topic,
      groupName: args.groupName,
      weekNumber: args.weekNumber,
      programme: args.programme,
      at: args.startsAt,
      where: args.where,
    }).slice(0, TASK_FIELD_LIMITS.description),
    source: EXPLAINER_TASK_SOURCE,
    kind: "generic",
    projectId: null,
    creatorUid: args.creatorUid,
    completerUids: [args.explainerUid],
    reviewerUids: [],
    status: "todo",
    priority: "normal",
    dueDate: args.startsAt,
    archived: false,
    visibility: "assignees-only",
    subtasks: [],
    blocks: [],
    blockConsents: {},
    subtaskStats: { done: 0, total: 0 },
    attachmentCount: 0,
    commentCount: 0,
    tags: [],
    sourceRef,
    artefact: null,
    sourceTemplateId: null,
    createdAt: args.now,
    updatedAt: args.now,
    completedAt: null,
    initialNotifyAt: args.now,
    pendingNotifyUids: [],
  };
}
