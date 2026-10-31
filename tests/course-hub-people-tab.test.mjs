/**
 * A programme's People tab (board st-people): everyone who holds a place on
 * the programme or gave it back, for its lead and admins.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS IT. The programme's lead and admins. A reviewer on the form is
 *     told the tab is theirs; another programme's lead, a run's track lead
 *     named on nothing on the form, a facilitator, a member and somebody
 *     signed out are sent away or told there is no programme here. The tab
 *     is a link, with its count, for the two who open it, and nobody else.
 *  2. NOTHING A LEAD MAY NOT READ. No email address, nothing written under
 *     access requirements, no answer to a question and no painted week
 *     reaches the page or the table, for the lead or for an admin, nor what
 *     somebody said on leaving the run (the Overview reads that out); and a row
 *     is somebody whose application the viewer may open, so the lead never
 *     meets somebody invited to the programme who did not rank it.
 *  3. ONE COUNT. Each filter's number is the number of rows the one function
 *     (`rowMatches`) puts under it. "Hold a place" is the hand-over's test:
 *     the tab's number, the sentence over the table, the term's tally and
 *     `placeHoldersOn` all say the same.
 *  4. EVERY VALUE FROM RECORDS: the group from the seat (a lead is shown a
 *     placement before Publish, as the board shows it), the reply and its
 *     day, the fit marks from the painted week against each group's own
 *     session, and where the place stands, with the reason and the day, or
 *     that somebody left the run, or was taken off it by staff.
 *  5. THE WORDS, the board's, with no dash and no gendered pronoun; for a
 *     seat that has left the run, the hand-over panel's and the person's own
 *     page's words.
 *
 * Real: the page, the tabs' layout, the loaders, the model and the table,
 * rendered to HTML. Faked: see `tests/lib/peopleWorld.mjs` and
 * `tests/lib/facilitatorPagesWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ACCESS, AGI, ANSWER, B, COURSE, MONDAY, ROUND, RUN, SAM_SAID, TOLD, makePeopleWorld, peopleSeed } from "./lib/peopleWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: MONDAY });

const w = await makePeopleWorld("__peopleTabSuite");
const { world, at, reset, peoplePage, viewOf, layout, loadTs, call } = w;
/** The join's real routes: hand-over, placements, Publish, Remove. */
const { routes: joinRoutes } = w.join;

const filters = await loadTs(join("lib", "applications", "people", "filters.ts"));
const words = await loadTs(join("lib", "applications", "people", "words.ts"));
const { loadTermTally } = await loadTs(join("lib", "applications", "editor", "load.ts"));
const { countPlaceHolders } = await loadTs(join("lib", "applications", "people", "load.ts"));
const { placeHoldersOn } = await loadTs(join("lib", "applications", "handover", "holders.ts"));
const { isInTerm } = await loadTs(join("lib", "applications", "decisions.ts"));
const { loadForm } = await loadTs(join("lib", "applications", "repo.ts"));
const { listDecisions, listSentApplications } = await loadTs(join("lib", "applications", "staffRepo.ts"));
const ProgrammePeople = (await loadTs(join("features", "applications", "people", "ProgrammePeople.tsx"))).default;
const { comingReplyOf } = await loadTs(join("lib", "applications", "status", "coming.ts"));

const PROGRAMME_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

beforeEach(() => {
  reset(peopleSeed());
  at(MONDAY);
});

/** The page as `who`, and the view it handed its table. */
async function open(who) {
  const drawn = await peoplePage(who);
  return { ...drawn, view: viewOf(drawn) };
}

/** One row of a view, by uid. */
const rowOf = (view, uid) => view.rows.find((row) => row.uid === uid) ?? null;

// ---------------------------------------------------------------------------
// 1. Who opens it
// ---------------------------------------------------------------------------

describe("1. who opens the People tab", () => {
  test("the programme's lead and admins are drawn the table; nobody else is", async () => {
    const said = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null]) {
      const drawn = await open(who);
      said[who ?? "signed out"] = drawn.to
        ? `sent to ${drawn.to}`
        : drawn.view
          ? "table"
          : drawn.text.startsWith(words.NOT_YOURS_TITLE)
            ? "told it is the lead's"
            : drawn.text.startsWith("There is no programme here")
              ? "no programme here"
              : drawn.text;
      assert.equal(drawn.wrote, false, `opening the tab as ${who} wrote to the database`);
    }
    assert.deepEqual(said, {
      zach: "table",
      claudia: "table",
      // Reviews AGI Strategy on the form: told it is the lead's and an admin's.
      lloyd: "told it is the lead's",
      // Leads another programme on the form: no role on this one.
      tess: "no programme here",
      // The run's track lead, named on nothing on the form, and not on the admissions tree at all.
      yusuf: "sent to /dashboard",
      rahul: "sent to /dashboard",
      amara: "sent to /dashboard",
      nobody: "sent to /dashboard",
      "signed out": "sent to /dashboard",
    });
  });

  test("a reviewer's refusal names nobody and reads nobody's application", async () => {
    const drawn = await open("lloyd");
    assert.equal(drawn.text, `${words.NOT_YOURS_TITLE} ${words.NOT_YOURS_WHY} Go to applications`);
    for (const name of ["Amara", "Kofi", "Nina"]) assert.ok(!drawn.text.includes(name));
  });

  test("the tab is a link, with how many hold a place, for the lead and an admin; not drawn for a reviewer", async () => {
    // Six: Sam left the run and Callum was taken off it, and each gave the form's place back.
    for (const who of ["claudia", "zach"]) {
      const { html, text } = await layout(who);
      assert.match(
        html,
        new RegExp(`<a href="${PROGRAMME_PATH}/people" class="tab "[^>]*>People<span class="tabCount">6</span></a>`),
        `${who}'s People tab`,
      );
      assert.match(text, /Applications \d+ People 6 Groups/, `${who}'s tabs, in the board's order`);
    }
    const reviewer = await layout("lloyd");
    // A reviewer's tabs are Applications alone: no People tab, linked or not.
    assert.match(reviewer.text, /Applications \d+/);
    assert.doesNotMatch(reviewer.text, /\bPeople\b/, "a reviewer is shown the People tab");
    assert.ok(!reviewer.html.includes(`${PROGRAMME_PATH}/people`), "a reviewer is offered the People tab");
  });

  test("before decisions go out the tab lists nobody and counts nobody", async () => {
    const seed = peopleSeed();
    seed[`admissionRounds/${ROUND}`].decisionsSentAt = null;
    reset(seed);
    at(MONDAY);
    for (const who of ["claudia", "zach"]) {
      const drawn = await open(who);
      assert.equal(drawn.view, null, `${who} is drawn a table before decisions go out`);
      assert.equal(drawn.text, words.notSentWords("AGI Strategy"));
      const { html } = await layout(who);
      assert.match(html, /aria-current="page">People<\/a>|>People<\/a>/, "the tab carries a count before decisions go out");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Nothing a lead may not read
// ---------------------------------------------------------------------------

describe("2. nothing a lead may not read", () => {
  test("no address, access requirement, answer or painted week reaches the page, for the lead or an admin", async () => {
    for (const who of ["claudia", "zach"]) {
      const { html, view } = await open(who);
      const sent = JSON.stringify(view);
      for (const [what, haystack] of [
        ["the table's data", sent],
        ["the page", html],
      ]) {
        assert.doesNotMatch(haystack, /@/, `${what} carries an email address, as ${who}`);
        assert.ok(!haystack.includes(ACCESS), `${what} carries an access requirement, as ${who}`);
        assert.ok(!haystack.includes(ANSWER), `${what} carries an answer, as ${who}`);
        assert.doesNotMatch(haystack, /[0-9a-f]{12}/, `${what} carries a painted week, as ${who}`);
        assert.ok(!haystack.includes(SAM_SAID), `${what} carries the reason somebody gave for leaving the run, as ${who}`);
      }
    }
  });

  test("the table is handed only the fields it draws", async () => {
    const { view } = await open("claudia");
    assert.deepEqual(Object.keys(view).sort(), [
      "blank",
      // The line about confirming a place by a day, or null: a count and a day, never a name.
      "confirm",
      "counts",
      "programmeId",
      "programmeName",
      "roundId",
      "rows",
      "sentence",
      "viewer",
    ]);
    for (const row of view.rows) {
      assert.deepEqual(Object.keys(row).sort(), [
        "applicationHref",
        "category",
        "coming",
        "detail",
        "firstName",
        "free",
        "group",
        "groupsHref",
        "name",
        "status",
        "uid",
      ]);
    }
  });

  test("a row is somebody whose application the viewer may open: the lead never meets an invitation to somebody who did not rank the programme", async () => {
    const lead = (await open("claudia")).view;
    const admin = (await open("zach")).view;
    // Sana said no thanks to an invitation here, and Ines has not answered
    // one: neither ranked AGI Strategy, so its lead may not read either.
    for (const uid of ["sana", "ines"]) {
      assert.equal(rowOf(lead, uid), null, `the lead is shown ${uid}`);
      assert.ok(rowOf(admin, uid), `an admin is not shown ${uid}`);
    }
    // Ruth ranked it and was offered a freed place: both are shown Ruth.
    assert.ok(rowOf(lead, "ruth") && rowOf(admin, "ruth"));
    // Kofi did not rank it either, and accepted: that joined Kofi to it, so the lead reads the application.
    assert.ok(rowOf(lead, "kofi"));
    // Nobody from another programme, nobody told no offer.
    for (const view of [lead, admin]) {
      for (const uid of ["wen", "omar"]) assert.equal(rowOf(view, uid), null, `${uid} is on AGI Strategy's People tab`);
    }
  });

  test("a group's facilitators, who take part in the course themselves, are not counted among the people holding a place", async () => {
    // Rahul facilitates Group B and does its coursework through the group,
    // with the facilitator's seat the facilitators route writes, and holds
    // no place on the form.
    world.db.seed(`courseEnrolments/${RUN.agi}__rahul`, {
      runId: RUN.agi,
      courseId: "agi-strategy-fellowship__c0urse01",
      uid: "rahul",
      groupId: null,
      status: "active",
      role: "facilitator",
      selfEnrolled: false,
      applicationId: null,
      joinedWeekNumber: 1,
    });
    for (const who of ["claudia", "zach"]) {
      const { view } = await open(who);
      assert.equal(rowOf(view, "rahul"), null);
      assert.equal(rowOf(view, "sofia"), null);
      assert.equal(view.rows.filter((row) => row.category === "holding").length, 6);
    }
  });

  test("an admin's own row offers no way to their own application; the lead's does", async () => {
    assert.equal(rowOf((await open("zach")).view, "zach").applicationHref, null);
    assert.equal(rowOf((await open("claudia")).view, "zach").applicationHref, `${PROGRAMME_PATH}/applications/zach`);
  });
});

// ---------------------------------------------------------------------------
// 3. One count
// ---------------------------------------------------------------------------

describe("3. one count", () => {
  test("each filter's number is the rows the one function puts under it, for the lead and an admin", async () => {
    for (const who of ["claudia", "zach"]) {
      const { view } = await open(who);
      assert.deepEqual(view.counts, filters.countRows(view.rows));
      for (const filter of ["everyone", "coming", "havent-said", "not-said-free", "gave-back", "invited"]) {
        assert.equal(view.counts[filter], view.rows.filter((row) => filters.rowMatches(row, filter)).length, `${who}: ${filter}`);
      }
      // Coming and Haven't said are the people holding a place, split in two.
      const holding = view.rows.filter((row) => row.category === "holding").length;
      assert.equal(view.counts.coming + view.counts["havent-said"], holding);
      // Everyone is who holds a place or gave it back; somebody invited is neither.
      assert.equal(view.counts.everyone, holding + view.counts["gave-back"]);
    }
    // Callum said coming and was then taken off the run, which gave the
    // form's place back: one fewer coming, one more who gave a place back.
    assert.deepEqual((await open("claudia")).view.counts, {
      everyone: 9,
      coming: 3,
      "havent-said": 3,
      "not-said-free": 1,
      "gave-back": 3,
      invited: 1,
    });
    assert.deepEqual((await open("zach")).view.counts, {
      everyone: 10,
      coming: 3,
      "havent-said": 3,
      "not-said-free": 1,
      "gave-back": 4,
      invited: 2,
    });
  });

  test("hold a place is the hand-over's test: the tab, the sentence, the term's tally and placeHoldersOn agree", async () => {
    const form = await loadForm(world.db, ROUND);
    const [applications, decided] = await Promise.all([listSentApplications(world.db, form), listDecisions(world.db, ROUND)]);
    const fromHolders = placeHoldersOn(form, AGI, applications.filter(isInTerm), decided).length;
    const fromTally = (await loadTermTally(world.db, form)).programmes[AGI].placed;
    const fromTab = await countPlaceHolders(world.db, form, AGI);
    assert.equal(fromHolders, 6);
    assert.equal(fromTally, fromHolders);
    assert.equal(fromTab, fromHolders);
    for (const who of ["claudia", "zach"]) {
      const { view } = await open(who);
      assert.equal(view.rows.filter((row) => row.category === "holding").length, fromHolders);
      assert.ok(view.sentence.startsWith(`${fromHolders} hold a place`), view.sentence);
    }
    // Somebody who left the run is said apart from somebody who gave a place
    // back (walk 4b, L6): Sam left and Callum was taken off; Nina gave a
    // place back, and an admin also reads Sana's no.
    assert.equal((await open("claudia")).view.sentence, "6 hold a place; 1 gave theirs back; 2 left.");
    assert.equal((await open("zach")).view.sentence, "6 hold a place; 2 gave theirs back; 2 left.");
  });

  test("staff taking somebody off the run moves them to Gave their place back at once, and every count with them", async () => {
    // Amara's row on the run's list, as the hand-over writes it, so Remove
    // finds the place on the form the seat came from and gives it back.
    world.db.seed(`courseApplications/${RUN.agi}__amara`, {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid: "amara",
      displayName: "Amara Okafor",
      status: "accepted",
      fromForm: { roundId: ROUND, programmeId: AGI },
      createdAt: TOLD,
      updatedAt: TOLD,
    });
    const before = (await open("claudia")).view;
    assert.equal(rowOf(before, "amara").category, "holding");
    // The programme's lead presses Remove, through the real route.
    const removed = await call("claudia", joinRoutes.remove.POST, { runId: RUN.agi, uid: "amara" }, { course: true });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    const after = (await open("claudia")).view;
    const amara = rowOf(after, "amara");
    // Taken off by staff, so "Taken off the programme" (26 Oct, Zach's
    // default): the words the hand-over panel and Amara's own page use for a
    // removal. It said "Left the programme" for both kinds of leaving before.
    assert.deepEqual(
      [amara.category, amara.group, words.comingWords(amara.coming), words.statusWords(amara.status), amara.status.on],
      ["gave-back", null, "No", "Taken off the programme", "Mon 26 Oct"],
    );
    assert.deepEqual(after.counts, {
      ...before.counts,
      coming: before.counts.coming - 1,
      "gave-back": before.counts["gave-back"] + 1,
    });
    // Taken off, Amara has left the run: said with Sam and Callum (walk 4b, L6).
    assert.equal(after.sentence, "5 hold a place; 1 gave theirs back; 3 left.");
    // The tab's number is the hand-over's test, which agrees at once.
    assert.equal(await countPlaceHolders(world.db, await loadForm(world.db, ROUND), AGI), 5);
    assert.match((await layout("claudia")).html, /People<span class="tabCount">5<\/span>/);
  });

  test("staff putting somebody back holds their place again at once: back under holding, and every count with them", async () => {
    world.db.seed(`courseApplications/${RUN.agi}__amara`, {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid: "amara",
      displayName: "Amara Okafor",
      status: "accepted",
      fromForm: { roundId: ROUND, programmeId: AGI },
      createdAt: TOLD,
      updatedAt: TOLD,
    });
    const before = (await open("claudia")).view;
    // The programme's lead takes Amara off and puts her back in Group B, through the real routes.
    assert.equal((await call("claudia", joinRoutes.remove.POST, { runId: RUN.agi, uid: "amara" }, { course: true })).status, 200);
    const placed = await w.join.place("claudia", [{ uid: "amara", groupId: B }]);
    assert.deepEqual([placed.status, placed.body.placed], [200, 1], JSON.stringify(placed.body));
    const after = (await open("claudia")).view;
    const amara = rowOf(after, "amara");
    // Her place on the form is hers again, so People reads it as it reads any
    // place held. Her "I'm coming" went with the removal, and she has not said
    // it since, so she is under Haven't said rather than Coming.
    assert.deepEqual(
      [amara.category, amara.group, words.comingWords(amara.coming), words.statusWords(amara.status)],
      ["holding", "Group B", "Not yet", "Holding a place"],
    );
    assert.deepEqual(after.counts, { ...before.counts, coming: before.counts.coming - 1, "havent-said": before.counts["havent-said"] + 1 });
    assert.equal(after.sentence, before.sentence);
    assert.equal(await countPlaceHolders(world.db, await loadForm(world.db, ROUND), AGI), 6);
    assert.match((await layout("claudia")).html, /People<span class="tabCount">6<\/span>/);
  });

  test("the table draws a filter's rows by the same function, twelve at a time", () => {
    const row = (n, over = {}) => ({
      uid: `p${n}`,
      name: `Person ${String(n).padStart(2, "0")}`,
      firstName: "Person",
      detail: "BA History · Graduating 2028",
      category: "holding",
      group: null,
      coming: { kind: "yes", on: "Mon 26 Oct" },
      free: { kind: "fits", tags: ["B"] },
      status: { kind: "holding" },
      applicationHref: `/x/${n}`,
      groupsHref: null,
      ...over,
    });
    const rows = [...Array.from({ length: 13 }, (_, n) => row(n)), row(13, { coming: { kind: "not-yet" } })];
    const view = { roundId: ROUND, programmeId: AGI, programmeName: "AGI Strategy", viewer: "lead", blank: null, sentence: "", counts: filters.countRows(rows), rows };
    const html = renderToStaticMarkup(createElement(ProgrammePeople, { view }));
    assert.match(html, />Showing 12 of 14</);
    assert.match(html, />Show more</);
    assert.equal((html.match(/aria-haspopup="menu"/g) ?? []).length, 12);
    // Before the page is live, its controls are drawn and not pressable.
    assert.equal((html.match(/aria-pressed="(true|false)" disabled=""/g) ?? []).length, 6);
  });
});

// ---------------------------------------------------------------------------
// 4. Every value from records
// ---------------------------------------------------------------------------

describe("4. every value from records", () => {
  test("each row says what the records say, in the board's words", async () => {
    const { view } = await open("claudia");
    const said = Object.fromEntries(
      view.rows.map((row) => [
        row.uid,
        [
          row.group ?? words.NOT_IN_A_GROUP,
          words.comingWords(row.coming),
          words.freeWords(row.free),
          words.statusWords(row.status),
          row.status.kind === "gave-back" ? row.status.reason : row.status.kind === "invited" ? row.status.until : null,
          row.status.kind === "holding" ? null : row.status.on,
        ],
      ]),
    );
    assert.deepEqual(said, {
      // Placed in Group B and told; free Tuesday and Thursday evenings.
      amara: ["Group B", "Yes, Mon 26 Oct", "Fits A, B", "Holding a place", null, null],
      // Placed in Group B and not told yet: the lead places people, and sees the placement, as on the board.
      kofi: ["Group B", "Yes, Tue 27 Oct", "Fits B", "Holding a place", null, null],
      // Placed in Group A; sent the form with no week painted.
      bea: ["Group A", "Yes, Sun 25 Oct", "Not said", "Holding a place", null, null],
      zach: ["Group A", "Not yet", "Fits B", "Holding a place", null, null],
      dev: [words.NOT_IN_A_GROUP, "Not yet", "Fits C", "Holding a place", null, null],
      // An hour on Tuesday is under four hours in the week, so it is read "from
      // then on" (`paintedWeek.ts`): Group B meets later that Tuesday.
      tariq: [words.NOT_IN_A_GROUP, "Not yet", "Fits B", "Holding a place", null, null],
      // Taken off the run by staff, which gave the form's place back: under
      // Gave their place back, and the run says Callum was taken off, and
      // when, in the words the hand-over panel and Callum's own page use
      // (26 Oct, Zach's default; it said "Left the programme" before).
      callum: [words.NOT_IN_A_GROUP, "No", "Fits B", "Taken off the programme", null, "Tue 3 Nov"],
      nina: [words.NOT_IN_A_GROUP, "No", "Fits B", "Gave their place back", "The times don’t work for me", "Fri 23 Oct"],
      // Left the run after Publish: the day, and not what Sam said on leaving,
      // which the programme's Overview reads out.
      sam: [words.NOT_IN_A_GROUP, "No", "Fits B", "Left the programme", null, "Mon 2 Nov"],
      ruth: [words.NOT_IN_A_GROUP, "Not yet", "Fits B", "Invited", "Thu 29 Oct", "Tue 27 Oct"],
    });
    // In the board's order: holding a place (in a group, by the run's group
    // order, then not), then who gave a place back, then who is invited.
    assert.deepEqual(
      view.rows.map((row) => row.uid),
      ["amara", "kofi", "bea", "zach", "dev", "tariq", "callum", "nina", "sam", "ruth"],
    );
    assert.equal(rowOf(view, "amara").detail, "BA Philosophy · Graduating 2028");
  });

  test("More offers the person's application, and People in groups for somebody holding a place", async () => {
    const { view } = await open("claudia");
    assert.equal(rowOf(view, "amara").applicationHref, `${PROGRAMME_PATH}/applications/amara`);
    assert.equal(rowOf(view, "amara").groupsHref, `${PROGRAMME_PATH}/groups`);
    assert.equal(rowOf(view, "nina").groupsHref, null);
    assert.equal(rowOf(view, "ruth").groupsHref, null);
  });

  test("a reply moves the row, and the counts with it", async () => {
    const before = (await open("claudia")).view;
    world.db.poke(`admissionApplications/${ROUND}__dev`, { attendance: { answer: "coming", answeredAt: new Date("2026-10-26T09:30:00Z") } });
    const after = (await open("claudia")).view;
    assert.equal(words.comingWords(rowOf(after, "dev").coming), "Yes, Mon 26 Oct");
    assert.equal(after.counts.coming, before.counts.coming + 1);
    assert.equal(after.counts["havent-said"], before.counts["havent-said"] - 1);
  });

  test("the page draws the board's words", async () => {
    const { html, text } = await open("claudia");
    // Somebody under Gave their place back left the run, so the filter says so
    // too, as the sentence does (walk 4b, L6); before anybody leaves it is the
    // board's "Gave their place back" (section 5).
    for (const label of ["Everyone", "Coming", "Haven’t said", "Not said when they’re free", "Gave their place back or left", "Invited"]) {
      assert.match(html, new RegExp(`aria-pressed="(true|false)"[^>]*>${label}<span`), label);
    }
    assert.doesNotMatch(html, /aria-pressed="(true|false)"[^>]*>Gave their place back<span/);
    assert.match(html, /role="group" aria-label="Show"/);
    for (const words_ of [
      "6 hold a place; 1 gave theirs back; 2 left.",
      "Leads see names, degrees and replies. Email addresses and access requirements stay with admins.",
      "Everyone who holds a place or gave it back",
      "Showing 9 of 9",
    ]) {
      assert.ok(text.includes(words_), words_);
    }
    assert.match(html, /placeholder="Search names or degrees"/);
    for (const heading of ["Name", "Group", "Coming?", "When they’re free", "Status"]) {
      assert.ok(new RegExp(`<th scope="col"[^>]*>`).test(html) && html.includes(`>${heading}</th>`), heading);
    }
    assert.match(html, /aria-label="More for Amara Okafor"/);
    assert.ok(!text.includes("Show more"), "Show more is offered with nothing more to show");
  });

  test("the table says who staff took off and who left by themselves, each in amber with the day", async () => {
    const { html, text } = await open("claudia");
    const chip = (words_, day) => `<span class="chip chipWarn">${words_}</span><span class="statusDay">${day}</span>`;
    assert.ok(html.includes(chip("Taken off the programme", "Tue 3 Nov")), "Callum's removal");
    assert.ok(html.includes(chip("Left the programme", "Mon 2 Nov")), "Sam's leaving");
    assert.equal(html.split("Taken off the programme").length - 1, 1, "one removal is drawn once");
    assert.match(text, /Callum Price BSc Geography · Graduating 2028 Group Not in a group Coming\? No When they’re free Fits B Status Taken off the programme Tue 3 Nov /);
    assert.match(text, /Sam [^·]+· Graduating \d{4} Group Not in a group Coming\? No When they’re free Fits B Status Left the programme Mon 2 Nov /);
  });

  test("said they're coming is the one reading: to a place held on this programme, on its own day, and never a no for silence", () => {
    const on = new Date("2026-10-26T10:00:00Z");
    const place = (over) => ({
      status: "accepted",
      result: { kind: "accepted", programmeId: AGI },
      invitation: null,
      attendance: null,
      ...over,
    });
    assert.deepEqual(comingReplyOf(place({ attendance: { answer: "coming", answeredAt: on } }), AGI), { said: true, on });
    // No reply is not a yes, and it is not a no either: the column says "Not yet".
    assert.deepEqual(comingReplyOf(place({}), AGI), { said: false });
    // A place held on another programme says nothing about this one.
    assert.deepEqual(comingReplyOf(place({ attendance: { answer: "coming", answeredAt: on } }), "technical-ai-safety"), { said: false });
    // "I can't make it" gives the place back: never a yes.
    assert.deepEqual(
      comingReplyOf(place({ status: "withdrawn", attendance: { answer: "cant-make-it", answeredAt: on } }), AGI),
      { said: false },
    );
    // Accepting an invitation is how somebody invited says so, on the day they accepted.
    assert.deepEqual(
      comingReplyOf(
        {
          status: "accepted",
          result: { kind: "invited", programmeId: AGI },
          invitation: { programmeId: AGI, replyBy: "2026-10-29", response: "accepted", respondedAt: on },
          attendance: null,
        },
        AGI,
      ),
      { said: true, on },
    );
  });

  test("the search reads names and degree lines, ignoring case and accents", () => {
    const amara = { name: "Amara Okafor", detail: "BA Philosophy · Graduating 2028" };
    assert.ok(filters.rowMatchesSearch(amara, ""));
    assert.ok(filters.rowMatchesSearch(amara, "philo"));
    assert.ok(filters.rowMatchesSearch(amara, "OKAFOR ba"));
    assert.ok(!filters.rowMatchesSearch(amara, "law"));
    assert.ok(filters.rowMatchesSearch({ name: "Zoë Brontë", detail: "" }, "zoe bronte"));
  });
});

// ---------------------------------------------------------------------------
// 5. The words
// ---------------------------------------------------------------------------

/** A gendered pronoun, as a whole word. Spelt out by letters so this file says none itself. */
const GENDERED = new RegExp(`\\b(${["h,e", "s,h,e", "h,i,m", "h,e,r", "h,i,s", "h,e,r,s"].map((w) => w.split(",").join("")).join("|")})\\b`, "i");

describe("5. the words", () => {
  test("the sentence over the table", () => {
    assert.equal(words.placesSentence(30, 2), "30 hold a place; 2 gave theirs back.");
    assert.equal(words.placesSentence(1, 1), "1 holds a place; 1 gave theirs back.");
    assert.equal(words.placesSentence(4, 0), "4 hold a place.");
    assert.equal(words.placesSentence(0, 0), "Nobody holds a place yet.");
    // Somebody who left the run, said apart (walk 4b, L6).
    assert.equal(words.placesSentence(6, 1, 2), "6 hold a place; 1 gave theirs back; 2 left.");
    assert.equal(words.placesSentence(6, 0, 1), "6 hold a place; 1 left.");
    assert.equal(words.placesSentence(0, 0, 1), "0 hold a place; 1 left.");
  });

  test("the filter for giving a place back says left too once somebody under it left the run", () => {
    const row = (category, kind) => ({ category, status: { kind } });
    assert.equal(words.filterLabelWords("gave-back", false), "Gave their place back");
    assert.equal(words.filterLabelWords("gave-back", true), "Gave their place back or left");
    assert.equal(words.filterLabelWords("coming", true), "Coming");
    assert.equal(words.someoneLeftOf([row("gave-back", "gave-back"), row("holding", "left")]), false, "a leaver still holding a place is not under it");
    assert.equal(words.someoneLeftOf([row("gave-back", "gave-back"), row("gave-back", "left")]), true);
  });

  test("a seat that has left the run reads as the hand-over panel and the person's own page read it", async () => {
    const panelWords = await loadTs(join("features", "applications", "editor", "runHandOverWords.ts"));
    const pageWords = await loadTs(join("lib", "applications", "status", "words.ts"));
    const left = (by) => words.statusWords({ kind: "left", on: "Mon 2 Nov", by });
    assert.equal(left("staff"), "Taken off the programme");
    assert.equal(left("themselves"), "Left the programme");
    // One set of words for each kind of leaving, wherever it is said.
    assert.deepEqual([left("staff"), left("staff")], [panelWords.TAKEN_OFF_TITLE, pageWords.REMOVED_CHIP]);
    assert.deepEqual([left("themselves"), left("themselves")], [panelWords.LEFT_TITLE, pageWords.LEFT_CHIP]);
  });

  test("the words module and the table carry no dash of either kind and no gendered pronoun", () => {
    for (const file of [
      join(SRC, "lib", "applications", "people", "words.ts"),
      join(SRC, "features", "applications", "people", "ProgrammePeople.tsx"),
      join(SRC, "lib", "applications", "people", "model.ts"),
      join(SRC, "lib", "applications", "people", "load.ts"),
    ]) {
      const source = readFileSync(file, "utf8");
      assert.ok(!/[\u2013\u2014]/.test(source), `${file} carries a dash`);
      assert.ok(!GENDERED.test(source), `${file} carries a gendered pronoun`);
    }
  });
});
