import { Fragment } from "react";
import Link from "next/link";
import type { PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import TermApplyLink from "@/features/term/TermApplyLink";
import TermStatusLine from "@/features/term/TermStatusLine";
import ArrowIcon from "./ArrowIcon";
import HeroFrame from "./HeroFrame";
import HeroMark from "./HeroMark";
import { heroActions, type HeroAction } from "./homeWords";
import styles from "./HomeHero.module.css";

/**
 * THE HERO'S WORDS: the mark, the headline, the lede, the two buttons for
 * this stage of the term, the status line and the award.
 *
 * A Server Component. Everything a visitor reads here is in the page's HTML,
 * so it reads with no script, and it reads with no scene behind it.
 *
 * What a maintainer has to keep:
 *
 *  - The attributes `data-keepout` (with `data-pad`, `data-feather` and
 *    `data-strength`), `data-mark`, `data-word` and `data-accent-text` are
 *    how the animated scene finds the words and steers round them. They are
 *    not styling hooks: leave each where it is, with its numbers. The typed
 *    sentence is the ONLY child of the element marked `data-accent-text`.
 *  - A piece that one form of the hero does not show (the tagline on a
 *    laptop, the award on a phone) is set aside by the stylesheet, never
 *    hidden with `display: none`, which the scene would read as a hole.
 *  - `HeroFrame` wraps the whole hero and takes only its children and a
 *    class. It is the one piece swapped for the scene. The frame is what
 *    sits under the site's bar: these words only keep clear of it, with
 *    their own padding at the top (the bar's height and 2rem more). They do
 *    not mark the bar for the scene, which knows where it put itself.
 *  - The stage comes from the term (`fetchPublicTerm`), handed in as fields.
 *    No date is written in this file.
 */
type Props = {
  stage: PublicTermStage;
  opensAt: Date | null;
  closesAt: Date | null;
  /** The day everybody hears, as stored: "2026-10-23". */
  decisionsByDate: string | null;
  /** The address of the form, while it is open. */
  applyPath: string | null;
  /** The form that opens after this one, when there is one. */
  nextLabel: string | null;
  nextOpensAt: Date | null;
};

const CERTIFICATE = "/brand/naisi-newcomer-certificate.pdf";

/** The words of the headline's first sentence, each rising in a little after the last. */
const FIRST_SENTENCE = [
  { word: "Make", delay: "500ms" },
  { word: "AI", delay: "620ms" },
  { word: "go", delay: "740ms" },
  { word: "well.", delay: "860ms" },
];

export default function HomeHero({
  stage,
  opensAt,
  closesAt,
  decisionsByDate,
  applyPath,
  nextLabel,
  nextOpensAt,
}: Props) {
  const { primary, secondary } = heroActions({ stage, closesAt, nextLabel });

  return (
    <HeroFrame className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.stack}>
          <HeroMark />
          <p
            data-keepout="tagline"
            data-pad="10"
            data-feather="40"
            data-strength="0.75"
            className={styles.tagline}
          >
            Nottingham AI Safety Initiative
          </p>
          <h1
            data-keepout="headline"
            data-pad="18"
            data-feather="64"
            data-strength="0.8"
            className={styles.headline}
          >
            <span className="visually-hidden">Make AI go well. From Nottingham.</span>
            <span aria-hidden="true">
              {FIRST_SENTENCE.map(({ word, delay }, index) => (
                <Fragment key={word}>
                  {index > 0 ? " " : null}
                  <span data-word="" className={styles.word} style={{ animationDelay: delay }}>
                    {word}
                  </span>
                </Fragment>
              ))}
            </span>{" "}
            <span aria-hidden="true" className={styles.accent}>
              <span data-accent-text="" className={styles.accentText}>
                From Nottingham.
              </span>
              <span className={styles.caret}>|</span>
            </span>
          </h1>
          <p
            data-keepout="lede"
            data-pad="12"
            data-feather="48"
            data-strength="0.8"
            className={styles.lede}
          >
            The AI safety community at the University of Nottingham. Fellowships, a research incubator and
            socials, open to every subject.
          </p>
          <div
            data-keepout="cta"
            data-pad="12"
            data-feather="44"
            data-strength="0.85"
            className={styles.cta}
          >
            <div className={styles.buttons}>
              <HeroButton action={primary} look="primary" stage={stage} applyPath={applyPath} />
              <HeroButton action={secondary} look="secondary" stage={stage} applyPath={applyPath} />
            </div>
            <TermStatusLine
              stage={stage}
              opensAt={opensAt}
              closesAt={closesAt}
              decisionsByDate={decisionsByDate}
              nextLabel={nextLabel}
              nextOpensAt={nextOpensAt}
              className={styles.status}
            />
          </div>
          <div className={styles.awardRow}>
            <a
              href={CERTIFICATE}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Newcomer of the Year, UoNSU Activities Awards 2026. Open the certificate (PDF)."
              data-keepout="award"
              data-pad="12"
              data-feather="40"
              data-strength="0.75"
              className={styles.award}
            >
              <span className={styles.awardName}>Newcomer of the Year</span>
              <span aria-hidden="true" className={styles.awardDot} />
              <span className={styles.awardBy}>
                <span className={styles.awardByLong}>UoNSU Activities Awards 2026</span>
                <span className={styles.awardByShort}>UoNSU 2026</span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </HeroFrame>
  );
}

/** One of the hero's two buttons: the link to the form through the term's own component, anything else a plain link. */
function HeroButton({
  action,
  look,
  stage,
  applyPath,
}: {
  action: HeroAction;
  look: "primary" | "secondary";
  stage: PublicTermStage;
  applyPath: string | null;
}) {
  const className = `${styles.button} ${look === "primary" ? styles.primary : styles.secondary}`;
  if (action.kind === "apply") {
    return (
      <TermApplyLink stage={stage} applyPath={applyPath} className={className}>
        <span>{action.label}</span>
        <ArrowIcon />
      </TermApplyLink>
    );
  }
  if (action.href.startsWith("#")) {
    return (
      <a href={action.href} className={className}>
        <span>{action.label}</span>
      </a>
    );
  }
  return (
    <Link href={action.href} className={className}>
      <span>{action.label}</span>
    </Link>
  );
}
