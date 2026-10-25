import type { ComposerAudience } from "@/features/courses/updates/UpdateComposer";
import type { StaffUpdate } from "@/features/courses/updates/UpdatesList";
import type { UpdateAudienceCount } from "./audience";
import type { UpdateView } from "./readers";
import { audienceOptionLabel, emailedWords, staffMetaWords, toWordsForStaff, UNNAMED_GROUP } from "./words";

/**
 * What a page hands the composer and the staff list: each a short list of
 * fields worked out on the server, so no stored document reaches a browser.
 */

/** The composer's To, in the order the counts came in: everyone, each group, the facilitators. */
export function composerAudiences(
  counts: readonly UpdateAudienceCount[],
  programmeName: string,
): ComposerAudience[] {
  return counts.map((count) => ({
    key: count.to === "group" ? `group:${count.groupId ?? ""}` : count.to,
    to: count.to,
    groupId: count.groupId,
    label: audienceOptionLabel(count.to, { programme: programmeName, group: count.groupName ?? UNNAMED_GROUP }, count.people),
    emails: count.emails,
    refused: count.refused,
  }));
}

/** A staff list's rows: "Rahul → Group B · Mon 16 Nov · Emailed to 7". */
export function staffUpdateRows(updates: readonly UpdateView[]): StaffUpdate[] {
  return updates.map((update) => ({
    id: update.id,
    title: update.title,
    message: update.message,
    meta: staffMetaWords(
      update.authorFirst,
      toWordsForStaff(update.to, update.groupName),
      update.postedOn,
      emailedWords(update.email),
    ),
  }));
}
