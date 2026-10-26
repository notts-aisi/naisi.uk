import { partsOf, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekSources, type ReadableWeek } from "@/lib/courses/weekBlocks/reader";

/**
 * A GROUP'S WEEK, AS ITS FACILITATORS, ITS PROGRAMME'S LEAD AND ADMINS READ
 * IT (boards wk-fac-group, wk-fac-group-phone, wk-reflections and
 * wk-reflections-phone, with Q30, Q31, Q37 and Q38): who has written each
 * part's reflection, who ticked each source, the private notes left on a
 * source, and the reflections to read out in the session.
 *
 * WHO SEES WHOSE WORK is decided here, once, for every page that draws a
 * group's week (`src/lib/courses/facilitatorWeek/readers.ts` reads, the pages
 * draw):
 *
 *  - The group's FELLOWS (the people taking part in it, never one of its
 *    facilitators) are shown to everybody who may open a group's week: its
 *    live facilitators, the programme's lead and admins.
 *  - A FACILITATOR'S OWN coursework (Zach, Mon 26 Oct: a facilitator does the
 *    group's coursework as themselves) is the programme's lead's and admins'
 *    to read, and never a facilitator's, their own co-facilitators' included.
 *    So it is left out of every view a facilitator is given and shown to the
 *    lead and admins marked as theirs (`own`).
 *  - PRIVATE NOTES on a source (Q38) are read by the group's facilitators and
 *    admins, never by the lead. A facilitator's own private note is an
 *    admin's alone.
 *  - Nothing here is ever read out but a reflection, and a reflection only
 *    without the name of whoever wrote it (Q37): `readOutCards` takes the
 *    words and nothing else, and puts them in the order of the words.
 *
 * Pure: no reads, no clock. The pages, the readers and the privacy policy's
 * test import it.
 */

/** Who is looking at a group's week. A lead who facilitates the group is a facilitator on its page and a lead on theirs. */
export type WeekViewer = "facilitator" | "lead" | "admin";

/** Whether this viewer is shown a facilitator's own coursework: the lead and admins are, a facilitator never. */
export function seesFacilitatorsOwnWork(viewer: WeekViewer): boolean {
  return viewer === "lead" || viewer === "admin";
}

/** Whether this viewer reads private notes: the group's facilitators and admins, never the lead (Q38). */
export function readsPrivateNotes(viewer: WeekViewer): boolean {
  return viewer === "facilitator" || viewer === "admin";
}

/** Whether this viewer reads a facilitator's own private note: admins alone. */
export function readsFacilitatorsPrivateNotes(viewer: WeekViewer): boolean {
  return viewer === "admin";
}

/** Somebody whose week a viewer is shown: their whole name, and whether it is a facilitator's own work. */
export type WeekPerson = {
  uid: string;
  /** Their whole name, as the group page names people. */
  name: string;
  /** The name they go by, for a sentence ("Kofi hasn’t"). */
  firstName: string;
  /** A facilitator of the group, doing its coursework as themselves. */
  own: boolean;
};

/**
 * The people a viewer is shown, in the group page's order: the group's
 * fellows by their whole names, then, to the lead and admins only, each of
 * its standing facilitators, marked as their own. Somebody who facilitates
 * the group is never one of its fellows here, whether or not they also hold a
 * place in it.
 */
export function peopleShown(
  viewer: WeekViewer,
  people: ReadonlyArray<{ uid: string; name: string; firstName?: string }>,
  facilitators: ReadonlyArray<{ uid: string; name: string; firstName: string }>,
): WeekPerson[] {
  const facilitating = new Set(facilitators.map((person) => person.uid));
  const fellows: WeekPerson[] = people
    .filter((person) => !facilitating.has(person.uid))
    .map((person) => ({ uid: person.uid, name: person.name, firstName: person.firstName || firstWordOf(person.name), own: false }));
  if (!seesFacilitatorsOwnWork(viewer)) return fellows;
  const seen = new Set(fellows.map((person) => person.uid));
  const own: WeekPerson[] = [];
  for (const person of facilitators) {
    if (seen.has(person.uid)) continue;
    seen.add(person.uid);
    own.push({ uid: person.uid, name: person.name, firstName: person.firstName || firstWordOf(person.name), own: true });
  }
  return [...fellows, ...own];
}

/** Whose private notes this viewer reads, of the people shown: never a facilitator's own, but to an admin. */
export function privateNotesOf(viewer: WeekViewer, person: WeekPerson): boolean {
  if (!readsPrivateNotes(viewer)) return false;
  return person.own ? readsFacilitatorsPrivateNotes(viewer) : true;
}

function firstWordOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// ---------------------------------------------------------------------------
// The week's parts and sources
// ---------------------------------------------------------------------------

/** One part of a week that asks for a reflection: its number among the week's parts, its title and its prompts. */
export type ReflectionPart = {
  partId: string;
  /** Part N is the Nth part of the week, as the week page numbers it. */
  number: number;
  title: string;
  prompts: Array<{ id: string; text: string }>;
};

/** The parts of a week written as blocks that hold a reflection stop, in order, each with every prompt of its stops. */
export function reflectionPartsOf(blocks: readonly WeekBlock[]): ReflectionPart[] {
  const out: ReflectionPart[] = [];
  partsOf(blocks).forEach((part, index) => {
    const prompts = part.blocks.flatMap((block) =>
      block.type === "reflection" ? block.prompts.map((prompt) => ({ id: prompt.id, text: prompt.text })) : [],
    );
    if (prompts.length > 0) out.push({ partId: part.id, number: index + 1, title: part.title, prompts });
  });
  return out;
}

/** A part's reflection is written once every one of its boxes has something in it, as `progress.ts` counts a part. */
export function partWritten(part: ReflectionPart, isWritten: (promptId: string) => boolean): boolean {
  return part.prompts.length > 0 && part.prompts.every((prompt) => isWritten(prompt.id));
}

/** A source a tick is counted on. */
export type TickedSource = {
  id: string;
  title: string;
  /** "Read", "Watch", ... */
  kindLabel: string;
  /** The part it sits in, numbered as the week page numbers parts, or null. */
  partNumber: number | null;
};

/**
 * The sources of a week whose ticks are counted here: the path's own
 * sources, in page order. A pack is left out: it is ticked only by the people
 * who have it, which is the packs' own record to say, so "N of M" over the
 * whole group would be wrong for it.
 */
export function tickedSourcesOf(week: ReadableWeek & { blocks?: WeekBlock[] }): TickedSource[] {
  const numberOf = new Map(partsOf(week.blocks ?? []).map((part, index) => [part.id, index + 1]));
  return weekSources(week)
    .filter((source) => source.packId === null)
    .map((source) => ({
      id: source.id,
      title: source.title,
      kindLabel: source.kindLabel,
      partNumber: source.partId ? (numberOf.get(source.partId) ?? null) : null,
    }));
}

// ---------------------------------------------------------------------------
// Reading lines out (Q37)
// ---------------------------------------------------------------------------

/** One reflection as the page to read lines out shows it: its words and a key that names nobody. */
export type ReadOutCard = { key: string; text: string };

/**
 * The reflections to one prompt as they may be read out: the words alone,
 * with no name, no time and no id, in the order of the words themselves, so
 * neither who wrote one nor when can be read off its place on the page. The
 * key is the card's place and the prompt's, nothing of the writer's.
 */
export function readOutCards(promptKey: string, texts: readonly string[]): ReadOutCard[] {
  return texts
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .sort((a, b) => a.localeCompare(b, "en-GB", { sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0))
    .map((text, index) => ({ key: `${promptKey}-${index + 1}`, text }));
}
