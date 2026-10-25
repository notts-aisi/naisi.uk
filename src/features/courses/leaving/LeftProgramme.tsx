import Link from "next/link";
import type { LeftView } from "@/lib/courses/leftView";
import {
  BACK_TO_PROGRAMMES,
  CHANGED_AFTER,
  CHANGED_BEFORE,
  CHANGED_YOUR_MIND,
  EVENTS_OPEN,
  NOTES_LINK,
  SOCIETY_ADDRESS,
  STILL_AROUND,
  WHAT_STAYS,
  YOUR_MARKS,
  leftHeading,
  leftOnLine,
} from "@/lib/courses/leavingWords";
import styles from "./Leaving.module.css";
import { ArrowRight, ProgrammeBar } from "./Parts";

/**
 * THE PROGRAMME PAGE ONCE SOMEBODY HAS LEFT (board wk-left-phone), drawn on
 * the server from `loadLeftView`.
 *
 * What it says, from records: the day they left; what stays theirs (their
 * notes and reflections, and the reading list of every published week, both
 * read only); their own marks before they left; the society's address for
 * somebody who has changed their mind; and the site's upcoming events, the
 * section left out when there are none.
 *
 * What it never shows: the group's people, its updates, its sessions or its
 * registers. Nothing on this page is about anybody but the person reading it.
 */
export default function LeftProgramme({ view }: { view: LeftView }) {
  const home = `/learn/${encodeURIComponent(view.runId)}`;
  return (
    <div className={styles.page}>
      <ProgrammeBar backHref="/learn" backLabel={BACK_TO_PROGRAMMES} title={view.name} />
      <div className={styles.body}>
        <div className={styles.leftCard}>
          <h1 className={styles.pageTitle}>{leftHeading(view.name)}</h1>
          <p className={`${styles.text} ${styles.lede}`}>{leftOnLine(view.leftOn)}</p>
        </div>

        <section className={styles.section} aria-labelledby="left-stays">
          <h2 id="left-stays" className={styles.heading}>
            {WHAT_STAYS}
          </h2>
          <nav className={styles.panel} aria-labelledby="left-stays">
            <Link href={`${home}/notes`} className={styles.row}>
              <span className={styles.rowLabel}>{NOTES_LINK}</span>
              <span className={styles.arrow}>
                <ArrowRight />
              </span>
            </Link>
            {view.readingLink && (
              <Link href={`${home}/reading`} className={styles.row}>
                <span className={styles.rowLabel}>{view.readingLink}</span>
                <span className={styles.arrow}>
                  <ArrowRight />
                </span>
              </Link>
            )}
          </nav>
        </section>

        {view.marks.length > 0 && (
          <section className={styles.section} aria-labelledby="left-marks">
            <h2 id="left-marks" className={styles.heading}>
              {YOUR_MARKS}
            </h2>
            <ul className={styles.panel}>
              {view.marks.map((mark) => (
                <li key={mark.key}>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>{mark.label}</span>
                    <span className={styles.markValue}>{mark.mark}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.section} aria-labelledby="left-changed">
          <h2 id="left-changed" className={`${styles.heading} ${styles.headingSpaced}`}>
            {CHANGED_YOUR_MIND}
          </h2>
          <p className={styles.text}>
            {CHANGED_BEFORE}{" "}
            <a href={`mailto:${SOCIETY_ADDRESS}`} className={styles.mail}>
              {SOCIETY_ADDRESS}
            </a>{" "}
            {CHANGED_AFTER}
          </p>
        </section>

        {view.events.length > 0 && (
          <section className={styles.section} aria-labelledby="left-around">
            <h2 id="left-around" className={styles.heading}>
              {STILL_AROUND}
            </h2>
            <p className={`${styles.text} ${styles.textMuted}`}>{EVENTS_OPEN}</p>
            <ul className={styles.events}>
              {view.events.map((event) => (
                <li key={event.id}>
                  <Link href={event.href} className={styles.eventCard}>
                    <time className={styles.tile} dateTime={event.startsAt}>
                      <span className={styles.tileWeekday}>{event.tile.weekday}</span>
                      <span className={styles.tileDay}>{event.tile.day}</span>
                      <span className={styles.tileMonth}>{event.tile.month}</span>
                    </time>
                    <div className={styles.eventBody}>
                      <h3 className={styles.eventTitle}>{event.title}</h3>
                      {event.line && <p className={styles.eventLine}>{event.line}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
