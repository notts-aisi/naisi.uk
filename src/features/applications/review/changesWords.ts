import type { ChangesSummary } from "@/lib/applications/review/types";

/**
 * The words the review screens use for an application that changed after it
 * was first sent.
 *
 * No board draws these: they were added when earlier versions began to be
 * kept. They are here, in one place, so that the two screens say it the same
 * way and the words can be read and changed without reading a component.
 * Pure, so the tests execute them.
 */

/**
 * The line under the applicant's name: "Changed 2 times since it was first
 * sent. Last changed Sat 17 Oct."
 *
 * "Last changed" and not "last sent": pressing Send again with nothing
 * different is not a change, and the day here is the day the application of
 * record became what it is now. When versions have been dropped at the cap,
 * the line says how many can no longer be opened.
 */
export function changesLine(changes: Pick<ChangesSummary, "count" | "lastOn" | "dropped">): string {
  const times = changes.count === 1 ? "1 time" : `${changes.count} times`;
  const parts = [`Changed ${times} since it was first sent.`];
  if (changes.lastOn) parts.push(`Last changed ${changes.lastOn}.`);
  if (changes.dropped > 0) {
    parts.push(
      `${changes.dropped} earlier ${changes.dropped === 1 ? "version is" : "versions are"} no longer kept.`,
    );
  }
  return parts.join(" ");
}

/**
 * Said when something changed and no part of the screen has anything earlier
 * to open: the change was to an answer reviewers are not shown.
 */
export const NOTHING_SHOWN = "What changed isn’t shown on this screen.";

/** What the control that opens earlier versions is called, under an answer or a card. */
export const WHAT_IT_SAID_BEFORE = "What it said before";

/** The same control under the applicant's name, for the ranking and facilitating. */
export const WHAT_THEY_CHOSE_BEFORE = "What they chose before";

/** The mark on a row of the list: "Changed Wed 14 Oct". */
export function changedMark(changedOn: string | null): string {
  return changedOn ? `Changed ${changedOn}` : "Changed";
}
