import Link from "next/link";
import Chip from "@/components/ui/Chip";
import DateTile from "@/components/ui/DateTile";
import { ChevronRight } from "./icons";
import type { HomeEvent } from "./homeData";
import styles from "./home.module.css";

/**
 * The next few events, on Home.
 *
 * Two layouts of one list. `rows` is a card of rows, each with the one thing
 * to do about that event. `cards` is a pair of small cards under a heading,
 * for a member whose Home is already about their programme.
 *
 * "Request a place" is a link to the event's own page, where the sign-up form
 * is. Nothing is signed up to from here.
 */

function placesChip(event: HomeEvent) {
  if (event.dropIn) return <Chip tone="success">Just turn up</Chip>;
  if (event.placesLeft === null) return null;
  if (event.placesLeft > 0) {
    return (
      <Chip tone="neutral">
        {event.placesLeft} {event.placesLeft === 1 ? "place" : "places"} left
      </Chip>
    );
  }
  return event.waitingList ? (
    <Chip tone="warning">Full · waiting list open</Chip>
  ) : (
    <Chip tone="neutral">Full</Chip>
  );
}

function action(event: HomeEvent) {
  const page = `/events/${encodeURIComponent(event.eventId)}`;
  if (event.dropIn) {
    return (
      <Link href={`${page}/calendar`} className={styles.textLink}>
        Add to calendar
      </Link>
    );
  }
  if (event.placesLeft === 0) {
    return (
      <Link href={page} className={styles.secondary}>
        {event.waitingList ? "Join the waiting list" : "See the event"}
      </Link>
    );
  }
  return (
    <Link href={page} className={styles.secondary}>
      Request a place
    </Link>
  );
}

export default function ComingUp({
  events,
  layout = "rows",
}: {
  events: HomeEvent[];
  layout?: "rows" | "cards";
}) {
  const cards = layout === "cards";
  const headingId = `home-coming-up-${layout}`;
  // Under a programme, a Home with no events says nothing about them.
  if (cards && events.length === 0) return null;

  return (
    <section className={cards ? styles.eventsPlain : styles.card} aria-labelledby={headingId}>
      <div className={styles.cardHead}>
        <h2 id={headingId} className={styles.cardTitle}>
          Coming up
        </h2>
        <Link href="/events" className={styles.headLink}>
          All events
          <ChevronRight />
        </Link>
      </div>

      {events.length === 0 ? (
        <p className={styles.quiet}>No events coming up yet.</p>
      ) : (
        <ul className={cards ? styles.eventCards : styles.eventRows} role="list">
          {events.slice(0, cards ? 2 : events.length).map((event) => (
            <li key={event.eventId} className={cards ? styles.eventCard : styles.eventRow}>
              <DateTile
                size={cards ? "md" : "sm"}
                weekday={event.tile.weekday}
                day={event.tile.day}
                month={event.tile.month}
                dateTime={event.startsAt}
              />
              <div className={styles.eventBody}>
                <h3 className={styles.eventTitle}>
                  <Link href={`/events/${encodeURIComponent(event.eventId)}`}>{event.title}</Link>
                </h3>
                <p className={styles.eventMeta}>
                  <span>{[event.clock, event.place].filter(Boolean).join(" · ")}</span>
                  {!cards && placesChip(event)}
                  {event.membersOnly && <Chip tone="neutral">Members only</Chip>}
                </p>
                {cards && <p className={styles.eventChips}>{placesChip(event)}</p>}
              </div>
              {!cards && <div className={styles.eventAction}>{action(event)}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
