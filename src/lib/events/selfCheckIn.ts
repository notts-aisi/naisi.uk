import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { clockWords, dayWords, timeRangeWords } from "@/features/events/manageWords";
import { publicLocationLine } from "@/lib/events/location";
import { verifyRsvpToken } from "@/lib/events/rsvpToken";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeRsvp, type EventDoc, type RsvpStatus } from "@/lib/firestore/events";
import type { EventCheckInDoc } from "@/lib/firestore/eventCheckIns";
import { checkInPhase, doorWindow, loadEventCheckIns, type CheckInPerson } from "./checkIns";

/**
 * CHECKING YOURSELF IN with the code at the door (ev-self-phone), decided in
 * one place for the page (`/events/<id>/check-in`) and its route, so the two
 * never disagree about who may press "I'm here".
 *
 *  - SIGNED IN, with a confirmed sign-up: checked in as that sign-up.
 *  - SIGNED IN, with no sign-up (or a cancelled one): checked in as a walk-in,
 *    with the account. Nobody else's details are needed.
 *  - SIGNED IN, on the waiting list, not decided yet, or refused: not by
 *    themselves. The people at the door decide, so the page says to give
 *    their name there.
 *  - A GUEST with no account, through the link in their own confirmation
 *    email: the sign-up's id and the token signed for it and its address.
 *  - SIGNED OUT, with no link: asked to sign in. The page is a public address,
 *    so it names nobody, and says nothing about who signed up.
 *
 * Only while the door is open: an hour before the start to an hour after the
 * end. A scan of the door code is counted as every scan is (the beacon on the
 * page it lands on); nothing about the person is kept beyond the check-in.
 */

/** The event as the check-in page prints it: its name and the public facts of when and where. */
export type EventLine = { id: string; title: string; line: string };

export function eventLine(event: EventDoc): EventLine {
  const title = event.title.trim() || "NAISI event";
  const when = event.startAt
    ? `${dayWords(event.startAt)} · ${timeRangeWords(event.startAt, event.endAt)}`
    : "Date to be confirmed";
  return { id: event.id, title, line: [title, when, publicLocationLine(event)].join(" · ") };
}

export type SelfDecision =
  | { kind: "person"; person: CheckInPerson; firstName: string; asWalkIn: boolean; viaLink: boolean }
  | { kind: "at-the-door"; firstName: string; words: string }
  | { kind: "bad-link" }
  | { kind: "sign-in" };

/** Who the presser is, for this event: a sign-up, an account walking in, or somebody the door decides about. */
export async function decideSelf(
  db: Firestore,
  input: { event: EventDoc; user: SessionUser | null; rsvpId: string | null; token: string | null },
): Promise<SelfDecision> {
  const { event, user, rsvpId, token } = input;

  if (rsvpId && token) {
    const snap = await db.collection("eventRsvps").doc(rsvpId).get();
    const rsvp = snap.exists ? normalizeRsvp(snap.id, snap.data() ?? {}) : null;
    if (!rsvp || rsvp.eventId !== event.id || rsvp.synthetic || !verifyRsvpToken(rsvp.id, rsvp.email, token)) {
      return { kind: "bad-link" };
    }
    const firstName = firstNameOf(rsvp.name);
    if (rsvp.status === "confirmed") {
      return { kind: "person", person: { kind: "signup", rsvp }, firstName, asWalkIn: false, viaLink: true };
    }
    return { kind: "at-the-door", firstName, words: atTheDoorWords(rsvp.status) };
  }

  if (!user) return { kind: "sign-in" };
  const firstName = firstNameOf(user.displayName ?? "");
  if (user.role === "rejected") {
    return { kind: "at-the-door", firstName, words: "Give your name at the door, and they’ll check you in." };
  }

  const rows = await db.collection("eventRsvps").where("eventId", "==", event.id).get();
  const mine = rows.docs
    .map((doc) => normalizeRsvp(doc.id, doc.data() ?? {}))
    .filter((row) => row.uid === user.uid && !row.synthetic)
    .sort((a, b) => STANDING_ORDER[a.status] - STANDING_ORDER[b.status])[0];

  if (mine && mine.status === "confirmed") {
    return { kind: "person", person: { kind: "signup", rsvp: mine }, firstName, asWalkIn: false, viaLink: false };
  }
  if (mine && mine.status !== "cancelled") {
    return { kind: "at-the-door", firstName, words: atTheDoorWords(mine.status) };
  }
  const name = (user.displayName ?? "").trim() || user.email || "A member";
  return {
    kind: "person",
    person: { kind: "account", uid: user.uid, name },
    firstName,
    asWalkIn: true,
    viaLink: false,
  };
}

// The sign-up that speaks for a person who has more than one: a live one first.
const STANDING_ORDER: Record<RsvpStatus, number> = {
  confirmed: 0,
  waitlisted: 1,
  pending: 2,
  denied: 3,
  cancelled: 4,
};

function atTheDoorWords(status: RsvpStatus): string {
  if (status === "waitlisted") {
    return "You’re on the waiting list for this. Give your name at the door, and they’ll check you in if there’s room.";
  }
  if (status === "pending") {
    return "Your sign-up hasn’t been confirmed yet. Give your name at the door, and they’ll check you in.";
  }
  return "Give your name at the door, and they’ll check you in.";
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** The person's own check-in at this event, if they have one already. */
export function ownCheckIn(checkIns: readonly EventCheckInDoc[], person: CheckInPerson): EventCheckInDoc | null {
  for (const row of checkIns) {
    if (row.namesOff) continue;
    if (person.kind === "signup") {
      if (row.rsvpId === person.rsvp.id || (person.rsvp.uid !== null && row.uid === person.rsvp.uid)) return row;
    } else if (person.kind === "account" && row.uid === person.uid) {
      return row;
    }
  }
  return null;
}

/** Why the door code cannot check anybody in right now, or null while the door is open. */
export function selfClosedWords(event: EventDoc, now: Date): string | null {
  const phase = checkInPhase(event, now);
  if (phase === "door") return null;
  const window = doorWindow(event);
  if (phase === "undated" || !window) return "This event has no date yet, so there’s nothing to check in to.";
  if (phase === "before") {
    return `Check-in opens at ${clockWords(window.opensAt)} on ${dayWords(window.opensAt)}, an hour before the start.`;
  }
  return "Check-in at the door has closed.";
}

/** Everything the page needs, read once: the decision and, when it is a person, whether they are already in. */
export async function selfCheckInView(
  db: Firestore,
  input: { event: EventDoc; user: SessionUser | null; rsvpId: string | null; token: string | null },
): Promise<{ decision: SelfDecision; already: EventCheckInDoc | null }> {
  const decision = await decideSelf(db, input);
  if (decision.kind !== "person") return { decision, already: null };
  const checkIns = await loadEventCheckIns(db, input.event.id);
  return { decision, already: ownCheckIn(checkIns, decision.person) };
}

/** The sign-up the link in a confirmation email is for, as the check-in page's address carries it. */
export function linkParams(raw: Record<string, string | string[] | undefined>): {
  rsvpId: string | null;
  token: string | null;
} {
  const r = typeof raw.r === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(raw.r) ? raw.r : null;
  const t = typeof raw.t === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(raw.t) ? raw.t : null;
  return r && t ? { rsvpId: r, token: t } : { rsvpId: null, token: null };
}

