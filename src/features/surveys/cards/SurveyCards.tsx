import { Fragment } from "react";
import Link from "next/link";
import type { SurveyCard } from "@/lib/surveys/waiting";
import styles from "./SurveyCards.module.css";

/**
 * "A SURVEY FOR YOU" (HANDOFF, "Home and My programmes"; Q50 B for week 1's
 * first card): a card for each survey waiting for the person, worded on the
 * server by `surveysWaitingFor`, which is the one answer to whether one is
 * waiting. This only draws it: what it is, its programme, how long, when it
 * closes, and "Answer", which opens the person's own link. Never how many
 * others have answered.
 *
 * `programme` leaves the programme's name out where the page is the
 * programme's own (week 1). A link, so it reads and works from the first HTML.
 * Each part of the line under the title wraps as one piece, so "Closes Wed 4
 * Nov" is never split across two lines on a phone.
 */
export default function SurveyCards({
  cards,
  programme = true,
}: {
  cards: readonly SurveyCard[];
  programme?: boolean;
}) {
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map((card) => {
        const titleId = `survey-card-${card.surveyId}`;
        const meta = [programme ? card.programme : "", card.size, card.closes].filter(Boolean);
        return (
          <section key={card.surveyId} className={styles.card} aria-labelledby={titleId}>
            <p className={styles.eyebrow}>{card.eyebrow}</p>
            <h2 id={titleId} className={styles.title}>
              {card.title}
            </h2>
            {meta.length > 0 && (
              <p className={styles.meta}>
                {meta.map((part, i) => (
                  <Fragment key={i}>
                    {i > 0 ? " · " : null}
                    <span className={styles.part}>{part}</span>
                  </Fragment>
                ))}
              </p>
            )}
            <div className={styles.links}>
              <Link href={card.href} prefetch={false} className={styles.link} aria-describedby={titleId}>
                {card.answer}
                <Arrow />
              </Link>
            </div>
          </section>
        );
      })}
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
