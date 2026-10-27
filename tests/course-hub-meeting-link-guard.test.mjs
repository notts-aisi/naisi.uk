/**
 * A group's meeting link lives on the site, behind sign-in, and never in a
 * message (Q23). Walked over the whole of `src`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The class this guards
 *
 * An email can be forwarded, and a link to a group's call lets whoever holds
 * it into the room. Two things in the tree once put the link in a message or
 * promised to: the room notice's prefill wrote "Join here: {link}" into an
 * email to the whole group, and three session cards said the facilitator
 * would send the joining link. The suites of the two emails that tell a group
 * where it meets already render them with a link set and find it absent
 * (`tests/course-nudge.test.mjs`, `tests/email-unfilled-tokens.test.mjs`,
 * `tests/course-register-ends.test.mjs`); an update about a session held
 * online is held to the same in `tests/course-hub-sessions-routes.test.mjs`.
 * What they cannot see is the NEXT composer or email that reads the link. So:
 *
 *  1. THE LIST IS THE TREE. Every file whose code names a group's link
 *     (`meetingUrl`) is listed with what it does with it: stores it, saves
 *     what somebody typed, shows it on the site, resolves it, or only asks
 *     whether there is one. A new file that names it fails here until
 *     somebody decides; there is no kind for a file that writes a message.
 *  2. NOBODY SPLICES IT INTO TEXT. No template literal anywhere interpolates
 *     an expression naming it, and no string is concatenated with one. On the
 *     site the link is a value (an `href`, a check), never words.
 *  3. NO MESSAGE IS MADE BESIDE IT. No email template names it, only the
 *     weekly email's builder may (it asks whether there is one, to say
 *     Online), and no message composer names it, the room notice's included.
 *  4. NO COPY PROMISES IT BY EMAIL.
 *
 * The room notice's online wording, rendered, is held in
 * `tests/course-hub-sessions-pages.test.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");
/** A file's code with its comments gone and its strings kept. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });
const FILES = [...walkSource(SRC)].map((file) => [inSrc(file), codeOf(file)]);
const read = (path) => FILES.find(([file]) => file === path)?.[1] ?? null;

const NAMES_IT = /\bmeetingUrl\b/;

/**
 * Every file whose code names a group's meeting link, and what it does with
 * it. The kinds are a closed set, and none of them writes a message.
 */
const KINDS = new Set(["stores", "saves", "shows", "resolves", "asks"]);
const READERS = {
  "lib/firestore/courseGroups.ts": {
    does: "stores",
    why: "the group's shape and its normaliser: where the link is kept, capped, and read back",
  },
  "features/courses/courseMutations.ts": {
    does: "saves",
    why: "the run editor's writes of a group's session, which save the link a person typed into it",
  },
  "features/courses/GroupEditor.tsx": {
    does: "saves",
    why: "the run editor's group card, where an admin or the run's staff type the link and the card checks it is a web address",
  },
  "lib/courses/groupTimes/act.ts": {
    does: "saves",
    why: "a group added from the Times view is born in the run editor's own session shape, its link empty (null); nothing there reads it",
  },
  "features/courses/GroupWeekEditor.tsx": {
    does: "shows",
    why: "a facilitator's week editor, which shows them the link their group will see on the site in an online week",
  },
  "app/(app)/learn/[runId]/group/[groupId]/edit/[weekId]/page.tsx": {
    does: "shows",
    why: "the week editor's page, which hands the editor the link from the group document after its own gate",
  },
  "app/(app)/learn/[runId]/group/[groupId]/page.tsx": {
    does: "shows",
    why: "a facilitator's group page: the session card's Join online, after the page's gate (a facilitator of the group or an admin)",
  },
  "app/api/courses/runs/[runId]/overview/route.ts": {
    does: "shows",
    why: "the member's run overview: the link of the reader's own group, and only theirs, redacted by canSeeMeetingUrlFor",
  },
  "features/courses/SessionCard.tsx": {
    does: "shows",
    why: "Join online on the run home, the week page and the group page, behind sign-in, with the line that says it is not in any email",
  },
  "app/(app)/dashboard/NextSession.tsx": {
    does: "shows",
    why: "Home's session card's Join online, behind sign-in, with the same line",
  },
  "features/courses/sessionChange/cardFacts.ts": {
    does: "shows",
    why: "dates a session card to the group's next session, with that session's own link from the overview payload",
  },
  "lib/courses/sessionChange/model.ts": {
    does: "resolves",
    why: "hands the next session's own link to the overview payload's card, which redacts it as it redacts the group's",
  },
  "lib/courses/sessions.ts": {
    does: "resolves",
    why: "the session resolver, whose stand-in slot for a reader with no group carries no link",
  },
  "lib/courses/sessionChange/view.ts": {
    does: "asks",
    why: "whether a session can be held online: the change dialog offers it only to a group that has a link",
  },
  "app/api/courses/runs/[runId]/weeks/[weekId]/mode/route.ts": {
    does: "asks",
    why: "refuses holding a whole week online while a group that would go online has no link to put on its programme page",
  },
  "app/api/courses/groups/[groupId]/session/change/route.ts": {
    does: "asks",
    why: "refuses Hold it online for a group with no link to put on its programme page",
  },
  "lib/courses/placementEmail.ts": {
    does: "asks",
    why: "the placement email asks whether an online group has a link, to say it is on the programme page; it never prints it",
  },
  "lib/email/courseNudgeEmail.ts": {
    does: "asks",
    why: "next week's email asks whether there is a link, to say Online; it never prints it",
  },
  "lib/courses/calendarFeed.ts": {
    does: "asks",
    why: "a person's calendar link asks whether a session has a link to join, to say Join on naisi.uk with their programme page; it never prints it",
  },
};

describe("1. every file that names a group's meeting link is listed", () => {
  const naming = FILES.filter(([, code]) => NAMES_IT.test(code)).map(([file]) => file).sort();

  test("the scan is reading: it finds the record and a card", () => {
    assert.ok(FILES.length > 400, `only ${FILES.length} files were read`);
    assert.ok(naming.includes("lib/firestore/courseGroups.ts"));
    assert.ok(naming.includes("features/courses/SessionCard.tsx"));
  });

  test("they are the listed files, both ways", () => {
    assert.deepEqual(
      naming,
      Object.keys(READERS).sort(),
      "A file names a group's meeting link and is not listed, or a listed file no longer does. The link lives on " +
        "the site behind sign-in (Q23): show it, save it, or ask whether it is there, and list the file here with " +
        "what it does. Nothing that writes a message may read it.",
    );
  });

  test("every entry says what it does, in one of the kinds, with a reason", () => {
    for (const [file, entry] of Object.entries(READERS)) {
      assert.ok(KINDS.has(entry.does), `${file}: ${entry.does} is not a kind a reader of the link may be`);
      assert.ok(entry.why.length > 40, `${file} needs its reason written down`);
    }
  });
});

describe("2. nobody splices the link into text", () => {
  // `${ ... meetingUrl ... }` inside a template literal, or a `+` beside it.
  const SPLICED = /\$\{[^}]*\bmeetingUrl\b[^}]*\}|\bmeetingUrl\b[^\n;,)]*?\s\+\s|\s\+\s[\w.?]*\bmeetingUrl\b/;

  test("the detector sees the shape the room notice once had, and not a link used as a value", () => {
    assert.ok(SPLICED.test("const where = ` Join here: ${session.meetingUrl}`;"));
    assert.ok(SPLICED.test('const text = "Join here: " + group.meetingUrl;'));
    assert.ok(!SPLICED.test("<a href={meetingUrl}>"));
    assert.ok(!SPLICED.test("const showJoin = Boolean(meetingUrl);"));
  });

  test("no file in src puts a group's link into a string", () => {
    const splicing = FILES.filter(([, code]) => SPLICED.test(code)).map(([file]) => file);
    assert.deepEqual(splicing, [], "these files write a group's meeting link into text, which is how it reaches a message");
  });
});

describe("3. no message is made beside the link", () => {
  test("no email template names it, and of the email modules only the weekly email's builder asks it", () => {
    const emails = FILES.filter(([file, code]) => file.startsWith("emails/") && NAMES_IT.test(code)).map(([file]) => file);
    assert.deepEqual(emails, []);
    const lib = FILES.filter(([file, code]) => file.startsWith("lib/email/") && NAMES_IT.test(code)).map(([file]) => file);
    assert.deepEqual(lib, ["lib/email/courseNudgeEmail.ts"]);
    // And there it is only a question: the one line that reads it answers Online or nothing.
    const nudge = read("lib/email/courseNudgeEmail.ts");
    const uses = [...nudge.matchAll(/^.*\bmeetingUrl\b.*$/gm)].map((m) => m[0].trim());
    assert.deepEqual(uses, [
      'return session.meetingUrl ? "Online" : "";',
    ]);
  });

  test("no message composer names it: the room notice, the group email, updates and the change dialog", () => {
    const composers = FILES.filter(
      ([file]) => /Composer\.tsx$/.test(file) || file.endsWith("sessionChange/ChangeSessionDialog.tsx"),
    );
    const names = composers.map(([file]) => file).sort();
    for (const expected of [
      "features/courses/RoomNoticeComposer.tsx",
      "features/courses/StaffEmailComposer.tsx",
      "features/courses/updates/UpdateComposer.tsx",
      "features/courses/sessionChange/ChangeSessionDialog.tsx",
    ]) {
      assert.ok(names.includes(expected), `the scan no longer sees ${expected}`);
    }
    for (const [file, code] of composers) {
      assert.doesNotMatch(code, NAMES_IT, `${file} composes a message and names a group's meeting link`);
    }
  });

  test("the room notice is not handed the link by the page that draws it", () => {
    const page = read("app/(app)/learn/[runId]/group/[groupId]/edit/page.tsx");
    assert.ok(page.includes("<RoomNoticeComposer"), "the page no longer draws the room notice");
    assert.doesNotMatch(page, NAMES_IT);
  });
});

describe("4. no copy promises the link by email", () => {
  const PROMISE = /send(?:s|ing)?\s+(?:you\s+|them\s+|it\s+)?the\s+(?:joining|meeting|join)\s+link|joining link separately|Join here:|send it in a room notice/i;

  test("no string in src promises to send it", () => {
    const promising = FILES.filter(([, code]) => PROMISE.test(code)).map(([file]) => file);
    assert.deepEqual(promising, [], "these promise the meeting link by email, where Q23 keeps it on the site");
  });

  test("the cards say where the link will be, and why it is not in an email", async () => {
    const words = read("lib/courses/sessionChange/words.ts");
    assert.match(words, /export const LINK_IS_HERE = "The link is here, not in your emails, so it can’t be forwarded\.";/);
    assert.match(words, /export const LINK_WILL_BE_HERE = "The link to join will be here, not in your emails\.";/);
    assert.match(words, /export const JOIN_ONLINE = "Join online";/);
    for (const file of ["features/courses/SessionCard.tsx", "app/(app)/dashboard/NextSession.tsx"]) {
      const code = read(file);
      assert.match(code, /\{JOIN_ONLINE\}/, `${file} no longer says Join online`);
      assert.match(code, /\{LINK_IS_HERE\}/, `${file} no longer says the link is not in any email`);
      assert.match(code, /LINK_WILL_BE_HERE/, `${file} no longer says where a missing link will be`);
    }
  });
});
