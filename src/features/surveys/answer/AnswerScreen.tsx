import type { AnswerScreen as Screen } from "@/lib/surveys/answerView";
import { ANSWER_WORDS, STATE_WORDS } from "@/lib/surveys/words";
import SurveyForm from "./SurveyForm";
import styles from "./AnswerScreen.module.css";

/**
 * One person's survey, as the answer page draws it (sv-before-phone): the
 * programme and week, the title and intro, "Every question can be skipped.",
 * the confidential box, then the questions. Or, instead, one calm message:
 * answered, closed, or a link that opens nothing.
 *
 * A Server Component: everything it shows was built for this person on the
 * server (`answerScreenFor`), and the form below it takes only the values it
 * draws.
 */
export default function AnswerScreen({ screen }: { screen: Screen }) {
  if (screen.state === "message") {
    return (
      <div className={styles.message}>
        <h1 className={styles.messageTitle}>{screen.title}</h1>
        <p className={styles.messageBody}>{screen.body}</p>
      </div>
    );
  }
  const { survey } = screen;
  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>
          {survey.eyebrow.map((part, index) => (
            <span key={index} className={styles.eyebrowPart}>
              {index > 0 ? " · " : ""}
              {part}
            </span>
          ))}
        </p>
        <h1 className={styles.title}>{survey.title}</h1>
        {survey.intro.map((paragraph, index) => (
          <p key={index} className={styles.intro}>
            {paragraph}
          </p>
        ))}
        <p className={styles.skippable}>{ANSWER_WORDS.skippable}</p>
      </header>

      <section className={styles.box} aria-label={survey.box.heading}>
        <p className={styles.boxHead}>
          <svg
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
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span>{survey.box.heading}</span>
        </p>
        <ul className={styles.points}>
          {survey.box.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className={styles.note}>{survey.box.note}</p>
      </section>

      <SurveyForm pages={survey.pages} closing={survey.closing} submit={survey.submit} testWords={STATE_WORDS.test} />
    </div>
  );
}
