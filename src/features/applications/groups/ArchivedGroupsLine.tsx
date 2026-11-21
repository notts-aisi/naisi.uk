import Link from "next/link";
import { groupPagePath } from "@/lib/courses/groupPage/words";
import styles from "./ArchivedGroupsLine.module.css";

/** "Archived:", before the run's archived groups on the Groups tab. */
export const ARCHIVED_GROUPS = "Archived:";

/**
 * THE RUN'S ARCHIVED GROUPS, under the Groups tab's board, which draws only
 * the groups that still meet: each name opens its page, where an archived
 * group offers Restore. Nothing is drawn when none is archived.
 */
export default function ArchivedGroupsLine({
  roundId,
  programmeId,
  groups,
}: {
  roundId: string;
  programmeId: string;
  groups: readonly { id: string; name: string }[];
}) {
  if (groups.length === 0) return null;
  return (
    <p className={styles.line} data-testid="archived-groups">
      <span className={styles.label}>{ARCHIVED_GROUPS}</span>
      {groups.map((group, index) => (
        <span key={group.id}>
          {index > 0 && ", "}
          <Link href={groupPagePath(roundId, programmeId, group.id)} className={styles.link}>
            {group.name}
          </Link>
        </span>
      ))}
    </p>
  );
}
