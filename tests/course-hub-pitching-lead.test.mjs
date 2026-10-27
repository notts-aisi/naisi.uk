/**
 * The pitches from a programme's pitching week, for its lead and for admins
 * (board in-teams, option C): who may read the list, what it counts, what it
 * never says, and how the Groups tab's views reach it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The list is read by `loadProgrammePitches` and drawn by the page at
 * `.../programmes/[programmeId]/(tabs)/groups/pitches`; both are executed
 * here, as an admin, the programme's lead, a lead who no longer stands, its
 * reviewer, the lead of another programme, a facilitator and members.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, AT, INC, INCUBATOR, ROUND, makePitchingWorld, pitchingSeed } from "./lib/pitchingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makePitchingWorld("__pitchingLead");
const { world, reset, ask, pitchBody, pitchTitled, everything, loadUi, sessionOf } = made;

beforeEach(() => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
});

/** The pitches a few people send, and who would join each, through the real routes. */
async function pitchingDone() {
  for (const [who, title, partnerUid] of [
    ["amara", "Probe transfer", "dev"],
    ["bea", "Steering at scale", null],
    ["tariq", "Unlearning check", null],
    ["omar", "Red-teaming a small chatbot", null],
  ]) {
    const answer = await ask.pitch(who, pitchBody({ title, partnerUid }));
    assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
  }
  const id = (title) => pitchTitled(title).id;
  for (const [who, title] of [
    ["bea", "Probe transfer"],
    ["tariq", "Probe transfer"],
    ["amara", "Unlearning check"],
    ["dev", "Unlearning check"],
    ["bea", "Unlearning check"],
    ["amara", "Steering at scale"],
  ]) {
    const answer = await ask.pick(who, id(title));
    assert.equal(answer.status, 200, `${who} on ${title}: ${JSON.stringify(answer.body)}`);
  }
}

describe("who may read the list", () => {
  test("an admin and the programme's lead; the reviewer is told it is theirs; anybody else is not shown the programme", async () => {
    await pitchingDone();
    const before = everything();
    for (const who of ["zach", "tess"]) {
      const outcome = await ask.staff(who);
      assert.equal(outcome.status, "ok", who);
      assert.equal(outcome.view.pitches.length, 4, who);
    }
    assert.deepEqual(await ask.staff("yusuf"), { status: "not-yours" });
    // Claudia leads AGI Strategy and facilitates the incubator's Thursday group;
    // Lloyd reviews AGI Strategy. Neither has a role on the incubator.
    for (const who of ["claudia", "lloyd", "amara", "dev", "nobody"]) {
      assert.deepEqual(await ask.staff(who), { status: "none" }, who);
    }
    assert.equal(everything(), before, "reading the list wrote something");
  });

  test("a lead who no longer meets the lead's bar is nobody here", async () => {
    world.db.poke("users/tess", { role: "member", suRecognised: false });
    assert.deepEqual(await ask.staff("tess"), { status: "none" });
  });

  test("a lead replaced by another is nobody here, and the new lead is", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.leadUid`]: "claudia" });
    assert.deepEqual(await ask.staff("tess"), { status: "none" });
    assert.equal((await ask.staff("claudia")).status, "ok");
  });
});

describe("what it says", () => {
  test("each pitch, who pitched it and how many would join it, most first; nobody who picked is named", async () => {
    await pitchingDone();
    const { view } = await ask.staff("tess");
    assert.equal(view.weekNumber, 3);
    assert.equal(view.published, true);
    assert.equal(view.pickLimitSet, true);
    assert.equal(view.blank, null);
    assert.deepEqual(
      view.pitches.map((pitch) => [pitch.title, pitch.wouldJoin, pitch.pitchedBy, pitch.groupName]),
      [
        ["Unlearning check", 3, "Pitched by Tariq", "Thursday evening"],
        ["Probe transfer", 2, "Pitched by Amara and Dev", "Thursday evening"],
        ["Steering at scale", 1, "Pitched by Bea", "Thursday evening"],
        ["Red-teaming a small chatbot", 0, "Pitched by Omar", "Wednesday evening"],
      ],
    );
    const wire = JSON.stringify(view);
    for (const uid of ["amara", "bea", "dev", "tariq", "omar"]) {
      assert.ok(!wire.includes(`"${uid}"`), `the list carries ${uid}'s uid`);
    }
    assert.ok(!/wouldJoinUids|pitcherUids/.test(wire));
  });

  test("one group's pitches carry no group name", async () => {
    await ask.pitch("amara", pitchBody());
    const { view } = await ask.staff("zach");
    assert.equal(view.pitches[0].groupName, null);
  });

  test("a pick counts while its owner is in that group, told, and standing", async () => {
    await pitchingDone();
    const probe = pitchTitled("Probe transfer");
    // Bea and Tariq picked it. Then Bea leaves, Tariq's account is refused,
    // and Ines (never told) and Omar (another group) are found on its list.
    world.db.poke(`courseEnrolments/${INC.run}__bea`, { status: "withdrawn" });
    world.db.poke("users/tariq", { role: "rejected" });
    world.db.poke(`coursePitches/${probe.id}`, { wouldJoinUids: [...probe.wouldJoinUids, "ines", "omar"] });
    const { view } = await ask.staff("tess");
    assert.equal(view.pitches.find((pitch) => pitch.title === "Probe transfer").wouldJoin, 0);
  });

  test("every state has a sentence's worth of fact: no run, a run gone, no week ticked, not published, no limit", async () => {
    const seed = pitchingSeed();
    seed[`admissionRounds/${ROUND}`].programmes[INCUBATOR].runId = null;
    reset(seed);
    assert.equal((await ask.staff("tess")).view.blank, "no-run");

    reset(pitchingSeed());
    world.db.poke(`courseRuns/${INC.run}`, { destroying: true });
    assert.equal((await ask.staff("tess")).view.blank, "run-gone");

    reset(pitchingSeed());
    world.db.poke(`courseRuns/${INC.run}/weeks/w03`, { pitching: false });
    assert.equal((await ask.staff("tess")).view.blank, "no-week");

    reset(pitchingSeed({ settings: { pickLimit: null, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null } }));
    world.db.poke(`courseRuns/${INC.run}/weeks/w03`, { published: false });
    const { view } = await ask.staff("tess");
    assert.equal(view.blank, null);
    assert.equal(view.published, false);
    assert.equal(view.pickLimitSet, false);
    assert.equal(view.canOpenRunEditor, false, "the run editor is not a lead's");
    assert.equal((await ask.staff("zach")).view.canOpenRunEditor, true);
  });
});

describe("the Groups tab's views", () => {
  test("offer Pitches for a run with a pitching week, and nothing new for any other run", async () => {
    world.user = sessionOf("zach");
    const incubator = await made.lib.times.loadTimesPicture(world.courseDb, world.user, ROUND, INCUBATOR, undefined);
    assert.equal(incubator.view.pitchingWeek, 3);
    const agi = await made.lib.times.loadTimesPicture(world.courseDb, world.user, ROUND, AGI, undefined);
    assert.equal(agi.view.pitchingWeek, null);
    // The tab's other views (People in groups, Facilitators) read the run through
    // loadProgrammeRun, which answers the same.
    const run = made.lib.programmeRun.loadProgrammeRun;
    assert.equal((await run(world.courseDb, world.user, ROUND, INCUBATOR)).view.pitchingWeek, 3);
    assert.equal((await run(world.courseDb, world.user, ROUND, AGI)).view.pitchingWeek, null);
  });
});

const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: Page } = await loadUi(join(TABS, "groups", "pitches", "page.tsx"));
const { default: TimesPage } = await loadUi(join(TABS, "groups", "times", "page.tsx"));

/** The names of the Groups tab's views in a page's markup, in order. */
function viewsIn(html) {
  const views = /<nav class="views" aria-label="Groups views">(.*?)<\/nav>/.exec(html);
  assert.ok(views, "no views");
  return [...views[1].matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
}
const PITCHES_CURRENT = /<a href="[^"]*\/groups\/pitches" class="view viewCurrent" aria-current="page">Pitches<\/a>/;

describe("the page", () => {

  const text = (html) =>
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

  async function draw(who, programmeId = INCUBATOR) {
    world.db.poke("users/tess", { admissionsReviewer: true });
    world.db.poke("users/yusuf", { admissionsReviewer: true });
    world.user = sessionOf(who);
    try {
      const element = await Page({ params: Promise.resolve({ roundId: ROUND, programmeId }) });
      const html = renderToStaticMarkup(element);
      return { html, text: text(html), to: null };
    } catch (err) {
      if (err?.to) return { html: "", text: "", to: err.to };
      throw err;
    }
  }

  test("draws the board's list for the lead, with nothing the board has that is not built", async () => {
    await pitchingDone();
    const { html, text: said } = await draw("tess");
    assert.match(said, /Pitches from week 3 \(4\)/);
    assert.match(said, /Unlearning check 3 would join Pitched by Tariq/);
    assert.match(said, /Probe transfer 2 would join Pitched by Amara and Dev/);
    assert.match(said, /Test whether the probes still work on a smaller open model\./);
    for (const absent of ["Became a team", "Not taken forward", "Move to", "Tell everyone their team", "Teams ("]) {
      assert.ok(!said.includes(absent), `the page offers ${absent}`);
    }
    assert.ok(!/<button/.test(html), "the list has a button");
    // The Groups tab's views are drawn for whoever may open the tab, which the
    // programme's lead may, with Pitches the one on screen. Sessions is the
    // row's first view since changing a session landed (wk-session).
    assert.deepEqual(viewsIn(html), ["Sessions", "People in groups", "Times", "Facilitators", "Pitches"]);
    assert.match(html, PITCHES_CURRENT);
  });

  test("an admin also gets the Groups tab's views, with Pitches current", async () => {
    const { html } = await draw("zach");
    assert.deepEqual(viewsIn(html), ["Sessions", "People in groups", "Times", "Facilitators", "Pitches"]);
    assert.match(html, PITCHES_CURRENT);
  });

  test("the reviewer is told the list is the lead's and admins'; somebody else is told there is no programme", async () => {
    const reviewer = await draw("yusuf");
    assert.match(reviewer.text, /Only the lead and admins can open the pitches/);
    assert.ok(!reviewer.text.includes("Pitches from week"));
    world.db.poke("users/claudia", { admissionsReviewer: true });
    assert.match((await draw("claudia")).text, /There is no programme here/);
    assert.equal((await draw("amara")).to, "/dashboard");
  });

  test("with no pitching week it says how to make one, and offers the run editor to an admin only", async () => {
    world.db.poke(`courseRuns/${INC.run}/weeks/w03`, { pitching: false });
    const admin = await draw("zach");
    assert.match(admin.text, /No week of Research incubator’s course run is pitching week\./);
    assert.match(admin.html, new RegExp(`href="/admin/courses/${INC.course}/runs/${INC.run}"`));
    const lead = await draw("tess");
    assert.ok(!lead.html.includes(`/admin/courses/${INC.course}/runs/${INC.run}"`));
  });

  test("the times picture's views name Pitches only for a run with a pitching week, for the lead and an admin", async () => {
    const viewsOnTimes = async (who, programmeId) => {
      // The admissions tree admits a lead through the flag \`draw\` sets too.
      world.db.poke("users/tess", { admissionsReviewer: true });
      world.user = sessionOf(who);
      const element = await TimesPage({
        params: Promise.resolve({ roundId: ROUND, programmeId }),
        searchParams: Promise.resolve({}),
      });
      return viewsIn(renderToStaticMarkup(element));
    };
    // Sessions leads the row for every run since changing a session landed (wk-session).
    for (const who of ["zach", "tess"]) {
      assert.deepEqual(
        await viewsOnTimes(who, INCUBATOR),
        ["Sessions", "People in groups", "Times", "Facilitators", "Pitches"],
        who,
      );
    }
    assert.deepEqual(await viewsOnTimes("zach", AGI), ["Sessions", "People in groups", "Times", "Facilitators"]);
  });
});
