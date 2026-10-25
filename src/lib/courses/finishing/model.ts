/**
 * WHO FINISHED A PROGRAMME: the finished record (board en-finish, Q8).
 *
 * Once a programme's last session is over, the site suggests who finished
 * from their attendance, and the programme's lead decides. Three things make
 * a person's record, and every reader asks them in one place
 * (`src/lib/courses/finishing/record.ts`), so the lead's list, the member's
 * own pages and the header can never disagree:
 *
 *  - THE RULE, a setting of the run: the least number of sessions a person
 *    must have come to, of the sessions their group held. There is no
 *    default. The programme's lead or an admin sets it on the programme's
 *    Settings tab, and nobody else is ever shown the number.
 *  - THE SUGGESTION, worked out each time it is asked from the rule and the
 *    run's registers ("came" is the Attendance tab's own count: present,
 *    late and left early). Never stored, so a register corrected after the
 *    end is counted at once. With no rule there is no suggestion, and nobody
 *    is ticked.
 *  - THE LEAD'S DECISION, stored only where the lead (or an admin) disagreed
 *    with the suggestion: a person ticked who came to fewer, or unticked who
 *    came to enough. Putting a switch back to what the suggestion says
 *    removes the decision, and the person follows the suggestion again.
 *
 * A person's record is finished or not, who decided ("lead" for a stored
 * decision, "suggestion" otherwise, nobody while there is neither), and when
 * (the decision's own time; for a suggestion, the later of the last session's
 * end and the time the rule was set). Somebody who left the programme has no
 * finished record at all: they are listed as having left, never as not
 * finished.
 *
 * ## The one collection: `courseFinishing`
 *
 * Written only by the two routes under
 * `/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing`, read
 * only on the server, and refused to every browser by `firestore.rules`. Two
 * kinds of document, each telling which it is by `kind`, and each carrying
 * every part of its id as a field:
 *
 *  - `courseFinishing/{runId}`: the run's rule. `{ kind: "rule", runId,
 *    atLeast, setAt }`. Deleted when the rule is cleared.
 *  - `courseFinishing/{runId}__{uid}`: the lead's decision about one person.
 *    `{ kind: "person", runId, uid, finished, byUid, at }`, `byUid` being who
 *    pressed the switch (null once that account is deleted).
 *
 * Every document goes with the run when it is destroyed (`runId`), and a
 * person's decision goes with their account (`uid`).
 *
 * Pure: no reads, no writes, nothing server-only, so a page's client code may
 * import the types and the parsers from here.
 */

// Relative, as the teams model's is: suites that load course modules with a
// loader that follows relative imports only can reach it.
import { isAddressableId } from "../../addressableId";

export const FINISHING_COLLECTION = "courseFinishing";

/** Bounds of the stored values. Field limits, not settings of any term. */
export const FINISH_LIMITS = {
  /** A run's plan holds at most 60 entries, so nobody can come to more sessions than that. */
  maxAtLeast: 60,
  /** A uid in a request body: well above any account id. */
  uid: 128,
} as const;

/** The run's rule document: its id is the run's own. CONSTRUCT-ONLY. */
export function finishRuleId(runId: string): string {
  return runId;
}

/**
 * One person's decision document. CONSTRUCT-ONLY, NEVER PARSE: run ids made
 * by `slugId` already contain `__`, so every part is stored as a field and a
 * reader checks those fields, never the id.
 */
export function finishDecisionId(runId: string, uid: string): string {
  return `${runId}__${uid}`;
}

/** The run's rule: come to at least `atLeast` of the sessions your group held. */
export type FinishRule = {
  runId: string;
  atLeast: number;
  /** When it was last set: a suggestion made under it is dated no earlier. */
  setAt: Date | null;
};

/** The lead's decision about one person, where it differs from the suggestion. */
export type FinishDecision = {
  runId: string;
  uid: string;
  finished: boolean;
  /** Who pressed the switch, or null once that account is gone. */
  byUid: string | null;
  at: Date | null;
};

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const holder = value as { toDate?: () => Date } | null;
  if (holder && typeof holder.toDate === "function") {
    const date = holder.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

/** A whole number of sessions a rule may ask for, or null for anything else. */
export function atLeastIn(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= FINISH_LIMITS.maxAtLeast
    ? value
    : null;
}

/**
 * A stored rule, or null for a document that is not one: another kind, a run
 * id that is not the document's own, or a number no rule can be.
 */
export function normalizeFinishRule(id: string, data: Record<string, unknown> | undefined): FinishRule | null {
  if (!data || data.kind !== "rule") return null;
  if (typeof data.runId !== "string" || data.runId !== id) return null;
  const atLeast = atLeastIn(data.atLeast);
  if (atLeast === null) return null;
  return { runId: data.runId, atLeast, setAt: asDate(data.setAt) };
}

/**
 * A stored decision, or null for a document that is not one. The id is not
 * parsed: the run and the person are read from their own fields and must
 * build the id they were read from.
 */
export function normalizeFinishDecision(
  id: string,
  data: Record<string, unknown> | undefined,
): FinishDecision | null {
  if (!data || data.kind !== "person") return null;
  const { runId, uid } = data;
  if (typeof runId !== "string" || typeof uid !== "string" || !runId || !uid) return null;
  if (finishDecisionId(runId, uid) !== id) return null;
  if (typeof data.finished !== "boolean") return null;
  return {
    runId,
    uid,
    finished: data.finished,
    byUid: typeof data.byUid === "string" && data.byUid ? data.byUid : null,
    at: asDate(data.at),
  };
}

// ---------------------------------------------------------------------------
// The two bodies the routes take, checked before anything is read
// ---------------------------------------------------------------------------

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** `{ atLeast }`: a whole number from 1 to 60, or null to clear the rule. */
export function parseFinishRule(raw: unknown): Parsed<{ atLeast: number | null }> {
  if (!isRecord(raw) || !("atLeast" in raw)) {
    return { ok: false, error: "Say how many sessions somebody has to have come to, or send null to clear it." };
  }
  if (raw.atLeast === null) return { ok: true, value: { atLeast: null } };
  const atLeast = atLeastIn(raw.atLeast);
  if (atLeast === null) {
    return {
      ok: false,
      error: `The number of sessions has to be a whole number from 1 to ${FINISH_LIMITS.maxAtLeast}.`,
    };
  }
  return { ok: true, value: { atLeast } };
}

/** `{ uid, finished }`: whose switch, and which way it now points. */
export function parseFinishDecision(raw: unknown): Parsed<{ uid: string; finished: boolean }> {
  if (!isRecord(raw)) return { ok: false, error: "Say whose switch this is and whether they finished." };
  const { uid, finished } = raw;
  if (typeof uid !== "string" || !uid || uid.length > FINISH_LIMITS.uid || !isAddressableId(uid) || uid.includes("__")) {
    return { ok: false, error: "Say whose switch this is." };
  }
  if (typeof finished !== "boolean") {
    return { ok: false, error: "Say whether they finished: true or false." };
  }
  return { ok: true, value: { uid, finished } };
}
