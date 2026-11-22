/**
 * A group's meeting link lives on the site, behind sign-in, and never in a
 * message. Walked over the whole of `src`.
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
 * (`tests/course-week-emails.test.mjs`, `tests/email-unfilled-tokens.test.mjs`,
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
  "lib/courses/meetingLink/save.ts": {
    does: "saves",
    why: "the facilitators' box saves the link they typed for one week (the week's own) or for every week (the group's standing link), behind its route's gate; it emails nobody",
  },
  "lib/courses/meetingLink/plan.ts": {
    does: "saves",
    why: "the arithmetic of a link saved for one week or from a week on: the field paths the writer sets, every earlier week keeping the link it had, marked; and which kind of link a week reads (its own, every week, kept, none) as a word, never the link, the one decision the facilitator's list and the week's rooms page (which no longer names the link itself) both ask",
  },
  "features/courses/facilitator/JoiningOnlineBox.tsx": {
    does: "saves",
    why: "the facilitators' box under the session on the group page and at the top of the register: the field a facilitator types a week's link into, held to the group's own cap, which it sends to its route and never shows back",
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
  "lib/courses/visit/card.ts": {
    does: "resolves",
    why: "the host's link for the one session of a one-week visit, on the visitor's own card, through seesSessionLink by that session's key; never the standing link, and no email reads it",
  },
  "lib/courses/visit/view.ts": {
    does: "stores",
    why: "the shape of a visit's card on the overview: the field the resolved link travels in, typed only",
  },
  "features/courses/visit/VisitCard.tsx": {
    does: "shows",
    why: "Join online on the visitor's own card for the session they go to, behind sign-in, with the line that says the link is only here",
  },
  "features/courses/nextSession/NextSessionCards.tsx": {
    does: "asks",
    why: "the next session's cards, on Home and the programme page, ask whether a visit's card carries a link, to tell the joining-online answer whether there is one; they show nothing of it themselves",
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
  "lib/courses/joiningOnline/seat.ts": {
    does: "asks",
    why: "Joining online asks whether the session has a link, to tell the person it is on their ticket or will be; the answer never carries it",
  },
  "lib/courses/groupPage/load.ts": {
    does: "asks",
    why: "a group's page says whether the group, and each week, has a meeting link (Set the link, Hold it online); it never hands the link back",
  },
  "lib/courses/meetingLink/givenSession.ts": {
    does: "resolves",
    why: "the one session's link for somebody given that session, for its register, while the grant holds, through seesSessionLink; the register page shows it as an href and no email reads it",
  },
  "lib/courses/meetingLink/box.ts": {
    does: "asks",
    why: "the facilitators' box asks whether a session somebody is joining online has a link yet, to ask for one or not; it never hands it back",
  },
  "lib/courses/sessionChange/view.ts": {
    does: "asks",
    why: "whether a session can be held online: the change dialog offers it only to a group that has a link",
  },
  "app/api/courses/runs/[runId]/weeks/[weekId]/mode/route.ts": {
    does: "asks",
    why: "refuses holding a whole week online while a group that would go online has no link to put on its programme page",
  },
  "lib/courses/sessionChange/check.ts": {
    does: "asks",
    why: "the change route's checks (moved out of the route itself): refuses Hold it online for a group with no link to put on its programme page",
  },
  "lib/courses/placementEmail.ts": {
    does: "asks",
    why: "the placement email asks whether an online group has a link, to say it is on the programme page; it never prints it",
  },
  "lib/scheduler/jobs/weekReminders.ts": {
    does: "asks",
    why: "the reminder of a session asks whether a link is set for that week, as the programme page's session card reads it, to say the link is on the programme page; it never prints it",
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
        "the site behind sign-in: show it, save it, or ask whether it is there, and list the file here with " +
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
      // Asked only whether there is one, and only on the Online campus or none (a blank room on a campus is a room to book).
      'return session.meetingUrl && (campus === null || campus === "online") ? "Online" : "";',
    ]);
  });

  test("the reminders before a session only ask whether a week has a link, and hand the words a yes or no", () => {
    const job = read("lib/scheduler/jobs/weekReminders.ts");
    const uses = [...job.matchAll(/^.*\bmeetingUrl\b.*$/gm)].map((m) => m[0].trim());
    assert.deepEqual(uses, [
      "const link = cardChangeFacts(sessions, group, due.session, londonDateKey(ctx.now)).next?.meetingUrl ?? null;",
      'const place = reminderPlaceOf(group, due.session, typeof link === "string" && validateSubmissionUrl(link, GROUP_FIELD_LIMITS.meetingUrl) === null);',
    ]);
    // Asked as the card asks it: a yes only for an address that passes the card's own check.
    const asked =
      'const place = reminderPlaceOf(group, due.session, typeof link === "string" && validateSubmissionUrl(link, GROUP_FIELD_LIMITS.meetingUrl) === null);';
    assert.ok(job.includes(asked));
    assert.equal((job.match(/\blink\b/g) ?? []).length - (job.match(/"[^"\n]*\blink\b[^"\n]*"/g) ?? []).length, 3, "the link is read once and asked once, and goes nowhere else");
    assert.doesNotMatch(job.replace(asked, ""), /[(,{[]\s*link\s*[,)}\]]|\blink\s*[,})]/, "the link is handed on somewhere");
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
    assert.deepEqual(promising, [], "these promise the meeting link by email, where the site keeps it behind sign-in");
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
