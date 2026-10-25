/**
 * "Tell everyone their team": the email to each person in a team, its test,
 * and the press, through the real routes.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  - A test to the presser first, to the address on their own session and
 *    nobody else, and nothing goes until it has reached them.
 *  - The count on the button is what goes, and a press is refused with the
 *    number as it is when the people owed an email have changed.
 *  - The email's exact words: each person's team, its project line and their
 *    teammates' names, never an address, reply-to ai-safety@uonsu.com.
 *  - A second press after a move tells only the people whose team changed:
 *    the person moved, and the people of the teams they left and joined.
 *  - What a failed, held or suppressed send leaves, somebody with no
 *    address, one press at a time, and every caller who may not press.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { AT, CALLERS, INC, PITCH, ROUND, makeTeamsWorld, short, teamsSeed } from "./lib/teamsWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makeTeamsWorld("__teamsEmail");
const { world, reset, ask, teams, teamNamed, everything } = made;

const TEST_FIRST = "Send yourself a test first. Send a test to me does it.";

/** Probe transfer (Amara, Dev, Lena) and Reward hacking evals (Bea, Maya, Noor, Tariq), made by the lead. */
async function teamsMade() {
  assert.equal((await ask.fromPitch("tess", PITCH.probe)).status, 200);
  assert.equal((await ask.fromPitch("tess", PITCH.reward)).status, 200);
}

/** The tab's "Tell everyone their team", as `who` reads it. */
async function tellOf(who = "tess") {
  const outcome = await ask.view(who);
  assert.equal(outcome.status, "ok");
  return outcome.view.tell;
}

/** A test, then a press with the number the tab shows. */
async function tested(who = "tess") {
  const answer = await ask.test(who);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer;
}

/** Each message's address, subject and the words a person reads, in the order they went. */
async function letters() {
  const out = [];
  for (const args of world.mail) {
    out.push({
      to: args.to,
      subject: args.subject,
      replyTo: args.replyTo,
      kind: args.kind,
      referenceId: args.referenceId,
      text: (await render(args.react, { plainText: true })).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

beforeEach(async () => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
  await teamsMade();
});

describe("the test, first", () => {
  test("nothing goes until the presser has sent themselves a test, and the test goes to them alone", async () => {
    assert.deepEqual(await tellOf(), { owed: 7, emails: 7, noAddress: [], tested: false });
    const before = everything();
    assert.deepEqual(short(await ask.tell("tess", 7)), [409, TEST_FIRST]);
    assert.equal(world.mail.length, 0);
    assert.equal(everything(), before);

    const answer = await tested("tess");
    assert.equal(answer.body.delivery, "sent");
    assert.equal(answer.body.subject, "[TEST] Your team: Probe transfer");
    const [mail] = await letters();
    assert.equal(world.mail.length, 1);
    assert.deepEqual(
      { to: mail.to, subject: mail.subject, replyTo: mail.replyTo, kind: mail.kind, referenceId: mail.referenceId },
      {
        to: "tess@example.com",
        subject: "[TEST] Your team: Probe transfer",
        replyTo: "ai-safety@uonsu.com",
        kind: "course-test",
        referenceId: INC.run,
      },
    );
    // The first person a press would tell, as they would read it.
    assert.match(mail.text, /Hi Amara, Your team is Probe transfer, one of Research incubator’s teams\./);
    const marker = world.db.read(`courseNudges/teamstest__${INC.run}__tess`);
    assert.deepEqual(marker, { kind: "teams-test", runId: INC.run, byUid: "tess", at: AT.wednesdayNoon });
    // The test changed nothing about anybody's team.
    assert.ok(teams().every((team) => team.toldAs.length === 0));
    assert.equal((await tellOf("tess")).tested, true);
    // A test is the presser's own: an admin who has not sent one has not.
    assert.equal((await tellOf("zach")).tested, false);
    assert.deepEqual(short(await ask.tell("zach", 7)), [409, TEST_FIRST]);
  });

  test("a test held by this copy of the site, or stopped by the do-not-email list, does not count", async () => {
    for (const fate of ["held", "suppressed"]) {
      world.mailFate = () => fate;
      const answer = await ask.test("tess");
      assert.equal(answer.body.delivery, fate);
      assert.equal(world.db.read(`courseNudges/teamstest__${INC.run}__tess`), undefined);
    }
    world.mailFate = null;
    assert.deepEqual(short(await ask.tell("tess", 7)), [409, TEST_FIRST]);
  });

  test("with nobody in a team there is nothing to test; a presser with no address has nowhere to send one", async () => {
    reset();
    assert.deepEqual(short(await ask.test("tess")), [409, "Nobody is in a team yet, so there’s no email to test."]);
    await teamsMade();
    world.db.poke("users/tess", { email: "" });
    assert.deepEqual(short(await ask.test("tess")), [
      400,
      "Your account has no email address on file, so there is nowhere to send a test.",
    ]);
    assert.equal(world.mail.length, 0);
  });
});

describe("the press", () => {
  test("emails each person in a team their own email, the count the button showed, and nobody else", async () => {
    await tested();
    world.mail.length = 0;
    const answer = await ask.tell("tess", 7);
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.said, ["Told 7 people their team."]);
    assert.deepEqual(answer.body.report, { sent: 7, held: 0, suppressed: 0, failed: [], noAddress: [] });
    const sent = await letters();
    assert.deepEqual(
      sent.map((mail) => [mail.to, mail.subject]).sort(),
      [
        ["amara@example.com", "Your team: Probe transfer"],
        ["bea@example.com", "Your team: Reward hacking evals"],
        ["dev@example.com", "Your team: Probe transfer"],
        ["lena@example.com", "Your team: Probe transfer"],
        ["maya@example.com", "Your team: Reward hacking evals"],
        ["noor@example.com", "Your team: Reward hacking evals"],
        ["tariq@example.com", "Your team: Reward hacking evals"],
      ],
    );
    for (const mail of sent) {
      assert.equal(typeof mail.to, "string", "a message went to a list");
      assert.equal(mail.replyTo, "ai-safety@uonsu.com");
      assert.equal(mail.kind, "course-application");
      assert.equal(mail.referenceId, INC.run);
      assert.ok(!/example\.com/.test(mail.text), `${mail.to}'s email names an address`);
    }
    // Nobody who is in no team, never told, has left, or does not stand.
    for (const uid of ["kai", "omar", "ines", "wen", "refused", "sofia", "tess"]) {
      assert.ok(!sent.some((mail) => mail.to === `${uid}@example.com`), uid);
    }
    // What each was told is on their team now, and nobody is owed again.
    for (const team of teams()) assert.deepEqual(team.toldAs.map((told) => told.uid).sort(), [...team.memberUids].sort());
    assert.deepEqual(answer.body.view.tell, { owed: 0, emails: 0, noAddress: [], tested: true });
  });

  test("the email's exact words: the team, its project line, the teammates by name, signed by the lead", async () => {
    await tested();
    world.mail.length = 0;
    await ask.tell("tess", 7);
    const amara = (await letters()).find((mail) => mail.to === "amara@example.com");
    assert.match(
      amara.text,
      new RegExp(
        [
          "Hi Amara,",
          "Your team is Probe transfer, one of Research incubator’s teams\\.",
          "Your project: Replicate Probes that transfer, then: test whether the probes still work on a smaller open model\\.",
          "You’re with Dev and Lena\\.",
          "Your weekly session stays as it is: the teams work inside it\\.",
          "If something here isn’t right, reply to this email\\.",
          "Tess",
        ].join(" "),
      ),
    );
    const bea = (await letters()).find((mail) => mail.to === "bea@example.com");
    assert.match(bea.text, /Your project: Replicate Reward hacking in the wild, then: rebuild the evaluation with tasks written by the team\./);
    assert.match(bea.text, /You’re with Maya, Noor and Tariq\./);
  });

  test("a second press after a move tells only the people whose team changed", async () => {
    await tested();
    await ask.tell("tess", 7);
    world.mail.length = 0;

    // Kai joins Probe transfer: Kai, and the three already in it, are owed.
    const probe = teamNamed("Probe transfer");
    await ask.move("tess", "kai", probe.id);
    assert.deepEqual(await tellOf(), { owed: 4, emails: 4, noAddress: [], tested: true });
    const answer = await ask.tell("tess", 4);
    assert.deepEqual(answer.body.said, ["Told 4 people their team."]);
    assert.deepEqual(world.mail.map((mail) => mail.to).sort(), ["amara@example.com", "dev@example.com", "kai@example.com", "lena@example.com"]);
    const kai = (await letters()).find((mail) => mail.to === "kai@example.com");
    assert.match(kai.text, /You’re with Amara, Dev and Lena\./);
    world.mail.length = 0;

    // Lena moves to Reward hacking evals: Lena, the three she left and the
    // four she joined. Nobody else.
    await ask.move("tess", "lena", teamNamed("Reward hacking evals").id);
    assert.equal((await tellOf()).emails, 8);
    // Then to no team: she is not emailed, and Reward hacking evals' four are
    // owed what they were told before she came.
    await ask.move("tess", "lena", null);
    const tell = await tellOf();
    assert.deepEqual(tell, { owed: 3, emails: 3, noAddress: [], tested: true });
    await ask.tell("tess", 3);
    assert.deepEqual(world.mail.map((mail) => mail.to).sort(), ["amara@example.com", "dev@example.com", "kai@example.com"]);
  });

  test("a press with a number that is no longer true sends nothing, and says the number as it is", async () => {
    await tested();
    world.mail.length = 0;
    const before = everything();
    const answer = await ask.tell("tess", 6);
    assert.equal(answer.status, 409);
    assert.deepEqual(answer.body, { error: "The number of people to email is now 7. Check the teams, then press again.", emails: 7 });
    assert.equal(world.mail.length, 0);
    assert.equal(everything(), before);
  });

  test("a failed send stays owed and the next press tries it; a held or suppressed one is settled", async () => {
    await tested();
    world.mail.length = 0;
    world.mailFate = (args) =>
      ({ "dev@example.com": "fail", "lena@example.com": "held", "maya@example.com": "suppressed" })[args.to] ?? "sent";
    const answer = await ask.tell("tess", 7);
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.report, { sent: 4, held: 1, suppressed: 1, failed: ["Dev"], noAddress: [] });
    assert.deepEqual(answer.body.said, [
      "Told 4 people their team.",
      "1 person wasn’t emailed: this copy of the site doesn’t send to their address.",
      "1 person is on the do-not-email list, so wasn’t emailed.",
      "The email to Dev didn’t go. Press Tell everyone their team again to try it again.",
    ]);
    assert.deepEqual(answer.body.view.tell.emails, 1);
    world.mailFate = null;
    world.mail.length = 0;
    await ask.tell("tess", 1);
    assert.deepEqual(world.mail.map((mail) => mail.to), ["dev@example.com"]);
  });

  test("somebody with no address on file is named and not emailed, and is not counted on the button", async () => {
    world.db.poke("users/maya", { email: "" });
    assert.deepEqual(await tellOf(), { owed: 7, emails: 6, noAddress: ["Maya"], tested: false });
    await tested();
    world.mail.length = 0;
    const answer = await ask.tell("tess", 6);
    assert.deepEqual(answer.body.said, ["Told 6 people their team.", "Maya has no email address on file, so isn’t emailed."]);
    assert.ok(!world.mail.some((mail) => mail.to === "" || mail.to === "maya@example.com"));
  });

  test("one press at a time on a run", async () => {
    await tested();
    world.mail.length = 0;
    world.db.seed(`courseNudges/teamstell__${INC.run}`, {
      kind: "teams-press",
      runId: INC.run,
      byUid: "zach",
      token: "another",
      claimedAtMs: AT.wednesdayNoon.getTime() - 60_000,
    });
    assert.deepEqual(short(await ask.tell("tess", 7)), [
      409,
      "Somebody is telling everyone their team on this programme right now. Wait a minute, then press again.",
    ]);
    assert.equal(world.mail.length, 0);
    // One left from a press that stopped more than five minutes ago is not a press.
    world.db.poke(`courseNudges/teamstell__${INC.run}`, { claimedAtMs: AT.wednesdayNoon.getTime() - 6 * 60_000 });
    assert.equal((await ask.tell("tess", 7)).status, 200);
    assert.equal(world.mail.length, 7);
    assert.equal(world.db.read(`courseNudges/teamstell__${INC.run}`), undefined, "the press did not give the run back");
  });

  test("an email that cannot be written whole stops the press before anything is sent", async () => {
    await tested();
    world.mail.length = 0;
    world.db.poke(`courseTeams/${teamNamed("Probe transfer").id}`, { name: "" });
    const before = everything();
    assert.deepEqual(short(await ask.tell("tess", 7)), [
      409,
      "The email to Amara can’t be written whole: their team has no name. Nothing was sent.",
    ]);
    assert.equal(world.mail.length, 0);
    assert.equal(everything(), before);
  });

  test("a lead who no longer stands signs nothing, and the email is otherwise the same", async () => {
    await tested("zach");
    world.db.poke("users/tess", { role: "member", suRecognised: false });
    world.mail.length = 0;
    await ask.tell("zach", 7);
    const amara = (await letters()).find((mail) => mail.to === "amara@example.com");
    assert.match(amara.text, /reply to this email\.$|reply to this email\. /);
    assert.ok(!/\bTess\b/.test(amara.text));
  });

  test("an agenda team's email has no project line", async () => {
    reset(teamsSeed({ madeFrom: "agenda", sizes: { min: 2, max: 3 } }));
    await ask.fromAgenda("tess");
    await tested();
    world.mail.length = 0;
    await ask.tell("tess", 8);
    const maya = (await letters()).find((mail) => mail.to === "maya@example.com");
    assert.match(maya.text, /Your team is Frontier lab safety policies, one of Research incubator’s teams\. You’re with Lena\./);
    assert.ok(!/Your project/.test(maya.text));
  });
});

describe("who may test and press", () => {
  test("only the programme's lead and admins; a view-as session is turned away first; nothing is sent or written", async () => {
    const expected = new Map([
      ["claudia", 404],
      ["yusuf", 403],
      ["tomas", 404],
      ["sofia", 404],
      ["amara", 404],
      ["wen", 404],
      [null, 401],
    ]);
    const before = everything();
    for (const [who, words] of CALLERS) {
      if (!expected.has(who)) continue;
      assert.equal((await ask.test(who)).status, expected.get(who), `${words}: test`);
      assert.equal((await ask.tell(who, 7)).status, expected.get(who), `${words}: press`);
    }
    for (const who of ["zach", "tess"]) {
      assert.deepEqual(short(await ask.test(who, { viewAs: true })), [403, "view-as"]);
      assert.deepEqual(short(await ask.tell(who, 7, { viewAs: true })), [403, "view-as"]);
    }
    assert.equal(world.mail.length, 0);
    assert.equal(everything(), before);
  });

  test("an empty body is refused before anything is read; a missing programme is a 404", async () => {
    assert.deepEqual(short(await made.call("amara", made.routes.tell.POST, { roundId: ROUND, programmeId: "research-incubator" }, { body: {} })), [
      400,
      "Say how many emails the button showed, then press it again.",
    ]);
    assert.equal(
      (await made.call("zach", made.routes.test.POST, { roundId: "e2e-missing-round", programmeId: "e2e-missing-programme" }, { body: {} })).status,
      404,
    );
  });
});
