import Link from "next/link";
import { Permanent_Marker } from "next/font/google";
import ArrowIcon from "./ArrowIcon";
import styles from "./landing.module.css";

/*
  The marker face. It is loaded here and nowhere else, so only the homepage
  asks for it, and it sets one phrase: the correction over the slogan. It is
  not preloaded, because the phrase is well below the first screen.
*/
const marker = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-marker",
});

/**
 * "WORK ON AI SAFETY": the slogan, what the field is, the two ways into it,
 * and where to read more.
 *
 * Static words. The three claims that lean on somebody else's work each link
 * to it; the page of every source is `/sources`.
 *
 * The slogan is drawn for the eye ("Worry about" struck through, "Work on"
 * written over it in marker), so the heading's real words are the hidden
 * ones, and that is what a screen reader and a search engine are given.
 */
export default function WorkOnAiSafety() {
  return (
    <section className={`${styles.section} ${styles.sectionRaised} ${marker.variable}`}>
      <div className={`container ${styles.work}`}>
        <div className={styles.workSlogan}>
          <h2 className={styles.workTitle}>
            <span aria-hidden="true" className={styles.workMarker}>
              Work on
            </span>
            <span className="visually-hidden">Work on AI safety.</span>
            <span aria-hidden="true">
              <span className={styles.workStruck}>
                Worry about
                <span className={styles.workStrike} />
              </span>
              <br />
              AI safety.
            </span>
          </h2>
        </div>

        <div className={styles.workBody}>
          <h3 className={styles.workHeading}>What is AI safety?</h3>
          <p className={styles.workLead}>
            AI keeps getting more powerful, and the companies building it are racing each other to go further.
            If it goes wrong, the damage could be{" "}
            <a
              href="https://en.wikipedia.org/wiki/Global_catastrophic_risk"
              target="_blank"
              rel="noreferrer noopener"
              className={styles.sourceLink}
            >
              catastrophic
            </a>
            , maybe even{" "}
            <a
              href="https://en.wikipedia.org/wiki/Existential_risk_from_artificial_intelligence"
              target="_blank"
              rel="noreferrer noopener"
              className={styles.sourceLink}
            >
              existential
            </a>
            . That’s why{" "}
            <a
              href="https://80000hours.org/problem-profiles/artificial-intelligence/"
              target="_blank"
              rel="noreferrer noopener"
              className={styles.sourceLink}
            >
              80,000 Hours ranks it the world’s most pressing problem
            </a>
            .
          </p>
          <p className={styles.workLine}>There are two ways to help, and you need both.</p>
          <ul className={styles.ways}>
            <li className={styles.way}>
              <h4 className={styles.wayName}>Technical</h4>
              <p className={styles.wayBody}>
                Make the models themselves safe. Look inside them, test them for dangerous abilities, and keep
                them in check if they misbehave.
              </p>
            </li>
            <li className={styles.way}>
              <h4 className={styles.wayName}>Governance</h4>
              <p className={styles.wayBody}>
                Work on the rules, institutions and deals that decide how AI gets built and who controls it.
              </p>
            </li>
          </ul>
          <p className={`${styles.workLine} ${styles.workQuiet}`}>
            It’s also a young field. Most of the big questions are still open and not many people are working
            on them, so you can make a real difference quickly. You don’t need to study computer science.
            People join us from philosophy, law, maths, history and plenty more.
          </p>
          <div className={styles.workLinks}>
            <Link href="/about" className={`${styles.button} ${styles.outline}`}>
              <span>Why we think it matters</span>
              <ArrowIcon />
            </Link>
            <Link href="/sources" className={`${styles.button} ${styles.text} ${styles.textPadded}`}>
              <span>Sources for our claims</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
