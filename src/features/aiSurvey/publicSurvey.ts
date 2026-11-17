/**
 * What the AI at Nottingham survey's pages are handed: the words a student
 * reads, with the survey's values already filled in, and nothing else.
 *
 * The definition also carries words that are not for a student (the admin
 * page's, the export's, a short name for each line used in results tables).
 * A client component's props are written into the page's HTML, so the page
 * takes this projection and never the definition itself.
 *
 * TYPES AND ONE PURE FUNCTION, and no import of the definition: the pages'
 * script reads this file, and the definition must not ride into the browser
 * behind it. The projection itself is made on the server, in
 * projectSurvey.ts.
 */
import type { AiSurveyDefinition, AiSurveyOption, AiSurveyScaleAnswer } from "@/lib/aiSurvey/types";

export type PublicQuestion =
  | { id: string; type: "single" | "multi"; text: string; options: AiSurveyOption[] }
  | { id: string; type: "select"; text: string; help?: string; groups: { label: string; options: AiSurveyOption[] }[]; extra: AiSurveyOption[] }
  | { id: string; type: "lines"; text: string | null; scale: string; shuffle: boolean; lines: { id: string; text: string }[] }
  | { id: string; type: "mostOf"; text: string; linesFrom: string; extra: AiSurveyOption[] }
  | { id: string; type: "text"; text: string; help?: string; maxLength: number }
  | { id: string; type: "tick"; text: string };

export type PublicPage = {
  id: string;
  heading: string;
  intro: string | null;
  /** True for a page of the block shown in a random order for each person. */
  proposal: boolean;
  questions: PublicQuestion[];
};

export type PublicSurvey = {
  title: string;
  ui: AiSurveyDefinition["ui"];
  start: {
    eyebrow: string;
    intro: string;
    time: string;
    organiser: string;
    yourAnswersHeading: string;
    yourAnswers: string[];
    privacyLink: string;
    ticks: { id: string; label: string }[];
    button: string;
    ticksNeeded: string;
    comingBack: AiSurveyDefinition["start"]["comingBack"];
    closed: string;
  };
  emailCheck: AiSurveyDefinition["emailCheck"];
  proposalsIntro: { first: string; later: string };
  scales: Record<string, AiSurveyScaleAnswer[]>;
  pages: PublicPage[];
  end: { heading: string; body: string; passItOn: string; petition: string; newsletterButton: string; newsletterHref: string };
};

/** The page ids in the order one person sees them, from the pages the browser was handed. */
export function sequenceOf(pages: readonly PublicPage[], proposalOrder: readonly string[]): string[] {
  const sequence: string[] = [];
  let placed = false;
  for (const page of pages) {
    if (page.proposal) {
      if (!placed) sequence.push(...proposalOrder);
      placed = true;
    } else {
      sequence.push(page.id);
    }
  }
  return sequence;
}
