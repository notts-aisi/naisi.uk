import Link from "next/link";
import { redirect } from "next/navigation";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import SurveyList from "@/features/surveys/admin/SurveyList";
import styles from "@/features/surveys/admin/surveyAdmin.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { loadSurveyHub } from "@/lib/surveys/hub/load";
import { hubTabOf } from "@/lib/surveys/hub/tabs";
import { canRunSurveys } from "@/lib/surveys/repo";
import { LIST_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * Run NAISI › Surveys, every survey by what it is for: By programme (each of
 * the term's programmes with its before survey, its weekly check-ins, its
 * facilitators' reports, its survey at the end and its survey about leaving,
 * then every other programme that has a survey) and Events (each survey after
 * an event, the newest first), one page and two tabs (`?tab=events`). The
 * term's numbers, public numbers and Kairos are in Reports.
 *
 * Under `(admin-only)`, whose layout (`requireAdminPage()`) is the gate: only
 * admins make, send and read surveys. The page asks again itself, with the
 * surveys' own bar (`canRunSurveys`), before anything is read, and the loader
 * asks again. Read on the server, from collections no browser can read, and
 * drawn from counts and words.
 */
export default async function SurveysPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const viewer = await getCurrentUser();
  if (!viewer || !canRunSurveys(viewer)) redirect("/dashboard");
  const tab = hubTabOf((await searchParams)?.tab);
  const db = getAdminDb();
  const view = (db ? await loadSurveyHub(db, viewer, tab, new Date()) : null) ?? (tab === "events" ? { tab, rows: [] } : { tab, cards: [] });
  return (
    <AdminPage wide>
      <PageHead
        title={LIST_WORDS.title}
        description={LIST_WORDS.lede}
        actions={
          <Link href="/admin/surveys/new" className={styles.linkButton}>
            {LIST_WORDS.newSurvey}
          </Link>
        }
      />
      <SurveyList view={view} />
    </AdminPage>
  );
}
