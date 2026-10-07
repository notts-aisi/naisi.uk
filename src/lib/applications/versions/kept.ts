import {
  SENT_HISTORY_LIMITS,
  type ApplicationContent,
  type ApplicationDoc,
  type SentVersion,
} from "../model";

/**
 * WHAT IS KEPT WHEN SOMEBODY SENDS AGAIN.
 *
 * `sent` is the application of record and is replaced whole on each send.
 * When the new one differs from the one it replaces, the one it replaces is
 * kept in `sentHistory` on the same document, so the people reviewing the
 * application can read what it said before. This module is the three rules
 * behind that:
 *
 *  - WHAT COUNTS AS A CHANGE (`sameContent`). Any difference in the content:
 *    an answer, About you, the ranking, facilitating, availability, the SU
 *    membership answer. It does not ask what a screen shows, because what is
 *    kept must not depend on how it is drawn. A send that changes nothing
 *    keeps nothing.
 *  - HOW MUCH IS KEPT (`keepVersion`). A document has a size limit, and the
 *    draft and the application of record have to fit beside the history. So
 *    the history is held to `SENT_HISTORY_LIMITS`, and beyond a limit the
 *    oldest version that is NOT THE FIRST goes, and is counted. The first
 *    version sent is never dropped.
 *  - HOW THE VERSIONS ARE READ (`versionsOf`). Oldest first, the current one
 *    last, each with the time it became the application of record.
 *
 * `sendApplication` (`applicant/store.ts`) is the one writer, inside the
 * transaction that replaces `sent`. The review screens are the readers.
 *
 * Pure, with no server import and no Firestore, so the same functions run in
 * the send, in a test and in the browser.
 */

/**
 * One value written out the same way however its maps were ordered. Two
 * contents are the same when this is the same for both.
 *
 * A map's keys are sorted, because a stored map comes back in the database's
 * order and a freshly built one in the form's. A list keeps its order,
 * because the order of a ranking is the ranking.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * True when two contents say the same thing in every part.
 *
 * Hand it two contents read the same way (both through `normaliseContent`):
 * a stored copy and a freshly built one can differ in shape without
 * differing in what they say, and that is not a change.
 */
export function sameContent(a: ApplicationContent, b: ApplicationContent): boolean {
  return canonical(a) === canonical(b);
}

/**
 * What a list of versions weighs: the bytes of its JSON. That counts a little
 * more than the database does (every key is quoted, every date is written
 * out), which is the safe side to be wrong on.
 */
export function weightOf(versions: readonly SentVersion[]): number {
  return new TextEncoder().encode(JSON.stringify(versions)).length;
}

export type KeptHistory = {
  /** The earlier versions kept, oldest first. */
  versions: SentVersion[];
  /** How many earlier versions are no longer kept. */
  dropped: number;
};

/**
 * The history after one more earlier version is added to it.
 *
 * `version` is the application of record a send is about to replace. It goes
 * on the end, and then the history is held to the limits: while there are
 * too many versions, or they weigh too much together, the oldest one that is
 * not the first is dropped and counted. The first is never dropped, so with
 * the first alone over the weight the history is the first, alone.
 */
export function keepVersion(
  history: { versions: readonly SentVersion[]; dropped: number },
  version: SentVersion,
  limits: { maxVersions: number; maxBytes: number } = SENT_HISTORY_LIMITS,
): KeptHistory {
  const versions = [...history.versions, version];
  let dropped = history.dropped;
  while (
    versions.length > 1 &&
    (versions.length > limits.maxVersions || weightOf(versions) > limits.maxBytes)
  ) {
    versions.splice(1, 1);
    dropped += 1;
  }
  return { versions, dropped };
}

/**
 * The parts of an application the history is read from. The three history
 * fields are optional here so that a caller holding less than a whole stored
 * application reads as one that has never changed.
 */
export type WithVersions = Pick<ApplicationDoc, "sent" | "sentAt"> &
  Partial<Pick<ApplicationDoc, "sentChangedAt" | "sentHistory" | "sentHistoryDropped">>;

/**
 * Every version of the application of record that is still held, oldest
 * first, with the current one last. Empty for an application never sent.
 *
 * The current version's time is when it BECAME the application of record
 * (`sentChangedAt`), not the last press of Send, which also moves when
 * nothing changed.
 */
export function versionsOf(application: WithVersions): SentVersion[] {
  if (!application.sent) return [];
  return [
    ...(application.sentHistory ?? []),
    { content: application.sent, sentAt: application.sentChangedAt ?? application.sentAt },
  ];
}

/**
 * How many times the application of record has changed since it was first
 * sent: the versions still kept, and the ones that no longer are.
 */
export function changeCount(application: WithVersions): number {
  if (!application.sent) return 0;
  return (application.sentHistory?.length ?? 0) + (application.sentHistoryDropped ?? 0);
}

/**
 * True when versions are missing between the first one kept and the next.
 * The cap only ever drops from there, so that is the one place the kept
 * versions are not consecutive, and the one place a reader cannot say
 * exactly when something changed.
 */
export function hasGap(application: WithVersions): boolean {
  return (application.sentHistoryDropped ?? 0) > 0;
}
