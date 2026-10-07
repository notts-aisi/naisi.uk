/**
 * The one-flow spec's fixture: ONE application form, and nothing else.
 *
 * The journey under test is a person with no account who opens the term's
 * application form, answers its first step (which is their join request),
 * makes an account from that step, and carries straight on to send an
 * application. So, like the sign-up fixture, this one seeds NO account. The
 * account, its join request, its application and both of its emailed links are
 * the product's to make:
 *
 *   - `/api/register` creates the Auth user and emails the confirmation link;
 *   - that link's landing page signs in and `/api/register/password-set` gives
 *     the account a credential;
 *   - the form's own first step writes `users/{uid}` at role `pending` through
 *     the register page's client function, and asks `/api/verify-email/send`
 *     for the link that checks the university address;
 *   - the form's routes create, save and send `admissionApplications/{id}`.
 *
 * What IS seeded is the form: an admission round with `formVersion: 2`, one
 * programme taking applications, and one question set under it. The older
 * fixtures seed rounds of the older kind, which the apply page shows through a
 * different screen, so none of them can stand in for it.
 *
 * Nobody staffs the form. The programme has no lead and no reviewers, and the
 * round's reviewer list is empty, which is both the honest fixture for a form
 * this spec never decides and the shape the privilege fence requires.
 *
 * ## Mail, and why there are no `suppressedEmails` rows
 *
 * This journey has to READ its own mail twice (the confirmation link, then the
 * university link), so suppression would leave it with no link to open. What
 * keeps it off a real sender is `requiresCaughtMail: true`: the runner skips
 * the whole spec, with the reason printed, wherever `mailIsCaught()` says a
 * message could really go. The spec itself also refuses to press the register
 * button unless the runner said this run's mail is caught, and proves a
 * `.invalid` message reached the local catcher before the join request (which
 * is what makes the server address the `@nottingham.ac.uk` address) is sent.
 *
 * ## What it cannot drain
 *
 * `signupMetrics` holds one shared daily counter document per date, which
 * `/api/register` increments. It is not a fixture collection and must not be:
 * draining it would corrupt a real number. A run leaves the counters a
 * fraction higher, exactly as a person registering does. Everything else the
 * journey causes is counted below and removed by teardown.
 */
import {
  assertFixtureTarget,
  countAccounts,
  deleteQuery,
  fixtureDoc,
  fixtureId,
  fixturePassword,
  fixtureQuery,
  fixtureSubcollection,
  subscriptionId,
} from "./core.mjs";
import {
  deleteHarnessUser,
  deleteHarnessUserDoc,
  harnessUserByEmail,
  isHarnessAccount,
} from "../e2e/lib/admin.mjs";
import {
  deleteEmailVerificationsFor,
  deleteRegistrationRow,
} from "../e2e/lib/firestore.mjs";

const log = (msg) => console.log(`[one-flow-seed] ${msg}`);

/**
 * Every step the spec must complete, in order. Shared with the spec, which
 * records what it finished, and with the runner, which checks the record
 * against this list.
 */
export const ONE_FLOW_STEPS = [
  "a visitor with no account is shown the form's first step, and nothing else of the form",
  "Continue is held until the join request is complete and the terms are agreed to",
  "Continue then offers the two ways to make an account, on the same page",
  "giving an email address sends the confirmation and says to come back to this tab",
  "the emailed link confirms the address and a password is chosen, in a tab of its own",
  "the first tab sees the sign-in, still holds every answer, and one press sends the join request",
  "the join request is a waiting account with an unchecked university address, and About you is on the application",
  "the rest of the form is filled in and saved",
  "Send is held, and says why, while the university address is unchecked",
  "the university link is followed and the same application sends",
  "the application is the committee's to read, and every address has its send rows",
];

/**
 * Everything but the first step. `/api/register` is reCAPTCHA-gated, and the
 * journey makes the server SEND, the second time to a `@nottingham.ac.uk`
 * address. Against a deployed backend neither may happen, so the one step
 * left running there is a page read that writes nothing.
 */
export const RECAPTCHA_DEPENDENT_STEPS = ONE_FLOW_STEPS.slice(1);

/** The form's one programme and its one question, fixed so the spec can find them. */
export const PROGRAMME_ID = "e2e-programme";
export const PROGRAMME_NAME = "End-to-end fellowship";
export const QUESTION_SET_ID = "fellowships";
export const QUESTION_ID = "why";
export const QUESTION_TEXT = "Why do you want to take part this term?";

/** A form's question sets live under the round, in their own subcollection. */
const QUESTION_SETS = "questionSets";

/**
 * A question set's own kind, which is NOT an account's role. Written through a
 * constant so the privilege fence's `role:` pattern never has to be widened
 * for it (see the note in tests/funnel-harness-guards.test.mjs).
 */
const GENERAL_SET = "general";

/**
 * The subscription channels `/api/subscriptions/sync` can write a row per
 * address for. A restatement of `SUBSCRIPTION_CATEGORIES` in
 * src/lib/firestore/notifications.ts, which is TypeScript and cannot be
 * imported from plain Node.
 */
const SUBSCRIPTION_CHANNELS = ["newsletter", "events"];

/** Both fixture address namespaces, spelled out rather than prefix-matched. */
const FIXTURE_ADDRESS = /^e2e-[a-z0-9]+@(e2e\.invalid|nottingham\.ac\.uk)$/;

// ---------------------------------------------------------------------------
// Fixture shapes
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Civil date key "YYYY-MM-DD" in Europe/London, the shape the fields want. */
function londonDateKey(at) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The form: an admission round with `formVersion: 2`, written field by field
 * in the shape the form's own editor stores, so the fixture does not lean on a
 * normaliser to fill anything in.
 */
function formDoc({ id, label, now, oneFlowRunId }) {
  return {
    e2eOneFlowRunId: oneFlowRunId,
    formVersion: 2,
    kind: "enrolment",
    label,
    slug: id,
    blurb:
      "A throwaway application form created by the applicant-one-flow end-to-end run. " +
      "If you are reading this on a live surface, a run crashed before its teardown.",
    academicYear: "2026/27",
    status: "open",
    opensAt: new Date(now.getTime() - DAY_MS),
    closesAt: new Date(now.getTime() + 14 * DAY_MS),
    decisionsByDate: londonDateKey(new Date(now.getTime() + 21 * DAY_MS)),
    invitationReplyBy: londonDateKey(new Date(now.getTime() + 23 * DAY_MS)),
    stageIds: [],
    programmePreference: {
      enabled: false,
      streams: [],
      fellowships: [],
      maxRankedFellowships: 2,
      offerFellowshipFallback: false,
    },
    // 09:00 to 21:00 in quarter hours, the grid the sample term uses.
    availabilityGrid: { version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 },
    accessRequirementsPrompt: "",
    criteria: [],
    scoreScale: { min: 1, max: 5 },
    reviewersPerApplication: 1,
    reviewerUids: [],
    finalDeciderUid: null,
    blind: { hideNames: false, hideMembership: true },
    evidenceRunIds: [],
    reminderOffsets: [],
    outcomeRunIds: [],
    applicationCounts: {
      draft: 0,
      submitted: 0,
      accepted: 0,
      "fellowship-offered": 0,
      waitlisted: 0,
      rejected: 0,
      withdrawn: 0,
    },
    archived: false,
    clonedFromRoundId: null,
    authorUid: "",
    programmeIds: [PROGRAMME_ID],
    programmes: {
      [PROGRAMME_ID]: {
        kind: "fellowship",
        name: PROGRAMME_NAME,
        shortName: PROGRAMME_NAME,
        pitch: "A programme that exists so an automated run has something to tick.",
        facts: "6 WEEKS",
        starts: "",
        places: 8,
        groupCount: 1,
        groupSize: "Up to 8",
        leadUid: null,
        reviewerUids: [],
        useScores: false,
        closed: false,
        runId: null,
        emailWording: {},
      },
    },
    questionSetIds: [QUESTION_SET_ID],
    asksFacilitating: false,
    revealOtherReviews: false,
    noOfferWording: null,
    decisionsSentAt: null,
    decisionsSentByUid: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** The one question set: asked of anybody who ticks a fellowship, one required answer. */
function questionSetDoc({ formId, now, oneFlowRunId }) {
  return {
    e2eOneFlowRunId: oneFlowRunId,
    roundId: formId,
    role: GENERAL_SET,
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    intro: "",
    questions: [
      {
        id: QUESTION_ID,
        text: QUESTION_TEXT,
        help: "",
        type: "long",
        options: [],
        optionsFromRanking: false,
        wordLimit: 100,
        required: true,
        scored: false,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function seed({ runId: oneFlowRunId, suppress = true, options = {}, onState } = {}) {
  void options;
  const target = assertFixtureTarget();
  const now = new Date();

  const formId = fixtureId("e2e-oneflow-form", oneFlowRunId);
  const formLabel = `One-flow intake ${oneFlowRunId}`;

  const state = {
    oneFlowRunId,
    projectId: target.projectId,
    createdAt: now.toISOString(),
    roundId: formId,
    formLabel,
    programmeId: PROGRAMME_ID,
    programmeName: PROGRAMME_NAME,
    questionSetId: QUESTION_SET_ID,
    questionId: QUESTION_ID,
    questionText: QUESTION_TEXT,
    /**
     * The two addresses the ROUTES will attach to an account that does not
     * exist yet. Written here because teardown runs in the runner's process
     * and the ledger is the only thing it is handed.
     */
    loginEmail: `e2e-o${oneFlowRunId}@e2e.invalid`,
    uniEmail: `e2e-o${oneFlowRunId}@nottingham.ac.uk`,
    /** Typed on the emailed link's landing page. Random, and kept out of the ledger. */
    password: fixturePassword(),
    /**
     * The runner's answer to "would a send from this target reach a real
     * sender". FALSE means the local catcher takes it, which is the only mode
     * this spec may press its register button in.
     */
    suppress,
  };

  // Published BEFORE the first write, and filled in place from here on, so a
  // seed that throws half way still leaves the runner a ledger.
  onState?.(state);

  log(`Seeding fixture ${oneFlowRunId} into ${target.projectId}.`);

  await fixtureDoc("admissionRounds", formId).set(
    formDoc({ id: formId, label: formLabel, now, oneFlowRunId }),
  );
  await fixtureSubcollection("admissionRounds", formId, QUESTION_SETS)
    .doc(QUESTION_SET_ID)
    .set(questionSetDoc({ formId, now, oneFlowRunId }));

  log(
    `Seeded form ${formId}. The account for ${state.loginEmail} is the product's to create.`,
  );
  return state;
}

// ---------------------------------------------------------------------------
// Counting: the manifest that must read zero
// ---------------------------------------------------------------------------

/** Every subscription row id the sync route could mint for this run. */
function subscriptionIds(state) {
  const ids = [];
  for (const address of [state.loginEmail, state.uniEmail]) {
    for (const channel of SUBSCRIPTION_CHANNELS) {
      ids.push(subscriptionId(address, channel));
    }
  }
  return ids;
}

/**
 * The account `/api/register` created for this run's address, or null before
 * it has (and after teardown has removed it). `harnessUserByEmail` refuses any
 * address outside the `.invalid` namespace.
 */
async function routeCreatedUid(state) {
  const account = await harnessUserByEmail(state.loginEmail).catch(() => null);
  return account?.uid ?? null;
}

/**
 * Counts every row this fixture owns, seeded or route-created. Teardown is
 * only believed when this reads zero across the board.
 *
 * The seed writes two documents and the journey writes the rest: the register
 * route's Auth user, its `registrations` row and its `emailVerifications`
 * token; the university link's second token; the join request's `users`
 * document; the subscriptions sync's rows and their event lines; the
 * application the form's routes create; and one `emailSends` row per message.
 */
async function countRows(state) {
  const counts = {};
  const { roundId } = state;

  const formSnap = await fixtureDoc("admissionRounds", roundId).get();
  counts.admissionRounds = formSnap.exists ? 1 : 0;

  const sets = await fixtureSubcollection("admissionRounds", roundId, QUESTION_SETS).get();
  counts.admissionRoundQuestionSets = sets.size;

  counts.admissionApplications = (
    await fixtureQuery("admissionApplications").where("roundId", "==", roundId).get()
  ).size;
  // The new form keeps no private row beside an application. Counted anyway:
  // a manifest that only looks where it expects rows reports zero for the one
  // case worth catching.
  counts.admissionApplicationPrivate = (
    await fixtureQuery("admissionApplicationPrivate").where("roundId", "==", roundId).get()
  ).size;

  let verifications = 0;
  for (const address of [state.loginEmail, state.uniEmail]) {
    verifications += (
      await fixtureQuery("emailVerifications").where("email", "==", address).get()
    ).size;
  }
  counts.emailVerifications = verifications;

  let subscriptions = 0;
  let subscriptionEvents = 0;
  for (const id of subscriptionIds(state)) {
    const snap = await fixtureDoc("subscriptions", id).get();
    if (snap.exists) subscriptions += 1;
    subscriptionEvents += (
      await fixtureQuery("subscriptionEvents").where("subscriptionId", "==", id).get()
    ).size;
  }
  counts.subscriptions = subscriptions;
  counts.subscriptionEvents = subscriptionEvents;

  // The send log, keyed on the RECIPIENT, which is run-scoped by construction:
  // both addresses embed this run's id. Nothing on this journey mails anybody
  // else. A step that added such a send would have to count it here.
  let sends = 0;
  for (const address of [state.loginEmail, state.uniEmail]) {
    sends += (await fixtureQuery("emailSends").where("to", "==", address).get()).size;
  }
  counts.emailSends = sends;

  const uid = await routeCreatedUid(state);
  const registration = uid ? await fixtureDoc("registrations", uid).get() : null;
  counts.registrations = registration?.exists ? 1 : 0;

  const accounts = await countAccounts(uid ? [uid] : []);
  counts.users = accounts.users;
  counts.authAccounts = accounts.authAccounts;

  counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
  counts.oneFlowRunId = state.oneFlowRunId;
  return counts;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/**
 * Removes everything, in the order that keeps a half-finished teardown
 * recoverable: route-created leaves first, then the seeded form, then the
 * account, because the `registrations` row and the `users` document are both
 * addressed by a uid this only knows through the Auth record.
 */
async function teardown(state) {
  assertFixtureTarget();
  log(`Tearing down fixture ${state.oneFlowRunId}.`);
  /** Anything that refused or failed to delete, reported rather than forgotten. */
  const failures = [];

  // The namespace check comes FIRST, before a single delete. Every sweep below
  // is keyed on an ADDRESS out of this state file, and a tampered or stale
  // ledger naming a real person must be refused before any of them runs.
  if (!isHarnessAccount(state.loginEmail)) {
    throw new Error(
      `REFUSING to tear down ${state.loginEmail}: not a harness account. The state ` +
        "file names a sign-in address this fixture could not have caused.",
    );
  }
  if (!FIXTURE_ADDRESS.test(state.uniEmail ?? "")) {
    throw new Error(
      `REFUSING to tear down ${state.uniEmail}: not a fixture university address ` +
        "(e2e-<id>@nottingham.ac.uk). Real registrations keep their rows.",
    );
  }

  // Resolved before anything is removed: the tracker row and the users
  // document are addressed by it, and `deleteHarnessUser` below takes it away.
  const uid = await routeCreatedUid(state);

  // Route-created leaves. Event lines before the subscription rows they
  // describe, since they are addressed through those rows' ids.
  for (const id of subscriptionIds(state)) {
    await deleteQuery(fixtureQuery("subscriptionEvents").where("subscriptionId", "==", id));
    await fixtureDoc("subscriptions", id).delete();
  }
  await deleteQuery(
    fixtureQuery("admissionApplicationPrivate").where("roundId", "==", state.roundId),
  );
  await deleteQuery(
    fixtureQuery("admissionApplications").where("roundId", "==", state.roundId),
  );
  for (const address of [state.loginEmail, state.uniEmail]) {
    // Through the auth harness's own sweeper, which re-checks the address
    // against the same two namespaces before it deletes anything.
    await deleteEmailVerificationsFor(address).catch((err) => {
      failures.push(`emailVerifications for ${address}: ${err.message}`);
    });
  }

  // The seeded form, its question sets first.
  const sets = await fixtureSubcollection("admissionRounds", state.roundId, QUESTION_SETS).get();
  for (const doc of sets.docs) await doc.ref.delete();
  await fixtureDoc("admissionRounds", state.roundId).delete();

  // The send log LAST of the row sweeps. The join request's own confirmation
  // is fire and forget from the browser's point of view, so the later this
  // runs the smaller the window in which a row lands behind it.
  for (const address of [state.loginEmail, state.uniEmail]) {
    await deleteQuery(fixtureQuery("emailSends").where("to", "==", address));
  }

  if (uid) {
    try {
      // The tracker row first: its own helper re-reads the row and refuses one
      // whose email is not a harness address, so it has to run while the Auth
      // account it belongs to still exists.
      await deleteRegistrationRow(uid);
      // Then the users document, then the account. Both resolve the account BY
      // UID and re-check the namespace on the address that comes back.
      await deleteHarnessUserDoc(uid);
      await deleteHarnessUser(uid);
    } catch (err) {
      failures.push(`${uid}: ${err.message}`);
      log(`Could not tear down ${uid}: ${err.message}`);
    }
  }

  const counts = await countRows(state);
  if (failures.length > 0) {
    // Folded into the manifest so the exit code carries it.
    counts.teardownFailures = failures;
    counts.total += failures.length;
  }
  return counts;
}

export const SPEC = {
  name: "applicant-one-flow",
  specFile: "tests/e2e/applicant-one-flow.spec.mjs",
  steps: ONE_FLOW_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  /**
   * This journey reads its own mail: the confirmation link makes the account
   * usable and the university link is what lets the application send. Where
   * the mail is not caught there is no inbox to read them out of, so the
   * runner skips this spec entirely rather than driving a leg that would send
   * for real and then stall.
   */
  requiresCaughtMail: true,
  // Nobody privileged appears: the account this creates ends at role
  // `pending` with a sent application, which is where the story stops.
  needs: { admin: false },
  /**
   * Unverified: written with the feature and not yet run end to end. Until it
   * has passed once it contributes nothing to the coverage map, and the keys
   * below stay in that map's NOT_COVERED list.
   */
  status: "unverified",
  /**
   * What a green run of this spec covers, as src/app keys.
   *
   * `/api/subscriptions/sync`, `/api/admin/application-emails/send` and
   * `/api/register/profile-complete` are reached and deliberately ABSENT, for
   * the reason the sign-up spec gives: the join request calls all three fire
   * and forget and nothing this spec asserts reads their answers. The rows
   * they write are still counted and drained.
   */
  covers: {
    routes: [
      "/api/register",
      "/api/auth/session",
      "/api/register/password-set",
      "/api/verify-email/send",
      "/api/admissions/forms/[roundId]/application",
      "/api/admissions/forms/[roundId]/application/send",
    ],
    pages: ["/(public)/apply/[roundId]", "/verify-email/[tokenId]"],
  },
  seed,
  countRows,
  teardown,
};
