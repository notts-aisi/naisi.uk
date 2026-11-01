/**
 * `eventCheckIns/{autoId}`: one person who came to one event.
 *
 * WHO. A sign-up (by its `rsvpId`, with the account's `uid` when it has one),
 * an account with no sign-up (`uid`, and the account's name as it was), or a
 * walk-in with no account (the `name` they gave, and an `email` only if they
 * want that event's survey). One record per person per event: the routes make
 * it in a transaction that reads the event's records first.
 *
 * HOW AND WHEN. `how` is the way they were checked in, each recorded as
 * itself. By somebody who runs check-in: `door` on the door list, `page` added
 * from the event's page afterwards. By themselves, at an event that lets
 * people check themselves in: `code` on the page the door code opened, `email`
 * with the link in their confirmation email, `site` on the check-in page while
 * signed in, neither. A record from before the ways were told apart says `qr`
 * whichever way it was: it is read back as somebody who checked themselves
 * in, the way not recorded, and never written again. `byUid` is who checked
 * them in, null when it was themselves. `at` is when.
 *
 * WHAT IS KEPT, AND FOR HOW LONG. A walk-in's email goes at `emailGoesAt`: a
 * week after the event (sooner, when the event's survey closes sooner, once
 * event surveys exist). Every name comes off at `namesOffAt`, a year after the
 * event, and at once when the account is deleted: `rsvpId`, `uid`, `name`,
 * `email` and `byUid` go, `namesOff` is set, and what is left counts one
 * person who came. A random id, so nothing in the id names anybody either.
 *
 * SERVER-ONLY in both directions: no browser reads or writes these, an
 * admin's included. Every write is a route on the Admin SDK and every read a
 * server page or route, behind `runsCheckIn` for anything with a name in it.
 *
 * No `server-only` marker: pages import the types.
 */

export const EVENT_CHECK_INS_COLLECTION = "eventCheckIns";

export type CheckInKind = "signup" | "walk-in";

/** The ways somebody checks themselves in, as a record says them. `qr` is the one way of a record from before the others. */
export const SELF_WAYS = ["code", "email", "site", "qr"] as const;
export type SelfWay = (typeof SELF_WAYS)[number];

/** Every way a record can say somebody was checked in: themselves, or by the people at the door. */
export const CHECK_IN_HOWS = [...SELF_WAYS, "door", "page"] as const;
export type CheckInHow = (typeof CHECK_IN_HOWS)[number];

/** The ways a check-in is written today: every way but the old `qr`, which is only ever read. */
export type RecordedHow = Exclude<CheckInHow, "qr">;

/** Whether a record's way is somebody checking themselves in. */
export function checkedThemselvesIn(how: CheckInHow): how is SelfWay {
  return (SELF_WAYS as readonly string[]).includes(how);
}

export const CHECK_IN_LIMITS = { name: 80, email: 120 } as const;

export type EventCheckInDoc = {
  id: string;
  eventId: string;
  kind: CheckInKind;
  /** The sign-up this person came by. Null for a walk-in, and once names come off. */
  rsvpId: string | null;
  /** Their account, when they have one. Null for a guest, and once names come off. */
  uid: string | null;
  /** A walk-in's name, as given or as their account had it. Null for a sign-up (its row holds the name). */
  name: string | null;
  /** A walk-in's email, only for that event's survey. */
  email: string | null;
  /** When the walk-in's email goes. Null when there is none. */
  emailGoesAt: Date | null;
  how: CheckInHow;
  /** Who checked them in. Null when they checked themselves in. */
  byUid: string | null;
  at: Date | null;
  /** When the names come off. Null once they have. */
  namesOffAt: Date | null;
  /** True once the names have come off: the record is a count and nothing more. */
  namesOff: boolean;
};

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}

function strOrNull(v: unknown, max: number): string | null {
  return typeof v === "string" && v !== "" ? v.slice(0, max) : null;
}

export function normalizeCheckIn(id: string, data: Raw): EventCheckInDoc {
  // A way this file does not know reads as the door list, as a record with none always has.
  const how = (CHECK_IN_HOWS as readonly unknown[]).includes(data.how) ? (data.how as CheckInHow) : "door";
  return {
    id,
    eventId: typeof data.eventId === "string" ? data.eventId : "",
    kind: data.kind === "walk-in" ? "walk-in" : "signup",
    rsvpId: strOrNull(data.rsvpId, 128),
    uid: strOrNull(data.uid, 128),
    name: strOrNull(data.name, CHECK_IN_LIMITS.name),
    email: strOrNull(data.email, CHECK_IN_LIMITS.email),
    emailGoesAt: tsToDate(data.emailGoesAt),
    how,
    byUid: strOrNull(data.byUid, 128),
    at: tsToDate(data.at),
    namesOffAt: tsToDate(data.namesOffAt),
    namesOff: data.namesOff === true,
  };
}
