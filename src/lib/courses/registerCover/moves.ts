import "server-only";
import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { startMoves } from "@/lib/courses/sessionChange/metSessions";
import type { ResolvedSession } from "@/lib/courses/sessions";
import { COVER, FACILITATOR_RECORD, normalizeCourseAttendance, registerIsTaken } from "@/lib/firestore/courseAttendance";
import { coverOffOnMove } from "./model";
import { coverEndsWords, coverTakenOffDetail } from "./words";

/**
 * A COVER DOES NOT RIDE ALONG WHEN ITS SESSION MOVES. Every change that can
 * move the start of a session (one week's change, a new regular time, a
 * group's own pace, It didn't happen on a finished column) asks this inside
 * its own transaction, about the registers of the sessions whose start it
 * moves:
 *
 *  1. `coversOffOf`: which of those registers nobody has taken but somebody
 *     holds the cover of (`coverOffOnMove`), from the snapshots the change
 *     already read in its transaction;
 *  2. `coverHolderNames`: who was covering each, by the name they go by, read
 *     in the same transaction before anything is written;
 *  3. `writeCoversOff`: the cover and the entries it wrote in the facilitator
 *     record go, in the same transaction as the change;
 *  4. `coversOffWords`: what the change's own history row says about it.
 *
 * A CHANGE'S PREVIEW asks the same question of the same registers before
 * anything is pressed (`coversEndLines`): one line for each cover its press
 * would take off, naming the person and the session, so whoever presses
 * knows to tell the person who was given it.
 *
 * A register that is taken never moves (the change is refused), and one with
 * no cover is left as it is.
 */

/** One register a change takes a cover off. */
export type CoverOff = {
  ref: DocumentReference;
  weekNumber: number;
  occurrence: number;
  /** Who was covering it: who took it, or who it was given to. */
  byUid: string;
  /** The facilitators whose entry the cover wrote, by uid. */
  entries: string[];
};

/** One register of a session a change moves, with its snapshot as the change read it. */
export type MovedRegister = { ref: DocumentReference; weekNumber: number; occurrence: number; snap: DocumentSnapshot | undefined };

/**
 * The registers of every session whose start a change moves (`startMoves`),
 * each with its snapshot: `refs` and `snaps` are in `startMoves`'s order, as
 * a change reads them to refuse moving a session that met. What `coversOffOf`
 * and `coversEndLines` are asked of, for one week's change and for It didn't
 * happen on a finished column alike.
 */
export function startMovedRegisters(
  before: readonly ResolvedSession[],
  after: readonly ResolvedSession[],
  refs: readonly DocumentReference[],
  snaps: ReadonlyArray<DocumentSnapshot | undefined>,
): MovedRegister[] {
  return startMoves(before, after).map((move, index) => ({
    ref: refs[index],
    weekNumber: move.before.weekNumber,
    occurrence: move.before.occurrence,
    snap: snaps[index],
  }));
}

/** The registers, among those of the sessions a change moves, that lose their cover. */
export function coversOffOf(
  moved: ReadonlyArray<{ ref: DocumentReference; weekNumber: number; occurrence: number; snap: DocumentSnapshot | undefined }>,
): CoverOff[] {
  const out: CoverOff[] = [];
  for (const each of moved) {
    if (!each.snap?.exists) continue;
    const data = each.snap.data() ?? {};
    const off = coverOffOnMove(normalizeCourseAttendance(each.snap.id, data), registerIsTaken(data));
    if (off) out.push({ ref: each.ref, weekNumber: each.weekNumber, occurrence: each.occurrence, byUid: off.byUid, entries: off.entries });
  }
  return out;
}

/** Who was covering each, by the name they go by, through `getAll` (a transaction's, or the database's). */
async function holderNamesThrough(
  getAll: (refs: DocumentReference[]) => Promise<DocumentSnapshot[]>,
  db: Firestore,
  offs: readonly CoverOff[],
): Promise<Map<string, string>> {
  const uids = [...new Set(offs.map((off) => off.byUid))].filter((uid) => uid && !uid.includes("/"));
  const names = new Map<string, string>();
  if (uids.length === 0) return names;
  const snaps = await getAll(uids.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) names.set(snap.id, snap.exists ? displayNameOf(snap.data() ?? {}) : "NAISI member");
  return names;
}

/** Who was covering each, by the name they go by. A read: asked in the transaction before its first write. */
export async function coverHolderNames(tx: Transaction, db: Firestore, offs: readonly CoverOff[]): Promise<Map<string, string>> {
  return holderNamesThrough((refs) => tx.getAll(...refs), db, offs);
}

/** The cover and the entries it wrote go, merged key by key so nothing else of the register is touched. */
export function writeCoversOff(tx: Transaction, offs: readonly CoverOff[]): void {
  for (const off of offs) {
    tx.set(
      off.ref,
      {
        [COVER]: FieldValue.delete(),
        ...(off.entries.length > 0
          ? { [FACILITATOR_RECORD]: Object.fromEntries(off.entries.map((uid) => [uid, FieldValue.delete()])) }
          : {}),
      },
      { merge: true },
    );
  }
}

/** "Ola Nowak was covering week 4 at its old time, so that cover is taken off.", one sentence each, or "". */
export function coversOffWords(offs: readonly CoverOff[], names: ReadonlyMap<string, string>): string {
  return offs.map((off) => coverTakenOffDetail(names.get(off.byUid) ?? "NAISI member", off.weekNumber, off.occurrence)).join(" ");
}

/**
 * WHAT A CHANGE'S PREVIEW SAYS ABOUT COVERS: one line for each cover its
 * press would take off, "Ola Example’s cover of week 4’s session ends: the
 * session moves. Give it again if they can still take it.", from the same
 * `coversOffOf` the press asks, of the same registers, read here outside any
 * transaction because a preview writes nothing. Empty when no cover ends,
 * which is always so for a change that moves no session's start (keep pace).
 */
export async function coversEndLines(
  db: Firestore,
  moved: ReadonlyArray<{ ref: DocumentReference; weekNumber: number; occurrence: number; snap: DocumentSnapshot | undefined }>,
): Promise<string[]> {
  const offs = coversOffOf(moved);
  if (offs.length === 0) return [];
  const names = await holderNamesThrough((refs) => db.getAll(...refs), db, offs);
  return offs.map((off) => coverEndsWords(names.get(off.byUid) ?? "NAISI member", off.weekNumber, off.occurrence));
}
