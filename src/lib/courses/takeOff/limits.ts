import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { DAY_MS, noticeSlotsIn, noticeSlotsRefusal, type NoticeWindow } from "@/lib/email/noticeCaps";
import { TAKE_OFF_LIMIT_WORDS } from "./words";

/**
 * HOW OFTEN TAKING SOMEBODY OFF A RUN EMAILS. Every press emails the person,
 * and the facilitators of the group Publish had told them about, so the
 * presses one person is put through on one run, and the presses one presser
 * makes, are held to stored counters, the way a move to another group is
 * (`../staffMove/limits.ts`): the notice lane's counters in `courseNudges` as
 * `emailrate__<key>`, judged by `src/lib/email/noticeCaps.ts`.
 *
 *  - A person is taken off once, rarely twice in a day (off, put back by
 *    mistake, off again): four times on one run in a day.
 *  - A presser tidying a run after a week of people going quiet takes off
 *    perhaps twenty in a day: forty presses by one presser in a day.
 *
 * Both are read and claimed in the removal's OWN transaction
 * (`takeOffLimitsIn`), so a refusal on either claims neither, writes nothing
 * and emails nobody, and a press whose count changed under it (409) claims
 * nothing either. A press that emails nobody is never counted. The preview
 * reads the same counters first (`takeOffLimitRefusal`) and says the same
 * sentence before the press. A visit still to come is held to the visits'
 * own limits besides (`../visit/limits.ts`), as it always was.
 */
export const TAKE_OFF_LIMITS = {
  /** Presses about one person on one run, by anybody, in a day. */
  perPersonDay: 4,
  /** Presses by one presser, about anybody, in a day. */
  perPresserDay: 40,
} as const;

/** The two counters a press by `actorUid` about `person` on run `runId` is held to. */
export function takeOffLimitWindows(runId: string, person: { uid: string; firstName: string }, actorUid: string): NoticeWindow[] {
  return [
    {
      key: `takenoff__${runId}__${person.uid}`,
      limit: TAKE_OFF_LIMITS.perPersonDay,
      windowMs: DAY_MS,
      refusal: TAKE_OFF_LIMIT_WORDS.person(person.firstName, TAKE_OFF_LIMITS.perPersonDay),
    },
    {
      key: `takeoffpresser__${actorUid}`,
      limit: TAKE_OFF_LIMITS.perPresserDay,
      windowMs: DAY_MS,
      refusal: TAKE_OFF_LIMIT_WORDS.presser(TAKE_OFF_LIMITS.perPresserDay),
    },
  ];
}

/** The sentence a press would be refused with now, claiming nothing; null while both counters have room. */
export async function takeOffLimitRefusal(db: Firestore, runId: string, person: { uid: string; firstName: string }, actorUid: string): Promise<string | null> {
  try {
    const refused = await noticeSlotsRefusal(db, { windows: takeOffLimitWindows(runId, person, actorUid), noun: "emails" });
    return refused ? (refused.refusal ?? TAKE_OFF_LIMIT_WORDS.unread) : null;
  } catch (err) {
    console.error("[courses take off] limits read failed", person.uid, err);
    return TAKE_OFF_LIMIT_WORDS.unread;
  }
}

/**
 * Both counters, read in the removal's own transaction after its other
 * reads: the refusal, or null, and `write`, which claims both and is called
 * only with the removal's own writes.
 */
export async function takeOffLimitsIn(
  tx: Transaction,
  db: Firestore,
  runId: string,
  person: { uid: string; firstName: string },
  actorUid: string,
): Promise<{ refusal: string | null; write: () => void }> {
  const read = await noticeSlotsIn(tx, db, { windows: takeOffLimitWindows(runId, person, actorUid), noun: "emails" });
  return { refusal: read.refusal ? (read.refusal.refusal ?? TAKE_OFF_LIMIT_WORDS.unread) : null, write: read.write };
}
