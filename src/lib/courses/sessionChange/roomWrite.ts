import "server-only";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import ApplicationEmail from "@/emails/ApplicationEmail";
import { groupHistoryRow, iso, toldFacts } from "@/lib/courses/groupChange/facts";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { updateEmailAudience, type UpdateRecipient } from "@/lib/courses/updates/audience";
import { UPDATE_REPLY_TO } from "@/lib/courses/updates/words";
import { displayNameOf, staffMessageBlocks, staffPreheader } from "@/lib/email/courseFacilitatorEmails";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import { DAY_MS, HOUR_MS, NOTICES_PER_DAY, NOTICES_PER_HOUR, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import type { SessionUser } from "@/lib/firebase/session";
import { attendanceDocId } from "@/lib/firestore/courseAttendance";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { GROUP_FIELD_LIMITS, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { MessageTally } from "@/lib/firestore/messageSends";
import { postOnProgrammePage, settlePostedEmail } from "@/lib/messages/posting";
import { checkRoomWeek, roomNoticeOf, type CheckedRoomWeek, type RoomPress } from "./room";
import { roomHistoryDetail, roomNoticeWords } from "./roomWords";
import { REFUSAL, countChangedWords } from "./words";

/**
 * THE ROOM-ONLY CHANGE, WRITTEN: kind `room` of the one-week change route,
 * after that route's own gate (view-as, session, body, the group's
 * facilitators, the programme's lead, the run's track leads and admins).
 * The arithmetic is `./room.ts`; this reads, writes and tells.
 *
 * ── ONE WEEK OR SEVERAL, ONE TRANSACTION ────────────────────────────────────
 * Every week named is checked on the group as it stands inside one
 * transaction, each on the group as the weeks before it leave it. One week
 * refused is refused whole (status and sentence, nothing written). Of several,
 * each week refused says why and the rest are written: they are independent
 * changes of independent weeks, one History row each.
 *
 * ── TELLING THE GROUP (one week at a time) ──────────────────────────────────
 * The same lane, limits and people as the one-week move's notice: an update
 * to the group, kept on its programme page and emailed to the people in the
 * group FOR THAT WEEK and its facilitators with standing, never the presser
 * (`updateEmailAudience` with the week); the updates lane's own windows for
 * one group (three an hour per presser, ten a day), claimed before anything
 * changes; the count on the button checked first, and a count that changed,
 * fell to nobody or passed one send's limit answered 409 with the new facts
 * and nothing changed. Unlike the move, THE ROUTE TELLS THE GROUP ITSELF,
 * after the commit, in the same request: a closed tab cannot leave a room
 * saved with History claiming an email that never went. A send that fails
 * keeps the room and says so, and the History row is brought to what was
 * really sent. The words are `roomNoticeWords`, and nothing else.
 */

type Answer = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

const refusal = (status: number, error: string, detail: Record<string, unknown> = {}): Answer => ({
  status,
  body: { error, ...detail },
});

type Saved = Extract<CheckedRoomWeek, { ok: true }>;

function registerRefOf(db: Firestore, run: CourseRunDoc, groupId: string, weekNumber: number): DocumentReference {
  return db.collection("courseAttendance").doc(attendanceDocId(run.id, groupId, weekNumber, 1));
}

/** One week's room written into the group's update; the week's override taken away when nothing else is left in it. */
function writeWeek(update: Record<string, unknown>, saved: Saved): void {
  const left = saved.after.sessionOverrides[saved.weekId];
  if (saved.location === null && !left) {
    update[`sessionOverrides.${saved.weekId}`] = FieldValue.delete();
    return;
  }
  update[`sessionOverrides.${saved.weekId}.location`] = saved.location === null ? FieldValue.delete() : saved.location;
}

export async function answerRoomPress(
  db: Firestore,
  input: {
    actor: SessionUser;
    run: CourseRunDoc;
    group: CourseGroupDoc;
    groupRef: DocumentReference;
    press: RoomPress;
    now: Date;
  },
): Promise<Answer> {
  const { actor, run, group: found, groupRef, press, now } = input;
  const naming = await readNamingProgramme(db, run.id);
  const incubator = naming?.kind === "incubator";
  const groupName = found.name.trim() || "Untitled group";
  const context = { groupName, incubator, reason: press.reason };

  const refs = press.weeks.map((week) => registerRefOf(db, run, found.id, week.weekNumber));
  const registersOf = (snaps: ReadonlyArray<{ exists: boolean; data(): Record<string, unknown> | undefined }>) =>
    snaps.map((snap) => (snap.exists ? (snap.data() ?? {}) : undefined));

  // ── A preview: one week, nothing written ────────────────────────────────
  if (press.preview) {
    const [week] = press.weeks;
    const [register] = registersOf(await db.getAll(...refs));
    const checked = checkRoomWeek(run, found, week, now, register);
    if (!checked.ok) return refusal(checked.status, checked.error);
    const told = await toldFacts(db, run, found, actor.uid, week.weekNumber);
    return {
      status: 200,
      body: {
        ok: true,
        preview: {
          kind: "room",
          weekNumber: week.weekNumber,
          room: checked.room,
          wasRoom: checked.wasRoom,
          told,
          notice: roomNoticeWords(roomNoticeOf(checked), context),
          at: iso(now),
        },
      },
    };
  }

  // ── One week refused is refused before anything else is asked ───────────
  if (press.weeks.length === 1) {
    const [register] = registersOf(await db.getAll(...refs));
    const checked = checkRoomWeek(run, found, press.weeks[0], now, register);
    if (!checked.ok) return refusal(checked.status, checked.error);
  }

  // ── Who is told, and the lane's windows, before anything changes ────────
  let recipients: UpdateRecipient[] = [];
  if (press.tell) {
    const [week] = press.weeks;
    const audience = await updateEmailAudience(db, run, [found], "group", found.id, actor.uid, {
      withFacilitators: true,
      // The people of that week's session: somebody moved mid-term is told about their own week's session.
      weekNumber: week.weekNumber,
    });
    // A count that changed, fell to nobody or passed one send's limit: asked again, nothing changed.
    if (audience.refused) return refusal(409, REFUSAL.overCap, { emails: 0, overCap: true });
    if (audience.recipients.length === 0) return refusal(409, REFUSAL.nobodyToEmail, { emails: 0 });
    if (audience.recipients.length !== press.emailCount) {
      return refusal(409, countChangedWords(audience.recipients.length), { emails: audience.recipients.length });
    }
    const audienceKey = `group__${found.id}`;
    let slot;
    try {
      slot = await reserveNoticeSlots(db, {
        hour: { key: `update__${audienceKey}__${actor.uid}`, limit: NOTICES_PER_HOUR, windowMs: HOUR_MS },
        day: { key: `updateday__${audienceKey}`, limit: NOTICES_PER_DAY, windowMs: DAY_MS },
        noun: "updates",
      });
    } catch (err) {
      // Fail closed: a cap that cannot be read is no licence to send.
      console.error("[courses session room] throttle read failed", found.id, err);
      return refusal(500, "Could not check the send limit. Try again in a moment.");
    }
    if (!slot.ok) {
      return {
        status: 429,
        body: { error: slot.refusal ?? "That update was refused." },
        headers: { "Retry-After": String(slot.retryAfterSeconds) },
      };
    }
    recipients = audience.recipients;
  }

  // ── The write, on the group as it stands now ────────────────────────────
  const emailed = recipients.length;
  type Outcome = { saved: Saved[]; refused: Extract<CheckedRoomWeek, { ok: false }>[]; auditRefs: DocumentReference[] };
  let outcome: Outcome;
  try {
    outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
      const freshSnap = await tx.get(groupRef);
      if (!freshSnap.exists) throw new RoomRefusal(400, REFUSAL.gone);
      let working = normalizeCourseGroup(freshSnap.id, freshSnap.data() ?? {});
      if (working.archived || working.runId !== run.id) throw new RoomRefusal(400, REFUSAL.gone);
      const registers = registersOf(await tx.getAll(...refs));
      // The weeks with an override as stored: the cap a group holds counts these.
      const stored = new Set(Object.keys(((freshSnap.data() ?? {}).sessionOverrides ?? {}) as Record<string, unknown>));
      const saved: Saved[] = [];
      const refused: Outcome["refused"] = [];
      press.weeks.forEach((week, index) => {
        const checked = checkRoomWeek(run, working, week, now, registers[index]);
        if (!checked.ok) {
          refused.push(checked);
          return;
        }
        if (!stored.has(checked.weekId) && checked.location !== null) {
          if (stored.size >= GROUP_FIELD_LIMITS.maxSessionOverrides) {
            refused.push({ ok: false, weekNumber: week.weekNumber, status: 400, error: REFUSAL.full });
            return;
          }
          stored.add(checked.weekId);
        }
        saved.push(checked);
        working = checked.after;
      });
      if (press.weeks.length === 1 && refused.length === 1) throw new RoomRefusal(refused[0].status, refused[0].error);
      if (saved.length === 0) return { saved, refused, auditRefs: [] };

      const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      for (const each of saved) writeWeek(update, each);
      tx.update(groupRef, update);
      const auditRefs = saved.map((each) => {
        const ref = db.collection(COURSE_AUDIT_COLLECTION).doc();
        tx.set(
          ref,
          groupHistoryRow({
            kind: "session-room",
            run,
            group: working,
            actor,
            detail: roomHistoryDetail({ weekNumber: each.weekNumber, room: each.room, wasRoom: each.wasRoom, reason: press.reason, emailed }),
            weekId: each.weekId,
            before: { room: each.wasRoom },
            after: { room: each.room },
            reason: press.reason,
            emailed,
          }),
        );
        return ref;
      });
      return { saved, refused, auditRefs };
    });
  } catch (err) {
    if (err instanceof RoomRefusal) return refusal(err.status, err.message);
    console.error("[courses session room] failed", found.id, err);
    return refusal(500, "That change didn’t go through, so nothing was changed.");
  }

  // ── The notice, once the room is written ────────────────────────────────
  let email: (MessageTally & { planned: number }) | null = null;
  const [first] = outcome.saved;
  if (first && recipients.length > 0) {
    const words = roomNoticeWords(roomNoticeOf(first), context);
    email = await tellTheGroup(db, { run, group: found, actor, recipients, words });
    if (email.sent !== emailed) {
      // History says what was really sent.
      try {
        await outcome.auditRefs[0].update({
          emailed: email.sent,
          detail: roomHistoryDetail({ weekNumber: first.weekNumber, room: first.room, wasRoom: first.wasRoom, reason: press.reason, emailed: email.sent }),
        });
      } catch (err) {
        console.error("[courses session room] could not record what the email did", found.id, err);
      }
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      rooms: [
        ...outcome.saved.map((each) => ({ week: each.weekNumber, saved: true, room: each.room, error: null })),
        ...outcome.refused.map((each) => ({ week: each.weekNumber, saved: false, room: null, error: each.error })),
      ].sort((a, b) => a.week - b.week),
      email,
    },
  };
}

class RoomRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The update to the group and its email, as the updates route posts one to a
 * group: kept on the programme page, one message per address, a notice on the
 * `course-group` surface. Never throws: what went is counted.
 */
async function tellTheGroup(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    actor: SessionUser;
    recipients: readonly UpdateRecipient[];
    words: { title: string; message: string };
  },
): Promise<MessageTally & { planned: number }> {
  const { run, group, actor, recipients, words } = input;
  const planned = recipients.length;
  const tally: MessageTally = { sent: 0, held: 0, suppressed: 0, failed: 0 };
  let updateId: string;
  try {
    const actorSnap = await db.collection("users").doc(actor.uid).get();
    const senderName = actorSnap.exists ? displayNameOf(actorSnap.data() ?? {}) : actor.displayName?.trim() || "NAISI member";
    const runLine = run.courseTitle ? `${run.courseTitle}${run.label ? ` (${run.label})` : ""}` : run.label;
    const context = [group.name.trim(), runLine].filter(Boolean).join(" · ");
    const blocks = staffMessageBlocks(words.message, senderName, context);
    const preheader = staffPreheader(words.message);
    updateId = await postOnProgrammePage(db, {
      target: { tagId: "", programme: "", runId: run.id, to: "group", groupId: group.id, group: group.name },
      authorUid: actor.uid,
      title: words.title,
      message: words.message,
      planned,
    });
    await dispatchSends([...recipients], async (recipient) => {
      try {
        // ONE address. One message.
        const result = await sendNotice({
          to: recipient.address,
          subject: words.title,
          surface: "course-group",
          actorUid: actor.uid,
          referenceId: group.id,
          replyTo: UPDATE_REPLY_TO,
          render: (marker) => ApplicationEmail({ subject: words.title, blocks, preheader, notice: marker }),
        });
        if (result.held.length > 0) tally.held += 1;
        else if (result.suppressed.length > 0) tally.suppressed += 1;
        else tally.sent += 1;
      } catch (err) {
        // A uid, never an address.
        console.error("[courses session room] send failed", group.id, recipient.uid, err);
        tally.failed += 1;
      }
    });
  } catch (err) {
    console.error("[courses session room] the notice did not go", group.id, err);
    return { planned, sent: tally.sent, held: tally.held, suppressed: tally.suppressed, failed: planned - tally.sent - tally.held - tally.suppressed };
  }
  try {
    await settlePostedEmail(db, updateId, planned, tally);
  } catch (err) {
    console.error("[courses session room] could not record what the email did", group.id, updateId, err);
  }
  return { planned, ...tally };
}
