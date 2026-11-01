import { parseTag } from "@/lib/audience/tags";

/**
 * THE ONE MESSAGE IN MESSAGES THAT ALSO GOES TO PHONES: a programme notice to
 * one group's people.
 *
 * Messages sends email. The group email it took over from a run's pages
 * (`POST /api/courses/groups/[groupId]/email`) also pushed: every member of
 * the group with a device got a notification beside the email, through the
 * notice lane's push door, which reads no preference. So a message in
 * Messages that is that send, a programme notice whose one included tag is a
 * group's (people left out of it or not), keeps the push the group email
 * made: the group's name as its title, the subject as its words, and the
 * group's page as where it opens, to each person it reached with an account
 * (and to each whose every address bounced, because a bounce is a fact about
 * an inbox and says nothing about a phone), never to the writer. Nothing else
 * in Messages pushes: a message by their settings, or a notice to anybody but
 * one group, is email alone.
 *
 * Pure, so the composer says it before the press and the send route decides
 * it by the same rule.
 */

/** The group a send pushes to, or null for a send that is email alone. */
export function groupPushOf(include: readonly string[], mode: "notice" | "grid"): string | null {
  if (mode !== "notice" || include.length !== 1) return null;
  const tag = parseTag(include[0]);
  return tag?.kind === "group" ? tag.groupId : null;
}

/** Where the notification opens: the group's page, as the group email's did. */
export function groupPushPath(runId: string, groupId: string): string {
  return `/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}`;
}
