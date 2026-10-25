import type { ComposerAudience } from "@/features/courses/updates/UpdateComposer";
import type { StaffUpdate } from "@/features/courses/updates/UpdatesList";
import type { UpdateAudienceCount } from "./audience";
import type { UpdateView } from "./readers";
import {
  audienceOptionLabel,
  emailedWords,
  notYetToldWords,
  staffMetaWords,
  toWordsForStaff,
  UNNAMED_GROUP,
} from "./words";

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
    notYetTold: notYetToldWords(
      count.notYetTold,
      count.to === "group" ? `in ${count.groupName ?? UNNAMED_GROUP}` : "in groups",
    ),
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

/** How many updates the Overview shows, newest first, as wk-overview draws them. The rest are on the Messages tab. */
export const OVERVIEW_UPDATES_SHOWN = 2;

/** One row of the Overview's Updates card: its title, who wrote it, and the staff list's line. */
export type OverviewUpdate = { id: string; title: string; author: string; authorUid: string; meta: string };

/** The Overview's Updates card: the newest few, worded as the Messages tab words them. */
export function overviewUpdateRows(updates: readonly UpdateView[]): OverviewUpdate[] {
  return updates.slice(0, OVERVIEW_UPDATES_SHOWN).map((update) => ({
    id: update.id,
    title: update.title,
    author: update.authorName,
    authorUid: update.authorUid,
    meta: staffMetaWords(
      update.authorFirst,
      toWordsForStaff(update.to, update.groupName),
      update.postedOn,
      emailedWords(update.email),
    ),
  }));
}
