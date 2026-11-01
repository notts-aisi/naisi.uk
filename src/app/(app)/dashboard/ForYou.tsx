import Link from "next/link";
import Chip from "@/components/ui/Chip";
import type { ForYouEvent } from "./homeData";
import homeStyles from "./home.module.css";
import styles from "./ForYou.module.css";

/**
 * "FOR YOU": an event for chosen people this member was invited to, on every
 * form of Home, under the greeting.
 *
 * It is not listed anywhere else and was not announced, so this card and the
 * invitation email are the two places the member hears of it. "Ask for a
 * place" opens the event's page, where the sign-up form is: the sign-up is a
 * request, which the people running it decide. Once they have asked, the card
 * says where that stands instead.
 *
 * Handed the fields it prints (`forYouEvents` in ./homeData.ts), never an
 * event document. No client part: nothing on it needs the browser.
 */

const ASKED: Record<NonNullable<ForYouEvent["asked"]>, string> = {
  pending: "You’ve asked for a place.",
  confirmed: "You have a place.",
  waitlisted: "You’re on the waiting list.",
};

export default function ForYou({ events }: { events: ForYouEvent[] }) {
  if (events.length === 0) return null;
  return (
    <>
      {events.map((event) => {
        const page = `/events/${encodeURIComponent(event.eventId)}`;
        const headingId = `home-for-you-${event.eventId}`;
        return (
          <section key={event.eventId} className={`${homeStyles.card} ${styles.card}`} aria-labelledby={headingId}>
            <div className={styles.head}>
              <p className={`meta ${styles.eyebrow}`}>For you</p>
              {event.programme && <Chip tone="accent">{event.programme}</Chip>}
            </div>
            <div className={styles.words}>
              <h2 id={headingId} className={styles.title}>
                {event.title}
              </h2>
              <p className={styles.meta}>{[event.when, event.place].filter(Boolean).join(" · ")}</p>
            </div>
            {event.asked ? (
              <div className={styles.foot}>
                <p className={styles.state}>{ASKED[event.asked]}</p>
                <Link href={page} className={homeStyles.secondary}>
                  See the event
                </Link>
              </div>
            ) : (
              <Link href={page} className={`${homeStyles.primary} ${styles.wide}`}>
                {event.dropIn ? "See the event" : "Ask for a place"}
              </Link>
            )}
          </section>
        );
      })}
    </>
  );
}
