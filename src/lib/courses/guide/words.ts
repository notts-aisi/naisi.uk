import { readOutWords, readersWords } from "../memberPageWords";

/**
 * THE WORDS OF A PROGRAMME'S START HERE AND GLOSSARY PAGES (boards wk-start,
 * wk-start-phone, wk-glossary, wk-glossary-phone), the week page's link row
 * (st-week1-phone) and the programme page's "About this course"
 * (wk-programme). The boards' words, with the boards' apostrophes; every
 * name and count comes in from a record. Words no board draws are marked,
 * and are listed in the build notes for the boards' designers to confirm.
 */

export const START_HERE = "Start here";
export const GLOSSARY = "Glossary";

/** The programme's label over the title: "Fellowship: AGI Strategy", or the name alone when no programme names the run. */
export function guideEyebrow(kind: "fellowship" | "incubator" | null, name: string): string {
  const kindWord = kind === "fellowship" ? "Fellowship" : kind === "incubator" ? "Incubator" : "";
  const trimmed = name.trim();
  return kindWord && trimmed ? `${kindWord}: ${trimmed}` : trimmed;
}

/** The box's bold opening, under the guide's "Reflections." paragraph (wk-start). */
export const ON_THIS_SITE = "On this site:";

/**
 * The rest of the box (wk-start): where reflections are written and who
 * reads them, named from records. Somebody in a group reads their group's
 * facilitators and the programme's lead: "Rahul, Sofia, Claudia and admins
 * can read them; other fellows can’t. Rahul or Sofia may read a line out in
 * the session, without your name." Before groups go out, and for anybody
 * with no group, the line's general form: "Your facilitators, Claudia and
 * admins …". A facilitator taking part reads who reads theirs: the lead and
 * admins only, and nobody reads theirs out (Zach, Mon 26 Oct; not drawn on
 * the boards).
 */
export function onThisSiteWords(input: { facilitatorFirstNames: readonly string[]; leadFirstName: string | null; asFacilitator: boolean }): string {
  const lead = input.leadFirstName?.trim() || null;
  const where = "write your reflections in the boxes on each week’s page. They save as you type. You don’t need to send them.";
  if (input.asFacilitator) return `${where} ${lead ? `Only ${lead} and admins` : "Only admins"} can read them.`;
  return `${where} ${readersWords(input.facilitatorFirstNames, lead)} can read them; other fellows can’t. ${readOutWords(input.facilitatorFirstNames)}`;
}

/** The Glossary's find box (wk-glossary). */
export const FIND_A_TERM = "Find a term";

/** "35 terms", from the record; while the box holds words, "3 of 35 terms" (not drawn on the boards). */
export function termsCountWords(total: number, shown: number | null = null): string {
  const all = `${total} ${total === 1 ? "term" : "terms"}`;
  return shown === null || shown === total ? all : `${shown} of ${all}`;
}

/** When nothing matches the find box (not drawn on the boards). */
export function noTermMatchesWords(query: string): string {
  return `No term matches “${query.trim()}”.`;
}

/** The Glossary's foot (wk-glossary). */
export const SOMETHING_MISSING = "Something missing? Ask your facilitator.";

/** A run with no Start here yet (not drawn on the boards). */
export const START_HERE_EMPTY = "Start here isn’t written for this programme yet.";

/** A run with no Glossary yet (not drawn on the boards). */
export const GLOSSARY_EMPTY = "The Glossary isn’t written for this programme yet.";

/** The way back from an empty page (not drawn on the boards). */
export function backToWords(programme: string): string {
  return `Back to ${programme}`;
}

/** The programme page's card and its two links (wk-programme). */
export const ABOUT_THIS_COURSE = "About this course";
export const START_HERE_CARD_LINE = "How a week works, the rubric, support";
