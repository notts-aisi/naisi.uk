import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import styles from "@/features/courses/updates/Messages.module.css";
import UpdateComposer from "@/features/courses/updates/UpdateComposer";
import { updateAudienceCounts } from "@/lib/courses/updates/audience";
import { loadRunGroups, programmeNameOf } from "@/lib/courses/updates/readers";
import { composerAudiences } from "@/lib/courses/updates/views";
import { writeToGroupLine } from "@/lib/courses/updates/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * "Write to Group B": the update composer for one group, opened from the
 * group's page (wk-fac-group, st-fac-before-phone). To is that group, said
 * rather than offered: a group's facilitator writes to their own group only.
 *
 * THE SAME GATE AS THE GROUP PAGE, spelled out again rather than shared: a
 * facilitator of THIS group while it is live, or an admin. Redirects, never
 * 403s, so a guessed group id says nothing. The press is the updates route,
 * which asks again from the same documents and is the real boundary.
 */

export const dynamic = "force-dynamic";

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

export default async function GroupUpdatePage({
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
  const runGroups = await loadRunGroups(db, runId);
  const [counts, programmeName] = await Promise.all([
    updateAudienceCounts(db, access.run, runGroups, { groupIds: [groupId] }, access.user.uid),
    programmeNameOf(db, access.run),
  ]);
  const count = counts[0];
  if (!count) redirect(groupPath);

  const eyebrow = [access.run.courseTitle, access.run.label].filter(Boolean).join(" · ");
  return (
    <div className={styles.stack}>
      <div>
        {eyebrow && <p style={eyebrowStyle}>{eyebrow}</p>}
        <h1 style={{ margin: "var(--space-2) 0 0" }}>Write to {count.groupName ?? group.name}</h1>
        <p style={subStyle}>
          {writeToGroupLine(count.emails)}{" "}
          <Link href={groupPath} style={{ color: "var(--color-accent-text)" }}>
            Back to the group
          </Link>
        </p>
      </div>
      <UpdateComposer runId={runId} audiences={composerAudiences(counts, programmeName)} />
    </div>
  );
}
