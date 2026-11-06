import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import FacilitatorReminderEmail from "@/emails/FacilitatorReminderEmail";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { facilitatorsOf, type RunRecords } from "@/lib/courses/programmeAttendance";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { sendEmail } from "@/lib/email/send";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { isSuppressed } from "@/lib/firestore/suppression";
import { windowState, type CheckInWindow } from "./model";
import { facilitatorReminderWords, type ReminderNeed } from "./words";

/**
 * "REMIND 2 FACILITATORS", AN ADMIN'S PRESS ON THE CHECK-INS VIEW: one email
 * to a group's live facilitators saying a session's check-in, or its
 * register, is not done, with the way to the register.
 *
 *  - WHAT IS NOT DONE (`reminderNeedOf`), once the session has ended and only if
 *    it happened: its register is not finished, or its check-in has not been
 *    opened while its facilitators can still open it (the session's window,
 *    until 11pm the next day). Past that window an admin can open it late
 *    themselves, so nobody is asked to.
 *  - WHO (`facilitatorRecipients`): the group's facilitators while their accounts
 *    stand behind the role (`facilitatorsOf`, the Attendance tab's own list),
 *    each with an address and not on the do-not-email list, so the number on
 *    the button is the number emailed. Never anybody holding a place.
 *  - TRANSACTIONAL: about the session the facilitator runs, owed to them by
 *    the press, so it reads no notification setting and is no notice.
 *  - AT MOST ONCE A SESSION A LONDON DAY: the press claims one marker in
 *    `courseNudges` (`cinudge__{runId}__{groupId}__{sessionKey}__{dateKey}`,
 *    with the run on it, so destroying the run sweeps it) BEFORE the first
 *    email, so two presses at once email once; when every send fails the
 *    marker is given back, so a later press can try again. The marker names
 *    the session and who pressed, never a facilitator or an address.
 */

const NUDGES = "courseNudges";

/** One session's reminder on one London day. CONSTRUCT-ONLY, NEVER PARSE: run and group ids already contain `__`. */
export function facilitatorReminderMarkerId(runId: string, groupId: string, sessionKey: string, dateKey: string): string {
  return `cinudge__${runId}__${groupId}__${sessionKey}__${dateKey}`;
}

/** What is not done about a session, and until when its check-in can still be opened by its facilitators. */
export type ReminderFacts = ReminderNeed & { checkInClosesAt: Date | null };

/**
 * WHAT A FACILITATOR HAS LEFT TO DO about one session, or null when nothing
 * is: before it has ended, when it did not happen, and once its register is
 * finished and its check-in opened (or past the time they could open it).
 */
export function reminderNeedOf(
  facts: { held: boolean; ended: boolean; finished: boolean; hasCheckIn: boolean; window: CheckInWindow | null },
  now: Date,
): ReminderFacts | null {
  if (!facts.held || !facts.ended) return null;
  const canOpen = !facts.hasCheckIn && facts.window !== null && windowState(facts.window, now) === "now";
  const need: ReminderFacts = {
    register: !facts.finished,
    checkIn: canOpen,
    checkInClosesAt: canOpen && facts.window ? facts.window.closesAt : null,
  };
  return need.register || need.checkIn ? need : null;
}

/** A facilitator the press emails. The address never leaves the server. */
export type FacilitatorRecipient = { uid: string; firstName: string; to: string };

/** The group's live facilitators a press emails now: standing behind the role, with an address, not on the do-not-email list. */
export async function facilitatorRecipients(db: Firestore, records: RunRecords, group: CourseGroupDoc): Promise<FacilitatorRecipient[]> {
  const out: FacilitatorRecipient[] = [];
  for (const person of facilitatorsOf(records, group)) {
    const data = records.accounts.get(person.uid);
    const to = typeof data?.email === "string" ? data.email.trim() : "";
    if (!to || (await isSuppressed(db, to))) continue;
    out.push({ uid: person.uid, firstName: person.firstName, to });
  }
  return out;
}

/** When the session's facilitators were reminded today (London), or null. */
export async function remindedTodayAt(db: Firestore, runId: string, groupId: string, sessionKey: string, now: Date): Promise<Date | null> {
  const snap = await db.collection(NUDGES).doc(facilitatorReminderMarkerId(runId, groupId, sessionKey, londonDateKey(now))).get();
  if (!snap.exists) return null;
  const at = (snap.data() ?? {}).claimedAt as { toDate?: () => Date } | Date | null | undefined;
  if (at instanceof Date) return at;
  return at && typeof at.toDate === "function" ? at.toDate() : now;
}

function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

/** Where "Open the register" goes: the group's own register page, as a whole address on this site. */
export function registerUrl(appUrl: string, runId: string, groupId: string): string {
  return `${appUrl}/learn/${encodeURIComponent(runId)}/group/${encodeURIComponent(groupId)}/register`;
}

export type FacilitatorReminderOutcome = { ok: true; emailed: number; failed: number } | { ok: false; reason: "already" };

/**
 * Claim the day's marker, then email each facilitator, one message each.
 * Answers how many were handed to the mail door and how many failed; a press
 * whose every send failed gives the marker back.
 */
export async function sendFacilitatorReminder(
  db: Firestore,
  input: {
    runId: string;
    group: Pick<CourseGroupDoc, "id" | "name">;
    sessionKey: string;
    sessionStartsAt: Date;
    need: ReminderFacts;
    /** The register's own word for ending it. */
    ended: "finished" | "pushed";
    recipients: readonly FacilitatorRecipient[];
    appUrl: string;
    byUid: string;
    now: Date;
  },
): Promise<FacilitatorReminderOutcome> {
  const dateKey = londonDateKey(input.now);
  const ref = db.collection(NUDGES).doc(facilitatorReminderMarkerId(input.runId, input.group.id, input.sessionKey, dateKey));
  try {
    await ref.create({
      kind: "check-in-facilitators",
      runId: input.runId,
      groupId: input.group.id,
      sessionKey: input.sessionKey,
      dateKey,
      byUid: input.byUid,
      state: "sending",
      claimedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (isAlreadyExists(err)) return { ok: false, reason: "already" };
    throw err;
  }
  const presser = await db.collection("users").doc(input.byUid).get();
  const signer = presser.exists ? firstNameOfUser((presser.data() ?? {}) as Record<string, unknown>) : "";
  const words = facilitatorReminderWords({
    groupName: input.group.name,
    sessionStartsAt: input.sessionStartsAt,
    need: input.need,
    checkInClosesAt: input.need.checkInClosesAt,
    ended: input.ended,
    signer,
  });
  const link = registerUrl(input.appUrl, input.runId, input.group.id);
  let emailed = 0;
  let failed = 0;
  for (const person of input.recipients) {
    try {
      // ONE address. One message. Never an array, never a Cc.
      await sendEmail({
        to: person.to,
        subject: words.subject,
        // Operational mail to a group's staff, the kind the register reminder carries in the send log.
        kind: "course-facilitator",
        actorUid: input.byUid,
        referenceId: input.runId,
        react: FacilitatorReminderEmail({
          subject: words.subject,
          recipientName: person.firstName,
          paragraphs: words.paragraphs,
          button: words.button,
          registerLink: link,
          signOff: words.signOff,
        }),
      });
      emailed += 1;
    } catch (err) {
      // A uid, never an address.
      console.error("[check-ins] facilitator reminder failed", input.runId, input.group.id, person.uid, err);
      failed += 1;
    }
  }
  if (emailed === 0) {
    await ref.delete().catch(() => undefined);
  } else {
    await ref.update({ state: "sent", emailed, settledAt: FieldValue.serverTimestamp() }).catch(() => undefined);
  }
  return { ok: true, emailed, failed };
}
