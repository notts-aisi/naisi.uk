import { NextResponse } from "next/server";
import ApplicationEmail from "@/emails/ApplicationEmail";
import { appUrl } from "@/lib/applications/decisionDay/letters";
import { londonClockLabel } from "@/lib/courses/londonLabels";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { UPDATE_REPLY_TO } from "@/lib/courses/updates/words";
import { HISTORY_WORDS, TELL_REFUSAL, TELL_WORDS } from "@/lib/courses/weekEdit/words";
import { loadEditWeek, weekEditGate, type EditWeek } from "@/lib/courses/weekEdit/gate";
import { isSaveId, newestOf, readWeekSave, readWeekSaveById, saveHeadsQuery, weekHistoryRef, type WeekSaveDoc } from "@/lib/courses/weekEdit/history";
import { TELL_AUDIENCES, letterBody, letterFor, tellAudiences, tellChoices, weekPageUrl, type TellAudience } from "@/lib/courses/weekEdit/notice";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { displayNameOf, ownAddressFor, reserveSendSlot, staffMessageBlocks, staffPreheader } from "@/lib/email/courseFacilitatorEmails";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import { DAY_MS, HOUR_MS, NOTICES_PER_DAY, NOTICES_PER_HOUR, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import { sendEmail } from "@/lib/email/send";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * TELLING PEOPLE ABOUT A CHANGE TO A LIVE WEEK, AS A CHOICE
 * (`src/lib/courses/weekEdit/notice.ts`).
 *
 *   GET  ...?save=<saveId>   the preview: for each choice (nobody, the people
 *        who have started the week, everyone it is open for, everyone on the
 *        programme) its live count, and the email's subject and first lines.
 *        Writes nothing.
 *   POST ... { save, audience, count }   the notice, to that choice, when the
 *        count it carries is still the count (409 with the new count when it
 *        is not); its telling recorded on the save in the week's history.
 *   POST ... { save, test: true }        "Send me a test first": the same
 *        email, marked [TEST], to the presser's own address alone.
 *
 * Only about a save to a published week, only about the newest save (what
 * the week says now), only once per save, never to the person pressing and
 * never with a meeting link. A notice (docs/notifications.md): the
 * `course-run` surface's marker and receipt, no unsubscribe link, under the
 * lane's caps (3 an hour per presser and choice, 10 a day per week) on
 * counters of its own; a test is not a notice and has its own hourly limit.
 *
 * WHO: an admin or the lead of the programme that names the run
 * (`weekEditGate`); a view-as session is refused the POST first.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

/** "Send me a test first", per presser and run, an hour. */
const TEST_SENDS_PER_HOUR = 10;

/** The save a telling is about: the week's newest, published, never the week as the server found it. */
async function saveToTell(
  db: NonNullable<ReturnType<typeof getAdminDb>>,
  loaded: EditWeek,
  runId: string,
  weekId: string,
  saveId: string,
): Promise<{ save: WeekSaveDoc; latest: boolean } | NextResponse> {
  const save = await readWeekSaveById(db, runId, weekId, saveId);
  if (!save || save.kind === "found") return NextResponse.json({ error: TELL_REFUSAL.saveGone }, { status: 404 });
  const heads = (await saveHeadsQuery(db, runId, weekId).get()).docs;
  const newest = newestOf(heads.map((head) => readWeekSave(head.id, head.data() ?? {})));
  return { save, latest: newest?.id === save.id && loaded.week.published === true };
}

async function programmeNameOf(db: NonNullable<ReturnType<typeof getAdminDb>>, loaded: EditWeek): Promise<string> {
  const naming = await readNamingProgramme(db, loaded.run.id);
  return naming?.shortName?.trim() || loaded.run.courseTitle.trim() || "the programme";
}

export async function GET(req: Request, ctx: Params) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const { runId, weekId } = await ctx.params;
  const gated = await weekEditGate(db, actor, { runId, weekId });
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const saveId = new URL(req.url).searchParams.get("save");
  if (!isSaveId(saveId)) return NextResponse.json({ error: TELL_REFUSAL.save }, { status: 400 });
  const loaded = await loadEditWeek(db, runId, weekId);
  if ("status" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const found = await saveToTell(db, loaded, runId, weekId, saveId);
  if (found instanceof NextResponse) return found;
  const { save, latest } = found;
  const blocks = isBlockWeek(loaded.week) ? loaded.week.blocks : [];
  const programme = await programmeNameOf(db, loaded);
  const audiences = await tellAudiences(db, runId, weekId, blocks, actor.uid);
  const letter = letterFor(save, loaded.weekNumber);
  return NextResponse.json({
    save: { id: save.id, summary: save.summary, line: TELL_WORDS.savedLine(save.summary) },
    live: loaded.week.published === true,
    // Only the newest save of a published week, not told yet, can be told about.
    canTell: latest && save.told === null && !audiences.refused,
    told: save.told ? HISTORY_WORDS.told(save.told.count) : null,
    refused: audiences.refused,
    choices: tellChoices(audiences, loaded.weekNumber, programme),
    letter: { subject: letter.subject, lines: letter.lines },
  });
}

type TellBody = { save: string; test: true } | { save: string; test: false; audience: TellAudience; count: number };

function parseTell(raw: unknown): TellBody | { error: string } {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body) return { error: TELL_REFUSAL.body };
  if (!isSaveId(body.save)) return { error: TELL_REFUSAL.save };
  if (body.test === true) return { save: body.save, test: true };
  if (!TELL_AUDIENCES.includes(body.audience as TellAudience)) return { error: TELL_REFUSAL.audience };
  if (typeof body.count !== "number" || !Number.isInteger(body.count) || body.count < 0) return { error: TELL_REFUSAL.count };
  return { save: body.save, test: false, audience: body.audience as TellAudience, count: body.count };
}

export async function POST(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const { runId, weekId } = await ctx.params;
  const gated = await weekEditGate(db, actor, { runId, weekId });
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: TELL_REFUSAL.body }, { status: 400 });
  }
  const body = parseTell(raw);
  if ("error" in body) return NextResponse.json({ error: body.error }, { status: 400 });

  const loaded = await loadEditWeek(db, runId, weekId);
  if ("status" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (loaded.week.published !== true) return NextResponse.json({ error: TELL_REFUSAL.notLive }, { status: 400 });
  const found = await saveToTell(db, loaded, runId, weekId, body.save);
  if (found instanceof NextResponse) return found;
  const { save, latest } = found;

  // What the email says: the letter, where the week is, who sent it.
  const actorSnap = await db.collection("users").doc(actor.uid).get();
  const actorData = actorSnap.data() ?? {};
  const senderName = actorSnap.exists ? displayNameOf(actorData) : actor.displayName?.trim() || "NAISI member";
  const programme = await programmeNameOf(db, loaded);
  const letter = letterFor(save, loaded.weekNumber);
  const message = letterBody(letter, loaded.weekNumber, weekPageUrl(appUrl(), runId, loaded.weekNumber));
  const blocks = staffMessageBlocks(message, senderName, TELL_WORDS.context(loaded.weekNumber, programme));
  const preheader = staffPreheader(message);

  // ── "Send me a test first" ────────────────────────────────────────────────
  if (body.test) {
    const own = ownAddressFor(actorData, actor.email, process.env.EMAIL_GMAIL_ONLY_MODE === "true");
    if (!own) return NextResponse.json({ error: TELL_REFUSAL.noTestAddress }, { status: 400 });
    let slot;
    try {
      slot = await reserveSendSlot(db, { key: `weekedittest__${runId}__${actor.uid}`, limit: TEST_SENDS_PER_HOUR, windowMs: HOUR_MS });
    } catch (err) {
      console.error("[courses week change] test throttle read failed", runId, err);
      return NextResponse.json({ error: TELL_REFUSAL.throttle }, { status: 500 });
    }
    if (!slot.ok) {
      return NextResponse.json(
        { error: TELL_REFUSAL.tooManyTests(TEST_SENDS_PER_HOUR) },
        { status: 429, headers: { "Retry-After": String(slot.retryAfterSeconds) } },
      );
    }
    // One message, to the presser's own address, which no request can name.
    const result = await sendEmail({
      to: own,
      subject: TELL_WORDS.testSubject(letter.subject),
      react: ApplicationEmail({ subject: letter.subject, blocks, preheader }),
      replyTo: UPDATE_REPLY_TO,
      kind: "course-test",
      actorUid: actor.uid,
      referenceId: runId,
    });
    const delivery = result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
    return NextResponse.json({ ok: true, test: { delivery, at: londonClockLabel(new Date()) } });
  }

  // ── The notice ────────────────────────────────────────────────────────────
  if (!latest) return NextResponse.json({ error: TELL_REFUSAL.notLatest }, { status: 409 });
  if (save.told) return NextResponse.json({ error: TELL_REFUSAL.alreadyTold }, { status: 409 });
  const weekBlocks = isBlockWeek(loaded.week) ? loaded.week.blocks : [];
  const audiences = await tellAudiences(db, runId, weekId, weekBlocks, actor.uid);
  if (audiences.refused) return NextResponse.json({ error: TELL_REFUSAL.overCap }, { status: 400 });
  const recipients = audiences.recipients[body.audience];
  if (recipients.length === 0) return NextResponse.json({ error: TELL_REFUSAL.nobody }, { status: 400 });
  if (recipients.length !== body.count) {
    return NextResponse.json({ error: TELL_REFUSAL.countChanged(recipients.length), count: recipients.length }, { status: 409 });
  }

  // The caps, claimed before anything is written or sent.
  let claim;
  try {
    claim = await reserveNoticeSlots(db, {
      hour: { key: `weekedit__${body.audience}__${runId}__${weekId}__${actor.uid}`, limit: NOTICES_PER_HOUR, windowMs: HOUR_MS },
      day: { key: `weekeditday__${runId}__${weekId}`, limit: NOTICES_PER_DAY, windowMs: DAY_MS },
      noun: "notices",
    });
  } catch (err) {
    // Fail closed: a cap that cannot be read is no licence to send.
    console.error("[courses week change] throttle read failed", runId, err);
    return NextResponse.json({ error: TELL_REFUSAL.throttle }, { status: 500 });
  }
  if (!claim.ok) {
    return NextResponse.json(
      { error: claim.refusal ?? "That notice was refused." },
      { status: 429, headers: { "Retry-After": String(claim.retryAfterSeconds) } },
    );
  }

  // Claim the telling on the save, once: a second press finds it told.
  const ref = weekHistoryRef(db, runId, weekId).doc(save.id);
  const now = new Date();
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || readWeekSave(snap.id, snap.data() ?? {}).told) return false;
    tx.update(ref, {
      told: { audience: body.audience, count: recipients.length, sent: 0, held: 0, suppressed: 0, failed: 0, at: now, byUid: actor.uid, settled: false },
    });
    return true;
  });
  if (!claimed) return NextResponse.json({ error: TELL_REFUSAL.alreadyTold }, { status: 409 });

  const tally = { sent: 0, held: 0, suppressed: 0, failed: 0 };
  await dispatchSends(recipients, async (recipient) => {
    try {
      // ONE address. One message.
      const result = await sendNotice({
        to: recipient.address,
        subject: letter.subject,
        surface: "course-run",
        actorUid: actor.uid,
        referenceId: runId,
        replyTo: UPDATE_REPLY_TO,
        render: (marker) => ApplicationEmail({ subject: letter.subject, blocks, preheader, notice: marker }),
      });
      if (result.held.length > 0) tally.held += 1;
      else if (result.suppressed.length > 0) tally.suppressed += 1;
      else tally.sent += 1;
    } catch (err) {
      // A uid, never an address.
      console.error("[courses week change] send failed", runId, recipient.uid, err);
      tally.failed += 1;
    }
  });
  try {
    await ref.update({
      told: { audience: body.audience, count: recipients.length, ...tally, at: now, byUid: actor.uid, settled: true },
    });
  } catch (err) {
    console.error("[courses week change] could not record what the notice did", runId, save.id, err);
  }
  return NextResponse.json({ ok: true, told: { count: recipients.length, ...tally } });
}
