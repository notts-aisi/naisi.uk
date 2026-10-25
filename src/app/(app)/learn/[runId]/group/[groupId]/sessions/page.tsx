import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import SessionsBoard from "@/features/courses/sessionChange/SessionsBoard";
import { loadGroupSessions } from "@/lib/courses/sessionChange/view";
import {
  BACK_TO_GROUP,
  GROUP_SESSIONS_LEDE,
  NO_MORE_SESSIONS,
  groupSessionsHeading,
} from "@/lib/courses/sessionChange/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * "Change a session", from a facilitator's group page (wk-fac-group): the
 * group's sessions from today to its last, each with the change dialog
 * (wk-session) behind it.
 *
 * THE SAME GATE AS THE GROUP PAGE, spelled out again rather than shared: a
 * facilitator of THIS group while it is live, or an admin. Redirects, never
 * 403s, so a guessed group id says nothing. The press is the change route,
 * which asks again from the same documents and is the real boundary; the
 * programme's lead and the run's track leads change sessions from the
 * programme's Groups tab.
 */

export const dynamic = "force-dynamic";

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--space-6)" };

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-text-muted)",
};

const subStyle: CSSProperties = {
  margin: "var(--space-2) 0 0",
  maxWidth: "62ch",
  fontSize: "var(--text-sm)",
  lineHeight: 1.6,
  color: "var(--color-text-muted)",
};

export default async function GroupSessionsPage({
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

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) redirect(runHome);
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});

  // Live group only, as on the group's page and in the route behind this one.
  const facilitatesThisGroup =
    !group.archived && isNamedWithStanding(access.user, "courseGroups.facilitatorUids", group.facilitatorUids);
  if (group.runId !== runId || group.archived || !(access.isAdmin || facilitatesThisGroup)) redirect(runHome);

  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  const cards = await loadGroupSessions(db, access.run, group, new Date());
  const eyebrow = [access.run.courseTitle, access.run.label].filter(Boolean).join(" · ");

  return (
    <div style={pageStyle}>
      <div>
        {eyebrow && <p style={eyebrowStyle}>{eyebrow}</p>}
        <h1 style={{ margin: "var(--space-2) 0 0" }}>{groupSessionsHeading(group.name.trim() || "Your group")}</h1>
        <p style={subStyle}>
          {GROUP_SESSIONS_LEDE}{" "}
          <Link href={groupPath} style={{ color: "var(--color-accent-text)" }}>
            {BACK_TO_GROUP}
          </Link>
        </p>
      </div>
      <SessionsBoard
        heading=""
        previous={null}
        next={null}
        cards={cards}
        blank={cards.length === 0 ? NO_MORE_SESSIONS : null}
      />
    </div>
  );
}
