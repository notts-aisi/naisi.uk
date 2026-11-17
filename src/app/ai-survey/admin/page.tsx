import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPanel from "@/features/aiSurvey/admin/AdminPanel";
import SurveyFrame from "@/features/aiSurvey/SurveyFrame";
import styles from "@/features/aiSurvey/survey.module.css";
import { adminView, surveyAdmin } from "@/lib/aiSurvey/adminStore";
import { AI_SURVEY, fillValues } from "@/lib/aiSurvey/definition";

/*
  /ai-survey/admin: the AI at Nottingham survey's own admin page.

  WHO OPENS IT. Not the admin role: the accounts on a list kept on the
  survey's own record (`surveyAdmin`). The survey tells students that one
  person opens individual answers, so this page, its export and its buttons
  answer to that list and to nothing else. That is also why it is NOT under
  /admin, where every page is gated by role.

  Somebody not signed in is sent to sign in. Somebody signed in and not on the
  list is told the page is not theirs, in ordinary HTML. The list is changed
  by hand in the datastore: nothing on the site can add an account to it.

  WHAT IT SHOWS: the stage, how many answer sets have started and finished,
  codes sent in the last hour, what is missing before it can open, and the
  short links with their scans. IT NEVER SHOWS ANYTHING ABOUT ONE PERSON.
*/

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: AI_SURVEY.admin.heading,
  robots: { index: false, follow: false },
};

export default async function AiSurveyAdminPage() {
  const { signedIn, admin } = await surveyAdmin();
  if (!signedIn) redirect("/login?next=/ai-survey/admin");
  const words = AI_SURVEY.admin;

  if (!admin) {
    return (
      <SurveyFrame label={words.frameLabel}>
        <main className={styles.column}>
          <h1 className={styles.h1}>{words.heading}</h1>
          <section className={styles.card}>
            <p className={`${styles.body} ${styles.bodyStrong}`}>This page is not open to this account.</p>
          </section>
        </main>
      </SurveyFrame>
    );
  }

  const view = await adminView(admin.db, admin.state);
  return (
    <SurveyFrame label={words.frameLabel}>
      <AdminPanel
        view={view}
        words={{
          ...words,
          stageNotes: {
            pilot: words.stageNotes.pilot,
            open: fillValues(words.stageNotes.open),
            closed: words.stageNotes.closed,
          },
        }}
      />
    </SurveyFrame>
  );
}
