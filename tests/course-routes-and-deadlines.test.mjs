/**
 * A course's routes and deadlines as records (Zach, Mon 26 Oct: "build them
 * all"; Technical AI Safety's MAP, "Things this course needs" 4): one record
 * per route, grouped as the guide groups them, under the day they were
 * checked, set by an admin in one place, and read by the week that asks for
 * them in place of the guide's own tables.
 *
 * Driven through the real route (`/api/courses/[courseId]/routes`), the week
 * page's real server shell and the real pages, as every kind of caller: Zach,
 * an admin; Claudia, the programme's lead; Lloyd, a reviewer; Yusuf, the
 * run's track lead; Tess, who leads another programme; Rahul and Sofia, who
 * facilitate; Chloe, taking part; a view-as session; and somebody signed out.
 *
 *  1. The record and its Markdown: the guide's own shape read, written back
 *     as it was, and everything that would stop a save said in a sentence.
 *  2. Where a route stands today: a deadline gone by says so.
 *  3. Set by an admin in one place, and refused to everybody else.
 *  4. The week that asks for them shows them in place of the guide's tables.
 *  5. The course editor's card.
 *
 * Every route here is made up, on example.com or example.org; the clock is
 * Fri 4 Dec 2026, so a deadline in November has gone by.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { COURSE, NOW6, makeRoutesCardRenderer, makeWeekSixWorld, textOf } from "./lib/weekSixWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW6 });

const w = await makeWeekSixWorld("__routesSuite");
const renderCard = await makeRoutesCardRenderer();
const model = await w.loadTs(join("lib", "courses", "routes", "model.ts"));
const words = await w.loadTs(join("lib", "courses", "routes", "words.ts"));
const write = await w.loadTs(join("lib", "courses", "routes", "write.ts"));
const markdown = await w.loadTs(join("lib", "courses", "routes", "markdown.ts"));
const routesRoute = await w.courseRoute("[courseId]", "routes");

beforeEach(() => {
  mock.timers.setTime(NOW6.getTime());
  w.reset();
});

const COURSE_PATH = `courses/${COURSE.agi}`;

/** The guide's shape, with every column a list can have. Every route is made up. */
const LIST = [
  "Checked on 1 November 2026. Dates change, so check each route's own page before you apply.",
  "",
  "**Part-time, alongside a degree**",
  "",
  "| Route | What it is | Who it suits | Deadline | Next round |",
  "| --- | --- | --- | --- | --- |",
  "| [The night school](https://example.com/night) | Evening classes on lamps, with a [planner](https://example.com/night/plan). | Anyone who can climb | 20 November 2026 | This round closes on 20 November 2026 |",
  "| [The open workshop](https://example.org/workshop) | Mend a lamp with others, online. | | Rolling | |",
  "| [The winter course](https://example.com/winter) | Six weeks of lamp lore. | | 15 January 2027 | Applications open now |",
  "",
  "**Full-time, for a summer**",
  "",
  "| Route | What it is | Next round |",
  "| --- | --- | --- |",
  "| [The summer tower](https://example.com/tower) | Ten weeks on a real lighthouse. | Not announced yet |",
  "",
  "**Funding:** [The lamp fund](https://example.org/fund) gives small grants, on a rolling basis.",
  "",
].join("\n");

const run = (text, marks = {}) => ({ text, ...marks });

/** The list above, as the record holds it. */
const LIST_RECORD = {
  checkedOn: "2026-11-01",
  intro: [{ type: "p", runs: [run("Dates change, so check each route's own page before you apply.")] }],
  groups: [
    {
      heading: "Part-time, alongside a degree",
      routes: [
        {
          name: "The night school",
          url: "https://example.com/night",
          what: [run("Evening classes on lamps, with a "), run("planner", { href: "https://example.com/night/plan" }), run(".")],
          suits: [run("Anyone who can climb")],
          deadline: "2026-11-20",
          rolling: false,
          nextRound: [run("This round closes on 20 November 2026")],
        },
        { name: "The open workshop", url: "https://example.org/workshop", what: [run("Mend a lamp with others, online.")], suits: [], deadline: null, rolling: true, nextRound: [] },
        { name: "The winter course", url: "https://example.com/winter", what: [run("Six weeks of lamp lore.")], suits: [], deadline: "2027-01-15", rolling: false, nextRound: [run("Applications open now")] },
      ],
    },
    {
      heading: "Full-time, for a summer",
      routes: [{ name: "The summer tower", url: "https://example.com/tower", what: [run("Ten weeks on a real lighthouse.")], suits: [], deadline: null, rolling: false, nextRound: [run("Not announced yet")] }],
    },
  ],
  after: [{ type: "p", runs: [run("Funding:", { bold: true }), run(" "), run("The lamp fund", { href: "https://example.org/fund" }), run(" gives small grants, on a rolling basis.")] }],
};

/** Each phrase appears, and in this order. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const found = text.indexOf(phrase, from);
    assert.ok(found >= 0, `missing, or out of order: "${phrase}"`);
    from = found + phrase.length;
  }
}

const save = (who, body, options = {}) => w.call(who, routesRoute.PUT, { courseId: COURSE.agi }, { course: true, body, ...options });
const readIt = (who, body, options = {}) => w.call(who, routesRoute.POST, { courseId: COURSE.agi }, { course: true, body, ...options });

/** Week 6's "Where to go next" section, as the page draws it. */
function nextSection(html) {
  const from = html.indexOf('id="block-k6-next"');
  const to = html.indexOf('id="block-k6-gf"');
  assert.ok(from >= 0 && to > from, "week 6's Where to go next is not on the page");
  return html.slice(from, to);
}

// ---------------------------------------------------------------------------
// 1. The record and its Markdown
// ---------------------------------------------------------------------------

describe("1. the record and its Markdown", () => {
  test("the guide's shape reads as one record per route, grouped as the guide groups them, under the day they were checked", () => {
    const read = markdown.readRoutesMarkdown(LIST);
    assert.deepEqual(read.problems, []);
    assert.deepEqual(read.routes, LIST_RECORD);
  });

  test("the guide's own tables (Route, What it is, Next round) read with no deadline anywhere, and a heading over them is the week's", () => {
    const guide = [
      "## Where to go next",
      "",
      "Checked on 25 October 2026. Dates change.",
      "",
      "**Part-time**",
      "",
      "| Route | What it is | Next round |",
      "| --- | --- | --- |",
      "| [A sprint](https://example.com/sprint) | Five weeks, remote. | Rolling |",
      "",
    ].join("\n");
    const read = markdown.readRoutesMarkdown(guide);
    assert.deepEqual(read.problems, []);
    assert.equal(read.routes.checkedOn, "2026-10-25");
    assert.deepEqual(read.routes.groups[0].routes[0], {
      name: "A sprint",
      url: "https://example.com/sprint",
      what: [run("Five weeks, remote.")],
      suits: [],
      deadline: null,
      // A next round that says "Rolling" is words: only the Deadline column makes a route rolling.
      rolling: false,
      nextRound: [run("Rolling")],
    });
  });

  test("written back exactly as it was read, and read back as the same record", () => {
    const text = write.routesToMarkdown(LIST_RECORD);
    assert.equal(text, LIST);
    const again = markdown.readRoutesMarkdown(text);
    assert.deepEqual(again.problems, []);
    assert.deepEqual(again.routes, LIST_RECORD);
    // A table writes only the columns its routes use.
    assert.match(text, /\| Route \| What it is \| Next round \|\n\| --- \| --- \| --- \|\n\| \[The summer tower\]/);
    // A list whose words before the first table are not a paragraph keeps them as they were.
    const bare = { ...LIST_RECORD, intro: [{ type: "ul", items: [{ runs: [run("One thing.")] }] }] };
    assert.deepEqual(markdown.readRoutesMarkdown(write.routesToMarkdown(bare)).routes, bare);
    const none = { ...LIST_RECORD, intro: [], after: [] };
    assert.deepEqual(markdown.readRoutesMarkdown(write.routesToMarkdown(none)).routes, none);
  });

  test("days in the forms people write them, and no day that does not exist", () => {
    for (const [said, key] of [
      ["1 November 2026", "2026-11-01"],
      ["1 Nov 2026", "2026-11-01"],
      ["Sun 1 Nov 2026", "2026-11-01"],
      ["Sunday, 1 November 2026", "2026-11-01"],
      ["1 Sept 2026", "2026-09-01"],
      ["2026-11-01", "2026-11-01"],
      ["31 November 2026", null],
      ["2026-02-30", null],
      ["early November", null],
      ["1 Nov", null],
      ["ma 2026", null],
    ]) {
      assert.equal(words.dateKeyFromWords(said), key, said);
    }
    assert.equal(words.longDateWords("2026-11-01"), "1 November 2026");
    assert.equal(words.checkedOnWords("2026-10-25"), "Checked on 25 October 2026.");
  });

  test("what would stop a save is said in a sentence, and a list with any of it is not saved", () => {
    const problemsOf = (text) => markdown.readRoutesMarkdown(text).problems;
    const table = "| Route | What it is |\n| --- | --- |\n| [A](https://example.com/a) | One. |";
    assert.deepEqual(problemsOf(""), ["Paste the routes: the day you checked them, then each group’s heading in bold and its table."]);
    assert.deepEqual(problemsOf(table), ["Start with the day you checked them, like “Checked on 25 October 2026.”"]);
    assert.deepEqual(problemsOf(`Checked on 31 November 2026.\n\n${table}`), [
      "“Checked on 31 November 2026” isn’t a day: write the day, the month and the year, like “Checked on 25 October 2026.”",
    ]);
    assert.deepEqual(problemsOf("Checked on 1 November 2026."), ["There’s no table of routes: each group’s routes go in a table whose first column is Route."]);
    assert.deepEqual(problemsOf("Checked on 1 November 2026.\n\n| Name | What it is |\n| --- | --- |\n| [A](https://example.com/a) | One. |"), [
      "The first column of a table has to be Route.",
      "There’s no table of routes: each group’s routes go in a table whose first column is Route.",
    ]);
    assert.deepEqual(problemsOf("Checked on 1 November 2026.\n\n| Route | What it is | Cost |\n| --- | --- | --- |\n| [A](https://example.com/a) | One. | Free |"), [
      "A column we don’t know in a table, “Cost”: the columns are Route, What it is, Who it suits, Deadline and Next round.",
    ]);
    assert.deepEqual(problemsOf("Checked on 1 November 2026.\n\n| Route | Next round |\n| --- | --- |\n| [A](https://example.com/a) | Soon |"), [
      "A table needs a What it is column.",
      "Say what “A” is.",
    ]);
    assert.deepEqual(problemsOf("Checked on 1 November 2026.\n\n| Route | What it is |\n| --- | --- |\n| A school | One. |"), [
      "“A school” needs to be the route’s name as one link starting https://, like [SPAR](https://sparai.org/).",
      "A table has no routes in it.",
    ]);
    const twoLinks = problemsOf("Checked on 1 November 2026.\n\n| Route | What it is |\n| --- | --- |\n| [A](https://example.com/a) [B](https://example.com/b) | One. |");
    assert.ok(twoLinks.includes("“A B” needs to be the route’s name as one link starting https://, like [SPAR](https://sparai.org/)."), twoLinks.join(" | "));
    assert.deepEqual(problemsOf("Checked on 1 November 2026.\n\n| Route | What it is |\n| --- | --- |\n| [A](http://example.com/a) | One. |"), [
      "“http://example.com/a” isn’t a link starting https://: write it with https://, or as words without a link.",
      "“A” needs to be the route’s name as one link starting https://, like [SPAR](https://sparai.org/).",
      "A table has no routes in it.",
    ]);
    assert.deepEqual(problemsOf("Checked on 1 November 2026.\n\n| Route | What it is | Deadline |\n| --- | --- | --- |\n| [A](https://example.com/a) | One. | early Nov |"), [
      "The deadline for “A”, “early Nov”, isn’t a day: write a day like 1 November 2026, or Rolling, or leave it empty.",
    ]);
    assert.deepEqual(problemsOf(`Checked on 1 November 2026.\n\n${table}\n\nA stray line.\n\n**Next**\n\n${table}`), [
      "Between two tables there can only be the next group’s heading, in bold on its own line: move “A stray line.” before the first table or after the last.",
    ]);
    const many = Array.from({ length: 31 }, (_, i) => `| [R${i}](https://example.com/${i}) | One. |`).join("\n");
    assert.deepEqual(problemsOf(`Checked on 1 November 2026.\n\n**Lots**\n\n| Route | What it is |\n| --- | --- |\n${many}`), [
      "“Lots” has 31 routes; the most is 30.",
    ]);
    const long = "x".repeat(121);
    assert.deepEqual(problemsOf(`Checked on 1 November 2026.\n\n| Route | What it is |\n| --- | --- |\n| [${long}](https://example.com/a) | One. |`), [
      `“${long.slice(0, 40)}…” is 121 characters long; the most for a name is 120.`,
    ]);
    assert.deepEqual(problemsOf("x".repeat(60_001)), ["That’s 60001 characters; the most a list of routes can be is 60000."]);
    assert.deepEqual(problemsOf(`Checked on 1 November 2026. ![a lamp](https://example.com/lamp.png)\n\n${table}`), [
      "Pictures can’t go in the routes: take them out.",
    ]);
  });

  test("a stored list is read inside the caps, and a route with no https link or no name is left out", () => {
    const stored = structuredClone(LIST_RECORD);
    stored.groups[0].routes.push({ name: "", url: "https://example.com/x", what: [run("No name.")] });
    stored.groups[0].routes.push({ name: "Plain", url: "http://example.com/plain", what: [run("Not https.")] });
    stored.groups[1].routes[0].rolling = true;
    stored.groups[1].routes[0].deadline = "2026-12-01";
    const read = model.normalizeCourseRoutes(stored);
    assert.equal(read.groups[0].routes.length, 3);
    // Rolling and a deadline never go together: rolling wins on the read side.
    assert.equal(read.groups[1].routes[0].rolling, true);
    assert.equal(read.groups[1].routes[0].deadline, null);
    assert.equal(model.normalizeCourseRoutes({ ...LIST_RECORD, checkedOn: "soon" }), null);
    assert.equal(model.normalizeCourseRoutes({ checkedOn: "2026-11-01", groups: [] }), null);
    assert.equal(model.normalizeCourseRoutes("a list"), null);
    assert.equal(model.normalizeCourseRoutes(null), null);
  });
});

// ---------------------------------------------------------------------------
// 2. Where a route stands today
// ---------------------------------------------------------------------------

describe("2. where a route stands today", () => {
  test("a deadline gone by says so; the day itself is still open; rolling is rolling", () => {
    const today = "2026-12-04";
    assert.deepEqual(model.routeStanding({ deadline: "2026-12-03", rolling: false }, today), { kind: "closed", deadline: "2026-12-03" });
    assert.deepEqual(model.routeStanding({ deadline: "2026-12-04", rolling: false }, today), { kind: "open", deadline: "2026-12-04" });
    assert.deepEqual(model.routeStanding({ deadline: null, rolling: true }, today), { kind: "rolling" });
    assert.deepEqual(model.routeStanding({ deadline: null, rolling: false }, today), { kind: "none" });
    assert.equal(words.closedOnWords("2026-11-20", today), "Closed on Fri 20 Nov");
    assert.equal(words.applyByWords("2026-12-11", today), "Apply by Fri 11 Dec");
    assert.equal(words.applyByWords("2027-01-15", today), "Apply by Fri 15 Jan 2027");
  });

  test("the routes still worth mentioning leave out every route whose round has closed", () => {
    const open = model.openRoutes(LIST_RECORD, "2026-12-04");
    assert.deepEqual(open.map((entry) => entry.route.name), ["The open workshop", "The winter course", "The summer tower"]);
    assert.deepEqual(open.map((entry) => entry.heading), ["Part-time, alongside a degree", "Part-time, alongside a degree", "Full-time, for a summer"]);
    assert.equal(model.openRoutes(LIST_RECORD, "2026-11-20").length, 4, "on its last day a round is still open");
  });

  test("a week asks for them with a section whose table's first column is Route", () => {
    const week = w.storedWeekSix();
    const sections = week.blocks.filter((block) => block.type === "text");
    assert.deepEqual(sections.filter((block) => model.isRoutesSection(block)).map((block) => block.heading), ["Where to go next"]);
    const bullets = { id: "tx-1", type: "text", role: "section", heading: "Where to go next", time: "", body: [{ type: "ul", items: [{ runs: [run("With the society.")] }] }] };
    assert.equal(model.isRoutesSection(bullets), false, "a list of places to go, with no table, is the guide's words");
    const otherTable = { ...bullets, body: [{ type: "table", header: [{ runs: [run("Name")] }], rows: [] }] };
    assert.equal(model.isRoutesSection(otherTable), false);
    const why = { ...sections.find((block) => model.isRoutesSection(block)), role: "why" };
    assert.equal(model.isRoutesSection(why), false, "only a section of the guide's own");
  });
});

// ---------------------------------------------------------------------------
// 3. Set by an admin in one place
// ---------------------------------------------------------------------------

describe("3. set by an admin in one place", () => {
  test("an admin reads a list, saves it, and takes it off; what is stored is what was read, field by field", async () => {
    const before = w.everything();
    const read = await readIt("zach", { markdown: LIST });
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, { routes: LIST_RECORD, problems: [] });
    assert.equal(w.everything(), before, "reading a list wrote something");

    const saved = await save("zach", { markdown: LIST });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, { ok: true, routes: LIST_RECORD });
    const course = w.world.db.read(COURSE_PATH);
    assert.deepEqual(course.routes, LIST_RECORD);
    assert.equal(course.title, "AGI Strategy Fellowship", "the rest of the course is left as it was");
    assert.deepEqual(w.lib.courses.normalizeCourse(COURSE.agi, course).routes, LIST_RECORD);

    const off = await save("zach", { remove: true });
    assert.equal(off.status, 200);
    assert.equal(w.world.db.read(COURSE_PATH).routes, null);
    assert.equal(w.lib.courses.normalizeCourse(COURSE.agi, w.world.db.read(COURSE_PATH)).routes, null);
  });

  test("a list with a problem is not saved, and says what to change", async () => {
    await save("zach", { markdown: LIST });
    const bad = await save("zach", { markdown: LIST.replace("20 November 2026 |", "late November |") });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "The deadline for “The night school”, “late November”, isn’t a day: write a day like 1 November 2026, or Rolling, or leave it empty.");
    assert.deepEqual(w.world.db.read(COURSE_PATH).routes, LIST_RECORD, "the list saved before is left as it was");
    for (const body of [{}, { markdown: 42 }, "not an object"]) {
      assert.equal((await save("zach", body)).status, 400, JSON.stringify(body));
      assert.equal((await readIt("zach", body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await save("zach", { markdown: "" })).status, 400);
  });

  test("refused to everybody but an admin, before anything is read; view-as first; a course that is not there", async () => {
    const before = w.everything();
    for (const who of ["claudia", "lloyd", "yusuf", "tess", "rahul", "sofia", "chloe"]) {
      const answer = await save(who, { markdown: LIST });
      assert.equal(answer.status, 403, who);
      assert.equal(answer.body.error, "Only an admin can change a course’s routes and deadlines.");
      assert.equal((await readIt(who, { markdown: LIST })).status, 403, who);
    }
    assert.equal((await save(null, { markdown: LIST })).status, 401);
    assert.equal((await readIt(null, { markdown: LIST })).status, 401);
    assert.equal((await save("zach", { markdown: LIST }, { viewAs: true })).status, 403, "a view-as session is refused first");
    assert.equal((await readIt("zach", { markdown: LIST }, { viewAs: true })).status, 403);
    assert.equal(w.everything(), before, "a refused request wrote something");
    assert.equal((await w.call("zach", routesRoute.PUT, { courseId: "a/b" }, { course: true, body: { markdown: LIST } })).status, 404);
    assert.equal((await w.call("zach", routesRoute.PUT, { courseId: "no-such-course" }, { course: true, body: { markdown: LIST } })).status, 404);
  });
});

// ---------------------------------------------------------------------------
// 4. The week that asks for them
// ---------------------------------------------------------------------------

describe("4. the week that asks for them", () => {
  test("with no record, the week shows the guide's own tables as written", async () => {
    const { html } = await w.weekPage("chloe", 6);
    const section = nextSection(html);
    inOrder(textOf(section), [
      "Where to go next",
      "Checked on 1 November 2026. Dates change, so check each lighthouse's own page before you apply.",
      "Part-time, alongside a degree",
      "Route What it is Next round The night school Evening classes on lamps. Applications close on 20 November 2026",
      "Full-time, for a summer",
      "Funding: The lamp fund gives small grants, on a rolling basis.",
    ]);
    assert.match(section, /<div class="table"><table>/);
  });

  test("once the course has a record, the week shows it in place of the tables, and a route past its deadline says so", async () => {
    assert.equal((await save("zach", { markdown: LIST })).status, 200);
    const { html } = await w.weekPage("chloe", 6);
    const section = nextSection(html);
    inOrder(textOf(section), [
      "Where to go next",
      "Checked on 1 November 2026. Dates change, so check each route's own page before you apply.",
      "Part-time, alongside a degree",
      "The night school",
      "Evening classes on lamps, with a planner.",
      "Who it suits Anyone who can climb",
      "Closed on Fri 20 Nov",
      "This round closes on 20 November 2026",
      "The open workshop",
      "Mend a lamp with others, online.",
      "Rolling",
      "The winter course",
      "Six weeks of lamp lore.",
      "Apply by Fri 15 Jan 2027",
      "Applications open now",
      "Full-time, for a summer",
      "The summer tower",
      "Ten weeks on a real lighthouse.",
      "Not announced yet",
      "Funding: The lamp fund gives small grants, on a rolling basis.",
    ]);
    // In place of the guide's tables, not beside them.
    assert.doesNotMatch(section, /<table>/);
    assert.ok(!textOf(section).includes("Checked on 1 November 2026. Dates change, so check each lighthouse's own page"));
    // Each route's name is its link; the route that has closed is marked so.
    assert.match(section, /<a href="https:\/\/example\.com\/night" class="nameLink" target="_blank" rel="noopener noreferrer">The night school<svg/);
    assert.match(section, /<li class="route closed">/);
    assert.equal((section.match(/<li class="route">/g) ?? []).length, 3);
    assert.match(section, /<h3 class="heading">Part-time, alongside a degree<\/h3>/);
  });

  test("the same list for everybody who reads the week: a facilitator and an admin", async () => {
    await save("zach", { markdown: LIST });
    for (const who of ["rahul", "zach"]) {
      const { html } = await w.weekPage(who, 6);
      assert.match(textOf(nextSection(html)), /The night school .* Closed on Fri 20 Nov/, who);
    }
  });

  test("the server shell hands the page the list alone, read from the run's course", async () => {
    await save("zach", { markdown: LIST });
    const shell = await w.weekShell("chloe", 6);
    assert.deepEqual(shell.props.routes, LIST_RECORD);
    assert.deepEqual(Object.keys(shell.props.routes).sort(), ["after", "checkedOn", "groups", "intro"]);
    // A run whose course has none, and a stored value that is not a list, hand nothing.
    w.world.db.poke(COURSE_PATH, { routes: { checkedOn: "never", groups: "none" } });
    assert.ok(!("routes" in (await w.weekShell("chloe", 6)).props), "a course with no list hands the page nothing new");
    const { html } = await w.weekPage("chloe", 6);
    assert.match(nextSection(html), /<div class="table"><table>/, "the guide's tables come back");
  });

  test("a week with no section of routes is drawn as before, whatever the course holds", async () => {
    const without = (await w.weekPage("chloe", 1)).text;
    await save("zach", { markdown: LIST });
    assert.equal((await w.weekPage("chloe", 1)).text, without);
    assert.ok(!without.includes("Checked on"));
  });
});

// ---------------------------------------------------------------------------
// 5. The course editor's card
// ---------------------------------------------------------------------------

describe("5. the course editor's card", () => {
  test("an admin sees the list with where each route stands, its copy to change, and the three buttons", () => {
    const { text, html } = renderCard("admin", { courseId: COURSE.agi, stored: LIST_RECORD });
    inOrder(text, [
      "Routes and deadlines",
      "Where a week lists routes in a table whose first column is Route (Technical AI Safety’s week 6), its page shows these instead, and a route whose deadline has gone by says so.",
      "Checked on 1 November 2026.",
      "Part-time, alongside a degree",
      "The night school",
      "Closed on Fri 20 Nov",
      "The open workshop",
      "Rolling",
      "The winter course",
      "Apply by Fri 15 Jan 2027",
      "Full-time, for a summer",
      "The summer tower",
      "No deadline",
      "The routes, as the guide writes them",
      "Read it",
      "Save the routes",
      "Take them off",
    ]);
    // The box holds the list as its copy, ready to change and paste back.
    const box = /<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(html);
    assert.ok(box, "no box to change the list in");
    assert.equal(box[1].replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), write.routesToMarkdown(LIST_RECORD));
    assert.match(html, /<label for="([^"]+)"[^>]*>The routes, as the guide writes them<\/label>/);
  });

  test("anybody else who can open the course sees the list and that an admin changes it", () => {
    const { text, html } = renderCard("committee", { courseId: COURSE.agi, stored: LIST_RECORD });
    inOrder(text, ["Routes and deadlines", "Checked on 1 November 2026.", "The night school", "Closed on Fri 20 Nov", "Only an admin can change these."]);
    assert.doesNotMatch(html, /<textarea/);
    assert.ok(!text.includes("Save the routes"));
  });

  test("a course with none says so, and an admin starts from an empty box", () => {
    const admin = renderCard("admin", { courseId: COURSE.agi, stored: null });
    assert.match(admin.text, /No routes and deadlines yet: a week that lists routes shows the guide’s own tables\./);
    assert.ok(!admin.text.includes("Take them off"), "nothing to take off");
    assert.match(admin.html, /<textarea[^>]*><\/textarea>/);
  });
});
