import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { DAY_MS, noticeSlotsIn, noticeSlotsRefusal, type NoticeWindow } from "@/lib/email/noticeCaps";
import { VISIT_LIMIT_WORDS } from "./words";

/**
 * A DURABLE LIMIT ON THE EMAILS OF STAFF ARRANGING AND CALLING OFF A VISIT,
 * held to the notice lane's stored counters (`courseNudges`,
 * `emailrate__<key>`, judged by `src/lib/email/noticeCaps.ts`), as a move to
 * another group is held to its own (`../staffMove/limits.ts`): each press
 * emails the person and both groups' facilitators, so presses are counted
 * per person visited ON ONE RUN and per presser, over a day. Generous enough
 * that honest use never meets it: one person's visits on a run changed ten
 * times in a day, or one presser's forty.
 *
 * Both are read and claimed in the save's OWN transaction (`visitLimitsIn`),
 * so a press refused at a limit, a press refused for any other reason, a 409
 * because the facts changed under it, and a commit that fails all claim
 * nothing. The page and the route's preview read the same counters first
 * (`visitLimitRefusal`) and say the same sentence before the press.
 *
 * THE PERSON'S OWN CANCEL IS NEVER COUNTED AND NEVER REFUSED FOR A LIMIT: it
 * emails only the two groups' facilitators, once a visit, and a person who
 * could not cancel their own visit would be held to a session they cannot go to.
 */
export const VISIT_SEND_LIMITS = { perPersonDay: 10, perPresserDay: 40 } as const;

/**
 * The windows of one staff press: the person visited on this run, and
 * whoever pressed (one window when somebody presses about themselves). The
 * run is read and checked before either is asked, so a counter is only ever
 * kept for a run that exists.
 */
export function visitSendWindows(runId: string, personUid: string, presserUid: string): NoticeWindow[] {
  const person: NoticeWindow = {
    key: `visitperson__${runId}__${personUid}`,
    limit: VISIT_SEND_LIMITS.perPersonDay,
    windowMs: DAY_MS,
    refusal: VISIT_LIMIT_WORDS.person(VISIT_SEND_LIMITS.perPersonDay),
  };
  if (personUid === presserUid) return [person];
  return [
    person,
    { key: `visitpresser__${presserUid}`, limit: VISIT_SEND_LIMITS.perPresserDay, windowMs: DAY_MS, refusal: VISIT_LIMIT_WORDS.presser(VISIT_SEND_LIMITS.perPresserDay) },
  ];
}

/** What the page and the preview say before a press: the sentence a press now would be refused with, or null. Claims nothing. */
export async function visitLimitRefusal(db: Firestore, runId: string, personUid: string, presserUid: string): Promise<string | null> {
  try {
    const refused = await noticeSlotsRefusal(db, { windows: visitSendWindows(runId, personUid, presserUid), noun: "emails" });
    return refused ? (refused.refusal ?? VISIT_LIMIT_WORDS.unread) : null;
  } catch (err) {
    console.error("[courses visit] limits read failed", personUid, err);
    return VISIT_LIMIT_WORDS.unread;
  }
}

/**
 * Both counters, read in the save's own transaction, after its other reads
 * and checks: the refusal, or null, and `write`, which claims them and is
 * called only with the save's own writes.
 */
export async function visitLimitsIn(
  tx: Transaction,
  db: Firestore,
  runId: string,
  personUid: string,
  presserUid: string,
): Promise<{ refusal: string | null; write: () => void }> {
  const read = await noticeSlotsIn(tx, db, { windows: visitSendWindows(runId, personUid, presserUid), noun: "emails" });
  return { refusal: read.refusal ? (read.refusal.refusal ?? VISIT_LIMIT_WORDS.unread) : null, write: read.write };
}
