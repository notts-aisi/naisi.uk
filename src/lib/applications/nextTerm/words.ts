import { COURSEWORK_USE_FROM_VERSION } from "@/lib/legal/courseworkUse";
import type { NoteSuggestion } from "@/lib/memberNotes/model";
import { NOTES_WORDS } from "@/lib/memberNotes/words";

/**
 * The words of a term's Next term page, and of the card on the term page that
 * leads to it. Plain, British, no dashes. Pure: the page in the browser
 * imports it.
 */

const V = COURSEWORK_USE_FROM_VERSION;

/** What a person said about facilitating on this term's application. */
export type FacilitatingAnswer = "offered" | "no" | "no-answer";

export const NEXT_TERM_WORDS = {
  title: "Next term: who to ask",
  chip: "Admins only",
  lede: (term: string) =>
    `${term ? `${term}. ` : ""}Everyone a saved note from this term suggests for next term, with the team’s ratings and words behind them.`,
  /** The rule, in one line, as every place that shows notes says its own. */
  rule: `Only notes written after the person agreed to version ${V} of the privacy policy count here, and only ratings of answers written after it. Nobody is shown suggestions about themselves.`,

  /** The three tabs: the boxes a note's "Suggest for next term" offers. */
  tabsLabel: "Who they are suggested for",
  tab: NOTES_WORDS.suggestion as Readonly<Record<NoteSuggestion, string>>,
  offeredOnly: "Only people who offered to facilitate",

  columns: {
    person: "Person",
    place: "Programme and group",
    suggestedIn: "Suggested in",
    ratings: "Team ratings",
    application: "On their application",
    words: "In the team’s words",
  },
  tableCaption: (tab: string) => `People suggested for next term: ${tab.toLowerCase()}`,
  application: { offered: "Offered", no: "No", "no-answer": "No answer" } as Readonly<Record<FacilitatingAnswer, string>>,
  notRated: "Not rated",
  noWords: "No comment yet",
  /** The words of a rating's comment, and whose they are. */
  quoted: (text: string) => `“${text}”`,
  by: (name: string) => `(${name})`,
  /** A row's person when their account holds no name. */
  noName: "NAISI member",
  /** A rater whose name can't be read. */
  someone: "Someone on the team",

  empty: {
    facilitating: "Nobody has been suggested for facilitating yet.",
    incubator: "Nobody has been suggested for an incubator yet.",
    committee: "Nobody has been suggested for the committee yet.",
  } as Readonly<Record<NoteSuggestion, string>>,
  emptyHow: `A suggestion is a “${NOTES_WORDS.suggestTitle}” box ticked on a saved note about somebody on this term’s programmes.`,
  noneOffered: "Nobody suggested for facilitating offered to facilitate on their application.",
  showing: (shown: number, all: number) => `Showing ${shown} of ${all}: the others didn’t offer to facilitate on their application.`,

  noList: {
    title: "There is no “not suggested” list",
    text: "Somebody nobody has suggested simply isn’t on this page, so it says nothing about them at all. This is a place to start, built from what the team wrote: who to ask is still yours to decide.",
  },

  /** A lead or a reviewer on the form, shown in place of the page. */
  adminsOnly:
    "An admin works out who to ask next term, from the notes and ratings the team keeps. You can still read and decide your own programme’s applications.",

  /** The card under "Also this term" on the term page. */
  card: {
    title: "Next term: who to ask",
    line: "The people this term’s saved notes suggest for facilitating, an incubator or the committee, with the team’s ratings and words.",
    link: "See who to ask",
  },
} as const;

/** The place a row's person holds on one of the term's programmes, in words. */
export function placeWords(programme: string, seat: { group: string | null; facilitates: boolean; left: boolean } | null): string {
  if (!seat) return programme;
  if (seat.left) return `${programme} · left`;
  if (!seat.group) return programme;
  return seat.facilitates ? `${programme} · facilitates ${seat.group}` : `${programme} · ${seat.group}`;
}

/**
 * The notes a suggestion was made in: each note's week where it has one, else
 * "a note". "Week 3", "Weeks 2, 3", "Weeks 2, 3 and a note", "A note",
 * "2 notes".
 */
export function suggestedInWords(notes: readonly { weekNumber: number | null }[]): string {
  const weeks = [...new Set(notes.map((note) => note.weekNumber).filter((week): week is number => week !== null))].sort((a, b) => a - b);
  const others = notes.filter((note) => note.weekNumber === null).length;
  const inWeeks = weeks.length === 0 ? "" : `${weeks.length === 1 ? "Week" : "Weeks"} ${weeks.join(", ")}`;
  const inNotes = others === 0 ? "" : others === 1 ? "a note" : `${others} notes`;
  if (inWeeks && inNotes) return `${inWeeks} and ${inNotes}`;
  if (inWeeks) return inWeeks;
  return inNotes ? inNotes.charAt(0).toUpperCase() + inNotes.slice(1) : "";
}

/** A row's ratings in words: "10, 8, 9", or "Not rated". */
export function ratingsWords(ratings: readonly number[]): string {
  return ratings.length === 0 ? NEXT_TERM_WORDS.notRated : ratings.join(", ");
}
