import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { roleOnProgramme } from "@/lib/applications/access";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { readProgrammePeople } from "@/lib/applications/people/load";
import { listGroups, readRunRecords, slotLine, weeksOf } from "@/lib/courses/programmeAttendance";
import { namingProgrammeIn } from "@/lib/courses/programmeLead";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { canAuthorAdmissionRound } from "@/lib/firestore/users";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { lineOf, searchWorld, type SearchAnswer, type SearchCandidate, type SearchWorld } from "./model";

/**
 * SEARCH FOR A PERSON OR A GROUP: who may, and the lists each kind of reader
 * already opens, read as those lists' own pages read them.
 *
 * Search is a new way to ask about people, so it answers nothing a reader
 * could not already list. Every result comes from a list the reader may open
 * today, through that list's own gate and loader, and leads to a page that
 * gate admits them to:
 *
 *  - AN ADMIN: every account (the roster an admin reads on the Members page,
 *    pending and refused accounts included, as Approvals and the Members
 *    page's own switch show them), each to their page under the Members
 *    page; and every group of every run that is not being destroyed, each to
 *    its page under the programme that names its run, or to the group's own
 *    page when no programme names it.
 *  - A PROGRAMME'S LEAD: the rows of the People tab of each programme they
 *    lead, read by the tab's own reader (`readProgrammePeople`, after the
 *    tab's own gate, `roleOnProgramme` and the admissions tree's page gate),
 *    each to their row on that tab; and the run's groups, each to its page
 *    under the programme.
 *  - A GROUP'S FACILITATOR: the people their group's page lists, read by that
 *    page's own reader (`listGroups` over `readRunRecords`, as
 *    `loadFacilitatorGroup` reads it, after the page's own gate: a live group
 *    that names them, held to the facilitator's bar), each to that page; and
 *    those groups.
 *  - ANYBODY ELSE: nothing, and the route answers them as it answers a
 *    stranger.
 *
 * A lead or a facilitator is never answered from a query over `users`: their
 * people come from the People tab's applications and the group's own seats.
 * Only an admin's world reads the `users` collection, and only the three name
 * fields of each account (`select`): never an address.
 *
 * NOTHING IS KEPT. No index of people is built or stored, and no query, no
 * result and no count of either is written or logged anywhere: each request
 * reads its reader's lists, filters them in memory (`./model.ts`) and forgets
 * them.
 *
 * WHAT ONE QUERY READS, by reader, every read an equality on one field, an
 * `in` or an `array-contains` on one field, or a whole small collection, so
 * nothing needs a declared index:
 *
 *  - admin: every account (U, three fields each), every group (G), each
 *    group's run (R, addressed), every application form (F); then, for the
 *    six people at most in the answer, their seats on courses (one `in`).
 *  - lead: every form (F); per programme they lead, the form's sent
 *    applications (A) and decisions (D), its run (1), the run's groups (g)
 *    and seats (e).
 *  - facilitator: the groups that name them (k, one `array-contains`); per
 *    run those groups are on, the run, its groups, seats, registers, the
 *    scheduler's switches and the accounts of its people and facilitators,
 *    by address (`readRunRecords`, about 2 + g + 2e + r), and every form (F)
 *    for the programme's name.
 */

const isPlainId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("/") && value !== "." && value !== "..";

const enc = encodeURIComponent;

/** A programme's own address, under its form. */
export function programmePathOf(roundId: string, programmeId: string): string {
  return `/admin/admissions/forms/${enc(roundId)}/programmes/${enc(programmeId)}`;
}

/** A group's page for its facilitators (and admins). */
export function facilitatorGroupPathOf(runId: string, groupId: string): string {
  return `/learn/${enc(runId)}/group/${enc(groupId)}`;
}

/**
 * One account's page for an admin. The place a page for one person on a
 * programme would be linked from instead, once there is one.
 */
export function memberPathOf(uid: string): string {
  return `/admin/members/${enc(uid)}`;
}

/** A programme this person leads, on its form. */
export type LedProgramme = { form: ApplicationForm; programmeId: string };

/** Who may search, and what decides their lists. */
export type Searcher =
  | { kind: "admin" }
  | {
      kind: "staff";
      /** Each programme they lead whose People tab would open for them. */
      leads: LedProgramme[];
      /** Each live group that names them, held to the facilitator's bar. */
      facilitates: CourseGroupDoc[];
    };

/**
 * Whether the admissions pages would render for this person: the predicate
 * `requireAdmissionsPage` (`src/lib/firebase/pageGates.ts`) applies, asked
 * here before a link into that tree is offered, as Home's Requests line asks
 * it (`src/lib/courses/requests/home.ts`). `tests/search.test.mjs` holds the
 * two to the same words.
 */
function opensAdmissionsPages(user: SessionUser): boolean {
  return canAuthorAdmissionRound(user) || (user.admissionsReviewer === true && holdsStanding(user, "admissionRounds.reviewerUids"));
}

/** An approved account: the floor under every other question. */
function isApproved(user: SessionUser): boolean {
  return user.role === "member" || user.role === "committee" || user.role === "admin";
}

/**
 * Each programme this person leads whose People tab and group pages would
 * render for them: named its lead and still meeting the lead's bar
 * (`roleOnProgramme`, the tab's own question), and admitted by the
 * admissions tree's page gate. Nobody the gate turns away is read for.
 */
async function ledProgrammesOf(db: Firestore, user: SessionUser): Promise<LedProgramme[]> {
  if (!opensAdmissionsPages(user)) return [];
  const out: LedProgramme[] = [];
  for (const form of await listForms(db)) {
    for (const programmeId of form.programmeIds) {
      if (roleOnProgramme(user, form, programmeId) === "lead") out.push({ form, programmeId });
    }
  }
  return out;
}

/**
 * The live groups that name this person as a facilitator, held to the
 * facilitator's bar, on a run that is there and not being destroyed: the
 * groups whose page (`/learn/[runId]/group/[groupId]`) admits them.
 */
async function facilitatedGroupsOf(db: Firestore, user: SessionUser): Promise<CourseGroupDoc[]> {
  const snap = await db.collection("courseGroups").where("facilitatorUids", "array-contains", user.uid).get();
  const groups = snap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter(
      (group) =>
        !group.archived &&
        isPlainId(group.runId) &&
        isNamedWithStanding(user, "courseGroups.facilitatorUids", group.facilitatorUids),
    );
  if (groups.length === 0) return [];
  const runIds = [...new Set(groups.map((group) => group.runId))];
  const runs = await db.getAll(...runIds.map((runId) => db.collection("courseRuns").doc(runId)));
  const open = new Set(runs.filter((run) => run.exists && run.data()?.destroying !== true).map((run) => run.id));
  return groups.filter((group) => open.has(group.runId)).sort(compareGroupsByMeeting);
}

/**
 * WHO MAY SEARCH: an admin, a programme's lead and a group's facilitator,
 * worked out from the records each time, as the lists' own gates work it
 * out. Null for anybody else, signed out, waiting or refused included. An
 * admin is answered without a read; anybody else is read for only as far as
 * they could be one (a lead only when the admissions tree would admit them,
 * which is a field on the session).
 */
export async function searcherOf(db: Firestore, user: SessionUser | null): Promise<Searcher | null> {
  if (!user || !isApproved(user)) return null;
  if (user.role === "admin") return { kind: "admin" };
  const [leads, facilitates] = await Promise.all([ledProgrammesOf(db, user), facilitatedGroupsOf(db, user)]);
  if (leads.length === 0 && facilitates.length === 0) return null;
  return { kind: "staff", leads, facilitates };
}

// ---------------------------------------------------------------------------
// Names for a run's groups: the programme that names it, else the course
// ---------------------------------------------------------------------------

/** The programme's short name for a run a programme names, else the course's title. */
function programmeNameFor(forms: readonly ApplicationForm[], run: CourseRunDoc): string {
  const naming = namingProgrammeIn(forms, run.id);
  if (naming) {
    const form = forms.find((candidate) => candidate.round.id === naming.roundId);
    const programme = form ? own(form.programmes, naming.programmeId) : undefined;
    const name = programme ? programme.shortName.trim() || programme.name.trim() : "";
    if (name) return name;
  }
  return run.courseTitle.trim();
}

/** "Thursdays 6pm", or null for a group with no weekly time yet. */
function slotOf(group: CourseGroupDoc): string | null {
  const { weekday, startTimeLocal } = group.session;
  return Number.isInteger(weekday) && startTimeLocal ? slotLine({ weekday, startTimeLocal }) : null;
}

/** A group as a result: its name, then its programme, its run and its weekly time. */
function groupCandidate(group: CourseGroupDoc, programme: string, runLabel: string, href: string): SearchCandidate {
  const name = group.name.trim() || "Untitled group";
  return {
    name,
    line: lineOf([programme, runLabel, slotOf(group)]),
    href,
    matchOn: `${name} ${programme} ${runLabel}`,
  };
}

// ---------------------------------------------------------------------------
// An admin's world
// ---------------------------------------------------------------------------

/** The three fields of an account a name is made of. Never an address. */
const NAME_FIELDS = ["displayName", "profile.preferredName", "profile.fullName"] as const;

type AdminWorld = { world: SearchWorld; uidOf: Map<string, string>; runs: Map<string, CourseRunDoc>; groups: Map<string, CourseGroupDoc>; forms: ApplicationForm[] };

async function adminWorld(db: Firestore, viewer: SessionUser): Promise<AdminWorld> {
  const [accounts, groupSnap, forms] = await Promise.all([
    db.collection("users").select(...NAME_FIELDS).get(),
    db.collection("courseGroups").get(),
    listForms(db),
  ]);
  const uidOf = new Map<string, string>();
  const people: SearchCandidate[] = [];
  for (const doc of accounts.docs) {
    if (!isPlainId(doc.id)) continue;
    const name = nameForViewer(viewer, accountNamesOf(doc.data() ?? {}), "");
    if (!name) continue;
    const href = memberPathOf(doc.id);
    uidOf.set(href, doc.id);
    people.push({ name, line: "", href, matchOn: name });
  }

  const liveGroups = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived && isPlainId(group.runId));
  const runIds = [...new Set(liveGroups.map((group) => group.runId))];
  const runSnaps = runIds.length > 0 ? await db.getAll(...runIds.map((runId) => db.collection("courseRuns").doc(runId))) : [];
  const runs = new Map<string, CourseRunDoc>();
  for (const snap of runSnaps) {
    if (!snap.exists || snap.data()?.destroying === true) continue;
    runs.set(snap.id, normalizeCourseRun(snap.id, snap.data() ?? {}));
  }
  const groups: SearchCandidate[] = [];
  const groupById = new Map<string, CourseGroupDoc>();
  for (const group of liveGroups) {
    const run = runs.get(group.runId);
    if (!run) continue;
    groupById.set(group.id, group);
    const naming = namingProgrammeIn(forms, run.id);
    const href = naming
      ? `${programmePathOf(naming.roundId, naming.programmeId)}/groups/${enc(group.id)}`
      : facilitatorGroupPathOf(run.id, group.id);
    groups.push(groupCandidate(group, programmeNameFor(forms, run), run.label, href));
  }
  return { world: { people, groups }, uidOf, runs, groups: groupById, forms };
}

/**
 * For the people in an admin's answer, and nobody else: the programme and
 * group of each one's place on a course that is still going (taking part,
 * not left), "AGI Strategy · Group C". One `in` on one field, for six uids at
 * most.
 */
async function adminPeopleLines(db: Firestore, read: AdminWorld, answer: SearchAnswer): Promise<SearchAnswer> {
  const uids = [...new Set(answer.people.map((hit) => read.uidOf.get(hit.href)).filter((uid): uid is string => Boolean(uid)))];
  if (uids.length === 0) return answer;
  const snap = await db.collection("courseEnrolments").where("uid", "in", uids).get();
  const lineFor = new Map<string, string>();
  const seats = snap.docs
    .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
    .filter((seat) => seat.role === "learner" && seat.status === "active")
    .sort((a, b) => a.runId.localeCompare(b.runId));
  for (const seat of seats) {
    if (lineFor.has(seat.uid)) continue;
    const run = read.runs.get(seat.runId);
    if (!run) continue;
    const group = seat.groupId ? read.groups.get(seat.groupId) : undefined;
    lineFor.set(seat.uid, lineOf([programmeNameFor(read.forms, run), group && group.runId === run.id ? group.name.trim() : null]));
  }
  return {
    ...answer,
    people: answer.people.map((hit) => {
      const uid = read.uidOf.get(hit.href);
      return uid && lineFor.has(uid) ? { ...hit, line: lineFor.get(uid) ?? "" } : hit;
    }),
  };
}

// ---------------------------------------------------------------------------
// A lead's world: their People tabs and their runs' groups
// ---------------------------------------------------------------------------

async function leadWorld(db: Firestore, actor: SessionUser, leads: readonly LedProgramme[]): Promise<SearchWorld> {
  const people: SearchCandidate[] = [];
  const groups: SearchCandidate[] = [];
  for (const { form, programmeId } of leads) {
    const programme = own(form.programmes, programmeId);
    if (!programme) continue;
    const path = programmePathOf(form.round.id, programme.id);
    const programmeName = programme.shortName.trim() || programme.name.trim();
    // The People tab's own read, which lists nobody before decisions have gone out.
    const read = await readProgrammePeople(db, actor, form, programme);
    for (const row of read?.model.rows ?? []) {
      people.push({
        name: row.name,
        line: lineOf([programmeName, row.group]),
        href: `${path}/people?person=${enc(row.uid)}`,
        matchOn: row.name,
        key: `person:${row.uid}`,
      });
    }
    // The run's groups, as the Groups tab lists them: live groups of a run that is there and not being destroyed.
    if (!programme.runId || !isPlainId(programme.runId)) continue;
    const [runSnap, groupSnap] = await Promise.all([
      db.collection("courseRuns").doc(programme.runId).get(),
      db.collection("courseGroups").where("runId", "==", programme.runId).get(),
    ]);
    if (!runSnap.exists || runSnap.data()?.destroying === true) continue;
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
    for (const doc of groupSnap.docs) {
      const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
      if (group.archived || group.runId !== run.id) continue;
      groups.push({ ...groupCandidate(group, programmeName, run.label, `${path}/groups/${enc(group.id)}`), key: `group:${group.id}` });
    }
  }
  return { people, groups };
}

// ---------------------------------------------------------------------------
// A facilitator's world: their groups' pages
// ---------------------------------------------------------------------------

async function facilitatorWorld(db: Firestore, actor: SessionUser, facilitates: readonly CourseGroupDoc[], now: Date): Promise<SearchWorld> {
  const people: SearchCandidate[] = [];
  const groups: SearchCandidate[] = [];
  if (facilitates.length === 0) return { people, groups };
  const forms = await listForms(db);
  const byRun = new Map<string, CourseGroupDoc[]>();
  for (const group of facilitates) byRun.set(group.runId, [...(byRun.get(group.runId) ?? []), group]);
  for (const [runId, theirs] of byRun) {
    // The group page's own read and its own rows: who is listed, and by which name, for this viewer.
    const records = await readRunRecords(db, runId);
    if (!records) continue;
    const programmeName = programmeNameFor(forms, records.run);
    const listed = listGroups(records, { isAdmin: false, role: actor.role }, now, weeksOf(records));
    for (const group of theirs) {
      const href = facilitatorGroupPathOf(runId, group.id);
      groups.push({ ...groupCandidate(group, programmeName, records.run.label, href), key: `group:${group.id}` });
      const entry = listed.find((candidate) => candidate.group.id === group.id);
      for (const { row } of entry?.people ?? []) {
        people.push({ name: row.name, line: lineOf([programmeName, group.name.trim()]), href, matchOn: row.name, key: `person:${row.uid}` });
      }
    }
  }
  return { people, groups };
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/**
 * The answer to one query for one searcher. The reader's whole world is read
 * whatever the query, so a name that is on the run but not theirs, a name
 * nobody holds, and a name of another programme take the same reads and get
 * the same answer.
 */
export async function answerSearch(
  db: Firestore,
  actor: SessionUser,
  searcher: Searcher,
  query: string,
  now: Date,
): Promise<SearchAnswer> {
  if (searcher.kind === "admin") {
    const read = await adminWorld(db, actor);
    return adminPeopleLines(db, read, searchWorld(read.world, query));
  }
  const [led, facilitated] = await Promise.all([
    leadWorld(db, actor, searcher.leads),
    facilitatorWorld(db, actor, searcher.facilitates, now),
  ]);
  return searchWorld({ people: [...led.people, ...facilitated.people], groups: [...led.groups, ...facilitated.groups] }, query);
}
