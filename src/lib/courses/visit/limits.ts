import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { DAY_MS, fullNoticeWindow, reserveNoticeSlots, type NoticeWindow } from "@/lib/email/noticeCaps";
import type { VisitRefusal } from "./plan";
import { VISIT_LIMIT_WORDS } from "./words";

/**
 * A DURABLE LIMIT ON THE EMAILS OF ARRANGING AND CALLING OFF A VISIT, as the
 * register's cover limits its own (`reserveNoticeSlots`, the notice lane's
 * stored counters): each press emails the person and both groups'
 * facilitators, so presses are counted per person visited and per presser,
 * over a day, and at either limit the press is REFUSED before anything is
 * written or sent. Generous enough that honest use never meets it: a person's
 * visits changed ten times in a day, or one presser's forty.
 *
 * Keyed by uid alone (never by a run from the address), so a press about a
 * run that does not exist can never make a counter of its own.
 */
export const VISIT_SEND_LIMITS = { perPersonDay: 10, perPresserDay: 40 } as const;

/** The two windows of one press: the person visited, and whoever pressed. */
export function visitSendWindows(personUid: string, presserUid: string): NoticeWindow[] {
  return [
    { key: `visitperson__${personUid}`, limit: VISIT_SEND_LIMITS.perPersonDay, windowMs: DAY_MS, refusal: VISIT_LIMIT_WORDS.person(VISIT_SEND_LIMITS.perPersonDay) },
    { key: `visitpresser__${presserUid}`, limit: VISIT_SEND_LIMITS.perPresserDay, windowMs: DAY_MS, refusal: VISIT_LIMIT_WORDS.presser(VISIT_SEND_LIMITS.perPresserDay) },
  ];
}

/** Claim one press against both windows, or refuse: 429 at a limit, 500 when the counters cannot be read (fail closed). */
export async function claimVisitPress(db: Firestore, personUid: string, presserUid: string): Promise<VisitRefusal | null> {
  const [person, presser] = visitSendWindows(personUid, presserUid);
  try {
    const claim = await reserveNoticeSlots(db, { day: person, also: personUid === presserUid ? [] : [presser], noun: "emails" });
    return claim.ok ? null : { ok: false, status: 429, error: claim.refusal ?? VISIT_LIMIT_WORDS.unread };
  } catch (err) {
    console.error("[courses visit] limits read failed", personUid, err);
    return { ok: false, status: 500, error: VISIT_LIMIT_WORDS.unread };
  }
}

/** What the page says before a press: the sentence a press now would be refused with, or null. Read only. */
export async function visitPressLimit(db: Firestore, personUid: string, presserUid: string): Promise<string | null> {
  const windows = visitSendWindows(personUid, presserUid).filter((window, index) => index === 0 || personUid !== presserUid);
  try {
    return (await fullNoticeWindow(db, windows))?.refusal ?? null;
  } catch {
    return VISIT_LIMIT_WORDS.unread;
  }
}
