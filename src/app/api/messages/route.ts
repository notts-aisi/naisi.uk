import { NextResponse } from "next/server";
import MessageEmail from "@/emails/MessageEmail";
import { loadAudienceWorld, resolveAudience } from "@/lib/audience/load";
import { AUDIENCE_REFUSAL } from "@/lib/audience/words";
import { displayNameOf, staffMessageBlocks, staffPreheader } from "@/lib/email/courseFacilitatorEmails";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import { DAY_MS, HOUR_MS, reserveNoticeSlots, type NoticeSlotClaim } from "@/lib/email/noticeCaps";
import { sendEmail, type SendResult } from "@/lib/email/send";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import type { MessageOutcome, MessageTally } from "@/lib/firestore/messageSends";
import { parseMessageSend } from "@/lib/messages/parse";
import { mayPostOn, postOnProgrammePage, postTargetFor, settlePostedEmail } from "@/lib/messages/posting";
import {
  MAX_MESSAGE_EMAILS,
  capWindows,
  emailedOf,
  recordedTags,
  settleMessageRecord,
  startMessageRecord,
  testStandingOf,
  unsubscribeUrlFor,
  wordingOf,
} from "@/lib/messages/sending";
import { isApprovedAccount, messageWriterOf, writesMessages } from "@/lib/messages/writers";
import { MESSAGE_REFUSAL, becauseWords, countChangedWords, overCeilingWords } from "@/lib/messages/words";

/**
 * MESSAGES (docs/messages.md): one composer for writing to people, on the
 * picker ("Who is this for?").
 *
 * ## GET: does the menu draw Messages for the caller?
 *
 * `{ writes }`, for every approved account: true for an admin, a programme's
 * lead and a group's facilitator (`writesMessages`), false for anybody else.
 * The menu asks it once when it opens, because who leads and who facilitates
 * is in the records and not on the session. It reads, and writes nothing.
 *
 * ## POST: the send
 *
 *   { include, exclude, row, subject, message, count, post }
 *
 * WHO MAY: an admin, a programme's lead and a group's facilitator
 * (`messageWriterOf`), each to the tags the picker's scope table gives them,
 * which `resolveAudience` asks again of every tag before anybody is resolved.
 *
 * THE SAME PEOPLE THE PICKER COUNTED. The choice is resolved by the call the
 * picker's count makes, with the same options, so the number on the button is
 * the number sent: when it no longer is, the send is refused (409, with the
 * new number) and nothing goes. The writer is among them when they are in the
 * tags, as the count says ("including you").
 *
 * ONE CLASS FOR THE WHOLE SEND, never a mix. A programme notice when every
 * tag is about running a programme and the writer runs everybody it reaches:
 * one `sendNotice` per address on the `messages` surface, with the marker
 * and no unsubscribe link, whatever their settings. Otherwise by their
 * settings, the one row the writer chose (or the tags suggest): one
 * `sendEmail` per address the row routes to, with the line saying which row
 * it read and the link that unsubscribes them from it, guests through their
 * own subscription to that row's list. No push: Messages sends email only.
 *
 * WHOLE OR NOT AT ALL. Every refusal comes before anything is written or
 * sent: the body, the gate, a tag the writer may not use, nobody to email, a
 * count that has moved, over the three hundred emails one send can take, a
 * post the selection or the writer cannot make, no test of these words that
 * reached the writer (as Publish waits for one), and the caps (three an hour
 * per writer and audience, ten a day per audience, claimed in one
 * transaction). Only then is the record written (`messageSends`, never an
 * address), and the update when it is also posted on the programme's page,
 * then the emails, one message per address, never a list and never a copy to
 * anybody else; and then what they did, on both.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: MESSAGE_REFUSAL.notSignedIn }, { status: 401 });
  if (!isApprovedAccount(user)) return NextResponse.json({ error: MESSAGE_REFUSAL.notApproved }, { status: 403 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: MESSAGE_REFUSAL.notConfigured }, { status: 500 });
  return NextResponse.json({ writes: await writesMessages(db, user, new Date()) });
}

/** What one `sendEmail` or `sendNotice` did with its one address. */
function outcomeOf(result: SendResult): MessageOutcome {
  if (result.held.length > 0) return "held";
  if (result.suppressed.length > 0) return "suppressed";
  return "sent";
}

/** One person's outcome over their addresses: told on any of them is told. */
function personOutcome(each: readonly MessageOutcome[]): MessageOutcome {
  for (const outcome of ["sent", "held", "suppressed"] as const) if (each.includes(outcome)) return outcome;
  return "failed";
}

export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: MESSAGE_REFUSAL.notSignedIn }, { status: 401 });
  if (!isApprovedAccount(user)) return NextResponse.json({ error: MESSAGE_REFUSAL.notApproved }, { status: 403 });

  // The body is checked before any document is read.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: MESSAGE_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseMessageSend(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const send = parsed.value;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: MESSAGE_REFUSAL.notConfigured }, { status: 500 });
  const now = new Date();

  // ── The gate ──────────────────────────────────────────────────────────────
  const writer = await messageWriterOf(db, user, now);
  if (!writer) return NextResponse.json({ error: MESSAGE_REFUSAL.notAWriter }, { status: 403 });

  // ── Who it reaches, counted as the picker counted it ─────────────────────
  const world = await loadAudienceWorld(db, user, now, writer.roles);
  if (!world) return NextResponse.json({ error: MESSAGE_REFUSAL.notApproved }, { status: 403 });
  const answer = await resolveAudience(db, world, send.selection, { row: send.row });
  if (!answer.ok) return NextResponse.json({ error: AUDIENCE_REFUSAL.notYours }, { status: 403 });
  const { resolution } = answer;
  const emailed = emailedOf(resolution);
  if (emailed.people.length === 0) return NextResponse.json({ error: MESSAGE_REFUSAL.nobody }, { status: 400 });
  if (emailed.people.length !== send.count) {
    return NextResponse.json(
      { error: countChangedWords(emailed.people.length), count: emailed.people.length },
      { status: 409 },
    );
  }
  if (emailed.messages > MAX_MESSAGE_EMAILS) {
    return NextResponse.json({ error: overCeilingWords(emailed.messages, MAX_MESSAGE_EMAILS) }, { status: 400 });
  }

  // ── Also post it on the programme's page ─────────────────────────────────
  const target = send.post ? postTargetFor(writer, send.selection) : null;
  if (send.post && !target) return NextResponse.json({ error: MESSAGE_REFUSAL.notPostable }, { status: 400 });
  if (target) {
    const may = await mayPostOn(db, user, target);
    if (may === "no-run") return NextResponse.json({ error: MESSAGE_REFUSAL.noRun }, { status: 400 });
    if (may === "not-yours") return NextResponse.json({ error: MESSAGE_REFUSAL.notYourPage }, { status: 403 });
  }

  // ── A test of these words, first ──────────────────────────────────────────
  const test = await testStandingOf(db, user.uid, wordingOf(send.subject, send.message));
  if (test !== "fresh") {
    return NextResponse.json(
      { error: test === "stale" ? MESSAGE_REFUSAL.staleTest : MESSAGE_REFUSAL.untested, test },
      { status: 409 },
    );
  }

  // ── The caps, claimed before anything is written ──────────────────────────
  let slot: NoticeSlotClaim;
  try {
    slot = await reserveNoticeSlots(db, { ...capWindows(user.uid, send.selection, HOUR_MS, DAY_MS), noun: "messages" });
  } catch (err) {
    // Fail closed: a cap that cannot be read is no licence to send.
    console.error("[messages] throttle read failed", user.uid, err);
    return NextResponse.json({ error: MESSAGE_REFUSAL.unreadable }, { status: 500 });
  }
  if (!slot.ok) {
    return NextResponse.json(
      { error: slot.refusal ?? MESSAGE_REFUSAL.unreadable },
      { status: 429, headers: { "Retry-After": String(slot.retryAfterSeconds) } },
    );
  }

  // ── What the email says ───────────────────────────────────────────────────
  const writerSnap = await db.collection("users").doc(user.uid).get();
  const senderName = writerSnap.exists ? displayNameOf(writerSnap.data() ?? {}) : user.displayName?.trim() || "NAISI member";
  const blocks = staffMessageBlocks(send.message, senderName, "");
  const preheader = staffPreheader(send.message);
  const planned = emailed.people.length;

  // ── The record, and the update, then the emails ───────────────────────────
  const postedUpdateId = target
    ? await postOnProgrammePage(db, { target, authorUid: user.uid, title: send.subject, message: send.message, planned })
    : null;
  const recordId = await startMessageRecord(db, {
    writerUid: user.uid,
    tags: recordedTags(world, send.selection),
    resolution,
    subject: send.subject,
    postedUpdateId,
  });

  const outcomes = new Map<string, MessageOutcome>();
  await dispatchSends(emailed.people, async (person) => {
    const each: MessageOutcome[] = [];
    for (const address of person.addresses) {
      try {
        if (person.kind === "notice") {
          // ONE address. One message. The marker says why it reached them.
          const result = await sendNotice({
            to: address,
            subject: send.subject,
            surface: "messages",
            actorUid: user.uid,
            referenceId: recordId,
            render: (marker) => MessageEmail({ subject: send.subject, blocks, preheader, notice: marker }),
          });
          each.push(outcomeOf(result));
        } else {
          // By their settings: the row it read, and the link that unsubscribes them from it.
          const url = unsubscribeUrlFor(person, resolution.row);
          const result = await sendEmail({
            to: address,
            subject: send.subject,
            react: MessageEmail({
              subject: send.subject,
              blocks,
              preheader,
              unsubscribe: { because: becauseWords(resolution.row, person.uid === null), url },
            }),
            kind: "message",
            actorUid: user.uid,
            referenceId: recordId,
            listUnsubscribe: { url, mailto: process.env.EMAIL_DEFAULT_REPLY_TO },
          });
          each.push(outcomeOf(result));
        }
      } catch (err) {
        // An account id, never an address.
        console.error("[messages] send failed", recordId, person.uid ?? "no account", err);
        each.push("failed");
      }
    }
    outcomes.set(person.key, personOutcome(each));
  });

  const tally: MessageTally = { sent: 0, held: 0, suppressed: 0, failed: 0 };
  for (const outcome of outcomes.values()) tally[outcome] += 1;
  try {
    await settleMessageRecord(db, recordId, resolution, outcomes, tally);
    if (postedUpdateId) await settlePostedEmail(db, postedUpdateId, planned, tally);
  } catch (err) {
    console.error("[messages] could not record what the emails did", recordId, err);
  }
  return NextResponse.json({ ok: true, ...tally, posted: target ? target.programme : null });
}
