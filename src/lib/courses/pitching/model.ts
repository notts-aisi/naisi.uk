/**
 * PITCHING WEEK: what a pitch is, how a request about one is read, and what
 * travels to the two pages that show pitches.
 *
 * In an incubator's pitching week each person in a group pitches a paper and
 * a twist, alone or with one partner from their group, and says which of
 * their group's other pitches they would join. The lead makes teams from
 * that. Which week it is, how many pitches a person may pick and the rest of
 * the run's settings are described at `RunPitchSettings` in
 * `src/lib/firestore/courses.ts`, and docs/courses-ops.md ("Pitching week")
 * is the runbook.
 *
 * ## The one collection: `coursePitches/{pitchId}`
 *
 * One document per pitch, written only by the two routes under
 * `/api/courses/runs/[runId]/pitching/` and read only on the server
 * (`firestore.rules` refuses every browser). It carries:
 *
 *  - where it belongs: `runId`, `courseId`, `groupId`, `weekId`, `weekNumber`;
 *  - what was pitched: `title`, `paper` (a reading of that week, or typed),
 *    `twist`, all plain text;
 *  - who pitched it: `pitcherUids`, one or two people, the first being the
 *    one who sent it. Each person is on one pitch at most;
 *  - who would join it: `wouldJoinUids`. These are the picks. They are on
 *    the pitch so that destroying a run, or deleting an account, has one
 *    collection to clear, and they are never sent to anybody whole: a person
 *    is told only which pitches they picked themselves, and the lead and
 *    admins are told how many would join each.
 *
 * Pure: no reads, no writes, nothing server-only, so the pages' client code
 * may import the types from here.
 */

import { isAddressableId } from "@/lib/addressableId";

export const PITCHES_COLLECTION = "coursePitches";

/** Lengths a pitch may run to. Field limits, not settings. */
export const PITCH_LIMITS = {
  title: 80,
  /** A paper typed in because it is not one of the week's readings. */
  paper: 200,
  twist: 280,
} as const;

/** The paper a pitch replicates: one of the week's readings, or one typed in. */
export type PitchPaper =
  | { kind: "reading"; materialId: string; title: string }
  | { kind: "typed"; title: string };

export type PitchDoc = {
  id: string;
  runId: string;
  courseId: string;
  groupId: string;
  /** The pitching week's document id ("w03"). */
  weekId: string;
  weekNumber: number;
  title: string;
  paper: PitchPaper | null;
  twist: string;
  /** One or two people. The first sent it, and is the one who picks a partner. */
  pitcherUids: string[];
  /** The people who said they would join it. Never one of its pitchers. */
  wouldJoinUids: string[];
  createdAt: Date | null;
  updatedAt: Date | null;
};

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const asTimestamp = value as { toDate?: () => Date };
  return typeof asTimestamp?.toDate === "function" ? asTimestamp.toDate() : null;
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

function paperOf(value: unknown): PitchPaper | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Raw;
  const title = str(raw.title, PITCH_LIMITS.paper).trim();
  if (!title) return null;
  if (raw.kind === "reading" && typeof raw.materialId === "string" && raw.materialId) {
    return { kind: "reading", materialId: raw.materialId, title };
  }
  if (raw.kind === "typed") return { kind: "typed", title };
  return null;
}

/** A stored pitch, read. A list of picks is capped well above any group's size. */
export function normalizePitch(id: string, data: Raw): PitchDoc {
  const pitcherUids = uidList(data.pitcherUids, 2);
  return {
    id,
    runId: typeof data.runId === "string" ? data.runId : "",
    courseId: typeof data.courseId === "string" ? data.courseId : "",
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    weekId: typeof data.weekId === "string" ? data.weekId : "",
    weekNumber:
      typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) ? data.weekNumber : 0,
    title: str(data.title, PITCH_LIMITS.title),
    paper: paperOf(data.paper),
    twist: str(data.twist, PITCH_LIMITS.twist),
    pitcherUids,
    wouldJoinUids: uidList(data.wouldJoinUids, 500).filter((uid) => !pitcherUids.includes(uid)),
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** What a person sends to save their pitch. */
export type PitchInput = {
  title: string;
  /** A reading is named by its id; the title stored is the reading's own. */
  paper: { kind: "reading"; materialId: string } | { kind: "typed"; title: string };
  twist: string;
  /** Who they pitch with, or null to pitch alone. */
  partnerUid: string | null;
};

/** A value that can name one document (or one material): one path segment, bounded. */
function isId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && isAddressableId(value);
}

/**
 * A save of a pitch, checked before anything is read. Every refusal is a
 * sentence the person can act on.
 */
export function parsePitchInput(body: unknown): Parsed<PitchInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Send your pitch’s title, paper and twist." };
  }
  const raw = body as Raw;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return { ok: false, error: "Give your pitch a title." };
  if (title.length > PITCH_LIMITS.title) {
    return { ok: false, error: `Keep the title to ${PITCH_LIMITS.title} characters.` };
  }
  const twist = typeof raw.twist === "string" ? raw.twist.trim() : "";
  if (!twist) return { ok: false, error: "Say what your twist is." };
  if (twist.length > PITCH_LIMITS.twist) {
    return { ok: false, error: `Keep the twist to ${PITCH_LIMITS.twist} characters.` };
  }

  const paperRaw = raw.paper && typeof raw.paper === "object" ? (raw.paper as Raw) : null;
  let paper: PitchInput["paper"];
  if (paperRaw?.kind === "reading") {
    if (!isId(paperRaw.materialId)) {
      return { ok: false, error: "Pick the paper from the week’s readings." };
    }
    paper = { kind: "reading", materialId: paperRaw.materialId };
  } else if (paperRaw?.kind === "typed") {
    const typed = typeof paperRaw.title === "string" ? paperRaw.title.trim() : "";
    if (!typed) return { ok: false, error: "Say which paper you’d replicate." };
    if (typed.length > PITCH_LIMITS.paper) {
      return { ok: false, error: `Keep the paper to ${PITCH_LIMITS.paper} characters.` };
    }
    paper = { kind: "typed", title: typed };
  } else {
    return { ok: false, error: "Say which paper you’d replicate." };
  }

  let partnerUid: string | null = null;
  if (raw.partnerUid !== undefined && raw.partnerUid !== null && raw.partnerUid !== "") {
    if (!isId(raw.partnerUid)) {
      return { ok: false, error: "Pick your partner from the people in your group." };
    }
    partnerUid = raw.partnerUid;
  }
  return { ok: true, value: { title, paper, twist, partnerUid } };
}

/** "I’d join this", pressed or unpressed. */
export type PickInput = { pitchId: string; join: boolean };

export function parsePickInput(body: unknown): Parsed<PickInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Say which pitch, and whether you’d join it." };
  }
  const raw = body as Raw;
  if (!isId(raw.pitchId)) {
    return { ok: false, error: "Say which pitch, and whether you’d join it." };
  }
  if (typeof raw.join !== "boolean") {
    return { ok: false, error: "Say whether you’d join this pitch." };
  }
  return { ok: true, value: { pitchId: raw.pitchId, join: raw.join } };
}

// ---------------------------------------------------------------------------
// What travels
// ---------------------------------------------------------------------------

/** "2 of 3 picked". Here rather than with the other words so a browser can work it out after a press. */
export function pickedWords(picked: number, limit: number): string {
  return `${picked} of ${limit} picked`;
}

/** One pitch in a person's list. Names only, and nothing about who picked it. */
export type PitchRow = {
  id: string;
  title: string;
  twist: string;
  /** "Pitched by Aditya Rao and Ellie Morgan", or "Pitched by you". */
  pitchedBy: string;
  /** True on the pitch this person is on: it cannot be picked. */
  yours: boolean;
  /** True when this person said they would join it. */
  picked: boolean;
};

/** The person's own pitch, to show and to edit. */
export type MyPitch = {
  id: string;
  title: string;
  /** The paper's title, as shown ("Paper: …"). */
  paperTitle: string;
  /** The reading it names, for the edit form, or null when it was typed. */
  readingId: string | null;
  twist: string;
  /** The other person on it, or null when pitched alone. */
  partner: { uid: string; name: string } | null;
  /** True for the person who sent it: they choose the partner. */
  sentByMe: boolean;
};

/** Everything a person's pitching page shows. Every sentence is built on the server. */
export type PitchingView = {
  runId: string;
  weekNumber: number;
  /** "Incubator: Alignment Research · Week 3". */
  eyebrow: string;
  /** Where "back" goes, and what it says: the programme's short name. */
  backLabel: string;
  /** "Pitches are in. Pick up to 3 you’d join before tonight’s session at 6pm." */
  lede: string;
  /** True until the group's session in that week starts. After it, nothing changes. */
  open: boolean;
  /** "Edit until 6pm", while it is open. */
  editUntil: string | null;
  /** How many this person may pick, or null when nobody can pick yet. */
  pickLimit: number | null;
  /** How many this person has picked. */
  picked: number;
  mine: MyPitch | null;
  pitches: PitchRow[];
  /** The week's readings, to pick a paper from. */
  readings: Array<{ id: string; title: string }>;
  /** People in the group who could pitch with this person. */
  partners: Array<{ uid: string; name: string }>;
  /** "Zach makes the teams on Thu 19 Nov. Teams are 2 to 4 people.", or null. */
  teams: string | null;
};

/** One pitch on the lead's and admins' list. */
export type StaffPitchRow = {
  id: string;
  title: string;
  twist: string;
  pitchedBy: string;
  /** People still in its group who would join it. */
  wouldJoin: number;
  /** The group's name, when the run has more than one group with pitches. */
  groupName: string | null;
};
