import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { readOwnFeedback } from "@/lib/courses/feedback/readers";
import { ownRequestsIn } from "@/lib/courses/excused/ask";
import { firstNameOfUser, fullNameOfUser, readNamingProgramme, standingUserOf } from "@/lib/courses/programmeLead";
import { resolveSessions } from "@/lib/courses/sessions";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { EXCUSED_IN_ADVANCE, attendanceDocId } from "@/lib/firestore/courseAttendance";
import { boxIsWritten, isOwnBoxResponse } from "@/lib/firestore/courseExercises";
import { isWordCountedAnswer } from "@/lib/courses/writtenAnswers/model";
import {
  courseEnrolmentId,
  groupForWeek,
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { sessionKeyParts } from "../excused/model";
import { sessionsByWeekGroup } from "../groupsByWeek";
import type { MoveLineView, MovePreviewView } from "./view";
import { moveWeekOf, weeksThatCome, type MoveWeek } from "./week";
import {
  LINE_LABEL,
  MOVE_REFUSAL,
  alreadyInWords,
  archivedWords,
  attendanceLineWords,
  copiesLineWords,
  facilitatesWords,
  fullWords,
  groupChoiceWords,
  groupLineWords,
  lateLineWords,
  leftBehindWords,
  moveButtonWords,
  newFacilitatorsEmailWords,
  newHasMetWords,
  newHasNoneWords,
  notToldWords,
  oldFacilitatorsEmailWords,
  oldHasNoneLeftWords,
  oldHasNoneSetWords,
  oldNoLongerMeetsWords,
  oldStillToComeWords,
  personEmailWords,
  registersLineWords,
  skipsOldSessionWords,
  toPersonHeading,
  toldLineWords,
  weekStatedWords,
  weeksStayWords,
  workLineWords,
  writtenAheadWords,
  type GroupLineFacts,
  type LeftBehind,
  type MoveEmailFacts,
  type MoveEmailWords,
} from "./words";

/**
 * MOVING SOMEBODY TO ANOTHER GROUP FOR GOOD, MID-TERM: what a move WOULD do,
 * worked out once for the page (`.../programmes/[programmeId]/people/[uid]/move`),
 * the route's preview and the route's save, so the three can never say
 * different things.
 *
 * WHO MAY is the caller's: the page and the route ask `loadProgrammeRun`
 * first (an admin or the programme's lead). Nothing here asks again.
 *
 * WHAT IS READ: the run, its groups (one equality), the person's place, the
 * accounts of the person and of every group's facilitators (one read), the
 * programme that names the run (an incubator has one group), and for the
 * group chosen: the person's feedback on the run (who gave it), their
 * requests to be excused, the old group's registers from the week of the
 * move on, and both groups' copies of each week before it. NOTHING HERE
 * WRITES OR EMAILS.
 *
 * WHO IS TOLD is decided by ONE function (`moveRecipients`), asked by the
 * preview with the accounts read here and by the save inside its
 * transaction with the accounts read there: the person, when they have an
 * address; and each facilitator of the two groups who still stands behind the
 * role and has an address, never the person moved and never whoever pressed.
 * Somebody who facilitates both groups is told once, as one of the new
 * group's. The button counts exactly those.
 */

/** A refusal: the status a route answers with and its one sentence. */
export type MoveRefusal = { ok: false; status: number; error: string };

/** Everything read about the person and the run, before a group is chosen. */
export type MoveFacts = {
  run: CourseRunDoc;
  /** Every group of the run, archived ones included. */
  groups: CourseGroupDoc[];
  place: CourseEnrolmentDoc;
  from: CourseGroupDoc;
  person: { uid: string; name: string; firstName: string; email: string };
  /** The accounts read: the person's and every group's facilitators'. */
  accounts: Map<string, Record<string, unknown>>;
};

/** One choice under "Move to": a group of the run that still meets, other than theirs. */
export type MoveChoice = { groupId: string; name: string; words: string; full: boolean };

/** Somebody the move emails. */
export type MoveRecipient = {
  uid: string;
  firstName: string;
  email: string;
  /** Whose email they are sent: the person's, or the new or the old group's facilitators'. */
  as: "person" | "new" | "old";
};

/** One line of "What will happen". */
export type MoveLine = MoveLineView;

/** What a move to one group would do, as the page draws it and the save sends it. */
export type MovePlan = {
  toGroupId: string;
  toName: string;
  weekNumber: number;
  /** "Week 3 · Group F meets Thu 19 Nov". */
  weekStated: string;
  /** "Weeks 1 and 2 stay with Group C, where Leo met.", or "". */
  weeksStay: string;
  /** "Leo won’t go to Group C’s session on Wed 11 Nov. ...". */
  skipsOld: string;
  lines: MoveLine[];
  /** "Told": "3 emails" and the rest of its line. */
  told: { count: string; rest: string };
  /** The email to the person, as it will be sent. Null when they have no address. */
  personEmail: { heading: string; words: MoveEmailWords } | null;
  button: string;
  recipients: MoveRecipient[];
  emails: number;
  /** The facts every email is written from. */
  emailFacts: MoveEmailFacts;
  /** The old group's facilitators who gave this person feedback (by uid). */
  feedbackFrom: string[];
};

/** What the page and the preview answer about one group. */
export type MoveOutcome = { ok: true; plan: MovePlan } | MoveRefusal;

/** Where the plan reads its accounts from: one read outside a transaction, or the transaction's. */
type ReadAll = (refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;

/** The accounts of these people, by uid: one read. */
async function accountsOf(readAll: ReadAll, db: Firestore, uids: Iterable<string>): Promise<Map<string, Record<string, unknown>>> {
  const wanted = [...new Set([...uids].filter((uid) => uid && !uid.includes("/")))];
  const out = new Map<string, Record<string, unknown>>();
  if (wanted.length === 0) return out;
  for (const snap of await readAll(wanted.map((uid) => db.collection("users").doc(uid)))) {
    if (snap.exists) out.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  }
  return out;
}

function emailOf(data: Record<string, unknown> | undefined): string {
  return typeof data?.email === "string" ? data.email.trim() : "";
}

/** A group's line facts: its slot and its facilitators by first name, never `reader`'s own. */
function lineFacts(group: CourseGroupDoc, accounts: Map<string, Record<string, unknown>>, reader: string): GroupLineFacts {
  return {
    name: group.name.trim(),
    session: group.session,
    facilitatorFirstNames: group.facilitatorUids
      .filter((uid) => uid !== reader)
      .map((uid) => {
        const data = accounts.get(uid);
        return data ? firstNameOfUser(data) : "";
      })
      .filter(Boolean),
  };
}

/** A group's facilitators who still stand behind the role, by uid. */
function standingFacilitators(group: Pick<CourseGroupDoc, "facilitatorUids">, accounts: Map<string, Record<string, unknown>>): string[] {
  return group.facilitatorUids.filter((uid) => {
    const data = accounts.get(uid);
    return data !== undefined && isNamedWithStanding(standingUserOf(uid, data), "courseGroups.facilitatorUids", group.facilitatorUids);
  });
}

/**
 * WHO A MOVE EMAILS, the one answer the preview and the send both ask: the
 * person, with an address; then each facilitator of the new group, then of
 * the old, who stands behind the role and has an address, never the person
 * moved and never whoever pressed, and once each (somebody who facilitates
 * both groups is told as one of the new group's).
 */
export function moveRecipients(input: {
  person: { uid: string; email: string; firstName: string };
  from: Pick<CourseGroupDoc, "facilitatorUids">;
  to: Pick<CourseGroupDoc, "facilitatorUids">;
  accounts: Map<string, Record<string, unknown>>;
  actorUid: string;
}): MoveRecipient[] {
  const out: MoveRecipient[] = [];
  if (input.person.email) out.push({ uid: input.person.uid, firstName: input.person.firstName, email: input.person.email, as: "person" });
  const seen = new Set([input.person.uid, input.actorUid]);
  for (const [as, group] of [
    ["new", input.to],
    ["old", input.from],
  ] as const) {
    for (const uid of standingFacilitators(group, input.accounts)) {
      if (seen.has(uid)) continue;
      const data = input.accounts.get(uid);
      const email = emailOf(data);
      if (!email) continue;
      seen.add(uid);
      out.push({ uid, firstName: data ? firstNameOfUser(data) : "", email, as });
    }
  }
  return out;
}

/**
 * WHETHER A RUN TAKES A MOVE AT ALL, from the run alone: never one being
 * destroyed, one that is over (completed or cancelled), or one that is
 * archived. The route asks it before anything else is read and again inside
 * the save's transaction, and the ways in (the People tab's menu, a group's
 * page) ask it before they offer a move. Null when it does.
 */
export function runMoveRefusal(run: Pick<CourseRunDoc, "status" | "archived">, destroying: boolean): string | null {
  if (destroying) return MOVE_REFUSAL.runGone;
  if (run.status === "completed" || run.status === "cancelled") return MOVE_REFUSAL.runOver;
  if (run.archived) return MOVE_REFUSAL.runArchived;
  return null;
}

/**
 * Whether a place could be moved, by what is known of it alone: an active
 * learner's place in a group, told by Publish, of somebody who facilitates no
 * group of the run that still meets (they sit only in the group they run).
 * The ways in offer a move only for such a place; the route refuses the rest
 * in one sentence each.
 */
export function placeTakesMove(
  place: Pick<CourseEnrolmentDoc, "uid" | "role" | "status" | "groupId" | "selfEnrolled" | "allocatedEmailAt">,
  liveGroups: readonly Pick<CourseGroupDoc, "facilitatorUids">[],
): boolean {
  return (
    place.role === "learner" &&
    place.status === "active" &&
    Boolean(place.groupId) &&
    placementIsTold(place) &&
    !liveGroups.some((group) => group.facilitatorUids.includes(place.uid))
  );
}

/** Reads the person's place on the run and decides whether anything can be moved at all. */
export async function readMoveFacts(db: Firestore, runId: string, uid: string): Promise<{ ok: true; facts: MoveFacts } | MoveRefusal> {
  const [runSnap, groupSnap, placeSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseGroups").where("runId", "==", runId).get(),
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get(),
  ]);
  if (!runSnap.exists) return { ok: false, status: 409, error: MOVE_REFUSAL.runGone };
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const runRefusal = runMoveRefusal(run, (runSnap.data() ?? {}).destroying === true);
  if (runRefusal) return { ok: false, status: 409, error: runRefusal };
  const groups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === run.id);
  const live = groups.filter((group) => !group.archived);
  const naming = await readNamingProgramme(db, run.id);
  // An incubator, and any run with one group, has nothing to move to.
  if (naming?.kind === "incubator" || live.length < 2) return { ok: false, status: 409, error: MOVE_REFUSAL.oneGroup };

  const place = placeSnap.exists ? normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {}) : null;
  if (!place || place.runId !== run.id || place.uid !== uid || place.role !== "learner" || place.status !== "active" || !place.groupId) {
    return { ok: false, status: 404, error: MOVE_REFUSAL.noPlace };
  }
  const from = groups.find((group) => group.id === place.groupId) ?? null;
  if (!from) return { ok: false, status: 404, error: MOVE_REFUSAL.noPlace };

  const accounts = await accountsOf((refs) => db.getAll(...refs), db, [uid, ...groups.flatMap((group) => group.facilitatorUids)]);
  const data = accounts.get(uid);
  const person = {
    uid,
    name: data ? fullNameOfUser(data) : "NAISI member",
    firstName: (data ? firstNameOfUser(data) : "") || (data ? fullNameOfUser(data) : ""),
    email: emailOf(data),
  };
  if (!placementIsTold(place)) return { ok: false, status: 409, error: notToldWords(person.firstName) };
  // Somebody who facilitates a group of the run sits only in the group they run.
  const facilitated = live.find((group) => group.facilitatorUids.includes(uid)) ?? null;
  if (facilitated) return { ok: false, status: 409, error: facilitatesWords(person.firstName, facilitated.name) };
  // The group they are in now no longer meets: there is no week of it to move them from.
  if (from.archived) return { ok: false, status: 409, error: oldNoLongerMeetsWords(person.firstName, from.name) };
  return { ok: true, facts: { run, groups, place, from, person, accounts } };
}

/** The choices under "Move to": every group of the run that still meets but theirs, Monday first. */
export function moveChoices(facts: MoveFacts): MoveChoice[] {
  return facts.groups
    .filter((group) => !group.archived && group.id !== facts.from.id)
    .sort(compareGroupsByMeeting)
    .map((group) => {
      const full = group.capacity !== null && group.memberCount >= group.capacity;
      return {
        groupId: group.id,
        name: group.name.trim() || "Untitled group",
        words: groupChoiceWords(lineFacts(group, facts.accounts, facts.person.uid), group.memberCount, full),
        full,
      };
    });
}

/**
 * The week the move would be from, by the rule (`./week.ts`), now: the
 * person's own sessions (each week's from the group they were in that week,
 * so for somebody moved before, never a week of the group they are in now
 * that they spent elsewhere) against the new group's.
 */
export function moveWeekFor(
  run: CourseRunDoc,
  place: Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek">,
  groups: readonly CourseGroupDoc[],
  to: CourseGroupDoc,
  now: Date,
): MoveWeek {
  const sessionsOf = (groupId: string) => {
    const group = groups.find((each) => each.id === groupId);
    return group && !group.archived ? resolveSessions(run, group) : null;
  };
  return moveWeekOf({ oldSessions: sessionsByWeekGroup(place, sessionsOf), newSessions: resolveSessions(run, to), now });
}

/** The week rule's refusal in its sentence. */
function weekRefusal(week: Extract<MoveWeek, { ok: false }>, facts: MoveFacts, to: CourseGroupDoc): string {
  const refusal = week.refusal;
  if (refusal.kind === "old-has-none-set") return oldHasNoneSetWords(facts.person.firstName, facts.from.name);
  if (refusal.kind === "old-still-to-come") {
    return oldStillToComeWords({
      firstName: facts.person.firstName,
      fromName: facts.from.name,
      weekNumber: refusal.session.weekNumber,
      dateKey: refusal.session.dateKey,
      startTimeLocal: refusal.session.session.startTimeLocal,
    });
  }
  if (refusal.kind === "old-has-none-left") return oldHasNoneLeftWords(facts.person.firstName, facts.from.name);
  if (refusal.kind === "new-has-none") return newHasNoneWords(to.name, refusal.weekNumber);
  return newHasMetWords({
    firstName: facts.person.firstName,
    toName: to.name,
    fromName: facts.from.name,
    weekNumber: refusal.weekNumber,
    dateKey: refusal.oldSession.dateKey,
    startTimeLocal: refusal.oldSession.session.startTimeLocal,
  });
}

/**
 * The group a move to `toGroupId` would go to, or why there is none. The
 * route's 404 for a group that is not the run's; 409 for one that no longer
 * meets, is theirs already, or is full (HARD, as the allocation board is:
 * reaching the limit is allowed, passing it is not).
 */
export function targetOf(facts: MoveFacts, toGroupId: string): { ok: true; to: CourseGroupDoc } | MoveRefusal {
  const to = facts.groups.find((group) => group.id === toGroupId) ?? null;
  if (!to) return { ok: false, status: 404, error: MOVE_REFUSAL.noGroup };
  if (to.archived) return { ok: false, status: 409, error: archivedWords(to.name) };
  if (to.id === facts.from.id) return { ok: false, status: 409, error: alreadyInWords(facts.person.firstName, to.name) };
  if (to.capacity !== null && to.memberCount >= to.capacity) return { ok: false, status: 409, error: fullWords(to.name, to.memberCount, to.capacity) };
  return { ok: true, to };
}

/** The weeks before N, by the groups they were spent in (one for somebody never moved before). */
function stayNamesOf(facts: MoveFacts, weeks: readonly number[]): string[] {
  const ids = [...new Set(weeks.map((week) => groupForWeek(facts.place, week) ?? facts.from.id))];
  return ids.map((id) => facts.groups.find((group) => group.id === id)?.name.trim() || "the group");
}

/** The fields of a week that say when and by whom it was made, not what it says. */
const COPY_META = new Set(["updatedAt", "createdAt", "updatedByUid", "forkedAt", "forkedByUid", "forkedFromRunWeekAt", "groupId", "runId", "publishedAt"]);

/** What one copy of a week says, as text to compare, or null for none. */
function copyContent(snap: DocumentSnapshot | undefined): string | null {
  if (!snap?.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const kept = Object.keys(data)
    .filter((key) => !COPY_META.has(key))
    .sort()
    .map((key) => [key, data[key]]);
  return JSON.stringify(kept);
}

/**
 * The weeks asked about whose copy differs between the two groups: each
 * group's own copy of the week where it has one, else the run's, compared by
 * what it says (never by when or by whom it was made). Asked for the weeks
 * before N (the Copies line) and for the weeks from N on that the person has
 * already written in (one line each).
 */
async function copiesDiffer(db: Firestore, runId: string, from: CourseGroupDoc, to: CourseGroupDoc, weeks: readonly number[]): Promise<number[]> {
  if (weeks.length === 0) return [];
  const refs = weeks.flatMap((week) => [
    db.collection("courseGroups").doc(from.id).collection("weeks").doc(weekDocId(week)),
    db.collection("courseGroups").doc(to.id).collection("weeks").doc(weekDocId(week)),
    db.collection("courseRuns").doc(runId).collection("weeks").doc(weekDocId(week)),
  ]);
  const snaps = await db.getAll(...refs);
  return weeks.filter((_, index) => {
    const [fromCopy, toCopy, runCopy] = [snaps[index * 3], snaps[index * 3 + 1], snaps[index * 3 + 2]];
    const of = (copy: DocumentSnapshot) => (copy?.exists ? copyContent(copy) : copyContent(runCopy));
    return of(fromCopy) !== of(toCopy);
  });
}

/** One person's own rows of a run's answers read for the weeks they have written in: a run's weeks, with room to spare. */
const MAX_OWN_ROWS = 600;

/**
 * Whether one of a person's own rows of a run's answers holds something they
 * wrote: a box that is written (`boxIsWritten`), a written answer by its
 * count of words, a summer exercise's answer by whether it holds anything.
 * Only yes or no: no word is kept or handed on.
 */
function holdsWriting(data: Record<string, unknown>): boolean {
  if (isOwnBoxResponse(data)) return boxIsWritten(data);
  if (isWordCountedAnswer(data)) return typeof data.words === "number" && data.words > 0;
  const text = typeof data.text === "string" ? data.text.trim() : "";
  const link = typeof data.linkUrl === "string" ? data.linkUrl.trim() : "";
  return text !== "" || link !== "";
}

/**
 * The weeks from N on in which the person has already written something:
 * every such week is still the old group's until the move, so it was written
 * on the old group's copy. Their own rows, two equalities on (uid, runId), as
 * the overview reads them.
 */
async function weeksWrittenFrom(db: Firestore, runId: string, uid: string, weekNumber: number): Promise<number[]> {
  const snap = await db
    .collection("courseExerciseResponses")
    .where("uid", "==", uid)
    .where("runId", "==", runId)
    .limit(MAX_OWN_ROWS)
    .get();
  const weeks = new Set<number>();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const week = typeof data.weekNumber === "number" ? data.weekNumber : NaN;
    if (Number.isInteger(week) && week >= weekNumber && holdsWriting(data)) weeks.add(week);
  }
  return [...weeks].sort((a, b) => a - b);
}

/**
 * What the move leaves behind on the old group, from week N on: a line on
 * one of its registers that says they are excused (asked, or approved), a
 * "most weeks" tick about one of its sessions, and a request to be excused
 * still waiting about one.
 */
async function leftBehindOf(db: Firestore, facts: MoveFacts, weekNumber: number): Promise<LeftBehind[]> {
  const { run, from, place } = facts;
  const later = resolveSessions(run, from).filter((session) => session.weekNumber >= weekNumber);
  const ticked = new Set(
    place.timeAnswer?.kind === "mostWeeks" && place.timeAnswer.forGroupId === from.id ? place.timeAnswer.sessionKeys : [],
  );
  const out: LeftBehind[] = [];
  const registers = later.length ? await db.getAll(...later.map((s) => db.collection("courseAttendance").doc(attendanceDocId(run.id, from.id, s.weekNumber, s.occurrence)))) : [];
  later.forEach((session, index) => {
    if (ticked.has(session.sessionKey)) {
      out.push({ kind: "most-weeks", weekNumber: session.weekNumber });
      return;
    }
    const lines = (registers[index]?.data()?.[EXCUSED_IN_ADVANCE] ?? {}) as Record<string, unknown>;
    if (registers[index]?.exists && lines && typeof lines === "object" && place.uid in lines) {
      out.push({ kind: "excused", weekNumber: session.weekNumber });
    }
  });
  const requests = await ownRequestsIn(null, db, place.uid, run.id);
  for (const request of requests) {
    if (request.groupId !== from.id) continue;
    for (const week of request.weeks) {
      const parts = sessionKeyParts(week.sessionKey);
      if (week.status === "waiting" && parts && parts.weekNumber >= weekNumber) out.push({ kind: "waiting", weekNumber: parts.weekNumber });
    }
  }
  return out;
}

/**
 * WHAT A MOVE TO ONE GROUP WOULD DO, now: the week by the rule, the lines the
 * page draws, the emails and who they go to. Refused, one sentence each,
 * when the group cannot be chosen or the week rule offers no week.
 */
export async function planMove(
  db: Firestore,
  facts: MoveFacts,
  toGroupId: string,
  actorUid: string,
  now: Date,
): Promise<MoveOutcome> {
  const target = targetOf(facts, toGroupId);
  if (!target.ok) return target;
  const { to } = target;
  const week = moveWeekFor(facts.run, facts.place, facts.groups, to, now);
  if (!week.ok) return { ok: false, status: 409, error: weekRefusal(week, facts, to) };

  const { person, from, place, accounts } = facts;
  const weekNumber = week.weekNumber;
  const weeks = weeksThatCome(place.joinedWeekNumber, weekNumber);
  const stayNames = stayNamesOf(facts, weeks);
  const recipients = moveRecipients({ person, from, to, accounts, actorUid });
  const [feedback, differ, leftBehind, writtenAhead] = await Promise.all([
    readOwnFeedback(db, facts.run.id, person.uid),
    copiesDiffer(db, facts.run.id, from, to, weeks),
    leftBehindOf(db, facts, weekNumber),
    // Weeks from N on already written in on the old group's copy, whose copy differs in the new group.
    weeksWrittenFrom(db, facts.run.id, person.uid, weekNumber).then((written) => copiesDiffer(db, facts.run.id, from, to, written)),
  ]);
  const feedbackFrom = [...new Set(feedback.map((piece) => piece.byUid))].filter((uid) => from.facilitatorUids.includes(uid));
  const firstOf = (uid: string) => {
    const data = accounts.get(uid);
    return data ? firstNameOfUser(data) : "";
  };

  const toLine = lineFacts(to, accounts, person.uid);
  const emailFacts: MoveEmailFacts = {
    personName: person.name,
    personFirstName: person.firstName,
    weekNumber,
    weeksThatCome: weeks,
    to: toLine,
    fromName: from.name.trim(),
    firstSessionDateKey: week.newSession.dateKey,
  };

  const lines: MoveLine[] = [
    {
      label: LINE_LABEL.group,
      text: groupLineWords({ firstName: person.firstName, weekNumber, toName: to.name, then: to.memberCount + 1, capacity: to.capacity }),
    },
    {
      label: LINE_LABEL.work,
      text: workLineWords({
        firstName: person.firstName,
        weeks,
        newFacilitators: to.facilitatorUids.map(firstOf).filter(Boolean),
        oldFacilitators: from.facilitatorUids.map(firstOf).filter(Boolean),
        feedbackFrom: feedbackFrom.map(firstOf).filter(Boolean),
        toName: to.name,
        fromName: from.name,
      }),
    },
    ...(differ.length > 0
      ? [{ label: LINE_LABEL.copies, text: copiesLineWords({ firstName: person.firstName, weeks: differ, toName: to.name, fromName: from.name }) }]
      : []),
    // One line for each week from N on already written in on the old group's
    // version that the new group's differs from: said before the press.
    ...writtenAhead.map((week) => ({
      label: LINE_LABEL.copies,
      text: writtenAheadWords({ firstName: person.firstName, weekNumber: week, fromName: from.name, toName: to.name }),
    })),
    { label: LINE_LABEL.attendance, text: attendanceLineWords({ firstName: person.firstName, weeks, stayNames, toName: to.name }) },
    { label: LINE_LABEL.late, text: lateLineWords({ toName: to.name, weekday: to.session.weekday, weekNumber }) },
    { label: LINE_LABEL.registers, text: registersLineWords({ firstName: person.firstName, fromName: from.name, toName: to.name, weekNumber }) },
    ...(leftBehind.length > 0 ? [{ label: LINE_LABEL.leftBehind, text: leftBehindWords(person.firstName, from.name, leftBehind) }] : []),
  ];

  const toPerson = recipients.find((each) => each.as === "person") ?? null;
  return {
    ok: true,
    plan: {
      toGroupId: to.id,
      toName: to.name.trim() || "Untitled group",
      weekNumber,
      weekStated: weekStatedWords(weekNumber, to.name, week.newSession.dateKey),
      weeksStay: weeksStayWords(weeks, stayNames, person.firstName),
      skipsOld: skipsOldSessionWords({ firstName: person.firstName, fromName: from.name, dateKey: week.oldSession.dateKey, weekNumber }),
      lines,
      told: toldLineWords(recipients.map((each) => each.firstName || "somebody")),
      personEmail: toPerson ? { heading: toPersonHeading(person.firstName), words: personEmailWords(emailFacts) } : null,
      button: moveButtonWords(person.firstName, to.name, recipients.length),
      recipients,
      emails: recipients.length,
      emailFacts,
      feedbackFrom,
    },
  };
}

/** The email each recipient is sent, in the approved words. */
export function emailFor(plan: Pick<MovePlan, "emailFacts" | "feedbackFrom">, recipient: MoveRecipient): MoveEmailWords {
  if (recipient.as === "person") return personEmailWords(plan.emailFacts);
  if (recipient.as === "new") return newFacilitatorsEmailWords(plan.emailFacts);
  return oldFacilitatorsEmailWords(plan.emailFacts, plan.feedbackFrom.includes(recipient.uid));
}

/** Inside the save's transaction: the accounts of the person and the two groups' facilitators, read there. */
export async function accountsIn(tx: Transaction, db: Firestore, uids: Iterable<string>): Promise<Map<string, Record<string, unknown>>> {
  return accountsOf((refs) => tx.getAll(...refs), db, uids);
}

/** What the page and the route's preview draw of a plan: never an address. */
export function previewOf(plan: MovePlan): MovePreviewView {
  return {
    toGroupId: plan.toGroupId,
    weekNumber: plan.weekNumber,
    weekStated: plan.weekStated,
    weeksStay: plan.weeksStay,
    skipsOld: plan.skipsOld,
    lines: plan.lines,
    told: plan.told,
    personEmail: plan.personEmail
      ? { heading: plan.personEmail.heading, subject: plan.personEmail.words.subject, lines: plan.personEmail.words.lines }
      : null,
    button: plan.button,
    emails: plan.emails,
  };
}
