import type { ProgrammeRole } from "../access";
import { own } from "../keys";
import type { ProgrammeKind } from "../model";
import type { TermStage } from "./status";

/**
 * WHAT CONNECTS THE TERM PAGE TO THE OTHER SCREENS.
 *
 * The term page is where everybody on a form starts. This builds the three
 * things on it that lead somewhere else:
 *
 *  - "Needs you": one row for each programme with applications waiting for
 *    this caller, and for an admin the pooled applicants who still need an
 *    outcome and the line about decision day;
 *  - each programme card's own numbers and its one button;
 *  - "Also this term": the pooled applicants, for an admin.
 *
 * ## No number here is counted here
 *
 * Every number is handed in, already worked out by the code behind the
 * screen its row links to: a programme's counts and how many applications
 * are waiting for this caller come from the list that screen draws, and the
 * pooled numbers from the term decision day is planned on. This module
 * chooses the words and the order and adds nothing up, so a row cannot say
 * 23 above a list of 22.
 *
 * ## Nobody is shown a number about a programme they have no role on
 *
 * `work` holds an entry only for a programme the caller has a role on, and a
 * programme with no entry gets no row and no numbers on its card. `pool` is
 * null for anybody who does not run the term. Both are decided by the caller
 * of this module, from `access.ts`.
 *
 * Pure, with no server import.
 */

export type ProgrammeCounts = {
  all: number;
  toReview: number;
  accepted: number;
  pooled: number;
  declined: number;
};

/** One programme, as the term page lists it. */
export type HomeProgramme = {
  id: string;
  kind: ProgrammeKind;
  shortName: string;
  /** The caller's own role here, or null when they have none. */
  role: ProgrammeRole | null;
  lead: { name: string; you: boolean } | null;
};

/**
 * A programme's places, as its own list's head states them: who holds one
 * now, how many are kept for an invitation nobody has answered, and how many
 * are left. `left` is null until the lead has said how many places there are.
 */
export type ProgrammePlaces = {
  placed: number;
  invited: number;
  left: number | null;
};

/** One programme's numbers, for a caller with a role on it. */
export type ProgrammeWork = {
  counts: ProgrammeCounts;
  places: ProgrammePlaces;
  /** How many applications that programme's list would walk for this caller. */
  waiting: number;
};

export type TermHomeInput = {
  stage: TermStage;
  /** `canRunTerm(user)`. */
  canRunTerm: boolean;
  /** The form's own page, which every link here hangs off. */
  home: string;
  /** The day everybody hears, as it is printed ("Fri 23 Oct"). Null when none is set. */
  decisionsDay: string | null;
  programmes: readonly HomeProgramme[];
  /** By programme id: the programmes the caller has a role on, and no others. */
  work: Readonly<Record<string, ProgrammeWork>>;
  /** For an admin. Null for everybody else. */
  pool: { pooled: number; needsOutcome: number } | null;
};

/** A run of words in a row. `strong` is the thing being counted; `muted` is whose it is. */
export type TextPart = { text: string; tone: "plain" | "strong" | "muted" };

export type NeedsYouRow = {
  key: string;
  parts: TextPart[];
  /** Where the row leads. `primary` marks the one drawn as the main thing to do. */
  link: { label: string; href: string; primary: boolean } | null;
  chip: string | null;
};

export type ProgrammeCardView = {
  counts: ProgrammeCounts;
  /** The places line under the counts. */
  places: ProgrammePlaces;
  /** The card's one button: review what is waiting, or see the list. */
  action: { label: string; href: string };
};

export type TermHomeView = {
  /** Null when the form is somewhere nothing can be waiting on anybody. */
  needsYou: { rows: NeedsYouRow[]; empty: string | null } | null;
  /** By programme id, for the programmes the caller has a role on. */
  cards: Record<string, ProgrammeCardView>;
  /** The pooled applicants card. Null for anybody who does not run the term. */
  pooled: { chip: string; line: string; link: { label: string; href: string } } | null;
};

const plain = (text: string): TextPart => ({ text, tone: "plain" });
const strong = (text: string): TextPart => ({ text, tone: "strong" });
const muted = (text: string): TextPart => ({ text, tone: "muted" });

/** A stage in which applications can be coming in or being decided. */
function inSession(stage: TermStage): boolean {
  return stage === "open" || stage === "deciding";
}

/** A stage in which anybody can have applied at all. */
function hasBegun(stage: TermStage): boolean {
  return inSession(stage) || stage === "decided" || stage === "settled";
}

/**
 * What a row calls a programme's applications: "AGI Strategy applications",
 * and for the one incubator a form has, "incubator applications".
 */
function subjectOf(programme: HomeProgramme, all: readonly HomeProgramme[], count: number): string {
  const onlyIncubator =
    programme.kind === "incubator" && all.filter((each) => each.kind === "incubator").length === 1;
  const name = onlyIncubator ? "incubator" : programme.shortName;
  return `${count} ${name} ${count === 1 ? "application" : "applications"}`;
}

/** True for a programme this caller leads or reviews, as against one an admin merely oversees. */
function isTheirs(programme: HomeProgramme): boolean {
  return programme.role === "lead" || programme.role === "reviewer" || programme.lead?.you === true;
}

function applicationsPath(home: string, programmeId: string): string {
  return `${home}/programmes/${programmeId}/applications`;
}

export function buildTermHome(input: TermHomeInput): TermHomeView {
  const { stage, canRunTerm, home, decisionsDay, programmes, work, pool } = input;

  // Their own programmes first, then (for an admin) everybody else's, each in the form's order.
  const ordered = [...programmes.filter(isTheirs), ...programmes.filter((each) => !isTheirs(each))];

  const rows: NeedsYouRow[] = [];
  const cards: Record<string, ProgrammeCardView> = {};
  let primaryGiven = false;
  for (const programme of ordered) {
    // No role, or no numbers handed in: no row and no card for this caller.
    const numbers = programme.role === null ? undefined : own(work, programme.id);
    if (!numbers) continue;
    const { counts, places, waiting } = numbers;
    const theirs = isTheirs(programme);
    const href = applicationsPath(home, programme.id);
    cards[programme.id] = {
      counts,
      places,
      action: theirs && waiting > 0 ? { label: `Review ${waiting}`, href } : { label: "See applications", href },
    };
    if (waiting === 0) continue;
    const whose = theirs
      ? "(you)"
      : programme.lead
        ? `· ${programme.lead.name}`
        : "· no lead yet";
    const primary = theirs && !primaryGiven;
    if (primary) primaryGiven = true;
    rows.push({
      key: `programme:${programme.id}`,
      parts: [strong(subjectOf(programme, programmes, waiting)), plain(" to review "), muted(whose)],
      link: { label: theirs ? `Review ${waiting}` : "Open", href, primary },
      chip: null,
    });
  }

  const before = decisionsDay ? `before ${decisionsDay}` : "before decision day";
  if (canRunTerm && pool && pool.needsOutcome > 0) {
    rows.push({
      key: "pool",
      parts:
        pool.needsOutcome === 1
          ? [strong("1 pooled applicant"), plain(` needs an outcome ${before}`)]
          : [strong(`${pool.needsOutcome} pooled applicants`), plain(` need an outcome ${before}`)],
      link: { label: "Open", href: `${home}/pool`, primary: false },
      chip: null,
    });
  }
  // The send is one action for the whole term, and it is still ahead.
  if (canRunTerm && inSession(stage)) {
    rows.push({
      key: "send",
      parts: decisionsDay
        ? [plain("You send every decision at once on "), strong(decisionsDay), plain(".")]
        : [plain("You send every decision at once.")],
      link: { label: "Open", href: `${home}/send`, primary: false },
      chip: "Nothing sent yet",
    });
  }

  const needsYou =
    rows.length > 0
      ? { rows, empty: null }
      : inSession(stage)
        ? { rows, empty: "Nothing needs you right now." }
        : null;

  const pooled =
    canRunTerm && pool && hasBegun(stage)
      ? {
          chip: inSession(stage) ? `${pool.pooled} so far` : `${pool.pooled} this term`,
          line: inSession(stage)
            ? `Nobody hears anything until ${decisionsDay ?? "decision day"}. Pick each person’s outcome before then.`
            : "Everybody has been told. What each person heard is on their row.",
          link: { label: "See pooled applicants", href: `${home}/pool` },
        }
      : null;

  return { needsYou, cards, pooled };
}
