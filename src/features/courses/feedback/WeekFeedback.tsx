import InitialsChip from "@/components/ui/InitialsChip";
import type { OwnFeedbackCard } from "@/lib/courses/feedback/model";
import { FEEDBACK_HEADING, cardByWords, cardHeadingWords } from "@/lib/courses/feedback/words";
import styles from "./feedback.module.css";

/** The anchor the Feedback section is reached by: the emails' links, the old feedback page, the week's own lines. */
export const FEEDBACK_ANCHOR = "feedback";

/**
 * FEEDBACK ON THE PERSON'S OWN WEEK (privacy v15: "It appears on the week's
 * page"), under the week's status: each piece signed as it was written,
 * oldest first. From one of their group's facilitators, "Feedback from
 * Rahul" with "Your facilitator" and the day; from the programme's lead or an
 * admin, "From the NAISI team" with who wrote it and the day. Feedback given
 * before it became a comment reads the same, its levels as plain lines when
 * it had no comment. No level, mark or number is drawn, and nothing says
 * whether a piece was emailed.
 *
 * Drawn from the overview's `weeks[].feedback`, the caller's own alone, and
 * only when there is something to draw.
 */
export default function WeekFeedback({ cards, programme }: { cards: OwnFeedbackCard[]; programme: string }) {
  if (cards.length === 0) return null;
  return (
    <section id={FEEDBACK_ANCHOR} className={styles.section} aria-labelledby={`${FEEDBACK_ANCHOR}-title`}>
      <h2 id={`${FEEDBACK_ANCHOR}-title`} className={styles.sectionTitle}>
        {FEEDBACK_HEADING}
      </h2>
      <ul className={styles.cards} role="list">
        {cards.map((card) => (
          <li key={card.id} className={styles.card}>
            <div className={styles.cardHead}>
              {card.chip ? (
                <InitialsChip name={card.chip.name} uid={card.chip.uid} size="sm" />
              ) : (
                <span className={styles.teamChip} aria-hidden="true">
                  N
                </span>
              )}
              <div className={styles.cardWho}>
                <p className={styles.cardHeading}>{cardHeadingWords(card)}</p>
                <p className={styles.cardBy}>{cardByWords(card, programme)}</p>
              </div>
            </div>
            {card.text && <p className={styles.cardText}>{card.text}</p>}
            {card.lines.length > 0 && (
              <ul className={styles.cardLines} role="list">
                {card.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
