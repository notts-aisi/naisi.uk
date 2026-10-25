/**
 * A SURVEY RECORDS NO ACTIVITY AND NO IP ADDRESS (docs/surveys.md).
 *
 * WHY. Worksheets record when a recipient first opened one, how many times
 * they moved between its pages and roughly how long they spent. Surveys are
 * built on Worksheets' parts and promise the opposite: "no record of when
 * someone opens a survey, or for how long", and "no IP addresses with
 * answers". A promise like that is broken by one line added later (a stamp
 * on open, an address beside an answer), so this guard WALKS EVERY SURVEY
 * FILE, the routes, the pages, the libraries and the components, and fails on:
 *
 *  1. AN ACTIVITY RECORD: a field or a hook by any of the names Worksheets
 *     uses for one, or the obvious others (`openedAt`, `viewedAt`,
 *     `lastSeenAt`, `activity`).
 *  2. AN IP ADDRESS, OR A BROWSER'S NAME FOR ITSELF: the forwarding headers,
 *     a user agent, or the client's address read for anything but the one
 *     thing it may be read for, a count in the server's own memory that slows
 *     somebody trying secrets: `clientIp(req)` written inside the key of a
 *     `rateLimit(` call and nowhere else, so it is never held in a name that
 *     could be stored.
 *  3. A PAGE THAT WRITES: a survey page reads, and nothing about opening one
 *     is kept, so no page file calls a write.
 *
 * The scanner's own reading is exercised on synthetic snippets at the bottom,
 * so a pattern that has quietly stopped matching fails rather than passes.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every place survey code lives. A new one is added here in the change that makes it. */
const ROOTS = [
  "src/app/api/surveys",
  "src/app/survey",
  "src/app/(app)/learn/[runId]/survey",
  "src/app/(app)/admin/(admin-only)/surveys",
  "src/features/surveys",
  "src/lib/surveys",
  "src/lib/firestore/surveys.ts",
  "src/lib/scheduler/jobs/surveyNamesOff.ts",
  "src/emails/SurveyEmail.tsx",
];

function* walk(path) {
  const full = join(REPO_ROOT, path);
  if (!existsSync(full)) return;
  if (statSync(full).isFile()) {
    yield full;
    return;
  }
  for (const entry of readdirSync(full)) yield* walk(join(path, entry));
}

const FILES = ROOTS.flatMap((root) => [...walk(root)]).filter((file) => /\.(ts|tsx)$/.test(file));

/** Code with its strings, comments gone. */
const codeOf = (source) => stripSource(source, { keepStrings: true });

const ACTIVITY = /\b(firstOpenedAt|lastOpenedAt|openedAt|lastActiveAt|activeMs|pageOpens|viewedAt|lastSeenAt|useResponseActivity|activity)\b/;
const ADDRESS = /x-forwarded-for|x-real-ip|remoteAddress|user-agent|userAgent|\bipAddress\b|\.ip\b/i;
const CLIENT_IP = /clientIp\(/g;
/** The one shape the client's address may be read in: inside a rate limit's key. */
const LIMIT_KEY = /rateLimit\(`[^`]*\$\{clientIp\(req\)\}[^`]*`/g;
const WRITE = /\.(set|update|add|create|delete)\(|runTransaction\(|\.batch\(\)/;

/** What one file breaks, as sentences. */
export function breaches(path, source) {
  const out = [];
  const code = codeOf(source);
  const activity = ACTIVITY.exec(code);
  if (activity) out.push(`${path} records activity: "${activity[0]}"`);
  const address = ADDRESS.exec(code);
  if (address) out.push(`${path} reads an address or a user agent: "${address[0]}"`);
  const reads = (code.match(CLIENT_IP) ?? []).length;
  const limited = (code.match(LIMIT_KEY) ?? []).length;
  if (reads !== limited) out.push(`${path} reads the client's address outside a rate limit's key`);
  if (/\/page\.tsx$/.test(path) && WRITE.test(code)) out.push(`${path} is a page that writes`);
  return out;
}

describe("no survey file records activity or an IP address", () => {
  test("the walk found the survey code", () => {
    assert.ok(FILES.length >= 30, `only ${FILES.length} survey files found: was the code moved?`);
    for (const root of ROOTS) assert.ok(existsSync(join(REPO_ROOT, root)), `${root} is gone: take it out of ROOTS`);
  });

  test("every file keeps the promise", () => {
    const found = FILES.flatMap((file) => breaches(relative(REPO_ROOT, file).split("\\").join("/"), readFileSync(file, "utf8")));
    assert.deepEqual(found, []);
  });

  test("the one route that reads the client's address reads it only for its rate limit", () => {
    const route = readFileSync(join(REPO_ROOT, "src", "app", "api", "surveys", "answer", "route.ts"), "utf8");
    assert.match(route, /rateLimit\(`surveys:answer:ip:\$\{clientIp\(req\)\}`, 30, 60_000\)/);
  });
});

describe("the scanner reads what it says it reads", () => {
  const ok = (source, path = "src/lib/surveys/x.ts") => assert.deepEqual(breaches(path, source), []);
  const bad = (source, path = "src/lib/surveys/x.ts") => assert.ok(breaches(path, source).length > 0, source);

  test("an activity stamp, in any of its names, is caught", () => {
    bad("await ref.update({ firstOpenedAt: FieldValue.serverTimestamp() });");
    bad("tx.update(ref, { pageOpens: FieldValue.increment(1) });");
    bad("const activity = { activeMs: 0 };");
    bad("useResponseActivity(response);");
    bad("row.viewedAt = new Date();");
  });

  test("an address, a header or a user agent is caught", () => {
    bad('const forwarded = req.headers.get("x-forwarded-for");');
    bad('const agent = req.headers.get("user-agent");');
    bad("const ip = clientIp(req);");
    bad("await answerRef.set({ ip: clientIp(req) });");
    bad("const caller = req.ip;");
  });

  test("the address inside a rate limit's key is the one thing allowed", () => {
    ok("const limit = rateLimit(`surveys:answer:ip:${clientIp(req)}`, 30, 60_000);");
  });

  test("a page that writes is caught; one that reads is not", () => {
    bad("await db.collection('surveyPeople').doc(id).update({ seen: true });", "src/app/survey/[token]/page.tsx");
    ok("const survey = await readSurvey(db, id);", "src/app/survey/[token]/page.tsx");
  });

  test("a word in a comment is not a breach", () => {
    ok("// We never keep pageOpens or an x-forwarded-for address.\nconst a = 1;");
  });
});
