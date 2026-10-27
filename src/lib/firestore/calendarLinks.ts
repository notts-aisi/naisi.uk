/**
 * `calendarLinks/{uid}`: ONE PRIVATE CALENDAR LINK PER PERSON (Add to
 * calendar, board st-calendar-phone). The secret in the address a calendar
 * app fetches the person's sessions from.
 *
 *   { uid, token, createdAt }
 *
 * One document per person, at their uid. Server-only in both directions:
 * firestore.rules shuts the collection to every browser, its owner's
 * included, and the one writer is the link route on the Admin SDK
 * (`src/lib/courses/calendarLink.ts`), which makes it the first time the
 * person asks and writes a new token over the old one when they replace it.
 * The feed route reads it to find whose sessions a token opens. The document
 * goes with the person's account (`accountDeletion.ts`).
 *
 * The token is kept as it is, so the dialog shows the same link every time it
 * is opened. 32 random bytes, base64url: 43 characters of `A-Z a-z 0-9 _ -`,
 * needing no escaping in a path. It is a secret: never in a log line or an
 * error.
 */

export const CALENDAR_LINKS_COLLECTION = "calendarLinks";

export type CalendarLinkDoc = {
  uid: string;
  token: string;
  /** When this token was made: the link's first making, or its last replacing. */
  createdAt: Date | null;
};

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** Whether a value has the shape of a calendar token. Says nothing of whether it is anybody's. */
export function isCalendarToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

/**
 * A stored link, or null for one that is not whole: a token of the wrong
 * shape, or a document whose `uid` is not its own id. A link that is not
 * whole opens nothing and is made again on its owner's next ask.
 */
export function normalizeCalendarLink(id: string, data: Record<string, unknown>): CalendarLinkDoc | null {
  if (!isCalendarToken(data.token) || data.uid !== id) return null;
  return { uid: id, token: data.token, createdAt: tsToDate(data.createdAt) };
}
