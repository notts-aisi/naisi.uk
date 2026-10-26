import Link from "next/link";
import type { SurveyCard } from "@/lib/surveys/waiting";
import { LEAVING_CARD_WORDS, leavingCardLine } from "@/lib/surveys/words";
import styles from "./SurveyCards.module.css";

/**
 * The leaving survey's card on the page that says somebody left
 * (wk-left-phone, Q46): "Tell us why", "Answer", how long and that it is
 * confidential, drawn while it waits for them (`leavingSurveyCardFor`).
 * "Answer" opens their own link, made when they left. The board's words
 * called it anonymous; these are the true ones (see `LEAVING_CARD_WORDS`).
 */
export default function LeavingSurveyCard({ card }: { card: SurveyCard }) {
  const titleId = `leaving-survey-${card.surveyId}`;
  return (
    <section className={styles.leavingCard} aria-labelledby={titleId}>
      <div className={styles.leavingHead}>
        <h2 id={titleId} className={styles.leavingTitle}>
          {LEAVING_CARD_WORDS.heading}
        </h2>
        <Link href={card.href} prefetch={false} className={styles.link} aria-describedby={titleId}>
          {LEAVING_CARD_WORDS.answer}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
      <p className={styles.leavingLine}>{leavingCardLine(card.size)}</p>
    </section>
  );
}
