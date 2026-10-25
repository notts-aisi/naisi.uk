/**
 * Who finished on the programme's own pages, as every kind of caller: the
 * Overview's section (board en-finish), the line before the end, the rule's
 * card on Settings, and the head over the tabs.
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/overview
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/setup
 *   the programme's layout (the line under its name)
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE SECTION once the last session is over, leading the Overview, in
 *     the board's words: the rule's sentence, the counts, "Fewest sessions
 *     first", a row per person with their group, came to, exercises, what
 *     they missed or were excused, and a Finished switch labelled with their
 *     name, "Changed by you" beside the lead's own change; then "Left the
 *     programme" with the day each left and no switch; then the note on a
 *     cancelled session. A lead sees the people Publish told; an admin
 *     everybody placed, ten rows and "+1 more".
 *  2. BEFORE THE END the Overview has no section, and its People card says
 *     when it can be done, with the way to Settings while there is no rule.
 *  3. THE RULE'S CARD on Settings, for the lead and admins, holding the
 *     number; nobody else is drawn it, and a lead's page reads nothing of the
 *     run beyond the rule's own document.
 *  4. THE HEAD: "Finished · Wed 9 Dec" and how many took part, from the
 *     last session's end; before it, the running line.
 *  5. The switches are not pressable before the page is live, no address
 *     reaches any of it, and drawing a page writes nothing.
 *
 * Real: the pages, the layout, the section's component, the libraries. Faked:
 * the session, the Admin SDK handle, `next/link`, `next/navigation`, the
 * stylesheets and the clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  AGI,
  BEFORE,
  END,
  ROUND,
  RULE,
  decision,
  decisionPath,
  makeFinishWorld,
  rulePath,
  textOf,
} from "./lib/finishWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: END });

const made = await makeFinishWorld("__finishPages");
const { world, reset, pages, renderPage, head, everything } = made;

const PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
  world.db.seed(rulePath, RULE(4));
  world.db.seed(decisionPath("kofi"), decision("kofi", true, "claudia"));
});

/** The section's own HTML, cut out of the Overview. */
function sectionHtml(html) {
  const start = html.indexOf('aria-labelledby="who-finished"');
  if (start < 0) return "";
  const open = html.lastIndexOf("<section", start);
  const close = html.indexOf("</section>", start);
  return html.slice(open, close + "</section>".length);
}

/** Each row of the section: [name, group, came to, exercises, line, checked, mark]. */
function rowsOf(html) {
  const body = sectionHtml(html);
  const rows = [];
  for (const match of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = match[1];
    const label = /aria-label="Finished: ([^"]+)"/.exec(row);
    if (!label) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => textOf(cell[1]));
    rows.push({
      name: label[1],
      cells,
      checked: /<input[^>]*checked=""/.test(row),
      changed: /Changed by you/.test(row) ? "Changed by you" : null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 1. The section
// ---------------------------------------------------------------------------

describe("1. the section, once the last session is over", () => {
  test("leads the Overview in the board's words, for the lead", async () => {
    const drawn = await renderPage(pages.overview, "claudia");
    const text = drawn.text;
    assert.ok(text.startsWith("Who finished We’ve ticked everyone who came to at least 4 of 6 sessions. Change any you disagree with. Only you and admins see this rule. 6 finished · 4 not Saved Fewest sessions first Name Group Came to Exercises Finished"), text.slice(0, 400));
    // The rest of the Overview stays below it.
    assert.ok(text.indexOf("Who finished") < text.indexOf("Sessions this week"));
    assert.match(text, /Needs attention/);
  });

  test("a row per person, fewest sessions first, each switch labelled with their name", async () => {
    const rows = rowsOf((await renderPage(pages.overview, "claudia")).html);
    assert.deepEqual(
      rows.map((row) => [row.name, row.cells.slice(1, 4).join(" | "), row.checked, row.changed]),
      [
        ["Freya Thompson", "Group D | 1 of 6 | 2 of 6", false, null],
        ["Bea Lindqvist", "Group A | 2 of 6 | 2 of 6", false, null],
        ["Farah Hussain", "Group B | 3 of 5 | 1 of 6", false, null],
        ["Kofi Asante", "Group B | 3 of 5 | 6 of 6", true, "Changed by you"],
        ["Tariq Mensah", "Group A | 3 of 6 | 0 of 6", false, null],
        ["Dev Patel", "Group A | 4 of 6 | 4 of 6", true, null],
        ["Chloe Nguyen", "Group B | 5 of 5 | 6 of 6", true, null],
        ["Yasmin Farouk", "Group D | 5 of 6 | 4 of 6", true, null],
        ["Amara Okafor", "Group A | 6 of 6 | 6 of 6", true, null],
        ["Hamza Qureshi", "Group C | 6 of 6 | 6 of 7", true, null],
      ],
    );
    assert.deepEqual(
      rows.slice(0, 4).map((row) => row.cells[0].replace(/^[A-Z]{2} /, "")),
      [
        "Freya Thompson Missed weeks 2, 3, 4, 5 and 6",
        "Bea Lindqvist Excused in week 2. Missed weeks 4, 5 and 6.",
        "Farah Hussain Missed weeks 5 and 6",
        "Kofi Asante Excused in weeks 1 and 3",
      ],
    );
  });

  test("the switches are real switches, not pressable until the page is live", async () => {
    let html = sectionHtml((await renderPage(pages.overview, "claudia")).html);
    const inputs = [...html.matchAll(/<input[^>]*>/g)].map((match) => match[0]);
    assert.equal(inputs.length, 10);
    for (const input of inputs) {
      assert.match(input, /type="checkbox"/);
      assert.match(input, /role="switch"/);
      assert.match(input, /disabled=""/);
    }
    world.ui.hydrated = true;
    html = sectionHtml((await renderPage(pages.overview, "claudia")).html);
    assert.ok([...html.matchAll(/<input[^>]*>/g)].every((match) => !/disabled=""/.test(match[0])));
  });

  test("somebody who left is listed apart as having left, with no switch, never as not finished", async () => {
    const html = sectionHtml((await renderPage(pages.overview, "claudia")).html);
    const left = textOf(html.slice(html.indexOf("Left the programme")));
    assert.match(left, /^Left the programme OH Omar Haddad Group B Left SW Sam Whitfield Group A Left Fri 6 Nov/);
    assert.doesNotMatch(html, /Finished: (Sam Whitfield|Omar Haddad)/);
    assert.match(textOf(html), /6 finished · 4 not/);
  });

  test("the note under the list says how many times Group B met and that its cancelled session counts against nobody", async () => {
    const text = textOf(sectionHtml((await renderPage(pages.overview, "claudia")).html));
    assert.ok(text.endsWith("Group B met 5 times. Its session on Tue 24 Nov was cancelled, and it doesn’t count against anyone."), text.slice(-200));
  });

  test("an admin sees everybody placed, Una whom Publish never told among them: ten rows, then +1 more", async () => {
    const html = sectionHtml((await renderPage(pages.overview, "zach")).html);
    assert.match(textOf(html), /7 finished · 4 not/);
    assert.equal(rowsOf(html).length, 10);
    assert.match(html, /aria-expanded="false"[^>]*><span>\+1 more<\/span>/);
    assert.match(textOf(html), /Kofi Asante Excused in weeks 1 and 3 Group B 3 of 5 6 of 6 Changed by Claudia/);
    // The lead never sees her.
    assert.doesNotMatch(sectionHtml((await renderPage(pages.overview, "claudia")).html), /Una Byrne/);
  });

  test("with no rule, the sentence says so and nobody is ticked but by hand", async () => {
    world.db.seed(rulePath, { kind: "gone" });
    const text = textOf(sectionHtml((await renderPage(pages.overview, "claudia")).html));
    assert.match(text, /^Who finished There’s no rule for who finished yet, so we haven’t ticked anybody\. Set one in Settings, or tick people yourself\. Only you and admins see this\. 1 finished · 9 not/);
  });

  test("a reviewer, the lead of another programme and everybody else are drawn no section", async () => {
    assert.doesNotMatch((await renderPage(pages.overview, "lloyd")).html, /who-finished/);
    assert.match((await renderPage(pages.overview, "tess")).text, /There is no programme here/);
    for (const who of ["yusuf", "rahul", "amara", "bea", "sam", null]) {
      assert.equal((await renderPage(pages.overview, who)).to, "/dashboard", String(who));
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Before the end
// ---------------------------------------------------------------------------

describe("2. before the last session is over", () => {
  test("there is no section, and the People card says when it can be done", async () => {
    mock.timers.setTime(BEFORE.getTime());
    const drawn = await renderPage(pages.overview, "claudia");
    assert.equal(sectionHtml(drawn.html), "");
    assert.match(drawn.text, /People \d+ taking part .* You can say who finished once the last session is over, on Wed 9 Dec\./);
    assert.doesNotMatch(drawn.html, /setup#who-finished/, "a run with a rule was sent to set one");
  });

  test("with no rule yet, it leads to Settings to set one", async () => {
    mock.timers.setTime(BEFORE.getTime());
    world.db.seed(rulePath, { kind: "gone" });
    const drawn = await renderPage(pages.overview, "claudia");
    assert.match(drawn.html, new RegExp(`<a href="${PATH}/setup#who-finished"[^>]*>Set who counts as finished`));
  });

  test("weeks before, the same line, from the same record", async () => {
    mock.timers.setTime(new Date("2026-11-17T12:00:00Z").getTime());
    assert.match((await renderPage(pages.overview, "zach")).text, /You can say who finished once the last session is over, on Wed 9 Dec\./);
  });
});

// ---------------------------------------------------------------------------
// 3. The rule's card
// ---------------------------------------------------------------------------

describe("3. the rule's card on Settings", () => {
  test("the lead and an admin are drawn it, holding the number", async () => {
    for (const who of ["claudia", "zach"]) {
      const drawn = await renderPage(pages.setup, who);
      assert.match(drawn.html, /<section id="who-finished"/, who);
      assert.match(drawn.text, /Who finished Saved Came to at least sessions Of the sessions their group held: a cancelled session doesn’t count against anyone\. After the last session, we tick everyone who came to this many, and you can change any\. Only you and admins see this\./);
      assert.match(drawn.html, /<input[^>]*inputMode="numeric"[^>]*value="4"|<input[^>]*value="4"[^>]*inputMode="numeric"/);
    }
  });

  test("a lead's page reads the rule's own document and nothing of the run", async () => {
    const drawn = await renderPage(pages.setup, "claudia");
    assert.ok(drawn.reads.includes("courseFinishing"));
    assert.ok(!drawn.reads.includes("courseRuns"), "a lead's Settings read the run");
    assert.ok(!drawn.reads.includes("courseEnrolments"));
  });

  test("an empty box is no rule; a programme with no run has no card", async () => {
    world.db.seed(rulePath, { kind: "gone" });
    assert.match((await renderPage(pages.setup, "claudia")).html, /<input[^>]*value=""[^>]*>|<input(?![^>]*value=)[^>]*inputMode="numeric"/);
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    assert.doesNotMatch((await renderPage(pages.setup, "claudia")).html, /who-finished/);
  });

  test("a reviewer is told the settings are the lead's, and nobody else is drawn the rule", async () => {
    const lloyd = await renderPage(pages.setup, "lloyd");
    assert.doesNotMatch(lloyd.html, /who-finished|Came to at least/);
    assert.match((await renderPage(pages.setup, "tess")).text, /There is no programme here/);
  });
});

// ---------------------------------------------------------------------------
// 4. The head
// ---------------------------------------------------------------------------

describe("4. the line under the programme's name", () => {
  test("once the last session is over: Finished with its day, and how many took part", async () => {
    assert.match(await head("claudia"), /AGI Strategy Fellowship Finished · Wed 9 Dec C Lead: Claudia · 10 took part (Overview|Interest)/);
    assert.match(await head("zach"), /Finished · Wed 9 Dec C Lead: Claudia · 11 took part/);
  });

  test("from the moment that session ends, and not a minute before", async () => {
    mock.timers.setTime(new Date("2026-12-09T14:59:00Z").getTime());
    assert.match(await head("claudia"), /Running · week 6 of 6 C Lead: Claudia · 10 taking part in 4 groups · Last sessions Wed 9 Dec/);
    mock.timers.setTime(new Date("2026-12-09T15:00:00Z").getTime());
    assert.match(await head("claudia"), /Finished · Wed 9 Dec C Lead: Claudia · 10 took part/);
  });

  test("a reviewer keeps the form's own line", async () => {
    const said = await head("lloyd");
    assert.doesNotMatch(said, /Finished|took part/);
  });
});

// ---------------------------------------------------------------------------
// 5. Nothing leaks, nothing is written
// ---------------------------------------------------------------------------

describe("5. no address, no write", () => {
  test("drawing every page writes nothing and names nobody by address", async () => {
    for (const who of ["claudia", "zach"]) {
      const before = everything();
      for (const page of [pages.overview, pages.setup]) {
        const drawn = await renderPage(page, who);
        assert.doesNotMatch(drawn.html, /@example\.com|@students/, who);
      }
      await head(who);
      assert.equal(everything(), before, `${who}'s pages wrote something`);
    }
  });

});
