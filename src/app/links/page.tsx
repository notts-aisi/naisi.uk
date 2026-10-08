import type { Metadata } from "next";
import Link from "next/link";
import DateTile from "@/components/ui/DateTile";
import NetField from "@/components/ui/NetField";
import { isOffsite } from "@/content/links";
import { CONTACT_EMAIL } from "@/content/socials";
import { listPublishedEvents } from "@/features/events/fetchEvents";
import { fetchLinksPage } from "@/features/links/fetchLinksPage";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import { publicLocationText } from "@/lib/events/location";
import { linkPreviewImages } from "@/lib/linkPreviewCard";
import LinksSignup from "./LinksSignup";
import styles from "./links.module.css";

/*
  /links: every link in one place, and where a printed QR code lands.

  NOT in the (public) route group, on purpose. That group's layout carries the
  site header, which is a client component, and this page is opened on a
  phone, at a stall, on whatever signal a sports hall has: it has to read from
  the first HTML that arrives, with no script. So it sits at the top level
  under the root layout alone and carries its own small header, with one link
  home. Nothing on it is animated in. Internal rows are next/link with
  prefetch off: the anchor it renders works before any script arrives, and a
  page of a dozen links should not fetch a dozen routes over a sports hall's
  signal.

  Static with a one-minute revalidate. The `?q=<slug>` a scanned code leaves
  in the address bar is never read here: the subscribe form reads it in the
  browser at the moment of submitting, so every code shares one cached page.

  One minute and not the home page's ten, because the rows are edited from the
  admin console and somebody who has just changed one wants to see it. The
  edit is a client-direct write, so there is no route to revalidate from; a
  short window is what stands in for it. The cost is one document read a
  minute while anybody is visiting.

  The rows come from `fetchLinksPage`, which cannot fail: it serves the
  built-in page in `src/content/links.ts` when there is nothing stored, or
  nothing sensible, or no database.

  Three things are drawn by the page itself and are not rows, so no edit can
  take them away: the way to every event, the society's address to write to,
  and the way home.
*/

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Links",
  description:
    "Every NAISI link in one place: the mailing list, upcoming events, our courses, Instagram and how to join.",
  // This page sets its own `openGraph`, which replaces the root layout's,
  // card included. It has no picture of its own, so it names the card.
  openGraph: {
    title: "NAISI: every link in one place",
    description:
      "The mailing list, upcoming events, our courses, Instagram and how to join the Nottingham AI Safety Initiative.",
    images: linkPreviewImages(),
  },
  twitter: { card: "summary_large_image", images: linkPreviewImages() },
};

async function upcomingEvents() {
  let events;
  try {
    events = await listPublishedEvents();
  } catch {
    return [];
  }
  // "Upcoming" is relative to when this page was last regenerated, which the
  // revalidate above keeps within a minute.
  const now = Date.now();
  return events
    .filter(
      (e) =>
        e.visibility === "public" &&
        !e.archived &&
        e.startAt &&
        e.startAt.getTime() >= now,
    )
    .slice(0, 3);
}

/** The glyph at the end of a row. `d` is the path in a 24 by 24 box. */
function Glyph({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

const ARROW = "M5 12h14M13 6l6 6-6 6";
const CHEVRON = "M9 6l6 6-6 6";
const EXTERNAL = "M7 17L17 7M9 7h8v8";
const MAIL = "M5.5 5.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM4 7l8 6 8-6";

export default async function LinksPage() {
  const [upcoming, content] = await Promise.all([upcomingEvents(), fetchLinksPage()]);

  return (
    <div className={styles.page}>
      <header>
        <NetField net="card" strength="medium" className={styles.header}>
          <div className={`${styles.column} ${styles.headerInner}`}>
            <div className={styles.headerTop}>
              <h1 className={styles.lockup}>
                {/* The society's own emblem file. Decorative here: the name
                    is written out beside it. A plain tag, as everywhere in
                    this codebase. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/naisi-emblem-white.png"
                  alt=""
                  width={391}
                  height={480}
                  className={styles.emblem}
                />
                <span className={styles.name}>
                  Nottingham
                  <br />
                  AI Safety
                  <br />
                  Initiative
                </span>
              </h1>
              <Link href="/" prefetch={false} className={styles.home}>
                <span>naisi.uk</span>
                <Glyph d={CHEVRON} />
              </Link>
            </div>
            <p className={styles.lede}>
              The AI safety student community at the University of Nottingham.
            </p>
          </div>
        </NetField>
      </header>

      <main className={`${styles.column} ${styles.main}`}>
        {/* Only the three buttons' state, never the page content as a whole:
            every prop a client component is handed is serialised into the
            public HTML. */}
        <LinksSignup applications={content.applications}>
          {upcoming.length > 0 && (
            <section className={styles.section} aria-labelledby="links-coming-up">
              <p className="meta">Coming up</p>
              <h2 id="links-coming-up" className={styles.sectionHeading}>
                Next events
              </h2>
              <ul className={styles.events}>
                {upcoming.map((e) => {
                  const start = e.startAt!;
                  // Through the one module that decides what a location says to
                  // a stranger. Never the event's own fields.
                  const place = publicLocationText(e) || "Location to be announced";
                  return (
                    <li key={e.id}>
                      {/* To the add-to-calendar page, not the event page: a
                          fresher should be able to put this in their calendar
                          without being asked to sign up first. The full event
                          page is one tap further on from there. */}
                      <Link href={`/events/${e.id}/calendar`} prefetch={false} className={styles.event}>
                        {/* The tile is not a <time>: the line beside it is,
                            so the date is said once. */}
                        <DateTile
                          size="md"
                          weekday={formatSiteDate(start, { weekday: "short" })}
                          day={formatSiteDate(start, { day: "numeric" })}
                          month={formatSiteDate(start, { month: "short" }).slice(0, 3)}
                        />
                        <span className={styles.eventText}>
                          <span className={styles.eventTitle}>{e.title}</span>
                          <span className={styles.eventFacts}>
                            <time dateTime={start.toISOString()}>
                              {formatSiteDate(start, { hour: "2-digit", minute: "2-digit" })}
                            </time>
                            {" · "}
                            {place}
                          </span>
                        </span>
                        <span className={styles.rowGlyph}>
                          <Glyph d={CHEVRON} size={20} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link href="/events" prefetch={false} className={styles.textLink}>
                <span>All events</span>
                <Glyph d={ARROW} />
              </Link>
            </section>
          )}
        </LinksSignup>

        {content.groups.map((group) => (
          <section key={group.id} className={styles.section}>
            <h2 className={styles.sectionHeading}>{group.heading}</h2>
            <ul className={styles.rows}>
              {group.rows.map((row) => (
                <li key={row.id} className={styles.rowItem}>
                  {row.soon ? (
                    <div className={styles.row} data-soon="true">
                      <span className={styles.rowText}>
                        <span className={styles.rowLabel}>
                          {row.label}
                          <span className={styles.soon}>Opens soon</span>
                        </span>
                        <span className={styles.rowSub}>{row.sub}</span>
                      </span>
                    </div>
                  ) : isOffsite(row.href) ? (
                    <a
                      href={row.href}
                      className={styles.row}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className={styles.rowText}>
                        <span className={styles.rowLabel}>{row.label}</span>
                        <span className={styles.rowSub}>{row.sub}</span>
                      </span>
                      <span className={styles.rowGlyph}>
                        <Glyph d={EXTERNAL} />
                      </span>
                    </a>
                  ) : (
                    <Link href={row.href} prefetch={false} className={styles.row}>
                      <span className={styles.rowText}>
                        <span className={styles.rowLabel}>{row.label}</span>
                        <span className={styles.rowSub}>{row.sub}</span>
                      </span>
                      <span className={styles.rowGlyph}>
                        <Glyph d={CHEVRON} />
                      </span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* Always here, whatever the rows above say. Not a row of its own
            group because a stored row's address is a page or an https link,
            and this one opens a message. */}
        <ul className={`${styles.rows} ${styles.contact}`}>
          <li className={styles.rowItem}>
            <a href={`mailto:${CONTACT_EMAIL}`} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>Email us</span>
                <span className={styles.rowSub}>{CONTACT_EMAIL}</span>
              </span>
              <span className={styles.rowGlyph}>
                <Glyph d={MAIL} />
              </span>
            </a>
          </li>
        </ul>

        <Link href="/" prefetch={false} className={styles.allOf}>
          <span>All of naisi.uk</span>
          <Glyph d={ARROW} />
        </Link>

        <p className={styles.foot}>
          © {new Date().getFullYear()} NAISI ·{" "}
          <Link href="/privacy" prefetch={false} className={styles.footLink}>
            Privacy
          </Link>
        </p>
      </main>
    </div>
  );
}
