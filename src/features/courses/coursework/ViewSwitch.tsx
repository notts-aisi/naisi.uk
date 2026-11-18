import Link from "next/link";
import { ONE_PERSON_ONE_WEEK, ONE_QUESTION_WHOLE_GROUP, WAYS_TO_READ } from "@/lib/courses/coursework/words";
import styles from "./reading.module.css";

/**
 * THE TWO WAYS TO READ A WEEK, drawn on both: one person's week, and one
 * question across their group. The way being read is marked as the page; the
 * other is a link to the same week on the same side, landing on the same
 * person or the same question. Not drawn where the other way has nothing to
 * open (somebody in no group, or a group with nobody to read).
 */
export default function ViewSwitch({ current, other }: { current: "person" | "question"; other: string }) {
  const ways = [
    { key: "person", label: ONE_PERSON_ONE_WEEK },
    { key: "question", label: ONE_QUESTION_WHOLE_GROUP },
  ] as const;
  return (
    <nav aria-label={WAYS_TO_READ}>
      <ul className={styles.segments} role="list">
        {ways.map((way) => (
          <li key={way.key}>
            {way.key === current ? (
              <span className={styles.segmentOn} aria-current="page">
                {way.label}
              </span>
            ) : (
              <Link href={other} className={styles.segment}>
                {way.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
