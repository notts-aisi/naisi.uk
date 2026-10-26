import type { ReactNode } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import type { PairsView } from "@/lib/courses/pairs/model";
import {
  EVERY_PAIR_HAS_A_LAPTOP,
  NOBODY_PAIRED_YET,
  THE_PAIRS,
  aloneWords,
  joinNames,
  noLaptopWords,
  notPairedWords,
  pairLaptopsWords,
  pairNumberWords,
  tooManyWords,
} from "@/lib/courses/pairs/words";
import styles from "@/features/courses/facilitator/facilitator.module.css";

/**
 * A GROUP'S PAIRS AS THEY STAND (no board draws them): a tile per pair with
 * its number, the faces and first names of its people and, on a week that
 * asks, who is bringing a laptop; then the checks: a pair with nobody
 * bringing a laptop (at least one per pair: a check, never a refusal), a
 * pair with one person or more than three, and who is not paired yet.
 *
 * Drawn on the group page's card (server) and live on the pairs page's form
 * as people are moved, for the group's facilitators, the programme's lead
 * and admins only: the people each page's gate admits. Names only. No hooks,
 * so the form and the server page draw the same list. Its classes are in the
 * group page's own stylesheet, imported by the name the group page imports
 * it by, so the suites that draw the group page stub it as they always have.
 */

type Person = { uid: string; name: string; firstName: string };

export type PairsCheck = { words: string; warn: boolean };

/** The lines under the pairs: what a save would refuse, the laptop check, and who is not paired yet. */
export function pairsChecks(view: PairsView<Person>, laptops: boolean): PairsCheck[] {
  const checks: PairsCheck[] = [];
  for (const pair of view.pairs) {
    if (view.alone.includes(pair.number)) checks.push({ words: aloneWords(pair.number, pair.people[0]?.firstName ?? ""), warn: true });
    if (view.tooMany.includes(pair.number)) checks.push({ words: tooManyWords(pair.number, pair.people.length), warn: true });
  }
  if (view.pairs.length === 0) return [{ words: NOBODY_PAIRED_YET, warn: false }];
  if (laptops) {
    checks.push(view.noLaptop.length === 0 ? { words: EVERY_PAIR_HAS_A_LAPTOP, warn: false } : { words: noLaptopWords(view.noLaptop), warn: true });
  }
  if (view.notPaired.length > 0) {
    checks.push({ words: notPairedWords(view.notPaired.map((person) => person.firstName)), warn: false });
  }
  return checks;
}

export default function PairsList({
  view,
  laptops,
  headingId = null,
  action = null,
}: {
  view: PairsView<Person>;
  laptops: boolean;
  /** Draws "The pairs" over the list with this id (the pairs page); the group page's card has a title of its own. */
  headingId?: string | null;
  /** A link drawn beside the checks, as the spread draws its own (the group page's card). */
  action?: ReactNode;
}) {
  const problems = new Set([...view.alone, ...view.tooMany]);
  const checks = pairsChecks(view, laptops);
  const body = (
    <>
      {view.pairs.length > 0 && (
        <ul className={styles.spreadTiles} role="list">
          {view.pairs.map((pair) => (
            <li key={pair.number} className={`${styles.spreadTile} ${problems.has(pair.number) ? styles.pairsTileWarn : ""}`}>
              <div className={styles.spreadTileHead}>
                <span className={styles.spreadName}>{pairNumberWords(pair.number)}</span>
              </div>
              <div className={styles.spreadPeople}>
                <span className={styles.spreadFaces}>
                  {pair.people.map((person) => (
                    <InitialsChip key={person.uid} name={person.name} uid={person.uid} size="sm" />
                  ))}
                </span>
                <span className={styles.spreadNames}>{joinNames(pair.people.map((person) => person.firstName))}</span>
              </div>
              {laptops && (
                <p className={`${styles.pairsLaptops} ${pair.laptops.length === 0 ? styles.pairsLaptopsNone : ""}`}>
                  {pairLaptopsWords(pair.laptops.map((person) => person.firstName))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.spreadFoot}>
        <ul className={styles.pairsChecks} role="list">
          {checks.map((check) => (
            <li key={check.words} className={`${styles.pairsCheck} ${check.warn ? styles.pairsCheckWarn : ""}`}>
              {check.words}
            </li>
          ))}
        </ul>
        {action}
      </div>
    </>
  );
  if (!headingId) return <div className={styles.pairsList}>{body}</div>;
  return (
    <section className={styles.pairsList} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.pairsHeading}>
        {THE_PAIRS}
      </h2>
      {body}
    </section>
  );
}
