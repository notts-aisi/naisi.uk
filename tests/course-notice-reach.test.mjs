/**
 * WHO A NOTICE TO A COURSE RUN REACHES, executed on one run.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * A notice reaches everybody holding a place on the run whose group has gone
 * out, whatever they unsubscribed from. Unsubscribing from a run's emails
 * takes somebody off its cohort list, and that stops the run's OPTIONAL mail
 * (the announcement lane, the weekly nudge, next week's email) and nothing
 * else (`resolveNoticeAudience` in `src/lib/email/courseFacilitatorEmails.ts`;
 * docs/notifications.md, "Who a notice to a course run reaches").
 *
 * ## The run
 *
 * `tests/lib/updatesWorld.mjs`'s AGI Strategy run, whose people cover every
 * case on one fixture: `ines` is placed in Group B, told, and unsubscribed
 * from the run's cohort list; `amara` (Group B), `bea` (Group A) and `tariq`
 * (Group C) are told and on it; `dev` is placed in Group B and not told yet;
 * `nina` left; `omar`'s address is on the do-not-email list; Rahul, Sofia and
 * Tom facilitate and hold no place.
 *
 * ## What is executed
 *
 *  1. The run composer's two lanes, through the real route: the notice
 *     reaches ines, at the address her cohort row holds, and the announcement
 *     does not.
 *  2. An update to everyone and to Group B, through the real route: both
 *     reach ines.
 *  3. The weekly nudge, through the real route, and next week's email at the
 *     audience its source asks for: neither reaches ines.
 *  4. Nobody who left, nobody not yet told, no facilitator holding no place
 *     and no stopped address is reached by any of them.
 *  5. The cap: past 200 people in scope a notice is refused whole, and nothing
 *     is sent.
 *
 * Real: the routes, the audiences, the subscription and suppression readers,
 * the caps, the notice door and the templates. Stubbed: what the updates
 * world stubs (the session, the view-as guard, `sendEmail`, which records
 * what it was handed) and the notice push door, which records a notification
 * and sends none.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { A, B, C, CHANNEL, RUN, enrolmentPath, makeUpdatesWorld, updatesSeed } from "./lib/updatesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const source = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

// The announcement lane signs an unsubscribe link for each recipient.
process.env.EVENTS_TOKEN_SECRET ??= "a-test-signing-key-that-is-long-enough-to-pass";

const KEY = "__courseNoticeReach";
const w = await makeUpdatesWorld(KEY, [
  // The notice push door, by the name the run composer imports it: it writes
  // down who would be notified and answers as a device that took it.
  [
    "@/lib/push/noticeNotifications",
    "export async function sendNoticePush(uid, note) {\n" +
      `  globalThis[${JSON.stringify(KEY)}].pushes.push({ uid, ...note });\n` +
      "  return true;\n" +
      "}",
  ],
]);
const { world, press, call } = w;
const runEmail = await w.courseRoute("runs", "[runId]", "email");
const nudge = await w.courseRoute("runs", "[runId]", "nudge");
const staffEmails = await w.loadTs(join("lib", "email", "courseFacilitatorEmails.ts"));

/** The address on ines's cohort row: not her account's, so the test can tell which was used. */
const INES_LISTED_ADDRESS = "ines.course@example.com";

/** A London date key `days` before today, so the run is always in its first week. */
function daysAgo(days) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
    new Date(Date.now() - days * 86_400_000),
  );
}

/**
 * The updates world, running: started three days ago with week 1 published,
 * so the weekly nudge has a week to be about. Ines's cohort row keeps an
 * address of its own.
 */
function runningSeed() {
  const seed = updatesSeed();
  seed[`courseRuns/${RUN.agi}`] = { ...seed[`courseRuns/${RUN.agi}`], status: "running", startDate: daysAgo(3) };
  seed[`courseRuns/${RUN.agi}/weeks/w01`] = {
    weekNumber: 1,
    title: "Week 1",
    summary: "",
    materials: [],
    exercises: [],
    checklist: [],
    published: true,
  };
  seed["subscriptions/cohort__ines"] = { ...seed["subscriptions/cohort__ines"], email: INES_LISTED_ADDRESS };
  return seed;
}

beforeEach(() => {
  w.reset(runningSeed());
});

const sentTo = () => world.mail.map((message) => message.to).sort();
const LANE = { logTag: "test", overCapAdvice: "split it" };

describe("the fixture is the case the rule is about", () => {
  test("ines holds a told place in Group B and is off the run's cohort list", () => {
    const place = world.db.read(enrolmentPath("ines"));
    assert.deepEqual([place.status, place.role, place.groupId], ["active", "learner", B]);
    assert.ok(place.allocatedEmailAt, "Publish has told her her group");
    const row = world.db.read("subscriptions/cohort__ines");
    assert.deepEqual([row.channel, row.audienceId, row.subscribed], [CHANNEL, "ines", false]);
  });
});

describe("1. the run composer: the notice reaches her, the announcement does not", () => {
  const message = { subject: "Room bookings this week", body: "Every group meets in its usual room." };

  test("the notice lane reaches everybody holding a told place, ines at the address her cohort row holds", async () => {
    const response = await call("claudia", runEmail.POST, { runId: RUN.agi }, { course: true, body: { ...message, asNotice: true } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(sentTo(), ["amara@example.com", "bea@example.com", INES_LISTED_ADDRESS, "tariq@example.com"]);
    for (const sent of world.mail) {
      assert.equal(sent.kind, "notice");
      assert.equal(sent.surface, "course-run");
    }
    // The response says what went and no more: no count of people it could
    // not reach, because a notice leaves nobody holding a place out.
    assert.deepEqual(response.body, { ok: true, sent: 4, skipped: 1, pushed: 4 });
    assert.deepEqual(world.pushes.map((note) => note.uid).sort(), ["amara", "bea", "ines", "tariq"]);
  });

  test("the announcement lane keeps the list: ines unsubscribed, and it does not reach her", async () => {
    const response = await call("claudia", runEmail.POST, { runId: RUN.agi }, { course: true, body: message });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(sentTo(), ["amara@example.com", "bea@example.com", "tariq@example.com"]);
    for (const sent of world.mail) assert.equal(sent.kind, "course-broadcast");
    assert.deepEqual(world.pushes, [], "an announcement has no push leg");
  });
});

describe("2. an update reaches her, to everyone and to her group", () => {
  test("to everyone", async () => {
    assert.equal(await w.emailsFor("everyone"), 4);
    const response = await press("claudia");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(sentTo(), ["amara@example.com", "bea@example.com", INES_LISTED_ADDRESS, "tariq@example.com"]);
  });

  test("to Group B, from its facilitator and from the lead", async () => {
    for (const who of ["rahul", "claudia"]) {
      world.mail.length = 0;
      assert.equal(await w.emailsFor("group", B), 2, who);
      const response = await press(who, { to: "group", groupId: B, title: "Room change for Group B this week" });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.deepEqual(sentTo(), ["amara@example.com", INES_LISTED_ADDRESS], who);
    }
  });

  test("to another group, not her", async () => {
    await press("claudia", { to: "group", groupId: A, title: "Group A meets in A13" });
    assert.deepEqual(sentTo(), ["bea@example.com"]);
  });
});

describe("3. the optional mail keeps the list: the weekly nudge and next week's email do not reach her", () => {
  test("the weekly nudge, sent", async () => {
    const preview = await call("claudia", nudge.GET, { runId: RUN.agi }, { course: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.week?.weekNumber, 1, JSON.stringify(preview.body));
    assert.equal(preview.body.recipients, 3, "the nudge's count is the list's: amara, bea and tariq");
    // The run-wide catch-up is an admin's to send.
    const sent = await call("zach", nudge.POST, { runId: RUN.agi }, { course: true, body: {} });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(sentTo(), ["amara@example.com", "bea@example.com", "tariq@example.com"]);
  });

  test("next week's email: the audience its source asks for, for her group", async () => {
    // `prepareNextWeekEmail` resolves this exact call for the group being
    // mailed; the source is held to it below.
    const group = await staffEmails.resolveCohortAudience(world.courseDb, RUN.agi, LANE, { groupId: B });
    assert.equal(group.refusal, null);
    assert.deepEqual(group.members.map((member) => member.uid), ["amara"]);
    const text = source("lib", "courses", "nextWeekEmail.ts");
    assert.match(text, /await resolveCohortAudience\(db, run\.id, LANE, \{ groupId: group\.id \}\)/);
    assert.doesNotMatch(text, /resolveNoticeAudience/, "next week's email is optional mail, and keeps the list");
  });

  test("the lanes that keep the list ask the cohort audience, and only the notices ask the notice audience", () => {
    const nudgeRoute = source("app", "api", "courses", "runs", "[runId]", "nudge", "route.ts");
    assert.equal([...nudgeRoute.matchAll(/resolveCohortAudience\(db, runId, LANE\)/g)].length, 2, "the nudge's preview and its send");
    assert.doesNotMatch(nudgeRoute, /resolveNoticeAudience/);
    const runRoute = source("app", "api", "courses", "runs", "[runId]", "email", "route.ts");
    assert.match(
      runRoute,
      /\? await resolveNoticeAudience\(db, runId, NOTICE_LANE\)\s*\n\s*: await resolveCohortAudience\(db, runId, LANE\);/,
      "the run composer's two lanes differ by the audience they ask for",
    );
    const updates = source("lib", "courses", "updates", "audience.ts");
    assert.match(updates, /await resolveNoticeAudience\(db, run\.id, LANE, \{/);
    assert.doesNotMatch(updates, /resolveCohortAudience/);
  });
});

describe("4. nobody else, on any lane", () => {
  const NOBODY = ["dev", "nina", "omar", "rahul", "sofia", "tom"];
  const addressesOf = (uids) => uids.map((uid) => `${uid}@example.com`);

  test("not somebody placed and not told, somebody who left, a stopped address or a facilitator holding no place", async () => {
    const lanes = [
      ["the run notice", () => call("claudia", runEmail.POST, { runId: RUN.agi }, { course: true, body: { subject: "S", body: "B", asNotice: true } })],
      ["the announcement", () => call("claudia", runEmail.POST, { runId: RUN.agi }, { course: true, body: { subject: "S", body: "B" } })],
      ["an update to everyone", () => press("claudia")],
      ["an update to Group B", () => press("claudia", { to: "group", groupId: B, title: "T" })],
      ["the weekly nudge", () => call("zach", nudge.POST, { runId: RUN.agi }, { course: true, body: {} })],
    ];
    for (const [lane, send] of lanes) {
      w.reset(runningSeed());
      const response = await send();
      assert.equal(response.status, 200, `${lane}: ${JSON.stringify(response.body)}`);
      assert.ok(world.mail.length > 0, `${lane} sent nothing`);
      for (const address of addressesOf(NOBODY)) assert.ok(!sentTo().includes(address), `${lane} reached ${address}`);
    }
  });

  test("the notice audience says so in its own numbers: told places counted, the stopped address skipped", async () => {
    const run = await staffEmails.resolveNoticeAudience(world.courseDb, RUN.agi, LANE);
    assert.equal(run.refusal, null);
    assert.deepEqual(run.members.map((member) => member.uid).sort(), ["amara", "bea", "ines", "tariq"]);
    // Five told places (omar's among them); dev is not told, nina has left and
    // the facilitators hold no place, so none of those is a candidate at all.
    assert.equal(run.enrolledCount, 5);
    assert.equal(run.skipped, 1, "omar's address is on the do-not-email list");
    const groupB = await staffEmails.resolveNoticeAudience(world.courseDb, RUN.agi, LANE, { groupId: B });
    assert.deepEqual(groupB.members.map((member) => member.uid).sort(), ["amara", "ines"]);
    const groupC = await staffEmails.resolveNoticeAudience(world.courseDb, RUN.agi, LANE, { groupId: C });
    assert.deepEqual(groupC.members.map((member) => member.uid), ["tariq"]);
  });
});

describe("5. the cap refuses a notice whole", () => {
  test("past 200 told places on the run, nothing is sent and the sender is told why", async () => {
    for (let n = 0; n < 200; n += 1) {
      const uid = `p${n}`;
      world.db.seed(`users/${uid}`, { email: `${uid}@example.com`, displayName: `Person ${n}`, role: "member" });
      world.db.seed(enrolmentPath(uid), {
        runId: RUN.agi,
        uid,
        groupId: A,
        status: "active",
        role: "learner",
        selfEnrolled: false,
        allocatedEmailAt: new Date("2026-10-28T18:00:00Z"),
      });
    }
    const response = await call("claudia", runEmail.POST, { runId: RUN.agi }, { course: true, body: { subject: "S", body: "B", asNotice: true } });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /^This run has 205 people holding a place, over the 200-person limit for a single send\. Nothing was sent: /);
    assert.equal(world.mail.length, 0);
    assert.deepEqual(world.pushes, []);
    // One group of the same run is a statement about that group, and goes.
    const groupB = await staffEmails.resolveNoticeAudience(world.courseDb, RUN.agi, LANE, { groupId: B });
    assert.equal(groupB.refusal, null);
    assert.equal(groupB.members.length, 2);
  });
});
