import type { SessionSlot } from "@/lib/admissions/availability";
import type { Lean } from "../assessment/types";

/**
 * WHAT THE ARRANGE SCREEN IS SENT: up to five arrangements of one
 * programme's people into groups, each with its facilitators and Claude's
 * reasons, and everything the screen needs to let an admin move people
 * between groups and see at once what a move breaks.
 *
 * Types only, with no server import, so the screen can read them.
 */

export type RingPerson = {
  uid: string;
  name: string;
  /** Their application, opened under this programme. */
  href: string;
  /** They said they would like to facilitate this programme. */
  offered: boolean;
  /** Publish has told them their group: Apply leaves them in it. */
  told: boolean;
  /** They marked under four hours in the week, read "from then on". */
  littleMarked: boolean;
  /** Claude's view of them as a facilitator, when it was asked. */
  potential: { level: "high" | "medium" | "low"; why: string } | null;
  /**
   * How many long answers Pangram thought worth a look, or null until a clean
   * check. Shown for a person to weigh; nothing here scores by it.
   */
  flags: number | null;
  /**
   * When they said they are free, for the admin's chart: each stretch they
   * marked, Sunday first. `fromFirstMark` is true for somebody who marked
   * under four hours, whose week is read as free from their first mark each
   * day. Never sent to Claude.
   */
  week: { said: boolean; marked: { weekday: number; start: number; end: number }[]; fromFirstMark: boolean };
  /** Claude's earlier read of their application, reviewers made "a reviewer". Null until read. */
  read: { lean: Lean | null; summary: string; strengths: string[]; concerns: string[]; thin: number } | null;
};

export type RingFacilitator = {
  uid: string;
  role: "lead" | "second";
  offered: boolean;
  why: string;
  bySite: boolean;
};

export type RingGroup = {
  /** Unique within its option: "B2". */
  key: string;
  /** The run's group, or null for one Apply would add. */
  id: string | null;
  name: string;
  session: SessionSlot;
  /** Apply gives the group this time (it had none, or is new). */
  timeIsNew: boolean;
  room: number;
  memberUids: string[];
  facilitators: RingFacilitator[];
  /** Claude's sentence on why these people suit each other. */
  why: string;
  /** Everybody on the programme who can make this group's time, so a move can be checked on the screen. */
  canMake: string[];
  /** For a group the run has: its facilitators now, by first name, and its stored slot (for a change of time). */
  existing: { facilitatorUids: string[]; facilitatorNames: string[]; slot: { weekday: number; start: string } } | null;
};

export type RingOption = {
  /** "A", "B": in Claude's order, best first. */
  key: string;
  title: string;
  pros: string[];
  cons: string[];
  preferred: boolean;
  size: number;
  groups: RingGroup[];
  unplaced: { uid: string; reason: "no-week" | "fits-none" | "no-room" }[];
  /** Placed near their time, not in it: somebody checks with them. */
  nearUids: string[];
  /** Moved by Claude from where the site's arithmetic put them. */
  movedUids: string[];
};

export type ArrangementOptionsView = {
  /** Null for a preview of a programme with no run yet. */
  runId: string | null;
  /** Before decision day: to look at only, and Apply waits. */
  preview: boolean;
  programmeName: string;
  programmeShortName: string;
  /** The hours the form's grid asked about, in minutes past midnight. */
  grid: { startMinute: number; endMinute: number };
  minutes: number;
  size: number;
  people: Record<string, RingPerson>;
  options: RingOption[];
  /** Whether Claude was asked, and answered. */
  asked: boolean;
  preferredWhy: string;
  notes: string;
  dropped: { suggestion: string; why: string }[];
  claudeConfigured: boolean;
};
