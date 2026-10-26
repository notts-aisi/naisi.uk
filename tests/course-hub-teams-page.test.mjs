/**
 * An incubator's Teams tab, rendered to HTML as every kind of caller (boards
 * in-teams, option C, and in-agenda), and the programme head it sits under.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The page at `.../programmes/[programmeId]/(tabs)/teams` and the `(tabs)`
 * layout are rendered for real, with Next's hooks, its link and every
 * stylesheet stood in. Who is shown what, the boards' words, a real menu for
 * every move and never a drag, controls drawn disabled until the page's
 * script has arrived, the Teams tab only for an incubator, and "Teams by"
 * from the run's own setting.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, AT, CALLERS, INC, INCUBATOR, PITCH, ROUND, makeTeamsWorld, teamsSeed, textOf } from "./lib/teamsWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makeTeamsWorld("__teamsPage");
const { world, reset, ask, loadUi, sessionOf, teamNamed } = made;

const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: Page } = await loadUi(join(TABS, "teams", "page.tsx"));
const { default: Layout } = await loadUi(join(TABS, "layout.tsx"));

beforeEach(() => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
  admitted();
});

/** The flag the form's roles writer keeps, which the admissions tree's gate reads, for the staff named on the form. */
function admitted() {
  for (const uid of ["tess", "yusuf", "claudia"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
}

/** A page as `who` sees it: its HTML and words, or where they were sent. */
async function draw(who, programmeId = INCUBATOR, Component = Page) {
  world.user = sessionOf(who);
  try {
    const element = await Component({ params: Promise.resolve({ roundId: ROUND, programmeId }), children: null });
    const html = renderToStaticMarkup(element);
    return { html, text: textOf(html), to: null };
  } catch (err) {
    if (err?.to) return { html: "", text: "", to: err.to };
    throw err;
  }
}

async function teamsMade() {
  assert.equal((await ask.fromPitch("tess", PITCH.probe)).status, 200);
  assert.equal((await ask.fromPitch("tess", PITCH.reward)).status, 200);
}

/** Every `<select>` in the markup, with its accessible name and its options. */
function menus(html) {
  return [...html.matchAll(/<select[^>]*aria-label="([^"]*)"[^>]*>(.*?)<\/select>/g)].map((m) => ({
    label: m[1].replace(/&#x27;/g, "'"),
    disabled: /disabled=""/.test(m[0].slice(0, m[0].indexOf(">"))),
    options: [...m[2].matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((o) => o[1]),
  }));
}

/** A button's markup, by its words. */
function button(html, words) {
  const found = [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g)].map((m) => m[0]).find((b) => textOf(b) === words);
  assert.ok(found, `no button "${words}"`);
  return found;
}
const isDisabled = (markup) => /^<button[^>]*disabled=""/.test(markup);

describe("who is shown the tab", () => {
  test("the lead and an admin; a reviewer is told it is theirs; anybody else never reaches it", async () => {
    await teamsMade();
    for (const who of ["zach", "tess"]) {
      const page = await draw(who);
      assert.match(page.text, /Pitches from week 3 \(4\)/, who);
      assert.match(page.text, /Teams \(2\)/, who);
    }
    const reviewer = await draw("yusuf");
    assert.match(reviewer.text, /Only the programme’s lead and admins can open Teams/);
    assert.ok(!reviewer.text.includes("Probe transfer"));
    // Claudia is admitted to the admissions pages by her own programme, and has no role on this one.
    assert.match((await draw("claudia")).text, /There is no programme here/);
    for (const [who, words] of CALLERS) {
      if (["zach", "tess", "yusuf", "claudia"].includes(who)) continue;
      const page = await draw(who);
      assert.equal(page.to, "/dashboard", words);
      assert.equal(page.html, "", words);
    }
  });

  test("a fellowship's address says teams are an incubator's", async () => {
    const page = await draw("claudia", AGI);
    assert.match(page.text, /Teams are an incubator’s AGI Strategy is a fellowship, so its people are in groups, and it has no teams\./);
  });

  test("a programme that names no run says who names one", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.runId`]: null });
    assert.match((await draw("tess")).text, /Research incubator doesn’t name a course run yet\. An admin names it on the Settings tab, under Course run\./);
    assert.match((await draw("zach")).text, /Name it on the Settings tab/);
  });

  test("with no way set it says where it is set, and offers the run editor to an admin only", async () => {
    reset(teamsSeed({ madeFrom: null }));
    admitted();
    const admin = await draw("zach");
    assert.match(admin.text, /Nobody has said how Research incubator’s teams are made yet: from the pitches, or from the agenda people ranked on the application form\. Set it in the run editor’s Pitching week section\./);
    assert.match(admin.html, new RegExp(`href="/admin/courses/${INC.course}/runs/${INC.run}"`));
    const lead = await draw("tess");
    assert.match(lead.text, /An admin sets it in the run editor’s Pitching week section\./);
    assert.ok(!lead.html.includes("/admin/courses/"));
  });
});

describe("in-teams, option C: the pitches beside the teams", () => {
  test("the board's words, from the records", async () => {
    await teamsMade();
    const { text } = await draw("tess");
    for (const said of [
      "Pitches from week 3 (4)",
      "Reward hacking evals 5 would join Pitched by Bea Became a team",
      "Probe transfer 3 would join Pitched by Amara and Dev Became a team",
      "Interpretability of chess models 0 would join Pitched by Tariq Not taken forward",
      "Teams (2)",
      "Probe transfer 3 people",
      "Replicate Probes that transfer, then: test whether the probes still work on a smaller open model",
      "Reward hacking evals 4 people",
      "7 of 9 in a team. You can change them until Thu 19 Nov.",
      "Emails 7 people",
    ]) {
      assert.ok(text.includes(said), `missing: ${said}`);
    }
  });

  test("before any team, no pitch says it was or was not taken forward", async () => {
    const { text } = await draw("tess");
    assert.ok(!text.includes("Became a team") && !text.includes("Not taken forward"));
    assert.match(text, /Teams \(0\) No teams yet\. Make a pitch a team with its Make it a team\./);
    assert.match(text, /0 of 9 in a team\./);
  });

  test("every move is a real menu of the group's other teams and No team, named for the person, and nothing drags", async () => {
    await teamsMade();
    const { html } = await draw("tess");
    const found = menus(html);
    assert.deepEqual(found.find((menu) => menu.label === "Move to… (Amara)").options, ["Move to…", "Reward hacking evals", "No team"]);
    assert.deepEqual(found.find((menu) => menu.label === "Move to… (Bea)").options, ["Move to…", "Probe transfer", "No team"]);
    // Kai is in no team: every team of his group, and no "No team".
    assert.deepEqual(found.find((menu) => menu.label === "Move to… (Kai)").options, ["Move to…", "Probe transfer", "Reward hacking evals"]);
    // Omar's group has no team, so there is nothing to move him to.
    assert.ok(!found.some((menu) => menu.label === "Move to… (Omar)"));
    assert.equal(found.length, 8);
    assert.ok(!/draggable/i.test(html), "something on the page drags");
    assert.match(html, /<div class="teamGrid">/);
  });

  test("nothing works before the page's script has arrived; once it has, the press waits for the presser's test", async () => {
    await teamsMade();
    let { html } = await draw("tess");
    assert.ok(menus(html).every((menu) => menu.disabled));
    for (const words of ["Make it a team", "Send a test to me", "Tell everyone their team", "Remove team"]) {
      assert.ok(isDisabled(button(html, words)), `${words} is live before hydration`);
    }
    world.ui.hydrated = true;
    ({ html } = await draw("tess"));
    assert.ok(menus(html).every((menu) => !menu.disabled));
    assert.ok(!isDisabled(button(html, "Make it a team")));
    assert.ok(!isDisabled(button(html, "Send a test to me")));
    assert.ok(isDisabled(button(html, "Tell everyone their team")));
    assert.match(textOf(html), /Send yourself a test first: it’s the first person’s email, marked as a test\./);
    await ask.test("tess");
    ({ html } = await draw("tess"));
    assert.ok(!isDisabled(button(html, "Tell everyone their team")));
    await ask.tell("tess", 7);
    ({ html } = await draw("tess"));
    assert.ok(isDisabled(button(html, "Tell everyone their team")));
    assert.ok(!textOf(html).includes("Emails"));
    assert.match(textOf(html), /Everyone in a team has been told their team\./);
  });

  test("after the day the teams are made, the line keeps the count and drops the day", async () => {
    await teamsMade();
    mock.timers.setTime(new Date("2026-11-20T10:00:00Z").getTime());
    const { text } = await draw("tess");
    assert.match(text, /7 of 9 in a team\. Emails 7 people/);
    assert.ok(!text.includes("You can change them"));
  });

  test("a team outside the sizes says so on its card", async () => {
    await teamsMade();
    await ask.move("tess", "kai", teamNamed("Reward hacking evals").id);
    assert.match((await draw("tess")).text, /Reward hacking evals 5 people Thursday evening Replicate Reward hacking in the wild, then: rebuild the evaluation with tasks written by the team Larger than the largest team, 4 people\./);
  });
});

describe("in-agenda: what people ranked, and the teams", () => {
  beforeEach(() => {
    reset(teamsSeed({ madeFrom: "agenda", sizes: { min: 2, max: 3 } }));
    admitted();
  });

  test("the table, before any team, with the button that makes them", async () => {
    world.ui.hydrated = true;
    const { html, text } = await draw("tess");
    assert.match(text, /What people ranked From the form, for the 9 taking part\. Agenda item Ranked 1st Ranked 2nd Ranked 3rd Team/);
    assert.match(text, /Compute governance 4 3 1 No team International coordination 2 3 1 No team/);
    assert.ok(!isDisabled(button(html, "Make teams from first choices")));
    assert.match(text, /Omar 1st: AI in elections 2nd: Compute governance 3rd: Open-weight models/);
  });

  test("after first choices: each team's initials and size on its row, and each person's ranks down to their team", async () => {
    await ask.fromAgenda("tess");
    const { html, text } = await draw("tess");
    assert.match(text, /Compute governance 4 3 1 A B D Amara, Bea and Dev: 3 people/);
    assert.match(text, /Open-weight models 1 1 3 No team/);
    assert.match(text, /Teams \(3\) Compute governance 3 people/);
    assert.match(text, /Maya 1st: Open-weight models 2nd: Compute governance 3rd: Frontier lab safety policies Move to…/);
    assert.match(text, /8 of 9 in a team\. You can change them until Thu 19 Nov\. Emails 8 people/);
    // The choices above the one a person got are drawn apart from it.
    assert.match(html, /<span class="rankAbove">1st: Open-weight models<\/span><span class="rankAbove">2nd: Compute governance<\/span><span class="rank">3rd: Frontier lab safety policies<\/span>/);
    assert.ok(!html.includes("Make teams from first choices"));
    // in-agenda's cards are wider than in-teams': each row carries its ranks.
    assert.match(html, /<div class="teamGrid teamGridWide">/);
  });

  test("a reviewer of the programme is never shown a ranking", async () => {
    await ask.fromAgenda("tess");
    const { text } = await draw("yusuf");
    assert.ok(!text.includes("1st:") && !text.includes("Compute governance"));
  });
});

describe("the programme's head", () => {
  test("an incubator has a Teams tab after Groups, with its count; the head says Teams by, from the run's setting", async () => {
    await teamsMade();
    world.ui.segment = "teams";
    const lead = await draw("tess", INCUBATOR, Layout);
    // The run is under way, so the head is the run's own line (Overview's), and Teams by is its last fact.
    assert.match(lead.text, /Running · week 2 of 7 T Lead: Tess · 10 taking part in 2 groups · Last sessions Wed 16 Dec · Teams by Thu 19 Nov/);
    assert.match(lead.html, new RegExp(`<a href="/admin/admissions/forms/${ROUND}/programmes/${INCUBATOR}/teams"[^>]*aria-current="page"[^>]*>Teams<span[^>]*>2</span></a>`));
    // People sits after Applications (board st-people), with how many hold a
    // place on the incubator: nobody on the form holds one here.
    assert.match(lead.text, /Overview Interest Applications 0 People 0 Groups 4 Teams 2 Attendance Messages Settings/);
  });

  test("a reviewer sees the tab drawn and not a link", async () => {
    const reviewer = await draw("yusuf", INCUBATOR, Layout);
    assert.match(reviewer.html, /<span class="tab tabPending" aria-disabled="true" title="Not built yet">Teams<span class="tabCount">0<\/span><\/span>/);
    assert.ok(!reviewer.html.includes(`/programmes/${INCUBATOR}/teams"`));
  });

  test("no Teams by without the setting, and no Teams tab for a fellowship", async () => {
    reset(teamsSeed({ teamsMadeOn: null }));
    admitted();
    const lead = await draw("tess", INCUBATOR, Layout);
    assert.ok(!lead.text.includes("Teams by"));
    assert.match(lead.text, /Teams 0/);
    const fellowship = await draw("claudia", AGI, Layout);
    assert.ok(!/>Teams</.test(fellowship.html), "a fellowship has a Teams tab");
    assert.ok(!fellowship.text.includes("Teams by"));
  });
});
