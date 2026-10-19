import type { Metadata } from "next";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import {
  listPublishedCourses,
  roundOwnsDates,
  type CourseCatalogueEntry,
} from "@/features/courses/fetchCourses";
import CourseFaq from "@/features/courses/CourseFaq";
import CourseVisual from "@/features/courses/CourseVisual";
import { applicationStateTone, applicationStateWords } from "@/features/courses/stateWords";
import {
  formatRunStartShort,
  formatWindowDate,
  type ApplicationWindowState,
} from "@/lib/courses/window";
import type { PublicTermProgramme, PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import Arrow from "@/features/programmes/Arrow";
import { bandWords } from "@/features/programmes/bandWords";
import Callout from "@/features/programmes/Callout";
import ClosingBand from "@/features/programmes/ClosingBand";
import FactRows, { type FactRow } from "@/features/programmes/FactRows";
import ProgrammeHero from "@/features/programmes/ProgrammeHero";
import { firstLine } from "@/features/programmes/prose";
import Section from "@/features/programmes/Section";
import SectionHead from "@/features/programmes/SectionHead";
import Steps, { type Step } from "@/features/programmes/Steps";
import { SESSION_TIMES, weeklyHoursWords } from "@/features/programmes/words";
import shared from "@/features/programmes/programme.module.css";
import { fetchPublicTerm } from "@/features/term/fetchPublicTerm";
import TermApplyLink from "@/features/term/TermApplyLink";
import TermDates from "@/features/term/TermDates";
import TermStatusLine from "@/features/term/TermStatusLine";
import { sharedStart, termCivilDay, termDeadline } from "@/features/term/termWords";
import { incubatorTeaserWords, oneFormWords } from "../incubator/incubatorWords";
import { FELLOWSHIP_QUESTIONS } from "./questions";
import styles from "./courses.module.css";

/**
 * THE FELLOWSHIPS PAGE, at the address it has always had.
 *
 * It lists the term's fellowships: the programmes on the term's application
 * form, in the form's order, each with what its course's page stores when a
 * published course is tied to it. Every other published course is listed
 * under them, saying exactly what the catalogue has always said about it.
 *
 * Three rules a maintainer has to keep:
 *
 * 1. WHAT A CARD SAYS ABOUT APPLYING IS DECIDED ELSEWHERE. For a course, by
 *    the same lookup and the same rule its own page asks (`roundOwnsDates`,
 *    through the catalogue entry). For the term, by `fetchPublicTerm`. This
 *    file words what it is told and decides no window itself.
 * 2. A PROGRAMME'S COURSE IS CHECKED BEFORE IT IS LINKED. The tie is stored as
 *    it was made, and a course can be unpublished afterwards, so "Read more"
 *    is drawn only for a course the published list holds.
 * 3. NO DATE IS WRITTEN HERE. Every day on the page comes from the term or
 *    from a course's own round or run, formatted in London's time.
 */

export const metadata: Metadata = {
  title: "Fellowships",
  description:
    "6 weeks in a small group, led by a trained facilitator. You do the reading at home, then talk it through together once a week. It’s free.",
};

// Application windows and run statuses change without a deploy, so the
// page is rendered per request rather than cached at build.
export const dynamic = "force-dynamic";

/** Where the mailing list form is. */
const MAILING_LIST = "/#stay-in-touch";

export default async function FellowshipsPage() {
  const [term, entries] = await Promise.all([fetchPublicTerm(), listPublishedCourses()]);
  const { stage, opensAt, closesAt, decisionsByDate, applyPath } = term;

  const byCourse = new Map(entries.map((entry) => [entry.course.id, entry]));
  const fellowships = term.programmes.filter((programme) => programme.kind === "fellowship");
  const incubators = term.programmes.filter((programme) => programme.kind === "incubator");
  // What the panel about the incubator says depends on how many the form
  // carries, and is worded where the incubator's own page is worded.
  const teaser = incubatorTeaserWords(incubators);

  // A course the term's form speaks for is drawn as its programme, once. A
  // course tied to an incubator has the incubator's own page to speak for
  // it. Everything else published is a course on no form.
  const onTheForm = new Set(term.programmes.map((programme) => programme.courseId));
  const otherCourses = entries.filter((entry) => !onTheForm.has(entry.course.id));

  const starts = sharedStart(fellowships);
  const decisionsDay = decisionsByDate ? termCivilDay(decisionsByDate) : null;
  const ahead = stage === "before" || stage === "open";
  const band = bandWords({
    stage,
    opensAt,
    closesAt,
    decisionsByDate,
    nextLabel: term.next?.label ?? null,
    nextOpensAt: term.next?.opensAt ?? null,
  });

  const steps: Step[] = [
    {
      title: "Apply",
      body: "Tick the programmes you’re interested in and put them in order.",
      chip: ahead && closesAt ? `By ${termDeadline(closesAt)}` : null,
    },
    {
      title: "Hear back",
      body: "The person who runs each programme reads every answer. We’ll email you our decision.",
      chip: stage !== "running" ? decisionsDay : null,
    },
    {
      title: "Meet your group",
      body: "Your first session is on campus.",
      chip: stage !== "running" ? starts : null,
    },
  ];

  return (
    <>
      <ProgrammeHero>
        {term.label ? <p className={`meta ${shared.heroEyebrow}`}>{term.label}</p> : null}
        <h1 className={shared.pageTitle}>Fellowships.</h1>
        <p className={shared.pageLede}>
          6 weeks in a small group, led by a trained facilitator. You do the reading at home,
          then talk it through together once a week. It’s free.
        </p>
        <div className={shared.heroActions}>
          <TermApplyLink
            stage={stage}
            applyPath={applyPath}
            className={`${shared.btn} ${shared.btnLg} ${shared.btnPrimary}`}
          >
            Apply
            <Arrow />
          </TermApplyLink>
          <a href="#how-it-works" className={`${shared.btn} ${shared.btnLg} ${shared.btnOutline}`}>
            How applying works
          </a>
        </div>
        <div className={shared.heroStatus}>
          <TermStatusLine
            stage={stage}
            opensAt={opensAt}
            closesAt={closesAt}
            decisionsByDate={decisionsByDate}
            nextLabel={term.next?.label}
            nextOpensAt={term.next?.opensAt}
          />
        </div>
        <div className={shared.heroDates}>
          <TermDates
            stage={stage}
            showOpening
            opensAt={opensAt}
            closesAt={closesAt}
            decisionsByDate={decisionsByDate}
            starts={starts}
          />
        </div>
      </ProgrammeHero>

      <Section rule={false} labelledBy="fellowships-heading">
        {fellowships.length > 0 ? (
          <>
            <SectionHead id="fellowships-heading" eyebrow="This term" title="Running this term." />
            <div className={styles.grid}>
              {fellowships.map((programme) => (
                <ProgrammeCard
                  key={programme.id}
                  {...programmeCard(programme, byCourse.get(programme.courseId ?? "") ?? null, {
                    stage,
                    opensAt,
                    closesAt,
                  })}
                />
              ))}
            </div>
          </>
        ) : null}

        {otherCourses.length > 0 ? (
          <div className={fellowships.length > 0 ? styles.more : undefined}>
            <SectionHead
              id={fellowships.length > 0 ? "more-courses-heading" : "fellowships-heading"}
              eyebrow={fellowships.length > 0 ? "More courses" : "Courses"}
              space="tight"
            />
            <div className={styles.grid}>
              {otherCourses.map((entry) => (
                <ProgrammeCard key={entry.course.id} {...courseCard(entry)} />
              ))}
            </div>
          </div>
        ) : null}

        {fellowships.length === 0 && otherCourses.length === 0 ? (
          <>
            <SectionHead id="fellowships-heading" eyebrow="This term" space="tight" />
            <p className={styles.empty}>No fellowships are listed right now.</p>
          </>
        ) : null}
      </Section>

      <Section tone="raised" id="how-it-works" labelledBy="how-it-works-heading">
        <SectionHead
          id="how-it-works-heading"
          eyebrow="Applications"
          title="How applying works."
          lede={oneFormWords({ fellowships: fellowships.length, incubators: incubators.length })}
          space="loose"
        />
        <Steps steps={steps} />
        <div className={styles.lead}>
          <Callout
            id="lead-a-group"
            title="Want to lead a group?"
            action={
              <TermApplyLink
                stage={stage}
                applyPath={applyPath}
                className={`${shared.btn} ${shared.btnSurface}`}
              >
                Apply
                <Arrow />
              </TermApplyLink>
            }
          >
            Say so when you apply. You don’t need any experience. We’ll train you and give you
            everything you need.
          </Callout>
        </div>
      </Section>

      <Section labelledBy="course-faq-heading">
        <CourseFaq items={FELLOWSHIP_QUESTIONS} eyebrow="Questions" title="Before you apply." />
      </Section>

      <Section tone="raised" labelledBy="incubator-heading">
        <SectionHead
          id="incubator-heading"
          eyebrow="After a fellowship"
          title="Ready for research?"
          space="tight"
        />
        <div className={styles.teaser}>
          <div className={styles.teaserPicture}>
            <CourseVisual seed="research-incubator" size="wide" label={teaser.label} />
          </div>
          <div className={styles.teaserWords}>
            <p className={`meta ${styles.teaserEyebrow}`}>{teaser.eyebrow}</p>
            {teaser.body ? <p className={styles.teaserBody}>{teaser.body}</p> : null}
            {teaser.listed.length > 0 ? (
              <ul className={styles.teaserList}>
                {teaser.listed.map((incubator) => (
                  <li key={incubator.id} className={styles.teaserItem}>
                    <h3 className={styles.teaserName}>{incubator.name}</h3>
                    {incubator.pitch ? <p className={styles.teaserBody}>{incubator.pitch}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <Link href="/incubator" className={`${shared.btn} ${shared.btnSurface}`}>
              {teaser.link}
              <Arrow />
            </Link>
          </div>
        </div>
      </Section>

      <ClosingBand labelledBy="fellowships-band-heading">
        <div className={shared.bandWords}>
          <h2 id="fellowships-band-heading" className={shared.bandTitle}>
            {band.title}
          </h2>
          {band.sub ? <p className={shared.bandSub}>{band.sub}</p> : null}
        </div>
        <div className={shared.bandActions}>
          <TermApplyLink
            stage={stage}
            applyPath={applyPath}
            className={`${shared.btn} ${shared.btnLg} ${shared.btnPrimary}`}
          >
            Apply
            <Arrow />
          </TermApplyLink>
          <Link href={MAILING_LIST} className={`${shared.btn} ${shared.btnLg} ${shared.btnOutline}`}>
            Get the emails
          </Link>
        </div>
      </ClosingBand>
    </>
  );
}

// ---------------------------------------------------------------------------
// A card
// ---------------------------------------------------------------------------

/** What one card prints. Plain fields, so a card can never be handed a document. */
type CardProps = {
  name: string;
  pitch: string;
  /** The line of metadata over the picture: "6 weeks · ~5 hrs a week". */
  facts: string;
  seed: string;
  coverImageUrl: string | null;
  coverAlt: string;
  /** Open, opening soon or over: decides the colour of the first chip. */
  state: ApplicationWindowState | null;
  /** "Applications open". */
  stateWords: string;
  /** "Open to every subject", or empty. */
  level: string;
  rows: FactRow[];
  /** The course's own page, or null when no published course stands behind the card. */
  href: string | null;
};

function ProgrammeCard({
  name,
  pitch,
  facts,
  seed,
  coverImageUrl,
  coverAlt,
  state,
  stateWords,
  level,
  rows,
  href,
}: CardProps) {
  return (
    <article className={styles.card}>
      <CourseVisual seed={seed} coverImageUrl={coverImageUrl} coverAlt={coverAlt} label={facts} />
      <div className={styles.cardBody}>
        <p className={styles.cardChips}>
          <Chip tone={applicationStateTone(state)} dot={state === "open"}>
            {stateWords}
          </Chip>
          {level ? <Chip>{level}</Chip> : null}
        </p>
        <h3 className={styles.cardTitle}>{name}</h3>
        {pitch ? <p className={styles.cardPitch}>{pitch}</p> : null}
        <FactRows rows={rows} />
        {href ? (
          <p className={styles.cardFoot}>
            {/* Plain next/link, never TransitionLink: the public transition's
                exit choreography is tuned for one-off editorial pages and
                reads as a broken tap on a grid of cards. */}
            <Link
              href={href}
              className={`${shared.btn} ${shared.btnText}`}
              aria-label={`Read more about ${withArticle(name)}`}
            >
              Read more
              <Arrow />
            </Link>
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** "the AGI Strategy Fellowship", for a link's spoken name. */
function withArticle(name: string): string {
  return /^(the|a|an)\s/i.test(name) ? name : `the ${name}`;
}

/**
 * The weeks a course's page stores, as a short numbered list, or the one
 * line that stands in for them. Null when there is nothing to say: a course
 * on no form with no weeks written simply has no such row.
 */
function weeksRow(
  themes: CourseCatalogueEntry["about"]["themes"],
  comingShortly: boolean,
): FactRow | null {
  if (themes.length === 0) {
    return comingShortly ? { label: "What you’ll do", value: "Curriculum coming shortly." } : null;
  }
  return {
    label: "What you’ll do",
    value: (
      <ol className={styles.weeks}>
        {themes.map((theme) => (
          <li key={theme.weekNumber} value={theme.weekNumber}>
            {theme.title || "To be confirmed"}
          </li>
        ))}
      </ol>
    ),
  };
}

/** A fact row, or nothing for an empty answer. */
function row(label: string, value: string, note?: string): FactRow | null {
  const answer = value.trim();
  if (!answer && !note) return null;
  return answer ? { label, value: answer, note } : { label, value: note };
}

const kept = (rows: (FactRow | null)[]): FactRow[] => rows.filter((r): r is FactRow => r !== null);

/**
 * One of the term's fellowships. Its name, its line and its facts are the
 * programme's own, from the form. Everything else comes from the published
 * course tied to it, and is left out when there is none.
 */
function programmeCard(
  programme: PublicTermProgramme,
  entry: CourseCatalogueEntry | null,
  term: { stage: PublicTermStage; opensAt: Date | null; closesAt: Date | null },
): CardProps {
  const words = entry ? courseWords(entry) : programmeWords(term, programme.starts);
  return {
    name: programme.name,
    pitch: programme.pitch || entry?.course.tagline || "",
    facts: programme.facts,
    seed: entry?.visual.seed ?? programme.id,
    coverImageUrl: entry?.visual.coverImageUrl ?? null,
    coverAlt: entry?.visual.coverAlt ?? "",
    state: words.state,
    stateWords: words.stateWords,
    level: entry?.course.level ?? "",
    rows: kept([
      row("Who it’s for", firstLine(entry?.about.whoItIsFor ?? "")),
      weeksRow(entry?.about.themes ?? [], true),
      row("Time", entry?.about.weeklyHoursText ?? ""),
      row("Format", entry?.about.formatText ?? "", SESSION_TIMES),
      row("Dates", words.dates),
    ]),
    href: entry ? `/courses/${encodeURIComponent(entry.course.id)}` : null,
  };
}

/** A published course on no form: what the catalogue has always said about it. */
function courseCard(entry: CourseCatalogueEntry): CardProps {
  const { course } = entry;
  const words = courseWords(entry);
  return {
    name: course.title || "Untitled course",
    pitch: course.tagline,
    facts: course.estimatedWeeklyHours ? weeklyHoursWords(course.estimatedWeeklyHours) : "",
    seed: entry.visual.seed,
    coverImageUrl: entry.visual.coverImageUrl,
    coverAlt: entry.visual.coverAlt,
    state: words.state,
    stateWords: words.stateWords,
    level: course.level,
    rows: kept([
      row("Who it’s for", firstLine(entry.about.whoItIsFor)),
      weeksRow(entry.about.themes, false),
      row("Time", entry.about.weeklyHoursText),
      row("Format", entry.about.formatText),
      row("Dates", words.dates),
    ]),
    href: `/courses/${encodeURIComponent(course.id)}`,
  };
}

// ---------------------------------------------------------------------------
// What a card says about applying
// ---------------------------------------------------------------------------

type CardWords = {
  state: ApplicationWindowState | null;
  stateWords: string;
  dates: string;
};

/** A published course's three lines, by the catalogue's own rules below. */
function courseWords(entry: CourseCatalogueEntry): CardWords {
  return {
    state: cardState(entry),
    stateWords: applicationState(entry),
    dates: cardDates(entry),
  };
}

/**
 * The same three lines for a programme of the term with no published course
 * behind it, in the words a course on the form is given: the term has
 * already decided the stage, and this only words it.
 */
function programmeWords(
  term: { stage: PublicTermStage; opensAt: Date | null; closesAt: Date | null },
  starts: string,
): CardWords {
  const state: ApplicationWindowState =
    term.stage === "open" ? "open" : term.stage === "before" ? "not-yet" : "closed";
  const stateWords = applicationStateWords({
    state,
    openEnrolment: false,
    opensOn: term.opensAt ? formatWindowDate(term.opensAt) : null,
  });
  const bits: string[] = [];
  if (state !== "closed" && term.closesAt) bits.push(`Apply by ${formatWindowDate(term.closesAt)}`);
  if (starts.trim()) bits.push(`Starts ${starts.trim()}`);
  return { state, stateWords, dates: bits.join(" · ") };
}

/**
 * The window state the card speaks about, from whichever object owns the
 * dates. `roundOwnsDates` is that decision, shared with the sort key inside
 * the fetcher and with the programme page, so a card cannot be sorted into
 * one band and painted in another.
 */
function cardState(entry: CourseCatalogueEntry): ApplicationWindowState | null {
  return roundOwnsDates(entry.liveRound, entry.featuredRun?.run.enrolMode ?? null)
    ? (entry.liveRound?.state ?? null)
    : (entry.featuredRun?.window.state ?? null);
}

/**
 * The card's one-line state, keyed on the WINDOW rather than the run's
 * status. Keying on status alone is what put "Applications open" on a card
 * whose deadline had passed and whose form the apply route then refused, and
 * on one whose window had not started yet.
 *
 * The words themselves are `applicationStateWords`, which the course's own
 * page prints too, so the two cannot say it two ways.
 *
 * The run LABEL never appears here. It is an internal handle an admin typed,
 * and "Applications open for wd" is what that reads like in the wild.
 */
function applicationState(entry: CourseCatalogueEntry): string {
  const round = entry.liveRound;
  const found = entry.featuredRun;
  if (!round && !found) return "Next run TBA";
  // Which object is speaking: `roundOwnsDates`, the one rule.
  const viaRound = roundOwnsDates(round, found?.run.enrolMode ?? null);
  const opensAt = viaRound ? (round?.opensAt ?? null) : (found?.window.opensAt ?? null);
  return applicationStateWords({
    state: cardState(entry),
    // An open-enrolment run is never spoken for by a round, so the noun is
    // only ever "Sign-ups" on the run's own window.
    openEnrolment: found?.run.enrolMode === "open",
    opensOn: opensAt ? formatWindowDate(opensAt) : null,
  });
}

/**
 * "Applications close Sun 18 Oct · Starts Mon 26 Oct". The two questions
 * every prospective applicant asks, answered on the card rather than only in
 * a confirmation email they have not been sent yet.
 *
 * A closed run drops the deadline: it is no longer something to plan around,
 * and the state line above has already said it has passed.
 *
 * A course on the term's APPLICATION FORM says it the way its own page does:
 * "Apply by Sun 18 Oct". The state line above is unchanged, and the card
 * still leads to the course's page, where the one button to the form is.
 */
function cardDates(entry: CourseCatalogueEntry): string {
  const round = entry.liveRound;
  const found = entry.featuredRun;
  if (!round && !found) return "";

  const bits: string[] = [];
  const viaRound = roundOwnsDates(round, found?.run.enrolMode ?? null);
  const state = cardState(entry);
  const closesAt = viaRound ? (round?.closesAt ?? null) : (found?.window.closesAt ?? null);
  const viaForm = viaRound && Boolean(round?.form);
  if (state !== "closed" && closesAt) {
    const noun = found?.run.enrolMode === "open" ? "Sign-ups" : "Applications";
    bits.push(
      viaForm
        ? `Apply by ${formatWindowDate(closesAt)}`
        : `${noun} close ${formatWindowDate(closesAt)}`,
    );
  }
  // The start date belongs to whichever run the card is speaking for. When a
  // round owns the card that is the run the round will place people onto,
  // which is normally still `draft` and so is never the featured run; the
  // fetcher resolves it as `roundRun`. No target run means no start date,
  // rather than the featured run's, which would be a different intake's.
  const startingRun = viaRound ? entry.roundRun : (found?.run ?? null);
  // The application form names no run until groups are made, so until then
  // the start is the tied programme's own "w/c 26 Oct", as its lead wrote it.
  const starts =
    (startingRun ? formatRunStartShort(startingRun.startDate) : undefined)
    || (viaForm ? round?.form?.starts : undefined);
  if (starts) bits.push(`Starts ${starts}`);
  return bits.join(" · ");
}
