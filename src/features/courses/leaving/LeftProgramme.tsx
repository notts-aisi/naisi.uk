import LeavingSurveyCard from "@/features/surveys/cards/LeavingSurveyCard";
import type { LeftView } from "@/lib/courses/leftView";
import type { SurveyCard } from "@/lib/surveys/waiting";
import {
  BACK_TO_PROGRAMMES,
  CHANGED_AFTER,
  CHANGED_BEFORE,
  CHANGED_YOUR_MIND,
  SOCIETY_ADDRESS,
  leftHeading,
  leftOnLine,
} from "@/lib/courses/leavingWords";
import styles from "./Leaving.module.css";
import { ProgrammeBar } from "./Parts";

/**
 * THE PROGRAMME PAGE ONCE SOMEBODY HAS LEFT (board wk-left-phone), drawn on
 * the server from `loadLeftView`.
 *
 * What it says: that they left, the day, the leaving survey's card while it
 * is theirs to answer (`survey`, Q46), and the society's address for
 * somebody who has changed their mind. That is all of it. Their marks, notes
 * and reflections are not shown to them, nor the reading list, nor anything
 * of the group's: those stay with the programme's lead and admins, and the
 * notes they shared stay with their group.
 *
 * The run's own page draws it, and so do the notes and reading list pages
 * when the person asking has left.
 */
export default function LeftProgramme({ view, survey = null }: { view: LeftView; survey?: SurveyCard | null }) {
  return (
    <div className={styles.page}>
      <ProgrammeBar backHref="/learn" backLabel={BACK_TO_PROGRAMMES} title={view.name} />
      <div className={styles.body}>
        <div className={styles.leftCard}>
          <h1 className={styles.pageTitle}>{leftHeading(view.name)}</h1>
          <p className={`${styles.text} ${styles.lede}`}>{leftOnLine(view.leftOn)}</p>
        </div>

        {survey && <LeavingSurveyCard card={survey} />}

        <section className={styles.section} aria-labelledby="left-changed">
          <h2 id="left-changed" className={`${styles.heading} ${styles.headingSpaced}`}>
            {CHANGED_YOUR_MIND}
          </h2>
          <p className={styles.text}>
            {CHANGED_BEFORE}{" "}
            <a href={`mailto:${SOCIETY_ADDRESS}`} className={styles.mail}>
              {SOCIETY_ADDRESS}
            </a>{" "}
            {CHANGED_AFTER}
          </p>
        </section>
      </div>
    </div>
  );
}
