/**
 * What a member reads of their own placement, before and after Publish has
 * told them their group.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * The course hub boards (Q11): somebody sees their group only once it has
 * been published and emailed. An admin's placement on the allocation board
 * makes the seat at once, and the seat is the board's working copy until
 * Publish emails its owner the group they are in now (`allocatedEmailAt` on
 * the enrolment; a move clears it). One predicate says so,
 * `placementIsTold` in `src/lib/firestore/courseEnrolments.ts`, and its
 * viewer form `placementIsShownTo` shows an untold placement to admins alone.
 *
 * So, for the member themselves, this file holds:
 *
 *  - PLACED AND NOT YET PUBLISHED: every route their pages call answers
 *    exactly as it did before they were placed. Not "something like it": the
 *    same status and the same body, read before and after the placement.
 *  - PUBLISHED AND TOLD: the run, their group and its people show, and the
 *    run opens.
 *  - "SEND A TEST TO ME" BEFORE PUBLISH: the test borrows a placed person's
 *    email, sends it to the presser, and changes nothing anybody reads. The
 *    press after it stamps, and so shows, exactly the people it wrote to:
 *    somebody whose email failed reads nothing until a press reaches them.
 *  - MOVED AFTER PUBLISH: untold again. They read nothing of the run until
 *    Publish is pressed again, which emails them alone their new group.
 *  - AN OPEN SIGN-UP RUN, where people pick their own group: shown at once.
 *  - A ROW FROM THE HAND-OVER NEVER PLACED: nothing, whatever else happens.
 *  - ANOTHER MEMBER OF THE GROUP: is shown the people Publish has told.
 *  - AN ADMIN is shown everything placed, and an admin viewing the site as a
 *    member is shown exactly what the member is.
 *
 * The facilitator's side is `course-hub-group-published-facilitator.test.mjs`,
 * the sends are `...-mail.test.mjs`, the pages are `...-pages.test.mjs`, and
 * `...-readers.test.mjs` lists every reader of placements in `src`.
 *
 * `tests/lib/groupPublishedWorld.mjs` says what is real and what is stubbed.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { GROUP, OPEN_GROUP, RUN, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";

const made = await makeGroupWorld("__groupPublishedMember");
const { world, reset, call, routes, steps, ask, enrolmentPath } = made;

beforeEach(() => {
  reset();
});

const HOLDERS = ["amara", "dev", "bea", "tariq"];
/** Where `steps.placed()` puts each holder. */
const GROUP_OF = { amara: GROUP.thursday, dev: GROUP.monday, bea: GROUP.monday, tariq: GROUP.thursday };
/** Each group's name, and who facilitates it (`groupSeed`). */
const NAME_OF = { [GROUP.monday]: "Monday evening", [GROUP.thursday]: "Thursday morning" };
const FACILITATOR_OF = { [GROUP.monday]: "claudia", [GROUP.thursday]: "tess" };

/** Week one's exercise answer, as the week page sends it. */
const ANSWER = { weekId: "w01", text: "My answer.", submit: false };

/**
 * Everything this member's pages ask of the server about the AGI run, as
 * status and body. `groupId` is the group they are (or will be) placed in.
 */
async function everythingTheyRead(who, groupId, options = {}) {
  const access = await ask.access(who);
  const pick = (answer) => ({ status: answer.status, body: answer.body });
  return {
    hub: await ask.me(who, options),
    access: {
      canLearn: access.canLearn,
      isEnrolled: access.isEnrolled,
      isFacilitator: access.isFacilitator,
      enrolment: access.enrolment,
    },
    overview: pick(await ask.overview(who, RUN.agi, options)),
    roster: pick(await ask.roster(who, groupId, options)),
    comments: pick(await ask.comments(who)),
    myExercises: pick(await ask.myExercises(who)),
    ownRow: pick(await ask.enrol(who)),
    submit: pick(
      await call(who, routes.submit.POST, { runId: RUN.agi, exerciseId: "x1" }, { body: ANSWER }),
    ),
    syncTasks: pick(await call(who, routes.syncTasks.POST, { runId: RUN.agi })),
  };
}

// ---------------------------------------------------------------------------
// Placed and not yet published
// ---------------------------------------------------------------------------

describe("placed by an admin and not yet published: everything reads as it did before the placement", () => {
  test("for each person placed, every route their pages call answers as it did before", async () => {
    const handed = await steps.handOver();
    assert.equal(handed.status, 200, JSON.stringify(handed.body));
    const before = {};
    for (const who of HOLDERS) before[who] = await everythingTheyRead(who, GROUP_OF[who]);

    await steps.place(HOLDERS.map((uid) => ({ uid, groupId: GROUP_OF[uid] })));
    for (const who of HOLDERS) {
      assert.equal(world.db.read(enrolmentPath(who)).groupId, GROUP_OF[who], `${who} is placed`);
      assert.deepEqual(
        await everythingTheyRead(who, GROUP_OF[who]),
        before[who],
        `${who} reads something different once an admin has placed them`,
      );
    }
    assert.equal(world.mail.length, 0, "nobody was emailed");
  });

  test("and what they read then is nothing: no run, a shut run, refusals and no row", async () => {
    await steps.placed();
    // Week 1 is not marked ready in this world. Once it is, week 1's door
    // (Q35 B) opens week 1 alone to somebody holding a place: held, as
    // strictly as this, in tests/course-hub-week-one-before-groups.test.mjs.
    assert.notEqual(world.db.read(`courseRuns/${RUN.agi}/weeks/w01`).ready, true);
    const read = await everythingTheyRead("amara", GROUP.thursday);
    assert.deepEqual(read.hub, []);
    assert.deepEqual(read.access, { canLearn: false, isEnrolled: false, isFacilitator: false, enrolment: null });
    assert.equal(read.overview.status, 403);
    assert.equal(read.roster.status, 403);
    assert.equal(read.comments.status, 403);
    assert.equal(read.myExercises.status, 403);
    assert.deepEqual([read.ownRow.status, read.ownRow.body.enrolment], [200, null]);
    assert.equal(read.submit.status, 403);
    assert.equal(read.syncTasks.status, 403);
    // Nothing in any answer names the group they are in.
    assert.ok(!JSON.stringify(read).includes(GROUP.thursday), "an answer carries the group's id");
    assert.ok(!JSON.stringify(read).includes("Thursday morning"), "an answer carries the group's name");
  });
});

// ---------------------------------------------------------------------------
// Published and told
// ---------------------------------------------------------------------------

describe("published and told: the run, the group and its people show", () => {
  test("each person reads their run and group, and the run opens", async () => {
    await steps.published();
    for (const who of HOLDERS) {
      assert.ok(world.db.read(enrolmentPath(who)).allocatedEmailAt instanceof Date, `${who} was told`);
      const read = await everythingTheyRead(who, GROUP_OF[who]);
      const name = GROUP_OF[who] === GROUP.monday ? "Monday evening" : "Thursday morning";
      assert.deepEqual(
        read.hub.map((entry) => [entry.runId, entry.membership, entry.roles, entry.groupName]),
        [[RUN.agi, "enrolled", ["learner"], name]],
        who,
      );
      assert.deepEqual([read.access.canLearn, read.access.isEnrolled], [true, true], who);
      assert.equal(read.access.enrolment?.groupId, GROUP_OF[who], who);
      assert.equal(read.overview.status, 200, who);
      assert.deepEqual(
        [read.overview.body.enrolment.groupId, read.overview.body.group.name],
        [GROUP_OF[who], name],
        who,
      );
      assert.equal(read.roster.status, 200, who);
      assert.equal(read.comments.status, 200, who);
      assert.equal(read.myExercises.status, 200, who);
      assert.equal(read.ownRow.body.enrolment?.groupId, GROUP_OF[who], who);
      assert.notEqual(read.submit.status, 403, `${who}: ${JSON.stringify(read.submit.body)}`);
      assert.notEqual(read.syncTasks.status, 403, `${who}: ${JSON.stringify(read.syncTasks.body)}`);
    }
  });

  test("another member of the group is shown the people Publish has told, and nobody else", async () => {
    await steps.placed();
    // Before Publish, a member cannot open their group's roster at all.
    assert.equal((await ask.roster("dev", GROUP.monday)).status, 403);
    await steps.publishes();
    const roster = await ask.roster("dev", GROUP.monday);
    assert.equal(roster.status, 200);
    assert.deepEqual(roster.body.members.map((m) => m.uid).sort(), ["bea", "dev"]);
    assert.equal(roster.body.notYetTold, false, "a member is not told about anybody waiting");
    // Not the other group's, which they are not in.
    assert.equal((await ask.roster("dev", GROUP.thursday)).status, 403);
  });
});

// ---------------------------------------------------------------------------
// "Send a test to me", and the press after it
// ---------------------------------------------------------------------------

/** One email as its reader sees it: the words, without the markup. */
async function wordsOf(mail) {
  const html = await render(mail.react);
  return html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const addressOf = (uid) => world.db.read(`users/${uid}`).email;
const firstNameOf = (uid) => world.db.read(`users/${uid}`).displayName.split(" ")[0];

/** How the subject of Publish's email to a placed person starts (its seed wording). */
const PLACEMENT_SUBJECT = "Your AGI Strategy Fellowship group: first session ";

/** The uid of every seat on the AGI run that carries Publish's stamp, sorted. */
const stampedSeats = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith(`courseEnrolments/${RUN.agi}__`))
    .map((path) => world.db.read(path))
    .filter((seat) => seat.allocatedEmailAt !== undefined && seat.allocatedEmailAt !== null)
    .map((seat) => seat.uid)
    .sort();

describe("a test of Publish's emails shows nobody their group, and a press shows exactly the people it wrote to", () => {
  test("the test borrows a placed person's email and shows them nothing; the press then shows them their group", async () => {
    await steps.placed();
    const before = {};
    for (const who of HOLDERS) before[who] = await everythingTheyRead(who, GROUP_OF[who]);

    const tested = await steps.sendTest();
    assert.deepEqual([tested.status, tested.body.recorded], [200, true], JSON.stringify(tested.body));
    // Publish's two emails, each marked as a test, to the presser and nobody else.
    assert.deepEqual(
      world.mail.map((m) => [m.to, m.kind]),
      [
        [addressOf("zach"), "course-test"],
        [addressOf("zach"), "course-test"],
      ],
    );
    // The placed person whose email it borrowed is the one it greets.
    const placement = world.mail.find((m) => m.subject.startsWith(`[TEST] ${PLACEMENT_SUBJECT}`));
    const words = await wordsOf(placement);
    const borrowed = HOLDERS.filter((who) => words.includes(`You've been placed, ${firstNameOf(who)}`));
    assert.equal(borrowed.length, 1, words);
    const [person] = borrowed;
    const group = GROUP_OF[person];

    // It stamped nobody and claimed no facilitator's email.
    assert.deepEqual(stampedSeats(), [], "the test stamped a seat");
    assert.deepEqual(world.db.paths().filter((path) => path.startsWith("courseNudges/facilitating__")), []);
    // Everybody placed reads exactly what they read before it.
    for (const who of HOLDERS) {
      assert.deepEqual(await everythingTheyRead(who, GROUP_OF[who]), before[who], `${who} reads something different after the test`);
    }
    // The person it borrowed above all: no run in their member area, a group
    // page they cannot open, and a roster that names nobody to their
    // facilitator and says the names are still to come.
    assert.deepEqual(await ask.me(person), []);
    assert.equal((await ask.roster(person, group)).status, 403);
    const waiting = await ask.roster(FACILITATOR_OF[group], group);
    assert.deepEqual([waiting.status, waiting.body.members, waiting.body.notYetTold], [200, [], true]);

    // The press: no second test (the first still counts), and every seat it
    // stamps is a person it wrote to, and every person it wrote to is stamped.
    world.mail.length = 0;
    const pressed = await steps.publishes();
    // One facilitators' email: Monday's group is Claudia's, and she leads
    // AGI Strategy, which names the run, so she signs that email and is
    // never sent it (the walk of stage one, October 2026). Tess is told.
    assert.deepEqual(pressed.report, {
      people: { sent: 4, held: 0, suppressed: 0 },
      facilitators: { sent: 1, held: 0, suppressed: 0 },
      failed: [],
      noAddress: [],
      alreadyTold: 0,
      more: 0,
    });
    assert.ok(!world.mail.some((m) => m.kind === "course-test"), "the press sent another test");
    const wroteTo = world.mail.filter((m) => m.subject.startsWith(PLACEMENT_SUBJECT)).map((m) => m.to).sort();
    assert.deepEqual(wroteTo, HOLDERS.map(addressOf).sort());
    assert.deepEqual(stampedSeats().map(addressOf).sort(), wroteTo);

    // And now the person it borrowed reads their run and group, and is on
    // the roster their facilitator reads.
    assert.deepEqual(
      (await ask.me(person)).map((entry) => [entry.runId, entry.membership, entry.groupName]),
      [[RUN.agi, "enrolled", NAME_OF[group]]],
    );
    const shown = await ask.roster(FACILITATOR_OF[group], group);
    assert.ok(shown.body.members.some((m) => m.uid === person), JSON.stringify(shown.body.members));
    assert.equal(shown.body.notYetTold, false);
  });

  test("somebody whose email failed is not stamped and reads nothing, until a press reaches them", async (t) => {
    // The press reports the failure on the console as well as in its answer.
    t.mock.method(console, "error", () => {});
    await steps.placed();
    const before = await everythingTheyRead("tariq", GROUP.thursday);
    world.mailFate = (args) => (args.to === addressOf("tariq") ? "fail" : "sent");
    const pressed = await steps.publishes();
    // Tess is told about Thursday's group; Claudia, Monday's facilitator
    // and the programme's lead, signs that email and is never sent it.
    assert.deepEqual(pressed.report, {
      people: { sent: 3, held: 0, suppressed: 0 },
      facilitators: { sent: 1, held: 0, suppressed: 0 },
      failed: ["Tariq"],
      noAddress: [],
      alreadyTold: 0,
      more: 0,
    });
    // Stamped: the three it wrote to. Not Tariq.
    assert.deepEqual(stampedSeats(), ["amara", "bea", "dev"]);
    assert.deepEqual(await everythingTheyRead("tariq", GROUP.thursday), before, "Tariq is shown something although his email failed");
    // His group's facilitator is shown Amara, and is told a name is still to come.
    const roster = await ask.roster("tess", GROUP.thursday);
    assert.deepEqual([roster.body.members.map((m) => m.uid), roster.body.notYetTold], [["amara"], true]);

    // The next press writes to him alone, and then he reads his group.
    world.mailFate = null;
    world.mail.length = 0;
    const again = await steps.publishes();
    assert.deepEqual([again.report.people, again.report.facilitators, again.report.failed], [
      { sent: 1, held: 0, suppressed: 0 },
      { sent: 0, held: 0, suppressed: 0 },
      [],
    ]);
    assert.deepEqual(world.mail.map((m) => m.to), [addressOf("tariq")]);
    assert.deepEqual(stampedSeats(), ["amara", "bea", "dev", "tariq"]);
    assert.deepEqual((await ask.me("tariq")).map((entry) => entry.groupName), ["Thursday morning"]);
    assert.deepEqual(
      (await ask.roster("tess", GROUP.thursday)).body.members.map((m) => m.uid).sort(),
      ["amara", "tariq"],
    );
  });
});

// ---------------------------------------------------------------------------
// Moved after Publish
// ---------------------------------------------------------------------------

describe("moved after Publish: untold again until Publish is pressed again", () => {
  test("the moved person reads nothing of the run, and nobody but an admin sees them in either group", async () => {
    await steps.published();
    world.mail.length = 0;
    const moved = await steps.place([{ uid: "amara", groupId: GROUP.monday }]);
    assert.deepEqual(moved.body, { ok: true, placed: 1, rejected: [] });
    assert.equal(world.db.read(enrolmentPath("amara")).allocatedEmailAt, undefined, "a move clears Publish's stamp");

    const read = await everythingTheyRead("amara", GROUP.monday);
    assert.deepEqual(read.hub, [], "the moved person is shown a run or a group Publish has not told them");
    assert.equal(read.access.canLearn, false);
    assert.equal(read.overview.status, 403);
    assert.equal(read.roster.status, 403);
    assert.equal((await ask.roster("amara", GROUP.thursday)).status, 403, "their old group is not theirs");
    // The people of the group they moved into are not shown them yet.
    assert.deepEqual((await ask.roster("dev", GROUP.monday)).body.members.map((m) => m.uid).sort(), ["bea", "dev"]);
    // Nor are the people of the group they left: they are not in it any more.
    assert.deepEqual((await ask.roster("tariq", GROUP.thursday)).body.members.map((m) => m.uid), ["tariq"]);
    // An admin is shown where everybody is.
    assert.deepEqual(
      (await ask.roster("zach", GROUP.monday)).body.members.map((m) => m.uid).sort(),
      ["amara", "bea", "dev"],
    );
    assert.equal(world.mail.length, 0, "moving somebody emails nobody");
  });

  test("Publish pressed again emails the moved person alone, and then they read their new group", async () => {
    await steps.published();
    await steps.place([{ uid: "amara", groupId: GROUP.monday }]);
    world.mail.length = 0;
    const again = await steps.publishes();
    // One person's email went, and nothing else: the first press told each
    // facilitator about their group, and the test it needed still counts.
    assert.deepEqual(again.report, {
      people: { sent: 1, held: 0, suppressed: 0 },
      facilitators: { sent: 0, held: 0, suppressed: 0 },
      failed: [],
      noAddress: [],
      alreadyTold: 0,
      more: 0,
    });
    assert.deepEqual(world.mail.map((m) => m.to), [world.db.read("users/amara").email]);
    assert.deepEqual(
      (await ask.me("amara")).map((entry) => [entry.membership, entry.groupName]),
      [["enrolled", "Monday evening"]],
    );
    assert.deepEqual(
      (await ask.roster("dev", GROUP.monday)).body.members.map((m) => m.uid).sort(),
      ["amara", "bea", "dev"],
    );
  });

  test("taken out of every group after Publish: nothing, as before they were placed", async () => {
    await steps.published();
    await steps.place([{ uid: "dev", groupId: null }]);
    assert.deepEqual(await ask.me("dev"), []);
    assert.equal((await ask.access("dev")).canLearn, false);
    assert.equal((await ask.overview("dev")).status, 403);
  });
});

// ---------------------------------------------------------------------------
// A row from the hand-over that is never placed
// ---------------------------------------------------------------------------

describe("a row from the hand-over that is never placed reads nothing, while the others are published", () => {
  test("given back, taken off the run's list, and everybody else published", async () => {
    const reply = await made.loadTs("app/api/admissions/forms/[roundId]/application/reply/route.ts");
    const decide = await made.loadTs("app/api/courses/runs/[runId]/applications/[uid]/decide/route.ts");
    await steps.handOver();
    const gaveBack = await call("tariq", reply.POST, { roundId: world.db.read(`courseApplications/${RUN.agi}__tariq`).fromForm.roundId }, {
      body: { reply: "cant-make-it", reason: { kind: "times", other: "" } },
    });
    assert.equal(gaveBack.status, 200, JSON.stringify(gaveBack.body));
    const off = await call("zach", decide.POST, { runId: RUN.agi, uid: "tariq" }, { body: { action: "reject" } });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    await steps.place(["amara", "dev", "bea"].map((uid) => ({ uid, groupId: GROUP_OF[uid] })));
    await steps.publishes();

    assert.equal(world.db.read(enrolmentPath("tariq")), undefined, "tariq was never placed");
    assert.deepEqual(await ask.me("tariq"), []);
    assert.equal((await ask.access("tariq")).canLearn, false);
    assert.equal((await ask.overview("tariq")).status, 403);
    assert.equal((await ask.roster("tariq", GROUP.thursday)).status, 403);
    // And the people who were placed read their groups.
    assert.equal((await ask.me("amara"))[0]?.groupName, "Thursday morning");
  });
});

// ---------------------------------------------------------------------------
// An open sign-up run
// ---------------------------------------------------------------------------

describe("an open sign-up run, where people pick their own group, shows the group at once", () => {
  test("a seat somebody takes for themselves is theirs at once, with its people", async () => {
    for (const who of ["nobody", "ines"]) {
      const took = await call(who, routes.enrol.POST, { runId: RUN.other }, { body: { groupId: OPEN_GROUP } });
      assert.equal(took.status, 200, `${who}: ${JSON.stringify(took.body)}`);
      assert.equal(world.db.read(enrolmentPath(who, RUN.other)).selfEnrolled, true);
    }
    // Nothing has been published, and nothing needs to be.
    assert.equal(world.db.read(`courseRuns/${RUN.other}`).allocationPublishedAt, undefined);
    const [entry] = await ask.me("nobody");
    assert.deepEqual([entry.runId, entry.membership, entry.groupName], [RUN.other, "enrolled", "Tuesday evening"]);
    assert.equal((await ask.access("nobody", RUN.other)).canLearn, true);
    assert.equal((await ask.overview("nobody", RUN.other)).body.group?.id, OPEN_GROUP);
    assert.equal((await ask.enrol("nobody", RUN.other)).body.enrolment?.groupId, OPEN_GROUP);
    const roster = await ask.roster("nobody", OPEN_GROUP);
    assert.equal(roster.status, 200);
    assert.deepEqual(roster.body.members.map((m) => m.uid).sort(), ["ines", "nobody"]);
    // And its facilitator is shown both names straight away.
    const facilitator = await ask.roster("claudia", OPEN_GROUP);
    assert.deepEqual(facilitator.body.members.map((m) => m.uid).sort(), ["ines", "nobody"]);
    assert.equal(facilitator.body.notYetTold, false);
  });
});

// ---------------------------------------------------------------------------
// Somebody who applied to the run itself
// ---------------------------------------------------------------------------

describe("somebody who applied to the run itself reads the offer they read before, until Publish", () => {
  test("offered, placed: still offered; published: their group", async () => {
    world.db.seed(`courseApplications/${RUN.agi}__nobody`, {
      runId: RUN.agi,
      courseId: world.db.read(`courseRuns/${RUN.agi}`).courseId,
      uid: "nobody",
      displayName: "Nell Carter",
      status: "accepted",
      availability: "",
    });
    const offered = await ask.me("nobody");
    assert.deepEqual(offered.map((e) => [e.runId, e.membership, e.roles, e.groupName]), [[RUN.agi, "offered", [], null]]);
    await steps.placed();
    await steps.place([{ uid: "nobody", groupId: GROUP.monday }]);
    assert.deepEqual(await ask.me("nobody"), offered, "the offer card changed because an admin placed them");
    assert.equal((await ask.access("nobody")).canLearn, false);
    await steps.publishes();
    assert.deepEqual(
      (await ask.me("nobody")).map((e) => [e.membership, e.roles, e.groupName]),
      [["enrolled", ["learner"], "Monday evening"]],
    );
  });
});

// ---------------------------------------------------------------------------
// Admins, and an admin viewing the site as a member
// ---------------------------------------------------------------------------

describe("an admin is shown everything placed; an admin viewing as a member is shown what the member is", () => {
  test("before Publish an admin opens the run and reads every name placed", async () => {
    await steps.placed();
    const access = await ask.access("zach");
    assert.equal(access.canLearn, true);
    assert.equal((await ask.overview("zach")).status, 200);
    for (const groupId of [GROUP.monday, GROUP.thursday]) {
      const roster = await ask.roster("zach", groupId);
      assert.equal(roster.status, 200);
      assert.equal(roster.body.notYetTold, false);
    }
    assert.deepEqual(
      (await ask.roster("zach", GROUP.monday)).body.members.map((m) => m.uid).sort(),
      ["bea", "dev"],
    );
  });

  test("viewing as a member, before Publish and after it, every answer is the member's own", async () => {
    await steps.placed();
    for (const stage of ["placed", "published"]) {
      if (stage === "published") await steps.publishes();
      for (const who of ["amara", "dev"]) {
        const own = await everythingTheyRead(who, GROUP_OF[who]);
        const borrowed = await everythingTheyRead(who, GROUP_OF[who], { viewAs: true });
        assert.deepEqual(borrowed.hub, own.hub, `${who}, ${stage}`);
        assert.deepEqual(borrowed.overview, own.overview, `${who}, ${stage}`);
        assert.deepEqual(borrowed.roster, own.roster, `${who}, ${stage}`);
      }
    }
  });
});
