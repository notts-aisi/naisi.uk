/**
 * A programme's Weeks tab (board pr-weeks): the list of the run's weeks, in
 * order, each with its state, its first session from the groups' own
 * calendars, the day it should be ready by and its owner; the line about when
 * weeks open with "Copy weeks from the course"; where the weeks meet; and the
 * tab itself in the programme's row of tabs.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The page at `.../programmes/[programmeId]/(tabs)/weeks` and the `(tabs)`
 * layout are drawn for real (`tests/lib/weeksTabWorld.mjs`) as every kind of
 * caller, on week 3 of AGI Strategy's run, Tue 17 Nov 2026 at noon.
 *
 * Section 6 walks the tree: no page, email or doc may say a week opens after
 * a session, the rule taken away on 27 October 2026 (every published week
 * opens to every group once groups go out).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { A, AGI, B, C, D, NOW, PERSONAS, PROGRAMME_PATH, ROUND, RUN, makeWeeksTabWorld } from "./lib/weeksTabWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWeeksTabWorld("__weeksTabList");
const { world, draw, tabsPage, call, courseRoute } = w;
const Page = await tabsPage("weeks", "page.tsx");
const Layout = await tabsPage("layout.tsx");
const readyRoute = await courseRoute("runs", "[runId]", "weeks", "[weekId]", "ready");
const cloneRoute = await courseRoute("runs", "[runId]", "clone-weeks");
const CopyPage = await tabsPage("weeks", "copy", "page.tsx");

const PARAMS = { roundId: ROUND, programmeId: AGI };
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const weekPath = (id) => `courseRuns/${RUN.agi}/weeks/${id}`;
/** The whole store as one string, to prove drawing a page wrote nothing. */
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

/**
 * Each row of the list, in the words a screen reader is given: "Week 1 Ready
 * First session Thu 29 Oct Ready by Thu 22 Oct Claudia Reyes" (the owner's
 * initials are hidden from it).
 */
function rows(html) {
  return [...html.matchAll(/<li class="row[^"]*">(.*?)<\/li>/g)].map((m) =>
    m[1]
      .replace(/<span[^>]*aria-hidden="true"[^>]*>[^<]*<\/span>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

describe("1. who is shown the tab", () => {
  test("the lead and an admin see the weeks; nothing is written by drawing them", async () => {
    const before = everything();
    for (const who of ["claudia", "zach"]) {
      const page = await draw(who, Page, PARAMS);
      assert.equal(page.to, null, who);
      assert.equal(rows(page.html).length, 6, `${who}: ${page.text}`);
      assert.match(page.html, new RegExp(`href="${PROGRAMME_PATH}/weeks/w03"`), who);
    }
    assert.equal(everything(), before);
  });

  test("a reviewer is told the tab is the lead's and an admin's, with no week read", async () => {
    const page = await draw("lloyd", Page, PARAMS);
    assert.match(page.text, /Only the programme’s lead and admins can open Weeks/);
    assert.match(page.text, /Weeks is where the programme’s weeks are written and marked ready, so only the programme’s lead or an admin can open it\./);
    assert.ok(!page.text.includes("Week 1"), page.text);
  });

  test("the lead of another programme is shown there is no programme here", async () => {
    const page = await draw("tess", Page, PARAMS);
    assert.match(page.text, /There is no programme here/);
    assert.ok(!page.text.includes("Week 1"));
  });

  test("everybody else is sent away by the admissions pages' gate before anything is read", async () => {
    for (const [who, what] of PERSONAS) {
      if (["zach", "claudia", "tess", "lloyd"].includes(who)) continue;
      const page = await draw(who, Page, PARAMS);
      assert.equal(page.to, "/dashboard", what);
      assert.equal(page.html, "", what);
    }
  });

  test("a programme that names no run says who names one", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    assert.match((await draw("claudia", Page, PARAMS)).text, /AGI Strategy doesn’t name a course run yet\. An admin names it on the Settings tab, under Course run\./);
  });

  test("a run that is being destroyed is gone already", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.match((await draw("claudia", Page, PARAMS)).text, /is no longer on the site/);
  });
});

describe("2. each week, as the board draws it", () => {
  test("the line, the link to copy weeks, and the weeks in order", async () => {
    // The line says when weeks open as the pages open them: the board's second sentence ("Each later week
    // opens to a group straight after its previous session.") named the rule taken away on 27 October 2026,
    // when every published week became open to every group once groups go out. The lead and an admin read it.
    for (const who of ["claudia", "zach"]) {
      const drawn = await draw(who, Page, PARAMS);
      assert.match(
        drawn.text,
        /Week 1 opens to everyone holding a place once it’s marked ready\. Once groups go out, every published week opens to every group\. Have each ready 7 days before its first session\./,
        who,
      );
      assert.ok(!drawn.text.includes("previous session"), who);
    }
    const page = await draw("claudia", Page, PARAMS);
    assert.match(page.html, /role="status"/);
    assert.match(page.html, new RegExp(`<a href="${PROGRAMME_PATH}/weeks/copy"[^>]*><span>Copy weeks from the course</span>`));
    assert.match(page.text, /Weeks, in order/);
    assert.match(page.html, /<nav aria-label="Weeks"/);
    assert.match(page.html, /<ol aria-label="Weeks, in order"/);
  });

  test("states: Ready once marked, Draft while it holds something, Empty while it holds nothing", async () => {
    // Week 6 has no page at all, week 5 a block week with nothing in it.
    world.db.seed(weekPath("w05"), { weekNumber: 5, title: "", published: false, blocks: [] });
    await world.db.collection(`courseRuns/${RUN.agi}/weeks`).doc("w06").delete();
    assert.equal(world.db.read(weekPath("w06")), undefined);
    const marked = await call("claudia", readyRoute.PUT, { runId: RUN.agi, weekId: "w01" }, { body: { ready: true }, course: true });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const said = rows((await draw("claudia", Page, PARAMS)).html).map((row) => row.split(" First")[0].split(" No session")[0]);
    assert.deepEqual(said, ["Week 1 Ready", "Week 2 Draft", "Week 3 Draft", "Week 4 Draft", "Week 5 Empty", "Week 6 Empty"]);
  });

  test("a published week not marked ready is Draft, and so is an unpublished one with something in it", async () => {
    world.db.poke(weekPath("w02"), { ready: true });
    world.db.poke(weekPath("w02"), { published: false });
    const said = rows((await draw("zach", Page, PARAMS)).html);
    assert.ok(said[1].startsWith("Week 2 Draft"), said[1]);
  });

  test("first session from the groups' own calendars, and ready by seven days before it", async () => {
    const said = rows((await draw("claudia", Page, PARAMS)).html);
    // Week 1: Group A meets on Thu 29 Oct, before B (Tue 3 Nov), C (Wed 4 Nov) and D (Mon 2 Nov).
    assert.match(said[0], /First session Thu 29 Oct Ready by Thu 22 Oct/);
    assert.match(said[2], /First session Thu 12 Nov Ready by Thu 5 Nov/);
    assert.match(said[5], /First session Thu 3 Dec Ready by Thu 26 Nov/);
  });

  test("a cancelled session is no first session, and a group with its own pace counts on its own calendar", async () => {
    // Group A's week 3 session, Thu 12 Nov, cancelled through "Change a session": Group D's Mon 16 Nov is first.
    world.db.poke(`courseGroups/${A}`, {
      sessionChanges: { w03: { kind: "cancelled", reason: "", dateKey: "2026-11-12", byUid: "claudia", at: NOW } },
    });
    const said = rows((await draw("claudia", Page, PARAMS)).html);
    assert.match(said[2], /First session Mon 16 Nov Ready by Mon 9 Nov/);
  });

  test("a week no group meets in says so, with no ready-by day", async () => {
    for (const group of [A, B, C, D]) world.db.poke(`courseGroups/${group}`, { archived: true });
    const said = rows((await draw("claudia", Page, PARAMS)).html);
    assert.match(said[0], /^Week 1 Draft No session set yet Claudia Reyes$/);
  });

  test("the owner: the lead by default, a helper once chosen, the lead again when the one chosen is no longer one", async () => {
    let said = rows((await draw("claudia", Page, PARAMS)).html);
    assert.ok(said.every((row) => row.endsWith("Claudia Reyes")), said.join("\n"));
    // Yusuf is the run's track lead: a helper.
    world.db.poke(weekPath("w04"), { ownerUid: "yusuf" });
    said = rows((await draw("claudia", Page, PARAMS)).html);
    assert.ok(said[3].endsWith("Yusuf Demir"), said[3]);
    // Rahul is no helper: a stored uid that is neither is shown as the lead.
    world.db.poke(weekPath("w04"), { ownerUid: "rahul" });
    said = rows((await draw("claudia", Page, PARAMS)).html);
    assert.ok(said[3].endsWith("Claudia Reyes"), said[3]);
  });

  test("with no lead standing and no helper, a week has no owner yet", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.leadUid`]: null });
    world.db.poke(`courseRuns/${RUN.agi}`, { trackLeadUids: [] });
    const said = rows((await draw("zach", Page, PARAMS)).html);
    assert.ok(said[0].endsWith("No owner yet"), said[0]);
  });
});

describe("3. where the weeks meet", () => {
  test("in person every week, until every group meeting a week meets online", async () => {
    assert.match((await draw("claudia", Page, PARAMS)).text, /AGI Strategy meets in person every week\./);
    for (const group of [A, B, C, D]) world.db.poke(`courseGroups/${group}`, { sessionModes: { w04: "virtual" } });
    assert.match((await draw("claudia", Page, PARAMS)).text, /AGI Strategy meets online in week 4, and in person the other weeks\./);
  });

  test("some groups online in a week is said apart", async () => {
    world.db.poke(`courseGroups/${B}`, { sessionModes: { w05: "virtual" } });
    for (const group of [A, B, C, D]) {
      const modes = world.db.read(`courseGroups/${group}`).sessionModes ?? {};
      world.db.poke(`courseGroups/${group}`, { sessionModes: { ...modes, w02: "virtual" } });
    }
    assert.match(
      (await draw("claudia", Page, PARAMS)).text,
      /AGI Strategy meets online in week 2 and online for some groups in week 5, and in person the other weeks\./,
    );
  });
});

describe("4. copy weeks from the course", () => {
  const SPRING = `courseRuns/${RUN.agiSpring}`;

  test("with no other run of the course holding weeks, it says so", async () => {
    const page = await draw("claudia", CopyPage, PARAMS);
    assert.match(page.text, /Copy weeks from the course/);
    assert.match(page.text, /No other run of AGI Strategy Fellowship has weeks to copy yet\./);
    assert.match(page.html, new RegExp(`<a href="${PROGRAMME_PATH}/weeks"`), "the way back to the tab");
  });

  test("another run's weeks are offered, and copying keeps every week this run has", async () => {
    for (let n = 1; n <= 7; n += 1) {
      world.db.seed(`${SPRING}/weeks/w0${n}`, { weekNumber: n, title: `Spring week ${n}`, published: false, materials: [] });
    }
    const page = await draw("claudia", CopyPage, PARAMS);
    assert.match(page.text, /Spring 2027 \(2026\/27\) 7 weeks Copy its weeks/);
    assert.ok(!page.text.includes("A saved template"), "the templates line is an admin's");
    assert.match((await draw("zach", CopyPage, PARAMS)).text, /A saved template is applied in the run’s editor\. Open the run’s editor/);

    // The press, as the page sends it: never an overwrite.
    const ours = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [n, JSON.stringify(world.db.read(weekPath(`w0${n}`)))]));
    const copied = await call("claudia", cloneRoute.POST, { runId: RUN.agi }, { body: { fromRunId: RUN.agiSpring, overwrite: false }, course: true });
    assert.equal(copied.status, 200, JSON.stringify(copied.body));
    assert.equal(copied.body.created, 1, "only week 7, which this run does not have");
    assert.equal(copied.body.skipped, 6);
    for (const n of [1, 2, 3, 4, 5, 6]) assert.equal(JSON.stringify(world.db.read(weekPath(`w0${n}`))), ours[n], `week ${n} kept`);
    assert.equal(world.db.read(weekPath("w07")).title, "Spring week 7");
  });

  test("a reviewer is told it is the lead's; everybody else is sent away", async () => {
    assert.match((await draw("lloyd", CopyPage, PARAMS)).text, /Only the programme’s lead and admins can open Weeks/);
    assert.match((await draw("tess", CopyPage, PARAMS)).text, /There is no programme here/);
    for (const [who, what] of PERSONAS) {
      if (["zach", "claudia", "tess", "lloyd"].includes(who)) continue;
      assert.equal((await draw(who, CopyPage, PARAMS)).to, "/dashboard", what);
    }
  });

  test("the press never asks the copy route to overwrite a week the run has", () => {
    const code = readFileSync(join(SRC, "features", "applications", "weeks", "CopyWeeks.tsx"), "utf8");
    assert.match(code, /body: JSON\.stringify\(\{ fromRunId, overwrite: false \}\)/);
    assert.doesNotMatch(code, /overwrite: true/);
    assert.equal([...code.matchAll(/\bfetch\(/g)].length, 1, "one press");
    assert.match(code, /fetch\(`\/api\/courses\/runs\/\$\{encodeURIComponent\(runId\)\}\/clone-weeks`/, "to the one copy route");
  });

  test("the words of what a copy did", async () => {
    const { copiedWords } = await w.lib("courses", "weeksTab", "words.ts");
    assert.equal(copiedWords(1, 6), "1 week copied. 6 weeks this programme already had were left as they were.");
    assert.equal(copiedWords(3, 0), "3 weeks copied.");
    assert.equal(copiedWords(0, 1), "No weeks were copied. 1 week this programme already had was left as it was.");
  });
});

describe("5. the tab in the programme's row", () => {
  test("Weeks sits after Groups and before Attendance, a link with the plan's count for the lead and an admin", async () => {
    for (const who of ["claudia", "zach"]) {
      const head = await draw(who, Layout, PARAMS, { segment: "weeks" });
      assert.match(head.html, new RegExp(`<a href="${PROGRAMME_PATH}/weeks"[^>]*aria-current="page"[^>]*>Weeks<span[^>]*>6</span></a>`), who);
      // Coursework sits between Attendance and Messages (Zach, Fri 30 Oct).
      assert.match(head.text, /Groups 4 Weeks 6 Attendance Coursework Messages/, who);
    }
  });

  test("a reviewer is drawn no Weeks tab, linked or not, and no count", async () => {
    const head = await draw("lloyd", Layout, PARAMS, { segment: "applications" });
    assert.doesNotMatch(head.text, /\bWeeks\b/);
    assert.ok(!head.html.includes(`${PROGRAMME_PATH}/weeks"`));
    assert.match(head.html, new RegExp(`<a href="${PROGRAMME_PATH}/applications"[^>]*aria-current="page"[^>]*>Applications<`));
  });

  // The Groups tab counts the run's groups that still meet once the
  // programme names a run, as the head's "in 3 groups" does; the form's
  // planned number before a run is named. A reviewer, who does not open the
  // run, is drawn no Groups tab at all, and reads the form's planned number in
  // the head's line (walk 4b, L10).
  test("Groups counts the run's groups that still meet for the lead and an admin; the form's planned number with no run, and in a reviewer's head", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.groupCount`]: 6 });
    world.db.poke(`courseGroups/${D}`, { archived: true });
    for (const who of ["claudia", "zach"]) {
      assert.match((await draw(who, Layout, PARAMS, { segment: "weeks" })).text, /Groups 3 Weeks 6 /, who);
    }
    const reviewer = await draw("lloyd", Layout, PARAMS, { segment: "applications" });
    assert.match(reviewer.text, / in 6 groups /);
    const nav = /<nav class="tabs" aria-label="Sections">([\s\S]*?)<\/nav>/.exec(reviewer.html)?.[1] ?? "";
    assert.deepEqual([...nav.matchAll(/<(a|span)\b[^>]*class="tab[ "][^>]*>([A-Za-z]+)/g)].map((m) => [m[1], m[2]]), [["a", "Applications"]]);
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    assert.match((await draw("claudia", Layout, PARAMS, { segment: "weeks" })).text, /Groups 6 Weeks /);
  });

  test("with no run named, the tab is still a link and carries no count", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    const head = await draw("claudia", Layout, PARAMS, { segment: "weeks" });
    assert.match(head.html, new RegExp(`<a href="${PROGRAMME_PATH}/weeks"[^>]*>Weeks</a>`));
  });
});

// ---------------------------------------------------------------------------
// 6. One rule for when a week opens, everywhere a person reads it
// ---------------------------------------------------------------------------

describe("6. the tree says one rule for when a week opens", () => {
  /** A sentence that says something opens after a session. */
  const OPENS_AFTER = /\b(opens?|opened)\b[^.?!"`\n]{0,60}\bafter\b[^.?!"`\n]{0,40}\bsession\b/i;
  /**
   * What may still open after a session, because it is not a week. Each is checked both ways: a word here
   * that excuses no sentence fails, so a word cannot sit here and hide the next sentence that needs reading.
   */
  const NOT_A_WEEK = new Map([
    ["card", "a sealed predictions card keeps the old clock for itself: it opens after the group's session before its week"],
    ["notes", "a facilitator's notes on a person stay open to the facilitator, who writes them after the session"],
  ]);

  /** Every sentence a person reads: the pages' and emails' strings and words in `src`, and the docs. */
  function sentences() {
    const out = [];
    for (const file of walkSource(SRC)) {
      // Comments are left out; an interpolation reads as one word, so a template's sentence is read whole.
      const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true }).replace(/\$\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, "X");
      for (const piece of code.split(/(?<=[.?!])\s+|\n/)) out.push([relative(SRC, file).split(sep).join("/"), piece.trim()]);
    }
    const DOCS = join(SRC, "..", "docs");
    for (const name of readdirSync(DOCS).filter((entry) => entry.endsWith(".md")).sort()) {
      const text = readFileSync(join(DOCS, name), "utf8").replace(/\n(?!\n)/g, " ");
      for (const piece of text.split(/(?<=[.?!])\s+/)) out.push([`docs/${name}`, piece.trim()]);
    }
    return out;
  }

  test("no page, email or doc says a week opens after a session (the rule taken away on 27 October 2026)", () => {
    // Every published week opens to every group once groups go out; before that week 1 alone, once it is
    // ready. The sentences of the old rule ("Each later week opens to a group straight after its previous
    // session.", "Week 4 opens after your session", "Opens tonight, after your session") promised a wait
    // nothing keeps.
    const used = new Set();
    const found = [];
    for (const [where, sentence] of sentences()) {
      if (!OPENS_AFTER.test(sentence)) continue;
      const excused = [...NOT_A_WEEK.keys()].find((word) => new RegExp(`\\b${word}\\b`, "i").test(sentence));
      if (excused) used.add(excused);
      else found.push(`${where}: ${sentence.slice(0, 160)}`);
    }
    assert.deepEqual(found, []);
    assert.deepEqual([...NOT_A_WEEK.keys()].filter((word) => !used.has(word)), [], "a word that excuses nothing");
    for (const [, why] of NOT_A_WEEK) assert.ok(why.length > 20);
  });

  test("the guard reads the old rule's sentences as the old rule", () => {
    for (const old of [
      "Week 1 opens to everyone holding a place once it’s marked ready. Each later week opens to a group straight after its previous session.",
      "Each week opens straight after your previous session.",
      "Week X opens after your session",
      "Opens X, after your session",
      "It opens on X, after your session.",
    ]) {
      assert.ok(old.split(/(?<=[.?!])\s+/).some((piece) => OPENS_AFTER.test(piece)), old);
    }
    assert.ok(!OPENS_AFTER.test("Once groups go out, every published week opens to every group."));
  });
});
