import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { parseTag } from "@/lib/audience/tags";
import type { SessionUser } from "@/lib/firebase/session";
import { postTargetsOf, type PostTarget } from "./posting";
import { messagesHrefFor } from "./words";
import { messageWriterOf } from "./writers";

/**
 * WHERE A RUN'S OLD COMPOSERS HAND OVER TO MESSAGES, for one person.
 *
 * A run's home links to two composers on the run's own pages: "Email the
 * group" (`/learn/[runId]/group/[groupId]/email`) for a group's facilitator,
 * and "Email the whole cohort" (`/learn/[runId]/email`) for the people who
 * staff the run. Messages does both now, so each link opens Messages set to
 * that audience: a group's tag, or the programme's people holding a place
 * (the cohort those composers wrote to), with "Also post it on the
 * programme's page" offered as it is for any of them.
 *
 * ONLY WHERE MESSAGES WOULD START WITH IT FOR THIS PERSON: the programme is
 * the term's, its run is the one the programme names, and the person writes
 * to that tag in Messages (`postTargetsOf`, the list `?for=` is held to, so
 * a link never opens an empty composer). Anywhere else, the link keeps its
 * old page until those pages go: a run of an earlier term, a group whose run
 * has not been published, and somebody who staffs the run without leading
 * its programme (a track lead or a run facilitator), whom Messages does not
 * offer the programme's people.
 */

/** Messages' address for the run's cohort, and for each group by id, where Messages would start with it. */
export type MessagesEntries = { cohort: string | null; groups: Record<string, string> };

export const NO_ENTRIES: MessagesEntries = { cohort: null, groups: {} };

/** The entries for one run, out of the tags a writer could also post on a programme's page. Pure. */
export function entriesOf(targets: readonly PostTarget[], runId: string): MessagesEntries {
  let cohort: string | null = null;
  const groups: Record<string, string> = {};
  for (const target of targets) {
    if (target.runId !== runId) continue;
    const tag = parseTag(target.tagId);
    if (tag?.kind === "programme" && tag.part === "holding") cohort = messagesHrefFor(target.tagId);
    if (tag?.kind === "group") groups[tag.groupId] = messagesHrefFor(target.tagId);
  }
  return { cohort, groups };
}

/** The entries for one run and one person: nothing for somebody who writes nothing in Messages. */
export async function messagesEntriesFor(db: Firestore, user: SessionUser, runId: string, now: Date): Promise<MessagesEntries> {
  const writer = await messageWriterOf(db, user, now);
  return writer ? entriesOf(postTargetsOf(writer), runId) : NO_ENTRIES;
}
