import Link from "next/link";
import { Chip } from "@/features/applications/editor/controls";
import { ArrowRightIcon } from "@/features/applications/editor/Icons";
import kit from "@/features/applications/kit/kit.module.css";
import type { NeedsYouRow, TermHomeView } from "@/lib/applications/lifecycle/termHome";
import styles from "./TermHome.module.css";

/**
 * The parts of the term page that lead to the other screens: what is waiting
 * for the person looking, and what else the term holds.
 *
 * Both are drawn from `buildTermHome`, which was handed every number already
 * worked out. Nothing here counts, and nothing here decides who is shown
 * what.
 */

function RowText({ row }: { row: NeedsYouRow }) {
  return (
    <span className={styles.rowText}>
      {row.parts.map((part, at) =>
        part.tone === "strong" ? (
          <strong key={at}>{part.text}</strong>
        ) : part.tone === "muted" ? (
          <span key={at} className={styles.whose}>
            {part.text}
          </span>
        ) : (
          <span key={at}>{part.text}</span>
        ),
      )}
    </span>
  );
}

/** What is waiting for this person, one row a thing. */
export function NeedsYou({ needsYou }: { needsYou: NonNullable<TermHomeView["needsYou"]> }) {
  return (
    <section className={styles.card} aria-labelledby="needs-you">
      <h2 id="needs-you" className={styles.cardTitle}>
        Needs you
      </h2>
      {needsYou.empty ? (
        <p className={styles.nothing}>{needsYou.empty}</p>
      ) : (
        <ul className={styles.rows}>
          {needsYou.rows.map((row) => (
            <li key={row.key} className={styles.row}>
              <RowText row={row} />
              <span className={styles.rowSide}>
                {row.chip && <Chip>{row.chip}</Chip>}
                {row.link && (
                  <Link
                    href={row.link.href}
                    className={row.link.primary ? `${styles.go} ${styles.goPrimary}` : styles.go}
                  >
                    <span>{row.link.label}</span>
                    <ArrowRightIcon />
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What else the term holds, under the programmes. */
export function AlsoThisTerm({ pooled }: { pooled: NonNullable<TermHomeView["pooled"]> }) {
  return (
    <section className={styles.also} aria-labelledby="also-this-term">
      <h2 id="also-this-term" className={kit.mono}>
        Also this term
      </h2>
      <div className={styles.alsoGrid}>
        <div className={styles.card}>
          <div className={styles.alsoHead}>
            <h3 className={styles.cardTitle}>Pooled applicants</h3>
            <Chip>{pooled.chip}</Chip>
          </div>
          <p className={styles.alsoLine}>{pooled.line}</p>
          <Link href={pooled.link.href} className={styles.see}>
            <span>{pooled.link.label}</span>
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}
