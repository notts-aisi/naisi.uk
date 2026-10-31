/**
 * Updates (Q18): the email beside an update, word for word.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE WORDS. Each email is rendered through the real templates and read
 *     back: the title, the notice marker above the message with the reason
 *     for its audience, the message as text (markup typed into it arrives as
 *     the characters typed), the line saying who sent it, and no unsubscribe
 *     link, because a notice has nothing to unsubscribe from.
 *  2. THE TEST is the same email to the presser alone, marked "[TEST]" in its
 *     subject, without the marker, whose sentence would be false about it.
 *  3. NEVER A MEETING LINK. A group with a link to an online session, for the
 *     week and for every week, sends an update whose email does not carry it,
 *     and no update file reads one.
 *  4. THE STAFF EMAIL'S RULES. An update's title and message are the email's
 *     subject and body: the limits are the staff email's own, and the parser
 *     accepts and refuses exactly what `parseStaffMessage` does.
 *  5. REPLIES GO TO THE SOCIETY'S INBOX, the address the facilitator's line
 *     on the page names.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { A, B, RUN, makeUpdatesWorld } from "./lib/updatesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const w = await makeUpdatesWorld("__updatesEmail");
const { world, press, ask } = w;
const { COURSE_UPDATE_LIMITS } = await w.loadTs(join("lib", "firestore", "courseUpdates.ts"));
const { COURSE_STAFF_EMAIL_LIMITS, parseStaffMessage } = await w.loadTs(join("lib", "email", "courseFacilitatorEmails.ts"));
const { parseUpdatePost } = await w.loadTs(join("lib", "courses", "updates", "parse.ts"));
const words = await w.loadTs(join("lib", "courses", "updates", "words.ts"));

beforeEach(() => {
  w.reset();
});

/**
 * A message the mail door was handed, as the recipient reads it. `lines` is
 * the plain-text version's lines with the blank ones between blocks left out.
 */
async function read(message) {
  const text = (await render(message.react, { plainText: true })).trim();
  return {
    text,
    lines: text.split("\n").filter((line) => line.trim() !== ""),
    html: await render(message.react),
  };
}

const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";
const RULE = "----------------------------------------";

describe("1. the email's words", () => {
  test("an update to one group, from its facilitator", async () => {
    await press("rahul", {
      to: "group",
      groupId: B,
      title: "Room change for Group B this week",
      message: "We’re in B52 on Tuesday.\nSame time, 6pm.\n\nBring <b>one</b> question.",
    });
    // Amara, and Ines, who unsubscribed from the run's cohort list: an update
    // is a notice, and reaches her whatever she unsubscribed from.
    assert.deepEqual(world.mail.map((sent) => sent.to).sort(), ["amara@example.com", "ines@example.com"]);
    const message = world.mail.find((sent) => sent.to === "amara@example.com");
    assert.equal(message.subject, "Room change for Group B this week");
    const { lines, html } = await read(message);
    assert.deepEqual(lines, [
      "ROOM CHANGE FOR GROUP B THIS WEEK",
      "Sent as an important notice",
      "You are getting this because you are in this course group, so it reaches you whatever your notification settings say, and it is never marketing.",
      "We’re in B52 on Tuesday.",
      "Same time, 6pm.",
      "Bring <b>one</b> question.",
      RULE,
      "Sent by Rahul · Group B · AGI Strategy Fellowship (Autumn 2026)",
      RULE,
      FOOTER,
    ]);
    // Typed markup is text: escaped, never rendered.
    assert.ok(html.includes("Bring &lt;b&gt;one&lt;/b&gt; question."));
    assert.ok(!html.includes("<b>one</b>"));
    // The marker sits above the message. (The inbox preview line repeats the
    // message's first paragraph at the very top, so the body is its last copy.)
    assert.ok(html.indexOf("Sent as an important notice") < html.lastIndexOf("We’re in B52"));
    // A notice offers nothing to unsubscribe from.
    assert.doesNotMatch(html, /unsubscribe/i);
  });

  test("an update to everyone, from the lead", async () => {
    await press("claudia", { title: "Week 3 readings are up", message: "The 3 readings take about 75 minutes. Bring one question." });
    const { lines } = await read(world.mail[0]);
    assert.deepEqual(lines, [
      "WEEK 3 READINGS ARE UP",
      "Sent as an important notice",
      "You are getting this because you are on this course, so it reaches you whatever your notification settings say, and it is never marketing.",
      "The 3 readings take about 75 minutes. Bring one question.",
      RULE,
      "Sent by Claudia · AGI Strategy Fellowship (Autumn 2026)",
      RULE,
      FOOTER,
    ]);
  });

  test("an update to the facilitators says so in its last line", async () => {
    await press("claudia", { to: "facilitators", title: "The week 3 guide", message: "It is up. Read it before Tuesday." });
    const { text } = await read(world.mail[0]);
    assert.ok(text.includes("Sent by Claudia · Facilitators · AGI Strategy Fellowship (Autumn 2026)"));
  });

  test("every message of one press is the same email, to one person each", async () => {
    await press("claudia");
    const bodies = await Promise.all(world.mail.map(async (message) => (await read(message)).text));
    assert.equal(new Set(bodies).size, 1);
    assert.deepEqual(world.mail.map((message) => message.to).sort(), ["amara@example.com", "bea@example.com", "ines@example.com", "tariq@example.com"]);
  });
});

describe("2. the test", () => {
  test("is the same email, marked in its subject, without the marker, to the presser alone", async () => {
    const body = { to: "group", groupId: B, title: "Room change for Group B this week", message: "We’re in B52 on Tuesday." };
    assert.equal((await ask.post("rahul", { ...body, test: true })).status, 200);
    assert.equal(world.mail.length, 1);
    const [message] = world.mail;
    assert.equal(message.to, "rahul@example.com");
    assert.equal(message.subject, "[TEST] Room change for Group B this week");
    const { lines } = await read(message);
    assert.deepEqual(lines, [
      "ROOM CHANGE FOR GROUP B THIS WEEK",
      "We’re in B52 on Tuesday.",
      RULE,
      "Sent by Rahul · Group B · AGI Strategy Fellowship (Autumn 2026)",
      RULE,
      FOOTER,
    ]);
  });
});

describe("3. never a meeting link", () => {
  test("a group that meets online sends no link in an update's email", async () => {
    const link = "https://meet.example.com/abc-defg-hij";
    world.db.poke(`courseGroups/${B}`, {
      "session.meetingUrl": link,
      sessionOverrides: { w03: { meetingUrl: `${link}?week=3` } },
      sessionModes: { w03: "virtual" },
    });
    await press("rahul", { to: "group", groupId: B, title: "Online this week", message: "We’re online on Tuesday. Same time, 6pm." });
    await ask.post("rahul", { to: "group", groupId: B, title: "Online this week", message: "Same.", test: true });
    for (const message of world.mail) {
      const { html, text } = await read(message);
      assert.ok(!html.includes("meet.example.com") && !text.includes("meet.example.com"), message.to);
    }
  });

  test("no file of updates reads a meeting link", () => {
    const files = [
      join(SRC, "app", "api", "courses", "runs", "[runId]", "updates", "route.ts"),
      join(SRC, "lib", "firestore", "courseUpdates.ts"),
      ...walk(join(SRC, "lib", "courses", "updates")),
      ...walk(join(SRC, "features", "courses", "updates")),
    ];
    for (const file of files) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /meetingUrl/, relative(SRC, file).split(sep).join("/"));
    }
  });
});

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

describe("4. the staff email's rules", () => {
  test("the limits are the staff email's own", () => {
    assert.deepEqual(
      { title: COURSE_UPDATE_LIMITS.title, message: COURSE_UPDATE_LIMITS.message },
      { title: COURSE_STAFF_EMAIL_LIMITS.subject, message: COURSE_STAFF_EMAIL_LIMITS.body },
    );
  });

  test("a title and message are accepted and refused exactly as a staff email's subject and body", () => {
    const TITLES = ["Week 3", "  padded  ", "", "   ", "two\nlines", "two\r\nlines", "x".repeat(150), "x".repeat(151), 7, null];
    const MESSAGES = ["Bring one question.", "a\r\nb", "  \n  ", "", "x".repeat(4000), "x".repeat(4001), ` ${"x".repeat(4000)} `, ["x"], undefined];
    for (const title of TITLES) {
      for (const message of MESSAGES) {
        const ours = parseUpdatePost({ to: "everyone", title, message, email: false });
        const staff = parseStaffMessage({ subject: title, body: message });
        assert.equal(ours.ok, staff.ok, JSON.stringify({ title, message }));
        if (ours.ok) {
          assert.equal(ours.value.title, staff.value.subject);
          assert.equal(ours.value.message, staff.value.body);
        }
      }
    }
  });
});

describe("5. replies go to the society's inbox", () => {
  test("the address the page names is the address every email replies to", async () => {
    assert.equal(words.UPDATE_REPLY_TO, "ai-safety@uonsu.com");
    assert.ok(words.writeToGroupLine(8).endsWith("Replies go to ai-safety@uonsu.com."));
    await press("claudia");
    await ask.post("claudia", { to: "group", groupId: A, title: "T", message: "M", test: true });
    for (const message of world.mail) assert.equal(message.replyTo, words.UPDATE_REPLY_TO);
  });

  test("the run they are about is named on every receipt, never the update's own id", async () => {
    await press("claudia");
    for (const message of world.mail) assert.equal(message.referenceId, RUN.agi);
  });
});
