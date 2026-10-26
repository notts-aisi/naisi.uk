import { Fragment } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import type { GuideLinks } from "@/lib/courses/guide/model";
import { ABOUT_THIS_COURSE, GLOSSARY, START_HERE, START_HERE_CARD_LINE, termsCountWords } from "@/lib/courses/guide/words";
import styles from "./guide.module.css";

/**
 * The ways to a programme's Start here and Glossary: the row under a week's
 * title (st-week1-phone, wk-week: "Start here · Glossary") and the
 * programme page's "About this course" card (wk-programme). Each page is
 * linked only when the run has its document; with neither, nothing is drawn.
 */

function hrefs(runId: string) {
  const base = `/learn/${encodeURIComponent(runId)}`;
  return { startHere: `${base}/start-here`, glossary: `${base}/glossary` };
}

/** "Start here · Glossary" under a week's title. */
export function WeekGuideLinks({ runId, links }: { runId: string; links: GuideLinks | null }) {
  if (!links) return null;
  const href = hrefs(runId);
  const items = [
    ...(links.startHere ? [{ key: "start-here", href: href.startHere, label: START_HERE }] : []),
    ...(links.glossaryTerms !== null ? [{ key: "glossary", href: href.glossary, label: GLOSSARY }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <p className={styles.weekLinks}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <Link className={styles.weekLink} href={item.href}>
            {item.label}
          </Link>
        </Fragment>
      ))}
    </p>
  );
}

/** The programme page's "About this course": Start here with what it covers, the Glossary with its count. */
export function AboutThisCourse({ runId, links, className }: { runId: string; links: GuideLinks | null; className?: string }) {
  if (!links || (!links.startHere && links.glossaryTerms === null)) return null;
  const href = hrefs(runId);
  return (
    <Card as="section" padding="md" className={className}>
      <h3 className={styles.cardTitle}>{ABOUT_THIS_COURSE}</h3>
      <ul className={styles.cardList} role="list">
        {links.startHere && (
          <li>
            <Link className={styles.cardLink} href={href.startHere}>
              <span>
                <span className={styles.cardName}>{START_HERE}</span>
                <span className={styles.cardLine}>{START_HERE_CARD_LINE}</span>
              </span>
              <span className={styles.cardArrow} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        )}
        {links.glossaryTerms !== null && (
          <li>
            <Link className={styles.cardLink} href={href.glossary}>
              <span>
                <span className={styles.cardName}>{GLOSSARY}</span>
                <span className={styles.cardLine}>{termsCountWords(links.glossaryTerms)}</span>
              </span>
              <span className={styles.cardArrow} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        )}
      </ul>
    </Card>
  );
}
