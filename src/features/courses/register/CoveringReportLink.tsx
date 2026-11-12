import Link from "next/link";
import { WRITE_THE_SESSION_REPORT, reportCoveringLine } from "@/lib/courses/registerCover/pageWords";
import styles from "./CoveringReportLink.module.css";

/**
 * "Write the session report", for whoever took a session's register in a
 * facilitator's place: the way on to their report on that session, with the
 * line saying it will say they wrote it, covering for the facilitators whose
 * place they took. A facilitator of the group is shown `ReportLink` as
 * before.
 *
 * No directive: it draws a link and a line, wherever it is used.
 */
export default function CoveringReportLink({
  href,
  sessionKey,
  covering,
}: {
  href: string;
  sessionKey: string;
  covering: readonly { name: string }[];
}) {
  const firstNames = covering.map((each) => each.name.trim().split(/\s+/)[0] ?? "").filter(Boolean);
  return (
    <div className={styles.root}>
      <Link href={`${href}?session=${encodeURIComponent(sessionKey)}`} className={styles.link}>
        {WRITE_THE_SESSION_REPORT}
      </Link>
      <p className={styles.line}>{reportCoveringLine(firstNames)}</p>
    </div>
  );
}
