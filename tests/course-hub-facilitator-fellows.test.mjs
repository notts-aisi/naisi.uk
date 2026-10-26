/**
 * A facilitator who holds a place is one of the run's fellows, in the group
 * they facilitate, and runs its logistics too. Since 26 Oct 2026 the rule
 * that nobody facilitates a programme they take part in (Q21) is lifted, and
 * the hub treats such a person as both, everywhere it used to assume a
 * facilitator is no fellow.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Real: every handler and page model a section loads, the libraries behind
 * them, the access predicates and the email templates. Stubbed: what
 * `tests/lib/handoverWorld.mjs` stubs (the Admin SDK's handle and sentinels,
 * the session, the view-as guard, the mail door that records what it is
 * handed). The world is `tests/lib/facilitatorAskWorld.mjs`'s: AGI Strategy's
 * run with three groups, Claudia its lead, Amara holding a place on it.
 *
 * Callers: an admin (zach), the programme's lead (claudia), the run's track
 * lead (yusuf), a facilitator of another group (tom), a co-facilitator
 * (sofia), the facilitator who holds a place (amara), another member placed
 * on the run (bea), a member on nothing (nobody), and somebody signed out.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join as joinPath } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { stripSource } from "./lib/stripSource.mjs";
import { loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { A, B, C, NOW, RUN, askSeed, loadAskRoutes } from "./lib/facilitatorAskWorld.mjs";

// The push leg of a message to a group is stood in: it buzzes nobody here.
const SRC = joinPath(dirname(fileURLToPath(import.meta.url)), "..", "src");

const made = makeWorld("__facilitatorFellows", [
  ["@/lib/push/noticeNotifications", "export async function sendNoticePush() { return false; }"],
]);
const { world, reset, call, everything } = made;
const routes = await loadAskRoutes(made);
const join = await loadJoin(made);

/** Start from the world at `NOW`, the store's clock and the suite's agreeing. */
function begin(t, over = {}) {
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  reset(askSeed(over), { now: () => new Date() });
}

/** An admin's press of the hand-over: everybody holding an AGI Strategy place onto the run's list. */
async function handOver() {
  const pressed = await join.press("zach");
  assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
}

/** A change of a group's facilitators by hand, as `who`. */
const byHand = (who, groupId, uids) => call(who, routes.byHand.POST, { groupId }, { body: { uids }, course: true });

/** One drag on the board, as `who`. Answers the route's response. */
const drag = (who, uid, groupId) => join.place(who, [{ uid, groupId }]);

/** Somebody's row on the AGI run, and a group, as stored. */
const rowOf = (uid) => world.db.read(`courseEnrolments/${RUN.agi}__${uid}`);
const groupOf = (id) => world.db.read(`courseGroups/${id}`);

// ---- Publish, as the board presses it ----
const summary = async (who = "zach") => (await join.board(who)).body.publish;
const sendTest = (who = "zach") => call(who, join.routes.publishTest.POST, { runId: RUN.agi }, { course: true });
const pressNow = async (who = "zach") =>
  call(who, join.routes.publish.POST, { runId: RUN.agi }, { body: { emails: (await summary(who)).emails }, course: true });
const isTest = (mail) => mail.subject.startsWith("[TEST]");
const realMail = () => world.mail.filter((mail) => !isTest(mail));
const isFacilitating = (mail) => mail.subject.startsWith("You’re facilitating");

/** One sent email as its reader gets it: subject and words. */
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
  return { to: mail.to, subject: mail.subject, text };
}

/** Every email one address was sent by a press, opened, the facilitators' email last. */
async function mailTo(address) {
  const mine = realMail().filter((mail) => mail.to === address);
  return Promise.all([...mine.filter((mail) => !isFacilitating(mail)), ...mine.filter(isFacilitating)].map(opened));
}

const address = (uid) => world.db.read(`users/${uid}`).email;

/**
 * Who a placement email says facilitates the group: "Sofia and Amara", or
 * null when it says nobody. In the board's sentence since October 2026
 * ("Sofia and Amara are your facilitators.", "Sofia is your facilitator.");
 * until then "Your group is facilitated by Sofia and Amara."
 */
const facilitatedBy = (text) => (/([A-Z][^.]*?) (?:is your facilitator|are your facilitators)\./.exec(text) ?? [])[1] ?? null;

/** Where the board shows somebody: the group their card is in, or null for the pool. */
async function onTheBoard(who, uid) {
  const board = await join.board(who);
  assert.equal(board.status, 200, JSON.stringify(board.body));
  return board.body.people.find((row) => row.uid === uid)?.groupId ?? null;
}

/**
 * Amara, made Group A's facilitator before anybody handed Amara over: the
 * appointment had no place to put Amara in, so Amara's row on the run is a
 * facilitator's, in no group. Then the hand-over puts Amara on the run's list.
 */
async function facilitatorBeforeHandOver(t) {
  begin(t);
  const appointed = await byHand("claudia", A, ["sofia", "amara"]);
  assert.deepEqual(appointed, { status: 200, body: { ok: true, facilitatorUids: ["sofia", "amara"] } });
  assert.deepEqual([rowOf("amara").role, rowOf("amara").groupId], ["facilitator", null]);
  await handOver();
}

// ---------------------------------------------------------------------------
// 1. The board
// ---------------------------------------------------------------------------

describe("1. the board places a facilitator who holds a place in the group they facilitate, and no other", () => {
  test("a facilitator's row placed in their group becomes their place: a learner's row, counted, on the group's clock", async (t) => {
    await facilitatorBeforeHandOver(t);
    assert.equal(await onTheBoard("claudia", "amara"), null, "the board showed a facilitator's row in a group");
    const placed = await drag("claudia", "amara", A);
    assert.deepEqual(placed, { status: 200, body: { ok: true, placed: 1, rejected: [] } });
    const row = rowOf("amara");
    assert.deepEqual([row.role, row.status, row.groupId], ["learner", "active", A]);
    assert.equal(row.applicationId, `${RUN.agi}__amara`);
    assert.equal(row.joinedWeekNumber, 1);
    assert.ok(!("putBackAt" in row), "a first place read as somebody put back");
    assert.equal(groupOf(A).memberCount, 1);
    // Still Group A's facilitator: that lives on the group, not on the row.
    assert.deepEqual(groupOf(A).facilitatorUids, ["sofia", "amara"]);
    assert.equal(await onTheBoard("claudia", "amara"), A);
    assert.equal(await onTheBoard("zach", "amara"), A);
  });

  test("the same row as the board's own first placement writes, field for field", async (t) => {
    await facilitatorBeforeHandOver(t);
    await drag("claudia", "amara", A);
    assert.equal((await drag("claudia", "bea", A)).status, 200);
    const amara = rowOf("amara");
    const bea = rowOf("bea");
    for (const field of ["runId", "courseId", "groupId", "status", "role", "joinedWeekNumber"]) {
      assert.deepEqual(amara[field], bea[field], field);
    }
    assert.equal(groupOf(A).memberCount, 2);
  });

  test("a facilitator is not placed in another group, and a refused drag writes nothing", async (t) => {
    await facilitatorBeforeHandOver(t);
    const before = everything();
    const refused = await drag("claudia", "amara", B);
    assert.deepEqual(refused, {
      status: 200,
      body: { ok: true, placed: 0, rejected: [{ uid: "amara", reason: "facilitates-another-group" }] },
    });
    assert.equal(everything(), before);
    // An admin is refused the same way: the rule is the group's, not the caller's.
    assert.deepEqual((await drag("zach", "amara", B)).body.rejected, [{ uid: "amara", reason: "facilitates-another-group" }]);
  });

  test("a fellow who facilitates their group is not moved to another; taken off its facilitators first, they are", async (t) => {
    begin(t);
    await handOver();
    // By hand, after the hand-over: Amara is placed in Group A by the appointment.
    assert.deepEqual((await byHand("claudia", A, ["sofia", "amara"])).body.placed, ["Amara Okafor"]);
    const before = everything();
    assert.deepEqual((await drag("claudia", "amara", B)).body.rejected, [{ uid: "amara", reason: "facilitates-another-group" }]);
    assert.equal(everything(), before);
    // Taking Amara off Group A's facilitators leaves the place; then the board moves Amara.
    assert.equal((await byHand("claudia", A, ["sofia"])).status, 200);
    assert.deepEqual([rowOf("amara").groupId, groupOf(A).memberCount], [A, 1]);
    assert.deepEqual((await drag("claudia", "amara", B)).body, { ok: true, placed: 1, rejected: [] });
    assert.deepEqual([rowOf("amara").groupId, groupOf(A).memberCount, groupOf(B).memberCount], [B, 0, 1]);
  });

  test("a fellow who facilitates their group can be taken out of it to the pool, and only put back in it", async (t) => {
    begin(t);
    await handOver();
    await byHand("claudia", A, ["sofia", "amara"]);
    assert.deepEqual((await drag("claudia", "amara", null)).body, { ok: true, placed: 1, rejected: [] });
    assert.deepEqual([rowOf("amara").groupId, groupOf(A).memberCount], [null, 0]);
    assert.deepEqual((await drag("claudia", "amara", C)).body.rejected, [{ uid: "amara", reason: "facilitates-another-group" }]);
    assert.deepEqual((await drag("claudia", "amara", A)).body, { ok: true, placed: 1, rejected: [] });
    assert.deepEqual([rowOf("amara").role, rowOf("amara").groupId, groupOf(A).memberCount], ["learner", A, 1]);
  });

  test("taking a facilitator's row out of a group is nothing to do: the row is not touched", async (t) => {
    await facilitatorBeforeHandOver(t);
    const before = everything();
    assert.deepEqual((await drag("claudia", "amara", null)).body, { ok: true, placed: 0, rejected: [] });
    assert.equal(everything(), before);
  });

  test("a facilitator's row retired before the hand-over is a first place on the board, not somebody put back", async (t) => {
    await facilitatorBeforeHandOver(t);
    // Taken off Group A's facilitators: the row is retired, and Amara facilitates nothing.
    assert.equal((await byHand("claudia", A, ["sofia"])).status, 200);
    assert.deepEqual([rowOf("amara").role, rowOf("amara").status], ["facilitator", "removed"]);
    assert.deepEqual((await drag("claudia", "amara", B)).body, { ok: true, placed: 1, rejected: [] });
    const row = rowOf("amara");
    assert.deepEqual([row.role, row.status, row.groupId], ["learner", "active", B]);
    assert.ok(!("putBackAt" in row), "a retired facilitator's row read as somebody who left, put back");
    assert.equal(groupOf(B).memberCount, 1);
  });

  test("a facilitator of an archived group sits wherever the board puts them", async (t) => {
    await facilitatorBeforeHandOver(t);
    world.db.poke(`courseGroups/${A}`, { archived: true });
    assert.deepEqual((await drag("claudia", "amara", B)).body, { ok: true, placed: 1, rejected: [] });
    assert.deepEqual([rowOf("amara").role, rowOf("amara").groupId], ["learner", B]);
  });

  test("the board's own rows, through the card's rule, say who facilitates which group, and the card draws it", async (t) => {
    await facilitatorBeforeHandOver(t);
    await drag("claudia", "amara", A);
    const { groups, people } = (await join.board("claudia")).body;
    const fit = await made.lib("..", "features", "courses", "allocationFit.ts");
    assert.equal(people.find((row) => row.uid === "amara")?.groupId, A);
    assert.equal(fit.facilitatedGroupOf("amara", groups)?.id, A);
    assert.equal(fit.facilitatedGroupOf("bea", groups), null, "a card says somebody facilitates who does not");
    assert.equal(fit.facilitatesWords("Group A"), "Facilitates Group A");
    const board = stripSource(readFileSync(joinPath(SRC, "features", "courses", "AllocationBoard.tsx"), "utf8"), { keepStrings: true });
    assert.match(board, /facilitates: facilitatedGroupOf\(row\.uid, \[\.\.\.groupsById\.values\(\)\]\),/);
    assert.match(board, /<Badge tone=\{facts\.group\?\.id === facts\.facilitates\.id \? "neutral" : "warning"\}>\s*\{facilitatesWords\(facts\.facilitates\.name \|\| "a group"\)\}/);
  });

  test("a member, a facilitator, a reviewer and somebody signed out still place nobody", async (t) => {
    await facilitatorBeforeHandOver(t);
    const before = everything();
    for (const [who, status] of [
      ["amara", 403],
      ["tom", 403],
      ["lloyd", 403],
      ["nobody", 403],
      [null, 401],
    ]) {
      assert.equal((await drag(who, "amara", A)).status, status, String(who));
    }
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. Publish's two emails
// ---------------------------------------------------------------------------

describe("2. Publish tells a facilitator who holds a place their group and their facilitating, each email whole and right", () => {
  /**
   * Amara holds a place and facilitates Group A (with Sofia, unless told
   * otherwise); Bea is placed there too, and Dev and Tariq in Group C, so
   * nobody holding a place is left for Publish to wait for.
   */
  async function groupA(t, facilitators = ["sofia", "amara"]) {
    begin(t);
    await handOver();
    assert.deepEqual((await byHand("claudia", A, facilitators)).body.placed, ["Amara Okafor"]);
    const placed = await join.place("zach", [
      { uid: "bea", groupId: A },
      { uid: "dev", groupId: C },
      { uid: "tariq", groupId: C },
    ]);
    assert.equal(placed.body.placed, 3, JSON.stringify(placed.body));
  }

  test("both emails go to them, the count on the button is every email, and the line above it says who", async (t) => {
    await groupA(t);
    const shown = await summary("claudia");
    // Four placed (Amara and Bea in A, Dev and Tariq in C); Sofia and Amara
    // facilitate Group A and Tom Group C. Group B has nobody yet.
    assert.deepEqual([shown.emails, shown.people, shown.facilitators], [7, 4, 3]);
    assert.equal((await sendTest("claudia")).status, 200);
    const pressed = await pressNow("claudia");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    assert.deepEqual(
      realMail().map((mail) => mail.to).sort(),
      ["amara", "amara", "bea", "dev", "tariq", "sofia", "tom"].map(address).sort(),
    );
    assert.ok(rowOf("amara").allocatedEmailAt, "Amara's place was not stamped as told");
  });

  test("their placement email names the group's other facilitators, never themselves", async (t) => {
    await groupA(t);
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    const [placedEmail, facilitating] = await mailTo(address("amara"));
    assert.match(placedEmail.text, /Hi Amara, You’re in Group A\. You’ll meet on Thursdays at 6pm/);
    assert.equal(facilitatedBy(placedEmail.text), "Sofia", "Amara was told wrongly who facilitates Amara's own group");
    assert.equal(facilitating.subject, "You’re facilitating Group A: Thursdays at 6pm");
    assert.ok(facilitating.text.includes("You’re facilitating with Sofia."), facilitating.text);
    // The group's people as the roster shows them: Bea, and Amara too.
    assert.ok(facilitating.text.includes("There are 2 people in the group."), facilitating.text);
    // Everybody else in the group is told both facilitators.
    const [bea] = await mailTo(address("bea"));
    assert.equal(facilitatedBy(bea.text), "Sofia and Amara");
    const [sofia] = await mailTo(address("sofia"));
    assert.ok(sofia.text.includes("You’re facilitating with Amara."), sofia.text);
    assert.ok(sofia.text.includes("There are 2 people in the group."), sofia.text);
  });

  test("facilitating alone, their placement email leaves the facilitators' line out whole", async (t) => {
    await groupA(t, ["amara"]);
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    const [placedEmail, facilitating] = await mailTo(address("amara"));
    assert.equal(facilitatedBy(placedEmail.text), null, placedEmail.text);
    assert.ok(!placedEmail.text.includes("your facilitator"), placedEmail.text);
    // The rest of the email goes: the group and when it meets.
    assert.ok(placedEmail.text.includes("You’re in Group A. You’ll meet on Thursdays at 6pm"), placedEmail.text);
    assert.ok(!facilitating.text.includes("You’re facilitating with"), facilitating.text);
    const [bea] = await mailTo(address("bea"));
    assert.equal(facilitatedBy(bea.text), "Amara");
  });

  test("a second press sends them nothing", async (t) => {
    await groupA(t);
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    const sent = realMail().length;
    assert.deepEqual([(await summary()).emails, (await summary()).people, (await summary()).facilitators], [0, 0, 0]);
    assert.equal(realMail().length, sent);
  });
});

// ---------------------------------------------------------------------------
// 3. Their own coursework
// ---------------------------------------------------------------------------

const work = {
  submit: await made.courseRoute("runs", "[runId]", "exercises", "[exerciseId]", "submit"),
  queue: await made.courseRoute("groups", "[groupId]", "exercises"),
  review: await made.courseRoute("exercise-responses", "[responseId]", "review"),
  summary: await made.courseRoute("groups", "[groupId]", "summary"),
};

/** Week 1, published, with one written exercise. */
const WEEK_ONE = {
  [`courseRuns/${RUN.agi}/weeks/w01`]: {
    weekNumber: 1,
    title: "Week 1 readings",
    summary: "",
    published: true,
    materials: [],
    checklist: [],
    exercises: [{ id: "x1", prompt: "What is week 1 about?", responseType: "text", required: false, maxLength: 2000, peerVisible: false }],
  },
};

/** The review queue for one group's week 1, as `who` reads it (the route takes the week from its address). */
async function queueAs(who, groupId) {
  world.user = made.sessionOf(who);
  world.course = true;
  try {
    const response = await work.queue.GET(new Request("https://naisi.invalid/api?week=1"), { params: Promise.resolve({ groupId }) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    world.course = false;
  }
}

/** The uids of the people a queue lists. */
const queued = (answer) => answer.body.rows.map((row) => row.uid).sort();

const answerId = (uid) => `${RUN.agi}__${uid}__w01__x1`;
const review = (who, uid, reviewStatus = "approved") =>
  call(who, work.review.POST, { responseId: answerId(uid) }, { body: { reviewStatus, reviewerComment: "Good." }, course: true });

describe("3. a facilitator who holds a place does the coursework, and their own answers are the programme's lead's and admins' to read and review", () => {
  /**
   * Group A after Publish: Amara (who holds a place) and Sofia facilitate it,
   * Amara and Bea are in it, and both have sent week 1's answer.
   */
  async function sentAnswers(t) {
    begin(t, WEEK_ONE);
    await handOver();
    assert.deepEqual((await byHand("claudia", A, ["sofia", "amara"])).body.placed, ["Amara Okafor"]);
    assert.equal((await join.place("zach", [
      { uid: "bea", groupId: A },
      { uid: "dev", groupId: C },
      { uid: "tariq", groupId: C },
    ])).body.placed, 3);
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    for (const uid of ["amara", "bea"]) {
      const sent = await call(uid, work.submit.POST, { runId: RUN.agi, exerciseId: "x1" }, {
        body: { weekId: "w01", text: `${uid}'s answer to week 1.`, submit: true },
        course: true,
      });
      assert.equal(sent.status, 200, `${uid}: ${JSON.stringify(sent.body)}`);
    }
  }

  test("they send their own answers, as everybody in the group does", async (t) => {
    await sentAnswers(t);
    assert.equal(world.db.read(`courseExerciseResponses/${answerId("amara")}`).text, "amara's answer to week 1.");
  });

  test("the review queue lists them to an admin, and to none of the group's facilitators, themselves included", async (t) => {
    await sentAnswers(t);
    assert.deepEqual(queued(await queueAs("zach", A)), ["amara", "bea"]);
    for (const who of ["sofia", "amara"]) {
      const answer = await queueAs(who, A);
      assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
      assert.deepEqual(queued(answer), ["bea"], who);
      assert.ok(!JSON.stringify(answer.body).includes("amara's answer"), `${who} was shown Amara's own answer`);
    }
    // The queue asks the one rule for a facilitator's own work: the
    // programme's lead, when they facilitate the group too, is listed Amara's.
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "amara", "claudia"] });
    assert.deepEqual(queued(await queueAs("claudia", A)), ["amara", "bea"]);
    assert.deepEqual(queued(await queueAs("sofia", A)), ["bea"]);
  });

  test("the programme's lead and an admin review their answer; a co-facilitator and they themselves are refused, and nothing is written", async (t) => {
    await sentAnswers(t);
    const before = everything();
    for (const who of ["sofia", "amara"]) {
      assert.deepEqual(await review(who, "amara"), { status: 403, body: { error: "Forbidden" } }, who);
    }
    assert.equal(everything(), before);
    // Zach's decision (Mon 26 Oct): a facilitator's own work is read by the
    // programme's lead and admins. The lead's verdict is stored as theirs.
    assert.equal((await review("claudia", "amara", "needs-work")).status, 200);
    assert.deepEqual(
      [world.db.read(`courseExerciseResponses/${answerId("amara")}`).reviewStatus, world.db.read(`courseExerciseResponses/${answerId("amara")}`).reviewerUid],
      ["needs-work", "claudia"],
    );
    assert.equal((await review("zach", "amara")).status, 200);
    assert.equal(world.db.read(`courseExerciseResponses/${answerId("amara")}`).reviewStatus, "approved");
    // The lead is let in for a facilitator's own work alone: a fellow's
    // answer is still the group's facilitators' and admins', as before.
    const beforeBea = everything();
    assert.deepEqual(await review("claudia", "bea"), { status: 403, body: { error: "Forbidden" } });
    assert.equal(everything(), beforeBea);
    // Bea's answer is still the group's facilitators' to review, Amara's among them.
    assert.equal((await review("amara", "bea")).status, 200);
    assert.equal(world.db.read(`courseExerciseResponses/${answerId("bea")}`).reviewerUid, "amara");
  });

  test("the group page counts their answer as waiting for the programme's lead and admins only", async (t) => {
    await sentAnswers(t);
    const asFacilitator = await call("sofia", work.summary.GET, { groupId: A }, { course: true });
    assert.equal(asFacilitator.status, 200, JSON.stringify(asFacilitator.body));
    assert.equal(asFacilitator.body.toReview, 1, "Sofia's page counts Amara's own answer");
    const asTheFellow = await call("amara", work.summary.GET, { groupId: A }, { course: true });
    assert.equal(asTheFellow.body.toReview, 1, "Amara's page counts Amara's own answer");
    // The programme's lead, facilitating the group too, counts it: the same rule.
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "amara", "claudia"] });
    assert.equal((await call("claudia", work.summary.GET, { groupId: A }, { course: true })).body.toReview, 2);
    assert.equal((await call("sofia", work.summary.GET, { groupId: A }, { course: true })).body.toReview, 1);
  });

  test("a member of the group, another group's facilitator, the run's track lead and somebody signed out read and review none of it", async (t) => {
    await sentAnswers(t);
    const before = everything();
    for (const [who, status] of [
      ["bea", 403],
      ["tom", 403],
      ["yusuf", 403],
      [null, 401],
    ]) {
      assert.equal((await queueAs(who, A)).status, status, String(who));
      assert.equal((await review(who, "amara")).status, status, String(who));
    }
    assert.equal(everything(), before);
    // The programme's lead reviews a facilitator's own answer (above), and
    // still has no door to the group's queue, which is its facilitators' and
    // admins'.
    assert.equal((await queueAs("claudia", A)).status, 403);
  });
});

// ---------------------------------------------------------------------------
// 4. The register, and who finished
// ---------------------------------------------------------------------------

const registerRoute = await made.courseRoute("groups", "[groupId]", "attendance");

/** The register for one group's week, as `who` reads it (the route takes the week from its address). */
async function registerAs(who, groupId, week = 1) {
  world.user = made.sessionOf(who);
  world.course = true;
  try {
    const response = await registerRoute.GET(new Request(`https://naisi.invalid/api?week=${week}`), { params: Promise.resolve({ groupId }) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    world.course = false;
  }
}
const mark = (who, groupId, marks, week = 1) =>
  call(who, registerRoute.POST, { groupId }, { body: { weekNumber: week, marks }, course: true });
/** One group's register for one week, as stored, or undefined. */
const registerFor = (groupId, week = 1) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAttendance/"))
    .map((path) => world.db.read(path))
    .find((doc) => doc.groupId === groupId && doc.weekNumber === week);

describe("4. a facilitator who holds a place is on their group's register, and marked like anybody on it", () => {
  /** Group A after Publish, and its first session (Thu 29 Oct at 6pm) over. */
  async function afterTheFirstSession(t) {
    begin(t);
    await handOver();
    await byHand("claudia", A, ["sofia", "amara"]);
    assert.equal((await join.place("zach", [
      { uid: "bea", groupId: A },
      { uid: "dev", groupId: C },
      { uid: "tariq", groupId: C },
    ])).body.placed, 3);
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    t.mock.timers.setTime(new Date("2026-10-29T20:30:00Z").getTime());
  }

  test("the register lists them with the group's other people, to its facilitators and to the lead", async (t) => {
    await afterTheFirstSession(t);
    for (const who of ["sofia", "amara", "claudia"]) {
      const read = await registerAs(who, A);
      assert.equal(read.status, 200, `${who}: ${JSON.stringify(read.body)}`);
      assert.deepEqual(read.body.members.map((member) => member.uid).sort(), ["amara", "bea"], who);
    }
  });

  test("whoever takes the register marks them: a co-facilitator, or they themselves while they run the session", async (t) => {
    await afterTheFirstSession(t);
    const bySofia = await mark("sofia", A, [{ uid: "amara", status: "present" }, { uid: "bea", status: "late" }]);
    assert.equal(bySofia.status, 200, JSON.stringify(bySofia.body));
    assert.deepEqual(registerFor(A)?.records, { amara: "present", bea: "late" });
    const byThemselves = await mark("amara", A, [{ uid: "amara", status: "left-early" }]);
    assert.equal(byThemselves.status, 200, JSON.stringify(byThemselves.body));
    assert.deepEqual(registerFor(A)?.records, { amara: "left-early", bea: "late" });
    // The lead reads every register and marks none.
    assert.equal((await mark("claudia", A, [{ uid: "amara", status: "absent" }])).status, 403);
  });
});

// ---------------------------------------------------------------------------
// 5. Writing to the group
// ---------------------------------------------------------------------------

const groupEmailRoute = await made.courseRoute("groups", "[groupId]", "email");
const groupNoticeRoute = await made.courseRoute("groups", "[groupId]", "notice");

describe("5. a facilitator who holds a place writes to the group's other people, and is never sent their own message", () => {
  /** Group A after Publish: Amara (who holds a place) and Sofia facilitate it, Amara and Bea are in it. */
  async function afterPublish(t) {
    begin(t);
    await handOver();
    await byHand("claudia", A, ["sofia", "amara"]);
    assert.equal((await join.place("zach", [
      { uid: "bea", groupId: A },
      { uid: "dev", groupId: C },
      { uid: "tariq", groupId: C },
    ])).body.placed, 3);
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    world.mail.length = 0;
  }

  test("the group email reaches everybody in the group but its writer", async (t) => {
    await afterPublish(t);
    const byAmara = await call("amara", groupEmailRoute.POST, { groupId: A }, {
      body: { subject: "Room change", body: "We are in B5 this week.", testOnly: false },
      course: true,
    });
    assert.equal(byAmara.status, 200, JSON.stringify(byAmara.body));
    assert.equal(byAmara.body.sent, 1);
    assert.deepEqual(world.mail.map((mail) => mail.to), [address("bea")]);
    world.mail.length = 0;
    const bySofia = await call("sofia", groupEmailRoute.POST, { groupId: A }, {
      body: { subject: "See you Thursday", body: "Bring the week 1 reading.", testOnly: false },
      course: true,
    });
    assert.equal(bySofia.status, 200, JSON.stringify(bySofia.body));
    assert.deepEqual(world.mail.map((mail) => mail.to).sort(), [address("amara"), address("bea")].sort());
  });

  test("a notice to the group reaches everybody in it but its writer", async (t) => {
    await afterPublish(t);
    const sent = await call("amara", groupNoticeRoute.POST, { groupId: A }, { body: { message: "No session this Thursday." }, course: true });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(world.mail.map((mail) => mail.to), [address("bea")]);
  });
});
