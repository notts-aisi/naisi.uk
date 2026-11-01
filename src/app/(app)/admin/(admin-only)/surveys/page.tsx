import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import SurveyList from "@/features/surveys/admin/SurveyList";
import styles from "@/features/surveys/admin/surveyAdmin.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { listView, type ListView } from "@/lib/surveys/adminView";
import { checkInListView, type CheckInListGroup } from "@/lib/surveys/checkIns/adminView";
import { listCheckIns, listSurveys } from "@/lib/surveys/repo";
import { TERM_WORDS } from "@/lib/surveys/term/words";
import { LIST_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * Run NAISI › Surveys (sv-list). Under `(admin-only)`, so the group's layout
 * (`requireAdminPage()`) is the gate: only admins make, send and read
 * surveys. Read on the server, from collections no browser can read. The
 * check-ins at the end of sessions are listed apart, one line a programme.
 */
export default async function SurveysPage() {
  const db = getAdminDb();
  const now = new Date();
  const [view, checkIns]: [ListView, CheckInListGroup[]] = db
    ? await Promise.all([listView(db, await listSurveys(db), now), listCheckIns(db).then((all) => checkInListView(all, now))])
    : [{ open: [], drafts: [], closed: [] }, []];
  return (
    <AdminPage wide>
      <PageHead
        title={LIST_WORDS.title}
        description={LIST_WORDS.lede}
        actions={
          <>
            <Link href="/admin/surveys/term" className={styles.linkButtonGhost}>
              {TERM_WORDS.link}
            </Link>
            <Link href="/admin/surveys/public-numbers" className={styles.linkButtonGhost}>
              {LIST_WORDS.publicNumbers}
            </Link>
            <Link href="/admin/surveys/kairos" className={styles.linkButtonGhost}>
              {LIST_WORDS.kairos}
            </Link>
            <Link href="/admin/surveys/new" className={styles.linkButton}>
              {LIST_WORDS.newSurvey}
            </Link>
          </>
        }
      />
      <SurveyList view={view} checkIns={checkIns} />
    </AdminPage>
  );
}
