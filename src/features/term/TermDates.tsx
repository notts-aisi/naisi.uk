import type { PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import { termDateCells } from "./termWords";
import styles from "./TermDates.module.css";

/**
 * The strip of the term's dates: when applications close, the day everybody
 * hears and when the programmes start, each a small label over the date set
 * large. Nothing at all when there is no term, or no date to show.
 *
 * `showOpening` adds a first cell: the day applications open while that is
 * still ahead, and "Open now" once they are.
 *
 * A Server Component: the dates are formatted here, in London's time. It is
 * handed the fields it prints and nothing else. `starts` is the programmes'
 * own label ("w/c 26 Oct"), which `sharedStart` in `./termWords.ts` gives
 * when every programme agrees on one.
 */
type Props = {
  stage: PublicTermStage;
  showOpening?: boolean;
  opensAt?: Date | null;
  closesAt: Date | null;
  /** The day everybody hears, as stored: "2026-10-23". */
  decisionsByDate: string | null;
  starts: string | null;
  className?: string;
};

export default function TermDates({
  stage,
  showOpening = false,
  opensAt = null,
  closesAt,
  decisionsByDate,
  starts,
  className,
}: Props) {
  const cells = termDateCells({ stage, showOpening, opensAt, closesAt, decisionsByDate, starts });
  if (cells.length === 0) return null;
  return (
    <dl className={className ? `${styles.strip} ${className}` : styles.strip}>
      {cells.map((cell) => (
        <div key={cell.key} className={styles.cell}>
          <dt className={styles.label}>{cell.label}</dt>
          <dd className={styles.value}>
            {cell.dateTime ? <time dateTime={cell.dateTime}>{cell.value}</time> : cell.value}
          </dd>
          {cell.note ? <dd className={styles.note}>{cell.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
