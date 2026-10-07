import Link from "next/link";
import Badge from "@/components/ui/Badge";
import NetField from "@/components/ui/NetField";
import BlockView from "./BlockView";
import CoverImage from "./CoverImage";
import RsvpForm from "./RsvpForm";
import { FOOD_TAG_LABEL, type EventDoc } from "@/lib/firestore/events";
import { publicFoodLine } from "./foodLine";
import {
  clockTime,
  endWords,
  hasEnded,
  placesState,
  placesTone,
  placesWords,
  shortDate,
} from "./eventWhen";
import { googleCalendarUrl, outlookOfficeUrl } from "@/lib/events/ics";
import { locationWithheld, publicLocationLine, publicLocationText } from "@/lib/events/location";
import links from "./eventLinks.module.css";
import styles from "./EventDetailView.module.css";

/**
 * The event page: the public /events/[id] page and the authed preview.
 *
 * From the top: a way back to the list, a hero card (the date, what state the
 * event is in, the title; over the cover image where the event has one and
 * over the network motif where it has not), the facts, the places bar, then
 * two columns. The left one is what the event is: calendar buttons, the
 * description, the food line. The right one is what a visitor can do about
 * it: the sign-up panel, or a card saying why there is none (cancelled, over,
 * or nothing to sign up to).
 *
 * On a narrow screen the right column comes first, so the form is not at the
 * bottom of a long description. The panel never sticks to the screen: a
 * sign-up form can be taller than a phone, and a pinned panel is how a submit
 * button ends up underneath something.
 */
export default function EventDetailView({
  event,
  previewMode,
}: {
  event: EventDoc;
  previewMode?: boolean;
}) {
  const isCancelled = event.status === "cancelled";
  const { now, ended } = clockFor(event);
  // Nothing to sign up to and nothing to put in a calendar.
  const over = isCancelled || ended;
  const dietaryTags = event.dietaryTags ?? [];
  const foodDisplay = publicFoodLine(event);
  const whereText = publicLocationText(event);
  const calendarStart = over ? null : event.startAt;
  const membersOnly = event.visibility === "members";
  const places = placesState(event);
  const title = event.title || "(no title)";
  const dateWords = event.startAt ? shortDate(event.startAt, now) : null;
  // The date box has room for a room, not an address: it takes the public
  // location up to its first comma ("Trent B46" of "Trent B46, University
  // Park"). The whole line is in the Where fact directly underneath.
  const whereShort = whereText.split(",")[0].trim();
  const calendarEntry = calendarStart
    ? {
        title: event.title || "NAISI event",
        description: calendarDescription(event),
        location: whereText || undefined,
        startAt: calendarStart,
        endAt: event.endAt,
      }
    : null;

  const heroWords = (
    <div className={event.posterUrl ? `${styles.heroInner} ${styles.heroInnerShort}` : styles.heroInner}>
      <div className={styles.heroTop}>
        <div className={styles.dateBox}>
          {event.startAt && dateWords ? (
            <>
              <span className={`meta ${styles.dateBoxLine}`}>{dateWords.split(" ")[0]}</span>
              <span className={styles.dateBoxDay}>{dateWords.split(" ").slice(1).join(" ")}</span>
              <span className={`meta ${styles.dateBoxLine} ${styles.dateBoxLive}`}>
                {[clockTime(event.startAt), whereShort].filter(Boolean).join(" · ")}
              </span>
            </>
          ) : (
            <span className={`meta ${styles.dateBoxLine}`}>Date to be confirmed</span>
          )}
        </div>
        <div className={styles.heroChips}>
          {isCancelled && <Badge tone="danger">Cancelled</Badge>}
          {!isCancelled && ended && <Badge tone="neutral">Ended</Badge>}
          {!over && membersOnly && <Badge tone="accent">Account needed</Badge>}
          {!over && event.noSignup && <Badge tone="success">No sign-up needed</Badge>}
          {!over && places.kind !== "open" && (
            <Badge tone={placesTone(places)}>{placesWords(places)}</Badge>
          )}
        </div>
      </div>
      <h1 className={styles.title}>{title}</h1>
    </div>
  );

  return (
    <div className={styles.page}>
      {!previewMode && (
        <Link href="/events" className={`${links.back} ${styles.back}`}>
          <ChevronLeftIcon />
          <span>All events</span>
        </Link>
      )}

      <header className={styles.hero}>
        {event.posterUrl ? (
          <>
            <div className={styles.heroCover}>
              <CoverImage
                url={event.posterUrl}
                alt={event.title}
                branding={event.coverBranding}
                logoColor={event.coverLogoColor}
                stripSize={event.coverStripSize}
                logoPosition={event.coverLogoPosition}
                logoScale={event.coverLogoScale}
                logoX={event.coverLogoX}
                logoY={event.coverLogoY}
                logoBackdrop={event.coverLogoBackdrop}
                logoShadow={event.coverLogoShadow}
              />
            </div>
            <div className={styles.heroPlain}>{heroWords}</div>
          </>
        ) : (
          <NetField net="card" strength="strong" className={styles.heroField}>
            {heroWords}
          </NetField>
        )}
      </header>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={`meta ${styles.factLabel}`}>When</dt>
          <dd className={styles.factValue}>
            {event.startAt ? (
              <>
                <time dateTime={event.startAt.toISOString()}>
                  {dateWords}, {clockTime(event.startAt)}
                </time>
                {event.endAt && (
                  <>
                    {" to "}
                    <time dateTime={event.endAt.toISOString()}>
                      {endWords(event.startAt, event.endAt, now)}
                    </time>
                  </>
                )}
              </>
            ) : (
              "Date to be confirmed"
            )}
          </dd>
        </div>

        <div className={styles.fact}>
          <dt className={`meta ${styles.factLabel}`}>Where</dt>
          <dd className={styles.factValue}>
            {publicLocationLine(event)}
            {locationWithheld(event) && whereText && (
              <span className={styles.factNote}>
                Exact location shared once your RSVP is confirmed.
              </span>
            )}
          </dd>
        </div>

        <div className={styles.fact}>
          <dt className={`meta ${styles.factLabel}`}>Who can come</dt>
          <dd className={styles.factValue}>
            {membersOnly ? "People with a NAISI account" : "Everyone"}
          </dd>
        </div>
      </dl>

      {/* A drop-in keeps its capacity setting and ignores it, so a count of
          places would contradict "no sign-up needed". An event that is over
          or cancelled has no places left to count either. */}
      {event.capacity !== null && !event.noSignup && !over && (
        <div className={styles.places}>
          <div className={styles.placesWords}>
            <p className={`meta ${styles.factLabel}`}>Places</p>
            <p className={styles.placesValue}>
              {places.kind === "left" ? `${places.left} of ${places.capacity} left` : "Full"}
            </p>
          </div>
          <div className={styles.placesBar}>
            <div
              className={styles.placesTrack}
              role="progressbar"
              aria-label="Places taken"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={placesTaken(event.capacity, event.rsvpCountConfirmed)}
            >
              <div
                className={styles.placesFill}
                style={{ width: `${placesTaken(event.capacity, event.rsvpCountConfirmed)}%` }}
              />
            </div>
            {event.waitlistEnabled && (
              <p className={styles.placesNote}>
                {places.kind === "full"
                  ? "There’s a waiting list."
                  : "A waiting list opens once it’s full."}
              </p>
            )}
          </div>
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          {calendarEntry && (
            <div className={styles.calendar}>
              <p className={`meta ${styles.calendarLabel}`}>Add to calendar</p>
              <div className={styles.calendarLinks}>
                {/*
                  Anchors, never a Button inside an anchor. The .ics is
                  same-origin and served as an attachment, so it carries no
                  `download` attribute: on iOS that attribute sends the file
                  to the Files app in place of Calendar.
                */}
                <a
                  className={`${links.link} ${links.secondary} ${styles.calendarLink}`}
                  href={`/api/events/${event.id}/calendar.ics`}
                  aria-label="Add to Apple Calendar"
                >
                  Apple
                </a>
                <a
                  className={`${links.link} ${links.secondary} ${styles.calendarLink}`}
                  href={googleCalendarUrl(calendarEntry)}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Add to Google Calendar"
                >
                  Google
                </a>
                <a
                  className={`${links.link} ${links.secondary} ${styles.calendarLink}`}
                  href={outlookOfficeUrl(calendarEntry)}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Add to Outlook"
                >
                  Outlook
                </a>
              </div>
            </div>
          )}

          <section className={styles.about}>
            <h2 className={styles.aboutTitle}>About this event</h2>
            {event.blocks.length > 0 ? (
              <div className={styles.aboutBody}>
                <BlockView blocks={event.blocks} />
              </div>
            ) : (
              <p className={styles.descriptionEmpty}>No description yet.</p>
            )}
          </section>

          {(foodDisplay || dietaryTags.length > 0) && (
            <div className={styles.food}>
              <p className={`meta ${styles.foodLabel}`}>Food</p>
              <div className={styles.foodBody}>
                {foodDisplay && <p className={styles.foodText}>{foodDisplay}</p>}
                {dietaryTags.length > 0 && (
                  <div className={styles.foodTags}>
                    {dietaryTags.map((tag) => (
                      <Badge key={tag} tone="neutral">
                        {FOOD_TAG_LABEL[tag]}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={styles.aside}>
          {isCancelled ? (
            <section className={styles.statusCard}>
              <h2 className={styles.statusTitle}>This event has been cancelled.</h2>
              <p className={styles.statusText}>
                Apologies for the late notice. Keep an eye on the events page for the
                next one.
              </p>
              <div className={styles.statusActions}>
                <Link href="/events" className={`${links.link} ${links.primary}`}>
                  See what&rsquo;s on next
                </Link>
              </div>
            </section>
          ) : ended ? (
            <section className={styles.statusCard}>
              <div className={styles.statusHead}>
                <Badge tone="neutral">Ended</Badge>
                {dateWords && <span className="meta">{dateWords}</span>}
              </div>
              <h2 className={styles.statusTitle}>This event has ended.</h2>
              <p className={styles.statusText}>
                {dateWords ? `${title} was on ${dateWords}. ` : ""}Thanks to everyone who came.
              </p>
              <div className={styles.statusActions}>
                <Link href="/events" className={`${links.link} ${links.primary}`}>
                  See what&rsquo;s on next
                </Link>
                <Link href="/#stay-in-touch" className={`${links.link} ${links.secondary}`}>
                  Get event emails
                </Link>
              </div>
            </section>
          ) : event.noSignup ? (
            // A drop-in: a heading with a paragraph under it is all this needs.
            <section className={styles.statusCard}>
              <h2 className={styles.statusTitle}>No sign-up needed.</h2>
              <p className={styles.statusText}>
                Just turn up: there is nothing to fill in. If you would like a reminder, the
                calendar buttons on this page will add it for you.
              </p>
            </section>
          ) : (
            // The facts the form uses, never the document: a client
            // component's props are serialised into the public HTML.
            <RsvpForm
              eventId={event.id}
              signupForm={event.signupForm}
              visibility={event.visibility}
              capacity={event.capacity}
              rsvpCountConfirmed={event.rsvpCountConfirmed ?? 0}
              waitlistEnabled={event.waitlistEnabled}
              previewMode={previewMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The request-time clock and whether the event is over, in one helper so the
 * component's render body stays free of the impure Date read.
 */
function clockFor(event: EventDoc): { now: Date; ended: boolean } {
  const now = new Date();
  return { now, ended: hasEnded(event.startAt, event.endAt, now) };
}

/** The share of the places that are taken, as a whole percentage for the bar. */
function placesTaken(capacity: number, confirmed: number | null | undefined): number {
  return Math.max(0, Math.min(100, Math.round(((confirmed ?? 0) / capacity) * 100)));
}

/** Calendar-entry notes: the food line, if any, and a link back to the event. */
function calendarDescription(event: EventDoc): string | undefined {
  const parts: string[] = [];
  if (event.foodText?.trim()) parts.push(`Food: ${event.foodText.trim()}`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) parts.push(`${appUrl}/events/${event.id}`);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function ChevronLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
