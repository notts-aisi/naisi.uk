import Link from "next/link";
import type { BeforeGroupsCard } from "@/lib/courses/weekOne/cards";
import styles from "./OnItsWay.module.css";

/**
 * "Your group’s on its way" (board st-waiting, Q13 B), with v20's "Week 1 is
 * open" (Q35 B): the card Home and My programmes draw at their top for each
 * place somebody holds before groups go out. Worded on the server
 * (`beforeGroupsCardsFor`); this only draws it. Links, so it reads and
 * works from the first HTML.
 */
export default function OnItsWay({ cards }: { cards: readonly BeforeGroupsCard[] }) {
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map((card) => (
        <section key={card.runId} className={styles.card} aria-labelledby={`on-its-way-${card.runId}`}>
          <p className={styles.eyebrow}>{card.eyebrow}</p>
          <h2 id={`on-its-way-${card.runId}`} className={styles.title}>
            {card.title}
          </h2>
          <p className={styles.body}>{card.body}</p>
          <div className={styles.links}>
            {card.weekOne && (
              <Link href={card.weekOne.href} className={styles.link}>
                {card.weekOne.label}
                <Arrow />
              </Link>
            )}
            <Link href={card.free.href} className={styles.link}>
              {card.free.label}
              <Arrow />
            </Link>
          </div>
        </section>
      ))}
    </>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
