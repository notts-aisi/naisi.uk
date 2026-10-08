import type { PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import { sharedStart } from "@/features/term/termWords";
import { startChipLabel } from "../homeWords";

/**
 * WHAT THE PROGRAMME PAGES SAY ABOUT THE TERM'S INCUBATORS, BY HOW MANY THE
 * TERM'S FORM CARRIES.
 *
 * The incubator's page (`/incubator`) is a page of words about replicating a
 * paper, and the fellowships page (`/courses`) carries a panel that points
 * at it. Those words are the pages' own and are not stored. What the term's
 * form adds is the incubators themselves: how many it carries, and each
 * one's name, one-line description and start, as its lead wrote them.
 *
 * The pages draw what these functions say, so both readings are in one place
 * and a test can run them. Nothing here reads anything: each function is
 * handed the fields it prints.
 *
 * Rules a maintainer has to keep:
 *
 * 1. WITH ONE INCUBATOR ON THE FORM, OR NONE, THE PAGES' OWN WORDS ARE THE
 *    WHOLE STORY. They speak of "the incubator", and there is one.
 * 2. WITH MORE THAN ONE, NOTHING IS SAID OF "THE INCUBATOR" AS IF THERE WERE
 *    ONE. The page counts them, names each with its own stored name and
 *    description, and labels its own words about replicating a paper as
 *    being about that. A fact that could be true of one incubator and not of
 *    another (how long it runs, what kind of work it is) is not printed over
 *    all of them.
 * 3. WHAT IS SAID ABOUT ONE INCUBATOR IS THE FORM'S. No sentence in this file
 *    describes a particular incubator. To say more about one, its lead
 *    writes it on the form.
 * 4. A START BELONGS TO THE INCUBATOR THAT WROTE IT. It is printed beside
 *    that incubator. It is printed for the incubators as a whole only when
 *    every one of them says the same (`sharedStart`).
 */

/** The fields of one incubator that the incubator's page prints. */
export type IncubatorFields = { id: string; name: string; pitch: string; starts: string };

/** One incubator, as a list of them prints it. A blank field is null, and is left out. */
export type ListedIncubator = { id: string; name: string; pitch: string | null; starts: string | null };

/** The page's one sentence about replicating a paper, said wherever one incubator is spoken of. */
export const REPLICATION_SENTENCE =
  "Replicate a published AI safety paper with a small team, then add your own twist. There’s food at every session.";

/** How long a replication runs, said where no form says otherwise. */
export const REPLICATION_LENGTH = "10 weeks over 2 terms";

/** "2 incubators this term": the count, in plain words. */
export function incubatorCountWords(count: number): string {
  return `${count} incubators this term`;
}

function blankToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

// ---------------------------------------------------------------------------
// The incubator's page
// ---------------------------------------------------------------------------

export type IncubatorPageWords = {
  /** The line over the title: "Research incubator · Autumn 2026". */
  eyebrow: string;
  title: string;
  /** The sentence under the title, or null where the list of incubators stands in its place. */
  lede: string | null;
  /** The row of plain facts under the title. */
  chips: string[];
  /** Each incubator by name, when the form carries more than one. Empty otherwise. */
  listed: ListedIncubator[];
  /** The small label over "10 weeks over 2 terms." */
  runsEyebrow: string;
  /** The small label over "Ready to do research." */
  whoEyebrow: string;
  /** The paragraph under "Ready to do research." */
  whoBody: string;
  /**
   * The start the page prints for the incubators as a whole, in its timeline
   * and on its last step: the one every incubator shares, or null.
   */
  starts: string | null;
};

export type IncubatorPageFacts = {
  /** The incubators on the term's form, in the form's order. */
  incubators: readonly IncubatorFields[];
  stage: PublicTermStage;
  /** The term's name: "Autumn 2026". */
  termLabel: string | null;
};

/** The paragraph under "Ready to do research.", where the page speaks of one incubator. */
const WHO_ONE =
  "It’s for people who’ve done a fellowship with us, or have a similar background. This term’s projects are technical, so expect to read ML papers closely and write code.";

/** The same paragraph where the form carries more than one: it says what is technical, and not that the term is. */
const WHO_SEVERAL =
  "It’s for people who’ve done a fellowship with us, or have a similar background. Replicating a paper is technical, so expect to read ML papers closely and write code.";

export function incubatorPageWords({ incubators, stage, termLabel }: IncubatorPageFacts): IncubatorPageWords {
  const starts = sharedStart(incubators);

  if (incubators.length > 1) {
    return {
      eyebrow: termLabel ? `Research incubators · ${termLabel}` : "Research incubators",
      title: "Research incubators.",
      lede: null,
      chips: [incubatorCountWords(incubators.length), "Free"],
      listed: incubators.map((incubator) => ({
        id: incubator.id,
        name: incubator.name,
        pitch: blankToNull(incubator.pitch),
        starts: startChipLabel(stage, incubator.starts),
      })),
      runsEyebrow: "Replicating a paper · how it runs",
      whoEyebrow: "Replicating a paper · who it’s for",
      whoBody: WHO_SEVERAL,
      starts,
    };
  }

  return {
    eyebrow: incubators.length === 1 && termLabel ? `Research incubator · ${termLabel}` : "Research incubator",
    title: "Replicate a paper. Then add your twist.",
    lede: REPLICATION_SENTENCE,
    chips: [REPLICATION_LENGTH, "Technical this term", "Free"],
    listed: [],
    runsEyebrow: "How it runs",
    whoEyebrow: "Who it’s for",
    whoBody: WHO_ONE,
    starts,
  };
}

// ---------------------------------------------------------------------------
// The panel on the fellowships page that points at the incubator's page
// ---------------------------------------------------------------------------

/** The fields of one incubator that the fellowships page's panel prints. */
export type TeaserIncubatorFields = { id: string; name: string; pitch: string; facts: string };

export type IncubatorTeaserWords = {
  /** The line of metadata over the picture. */
  label: string;
  eyebrow: string;
  /** The panel's one sentence, or null where the list of incubators stands in its place. */
  body: string | null;
  /** Each incubator by name, when the form carries more than one. Empty otherwise. */
  listed: { id: string; name: string; pitch: string | null }[];
  /** The words on the link to the incubator's page. */
  link: string;
};

export function incubatorTeaserWords(incubators: readonly TeaserIncubatorFields[]): IncubatorTeaserWords {
  if (incubators.length > 1) {
    return {
      label: incubatorCountWords(incubators.length),
      eyebrow: "Research incubators",
      body: null,
      listed: incubators.map((incubator) => ({
        id: incubator.id,
        name: incubator.name,
        pitch: blankToNull(incubator.pitch),
      })),
      link: "See the incubators",
    };
  }
  const [only] = incubators;
  return {
    label: only?.facts || REPLICATION_LENGTH,
    eyebrow: "Research incubator",
    body: REPLICATION_SENTENCE,
    listed: [],
    link: "See the incubator",
  };
}

/**
 * The line under "How applying works." on the fellowships page. It names
 * what the form covers only when that is exactly two fellowships and one
 * incubator, and otherwise says the thing that is true of any form.
 */
export function oneFormWords(counts: { fellowships: number; incubators: number }): string {
  return counts.fellowships === 2 && counts.incubators === 1
    ? "One form covers both fellowships and the research incubator."
    : "There’s one form for every programme.";
}
