import type { ClaudeReadLines, FreeGroupLine, WeekChartView } from "@/lib/courses/personPage/model";

/**
 * WHAT THE PERSON'S PANEL ON PEOPLE IN GROUPS IS SENT, field by field: the
 * answer of `GET /api/admissions/forms/[roundId]/programmes/[programmeId]/panel`,
 * built on the server by `./boardPanel.ts` for an admin or the programme's
 * lead, for everybody on the board at once.
 *
 * Every field below that is worked out from the week a person marked
 * (`chart`, the groups with how much of each session falls in their time) is
 * present only where the reader may read that person's application; for
 * anybody else the week is `may-not` and carries nothing. Claude's and
 * Pangram's reads (`claude`) are an admin's alone. No address, no access
 * requirement, no answer and no painted week as such leaves the server: the
 * chart is shares of a column and words.
 *
 * Type-only, so the board in the browser imports it.
 */

/** When they're free, as this reader may be shown it. */
export type PanelWeek =
  /** The reader may not read the application: nothing about the week, or whether there is one. */
  | { kind: "may-not" }
  /** There is no sent application to read the week from. */
  | { kind: "not-on-file" }
  /** They sent the form with nothing marked: the empty chart with the groups on it. */
  | { kind: "none-given"; chart: WeekChartView }
  | {
      kind: "given";
      chart: WeekChartView;
      /** The run's groups with a weekly time, the ones they can make first, each with how much of it is in their time. */
      groups: FreeGroupLine[];
      /** They marked under four hours in the week, and are read as free from each day's first mark on. */
      littleMarked: boolean;
    };

/** One person on the board, as the panel shows them to this reader. */
export type PanelPerson = {
  /** When they're free; null for the reader themselves, whom nobody is shown here. */
  week: PanelWeek | null;
  /** The name a sentence calls them by: "Only admins see when Sofia is free." Absent for somebody who is not a People row. */
  firstName?: string;
  /** Their page on the programme, where it would open for this reader (a People row). */
  personHref?: string;
  /** Their application on this programme's review screen, where the People tab hands this reader its link. */
  applicationHref?: string;
  /** Whether they offered to facilitate this programme, where the reader may read the application and the form asks. */
  offered?: boolean;
  /** Somebody who gave their place back or left: "Gave their place back on Fri 6 Nov", and the reason they gave, if any. */
  gaveBack?: { line: string; reason: string | null };
  /** Claude's and Pangram's earlier reads of the application: an ADMIN's alone, never about the reader. */
  claude?: ClaudeReadLines;
};

export type BoardPanelView = {
  viewer: "admin" | "lead";
  /** "Admins and AGI Strategy’s lead see this. Facilitators never do." */
  foot: string;
  /** By uid: every People row for this reader and everybody who facilitates one of the run's groups. */
  people: Record<string, PanelPerson>;
};
