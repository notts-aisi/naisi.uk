import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import SurveyList from "@/features/surveys/admin/SurveyList";
import styles from "@/features/surveys/admin/surveyAdmin.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPage } from "@/lib/firebase/pageGates";
import { loadSurveyHub } from "@/lib/surveys/hub/load";
import type { HubView } from "@/lib/surveys/hub/model";
import { hubTabOf, type HubTab } from "@/lib/surveys/hub/tabs";
import { questionSetRows } from "@/lib/surveys/questionSets";
import { ADMIN_WORDS } from "@/lib/societyFeedback/words";
import { LIST_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/** A tab drawn with nothing read, for a copy of the site with no database. */
function emptyView(tab: HubTab): HubView {
  if (tab === "events") return { tab, rows: [] };
  if (tab === "question-sets") return { tab, sets: questionSetRows(new Map()) };
  return { tab, cards: [] };
}

/**
 * Run NAISI › Surveys, every survey by what it is for: By programme (each of
 * the term's programmes with its before survey, its weekly check-ins, its
 * facilitators' reports, its survey at the end and its survey about leaving,
 * then every other programme that has a survey) and Events (each survey after
 * an event, the newest first), and Question sets (the questions each kind of
 * survey starts with, each leading to its own page), one page and three tabs
 * (`?tab=events`, `?tab=question-sets`). The term's numbers, public numbers
 * and Kairos are in Reports.
 *
 * Only admins make, send and read surveys: the page asks `requireAdminPage()`
 * itself before anything is read, as its `(admin-only)` layout does, and the
 * loader asks again. Read on the server, from collections no browser can read, and
 * drawn from counts and words.
 */
export default async function SurveysPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const viewer = await requireAdminPage();
  const tab = hubTabOf((await searchParams)?.tab);
  const db = getAdminDb();
  const view = (db ? await loadSurveyHub(db, viewer, tab, new Date()) : null) ?? emptyView(tab);
  return (
    <AdminPage wide>
      <PageHead
        title={LIST_WORDS.title}
        description={LIST_WORDS.lede}
        actions={
          <>
            <Link href="/admin/surveys/anonymous-feedback" className={styles.linkButton}>
              {ADMIN_WORDS.title}
            </Link>
            <Link href="/admin/surveys/new" className={styles.linkButton}>
              {LIST_WORDS.newSurvey}
            </Link>
          </>
        }
      />
      <SurveyList view={view} />
    </AdminPage>
  );
}
