import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { namesOffOf, type NamesOff } from "@/lib/events/checkInView";
import { loadEventCheckIns } from "@/lib/events/checkIns";
import { normalizeEvent, normalizeRsvp, type EventDoc, type RsvpDoc } from "@/lib/firestore/events";
import type { EventAudience, EventRespondent } from "@/lib/firestore/surveys";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";

/**
 * WHO A SURVEY AFTER AN EVENT CAN REACH, read fresh each time a button is
 * drawn or pressed, never stored as a list: the people rows record who was
 * SENT it (or answered it at the event), and the difference is "who came
 * since".
 *
 *  - THE PEOPLE WHO CAME (`event-came`): every check-in the event still holds
 *    with a name. A sign-up who was checked in is the sign-up's account, or
 *    the guest by their sign-up when it has none; an account that walked in is
 *    that account; a walk-in with no account is the check-in the door made,
 *    and can be emailed only when they left an address for this survey.
 *  - EVERYBODY WHO SIGNED UP (`event-signups`): every confirmed sign-up, never
 *    a test one. A sign-up on the waiting list, not decided, cancelled or
 *    refused is nobody's until they come.
 *
 * Never anybody who did neither: nothing here reads an account that is not
 * on the event's sign-ups or check-ins. One person is one member however
 * many ways they came (`key`). An account's email goes to its address on the
 * account, as every survey's does; a guest's to the address they gave the
 * event.
 *
 * Reads only. The routes and pages that call it are admins' alone, except
 * the answer page, which asks it about the signed-in person's own place.
 */

export type EventAudienceMember = {
  /** "a:<uid>" or "g:<signupId>": one per person, whichever way they came. */
  key: string;
  respondent: EventRespondent;
  /** Their whole name: the account's, or the one on the sign-up or given at the door. */
  name: string;
  /** Where the survey's email goes, or null for a walk-in who left none. Never drawn on a page. */
  address: string | null;
  /** Their sign-up for the event is confirmed. */
  signedUp: boolean;
  /** They came: the event holds a check-in for them. */
  came: boolean;
  /** They came by a sign-up (of any standing), rather than walking in. */
  cameBySignup: boolean;
};

export type EventAudienceRead = {
  event: EventDoc;
  /** Everybody who came or whose sign-up is confirmed, once each, by name. */
  people: EventAudienceMember[];
  /**
   * The check-ins whose names have come off, as counts: people who came whom
   * no survey can reach, and whom the Check-in tab still counts.
   */
  namesOff: NamesOff;
};

/** One person's key, whichever kind they are. */
export function respondentKey(respondent: EventRespondent): string {
  return respondent.kind === "account" ? `a:${respondent.uid}` : `g:${respondent.signupId}`;
}

/** The people one of the two audiences holds. */
export function membersOf(read: EventAudienceRead, kind: EventAudience["kind"]): EventAudienceMember[] {
  return read.people.filter((member) => (kind === "event-came" ? member.came : member.signedUp));
}

const safeId = (id: string) => id.length > 0 && !id.includes("/");

/**
 * Whether an account may answer the event's survey signed in, with its QR
 * code: its sign-up was confirmed, or it came. Read for that account alone.
 */
export async function mayAnswerSignedIn(db: Firestore, eventId: string, uid: string): Promise<boolean> {
  const read = await readEventAudience(db, eventId);
  const member = read?.people.find((each) => each.key === respondentKey({ kind: "account", uid }));
  return member !== undefined && (member.signedUp || member.came);
}

/**
 * Everybody an event's survey can be for, read from the event's records. An
 * account is named as `viewer` is shown people (the names rule,
 * `nameForViewer`): an admin's survey screens pass the admin, and anything
 * that reaches the people themselves passes nobody and is given the name
 * they go by.
 */
export async function readEventAudience(db: Firestore, eventId: string, viewer: NameViewer = null): Promise<EventAudienceRead | null> {
  if (!safeId(eventId)) return null;
  const snap = await db.collection("events").doc(eventId).get();
  if (!snap.exists) return null;
  const event = normalizeEvent(snap.id, snap.data() ?? {});
  const [rsvpSnap, checkIns] = await Promise.all([
    db.collection("eventRsvps").where("eventId", "==", eventId).get(),
    loadEventCheckIns(db, eventId),
  ]);
  const rsvps = rsvpSnap.docs
    .map((doc) => normalizeRsvp(doc.id, doc.data() ?? {}))
    .filter((row) => row.eventId === eventId && !row.synthetic);
  const rsvpById = new Map(rsvps.map((row) => [row.id, row]));

  type Draft = Omit<EventAudienceMember, "name" | "address"> & { guestName: string; guestAddress: string | null };
  const drafts = new Map<string, Draft>();
  const add = (respondent: EventRespondent, facts: Partial<Draft>) => {
    const key = respondentKey(respondent);
    const was = drafts.get(key);
    drafts.set(key, {
      key,
      respondent,
      signedUp: (was?.signedUp ?? false) || facts.signedUp === true,
      came: (was?.came ?? false) || facts.came === true,
      cameBySignup: (was?.cameBySignup ?? false) || facts.cameBySignup === true,
      guestName: was?.guestName || facts.guestName || "",
      guestAddress: was?.guestAddress ?? facts.guestAddress ?? null,
    });
  };
  const fromSignup = (row: RsvpDoc): EventRespondent => (row.uid ? { kind: "account", uid: row.uid } : { kind: "guest", signupId: row.id });

  for (const row of rsvps) {
    if (row.status !== "confirmed") continue;
    add(fromSignup(row), { signedUp: true, guestName: row.name.trim(), guestAddress: row.email.trim() || null });
  }
  for (const checkIn of checkIns) {
    if (checkIn.namesOff || checkIn.eventId !== eventId) continue;
    if (checkIn.kind === "signup") {
      const row = checkIn.rsvpId ? rsvpById.get(checkIn.rsvpId) : undefined;
      if (row) {
        add(fromSignup(row), { came: true, cameBySignup: true, guestName: row.name.trim(), guestAddress: row.email.trim() || null });
      } else if (checkIn.uid) {
        add({ kind: "account", uid: checkIn.uid }, { came: true, cameBySignup: true });
      }
      continue;
    }
    if (checkIn.uid) {
      add({ kind: "account", uid: checkIn.uid }, { came: true });
    } else {
      add({ kind: "guest", signupId: checkIn.id }, { came: true, guestName: checkIn.name ?? "", guestAddress: checkIn.email });
    }
  }

  // Accounts: their name, by the names rule for the viewer, and their
  // account's address. An account that is no longer there is nobody this
  // survey can reach.
  const uids = [...drafts.values()].flatMap((draft) => (draft.respondent.kind === "account" ? [draft.respondent.uid] : [])).filter(safeId);
  const accounts = new Map<string, { name: string; address: string | null }>();
  for (let i = 0; i < uids.length; i += 100) {
    const docs = await db.getAll(...uids.slice(i, i + 100).map((uid) => db.collection("users").doc(uid)));
    for (const doc of docs) {
      if (!doc.exists) continue;
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const address = typeof data.email === "string" ? data.email.trim() : "";
      accounts.set(doc.id, { name: nameForViewer(viewer, accountNamesOf(data), "NAISI member"), address: address || null });
    }
  }

  const people: EventAudienceMember[] = [];
  for (const draft of drafts.values()) {
    const { guestName, guestAddress, ...member } = draft;
    if (member.respondent.kind === "account") {
      const account = accounts.get(member.respondent.uid);
      if (!account) continue;
      people.push({ ...member, name: account.name, address: account.address });
    } else {
      people.push({ ...member, name: guestName || "No name given", address: guestAddress });
    }
  }
  people.sort((a, b) => a.name.localeCompare(b.name, "en") || a.key.localeCompare(b.key));
  return { event, people, namesOff: namesOffOf(checkIns.filter((checkIn) => checkIn.eventId === eventId)) };
}
