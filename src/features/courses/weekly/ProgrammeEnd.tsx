import Link from "next/link";
import type { WhatsNext } from "@/lib/courses/whatsNext";
import {
  CERTIFICATE_LINE,
  FACILITATE_NEXT_TERM,
  FIND_OUT_MORE,
  WHATS_NEXT,
  applicationsCloseWords,
  applicationsOpenWords,
} from "@/lib/courses/memberPageWords";
import styles from "./weekly.module.css";

/**
 * THE END OF A PROGRAMME, ON A MEMBER'S PAGES: what happens after the last
 * session (wk-lastweek-phone) and what's next (wk-lastweek-phone,
 * en-after-phone, en-after-nofinish-phone). Each draws what it is handed and
 * reads nothing: the words are `memberPageWords`', the facts the overview
 * route's (`whatsNext`).
 *
 * `look` is "card" on Home, where the boards draw each in a card, and
 * "section" on the programme page once it is over, where they are sections
 * with no card around them.
 */

/** "After tonight": what happens after the last session. Only the certificate line, for now. */
export function AfterLastSession({ heading }: { heading: string }) {
  return (
    <section className={`${styles.card} ${styles.endCard}`} aria-labelledby="after-last-session">
      <h2 id="after-last-session" className={styles.endCardTitle}>
        {heading}
      </h2>
      <div className={styles.afterRow}>
        <span className={styles.afterIcon} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </span>
        <p className={styles.endLine}>{CERTIFICATE_LINE}</p>
      </div>
    </section>
  );
}

/** One upcoming event, as Home picks it, for the programme page once it is over. */
export type NextEvent = {
  eventId: string;
  title: string;
  tile: { weekday: string; day: string; month: string };
  /** "7pm". */
  clock: string;
  /** Where, as anybody may be told; "" when nothing may be said. */
  place: string;
};

/** Whether there is anything for What's next to say. */
export function hasWhatsNext(whatsNext: WhatsNext | null, nextEvent: NextEvent | null = null): boolean {
  return Boolean(whatsNext?.applications) || Boolean(whatsNext?.facilitate) || nextEvent !== null;
}

/**
 * "What’s next": a form taking applications ("Applications for Spring 2027
 * close on Sun 13 Dec." and "Find out more"), or one opening ("Applications
 * for next term open in January."); "Facilitate a group next term: say so
 * when you apply." while the open form asks it; and, on the programme page
 * once it is over, the next event. Nothing when there is nothing to say.
 */
export function WhatsNextCard({
  whatsNext,
  look,
  nextEvent = null,
}: {
  whatsNext: WhatsNext | null;
  look: "card" | "section";
  nextEvent?: NextEvent | null;
}) {
  if (!hasWhatsNext(whatsNext, nextEvent)) return null;
  const applications = whatsNext?.applications ?? null;
  const line =
    applications?.kind === "open"
      ? applicationsCloseWords(applications.label, applications.closesOn)
      : applications?.kind === "opening"
        ? applicationsOpenWords(applications.opensOn)
        : "";
  const facilitate = whatsNext?.facilitate === true;
  const box = look === "card" ? `${styles.card} ${styles.endCard}` : styles.endSection;
  return (
    <section className={box} aria-labelledby={`whats-next-${look}`}>
      <h2 id={`whats-next-${look}`} className={styles.endCardTitle}>
        {WHATS_NEXT}
      </h2>
      {line && (
        <div className={styles.nextRow}>
          <p className={styles.endLine}>{line}</p>
          {applications?.kind === "open" && (
            <Link href={applications.href} className={styles.cardLink}>
              {FIND_OUT_MORE}
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      )}
      {facilitate && (
        /* Home's card rules between its rows; the programme page's section is a plain list (en-after-phone). */
        <div className={line && look === "card" ? `${styles.nextRow} ${styles.nextRowRule}` : styles.nextRow}>
          <p className={styles.endLine}>{FACILITATE_NEXT_TERM}</p>
        </div>
      )}
      {nextEvent && (
        <Link href={`/events/${encodeURIComponent(nextEvent.eventId)}`} className={styles.eventCard}>
          <span className={styles.eventStub} aria-hidden="true">
            <span className={styles.stubWeekday}>{nextEvent.tile.weekday}</span>
            <span className={styles.eventDay}>{nextEvent.tile.day}</span>
            <span className={styles.stubMonth}>{nextEvent.tile.month}</span>
          </span>
          <span className={styles.eventBody}>
            {/* The stub's date, said for a screen reader, which skips the stub. */}
            <span className={styles.srOnly}>{`${nextEvent.tile.weekday} ${nextEvent.tile.day} ${nextEvent.tile.month}: `}</span>
            <span className={styles.eventTitle}>{nextEvent.title}</span>
            <span className={styles.eventMeta}>{[nextEvent.clock, nextEvent.place].filter(Boolean).join(" · ")}</span>
          </span>
          <span className={styles.eventChevron} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </Link>
      )}
    </section>
  );
}
