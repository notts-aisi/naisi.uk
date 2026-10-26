import type { CasesBlock, ChooseOneBlock } from "../weekBlocks/model";
import type { WeekDraw } from "./model";

/**
 * THE WORDS OF PACKS, CASES AND TALKS, in the boards' own words (wk-cases,
 * wk-week, wk-week-phone, wk-week6-phone, wk-fac-group, wk-programme), with
 * the names, numbers and titles filled in from records and the week's own
 * blocks: a Choose one's title ("Pathway", "Plan", "Pack") is the week's, so
 * week 3 reads "Pathway packs" and "Change pathways and cases" and week 5
 * reads "Plan packs" and "Change plans".
 *
 * Words no board draws are said so beside them, for the boards' designers to
 * confirm. Pure, so the week page in the browser and the pages on the server
 * say the same thing.
 */

/** "Amara", "Amara and Isaac", "Amara, Isaac and Zara"; `or` for "Rahul or Sofia". */
export function joinNames(names: readonly string[], word: "and" | "or" = "and"): string {
  const given = names.map((name) => name.trim()).filter(Boolean);
  if (given.length <= 1) return given[0] ?? "";
  return `${given.slice(0, -1).join(", ")} ${word} ${given[given.length - 1]}`;
}

/** A Choose one's title as a word inside a sentence: "pathway", "plan", "pack". */
function titleWord(title: string): string {
  const word = title.trim();
  return word ? word.charAt(0).toLowerCase() + word.slice(1) : "pack";
}

/** Whether a title is one word, so it takes an "s" ("Pathway" to "Pathways"). */
function isOneWord(title: string): boolean {
  return /^[A-Za-z]+$/.test(title.trim());
}

/** "Pathways", "Plans", "Packs": what a facilitator gives out of a Choose one. */
function plural(title: string): string {
  return isOneWord(title) ? `${title.trim()}s` : "Packs";
}

function capital(words: string): string {
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : words;
}

function lower(words: string): string {
  return words ? words.charAt(0).toLowerCase() + words.slice(1) : words;
}

// ---------------------------------------------------------------------------
// The week page: a Choose one
// ---------------------------------------------------------------------------

/** Over a Choose one a facilitator gives out (wk-week): "Pathway packs"; a title that is a pack already: "Packs". */
export function packsEyebrowWords(title: string): string {
  const word = title.trim();
  if (!word) return "Packs";
  return /pack$/i.test(word) ? `${word}s` : `${word} packs`;
}

/** Over a Choose one the person picks (wk-week6-phone). */
export const CHOOSE_ONE = "Choose one";

/** A list's line as its heading: "One 80,000 Hours career review that fits you". */
export function chooseOneHeadingWords(chooseOne: ChooseOneBlock): string {
  return chooseOne.form === "list" ? capital(chooseOne.title.trim()) : "";
}

/** The chip on the person's own pack (wk-week): "Your pathway". */
export function yourPackWords(title: string): string {
  return `Your ${titleWord(title)}`;
}

/** "32 minutes · 2 sources", under a pack's name (wk-week). */
export function packMetaWords(time: string, sources: number): string {
  const count = sources === 1 ? "1 source" : sources > 1 ? `${sources} sources` : "";
  return [time.trim(), count].filter(Boolean).join(" · ");
}

/** "Given out at the end of session 2." for week 3; nothing for week 1, which no session comes before. */
function givenOutWords(weekNumber: number): string {
  return weekNumber >= 2 ? `Given out at the end of session ${weekNumber - 1}.` : "";
}

/** "To switch, ask Rahul or Sofia." Nothing when there is nobody else to ask. */
function askWords(verb: "switch" | "swap", askNames: readonly string[]): string {
  const who = joinNames(askNames, "or");
  return who ? `To ${verb}, ask ${who}.` : "";
}

/**
 * Under a Choose one a facilitator gives out (wk-week): "Given out at the end
 * of session 2. Only your pathway counts. To switch, ask Rahul or Sofia."
 */
export function givenPacksLineWords(weekNumber: number, title: string, askNames: readonly string[]): string {
  return [givenOutWords(weekNumber), `Only your ${titleWord(title)} counts.`, askWords("switch", askNames)]
    .filter(Boolean)
    .join(" ");
}

/** Under a Choose one the person picks (wk-week6-phone). */
export const ONLY_THE_ONE_YOU_CHOOSE = "Only the one you choose counts.";

/**
 * Once the person's session has started their pick stays as it is. Not drawn
 * on the boards; listed for the boards' designers to confirm.
 */
export const PICK_CLOSED = "Your session has started, so your choice stays as it is.";

/** When a pick or the ready mark did not save. Not drawn on the boards; listed for the designers. */
export const NOT_SAVED = "That didn’t save. Check your connection and try again.";

/** The button that opens a pack's reading to tick it (wk-week6-phone: "Read"). */
export const READ = "Read";

// ---------------------------------------------------------------------------
// The week page: your case study, and a talk
// ---------------------------------------------------------------------------

/** Over the case a person was given (wk-week). */
export const YOUR_CASE = "Your case";

/** Where a person's pack or case would be, before it is given (wk-cases). */
export const NOT_GIVEN_YET = "Not given yet";

/** Over a case's links when the guide names none. */
export const START_HERE = "Start here";

/** Under the case a person was given (wk-week): "Given out at the end of session 2. To swap, ask Rahul or Sofia." */
export function givenCaseLineWords(weekNumber: number, askNames: readonly string[]): string {
  return [givenOutWords(weekNumber), askWords("swap", askNames)].filter(Boolean).join(" ");
}

/** The person's own mark (wk-week, wk-week6-phone): "Ready for my talk", "Ready for my pitch". */
export function readyWords(talk: CasesBlock["talk"]): string {
  const name = talk?.name.trim() || "talk";
  return `Ready for my ${name}`;
}

/** Until the person marks themselves ready (wk-week, wk-programme). */
export const NOT_READY_YET = "Not ready yet";

/** "All 22 cases this week" (wk-week). */
export function allCasesWords(count: number): string {
  return count === 1 ? "The case this week" : `All ${count} cases this week`;
}

/** "8 cases", beside a group of cases (wk-week). */
export function casesWords(count: number): string {
  return count === 1 ? "1 case" : `${count} cases`;
}

/** This week's line under a talk (wk-week): "Your case:" before the case's name. */
export const YOUR_CASE_LABEL = "Your case:";

// ---------------------------------------------------------------------------
// The draw page (wk-cases, option A)
// ---------------------------------------------------------------------------

/** What a week's draw gives out: "Pathways and cases", "Plans", "Cases". */
export function drawTitleWords(draw: WeekDraw): string {
  const packs = draw.packs.map((chooseOne) => plural(chooseOne.title));
  const parts = [...new Set(packs)];
  if (draw.cases.length > 0) parts.push(parts.length > 0 ? "cases" : "Cases");
  if (parts.length === 0) return "Pathways and cases";
  return capital(joinNames(parts.map((part, index) => (index === 0 ? part : lower(part)))));
}

/** "Group B · after session 2": the eyebrow over the draw (uppercase by the stylesheet). */
export function drawEyebrowWords(groupName: string, weekNumber: number): string {
  return weekNumber >= 2 ? `${groupName} · after session ${weekNumber - 1}` : groupName;
}

/** "Week 3 · Pathways and cases". */
export function drawHeadingWords(weekNumber: number, draw: WeekDraw): string {
  return `Week ${weekNumber} · ${drawTitleWords(draw)}`;
}

export const DRAW_LEDE = "Copy in the slips you handed out tonight.";
export const SWAP_TWO_PEOPLE = "Swap two people";
export const CASE = "Case";

/** The only option of a case list before the person has a pack: "Choose a pathway first". */
export function choosePackFirstWords(title: string): string {
  const word = titleWord(title);
  return `Choose ${/^[aeiou]/i.test(word) ? "an" : "a"} ${word} first`;
}

/** Under Save (wk-cases): "Each person sees theirs on their week 3 page. No email." */
export function drawFootWords(weekNumber: number): string {
  return `Each person sees theirs on their week ${weekNumber} page. No email.`;
}

export const SAVE = "Save";

/**
 * The swap's own controls, and what it says once two people have swapped.
 * The board draws the button only; listed for the boards' designers to
 * confirm.
 */
export const SWAP_LABEL = "Swap";
export const SWAP_WITH = "With";
export const SWAP_THEM = "Swap them";
export const CANCEL = "Cancel";
export function swappedWords(first: string, second: string): string {
  return `${first} and ${second} swapped. Save to keep it.`;
}

/** After Save: not drawn on the board; listed for the designers. */
export function savedDrawWords(weekNumber: number): string {
  return `Saved. Each person sees theirs on their week ${weekNumber} page.`;
}

/** A week with nothing to give out. Not drawn on the board; listed for the designers. */
export function nothingGivenOutWords(weekNumber: number): string {
  return `Nothing is given out in week ${weekNumber}.`;
}

// ---------------------------------------------------------------------------
// The group page: the spread (wk-fac-group)
// ---------------------------------------------------------------------------

/** "Pathways in Group B"; "Cases in Group B" for a week that gives out cases alone. */
export function spreadTitleWords(draw: WeekDraw, groupName: string): string {
  const first = draw.packs[0];
  return `${first ? plural(first.title) : "Cases"} in ${groupName}`;
}

/** The link to the draw page (wk-fac-group): "Change pathways and cases". */
export function changeDrawWords(draw: WeekDraw): string {
  return `Change ${lower(drawTitleWords(draw))}`;
}

/**
 * Who has nothing yet, under the spread: "Not given yet: Kofi and Sam". The
 * board's spread has everybody given one; listed for the designers.
 */
export function notGivenYetWords(firstNames: readonly string[]): string {
  return `${NOT_GIVEN_YET}: ${joinNames(firstNames)}`;
}

/** A week that gives out cases alone, once everybody has one. Listed for the designers. */
export const EVERYBODY_HAS_A_CASE = "Everybody has a case.";
