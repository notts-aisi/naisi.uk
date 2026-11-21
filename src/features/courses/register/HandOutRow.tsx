import Link from "next/link";
import type { WeekDraw } from "@/lib/courses/packsAndCases/model";
import { COPY_IN_THE_SLIPS, REGISTER_ROW_LINE, registerRowTitleWords } from "@/lib/courses/drawCard/words";
import styles from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";

/**
 * THE REGISTER'S ROW TO THE PATHWAYS AND CASES PAGE, beside the check-in, at
 * the session that hands the slips out: "Week 3’s pathways and cases", "Hand
 * out the slips, then copy them in.", and "Copy in the slips" to the page on
 * the week they are for. The register's page decides when (`readSlipsTonight`)
 * and for whom (the page's own gate, `drawGate`); this draws it.
 *
 * No directive: a link and its words, handed to the register as a slot.
 */
export default function HandOutRow({ groupId, weekNumber, draw }: { groupId: string; weekNumber: number; draw: WeekDraw }) {
  return (
    <div className={styles.handOutRow} data-testid="register-hand-out">
      <div className={styles.handOutText}>
        <span className={styles.drawRowName}>{registerRowTitleWords(weekNumber, draw)}</span>
        <span className={weekly.cardLine}>{REGISTER_ROW_LINE}</span>
      </div>
      <Link href={`/learn/draw/${encodeURIComponent(groupId)}?week=${weekNumber}`} className={`${styles.buttonGhost} ${styles.handOutAction}`}>
        {COPY_IN_THE_SLIPS}
      </Link>
    </div>
  );
}
