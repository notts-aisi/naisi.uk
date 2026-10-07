import type { PublicTermStage } from "@/lib/applications/lifecycle/publicTerm";
import { formatRunStartShort } from "@/lib/courses/window";
import { formatSiteDate } from "@/lib/datetime/siteTime";

/**
 * THE WORDS AND DATES THE TERM'S COMPONENTS PRINT.
 *
 * `TermStatusLine` and `TermDates` draw what these functions say, so the
 * wording of each stage is in one place and a test can run it. Nothing here
 * reads anything: every function is handed the fields it prints.
 *
 * Two rules a maintainer has to keep:
 *
 *  - A date is London's, whoever reads it and wherever the server runs. An
 *    instant goes through `formatSiteDate`, which names the site's zone. The
 *    day everybody hears is stored as a civil date, and goes through the one
 *    conversion the site has for those (`formatRunStartShort`), so this page
 *    and the form's own print the same day.
 *  - The words are written in sentence case. Where the design sets them in
 *    capitals, the stylesheet does that.
 */

/** "Sun 18 Oct": a day of the term. */
export function termDay(at: Date): string {
  return formatSiteDate(at, { weekday: "short", day: "numeric", month: "short" });
}

/** "23:59": the time of day, on a 24-hour clock. */
export function termTime(at: Date): string {
  return formatSiteDate(at, { hour: "2-digit", minute: "2-digit" });
}

/** "Sun 18 Oct, 23:59": a deadline, where the time of day matters. */
export function termDeadline(at: Date): string {
  return formatSiteDate(at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "Fri 23 Oct" from a civil date ("2026-10-23"). Null for anything that is not one. */
export function termCivilDay(dateKey: string): string | null {
  return formatRunStartShort(dateKey) ?? null;
}

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

export type TermSeason = (typeof SEASONS)[number];

/**
 * The season a term's label opens with: "Spring 2027" gives "spring". Null
 * when it opens with anything else, so a caller says "the next round" and
 * never guesses a season out of a label that names none.
 */
export function seasonOf(label: string): TermSeason | null {
  const first = label.trim().split(/\s+/)[0].toLowerCase();
  return SEASONS.find((season) => season === first) ?? null;
}

/**
 * The one start every programme shares, as its lead wrote it ("w/c 26 Oct"),
 * for the strip's "Programmes start". Null when a programme does not say, or
 * when two say different things: the strip then leaves that date out, and
 * each programme goes on saying its own.
 */
export function sharedStart(programmes: readonly { starts: string }[]): string | null {
  let shared: string | null = null;
  for (const programme of programmes) {
    const starts = programme.starts.trim();
    if (!starts) return null;
    if (shared !== null && starts.toLowerCase() !== shared.toLowerCase()) return null;
    shared ??= starts;
  }
  return shared;
}

// ---------------------------------------------------------------------------
// The status line
// ---------------------------------------------------------------------------

export type StatusLineFacts = {
  stage: PublicTermStage;
  opensAt: Date | null;
  closesAt: Date | null;
  /** The day everybody hears, as stored: "2026-10-23". */
  decisionsByDate: string | null;
  /** The form that opens after this one, when there is one to name. */
  nextLabel: string | null;
  nextOpensAt: Date | null;
};

/**
 * The parts of the one line under a hero's buttons, in order. The component
 * joins them with a dot. Empty for `none`: with no term there is no line.
 *
 * | Stage | The line |
 * | --- | --- |
 * | `before` | Applications open Mon 5 Oct · Close Sun 18 Oct |
 * | `open` | Applications open now · Close Sun 18 Oct, 23:59 |
 * | `closed` | Applications closed · Decisions by Fri 23 Oct |
 * | `running` | Running now, and with a form that opens later: · Spring intake Mon 11 Jan |
 *
 * A part whose date is missing is left out, never printed without it.
 */
export function statusLineParts(facts: StatusLineFacts): string[] {
  switch (facts.stage) {
    case "none":
      return [];
    case "before": {
      const parts = [facts.opensAt ? `Applications open ${termDay(facts.opensAt)}` : "Applications open soon"];
      if (facts.closesAt) parts.push(`Close ${termDay(facts.closesAt)}`);
      return parts;
    }
    case "open": {
      const parts = ["Applications open now"];
      if (facts.closesAt) parts.push(`Close ${termDeadline(facts.closesAt)}`);
      return parts;
    }
    case "closed": {
      const parts = ["Applications closed"];
      const day = facts.decisionsByDate ? termCivilDay(facts.decisionsByDate) : null;
      if (day) parts.push(`Decisions by ${day}`);
      return parts;
    }
    case "running": {
      const parts = ["Running now"];
      if (facts.nextOpensAt) {
        const season = facts.nextLabel ? seasonOf(facts.nextLabel) : null;
        const intake = season ? `${season.charAt(0).toUpperCase()}${season.slice(1)} intake` : "Next intake";
        parts.push(`${intake} ${termDay(facts.nextOpensAt)}`);
      }
      return parts;
    }
  }
}

// ---------------------------------------------------------------------------
// The strip of dates
// ---------------------------------------------------------------------------

export type TermDatesFacts = {
  stage: PublicTermStage;
  /** Whether the strip begins with when applications open, or that they are open now. */
  showOpening: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  /** The day everybody hears, as stored: "2026-10-23". */
  decisionsByDate: string | null;
  /** When the programmes start, as stored: "w/c 26 Oct". */
  starts: string | null;
};

/** One date in the strip: a small label, the date set large, and a line under it. */
export type TermDateCell = {
  key: "opening" | "close" | "decisions" | "start";
  label: string;
  value: string;
  note: string | null;
  /** What a `time` element is given. Null for a value that is not a date. */
  dateTime: string | null;
};

/**
 * The strip's cells, in order: when applications open (only where a page
 * asks for it), when they close, the day everybody hears, and when the
 * programmes start. A date that is missing has no cell, and `none` has none.
 *
 * The close is "Applications close" while it is still ahead and
 * "Applications closed" once the stage says it has been.
 */
export function termDateCells(facts: TermDatesFacts): TermDateCell[] {
  const { stage, opensAt, closesAt } = facts;
  if (stage === "none") return [];
  const cells: TermDateCell[] = [];

  if (facts.showOpening && stage === "before" && opensAt) {
    cells.push({
      key: "opening",
      label: "Applications open",
      value: termDay(opensAt),
      note: termTime(opensAt),
      dateTime: opensAt.toISOString(),
    });
  }
  if (facts.showOpening && stage === "open") {
    cells.push({
      key: "opening",
      label: "Applications",
      value: "Open now",
      note: opensAt ? `since ${termDay(opensAt)}` : null,
      dateTime: null,
    });
  }

  if (closesAt) {
    cells.push({
      key: "close",
      label: stage === "before" || stage === "open" ? "Applications close" : "Applications closed",
      value: termDay(closesAt),
      note: termTime(closesAt),
      dateTime: closesAt.toISOString(),
    });
  }

  const decisions = facts.decisionsByDate ? termCivilDay(facts.decisionsByDate) : null;
  if (decisions) {
    cells.push({
      key: "decisions",
      label: "Decisions by",
      value: decisions,
      note: "by email",
      dateTime: facts.decisionsByDate,
    });
  }

  const starts = facts.starts?.trim();
  if (starts) {
    cells.push({
      key: "start",
      label: "Programmes start",
      value: starts,
      note: "in person, on campus",
      dateTime: null,
    });
  }
  return cells;
}
