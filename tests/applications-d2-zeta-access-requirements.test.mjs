/**
 * The access-requirements box on the application form, run for real.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET  /api/admissions/forms/[roundId]/application/access-requirements          the caller's own answer
 *   PUT  /api/admissions/forms/[roundId]/application/access-requirements          save it
 *   POST /api/admissions/forms/[roundId]/applications/[uid]/access-requirements   an admin opens one
 *
 * ## The rules this guards
 *
 * What somebody writes in that box is, in practice, about their health, a
 * disability or who they care for. Every rule here is what the form and the
 * privacy policy tell them about it:
 *
 *  - IT IS KEPT APART. A save writes one document in a collection of its own
 *    and leaves the application byte for byte as it was: the draft, what was
 *    sent, the timestamps and the form's counters.
 *  - IT IS THEIR OWN. The row is addressed by the session's uid. Nothing in a
 *    request can name somebody else's, and a view-as session is refused, the
 *    read included, because the session is then not the person's own.
 *  - IT CAN BE CHANGED UNTIL THE CLOSE, and not after.
 *  - NO ROW WITHOUT AN APPLICATION, because the application is the only way
 *    back to the row when either is deleted.
 *  - ONLY AN ADMIN READS IT. A lead, a reviewer, an SU-recognised committee
 *    member and the applicant are refused before anything is read.
 *  - AN ADMIN HAS TO ASK, AND EVERY READ IS RECORDED: one log line for each
 *    open, written in the transaction that reads the answer, holding who
 *    opened it and whose it was by account id, and never the answer or the
 *    applicant's name.
 *
 * Real: the three handlers, the applicant's gate, the rate limiter, the
 * view-as marker's refusal as each handler asks it, `access.ts`, and
 * everything under `src/lib/applications/`. Faked: `next/server`, the
 * sentinels `firebase-admin/firestore` supplies, the view-as guard, the
 * session, and the Admin SDK handle, which is `tests/lib/applicationsStore.mjs`.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  ROUND,
  ROUND_LABEL,
  WHILE_DECIDING,
  applicationDoc,
  applicationPath,
  namesOf,
  privatePath,
  seedTerm,
  stringsIn,
} from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...parts) => readFileSync(join(REPO_ROOT, "src", ...parts), "utf8");

const STUBS = new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export class NextResponse {\n" +
        "  constructor(body, init) {\n" +
        "    this.body = body;\n" +
        "    this.status = (init && init.status) || 200;\n" +
        "    this.headers = (init && init.headers) || {};\n" +
        "  }\n" +
        "  static json(body, init) { return new NextResponse(body, init); }\n" +
        "}",
    ],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__zetaDb ?? null;\n}"],
    ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__zetaUser ?? null;\n}"],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() {\n  return globalThis.__zetaBlocked ?? null;\n}",
    ],
]);
const { loadTs } = createLoader({ stubs: STUBS });

const FORMS = join("app", "api", "admissions", "forms", "[roundId]");
const ownRoute = await loadTs(join(FORMS, "application", "access-requirements", "route.ts"));
const adminRoute = await loadTs(join(FORMS, "applications", "[uid]", "access-requirements", "route.ts"));
const applicationRoute = await loadTs(join(FORMS, "application", "route.ts"));
const sendRoute = await loadTs(join(FORMS, "application", "send", "route.ts"));
/** The response class the handlers themselves are given: the stub above, loaded the way the loader loads it. */
const { NextResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(STUBS.get("next/server")).toString("base64")}`
);
const { ADMISSION_PRIVATE_FIELD_LIMITS } = await loadTs(
  join("lib", "firestore", "admissionApplicationPrivate.ts"),
);
const { COURSE_AUDIT_COLLECTION } = await loadTs(join("lib", "firestore", "courseAudit.ts"));

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

/** A window no clock on a test machine is outside of. */
const ALWAYS_OPEN = {
  opensAt: new Date("2020-01-01T00:00:00Z"),
  closesAt: new Date("2099-01-01T00:00:00Z"),
};

let db;
/** Every collection a request addressed, in order. */
let touched;

function world({ round = {}, over = {} } = {}) {
  db = makeDb(seedTerm({ round: { ...ALWAYS_OPEN, ...round }, over }), { now: WHILE_DECIDING });
  touched = [];
  const collection = db.collection;
  db.collection = (name) => {
    touched.push(name);
    return collection(name);
  };
  globalThis.__zetaDb = db;
  globalThis.__zetaBlocked = null;
  globalThis.__zetaUser = null;
  return db;
}

const as = (uid) => {
  globalThis.__zetaUser = uid ? CAST[uid] : null;
};

let requestNumber = 0;
/** Each request comes from its own address, so one test cannot use up another's allowance. */
function request(method, body) {
  requestNumber += 1;
  return new Request("http://naisi.invalid/api", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.9.${requestNumber >> 8}.${requestNumber & 255}`,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const own = (roundId = ROUND) => ({ params: Promise.resolve({ roundId }) });
const GET = (roundId) => ownRoute.GET(request("GET"), own(roundId));
const PUT = (body, roundId) => ownRoute.PUT(request("PUT", body), own(roundId));
const OPEN = (uid, roundId = ROUND) =>
  adminRoute.POST(request("POST", {}), { params: Promise.resolve({ roundId, uid }) });

const rows = () => db.paths().filter((path) => path.startsWith("admissionApplicationPrivate/"));
const logged = () =>
  db
    .paths()
    .filter((path) => path.startsWith(`${COURSE_AUDIT_COLLECTION}/`))
    .map((path) => db.read(path));
const frozen = (path) => JSON.stringify(db.read(path));

const WROTE = "A step-free room, please, and somewhere quiet to sit out for ten minutes.";

beforeEach(() => {
  world();
});

// ---------------------------------------------------------------------------
// The applicant's own answer
// ---------------------------------------------------------------------------

describe("who may read and save their own answer", () => {
  test("nobody signed out", async () => {
    assert.equal((await GET()).status, 401);
    assert.equal((await PUT({ accessRequirements: WROTE })).status, 401);
    assert.deepEqual(rows(), []);
  });

  test("not an account that has been refused", async () => {
    as("refused");
    assert.equal((await GET()).status, 403);
    assert.equal((await PUT({ accessRequirements: WROTE })).status, 403);
    assert.deepEqual(rows(), []);
  });

  test("an account still waiting to be approved is an applicant", async () => {
    // Wen applied before anybody looked at their join request.
    as("wen");
    assert.equal((await PUT({ accessRequirements: WROTE })).status, 200);
    assert.deepEqual((await GET()).body, { accessRequirements: WROTE });
  });

  test("a view-as session is refused, the read included, and reads nothing", async () => {
    // The session is the member's during one, so "their own answer" would be
    // somebody else's, handed to an admin with nothing recording it.
    db.seed(privatePath("amara"), { accessRequirements: WROTE });
    as("amara");
    globalThis.__zetaBlocked = NextResponse.json({ error: "view-as" }, { status: 403 });
    touched.length = 0;

    const read = await GET();
    const write = await PUT({ accessRequirements: "Changed during a view-as session." });

    assert.deepEqual([read.status, write.status], [403, 403]);
    assert.ok(!stringsIn(read.body).some((text) => text.includes("step-free")), "the answer left in the refusal");
    assert.deepEqual(touched, [], "a refused view-as request must not reach the database at all");
    assert.deepEqual(db.read(privatePath("amara")), { accessRequirements: WROTE });
  });
});

describe("which form", () => {
  test("a draft form, an archived one, an older round and no round at all answer alike", async () => {
    as("amara");
    const answers = [];
    for (const round of [{ status: "draft" }, { archived: true }]) {
      world({ round });
      as("amara");
      answers.push(await GET(), await PUT({ accessRequirements: WROTE }));
      assert.deepEqual(rows(), []);
    }
    world();
    as("amara");
    answers.push(await GET("older-round"), await PUT({ accessRequirements: WROTE }, "older-round"));
    answers.push(await GET("no-such-round"), await PUT({ accessRequirements: WROTE }, "no-such-round"));
    assert.deepEqual(rows(), []);
    for (const answer of answers) {
      assert.deepEqual([answer.status, answer.body], [404, { error: "Form not found." }]);
    }
  });
});

describe("when", () => {
  test("not before the form opens", async () => {
    world({ round: { opensAt: new Date("2098-01-01T00:00:00Z") } });
    as("amara");
    const answer = await PUT({ accessRequirements: WROTE });
    assert.deepEqual([answer.status, answer.body], [403, { error: "Applications have not opened yet." }]);
    assert.deepEqual(rows(), []);
  });

  test("not after it closes, by the clock or by an admin, with the sentence a draft save gets", async () => {
    for (const round of [{ closesAt: new Date("2021-01-01T00:00:00Z") }, { status: "deciding" }, { status: "closed" }]) {
      world({ round, over: { [privatePath("amara")]: { accessRequirements: "What was there at the close." } } });
      as("amara");
      const answer = await PUT({ accessRequirements: "A change after the close." });
      assert.equal(answer.status, 403, JSON.stringify(round));
      assert.equal(answer.body.error, "Applications have closed, so this application can no longer be changed.");
      assert.deepEqual(db.read(privatePath("amara")), { accessRequirements: "What was there at the close." });
    }
  });

  test("it can be changed as often as they like while the form is open, sent or not", async () => {
    as("amara");
    for (const text of ["First thoughts.", "Second thoughts.", ""]) {
      const answer = await PUT({ accessRequirements: text });
      assert.deepEqual([answer.status, answer.body], [200, { ok: true, accessRequirements: text }]);
      assert.deepEqual(db.read(privatePath("amara")), { accessRequirements: text });
    }
  });
});

describe("what a save accepts", () => {
  beforeEach(() => as("amara"));

  test("only a string, and the refusal is a sentence", async () => {
    for (const body of [{}, { accessRequirements: null }, { accessRequirements: 7 }, { accessRequirements: ["a"] }, { accessRequirements: { text: "a" } }, "not json", []]) {
      const answer = await PUT(body);
      assert.equal(answer.status, 400, JSON.stringify(body));
      assert.equal(answer.body.error, "Your access-requirements answer arrived in a shape this site cannot read.");
    }
    assert.deepEqual(rows(), []);
  });

  test("the older form's limit, and it says by how much", async () => {
    const max = ADMISSION_PRIVATE_FIELD_LIMITS.accessRequirements;
    assert.equal(max, 1500);
    const atLimit = await PUT({ accessRequirements: "a".repeat(max) });
    assert.equal(atLimit.status, 200);
    const one = await PUT({ accessRequirements: "a".repeat(max + 1) });
    assert.deepEqual([one.status, one.body.error], [400, "The access-requirements box is 1 character over its limit of 1500."]);
    const several = await PUT({ accessRequirements: "a".repeat(max + 12) });
    assert.equal(several.body.error, "The access-requirements box is 12 characters over its limit of 1500.");
    assert.equal(db.read(privatePath("amara")).accessRequirements.length, max, "a refused save changed what was stored");
  });

  test("it is trimmed, so a box of spaces is an empty box", async () => {
    assert.deepEqual((await PUT({ accessRequirements: `  ${WROTE}\n\n` })).body, { ok: true, accessRequirements: WROTE });
    assert.deepEqual((await PUT({ accessRequirements: "   \n " })).body, { ok: true, accessRequirements: "" });
    // As on the older form: the row stays, holding nothing.
    assert.deepEqual(db.read(privatePath("amara")), { accessRequirements: "" });
  });
});

describe("where a save goes", () => {
  test("one document in a collection of its own, holding the answer and nothing else", async () => {
    as("amara");
    db.stats.writes.length = 0;
    await PUT({ accessRequirements: WROTE });
    assert.deepEqual(rows(), [privatePath("amara")]);
    assert.deepEqual(db.read(privatePath("amara")), { accessRequirements: WROTE });
    assert.deepEqual(
      db.stats.writes.map(([, path]) => path),
      [privatePath("amara")],
      "a save of the box wrote something other than the box's own row",
    );
  });

  test("the application is byte for byte what it was: the draft, what was sent, the stamps, the counters", async () => {
    as("amara");
    const application = frozen(applicationPath("amara"));
    const round = frozen(`admissionRounds/${ROUND}`);
    await PUT({ accessRequirements: WROTE });
    await PUT({ accessRequirements: "Changed." });
    assert.equal(frozen(applicationPath("amara")), application);
    assert.equal(frozen(`admissionRounds/${ROUND}`), round);
  });

  test("no row is written where no application has been started, and the answer says try again", async () => {
    // Yusuf has an account and no application. The form saves the draft
    // first, which is what starts one; a save that arrives before that is
    // told the same request will succeed in a moment.
    as("yusuf");
    const answer = await PUT({ accessRequirements: WROTE });
    assert.equal(answer.status, 409);
    assert.equal(answer.body.retry, true);
    assert.match(answer.body.error, /has not been started yet/);
    assert.deepEqual(rows(), [], "a row with no application beside it could never be found again");
    assert.deepEqual((await GET()).body, { accessRequirements: "" });
  });

  test("an application started on the form takes it: the draft's first save, then the box", async () => {
    as("nina");
    const draft = applicationDoc("nina", [AGI]).draft;
    assert.equal((await applicationRoute.PUT(request("PUT", { draft }), own())).status, 200);
    assert.equal((await PUT({ accessRequirements: WROTE })).status, 200);
    assert.deepEqual(rows(), [privatePath("nina")]);
    assert.equal(privatePath("nina").split("/")[1], applicationPath("nina").split("/")[1]);
  });
});

describe("whose answer", () => {
  test("the session's own, whatever a request says", async () => {
    as("dev");
    await PUT({ accessRequirements: "Dev's own.", uid: "amara", roundId: "elsewhere", applicantUid: "amara" });
    assert.deepEqual(rows(), [privatePath("dev")]);
    assert.equal(db.paths().includes(privatePath("amara")), false);
  });

  test("a read answers with the caller's own and no other, and with nothing else", async () => {
    db.seed(privatePath("amara"), { accessRequirements: "Amara's own." });
    db.seed(privatePath("dev"), { accessRequirements: "Dev's own." });
    as("dev");
    assert.deepEqual((await GET()).body, { accessRequirements: "Dev's own." });
    as("wen");
    assert.deepEqual((await GET()).body, { accessRequirements: "" });
  });

  test("every reply that carries an answer says it is not to be kept", async () => {
    db.seed(privatePath("amara"), { accessRequirements: WROTE });
    as("amara");
    const read = await GET();
    const saved = await PUT({ accessRequirements: WROTE });
    as("zach");
    const opened = await OPEN("amara");
    for (const answer of [read, saved, opened]) {
      assert.equal(answer.status, 200);
      assert.equal(answer.headers["Cache-Control"], "no-store");
    }
  });

  test("a row that has gained other fields still answers with the one", async () => {
    db.seed(privatePath("amara"), { accessRequirements: "Amara's own.", uid: "amara", note: "Not for the wire." });
    as("amara");
    assert.deepEqual((await GET()).body, { accessRequirements: "Amara's own." });
  });
});

describe("the application's own routes never carry it", () => {
  test("not the form's read, not a draft save, not a send", async () => {
    db.seed(privatePath("amara"), { accessRequirements: WROTE });
    // A send holds the account's university address to the university's own
    // domain, so for this one the account has such an address.
    db.poke("users/amara", { "profile.universityEmail": "ada@nottingham.ac.uk" });
    as("amara");
    const draft = db.read(applicationPath("amara")).draft;
    const answers = [
      await applicationRoute.GET(request("GET"), own()),
      await applicationRoute.PUT(request("PUT", { draft, accessRequirements: "Slipped into a draft save." }), own()),
      await sendRoute.POST(request("POST", {}), own()),
    ];
    for (const answer of answers) {
      assert.equal(answer.status, 200);
      const strings = stringsIn(answer.body);
      assert.ok(!strings.includes("accessRequirements"), "an application route answered with the field");
      assert.ok(!strings.some((text) => text.includes("step-free") || text.includes("Slipped")));
    }
    // And a draft save that carried one stored none of it, anywhere.
    assert.deepEqual(db.read(privatePath("amara")), { accessRequirements: WROTE });
    const stored = db.read(applicationPath("amara"));
    assert.ok(!stringsIn(stored).some((text) => text.includes("Slipped") || text === "accessRequirements"));
    assert.ok(stored.sent, "the send went through");
  });
});

// ---------------------------------------------------------------------------
// An admin opening one
// ---------------------------------------------------------------------------

describe("who may open an applicant's answer", () => {
  beforeEach(() => {
    db.seed(privatePath("amara"), { accessRequirements: WROTE });
  });

  test("nobody signed out", async () => {
    assert.equal((await OPEN("amara")).status, 401);
    assert.deepEqual(logged(), []);
  });

  /** [who, what they are to this application] */
  const NOT_AN_ADMIN = [
    ["claudia", "the lead of a programme Amara ranked"],
    ["lloyd", "a reviewer of a programme Amara ranked"],
    ["tess", "the lead of the other programme Amara ranked"],
    ["yusuf", "SU-recognised committee, named on nothing"],
    ["dev", "another applicant"],
    ["amara", "the applicant, through the committee's route"],
  ];
  for (const [who, what] of NOT_AN_ADMIN) {
    test(`not ${who}, ${what}: refused before anything is read`, async () => {
      as(who);
      touched.length = 0;
      const answer = await OPEN("amara");
      assert.deepEqual(
        [answer.status, answer.body],
        [403, { error: "Only an admin can open an applicant’s access requirements." }],
      );
      assert.deepEqual(touched, [], "a refusal must not read the form, the application or the answer");
      assert.deepEqual(logged(), [], "and a refusal is not a read, so nothing is logged");
    });
  }

  test("the refusal is the same whatever was asked about, so it says nothing about what exists", async () => {
    as("claudia");
    const there = await OPEN("amara");
    const noSuchPerson = await OPEN("nobody-at-all");
    const noSuchForm = await OPEN("amara", "no-such-round");
    assert.deepEqual([noSuchPerson.status, noSuchPerson.body], [there.status, there.body]);
    assert.deepEqual([noSuchForm.status, noSuchForm.body], [there.status, there.body]);
  });

  test("a view-as session is refused", async () => {
    as("zach");
    globalThis.__zetaBlocked = NextResponse.json({ error: "view-as" }, { status: 403 });
    touched.length = 0;
    assert.equal((await OPEN("amara")).status, 403);
    assert.deepEqual(touched, []);
    assert.deepEqual(logged(), []);
  });
});

describe("an admin opens one", () => {
  beforeEach(() => {
    db.seed(privatePath("amara"), { accessRequirements: WROTE });
    as("zach");
  });

  test("the answer, and nothing else in the reply", async () => {
    const answer = await OPEN("amara");
    assert.deepEqual([answer.status, answer.body], [200, { accessRequirements: WROTE }]);
  });

  test("one log line, saying who opened whose, by account id, and never what it said", async () => {
    await OPEN("amara");
    assert.deepEqual(logged(), [
      {
        kind: "access-requirements-read",
        runId: "",
        roundId: ROUND,
        groupId: null,
        subjectUid: "amara",
        actorUid: "zach",
        actorName: "Zach Levin",
        targetLabel: ROUND_LABEL,
        detail: "Zach opened an applicant’s access requirements.",
        at: WHILE_DECIDING,
      },
    ]);
    const strings = stringsIn(logged());
    assert.ok(!strings.some((text) => text.includes("step-free")), "the log holds the answer");
    for (const name of namesOf("amara")) {
      assert.ok(!strings.some((text) => text.includes(name)), `the log names the applicant: ${name}`);
    }
  });

  test("every open is a read: two opens, two lines", async () => {
    await OPEN("amara");
    await OPEN("amara");
    assert.equal(logged().length, 2);
  });

  test("an empty box is opened like any other, and recorded like any other", async () => {
    const answer = await OPEN("dev");
    assert.deepEqual([answer.status, answer.body], [200, { accessRequirements: "" }]);
    assert.deepEqual(logged().map((row) => [row.kind, row.subjectUid]), [["access-requirements-read", "dev"]]);
  });

  test("opening it changes nothing: not the answer, not the application, not the form", async () => {
    const before = [frozen(privatePath("amara")), frozen(applicationPath("amara")), frozen(`admissionRounds/${ROUND}`)];
    db.stats.writes.length = 0;
    await OPEN("amara");
    assert.deepEqual(
      [frozen(privatePath("amara")), frozen(applicationPath("amara")), frozen(`admissionRounds/${ROUND}`)],
      before,
    );
    assert.deepEqual(
      db.stats.writes.map(([kind, path]) => [kind, path.split("/")[0]]),
      [["create", COURSE_AUDIT_COLLECTION]],
      "an open writes the one log line and nothing else",
    );
  });

  test("an application nobody sent is not there to open, and nothing is logged", async () => {
    db.seed(applicationPath("nina"), applicationDoc("nina", [AGI], { sent: false }));
    db.seed(privatePath("nina"), { accessRequirements: "Written beside a draft." });
    const answer = await OPEN("nina");
    assert.deepEqual([answer.status, answer.body], [404, { error: "Not found" }]);
    assert.deepEqual(logged(), []);
  });

  test("nobody, an older round, no round and an id with a separator are all not found, unlogged", async () => {
    for (const [uid, roundId] of [
      ["nobody-at-all", ROUND],
      ["amara", "older-round"],
      ["amara", "no-such-round"],
      ["amara/x", ROUND],
      ["..", ROUND],
    ]) {
      const answer = await OPEN(uid, roundId);
      assert.deepEqual([answer.status, answer.body], [404, { error: "Not found" }], `${uid} on ${roundId}`);
    }
    assert.deepEqual(logged(), []);
  });

  test("a read is never recorded against one id while showing another's answer", async () => {
    // A document id is a round id and a uid joined, and both come from the
    // address. Here a second form's id is the first part of this form's, so
    // the same document can be spelt two ways. The application found has to
    // say it is that person's on that form.
    const shorter = ROUND.split("__")[0];
    const rest = `${ROUND.split("__")[1]}__amara`;
    db.seed(`admissionRounds/${shorter}`, db.read(`admissionRounds/${ROUND}`));
    const answer = await OPEN(rest, shorter);
    assert.deepEqual([answer.status, answer.body], [404, { error: "Not found" }]);
    assert.deepEqual(logged(), []);
  });

  test("an admin does not open their own through the committee's route", async () => {
    db.seed(applicationPath("zach"), { ...applicationDoc("amara", [AGI]), uid: "zach" });
    db.seed(privatePath("zach"), { accessRequirements: "The admin's own." });
    const answer = await OPEN("zach");
    assert.deepEqual([answer.status, answer.body], [404, { error: "Not found" }]);
    assert.deepEqual(logged(), []);
  });

  test("it can be opened after the form has closed", async () => {
    world({
      round: { status: "deciding", closesAt: new Date("2021-01-01T00:00:00Z") },
      over: { [privatePath("amara")]: { accessRequirements: WROTE } },
    });
    as("zach");
    assert.deepEqual((await OPEN("amara")).body, { accessRequirements: WROTE });
  });
});

// ---------------------------------------------------------------------------
// The words on the form, held to the code
// ---------------------------------------------------------------------------

describe("what the box tells the person", () => {
  const box = source("features", "applications", "apply", "AccessRequirementsBox.tsx");
  const flat = box.replace(/\s+/g, " ");

  test("the question is the older form's, word for word", () => {
    const question =
      "Is there anything we should know so you can take part fully? Rooms, timing, materials, anything at all.";
    assert.ok(flat.includes(`"${question}"`), "the box asks something else");
    assert.ok(
      source("features", "admissions", "ApplyFlow.tsx").replace(/\s+/g, " ").includes(`"${question}"`),
      "the older form no longer asks it in these words, so there is nothing to be word for word with",
    );
  });

  test("the line says who reads it and that it is kept apart, and both are what the code does", async () => {
    assert.ok(
      flat.includes(
        '"Only NAISI’s admins read this, and it is kept apart from your application. This box is never scored, and leaving it blank does not count against you."',
      ),
      "the line has changed: read the three tests it is held to before changing it back",
    );
    // "Only NAISI's admins": everybody else who can read the application is
    // refused, and an admin is not (the suites above run every one of them).
    db.seed(privatePath("amara"), { accessRequirements: WROTE });
    as("claudia");
    assert.equal((await OPEN("amara")).status, 403);
    as("zach");
    assert.equal((await OPEN("amara")).status, 200);
    // "Kept apart from your application": another collection, at the same id.
    assert.notEqual(privatePath("amara").split("/")[0], applicationPath("amara").split("/")[0]);
    // "Never scored": no review can be written against it, because a score
    // is keyed by a question in a question set and this is not one.
    assert.doesNotMatch(source("lib", "applications", "scoring.ts"), /accessRequirements/);
  });

  test("the box is drawn above the sentence about who reads the application", () => {
    const step = source("features", "applications", "apply", "CheckStep.tsx");
    const boxAt = step.indexOf("{accessRequirements}");
    const readersAt = step.indexOf("className={styles.readers}");
    const suAt = step.indexOf('legend="Do you have SU membership?"');
    assert.ok(boxAt !== -1, "the step no longer draws the box");
    assert.ok(readersAt !== -1, "the step no longer has the sentence about who reads the application");
    assert.ok(suAt < boxAt && boxAt < readersAt, "the box has moved out from between the last question and who reads it");
  });

  test("the box counts against the stored limit and cannot be typed past it", () => {
    assert.match(box, /const MAX = ADMISSION_PRIVATE_FIELD_LIMITS\.accessRequirements;/);
    assert.match(box, /maxLength=\{MAX\}/);
  });

  test("nothing can be typed until what was written before has loaded", () => {
    // A box that opened empty and then saved would write over an answer the
    // person could not see.
    assert.match(box, /disabled=\{status\.kind === "loading"\}/);
    const hook = source("features", "applications", "apply", "useAccessRequirements.ts");
    assert.match(hook, /if \(!latest\.current\.enabled \|\| stored\.current === null\) return true;/);
    assert.match(hook, /if \(!latest\.current\.enabled \|\| stored\.current === null \|\| stopped\.current\) return;/);
  });

  test("a send and a leave both wait for the box to be saved", () => {
    const form = source("features", "applications", "apply", "ApplicationForm.tsx");
    const send = form.slice(form.indexOf("async function send()"), form.indexOf("const back = index > 0"));
    const settleAt = send.indexOf("await access.settle()");
    assert.ok(settleAt !== -1 && settleAt < send.indexOf("await sendApplication(form.id)"), "a send no longer waits for the box");
    const leave = form.slice(form.indexOf("async function finishLater()"), form.indexOf("async function send()"));
    assert.ok(leave.includes("await access.settle()"), "leaving no longer waits for the box");
    assert.match(form, /saveDraftFirst: \(\) => flush\(false, true\),/, "the box no longer saves the draft first");
  });
});

describe("what the review screen shows", () => {
  const screen = source("features", "applications", "review", "ReviewScreen.tsx");
  const block = source("features", "applications", "review", "AccessRequirementsBlock.tsx");

  test("the block is drawn for an admin and nobody else, keyed by the applicant", () => {
    const at = screen.indexOf("<AccessRequirementsBlock");
    assert.ok(at !== -1, "the review screen no longer has the block");
    const before = screen.slice(screen.lastIndexOf("{", screen.lastIndexOf("viewer.isAdmin ?", at)), at);
    assert.match(before, /\{viewer\.isAdmin \? \(\s*$/, "the block is no longer inside the admin's own branch");
    assert.match(screen.slice(at, at + 300), /key=\{applicant\.uid\}/);
  });

  test("it starts shut, and the answer is only ever what the route sent back", () => {
    assert.match(block, /useState<State>\(\{ kind: "shut" \}\)/);
    assert.match(block, /method: "POST"/);
    assert.doesNotMatch(block, /initial|review\./, "the block is being handed something off the review payload");
    assert.match(block, /<MemberText text=\{state\.text\}/, "the answer is drawn some other way than as text");
  });

  test("the review payload has no place for the answer", () => {
    const types = source("lib", "applications", "review", "types.ts");
    const detail = source("lib", "applications", "review", "detail.ts");
    const load = source("lib", "applications", "review", "load.ts");
    for (const [name, text] of [["types.ts", types], ["detail.ts", detail], ["load.ts", load]]) {
      assert.doesNotMatch(text, /accessRequirements|admissionApplicationPrivate/i, `review/${name} has learned about the answer`);
    }
  });
});
