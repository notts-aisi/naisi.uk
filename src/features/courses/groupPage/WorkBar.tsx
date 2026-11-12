import { BUCKETS, countBuckets, type Bucket } from "@/lib/courses/groupWeekWork/model";
import { BUCKET_LABEL } from "@/lib/courses/groupWeekWork/words";
import styles from "./GroupPage.module.css";

/** Each bucket's colour, by class: one per bucket, the same on every bar. */
const SEGMENT: Record<Bucket, string> = {
  "done-on-time": styles.segDone,
  "done-late": styles.segLate,
  done: styles.segDone,
  started: styles.segStarted,
  "not-started": styles.segNone,
  "joined-late": styles.segJoined,
};

/**
 * ONE BAR OF A WEEK'S CARD: how many people are in each bucket, as a bar
 * split in proportion and a legend with each count ("Done on time 3 · Done
 * late 1 · Started 1 · Not started 1"). Counted here from the rows the card
 * lists (`countBuckets`), so the bar and the table are one count. A bucket
 * with nobody in it is not drawn.
 */
export default function WorkBar({ label, buckets }: { label: string; buckets: readonly Bucket[] }) {
  const counts = countBuckets(buckets);
  const total = buckets.length;
  const shown = BUCKETS.filter((bucket) => counts[bucket] > 0);
  return (
    <div className={styles.workBar}>
      <p className={styles.workBarLabel}>{label}</p>
      <div className={styles.workBarTrack} aria-hidden="true">
        {total > 0 &&
          shown.map((bucket) => (
            <span key={bucket} className={`${styles.workBarSeg} ${SEGMENT[bucket]}`} style={{ width: `${(counts[bucket] / total) * 100}%` }} />
          ))}
      </div>
      <ul className={styles.workLegend} aria-label={label}>
        {shown.map((bucket) => (
          <li key={bucket} className={styles.workLegendItem}>
            <span className={`${styles.workSwatch} ${SEGMENT[bucket]}`} aria-hidden="true" />
            {BUCKET_LABEL[bucket]} <strong>{counts[bucket]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
