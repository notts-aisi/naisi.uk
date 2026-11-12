import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { addDaysToKey, londonDateKey } from "@/lib/courses/weekPlan";
import { excusedRequestUrl, sendExcusedEmail, type ExcusedEmailOutcome } from "@/lib/email/excusedEmail";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { newRequestEmailWords, soonWords, type NewRequestWeek } from "./words";

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
 */

/** Who reads this email: admins alone. */
const ADMIN_READER = { role: "admin" } as const;

/** Most admins read: an admin's document is the most PII-dense one this platform holds. */
const MAX_ADMINS = 50;

/** Whether an admin's own switch lets this email through: on unless they stored false. */
export function wantsRequestEmails(data: Record<string, unknown>): boolean {
  const stored = data.requestEmails;
  return !(stored && typeof stored === "object" && (stored as { excused?: unknown }).excused === false);
}

export type RequestAlertOutcome = { sent: number; failed: number; skipped: number };

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
  const done: RequestAlertOutcome = { sent: 0, failed: 0, skipped: 0 };
  try {
    const [admins, asker] = await Promise.all([
      db.collection("users").where("role", "==", "admin").limit(MAX_ADMINS).get(),
      db.collection("users").doc(input.askerUid).get(),
    ]);
    const todayKey = londonDateKey(input.now);
    // Every reader is an admin (the loop skips anybody else), so the person is
    // named as the rule names them for an admin.
    const personName = nameForViewer(ADMIN_READER, accountNamesOf(asker.exists ? (asker.data() ?? {}) : {}), "");
    const words = newRequestEmailWords({
      personName,
      groupName: input.groupName,
      weeks: input.weeks,
      askedAt: input.askedAt,
      now: input.now,
      soon: soonWords(input.weeks, input.now, todayKey, addDaysToKey(todayKey, 1), londonDateKey),
    });
    const link = excusedRequestUrl(process.env.NEXT_PUBLIC_APP_URL ?? "", input.requestId);
    for (const doc of admins.docs) {
      const data = doc.data() ?? {};
      const email = typeof data.email === "string" ? data.email.trim() : "";
      // Never the person asking, never an admin who switched it off, never an account with no address.
      if (doc.id === input.askerUid || data.role !== "admin" || !email || !wantsRequestEmails(data)) {
        done.skipped += 1;
        continue;
      }
      const own = accountNamesOf(data);
      const outcome: ExcusedEmailOutcome = await sendExcusedEmail({
        to: email,
        name: (own.goBy ?? "").split(/\s+/)[0] ?? "",
        actorUid: input.askerUid,
        runId: input.runId,
        audience: "admin",
        link,
        words,
      });
      if (outcome === "failed") done.failed += 1;
      else done.sent += 1;
    }
  } catch (err) {
    console.error("[excused request email] could not tell the admins", input.runId, err instanceof Error ? err.message : "unknown");
    done.failed += 1;
  }
  return done;
}
