import {
  ENROLMENT_LIMITS,
  isSessionKey,
  orderedSessionKeys,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import type { GroupCampus } from "../campus";
import { ANSWER_REFUSAL, SOME_WEEKS_REFUSAL, tooLongWords } from "./words";

/**
 * "CAN YOU MAKE THIS TIME MOST WEEKS?", the parts every reader and writer
 * share. Pure, so the routes, the pages and the tests ask the same functions.
 *
 * The answer is kept on the person's own seat (`courseEnrolments.timeAnswer`,
 * whose type says what it holds and who reads it). The person writes it
 * through `src/lib/courses/timeAnswer/seat.ts`; staff read a `cant` as
 * `mostWeeks` through `./someWeeks.ts`; the ticket's "Can't make it" keeps a
 * `mostWeeks` answer's list of sessions in step.
 */

/**
 * An answer as a reader shows it: what was said, never the group id or when.
 * `yes` and `cant` are exactly as they were before the third answer, so an
 * answer stored before it reads the same everywhere.
 */
export type TimeAnswerView =
  | {
      kind: "yes" | "cant";
      /** Why the time does not work, for `cant`; null for `yes`. */
      reason: string | null;
      /** Which other times would, for `cant`; null for `yes`. */
      alternatives: string | null;
    }
  | {
      kind: "mostWeeks";
      /** Their own words, when staff read a `cant` as most weeks; null otherwise. */
      reason: string | null;
      alternatives: string | null;
      /** The sessions they can't make, by register key ("w03"), in the group's order. */
      sessionKeys: string[];
    };

/** One of the group's sessions still to come, as the card lists it. */
export type TimeQuestionSession = {
  /** The register's key: "w03", or "w03-2" for a week's second session. */
  sessionKey: string;
  weekNumber: number;
  /** "Tue 17 Nov". */
  day: string;
  /** They have told us they can't make it, and its register still records them as excused on their word. */
  told: boolean;
};

/**
 * The card on the programme page (`timeQuestionFor` in `./seat.ts`): the
 * group, when it meets, its campus, their answer so far, and the group's
 * sessions still to come that they could say they can't make.
 */
export type TimeQuestionView = {
  groupId: string;
  /** "Group B", or "" when the record names none. */
  groupName: string;
  /** "Tuesdays, 6pm to 8pm" (`sessionWhenLabel`), or "" while the group has no time. */
  when: string;
  campus: GroupCampus | null;
  /** What they have said about this group, or null before they answer. */
  answer: TimeAnswerView | null;
  /** Soonest first; empty while the group has none to come that can be named. */
  sessions: TimeQuestionSession[];
};

/** A stored answer as a reader shows it. */
function viewOf(answer: NonNullable<CourseEnrolmentDoc["timeAnswer"]>): TimeAnswerView {
  return answer.kind === "mostWeeks"
    ? { kind: "mostWeeks", reason: answer.reason, alternatives: answer.alternatives, sessionKeys: [...answer.sessionKeys] }
    : { kind: answer.kind, reason: answer.reason, alternatives: answer.alternatives };
}

/**
 * THE STALE-ANSWER RULE: the seat's answer, while it is about the group the
 * seat is in now, on a learner's seat that is still taking part. Null
 * otherwise, so an answer about a group they were moved out of, or kept on a
 * seat that has left, can never show. Every reader of the answer asks this.
 */
export function currentTimeAnswer(
  seat: Pick<CourseEnrolmentDoc, "role" | "status" | "groupId" | "timeAnswer">,
): TimeAnswerView | null {
  const answer = seat.timeAnswer;
  if (!answer) return null;
  if (seat.role !== "learner" || seat.status !== "active") return null;
  if (!seat.groupId || answer.forGroupId !== seat.groupId) return null;
  return viewOf(answer);
}

/** Whether an answer says they can make the group's time: yes, or most weeks. Nobody moves them for it. */
export function canMakeTheTime(answer: Pick<TimeAnswerView, "kind"> | null | undefined): boolean {
  return answer?.kind === "yes" || answer?.kind === "mostWeeks";
}

/** The week a session key names: "w03" and "w03-2" are both week 3. */
export function weekOfSessionKey(key: string): number {
  return Number(key.slice(1).split("-")[0]);
}

/** A whole answer, as the route's body carries it once read. */
export type TimeAnswerRequest =
  | {
      /** The group the page showed when it was answered. */
      groupId: string;
      kind: "yes" | "cant";
      reason: string | null;
      alternatives: string | null;
    }
  | {
      groupId: string;
      kind: "mostWeeks";
      /** The sessions they ticked, once each, in the group's order. */
      sessionKeys: string[];
    };

/** One path segment, so a document is never handed a path. */
const isSegment = (id: string): boolean =>
  id.length > 0 && id.length <= 200 && !id.includes("/") && id !== "." && id !== "..";

/**
 * A list of sessions in a body: an array of session keys, at most
 * `ENROLMENT_LIMITS.timeAnswerSessions` of them; none is a list. Null when it
 * is not one.
 */
function sessionKeysOf(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > ENROLMENT_LIMITS.timeAnswerSessions) return null;
  if (!value.every(isSessionKey)) return null;
  return orderedSessionKeys(value);
}

/**
 * The route's body: `{ groupId, kind: "yes" | "mostWeeks" | "cant", ... }`.
 * With `cant`, why this time does not work and which other times would are
 * both required, trimmed, and within their limits (`ENROLMENT_LIMITS`). With
 * `mostWeeks`, `sessionKeys` is the list of the group's sessions they ticked
 * (none is allowed). With `yes`, anything else sent is dropped. Checked
 * before any document is read.
 */
export function parseTimeAnswer(
  raw: unknown,
): { ok: true; value: TimeAnswerRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: ANSWER_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  if (body.kind !== "yes" && body.kind !== "cant" && body.kind !== "mostWeeks") return { ok: false, error: ANSWER_REFUSAL.kind };
  if (typeof body.groupId !== "string" || !isSegment(body.groupId)) return { ok: false, error: ANSWER_REFUSAL.group };
  if (body.kind === "yes") {
    return { ok: true, value: { groupId: body.groupId, kind: "yes", reason: null, alternatives: null } };
  }
  if (body.kind === "mostWeeks") {
    const sessionKeys = sessionKeysOf(body.sessionKeys);
    if (!sessionKeys) return { ok: false, error: ANSWER_REFUSAL.sessions };
    return { ok: true, value: { groupId: body.groupId, kind: "mostWeeks", sessionKeys } };
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const alternatives = typeof body.alternatives === "string" ? body.alternatives.trim() : "";
  if (!reason) return { ok: false, error: ANSWER_REFUSAL.reasonMissing };
  if (reason.length > ENROLMENT_LIMITS.timeAnswerReason) {
    return { ok: false, error: tooLongWords("reason", ENROLMENT_LIMITS.timeAnswerReason) };
  }
  if (!alternatives) return { ok: false, error: ANSWER_REFUSAL.alternativesMissing };
  if (alternatives.length > ENROLMENT_LIMITS.timeAnswerAlternatives) {
    return { ok: false, error: tooLongWords("alternatives", ENROLMENT_LIMITS.timeAnswerAlternatives) };
  }
  return { ok: true, value: { groupId: body.groupId, kind: "cant", reason, alternatives } };
}

/**
 * "They meant some weeks": the staff route's body, `{ sessionKeys }`, the
 * group's sessions the person said they can't make (none is allowed: the
 * week they meant may be over). Checked before any document is read.
 */
export function parseSomeWeeks(raw: unknown): { ok: true; value: { sessionKeys: string[] } } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: SOME_WEEKS_REFUSAL.body };
  const sessionKeys = sessionKeysOf((raw as Record<string, unknown>).sessionKeys);
  if (!sessionKeys) return { ok: false, error: SOME_WEEKS_REFUSAL.sessions };
  return { ok: true, value: { sessionKeys } };
}
