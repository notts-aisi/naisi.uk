import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore, Query, QuerySnapshot, Transaction } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { isInTerm } from "@/lib/applications/decisions";
import { normaliseApplication } from "@/lib/applications/normalise";
import { standingOf } from "@/lib/applications/status/standing";
import { APPLICATIONS_COLLECTION } from "@/lib/firestore/admissionApplications";
import type { RegisterState } from "@/lib/courses/unmarkedRegisters";
import { attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { firstNameOfUser, readNamingProgramme } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import type { RegisterCover } from "@/lib/firestore/courseAttendance";
import type { GroupArchiveFacts, NamedPerson } from "./plan";

/**
 * THE FREED PLACES OFFERED IN A GROUP'S NAME AND NOT ANSWERED YET, counted
 * from the applications whose `freedPlace.groupId` names it (the query is
 * the caller's: one equality on that map field, so no declared index):
 * still in the term, and the invitation standing (`standingOf`). One
 * accepted is a place the board seats, so it is not counted here. Archiving
 * waits on these. (A group's places count the accepted ones too, until they
 * are placed: `readHeldSeats` in src/lib/courses/placesAndName/held.ts.)
 */
export function freedOffersIn(snap: QuerySnapshot, groupId: string): number {
  return snap.docs
    .map((doc) => normaliseApplication(doc.id, doc.data()))
    .filter((application) => application !== null && application.freedPlace?.groupId === groupId)
    .filter((application) => application !== null && isInTerm(application) && standingOf(application).kind === "invitation").length;
}

/** The query `freedOffersIn` counts: the applications a freed place in this group's name was offered on. */
export function freedOffersQuery(db: Firestore, groupId: string): Query {
  return db.collection(APPLICATIONS_COLLECTION).where("freedPlace.groupId", "==", groupId);
}

/**
 * WHAT ARCHIVING OR RESTORING ONE GROUP READS, once before the press's
 * transaction and again inside it, so the decision the press writes on is
 * the one made of what the transaction read; and once by the archived
 * group's page, for what its restore question says before the press.
 *
 * The group, its run, the run's groups, every place on the run and the
 * freed places offered in the group's name (three queries of one equality
 * each, so no declared index); the registers of the group's sessions not
 * called off, addressed by id (whether each is finished, for those that
 * have started, and who covers it, for all); and the accounts a sentence may
 * name: anybody with a visit to the group, whoever covers one of its
 * sessions and its facilitators, each named as `viewer` may see them
 * (`nameForViewer`: the committee and admins the full name, anybody else
 * the name they go by). The programme naming the run is read outside the
 * transaction: only its name is said. Null when the group is not there.
 */
export async function readGroupArchiveFacts(
  db: Firestore,
  groupId: string,
  now: Date,
  tx?: Transaction,
  viewer: NameViewer = null,
): Promise<GroupArchiveFacts | null> {
  const get = (ref: DocumentReference): Promise<DocumentSnapshot> => (tx ? tx.get(ref) : ref.get());
  const list = (query: Query): Promise<QuerySnapshot> => (tx ? tx.get(query) : query.get());

  const groupSnap = await get(db.collection("courseGroups").doc(groupId));
  if (!groupSnap.exists) return null;
  const group: CourseGroupDoc = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});

  const runId = isAddressableId(group.runId) ? group.runId : "";
  if (!runId) {
    return {
      group,
      run: null,
      destroying: false,
      programmeName: "",
      runGroups: [group],
      places: [],
      registers: new Map(),
      covers: new Map(),
      freedOffers: 0,
      names: new Map(),
    };
  }
  const [runSnap, groupsSnap, placesSnap, offersSnap, naming] = await Promise.all([
    get(db.collection("courseRuns").doc(runId)),
    list(db.collection("courseGroups").where("runId", "==", runId)),
    list(db.collection("courseEnrolments").where("runId", "==", runId)),
    // The freed places offered in this group's name: one equality on a map
    // field, so no declared index.
    list(db.collection(APPLICATIONS_COLLECTION).where("freedPlace.groupId", "==", group.id)),
    // Outside the transaction: the programme's name is said, never decided on.
    readNamingProgramme(db, runId).catch(() => null),
  ]);
  const freedOffers = freedOffersIn(offersSnap, group.id);
  const run = runSnap.exists ? normalizeCourseRun(runSnap.id, runSnap.data() ?? {}) : null;
  const destroying = runSnap.exists && runSnap.data()?.destroying === true;
  const runGroups = groupsSnap.docs
    .map((doc) => (doc.id === group.id ? group : normalizeCourseGroup(doc.id, doc.data() ?? {})))
    .filter((each) => each.runId === runId);
  if (!runGroups.some((each) => each.id === group.id)) runGroups.push(group);
  const places = placesSnap.docs
    .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
    .filter((place) => place.runId === runId);

  const registers = new Map<string, RegisterState>();
  const covers = new Map<string, RegisterCover>();
  if (run) {
    // Every session not called off: whether its register is finished is asked
    // only of those that have started (a register of a session called off is
    // not asked about, whatever it says), and who covers it of all of them.
    const sessions = resolveSessions(run, group).filter((session) => !session.cancelled);
    const refs = sessions.map((session) =>
      db.collection("courseAttendance").doc(attendanceDocId(runId, group.id, session.weekNumber, session.occurrence)),
    );
    const snaps = refs.length === 0 ? [] : tx ? await tx.getAll(...refs) : await db.getAll(...refs);
    for (const [index, snap] of snaps.entries()) {
      if (!snap.exists) continue;
      const register = normalizeCourseAttendance(snap.id, snap.data() ?? {});
      if (register.runId !== runId || register.groupId !== group.id) continue;
      const { startsAt } = sessionInstants(sessions[index]);
      if (startsAt !== null && startsAt.getTime() <= now.getTime()) {
        registers.set(register.sessionKey, { exists: true, held: register.held, pushedAt: register.pushedAt });
      }
      if (register.cover) covers.set(register.sessionKey, register.cover);
    }
  }

  // The accounts a sentence may name, read in the same transaction.
  const uids = [
    ...places.filter((place) => (place.visits ?? []).some((visit) => visit.groupId === group.id)).map((place) => place.uid),
    ...[...covers.values()].map((cover) => cover.byUid),
    ...group.facilitatorUids,
  ];
  const wanted = [...new Set(uids)].filter((uid) => isAddressableId(uid));
  const accountRefs = wanted.map((uid) => db.collection("users").doc(uid));
  const accounts = accountRefs.length === 0 ? [] : tx ? await tx.getAll(...accountRefs) : await db.getAll(...accountRefs);
  const names = new Map<string, NamedPerson>();
  for (const account of accounts) {
    const data = (account.exists ? account.data() : null) ?? {};
    const name = nameForViewer(viewer, accountNamesOf(data), "NAISI member");
    names.set(account.id, { name, firstName: firstNameOfUser(data) || name });
  }
  const programmeName = (naming?.shortName ?? "").trim() || (run?.courseTitle ?? "").trim();

  return { group, run, destroying, programmeName, runGroups, places, registers, covers, freedOffers, names };
}
