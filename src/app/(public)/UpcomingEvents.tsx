import Link from "next/link";
import Chip from "@/components/ui/Chip";
import DateTile from "@/components/ui/DateTile";
import { listPublishedEvents } from "@/features/events/fetchEvents";
import { socialHref } from "@/content/socials";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import { publicLocationText } from "@/lib/events/location";
import ArrowIcon from "./ArrowIcon";
import { EVENTS_PATH } from "./homeWords";
import page from "./landing.module.css";
import styles from "./UpcomingEvents.module.css";

/**
 * "WHAT'S ON": the next three public events, on the homepage.
 *
 * A Server Component. It reads the published events and keeps the ones any
 * visitor may come to that have not started yet. With none, the whole section
 * is left out.
 *
 * What a maintainer has to keep:
 *
 *  - WHERE an event is, for a visitor, is whatever `publicLocationText` says
 *    and nothing else. This file never reads an event's location itself: a
 *    hidden venue's exact address is for people with a place.
 *  - Dates and times are London's, through `formatSiteDate`. The server's own
 *    zone is not the site's.
 *  - A card carries one chip, decided by `placesChip` below from the event's
 *    own settings. A drop-in is never called full and never counts places.
 */

/** Where questions about joining go. The same address the footer and every email give. */
const CONTACT_ADDRESS = "ai-safety@uonsu.com";

type EventRow = Awaited<ReturnType<typeof listPublishedEvents>>[number];

/**
 * "6pm", "5:30pm": the time of day in London, the way the site writes it.
 * The clock is read through `formatSiteDate`, which names the zone; this only
 * rewrites the 24-hour answer it gives.
 */
function timeOfDay(at: Date): string {
  const clock = formatSiteDate(at, { hour: "2-digit", minute: "2-digit" });
  const [hours, minutes] = clock.split(":");
  const hour = Number(hours);
  if (!Number.isInteger(hour) || minutes === undefined) return clock;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minutes === "00" ? "" : `:${minutes}`}${hour < 12 ? "am" : "pm"}`;
}

/** The one chip on a card: how somebody gets in. */
function placesChip(event: EventRow): { tone: "neutral" | "success" | "warning" | "danger"; label: string } {
  // A drop-in keeps its capacity setting and ignores it.
  if (event.noSignup) return { tone: "success", label: "Just turn up" };
  if (event.capacity === null) return { tone: "neutral", label: "Everyone welcome" };
  const left = event.capacity - (event.rsvpCountConfirmed ?? 0);
  if (left > 0) return { tone: "warning", label: left === 1 ? "1 place left" : `${left} places left` };
  return event.waitlistEnabled
    ? { tone: "warning", label: "Full · waiting list open" }
    : { tone: "danger", label: "Full" };
}

export default async function UpcomingEvents() {
  let events: EventRow[];
  try {
    events = await listPublishedEvents();
  } catch {
    return null;
  }
  // Server Component: renders per request, so reading the clock here is
  // intentional. "Upcoming" is relative to the time of the request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.visibility === "public" && !e.archived && e.startAt && e.startAt.getTime() >= now)
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <section className={page.section}>
      <div className="container">
        <div className={`${page.head} ${page.headEvents}`}>
          <div className={page.headWords}>
            <p className={`meta ${page.eyebrow}`}>What’s on</p>
            <h2 className={`${page.title} ${page.titleEvents}`}>
              Come to something a little{" "}
              <span className={styles.underlined}>
                different
                <svg
                  className={styles.squiggle}
                  viewBox="0 0 200 14"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M2 9 C 40 4, 90 3, 130 6 S 185 10, 198 5" />
                </svg>
              </span>
              .
            </h2>
            <p className={`${page.lede} ${page.ledeEvents}`}>
              Socials, talks and film nights. They’re free, even if you’re not a member.
            </p>
            <p className={styles.questions}>
              Questions about joining? DM us on Instagram at{" "}
              <a
                href={socialHref("Instagram")}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.inlineLink}
              >
                @notts.ai.safety
              </a>{" "}
              or email{" "}
              <a href={`mailto:${CONTACT_ADDRESS}`} className={styles.inlineLink}>
                {CONTACT_ADDRESS}
              </a>
              .
            </p>
          </div>
          <Link href={EVENTS_PATH} className={`${page.button} ${page.outline}`}>
            <span>All events</span>
            <ArrowIcon />
          </Link>
        </div>

        <ul className={styles.list}>
          {upcoming.map((e) => {
            const start = e.startAt!;
            // Through the one module that decides what a visitor is told.
            const where = publicLocationText(e);
            const chip = placesChip(e);
            return (
              <li key={e.id}>
                <Link href={`${EVENTS_PATH}/${e.id}`} className={styles.card}>
                  <DateTile
                    size="lg"
                    weekday={formatSiteDate(start, { weekday: "short" })}
                    day={formatSiteDate(start, { day: "numeric" })}
                    month={formatSiteDate(start, { month: "short" })}
                    dateTime={start.toISOString()}
                  />
                  <div className={styles.body}>
                    <h3 className={styles.name}>{e.title || "(no title)"}</h3>
                    <p className={styles.when}>{where ? `${timeOfDay(start)} · ${where}` : timeOfDay(start)}</p>
                    <div className={styles.chip}>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
