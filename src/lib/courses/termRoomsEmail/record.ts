import "server-only";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { londonDayAndClock } from "@/lib/courses/londonLabels";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";

/**
 * THE RECORD OF A GROUP'S LAST ROOMS EMAIL: `courseNudges/termrooms__<groupId>`,
 * in the collection `firestore.rules` shuts to every browser as server-side
 * email bookkeeping. Written by the press (`./send.ts`) in the transaction
 * that claims its limits and writes its History row: the press's key (so the
 * same press again sends nothing), when, the History row's id, and how many
 * it was for and how many went. Beside those, the last press that reached
 * anybody (`emailedAt`, `emailedAuditId`), which is what the page shows, and
 * the one before this press (`priorEmailed...`): a press none of whose sends
 * went puts that back, so the page never says a group was emailed when it
 * was not. It names nobody: who pressed is on the History row, which keeps
 * it as every row keeps its actor. The run's destroy drains it with the
 * run's other markers (`runId`).
 */

export const TERM_ROOMS_RECORD_KIND = "term-rooms-emailed";

/** The record's document id, for a group. */
export function termRoomsRecordId(groupId: string): string {
  return `termrooms__${groupId}`;
}

/** When a group's rooms were last emailed and by whom, as the term's rooms page says it; null for never. */
export type LastEmailed = { when: string; byName: string } | null;

function dateOf(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/**
 * When each group's rooms were last emailed and by whom: one record a group by
 * id, then the History row each names, by id. 2 x G documents at most.
 */
export async function readLastEmailed(db: Firestore, groupIds: readonly string[]): Promise<Record<string, LastEmailed>> {
  const out: Record<string, LastEmailed> = {};
  if (groupIds.length === 0) return out;
  const records = await db.getAll(...groupIds.map((id) => db.collection("courseNudges").doc(termRoomsRecordId(id))));
  const found: Array<{ groupId: string; at: Date; auditId: string }> = [];
  groupIds.forEach((groupId, index) => {
    out[groupId] = null;
    const snap = records[index];
    const data = snap?.exists ? (snap.data() ?? {}) : null;
    const at = data && data.kind === TERM_ROOMS_RECORD_KIND ? dateOf(data.emailedAt) : null;
    if (data && at) found.push({ groupId, at, auditId: typeof data.emailedAuditId === "string" ? data.emailedAuditId : "" });
  });
  const withRow = found.filter((each) => each.auditId);
  const rows = withRow.length > 0 ? await db.getAll(...withRow.map((each) => db.collection(COURSE_AUDIT_COLLECTION).doc(each.auditId))) : [];
  const nameOf = new Map(
    rows.map((snap, index) => {
      const name = snap.exists ? (snap.data() ?? {}).actorName : "";
      return [withRow[index].groupId, typeof name === "string" ? name.trim() : ""] as const;
    }),
  );
  for (const each of found) out[each.groupId] = { when: londonDayAndClock(each.at), byName: nameOf.get(each.groupId) ?? "" };
  return out;
}
