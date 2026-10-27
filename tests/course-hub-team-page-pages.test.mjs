/**
 * A team's page, its hand-in and the lead's reading, drawn as every kind of
 * caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  - `/learn/[runId]/team` (boards in-team, in-team-phone) and
 *    `/learn/[runId]/team/hand-in` (en-handin-phone), drawn on the server by
 *    their real pages for the people in a team who have been told it, and
 *    sent back to the run's home for everybody else;
 *  - "Your team" on the programme's page (`teamCardFor`);
 *  - the Teams tab's Hand-ins and one team's page as the programme's lead
 *    and admins read them (`loadTeamHandIns`, the `(tabs)/teams/[teamId]`
 *    page).
 *
 * Every date and time in what is drawn comes from a record: the group's
 * calendar and changes, the run's week plan with its breaks, and the run's
 * hand-in dates. The page says who reads what is written there, as version 7
 * of the privacy policy promises. The world is `tests/lib/teamPageWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CALLERS, INC, INCUBATOR, ROUND, WHEN, makeTeamPageWorld, teamPageSeed, textOf } from "./lib/teamPageWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: WHEN.madeAndTold });

const w = await makeTeamPageWorld("__teamPagePages");
const { world, ask, view, probe, lib, components } = w;

const at = (when) => mock.timers.setTime(when.getTime());
const HOME = `/learn/${INC.run}`;
const session = (uid) => w.made.sessionOf(uid);

beforeEach(async () => {
  at(WHEN.madeAndTold);
  await w.reset();
  at(WHEN.weekFive);
});

/** The page's words in order, for matching a run of them. */
const words = (html) => textOf(html);

describe("the team's page, for the people in the team (in-team)", () => {
  test("in week 5 it draws the board's page from records", async () => {
    const { html, to } = await view.team("amara");
    assert.equal(to, null);
    const text = words(html);
    for (const line of [
      "Incubator: Research incubator · Team",
      "Probe transfer",
      "Amara, Dev and Lena · Thursdays 6pm · Room A13",
      "The project",
      "Paper Probes that transfer",
      "Your twist Test whether the probes still work on a smaller open model",
      "Tonight · week 5",
      "Thu 26 Nov, 6pm",
      "Room A13",
      "This week’s check-in",
      "What we did",
      "What’s in the way",
      "Save check-in",
      "Tess, your team and admins see this.",
      "Team links",
      "No links yet.",
      "Add a link",
      "Hand-in",
      "One hand-in for the team. Due Thu 18 Feb, week 10: a link and a 200-word summary.",
      "Showcase: Thu 18 Feb · 6pm · Room A13",
      "The weeks",
      "Week 7, Thu 10 Dec, is the last this term. Weeks 8 to 10: Thu 4, 11 and 18 Feb.",
      "This term",
      "Feb",
    ]) {
      assert.ok(text.includes(line), `the page does not say ${JSON.stringify(line)}: ${text}`);
    }
    // The reader first, then the team; the paper is the week's reading, linked.
    assert.ok(html.includes('href="https://example.com/probes"'), "the paper is not linked to the reading");
    assert.ok(html.includes(`href="/learn/${INC.run}/team/hand-in"`), "no way to the hand-in");
    assert.ok(html.includes('href="?link=add#team-links"'), "Add a link is not an address");
    // Back to the programme's page, by its title on a laptop and its short name on a phone.
    assert.ok(html.includes(`href="${HOME}"`));
    assert.ok(text.includes("Research Incubator") && text.includes("Research incubator"));
  });

  test("draws nothing it cannot read from a record: no food line, no pairs, no address", async () => {
    const { html } = await view.team("amara");
    const text = words(html);
    assert.ok(!/food provided/i.test(text), "food provided is drawn with no record behind it");
    assert.ok(!/Pairs tonight/i.test(text), "pairs are drawn with no record behind it");
    assert.ok(!html.includes("@"), "an address reached the page");
    // Nothing of another team.
    assert.ok(!text.includes("Reward hacking evals") && !/\bBea\b|\bMaya\b|\bNoor\b|\bTariq\b/.test(text));
  });

  test("the weeks across both terms: done, this week, and still to come", async () => {
    const { html } = await view.team("amara");
    const states = [...html.matchAll(/<li class="tick ?(\w*)"(?: aria-current="step")?>.*?W(\d+)<\/span>/g)].map((m) => [
      Number(m[2]),
      m[1] || "upcoming",
    ]);
    assert.deepEqual(states, [
      [1, "tickDone"],
      [2, "tickDone"],
      [3, "tickDone"],
      [4, "tickDone"],
      [5, "tickCurrent"],
      [6, "upcoming"],
      [7, "upcoming"],
      [8, "upcoming"],
      [9, "upcoming"],
      [10, "upcoming"],
    ]);
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  });

  test("in February the term is the February one, and the check-in is that week's", async () => {
    at(WHEN.february);
    const text = words((await view.team("amara")).html);
    for (const line of ["Tonight · week 9", "Thu 11 Feb, 6pm", "This week’s check-in", "Week 10, Thu 18 Feb, is the last.", "Oct to Dec", "This term"]) {
      assert.ok(text.includes(line), `in February the page does not say ${JSON.stringify(line)}: ${text}`);
    }
    assert.ok(!text.includes("is the last this term"));
  });

  test("in the break there is no check-in, and the next session is February's", async () => {
    at(WHEN.inTheBreak);
    const text = words((await view.team("amara")).html);
    assert.ok(!text.includes("This week’s check-in"), "a check-in is offered in the break");
    for (const line of ["Your next session · week 8", "Thu 4 Feb, 6pm", "Weeks 8 to 10: Thu 4, 11 and 18 Feb.", "Oct to Dec"]) {
      assert.ok(text.includes(line), `in the break the page does not say ${JSON.stringify(line)}: ${text}`);
    }
    assert.ok(!text.includes("This term"));
  });

  test("after the last week, the weeks say so, and nothing is offered to write", async () => {
    at(WHEN.dueDay);
    assert.equal((await ask.handIn("amara", { url: "https://example.com/x", summary: "Done.", whoDidWhat: "", shared: true })).status, 200);
    at(WHEN.after);
    world.db.poke(`courseRuns/${INC.run}`, { status: "completed" });
    const { html } = await view.team("amara");
    const text = words(html);
    assert.ok(text.includes("Week 10, Thu 18 Feb, was the last."));
    assert.ok(!text.includes("This week’s check-in") && !text.includes("Add a link") && !text.includes("Remove"));
    assert.ok(text.includes("See the hand-in"));
    assert.ok(text.includes("Handed in by Amara on Thu 18 Feb."));
  });

  test("what the team wrote is on its page: this week's check-in and its links, for each of its people", async () => {
    await ask.checkIn("dev", { weekNumber: 5, did: "Probes train; results next week.", inTheWay: "GPU time." });
    await ask.addLink("lena", { label: "Write-up", url: "https://docs.example.com/write-up" });
    const text = words((await view.team("amara")).html);
    assert.ok(text.includes("Probes train; results next week.") && text.includes("GPU time."));
    assert.ok(text.includes("Write-up docs.example.com/write-up"));
    assert.ok(text.includes("Remove"));
    // Another team sees none of it.
    const other = words((await view.team("bea")).html);
    assert.ok(!other.includes("Probes train") && !other.includes("docs.example.com/write-up"));
    assert.ok(other.includes("Reward hacking evals"));
  });

  test("?link=add opens the form, which says who reads a link", async () => {
    const text = words((await view.team("amara", { link: "add" })).html);
    for (const line of ["Label", "Link", "Add link", "Cancel", "Tess, your team and admins see this."]) {
      assert.ok(text.includes(line), `the form does not say ${JSON.stringify(line)}`);
    }
  });

  test("a run with no hand-in dates says what the hand-in asks for and no day", async () => {
    at(WHEN.madeAndTold);
    await w.reset(teamPageSeed({ handIn: null }));
    at(WHEN.weekFive);
    const text = words((await view.team("amara")).html);
    assert.ok(text.includes("One hand-in for the team: a link and a 200-word summary."));
    assert.ok(!text.includes("Showcase"));
  });

  test("a session moved for the showcase's week is the showcase", async () => {
    world.db.poke(`courseGroups/${INC.thursday}`, {
      sessionOverrides: { w10: { weekday: 4, startTimeLocal: "17:00", durationMinutes: 120, location: "Lecture theatre B1", meetingUrl: null, notes: "" } },
    });
    const text = words((await view.team("amara")).html);
    assert.ok(text.includes("Showcase: Thu 18 Feb · 5pm · Lecture theatre B1"), text);
  });

  test("everybody else is sent to the run's home, or to the hub without a session", async () => {
    for (const [who, as] of CALLERS) {
      if (["amara", "bea"].includes(who)) continue;
      const { html, to } = await view.team(who);
      assert.equal(html, null, `${as} was drawn the page`);
      assert.equal(to, who === null ? "/learn" : HOME, as);
    }
  });

  test("somebody who leaves, or is moved and not yet told, is sent away at once", async () => {
    world.db.poke(`courseEnrolments/${INC.run}__dev`, { status: "withdrawn" });
    assert.equal((await view.team("dev")).to, HOME);
    assert.equal((await w.made.ask.move("tess", "kai", probe().id)).status, 200);
    assert.equal((await view.team("kai")).to, HOME);
    // And once told, Kai is one of Probe transfer's people.
    assert.equal((await w.made.ask.tell("tess", 3)).status, 200);
    const text = words((await view.team("kai")).html);
    assert.ok(text.includes("Kai, Amara and Lena · Thursdays 6pm · Room A13"), text);
  });
});

describe("the hand-in page (en-handin-phone)", () => {
  test("on the due day it draws the board's page from records", async () => {
    at(WHEN.dueDay);
    const { html, to } = await view.handIn("amara");
    assert.equal(to, null);
    const text = words(html);
    for (const line of [
      "Probe transfer",
      "Hand-in",
      "Incubator: Research incubator · Week 10",
      "Hand in for Probe transfer",
      "One hand-in for the team. Amara, Dev and Lena all see it, and so do Tess and admins.",
      "Link to your repo or write-up",
      "A repo, a doc, or a page. Make sure the team can open it.",
      "Summary",
      "0 / 200 words",
      "Who did what (optional)",
      "Showcase tonight · 6pm · Room A13",
      "Research incubator · week 10",
      "I’ve shared this with Dev and Lena",
      "Hand in for the team",
      "You can change it until 23:59 tonight.",
    ]) {
      assert.ok(text.includes(line), `the hand-in page does not say ${JSON.stringify(line)}: ${text}`);
    }
    assert.ok(html.includes('placeholder="https://…"'));
    assert.ok(html.includes(`href="/learn/${INC.run}/team"`), "no way back to the team's page");
    // Before the script arrives the button waits for it, and the boxes are open.
    assert.match(html, /<button type="submit" class="primary" disabled="">/);
    assert.ok(!/<textarea[^>]*disabled/.test(html));
  });

  test("before the due day it says the day; once handed in it says who and keeps what was handed in", async () => {
    at(WHEN.february);
    let text = words((await view.handIn("amara")).html);
    assert.ok(text.includes("You can change it until 23:59 on Thu 18 Feb."));
    assert.ok(text.includes("Showcase · 6pm · Room A13"));
    const summary = "We replicated Probes that transfer on a smaller open model.";
    assert.equal(
      (await ask.handIn("dev", { url: "https://docs.example.com/probe", summary, whoDidWhat: "Dev wrote it up.", shared: true })).status,
      200,
    );
    const { html } = await view.handIn("amara");
    text = words(html);
    assert.ok(text.includes("Handed in by Dev at 12pm today."), text);
    assert.ok(html.includes('value="https://docs.example.com/probe"'));
    assert.ok(text.includes(summary) && text.includes("Dev wrote it up."));
    assert.ok(text.includes("10 / 200 words"));
    // Every person in the team sees it.
    assert.ok(words((await view.handIn("lena")).html).includes(summary));
    assert.ok(!words((await view.handIn("bea")).html).includes(summary), "another team sees Probe transfer's hand-in");
  });

  test("after 23:59 on the due day it can no longer change, and says so", async () => {
    at(WHEN.closed);
    const { html } = await view.handIn("amara");
    const text = words(html);
    assert.ok(text.includes("Hand-ins closed at 23:59 on Thu 18 Feb."));
    assert.ok(!text.includes("Hand in for the team"), "the button is offered after the deadline");
    assert.ok(!text.includes("I’ve shared this with"));
    assert.match(html, /<textarea[^>]*disabled/);
  });

  test("nobody outside the team reaches it", async () => {
    at(WHEN.dueDay);
    for (const [who, as] of CALLERS) {
      if (["amara", "bea"].includes(who)) continue;
      assert.equal((await view.handIn(who)).html, null, as);
    }
  });

  test("the form's count is the words as typed, and over the limit it is marked", () => {
    const HandInForm = components.HandInForm;
    const base = {
      runId: INC.run,
      teamId: "t",
      eyebrow: "",
      title: "",
      lede: "",
      back: { href: "/", label: "" },
      url: "",
      summary: Array.from({ length: 201 }, () => "w").join(" "),
      whoDidWhat: "",
      summaryWords: 200,
      showcase: null,
      shareLabel: null,
      tickFirst: "",
      open: true,
      untilLine: null,
      closedLine: null,
      handedInLine: null,
    };
    const html = renderToStaticMarkup(createElement(HandInForm, { view: base }));
    assert.ok(html.includes('<span id=') && html.includes("counterOver") && textOf(html).includes("201 / 200 words"));
  });
});

describe("Your team, on the programme's page", () => {
  test("names the team and who else is in it, for its people who have been told, and nobody else", async () => {
    assert.deepEqual(await lib.load.teamCardFor(world.courseDb, session("amara"), INC.run), {
      line: "Probe transfer, with Dev and Lena.",
    });
    assert.deepEqual(await lib.load.teamCardFor(world.courseDb, session("tariq"), INC.run), {
      line: "Reward hacking evals, with Bea, Maya and Noor.",
    });
    for (const [who, as] of CALLERS) {
      if (who === null || ["amara", "bea"].includes(who)) continue;
      assert.equal(await lib.load.teamCardFor(world.courseDb, session(who), INC.run), null, as);
    }
  });

  test("somebody named on a team who may not read it is shown no card: moved and not told, or left", async () => {
    // Both are on a team's stored people, so the card's first question (is
    // anybody naming them?) is yes, and the gate is what says no.
    assert.equal((await w.made.ask.move("tess", "kai", probe().id)).status, 200);
    assert.ok(probe().memberUids.includes("kai"));
    assert.equal(await lib.load.teamCardFor(world.courseDb, session("kai"), INC.run), null, "moved and not yet told");
    world.db.poke(`courseEnrolments/${INC.run}__dev`, { status: "withdrawn" });
    assert.ok(probe().memberUids.includes("dev"));
    assert.equal(await lib.load.teamCardFor(world.courseDb, session("dev"), INC.run), null, "left");
    // Once Kai is told, the card is Kai's.
    assert.equal((await w.made.ask.tell("tess", 3)).status, 200);
    assert.deepEqual(await lib.load.teamCardFor(world.courseDb, session("kai"), INC.run), {
      line: "Probe transfer, with Amara and Lena.",
    });
  });

  test("the run's page hands the card to the programme's page", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/app/(app)/learn/[runId]/page.tsx", import.meta.url), "utf8");
    assert.match(source, /const team = access\.isEnrolled && db \? await teamCardFor\(db, access\.user, runId\) : null;/);
    assert.match(source, /team=\{team\}/);
  });
});

describe("the lead's and admins' reading", () => {
  // As the site sets it for the people who read a form's applications, so
  // the admissions tree's own gate lets them in, as the teams suites do.
  beforeEach(() => {
    for (const uid of ["tess", "yusuf", "claudia"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  });

  test("the Teams tab's Hand-ins: the dates, and every team's hand-in, for the lead and admins only", async () => {
    at(WHEN.dueDay);
    await ask.handIn("amara", { url: "https://docs.example.com/probe", summary: "Probes transfer.", whoDidWhat: "", shared: true });
    for (const who of ["tess", "zach"]) {
      const view = await lib.lead.loadTeamHandIns(world.courseDb, session(who), ROUND, INCUBATOR);
      assert.equal(view.dueOn, "2027-02-18");
      assert.equal(view.showcaseWeek, 10);
      assert.equal(view.asks, "One hand-in for the team. Due Thu 18 Feb, week 10: a link and a 200-word summary.");
      // Two groups meet on different days, so a week is named by its number alone.
      assert.deepEqual(
        view.weeks.map((week) => week.label),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `Week ${n}`),
      );
      assert.deepEqual(
        view.rows.map((row) => [row.name, row.state, row.entry?.summary ?? null]),
        [
          ["Probe transfer", "Handed in by Amara on Thu 18 Feb.", "Probes transfer."],
          ["Reward hacking evals", "Not handed in yet.", null],
        ],
      );
      const html = renderToStaticMarkup(createElement(components.TeamHandIns, { view }));
      const text = textOf(html);
      for (const line of ["Hand-ins", "Hand-ins are due on", "The showcase is in", "Save hand-in dates", "Read the team’s page"]) {
        assert.ok(text.includes(line), `${who}: ${line}`);
      }
      assert.ok(html.includes(`/admin/admissions/forms/${ROUND}/programmes/${INCUBATOR}/teams/${probe().id}`));
    }
    for (const [who, as] of CALLERS) {
      if (["tess", "zach"].includes(who) || who === null) continue;
      assert.equal(await lib.lead.loadTeamHandIns(world.courseDb, session(who), ROUND, INCUBATOR), null, as);
    }
  });

  test("with one group, each of the showcase's weeks is named by its session's day", async () => {
    world.db.poke(`courseGroups/${INC.wednesday}`, { archived: true });
    const view = await lib.lead.loadTeamHandIns(world.courseDb, session("tess"), ROUND, INCUBATOR);
    assert.deepEqual(
      view.weeks.map((week) => week.label),
      [
        "Week 1, Thu 29 Oct",
        "Week 2, Thu 5 Nov",
        "Week 3, Thu 12 Nov",
        "Week 4, Thu 19 Nov",
        "Week 5, Thu 26 Nov",
        "Week 6, Thu 3 Dec",
        "Week 7, Thu 10 Dec",
        "Week 8, Thu 4 Feb",
        "Week 9, Thu 11 Feb",
        "Week 10, Thu 18 Feb",
      ],
    );
  });

  test("one team's page, read only, with every week's check-in, for the lead and admins", async () => {
    await ask.checkIn("dev", { weekNumber: 5, did: "Probes train.", inTheWay: "" });
    at(WHEN.weekSix);
    await ask.checkIn("lena", { weekNumber: 6, did: "Results are in.", inTheWay: "Writing up." });
    for (const who of ["tess", "zach"]) {
      const { html, to } = await view.lead(who, probe().id);
      assert.equal(to, null, who);
      const text = words(html);
      for (const line of [
        "Probe transfer",
        "Check-ins",
        "Week 6 · Saved Thu 3 Dec by Lena",
        "Results are in.",
        "Writing up.",
        "Week 5 · Saved Thu 26 Nov by Dev",
        "Probes train.",
        "Twist",
      ]) {
        assert.ok(text.includes(line), `${who}: ${line}: ${text}`);
      }
      assert.ok(text.indexOf("Week 6") < text.indexOf("Week 5 ·"), "check-ins are not newest first");
      assert.ok(!text.includes("Save check-in") && !text.includes("Add a link") && !text.includes("Tonight"));
      assert.ok(html.includes(`/admin/admissions/forms/${ROUND}/programmes/${INCUBATOR}/teams`));
    }
  });

  test("the reviewer is told it is the lead's and admins'; anybody else meets no programme, or no page at all", async () => {
    assert.ok(words((await view.lead("yusuf", probe().id)).html).includes("Only the programme’s lead and admins can open Teams"));
    assert.ok(words((await view.lead("claudia", probe().id)).html).includes("There is no programme here"));
    for (const who of ["amara", "sofia", "tomas", "wen", null]) {
      assert.equal((await view.lead(who, probe().id)).to, "/dashboard", String(who));
    }
    // A team that is not on the run is said plainly, for the lead too.
    assert.ok(words((await view.lead("tess", "no-such-team")).html).includes("That team isn’t one of this programme’s teams."));
  });
});

describe("what the policy says, held to the page", () => {
  test("beside what is written, the page names the team, the programme's lead and admins", async () => {
    const who = lib.words.teamWhoLine("Tess");
    assert.equal(who, "Tess, your team and admins see this.");
    assert.equal(lib.words.teamWhoLine(null), "Your team and admins see this.");
    // Beside the check-in's button, and beside the link form.
    const week = await view.team("amara");
    assert.match(week.html, /Save check-in<\/button><p class="who">Tess, your team and admins see this\.<\/p>/);
    const adding = await view.team("amara", { link: "add" });
    assert.match(adding.html, /Cancel<\/a><\/div><p class="who">Tess, your team and admins see this\.<\/p>/);
    // On the hand-in page, in its first lines.
    at(WHEN.dueDay);
    assert.ok(words((await view.handIn("amara")).html).includes("all see it, and so do Tess and admins."));
  });

  test("the current version says the page exists and what it does, and each sentence is the code's", async () => {
    const { readFileSync } = await import("node:fs");
    const policy = readFileSync(new URL("../src/content/legal/privacy/v8.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    for (const sentence of [
      "On an incubator, each team has a page of its own: its project, a weekly check-in, the team&apos;s links and its hand-in.",
      "Anybody in the team can change what is there.",
      "The hand-in says who handed it in, and the lead and admins also see who last saved each week&apos;s check-in.",
      "If you leave, what you wrote stays with your team; if your account is deleted, it stays and your name comes off it.",
      "What you wrote on your team&apos;s page: it stays with your team, and your name comes off it.",
    ]) {
      assert.ok(policy.includes(sentence), `v7 does not say ${JSON.stringify(sentence)}`);
    }
    assert.ok(!policy.includes("each team will have a page"), "v7 still says the page will exist, as if it were not built");
    // "The hand-in says who handed it in": the team's page and the hand-in page name the presser.
    at(WHEN.dueDay);
    await ask.handIn("lena", { url: "https://example.com/doc", summary: "Done.", whoDidWhat: "", shared: true });
    assert.ok(words((await view.team("amara")).html).includes("Handed in by Lena on Thu 18 Feb."));
    // "...who last saved each week's check-in", on the lead's reading and on no member's page.
    at(WHEN.weekFive);
    await ask.checkIn("dev", { weekNumber: 5, did: "Probes train.", inTheWay: "" });
    world.db.poke("users/tess", { admissionsReviewer: true });
    assert.ok(words((await view.lead("tess", probe().id)).html).includes("Saved Thu 26 Nov by Dev"));
    assert.ok(!words((await view.team("amara")).html).includes("by Dev"), "a member's page names who saved the check-in");
  });

  test("with no lead who stands, the page names the team and admins", async () => {
    world.db.poke("users/tess", { role: "member", suRecognised: false });
    assert.ok(words((await view.team("amara")).html).includes("Your team and admins see this."));
  });
});
