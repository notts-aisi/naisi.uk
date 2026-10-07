/**
 * Nobody reads or decides their own application on a committee screen.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET, PUT  /api/admissions/forms/[roundId]/pool                       pooled applicants
 *   GET, POST /api/admissions/forms/[roundId]/send                       decision day
 *   POST      /api/admissions/forms/[roundId]/send/test                  a test of one email
 *   DELETE    /api/admissions/forms/[roundId]/applications/[uid]/decision  an acceptance taken back
 *
 * ## The rule this guards
 *
 * Everybody on the committee can apply, an admin included. What is scored
 * and decided about a person is not theirs to see before decision day, and
 * an outcome is never its own subject's to choose. The review screens have
 * always left the caller's own application out before anything is listed or
 * counted. The same holds on the screens an admin runs the term from:
 *
 *  - IT IS IN NO LIST AND NO NUMBER. Pooled applicants, decision day and the
 *    term page are built for whoever is looking, from the term with their own
 *    application left out. A number that counted it, beside a list that did
 *    not show it, would say where it stands.
 *  - THE PAGE SAYS SO, in one line, whenever the viewer has applied, wherever
 *    their application stands.
 *  - EVERY WRITER REFUSES THE CALLER'S OWN ID, in one sentence, before
 *    anything is read: a decision, an acceptance taken back, the outcome a
 *    pooled applicant hears. "Everybody with nothing picked" is everybody but
 *    the caller.
 *  - THE SEND STILL TELLS THEM. They hear on decision day like everybody
 *    else: their application holds the send while it has no outcome, a press
 *    publishes their result and emails them, and the term is marked as sent
 *    only when they have one. What holds the send is said in the words of
 *    what they are shown.
 *  - A TEST EMAIL IS NEVER THEIR OWN. A test is somebody's real email.
 *
 * ## The two halves of this file
 *
 * THE TREE. Every function that reads the committee's lists of applications,
 * decisions or reviews is listed with whether it leaves the viewer's own out
 * or why it reads everybody, and every reader of the whole term is listed
 * with what it does with it. Both lists are checked against the source in
 * both directions.
 *
 * THE HANDLERS. The routes above are run for real against a small term in
 * which the admin has applied, and what the admin is sent is compared with
 * what a second admin, who has not applied, is sent for the same term.
 *
 * Real: every handler, the builders, the writers, the send, `access.ts` and
 * the contract's pure functions. Faked: `next/server`, the sentinels
 * `firebase-admin/firestore` supplies, the view-as guard, the session, the
 * mail door (which records what it is handed and sends nothing), and the
 * Admin SDK handle, which is `tests/lib/applicationsStore.mjs`. The clock is
 * the runner's, set after the form's close.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  INCUBATOR,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  applicationDoc,
  applicationPath,
  decisionPath,
  roundDoc,
  seedTerm,
  session,
  stringsIn,
  userDoc,
} from "./lib/applicationsSmallTerm.mjs";
import { calls, callsOf, firstCall, scanModule, usesOf, walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const posix = (path) => path.split(sep).join("/");
const inSrc = (file) => posix(relative(SRC, file));

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** The staff repository's reads of everybody's applications, decisions and reviews. */
const LIST_READERS = ["listSentApplications", "listDecisions", "listReviews", "listReviewsOf"];
/** A parameter that is the person the screen is for, by the names this library gives one. */
const THE_VIEWER = ["user", "viewerUid", "viewer", "actor"];
/** The functions that leave the viewer's own application out, each of which takes the viewer. */
const LEAVES_OWN_OUT = ["termPictureFor", "termsFor", "loadTerm"];

/**
 * EVERY FUNCTION THAT CALLS ONE OF THOSE READS, with what it does about the
 * viewer's own application.
 *
 *  - `viewer`: it is built for somebody. It takes them as a parameter and
 *    hands them to one of the functions that leave their own application
 *    out, and it works nothing out from the raw lists itself.
 *  - `everybody`: it reads the whole term, for the reason written here.
 */
const READS_THE_LISTS = {
  "lib/applications/review/load.ts#loadTerm": {
    kind: "viewer",
    why: "both review screens start from the term as this caller may see it",
  },
  "lib/applications/lifecycle/loadTermHome.ts#loadTermNumbers": {
    kind: "viewer",
    why: "the term page's numbers are each the number of rows on the screen behind them",
  },
  "lib/applications/decisionDay/term.ts#loadTerm": {
    kind: "viewer",
    why: "pooled applicants and decision day are read for whoever is looking",
  },
  "lib/applications/decisionDay/pool.ts#buildPoolBoard": {
    kind: "viewer",
    why: "the reviewers' overall comments are read only for the pooled people the viewer is shown",
  },
  "lib/applications/decisionDay/pool.ts#setPooledOutcome": {
    kind: "everybody",
    why: "an invitation needs a place that is really free, so the writer counts the whole term. It refuses the caller's own id before it reads, and lists nothing",
    holds: "refuses-own",
  },
  "lib/applications/editor/load.ts#countApplicationsTo": {
    kind: "everybody",
    why: "how many applications rank a programme: it reads no decision and no review, so it says nothing about where anybody's application stands",
    holds: "no-decisions",
  },
  "lib/applications/editor/load.ts#loadTermTally": {
    kind: "everybody",
    why: "the whole term's arithmetic, kept for the suites that hold every count to one function. No screen calls it",
    holds: "uncalled",
  },
  "lib/scheduler/jobs/applicationInvitationReminders.ts#handler": {
    kind: "everybody",
    why: "a scheduled job with nobody looking: it reminds people decision day has already told",
    holds: "no-session",
  },
};

/**
 * EVERY CALL OF `planTerm`, which lines a raw list of applications up into
 * the term decision day works from. Anywhere else, a term is one of the two
 * readings `termsFor` hands back.
 */
const PLANS_THE_TERM = {
  "lib/applications/decisionDay/plan.ts#termsFor": "the one place the viewer's own application is left out",
  "lib/applications/decisionDay/pool.ts#setPooledOutcome": "the writer's own count of free places, inside its transaction",
};

/**
 * EVERY FUNCTION THAT HOLDS THE WHOLE TERM, the viewer's own application
 * included, and what it may do with it. `only` is every use it may make of
 * the name; without it, the function is one whose job is everybody.
 */
const HOLDS_EVERYBODY = {
  "lib/applications/decisionDay/plan.ts#termsFor": { why: "makes the two readings" },
  "lib/applications/decisionDay/plan.ts#sendBlockersFor": {
    why: "whether the send is held is decided by everybody; what is said about it by what the viewer is shown",
  },
  "lib/applications/decisionDay/term.ts#loadTerm": { why: "hands both readings to the two screens" },
  "lib/applications/decisionDay/send.ts#buildSendBoard": {
    why: "the page asks whether the send is held, and lists and counts nothing from the whole term",
    only: ["taken", "handed:sendBlockersFor"],
  },
  "lib/applications/decisionDay/send.ts#runDecisionDay": {
    why: "the send tells everybody, the admin who presses it included",
  },
};

const modules = new Map();
const scan = (file) => {
  if (!modules.has(file)) modules.set(file, scanModule(file));
  return modules.get(file);
};
const sourceFiles = [...walkSource(SRC)];
const staffRepo = join(SRC, "lib", "applications", "staffRepo.ts");
/** `file#function` for every function of `src` whose own body satisfies `test`. */
function functionsWhere(test, except = []) {
  const found = new Map();
  for (const file of sourceFiles) {
    if (except.includes(file)) continue;
    const mod = scan(file);
    for (const fn of mod.functions.values()) {
      if (test(fn, mod)) found.set(`${inSrc(file)}#${fn.name}`, { mod, fn });
    }
  }
  return found;
}

describe("every reader of the committee's lists says what it does about the viewer's own application", () => {
  const readers = functionsWhere((fn) => LIST_READERS.some((name) => calls(fn.body, name)), [staffRepo]);

  test("the list is the tree: nothing missing from it, and nothing on it that has gone", () => {
    assert.deepEqual(
      [...readers.keys()].filter((key) => !Object.hasOwn(READS_THE_LISTS, key)),
      [],
      "a function reads everybody's applications, decisions or reviews and is not on the list. Say who it is built for, or why it reads everybody, in READS_THE_LISTS.",
    );
    assert.deepEqual(Object.keys(READS_THE_LISTS).filter((key) => !readers.has(key)), []);
    for (const [key, entry] of Object.entries(READS_THE_LISTS)) {
      assert.ok(["viewer", "everybody"].includes(entry.kind), key);
      assert.ok(typeof entry.why === "string" && entry.why.length > 20, `${key} needs its reason written down`);
    }
  });

  test("no call of a list reader is made outside a function", () => {
    const loose = [];
    for (const file of sourceFiles) {
      if (file === staffRepo) continue;
      for (const reader of LIST_READERS) {
        for (const call of callsOf(file, reader)) if (call.inFunction === null) loose.push(`${inSrc(file)}:${call.line}`);
      }
    }
    assert.deepEqual(loose, []);
  });

  for (const [key, entry] of Object.entries(READS_THE_LISTS)) {
    const at = readers.get(key);
    if (!at) continue;
    const { mod, fn } = at;

    if (entry.kind === "viewer") {
      test(`${key} is built for somebody, and hands them on`, () => {
        const viewer = fn.params.flatMap((param) => param.names).filter((name) => THE_VIEWER.includes(name));
        assert.ok(viewer.length > 0, `${key} takes nobody to build the screen for`);
        const handedOn = LEAVES_OWN_OUT.flatMap((name) => callsOf(mod.file, name))
          .filter((call) => call.inFunction === fn.name)
          .filter((call) => viewer.some((name) => new RegExp(`\\b${name}\\b`).test(call.args.map((arg) => arg.text).join(","))));
        assert.ok(handedOn.length > 0, `${key} never hands its viewer to ${LEAVES_OWN_OUT.join(", ")}`);
        for (const raw of ["planTerm", "tallyTerm"]) {
          assert.ok(!calls(fn.body, raw), `${key} works the term out itself with ${raw}, from lists that still hold the viewer's own application`);
        }
      });
    }

    if (entry.holds === "refuses-own") {
      test(`${key} refuses the caller's own id before it reads`, () => {
        const refused = fn.body.search(/request\.uid\s*===\s*actor\.uid/);
        const read = Math.min(...["loadForm", ...LIST_READERS].map((name) => firstCall(fn.body, name)).filter((at) => at >= 0));
        assert.ok(refused >= 0 && refused < read, `${key} reads before it has compared the id it was handed with the caller's own`);
        assert.match(fn.body, /if \(person\.uid === actor\.uid\) continue;/, "and everybody-at-once passes the caller over");
      });
    }
    if (entry.holds === "no-decisions") {
      test(`${key} reads no decision and no review`, () => {
        for (const reader of ["listDecisions", "listReviews", "listReviewsOf", "loadDecision"]) {
          assert.ok(!calls(fn.body, reader), `${key} calls ${reader}`);
        }
      });
    }
    if (entry.holds === "uncalled") {
      test(`${key} is called by nothing a screen is built from`, () => {
        const callers = sourceFiles.filter((file) => calls(scan(file).text.replace(fn.text, ""), fn.name));
        assert.deepEqual(callers.map(inSrc), []);
      });
    }
    if (entry.holds === "no-session") {
      test(`${key} is a job: nobody is signed in where it runs`, () => {
        assert.ok(inSrc(mod.file).startsWith("lib/scheduler/jobs/"));
        assert.ok(!mod.imports.has("getCurrentUser"), "a job has no session to read");
      });
    }
  }
});

describe("a term is planned from a raw list in two places only", () => {
  const plan = join(SRC, "lib", "applications", "decisionDay", "plan.ts");

  test("every call of planTerm is one of the two", () => {
    const found = [];
    for (const file of sourceFiles) {
      for (const call of callsOf(file, "planTerm")) found.push(`${inSrc(file)}#${call.inFunction}`);
    }
    assert.deepEqual([...new Set(found)].sort(), Object.keys(PLANS_THE_TERM).sort());
  });

  test("whoever asks for the term says who it is for, by name", () => {
    // `loadTerm` here is the decision-day loader. The review screens have a
    // loader of the same name, private to its own file, held above.
    const asked = [];
    for (const file of sourceFiles) {
      const mod = scan(file);
      const names = ["termsFor"];
      if (mod.imports.get("loadTerm") === "./term" || file === plan) names.push("loadTerm");
      for (const name of names) {
        for (const call of callsOf(file, name)) asked.push({ where: `${inSrc(file)}:${call.line}`, name, viewer: call.args[call.args.length - 1] });
      }
    }
    assert.ok(asked.length >= 5, "the calls this test is about were not found");
    for (const { where, name, viewer } of asked) {
      assert.ok(viewer?.named, `${where} calls ${name} for ${viewer?.text ?? "nobody"}, which is not a person's id held in a name`);
      assert.match(viewer.text, /^(viewerUid|user\.uid|actor\.uid)$/, `${where} calls ${name} for ${viewer.text}`);
    }
  });

  test("a term asked for with no viewer is refused, never taken to mean everybody", async () => {
    const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
    const planModule = await loadTs(join("lib", "applications", "decisionDay", "plan.ts"));
    const normalise = await loadTs(join("lib", "applications", "normalise.ts"));
    const form = normalise.normaliseForm(ROUND, roundDoc());
    for (const nobody of [undefined, null, "", 0, new Date()]) {
      assert.throws(() => planModule.termsFor(form, [], new Map(), nobody), /no viewer was given/);
    }
    const views = planModule.termsFor(form, [], new Map(), "zach");
    assert.equal(views.shown, views.whole, "for somebody who has not applied the two readings are one");
    assert.equal(views.own, "none");
  });
});

describe("the whole term is held only where a written reason says", () => {
  const NAMES = ["whole", "wholeApplications"];
  /** Files that can hold a loaded term at all: they ask for one, or make one. */
  const candidates = sourceFiles.filter((file) => /\b(termsFor|loadTerm|sendBlockersFor)\b/.test(scan(file).text));
  const holders = new Map();
  for (const file of candidates) {
    for (const fn of scan(file).functions.values()) {
      const uses = NAMES.flatMap((name) => usesOf(file, fn.name, name) ?? []);
      if (uses.length > 0) holders.set(`${inSrc(file)}#${fn.name}`, uses);
    }
  }

  test("the list is the tree", () => {
    assert.deepEqual([...holders.keys()].sort(), Object.keys(HOLDS_EVERYBODY).sort());
  });

  for (const [key, entry] of Object.entries(HOLDS_EVERYBODY)) {
    if (!entry.only) continue;
    test(`${key} does nothing with it but what its entry says`, () => {
      const uses = (holders.get(key) ?? []).map((use) => use.how);
      assert.ok(uses.length > 0);
      assert.deepEqual(uses.filter((how) => !entry.only.includes(how)), [], `${key}: ${entry.why}`);
    });
  }
});

// ---------------------------------------------------------------------------
// The handlers
// ---------------------------------------------------------------------------

process.env.NEXT_PUBLIC_APP_URL = "https://staging.example.com";
delete process.env.SMTP_FROM_NAME;
delete process.env.SMTP_HOST;
delete process.env.EMAIL_AUDIENCE;
mock.timers.enable({ apis: ["Date"], now: WHILE_DECIDING });

const world = { db: null, user: null, mail: [] };
globalThis.__ownApplication = world;

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "next/server",
    "export class NextResponse {\n" +
      "  constructor(body, init) {\n" +
      "    this.body = body;\n" +
      "    this.status = (init && init.status) || 200;\n" +
      "  }\n" +
      "  static json(body, init) { return new NextResponse(body, init); }\n" +
      "}",
  ],
  ["firebase-admin/firestore", FIELD_VALUE_STUB],
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__ownApplication.db;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__ownApplication.user;\n}"],
  ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() {\n  return null;\n}"],
  [
    // The one mail door. It records what it is handed and sends nothing.
    "@/lib/email/send",
    "export async function sendEmail(args) {\n" +
      "  globalThis.__ownApplication.mail.push(args);\n" +
      "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
      "}",
  ],
]);
const { loadTs } = createLoader({ stubs: STUBS });
const FORMS = join("app", "api", "admissions", "forms", "[roundId]");
const poolRoute = await loadTs(join(FORMS, "pool", "route.ts"));
const sendRoute = await loadTs(join(FORMS, "send", "route.ts"));
const testRoute = await loadTs(join(FORMS, "send", "test", "route.ts"));
const decisionRoute = await loadTs(join(FORMS, "applications", "[uid]", "decision", "route.ts"));
const termHome = await loadTs(join("lib", "applications", "lifecycle", "loadTermHome.ts"));
const tested = await loadTs(join("lib", "applications", "decisionDay", "tested.ts"));
const plan = await loadTs(join("lib", "applications", "decisionDay", "plan.ts"));
const words = await loadTs(join("lib", "applications", "decisionDay", "boardWords.ts"));
const normalise = await loadTs(join("lib", "applications", "normalise.ts"));

/** A second admin, who has not applied: what the term looks like to anybody else. */
const PRIYA = session("priya", "admin", false, "Priya Shah");
const PEOPLE = { ...CAST, priya: PRIYA };
/** The name on the admin's own application, which nothing else in the term contains. */
const OWN_NAME = "Aaron Applicant";
/** What two reviewers wrote about the admin's own application. */
const ABOUT_OWN = ["Thoughtful, and would suit a later term.", "Not enough on the reading."];
const DECIDED = new Date("2026-10-19T09:00:00+01:00");
const OWN_SENTENCE = "You can’t decide your own application.";

const decided = (decision, by, over = {}) => ({
  decision,
  poolReason: null,
  couldSuitProgrammeId: null,
  decidedByUid: by,
  decidedAt: DECIDED,
  ...over,
});
const decisions = (uid, programmes, pooledOutcome = null) => ({
  [decisionPath(uid)]: {
    roundId: ROUND,
    uid,
    programmes,
    pooledOutcome: pooledOutcome ? { ...pooledOutcome, setByUid: "priya", setAt: DECIDED } : null,
    exception: null,
  },
});
const reviewOf = (applicantUid, reviewerUid, notes) => ({
  [`admissionReviews/${ROUND}__${applicantUid}__${reviewerUid}`]: {
    roundId: ROUND,
    applicantUid,
    reviewerUid,
    scores: {},
    total: 0,
    comments: [],
    notes,
    createdAt: DECIDED,
    updatedAt: DECIDED,
  },
});
const published = (kind, programmeId) => ({
  kind,
  programmeId,
  publishedAt: DECIDED,
  email: "sent",
  emailedAt: DECIDED,
  emailClaimedAt: null,
});

/** The admin's own application: sent, ranking AGI Strategy alone, under the name above. */
const ownApplication = (over = {}) => {
  const stored = applicationDoc("zach", [AGI]);
  const content = { ...stored.sent, aboutYou: { ...stored.sent.aboutYou, preferredName: "Aaron" } };
  return {
    [applicationPath("zach")]: { ...stored, displayName: OWN_NAME, draft: content, sent: content, ...over },
  };
};
/** Amara is accepted by AGI Strategy and Wen by Technical AI Safety. Dev is pooled. */
const OTHERS = {
  [`users/${PRIYA.uid}`]: userDoc(PRIYA),
  ...decisions("amara", { [AGI]: decided("accept", "claudia") }),
  ...decisions("wen", { [TAIS]: decided("accept", "tess") }),
  ...reviewOf("dev", "lloyd", "Keen, with little behind it yet."),
};
const DEV_WAITING = decisions("dev", { [AGI]: decided("pool", "claudia") });
const DEV_NO_OFFER = decisions("dev", { [AGI]: decided("pool", "claudia") }, { kind: "no-offer" });
/** Pooled by AGI Strategy, with why, where they could suit and what two reviewers wrote. */
const OWN_POOLED = {
  ...ownApplication(),
  ...decisions("zach", {
    [AGI]: decided("pool", "claudia", { poolReason: "better-fit", couldSuitProgrammeId: INCUBATOR }),
  }),
  ...reviewOf("zach", "claudia", ABOUT_OWN[0]),
  ...reviewOf("zach", "lloyd", ABOUT_OWN[1]),
};
const OWN_ACCEPTED = { ...ownApplication(), ...decisions("zach", { [AGI]: decided("accept", "claudia") }) };
const OWN_INVITED = {
  ...ownApplication(),
  ...decisions("zach", { [AGI]: decided("pool", "claudia") }, { kind: "invite", programmeId: INCUBATOR }),
};
const OWN_UNDECIDED = ownApplication();

/** A form whose decision emails have been tested as they are worded now. */
function testedRound(over = {}) {
  const doc = roundDoc({ applicationCounts: { draft: 0, submitted: 4 }, ...over });
  return {
    ...doc,
    decisionEmailTest: {
      byUid: "priya",
      at: DECIDED,
      wording: tested.wordingFingerprint(normalise.normaliseFormFields(doc)),
    },
  };
}

function term(...docs) {
  const over = Object.assign({ [`admissionRounds/${ROUND}`]: testedRound() }, OTHERS, ...docs);
  world.db = makeDb(seedTerm({ over }), { now: WHILE_DECIDING });
  world.mail = [];
  return world.db;
}
const as = (uid) => {
  world.user = PEOPLE[uid];
};
const ctx = (params = {}) => ({ params: Promise.resolve({ roundId: ROUND, ...params }) });
const request = (method, body) =>
  new Request("http://naisi.invalid/api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const poolFor = async (uid) => {
  as(uid);
  return (await poolRoute.GET(request("GET"), ctx())).body.board;
};
const sendFor = async (uid) => {
  as(uid);
  return (await sendRoute.GET(request("GET"), ctx())).body.board;
};
const pick = (body) => poolRoute.PUT(request("PUT", body), ctx());
const press = (body) => sendRoute.POST(request("POST", body), ctx());
const revoke = (uid, programmeId = AGI) =>
  decisionRoute.DELETE(request("DELETE", { programmeId, reason: "A place was promised twice." }), ctx({ uid }));
const uidsIn = (people) => people.map((person) => person.uid);
/** True where a payload carries anything of the admin's own application. */
const carriesOwn = (payload) => {
  const strings = stringsIn(payload);
  return strings.includes(OWN_NAME) || ABOUT_OWN.some((text) => strings.includes(text));
};

describe("pooled applicants, for an admin who has applied and been pooled", () => {
  test("to anybody else the admin's application is a row like any other: that is the term these cases run on", async () => {
    term(DEV_WAITING, OWN_POOLED);
    const board = await poolFor("priya");
    assert.deepEqual(uidsIn(board.rows), ["zach", "dev"]);
    const row = board.rows[0];
    assert.deepEqual([row.name, row.reasons, row.couldSuit], [OWN_NAME, ["Better fit"], ["Research incubator"]]);
    assert.deepEqual(row.comments.map((comment) => comment.text).sort(), [...ABOUT_OWN].sort());
    assert.deepEqual(board.counts, { pooled: 2, invitations: 0, noOffer: 0, needsOutcome: 2 });
    assert.equal(board.ownApplication, "none");
  });

  test("their own application is in no row, no count and no comment, and the page is told only that they have one", async () => {
    term(DEV_WAITING, OWN_POOLED);
    const board = await poolFor("zach");
    assert.deepEqual(uidsIn(board.rows), ["dev"]);
    assert.deepEqual(board.counts, { pooled: 1, invitations: 0, noOffer: 0, needsOutcome: 1 });
    assert.equal(board.counts.pooled, board.rows.length);
    assert.equal(carriesOwn(board), false, "something of the admin's own application is in what they were sent");
    assert.equal(board.ownApplication, "not-told");
    const agi = board.programmes.find((programme) => programme.id === AGI);
    assert.equal(agi.firstChoice, 1, "the filter's count is of the rows it filters");
  });

  test("an invitation picked for them takes no place they can see taken", async () => {
    term(DEV_WAITING, OWN_INVITED);
    const [theirs, anybodys] = [await poolFor("zach"), await poolFor("priya")];
    const incubator = (board) => board.programmes.find((programme) => programme.id === INCUBATOR);
    assert.deepEqual([incubator(anybodys).invited, incubator(anybodys).left], [1, 3]);
    assert.deepEqual([incubator(theirs).invited, incubator(theirs).left], [0, 4]);
    assert.deepEqual(theirs.counts, { pooled: 1, invitations: 0, noOffer: 0, needsOutcome: 1 });
  });

  test("a place they hold is not counted either, and somebody who has left is not listed", async () => {
    term(DEV_WAITING, OWN_ACCEPTED);
    const agi = (board) => board.programmes.find((programme) => programme.id === AGI);
    assert.equal(agi(await poolFor("priya")).placed, 2);
    assert.equal(agi(await poolFor("zach")).placed, 1);

    // Told they were invited, and said no thanks: listed for anybody else.
    term(
      DEV_WAITING,
      ownApplication({
        status: "withdrawn",
        withdrawnAt: DECIDED,
        result: published("invited", INCUBATOR),
        invitation: { programmeId: INCUBATOR, replyBy: "2026-10-25", response: "declined", respondedAt: DECIDED, lastReminderOn: null },
        releaseReason: { kind: "times", other: "" },
      }),
      decisions("zach", { [AGI]: decided("pool", "claudia") }, { kind: "invite", programmeId: INCUBATOR }),
    );
    assert.deepEqual(uidsIn((await poolFor("priya")).left), ["zach"]);
    const theirs = await poolFor("zach");
    assert.deepEqual(theirs.left, []);
    assert.equal(carriesOwn(theirs), false);
    assert.equal(theirs.ownApplication, "told");
  });

  test("the term page's pooled numbers are the pooled applicants page's own", async () => {
    const db = term(DEV_WAITING, OWN_POOLED);
    const form = normalise.normaliseForm(ROUND, db.read(`admissionRounds/${ROUND}`));
    assert.deepEqual((await termHome.loadTermNumbers(db, PEOPLE.zach, form)).pool, { pooled: 1, needsOutcome: 1 });
    assert.deepEqual((await termHome.loadTermNumbers(db, PEOPLE.priya, form)).pool, { pooled: 2, needsOutcome: 2 });
    const board = await poolFor("zach");
    assert.deepEqual(
      (await termHome.loadTermNumbers(db, PEOPLE.zach, form)).pool,
      { pooled: board.counts.pooled, needsOutcome: board.counts.needsOutcome },
    );
  });

  test("the line is said whenever they have applied, wherever their application stands, and to nobody else", async () => {
    for (const own of [OWN_POOLED, OWN_ACCEPTED, OWN_INVITED, OWN_UNDECIDED]) {
      term(DEV_WAITING, own);
      assert.equal((await poolFor("zach")).ownApplication, "not-told");
      assert.equal((await sendFor("zach")).ownApplication, "not-told");
      assert.equal((await poolFor("priya")).ownApplication, "none");
    }
    // A draft never sent, and no application at all, are nothing to leave out.
    term(DEV_WAITING, { [applicationPath("zach")]: applicationDoc("zach", [AGI], { sent: false }) });
    assert.equal((await poolFor("zach")).ownApplication, "none");
    term(DEV_WAITING);
    assert.equal((await poolFor("zach")).ownApplication, "none");

    assert.equal(words.ownApplicationLine("none", "pool"), null);
    assert.equal(
      words.ownApplicationLine("not-told", "pool"),
      "Your own application is not shown or counted here. Another admin has to choose its outcome.",
    );
    assert.equal(
      words.ownApplicationLine("not-told", "send"),
      "Your own application is not shown or counted here. Another admin has to choose its outcome, and you hear with everybody else.",
    );
    for (const page of ["pool", "send"]) {
      assert.equal(words.ownApplicationLine("told", page), "Your own application is not shown or counted here.");
    }
  });
});

describe("nobody picks what they themselves will hear", () => {
  const TRIES = [
    { uid: "zach", outcome: { kind: "no-offer" } },
    { uid: "zach", outcome: { kind: "invite", programmeId: INCUBATOR } },
  ];

  test("the admin's own id is refused in one sentence, before anything is read, wherever their application stands", async () => {
    const answers = new Set();
    const stands = [OWN_POOLED, OWN_ACCEPTED, OWN_INVITED, OWN_UNDECIDED, {}];
    for (const own of stands) {
      for (const body of TRIES) {
        const db = term(DEV_WAITING, own);
        as("zach");
        const before = db.stats.reads;
        const response = await pick(body);
        assert.deepEqual([response.status, response.body], [403, { error: OWN_SENTENCE }]);
        assert.equal(db.stats.reads, before, "the refusal read something first");
        assert.deepEqual(db.stats.writes, []);
        answers.add(JSON.stringify([response.status, response.body]));
      }
    }
    assert.equal(answers.size, 1);
  });

  test("another admin picks it, as for anybody", async () => {
    const db = term(DEV_WAITING, OWN_POOLED);
    as("priya");
    const response = await pick(TRIES[1]);
    assert.equal(response.status, 200);
    assert.deepEqual(
      [db.read(decisionPath("zach")).pooledOutcome.kind, db.read(decisionPath("zach")).pooledOutcome.setByUid],
      ["invite", "priya"],
    );
  });

  test("everybody with nothing picked is everybody but the caller", async () => {
    const db = term(DEV_WAITING, OWN_POOLED);
    as("zach");
    const response = await pick({ everyoneWithoutOne: true, outcome: { kind: "no-offer" } });
    assert.deepEqual([response.status, response.body.changed], [200, 1]);
    assert.equal(db.read(decisionPath("dev")).pooledOutcome.kind, "no-offer");
    assert.equal(db.read(decisionPath("zach")).pooledOutcome, null, "their own outcome is still another admin's to choose");
    const logged = db.paths().filter((path) => path.startsWith("courseAudit/")).map((path) => db.read(path));
    assert.deepEqual(logged.map((row) => row.detail), ["Picked no offer this time for the 1 pooled applicant who had nothing picked."]);
    assert.equal(carriesOwn(response.body), false);

    // The same press from an admin who has not applied reaches both.
    const again = term(DEV_WAITING, OWN_POOLED);
    as("priya");
    assert.equal((await pick({ everyoneWithoutOne: true, outcome: { kind: "no-offer" } })).body.changed, 2);
    assert.equal(again.read(decisionPath("zach")).pooledOutcome.kind, "no-offer");
  });
});

describe("nobody takes back an acceptance of their own", () => {
  test("refused in the same sentence whether or not a programme accepted them, before anything is read", async () => {
    const answers = new Set();
    for (const own of [OWN_ACCEPTED, OWN_POOLED, OWN_UNDECIDED, {}]) {
      const db = term(DEV_WAITING, own);
      as("zach");
      const before = db.stats.reads;
      const response = await revoke("zach");
      assert.deepEqual([response.status, response.body], [403, { error: OWN_SENTENCE }]);
      assert.equal(db.stats.reads, before);
      assert.deepEqual(db.stats.writes, []);
      answers.add(JSON.stringify([response.status, response.body]));
    }
    assert.equal(answers.size, 1);
  });

  test("another admin can, and the acceptance goes", async () => {
    const db = term(DEV_WAITING, OWN_ACCEPTED);
    as("priya");
    const response = await revoke("zach");
    assert.equal(response.status, 200);
    assert.equal(db.read(decisionPath("zach")).programmes[AGI], undefined);
  });
});

describe("decision day, for an admin who has applied", () => {
  test("they are in no group and no number, and the groups anybody else sees are the same without them", async () => {
    term(DEV_NO_OFFER, OWN_ACCEPTED);
    const [theirs, anybodys] = [await sendFor("zach"), await sendFor("priya")];
    assert.deepEqual(uidsIn(anybodys.accepted.people), ["zach", "amara", "wen"]);
    assert.deepEqual(uidsIn(theirs.accepted.people), ["amara", "wen"]);
    assert.deepEqual([anybodys.applied, theirs.applied], [4, 3]);
    assert.deepEqual([anybodys.pending.people, anybodys.pending.emails], [4, 4]);
    assert.deepEqual([theirs.pending.people, theirs.pending.emails], [3, 3]);
    assert.equal(carriesOwn(theirs), false);
    const places = (board) => board.readiness.find((row) => row.key === AGI).detail;
    assert.notEqual(places(theirs), places(anybodys), "a place they hold is not in the number of places taken");
    assert.deepEqual([theirs.blockers, anybodys.blockers], [[], []]);
  });

  test("the email shown for a group is never their own", async () => {
    // The name on their application sorts first, so anybody else is shown theirs.
    term(DEV_NO_OFFER, OWN_ACCEPTED);
    assert.equal((await sendFor("priya")).accepted.preview.to, OWN_NAME);
    assert.equal((await sendFor("zach")).accepted.preview.to, "Amara Okafor");

    // Alone in a group, there is nobody's email to show them.
    term(DEV_NO_OFFER, OWN_INVITED);
    assert.equal((await sendFor("priya")).invited.preview.to, OWN_NAME);
    const theirs = await sendFor("zach");
    assert.deepEqual([theirs.invited.people, theirs.invited.preview], [[], null]);
  });

  test("a test email is somebody else's, or there is none to send", async () => {
    term(DEV_NO_OFFER, OWN_ACCEPTED);
    as("zach");
    const sent = await testRoute.POST(request("POST", { kind: "accepted" }), ctx());
    assert.equal(sent.status, 200);
    assert.equal(world.mail.length, 1);
    assert.equal(world.mail[0].to, "zach@example.com");
    const body = JSON.stringify(stringsIn(world.mail[0]));
    assert.match(body, /Hi Amara,/, "the test is the first other person's email");
    assert.ok(!body.includes("Aaron"), "the test was the asker's own email");

    term(DEV_NO_OFFER, OWN_INVITED);
    as("zach");
    const none = await testRoute.POST(request("POST", { kind: "invitation" }), ctx());
    assert.deepEqual([none.status, none.body], [409, { error: "Nobody is in that group yet, so there is no email to test." }]);
    assert.deepEqual(world.mail, []);
    as("priya");
    assert.equal((await testRoute.POST(request("POST", { kind: "invitation" }), ctx())).status, 200);
    assert.match(JSON.stringify(stringsIn(world.mail[0])), /Hi Aaron,/);
  });
});

describe("the send still sees them", () => {
  test("their application with no outcome holds the send, and the page says only that it is theirs", async () => {
    for (const own of [OWN_POOLED, OWN_UNDECIDED]) {
      term(DEV_NO_OFFER, own);
      const anybodys = await sendFor("priya");
      assert.equal(anybodys.blockers.length, 1);
      assert.match(anybodys.blockers[0], /still needs an outcome|still owes 1 application a decision/);

      const theirs = await sendFor("zach");
      assert.deepEqual(theirs.blockers, [plan.OWN_APPLICATION_HOLDS_THE_SEND]);
      assert.ok(theirs.readiness.every((row) => row.ready), "every row they can see is ready");
      const said = stringsIn(theirs).join("\n");
      assert.ok(!/pooled person still needs|still owes \d+ application/.test(said), "the page said what their application needs");
    }
  });

  test("a press is refused in the same words, and tells nobody", async () => {
    const db = term(DEV_NO_OFFER, OWN_POOLED);
    as("zach");
    const response = await press({ emails: 3, emailDeclined: false });
    assert.deepEqual([response.status, response.body], [409, { error: plan.OWN_APPLICATION_HOLDS_THE_SEND }]);
    assert.deepEqual(world.mail, []);
    for (const uid of ["amara", "dev", "wen", "zach"]) assert.equal(db.read(applicationPath(uid)).result, null, uid);
  });

  test("what else holds the send is said as they see it, and theirs is not added to it", async () => {
    // Dev and the admin are both pooled with nothing picked.
    term(DEV_WAITING, OWN_POOLED);
    assert.deepEqual((await sendFor("priya")).blockers, ["2 pooled people still need an outcome."]);
    assert.deepEqual((await sendFor("zach")).blockers, ["1 pooled person still needs an outcome."]);
  });

  test("something only their application is waiting on is not named to them", async () => {
    // The only invitation is their own, and the form names no day to reply by.
    term(DEV_NO_OFFER, OWN_INVITED, { [`admissionRounds/${ROUND}`]: testedRound({ invitationReplyBy: null }) });
    assert.deepEqual((await sendFor("priya")).blockers, ["Invitations need a reply-by date. Set it in the application form."]);
    assert.deepEqual((await sendFor("zach")).blockers, [plan.OWN_APPLICATION_HOLDS_THE_SEND]);
  });

  test("with an outcome, a press from the page's own number tells everybody, the admin included", async () => {
    const db = term(DEV_NO_OFFER, OWN_ACCEPTED);
    const board = await sendFor("zach");
    const emails = board.pending.emails + board.owed.people.length;
    assert.equal(emails, 3, "the button's number does not count their own");

    as("zach");
    const response = await press({ emails, emailDeclined: false });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const { report } = response.body;
    assert.deepEqual([report.published, report.emailed, report.complete], [4, 4, true]);

    // Their own document carries the result, and their own email went.
    const own = db.read(applicationPath("zach"));
    assert.deepEqual([own.status, own.result.kind, own.result.programmeId, own.result.email], ["accepted", "accepted", AGI, "sent"]);
    assert.deepEqual(world.mail.map((message) => message.to).sort(), ["amara@example.com", "dev@example.com", "wen@example.com", "zach@example.com"]);
    const round = db.read(`admissionRounds/${ROUND}`);
    assert.deepEqual([round.decisionsSentAt instanceof Date, round.decisionsSentByUid], [true, "zach"]);

    // And afterwards the page still shows them nothing of their own.
    const after = response.body.board;
    assert.deepEqual(uidsIn(after.accepted.people), ["amara", "wen"]);
    assert.equal(after.ownApplication, "told");
    assert.equal(carriesOwn(after), false);
  });

  test("the number a press sends back is counted the way the page counted it", async () => {
    const db = term(DEV_NO_OFFER, OWN_ACCEPTED);
    as("zach");
    const response = await press({ emails: 4, emailDeclined: false });
    assert.equal(response.status, 409);
    assert.match(response.body.error, /this would now send 3 emails, not 4/);
    assert.deepEqual(world.mail, []);
    assert.equal(db.read(applicationPath("zach")).result, null);

    // For an admin who has not applied the page's number is everybody.
    as("priya");
    assert.equal((await press({ emails: 3, emailDeclined: false })).status, 409);
    assert.equal((await press({ emails: 4, emailDeclined: false })).status, 200);
  });

  test("a press that does not reach them leaves the term unsent, whoever else it told", async () => {
    const db = term(DEV_NO_OFFER, OWN_ACCEPTED);
    const board = await sendFor("zach");
    // Their name sorts first, so theirs is the first result the press writes.
    // As it is written, the lead changes their mind about them: that result
    // is no longer what the press set out to tell, so it is left for a press
    // that has seen the change.
    db.beforeCommit = () => db.poke(decisionPath("zach"), { [`programmes.${AGI}`]: decided("pool", "claudia") });
    as("zach");
    const response = await press({ emails: board.pending.emails, emailDeclined: false });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const { report } = response.body;
    assert.deepEqual([report.published, report.changed, report.complete], [3, 1, false]);
    assert.equal(db.read(applicationPath("zach")).result, null);
    for (const uid of ["amara", "dev", "wen"]) assert.notEqual(db.read(applicationPath(uid)).result, null, uid);
    assert.equal(
      db.read(`admissionRounds/${ROUND}`).decisionsSentAt,
      null,
      "the term was marked as sent with somebody in it still untold",
    );
    // Everybody they can see has been told, and the send is still held.
    const after = response.body.board;
    assert.deepEqual([after.sentOn, after.pending.people, after.published], [null, 0, 3]);
    assert.deepEqual(after.blockers, [plan.OWN_APPLICATION_HOLDS_THE_SEND]);
  });

  test("a later press tells them, and only then is the term marked as sent", async () => {
    // Everybody else was told by an earlier press. Their own was not reached.
    const toldAlready = (uid, kind, programmeId) => ({
      [applicationPath(uid)]: { ...applicationDoc(uid, uid === "wen" ? [TAIS, AGI] : uid === "amara" ? [AGI, TAIS] : [AGI]), status: kind, result: published(kind, programmeId) },
    });
    const db = term(
      DEV_NO_OFFER,
      OWN_ACCEPTED,
      toldAlready("amara", "accepted", AGI),
      toldAlready("wen", "accepted", TAIS),
      toldAlready("dev", "no-offer", null),
    );
    const board = await sendFor("zach");
    assert.deepEqual([board.sentOn, board.pending.people, board.published], [null, 0, 3]);
    assert.equal(db.read(`admissionRounds/${ROUND}`).decisionsSentAt, null);

    as("zach");
    const response = await press({ emails: 0, emailDeclined: false });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual([response.body.report.published, response.body.report.complete], [1, true]);
    assert.equal(db.read(applicationPath("zach")).result.kind, "accepted");
    assert.ok(db.read(`admissionRounds/${ROUND}`).decisionsSentAt instanceof Date);
  });
});
