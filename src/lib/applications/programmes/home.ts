import type { ProgrammeCard, ProgrammesList } from "./list";
import { PROGRAMMES_PATH } from "./path";

/**
 * What Home draws of the Programmes list (`./list.ts`): the Programmes card
 * at the top of an admin's and a lead's Home, and the figure, line and door
 * of an admin's "Applications to read". Pure: it reads nothing, and is made
 * on the server from the list the reader was given, so it can hold nothing
 * the list does not.
 */

/** One row of the card: a programme the reader opens the groups of. */
export type HomeProgrammeRow = {
  id: string;
  name: string;
  /** "Fellowship" or "Incubator", before the detail on a laptop; a phone leaves it off. */
  kind: string;
  /** "Week 2 of 6", "3 applications for you to read", "No lead yet", "Closed", or null. */
  detail: string | null;
  /** The first thing that needs the reader, in the Overview's words, or null. */
  needsYou: string | null;
  /** The programme's Overview. */
  href: string;
};

/** One term of the card: "Autumn 2026 · running", and its rows. */
export type HomeProgrammeTerm = { id: string; heading: string; rows: HomeProgrammeRow[] };

/** "Applications to read" on an admin's Home, from the reader's own Review counts. */
export type ApplicationsToRead = {
  /** How many applications wait for this reader's reading, over every term taking or deciding them. */
  count: number;
  /** "Spring 2027: 3 for AGI Strategy.", or null when none wait for them. */
  line: string | null;
  /**
   * Where Open goes: the term's page, where the Review buttons are, when one
   * term has applications waiting for the reader (or none does and one term
   * takes or decides them); the Programmes page, which lists every term with
   * its Review buttons, when two or more do.
   */
  href: string;
};

export type HomeProgrammes = {
  terms: HomeProgrammeTerm[];
  /** Null when no term the reader sees takes or decides applications. */
  toRead: ApplicationsToRead | null;
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "A", "A and B", "A, B and C". */
function andList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** What a row says under its name, after its kind. */
export function rowDetail(card: ProgrammeCard): string | null {
  if (card.line === "Closed") return "Closed";
  if (card.week) return card.week;
  if (card.waiting > 0) return `${plural(card.waiting, "application", "applications")} for you to read`;
  if (card.noLead) return "No lead yet";
  return null;
}

/** Home's share of the list: the rows of the programmes the reader opens, and what waits for their reading. */
export function homeProgrammesOf(list: ProgrammesList): HomeProgrammes {
  const terms: HomeProgrammeTerm[] = [];
  for (const term of list.terms) {
    const rows = term.programmes
      .filter((card) => card.opensGroups)
      .map((card) => ({
        id: card.id,
        name: card.shortName,
        kind: card.kindWord,
        detail: rowDetail(card),
        needsYou: card.needsYou,
        href: card.open.href,
      }));
    if (rows.length > 0) terms.push({ id: term.id, heading: `${term.label} · ${term.stage.toLowerCase()}`, rows });
  }

  const inSession = list.terms.filter((term) => term.stage === "Taking applications" || term.stage === "Deciding");
  let toRead: ApplicationsToRead | null = null;
  if (inSession.length > 0) {
    const sentences: string[] = [];
    const withWaiting: string[] = [];
    let count = 0;
    for (const term of inSession) {
      const waiting = term.programmes.filter((card) => card.waiting > 0);
      if (waiting.length === 0) continue;
      count += waiting.reduce((sum, card) => sum + card.waiting, 0);
      withWaiting.push(term.href);
      sentences.push(`${term.label}: ${andList(waiting.map((card) => `${card.waiting} for ${card.shortName}`))}.`);
    }
    const doors = withWaiting.length > 0 ? withWaiting : inSession.map((term) => term.href);
    toRead = {
      count,
      line: sentences.length > 0 ? sentences.join(" ") : null,
      href: doors.length === 1 ? doors[0] : PROGRAMMES_PATH,
    };
  }
  return { terms, toRead };
}
