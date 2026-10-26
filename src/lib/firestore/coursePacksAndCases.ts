/**
 * `coursePacksAndCases/{runId}__{uid}__{blockId}`: what one person has in one
 * block of a week written as blocks (plan item 8; Q32 A; boards wk-cases,
 * wk-week, wk-week-phone, wk-week6-phone, wk-fac-group and wk-programme). One
 * document per person per block, and only two kinds of block keep one:
 *
 *  - A CHOOSE ONE (`kind: "pack"`): the pack the person has. Either they
 *    picked it themselves on the week page (week 6's career review, a Choose
 *    one whose `givenBy` is "fellow"), or a facilitator gave it out on paper
 *    at the end of the session before and typed the draw into the group page
 *    (week 3's pathway, `givenBy` "facilitator"). Only this pack counts
 *    towards the person's week (`src/lib/courses/weekBlocks/progress.ts`).
 *  - A TALK (`kind: "talk"`, a Cases block): the case a facilitator gave the
 *    person, when the talk has cases (week 3's case study), and "Ready for my
 *    talk", the person's own mark, which is all a talk with no cases keeps
 *    (week 6's pitch). The talk counts as done when they mark themselves
 *    ready. It is never a mark anybody gives: coursework gets no mark.
 *
 * THE IDS ARE THE WEEK'S OWN. `blockId` is the Choose one's or the Cases
 * block's id, and `packId` and `caseId` are ids inside it, all of which a
 * paste keeps (`src/lib/courses/weekBlocks/merge.ts`), so a record keeps
 * pointing at the same pack and case when a week is pasted again. A record
 * whose pack or case is no longer in its block is read as holding none.
 *
 * WHO READS IT (the readers are `src/lib/courses/packsAndCases/readers.ts`,
 * on the server, each after its own gate):
 *  - the person: their own, on their week page, their programme page and
 *    Home (the overview route);
 *  - the group's live facilitators, the programme's lead and admins: the
 *    draw (a given pack and a given case) for everybody in the group, on the
 *    group page's spread and the draw page. The draw is the group's logistics,
 *    handed out on paper in the room in front of everybody, so a facilitator
 *    who also takes part in the group is in it like anybody, and their
 *    co-facilitators type it in;
 *  - never another fellow. "Ready for my talk" and a pack the person picked
 *    themselves are their own coursework: no page shows them to anybody else.
 *
 * WHO WRITES IT: two routes on the Admin SDK, and nothing else. The person's
 * own route (`/api/courses/runs/[runId]/packs-and-cases/[blockId]`) picks a
 * pack until their session starts and marks a talk ready; the draw's route
 * (`/api/courses/groups/[groupId]/draw`) gives packs and cases out, for the
 * group's live facilitators, the programme's lead and admins.
 * `firestore.rules` refuses every browser, admins included.
 *
 * WHAT TAKES IT AWAY: deleting the person's account
 * (`src/lib/firestore/accountDeletion.ts`, by `uid`) and destroying the run
 * (`src/lib/firestore/courseDeletion.ts`, by `runId`). Leaving the programme
 * does not: the record stays for the lead and admins, and nothing shows it to
 * somebody who left.
 *
 * Pure, with no imports, so the pages in the browser can read the shape.
 */

export const COURSE_PACKS_AND_CASES_COLLECTION = "coursePacksAndCases";

/** Which kind of block the record is about. */
export type PackCaseKind = "pack" | "talk";

export type CoursePackCaseDoc = {
  /** `packCaseRecordId(runId, uid, blockId)`. */
  id: string;
  runId: string;
  uid: string;
  /** The week's doc id ("w03"), as the week page addresses it. */
  weekId: string;
  weekNumber: number;
  /** The Choose one's or the Cases block's id. */
  blockId: string;
  kind: PackCaseKind;
  /** A Choose one: the pack the person has, picked or given. Null for none. */
  packId: string | null;
  /** A talk with cases: the case given out. Null for none. */
  caseId: string | null;
  /** A talk: the person's own "Ready for my talk". */
  ready: boolean;
  readyAt: Date | null;
  /** When the pack or the case was last set. */
  givenAt: Date | null;
  updatedAt: Date | null;
};

/**
 * The record's id. Construct-only: built from the three parts and never
 * parsed, as `courseProgress`'s is, so nobody can spell a record that is not
 * the one these three name.
 */
export function packCaseRecordId(runId: string, uid: string, blockId: string): string {
  return `${runId}__${uid}__${blockId}`;
}

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function idOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * A stored record, or null for one that cannot say whose it is, which run
 * and which block it belongs to, or what kind it is. A null record is read
 * as holding nothing, which is the safe direction: nobody is shown a pack or
 * a case a row cannot place.
 */
export function normalizeCoursePackCase(id: string, data: Raw): CoursePackCaseDoc | null {
  const runId = typeof data.runId === "string" ? data.runId : "";
  const uid = typeof data.uid === "string" ? data.uid : "";
  const blockId = typeof data.blockId === "string" ? data.blockId : "";
  const kind = data.kind === "pack" || data.kind === "talk" ? data.kind : null;
  if (!runId || !uid || !blockId || !kind) return null;
  const weekNumber =
    typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) && data.weekNumber >= 1 ? data.weekNumber : 0;
  return {
    id,
    runId,
    uid,
    weekId: typeof data.weekId === "string" ? data.weekId : "",
    weekNumber,
    blockId,
    kind,
    packId: kind === "pack" ? idOrNull(data.packId) : null,
    caseId: kind === "talk" ? idOrNull(data.caseId) : null,
    ready: kind === "talk" && data.ready === true,
    readyAt: tsToDate(data.readyAt),
    givenAt: tsToDate(data.givenAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}
