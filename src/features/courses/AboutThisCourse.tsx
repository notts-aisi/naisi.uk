import Link from "next/link";
import type { GuideLinks } from "@/lib/courses/guide/model";
import { GUIDE_READERS_LINE } from "@/lib/courses/facilitatorGuide/words";
import { standingGuideLink, type FacilitatorGuideProp } from "@/lib/courses/facilitatorGuide/links";
import { ABOUT_THIS_COURSE, GLOSSARY, START_HERE, START_HERE_CARD_LINE, termsCountWords } from "@/lib/courses/guide/words";
import styles from "./RunHome.module.css";
import weekly from "./weekly/weekly.module.css";

/**
 * The programme page's "About this course": the programme's
 * Start here, with what it covers, and its Glossary, with its count of
 * terms. Each is linked only when the run has its document. For somebody the
 * course's facilitator guide admits, and nobody else, a third row,
 * "Facilitator guide", with who sees it: the server page hands
 * `facilitatorGuide` to them alone. With none of the three, nothing is
 * drawn; the guide's row alone draws the card. Drawn with the programme
 * page's own stylesheets, the weekly cards' frame and title beside "Your
 * group".
 */
export default function AboutThisCourse({
  runId,
  links,
  facilitatorGuide = null,
  className,
}: {
  runId: string;
  links: GuideLinks | null;
  facilitatorGuide?: FacilitatorGuideProp | null;
  className?: string;
}) {
  const startHere = links?.startHere === true;
  const glossaryTerms = links ? links.glossaryTerms : null;
  const facilitatorRow = facilitatorGuide ? standingGuideLink(facilitatorGuide) : null;
  if (!startHere && glossaryTerms === null && !facilitatorRow) return null;
  const base = `/learn/${encodeURIComponent(runId)}`;
  return (
    <section className={`${weekly.card} ${className ?? ""}`} aria-labelledby="about-this-course">
      <h2 id="about-this-course" className={weekly.cardTitle}>
        {ABOUT_THIS_COURSE}
      </h2>
      <ul className={styles.aboutList} role="list">
        {startHere && (
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
        {glossaryTerms !== null && (
          <li>
            <Link className={styles.aboutLink} href={`${base}/glossary`}>
              <span>
                <span className={styles.aboutName}>{GLOSSARY}</span>
                <span className={styles.aboutLine}>{termsCountWords(glossaryTerms)}</span>
              </span>
              <span className={styles.aboutArrow} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        )}
        {facilitatorRow && (
          <li>
            <Link className={styles.aboutLink} href={facilitatorRow.href}>
              <span>
                <span className={styles.aboutName}>{facilitatorRow.label}</span>
                <span className={styles.aboutLine}>{GUIDE_READERS_LINE}</span>
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
