import Link from "next/link";
import type { GuideLinks } from "@/lib/courses/guide/model";
import { ABOUT_THIS_COURSE, GLOSSARY, START_HERE, START_HERE_CARD_LINE, termsCountWords } from "@/lib/courses/guide/words";
import styles from "./RunHome.module.css";
import weekly from "./weekly/weekly.module.css";

/**
 * The programme page's "About this course" (wk-programme): the programme's
 * Start here, with what it covers, and its Glossary, with its count of
 * terms. Each is linked only when the run has its document; with neither,
 * nothing is drawn. Drawn with the programme page's own stylesheets, the
 * weekly cards' frame and title beside "Your group".
 */
export default function AboutThisCourse({ runId, links, className }: { runId: string; links: GuideLinks | null; className?: string }) {
  if (!links || (!links.startHere && links.glossaryTerms === null)) return null;
  const base = `/learn/${encodeURIComponent(runId)}`;
  return (
    <section className={`${weekly.card} ${className ?? ""}`} aria-labelledby="about-this-course">
      <h2 id="about-this-course" className={weekly.cardTitle}>
        {ABOUT_THIS_COURSE}
      </h2>
      <ul className={styles.aboutList} role="list">
        {links.startHere && (
          <li>
            <Link className={styles.aboutLink} href={`${base}/start-here`}>
              <span>
                <span className={styles.aboutName}>{START_HERE}</span>
                <span className={styles.aboutLine}>{START_HERE_CARD_LINE}</span>
              </span>
              <span className={styles.aboutArrow} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        )}
        {links.glossaryTerms !== null && (
          <li>
            <Link className={styles.aboutLink} href={`${base}/glossary`}>
              <span>
                <span className={styles.aboutName}>{GLOSSARY}</span>
                <span className={styles.aboutLine}>{termsCountWords(links.glossaryTerms)}</span>
              </span>
              <span className={styles.aboutArrow} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
