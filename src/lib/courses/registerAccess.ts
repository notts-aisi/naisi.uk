import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  ENROLMENT_STATUSES,
  normalizeCourseEnrolment,
  placementIsShownTo,
} from "@/lib/firestore/courseEnrolments";
import {
  attendanceDocId,
  normalizeCourseAttendance,
  type CourseAttendanceDoc,
  type RegisterCover,
} from "@/lib/firestore/courseAttendance";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { firstNameOfUser } from "./programmeLead";
import { holdsCover, holdsGivenCover } from "./registerCover/model";
import { runsThingsOn } from "./registerCover/runsThings";
import { doesTrackLeadWork, readsTimeAnswers, runStaffingOf, type StaffedRun } from "./runStaffing";

/**
 * WHO MAY TOUCH A GROUP'S REGISTER, in one place.
 *
 * There are several doors onto the same documents: the register itself
 * (GET and POST), the admin's post-push edit (PATCH), finishing it (the push),
 * the participant-note drawer, the check-in, taking a register in somebody's
 * place and the facilitator record. They are verbs on ONE act, running a
 * session, so one gate decides who reaches any of them, and one function
 * (`registerSessionAccess`) what each may do on one session, and both live
 * here.
 *
 * ── THE PREDICATE ───────────────────────────────────────────────────────────
 * A facilitator of THIS group, while it is LIVE (`courseGroups.facilitatorUids`
 * on a group that is not archived), admins, the people leading the programme
 * that names the group's run (its lead, worked out from the form when they
 * ask, and the run's track leads: `doesTrackLeadWork`), and somebody an admin
 * or a lead GAVE one session to, for that session only, while it holds and
 * while they run things on the programme (`givenSessionStands`, the
 * give's own bar asked again at every use).
 *  · ARCHIVING A GROUP UNSTAFFS IT. One rule, stated identically in
 *    `runAccess.ts`, the exercises queue, the review route and the page gates.
 *    Admins bypass it: an archived cohort is exactly what an admin is asked to
 *    go back and look at. The people leading the programme still READ an
 *    archived group's registers: the record is still the programme's.
 *  · Plain members get 403. Attendance is a roster-wide record, and "who else
 *    missed last week" is not a member's to read even about their own group. A
 *    member's OWN attendance travels on the run overview instead.
 *  · Another group's facilitator and an admissions reviewer get 403.
 *  · ADMITTED TO THE GROUP IS NOT ADMITTED TO EVERY DOOR. Each door asks
 *    `registerSessionAccess` what the caller may do on the one session it is
 *    about: somebody given a session writes that session's register and no
 *    other; a lead who has not taken a session's register opens no check-in
 *    and writes no report; and whether each facilitator was there, a
 *    cover's reason and a check-in's totals go to admins and the programme's
 *    lead only, never to a run's track lead by that alone.
 *  · THE REGISTER'S NOTES are the group's facilitators' and admins':
 *    what a facilitator writes about a named person, and about a session as a
 *    whole, is not sent to a lead or to somebody given a session, and a write
 *    of theirs that carries one is refused. `readsNotes` says which callers
 *    get them, and the GET is the one door that hands notes out to a reader.
 *
 * ── AUTHORIZATION BEFORE EXISTENCE ──────────────────────────────────────────
 * A missing group, an ARCHIVED group and a group you do not facilitate all
 * collapse onto the SAME 403, so probing group ids tells you nothing about
 * which ones exist. The honest 404/400 answers below the gate are reachable
 * only by an admin, who could read those documents anyway.
 *
 * ── PII: NAMES ONLY ─────────────────────────────────────────────────────────
 * A register's names never include an email. A register is a list of people
 * who did or did not turn up; it must not double as a mailing list. Anything
 * that needs to reach these people goes through the group email route, which
 * resolves addresses server-side and never hands them out. Each row is named
 * by the names rule for whoever the register is drawn for (`nameForViewer`):
 * the committee and admins see "Priya Shah (Pri)", a facilitator who is not
 * on it the name people go by.
 */

/** Roster read cap, the same number the roster and exercises routes use. */
export const MAX_REGISTER_MEMBERS = 100;

/**
 * Dynamic segments arrive URL-DECODED, so a `%2F` reaches a route as a real
 * path separator and `doc()` would throw. Same guard as `runAccess.ts`,
 * deliberately identical so the gate and the routes agree on what counts as
 * addressable.
 */
export function isAddressableId(value: string): boolean {
  return Boolean(value) && !value.includes("/") && value !== "." && value !== "..";
}

/**
 * Display-name fallback chain: preferred name, then account name, then a
 * neutral placeholder. NEVER an email address, which is what makes this safe
 * for a facilitator-facing register.
 */
export function displayNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = profile.preferredName;
  const display = data.displayName;
  return (
    (typeof preferred === "string" && preferred.trim()) ||
    (typeof display === "string" && display.trim()) ||
    "NAISI member"
  );
}

export type RegisterGate =
  | {
      ok: true;
      group: CourseGroupDoc;
      runId: string;
      isAdmin: boolean;
      /**
       * True for an admin and the group's live facilitators, the people the
       * register's notes are written for. False for a caller admitted only
       * as somebody leading the programme or somebody given a session, who
       * are sent the marks and no note, and whose writes may carry none.
       */
      readsNotes: boolean;
      /** A live facilitator of THIS group, held to the bar they were appointed behind. */
      facilitates: boolean;
      /**
       * Not an admin, and leading the programme that names the group's run
       * or one of the run's track leads (`doesTrackLeadWork`): takes any
       * session's register of the run, in a facilitator's place. Whether
       * each facilitator was there is `leadsProgramme`'s, not this.
       */
      leads: boolean;
      /**
       * Not an admin, not a facilitator of the group, and the lead of the
       * programme that names the group's run (worked out from the form when
       * they ask). Narrower than `leads`: a run's track lead by that alone is
       * not. Who is sent whether each facilitator was there, a cover's
       * reason and a check-in's totals, as the privacy policy says
       * ("The programme's lead and admins see this").
       */
      leadsProgramme: boolean;
      /**
       * The sessions of this group the caller was GIVEN by an admin or a lead,
       * by key, while each grant holds and while they run things on the
       * programme (`givenSessionStands`): the only registers they read or
       * take. Empty for everybody admitted any other way.
       */
      givenSessions: string[];
    }
  /** Map straight onto a `NextResponse.json({ error }, { status })`. */
  | { ok: false; status: number; error: string };

/** The roles of an approved account: the floor under somebody given a session. */
const APPROVED_ROLES = new Set(["member", "committee", "admin"]);

/** Most sessions of one group a person could be given at once, for the one query that finds them. */
const MAX_GIVEN_PER_GROUP = 20;

/**
 * THE SESSIONS OF A GROUP SOMEBODY WAS GIVEN, whose grants hold: the
 * registers whose `cover` names them as the person given it. One equality
 * query on two fields (no index is owed for equalities alone), asked only of
 * a caller nothing else admits, so the group's facilitators, its leads and
 * admins never pay for it.
 */
async function liveGrantsOf(db: Firestore, group: CourseGroupDoc, actor: SessionUser, now: Date): Promise<string[]> {
  if (!APPROVED_ROLES.has(actor.role) || !actor.uid) return [];
  const snap = await db
    .collection("courseAttendance")
    .where("groupId", "==", group.id)
    .where("cover.byUid", "==", actor.uid)
    .limit(MAX_GIVEN_PER_GROUP)
    .get();
  const keys: string[] = [];
  for (const doc of snap.docs) {
    const register = normalizeCourseAttendance(doc.id, doc.data() ?? {});
    if (register.runId !== group.runId || register.groupId !== group.id) continue;
    if (holdsGivenCover(register.cover, actor.uid, now)) keys.push(register.sessionKey);
  }
  return keys.sort();
}

/**
 * WHETHER SOMEBODY GIVEN A SESSION STILL STANDS BEHIND THE BAR IT WAS GIVEN
 * BEHIND, asked at every use: an approved account (the authority's own
 * bar, `courseAttendance.cover.byUid`) that runs things on the
 * programme, through the one function the give asks (`runsThingsOn`). An
 * admin's, a committee member's and a facilitator's who facilitates a
 * live group of the run stand; somebody who runs nothing there does not, and
 * the session can be given again.
 */
export async function givenSessionStands(db: Firestore, runId: string, actor: SessionUser): Promise<boolean> {
  if (!holdsStanding(actor, "courseAttendance.cover.byUid")) return false;
  if (!isAddressableId(runId)) return false;
  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return false;
  return runsThingsOn(db, { id: runId, trackLeadUids: (runSnap.data() ?? {}).trackLeadUids }, { standing: actor });
}

/**
 * THE SESSIONS OF A GROUP SOMEBODY WAS GIVEN, while each grant holds and
 * while they stand behind the bar it was given behind
 * (`givenSessionStands`): the only registers they read or take.
 */
async function givenSessionsOf(db: Firestore, group: CourseGroupDoc, actor: SessionUser, now: Date): Promise<string[]> {
  const keys = await liveGrantsOf(db, group, actor, now);
  if (keys.length === 0) return [];
  return (await givenSessionStands(db, group.runId, actor)) ? keys : [];
}

/**
 * WHETHER A SESSION GIVEN TO THIS PERSON DOES NOT STAND because they run
 * nothing on the programme: the grant holds, and the bar
 * it was given behind does not. What the register's page tells them in a
 * sentence, rather than sending them away with no word. False for anything
 * else: no grant, an ended one, or one that stands.
 */
export async function givenSessionLapsed(
  db: Firestore,
  input: { runId: string; groupId: string; sessionKey: string },
  actor: SessionUser,
  now: Date,
): Promise<boolean> {
  const { runId, groupId, sessionKey } = input;
  if (!isAddressableId(groupId) || !isAddressableId(runId)) return false;
  const snap = await db.collection("courseGroups").doc(groupId).get();
  if (!snap.exists) return false;
  const group = normalizeCourseGroup(snap.id, snap.data() ?? {});
  if (group.archived || group.runId !== runId) return false;
  const keys = await liveGrantsOf(db, group, actor, now);
  if (!keys.includes(sessionKey)) return false;
  return !(await givenSessionStands(db, group.runId, actor));
}

/**
 * How the caller stands on one group's registers, off the group's document
 * (and, only for somebody it does not already admit, the run's and the
 * registers that name them as given a session).
 *
 * For a WRITE an archived group is unstaffed: its facilitators, its leads and
 * anybody given a session are refused, and an admin is not. For a READ the
 * people leading the programme read an archived group's registers too.
 */
async function standingOnRegisters(
  groupId: string,
  actor: SessionUser,
  db: Firestore,
  mode: "write" | "read",
): Promise<{
  group: CourseGroupDoc | null;
  isAdmin: boolean;
  facilitates: boolean;
  leads: boolean;
  leadsProgramme: boolean;
  givenSessions: string[];
}> {
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const group = groupSnap.exists
    ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {})
    : null;

  const isAdmin = actor.role === "admin";
  const facilitates = Boolean(
    group &&
      !group.archived &&
      isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  let leads = false;
  let leadsProgramme = false;
  if (!isAdmin && !facilitates && group && isAddressableId(group.runId) && (mode === "read" || !group.archived)) {
    const runSnap = await db.collection("courseRuns").doc(group.runId).get();
    const trackLeadUids = runSnap.exists ? (runSnap.data() ?? {}).trackLeadUids : [];
    const staffing = await runStaffingOf(db, actor, { id: group.runId, trackLeadUids });
    leads = doesTrackLeadWork(staffing);
    leadsProgramme = staffing.leadOf !== null;
  }
  const givenSessions =
    !isAdmin && !facilitates && !leads && group && !group.archived && isAddressableId(group.runId)
      ? await givenSessionsOf(db, group, actor, new Date())
      : [];
  return { group, isAdmin, facilitates, leads, leadsProgramme, givenSessions };
}

/**
 * Resolve the group and decide who may WRITE its register: an admin, a live
 * facilitator of the group, somebody leading the programme that names its
 * run (its lead, the run's track leads), and somebody given one of its
 * sessions while that grant holds. Returns a plain status and sentence rather
 * than a `NextResponse` so this module stays free of `next/server`; each
 * route renders its own response.
 *
 * ADMITTED HERE IS NOT ADMITTED EVERYWHERE. Each door narrows it for what it
 * does: a register's notes and the note drawer are `readsNotes`' alone; the
 * check-in and the session report are the facilitators', an admin's for the
 * check-in, and whoever took THAT session's register (`registerSessionAccess`);
 * somebody given a session writes that session's register and nothing else.
 */
export async function gateGroupRegister(
  groupId: string,
  actor: SessionUser,
  db: Firestore,
): Promise<RegisterGate> {
  const { group, isAdmin, facilitates, leads, leadsProgramme, givenSessions } = await standingOnRegisters(groupId, actor, db, "write");
  if (!isAdmin && !facilitates && !leads && givenSessions.length === 0) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  // Reachable only by an admin: every other caller is already past the gate on
  // a group that exists, so this discloses nothing they could not read anyway.
  if (!group) return { ok: false, status: 404, error: "Group not found" };
  if (!group.runId || !isAddressableId(group.runId)) {
    return { ok: false, status: 400, error: "Group is not attached to a run" };
  }
  return {
    ok: true,
    group,
    runId: group.runId,
    isAdmin,
    readsNotes: isAdmin || facilitates,
    facilitates,
    leads,
    leadsProgramme,
    givenSessions,
  };
}

/**
 * Resolve the group and decide who may READ its register: everybody
 * `gateGroupRegister` admits, and the people leading the programme that
 * names the group's run read an archived group's registers too. The
 * register's GET is the one door that asks this; every write keeps
 * `gateGroupRegister`.
 *
 * The same refusals as the write gate: a missing group, a group on another
 * programme's run and a group the caller has no part in collapse onto one
 * 403, so probing ids tells nobody which exist. `isAdmin` stays the admin's
 * alone, so a lead reads the people Publish has told and corrects nothing,
 * and `readsNotes` is false for a lead and for somebody given a session, who
 * are sent no note.
 */
export async function gateGroupRegisterRead(
  groupId: string,
  actor: SessionUser,
  db: Firestore,
): Promise<RegisterGate> {
  const { group, isAdmin, facilitates, leads, leadsProgramme, givenSessions } = await standingOnRegisters(groupId, actor, db, "read");
  if (!isAdmin && !facilitates && !leads && givenSessions.length === 0) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  // Reachable only by an admin: anybody else is past the gate on a group
  // that exists.
  if (!group) return { ok: false, status: 404, error: "Group not found" };
  if (!group.runId || !isAddressableId(group.runId)) {
    return { ok: false, status: 400, error: "Group is not attached to a run" };
  }
  return {
    ok: true,
    group,
    runId: group.runId,
    isAdmin,
    readsNotes: isAdmin || facilitates,
    facilitates,
    leads,
    leadsProgramme,
    givenSessions,
  };
}

/**
 * THE SESSIONS OF A GROUP WHOSE REGISTER THE CALLER TOOK IN A FACILITATOR'S
 * PLACE, while each cover holds (a lead's or an admin's own, or a session
 * given to them, until it ends): the sessions whose check-in they open and
 * whose report they write. The same one equality query as for a session
 * given, asked only of somebody who facilitates nothing here.
 */
export async function coveredSessionsOf(
  db: Firestore,
  group: Pick<CourseGroupDoc, "id" | "runId">,
  uid: string,
  now: Date,
): Promise<string[]> {
  if (!uid) return [];
  const snap = await db
    .collection("courseAttendance")
    .where("groupId", "==", group.id)
    .where("cover.byUid", "==", uid)
    .limit(MAX_GIVEN_PER_GROUP)
    .get();
  const keys: string[] = [];
  for (const doc of snap.docs) {
    const register = normalizeCourseAttendance(doc.id, doc.data() ?? {});
    if (register.runId !== group.runId || register.groupId !== group.id) continue;
    if (holdsCover(register.cover, uid, now)) keys.push(register.sessionKey);
  }
  return keys.sort();
}

/** "w03" or "w03-2", as its week and occurrence, or null. */
function sessionKeyParts(key: string): { weekNumber: number; occurrence: number } | null {
  const match = /^w(\d{2})(?:-(\d))?$/.exec(key);
  if (!match) return null;
  const weekNumber = Number(match[1]);
  const occurrence = match[2] ? Number(match[2]) : 1;
  return weekNumber >= 1 && occurrence >= 1 ? { weekNumber, occurrence } : null;
}

/** One session's register as stored, by its key, or null when it has none. */
export async function readSessionRegister(
  db: Firestore,
  runId: string,
  groupId: string,
  key: string,
): Promise<CourseAttendanceDoc | null> {
  const parts = sessionKeyParts(key);
  if (!parts) return null;
  const snap = await db.collection("courseAttendance").doc(attendanceDocId(runId, groupId, parts.weekNumber, parts.occurrence)).get();
  return snap.exists ? normalizeCourseAttendance(snap.id, snap.data() ?? {}) : null;
}

/** What the caller may do on ONE session's register, once the gate has admitted them to the group's. */
export type RegisterSessionAccess = {
  /** Marks, and Finish. */
  writes: boolean;
  /** The session's notes, and the notes about named people. */
  readsNotes: boolean;
  /** Opens and closes the session's check-in. */
  checksIn: boolean;
  /** Is sent the check-in's totals. */
  readsCheckInTotals: boolean;
  /** Writes a session report for it. */
  reports: boolean;
  /** Reads and changes whether each facilitator was there. */
  readsFacilitatorRecord: boolean;
  /** Took this register in a facilitator's place, and still holds it. */
  holdsCover: boolean;
};

/**
 * ONE SESSION'S DOORS, for a caller the gate has admitted to the group:
 *
 *  - WRITING its register: an admin, the group's facilitators, the people
 *    leading the programme, and somebody given THIS session while it holds.
 *  - ITS NOTES: the group's facilitators and admins, nobody else.
 *  - THE CHECK-IN: the group's facilitators, admins, and whoever took this
 *    session's register (`cover.byUid`). A register somebody took
 *    themselves counts as theirs only while they are an admin or lead the
 *    run today, the people the cover route lets take one; a session given
 *    to somebody counts while the grant holds and stands (the gate admits
 *    a person through a grant only while it stands). A lead who has not
 *    taken it is refused. Its totals go to the group's facilitators,
 *    admins, and the programme's lead who took it: never to a run's track
 *    lead by that alone, nor to somebody who was only given the session.
 *  - THE SESSION REPORT: the group's facilitators, and whoever took this
 *    session's register, counted the same way. An admin or a lead who did
 *    not take it writes none.
 *  - WHETHER EACH FACILITATOR WAS THERE (and a cover's reason): admins and
 *    the programme's lead, never somebody who facilitates the group, however
 *    else they stand, nor a run's track lead by that alone, nor anybody given
 *    a session. The privacy policy says "The programme's lead and admins see
 *    this", and this is the one place that decides it.
 */
export function registerSessionAccess(
  gated: Pick<
    Extract<RegisterGate, { ok: true }>,
    "isAdmin" | "facilitates" | "leads" | "leadsProgramme" | "givenSessions" | "readsNotes"
  >,
  input: { uid: string; sessionKey: string; cover: RegisterCover | null; now: Date },
): RegisterSessionAccess {
  const given = gated.givenSessions.includes(input.sessionKey) && holdsGivenCover(input.cover, input.uid, input.now);
  // A cover somebody took themselves holds for ever, so it counts only while
  // its holder may take one today: an admin, or somebody leading the run.
  const took =
    holdsCover(input.cover, input.uid, input.now) &&
    (input.cover?.kind !== "self" || gated.isAdmin || gated.leads);
  const staff = gated.isAdmin || gated.facilitates;
  return {
    writes: staff || gated.leads || given,
    readsNotes: gated.readsNotes,
    checksIn: staff || took,
    readsCheckInTotals: staff || (gated.leadsProgramme && took),
    reports: gated.facilitates || took,
    readsFacilitatorRecord: readsFacilitatorRecord(gated),
    holdsCover: took,
  };
}

/**
 * WHO IS SENT WHETHER EACH FACILITATOR WAS THERE, and a cover's reason: an
 * admin or the programme's lead, who does not facilitate the group. Asked of
 * the gate's answer alone, so the register's read, the facilitator record's
 * route and the group's history agree.
 */
export function readsFacilitatorRecord(
  gated: Pick<Extract<RegisterGate, { ok: true }>, "isAdmin" | "facilitates" | "leadsProgramme">,
): boolean {
  return (gated.isAdmin || gated.leadsProgramme) && !gated.facilitates;
}

/**
 * WHO MARKS SOMEBODY EXCUSED BY HAND, AND WHO CHANGES AN EXCUSAL THAT
 * STANDS: an admin, or the lead of the programme that names the group's run
 * (`leadsProgramme`, `readsTimeAnswers`), whether or not they also facilitate
 * the group. Never a run's track lead by that alone, a facilitator, a
 * co-facilitator or somebody given a session: people ask to be excused, and
 * an admin decides. The gate does not ask a facilitator of the group whether
 * they also lead the programme, so this asks it of them, the one read it
 * costs (`runStaffingOf`). The marking route and both corrections of a
 * finished register ask it, and the register's read sends the answer to the
 * page (`src/lib/courses/excused/marking.ts`).
 */
export async function marksExcused(
  db: Firestore,
  actor: SessionUser,
  gated: Pick<Extract<RegisterGate, { ok: true }>, "isAdmin" | "facilitates" | "leadsProgramme">,
  run: StaffedRun,
): Promise<boolean> {
  if (gated.isAdmin || gated.leadsProgramme) return true;
  if (!gated.facilitates) return false;
  return readsTimeAnswers(await runStaffingOf(db, actor, run));
}

/**
 * The least a rollup recompute needs to know about a person: who they are, and
 * the week their record starts at. `RegisterMember` is this plus a name.
 */
export type MirrorMember = {
  uid: string;
  joinedWeekNumber: number;
};

/** One row of the register: a person, and the week their record starts at. */
export type RegisterMember = MirrorMember & {
  displayName: string;
};

/**
 * EVERY ENROLMENT ON THE GROUP WHOSE ATTENDANCE IS READ DOWNSTREAM, for the
 * rollup recompute. Not the register's rows: those are the ACTIVE members,
 * because they are who a facilitator can mark.
 *
 * All four statuses are included, and each one is here for a reason rather
 * than by default:
 *  · `active` is the room.
 *  · `completed` is the finished cohort, and its figures are exactly what a
 *    reviewer reads months later.
 *  · `withdrawn` and `removed` still carry an `attendance` rollup that the
 *    admin surfaces and the member's own run overview render.
 * Filtering any of them out would freeze that person's figures at whatever
 * they were before an admin's correction, which is the one moment the numbers
 * were known to be wrong. Nothing is excluded, so there is nothing to name.
 *
 * `status in [...]` rather than dropping the filter: it is the same
 * (runId, groupId, status) composite index the roster and the register query
 * already use, so this needs no new index.
 *
 * NO NAMES ARE RESOLVED. The mirror never renders anybody, so this skips the
 * `users` read the register's own loader does.
 */
export async function loadMirrorMembers(
  db: Firestore,
  runId: string,
  groupId: string,
): Promise<MirrorMember[]> {
  const snap = await db
    .collection("courseEnrolments")
    .where("runId", "==", runId)
    .where("groupId", "==", groupId)
    .where("status", "in", ENROLMENT_STATUSES)
    .limit(MAX_REGISTER_MEMBERS)
    .get();

  const byUid = new Map<string, MirrorMember>();
  for (const d of snap.docs) {
    const e = normalizeCourseEnrolment(d.id, d.data() ?? {});
    if (e.uid && !byUid.has(e.uid)) {
      byUid.set(e.uid, { uid: e.uid, joinedWeekNumber: e.joinedWeekNumber });
    }
  }
  return [...byUid.values()];
}

/** A group's register rows as one viewer is shown them. */
export type RegisterRoster = {
  /** The rows: name-sorted, and only people this viewer may be shown. */
  members: RegisterMember[];
  /**
   * True when somebody placed in the group is left out of `members` because
   * Publish has not told them their group yet. Never true for an admin.
   */
  notYetTold: boolean;
  /**
   * The first word of the name each row goes by, by uid: what a sentence
   * about them calls them ("What made Pri stand out?"), whoever reads it.
   * Never sent with the rows.
   */
  firstNames: Map<string, string>;
};

/**
 * WHO A REGISTER IS DRAWN FOR. `isAdmin` decides who is a row (an admin sees
 * everybody placed, anybody else the people Publish has told). `role` decides
 * the name each row is shown by, through the names rule (`nameForViewer`):
 * the committee role and admins see the full name, everybody else the name
 * people go by. Left out, every row reads by the name people go by, which is
 * what anything that reaches the people themselves wants
 * (`loadToldRegisterMembers`).
 */
export type RegisterViewer = { isAdmin: boolean; role?: string | null };

/**
 * The group's ACTIVE members, name-sorted, with the joined week that scopes
 * their row. Scoped by the GROUP's own `runId`, never a caller parameter, so
 * it is an exact match for the existing (runId, groupId, status) composite
 * index, the same query the roster and exercises routes run.
 *
 * ONLY PEOPLE WHO HAVE BEEN TOLD, for anybody but an admin. Somebody an admin
 * has placed and Publish has not yet emailed is not on a facilitator's
 * register: not named, not markable, not noted (`placementIsShownTo`). The
 * rows are also the marks a write may carry, so a facilitator cannot mark
 * somebody they cannot see.
 */
export async function loadRegisterMembers(
  db: Firestore,
  runId: string,
  groupId: string,
  viewer: RegisterViewer,
): Promise<RegisterRoster> {
  const memberSnap = await db
    .collection("courseEnrolments")
    .where("runId", "==", runId)
    .where("groupId", "==", groupId)
    .where("status", "==", "active")
    .limit(MAX_REGISTER_MEMBERS)
    .get();

  // Deduplicated by uid. `courseEnrolmentId` binds (run, uid), so a second row
  // for the same person is structurally impossible, but a duplicate here would
  // become a duplicate React key and a second row in the register, and the Map
  // costs nothing.
  const byUid = new Map<string, ReturnType<typeof normalizeCourseEnrolment>>();
  let notYetTold = false;
  for (const d of memberSnap.docs) {
    const e = normalizeCourseEnrolment(d.id, d.data() ?? {});
    if (!e.uid || byUid.has(e.uid)) continue;
    if (!placementIsShownTo(e, viewer)) {
      notYetTold = true;
      continue;
    }
    byUid.set(e.uid, e);
  }

  const uids = [...byUid.keys()];
  const userDocs = uids.length
    ? await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)))
    : [];
  const nameByUid = new Map<string, string>();
  const firstNames = new Map<string, string>();
  for (const doc of userDocs) {
    if (!doc.exists) continue;
    const data = doc.data() ?? {};
    nameByUid.set(doc.id, nameForViewer(viewer, accountNamesOf(data), "NAISI member"));
    firstNames.set(doc.id, firstNameOfUser(data) || displayNameOf(data));
  }

  const members = [...byUid.values()]
    .map((e) => ({
      uid: e.uid,
      displayName: nameByUid.get(e.uid) ?? "NAISI member",
      joinedWeekNumber: e.joinedWeekNumber,
    }))
    .sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) || a.uid.localeCompare(b.uid),
    );
  return { members, notYetTold, firstNames };
}

/**
 * THE ROWS PUBLISH HAS TOLD, whoever asks: the register as anybody but an
 * admin is shown it. For what REACHES the people on a register rather than
 * shows it to somebody: the check-in at the end of a session
 * (`src/lib/surveys/checkIns/`) makes a row and sends an email naming the
 * group, so it never reaches a person before Publish has told them their
 * group, even when an admin presses. It can only narrow what a caller sees,
 * which is why it takes no role.
 */
export function loadToldRegisterMembers(db: Firestore, runId: string, groupId: string): Promise<RegisterRoster> {
  return loadRegisterMembers(db, runId, groupId, { isAdmin: false });
}
