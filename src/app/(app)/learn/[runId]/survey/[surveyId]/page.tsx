import Link from "next/link";
import { redirect } from "next/navigation";
import AnswerScreen from "@/features/surveys/answer/AnswerScreen";
import { getSessionUser } from "@/features/courses/runAccess";
import { getAdminDb } from "@/lib/firebase/admin";
import { answerScreenFor, type AnswerScreen as Screen } from "@/lib/surveys/answerView";
import { readPerson, readSurvey } from "@/lib/surveys/repo";
import { STATE_WORDS } from "@/lib/surveys/words";
import styles from "./page.module.css";

/**
 * A PERSON'S SURVEY, SIGNED IN (sv-before-phone): the same page as their
 * personal link, inside their programme, for a card on Home or week 1 to link
 * to. The run's layout has already asked whether they hold any role on the
 * run; this page shows a survey only to somebody it was sent to, on this
 * run, and answers everybody else in one sentence.
 *
 * Opening it records nothing. "Send my answers" goes to the signed-in answer
 * route, which refuses during a view-as session, so an admin viewing the site
 * as somebody can never answer as them.
 */

export const dynamic = "force-dynamic";

export default async function SignedInSurveyPage({
  params,
}: {
  params: Promise<{ runId: string; surveyId: string }>;
}) {
  const { runId, surveyId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = getAdminDb();
  let screen: Screen = { state: "message", ...STATE_WORDS.notYours, consent: null };
  let programmeName = "";
  if (db) {
    const survey = await readSurvey(db, surveyId);
    const person = survey && survey.runId === runId ? await readPerson(db, survey.id, { kind: "account", uid: user.uid }) : null;
    if (survey && person && person.sentAt !== null) {
      programmeName = survey.programmeName;
      screen = await answerScreenFor(db, survey, {
        uid: user.uid,
        answered: person.answered,
        answeredAt: null,
        submit: { kind: "signed-in", surveyId: survey.id },
        now: new Date(),
        person,
      });
    }
  }

  return (
    <div className={styles.page}>
      {programmeName && (
        <Link href={`/learn/${encodeURIComponent(runId)}`} className={styles.crumb}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span>{programmeName}</span>
        </Link>
      )}
      <AnswerScreen screen={screen} />
    </div>
  );
}
