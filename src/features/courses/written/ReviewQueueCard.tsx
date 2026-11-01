import type { ReactNode } from "react";
import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import type { WrittenQueueRow } from "@/lib/courses/writtenAnswers/queue";
import { FEEDBACK_TO_WRITE, TO_WRITE_LINE, WRITE_FEEDBACK, toWriteWords } from "@/lib/courses/feedback/words";
import { listLockedWords, listSentWords } from "@/lib/courses/writtenAnswerWords";

/**
 * FEEDBACK TO WRITE ON A GROUP'S PAGE (boards wk-fac-group and the
 * facilitator's phone): "3 week 2 answers", that people see feedback on
 * their page as soon as it is saved and the email goes in a batch, and each
 * person with when they submitted it (or when their week locked before they
 * did, in the review page's own words) and Write feedback, oldest first.
 * Who is listed is the one gate's, bounded by the week's session
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
          {FEEDBACK_TO_WRITE}
        </h2>
      </div>
      <div className={facilitator.queueHalf}>
        <div className={facilitator.queueHead}>
          <p className={facilitator.queueCount}>{toWriteWords(rows.map((row) => row.weekNumber))}</p>
        </div>
        <p className={facilitator.queueMeta}>{TO_WRITE_LINE}</p>
        {rows.length > 0 && (
          <ul className={facilitator.reviews}>
            {rows.map((row) => (
              <li key={`${row.uid} ${row.weekNumber}`} className={facilitator.review}>
                <InitialsChip name={row.name} uid={row.uid} size="md" />
                <span className={facilitator.reviewText}>
                  <span className={facilitator.personName}>{row.name}</span>
                  <span className={facilitator.queueMeta}>
                    {row.locked ? listLockedWords(new Date(row.firstSentAt)) : listSentWords(new Date(row.firstSentAt))}
                  </span>
                </span>
                <Link
                  href={hrefFor(row)}
                  className={facilitator.buttonGhost}
                  aria-label={`${WRITE_FEEDBACK}: ${row.name}, week ${row.weekNumber}`}
                >
                  {WRITE_FEEDBACK}
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
 * The same for the programme's lead, a line per group of the run (their
 * Attendance tab): how many written answers wait in it for feedback, by the
 * same rule, and the way to write it. The lead gives feedback on a
 * facilitator's own answer, which no facilitator can. No board draws it:
 * its words are listed for the boards' designers.
 */
export function LeadWrittenAnswersCard({
  groups,
}: {
  /** Each group, with the week of each answer waiting in it. */
  groups: Array<{ id: string; name: string; weeks: number[]; href: string }>;
}) {
  return (
    <section className={weekly.card} aria-labelledby="lead-written-answers">
      <div className={weekly.cardHead}>
        <h2 id="lead-written-answers" className={weekly.cardTitle}>
          {FEEDBACK_TO_WRITE}
        </h2>
      </div>
      <ul className={facilitator.queueGroups}>
        {groups.map((group) => (
          <li key={group.id} className={facilitator.queueGroupRow}>
            <span className={facilitator.queueGroupText}>
              <span className={facilitator.personName}>{group.name}</span>
              <span className={facilitator.queueMeta}>{toWriteWords(group.weeks)}</span>
            </span>
            <Link href={group.href} className={facilitator.buttonGhost} aria-label={`${WRITE_FEEDBACK}: ${group.name}`}>
              {WRITE_FEEDBACK}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
