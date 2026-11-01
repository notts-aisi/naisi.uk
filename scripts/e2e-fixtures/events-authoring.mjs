/**
 * Events authoring: the admin makes an event for chosen people from nothing,
 * sends it for approval, approves it and publishes it; the person chosen finds
 * it on Home and asks for a place; somebody who was not chosen, signed in or
 * not, is told calmly that it is only for the people invited to it.
 *
 * ## What this fixture seeds, and what the PRODUCT creates
 *
 * Two accounts, waiting for approval, as every fixture's are: the INVITEE and
 * the STRANGER. The admin approves both on a real page, because the harness
 * may write no role above `pending`. Everything else is the product's: the
 * event, who it is for (`eventAudiences`), the list of the people invited
 * (`eventInvitations`), the invitee's request (`eventRsvps`), and whatever the
 * send log records.
 *
 * ## Teardown sweeps the event by its TITLE
 *
 * The event's id is Firestore's own, minted when the admin presses Create, so
 * the harness cannot know it and the spec runs in another process from the
 * teardown. The title is the key: the seed decides it, the spec types it, and
 * teardown sweeps `events` by `title ==` it, then everything keyed on each
 * event it finds. It carries the run id, so it cannot be a real event's.
 *
 * ## What it sends
 *
 * Publishing an event for chosen people emails each person invited by their
 * event announcements row, and the invitee's is off (an account's starts off),
 * so publishing emails nobody; the editor and the confirm say so, which the
 * spec reads. The invitee's request sends the "request received" email, to an
 * address on the suppression list unless the mail is caught.
 */
import {
  assertFixtureTarget,
  countAccounts,
  createFixtureUser,
  deleteQuery,
  fixtureDoc,
  fixtureQuery,
} from "./core.mjs";
import { deleteHarnessUser, deleteHarnessUserDoc, isHarnessAccount } from "../e2e/lib/admin.mjs";

const log = (msg) => console.log(`[events-authoring-seed] ${msg}`);

/** Every step the spec must complete, in order. */
export const AUTHORING_STEPS = [
  "the admin approves the two people this journey signs in as",
  "the admin makes an event for the invitee alone, and the editor counts it on one Home",
  "the admin sends it for approval, approves it and publishes it, and the confirm says it is not listed or announced",
  "a signed-out visitor is told it is only for the people invited, and the page's title names nothing",
  "the events page does not list it",
  "the invitee finds it on Home, for them, and asks for a place",
  "a member who was not invited is told it is only for the people invited",
];

/** Asking for a place presses the sign-up form's Submit, which is reCAPTCHA-gated. */
export const RECAPTCHA_DEPENDENT_STEPS = ["the invitee finds it on Home, for them, and asks for a place"];

/** The two accounts' names, which the picker and the admins' list show. */
export const INVITEE_NAMES = { preferred: "Inez", display: "Inez Fixture" };
export const STRANGER_NAMES = { preferred: "Saul", display: "Saul Fixture" };

async function seed({ runId: fixtureRunId, suppress = true, onState } = {}) {
  const target = assertFixtureTarget();
  const state = {
    fixtureRunId,
    projectId: target.projectId,
    createdAt: new Date().toISOString(),
    suppress,
    /** What the spec types into the new event's title, and the key teardown sweeps on. */
    eventTitle: `Chosen people dinner ${fixtureRunId}`,
    invitee: null,
    stranger: null,
    /** Suppression rows written by seeding. Empty when mail is caught. */
    suppressed: [],
  };
  // Published BEFORE the first write, so a seed that throws half way still
  // leaves the runner a ledger naming what it created.
  onState?.(state);

  log(`Seeding fixture ${fixtureRunId} into ${target.projectId}.`);
  for (const [key, index, names] of [
    ["invitee", 0, INVITEE_NAMES],
    ["stranger", 1, STRANGER_NAMES],
  ]) {
    const account = await createFixtureUser({ runId: fixtureRunId, index, suppress, names });
    if (account.suppressionId) state.suppressed.push(account.suppressionId);
    state[key] = { uid: account.uid, email: account.email, password: account.password, name: names.display };
  }
  log("Seeded two waiting accounts. The event is the browser's job.");
  return state;
}

/** The events this run's admin made: one, unless a retry pressed Create twice. */
async function runEvents(state) {
  return (await fixtureQuery("events").where("title", "==", state.eventTitle).get()).docs;
}

async function countRows(state) {
  const counts = { events: 0, eventAudiences: 0, eventInvitations: 0, eventRsvps: 0 };
  for (const event of await runEvents(state)) {
    counts.events += 1;
    counts.eventAudiences += (await fixtureDoc("eventAudiences", event.id).get()).exists ? 1 : 0;
    counts.eventInvitations += (await fixtureQuery("eventInvitations").where("eventId", "==", event.id).get()).size;
    counts.eventRsvps += (await fixtureQuery("eventRsvps").where("eventId", "==", event.id).get()).size;
  }
  const people = [state.invitee, state.stranger].filter(Boolean);
  let sendRows = 0;
  for (const person of people) {
    sendRows += (await fixtureQuery("emailSends").where("to", "==", person.email).get()).size;
  }
  counts.emailSends = sendRows;
  let suppressionRows = 0;
  for (const id of state.suppressed ?? []) {
    if ((await fixtureDoc("suppressedEmails", id).get()).exists) suppressionRows += 1;
  }
  counts.suppressedEmails = suppressionRows;
  const accounts = await countAccounts(people.map((person) => person.uid));
  counts.users = accounts.users;
  counts.authAccounts = accounts.authAccounts;
  counts.total = Object.values(counts).reduce((a, b) => (typeof b === "number" ? a + b : a), 0);
  counts.fixtureRunId = state.fixtureRunId;
  return counts;
}

async function teardown(state) {
  assertFixtureTarget();
  const failures = [];
  const people = [state.invitee, state.stranger].filter(Boolean);
  // THE NAMESPACE CHECK FIRST, before a single delete: the sweeps below are
  // keyed on addresses out of this state file.
  for (const person of people) {
    if (!isHarnessAccount(person.email)) {
      throw new Error(`REFUSING to tear down ${person.email}: not a harness account.`);
    }
  }
  if (typeof state.eventTitle !== "string" || !state.eventTitle.includes(state.fixtureRunId)) {
    throw new Error(
      `REFUSING to sweep events by title ${JSON.stringify(state.eventTitle)}: it does not carry this run's id.`,
    );
  }
  log(`Tearing down fixture ${state.fixtureRunId}.`);

  // Leaves first: what each event's routes wrote, then the event.
  for (const event of await runEvents(state)) {
    try {
      await deleteQuery(fixtureQuery("eventRsvps").where("eventId", "==", event.id));
      await deleteQuery(fixtureQuery("eventInvitations").where("eventId", "==", event.id));
      await fixtureDoc("eventAudiences", event.id).delete();
      await event.ref.delete();
    } catch (err) {
      failures.push(`${event.id}: ${err.message}`);
      log(`Could not tear down event ${event.id}: ${err.message}`);
    }
  }
  for (const person of people) {
    await deleteQuery(fixtureQuery("emailSends").where("to", "==", person.email));
  }
  for (const id of state.suppressed ?? []) await fixtureDoc("suppressedEmails", id).delete();
  for (const person of people) {
    try {
      await deleteHarnessUserDoc(person.uid);
      await deleteHarnessUser(person.uid);
    } catch (err) {
      failures.push(`${person.uid}: ${err.message}`);
    }
  }

  const counts = await countRows(state);
  if (failures.length > 0) {
    counts.teardownFailures = failures;
    counts.total += failures.length;
  }
  return counts;
}

export const SPEC = {
  name: "events-authoring",
  specFile: "tests/e2e/events-authoring.spec.mjs",
  steps: AUTHORING_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Making, approving and publishing an event, and choosing people by name,
  // are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/audience",
      "/api/audience/who",
      "/api/events/[id]/audience",
      "/api/events/[id]/publish",
      "/api/events/[id]/rsvp",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/events/manage",
      "/(app)/events/manage/new",
      "/(app)/events/manage/[id]",
      "/(app)/dashboard",
      "/(public)/events",
      "/(public)/events/[id]",
      "/(public)/events/[id]/rsvp/submitted",
    ],
  },
  /**
   * Written beside the code it drives and not yet run end to end: it counts
   * nothing on the coverage map until a run against the harness's server has
   * passed and read zero rows afterwards.
   */
  status: "unverified",
  seed,
  countRows,
  teardown,
};
