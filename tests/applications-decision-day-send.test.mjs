/**
 * Decision day: the one send that tells every applicant what happened,
 * EXECUTED against an in-memory Firestore and a mail door that records.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * Until the send runs, nothing an applicant can see has changed since they
 * applied. The send is the only writer of `result` and `invitation` on an
 * applicant's own document and the only sender of the three emails, and it
 * cannot be taken back. So every promise it makes is run here:
 *
 *  1. IT REFUSES unless the term is ready, the form has not been sent, and the
 *     number of emails is the number the admin was shown.
 *  2. PER PERSON: the result, the status and (for an invitation) the reply-by
 *     day are written together, and the form's counters move with them.
 *  3. NOBODY IS TOLD TWICE. Somebody who already has a result is never
 *     published again, whatever their decision says now.
 *  4. THE EMAIL FOLLOWS THE RESULT and goes through the one mail door, one
 *     message per person, to the address on their own application, with the
 *     society's reply-to.
 *  5. A FAILED EMAIL UNDOES NOTHING. The result stays published, the person is
 *     named in the report, and the send stops early when the mail is plainly
 *     not going out.
 *  6. SENT MEANS EVERYBODY HAS A RESULT. Only then is the form stamped, and
 *     each press that told anybody leaves one audit row.
 *  7. THE COUNTS ADD UP, every time: each person a press looked at is in
 *     exactly one of them.
 *  8. ONLY AN ADMIN, decided before anything is read, on all three routes.
 *     A programme's own test email is its lead's or an admin's, and goes to
 *     the address on the caller's own session whatever the request says.
 *  9. WHAT BECAME OF EACH EMAIL IS ON THE RESULT, and that record decides what
 *     a later press does. An email known not to have gone is owed and a later
 *     press sends it. One that was sent, held, refused by the do-not-email
 *     list or deliberately not sent is never sent again. One nobody can vouch
 *     for is never sent again either, and the person is named instead.
 * 10. NOBODY IS EMAILED THEIR DECISION TWICE, and two presses racing is the
 *     case run here: each takes an email up in a transaction, the store below
 *     reruns a transaction whose reads went stale the way Firestore does, and
 *     every address ends with exactly one message.
 *
 * Real: the send, the board builder, the three routes, the templates (what
 * was handed to the mail door is rendered and read), the pacer, and every
 * pure module beneath them. Faked: `server-only`, `next/server`, the
 * `firebase-admin/firestore` sentinels, the Admin SDK handle, the session, the
 * view-as guard, and `sendEmail`, which records what it was asked to send and
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
const NOW = new Date("2026-10-23T11:00:00Z");
const APP_URL = "https://staging.example.com";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;
delete process.env.SMTP_FROM_NAME;
delete process.env.SMTP_HOST;
delete process.env.EMAIL_AUDIENCE;

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
    ],
    [
      "firebase-admin/firestore",
      "export const FieldValue = {\n" +
        "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
        "  increment: (by) => ({ __op: 'increment', by }),\n" +
        "  delete: () => ({ __op: 'delete' }),\n" +
        "};",
    ],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__ddDb; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__ddUser; }"],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() { return globalThis.__ddBlocked ?? null; }",
    ],
    [
      // The one mail door, as the decision-day module reaches it. It records
      // every message it is handed and answers the way the test says to.
      "@/lib/email/send",
      "export async function sendEmail(args) {\n" +
        "  const mail = globalThis.__ddMail;\n" +
        "  mail.calls.push(args);\n" +
        "  const verdict = mail.verdict ? await mail.verdict(args, mail.calls.length) : 'sent';\n" +
        // The mail server refused the connection: nothing was handed over.
        "  if (verdict === 'throw') {\n" +
        "    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:587'), {\n" +
        "      code: 'ESOCKET', syscall: 'connect', command: 'CONN',\n" +
        "    });\n" +
        "  }\n" +
        // The conversation broke off with no answer: nobody can say whether it went.
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
  ]),
});

const send = await loadTs(join("lib", "applications", "decisionDay", "send.ts"));
const repo = await loadTs(join("lib", "applications", "repo.ts"));
const tested = await loadTs(join("lib", "applications", "decisionDay", "tested.ts"));
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
const sendRoute = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "send", "route.ts"));
const testRoute = await loadTs(
  join("app", "api", "admissions", "forms", "[roundId]", "send", "test", "route.ts"),
);
const programmeTestRoute = await loadTs(
  join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "test-email", "route.ts"),
);

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

function makeDb(seed) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
  const counters = { reads: 0, writes: 0 };
  /** Transactions run again because something they read was written first. */
  let reruns = 0;
  /** How many times each document has been written, which is how a stale read is caught. */
  const versions = new Map();
  const written = (path) => versions.set(path, (versions.get(path) ?? 0) + 1);
  /** A test can make chosen commits fail: `sabotage(ops)` returning true throws. */
  let sabotage = null;
  let autoId = 0;

  const resolveValue = (current, value) => {
    if (value && typeof value === "object" && value.__op === "serverTimestamp") return new Date(NOW);
    if (value && typeof value === "object" && value.__op === "increment") return (current ?? 0) + value.by;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, resolveValue(undefined, inner)]));
    }
    return value;
  };
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
    if (op.kind === "create") {
      if (docs.has(op.path)) throw new Error(`ALREADY_EXISTS: ${op.path}`);
      docs.set(op.path, resolveValue(undefined, op.data));
      return;
    }
    if (!docs.has(op.path)) throw new Error(`NOT_FOUND: ${op.path}`);
    const next = structuredClone(docs.get(op.path));
    for (const [field, value] of Object.entries(op.data)) {
      const parts = field.split(".");
      let node = next;
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      const last = parts[parts.length - 1];
      if (value && typeof value === "object" && value.__op === "delete") delete node[last];
      else node[last] = resolveValue(node[last], value);
    }
    docs.set(op.path, next);
  };
  const ref = (path) => ({
    id: path.split("/").pop(),
    path,
    get: async () => snap(path),
    /** A single write outside any transaction. It can be made to fail like a commit. */
    update: async (data) => {
      const op = { kind: "update", path, data };
      if (sabotage && sabotage([op])) throw new Error("UNAVAILABLE: the write did not go through");
      apply(op);
    },
  });

  return {
    counters,
    collection(name) {
      return {
        doc: (id) => ref(`${name}/${id ?? `auto-${(autoId += 1)}`}`),
        where: (field, _op, value) => ({
          get: async () => ({
            docs: [...docs.entries()]
              .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
              .map(([path]) => snap(path)),
          }),
        }),
      };
    },
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
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
          getAll: async (...refs) => refs.map(read),
          update: (r, data) => ops.push({ kind: "update", path: r.path, data }),
          create: (r, data) => ops.push({ kind: "create", path: r.path, data }),
        });
        // A document this transaction read was written by somebody else before
        // it could commit. Firestore runs the function again from the top, and
        // so does this: it is what makes two presses racing a fair test.
        const stale = [...seen].some(([path, version]) => (versions.get(path) ?? 0) !== version);
        if (stale) {
          if (attempt >= 5) throw new Error("ABORTED: too much contention");
          reruns += 1;
          continue;
        }
        if (sabotage && sabotage(ops)) throw new Error("UNAVAILABLE: the commit did not go through");
        // Nothing is stored until the function has returned, as in a real transaction.
        ops.forEach(apply);
        return result;
      }
    },
    read: (path) => docs.get(path),
    /** For a test to change a document behind the send's back. */
    patch: (path, change) => {
      written(path);
      docs.set(path, { ...docs.get(path), ...change });
    },
    reruns: () => reruns,
    /** For a test to make chosen commits fail. Pass null to stop. */
    failCommits: (when) => {
      sabotage = when;
    },
    paths: (prefix) => [...docs.keys()].filter((path) => path.startsWith(prefix)),
    /** Every document as it stands, copied, for a before-and-after comparison. */
    snapshot: () => Object.fromEntries([...docs.entries()].map(([path, data]) => [path, structuredClone(data)])),
  };
}

// ---------------------------------------------------------------------------
// A term that is ready to send
// ---------------------------------------------------------------------------

const ROUND = "autumn-2026__k3f9a2b1";
const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const INC = "research-incubator";
const DECIDED = new Date("2026-10-19T09:00:00Z");

const programme = (name, shortName, places, leadUid, over = {}) => ({
  kind: "fellowship",
  name,
  shortName,
  starts: "w/c 26 Oct",
  places,
  leadUid,
  reviewerUids: [],
  useScores: true,
  closed: false,
  emailWording: {},
  ...over,
});

/** When the admin sent themselves the test this term's send relies on. */
const TESTED_AT = new Date("2026-10-22T14:10:00Z");

/**
 * The record a test leaves on a form, for the form as `doc` words its emails:
 * who, when, and the fingerprint of that wording. The fingerprint is worked
 * out by the shipping function from the shipping normaliser's reading, so a
 * seed can never carry a record the code would not have written.
 */
const testRecord = (doc, byUid = "zach", at = TESTED_AT) => ({
  byUid,
  at,
  wording: tested.wordingFingerprint(normalise.normaliseFormFields(doc)),
});

/**
 * A TERM THAT IS READY TO SEND HAS BEEN TESTED. Every round made here carries
 * a test of its own wording, because nearly every case below is about a press
 * that goes. A case about the test itself passes `decisionEmailTest` (null for
 * no test, or a record of other wording) and is left exactly as it says.
 */
function roundDoc(over = {}, submitted = 8) {
  const doc = untestedRoundDoc(over, submitted);
  return "decisionEmailTest" in over ? doc : { ...doc, decisionEmailTest: testRecord(doc) };
}

function untestedRoundDoc(over = {}, submitted = 8) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "deciding",
    opensAt: new Date("2026-10-06T08:00:00Z"),
    closesAt: new Date("2026-10-18T22:59:00Z"),
    decisionsByDate: "2026-10-23",
    reviewerUids: ["zach", "claudia"],
    finalDeciderUid: null,
    applicationCounts: { submitted },
    archived: false,
    programmeIds: [AGI, TAIS, INC],
    programmes: {
      [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", 32, "claudia"),
      [TAIS]: programme("Technical AI Safety Fellowship", "Technical AI Safety", 24, "zach"),
      [INC]: programme("Research incubator", "Research incubator", 12, "zach", { kind: "incubator" }),
    },
    questionSetIds: [],
    invitationReplyBy: "2026-10-25",
    noOfferWording: null,
    decisionsSentAt: null,
    decisionsSentByUid: null,
    ...over,
  };
}

function applicationDoc(uid, name, ranked, over = {}) {
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
    status: "submitted",
    submittedAt: DECIDED,
    sentAt: DECIDED,
    withdrawnAt: null,
    result: null,
    invitation: null,
    attendance: null,
    ...over,
  };
}

function decisionDoc(uid, programmes, pooledOutcome = null) {
  const entries = Object.fromEntries(
    Object.entries(programmes).map(([programmeId, decision]) => [
      programmeId,
      { decision, poolReason: decision === "pool" ? "capacity" : null, couldSuitProgrammeId: null, decidedByUid: "zach", decidedAt: DECIDED },
    ]),
  );
  return {
    roundId: ROUND,
    uid,
    programmes: entries,
    pooledOutcome: pooledOutcome ? { ...pooledOutcome, setByUid: "zach", setAt: DECIDED } : null,
    exception: null,
    updatedAt: DECIDED,
  };
}

const userDoc = (name, role) => ({ displayName: name, role, profile: { preferredName: name.split(" ")[0] } });

/** `[uid, name, ranked, decisions, pooled outcome]`: eight people, every one of them decided. */
const PEOPLE = [
  ["amara", "Amara Okafor", [AGI, TAIS], { [AGI]: "accept" }],
  ["sam", "Sam Whitfield", [TAIS], { [TAIS]: "accept" }],
  ["wen", "Wen Zhao", [TAIS, AGI], { [TAIS]: "accept" }],
  ["oliver", "Oliver Grant", [INC], { [INC]: "pool" }, { kind: "invite", programmeId: TAIS }],
  ["rosa", "Rosa García", [INC, AGI], { [INC]: "pool", [AGI]: "pool" }, { kind: "no-offer" }],
  ["nina", "Nina Petrova", [AGI], { [AGI]: "pool" }, { kind: "no-offer" }],
  ["ben", "Ben Hartley", [AGI], { [AGI]: "pool" }, { kind: "no-offer" }],
  ["zara", "Zara Ahmed", [AGI], { [AGI]: "decline" }],
];

function seed(over = {}, people = PEOPLE) {
  const out = {
    [`admissionRounds/${ROUND}`]: roundDoc({}, people.length),
    "users/zach": userDoc("Zach Levin", "admin"),
    "users/claudia": userDoc("Claudia Reyes", "committee"),
    "users/amara": userDoc("Amara Okafor", "member"),
    "users/sam": userDoc("Sam Whitfield", "member"),
    // Accepted, and her account is still waiting to be approved.
    "users/wen": userDoc("Wen Zhao", "pending"),
  };
  for (const [uid, name, ranked, verdicts, outcome] of people) {
    out[`admissionApplications/${ROUND}__${uid}`] = applicationDoc(uid, name, ranked);
    out[`admissionDecisions/${ROUND}__${uid}`] = decisionDoc(uid, verdicts, outcome);
  }
  return { ...out, ...over };
}

const ACTOR = { uid: "zach", displayName: "Zach Levin" };
const clock = () => new Date(NOW);

const applicationOf = (db, uid) => db.read(`admissionApplications/${ROUND}__${uid}`);
const roundOf = (db) => db.read(`admissionRounds/${ROUND}`);
const auditRows = (db) => db.paths("courseAudit/").map((path) => db.read(path));
const mailTo = (address) => globalThis.__ddMail.calls.filter((call) => call.to === address);
const press = (db, request = { emails: 7, emailDeclined: false }) =>
  send.runDecisionDay(db, ACTOR, ROUND, request, clock);

/** Every person a press looked at is in exactly one count, and so is every email it took up. */
function assertAddsUp(report, people) {
  assert.equal(
    report.published + report.retried,
    report.emailed + report.held + report.suppressed + report.failed + report.unconfirmed + report.notEmailed,
    "everybody told, and everybody whose owed email was taken up, is emailed, held, suppressed, " +
      "failed, unconfirmed or deliberately not emailed",
  );
  assert.equal(
    people,
    report.published + report.retried + report.skipped + report.changed + report.notReached,
    "everybody in the term is told, taken up, skipped, changed or left for the next press",
  );
  assert.equal(report.failedNames.length, report.failed, "everybody whose email is still owed is named");
  assert.equal(report.unconfirmedNames.length, report.unconfirmed, "and everybody nobody can vouch for");
}

/** What a result says about its email: the state, when it went, and who holds it. */
const emailOf = (db, uid) => {
  const { result } = applicationOf(db, uid);
  return [result.email, result.emailedAt, result.emailClaimedAt];
};

/** The press that tells nobody new and only sends what is still owed. */
const pressOwed = (db, emails, at = clock) =>
  send.runDecisionDay(db, ACTOR, ROUND, { emails, emailDeclined: false, owedOnly: true }, at);

/** A result as an earlier press left it, with what became of its email. */
const SENT = { email: "sent", emailedAt: DECIDED, emailClaimedAt: null };
const toldDoc = (uid, name, ranked, kind, programmeId, email = SENT, over = {}) =>
  applicationDoc(uid, name, ranked, {
    status: kind,
    result: { kind, programmeId, publishedAt: DECIDED, emailedAt: null, emailClaimedAt: null, ...email },
    ...over,
  });

/** A failing email is logged by the send; the log is the code's, not the test's. */
async function quietly(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

beforeEach(() => {
  globalThis.__ddMail = { calls: [], verdict: null };
  globalThis.__ddBlocked = null;
});

// ---------------------------------------------------------------------------
// 1. The send
// ---------------------------------------------------------------------------

describe("a send over a ready term", () => {
  test("every count adds up, and the term is complete", async () => {
    const db = makeDb(seed());
    const result = await press(db);
    assert.equal(result.ok, true);
    assert.deepEqual(result.report, {
      owedOnly: false,
      published: 8,
      retried: 0,
      emailed: 7,
      held: 0,
      suppressed: 0,
      failed: 0,
      unconfirmed: 0,
      notEmailed: 1,
      skipped: 0,
      changed: 0,
      notReached: 0,
      failedNames: [],
      unconfirmedNames: [],
      // Wen was accepted while her account was still waiting.
      accountsApproved: 1,
      accountsFailed: [],
      accountsRefused: [],
      stopped: null,
      complete: true,
    });
    assertAddsUp(result.report, 8);
  });

  test("each person's result, status and invitation are written on their own document", async () => {
    const db = makeDb(seed());
    await press(db);
    const told = (uid) => {
      const application = applicationOf(db, uid);
      return [application.status, application.result, application.invitation];
    };
    // The email went, and the result says so and when. Nobody holds it any more.
    const emailed = { email: "sent", emailedAt: NOW, emailClaimedAt: null };
    assert.deepEqual(told("amara"), ["accepted", { kind: "accepted", programmeId: AGI, publishedAt: NOW, ...emailed }, null]);
    assert.deepEqual(told("wen"), ["accepted", { kind: "accepted", programmeId: TAIS, publishedAt: NOW, ...emailed }, null]);
    assert.deepEqual(told("oliver"), [
      "invited",
      { kind: "invited", programmeId: TAIS, publishedAt: NOW, ...emailed },
      { programmeId: TAIS, replyBy: "2026-10-25", response: null, respondedAt: null, lastReminderOn: null },
    ]);
    assert.deepEqual(told("nina"), ["no-offer", { kind: "no-offer", programmeId: null, publishedAt: NOW, ...emailed }, null]);
    // Declined, with "Email them" off: deliberately not sent, and settled as that.
    assert.deepEqual(told("zara"), [
      "declined",
      { kind: "declined", programmeId: null, publishedAt: NOW, email: "not-sent", emailedAt: null, emailClaimedAt: null },
      null,
    ]);
    // What they wrote is untouched.
    assert.deepEqual(applicationOf(db, "amara").sent.rankedProgrammeIds, [AGI, TAIS]);
  });

  test("the form's counters move with each status", async () => {
    const db = makeDb(seed());
    await press(db);
    assert.deepEqual(roundOf(db).applicationCounts, {
      submitted: 0,
      accepted: 3,
      invited: 1,
      "no-offer": 3,
      declined: 1,
    });
  });

  test("the form is stamped as sent, by the admin who pressed", async () => {
    const db = makeDb(seed());
    await press(db);
    assert.deepEqual([roundOf(db).decisionsSentAt, roundOf(db).decisionsSentByUid], [NOW, "zach"]);
  });

  test("one audit row says what the press did", async () => {
    const db = makeDb(seed());
    await press(db);
    assert.deepEqual(auditRows(db), [
      {
        kind: "application-decisions-sent",
        runId: "",
        roundId: ROUND,
        groupId: null,
        subjectUid: null,
        actorUid: "zach",
        actorName: "Zach Levin",
        targetLabel: "Autumn 2026",
        detail:
          "Published 8 decisions for Autumn 2026: 7 emailed, 0 held, 0 suppressed, 0 failed, " +
          "0 unconfirmed, 1 not emailed. Everybody in the term now has their result. " +
          "Approved 1 waiting account.",
        at: NOW,
      },
    ]);
  });

  test("each email goes through the one door, to the person's own address, with the society's reply-to", async () => {
    const db = makeDb(seed());
    await press(db);
    const { calls } = globalThis.__ddMail;
    assert.equal(calls.length, 7);
    for (const call of calls) {
      assert.equal(typeof call.to, "string", "one message per person, never a list");
      assert.equal(call.replyTo, "ai-safety@uonsu.com");
      assert.equal(call.kind, "admissions");
      assert.equal(call.referenceId, ROUND);
      assert.equal(call.actorUid, "zach");
      assert.equal(call.listUnsubscribe, undefined, "the answer to an application carries no unsubscribe");
    }
    assert.deepEqual(
      calls.map((call) => [call.to, call.subject]).sort(),
      [
        ["amara@example.com", "You’re in AGI Strategy"],
        ["ben@example.com", "Your NAISI application"],
        ["nina@example.com", "Your NAISI application"],
        ["oliver@example.com", "An invitation to Technical AI Safety"],
        ["rosa@example.com", "Your NAISI application"],
        ["sam@example.com", "You’re in Technical AI Safety"],
        ["wen@example.com", "You’re in Technical AI Safety"],
      ],
    );
    assert.deepEqual(mailTo("zara@example.com"), [], "a declined application is not emailed");
  });

  test("what was handed to the door is the email, and its buttons open the person's application", async () => {
    const db = makeDb(seed());
    await press(db);
    const [toAmara] = mailTo("amara@example.com");
    const text = await render(toAmara.react, { plainText: true });
    const html = await render(toAmara.react);
    assert.ok(text.includes("Hi Amara,"));
    assert.ok(text.includes("You’re in the AGI Strategy Fellowship. It starts w/c 26 Oct."));
    assert.ok(text.includes("Claudia") && text.includes("AGI Strategy lead, NAISI"));
    assert.equal(html.split(`href="${APP_URL}/applications/${ROUND}"`).length - 1, 2);

    const [toOliver] = mailTo("oliver@example.com");
    const invitation = await render(toOliver.react, { plainText: true });
    assert.ok(invitation.includes("Thanks for applying to the Research incubator."));
    assert.ok(invitation.includes("Accept your invitation by Sun 25 Oct to let us know you’re coming."));

    const [toNina] = mailTo("nina@example.com");
    assert.ok((await render(toNina.react)).includes(`href="${APP_URL}/events"`));
  });

  test("the first email goes on its own, before anybody else has been told", async () => {
    const db = makeDb(seed());
    const publishedAtEachSend = [];
    globalThis.__ddMail.verdict = () => {
      publishedAtEachSend.push(PEOPLE.filter(([uid]) => applicationOf(db, uid).result).length);
      return "sent";
    };
    await press(db);
    assert.equal(publishedAtEachSend[0], 1, "one person holds a result when the first email is tried");
  });

  test("with the switch on, a declined application is told too", async () => {
    const db = makeDb(seed());
    const result = await press(db, { emails: 8, emailDeclined: true });
    assert.deepEqual([result.report.emailed, result.report.notEmailed], [8, 0]);
    assert.deepEqual(mailTo("zara@example.com").map((call) => call.subject), ["Your NAISI application"]);
    assert.equal(applicationOf(db, "zara").status, "declined");
    assertAddsUp(result.report, 8);
  });
});

describe("the send refuses, and a refusal writes and sends nothing", () => {
  const untouched = (db) => {
    assert.equal(db.counters.writes, 0);
    assert.deepEqual(globalThis.__ddMail.calls, []);
  };

  test("while a pooled person has no outcome", async () => {
    const db = makeDb(
      seed({ [`admissionDecisions/${ROUND}__ben`]: decisionDoc("ben", { [AGI]: "pool" }) }),
    );
    assert.deepEqual(await press(db, { emails: 6, emailDeclined: false }), {
      ok: false,
      status: 409,
      error: "1 pooled person still needs an outcome.",
    });
    untouched(db);
  });

  test("while a programme still owes a decision", async () => {
    const db = makeDb(seed({ [`admissionDecisions/${ROUND}__sam`]: decisionDoc("sam", {}) }));
    const result = await press(db, { emails: 6, emailDeclined: false });
    assert.deepEqual([result.status, result.error], [409, "Technical AI Safety still owes 1 application a decision."]);
    untouched(db);
  });

  test("when the number of emails is not the number the admin was shown", async () => {
    const db = makeDb(seed());
    const result = await press(db, { emails: 121, emailDeclined: false });
    assert.deepEqual(result, {
      ok: false,
      status: 409,
      error:
        "The decisions have changed since this page loaded: this would now send 7 emails, not 121. " +
        "Reload the page and check again.",
    });
    untouched(db);
    // The switch is part of the number.
    assert.equal((await press(db, { emails: 7, emailDeclined: true })).status, 409);
    untouched(db);
  });

  test("when invitations have no day to reply by", async () => {
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ invitationReplyBy: null }) }));
    const result = await press(db);
    assert.deepEqual([result.status, result.error], [409, "Invitations need a reply-by date. Set it in the application form."]);
    untouched(db);
  });

  test("when the form has been sent already", async () => {
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: NOW, decisionsSentByUid: "zach" }) }));
    const result = await press(db);
    assert.deepEqual([result.status, result.error], [
      409,
      "Decisions for Autumn 2026 went out on Fri 23 Oct. They can’t be sent again.",
    ]);
    untouched(db);
  });

  test("when there is no such form", async () => {
    const db = makeDb(seed());
    const result = await send.runDecisionDay(db, ACTOR, "no-such-form", { emails: 7, emailDeclined: false }, clock);
    assert.deepEqual([result.ok, result.status], [false, 404]);
    untouched(db);
  });
});

describe("nobody is told twice", () => {
  test("a second press over a finished term is refused outright", async () => {
    const db = makeDb(seed());
    await press(db);
    const sentOnce = globalThis.__ddMail.calls.length;
    const again = await press(db, { emails: 0, emailDeclined: false });
    assert.equal(again.status, 409);
    assert.equal(globalThis.__ddMail.calls.length, sentOnce, "no second email to anybody");
    assert.equal(auditRows(db).length, 1);
  });

  test("a press that picks up a half-told term skips the people already told", async () => {
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__amara`]: toldDoc("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI),
        [`admissionApplications/${ROUND}__nina`]: toldDoc("nina", "Nina Petrova", [AGI], "no-offer", null),
        [`admissionRounds/${ROUND}`]: { ...roundDoc(), applicationCounts: { submitted: 6, accepted: 1, "no-offer": 1 } },
      }),
    );
    const result = await press(db, { emails: 5, emailDeclined: false });
    assert.deepEqual(
      [result.report.published, result.report.skipped, result.report.emailed, result.report.notEmailed],
      [6, 2, 5, 1],
    );
    assert.equal(result.report.complete, true);
    assertAddsUp(result.report, 8);
    assert.deepEqual(mailTo("amara@example.com"), []);
    assert.deepEqual(mailTo("nina@example.com"), []);
    assert.deepEqual(applicationOf(db, "amara").result.publishedAt, DECIDED, "what they were told is not rewritten");
    assert.deepEqual(roundOf(db).applicationCounts, {
      submitted: 0,
      accepted: 3,
      invited: 1,
      "no-offer": 3,
      declined: 1,
    });
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW);
  });

  test("somebody told between the page loading and the write is skipped, not overwritten", async () => {
    const db = makeDb(seed());
    // Another press reaches Ben while this one is sending its first email.
    globalThis.__ddMail.verdict = (_args, n) => {
      if (n === 1) {
        db.patch(`admissionApplications/${ROUND}__ben`, {
          status: "invited",
          result: { kind: "invited", programmeId: INC, publishedAt: DECIDED },
        });
      }
      return "sent";
    };
    const result = await press(db);
    assert.equal(result.report.skipped, 1);
    assert.equal(applicationOf(db, "ben").result.kind, "invited", "the other press's result stands");
    assert.deepEqual(mailTo("ben@example.com"), []);
    assertAddsUp(result.report, 8);
  });

  test("everybody told and the form never stamped: one more press finishes it and emails nobody", async () => {
    const db = makeDb(seed());
    await press(db);
    db.patch(`admissionRounds/${ROUND}`, { decisionsSentAt: null, decisionsSentByUid: null });
    const before = globalThis.__ddMail.calls.length;
    const result = await press(db, { emails: 0, emailDeclined: false });
    assert.deepEqual([result.ok, result.report.published, result.report.skipped, result.report.complete], [true, 0, 8, true]);
    assert.equal(globalThis.__ddMail.calls.length, before);
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW);
    assertAddsUp(result.report, 8);
  });
});

describe("a decision that changed after Send was pressed is not overruled", () => {
  test("the person is left out, the term is not complete and the form is not stamped", async () => {
    const db = makeDb(seed());
    // A lead takes Ben after all, while the first email is going out.
    globalThis.__ddMail.verdict = (_args, n) => {
      if (n === 1) db.patch(`admissionDecisions/${ROUND}__ben`, decisionDoc("ben", { [AGI]: "accept" }));
      return "sent";
    };
    const result = await press(db);
    assert.deepEqual([result.report.changed, result.report.published, result.report.complete], [1, 7, false]);
    assertAddsUp(result.report, 8);
    assert.equal(applicationOf(db, "ben").result, null, "he is told nothing by this press");
    assert.equal(applicationOf(db, "ben").status, "submitted");
    assert.deepEqual(mailTo("ben@example.com"), []);
    assert.equal(roundOf(db).decisionsSentAt, null);
    assert.match(auditRows(db)[0].detail, /1 changed, 0 not reached\. The term is not finished\./);
    // The next press, with the page reloaded, tells him he is in.
    const next = await press(db, { emails: 1, emailDeclined: false });
    assert.deepEqual([next.report.published, next.report.skipped, next.report.complete], [1, 7, true]);
    assert.deepEqual(mailTo("ben@example.com").map((call) => call.subject), ["You’re in AGI Strategy"]);
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW);
  });

  test("an application withdrawn in the same moment is left alone", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = (_args, n) => {
      if (n === 1) db.patch(`admissionApplications/${ROUND}__nina`, { status: "withdrawn", withdrawnAt: NOW });
      return "sent";
    };
    const result = await press(db);
    assert.equal(result.report.changed, 1);
    assert.equal(applicationOf(db, "nina").result, null);
    assert.deepEqual(mailTo("nina@example.com"), []);
    // She is no longer in the term, so everybody who is has a result.
    assert.equal(result.report.complete, true);
  });
});

describe("a failed email undoes nothing", () => {
  test("the result stays published and the person is named", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = (args) => (args.to === "nina@example.com" ? "throw" : "sent");
    const result = await quietly(() => press(db));
    assert.deepEqual(
      [result.report.published, result.report.emailed, result.report.failed, result.report.failedNames],
      [8, 6, 1, ["Nina Petrova"]],
    );
    assertAddsUp(result.report, 8);
    assert.equal(applicationOf(db, "nina").status, "no-offer", "her result is still there to read");
    assert.equal(mailTo("nina@example.com").length, 2, "tried once more before giving up");
    // The mail server refused both attempts, so nothing was handed over: the
    // email is owed, and nobody holds it.
    assert.deepEqual(emailOf(db, "nina"), ["owed", null, null]);
    // Everybody has a result, so the term is sent, and the log says whose email is owed.
    assert.equal(result.report.complete, true);
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW);
    assert.match(auditRows(db)[0].detail, /1 failed, 0 unconfirmed, 1 not emailed\..*Email still owed to: nina\.$/);
    assert.ok(!auditRows(db)[0].detail.includes("Petrova"), "the log names her by uid, not by name");
  });

  test("an email that fails once and then goes is simply sent", async () => {
    const db = makeDb(seed());
    let tries = 0;
    globalThis.__ddMail.verdict = (args) => {
      if (args.to !== "sam@example.com") return "sent";
      tries += 1;
      return tries === 1 ? "throw" : "sent";
    };
    const result = await quietly(() => press(db));
    assert.deepEqual([result.report.emailed, result.report.failed], [7, 0]);
    assert.equal(tries, 2);
  });

  test("somebody with no address on their application is told on the site and named", async () => {
    const db = makeDb(
      seed({ [`admissionApplications/${ROUND}__sam`]: applicationDoc("sam", "Sam Whitfield", [TAIS], { email: null }) }),
    );
    // The page counts an email for him; the send finds there is nowhere to send it.
    const result = await press(db);
    assert.deepEqual([result.report.failed, result.report.failedNames], [1, ["Sam Whitfield"]]);
    assert.equal(applicationOf(db, "sam").status, "accepted");
    assert.equal(globalThis.__ddMail.calls.length, 6);
    assertAddsUp(result.report, 8);
    // Nothing was tried, so nothing is held: the email is owed until there is somewhere to send it.
    assert.deepEqual(emailOf(db, "sam"), ["owed", null, null]);
  });

  test("when the very first email cannot be sent, the send stops with one person told", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = () => "throw";
    const result = await quietly(() => press(db));
    assert.deepEqual(
      [result.report.published, result.report.failed, result.report.notReached, result.report.stopped],
      [1, 1, 7, "emails-failing"],
    );
    assertAddsUp(result.report, 8);
    assert.equal(result.report.complete, false);
    assert.equal(roundOf(db).decisionsSentAt, null);
    assert.equal(PEOPLE.filter(([uid]) => applicationOf(db, uid).result).length, 1, "nobody else was published");
    assert.match(auditRows(db)[0].detail, /Stopped because emails were failing\. The term is not finished\./);

    // With the mail working again, the next press tells everybody else AND
    // sends the one email the first press left owed. Nobody has to write to
    // that person by hand, and the button's number counts their email: 6 for
    // the people not yet told, 1 owed.
    const [stranded] = result.report.failedNames;
    const [strandedUid] = PEOPLE.find(([, name]) => name === stranded);
    assert.deepEqual(emailOf(db, strandedUid), ["owed", null, null]);
    globalThis.__ddMail.calls.length = 0;
    globalThis.__ddMail.verdict = null;
    assert.equal((await press(db, { emails: 6, emailDeclined: false })).status, 409, "6 is no longer the number");
    const next = await press(db, { emails: 7, emailDeclined: false });
    assert.deepEqual(
      [next.report.published, next.report.retried, next.report.skipped, next.report.emailed, next.report.complete],
      [7, 1, 0, 7, true],
    );
    assert.equal(globalThis.__ddMail.calls.length, 7);
    assert.equal(mailTo(`${strandedUid}@example.com`).length, 1, "their email went, once");
    assert.deepEqual(emailOf(db, strandedUid), ["sent", NOW, null]);
    assertAddsUp(next.report, 8);
  });

  test("three failures in a row part way through stop it before the whole term is told", async () => {
    const many = [];
    for (let i = 0; i < 40; i += 1) {
      const uid = `p${String(i).padStart(2, "0")}`;
      many.push([uid, `Person ${uid}`, [AGI], { [AGI]: "pool" }, { kind: "no-offer" }]);
    }
    const db = makeDb(seed({}, many));
    // The first email goes; everything after it fails.
    globalThis.__ddMail.verdict = (_args, n) => (n === 1 ? "sent" : "throw");
    const result = await quietly(() => press(db, { emails: 40, emailDeclined: false }));
    assert.equal(result.report.stopped, "emails-failing");
    assert.ok(result.report.failed >= 3, "it took three in a row to stop");
    assert.ok(result.report.notReached > 20, `most of the term was not published (${result.report.notReached} left)`);
    assert.equal(result.report.complete, false);
    assert.equal(roundOf(db).decisionsSentAt, null);
    assertAddsUp(result.report, 40);
    // Exactly the people who were published are the ones with a result.
    assert.equal(many.filter(([uid]) => applicationOf(db, uid).result).length, result.report.published);
  });
});

describe("what the mail door decided is counted, not hidden", () => {
  test("held: this copy of the site may not write to them, and their result is still published", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = () => "held";
    const result = await press(db);
    assert.deepEqual([result.report.published, result.report.emailed, result.report.held], [8, 0, 7]);
    assert.equal(result.report.complete, true);
    assert.equal(applicationOf(db, "amara").status, "accepted");
    assert.match(auditRows(db)[0].detail, /0 emailed, 7 held, 0 suppressed,/);
    assertAddsUp(result.report, 8);
  });

  test("suppressed: an address on the do-not-email list is counted on its own", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = (args) => (args.to === "ben@example.com" ? "suppressed" : "sent");
    const result = await press(db);
    assert.deepEqual([result.report.emailed, result.report.suppressed, result.report.failed], [6, 1, 0]);
    assertAddsUp(result.report, 8);
  });

  test("the audit sentence fits the log's limit however long the list of failures", () => {
    const report = {
      owedOnly: false, published: 500, retried: 0, emailed: 0, held: 0, suppressed: 0, failed: 250,
      unconfirmed: 250, notEmailed: 0, skipped: 0, changed: 0, notReached: 0, failedNames: [],
      unconfirmedNames: [], accountsApproved: 66, accountsFailed: [], accountsRefused: [],
      stopped: null, complete: true,
    };
    const uids = Array.from({ length: 250 }, (_, i) => `a-rather-long-uid-${i}`);
    assert.ok(send.auditDetail("Autumn 2026", report, uids, uids).length <= 1000);
  });
});

// ---------------------------------------------------------------------------
// 1b. What became of each email, and what a later press does about it
// ---------------------------------------------------------------------------

/** Five minutes is how long a claim is read as a press still at work. */
const later = (minutes) => () => new Date(NOW.getTime() + minutes * 60_000);

describe("what became of the email is recorded on the result", () => {
  test("while it is being handed over, the result says a press holds it", async () => {
    const db = makeDb(seed());
    const seen = [];
    globalThis.__ddMail.verdict = (args) => {
      const uid = args.to.split("@")[0];
      seen.push(emailOf(db, uid));
      return "sent";
    };
    await press(db);
    assert.equal(seen.length, 7);
    for (const held of seen) assert.deepEqual(held, ["sending", null, NOW]);
  });

  const STATES = [
    // [the mail door's answer, the state recorded, when it went, the report's count]
    ["sent", "sent", NOW, "emailed"],
    ["held", "held", null, "held"],
    ["suppressed", "suppressed", null, "suppressed"],
    ["throw", "owed", null, "failed"],
    ["cut-off", "unconfirmed", null, "unconfirmed"],
  ];
  for (const [verdict, state, emailedAt, count] of STATES) {
    test(`the mail door answers "${verdict}": the result says ${state}, and nobody holds it`, async () => {
      const db = makeDb(seed());
      globalThis.__ddMail.verdict = (args) => (args.to === "ben@example.com" ? verdict : "sent");
      const result = await quietly(() => press(db));
      assert.deepEqual(emailOf(db, "ben"), [state, emailedAt, null]);
      assert.equal(result.report[count], count === "emailed" ? 7 : 1);
      assert.equal(applicationOf(db, "ben").status, "no-offer", "the result is published whatever the email did");
      assertAddsUp(result.report, 8);
      // Everybody else's went, and says so.
      assert.deepEqual(emailOf(db, "amara"), ["sent", NOW, null]);
    });
  }

  test("a declined application is settled as not sent, or as sent when the switch is on", async () => {
    const off = makeDb(seed());
    await press(off);
    assert.deepEqual(emailOf(off, "zara"), ["not-sent", null, null]);
    const on = makeDb(seed());
    await press(on, { emails: 8, emailDeclined: true });
    assert.deepEqual(emailOf(on, "zara"), ["sent", NOW, null]);
  });

  test("an attempt nobody can vouch for is not tried again, even within the press", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = (args) => (args.to === "nina@example.com" ? "cut-off" : "sent");
    const result = await quietly(() => press(db));
    assert.equal(mailTo("nina@example.com").length, 1, "one attempt: the message may already have gone");
    assert.deepEqual(
      [result.report.unconfirmed, result.report.unconfirmedNames, result.report.failed],
      [1, ["Nina Petrova"], 0],
    );
    assert.match(auditRows(db)[0].detail, /0 failed, 1 unconfirmed, 1 not emailed\..*Email unconfirmed for: nina\.$/);
    assertAddsUp(result.report, 8);
  });

  test("when the first email cannot be vouched for, the send stops with one person told", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = () => "cut-off";
    const result = await quietly(() => press(db));
    assert.deepEqual(
      [result.report.published, result.report.unconfirmed, result.report.notReached, result.report.stopped],
      [1, 1, 7, "emails-failing"],
    );
    assert.equal(globalThis.__ddMail.calls.length, 1);
    assertAddsUp(result.report, 8);
  });

  test("the record that could not be written leaves the email held, and it is never sent again", async () => {
    const db = makeDb(seed());
    const ninaPath = `admissionApplications/${ROUND}__nina`;
    // Her email goes, and then every attempt to record that it went fails.
    db.failCommits((ops) => ops.some((op) => op.path === ninaPath && op.data["result.email"] === "sent"));
    const result = await quietly(() => press(db));
    db.failCommits(null);
    assert.equal(mailTo("nina@example.com").length, 1, "it went");
    assert.equal(result.report.emailed, 7, "and the press counts it as sent, which it was");
    assert.deepEqual(emailOf(db, "nina"), ["sending", null, NOW], "but the record still says a press holds it");
    assertAddsUp(result.report, 8);

    // A minute later it reads as in flight, and after any press could still be
    // alive it reads as unconfirmed. Either way no press takes it up.
    const form = await repo.loadForm(db, ROUND);
    const soon = await send.buildSendBoard(db, form, ACTOR.uid, later(1)());
    assert.deepEqual([soon.owed.inFlight, soon.owed.unconfirmed, soon.owed.people], [1, [], []]);
    const afterwards = await send.buildSendBoard(db, form, ACTOR.uid, later(6)());
    assert.deepEqual(
      [afterwards.owed.inFlight, afterwards.owed.unconfirmed.map((p) => p.name), afterwards.owed.people],
      [0, ["Nina Petrova"], []],
    );
    for (const at of [later(1), later(6), later(600)]) {
      const again = await pressOwed(db, 0, at);
      assert.deepEqual([again.ok, again.report.retried, again.report.emailed], [true, 0, 0]);
    }
    assert.equal(mailTo("nina@example.com").length, 1, "nobody is emailed their decision twice");
  });
});

describe("a later press sends what is owed, and nothing else", () => {
  /** Press once with Nina's email refused: the term is sent, and one email is owed. */
  async function withOneOwed() {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = (args) => (args.to === "nina@example.com" ? "throw" : "sent");
    await quietly(() => press(db));
    globalThis.__ddMail.verdict = null;
    globalThis.__ddMail.calls.length = 0;
    return db;
  }

  test("the term is marked as sent with an email still owed, and the owed press sends it", async () => {
    const db = await withOneOwed();
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW, "everybody has their result, so the term is sent");
    assert.deepEqual(emailOf(db, "nina"), ["owed", null, null]);
    // The main press is finished for good. The owed press is not.
    assert.equal((await press(db, { emails: 1, emailDeclined: false })).status, 409);

    const result = await pressOwed(db, 1);
    assert.deepEqual(result.report, {
      owedOnly: true,
      published: 0,
      retried: 1,
      emailed: 1,
      held: 0,
      suppressed: 0,
      failed: 0,
      unconfirmed: 0,
      notEmailed: 0,
      skipped: 7,
      changed: 0,
      notReached: 0,
      failedNames: [],
      unconfirmedNames: [],
      accountsApproved: 0,
      accountsFailed: [],
      accountsRefused: [],
      stopped: null,
      complete: true,
    });
    assertAddsUp(result.report, 8);
    assert.deepEqual(
      globalThis.__ddMail.calls.map((call) => [call.to, call.subject, call.replyTo, call.kind]),
      [["nina@example.com", "Your NAISI application", "ai-safety@uonsu.com", "admissions"]],
    );
    assert.deepEqual(emailOf(db, "nina"), ["sent", NOW, null]);
    // What she was told is not rewritten: only the record of her email moved.
    const { result: told, status } = applicationOf(db, "nina");
    assert.deepEqual([status, told.kind, told.programmeId, told.publishedAt], ["no-offer", "no-offer", null, NOW]);
    assert.deepEqual(roundOf(db).applicationCounts, { submitted: 0, accepted: 3, invited: 1, "no-offer": 3, declined: 1 });
  });

  test("it leaves one audit row of its own, and does not stamp the form again", async () => {
    const db = await withOneOwed();
    db.patch(`admissionRounds/${ROUND}`, { decisionsSentByUid: "somebody-else" });
    await pressOwed(db, 1);
    const rows = auditRows(db);
    assert.equal(rows.length, 2);
    assert.equal(
      rows[1].detail,
      "Took up 1 owed email for Autumn 2026: 1 emailed, 0 held, 0 suppressed, 0 failed, 0 unconfirmed, 0 not emailed.",
    );
    assert.equal(roundOf(db).decisionsSentByUid, "somebody-else", "who sent the term is not rewritten");
  });

  test("pressed again with nothing owed, it sends nothing, writes nothing and logs nothing", async () => {
    const db = await withOneOwed();
    await pressOwed(db, 1);
    const writes = db.counters.writes;
    const again = await pressOwed(db, 0);
    assert.deepEqual([again.ok, again.report.retried, again.report.emailed, again.report.skipped], [true, 0, 0, 8]);
    assert.equal(globalThis.__ddMail.calls.length, 1);
    assert.equal(db.counters.writes, writes);
    assert.equal(auditRows(db).length, 2);
    assertAddsUp(again.report, 8);
  });

  test("it is refused when the number of emails is not the number the admin was shown", async () => {
    const db = await withOneOwed();
    const writes = db.counters.writes;
    const result = await pressOwed(db, 3);
    assert.deepEqual([result.status, result.error], [
      409,
      "The decisions have changed since this page loaded: this would now send 1 email, not 3. Reload the page and check again.",
    ]);
    assert.equal(db.counters.writes, writes);
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  test("an owed email that fails again stays owed, and one that goes after a refusal is sent once", async () => {
    const db = await withOneOwed();
    globalThis.__ddMail.verdict = () => "throw";
    const failed = await quietly(() => pressOwed(db, 1));
    assert.deepEqual(
      [failed.report.retried, failed.report.failed, failed.report.failedNames, failed.report.stopped],
      [1, 1, ["Nina Petrova"], "emails-failing"],
    );
    assert.deepEqual(emailOf(db, "nina"), ["owed", null, null]);
    assertAddsUp(failed.report, 8);

    globalThis.__ddMail.verdict = null;
    globalThis.__ddMail.calls.length = 0;
    const sent = await pressOwed(db, 1);
    assert.deepEqual([sent.report.retried, sent.report.emailed], [1, 1]);
    assert.equal(mailTo("nina@example.com").length, 1);
    assert.deepEqual(emailOf(db, "nina"), ["sent", NOW, null]);
  });

  test("it does not wait for the rest of the term: an owed email goes while a decision is still owed", async () => {
    // Amara was told and her email is owed. Ben's programme has not decided,
    // so the term is not ready and the main press is refused.
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__amara`]: toldDoc("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI, { email: "owed" }),
        [`admissionDecisions/${ROUND}__ben`]: decisionDoc("ben", {}),
        [`admissionRounds/${ROUND}`]: { ...roundDoc(), applicationCounts: { submitted: 7, accepted: 1 } },
      }),
    );
    assert.equal((await press(db, { emails: 7, emailDeclined: false })).status, 409);
    const result = await pressOwed(db, 1);
    assert.deepEqual([result.report.retried, result.report.emailed, result.report.published, result.report.complete], [1, 1, 0, false]);
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.subject), ["You’re in AGI Strategy"]);
    assert.equal(roundOf(db).decisionsSentAt, null, "it tells nobody new and never marks the term as sent");
    assert.equal(applicationOf(db, "ben").result, null);
  });

  test("it is refused on a form that is archived or cancelled, and where the site has no address", async () => {
    const owedAmara = {
      [`admissionApplications/${ROUND}__amara`]: toldDoc("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI, { email: "owed" }),
    };
    const archived = makeDb(seed({ ...owedAmara, [`admissionRounds/${ROUND}`]: roundDoc({ archived: true }) }));
    assert.deepEqual(
      [(await pressOwed(archived, 1)).status, (await pressOwed(archived, 1)).error],
      [409, "This application form is archived, so nothing can be sent from it."],
    );
    const cancelled = makeDb(seed({ ...owedAmara, [`admissionRounds/${ROUND}`]: roundDoc({ status: "cancelled" }) }));
    assert.equal((await pressOwed(cancelled, 1)).status, 409);
    const db = makeDb(seed(owedAmara));
    process.env.NEXT_PUBLIC_APP_URL = "";
    try {
      assert.match((await pressOwed(db, 1)).error, /doesn’t know its own address/);
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = APP_URL;
    }
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  /** Everybody told already, one person in each state an email can be left in. */
  function everyState() {
    const claimed = (minutesAgo) => ({
      email: "sending",
      emailClaimedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    });
    const person = (uid, name, ranked, kind, programmeId, email, over) => [
      `admissionApplications/${ROUND}__${uid}`,
      toldDoc(uid, name, ranked, kind, programmeId, email, over),
    ];
    return Object.fromEntries([
      person("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI, SENT),
      person("sam", "Sam Whitfield", [TAIS], "accepted", TAIS, { email: "held" }),
      person("wen", "Wen Zhao", [TAIS, AGI], "accepted", TAIS, { email: "suppressed" }),
      person("oliver", "Oliver Grant", [INC], "invited", TAIS, { email: "unconfirmed" }),
      // A press took Rosa's email up a minute ago and is still at work.
      person("rosa", "Rosa García", [INC, AGI], "no-offer", null, claimed(1)),
      // A press took Nina's up ten minutes ago and never said what happened.
      person("nina", "Nina Petrova", [AGI], "no-offer", null, claimed(10)),
      // Ben's is owed, and there is somewhere to send it.
      person("ben", "Ben Hartley", [AGI], "no-offer", null, { email: "owed" }),
      person("zara", "Zara Ahmed", [AGI], "declined", null, { email: "not-sent" }),
    ]);
  }
  const allTold = { submitted: 0, accepted: 3, invited: 1, "no-offer": 3, declined: 1 };

  test("of every state an email can be left in, only owed is sent", async () => {
    const db = makeDb(seed({ ...everyState(), [`admissionRounds/${ROUND}`]: { ...roundDoc(), applicationCounts: allTold } }));
    const before = Object.fromEntries(PEOPLE.map(([uid]) => [uid, structuredClone(applicationOf(db, uid).result)]));
    const result = await pressOwed(db, 1);
    assert.deepEqual([result.report.retried, result.report.emailed, result.report.skipped], [1, 1, 7]);
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.to), ["ben@example.com"]);
    assert.deepEqual(emailOf(db, "ben"), ["sent", NOW, null]);
    for (const [uid] of PEOPLE) {
      if (uid !== "ben") assert.deepEqual(applicationOf(db, uid).result, before[uid], `${uid}'s result is untouched`);
    }
    assertAddsUp(result.report, 8);
  });

  test("the main press over the same term sends the owed one, finishes the term and emails nobody else", async () => {
    const db = makeDb(seed({ ...everyState(), [`admissionRounds/${ROUND}`]: { ...roundDoc(), applicationCounts: allTold } }));
    // Nobody is left to tell, so the button's number is the one owed email.
    const result = await press(db, { emails: 1, emailDeclined: true });
    assert.deepEqual([result.report.published, result.report.retried, result.report.emailed, result.report.complete], [0, 1, 1, true]);
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.to), ["ben@example.com"]);
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW);
    assertAddsUp(result.report, 8);
  });

  test("a result with no record of its email is read as unconfirmed, and nothing is sent on a guess", async () => {
    const bare = applicationDoc("ben", "Ben Hartley", [AGI], {
      status: "no-offer",
      result: { kind: "no-offer", programmeId: null, publishedAt: DECIDED },
    });
    const db = makeDb(seed({ ...everyState(), [`admissionApplications/${ROUND}__ben`]: bare }));
    const view = await send.buildSendBoard(db, await repo.loadForm(db, ROUND), ACTOR.uid, NOW);
    assert.ok(view.owed.unconfirmed.some((person) => person.name === "Ben Hartley"));
    assert.deepEqual(view.owed.people, []);
    const result = await pressOwed(db, 0);
    assert.equal(result.report.retried, 0);
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  test("an owed declined email goes whatever the switch says now: it was earned when they were told", async () => {
    const db = makeDb(
      seed({
        ...everyState(),
        [`admissionApplications/${ROUND}__ben`]: toldDoc("ben", "Ben Hartley", [AGI], "no-offer", null, SENT),
        [`admissionApplications/${ROUND}__zara`]: toldDoc("zara", "Zara Ahmed", [AGI], "declined", null, { email: "owed" }),
      }),
    );
    const result = await pressOwed(db, 1);
    assert.equal(result.report.emailed, 1);
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => [call.to, call.subject]), [["zara@example.com", "Your NAISI application"]]);
  });

  test("somebody owed an email with no address is not taken up, and the page says so by name", async () => {
    const db = makeDb(
      seed({
        ...everyState(),
        [`admissionApplications/${ROUND}__ben`]: toldDoc("ben", "Ben Hartley", [AGI], "no-offer", null, { email: "owed" }, { email: null }),
      }),
    );
    const view = await send.buildSendBoard(db, await repo.loadForm(db, ROUND), ACTOR.uid, NOW);
    assert.deepEqual([view.owed.people, view.owed.noAddress.map((p) => p.name)], [[], ["Ben Hartley"]]);
    const result = await pressOwed(db, 0);
    assert.deepEqual([result.ok, result.report.retried], [true, 0]);
    assert.deepEqual(globalThis.__ddMail.calls, []);
    assert.deepEqual(emailOf(db, "ben"), ["owed", null, null], "still owed, for when there is somewhere to send it");
  });

  test("an owed email goes to the address on the application now", async () => {
    const db = await withOneOwed();
    db.patch(`admissionApplications/${ROUND}__nina`, { email: "nina.petrova@example.com" });
    await pressOwed(db, 1);
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.to), ["nina.petrova@example.com"]);
  });

  test("an application withdrawn since is owed nothing", async () => {
    const db = await withOneOwed();
    db.patch(`admissionApplications/${ROUND}__nina`, { status: "withdrawn", withdrawnAt: NOW });
    const result = await pressOwed(db, 0);
    assert.deepEqual([result.ok, result.report.retried], [true, 0]);
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });
});

describe("two presses at once email nobody twice", () => {
  /** A mail door slow enough for two presses to overlap. */
  const slowly = (answer = () => "sent") => async (args, n) => {
    await new Promise((resolve) => setTimeout(resolve, 3));
    return answer(args, n);
  };
  const perAddress = () => {
    const counts = {};
    for (const call of globalThis.__ddMail.calls) counts[call.to] = (counts[call.to] ?? 0) + 1;
    return counts;
  };
  const ONCE_EACH = {
    "amara@example.com": 1,
    "ben@example.com": 1,
    "nina@example.com": 1,
    "oliver@example.com": 1,
    "rosa@example.com": 1,
    "sam@example.com": 1,
    "wen@example.com": 1,
  };

  test("two presses of Send over a ready term: each person is told once and emailed once", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = slowly();
    const [first, second] = await Promise.all([press(db), press(db)]);
    assert.deepEqual([first.ok, second.ok], [true, true]);
    assert.deepEqual(perAddress(), ONCE_EACH);
    assert.equal(first.report.published + second.report.published, 8, "each person was published by one press");
    assert.equal(first.report.emailed + second.report.emailed, 7);
    assertAddsUp(first.report, 8);
    assertAddsUp(second.report, 8);
    assert.ok(db.reruns() > 0, "the two presses really did meet on a document");
    // The counters moved once per person, and everybody's email is settled.
    assert.deepEqual(roundOf(db).applicationCounts, { submitted: 0, accepted: 3, invited: 1, "no-offer": 3, declined: 1 });
    for (const [uid] of PEOPLE) {
      assert.equal(emailOf(db, uid)[0], uid === "zara" ? "not-sent" : "sent", uid);
    }
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW);
  });

  test("two presses for the same owed emails: each email is taken up by one of them", async () => {
    const owedPeople = ["amara", "sam", "wen", "oliver", "rosa", "nina", "ben"];
    const told = Object.fromEntries(
      PEOPLE.map(([uid, name, ranked, verdicts, outcome]) => {
        const kind = outcome ? (outcome.kind === "invite" ? "invited" : "no-offer") : Object.values(verdicts)[0] === "accept" ? "accepted" : "declined";
        const programmeId = kind === "accepted" ? Object.keys(verdicts)[0] : kind === "invited" ? outcome.programmeId : null;
        const email = owedPeople.includes(uid) ? { email: "owed" } : { email: "not-sent" };
        return [`admissionApplications/${ROUND}__${uid}`, toldDoc(uid, name, ranked, kind, programmeId, email)];
      }),
    );
    const db = makeDb(seed({ ...told, [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: NOW, decisionsSentByUid: "zach" }) }));
    globalThis.__ddMail.verdict = slowly();
    const [first, second] = await Promise.all([pressOwed(db, 7), pressOwed(db, 7)]);
    assert.deepEqual(perAddress(), ONCE_EACH);
    assert.equal(first.report.retried + second.report.retried, 7, "each owed email was taken up by one press");
    assert.equal(first.report.emailed + second.report.emailed, 7);
    assertAddsUp(first.report, 8);
    assertAddsUp(second.report, 8);
    assert.ok(db.reruns() > 0, "the two presses really did meet on a document");
    for (const uid of owedPeople) assert.deepEqual(emailOf(db, uid), ["sent", NOW, null], uid);
  });

  test("a press of Send and the owed press at once: the owed email still goes once", async () => {
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__amara`]: toldDoc("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI, { email: "owed" }),
        [`admissionRounds/${ROUND}`]: { ...roundDoc(), applicationCounts: { submitted: 7, accepted: 1 } },
      }),
    );
    globalThis.__ddMail.verdict = slowly();
    const [main, owedPress] = await Promise.all([press(db, { emails: 7, emailDeclined: false }), pressOwed(db, 1)]);
    assert.deepEqual([main.ok, owedPress.ok], [true, true]);
    assert.deepEqual(perAddress(), ONCE_EACH);
    assert.equal(main.report.retried + owedPress.report.retried, 1);
    assertAddsUp(main.report, 8);
    assertAddsUp(owedPress.report, 8);
  });

  test("a refusal in one press does not let the other send it as well in the same moment", async () => {
    // Both presses want Amara's owed email. Whichever takes it up is refused
    // by the mail server; the other has already stood down, so one press tried
    // it (twice, as a refusal allows) and it is owed again for the next press.
    const db = makeDb(
      seed({
        ...Object.fromEntries(
          PEOPLE.filter(([uid]) => uid !== "amara").map(([uid, name, ranked]) => [
            `admissionApplications/${ROUND}__${uid}`,
            toldDoc(uid, name, ranked, uid === "zara" ? "declined" : "no-offer", null, uid === "zara" ? { email: "not-sent" } : SENT),
          ]),
        ),
        [`admissionApplications/${ROUND}__amara`]: toldDoc("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI, { email: "owed" }),
        [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: NOW, decisionsSentByUid: "zach" }),
      }),
    );
    globalThis.__ddMail.verdict = slowly(() => "throw");
    const [first, second] = await quietly(() => Promise.all([pressOwed(db, 1), pressOwed(db, 1)]));
    assert.equal(first.report.retried + second.report.retried, 1, "one press took it up");
    assert.equal(first.report.skipped + second.report.skipped, 15, "the other stood down");
    assert.equal(mailTo("amara@example.com").length, 2, "the one press's two attempts, and no third");
    assert.deepEqual(emailOf(db, "amara"), ["owed", null, null]);
  });
});

// ---------------------------------------------------------------------------
// 1c. Accepting somebody approves an account that is still waiting
// ---------------------------------------------------------------------------

describe("accepting somebody approves an account that is still waiting", () => {
  const userOf = (db, uid) => db.read(`users/${uid}`);
  const waiting = (name) => userDoc(name, "pending");

  test("the send approves it in the admin's name, with the change the Approvals tab makes", async () => {
    const db = makeDb(seed());
    const before = structuredClone(userOf(db, "wen"));
    const result = await press(db);
    // Three fields, and nothing else on her account.
    assert.deepEqual(userOf(db, "wen"), { ...before, role: "member", approvedAt: NOW, approvedBy: "zach" });
    assert.equal(result.report.accountsApproved, 1);
    assert.deepEqual([result.report.accountsFailed, result.report.accountsRefused], [[], []]);
    assert.match(auditRows(db)[0].detail, /Approved 1 waiting account\./);
  });

  test("she is a member before her email is handed over", async () => {
    const db = makeDb(seed());
    let roleAtEmail = "not asked";
    globalThis.__ddMail.verdict = (args) => {
      if (args.to === "wen@example.com") roleAtEmail = userOf(db, "wen").role;
      return "sent";
    };
    await press(db);
    assert.equal(roleAtEmail, "member");
  });

  test("only somebody told they are in: an invitation, a kind no and a declined application approve nobody", async () => {
    const others = {
      "users/oliver": waiting("Oliver Grant"),
      "users/rosa": waiting("Rosa García"),
      "users/nina": waiting("Nina Petrova"),
      "users/ben": waiting("Ben Hartley"),
      "users/zara": waiting("Zara Ahmed"),
    };
    const db = makeDb(seed(others));
    const result = await press(db, { emails: 8, emailDeclined: true });
    assert.equal(result.report.accountsApproved, 1, "Wen, and only Wen");
    for (const [path, account] of Object.entries(others)) assert.deepEqual(db.read(path), account, path);
  });

  test("a member, a committee member and an admin who are accepted are left exactly as they are", async () => {
    const accounts = {
      "users/amara": userDoc("Amara Okafor", "committee"),
      "users/sam": userDoc("Sam Whitfield", "admin"),
      "users/wen": userDoc("Wen Zhao", "member"),
    };
    const db = makeDb(seed(accounts));
    const result = await press(db);
    assert.equal(result.report.accountsApproved, 0);
    for (const [path, account] of Object.entries(accounts)) assert.deepEqual(db.read(path), account, path);
    assert.ok(!auditRows(db)[0].detail.includes("Approved"));
  });

  test("a refused account stays refused, and is named before the send and after it", async () => {
    const refused = { ...userDoc("Sam Whitfield", "rejected"), rejectedAt: DECIDED, rejectedBy: "zach", rejectionReason: "not-eligible" };
    const db = makeDb(seed({ "users/sam": refused }));
    const before = await send.buildSendBoard(db, await repo.loadForm(db, ROUND), ACTOR.uid, NOW);
    assert.deepEqual(before.accountsRefused, [{ uid: "sam", name: "Sam Whitfield" }]);
    assert.equal(before.accountsWaiting, 1);

    const result = await press(db);
    assert.deepEqual(result.report.accountsRefused, ["Sam Whitfield"]);
    assert.deepEqual(db.read("users/sam"), refused, "sending never undoes a refusal");
    assert.equal(applicationOf(db, "sam").status, "accepted", "he is still told what the programme decided");
    const after = await send.buildSendBoard(db, await repo.loadForm(db, ROUND), ACTOR.uid, NOW);
    assert.deepEqual([after.accountsRefused.map((p) => p.name), after.accountsWaiting], [["Sam Whitfield"], 0]);
  });

  test("somebody accepted with no account document is told, and nothing is invented for them", async () => {
    // Amara, Sam and Wen have accounts in the seed. Take Sam's away.
    const db = makeDb(Object.fromEntries(Object.entries(seed()).filter(([path]) => path !== "users/sam")));
    const result = await press(db);
    assert.equal(result.report.accountsApproved, 1);
    assert.equal(db.read("users/sam"), undefined);
    assert.deepEqual(result.report.accountsFailed, []);
    assert.equal(applicationOf(db, "sam").status, "accepted");
  });

  test("an approval that fails does not stop the send, is named, and the next press approves it", async () => {
    const db = makeDb(seed());
    db.failCommits((ops) => ops.some((op) => op.path === "users/wen"));
    const result = await quietly(() => press(db));
    db.failCommits(null);
    assert.deepEqual([result.report.accountsApproved, result.report.accountsFailed], [0, ["Wen Zhao"]]);
    assert.equal(result.report.emailed, 7, "her email still went");
    assert.equal(applicationOf(db, "wen").status, "accepted");
    assert.equal(userOf(db, "wen").role, "pending");
    // The term is sent, and the page still says one accepted account is waiting.
    const view = await send.buildSendBoard(db, await repo.loadForm(db, ROUND), ACTOR.uid, NOW);
    assert.deepEqual([view.sentOn, view.accountsWaiting], ["Fri 23 Oct", 1]);

    // Any later press tries again for somebody an earlier press told.
    const again = await pressOwed(db, 0);
    assert.deepEqual([again.report.accountsApproved, again.report.accountsFailed], [1, []]);
    assert.deepEqual([userOf(db, "wen").role, userOf(db, "wen").approvedBy], ["member", "zach"]);
    assert.equal(mailTo("wen@example.com").length, 1, "and she is not emailed again for it");
    assert.equal(
      auditRows(db).at(-1).detail,
      "Took up 0 owed emails for Autumn 2026: 0 emailed, 0 held, 0 suppressed, 0 failed, 0 unconfirmed, 0 not emailed. Approved 1 waiting account.",
    );
  });

  test("somebody who has said they can't take the place is not approved by a later press", async () => {
    const gaveUp = toldDoc("wen", "Wen Zhao", [TAIS, AGI], "accepted", TAIS, SENT, {
      attendance: { answer: "cant-make-it", answeredAt: DECIDED },
    });
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__wen`]: gaveUp,
        [`admissionRounds/${ROUND}`]: { ...roundDoc(), applicationCounts: { submitted: 7, accepted: 1 } },
      }),
    );
    const result = await press(db, { emails: 6, emailDeclined: false });
    assert.equal(result.report.accountsApproved, 0);
    assert.equal(userOf(db, "wen").role, "pending");
  });

  test("an invited person who has accepted is approved by the next press, if nothing approved them yet", async () => {
    const invitation = (response) => ({
      invitation: { programmeId: TAIS, replyBy: "2026-10-25", response, respondedAt: response ? DECIDED : null, lastReminderOn: null },
    });
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__oliver`]: toldDoc("oliver", "Oliver Grant", [INC], "invited", TAIS, SENT, invitation("accepted")),
        [`admissionApplications/${ROUND}__rosa`]: toldDoc("rosa", "Rosa García", [INC, AGI], "invited", TAIS, SENT, invitation(null)),
        "users/oliver": waiting("Oliver Grant"),
        "users/rosa": waiting("Rosa García"),
        "users/wen": userDoc("Wen Zhao", "member"),
        [`admissionRounds/${ROUND}`]: { ...roundDoc(), applicationCounts: { submitted: 6, invited: 2 } },
      }),
    );
    const result = await press(db, { emails: 5, emailDeclined: false });
    assert.equal(result.report.accountsApproved, 1);
    assert.equal(userOf(db, "oliver").role, "member");
    assert.equal(userOf(db, "rosa").role, "pending", "an invitation nobody has answered approves nobody");
  });

  test("two presses at once approve her once", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = async () => {
      await new Promise((resolve) => setTimeout(resolve, 3));
      return "sent";
    };
    const [first, second] = await Promise.all([press(db), press(db)]);
    assert.equal(first.report.accountsApproved + second.report.accountsApproved, 1);
    assert.deepEqual([userOf(db, "wen").role, userOf(db, "wen").approvedBy], ["member", "zach"]);
  });
});

// ---------------------------------------------------------------------------
// 2. The page
// ---------------------------------------------------------------------------

describe("the decision-day page", () => {
  const board = async (db) => send.buildSendBoard(db, await repo.loadForm(db, ROUND), ACTOR.uid, NOW);

  test("a ready term reads as ready, group by group", async () => {
    const view = await board(makeDb(seed()));
    assert.deepEqual(view.blockers, []);
    assert.deepEqual([view.termLabel, view.today, view.applied, view.sentOn, view.published], ["Autumn 2026", "Fri 23 Oct", 8, null, 0]);
    assert.deepEqual(view.readiness, [
      { key: AGI, title: "AGI Strategy", owner: "Claudia", ready: true, status: "Every application has a decision", detail: "1 of 32 places" },
      { key: TAIS, title: "Technical AI Safety", owner: "Zach", ready: true, status: "Every application has a decision", detail: "2 of 24 places, and 1 invitation" },
      { key: INC, title: "Research incubator", owner: "Zach", ready: true, status: "Every application has a decision", detail: "0 of 12 places" },
      { key: "pooled", title: "Pooled applicants", owner: "Committee", ready: true, status: "Every pooled person has an outcome", detail: "1 invitation, 3 no offer" },
      // Who tested these emails and when: the last thing a send waits for.
      { key: "#test", title: "Test email", owner: "Zach", ready: true, status: "Sent Thu 22 Oct, 15:10", detail: "" },
    ]);
    assert.equal(view.test, "fresh");
    assert.deepEqual(view.accepted.people.map((p) => p.name), ["Amara Okafor", "Sam Whitfield", "Wen Zhao"]);
    assert.deepEqual(view.invited.people.map((p) => p.name), ["Oliver Grant"]);
    assert.deepEqual(view.noOffer.people.map((p) => p.name), ["Ben Hartley", "Nina Petrova", "Rosa García"]);
    assert.deepEqual(view.declined, { count: 1 });
    assert.deepEqual(view.pending, { people: 8, emails: 7, declined: 1, perPress: send.MAX_PEOPLE_PER_PRESS });
    assert.deepEqual([view.replyBy, view.fromName, view.replyTo], ["Sun 25 Oct", "NAISI", "ai-safety@uonsu.com"]);
    // "Edit wording" opens the settings of the programme each preview is
    // worded by. "No offer this time" is the form's own, so it names none.
    assert.deepEqual(
      [view.accepted.wordingProgrammeId, view.invited.wordingProgrammeId, view.noOffer.wordingProgrammeId],
      [AGI, TAIS, null],
    );
  });

  test("an empty group has no wording to edit", async () => {
    const nobodyInvited = PEOPLE.filter(([uid]) => uid !== "oliver");
    const view = await board(makeDb(seed({}, nobodyInvited)));
    assert.deepEqual([view.invited.preview, view.invited.wordingProgrammeId], [null, null]);
  });

  test("it says how many accepted people have an account still waiting", async () => {
    const db = makeDb(seed());
    const before = await board(db);
    assert.deepEqual([before.accountsWaiting, before.accountsRefused], [1, []]);
    await press(db);
    assert.equal((await board(db)).accountsWaiting, 0, "the send approved it");
  });

  // "They get a reminder each day until they reply" is a promise about a
  // scheduled job, so the page makes it only while a scheduled run has
  // actually run that job (`decisionDay/armed.ts`). NOW is 11:00 UTC on Fri
  // 23 Oct, so the run the scheduler started in this quarter of an hour left
  // its receipt under the id below.
  test("it promises a daily reminder only while the scheduler has run the reminder job", async () => {
    const receipt = (skipped) => ({
      "schedulerRuns/tick__20261023T1100Z__d0": {
        jobs: [
          { id: "heartbeat", processed: 1, hasMore: false, durationMs: 1, error: null, skipped: null },
          { id: "application-invitation-reminders", processed: 0, hasMore: false, durationMs: 3, error: null, skipped },
        ],
      },
    });
    assert.equal((await board(makeDb(seed()))).remindsDaily, false, "no scheduled run on this copy of the site");
    assert.equal((await board(makeDb(seed(receipt("disabled"))))).remindsDaily, false, "the job is switched off");
    assert.equal((await board(makeDb(seed(receipt(null))))).remindsDaily, true);
  });

  test("it says when this copy of the site only emails its own list", async () => {
    assert.equal((await board(makeDb(seed()))).emailsEveryone, false);
  });

  test("each preview is the email its first person will get, word for word", async () => {
    const db = makeDb(seed());
    const view = await board(db);
    await press(db);
    const sentTo = { accepted: "amara@example.com", invited: "oliver@example.com", noOffer: "ben@example.com" };
    for (const [group, address] of Object.entries(sentTo)) {
      const { preview } = view[group];
      const [call] = mailTo(address);
      assert.equal(preview.subject, call.subject, group);
      const text = await render(call.react, { plainText: true });
      for (const piece of [preview.greeting, ...preview.paragraphs, preview.signOff.name]) {
        assert.ok(text.includes(piece), `${group}: the email does not say "${piece}"`);
      }
      for (const button of preview.buttons) assert.ok(text.includes(button.label));
    }
    assert.equal(view.accepted.preview.to, "Amara Okafor", "a preview is to a name");
  });

  test("it holds no applicant's address: the only one on it is where replies go", async () => {
    const view = await board(makeDb(seed()));
    const said = JSON.stringify({ ...view, replyTo: "" });
    assert.ok(!said.includes("@"), "an address reached the decision-day page");
    assert.ok(!said.includes("href"), "a preview needs no link");
  });

  test("a term that is not ready says why, and a read writes and sends nothing", async () => {
    const db = makeDb(seed({ [`admissionDecisions/${ROUND}__ben`]: decisionDoc("ben", { [AGI]: "pool" }) }));
    const view = await board(db);
    assert.deepEqual(view.blockers, ["1 pooled person still needs an outcome."]);
    assert.deepEqual(view.readiness.find((row) => row.key === "pooled"), {
      key: "pooled",
      title: "Pooled applicants",
      owner: "Committee",
      ready: false,
      status: "1 pooled person still needs an outcome",
      detail: "1 invitation, 2 no offer",
    });
    assert.deepEqual(view.pending, { people: 7, emails: 6, declined: 1, perPress: send.MAX_PEOPLE_PER_PRESS });
    assert.equal(db.counters.writes, 0);
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  test("after the send it reads as sent, by whom, with nothing left to do", async () => {
    const db = makeDb(seed());
    await press(db);
    const view = await board(db);
    assert.deepEqual([view.sentOn, view.sentBy, view.published], ["Fri 23 Oct", "Zach", 8]);
    assert.deepEqual(view.pending, { people: 0, emails: 0, declined: 0, perPress: send.MAX_PEOPLE_PER_PRESS });
    assert.deepEqual(view.accepted.people.map((p) => p.name), ["Amara Okafor", "Sam Whitfield", "Wen Zhao"]);
    assert.equal(view.blockers.length, 1);
    assert.deepEqual(view.owed, { people: [], noAddress: [], unconfirmed: [], inFlight: 0, blockers: [] });
  });

  test("before anybody is told, nobody is owed an email", async () => {
    const view = await board(makeDb(seed()));
    assert.deepEqual(view.owed, { people: [], noAddress: [], unconfirmed: [], inFlight: 0, blockers: [] });
  });

  test("somebody whose email did not follow their result is named, sent or not", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = (args) =>
      args.to === "nina@example.com" ? "throw" : args.to === "ben@example.com" ? "cut-off" : "sent";
    await quietly(() => press(db));
    const view = await board(db);
    assert.equal(view.sentOn, "Fri 23 Oct", "the term is sent");
    assert.deepEqual(view.owed, {
      people: [{ uid: "nina", name: "Nina Petrova" }],
      noAddress: [],
      unconfirmed: [{ uid: "ben", name: "Ben Hartley" }],
      inFlight: 0,
      blockers: [],
    });
    // Still no address on the page, whoever is listed.
    assert.ok(!JSON.stringify({ ...view, replyTo: "" }).includes("@"));
  });

  test("it says why an owed email cannot be sent from a form that is archived", async () => {
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__amara`]: toldDoc("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI, { email: "owed" }),
        [`admissionRounds/${ROUND}`]: roundDoc({ archived: true }),
      }),
    );
    const view = await board(db);
    assert.deepEqual(view.owed.people.map((p) => p.name), ["Amara Okafor"]);
    assert.deepEqual(view.owed.blockers, ["This application form is archived, so nothing can be sent from it."]);
  });
});

// ---------------------------------------------------------------------------
// 3. A test to the admin's own address
// ---------------------------------------------------------------------------

describe("a test send", () => {
  const me = { uid: "zach", email: "zach@example.com" };

  // This test used to end "and writes nothing". A test is now recorded on the
  // form, because decision day cannot be sent without one (the owner's
  // decision of 7 October 2026). It still writes nothing anywhere else.
  test("goes to the admin and nobody else, marked as a test, and writes one thing: the form's record of it", async () => {
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionEmailTest: null }) }));
    const before = db.snapshot();
    const result = await send.sendTestEmail(db, me, ROUND, "accepted");
    assert.deepEqual(result, { ok: true, delivery: "sent", subject: "You’re in AGI Strategy", recorded: true });
    const { calls } = globalThis.__ddMail;
    assert.equal(calls.length, 1);
    assert.deepEqual(
      [calls[0].to, calls[0].subject, calls[0].kind, calls[0].replyTo, calls[0].actorUid],
      ["zach@example.com", "[TEST] You’re in AGI Strategy", "admin-test", "ai-safety@uonsu.com", "zach"],
    );
    // It is the first person's email exactly as they would get it.
    assert.ok((await render(calls[0].react, { plainText: true })).includes("Hi Amara,"));
    assert.equal(applicationOf(db, "amara").result, null);
    // One document changed, by one field: who, when, and the wording tested.
    assert.equal(db.counters.writes, 1);
    const after = db.snapshot();
    assert.deepEqual(
      Object.keys(after).filter((path) => JSON.stringify(after[path]) !== JSON.stringify(before[path])),
      [`admissionRounds/${ROUND}`],
    );
    assert.deepEqual(roundOf(db), {
      ...before[`admissionRounds/${ROUND}`],
      decisionEmailTest: { byUid: "zach", at: NOW, wording: testRecord(roundDoc()).wording },
    });
  });

  test("each of the three kinds can be tested", async () => {
    const db = makeDb(seed());
    const subjects = [];
    for (const kind of ["accepted", "invitation", "no-offer"]) {
      subjects.push((await send.sendTestEmail(db, me, ROUND, kind)).subject);
    }
    assert.deepEqual(subjects, ["You’re in AGI Strategy", "An invitation to Technical AI Safety", "Your NAISI application"]);
  });

  test("a group with nobody in it has no email to test", async () => {
    const nobodyInvited = PEOPLE.filter(([uid]) => uid !== "oliver");
    const result = await send.sendTestEmail(makeDb(seed({}, nobodyInvited)), me, ROUND, "invitation");
    assert.deepEqual([result.ok, result.status], [false, 409]);
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  test("what the mail door did with it is reported", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = () => "held";
    assert.equal((await send.sendTestEmail(db, me, ROUND, "accepted")).delivery, "held");
    globalThis.__ddMail.verdict = () => "throw";
    const failed = await quietly(() => send.sendTestEmail(db, me, ROUND, "accepted"));
    assert.deepEqual([failed.ok, failed.status], [false, 502]);
  });
});

// ---------------------------------------------------------------------------
// 3b. No press without a test of the emails as they are worded now
// ---------------------------------------------------------------------------

/**
 * The owner's decision of 7 October 2026: "I wouldn't let this happen without
 * a test." Decision day tells a whole term at once and cannot be unsent, so a
 * press is refused until an admin has sent themselves a test of the emails AS
 * THEY ARE WORDED NOW. Three cases, and the edges of each:
 *
 *  - NO TEST: refused, with a sentence that says what to do.
 *  - A STALE TEST: one sent before any decision email's wording changed.
 *    Refused, with a sentence that says the wording changed.
 *  - A FRESH TEST: the press goes.
 */
describe("no press without a test of the emails as they are worded now", () => {
  const me = { uid: "zach", email: "zach@example.com" };
  const NO_TEST = "Nobody has sent themselves a test of these emails yet. Send yourself one before you send.";
  const STALE_TEST =
    "A decision email’s wording has changed since the last test. Send yourself a test again before you send.";
  const board = async (db) => send.buildSendBoard(db, await repo.loadForm(db, ROUND), ACTOR.uid, NOW);
  const testRow = (view) => view.readiness.find((row) => row.key === "#test");
  const untouched = (db) => {
    assert.equal(db.counters.writes, 0);
    assert.deepEqual(globalThis.__ddMail.calls, []);
  };
  /** The round with one programme's own wording for one email. */
  const worded = (programmeId, emailWording, over = {}) => {
    const base = untestedRoundDoc();
    return {
      ...base,
      programmes: { ...base.programmes, [programmeId]: { ...base.programmes[programmeId], emailWording } },
      ...over,
    };
  };
  const untested = () => seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionEmailTest: null }) });

  test("NO TEST: the press is refused with a sentence to act on, and nothing is written or sent", async () => {
    const db = makeDb(untested());
    assert.deepEqual(await press(db), { ok: false, status: 409, error: NO_TEST });
    untouched(db);
    for (const uid of ["amara", "oliver", "nina"]) assert.equal(applicationOf(db, uid).result, null, uid);
    assert.equal(roundOf(db).decisionsSentAt, null);
  });

  test("NO TEST: the page says a test is owed, in the row and in the one thing left to do", async () => {
    const view = await board(makeDb(untested()));
    assert.equal(view.test, "none");
    assert.deepEqual(view.blockers, [NO_TEST], "every decision is made, so the test is all that is left");
    assert.deepEqual(testRow(view), {
      key: "#test",
      title: "Test email",
      owner: "An admin",
      ready: false,
      status: "No test sent yet",
      detail: "Send one below before you send",
    });
    // The rows above it are all ticked: the term is ready but for the test.
    assert.deepEqual(view.readiness.filter((row) => !row.ready).map((row) => row.key), ["#test"]);
    // And there is an email to test.
    assert.ok(view.accepted.preview && view.invited.preview && view.noOffer.preview);
  });

  test("A FRESH TEST: sending the test records who and when, and the press then goes", async () => {
    const db = makeDb(untested());
    assert.equal((await press(db)).status, 409);
    const tested = await send.sendTestEmail(db, me, ROUND, "accepted");
    assert.deepEqual([tested.ok, tested.delivery, tested.recorded], [true, "sent", true]);
    assert.deepEqual(roundOf(db).decisionEmailTest, {
      byUid: "zach",
      at: NOW,
      wording: testRecord(untestedRoundDoc()).wording,
    });
    const view = await board(db);
    assert.equal(view.test, "fresh");
    assert.deepEqual(view.blockers, []);
    assert.deepEqual(testRow(view), {
      key: "#test",
      title: "Test email",
      owner: "Zach",
      ready: true,
      // 11:00 UTC on Fri 23 Oct is noon in London.
      status: "Sent Fri 23 Oct, 12:00",
      detail: "",
    });
    globalThis.__ddMail.calls.length = 0;
    const result = await press(db);
    assert.equal(result.ok, true);
    assert.deepEqual([result.report.published, result.report.emailed, result.report.complete], [8, 7, true]);
    assert.equal(globalThis.__ddMail.calls.length, 7);
  });

  test("a test of any one of the three emails is a test", async () => {
    for (const kind of ["accepted", "invitation", "no-offer"]) {
      const db = makeDb(untested());
      assert.equal((await send.sendTestEmail(db, me, ROUND, kind)).recorded, true, kind);
      assert.equal((await board(db)).test, "fresh", kind);
    }
  });

  test("A STALE TEST: wording changed after the test, so the press is refused and says why", async () => {
    // Tested as the form stood, then AGI Strategy rewrote its "You're in".
    const record = testRecord(untestedRoundDoc());
    const changed = worded(AGI, { accepted: { subject: "Welcome to AGI Strategy", body: "" } }, { decisionEmailTest: record });
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: changed }));
    assert.deepEqual(await press(db), { ok: false, status: 409, error: STALE_TEST });
    untouched(db);

    const view = await board(db);
    assert.equal(view.test, "stale");
    assert.deepEqual(view.blockers, [STALE_TEST]);
    assert.deepEqual(testRow(view), {
      key: "#test",
      title: "Test email",
      owner: "Zach",
      ready: false,
      status: "Sent Thu 22 Oct, 15:10, and the wording has changed since",
      detail: "Send it again below before you send",
    });

    // Testing again, with the new wording, is what unlocks it.
    assert.equal((await send.sendTestEmail(db, me, ROUND, "accepted")).subject, "Welcome to AGI Strategy");
    assert.equal((await board(db)).test, "fresh");
    globalThis.__ddMail.calls.length = 0;
    assert.equal((await press(db)).ok, true);
    assert.equal(mailTo("amara@example.com")[0].subject, "Welcome to AGI Strategy", "what went is what was tested");
  });

  test("every decision email's wording counts: any programme's, any of its three emails, and the form's own", async () => {
    const record = testRecord(untestedRoundDoc());
    const CHANGES = [
      ["AGI Strategy's You're in, subject", worded(AGI, { accepted: { subject: "Welcome", body: "" } })],
      ["AGI Strategy's You're in, body", worded(AGI, { accepted: { subject: "", body: "Come along on Monday." } })],
      ["Technical AI Safety's invitation", worded(TAIS, { invitation: { subject: "", body: "We would like you to join us." } })],
      ["the incubator's declined", worded(INC, { declined: { subject: "About your application", body: "" } })],
      ["the form's No offer this time, subject", { ...untestedRoundDoc(), noOfferWording: { subject: "Your application", body: "" } }],
      ["the form's No offer this time, body", { ...untestedRoundDoc(), noOfferWording: { subject: "", body: "Thank you for applying." } }],
    ];
    for (const [what, doc] of CHANGES) {
      const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: { ...doc, decisionEmailTest: record } }));
      assert.equal((await board(db)).test, "stale", what);
      assert.deepEqual(await press(db), { ok: false, status: 409, error: STALE_TEST }, what);
      untouched(db);
    }
  });

  test("a change that is not wording leaves the test standing", async () => {
    const record = testRecord(untestedRoundDoc());
    const base = untestedRoundDoc();
    const NOT_WORDING = [
      ["the order of the programmes", { ...base, programmeIds: [INC, TAIS, AGI] }],
      ["a programme's places", { ...base, programmes: { ...base.programmes, [AGI]: { ...base.programmes[AGI], places: 40 } } }],
      ["a programme's lead", { ...base, programmes: { ...base.programmes, [AGI]: { ...base.programmes[AGI], leadUid: "zach" } } }],
      ["the reply-by day", { ...base, invitationReplyBy: "2026-10-27" }],
      ["the switch for other reviewers' scores", { ...base, revealOtherReviews: true }],
    ];
    for (const [what, doc] of NOT_WORDING) {
      const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: { ...doc, decisionEmailTest: record } }));
      assert.equal((await board(db)).test, "fresh", what);
    }
  });

  test("wording put back to exactly what was tested is tested wording again", async () => {
    const record = testRecord(untestedRoundDoc());
    const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: worded(AGI, { accepted: { subject: "Welcome", body: "" } }, { decisionEmailTest: record }) }));
    assert.equal((await board(db)).test, "stale");
    db.patch(`admissionRounds/${ROUND}`, { programmes: untestedRoundDoc().programmes });
    assert.equal((await board(db)).test, "fresh");
  });

  test("the record is of the wording the test was made from, not of wording changed while it was being sent", async () => {
    const db = makeDb(untested());
    // The wording changes in the instant the test email is handed over.
    globalThis.__ddMail.verdict = () => {
      db.patch(`admissionRounds/${ROUND}`, { noOfferWording: { subject: "Changed in the meantime", body: "" } });
      return "sent";
    };
    const tested = await send.sendTestEmail(db, me, ROUND, "accepted");
    assert.equal(tested.recorded, true);
    assert.equal(roundOf(db).decisionEmailTest.wording, testRecord(untestedRoundDoc()).wording);
    globalThis.__ddMail.verdict = null;
    assert.equal((await board(db)).test, "stale", "the admin read the wording from before the change");
    assert.equal((await press(db)).error, STALE_TEST);
  });

  test("a test that reached nobody is not a test: held, suppressed, failed, or with nobody to borrow", async () => {
    for (const verdict of ["held", "suppressed"]) {
      const db = makeDb(untested());
      globalThis.__ddMail.verdict = () => verdict;
      const result = await send.sendTestEmail(db, me, ROUND, "accepted");
      assert.deepEqual([result.ok, result.delivery, result.recorded], [true, verdict, false], verdict);
      assert.equal(db.counters.writes, 0, verdict);
      globalThis.__ddMail.verdict = null;
      assert.equal((await press(db)).error, NO_TEST, verdict);
    }
    const failing = makeDb(untested());
    globalThis.__ddMail.verdict = () => "throw";
    assert.equal((await quietly(() => send.sendTestEmail(failing, me, ROUND, "accepted"))).status, 502);
    assert.equal(failing.counters.writes, 0);
    globalThis.__ddMail.verdict = null;

    const nobodyInvited = PEOPLE.filter(([uid]) => uid !== "oliver");
    const empty = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionEmailTest: null }, nobodyInvited.length) }, nobodyInvited));
    assert.equal((await send.sendTestEmail(empty, me, ROUND, "invitation")).status, 409);
    assert.equal(empty.counters.writes, 0);
    assert.equal(roundOf(empty).decisionEmailTest, null);
  });

  test("a test that went and could not be recorded says so, and does not count", async () => {
    const db = makeDb(untested());
    db.failCommits(() => true);
    const result = await quietly(() => send.sendTestEmail(db, me, ROUND, "accepted"));
    db.failCommits(null);
    assert.deepEqual(result, {
      ok: false,
      status: 502,
      error: "The test was sent to you, but it could not be recorded. Send it again in a minute.",
    });
    assert.equal(roundOf(db).decisionEmailTest, null);
    assert.equal((await press(db)).error, NO_TEST);
  });

  test("a programme's own test, from its settings page, is not the test a press asks for", async () => {
    const db = makeDb(untested());
    const lead = { uid: "claudia", email: "claudia@example.com", firstName: "Claudia" };
    const result = await send.sendProgrammeTestEmail(db, lead, await repo.loadForm(db, ROUND), AGI, "accepted");
    assert.deepEqual([result.ok, result.delivery, result.recorded], [true, "sent", false]);
    assert.equal(db.counters.writes, 0);
    assert.equal(roundOf(db).decisionEmailTest, null);
    globalThis.__ddMail.calls.length = 0;
    assert.equal((await press(db)).error, NO_TEST);
  });

  test("the latest test is the record: a second admin's test replaces the first", async () => {
    const db = makeDb(seed({ "users/tess": userDoc("Tess Okoro", "admin") }));
    assert.equal(roundOf(db).decisionEmailTest.byUid, "zach");
    await send.sendTestEmail(db, { uid: "tess", email: "tess@example.com" }, ROUND, "no-offer");
    assert.deepEqual([roundOf(db).decisionEmailTest.byUid, roundOf(db).decisionEmailTest.at], ["tess", NOW]);
    assert.equal(testRow(await board(db)).owner, "Tess");
  });

  test("a record that does not say who, or carries no fingerprint, is no test at all", async () => {
    const real = testRecord(untestedRoundDoc());
    for (const half of [{}, { byUid: "zach" }, { wording: real.wording }, { byUid: "", wording: real.wording }, { byUid: "zach", wording: "" }, "yes", true, 1, [real]]) {
      const db = makeDb(seed({ [`admissionRounds/${ROUND}`]: roundDoc({ decisionEmailTest: half }) }));
      assert.equal((await board(db)).test, "none", JSON.stringify(half));
      assert.equal((await press(db)).error, NO_TEST, JSON.stringify(half));
      untouched(db);
    }
    // And one that is whole reads back as it was written.
    const whole = normalise.normaliseFormFields(roundDoc()).decisionEmailTest;
    assert.deepEqual(whole, { byUid: "zach", at: TESTED_AT, wording: real.wording });
  });

  test("the fingerprint is 64 hex characters and the same for the same wording, whatever else differs", () => {
    const fingerprint = (doc) => tested.wordingFingerprint(normalise.normaliseFormFields(doc));
    const base = fingerprint(untestedRoundDoc());
    assert.match(base, /^[0-9a-f]{64}$/);
    assert.equal(fingerprint(untestedRoundDoc({ label: "Spring 2027", status: "open" })), base);
    assert.notEqual(fingerprint(worded(AGI, { accepted: { subject: "x", body: "" } })), base);
    // A subject is not a body, and one programme's wording is not another's.
    assert.notEqual(
      fingerprint(worded(AGI, { accepted: { subject: "x", body: "" } })),
      fingerprint(worded(AGI, { accepted: { subject: "", body: "x" } })),
    );
    assert.notEqual(
      fingerprint(worded(AGI, { accepted: { subject: "x", body: "" } })),
      fingerprint(worded(TAIS, { accepted: { subject: "x", body: "" } })),
    );
    assert.notEqual(
      fingerprint(worded(AGI, { accepted: { subject: "x", body: "" } })),
      fingerprint(worded(AGI, { invitation: { subject: "x", body: "" } })),
    );
    // A programme added to the form is an email more.
    const more = untestedRoundDoc();
    more.programmeIds = [...more.programmeIds, "policy"];
    more.programmes.policy = programme("Policy Fellowship", "Policy", 10, "zach");
    assert.notEqual(fingerprint(more), base);
  });

  test("AN OWED EMAIL waits for the test too, even once the term is marked as sent", async () => {
    // A term sent with Nina's email still owed. Then somebody rewrites "No offer this time".
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = (args) => (args.to === "nina@example.com" ? "throw" : "sent");
    await quietly(() => press(db));
    globalThis.__ddMail.verdict = null;
    globalThis.__ddMail.calls.length = 0;
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW);
    db.patch(`admissionRounds/${ROUND}`, { noOfferWording: { subject: "About your application", body: "" } });
    const writesBefore = db.counters.writes;

    assert.deepEqual(await pressOwed(db, 1), { ok: false, status: 409, error: STALE_TEST });
    assert.equal(db.counters.writes, writesBefore);
    assert.deepEqual(globalThis.__ddMail.calls, []);
    const view = await board(db);
    assert.deepEqual(view.owed.blockers, [STALE_TEST]);
    assert.deepEqual(view.owed.people.map((person) => person.name), ["Nina Petrova"]);
    // Once the term is sent the row is the record of the last test, and waits on nobody.
    assert.deepEqual(testRow(view), {
      key: "#test",
      title: "Test email",
      owner: "Zach",
      ready: true,
      status: "Sent Thu 22 Oct, 15:10",
      detail: "",
    });
    assert.equal(view.test, "stale", "which is what the owed card offers a test for");

    // A test of the wording as it is now, and the owed email goes with that wording.
    assert.equal((await send.sendTestEmail(db, me, ROUND, "no-offer")).subject, "About your application");
    globalThis.__ddMail.calls.length = 0;
    const result = await pressOwed(db, 1);
    assert.deepEqual([result.ok, result.report.retried, result.report.emailed], [true, 1, 1]);
    assert.deepEqual(mailTo("nina@example.com").map((call) => call.subject), ["About your application"]);
  });

  test("a term sent before any test was recorded reads calmly, and still asks for one before an owed email", async () => {
    const told = {};
    for (const [uid, name, ranked] of PEOPLE) {
      told[`admissionApplications/${ROUND}__${uid}`] = toldDoc(uid, name, ranked, "no-offer", null, uid === "nina" ? { email: "owed" } : SENT);
    }
    const db = makeDb(
      seed({
        ...told,
        [`admissionRounds/${ROUND}`]: roundDoc({ decisionsSentAt: NOW, decisionsSentByUid: "zach", decisionEmailTest: null }),
      }),
    );
    const view = await board(db);
    assert.deepEqual(testRow(view), {
      key: "#test",
      title: "Test email",
      owner: "An admin",
      ready: true,
      status: "No test was recorded",
      detail: "",
    });
    assert.deepEqual(view.owed.blockers, [NO_TEST]);
    assert.equal((await pressOwed(db, 1)).error, NO_TEST);
  });

  test("the page keeps Send off until the server says ready, reads the server again after a test, and offers the test beside owed emails", () => {
    const raw = readFileSync(join(REPO_ROOT, "src", "features", "applications", "decisionDay", "SendBoard.tsx"), "utf8");
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^[ \t]*\/\/.*$/gm, " ")
      .replace(/\s+/g, " ");
    // Ready is the server's list of things still to do, and nothing the page
    // works out for itself. The test is one of those things.
    assert.ok(code.includes("const ready = board.blockers.length === 0;"));
    assert.ok(code.includes("const canSend = hydrated && ready && !sent && !sending && !testing && (left > 0 || board.published > 0);"));
    assert.ok(code.includes("disabled={!canSend}"));
    // After a test the page is read again from the server, whatever became of the test.
    assert.ok(code.includes("} finally { await reload(); setTesting(false); }"));
    assert.ok(code.includes("const response = await fetch(base); const answer = (await response.json().catch(() => null)) as { board?: Board } | null; if (response.ok && answer?.board) setBoard(answer.board);"));
    // A test that reached nobody is said not to count.
    assert.ok(raw.includes("A held test doesn’t count, so decisions can’t be sent from here until one reaches you."));
    assert.ok(raw.includes("Your address is on the do-not-email list, so the test was not sent. It doesn’t count as a test."));
    // Once the term is sent the card at the foot has no buttons, so an owed
    // email's test is sent from the owed card, whose own button waits for it.
    assert.ok(code.includes('const owedOffersTest = sent && owed > 0 && board.test !== "fresh";'));
    assert.ok(code.includes("disabled={!hydrated || sending || testing || owedHeld.length > 0}"));
    assert.equal((code.match(/onClick=\{\(\) => void sendTest\(\)\}/g) ?? []).length, 2, "the test button, in each card");
  });

  test("the send reads the test once, from the form it composes its emails from", () => {
    // What goes has to be what was tested, so the press judges the test and
    // words its emails from one reading of the form: `form` is loaded once,
    // before the blockers, and nothing after them loads it again to compose.
    const source = readFileSync(join(REPO_ROOT, "src", "lib", "applications", "decisionDay", "send.ts"), "utf8");
    const run = source.slice(source.indexOf("export async function runDecisionDay("));
    const composing = run.slice(0, run.indexOf("const publish ="));
    assert.equal((composing.match(/await loadForm\(/g) ?? []).length, 1, "the press reads the form once");
    const judged = composing.indexOf("testStanding(form)");
    const refused = composing.indexOf("if (blockers.length > 0) return");
    const worded = composing.indexOf("emailContext(db, form)");
    assert.ok(judged > -1 && refused > judged && worded > refused, "judge the test, refuse, and only then compose");
  });
});

// ---------------------------------------------------------------------------
// 4. The routes
// ---------------------------------------------------------------------------

const PERMISSIONS = {
  draftNewsletter: false,
  approveNewsletter: false,
  draftEvent: false,
  approveEvent: false,
  draftCourse: false,
  approveCourse: false,
  manageMembership: false,
  circulateWorksheet: false,
};
const session = (uid, role, suRecognised = false, displayName = uid) => ({
  uid,
  email: `${uid}@example.com`,
  role,
  displayName,
  suRecognised,
  permissions: PERMISSIONS,
});
const ZACH = session("zach", "admin", false, "Zach Levin");
const ctx = (roundId = ROUND) => ({ params: Promise.resolve({ roundId }) });
const post = (body) => ({ json: async () => body });

describe("the three routes are an admin's, decided before anything is read", () => {
  let db;
  beforeEach(() => {
    db = makeDb(seed());
    globalThis.__ddDb = db;
    globalThis.__ddUser = ZACH;
  });

  const CALLERS = [
    ["signed out", null, 401],
    ["the lead of a programme on this form", session("claudia", "committee", true), 403],
    ["a member who applied", session("amara", "member"), 403],
    ["an account still waiting", session("wen", "pending"), 403],
    ["a member holding the round-author permission", { ...session("kofi", "member"), permissions: { ...PERMISSIONS, approveCourse: true } }, 403],
  ];

  for (const [who, user, status] of CALLERS) {
    test(`${who}: refused everywhere, with nothing read, written or sent`, async () => {
      globalThis.__ddUser = user;
      const answers = [
        await sendRoute.GET({}, ctx()),
        await sendRoute.POST(post({ emails: 7, emailDeclined: false }), ctx()),
        await testRoute.POST(post({ kind: "accepted" }), ctx()),
        // The same answer for a form that does not exist: nothing is learned.
        await sendRoute.GET({}, ctx("no-such-form")),
      ];
      assert.deepEqual(answers.map((answer) => answer.status), [status, status, status, status]);
      assert.deepEqual(db.counters, { reads: 0, writes: 0 });
      assert.deepEqual(globalThis.__ddMail.calls, []);
    });
  }

  test("nobody but an admin can make the send approve an account", async () => {
    const waitingBefore = structuredClone(db.read("users/wen"));
    const callers = [
      null,
      session("claudia", "committee", true),
      session("lloyd", "committee", true),
      session("amara", "member"),
      // The waiting account itself, pressing for its own approval.
      session("wen", "pending"),
    ];
    for (const user of callers) {
      globalThis.__ddUser = user;
      for (const body of [{ emails: 7, emailDeclined: false }, { emails: 0, owedOnly: true }]) {
        const response = await sendRoute.POST(post(body), ctx());
        assert.ok([401, 403].includes(response.status), `${user?.uid}: ${response.status}`);
      }
    }
    assert.deepEqual(db.read("users/wen"), waitingBefore);
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
  });

  test("a view-as session is turned away from the send and from the test", async () => {
    globalThis.__ddBlocked = { status: 403, body: { error: "viewing as" } };
    assert.equal((await sendRoute.POST(post({ emails: 7 }), ctx())).status, 403);
    assert.equal((await testRoute.POST(post({ kind: "accepted" }), ctx())).status, 403);
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  test("an admin reads the page's data, and a read writes and sends nothing", async () => {
    const response = await sendRoute.GET({}, ctx());
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body), ["board"]);
    assert.equal(response.body.board.pending.emails, 7);
    assert.equal(db.counters.writes, 0);
    assert.deepEqual(globalThis.__ddMail.calls, []);
    assert.equal((await sendRoute.GET({}, ctx("no-such-form"))).status, 404);
  });

  test("a press that does not say how many emails is refused before anything is read", async () => {
    for (const body of [{}, { emails: "7" }, { emails: -1 }, { emails: 1.5 }, { emailDeclined: true }]) {
      const response = await sendRoute.POST(post(body), ctx());
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
  });

  test("an admin's press sends, and answers with what it did and the page as it now is", async () => {
    const response = await sendRoute.POST(post({ emails: 7, emailDeclined: false }), ctx());
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body), ["ok", "report", "board"]);
    assert.deepEqual(Object.keys(response.body.report), [
      "owedOnly",
      "published",
      "retried",
      "emailed",
      "held",
      "suppressed",
      "failed",
      "unconfirmed",
      "notEmailed",
      "skipped",
      "changed",
      "notReached",
      "failedNames",
      "unconfirmedNames",
      "accountsApproved",
      "accountsFailed",
      "accountsRefused",
      "stopped",
      "complete",
    ]);
    assert.equal(response.body.report.emailed, 7);
    assert.equal(response.body.board.sentOn, "Fri 23 Oct");
    assert.equal(roundOf(db).decisionsSentByUid, "zach");
  });

  test("the owed press goes through the same route, and is the admin's alone", async () => {
    globalThis.__ddMail.verdict = (args) => (args.to === "nina@example.com" ? "throw" : "sent");
    await quietly(() => sendRoute.POST(post({ emails: 7, emailDeclined: false }), ctx()));
    globalThis.__ddMail.verdict = null;
    globalThis.__ddMail.calls.length = 0;

    // Anything but a strict true is the main press, which is finished.
    for (const owedOnly of [undefined, "true", 1, null]) {
      const response = await sendRoute.POST(post({ emails: 1, emailDeclined: false, owedOnly }), ctx());
      assert.equal(response.status, 409, String(owedOnly));
    }
    assert.deepEqual(globalThis.__ddMail.calls, []);

    globalThis.__ddUser = session("claudia", "committee", true);
    assert.equal((await sendRoute.POST(post({ emails: 1, owedOnly: true }), ctx())).status, 403);
    assert.deepEqual(globalThis.__ddMail.calls, []);

    globalThis.__ddUser = ZACH;
    const response = await sendRoute.POST(post({ emails: 1, emailDeclined: false, owedOnly: true }), ctx());
    assert.equal(response.status, 200);
    assert.deepEqual(
      [response.body.report.owedOnly, response.body.report.retried, response.body.report.emailed],
      [true, 1, 1],
    );
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.to), ["nina@example.com"]);
    assert.deepEqual(response.body.board.owed.people, []);
  });

  test("the send's own refusals come back with their sentence", async () => {
    const stale = await sendRoute.POST(post({ emails: 6, emailDeclined: false }), ctx());
    assert.equal(stale.status, 409);
    assert.match(stale.body.error, /this would now send 7 emails, not 6/);
    assert.equal((await sendRoute.POST(post({ emails: 7 }), ctx("no-such-form"))).status, 404);
  });

  test("a test goes to the address on the admin's own session, whatever the body says", async () => {
    const response = await testRoute.POST(
      post({ kind: "invitation", to: "amara@example.com", email: "amara@example.com" }),
      ctx(),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      ok: true,
      kind: "invitation",
      delivery: "sent",
      subject: "An invitation to Technical AI Safety",
      recorded: true,
    });
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.to), ["zach@example.com"]);
    // The one write is the form's record of the test, in the caller's own name.
    assert.equal(db.counters.writes, 1);
    assert.deepEqual([roundOf(db).decisionEmailTest.byUid, roundOf(db).decisionEmailTest.at], ["zach", NOW]);
  });

  test("a test has to name one of the three emails, and the admin has to have an address", async () => {
    for (const body of [{}, { kind: "declined" }, { kind: "constructor" }]) {
      assert.equal((await testRoute.POST(post(body), ctx())).status, 400, JSON.stringify(body));
    }
    globalThis.__ddUser = { ...ZACH, email: null };
    assert.equal((await testRoute.POST(post({ kind: "accepted" }), ctx())).status, 400);
    assert.deepEqual(globalThis.__ddMail.calls, []);
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
  });
});

// ---------------------------------------------------------------------------
// 5. A test of one programme's own wording, from its settings page
// ---------------------------------------------------------------------------

describe("a test of a programme's own email goes to whoever asked, and to nobody else", () => {
  const me = { uid: "claudia", email: "claudia@example.com", firstName: "Claudia" };
  const form = (db) => repo.loadForm(db, ROUND);
  const worded = (emailWording) =>
    seed({
      [`admissionRounds/${ROUND}`]: roundDoc({
        programmes: {
          ...roundDoc().programmes,
          [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", 32, "claudia", { emailWording }),
        },
      }),
    });

  test("You’re in: this programme's email, addressed to the asker by their own name", async () => {
    const db = makeDb(seed());
    const result = await send.sendProgrammeTestEmail(db, me, await form(db), AGI, "accepted");
    // Not the test a press of Send asks for: it borrows no applicant, and leaves no record.
    assert.deepEqual(result, { ok: true, delivery: "sent", subject: "You’re in AGI Strategy", recorded: false });
    const { calls } = globalThis.__ddMail;
    assert.equal(calls.length, 1);
    assert.deepEqual(
      [calls[0].to, calls[0].subject, calls[0].kind, calls[0].replyTo, calls[0].actorUid, calls[0].referenceId],
      ["claudia@example.com", "[TEST] You’re in AGI Strategy", "admin-test", "ai-safety@uonsu.com", "claudia", ROUND],
    );
    const text = await render(calls[0].react, { plainText: true });
    assert.ok(text.includes("Hi Claudia,"));
    assert.ok(text.includes("You’re in the AGI Strategy Fellowship. It starts w/c 26 Oct."));
    assert.ok(text.includes("AGI Strategy lead, NAISI"));
    // It borrows no applicant: nobody's name but the asker's is in it.
    for (const [, name] of PEOPLE) assert.ok(!text.includes(name.split(" ")[0]), name);
    assert.equal(db.counters.writes, 0);
  });

  test("You’re in an incubator: what an incubator's people are told, with nothing about a group", async () => {
    const db = makeDb(seed());
    const result = await send.sendProgrammeTestEmail(db, me, await form(db), INC, "accepted");
    assert.equal(result.subject, "You’re in Research incubator");
    const text = (await render(globalThis.__ddMail.calls[0].react, { plainText: true })).replace(/\s+/g, " ");
    // The standard words depend on the kind of programme: an incubator is not
    // a small group with a facilitator, so its people are not promised one.
    assert.ok(
      text.includes(
        "You’re in the Research incubator. It starts w/c 26 Oct. We’ll email you before you start with how the first week works.",
      ),
      text,
    );
    assert.doesNotMatch(text, /small group|facilitator|campus|your group|when it meets/i);
    // A fellowship's test, from the same form, still says a fellowship's words.
    await send.sendProgrammeTestEmail(db, me, await form(db), AGI, "accepted");
    const fellowship = (await render(globalThis.__ddMail.calls[1].react, { plainText: true })).replace(/\s+/g, " ");
    assert.ok(
      fellowship.includes(
        "You’ll be in a small group with a facilitator, on campus, and we’ll email you your group and when it meets before you start.",
      ),
      fellowship,
    );
  });

  test("Invitation: an invitation to this programme, with the form's reply-by day", async () => {
    const db = makeDb(seed());
    const result = await send.sendProgrammeTestEmail(db, me, await form(db), TAIS, "invitation");
    assert.equal(result.subject, "An invitation to Technical AI Safety");
    const text = await render(globalThis.__ddMail.calls[0].react, { plainText: true });
    assert.ok(text.includes("Thanks for applying. The pool was really strong"));
    assert.ok(text.includes("you’d be a great fit for the Technical AI Safety Fellowship instead."));
    assert.ok(text.includes("Accept your invitation by Sun 25 Oct to let us know you’re coming."));
    assert.ok(text.includes("Technical AI Safety lead, NAISI"));
  });

  test("Declined: the kind no, signed for this programme, until the programme writes its own", async () => {
    const db = makeDb(seed());
    const standard = await send.sendProgrammeTestEmail(db, me, await form(db), AGI, "declined");
    assert.equal(standard.subject, "Your NAISI application");
    const text = await render(globalThis.__ddMail.calls[0].react, { plainText: true });
    assert.ok(text.includes("Thanks for applying. We can’t offer you a place this term."));
    assert.ok(text.includes("AGI Strategy lead, NAISI"));

    const own = makeDb(worded({ declined: { subject: "About your application", body: "This one is not for us.\n\nThank you for sending it." } }));
    const result = await send.sendProgrammeTestEmail(own, me, await form(own), AGI, "declined");
    assert.equal(result.subject, "About your application");
    const sent = await render(globalThis.__ddMail.calls[1].react, { plainText: true });
    assert.ok(sent.includes("This one is not for us.") && sent.includes("Thank you for sending it."));
    assert.ok(!sent.includes("We can’t offer you a place this term."));
  });

  test("what is sent is the wording as it is saved, and each kind reads its own", async () => {
    const db = makeDb(
      worded({
        accepted: { subject: "Welcome aboard", body: "You have a place.\n\nSee you there." },
        invitation: { subject: "Join us instead", body: "We would love to have you." },
      }),
    );
    const accepted = await send.sendProgrammeTestEmail(db, me, await form(db), AGI, "accepted");
    const invitation = await send.sendProgrammeTestEmail(db, me, await form(db), AGI, "invitation");
    assert.deepEqual([accepted.subject, invitation.subject], ["Welcome aboard", "Join us instead"]);
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.subject), ["[TEST] Welcome aboard", "[TEST] Join us instead"]);
    const text = await render(globalThis.__ddMail.calls[0].react, { plainText: true });
    assert.ok(text.includes("You have a place.") && text.includes("See you there."));
    // Another programme on the same form still has the standard words.
    const other = await send.sendProgrammeTestEmail(db, me, await form(db), TAIS, "accepted");
    assert.equal(other.subject, "You’re in Technical AI Safety");
  });

  test("a programme the form does not carry has nothing to test, whatever its name", async () => {
    const db = makeDb(seed());
    for (const id of ["not-on-the-form", "constructor", "__proto__", ""]) {
      const result = await send.sendProgrammeTestEmail(db, me, await form(db), id, "accepted");
      assert.deepEqual([result.ok, result.status], [false, 404], id);
    }
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  test("what the mail door did with it is reported", async () => {
    const db = makeDb(seed());
    globalThis.__ddMail.verdict = () => "held";
    assert.equal((await send.sendProgrammeTestEmail(db, me, await form(db), AGI, "accepted")).delivery, "held");
    globalThis.__ddMail.verdict = () => "throw";
    const failed = await quietly(async () => send.sendProgrammeTestEmail(db, me, await form(db), AGI, "accepted"));
    assert.deepEqual([failed.ok, failed.status], [false, 502]);
  });
});

describe("the programme test route: its lead or an admin, and only to themselves", () => {
  const pctx = (programmeId = AGI, roundId = ROUND) => ({ params: Promise.resolve({ roundId, programmeId }) });
  const ask = (body, where = pctx()) => programmeTestRoute.POST(post(body), where);
  let db;
  beforeEach(() => {
    // Claudia leads AGI Strategy and Lloyd reviews it. Zach leads the other two.
    db = makeDb(
      seed({
        [`admissionRounds/${ROUND}`]: roundDoc({
          programmes: {
            ...roundDoc().programmes,
            [AGI]: programme("AGI Strategy Fellowship", "AGI Strategy", 32, "claudia", { reviewerUids: ["lloyd"] }),
            [TAIS]: programme("Technical AI Safety Fellowship", "Technical AI Safety", 24, "priya"),
          },
        }),
      }),
    );
    globalThis.__ddDb = db;
    globalThis.__ddUser = session("claudia", "committee", true, "Claudia Reyes");
    globalThis.__ddBlocked = null;
  });

  test("the lead of the programme gets its test, at their own address", async () => {
    const response = await ask({ kind: "accepted" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, kind: "accepted", delivery: "sent", subject: "You’re in AGI Strategy" });
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => [call.to, call.kind]), [["claudia@example.com", "admin-test"]]);
    assert.ok((await render(globalThis.__ddMail.calls[0].react, { plainText: true })).includes("Hi Claudia,"));
    assert.equal(db.counters.writes, 0);
  });

  test("an admin gets any programme's test", async () => {
    globalThis.__ddUser = ZACH;
    for (const programmeId of [AGI, TAIS, INC]) assert.equal((await ask({ kind: "invitation" }, pctx(programmeId))).status, 200);
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.to), ["zach@example.com", "zach@example.com", "zach@example.com"]);
  });

  test("nobody can address a test to another person: the body's addresses are not read", async () => {
    const response = await ask({
      kind: "accepted",
      to: "amara@example.com",
      email: "amara@example.com",
      uid: "amara",
      recipient: "amara@example.com",
      actor: { email: "amara@example.com" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.to), ["claudia@example.com"]);
    assert.deepEqual(mailTo("amara@example.com"), []);
  });

  const REFUSED = [
    ["signed out", null, 401],
    ["a reviewer on the programme", session("lloyd", "committee", true), 403],
    ["the lead of another programme on the same form", session("priya", "committee", true), 404],
    ["SU-recognised committee named nowhere", session("yusuf", "committee", true), 404],
    ["a member", session("amara", "member"), 404],
    ["an account still waiting", session("jasmine", "pending"), 404],
    // Named as lead, and no longer the kind of account a lead has to be.
    ["a lead whose standing has lapsed", session("claudia", "committee", false), 404],
    ["a lead whose account is now a plain member's", session("claudia", "member"), 404],
  ];
  for (const [who, user, status] of REFUSED) {
    test(`${who}: ${status}, and nothing is sent`, async () => {
      globalThis.__ddUser = user;
      for (const kind of ["accepted", "invitation", "declined"]) {
        assert.equal((await ask({ kind })).status, status, kind);
      }
      assert.deepEqual(globalThis.__ddMail.calls, []);
      assert.equal(db.counters.writes, 0);
    });
  }

  test("somebody with no role is told the same thing as for a programme or a form that does not exist", async () => {
    globalThis.__ddUser = session("amara", "member");
    const noRole = await ask({ kind: "accepted" });
    const noProgramme = await ask({ kind: "accepted" }, pctx("not-on-the-form"));
    const noForm = await ask({ kind: "accepted" }, pctx(AGI, "no-such-form"));
    for (const response of [noRole, noProgramme, noForm]) {
      assert.deepEqual([response.status, response.body], [404, { error: "That programme is not on this form." }]);
    }
    // And so is an admin asking about one that is not there.
    globalThis.__ddUser = ZACH;
    assert.equal((await ask({ kind: "accepted" }, pctx("not-on-the-form"))).status, 404);
    assert.equal((await ask({ kind: "accepted" }, pctx(AGI, "no-such-form"))).status, 404);
  });

  test("a body that names no email of this programme's is refused before anything is read", async () => {
    for (const body of [{}, { kind: "no-offer" }, { kind: "invited" }, { kind: "constructor" }, { kind: 1 }, null]) {
      assert.equal((await ask(body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await programmeTestRoute.POST({ json: async () => { throw new SyntaxError("bad"); } }, pctx())).status, 400);
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
  });

  test("an id that could not be one is not looked up", async () => {
    for (const where of [pctx("a.b"), pctx("constructor"), pctx(AGI, "a/b"), pctx(AGI, "__proto__")]) {
      assert.equal((await ask({ kind: "accepted" }, where)).status, 404);
    }
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
  });

  test("an account with no address has nowhere to send a test, said before anything is read", async () => {
    globalThis.__ddUser = { ...session("claudia", "committee", true), email: null };
    assert.equal((await ask({ kind: "accepted" })).status, 400);
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  test("a view-as session is turned away before anything else: the address on it is the member's", async () => {
    globalThis.__ddUser = ZACH;
    globalThis.__ddBlocked = { status: 403, body: { error: "viewing as" } };
    assert.equal((await ask({ kind: "accepted" })).status, 403);
    assert.deepEqual(db.counters, { reads: 0, writes: 0 });
    assert.deepEqual(globalThis.__ddMail.calls, []);
  });

  test("a test that cannot be sent says so, and is not reported as sent", async () => {
    globalThis.__ddMail.verdict = () => "throw";
    const response = await quietly(() => ask({ kind: "accepted" }));
    assert.deepEqual([response.status, response.body.error], [502, "That test could not be sent. Try again in a minute."]);
  });
});
