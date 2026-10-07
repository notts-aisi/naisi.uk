import type { Metadata } from "next";
import Link from "next/link";
import NetField from "@/components/ui/NetField";
import { CONTACT_EMAIL, socialHref } from "@/content/socials";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About",
  description:
    "The Nottingham AI Safety Initiative is an official University of Nottingham society, run by students and open to every subject. What we do, why we think it matters, and how to get in touch.",
};

/*
  /about: who the society is, in five parts. Static: nothing here is read
  from the database, so the page is built once and served as it stands.

  The parts are data where there is more than one of a thing, so adding one
  is an entry in a list and never a new block of markup.
*/

type Strand = {
  /** The mono label above the card's title. */
  eyebrow: string;
  title: string;
  body: string;
  link: { label: string; href: string };
};

/*
  "What we do". One entry per card, in the order they are drawn. The grid
  fits as many as there are, so a further strand of the society's work is
  one more entry here and nothing else on the page changes.
*/
const WHAT_WE_DO: Strand[] = [
  {
    eyebrow: "Fellowships",
    title: "Fellowships",
    body: "6 weeks in a small group with a trained facilitator. This term it’s Technical AI Safety and AGI Strategy.",
    link: { label: "Fellowships", href: "/courses" },
  },
  {
    eyebrow: "Research",
    title: "The research incubator",
    body: "Replicate a published AI safety paper with a small team, then add your own twist. There’s food at every session.",
    link: { label: "The incubator", href: "/incubator" },
  },
  {
    eyebrow: "Socials",
    title: "Socials and talks",
    body: "Film nights, games nights and talks. You can just turn up to most of them.",
    link: { label: "What’s on", href: "/events" },
  },
];

/* The two sides of the field, as two small cards inside the argument. */
const SIDES = [
  {
    title: "Technical",
    body: "Make the models themselves safe, by looking inside them and testing what they can do.",
  },
  {
    title: "Governance",
    body: "Shape the rules, institutions and deals that decide how AI gets built and who controls it.",
  },
];

/* "Our first year". A number and what it counts. */
const FIRST_YEAR = [
  { value: "40+", label: "Fellows in year one" },
  { value: "9", label: "On the committee" },
  { value: "3", label: "Members to ARBOx" },
];

const CERTIFICATE_PATH = "/brand/naisi-newcomer-certificate.pdf";

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

export default function AboutPage() {
  return (
    <>
      <NetField net="hero" strength="soft" className={styles.hero}>
        <div className={`${styles.wrap} ${styles.heroInner}`}>
          <div className={styles.heroText}>
            <p className={`meta ${styles.eyebrowLive}`}>About</p>
            <h1 className={styles.title}>We’re NAISI.</h1>
            <p className={styles.lede}>
              The Nottingham AI Safety Initiative is an official University of
              Nottingham society. Students run it, and it’s open to every
              subject.
            </p>
          </div>
          {/* The society's own emblem file, never a redrawing. The second
              copy behind it is a shadow of the same shape (see the
              stylesheet). A plain tag, as everywhere in this codebase. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/naisi-emblem-white.png"
            alt="NAISI emblem"
            width={391}
            height={480}
            className={styles.emblem}
          />
        </div>
      </NetField>

      <section className={styles.section} aria-labelledby="about-what">
        <div className={styles.wrap}>
          <h2 id="about-what" className={styles.heading}>
            What we do.
          </h2>
          <ul className={styles.strands}>
            {WHAT_WE_DO.map((strand) => (
              <li key={strand.title} className={styles.strand}>
                <p className="meta">{strand.eyebrow}</p>
                <h3 className={styles.strandTitle}>{strand.title}</h3>
                <p className={styles.strandBody}>{strand.body}</p>
                <div className={styles.strandFoot}>
                  <Link href={strand.link.href} className={styles.textLink}>
                    <span>{strand.link.label}</span>
                    <Arrow />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="about-why">
        <div className={`${styles.wrap} ${styles.why}`}>
          <div className={styles.whyHead}>
            <p className="meta">Why AI safety</p>
            <h2 id="about-why" className={`${styles.heading} ${styles.headingAfterEyebrow}`}>
              Why we think it matters.
            </h2>
          </div>
          <div className={styles.whyBody}>
            <p className={styles.whyLead}>
              AI keeps getting more capable, and the companies building it are
              racing each other to go further. Our worry is that it goes badly
              wrong. The harm could be{" "}
              <a
                href="https://en.wikipedia.org/wiki/Global_catastrophic_risk"
                target="_blank"
                rel="noreferrer noopener"
                className={styles.inlineLink}
              >
                catastrophic
              </a>
              , maybe even{" "}
              <a
                href="https://en.wikipedia.org/wiki/Existential_risk_from_artificial_intelligence"
                target="_blank"
                rel="noreferrer noopener"
                className={styles.inlineLink}
              >
                existential
              </a>
              .
            </p>
            <p className={styles.whyText}>
              <a
                href="https://80000hours.org/problem-profiles/artificial-intelligence/"
                target="_blank"
                rel="noreferrer noopener"
                className={styles.inlineLink}
              >
                80,000 Hours ranks it the world’s most pressing problem
              </a>
              , and the field is still short of people. That’s why we think
              students can make a real difference. You can get to useful work
              quickly, and in our first year 3 of our members went on to ARBOx.
            </p>
            <p className={`${styles.whyText} ${styles.whyStrong}`}>
              You can work on it from the technical side or from governance.
            </p>
            <ul className={styles.sides}>
              {SIDES.map((side) => (
                <li key={side.title} className={styles.side}>
                  <h3 className={styles.sideTitle}>{side.title}</h3>
                  <p className={styles.sideBody}>{side.body}</p>
                </li>
              ))}
            </ul>
            <p className={styles.whyText}>
              Neither needs a computer science degree. People join us from
              philosophy, law, maths and history too.
            </p>
            <div>
              <Link href="/sources" className={styles.textLink}>
                <span>Sources for our claims</span>
                <Arrow />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionTight}`} aria-labelledby="about-year">
        <div className={styles.wrap}>
          {/* A heading for the outline, set as a label: the type comes from
              the span, because a heading's own rules outrank the label's. */}
          <h2 id="about-year" className={styles.labelHeading}>
            <span className="meta">Our first year</span>
          </h2>
          <div className={styles.year}>
            <div className={styles.award}>
              <p className={styles.awardPill}>
                <span className={styles.awardName}>Newcomer of the Year</span>
                <span className={styles.awardDot} aria-hidden="true" />
                <span className={styles.awardBody}>
                  <span className={styles.awardLong}>UoNSU Activities Awards 2026</span>
                  <span className={styles.awardShort}>UoNSU 2026</span>
                </span>
              </p>
              <a
                href={CERTIFICATE_PATH}
                target="_blank"
                rel="noreferrer noopener"
                className={`${styles.textLink} ${styles.certificate}`}
              >
                See the certificate (PDF)
              </a>
            </div>
            <ul className={styles.numbers}>
              {FIRST_YEAR.map((stat) => (
                <li key={stat.label} className={styles.number}>
                  <span className={styles.numberValue}>{stat.value}</span>
                  <span className={`meta ${styles.numberLabel}`}>{stat.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionTight}`} aria-labelledby="about-hello">
        <div className={styles.wrap}>
          <p className="meta">Get in touch</p>
          <h2 id="about-hello" className={`${styles.heading} ${styles.headingAfterEyebrow}`}>
            Say hello.
          </h2>
          <ul className={styles.contacts}>
            <li className={styles.contact}>
              <p className="meta">Email</p>
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.contactLink}>
                {CONTACT_EMAIL}
              </a>
              <p className={styles.contactNote}>Questions about joining, or anything else.</p>
            </li>
            <li className={styles.contact}>
              <p className="meta">Instagram</p>
              <a
                href={socialHref("Instagram")}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.contactLink}
              >
                @notts.ai.safety
              </a>
              <p className={styles.contactNote}>Event news and photos.</p>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
