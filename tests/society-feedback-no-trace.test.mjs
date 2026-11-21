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
import { resolveImport, walkSource } from "./lib/functionScan.mjs";
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

/** Anything that logs, the process's own streams included. */
const LOG = /\bconsole\s*\.|\blogger\b|\bctx\.log\s*\(|\bprocess\s*\.\s*(?:stdout|stderr)\b/;
/** A throw: allowed only as an error built from a plain string, never from what was sent. */
const THROW = /\bthrow\b/g;
const PLAIN_THROW = /^throw new \w*Error\(\s*"[^"]*"\s*\);/;
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
  // A thrown error is logged by the server: only one built from a plain string may be thrown.
  for (const match of code.matchAll(THROW)) {
    const rest = code.slice(match.index);
    if (!PLAIN_THROW.test(rest)) out.push(`${path} throws something other than a plain sentence: "${rest.slice(0, 60)}"`);
  }
  return out;
}

/** A session, the view-as marker, a sign-in or a cookie: anything that can say who is calling. Type imports are not reads. */
const SESSION_ANY =
  /["']@\/lib\/firebase\/(?:session|impersonation)["']|["']@\/auth\/[^"']*["']|["']firebase\/auth["']|["']firebase-admin\/auth["']|\b(?:getCurrentUser|getSessionUser|getSessionUid|verifySessionCookie|verifyIdToken|useAuth|onAuthStateChanged|getImpersonator|assertNotImpersonating|markerIsLive|getAdminAuth)\b|\bcookies\s*\(/;
const withoutTypeImports = (code) => code.replace(/import\s+type\s+[^;]*;/g, "");
/** Whether a file can say who is calling. */
export const readsSession = (source) => SESSION_ANY.test(withoutTypeImports(codeOf(source)));

/** The database, touched at all. */
const DATABASE = /\.collection\(|\bgetAdminDb\b|["']firebase-admin\/firestore["']|\bFirestore\b|\brunTransaction\(|\.batch\(\)/;
/** A write, in a file that touches the database. */
const WRITE = /\.(?:add|set|update|create|delete)\(|\brunTransaction\(|\.batch\(\)|\.commit\(/;
/** Whether a file can write to the database. */
export const writesDatabase = (source) => {
  const code = codeOf(source);
  return DATABASE.test(code) && WRITE.test(code);
};

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
    // The three limits, in memory.
    assert.match(route, /rateLimit\(`society-feedback:ip:\$\{clientIp\(req\)\}`, 30, 60_000\)/);
    assert.match(route, /rateLimit\(`society-feedback:ip-hour:\$\{clientIp\(req\)\}`, 30, 3_600_000\)/);
    assert.match(route, /rateLimit\("society-feedback:all", 300, 3_600_000\)/);
    // The session is read, and a caller who may not send refused, before any limit is counted.
    const refusedAt = route.indexOf("if (!isMemberRole(user.role)) return");
    assert.ok(refusedAt > 0 && refusedAt < route.indexOf("rateLimit("), "a limit is counted before the session is read");
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
// 1b. Allow-lists: who may read a session, who may write
// ---------------------------------------------------------------------------

/**
 * The files of the form that may read who is calling, each with why. The form's
 * own page is NOT here: it reads nothing about its reader.
 */
const SESSION_READERS = new Map([
  [SEND_ROUTE, "refuses a view-as session, then asks once whether the caller is an approved account, and uses the answer on the two lines that refuse"],
  ["src/app/api/admin/anonymous-feedback/[entryId]/route.ts", "an admin's alone, and records which admin marked or noted the entry"],
  ["src/app/api/admin/anonymous-feedback/clear/route.ts", "an admin's alone"],
  ["src/app/api/admin/anonymous-feedback/download/route.ts", "an admin's alone"],
  [ADMIN_PAGE, "asks for an admin again before anything is read"],
]);

/** The files of the form that may write to the database, each with what it writes. */
const DATABASE_WRITERS = new Map([
  ["src/lib/societyFeedback/send.ts", "the one entry as it comes in, its seven fields"],
  ["src/lib/societyFeedback/move.ts", "the night's move: the kept entry, its seven fields, and the waiting copy deleted"],
  ["src/lib/societyFeedback/admin.ts", "admins acting: Dealt with, the note, and the clear-out by hand"],
]);

/**
 * Every file outside the form that the send route or the form's page reaches
 * and that can say who is calling, each with why. A helper added beside them
 * that reads the session would have to be named here.
 */
const REACHED_SESSION_READERS = new Map([
  ["src/lib/firebase/session.ts", "the session itself, read by the route's one `getCurrentUser` call"],
  ["src/lib/firebase/impersonation.ts", "the view-as guard the route calls first, which refuses and keeps nothing"],
  ["src/lib/firebase/admin.ts", "the Admin SDK's own setup, which names its sign-in module and reads no request"],
]);

/** Every file inside `src` a door reaches through its imports, the door included. */
function reachedFrom(door) {
  const seen = new Set();
  const unresolved = [];
  const visit = (file) => {
    const path = rel(file);
    if (seen.has(path)) return;
    seen.add(path);
    // A type import loads nothing when the code runs, so it is not followed.
    for (const match of withoutTypeImports(codeOf(readFileSync(file, "utf8"))).matchAll(/\b(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      const specifier = match[1];
      if (/\.css$/.test(specifier) || (!specifier.startsWith("@/") && !specifier.startsWith("."))) continue;
      const target = resolveImport(file, specifier, SRC);
      if (!target) unresolved.push(`${path} imports ${specifier}`);
      else visit(target);
    }
  };
  visit(join(REPO_ROOT, door));
  return { files: [...seen].sort(), unresolved };
}

describe("1b. only the files named here read a session or write to the database", () => {
  test("a session is read only by the send route, the three admin routes and the admins' page", () => {
    for (const [path, why] of SESSION_READERS) assert.ok(why.length > 10 && existsSync(join(REPO_ROOT, path)), path);
    const found = OWN_FILES.filter((path) => readsSession(read(path)));
    assert.deepEqual(found, [...SESSION_READERS.keys()].sort(), "a file of the form reads a session and is not on the list, or a listed one no longer does");
  });

  test("the database is written only by the writer, the move and the admins' library", () => {
    const found = OWN_FILES.filter((path) => writesDatabase(read(path)));
    assert.deepEqual(found, [...DATABASE_WRITERS.keys()].sort(), "a file of the form writes to the database and is not on the list, or a listed one no longer does");
  });

  for (const door of [SEND_ROUTE, FORM_PAGE]) {
    test(`everything ${door} reaches outside the form that can say who is calling is named, with why`, () => {
      const { files, unresolved } = reachedFrom(door);
      assert.deepEqual(unresolved, [], "an import this guard cannot follow is an import it cannot vouch for");
      const outside = files.filter((path) => !OWN_FILES.includes(path) && readsSession(read(path)));
      const allowed = door === FORM_PAGE ? ["src/lib/firebase/admin.ts"] : [...REACHED_SESSION_READERS.keys()];
      assert.deepEqual(outside.filter((path) => !allowed.includes(path)), [], "a file the door reaches can say who is calling and is not on the list");
    });
  }

  test("the rate limiter, which every send passes through, logs nothing", () => {
    const limiter = read("src/lib/rateLimit.ts");
    assert.equal(LOG.exec(codeOf(limiter)), null, "the rate limiter logs");
    assert.equal(LOG.exec(codeOf("process.stderr.write(key);")) !== null, true);
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

  test("a deletion's record holds who, when, which kind and how many, and is handed nothing of any entry", () => {
    const declared = /export const DELETION_FIELDS = \[([^\]]*)\] as const;/.exec(codeOf(read("src/lib/societyFeedback/model.ts")));
    assert.ok(declared, "DELETION_FIELDS moved");
    assert.deepEqual([...declared[1].matchAll(/"(\w+)"/g)].map((m) => m[1]), ["kind", "count", "byUid", "at"]);
    const admin = codeOf(read("src/lib/societyFeedback/admin.ts"));
    const record = /function deletionRecord\(kind: DeletionKind, count: number, admin: \{ uid: string \}, now: Date\) \{\s*return \{([^}]*)\};\s*\}/.exec(admin);
    assert.ok(record, "the deletion record's writer moved, or is now handed something else");
    const keys = record[1]
      .split(",")
      .map((part) => part.split(":")[0].trim())
      .filter(Boolean);
    assert.deepEqual(keys, ["kind", "count", "byUid", "at"], "a deletion's record now holds something else");
    assert.ok(!/\.\.\./.test(record[1]), "the record copies something whole");
    // Every write to the deletions collection goes through it.
    const writes = [...admin.matchAll(/collection\(SOCIETY_DELETIONS_COLLECTION\)[^;]*;/g)].map((m) => m[0]);
    assert.equal(writes.length, 2, "a deletion is recorded somewhere other than the two places named");
    // Written as the record alone: nothing spread into it, nothing beside it.
    for (const write of writes) {
      assert.match(write, /^collection\(SOCIETY_DELETIONS_COLLECTION\)(?:\.doc\(\), |\.add\()deletionRecord\("(?:one", 1|clear-out", snap\.docs\.length), admin, now\)\);$/, write);
    }
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

  test("the process's own streams and a throw built from anything but a plain string are caught", () => {
    const one = (snippet) => breaches("x.ts", snippet);
    assert.equal(one("process.stdout.write(words);").length, 1);
    assert.equal(one("process.stderr.write(raw);").length, 1);
    assert.equal(one("throw new Error(words);").length, 1);
    assert.equal(one("throw new Error(`bad ${raw}`);").length, 1);
    assert.equal(one("throw err;").length, 1);
    assert.deepEqual(one('throw new Error("The move found no database.");'), []);
  });

  test("a session read and a database write are told apart from their look-alikes", () => {
    assert.equal(readsSession('import { getCurrentUser } from "@/lib/firebase/session";\nconst u = await getCurrentUser();'), true);
    assert.equal(readsSession('import type { SessionUser } from "@/lib/firebase/session";'), false);
    assert.equal(readsSession("const store = await cookies();"), true);
    assert.equal(writesDatabase('db.collection("x").add({ uid });'), true);
    assert.equal(writesDatabase("const byDay = new Map(); byDay.set(day, list);"), false, "a Map is not the database");
    assert.equal(writesDatabase("async function f(db: Firestore) { await db.collection(\"x\").get(); }"), false, "a read is not a write");
  });

  test("a word in a comment is not a breach", () => {
    assert.deepEqual(breaches("x.ts", "// console.log is never used here\nconst a = 1;"), []);
  });
});
