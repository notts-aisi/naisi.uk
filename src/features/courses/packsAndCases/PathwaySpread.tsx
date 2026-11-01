import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import type { Spread } from "@/lib/courses/packsAndCases/readers";
import { EVERYBODY_HAS_A_CASE, joinNames, notGivenYetWords } from "@/lib/courses/packsAndCases/words";
import styles from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";

/**
 * THE SPREAD ON THE GROUP PAGE (boards wk-fac-group and wk-fac-group-phone:
 * "Pathways in Group B"): a tile per pathway of the week's draw, with how
 * many have it and who, so every pathway has somebody; who has nothing yet;
 * and "Change pathways and cases", the way to the draw page. A week that
 * gives out cases alone says who has no case yet.
 *
 * Drawn on the server for the group's live facilitators and admins, the
 * people the group page lets in. Names only. Its classes are in the group
 * page's own stylesheets, imported by the names the page imports them by.
 * The board draws this inside This week's work; until that table exists it
 * is a card of its own, and the table can take it whole. Not drawn: who
 * can't make it tonight, which the register says.
 */
export default function PathwaySpread({
  title,
  spread,
  changeHref,
  changeLabel,
}: {
  title: string;
  spread: Spread;
  changeHref: string;
  changeLabel: string;
}) {
  const headingId = "group-spread";
  return (
    <section className={weekly.card} aria-labelledby={headingId}>
      <div className={weekly.cardHead}>
        <h2 id={headingId} className={weekly.cardTitle}>
          {title}
        </h2>
      </div>
      {spread.tiles.length > 0 && (
        <ul className={styles.spreadTiles} role="list">
          {spread.tiles.map((tile) => (
            <li key={tile.id} className={styles.spreadTile}>
              <div className={styles.spreadTileHead}>
                <span className={styles.spreadName}>{tile.name}</span>
                <span className={styles.spreadCount}>{tile.people.length}</span>
              </div>
              {tile.people.length > 0 && (
                <div className={styles.spreadPeople}>
                  <span className={styles.spreadFaces}>
                    {tile.people.map((person) => (
                      <InitialsChip key={person.uid} name={person.name} uid={person.uid} size="sm" />
                    ))}
                  </span>
                  <span className={styles.spreadNames}>{joinNames(tile.people.map((person) => person.firstName))}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.spreadFoot}>
        {spread.notGiven.length > 0 ? (
          <p className={styles.spreadLine}>{notGivenYetWords(spread.notGiven.map((person) => person.firstName))}</p>
        ) : (
          spread.tiles.length === 0 && <p className={styles.spreadLine}>{EVERYBODY_HAS_A_CASE}</p>
        )}
        <Link href={changeHref} className={styles.spreadLink}>
          {changeLabel}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
