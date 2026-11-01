import Link from "next/link";
import { redirect } from "next/navigation";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import styles from "@/features/reports/reports.module.css";
import { getCurrentUser } from "@/lib/firebase/session";
import { KAIROS_FILE_WORDS } from "@/lib/kairos/words";
import { REPORTS_WORDS } from "@/lib/reports/words";
import { PUBLIC_NUMBERS_WORDS } from "@/lib/surveys/publicNumbersWords";
import { canRunSurveys } from "@/lib/surveys/repo";
import { TERM_WORDS } from "@/lib/surveys/term/words";

export const dynamic = "force-dynamic";

/**
 * The three reports, each by its own name and a line about it: This term in
 * numbers, Public numbers and Kairos. Each keeps the page and the address it
 * had when it was a button on the Surveys page's head, and leads back here.
 */
const REPORTS = [
  { href: "/admin/surveys/term", title: TERM_WORDS.link, line: REPORTS_WORDS.term },
  { href: "/admin/surveys/public-numbers", title: PUBLIC_NUMBERS_WORDS.title, line: PUBLIC_NUMBERS_WORDS.lede },
  { href: "/admin/surveys/kairos", title: KAIROS_FILE_WORDS.title, line: KAIROS_FILE_WORDS.lede },
] as const;

/**
 * Run NAISI › Reports: the way to the admins' reading of the term's records,
 * each report a card. It reads nothing itself, so it shows nothing about
 * anybody; each report's page reads what it counts, behind its own gate.
 *
 * Under `(admin-only)`, whose layout (`requireAdminPage()`) is the gate; the
 * page asks again itself with the surveys' bar (`canRunSurveys`), as the
 * reports it leads to do. A view-as session's account is never an admin's,
 * so it never gets here.
 */
export default async function ReportsPage() {
  const viewer = await getCurrentUser();
  if (!viewer || !canRunSurveys(viewer)) redirect("/dashboard");
  return (
    <AdminPage wide>
      <PageHead title={REPORTS_WORDS.title} description={REPORTS_WORDS.lede} />
      <ul className={styles.list}>
        {REPORTS.map((report) => (
          <li key={report.href} className={styles.card}>
            <h2 className={styles.name}>
              <Link href={report.href} className={styles.link}>
                {report.title}
              </Link>
            </h2>
            <p className={styles.line}>{report.line}</p>
          </li>
        ))}
      </ul>
    </AdminPage>
  );
}
