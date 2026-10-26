import type { OwnPair } from "@/lib/courses/pairs/model";
import { YOUR_PAIR, ownLaptopWords, pairedWithWords } from "@/lib/courses/pairs/words";
import styles from "@/features/courses/weekBlocks/blockWeek.module.css";

/**
 * BEFORE YOU COME, FOR A SESSION IN PAIRS (Technical AI Safety's hands-on
 * night; no board draws it): under the guide's own words, who the reader is
 * paired with, by first name, and whether to bring a laptop: "You’re paired
 * with Kofi." and "Kofi is bringing a laptop." Before the facilitators pair
 * anybody the page shows the guide's words alone, as written.
 *
 * Handed the reader's own pairs and nothing else (`readOwnPairs`, read on the
 * server for the reader alone): one for each group they take part in whose
 * week asks, the group named only when there is more than one.
 */
export default function YourPair({ pairs }: { pairs: readonly OwnPair[] }) {
  if (pairs.length === 0) return null;
  const named = pairs.length > 1;
  return (
    <div className={styles.yourPair}>
      {pairs.map((pair) => (
        <div key={`${pair.groupName} ${pair.blockId}`} className={styles.yourPairGroup}>
          {(pair.partners.length > 0 || named) && (
            <p className={styles.yourPairHead}>{named ? `${YOUR_PAIR} · ${pair.groupName}` : YOUR_PAIR}</p>
          )}
          {pair.partners.length > 0 && <p className={styles.yourPairLine}>{pairedWithWords(pair.partners)}</p>}
          {pair.laptops && (pair.partners.length > 0 || pair.bringing) && (
            <p className={styles.yourPairLaptop}>{ownLaptopWords(pair.bringing, pair.partnersBringing, pair.askNames)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
