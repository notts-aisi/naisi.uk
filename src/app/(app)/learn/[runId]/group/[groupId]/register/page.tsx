import Link from "next/link";
import { redirect } from "next/navigation";
import AttendanceGrid from "@/features/courses/AttendanceGrid";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { NAMES_WHEN_GROUPS_GO_OUT } from "@/features/courses/groupNamesWords";
import { registerTitle } from "@/lib/courses/facilitatorPageWords";
import { gateGroupRegister, loadRegisterMembers } from "@/lib/courses/registerAccess";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A GROUP'S REGISTER, on a page of its own (board wk-register: the register
 * under a way back to its group). "Take the register" on the group page and
 * on Home, and each register's "See it", lead here.
 *
 * The register itself is the one the group page used to hold
 * (`AttendanceGrid`): every tap saves, and the foot under it says how this
 * register ends. Whether it becomes one session per page is a question for
 * the boards' designers (C23), so the grid is kept as it is.
 *
 * THE GATE is the register's own (`gateGroupRegister`), restated here
 * because a page's only protection must not be a level above it: a live
 * facilitator of THIS group, on THIS run, or an admin. Everybody else is sent
 * to the run's home, never told whether the group exists. The register's
 * routes re-derive the same access from the same documents and are the real
 * boundary.
 */

export const dynamic = "force-dynamic";

export default async function GroupRegisterPage({
  params,
}: {
  params: Promise<{ runId: string; groupId: string }>;
}) {
  const { runId, groupId } = await params;

  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  // The register's own gate (`gateGroupRegister`): a live facilitator of the
  // group, or an admin, the same predicate as the group page and every route
  // that marks the register. The group must be on THIS run.
  const gated = await gateGroupRegister(groupId, access.user, db);
  if (!gated.ok || gated.runId !== runId) redirect(runHome);

  const groupName = gated.group.name || "Group";
  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  // Before Publish has told anybody their group the register has no row and
  // draws nothing, so the page says when the names come, in the boards'
  // sentence. The rows are the register's own (`loadRegisterMembers`).
  const roster = await loadRegisterMembers(db, gated.runId, groupId, { isAdmin: gated.isAdmin });
  const namesToCome = roster.members.length === 0 && roster.notYetTold;

  return (
    <div className={`${facilitator.page} ${facilitator.registerPage}`}>
      <div className={`${weekly.bar} ${facilitator.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={groupPath} className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{groupName}</span>
          </Link>
        </div>
        <div className={weekly.barEnd} />
      </div>

      <header className={facilitator.registerHead}>
        <Link href={groupPath} className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
          {groupName}
        </Link>
        <h1 className={weekly.title}>{registerTitle(groupName)}</h1>
      </header>

      {namesToCome && <p className={weekly.cardLine}>{NAMES_WHEN_GROUPS_GO_OUT}</p>}

      {/* The register owns its own week controls and its own horizontal
          overflow: a wide table handles its own responsiveness rather than
          widening the shell (the `.mainWide` rule). */}
      <AttendanceGrid groupId={groupId} runId={runId} />
    </div>
  );
}
