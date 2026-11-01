import { noteSourcesOf, sourceUidsOf, sourcesWithout, type NoteSource } from "@/lib/memberNotes/model";

/**
 * `courseNoteDrafts/{runId}__{weekId}__{uid}`: Claude's draft of an
 * end-of-week note about one person, from one week of one run, waiting for an
 * admin on the week's Notes page (privacy v15, "AI-assisted review": "Once a
 * week Claude may also draft a short note on how each person is doing").
 *
 * WHAT CLAUDE RETURNS IS AN ADMIN'S, AND STAYS WITH THE RUN. The policy says
 * what comes back "is seen by admins only", "is kept with what it was about
 * (the application, or the programme's run) and deleted with it", and that
 * nothing of it is filed on anybody's profile "except a note an admin has
 * read, edited and saved". So a draft is read only by the week's notes page
 * and routes after a door that admits an admin, and by the two deletions;
 * `tests/claude-output-readers.test.mjs` walks the tree and fails any other
 * reader, and any reader in the notes kept about a person. Saving makes a
 * note through the notes' own store (`memberNotes`, with `draftedByClaude`,
 * its week and what it was built from) and deletes the draft in the same
 * transaction; Discard deletes it; drafting again replaces it.
 *
 * THE FIELDS:
 *  - `runId`, `weekId`, `weekNumber`, `uid` (whom it is about);
 *  - `text`: Claude's words AS RETURNED, its labels kept ("the fellow",
 *    "Rater 1"); the page puts names back as it draws the box, so no name
 *    is kept here;
 *  - `builtFrom`: everything that was sent, item for item
 *    (`NoteSource`, `src/lib/memberNotes/model.ts`), with `raters` saying
 *    which account each "Rater N" stands for;
 *  - `sourceUids`: every account `builtFrom` names, so an account's deletion
 *    finds the drafts it gave a rating or feedback to by one
 *    `array-contains` and takes its entries out;
 *  - `fingerprint`: a hash of the message, so the page can say the week has
 *    changed since;
 *  - `model`, `at`, `askedByUid`: which model answered, when, and whose
 *    press asked.
 *
 * WRITTEN AND READ ONLY ON THE SERVER: `firestore.rules` refuses every
 * browser, admins included.
 *
 * Pure, and safe anywhere: the tests and the deletions read it.
 */

export const COURSE_NOTE_DRAFTS_COLLECTION = "courseNoteDrafts";

/** One draft per person per week of a run. CONSTRUCT-ONLY: the run, the week and the person are also fields. */
export function noteDraftId(runId: string, weekId: string, uid: string): string {
  return `${runId}__${weekId}__${uid}`;
}

/** A stored draft, read. */
export type CourseNoteDraftDoc = {
  id: string;
  runId: string;
  weekId: string;
  weekNumber: number;
  uid: string;
  text: string;
  builtFrom: NoteSource[];
  /** "Rater 1" to the account it stands for. */
  raters: Record<string, string>;
  fingerprint: string;
  model: string;
  at: Date | null;
  askedByUid: string;
};

type Raw = Record<string, unknown>;

function instant(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** "Rater N" to an account, kept to labels of that shape with an account behind them. */
function ratersOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Raw).filter((entry): entry is [string, string] => /^Rater \d+$/.test(entry[0]) && typeof entry[1] === "string" && entry[1] !== ""),
  );
}

/** A stored draft, read. Never throws. */
export function normalizeNoteDraft(id: string, data: Raw): CourseNoteDraftDoc {
  return {
    id,
    runId: str(data.runId),
    weekId: str(data.weekId),
    weekNumber: typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) && data.weekNumber > 0 ? data.weekNumber : 0,
    uid: str(data.uid),
    text: str(data.text),
    builtFrom: noteSourcesOf(data.builtFrom),
    raters: ratersOf(data.raters),
    fingerprint: str(data.fingerprint),
    model: str(data.model),
    at: instant(data.at),
    askedByUid: str(data.askedByUid),
  };
}

/** The fields a draft is written with, from what was sent and what came back. */
export function noteDraftFields(input: {
  runId: string;
  weekId: string;
  weekNumber: number;
  uid: string;
  text: string;
  builtFrom: readonly NoteSource[];
  raters: Readonly<Record<string, string>>;
  fingerprint: string;
  model: string;
  at: Date;
  askedByUid: string;
}): Raw {
  return {
    runId: input.runId,
    weekId: input.weekId,
    weekNumber: input.weekNumber,
    uid: input.uid,
    text: input.text,
    builtFrom: [...input.builtFrom],
    raters: { ...input.raters },
    sourceUids: sourceUidsOf(input.builtFrom),
    fingerprint: input.fingerprint,
    model: input.model,
    at: input.at,
    askedByUid: input.askedByUid,
  };
}

/**
 * What an account's deletion writes to a draft that names it as a feedback
 * writer or a rater: its entries out of `builtFrom`, and out of `raters`.
 * Claude's words keep the label, which then reads "a rater".
 */
export function noteDraftWithout(data: Raw, uid: string): Raw {
  const raters = ratersOf(data.raters);
  return {
    builtFrom: sourcesWithout(noteSourcesOf(data.builtFrom), uid),
    raters: Object.fromEntries(Object.entries(raters).filter(([, value]) => value !== uid)),
  };
}
