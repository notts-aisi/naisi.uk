import { WEEK_NOTES_WORDS } from "@/lib/courses/weekNotes/words";
import styles from "./weekNotes.module.css";

/**
 * "Built only from": a line for each thing a note's draft was sent (the
 * submitted week, each piece of feedback by its writer, each rating with its
 * comment), worked out on the server from what the draft keeps. Words only.
 */
export default function BuiltFrom({ lines }: { lines: readonly string[] }) {
  return (
    <div className={styles.built}>
      <p className={styles.builtTitle}>{WEEK_NOTES_WORDS.builtOnlyFrom}</p>
      <ul className={styles.builtList}>
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
