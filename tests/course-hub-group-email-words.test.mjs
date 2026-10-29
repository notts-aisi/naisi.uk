/**
 * The email that tells somebody their group, in the board's words (st-emails,
 * "Your AGI Strategy group: Tuesdays at 6pm"), with every value from a record.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST  /api/courses/runs/[runId]/allocation/publish/test
 *   POST  /api/courses/runs/[runId]/allocation/publish
 *
 * ## What this guards
 *
 *  1. THE BOARD'S EMAIL, WORD FOR WORD, from the records Publish reads: the
 *     programme's short name and the group's weekly time in the subject; the
 *     group, its room, the day it meets from and how long its sessions last;
 *     its facilitators by first name and how many are in it; how long week 1
 *     takes; the button to the programme's page; the lead who signs it. The
 *     test a lead sends themselves is the same words.
 *  2. WEEK 1'S TIME, THROUGH ONE FUNCTION (`weekReadingTime`): a week written
 *     in blocks by its This week's "In all", a week written before blocks by
 *     its materials' own minutes, and a group's own copy of week 1 before the
 *     run's. Nothing for a week that is not published, a block week with no
 *     "In all", a week whose materials carry no minutes, no week 1, or a
 *     group that has already met: the sentence goes whole.
 *  3. A SENTENCE WHOSE VALUE HAS NO RECORD GOES, AND NOTHING ELSE: no room,
 *     online, no facilitator, one or two, a group of one, no lead standing
 *     (NAISI signs it), the length the group's own.
 *  4. THE DAY IT MEETS FROM IS THE GROUP'S: somebody told after the group
 *     first met is told its next session, as the facilitators' email says.
 *  5. "Have a look before ..." names the day within the coming week, and the
 *     date on the day itself and further off.
 *
 * Who is sent what, and the count, are Publish's and are held in
 * tests/course-hub-publish-routes.test.mjs; this suite reads the words.
 *
 * Built on `tests/lib/handoverWorld.mjs`: the real handlers, the term's form
 * (AGI Strategy names the run and Claudia leads it).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { GROUP, RUN, AGI, ROUND, groupDoc, loadJoin, makeWorld, namedSeed } from "./lib/handoverWorld.mjs";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { syntheticWeekBlocks } from "./lib/weekBlocksFixture.mjs";

const made = makeWorld("__hubGroupEmail");
const { world, reset, call, lib } = made;
const join_ = await loadJoin(made);
const { routes, press, board, place } = join_;
const plan = await lib("courses", "allocationPublish.ts");
const weekTime = await lib("courses", "weekTime.ts");

// Wed 28 Oct 2026, 5:41pm in London: when groups go out on the board.
const NOW = new Date("2026-10-28T17:41:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const LINK = "https://meet.example/j/8675309?pwd=opensesame";

/** Six taught weeks from Thu 29 Oct: a Tuesday group meets from Tue 3 Nov to Tue 8 Dec. */
const SIX_WEEKS = Array.from({ length: 6 }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: `w0${i + 1}` }));

const slot = (over) => ({ weekday: 2, startTimeLocal: "18:00", durationMinutes: 120, location: "Hallward B12", meetingUrl: null, notes: "", ...over });

/** Week 1 written in blocks, its This week's "In all" being `total`. */
function blockWeekOne(total, over = {}) {
  const blocks = syntheticWeekBlocks().map((block) => (block.type === "thisWeek" ? { ...block, total } : block));
  return {
    weekNumber: 1,
    title: "What’s coming",
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks,
    ...over,
  };
}

/** Week 1 written before blocks, with these materials. */
function legacyWeekOne(materials, over = {}) {
  return {
    weekNumber: 1,
    title: "What’s coming",
    summary: "",
    guideBlocks: [],
    materials,
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    ...over,
  };
}

const RUN_WEEK_ONE = `courseRuns/${RUN.agi}/weeks/w01`;
const B = GROUP.monday;
const A = GROUP.thursday;
const C = GROUP.unset;

/**
 * The term after the hand-over, with the AGI run as the board draws it:
 * Group B on Tuesdays at 6pm in Hallward B12 with Rahul and Sofia, Group A
 * on Thursdays at 6pm in Portland A13 with Sofia, Group C online on
 * Wednesdays at 1pm with Tom, and week 1 written in blocks, "In all: About
 * 80 minutes", as dev's courses are.
 */
function hubSeed(over = {}) {
  const seed = namedSeed();
  for (const [uid, name] of [["rahul", "Rahul Mehta"], ["sofia", "Sofia Rossi"], ["tom", "Tom Fletcher"]]) {
    seed[`users/${uid}`] = userDoc(session(uid, "member", false, name));
  }
  seed[`courseRuns/${RUN.agi}`] = { ...seed[`courseRuns/${RUN.agi}`], startDate: "2026-10-29", weekPlan: SIX_WEEKS };
  seed[`courseGroups/${B}`] = groupDoc({ name: "Group B", facilitatorUids: ["rahul", "sofia"], session: slot() });
  seed[`courseGroups/${A}`] = groupDoc({ name: "Group A", facilitatorUids: ["sofia"], session: slot({ weekday: 4, location: "Portland A13" }) });
  seed[`courseGroups/${C}`] = groupDoc({
    name: "Group C",
    facilitatorUids: ["tom"],
    session: slot({ weekday: 3, startTimeLocal: "13:00", location: "", meetingUrl: LINK }),
  });
  seed[RUN_WEEK_ONE] = blockWeekOne("About 80 minutes");
  return { ...seed, ...over };
}

const summary = async () => (await board("zach")).body.publish;
const sendTest = () => call("zach", routes.publishTest.POST, { runId: RUN.agi }, { course: true });
/**
 * A press with the number the board shows, after choosing "Send without a
 * note" for anybody placed outside the times they gave, as Publish's own page
 * asks first, so the emails read here are the standard ones.
 */
const pressNow = async () => {
  await join_.withoutNotes();
  return call("zach", routes.publish.POST, { runId: RUN.agi }, { body: { emails: (await summary()).emails }, course: true });
};

const isTest = (mail) => mail.subject.startsWith("[TEST]");
const isFacilitating = (mail) => mail.subject.replace("[TEST] ", "").startsWith("You’re facilitating");

/** One sent email as its reader gets it. */
async function opened(mail) {
  const html = await render(mail.react);
  const text = html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { to: mail.to, subject: mail.subject, html, text };
}

/** What one person's group email says, from its greeting to its sign-off. */
async function saidTo(uid) {
  const found = world.mail.filter((mail) => !isTest(mail) && !isFacilitating(mail) && mail.to === `${uid}@example.com`);
  assert.equal(found.length, 1, `${uid} was sent ${found.length} group emails`);
  const mail = await opened(found[0]);
  const from = mail.text.indexOf(`Hi `);
  const footer = mail.text.indexOf("Nottingham AI Safety Initiative · University of Nottingham");
  assert.ok(from !== -1 && footer > from, mail.text);
  return { subject: mail.subject, words: mail.text.slice(from, footer).trim(), html: mail.html };
}

/** Everybody holding a place, put in a group: Amara and Dev in B, Bea and Tariq in A. */
async function placeEverybody(groups = { amara: B, dev: B, bea: A, tariq: A }) {
  await press();
  const done = await place(
    "zach",
    Object.entries(groups).map(([uid, groupId]) => ({ uid, groupId })),
  );
  assert.equal(done.body.placed, Object.keys(groups).length, JSON.stringify(done.body));
}

async function publish() {
  const tested = await sendTest();
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  const pressed = await pressNow();
  assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
  return pressed;
}

/** Amara's email in Group B, as the board draws it, with what each case changes. */
const AMARA =
  "Hi Amara, You’re in Group B. You’ll meet on Tuesdays at 6pm in Hallward B12, starting Tue 3 Nov. Sessions last 2 hours. " +
  "Rahul and Sofia are your facilitators. There are 2 of you. " +
  "Week 1’s reading takes about 80 minutes. Have a look before Tuesday. " +
  "Open your programme Claudia AGI Strategy lead, NAISI";

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(hubSeed(), { now: () => new Date() });
});

// ---------------------------------------------------------------------------
// 1. The board's email
// ---------------------------------------------------------------------------

describe("1. the board's email, from the records", () => {
  test("every sentence of it, the subject and the button, and the test is the same words", async () => {
    await placeEverybody();
    const tested = await sendTest();
    assert.equal(tested.status, 200, JSON.stringify(tested.body));
    const test = await opened(world.mail.find((mail) => isTest(mail) && !isFacilitating(mail)));
    assert.equal(test.subject, "[TEST] Your AGI Strategy group: Tuesdays at 6pm");
    await pressNow();
    const amara = await saidTo("amara");
    assert.equal(amara.subject, "Your AGI Strategy group: Tuesdays at 6pm");
    assert.equal(amara.words, AMARA);
    assert.ok(test.text.includes(AMARA), "the test is not the words Publish sends");
    // One link: the person's own programme page. Never a meeting link.
    assert.deepEqual([...amara.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]), [`https://naisi.invalid/learn/${RUN.agi}`]);
    assert.ok(!amara.html.includes("meet.example"));
  });

  test("each person's own group: Group A's people are told Group A's room, day, facilitator and size", async () => {
    await placeEverybody();
    await publish();
    assert.equal(
      (await saidTo("bea")).words,
      "Hi Bea, You’re in Group A. You’ll meet on Thursdays at 6pm in Portland A13, starting Thu 29 Oct. Sessions last 2 hours. " +
        "Sofia is your facilitator. There are 2 of you. Week 1’s reading takes about 80 minutes. Have a look before Thursday. " +
        "Open your programme Claudia AGI Strategy lead, NAISI",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Week 1's time
// ---------------------------------------------------------------------------

describe("2. week 1's time, through one function", () => {
  test("a week written before blocks is timed by its materials' own minutes, the optional ones left out", async () => {
    reset(
      hubSeed({
        [RUN_WEEK_ONE]: legacyWeekOne([
          { id: "m1", type: "reading", title: "Gates", url: "https://example.com/gates", estimatedMinutes: 30 },
          { id: "m2", type: "link", title: "AI 2027", url: "https://example.com/ai-2027", estimatedMinutes: 45 },
          { id: "m3", type: "reading", title: "More", url: "https://example.com/more", estimatedMinutes: 20, optional: true },
          { id: "m4", type: "note", title: "A note", body: "Read in order." },
        ]),
      }),
      { now: () => new Date() },
    );
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace("about 80 minutes", "about 75 minutes"));
  });

  test("an In all that is a range, or opens with a figure, is said as its lead wrote it", async () => {
    reset(hubSeed({ [RUN_WEEK_ONE]: blockWeekOne("2 to 3 hours") }), { now: () => new Date() });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace("about 80 minutes", "2 to 3 hours"));
  });

  test("a group's own copy of week 1 is the one its people are told about", async () => {
    reset(hubSeed({ [`courseGroups/${B}/weeks/w01`]: blockWeekOne("About 2¼ hours") }), { now: () => new Date() });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace("about 80 minutes", "about 2¼ hours"));
    assert.ok((await saidTo("bea")).words.includes("Week 1’s reading takes about 80 minutes. Have a look before Thursday."));
  });

  test("not published, no In all, no minutes, or no week 1 at all: the sentence goes whole, and nothing else", async () => {
    const WITHOUT = AMARA.replace(" Week 1’s reading takes about 80 minutes. Have a look before Tuesday.", "");
    for (const [label, weekOne] of [
      ["not published", blockWeekOne("About 80 minutes", { published: false })],
      ["no In all", blockWeekOne("")],
      ["no minutes", legacyWeekOne([{ id: "m1", type: "reading", title: "Gates", url: "https://example.com/gates" }])],
      ["no week 1", undefined],
    ]) {
      const seed = hubSeed();
      if (weekOne) seed[RUN_WEEK_ONE] = weekOne;
      else delete seed[RUN_WEEK_ONE];
      reset(seed, { now: () => new Date() });
      await placeEverybody();
      await publish();
      assert.equal((await saidTo("amara")).words, WITHOUT, label);
    }
  });

  test("the one function, for both shapes of week", () => {
    assert.equal(weekTime.weekReadingTime(blockWeekOne("About 80 minutes")), "about 80 minutes");
    assert.equal(weekTime.weekReadingTime(blockWeekOne("  Nearly 2 hours ")), "nearly 2 hours");
    assert.equal(weekTime.weekReadingTime(blockWeekOne("2 to 3 hours")), "2 to 3 hours");
    // A capital that is not a word's first letter in small letters is a name or an initial: left as written.
    assert.equal(weekTime.weekReadingTime(blockWeekOne("AI time: an hour")), "AI time: an hour");
    assert.equal(weekTime.weekReadingTime(blockWeekOne("About 80 minutes", { published: false })), null);
    assert.equal(weekTime.weekReadingTime(blockWeekOne("   ")), null);
    const minutes = (list) => legacyWeekOne(list.map((estimatedMinutes, i) => ({ id: `m${i}`, type: "reading", title: "R", url: "https://example.com/r", estimatedMinutes })));
    assert.equal(weekTime.weekReadingTime(minutes([30, 45])), "about 75 minutes");
    assert.equal(weekTime.weekReadingTime(minutes([])), null);
    assert.equal(weekTime.weekReadingTime(null), null);
    assert.equal(weekTime.weekReadingTime(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// 3. A sentence whose value has no record goes, and nothing else
// ---------------------------------------------------------------------------

describe("3. what a group lacks is left out, and nothing else", () => {
  test("no room yet: the sentence names no place", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.location": "" });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace(" in Hallward B12,", ","));
  });

  test("online: it says so, and where the link is, never the link", async () => {
    await placeEverybody({ amara: C, dev: B, bea: A, tariq: A });
    await publish();
    const amara = await saidTo("amara");
    assert.equal(
      amara.words,
      "Hi Amara, You’re in Group C. You’ll meet on Wednesdays at 1pm online, starting Wed 4 Nov. Sessions last 2 hours. " +
        "The link to join is on your programme’s page. Tom is your facilitator. " +
        "Week 1’s reading takes about 80 minutes. Have a look before Wed 4 Nov. Open your programme Claudia AGI Strategy lead, NAISI",
    );
    assert.ok(!amara.html.includes("meet.example"));
  });

  test("one facilitator, two, or none", async () => {
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: [] });
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul"] });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace("Rahul and Sofia are your facilitators.", "Rahul is your facilitator."));
    const bea = (await saidTo("bea")).words;
    assert.ok(bea.includes("Sessions last 2 hours. There are 2 of you. Week 1"), bea);
    assert.ok(!bea.includes("facilitator"), bea);
  });

  test("a group of one has no sentence for its size", async () => {
    await placeEverybody({ amara: B, dev: A, bea: A, tariq: A });
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace(" There are 2 of you.", ""));
    assert.ok((await saidTo("dev")).words.includes("Sofia is your facilitator. There are 3 of you."));
  });

  test("somebody the press cannot write to is not counted, as their roster does not show them", async () => {
    world.db.poke("users/dev", { email: "" });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace(" There are 2 of you.", ""));
  });

  // The sentence says when and where the group meets each week, as the
  // facilitators' email and the programme page's own line do: one week's
  // change of room is shown on the person's page for that week, and is not
  // the group's room.
  test("the room is the group's own, not one week's change of it", async () => {
    world.db.poke(`courseGroups/${B}`, { sessionOverrides: { w01: { location: "Portland A13" } } });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA);
  });

  test("the length is the group's own", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.durationMinutes": 90 });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace("Sessions last 2 hours.", "Sessions last 90 minutes."));
  });

  test("with no lead standing to sign it, NAISI signs it", async () => {
    world.db.poke("users/claudia", { role: "member", suRecognised: false });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace("Claudia AGI Strategy lead, NAISI", "NAISI"));
  });

  test("with no lead named on the programme, NAISI signs it", async () => {
    const seed = hubSeed();
    seed[`admissionRounds/${ROUND}`].programmes[AGI].leadUid = null;
    reset(seed, { now: () => new Date() });
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace("Claudia AGI Strategy lead, NAISI", "NAISI"));
  });
});

// ---------------------------------------------------------------------------
// 4. The day it meets from is the group's
// ---------------------------------------------------------------------------

describe("4. somebody told after the group first met", () => {
  test("is told its next session, and nothing of week 1, which is behind them", async (t) => {
    t.after(() => mock.timers.setTime(NOW.getTime()));
    await placeEverybody();
    await publish();
    // Group A met on Thu 29 Oct. The next morning Amara is moved into it, and
    // the press tells her, and only her, her new group.
    mock.timers.setTime(new Date("2026-10-30T09:00:00Z").getTime());
    const moved = await place("zach", [{ uid: "amara", groupId: A }]);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const before = world.mail.length;
    const pressed = await pressNow();
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    // Since 29 October 2026 Sofia, told about Group A already, is also told
    // that Amara has joined it: a facilitator's email, not a group's.
    const joined = world.mail.slice(before).filter((mail) => mail.subject === "Amara has joined Group A");
    assert.deepEqual(joined.map((mail) => mail.to), ["sofia@example.com"]);
    const told = world.mail.slice(before).filter((mail) => !isFacilitating(mail) && !joined.includes(mail));
    assert.deepEqual(told.map((mail) => mail.to), ["amara@example.com"]);
    const amara = await opened(told[0]);
    assert.ok(
      amara.text.includes(
        "Hi Amara, You’re in Group A. You’ll meet on Thursdays at 6pm in Portland A13, starting Thu 5 Nov. Sessions last 2 hours. " +
          "Sofia is your facilitator. There are 3 of you. Open your programme Claudia AGI Strategy lead, NAISI",
      ),
      amara.text,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. "Have a look before ..."
// ---------------------------------------------------------------------------

describe("5. the day before which to have a look", () => {
  test("its name within the coming six days, its date on the day itself and further off", () => {
    const tue = "2026-11-03";
    assert.equal(plan.sessionDayWords(tue, new Date("2026-10-28T17:41:00Z")), "Tuesday");
    assert.equal(plan.sessionDayWords(tue, new Date("2026-11-02T23:30:00Z")), "Tuesday");
    assert.equal(plan.sessionDayWords(tue, new Date("2026-10-27T17:38:00Z")), "Tue 3 Nov");
    assert.equal(plan.sessionDayWords(tue, new Date("2026-11-03T09:00:00Z")), "Tue 3 Nov");
    assert.equal(plan.sessionDayWords("not a date", NOW), null);
  });

  test("a week ahead, the email says the date", async (t) => {
    t.after(() => mock.timers.setTime(NOW.getTime()));
    mock.timers.setTime(new Date("2026-10-27T17:38:00Z").getTime());
    await placeEverybody();
    await publish();
    assert.equal((await saidTo("amara")).words, AMARA.replace("Have a look before Tuesday.", "Have a look before Tue 3 Nov."));
  });
});
