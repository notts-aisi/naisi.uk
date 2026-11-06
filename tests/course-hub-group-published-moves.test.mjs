/**
 * A move never hides somebody Publish has told about a group, and the next
 * press tells them, once, what changed.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * A seat Publish has told about a group (`placementIsTold` in
 * `src/lib/firestore/courseEnrolments.ts`) STAYS TOLD through any change of
 * its group: to another group, to no group, or back. Its owner sees the
 * group they are in now at once, and so do its people, its facilitators, its
 * register and its next check-in. The seat keeps the group they were told
 * about (`toldGroupId`), and whether they are owed an email is worked out,
 * never stored (`movedSinceTold`): in another group than that one, the next
 * press of Publish sends them "You’ve moved", never Publish's first email
 * again; moved back, nobody is owed anything. Production found the class
 * this replaces: a move cleared the stamp, so the person vanished until
 * somebody pressed Publish again, which then sent them the first email of a
 * group whose first session was behind it, and a swap and a swap back left
 * them owed an email about the group they were already told.
 *
 * ## How it is held
 *
 *  1. THE TREE. Every write that clears Publish's stamp clears the group it
 *     was about beside it, and says why it may clear a stamp at all
 *     (`STAMP_CLEARERS`, both directions): none of them is a move of a told
 *     seat. Every write of the stamp writes the group beside it.
 *  2. EVERY MOVE OF EVERY TOLD SEAT, through the real allocate route: each
 *     person told by a press, moved into each other group and out of every
 *     group, stays told and shown.
 *  3. WHAT IS OWED: a swap and a swap back owes nothing; a move from A to B
 *     to C owes one email, about C; a seat told before `toldGroupId` was kept
 *     has the group it leaves written by its first move; and a move of a seat
 *     nobody has told keeps it untold until Publish sends its first email.
 *  4. PUBLISH NEVER SENDS ITS FIRST EMAIL TO A TOLD SEAT, whichever way it
 *     is told; and "You’ve moved" names the group's next session counted from
 *     now, never a session gone by.
 *  5. THE TWO EMAILS, as their composers write them: every value as text,
 *     no token, no meeting link, no gendered pronoun and no dash; the
 *     incubator's never says "group"; the facilitators' never says where
 *     somebody went.
 *
 * `tests/lib/groupPublishedWorld.mjs` says what is real and what is stubbed.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { walkSource } from "./lib/functionScan.mjs";
import { GROUP, RUN, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

const made = await makeGroupWorld("__groupPublishedMoves");
const { world, reset, steps, ask, enrolmentPath, loadTs } = made;
const enrolments = await loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const movedEmail = await loadTs(join("lib", "courses", "movedEmail.ts"));
const leftEmail = await loadTs(join("lib", "courses", "leftEmail.ts"));
const moveWords = await loadTs(join("lib", "courses", "moveWords.ts"));
const publishWords = await loadTs(join("lib", "courses", "publishWords.ts"));
const timeWords = await loadTs(join("lib", "courses", "timeAnswer", "words.ts"));

beforeEach(() => {
  reset();
});

const seatOf = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, world.db.read(enrolmentPath(uid)));
const addressOf = (uid) => world.db.read(`users/${uid}`).email;
const HOLDERS = ["amara", "dev", "bea", "tariq"];
const GROUPS = [GROUP.monday, GROUP.thursday, GROUP.unset];

// ---------------------------------------------------------------------------
// 1. The tree
// ---------------------------------------------------------------------------

/**
 * Every file that clears Publish's stamp, and why that is never a move of a
 * told seat. Each clears the group it was about in the same write.
 */
const STAMP_CLEARERS = {
  "app/api/courses/runs/[runId]/allocate/route.ts":
    "a move of a seat nobody has told, which has no stamp to keep, and putting back somebody who left, who is told afresh",
  "app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts":
    "Remove takes somebody off the run: a change of status, not a move, and they read nothing of it from then on",
  "app/api/courses/runs/[runId]/enrolments/[uid]/reinstate/route.ts":
    "putting back a seat somebody took for themselves on an open run, which their own choice keeps told",
  "app/api/courses/runs/[runId]/enrol/route.ts":
    "somebody changing the session of a seat they took for themselves: their own choice keeps it told",
  "lib/courses/groupFacilitators.ts":
    "placing a facilitator who holds a place and sits in no group, when nobody has told them: a told seat is kept told",
};

const STAMP_CLEARED = /\ballocatedEmailAt(?:\s*:|\s*=)\s*FieldValue\.delete\(\)/g;
const TOLD_GROUP_CLEARED = /\btoldGroupId(?:\s*:|\s*=)\s*FieldValue\.delete\(\)/g;
const STAMP_WRITTEN = /\ballocatedEmailAt\s*:\s*FieldValue\.serverTimestamp\(\)/g;
const TOLD_GROUP_WRITTEN = /\btoldGroupId\s*:\s*(?!FieldValue\.delete\(\))[\w.]+/g;

describe("1. the tree: the stamp and the group it was about are cleared and written together", () => {
  const files = [...walkSource(SRC)].map((file) => [inSrc(file), stripSource(readFileSync(file, "utf8"))]);

  test("every write that clears the stamp clears the group beside it, and says why it may", () => {
    const clearing = files.filter(([, code]) => [...code.matchAll(STAMP_CLEARED)].length > 0).map(([file]) => file).sort();
    assert.deepEqual(clearing, Object.keys(STAMP_CLEARERS).sort(), "A write clears Publish's stamp and is not listed: say why it never hides somebody told by a move.");
    for (const [file, code] of files) {
      const stamps = [...code.matchAll(STAMP_CLEARED)].length;
      if (stamps === 0) continue;
      assert.equal([...code.matchAll(TOLD_GROUP_CLEARED)].length, stamps, `${file} clears the stamp without the group it was about`);
      assert.ok(STAMP_CLEARERS[file].length >= 40, `${file} needs its reason written down`);
    }
  });

  test("every write of the stamp writes the group it was about beside it", () => {
    const writing = files.filter(([, code]) => [...code.matchAll(STAMP_WRITTEN)].length > 0);
    assert.deepEqual(writing.map(([file]) => file), ["app/api/courses/runs/[runId]/allocation/publish/route.ts"]);
    for (const [file, code] of writing) {
      assert.equal([...code.matchAll(TOLD_GROUP_WRITTEN)].length, [...code.matchAll(STAMP_WRITTEN)].length, `${file} stamps a seat without the group`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Every move of every told seat
// ---------------------------------------------------------------------------

describe("2. a told seat stays told through every move, and is shown where it is", () => {
  test("each person a press told, moved into each other group, then out of every group, then back", async () => {
    await steps.published();
    for (const who of HOLDERS) {
      const toldAbout = seatOf(who).groupId;
      for (const target of [...GROUPS.filter((id) => id !== toldAbout), null, toldAbout]) {
        const moved = await steps.place([{ uid: who, groupId: target }]);
        assert.equal(moved.status, 200, JSON.stringify(moved.body));
        assert.deepEqual(moved.body.rejected, [], `${who} was not moved to ${target}`);
        const seat = seatOf(who);
        assert.equal(seat.groupId, target);
        assert.ok(enrolments.placementIsTold(seat), `${who}, told about ${toldAbout}, is untold after a move to ${target}`);
        assert.equal(enrolments.groupToldAbout(seat), toldAbout, `${who}'s seat forgot the group they were told about`);
        assert.equal(enrolments.movedSinceTold(seat), target !== null && target !== toldAbout);
        // Shown: their member area lists the run, with the group they are in now.
        const hub = await ask.me(who);
        assert.equal(hub.length, 1, `${who} cannot see the run after a move to ${target}`);
      }
    }
    // Back where everybody was told: nothing is owed, and a press sends nothing.
    world.mail.length = 0;
    const summary = await ask.publishSummary();
    assert.deepEqual([summary.emails, summary.moved ?? null], [0, null]);
    await steps.publishes();
    assert.equal(world.mail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. What is owed
// ---------------------------------------------------------------------------

describe("3. what a press owes is worked out from where they are and what they were told", () => {
  test("a seat told before the group was kept has the group it leaves written by its first move", async () => {
    await steps.published();
    // As a seat Publish told before this was kept: no group written beside the stamp.
    const path = enrolmentPath("amara");
    const stored = { ...world.db.read(path) };
    delete stored.toldGroupId;
    world.db.seed(path, stored);
    assert.equal(seatOf("amara").toldGroupId, null);
    assert.equal(enrolments.groupToldAbout(seatOf("amara")), GROUP.thursday, "a seat told before is read as told about its group");
    assert.equal(enrolments.movedSinceTold(seatOf("amara")), false);
    await steps.place([{ uid: "amara", groupId: GROUP.monday }]);
    assert.equal(seatOf("amara").toldGroupId, GROUP.thursday);
    assert.deepEqual((await ask.publishSummary()).moved, [{ name: "Amara", to: "Monday evening", from: "Thursday morning" }]);
    // A second move does not write it again: it is the group they were told about.
    await steps.place([{ uid: "amara", groupId: GROUP.unset }]);
    assert.equal(seatOf("amara").toldGroupId, GROUP.thursday);
  });

  test("a move of a seat nobody has told keeps it untold, and Publish sends its first email about where it is", async () => {
    await steps.placed();
    await steps.place([{ uid: "amara", groupId: GROUP.monday }]);
    assert.equal(enrolments.placementIsTold(seatOf("amara")), false);
    assert.equal(seatOf("amara").toldGroupId, null);
    assert.deepEqual(await ask.me("amara"), []);
    world.mail.length = 0;
    await steps.publishes();
    const toAmara = world.mail.filter((mail) => mail.to === addressOf("amara"));
    assert.deepEqual(toAmara.map((mail) => mail.subject), ["Your AGI Strategy group: Mondays at 6pm"]);
    assert.equal(seatOf("amara").toldGroupId, GROUP.monday);
  });
});

// ---------------------------------------------------------------------------
// 4. Publish and a told seat
// ---------------------------------------------------------------------------

describe("4. Publish never sends its first email to a told seat", () => {
  test("not to one told by its stamp and moved, and not to one told because they chose it", async () => {
    await steps.placed();
    // Amara took her seat for herself: it is told by her choice, with no stamp.
    world.db.poke(enrolmentPath("amara"), { selfEnrolled: true });
    assert.ok(enrolments.placementIsTold(seatOf("amara")));
    world.mail.length = 0;
    await steps.publishes();
    assert.ok(!world.mail.some((mail) => mail.to === addressOf("amara")), "Publish sent its first email to a seat that is told");
    // Dev, told by that press, moved: "You’ve moved" and nothing else.
    await steps.place([{ uid: "dev", groupId: GROUP.thursday }]);
    world.mail.length = 0;
    await steps.publishes();
    const toDev = world.mail.filter((mail) => mail.to === addressOf("dev")).map((mail) => mail.subject);
    assert.deepEqual(toDev, ["You’ve moved to Thursday morning: Thursdays at 10am"]);
  });

  test("“You’ve moved” names the group's next session counted from now, never one gone by", async (t) => {
    // Wed 28 Oct 2026 at noon in London: Monday's group met on Mon 26 Oct,
    // its first session, and meets next on Mon 2 Nov, the run's last.
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-28T12:00:00Z") });
    await steps.published();
    await steps.place([{ uid: "amara", groupId: GROUP.monday }]);
    world.mail.length = 0;
    await steps.publishes();
    const email = world.mail.find((mail) => mail.to === addressOf("amara"));
    const words = (await render(email.react)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.match(words, /You’ll meet on Mondays at 6pm in Room B12, from Mon 2 Nov\./);
    assert.ok(!words.includes("26 Oct"), "the email names a first session gone by");
    // Once the run's last session is behind it, no session is named at all.
    t.mock.timers.setTime(new Date("2026-11-10T12:00:00Z").getTime());
    await steps.place([{ uid: "amara", groupId: GROUP.thursday }]);
    await steps.place([{ uid: "dev", groupId: GROUP.thursday }]);
    world.mail.length = 0;
    await steps.publishes();
    const late = world.mail.find((mail) => mail.to === addressOf("dev"));
    const lateWords = (await render(late.react)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.match(lateWords, /You’ll meet on Thursdays at 10am in Room A3\. /);
  });
});

// ---------------------------------------------------------------------------
// 5. The two emails
// ---------------------------------------------------------------------------

const BASE = {
  name: "Ana Silva",
  incubator: false,
  programmeName: "AGI Strategy",
  groupName: "Group H",
  fromGroupName: "Group D",
  weeklySlot: "Tuesdays at 6pm",
  nextSession: "Tue 10 Nov",
  where: { kind: "room", room: "Hallward B12" },
  sessionMinutes: 120,
  facilitatorFirstNames: ["Raj", "Sofia"],
  campus: null,
  asks: true,
  programmeUrl: "https://naisi.invalid/learn/run-1",
  leadName: "Rahul",
};

/** An email's words as a reader sees them, entities left as the composer wrote them. */
const wordsOfBlocks = (email) =>
  email.blocks
    .map((block) => block.html ?? "")
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NO_DASH = /[\u2013\u2014]/;
const GENDERED = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
/** A reason for a move. The email never gives one: staff move people too, not only when somebody asks. */
const ASKED = /\basked\b|\byour request\b/i;

describe("5. the two emails, as their composers write them", () => {
  test("“You’ve moved”: their new group, when it next meets, where, who facilitates it, what it replaces, and the question", () => {
    const email = movedEmail.composeMovedEmail(BASE);
    assert.equal(email.subject, "You’ve moved to Group H: Tuesdays at 6pm");
    const words = wordsOfBlocks(email);
    for (const sentence of [
      "Hi Ana,",
      "You’re in Group H now.",
      "You’ll meet on Tuesdays at 6pm in Hallward B12, from Tue 10 Nov.",
      "Sessions last 2 hours.",
      "Raj and Sofia are your facilitators.",
      "You’re no longer in Group D, so you don’t need to go to its sessions.",
      timeWords.CARD_TITLE,
      timeWords.ANSWER_YES,
      timeWords.ANSWER_MOST_WEEKS,
      timeWords.ANSWER_CANT,
      "Rahul",
      "AGI Strategy lead, NAISI",
    ]) {
      assert.ok(words.includes(sentence), `it does not say ${JSON.stringify(sentence)}: ${words}`);
    }
    // The question's buttons are its way to the programme page, at the card.
    assert.ok(email.blocks[0].html.includes('href="https://naisi.invalid/learn/run-1#your-group-time"'));
    assert.ok(!/\{[A-Za-z]+\}/.test(`${email.subject} ${words}`));
    assert.ok(!NO_DASH.test(`${email.subject} ${words}`) && !GENDERED.test(words), words);
    // It says they moved, never why.
    assert.ok(!ASKED.test(`${email.subject} ${words}`), words);
  });

  test("“You’ve moved”, with less to say: no next session, no time yet, no facilitator, no lead, no address", () => {
    const sparse = movedEmail.composeMovedEmail({
      ...BASE,
      nextSession: null,
      facilitatorFirstNames: [],
      fromGroupName: null,
      leadName: null,
    });
    const words = wordsOfBlocks(sparse);
    assert.ok(words.includes("You’ll meet on Tuesdays at 6pm in Hallward B12."), words);
    assert.ok(words.includes("You’re no longer in the group you were in before, so you don’t need to go to its sessions."), words);
    assert.ok(!words.includes("facilitator") && words.endsWith("NAISI"), words);
    const untimed = wordsOfBlocks(movedEmail.composeMovedEmail({ ...BASE, weeklySlot: null }));
    assert.ok(untimed.includes("Its day and time aren’t set yet. Your programme page will show them once they are."), untimed);
    assert.equal(movedEmail.composeMovedEmail({ ...BASE, weeklySlot: null }).subject, "You’ve moved to Group H");
    const nowhere = movedEmail.composeMovedEmail({ ...BASE, programmeUrl: null });
    assert.ok(!wordsOfBlocks(nowhere).includes(timeWords.CARD_TITLE) && !nowhere.blocks[0].html.includes("href="));
    // A facilitator sitting in the group they facilitate is not asked, and keeps the way to their programme.
    const facilitating = movedEmail.composeMovedEmail({ ...BASE, asks: false });
    assert.ok(!wordsOfBlocks(facilitating).includes(timeWords.CARD_TITLE));
    assert.ok(facilitating.blocks[0].html.includes("Open your programme"));
  });

  test("“You’ve moved” never carries a meeting link, nor anything typed into a room that could be followed", () => {
    const online = wordsOfBlocks(movedEmail.composeMovedEmail({ ...BASE, where: { kind: "online", linkOnPage: true } }));
    assert.ok(online.includes("You’ll meet on Tuesdays at 6pm online, from Tue 10 Nov."), online);
    assert.ok(online.includes("The link to join is on your programme’s page."), online);
    const typed = movedEmail.composeMovedEmail({ ...BASE, where: { kind: "room", room: "https://meet.example.com/abc" } });
    assert.ok(!JSON.stringify(typed).includes("meet.example.com"), "a link typed into the room was printed");
    assert.ok(wordsOfBlocks(typed).includes("You’ll find where it meets on your programme’s page."));
  });

  test("“You’ve moved” prints every typed value as text", () => {
    const email = movedEmail.composeMovedEmail({
      ...BASE,
      name: "<b>Ana</b>",
      groupName: "Group {groupName} <i>",
      fromGroupName: "D & <script>",
      facilitatorFirstNames: ["{firstName}"],
    });
    const html = email.blocks[0].html;
    assert.ok(!html.includes("<b>Ana") && !html.includes("<i>") && !html.includes("<script>"), html);
    assert.ok(!/\{[A-Za-z]+\}/.test(`${email.subject} ${html}`), `a value reads as a token: ${email.subject} ${html}`);
  });

  test("an incubator's “You’ve moved” never says group, and names nobody who facilitates", () => {
    const email = movedEmail.composeMovedEmail({ ...BASE, incubator: true, programmeName: "Research incubator" });
    assert.equal(email.subject, "Your Research incubator sessions have moved: Tuesdays at 6pm");
    const words = wordsOfBlocks(email);
    assert.ok(!/\bgroups?\b/i.test(`${email.subject} ${words}`), `an incubator's people are told the word: ${words}`);
    assert.ok(!words.includes("Raj"), words);
    assert.ok(words.includes("Your sessions have moved."), words);
    assert.ok(!ASKED.test(`${email.subject} ${words}`), words);
    assert.ok(words.includes("This replaces the time you were told before, so you don’t need to go to those sessions."), words);
  });

  test("“no longer in”: who, how many are in the group now, and never where they went", () => {
    const one = leftEmail.composeLeftEmail({
      firstName: "Raj",
      groupName: "Group D",
      weeklySlot: "Tuesdays at 6pm",
      left: ["Ana"],
      groupSize: 7,
      groupUrl: "https://naisi.invalid/learn/run-1/group/d",
      leadName: "Rahul",
      programmeName: "AGI Strategy",
    });
    assert.equal(one.subject, "Ana is no longer in Group D");
    const words = wordsOfBlocks(one);
    for (const sentence of [
      "Hi Raj,",
      "Ana is no longer in Group D, which meets on Tuesdays at 6pm. There are 7 people in the group now.",
      "Their name is no longer on your group page.",
      "Open your group",
    ]) {
      assert.ok(words.includes(sentence), `it does not say ${JSON.stringify(sentence)}: ${words}`);
    }
    const two = leftEmail.composeLeftEmail({ firstName: "", groupName: "Group D", weeklySlot: null, left: ["Ana", "Raj"], groupSize: 1, groupUrl: null, leadName: null, programmeName: null });
    assert.equal(two.subject, "Ana and Raj are no longer in Group D");
    const twoWords = wordsOfBlocks(two);
    assert.ok(twoWords.startsWith("Hi, Ana and Raj are no longer in Group D. There is 1 person in the group now."), twoWords);
    assert.ok(twoWords.endsWith("NAISI") && !two.blocks[0].html.includes("href="));
    assert.equal(leftEmail.leftGroupSizeSentence(0), "Nobody is in the group now.");
    for (const email of [one, two]) {
      assert.ok(!NO_DASH.test(`${email.subject} ${wordsOfBlocks(email)}`) && !GENDERED.test(wordsOfBlocks(email)));
    }
  });
});

describe("what the pages say about a move", () => {
  test("a move's sentence, by where it put somebody told; and nothing about somebody nobody has told", () => {
    const told = { name: "Raj", toldGroupId: "d", toldGroupName: "Group D" };
    assert.equal(
      moveWords.movedSentence({ ...told, to: { id: "h", name: "Group H" } }),
      "Raj is in Group H now and sees it straight away. The next Publish emails them that they have moved.",
    );
    assert.equal(
      moveWords.movedSentence({ ...told, to: { id: "d", name: "Group D" } }),
      "Raj is back in Group D, the group they were told about, so nobody needs telling.",
    );
    assert.ok(moveWords.movedSentence({ ...told, to: null }).startsWith("Raj is in no group now, and still sees the programme."));
    assert.equal(moveWords.movedSentence({ name: "Raj", toldGroupId: null, toldGroupName: null, to: { id: "h", name: "Group H" } }), null);
    assert.equal(moveWords.movedCardWords("Group D"), "Moved from Group D: emailed at the next Publish");
    assert.equal(moveWords.movedBatchSentence(0, "Group H"), null);
    assert.equal(publishWords.movedPersonWords({ name: "Raj", to: "Group H", from: "Group D" }), "Raj: moved to Group H, was Group D");
  });

  test("Publish's words count and name the moved apart from the people told their group for the first time", () => {
    assert.equal(publishWords.publishAudienceLine(2, 1, 0, 1, 1), "2 people, 1 person moved since they were told, 1 facilitator and 1 facilitator told who is no longer in their group");
    const confirm = publishWords.publishConfirmText({
      runLabel: "Autumn 2026",
      emails: 2,
      people: 0,
      facilitators: 0,
      more: 0,
      noAddress: [],
      emptyGroups: [],
      moved: 1,
      left: 1,
      republish: true,
    });
    assert.ok(confirm.includes("1 email to a person moved since they were told, with their new group and when it next meets"), confirm);
    assert.ok(confirm.includes("1 email to a facilitator naming who is no longer in their group"), confirm);
    const lines = publishWords.publishResultLines({
      people: { sent: 0, held: 0, suppressed: 0 },
      facilitators: { sent: 0, held: 0, suppressed: 0 },
      moved: { sent: 1, held: 0, suppressed: 0 },
      left: { sent: 0, held: 1, suppressed: 0 },
      failed: [],
      noAddress: [],
      alreadyTold: 0,
      more: 0,
    });
    assert.equal(lines[0], "Published. 1 email sent: 1 to people moved since they were told, with their new group.");
    assert.ok(lines.some((line) => line.startsWith("Held, not sent: 1 email")), lines.join(" | "));
    for (const words of [confirm, ...lines, moveWords.MOVED_CARD_WHY, publishWords.MOVED_LEAD]) {
      assert.ok(!NO_DASH.test(words) && !GENDERED.test(words), words);
    }
  });
});
