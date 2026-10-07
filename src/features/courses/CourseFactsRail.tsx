import Chip, { type ChipTone } from "@/components/ui/Chip";
import FactRows from "@/features/programmes/FactRows";
import styles from "./CourseFactsRail.module.css";

/**
 * "At a glance": the card beside a programme's title, with the questions a
 * prospective applicant asks before reading a word of the pitch. Short
 * answers only, one to a row, so a reader can compare two courses in an open
 * tab each. The longer answers (who it is for, how we choose) are sections of
 * the page.
 *
 * ## Every string here is a TEXT NODE
 *
 * The values come from `coursePages`, which is authored by a course drafter
 * and sanitised at both ends, but this component still renders plain text
 * only. The one surface on this page allowed to emit HTML is `BlockView`, for
 * the pitch blocks.
 */

export type CourseFact = {
  label: string;
  /** An empty value drops the row. */
  value: string;
  /** A second, quieter line under the answer. */
  note?: string;
};

/** The one-line state of the course's applications, drawn as a chip beside the card's title. */
export type CourseFactsStatus = {
  words: string;
  tone: ChipTone;
  /** A dot before the words, for a state that is live now. */
  live: boolean;
};

type Props = {
  facts: CourseFact[];
  status?: CourseFactsStatus | null;
};

export default function CourseFactsRail({ facts, status = null }: Props) {
  const shown = facts.filter((fact) => fact.value.trim());
  if (shown.length === 0) return null;

  return (
    <section className={styles.rail} aria-labelledby="course-facts-heading">
      <div className={styles.top}>
        <h2 id="course-facts-heading" className={styles.heading}>
          At a glance
        </h2>
        {status ? (
          <Chip tone={status.tone} dot={status.live}>
            {status.words}
          </Chip>
        ) : null}
      </div>
      <FactRows rows={shown} labelWidth="8rem" />
    </section>
  );
}
