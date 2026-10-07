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
 *  - The degree is what `degreeOf` below says it is: `profile.subject`, or
 *    the older `profile.course` on an account with no subject. Every page
 *    reads it through that one function. So the first degree typed over an
 *    older account's `course` is a change, noted with what `course` said.
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
 * WHAT SOMEBODY'S DEGREE IS: the newer `subject` where it holds an answer,
 * otherwise the older `course` where that does, otherwise nothing ("").
 *
 * THIS IS THE ONE READING OF IT. The users rule in firestore.rules decides
 * whether a member's own save changed their degree by reading the two fields
 * exactly this way (`degreeOf` there), and a change it sees has to carry its
 * entry. A page that read them another way could show a degree the rule
 * never saw change. So every page that shows somebody's degree, searches by
 * it or fills a box with it calls this function, and nothing else in `src`
 * reads `course`.
 *
 * Text only. A stored value that is not text is no answer to the rule, so it
 * is none here and is never shown.
 *
 * `tests/profile-study-changes.test.mjs` lists every file that reads the
 * older field or calls this, and the rules suite puts one table of stored
 * profiles through this function and through the rule.
 */
export function degreeOf(
  profile: { subject?: unknown; course?: unknown } | null | undefined,
): string {
  return answer(profile?.subject) || answer(profile?.course);
}

/**
 * What an entry's key may be: letters and digits, forty at most. The rule
 * holds the key to the same pattern, because the key is the one part of an
 * entry the browser chooses.
 */
export const STUDY_CHANGE_ID = /^[A-Za-z0-9]{1,40}$/;

/**
 * A new key for an entry: twenty letters and digits, never used before on this
 * document. Ten random bytes, each written as its two hexadecimal digits, so
 * every byte becomes exactly two characters and no key is likelier than
 * another. (Folding a byte onto a longer alphabet with a remainder would
 * favour its first few letters.)
 */
export function newStudyChangeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let id = "";
  for (const byte of bytes) id += byte.toString(16).padStart(2, "0");
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

  // The degree before and after, each read the one way: the stored profile,
  // and the stored profile with what is typed in place of its subject.
  const degreeBefore = degreeOf(stored);
  const degreeAfter = "profile.subject" in patch ? degreeOf({ ...stored, subject }) : degreeBefore;
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
