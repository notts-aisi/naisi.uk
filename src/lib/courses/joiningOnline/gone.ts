import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { EXCUSED_IN_ADVANCE, ONLINE_EMAILED, ONLINE_SAID, SET_BY, attendanceDocId } from "@/lib/firestore/courseAttendance";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/*
 * Its own module, beside the one write of the word (`./seat.ts`), so the
 * writers that end a visit or approve an excusal can ask it without reaching
 * the joining-online email, which itself reads from the excusal module.
 */

/**
 * A PERSON'S "JOINING ONLINE" WORD GOES WITH THEIR PLACE AT THE SESSION: the
 * one rule every way a visit ends asks of the host's register for that
 * session (the person's own cancel and staff's, the host's session called
 * off, the person taken off the run, leaving it, or placed in a group they
 * now facilitate), and an approved excusal asks of the session it excuses.
 *
 * What goes, from a register that is not finished (a finished one is a
 * record, and is never rewritten here): their word (`onlineSaid`), the stamp
 * that says its email went (`onlineEmailed`), so that if they are due at the
 * session again and say it again its facilitators are told, as their last
 * word was that the person was not coming; and the stamp on their line that
 * says they set it (`setBy`, when it is theirs, `how: "self"`, and the line
 * holds no mark and no word that they can't make it, whose stamp it would
 * be), so a line with no word names nobody. `keepSetBy` leaves that stamp for
 * a caller that writes the line's stamp itself in the same write.
 *
 * Why this cannot email in a loop: the email goes only when the person
 * presses "I'm joining online" for a session they are due at, so between two
 * emails about the same session somebody else has to make them due at it
 * again, which only an admin or the programme's lead can do (arranging a
 * visit, held to its own limits on emails a day, or approving a request),
 * and that press itself tells the same facilitators. Taking the word back
 * and saying it again, the only thing the person can do alone, keeps the
 * stamp and sends nothing.
 *
 * Null when there is nothing to take away. The patch is written with
 * `merge`.
 */
export function onlineWordGone(data: Record<string, unknown> | undefined, uid: string, options: { keepSetBy?: boolean } = {}): Record<string, unknown> | null {
  if (!data || data.pushedAt) return null;
  const has = (field: string) => Object.hasOwn((data[field] ?? {}) as Record<string, unknown>, uid);
  const said = has(ONLINE_SAID);
  const emailed = has(ONLINE_EMAILED);
  const stamp = ((data[SET_BY] ?? {}) as Record<string, { how?: unknown } | undefined>)[uid];
  const ownStamp = !options.keepSetBy && said && stamp?.how === "self" && !has("records") && !has(EXCUSED_IN_ADVANCE);
  if (!said && !emailed) return null;
  return {
    ...(said ? { [ONLINE_SAID]: { [uid]: FieldValue.delete() } } : {}),
    ...(emailed ? { [ONLINE_EMAILED]: { [uid]: FieldValue.delete() } } : {}),
    ...(ownStamp ? { [SET_BY]: { [uid]: FieldValue.delete() } } : {}),
  };
}

/**
 * The visits a place loses, read in the caller's transaction before its
 * writes: each host's register for that week's session, and what
 * `onlineWordGone` takes off it, written by the thunk with the caller's
 * other writes. Sessions that have started are left as they are: what was
 * said about a session that has begun is part of its record.
 */
export async function onlineWordsGoWithVisitsIn(
  tx: Transaction,
  db: Firestore,
  input: { run: CourseRunDoc; uid: string; visits: readonly { weekNumber: number; groupId: string }[]; now: Date },
): Promise<() => void> {
  const hostIds = [...new Set(input.visits.map((visit) => visit.groupId))].filter((id) => id && !id.includes("/"));
  if (hostIds.length === 0) return () => {};
  const groupSnaps = await tx.getAll(...hostIds.map((id) => db.collection("courseGroups").doc(id)));
  const hosts = new Map(groupSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, normalizeCourseGroup(snap.id, snap.data() ?? {})] as const));
  const refs = input.visits.flatMap((visit) => {
    const host = hosts.get(visit.groupId);
    if (!host || host.runId !== input.run.id) return [];
    const session = resolveSessions(input.run, host).find((each) => each.weekNumber === visit.weekNumber && each.occurrence === 1) ?? null;
    const startsAt = session ? sessionInstants(session).startsAt : null;
    if (!session || (startsAt && startsAt.getTime() <= input.now.getTime())) return [];
    return [db.collection("courseAttendance").doc(attendanceDocId(input.run.id, host.id, session.weekNumber, session.occurrence))];
  });
  if (refs.length === 0) return () => {};
  const snaps = await tx.getAll(...refs);
  const writes = snaps.flatMap((snap) => {
    const gone = snap.exists ? onlineWordGone(snap.data() ?? {}, input.uid) : null;
    return gone ? [() => tx.set(snap.ref, gone, { merge: true })] : [];
  });
  return () => {
    for (const write of writes) write();
  };
}
