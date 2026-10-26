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
 * Every row of the door list: the sign-ups it shows (confirmed, then the
 * waiting list, then not decided), each with its check-in when there is one,
 * then the walk-ins. A check-in whose names have come off has no row.
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
};

export function doorCounts(rows: readonly DoorRow[]): DoorCounts {
  const signups = rows.filter((row) => row.standing !== "walk-in");
  const expected = signups.filter((row) => row.standing === "signed-up" || row.checkIn).length;
  const signupsHere = signups.filter((row) => row.checkIn).length;
  const walkIns = rows.filter((row) => row.standing === "walk-in").length;
  return {
    expected,
    signupsHere,
    walkIns,
    here: signupsHere + walkIns,
    toCome: signups.filter((row) => row.standing === "signed-up" && !row.checkIn).length,
    byQr: signups.filter((row) => row.checkIn?.how === "qr").length,
    byList: signups.filter((row) => row.checkIn && row.checkIn.how !== "qr").length,
  };
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
