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
 *  3. NOBODY IS TOLD TWICE. Somebody who already has a result is skipped: no
 *     write, no email, whatever their decision says now.
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
import { join } from "node:path";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";

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
        "  if (verdict === 'throw') throw new Error('the mail server refused the connection');\n" +
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
const sendRoute = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "send", "route.ts"));
const testRoute = await loadTs(
  join("app", "api", "admissions", "forms", "[roundId]", "send", "test", "route.ts"),
);

// ---------------------------------------------------------------------------
// A Firestore small enough to read
// ---------------------------------------------------------------------------

function makeDb(seed) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
  const counters = { reads: 0, writes: 0 };
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
      node[last] = resolveValue(node[last], value);
    }
    docs.set(op.path, next);
  };
  const ref = (path) => ({ id: path.split("/").pop(), path, get: async () => snap(path) });

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
      const ops = [];
      const result = await fn({
        get: async (r) => snap(r.path),
        getAll: async (...refs) => refs.map((r) => snap(r.path)),
        update: (r, data) => ops.push({ kind: "update", path: r.path, data }),
        create: (r, data) => ops.push({ kind: "create", path: r.path, data }),
      });
      // Nothing is stored until the function has returned, as in a real transaction.
      ops.forEach(apply);
      return result;
    },
    read: (path) => docs.get(path),
    /** For a test to change a document behind the send's back. */
    patch: (path, change) => docs.set(path, { ...docs.get(path), ...change }),
    paths: (prefix) => [...docs.keys()].filter((path) => path.startsWith(prefix)),
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

function roundDoc(over = {}, submitted = 8) {
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

/** Every person a press looked at is in exactly one count. */
function assertAddsUp(report, people) {
  assert.equal(
    report.published,
    report.emailed + report.held + report.suppressed + report.failed + report.notEmailed,
    "everybody told is emailed, held, suppressed, failed or deliberately not emailed",
  );
  assert.equal(
    people,
    report.published + report.skipped + report.changed + report.notReached,
    "everybody in the term is told, skipped, changed or left for the next press",
  );
}

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
      published: 8,
      emailed: 7,
      held: 0,
      suppressed: 0,
      failed: 0,
      notEmailed: 1,
      skipped: 0,
      changed: 0,
      notReached: 0,
      failedNames: [],
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
    assert.deepEqual(told("amara"), ["accepted", { kind: "accepted", programmeId: AGI, publishedAt: NOW }, null]);
    assert.deepEqual(told("wen"), ["accepted", { kind: "accepted", programmeId: TAIS, publishedAt: NOW }, null]);
    assert.deepEqual(told("oliver"), [
      "invited",
      { kind: "invited", programmeId: TAIS, publishedAt: NOW },
      { programmeId: TAIS, replyBy: "2026-10-25", response: null, respondedAt: null, lastReminderOn: null },
    ]);
    assert.deepEqual(told("nina"), ["no-offer", { kind: "no-offer", programmeId: null, publishedAt: NOW }, null]);
    assert.deepEqual(told("zara"), ["declined", { kind: "declined", programmeId: null, publishedAt: NOW }, null]);
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
          "1 not emailed. Everybody in the term now has their result.",
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
    const told = (uid, name, ranked, kind, programmeId) =>
      applicationDoc(uid, name, ranked, {
        status: kind,
        result: { kind, programmeId, publishedAt: DECIDED },
      });
    const db = makeDb(
      seed({
        [`admissionApplications/${ROUND}__amara`]: told("amara", "Amara Okafor", [AGI, TAIS], "accepted", AGI),
        [`admissionApplications/${ROUND}__nina`]: told("nina", "Nina Petrova", [AGI], "no-offer", null),
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
    // Everybody has a result, so the term is sent, and the log says whose email failed.
    assert.equal(result.report.complete, true);
    assert.deepEqual(roundOf(db).decisionsSentAt, NOW);
    assert.match(auditRows(db)[0].detail, /1 failed, 1 not emailed\..*Email failed for: nina\.$/);
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

    // With the mail working again, the next press tells everybody else. The
    // one person already told is skipped: their result is on the site, and
    // the first press named them so somebody can write to them.
    globalThis.__ddMail.calls.length = 0;
    globalThis.__ddMail.verdict = null;
    const [stranded] = result.report.failedNames;
    const next = await press(db, { emails: 6, emailDeclined: false });
    assert.deepEqual([next.report.published, next.report.skipped, next.report.complete], [7, 1, true]);
    assert.equal(globalThis.__ddMail.calls.length, 6);
    assert.ok(PEOPLE.some(([, name]) => name === stranded));
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
      published: 500, emailed: 0, held: 0, suppressed: 0, failed: 500, notEmailed: 0,
      skipped: 0, changed: 0, notReached: 0, failedNames: [], stopped: null, complete: true,
    };
    const uids = Array.from({ length: 500 }, (_, i) => `a-rather-long-uid-${i}`);
    assert.ok(send.auditDetail("Autumn 2026", report, uids).length <= 1000);
  });
});

// ---------------------------------------------------------------------------
// 2. The page
// ---------------------------------------------------------------------------

describe("the decision-day page", () => {
  const board = async (db) => send.buildSendBoard(db, await repo.loadForm(db, ROUND), NOW);

  test("a ready term reads as ready, group by group", async () => {
    const view = await board(makeDb(seed()));
    assert.deepEqual(view.blockers, []);
    assert.deepEqual([view.termLabel, view.today, view.applied, view.sentOn, view.published], ["Autumn 2026", "Fri 23 Oct", 8, null, 0]);
    assert.deepEqual(view.readiness, [
      { key: AGI, title: "AGI Strategy", owner: "Claudia", ready: true, status: "Every application has a decision", detail: "1 of 32 places" },
      { key: TAIS, title: "Technical AI Safety", owner: "Zach", ready: true, status: "Every application has a decision", detail: "2 of 24 places, and 1 invitation" },
      { key: INC, title: "Research incubator", owner: "Zach", ready: true, status: "Every application has a decision", detail: "0 of 12 places" },
      { key: "pooled", title: "Pooled applicants", owner: "Committee", ready: true, status: "Every pooled person has an outcome", detail: "1 invitation, 3 no offer" },
    ]);
    assert.deepEqual(view.accepted.people.map((p) => p.name), ["Amara Okafor", "Sam Whitfield", "Wen Zhao"]);
    assert.deepEqual(view.invited.people.map((p) => p.name), ["Oliver Grant"]);
    assert.deepEqual(view.noOffer.people.map((p) => p.name), ["Ben Hartley", "Nina Petrova", "Rosa García"]);
    assert.deepEqual(view.declined, { count: 1 });
    assert.deepEqual(view.pending, { people: 8, emails: 7, declined: 1, perPress: send.MAX_PEOPLE_PER_PRESS });
    assert.deepEqual([view.replyBy, view.fromName, view.replyTo], ["Sun 25 Oct", "NAISI", "ai-safety@uonsu.com"]);
  });

  test("it says how many accepted people have an account still waiting", async () => {
    assert.equal((await board(makeDb(seed()))).accountsWaiting, 1);
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
    assert.deepEqual(view.readiness.at(-1), {
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
  });
});

// ---------------------------------------------------------------------------
// 3. A test to the admin's own address
// ---------------------------------------------------------------------------

describe("a test send", () => {
  const me = { uid: "zach", email: "zach@example.com" };

  test("goes to the admin and nobody else, marked as a test, and writes nothing", async () => {
    const db = makeDb(seed());
    const result = await send.sendTestEmail(db, me, ROUND, "accepted");
    assert.deepEqual(result, { ok: true, delivery: "sent", subject: "You’re in AGI Strategy" });
    const { calls } = globalThis.__ddMail;
    assert.equal(calls.length, 1);
    assert.deepEqual(
      [calls[0].to, calls[0].subject, calls[0].kind, calls[0].replyTo, calls[0].actorUid],
      ["zach@example.com", "[TEST] You’re in AGI Strategy", "admin-test", "ai-safety@uonsu.com", "zach"],
    );
    // It is the first person's email exactly as they would get it.
    assert.ok((await render(calls[0].react, { plainText: true })).includes("Hi Amara,"));
    assert.equal(db.counters.writes, 0);
    assert.equal(applicationOf(db, "amara").result, null);
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
      "published",
      "emailed",
      "held",
      "suppressed",
      "failed",
      "notEmailed",
      "skipped",
      "changed",
      "notReached",
      "failedNames",
      "stopped",
      "complete",
    ]);
    assert.equal(response.body.report.emailed, 7);
    assert.equal(response.body.board.sentOn, "Fri 23 Oct");
    assert.equal(roundOf(db).decisionsSentByUid, "zach");
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
    });
    assert.deepEqual(globalThis.__ddMail.calls.map((call) => call.to), ["zach@example.com"]);
    assert.equal(db.counters.writes, 0);
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
