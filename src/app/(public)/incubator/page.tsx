import type { Metadata } from "next";
import Link from "next/link";
import Arrow from "@/features/programmes/Arrow";
import { bandWords } from "@/features/programmes/bandWords";
import Callout from "@/features/programmes/Callout";
import ClosingBand from "@/features/programmes/ClosingBand";
import FactRows from "@/features/programmes/FactRows";
import ProgrammeHero from "@/features/programmes/ProgrammeHero";
import Section from "@/features/programmes/Section";
import SectionHead from "@/features/programmes/SectionHead";
import Steps, { type Step } from "@/features/programmes/Steps";
import shared from "@/features/programmes/programme.module.css";
import { fetchPublicTerm } from "@/features/term/fetchPublicTerm";
import TermApplyLink from "@/features/term/TermApplyLink";
import TermStatusLine from "@/features/term/TermStatusLine";
import { termCivilDay, termDeadline } from "@/features/term/termWords";
import { incubatorPageWords } from "./incubatorWords";
import styles from "./incubator.module.css";

/**
 * THE RESEARCH INCUBATOR.
 *
 * A page of words about how the incubator runs. The words are the page's
 * own and are not stored. What IS read is the term: which incubators its
 * application form has on it, each one's name, description, facts line and
 * start, and that form's dates.
 *
 * Three rules a maintainer has to keep:
 *
 * 1. NO DATE IS WRITTEN HERE. The day to apply by, the day everybody hears
 *    and when an incubator starts come from the term's form, formatted in
 *    London's time. Where the form does not say, the page says nothing: it
 *    names a season ("February") and never a day.
 * 2. THE PAGE SPEAKS ABOUT APPLYING ONLY WHILE AN INCUBATOR IS ON THE FORM.
 *    A term whose form has fellowships and no incubator is, for this page, a
 *    term with nothing to apply to: no button, no dates, and the closing band
 *    says applications are not open.
 * 3. THE WORDS THAT DEPEND ON HOW MANY INCUBATORS THE FORM CARRIES ARE NOT
 *    WRITTEN HERE. `incubatorPageWords` (`./incubatorWords.ts`) says them,
 *    and this page draws what it says: with one incubator, the page's own
 *    words about it; with more than one, each by its own name,
 *    description and facts line, and nothing said of them all that the form
 *    does not say.
 */

export const metadata: Metadata = {
  title: "Research incubator",
  description:
    "Replicate a published AI safety paper with a small team, then add your own twist. There’s food at every session.",
};

// The term's stage changes without a deploy, so the page is rendered per
// request rather than cached at build.
export const dynamic = "force-dynamic";

/** One stretch of the year, and the blocks of work inside it. */
type Phase = {
  key: "autumn" | "break" | "spring";
  label: string;
  /** When it is, set as metadata. Left out when there is nothing true to print. */
  when: string | null;
  blocks: { title: string; body: string; weeks: number[] }[];
};

export default async function IncubatorPage() {
  const term = await fetchPublicTerm();
  const incubators = term.programmes.filter((programme) => programme.kind === "incubator");
  const onTheForm = incubators.length > 0;

  // With no incubator on the term's form, this page has no term to tell about.
  const stage = onTheForm ? term.stage : "none";
  const applyPath = onTheForm ? term.applyPath : null;
  const opensAt = onTheForm ? term.opensAt : null;
  const closesAt = onTheForm ? term.closesAt : null;
  const decisionsByDate = onTheForm ? term.decisionsByDate : null;
  const next = onTheForm ? term.next : null;

  const words = incubatorPageWords({ incubators, stage, termLabel: term.label });
  // The one start every incubator shares. Each incubator's own is beside its name.
  const starts = words.starts;
  const decisionsDay = decisionsByDate ? termCivilDay(decisionsByDate) : null;
  const ahead = stage === "before" || stage === "open";
  const band = bandWords({
    stage,
    opensAt,
    closesAt,
    decisionsByDate,
    nextLabel: next?.label ?? null,
    nextOpensAt: next?.opensAt ?? null,
  });

  const phases: Phase[] = [
    {
      key: "autumn",
      label: "Autumn term · in person",
      when: stage !== "running" ? starts : null,
      blocks: [
        {
          title: "Read and critique",
          body: "Read papers and pull them apart. Start a list of papers and twists.",
          weeks: [1, 2, 3],
        },
        { title: "Pitch week", body: "Pitch a paper and twist, or join a team.", weeks: [4] },
        {
          title: "Replicate and twist",
          body: "Your team reproduces the paper, then extends it.",
          weeks: [5, 6, 7],
        },
      ],
    },
    {
      key: "break",
      label: "Christmas and exams",
      when: "Dec to Jan",
      blocks: [
        {
          title: "Optional remote support",
          body: "Help from us if you want to keep going.",
          weeks: [],
        },
      ],
    },
    {
      key: "spring",
      label: "Spring term · in person",
      when: "February",
      blocks: [
        { title: "Finish and write up", body: "3 weeks to finish your write-up.", weeks: [8, 9, 10] },
      ],
    },
  ];

  // What each step says depends on how many incubators the form carries, so
  // the words are `incubatorPageWords`'s. The dates beside them are the term's.
  const steps: Step[] = [
    {
      title: "Apply",
      body: words.steps.apply,
      chip: ahead && closesAt ? `By ${termDeadline(closesAt)}` : null,
    },
    {
      title: words.steps.questionsTitle,
      body: words.steps.questions,
      chip: "Part of the form",
    },
    {
      title: "Hear back",
      body: words.steps.hearBack,
      chip: stage !== "running" ? decisionsDay : null,
    },
    {
      title: "Start",
      body: words.steps.start,
      chip: stage !== "running" ? starts : null,
    },
  ];

  return (
    <>
      <ProgrammeHero>
        <p className={`meta ${shared.heroEyebrow}`}>{words.eyebrow}</p>
        <h1 className={`${shared.pageTitle} ${styles.title}`}>{words.title}</h1>
        {words.lede ? <p className={shared.pageLede}>{words.lede}</p> : null}
        <ul className={shared.factChips}>
          {words.chips.map((chip) => (
            <li key={chip} className={shared.factChip}>
              {chip}
            </li>
          ))}
        </ul>
        {words.listed.length > 0 ? (
          <ul className={styles.incubators}>
            {words.listed.map((incubator) => (
              <li key={incubator.id} className={styles.incubator}>
                <h2 className={styles.incubatorName}>{incubator.name}</h2>
                {incubator.pitch ? <p className={styles.incubatorPitch}>{incubator.pitch}</p> : null}
                {incubator.facts || incubator.starts ? (
                  <div className={styles.incubatorFoot}>
                    {incubator.facts ? (
                      <p className={`meta ${styles.incubatorFacts}`}>{incubator.facts}</p>
                    ) : null}
                    {incubator.starts ? (
                      <p className={`meta ${styles.incubatorStarts}`}>{incubator.starts}</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className={shared.heroActions}>
          <TermApplyLink
            stage={stage}
            applyPath={applyPath}
            className={`${shared.btn} ${shared.btnLg} ${shared.btnPrimary}`}
          >
            Apply
            <Arrow />
          </TermApplyLink>
          <a href="#apply" className={`${shared.btn} ${shared.btnLg} ${shared.btnOutline}`}>
            How to apply
          </a>
        </div>
        <div className={shared.heroStatus}>
          <TermStatusLine
            stage={stage}
            opensAt={opensAt}
            closesAt={closesAt}
            decisionsByDate={decisionsByDate}
            nextLabel={next?.label}
            nextOpensAt={next?.opensAt}
          />
        </div>
      </ProgrammeHero>

      <Section rule={false} labelledBy="runs-heading">
        <SectionHead
          id="runs-heading"
          eyebrow={words.runsEyebrow}
          title="10 weeks over 2 terms."
          lede="There are 7 weeks in person this term and 3 more in February. Over Christmas and exams, we’re around if you want help."
        />
        <ol className={styles.timeline}>
          {phases.map((phase) => (
            <li key={phase.key} className={`${styles.phase} ${styles[phase.key]}`}>
              <div>
                <h3 className={styles.phaseLabel}>{phase.label}</h3>
                {phase.when ? <p className={`meta ${styles.phaseWhen}`}>{phase.when}</p> : null}
              </div>
              <div className={styles.blocks}>
                {phase.blocks.map((block) => (
                  <div key={block.title} className={styles.block}>
                    <h4 className={styles.blockTitle}>{block.title}</h4>
                    <p className={styles.blockBody}>{block.body}</p>
                    {block.weeks.length > 0 ? (
                      <ul className={styles.weeks} aria-label="Weeks">
                        {block.weeks.map((week) => (
                          <li key={week} className={styles.week}>
                            W{week}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <p className={styles.caption}>Everyone works in a team.</p>
      </Section>

      <Section tone="raised" labelledBy="who-heading">
        <div className={styles.split}>
          <div className={styles.splitWords}>
            <SectionHead
              id="who-heading"
              eyebrow={words.whoEyebrow}
              title="Ready to do research."
              space="prose"
            >
              <p className={shared.prose}>{words.whoBody}</p>
            </SectionHead>
          </div>
          <div className={styles.details}>
            <h3 className={styles.detailsTitle}>The details</h3>
            <FactRows
              labelWidth="7.5rem"
              rows={[
                { label: "Teams", value: "Small teams. No solo projects." },
                { label: "Food", value: "At every session" },
                { label: "You finish with", value: "A replication write-up with your own extension" },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section id="apply" labelledBy="apply-heading">
        <SectionHead
          id="apply-heading"
          eyebrow="How to apply"
          title="There’s one form for every programme."
          space="loose"
        />
        <Steps steps={steps} />
        <div className={styles.after}>
          <Callout
            look="tinted"
            title="Not taken this time? We may offer you a fellowship place."
            action={
              <Link href="/courses" className={`${shared.btn} ${shared.btnSurface}`}>
                About the fellowships
                <Arrow />
              </Link>
            }
          >
            Socials and events in person carry on all term.
          </Callout>
        </div>
      </Section>

      <ClosingBand labelledBy="incubator-band-heading">
        <div className={shared.bandWords}>
          <h2 id="incubator-band-heading" className={shared.bandTitle}>
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
          <Link href="/courses" className={`${shared.btn} ${shared.btnLg} ${shared.btnOutline}`}>
            Compare the fellowships
          </Link>
        </div>
      </ClosingBand>
    </>
  );
}
