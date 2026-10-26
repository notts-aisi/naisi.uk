import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import CertificateCard from "../CertificateCard";
import EndSurveyCard from "@/features/surveys/cards/EndSurveyCard";
import type { CertificateCardView } from "@/lib/courses/certificates/card";
import { WHAT_YOU_KEEP } from "@/lib/courses/memberPageWords";
import type { WhatsNext } from "@/lib/courses/whatsNext";
import type { EndSurvey } from "@/lib/surveys/waiting";
import { WhatsNextCard, type NextEvent } from "./ProgrammeEnd";
import styles from "./weekly.module.css";

/**
 * THE PROGRAMME PAGE ONCE IT IS OVER, for somebody who took part in it
 * (boards en-after-phone and en-after-nofinish-phone), drawn by `RunHome`
 * from what it and the server page hand it. In the boards' order:
 *
 *  1. The head: "You finished AGI Strategy." with the term, the group and
 *     its facilitators, when their finished record says so; otherwise "AGI
 *     Strategy has ended." with "Thanks for being part of it." and the term
 *     and group. Never that they did not finish. The words are the finished
 *     record's (`RunHome` asks it), never decided here.
 *  2. Their certificate, when they were sent one (`CertificateCard`).
 *  3. The survey at the end, while it is theirs to answer or once they have
 *     sent it (`EndSurveyCard`).
 *  4. What they keep: each thing whose page exists, linked to it.
 *  5. What's next: the term's form, the facilitate line, the next event.
 *
 * `children` follow: the programme's weeks, each week's page holding what
 * that week asked of them, and a facilitator's own group panels.
 *
 * Somebody who left is never shown this: they see the page that says they
 * left, and keep nothing (wk-left-phone).
 */

/** The survey at the end as the page is handed it, named here so its page can type its props without reaching survey code. */
export type AfterSurvey = EndSurvey;

/** The next event as the page is handed it. */
export type AfterEvent = NextEvent;

export type KeepItem = {
  /** "Your action plan". */
  title: string;
  /** "Week 6", or null for a thing of every week. */
  weeks: string | null;
  /** The page that holds it. */
  href: string;
};

export default function AfterTheEnd({
  heading,
  finished,
  thanks,
  lineParts,
  certificates,
  endSurvey,
  keep,
  whatsNext,
  nextEvent,
  children,
}: {
  /** "You finished AGI Strategy." or "AGI Strategy has ended.", the finished record's words. */
  heading: string;
  finished: boolean;
  /** "Thanks for being part of it.", for somebody whose record does not say they finished; null otherwise. */
  thanks: string | null;
  /** "Autumn 2026", "Group B", "with Rahul and Sofia". */
  lineParts: string[];
  certificates: CertificateCardView[];
  endSurvey: EndSurvey | null;
  keep: KeepItem[];
  whatsNext: WhatsNext | null;
  nextEvent: NextEvent | null;
  children?: ReactNode;
}) {
  return (
    <div className={styles.after}>
      <header className={finished ? `${styles.afterHead} ${styles.afterHeadFinished}` : styles.afterHead}>
        <h1 className={styles.afterTitle}>{heading}</h1>
        {thanks ? (
          /* After the thanks, the term and the group stay together with
             their full stop, as en-after-nofinish-phone draws them. */
          <p className={styles.afterHeadLine}>
            {thanks}
            {lineParts.length > 0 && (
              <>
                {" "}
                <span className={styles.afterPart}>{`${lineParts.join(" · ")}.`}</span>
              </>
            )}
          </p>
        ) : (
          lineParts.length > 0 && (
            /* Each part whole on a line: "Autumn 2026", "Group B", "with Rahul and Sofia" (en-after-phone). */
            <p className={styles.afterHeadLine}>
              {lineParts.map((part, index) => (
                <Fragment key={index}>
                  {index > 0 ? " · " : null}
                  <span className={styles.afterPart}>{part}</span>
                </Fragment>
              ))}
            </p>
          )
        )}
      </header>

      <CertificateCard certificates={certificates} className={styles.certPlain} />

      {endSurvey && <EndSurveyCard survey={endSurvey} look="section" />}

      {keep.length > 0 && (
        <section className={styles.endSection} aria-labelledby="what-you-keep">
          <h2 id="what-you-keep" className={styles.endCardTitle}>
            {WHAT_YOU_KEEP}
          </h2>
          <ul className={styles.keepList} role="list">
            {keep.map((item) => (
              <li key={item.href} className={styles.keepItem}>
                <Link href={item.href} className={styles.keepLink}>
                  <span className={styles.keepText}>
                    <span className={styles.keepTitle}>{item.title}</span>
                    {item.weeks && <span className={styles.keepWeeks}>{item.weeks}</span>}
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.keepChevron}>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WhatsNextCard whatsNext={whatsNext} look="section" nextEvent={nextEvent} />

      {children}
    </div>
  );
}
