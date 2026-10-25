/**
 * The pages a facilitator uses every week (plan item 2.6): their group's page
 * (boards wk-fac-group and wk-fac-group-phone), the group's register page,
 * their Home (wk-fac-home-phone) and the summary route behind it, the notes
 * the group's facilitators share (C30) on the group page and on the
 * programme's Attendance tab, as every kind of caller, in week 1, week 3 and
 * after the end.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS WHAT. The group page and the register page are the group's
 *     live facilitators' and admins'; everybody else is sent away, and never
 *     told whether the group exists. The summary route is theirs too.
 *  2. THE GROUP PAGE SAYS WHAT THE BOARD DRAWS, every value from a record:
 *     the head, the two buttons, the ticket with who is expected and "Take
 *     the register", the group's people with each FINISHED register's marks
 *     and who left, the registers with how many came, the work waiting for a
 *     review, the updates, the pace, and the notes.
 *  3. THE NOTES are read by the group's facilitators, the programme's lead
 *     and admins, newest first, each with its writer and day; only the
 *     group's facilitators are given the box to add one.
 *  4. HOME says tonight's session, how many are expected, where "Take the
 *     register" leads, this week's theme, what waits for a review, when next
 *     week's email goes while it is on its schedule (and nothing while it is
 *     not), and who left recently, by name and never by a pronoun.
 *  5. THE WORDS in week 1, week 3 and after the end, and the words module
 *     carries no dash and no gendered pronoun.
 *
 * Real: the pages, the routes, the loaders and the components, rendered to
 * HTML. Faked: see `tests/lib/facilitatorPagesWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enrolment, registerPath, switches } from "./lib/hubAttendanceWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { B, C, NOW, RUN, facilitatorSeed, find, makeFacilitatorPagesWorld } from "./lib/facilitatorPagesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorPagesWorld("__facilitatorPagesSuite");
const { world, at, reset, groupPage, registerPage, attendanceTab, summary, note, home, words } = w;

const RUN_HOME = `/learn/${RUN.agi}`;
const GROUP_PATH = (groupId = B) => `${RUN_HOME}/group/${groupId}`;

/** What the page's ticket, cards and head hand their components, read off the element tree. */
function partsOf(drawn) {
  const one = (name) => find(drawn.element, name)[0]?.props ?? null;
  return {
    ticket: one("FacilitatorTicket"),
    people: one("GroupPeopleCard"),
    registers: one("GroupRegistersCard"),
    review: one("ToReviewCard"),
    pace: one("PaceCard"),
    notes: one("GroupNotesCard"),
  };
}

/** Each person's boxes, as words: "P", "L", or the reason there is none. */
const boxes = (person) => person.marks.map((mark) => (mark.kind === "mark" ? mark.mark : mark.kind));

/** Group B's week 3 email, as if next week's email had already sent it on its schedule. */
function week3EmailSent() {
  world.db.seed(`courseNudges/gnudge__${RUN.agi}__${B}__2026-11-12`, {
    runId: RUN.agi,
    groupId: B,
    sentAt: new Date("2026-11-15T18:00:00Z"),
    via: "schedule",
  });
}

beforeEach(() => reset());

// ---------------------------------------------------------------------------
// 1. Who opens what
// ---------------------------------------------------------------------------

describe("1. who opens a group's page, its register and its summary", () => {
  test("the group page: its two facilitators and an admin; everybody else is sent away", async () => {
    const said = {};
    for (const who of ["rahul", "sofia", "zach", "claudia", "tess", "lloyd", "yusuf", "tom", "chloe", "amara", "nobody", null]) {
      const drawn = await groupPage(who);
      said[who ?? "signed out"] = drawn.to ?? "drawn";
      assert.equal(drawn.wrote, false, `${who}'s page wrote something`);
    }
    assert.deepEqual(said, {
      rahul: "drawn",
      sofia: "drawn",
      zach: "drawn",
      claudia: RUN_HOME,
      tess: RUN_HOME,
      lloyd: RUN_HOME,
      yusuf: RUN_HOME,
      tom: RUN_HOME,
      chloe: RUN_HOME,
      amara: RUN_HOME,
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("the register page: the same people, and the same answer for everybody else", async () => {
    const said = {};
    for (const who of ["rahul", "sofia", "zach", "claudia", "tom", "chloe", "nobody", null]) {
      const drawn = await registerPage(who);
      said[who ?? "signed out"] = drawn.to ?? drawn.text;
    }
    const drawnFor = "Group B Group B Group B’s register [AttendanceGrid]";
    assert.deepEqual(said, {
      rahul: drawnFor,
      sofia: drawnFor,
      zach: drawnFor,
      claudia: RUN_HOME,
      tom: RUN_HOME,
      chloe: RUN_HOME,
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("the register page leads back to its group, and draws the register's own grid", async () => {
    const drawn = await registerPage("rahul");
    assert.equal(find(drawn.element, "AttendanceGrid").length, 1);
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH()}" class="back">`));
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH()}" class="crumb crumbDesk">Group B</a>`));
  });

  test("an archived group: its facilitators are sent away from both pages; an admin reads them with nothing to press", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await groupPage("rahul")).to, RUN_HOME);
    assert.equal((await registerPage("rahul")).to, RUN_HOME);
    const asAdmin = await groupPage("zach");
    assert.equal(asAdmin.to, null);
    assert.doesNotMatch(asAdmin.text, /Write to|Change a session|Add a note|Weeks & schedule/);
  });

  test("a group of another run, addressed under this run, is nobody's page", async () => {
    world.db.poke(`courseGroups/${B}`, { runId: RUN.tais });
    for (const who of ["rahul", "zach"]) {
      assert.equal((await groupPage(who)).to, RUN_HOME, who);
      assert.equal((await registerPage(who)).to, RUN_HOME, who);
    }
  });

  test("the summary route: the group's facilitators and admins; one refusal for everybody else", async () => {
    const said = {};
    for (const who of ["rahul", "sofia", "zach", "claudia", "tess", "lloyd", "yusuf", "tom", "chloe", "amara", "nobody", null]) {
      const answer = await summary(who);
      said[who ?? "signed out"] = answer.status;
    }
    assert.deepEqual(said, {
      rahul: 200,
      sofia: 200,
      zach: 200,
      claudia: 403,
      tess: 403,
      lloyd: 403,
      yusuf: 403,
      tom: 403,
      chloe: 403,
      amara: 403,
      nobody: 403,
      "signed out": 401,
    });
    assert.equal((await summary("rahul", "no-such-group__grp99999")).status, 403);
    assert.equal((await summary("zach", "no-such-group__grp99999")).status, 404);
  });

  test("the summary route answers names and counts, field by field, never an address", async () => {
    const answer = await summary("rahul");
    assert.deepEqual(answer.body, {
      groupId: B,
      expected: 3,
      notYetTold: false,
      toReview: 3,
      nextEmail: null,
      leftRecently: [],
      coFacilitators: ["Sofia"],
    });
    assert.deepEqual((await summary("sofia")).body.coFacilitators, ["Rahul"]);
    assert.deepEqual((await summary("zach")).body.coFacilitators, ["Rahul", "Sofia"]);
    for (const who of ["rahul", "sofia", "zach"]) assert.doesNotMatch(JSON.stringify((await summary(who)).body), /@/);
  });
});

// ---------------------------------------------------------------------------
// 2. The group page, as the board draws it (week 3)
// ---------------------------------------------------------------------------

describe("2. the group page in week 3, as wk-fac-group draws it", () => {
  test("the head: the group, its week, its programme, its day, time and room, and the other facilitator", async () => {
    const drawn = await groupPage("rahul");
    assert.match(drawn.html, /<h1 class="title">Group B<\/h1><span class="weekChip">Week 3 of 6<\/span>/);
    assert.match(drawn.text, /Fellowship: AGI Strategy · , Tuesdays 6pm · , Hallward B12 · , with Sofia Rossi/);
    assert.match(
      drawn.html,
      new RegExp(
        `<div class="buttons"><a href="${GROUP_PATH()}/update" class="button">Write to Group B \\(3\\)</a>` +
          `<a href="${GROUP_PATH()}/sessions" class="buttonGhost">Change a session</a></div>`,
      ),
    );
    // Sofia reads Rahul as the other; an admin, both.
    assert.match((await groupPage("sofia")).text, /Hallward B12 · , with Rahul Mehta Write to/);
    assert.match((await groupPage("zach")).text, /Hallward B12 · , with Rahul Mehta and Sofia Rossi Write to/);
  });

  test("the ticket: tonight's session, its room, who is expected, and Take the register leading to the register", async () => {
    const { ticket } = partsOf(await groupPage("rahul"));
    assert.deepEqual(
      { eyebrow: ticket.eyebrow, heading: ticket.heading, room: ticket.facts.room, expected: ticket.expected, href: ticket.registerHref, changed: ticket.roomChanged },
      { eyebrow: "Tonight · week 3", heading: "Tue 17 Nov, 6pm", room: "Hallward B12", expected: 3, href: `${GROUP_PATH()}/register`, changed: false },
    );
    const drawn = await groupPage("rahul");
    assert.match(drawn.text, /Tue 17 Nov Tonight · week 3 Tue 17 Nov, 6pm Hallward B12 3 expected Take the register/);
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH()}/register" class="buttonPrimary">Take the register</a>`));
  });

  test("your group: each person with each finished register's mark, who left last with the day, and the names line", async () => {
    const { people } = partsOf(await groupPage("rahul"));
    assert.deepEqual(people.finishedWeeks, [1, 2]);
    assert.deepEqual(
      people.people.map((person) => [person.name, boxes(person)]),
      [
        ["Chloe Nguyen", ["present", "present"]],
        ["Farah Hussain", ["present", "late"]],
        ["Kofi Asante", ["excused", "present"]],
      ],
    );
    // Omar, whom staff took off after week 1, is listed where a register marked him.
    assert.deepEqual(people.leavers.map((person) => [person.name, person.left, boxes(person)]), [["Omar Haddad", "Left", ["present", "after"]]]);
    const drawn = await groupPage("rahul");
    assert.match(
      drawn.text,
      /Your group Weeks 1 and 2 CN Chloe Nguyen P P FH Farah Hussain P L KA Kofi Asante E P OH Omar Haddad Left P Names only\. Email addresses stay with admins\./,
    );
    // Each box is said whole to a screen reader.
    assert.match(drawn.html, /role="img" aria-label="Week 2: Late" title="Late">L</);
    assert.match(drawn.html, /role="img" aria-label="Week 2: Had left" title="Had left"><\/span>/);
  });

  test("a register not finished shows no mark: the facilitator's draft is theirs until they finish it", async () => {
    world.db.seed(registerPath(B, 3), {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 3,
      occurrence: 1,
      records: { chloe: "absent", farah: "absent", kofi: "absent" },
      held: true,
      pushedAt: null,
      participantNotes: {},
      notes: "",
    });
    at("2026-11-18T09:00:00Z");
    const { people } = partsOf(await groupPage("rahul"));
    assert.deepEqual(people.finishedWeeks, [1, 2]);
    assert.ok(people.people.every((person) => person.marks.length === 2));
  });

  test("registers: each week from the first to tonight's, finished with how many came, and tonight's", async () => {
    const { registers } = partsOf(await groupPage("rahul"));
    assert.deepEqual(
      registers.registers.map((row) => [row.weekNumber, row.dateKey, row.state, `${row.came} of ${row.of}`]),
      [
        [1, "2026-11-03", "finished", "3 of 4"],
        [2, "2026-11-10", "finished", "3 of 3"],
        [3, "2026-11-17", "today", "0 of 0"],
      ],
    );
    assert.equal(registers.registerHref, `${GROUP_PATH()}/register`);
    const drawn = await groupPage("rahul");
    // While the push still sends next week's email the register's own word is "Pushed".
    assert.match(drawn.text, /Registers Week 1 Tue 3 Nov Pushed 3 of 4 came See it Week 2 Tue 10 Nov Pushed 3 of 3 came See it Week 3 Tue 17 Nov Tonight/);
  });

  test("on the schedule the register's word is the board's: Finished", async () => {
    world.db.seed("config/scheduler", switches({ scheduled: true }));
    const drawn = await groupPage("rahul");
    assert.match(drawn.text, /Week 1 Tue 3 Nov Finished 3 of 4 came See it Week 2 Tue 10 Nov Finished 3 of 3 came See it/);
  });

  test("to review: each person's work waiting, newest first, from the group alone, each with Review on its week", async () => {
    const { review } = partsOf(await groupPage("rahul"));
    assert.deepEqual(
      review.rows.map((row) => [row.name, row.weekNumber, row.count, row.sentDateKey]),
      [
        ["Farah Hussain", 2, 1, "2026-11-16"],
        ["Chloe Nguyen", 2, 1, "2026-11-15"],
        ["Chloe Nguyen", 1, 1, "2026-11-08"],
      ],
    );
    const drawn = await groupPage("rahul");
    assert.match(
      drawn.text,
      // Each part of a row's line brings its dot, and a screen reader hears a comma between them.
      /To review 3 FH Farah Hussain · Week 2 exercise · , sent Mon 16 Nov Review CN Chloe Nguyen · Week 2 exercise · , sent Sun 15 Nov Review CN Chloe Nguyen · Week 1 exercise · , sent Sun 8 Nov Review Review exercises →/,
    );
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH()}/review\\?week=2" class="buttonGhost" aria-label="Review Farah Hussain, week 2 exercise">Review</a>`));
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH()}/review" class="cardFootLink">Review exercises`));
    // Amara's answer is Group A's, and Kofi's is reviewed: neither is here.
    assert.doesNotMatch(drawn.text, /Amara|Kofi Asante Week/);
  });

  test("two answers from one person in one week are one row, said as exercises", async () => {
    world.db.seed(`courseExerciseResponses/${RUN.agi}__farah__w02__x2b`, {
      runId: RUN.agi, uid: "farah", weekId: "w02", weekNumber: 2, exerciseId: "x2b", responseType: "text", text: "More.",
      submittedAt: new Date("2026-11-16T20:00:00Z"), reviewStatus: "unreviewed",
    });
    const { review } = partsOf(await groupPage("rahul"));
    assert.deepEqual(review.rows[0], { uid: "farah", name: "Farah Hussain", weekNumber: 2, count: 2, sentDateKey: "2026-11-16" });
    assert.match((await groupPage("rahul")).text, /Farah Hussain · Week 2 exercises · , sent Mon 16 Nov/);
  });

  test("nothing waiting says so, and still leads to every exercise", async () => {
    for (const path of world.db.paths().filter((p) => p.startsWith("courseExerciseResponses/"))) world.db.poke(path, { reviewStatus: "seen" });
    const drawn = await groupPage("rahul");
    assert.match(drawn.text, /To review Nothing to review\. Review exercises →/);
  });

  test("the review page opens on the week asked for, and on the group's own week for a week the group does not teach", async () => {
    const asked = await w.draw(w.pages.review, "rahul", { runId: RUN.agi, groupId: B }, { week: "2" });
    assert.equal(find(asked.element, "ReviewQueue")[0].props.initialWeek, 2);
    const odd = await w.draw(w.pages.review, "rahul", { runId: RUN.agi, groupId: B }, { week: "9" });
    assert.equal(find(odd.element, "ReviewQueue")[0].props.initialWeek, 3);
  });

  test("updates: the card the group's page already had, here beside the work to review", async () => {
    const drawn = await groupPage("rahul");
    assert.equal(find(drawn.element, "StaffUpdatesSection").length, 1);
    assert.match(drawn.text, /Updates No updates yet\. Pace On pace with the programme\. Weeks & schedule →/);
  });

  test("pace: a group pushed a week behind says so, and its chip is its own week", async () => {
    world.db.poke(`courseGroups/${B}`, {
      paceStartDate: "2026-10-29",
      paceWeekPlan: [
        { kind: "week", weekNumber: 1, weekId: "w01" },
        { kind: "week", weekNumber: 2, weekId: "w02" },
        { kind: "break", label: "Reading week" },
        { kind: "week", weekNumber: 3, weekId: "w03" },
        { kind: "week", weekNumber: 4, weekId: "w04" },
        { kind: "week", weekNumber: 5, weekId: "w05" },
        { kind: "week", weekNumber: 6, weekId: "w06" },
      ],
    });
    const drawn = await groupPage("rahul");
    assert.equal(partsOf(drawn).pace.weeksBehind, 1);
    assert.match(drawn.text, /Pace A week behind the programme\./);
    assert.match(drawn.html, /<span class="weekChip">Reading week<\/span>/);
  });

  test("the page reads, and writes nothing", async () => {
    assert.equal((await groupPage("rahul")).wrote, false);
    assert.equal((await registerPage("rahul")).wrote, false);
  });
});

// ---------------------------------------------------------------------------
// 3. The notes a group's facilitators share
// ---------------------------------------------------------------------------

describe("3. the notes a group's facilitators share", () => {
  test("no notes yet: the board's title and line, and the box for the group's facilitators alone", async () => {
    const asRahul = await groupPage("rahul");
    assert.match(
      asRahul.text,
      /Notes for you and Sofia Only Group B’s facilitators, Claudia and admins see these\. No notes yet\. Add a note Save note/,
    );
    assert.match(asRahul.html, /placeholder="What went well, who needs a nudge…"/);
    assert.match(asRahul.html, /<button type="submit" class="button" disabled="">Save note<\/button>/, "pressable before it hydrates");
    assert.equal(partsOf(asRahul).notes.writeFor, B);
    assert.match((await groupPage("sofia")).text, /Notes for you and Rahul Only Group B’s facilitators, Claudia and admins see these\./);
    const asAdmin = await groupPage("zach");
    assert.match(asAdmin.text, /Notes for Rahul and Sofia Only Group B’s facilitators, Claudia and admins see these\. No notes yet\.$/);
    assert.equal(partsOf(asAdmin).notes.writeFor, null);
  });

  test("written notes, newest first, each with its writer and day, on the page of the group they are about", async () => {
    assert.equal((await note("sofia", "Chloe and Isaac carried week 2. Try smaller pairs for the first 20 minutes.", { when: "2026-11-11T19:30:00Z" })).status, 200);
    assert.equal((await note("rahul", "Room change this week.", { when: "2026-11-16T09:00:00Z" })).status, 200);
    assert.equal((await note("tom", "Group C's own note.", { groupId: C })).status, 200);
    for (const who of ["rahul", "sofia", "zach"]) {
      const drawn = await groupPage(who);
      assert.deepEqual(
        partsOf(drawn).notes.notes.map((one) => [one.byline, one.body]),
        [
          ["Rahul · Mon 16 Nov", "Room change this week."],
          ["Sofia · Wed 11 Nov", "Chloe and Isaac carried week 2. Try smaller pairs for the first 20 minutes."],
        ],
        who,
      );
      assert.doesNotMatch(drawn.text, /Group C's own note/);
    }
  });

  test("the lead reads every group's notes on the Attendance tab, said to them as theirs, and writes none", async () => {
    await note("sofia", "Chloe and Isaac carried week 2.", { when: "2026-11-11T19:30:00Z" });
    await note("rahul", "Room change this week.", { when: "2026-11-16T09:00:00Z" });
    await note("tom", "Hamza led the discussion.", { groupId: C, when: "2026-11-12T14:00:00Z" });
    const asLead = await attendanceTab("claudia");
    const cards = find(asLead.element, "GroupNotesCard").map((card) => card.props);
    assert.deepEqual(
      cards.map((card) => [card.title, card.whoLine, card.notes.map((one) => one.byline), card.writeFor]),
      [
        ["Notes from Group B’s facilitators", "Only Group B’s facilitators, you and admins see these.", ["Rahul · Mon 16 Nov", "Sofia · Wed 11 Nov"], null],
        ["Notes from Group C’s facilitators", "Only Group C’s facilitators, you and admins see these.", ["Tom · Thu 12 Nov"], null],
      ],
    );
    assert.doesNotMatch(asLead.html, /<form|Add a note|Save note/);
    // An admin reads the same notes, the lead named.
    const asAdmin = await attendanceTab("zach");
    assert.deepEqual(
      find(asAdmin.element, "GroupNotesCard").map((card) => card.props.whoLine),
      ["Only Group B’s facilitators, Claudia and admins see these.", "Only Group C’s facilitators, Claudia and admins see these."],
    );
  });

  test("nobody else reads them: the programme's reviewer, another programme's lead, a facilitator, a member", async () => {
    await note("rahul", "Room change this week.");
    for (const who of ["lloyd", "tess"]) {
      const drawn = await attendanceTab(who);
      assert.doesNotMatch(drawn.html, /Room change this week/, who);
    }
    for (const who of ["rahul", "chloe"]) {
      const drawn = await attendanceTab(who);
      assert.equal(drawn.to, "/dashboard", who);
    }
    // A facilitator of another group of the run, and a member of the group, are sent away from its page.
    for (const who of ["tom", "chloe"]) assert.equal((await groupPage(who)).to, RUN_HOME, who);
  });

  test("the lead's tab shows no register note: those stay the group's facilitators' and admins'", async () => {
    const drawn = await attendanceTab("claudia");
    assert.doesNotMatch(drawn.html, /Struggled with the reading/);
  });
});

// ---------------------------------------------------------------------------
// 4. Home
// ---------------------------------------------------------------------------

describe("4. a facilitator's Home on session day, as wk-fac-home-phone draws it", () => {
  test("tonight's ticket, who is expected, the register's way and line, this week, what waits for a review", async () => {
    const drawn = await home("rahul");
    assert.match(
      drawn.text,
      /Hi Rahul\. .*Tue 17 Nov Tonight · week 3 Group B, 6pm Hallward B12 · with Sofia 3 expected Take the register Opens your group’s register for tonight\. This week Week 3 · Who decides what AGI means 3 exercises to review Review/,
    );
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH()}/register" class="primaryLarge registerCtaButton">Take the register</a>`));
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH()}/review" class="textLink">Review`));
    // The board's Home draws no names: they are on the group page.
    assert.doesNotMatch(drawn.text, /Chloe|Farah|Kofi/);
  });

  test("next week's email: nothing while the push still sends it", async () => {
    week3EmailSent();
    assert.doesNotMatch((await home("rahul")).text, /Next week’s email/);
  });

  test("next week's email on its schedule: when the next one goes, at the session's own time two days before", async () => {
    world.db.seed("config/scheduler", switches({ scheduled: true }));
    week3EmailSent();
    const drawn = await home("rahul");
    assert.match(drawn.text, /3 exercises to review Review Next week’s email goes to Group B on Sun 22 Nov at 6pm\./);
    assert.deepEqual(drawn.summary.nextEmail, { state: "goes", at: "Sun 22 Nov at 6pm" });
  });

  test("somebody who left recently, by name and never a pronoun, until the session after they left is over", async () => {
    world.db.seed(`courseEnrolments/${RUN.agi}__kofi`, enrolment("kofi", B, { status: "withdrawn", droppedOutAt: new Date("2026-11-13T10:00:00Z"), dropOutReason: "Too much on." }));
    const drawn = await home("rahul");
    assert.match(drawn.text, /Kofi Asante left the programme on Fri 13 Nov\. Kofi’s off the register from tonight\./);
    assert.doesNotMatch(drawn.text, /\b(He|She|he|she|his|her|him)\b/);
    assert.match(drawn.text, /2 expected/);
    // On the group page Kofi is last, with the day.
    const { people } = partsOf(await groupPage("rahul"));
    assert.deepEqual(people.leavers.map((person) => [person.name, person.left]), [["Kofi Asante", "Left Fri 13 Nov"], ["Omar Haddad", "Left"]]);
    // The morning after tonight's session, the register says it, and Home does not.
    at("2026-11-18T09:00:00Z");
    assert.doesNotMatch((await home("rahul")).text, /left the programme/);
  });

  test("on another day than the session's, the register's line says where it leads, not tonight", async () => {
    at("2026-11-15T10:00:00Z");
    const drawn = await home("rahul");
    assert.match(drawn.text, /Your next session · week 3 Group B, 6pm .* Take the register Opens your group’s register\. This week/);
  });
});

// ---------------------------------------------------------------------------
// 5. Week 1, before the first session, and after the end
// ---------------------------------------------------------------------------

/** The run before any register: no register and no answer of any group's. */
function freshSeed() {
  const seed = facilitatorSeed();
  for (const path of Object.keys(seed)) {
    if (path.startsWith("courseAttendance/") || path.startsWith("courseExerciseResponses/")) delete seed[path];
  }
  return seed;
}

describe("5. the words in week 1, before the first session and after the end", () => {
  test("before the group's first session: its first session, no week behind, and when the first register is", async () => {
    reset(freshSeed());
    at("2026-10-31T10:00:00Z");
    const drawn = await groupPage("rahul");
    assert.match(drawn.html, /<span class="weekChip">Week 1 of 6<\/span>/);
    assert.match(drawn.text, /Your first session · week 1 Tue 3 Nov, 6pm Hallward B12 3 expected Take the register/);
    assert.match(drawn.text, /Your group CN Chloe Nguyen FH Farah Hussain KA Kofi Asante Names only\./);
    assert.match(drawn.text, /Registers The first register is on Tue 3 Nov\./);
    assert.match(drawn.text, /To review Nothing to review\./);
    const onHome = await home("rahul");
    assert.match(onHome.text, /Your first session · week 1 Group B, 6pm .* Opens your group’s register\. This week Week 1 · Week 1 readings Nothing to review\. Review/);
  });

  test("week 1, the day of the first session: tonight's register, and no marks yet", async () => {
    reset(freshSeed());
    at("2026-11-03T12:00:00Z");
    const drawn = await groupPage("rahul");
    const parts = partsOf(drawn);
    assert.equal(parts.ticket.eyebrow, "Tonight · week 1");
    assert.deepEqual(parts.people.finishedWeeks, []);
    assert.deepEqual(parts.registers.registers.map((row) => [row.weekNumber, row.state]), [[1, "today"]]);
    assert.match(drawn.text, /Your group CN Chloe Nguyen FH Farah Hussain KA Kofi Asante Names only\./);
    assert.match((await home("rahul")).text, /Tonight · your first session Group B, 6pm/);
  });

  test("before Publish has told anybody: the names to come, on the page, the register page and Home, and nobody counted", async () => {
    const seed = freshSeed();
    for (const uid of ["chloe", "farah", "kofi"]) seed[`courseEnrolments/${RUN.agi}__${uid}`].allocatedEmailAt = null;
    reset(seed);
    at("2026-10-28T10:00:00Z");
    const drawn = await groupPage("rahul");
    assert.match(drawn.text, /Your group You’ll see your group’s names when groups go out\. Names only\./);
    assert.doesNotMatch(drawn.text, /\d+ expected/);
    assert.match((await registerPage("rahul")).text, /Group B’s register You’ll see your group’s names when groups go out\. \[AttendanceGrid\]/);
    assert.match((await home("rahul")).text, /You’ll see your group’s names when groups go out\./);
    // An admin reads everybody placed, as the register always has.
    assert.match((await groupPage("zach")).text, /Chloe Nguyen .*Farah Hussain .*Kofi Asante/);
  });

  test("after the end: no ticket, no chip, every register with its state, and nothing waiting to be chased on Home", async () => {
    at("2026-12-10T12:00:00Z");
    const drawn = await groupPage("rahul");
    const parts = partsOf(drawn);
    assert.equal(parts.ticket, null);
    assert.doesNotMatch(drawn.html, /weekChip/);
    assert.deepEqual(
      parts.registers.registers.map((row) => [row.weekNumber, row.state]),
      [[1, "finished"], [2, "finished"], [3, "not-finished"], [4, "not-finished"], [5, "not-finished"], [6, "not-finished"]],
    );
    assert.match(drawn.text, /Week 3 Tue 17 Nov Not pushed See it/);
    const onHome = await home("rahul");
    assert.match(onHome.text, /No more sessions are planned for your group\./);
    assert.doesNotMatch(onHome.text, /Take the register|left the programme|Next week’s email/);
  });

  test("a session cancelled through Change a session is said as cancelled, and nothing is asked of its register", async () => {
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w02: { kind: "cancelled", reason: "Both away.", dateKey: "2026-11-10", byUid: "rahul", at: new Date("2026-11-05T10:00:00Z") } },
    });
    const { registers } = partsOf(await groupPage("rahul"));
    assert.deepEqual(registers.registers.map((row) => [row.weekNumber, row.state]), [[1, "finished"], [2, "cancelled"], [3, "today"]]);
    assert.match((await groupPage("rahul")).text, /Week 2 Tue 10 Nov Cancelled Week 3/);
  });
});

// ---------------------------------------------------------------------------
// 6. The words
// ---------------------------------------------------------------------------

describe("6. the words", () => {
  test("somebody who left, said by name from tonight, today, a day, or with no day at all", () => {
    const name = { name: "Sam Whitfield", firstName: "Sam", leftDateKey: "2026-11-13" };
    assert.equal(words.leftLine({ ...name, from: { kind: "tonight" } }), "Sam Whitfield left the programme on Fri 13 Nov. Sam’s off the register from tonight.");
    assert.equal(words.leftLine({ ...name, from: { kind: "today" } }), "Sam Whitfield left the programme on Fri 13 Nov. Sam’s off the register from today.");
    assert.equal(words.leftLine({ ...name, from: { kind: "day", dateKey: "2026-11-17" } }), "Sam Whitfield left the programme on Fri 13 Nov. Sam’s off the register from Tue 17 Nov.");
    assert.equal(words.leftLine({ ...name, leftDateKey: null, from: null }), "Sam Whitfield left the programme. Sam’s off the register.");
  });

  test("pace, notes, the register's line and the counts", () => {
    assert.deepEqual([0, 1, 2, -1, -3].map(words.paceWords), [
      "On pace with the programme.",
      "A week behind the programme.",
      "2 weeks behind the programme.",
      "A week ahead of the programme.",
      "3 weeks ahead of the programme.",
    ]);
    assert.equal(words.notesTitle(["Sofia"], true), "Notes for you and Sofia");
    assert.equal(words.notesTitle([], true), "Notes for you");
    assert.equal(words.notesTitle(["Rahul", "Sofia"], false), "Notes for Rahul and Sofia");
    assert.equal(words.notesWhoLine("Group B", { firstName: "Claudia", isReader: false }), "Only Group B’s facilitators, Claudia and admins see these.");
    assert.equal(words.notesWhoLine("Group B", { firstName: "", isReader: true }), "Only Group B’s facilitators, you and admins see these.");
    assert.equal(words.notesWhoLine("Group B", null), "Only Group B’s facilitators and admins see these.");
    assert.equal(words.takeRegisterLine(true, "18:00"), "Opens your group’s register for tonight.");
    assert.equal(words.takeRegisterLine(true, "13:00"), "Opens your group’s register for today.");
    assert.equal(words.takeRegisterLine(false, "18:00"), "Opens your group’s register.");
    assert.deepEqual([0, 1, 3].map(words.toReviewWords), ["Nothing to review.", "1 exercise to review", "3 exercises to review"]);
    assert.equal(words.finishedWeeksWords([1, 2]), "Weeks 1 and 2");
    assert.equal(words.finishedWeeksWords([1]), "Week 1");
    assert.equal(words.programmeWords("fellowship", "AGI Strategy"), "Fellowship: AGI Strategy");
    assert.equal(words.programmeWords(null, "AGI Strategy Fellowship"), "AGI Strategy Fellowship");
    assert.equal(words.homeNextEmailWords("Group B", { state: "goes", at: "Sun 22 Nov at 6pm" }), "Next week’s email goes to Group B on Sun 22 Nov at 6pm.");
  });

  test("the words module carries no dash of either kind and no gendered pronoun", () => {
    const source = readFileSync(join(SRC, "lib", "courses", "facilitatorPageWords.ts"), "utf8");
    assert.doesNotMatch(source, /[\u2013\u2014]/);
    // What a page can say: the module's strings, its comments set aside (they
    // quote the board's own pronoun to say why it is never said).
    const strings = [...stripSource(source, { keepStrings: true }).matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)]
      .map((m) => m[1] ?? m[2])
      .join("\n");
    assert.ok(strings.includes("’s off the register"), "the scan reads no string of the module");
    assert.doesNotMatch(strings, /\b(he|she|his|hers|him|her|himself|herself)\b/i);
  });
});
