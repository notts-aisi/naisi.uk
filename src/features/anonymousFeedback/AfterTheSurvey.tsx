"use client";

import { createContext, useContext, type ReactNode } from "react";
import { CARD_WORDS } from "@/lib/anonymousFeedback/words";
import styles from "./anonymousFeedback.module.css";

/**
 * THE LINK AT THE END OF THE SURVEY AT A PROGRAMME'S END, to the separate
 * anonymous form (docs/surveys.md).
 *
 * The survey's page wraps its screen in `AnonymousFormLink` with the form's
 * address, which is the same for everybody on the programme, or null on any
 * other survey. `AnonymousFormCard` draws the card wherever the survey's
 * screen reaches its end: once its answers are sent, and on its page when it
 * has been answered. The card is handed nothing but that one address, so
 * nothing about the person travels with it; the link opens with no referrer,
 * so the page it came from (a personal link's address among them) is never
 * passed on.
 */

const FormLink = createContext<string | null>(null);

export function AnonymousFormLink({ href, children }: { href: string | null; children: ReactNode }) {
  return <FormLink.Provider value={href}>{children}</FormLink.Provider>;
}

export function AnonymousFormCard() {
  const href = useContext(FormLink);
  if (!href) return null;
  return (
    <section className={styles.card} aria-label={CARD_WORDS.heading}>
      <h2 className={styles.cardHeading}>{CARD_WORDS.heading}</h2>
      <p className={styles.cardBody}>{CARD_WORDS.body}</p>
      <a href={href} rel="noreferrer" className={styles.cardLink}>
        {CARD_WORDS.link}
      </a>
    </section>
  );
}
