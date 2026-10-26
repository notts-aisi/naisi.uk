/**
 * THE WORDS OF A WEEK'S FILL-IN BOXES (board wk-week6-phone, part 3 "Your
 * action plan"), in one place so the week page, its count lines and their
 * tests say the same thing.
 *
 * The board draws a fellow's card: its title, "6 of 12 filled", "Saves as you
 * type. It’s here on your phone for the session.", the numbered headings with
 * their boxes, "Saved", and who reads it. The lines it does not draw (a
 * facilitator's own, the box that did not save, the rows that did not load)
 * are written in its voice and listed for the boards' designers to confirm.
 *
 * Pure: no imports, so a page in the browser and a test read it alike.
 */

/** Under the card's title (the board's words). */
export const FILL_IN_SAVE_LINE = "Saves as you type. It’s here on your phone for the session.";

/** A part, or This week's task, whose boxes are started and not all filled. */
export const FILL_IN_DRAFT = "Draft";

/** "6 of 12 filled". */
export function filledWords(filled: number, of: number): string {
  return `${filled} of ${of} filled`;
}

/** This week's line for a task whose boxes are started: "Draft · 6 of 12 filled". */
export function draftFilledWords(filled: number, of: number): string {
  return `${FILL_IN_DRAFT} · ${filledWords(filled, of)}`;
}

/** The person's own boxes could not be read: no box is writable over what we do not know. */
export const FILL_IN_UNAVAILABLE = "We couldn’t load what you wrote here. Reload before writing, so you don’t write over it.";

/**
 * What the card calls its contents in who reads them: "My action plan" is
 * "your action plan"; a title that is not the writer's own ("Plan") is "what
 * you write here".
 */
export function yourCardWords(title: string): string {
  const own = /^my\s+(.+)$/i.exec(title.trim());
  return own ? `your ${own[1]}` : "what you write here";
}

/**
 * "Rahul, Sofia, Claudia and admins", or "Your facilitators, Claudia and
 * admins": the same people, said the same way, as the reflections' line
 * (`readersWords` in `memberPageWords.ts`).
 */
function readersWords(facilitatorFirstNames: readonly string[], leadFirstName: string | null): string {
  const people = facilitatorFirstNames.length > 0 ? [...facilitatorFirstNames] : ["Your facilitators"];
  const lead = leadFirstName?.trim() ?? "";
  if (lead && !people.includes(lead)) people.push(lead);
  return `${people.join(", ")} and admins`;
}

/**
 * Who reads a fellow's boxes (Q30 C): "Rahul, Sofia, Claudia and admins can
 * read your action plan. Other fellows can’t." (the board's words).
 */
export function fillInReadersWords(facilitatorFirstNames: readonly string[], leadFirstName: string | null, title: string): string {
  return `${readersWords(facilitatorFirstNames, leadFirstName)} can read ${yourCardWords(title)}. Other fellows can’t.`;
}

/**
 * Who reads a facilitator's own boxes (Zach, Mon 26 Oct: facilitators are
 * fellows, and their own work is the lead's and admins'): "Only Claudia and
 * admins can read your action plan."
 */
export function facilitatorFillInReadersWords(leadFirstName: string | null, title: string): string {
  const lead = leadFirstName?.trim();
  return lead ? `Only ${lead} and admins can read ${yourCardWords(title)}.` : `Only admins can read ${yourCardWords(title)}.`;
}

/**
 * A heading or a label with a hint in brackets at its end, as the guide's
 * template writes them ("What I’ll work on (one or two sentences)",
 * "Assuming… (the two or three things that must be true)"): the words, then
 * the hint, which the card sets quieter. No brackets at the end, no hint.
 */
export function withHint(text: string): { words: string; hint: string } {
  const match = /^(.*\S)\s+(\([^()]+\))$/.exec(text.trim());
  return match ? { words: match[1], hint: match[2] } : { words: text.trim(), hint: "" };
}
