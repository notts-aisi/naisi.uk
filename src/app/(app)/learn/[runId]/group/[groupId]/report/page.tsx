import { redirect } from "next/navigation";
import SessionReportPageBody from "@/features/courses/report/SessionReportPageBody";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import { loadReportPage } from "@/lib/courses/sessionReports/page";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A FACILITATOR'S SESSION REPORT: two minutes straight after the register,
 * on a phone. "Next: two minutes on how it went." beside the register's
 * check-in leads here from the session's start, finished or not, naming its
 * session (`?session=w03`).
 *
 * THE GATE is the report route's own (`gateReportWriter`), restated because a
 * page's only protection must not be a level above it: a live facilitator of
 * THIS group, on THIS run, and, for the one session the address names,
 * whoever took that session's register in a facilitator's place while it
 * holds (`gateCoveringReportWriter`: somebody given the session, or a track
 * lead or an admin who covered it), whose report says so. Each writes their
 * own report; an admin and the programme's lead who did not take it read
 * reports on the programme's page and write none. So everybody else is sent
 * to the run's home, never told whether the group exists. The route
 * re-derives the same access from the same documents and is the real
 * boundary.
 *
 * WHAT IT SHOWS (`loadReportPage`): the form while the session's report is
 * open, with this writer's own answers in it once sent; before the session
 * starts, when it opens; once the group's next session has started, that it
 * has closed, and what this writer sent. A session that was called off, or
 * that the register says did not happen, has no report.
 */

export const dynamic = "force-dynamic";

export default async function SessionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<{ session?: string | string[] }>;
}) {
  const { runId, groupId } = await params;
  const asked = (await (searchParams ?? Promise.resolve({} as { session?: string | string[] }))).session;

  const access = await getRunAccess(runId);
  if (!access) {
    // Null is "no session" OR "no such run", fused in `getRunAccess`.
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }

  const runHome = `/learn/${encodeURIComponent(runId)}`;
  // Dynamic segments arrive decoded: a `/` here would make `doc()` throw.
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  const view = await loadReportPage(db, access.user, runId, groupId, typeof asked === "string" ? asked : null, new Date());
  if (!view) redirect(runHome);

  // A report written in a facilitator's place goes back to the register it
  // was written from: its writer may have no way into the group's page.
  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  const backHref =
    view.covering && typeof asked === "string" ? `${groupPath}/register?session=${encodeURIComponent(asked)}` : groupPath;
  // Called, not mounted: the body holds no hook, so the page answers with the tree it draws.
  return SessionReportPageBody({ view, backHref });
}
