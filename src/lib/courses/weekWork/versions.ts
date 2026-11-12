/**
 * A PIECE OF WORK AND ITS EARLIER VERSIONS: which words the people who read
 * somebody's work read, and when the words a change replaces are kept.
 *
 * A PIECE is one row of the week's answers store: a written answer, a
 * reflection box or a fill-in box. Its latest words are the row's own (`text`,
 * or `boxes` for an answer in labelled boxes). Its EARLIER VERSIONS are an
 * optional list on the same row (`earlierVersions`), oldest first, written by
 * the save that changes the words in the same transaction. A row with no list
 * has one version: its latest.
 *
 * EACH VERSION IS KNOWN BY ITS LAST SAVE (`savedAt`, the row's `updatedAt`
 * while those words stood). A save that changes nothing writes nothing, so
 * the mark stays exact, and feedback and ratings point at a version by it
 * (`aboutSavedAt` on the piece of feedback or the rating).
 *
 * WHEN A VERSION IS KEPT (`versionOwed`): only at the FIRST change after one
 * of these lines, holding the words as they stood before that change:
 *  - `session`: the session the person is due at that week started (the
 *    version as it stood at the session);
 *  - `sent`: a written answer was sent and that session has not started (the
 *    version as last sent, which its readers go on reading until it is sent
 *    again);
 *  - `feedback`: somebody gave feedback on it or rated it (the version the
 *    feedback or the rating was about: the person's `courseWeekWork` record
 *    carries the mark of the version last reviewed, so a save asks no query).
 * One change that crosses several lines keeps one version with every reason.
 *
 * THE CAP: at most `MAX_EARLIER_VERSIONS` versions, and at most
 * `MAX_EARLIER_VERSION_CHARS` characters across them, so the row stays far
 * inside a document's size. At the cap the oldest kept version that is not
 * the one at the session gives way (the version at the session is what late
 * is told against); feedback that pointed at a version that gave way reads
 * as about an earlier version no longer kept (`versionAbout` answers null).
 *
 * WHICH WORDS ARE READ (`readableAnswer`, privacy v17, "Changing your work"):
 *  - a reflection or a fill-in box: its latest words, as they are typed;
 *  - a written answer, before the session the person is due at starts, or
 *    with no such session: only words they have SENT, as last sent. Never
 *    sent, it is not read at all (its readers see only that it is started);
 *  - a written answer once that session has started: its latest words, sent
 *    or not.
 *
 * Pure: no reads, no clock. The pages in the browser import it.
 */

export const VERSION_REASONS = ["session", "sent", "feedback"] as const;
export type VersionReason = (typeof VERSION_REASONS)[number];

/** The most earlier versions a piece keeps. */
export const MAX_EARLIER_VERSIONS = 12;

/**
 * The most characters the earlier versions of one piece hold between them:
 * three times the most one written answer holds, so even at four bytes a
 * character the list stays under half of a document's 1 MiB.
 */
export const MAX_EARLIER_VERSION_CHARS = 120_000;

/** One version's words: a box of text, or an answer in labelled boxes; `words` counts a written answer (0 for a box). */
export type PieceWords = {
  text: string;
  boxes: Record<string, string> | null;
  words: number;
};

/** One earlier version, as kept on the row. */
export type EarlierVersion = PieceWords & {
  /** When these words were last saved: the version's mark, which feedback and ratings point at. */
  savedAt: Date;
  /** When the change that replaced them was saved. */
  replacedAt: Date;
  /** When these words were last sent (a written answer), or null. */
  sentAt: Date | null;
  reasons: VersionReason[];
};

/** What the rules read of a piece's row. */
export type PieceFacts = PieceWords & {
  /** The row's `updatedAt`: when its latest words were saved. */
  savedAt: Date | null;
  /** A written answer's first send, stored once (`firstSentAt`); null otherwise. */
  firstSentAt: Date | null;
  /** A written answer's latest send (`sentAt`); null for an answer sent only by the week's old Submit, or never. */
  sentAt: Date | null;
  earlierVersions: EarlierVersion[];
};

/** A version as a reader is handed it. */
export type ReadVersion = PieceWords & {
  /** Its mark (when these words were last saved), or null for a row that never stored one. */
  savedAt: Date | null;
  /** When these words were last sent, for a written answer, or null. */
  sentAt: Date | null;
  /** The piece's latest words. */
  latest: boolean;
};

function instant(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function boxesOf(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [id, words] of Object.entries(value as Record<string, unknown>)) if (typeof words === "string") out[id] = words;
  return out;
}

/** A row's stored list of earlier versions, read, oldest first. Never throws; an entry it cannot read is left out. */
export function readEarlierVersions(value: unknown): EarlierVersion[] {
  if (!Array.isArray(value)) return [];
  const out: EarlierVersion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const savedAt = instant(entry.savedAt);
    const replacedAt = instant(entry.replacedAt);
    if (!savedAt || !replacedAt) continue;
    const boxes = boxesOf(entry.boxes);
    out.push({
      text: boxes ? "" : typeof entry.text === "string" ? entry.text : "",
      boxes,
      words: typeof entry.words === "number" && Number.isFinite(entry.words) && entry.words >= 0 ? Math.floor(entry.words) : 0,
      savedAt,
      replacedAt,
      sentAt: instant(entry.sentAt),
      reasons: Array.isArray(entry.reasons)
        ? VERSION_REASONS.filter((reason) => (entry.reasons as unknown[]).includes(reason))
        : [],
    });
  }
  return out.sort((a, b) => a.replacedAt.getTime() - b.replacedAt.getTime());
}

/**
 * A row of the answers store as these rules read it: a written answer, a
 * reflection box or a fill-in box. Never throws.
 */
export function readPieceFacts(data: Record<string, unknown>): PieceFacts {
  const boxes = boxesOf(data.boxes);
  return {
    text: boxes ? "" : typeof data.text === "string" ? data.text : "",
    boxes,
    words: typeof data.words === "number" && Number.isFinite(data.words) && data.words >= 0 ? Math.floor(data.words) : 0,
    savedAt: instant(data.updatedAt),
    firstSentAt: instant(data.firstSentAt),
    sentAt: instant(data.sentAt),
    earlierVersions: readEarlierVersions(data.earlierVersions),
  };
}

/** One earlier version as it is stored: only the fields its kind has. */
export function storedEarlierVersion(version: EarlierVersion): Record<string, unknown> {
  return {
    ...(version.boxes ? { boxes: version.boxes } : { text: version.text }),
    words: version.words,
    savedAt: version.savedAt,
    replacedAt: version.replacedAt,
    sentAt: version.sentAt,
    reasons: [...version.reasons],
  };
}

/** When a written answer was last sent: its latest send, or its first for one sent only by the week's old Submit. */
export function lastSentAt(piece: Pick<PieceFacts, "firstSentAt" | "sentAt">): Date | null {
  return piece.sentAt ?? piece.firstSentAt;
}

/** Whether two versions hold the same words. */
export function sameWords(a: PieceWords, b: PieceWords): boolean {
  if (a.boxes || b.boxes) return JSON.stringify(a.boxes ?? {}) === JSON.stringify(b.boxes ?? {});
  return a.text === b.text;
}

/**
 * THE LINES A CHANGE AT `now` CROSSES: what an earlier version is kept for,
 * or nothing. `dueAt` is the start of the session the person is due at that
 * week (null with none); `reviewedSavedAt` the mark of the version feedback
 * or a rating was last about (from their `courseWeekWork` record), or null.
 * Only a piece with words saved before has anything to keep.
 */
export function versionOwed(input: {
  prior: PieceFacts | null;
  dueAt: Date | null;
  reviewedSavedAt: Date | null;
  now: Date;
}): VersionReason[] {
  const { prior, dueAt, reviewedSavedAt, now } = input;
  if (!prior || !prior.savedAt) return [];
  // Nothing written is nothing to keep.
  if (!prior.text.trim() && !Object.values(prior.boxes ?? {}).some((words) => words.trim())) return [];
  const saved = prior.savedAt.getTime();
  const started = dueAt !== null && now.getTime() >= dueAt.getTime();
  const reasons: VersionReason[] = [];
  // The first change after the session started: the version as it stood then.
  if (started && saved < (dueAt as Date).getTime()) reasons.push("session");
  // The first change after a send, before the session: the version as last sent.
  const sent = lastSentAt(prior);
  if (!started && sent !== null && saved <= sent.getTime()) reasons.push("sent");
  // The first change after feedback or a rating on these very words.
  if (reviewedSavedAt !== null && reviewedSavedAt.getTime() >= saved) reasons.push("feedback");
  return reasons;
}

/** The version a change replaces, kept for `reasons`, replaced at `now`. */
export function earlierVersionOf(prior: PieceFacts, reasons: readonly VersionReason[], now: Date): EarlierVersion {
  const sent = lastSentAt(prior);
  return {
    text: prior.boxes ? "" : prior.text,
    boxes: prior.boxes,
    words: prior.words,
    savedAt: prior.savedAt ?? now,
    replacedAt: now,
    // Sent only when the send came after these words were saved.
    sentAt: sent !== null && prior.savedAt !== null && sent.getTime() >= prior.savedAt.getTime() ? sent : null,
    reasons: [...reasons],
  };
}

function charsOf(version: PieceWords): number {
  return version.boxes ? Object.values(version.boxes).reduce((sum, words) => sum + words.length, 0) : version.text.length;
}

/**
 * The list with `entry` added at its end, held to the cap: while it is over
 * either bound, the oldest version that is not the one at the session gives
 * way (and, should every one be, the oldest).
 */
export function withEarlierVersion(list: readonly EarlierVersion[], entry: EarlierVersion): EarlierVersion[] {
  const out = [...list, entry];
  const over = () => out.length > MAX_EARLIER_VERSIONS || out.reduce((sum, version) => sum + charsOf(version), 0) > MAX_EARLIER_VERSION_CHARS;
  while (out.length > 1 && over()) {
    const goes = out.findIndex((version, index) => index < out.length - 1 && !version.reasons.includes("session"));
    out.splice(goes === -1 ? 0 : goes, 1);
  }
  return out;
}

function latestOf(piece: PieceFacts): ReadVersion {
  const sent = lastSentAt(piece);
  return {
    text: piece.boxes ? "" : piece.text,
    boxes: piece.boxes,
    words: piece.words,
    savedAt: piece.savedAt,
    sentAt: sent !== null && (piece.savedAt === null || sent.getTime() >= piece.savedAt.getTime()) ? sent : null,
    latest: true,
  };
}

function readOf(version: EarlierVersion): ReadVersion {
  return { text: version.text, boxes: version.boxes, words: version.words, savedAt: version.savedAt, sentAt: version.sentAt, latest: false };
}

/** Whether the session at `dueAt` has started by `now`; never, with no session. */
export function sessionStartedAt(dueAt: Date | null, now: Date): boolean {
  return dueAt !== null && now.getTime() >= dueAt.getTime();
}

/**
 * THE ONE ANSWER TO WHICH OF A WRITTEN ANSWER'S WORDS ITS READERS MAY READ
 * (privacy v17, "Changing your work": "A written answer is yours until you
 * send it ... Once the session it's due at has started, they may read what
 * you've written so far, sent or not"). Null while they may read none of it:
 * they see only that it is started. Every reader of somebody else's written
 * answer asks it (`tests/course-written-answer-readers.test.mjs`).
 *
 *  - Once the session the person is due at has started: the latest words.
 *  - Before it, or with no such session: the words as LAST SENT. A send keeps
 *    them current; the first change after it keeps them as an earlier
 *    version (`sent`), which is read until the answer is sent again. An
 *    answer sent and changed before earlier versions were kept has no such
 *    version, and its latest words are read, as they always were.
 *  - Never sent, before the session: nothing.
 */
export function readableAnswer(piece: PieceFacts | null, dueAt: Date | null, now: Date): ReadVersion | null {
  if (!piece) return null;
  if (sessionStartedAt(dueAt, now)) return latestOf(piece);
  const sent = lastSentAt(piece);
  if (sent === null) return null;
  // The newest version kept as sent, when it was replaced after the last send: the words as last sent.
  const keptAsSent = [...piece.earlierVersions].reverse().find((version) => version.reasons.includes("sent")) ?? null;
  if (keptAsSent && keptAsSent.replacedAt.getTime() > sent.getTime()) return readOf(keptAsSent);
  return latestOf(piece);
}

/**
 * The version of a piece that stood when the session at `dueAt` started, or
 * null: no session, not started yet, the piece written only after it, or
 * that version no longer kept.
 */
export function versionAtSession(piece: PieceFacts | null, dueAt: Date | null, now: Date): ReadVersion | null {
  if (!piece || !sessionStartedAt(dueAt, now)) return null;
  const at = (dueAt as Date).getTime();
  const standing = piece.earlierVersions.find((version) => version.replacedAt.getTime() > at) ?? null;
  if (!standing) return piece.savedAt !== null && piece.savedAt.getTime() <= at ? latestOf(piece) : null;
  return standing.savedAt.getTime() <= at ? readOf(standing) : null;
}

/**
 * The version a piece of feedback or a rating was about: the one whose mark
 * is `pointer`; with no pointer (saved before pointers were kept), the one
 * that stood at `fallback`, its time. Null when that version is no longer
 * kept.
 */
export function versionAbout(piece: PieceFacts | null, pointer: Date | null, fallback: Date | null): ReadVersion | null {
  if (!piece) return null;
  if (pointer) {
    const mark = pointer.getTime();
    if (piece.savedAt && piece.savedAt.getTime() === mark) return latestOf(piece);
    const kept = piece.earlierVersions.find((version) => version.savedAt.getTime() === mark);
    return kept ? readOf(kept) : null;
  }
  if (!fallback) return latestOf(piece);
  const at = fallback.getTime();
  const standing = piece.earlierVersions.find((version) => version.replacedAt.getTime() > at) ?? null;
  if (standing) return standing.savedAt.getTime() <= at ? readOf(standing) : null;
  return piece.savedAt === null || piece.savedAt.getTime() <= at ? latestOf(piece) : null;
}
