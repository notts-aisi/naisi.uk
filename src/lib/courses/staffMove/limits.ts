import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { DAY_MS, noticeSlotsIn, noticeSlotsRefusal, type NoticeWindow } from "@/lib/email/noticeCaps";
import type { MoveRefusal } from "./plan";

/**
 * HOW OFTEN THE MOVE BUTTON EMAILS: a move emails the person and each
 * facilitator of both groups, so the moves one person is put through, and
 * the moves one presser makes, are held to stored counters (the notice
 * lane's counters in `courseNudges` as `emailrate__<key>`, judged by
 * `src/lib/email/noticeCaps.ts`),
 * the way giving a session is (`GIVE_LIMITS` in the register cover route).
 *
 *  - A person is realistically moved once, rarely twice (a move and its
 *    undoing): four moves of one person in a day.
 *  - A presser closing two groups moves perhaps twenty people in a day:
 *    forty moves by one presser in a day.
 *
 * Both are read and claimed in the move's OWN transaction (`moveLimitsIn`),
 * so a refusal on either claims neither, moves nobody and emails nobody, and
 * a move changed under the press (409) claims nothing either; two presses
 * at once are decided by the transaction. Every move counts, whoever it
 * emails. The page and the route's preview read the same counters first
 * (`moveLimitRefusal`) and say the same sentence before the press.
 */
export const MOVE_LIMITS = {
  /** Moves of one person, by anybody, in a day. */
  perPersonDay: 4,
  /** Moves by one presser, of anybody, in a day. */
  perPresserDay: 40,
} as const;

/** The staff-facing sentences: what was not done, and what to do. */
export const MOVE_LIMIT_WORDS = {
  personDay: (firstName: string, limit: number) =>
    `${firstName.trim() || "They"} ${firstName.trim() ? "has" : "have"} been moved ${limit} times in the last day, so this move wasn’t made and nobody was emailed: try again tomorrow, or ask an admin.`,
  presserDay: (limit: number) =>
    `You’ve moved ${limit} people in the last day, so this move wasn’t made and nobody was emailed: try again tomorrow, or ask an admin.`,
  unread: "The limits on a move’s emails couldn’t be read, so nothing was moved and nobody was emailed. Try again.",
} as const;

/** The two counters a move by `actorUid` of `uid` is held to. */
export function moveLimitWindows(person: { uid: string; firstName: string }, actorUid: string): NoticeWindow[] {
  return [
    {
      key: `staffmoved__${person.uid}`,
      limit: MOVE_LIMITS.perPersonDay,
      windowMs: DAY_MS,
      refusal: MOVE_LIMIT_WORDS.personDay(person.firstName, MOVE_LIMITS.perPersonDay),
    },
    {
      key: `staffmover__${actorUid}`,
      limit: MOVE_LIMITS.perPresserDay,
      windowMs: DAY_MS,
      refusal: MOVE_LIMIT_WORDS.presserDay(MOVE_LIMITS.perPresserDay),
    },
  ];
}

/** The refusal a press would meet now, claiming nothing; null while both counters have room. */
export async function moveLimitRefusal(
  db: Firestore,
  person: { uid: string; firstName: string },
  actorUid: string,
): Promise<MoveRefusal | null> {
  try {
    const refused = await noticeSlotsRefusal(db, { windows: moveLimitWindows(person, actorUid), noun: "moves" });
    return refused ? { ok: false, status: 429, error: refused.refusal ?? MOVE_LIMIT_WORDS.unread } : null;
  } catch (err) {
    console.error("[staff move] limits read failed", person.uid, err);
    return { ok: false, status: 500, error: MOVE_LIMIT_WORDS.unread };
  }
}

/**
 * Both counters, read in the move's own transaction: the refusal, or null,
 * and `write`, which claims both and is called only when the move is written.
 * So a move refused, or changed under the press, claims nothing.
 */
export async function moveLimitsIn(
  tx: Transaction,
  db: Firestore,
  person: { uid: string; firstName: string },
  actorUid: string,
): Promise<{ refusal: string | null; write: () => void }> {
  const read = await noticeSlotsIn(tx, db, { windows: moveLimitWindows(person, actorUid), noun: "moves" });
  return { refusal: read.refusal ? (read.refusal.refusal ?? MOVE_LIMIT_WORDS.unread) : null, write: read.write };
}
