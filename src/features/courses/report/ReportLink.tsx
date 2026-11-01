import Link from "next/link";
import { REPORT_WORDS } from "@/lib/courses/sessionReports/words";
import styles from "./sessionReport.module.css";

/**
 * "Next: two minutes on how it went.": the way from a finished register on
 * to its writer's report on that session. The register's page hands its grid
 * the report page's address only for a live facilitator of the group, who
 * writes one; the session is the one the register's foot is about.
 *
 * No directive: it draws a link and nothing else, wherever it is used.
 */
export default function ReportLink({ href, sessionKey }: { href: string; sessionKey: string }) {
  return (
    <Link href={`${href}?session=${encodeURIComponent(sessionKey)}`} className={styles.next}>
      <span>{REPORT_WORDS.next}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
