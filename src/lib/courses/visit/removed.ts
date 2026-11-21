import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { fullNameOfUser } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { attendanceDocId } from "@/lib/firestore/courseAttendance";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { visitRecipients, type VisitRecipient } from "./plan";
import { sendAll } from "./save";
import { calledOffEmailWords } from "./words";

/**
 * THE VISITS A REMOVAL ENDS, and who is told. Taking somebody off the run
 * (Remove on the Groups tab, `POST /api/courses/runs/[runId]/enrolments/[uid]/remove`)
 * deletes every one-week visit on their place, in the removal's own write.
 * For each visit whose session has not started and is happening (dated, not
 * called off, not marked as not held, its group still meeting), the HOST's
 * facilitators are sent the visit's approved called-off email ("Daniel Kim’s
 * visit to Group I for week 2 is off"), in its form that leaves out "and will
 * be at Group C’s as usual" (`excusedAtHome`), which would be untrue of
 * somebody no longer on the run. Each facilitator who stands behind the role
 * and has an address, never the person removed and never whoever pressed
 * (`visitRecipients`, the one answer the visit's own sends ask). The person
 * removed is sent nothing by this.
 *
 * The route's confirmation counts these emails before the press; the press
 * sends the count back and the transaction works it out again with what it
 * read (`readAll` is the transaction's), refusing a different one. The emails
 * are held to the limit on a visit called off by hand (`visitLimitsIn`),
 * claimed in the removal's own write: one press, however many visits it ends.
 */

type ReadAll = (refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;

/** One visit a removal ends with an email to its host's facilitators. */
export type VisitEnded = { weekNumber: number; host: CourseGroupDoc; recipients: VisitRecipient[] };

/** What a removal does to the visits on a place: those it tells the hosts about, and the count of emails. */
export type RemovalVisits = { personName: string; ended: VisitEnded[]; emails: number };

/** No visit, or none still to come: nobody to tell. */
export const NO_VISITS_ENDED: RemovalVisits = { personName: "", ended: [], emails: 0 };

export async function visitsEndedByRemoval(
  readAll: ReadAll,
  db: Firestore,
  input: { run: CourseRunDoc; place: Pick<CourseEnrolmentDoc, "uid" | "visits">; groups: readonly CourseGroupDoc[]; actorUid: string; now: Date },
): Promise<RemovalVisits> {
  const { run, place, groups, now } = input;
  // Each visit whose host still meets and whose session is dated, not called off and still to come.
  const ahead = (place.visits ?? []).flatMap((visit) => {
    const host = groups.find((group) => group.id === visit.groupId && group.runId === run.id && !group.archived) ?? null;
    if (!host) return [];
    const session = resolveSessions(run, host).find((each) => each.weekNumber === visit.weekNumber && each.occurrence === 1) ?? null;
    const startsAt = session && !session.cancelled ? sessionInstants(session).startsAt : null;
    if (!session || !startsAt || startsAt.getTime() <= now.getTime()) return [];
    return [{ weekNumber: visit.weekNumber, host, session }];
  });
  if (ahead.length === 0) return NO_VISITS_ENDED;
  // One read: each session's register (marked as not held is no session), the person's account and the hosts' facilitators'.
  const accountUids = [...new Set([place.uid, ...ahead.flatMap(({ host }) => host.facilitatorUids)])].filter((uid) => uid && !uid.includes("/"));
  const snaps = await readAll([
    ...ahead.map(({ host, session }) => db.collection("courseAttendance").doc(attendanceDocId(run.id, host.id, session.weekNumber, session.occurrence))),
    ...accountUids.map((uid) => db.collection("users").doc(uid)),
  ]);
  const accounts = new Map<string, Record<string, unknown>>();
  accountUids.forEach((uid, index) => {
    const snap = snaps[ahead.length + index];
    if (snap?.exists) accounts.set(uid, (snap.data() ?? {}) as Record<string, unknown>);
  });
  const person = accounts.get(place.uid);
  const ended = ahead
    .filter((_, index) => !(snaps[index]?.exists && snaps[index].data()?.held === false))
    .map(({ weekNumber, host }) => ({
      weekNumber,
      host,
      recipients: visitRecipients({ person: null, personUid: place.uid, host, home: { facilitatorUids: [] }, accounts, actorUid: input.actorUid }),
    }));
  return { personName: person ? fullNameOfUser(person) : "NAISI member", ended, emails: ended.reduce((sum, each) => sum + each.recipients.length, 0) };
}

/** After the removal has committed: each host's facilitators, the approved called-off email. A failed send never undoes the removal. */
export async function sendRemovalVisitEmails(visits: RemovalVisits, input: { actorUid: string; runId: string }): Promise<{ sent: number; suppressed: number; failed: number }> {
  const total = { sent: 0, suppressed: 0, failed: 0 };
  for (const each of visits.ended) {
    const words = calledOffEmailWords({ personName: visits.personName, hostName: each.host.name, homeName: "", weekNumber: each.weekNumber, excusedAtHome: true });
    const done = await sendAll(each.recipients, {
      actorUid: input.actorUid,
      runId: input.runId,
      hostGroupId: each.host.id,
      homeGroupId: each.host.id,
      wordsFor: () => words,
      // The approved called-off email to the facilitators has no greeting.
      greet: () => false,
    });
    total.sent += done.sent;
    total.suppressed += done.suppressed;
    total.failed += done.failed;
  }
  return total;
}
