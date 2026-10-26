/**
 * The routes that write on a team's page, and the one that sets the
 * hand-in's dates, executed as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  - `POST /api/courses/runs/[runId]/team/check-in`: this week's check-in;
 *  - `POST /api/courses/runs/[runId]/team/links` and
 *    `DELETE .../team/links/[linkId]`: the team's links;
 *  - `POST /api/courses/runs/[runId]/team/hand-in`: the team's one hand-in,
 *    until 23:59 in London on its due day;
 *  - `PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/teams/hand-in`:
 *    the due day and the showcase's week, by the lead and admins.
 *
 * Who writes on a team's page: somebody among its people now who has been
 * told their team, and nobody else. The world is `tests/lib/teamPageWorld.mjs`.
 * The clock is mocked (`mock.timers`).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { CALLERS, INC, NOT_PROBE, WHEN, makeTeamPageWorld, teamPageSeed } from "./lib/teamPageWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: WHEN.madeAndTold });

const w = await makeTeamPageWorld("__teamPageRoutes");
const { world, ask, probe, reward, entries, everything } = w;

const at = (when) => mock.timers.setTime(when.getTime());
const short = (response) => [response.status, response.body?.error ?? null];

const CHECK_IN = { weekNumber: 5, did: "Got the original code running on the small model.", inTheWay: "" };
const LINK = { label: "Repo", url: "https://github.example.com/probe-transfer" };
const HAND_IN = {
  url: "https://docs.example.com/probe-transfer",
  summary: "We replicated Probes that transfer on a smaller open model, then tested whether its probes still work.",
  whoDidWhat: "Amara ran the code. Dev wrote the method.",
  shared: true,
};

const NOT_IN_A_TEAM = "Only the people in this team can write on its page.";

beforeEach(async () => {
  at(WHEN.madeAndTold);
  await w.reset();
  at(WHEN.weekFive);
});

describe("this week's check-in", () => {
  test("somebody in the team saves it for their team, as theirs, and saving again changes the same one", async () => {
    const saved = await ask.checkIn("amara", CHECK_IN);
    assert.deepEqual([saved.status, saved.body], [200, { ok: true, weekNumber: 5 }]);
    const id = `${probe().id}__checkin__w05`;
    const stored = world.db.read(`courseTeamEntries/${id}`);
    assert.deepEqual(
      {
        runId: stored.runId,
        courseId: stored.courseId,
        groupId: stored.groupId,
        teamId: stored.teamId,
        kind: stored.kind,
        weekNumber: stored.weekNumber,
        did: stored.did,
        inTheWay: stored.inTheWay,
        byUid: stored.byUid,
      },
      {
        runId: INC.run,
        courseId: INC.course,
        groupId: INC.thursday,
        teamId: probe().id,
        kind: "check-in",
        weekNumber: 5,
        did: CHECK_IN.did,
        inTheWay: "",
        byUid: "amara",
      },
    );
    assert.ok(stored.createdAt instanceof Date && stored.updatedAt instanceof Date);

    // A teammate changes it: one check-in for the team, now theirs to have saved last.
    const again = await ask.checkIn("lena", { weekNumber: 5, did: "Probes train.", inTheWay: "The cluster queue." });
    assert.equal(again.status, 200);
    assert.equal(entries().filter((entry) => entry.kind === "check-in").length, 1);
    const changed = world.db.read(`courseTeamEntries/${id}`);
    assert.deepEqual([changed.did, changed.inTheWay, changed.byUid], ["Probes train.", "The cluster queue.", "lena"]);
    assert.equal(changed.createdAt.getTime(), stored.createdAt.getTime(), "saving again remade the check-in");
  });

  test("everybody else is refused alike, and nothing is written", async () => {
    for (const [who, as] of NOT_PROBE) {
      if (who === "bea") continue;
      const before = everything();
      const response = await ask.checkIn(who, CHECK_IN);
      if (who === null) assert.deepEqual(short(response), [401, "Not signed in"], as);
      else assert.deepEqual(short(response), [403, NOT_IN_A_TEAM], as);
      assert.equal(everything(), before, `${as} wrote something`);
    }
  });

  test("another team's person writes their own team's check-in, never Probe transfer's", async () => {
    assert.equal((await ask.checkIn("bea", CHECK_IN)).status, 200);
    assert.ok(world.db.read(`courseTeamEntries/${reward().id}__checkin__w05`));
    assert.equal(world.db.read(`courseTeamEntries/${probe().id}__checkin__w05`), undefined);
  });

  test("only this week's, by the team's group's own calendar", async () => {
    assert.deepEqual(short(await ask.checkIn("amara", { ...CHECK_IN, weekNumber: 4 })), [
      409,
      "That week’s check-in has closed. Reload the page for this week’s.",
    ]);
    assert.deepEqual(short(await ask.checkIn("amara", { ...CHECK_IN, weekNumber: 6 }))[0], 409);
    // The last day of week 5 is still week 5; the next morning is week 6.
    at(WHEN.weekFiveLastDay);
    assert.equal((await ask.checkIn("amara", CHECK_IN)).status, 200);
    at(WHEN.weekSix);
    assert.equal((await ask.checkIn("amara", CHECK_IN)).status, 409);
    assert.equal((await ask.checkIn("amara", { ...CHECK_IN, weekNumber: 6 })).status, 200);
    // In the break there is no check-in to save; in February there is.
    at(WHEN.inTheBreak);
    for (const weekNumber of [7, 8]) assert.equal((await ask.checkIn("amara", { ...CHECK_IN, weekNumber })).status, 409);
    at(WHEN.february);
    assert.equal((await ask.checkIn("amara", { ...CHECK_IN, weekNumber: 9 })).status, 200);
  });

  test("a body is checked before anything is read, with a sentence a person can act on", async () => {
    const cases = [
      [null, "Write what you did or what’s in the way, then save."],
      [{ weekNumber: 5 }, "Write what you did or what’s in the way, then save."],
      [{ weekNumber: 5, did: "  ", inTheWay: "\n" }, "Write what you did or what’s in the way, then save."],
      [{ weekNumber: 0, did: "x", inTheWay: "" }, "That check-in isn’t for one of this programme’s weeks. Reload the page."],
      [{ weekNumber: "5", did: "x", inTheWay: "" }, "That check-in isn’t for one of this programme’s weeks. Reload the page."],
      [{ weekNumber: 5, did: "x".repeat(1001), inTheWay: "" }, "Each box takes up to 1,000 characters. Cut it down, then save."],
    ];
    for (const [body, error] of cases) {
      for (const who of ["amara", "wen", "zach"]) {
        assert.deepEqual(short(await ask.checkIn(who, body)), [400, error], `${who}: ${JSON.stringify(body)}`);
      }
    }
    // Exactly the limit is kept.
    assert.equal((await ask.checkIn("amara", { weekNumber: 5, did: "x".repeat(1000), inTheWay: "" })).status, 200);
  });

  test("view-as is refused before anything else", async () => {
    const before = everything();
    assert.deepEqual(short(await ask.checkIn("amara", CHECK_IN, { viewAs: true })), [403, "view-as"]);
    assert.equal(everything(), before);
  });

  test("a run that has ended, been cancelled or archived takes no check-in", async () => {
    for (const patch of [{ status: "completed" }, { status: "cancelled" }, { archived: true }]) {
      at(WHEN.madeAndTold);
      await w.reset();
      at(WHEN.weekFive);
      world.db.poke(`courseRuns/${INC.run}`, patch);
      assert.deepEqual(short(await ask.checkIn("amara", CHECK_IN)), [
        409,
        "This programme isn’t running now, so its team pages can’t change.",
      ]);
    }
  });
});

describe("who is in a team, as every route asks it", () => {
  test("somebody who leaves writes nothing more, at once", async () => {
    world.db.poke(`courseEnrolments/${INC.run}__dev`, { status: "withdrawn" });
    assert.deepEqual(short(await ask.checkIn("dev", CHECK_IN)), [403, NOT_IN_A_TEAM]);
    assert.deepEqual(short(await ask.addLink("dev", LINK)), [403, NOT_IN_A_TEAM]);
    assert.deepEqual(short(await ask.handIn("dev", HAND_IN)), [403, NOT_IN_A_TEAM]);
    // Their teammates carry on.
    assert.equal((await ask.checkIn("amara", CHECK_IN)).status, 200);
  });

  test("somebody moved into a team writes on it once they have been told it, and not before", async () => {
    assert.equal((await w.made.ask.move("tess", "kai", probe().id)).status, 200);
    assert.deepEqual(short(await ask.checkIn("kai", CHECK_IN)), [403, NOT_IN_A_TEAM]);
    assert.equal((await w.made.ask.tell("tess", 4)).status, 200);
    assert.equal((await ask.checkIn("kai", CHECK_IN)).status, 200);
  });

  test("somebody moved out of a team writes on it no more", async () => {
    assert.equal((await w.made.ask.move("tess", "lena", reward().id)).status, 200);
    // Not yet told their new team: no page at all.
    assert.deepEqual(short(await ask.checkIn("lena", CHECK_IN)), [403, NOT_IN_A_TEAM]);
  });

  test("a facilitator who holds a place, in a team, writes on it as one of its people", async () => {
    world.db.poke(`courseGroups/${INC.thursday}`, { facilitatorUids: ["sofia", "maya"] });
    assert.equal((await ask.checkIn("maya", CHECK_IN)).status, 200);
    assert.equal(world.db.read(`courseTeamEntries/${reward().id}__checkin__w05`).byUid, "maya");
  });

  test("an account that no longer stands writes nothing", async () => {
    world.db.poke("users/amara", { role: "rejected" });
    assert.deepEqual(short(await ask.checkIn("amara", CHECK_IN)), [403, NOT_IN_A_TEAM]);
  });

  test("a run being destroyed is nobody's", async () => {
    world.db.poke(`courseRuns/${INC.run}`, { destroying: true });
    assert.deepEqual(short(await ask.checkIn("amara", CHECK_IN)), [403, NOT_IN_A_TEAM]);
  });

  test("a run id that is not one segment is not found, before anything is read", async () => {
    const response = await w.made.call("amara", w.routes.checkIn.POST, { runId: "a/b" }, { body: CHECK_IN });
    assert.deepEqual(short(response), [404, "Not found"]);
  });
});

describe("the team's links", () => {
  test("somebody in the team adds one, and any of the team may remove it", async () => {
    const added = await ask.addLink("amara", LINK);
    assert.equal(added.status, 200);
    assert.deepEqual(Object.keys(added.body).sort(), ["id", "ok"]);
    const stored = world.db.read(`courseTeamEntries/${added.body.id}`);
    assert.deepEqual(
      [stored.kind, stored.teamId, stored.runId, stored.label, stored.url, stored.byUid],
      ["link", probe().id, INC.run, "Repo", LINK.url, "amara"],
    );
    assert.deepEqual(short(await ask.removeLink("dev", added.body.id)), [200, null]);
    assert.equal(world.db.read(`courseTeamEntries/${added.body.id}`), undefined);
  });

  test("nobody outside the team adds one or removes one, another team's person included", async () => {
    const added = await ask.addLink("amara", LINK);
    for (const [who, as] of NOT_PROBE) {
      const before = everything();
      const add = await ask.addLink(who, LINK);
      const remove = await ask.removeLink(who, added.body.id);
      if (who === null) {
        assert.equal(add.status, 401, as);
        assert.equal(remove.status, 401, as);
      } else if (who === "bea") {
        // Bea is in a team: Bea may add to that team's page, and Probe transfer's link is not on it.
        assert.equal(add.status, 200, as);
        assert.deepEqual(short(remove), [404, "That link isn’t on your team’s page any more. Reload the page."], as);
        continue;
      } else {
        assert.deepEqual(short(add), [403, NOT_IN_A_TEAM], as);
        assert.deepEqual(short(remove), [403, NOT_IN_A_TEAM], as);
      }
      assert.equal(everything(), before, `${as} changed something`);
    }
    assert.ok(world.db.read(`courseTeamEntries/${added.body.id}`), "Probe transfer's link went");
  });

  test("an https link with a label, and nothing else", async () => {
    const refused = [
      [{ label: "", url: LINK.url }, "Give the link a label, like Repo or Write-up."],
      [{ label: "x".repeat(41), url: LINK.url }, "Keep the label to 40 characters."],
      [{ label: "Repo", url: "http://github.example.com/x" }, "Use a link that starts https://."],
      [{ label: "Repo", url: "javascript:alert(1)" }, "Use a link that starts https://."],
      [{ label: "Repo", url: "https://user:pass@example.com/" }, "That link has a name and password in it. Take them out, then save."],
      [{ label: "Repo", url: "https://example.com/a b" }, "That link has a space in it. Paste it again, starting https://."],
      [{ label: "Repo", url: "" }, "Paste the link, starting https://."],
      [{ label: "Repo", url: `https://example.com/${"a".repeat(500)}` }, "That link is too long: keep it to 500 characters."],
      [{ label: "Repo" }, "Give the link a label and paste its address."],
    ];
    for (const [body, error] of refused) assert.deepEqual(short(await ask.addLink("amara", body)), [400, error], JSON.stringify(body));
    assert.equal(entries().length, 0);
  });

  test("up to twelve, then one must go first", async () => {
    for (let i = 0; i < 12; i += 1) assert.equal((await ask.addLink("amara", { label: `Link ${i}`, url: `https://example.com/${i}` })).status, 200);
    assert.deepEqual(short(await ask.addLink("dev", LINK)), [409, "Your team has as many links as a page holds. Remove one first."]);
    const one = entries().find((entry) => entry.kind === "link");
    assert.equal((await ask.removeLink("amara", one.id)).status, 200);
    assert.equal((await ask.addLink("dev", LINK)).status, 200);
  });

  test("a check-in or the hand-in is not a link to remove", async () => {
    await ask.checkIn("amara", CHECK_IN);
    at(WHEN.dueDay);
    await ask.handIn("amara", HAND_IN);
    for (const id of [`${probe().id}__checkin__w05`, `${probe().id}__handin`]) {
      assert.equal((await ask.removeLink("amara", id)).status, 404);
      assert.ok(world.db.read(`courseTeamEntries/${id}`));
    }
  });
});

describe("the hand-in", () => {
  test("anybody in the team hands it in, and anybody in it changes it until 23:59 on the due day", async () => {
    at(WHEN.february);
    assert.deepEqual(short(await ask.handIn("amara", HAND_IN)), [200, null]);
    const id = `courseTeamEntries/${probe().id}__handin`;
    const first = world.db.read(id);
    assert.deepEqual(
      [first.kind, first.teamId, first.url, first.summary, first.whoDidWhat, first.byUid],
      ["hand-in", probe().id, HAND_IN.url, HAND_IN.summary, HAND_IN.whoDidWhat, "amara"],
    );
    assert.equal(first.handedInAt.getTime(), WHEN.february.getTime());

    at(WHEN.lastMinute);
    assert.equal((await ask.handIn("lena", { ...HAND_IN, summary: "A shorter summary." })).status, 200);
    const changed = world.db.read(id);
    assert.deepEqual([changed.summary, changed.byUid], ["A shorter summary.", "lena"]);
    assert.equal(changed.handedInAt.getTime(), WHEN.february.getTime(), "changing it moved when it was first handed in");

    at(WHEN.closed);
    assert.deepEqual(short(await ask.handIn("dev", HAND_IN)), [409, "Hand-ins closed at 23:59 on Thu 18 Feb."]);
    assert.equal(world.db.read(id).summary, "A shorter summary.");
  });

  test("one per team: each team's is its own", async () => {
    at(WHEN.dueDay);
    await ask.handIn("amara", HAND_IN);
    await ask.handIn("bea", { ...HAND_IN, url: "https://example.com/reward" });
    const handIns = entries().filter((entry) => entry.kind === "hand-in");
    assert.deepEqual(handIns.map((entry) => entry.teamId).sort(), [probe().id, reward().id].sort());
  });

  test("whoever presses ticks that the rest of the team can open it", async () => {
    at(WHEN.dueDay);
    assert.deepEqual(short(await ask.handIn("amara", { ...HAND_IN, shared: false })), [
      400,
      "Tick that you’ve shared it with Dev and Lena first.",
    ]);
    assert.equal(entries().length, 0);
  });

  test("with no due day set it stays open, and a run that has ended takes none", async () => {
    at(WHEN.madeAndTold);
    await w.reset(teamPageSeed({ handIn: null }));
    at(WHEN.after);
    assert.equal((await ask.handIn("amara", HAND_IN)).status, 200);
    world.db.poke(`courseRuns/${INC.run}`, { status: "completed" });
    assert.deepEqual(short(await ask.handIn("amara", HAND_IN)), [
      409,
      "This programme has ended, so the hand-in can’t change now.",
    ]);
  });

  test("a summary up to 200 words, a link that starts https://, and who did what if the team wants", async () => {
    at(WHEN.dueDay);
    const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    const refused = [
      [{ ...HAND_IN, summary: words(201) }, "Keep the summary to 200 words."],
      [{ ...HAND_IN, summary: "  " }, "Write the summary, then hand in."],
      [{ ...HAND_IN, url: "http://example.com" }, "Use a link that starts https://."],
      [{ ...HAND_IN, whoDidWhat: 7 }, "Say who did what in words, or leave it empty."],
      [{ ...HAND_IN, whoDidWhat: "x".repeat(1001) }, "Keep who did what to 1,000 characters."],
      [{ summary: "x" }, "Add the link and the summary, then hand in."],
    ];
    for (const [body, error] of refused) assert.deepEqual(short(await ask.handIn("amara", body)), [400, error]);
    assert.equal((await ask.handIn("amara", { ...HAND_IN, summary: words(200), whoDidWhat: undefined })).status, 200);
  });

  test("nobody outside the team hands in for it", async () => {
    at(WHEN.dueDay);
    for (const [who, as] of CALLERS) {
      if (["amara", "bea"].includes(who)) continue;
      const response = await ask.handIn(who, HAND_IN);
      assert.equal(response.status, who === null ? 401 : 403, as);
    }
    assert.equal(entries().length, 0);
  });
});

describe("the hand-in dates, by the lead and admins", () => {
  test("the lead and an admin set and clear them; nobody else can", async () => {
    const saved = await ask.dates("tess", { dueOn: "2027-02-17", showcaseWeek: 9 });
    assert.deepEqual([saved.status, saved.body], [200, { ok: true, dueOn: "2027-02-17", showcaseWeek: 9 }]);
    assert.deepEqual(world.db.read(`courseRuns/${INC.run}`).teamHandIn, { dueOn: "2027-02-17", showcaseWeek: 9 });
    assert.equal((await ask.dates("zach", { dueOn: null, showcaseWeek: null })).status, 200);
    assert.deepEqual(world.db.read(`courseRuns/${INC.run}`).teamHandIn, { dueOn: null, showcaseWeek: null });

    const expected = {
      yusuf: [403, "Only the programme’s lead and admins can set the hand-in dates."],
      claudia: [404, "That programme is not on this form."],
      tomas: [404, "That programme is not on this form."],
      sofia: [404, "That programme is not on this form."],
      amara: [404, "That programme is not on this form."],
      wen: [404, "That programme is not on this form."],
    };
    for (const [who, answer] of Object.entries(expected)) {
      const before = everything();
      assert.deepEqual(short(await ask.dates(who, { dueOn: "2027-02-18", showcaseWeek: 10 })), answer, who);
      assert.equal(everything(), before, `${who} changed something`);
    }
    assert.equal((await ask.dates(null, { dueOn: "2027-02-18", showcaseWeek: 10 })).status, 401);
  });

  test("a body is checked before anything is read, and a showcase week is one of the run's", async () => {
    const refused = [
      [{}, 400, "Say the day hand-ins are due and the showcase’s week, or clear them."],
      [{ dueOn: "18 Feb", showcaseWeek: 10 }, 400, "Say the day hand-ins are due as a date, like 2027-02-18, or clear it."],
      [{ dueOn: "2027-02-30", showcaseWeek: 10 }, 400, "Say the day hand-ins are due as a date, like 2027-02-18, or clear it."],
      [{ dueOn: null, showcaseWeek: 0 }, 400, "Pick the showcase’s week from the list, or clear it."],
      [{ dueOn: null, showcaseWeek: 11 }, 400, "That week isn’t one of this programme’s weeks."],
    ];
    for (const [body, status, error] of refused) assert.deepEqual(short(await ask.dates("tess", body)), [status, error], JSON.stringify(body));
    // The empty body is refused alike for somebody with no role.
    assert.deepEqual(short(await ask.dates("amara", {})), [400, "Say the day hand-ins are due and the showcase’s week, or clear them."]);
  });

  test("a fellowship has no hand-in, and view-as is refused first", async () => {
    assert.deepEqual(short(await ask.dates("zach", { dueOn: null, showcaseWeek: null }, { programmeId: "agi-strategy" })), [
      409,
      "Teams are an incubator’s. This programme is a fellowship, so its people are in groups.",
    ]);
    assert.deepEqual(short(await ask.dates("tess", { dueOn: null, showcaseWeek: null }, { viewAs: true })), [403, "view-as"]);
  });
});

describe("nothing is read back, and nothing is sent", () => {
  test("no route under the team's page answers a GET, and nobody is emailed by any of them", async () => {
    for (const route of Object.values(w.routes)) assert.equal(route.GET, undefined);
    const before = world.mail.length;
    await ask.checkIn("amara", CHECK_IN);
    await ask.addLink("amara", LINK);
    at(WHEN.dueDay);
    await ask.handIn("amara", HAND_IN);
    await ask.dates("tess", { dueOn: "2027-02-18", showcaseWeek: 10 });
    assert.equal(world.mail.length, before);
  });
});
