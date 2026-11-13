import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  COURSE_AUDIT_COLLECTION,
  LEAD_ONLY_AUDIT_KINDS,
  LEAD_ONLY_REASON_KINDS,
  courseAuditCategory,
  courseAuditKindLabel,
  normalizeCourseAudit,
  type CourseAuditCategory,
  type CourseAuditValue,
} from "@/lib/firestore/courseAudit";
import { approvedCorrectionForReaders } from "@/lib/courses/excused/words";
import { londonDayLabel } from "@/lib/courses/londonLabels";

/**
 * ONE GROUP'S HISTORY: who changed its time, room, link and people, when,
 * what it was before, why, and how many were emailed, newest first, for the
 * group's History tab. Logged from the day this shipped; the register finishes logged
 * before then show too.
 *
 * READ WITH THE INDEX THAT EXISTS, `courseAudit (runId, at desc)`: the run's
 * rows newest first, narrowed to the group in code. A run holds a few hundred
 * rows, so the newest `RUN_ROWS_READ` of them are read and the group's
 * newest `GROUP_ROWS_SHOWN` kept; `more` says when the group had more than
 * were shown, or when the run's rows ran past what was read, so a page can
 * say the list is the newest part. No new index: one by group can come when
 * a run's history outgrows this.
 *
 * SERVER ONLY, AND FOR STAFF. `courseAudit` is shut to every browser; the
 * page that calls this decides who may read a group's history (its
 * facilitators, the programme's lead, admins). A row names its actor and,
 * for a row about one person, that person in its sentence; `subjectUid` is
 * handed over for staff pages to link, never for a member's.
 */

/** How many of the run's newest rows are read. */
export const RUN_ROWS_READ = 1000;
/** How many of the group's rows are kept, newest first. */
export const GROUP_ROWS_SHOWN = 200;

export type GroupHistoryRow = {
  id: string;
  /** The stored kind, as written: a kind this build does not know is kept and labelled as unrecognised. */
  kind: string;
  /** "Session moved for one week", or "Unrecognised action". */
  label: string;
  /** The filter it sits under: time and room, people, link, registers, or other. */
  category: CourseAuditCategory;
  /** Who did it, by the name the row kept. */
  actorName: string;
  /** When, as an instant, or null when the row has no time or is read by its day alone (`day`). */
  at: string | null;
  /** "Tue 10 Nov": the day alone, for a row whose time of day is not the reader's to see. */
  day?: string;
  /** The row's one sentence. */
  detail: string;
  weekId: string | null;
  before: Record<string, CourseAuditValue> | null;
  after: Record<string, CourseAuditValue> | null;
  reason: string | null;
  emailed: number | null;
  /** The person a row about one person is about; for staff pages only. */
  subjectUid: string | null;
};

/**
 * A row's sentence without its "Reason: ..." part, the reason the row was
 * written with (`tookDetail`, `gaveDetail`). The sentence is otherwise as
 * stored.
 */
function withoutReason(detail: string, reason: string | null): string {
  if (!reason) return detail;
  return detail.replace(` Reason: ${reason}`, "").replace(`Reason: ${reason}`, "").trim();
}

/**
 * WHETHER A ROW IS THE ONE AN APPROVED REQUEST TO BE EXCUSED WROTE when it
 * corrected a finished register: a line's correction (`attendance-edit`)
 * that came from a request and carries no reason. A correction somebody
 * asked for always carries the asker's reason; the approval's row never does
 * (`writeLineCorrection`).
 */
function isApprovalRow(row: { kind: string; requestId: string | null; reason: string | null }): boolean {
  return row.kind === "attendance-edit" && row.requestId !== null && row.reason === null;
}

/** "w03" or "w03-2", as its week and occurrence, or null. */
function sessionOfKey(key: string | null): { weekNumber: number; occurrence: number } | null {
  const match = key ? /^w(\d{2})(?:-(\d))?$/.exec(key) : null;
  return match ? { weekNumber: Number(match[1]), occurrence: match[2] ? Number(match[2]) : 1 } : null;
}

/**
 * `isAdmin`: who approved a request to be excused, and who was emailed about
 * it, are an admin's to read, as on the register itself. To anybody else the
 * row an approval wrote says that an approved request changed the line, and
 * carries its day and never its time of day; it names nobody: no actor, no
 * sentence naming the admin or the people emailed, and none of the row's
 * stored values about who set the line before. It keeps its place in the
 * list, and the row as stored is unchanged.
 *
 * `facilitatorRecord`: true only for a page drawn for an admin or somebody
 * leading the programme who does not facilitate the group. Left out, the
 * rows about whether a facilitator was at a session are dropped
 * (`LEAD_ONLY_AUDIT_KINDS`), and a cover's reason is left out of the rows
 * about taking a register or giving a session (`LEAD_ONLY_REASON_KINDS`):
 * both are sent to nobody else.
 */
export async function loadGroupHistory(
  db: Firestore,
  runId: string,
  groupId: string,
  options: { facilitatorRecord?: boolean; isAdmin?: boolean } = {},
): Promise<{ rows: GroupHistoryRow[]; more: boolean }> {
  if (!runId || !groupId) return { rows: [], more: false };
  const snap = await db
    .collection(COURSE_AUDIT_COLLECTION)
    .where("runId", "==", runId)
    .orderBy("at", "desc")
    .limit(RUN_ROWS_READ)
    .get();
  const rows: GroupHistoryRow[] = [];
  let more = snap.docs.length >= RUN_ROWS_READ;
  for (const doc of snap.docs) {
    const row = normalizeCourseAudit(doc.id, doc.data() ?? {});
    if (row.groupId !== groupId || row.runId !== runId) continue;
    if (!options.facilitatorRecord && (LEAD_ONLY_AUDIT_KINDS as readonly string[]).includes(row.kind)) continue;
    if (rows.length >= GROUP_ROWS_SHOWN) {
      more = true;
      break;
    }
    // An approval's correction, to anybody but an admin: what changed and
    // the day, naming nobody.
    if (!options.isAdmin && isApprovalRow(row)) {
      const session = sessionOfKey(row.sessionKey);
      rows.push({
        id: row.id,
        kind: row.kind,
        label: courseAuditKindLabel(row.kind),
        category: courseAuditCategory(row.kind),
        actorName: "",
        // The day, never the time of day, as on the register itself.
        at: null,
        ...(row.at ? { day: londonDayLabel(row.at) } : {}),
        detail: approvedCorrectionForReaders({ weekNumber: session?.weekNumber ?? null, occurrence: session?.occurrence ?? 1 }),
        weekId: row.weekId,
        before: null,
        after: row.after,
        reason: null,
        emailed: null,
        subjectUid: null,
      });
      continue;
    }
    // Why a facilitator's register was taken, or their session given, goes
    // with the record of who was there: the row stays, its reason does not.
    const reasonKept = options.facilitatorRecord || !(LEAD_ONLY_REASON_KINDS as readonly string[]).includes(row.kind);
    rows.push({
      id: row.id,
      kind: row.kind,
      label: courseAuditKindLabel(row.kind),
      category: courseAuditCategory(row.kind),
      actorName: row.actorName,
      at: row.at ? row.at.toISOString() : null,
      detail: reasonKept ? row.detail : withoutReason(row.detail, row.reason),
      weekId: row.weekId,
      before: row.before,
      after: row.after,
      reason: reasonKept ? row.reason : null,
      emailed: row.emailed,
      subjectUid: row.subjectUid,
    });
  }
  return { rows, more };
}
