/**
 * The daily reminder for an invitation nobody has answered: the rule, the
 * words, and the scheduled job, EXECUTED against an in-memory Firestore and a
 * mail door that records.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * Somebody invited on decision day accepts by a reply-by day, and is reminded
 * once a day until they reply. A reminder is an email to a person about a
 * decision, so everything it could get wrong is run here:
 *
 *  1. WHO AND WHEN (`decisionDay/reminders.ts`): nobody before decisions were
 *     sent, nobody on the day they were told, nobody after they reply or after
 *     their reply-by day, nobody whose application is withdrawn, nobody twice
 *     in one London day, and nothing outside the hours a reminder is welcome.
 *  2. THE WORDS (`composeInvitationReminder`): the invitation again, word for
 *     word, under one line that says it is a reminder and when the reply is
 *     due.
 *  3. THE JOB: the day is taken on the invitation BEFORE the email, in a
 *     transaction that checks the whole rule on a fresh read, so two runs at
 *     once send one reminder and a reply that landed a moment ago stops it. A
 *     send known to have handed nothing over gives the day back; one nobody
 *     can vouch for keeps it. It writes one field and nothing else.
 *  4. IT SHIPS SWITCHED OFF, and the decision-day page promises a reminder
 *     only while a scheduled run has actually run it (`decisionDay/armed.ts`).
 *
 * Real: the job's handler, the rule, the composer, the mail door wrapper and
 * the invitation template (what was handed to the door is rendered and read),
 * the course-email preference reader, and every pure module beneath them.
 * Faked: `server-only`, the `firebase-admin/firestore` sentinels, the Admin
 * SDK handle and `sendEmail`, which records what it was asked to send and
 * answers as the test tells it to. No message can leave this process.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const APP_URL = "https://staging.example.com";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      // Reached only through the reply route's writer, whose refusal carries a
      // response. The job itself answers no request.
      "next/server",
      "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
    ],
    [
      "firebase-admin/firestore",
      "export const FieldValue = {\n" +
        "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
        "  increment: (by) => ({ __op: 'increment', by }),\n" +
        "};\n" +
        "export class FieldPath { constructor(...segments) { this.segments = segments; } }\n" +
        "export class Timestamp { static fromDate(d) { return d; } static now() { return new Date(); } }",
    ],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__rmDb ?? null; }"],
    [
      // The one mail door. It records every message and answers as the test says.
      "@/lib/email/send",
      "export async function sendEmail(args) {\n" +
        "  const mail = globalThis.__rmMail;\n" +
        "  mail.calls.push(args);\n" +
        "  const verdict = mail.verdict ? await mail.verdict(args, mail.calls.length) : 'sent';\n" +
        "  if (verdict === 'throw') {\n" +
        "    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:587'), {\n" +
        "      code: 'ESOCKET', syscall: 'connect', command: 'CONN',\n" +
        "    });\n" +
        "  }\n" +
        "  if (verdict === 'cut-off') {\n" +
        "    throw Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT', command: 'CONN' });\n" +
        "  }\n" +
        "  return {\n" +
        "    messageId: verdict === 'sent' ? 'm-' + mail.calls.length : '',\n" +
        "    delivered: verdict === 'sent' ? [args.to] : [],\n" +
        "    suppressed: verdict === 'suppressed' ? [args.to] : [],\n" +
        "    held: verdict === 'held' ? [args.to] : [],\n" +
        "  };\n" +
        "}",
    ],
    [
      // The courses row, read the way the real helper reads it: only an
      // explicit "off" is a refusal. The real module's graph is the whole
      // facilitator mailer, which this suite has no other use for.
      "@/lib/email/courseFacilitatorEmails",
      "export const hasOptedOutOfCourseAnnouncements = (data) =>\n" +
        "  data?.profile?.notifications?.categories?.courses === false;",
    ],
  ]),
});

const at = (file) => join("lib", "applications", "decisionDay", file);
const rule = await loadTs(at("reminders.ts"));
const copy = await loadTs(at("emailCopy.ts"));
const armed = await loadTs(at("armed.ts"));
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const words = await loadTs(join("lib", "applications", "words.ts"));
const runs = await loadTs(join("lib", "firestore", "schedulerRuns.ts"));
const { applicationInvitationRemindersJob: job } = await loadTs(
  join("lib", "scheduler", "jobs", "applicationInvitationReminders.ts"),
);
const { default: InvitationEmail } = await loadTs(join("emails", "ApplicationInvitationEmail.tsx"));
/** The reply route's own writer and loader, for the cases that make a real reply. */
const record = await loadTs(join("lib", "applications", "status", "record.ts"));
const repo = await loadTs(join("lib", "applications", "repo.ts"));

// ---------------------------------------------------------------------------
// The term: decisions went out on Fri 23 Oct, invitations are due Sun 25 Oct
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";

/** Fri 23 Oct 2026, midday in London: decision day. */
const DECISION_DAY = new Date("2026-10-23T11:00:00Z");
/** Sat 24 Oct, 09:59 in London (still summer time): a minute early. */
const SAT_EARLY = new Date("2026-10-24T08:59:00Z");
/** Sat 24 Oct, 10:05 in London. */
const SAT = new Date("2026-10-24T09:05:00Z");
/** Sat 24 Oct, 18:01 in London: too late in the day. */
const SAT_LATE = new Date("2026-10-24T17:01:00Z");
/** Sun 25 Oct, 10:05 in London. The clocks went back overnight, so that is 10:05 UTC. */
const SUN = new Date("2026-10-25T10:05:00Z");
/** Mon 26 Oct, 10:05 in London: the reply-by day has passed. */
const MON = new Date("2026-10-26T10:05:00Z");

const programme = (name, shortName, leadUid, over = {}) => ({
  kind: "fellowship",
  name,
  shortName,
  starts: "w/c 26 Oct",
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
    applicationCounts: { accepted: 1, invited: 1, "no-offer": 1, declined: 1 },
    archived: false,
    programmeIds: [AGI, TAIS, INC],
    programmes: {
      [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", "claudia"),
      [TAIS]: programme("Technical AI Safety Fellowship", "Technical AI Safety", "zach"),
      [INC]: programme("Research incubator", "Research incubator", "zach", { kind: "incubator" }),
    },
    questionSetIds: [],
    invitationReplyBy: "2026-10-25",
    noOfferWording: null,
    decisionsSentAt: DECISION_DAY,
    decisionsSentByUid: "zach",
    ...over,
  };
}

const SENT = { email: "sent", emailedAt: DECISION_DAY, emailClaimedAt: null };

function applicationDoc(uid, name, ranked, kind, programmeId, over = {}) {
  const content = {
    aboutYou: { preferredName: name.split(" ")[0], subject: "BSc Physics", status: "undergraduate", expectedGraduation: "2027-07" },
    rankedProgrammeIds: ranked,
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
    invitation:
      kind === "invited"
        ? { programmeId, replyBy: "2026-10-25", response: null, respondedAt: null, lastReminderOn: null }
        : null,
    attendance: null,
    ...over,
  };
}

/** Oliver's application with pieces of it changed: `result` and `invitation` are merged, not replaced. */
function oliver(over = {}) {
  const base = applicationDoc("oliver", "Oliver Grant", [INC], "invited", TAIS);
  return {
    ...base,
    ...over,
    result: over.result === null ? null : { ...base.result, ...(over.result ?? {}) },
    invitation: over.invitation === null ? null : { ...base.invitation, ...(over.invitation ?? {}) },
  };
}

const userDoc = (name, role, profile = {}) => ({
  displayName: name,
  role,
  profile: { preferredName: name.split(" ")[0], ...profile },
});

const OLIVER = `admissionApplications/${ROUND}__oliver`;

function seed(over = {}) {
  return {
    [`admissionRounds/${ROUND}`]: roundDoc(),
    "users/zach": userDoc("Zach Levin", "admin"),
    "users/claudia": userDoc("Claudia Reyes", "committee"),
    "users/oliver": userDoc("Oliver Grant", "member"),
    [OLIVER]: oliver(),
    [`admissionApplications/${ROUND}__amara`]: applicationDoc("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI),
    [`admissionApplications/${ROUND}__nina`]: applicationDoc("nina", "Nina Petrova", [AGI], "no-offer", null),
    [`admissionApplications/${ROUND}__zara`]: applicationDoc("zara", "Zara Ahmed", [AGI], "declined", null, {
      result: { kind: "declined", programmeId: null, publishedAt: DECISION_DAY, email: "not-sent", emailedAt: null, emailClaimedAt: null },
    }),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// A Firestore small enough to read, whose transactions conflict like the real one
// ---------------------------------------------------------------------------

function makeDb(initial) {
  const docs = new Map(Object.entries(initial).map(([path, data]) => [path, structuredClone(data)]));
  const versions = new Map();
  const counters = { reads: 0, writes: 0 };
  let reruns = 0;
  /** Called with a path just before it is read outside a transaction. */
  let beforeGet = null;
  let failing = null;

  const written = (path) => versions.set(path, (versions.get(path) ?? 0) + 1);
  const snap = (path) => {
    counters.reads += 1;
    return {
      exists: docs.has(path),
      id: path.split("/").pop(),
      data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
    };
  };
  const apply = (op) => {
    counters.writes += 1;
    written(op.path);
    if (!docs.has(op.path)) throw new Error(`NOT_FOUND: ${op.path}`);
    const next = structuredClone(docs.get(op.path));
    for (const [field, value] of Object.entries(op.data)) {
      const parts = field.split(".");
      let node = next;
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      const last = parts[parts.length - 1];
      node[last] = resolved(node[last], value);
    }
    docs.set(op.path, next);
  };
  /**
   * The two things a real write leaves for the server to fill in: the time,
   * and a counter moved by an amount. The job writes neither. The reply
   * route's own writer does, and it is run against this store below.
   */
  function resolved(current, value) {
    if (value && typeof value === "object" && value.__op === "serverTimestamp") return new Date(SERVER_TIME);
    if (value && typeof value === "object" && value.__op === "increment") return (current ?? 0) + value.by;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, resolved(undefined, inner)]));
    }
    return value;
  }
  const ref = (path) => ({
    id: path.split("/").pop(),
    path,
    get: async () => {
      if (failing && failing(path)) throw new Error(`UNAVAILABLE: ${path}`);
      if (beforeGet) beforeGet(path);
      return snap(path);
    },
  });

  return {
    counters,
    reruns: () => reruns,
    collection(name) {
      return {
        doc: (id) => ref(`${name}/${id}`),
        where: (field, _op, value) => ({
          get: async () => {
            if (failing && failing(`${name}?${field}`)) throw new Error(`UNAVAILABLE: ${name}`);
            return {
              docs: [...docs.entries()]
                .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
                .map(([path]) => snap(path)),
            };
          },
        }),
      };
    },
    getAll: async (...refs) => {
      if (failing && refs.some((r) => failing(r.path))) throw new Error("UNAVAILABLE");
      return refs.map((r) => snap(r.path));
    },
    async runTransaction(fn) {
      for (let attempt = 1; ; attempt += 1) {
        const ops = [];
        const seen = new Map();
        const read = (r) => {
          if (!seen.has(r.path)) seen.set(r.path, versions.get(r.path) ?? 0);
          return snap(r.path);
        };
        const result = await fn({
          get: async (r) => read(r),
          update: (r, data) => ops.push({ path: r.path, data }),
        });
        // Something this transaction read was written first: run it again
        // from the top, as Firestore does.
        if ([...seen].some(([path, version]) => (versions.get(path) ?? 0) !== version)) {
          if (attempt >= 5) throw new Error("ABORTED: too much contention");
          reruns += 1;
          continue;
        }
        ops.forEach(apply);
        return result;
      }
    },
    read: (path) => docs.get(path),
    patch: (path, change) => {
      written(path);
      docs.set(path, { ...docs.get(path), ...change });
    },
    put: (path, data) => {
      written(path);
      docs.set(path, structuredClone(data));
    },
    onGet: (hook) => {
      beforeGet = hook;
    },
    failReads: (when) => {
      failing = when;
    },
  };
}

/** What the store writes for "now": Sat 24 Oct, mid-afternoon in London. */
const SERVER_TIME = new Date("2026-10-24T14:00:00Z");

const mailTo = (address) => globalThis.__rmMail.calls.filter((call) => call.to === address);
const lastReminder = (db, uid = "oliver") => db.read(`admissionApplications/${ROUND}__${uid}`).invitation.lastReminderOn;

/** One run of the job at `now`, the way the scheduler calls it. */
function run(db, now, over = {}) {
  globalThis.__rmDb = db;
  const logged = [];
  return job
    .handler({
      now,
      budget: { remainingMs: () => 60_000, expired: () => false },
      log: (message, extra) => logged.push([message, extra]),
      policy: { reclaimAfterMinutes: 20, maxAttempts: 3 },
      maxPerTick: job.maxPerTick,
      maxLateHours: job.maxLateHours,
      ...over,
    })
    .then((result) => ({ ...result, logged }));
}

beforeEach(() => {
  globalThis.__rmMail = { calls: [], verdict: null };
  globalThis.__rmDb = null;
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

// ---------------------------------------------------------------------------
// 1. Who is due a reminder, and when
// ---------------------------------------------------------------------------

describe("who is reminded about an invitation", () => {
  const read = (doc) => normalise.normaliseApplication(`${ROUND}__oliver`, doc);
  const due = (over, now = SAT) => rule.invitationReminderDue(read(oliver(over)), now);

  test("somebody invited yesterday who has not replied is due one today", () => {
    assert.deepEqual(due({}), {
      due: true,
      programmeId: TAIS,
      replyBy: "2026-10-25",
      lastDay: false,
      today: "2026-10-24",
    });
  });

  test("on their reply-by day it is the last one, and the day after there is none", () => {
    assert.deepEqual(due({}, SUN), { due: true, programmeId: TAIS, replyBy: "2026-10-25", lastDay: true, today: "2026-10-25" });
    assert.deepEqual(due({}, MON), { due: false, why: "past-reply-by" });
    // The reply-by day is theirs, not the form's: a later day of their own is kept.
    assert.equal(due({ invitation: { replyBy: "2026-10-27" } }, MON).due, true);
  });

  test("nobody is reminded on the day they were told", () => {
    assert.deepEqual(due({}, DECISION_DAY), { due: false, why: "told-today" });
    // Told at 23:30 London on the Friday: Saturday is the next day, whatever the gap in hours.
    assert.equal(due({ result: { publishedAt: new Date("2026-10-23T22:30:00Z") } }, SAT).due, true);
    // Told just after midnight London on the Saturday: not that Saturday.
    assert.deepEqual(due({ result: { publishedAt: new Date("2026-10-23T23:30:00Z") } }, SAT), { due: false, why: "told-today" });
    // A result with no day on it cannot be shown to be older than today.
    assert.deepEqual(due({ result: { publishedAt: null } }, SAT), { due: false, why: "told-today" });
  });

  test("a reply of either kind ends the reminders", () => {
    for (const response of ["accepted", "declined"]) {
      assert.deepEqual(due({ invitation: { response, respondedAt: SAT_EARLY } }), { due: false, why: "replied" });
    }
  });

  test("a withdrawn application, or one never sent, is not reminded", () => {
    assert.deepEqual(due({ status: "withdrawn", withdrawnAt: SAT_EARLY }), { due: false, why: "not-in-term" });
    assert.deepEqual(due({ sent: null }), { due: false, why: "not-in-term" });
  });

  test("only somebody whose result and status both say invited, with an invitation on file", () => {
    assert.deepEqual(due({ status: "accepted" }), { due: false, why: "not-invited" });
    assert.deepEqual(due({ status: "submitted" }), { due: false, why: "not-invited" });
    assert.deepEqual(due({ invitation: null }), { due: false, why: "not-invited" });
    assert.deepEqual(due({ result: null }), { due: false, why: "not-invited" });
    assert.deepEqual(due({ result: { kind: "no-offer", programmeId: null } }), { due: false, why: "not-invited" });
  });

  test("one a day: somebody reminded today is not due again, and is due again tomorrow", () => {
    assert.deepEqual(due({ invitation: { lastReminderOn: "2026-10-24" } }), { due: false, why: "reminded-today" });
    assert.equal(due({ invitation: { lastReminderOn: "2026-10-24" } }, SUN).due, true);
    // A day ahead of today (a clock that moved) is not a licence to send.
    assert.deepEqual(due({ invitation: { lastReminderOn: "2026-10-25" } }), { due: false, why: "reminded-today" });
  });

  test("the reminder follows an invitation that went, never one still owed, held or refused", () => {
    const withEmail = (email, emailClaimedAt = null) => due({ result: { email, emailClaimedAt } });
    assert.equal(withEmail("sent").due, true);
    // Nobody can say whether it went: the reminder carries the whole invitation.
    assert.equal(withEmail("unconfirmed").due, true);
    for (const state of ["owed", "held", "suppressed", "not-sent"]) {
      assert.deepEqual(withEmail(state), { due: false, why: "email-not-sent" }, state);
    }
    // A press is sending it at this moment.
    assert.deepEqual(withEmail("sending", new Date(SAT.getTime() - 60_000)), { due: false, why: "email-not-sent" });
    // A press took it up long ago and never said: unconfirmed, so reminded.
    assert.equal(withEmail("sending", DECISION_DAY).due, true);
  });

  test("a day's reminders go from 10:00 in London, and not late in the day", () => {
    assert.equal(rule.REMINDER_TIME, "10:00");
    assert.equal(rule.reminderWindow(SAT_EARLY, 8), "before");
    assert.equal(rule.reminderWindow(new Date("2026-10-24T09:00:00Z"), 8), "open");
    assert.equal(rule.reminderWindow(SAT, 8), "open");
    assert.equal(rule.reminderWindow(new Date("2026-10-24T17:00:00Z"), 8), "open", "18:00 exactly is the last moment");
    assert.equal(rule.reminderWindow(SAT_LATE, 8), "after");
    // The day the clocks go back, 10:00 in London is 10:00 UTC, not 09:00.
    assert.equal(rule.reminderWindow(new Date("2026-10-25T09:30:00Z"), 8), "before");
    assert.equal(rule.reminderWindow(SUN, 8), "open");
    // Just after midnight is a new London day, and far too early.
    assert.equal(rule.reminderWindow(new Date("2026-10-24T23:10:00Z"), 8), "before");
  });

  test("a form reminds only once its decisions are sent, and not once archived, cancelled or long over", () => {
    const form = (over) => normalise.normaliseForm(ROUND, roundDoc(over));
    assert.equal(rule.formRemindsInvitations(form({}), SAT), true);
    assert.equal(rule.formRemindsInvitations(form({ decisionsSentAt: null }), SAT), false);
    assert.equal(rule.formRemindsInvitations(form({ archived: true }), SAT), false);
    assert.equal(rule.formRemindsInvitations(form({ status: "cancelled" }), SAT), false);
    assert.equal(rule.REMINDER_SCAN_DAYS, 60);
    assert.equal(rule.formRemindsInvitations(form({}), new Date("2026-12-22T10:05:00Z")), true);
    assert.equal(rule.formRemindsInvitations(form({}), new Date("2026-12-23T12:05:00Z")), false);
  });
});

// ---------------------------------------------------------------------------
// 2. The words
// ---------------------------------------------------------------------------

describe("the reminder is the invitation again, under one honest line", () => {
  const form = normalise.normaliseForm(ROUND, roundDoc());
  const input = (over = {}) => ({
    outcome: { kind: "invited", programmeId: TAIS },
    firstName: "Oliver",
    form,
    ranked: [INC],
    leadNames: { [AGI]: "Claudia", [TAIS]: "Zach", [INC]: "Zach" },
    replyBy: "Sun 25 Oct",
    links: { application: `${APP_URL}/applications/${ROUND}`, events: `${APP_URL}/events` },
    ...over,
  });
  const invitation = copy.composeDecisionEmail(input());

  test("the subject says it is a reminder, and everything after the first line is the invitation", () => {
    const reminder = copy.composeInvitationReminder(input(), { replyBy: "Sun 25 Oct", lastDay: false });
    assert.equal(reminder.subject, "Reminder: An invitation to Technical AI Safety");
    assert.equal(reminder.kind, "invitation");
    assert.equal(reminder.greeting, "Hi Oliver,");
    assert.deepEqual(reminder.paragraphs, [
      "This is a reminder. We haven’t had your reply yet, and it’s due by Sun 25 Oct.",
      ...invitation.paragraphs,
    ]);
    assert.deepEqual(reminder.buttons, invitation.buttons);
    assert.deepEqual(reminder.signOff, { name: "Zach", role: "Technical AI Safety lead, NAISI" });
    assert.deepEqual(reminder.buttons.map((button) => button.label), ["Accept your invitation", "No thanks"]);
  });

  test("on the reply-by day it says the reply is due today", () => {
    const reminder = copy.composeInvitationReminder(input(), { replyBy: "Sun 25 Oct", lastDay: true });
    assert.equal(reminder.paragraphs[0], "This is a reminder. We haven’t had your reply yet, and it’s due today, Sun 25 Oct.");
  });

  test("the person's own reply-by day is the one it names, in the line and in the invitation's words", () => {
    const reminder = copy.composeInvitationReminder(input({ replyBy: "Sun 25 Oct" }), { replyBy: "Tue 27 Oct", lastDay: false });
    assert.ok(reminder.paragraphs[0].endsWith("due by Tue 27 Oct."));
    assert.ok(reminder.paragraphs.some((p) => p.includes("Accept your invitation by Tue 27 Oct")));
    assert.ok(!reminder.paragraphs.join(" ").includes("25 Oct"));
  });

  test("a programme's own invitation wording is kept, under the same first line", () => {
    const own = normalise.normaliseForm(
      ROUND,
      roundDoc({
        programmes: {
          ...roundDoc().programmes,
          [TAIS]: programme("Technical AI Safety Fellowship", "Technical AI Safety", "zach", {
            emailWording: { invitation: { subject: "A place for you", body: "We would love to have you.\n\nSay yes on the site." } },
          }),
        },
      }),
    );
    const reminder = copy.composeInvitationReminder(input({ form: own }), { replyBy: "Sun 25 Oct", lastDay: false });
    assert.equal(reminder.subject, "Reminder: A place for you");
    assert.deepEqual(reminder.paragraphs, [
      "This is a reminder. We haven’t had your reply yet, and it’s due by Sun 25 Oct.",
      "We would love to have you.",
      "Say yes on the site.",
    ]);
  });

  test("a programme that has left the form has no reminder", () => {
    const gone = input({ outcome: { kind: "invited", programmeId: "a-programme-that-left" } });
    assert.equal(copy.composeInvitationReminder(gone, { replyBy: "Sun 25 Oct", lastDay: false }), null);
  });

  test("it never uses a word an applicant must not read", async () => {
    const reminder = copy.composeInvitationReminder(input(), { replyBy: "Sun 25 Oct", lastDay: true });
    const text = (await render(InvitationEmail({ email: reminder }), { plainText: true })).toLowerCase();
    for (const word of words.WORDS_APPLICANTS_NEVER_SEE) {
      assert.ok(!text.includes(word.toLowerCase()), `the reminder says "${word}"`);
    }
    assert.ok(text.includes("this is a reminder."));
  });
});

// ---------------------------------------------------------------------------
// 3. The job
// ---------------------------------------------------------------------------

describe("the job ships switched off, under an id that is its own", () => {
  test("it emails people, so no stored switch means off", () => {
    assert.equal(job.enabledByDefault, false);
    assert.equal(job.id, "application-invitation-reminders");
    assert.equal(job.id, rule.INVITATION_REMINDERS_JOB_ID);
    assert.equal(job.label, "Invitation reminders");
    assert.ok(job.description.length > 40);
    assert.deepEqual([job.maxPerTick, job.maxLateHours], [100, 8]);
    assert.equal(typeof job.handler, "function");
  });
});

describe("a run on the day after decision day", () => {
  test("the invited person who has not replied gets one reminder, and nobody else gets anything", async () => {
    const db = makeDb(seed());
    const before = structuredClone(db.read(OLIVER));
    const result = await run(db, SAT);
    assert.deepEqual([result.processed, result.hasMore, result.note], [1, false, "1 sent"]);

    const { calls } = globalThis.__rmMail;
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.deepEqual(
      [call.to, call.subject, call.replyTo, call.kind, call.referenceId, call.actorUid],
      ["oliver@example.com", "Reminder: An invitation to Technical AI Safety", "ai-safety@uonsu.com", "admissions", ROUND, undefined],
    );
    assert.equal(call.listUnsubscribe, undefined);
    const text = await render(call.react, { plainText: true });
    assert.ok(text.includes("Hi Oliver,"));
    assert.ok(text.includes("This is a reminder. We haven’t had your reply yet, and it’s due by Sun 25 Oct."));
    assert.ok(text.includes("Thanks for applying to the Research incubator."));
    assert.ok(text.includes("Accept your invitation by Sun 25 Oct to let us know you’re coming."));
    const html = await render(call.react);
    assert.equal(html.split(`href="${APP_URL}/applications/${ROUND}"`).length - 1, 2, "both buttons open their application");

    // One field moved on his document, and nothing else on it or anywhere.
    assert.deepEqual(db.read(OLIVER), { ...before, invitation: { ...before.invitation, lastReminderOn: "2026-10-24" } });
    assert.equal(db.counters.writes, 1);
  });

  test("a second run the same day sends nothing more", async () => {
    const db = makeDb(seed());
    await run(db, SAT);
    for (const later of [new Date("2026-10-24T09:20:00Z"), new Date("2026-10-24T16:50:00Z")]) {
      const again = await run(db, later);
      assert.deepEqual([again.processed, again.note], [0, "0 sent"]);
    }
    assert.equal(globalThis.__rmMail.calls.length, 1);
    assert.equal(db.counters.writes, 1);
  });

  test("the next day is the reply-by day: one more, saying it is due today, and then no more", async () => {
    const db = makeDb(seed());
    await run(db, SAT);
    await run(db, SUN);
    assert.equal(lastReminder(db), "2026-10-25");
    assert.equal(globalThis.__rmMail.calls.length, 2);
    const text = await render(globalThis.__rmMail.calls[1].react, { plainText: true });
    assert.ok(text.includes("This is a reminder. We haven’t had your reply yet, and it’s due today, Sun 25 Oct."));
    for (const later of [MON, new Date("2026-10-27T10:05:00Z"), new Date("2026-11-20T10:05:00Z")]) {
      assert.equal((await run(db, later)).processed, 0);
    }
    assert.equal(globalThis.__rmMail.calls.length, 2);
  });
});

describe("a run sends nothing", () => {
  const silent = async (db, now = SAT, note) => {
    const writes = db.counters.writes;
    const result = await run(db, now);
    assert.equal(result.processed, 0);
    if (note !== undefined) assert.equal(result.note, note);
    assert.deepEqual(globalThis.__rmMail.calls, []);
    assert.equal(db.counters.writes, writes, "and writes nothing");
    return result;
  };

  test("before 10:00 in London, and after 18:00, and it reads nothing to find that out", async () => {
    const db = makeDb(seed());
    await silent(db, SAT_EARLY, "before today's reminder time");
    await silent(db, SAT_LATE, "past today's reminder time");
    await silent(db, new Date("2026-10-24T23:10:00Z"), "before today's reminder time");
    assert.equal(db.counters.reads, 0);
  });

  test("on decision day itself", async () => {
    await silent(makeDb(seed()), DECISION_DAY);
  });

  test("before decisions have been sent, even to somebody already holding an invitation", async () => {
    // A press told Oliver and then stopped: the form is not stamped yet.
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: null, decisionsSentByUid: null }) }));
    await silent(db);
    await silent(db, SUN);
  });

  test("from a form that is archived or cancelled", async () => {
    await silent(makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ archived: true }) })));
    await silent(makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ status: "cancelled" }) })));
  });

  test("to somebody who has replied, either way", async () => {
    for (const response of ["accepted", "declined"]) {
      await silent(makeDb(seed({ [OLIVER]: oliver({ invitation: { response, respondedAt: SAT_EARLY } }) })));
    }
  });

  test("to a withdrawn application", async () => {
    await silent(makeDb(seed({ [OLIVER]: oliver({ status: "withdrawn", withdrawnAt: SAT_EARLY }) })));
  });

  test("after the reply-by day", async () => {
    await silent(makeDb(seed()), MON);
  });

  test("to somebody whose invitation email is still owed, held, refused or being sent", async () => {
    for (const email of ["owed", "held", "suppressed"]) {
      await silent(makeDb(seed({ [OLIVER]: oliver({ result: { email } }) })));
    }
    const sending = { email: "sending", emailClaimedAt: new Date(SAT.getTime() - 60_000) };
    await silent(makeDb(seed({ [OLIVER]: oliver({ result: sending }) })));
  });

  test("to somebody who has switched course emails off, and their day is left alone", async () => {
    const off = userDoc("Oliver Grant", "member", { notifications: { categories: { courses: false } } });
    const db = makeDb(seed({ "users/oliver": off }));
    const result = await silent(db, SAT, "0 sent, 1 opted out");
    assert.equal(result.hasMore, false);
    assert.equal(lastReminder(db), null);
  });

  test("to somebody with no address on their application", async () => {
    const db = makeDb(seed({ [OLIVER]: oliver({ email: null }) }));
    await silent(db, SAT, "0 sent, 1 with no address");
    assert.equal(lastReminder(db), null);
  });

  test("when this copy of the site does not know its own address: the buttons would lead nowhere", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "";
    await silent(makeDb(seed()), SAT, "this site does not know its own address");
  });

  test("when the invitation names a programme the form no longer carries", async () => {
    const gone = oliver({ result: { programmeId: "left-the-form" }, invitation: { programmeId: "left-the-form" } });
    const db = makeDb(seed({ [OLIVER]: gone }));
    await silent(db);
    assert.equal(lastReminder(db), null);
  });

  test("with no database to read", async () => {
    globalThis.__rmDb = null;
    const result = await job.handler({
      now: SAT,
      budget: { remainingMs: () => 1, expired: () => false },
      log: () => {},
      policy: { reclaimAfterMinutes: 20, maxAttempts: 3 },
      maxPerTick: 100,
      maxLateHours: 8,
    });
    assert.deepEqual(result, { processed: 0, hasMore: false, note: "admin sdk unavailable" });
  });
});

// ---------------------------------------------------------------------------
// Reminders stop when somebody has replied: the real reply, then the real job
// ---------------------------------------------------------------------------

/**
 * The owner asked for this on 7 October 2026, and it was already true. What
 * was not yet shown is the SEAM: the cases above hand the job a document with
 * a reply typed onto it, and the reply route does not write that document. An
 * accepted invitation also becomes `accepted`, and a no thanks also becomes
 * `withdrawn`. So each case here makes the reply with the route's own writer
 * (`recordReply`), against the same store, and then runs the job on what that
 * writer left.
 */
describe("reminders stop when somebody has replied: the real reply, then the real job", () => {
  /** Sat 24 Oct, mid-afternoon: after the morning's reminders, before Sunday's. */
  const SAT_AFTERNOON = new Date("2026-10-24T14:00:00Z");
  const say = async (db, request, when = SAT_AFTERNOON) =>
    record.recordReply(db, await repo.loadForm(db, ROUND), "oliver", request, when);
  const asRead = (db) => normalise.normaliseApplication(OLIVER.split("/")[1], db.read(OLIVER));
  /** A run that must do nothing at all: no email, and no write. */
  const silent = async (db, now) => {
    const writes = db.counters.writes;
    const result = await run(db, now);
    assert.equal(result.processed, 0);
    assert.deepEqual(globalThis.__rmMail.calls, []);
    assert.equal(db.counters.writes, writes, "and writes nothing");
  };

  const ACCEPTS = { reply: "accept-invitation", reason: null };
  const NO_THANKS = { reply: "decline-invitation", reason: { kind: "times", other: "" } };
  const CANT_MAKE_IT = { reply: "cant-make-it", reason: { kind: "too-much-on", other: "" } };

  test("the control: with no reply he is reminded on Saturday and again on Sunday, his last day", async () => {
    const db = makeDb(seed());
    assert.equal((await run(db, SAT)).processed, 1);
    assert.equal((await run(db, SUN)).processed, 1);
    assert.equal(mailTo("oliver@example.com").length, 2);
  });

  for (const [name, request, status, response, why] of [
    ["ACCEPTED", ACCEPTS, "accepted", "accepted", "not-invited"],
    ["NO THANKS", NO_THANKS, "withdrawn", "declined", "not-in-term"],
  ]) {
    test(`${name} before any reminder: nothing is ever sent, that day or the next`, async () => {
      const db = makeDb(seed());
      // He replies on Saturday morning, before the day's reminders go.
      const recorded = await say(db, request, SAT_EARLY);
      assert.equal(recorded.changed, true);
      const stored = db.read(OLIVER);
      assert.deepEqual([stored.status, stored.invitation.response], [status, response], "what the route's writer left");
      assert.deepEqual(rule.invitationReminderDue(asRead(db), SAT), { due: false, why });
      await silent(db, SAT);
      await silent(db, SUN);
      assert.equal(lastReminder(db), null, "no day was ever taken for him");
    });

    test(`${name} after Saturday's reminder: Sunday's, which would have been his last, is not sent`, async () => {
      const db = makeDb(seed());
      assert.equal((await run(db, SAT)).processed, 1);
      assert.equal(mailTo("oliver@example.com").length, 1);
      assert.equal(lastReminder(db), "2026-10-24");
      globalThis.__rmMail.calls.length = 0;

      await say(db, request);
      // The reply leaves the invitation's other fields exactly as they were.
      assert.equal(lastReminder(db), "2026-10-24");
      assert.deepEqual(rule.invitationReminderDue(asRead(db), SUN), { due: false, why });
      await silent(db, SUN);
      await silent(db, MON);
    });
  }

  test("ACCEPTED, and later cannot make it: still nothing, for either reply", async () => {
    const db = makeDb(seed());
    await say(db, ACCEPTS, SAT_EARLY);
    await silent(db, SAT);
    await say(db, CANT_MAKE_IT);
    const stored = db.read(OLIVER);
    assert.deepEqual([stored.status, stored.invitation.response, stored.attendance.answer], ["withdrawn", "accepted", "cant-make-it"]);
    assert.deepEqual(rule.invitationReminderDue(asRead(db), SUN), { due: false, why: "not-in-term" });
    await silent(db, SUN);
  });

  test("A WITHDRAWN APPLICATION: taken out of the term with no reply at all, and reminded no more", async () => {
    const db = makeDb(seed());
    assert.equal((await run(db, SAT)).processed, 1);
    globalThis.__rmMail.calls.length = 0;
    // Withdrawn by something other than his own reply: the invitation still says unanswered.
    db.patch(OLIVER, { status: "withdrawn", withdrawnAt: SAT_AFTERNOON });
    assert.equal(db.read(OLIVER).invitation.response, null);
    assert.deepEqual(rule.invitationReminderDue(asRead(db), SUN), { due: false, why: "not-in-term" });
    await silent(db, SUN);
  });

  test("somebody else's reply stops nobody else's reminders", async () => {
    const second = `admissionApplications/${ROUND}__rosa`;
    const db = makeDb(
      seed({
        [second]: applicationDoc("rosa", "Rosa García", [INC, AGI], "invited", TAIS),
        "users/rosa": userDoc("Rosa García", "member"),
      }),
    );
    await say(db, NO_THANKS, SAT_EARLY);
    const result = await run(db, SAT);
    assert.equal(result.processed, 1);
    assert.deepEqual(globalThis.__rmMail.calls.map((call) => call.to), ["rosa@example.com"]);
  });

  test("the rule is asked of the document as it is, three ways: in the term, still invited, and unanswered", () => {
    // Any one of these is enough to stop a reminder, so a reply is caught by
    // more than one of them. They are read out of the rule so that none can
    // be dropped without this failing.
    const source = readFileSync(join(REPO_ROOT, "src", "lib", "applications", "decisionDay", "reminders.ts"), "utf8");
    assert.match(source, /if \(!isInTerm\(application\)\) return skip\("not-in-term"\);/);
    assert.match(source, /if \(application\.status !== "invited" \|\| result\?\.kind !== "invited" \|\| !invitation\) \{\s+return skip\("not-invited"\);/);
    assert.match(source, /if \(invitation\.response !== null\) return skip\("replied"\);/);
    // And the job asks the rule again on a fresh read, in the transaction that takes the day.
    const jobSource = readFileSync(join(REPO_ROOT, "src", "lib", "scheduler", "jobs", "applicationInvitationReminders.ts"), "utf8");
    const inTransaction = jobSource.slice(jobSource.indexOf("runTransaction"));
    assert.match(inTransaction, /invitationReminderDue\(/, "the day is taken only for somebody still due one");
  });
});

describe("somebody whose first email nobody can vouch for is still reminded", () => {
  test("the reminder carries the whole invitation, so it is how they hear", async () => {
    const db = makeDb(seed({ [OLIVER]: oliver({ result: { email: "unconfirmed", emailedAt: null } }) }));
    assert.equal((await run(db, SAT)).processed, 1);
    assert.equal(mailTo("oliver@example.com").length, 1);
  });
});

describe("a failed read of somebody's account is not a refusal", () => {
  test("the reminder still goes: only an explicit off switch stops it", async () => {
    const db = makeDb(seed());
    db.failReads((path) => path === "users/oliver");
    assert.equal((await run(db, SAT)).processed, 1);
    assert.equal(mailTo("oliver@example.com").length, 1);
  });
});

describe("the day is taken on a fresh read, before the email", () => {
  test("a reply that lands after the scan and before the send stops the reminder", async () => {
    const db = makeDb(seed());
    // He accepts while the job is reading his account.
    db.onGet((path) => {
      if (path === "users/oliver") db.put(OLIVER, oliver({ invitation: { response: "accepted", respondedAt: SAT } }));
    });
    const result = await run(db, SAT);
    assert.equal(result.processed, 0);
    assert.deepEqual(globalThis.__rmMail.calls, []);
    assert.equal(lastReminder(db), null, "and no day was taken for a reminder that did not go");
  });

  test("an application withdrawn in the same moment is left alone", async () => {
    const db = makeDb(seed());
    db.onGet((path) => {
      if (path === "users/oliver") db.put(OLIVER, oliver({ status: "withdrawn", withdrawnAt: SAT }));
    });
    assert.equal((await run(db, SAT)).processed, 0);
    assert.deepEqual(globalThis.__rmMail.calls, []);
  });

  test("when the email is handed over, the day is already on the invitation", async () => {
    const db = makeDb(seed());
    let seen = "not asked";
    globalThis.__rmMail.verdict = () => {
      seen = lastReminder(db);
      return "sent";
    };
    await run(db, SAT);
    assert.equal(seen, "2026-10-24");
  });

  test("two runs at once send one reminder", async () => {
    const db = makeDb(seed());
    globalThis.__rmMail.verdict = async () => {
      await new Promise((resolve) => setTimeout(resolve, 3));
      return "sent";
    };
    const [first, second] = await Promise.all([run(db, SAT), run(db, SAT)]);
    assert.equal(first.processed + second.processed, 1);
    assert.equal(mailTo("oliver@example.com").length, 1);
    assert.ok(db.reruns() > 0, "the two runs really did meet on his application");
    assert.equal(lastReminder(db), "2026-10-24");
  });
});

describe("when the mail door fails", () => {
  test("a refusal hands nothing over: the day is given back and the next run sends it, once", async () => {
    const db = makeDb(seed());
    globalThis.__rmMail.verdict = () => "throw";
    const failed = await run(db, SAT);
    assert.deepEqual([failed.processed, failed.hasMore, failed.note], [0, false, "0 sent, 1 failed"]);
    assert.equal(lastReminder(db), null, "today is his again");
    assert.deepEqual(failed.logged.map(([message, extra]) => [message, extra.uid, extra.handedOver]), [
      ["a reminder could not be sent", "oliver", "no"],
    ]);
    assert.ok(!JSON.stringify(failed.logged).includes("@"), "the log names him by uid, never by address");

    globalThis.__rmMail.verdict = null;
    const next = await run(db, new Date("2026-10-24T09:20:00Z"));
    assert.equal(next.processed, 1);
    assert.equal(mailTo("oliver@example.com").length, 2, "one refused attempt, one that went");
    assert.equal(lastReminder(db), "2026-10-24");
    assert.equal((await run(db, new Date("2026-10-24T09:35:00Z"))).processed, 0);
  });

  test("a refusal gives back the day he was last reminded, not nothing", async () => {
    const db = makeDb(seed({ [OLIVER]: oliver({ invitation: { lastReminderOn: "2026-10-24" } }) }));
    globalThis.__rmMail.verdict = () => "throw";
    await run(db, SUN);
    assert.equal(lastReminder(db), "2026-10-24");
  });

  test("a conversation that broke off may have gone: the day stays taken, and there is no second try today", async () => {
    const db = makeDb(seed());
    globalThis.__rmMail.verdict = () => "cut-off";
    const result = await run(db, SAT);
    assert.deepEqual([result.processed, result.note], [0, "0 sent, 1 unconfirmed"]);
    assert.equal(lastReminder(db), "2026-10-24");
    globalThis.__rmMail.verdict = null;
    assert.equal((await run(db, new Date("2026-10-24T09:20:00Z"))).processed, 0);
    assert.equal(mailTo("oliver@example.com").length, 1, "at most one a day");
    // Tomorrow is a new day.
    assert.equal((await run(db, SUN)).processed, 1);
  });

  test("what the door decided is counted: held and refused by the do-not-email list", async () => {
    const held = makeDb(seed());
    globalThis.__rmMail.verdict = () => "held";
    assert.deepEqual([(await run(held, SAT)).note, lastReminder(held)], ["0 sent, 1 held", "2026-10-24"]);
    const suppressed = makeDb(seed());
    globalThis.__rmMail.verdict = () => "suppressed";
    assert.deepEqual([(await run(suppressed, SAT)).note, lastReminder(suppressed)], ["0 sent, 1 suppressed", "2026-10-24"]);
  });

  /** Ten invited people on the form, none of whom has replied. */
  function tenInvited() {
    const extra = {};
    for (let i = 0; i < 10; i += 1) {
      const uid = `p${i}`;
      extra[`admissionApplications/${ROUND}__${uid}`] = applicationDoc(uid, `Person ${uid}`, [INC], "invited", TAIS);
    }
    return seed(extra);
  }

  test("three failures in a row end the run: the mail is not going out", async () => {
    const db = makeDb(tenInvited());
    globalThis.__rmMail.verdict = () => "throw";
    const result = await run(db, SAT);
    assert.equal(globalThis.__rmMail.calls.length, 3);
    assert.deepEqual([result.processed, result.hasMore], [0, false]);
    assert.match(result.note, /3 failed, stopped: emails are failing$/);
  });

  test("a run stops at its ceiling and when its time is up, and says there is more", async () => {
    const capped = await run(makeDb(tenInvited()), SAT, { maxPerTick: 4 });
    assert.deepEqual([capped.processed, capped.hasMore], [4, true]);
    assert.equal(globalThis.__rmMail.calls.length, 4);

    globalThis.__rmMail.calls.length = 0;
    let asked = 0;
    const timed = await run(makeDb(tenInvited()), SAT, {
      budget: { remainingMs: () => 0, expired: () => (asked += 1) > 2 },
    });
    assert.deepEqual([timed.processed, timed.hasMore], [2, true]);
  });

  test("a scan that cannot be read says so and asks to be run again", async () => {
    const db = makeDb(seed());
    db.failReads((path) => path.startsWith("admissionRounds?"));
    const result = await run(db, SAT);
    assert.deepEqual([result.processed, result.hasMore], [0, true]);
    assert.match(result.note, /^scan failed: /);
    assert.deepEqual(globalThis.__rmMail.calls, []);
  });
});

// ---------------------------------------------------------------------------
// 4. Whether the page may promise a reminder
// ---------------------------------------------------------------------------

describe("the reminders are running only when a scheduled run says so", () => {
  const receipt = (now, jobs) => [
    `schedulerRuns/${runs.tickReceiptId(runs.tickBucketKey(now), 0)}`,
    { bucket: runs.tickBucketKey(now), depth: 0, trigger: "external", jobs },
  ];
  const entry = (id, skipped = null) => ({ id, processed: 0, hasMore: false, durationMs: 4, error: null, skipped });
  const ID = "application-invitation-reminders";
  const minutesAgo = (n) => new Date(SAT.getTime() - n * 60_000);

  test("no receipt at all: not running", async () => {
    assert.equal(await armed.invitationRemindersArmed(makeDb({}), SAT), false);
  });

  test("the last scheduled run ran it: running", async () => {
    const db = makeDb(Object.fromEntries([receipt(SAT, [entry("heartbeat"), entry(ID)])]));
    assert.equal(await armed.invitationRemindersArmed(db, SAT), true);
  });

  test("one of the last three runs is enough, and a fourth back is not", async () => {
    assert.equal(await armed.invitationRemindersArmed(makeDb(Object.fromEntries([receipt(minutesAgo(30), [entry(ID)])])), SAT), true);
    assert.equal(await armed.invitationRemindersArmed(makeDb(Object.fromEntries([receipt(minutesAgo(45), [entry(ID)])])), SAT), false);
  });

  test("a run that skipped it as switched off: not running", async () => {
    const db = makeDb(Object.fromEntries([receipt(SAT, [entry("heartbeat"), entry(ID, "disabled")])]));
    assert.equal(await armed.invitationRemindersArmed(db, SAT), false);
  });

  test("a run that had no time left for it still shows it is switched on", async () => {
    const db = makeDb(Object.fromEntries([receipt(SAT, [entry(ID, "budget")])]));
    assert.equal(await armed.invitationRemindersArmed(db, SAT), true);
  });

  test("the scheduler running without this job in its list: not running", async () => {
    const db = makeDb(Object.fromEntries([receipt(SAT, [entry("heartbeat"), entry("admissions-deadline-reminders")])]));
    assert.equal(await armed.invitationRemindersArmed(db, SAT), false);
  });

  test("a run a person pressed is not a scheduled run", async () => {
    const pressed = { [`schedulerRuns/manual__${runs.tickBucketKey(SAT)}`]: { jobs: [entry(ID)] } };
    assert.equal(await armed.invitationRemindersArmed(makeDb(pressed), SAT), false);
    const rearmed = { [`schedulerRuns/${runs.tickReceiptId(runs.tickBucketKey(SAT), 1)}`]: { jobs: [entry(ID)] } };
    assert.equal(await armed.invitationRemindersArmed(makeDb(rearmed), SAT), false);
  });

  test("receipts that cannot be read: not running", async () => {
    const db = makeDb(Object.fromEntries([receipt(SAT, [entry(ID)])]));
    db.failReads((path) => path.startsWith("schedulerRuns/"));
    assert.equal(await armed.invitationRemindersArmed(db, SAT), false);
  });

  test("it reads three documents and writes nothing", async () => {
    const db = makeDb(Object.fromEntries([receipt(SAT, [entry(ID)])]));
    await armed.invitationRemindersArmed(db, SAT);
    assert.deepEqual(db.counters, { reads: 3, writes: 0 });
  });
});
