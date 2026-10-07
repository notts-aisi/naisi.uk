import { FIELD_LIMITS } from "@/lib/firestore/users";

/**
 * WHAT THE PROFILE'S SAVE WRITES ABOUT A MEMBER'S DEGREE AND GRADUATION.
 *
 * A member can correct both on their own profile. When they change either
 * from one answer to another, the same write adds an entry saying what it
 * said before (`StudyChange` in src/lib/firestore/users.ts), so that an admin
 * opening that person's page can see the earlier answer.
 *
 * That decision is one plain function here, with no import that runs only in
 * a browser, for two reasons:
 *
 *  - THE RULE IS THE OTHER HALF. The users rule in firestore.rules refuses a
 *    member's own write that changes either field without the entry, that
 *    adds one when nothing changed, or whose entry does not say exactly what
 *    the document held. A write assembled in the form and a rule written
 *    beside it would be two descriptions of one thing, free to drift. So the
 *    rules suite (scripts/rules-tests/tests/users-profile-self-edit.test.mjs)
 *    RUNS THIS FUNCTION and sends what it returns, and the form sends the
 *    same.
 *  - `npm test` has no browser, and what is written in each case is worth
 *    reading as a table (tests/profile-study-changes.test.mjs).
 *
 * WHAT COUNTS AS A CHANGE. The rule says this in its own language and the two
 * have to agree exactly:
 *
 *  - An answer is text with something in it. A field that is missing or empty
 *    holds no answer, and filling it leaves no entry.
 *  - The degree is `profile.subject`, or the older `profile.course` on an
 *    account that never stored a subject, which is how the admin's page reads
 *    it. So the first degree typed over an older account's `course` is a
 *    change, noted with what `course` said.
 *  - An account still waiting to be approved is not noted. Its answers are
 *    its join request, which registration sends whole.
 *
 * Spaces at either end of what is typed are not a change: the degree is
 * written only when it differs from the stored one by more than that.
 */

/** Text with something in it. The rule's own test for "this field held an answer". */
function answer(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "";
}

/**
 * What an entry's key may be: letters and digits, forty at most. The rule
 * holds the key to the same pattern, because the key is the one part of an
 * entry the browser chooses.
 */
export const STUDY_CHANGE_ID = /^[A-Za-z0-9]{1,40}$/;

const ID_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A new key for an entry: twenty letters and digits, never used before on this document. */
export function newStudyChangeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let id = "";
  for (const byte of bytes) id += ID_LETTERS[byte % ID_LETTERS.length];
  return id;
}

/** What the member is told when their document already holds as many entries as it may. */
export const STUDY_CHANGES_FULL =
  `You have changed what you study or when you finish ${FIELD_LIMITS.maxStudyChanges} times, ` +
  "which is as many as this page can save. Email ai-safety@uonsu.com and an admin will change it for you.";

export type StudyWriteInput = {
  /** The account's role as the document stores it. */
  role: string;
  /** The stored `profile`, as the document holds it. Three fields of it are read. */
  stored: { subject?: unknown; course?: unknown; expectedGraduation?: unknown } | null | undefined;
  /** What is in the degree box. */
  subject: string;
  /**
   * The month in the graduation control ("2027-06", or "" for none), or null
   * for an account that is not asked for one, which then writes nothing.
   */
  expectedGraduation: string | null;
  /** How many entries the document holds already. */
  noted: number;
  /** A key for the entry, used only if one is written. See `newStudyChangeId`. */
  entryId: string;
  /** What stands for "the server's time" in this write: `serverTimestamp()` in the browser. */
  serverTime: unknown;
};

export type StudyWrite =
  | {
      ok: true;
      /** Dotted paths to merge into the save's one `updateDoc`. Empty when nothing changed. */
      patch: Record<string, unknown>;
      /** Whether the patch carries an entry. */
      noted: boolean;
    }
  | {
      /** The document holds as many entries as it may, so this change cannot be saved here. */
      ok: false;
      reason: "full";
    };

/**
 * The part of the profile's save that is about the degree and the graduation:
 * each field only when it changed, and one entry when a change replaced an
 * answer.
 *
 * It never refuses for what was typed. Whether a degree may be emptied is the
 * form's question, asked before this is called.
 */
export function studyWrite(input: StudyWriteInput): StudyWrite {
  if (!STUDY_CHANGE_ID.test(input.entryId)) {
    throw new Error("An entry's key has to be letters and digits, forty at most.");
  }
  const stored = input.stored ?? {};
  const patch: Record<string, unknown> = {};

  const subject = input.subject.trim();
  const storedSubject = typeof stored.subject === "string" ? stored.subject : "";
  if (subject !== storedSubject.trim()) patch["profile.subject"] = subject;

  // Compared with what is stored exactly as it is stored, so a control still
  // showing a value it was handed never writes that value back.
  const graduation = input.expectedGraduation;
  if (graduation !== null && graduation !== (stored.expectedGraduation ?? "")) {
    patch["profile.expectedGraduation"] = graduation;
  }

  // The degree before and after, read the way the rule reads it.
  const degreeBefore = answer(stored.subject) || answer(stored.course);
  const degreeAfter =
    "profile.subject" in patch ? subject || answer(stored.course) : degreeBefore;
  const degreeMoves = degreeBefore !== "" && degreeAfter !== degreeBefore;

  const graduationBefore = answer(stored.expectedGraduation);
  const graduationMoves = graduationBefore !== "" && "profile.expectedGraduation" in patch;

  const owed = input.role !== "pending" && (degreeMoves || graduationMoves);
  if (!owed) return { ok: true, patch, noted: false };
  if (input.noted >= FIELD_LIMITS.maxStudyChanges) return { ok: false, reason: "full" };

  patch[`studyChanges.${input.entryId}`] = {
    at: input.serverTime,
    ...(degreeMoves ? { subject: degreeBefore } : {}),
    ...(graduationMoves ? { expectedGraduation: graduationBefore } : {}),
  };
  return { ok: true, patch, noted: true };
}
