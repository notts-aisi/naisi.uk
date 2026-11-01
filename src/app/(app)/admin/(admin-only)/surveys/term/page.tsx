import Link from "next/link";
import { redirect } from "next/navigation";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import TermInNumbers from "@/features/surveys/admin/TermInNumbers";
import styles from "@/features/surveys/admin/termInNumbers.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { canRunSurveys } from "@/lib/surveys/repo";
import { loadTermNumbers } from "@/lib/surveys/term/load";
import { TERM_TOTALS_PATH, TERM_WORDS } from "@/lib/surveys/term/words";

export const dynamic = "force-dynamic";

/**
 * Run NAISI › Reports › This term in numbers (sv-term): the term at a glance
 * for admins, each event's check-ins and survey, how many different people
 * came, and each programme's before and after. Counts only, never names.
 *
 * Under `(admin-only)`, whose layout (`requireAdminPage()`) is the gate; the
 * page asks again itself, with the surveys' own bar (`canRunSurveys`), and
 * the loader asks again before it reads. A view-as session's account is never
 * an admin's, so it never gets here.
 * Read on the server; the component is handed counts and words.
 */
export default async function TermInNumbersPage() {
  const viewer = await getCurrentUser();
  if (!viewer || !canRunSurveys(viewer)) redirect("/dashboard");
  const db = getAdminDb();
  const loaded = db ? await loadTermNumbers(db, viewer, new Date()) : null;
  const crumb = <Link href="/admin/reports">{TERM_WORDS.crumb}</Link>;
  if (!loaded || !loaded.term) {
    return (
      <AdminPage wide>
        <PageHead title={TERM_WORDS.title} crumb={crumb} />
        <p className={styles.line}>{TERM_WORDS.noTerm}</p>
      </AdminPage>
    );
  }
  const { view } = loaded;
  return (
    <AdminPage wide>
      <PageHead
        title={TERM_WORDS.title}
        crumb={crumb}
        meta={
          <>
            {view.label && <span>{view.label}</span>}
            {view.label && (
              <span aria-hidden="true" className={styles.dot}>
                ·
              </span>
            )}
            <span>{view.line}</span>
          </>
        }
        actions={
          <a href={TERM_TOTALS_PATH} download className={styles.download}>
            <svg
              className={styles.downloadIcon}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10l5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
            <span>{TERM_WORDS.download}</span>
          </a>
        }
      />
      <TermInNumbers view={view} />
    </AdminPage>
  );
}
