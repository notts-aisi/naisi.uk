import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import BlockView from "@/features/events/BlockView";
import {
  COURSE_TRACK_LABELS,
  type CourseRunDoc,
  type CourseTrack,
} from "@/lib/firestore/courses";
import {
  getCourseRunSet,
  getPublishedCourse,
  roundOwnsDates,
  roundTargetRun,
  type RunWindow,
} from "@/features/courses/fetchCourses";
import {
  fetchFormRoundForCourse,
  speakingRoundFor,
} from "@/features/courses/fetchFormRound";
import {
  fetchLiveRoundForRuns,
  type CourseLiveRound,
} from "@/features/courses/fetchLiveRound";
import { fetchCoursePage } from "@/features/courses/fetchCoursePage";
import type { PublicCoursePage } from "@/lib/firestore/coursePages";
import { cohortLabel } from "@/lib/courses/cohortLabel";
import { londonDateKey } from "@/lib/courses/weekPlan";
import {
  formatPastWindowDate,
  formatRunStartShort,
  formatWindowDate,
  formatWindowDeadline,
} from "@/lib/courses/window";
import CourseCTA, { type CourseCTARun } from "@/features/courses/CourseCTA";
import { toCTARound } from "@/features/courses/ctaRound";
import CourseFactsRail, {
  type CourseFact,
  type CourseFactsStatus,
} from "@/features/courses/CourseFactsRail";
import CourseFaq from "@/features/courses/CourseFaq";
import JourneyStrip from "@/features/courses/JourneyStrip";
import { applicationStateTone, applicationStateWords } from "@/features/courses/stateWords";
import WeeklyThemes from "@/features/courses/WeeklyThemes";
import WeekCurriculum from "@/features/courses/WeekCurriculum";
import {
  fetchGroupPicker,
  type GroupPickerOption,
} from "@/features/courses/fetchGroupPicker";
import type { PublicTermProgramme } from "@/lib/applications/lifecycle/publicTerm";
import Arrow from "@/features/programmes/Arrow";
import ClosingBand from "@/features/programmes/ClosingBand";
import ProgrammeHero from "@/features/programmes/ProgrammeHero";
import { splitLead } from "@/features/programmes/prose";
import Section from "@/features/programmes/Section";
import SectionHead from "@/features/programmes/SectionHead";
import { SESSION_TIMES, weeklyHoursWords } from "@/features/programmes/words";
import shared from "@/features/programmes/programme.module.css";
import { fetchPublicTerm } from "@/features/term/fetchPublicTerm";
import styles from "./course.module.css";

/**
 * THE PUBLIC PROGRAMME PAGE.
 *
 * Built on `coursePages/{courseId}` (the authored pitch) plus the course, its
 * runs and the admission round that places people onto them. Three rules
 * decide almost everything below:
 *
 * 1. THE ROUND OWNS THE DATES. `courseRuns.admissionRoundIds` does not exist
 *    yet, so the live round is derived at read time by asking which rounds
 *    name one of this course's runs (`fetchLiveRound.ts`). `roundOwnsDates`
 *    decides whether it or the run's own window speaks, and it is the same
 *    helper the catalogue asks. When the round speaks, the CTA points at
 *    `/apply/[roundId]` and every date on the page comes from the round OR
 *    from the run the round will place people onto (`roundTargetRun`), which
 *    is not the same run as the featured one and is normally still `draft`.
 *    When no round speaks, the page falls back to the featured run's own
 *    application window, or to the enrolment window and the session picker for
 *    an open-enrolment pre-course. Two objects naming the same deadline is the
 *    drift V3 exists to stop, so exactly one of them is read per render.
 *
 *    THE TERM'S APPLICATION FORM arrives the same way. A programme on the form
 *    is tied to the course it is for, and `fetchFormRound.ts` hands this page
 *    the form in the round's own shape, so everything below draws it with the
 *    code that draws a round. `speakingRoundFor` chooses between the form and
 *    a round of the older kind, and a course tied to no programme is handed
 *    exactly what it always was. The CTA words the form its own way ("Apply
 *    by Sun 18 Oct") and sends everybody to the one form.
 *
 * 2. NO RAW `run.label` REACHES A VISITOR. The cohort is named by
 *    `cohortLabel(run)` and by nothing else. `run.label` survives on the
 *    document for admin lists; a run with no structured cohort simply gets no
 *    chip, because falling back to the admin handle is what the formatter
 *    exists to prevent.
 *
 * 3. ONE dangerouslySetInnerHTML, AND IT IS `BlockView`. The pitch blocks are
 *    authored copy, sanitised at the write end by the page route and again at
 *    the read end by `normalizeCoursePage`. Every other string on this page
 *    (themes, FAQ, journey labels, the facts rail) is a text node.
 *
 * The sample week renders through `WeekCurriculum` with NO optional props, so
 * its byte-identical public contract holds and the week page and this page
 * cannot drift apart. `tests/course-programme-page.test.mjs` pins that.
 *
 * THE PAGE IS A HERO AND A COLUMN OF SECTIONS. The hero carries the title,
 * the call to action and the "At a glance" card. Each section under it is
 * drawn only when the course has something stored for it, and the sections
 * take turns between the two grounds in the order they appear, so a course
 * with half its page written does not show two bands of one colour together.
 *
 * WHAT THE TERM ADDS. A course tied to one of the term's programmes says so
 * above its title ("Fellowship · Autumn 2026"), and a fellowship carries the
 * line about where its curriculum comes from. Both come from
 * `fetchPublicTerm`, which decides what a visitor may be told. Nothing about
 * applying is read from it here: that stays with the two lookups below.
 */

// Run status, the round's window and the published-week set all change without
// a deploy, so the page is rendered per request rather than cached at build.
export const dynamic = "force-dynamic";

/**
 * The social card. No generated OG image route: `next/og`'s `ImageResponse`
 * would be this repo's first, it needs a font shipped with it to render
 * anything but a system fallback, and the win over the brand lockup on a page
 * whose share is almost always a link in a group chat is small. The per-track
 * difference lives in the TITLE and the DESCRIPTION, which is the part a
 * reader actually reads.
 */
const OG_IMAGE = "/opengraph-image.png";

/** The one-line pitch under the title, per track, when nothing is authored. */
const TRACK_BLURB: Record<CourseTrack, string> = {
  technical:
    "A technical AI safety programme at the University of Nottingham: read the full plan, week by week, before you apply.",
  governance:
    "An AI governance programme at the University of Nottingham: read the full plan, week by week, before you apply.",
  general:
    "An AI safety programme at the University of Nottingham: read the full plan, week by week, before you apply.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseId: string }>;
}): Promise<Metadata> {
  const { courseId } = await params;
  const found = await getPublishedCourse(courseId);
  if (!found) return { title: "Course not found" };
  const page = await fetchCoursePage(courseId);
  const title = found.course.title || "Course";
  const description =
    page.headline.trim()
    || found.course.tagline
    || TRACK_BLURB[found.course.track];
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: page.coverImageUrl || OG_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [page.coverImageUrl || OG_IMAGE],
    },
  };
}

export default async function PublicCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  // Independent reads go together. An unpublished course throws the other two
  // away, which is cheaper than serialising them on every hit.
  const [found, runSet, page, term] = await Promise.all([
    getPublishedCourse(courseId),
    getCourseRunSet(courseId),
    fetchCoursePage(courseId),
    fetchPublicTerm(),
  ]);
  // A draft or unknown course is a 404 either way, so a draft URL leaks
  // nothing about whether the course exists.
  if (!found) notFound();

  // `showcaseRun` is deliberately not destructured: the page names its cohort
  // from the APPLICATION run (the one people are joining), and the showcase
  // run's only job here is having supplied `weeks`.
  const { course, weeks } = found;
  const applicationRun = runSet.featuredRun;
  // The round can only be asked for once the run ids are known: the join runs
  // backwards from `outcomeRunIds` until PR17 adds the forward pointer. The
  // term's application form is asked for beside it, by the course: it is null
  // for a course tied to no programme and for a form that is still a draft,
  // and then `round` is the older lookup's answer and nothing else changes.
  const [olderRound, formRound] = await Promise.all([
    fetchLiveRoundForRuns(runSet.runIds),
    fetchFormRoundForCourse(course.id),
  ]);
  const round = speakingRoundFor(formRound, olderRound);

  // ONE precedence decision for the whole page, made by the one helper the
  // catalogue also asks. `speakingRound` is null when the run's own window is
  // the truth (no round, or an open-enrolment pre-course), and every branch
  // below reads that rather than re-deriving the rule.
  const speakingRound = roundOwnsDates(
    round,
    applicationRun?.run.enrolMode ?? null,
  )
    ? round
    : null;

  // The run the SPEAKING ROUND will place people onto, which is the run whose
  // cohort and start date this page should print. It is normally still
  // `draft`, so it is looked up in the whole run set rather than taken from
  // `featuredRun`, which by construction is a run whose own window is live and
  // therefore a different intake. Null when the round names no run of this
  // course, and the chip and the Starts row then disappear rather than
  // borrowing another cohort's.
  const targetRun = roundTargetRun(speakingRound, runSet.runsById, course.id);

  // Dates are formatted HERE, on the server, in Europe/London. The CTA is a
  // client island, and formatting a Nottingham deadline in the visitor's own
  // timezone is how someone reads "closes Sat 17 Oct" and applies a day late.
  // The round's flattener lives beside the CTA (`ctaRound.ts`), where a test
  // can run it; the run's is at the foot of this file.
  const ctaRun = toCTARun(applicationRun);
  const ctaRound = toCTARound(speakingRound, targetRun);

  // OPEN-ENROLMENT runs put the session picker on this page, so the slots are
  // fetched with the page rather than by the client island: a signed-out
  // visitor sees the timetable in the first paint, and the projection stays on
  // the server where `fetchGroupPicker` can guarantee what leaves it
  // (`courseGroups` carries meeting links and facilitator uids).
  const pickerGroups: GroupPickerOption[] =
    ctaRun && ctaRun.enrolMode === "open" && ctaRun.state !== "inactive"
      ? await fetchGroupPicker(ctaRun.id)
      : [];

  // Whichever run the page is speaking for: the round's target when a round
  // owns the page, the featured run otherwise. `cohortLabel` returns "" for a
  // run with no structured cohort and for no run at all, and nothing is then
  // printed, which is the honest answer either way.
  const cohort = cohortLabel(
    speakingRound ? targetRun : (applicationRun?.run ?? null),
  );

  // The term's programme this course is for, when there is one a visitor may
  // be told about. `onTheForm` is wider: the form can speak for a course a
  // term ahead of the one the site is telling, and then the form's own facts
  // (no fixed session time, no cost) are already true of it.
  const programme = term.programmes.find((p) => p.courseId === course.id) ?? null;
  const onTheForm = programme !== null || Boolean(speakingRound?.form);
  const fellowship = programme?.kind === "fellowship";
  const eyebrow = programme
    ? [programmeKindWord(programme.kind), term.label].filter(Boolean).join(" · ")
    : [COURSE_TRACK_LABELS[course.track], cohort].filter(Boolean).join(" · ");

  // The plain facts under the title. The number of weeks is the number the
  // page's own list of weeks has, and failing that the number published.
  const weekCount = page.weeklyThemes.length || weeks.length;
  const chips = [
    weekCount ? `${weekCount} ${weekCount === 1 ? "week" : "weeks"}` : "",
    course.estimatedWeeklyHours ? weeklyHoursWords(course.estimatedWeeklyHours) : "",
    course.level,
  ].filter(Boolean);

  // The pitch: the authored blocks when there are any, else the course's own
  // introduction, so a course whose page nobody has written yet still reads
  // like a page rather than like a stub.
  const pitchBlocks =
    page.pitchBlocks.length > 0 ? page.pitchBlocks : course.summaryBlocks;

  const sampleWeek = pickSampleWeek(page, weeks);
  const todayKey = londonDateKey(new Date());
  const lede = page.headline.trim() || course.tagline;

  const whoItIsFor = splitLead(page.whoItIsFor);
  const howWeChoose = splitLead(page.howSelectionWorks);
  const membership = page.membershipExpectation.trim();

  // The sections under the hero, in order. A section the course has nothing
  // stored for is left out here, so the grounds below alternate over the
  // sections that are really drawn.
  const sections: PageSection[] = [];

  if (pitchBlocks.length > 0) {
    sections.push({
      key: "pitch",
      body: (
        <div className={styles.pitch}>
          <BlockView blocks={pitchBlocks} />
        </div>
      ),
    });
  }

  if (whoItIsFor.rest) {
    sections.push({
      key: "who",
      labelledBy: "who-heading",
      body: (
        <SectionHead
          id="who-heading"
          eyebrow="Who it’s for"
          title={whoItIsFor.lead ?? undefined}
          space="prose"
        >
          <p className={shared.prose}>{whoItIsFor.rest}</p>
        </SectionHead>
      ),
    });
  }

  // `weeks` is already the showcase run's PUBLISHED weeks, so a theme row
  // links out only when there is a page behind it. The section is always
  // drawn: with no themes stored it says the curriculum is on its way.
  sections.push({
    key: "weeks",
    labelledBy: "weekly-themes-heading",
    body: (
      <WeeklyThemes
        themes={page.weeklyThemes}
        courseId={course.id}
        publishedWeeks={weeks.map((w) => w.weekNumber)}
        note={PRE_START_NOTE}
        credit={fellowship ? CURRICULUM_CREDIT : undefined}
      />
    ),
  });

  if (sampleWeek) {
    sections.push({
      key: "sample",
      labelledBy: "sample-week-heading",
      body: (
        <>
          <SectionHead
            id="sample-week-heading"
            eyebrow="A typical week"
            title={
              course.estimatedWeeklyHours
                ? `About ${course.estimatedWeeklyHours} ${course.estimatedWeeklyHours === 1 ? "hour" : "hours"}.`
                : "A sample week"
            }
            lede={`Week ${sampleWeek.weekNumber} in full, exactly as the cohort reads it. Every other week is published too.`}
            space="tight"
          />
          <div className={styles.sample}>
            {/* NO optional props. `WeekCurriculum` renders its public output
                only when every render prop is absent, and that output is the
                diff-frozen contract the week page also depends on. */}
            <WeekCurriculum week={sampleWeek} />
          </div>
          <p className={styles.sampleMore}>
            <Link
              href={`/courses/${course.id}/weeks/${sampleWeek.weekNumber}`}
              className={`${shared.btn} ${shared.btnText}`}
            >
              Open week {sampleWeek.weekNumber} on its own page
              <Arrow />
            </Link>
          </p>
        </>
      ),
    });
  }

  if (howWeChoose.rest || membership) {
    sections.push({
      key: "choose",
      labelledBy: howWeChoose.rest ? "choose-heading" : "membership-heading",
      body: (
        <>
          {howWeChoose.rest ? (
            <SectionHead
              id="choose-heading"
              eyebrow="How we choose"
              title={howWeChoose.lead ?? undefined}
              space="prose"
            >
              <p className={shared.prose}>{howWeChoose.rest}</p>
            </SectionHead>
          ) : null}
          {membership ? (
            <div className={howWeChoose.rest ? styles.second : undefined}>
              <SectionHead id="membership-heading" eyebrow="Membership" space="prose">
                <p className={shared.prose}>{membership}</p>
              </SectionHead>
            </div>
          ) : null}
        </>
      ),
    });
  }

  if (page.journey.length > 0) {
    sections.push({
      key: "journey",
      labelledBy: "journey-heading",
      body: (
        <JourneyStrip
          steps={page.journey}
          todayKey={todayKey}
          dateLabels={page.journey.map((step) =>
            step.dateKey ? (formatRunStartShort(step.dateKey) ?? "") : "",
          )}
        />
      ),
    });
  }

  if (page.faq.length > 0) {
    sections.push({
      key: "faq",
      labelledBy: "course-faq-heading",
      body: <CourseFaq items={page.faq} />,
    });
  }

  return (
    <article>
      <ProgrammeHero crumb>
        <Link href="/courses" className={shared.crumb}>
          <Arrow back />
          Fellowships
        </Link>

        <div className={styles.hero}>
          <header className={styles.heroMain}>
            {eyebrow ? <p className={`meta ${shared.heroEyebrow}`}>{eyebrow}</p> : null}
            <h1 className={`${shared.pageTitle} ${shared.pageTitleCompact}`}>
              {course.title || "Untitled course"}
            </h1>
            {lede ? <p className={shared.pageLede}>{lede}</p> : null}
            {chips.length > 0 ? (
              <ul className={shared.factChips}>
                {chips.map((chip) => (
                  <li key={chip} className={shared.factChip}>
                    {chip}
                  </li>
                ))}
              </ul>
            ) : null}

            <CourseCTA
              courseId={course.id}
              courseTitle={course.title}
              run={ctaRun}
              round={ctaRound}
              groups={pickerGroups}
              placement="hero"
            />
          </header>

          <CourseFactsRail
            facts={buildFacts(page, speakingRound, applicationRun, targetRun, onTheForm)}
            status={factsStatus(speakingRound, applicationRun)}
          />
        </div>
      </ProgrammeHero>

      {sections.map((section, index) => (
        <Section
          key={section.key}
          tone={index % 2 === 0 ? "floor" : "raised"}
          rule={index > 0}
          labelledBy={section.labelledBy}
        >
          {section.body}
        </Section>
      ))}

      {/* NO `groups`. The session picker is mounted once, by the hero
          placement above; this one closes the page with the same dates and
          a link up to it. Two pickers meant two enrolment states on one
          page, and the foot never heard about a drop-out driven through the
          hero. */}
      <ClosingBand label="Applying" joined>
        <CourseCTA
          courseId={course.id}
          courseTitle={course.title}
          run={ctaRun}
          round={ctaRound}
          placement="foot"
        />
        <Link href="/courses" className={`${shared.btn} ${shared.btnLg} ${shared.btnOutline}`}>
          All fellowships
        </Link>
      </ClosingBand>
    </article>
  );
}

/** One section under the hero: what goes in it, and the heading that names it. */
type PageSection = {
  key: string;
  labelledBy?: string;
  body: ReactNode;
};

/** What the term calls a programme of each kind, above a course's title. */
function programmeKindWord(kind: PublicTermProgramme["kind"]): string {
  return kind === "incubator" ? "Research incubator" : "Fellowship";
}

/** Under the weeks of a fellowship, and of nothing else. */
const CURRICULUM_CREDIT = "Curriculum adapted from BlueDot Impact.";

/**
 * The pre-start note, shown under the weekly themes.
 *
 * Before a run starts, show the
 * core content and say plainly that a facilitator may tweak their group's
 * week, so reading ahead is welcome rather than wasted. It is deliberately
 * hard-coded rather than authored: it is a promise the platform makes about
 * how the weeks behave, not copy about this particular course.
 */
const PRE_START_NOTE =
  "This is the core plan for the course. Facilitators may adjust their own group's week, so a few readings can change before you get there. Everything above is open to read ahead, and we would rather you did.";

/**
 * Which week the "sample of the course" section renders: the authored
 * `sampleWeekNumber` when it names a published week, else the first published
 * week, else nothing.
 *
 * The fallback matters more than it looks: `sampleWeekNumber` is authored
 * against a curriculum that is still being written, so it routinely names a
 * week that is not published yet. Rendering nothing in that case would remove
 * the section from the page silently, which is exactly what an author cannot
 * see from the editor.
 */
function pickSampleWeek<T extends { weekNumber: number }>(
  page: PublicCoursePage,
  weeks: T[],
): T | null {
  if (weeks.length === 0) return null;
  if (page.sampleWeekNumber !== null) {
    const named = weeks.find((w) => w.weekNumber === page.sampleWeekNumber);
    if (named) return named;
  }
  return weeks[0];
}

/**
 * The line beside the card's title: the one-line state of the course's
 * applications, in the words its card on the fellowships page uses. Null when
 * nothing speaks for the course, and for a round or a run a visitor may not
 * be told about.
 *
 * `round` is the SPEAKING round, as it is for the facts below.
 */
function factsStatus(
  round: CourseLiveRound | null,
  run: RunWindow | null,
): CourseFactsStatus | null {
  const state = round ? round.state : (run?.window.state ?? null);
  if (state === null || state === "inactive") return null;
  const opensAt = round ? round.opensAt : (run?.window.opensAt ?? null);
  return {
    words: applicationStateWords({
      state,
      openEnrolment: run?.run.enrolMode === "open",
      opensOn: opensAt ? formatWindowDate(opensAt) : null,
    }),
    tone: applicationStateTone(state),
    live: state === "open",
  };
}

/**
 * The card's short answers.
 *
 * `round` here is the SPEAKING round: the caller has already applied
 * `roundOwnsDates`, so a non-null round means the round owns every date on
 * this card and a null one means the run's own window does. The card does not
 * re-derive that rule, and neither does the CTA.
 *
 * `onTheForm` adds the two things that are true of every programme on the
 * term's application form: its session times are not fixed in advance, and
 * it costs nothing.
 */
function buildFacts(
  page: PublicCoursePage,
  round: CourseLiveRound | null,
  run: RunWindow | null,
  targetRun: CourseRunDoc | null,
  onTheForm: boolean,
): CourseFact[] {
  const openMode = run?.run.enrolMode === "open";
  const viaRound = round !== null;
  const opensAt = viaRound ? round.opensAt : (run?.window.opensAt ?? null);
  const closesAt = viaRound ? round.closesAt : (run?.window.closesAt ?? null);
  const state = viaRound ? round.state : (run?.window.state ?? null);
  const past = state === "closed";
  const noun = openMode ? "Sign-ups" : "Applications";

  const format = page.formatText.trim();
  return [
    onTheForm
      ? format
        ? { label: "Format", value: format, note: SESSION_TIMES }
        : { label: "Format", value: SESSION_TIMES }
      : { label: "Format", value: format },
    { label: "Sessions", value: page.sessionsText },
    { label: "Time", value: page.weeklyHoursText },
    {
      label: `${noun} open`,
      value: opensAt ? formatWindowDate(opensAt) : "",
    },
    {
      label: `${noun} close`,
      value: closesAt
        ? past
          ? formatPastWindowDate(closesAt)
          : formatWindowDeadline(closesAt)
        : "",
    },
    {
      label: "Decisions by",
      // Only a round promises a decision date. An open-enrolment run has no
      // decision to make, which is why this row simply disappears there.
      value:
        viaRound && round.decisionsByDate
          ? (formatRunStartShort(round.decisionsByDate) ?? "")
          : "",
    },
    {
      label: "Starts",
      // The ROUND's target run when a round owns the page, because that is the
      // run someone applying today would join. Blank when none resolves: an
      // empty fact is dropped by the rail, and a start date lifted off the
      // featured run would be a different intake's. The application form
      // names no run until groups are made, so until then it is the tied
      // programme's own "w/c 26 Oct", as its lead wrote it.
      value:
        startDateOf(viaRound ? targetRun : (run?.run ?? null))
        || (round?.form?.starts ?? ""),
    },
    { label: "Cost", value: onTheForm ? "Free" : "" },
  ];
}

/** "Mon 26 Oct", or "" for no run and for a run with no start date. */
function startDateOf(run: CourseRunDoc | null): string {
  return run ? (formatRunStartShort(run.startDate) ?? "") : "";
}

/**
 * Flatten a run plus its window into the props the client CTA takes, with
 * every date already rendered in Europe/London.
 *
 * A LIVE deadline carries its TIME ("Sun 18 Oct, 23:59"), because the minute
 * it falls on is the thing an applicant plans around. A PASSED one carries its
 * year instead ("Sun 18 Oct 2026"): the minute no longer matters, and without
 * the year a run from a previous autumn reads as one you have just missed. A
 * start date needs neither, since its time is a group's session slot and is
 * told to them after allocation.
 */
function toCTARun(found: RunWindow | null): CourseCTARun | null {
  if (!found) return null;
  const { run, window } = found;
  const past = window.state === "closed";
  return {
    id: run.id,
    // The structured cohort, never the admin label. See rule 2 at the top.
    cohortLabel: cohortLabel(run),
    state: window.state,
    // `window` came from `courseRunWindow()`, so on an open-mode run its state
    // is the ENROLMENT window, not the application one. The CTA needs the mode
    // to know which of the two it is describing.
    enrolMode: run.enrolMode,
    streams: run.streams,
    opensOn: window.opensAt ? formatWindowDate(window.opensAt) : null,
    closesOn: window.closesAt
      ? past
        ? formatPastWindowDate(window.closesAt)
        : formatWindowDeadline(window.closesAt)
      : null,
    startsOn: formatRunStartShort(run.startDate) ?? null,
  };
}
