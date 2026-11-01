import { parseTag } from "@/lib/audience/tags";

/**
 * THE MESSAGES IN MESSAGES THAT ALSO GO TO PHONES: a programme notice to one
 * group's people, or to one programme's people.
 *
 * Messages sends email. Two of the composers it took over from a run's pages
 * also pushed, through the notice lane's push door, which reads no preference:
 *
 *  - the group email (`POST /api/courses/groups/[groupId]/email`), to every
 *    member of the group, with the group's name as its title and the group's
 *    page as where it opens;
 *  - "Email the whole cohort" sent as an important notice
 *    (`POST /api/courses/runs/[runId]/email` with `asNotice`), to everybody
 *    holding a place on the run, with the course's title (else the run's
 *    label) as its title and the run's home as where it opens.
 *
 * So a message in Messages that is one of those sends keeps that push: a
 * programme notice whose one included tag (people left out of it or not) is
 * a group's, or a programme's people (its everyone, or its people holding a
 * place; not its facilitators alone, whom neither composer wrote to as a
 * cohort). The subject is its words, as theirs was. It goes to each person the
 * message reached with an account, and to each whose every address bounced
 * (a bounce is a fact about an inbox and says nothing about a phone), never to
 * the writer. Nothing else in Messages pushes: a message by their settings, a
 * notice to two tags, or one to the term's people or a programme's
 * facilitators, is email alone.
 *
 * Pure, so the composer says it before the press and the send route decides
 * it by the same rule. What the notification says is the route's to work out
 * from the records (`./pushing.ts`).
 */

export type PushTarget =
  | { kind: "group"; groupId: string }
  | { kind: "programme"; roundId: string; programmeId: string };

/** Where a send also goes to phones, or null for a send that is email alone. */
export function pushTargetOf(include: readonly string[], mode: "notice" | "grid"): PushTarget | null {
  if (mode !== "notice" || include.length !== 1) return null;
  const tag = parseTag(include[0]);
  if (tag?.kind === "group") return { kind: "group", groupId: tag.groupId };
  if (tag?.kind === "programme" && (tag.part === "everyone" || tag.part === "holding")) {
    return { kind: "programme", roundId: tag.roundId, programmeId: tag.programmeId };
  }
  return null;
}

/** Where a group's notification opens: the group's page, as the group email's did. */
export function groupPushPath(runId: string, groupId: string): string {
  return `/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}`;
}

/** Where a programme's notification opens: the run's home, as the cohort email's did. */
export function runPushPath(runId: string): string {
  return `/learn/${encodeURIComponent(runId)}`;
}

/** Where a programme's notification opens when its programme names no run: the person's programmes. */
export const NO_RUN_PUSH_PATH = "/learn";

/**
 * A programme's notification's title: the course's title, else the run's
 * label, as the cohort email's was; else `fallback` (the programme's name).
 */
export function runPushTitle(run: { courseTitle: unknown; label: unknown } | null, fallback: string): string {
  const words = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return words(run?.courseTitle) || words(run?.label) || fallback;
}
