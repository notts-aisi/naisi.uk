import Link from "next/link";
import type { PairsView } from "@/lib/courses/pairs/model";
import { changePairsWords, pairsCardTitleWords } from "@/lib/courses/pairs/words";
import styles from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import PairsList from "./PairsList";

/**
 * PAIRS ON THE GROUP PAGE (no board draws them): for the week of the group's
 * next session, when that week asks for pairs, "Pairs in Group B" with each
 * pair, who is bringing a laptop, the checks, and the way to the pairs page
 * ("Pair people up", then "Change pairs and laptops").
 *
 * Drawn on the server for the group's live facilitators and admins, the
 * people the group page lets in. Names only. Its classes are the group
 * page's own stylesheets, imported by the names the page imports them by.
 */
export default function PairsCard({
  groupName,
  view,
  laptops,
  changeHref,
}: {
  groupName: string;
  view: PairsView<{ uid: string; name: string; firstName: string }>;
  laptops: boolean;
  changeHref: string;
}) {
  const headingId = "group-pairs";
  return (
    <section className={weekly.card} aria-labelledby={headingId}>
      <div className={weekly.cardHead}>
        <h2 id={headingId} className={weekly.cardTitle}>
          {pairsCardTitleWords(groupName)}
        </h2>
      </div>
      <PairsList
        view={view}
        laptops={laptops}
        action={
          <Link href={changeHref} className={styles.spreadLink}>
            {changePairsWords(view.pairs.length > 0, laptops)}
            <span aria-hidden="true">→</span>
          </Link>
        }
      />
    </section>
  );
}
