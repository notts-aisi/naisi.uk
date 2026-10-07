/**
 * Who is shown somebody's answer about SU membership: an admin, on the
 * decision-day page, and nobody else.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET /api/admissions/forms/[roundId]/send                                decision day
 *   GET /api/admissions/forms/[roundId]/pool                                pooled applicants
 *   GET /api/admissions/forms/[roundId]/programmes/[programmeId]/applications  a programme's list
 *   GET /api/admissions/forms/[roundId]/applications/[uid]                  one application, to review
 *   GET /api/admissions/forms/[roundId]/application                         the caller's own
 *   /apply/[roundId]                                                        the form
 *
 * ## The rule this guards
 *
 * The form's last step asks whether somebody has SU membership, and tells
 * them the answer will not affect their application. The site's privacy page
 * says the answer is shown to admins only, and that it does not affect
 * whether a place is offered. So:
 *
 *  - ONE PAGE SHOWS IT, TO AN ADMIN. Decision day lists everybody under what
 *    they are being told, and an admin sees each person's answer under their
 *    name, so that somebody can help the people who are joining a programme
 *    to get their membership before term.
 *  - A LEAD OR A REVIEWER WHO IS NOT AN ADMIN IS NEVER SENT IT. Not on that
 *    page, which refuses them, and not in anything they are sent: the key is
 *    in no payload of theirs, on any screen.
 *  - NOTHING THAT DECIDES, RECOMMENDS OR ORDERS APPLICATIONS READS IT. It is
 *    read in one expression, where the page's lists of names are built, for
 *    people whose outcome is already chosen. Pooled applicants, where an admin
 *    chooses what somebody hears, does not show it, and neither does any
 *    review screen, for an admin or for anybody.
 *  - NEVER THE VIEWER'S OWN, AND NEVER IN A VIEW-AS SESSION. An admin who has
 *    applied is not on their own page. A session borrowed from a member is
 *    not an admin's, so decision day refuses it, the member's own route
 *    refuses it, and their form draws a notice in place of their application.
 *
 * ## The two halves of this file
 *
 * THE TREE. Every file on the committee's side of the application system
 * that names the answer is listed with what it does, both ways, and the one
 * read is found where this file says it is.
 *
 * THE HANDLERS, run for real against a small term in which five people have
 * each given an answer, as two admins, a lead, a reviewer, a committee member
 * named on nothing, an applicant, and an admin viewing as a member.
 *
 * Real: every handler, the builders, `access.ts`, the applicant's gate, and
 * the view-as module itself, which reads the cookie this file sets. Faked:
 * `next/server`, `next/headers`, `next/link`, `next/navigation`, the
 * sentinels `firebase-admin/firestore` supplies, the session, the mail door
 * (nothing here sends), the Admin SDK handle (`tests/lib/applicationsStore.mjs`),
 * the form's stylesheet, and the two client components its screen hands
 * props to, each of which records what it was handed.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  userDoc,
} from "./lib/applicationsSmallTerm.mjs";
import { callsOf, firstCall, scanModule, walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const posix = (path) => path.split(sep).join("/");
const inSrc = (file) => posix(relative(SRC, file));

/** The answer, by any name code gives it: the field, its type, a helper named for it. */
const NAMES_THE_ANSWER = /suMembership/i;

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/**
 * WHERE THE ANSWER IS ITS OWNER'S, OR ONLY A SHAPE. The applicant's own form
 * and routes, and the three modules that say what an application is. None of
 * them builds anything for a reader of applications.
 */
const THE_APPLICANTS_OWN = [
  "lib/applications/applicant/",
  "features/applications/apply/",
  "lib/applications/model.ts",
  "lib/applications/normalise.ts",
  "lib/applications/validate.ts",
];

/**
 * EVERY OTHER FILE UNDER `src` THAT NAMES THE ANSWER, with what it does with
 * it. These four are the admin's decision-day page and nothing else. A fifth
 * is a new reader of the answer: decide whether the form's promise and the
 * privacy page still hold before adding it here.
 */
const THE_COMMITTEES_SIDE = {
  "lib/applications/decisionDay/views.ts": "the shape of what the decision-day page is sent: a person in one of its three groups carries the answer",
  "lib/applications/decisionDay/send.ts": "builds that page, and reads the answer in one expression, where a group's list of names is made",
  "lib/applications/decisionDay/boardWords.ts": "the words the page says the answer in",
  "features/applications/decisionDay/SendBoard.tsx": "draws those words under each name",
};

const modules = new Map();
const scan = (file) => {
  if (!modules.has(file)) modules.set(file, scanModule(file));
  return modules.get(file);
};
const sourceFiles = [...walkSource(SRC)];
const code = (file) => stripSource(scan(file).text);
const SEND = join(SRC, "lib", "applications", "decisionDay", "send.ts");

describe("the answer about SU membership is read in one place outside its owner's form", () => {
  const naming = sourceFiles
    .filter((file) => !inSrc(file).startsWith("content/legal/"))
    .filter((file) => NAMES_THE_ANSWER.test(scan(file).text))
    .map(inSrc);
  const theirs = (file) => THE_APPLICANTS_OWN.some((own) => file === own || file.startsWith(own));

  test("the walk found the form's own side, so the lists below are not empty by accident", () => {
    assert.ok(naming.filter(theirs).length >= 5, "the applicant's own files no longer name the answer: the pattern has stopped matching");
    for (const own of THE_APPLICANTS_OWN) {
      assert.ok(naming.some((file) => file === own || file.startsWith(own)), `${own} names the answer nowhere`);
    }
  });

  test("the list of files on the committee's side is the tree", () => {
    for (const [file, why] of Object.entries(THE_COMMITTEES_SIDE)) {
      assert.ok(typeof why === "string" && why.length > 20, `${file} is listed with no reason a reader can weigh`);
    }
    assert.deepEqual(
      naming.filter((file) => !theirs(file)).sort(),
      Object.keys(THE_COMMITTEES_SIDE).sort(),
      "a file outside the applicant's own form names the answer about SU membership and is not on the list, or one on the " +
        "list no longer does. The form tells applicants the answer will not affect their application, and the privacy page " +
        "says only admins are shown it.",
    );
  });

  test("the builder reads it once, where a group's names are listed, and nowhere in the send", () => {
    const send = scan(SEND);
    const holders = [...send.functions.values()].filter((fn) => NAMES_THE_ANSWER.test(stripSource(fn.body)));
    assert.deepEqual(holders.map((fn) => fn.name), ["groupOf"], "a function of the send's own module other than the one that lists a group's names reads the answer");
    assert.match(
      stripSource(send.functions.get("groupOf").body),
      /suMembership: applicationOf\(person\.uid\)\?\.sent\?\.suMembership \?\? null,/,
      "the answer listed beside a name is no longer the one on the application that person sent",
    );
    // Outside any function, the module names it nowhere: not in a type, not in a constant.
    assert.equal((code(SEND).match(/suMembership/gi) ?? []).length, 2, "the send's module names the answer somewhere else");
  });

  test("of everything the two decision-day screens are sent, only a person in a group of one of them carries it", () => {
    const views = code(join(SRC, "lib", "applications", "decisionDay", "views.ts"));
    assert.match(views, /export type SendGroupPerson = SendPerson & \{ suMembership: SuMembershipAnswer \| null \};/);
    assert.match(views, /export type SendGroup = \{\s*people: SendGroupPerson\[\];/);
    // The import of the answer's type, and the one field: nothing else in the
    // shapes of either screen names it. Pooled applicants has no such field.
    assert.equal((views.match(/suMembership/gi) ?? []).length, 3, "another shape the decision-day screens are sent names the answer");
    assert.equal((views.match(/\bSendGroupPerson\b/g) ?? []).length, 2, "the person who carries the answer is listed somewhere other than in a group");
  });

  test("a group's names are listed for the page alone", () => {
    const callers = callsOf(SEND, "groupOf").map((call) => call.inFunction);
    assert.ok(callers.length >= 3, "the page no longer lists its three groups through the one function");
    assert.deepEqual([...new Set(callers)], ["buildSendBoard"]);
    // It is not exported, so no other file can be handed what it makes.
    assert.equal(scan(SEND).functions.get("groupOf").exported, false);
  });

  test("the applications it reads are of the term as the viewer is shown it, which leaves their own out", () => {
    const build = stripSource(scan(SEND).functions.get("buildSendBoard").body);
    assert.match(build, /const applicationOf = \(uid: string\) => shownApplications\.get\(uid\) \?\? leftApplications\.get\(uid\);/);
    assert.equal(/wholeApplications/.test(build), false, "the page reads applications from the whole term, the viewer's own included");
  });

  test("the page is built only where an admin has been asked for, and everybody else has been answered first", () => {
    const calls = sourceFiles
      .filter((file) => scan(file).text.includes("buildSendBoard"))
      .flatMap((file) => callsOf(file, "buildSendBoard").map((call) => ({ file, ...call })));
    assert.deepEqual(
      calls.map((call) => `${inSrc(call.file)}#${call.inFunction}`).sort(),
      [
        "app/(app)/admin/admissions/forms/[roundId]/send/page.tsx#SendDecisionsPage",
        "app/api/admissions/forms/[roundId]/send/route.ts#GET",
        "app/api/admissions/forms/[roundId]/send/route.ts#POST",
      ],
      "the decision-day page is built somewhere new. It carries people's answers about SU membership, so whoever is sent it has to be an admin.",
    );
    for (const call of calls) {
      const where = `${inSrc(call.file)}#${call.inFunction}`;
      const body = stripSource(scan(call.file).functions.get(call.inFunction).body);
      const asked = firstCall(body, "canRunTerm");
      const built = firstCall(body, "buildSendBoard");
      assert.ok(asked !== -1 && asked < built, `${where} builds the page before it has asked whether the caller is an admin`);
      // Whoever is not an admin has been answered, and the function has left, before the page is built.
      assert.match(
        body.slice(asked, built),
        /^canRunTerm\(user\)\) (return NextResponse\.json\(\{ error: NOT_ADMIN \}, \{ status: 403 \}\);|\{\s*return \()/,
        `${where} does not answer and leave when the caller is not an admin`,
      );
      assert.match(body.slice(0, asked), /if \(!$/, `${where} asks for something other than "not an admin"`);
    }
  });

  test("an admin is an admin and nobody else", async () => {
    const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
    const access = await loadTs(join("lib", "applications", "access.ts"));
    for (const who of Object.values(CAST)) {
      assert.equal(access.canRunTerm(who), who.role === "admin", who.uid);
    }
    assert.equal(access.canRunTerm({ ...CAST.claudia, role: "Admin" }), false);
  });
});

// ---------------------------------------------------------------------------
// The handlers
// ---------------------------------------------------------------------------

process.env.NEXT_PUBLIC_APP_URL = "https://staging.example.com";
delete process.env.SMTP_FROM_NAME;
delete process.env.SMTP_HOST;
delete process.env.EMAIL_AUDIENCE;
mock.timers.enable({ apis: ["Date"], now: WHILE_DECIDING });

// A stand-in below cannot import a package, so the one function they draw
// with is handed to them here.
const world = { db: null, user: null, cookie: null, touched: [], handed: {}, createElement };
globalThis.__suAnswer = world;

/** A stylesheet: every class it is asked for is its own name. */
const STYLES = "export default new Proxy({}, { get: (_, name) => String(name) });";
/** A client component: it draws a mark and records what it was handed. */
const records = (name) =>
  `export default function ${name}(props) {\n` +
  `  globalThis.__suAnswer.handed.${name} = props;\n` +
  `  return globalThis.__suAnswer.createElement('div', { 'data-drawn': '${name}' });\n` +
  "}";

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
  [
    // The cookie jar of one request: the view-as marker is the one cookie in it.
    "next/headers",
    "export async function cookies() {\n" +
      "  const w = globalThis.__suAnswer;\n" +
      "  return {\n" +
      "    get: (name) => (w.cookie === null ? undefined : { name, value: w.cookie }),\n" +
      "    set: (name, value) => { w.cookie = value; },\n" +
      "    delete: () => { w.cookie = null; },\n" +
      "  };\n" +
      "}",
  ],
  [
    "next/link",
    "export default function Link({ href, children }) {\n" +
      "  return globalThis.__suAnswer.createElement('a', { href }, children);\n" +
      "}",
  ],
  [
    "next/navigation",
    "export function redirect(to) { throw new Error('redirect to ' + to); }\n" +
      "export function notFound() { throw new Error('not found'); }",
  ],
  ["firebase-admin/firestore", FIELD_VALUE_STUB],
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__suAnswer.db;\n}"],
  [
    "@/lib/firebase/session",
    "export async function getCurrentUser() {\n  return globalThis.__suAnswer.user;\n}\n" +
      "export async function getCurrentCollaborator() {\n  return null;\n}",
  ],
  // The view-as module's own import of the session, by the name it writes.
  ["./session", "export async function getCurrentUser() {\n  return globalThis.__suAnswer.user;\n}"],
  // The one mail door. Nothing in this file sends, and nothing could.
  ["@/lib/email/send", "export async function sendEmail() {\n  throw new Error('this suite sends nothing');\n}"],
  ["./form.module.css", STYLES],
  ["@/features/applications/kit/kit.module.css", STYLES],
  [
    "@/features/applications/kit/ApplicationsRoot",
    "export default function Box({ children }) {\n" +
      "  return globalThis.__suAnswer.createElement('div', null, children);\n" +
      "}",
  ],
  ["./ApplicationForm", records("ApplicationForm")],
  ["./JoinStep", records("JoinStep")],
]);
const { loadTs } = createLoader({ stubs: STUBS });
const FORMS = join("app", "api", "admissions", "forms", "[roundId]");
const sendRoute = await loadTs(join(FORMS, "send", "route.ts"));
const poolRoute = await loadTs(join(FORMS, "pool", "route.ts"));
const listRoute = await loadTs(join(FORMS, "programmes", "[programmeId]", "applications", "route.ts"));
const reviewRoute = await loadTs(join(FORMS, "applications", "[uid]", "route.ts"));
const ownRoute = await loadTs(join(FORMS, "application", "route.ts"));
const { renderApplicationForm } = await loadTs(join("features", "applications", "apply", "ApplyScreen.tsx"));
const { IMPERSONATION_BLOCKED_MESSAGE } = await loadTs(join("lib", "firebase", "impersonation.ts"));
const { VIEW_AS_NOTICE } = await loadTs(join("features", "applications", "viewAsNotice.ts"));
const words = await loadTs(join("lib", "applications", "decisionDay", "boardWords.ts"));

/** A second admin, who has not applied. */
const PRIYA = session("priya", "admin", false, "Priya Shah");
const PEOPLE = { ...CAST, priya: PRIYA };
const DECIDED = new Date("2026-10-19T09:00:00+01:00");

/** One sent application whose owner answered the form's question this way. */
const answered = (uid, ranked, suMembership, over = {}) => {
  const stored = applicationDoc(uid, ranked);
  const content = { ...stored.sent, suMembership };
  return { [applicationPath(uid)]: { ...stored, draft: content, sent: content, ...over } };
};
const decided = (decision, by) => ({
  decision,
  poolReason: null,
  couldSuitProgrammeId: null,
  decidedByUid: by,
  decidedAt: DECIDED,
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

/**
 * Five people, each with an answer, and an outcome chosen for each:
 *
 *   Amara  yes       accepted by AGI Strategy
 *   Wen    not yet   accepted by Technical AI Safety
 *   Zach   not yet   accepted by AGI Strategy (the admin, who has applied)
 *   Dev    not yet   pooled, and invited to the incubator
 *   Nina   nothing the form offers, which is read as no answer; pooled, no offer
 */
const TERM = {
  [`admissionRounds/${ROUND}`]: roundDoc({ applicationCounts: { draft: 0, submitted: 5 } }),
  [`users/${PRIYA.uid}`]: userDoc(PRIYA),
  ...answered("amara", [AGI, TAIS], "yes"),
  ...answered("wen", [TAIS, AGI], "not-yet"),
  ...answered("zach", [AGI], "not-yet"),
  ...answered("dev", [AGI], "not-yet"),
  ...answered("nina", [AGI], "perhaps"),
  ...decisions("amara", { [AGI]: decided("accept", "claudia") }),
  ...decisions("wen", { [TAIS]: decided("accept", "tess") }),
  ...decisions("zach", { [AGI]: decided("accept", "claudia") }),
  ...decisions("dev", { [AGI]: decided("pool", "claudia") }, { kind: "invite", programmeId: INCUBATOR }),
  ...decisions("nina", { [AGI]: decided("pool", "claudia") }, { kind: "no-offer" }),
};

function term(over = {}) {
  const db = makeDb(seedTerm({ over: { ...TERM, ...over } }), { now: WHILE_DECIDING });
  const collection = db.collection;
  db.collection = (name) => {
    world.touched.push(name);
    return collection(name);
  };
  world.db = db;
  world.touched = [];
  world.handed = {};
  return db;
}
/** Who the session says is signed in, and the view-as marker in the request's cookies, if any. */
function as(uid, marker = null) {
  world.user = uid === null ? null : PEOPLE[uid];
  world.cookie = marker === null ? null : JSON.stringify(marker);
  world.touched = [];
  world.handed = {};
}
/** An admin started a view-as session and is in it: the session is the member's. */
const VIEWING = { actorUid: "priya", actorName: "Priya Shah", actorEmail: "priya@example.com", auditId: "audit-1" };

const request = (query = "") => new Request(`http://naisi.invalid/api${query}`, { method: "GET" });
const params = (more = {}) => ({ params: Promise.resolve({ roundId: ROUND, ...more }) });
const getSend = () => sendRoute.GET(request(), params());
const getPool = () => poolRoute.GET(request(), params());
const getList = (programmeId) => listRoute.GET(request(), params({ programmeId }));
const getReview = (uid, programmeId) => reviewRoute.GET(request(`?programme=${programmeId}`), params({ uid }));
const getOwn = () => ownRoute.GET(request(), params());

/** Every property name anywhere inside a value, however deep. */
function keysIn(value, out = []) {
  if (Array.isArray(value)) value.forEach((entry) => keysIn(entry, out));
  else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, entry] of Object.entries(value)) {
      out.push(key);
      keysIn(entry, out);
    }
  }
  return out;
}
/** The keys of a payload that name the answer. Empty means it is not in it at all, null or otherwise. */
const answerKeysIn = (payload) => keysIn(payload).filter((key) => NAMES_THE_ANSWER.test(key));
const answersOf = (group) => group.people.map((person) => [person.uid, person.suMembership]);

describe("decision day shows an admin each person's answer", () => {
  test("under each name, in each of the three groups, as the person answered on the form", async () => {
    term();
    as("priya");
    const response = await getSend();
    assert.equal(response.status, 200);
    const { board } = response.body;
    assert.deepEqual(answersOf(board.accepted), [["amara", "yes"], ["wen", "not-yet"], ["zach", "not-yet"]]);
    assert.deepEqual(answersOf(board.invited), [["dev", "not-yet"]]);
    // Something stored that the form never offered is read as no answer, and the key is still there.
    assert.deepEqual(answersOf(board.noOffer), [["nina", null]]);
    for (const group of [board.accepted, board.invited, board.noOffer]) {
      for (const person of group.people) {
        assert.deepEqual(Object.keys(person).sort(), ["name", "suMembership", "uid"]);
      }
    }
  });

  test("it is beside a name in a group and nowhere else on the page", async () => {
    term();
    as("priya");
    const { board } = (await getSend()).body;
    const listed = board.accepted.people.length + board.invited.people.length + board.noOffer.people.length;
    assert.equal(listed, 5);
    assert.equal(answerKeysIn(board).length, listed, "the answer is carried somewhere other than beside each listed name");
    for (const part of [board.readiness, board.owed, board.accountsRefused, board.pending, board.declined]) {
      assert.deepEqual(answerKeysIn(part), []);
    }
    // The email previews are what a person is sent. None says anything about membership.
    for (const group of [board.accepted, board.invited, board.noOffer]) {
      assert.deepEqual(answerKeysIn(group.preview), []);
    }
  });

  test("an admin who has applied is shown everybody's but their own", async () => {
    term();
    as("zach");
    const { board } = (await getSend()).body;
    assert.deepEqual(answersOf(board.accepted), [["amara", "yes"], ["wen", "not-yet"]]);
    assert.deepEqual(answersOf(board.invited), [["dev", "not-yet"]]);
    assert.equal(answerKeysIn(board).length, 4);
  });

  test("somebody who has since given their place back is still listed with what they answered", async () => {
    // Wen was told on decision day and has said she cannot take the place.
    // The page is the record of what was sent, so she stays in her group.
    term(
      answered("wen", [TAIS, AGI], "not-yet", {
        status: "withdrawn",
        withdrawnAt: DECIDED,
        result: { kind: "accepted", programmeId: TAIS, publishedAt: DECIDED, email: "sent", emailedAt: DECIDED, emailClaimedAt: null },
        attendance: { answer: "cant-make-it", answeredAt: DECIDED },
      }),
    );
    as("priya");
    const { board } = (await getSend()).body;
    assert.deepEqual(
      answersOf(board.accepted).find(([uid]) => uid === "wen"),
      ["wen", "not-yet"],
      "somebody the send told, who has since left the term, lost their answer",
    );
  });

  test("the words say it as the person's own answer, in the form's two words for it", () => {
    assert.equal(words.suMembershipLabel("yes"), "SU membership: said yes");
    assert.equal(words.suMembershipLabel("not-yet"), "SU membership: said not yet");
    assert.equal(words.suMembershipLabel(null), "SU membership: no answer");
    // Whatever else it is handed is not an answer the form offers.
    for (const other of [undefined, "", "no", "perhaps", true]) {
      assert.equal(words.suMembershipLabel(other), "SU membership: no answer");
    }
    const screen = stripSource(scan(join(SRC, "features", "applications", "decisionDay", "SendBoard.tsx")).text);
    assert.match(screen, /\{suMembershipLabel\(person\.suMembership\)\}/);
    assert.equal((screen.match(/suMembership/gi) ?? []).length, 3, "the page names the answer somewhere other than the import and the line under a name");
  });
});

describe("nobody who is not an admin is sent the answer", () => {
  const NOT_ADMIN = "Only an admin can send decisions.";
  /** Each with a role on the form or none, and none of them an admin. */
  const OTHERS = ["claudia", "lloyd", "tess", "yusuf", "amara", "wen", "refused"];

  for (const who of OTHERS) {
    test(`${who} is refused the decision-day page before anything is read, and the refusal carries no such key`, async () => {
      term();
      as(who);
      const response = await getSend();
      assert.deepEqual([response.status, response.body], [403, { error: NOT_ADMIN }]);
      assert.deepEqual(answerKeysIn(response.body), []);
      assert.deepEqual(world.touched, [], "the refusal read something first");
    });
  }

  test("somebody who is not signed in is refused too", async () => {
    term();
    as(null);
    const response = await getSend();
    assert.equal(response.status, 401);
    assert.deepEqual(answerKeysIn(response.body), []);
    assert.deepEqual(world.touched, []);
  });

  test("a lead is sent their programme's list and each application on it, and the key is in neither", async () => {
    term();
    as("claudia");
    const list = await getList(AGI);
    assert.equal(list.status, 200);
    assert.ok(JSON.stringify(list.body).includes("Amara Okafor"), "the list is empty, so this test proves nothing");
    assert.deepEqual(answerKeysIn(list.body), [], "a lead's list of applications carries the answer about SU membership");
    for (const uid of ["amara", "dev", "wen", "nina"]) {
      const review = await getReview(uid, AGI);
      assert.equal(review.status, 200, `${uid}: ${JSON.stringify(review.body)}`);
      assert.deepEqual(answerKeysIn(review.body), [], `what a lead is sent of ${uid}'s application carries the answer about SU membership`);
    }
  });

  test("a reviewer is sent the same two things, and the key is in neither", async () => {
    term();
    as("lloyd");
    const list = await getList(AGI);
    assert.equal(list.status, 200);
    assert.ok(JSON.stringify(list.body).includes("Dev Patel"));
    assert.deepEqual(answerKeysIn(list.body), []);
    for (const uid of ["amara", "dev", "wen", "nina"]) {
      const review = await getReview(uid, AGI);
      assert.equal(review.status, 200, `${uid}: ${JSON.stringify(review.body)}`);
      assert.deepEqual(answerKeysIn(review.body), []);
    }
  });

  test("neither of them is sent pooled applicants at all", async () => {
    for (const who of ["claudia", "lloyd"]) {
      term();
      as(who);
      const response = await getPool();
      assert.equal(response.status, 403);
      assert.deepEqual(answerKeysIn(response.body), []);
    }
  });
});

describe("the one page is the only place, for an admin too", () => {
  test("pooled applicants, where an admin chooses what somebody hears, does not show it", async () => {
    term();
    as("priya");
    const response = await getPool();
    assert.equal(response.status, 200);
    assert.ok(response.body.board.rows.some((row) => row.uid === "dev"), "nobody is pooled, so this test proves nothing");
    assert.deepEqual(answerKeysIn(response.body), [], "the answer is beside a choice of outcome, which it must never bear on");
  });

  test("no review screen shows it, to an admin or to anybody", async () => {
    term();
    as("priya");
    for (const programmeId of [AGI, TAIS]) {
      const list = await getList(programmeId);
      assert.equal(list.status, 200);
      assert.deepEqual(answerKeysIn(list.body), []);
    }
    for (const [uid, programmeId] of [["amara", AGI], ["wen", TAIS], ["dev", AGI], ["nina", AGI]]) {
      const review = await getReview(uid, programmeId);
      assert.equal(review.status, 200, `${uid}: ${JSON.stringify(review.body)}`);
      assert.deepEqual(answerKeysIn(review.body), []);
    }
  });
});

describe("a view-as session is sent the answer by nothing", () => {
  test("decision day refuses a session borrowed from a member, and from a lead", async () => {
    for (const who of ["amara", "claudia"]) {
      term();
      as(who, VIEWING);
      const response = await getSend();
      assert.equal(response.status, 403, `an admin viewing as ${who} was sent the decision-day page`);
      assert.deepEqual(answerKeysIn(response.body), []);
      assert.deepEqual(world.touched, []);
    }
  });

  test("the member's own application, which holds their answer, is refused before it is read", async () => {
    term();
    as("amara");
    const hers = await getOwn();
    assert.equal(hers.status, 200);
    assert.equal(hers.body.application.sent.suMembership, "yes", "her own route no longer gives her answer back to her, so the next lines prove nothing");

    as("amara", VIEWING);
    const borrowed = await getOwn();
    assert.deepEqual([borrowed.status, borrowed.body], [403, { error: IMPERSONATION_BLOCKED_MESSAGE }]);
    assert.deepEqual(answerKeysIn(borrowed.body), []);
    assert.deepEqual(world.touched, [], "the refusal read something first");
  });

  test("their form draws the notice in place of the application, and no part of it is handed on", async () => {
    // A form whose window no test machine's clock is outside of.
    const open = { opensAt: new Date("2020-01-01T00:00:00Z"), closesAt: new Date("2099-01-01T00:00:00Z") };
    const props = { roundId: ROUND, step: null, fromJoinLink: false };
    term({ [`admissionRounds/${ROUND}`]: roundDoc({ ...open, applicationCounts: { draft: 0, submitted: 5 } }) });
    as("amara");
    const own = renderToStaticMarkup(await renderApplicationForm({ ...props, user: world.user, viewingAs: false }));
    assert.ok(own.includes('data-drawn="ApplicationForm"'));
    assert.equal(world.handed.ApplicationForm.application.draft.suMembership, "yes", "her own form is handed her own answer");

    as("amara", VIEWING);
    const borrowed = renderToStaticMarkup(await renderApplicationForm({ ...props, user: world.user, viewingAs: true }));
    assert.ok(borrowed.includes(VIEW_AS_NOTICE.title), "the notice's title is in the page");
    assert.ok(borrowed.includes(VIEW_AS_NOTICE.body), "and what it says");
    assert.equal(borrowed.includes("data-drawn"), false, "the form, or its first step, was drawn");
    assert.deepEqual(world.handed, {}, "something of the application was handed to a client component");
    assert.equal(world.touched.includes("admissionApplications"), false, "the application was read");
  });

  test("a marker left over from a session that has ended is not a session: the admin has their page", async () => {
    term();
    as("priya", { ...VIEWING, actorUid: "priya" });
    const response = await getSend();
    assert.equal(response.status, 200);
    assert.equal(answerKeysIn(response.body.board).length, 5);
  });
});
