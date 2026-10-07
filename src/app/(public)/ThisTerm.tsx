import Link from "next/link";
import Chip from "@/components/ui/Chip";
import NetField from "@/components/ui/NetField";
import { getPublishedCourse } from "@/features/courses/fetchCourses";
import TermApplyLink from "@/features/term/TermApplyLink";
import TermDates from "@/features/term/TermDates";
import { sharedStart } from "@/features/term/termWords";
import type { PublicTermProgramme, PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import ArrowIcon from "./ArrowIcon";
import { THIS_TERM_ID, programmeChip, startChipLabel, termSentence } from "./homeWords";
import styles from "./landing.module.css";

/**
 * "THIS TERM": the term's dates, a card for each of its programmes, and the
 * row about leading a group.
 *
 * A Server Component, drawn from the term's own fields and nothing written
 * here: the programmes, their words and their dates are whatever the term's
 * form holds. It draws nothing at all when there is no term (`none`).
 *
 * What a maintainer has to keep:
 *
 *  - A card's "Read more" is only drawn when the programme is tied to a
 *    course AND that course's page would open. The tie is stored on the form
 *    and nobody checks it there: a course can be unpublished or deleted
 *    afterwards. `getPublishedCourse` is the question the course's own page
 *    asks before it renders, so the link is there exactly when the page is.
 *  - "Apply" is `TermApplyLink`, which draws itself only while the form is
 *    open. No other link to the form is made here.
 */
type Props = {
  stage: PublicTermStage;
  /** The term's name: "Autumn 2026". */
  label: string | null;
  closesAt: Date | null;
  /** The day everybody hears, as stored: "2026-10-23". */
  decisionsByDate: string | null;
  /** The address of the form, while it is open. */
  applyPath: string | null;
  programmes: readonly PublicTermProgramme[];
};

/**
 * Which part of the one network drawing each card's picture shows, in turn,
 * so that cards side by side do not all carry the same picture.
 */
const CARD_NET_WINDOWS = [styles.cardNetTop, styles.cardNetMiddle, styles.cardNetBottom];

/** Where "How applying works" is explained: on the fellowships page. */
const HOW_APPLYING_WORKS = "/courses#how-it-works";

/** The ids, of those the programmes are tied to, whose course page would open. */
async function openCoursePages(programmes: readonly PublicTermProgramme[]): Promise<Set<string>> {
  const tied = [...new Set(programmes.flatMap((programme) => (programme.courseId ? [programme.courseId] : [])))];
  const found = await Promise.all(
    tied.map(async (courseId) => {
      try {
        return (await getPublishedCourse(courseId)) ? courseId : null;
      } catch (err) {
        // A read that fails hides the link. It never takes the page down.
        console.error("[home] could not check a programme's course page", err);
        return null;
      }
    }),
  );
  return new Set(found.flatMap((courseId) => (courseId ? [courseId] : [])));
}

export default async function ThisTerm({ stage, label, closesAt, decisionsByDate, applyPath, programmes }: Props) {
  if (stage === "none") return null;

  const withPage = await openCoursePages(programmes);
  const sentence = termSentence(programmes, stage);
  const chip = programmeChip(stage, closesAt);

  return (
    <section id={THIS_TERM_ID} className={`${styles.section} ${styles.sectionFirst}`}>
      <div className="container">
        <div className={styles.head}>
          <div className={styles.headWords}>
            {label ? <p className={`meta ${styles.eyebrow} ${styles.eyebrowLive}`}>{label}</p> : null}
            <h2 className={styles.title}>This term.</h2>
            {sentence ? <p className={styles.lede}>{sentence}</p> : null}
          </div>
          <Link href={HOW_APPLYING_WORKS} className={`${styles.button} ${styles.outline}`}>
            <span>How applying works</span>
            <ArrowIcon />
          </Link>
        </div>

        <TermDates
          stage={stage}
          closesAt={closesAt}
          decisionsByDate={decisionsByDate}
          starts={sharedStart(programmes)}
        />

        {programmes.length > 0 ? (
          <ul className={styles.cards}>
            {programmes.map((programme, index) => {
              const starts = startChipLabel(stage, programme.starts);
              const hasPage = programme.courseId !== null && withPage.has(programme.courseId);
              return (
                <li key={programme.id}>
                  <article className={styles.card}>
                    <div className={styles.cardArt}>
                      <NetField
                        net="card"
                        strength="strong"
                        className={`${styles.cardNet} ${CARD_NET_WINDOWS[index % CARD_NET_WINDOWS.length]}`}
                      />
                      {programme.facts ? <p className={`meta ${styles.cardFacts}`}>{programme.facts}</p> : null}
                    </div>
                    <h3 className={styles.cardName}>{programme.name}</h3>
                    {programme.pitch ? <p className={styles.cardPitch}>{programme.pitch}</p> : null}
                    {chip || starts ? (
                      <div className={styles.cardChips}>
                        {chip ? (
                          <Chip tone={chip.tone} dot>
                            {chip.label}
                          </Chip>
                        ) : null}
                        {starts ? <Chip>{starts}</Chip> : null}
                      </div>
                    ) : null}
                    {hasPage ? (
                      <div className={styles.cardFoot}>
                        <Link
                          href={`/courses/${programme.courseId}`}
                          aria-label={`Read more about the ${programme.name}`}
                          className={`${styles.button} ${styles.text}`}
                        >
                          <span>Read more</span>
                          <ArrowIcon />
                        </Link>
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className={styles.lead}>
          <div className={styles.leadWords}>
            <p className={styles.leadTitle}>Want to lead a group? Say so when you apply.</p>
            <p className={styles.leadBody}>
              You don’t need any experience. We’ll train you and give you everything you need.
            </p>
          </div>
          <TermApplyLink stage={stage} applyPath={applyPath} className={`${styles.button} ${styles.surface}`}>
            <span>Apply</span>
          </TermApplyLink>
        </div>
      </div>
    </section>
  );
}
