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
  /** When, as an instant, or null when the row has no time. */
  at: string | null;
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
  options: { facilitatorRecord?: boolean } = {},
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
