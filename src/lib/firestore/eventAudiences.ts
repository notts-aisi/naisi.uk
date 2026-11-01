/**
 * `eventAudiences/{eventId}`: who an event for chosen people is for, as its
 * organiser chose it.
 *
 * A CHOICE, NEVER A LIST. What is kept is the selection "Who is this for?"
 * hands over (`src/lib/audience/`): the tags whose people are included and
 * the tags whose people are left out, people named one by one among them as
 * `person:` tags. Who that is is worked out from the records each time it is
 * read, by the same resolver the picker counts with, so somebody who joins a
 * group tomorrow is in its tag tomorrow, and "Invite the N new since" can
 * find them. The people actually invited are `eventInvitations`, written when
 * the event is published.
 *
 * `setBy` is who chose it, and the selection is resolved in their world: the
 * tags are the ones THEY may use (a programme's lead, that programme's tags),
 * so publishing, which an approver presses, invites exactly the people the
 * organiser chose and counted, and never the approver's own tags. `setAt` is
 * when. Which programme the event is part of is on the event itself
 * (`events/{id}.programme`), written by the same route.
 *
 * SERVER-ONLY in both directions: `firestore.rules` gives no browser any
 * access, an admin's included. `/api/events/[id]/audience` writes it and
 * reads it back.
 *
 * No `server-only` marker: pages import the types.
 */

export const EVENT_AUDIENCES_COLLECTION = "eventAudiences";

export type EventAudienceDoc = {
  eventId: string;
  include: string[];
  exclude: string[];
  setBy: string;
  setAt: Date | null;
};

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((each): each is string => typeof each === "string") : [];

/**
 * The stored choice. The tags are handed on as they are stored; the picker's
 * own parser reads each one again before anybody is resolved, and refuses the
 * whole selection over one it cannot read.
 */
export function normalizeEventAudience(eventId: string, data: Raw): EventAudienceDoc {
  return {
    eventId,
    include: stringList(data.include),
    exclude: stringList(data.exclude),
    setBy: typeof data.setBy === "string" ? data.setBy : "",
    setAt: tsToDate(data.setAt),
  };
}
