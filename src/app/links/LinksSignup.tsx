"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import SubscribeForm from "@/components/SubscribeForm";
import { isOffsite } from "@/content/links";
import { LINK_INTERESTS, type LinkInterest } from "@/lib/campaign/attribution";
import styles from "./links.module.css";

/**
 * The mailing list form on /links, with the three application buttons.
 *
 * Each of the three (fellowships, facilitating, the research incubator) is
 * either open or not. An admin marks one open at /admin/links and gives it an
 * address.
 *
 * OPEN: it is drawn at the top of the page as a card with one "Apply" button.
 * Applications that share an address share a card, because one form a term
 * takes all three and three buttons to the same place would say otherwise.
 *
 * NOT OPEN: the promise the society makes is an email when it opens. So its
 * row, lower down, leads to the form rather than to a page that does not
 * exist, and it says which one the person pressed by setting `interest`,
 * which the form appends to the subscription's `source`. That is how the
 * committee can tell forty people waiting on the fellowship from five.
 *
 * Those rows are real anchors to `#mailing-list`. Without JavaScript they
 * still carry the person to the form, which is the part that matters; only
 * the label of what they were waiting for is lost.
 *
 * Nothing on the form is ticked when the page loads. Pressing a row that is
 * not open is asking for one particular email, and that email goes out in the
 * newsletter, so from that press the newsletter is ticked and the line above
 * the form says so in so many words. "Tell me when fellowship applications
 * open" followed by a newsletter nobody mentioned would be consent to one
 * thing and delivery of another.
 *
 * `children` is whatever the page wants between the form and those rows (the
 * upcoming events), rendered on the server.
 *
 * The one data prop is `applications`: three booleans and three addresses that
 * the page shows anyway. It takes nothing else on purpose, because everything
 * a Server Component hands a client component is serialised into the public
 * HTML, whether or not the component renders it.
 */

const COPY: Record<LinkInterest, { button: string; heading: string }> = {
  fellowship: {
    button: "Fellowship applications",
    heading: "We'll email you when fellowship applications open.",
  },
  facilitator: {
    button: "Facilitator applications",
    heading: "We'll email you when facilitator applications open.",
  },
  incubator: {
    button: "Research incubator",
    heading: "We'll email you when the research incubator opens.",
  },
};

type Applications = Record<LinkInterest, { open: boolean; href: string }>;

/** What a card of open applications is called, from which ones it holds. */
function openTitle(ids: LinkInterest[]): string {
  const fellowship = ids.includes("fellowship");
  const incubator = ids.includes("incubator");
  if (fellowship && incubator) return "Fellowships and the research incubator";
  if (fellowship) return "Fellowships";
  if (incubator) return "The research incubator";
  return "Facilitating a group";
}

/** The line about leading a group, where the card takes facilitators too. */
function openNote(ids: LinkInterest[]): string | null {
  if (!ids.includes("facilitator")) return null;
  return ids.length > 1
    ? "Want to lead a group? Say so when you apply. We’ll train you."
    : "Want to lead a group? We’ll train you.";
}

function Arrow() {
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
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function LinksSignup({
  applications,
  children,
}: {
  applications: Applications;
  children?: ReactNode;
}) {
  const [interest, setInterest] = useState<LinkInterest | null>(null);

  // Open applications, gathered by where they lead, in the order of the list.
  const openCards: { href: string; ids: LinkInterest[] }[] = [];
  for (const id of LINK_INTERESTS) {
    if (!applications[id].open) continue;
    const card = openCards.find((c) => c.href === applications[id].href);
    if (card) card.ids.push(id);
    else openCards.push({ href: applications[id].href, ids: [id] });
  }
  const notOpen = LINK_INTERESTS.filter((id) => !applications[id].open);

  return (
    <>
      {openCards.map((card) => {
        const note = openNote(card.ids);
        const headingId = `links-open-${card.ids[0]}`;
        const label = (
          <>
            <span>Apply</span>
            <Arrow />
          </>
        );
        return (
          <section key={card.href} className={`${styles.card} ${styles.openCard}`} aria-labelledby={headingId}>
            <p className={`meta ${styles.openState}`}>Open now</p>
            <h2 id={headingId} className={styles.cardHeading}>
              {openTitle(card.ids)}
            </h2>
            {note && <p className={styles.cardNote}>{note}</p>}
            {isOffsite(card.href) ? (
              <a href={card.href} className={styles.apply} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            ) : (
              <Link href={card.href} prefetch={false} className={styles.apply}>
                {label}
              </Link>
            )}
          </section>
        );
      })}

      <section id="mailing-list" className={styles.card} aria-labelledby="links-mailing-list">
        <h2 id="links-mailing-list" className={styles.cardHeading}>
          {interest ? COPY[interest].heading : "Join the mailing list"}
        </h2>
        {interest && (
          <p className={styles.cardNote}>
            You&apos;re joining our newsletter. It is where we announce when
            fellowship, facilitator and research incubator applications open,
            alongside a short round-up of what is moving in AI safety.
            Unsubscribe any time.
          </p>
        )}
        {/* The key changes once, at the first press of a row that is not
            open, so the form starts again with the newsletter ticked. It is
            the only way to tick it from here: the form keeps its own state. */}
        <SubscribeForm
          key={interest === null ? "plain" : "asked"}
          source="links"
          interest={interest}
          channels={[
            { id: "events", label: "Events", defaultChecked: false },
            { id: "newsletter", label: "The newsletter", defaultChecked: interest !== null },
          ]}
        />
      </section>

      {children}

      {notOpen.length > 0 && (
        <section className={styles.section} aria-labelledby="links-applications">
          <h2 id="links-applications" className={styles.sectionHeading}>
            Applications
          </h2>
          <p className={styles.sectionNote}>
            {openCards.length === 0
              ? "Not open yet. Pick one, join the mailing list above, and we'll email you when it opens."
              : "For one that is not open yet, pick it, join the mailing list above, and we'll email you when it opens."}
          </p>
          <ul className={styles.rows}>
            {notOpen.map((id) => (
              <li key={id} className={styles.rowItem}>
                <a
                  href="#mailing-list"
                  className={styles.row}
                  data-selected={interest === id ? "true" : undefined}
                  onClick={() => setInterest(id)}
                >
                  <span className={styles.rowText}>
                    <span className={styles.rowLabel}>
                      {COPY[id].button}
                      <span className={styles.soon}>Opens soon</span>
                    </span>
                    <span className={styles.rowSub}>
                      {interest === id ? "Selected. The form is above." : "Get an email when it opens."}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
