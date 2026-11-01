import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import EventInvitationEmail, { invitationSubject } from "@/emails/EventInvitationEmail";
import { loadAudienceWorld, resolveAudience } from "@/lib/audience/load";
import type { Reached } from "@/lib/audience/resolve";
import { programmeKey } from "@/lib/audience/scope";
import { parseSelection } from "@/lib/audience/tags";
import { standingUserOf } from "@/lib/courses/programmeLead";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import { DAY_MS, HOUR_MS, NOTICES_PER_DAY, NOTICES_PER_HOUR, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import { sendEmail } from "@/lib/email/send";
import { EVENT_AUDIENCES_COLLECTION, normalizeEventAudience, type EventAudienceDoc } from "@/lib/firestore/eventAudiences";
import {
  EVENT_INVITATIONS_COLLECTION,
  eventInvitationId,
  type InvitationHow,
  type InvitationVia,
  type InvitationWhy,
} from "@/lib/firestore/eventInvitations";
import type { EventDoc } from "@/lib/firestore/events";
import type { SessionUser } from "@/lib/firebase/session";
import { goByNameOf } from "@/lib/names/staffName";
import { signToken } from "@/lib/signedTokens";
import { formatEventWhen } from "./changeSummary";
import type { InvitationCount } from "./inviteWords";
import { publicLocationLine } from "./location";
import { isForChosenPeople } from "./reach";
import { baseUrl } from "./rsvpToken";

/**
 * AN EVENT FOR CHOSEN PEOPLE: WHO IS INVITED, AND THEIR INVITATIONS.
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * The organiser chose tags in "Who is this for?" (`src/lib/audience/`), and
 * the choice is kept, never a list (`eventAudiences`). Who it is is worked
 * out here by the picker's one resolver, `resolveAudience`, in the world of
 * the person who CHOSE it (`setBy`): their tags, held to their standing, so
 * publishing (an approver's press) and "Invite the N new since" invite exactly
 * the people the organiser counted, and a choice whose maker can no longer
 * use its tags invites nobody and says so.
 *
 * Invited are the ACCOUNTS it reaches. A guest who signed up for another event
 * without an account, and a walk-in, have no Home to show it on and could not
 * open it, so they are never invited; somebody who left a group whose tag is
 * chosen is listed as having left and is not invited either. Both are counted,
 * so the editor can say why its number is smaller than the picker's.
 *
 * ── HOW EACH ONE IS EMAILED ─────────────────────────────────────────────────
 * The privacy policy: "they show on your Home, and we email you an invitation.
 * If an event is part of a programme you are on, its invitation is a programme
 * email and reaches you whatever your settings." So:
 *
 *  - PART OF A PROGRAMME, and they hold a place on it: a programme NOTICE
 *    (surface `event-invitation`), whatever their settings, with the marker,
 *    to the account's own address (else a university address it verified).
 *  - EVERYBODY ELSE: by their EVENTS ROW, the one the announcement reads, with
 *    the events channel's unsubscribe link. Somebody who said no to event
 *    announcements is still invited (it is on their Home) and is not emailed.
 *  - THE EVENT'S AUTHOR is never emailed: they made it.
 *  - NO PUSH. The policy says email, and only email is sent.
 *
 * Every number the editor and the Publish confirm show is `planInvitations`'
 * count, and the send walks the same plan, so the number on a button is the
 * number sent.
 *
 * ── ONCE EACH, AND NEVER HALF ───────────────────────────────────────────────
 * The list is `eventInvitations/{eventId}__{uid}`, one document a person, and
 * its creation is the claim: publishing writes the whole list inside the
 * write that publishes, and "Invite the N new since" creates each new one
 * with `create`, which a second press cannot repeat. A person's email is
 * sent once their document exists, and its outcome is written back to it.
 * A press over {@link MAX_INVITATION_PEOPLE} people or
 * {@link MAX_INVITATION_SENDS} messages is REFUSED whole, never trimmed: an
 * arbitrary part of the list invited, reported as done, is the one failure a
 * retry cannot mend.
 */

/** People one press may add to the list: the transaction that publishes writes one document each, under Firestore's 500. */
export const MAX_INVITATION_PEOPLE = 300;

/**
 * Messages one press may send, counted on addresses (somebody reached by
 * their settings with two verified addresses takes two). The arithmetic is
 * the announcement's, in `src/lib/email/dispatch.ts`: 200 messages finish
 * inside the request's budget even on a bad day.
 */
export const MAX_INVITATION_SENDS = 200;

/** Same lifetime the announcement gives its unsubscribe links. */
const UNSUB_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

/** One account a press would put on the list, and how its email would go. */
export type Invitee = {
  uid: string;
  /** The name they go by, for the greeting, or "there". */
  greeting: string;
  how: InvitationHow;
  /** Where the email goes. Empty when they are not emailed, and `why` says why. */
  addresses: string[];
  why: InvitationWhy | null;
};

export type { InvitationCount };

export type InvitationPlan = { invitees: Invitee[]; count: InvitationCount };

export type PlanAnswer = { ok: true; plan: InvitationPlan } | { ok: false; status: number; error: string };

export const INVITATION_WORDS = {
  stale:
    "Who it’s for was chosen with tags its chooser can no longer use, so nobody can be invited. Choose who it’s for again.",
  nobody: "Choose who it’s for before it’s published: nobody would be invited.",
  notChosen: "This event is not for chosen people, so it has no invitations.",
  changed: "Who this event is for changed while you were publishing it. Look again, then publish.",
  overPeople: (n: number) =>
    `This would invite ${n} people, over the ${MAX_INVITATION_PEOPLE} one press can invite. Nothing was sent: choose fewer people, or ask an admin.`,
  overSends: (n: number) =>
    `This would send ${n} emails, over the ${MAX_INVITATION_SENDS} one press can send. Nothing was sent: choose fewer people, or ask an admin.`,
} as const;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The choice stored for an event, or null when none has been made. */
export async function readEventAudience(db: Firestore, eventId: string): Promise<EventAudienceDoc | null> {
  const snap = await db.collection(EVENT_AUDIENCES_COLLECTION).doc(eventId).get();
  return snap.exists ? normalizeEventAudience(eventId, snap.data() ?? {}) : null;
}

/** Everybody already on an event's list, by uid: one equality on `eventId`. */
export async function invitedAlreadyTo(db: Firestore, eventId: string): Promise<Set<string>> {
  const snap = await db.collection(EVENT_INVITATIONS_COLLECTION).where("eventId", "==", eventId).get();
  const out = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    if (data.eventId === eventId && typeof data.uid === "string" && doc.id === eventInvitationId(eventId, data.uid)) {
      out.add(data.uid);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

const emptyCount = (home: number): InvitationCount => ({
  home,
  adding: 0,
  emails: 0,
  notices: 0,
  bySettings: 0,
  messages: 0,
  notEmailed: { author: 0, settings: 0, noAddress: 0, suppressed: 0 },
  noAccount: 0,
  left: 0,
  overCeiling: false,
});

/** The chooser as a session: the one handed in, or the account a stored choice names, as it stands. */
async function chooserOf(db: Firestore, chooser: SessionUser | string): Promise<SessionUser | null> {
  if (typeof chooser !== "string") return chooser;
  if (!chooser) return null;
  const snap = await db.collection("users").doc(chooser).get();
  return snap.exists ? standingUserOf(snap.id, snap.data() ?? {}) : null;
}

/** Why the resolver left somebody out, as an invitation's own reason. */
function whyOf(person: Reached): InvitationWhy | null {
  switch (person.leftOut) {
    case null:
      return null;
    case "settings":
      return "settings";
    case "suppressed":
      return "suppressed";
    default:
      return "no-address";
  }
}

/**
 * WHO A PRESS WOULD INVITE, AND HOW, for an event and a choice: worked out in
 * the chooser's world, as of `now`, leaving out everybody already invited.
 * Reads; writes and sends nothing.
 *
 * `selection` defaults to the stored choice. The editor's count passes the
 * choice on its screen, with the person looking at it as the chooser, so the
 * numbers beside the picker are the numbers its save would publish.
 */
export async function planInvitations(
  db: Firestore,
  args: {
    event: EventDoc;
    /** The choice. */
    choice: { include: string[]; exclude: string[] };
    /**
     * Whose world it is resolved in: the session of the person choosing now,
     * or the uid of the person who chose it, read as they stand today.
     */
    chooser: SessionUser | string;
    /** The programme the event is part of, or null. Defaults to the event's own. */
    programme?: EventDoc["programme"];
    invitedAlready: ReadonlySet<string>;
    now: Date;
  },
): Promise<PlanAnswer> {
  const { event, choice, invitedAlready, now } = args;
  const programme = args.programme === undefined ? event.programme : args.programme;
  const parsed = parseSelection({ include: choice.include, exclude: choice.exclude });
  if (!parsed.ok) return { ok: false, status: 409, error: INVITATION_WORDS.stale };
  if (parsed.selection.include.length === 0) return { ok: true, plan: { invitees: [], count: emptyCount(invitedAlready.size) } };

  // The chooser, as they stand now: their role, their standing, what they lead.
  const chooser = await chooserOf(db, args.chooser);
  if (!chooser) return { ok: false, status: 409, error: INVITATION_WORDS.stale };
  const world = await loadAudienceWorld(db, chooser, now);
  if (!world) return { ok: false, status: 409, error: INVITATION_WORDS.stale };

  const answer = await resolveAudience(
    db,
    world,
    parsed.selection,
    programme
      ? { policy: "per-person", row: "events", noticeUnder: programmeKey(programme.roundId, programme.programmeId) }
      : { policy: "whole", mode: "grid", row: "events" },
  );
  if (!answer.ok) return { ok: false, status: 409, error: INVITATION_WORDS.stale };

  const count = emptyCount(0);
  const invitees: Invitee[] = [];
  const onTheList = new Set(invitedAlready);
  for (const person of answer.resolution.people) {
    if (!person.uid || !person.key.startsWith("a:")) {
      count.noAccount += 1;
      continue;
    }
    if (person.leftOut === "left") {
      count.left += 1;
      continue;
    }
    if (onTheList.has(person.uid)) continue;
    onTheList.add(person.uid);
    const account = world.accounts.get(person.uid);
    const greeting = (account ? goByNameOf({ profile: account.profile }) : null)?.split(" ")[0] ?? "there";
    const author = person.uid === event.authorUid;
    const why: InvitationWhy | null = author ? "author" : whyOf(person);
    const addresses = why === null ? person.addresses : [];
    invitees.push({ uid: person.uid, greeting, how: person.kind, addresses, why });
    count.adding += 1;
    if (why === null) {
      count.emails += 1;
      count.messages += addresses.length;
      if (person.kind === "notice") count.notices += 1;
      else count.bySettings += 1;
    } else if (why === "author") count.notEmailed.author += 1;
    else if (why === "settings") count.notEmailed.settings += 1;
    else if (why === "suppressed") count.notEmailed.suppressed += 1;
    else count.notEmailed.noAddress += 1;
  }
  count.home = onTheList.size;
  count.overCeiling = count.adding > MAX_INVITATION_PEOPLE || count.messages > MAX_INVITATION_SENDS;
  return { ok: true, plan: { invitees, count } };
}

/** The refusal a plan over a ceiling earns, or null. */
export function ceilingRefusal(count: InvitationCount): string | null {
  if (count.adding > MAX_INVITATION_PEOPLE) return INVITATION_WORDS.overPeople(count.adding);
  if (count.messages > MAX_INVITATION_SENDS) return INVITATION_WORDS.overSends(count.messages);
  return null;
}

/**
 * The plan for an event's stored choice: what publishing it, or inviting the
 * people new since, would do. For an event that is not for chosen people, a
 * refusal.
 */
export async function planForStoredChoice(db: Firestore, event: EventDoc, now: Date): Promise<PlanAnswer> {
  if (!isForChosenPeople(event)) return { ok: false, status: 409, error: INVITATION_WORDS.notChosen };
  const [audience, invitedAlready] = await Promise.all([readEventAudience(db, event.id), invitedAlreadyTo(db, event.id)]);
  if (!audience) return { ok: true, plan: { invitees: [], count: emptyCount(invitedAlready.size) } };
  return planInvitations(db, {
    event,
    choice: { include: audience.include, exclude: audience.exclude },
    chooser: audience.setBy,
    invitedAlready,
    now,
  });
}

// ---------------------------------------------------------------------------
// The list, and the emails
// ---------------------------------------------------------------------------

/** One person's document on the list, as a press writes it. */
export function invitationRecord(eventId: string, invitee: Invitee, actorUid: string, via: InvitationVia): Record<string, unknown> {
  return {
    eventId,
    uid: invitee.uid,
    invitedAt: FieldValue.serverTimestamp(),
    invitedBy: actorUid,
    via,
    how: invitee.how,
    outcome: invitee.addresses.length > 0 ? "sending" : "not-emailed",
    why: invitee.why,
  };
}

/**
 * Claim the notice lane's caps for a press that sends any notice: three an
 * hour per (presser, event), ten a day per event, in one transaction, or
 * refuse and claim neither. A press that sends no notice claims nothing: its
 * emails go by the events row, which the person can switch off.
 */
export async function claimInvitationSlots(db: Firestore, eventId: string, actorUid: string, count: InvitationCount) {
  if (count.notices === 0) return { ok: true as const, refusal: null };
  const claim = await reserveNoticeSlots(db, {
    hour: { key: `eventinvite__${eventId}__${actorUid}`, limit: NOTICES_PER_HOUR, windowMs: HOUR_MS },
    day: { key: `eventinvite__${eventId}`, limit: NOTICES_PER_DAY, windowMs: DAY_MS },
    noun: "invitations",
  });
  return claim.ok ? { ok: true as const, refusal: null } : { ok: false as const, refusal: claim.refusal ?? "" };
}

export type InvitationTally = { emailed: number; failed: number; messages: number };

/**
 * Email the people a press has just put on the list, each by the class the
 * plan gave them, and write how it went onto their document. Never throws:
 * a send that fails is counted and logged by uid, never by address. The
 * people with no address to write to were written `not-emailed` already.
 */
export async function deliverInvitations(
  db: Firestore,
  args: { event: EventDoc; invitees: readonly Invitee[]; actorUid: string },
): Promise<InvitationTally> {
  const { event, actorUid } = args;
  const title = event.title.trim() || "NAISI event";
  const eventUrl = `${baseUrl()}/events/${event.id}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const common = {
    eventTitle: title,
    whenLine: formatEventWhen(event.startAt, event.endAt),
    // The public line: an invitation is not a place, and the exact room of a
    // hidden location is what a confirmed place earns.
    locationLine: publicLocationLine(event),
    eventUrl,
    programme: event.programme?.name || null,
    noSignup: event.noSignup,
  };
  const tally: InvitationTally = { emailed: 0, failed: 0, messages: 0 };
  const toEmail = args.invitees.filter((invitee) => invitee.addresses.length > 0);

  await dispatchSends(toEmail, async (invitee) => {
    let sent = 0;
    for (const address of invitee.addresses) {
      try {
        if (invitee.how === "notice") {
          await sendNotice({
            to: address,
            subject: invitationSubject(title),
            surface: "event-invitation",
            actorUid,
            referenceId: event.id,
            fromName: "NAISI Events",
            render: (marker) => EventInvitationEmail({ ...common, recipientName: invitee.greeting, notice: marker }),
          });
        } else {
          // By their events row: one click on the link stops event announcements for both of their addresses.
          const token = signToken({ s: "unsubscribe", uid: invitee.uid, c: "events" }, UNSUB_TOKEN_TTL_SECONDS);
          const unsubscribeUrl = `${appUrl}/api/unsubscribe?t=${encodeURIComponent(token)}`;
          await sendEmail({
            to: address,
            subject: invitationSubject(title),
            fromName: "NAISI Events",
            react: EventInvitationEmail({ ...common, recipientName: invitee.greeting, unsubscribeUrl }),
            kind: "event-invitation",
            actorUid,
            referenceId: event.id,
            listUnsubscribe: { url: unsubscribeUrl, mailto: process.env.EMAIL_DEFAULT_REPLY_TO },
          });
        }
        sent += 1;
      } catch (err) {
        console.error("[event invitation] send failed", event.id, invitee.uid, err);
      }
    }
    tally.messages += sent;
    if (sent > 0) tally.emailed += 1;
    else tally.failed += 1;
    try {
      await db
        .collection(EVENT_INVITATIONS_COLLECTION)
        .doc(eventInvitationId(event.id, invitee.uid))
        .update({ outcome: sent > 0 ? "sent" : "failed", emailedAt: FieldValue.serverTimestamp() });
    } catch (err) {
      // The person is invited either way: their Home shows it. A note that
      // could not be written is logged, never a reason to send again.
      console.error("[event invitation] outcome not recorded", event.id, invitee.uid, err);
    }
  });
  return tally;
}

/**
 * "INVITE THE N NEW SINCE": everybody the stored choice reaches now who is not
 * on the list yet, put on it and emailed. Nothing calls this but an
 * organiser's press: nobody joining a tag is invited by themselves.
 *
 * Each new person's document is created with `create`, so two presses at
 * once invite each person once: whoever's create lands first emails them.
 */
export async function inviteNewSince(
  db: Firestore,
  event: EventDoc,
  actorUid: string,
  now: Date,
): Promise<{ ok: true; invited: number; emailed: number } | { ok: false; status: number; error: string }> {
  const planned = await planForStoredChoice(db, event, now);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const over = ceilingRefusal(plan.count);
  if (over) return { ok: false, status: 400, error: over };
  if (plan.invitees.length === 0) return { ok: true, invited: 0, emailed: 0 };
  const slots = await claimInvitationSlots(db, event.id, actorUid, plan.count);
  if (!slots.ok) return { ok: false, status: 429, error: slots.refusal };

  const created: Invitee[] = [];
  for (const invitee of plan.invitees) {
    try {
      await db
        .collection(EVENT_INVITATIONS_COLLECTION)
        .doc(eventInvitationId(event.id, invitee.uid))
        .create(invitationRecord(event.id, invitee, actorUid, "new-since"));
      created.push(invitee);
    } catch {
      // Already on the list: another press got there first, and emails them.
    }
  }
  const tally = await deliverInvitations(db, { event, invitees: created, actorUid });
  return { ok: true, invited: created.length, emailed: tally.emailed };
}

/**
 * An event's choice and its whole list, for the event's own deletion. Counts
 * the people taken off. Batches of 400, under Firestore's 500.
 */
export async function deleteEventInvitations(db: Firestore, eventId: string): Promise<number> {
  const snap = await db.collection(EVENT_INVITATIONS_COLLECTION).where("eventId", "==", eventId).get();
  for (let at = 0; at < snap.docs.length; at += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(at, at + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  await db.collection(EVENT_AUDIENCES_COLLECTION).doc(eventId).delete();
  return snap.docs.length;
}

/**
 * Every invitation an account holds, for the account's own deletion: being on
 * an event's list says who was chosen for what, and goes with them. One
 * equality on `uid`.
 */
export async function deleteInvitationsForAccount(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection(EVENT_INVITATIONS_COLLECTION).where("uid", "==", uid).get();
  for (let at = 0; at < snap.docs.length; at += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(at, at + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.docs.length;
}
