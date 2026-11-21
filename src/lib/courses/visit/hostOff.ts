import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { courseEnrolmentId, normalizeCourseEnrolment, ownGroupForWeek, placementIsTold, visitInWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { withdrawVisitRequestsIn } from "@/lib/courses/excused/decide";
import { visitsLimitsIn } from "./limits";
import { excusalStandsFor } from "@/lib/courses/excused/marking";
import { factOf, weeksAbout } from "@/lib/courses/excused/model";
import { standingRequestsIn } from "@/lib/courses/excused/standing";
import { ONLINE_SAID, attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { writeTakenBack, type SessionLine } from "@/lib/courses/cantMakeIt/seat";
import { ownSessionThatWeek, visitRecipients, type VisitRecipient } from "./plan";
import { sendAll, type VisitSaveAnswer } from "./save";
import { calledOffDetail, calledOffEmailWords, calledOffPersonEmailWords, visitsOffPreviewWords } from "./words";

/**
 * WHEN THE SESSION SOMEBODY IS VISITING IS CALLED OFF (by Change a session,
 * kept pace or pushed back, before it or after the fact, or by a finished
 * register's own correction, It didn't happen, which calls it off the same
 * way: `../registerCorrection/column.ts`): each visit to it
 * whose person's OWN group's session that week is still to come ENDS in the
 * same write. They are back with their own group that week, and they and
 * their own group's facilitators are sent the approved "visit is off" emails
 * whether or not the group is told of the change, in place of the session's
 * own notice (which, the visit ended, no longer counts them: `except`). A
 * visit whose person's own session has started, or who has none that week,
 * STANDS, uncounted, and can be replaced by staff (`./plan.ts`).
 *
 * ORDER: the visits are read, and the limits on these emails read and claimed
 * (`visitsLimitsIn`: each person's counter, and the presser's once per visit ended), inside the change's own
 * transaction, before it writes; past a limit the whole change is refused and
 * nothing is written. The visits end in that same transaction, so the session
 * is never called off with such a visit standing. The emails go after the
 * commit; one that cannot be sent is reported in the answer, by count, so the
 * person pressing can tell them another way.
 */

/** One visit that ends with the session, and who its ending emails. */
export type EndingVisit = {
  uid: string;
  name: string;
  place: CourseEnrolmentDoc;
  home: CourseGroupDoc;
  recipients: VisitRecipient[];
  ownWhen: { dateKey: string; startTimeLocal: string } | null;
  /** An excusal stands for their own group's session that week: the "as usual" sentences are left out. */
  excusedAtHome: boolean;
};

/** Where the visits read are: the reads of a transaction, or of the database. */
type Reads = {
  places: (runId: string) => Promise<CourseEnrolmentDoc[]>;
  groups: (runId: string) => Promise<CourseGroupDoc[]>;
  users: (uids: readonly string[]) => Promise<Map<string, Record<string, unknown>>>;
};

function readsOf(db: Firestore, tx: Transaction | null): Reads {
  return {
    places: async (runId) => {
      const query = db.collection("courseEnrolments").where("runId", "==", runId).where("status", "==", "active");
      const snap = tx ? await tx.get(query) : await query.get();
      return snap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}));
    },
    groups: async (runId) => {
      const query = db.collection("courseGroups").where("runId", "==", runId);
      const snap = tx ? await tx.get(query) : await query.get();
      return snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}));
    },
    users: async (uids) => {
      const wanted = [...new Set(uids)].filter((uid) => uid && !uid.includes("/"));
      const refs = wanted.map((uid) => db.collection("users").doc(uid));
      const snaps = refs.length ? (tx ? await tx.getAll(...refs) : await db.getAll(...refs)) : [];
      return new Map(snaps.filter((snap) => snap.exists).map((snap) => [snap.id, (snap.data() ?? {}) as Record<string, unknown>]));
    },
  };
}

/**
 * The visits to `host`'s session of `weekNumber` that end if it is called
 * off now: an active, told learner's visit, whose own group's session that
 * week (`ownSessionThatWeek`) is still to come. Read only.
 */
export async function visitsEndingWith(
  db: Firestore,
  input: { run: CourseRunDoc; host: CourseGroupDoc; weekNumber: number; actorUid: string; now: Date; tx?: Transaction | null },
): Promise<EndingVisit[]> {
  const reads = readsOf(db, input.tx ?? null);
  const places = (await reads.places(input.run.id)).filter(
    (place) => place.runId === input.run.id && place.role === "learner" && placementIsTold(place) && visitInWeek(place, input.weekNumber)?.groupId === input.host.id,
  );
  if (places.length === 0) return [];
  const groups = (await reads.groups(input.run.id)).filter((group) => group.runId === input.run.id);
  const candidates = places.flatMap((place) => {
    const home = groups.find((group) => group.id === ownGroupForWeek(place, input.weekNumber)) ?? null;
    const own = ownSessionThatWeek(input.run, home, input.weekNumber);
    const startsAt = own ? sessionInstants(own).startsAt : null;
    return home && own && startsAt && startsAt.getTime() > input.now.getTime() ? [{ place, home, own }] : [];
  });
  if (candidates.length === 0) return [];
  const accounts = await reads.users(candidates.flatMap(({ place, home }) => [place.uid, ...home.facilitatorUids]));
  // Whether an excusal stands at home: their own register that week, and their requests on the run.
  const registerRefs = candidates.map(({ home, own }) => db.collection("courseAttendance").doc(attendanceDocId(input.run.id, home.id, own.weekNumber, own.occurrence)));
  const registerSnaps = input.tx ? await input.tx.getAll(...registerRefs) : await db.getAll(...registerRefs);
  const requestsOf = await Promise.all(candidates.map(({ place }) => standingRequestsIn(input.tx ?? null, db, place.uid, input.run.id)));
  return candidates.map(({ place, home, own }, at) => {
    const snap = registerSnaps[at];
    const register = snap?.exists ? normalizeCourseAttendance(snap.id, snap.data() ?? {}) : null;
    const approved = factOf(weeksAbout(requestsOf[at], place.uid, own.sessionKey, { groupId: home.id, visiting: false })) === "excused";
    const excusedAtHome = excusalStandsFor({ approved, mark: register?.records[place.uid] ?? null, kept: Boolean(register && Object.hasOwn(register.excusalKept, place.uid)) });
    const data = accounts.get(place.uid);
    const person = {
      uid: place.uid,
      email: typeof data?.email === "string" ? data.email.trim() : "",
      firstName: data ? firstNameOfUser(data) || fullNameOfUser(data) : "",
    };
    // The person, and their own group's facilitators: the host's are the ones calling it off.
    const recipients = visitRecipients({ person, personUid: place.uid, host: { facilitatorUids: [] }, home, accounts, actorUid: input.actorUid });
    return {
      uid: place.uid,
      name: data ? fullNameOfUser(data) : "NAISI member",
      place,
      home,
      recipients,
      ownWhen: { dateKey: own.dateKey, startTimeLocal: own.session.startTimeLocal },
      excusedAtHome,
    };
  });
}

/**
 * What the change's preview says of them, staff-facing: null with none. The
 * register's correction (It didn't happen) names its own tick (`tick`).
 */
export function visitsOffPreview(ending: readonly EndingVisit[], tick: "tell" | "email" = "tell"): { people: number; emails: number; words: string } | null {
  if (ending.length === 0) return null;
  const emails = ending.reduce((sum, each) => sum + each.recipients.length, 0);
  return { people: ending.length, emails, words: visitsOffPreviewWords(ending.length, emails, tick) };
}

/**
 * Inside the change's transaction, after its other reads: the limits on these
 * emails, read for every visit that ends. Answers the refusal, or `write`,
 * which claims them and ends each visit (the place, a History row on each
 * group), called with the change's own writes.
 */
export async function endVisitsIn(
  tx: Transaction,
  db: Firestore,
  input: { run: CourseRunDoc; host: CourseGroupDoc; weekNumber: number; ending: readonly EndingVisit[]; actor: SessionUser },
): Promise<{ refusal: string | null; write: () => void }> {
  const claims: Array<() => void> = [];
  // The limits: each person's counter, and the presser's once for each visit.
  const limits = await visitsLimitsIn(tx, db, input.run.id, input.ending.map((visit) => visit.uid), input.actor.uid);
  if (limits.refusal) return { refusal: limits.refusal, write: () => {} };
  claims.push(limits.write);
  // The host's register of that session: their own words on it, while it is not finished.
  const hostSession = resolveSessions(input.run, input.host).find((each) => each.weekNumber === input.weekNumber && each.occurrence === 1) ?? null;
  const registerRef = hostSession ? db.collection("courseAttendance").doc(attendanceDocId(input.run.id, input.host.id, hostSession.weekNumber, hostSession.occurrence)) : null;
  const registerSnap = registerRef ? await tx.get(registerRef) : null;
  const hostRegister = registerSnap?.exists ? normalizeCourseAttendance(registerSnap.id, registerSnap.data() ?? {}) : null;
  for (const visit of input.ending) {
    // A request still waiting about the session goes with the visit, quietly.
    claims.push(await withdrawVisitRequestsIn(tx, db, { runId: input.run.id, uid: visit.uid, hostGroupId: input.host.id, weekNumber: input.weekNumber, byUid: input.actor.uid, now: new Date() }));
    // Their own words on the host's register for that session, while it is not finished, as calling the visit off takes them back.
    if (registerRef && registerSnap && hostSession && hostRegister && hostRegister.pushedAt === null) {
      if (Object.hasOwn(hostRegister.onlineSaid, visit.uid)) claims.push(() => tx.set(registerRef, { [ONLINE_SAID]: { [visit.uid]: FieldValue.delete() } }, { merge: true }));
      if (Object.hasOwn(hostRegister.excusedInAdvance, visit.uid)) {
        const data = registerSnap.data() ?? {};
        claims.push(() => writeTakenBack(tx, { session: hostSession, ref: registerRef, data, state: { kind: "told" } } as unknown as SessionLine, visit.uid));
      }
    }
  }
  return {
    refusal: null,
    write: () => {
      for (const claim of claims) claim();
      const actor = { uid: input.actor.uid, displayName: input.actor.displayName ?? "" };
      for (const visit of input.ending) {
        const visits = (visit.place.visits ?? []).filter((each) => each.weekNumber !== input.weekNumber);
        tx.update(db.collection("courseEnrolments").doc(courseEnrolmentId(input.run.id, visit.uid)), {
          visits: visits.length
            ? visits.map((each) => ({ weekNumber: each.weekNumber, groupId: each.groupId, arrangedByUid: each.arrangedByUid, arrangedAt: each.arrangedAt }))
            : FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        const shared = {
          run: input.run,
          actor,
          weekId: weekDocId(input.weekNumber),
          emailed: visit.recipients.length,
          subjectUid: visit.uid,
          detail: calledOffDetail(visit.name, input.host.name, input.weekNumber),
        };
        tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), groupHistoryRow({ ...shared, kind: "member-visit-off", group: visit.home }));
        tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), groupHistoryRow({ ...shared, kind: "member-visit-off", group: input.host }));
      }
    },
  };
}

/** After the commit: each ended visit's emails, in the approved words. A failed send is counted, never thrown. */
export async function sendVisitsOff(
  input: { run: CourseRunDoc; host: CourseGroupDoc; weekNumber: number; ending: readonly EndingVisit[]; actorUid: string },
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const hostSession = resolveSessions(input.run, input.host).find((each) => each.weekNumber === input.weekNumber && each.occurrence === 1) ?? null;
  for (const visit of input.ending) {
    const emails: VisitSaveAnswer["emails"] = await sendAll(visit.recipients, {
      actorUid: input.actorUid,
      runId: input.run.id,
      hostGroupId: input.host.id,
      homeGroupId: visit.home.id,
      wordsFor: (recipient) =>
        recipient.as === "person"
          ? calledOffPersonEmailWords({ hostName: input.host.name, homeName: visit.home.name, weekNumber: input.weekNumber, hostDateKey: hostSession?.dateKey ?? "", own: visit.ownWhen, excusedAtHome: visit.excusedAtHome })
          : calledOffEmailWords({ personName: visit.name, hostName: input.host.name, homeName: visit.home.name, weekNumber: input.weekNumber, excusedAtHome: visit.excusedAtHome }),
      greet: (recipient) => recipient.as === "person",
    });
    sent += emails.sent;
    failed += emails.failed;
  }
  return { sent, failed };
}
