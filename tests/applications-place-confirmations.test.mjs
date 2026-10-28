/**
 * Confirming a place by a day, run for real.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards (`src/lib/applications/status/confirming.ts`)
 *
 *  - WITH NO DAY SET, NOTHING CHANGES. A place is presumed, the "You're in"
 *    email says nobody needs to reply, and nobody is reminded.
 *  - WITH A DAY, somebody holding a place who has not said they are coming is
 *    reminded once a day, from the day after they were told until that day,
 *    and never after their email failed to go. Saying they are coming, or
 *    having joined by accepting an invitation, ends it.
 *  - THE EMAIL SAYS THE DAY: the standard "You're in" asks them to confirm by
 *    it; a programme's own wording gets the sentence after it; the reminder
 *    is that email under one honest line.
 *  - AFTER THE DAY nothing is sent and nothing changes by itself: the People
 *    tab says who did not confirm, and how a person frees a place.
 *  - THE JOB ships switched off, takes the day before it sends, and gives it
 *    back only after a send known to have handed nothing over.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const APP_URL = "https://staging.example.com";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__pcDb ?? null; }"],
    [
      "@/lib/email/send",
      "export async function sendEmail(args) {\n" +
        "  const mail = globalThis.__pcMail;\n" +
        "  mail.calls.push(args);\n" +
        "  if (mail.verdict === 'throw') {\n" +
        "    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:587'), { code: 'ESOCKET', syscall: 'connect', command: 'CONN' });\n" +
        "  }\n" +
        "  return { messageId: 'm-' + mail.calls.length, delivered: [args.to], suppressed: [], held: [] };\n" +
        "}",
    ],
    [
      "@/lib/email/courseFacilitatorEmails",
      "export const hasOptedOutOfCourseAnnouncements = (data) =>\n" +
        "  data?.profile?.notifications?.categories?.courses === false;",
    ],
  ]),
});

const rule = await loadTs(join("lib", "applications", "status", "confirming.ts"));
const copy = await loadTs(join("lib", "applications", "decisionDay", "emailCopy.ts"));
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const { applicationPlaceConfirmationsJob: job } = await loadTs(
  join("lib", "scheduler", "jobs", "applicationPlaceConfirmations.ts"),
);
const { programmePeople } = await loadTs(join("lib", "applications", "people", "model.ts"));
const { parseFormChange } = await loadTs(join("lib", "applications", "editor", "parse.ts"));

// ---------------------------------------------------------------------------
// The term: decisions went out Fri 23 Oct; places to be confirmed by Tue 27 Oct
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const DECISION_DAY = new Date("2026-10-23T11:00:00Z");
/** Sat 24 Oct, 10:05 in London (summer time). */
const SAT = new Date("2026-10-24T09:05:00Z");
/** Tue 27 Oct, 10:05 in London (GMT since Sun 25 Oct): the day to confirm by. */
const TUE = new Date("2026-10-27T10:05:00Z");
/** Wed 28 Oct, 10:05: the day has passed. */
const WED = new Date("2026-10-28T10:05:00Z");

const programme = (name, shortName, leadUid, over = {}) => ({
  kind: "fellowship",
  name,
  shortName,
  starts: "w/c 2 Nov",
  places: 24,
  leadUid,
  reviewerUids: [],
  useScores: true,
  closed: false,
  emailWording: {},
  ...over,
});

function roundDoc(over = {}) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "deciding",
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    reviewerUids: ["zach", "claudia"],
    applicationCounts: { accepted: 2, invited: 1 },
    archived: false,
    programmeIds: [AGI, TAIS],
    programmes: {
      [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", "claudia"),
      [TAIS]: programme("Technical AI Safety Fellowship", "Technical AI Safety", "zach"),
    },
    questionSetIds: [],
    invitationReplyBy: "2026-10-25",
    placeConfirmBy: "2026-10-27",
    noOfferWording: null,
    decisionsSentAt: DECISION_DAY,
    decisionsSentByUid: "zach",
    ...over,
  };
}

const SENT = { email: "sent", emailedAt: DECISION_DAY, emailClaimedAt: null };

function applicationDoc(uid, name, kind, programmeId, over = {}) {
  const content = {
    aboutYou: { preferredName: name.split(" ")[0], subject: "BSc Physics", status: "undergraduate", expectedGraduation: "2027-07" },
    rankedProgrammeIds: [programmeId ?? AGI],
    wantsToFacilitate: false,
    answers: {},
    suMembership: "yes",
  };
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    draft: content,
    sent: content,
    status: kind,
    submittedAt: new Date("2026-10-12T09:00:00Z"),
    sentAt: new Date("2026-10-12T09:00:00Z"),
    withdrawnAt: null,
    result: { kind, programmeId, publishedAt: DECISION_DAY, ...SENT },
    invitation: null,
    attendance: null,
    confirmReminderOn: null,
    ...over,
  };
}

const path = (uid) => `admissionApplications/${ROUND}__${uid}`;

function seed(round = {}, over = {}) {
  return {
    [`admissionRounds/${ROUND}`]: roundDoc(round),
    "users/zach": { displayName: "Zach Levin", role: "admin", profile: { preferredName: "Zach" } },
    "users/claudia": { displayName: "Claudia Reyes", role: "committee", profile: { preferredName: "Claudia" } },
    "users/amara": { displayName: "Amara Okafor", role: "member", profile: { preferredName: "Amara" } },
    "users/dev": { displayName: "Dev Patel", role: "member", profile: { preferredName: "Dev" } },
    // Amara holds an AGI Strategy place and has said nothing.
    [path("amara")]: applicationDoc("amara", "Amara Okafor", "accepted", AGI),
    // Dev holds one and has said he is coming.
    [path("dev")]: applicationDoc("dev", "Dev Patel", "accepted", AGI, {
      attendance: { answer: "coming", answeredAt: new Date("2026-10-23T15:00:00Z") },
    }),
    // Wen joined by accepting an invitation, which is saying she is coming.
    [path("wen")]: applicationDoc("wen", "Wen Zhao", "accepted", TAIS, {
      result: { kind: "invited", programmeId: TAIS, publishedAt: DECISION_DAY, ...SENT },
      invitation: { programmeId: TAIS, replyBy: "2026-10-25", response: "accepted", respondedAt: SAT, lastReminderOn: null },
    }),
    ...over,
  };
}

const form = (round = {}) => normalise.normaliseForm(ROUND, roundDoc(round));
const app = (uid, over = {}, round = {}) =>
  normalise.normaliseApplication(`${ROUND}__${uid}`, seed(round)[path(uid)] ? { ...seed(round)[path(uid)], ...over } : over, form(round).round.availabilityGrid);

function run(db, now) {
  globalThis.__pcDb = db;
  return job.handler({
    now,
    budget: { remainingMs: () => 60_000, expired: () => false },
    log: () => undefined,
    policy: { reclaimAfterMinutes: 20, maxAttempts: 3 },
    maxPerTick: job.maxPerTick,
    maxLateHours: job.maxLateHours,
  });
}

beforeEach(() => {
  globalThis.__pcMail = { calls: [], verdict: null };
  globalThis.__pcDb = null;
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

// ---------------------------------------------------------------------------
// 1. Who is reminded
// ---------------------------------------------------------------------------

describe("who is reminded to confirm a place", () => {
  test("somebody holding a place who has said nothing is due one the day after they were told", () => {
    const check = rule.confirmationReminderDue(form(), app("amara"), SAT);
    assert.deepEqual(check, { due: true, programmeId: AGI, confirmBy: "2026-10-27", lastDay: false, today: "2026-10-24" });
  });

  test("on the day itself it is the last one, and after it there are none", () => {
    assert.equal(rule.confirmationReminderDue(form(), app("amara"), TUE).lastDay, true);
    assert.deepEqual(rule.confirmationReminderDue(form(), app("amara"), WED), { due: false, why: "past-confirm-by" });
  });

  test("nobody is reminded on the day they were told, or on a form with no day to confirm by", () => {
    assert.deepEqual(rule.confirmationReminderDue(form(), app("amara"), DECISION_DAY), { due: false, why: "told-today" });
    assert.deepEqual(rule.confirmationReminderDue(form({ placeConfirmBy: null }), app("amara"), SAT), { due: false, why: "not-asked" });
  });

  test("saying they are coming, or having accepted an invitation, ends it", () => {
    assert.deepEqual(rule.confirmationReminderDue(form(), app("dev"), SAT), { due: false, why: "confirmed" });
    assert.deepEqual(rule.confirmationReminderDue(form(), app("wen"), SAT), { due: false, why: "confirmed" });
  });

  test("one a day, and never after an email that did not go", () => {
    assert.deepEqual(rule.confirmationReminderDue(form(), app("amara", { confirmReminderOn: "2026-10-24" }), SAT), {
      due: false,
      why: "reminded-today",
    });
    const owed = app("amara", { result: { kind: "accepted", programmeId: AGI, publishedAt: DECISION_DAY, email: "owed", emailedAt: null, emailClaimedAt: null } });
    assert.equal(rule.confirmationReminderDue(form(), owed, SAT).due, false);
  });

  test("a form asks only once its decisions are sent, and not once archived or cancelled", () => {
    assert.equal(rule.formAsksToConfirm(form(), SAT), true);
    assert.equal(rule.formAsksToConfirm(form({ decisionsSentAt: null }), SAT), false);
    assert.equal(rule.formAsksToConfirm(form({ archived: true }), SAT), false);
    assert.equal(rule.formAsksToConfirm(form({ placeConfirmBy: null }), SAT), false);
  });

  test("where somebody stands, for the screens", () => {
    assert.deepEqual(rule.confirmStandingOf(form(), app("amara"), SAT), { kind: "asked", confirmBy: "2026-10-27" });
    assert.deepEqual(rule.confirmStandingOf(form(), app("amara"), WED), { kind: "overdue", confirmBy: "2026-10-27" });
    assert.deepEqual(rule.confirmStandingOf(form(), app("dev"), WED), { kind: "confirmed" });
    assert.deepEqual(rule.confirmStandingOf(form({ placeConfirmBy: null }), app("amara"), WED), { kind: "presumed" });
  });
});

// ---------------------------------------------------------------------------
// 2. What the emails say
// ---------------------------------------------------------------------------

const input = (over = {}, round = {}) => ({
  outcome: { kind: "accepted", programmeId: AGI },
  firstName: "Amara",
  form: form(round),
  ranked: [AGI],
  leadNames: { [AGI]: "Claudia", [TAIS]: "Zach" },
  replyBy: "Sun 25 Oct",
  links: { application: `${APP_URL}/applications/x/status`, events: `${APP_URL}/events` },
  ...over,
});

describe("what the emails say", () => {
  test("with no day, the You're in email still says nobody needs to reply", () => {
    const email = copy.composeDecisionEmail(input());
    assert.match(email.paragraphs[1], /^You don’t need to reply\./);
  });

  test("with a day, it asks them to confirm by it instead", () => {
    const email = copy.composeDecisionEmail(input({ confirmBy: "Tue 27 Oct" }));
    assert.equal(
      email.paragraphs[1],
      "Please confirm your place by Tue 27 Oct: tap “I’m coming”. If you can’t make it, tell us and we’ll give your place to someone else.",
    );
    assert.equal(email.paragraphs.length, 2);
  });

  test("a programme's own wording is kept, with the sentence after it", () => {
    const own = { programmes: { ...roundDoc().programmes, [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", "claudia", { emailWording: { accepted: { subject: "", body: "<p>Welcome aboard.</p>" } } }) } };
    const email = copy.composeDecisionEmail(input({ confirmBy: "Tue 27 Oct" }, own));
    assert.equal(email.paragraphs.at(-1), "Please confirm your place by Tue 27 Oct: tap “I’m coming”.");
  });

  test("the reminder is that email under one honest line", () => {
    const reminder = copy.composeConfirmReminder(input(), { confirmBy: "Tue 27 Oct", lastDay: false });
    assert.match(reminder.subject, /^Please confirm your place: /);
    assert.equal(reminder.paragraphs[0], "This is a reminder. You haven’t confirmed your place yet, and it’s to be confirmed by Tue 27 Oct.");
    assert.match(reminder.paragraphs.at(-1), /Please confirm your place by Tue 27 Oct/);
    const last = copy.composeConfirmReminder(input(), { confirmBy: "Tue 27 Oct", lastDay: true });
    assert.equal(last.paragraphs[0], "This is a reminder. You haven’t confirmed your place yet, and today, Tue 27 Oct, is the last day to confirm it.");
  });
});

// ---------------------------------------------------------------------------
// 3. The job
// ---------------------------------------------------------------------------

describe("the job", () => {
  test("ships switched off, under an id of its own", () => {
    assert.equal(job.id, "application-place-confirmations");
    assert.equal(job.id, rule.PLACE_CONFIRMATIONS_JOB_ID);
    assert.equal(job.enabledByDefault, false);
  });

  test("the day after decision day: one reminder, to the one person who has said nothing, and the day is taken", async () => {
    const db = makeDb(seed(), { now: SAT });
    const result = await run(db, SAT);
    assert.equal(result.processed, 1, result.note);
    assert.deepEqual(globalThis.__pcMail.calls.map((call) => call.to), ["amara@example.com"]);
    assert.match(globalThis.__pcMail.calls[0].subject, /^Please confirm your place: /);
    assert.equal(db.read(path("amara")).confirmReminderOn, "2026-10-24");
    // A second run the same day sends nothing more.
    await run(db, SAT);
    assert.equal(globalThis.__pcMail.calls.length, 1);
  });

  test("nothing on a form with no day to confirm by, after the day, or to somebody who switched course emails off", async () => {
    for (const [round, now] of [[{ placeConfirmBy: null }, SAT], [{}, WED]]) {
      globalThis.__pcMail.calls = [];
      await run(makeDb(seed(round), { now }), now);
      assert.equal(globalThis.__pcMail.calls.length, 0, JSON.stringify(round));
    }
    const off = seed({}, { "users/amara": { displayName: "Amara Okafor", role: "member", profile: { notifications: { categories: { courses: false } } } } });
    const db = makeDb(off, { now: SAT });
    await run(db, SAT);
    assert.equal(globalThis.__pcMail.calls.length, 0);
    assert.equal(db.read(path("amara")).confirmReminderOn, null, "a day was taken for nobody");
  });

  test("a send known to have handed nothing over gives the day back", async () => {
    globalThis.__pcMail.verdict = "throw";
    const db = makeDb(seed(), { now: SAT });
    await run(db, SAT);
    assert.equal(db.read(path("amara")).confirmReminderOn, null);
  });
});

// ---------------------------------------------------------------------------
// 4. After the day: the People tab, and the form editor
// ---------------------------------------------------------------------------

describe("after the day, a person decides", () => {
  const people = (now, round = {}) =>
    programmePeople({
      form: form(round),
      programmeId: AGI,
      applications: ["amara", "dev"].map((uid) => app(uid, {}, round)),
      // Each holds their place by AGI Strategy's Accept.
      decisions: new Map(
        ["amara", "dev"].map((uid) => [
          uid,
          {
            roundId: ROUND,
            uid,
            programmes: {
              [AGI]: { decision: "accept", poolReason: null, couldSuitProgrammeId: null, decidedByUid: "claudia", decidedAt: DECISION_DAY },
            },
          },
        ]),
      ),
      viewer: { uid: "zach", canRead: () => true },
      groups: [],
      seats: new Map(),
      programmePath: "/admin/x",
      runNamed: true,
      today: now,
    });

  test("before it: Not yet, and a line saying who has not confirmed", () => {
    const model = people("2026-10-26");
    assert.deepEqual(model.rows.find((row) => row.uid === "amara").coming, { kind: "not-yet" });
    assert.equal(model.confirm.overdue, false);
    assert.match(model.confirm.sentence, /^1 person hasn’t confirmed their place yet\./);
  });

  test("after it: Not confirmed, still theirs, and how to free a place", () => {
    const model = people("2026-10-28");
    assert.deepEqual(model.rows.find((row) => row.uid === "amara").coming, { kind: "not-confirmed", by: "Tue 27 Oct" });
    assert.equal(model.confirm.overdue, true);
    assert.match(model.confirm.sentence, /didn’t confirm by Tue 27 Oct\. Their places are still theirs\./);
    assert.match(model.confirm.sentence, /Remove/);
  });

  test("with no day set, nothing about confirming at all", () => {
    const model = people("2026-10-28", { placeConfirmBy: null });
    assert.equal(model.confirm, null);
    assert.deepEqual(model.rows.find((row) => row.uid === "amara").coming, { kind: "not-yet" });
  });

  test("the form editor takes the day, or clears it", () => {
    assert.deepEqual(parseFormChange({ confirmBy: "2026-10-27" }), { ok: true, value: { placeConfirmBy: "2026-10-27" } });
    assert.deepEqual(parseFormChange({ confirmBy: null }), { ok: true, value: { placeConfirmBy: null } });
    assert.equal(parseFormChange({ confirmBy: "next week" }).ok, false);
  });
});
