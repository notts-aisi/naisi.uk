import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { roleOnProgramme } from "@/lib/applications/access";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ProgrammeSettings } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { readProgrammePeople, type FormPeopleRead } from "@/lib/applications/people/load";
import { programmesOpenedOn, programmeStageWords } from "@/lib/applications/programmes/list";
import { listDecisions, listSentApplications } from "@/lib/applications/staffRepo";
import { listGroups, readRunRecords, slotLine, weeksOf } from "@/lib/courses/programmeAttendance";
import { namingProgrammeIn } from "@/lib/courses/programmeLead";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { normalizeCourse, normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { canAuthorAdmissionRound } from "@/lib/firestore/users";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { isAddressableId } from "@/lib/addressableId";
import { facilitatorGuidePath } from "@/lib/courses/facilitatorGuide/model";
import { guideCandidate, lineOf, searchWorld, withoutGuides, type SearchAnswer, type SearchCandidate, type SearchWorld } from "./model";

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
 *  - AND PROGRAMMES, for an admin and a programme's lead: each programme
 *    whose Overview the reader opens, by the Programmes list's own rule
 *    (`programmesOpenedOn`: an admin every programme on every form, a lead
 *    the ones they lead; a reviewer, a run's track lead and a facilitator
 *    none), as "AGI Strategy", "Fellowship · Autumn 2026 · Lead: Maya Rao",
 *    to its Overview. Built from the forms already read. Its chip
 *    ("Running", "Taking applications": `programmeStageWords`) needs a
 *    programme's run only past decision day, so the one read added is one
 *    `getAll` of the runs of the programmes that MATCHED (at most four),
 *    none when nothing matched or none needs it (`chipProgrammes`).
 *
 *  - AND, FOR ANYBODY WHO FACILITATES (an admin, a lead or a group's
 *    facilitator alike): the facilitator guide of each course they
 *    facilitate a live group on, as its own short list (`guides`), to the
 *    guide's page. Offered only where the guide's own gate
 *    (`facilitatorGuideReader`, its facilitators' door) would admit them:
 *    a group that names them, not archived, held to the facilitator's bar,
 *    on a run that is there and not being destroyed, the group's own course
 *    being the run's (`guideFor`, from what this file has already read); and
 *    the course itself there and not being destroyed, which is the one read
 *    added, and only when a guide matched (`confirmGuides`: one `getAll` of
 *    the matched guides' courses, which also gives the guide page's own
 *    title). `tests/search.test.mjs` runs the gate and search over the same
 *    world in every state where the two could part. A lead or an admin who
 *    facilitates nothing is offered no guide here: their own pages lead to
 *    it.
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
 *    six people at most in the answer, their seats on courses (one `in`),
 *    and for the four programmes at most in it, their runs (one `getAll`).
 *  - a lead's programmes: from the forms read to find them (F); then the
 *    runs of the ones in the answer (one `getAll`, at most four).
 *  - lead: every form (F); per form whose decisions have gone out, its sent
 *    applications (A) and decisions (D), once however many of its
 *    programmes they lead; per programme, its run (1), the run's groups (g)
 *    and seats (e), each read once (`readProgrammePeople`, handed the
 *    form's read). A lead of one programme: F + A + D + 1 + g + e; of two
 *    on one form: F + A + D + 2 + g1 + g2 + e1 + e2.
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
    // The Programmes list's own rule (an admin is never asked here, so this is the lead's role alone).
    for (const { programme } of programmesOpenedOn(user, form)) {
      if (roleOnProgramme(user, form, programme.id) === "lead") out.push({ form, programmeId: programme.id });
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
function slotOf(session: { weekday: number; startTimeLocal: string } | null): string | null {
  if (!session) return null;
  const { weekday, startTimeLocal } = session;
  return Number.isInteger(weekday) && startTimeLocal ? slotLine({ weekday, startTimeLocal }) : null;
}

/** A group as a result: its name, then its programme, its run and its weekly time. */
function groupCandidate(
  group: { name: string; session: { weekday: number; startTimeLocal: string } | null },
  programme: string,
  runLabel: string,
  href: string,
): SearchCandidate {
  const name = group.name.trim() || "Untitled group";
  return {
    name,
    line: lineOf([programme, runLabel, slotOf(group.session)]),
    href,
    matchOn: `${name} ${programme} ${runLabel}`,
  };
}

/**
 * The facilitator guide a group's facilitator is offered for that group, or
 * null: the guide's facilitators' door, asked of what is already read. The
 * group is one that names them, live and held to the facilitator's bar, on
 * `run`, which is there and not being destroyed (every caller's own reads
 * hold that); the gate also wants the group's course to be the run's.
 */
function guideFor(group: CourseGroupDoc, run: CourseRunDoc): SearchCandidate | null {
  const courseId = run.courseId;
  if (!courseId || group.courseId !== courseId || group.runId !== run.id || !isAddressableId(courseId)) return null;
  return guideCandidate(courseId, run.courseTitle, facilitatorGuidePath(courseId));
}

/**
 * The gate's last question, asked only of the guides that matched: is each
 * one's course there and not being destroyed? One `getAll` of those courses,
 * none when nothing matched. A guide whose course is not is dropped, and each
 * one kept carries the course's own title, as the guide's page names it.
 */
async function confirmGuides(db: Firestore, answer: SearchAnswer, world: SearchWorld): Promise<SearchAnswer> {
  if (!answer.guides || answer.guides.length === 0) return answer;
  const courseOf = new Map((world.guides ?? []).map((candidate) => [candidate.href, candidate.key?.slice("guide:".length) ?? ""]));
  const courseIds = [...new Set(answer.guides.map((hit) => courseOf.get(hit.href) ?? ""))].filter((id) => isAddressableId(id));
  const snaps = courseIds.length > 0 ? await db.getAll(...courseIds.map((id) => db.collection("courses").doc(id))) : [];
  const titles = new Map<string, string>();
  for (const snap of snaps) {
    const raw = snap.exists ? (snap.data() ?? {}) : null;
    if (!raw || raw.destroying === true) continue;
    titles.set(snap.id, normalizeCourse(snap.id, raw).title.trim());
  }
  const guides = answer.guides.flatMap((hit) => {
    const courseId = courseOf.get(hit.href) ?? "";
    return titles.has(courseId) ? [{ ...hit, line: titles.get(courseId) || hit.line }] : [];
  });
  return guides.length > 0 ? { ...answer, guides } : withoutGuides(answer);
}

// ---------------------------------------------------------------------------
// Programmes: the ones whose Overview the reader opens
// ---------------------------------------------------------------------------

/** What a programme's result was made from, by the address it opens, for its chip. */
type ProgrammeBehind = Map<string, { form: ApplicationForm; programme: ProgrammeSettings }>;

/**
 * These programmes as results: the short name; "Fellowship · Autumn 2026 ·
 * Lead: Maya Rao" (the Programmes page's own words for the lead, "Lead: you"
 * for the reader's own and "Lead: No lead yet"); its Overview. Matched on its
 * names and its term's name.
 */
function programmeCandidates(
  viewer: SessionUser,
  entries: readonly { form: ApplicationForm; programme: ProgrammeSettings }[],
  leadNameOf: (uid: string) => string,
): { candidates: SearchCandidate[]; behind: ProgrammeBehind } {
  const candidates: SearchCandidate[] = [];
  const behind: ProgrammeBehind = new Map();
  for (const { form, programme } of entries) {
    const name = programme.shortName.trim() || programme.name.trim();
    if (!name) continue;
    const lead = programme.leadUid
      ? programme.leadUid === viewer.uid
        ? "Lead: you"
        : `Lead: ${leadNameOf(programme.leadUid)}`
      : "Lead: No lead yet";
    const href = `${programmePathOf(form.round.id, programme.id)}/overview`;
    behind.set(href, { form, programme });
    candidates.push({
      name,
      line: lineOf([programme.kind === "incubator" ? "Incubator" : "Fellowship", form.round.label, lead]),
      href,
      matchOn: `${name} ${programme.name} ${form.round.label}`,
      key: `programme:${form.round.id}/${programme.id}`,
    });
  }
  return { candidates, behind };
}

/**
 * Each programme in the answer with its chip (`programmeStageWords`). Past
 * decision day it needs the programme's run: one `getAll` of the runs of the
 * programmes in the answer that need one, none otherwise.
 */
async function chipProgrammes(db: Firestore, answer: SearchAnswer, behind: ProgrammeBehind, now: Date): Promise<SearchAnswer> {
  if (!answer.programmes || answer.programmes.length === 0) return answer;
  const wanted = new Set<string>();
  for (const hit of answer.programmes) {
    const entry = behind.get(hit.href);
    const runId = entry?.programme.runId ?? null;
    if (entry && runId && isAddressableId(runId) && entry.form.decisionsSentAt !== null && !entry.programme.closed) wanted.add(runId);
  }
  const runs = new Map<string, CourseRunDoc | "gone">();
  if (wanted.size > 0) {
    const snaps = await db.getAll(...[...wanted].map((id) => db.collection("courseRuns").doc(id)));
    for (const snap of snaps) {
      runs.set(snap.id, !snap.exists || snap.data()?.destroying === true ? "gone" : normalizeCourseRun(snap.id, snap.data() ?? {}));
    }
  }
  const programmes = answer.programmes.map((hit) => {
    const entry = behind.get(hit.href);
    if (!entry) return hit;
    const runId = entry.programme.runId;
    const chip = programmeStageWords(entry.form, entry.programme, runId ? runs.get(runId) : undefined, now);
    return chip ? { ...hit, chip } : hit;
  });
  return { ...answer, programmes };
}

// ---------------------------------------------------------------------------
// An admin's world
// ---------------------------------------------------------------------------

/** The three fields of an account a name is made of. Never an address. */
const NAME_FIELDS = ["displayName", "profile.preferredName", "profile.fullName"] as const;

type AdminWorld = {
  world: SearchWorld;
  uidOf: Map<string, string>;
  runs: Map<string, CourseRunDoc>;
  groups: Map<string, CourseGroupDoc>;
  forms: ApplicationForm[];
  programmes: ProgrammeBehind;
};

async function adminWorld(db: Firestore, viewer: SessionUser): Promise<AdminWorld> {
  const [accounts, groupSnap, forms] = await Promise.all([
    db.collection("users").select(...NAME_FIELDS).get(),
    db.collection("courseGroups").get(),
    listForms(db),
  ]);
  const uidOf = new Map<string, string>();
  const nameOf = new Map<string, string>();
  const people: SearchCandidate[] = [];
  for (const doc of accounts.docs) {
    if (!isPlainId(doc.id)) continue;
    const name = nameForViewer(viewer, accountNamesOf(doc.data() ?? {}), "");
    if (!name) continue;
    const href = memberPathOf(doc.id);
    uidOf.set(href, doc.id);
    nameOf.set(doc.id, name);
    people.push({ name, line: "", href, matchOn: name });
  }
  // Every programme on every form, by the Programmes list's own rule: an admin opens each one's Overview.
  const opened = programmeCandidates(
    viewer,
    forms.flatMap((form) => programmesOpenedOn(viewer, form).map(({ programme }) => ({ form, programme }))),
    (uid) => nameOf.get(uid) ?? "NAISI member",
  );

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
  const guides: SearchCandidate[] = [];
  const groupById = new Map<string, CourseGroupDoc>();
  for (const group of liveGroups) {
    const run = runs.get(group.runId);
    if (!run) continue;
    groupById.set(group.id, group);
    // The guide of a course this admin facilitates on, from the groups and runs already read.
    if (isNamedWithStanding(viewer, "courseGroups.facilitatorUids", group.facilitatorUids)) {
      const guide = guideFor(group, run);
      if (guide) guides.push(guide);
    }
    const naming = namingProgrammeIn(forms, run.id);
    const href = naming
      ? `${programmePathOf(naming.roundId, naming.programmeId)}/groups/${enc(group.id)}`
      : facilitatorGroupPathOf(run.id, group.id);
    groups.push(groupCandidate(group, programmeNameFor(forms, run), run.label, href));
  }
  const world: SearchWorld = guides.length > 0 ? { people, groups, guides } : { people, groups };
  if (opened.candidates.length > 0) world.programmes = opened.candidates;
  return { world, uidOf, runs, groups: groupById, forms, programmes: opened.behind };
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

/**
 * A form's sent applications and decisions, for the People tab's reader to
 * be handed once per form: nobody's until the form's decisions have gone out,
 * as the tab itself reads nobody before then.
 */
async function readFormPeople(db: Firestore, form: ApplicationForm): Promise<FormPeopleRead | null> {
  if (form.decisionsSentAt === null) return null;
  const [applications, decisions] = await Promise.all([listSentApplications(db, form), listDecisions(db, form.round.id)]);
  return { applications, decisions };
}

async function leadWorld(db: Firestore, actor: SessionUser, leads: readonly LedProgramme[]): Promise<SearchWorld> {
  const people: SearchCandidate[] = [];
  const groups: SearchCandidate[] = [];
  // A form's applications and decisions are read once, however many of its programmes the lead leads,
  // and only once its decisions have gone out: before then the People tab lists nobody and reads nothing.
  const formReads = new Map<string, Promise<FormPeopleRead | null>>();
  const formReadOf = (form: ApplicationForm): Promise<FormPeopleRead | null> => {
    const known = formReads.get(form.round.id);
    if (known) return known;
    const reading = readFormPeople(db, form);
    formReads.set(form.round.id, reading);
    return reading;
  };
  for (const { form, programmeId } of leads) {
    const programme = own(form.programmes, programmeId);
    if (!programme) continue;
    const path = programmePathOf(form.round.id, programme.id);
    const programmeName = programme.shortName.trim() || programme.name.trim();
    const groupOf = (group: { id: string; name: string; session: { weekday: number; startTimeLocal: string } | null }, runLabel: string) => ({
      ...groupCandidate(group, programmeName, runLabel, `${path}/groups/${enc(group.id)}`),
      key: `group:${group.id}`,
    });
    const formRead = await formReadOf(form);
    if (formRead) {
      // The People tab's own read, which reads the run and its live groups as well: nothing is read again.
      const read = await readProgrammePeople(db, actor, form, programme, formRead);
      for (const row of read?.model.rows ?? []) {
        people.push({
          name: row.name,
          line: lineOf([programmeName, row.group]),
          href: `${path}/people?person=${enc(row.uid)}`,
          matchOn: row.name,
          key: `person:${row.uid}`,
        });
      }
      if (read?.run) for (const group of read.groups) groups.push(groupOf(group, read.run.label));
      continue;
    }
    // Before decisions go out the tab lists nobody, and the Groups tab still lists the run's live groups.
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
      groups.push(groupOf(group, run.label));
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
  const guides: SearchCandidate[] = [];
  if (facilitates.length === 0) return { people, groups, guides };
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
      const guide = guideFor(group, records.run);
      if (guide) guides.push(guide);
      const href = facilitatorGroupPathOf(runId, group.id);
      groups.push({ ...groupCandidate(group, programmeName, records.run.label, href), key: `group:${group.id}` });
      const entry = listed.find((candidate) => candidate.group.id === group.id);
      for (const { row } of entry?.people ?? []) {
        people.push({ name: row.name, line: lineOf([programmeName, group.name.trim()]), href, matchOn: row.name, key: `person:${row.uid}` });
      }
    }
  }
  return { people, groups, guides };
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
    const answer = await adminPeopleLines(db, read, searchWorld(read.world, query));
    return chipProgrammes(db, await confirmGuides(db, answer, read.world), read.programmes, now);
  }
  const [led, facilitated] = await Promise.all([
    leadWorld(db, actor, searcher.leads),
    facilitatorWorld(db, actor, searcher.facilitates, now),
  ]);
  // The programmes they lead, from the forms already read to find them: their own name is "you".
  const opened = programmeCandidates(
    actor,
    searcher.leads.flatMap(({ form, programmeId }) => {
      const programme = own(form.programmes, programmeId);
      return programme ? [{ form, programme }] : [];
    }),
    () => "NAISI member",
  );
  const world: SearchWorld = {
    people: [...led.people, ...facilitated.people],
    groups: [...led.groups, ...facilitated.groups],
    guides: facilitated.guides,
  };
  if (opened.candidates.length > 0) world.programmes = opened.candidates;
  return chipProgrammes(db, await confirmGuides(db, searchWorld(world, query), world), opened.behind, now);
}

/**
 * Whether this searcher can be given a programme result: an admin, or
 * somebody who leads a programme whose Overview opens for them. The box's
 * label promises programmes only then (`GET /api/search`'s `programmes`), so
 * a facilitator who leads nothing is never promised them.
 */
export function findsProgrammes(searcher: Searcher): boolean {
  return searcher.kind === "admin" || searcher.leads.length > 0;
}
