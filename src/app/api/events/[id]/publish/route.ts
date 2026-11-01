import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { announcementReach, sendEventAnnouncement } from "@/lib/email/eventAnnouncement";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { canApproveEvent } from "@/lib/firestore/users";
import { baseUrl } from "@/lib/events/rsvpToken";
import { formatEventWhen } from "@/lib/events/changeSummary";
import {
  INVITATION_WORDS,
  ceilingRefusal,
  claimInvitationSlots,
  invitationRecord,
  planForStoredChoice,
  deliverInvitations,
  type Invitee,
  type InvitationPlan,
} from "@/lib/events/invitations";
import { hiddenLocationLacksLabel, publicLocationLine } from "@/lib/events/location";
import { announces, guestsMayHear, isForChosenPeople } from "@/lib/events/reach";
import { EVENT_INVITATIONS_COLLECTION, eventInvitationId } from "@/lib/firestore/eventInvitations";
import { normalizeEvent } from "@/lib/firestore/events";
import { announcementQueueEnabled } from "@/lib/scheduler/announcementQueue";

/**
 * Server-only transition from "approved" to "published". Firestore rules block
 * clients from writing status == "published" directly (mirrors the newsletter
 * "sent" gate). Gated to approvers + admins.
 *
 * ── AND THE ONE MOMENT THE `events` ROW SENDS ANYTHING ──────────────────────
 * Publishing is what the notification grid's events row has always promised
 * ("a short email when we publish a new event") and what nothing has ever
 * delivered. It sends here, once per event, to the events row on both columns:
 * by email to the `subscriptions` junction the way the newsletter sends, and by
 * push to members whose events push cell is on. `sendEventAnnouncement` owns
 * both audiences and the whole argument for them.
 *
 * ── ONCE PER EVENT, UNDER A CLAIM ───────────────────────────────────────────
 * `announcedAt` is stamped on the event document INSIDE the transaction that
 * publishes it, so two requests racing to publish the same event cannot both
 * come out holding the announcement: one wins the status transition and the
 * loser sees a status that is no longer "approved". The stamp also survives a
 * later republish (an event pulled back to approved and pushed live again is
 * not news twice), which the status check alone would not catch.
 *
 * The claim is made BEFORE the send rather than after it, and that is a real
 * trade: an announcement that fails after the stamp is not retried, and the
 * event is live with nobody told. The other way round is worse, because it
 * fails in the direction of mailing the whole list twice. The failure is logged
 * and counted in the response so a publisher can see it happened.
 *
 * ── TWO PATHS OUT OF THAT CLAIM, AND A SWITCH DECIDES WHICH ────────────────
 * The send itself runs inside this request, against `apphosting.yaml`'s
 * `timeoutSeconds` (300 since 27 October 2026, for Claude's comparisons; it was 60 when this was written, and this path still keeps inside 60), which is why it carries three ceilings. The way past
 * them is the `event-announcements` scheduler job (docs/notifications.md), and
 * this route is where the two paths part.
 *
 * The job's switch is read ONCE, before the transaction. A switch flipped
 * during a request is not a case worth a read inside it: the announcement is
 * claimed either way, and whichever path this request chose is the path that
 * delivers it.
 *
 *  - SWITCH OFF (the shipped default): everything below runs exactly as it
 *    always has. Nothing changes for anybody until an admin flips it.
 *  - SWITCH ON: the same transaction that stamps `announcedAt` also writes
 *    `announcementState: "queued"` and `announcementQueuedAt`, and this route
 *    sends nothing at all. The job picks the event up on the next tick, one
 *    marker per recipient, and writes the result back onto the document for
 *    the editor to read. On a backend with no scheduler secret the tick does
 *    not run.
 *
 * ── AND A PURE REFUSAL HANDS THE CLAIM BACK ─────────────────────────────────
 * There is one outcome where the trade above buys nothing: the announcement
 * REFUSES, deterministically, before it dispatches anything (the list is over
 * its ceiling). Nothing was sent, nothing can have been half-sent, and yet the
 * claim is spent, `announce` can never be true again, and no supported action
 * gets the announcement out. So that one case clears `announcedAt` and says so
 * in the response: the ceiling can be raised and the event republished. The
 * job applies the same rule to its own refusals.
 *
 * The condition is deliberately narrow: a refusal AND nothing sent, failed or
 * pushed. A THROW is not released: `dispatchSends` can reject after other
 * workers have already delivered, so a retry there would re-mail people. A
 * partial send keeps its claim for the same reason.
 *
 * ── AN EVENT THAT DOES NOT ANNOUNCE ─────────────────────────────────────────
 * Who an event is for decides whether it is announced at all
 * (`announces` in src/lib/events/reach.ts): a listed event whose organiser
 * switched the announcement off claims nothing and sends nothing, and an
 * event for chosen people is never announced. Its people are INVITED
 * instead, below.
 *
 * ── AN EVENT FOR CHOSEN PEOPLE: THE LIST AND ITS INVITATIONS ────────────────
 * Who it invites is worked out BEFORE the transaction, from the choice its
 * organiser made, in their world (src/lib/events/invitations.ts), and the
 * press is refused, with nothing written, when that choice can no longer be
 * resolved, reaches nobody, or is over a ceiling, or when the lane's caps
 * refuse. The transaction then writes the whole list, one document a person,
 * in the same write that publishes, so a published event always has its
 * invitees: it shows on their Home and opens for them from that moment. The
 * emails go after it, best effort, and how each went is written back onto
 * that person's document. The author is on the list and never emailed.
 *
 * ── PUBLISHING NEVER FAILS BECAUSE THE ANNOUNCEMENT FAILED ──────────────────
 * The write is committed first and the send is best effort inside a try/catch,
 * exactly as the stage-release job treats its push. An event that went live
 * without its email is a missing email; an announcement that turned a publish
 * into a 500 would be an event that IS live on a page saying it failed to save.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const allowed = canApproveEvent(actor);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const ref = db.collection("events").doc(id);

  // WHO AN EVENT FOR CHOSEN PEOPLE INVITES, worked out before anything is
  // written. See the header: a press that cannot invite anybody, or would be
  // over a ceiling, is refused here and changes nothing.
  const before = await ref.get();
  if (!before.exists) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const planned = normalizeEvent(id, before.data() ?? {});
  let invitations: InvitationPlan | null = null;
  if (isForChosenPeople(planned) && planned.status === "approved") {
    const plan = await planForStoredChoice(db, planned, new Date());
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
    if (plan.plan.count.home === 0) {
      return NextResponse.json({ error: INVITATION_WORDS.nobody }, { status: 400 });
    }
    const over = ceilingRefusal(plan.plan.count);
    if (over) return NextResponse.json({ error: over }, { status: 400 });
    const slots = await claimInvitationSlots(db, id, actor.uid, plan.plan.count);
    if (!slots.ok) return NextResponse.json({ error: slots.refusal }, { status: 429 });
    invitations = plan.plan;
  }

  // WHICH PATH THIS PUBLISH TAKES, decided once and before the transaction.
  // Through the same helper and the same `enabledByDefault` the tick uses, so
  // the panel's switch and this branch can never mean two different things. A
  // read that fails falls back to the INLINE path, which is the direction that
  // still delivers the announcement.
  let queueIt = false;
  try {
    queueIt = await announcementQueueEnabled(db);
  } catch (err) {
    console.error("[event publish] scheduler switch unreadable, sending inline", id, err);
  }

  // The status transition and the announcement claim in ONE write. See the
  // header: the claim is what makes the announcement once-per-event.
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { ok: false as const, status: 404, error: "Event not found" };
    }
    const current = snap.data() ?? {};
    if (current.status !== "approved") {
      return {
        ok: false as const,
        status: 400,
        error: `Can only publish from "approved", not "${current.status}"`,
      };
    }
    // The editor checks this before review and the update route refuses it on
    // a live event, but a draft is written client-direct and can reach
    // approval without a label. Every surface fails closed on the state; this
    // is what stops it going live at all.
    if (hiddenLocationLacksLabel(current)) {
      return {
        ok: false as const,
        status: 400,
        error:
          "You've hidden the exact location. Add a fuzzy label to show publicly (e.g. 'somewhere on campus') before publishing.",
      };
    }
    // Who it is for has to be what the plan above was made for: an event made
    // for chosen people, or made listed, in the moment between.
    if (isForChosenPeople(current) !== (invitations !== null)) {
      return { ok: false as const, status: 409, error: INVITATION_WORDS.changed };
    }
    // Every read before every write: whether anybody planned is on the list
    // already (nobody, unless the document was moved back by hand).
    const listed = invitations
      ? await Promise.all(
          invitations.invitees.map((invitee) =>
            tx.get(db.collection(EVENT_INVITATIONS_COLLECTION).doc(eventInvitationId(id, invitee.uid))),
          ),
        )
      : [];
    const announce = !current.announcedAt && announces(current);
    tx.update(ref, {
      status: "published",
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(announce ? { announcedAt: FieldValue.serverTimestamp() } : {}),
      // The hand-off, inside the same write as the claim it belongs to. A
      // queue state written afterwards could survive a claim that did not.
      ...(announce && queueIt
        ? {
            announcementState: "queued",
            announcementQueuedAt: FieldValue.serverTimestamp(),
          }
        : {}),
    });
    const created: Invitee[] = [];
    invitations?.invitees.forEach((invitee, index) => {
      if (listed[index]?.exists) return;
      tx.set(
        db.collection(EVENT_INVITATIONS_COLLECTION).doc(eventInvitationId(id, invitee.uid)),
        invitationRecord(id, invitee, actor.uid, "publish"),
      );
      created.push(invitee);
    });
    return { ok: true as const, announce, event: current, created };
  });

  if (!claim.ok) {
    return NextResponse.json({ error: claim.error }, { status: claim.status });
  }
  if (invitations) {
    // Published, with its list. The invitations go now, and never turn a
    // published event into a failed publish: a send that throws is logged and
    // reported, and the people on the list see it on their Home either way.
    try {
      const tally = await deliverInvitations(db, {
        event: normalizeEvent(id, claim.event),
        invitees: claim.created,
        actorUid: actor.uid,
      });
      return NextResponse.json({
        ok: true,
        announced: false,
        invited: { home: invitations.count.home, emailed: tally.emailed, failed: tally.failed },
      });
    } catch (err) {
      console.error("[event publish] invitations failed", id, err);
      return NextResponse.json({ ok: true, announced: false, invitationsFailed: true });
    }
  }
  if (!claim.announce) {
    // Already announced on an earlier publish, or its organiser switched the
    // announcement off. The event is live either way.
    return NextResponse.json({ ok: true, announced: false });
  }
  if (queueIt) {
    // Queued, and this request is done. `announced` is false because nobody
    // has been told yet, which is the same word it has always meant here.
    return NextResponse.json({
      ok: true,
      announced: false,
      announcementQueued: true,
    });
  }

  const event = claim.event;
  // An event that needs an account drops guest rows from the list.
  const membersOnly = !guestsMayHear(event);
  // The PUBLIC location: this list is not the attendee list, so a hidden
  // location shows its placeholder here and the exact room stays behind a
  // confirmed RSVP. `@/lib/events/location` is the one place that decides.
  const locationLine = publicLocationLine(event);

  try {
    const result = await sendEventAnnouncement(db, {
      eventId: id,
      title: (event.title ?? "NAISI event").toString(),
      whenLine: formatEventWhen(
        event.startAt?.toDate?.() ?? null,
        event.endAt?.toDate?.() ?? null,
      ),
      locationLine,
      eventUrl: `${baseUrl()}/events/${id}`,
      coverImageUrl: (event.posterUrl as string | null | undefined) ?? null,
      membersOnly,
      noSignup: event.noSignup === true,
      actorUid: actor.uid,
    });
    // Nothing sent, nothing failed, nothing pushed, and a refusal to explain
    // why: the claim bought nothing, so hand it back. See the header.
    const nothingWentOut =
      result.refusal !== null &&
      result.sent === 0 &&
      result.failed === 0 &&
      result.pushed === 0;
    if (nothingWentOut) {
      console.error("[event publish] announcement refused", id, result.refusal);
      try {
        await ref.update({ announcedAt: FieldValue.delete() });
      } catch (err) {
        // The event is published either way. A claim that could not be released
        // is a missing announcement, not a failed publish.
        console.error("[event publish] could not release the announcement claim", id, err);
      }
      return NextResponse.json({
        ok: true,
        announced: false,
        announcementRefused: true,
        announcement: result,
      });
    }
    if (result.refusal) {
      // One leg refused and the other did not: the claim stays spent, because
      // part of the audience has been told.
      console.error("[event publish] announcement partly refused", id, result.refusal);
    }
    // `announced` is whether anybody was actually told, not whether the attempt
    // ran. A publisher reading `true` over an empty send would have no way to
    // learn that nobody heard.
    return NextResponse.json({
      ok: true,
      announced: result.sent > 0 || result.pushed > 0,
      announcement: result,
    });
  } catch (err) {
    // The event is published. A failed announcement is logged and reported, and
    // is never allowed to look like a failed publish. See the header.
    console.error("[event publish] announcement failed", id, err);
    return NextResponse.json({ ok: true, announced: false, announcementFailed: true });
  }
}

/**
 * HOW MANY PUBLISHING WOULD REACH, asked before the press that sends.
 *
 * The Publish confirm says how many people the announcement emails and how
 * many of them also get a notification. The subscriber list is closed to an
 * approver who is not an admin, so the number comes from here, counted by the
 * send's own audience functions (`announcementReach`) on the path this publish
 * would take, read from the same switch as the press above.
 *
 * THE SAME GATE AS THE PRESS, written the same way: whoever may publish may
 * ask, and nobody else learns even how long the list is. COUNTS ONLY, never an
 * address or a uid. READS ONLY: it claims nothing, writes nothing and sends
 * nothing, as every GET here must (`tests/get-handlers-readonly.test.mjs`).
 *
 * A count that cannot be had comes back as null, never as a guess: a list over
 * the path's ceiling, which the send would refuse, or a leg that could not be
 * read. The editor then says what it said before there was a number, and
 * Publish still works. An event already announced reaches nobody, because the
 * press would announce nothing again.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const allowed = canApproveEvent(actor);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const snap = await db.collection("events").doc(id).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = snap.data() ?? {};
  // AN EVENT FOR CHOSEN PEOPLE announces nothing: the confirm counts its
  // invitations instead, with the press's own plan, so the number it shows is
  // the number publishing sends. Counts only.
  if (isForChosenPeople(event)) {
    let plan: Awaited<ReturnType<typeof planForStoredChoice>>;
    try {
      plan = await planForStoredChoice(db, normalizeEvent(id, event), new Date());
    } catch (err) {
      console.error("[event publish count] invitations uncountable", id, err);
      return NextResponse.json({ error: "Couldn't count the invitations just now." }, { status: 500 });
    }
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
    const { count } = plan.plan;
    return NextResponse.json({
      ok: true,
      emailed: 0,
      notified: 0,
      invited: { home: count.home, emails: count.emails, overCeiling: count.overCeiling },
    });
  }
  if (event.announcedAt) {
    return NextResponse.json({ ok: true, emailed: 0, notified: 0 });
  }
  // A listed event whose organiser switched the announcement off reaches
  // nobody, and the confirm says it won't be announced.
  if (!announces(event)) {
    return NextResponse.json({ ok: true, emailed: 0, notified: 0, announces: false });
  }

  // The press's own fallback: a switch that cannot be read means the inline
  // path, so the count is that path's.
  let queued = false;
  try {
    queued = await announcementQueueEnabled(db);
  } catch (err) {
    console.error("[event publish count] scheduler switch unreadable, counting inline", id, err);
  }

  try {
    const reach = await announcementReach(
      db,
      { eventId: id, membersOnly: !guestsMayHear(event) },
      { queued },
    );
    return NextResponse.json({ ok: true, emailed: reach.emailed, notified: reach.notified });
  } catch (err) {
    console.error("[event publish count] audience unreadable", id, err);
    return NextResponse.json(
      { error: "Couldn't count the events list just now." },
      { status: 500 },
    );
  }
}
