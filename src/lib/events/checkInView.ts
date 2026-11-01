import { clockWords, dayWords } from "@/features/events/manageWords";
import {
  SELF_WAYS,
  checkedThemselvesIn,
  type CheckInHow,
  type EventCheckInDoc,
  type SelfWay,
} from "@/lib/firestore/eventCheckIns";
import type { EventDoc, RsvpDoc, RsvpStatus } from "@/lib/firestore/events";
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

/**
 * WHO CAN CHECK THEMSELVES IN, as the door code's words say it: under the
 * code on the event's Check-in tab and on the A4 sign printed from it
 * (`doorCodeLine`), and under the door list beside the code's address
 * (`doorListSelfWords`). Exactly the rule of `decideSelf`
 * (`src/lib/events/selfCheckIn.ts`), which decides who may press "I'm here",
 * at an event that lets people and once its door is open:
 *
 *  - ANYONE SIGNED IN: with a confirmed sign-up, as that sign-up; with none,
 *    or only a cancelled one, as a walk-in with their account. A pending
 *    account too.
 *  - UNLESS STILL WAITING FOR A PLACE (on the waiting list, or a sign-up not
 *    decided yet) OR TURNED DOWN (a refused sign-up, or an account whose
 *    request to join was turned down, whatever its sign-ups): the people at
 *    the door decide, so they give their name there.
 *  - A PLACE'S EMAIL LINK, for a guest with no account: only a confirmation
 *    that went out while the event let people check themselves in carries
 *    one (`sendRsvpEmail`), so the words say "if it has one".
 *
 * At an event with no sign-up (`noSignup`) nobody holds a place or is sent a
 * confirmation, so the words say neither. `tests/event-self-check-in.test.mjs`
 * presses "I'm here" as every kind of person at both kinds of event and holds
 * each to what these words say of them.
 */
function signedInUnless(event: Pick<EventDoc, "noSignup">): string {
  return event.noSignup
    ? "unless they were turned down"
    : "unless they’re still waiting for a place or were turned down";
}

/** The email's link, for somebody with a place; null at an event with no sign-up, which sends no confirmation. */
function placeLinkWords(event: Pick<EventDoc, "noSignup">): string | null {
  return event.noSignup ? null : "People with a place can also use the link in their confirmation email, if it has one.";
}

/**
 * What the event's Check-in tab and a door code's sign say under the code, at
 * an event that lets people check themselves in. At an event that takes
 * sign-ups: "Anyone signed in can check themselves in by scanning this code,
 * unless they’re still waiting for a place or were turned down. People with a
 * place can also use the link in their confirmation email, if it has one.
 * Everyone else gives their name at the door."
 */
export function doorCodeLine(event: Pick<EventDoc, "noSignup">): string {
  return [
    `Anyone signed in can check themselves in by scanning this code, ${signedInUnless(event)}.`,
    placeLinkWords(event),
    "Everyone else gives their name at the door.",
  ]
    .filter((sentence): sentence is string => sentence !== null)
    .join(" ");
}

/**
 * Under the door list, around the door code's address, which the list draws
 * in bold between the two: who can check themselves in there instead of
 * giving their name, by the same rule as `doorCodeLine`.
 */
export function doorListSelfWords(event: Pick<EventDoc, "noSignup">): { before: string; after: string } {
  const link = placeLinkWords(event);
  return {
    before: "Anyone signed in can check themselves in at ",
    after: `, ${signedInUnless(event)}.${link ? ` ${link}` : ""}`,
  };
}

/** Over the door list's names, at an event that does not let people check themselves in. */
export const SELF_OFF_DOOR_LIST = "Self check-in is off for this event: everyone gives their name here.";

/** The door list inside the door's hours, before the event's author or an admin has opened the door. */
export const DOOR_NOT_OPEN = "The door isn’t open yet. The event’s author or an admin opens it from the Check-in tab.";

/** How somebody on the list stands: a confirmed sign-up, the waiting list, not decided yet, or a walk-in. */
export type DoorStanding = "signed-up" | "waiting" | "undecided" | "walk-in";

export type DoorCheckIn = {
  id: string;
  how: CheckInHow;
  /** When, as an ISO instant. */
  at: string;
  /**
   * Who checked them in, by the name they go by, for the event's page. Null
   * when they checked themselves in (`how` says so), and when the name was
   * not looked up or is not known: the door list never shows it.
   */
  by: string | null;
  /** For a walk-in who gave an email: when it goes, as an ISO instant. */
  emailGoesAt: string | null;
  /**
   * A walk-in with no account who gave no email: the event's survey cannot
   * reach them. Never an account's check-in, whose survey goes to the
   * account's own address.
   */
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

/** "Door", "Door code", "Added later": how somebody was checked in, as the door list stamps it. */
export const HOW_SHORT: Record<CheckInHow, string> = {
  door: "Door",
  page: "Added later",
  code: "Door code",
  email: "Email",
  site: "Check-in page",
  qr: "Themselves",
};

/**
 * "Door list", "Scanned the door code", "From their email": how somebody was
 * checked in, as the event's page says it, each way as itself. A record from
 * before the ways were told apart (`qr`) says only that they checked
 * themselves in. Somebody added at the door without a sign-up reads
 * "Walk-in" (`howWords`).
 */
export const HOW_WORDS: Record<CheckInHow, string> = {
  door: "Door list",
  page: "Added later",
  code: "Scanned the door code",
  email: "From their email",
  site: "On the check-in page",
  qr: "Checked themselves in",
};

/** The How column of who came: a walk-in added at the door is a walk-in; every other way is itself. */
export function howWords(row: Pick<DoorRow, "standing" | "checkIn">): string {
  if (!row.checkIn) return "";
  if (row.checkIn.how === "door" && row.standing === "walk-in") return "Walk-in";
  return HOW_WORDS[row.checkIn.how];
}

/** The Checked in by column: "Themselves", or who checked them in. */
export function byWords(checkIn: Pick<DoorCheckIn, "how" | "by">): string {
  if (checkedThemselvesIn(checkIn.how)) return "Themselves";
  return checkIn.by ?? "Not known";
}

function view(checkIn: EventCheckInDoc, names: ReadonlyMap<string, string>): DoorCheckIn {
  return {
    id: checkIn.id,
    how: checkIn.how,
    at: (checkIn.at ?? new Date(0)).toISOString(),
    by: checkIn.byUid && !checkedThemselvesIn(checkIn.how) ? (names.get(checkIn.byUid) ?? null) : null,
    emailGoesAt: checkIn.email && checkIn.emailGoesAt ? checkIn.emailGoesAt.toISOString() : null,
    noEmail: checkIn.kind === "walk-in" && !checkIn.email && !checkIn.uid,
  };
}

/** How many checked themselves in, by the way they did. */
export type SelfTally = Record<SelfWay, number>;

export const NO_SELF: SelfTally = { code: 0, email: 0, site: 0, qr: 0 };

const total = (tally: SelfTally) => SELF_WAYS.reduce((sum, way) => sum + tally[way], 0);

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
  /** Of those, how many checked themselves in, by the way they did. */
  signupsThemselves: SelfTally;
  walkIns: number;
  /** Of those, how many checked themselves in (an account with no sign-up), by the way they did. */
  walkInsThemselves: SelfTally;
};

export const NO_NAMES_OFF: NamesOff = { signups: 0, signupsThemselves: NO_SELF, walkIns: 0, walkInsThemselves: NO_SELF };

/** The event's check-ins whose names have come off, counted. Names nobody. */
export function namesOffOf(checkIns: readonly EventCheckInDoc[]): NamesOff {
  const off = checkIns.filter((row) => row.namesOff);
  const signups = off.filter((row) => row.kind === "signup");
  const themselves = (rows: readonly EventCheckInDoc[]): SelfTally => {
    const tally = { ...NO_SELF };
    for (const row of rows) if (checkedThemselvesIn(row.how)) tally[row.how] += 1;
    return tally;
  };
  return {
    signups: signups.length,
    signupsThemselves: themselves(signups),
    walkIns: off.length - signups.length,
    walkInsThemselves: themselves(off.filter((row) => row.kind !== "signup")),
  };
}

/**
 * Whether a row is a walk-in who checked themselves in: an account with no
 * sign-up, which is the only way to check yourself in without one
 * (`decideSelf`, which tells them it checks them in as a walk-in). The
 * Check-in tab counts them among who checked themselves in, and its row says
 * the way they came, as a sign-up's does.
 */
export function walkedInThemselves(row: Pick<DoorRow, "standing" | "checkIn">): boolean {
  return row.standing === "walk-in" && !!row.checkIn && checkedThemselvesIn(row.checkIn.how);
}

/**
 * Every row of the door list: the sign-ups it shows (confirmed, then the
 * waiting list, then not decided), each with its check-in when there is one,
 * then the walk-ins. A check-in whose names have come off has no row: it is
 * counted from `namesOffOf` instead. `names` are the people who checked
 * others in, by uid (`staffNames`), for the event's page to say who; the door
 * list does without.
 */
export function doorRows(
  signups: readonly RsvpDoc[],
  checkIns: readonly EventCheckInDoc[],
  names: ReadonlyMap<string, string> = new Map(),
): DoorRow[] {
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
      checkIn: checkIn ? view(checkIn, names) : null,
    });
  }
  for (const row of live) {
    if (row.kind !== "walk-in") continue;
    rows.push({
      key: row.id,
      rsvpId: null,
      name: row.name ?? "No name given",
      standing: "walk-in",
      checkIn: view(row, names),
    });
  }
  return rows.sort(
    (a, b) => rank[a.standing] - rank[b.standing] || a.name.localeCompare(b.name, "en-GB"),
  );
}

export type DoorCounts = {
  /** Sign-ups expected: everybody confirmed, and anybody else who was let in. The door list's own count. */
  expected: number;
  /** Of those, how many came. */
  signupsHere: number;
  /** Confirmed sign-ups: the event's sign-ups, as its Sign-ups tab counts them. */
  confirmed: number;
  /** Of those, how many came. */
  confirmedHere: number;
  /** Let in from the waiting list. */
  waitingHere: number;
  /** Let in with a sign-up not decided yet. */
  undecidedHere: number;
  /** Everybody here with no sign-up. */
  walkIns: number;
  /** Everybody here: sign-ups and walk-ins. */
  here: number;
  /** Confirmed sign-ups not checked in. */
  toCome: number;
  /**
   * Checked themselves in, every way (the door code, their email's link, the
   * check-in page, or a way not recorded): sign-ups, and accounts with no
   * sign-up.
   */
  themselves: number;
  /** The same people, by the way they came in. */
  themselvesBy: SelfTally;
  /** Sign-ups checked in on the door list or added later. */
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
  /** Of the walk-ins, the ones who checked themselves in (`walkedInThemselves`), counted in `themselves`. */
  walkInsThemselves: number;
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
  const walkInRows = rows.filter((row) => row.standing === "walk-in");
  const walkIns = walkInRows.length + namesOff.walkIns;
  const here = (standing: DoorStanding) => signups.filter((row) => row.standing === standing && row.checkIn).length;
  // Each way in, as itself: the rows', then the records whose names have come off.
  const themselvesBy = { ...NO_SELF };
  for (const row of rows) if (row.checkIn && checkedThemselvesIn(row.checkIn.how)) themselvesBy[row.checkIn.how] += 1;
  for (const way of SELF_WAYS) themselvesBy[way] += namesOff.signupsThemselves[way] + namesOff.walkInsThemselves[way];
  return {
    expected: signups.filter((row) => row.standing === "signed-up" || row.checkIn).length + namesOff.signups - cameUnticked,
    signupsHere,
    confirmed: signups.filter((row) => row.standing === "signed-up").length,
    // A confirmed sign-up whose names have come off lost its tick with them,
    // so it is one of the confirmed who came (`cameUnticked`).
    confirmedHere: here("signed-up") + cameUnticked,
    waitingHere: here("waiting"),
    undecidedHere: here("undecided"),
    walkIns,
    here: signupsHere + walkIns,
    toCome: unticked - cameUnticked,
    themselves: total(themselvesBy),
    themselvesBy,
    byList:
      signups.filter((row) => row.checkIn && !checkedThemselvesIn(row.checkIn.how)).length +
      namesOff.signups -
      total(namesOff.signupsThemselves),
    walkInsThemselves: walkInRows.filter(walkedInThemselves).length + total(namesOff.walkInsThemselves),
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Under the Check-in tab's "came": who came, so the parts add up to the
 * number. "15 of 18 who signed up, and 3 walk-ins", the board's words, where
 * 18 is the confirmed sign-ups, the number on the Sign-ups tab beside it.
 * Somebody let in at the door from the waiting list, or with a sign-up not
 * decided yet, is said apart: "2 of 3 who signed up, 1 from the waiting list,
 * and 3 walk-ins" (not drawn: listed in the build notes for the boards'
 * designers to confirm).
 */
export function cameWords(counts: DoorCounts): string {
  const parts = [`${counts.confirmedHere} of ${counts.confirmed} who signed up`];
  if (counts.waitingHere > 0) parts.push(`${counts.waitingHere} from the waiting list`);
  if (counts.undecidedHere > 0) {
    parts.push(
      counts.undecidedHere === 1
        ? "1 whose place wasn’t decided yet"
        : `${counts.undecidedHere} whose places weren’t decided yet`,
    );
  }
  if (counts.walkIns > 0) parts.push(plural(counts.walkIns, "walk-in", "walk-ins"));
  return parts.length < 2 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

const SELF_WAY_ALONE: Record<SelfWay, string> = {
  code: "With the door code",
  email: "From their email",
  site: "On the check-in page",
  qr: "The way in wasn’t recorded",
};

const SELF_WAY_COUNTED: Record<SelfWay, (n: number) => string> = {
  code: (n) => `${n} with the door code`,
  email: (n) => `${n} from their email`,
  site: (n) => `${n} on the check-in page`,
  qr: (n) => (n === 1 ? "1 whose way in wasn’t recorded" : `${n} whose ways in weren’t recorded`),
};

/**
 * Under "checked themselves in": the way they came in, each as itself, so a
 * self check-in is never said to be a scan it was not. One way alone is said
 * without its number ("With the door code"); several, with theirs ("2 with
 * the door code, and 1 from their email"). A record from before the ways
 * were told apart is counted as one whose way in wasn't recorded. Nobody yet:
 * how they would, or that the event does not let them. An event with no
 * sign-up sends no confirmation email, so there it is the door code alone.
 */
export function themselvesWords(
  counts: Pick<DoorCounts, "themselves" | "themselvesBy">,
  event: Pick<EventDoc, "selfCheckIn" | "noSignup">,
): string {
  if (counts.themselves === 0) {
    if (event.selfCheckIn !== true) return "Self check-in is off for this event";
    return event.noSignup ? "With the door code" : "With the door code, or the link in their email";
  }
  const ways = SELF_WAYS.filter((way) => counts.themselvesBy[way] > 0);
  if (ways.length === 1) return SELF_WAY_ALONE[ways[0]];
  const parts = ways.map((way) => SELF_WAY_COUNTED[way](counts.themselvesBy[way]));
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * Under "at the door list": the walk-ins, who came in at the door too, so
 * the three numbers add up to who came. "Plus the 3 walk-ins", the board's
 * words; once a walk-in checked themselves in (counted under "checked
 * themselves in"), "Plus 2 of the 3 walk-ins" (not drawn: listed in the build
 * notes for the boards' designers to confirm). Null when every walk-in
 * checked themselves in, or there was none.
 */
export function plusWalkInsWords(counts: DoorCounts): string | null {
  const atTheDoor = counts.walkIns - counts.walkInsThemselves;
  if (atTheDoor <= 0) return null;
  return counts.walkInsThemselves > 0
    ? `Plus ${atTheDoor} of the ${counts.walkIns} walk-ins`
    : `Plus the ${plural(counts.walkIns, "walk-in", "walk-ins")}`;
}

/** "10 of 18 here · 2 walk-ins". */
export function hereWords(counts: DoorCounts): { main: string; walkIns: string | null } {
  return {
    main: `${counts.signupsHere} of ${counts.expected} here`,
    walkIns:
      counts.walkIns === 0 ? null : `${counts.walkIns} walk-in${counts.walkIns === 1 ? "" : "s"}`,
  };
}

/** "Door code · 2:18pm". */
export function checkInStamp(checkIn: DoorCheckIn): string {
  return `${HOW_SHORT[checkIn.how]} · ${clockWords(new Date(checkIn.at))}`;
}

/**
 * What the door list says when it cannot take a tick, or null when it can:
 * inside the door's hours once the door is open (`opened`, from `openingOf`),
 * which the event's author or an admin does from the Check-in tab.
 */
export function doorClosedWords(
  phase: CheckInPhase,
  window: { opensAt: Date; closesAt: Date } | null,
  opened: boolean,
): string | null {
  if (phase === "door") return opened ? null : DOOR_NOT_OPEN;
  if (phase === "undated" || !window) return "This event has no date yet, so it has no door list.";
  if (phase === "before") {
    return `The door list opens at ${clockWords(window.opensAt)} on ${dayWords(window.opensAt)}, an hour before the start.`;
  }
  return `The door list closed at ${clockWords(window.closesAt)}, an hour after the end. Add people who came from the event’s page.`;
}

/** What the Check-in tab's "At the door" card says, and whether it offers "Open the door". */
export type AtTheDoorCard = {
  /** Its sentences, in order. */
  lines: string[];
  /** "Open the door", for the event's author and admins until it is open: pressable only inside the door's hours. */
  button: { enabled: boolean } | null;
};

/**
 * The "At the door" card on the event's Check-in tab. The event's author and
 * admins (`canOpen`) are told the door list opens when they open it, and are
 * given the button, held until the door's hours; everybody else reads the
 * door's state in words. Before it is open, the card says who checks people
 * in: the committee alone, or, at an event that lets people check themselves
 * in (`selfCheckIn`), people themselves as well. Once open, everybody reads
 * who opened it and when it closes by itself. `opening` is `openingOf`'s,
 * with the opener's name.
 */
export function atTheDoorWords(input: {
  phase: Exclude<CheckInPhase, "undated">;
  window: { opensAt: Date; closesAt: Date };
  opening: { at: Date; name: string | null; isViewer: boolean } | null;
  canOpen: boolean;
  /** The event's switch, `selfCheckIn`: a stored true and nothing else. */
  selfCheckIn: boolean;
}): AtTheDoorCard {
  const { phase, window, opening, canOpen, selfCheckIn } = input;
  const who = opening ? (opening.isViewer ? "You" : (opening.name ?? "Somebody")) : "";
  const closes = clockWords(window.closesAt);
  if (phase === "later" || phase === "closed") {
    return opening
      ? {
          lines: [
            `${who} opened the door at ${clockWords(opening.at)}.`,
            `It closed by itself at ${closes}, an hour after the end.`,
          ],
          button: null,
        }
      : { lines: [`The door closed at ${closes}, an hour after the end.`], button: null };
  }
  if (opening) {
    return {
      lines: [
        `The door is open. ${who} opened it at ${clockWords(opening.at)}.`,
        `It closes by itself at ${closes}, an hour after the end.`,
      ],
      button: null,
    };
  }
  const from = `${clockWords(window.opensAt)} on ${dayWords(window.opensAt)}`;
  const checksIn = selfCheckIn
    ? "The committee check people in, and people can also check themselves in."
    : "Only the committee check people in.";
  if (canOpen) {
    const intro = `The door list opens when you or an admin open it. ${checksIn}`;
    return phase === "before"
      ? { lines: [intro, `You can open the door from ${from}, an hour before the start.`], button: { enabled: false } }
      : { lines: [intro], button: { enabled: true } };
  }
  const intro = `The door list opens when the event’s author or an admin opens it. ${checksIn}`;
  return {
    lines: [intro, phase === "before" ? `It can be opened from ${from}, an hour before the start.` : "The door isn’t open yet."],
    button: null,
  };
}
