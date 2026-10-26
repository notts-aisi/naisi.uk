import type { AnonymousAnswersView } from "@/lib/anonymousFeedback/readers";
import { READER_WORDS } from "@/lib/anonymousFeedback/words";
import styles from "./anonymousFeedback.module.css";

/**
 * What the programme's lead and NAISI's admins read of the anonymous form:
 * where the form stands and its one link, how many answers have come in, and
 * each question's answers. A Server Component, handed the view the server
 * made (`readAnonymousAnswers`), which holds no day, time or id of any
 * answer, so the page cannot show one.
 */
export default function AnonymousAnswers({ view, site }: { view: AnonymousAnswersView; site: string }) {
  return (
    <section className={styles.readers} aria-labelledby="anonymous-answers-heading">
      <header className={styles.readersHead}>
        <h2 id="anonymous-answers-heading" className={styles.readersTitle}>
          {READER_WORDS.heading}
        </h2>
        <p className={styles.readersLine}>{READER_WORDS.intro}</p>
        <p className={styles.readersMeta}>{READER_WORDS.howShown}</p>
      </header>

      <div className={styles.formLink}>
        {view.form ? (
          <>
            <p className={styles.readersMeta}>{view.form.line}</p>
            <p className={styles.readersMeta}>{READER_WORDS.linkLabel}</p>
            <a href={view.form.path} rel="noreferrer" className={styles.address}>
              {`${site}${view.form.path}`}
            </a>
          </>
        ) : (
          <p className={styles.readersMeta}>{READER_WORDS.notYet}</p>
        )}
      </div>

      <p className={styles.count}>{view.count === 0 ? READER_WORDS.none : READER_WORDS.count(view.count)}</p>

      {view.questions.map((question) => (
        <section key={question.key} className={styles.questionBlock} aria-labelledby={`anonymous-${question.key}-heading`}>
          <h3 id={`anonymous-${question.key}-heading`} className={styles.questionHeading}>
            <span>{question.heading}</span>
            <span className={styles.questionCount}>{READER_WORDS.questionCount(question.answers.length)}</span>
          </h3>
          {question.answers.length > 0 ? (
            <ul className={styles.answers}>
              {question.answers.map((words, index) => (
                <li key={index} className={styles.answerItem}>
                  {words}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>{READER_WORDS.noneToQuestion}</p>
          )}
        </section>
      ))}
    </section>
  );
}
