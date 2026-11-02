/**
 * An evening at the door, and what follows it, driven by the event's
 * organiser: a member who drafts events, who is not an admin and whom the
 * Students' Union does not recognise. Two events, both theirs.
 *
 *  - THE DOOR EVENT started half an hour ago and ends in an hour and a half.
 *    It is listed, its survey after was switched off in the editor, and two
 *    people have a place: Pia, with an account, and Gwen, a guest who signed
 *    up with an address and nothing else.
 *  - THE CHOSEN EVENT is five days away, for chosen people: Rex by name, and
 *    whoever came to the door event. Publishing invited Rex alone (nobody had
 *    come yet), and Rex has asked for a place. Its survey after is switched
 *    on and was never set up, the state a publish leaves when setting it up
 *    failed, which Save on its Survey after tab mends.
 *
 * The spec (`tests/e2e/events-at-the-door.spec.mjs`) has the admin approve
 * the three accounts and let Olive draft events on her page; Olive finds both
 * events on Manage events, approves Rex's request on Sign-ups (reading who is
 * asking and no address), opens the door on the Check-in tab and sees counts
 * and no names; the admin checks Pia and Gwen in on the door list at a
 * phone's size; Olive sends the door event's survey with Send it now (the
 * press sets it up, the switch having been off), saves the chosen event's
 * survey and sends a test to her own address, then invites the one person
 * new since (Pia came, so Pia is in its tags now), who finds it on Home; and
 * the admin reads Pia's Events card.
 *
 * ## What this fixture seeds, and what the PRODUCT creates
 *
 * Seeded: three waiting accounts, the two events (with `startAt` written
 * directly, which no editor lets a person do for a time already past), their
 * sign-ups as the RSVP route and an approval leave them, the chosen event's
 * choice of who it is for (`eventAudiences`, chosen by the admin, as the
 * editor records it) and Rex's invitation as publishing writes it.
 *
 * Every grant is the admin's, on a real page: approval, and the Events
 * permission on Olive's page. The fixture names Olive as the events' author,
 * which grants nothing on its own: without the permission the events area
 * sends her back to Home, and every route asks for her standing as well.
 *
 * The product writes the rest, and teardown counts and removes all of it:
 * the door's opening (on the event), the check-ins (`eventCheckIns`), Rex's
 * decision, both surveys and the question for people who did not come
 * (`surveys`, `surveyPeople`, `surveyAnswers`), the survey's QR code
 * (`trackedLinks`, made by the press that opened it), the send counters
 * (`courseNudges`), Pia's invitation and every email's row (`emailSends`).
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * Rex's approval, the survey's two emails and Olive's test are each read out
 * of Mailpit, so the spec declares `requiresCaughtMail` and the runner skips
 * it anywhere else. Every address it sends to is the harness's own: the three
 * accounts and Gwen's sign-up address.
 */
import {
  assertFixtureTarget,
  countAccounts,
  createFixtureUser,
  deleteQuery,
  emailDocId,
  fixtureDoc,
  fixtureId,
  fixtureQuery,
} from "./core.mjs";
import {
  adminAuth,
  deleteHarnessUser,
  deleteHarnessUserDoc,
  harnessEmail,
  isHarnessAccount,
} from "../e2e/lib/admin.mjs";
import { loadSecrets } from "../e2e/lib/env.mjs";

const log = (msg) => console.log(`[events-at-the-door-seed] ${msg}`);

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Every step the spec must complete, in order. */
export const DOOR_STEPS = [
  "the admin approves the three people and lets the organiser draft events on their page",
  "the organiser finds both events on Manage events",
  "the organiser reads who is asking for a place on Sign-ups, with no address, and approves the request",
  "the organiser opens the door on the Check-in tab, and is shown numbers and no names",
  "the admin checks the two people with a place in on the door list, on a phone",
  "the organiser's Check-in tab counts the two who came",
  "the organiser sends the survey now at the event whose survey was switched off, and each person who came gets their own link",
  "the organiser saves the chosen event's survey, which sets it up, and sends a test to their own address",
  "the organiser invites the one person new since, who came to the door event, and they find it on Home",
  "the admin reads the Events card on the page about somebody who came",
];

/** Nothing on this journey is reCAPTCHA-gated: sign-in is a password, and no route it presses takes a token. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The accounts' names, as the pages show them. */
export const OLIVE_NAMES = { preferred: "Olive", display: "Olive Fixture" };
export const PIA_NAMES = { preferred: "Pia", display: "Pia Fixture" };
export const REX_NAMES = { preferred: "Rex", display: "Rex Fixture" };
/** The guest's name, as their sign-up gave it. */
export const GUEST_NAME = "Gwen Guest";

/**
 * The stored survey setting, as `newSurveyAfter()` in src/lib/events/surveyAfter.ts
 * makes it (restated: this is plain Node), with the switch as given.
 */
function surveyAfterSetting(on) {
  return { on, items: null, who: "came", missed: true, when: "standard", hours: 12, reminder: true, showCode: true };
}

/** The tag of the people who came to an event (src/lib/audience/tags.ts, restated). */
export function cameTag(eventId) {
  return `event:${eventId}:came`;
}

/** The tag of one person by name. */
export function personTag(uid) {
  return `person:${uid}`;
}

/** The address an event's survey QR code points at (`surveyCodePath` in src/lib/surveys/events/code.ts). */
function surveyCodePath(eventId) {
  return `/events/${eventId}/survey`;
}

/**
 * An event document, every field the normaliser reads written out, as the
 * events RSVP fixture writes its own.
 */
function eventDoc({ runIdValue, title, startAt, endAt, visibility, authorUid, surveyOn, counts, now }) {
  return {
    e2eDoorRunId: runIdValue,
    title,
    blocks: [
      {
        id: "b1",
        type: "richText",
        html:
          "<p>This event exists only while an automated run is in flight. " +
          "If you are reading this on a live surface, a run crashed before its teardown.</p>",
      },
    ],
    startAt,
    endAt,
    location: "Highfield House, University Park",
    locationHidden: false,
    locationPublicText: null,
    visibility,
    capacity: 20,
    waitlistEnabled: false,
    noSignup: false,
    selfCheckIn: false,
    signupForm: [],
    foodProvenance: "none",
    foodProvenanceNote: null,
    foodText: null,
    dietaryTags: [],
    posterUrl: null,
    coverBranding: "none",
    coverLogoColor: "white",
    coverStripSize: 40,
    coverLogoPosition: "bottom",
    coverLogoScale: 100,
    coverLogoX: 90,
    coverLogoY: 86,
    coverLogoBackdrop: true,
    coverLogoShadow: true,
    archived: false,
    status: "published",
    authorUid,
    authorDisplayName: OLIVE_NAMES.display,
    collaboratorUids: [],
    reviewerNotes: null,
    approvedBy: null,
    approvedAt: now,
    publishedAt: now,
    programme: null,
    surveyAfter: surveyAfterSetting(surveyOn),
    doorOpenedAt: null,
    doorOpenedBy: null,
    rsvpCountPending: counts.pending,
    rsvpCountConfirmed: counts.confirmed,
    rsvpCountWaitlisted: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** A sign-up as the RSVP route writes it, then decided as the approve route leaves it. */
function signupDoc({ runIdValue, eventId, uid, name, email, status, decidedAt, createdAt }) {
  return {
    e2eDoorRunId: runIdValue,
    eventId,
    uid,
    name,
    email,
    answers: {},
    status,
    decisionNote: null,
    decidedBy: null,
    decidedAt,
    signupSnapshot: null,
    createdAt,
    cancelledAt: null,
  };
}

/** The admin's uid, by the address the harness is given: a private key, kept out of the ledger. */
async function adminUidFromSecrets() {
  const { adminEmail } = loadSecrets();
  if (!adminEmail) {
    throw new Error(
      "The events at the door spec needs the admin account the harness is given: E2E_ADMIN_EMAIL is not set. " +
        "This harness cannot create an admin, by design.",
    );
  }
  return (await adminAuth().getUserByEmail(adminEmail)).uid;
}

async function seed({ runId: runIdValue, suppress = true, onState } = {}) {
  const target = assertFixtureTarget();
  const now = new Date();
  // Whole minutes, so the times the pages print are the times the spec works out.
  const startAt = new Date(now.getTime() - 30 * MINUTE_MS);
  startAt.setSeconds(0, 0);
  const endAt = new Date(startAt.getTime() + 2 * 60 * MINUTE_MS);
  const chosenStartAt = new Date(now.getTime() + 5 * DAY_MS);
  chosenStartAt.setSeconds(0, 0);
  const chosenEndAt = new Date(chosenStartAt.getTime() + 2 * 60 * MINUTE_MS);

  const state = {
    runId: runIdValue,
    projectId: target.projectId,
    createdAt: now.toISOString(),
    suppress,
    door: {
      id: fixtureId("e2e-door-event", runIdValue),
      title: `Door night ${runIdValue}`,
      startAtIso: startAt.toISOString(),
      endAtIso: endAt.toISOString(),
    },
    chosen: {
      id: fixtureId("e2e-chosen-event", runIdValue),
      title: `Chosen supper ${runIdValue}`,
      startAtIso: chosenStartAt.toISOString(),
      endAtIso: chosenEndAt.toISOString(),
    },
    olive: null,
    pia: null,
    rex: null,
    /** The guest, as an address and a name: no account. */
    guest: { email: harnessEmail(`${runIdValue}guest`), name: GUEST_NAME },
    /** The sign-ups this fixture writes, by whose they are. */
    signups: {
      pia: fixtureId("e2e-door-pia", runIdValue),
      guest: fixtureId("e2e-door-guest", runIdValue),
      rex: fixtureId("e2e-chosen-rex", runIdValue),
    },
    /** The admin's uid, who chose who the chosen event is for. Private: never in the ledger. */
    adminUid: null,
    /** Suppression rows written by seeding. Empty when mail is caught. */
    suppressed: [],
  };
  // Published BEFORE the first write, so a seed that throws half way still
  // leaves the runner a ledger naming what it created.
  onState?.(state);
  state.adminUid = await adminUidFromSecrets();

  log(`Seeding fixture ${runIdValue} into ${target.projectId}.`);
  for (const [key, index, names] of [
    ["olive", 0, OLIVE_NAMES],
    ["pia", 1, PIA_NAMES],
    ["rex", 2, REX_NAMES],
  ]) {
    const account = await createFixtureUser({ runId: runIdValue, index, suppress, names });
    if (account.suppressionId) state.suppressed.push(account.suppressionId);
    state[key] = { uid: account.uid, email: account.email, password: account.password, name: names.display, first: names.preferred };
  }
  if (suppress) {
    // The guest has no account, so no seeder wrote theirs: written here, before
    // anything exists that could send to the address.
    const id = emailDocId(state.guest.email);
    await fixtureDoc("suppressedEmails", id).set({
      e2eDoorRunId: runIdValue,
      email: state.guest.email.toLowerCase(),
      reason: "bounce",
      source: "manual",
      addedAt: now,
    });
    state.suppressed.push(id);
  }

  const signedUpAt = new Date(now.getTime() - 3 * DAY_MS);
  const decidedAt = new Date(now.getTime() - 2 * DAY_MS);
  await fixtureDoc("events", state.door.id).set(
    eventDoc({
      runIdValue,
      title: state.door.title,
      startAt,
      endAt,
      visibility: "public",
      authorUid: state.olive.uid,
      surveyOn: false,
      counts: { pending: 0, confirmed: 2 },
      now,
    }),
  );
  await fixtureDoc("eventRsvps", state.signups.pia).set(
    signupDoc({
      runIdValue,
      eventId: state.door.id,
      uid: state.pia.uid,
      name: state.pia.name,
      email: state.pia.email,
      status: "confirmed",
      decidedAt,
      createdAt: signedUpAt,
    }),
  );
  await fixtureDoc("eventRsvps", state.signups.guest).set(
    signupDoc({
      runIdValue,
      eventId: state.door.id,
      uid: null,
      name: state.guest.name,
      email: state.guest.email,
      status: "confirmed",
      decidedAt,
      createdAt: signedUpAt,
    }),
  );

  await fixtureDoc("events", state.chosen.id).set(
    eventDoc({
      runIdValue,
      title: state.chosen.title,
      startAt: chosenStartAt,
      endAt: chosenEndAt,
      visibility: "chosen",
      authorUid: state.olive.uid,
      surveyOn: true,
      counts: { pending: 1, confirmed: 0 },
      now,
    }),
  );
  // Who it is for, as the editor's Who's it for step records the admin's choice.
  await fixtureDoc("eventAudiences", state.chosen.id).set({
    e2eDoorRunId: runIdValue,
    include: [personTag(state.rex.uid), cameTag(state.door.id)],
    exclude: [],
    setBy: state.adminUid,
    setAt: now,
  });
  // The list as publishing left it: Rex alone, nobody having come to the door
  // event yet, by Rex's events row, which a new account has off.
  await fixtureDoc("eventInvitations", `${state.chosen.id}__${state.rex.uid}`).set({
    e2eDoorRunId: runIdValue,
    eventId: state.chosen.id,
    uid: state.rex.uid,
    invitedAt: now,
    invitedBy: state.adminUid,
    via: "publish",
    how: "grid",
    outcome: "not-emailed",
    why: "settings",
  });
  await fixtureDoc("eventRsvps", state.signups.rex).set(
    signupDoc({
      runIdValue,
      eventId: state.chosen.id,
      uid: state.rex.uid,
      name: state.rex.name,
      email: state.rex.email,
      status: "pending",
      decidedAt: null,
      createdAt: new Date(now.getTime() - DAY_MS),
    }),
  );

  log(`Seeded the door event ${state.door.id} and the chosen event ${state.chosen.id}.`);
  return state;
}

const eventIdsOf = (state) => [state.door?.id, state.chosen?.id].filter(Boolean);
const accountsOf = (state) => [state.olive, state.pia, state.rex].filter(Boolean);
const addressesOf = (state) => [...accountsOf(state).map((account) => account.email), state.guest?.email].filter(Boolean);

/** Every survey either event has: its own, and the question for people who did not come. */
async function surveyIdsOf(state) {
  const ids = [];
  for (const eventId of eventIdsOf(state)) {
    for (const doc of (await fixtureQuery("surveys").where("eventId", "==", eventId).get()).docs) ids.push(doc.id);
  }
  return ids;
}

/**
 * The send counters a survey's and an invitation's presses leave in
 * `courseNudges` (`claimCaps` in src/lib/surveys/events/sending.ts and
 * `claimInvitationSlots` in src/lib/events/invitations.ts, restated): the
 * survey's daily one and the presser's hourly one, and the invitations'
 * pair. Olive presses every one of them.
 */
function counterIdsOf(state, surveyIds) {
  const presser = state.olive?.uid;
  const ids = [];
  for (const id of surveyIds) {
    ids.push(`emailrate__surveyday__${id}`);
    if (presser) ids.push(`emailrate__survey__${id}__${presser}`);
  }
  for (const eventId of eventIdsOf(state)) {
    ids.push(`emailrate__eventinvite__${eventId}`);
    if (presser) ids.push(`emailrate__eventinvite__${eventId}__${presser}`);
  }
  return ids;
}

/**
 * The send log, keyed two ways and counted once: every row to one of this
 * run's addresses (the approval, the survey's emails, the test), and every
 * row about one of its surveys, whoever it went to.
 */
async function sendRowsOf(state, surveyIds) {
  const rows = new Map();
  for (const address of addressesOf(state)) {
    for (const doc of (await fixtureQuery("emailSends").where("to", "==", address).get()).docs) rows.set(doc.id, doc.ref);
  }
  for (const id of surveyIds) {
    for (const doc of (await fixtureQuery("emailSends").where("referenceId", "==", id).get()).docs) rows.set(doc.id, doc.ref);
  }
  return rows;
}

async function countRows(state) {
  const counts = {
    events: 0,
    eventRsvps: 0,
    eventCheckIns: 0,
    eventAudiences: 0,
    eventInvitations: 0,
    surveys: 0,
    surveyPeople: 0,
    surveyAnswers: 0,
    trackedLinks: 0,
    courseNudges: 0,
  };
  for (const eventId of eventIdsOf(state)) {
    counts.events += (await fixtureDoc("events", eventId).get()).exists ? 1 : 0;
    counts.eventRsvps += (await fixtureQuery("eventRsvps").where("eventId", "==", eventId).get()).size;
    counts.eventCheckIns += (await fixtureQuery("eventCheckIns").where("eventId", "==", eventId).get()).size;
    counts.eventAudiences += (await fixtureDoc("eventAudiences", eventId).get()).exists ? 1 : 0;
    counts.eventInvitations += (await fixtureQuery("eventInvitations").where("eventId", "==", eventId).get()).size;
    counts.trackedLinks += (await fixtureQuery("trackedLinks").where("destination", "==", surveyCodePath(eventId)).get()).size;
  }
  const surveyIds = await surveyIdsOf(state);
  counts.surveys = surveyIds.length;
  for (const id of surveyIds) {
    counts.surveyPeople += (await fixtureQuery("surveyPeople").where("surveyId", "==", id).get()).size;
    counts.surveyAnswers += (await fixtureQuery("surveyAnswers").where("surveyId", "==", id).get()).size;
  }
  for (const id of counterIdsOf(state, surveyIds)) {
    if ((await fixtureDoc("courseNudges", id).get()).exists) counts.courseNudges += 1;
  }
  counts.emailSends = (await sendRowsOf(state, surveyIds)).size;
  let suppressionRows = 0;
  for (const id of state.suppressed ?? []) {
    if ((await fixtureDoc("suppressedEmails", id).get()).exists) suppressionRows += 1;
  }
  counts.suppressedEmails = suppressionRows;
  const accounts = await countAccounts(accountsOf(state).map((account) => account.uid));
  counts.users = accounts.users;
  counts.authAccounts = accounts.authAccounts;
  counts.total = Object.values(counts).reduce((a, b) => (typeof b === "number" ? a + b : a), 0);
  counts.runId = state.runId;
  return counts;
}

async function teardown(state) {
  assertFixtureTarget();
  const failures = [];
  // THE NAMESPACE CHECK FIRST, before a single delete: the sweeps below are
  // keyed on addresses and ids out of this state file.
  for (const address of addressesOf(state)) {
    if (!isHarnessAccount(address)) throw new Error(`REFUSING to tear down ${address}: not a harness address.`);
  }
  for (const eventId of eventIdsOf(state)) {
    if (!eventId.endsWith(`__${state.runId}`)) {
      throw new Error(`REFUSING to tear down event ${eventId}: it does not carry this run's id.`);
    }
  }
  log(`Tearing down fixture ${state.runId}.`);

  // Leaves first: what the routes wrote under each survey and each event.
  const surveyIds = await surveyIdsOf(state);
  try {
    for (const id of surveyIds) {
      await deleteQuery(fixtureQuery("surveyAnswers").where("surveyId", "==", id));
      await deleteQuery(fixtureQuery("surveyPeople").where("surveyId", "==", id));
    }
    for (const id of counterIdsOf(state, surveyIds)) await fixtureDoc("courseNudges", id).delete();
    for (const id of surveyIds) await fixtureDoc("surveys", id).delete();
  } catch (err) {
    failures.push(`surveys: ${err.message}`);
  }
  for (const eventId of eventIdsOf(state)) {
    try {
      await deleteQuery(fixtureQuery("trackedLinks").where("destination", "==", surveyCodePath(eventId)));
      await deleteQuery(fixtureQuery("eventCheckIns").where("eventId", "==", eventId));
      await deleteQuery(fixtureQuery("eventInvitations").where("eventId", "==", eventId));
      await deleteQuery(fixtureQuery("eventRsvps").where("eventId", "==", eventId));
      await fixtureDoc("eventAudiences", eventId).delete();
      await fixtureDoc("events", eventId).delete();
    } catch (err) {
      failures.push(`${eventId}: ${err.message}`);
    }
  }
  for (const id of state.suppressed ?? []) await fixtureDoc("suppressedEmails", id).delete();
  for (const account of accountsOf(state)) {
    try {
      await deleteHarnessUserDoc(account.uid);
      await deleteHarnessUser(account.uid);
    } catch (err) {
      failures.push(`${account.uid}: ${err.message}`);
    }
  }
  // The send log LAST: an RSVP email is fire and forget, logged a moment
  // after the route answers, so the later this runs the smaller the window.
  for (const ref of (await sendRowsOf(state, surveyIds)).values()) await ref.delete();

  const counts = await countRows(state);
  if (failures.length > 0) {
    counts.teardownFailures = failures;
    counts.total += failures.length;
  }
  return counts;
}

export const SPEC = {
  name: "events-at-the-door",
  specFile: "tests/e2e/events-at-the-door.spec.mjs",
  steps: DOOR_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approving accounts, granting the Events permission and the door list are an admin's here.
  needs: { admin: true },
  // Rex's approval, the survey's emails and the test are read out of Mailpit.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/events/[id]/signups",
      "/api/events/[id]/rsvp/[rsvpId]/approve",
      "/api/events/[id]/door",
      "/api/events/[id]/check-ins",
      "/api/events/[id]/survey-after",
      "/api/events/[id]/survey-after/send",
      "/api/events/[id]/survey-after/test",
      "/api/events/[id]/invitations",
      "/api/admin/members/[uid]/events",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/(admin-only)/members/[uid]",
      "/(app)/dashboard",
      "/(app)/events/manage",
      "/(app)/events/manage/[id]/attendees",
      "/(app)/events/manage/[id]/check-in",
      "/(app)/events/manage/[id]/door",
      "/(app)/events/manage/[id]/survey",
    ],
  },
  // Verified: run against the harness's own server, its mail caught, on
  // 2 November 2026, sitting on 310e066f (dev 3879aa87 with #245's branch,
  // fd00545a, under it): all ten steps completed, 30 rows before teardown and
  // a zero manifest after.
  status: "verified",
  seed,
  countRows,
  teardown,
};
