import Link from "next/link";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { MY_PROGRAMMES } from "@/lib/courses/facilitatorPageWords";
import { FACILITATOR_GUIDE, GUIDE_READERS_LINE, GUIDE_REFUSED } from "@/lib/courses/facilitatorGuide/words";
import styles from "./guide.module.css";

/**
 * The frame every page of a course's facilitator guide sits in: on a phone,
 * a bar with the way back; on a laptop, the way back as a crumb; then the
 * course's name, the page's heading and who reads it. And the one calm answer
 * everybody else is given.
 *
 * Drawn on the server. Nothing here reads a document.
 */

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

type HeadProps = {
  /** Where the way back leads, and its words. */
  back: { href: string; label: string };
  /** The course's name, above the heading. Empty draws none. */
  eyebrow: string;
  heading: string;
  /** "Week 3", in the phone bar. Empty draws none. */
  barTitle?: string;
  /** Who reads the page, under the heading. False for a page that is not the guide's. */
  readers?: boolean;
};

export function GuideHead({ back, eyebrow, heading, barTitle = "", readers = true }: HeadProps) {
  return (
    <>
      <div className={`${weekly.bar} ${styles.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={back.href} className={weekly.back}>
            <BackIcon />
            <span>{back.label}</span>
          </Link>
        </div>
        {barTitle && <span className={weekly.barTitle}>{barTitle}</span>}
        <div className={weekly.barEnd} />
      </div>
      <header className={styles.head}>
        <Link href={back.href} className={styles.crumb}>
          {back.label}
        </Link>
        {eyebrow && <p className={weekly.eyebrow}>{eyebrow}</p>}
        <h1 className={weekly.title}>{heading}</h1>
        {readers && <p className={styles.who}>{GUIDE_READERS_LINE}</p>}
      </header>
    </>
  );
}

/**
 * THE ONE ANSWER for everybody the guide is not for: the same words whether
 * the course is there or not, so nobody learns which courses exist.
 */
export function GuideRefused() {
  return (
    <div className={styles.page}>
      <GuideHead back={{ href: "/learn", label: MY_PROGRAMMES }} eyebrow="" heading={FACILITATOR_GUIDE} readers={false} />
      <section className={`${styles.card} ${styles.empty}`} aria-label={FACILITATOR_GUIDE}>
        <p className={styles.cardLine}>{GUIDE_REFUSED}</p>
      </section>
    </div>
  );
}
