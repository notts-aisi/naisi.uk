import Link from "next/link";
import { MY_PROGRAMMES } from "@/lib/courses/facilitatorPageWords";
import { facilitatorArchivedLine, facilitatorArchivedTitle } from "@/lib/courses/groupArchive/words";
import facilitator from "./facilitator.module.css";
import styles from "./notForYou.module.css";

/**
 * WHAT A FACILITATOR OF AN ARCHIVED GROUP IS TOLD on the group's own page
 * (from My programmes, Home or an old link), in place of the page: "Group F
 * was archived on Mon 2 Nov." and "Its registers are kept. Maya, the
 * programme’s lead, can tell you more.", with the way on to My programmes.
 * Only somebody the group's facilitators still name, with standing, is told
 * it; anybody else not admitted gets `NotForYou`, the same page as for a
 * group that is not there.
 *
 * It takes the words' three facts and nothing else: drawn on the server,
 * it reads no document.
 */
export default function ArchivedGroupNotice({
  groupName,
  dayLabel,
  leadFirstName,
}: {
  groupName: string;
  /** "Mon 2 Nov", or "" for a group archived before the day was kept. */
  dayLabel: string;
  leadFirstName: string | null;
}) {
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{facilitatorArchivedTitle(groupName, dayLabel)}</h1>
      <p className={styles.who}>{facilitatorArchivedLine(leadFirstName)}</p>
      <Link href="/learn" className={`${facilitator.buttonPrimary} ${styles.way}`}>
        {MY_PROGRAMMES}
      </Link>
    </div>
  );
}
