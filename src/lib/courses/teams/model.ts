/**
 * TEAMS: an incubator's people in teams, inside its one weekly group.
 *
 * An incubator meets as one group, every week, and its people work on a
 * project in small teams. The weekly session stays as it is; a team is a list
 * inside the group: a name, a project, and its people. The programme's lead
 * makes the teams on the programme page's Teams tab, in one of two ways, which
 * the run says (`CourseRunDoc.teamsFrom`):
 *
 *  - FROM THE PITCHES of pitching week (`src/lib/courses/pitching/`): a pitch
 *    the lead takes forward becomes a team of the people who pitched it and
 *    the people who said they would join it;
 *  - FROM THE AGENDA the application form asked people to rank: teams are made
 *    from first choices, within the run's smallest and largest team.
 *
 * The lead then moves people between teams by hand, and tells everyone their
 * team by email. docs/courses-ops.md ("Teams") is the runbook.
 *
 * ## The one collection: `courseTeams/{teamId}`
 *
 * One document per team, written only by the routes under
 * `/api/admissions/forms/[roundId]/programmes/[programmeId]/teams` and read
 * only on the server (`firestore.rules` refuses every browser). It carries:
 *
 *  - where it belongs: `runId`, `courseId`, `groupId` (the group whose weekly
 *    session the team works inside: a team's people are all in that group);
 *  - what it is: `name`, and `project`, its project line as people are told it
 *    ("Replicate [the paper], then: [the twist]"), or "" when it has none;
 *  - where it came from: `source`, a pitch, an agenda item, or by hand;
 *  - its people: `memberUids`. A person is in one team on a run at most;
 *  - what each of them was last told: `toldAs`, one entry per member who has
 *    been emailed their team, holding a fingerprint of what that email said.
 *    A member whose email would now say something else is owed another. Every
 *    entry is a member's: taking somebody off a team takes their entry too.
 *
 * Pure: no reads, no writes, nothing server-only, so the page's client code
 * may import the types and the parsers from here.
 */

import { isAddressableId } from "@/lib/addressableId";

export const TEAMS_COLLECTION = "courseTeams";

/** Lengths a team's fields may run to. Field limits, not settings. */
export const TEAM_LIMITS = {
  /** A pitch's title or an agenda item: both are at most 80 characters where they are written. */
  name: 80,
  /** "Replicate " + a paper (200) + ", then: " + a twist (280), with room to spare. */
  project: 520,
  /** Well above any group's size: a cap on a stored list, not a team size. */
  maxMembers: 60,
} as const;

/** Where a team came from. */
export type TeamSource =
  | { kind: "pitch"; pitchId: string }
  | { kind: "agenda"; item: string }
  | { kind: "hand" };

/** What one member was last emailed about their team. */
export type TeamTold = { uid: string; fingerprint: string };

export type TeamDoc = {
  id: string;
  runId: string;
  courseId: string;
  groupId: string;
  name: string;
  project: string;
  source: TeamSource;
  memberUids: string[];
  toldAs: TeamTold[];
  createdAt: Date | null;
  updatedAt: Date | null;
};

/** How a run's teams are made. See `CourseRunDoc.teamsFrom`. */
export type TeamsFrom = "pitches" | "agenda";

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp?.toDate === "function" ? stamp.toDate() : null;
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function uidList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry && !out.includes(entry)) out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}

function sourceOf(value: unknown): TeamSource {
  const raw = value && typeof value === "object" ? (value as Raw) : {};
  if (raw.kind === "pitch" && typeof raw.pitchId === "string" && raw.pitchId) {
    return { kind: "pitch", pitchId: raw.pitchId };
  }
  if (raw.kind === "agenda" && typeof raw.item === "string" && raw.item.trim()) {
    return { kind: "agenda", item: raw.item.slice(0, TEAM_LIMITS.name) };
  }
  return { kind: "hand" };
}

function toldOf(value: unknown, members: readonly string[]): TeamTold[] {
  if (!Array.isArray(value)) return [];
  const out: TeamTold[] = [];
  for (const entry of value) {
    const raw = entry && typeof entry === "object" ? (entry as Raw) : {};
    const uid = typeof raw.uid === "string" ? raw.uid : "";
    const fingerprint = typeof raw.fingerprint === "string" ? raw.fingerprint.slice(0, 128) : "";
    // Only a member's entry counts, and only the first for each member.
    if (!uid || !fingerprint || !members.includes(uid) || out.some((told) => told.uid === uid)) continue;
    out.push({ uid, fingerprint });
  }
  return out;
}

/** A stored team, read. */
export function normalizeTeam(id: string, data: Raw): TeamDoc {
  const memberUids = uidList(data.memberUids, TEAM_LIMITS.maxMembers);
  return {
    id,
    runId: typeof data.runId === "string" ? data.runId : "",
    courseId: typeof data.courseId === "string" ? data.courseId : "",
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    name: str(data.name, TEAM_LIMITS.name).trim(),
    project: str(data.project, TEAM_LIMITS.project).trim(),
    source: sourceOf(data.source),
    memberUids,
    toldAs: toldOf(data.toldAs, memberUids),
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

/** The run's `teamsFrom`, read: one of the two ways, or null for anything else. */
export function normalizeTeamsFrom(value: unknown): TeamsFrom | null {
  return value === "pitches" || value === "agenda" ? value : null;
}

/** The order teams are drawn and decided in: the order they were made, then by id. */
export function byMaking(a: TeamDoc, b: TeamDoc): number {
  return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** What the lead asks of the teams route. */
export type TeamsAction =
  /** Make this pitch a team. */
  | { action: "from-pitch"; pitchId: string }
  /** Make the run's teams from first choices on the agenda. */
  | { action: "from-agenda" }
  /** Move somebody to a team, or to no team (`teamId: null`). */
  | { action: "move"; uid: string; teamId: string | null }
  /** Take a team away; its people go to no team. */
  | { action: "remove"; teamId: string };

/** A value that can name one document: one path segment, bounded. */
function isId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && isAddressableId(value);
}

const SAY_WHAT = "Say what to do with the teams.";

/** A request to the teams route, checked before anything is read. Every refusal is a sentence. */
export function parseTeamsAction(body: unknown): Parsed<TeamsAction> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: SAY_WHAT };
  const raw = body as Raw;
  switch (raw.action) {
    case "from-pitch":
      return isId(raw.pitchId)
        ? { ok: true, value: { action: "from-pitch", pitchId: raw.pitchId } }
        : { ok: false, error: "Say which pitch to make a team." };
    case "from-agenda":
      return { ok: true, value: { action: "from-agenda" } };
    case "move": {
      if (!isId(raw.uid)) return { ok: false, error: "Say who to move." };
      if (raw.teamId === null) return { ok: true, value: { action: "move", uid: raw.uid, teamId: null } };
      return isId(raw.teamId)
        ? { ok: true, value: { action: "move", uid: raw.uid, teamId: raw.teamId } }
        : { ok: false, error: "Say which team to move them to, or no team." };
    }
    case "remove":
      return isId(raw.teamId)
        ? { ok: true, value: { action: "remove", teamId: raw.teamId } }
        : { ok: false, error: "Say which team to remove." };
    default:
      return { ok: false, error: SAY_WHAT };
  }
}

/** "Tell everyone their team": how many emails the button said it would send. */
export type TellRequest = { emails: number };

export function parseTellRequest(body: unknown): Parsed<TellRequest> {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Raw) : null;
  const emails = raw?.emails;
  if (typeof emails !== "number" || !Number.isInteger(emails) || emails < 1 || emails > 1000) {
    return { ok: false, error: "Say how many emails the button showed, then press it again." };
  }
  return { ok: true, value: { emails } };
}

// ---------------------------------------------------------------------------
// What travels to the lead's page
// ---------------------------------------------------------------------------

/** One person, as the Teams tab shows them. Names only, never an address. */
export type TeamPersonView = {
  uid: string;
  name: string;
  /** The group whose session they come to: a person moves only between that group's teams. */
  groupId: string;
  /**
   * What they ranked on the form, from their first choice down to the item
   * their team is on ("1st: Compute governance"), or their first three when
   * their team is on none of them. Null when the run's teams are made from
   * pitches. Read for the programme's lead and admins only.
   */
  ranks: Array<{ place: string; item: string; above: boolean }> | null;
  /** True when the run's teams come from the agenda and this person ranked none of it. */
  rankedNothing: boolean;
};

/** One team on the Teams tab. */
export type TeamCardView = {
  id: string;
  name: string;
  project: string;
  groupId: string;
  /** The group's name, when the run has people in more than one group. */
  groupName: string | null;
  people: TeamPersonView[];
  /** A sentence when the team is smaller or larger than the run's sizes, or null. */
  sizeNote: string | null;
};

/** One pitch, as the Teams tab lists it beside the teams. */
export type PitchTeamRowView = {
  id: string;
  title: string;
  twist: string;
  pitchedBy: string;
  /** People still in its group, told, and standing, who would join it. */
  wouldJoin: number;
  /** "6 would join", pitching week's own words for that number. */
  wouldJoinLine: string;
  groupName: string | null;
  /** A team was made from it; it was not, and other pitches were; or no team exists yet. */
  state: "became-a-team" | "not-taken-forward" | "no-team-yet";
};

/** One agenda item in "What people ranked". */
export type AgendaRowView = {
  item: string;
  /** How many of the people taking part ranked it 1st, 2nd and 3rd. */
  ranked: [number, number, number];
  /** The teams made on it, with their people for the initials. */
  teams: Array<{ id: string; people: Array<{ uid: string; name: string }> }>;
};

/** Where "Tell everyone their team" stands. */
export type TellView = {
  /** People in a team whose email a press would send: never told, or told something that has changed. */
  owed: number;
  /** Of those, the ones with an address on file: the number on the button. */
  emails: number;
  /** Names of those owed with no address on file. They are not emailed. */
  noAddress: string[];
  /** This caller has sent themselves a test of this email on this run. */
  tested: boolean;
};

/** Everything the Teams tab shows. Every sentence that depends on a record is built on the server. */
export type TeamsView = {
  roundId: string;
  programmeId: string;
  /** "Alignment Research". */
  programmeName: string;
  viewer: "admin" | "lead";
  /** The run the programme names, while it is on the site. */
  run: { id: string; courseId: string } | null;
  /** Why there is nothing to show: no run named yet, or the one named is gone. Null when there is a run. */
  blank: "no-run" | "run-gone" | null;
  /** How this run's teams are made, or null while nobody has said. */
  madeFrom: TeamsFrom | null;
  /** The run editor is this caller's to open (an admin). */
  canOpenRunEditor: boolean;
  /** The run's smallest and largest team, or null while they are not set. */
  sizes: { min: number; max: number } | null;
  /** "You can change them until Wed 18 Nov.", up to and on the day the teams are made; null otherwise. */
  changeUntil: string | null;
  /** People taking part: told, in one of the run's groups, with an account that stands. */
  takingPart: number;
  /** Of them, in a team. */
  inATeam: number;
  /** The pitches, for a run whose teams come from them; null otherwise. */
  pitches: {
    /** The pitching week, or null when no week is ticked as one. */
    weekNumber: number | null;
    published: boolean;
    rows: PitchTeamRowView[];
  } | null;
  /** The agenda, for a run whose teams come from it; null otherwise. */
  agenda: {
    /** The form asks this programme's applicants to rank something. */
    found: boolean;
    rows: AgendaRowView[];
  } | null;
  teams: TeamCardView[];
  /** People taking part who are in no team. */
  noTeam: TeamPersonView[];
  tell: TellView;
};
