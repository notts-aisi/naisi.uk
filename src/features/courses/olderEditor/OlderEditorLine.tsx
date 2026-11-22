import Link from "next/link";
import { RETIRING_LINE, openProgrammeWords } from "@/lib/courses/olderEditor/words";
import styles from "./OlderEditorLine.module.css";

/**
 * The line at the top of every page of the older course editor while it is
 * retired: where its jobs are now, and on a run a programme names, the way
 * to that programme's Overview (a programme's bare address is not a page).
 * Elsewhere the sentence alone. A server component; it reads nothing.
 */
export default function OlderEditorLine({ programme }: { programme: { name: string | null; href: string } | null }) {
  return (
    <div className={styles.line}>
      <p className={styles.text}>{RETIRING_LINE}</p>
      {programme && (
        <Link href={programme.href} className={styles.link}>
          {openProgrammeWords(programme.name)}
        </Link>
      )}
    </div>
  );
}
