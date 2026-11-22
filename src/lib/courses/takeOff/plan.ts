import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { visitRecipients } from "@/lib/courses/visit/plan";
import { visitsEndedByRemoval, NO_VISITS_ENDED, type RemovalVisits } from "@/lib/courses/visit/removed";
import type { SessionUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";
import { attendanceDocId } from "@/lib/firestore/courseAttendance";
import { groupForWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import type { TakeOffFacts } from "./words";

/**
 * WHAT TAKING ONE PERSON OFF A RUN EMAILS, AND WHAT THE QUESTION SAYS: the
 * one answer the route's preview and its press both ask
 * (`POST /api/courses/runs/[runId]/enrolments/[uid]/remove`), the press with
 * what its own transaction read (`readAll` is the transaction's), so the
 * count the question showed is checked against the same answer.
 *
 * WHO IS EMAILED:
 *  - THE PERSON, always, at their account's address (none with no account).
 *  - THEIR GROUP'S FACILITATORS, only when Publish had told them their group
 *    (`told`: the route asks `placementIsTold` of the seat it read): before
 *    that the facilitators never saw them. The
 *    group is the one their seat is in now, if it still meets; each of its
 *    facilitators who stands behind the role and has an address, never the
 *    person and never whoever pressed (`visitRecipients`, the one answer the
 *    visit's and the move's sends ask).
 *  - THE HOSTS' FACILITATORS OF EACH VISIT STILL TO COME, as they always were
 *    (`visitsEndedByRemoval`).
 * Nobody else.
 *
 * "FROM WEEK 3" in the facilitators' email is the first session of the
 * group, in order, whose register holds no saved mark for them
 * (`registerWeek`). A person taken off stops being a row of every register
 * the moment the removal is written: the register lists them only among
 * those who left, with the marks already saved, and refuses a new mark. So
 * once every earlier register is saved it is the next session; while a
 * session is under way, or a session's register is not saved yet, it is that
 * session's week. A week they spent in another group (a move, a visit),
 * before they joined, or whose register says the session was not held is
 * not theirs on this register and is passed over. With no such session left
 * (every session of the group has a saved mark for them), there is none, and
 * the sentence goes.
 *
 * The person's name in the question's title is the one the viewer sees
 * (`nameForViewer`: the full name for the committee and admins, the name they
 * go by for anybody else); every other sentence, and both emails, use the
 * name they go by.
 */

type ReadAll = (refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;

/** Somebody the press emails, other than a visit's host's facilitators. */
export type TakeOffRecipient = { uid: string; email: string; firstName: string; as: "person" | "facilitator" };

export type TakeOffPlan = {
  /** What the question says, built from this. */
  facts: TakeOffFacts;
  /** The person, then their group's facilitators: the press's own emails. */
  recipients: TakeOffRecipient[];
  /** The visits it calls off, with their hosts' facilitators. */
  visits: RemovalVisits;
  /** Every email a press sends: `recipients` and the visits'. The count the press sends back. */
  emails: number;
  /** The group their seat is in, or null. */
  group: CourseGroupDoc | null;
  /** The group Publish had told them about, as the person's email names it: the group their seat is in, once told. */
  toldGroupName: string | null;
  /** The week of the group's first session whose register holds no saved mark for them, or null. */
  registerWeek: number | null;
  /** The person as the group's History names them. */
  historyName: string;
};

function emailOf(data: Record<string, unknown> | undefined): string {
  return typeof data?.email === "string" ? data.email.trim() : "";
}

/**
 * The week of the group's first session, in order, whose register holds no
 * saved mark for this person (see the note at the top), or null when every
 * session of the group that is theirs has one. One read: each such session's
 * register.
 */
export async function nextRegisterWeek(
  readAll: ReadAll,
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  place: Pick<CourseEnrolmentDoc, "uid" | "groupId" | "groupsByWeek" | "visits" | "joinedWeekNumber">,
): Promise<number | null> {
  const sessions = resolveSessions(run, group)
    .filter((session) => !session.cancelled)
    .filter((session) => session.weekNumber >= place.joinedWeekNumber && groupForWeek(place, session.weekNumber) === group.id)
    .map((session) => ({ session, at: sessionInstants(session).startsAt?.getTime() ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.at - b.at || a.session.weekNumber - b.session.weekNumber || a.session.occurrence - b.session.occurrence);
  if (sessions.length === 0) return null;
  const snaps = await readAll(
    sessions.map(({ session }) => db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence))),
  );
  for (const [index, { session }] of sessions.entries()) {
    const data = snaps[index]?.exists ? ((snaps[index].data() ?? {}) as Record<string, unknown>) : null;
    // A register that says the session was not held is no session they could be marked on.
    if (data?.held === false) continue;
    const records = data && data.records && typeof data.records === "object" ? (data.records as Record<string, unknown>) : {};
    if (typeof records[place.uid] !== "string") return session.weekNumber;
  }
  return null;
}

export async function planTakeOff(
  readAll: ReadAll,
  db: Firestore,
  input: {
    run: CourseRunDoc;
    place: CourseEnrolmentDoc;
    /** Every group of the run, archived ones included. */
    groups: readonly CourseGroupDoc[];
    actor: SessionUser;
    now: Date;
    /** "AGI Strategy", or the course's own name. */
    programmeName: string;
    /** Their place on the form goes back with the press. */
    givesPlaceBack: boolean;
    /** The name the run's own list holds for them, for an account with none. */
    fallbackName: string;
    /** Publish had told them their group (`placementIsTold`, asked by the route of the seat it read). */
    told: boolean;
  },
): Promise<TakeOffPlan> {
  const { run, place, now, actor } = input;
  const group = place.groupId ? (input.groups.find((each) => each.id === place.groupId && each.runId === run.id) ?? null) : null;
  const meets = group && !group.archived ? group : null;
  const told = input.told;

  // One read: the person's account and their group's facilitators'.
  const uids = [...new Set([place.uid, ...(meets?.facilitatorUids ?? [])])].filter((uid) => uid && !uid.includes("/"));
  const accounts = new Map<string, Record<string, unknown>>();
  if (uids.length > 0) {
    for (const snap of await readAll(uids.map((uid) => db.collection("users").doc(uid)))) {
      if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    }
  }
  const account = accounts.get(place.uid);
  const fallback = input.fallbackName.trim() || "NAISI member";
  const firstName = (account ? firstNameOfUser(account) : "") || firstWord(fallback) || fallback;
  const personName = account ? nameForViewer(actor, accountNamesOf(account), fallback) : fallback;
  const personEmail = emailOf(account);

  const recipients: TakeOffRecipient[] = [];
  if (personEmail) recipients.push({ uid: place.uid, email: personEmail, firstName, as: "person" });
  // Their group's facilitators, once Publish had told them their group.
  const facilitators =
    told && meets
      ? visitRecipients({ person: null, personUid: place.uid, host: meets, home: { facilitatorUids: [] }, accounts, actorUid: actor.uid })
      : [];
  for (const each of facilitators) recipients.push({ uid: each.uid, email: each.email, firstName: each.firstName, as: "facilitator" });

  // Every visit still to come is called off with its host's facilitators told, as it always was.
  const visits =
    place.status === "active"
      ? await visitsEndedByRemoval(readAll, db, { run, place, groups: input.groups, actorUid: actor.uid, now })
      : NO_VISITS_ENDED;

  const people = new Set([...recipients.map((each) => each.uid), ...visits.ended.flatMap((each) => each.recipients.map((r) => r.uid))]).size;
  const facts: TakeOffFacts = {
    personName,
    firstName,
    programmeName: input.programmeName,
    groupName: group ? group.name.trim() || "Untitled group" : null,
    givesPlaceBack: input.givesPlaceBack,
    personEmailed: personEmail !== "",
    facilitators: facilitators.map((each) => each.firstName || "A facilitator"),
    groupFacilitators: meets ? meets.facilitatorUids.length : 0,
    visits: visits.ended.map((each) => ({ hostName: each.host.name.trim() || "Untitled group", weekNumber: each.weekNumber, emails: each.recipients.length })),
    people,
  };
  return {
    facts,
    recipients,
    visits,
    emails: recipients.length + visits.emails,
    group,
    toldGroupName: told && group ? group.name.trim() || null : null,
    registerWeek: meets ? await nextRegisterWeek(readAll, db, run, meets, place) : null,
    historyName: account ? fullNameOfUser(account) : fallback,
  };
}
