import "server-only";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import {
  CHECK_IN_LIMITS,
  EVENT_CHECK_INS_COLLECTION,
  normalizeCheckIn,
  type CheckInHow,
  type EventCheckInDoc,
} from "@/lib/firestore/eventCheckIns";
import type { EventDoc, RsvpDoc } from "@/lib/firestore/events";

/**
 * CHECK-IN: who came to an event, how, and when (`eventCheckIns`, see
 * `src/lib/firestore/eventCheckIns.ts` for the record).
 *
 * THE WINDOWS. The door list, and checking yourself in with the door code,
 * are open from an hour before the event starts to an hour after it ends.
 * After that, somebody who came is added from the event's page, until a week
 * after the event, or until the event's survey closes when that is sooner
 * (`surveyClosesAt`, from `src/lib/surveys/events/records.ts`).
 *
 * WHAT IS KEPT. A walk-in's email goes when the event's survey closes or a
 * week after the event, whichever comes first, and is used for that survey
 * alone; the day is kept on the record (`emailGoesAt`) and moved when the
 * survey's closing day is set or changed, or the survey is closed by hand
 * (`setWalkInEmailDeadlines`). Names come off a year after the event, and at
 * once when an account is deleted; what is left counts the person and names
 * nobody. The `event-check-ins-tidy` job does the first two on their days;
 * `takeCheckInNamesOffForAccount` is the account deletion's step. Not coming
 * is recorded nowhere: there is no "didn't come" record, only sign-ups with
 * no check-in.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The door list opens this long before the start. */
export const DOOR_OPENS_BEFORE_MS = HOUR_MS;
/** And closes this long after the end. */
export const DOOR_CLOSES_AFTER_MS = HOUR_MS;
/** Somebody who came can be added from the event's page until this long after it. */
export const ADD_LATER_FOR_MS = 7 * DAY_MS;

type Timed = Pick<EventDoc, "startAt" | "endAt">;

/** When the event ends: its end, or its start when it has no end. */
export function eventEnds(event: Timed): Date | null {
  return event.endAt ?? event.startAt ?? null;
}

/** When the door list is open. Null for an event with no date. */
export function doorWindow(event: Timed): { opensAt: Date; closesAt: Date } | null {
  if (!event.startAt) return null;
  const ends = eventEnds(event) ?? event.startAt;
  return {
    opensAt: new Date(event.startAt.getTime() - DOOR_OPENS_BEFORE_MS),
    closesAt: new Date(ends.getTime() + DOOR_CLOSES_AFTER_MS),
  };
}

/**
 * Until when somebody who came can be added from the event's page: a week
 * after the event, or when its survey closes if that is sooner.
 */
export function addLaterUntil(event: Timed, surveyClosesAt: Date | null = null): Date | null {
  const ends = eventEnds(event);
  if (!ends) return null;
  const week = new Date(ends.getTime() + ADD_LATER_FOR_MS);
  return surveyClosesAt && surveyClosesAt.getTime() < week.getTime() ? surveyClosesAt : week;
}

/** When a walk-in's email goes: when the event's survey closes or a week after the event, whichever comes first. */
export function walkInEmailGoesAt(event: Timed, surveyClosesAt: Date | null = null): Date | null {
  return addLaterUntil(event, surveyClosesAt);
}

/** When the names come off this event's check-ins: a year after it. */
export function checkInNamesOffAt(event: Timed): Date | null {
  const ends = eventEnds(event);
  if (!ends) return null;
  const at = new Date(ends.getTime());
  at.setUTCFullYear(at.getUTCFullYear() + 1);
  return at;
}

/**
 * Where an event is, for check-in, at `now`:
 *  - `undated`: no date, so no door;
 *  - `before`: the door list is not open yet;
 *  - `door`: the door list and the door code work;
 *  - `later`: closed at the door; people who came can be added from the page;
 *  - `closed`: more than a week after; nothing more is added.
 */
export type CheckInPhase = "undated" | "before" | "door" | "later" | "closed";

export function checkInPhase(event: Timed, now: Date, surveyClosesAt: Date | null = null): CheckInPhase {
  const door = doorWindow(event);
  if (!door) return "undated";
  if (now.getTime() < door.opensAt.getTime()) return "before";
  if (now.getTime() <= door.closesAt.getTime()) return "door";
  const until = addLaterUntil(event, surveyClosesAt);
  if (until && now.getTime() <= until.getTime()) return "later";
  return "closed";
}

/** Only a published event, one that is not cancelled, has a door. */
export function eventTakesCheckIns(event: Pick<EventDoc, "status">): boolean {
  return event.status === "published";
}

/**
 * The sign-ups a door list shows: everybody whose place is confirmed, then the
 * waiting list and the ones not decided yet, whom the people at the door may
 * let in. A cancelled or refused sign-up who comes is a walk-in. Test sign-ups
 * never reach a door list.
 */
export function doorListSignups(rsvps: readonly RsvpDoc[]): RsvpDoc[] {
  return rsvps.filter(
    (row) =>
      !row.synthetic && (row.status === "confirmed" || row.status === "waitlisted" || row.status === "pending"),
  );
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

export async function loadEventCheckIns(db: Firestore, eventId: string): Promise<EventCheckInDoc[]> {
  const snap = await db.collection(EVENT_CHECK_INS_COLLECTION).where("eventId", "==", eventId).get();
  return snap.docs.map((doc) => normalizeCheckIn(doc.id, doc.data() ?? {}));
}

export type CheckInPerson =
  /** A sign-up: the row decides who, and its account when it has one. */
  | { kind: "signup"; rsvp: Pick<RsvpDoc, "id" | "uid" | "eventId"> }
  /** An account with no sign-up, checking themselves in. */
  | { kind: "account"; uid: string; name: string }
  /** Somebody with no account and no sign-up, added at the door or afterwards. */
  | { kind: "walk-in"; name: string; email: string | null };

export type RecordCheckIn = {
  event: Pick<EventDoc, "id" | "startAt" | "endAt">;
  person: CheckInPerson;
  how: CheckInHow;
  /** Who is checking them in. Null when it is themselves. */
  byUid: string | null;
  now: Date;
  /** When the event's survey closes, or null when it has none: a walk-in's email goes no later. */
  surveyClosesAt?: Date | null;
};

/** Whether `existing` is already this person's check-in. A walk-in with no account is never matched. */
function samePerson(existing: EventCheckInDoc, person: CheckInPerson): boolean {
  if (existing.namesOff) return false;
  if (person.kind === "signup") {
    return (
      existing.rsvpId === person.rsvp.id || (person.rsvp.uid !== null && existing.uid === person.rsvp.uid)
    );
  }
  if (person.kind === "account") return existing.uid === person.uid;
  return false;
}

/**
 * Checks one person in. One transaction: the event's check-ins are read
 * first, so somebody already checked in is handed back (`created: false`)
 * rather than counted twice, however many phones press at once.
 */
export async function recordCheckIn(
  db: Firestore,
  input: RecordCheckIn,
): Promise<{ created: boolean; checkIn: EventCheckInDoc }> {
  const { event, person, how, byUid, now, surveyClosesAt = null } = input;
  if (person.kind === "signup" && person.rsvp.eventId !== event.id) {
    throw new Error("That sign-up is for another event.");
  }
  const col = db.collection(EVENT_CHECK_INS_COLLECTION);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(col.where("eventId", "==", event.id));
    for (const doc of existing.docs) {
      const row = normalizeCheckIn(doc.id, doc.data() ?? {});
      if (samePerson(row, person)) return { created: false, checkIn: row };
    }
    const walkIn = person.kind !== "signup";
    const email = person.kind === "walk-in" ? person.email : null;
    const data = {
      eventId: event.id,
      kind: walkIn ? "walk-in" : "signup",
      rsvpId: person.kind === "signup" ? person.rsvp.id : null,
      uid: person.kind === "signup" ? person.rsvp.uid : person.kind === "account" ? person.uid : null,
      name: person.kind === "signup" ? null : person.name.trim().slice(0, CHECK_IN_LIMITS.name),
      email,
      emailGoesAt: email ? walkInEmailGoesAt(event, surveyClosesAt) : null,
      how,
      byUid,
      at: now,
      namesOffAt: checkInNamesOffAt(event),
      namesOff: false,
    };
    const ref = col.doc();
    tx.set(ref, data);
    return { created: true, checkIn: normalizeCheckIn(ref.id, data) };
  });
}

/** Undoes one check-in of this event. Null when there was none to undo. */
export async function removeCheckIn(
  db: Firestore,
  eventId: string,
  checkInId: string,
): Promise<EventCheckInDoc | null> {
  const ref = db.collection(EVENT_CHECK_INS_COLLECTION).doc(checkInId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const row = normalizeCheckIn(snap.id, snap.data() ?? {});
    if (row.eventId !== eventId || row.namesOff) return null;
    tx.delete(ref);
    return row;
  });
}

// ---------------------------------------------------------------------------
// What is kept, and for how long
// ---------------------------------------------------------------------------

/** What a record keeps once its names come off: that one person came, how and when. */
export const NAMES_OFF_FIELDS = {
  rsvpId: null,
  uid: null,
  name: null,
  email: null,
  emailGoesAt: null,
  byUid: null,
  namesOffAt: null,
  namesOff: true,
} as const;

/** What a walk-in's record keeps once its email goes. */
export const EMAIL_GONE_FIELDS = { email: null, emailGoesAt: null } as const;

async function updateAll(
  db: Firestore,
  refs: readonly DocumentReference[],
  fields: Record<string, unknown>,
): Promise<number> {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 400)) batch.update(ref, fields);
    await batch.commit();
  }
  return refs.length;
}

/**
 * The job's two duties on `now`: walk-ins' emails whose day has come are
 * deleted, and check-ins a year old lose their names. One range on one field
 * each, which the automatic index serves; a record leaves each range once it
 * is done, because the date it was found by is cleared with it.
 */
export async function tidyCheckIns(
  db: Firestore,
  now: Date,
): Promise<{ emailsGone: number; namesOff: number }> {
  const col = db.collection(EVENT_CHECK_INS_COLLECTION);
  const emailsDue = await col.where("emailGoesAt", "<=", now).get();
  const emailsGone = await updateAll(
    db,
    emailsDue.docs.map((doc) => doc.ref),
    EMAIL_GONE_FIELDS,
  );
  const namesDue = await col.where("namesOffAt", "<=", now).get();
  const namesOff = await updateAll(
    db,
    namesDue.docs.map((doc) => doc.ref),
    NAMES_OFF_FIELDS,
  );
  return { emailsGone, namesOff };
}

/**
 * The event's survey's closing day was set, changed or reached by hand: each
 * walk-in's email that is still kept now goes when the survey closes or a week
 * after the event, whichever comes first, and at once when that has passed.
 * Answers how many emails it moved and how many it deleted.
 */
export async function setWalkInEmailDeadlines(
  db: Firestore,
  event: Pick<EventDoc, "id" | "startAt" | "endAt">,
  surveyClosesAt: Date | null,
  now: Date,
): Promise<{ moved: number; gone: number }> {
  const goesAt = walkInEmailGoesAt(event, surveyClosesAt);
  const snap = await db.collection(EVENT_CHECK_INS_COLLECTION).where("eventId", "==", event.id).get();
  const keeping = snap.docs.filter((doc) => {
    const row = normalizeCheckIn(doc.id, doc.data() ?? {});
    return row.eventId === event.id && row.email !== null && !row.namesOff;
  });
  if (!goesAt || goesAt.getTime() <= now.getTime()) {
    return { moved: 0, gone: await updateAll(db, keeping.map((doc) => doc.ref), EMAIL_GONE_FIELDS) };
  }
  return { moved: await updateAll(db, keeping.map((doc) => doc.ref), { emailGoesAt: goesAt }), gone: 0 };
}

/** An account deleted: its name comes off every event it came to, at once. The counts stay. */
export async function takeCheckInNamesOffForAccount(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection(EVENT_CHECK_INS_COLLECTION).where("uid", "==", uid).get();
  return updateAll(
    db,
    snap.docs.map((doc) => doc.ref),
    NAMES_OFF_FIELDS,
  );
}

/** An event deleted: its check-ins go with it. */
export async function deleteEventCheckIns(db: Firestore, eventId: string): Promise<number> {
  const snap = await db.collection(EVENT_CHECK_INS_COLLECTION).where("eventId", "==", eventId).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.docs.length;
}
