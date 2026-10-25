/**
 * Pitching week's three routes, driven for real as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The routes are `GET /api/courses/runs/[runId]/pitching` (a person's page),
 * `POST .../pitching/pitch` (save my pitch) and `POST .../pitching/picks`
 * ("I’d join this"). What they keep, each held below:
 *
 *  - only somebody with a live learner seat in one of the run's groups, told
 *    by Publish, whose account stands, takes part; everybody else, the run's
 *    staff included, is refused the same way;
 *  - a view-as session reads and never writes;
 *  - the body is checked before anything is read;
 *  - one pitch per person, a partner from the person's own group, told, on no
 *    other pitch; only the one who sent a pitch changes who is on it;
 *  - never more picks than the run's limit, never your own pitch, never
 *    another group's;
 *  - it closes at the start of the person's group's session in that week,
 *    from the group's own calendar, in London time, and after that nothing
 *    changes;
 *  - nobody is told who picked what, or how many.
 *
 * The world is `tests/lib/pitchingWorld.mjs`; the clock is mocked here.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { AT, INC, READING, makePitchingWorld, pitchingSeed, short } from "./lib/pitchingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makePitchingWorld("__pitchingRoutes");
const { world, reset, ask, pitchBody, pitchTitled, pitches, everything } = made;

beforeEach(() => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
});

const NOT_IN_A_GROUP = "Pitching week is for the people in this programme’s groups.";
const CLOSED = "Pitching has closed: your group’s session has started.";

/** A pitch saved by `who`, which has to work. */
async function pitched(who, over = {}) {
  const answer = await ask.pitch(who, pitchBody(over));
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body.view;
}

const rowTitled = (view, title) => view.pitches.find((row) => row.title === title);

describe("who takes part", () => {
  test("somebody in a group, told, reads their group's pitching week with every value from a record", async () => {
    const { status, body } = await ask.view("amara");
    assert.equal(status, 200);
    const view = body.view;
    assert.equal(view.runId, INC.run);
    assert.equal(view.weekNumber, 3);
    assert.equal(view.eyebrow, "Incubator: Research incubator · Week 3");
    assert.equal(view.backLabel, "Research incubator");
    assert.equal(view.lede, "No pitches yet. Pick up to 3 you’d join before the session on Thu 12 Nov at 6pm.");
    assert.equal(view.open, true);
    assert.equal(view.editUntil, "Edit until 6pm on Thu 12 Nov");
    assert.equal(view.pickLimit, 3);
    assert.equal(view.picked, 0);
    assert.equal(view.mine, null);
    assert.deepEqual(view.pitches, []);
    // The week's readings, as the group has the week; not its video.
    assert.deepEqual(view.readings, [
      { id: READING.probe, title: "Probes that transfer" },
      { id: READING.reward, title: "Reward hacking in the wild" },
    ]);
    // Partners: the rest of the group who were told and stand. Not Ines (not
    // told), Wen (left), Rory (refused), nor Omar (the Wednesday group).
    assert.deepEqual(view.partners.map((person) => person.name), ["Bea", "Dev", "Tariq"]);
    assert.equal(view.teams, "Tess makes the teams on Thu 19 Nov. Teams are 2 to 4 people.");
  });

  test("everybody else is refused the same way, the run's staff included, and nothing is written", async () => {
    const before = everything();
    for (const who of ["nina", "claudia", "tess", "yusuf", "zach", "nobody", "ines", "wen", "refused", "lloyd"]) {
      assert.deepEqual(short(await ask.view(who)), [403, NOT_IN_A_GROUP], who);
      assert.deepEqual(short(await ask.pitch(who, pitchBody())), [403, NOT_IN_A_GROUP], who);
      assert.deepEqual(short(await ask.pick(who, "anything")), [403, NOT_IN_A_GROUP], who);
    }
    assert.equal(everything(), before);
  });

  test("signed out is told to sign in", async () => {
    assert.deepEqual(short(await ask.view(null)), [401, "Not signed in"]);
    assert.deepEqual(short(await ask.pitch(null, pitchBody())), [401, "Not signed in"]);
    assert.deepEqual(short(await ask.pick(null, "anything")), [401, "Not signed in"]);
  });

  test("a view-as session reads the member's page and cannot write, before anything is read", async () => {
    const read = await ask.view("amara", { viewAs: true });
    assert.equal(read.status, 200);
    const reads = world.db.stats.reads;
    const before = everything();
    assert.deepEqual(short(await ask.pitch("amara", pitchBody(), { viewAs: true })), [403, "view-as"]);
    assert.deepEqual(short(await ask.pick("amara", "anything", true, { viewAs: true })), [403, "view-as"]);
    assert.equal(world.db.stats.reads, reads, "a view-as write read something first");
    assert.equal(everything(), before);
  });

  test("a run that does not exist answers as no seat, and one being destroyed is not there", async () => {
    assert.deepEqual(short(await made.call("amara", made.routes.view.GET, { runId: "no-such-run" })), [403, NOT_IN_A_GROUP]);
    world.db.poke(`courseRuns/${INC.run}`, { destroying: true });
    assert.deepEqual(short(await ask.view("amara")), [403, NOT_IN_A_GROUP]);
  });

  test("a group that has been archived takes no part", async () => {
    world.db.poke(`courseGroups/${INC.thursday}`, { archived: true });
    assert.deepEqual(short(await ask.view("amara")), [403, NOT_IN_A_GROUP]);
    assert.deepEqual(short(await ask.pitch("amara", pitchBody())), [403, NOT_IN_A_GROUP]);
    assert.equal((await ask.view("omar")).status, 200);
  });

  test("a week ticked and not published is no pitching week yet, and nor is a run with none ticked", async () => {
    world.db.poke(`courseRuns/${INC.run}/weeks/w03`, { published: false });
    assert.deepEqual(short(await ask.view("amara")), [404, "There’s no pitching week on this programme."]);
    world.db.poke(`courseRuns/${INC.run}/weeks/w03`, { published: true, pitching: false });
    assert.deepEqual(short(await ask.view("amara")), [404, "There’s no pitching week on this programme."]);
    assert.deepEqual(short(await ask.pitch("amara", pitchBody())), [404, "There’s no pitching week on this programme."]);
  });

  test("the lowest week ticked is pitching week", async () => {
    world.db.seed(`courseRuns/${INC.run}/weeks/w05`, { weekNumber: 5, title: "Week 5", published: true, pitching: true, materials: [] });
    assert.equal((await ask.view("amara")).body.view.weekNumber, 3);
  });
});

describe("pitching", () => {
  test("a person pitches alone; their group sees it with their name only, and another group does not", async () => {
    const mine = await pitched("amara");
    assert.deepEqual(mine.mine, {
      id: mine.mine.id,
      title: "Probe transfer",
      paperTitle: "Probes that transfer",
      readingId: READING.probe,
      twist: "Test whether the probes still work on a smaller open model.",
      partner: null,
      sentByMe: true,
    });
    assert.deepEqual(rowTitled(mine, "Probe transfer"), {
      id: mine.mine.id,
      title: "Probe transfer",
      twist: "Test whether the probes still work on a smaller open model.",
      pitchedBy: "Pitched by you",
      yours: true,
      picked: false,
    });
    assert.equal(mine.lede, "Pitches are in. Pick up to 3 you’d join before the session on Thu 12 Nov at 6pm.");

    const dev = (await ask.view("dev")).body.view;
    assert.deepEqual(rowTitled(dev, "Probe transfer").pitchedBy, "Pitched by Amara");
    assert.equal(rowTitled(dev, "Probe transfer").yours, false);
    assert.equal((await ask.view("omar")).body.view.pitches.length, 0);

    const stored = pitchTitled("Probe transfer");
    assert.equal(stored.runId, INC.run);
    assert.equal(stored.groupId, INC.thursday);
    assert.equal(stored.weekId, "w03");
    assert.equal(stored.weekNumber, 3);
    assert.deepEqual(stored.pitcherUids, ["amara"]);
    assert.deepEqual(stored.wouldJoinUids, []);
    assert.deepEqual(stored.paper, { kind: "reading", materialId: READING.probe, title: "Probes that transfer" });
  });

  test("with one partner from their own group, it is both people's pitch", async () => {
    const amara = await pitched("amara", { partnerUid: "dev" });
    assert.equal(rowTitled(amara, "Probe transfer").pitchedBy, "Pitched by you and Dev");
    assert.deepEqual(amara.mine.partner, { uid: "dev", name: "Dev" });

    const dev = (await ask.view("dev")).body.view;
    assert.equal(dev.mine.id, amara.mine.id);
    assert.equal(dev.mine.sentByMe, false);
    assert.deepEqual(dev.mine.partner, { uid: "amara", name: "Amara" });
    assert.equal(rowTitled(dev, "Probe transfer").pitchedBy, "Pitched by you and Amara");
    assert.equal(rowTitled(dev, "Probe transfer").yours, true);

    const bea = (await ask.view("bea")).body.view;
    assert.equal(rowTitled(bea, "Probe transfer").pitchedBy, "Pitched by Amara and Dev");
    // Dev is on a pitch, so he is nobody else's partner now.
    assert.deepEqual(bea.partners.map((person) => person.name), ["Tariq"]);
  });

  test("a partner who is not in the group, or not told, or gone, is refused, and nothing is written", async () => {
    const before = everything();
    for (const partnerUid of ["omar", "nina", "ines", "wen", "refused", "nobody", "claudia", "ghost"]) {
      assert.deepEqual(
        short(await ask.pitch("amara", pitchBody({ partnerUid }))),
        [400, "Your partner has to be somebody in your group."],
        partnerUid,
      );
    }
    assert.deepEqual(
      short(await ask.pitch("amara", pitchBody({ partnerUid: "amara" }))),
      [400, "Pick somebody else as your partner, or pitch alone."],
    );
    assert.equal(everything(), before);
  });

  test("a partner already on a pitch is refused", async () => {
    await pitched("dev", { title: "Reward hacking evals", paper: { kind: "reading", materialId: READING.reward } });
    assert.deepEqual(
      short(await ask.pitch("amara", pitchBody({ partnerUid: "dev" }))),
      [409, "Dev already has a pitch. Pick somebody else, or pitch alone."],
    );
    assert.equal(pitchTitled("Probe transfer"), null);
  });

  test("one pitch per person: saving again changes the one they have", async () => {
    await pitched("amara");
    await pitched("amara", { title: "Probe transfer, smaller" });
    assert.equal(pitches().length, 1);
    assert.equal(pitches()[0].title, "Probe transfer, smaller");
  });

  test("the partner changes the words; only the one who sent it changes who is on it", async () => {
    const first = await pitched("amara", { partnerUid: "dev" });
    const changed = await ask.pitch("dev", pitchBody({ twist: "Try it on two sizes.", partnerUid: "amara" }));
    assert.equal(changed.status, 200);
    assert.equal(changed.body.view.mine.twist, "Try it on two sizes.");
    assert.deepEqual(pitchTitled("Probe transfer").pitcherUids, ["amara", "dev"]);

    assert.deepEqual(
      short(await ask.pitch("dev", pitchBody({ partnerUid: "bea" }))),
      [409, "Only the person who sent this pitch can change who’s on it."],
    );

    // Amara changes her partner: Dev is free to pitch again, Bea is on it.
    await pitched("amara", { partnerUid: "bea" });
    assert.deepEqual(pitchTitled("Probe transfer").pitcherUids, ["amara", "bea"]);
    assert.equal((await ask.view("dev")).body.view.mine, null);
    assert.equal((await ask.view("bea")).body.view.mine.id, first.mine.id);
  });

  test("a paper is one of the week's readings, or typed", async () => {
    const typed = await pitched("amara", { paper: { kind: "typed", title: "A paper about probes" } });
    assert.equal(typed.mine.paperTitle, "A paper about probes");
    assert.equal(typed.mine.readingId, null);
    for (const materialId of ["m_talk_video", "m_nothing"]) {
      assert.deepEqual(
        short(await ask.pitch("dev", pitchBody({ paper: { kind: "reading", materialId } }))),
        [400, "That paper isn’t one of this week’s readings. Pick another, or type it in."],
        materialId,
      );
    }
  });

  test("the body is checked before anything is read", async () => {
    const cases = [
      [{}, "Give your pitch a title."],
      [pitchBody({ title: "   " }), "Give your pitch a title."],
      [pitchBody({ title: "x".repeat(81) }), "Keep the title to 80 characters."],
      [pitchBody({ twist: "" }), "Say what your twist is."],
      [pitchBody({ twist: "x".repeat(281) }), "Keep the twist to 280 characters."],
      [pitchBody({ paper: null }), "Say which paper you’d replicate."],
      [pitchBody({ paper: { kind: "typed", title: "" } }), "Say which paper you’d replicate."],
      [pitchBody({ paper: { kind: "typed", title: "x".repeat(201) } }), "Keep the paper to 200 characters."],
      [pitchBody({ paper: { kind: "reading", materialId: "a/b" } }), "Pick the paper from the week’s readings."],
      [pitchBody({ partnerUid: 7 }), "Pick your partner from the people in your group."],
      ["not json", "Send your pitch’s title, paper and twist."],
    ];
    for (const who of ["amara", "nina"]) {
      for (const [body, error] of cases) {
        const reads = world.db.stats.reads;
        assert.deepEqual(short(await ask.pitch(who, body)), [400, error], `${who}: ${JSON.stringify(body)}`);
        assert.equal(world.db.stats.reads, reads, `${who}'s refused body read something`);
      }
    }
    for (const [body, error] of [
      [{}, "Say which pitch, and whether you’d join it."],
      [{ pitchId: "p1" }, "Say whether you’d join this pitch."],
      [{ pitchId: "a/b", join: true }, "Say which pitch, and whether you’d join it."],
    ]) {
      const reads = world.db.stats.reads;
      assert.deepEqual(short(await made.call("amara", made.routes.picks.POST, { runId: INC.run }, { body })), [400, error]);
      assert.equal(world.db.stats.reads, reads);
    }
  });
});

describe("picking", () => {
  /** Dev, Bea and Tariq each pitch alone. */
  async function threePitches() {
    await pitched("dev", { title: "Reward hacking evals" });
    await pitched("bea", { title: "Steering at scale" });
    await pitched("tariq", { title: "Unlearning check" });
    return {
      dev: pitchTitled("Reward hacking evals").id,
      bea: pitchTitled("Steering at scale").id,
      tariq: pitchTitled("Unlearning check").id,
    };
  }

  test("“I’d join this”, pressed and unpressed, says which a person picked and how many", async () => {
    const ids = await threePitches();
    const once = await ask.pick("amara", ids.dev);
    assert.equal(once.status, 200);
    assert.equal(once.body.view.picked, 1);
    assert.equal(rowTitled(once.body.view, "Reward hacking evals").picked, true);
    assert.deepEqual(pitchTitled("Reward hacking evals").wouldJoinUids, ["amara"]);
    const again = await ask.pick("amara", ids.dev);
    assert.equal(again.body.view.picked, 1, "pressing what is already so changes nothing");
    const off = await ask.pick("amara", ids.dev, false);
    assert.equal(off.body.view.picked, 0);
    assert.deepEqual(pitchTitled("Reward hacking evals").wouldJoinUids, []);
  });

  test("never more than the run's limit; taking one off frees a pick", async () => {
    reset(pitchingSeed({ settings: { pickLimit: 2, teamSizeMin: 2, teamSizeMax: 4, teamsMadeOn: "2026-11-19" } }));
    const ids = await threePitches();
    assert.equal((await ask.pick("amara", ids.dev)).status, 200);
    const second = await ask.pick("amara", ids.bea);
    assert.equal(second.body.view.picked, 2);
    assert.equal(second.body.view.lede, "Pitches are in. Pick up to 2 you’d join before the session on Thu 12 Nov at 6pm.");
    assert.deepEqual(short(await ask.pick("amara", ids.tariq)), [409, "You’ve picked 2. Take one off before you pick another."]);
    assert.deepEqual(pitchTitled("Unlearning check").wouldJoinUids, []);
    await ask.pick("amara", ids.bea, false);
    assert.equal((await ask.pick("amara", ids.tariq)).body.view.picked, 2);
  });

  test("your own pitch, and another group's, cannot be picked", async () => {
    const mine = (await pitched("amara", { partnerUid: "dev" })).mine.id;
    assert.deepEqual(short(await ask.pick("amara", mine)), [409, "That’s your own pitch, so you can’t pick it."]);
    assert.deepEqual(short(await ask.pick("dev", mine)), [409, "That’s your own pitch, so you can’t pick it."]);
    const omars = (await pitched("omar", { title: "Red-teaming a small chatbot" })).mine.id;
    assert.deepEqual(short(await ask.pick("amara", omars)), [404, "That pitch isn’t one of your group’s this week."]);
    assert.deepEqual(short(await ask.pick("amara", "no-such-pitch")), [404, "That pitch isn’t one of your group’s this week."]);
  });

  test("with no limit set nobody can pick, and the page says when pitching closes instead", async () => {
    reset(pitchingSeed({ settings: { pickLimit: null, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null } }));
    const ids = await threePitches();
    assert.deepEqual(
      short(await ask.pick("amara", ids.dev)),
      [409, "Picking isn’t open yet: how many pitches each person may pick hasn’t been set."],
    );
    const view = (await ask.view("amara")).body.view;
    assert.equal(view.pickLimit, null);
    assert.equal(view.lede, "Pitches are in. You can pitch until the session on Thu 12 Nov at 6pm.");
    assert.equal(view.teams, null);
  });

  test("a person is told their own picks and nothing about anybody else's", async () => {
    const mine = (await pitched("amara")).mine.id;
    await ask.pick("dev", mine);
    await ask.pick("bea", mine);
    const amara = (await ask.view("amara")).body.view;
    const tariq = (await ask.view("tariq")).body.view;
    assert.equal(rowTitled(tariq, "Probe transfer").picked, false);
    assert.equal(tariq.picked, 0);
    for (const view of [amara, tariq]) {
      // Dev and Bea are on no pitch, so they are rightly in the partner list;
      // nowhere else may they appear.
      const wire = JSON.stringify({ ...view, partners: [] });
      assert.doesNotMatch(wire, /wouldJoin|"dev"|"bea"/, "a page carries somebody else's pick");
      assert.ok(!view.pitches.some((row) => "count" in row || "wouldJoin" in row));
    }
  });
});

describe("the close, in London time", () => {
  test("open until the group's session starts; then nothing on the page changes", async () => {
    mock.timers.setTime(AT.justBefore.getTime());
    const open = await pitched("amara");
    assert.equal(open.open, true);
    assert.equal(open.editUntil, "Edit until 6pm");
    await pitched("dev", { title: "Reward hacking evals" });
    const devs = pitchTitled("Reward hacking evals").id;

    mock.timers.setTime(AT.sessionStarts.getTime());
    const before = everything();
    assert.deepEqual(short(await ask.pitch("amara", pitchBody({ title: "Too late" }))), [409, CLOSED]);
    assert.deepEqual(short(await ask.pick("amara", devs)), [409, CLOSED]);
    assert.equal(everything(), before);
    const closed = (await ask.view("amara")).body.view;
    assert.equal(closed.open, false);
    assert.equal(closed.editUntil, null);
    assert.equal(closed.lede, "Pitching closed at 6pm on Thu 12 Nov, when your group’s session started.");
    // The Wednesday group's own session is next week: still open for Omar.
    const omar = (await ask.view("omar")).body.view;
    assert.equal(omar.open, true);
    assert.equal(omar.lede, "No pitches yet. Pick up to 3 you’d join before the session on Wed 18 Nov at 6:30pm.");
    assert.equal((await ask.pitch("omar", pitchBody({ title: "Red-teaming a small chatbot" }))).status, 200);
  });

  test("on the session's day the words say tonight", async () => {
    mock.timers.setTime(AT.thursdayMorning.getTime());
    const view = (await ask.view("amara")).body.view;
    assert.equal(view.lede, "No pitches yet. Pick up to 3 you’d join before tonight’s session at 6pm.");
    assert.equal(view.editUntil, "Edit until 6pm");
  });

  test("the close is the London wall clock: 6pm BST is 17:00 UTC", async () => {
    reset(pitchingSeed({ startDate: "2026-10-08" }));
    mock.timers.setTime(new Date("2026-10-22T09:00:00Z").getTime());
    assert.equal(
      (await ask.view("amara")).body.view.lede,
      "No pitches yet. Pick up to 3 you’d join before tonight’s session at 6pm.",
    );
    mock.timers.setTime(new Date("2026-10-22T16:59:59Z").getTime());
    assert.equal((await ask.pitch("amara", pitchBody())).status, 200);
    mock.timers.setTime(new Date("2026-10-22T17:00:00Z").getTime());
    assert.deepEqual(short(await ask.pitch("amara", pitchBody({ title: "Too late" }))), [409, CLOSED]);
    assert.equal(
      (await ask.view("amara")).body.view.lede,
      "Pitching closed at 6pm on Thu 22 Oct, when your group’s session started.",
    );
  });

  test("a group's own calendar decides: a session moved that week moves the close", async () => {
    world.db.poke(`courseGroups/${INC.thursday}`, { sessionOverrides: { w03: { startTimeLocal: "19:30" } } });
    mock.timers.setTime(AT.sessionStarts.getTime());
    const view = (await ask.view("amara")).body.view;
    assert.equal(view.open, true);
    assert.equal(view.editUntil, "Edit until 7:30pm");
  });

  test("a week the group's calendar cannot date never opens", async () => {
    world.db.poke(`courseGroups/${INC.thursday}`, { "session.startTimeLocal": "" });
    const view = (await ask.view("amara")).body.view;
    assert.equal(view.open, false);
    assert.equal(view.lede, "Your group’s session that week has no time yet, so pitching hasn’t opened.");
    assert.deepEqual(short(await ask.pitch("amara", pitchBody())), [409, CLOSED]);
  });

  test("an archived or finished run takes no more pitches", async () => {
    world.db.poke(`courseRuns/${INC.run}`, { archived: true });
    assert.deepEqual(short(await ask.pitch("amara", pitchBody())), [409, CLOSED]);
    world.db.poke(`courseRuns/${INC.run}`, { archived: false, status: "completed" });
    assert.deepEqual(short(await ask.pitch("amara", pitchBody())), [409, CLOSED]);
  });
});

describe("the programme's home", () => {
  test("its card shows while pitching is on and for the rest of the session's day, to the people taking part", async () => {
    assert.deepEqual(await ask.card("amara"), {
      lede: "No pitches yet. Pick up to 3 you’d join before the session on Thu 12 Nov at 6pm.",
      open: true,
    });
    for (const who of ["claudia", "tess", "zach", "nina", "ines", "nobody"]) {
      assert.equal(await ask.card(who), null, who);
    }
    mock.timers.setTime(AT.thursdayNight.getTime());
    assert.deepEqual(await ask.card("amara"), {
      lede: "Pitching closed at 6pm on Thu 12 Nov, when your group’s session started.",
      open: false,
    });
    mock.timers.setTime(AT.friday.getTime());
    assert.equal(await ask.card("amara"), null);
  });

  test("a run with no published pitching week shows no card", async () => {
    world.db.poke(`courseRuns/${INC.run}/weeks/w03`, { published: false });
    assert.equal(await ask.card("amara"), null);
  });
});
