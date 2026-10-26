/**
 * NOTHING THAT HANDLES AN ANONYMOUS ANSWER ASKS WHO SENT IT
 * (docs/surveys.md, "The anonymous form at a programme's end").
 *
 * WHY. The form's page and the privacy policy promise that the form never
 * records who answers, even when the person is signed in, and that nothing
 * kept with an answer says who they are. A promise like that is broken by
 * one line added later: a session read "to say hello", a cookie read for a
 * banner, a header logged while debugging, a uid beside the answers, the
 * database's own time on a record shown to a reader. So this guard WALKS THE
 * TREE, and fails on any of them:
 *
 *  1. THE DOORS. From each door an answer comes through, the form's page and
 *     its route, every import inside `src` is followed, and every file
 *     reached is read. None may read a session, a cookie or a request header,
 *     or call the view-as guard (it reads a cookie). The one exception is the
 *     client's address, read inside a rate limit's key in the route and
 *     nowhere else, by the one function that reads it (`clientIp` in
 *     `src/lib/rateLimit.ts`). The form's own files (`OWN_ROOTS`) also never
 *     name a uid, never reach a sign-in, and never log at all.
 *  2. THE RECORD. Every file that names the answers' collections is on a
 *     named list, checked both ways, with what it does. The two that write an
 *     answer write exactly `ANSWER_FIELDS`, by name. Nothing of the form reads
 *     the database's own time on a record.
 *  3. THE READERS. The readers' page reads the reader's own session through
 *     the admissions tree's gate and nothing else of the request.
 *  4. THE WALL. No file of the form reaches survey code, and survey code
 *     reaches nothing of the form's but its opening, its closing, its link and
 *     the card that shows the link.
 *  5. THE BROWSER. The form's request goes without the browser's cookies and
 *     without a referrer; the card's link and the page send no referrer; the
 *     page is kept out of search; nothing is kept in the browser.
 *  6. THE FRAME. The proxy does not match the page, and answers the route's
 *     path before it reads any cookie; the root layout reads no session.
 *
 * The scanner's own reading is exercised on synthetic snippets at the
 * bottom, so a pattern that has quietly stopped matching fails rather than
 * passes.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveImport, walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

/** A repository path, with forward slashes. */
const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
/** Code with its strings, comments gone. */
const codeOf = (source) => stripSource(source, { keepStrings: true });

// ---------------------------------------------------------------------------
// The form's files
// ---------------------------------------------------------------------------

/** The two doors an answer comes through. */
const DOORS = ["src/app/feedback/[token]/page.tsx", "src/app/api/feedback/route.ts"];

/** Every place the form's own code lives. A new one is added here in the change that makes it. */
const OWN_ROOTS = [
  "src/app/feedback",
  "src/app/api/feedback",
  "src/lib/anonymousFeedback",
  "src/features/anonymousFeedback",
  "src/lib/scheduler/jobs/anonymousFeedbackMove.ts",
];

/** The readers' page: it reads the reader's session, so it is held to its own rule (3). */
const READERS_PAGE = "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/anonymous-feedback/page.tsx";

function* filesUnder(path) {
  const full = join(REPO_ROOT, path);
  if (!existsSync(full)) return;
  if (statSync(full).isFile()) {
    yield full;
    return;
  }
  yield* walkSource(full);
}

const OWN_FILES = OWN_ROOTS.flatMap((root) => [...filesUnder(root)]).map(rel).sort();
const isOwn = (path) => OWN_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));

// ---------------------------------------------------------------------------
// The patterns
// ---------------------------------------------------------------------------

/** A session, the view-as marker, or a sign-in. */
const SESSION =
  /\b(?:getCurrentUser|getSessionUser|getSessionUid|requireApplicant|requireAdminPage|requireCourseAuthorPage|requireAdmissionsPage|requireMembershipPage|verifySessionCookie|verifyIdToken|assertNotImpersonating|getImpersonator|markerIsLive|useAuth|onAuthStateChanged|currentUser)\b|["']@\/lib\/firebase\/(?:session|impersonation)["']|["']@\/auth\/[^"']*["']|["']firebase\/auth["']/;
/** A cookie, read or named. */
const COOKIE = /\bcookies\s*\(|\.cookies\b|document\.cookie|["'`]cookie["'`]|__session\b|SESSION_COOKIE|__impersonator\b/i;
/** A request header, an address or a browser's name for itself. */
const HEADER =
  /["']next\/headers["']|\bheaders\s*\(\s*\)|\.headers\.get\s*\(|x-forwarded-for|x-real-ip|remoteAddress|user-agent|\buserAgent\b|\bipAddress\b|\.ip\b|\breferr?er\s*\(|["'`]referr?er["'`]/i;
/** The client's address: allowed only inside a rate limit's key. */
const CLIENT_IP = /clientIp\(/g;
const LIMIT_KEY = /rateLimit\(`[^`]*\$\{clientIp\(req\)\}[^`]*`/g;
/** A person's account id, or a sign-in module, in the form's own files. */
const UID = /\buid\b|\buids\b|["']firebase-admin\/auth["']|getAdminAuth\b/;
/** Anything that logs. */
const LOG = /\bconsole\s*\.|\blogger\b|\bctx\.log\s*\(|\blog\s*\(/;
/** The database's own time on a record. */
const RECORD_TIME = /\b(?:createTime|updateTime|readTime)\b/;

/**
 * What one reached file breaks, as sentences. `own` is a file of the form's
 * own; `door` is one of the two doors.
 */
export function breaches(path, source, { own = false, door = false } = {}) {
  const out = [];
  const code = codeOf(source);
  const session = SESSION.exec(code);
  if (session) out.push(`${path} reads a session or a sign-in: "${session[0]}"`);
  const cookie = COOKIE.exec(code);
  if (cookie) out.push(`${path} reads a cookie: "${cookie[0]}"`);
  // The one file allowed to read the client's address is the function that does it for the rate limit.
  if (path !== "src/lib/rateLimit.ts") {
    const header = HEADER.exec(code);
    if (header) out.push(`${path} reads a request header or an address: "${header[0]}"`);
  }
  const reads = (code.match(CLIENT_IP) ?? []).length;
  const limited = (code.match(LIMIT_KEY) ?? []).length;
  if (path !== "src/lib/rateLimit.ts" && reads !== limited) out.push(`${path} reads the client's address outside a rate limit's key`);
  if (own || door) {
    const uid = UID.exec(code);
    if (uid) out.push(`${path} names a person's account or a sign-in: "${uid[0]}"`);
    const log = LOG.exec(code);
    if (log) out.push(`${path} logs: "${log[0]}"`);
    const time = RECORD_TIME.exec(code);
    if (time) out.push(`${path} reads the database's own time on a record: "${time[0]}"`);
  }
  return out;
}

/** The specifiers a file imports, statically or not, and re-exports from. */
function importsOf(source) {
  const code = codeOf(source);
  const out = new Set();
  for (const match of code.matchAll(/\b(?:from|import)\s*\(?\s*"([^"]+)"/g)) out.add(match[1]);
  return [...out];
}

/** Every file inside `src` a door reaches through its imports, the door included. Stylesheets are not code. */
function reachedFrom(door) {
  const seen = new Set();
  const unresolved = [];
  const visit = (file) => {
    const path = rel(file);
    if (seen.has(path)) return;
    seen.add(path);
    for (const specifier of importsOf(readFileSync(file, "utf8"))) {
      if (/\.css$/.test(specifier)) continue;
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) continue;
      const target = resolveImport(file, specifier, SRC);
      if (!target) {
        unresolved.push(`${path} imports ${specifier}`);
        continue;
      }
      visit(target);
    }
  };
  visit(join(REPO_ROOT, door));
  return { files: [...seen].sort(), unresolved };
}

// ---------------------------------------------------------------------------
// 1. The doors
// ---------------------------------------------------------------------------

describe("1. nothing an answer passes through asks who sent it", () => {
  test("the walk found the form's code and both doors", () => {
    assert.ok(OWN_FILES.length >= 12, `only ${OWN_FILES.length} files of the form found: was the code moved?`);
    for (const root of [...OWN_ROOTS, ...DOORS, READERS_PAGE]) assert.ok(existsSync(join(REPO_ROOT, root)), `${root} is gone: take it out of this guard`);
  });

  for (const door of DOORS) {
    test(`everything ${door} reaches reads no session, cookie, header or address, and the form's own files name nobody and log nothing`, () => {
      const { files, unresolved } = reachedFrom(door);
      assert.deepEqual(unresolved, [], "an import this guard cannot follow is an import it cannot vouch for");
      assert.ok(files.length >= 5, `the walk from ${door} reached only ${files.length} files`);
      const found = files.flatMap((path) => breaches(path, read(path), { own: isOwn(path), door: DOORS.includes(path) }));
      assert.deepEqual(found, []);
    });
  }

  test("every file of the form's own, reached or not, names nobody, reads no request and logs nothing", () => {
    const found = OWN_FILES.flatMap((path) => breaches(path, read(path), { own: true, door: DOORS.includes(path) }));
    assert.deepEqual(found, []);
  });

  test("the route reads the client's address once, inside the per-address limit's key, and is limited per form too", () => {
    const route = codeOf(read("src/app/api/feedback/route.ts"));
    assert.equal((route.match(CLIENT_IP) ?? []).length, 1);
    assert.match(route, /rateLimit\(`feedback:answer:ip:\$\{clientIp\(req\)\}`, 30, 60_000\)/);
    assert.match(route, /rateLimit\(`feedback:answer:form:\$\{form\.id\}`, 200, 3_600_000\)/);
    // The limiter keeps its counts in a map in memory: it imports nothing that
    // could store or send what it counts, and drops a key when its window ends.
    const limiter = codeOf(read("src/lib/rateLimit.ts"));
    assert.deepEqual(importsOf(read("src/lib/rateLimit.ts")), ["server-only"], "the rate limiter now imports something that could keep what it counts");
    assert.ok(!/firebase|getAdminDb|fetch\(|console\./.test(limiter), "the rate limiter now stores, sends or logs what it counts");
    assert.match(limiter, /const buckets = new Map<string, Bucket>\(\);/);
  });
});

// ---------------------------------------------------------------------------
// 2. The record
// ---------------------------------------------------------------------------

/** Every file that names where the answers are kept, and why it may. */
const ANSWER_STORE = /\bANONYMOUS_(?:WAITING|ANSWERS)_COLLECTION\b|["'`]anonymousFeedback(?:Waiting)?["'`]/;
const ADDRESSES_ANSWERS = new Map([
  ["src/lib/anonymousFeedback/model.ts", "the records' own names and shapes, and the one place an answer's fields are named for writing"],
  ["src/lib/anonymousFeedback/answer.ts", "the one writer of an answer as it comes in, handed the form and the three answers and nothing of the request"],
  ["src/lib/anonymousFeedback/move.ts", "the night's move, which copies each answer's seven fields by name into the record kept"],
  ["src/lib/anonymousFeedback/readers.ts", "the readers' one reader, called by a page that has already decided the caller is the programme's lead or an admin"],
  ["src/lib/firestore/courseDeletion.ts", "a run's destroy, which takes the programme's anonymous form and every answer to it with the run"],
]);

describe("2. what is kept, and who addresses it", () => {
  test("only the files named here address the answers, and each says why", () => {
    const found = [...walkSource(SRC)].map(rel).filter((path) => ANSWER_STORE.test(codeOf(read(path)))).sort();
    for (const [path, why] of ADDRESSES_ANSWERS) assert.ok(why.length > 30, `${path} has no reason a reader can weigh`);
    assert.deepEqual(found.filter((path) => !ADDRESSES_ANSWERS.has(path)), [], "these files address the anonymous answers and are not on the list");
    assert.deepEqual([...ADDRESSES_ANSWERS.keys()].filter((path) => !found.includes(path)), [], "these files are listed and no longer address the answers");
  });

  test("an answer is written with exactly its seven fields, by name, in both places one is written", async () => {
    const fields = ["roundId", "programmeId", "runId", "keep", "change", "drop", "day"];
    const declared = /export const ANSWER_FIELDS = \[([^\]]*)\] as const;/.exec(codeOf(read("src/lib/anonymousFeedback/model.ts")));
    assert.ok(declared, "ANSWER_FIELDS moved");
    assert.deepEqual([...declared[1].matchAll(/"(\w+)"/g)].map((m) => m[1]), fields);
    const writer = codeOf(read("src/lib/anonymousFeedback/answer.ts"));
    const added = /\.add\(\{([\s\S]*?)\}\);/.exec(writer);
    assert.ok(added, "could not find where an answer is written as it comes in");
    assert.deepEqual([...added[1].matchAll(/^\s*(\w+)(?=[:,])/gm)].map((m) => m[1]), fields, "an answer as it comes in now keeps something else");
    assert.equal((writer.match(/\.(?:add|set|create|update)\(/g) ?? []).length, 1, "the writer now writes more than the one answer");
    const move = codeOf(read("src/lib/anonymousFeedback/move.ts"));
    const created = /tx\.create\([^,]+,\s*\{([\s\S]*?)\}\);/.exec(move);
    assert.ok(created, "could not find where the move writes an answer");
    assert.deepEqual([...created[1].matchAll(/^\s*(\w+)(?=[:,])/gm)].map((m) => m[1]), fields, "the move now copies something else");
    assert.ok(!/\.\.\./.test(created[1]), "the move copies a record whole");
  });

  test("the answers are deny-all to every browser: no client code names them", () => {
    const clientFiles = [...walkSource(SRC)].map(rel).filter((path) => /^\s*["']use client["']/m.test(read(path)));
    assert.ok(clientFiles.length > 20);
    assert.deepEqual(clientFiles.filter((path) => ANSWER_STORE.test(codeOf(read(path)))), []);
  });
});

// ---------------------------------------------------------------------------
// 3. The readers
// ---------------------------------------------------------------------------

describe("3. the readers' page reads the reader, and nothing else of the request", () => {
  test("its one session read is the admissions tree's gate, before the form's own decision, and it reads no cookie or header", () => {
    const page = codeOf(read(READERS_PAGE));
    assert.equal((page.match(/\b(?:getCurrentUser|getSessionUser|requireAdmissionsPage|requireAdminPage)\b/g) ?? []).length, 2, "the import and the one call");
    assert.match(page, /const \[\{ roundId, programmeId \}, user\] = await Promise\.all\(\[params, requireAdmissionsPage\(\)\]\);/);
    const gate = page.indexOf("loadProgrammeRun(db, user, roundId, programmeId)");
    const readers = page.indexOf("readAnonymousAnswers(");
    assert.ok(gate !== -1 && readers !== -1 && gate < readers, "the answers are read before the page decides who is reading");
    assert.ok(!COOKIE.test(page) && !HEADER.test(page), "the readers' page reads a cookie or a header");
    assert.ok(!/\.(?:set|update|add|create|delete)\(|runTransaction\(|\.batch\(\)/.test(page), "the readers' page writes");
  });

  test("what the readers are handed holds no day, time or id of any answer", () => {
    const readers = codeOf(read("src/lib/anonymousFeedback/readers.ts"));
    const view = /export type AnonymousAnswersView = \{([\s\S]*?)\};/.exec(readers);
    assert.ok(view, "the readers' view moved");
    assert.deepEqual([...view[1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]), ["count", "questions", "form"]);
    const question = /export type ReaderQuestion = \{([^}]*)\};/.exec(readers);
    assert.deepEqual([...question[1].matchAll(/(\w+):/g)].map((m) => m[1]), ["key", "heading", "answers"]);
    assert.match(readers, /answer\.day < today/, "the readers see an answer the day it came in");
    assert.match(readers, /answersInOrder\(answers, key\)/);
    const model = codeOf(read("src/lib/anonymousFeedback/model.ts"));
    assert.match(model, /\.sort\(\(a, b\) => collator\.compare\(a, b\)/, "each question's answers are no longer in an order of their own words");
  });
});

// ---------------------------------------------------------------------------
// 4. The wall between the form and the surveys
// ---------------------------------------------------------------------------

/** Survey code, imported from anywhere: the same reading the privacy policy's test uses. */
const SURVEY_CODE = /(?:\bfrom\s*|\bimport\s*\(\s*)"(?:@\/(?:lib\/surveys|features\/surveys|lib\/firestore\/surveys)|(?:\.{1,2}\/)+(?:[\w-]+\/)*surveys)["/]/;
const SURVEY_ROOTS = [
  "src/app/api/surveys",
  "src/app/survey",
  "src/app/(app)/learn/[runId]/survey",
  "src/app/(app)/admin/(admin-only)/surveys",
  "src/features/surveys",
  "src/lib/surveys",
  "src/lib/firestore/surveys.ts",
  "src/lib/scheduler/jobs/surveyNamesOff.ts",
];
/** What survey code may take from the form: its opening, its closing, its link and the card. Nothing that reads an answer. */
const SURVEY_MAY_TAKE = new Map([
  ["@/lib/anonymousFeedback/forms", ["openAnonymousForm", "closeAnonymousForm", "anonymousFormLinkFor"]],
  ["@/features/anonymousFeedback/AfterTheSurvey", ["AnonymousFormLink", "AnonymousFormCard"]],
]);

describe("4. the form is not a survey: a wall both ways", () => {
  test("no file of the form, and not the readers' page, reaches survey code", () => {
    const reaching = [...OWN_FILES, READERS_PAGE].filter((path) => SURVEY_CODE.test(read(path)));
    assert.deepEqual(reaching, [], "the anonymous form now reads survey code, where answers carry names");
  });

  test("survey code takes from the form only its opening, closing, link and card", () => {
    const files = SURVEY_ROOTS.flatMap((root) => [...filesUnder(root)]).map(rel);
    assert.ok(files.length >= 30, `only ${files.length} survey files found`);
    const taken = [];
    for (const path of files) {
      const code = codeOf(read(path));
      for (const match of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"(@\/(?:lib|features)\/anonymousFeedback\/[^"]+)"/g)) {
        const allowed = SURVEY_MAY_TAKE.get(match[2]);
        for (const name of match[1].split(",").map((part) => part.trim()).filter(Boolean)) {
          if (!allowed || !allowed.includes(name)) taken.push(`${path} takes ${name} from ${match[2]}`);
        }
      }
      if (/["']@\/(?:lib|features)\/anonymousFeedback\/[^"']+["']/.test(code.replace(/import\s+(?:type\s+)?\{[^}]*\}\s+from\s+"@\/(?:lib|features)\/anonymousFeedback\/[^"]+"/g, ""))) {
        taken.push(`${path} reaches the form some other way`);
      }
      if (ANSWER_STORE.test(code)) taken.push(`${path} addresses the anonymous answers`);
    }
    assert.deepEqual(taken, []);
    // And the three it does take are used where this guard says.
    assert.match(read("src/lib/surveys/sending.ts"), /if \(survey\.kind === "after" && survey\.closesAt\) \{\s*await openAnonymousForm\(/);
    assert.match(read("src/app/api/surveys/[surveyId]/close/route.ts"), /await closeAnonymousForm\(db, surveyId\);/);
  });
});

// ---------------------------------------------------------------------------
// 5. The browser
// ---------------------------------------------------------------------------

describe("5. the browser sends nothing of the person, and keeps nothing", () => {
  test("the answers go without cookies or a referrer, and nothing is kept in the browser", () => {
    const form = codeOf(read("src/features/anonymousFeedback/AnonymousForm.tsx"));
    const request = /await fetch\("\/api\/feedback", \{([\s\S]*?)\}\);/.exec(form);
    assert.ok(request, "could not find the form's request");
    assert.match(request[1], /credentials: "omit",/);
    assert.match(request[1], /referrerPolicy: "no-referrer",/);
    assert.match(request[1], /body: JSON\.stringify\(\{ token, keep: answer\("keep"\), change: answer\("change"\), drop: answer\("drop"\) \}\),/);
    for (const path of OWN_FILES) {
      assert.ok(!/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(codeOf(read(path))), `${path} keeps something in the browser`);
    }
  });

  test("the card's link and the form's address send no referrer, and the page is kept out of search", () => {
    assert.match(codeOf(read("src/features/anonymousFeedback/AfterTheSurvey.tsx")), /<a href=\{href\} rel="noreferrer"/);
    const page = codeOf(read("src/app/feedback/[token]/page.tsx"));
    assert.match(page, /robots: \{ index: false, follow: false \},/);
    assert.match(page, /referrer: "no-referrer",/);
    assert.match(page, /export const dynamic = "force-dynamic";/);
    // The address is the form's secret and nothing else: no query, nothing of a person.
    assert.match(codeOf(read("src/lib/anonymousFeedback/forms.ts")), /return `\/feedback\/\$\{form\.token\}`;/);
  });
});

// ---------------------------------------------------------------------------
// 6. The frame
// ---------------------------------------------------------------------------

describe("6. the frame around the doors reads no session", () => {
  test("the proxy does not match the form's page, and answers the route's path before it reads a cookie", () => {
    const proxy = codeOf(read("src/proxy.ts"));
    const matcher = /matcher:\s*\[([^\]]*)\]/.exec(proxy);
    assert.ok(matcher, "the proxy's matcher moved");
    assert.ok(!/feedback/.test(matcher[1]) && !/["']\/:path\*["']|["']\/\(\.\*\)["']/.test(matcher[1]), "the proxy now runs on the form's page");
    const prefixes = /const PROTECTED_PREFIXES = \[([^\]]*)\]/.exec(proxy);
    assert.ok(prefixes && !/feedback/.test(prefixes[1]));
    const api = proxy.indexOf('if (pathname.startsWith("/api/")) {');
    const apiReturn = proxy.indexOf("return NextResponse.next();", api);
    const cookie = proxy.indexOf("request.cookies");
    assert.ok(api !== -1 && apiReturn !== -1 && cookie !== -1 && api < apiReturn && apiReturn < cookie, "the proxy reads a cookie before it lets an API request through");
  });

  test("the root layout, the page's only frame, reads no session, cookie or header on the server", () => {
    // Its AuthProvider is a client component: it keeps the browser's own
    // sign-in for the rest of the site, in the browser, and the form's request
    // goes without the cookies it sets (5).
    const layout = codeOf(read("src/app/layout.tsx"));
    assert.ok(!/\bcookies\s*\(|\bheaders\s*\(\s*\)|getCurrentUser|getSessionUser|["']next\/headers["']/.test(layout), "the root layout now reads the request");
    assert.match(read("src/auth/AuthProvider.tsx"), /^\s*["']use client["'];/m, "the sign-in provider in the root layout now runs on the server");
    assert.ok(!existsSync(join(SRC, "app", "feedback", "layout.tsx")) && !existsSync(join(SRC, "app", "feedback", "[token]", "layout.tsx")), "the form's page has a layout of its own, which this guard does not read");
  });
});

// ---------------------------------------------------------------------------
// The scanner reads what it says it reads
// ---------------------------------------------------------------------------

describe("the scanner reads what it says it reads", () => {
  const ok = (source, path = "src/lib/anonymousFeedback/x.ts", flags = { own: true }) => assert.deepEqual(breaches(path, source, flags), [], source);
  const bad = (source, path = "src/lib/anonymousFeedback/x.ts", flags = { own: true }) => assert.ok(breaches(path, source, flags).length > 0, source);

  test("a session, the view-as guard or a sign-in is caught", () => {
    bad("const user = await getCurrentUser();");
    bad("const blocked = await assertNotImpersonating();");
    bad('import { getSessionUser } from "@/features/courses/runAccess";');
    bad('import { getCurrentUser } from "@/lib/firebase/session";');
    bad("const { user } = useAuth();");
    bad('import { getAuth } from "firebase/auth";');
  });

  test("a cookie, read or named, is caught", () => {
    bad('import { cookies } from "next/headers";\nconst jar = await cookies();');
    bad('const raw = req.headers.get("cookie");');
    bad("const value = request.cookies.get(SESSION_COOKIE);");
    bad("document.cookie;");
  });

  test("a header or an address is caught, and the address inside a rate limit's key is the one thing allowed", () => {
    bad('const agent = req.headers.get("user-agent");');
    bad("const ip = clientIp(req);");
    bad("await ref.add({ ip: clientIp(req) });");
    bad("const caller = req.ip;");
    bad('const from = headers().get("referer");');
    ok("const limit = rateLimit(`feedback:answer:ip:${clientIp(req)}`, 30, 60_000);");
  });

  test("in the form's own files, a uid, a log line or the database's own time is caught; elsewhere a log of its own is not", () => {
    bad("const who = person.uid;");
    bad("console.error('[feedback] failed', err);");
    bad("const at = snap.createTime;");
    bad('import { getAuth } from "firebase-admin/auth";');
    ok("console.error('[firebase-admin] initialization failed:', err);", "src/lib/firebase/admin.ts", { own: false });
  });

  test("a word in a comment is not a breach", () => {
    ok("// Never getCurrentUser(), never cookies(), never a uid or a console.log.\nconst a = 1;");
  });

  test("an import the walk cannot follow is reported, not skipped", () => {
    const { unresolved } = reachedFrom("src/app/api/feedback/route.ts");
    assert.deepEqual(unresolved, []);
    assert.ok(reachedFrom("src/app/api/feedback/route.ts").files.includes("src/lib/rateLimit.ts"), "the walk no longer follows the route's imports");
  });
});
