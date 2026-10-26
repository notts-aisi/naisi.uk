import type { LastTermBlockData } from "@/lib/publicNumbers/model";
import { LAST_TERM_WORDS } from "@/lib/publicNumbers/model";
import styles from "./LastTermBlock.module.css";

type Props = LastTermBlockData & {
  /** The heading's id, for the section's `aria-labelledby`. */
  headingId: string;
  /**
   * The ground the block sits on. The quotes' cards take the page floor's
   * colour on the raised ground and the raised colour on the floor, so they
   * never melt into the section behind them.
   */
  ground?: "floor" | "raised";
};

/**
 * THE "LAST TERM" BLOCK on a programme's public page (pub-agi, sv-public):
 * the numbers an admin published, each figure over its words, the quotes
 * with the term and nothing else beneath them, and the line that says what
 * it is all from.
 *
 * It takes the fields it draws (`LastTermBlockData`, made by `blockOf`) and
 * never a record, because a public page puts whatever reaches a component
 * into its HTML. No script: the public page renders it on the server, and the
 * admins' page draws the same component as its preview.
 *
 * LAID OUT BY ITS OWN WIDTH (a size container, not the screen), so the
 * preview's phone frame and its computer frame show exactly what a phone and
 * a computer would.
 */
export default function LastTermBlock({ heading, numbers, quotes, attribution, footer, headingId, ground = "floor" }: Props) {
  return (
    <div className={styles.block} data-ground={ground}>
      <p className={`meta ${styles.eyebrow}`}>{LAST_TERM_WORDS.eyebrow}</p>
      <h2 id={headingId} className={styles.title}>
        {heading}
      </h2>
      {numbers.length > 0 && (
        <ul className={styles.numbers}>
          {numbers.map((number, index) => (
            <li key={`${index}:${number.words}`} className={styles.number}>
              {number.figure.kind === "one" ? (
                <p className={styles.figure}>{number.figure.value}</p>
              ) : (
                <>
                  <p className={styles.pairLine}>
                    <span className={styles.pairFigure}>{number.figure.start}</span>
                    <span className={styles.when}>{LAST_TERM_WORDS.start}</span>
                  </p>
                  <p className={`${styles.pairLine} ${styles.pairEnd}`}>
                    <span className={styles.pairFigure}>{number.figure.end}</span>
                    <span className={styles.when}>{LAST_TERM_WORDS.end}</span>
                  </p>
                </>
              )}
              <p className={styles.words}>{number.words}</p>
            </li>
          ))}
        </ul>
      )}
      {quotes.length > 0 && (
        <ul className={styles.quotes}>
          {quotes.map((text, index) => (
            <li key={`${index}:${text}`} className={styles.quote}>
              <figure className={styles.quoteFigure}>
                <blockquote className={styles.quoteWords}>{`“${text}”`}</blockquote>
                <figcaption className={styles.attribution}>{attribution}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.footer}>{footer}</p>
    </div>
  );
}
