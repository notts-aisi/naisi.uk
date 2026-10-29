import {
  ENROLMENT_LIMITS,
  type CourseEnrolmentDoc,
  type TimeAnswerKind,
} from "@/lib/firestore/courseEnrolments";
import type { GroupCampus } from "../campus";
import { ANSWER_REFUSAL, tooLongWords } from "./words";

/**
 * "CAN YOU MAKE THIS TIME?", the parts every reader and the one writer share.
 * Pure, so the route, the pages and the tests ask the same functions.
 *
 * The answer is kept on the person's own seat (`courseEnrolments.timeAnswer`,
 * whose type says what it holds and who reads it). Its one writer is
 * `src/lib/courses/timeAnswer/seat.ts`.
 */

/** An answer as a reader shows it: what was said, never the group id or when. */
export type TimeAnswerView = {
  kind: TimeAnswerKind;
  /** Why the time does not work, for `cant`; null for `yes`. */
  reason: string | null;
  /** Which other times would, for `cant`; null for `yes`. */
  alternatives: string | null;
};

/**
 * The card on the programme page (`timeQuestionFor` in `./seat.ts`): the
 * group, when it meets, its campus, and their answer so far.
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
};

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
  return { kind: answer.kind, reason: answer.reason, alternatives: answer.alternatives };
}

/** A whole answer, as the route's body carries it once read. */
export type TimeAnswerRequest = {
  /** The group the page showed when it was answered. */
  groupId: string;
  kind: TimeAnswerKind;
  reason: string | null;
  alternatives: string | null;
};

/** One path segment, so a document is never handed a path. */
const isSegment = (id: string): boolean =>
  id.length > 0 && id.length <= 200 && !id.includes("/") && id !== "." && id !== "..";

/**
 * The route's body: `{ groupId, kind: "yes" | "cant", reason?, alternatives? }`.
 * With `cant`, why this time does not work and which other times would are
 * both required, trimmed, and within their limits (`ENROLMENT_LIMITS`). With
 * `yes`, anything else sent is dropped. Checked before any document is read.
 */
export function parseTimeAnswer(
  raw: unknown,
): { ok: true; value: TimeAnswerRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: ANSWER_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  if (body.kind !== "yes" && body.kind !== "cant") return { ok: false, error: ANSWER_REFUSAL.kind };
  if (typeof body.groupId !== "string" || !isSegment(body.groupId)) return { ok: false, error: ANSWER_REFUSAL.group };
  if (body.kind === "yes") {
    return { ok: true, value: { groupId: body.groupId, kind: "yes", reason: null, alternatives: null } };
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
