import { NextResponse } from "next/server";
import MessageEmail from "@/emails/MessageEmail";
import { londonClockLabel } from "@/lib/courses/londonLabels";
import {
  displayNameOf,
  ownAddressFor,
  reserveSendSlot,
  staffMessageBlocks,
  staffPreheader,
} from "@/lib/email/courseFacilitatorEmails";
import { HOUR_MS } from "@/lib/email/noticeCaps";
import { sendEmail, type SendResult } from "@/lib/email/send";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { parseMessageTest } from "@/lib/messages/parse";
import { MESSAGE_TESTS_PER_HOUR, recordMessageTest, testDocId, wordingOf } from "@/lib/messages/sending";
import { MESSAGE_REFUSAL, testSubject, tooManyTestsWords } from "@/lib/messages/words";
import { isApprovedAccount, messageWriterOf } from "@/lib/messages/writers";

/**
 * "SEND A TEST TO ME" in Messages: `{ subject, message }`.
 *
 * The message as its people will read it, its subject marked "[TEST]", to
 * the address on the presser's own account and nobody else: no request can
 * name another. It carries no notice marker and no unsubscribe link, because
 * it passes over nobody's settings and the marker's sentence would be false
 * about it. It is not a notice and it is not by anybody's settings: it is the
 * writer's own rehearsal (`kind: "message-test"`).
 *
 * A TEST THAT REACHES ITS WRITER IS RECORDED, with the words it was made
 * from, and the send waits for one of the words it is sending
 * (`src/lib/messages/sending.ts`), as Publish waits for its test. One this
 * copy of the site held, or one to an address on the do-not-email list,
 * reached nobody and is not recorded.
 *
 * The same writers as the send (`messageWriterOf`), ten tests an hour each,
 * and refused during a view-as session: a test is sent and recorded in the
 * session's name.
 */
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
  const parsed = parseMessageTest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { subject, message } = parsed.value;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: MESSAGE_REFUSAL.notConfigured }, { status: 500 });

  // ── The gate ──────────────────────────────────────────────────────────────
  const writer = await messageWriterOf(db, user, new Date());
  if (!writer) return NextResponse.json({ error: MESSAGE_REFUSAL.notAWriter }, { status: 403 });

  // ── Their own address, which no request can name ─────────────────────────
  const writerSnap = await db.collection("users").doc(user.uid).get();
  const writerData = writerSnap.data() ?? {};
  const own = ownAddressFor(writerData, user.email, process.env.EMAIL_GMAIL_ONLY_MODE === "true");
  if (!own) return NextResponse.json({ error: MESSAGE_REFUSAL.noTestAddress }, { status: 400 });

  let slot: Awaited<ReturnType<typeof reserveSendSlot>>;
  try {
    slot = await reserveSendSlot(db, { key: `messagetest__${user.uid}`, limit: MESSAGE_TESTS_PER_HOUR, windowMs: HOUR_MS });
  } catch (err) {
    console.error("[messages test] throttle read failed", user.uid, err);
    return NextResponse.json({ error: MESSAGE_REFUSAL.unreadable }, { status: 500 });
  }
  if (!slot.ok) {
    return NextResponse.json(
      { error: tooManyTestsWords(MESSAGE_TESTS_PER_HOUR) },
      { status: 429, headers: { "Retry-After": String(slot.retryAfterSeconds) } },
    );
  }

  const senderName = writerSnap.exists ? displayNameOf(writerData) : user.displayName?.trim() || "NAISI member";
  let result: SendResult;
  try {
    result = await sendEmail({
      to: own,
      subject: testSubject(subject),
      react: MessageEmail({
        subject,
        blocks: staffMessageBlocks(message, senderName, ""),
        preheader: staffPreheader(message),
      }),
      kind: "message-test",
      actorUid: user.uid,
      referenceId: testDocId(user.uid),
    });
  } catch (err) {
    console.error("[messages test] send failed", user.uid, err);
    return NextResponse.json({ error: MESSAGE_REFUSAL.testNotSent }, { status: 502 });
  }

  // Held or suppressed: nothing reached anybody, so it is not a test.
  const delivery = result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
  if (delivery === "sent") {
    try {
      await recordMessageTest(db, user.uid, wordingOf(subject, message));
    } catch (err) {
      console.error("[messages test] could not record the test", user.uid, err);
      return NextResponse.json({ error: MESSAGE_REFUSAL.testNotRecorded }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true, test: { delivery, at: londonClockLabel(new Date()) } });
}
