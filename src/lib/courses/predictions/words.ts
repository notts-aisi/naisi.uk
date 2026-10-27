import { londonDateKey } from "../weekPlan";
import { londonDayLabel } from "../londonLabels";
import { dayWords } from "../sessionChange/words";
import { tonightWord } from "../memberPageWords";
import type { PredictionAnswer, PredictionQuestion } from "./model";

/**
 * THE WORDS OF SEALED PREDICTIONS, in one place: the course editor's card,
 * the card on the week it is sealed in and on the week it opens in, the
 * admin's panel on the run, and the routes' refusals. No board draws any of
 * it, so every line here is written in the boards' voice and listed in the
 * build notes for the boards' designers to confirm.
 *
 * Week numbers, days and times come from records and are handed in; nothing
 * here knows a term.
 *
 * Pure, so the pages in the browser, the routes and the tests say the same
 * thing in the same words.
 */

// ---------------------------------------------------------------------------
// The course editor's card (admins set it)
// ---------------------------------------------------------------------------

export const CARD_EDITOR_TITLE = "Sealed predictions";
export const CARD_EDITOR_HINT =
  "The credence card each person fills in and seals in one week, and opens in a later one beside the same questions asked again. Only they and admins can read a card.";
export const CARD_FIELD_LABEL = "The card, as printed";
export const CARD_FIELD_HINT =
  "Paste it as the session plans print it. A line ending in ____% asks for a percentage; one ending in ____ with its ends in brackets, like “(0 = not at all, 10 = completely)”, a number on that scale; a line ending in a colon, a sentence.";
export const SEAL_WEEK_LABEL = "Filled in and sealed in week";
export const OPEN_WEEK_LABEL = "Opens in week";
export const CARD_NONE = "This course has no card yet.";
export const CARD_ONLY_ADMIN = "Only an admin can change the card.";
export const CARD_SAVED = "Saved. Anybody who has already started a card keeps the questions they started with.";
export const CARD_TAKEN_OFF =
  "Taken off. No week shows a card now. The cards people filled in are kept, and admins can still open them.";

/** "Sealed in week 1, opened in week 6." */
export function cardWeeksWords(sealWeek: number, openWeek: number): string {
  return `Sealed in week ${sealWeek}, opened in week ${openWeek}.`;
}

// ---------------------------------------------------------------------------
// The card on a week page
// ---------------------------------------------------------------------------

/** The card's section, and its entry in "On this page". */
export const PREDICTIONS_HEADING = "Your predictions";

/** Under the heading in the week it is sealed in. */
export function sealLeadWords(openWeek: number): string {
  return `Answer these on your own, then seal the card. Nobody can change it after that, you included, and it stays shut until week ${openWeek}, when you answer the same questions again and see what moved.`;
}

/** Above the questions while they save. */
export const SEAL_SAVE_LINE = "Saves as you type, until you seal it.";

/** Who reads a card: the owner and admins, and each opening is recorded. */
export const READERS_LINE = "Only you and admins can read your card. Each time an admin opens one, it’s recorded.";

/** The button. */
export const SEAL_BUTTON = "Seal my predictions";

/**
 * Its confirmation: "Seal your card? Nobody can change it after that, you
 * included, and you won’t see your answers again until week 6." With the
 * questions left blank said: "2 of 7 have no answer."
 */
export function sealConfirmWords(openWeek: number, blank: number, total: number): string {
  const lead = `Seal your card? Nobody can change it after that, you included, and you won’t see your answers again until week ${openWeek}.`;
  return blank > 0 ? `${lead} ${blank} of ${total} have no answer.` : lead;
}
export const SEAL_YES = "Seal it";
export const NOT_YET = "Not yet";
/** While the last answers are still saving, the seal waits. */
export const WAIT_FOR_SAVE = "Saving your last answer…";

/** "the session on Tue 1 Dec", or "tonight's session". */
function afterWords(after: { dateKey: string; startTimeLocal: string }, todayKey: string): string {
  return after.dateKey === todayKey ? `${tonightWord(after.startTimeLocal).toLowerCase()}, after your session` : `after your session on ${dayWords(after.dateKey)}`;
}

/**
 * A sealed card in the week it was sealed in: "Sealed on Tue 3 Nov. It opens
 * in week 6, after your session on Tue 1 Dec."
 */
export function sealedWords(
  sealedAt: string,
  openWeek: number,
  after: { dateKey: string; startTimeLocal: string } | null,
  todayKey: string,
): string {
  const day = londonDayLabel(new Date(sealedAt));
  return after ? `Sealed on ${day}. It opens in week ${openWeek}, ${afterWords(after, todayKey)}.` : `Sealed on ${day}. It opens in week ${openWeek}.`;
}

/** A sealed card once the week it opens in is open. */
export function sealedOpenNowWords(sealedAt: string, openWeek: number): string {
  return `Sealed on ${londonDayLabel(new Date(sealedAt))}. Week ${openWeek} is open: answer the questions again there, then open this card.`;
}

/** The way to it. */
export function goToWeekWords(weekNumber: number): string {
  return `Go to week ${weekNumber}`;
}

/** The week the card is filled in on is not open to the reader yet. */
export function sealNotOpenWords(sealWeek: number): string {
  return `You can fill in this card once week ${sealWeek} is open to you.`;
}

/** A card never sealed, once the week it opens in has opened. */
export function closedDraftWords(openWeek: number): string {
  return `You didn’t seal this card, and week ${openWeek} has opened, so it can’t be sealed now.`;
}

// The week it opens in --------------------------------------------------------

/** Under the heading in the week it opens in, before it is opened. */
export function openLeadWords(sealWeek: number): string {
  return `Answer the questions again first. Then open the card you sealed in week ${sealWeek} and see what moved.`;
}

export const OPEN_SAVE_LINE = "Saves as you type, until you open your sealed card.";
/** Somebody answering again with no sealed card to open. */
export const SAVE_LINE = "Saves as you type.";
export const OPEN_BUTTON = "Open my sealed card";
export const OPEN_CONFIRM = "Open your sealed card? Today’s answers stay as they are once you do.";
export const OPEN_YES = "Open it";

/** Somebody who sealed nothing. */
export function nothingToOpenWords(sealWeek: number): string {
  return `You didn’t seal a card in week ${sealWeek}, so there’s nothing to open.`;
}

/** The week's page is in front of somebody whose card has not opened to them yet (a facilitator reading ahead). */
export function waitingWords(after: { dateKey: string; startTimeLocal: string } | null, todayKey: string): string {
  return after ? `Your sealed card opens here ${afterWords(after, todayKey)}.` : "Your sealed card opens here once this week opens to your group.";
}

/** "Sealed on Tue 3 Nov, opened on Fri 4 Dec." */
export function openedWords(sealedAt: string, openedAt: string): string {
  return `Sealed on ${londonDayLabel(new Date(sealedAt))}, opened on ${londonDayLabel(new Date(openedAt))}.`;
}

/** The two columns: "Week 1", "Week 6". */
export function weekColumnWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

export const NO_ANSWER = "No answer";

/** "35%", "7", "0.5%": an answer as a person reads it. */
export function answerWords(question: PredictionQuestion, value: PredictionAnswer | undefined): string {
  if (value === undefined || value === "") return NO_ANSWER;
  if (typeof value === "string") return value;
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return question.kind === "percent" ? `${shown}%` : shown;
}

/** How a number moved: "Up 25 points", "Down 2", "No change"; null for a sentence or a missing answer. */
export function movedWords(question: PredictionQuestion, before: PredictionAnswer | undefined, now: PredictionAnswer | undefined): string | null {
  if (question.kind === "sentence" || typeof before !== "number" || typeof now !== "number") return null;
  const change = Math.round((now - before) * 10) / 10;
  if (change === 0) return "No change";
  const size = Number.isInteger(change) ? String(Math.abs(change)) : Math.abs(change).toFixed(1);
  const unit = question.kind === "percent" ? (Math.abs(change) === 1 ? " point" : " points") : "";
  return `${change > 0 ? "Up" : "Down"} ${size}${unit}`;
}

/** A scale's ends, under its box: "0 = not at all, 10 = completely". */
export function scaleEndsWords(question: PredictionQuestion): string {
  return `0 = ${question.lowLabel}, ${question.max} = ${question.highLabel}`;
}

/** How a question is answered, in the editor's list: "0 to 100%", the scale's ends, or "A sentence". */
export function kindWords(question: PredictionQuestion): string {
  if (question.kind === "percent") return "0 to 100%";
  if (question.kind === "scale") return scaleEndsWords(question);
  return "A sentence";
}

// ---------------------------------------------------------------------------
// The admin's panel on the run
// ---------------------------------------------------------------------------

export const PANEL_TITLE = "Sealed predictions";
export const PANEL_HINT =
  "Each person’s card is theirs. An admin can open one at any time, and each opening is recorded with who opened it and when. Nobody else can read them: not facilitators, and not the programme’s lead.";
export const PANEL_EMPTY = "Nobody on this run has started a card.";
export const PANEL_STARTED = "Started, not sealed";
export const OPEN_CARD = "Open card";
export const CLOSE_CARD = "Close";

/** "Sealed Tue 3 Nov", "Opened Fri 4 Dec". */
export function panelStateWords(sealedAt: string | null, openedAt: string | null): string {
  if (openedAt) return `Opened ${londonDayLabel(new Date(openedAt))}`;
  if (sealedAt) return `Sealed ${londonDayLabel(new Date(sealedAt))}`;
  return PANEL_STARTED;
}

/** The button's name for a screen reader: "Open Amara Okafor’s card". */
export function openCardLabel(name: string): string {
  return `Open ${name}’s card`;
}

/** The two columns of an opened card when the course no longer says its weeks. */
export const PANEL_FIRST = "First card";
export const PANEL_AGAIN = "Asked again";

/** Under an opened card: it was recorded. */
export const PANEL_RECORDED = "Your opening of this card is recorded.";

/** Today's London day, for "tonight". */
export function todayKeyAt(now: Date): string {
  return londonDateKey(now);
}

// ---------------------------------------------------------------------------
// The routes' refusals
// ---------------------------------------------------------------------------

export const REFUSE_NOT_TAKING_PART = "Only somebody taking part in this programme has a predictions card on it.";
export const REFUSE_NO_CARD = "This programme has no predictions card.";
export const REFUSE_SEALED = "Your card is sealed, so it can’t change now.";
export const REFUSE_ALREADY_SEALED = "Your card is already sealed.";
export const REFUSE_SEAL_NEEDS_ONE = "Answer at least one question before you seal your card.";
export const REFUSE_OPEN_NEEDS_ONE = "Answer at least one question first, then open your sealed card.";
export const REFUSE_OPENED = "You’ve opened your sealed card, so today’s answers stay as they are.";
export const REFUSE_ALREADY_OPENED = "You’ve already opened your sealed card.";
export const REFUSE_NO_QUESTION = "That question isn’t on your card. Reload the page.";

/** The week a stage belongs to is not open to them yet. */
export function weekNotOpenWords(weekNumber: number): string {
  return `Week ${weekNumber} isn’t open to you yet.`;
}

/** The week the card opens in has opened, so the first card is shut. */
export function sealWindowShutWords(openWeek: number): string {
  return `Week ${openWeek} has opened, so this card can’t change or be sealed now.`;
}

export const REFUSE_ADMIN_ONLY = "Only an admin can open somebody’s predictions card.";
export const REFUSE_OWN_CARD = "Your own card opens on your week page, in the week it opens in.";
export const REFUSE_NOT_RECORDED = "We couldn’t record that you opened it, so it stays closed. Try again.";
export const REFUSE_NONE_FOR_THEM = "There’s no card for them on this run.";
