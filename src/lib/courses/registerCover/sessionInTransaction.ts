import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * THE SESSION A REGISTER'S WRITE IS ABOUT, worked out from the group as it
 * is INSIDE the write's own transaction.
 *
 * A register keeps the instant its session started (`sessionAt`), and that
 * instant is worked out from the group's slot, that week's override and the
 * group's own plan (`resolveSessions`). A route that read the group before
 * its transaction could store the OLD start for a register marked at the
 * moment the group's weeks are re-dated (a one-week change, a new regular
 * time, a push back), and the register would then sit under a session at
 * another time. Reading the group here puts both writes in one order: the
 * change's transaction reads the register, this one reads the group, so
 * whichever commits second sees what the first wrote.
 *
 * Every route that stores `sessionAt` on a register while it changes the
 * register asks this, never a group it read before: the register's marks,
 * taking or giving a session, and the facilitator record.
 * `tests/course-register-cover.test.mjs` holds the three to it.
 *
 * Reads only. A transaction reads before it writes, so a caller asks this
 * before its first `tx.set`.
 */
export type SessionInTransaction =
  | {
      ok: true;
      group: CourseGroupDoc;
      session: ResolvedSession;
      startsAt: Date | null;
      endsAt: Date | null;
    }
  | {
      ok: false;
      /** `gone`: the group or the session is no longer there; `cancelled`: the session was called off. */
      reason: "gone" | "cancelled";
      /** The session's civil date when it was called off, for the sentence that says so. */
      dateKey: string;
    };

export async function sessionInTransaction(
  tx: Transaction,
  db: Firestore,
  run: CourseRunDoc,
  groupId: string,
  target: { weekNumber: number; occurrence: number },
): Promise<SessionInTransaction> {
  const snap = await tx.get(db.collection("courseGroups").doc(groupId));
  if (!snap.exists) return { ok: false, reason: "gone", dateKey: "" };
  const group = normalizeCourseGroup(snap.id, snap.data() ?? {});
  if (group.runId !== run.id) return { ok: false, reason: "gone", dateKey: "" };
  const session = resolveSessions(run, group).find(
    (each) => each.weekNumber === target.weekNumber && each.occurrence === target.occurrence,
  );
  if (!session) return { ok: false, reason: "gone", dateKey: "" };
  if (session.cancelled) return { ok: false, reason: "cancelled", dateKey: session.dateKey };
  const { startsAt, endsAt } = sessionInstants(session);
  return { ok: true, group, session, startsAt, endsAt };
}
