/**
 * A calendar leaves the site, so nothing in one may be what stays on it.
 * Walked over the whole of `src`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The class this guards
 *
 * A calendar file is fetched by a calendar app, kept on a phone, synced to
 * another account, shared with a partner's calendar. Q23 keeps a group's
 * meeting link on the site, behind sign-in, and never in an email or a
 * calendar feed; a person's calendar link is a secret, which never goes into
 * a log line or an error. `tests/course-hub-meeting-link-guard.test.mjs`
 * lists every file that names a group's link, and holds that none splices it
 * into text; a link handed to a calendar builder as a VALUE (`url:
 * session.meetingUrl`) is not a splice, and is what this file is for:
 *
 *  1. THE LIST IS THE TREE. Every route that answers `text/calendar`, and
 *     every file that builds a calendar file, is listed with what its
 *     calendar carries. A new one fails here until somebody decides.
 *  2. THE SESSIONS CALENDAR ASKS AND NEVER PRINTS. Of the files a person's
 *     calendar is made by, only the feed's reader names a group's link, in one
 *     line that asks whether there is one; the answer is used only to say
 *     "Join on naisi.uk"; and the builder names no link of a group at all.
 *  3. NO LOG LINE NAMES THE SECRET. No log call in those files is handed the
 *     token, the link or the request.
 *
 * What the files then put in a calendar is executed in
 * `tests/course-hub-calendar-feed.test.mjs`, with a link set on every group
 * and every week, and found absent.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { balancedParens } from "./lib/routeScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");
/** A file's code with its comments gone and its strings kept. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });
const FILES = [...walkSource(SRC)].map((file) => [inSrc(file), codeOf(file)]);
const read = (path) => FILES.find(([file]) => file === path)?.[1] ?? null;

/** Every route that answers a calendar, and what its calendar carries. */
const CALENDAR_ROUTES = {
  "app/api/events/[id]/calendar.ics/route.ts":
    "one published event, with the public text of where it is, for anybody (tests/event-location-disclosure.test.mjs)",
  "app/api/courses/calendar/[token]/sessions.ics/route.ts":
    "a person's sessions, through their own link: dates, programme and group, rooms, and Join on naisi.uk for an online week",
};

/** Every file that builds a calendar file, and what goes in it. */
const CALENDAR_BUILDERS = {
  "app/api/events/[id]/calendar.ics/route.ts": "the public download of one event",
  "lib/events/sendRsvpEmail.ts": "the file attached to an RSVP email, for somebody holding a place",
  "app/api/courses/calendar/[token]/sessions.ics/route.ts": "a person's sessions, from lib/courses/calendarFeed.ts",
};

/** The files a person's calendar is made by: the routes, the link, the feed, the words and the builder. */
const SESSION_CALENDAR = [
  "app/api/courses/calendar/route.ts",
  "app/api/courses/calendar/[token]/sessions.ics/route.ts",
  "lib/courses/calendarFeed.ts",
  "lib/courses/calendarLink.ts",
  "lib/courses/calendarWords.ts",
  "lib/firestore/calendarLinks.ts",
  "lib/events/ics.ts",
];

const NAMES_A_LINK = /\bmeetingUrl\b/;

describe("1. every calendar the site serves or builds is listed", () => {
  test("the scan is reading: it finds the event download and the sessions calendar", () => {
    assert.ok(FILES.length > 400, `only ${FILES.length} files were read`);
    for (const file of SESSION_CALENDAR) assert.ok(read(file), `the scan does not see ${file}`);
  });

  test("every route that answers text/calendar is listed, both ways", () => {
    const answering = FILES.filter(([file, code]) => file.startsWith("app/") && /text\/calendar/.test(code))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(answering, Object.keys(CALENDAR_ROUTES).sort(), "a route answers a calendar and is not listed, or a listed one no longer does");
    for (const [file, carries] of Object.entries(CALENDAR_ROUTES)) assert.ok(carries.length > 40, `${file} needs what it carries written down`);
  });

  test("every file that builds a calendar file is listed, both ways", () => {
    const building = FILES.filter(([file, code]) => file !== "lib/events/ics.ts" && /\bbuild(?:Event|Calendar)Ics\s*\(/.test(code))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(building, Object.keys(CALENDAR_BUILDERS).sort());
  });
});

describe("2. the sessions calendar asks whether there is a link, and never prints one", () => {
  test("of its files, only the feed's reader names a group's link", () => {
    const naming = SESSION_CALENDAR.filter((file) => NAMES_A_LINK.test(read(file)));
    assert.deepEqual(naming, ["lib/courses/calendarFeed.ts"]);
  });

  test("there, in one line, which asks whether there is a link to join", () => {
    const feed = read("lib/courses/calendarFeed.ts");
    const lines = [...feed.matchAll(/^.*\bmeetingUrl\b.*$/gm)].map((m) => m[0].trim());
    assert.deepEqual(lines, [
      'const hasLink = typeof slot.meetingUrl === "string" && validateSubmissionUrl(slot.meetingUrl, GROUP_FIELD_LIMITS.meetingUrl) === null;',
    ]);
  });

  test("and the answer only ever says whether to say Join on naisi.uk", () => {
    const feed = read("lib/courses/calendarFeed.ts");
    const uses = [...feed.matchAll(/^.*\bhasLink\b.*$/gm)].map((m) => m[0].trim());
    assert.deepEqual(uses, [
      'const hasLink = typeof slot.meetingUrl === "string" && validateSubmissionUrl(slot.meetingUrl, GROUP_FIELD_LIMITS.meetingUrl) === null;',
      'const online = mode === "virtual" || (mode === null && hasLink);',
    ]);
    // What an online week says is the site's own address, from the words.
    assert.match(feed, /location: room \?\? \(online \? JOIN_ON_SITE : undefined\),/);
    assert.match(feed, /description: online && !session\.cancelled \? joinWords\(pageUrl\) : undefined,/);
  });

  test("the words name no address but the site's", () => {
    const words = read("lib/courses/calendarWords.ts");
    assert.doesNotMatch(words, /https?:/);
    assert.match(words, /export const JOIN_ON_SITE = "Join on naisi\.uk";/);
  });
});

describe("3. no log line in the sessions calendar's files names the secret", () => {
  /** Every log call in a file's code, with what it is handed. */
  function logCalls(code) {
    const out = [];
    for (const match of code.matchAll(/\bconsole\.(?:log|info|warn|error|debug)\s*\(/g)) {
      out.push(balancedParens(code, match.index + match[0].length - 1));
    }
    return out;
  }

  test("the detector reads a log call's arguments", () => {
    assert.deepEqual(logCalls('console.error("x:", token, (a as { b: c }).d);'), ['"x:", token, (a as { b: c }).d']);
  });

  test("no log call is handed the token, the link, the request or the error's message", () => {
    for (const file of SESSION_CALENDAR) {
      for (const args of logCalls(read(file))) {
        assert.doesNotMatch(args, /\btoken\b|\burl\b|\bUrl\b|targets|\breq\b|\bparams\b|\.message\b|, err\b/, `${file} logs ${args}`);
      }
    }
  });

  test("the deletion's step logs the error's code, never the error", () => {
    const deletion = read("lib/firestore/accountDeletion.ts");
    const line = deletion.split("\n").find((l) => l.includes("calendar link delete failed"));
    assert.ok(line, "the step's log line is gone");
    assert.match(line, /\?\.code \?\? "unknown"\);$/);
  });
});
