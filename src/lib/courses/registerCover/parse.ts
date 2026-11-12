import { couldBeFollowed } from "@/lib/courses/followable";
import { reasonTooLongWords } from "@/lib/courses/sessionChange/words";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { COVER_REFUSAL } from "./words";

/**
 * THE COVER ROUTE'S BODY, checked before anything is read:
 *
 *   { weekNumber, occurrence?, person?, reason?, tell?, emailCount?, preview? }
 *
 * `person` missing is "I'm covering it"; a uid is "Someone else is covering".
 * The reason is optional and held to a change's rules (one line, 200
 * characters, nothing followable: it goes into the group's history). `tell`
 * is the optional notice to the group, and `emailCount` the number on its
 * tick, checked again at the press. Unknown keys are refused.
 */
export type CoverPress = {
  weekNumber: number;
  occurrence: number;
  person: string | null;
  reason: string;
  tell: boolean;
  emailCount: number;
  preview: boolean;
};

const FIELDS = new Set(["weekNumber", "occurrence", "person", "reason", "tell", "emailCount", "preview"]);

const MAX_WEEK_NUMBER = 60;
const MAX_OCCURRENCE = 4;

/** An optional true-or-false: missing is false; anything else is refused. */
function flag(value: unknown): boolean | null {
  if (value === undefined) return false;
  return typeof value === "boolean" ? value : null;
}

export function parseCoverPress(raw: unknown): { ok: true; value: CoverPress } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: COVER_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !FIELDS.has(key))) return { ok: false, error: COVER_REFUSAL.body };

  const weekNumber = body.weekNumber;
  if (typeof weekNumber !== "number" || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return { ok: false, error: COVER_REFUSAL.week };
  }
  const occurrence = body.occurrence === undefined || body.occurrence === null ? 1 : body.occurrence;
  if (typeof occurrence !== "number" || !Number.isInteger(occurrence) || occurrence < 1 || occurrence > MAX_OCCURRENCE) {
    return { ok: false, error: COVER_REFUSAL.week };
  }

  let person: string | null = null;
  if (body.person !== undefined && body.person !== null) {
    if (typeof body.person !== "string" || !body.person || body.person.length > 128 || body.person.includes("/")) {
      return { ok: false, error: COVER_REFUSAL.person };
    }
    person = body.person;
  }

  if (body.reason !== undefined && typeof body.reason !== "string") return { ok: false, error: COVER_REFUSAL.reason };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (/[\r\n]/.test(reason)) return { ok: false, error: COVER_REFUSAL.reasonLine };
  if (reason.length > GROUP_FIELD_LIMITS.changeReason) return { ok: false, error: reasonTooLongWords(GROUP_FIELD_LIMITS.changeReason) };
  if (couldBeFollowed(reason)) return { ok: false, error: COVER_REFUSAL.reasonLink };

  const tell = flag(body.tell);
  const preview = flag(body.preview);
  if (tell === null || preview === null) return { ok: false, error: COVER_REFUSAL.flag };
  if (tell && person === null) return { ok: false, error: COVER_REFUSAL.tellSelf };

  let emailCount = 0;
  if (tell && !preview) {
    const count = body.emailCount;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return { ok: false, error: COVER_REFUSAL.emailCount };
    emailCount = count;
  }

  return { ok: true, value: { weekNumber, occurrence, person, reason, tell, emailCount, preview } };
}
