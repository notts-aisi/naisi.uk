import type { WaitingPart } from "./waiting";

/**
 * THE WORDS FOR A PART THAT WAITS ON THE FACILITATOR'S SLIP (`./waiting.ts`).
 *
 * What a member reads is the design's, word for word, with their own
 * facilitator's first name and the real week in place of the sample ones.
 * A group with more than one facilitator names them all, with the verb in
 * the plural ("Rahul and Sofia give these out ..."). Where there are no
 * words for a state (a group with no facilitator named; a week whose
 * sessions cannot be dated), these say nothing and the page says what it
 * said before.
 *
 * What staff read is plain and says what is true: how many in the group are
 * waiting for what, and "Waiting" where a week or a piece of it is neither
 * done nor not done.
 *
 * Pure, so the week page in the browser and the pages on the server say the
 * same thing.
 */

/** A part, a week or a piece of a week that waits: neither done nor not done. */
export const WAITING = "Waiting";

/** What a part waits for, in a member's own words: "pathway", "plan", "case". */
function wordOf(part: Pick<WaitingPart, "kind"> & { word?: string }): string {
  return part.kind === "case" ? "case" : part.word || "pack";
}

/** Under a task of This week that waits: "Waiting for your pathway", "Waiting for your case". */
export function waitingForWords(part: Pick<WaitingPart, "kind"> & { word?: string }): string {
  return `Waiting for your ${wordOf(part)}`;
}

/**
 * WHEN THE WEEK'S SLIPS GO OUT, for the person's own week page, from the one
 * rule (`drawWeekRule`, with the person's own sessions):
 *  - `session`: the session that hands them out (its week's number, so a
 *    called-off session names the one before it) and whether it has ended;
 *  - `none`: no session comes before the week (week 1, or every one before
 *    it called off), so they are set before it;
 *  - `undated`: nothing can be dated, so nobody can say.
 */
export type HandOut =
  | { kind: "session"; weekNumber: number; ended: boolean }
  | { kind: "none" }
  | { kind: "undated" };

/** "Rahul", "Rahul and Sofia", "Rahul, Sofia and Farah". */
function namesWords(firstNames: readonly string[]): string {
  return firstNames.length <= 1 ? (firstNames[0] ?? "") : `${firstNames.slice(0, -1).join(", ")} and ${firstNames[firstNames.length - 1]}`;
}

/** One facilitator's first name, or the first names of several. */
type Names = string | readonly string[];

const listOf = (names: Names): readonly string[] => (typeof names === "string" ? [names] : names);

/**
 * "Rahul gives these out at the end of week 2’s session."; with more than
 * one facilitator, "Rahul and Sofia give these out at the end of week 2’s
 * session."
 */
export function handsOutWords(firstNames: Names, weekNumber: number): string {
  const names = listOf(firstNames);
  return `${namesWords(names)} ${names.length > 1 ? "give" : "gives"} these out at the end of week ${weekNumber}’s session.`;
}

/**
 * "Rahul hasn’t copied in your slip yet. There’s nothing you need to do, and
 * nobody will remind you about this part until it’s here."; with more than
 * one facilitator, "Rahul and Sofia haven’t copied in your slip yet. ..."
 */
export function notCopiedInWords(firstNames: Names): string {
  const names = listOf(firstNames);
  return `${namesWords(names)} ${names.length > 1 ? "haven’t" : "hasn’t"} copied in your slip yet. There’s nothing you need to do, and nobody will remind you about this part until it’s here.`;
}

/**
 * THE LINE UNDER THE FIRST PART THAT WAITS, on the person's own week page:
 * before the session that hands the slips out, who gives them out and at
 * which session; after it (or with no session before the week), that they
 * are not copied in yet and nobody will chase them for it. Null when there
 * are no words for it: no facilitator to name, or no date to tell before
 * from after. The page then says what it said before.
 */
export function waitingLineWords(handOut: HandOut | null, facilitatorFirstNames: readonly string[]): string | null {
  const names = facilitatorFirstNames.map((name) => name.trim()).filter(Boolean);
  if (!handOut || names.length === 0) return null;
  if (handOut.kind === "session") return handOut.ended ? notCopiedInWords(names) : handsOutWords(names, handOut.weekNumber);
  if (handOut.kind === "none") return notCopiedInWords(names);
  return null;
}

// ---------------------------------------------------------------------------
// Staff pages
// ---------------------------------------------------------------------------

/** "a case", "a pathway", "an option". */
function withArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

/** "a pathway and a case". */
function partsWords(words: readonly string[]): string {
  const said = words.map(withArticle);
  return said.length <= 1 ? (said[0] ?? "") : `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}`;
}

/**
 * HOW MANY ARE WAITING FOR A SLIP, as a group's page says it beside how many
 * have done the week: one sentence for each set of things people are
 * waiting for, in the order the week gives them out. To the group's own
 * facilitator, "2 are waiting for a case from you."; to anybody else (the
 * programme's lead, an admin), "2 are waiting for a case.". "" with nobody
 * waiting.
 */
export function waitingCountWords(people: ReadonlyArray<readonly WaitingPart[]>, fromYou: boolean): string {
  const groups = new Map<string, { words: string[]; count: number }>();
  for (const parts of people) {
    if (parts.length === 0) continue;
    const words = [...new Set(parts.map(wordOf))];
    const key = words.join("\u0000");
    const group = groups.get(key) ?? { words, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ words, count }) => `${count} ${count === 1 ? "is" : "are"} waiting for ${partsWords(words)}${fromYou ? " from you" : ""}.`)
    .join(" ");
}
