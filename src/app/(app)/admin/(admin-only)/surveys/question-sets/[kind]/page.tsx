import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import EventQuestionSet from "@/features/surveys/questionSets/EventQuestionSet";
import QuestionSetWords from "@/features/surveys/questionSets/QuestionSetWords";
import styles from "@/features/surveys/questionSets/questionSets.module.css";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPage } from "@/lib/firebase/pageGates";
import { isQuestionSetKind } from "@/lib/firestore/surveyQuestionSets";
import { accountNameOf } from "@/lib/firestore/users";
import { eventTemplateItems } from "@/lib/surveys/events/template";
import { hubTabHref } from "@/lib/surveys/hub/tabs";
import { QUESTION_SETS, QUESTION_SET_WORDS, changedWords, editsWhole, eventSetItems, setEntries } from "@/lib/surveys/questionSets";
import { readQuestionSet } from "@/lib/surveys/questionSetsStore";

export const dynamic = "force-dynamic";

/**
 * ONE QUESTION SET (Run NAISI › Surveys › Question sets › Edit): the
 * questions one kind of survey starts with, changed here for every survey of
 * that kind made from now on ("Change them here, or per survey").
 *
 * The survey after an event's set is edited whole; every other kind's words
 * alone, each question keeping its id, kind, answers and place
 * (`src/lib/surveys/questionSets.ts`). Saved by
 * `PUT /api/surveys/question-sets/[kind]`, which holds both rules itself.
 *
 * The page asks `requireAdminPage()` itself before anything is read, as its
 * `(admin-only)` layout does. An address that names no set is answered on the page in
 * a sentence, never `notFound()`.
 */
export default async function QuestionSetPage({ params }: { params: Promise<{ kind: string }> }) {
  await requireAdminPage();
  const { kind } = await params;
  const crumb = <Link href={hubTabHref("question-sets")}>{QUESTION_SET_WORDS.title}</Link>;

  if (!isQuestionSetKind(kind)) {
    return (
      <AdminPage>
        <PageHead crumb={crumb} title={QUESTION_SET_WORDS.title} />
        <div className={styles.missing}>
          <p>{QUESTION_SET_WORDS.noSet}</p>
          <Link href={hubTabHref("question-sets")} className={styles.back}>
            {QUESTION_SET_WORDS.backToSets}
          </Link>
        </div>
      </AdminPage>
    );
  }

  const db = getAdminDb();
  const stored = db ? await readQuestionSet(db, kind) : null;
  // Who last changed it, by the name they go by: one admin's account, read for this line alone.
  const by = db && stored?.updatedByUid ? accountNameOf((await db.collection("users").doc(stored.updatedByUid).get()).data()) : null;
  const changed = changedWords(stored?.updatedAt ?? null, by);
  const set = QUESTION_SETS[kind];

  return (
    <AdminPage>
      <PageHead crumb={crumb} title={set.name} description={set.about} />
      <div className={styles.page}>
        <div className={styles.lede}>
          <p>{editsWhole(kind) ? QUESTION_SET_WORDS.whole : QUESTION_SET_WORDS.wordsOnly}</p>
          <p>{kind === "session-report" ? QUESTION_SET_WORDS.reachesReport : QUESTION_SET_WORDS.reaches}</p>
        </div>
        <section className={styles.card} aria-labelledby="set-questions">
          <h2 id="set-questions" className={styles.cardTitle}>
            Questions
          </h2>
          {editsWhole(kind) ? (
            <EventQuestionSet initial={eventSetItems(stored)} original={eventTemplateItems()} changed={changed} />
          ) : (
            <QuestionSetWords kind={kind} entries={setEntries(kind, stored?.words ?? {})} changed={changed} />
          )}
        </section>
      </div>
    </AdminPage>
  );
}
