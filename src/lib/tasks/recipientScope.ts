import "server-only";

/**
 * WHO A TASK NOTIFICATION MAY REACH.
 *
 * ## The rule
 *
 * A task's roster is `completerUids ∪ reviewerUids`. That set, and nothing
 * else, is who the server will email or push about the task. Every recipient
 * of a task notification is therefore somebody a committee member deliberately
 * put on the task, which is a visible, audited act with its own board row.
 *
 * ## Why this is a module rather than two lines in a route
 *
 * A send route addresses only people on the task's roster. A list the caller
 * wrote is filtered against the roster first.
 *
 * The product has always drawn these lists from the roster
 * (`CommentComposer.tsx` filters the mention pool to
 * `completerUids ∪ reviewerUids`, `expandMentionAll` resolves `@all` to the
 * same two arrays, `SubtaskDetailModal.tsx` offers the same pool to the
 * subtask pickers, and `taskMutations.ts` strips a uid out of every subtask
 * array when it leaves the task). This module is that rule stated once on the
 * server, where it is a gate rather than a dropdown: a client is a suggestion,
 * and a recipient list is a send.
 *
 * ## What it deliberately does NOT admit
 *
 * An admin, or an SU-recognised committee member who can see a
 * committee-visibility task without being on it, is not a recipient unless
 * they are on the roster. That matches every picker in the product exactly, so
 * nothing a person can do is refused here. Do not widen it to "everyone who
 * can READ this task".
 */

function uidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0);
}

/** The two arrays that decide who is on a task, as one set. */
export function taskRoster(task: {
  completerUids?: unknown;
  reviewerUids?: unknown;
}): Set<string> {
  return new Set([...uidList(task?.completerUids), ...uidList(task?.reviewerUids)]);
}

/**
 * The uids in `candidates` that are on the task, in the order they were
 * named, de-duplicated. Everything else is dropped SILENTLY: the caller gets
 * no per-uid answer back, so a refusal cannot be turned into a question about
 * which uids exist.
 */
export function onTaskRoster(
  candidates: unknown,
  task: { completerUids?: unknown; reviewerUids?: unknown },
): string[] {
  const roster = taskRoster(task);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const uid of uidList(candidates)) {
    if (!roster.has(uid) || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}
