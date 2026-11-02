import { REVIEW_FOLLOW_UP_TASK_SOURCE } from "@/lib/firestore/courseTasks";
import { TASK_FIELD_LIMITS, type SourceRef, type TaskDoc } from "@/lib/firestore/tasks";
import { FOLLOW_UP_WORDS } from "./words";

/**
 * A WEEK REVIEW'S FOLLOW-UP: the task an admin's "Ask Rahul to have a word
 * with Grace" makes for the person's group's facilitators.
 *
 *  - FIXED WORDS AND NO REASON. The title names the person and their group,
 *    the description who asked and about which programme. Why it was asked
 *    may be Claude's, a check-in's or a report's, and none of those may reach
 *    a facilitator (privacy v15), so the task never says.
 *  - `assignees-only`, the group's live facilitators its completers and the
 *    admin its creator: it never sits on the committee board, and nobody
 *    else in the group sees it.
 *  - BORN NOTIFIED (`initialNotifyAt`): the route sends the you-have-been-added
 *    email itself, on the tasks row, as it makes the task, so the task
 *    system never sends it a second time.
 *  - ITS POINTER (`sourceRef`) names the run, the week, the group and the
 *    person (`aboutUid`): the run's destroy sweeps it with the run, and the
 *    person's account deletion finds it and deletes it, because it names them.
 *  - ONE PER PERSON PER WEEK, by its id: asking twice is refused.
 *
 * Pure: the tests read the exact task.
 */

/** `review-follow-up__{runId}__{weekId}__{uid}`. CONSTRUCT-ONLY: every part is also in `sourceRef`. */
export function followUpTaskId(runId: string, weekId: string, uid: string): string {
  return `${REVIEW_FOLLOW_UP_TASK_SOURCE}__${runId}__${weekId}__${uid}`;
}

export type FollowUpTaskArgs = {
  runId: string;
  weekNumber: number;
  groupId: string;
  aboutUid: string;
  /** The person's name as the run's rows hold it, never the full name only the committee sees. */
  name: string;
  /** The name the person goes by, for the sentence. */
  goBy: string;
  groupName: string;
  programme: string;
  /** The admin who asked, by the name they go by. */
  askedBy: string;
  creatorUid: string;
  completerUids: readonly string[];
  /** When the group next meets, or null. */
  dueDate: Date | null;
  now: Date;
};

export function buildFollowUpTask(args: FollowUpTaskArgs): Omit<TaskDoc, "id"> {
  const sourceRef: SourceRef = {
    cohortId: args.runId,
    weekNumber: args.weekNumber,
    groupId: args.groupId,
    aboutUid: args.aboutUid,
  };
  return {
    title: FOLLOW_UP_WORDS.title(args.name, args.groupName).slice(0, TASK_FIELD_LIMITS.title),
    description: FOLLOW_UP_WORDS.description(args.askedBy, args.goBy, args.programme, args.weekNumber).slice(0, TASK_FIELD_LIMITS.description),
    source: REVIEW_FOLLOW_UP_TASK_SOURCE,
    kind: "generic",
    projectId: null,
    creatorUid: args.creatorUid,
    completerUids: [...new Set(args.completerUids)].slice(0, TASK_FIELD_LIMITS.maxCompleters),
    reviewerUids: [],
    status: "todo",
    priority: "normal",
    dueDate: args.dueDate,
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
