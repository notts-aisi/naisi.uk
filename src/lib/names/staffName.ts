/**
 * WHICH NAME A VIEWER SEES. One rule, for every screen that names somebody.
 *
 * An account can hold two names: the FULL NAME they gave when they joined, or
 * on Home, Profile or an admin's page for them (`profile.fullName`), and the
 * NAME THEY GO BY ("What should we call you?", `profile.preferredName`). The
 * privacy policy says: "Only the committee sees your full name; everyone else
 * sees the name you go by." So:
 *
 *  - A COMMITTEE MEMBER OR AN ADMIN (`seesFullNames`: the committee role or
 *    admin, SU-recognised or not) sees "Priya Shah (Pri)": the full name, with
 *    the name they go by after it when it is not just the start of it.
 *  - EVERYBODY ELSE sees the name they go by, and nothing taken from the full
 *    name: no surname, no initial.
 *
 * A committee member who is not SU-recognised cannot read account documents,
 * so they meet a full name only where a route or a page hands them one, and
 * every file that does is listed, with the gate in front of it, in
 * `tests/full-name-readers.test.mjs`.
 *
 * WHERE THE NAMES COME FROM, read off a `users` document by `accountNamesOf`:
 *
 *  - the name they go by: the preferred name, else the account's display name
 *    (Google's name, for an account made with Google), else none;
 *  - the full name: what they gave, else the account's display name, which is
 *    what staff screens showed before anybody was asked, else none. Nothing
 *    is ever written for the person: Home offers Google's name in the box and
 *    they decide.
 *
 * TWO PEOPLE WITH ONE FULL NAME on one staff screen are told apart by what
 * the screen's loader adds (`apart`): their programme and group, and for an
 * admin, their email (`src/lib/names/load.ts`). A guest with no account who
 * gave one word is marked "Guest: first name only".
 *
 * Pure and client safe: no import, so a page, a route, a browser component
 * and the tests all run the same rule.
 */

/** Who is looking. Only the role decides. */
export type NameViewer = { role?: string | null } | null | undefined;

/**
 * Whether this viewer is "the committee" of the privacy policy's sentence:
 * the committee role or an admin, SU-recognised or not. A member who
 * facilitates a group, leads nothing and holds no role is not.
 */
export function seesFullNames(viewer: NameViewer): boolean {
  return viewer?.role === "committee" || viewer?.role === "admin";
}

/** The two names one account holds, each trimmed, or null when it has none. */
export type AccountNames = {
  /**
   * The full name they gave, else the account's display name. Only the
   * committee is ever shown it.
   */
  full: string | null;
  /** The name they go by: the preferred name, else the account's display name. */
  goBy: string | null;
};

type Raw = Record<string, unknown>;

function record(v: unknown): Raw {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

/** Text with something in it, trimmed and with its spaces collapsed, or null. */
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed : null;
}

/**
 * The names a `users` document holds (a stored document, or one normalised by
 * `normalizeUser`: the fields are in the same places). Anything missing, empty
 * or not text reads as absent.
 */
export function accountNamesOf(data: unknown): AccountNames {
  const doc = record(data);
  const profile = record(doc.profile);
  const display = text(doc.displayName);
  return {
    full: text(profile.fullName) ?? display,
    goBy: text(profile.preferredName) ?? display,
  };
}

/** The name a person goes by, read off their `users` document, or null when it holds none. */
export function goByNameOf(data: unknown): string | null {
  return accountNamesOf(data).goBy;
}

/** A name as a staff screen draws it, in parts, so the screen can set them apart. */
export type StaffName = {
  /** The full name, or the name they go by when there is no full name to show. */
  name: string;
  /** The name they go by, when it is not just the start of the full name: drawn after it in brackets. */
  goBy: string | null;
  /** What tells them apart from somebody on the same screen with the same full name. */
  apart: string | null;
  /** A guest with no account who gave one word: "Guest: first name only". */
  note: string | null;
};

const fold = (name: string) => name.toLocaleLowerCase("en-GB");

/**
 * Whether the name somebody goes by says nothing the full name does not:
 * the same name, or its first word or words ("Sam" for "Sam Okoro"). "Pri"
 * for "Priya Shah" says something, so it is shown.
 */
function goByIsInFull(goBy: string, full: string): boolean {
  const g = fold(goBy);
  const f = fold(full);
  return f === g || f.startsWith(`${g} `);
}

/**
 * "Priya Shah (Pri)", as parts: the full name, and the name they go by when
 * it adds something. With no full name it is the name they go by, and with
 * neither it is `fallback`.
 */
export function staffNameOf(names: AccountNames, fallback: string): StaffName {
  if (names.full) {
    const goBy = names.goBy && !goByIsInFull(names.goBy, names.full) ? names.goBy : null;
    return { name: names.full, goBy, apart: null, note: null };
  }
  return { name: names.goBy ?? fallback, goBy: null, apart: null, note: null };
}

/** A staff name as one line of words: "Priya Shah (Pri) · AGI Strategy, Group 2". For a list, a file or a sentence. */
export function staffNameWords(name: StaffName): string {
  const first = name.goBy ? `${name.name} (${name.goBy})` : name.name;
  return [first, name.apart, name.note].filter((part): part is string => Boolean(part)).join(" · ");
}

/**
 * THE RULE: the name this viewer sees for one account. The committee and
 * admins see "Priya Shah (Pri)"; everybody else sees "Pri". `fallback` is what
 * to say when the account holds no name at all ("NAISI member", or an address
 * where the screen may show one).
 */
export function nameForViewer(viewer: NameViewer, names: AccountNames, fallback: string): string {
  if (seesFullNames(viewer)) return staffNameWords(staffNameOf(names, fallback));
  return names.goBy ?? fallback;
}

/** How a full name is compared with another: case, and runs of spaces, do not count. */
export function fullNameKey(name: string): string {
  return fold(name.trim().replace(/\s+/g, " "));
}

/**
 * The people on one screen whose full name somebody else on it shares, by
 * key. Two people called "Sam Okoro" are both in it; "Sam Okoro" and "Sam
 * Patel" are not.
 */
export function sharedFullNames(people: readonly { key: string; full: string | null }[]): Set<string> {
  const byName = new Map<string, string[]>();
  for (const person of people) {
    if (!person.full) continue;
    const key = fullNameKey(person.full);
    byName.set(key, [...(byName.get(key) ?? []), person.key]);
  }
  const shared = new Set<string>();
  for (const keys of byName.values()) {
    if (new Set(keys).size > 1) for (const key of keys) shared.add(key);
  }
  return shared;
}

/** What a staff screen says beside a guest who gave one word for their name. */
export const GUEST_FIRST_NAME_ONLY = "Guest: first name only";

/**
 * A guest's name as a staff screen draws it: what they typed, marked when it
 * is one word, so the people at the door know they have only a first name.
 */
export function guestStaffName(typed: string, fallback: string): StaffName {
  const name = typed.trim().replace(/\s+/g, " ");
  if (!name) return { name: fallback, goBy: null, apart: null, note: null };
  return { name, goBy: null, apart: null, note: name.includes(" ") ? null : GUEST_FIRST_NAME_ONLY };
}
