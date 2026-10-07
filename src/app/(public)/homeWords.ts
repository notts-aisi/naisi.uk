import type { PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import { seasonOf, sharedStart, termDay } from "@/features/term/termWords";

/**
 * THE HOMEPAGE'S WORDS THAT DEPEND ON THE TERM.
 *
 * The page draws what these functions say, so what each stage of the term
 * reads is in one place and a test can run it. Nothing here reads anything:
 * every function is handed the fields it prints.
 *
 * | Stage | First button | Second button | Chip on a programme |
 * | --- | --- | --- | --- |
 * | `none` | Get told when applications open | See what’s on this term (the events) | none |
 * | `before` | Get told when applications open | See what’s on this term | Applications open soon |
 * | `open` | Apply by Sun 18 Oct | Compare the programmes | Apply by Sun 18 Oct |
 * | `closed` | See what’s on | Hear when the next round opens | none |
 * | `running` | See what’s on | Hear when the next round opens | Running now |
 *
 * A date that is missing is never guessed: the words go on without it.
 */

export const THIS_TERM_ID = "this-term";
export const STAY_IN_TOUCH_ID = "stay-in-touch";
export const EVENTS_PATH = "/events";

/** One of the hero's two buttons. `apply` is the link to the form, which only the term's own component draws. */
export type HeroAction =
  | { kind: "apply"; label: string }
  | { kind: "link"; label: string; href: string };

export type HeroActionFacts = {
  stage: PublicTermStage;
  closesAt: Date | null;
  /** The label of the form that opens after this one, when there is one. */
  nextLabel: string | null;
};

/** "Apply by Sun 18 Oct", or "Apply" for a form with no close written on it. */
export function applyByLabel(closesAt: Date | null): string {
  return closesAt ? `Apply by ${termDay(closesAt)}` : "Apply";
}

/** "Hear when spring opens" when the next form names a season, and "the next round" when nothing does. */
export function hearWhenLabel(nextLabel: string | null): string {
  const season = nextLabel ? seasonOf(nextLabel) : null;
  return season ? `Hear when ${season} opens` : "Hear when the next round opens";
}

/** The hero's two buttons for a stage of the term. */
export function heroActions(facts: HeroActionFacts): { primary: HeroAction; secondary: HeroAction } {
  const mailingList = `#${STAY_IN_TOUCH_ID}`;
  const thisTerm = `#${THIS_TERM_ID}`;
  switch (facts.stage) {
    case "open":
      return {
        primary: { kind: "apply", label: applyByLabel(facts.closesAt) },
        secondary: { kind: "link", label: "Compare the programmes", href: thisTerm },
      };
    case "closed":
    case "running":
      return {
        primary: { kind: "link", label: "See what’s on", href: EVENTS_PATH },
        secondary: { kind: "link", label: hearWhenLabel(facts.nextLabel), href: mailingList },
      };
    case "before":
      return {
        primary: { kind: "link", label: "Get told when applications open", href: mailingList },
        secondary: { kind: "link", label: "See what’s on this term", href: thisTerm },
      };
    case "none":
      // With no term there is no "This term" on the page to go to, so the
      // second button goes to what is on: the events.
      return {
        primary: { kind: "link", label: "Get told when applications open", href: mailingList },
        secondary: { kind: "link", label: "See what’s on this term", href: EVENTS_PATH },
      };
  }
}

/** The chip a programme's card carries for a stage, or null for none. */
export type ProgrammeChip = { tone: "live" | "success" | "neutral"; label: string };

export function programmeChip(stage: PublicTermStage, closesAt: Date | null): ProgrammeChip | null {
  switch (stage) {
    case "before":
      return { tone: "live", label: "Applications open soon" };
    case "open":
      return { tone: "success", label: closesAt ? applyByLabel(closesAt) : "Applications open" };
    case "running":
      return { tone: "neutral", label: "Running now" };
    case "closed":
    case "none":
      return null;
  }
}

/** Whether the programmes' start is still ahead of the reader, as far as the stage can say. */
function startIsAhead(stage: PublicTermStage): boolean {
  return stage === "before" || stage === "open" || stage === "closed";
}

/**
 * A start as it reads inside a sentence. The start is a label a lead typed
 * ("w/c 26 Oct") and is never read as a date. The one thing done to it is
 * to spell out "w/c".
 */
export function startInWords(starts: string): string {
  const label = starts.trim();
  return /^w\/c\s+/i.test(label) ? `the week of ${label.replace(/^w\/c\s+/i, "")}` : label;
}

/** "Starts w/c 26 Oct" for a card, while the start is ahead and the programme says one. */
export function startChipLabel(stage: PublicTermStage, starts: string): string | null {
  const label = starts.trim();
  return label && startIsAhead(stage) ? `Starts ${label}` : null;
}

/** "2 fellowships and a research incubator": what the term holds, counted. Empty for nothing. */
export function programmesInWords(programmes: readonly { kind: "fellowship" | "incubator" }[]): string {
  const fellowships = programmes.filter((programme) => programme.kind === "fellowship").length;
  const incubators = programmes.length - fellowships;
  const parts: string[] = [];
  if (fellowships === 1) parts.push("a fellowship");
  if (fellowships > 1) parts.push(`${fellowships} fellowships`);
  if (incubators === 1) parts.push("a research incubator");
  if (incubators > 1) parts.push(`${incubators} research incubators`);
  return parts.join(" and ");
}

/**
 * The sentence under "This term.", written from the term's own programmes:
 * "We’re running 2 fellowships and a research incubator. They all start the
 * week of 26 Oct, and they’re all free."
 *
 * The count is counted. The start is only said while it is ahead and every
 * programme shares it; otherwise the sentence goes without it. Empty when
 * the term holds no programme.
 */
export function termSentence(
  programmes: readonly { kind: "fellowship" | "incubator"; starts: string }[],
  stage: PublicTermStage,
): string {
  const what = programmesInWords(programmes);
  if (!what) return "";
  const shared = startIsAhead(stage) ? sharedStart(programmes) : null;
  const start = shared ? startInWords(shared) : null;
  if (programmes.length === 1) {
    return `We’re running ${what}. ${start ? `It starts ${start}, and it’s free.` : "It’s free."}`;
  }
  return `We’re running ${what}. ${start ? `They all start ${start}, and they’re all free.` : "They’re all free."}`;
}
