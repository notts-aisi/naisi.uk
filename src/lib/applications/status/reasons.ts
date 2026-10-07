import {
  APPLICATION_LIMITS,
  RELEASE_REASON_KINDS,
  type ReleaseReason,
  type ReleaseReasonKind,
} from "../model";
import { standingOf, type Answerable } from "./standing";

/**
 * WHY SOMEBODY DID NOT TAKE A PLACE.
 *
 * Somebody who says "I can’t make it" (to a place) or "No thanks" (to an
 * invitation) is asked why, from a short list with "Other" and a few words of
 * their own. The reason is stored on their own application with the reply
 * (`releaseReason`) and the committee reads it, because the answer is often
 * something that can be put right: a time that does not work is a different
 * problem from a term that is too full.
 *
 * Everything about a reason is here, once: the options in the order they are
 * asked, their words, what a request may carry, and how the committee reads
 * the answer. The person answering and the people reading see the same words
 * for the same option.
 *
 * Pure, with no server import: the reply buttons, the reply route and the
 * staff screens all import it.
 */

/** The options, in the order they are asked. "Other" is last and asks for words. */
export const RELEASE_REASON_LABEL: Readonly<Record<ReleaseReasonKind, string>> = {
  times: "The times don’t work for me",
  "too-much-on": "I have too much on this term",
  "something-else": "I’m doing something else instead",
  other: "Other",
};

export const RELEASE_REASON_OPTIONS: readonly { kind: ReleaseReasonKind; label: string }[] =
  RELEASE_REASON_KINDS.map((kind) => ({ kind, label: RELEASE_REASON_LABEL[kind] }));

/** The most a person may write for "Other", in characters. */
export const RELEASE_REASON_OTHER_MAX = APPLICATION_LIMITS.releaseReasonOther;

/** The sentences a reason is refused with. Each says what to do. */
export const RELEASE_REASON_PROBLEMS = {
  none: "Choose a reason from the list before you send this.",
  otherEmpty: "Say why in a few words, or choose another reason.",
  otherTooLong: `Keep your reason to ${RELEASE_REASON_OTHER_MAX} characters or fewer.`,
} as const;

function isKind(v: unknown): v is ReleaseReasonKind {
  return typeof v === "string" && (RELEASE_REASON_KINDS as readonly string[]).includes(v);
}

export type ParsedReason = { ok: true; reason: ReleaseReason } | { ok: false; error: string };

/**
 * What a request, or the form before it sends, may carry as a reason.
 *
 * One of the four options is required. Words are required for "Other" and
 * only for "Other": for any other option whatever was typed is dropped, so a
 * stored reason never carries words its option did not ask for. Words are
 * trimmed, and refused when they run past the limit rather than cut, so
 * nobody's reason is stored shorter than they wrote it.
 */
export function parseReleaseReason(raw: unknown): ParsedReason {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (!isKind(given.kind)) return { ok: false, error: RELEASE_REASON_PROBLEMS.none };
  if (given.kind !== "other") return { ok: true, reason: { kind: given.kind, other: "" } };
  const other = typeof given.other === "string" ? given.other.trim() : "";
  if (!other) return { ok: false, error: RELEASE_REASON_PROBLEMS.otherEmpty };
  if (other.length > RELEASE_REASON_OTHER_MAX) {
    return { ok: false, error: RELEASE_REASON_PROBLEMS.otherTooLong };
  }
  return { ok: true, reason: { kind: "other", other } };
}

/**
 * A reason as the committee reads it: the option's own words, or for "Other"
 * what the person wrote. Null when there is none on record.
 */
export function reasonInWords(reason: ReleaseReason | null | undefined): string | null {
  if (!reason) return null;
  if (reason.kind === "other") return reason.other.trim() || null;
  return RELEASE_REASON_LABEL[reason.kind] ?? null;
}

/** The two buttons that give something back, in the words on them. */
export const SAID_CANT_MAKE_IT = "I can’t make it";
export const SAID_NO_THANKS = "No thanks";

/** What the committee is shown about a place or an invitation somebody gave back. */
export type GaveBack = {
  /** The button they pressed, in its own words. */
  said: typeof SAID_CANT_MAKE_IT | typeof SAID_NO_THANKS;
  /** Their reason, as the committee reads it. Null when none is on record. */
  reason: string | null;
};

/**
 * What one application says about a place or an invitation its owner gave
 * back, or null when they gave nothing back. Read off the person's own
 * document through `standingOf`, the reading their own page is drawn from.
 */
export function gaveBackOf(
  application: Answerable & { releaseReason?: ReleaseReason | null },
): GaveBack | null {
  const standing = standingOf(application);
  if (standing.kind !== "released") return null;
  return {
    said: standing.how === "no-thanks" ? SAID_NO_THANKS : SAID_CANT_MAKE_IT,
    reason: reasonInWords(application.releaseReason),
  };
}
