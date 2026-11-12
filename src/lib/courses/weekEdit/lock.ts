import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { londonClockLabel } from "@/lib/courses/londonLabels";
import { instantOf } from "@/lib/courses/writtenAnswers/model";
import { weekDocRef } from "./history";
import { WEEK_LOCK_DOC, WEEK_LOCK_SUBCOLLECTION } from "./paths";
import { LOCK_WORDS } from "./words";

/**
 * ONE EDITOR AT A TIME, PER WEEK.
 *
 * The admin console's page lock (`adminLocks`, `AdminLockUI`) holds a whole
 * page while anybody is on it, is written straight from the browser and
 * admits admins alone. A run's weeks are edited by the programme's lead as
 * well, so this lock is its own: it holds ONE week, only while somebody has
 * an edit open, and lives server-only at
 * `courseRuns/{runId}/weeks/{weekId}/editLock/current`, written through the
 * week's lock routes (take, keep alive, give back) after the same gate the
 * editing routes ask.
 *
 * IT EXPIRES BY ITSELF. A hold not kept alive for `LOCK_TTL_MS` is no hold:
 * a closed tab or a lost connection frees the week without anybody giving it
 * back. Expiry is worked out from the stored time the holder last kept it
 * alive, never stored, so nothing has to sweep old holds away.
 *
 * WHAT IT STOPS. A save of the week by anybody else (an edit in place, a
 * paste, a restore) is refused with the holder's name while the hold is
 * live. Reading the week is never blocked, and other weeks stay free. A save
 * by somebody who holds nothing is not refused when nobody else holds the
 * week: the hold is a courtesy between two editors, not a key every save
 * needs, so an editor whose hold lapsed over lunch can still save.
 *
 * MESSAGES. The page lock's "send a message" writes to `adminLocks/{id}/messages`
 * from the browser, which the rules admit for admins alone, so it cannot
 * carry a lead's message, or a message to a lead, without a rules change.
 * This lock has none.
 */

export { WEEK_LOCK_DOC, WEEK_LOCK_SUBCOLLECTION };

/** How long a hold lasts without being kept alive. The page keeps it alive well inside this. */
export const LOCK_TTL_MS = 90_000;

/** How often a page should keep its hold alive: a third of the time a hold lasts. */
export const LOCK_KEEP_ALIVE_MS = 30_000;

export function weekLockRef(db: Firestore, runId: string, weekId: string): DocumentReference {
  return weekDocRef(db, runId, weekId).collection(WEEK_LOCK_SUBCOLLECTION).doc(WEEK_LOCK_DOC);
}

/** A stored hold, read: who, since when, and when it was last kept alive. Null when there is none. */
export type StoredHold = { holderUid: string; since: Date; keptAt: Date };

export function readHold(snap: DocumentSnapshot | { exists: boolean; data: () => Record<string, unknown> | undefined }): StoredHold | null {
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const holderUid = typeof data.holderUid === "string" ? data.holderUid : "";
  const since = instantOf(data.since);
  const keptAt = instantOf(data.keptAt);
  if (!holderUid || !since || !keptAt) return null;
  return { holderUid, since, keptAt };
}

/** Whether a stored hold still holds at `now`. */
export function holdIsLive(hold: StoredHold | null, now: Date): hold is StoredHold {
  return hold !== null && now.getTime() - hold.keptAt.getTime() < LOCK_TTL_MS;
}

/** Whether somebody other than `uid` holds the week at `now`. */
export function heldByAnother(hold: StoredHold | null, uid: string, now: Date): hold is StoredHold {
  return holdIsLive(hold, now) && hold.holderUid !== uid;
}

/** The lock as a page reads it. Never anybody's uid but the reader's own state, and the holder's first name. */
export type WeekLockState =
  | { state: "free" }
  | { state: "yours"; since: string; line: string; keepAliveMs: number }
  | { state: "held"; name: string; since: string; line: string };

/** The holder's first name, as the lock's banner names them; "Somebody" for an account that is gone. */
export async function holderNameOf(db: Firestore, uid: string): Promise<string> {
  const snap = await db.collection("users").doc(uid).get();
  const name = snap.exists ? firstNameOfUser((snap.data() ?? {}) as Record<string, unknown>) : "";
  return name || "Somebody";
}

/** The lock's state for `viewerUid` at `now`, in the page's words. */
export async function lockStateFor(
  db: Firestore,
  hold: StoredHold | null,
  viewerUid: string,
  weekNumber: number,
  now: Date,
): Promise<WeekLockState> {
  if (!holdIsLive(hold, now)) return { state: "free" };
  const since = londonClockLabel(hold.since);
  if (hold.holderUid === viewerUid) {
    return { state: "yours", since, line: LOCK_WORDS.yours(weekNumber), keepAliveMs: LOCK_KEEP_ALIVE_MS };
  }
  const name = await holderNameOf(db, hold.holderUid);
  return { state: "held", name, since, line: LOCK_WORDS.heldBy(name, weekNumber, since) };
}

/** The refusal a save meets while somebody else holds the week: 409, with the holder named. */
export async function heldRefusal(
  db: Firestore,
  hold: StoredHold,
  weekNumber: number,
): Promise<{ error: string; holder: { name: string; since: string } }> {
  const name = await holderNameOf(db, hold.holderUid);
  const since = londonClockLabel(hold.since);
  return { error: LOCK_WORDS.heldBy(name, weekNumber, since), holder: { name, since } };
}
