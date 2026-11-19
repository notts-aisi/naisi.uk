/**
 * NOTHING ABOUT WHO SENT ANONYMOUS FEEDBACK IS KEPT
 * (docs/surveys.md, "Anonymous feedback for the whole society").
 *
 * WHY. The form and the privacy policy say "We don't keep who sent it, even
 * when you're signed in", and that admins read entries from the next day in
 * no particular order. The form is for members only, so its route MUST read
 * the session, once, for a yes or a no; one line added later (the uid kept
 * "to stop duplicates", a log line while debugging, the waiting record shown
 * to an admin because it is "the same data") would break the promise without
 * failing anything else. So this guard WALKS THE FORM'S FILES and fails on
 * any of them:
 *
 *  1. THE ROUTE. The send route reads the session exactly once, through
 *     `getCurrentUser`, and the name it holds the answer in is used on the
 *     two lines that refuse and nowhere else; it reads no cookie or header
 *     itself, and the client's address only inside a rate limit's key.
 *  2. THE RECORD. The two places an entry is written, as it comes in and as
 *     the night's move keeps it, write exactly `ENTRY_FIELDS`, by name, and
 *     are handed nothing of the request.
 *  3. THE WAITING PLACE. Only the model, the writer and the move name it:
 *     nothing that shows an entry to anybody reads the record that still
 *     carries the database's own time of writing.
 *  4. WHO ADDRESSES THE ENTRIES at all is a named list, checked both ways,
 *     with what each does; no browser code names them.
 *  5. NOTHING LOGS, and the form's page reads nothing of its reader.
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
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
/** Code with its comments gone and its strings kept. */
const codeOf = (source) => stripSource(source, { keepStrings: true });

const SEND_ROUTE = "src/app/api/anonymous-feedback/route.ts";
const FORM_PAGE = "src/app/(app)/anonymous-feedback/page.tsx";
const ADMIN_PAGE = "src/app/(app)/admin/(admin-only)/surveys/anonymous-feedback/page.tsx";

/** Every place the form's own code lives. A new one is added here in the change that makes it. */
const OWN_ROOTS = [
  "src/lib/societyFeedback",
  "src/features/societyFeedback",
  "src/app/api/anonymous-feedback",
  "src/app/api/admin/anonymous-feedback",
  "src/app/(app)/anonymous-feedback",
  ADMIN_PAGE,
];

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

// ---------------------------------------------------------------------------
// The patterns
// ---------------------------------------------------------------------------

/** Anything that logs. */
const LOG = /\bconsole\s*\.|\blogger\b|\bctx\.log\s*\(/;
/** A cookie, read or named. */
const COOKIE = /\bcookies\s*\(|\.cookies\b|document\.cookie|__session\b|SESSION_COOKIE/;
/** A request header, an address or a browser's name for itself. */
const HEADER = /["']next\/headers["']|\bheaders\s*\(\s*\)|\.headers\.get\s*\(|x-forwarded-for|x-real-ip|remoteAddress|user-agent|\buserAgent\b/i;
/** A session read: a call, not an import. */
const SESSION = /\b(?:getCurrentUser|getSessionUser|getSessionUid|verifySessionCookie|verifyIdToken|useAuth)\s*\(/g;
/** The database's own time on a record. */
const RECORD_TIME = /\b(?:createTime|updateTime|readTime)\b/;
/** Kept in the browser. */
const BROWSER_STORE = /\b(?:localStorage|sessionStorage|indexedDB)\b/;
/** The client's address, and the one place it may be read. */
const CLIENT_IP = /clientIp\(/g;
const LIMIT_KEY = /rateLimit\(`[^`]*\$\{clientIp\(req\)\}[^`]*`/g;

/** What one file of the form's own breaks, as sentences. */
export function breaches(path, source) {
  const out = [];
  const code = codeOf(source);
  const log = LOG.exec(code);
  if (log) out.push(`${path} logs: "${log[0]}"`);
  const cookie = COOKIE.exec(code);
  if (cookie) out.push(`${path} reads a cookie: "${cookie[0]}"`);
  const header = HEADER.exec(code);
  if (header) out.push(`${path} reads a request header or an address: "${header[0]}"`);
  const time = RECORD_TIME.exec(code);
  if (time) out.push(`${path} reads the database's own time on a record: "${time[0]}"`);
  const store = BROWSER_STORE.exec(code);
  if (store) out.push(`${path} keeps something in the browser: "${store[0]}"`);
  if ((code.match(CLIENT_IP) ?? []).length !== (code.match(LIMIT_KEY) ?? []).length) out.push(`${path} reads the client's address outside a rate limit's key`);
  return out;
}

// ---------------------------------------------------------------------------
// 1. The route, and the files of the form
// ---------------------------------------------------------------------------

describe("1. the form's files log nothing and read nothing of the request but what they must", () => {
  test("the walk found the form's code", () => {
    assert.ok(OWN_FILES.length >= 14, `only ${OWN_FILES.length} files of the form found: was the code moved?`);
    for (const path of [SEND_ROUTE, FORM_PAGE, ADMIN_PAGE]) assert.ok(existsSync(join(REPO_ROOT, path)), `${path} is gone: take it out of this guard`);
  });

  test("no file of the form logs, reads a cookie or a header, reads the database's own time, or keeps anything in the browser", () => {
    assert.deepEqual(OWN_FILES.flatMap((path) => breaches(path, read(path))), []);
  });

  test("the send route reads the session once, and holds the answer on the two lines that refuse and nowhere else", () => {
    const route = codeOf(read(SEND_ROUTE));
    assert.equal((route.match(SESSION) ?? []).length, 1, "the send route reads the session more than once, or not at all");
    assert.match(route, /const user = await getCurrentUser\(\);/);
    const uses = [...route.matchAll(/\buser\b/g)].length;
    assert.equal(uses, 3, "the session's answer is used beyond `const user`, `if (!user)` and `user.role`");
    assert.match(route, /if \(!user\) return NextResponse\.json\(/);
    assert.match(route, /if \(!isMemberRole\(user\.role\)\) return NextResponse\.json\(/);
    assert.ok(!/\buid\b|\.email\b|displayName/.test(route), "the send route names the sender's account");
    // Its answer is a yes, never an id.
    assert.match(route, /return NextResponse\.json\(\{ ok: true \}\);\s*\}\s*$/);
    // The two limits, in memory.
    assert.match(route, /rateLimit\(`society-feedback:ip:\$\{clientIp\(req\)\}`, 30, 60_000\)/);
    assert.match(route, /rateLimit\("society-feedback:all", 300, 3_600_000\)/);
  });

  test("the form's page and its form read nothing of the reader: no session, no cookie, no header", () => {
    for (const path of [FORM_PAGE, "src/features/societyFeedback/SocietyFeedbackForm.tsx", "src/lib/societyFeedback/programmes.ts"]) {
      assert.equal((codeOf(read(path)).match(SESSION) ?? []).length, 0, `${path} reads a session`);
    }
    const form = codeOf(read("src/features/societyFeedback/SocietyFeedbackForm.tsx"));
    assert.match(form, /referrerPolicy: "no-referrer"/, "the request says which page it came from");
    assert.match(form, /cache: "no-store"/);
  });
});

// ---------------------------------------------------------------------------
// 2. The record
// ---------------------------------------------------------------------------

const FIELDS = ["words", "day", "roundId", "programmeId", "programmeName", "week", "about"];
const namesIn = (block) => [...block.matchAll(/^\s*(\w+)(?=[:,])/gm)].map((m) => m[1]);

describe("2. an entry is written with exactly its seven fields, by name, in both places one is written", () => {
  test("ENTRY_FIELDS is the seven, and the writer and the move write those and no others", () => {
    const declared = /export const ENTRY_FIELDS = \[([^\]]*)\] as const;/.exec(codeOf(read("src/lib/societyFeedback/model.ts")));
    assert.ok(declared, "ENTRY_FIELDS moved");
    assert.deepEqual([...declared[1].matchAll(/"(\w+)"/g)].map((m) => m[1]), FIELDS);

    const writer = codeOf(read("src/lib/societyFeedback/send.ts"));
    const added = /\.add\(\{([\s\S]*?)\}\);/.exec(writer);
    assert.ok(added, "could not find where an entry is written as it comes in");
    assert.deepEqual(namesIn(added[1]), FIELDS, "an entry as it comes in now keeps something else");
    assert.equal((writer.match(/\.(?:add|set|create|update)\(/g) ?? []).length, 1, "the writer writes more than the one entry");
    assert.match(writer, /export async function keepSocietyFeedback\(db: Firestore, sent: SentFeedback, programme: NamedProgramme \| null, now: Date\)/, "the writer is now handed something else");

    const move = codeOf(read("src/lib/societyFeedback/move.ts"));
    const created = /tx\.create\([^,]+,\s*\{([\s\S]*?)\}\);/.exec(move);
    assert.ok(created, "could not find where the move writes an entry");
    assert.deepEqual(namesIn(created[1]), FIELDS, "the move now copies something else");
    assert.ok(!/\.\.\./.test(created[1]), "the move copies a record whole");
    assert.equal((move.match(/tx\.(?:create|set|update)\(/g) ?? []).length, 1, "the move writes something besides the kept entry");
  });

  test("nothing of the sender reaches the writer: the route hands it what was sent, the programme and the time", () => {
    const route = codeOf(read(SEND_ROUTE));
    assert.match(route, /await keepSocietyFeedback\(db, read\.sent, programme, new Date\(\)\);/);
  });
});

// ---------------------------------------------------------------------------
// 3 and 4. Who addresses the entries
// ---------------------------------------------------------------------------

const WAITING = /\bSOCIETY_WAITING_COLLECTION\b|["'`]societyFeedbackWaiting["'`]/;
const ANY_ENTRY = /\bSOCIETY_(?:WAITING|KEPT)_COLLECTION\b|["'`]societyFeedback(?:Waiting)?["'`]/;

const ADDRESSES_WAITING = new Map([
  ["src/lib/societyFeedback/model.ts", "the collections' own names"],
  ["src/lib/societyFeedback/send.ts", "the one writer of an entry as it comes in"],
  ["src/lib/societyFeedback/move.ts", "the night's move, which takes a finished day's entries out of it"],
]);
const ADDRESSES_ENTRIES = new Map([
  ...ADDRESSES_WAITING,
  ["src/lib/societyFeedback/admin.ts", "the admins' read of the kept entries, their two marks, the clear-out by hand and the download, called only once the caller is an admin"],
]);

describe("3. nothing that shows an entry reads the waiting place", () => {
  test("only the model, the writer and the move name it", () => {
    const found = [...walkSource(SRC)].map(rel).filter((path) => WAITING.test(codeOf(read(path)))).sort();
    assert.deepEqual(found, [...ADDRESSES_WAITING.keys()].sort());
  });
});

describe("4. only the files named here address the entries, and no browser code does", () => {
  test("the list, both ways, each with its reason", () => {
    const found = [...walkSource(SRC)].map(rel).filter((path) => ANY_ENTRY.test(codeOf(read(path)))).sort();
    for (const [path, why] of ADDRESSES_ENTRIES) assert.ok(why.length > 20, `${path} has no reason a reader can weigh`);
    assert.deepEqual(found.filter((path) => !ADDRESSES_ENTRIES.has(path)), [], "these files address the entries and are not on the list");
    assert.deepEqual([...ADDRESSES_ENTRIES.keys()].filter((path) => !found.includes(path)), [], "these files are listed and no longer address the entries");
  });

  test("no client file names them", () => {
    const clientFiles = [...walkSource(SRC)].map(rel).filter((path) => /^\s*["']use client["']/m.test(read(path)));
    assert.ok(clientFiles.length > 20);
    assert.deepEqual(clientFiles.filter((path) => ANY_ENTRY.test(codeOf(read(path)))), []);
  });

  test("the admins' routes and page ask for an admin before anything is read", () => {
    for (const path of [
      "src/app/api/admin/anonymous-feedback/[entryId]/route.ts",
      "src/app/api/admin/anonymous-feedback/clear/route.ts",
      "src/app/api/admin/anonymous-feedback/download/route.ts",
    ]) {
      const code = codeOf(read(path));
      const handlers = code.split(/export async function (?=GET|POST)/).slice(1);
      assert.ok(handlers.length >= 1, path);
      for (const handler of handlers) {
        const gate = handler.indexOf('user.role !== "admin"');
        const db = handler.indexOf("getAdminDb()");
        assert.ok(gate !== -1 && gate < db, `${path}: a handler reads before it asks for an admin`);
      }
    }
    const page = codeOf(read(ADMIN_PAGE));
    assert.ok(page.indexOf('viewer.role !== "admin"') < page.indexOf("getAdminDb()"));
  });
});

// ---------------------------------------------------------------------------
// The scanner reads what it says it reads
// ---------------------------------------------------------------------------

describe("the scanner reads what it says it reads", () => {
  test("a log, a cookie, a header, the database's time and the browser's storage are each caught", () => {
    const one = (snippet) => breaches("x.ts", snippet);
    assert.equal(one("console.log(body);").length, 1);
    assert.equal(one("const c = await cookies();").length, 1);
    assert.equal(one('req.headers.get("user-agent");').length, 1);
    assert.equal(one("const t = snap.createTime;").length, 1);
    assert.equal(one('localStorage.setItem("draft", words);').length, 1);
  });

  test("the address inside a rate limit's key is allowed, and nowhere else", () => {
    assert.deepEqual(breaches("x.ts", "rateLimit(`k:${clientIp(req)}`, 1, 1);"), []);
    assert.equal(breaches("x.ts", "const ip = clientIp(req);").length, 1);
  });

  test("a word in a comment is not a breach", () => {
    assert.deepEqual(breaches("x.ts", "// console.log is never used here\nconst a = 1;"), []);
  });
});
