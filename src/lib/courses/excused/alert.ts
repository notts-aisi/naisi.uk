import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { addDaysToKey, londonDateKey } from "@/lib/courses/weekPlan";
import { excusedRequestUrl, sendExcusedEmail, type ExcusedEmailOutcome } from "@/lib/email/excusedEmail";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { newRequestEmailWords, soonWords, type ExcusedEmailWords, type NewRequestWeek } from "./words";

/**
 * THE ADMINS ARE TOLD A REQUEST TO BE EXCUSED HAS ARRIVED, so one made at
 * short notice is seen before its session. One email per request, to every
 * admin except the person asking and except an admin who has switched it
 * off on the Requests page ("Email me about new requests",
 * `users/{uid}.requestEmails.excused`, on unless a stored false). No
 * facilitator, no lead and never the person.
 *
 * TRANSACTIONAL in the notification classification: it is owed to the
 * admins who decide these, as the reminder to a group's facilitators is
 * owed to them, so no row of the profile grid gates it; its own switch does,
 * and the do-not-email list still holds it back.
 *
 * WHAT IT SAYS: who asked, the group, each week with its session's day and
 * time, when they asked, "for today" or "for tomorrow" when the first session
 * starts within 24 hours, and the way to the request's page. NEVER the reason,
 * never a meeting link (`newRequestEmailWords`).
 *
 * WHEN: after the request is written, outside its transaction. It never
 * throws: a failed send never fails the ask. It returns counts.
 *
 * HOW OFTEN: the first `ADMIN_EMAILS_A_DAY` asks by one person on one run in
 * one London day email the admins; later ones that day email nobody, and
 * still wait on the Requests page as usual. The ask decides it in its own
 * transaction, from the requests that already carry `adminsToldOn` for that
 * day (`adminsToldTodayIn`), and marks its own request when it tells them, so
 * the count is durable, server-only, and goes with the requests when the
 * account or the run does. Withdrawing frees a week to be asked again, so
 * without it a member asking and withdrawing in a loop would send every
 * admin an email each time, out of the allowance the whole site shares.
 */

/** Asks by one person on one run in one London day that email the admins. */
export const ADMIN_EMAILS_A_DAY = 3;

/**
 * How many of this person's asks on this run on `dateKey` emailed the admins,
 * up to the cap, read in the ask's transaction: three equalities
 * (`subjectUid`, `runId`, `adminsToldOn`), served by merging the automatic
 * single-field indexes, so no declared index.
 */
export async function adminsToldTodayIn(tx: Transaction, db: Firestore, uid: string, runId: string, dateKey: string): Promise<number> {
  const snap = await tx.get(
    db
      .collection(COURSE_REQUESTS_COLLECTION)
      .where("subjectUid", "==", uid)
      .where("runId", "==", runId)
      .where("adminsToldOn", "==", dateKey)
      .limit(ADMIN_EMAILS_A_DAY),
  );
  return snap.size;
}

/** Who reads this email: admins alone. */
const ADMIN_READER = { role: "admin" } as const;

/** Most admins read: an admin's document is the most PII-dense one this platform holds. */
const MAX_ADMINS = 50;

/**
 * THE SWITCHES "Email me about new requests" can read, each a key of
 * `users/{uid}.requestEmails` with its own default. Requests to be excused,
 * to go to another session and to change group are all on `excused`, on
 * unless an admin stored false, so the one switch an admin already has covers
 * them all. A
 * later kind adds its own key here, with its own default.
 *
 * Messages to the team (`src/lib/courses/teamAsk/ask.ts`) are on `team`, OFF
 * unless an admin stored true: "Email me about messages to the team", the
 * second switch on the Requests page.
 */
export const REQUEST_EMAIL_SWITCHES = { excused: { on: true }, team: { on: false } } as const;

export type RequestEmailSwitch = keyof typeof REQUEST_EMAIL_SWITCHES;

/** Whether a body's `which` names a switch: absent is the existing one. */
export function requestEmailSwitchOf(raw: unknown): RequestEmailSwitch | null {
  if (raw === undefined) return "excused";
  return typeof raw === "string" && Object.hasOwn(REQUEST_EMAIL_SWITCHES, raw) ? (raw as RequestEmailSwitch) : null;
}

/** Whether an admin's own switch lets this email through: its stored value, or the switch's default. */
export function wantsRequestEmails(data: Record<string, unknown>, which: RequestEmailSwitch = "excused"): boolean {
  const stored = data.requestEmails;
  const value = stored && typeof stored === "object" ? (stored as Record<string, unknown>)[which] : undefined;
  return typeof value === "boolean" ? value : REQUEST_EMAIL_SWITCHES[which].on;
}

export type RequestAlertOutcome = { sent: number; failed: number; skipped: number };

/**
 * THE ONE SEND OF EVERY ALERT ABOUT A NEW REQUEST: finished words and the
 * link, to every admin except the person asking and except an admin whose
 * own switch (`which`) is off. Never throws; returns counts. Through the
 * door of requests to be excused (`sendExcusedEmail`, audience admin).
 *
 * `namesNobody` is for an alert that must not say who asked (a message about
 * access needs): the person asking is still left out of the recipients, and
 * the send's row in the email log, which outlives the account, carries no
 * actor, so nothing kept after the email ties the alert to a person.
 */
export async function emailAdminsWords(
  db: Firestore,
  input: { runId: string; askerUid: string; words: ExcusedEmailWords; link: string; which?: RequestEmailSwitch; namesNobody?: boolean },
): Promise<RequestAlertOutcome> {
  const done: RequestAlertOutcome = { sent: 0, failed: 0, skipped: 0 };
  const which = input.which ?? "excused";
  try {
    const admins = await db.collection("users").where("role", "==", "admin").limit(MAX_ADMINS).get();
    for (const doc of admins.docs) {
      const data = doc.data() ?? {};
      const email = typeof data.email === "string" ? data.email.trim() : "";
      // Never the person asking, never an admin who switched it off, never an account with no address.
      if (doc.id === input.askerUid || data.role !== "admin" || !email || !wantsRequestEmails(data, which)) {
        done.skipped += 1;
        continue;
      }
      const own = accountNamesOf(data);
      const outcome: ExcusedEmailOutcome = await sendExcusedEmail({
        to: email,
        name: (own.goBy ?? "").split(/\s+/)[0] ?? "",
        actorUid: input.namesNobody ? undefined : input.askerUid,
        runId: input.runId,
        audience: "admin",
        link: input.link,
        words: input.words,
      });
      if (outcome === "failed") done.failed += 1;
      else done.sent += 1;
    }
  } catch (err) {
    console.error("[request email] could not tell the admins", input.runId, err instanceof Error ? err.message : "unknown");
    done.failed += 1;
  }
  return done;
}

/** The admins' name for the person asking, as the rule names them for an admin. */
export async function askerNameForAdmins(db: Firestore, askerUid: string): Promise<string> {
  const asker = await db.collection("users").doc(askerUid).get();
  return nameForViewer(ADMIN_READER, accountNamesOf(asker.exists ? (asker.data() ?? {}) : {}), "");
}

export async function emailAdminsAboutRequest(
  db: Firestore,
  input: {
    requestId: string;
    runId: string;
    askerUid: string;
    groupName: string;
    weeks: readonly NewRequestWeek[];
    askedAt: Date;
    now: Date;
  },
): Promise<RequestAlertOutcome> {
  try {
    const todayKey = londonDateKey(input.now);
    // Every reader is an admin (the send skips anybody else), so the person is
    // named as the rule names them for an admin.
    const personName = await askerNameForAdmins(db, input.askerUid);
    const words = newRequestEmailWords({
      personName,
      groupName: input.groupName,
      weeks: input.weeks,
      askedAt: input.askedAt,
      now: input.now,
      soon: soonWords(input.weeks, input.now, todayKey, addDaysToKey(todayKey, 1), londonDateKey),
    });
    const link = excusedRequestUrl(process.env.NEXT_PUBLIC_APP_URL ?? "", input.requestId);
    return await emailAdminsWords(db, { runId: input.runId, askerUid: input.askerUid, words, link, which: "excused" });
  } catch (err) {
    console.error("[excused request email] could not tell the admins", input.runId, err instanceof Error ? err.message : "unknown");
    return { sent: 0, failed: 1, skipped: 0 };
  }
}
