import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { visitRecipients } from "@/lib/courses/visit/plan";
import { visitsEndedByRemoval, NO_VISITS_ENDED, type RemovalVisits } from "@/lib/courses/visit/removed";
import type { SessionUser } from "@/lib/firebase/session";
import { firstWord } from "@/lib/firestore/applicationEmails";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
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
 * "FROM WEEK 3" in the facilitators' email is the group's next session that
 * has not started (`registerWeek`), read the way the register reads
 * somebody who has left: a session that started before they went keeps
 * them, and one that starts after does not (`droppedOutAt`, the instant of
 * the press). So between sessions it is the next one; on a session's day
 * before it starts, that session; once it has started, the one after; and
 * after the group's last session there is none, and the sentence goes.
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
  /** The week of the group's next session that has not started, or null. */
  registerWeek: number | null;
  /** The person as the group's History names them. */
  historyName: string;
};

function emailOf(data: Record<string, unknown> | undefined): string {
  return typeof data?.email === "string" ? data.email.trim() : "";
}

/** The week of the group's next session that has not started at `now`, or null when none is left. */
export function nextRegisterWeek(run: CourseRunDoc, group: CourseGroupDoc, now: Date): number | null {
  let best: { at: number; weekNumber: number } | null = null;
  for (const session of resolveSessions(run, group)) {
    if (session.cancelled) continue;
    const startsAt = sessionInstants(session).startsAt;
    if (!startsAt || startsAt.getTime() < now.getTime()) continue;
    if (!best || startsAt.getTime() < best.at) best = { at: startsAt.getTime(), weekNumber: session.weekNumber };
  }
  return best ? best.weekNumber : null;
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
    registerWeek: meets ? nextRegisterWeek(run, meets, now) : null,
    historyName: account ? fullNameOfUser(account) : fallback,
  };
}
