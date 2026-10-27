import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import WhenFreeReminderEmail from "@/emails/WhenFreeReminderEmail";
import type { PersonRow } from "@/lib/applications/people/views";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { sendEmail } from "@/lib/email/send";
import { firstWord } from "@/lib/firestore/applicationEmails";
import { courseEnrolmentId, normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import { FREE_REMINDER_REPLY_TO, type FreeReminderEmail } from "./words";

/**
 * "REMIND 3 PEOPLE" ON THE CARD OF WHO HAS NOT SAID WHEN THEY ARE FREE (boards
 * st-overview and st-overview-phone): who it emails, and the sending.
 *
 * ## Who
 *
 * Somebody on the card (the People tab's own "Not said when they’re free":
 * holding a place, and sent the form with no week painted) whose "When you’re
 * free" is still theirs to add: a fellowship's place, until Publish has told
 * them their group (their own seat, read by its id, asked `placementIsTold`,
 * the one answer every reader of a placement asks; once told, the week is the
 * group's and the application page shuts it). Nothing of a seat is shown. With an address on their account, and not reminded already
 * today: each reminder claims a marker for the person and the London day
 * before it goes, so a second press the same day, or two presses at once,
 * email nobody twice. A send that fails gives its marker back.
 *
 * ## The count is a promise
 *
 * The button shows how many this emails (C20). The route reads who again,
 * and refuses a press whose number is no longer that, as every counted button
 * on the site does.
 *
 * The marker lives in `courseNudges`, the server-only collection the course
 * emails keep their markers in, with `runId` on it, so destroying the run
 * sweeps it. No address is kept on it and none leaves this module.
 */

const NUDGES = "courseNudges";

/** One person's reminder on one London day. CONSTRUCT-ONLY, NEVER PARSE: run ids already contain `__`. */
export function freeReminderMarkerId(runId: string, uid: string, dateKey: string): string {
  return `freeremind__${runId}__${uid}__${dateKey}`;
}

export type FreeRemindable = {
  uid: string;
  /** The name the card says. */
  name: string;
  /** What the email calls them. */
  firstName: string;
  /** Their account's own address. Never sent to a browser. */
  to: string;
};

export type FreeReminders = {
  /** Who a press emails now. */
  sendable: FreeRemindable[];
  /** The first names of those on the card already reminded today. */
  remindedToday: string[];
  /** Those on the card Publish has told their group (uids): their page to say when they are free has shut. */
  told: string[];
};

function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

function addressOf(data: Record<string, unknown> | undefined): string {
  return typeof data?.email === "string" ? data.email.trim() : "";
}

/**
 * Who a press of "Remind" emails now, of the people on the card (`notSaid`,
 * the People tab's own rows under "Not said when they’re free"), for a
 * fellowship's run. An incubator's people say nothing of when they are free
 * after the form, so nobody is reminded there.
 */
export async function readFreeReminders(
  db: Firestore,
  runId: string,
  notSaid: readonly PersonRow[],
  fellowship: boolean,
  now: Date,
): Promise<FreeReminders> {
  if (!fellowship || notSaid.length === 0) return { sendable: [], remindedToday: [], told: [] };
  // Each person's own seat on the run, by its one id. Publish has told them
  // their group: their week is the group's now, and nobody is reminded.
  const seats = await db.getAll(
    ...notSaid.map((row) => db.collection("courseEnrolments").doc(courseEnrolmentId(runId, row.uid))),
  );
  const isTold = notSaid.map((_, at) =>
    seats[at].exists ? placementIsTold(normalizeCourseEnrolment(seats[at].id, seats[at].data() ?? {})) : false,
  );
  const told = notSaid.filter((_, at) => isTold[at]).map((row) => row.uid);
  const open = notSaid.filter((_, at) => !isTold[at]);
  if (open.length === 0) return { sendable: [], remindedToday: [], told };
  const dateKey = londonDateKey(now);
  const [accounts, markers] = await Promise.all([
    db.getAll(...open.map((row) => db.collection("users").doc(row.uid))),
    db.getAll(...open.map((row) => db.collection(NUDGES).doc(freeReminderMarkerId(runId, row.uid, dateKey)))),
  ]);
  const sendable: FreeRemindable[] = [];
  const remindedToday: string[] = [];
  open.forEach((row, at) => {
    const firstName = row.firstName || firstWord(row.name);
    if (markers[at].exists) {
      remindedToday.push(firstName);
      return;
    }
    const to = accounts[at].exists ? addressOf(accounts[at].data()) : "";
    if (!to) return;
    sendable.push({ uid: row.uid, name: row.name, firstName, to });
  });
  return { sendable, remindedToday, told };
}

/**
 * What a press did: how many reminders were handed to the mail door (held by
 * this copy of the site or stopped by the do-not-email list included, as
 * Publish counts them), how many sends failed, and the first names of those
 * emailed.
 */
export type FreeRemindResult = { emailed: number; failed: number; names: string[] };

/**
 * Send each reminder, claiming its marker first. Somebody whose marker is
 * already there (another press today) is left out; a send that throws gives
 * the marker back so a later press tries again.
 */
export async function sendFreeReminders(
  db: Firestore,
  input: {
    runId: string;
    sendable: readonly FreeRemindable[];
    compose: (person: FreeRemindable) => FreeReminderEmail;
    actorUid: string;
    now: Date;
  },
): Promise<FreeRemindResult> {
  const dateKey = londonDateKey(input.now);
  const result: FreeRemindResult = { emailed: 0, failed: 0, names: [] };
  for (const person of input.sendable) {
    const ref = db.collection(NUDGES).doc(freeReminderMarkerId(input.runId, person.uid, dateKey));
    try {
      await ref.create({
        kind: "free-reminder",
        runId: input.runId,
        uid: person.uid,
        dateKey,
        byUid: input.actorUid,
        state: "sending",
        claimedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      // Claimed already: reminded today by another press.
      if (isAlreadyExists(err)) continue;
      throw err;
    }
    const email = input.compose(person);
    try {
      const sent = await sendEmail({
        to: person.to,
        subject: email.subject,
        react: WhenFreeReminderEmail({ email }),
        replyTo: FREE_REMINDER_REPLY_TO,
        kind: "course-application",
        actorUid: input.actorUid,
        referenceId: input.runId,
      });
      const delivery = sent.delivered.length > 0 ? "sent" : sent.held.length > 0 ? "held" : "suppressed";
      await ref.update({ state: delivery, settledAt: FieldValue.serverTimestamp() });
      result.emailed += 1;
      result.names.push(person.firstName);
    } catch (err) {
      console.error("[when free reminder] send failed", input.runId, err);
      await ref.delete().catch(() => undefined);
      result.failed += 1;
    }
  }
  return result;
}
