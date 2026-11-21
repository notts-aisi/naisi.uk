import { londonDayLabel } from "../londonLabels";
import { daysBetween, isValidDateKey } from "../weekPlan";
import type { CasesBlock, ChooseOneBlock } from "../weekBlocks/model";
import type { WeekDraw } from "./model";

/**
 * THE WORDS OF PACKS, CASES AND TALKS, in the boards' own words, with
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

/** Over a Choose one a facilitator gives out: "Pathway packs"; a title that is a pack already: "Packs". */
export function packsEyebrowWords(title: string): string {
  const word = title.trim();
  if (!word) return "Packs";
  return /pack$/i.test(word) ? `${word}s` : `${word} packs`;
}

/** Over a Choose one the person picks. */
export const CHOOSE_ONE = "Choose one";

/** A list's line as its heading: "One 80,000 Hours career review that fits you". */
export function chooseOneHeadingWords(chooseOne: ChooseOneBlock): string {
  return chooseOne.form === "list" ? capital(chooseOne.title.trim()) : "";
}

/** The chip on the person's own pack: "Your pathway". */
export function yourPackWords(title: string): string {
  return `Your ${titleWord(title)}`;
}

/** "32 minutes · 2 sources", under a pack's name. */
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
 * Under a Choose one a facilitator gives out: "Given out at the end
 * of session 2. Only your pathway counts. To switch, ask Rahul or Sofia."
 */
export function givenPacksLineWords(weekNumber: number, title: string, askNames: readonly string[]): string {
  return [givenOutWords(weekNumber), `Only your ${titleWord(title)} counts.`, askWords("switch", askNames)]
    .filter(Boolean)
    .join(" ");
}

/** Under a Choose one the person picks. */
export const ONLY_THE_ONE_YOU_CHOOSE = "Only the one you choose counts.";

/**
 * Once the person's session has started their pick stays as it is. Not drawn
 * on the boards; listed for the boards' designers to confirm.
 */
export const PICK_CLOSED = "Your session has started, so your choice stays as it is.";

/** When a pick or the ready mark did not save. Not drawn on the boards; listed for the designers. */
export const NOT_SAVED = "That didn’t save. Check your connection and try again.";

/** The button that opens a pack's reading to tick it ("Read"). */
export const READ = "Read";

// ---------------------------------------------------------------------------
// The week page: your case study, and a talk
// ---------------------------------------------------------------------------

/** Over the case a person was given. */
export const YOUR_CASE = "Your case";

/** Where a person's pack or case would be, before it is given. */
export const NOT_GIVEN_YET = "Not given yet";

/** Over a case's links when the guide names none. */
export const START_HERE = "Start here";

/** Under the case a person was given: "Given out at the end of session 2. To swap, ask Rahul or Sofia." */
export function givenCaseLineWords(weekNumber: number, askNames: readonly string[]): string {
  return [givenOutWords(weekNumber), askWords("swap", askNames)].filter(Boolean).join(" ");
}

/** The person's own mark: "Ready for my talk", "Ready for my pitch". */
export function readyWords(talk: CasesBlock["talk"]): string {
  const name = talk?.name.trim() || "talk";
  return `Ready for my ${name}`;
}

/** Until the person marks themselves ready. */
export const NOT_READY_YET = "Not ready yet";

/** "All 22 cases this week". */
export function allCasesWords(count: number): string {
  return count === 1 ? "The case this week" : `All ${count} cases this week`;
}

/** "8 cases", beside a group of cases. */
export function casesWords(count: number): string {
  return count === 1 ? "1 case" : `${count} cases`;
}

/** This week's line under a talk: "Your case:" before the case's name. */
export const YOUR_CASE_LABEL = "Your case:";

// ---------------------------------------------------------------------------
// The draw page
// ---------------------------------------------------------------------------

/** What a week's draw gives out: "Pathways and cases", "Plans", "Cases". */
export function drawTitleWords(draw: WeekDraw): string {
  const packs = draw.packs.map((chooseOne) => plural(chooseOne.title));
  const parts = [...new Set(packs)];
  if (draw.cases.length > 0) parts.push(parts.length > 0 ? "cases" : "Cases");
  if (parts.length === 0) return "Pathways and cases";
  return capital(joinNames(parts.map((part, index) => (index === 0 ? part : lower(part)))));
}

/**
 * "Group B · after session 2": the eyebrow over the draw (uppercase by the
 * stylesheet), naming the session the slips are handed out at
 * (`drawWeekRule`'s hand-out session, which after an evening called off is
 * an earlier one); the group alone with none, as for week 1.
 */
export function drawEyebrowWords(groupName: string, handOutSession: number | null): string {
  return handOutSession !== null && handOutSession >= 1 ? `${groupName} · after session ${handOutSession}` : groupName;
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

/** Under Save: "Each person sees theirs on their week 3 page. No email." */
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

/** "a pathway and a case", "a plan", "a case": what each person is given in a week's draw. */
export function drawHoldingWords(draw: { packs: ReadonlyArray<{ title: string }>; cases: readonly unknown[] }): string {
  const things = [...new Set(draw.packs.map((chooseOne) => titleWord(chooseOne.title)))].map(
    (word) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`,
  );
  if (draw.cases.length > 0) things.push("a case");
  return joinNames(things);
}

/** After Save: "Saved. 6 of 8 have a pathway and a case. Each person sees theirs on their week 3 page." */
export function savedDrawWords(weekNumber: number, have: number, total: number, holding: string): string {
  return `Saved. ${have} of ${total} ${have === 1 ? "has" : "have"} ${holding}. Each person sees theirs on their week ${weekNumber} page.`;
}

/** A save that failed, on the page and from the route. */
export const DRAW_NOT_SAVED = "That didn’t save, so nothing has changed. Try again.";

/** Leaving with changes not saved: "You’ve changed 2 people and haven’t saved." */
export function leavingUnsavedWords(people: number): string {
  return `You’ve changed ${people === 1 ? "1 person" : `${people} people`} and haven’t saved.`;
}

export const LEAVE_WITHOUT_SAVING = "Leave without saving";

/** Asked before a save into a week whose session has started or been held. */
export const READY_TAKEN_BACK = "Changing a case takes back that person’s Ready for my talk.";

/** The confirmation's own button. Not drawn on the boards. */
export const SAVE_ANYWAY = "Save anyway";

/** The Week picker's label. */
export const WEEK = "Week";

/** Beside the Week picker once a week is chosen with the keyboard: "Open week 4". Not drawn on the boards. */
export function openWeekWords(weekNumber: number): string {
  return `Open week ${weekNumber}`;
}

/** A week in the Week picker: "Week 3 · Pathways and cases", or "Week 6" for one that gives nothing out. */
export function drawWeekOptionWords(weekNumber: number, draw: WeekDraw | null): string {
  return draw && (draw.packs.length > 0 || draw.cases.length > 0) ? drawHeadingWords(weekNumber, draw) : `Week ${weekNumber}`;
}

/** "Weeks 2 to 5", "Weeks 2 and 4", "Week 3", "Weeks 1 to 3, 5 and 6". */
function weeksWords(weeks: readonly number[]): string {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const runs: string[] = [];
  let count = 0;
  for (let at = 0; at < sorted.length; ) {
    let end = at;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    if (end - at >= 2) {
      runs.push(`${sorted[at]} to ${sorted[end]}`);
      count += 2;
    } else {
      for (let k = at; k <= end; k += 1) {
        runs.push(String(sorted[k]));
        count += 1;
      }
    }
    at = end + 1;
  }
  return `${count === 1 ? "Week" : "Weeks"} ${joinNames(runs)}`;
}

/** Under the Week picker: "Weeks 2 to 5 give something out. Weeks 1 and 6 don’t." */
export function givingWeeksWords(giving: readonly number[], notGiving: readonly number[]): string {
  if (giving.length === 0) return "";
  const one = new Set(giving).size === 1;
  const first = `${weeksWords(giving)} ${one ? "gives" : "give"} something out.`;
  if (notGiving.length === 0) return first;
  return `${first} ${weeksWords(notGiving)} ${new Set(notGiving).size === 1 ? "doesn’t" : "don’t"}.`;
}

/** "Wednesday" for a "YYYY-MM-DD" date key. */
function weekdayOfKey(dateKey: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(`${dateKey}T00:00:00Z`).getUTCDay()] ?? "";
}

/**
 * Before the session that hands a week's slips out: "Week 3’s slips go out
 * at Wednesday’s session. You can set them early and change them
 * afterwards." A session more than six days away is named by its date: "at
 * the session on Wed 2 Dec".
 */
export function setBeforeWords(weekNumber: number, handOut: { dateKey: string; startsAt: Date }, todayKey: string): string {
  const near = isValidDateKey(handOut.dateKey) && isValidDateKey(todayKey) && daysBetween(todayKey, handOut.dateKey) <= 6;
  const when = near ? `${weekdayOfKey(handOut.dateKey)}’s session` : `the session on ${londonDayLabel(handOut.startsAt)}`;
  return `Week ${weekNumber}’s slips go out at ${when}. You can set them early and change them afterwards.`;
}

/** A week with no session before it, still to come. Not drawn on the boards. */
export function noSessionBeforeWords(weekNumber: number): string {
  return `Week ${weekNumber} has no session before it, so you can set its slips any time before its first session and change them afterwards.`;
}

/**
 * The session just before a week still to come is called off: "Session 4 is
 * called off, so week 5’s slips go out at the end of session 3." Not drawn on
 * the boards.
 */
export function handOutCalledOffWords(weekNumber: number, calledOff: number, handOut: number | null): string {
  return handOut !== null
    ? `Session ${calledOff} is called off, so week ${weekNumber}’s slips go out at the end of session ${handOut}.`
    : `Session ${calledOff} is called off, so there is no session before week ${weekNumber} to hand its slips out at.`;
}

/** Once every session has ended: "Group C’s sessions have finished. This is what was given out." */
export function sessionsFinishedWords(groupName: string): string {
  return `${groupName}’s sessions have finished. This is what was given out.`;
}

/**
 * WHICH WEEK THIS IS, for a week whose session has started or been held:
 * said on the page before any change, and first in what Save asks.
 *  - "Week 3 is the week people are working on now. Its session has started."
 *  - its session called off: "Week 3 is the week people are working on now.
 *    Its session on Tue 17 Nov is called off."
 *  - "Week 2’s session was on Tue 10 Nov."
 *  - its session called off: "Week 2’s session was due on Tue 10 Nov and was
 *    called off."
 * Not drawn on the boards.
 */
export function weekStandingWords(weekNumber: number, standing: "now" | "met", startsAt: Date, calledOff: boolean): string {
  const day = londonDayLabel(startsAt);
  if (standing === "now") {
    return `Week ${weekNumber} is the week people are working on now. ${calledOff ? `Its session on ${day} is called off.` : "Its session has started."}`;
  }
  return calledOff ? `Week ${weekNumber}’s session was due on ${day} and was called off.` : `Week ${weekNumber}’s session was on ${day}.`;
}

/**
 * WHAT A LATE SAVE CHANGES, after which week it is: for each Choose one the
 * week gives out whose pack counts towards the week (a This week task covers
 * it, so `weekDone` needs the pack the person holds ticked), "Changing a plan
 * means that person’s week is done only once the new plan is ticked.", in the
 * Choose one's own word; and, when the week gives out cases, the owner's
 * sentence (a changed case clears that person's ready mark). Nothing for a
 * Choose one no task counts: changing it changes only what the person reads.
 */
export function lateSaveChangesWords(input: { countedPackTitles: readonly string[]; givesCases: boolean }): string[] {
  const words = [...new Set(input.countedPackTitles.map(titleWord))];
  const lines = words.map((word) => `Changing ${/^[aeiou]/i.test(word) ? "an" : "a"} ${word} means that person’s week is done only once the new ${word} is ticked.`);
  if (input.givesCases) lines.push(READY_TAKEN_BACK);
  return lines;
}

/** The route's refusal of a save into such a week sent without the yes: which week, the yes, then what it changes. */
export function lateSaveRefusedWords(ask: readonly string[]): string {
  const [standing, ...changes] = ask;
  return [standing, "This save needs a yes first.", ...changes].filter(Boolean).join(" ");
}

/**
 * What Save asks after the route refused a save for want of a yes (the
 * week's session started after the page was opened): the route's own lines,
 * which week it is first, or its sentence when it sent no lines.
 */
export function askAfterRefusal(answer: { ask?: unknown; error?: unknown } | null): string[] {
  const lines = Array.isArray(answer?.ask) ? answer.ask.filter((line): line is string => typeof line === "string" && line.trim() !== "") : [];
  if (lines.length > 0) return lines;
  return typeof answer?.error === "string" && answer.error.trim() ? [answer.error] : [DRAW_NOT_SAVED];
}

/** Under a week that gives nothing out: "Back to Group C". */
export function backToWords(label: string): string {
  return `Back to ${label}`;
}

/** A week with nothing to give out: "Nothing is given out in week 6." */
export function nothingGivenOutWords(weekNumber: number): string {
  return `Nothing is given out in week ${weekNumber}.`;
}

// ---------------------------------------------------------------------------
// The group page: the spread
// ---------------------------------------------------------------------------

/** The week the group page's card is about, under its title: "Week 3". */
export function drawCardWeekWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** "Pathways in Group B"; "Cases in Group B" for a week that gives out cases alone. */
export function spreadTitleWords(draw: WeekDraw, groupName: string): string {
  const first = draw.packs[0];
  return `${first ? plural(first.title) : "Cases"} in ${groupName}`;
}

/** The link to the draw page: "Change pathways and cases". */
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
