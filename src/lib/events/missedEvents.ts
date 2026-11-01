import "server-only";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { isOver } from "@/features/events/manageWords";
import { isAddressableId } from "@/lib/addressableId";
import { londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { EVENT_CHECK_INS_COLLECTION, normalizeCheckIn, type EventCheckInDoc } from "@/lib/firestore/eventCheckIns";
import { normalizeEvent, normalizeRsvp, type EventDoc, type RsvpDoc } from "@/lib/firestore/events";
import { cameAfter } from "@/lib/legal/courseworkUse";
import { reviewUseFrom } from "@/lib/legal/reviewUse";
import type { PersonEventRow, PersonEventState, PersonEventsView } from "./attendanceWords";
import { openingOf } from "./checkIns";

/**
 * MISSED EVENTS: whether somebody did not come to the last two events they
 * had a place at, and the events an admin sees on their page.
 *
 * The privacy policy (v15, "Attendance") says: "Admins can see which events
 * you signed up for and whether you came. Missing two events in a row that
 * you had a place at may be taken into account when places are decided.
 * Telling us beforehand that you can't make it, or giving your place back
 * before the day, never counts, and the count starts again each academic
 * year." So this file answers two questions, and only for an admin: every
 * caller is behind an admin check (`tests/missed-events.test.mjs` walks the
 * tree for them).
 *
 * AN EVENT COUNTS only when all of these hold (`countedEvents`):
 *
 *  - they held a confirmed place when it started (`heldPlaceAtStart`);
 *  - its door was opened, so check-in was used there (`openingOf`): an event
 *    whose door never opened holds nobody's check-in, and counting it would
 *    make everybody with a place look absent;
 *  - it is over, and it was not cancelled;
 *  - it started in this academic year, which begins on 1 September in London
 *    (`academicYearStart`);
 *  - it started after they agreed to privacy version 15 (`reviewUseFrom`), so
 *    nothing from before they were told counts, and nothing counts for
 *    somebody who has not agreed.
 *
 * Never counted: a place given back (a cancelled sign-up, whenever it was
 * cancelled), a request nobody decided, the waiting list, a test sign-up, a
 * drop-in, and a guest. A guest is never matched to an account: the reads
 * here are by account, and an address typed into a form is never one.
 *
 * THE LINE (`missedTwoInARow`): the two most recent events that count both
 * went by with no check-in for them.
 *
 * "HELD A CONFIRMED PLACE WHEN IT STARTED". A sign-up keeps its status, not
 * when it got there: the cancel route moves the first person on the waiting
 * list up with a bare `status: "confirmed"`, at any hour, after an event as
 * readily as before it. So a sign-up counts when it says confirmed AND
 * nothing has written to it since before the event started, which Firestore
 * says itself (a snapshot's `updateTime`; nothing is stored for this). If
 * nothing touched the row after the start, what it says now is what it said
 * then. Anything that wrote to it later (a move up from the waiting list, a
 * change of answers, a duplicate notice) leaves the event uncounted, which is
 * the side to be wrong on. So does a script that rewrites every sign-up, or
 * an import that writes them all again: every event held before it stops
 * counting, and the count builds up again from the events after it. A new
 * writer of sign-ups that runs after an event starts should know this. A
 * cancelled sign-up keeps when it was cancelled
 * but not what it held, so a place given back after the start cannot be told
 * from a request withdrawn, and it does not count either.
 *
 * NOTHING IS STORED. Both answers are worked out from the sign-ups, the
 * check-ins and the events each time they are asked for. Every read is by
 * one field (`uid`, an equality or an `in`) or by id, so no composite index
 * is owed. This file reads no survey code: nothing said in a survey affects a
 * place.
 */

/** Firestore's cap on the values one `in` filter takes. */
const IN_FILTER_LIMIT = 30;

/** A sign-up as the rules read it: the stored row, and when anything last wrote to it. */
export type SignupRead = Pick<RsvpDoc, "id" | "eventId" | "uid" | "status" | "synthetic" | "createdAt"> & {
  /** When the row was last written (its snapshot's `updateTime`); null when that cannot be told. */
  writtenAt: Date | null;
};

/** The facts of an event the rules read. */
export type EventRead = Pick<
  EventDoc,
  "id" | "title" | "status" | "startAt" | "endAt" | "noSignup" | "doorOpenedAt" | "doorOpenedBy"
>;

/** The facts of a check-in the rules read. */
export type CheckInRead = Pick<EventCheckInDoc, "eventId" | "uid" | "rsvpId" | "namesOff">;

/** Everything the rules read about one person. */
export type Attendance = {
  uid: string;
  /** When they agreed to privacy version 15 (`reviewUseFrom`), or null when they have not. */
  agreedFrom: Date | null;
  signups: readonly SignupRead[];
  checkIns: readonly CheckInRead[];
  /** The events their sign-ups and check-ins are for, by id. */
  events: ReadonlyMap<string, EventRead>;
};

/** One event that counts, and whether they came. */
export type CountedEvent = { event: EventRead; came: boolean };

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/**
 * When the academic year containing `now` began: 1 September, midnight in
 * London. The count starts again then.
 */
export function academicYearStart(now: Date): Date {
  const [year, month] = londonDateKey(now).split("-").map(Number);
  const startYear = month >= 9 ? year : year - 1;
  return londonWallClockToInstant(`${startYear}-09-01`, "00:00");
}

/**
 * Whether this sign-up held a confirmed place when the event started: it
 * says confirmed, it is not a test, and nothing has written to it since
 * before the start (the header says why that is the test).
 */
export function heldPlaceAtStart(signup: SignupRead, event: Pick<EventRead, "startAt">): boolean {
  if (signup.synthetic || signup.status !== "confirmed") return false;
  if (!event.startAt || !signup.writtenAt) return false;
  return signup.writtenAt.getTime() <= event.startAt.getTime();
}

/** Whether they were checked in at this event: by their account, or by one of their sign-ups for it. */
function cameTo(person: Pick<Attendance, "uid" | "checkIns">, eventId: string, signupIds: ReadonlySet<string>): boolean {
  return person.checkIns.some(
    (row) =>
      !row.namesOff &&
      row.eventId === eventId &&
      (row.uid === person.uid || (row.rsvpId !== null && signupIds.has(row.rsvpId))),
  );
}

/** Their own sign-ups, test ones left out, grouped by the event they are for. */
function signupsByEvent(person: Attendance): Map<string, SignupRead[]> {
  const out = new Map<string, SignupRead[]>();
  for (const signup of person.signups) {
    if (signup.uid !== person.uid || signup.synthetic || !signup.eventId) continue;
    out.set(signup.eventId, [...(out.get(signup.eventId) ?? []), signup]);
  }
  return out;
}

/** An event in this academic year: it starts on or after 1 September. */
function inThisYear(event: Pick<EventRead, "startAt">, yearStart: Date): boolean {
  return event.startAt !== null && event.startAt.getTime() >= yearStart.getTime();
}

/** The events that count, newest first, each with whether they came. The rules are in the header. */
export function countedEvents(person: Attendance, now: Date): CountedEvent[] {
  const yearStart = academicYearStart(now);
  const out: CountedEvent[] = [];
  for (const [eventId, signups] of signupsByEvent(person)) {
    const event = person.events.get(eventId);
    if (!event || event.id !== eventId || !event.startAt) continue;
    if (!signups.some((signup) => heldPlaceAtStart(signup, event))) continue;
    if (event.status !== "published" || event.noSignup) continue;
    if (!inThisYear(event, yearStart)) continue;
    if (!cameAfter(event.startAt, person.agreedFrom)) continue;
    if (!isOver(event, now) || openingOf(event) === null) continue;
    out.push({ event, came: cameTo(person, eventId, new Set(signups.map((signup) => signup.id))) });
  }
  return out.sort(
    (a, b) => (b.event.startAt?.getTime() ?? 0) - (a.event.startAt?.getTime() ?? 0) || a.event.id.localeCompare(b.event.id),
  );
}

/** "Didn't come to the last 2 events they had a place at": the two most recent that count both went by without them. */
export function missedTwoInARow(person: Attendance, now: Date): boolean {
  const [last, before] = countedEvents(person, now);
  return Boolean(last && before && !last.came && !before.came);
}

/** The newest of somebody's sign-ups for one event, which says where they stand now. */
function newestOf(signups: readonly SignupRead[]): SignupRead {
  return [...signups].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || b.id.localeCompare(a.id),
  )[0];
}

function stateOf(event: EventRead, signup: SignupRead, now: Date): PersonEventState {
  if (event.status === "cancelled") return "event-cancelled";
  switch (signup.status) {
    case "confirmed":
      if (!isOver(event, now)) return "place";
      return openingOf(event) !== null ? "missed" : "unchecked";
    case "pending":
      return "asked";
    case "waitlisted":
      return "waiting-list";
    case "denied":
      return "turned-down";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * The events on an admin's page about this person: every event of this
 * academic year they signed up for, or came to with no sign-up, newest first,
 * with where they stand. An event with no date yet is listed first while one
 * of their sign-ups for it is live. Only published events and cancelled ones:
 * a sign-up made to test an event that never went out is nobody's history.
 * Nothing at all for somebody who has not agreed to privacy version 15.
 */
export function personEventRows(person: Attendance, now: Date): PersonEventRow[] {
  if (!person.agreedFrom) return [];
  const yearStart = academicYearStart(now);
  const byEvent = signupsByEvent(person);
  const rows: { row: PersonEventRow; at: number }[] = [];
  const listed = (event: EventRead) => event.status === "published" || event.status === "cancelled";

  for (const [eventId, signups] of byEvent) {
    const event = person.events.get(eventId);
    if (!event || !listed(event)) continue;
    const newest = newestOf(signups);
    const live = signups.some((signup) => signup.status === "pending" || signup.status === "confirmed" || signup.status === "waitlisted");
    if (event.startAt ? !inThisYear(event, yearStart) : !live) continue;
    const came = cameTo(person, eventId, new Set(signups.map((signup) => signup.id)));
    rows.push({
      row: {
        eventId,
        title: event.title,
        startAt: event.startAt ? event.startAt.toISOString() : null,
        state: came ? "came" : stateOf(event, newest, now),
      },
      at: event.startAt?.getTime() ?? Number.POSITIVE_INFINITY,
    });
  }

  // Came with no sign-up: an account checked in at a drop-in, or at the door.
  const cameWithout = new Set(
    person.checkIns
      .filter((row) => !row.namesOff && row.uid === person.uid && !byEvent.has(row.eventId))
      .map((row) => row.eventId),
  );
  for (const eventId of cameWithout) {
    const event = person.events.get(eventId);
    if (!event || !listed(event) || !inThisYear(event, yearStart)) continue;
    rows.push({
      row: { eventId, title: event.title, startAt: event.startAt?.toISOString() ?? null, state: "came" },
      at: event.startAt?.getTime() ?? Number.POSITIVE_INFINITY,
    });
  }

  return rows.sort((a, b) => b.at - a.at || a.row.eventId.localeCompare(b.row.eventId)).map(({ row }) => row);
}

/** What the person's page is sent: the line, the year's events and when they agreed. */
export function personEventsView(person: Attendance, now: Date): PersonEventsView {
  return {
    agreedAt: person.agreedFrom ? person.agreedFrom.toISOString() : null,
    missed: missedTwoInARow(person, now),
    events: personEventRows(person, now),
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** When a snapshot says its document was last written, or null. */
function writtenAtOf(snap: QueryDocumentSnapshot): Date | null {
  const at = typeof snap.updateTime?.toDate === "function" ? snap.updateTime.toDate() : null;
  return at instanceof Date && !Number.isNaN(at.getTime()) ? at : null;
}

/** Splits a list into Firestore's `in` sized pieces. */
function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_FILTER_LIMIT) out.push(items.slice(i, i + IN_FILTER_LIMIT));
  return out;
}

/**
 * Everything the rules read about these people, by uid. A uid with no
 * account is left out. Their sign-ups and check-ins are read by `uid`, and
 * the events those name by id: one person's own rows, never anybody else's.
 */
async function readAttendance(db: Firestore, uids: readonly string[]): Promise<Map<string, Attendance>> {
  const wanted = [...new Set(uids.filter((uid) => typeof uid === "string" && isAddressableId(uid)))];
  const out = new Map<string, Attendance>();
  if (wanted.length === 0) return out;

  const pieces = chunks(wanted);
  const [accounts, signupSnaps, checkInSnaps] = await Promise.all([
    db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))),
    Promise.all(pieces.map((piece) => db.collection("eventRsvps").where("uid", "in", piece).get())),
    Promise.all(pieces.map((piece) => db.collection(EVENT_CHECK_INS_COLLECTION).where("uid", "in", piece).get())),
  ]);

  const signups: SignupRead[] = signupSnaps
    .flatMap((snap) => snap.docs)
    .map((doc) => {
      const row = normalizeRsvp(doc.id, doc.data() ?? {});
      return {
        id: row.id,
        eventId: row.eventId,
        uid: row.uid,
        status: row.status,
        synthetic: row.synthetic,
        createdAt: row.createdAt,
        writtenAt: writtenAtOf(doc),
      };
    });
  const checkIns: CheckInRead[] = checkInSnaps
    .flatMap((snap) => snap.docs)
    .map((doc) => {
      const row = normalizeCheckIn(doc.id, doc.data() ?? {});
      return { eventId: row.eventId, uid: row.uid, rsvpId: row.rsvpId, namesOff: row.namesOff };
    });

  const eventIds = [
    ...new Set([...signups.map((row) => row.eventId), ...checkIns.map((row) => row.eventId)].filter(isAddressableId)),
  ];
  const events = new Map<string, EventRead>();
  if (eventIds.length > 0) {
    const snaps = await db.getAll(...eventIds.map((id) => db.collection("events").doc(id)));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const event = normalizeEvent(snap.id, snap.data() ?? {});
      events.set(event.id, {
        id: event.id,
        title: event.title,
        status: event.status,
        startAt: event.startAt,
        endAt: event.endAt,
        noSignup: event.noSignup,
        doorOpenedAt: event.doorOpenedAt,
        doorOpenedBy: event.doorOpenedBy,
      });
    }
  }

  accounts.forEach((account, i) => {
    if (!account.exists) return;
    const uid = wanted[i];
    out.set(uid, {
      uid,
      agreedFrom: reviewUseFrom(account.data() ?? null),
      signups: signups.filter((row) => row.uid === uid),
      checkIns: checkIns.filter((row) => row.uid === uid),
      events,
    });
  });
  return out;
}

/**
 * THE LINE BESIDE A REQUEST, for an admin alone: of these people, the ones
 * whose two most recent events that count both went by without them.
 */
export async function missedEventsOf(db: Firestore, uids: readonly string[], now: Date): Promise<Set<string>> {
  const people = await readAttendance(db, uids);
  return new Set([...people.values()].filter((person) => missedTwoInARow(person, now)).map((person) => person.uid));
}

/**
 * THE EVENTS CARD on an admin's page about one person: the line, and this
 * academic year's events with whether they came. Null when there is no
 * account here.
 */
export async function eventsOfPerson(db: Firestore, uid: string, now: Date): Promise<PersonEventsView | null> {
  const person = (await readAttendance(db, [uid])).get(uid);
  return person ? personEventsView(person, now) : null;
}
