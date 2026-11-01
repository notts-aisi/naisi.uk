/**
 * `eventInvitations/{eventId}__{uid}`: one person invited to one event for
 * chosen people, and how their invitation went.
 *
 * THE LIST IS THESE DOCUMENTS. Publishing an event for chosen people works out
 * who its tags reach (`src/lib/events/invitations.ts`, through the one picker
 * `src/lib/audience/`) and writes one of these for every account it reaches,
 * inside the write that publishes it, so a published event always has its
 * list. "Invite the N new since" on the event's sign-ups writes one for each
 * account the tags reach now that has none. Nothing removes one while the
 * event stands: somebody invited stays invited, and somebody who joins the
 * tags later is invited only when an organiser presses for it.
 *
 * WHAT ONE SAYS. Who (`uid`), to what (`eventId`), when and by whose press
 * (`invitedAt`, `invitedBy`, `via`), and how the email went: `how` is the
 * class it went as (a programme notice, or by the person's events row) and
 * `outcome` is where it got to: `sending` from the claim until the send
 * returns, then `sent`, `failed`, or `not-emailed` with `why` (their settings
 * say no to event announcements, no address the class may use, every address
 * on the suppression list, or they are the event's author, who is never
 * emailed). Being on the list is what shows the event on their Home and lets
 * them open it, whether or not the email went.
 *
 * The id is the pair, so one person is invited to one event once, and a
 * `create` is the claim that stops two presses inviting them twice.
 *
 * SERVER-ONLY in both directions: `firestore.rules` gives no browser any
 * access, an admin's included. Home reads a person's own on the server, by
 * their uid, and the routes read an event's.
 *
 * No `server-only` marker: pages import the types.
 */

export const EVENT_INVITATIONS_COLLECTION = "eventInvitations";

/** One person's invitation to one event. */
export function eventInvitationId(eventId: string, uid: string): string {
  return `${eventId}__${uid}`;
}

/** How the email went as: the two classes an invitation can be (docs/notifications.md). */
export type InvitationHow = "notice" | "grid";

export type InvitationOutcome = "sending" | "sent" | "failed" | "not-emailed";

/** Why somebody on the list was not emailed. */
export type InvitationWhy = "author" | "settings" | "no-address" | "suppressed";

/** Which press put them on the list. */
export type InvitationVia = "publish" | "new-since";

export type EventInvitationDoc = {
  id: string;
  eventId: string;
  uid: string;
  invitedAt: Date | null;
  invitedBy: string;
  via: InvitationVia;
  how: InvitationHow | null;
  outcome: InvitationOutcome;
  why: InvitationWhy | null;
};

type Raw = Record<string, unknown>;

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

const HOWS: readonly InvitationHow[] = ["notice", "grid"];
const OUTCOMES: readonly InvitationOutcome[] = ["sending", "sent", "failed", "not-emailed"];
const WHYS: readonly InvitationWhy[] = ["author", "settings", "no-address", "suppressed"];

export function normalizeEventInvitation(id: string, data: Raw): EventInvitationDoc {
  return {
    id,
    eventId: typeof data.eventId === "string" ? data.eventId : "",
    uid: typeof data.uid === "string" ? data.uid : "",
    invitedAt: tsToDate(data.invitedAt),
    invitedBy: typeof data.invitedBy === "string" ? data.invitedBy : "",
    via: data.via === "new-since" ? "new-since" : "publish",
    how: oneOf(HOWS, data.how) ? data.how : null,
    // A record nobody can read the state of was claimed and not settled: the
    // send may or may not have gone, which is what `sending` says.
    outcome: oneOf(OUTCOMES, data.outcome) ? data.outcome : "sending",
    why: oneOf(WHYS, data.why) ? data.why : null,
  };
}
