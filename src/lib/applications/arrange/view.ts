import type { SessionSlot } from "@/lib/admissions/availability";
import type { Lean } from "../assessment/types";

/**
 * WHAT CIRCLES IS SENT: the run's groups as they are (`CirclesView`), and up
 * to five arrangements of one programme's people into groups over them
 * (`ArrangementOptionsView`), each with its facilitators and Claude's
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
  /** Publish has told them their group: a suggestion leaves them in it. */
  told: boolean;
  /** Their answer to "Can you make this time?" about the group they sit in, or null. Never sent to Claude. */
  timeAnswer: { kind: "yes" | "cant"; reason: string | null; alternatives: string | null } | null;
  /** The run's group they sit in now, or null. */
  groupId: string | null;
  /** The run's groups they facilitate, by id: they sit in that group and no other. */
  appointed: string[];
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
  /** Asked to seat afresh everybody placed and not told. */
  startAgain: boolean;
  people: Record<string, RingPerson>;
  options: RingOption[];
  /** Whether Claude was asked, and answered. */
  asked: boolean;
  preferredWhy: string;
  notes: string;
  dropped: { suggestion: string; why: string }[];
  claudeConfigured: boolean;
};

/** One of the run's groups as it is now, as Circles draws it. */
export type CircleGroup = {
  id: string;
  name: string;
  /** Null for a group with no time yet. */
  session: SessionSlot | null;
  /** Null for no limit. */
  room: number | null;
  /** Who sits in it now, by account. */
  memberUids: string[];
  /** Its facilitators, by first name, each saying whether they sit in it as one of its people. */
  facilitators: { uid: string; name: string; member: boolean }[];
  /** Publish has told somebody its time, so it is not changed here. */
  told: boolean;
  /** Its stored day and start ("" for none), which a change of time is sent with. */
  slot: { weekday: number; start: string };
  /** Everybody being arranged who can make its time. */
  canMake: string[];
  /** The campus it meets on, or null while none is chosen. */
  campus: "university-park" | "jubilee" | "online" | null;
};

/**
 * THE RUN'S GROUPS AS THEY ARE, for Circles: who sits in each, who
 * facilitates it, who sits in none, and who holds a place but cannot be
 * placed yet. Nothing in it was asked of Claude.
 */
export type CirclesView = {
  roundId: string;
  programmeId: string;
  /** Null while the programme names no run (or the one it names is gone). */
  runId: string | null;
  /** Decisions have gone out. Until then nobody is on the run, and suggestions are a preview. */
  sent: boolean;
  /** Publish has been pressed on the run, so a placement can be "Not told yet". */
  published: boolean;
  programmeName: string;
  programmeShortName: string;
  /** The hours the form's grid asked about, in minutes past midnight. */
  grid: { startMinute: number; endMinute: number };
  /** The session length suggestions count, and the lengths a group may last. */
  minutes: number;
  lengths: number[];
  /** The group size a new group is given. */
  size: number;
  /** Everybody on the run's list who holds a place (or sits in a group), by account. */
  people: Record<string, RingPerson>;
  /** The run's live groups, in the order every tab lists them. */
  groups: CircleGroup[];
  /** Holding a place and not on the run's list yet, so nobody can place them. */
  notOnList: { uid: string; name: string }[];
  claudeConfigured: boolean;
};
