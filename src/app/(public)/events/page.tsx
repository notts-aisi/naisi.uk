import type { Metadata } from "next";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import DateTile from "@/components/ui/DateTile";
import NetField from "@/components/ui/NetField";
import {
  clockTime,
  hasEnded,
  placesState,
  placesTone,
  placesWords,
  tileParts,
} from "@/features/events/eventWhen";
import links from "@/features/events/eventLinks.module.css";
import { listPublishedEvents } from "@/features/events/fetchEvents";
import { fetchPublicTerm } from "@/features/term/fetchPublicTerm";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import { publicLocationText } from "@/lib/events/location";
import styles from "./events.module.css";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Upcoming NAISI events. Socials, talks, fellowship sessions. RSVP to save a spot.",
};

export const dynamic = "force-dynamic";

type ListedEvent = Awaited<ReturnType<typeof listPublishedEvents>>[number];

/** How many past events the page lists. The newest are the ones kept. */
const PAST_LIMIT = 20;

/**
 * Split published events into what is still to come and what is over,
 * against the request-time clock. Kept in a plain helper so the component
 * render body stays free of the impure Date read.
 *
 * An event is "past" once it has ended (`hasEnded`), not once it has started:
 * a card that says "Ended" has to be true, and an event that began an hour
 * ago is still on. The fetcher hands these back oldest first, so the past
 * ones are turned round here: the newest is the one a visitor is looking for.
 */
function splitByEnd(events: ListedEvent[]): {
  upcoming: ListedEvent[];
  past: ListedEvent[];
  thisYear: string;
} {
  const now = new Date();
  const upcoming: ListedEvent[] = [];
  const past: ListedEvent[] = [];
  for (const event of events) {
    (hasEnded(event.startAt, event.endAt, now) ? past : upcoming).push(event);
  }
  past.sort((a, b) => (b.startAt?.getTime() ?? 0) - (a.startAt?.getTime() ?? 0));
  return { upcoming, past, thisYear: formatSiteDate(now, { year: "numeric" }) };
}

export default async function PublicEventsIndex() {
  // The two reads do not depend on each other. Of the term, the page takes
  // the one field it prints and never the term itself.
  const [events, { label: termLabel }] = await Promise.all([
    listPublishedEvents(),
    fetchPublicTerm(),
  ]);
  const { upcoming, past, thisYear } = splitByEnd(events);
  const shownPast = past.slice(0, PAST_LIMIT);
  // The line over the heading is the term's own name, as its application
  // form carries it, while there is a term a visitor may be told about. With
  // no such term, and when the term cannot be read (`fetchPublicTerm` then
  // answers as if there were none), the page says what it is. No term's name
  // and no date is written in this file.
  const eyebrow = termLabel?.trim() || "Events";

  const emails = (
    <div className={styles.emails}>
      <div className={styles.emailsWords}>
        <p className={styles.emailsTitle}>Want to hear about new events?</p>
        <p className={styles.emailsText}>
          Join the mailing list and we&rsquo;ll email you when we add one.
        </p>
      </div>
      <Link href="/#stay-in-touch" className={`${links.link} ${links.secondary}`}>
        Get the emails
      </Link>
    </div>
  );

  return (
    <>
      <section className={styles.hero}>
        <NetField net="hero" strength="medium" className={styles.heroField}>
          <div className="container">
            <p className={`meta ${styles.eyebrow}`}>{eyebrow}</p>
            <h1 className={styles.title}>What&rsquo;s on.</h1>
            <p className={styles.lede}>
              Socials, talks and film nights. They&rsquo;re free, and you can just turn up to
              most of them.
            </p>
          </div>
        </NetField>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Upcoming</h2>
            {upcoming.length > 0 && (
              <p className={`meta ${styles.sectionNote}`}>
                {upcoming.length === 1 ? "1 event" : `${upcoming.length} events`}
              </p>
            )}
          </div>
          {upcoming.length === 0 ? (
            <p className={styles.empty}>No events on the calendar right now. Check back soon.</p>
          ) : (
            <ul className={styles.grid}>
              {upcoming.map((e) => (
                <li key={e.id}>
                  <EventCard event={e} thisYear={thisYear} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className="container">
          {shownPast.length > 0 && (
            <>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Past</h2>
                <p className={`meta ${styles.sectionNote}`}>Newest first</p>
              </div>
              <ul className={styles.grid}>
                {shownPast.map((e) => (
                  <li key={e.id}>
                    <EventCard event={e} thisYear={thisYear} ended />
                  </li>
                ))}
              </ul>
            </>
          )}
          {emails}
        </div>
      </section>
    </>
  );
}

function EventCard({
  event,
  thisYear,
  ended,
}: {
  event: ListedEvent;
  thisYear: string;
  ended?: boolean;
}) {
  // A drop-in ignores its capacity, so it is never "full".
  const full =
    !event.noSignup &&
    event.capacity !== null &&
    typeof event.rsvpCountConfirmed === "number" &&
    event.rsvpCountConfirmed >= event.capacity;
  const places = placesState(event);
  // The public location text, the same call UpcomingEvents and calendar.ics
  // make. This page reads through the Admin SDK, so Firestore rules provide
  // no defence: printing the stored location raw would publish the exact
  // venue of a hidden-location event to anonymous visitors.
  const where = publicLocationText(event);
  // The tile carries the day and the month. It has no line for a year, so a
  // date in another year says so beside the time.
  const year = event.startAt ? formatSiteDate(event.startAt, { year: "numeric" }) : thisYear;
  const time = event.startAt
    ? year === thisYear
      ? clockTime(event.startAt)
      : `${clockTime(event.startAt)} · ${year}`
    : null;

  return (
    <Link
      href={`/events/${event.id}`}
      className={ended ? `${styles.card} ${styles.cardPast}` : styles.card}
    >
      {event.startAt ? (
        <DateTile
          size="lg"
          {...tileParts(event.startAt)}
          dateTime={event.startAt.toISOString()}
          className={styles.tile}
        />
      ) : (
        <div className={`meta ${styles.noDate}`}>Date to be confirmed</div>
      )}
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{event.title || "(no title)"}</h3>
        {ended ? (
          <p className={styles.cardMeta}>
            {where && <span>{where}</span>}
            {time && <span>{time}</span>}
          </p>
        ) : (
          (time || where) && (
            <p className={styles.cardMeta}>{[time, where].filter(Boolean).join(" · ")}</p>
          )
        )}
        <div className={styles.cardFoot}>
          {ended ? (
            <span className={styles.ended}>Ended</span>
          ) : (
            <>
              {event.visibility === "members" && <Badge tone="accent">Account needed</Badge>}
              {event.noSignup && <Badge tone="success">No sign-up needed</Badge>}
              {full && event.waitlistEnabled && (
                <Badge tone="warning">Full · waiting list open</Badge>
              )}
              {full && !event.waitlistEnabled && <Badge tone="danger">Full</Badge>}
              {!full && places.kind === "left" && (
                <Badge tone={placesTone(places)}>{placesWords(places)}</Badge>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
