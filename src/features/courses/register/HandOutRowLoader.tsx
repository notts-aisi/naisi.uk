import { slipsTonightFrom } from "@/lib/courses/drawCard/reads";
import { drawGate, readDrawRoster, type DrawWeeks } from "@/lib/courses/packsAndCases/readers";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import HandOutRow from "./HandOutRow";

/**
 * THE REGISTER'S ROW TO THE PATHWAYS AND CASES PAGE, READ ON ITS OWN: an
 * async server component the register's page hands the register inside a
 * `Suspense` with nothing to show while it waits, so the register is drawn
 * and sent without it and the row arrives after, or never.
 *
 * Mounted only on an evening that can be a hand-out evening, which the page
 * found from the course's weeks (`dates`, read once, beside the register's
 * own reads). Here: the pathways and cases page's own gate (`drawGate`,
 * never the register's, so a run's track lead and somebody covering one
 * session are not offered it), the people in that page's draw
 * (`readDrawRoster`, the same people the group page's card counts), and the
 * draw of the rule's weeks (`slipsTonightFrom`). Shown only while somebody
 * has not got theirs, and only on the register the address names no session
 * of or names the hand-out session. A read that fails, or a reader the gate
 * refuses, draws nothing.
 */
export default async function HandOutRowLoader({
  user,
  group,
  runId,
  dates,
  session,
  now,
}: {
  user: SessionUser;
  group: CourseGroupDoc;
  runId: string;
  dates: DrawWeeks;
  /** The session the register's address names, or null. */
  session: string | null;
  now: Date;
}) {
  const slips = await slipsToShow({ user, group, runId, dates, session, now });
  if (!slips) return null;
  return <HandOutRow groupId={group.id} weekNumber={slips.weekNumber} draw={slips.draw} />;
}

/**
 * The row's reads, kept apart from the row they feed: a read that fails
 * answers null and the register goes on without the row. The row itself is
 * built outside the `try`, because a `try` round a piece of markup catches
 * nothing that goes wrong when that markup is drawn.
 */
async function slipsToShow({
  user,
  group,
  runId,
  dates,
  session,
  now,
}: {
  user: SessionUser;
  group: CourseGroupDoc;
  runId: string;
  dates: DrawWeeks;
  session: string | null;
  now: Date;
}): Promise<Awaited<ReturnType<typeof slipsTonightFrom>>> {
  try {
    const db = getAdminDb();
    if (!db) return null;
    const gate = await drawGate(db, user, group);
    if (!gate.ok) return null;
    const roster = await readDrawRoster(db, runId, group, { isAdmin: gate.isAdmin }, now);
    if (!roster) return null;
    const slips = await slipsTonightFrom(db, { runId, dates, people: roster.people, now });
    if (!slips || (session !== null && session !== slips.handOut.session.sessionKey)) return null;
    return slips;
  } catch (err) {
    console.error("[register page] the pathways and cases row's read failed", group.id, err);
    return null;
  }
}
