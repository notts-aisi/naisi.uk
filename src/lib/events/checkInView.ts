import { clockWords, dayWords } from "@/features/events/manageWords";
import type { CheckInHow, EventCheckInDoc } from "@/lib/firestore/eventCheckIns";
import type { RsvpDoc, RsvpStatus } from "@/lib/firestore/events";
import type { CheckInPhase } from "./checkIns";

/**
 * What the door list and the event's Check-in tab are given: the people,
 * each as the fields a row draws, built here field by field from the
 * sign-ups and the check-ins. Never a stored document.
 *
 * No server-only marker: the client components import the types, and the
 * builders touch no database. The pages that call them are behind
 * `runsCheckIn`, because every row carries a name.
 */

/** What the event's page and a door code's sign say under the code. */
export const DOOR_CODE_LINE =
  "Signed-in people check themselves in. Everyone else gives their name at the door.";

/** How somebody on the list stands: a confirmed sign-up, the waiting list, not decided yet, or a walk-in. */
export type DoorStanding = "signed-up" | "waiting" | "undecided" | "walk-in";

export type DoorCheckIn = {
  id: string;
  how: CheckInHow;
  /** When, as an ISO instant. */
  at: string;
  /** For a walk-in who gave an email: when it goes, as an ISO instant. */
  emailGoesAt: string | null;
  /** A walk-in who gave no email. */
  noEmail: boolean;
};

export type DoorRow = {
  /** The sign-up's id, or the check-in's for a walk-in. Also seeds the avatar's colour. */
  key: string;
  rsvpId: string | null;
  name: string;
  standing: DoorStanding;
  checkIn: DoorCheckIn | null;
};

const STANDING_OF: Partial<Record<RsvpStatus, DoorStanding>> = {
  confirmed: "signed-up",
  waitlisted: "waiting",
  pending: "undecided",
};

/** The words under a name on the list. */
export const STANDING_WORDS: Record<DoorStanding, string> = {
  "signed-up": "Signed up",
  waiting: "On the waiting list",
  undecided: "Not decided yet",
  "walk-in": "Walk-in",
};

/** "QR", "Door", "Added later": how somebody was checked in, as the door list says it. */
export const HOW_SHORT: Record<CheckInHow, string> = {
  qr: "QR",
  door: "Door",
  page: "Added later",
};

/** "QR at the door", "Door list", "Added later": as the event's page says it. */
export const HOW_WORDS: Record<CheckInHow, string> = {
  qr: "QR at the door",
  door: "Door list",
  page: "Added later",
};

function view(checkIn: EventCheckInDoc): DoorCheckIn {
  return {
    id: checkIn.id,
    how: checkIn.how,
    at: (checkIn.at ?? new Date(0)).toISOString(),
    emailGoesAt: checkIn.email && checkIn.emailGoesAt ? checkIn.emailGoesAt.toISOString() : null,
    noEmail: checkIn.kind === "walk-in" && !checkIn.email,
  };
}

/**
 * The check-ins whose names have come off, a year after the event or at once
 * when an account is deleted (`src/lib/events/checkIns.ts`), as counts. Each
 * is still one person who came, and says whether they came by a sign-up or
 * walked in, and how; never who. They have no row, because a row is a name,
 * and they stay in every count of who came (`doorCounts`): the privacy policy
 * says such a record "stays in the count".
 */
export type NamesOff = {
  /** Sign-ups who came. */
  signups: number;
  /** Of those, how many checked themselves in with the code. */
  signupsByQr: number;
  walkIns: number;
};

export const NO_NAMES_OFF: NamesOff = { signups: 0, signupsByQr: 0, walkIns: 0 };

/** The event's check-ins whose names have come off, counted. Names nobody. */
export function namesOffOf(checkIns: readonly EventCheckInDoc[]): NamesOff {
  const off = checkIns.filter((row) => row.namesOff);
  const signups = off.filter((row) => row.kind === "signup");
  return {
    signups: signups.length,
    signupsByQr: signups.filter((row) => row.how === "qr").length,
    walkIns: off.length - signups.length,
  };
}

/**
 * Every row of the door list: the sign-ups it shows (confirmed, then the
 * waiting list, then not decided), each with its check-in when there is one,
 * then the walk-ins. A check-in whose names have come off has no row: it is
 * counted from `namesOffOf` instead.
 */
export function doorRows(signups: readonly RsvpDoc[], checkIns: readonly EventCheckInDoc[]): DoorRow[] {
  const live = checkIns.filter((row) => !row.namesOff);
  const bySignup = new Map<string, EventCheckInDoc>();
  for (const row of live) if (row.rsvpId) bySignup.set(row.rsvpId, row);
  const rank: Record<DoorStanding, number> = { "signed-up": 0, waiting: 1, undecided: 2, "walk-in": 3 };

  const rows: DoorRow[] = [];
  for (const signup of signups) {
    const standing = STANDING_OF[signup.status];
    if (!standing || signup.synthetic) continue;
    const checkIn = bySignup.get(signup.id) ?? null;
    rows.push({
      key: signup.id,
      rsvpId: signup.id,
      name: signup.name.trim() || "No name given",
      standing,
      checkIn: checkIn ? view(checkIn) : null,
    });
  }
  for (const row of live) {
    if (row.kind !== "walk-in") continue;
    rows.push({
      key: row.id,
      rsvpId: null,
      name: row.name ?? "No name given",
      standing: "walk-in",
      checkIn: view(row),
    });
  }
  return rows.sort(
    (a, b) => rank[a.standing] - rank[b.standing] || a.name.localeCompare(b.name, "en-GB"),
  );
}

export type DoorCounts = {
  /** Sign-ups expected: everybody confirmed, and anybody else who was let in. */
  expected: number;
  /** Of those, how many came. */
  signupsHere: number;
  walkIns: number;
  /** Everybody here: sign-ups and walk-ins. */
  here: number;
  /** Confirmed sign-ups not checked in. */
  toCome: number;
  /** Checked themselves in with the code. */
  byQr: number;
  /** Checked in on the door list or added later, walk-ins left out. */
  byList: number;
  /** Counted and on no row: the check-ins whose names have come off. */
  notListed: number;
  /**
   * Confirmed sign-ups with no tick who are counted as having come: a
   * sign-up's tick goes with its names, so each sign-up whose names have come
   * off is taken to be one of these, while there are any. Which ones can no
   * longer be told.
   */
  cameUnticked: number;
};

/**
 * The numbers of the door list and the Check-in tab. `namesOff` (from
 * `namesOffOf`) adds the people whose names have come off: each counts as
 * having come, by a sign-up or walking in and how, as their record says. A
 * sign-up's row loses its tick when its names come off and stays on the list,
 * so each such sign-up is taken to be one of the confirmed sign-ups with no
 * tick, as a sign-up who comes almost always is: then the four numbers still
 * add up, `signupsHere` and `toCome` making `expected`.
 */
export function doorCounts(rows: readonly DoorRow[], namesOff: NamesOff = NO_NAMES_OFF): DoorCounts {
  const signups = rows.filter((row) => row.standing !== "walk-in");
  const unticked = signups.filter((row) => row.standing === "signed-up" && !row.checkIn).length;
  const cameUnticked = Math.min(namesOff.signups, unticked);
  const signupsHere = signups.filter((row) => row.checkIn).length + namesOff.signups;
  const walkIns = rows.filter((row) => row.standing === "walk-in").length + namesOff.walkIns;
  return {
    expected: signups.filter((row) => row.standing === "signed-up" || row.checkIn).length + namesOff.signups - cameUnticked,
    signupsHere,
    walkIns,
    here: signupsHere + walkIns,
    toCome: unticked - cameUnticked,
    byQr: signups.filter((row) => row.checkIn?.how === "qr").length + namesOff.signupsByQr,
    byList: signups.filter((row) => row.checkIn && row.checkIn.how !== "qr").length + namesOff.signups - namesOff.signupsByQr,
    notListed: namesOff.signups + namesOff.walkIns,
    cameUnticked,
  };
}

/**
 * Under a list of who came, when some are counted and not listed: "2 more
 * came whose names have come off: counted, not listed." `more` is false when
 * nobody is listed above it.
 */
export function notListedWords(n: number, more: boolean): string {
  return `${n} ${more ? "more " : ""}came whose ${n === 1 ? "name has" : "names have"} come off: counted, not listed.`;
}

/**
 * Over a list of confirmed sign-ups with no tick, when some of them came and
 * their names have come off: "2 of these came, but their names have come off,
 * so we can’t tell which."
 */
export function cameUntickedWords(n: number): string {
  return `${n} of these came, but ${n === 1 ? "their name has" : "their names have"} come off, so we can’t tell which.`;
}

/** "10 of 18 here · 2 walk-ins". */
export function hereWords(counts: DoorCounts): { main: string; walkIns: string | null } {
  return {
    main: `${counts.signupsHere} of ${counts.expected} here`,
    walkIns:
      counts.walkIns === 0 ? null : `${counts.walkIns} walk-in${counts.walkIns === 1 ? "" : "s"}`,
  };
}

/** "QR · 2:18pm". */
export function checkInStamp(checkIn: DoorCheckIn): string {
  return `${HOW_SHORT[checkIn.how]} · ${clockWords(new Date(checkIn.at))}`;
}

/** What the door list says when it cannot take a tick, or null when it can. */
export function doorClosedWords(
  phase: CheckInPhase,
  window: { opensAt: Date; closesAt: Date } | null,
): string | null {
  if (phase === "door") return null;
  if (phase === "undated" || !window) return "This event has no date yet, so it has no door list.";
  if (phase === "before") {
    return `The door list opens at ${clockWords(window.opensAt)} on ${dayWords(window.opensAt)}, an hour before the start.`;
  }
  return `The door list closed at ${clockWords(window.closesAt)}, an hour after the end. Add people who came from the event’s page.`;
}
