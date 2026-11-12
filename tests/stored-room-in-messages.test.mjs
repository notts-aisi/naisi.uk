/**
 * A GROUP'S STORED ROOM NEVER REACHES A MESSAGE AS A LINK.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * A group's room is typed by a person, and a link can be typed into one. An
 * email, a push message or a calendar entry can be forwarded, and a link to
 * an online session lets whoever holds it into the call. So everything the
 * site writes from a stored room asks `couldBeFollowed`
 * (`src/lib/courses/followable.ts`) before it prints the room, and says a
 * room that could be followed as a room not booked yet.
 *
 * ## What this guard does
 *
 * It WALKS THE SENDERS: every file that calls one of the send doors
 * (`tests/lib/sendDoors.mjs`), every file that answers with a calendar, and
 * the routes that hand a page the words of a notice the page then posts to
 * a send (`WORDS_FOR_A_SEND`), then every module those reach through a value
 * import. Each reached module that reads a stored room (a session's or a
 * slot's `location`) must call `couldBeFollowed` itself, or be listed in
 * `ROOM_READS` saying either which module prints the room it hands on (and
 * that module must call `couldBeFollowed`), or why what it reads is never
 * printed. Both directions: an entry whose file no longer reads a room, or is
 * no longer reached from a sender, fails.
 *
 * So a new email, push or feed that prints a room without asking fails here
 * the day it is written.
 *
 * ## What it cannot see
 *
 * It reads source text, so it sees a room read as `<something>session.location`
 * or `<something>slot.location`, and nothing else:
 *
 *  - a room read under another name: a destructured `location`
 *    (`const { location } = session`), a room copied into a variable before
 *    it is printed, or a field read by a computed key;
 *  - whether the `couldBeFollowed` it finds guards the room that is printed:
 *    one call anywhere in a file clears the whole file, every read in it;
 *  - a module reached only through a type import, or one no sender reaches
 *    by a value import (a page's words a person pastes into a send by hand).
 *
 * Those are checked by eye. Writing a new reader in the shape it sees, and
 * asking `couldBeFollowed` beside the read, keeps it inside what is held.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, repoPath, stripComments, walkModulesFrom } from "./lib/clientGraph.mjs";
import { SEND_DOOR_CALL } from "./lib/sendDoors.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

/** Reading a group's stored room: a session's or a slot's `location`, however the binding is named. */
const READS_A_ROOM = /\b[\w$]*(?:[sS]ession|[sS]lot)\??\.location\b/;

/** Asking the one function. */
const ASKS = /\bcouldBeFollowed\s*\(/;

/**
 * Routes that answer with the words of a notice which a page then posts to a
 * send, so the words are a message's although the route sends nothing.
 */
const WORDS_FOR_A_SEND = {
  "src/app/api/courses/groups/[groupId]/session/change/route.ts": {
    words: "oneWeekNoticeFor(",
    why:
      "One week's change answers with its notice's subject and lines (`oneWeekNoticeFor`), and the change dialog " +
      "posts them to the updates route, which emails the group: the room in them is the group's stored room.",
  },
};

/**
 * Every module on a sender's graph that reads a stored room and does not ask
 * `couldBeFollowed` itself, with which module prints what it hands on
 * (`printedBy`, which must ask) or why nothing it reads is printed.
 */
const ROOM_READS = {
  "src/app/api/courses/groups/[groupId]/attendance/cover/route.ts": {
    printedBy: "src/lib/courses/registerCover/words.ts",
    why: "Hands the session's room to the two cover emails' words (`coverEmailWords`, `coverNoticeWords`), whose `whereWords` asks.",
  },
  "src/app/api/courses/groups/[groupId]/session/regular/route.ts": {
    printedBy: "src/lib/courses/regularTime/words.ts",
    why:
      "Hands the new regular room to the notice's words (`regularNoticeWords`), which ask; its other reads are the " +
      "group's history row, which no message prints.",
  },
  "src/lib/courses/excused/ask.ts": {
    printedBy: null,
    why: "Reads the room only to decide whether joining online is offered for a session held in a room (`heldOnline`); prints nothing of it.",
  },
  "src/lib/courses/groupChange/facts.ts": {
    printedBy: null,
    why: "Builds a group history row's facts, which the group's page shows its staff; no message is written from them.",
  },
  "src/lib/courses/regularTime/apply.ts": {
    printedBy: null,
    why: "Writes the new regular room onto the group and its history row; the notice's words are `regularNoticeWords`, which ask.",
  },
  "src/lib/courses/regularTime/model.ts": {
    printedBy: null,
    why: "Compares a week's room with the regular one to decide which weeks keep their own; prints nothing.",
  },
  "src/lib/courses/sessionChange/check.ts": {
    printedBy: null,
    why: "Compares the room a press names with the stored one, and writes the press's room onto the week; prints nothing.",
  },
  "src/lib/courses/sessionChange/model.ts": {
    printedBy: null,
    why: "Works out the stored session a cancelled or moved week leaves next; the notice's words are taken from it in `notice.ts`, which asks.",
  },
};

const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
const codeOf = (path) => stripComments(read(path));

function sourceFiles() {
  const { sources } = walkModulesFrom([]);
  return [...sources.keys()];
}

const files = sourceFiles();
const senders = files.filter((file) => {
  const code = stripComments(readFileSync(file, "utf8"));
  return SEND_DOOR_CALL.test(code) || /["']text\/calendar/.test(code);
});
const entries = [...senders, ...Object.keys(WORDS_FOR_A_SEND).map((path) => join(REPO_ROOT, path))];
const { reached, unresolved } = walkModulesFrom(entries);
const reachedPaths = new Set([...reached.keys()].map(repoPath));

/** Every reached module that reads a stored room, with whether it asks. */
const roomReaders = [...reached.keys()]
  .map((file) => [repoPath(file), stripComments(readFileSync(file, "utf8"))])
  .filter(([, code]) => READS_A_ROOM.test(code))
  .map(([path, code]) => ({ path, asks: ASKS.test(code) }));

test("the walk is reading: it starts from the senders and reaches what they print with", () => {
  assert.ok(senders.length > 50, `only ${senders.length} senders were found`);
  assert.deepEqual(unresolved, [], "the walk could not resolve these imports, so it may be missing modules");
  for (const known of [
    "src/lib/courses/placementEmail.ts",
    "src/lib/email/courseNudgeEmail.ts",
    "src/lib/courses/calendarFeed.ts",
    "src/lib/courses/registerCover/words.ts",
    "src/lib/courses/sessionChange/notice.ts",
    "src/lib/courses/regularTime/words.ts",
  ]) {
    assert.ok(reachedPaths.has(known), `the walk no longer reaches ${known}`);
  }
  for (const shape of ["session.session.location", "moved.session.location", "group.session.location", "slot.location", "next?.session.location"]) {
    assert.match(shape, READS_A_ROOM, `the scan no longer sees ${shape}`);
  }
  for (const shape of ["event.location", "window.location", "GROUP_FIELD_LIMITS.location", "body.location"]) {
    assert.doesNotMatch(shape, READS_A_ROOM, `the scan now reads ${shape} as a group's room`);
  }
});

test("every module on a sender's graph that reads a stored room asks couldBeFollowed, or says who does", () => {
  const unheld = roomReaders.filter((each) => !each.asks && !(each.path in ROOM_READS)).map((each) => each.path);
  assert.deepEqual(
    unheld,
    [],
    "these modules are reached from a send and read a group's stored room without asking couldBeFollowed. " +
      "Ask it before the room is printed, or list the module in ROOM_READS with the module that prints it, " +
      "or why nothing it reads is printed:\n  " +
      unheld.join("\n  "),
  );
});

test("every listed module still reads a room, is still reached from a send, and a printer it names asks", () => {
  for (const [path, entry] of Object.entries(ROOM_READS)) {
    assert.ok(reachedPaths.has(path), `${path} is listed but no longer reached from a send`);
    assert.match(codeOf(path), READS_A_ROOM, `${path} is listed but no longer reads a room`);
    assert.ok(entry.why.length > 60, `${path}: needs a written reason`);
    if (entry.printedBy) {
      assert.ok(reachedPaths.has(entry.printedBy), `${path}: ${entry.printedBy} is not reached from a send`);
      assert.match(codeOf(entry.printedBy), ASKS, `${path}: ${entry.printedBy} prints the room without asking couldBeFollowed`);
    }
  }
  for (const [path, entry] of Object.entries(WORDS_FOR_A_SEND)) {
    assert.ok(codeOf(path).includes(entry.words), `${path} no longer answers with ${entry.words}`);
    assert.ok(entry.why.length > 60, `${path}: needs a written reason`);
  }
});

test("the cover emails, one week's change notice, the regular time and room notices and the calendar feed each ask couldBeFollowed", () => {
  for (const path of [
    "src/lib/courses/registerCover/words.ts",
    "src/lib/courses/sessionChange/notice.ts",
    "src/lib/courses/regularTime/words.ts",
    "src/lib/courses/calendarFeed.ts",
  ]) {
    assert.match(codeOf(path), ASKS, `${path} prints a stored room without asking couldBeFollowed`);
  }
});

// ---------------------------------------------------------------------------
// The words themselves, with a room that holds a link
// ---------------------------------------------------------------------------

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const coverWords = await loadTs("lib/courses/registerCover/words.ts");
const regularWords = await loadTs("lib/courses/regularTime/words.ts");

const LINK_ROOM = "https://meet.example/j/123456789";
const facts = (room) => ({
  groupName: "Group B",
  weekNumber: 1,
  dateKey: "2026-11-03",
  startTimeLocal: "18:00",
  durationMinutes: 120,
  room,
  online: false,
  today: true,
});

test("the email to somebody given a session says a room holding a link is to be confirmed, never the link", () => {
  const email = coverWords.coverEmailWords(facts(LINK_ROOM), "Claudia");
  const text = JSON.stringify(email);
  assert.doesNotMatch(text, /meet\.example|123456789/);
  assert.match(email.lines[0], /, room to be confirmed\. Take the register/);
  // A room that is a room is printed as before.
  assert.match(coverWords.coverEmailWords(facts("Hallward B12"), "Claudia").lines[0], /, Hallward B12\. Take the register/);
});

test("the notice to the group says a room holding a link is to be confirmed, never the link", () => {
  const notice = coverWords.coverNoticeWords(facts(LINK_ROOM), { firstName: "Tom", name: "Tom Fletcher", committee: false }, ["Rahul"]);
  assert.doesNotMatch(JSON.stringify(notice), /meet\.example|123456789/);
  assert.equal(notice.lines[0], "Rahul can’t make it today, so Tom Fletcher is running Group B’s session at 6pm, room to be confirmed.");
  const usual = coverWords.coverNoticeWords(facts("Hallward B12"), { firstName: "Tom", name: "Tom Fletcher", committee: false }, ["Rahul"]);
  assert.match(usual.lines[0], /as usual in Hallward B12\.$/);
});

test("a new regular time's notice and a room's notice say a room holding a link is to be confirmed", () => {
  const regular = regularWords.regularNoticeWords({
    groupName: "Group B",
    incubator: false,
    weekday: 2,
    hhmm: "18:00",
    minutes: 120,
    room: LINK_ROOM,
    campusLabel: "",
    reason: "",
    fromDateKey: "2026-11-10",
    todayKey: "2026-11-03",
    earlier: [],
    dayOrTimeChanged: true,
  });
  assert.doesNotMatch(JSON.stringify(regular), /meet\.example|123456789/);
  const room = regularWords.roomNoticeWords({ groupName: "Group B", incubator: false, room: LINK_ROOM, campusLabel: "", next: null });
  assert.doesNotMatch(JSON.stringify(room), /meet\.example|123456789/);
  assert.match(room.subject, /to be confirmed/);
});
