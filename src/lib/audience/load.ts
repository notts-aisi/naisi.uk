import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { hasBeenTold, holdingOf, isInTerm } from "@/lib/applications/decisions";
import { placeHoldersOn } from "@/lib/applications/handover/holders";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ApplicationDoc, ProgrammeSettings } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { rankedProgrammes } from "@/lib/applications/sections";
import { listDecisions, listSentApplications } from "@/lib/applications/staffRepo";
import { standingUserOf } from "@/lib/courses/programmeLead";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { loadEventAtTheDoor } from "@/lib/events/checkInLoad";
import { eventEnds, openingOf } from "@/lib/events/checkIns";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  enrolmentHasLeft,
  normalizeCourseEnrolment,
  placementIsTold,
} from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { EventCheckInDoc } from "@/lib/firestore/eventCheckIns";
import { normalizeEvent, type EventDoc, type RsvpDoc } from "@/lib/firestore/events";
import { findRecipientsForChannel } from "@/lib/firestore/subscriptions";
import { filterSuppressed } from "@/lib/firestore/suppression";
import { ALL_TRACKS } from "@/lib/firestore/users";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { chooseTerm } from "@/lib/surveys/term/choose";
import {
  accountKey,
  addressesToCheck,
  guestKey,
  pickPeople,
  planFor,
  reachedBy,
  resolutionOf,
  signupKey,
  walkInKey,
  withSuppression,
  type AudienceWorld,
  type Membership,
  type PersonKey,
  type Resolution,
  type ResolveOptions,
  type WorldAccount,
  type WorldGuest,
  type WorldTag,
} from "./resolve";
import { mayUse, programmeKey, scopeOf } from "./scope";
import {
  EVENT_PARTS,
  PROGRAMME_PARTS,
  ROLE_TAGS,
  SUBSCRIBED_CHANNELS,
  TERM_PARTS,
  tagId,
  type EventPart,
  type ProgrammePart,
  type Selection,
  type Tag,
  type TermPart,
} from "./tags";
import {
  GROUP_HEADINGS,
  NO_NAME,
  UNNAMED_GROUP,
  UNNAMED_PROGRAMME,
  UNTITLED_EVENT,
  eventDay,
  eventTagLabel,
  groupTagLabel,
  programmeListLabel,
  programmeTagLabel,
  roleTagLabel,
  subscribedListLabel,
  subscribedTagLabel,
  termHeading,
  termTagLabel,
  trackTagLabel,
} from "./words";

/**
 * WHAT "WHO IS THIS FOR?" READS, for one person, once per request.
 *
 * Every tag is a sentence about records that already exist, read fresh each
 * time, never a list kept anywhere. What is read is only what the person's
 * tags need (`./scope.ts`), so a facilitator's picker reads their groups and
 * nothing of the term's applications, and only somebody who runs check-in has
 * any event's sign-ups or check-ins read for them.
 *
 *  - THE TERM is the form whose decision day went out most recently, or, before
 *    any has, the one that opened most recently: `chooseTerm`, the reading
 *    This term in numbers makes. Its events are the published events that
 *    start from the day its form opened.
 *  - APPLIED: everybody whose application on the term's form was sent and is
 *    still in the term (`isInTerm`). It says nothing about where any
 *    application stands, so it is read before decisions go out too.
 *  - HOLDING A PLACE: `placeHoldersOn`, the one test the hand-over and the
 *    programme surveys share, so it includes people Publish has not told
 *    their group yet. Nobody until the term is marked as sent.
 *  - INVITED, NOT ANSWERED: told an invitation and not answered it
 *    (`holdingOf`, a place kept for them).
 *  - FACILITATING and LEADING: the facilitators of the live groups of the
 *    term's programmes' runs, and the programmes' leads, each held to the bar
 *    the role is appointed behind (`isNamedWithStanding`), so a name left on a
 *    group after its account lost its standing is nobody.
 *  - A GROUP: its people whose placement Publish has told (`placementIsTold`),
 *    listed from Publish on, never before: a group's tag does not exist until
 *    the run's allocation has gone out. Somebody who left the group is in its
 *    tag as having left, and is never written to.
 *  - AN EVENT: who came (the Check-in tab's own records, through
 *    `loadEventAtTheDoor`), who signed up (waiting, confirmed or on the
 *    waiting list, never a test sign-up) and who had a confirmed place and
 *    did not come (an event that has ended, whose door was opened, so check-in
 *    was used). Read only for somebody who runs check-in (`runsCheckIn`), the
 *    people the privacy policy says see who came.
 *  - SUBSCRIBED: the newsletter's and the event announcements' lists, every
 *    row confirmed and subscribed.
 *  - COMMITTEE, ADMINS, the TRACKS and people BY NAME: the approved accounts,
 *    read only for somebody who may read the roster.
 *
 * Every read is one document, one equality, one `in` on one field or one
 * range on one field, so none needs a declared index.
 */

type Data = Record<string, unknown>;

/** The roles of an account that may be named one by one, and that the roster read returns. */
const APPROVED_ROLES = ["member", "committee", "admin"];

const isPlainId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("/");

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * The name a person is listed by on the picker, by the site's one rule for
 * the person using it (`nameForViewer`): the committee and admins see "Priya
 * Shah (Pri)", so two people who go by one name can be told apart when they
 * are picked by name; a facilitator sees the name people go by. Every name the
 * picker shows comes through here.
 */
function accountName(data: Data, viewer: SessionUser): string {
  return nameForViewer(viewer, accountNamesOf(data), "NAISI member");
}

function worldAccount(uid: string, data: Data, viewer: SessionUser): WorldAccount {
  const profile = (data.profile as Data | undefined) ?? {};
  return {
    uid,
    name: accountName(data, viewer),
    email: text(data.email) || null,
    universityEmail: text(profile.universityEmail) || null,
    universityVerified: Boolean(profile.uniEmailVerifiedAt),
    profile: data.profile,
  };
}

/** The approved accounts, for somebody who may read the roster: one `in` on one field. */
async function readRoster(db: Firestore): Promise<Map<string, Data>> {
  const snap = await db.collection("users").where("role", "in", APPROVED_ROLES).get();
  const out = new Map<string, Data>();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Data;
    if (APPROVED_ROLES.includes(text(data.role))) out.set(doc.id, data);
  }
  return out;
}

/** The accounts of these uids that `known` does not hold already, by their addresses, 300 at a time. */
async function readAccounts(db: Firestore, uids: Iterable<string>, known: ReadonlyMap<string, Data>): Promise<Map<string, Data>> {
  const wanted = [...new Set(uids)].filter((uid) => isPlainId(uid) && !known.has(uid));
  const out = new Map<string, Data>();
  for (let at = 0; at < wanted.length; at += 300) {
    const snaps = await db.getAll(...wanted.slice(at, at + 300).map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) if (snap.exists) out.set(snap.id, (snap.data() ?? {}) as Data);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The term's form, its programmes' runs and their groups
// ---------------------------------------------------------------------------

export type TermProgramme = { programmeId: string; key: string; settings: ProgrammeSettings; name: string };

export type TermRun = {
  programmeId: string;
  runId: string;
  /** Publish has told the run's people their groups: its groups have tags. */
  published: boolean;
  /** Its live groups, in the order they meet. */
  groups: CourseGroupDoc[];
};

/** Each of the term's programmes that names a run that is there, with the run's live groups. */
async function readRuns(db: Firestore, programmes: readonly TermProgramme[]): Promise<TermRun[]> {
  const read = await Promise.all(
    programmes.map(async ({ programmeId, settings }): Promise<TermRun | null> => {
      const runId = settings.runId;
      if (!isPlainId(runId)) return null;
      const [run, groups] = await Promise.all([
        db.collection("courseRuns").doc(runId).get(),
        db.collection("courseGroups").where("runId", "==", runId).get(),
      ]);
      if (!run.exists) return null;
      const data = run.data() ?? {};
      if (data.destroying === true) return null;
      return {
        programmeId,
        runId,
        published: data.allocationPublishedAt != null,
        groups: groups.docs
          .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
          .filter((group) => group.runId === runId && !group.archived)
          .sort(compareGroupsByMeeting),
      };
    }),
  );
  return read.filter((run): run is TermRun => run !== null);
}

/** Every application sent on the term's form. "Applied" is who of them is still in the term. */
async function readApplications(db: Firestore, form: ApplicationForm): Promise<ApplicationDoc[]> {
  return listSentApplications(db, form);
}

type Places = {
  /** Who holds a place on each programme, by programme id. */
  holders: Map<string, string[]>;
  /** Told an invitation and not answered it. */
  invited: string[];
};

/**
 * Who holds a place on each of the term's programmes, and who is invited and
 * has not answered: nobody until the term is marked as sent, when there is
 * nothing left for anybody to learn early. `applications` is every sent
 * application on the form.
 */
async function readPlaces(db: Firestore, form: ApplicationForm, applications: readonly ApplicationDoc[]): Promise<Places> {
  if (form.decisionsSentAt === null) return { holders: new Map(), invited: [] };
  const decisions = await listDecisions(db, form.round.id);
  const holders = new Map<string, string[]>();
  for (const programmeId of form.programmeIds) {
    holders.set(programmeId, placeHoldersOn(form, programmeId, applications, decisions).map((holder) => holder.uid));
  }
  const invitable = new Set(form.programmeIds);
  const invited: string[] = [];
  for (const application of applications) {
    if (!application.sent || !isInTerm(application) || !hasBeenTold(application)) continue;
    const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
    const holding = holdingOf(
      { uid: application.uid, ranked, decision: decisions.get(application.uid) ?? null, application },
      invitable,
    );
    if (holding.heldFor !== null) invited.push(application.uid);
  }
  return { holders, invited };
}

type GroupPeople = { told: string[]; left: string[] };

/**
 * The people of each of these runs' groups, by group id: told and still on
 * the run (or finished), and told and since left. A placement Publish has not
 * told its owner about is nobody's here, whoever is asking.
 */
async function readGroupPeople(db: Firestore, runIds: readonly string[]): Promise<Map<string, GroupPeople>> {
  const out = new Map<string, GroupPeople>();
  const snaps = await Promise.all(runIds.map((runId) => db.collection("courseEnrolments").where("runId", "==", runId).get()));
  snaps.forEach((snap, index) => {
    const runId = runIds[index];
    for (const doc of snap.docs) {
      const enrolment = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
      // Held to the id it lives at, as the notice audience holds it.
      if (enrolment.runId !== runId || !enrolment.uid || doc.id !== courseEnrolmentId(runId, enrolment.uid)) continue;
      if (enrolment.role !== "learner" || !enrolment.groupId || !placementIsTold(enrolment)) continue;
      const group = out.get(enrolment.groupId) ?? { told: [], left: [] };
      (enrolmentHasLeft(enrolment.status) ? group.left : group.told).push(enrolment.uid);
      out.set(enrolment.groupId, group);
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// The term's events
// ---------------------------------------------------------------------------

type ReadEvent = { event: EventDoc; startAt: Date; signups: RsvpDoc[]; checkIns: EventCheckInDoc[] };

/**
 * The term's published events, newest first, each with its sign-ups and its
 * check-ins: who came, by name. Only for somebody who runs check-in.
 */
async function readEvents(db: Firestore, viewer: SessionUser, opensAt: Date): Promise<ReadEvent[]> {
  if (!runsCheckIn(viewer)) return [];
  const snap = await db.collection("events").where("startAt", ">=", opensAt).get();
  const events = snap.docs
    .map((doc) => normalizeEvent(doc.id, doc.data() ?? {}))
    .flatMap((event) => (event.status === "published" && event.startAt ? [{ event, startAt: event.startAt }] : []))
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime() || a.event.id.localeCompare(b.event.id));
  return Promise.all(
    events.map(async ({ event, startAt }) => {
      const atTheDoor = await loadEventAtTheDoor(db, event.id);
      return {
        event,
        startAt,
        signups: (atTheDoor?.signups ?? []).filter((row) => row.eventId === event.id && !row.synthetic),
        checkIns: (atTheDoor?.checkIns ?? []).filter((checkIn) => checkIn.eventId === event.id),
      };
    }),
  );
}

/** The sign-ups that are a place asked for or held: waiting for a decision, confirmed, or on the waiting list. */
const SIGNED_UP = new Set(["pending", "confirmed", "waitlisted"]);

// ---------------------------------------------------------------------------
// The term, and what one person runs of it
// ---------------------------------------------------------------------------

/**
 * The term's programmes, their runs and live groups, and what one person
 * leads and facilitates of them. The first read the picker makes, and the
 * one Messages asks to decide who may write at all
 * (`src/lib/messages/writers.ts`), so the two cannot disagree about who runs
 * what.
 */
export type TermRoles = {
  /** The term's form, or null before any form has opened. */
  form: ApplicationForm | null;
  programmes: TermProgramme[];
  runs: TermRun[];
  /** `<roundId>:<programmeId>` of each of the term's programmes this person leads, held to the lead's bar. */
  leads: string[];
  /** Each group of a published run this person facilitates, held to the facilitator's bar. */
  facilitates: string[];
  /** Each group whose tag this person may use: the groups they facilitate, and every group of a programme they lead. */
  tagGroups: string[];
};

/** What this person runs of the term: the forms, the term's programmes' runs and their groups, and nothing about anybody else. */
export async function loadTermRoles(db: Firestore, viewer: SessionUser, now: Date): Promise<TermRoles> {
  const form = chooseTerm(await listForms(db), now);
  const programmes: TermProgramme[] = form
    ? form.programmeIds.flatMap((programmeId) => {
        const settings = own(form.programmes, programmeId);
        if (!settings) return [];
        const name = settings.shortName.trim() || settings.name.trim() || UNNAMED_PROGRAMME;
        return [{ programmeId, key: programmeKey(form.round.id, programmeId), settings, name }];
      })
    : [];
  const runs = form ? await readRuns(db, programmes) : [];
  const leads = programmes
    .filter((programme) => isNamedWithStanding(viewer, "admissionRounds.leadUid", programme.settings.leadUid))
    .map((programme) => programme.key);
  const facilitates = new Set<string>();
  const tagGroups = new Set<string>();
  for (const run of runs) {
    if (!run.published) continue;
    const led = form ? leads.includes(programmeKey(form.round.id, run.programmeId)) : false;
    for (const group of run.groups) {
      const facilitating = isNamedWithStanding(viewer, "courseGroups.facilitatorUids", group.facilitatorUids);
      if (facilitating) facilitates.add(group.id);
      if (led || facilitating) tagGroups.add(group.id);
    }
  }
  return { form, programmes, runs, leads, facilitates: [...facilitates], tagGroups: [...tagGroups] };
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

/**
 * Everything this person's tags are made of, read once. Null for somebody who
 * may use no tag at all (signed out, waiting for approval or refused).
 * `roles` is what `loadTermRoles` read for this person at this moment, when
 * the caller has it already (Messages asks it to decide who may write), so
 * the term is not read twice in one request.
 */
export async function loadAudienceWorld(
  db: Firestore,
  viewer: SessionUser,
  now: Date,
  roles?: TermRoles,
): Promise<AudienceWorld | null> {
  if (!scopeOf(viewer)) return null;

  // The term's programmes, their runs and groups, and what this person leads
  // and facilitates of them.
  const { form, programmes, runs, leads, tagGroups } = roles ?? (await loadTermRoles(db, viewer, now));
  const scope = scopeOf(viewer, { leads, groups: tagGroups });
  if (!scope) return null;
  const inScope = (programme: TermProgramme) => scope.admin || scope.programmes.has(programme.key);

  const roster = scope.committee ? await readRoster(db) : new Map<string, Data>();
  const rosterByAddress = new Map<string, string>();
  for (const [uid, data] of roster) {
    const address = text(data.email).toLowerCase();
    if (address && !rosterByAddress.has(address)) rosterByAddress.set(address, uid);
  }

  // The staff of the programmes in scope, held to their bars.
  const staffUids: string[] = [];
  for (const programme of programmes.filter(inScope)) {
    if (programme.settings.leadUid) staffUids.push(programme.settings.leadUid);
    for (const run of runs) if (run.programmeId === programme.programmeId) for (const group of run.groups) staffUids.push(...group.facilitatorUids);
  }
  const staffData = new Map([...roster, ...(await readAccounts(db, staffUids, roster))]);
  const standing = (uid: string) => {
    const data = staffData.get(uid);
    return data ? standingUserOf(uid, data) : null;
  };
  const facilitatorsOf = (programmeId: string): string[] => {
    const out = new Set<string>();
    for (const run of runs) {
      if (run.programmeId !== programmeId) continue;
      for (const group of run.groups) {
        for (const uid of group.facilitatorUids) {
          const person = standing(uid);
          if (person && isNamedWithStanding(person, "courseGroups.facilitatorUids", group.facilitatorUids)) out.add(uid);
        }
      }
    }
    return [...out];
  };
  const leadOf = (programme: TermProgramme): string | null => {
    const uid = programme.settings.leadUid;
    const person = uid ? standing(uid) : null;
    return person && isNamedWithStanding(person, "admissionRounds.leadUid", uid) ? uid : null;
  };

  const tags: WorldTag[] = [];
  const guests = new Map<PersonKey, WorldGuest>();
  const runsFor = new Map<PersonKey, Set<string>>();
  const markRun = (key: PersonKey, programme: string) => {
    const set = runsFor.get(key) ?? new Set<string>();
    set.add(programme);
    runsFor.set(key, set);
  };
  const holdsFor = new Map<PersonKey, Set<string>>();
  const markHold = (key: PersonKey, programme: string) => {
    const set = holdsFor.get(key) ?? new Set<string>();
    set.add(programme);
    holdsFor.set(key, set);
  };
  const addTag = (tag: Tag, words: { label: string; listLabel: string; hint?: string | null; heading: string }, members: Map<PersonKey, Membership>) => {
    tags.push({ id: tagId(tag), tag, label: words.label, listLabel: words.listLabel, hint: words.hint ?? null, heading: words.heading, members });
  };
  const allIn = (uids: Iterable<string>) => new Map([...uids].map((uid) => [accountKey(uid), "in" as Membership]));

  // The term's own tags and each programme's.
  if (form) {
    const programmesInScope = programmes.filter(inScope);
    const applications = programmesInScope.length > 0 ? await readApplications(db, form) : [];
    const places = programmesInScope.length > 0 ? await readPlaces(db, form, applications) : { holders: new Map<string, string[]>(), invited: [] };
    const staffOf = new Map(programmesInScope.map((programme) => [programme.programmeId, { facilitators: facilitatorsOf(programme.programmeId), lead: leadOf(programme) }]));

    for (const programme of programmesInScope) {
      const staff = staffOf.get(programme.programmeId);
      if (!staff) continue;
      for (const uid of places.holders.get(programme.programmeId) ?? []) {
        markRun(accountKey(uid), programme.key);
        markHold(accountKey(uid), programme.key);
      }
      for (const uid of staff.facilitators) markRun(accountKey(uid), programme.key);
      if (staff.lead) markRun(accountKey(staff.lead), programme.key);
    }

    if (scope.admin) {
      const heading = termHeading(form.round.label);
      const union = (pick: (programme: TermProgramme) => Iterable<string>) => {
        const out = new Set<string>();
        for (const programme of programmesInScope) for (const uid of pick(programme)) out.add(uid);
        return out;
      };
      const byPart: Record<TermPart, Iterable<string>> = {
        applied: applications.filter(isInTerm).map((application) => application.uid),
        holding: union((programme) => places.holders.get(programme.programmeId) ?? []),
        facilitating: union((programme) => staffOf.get(programme.programmeId)?.facilitators ?? []),
        leading: union((programme) => {
          const lead = staffOf.get(programme.programmeId)?.lead;
          return lead ? [lead] : [];
        }),
        invited: places.invited,
      };
      for (const part of TERM_PARTS) {
        addTag({ kind: "term", roundId: form.round.id, part }, { label: termTagLabel(part), listLabel: termTagLabel(part), heading }, allIn(byPart[part]));
      }
    }

    const groupRuns = runs.filter((run) => run.published && run.groups.some((group) => scope.admin || scope.groups.has(group.id)));
    const groupPeople = await readGroupPeople(db, groupRuns.map((run) => run.runId));
    for (const run of groupRuns) {
      const programme = programmes.find((each) => each.programmeId === run.programmeId);
      if (!programme) continue;
      for (const group of run.groups) {
        // The people a facilitator runs: the people Publish has told are in their group.
        if (!isNamedWithStanding(viewer, "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
        for (const uid of groupPeople.get(group.id)?.told ?? []) markRun(accountKey(uid), programme.key);
      }
    }

    for (const programme of programmes) {
      const programmeTags = inScope(programme);
      const run = groupRuns.find((each) => each.programmeId === programme.programmeId);
      const groups = (run?.groups ?? []).filter((group) => scope.admin || scope.groups.has(group.id));
      if (!programmeTags && groups.length === 0) continue;
      const heading = programme.name;
      if (programmeTags) {
        const staff = staffOf.get(programme.programmeId);
        const holders = places.holders.get(programme.programmeId) ?? [];
        const facilitators = staff?.facilitators ?? [];
        const byPart: Record<ProgrammePart, Iterable<string>> = {
          everyone: new Set([...holders, ...facilitators, ...(staff?.lead ? [staff.lead] : [])]),
          holding: holders,
          facilitating: facilitators,
        };
        for (const part of PROGRAMME_PARTS) {
          addTag(
            { kind: "programme", roundId: form.round.id, programmeId: programme.programmeId, part },
            { label: programmeTagLabel(programme.name, part), listLabel: programmeListLabel(part), heading },
            allIn(byPart[part]),
          );
        }
      }
      for (const group of groups) {
        const people = groupPeople.get(group.id) ?? { told: [], left: [] };
        const members = new Map<PersonKey, Membership>();
        for (const uid of people.left) members.set(accountKey(uid), "left");
        for (const uid of people.told) members.set(accountKey(uid), "in");
        const name = group.name.trim() || UNNAMED_GROUP;
        addTag({ kind: "group", groupId: group.id }, { label: groupTagLabel(programme.name, name), listLabel: name, heading }, members);
      }
    }
  }

  // One person, whichever way they are known: an address that is an
  // account's own is that account.
  const personAt = (address: string, name: string): PersonKey => {
    const lower = address.trim().toLowerCase();
    const uid = rosterByAddress.get(lower);
    if (uid) return accountKey(uid);
    const key = guestKey(lower);
    const was = guests.get(key);
    if (!was || (was.name === NO_NAME && name)) guests.set(key, { key, name: name || NO_NAME, address: address.trim() });
    return key;
  };
  const personOfSignup = (row: RsvpDoc): PersonKey => {
    if (isPlainId(row.uid)) return accountKey(row.uid);
    if (text(row.email)) return personAt(row.email, text(row.name));
    const key = signupKey(row.id);
    guests.set(key, { key, name: text(row.name) || NO_NAME, address: null });
    return key;
  };

  // The term's events, for somebody who runs check-in.
  if (form && form.round.opensAt && scope.committee) {
    const events = await readEvents(db, viewer, form.round.opensAt);
    const titles = new Map<string, number>();
    for (const { event } of events) {
      const title = event.title.trim() || UNTITLED_EVENT;
      titles.set(title, (titles.get(title) ?? 0) + 1);
    }
    for (const { event, startAt, signups, checkIns } of events) {
      const title = event.title.trim() || UNTITLED_EVENT;
      const day = eventDay(startAt);
      const label = (part: EventPart) => eventTagLabel(part, title, (titles.get(title) ?? 0) > 1 ? day : null);
      const byId = new Map(signups.map((row) => [row.id, row]));
      const live = checkIns.filter((checkIn) => !checkIn.namesOff);

      const came = new Map<PersonKey, Membership>();
      for (const checkIn of live) {
        if (checkIn.kind === "signup") {
          const row = checkIn.rsvpId ? byId.get(checkIn.rsvpId) : undefined;
          if (row) came.set(personOfSignup(row), "in");
          else if (isPlainId(checkIn.uid)) came.set(accountKey(checkIn.uid), "in");
          continue;
        }
        if (isPlainId(checkIn.uid)) {
          came.set(accountKey(checkIn.uid), "in");
          continue;
        }
        const key = walkInKey(checkIn.id);
        guests.set(key, { key, name: text(checkIn.name) || NO_NAME, address: null });
        if (!came.has(key)) came.set(key, "walk-in");
      }
      const signedUp = new Map<PersonKey, Membership>();
      for (const row of signups) if (SIGNED_UP.has(row.status)) signedUp.set(personOfSignup(row), "in");
      const noShow = new Map<PersonKey, Membership>();
      for (const row of signups) {
        if (row.status !== "confirmed") continue;
        const checkedIn = live.some((checkIn) => checkIn.rsvpId === row.id || (isPlainId(row.uid) && checkIn.uid === row.uid));
        if (!checkedIn) noShow.set(personOfSignup(row), "in");
      }

      const ended = (eventEnds(event) ?? startAt).getTime() <= now.getTime();
      const byPart: Record<EventPart, Map<PersonKey, Membership> | null> = {
        came: startAt.getTime() <= now.getTime() ? came : null,
        "signed-up": event.noSignup ? null : signedUp,
        "no-show": !event.noSignup && ended && openingOf(event) !== null ? noShow : null,
      };
      for (const part of EVENT_PARTS) {
        const members = byPart[part];
        const tag: Tag = { kind: "event", eventId: event.id, part };
        if (!members || !mayUse(scope, tag)) continue;
        addTag(tag, { label: label(part), listLabel: label(part), hint: day, heading: GROUP_HEADINGS.events }, members);
      }
    }
  }

  // The two lists people subscribe to, for admins.
  if (scope.admin) {
    for (const channel of SUBSCRIBED_CHANNELS) {
      const members = new Map<PersonKey, Membership>();
      for (const row of await findRecipientsForChannel(db, channel)) {
        if (row.audience === "user" && isPlainId(row.audienceId)) members.set(accountKey(row.audienceId), "in");
        else if (row.audience === "guest" && text(row.email)) members.set(personAt(row.email, ""), "in");
      }
      addTag(
        { kind: "subscribed", channel },
        { label: subscribedTagLabel(channel), listLabel: subscribedListLabel(channel), heading: GROUP_HEADINGS.subscribed },
        members,
      );
    }
  }

  // Roles, for the committee, and the admin-set tracks, for admins.
  if (scope.committee) {
    for (const role of ROLE_TAGS) {
      // The committee is everybody on it, its admins included; the admins are the admins.
      const holds = (stored: unknown) => (role === "admin" ? stored === "admin" : stored === "committee" || stored === "admin");
      const uids = [...roster].flatMap(([uid, data]) => (holds(data.role) ? [uid] : []));
      addTag({ kind: "role", role }, { label: roleTagLabel(role), listLabel: roleTagLabel(role), heading: GROUP_HEADINGS.roles }, allIn(uids));
    }
  }
  if (scope.admin) {
    for (const track of ALL_TRACKS) {
      const uids = [...roster].flatMap(([uid, data]) => (Array.isArray(data.tracks) && data.tracks.includes(track) ? [uid] : []));
      addTag({ kind: "track", track }, { label: trackTagLabel(track), listLabel: trackTagLabel(track), heading: GROUP_HEADINGS.roles }, allIn(uids));
    }
  }

  // Every account the tags name, from the roster or by their addresses.
  const named = new Set<string>();
  for (const tag of tags) for (const key of tag.members.keys()) if (key.startsWith("a:")) named.add(key.slice(2));
  const fetched = await readAccounts(db, named, staffData);
  const accounts = new Map<string, WorldAccount>();
  for (const uid of named) {
    const data = staffData.get(uid) ?? fetched.get(uid);
    if (data) accounts.set(uid, worldAccount(uid, data, viewer));
  }
  const nameable = new Map<string, string>();
  if (scope.committee) {
    for (const [uid, data] of roster) {
      nameable.set(uid, accountName(data, viewer));
      if (!accounts.has(uid)) accounts.set(uid, worldAccount(uid, data, viewer));
    }
  }

  return {
    viewerUid: viewer.uid,
    scope,
    term: form ? { roundId: form.round.id, label: form.round.label.trim() } : null,
    tags,
    nameable,
    accounts,
    guests,
    runs: runsFor,
    holds: holdsFor,
    gmailOnly: process.env.EMAIL_GMAIL_ONLY_MODE === "true",
  };
}

// ---------------------------------------------------------------------------
// A selection, resolved
// ---------------------------------------------------------------------------

/** The guests on a list, by address: their own subscription is their yes to that row. */
async function guestsOnTheList(db: Firestore, row: "newsletter" | "events"): Promise<Set<string>> {
  const rows = await findRecipientsForChannel(db, row);
  return new Set(rows.filter((each) => each.audience === "guest").map((each) => text(each.email).toLowerCase()).filter(Boolean));
}

export type AudienceAnswer =
  | { ok: true; resolution: Resolution }
  /** A tag the person may not use, or one that has gone: nothing is resolved. */
  | { ok: false; unknown: string[] };

/**
 * WHO A SELECTION REACHES, for the person whose world it is: the count the
 * picker shows, the names See who lists, and, for a send, each person's class
 * and addresses. One function for all three, so the number on a button is the
 * number sent. Reads the guests' own subscriptions when a message by settings
 * would ask them, and the suppression list for every address it would try.
 */
export async function resolveAudience(
  db: Firestore,
  world: AudienceWorld,
  selection: Selection,
  options: ResolveOptions = {},
): Promise<AudienceAnswer> {
  const picked = pickPeople(world, selection);
  if (!picked.ok) return { ok: false, unknown: picked.unknown };
  const plan = planFor(world, picked, options);
  const onTheList = plan.guestRow ? await guestsOnTheList(db, plan.guestRow) : new Set<string>();
  const reached = reachedBy(world, plan, (address) => onTheList.has(address.trim().toLowerCase()));
  const toCheck = addressesToCheck(reached);
  const { suppressed } = toCheck.length > 0 ? await filterSuppressed(db, toCheck) : { suppressed: [] as string[] };
  const blocked = new Set(suppressed.map((address) => address.trim().toLowerCase()));
  return { ok: true, resolution: resolutionOf(plan, withSuppression(reached, blocked)) };
}
