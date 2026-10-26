import type { ReactNode } from "react";
import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import type { WrittenQueueRow } from "@/lib/courses/writtenAnswers/queue";
import {
  GIVE_FEEDBACK,
  NOTHING_TO_GIVE_FEEDBACK_ON,
  REVIEW_QUEUE,
  WRITTEN_ANSWERS,
  sentAtWords,
  toGiveFeedbackOnWords,
} from "@/lib/courses/writtenAnswerWords";
import styles from "./queue.module.css";

/**
 * THE REVIEW QUEUE ON A GROUP'S PAGE (board wk-fac-group): its Written
 * answers half, "2 to give feedback on", each person with when they sent it
 * and Give feedback, oldest first. An answer that has been opened with no
 * feedback yet still waits. Who is listed is the one gate's
 * (`loadWrittenQueue`): a facilitator never sees a co-facilitator's own
 * answer, or their own.
 *
 * THE REFLECTIONS HALF is the facilitator's week's, a later piece:
 * `reflections` is where it goes, drawn under this half when it is handed
 * one.
 */
export default function ReviewQueueCard({
  rows,
  hrefFor,
  reflections = null,
}: {
  rows: WrittenQueueRow[];
  /** Where Give feedback leads for one row: the review page on that person and week. */
  hrefFor: (row: WrittenQueueRow) => string;
  reflections?: ReactNode;
}) {
  return (
    <section className={weekly.card} aria-labelledby="group-review-queue">
      <div className={weekly.cardHead}>
        <h2 id="group-review-queue" className={weekly.cardTitle}>
          {REVIEW_QUEUE}
        </h2>
      </div>
      <div className={styles.half}>
        <h3 className={styles.halfTitle}>{WRITTEN_ANSWERS}</h3>
        <p className={styles.halfCount}>{rows.length === 0 ? NOTHING_TO_GIVE_FEEDBACK_ON : toGiveFeedbackOnWords(rows.length)}</p>
        {rows.length > 0 && (
          <ul className={facilitator.reviews}>
            {rows.map((row) => (
              <li key={`${row.uid} ${row.weekNumber}`} className={facilitator.review}>
                <InitialsChip name={row.name} uid={row.uid} size="md" />
                <span className={facilitator.reviewText}>
                  <span className={facilitator.personName}>{row.name}</span>
                  <span className={styles.rowMeta}>{sentAtWords(new Date(row.firstSentAt))}</span>
                </span>
                <Link
                  href={hrefFor(row)}
                  className={facilitator.buttonGhost}
                  aria-label={`${GIVE_FEEDBACK}: ${row.name}, week ${row.weekNumber}`}
                >
                  {GIVE_FEEDBACK}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {reflections}
    </section>
  );
}

/**
 * The same queue for the programme's lead, a line per group of the run
 * (their Attendance tab): how many written answers wait in it for their
 * feedback, and the way to give it. The lead gives feedback on a
 * facilitator's own answer, which no facilitator can. No board draws it:
 * its words are listed for the boards' designers.
 */
export function LeadWrittenAnswersCard({
  groups,
}: {
  groups: Array<{ id: string; name: string; waiting: number; href: string }>;
}) {
  return (
    <section className={weekly.card} aria-labelledby="lead-written-answers">
      <div className={weekly.cardHead}>
        <h2 id="lead-written-answers" className={weekly.cardTitle}>
          {WRITTEN_ANSWERS}
        </h2>
      </div>
      <ul className={styles.groups}>
        {groups.map((group) => (
          <li key={group.id} className={styles.groupRow}>
            <span className={styles.groupText}>
              <span className={facilitator.personName}>{group.name}</span>
              <span className={styles.rowMeta}>
                {group.waiting === 0 ? NOTHING_TO_GIVE_FEEDBACK_ON : toGiveFeedbackOnWords(group.waiting)}
              </span>
            </span>
            <Link href={group.href} className={facilitator.buttonGhost} aria-label={`${GIVE_FEEDBACK}: ${group.name}`}>
              {GIVE_FEEDBACK}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
