import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import ApplicationEmail from "@/emails/ApplicationEmail";
import { isAddressableId } from "@/lib/addressableId";
import { londonClockLabel } from "@/lib/courses/londonLabels";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { updateEmailAudience, type UpdateRecipient } from "@/lib/courses/updates/audience";
import { parseUpdatePost } from "@/lib/courses/updates/parse";
import { loadRunGroups, loadUpdatesFor, readsAny, updateReadingOf } from "@/lib/courses/updates/readers";
import {
  REFUSAL,
  UPDATE_REPLY_TO,
  countChangedWords,
  testSubject,
  toWordsForReader,
  tooManyPostsWords,
  tooManyTestsWords,
} from "@/lib/courses/updates/words";
import {
  displayNameOf,
  ownAddressFor,
  reserveSendSlot,
  staffMessageBlocks,
  staffPreheader,
} from "@/lib/email/courseFacilitatorEmails";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import { DAY_MS, HOUR_MS, NOTICES_PER_DAY, NOTICES_PER_HOUR, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import { sendEmail } from "@/lib/email/send";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { COURSE_UPDATES_COLLECTION } from "@/lib/firestore/courseUpdates";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * A RUN'S UPDATES (Q18): kept on the programme page for the people they are
 * to, and emailed to them too when the writer leaves "Also email it" on.
 *
 * ## GET: the updates the caller reads
 *
 * For a member's programme page. Who reads which update is decided in one
 * place, `src/lib/courses/updates/readers.ts`; this answers with what the
 * page draws, built field by field, and nothing about the email. A run that
 * is not there and a run the caller reads nothing on are the same 403, so a
 * run id says nothing; an admin is told the run is missing.
 *
 * ## POST: post an update, or "Send a test to me"
 *
 * WHO MAY WRITE, decided before anything but the run, its groups and (for a
 * lead) the forms is read:
 *  - an admin, the run's track leads and the lead of the programme that
 *    names the run (`runStaffingOf`, then `doesTrackLeadWork`): to everyone,
 *    to one live group, or to the facilitators;
 *  - a facilitator of one of the run's live groups: to that group only.
 * Everybody else is refused, and a missing run is refused the same way.
 *
 * WHOLE OR NOT AT ALL. Every refusal comes before anything is written or
 * sent: the body, the gate, the group, an audience over what one send can
 * take, a count that is no longer the one on the button (409, with the new
 * count), and the caps. Only then is the update written, and then emailed,
 * one message per person, never a list and never a copy to anybody else.
 *
 * THE EMAIL IS A NOTICE (docs/notifications.md, "The notice lane"): it goes
 * out whatever the recipient's course email switch says, carries the notice
 * marker and a `kind: "notice"` receipt, and has no unsubscribe link. Its
 * subject is the title, its body the message as text, then the line saying
 * who sent it, the line every staff email ends with. Replies go to the
 * society's inbox (`UPDATE_REPLY_TO`), never to the writer. It carries no
 * meeting link of its own: like "Email the group", nothing here reads a
 * group's link, and what goes out is what the writer typed.
 *
 * THE TEST reaches the presser's own address and nobody else, marked "[TEST]"
 * in its subject, on its own hourly counter, and posts nothing. It is not a
 * notice (nobody's switch is passed over), so it carries no marker.
 *
 * CAPS: an emailed update claims the notice lane's windows (3 an hour per
 * writer and audience, 10 a day per audience) on counters of its own, so the
 * existing composers' budgets are unchanged; an update posted without an
 * email is held to 10 an hour per writer, so a runaway double press cannot
 * fill a page.
 */

/** Posts without an email, per writer and run, an hour. */
const POSTS_PER_HOUR = 10;
/** "Send a test to me", per writer and run, an hour. */
const TEST_SENDS_PER_HOUR = 10;

/** The run, unless it is missing or being destroyed: either is no run to write on. */
async function readLiveRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  if (raw.destroying === true) return null;
  return normalizeCourseRun(snap.id, raw);
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const run = await readLiveRun(db, runId);
  if (!run) {
    return actor.role === "admin"
      ? NextResponse.json({ error: "Run not found" }, { status: 404 })
      : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const groups = await loadRunGroups(db, runId);
  const reading = await updateReadingOf(db, actor, run, groups);
  if (!readsAny(reading)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { programmeName, updates } = await loadUpdatesFor(db, run, reading, groups);
  return NextResponse.json({
    updates: updates.map((update) => ({
      id: update.id,
      title: update.title,
      message: update.message,
      authorUid: update.authorUid,
      authorName: update.authorName,
      authorFirst: update.authorFirst,
      toWords: toWordsForReader(update.to, { programme: programmeName, group: update.groupName }),
      postedOn: update.postedOn,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The body is checked before any document is read.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }
  const parsed = parseUpdatePost(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const post = parsed.value;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate ──────────────────────────────────────────────────────────────
  const run = await readLiveRun(db, runId);
  const groups: CourseGroupDoc[] = run ? await loadRunGroups(db, runId) : [];
  const isAdmin = actor.role === "admin";
  const writesAnywhere = run ? doesTrackLeadWork(await runStaffingOf(db, actor, run)) : false;
  const facilitated = groups.filter(
    (group) => !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  const writesToGroup = post.to === "group" && facilitated.some((group) => group.id === post.groupId);
  if (!isAdmin && !writesAnywhere && !writesToGroup) {
    // A facilitator on this run already knows it; anybody else learns nothing.
    return facilitated.length > 0
      ? NextResponse.json({ error: REFUSAL.ownGroupOnly }, { status: 403 })
      : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const group = post.to === "group" ? (groups.find((each) => each.id === post.groupId) ?? null) : null;
  if (post.to === "group" && (!group || group.archived)) {
    return NextResponse.json({ error: REFUSAL.groupGone }, { status: 400 });
  }

  // ── Who it is from, and what the email says ──────────────────────────────
  const actorSnap = await db.collection("users").doc(actor.uid).get();
  const actorData = actorSnap.data() ?? {};
  const senderName = actorSnap.exists ? displayNameOf(actorData) : actor.displayName?.trim() || "NAISI member";
  const runLine = run.courseTitle ? `${run.courseTitle}${run.label ? ` (${run.label})` : ""}` : run.label;
  const context = [post.to === "group" ? group?.name.trim() : post.to === "facilitators" ? "Facilitators" : "", runLine]
    .filter(Boolean)
    .join(" · ");
  const blocks = staffMessageBlocks(post.message, senderName, context);
  const preheader = staffPreheader(post.message);
  const referenceId = post.to === "group" && group ? group.id : runId;

  // ── "Send a test to me" ───────────────────────────────────────────────────
  if (post.test) {
    const gmailOnly = process.env.EMAIL_GMAIL_ONLY_MODE === "true";
    const own = ownAddressFor(actorData, actor.email, gmailOnly);
    if (!own) return NextResponse.json({ error: REFUSAL.noTestAddress }, { status: 400 });
    let slot;
    try {
      slot = await reserveSendSlot(db, {
        key: `updatetest__${runId}__${actor.uid}`,
        limit: TEST_SENDS_PER_HOUR,
        windowMs: HOUR_MS,
      });
    } catch (err) {
      console.error("[courses update] test throttle read failed", runId, err);
      return NextResponse.json({ error: "Could not check the send limit. Try again in a moment." }, { status: 500 });
    }
    if (!slot.ok) {
      return NextResponse.json(
        { error: tooManyTestsWords(TEST_SENDS_PER_HOUR) },
        { status: 429, headers: { "Retry-After": String(slot.retryAfterSeconds) } },
      );
    }
    // One message, to the presser's own address, which no request can name.
    const result = await sendEmail({
      to: own,
      subject: testSubject(post.title),
      react: ApplicationEmail({ subject: post.title, blocks, preheader }),
      replyTo: UPDATE_REPLY_TO,
      kind: "course-test",
      actorUid: actor.uid,
      referenceId,
    });
    const delivery = result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
    return NextResponse.json({ ok: true, test: { delivery, at: londonClockLabel(new Date()) } });
  }

  // ── Who the email reaches, counted as the composer counted it ─────────────
  let recipients: UpdateRecipient[] = [];
  if (post.email) {
    const audience = await updateEmailAudience(db, run, groups, post.to, group?.id ?? null);
    if (audience.refused) return NextResponse.json({ error: REFUSAL.overCap }, { status: 400 });
    if (audience.recipients.length === 0) {
      return NextResponse.json({ error: REFUSAL.nobodyToEmail }, { status: 400 });
    }
    if (audience.recipients.length !== post.emailCount) {
      return NextResponse.json(
        { error: countChangedWords(audience.recipients.length), emails: audience.recipients.length },
        { status: 409 },
      );
    }
    recipients = audience.recipients;
  }

  // ── The caps, claimed before anything is written ──────────────────────────
  const audienceKey = post.to === "group" && group ? `group__${group.id}` : `${post.to}__${runId}`;
  let refusal: { message: string; retryAfterSeconds: number } | null = null;
  try {
    if (post.email) {
      const slot = await reserveNoticeSlots(db, {
        hour: { key: `update__${audienceKey}__${actor.uid}`, limit: NOTICES_PER_HOUR, windowMs: HOUR_MS },
        day: { key: `updateday__${audienceKey}`, limit: NOTICES_PER_DAY, windowMs: DAY_MS },
        noun: "updates",
      });
      if (!slot.ok) {
        refusal = { message: slot.refusal ?? "That update was refused.", retryAfterSeconds: slot.retryAfterSeconds };
      }
    } else {
      const slot = await reserveSendSlot(db, {
        key: `updatepost__${runId}__${actor.uid}`,
        limit: POSTS_PER_HOUR,
        windowMs: HOUR_MS,
      });
      if (!slot.ok) refusal = { message: tooManyPostsWords(POSTS_PER_HOUR), retryAfterSeconds: slot.retryAfterSeconds };
    }
  } catch (err) {
    // Fail closed: a cap that cannot be read is no licence to post.
    console.error("[courses update] throttle read failed", runId, err);
    return NextResponse.json({ error: "Could not check the send limit. Try again in a moment." }, { status: 500 });
  }
  if (refusal) {
    return NextResponse.json(
      { error: refusal.message },
      { status: 429, headers: { "Retry-After": String(refusal.retryAfterSeconds) } },
    );
  }

  // ── The update, then its email ────────────────────────────────────────────
  const ref = db.collection(COURSE_UPDATES_COLLECTION).doc();
  await ref.set({
    runId,
    to: post.to,
    groupId: post.to === "group" && group ? group.id : null,
    title: post.title,
    message: post.message,
    authorUid: actor.uid,
    postedAt: FieldValue.serverTimestamp(),
    email: post.email
      ? { planned: recipients.length, sent: 0, held: 0, suppressed: 0, failed: 0, settled: false }
      : null,
  });

  if (!post.email) return NextResponse.json({ ok: true, update: { id: ref.id }, email: null });

  const tally = { sent: 0, held: 0, suppressed: 0, failed: 0 };
  await dispatchSends(recipients, async (recipient) => {
    try {
      // ONE address. One message.
      const result = await sendNotice({
        to: recipient.address,
        subject: post.title,
        surface: post.to === "group" ? "course-group" : "course-run",
        actorUid: actor.uid,
        referenceId,
        replyTo: UPDATE_REPLY_TO,
        render: (marker) => ApplicationEmail({ subject: post.title, blocks, preheader, notice: marker }),
      });
      if (result.held.length > 0) tally.held += 1;
      else if (result.suppressed.length > 0) tally.suppressed += 1;
      else tally.sent += 1;
    } catch (err) {
      // A uid, never an address.
      console.error("[courses update] send failed", runId, recipient.uid, err);
      tally.failed += 1;
    }
  });
  try {
    await ref.update({ email: { planned: recipients.length, ...tally, settled: true } });
  } catch (err) {
    console.error("[courses update] could not record what the email did", runId, ref.id, err);
  }
  return NextResponse.json({ ok: true, update: { id: ref.id }, email: { ...tally } });
}
