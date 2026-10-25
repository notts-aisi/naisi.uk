/**
 * Updates (Q18): the updates route, as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET  /api/courses/runs/[runId]/updates   the updates the caller reads
 *   POST /api/courses/runs/[runId]/updates   post one, or "Send a test to me"
 *
 * ## What this guards
 *
 *  1. WHO READS WHICH. The lead, the track leads and admins every update; a
 *     group's facilitators the updates to everyone, to the facilitators and
 *     to their own groups; somebody on the run the updates to everyone and to
 *     their own group, once Publish has told them; nobody else, a reviewer,
 *     another programme's lead, somebody placed and not told and somebody who
 *     left included. An update to one group never reaches another group's
 *     people.
 *  2. WHO WRITES TO WHOM. An admin, the run's track lead and the programme's
 *     lead to everyone, a group or the facilitators; a group's facilitator to
 *     their own group only; nobody else. The body is checked before anything
 *     is read, with a sentence for each mistake.
 *  3. THE EMAIL. One message to each person the update is to who can be
 *     emailed, and nobody else: the notice class, the reply-to on the
 *     society's inbox, what it did kept on the update. The number on the
 *     button is a promise, and every refusal (a changed number, an audience
 *     over the cap, nobody to email, the caps) comes before anything is
 *     written or sent.
 *  4. "SEND A TEST TO ME" reaches the presser alone, marked, and posts nothing.
 *  5. DESTROYING THE RUN deletes its updates, and only its own.
 *
 * Real: the route, the readers, the audiences, the cohort list, the caps and
 * the notice door. Stubbed: the session, the view-as guard and `sendEmail`,
 * which records what it was handed (`tests/lib/updatesWorld.mjs`).
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, B, C, PERSONAS, RUN, enrolmentPath, makeUpdatesWorld } from "./lib/updatesWorld.mjs";

const w = await makeUpdatesWorld("__updatesRoutes");
const { world, ask, press, stored } = w;
const courseDeletion = await w.loadTs(join("lib", "firestore", "courseDeletion.ts"));
const staffEmails = await w.loadTs(join("lib", "email", "courseFacilitatorEmails.ts"));

beforeEach(() => {
  w.reset();
});

const short = (response) => [response.status, response.body?.error ?? null];

/**
 * Five updates, an hour apart, none emailed: one to everyone, one to each
 * group and one to the facilitators, each by somebody who may write it.
 */
async function fiveUpdates() {
  const posts = [
    ["2026-11-12T09:00:00Z", "claudia", { to: "everyone", title: "Week 3 readings are up" }],
    ["2026-11-12T10:00:00Z", "rahul", { to: "group", groupId: B, title: "Room change for Group B this week" }],
    ["2026-11-12T11:00:00Z", "sofia", { to: "group", groupId: A, title: "Group A meets in A13" }],
    ["2026-11-12T12:00:00Z", "claudia", { to: "facilitators", title: "The week 3 guide" }],
    ["2026-11-12T13:00:00Z", "zach", { to: "group", groupId: C, title: "Group C starts at 1pm" }],
  ];
  for (const [at, who, post] of posts) {
    w.setClock(at);
    const response = await press(who, { ...post, email: false });
    assert.equal(response.status, 200, `${who} could not post "${post.title}": ${JSON.stringify(response.body)}`);
  }
}

const titles = (response) => (response.body?.updates ?? []).map((update) => update.title);

// ---------------------------------------------------------------------------
// 1. Who reads which
// ---------------------------------------------------------------------------

describe("1. who reads which update", () => {
  const ALL = [
    "Group C starts at 1pm",
    "The week 3 guide",
    "Group A meets in A13",
    "Room change for Group B this week",
    "Week 3 readings are up",
  ];
  const EXPECTED = {
    zach: ALL,
    claudia: ALL,
    yusuf: ALL,
    rahul: ["The week 3 guide", "Room change for Group B this week", "Week 3 readings are up"],
    sofia: ["The week 3 guide", "Group A meets in A13", "Room change for Group B this week", "Week 3 readings are up"],
    tom: ["Group C starts at 1pm", "The week 3 guide", "Week 3 readings are up"],
    amara: ["Room change for Group B this week", "Week 3 readings are up"],
    bea: ["Group A meets in A13", "Week 3 readings are up"],
  };

  for (const [who, words] of PERSONAS) {
    test(`${words}: ${who in EXPECTED ? "reads what is theirs, newest first" : who === null ? "is refused for having no session" : "reads nothing, and is refused"}`, async () => {
      await fiveUpdates();
      const response = await ask.read(who);
      if (who === null) return assert.deepEqual(short(response), [401, "Not signed in"]);
      if (!(who in EXPECTED)) return assert.deepEqual(short(response), [403, "Forbidden"]);
      assert.equal(response.status, 200);
      assert.deepEqual(titles(response), EXPECTED[who]);
    });
  }

  test("no reader is shown an update to a group that is not theirs", async () => {
    await fiveUpdates();
    const groupsOf = { rahul: [B], sofia: [B, A], tom: [C], amara: [B], bea: [A] };
    const byTitle = Object.fromEntries(stored().map((update) => [update.title, update]));
    for (const [who, groups] of Object.entries(groupsOf)) {
      for (const title of titles(await ask.read(who))) {
        const update = byTitle[title];
        if (update.to === "group") assert.ok(groups.includes(update.groupId), `${who} was shown "${title}"`);
      }
    }
  });

  test("the answer is built field by field: no email, no group id, no stored document", async () => {
    await fiveUpdates();
    const [first] = (await ask.read("amara")).body.updates;
    assert.deepEqual(Object.keys((await ask.read("amara")).body).sort(), ["updates"]);
    assert.deepEqual(Object.keys(first).sort(), [
      "authorFirst",
      "authorName",
      "authorUid",
      "id",
      "message",
      "postedOn",
      "title",
      "toWords",
    ]);
    assert.deepEqual(first, {
      id: first.id,
      title: "Room change for Group B this week",
      message: "The 3 readings take about 75 minutes. Bring one question.",
      authorUid: "rahul",
      authorName: "Rahul",
      authorFirst: "Rahul",
      toWords: "to Group B",
      postedOn: "Thu 12 Nov",
    });
    const words = (await ask.read("claudia")).body.updates.map((update) => update.toWords);
    assert.deepEqual(words, ["to Group C", "to the facilitators", "to Group A", "to Group B", "to everyone on AGI Strategy"]);
  });

  test("somebody who is moved to another group after Publish reads nothing until Publish tells them again", async () => {
    await fiveUpdates();
    world.db.poke(enrolmentPath("amara"), { groupId: A, allocatedEmailAt: null });
    assert.deepEqual(short(await ask.read("amara")), [403, "Forbidden"]);
    world.db.poke(enrolmentPath("amara"), { allocatedEmailAt: new Date("2026-11-13T10:00:00Z") });
    assert.deepEqual(titles(await ask.read("amara")), ["Group A meets in A13", "Week 3 readings are up"]);
  });

  test("a facilitator of an archived group reads nothing for it; a run that has finished stays readable", async () => {
    await fiveUpdates();
    world.db.poke(`courseGroups/${C}`, { archived: true });
    assert.deepEqual(short(await ask.read("tom")), [403, "Forbidden"]);
    world.db.poke(enrolmentPath("bea"), { status: "completed" });
    assert.deepEqual(titles(await ask.read("bea")), ["Group A meets in A13", "Week 3 readings are up"]);
  });

  test("an account that has lost its standing reads nothing, though its name is still on the group", async () => {
    await fiveUpdates();
    world.db.poke("users/rahul", { role: "pending" });
    world.db.poke(enrolmentPath("rahul"), { status: "removed" });
    assert.deepEqual(short(await ask.read("rahul")), [403, "Forbidden"]);
  });

  test("a run that is missing or being destroyed: the same 403 for everybody but an admin, who is told it is missing", async () => {
    assert.deepEqual(short(await ask.read("claudia", "no-such-run")), [403, "Forbidden"]);
    assert.deepEqual(short(await ask.read("zach", "no-such-run")), [404, "Run not found"]);
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.deepEqual(short(await ask.read("amara")), [403, "Forbidden"]);
    assert.deepEqual(short(await ask.read("zach")), [404, "Run not found"]);
  });

  test("a read writes nothing", async () => {
    await fiveUpdates();
    const before = w.everything();
    for (const [who] of PERSONAS) await ask.read(who);
    assert.equal(w.everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. Who writes to whom, and the body
// ---------------------------------------------------------------------------

describe("2. who writes to whom", () => {
  const AUDIENCES = [
    ["everyone", { to: "everyone" }],
    ["Group B", { to: "group", groupId: B }],
    ["Group A", { to: "group", groupId: A }],
    ["the facilitators", { to: "facilitators" }],
  ];
  const MAY = {
    zach: ["everyone", "Group B", "Group A", "the facilitators"],
    claudia: ["everyone", "Group B", "Group A", "the facilitators"],
    yusuf: ["everyone", "Group B", "Group A", "the facilitators"],
    rahul: ["Group B"],
    sofia: ["Group B", "Group A"],
  };

  for (const [who, words] of PERSONAS) {
    test(`${words}`, async () => {
      for (const [name, audience] of AUDIENCES) {
        const before = stored().length;
        const response = await press(who, { ...audience, email: false });
        if (who === null) {
          assert.deepEqual(short(response), [401, "Not signed in"]);
        } else if ((MAY[who] ?? []).includes(name)) {
          assert.equal(response.status, 200, `${who} to ${name}: ${JSON.stringify(response.body)}`);
          assert.equal(stored().length, before + 1);
          continue;
        } else if (who in MAY || who === "tom") {
          // A facilitator on this run already knows it, and is told why.
          assert.deepEqual(short(response), [403, "You can write to your own group only."], `${who} to ${name}`);
        } else {
          assert.deepEqual(short(response), [403, "Forbidden"], `${who} to ${name}`);
        }
        assert.equal(stored().length, before, `${who}'s refused press to ${name} wrote an update`);
      }
    });
  }

  test("the update is written as it was pressed, by whoever pressed it", async () => {
    w.setClock("2026-11-16T09:30:00Z");
    await press("rahul", {
      to: "group",
      groupId: B,
      title: "  Room change for Group B this week  ",
      message: "We’re in [Room] on Tuesday.\r\nSame time, 6pm.\r\n",
      email: false,
    });
    const [update] = stored();
    assert.deepEqual(
      { ...update, path: undefined },
      {
        path: undefined,
        runId: RUN.agi,
        to: "group",
        groupId: B,
        title: "Room change for Group B this week",
        message: "We’re in [Room] on Tuesday.\nSame time, 6pm.",
        authorUid: "rahul",
        postedAt: new Date("2026-11-16T09:30:00Z"),
        email: null,
      },
    );
  });

  test("a message is kept as the text it was typed, markup and all", async () => {
    await press("claudia", { message: "<b>Bring</b> one <script>question</script>.\n\nSee you.", email: false });
    const [update] = (await ask.read("amara")).body.updates;
    assert.equal(update.message, "<b>Bring</b> one <script>question</script>.\n\nSee you.");
  });

  test("a group that is archived, or not on this run, is refused with a sentence; its facilitator is refused outright", async () => {
    world.db.poke(`courseGroups/${C}`, { archived: true });
    assert.deepEqual(short(await press("claudia", { to: "group", groupId: C, email: false })), [
      400,
      "That group isn’t on this programme any more. Choose another.",
    ]);
    assert.deepEqual(short(await press("claudia", { to: "group", groupId: "not-a-group", email: false })), [
      400,
      "That group isn’t on this programme any more. Choose another.",
    ]);
    assert.deepEqual(short(await press("tom", { to: "group", groupId: C, email: false })), [403, "Forbidden"]);
    assert.equal(stored().length, 0);
  });

  test("an account that has lost its standing cannot write to the group still naming it", async () => {
    world.db.poke("users/rahul", { role: "pending" });
    assert.deepEqual(short(await press("rahul", { to: "group", groupId: B, email: false })), [403, "Forbidden"]);
  });

  test("a run that is missing or being destroyed: 403 for everybody but an admin, who is told it is missing", async () => {
    const body = { to: "everyone", title: "Hello", message: "Hello.", email: false };
    assert.deepEqual(short(await ask.post("claudia", body, "no-such-run")), [403, "Forbidden"]);
    assert.deepEqual(short(await ask.post("zach", body, "no-such-run")), [404, "Run not found"]);
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.deepEqual(short(await ask.post("claudia", body)), [403, "Forbidden"]);
    assert.deepEqual(short(await ask.post("zach", body)), [404, "Run not found"]);
    assert.equal(stored().length, 0);
  });

  test("view-as is refused first, and nothing is written or sent", async () => {
    const before = w.everything();
    const response = await ask.post("zach", { to: "everyone", title: "Hi", message: "Hi.", email: true, emailCount: 3 }, RUN.agi, {
      viewAs: true,
    });
    assert.equal(response.status, 403);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });
});

describe("2b. the body is checked before anything is read, with a sentence for each mistake", () => {
  const good = { to: "everyone", title: "Week 3 readings are up", message: "Bring one question.", email: false };
  const CASES = [
    ["no body at all", undefined, "Expected a JSON object body."],
    ["a list", [], "Expected a JSON object body."],
    ["no audience", { ...good, to: undefined }, "Choose who the update is to."],
    ["an audience that is not one", { ...good, to: "the world" }, "Choose who the update is to."],
    ["a group with no id", { ...good, to: "group" }, "Choose a group."],
    ["a group id with a slash", { ...good, to: "group", groupId: "a/b" }, "Choose a group."],
    ["no title", { ...good, title: "   " }, "Give the update a title."],
    ["a title of two lines", { ...good, title: "One\nTwo" }, "The title must be one line."],
    ["a title too long", { ...good, title: "x".repeat(151) }, "The title must be 150 characters or fewer."],
    ["no message", { ...good, message: "\n \n" }, "Write a message."],
    ["a message too long", { ...good, message: "x".repeat(4001) }, "The message must be 4,000 characters or fewer."],
    ["no answer about the email", { ...good, email: undefined }, "Choose whether to email it."],
    ["an email with no count", { ...good, email: true }, "Say how many people the button said it would email."],
    ["a count that is not a whole number", { ...good, email: true, emailCount: 2.5 }, "Say how many people the button said it would email."],
    ["a test flag that is not one", { ...good, test: "yes" }, "Choose whether this is a test."],
  ];

  for (const [what, body, sentence] of CASES) {
    test(`${what}`, async () => {
      const reads = world.db.stats.reads;
      const response = await ask.post("amara", body);
      assert.deepEqual(short(response), [400, sentence]);
      assert.equal(world.db.stats.reads, reads, "a document was read before the body was checked");
    });
  }

  test("every signed-in caller meets the same 400 on an empty body; somebody signed out is refused first", async () => {
    for (const [who] of PERSONAS) {
      const response = await ask.post(who, {});
      assert.deepEqual(short(response), who === null ? [401, "Not signed in"] : [400, "Choose who the update is to."]);
    }
  });

  test("the limits are the boundary: 150 and 4,000 characters go", async () => {
    const response = await ask.post("claudia", { ...good, title: "t".repeat(150), message: "m".repeat(4000) });
    assert.equal(response.status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. The email
// ---------------------------------------------------------------------------

describe("3. the email reaches each person the update is to, and nobody else", () => {
  test("to everyone: the people told, on the cohort list, with an address that is not stopped", async () => {
    assert.equal(await w.emailsFor("everyone"), 3);
    const response = await press("claudia");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.email, { sent: 3, held: 0, suppressed: 0, failed: 0 });
    // One message each, addressed to one person: never a list, never a copy.
    assert.deepEqual(world.mail.map((m) => m.to).sort(), ["amara@example.com", "bea@example.com", "tariq@example.com"]);
    for (const message of world.mail) {
      assert.equal(typeof message.to, "string");
      assert.equal(message.subject, "Week 3 readings are up");
      assert.equal(message.kind, "notice");
      assert.equal(message.surface, "course-run");
      assert.equal(message.replyTo, "ai-safety@uonsu.com");
      assert.equal(message.referenceId, RUN.agi);
      assert.equal(message.actorUid, "claudia");
      assert.equal(message.listUnsubscribe, undefined);
    }
    assert.deepEqual(stored()[0].email, { planned: 3, sent: 3, held: 0, suppressed: 0, failed: 0, settled: true });
  });

  test("to one group: only that group's people, whoever writes it", async () => {
    for (const who of ["rahul", "claudia"]) {
      world.mail.length = 0;
      const response = await press(who, { to: "group", groupId: B, title: "Room change for Group B this week" });
      assert.equal(response.status, 200);
      assert.deepEqual(world.mail.map((m) => m.to), ["amara@example.com"], who);
      assert.equal(world.mail[0].surface, "course-group");
      assert.equal(world.mail[0].referenceId, B);
    }
  });

  test("to the facilitators: each live group's facilitators, once each, and none of the people", async () => {
    const response = await press("claudia", { to: "facilitators", title: "The week 3 guide" });
    assert.equal(response.status, 200);
    assert.deepEqual(world.mail.map((m) => m.to).sort(), ["rahul@example.com", "sofia@example.com", "tom@example.com"]);
    assert.equal(world.mail[0].surface, "course-run");
  });

  test("to the facilitators: an archived group's facilitator is nobody to write to, and neither is one who lost their standing", async () => {
    world.db.poke(`courseGroups/${C}`, { archived: true });
    world.db.poke("users/sofia", { role: "pending" });
    const [, , , facilitators] = await w.counts();
    assert.deepEqual([facilitators.to, facilitators.people, facilitators.emails], ["facilitators", 1, 1]);
    await press("claudia", { to: "facilitators", title: "The week 3 guide" });
    assert.deepEqual(world.mail.map((m) => m.to), ["rahul@example.com"]);
  });

  test("somebody who switched their course emails off is still emailed: it is a notice", async () => {
    world.db.poke("users/bea", { "profile.notifications": { categories: { courses: false } } });
    // The switch really is off: the grid lane, asked the same question, leaves her out.
    const grid = await staffEmails.resolveCohortAudience(world.courseDb, RUN.agi, { logTag: "t", overCapAdvice: "t" });
    assert.ok(!grid.members.some((member) => member.uid === "bea"));
    assert.equal(await w.emailsFor("everyone"), 3);
    await press("claudia");
    assert.ok(world.mail.some((m) => m.to === "bea@example.com"));
  });

  test("the number on the button is a promise: a press whose number no longer holds is refused, and nothing is written or sent", async () => {
    const before = w.everything();
    const response = await ask.post("claudia", {
      to: "everyone",
      title: "Week 3 readings are up",
      message: "Bring one question.",
      email: true,
      emailCount: 4,
    });
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, {
      error: "The number of people this emails has changed to 3. Check it, then press again.",
      emails: 3,
    });
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);

    // An address stopped between reading the button and pressing it.
    const count = await w.emailsFor("everyone");
    world.db.seed("suppressedEmails/bea@example.com", { email: "bea@example.com", reason: "bounce", source: "manual" });
    const stale = await ask.post("claudia", { to: "everyone", title: "T", message: "M", email: true, emailCount: count });
    assert.deepEqual(short(stale), [409, "The number of people this emails has changed to 2. Check it, then press again."]);
  });

  test("nobody to email: the press is refused with a sentence, and posting without the email still works", async () => {
    world.db.poke("subscriptions/cohort__tariq", { subscribed: false });
    assert.equal(await w.emailsFor("group", C), 0);
    const refused = await ask.post("claudia", { to: "group", groupId: C, title: "T", message: "M", email: true, emailCount: 0 });
    assert.deepEqual(short(refused), [400, "Nobody it’s to can be emailed yet. Turn off Also email it to post it."]);
    assert.equal(stored().length, 0);
    const posted = await press("claudia", { to: "group", groupId: C, email: false });
    assert.equal(posted.status, 200);
    assert.equal(world.mail.length, 0);
  });

  test("an audience over what one send can take is refused whole: nothing is written and nothing is sent", async () => {
    for (let n = 0; n < 201; n += 1) {
      const uid = `p${n}`;
      world.db.seed(enrolmentPath(uid), {
        runId: RUN.agi,
        uid,
        groupId: A,
        status: "active",
        role: "learner",
        selfEnrolled: false,
        allocatedEmailAt: new Date("2026-10-28T18:00:00Z"),
      });
      world.db.seed(`subscriptions/cohort__${uid}`, {
        email: `${uid}@example.com`,
        channel: `cohort:${RUN.agi}`,
        audience: "user",
        audienceId: uid,
        confirmed: true,
        subscribed: true,
      });
    }
    const [everyone] = await w.counts();
    assert.equal(everyone.refused, true);
    assert.equal(everyone.emails, 0);
    const before = w.everything();
    const response = await ask.post("claudia", { to: "everyone", title: "T", message: "M", email: true, emailCount: 0 });
    assert.deepEqual(short(response), [
      400,
      "This would email more than one send can take, so nothing was posted or sent. Post it without emailing, or ask an admin.",
    ]);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("the caps: three emailed updates an hour per writer and audience, refused whole on the fourth", async () => {
    for (let n = 0; n < 3; n += 1) assert.equal((await press("rahul", { to: "group", groupId: B })).status, 200);
    world.mail.length = 0;
    const before = stored().length;
    const fourth = await press("rahul", { to: "group", groupId: B });
    assert.deepEqual(short(fourth), [
      429,
      "This audience has already had 3 updates in the last hour. Nothing was sent. Try again shortly.",
    ]);
    assert.equal(stored().length, before);
    assert.equal(world.mail.length, 0);
    // Another audience, and another writer, have budgets of their own.
    assert.equal((await press("rahul", { to: "group", groupId: B, email: false })).status, 200);
    assert.equal((await press("claudia", { to: "group", groupId: B })).status, 200);
  });

  test("the caps: ten emailed updates a day to one audience, whoever writes them", async () => {
    for (const who of ["claudia", "yusuf", "zach"]) {
      for (let n = 0; n < 3; n += 1) assert.equal((await press(who, { to: "group", groupId: B })).status, 200);
    }
    assert.equal((await press("rahul", { to: "group", groupId: B })).status, 200);
    const eleventh = await press("rahul", { to: "group", groupId: B });
    assert.deepEqual(short(eleventh), [
      429,
      "This audience has already had 10 updates in the last day. Nothing was sent. Try again tomorrow, or ask an admin.",
    ]);
  });

  test("the caps: ten updates an hour posted without an email", async () => {
    for (let n = 0; n < 10; n += 1) assert.equal((await press("claudia", { email: false })).status, 200);
    assert.deepEqual(short(await press("claudia", { email: false })), [
      429,
      "You’ve posted 10 updates in the last hour. Try again shortly.",
    ]);
    assert.equal(stored().length, 10);
  });

  test("what the email did is kept: written unsettled before the first message, settled after the last", async () => {
    const seen = [];
    world.mailFate = (args) => {
      seen.push(stored()[0].email.settled);
      if (args.to === "bea@example.com") return "fail";
      if (args.to === "tariq@example.com") return "held";
      return "sent";
    };
    const response = await press("claudia");
    assert.deepEqual(seen, [false, false, false]);
    assert.deepEqual(response.body.email, { sent: 1, held: 1, suppressed: 0, failed: 1 });
    assert.deepEqual(stored()[0].email, { planned: 3, sent: 1, held: 1, suppressed: 0, failed: 1, settled: true });
  });

  test("an address stopped at the door is counted as such", async () => {
    world.mailFate = (args) => (args.to === "amara@example.com" ? "suppressed" : "sent");
    const response = await press("claudia");
    assert.deepEqual(response.body.email, { sent: 2, held: 0, suppressed: 1, failed: 0 });
  });

  test("posting without the email sends nothing and keeps no email", async () => {
    const response = await press("claudia", { email: false });
    assert.deepEqual(response.body, { ok: true, update: { id: stored()[0].path.split("/")[1] }, email: null });
    assert.equal(world.mail.length, 0);
    assert.equal(stored()[0].email, null);
  });
});

// ---------------------------------------------------------------------------
// 4. "Send a test to me"
// ---------------------------------------------------------------------------

describe("4. a test reaches the presser alone, marked, and posts nothing", () => {
  const body = (over = {}) => ({
    to: "everyone",
    title: "Week 3 readings are up",
    message: "The 3 readings take about 75 minutes.",
    test: true,
    ...over,
  });

  test("the lead's test: one message, to her own address, marked in its subject, and no update", async () => {
    const before = stored().length;
    const response = await ask.post("claudia", body());
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body.test).sort(), ["at", "delivery"]);
    assert.equal(response.body.test.delivery, "sent");
    assert.equal(world.mail.length, 1);
    const [message] = world.mail;
    assert.equal(message.to, "claudia@example.com");
    assert.equal(message.subject, "[TEST] Week 3 readings are up");
    assert.equal(message.kind, "course-test");
    assert.equal(message.surface, undefined, "a test is not a notice");
    assert.equal(message.replyTo, "ai-safety@uonsu.com");
    assert.equal(stored().length, before);
  });

  test("a group's facilitator tests their own group's update, and nobody else's", async () => {
    assert.equal((await ask.post("rahul", body({ to: "group", groupId: B }))).status, 200);
    assert.deepEqual(world.mail.map((m) => m.to), ["rahul@example.com"]);
    assert.deepEqual(short(await ask.post("rahul", body({ to: "group", groupId: A }))), [
      403,
      "You can write to your own group only.",
    ]);
    assert.deepEqual(short(await ask.post("amara", body())), [403, "Forbidden"]);
    assert.equal(world.mail.length, 1);
  });

  test("a held or stopped test says so", async () => {
    world.mailFate = () => "held";
    assert.equal((await ask.post("claudia", body())).body.test.delivery, "held");
    world.mailFate = () => "suppressed";
    assert.equal((await ask.post("claudia", body())).body.test.delivery, "suppressed");
  });

  test("ten tests an hour, on a counter of their own", async () => {
    for (let n = 0; n < 10; n += 1) assert.equal((await ask.post("claudia", body())).status, 200);
    assert.deepEqual(short(await ask.post("claudia", body())), [
      429,
      "You’ve sent 10 tests in the last hour. Try again shortly.",
    ]);
    // Testing never spends what posting needs.
    assert.equal((await press("claudia")).status, 200);
  });

  test("an account with no address to send a test to is told so, and nothing goes", async () => {
    world.db.poke("users/claudia", { email: "", "profile.uniEmailVerifiedAt": null });
    assert.deepEqual(short(await ask.post("claudia", body())), [
      400,
      "Your account has no email address on file to send a test to.",
    ]);
    assert.equal(world.mail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. Destroying the run
// ---------------------------------------------------------------------------

/** The store, with `count()` on every query, answered by counting what the query returns. */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

describe("5. destroying a run deletes its updates, and only its own", () => {
  test("the manifest counts them and the destroy deletes every one", async () => {
    await fiveUpdates();
    world.db.seed("courseUpdates/elsewhere", {
      runId: RUN.tais,
      to: "everyone",
      groupId: null,
      title: "Another run's update",
      message: "Not this run's.",
      authorUid: "tess",
      postedAt: new Date("2026-11-12T09:00:00Z"),
      email: null,
    });
    // A run with people on it has to be settled before it can be destroyed.
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, w.run());
    assert.equal(counts.updates, 5);
    const result = await courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.updates, 5);
    assert.deepEqual(stored().map((update) => update.path), ["courseUpdates/elsewhere"]);
  });
});
