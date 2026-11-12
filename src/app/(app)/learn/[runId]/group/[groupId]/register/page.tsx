import { redirect } from "next/navigation";
import RegisterPageBody, { sessionParamOf } from "@/features/courses/register/RegisterPageBody";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import { gateGroupRegister } from "@/lib/courses/registerAccess";
import { DIDNT_HAPPEN_MOVED_FACILITATOR } from "@/lib/courses/registerCover/pageWords";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A GROUP'S REGISTER, on a page of its own (the register
 * under a way back to its group). "Take the register" on the group page and
 * on Home, each register's "See it", and the email to somebody given one
 * session (`?session=w02`) lead here.
 *
 * The register itself is the one the group page used to hold
 * (`AttendanceGrid`): every tap saves, and the foot under it says how this
 * register ends. The page around it is `RegisterPageBody`, shared with the
 * register under the programme's group page.
 *
 * THE GATE is the register's own (`gateGroupRegister`), restated here
 * because a page's only protection must not be a level above it: a live
 * facilitator of THIS group, an admin, a run's track lead (and the
 * programme's lead, who reaches this page only when the run admits them some
 * other way: they take a register from the programme's group page), and
 * SOMEBODY GIVEN ONE SESSION, for the session the address names and while
 * the grant holds. Given that one session they see its register and nothing
 * else: no other week, no notes, no way into the group's page. A grant that
 * has ended, or an address naming another session, gets the page's ordinary
 * answer: everybody else is sent to the run's home, never told whether the
 * group exists. The register's routes re-derive the same access from the
 * same documents and are the real boundary.
 */

export const dynamic = "force-dynamic";

export default async function GroupRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<{ session?: string | string[] }>;
}) {
  const { runId, groupId } = await params;
  const session = sessionParamOf((await (searchParams ?? Promise.resolve({} as { session?: string | string[] }))).session);

  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  // The register's own gate (`gateGroupRegister`), the same predicate as
  // every route that marks the register. The group must be on THIS run.
  const gated = await gateGroupRegister(groupId, access.user, db);
  if (!gated.ok || gated.runId !== runId) redirect(runHome);
  // Somebody admitted only for a session they were given: that session, by
  // its address, while the grant holds, and nothing else.
  const onlyGiven = !gated.isAdmin && !gated.facilitates && !gated.leads;
  if (onlyGiven && (!session || !gated.givenSessions.includes(session))) redirect(runHome);

  // The way back, and where "It didn't happen" lives: the group's page,
  // which takes its facilitators and admins. Nobody else is given a way
  // into it from here.
  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  const opensGroupPage = gated.isAdmin || gated.facilitates;

  // Called, not mounted: the page answers with the tree the body draws.
  return RegisterPageBody({
    gated,
    user: access.user,
    run: access.run,
    backHref: opensGroupPage ? groupPath : null,
    session,
    reportHref: `${groupPath}/report`,
    didntHappen: opensGroupPage ? { href: groupPath, words: DIDNT_HAPPEN_MOVED_FACILITATOR } : null,
  });
}
