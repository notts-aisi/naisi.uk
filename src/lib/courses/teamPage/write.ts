import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { runTakesTeamWriting, type TeamPagePerson } from "./access";
import { handInIsOpen } from "./load";
import {
  TEAM_ENTRIES_COLLECTION,
  TEAM_PAGE_LIMITS,
  checkInEntryId,
  handInEntryId,
  type CheckInInput,
  type HandInInput,
  type LinkInput,
} from "./model";
import {
  UPDATE_NOT_THIS_WEEK,
  HAND_IN_CLOSED_RUN,
  NO_SUCH_LINK,
  RUN_NOT_RUNNING,
  TOO_MANY_LINKS,
  handInClosedWords,
  tickFirstWords,
} from "./words";

/**
 * THE ONLY WRITERS OF `courseTeamEntries`, each called by its route once the
 * route has asked `teamPagePerson`: the person is in the team, told, and
 * taking part. What each writes is the team's, and records who saved it
 * last (`byUid`) and when. Nothing here emails anybody.
 *
 * Every write refuses a run that has ended, been cancelled or archived; a
 * check-in is this week's only, by the team's group's own calendar; the
 * hand-in shuts at 23:59 in London on its due day.
 */

export type Done<T extends object = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const refused = (status: number, error: string) => ({ ok: false as const, status, error });

/** Where the entry belongs: on every entry, so the run's destroy and the readers find it by one field. */
function placeOf(person: TeamPagePerson) {
  return {
    runId: person.run.id,
    courseId: person.run.courseId,
    groupId: person.team.groupId,
    teamId: person.team.id,
  };
}

/** "Save update": this week's, for the team, by whoever saves. */
export async function saveCheckIn(
  db: Firestore,
  person: TeamPagePerson,
  input: CheckInInput,
  now: Date,
): Promise<Done<{ weekNumber: number }>> {
  if (!runTakesTeamWriting(person.run)) return refused(409, RUN_NOT_RUNNING);
  const current = resolveGroupCalendar(person.run, person.group, now).currentWeek;
  if (current?.phase !== "running" || current.weekNumber === null || current.weekNumber !== input.weekNumber) {
    return refused(409, UPDATE_NOT_THIS_WEEK);
  }
  const ref = db.collection(TEAM_ENTRIES_COLLECTION).doc(checkInEntryId(person.team.id, input.weekNumber));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const words = {
      did: input.did,
      inTheWay: input.inTheWay,
      byUid: person.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (snap.exists) {
      tx.update(ref, words);
    } else {
      tx.set(ref, {
        ...placeOf(person),
        kind: "check-in",
        weekNumber: input.weekNumber,
        ...words,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { ok: true, weekNumber: input.weekNumber };
}

/** "Add a link", up to the page's limit. One equality on the team inside the transaction, so no declared index. */
export async function addLink(db: Firestore, person: TeamPagePerson, input: LinkInput): Promise<Done<{ id: string }>> {
  if (!runTakesTeamWriting(person.run)) return refused(409, RUN_NOT_RUNNING);
  const ref = db.collection(TEAM_ENTRIES_COLLECTION).doc();
  const full = await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(TEAM_ENTRIES_COLLECTION).where("teamId", "==", person.team.id));
    const links = snap.docs.filter((doc) => {
      const data = doc.data() ?? {};
      return data.kind === "link" && data.runId === person.run.id;
    });
    if (links.length >= TEAM_PAGE_LIMITS.links) return true;
    tx.set(ref, {
      ...placeOf(person),
      kind: "link",
      label: input.label,
      url: input.url,
      byUid: person.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return false;
  });
  if (full) return refused(409, TOO_MANY_LINKS);
  return { ok: true, id: ref.id };
}

/** "Remove": a link on the person's own team's page, whoever added it. */
export async function removeLink(db: Firestore, person: TeamPagePerson, linkId: string): Promise<Done> {
  if (!runTakesTeamWriting(person.run)) return refused(409, RUN_NOT_RUNNING);
  const ref = db.collection(TEAM_ENTRIES_COLLECTION).doc(linkId);
  const gone = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() ?? {}) : null;
    if (!data || data.kind !== "link" || data.teamId !== person.team.id || data.runId !== person.run.id) return true;
    tx.delete(ref);
    return false;
  });
  if (gone) return refused(404, NO_SUCH_LINK);
  return { ok: true };
}

/**
 * "Hand in for the team": the team's one hand-in, made or changed, until
 * 23:59 on the due day. Whoever presses says they have shared it with the
 * rest of the team (the box), when there is anybody else in it.
 */
export async function saveHandIn(
  db: Firestore,
  person: TeamPagePerson,
  input: HandInInput,
  now: Date,
): Promise<Done> {
  if (!runTakesTeamWriting(person.run)) return refused(409, HAND_IN_CLOSED_RUN);
  if (!handInIsOpen(person.run, now)) {
    const { dueOn } = person.run.teamHandIn;
    return refused(409, dueOn ? handInClosedWords(dueOn) : HAND_IN_CLOSED_RUN);
  }
  const others = person.uids.filter((uid) => uid !== person.user.uid);
  if (others.length > 0 && !input.shared) {
    const names = others.map((uid) => (person.roster.takingPart.get(uid)?.name ?? "").trim().split(/\s+/)[0] || "your team");
    return refused(400, tickFirstWords(names));
  }
  const ref = db.collection(TEAM_ENTRIES_COLLECTION).doc(handInEntryId(person.team.id));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const words = {
      url: input.url,
      summary: input.summary,
      whoDidWhat: input.whoDidWhat,
      byUid: person.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (snap.exists) {
      tx.update(ref, words);
    } else {
      tx.set(ref, {
        ...placeOf(person),
        kind: "hand-in",
        ...words,
        handedInAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { ok: true };
}
