import { londonDateKey } from "@/lib/courses/weekPlan";

/**
 * ANONYMOUS FEEDBACK FOR THE WHOLE SOCIETY (docs/surveys.md, "Anonymous
 * feedback for the whole society"): one form, always open, for any signed-in
 * member, with an optional programme, session and role, read only by admins
 * from the next day.
 *
 * IT IS NOT THE KEEP, CHANGE AND DROP FORM (`src/lib/anonymousFeedback/`),
 * which is one link per programme and read by the programme's lead too. The
 * two share the night's move job and nothing else.
 *
 * Two collections, each server-only in both directions (the rules refuse
 * every browser, admins included):
 *
 *  - `societyFeedbackWaiting/{autoId}`: one entry as it came in, kept until
 *    the night's move. The database stamps every record with the time it was
 *    written, so this record carries the time for as long as it lasts, and
 *    nothing that shows an entry to anybody ever reads it.
 *  - `societyFeedback/{autoId}`: one entry as it is kept. The move writes a
 *    finished day's entries in shuffled order, so the database's own time on
 *    each is the move's and says nothing about when any one came in.
 *
 * AN ENTRY HOLDS EXACTLY `ENTRY_FIELDS`: the words, the day in London, and
 * the programme, session and role the sender chose to name ("" or null when
 * they named none). Never an account, a session, an address or anything
 * about a device. The kept record later gains `dealtWith` and `note`, which
 * are admins acting and say who and when (`STAFF_FIELDS`); nothing the
 * sender does writes them.
 *
 * This file is pure: no reads, no writes.
 */

export const SOCIETY_WAITING_COLLECTION = "societyFeedbackWaiting";
export const SOCIETY_KEPT_COLLECTION = "societyFeedback";

/** Every field an entry holds as the sender sends it, waiting or kept. Nothing else is ever written by the sender's path. */
export const ENTRY_FIELDS = ["words", "day", "roundId", "programmeId", "programmeName", "week", "about"] as const;

/** The two fields admins add to a kept entry, each saying which admin and when. */
export const STAFF_FIELDS = ["dealtWith", "note"] as const;

/** The longest feedback, in characters. */
export const WORDS_MAX_CHARS = 4000;

/** The longest note for admins, in characters. */
export const NOTE_MAX_CHARS = 1000;

/** The most a request may carry, in characters: the words at their longest, escaped, and room for the rest. */
export const BODY_MAX_CHARS = WORDS_MAX_CHARS * 2 + 600;

/** The highest week a session can be named by. */
export const WEEK_MAX = 60;

/**
 * "Who is it about?": a role, never a name. A fixed list, so nothing a sender
 * picks can name a person, and no free text is taken for it.
 */
export const ABOUT_KEYS = ["facilitator", "lead", "group", "committee", "else"] as const;
export type AboutKey = (typeof ABOUT_KEYS)[number];

export function isAboutKey(value: unknown): value is AboutKey {
  return typeof value === "string" && (ABOUT_KEYS as readonly string[]).includes(value);
}

/** One entry, as the sender's path writes it. */
export type SocietyEntry = {
  words: string;
  /** "YYYY-MM-DD", the day in London it came in. Never a time. */
  day: string;
  /** The application form the programme is on, or "" when no programme was named. */
  roundId: string;
  programmeId: string;
  /** The programme's name as the form had it when the entry came in, or "". */
  programmeName: string;
  /** The session, as a week number, or null when none was named. */
  week: number | null;
  /** The role it is about, or "" when none was named. */
  about: AboutKey | "";
};

/** What an admin did to a kept entry: who, by the name they go by, and when. */
export type StaffMark = { byUid: string; byName: string; at: Date };
export type StaffNote = StaffMark & { text: string };

/** A kept entry as admins read it. */
export type KeptEntry = SocietyEntry & {
  id: string;
  dealtWith: StaffMark | null;
  note: StaffNote | null;
};

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether a value has the shape of a document id the entries and forms use. */
export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && ID_SHAPE.test(value);
}

/** Whether a value is a day key, "2026-11-19". */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_SHAPE.test(value)) return false;
  const at = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value;
}

/**
 * The same day a year earlier, as a day key: "2025-11-19" for "2026-11-19",
 * and 28 February for 29 February. An entry sent before it is more than a
 * year old, which is what the yearly clear-out may delete and nothing newer.
 */
export function yearBefore(day: string): string {
  const [year, month, date] = day.split("-");
  return `${String(Number(year) - 1).padStart(4, "0")}-${month}-${month === "02" && date === "29" ? "28" : date}`;
}

/** The day in London an entry sent at `at` came in. */
export function dayOf(at: Date): string {
  return londonDateKey(at);
}

/** Whether a role is allowed to send: an approved account, whatever else it holds. */
export function isMemberRole(role: string | null | undefined): boolean {
  return role === "member" || role === "committee" || role === "admin";
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

/** A stored entry's sender fields, or null when it is not one. Only `ENTRY_FIELDS` are read. */
export function normaliseEntry(raw: Record<string, unknown>): SocietyEntry | null {
  const words = text(raw.words);
  const day = text(raw.day);
  if (!words || !isDayKey(day)) return null;
  const roundId = text(raw.roundId);
  const programmeId = text(raw.programmeId);
  const named = roundId !== "" && programmeId !== "";
  const week = typeof raw.week === "number" && Number.isInteger(raw.week) && raw.week >= 1 && raw.week <= WEEK_MAX ? raw.week : null;
  return {
    words,
    day,
    roundId: named ? roundId : "",
    programmeId: named ? programmeId : "",
    programmeName: named ? text(raw.programmeName).trim() : "",
    week: named ? week : null,
    about: isAboutKey(raw.about) ? raw.about : "",
  };
}

function staffMark(raw: unknown): StaffMark | null {
  if (!raw || typeof raw !== "object") return null;
  const mark = raw as Record<string, unknown>;
  const at = toDate(mark.at);
  if (!at) return null;
  return { byUid: text(mark.byUid), byName: text(mark.byName).trim(), at };
}

/** A kept entry with what admins added to it, or null when it is not one. */
export function normaliseKept(id: string, raw: Record<string, unknown>): KeptEntry | null {
  const entry = normaliseEntry(raw);
  if (!entry) return null;
  const dealtWith = staffMark(raw.dealtWith);
  const noteMark = staffMark(raw.note);
  const noteText = raw.note && typeof raw.note === "object" ? text((raw.note as Record<string, unknown>).text).trim() : "";
  return { ...entry, id, dealtWith, note: noteMark && noteText ? { ...noteMark, text: noteText } : null };
}

/** What a member sent, checked: the words trimmed, and the three choices. */
export type SentFeedback = {
  words: string;
  programme: { roundId: string; programmeId: string } | null;
  week: number | null;
  about: AboutKey | "";
};

export type BodyProblem = "shape" | "empty" | "long";

/**
 * Read a request's body as text. Refused as "shape" when it is not a JSON
 * object of the form's fields (a session named with no programme, a role not
 * on the list, an id of the wrong shape), "long" when the words are over
 * `WORDS_MAX_CHARS` or the body over `BODY_MAX_CHARS`, and "empty" when the
 * words are blank. Each field is read by its own name; nothing else in the
 * body is read or kept.
 */
export function readSendBody(raw: string): { ok: true; sent: SentFeedback } | { ok: false; problem: BodyProblem } {
  if (raw.length > BODY_MAX_CHARS) return { ok: false, problem: "long" };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "shape" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, problem: "shape" };
  const body = parsed as { words?: unknown; roundId?: unknown; programmeId?: unknown; week?: unknown; about?: unknown };

  if (body.words !== undefined && typeof body.words !== "string") return { ok: false, problem: "shape" };
  const words = typeof body.words === "string" ? body.words.trim() : "";

  const blank = (value: unknown) => value === undefined || value === null || value === "";
  let programme: SentFeedback["programme"] = null;
  if (!blank(body.roundId) || !blank(body.programmeId)) {
    if (!isRecordId(body.roundId) || !isRecordId(body.programmeId)) return { ok: false, problem: "shape" };
    programme = { roundId: body.roundId, programmeId: body.programmeId };
  }

  let week: number | null = null;
  if (!blank(body.week)) {
    if (typeof body.week !== "number" || !Number.isInteger(body.week) || body.week < 1 || body.week > WEEK_MAX) return { ok: false, problem: "shape" };
    if (!programme) return { ok: false, problem: "shape" };
    week = body.week;
  }

  let about: AboutKey | "" = "";
  if (!blank(body.about)) {
    if (!isAboutKey(body.about)) return { ok: false, problem: "shape" };
    about = body.about;
  }

  if (words.length > WORDS_MAX_CHARS) return { ok: false, problem: "long" };
  if (!words) return { ok: false, problem: "empty" };
  return { ok: true, sent: { words, programme, week, about } };
}

/** The programme a sender named, as the server found it: its name and how many weeks it has. */
export type NamedProgramme = { roundId: string; programmeId: string; name: string; weeks: number | null };

/**
 * The entry as it is written, field by field and in `ENTRY_FIELDS`' order,
 * from what was sent, the programme the server found for it, and the day. The
 * one place an entry's fields are named for writing.
 */
export function entryToKeep(sent: SentFeedback, programme: NamedProgramme | null, day: string): SocietyEntry {
  return {
    words: sent.words,
    day,
    roundId: programme ? programme.roundId : "",
    programmeId: programme ? programme.programmeId : "",
    programmeName: programme ? programme.name : "",
    week: programme ? sent.week : null,
    about: sent.about,
  };
}

/**
 * Whether a session a sender named is one of the programme's: any week when
 * the programme's run has no weeks written yet, otherwise one of them.
 */
export function weekFits(week: number | null, programme: NamedProgramme): boolean {
  if (week === null) return true;
  return programme.weeks === null || week <= programme.weeks;
}

/**
 * Whether a waiting entry is due to move at `today`: only once its own day is
 * over in London, so a whole day's entries move together and the move's time
 * says no more than the day does.
 */
export function dueToMove(entry: Pick<SocietyEntry, "day">, today: string): boolean {
  return entry.day < today;
}

/** A fair shuffle, with the random source passed in so a test can drive it. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
