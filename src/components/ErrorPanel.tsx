"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import NetField from "@/components/ui/NetField";
import type { WayOn } from "./ErrorPanel.ways";
import styles from "./ErrorPanel.module.css";

type Props = {
  /** A short label above the title, e.g. "Error 404". The capitals are CSS. */
  eyebrow?: string;
  /** Short, plain statement of what happened. */
  title: string;
  /** One or two sentences. Say what the reader can do, not what threw. */
  description: string;
  /** Next's reset() from the error boundary. Omit on not-found pages. */
  reset?: () => void;
  /** Next's error.digest. Rendered small, only when present. */
  digest?: string;
  /** Where "back to safety" goes. Defaults to the public homepage. */
  homeHref?: string;
  homeLabel?: string;
  /**
   * A list of places to go instead, drawn beside the words. When it is
   * given, the single "back to safety" link is left out: the list has it.
   */
  ways?: WayOn[];
  /**
   * Draw the screen as a page of its own, on the network ground, for the
   * public site. Leave it off inside a frame that has its own ground (the
   * signed-in shell, the sign-in card).
   */
  field?: boolean;
  /**
   * With `field`: make the ground at least as tall as the window and centre
   * the words in it. For the one screen that has no header or footer around
   * it, where the ground would otherwise stop part of the way down.
   */
  fill?: boolean;
};

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

/**
 * The shared body of every error and not-found page.
 *
 * Unlike src/app/global-error.tsx, these render INSIDE the root layout, so
 * tokens.css, the fonts and the Button primitive are all available and there
 * is no reason to hand-roll any of it.
 *
 * The reload affordance is not decoration. Every one of these screens is
 * reachable inside an installed home-screen app, where there is no URL bar
 * and no reload button, so a dead end here means force-quitting the app.
 *
 * Two shapes. With `field`, it is the public site's screen: the words at the
 * left of a wide ground and the ways on at the right. Without it, it is a
 * small centred block that sits inside whatever frame the route has.
 */
export default function ErrorPanel({
  eyebrow,
  title,
  description,
  reset,
  digest,
  homeHref = "/",
  homeLabel = "Go to the homepage",
  ways,
  field = false,
  fill = false,
}: Props) {
  const hasWays = ways !== undefined && ways.length > 0;
  const showHome = !hasWays;

  const words = (
    <div className={styles.words}>
      {eyebrow ? <p className={`meta ${styles.eyebrow}`}>{eyebrow}</p> : null}
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>
      {reset || showHome ? (
        <div className={styles.actions}>
          {reset ? <Button onClick={reset}>Try again</Button> : null}
          {showHome ? (
            <Link href={homeHref} className={styles.secondary}>
              {homeLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
      {digest ? <p className={styles.digest}>Reference: {digest}</p> : null}
    </div>
  );

  const list = hasWays ? (
    <nav className={styles.ways} aria-labelledby="error-panel-ways">
      <p id="error-panel-ways" className="meta">
        Try one of these
      </p>
      <ul className={styles.wayList}>
        {ways.map((way) => (
          <li key={way.href} className={styles.wayItem}>
            <Link href={way.href} className={styles.way}>
              <span className={styles.wayText}>
                <span className={styles.wayLabel}>{way.label}</span>
                <span className={styles.waySub}>{way.sub}</span>
              </span>
              <span className={styles.wayArrow}>
                <Arrow />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  ) : null;

  if (field) {
    return (
      <NetField
        net="hero"
        strength="soft"
        className={fill ? `${styles.field} ${styles.fieldFill}` : styles.field}
      >
        <div className={styles.fieldInner}>
          {words}
          {list}
        </div>
      </NetField>
    );
  }

  return (
    <div className={styles.panel}>
      {words}
      {list}
    </div>
  );
}
