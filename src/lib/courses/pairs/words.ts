import { joinNames } from "../packsAndCases/words";

/**
 * THE WORDS OF PAIRS FOR A SESSION IN PAIRS (Technical AI Safety's hands-on
 * night), with names and numbers filled in from records. No board draws pairs:
 * every line here is written in the boards' voice and listed in the build
 * notes for the boards' designers to confirm.
 *
 * Pure, so the week page in the browser, the pairs page and the group page
 * on the server, and the route say the same thing.
 */

export { joinNames };

// ---------------------------------------------------------------------------
// The pairs page and the group page
// ---------------------------------------------------------------------------

/** What a facilitator types for the session: "Pairs and laptops", or "Pairs" for a week that asks nothing about laptops. */
export function pairsTitleWords(laptops: boolean): string {
  return laptops ? "Pairs and laptops" : "Pairs";
}

/** "Week 5 · Pairs and laptops". */
export function pairsHeadingWords(weekNumber: number, laptops: boolean): string {
  return `Week ${weekNumber} · ${pairsTitleWords(laptops)}`;
}

/** Under the heading. */
export function pairsLedeWords(laptops: boolean): string {
  return laptops
    ? "Pair everybody up for the session, with at least one laptop in each pair. A pair is two people, or three."
    : "Pair everybody up for the session. A pair is two people, or three.";
}

/** Each person's select. */
export const PAIR = "Pair";
export const NOT_PAIRED_YET = "Not paired yet";

/** "Pair 3". */
export function pairNumberWords(number: number): string {
  return `Pair ${number}`;
}

/** Each person's switch. */
export const BRINGING_A_LAPTOP = "Bringing a laptop";

/** Over the pairs as they stand, on the pairs page. */
export const THE_PAIRS = "The pairs";

/** Who is bringing a laptop in one pair: "Laptop: Amara", "Laptops: Amara and Kofi", "No laptop yet". */
export function pairLaptopsWords(firstNames: readonly string[]): string {
  if (firstNames.length === 0) return NO_LAPTOP_YET;
  return `${firstNames.length === 1 ? "Laptop" : "Laptops"}: ${joinNames(firstNames)}`;
}

export const NO_LAPTOP_YET = "No laptop yet";

/** The check, once every pair has a laptop. */
export const EVERY_PAIR_HAS_A_LAPTOP = "Every pair has a laptop.";

/** The check, when some do not: "Pair 2 has no laptop yet.", "Pairs 2 and 3 have no laptop yet." */
export function noLaptopWords(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Pair ${numbers[0]} has no laptop yet.`;
  return `Pairs ${joinNames(numbers.map(String))} have no laptop yet.`;
}

/** A pair with one person in it, as it stands: "Pair 2 has only Amara in it." */
export function aloneWords(number: number, firstName: string): string {
  return `Pair ${number} has only ${firstName} in it.`;
}

/** A pair with more than three, as it stands: "Pair 1 has 4 people in it." */
export function tooManyWords(number: number, count: number): string {
  return `Pair ${number} has ${count} people in it.`;
}

/** Who has no pair: "Not paired yet: Rahul and Sofia". */
export function notPairedWords(firstNames: readonly string[]): string {
  return `${NOT_PAIRED_YET}: ${joinNames(firstNames)}`;
}

/** The group page, before anybody is paired. */
export const NOBODY_PAIRED_YET = "Nobody is paired yet.";

export const SAVE = "Save";

/** After Save. */
export function savedPairsWords(weekNumber: number): string {
  return `Saved. Each person sees who they’re paired with on their week ${weekNumber} page.`;
}

/** Under Save. */
export function pairsFootWords(weekNumber: number, laptops: boolean): string {
  return laptops
    ? `Each person sees who they’re paired with, and who’s bringing a laptop, on their week ${weekNumber} page. No email.`
    : `Each person sees who they’re paired with on their week ${weekNumber} page. No email.`;
}

/** The pairs page for a week that asks for none. */
export function noPairsThisWeekWords(weekNumber: number): string {
  return `Week ${weekNumber} has no session in pairs.`;
}

/** The group page's card: "Pairs in Group B". */
export function pairsCardTitleWords(groupName: string): string {
  return `Pairs in ${groupName}`;
}

/** The way to the pairs page: "Pair people up" before anybody is paired, then "Change pairs and laptops". */
export function changePairsWords(anyPaired: boolean, laptops: boolean): string {
  if (!anyPaired) return "Pair people up";
  return laptops ? "Change pairs and laptops" : "Change pairs";
}

/** What a save refuses, said where it was pressed. */
export function aloneRefusalWords(number: number, firstName: string): string {
  return `Pair ${number} would have only ${firstName} in it. Give ${firstName} a partner, or leave ${firstName} not paired yet.`;
}

export function tooManyRefusalWords(number: number, count: number): string {
  return `Pair ${number} would have ${count} people in it. A pair is two people, or three.`;
}

// ---------------------------------------------------------------------------
// The week page: Before you come
// ---------------------------------------------------------------------------

/** Over a person's own pair, under Before you come. */
export const YOUR_PAIR = "Your pair";

/** "You’re paired with Kofi.", "You’re paired with Kofi and Sam." */
export function pairedWithWords(firstNames: readonly string[]): string {
  return `You’re paired with ${joinNames(firstNames)}.`;
}

/**
 * Whether to bring a laptop: "You’re bringing a laptop.", "Kofi is bringing a
 * laptop.", "You and Kofi are bringing laptops.", or, with nobody in the
 * pair down to bring one, "Nobody in your pair is bringing a laptop yet. If
 * you can bring one, tell Rahul or Sofia."
 */
export function ownLaptopWords(bringing: boolean, partnersBringing: readonly string[], askNames: readonly string[]): string {
  if (bringing && partnersBringing.length > 0) return `You and ${joinNames(partnersBringing)} are bringing laptops.`;
  if (bringing) return "You’re bringing a laptop.";
  if (partnersBringing.length === 1) return `${partnersBringing[0]} is bringing a laptop.`;
  if (partnersBringing.length > 1) return `${joinNames(partnersBringing)} are bringing laptops.`;
  const tell = joinNames(askNames, "or");
  return tell
    ? `Nobody in your pair is bringing a laptop yet. If you can bring one, tell ${tell}.`
    : "Nobody in your pair is bringing a laptop yet.";
}
