/**
 * THE FACILITATOR GUIDE AND THE GROUP, ONE PRESS AWAY, as every page a
 * facilitator already uses draws them: Home in each of its states, the
 * group page's ticket and the cards in its place, the register, My
 * programmes' card and the programme page's group card.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE ONE RULE, pure (`src/lib/courses/facilitatorGuide/links.ts`): a
 *     read of the guide is failed, nothing loaded, or the weeks loaded; the
 *     card draws the week's link or the sentence saying it is not loaded and
 *     who loads it, the guide's course page, one sentence for a course with
 *     nothing, and on a failed read the course page alone for somebody the
 *     page knows the guide admits and nothing for anybody else.
 *  2. HOME, before the first session, from the first session on, after the
 *     last, on a failed read and while the answer is on its way.
 *  3. THE GROUP PAGE draws when the guide's read throws, keeps the guide
 *     after the last session, and draws it in a small card for a group with
 *     no dates yet.
 *  4. THE REGISTER links the register's week by the guide's own gate: for
 *     the group's facilitators and admins, and nothing for somebody given
 *     one session or a run's track lead, whom the guide refuses; a member is
 *     sent away as before.
 *  5. MY PROGRAMMES: `/api/courses/me` names a facilitator's groups on their
 *     row and nothing on anybody else's, never a meeting link; the card
 *     draws its three doors for that row alone; the programme page's group
 *     card opens the group by name and links its week's guide.
 *
 * Real: see `tests/lib/facilitatorGuideWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { COURSE, NOW, RUN, find, makeFacilitatorGuideWorld, textOf } from "./lib/facilitatorGuideWorld.mjs";
import { A, B } from "./lib/facilitatorPagesWorld.mjs";
import { enrolment } from "./lib/hubAttendanceWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorGuideWorld("__facilitatorGuideLinksSuite");
const { world, reset, seedGuide, groupPage, registerPage, homeWithGuide, guide, draw, pages, at } = w;

const RunCard = (await w.loadTs(join("features", "courses", "RunCard.tsx"))).default;
const Panel = (await w.loadTs(join("features", "courses", "FacilitatorGroupPanel.tsx"))).default;
const meRoute = await w.courseRoute("me");

/** Every run `who`'s member area lists, as `/api/courses/me` answers them. */
async function me(who) {
  const answer = await w.call(who, meRoute.GET, {}, { course: true });
  assert.equal(answer.status, 200, who);
  return answer.body.runs;
}

const AGI_GUIDE = `/learn/facilitator-guide/${COURSE.agi}`;
const GROUP_B = `/learn/${RUN.agi}/group/${B}`;
const FAILED = { kind: "failed" };
const EMPTY = { kind: "empty" };
const loaded = (...weeks) => ({ kind: "loaded", weeks });

/** AGI Strategy's lead is Claudia: who loads the guide, where a group is known. */
const WEEK_2_NOT_LOADED = "Week 2’s plan isn’t in the guide yet. Claudia or an admin loads it.";
const NOTHING_LOADED = "There’s nothing in this course’s facilitator guide yet. Claudia or an admin loads it, and it will show here.";

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

beforeEach(async () => {
  reset();
  await seedGuide();
});

/**
 * The Admin SDK's handle with one collection that throws when it is asked
 * for, for `run`'s duration: a read of the guide that fails.
 */
async function withBrokenCollection(name, run) {
  const real = world.courseDb;
  world.courseDb = new Proxy(real, {
    get(target, key) {
      if (key === "collection") {
        return (asked) => {
          if (asked === name) throw new Error(`the ${asked} read failed`);
          return target.collection(asked);
        };
      }
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  try {
    return await run();
  } finally {
    world.courseDb = real;
  }
}

/** Week 3's session of Group B given to Lloyd, who runs nothing else on the programme's groups, by Zach. */
function giveWeekThreeToLloyd() {
  const at = new Date("2026-11-16T09:00:00Z");
  world.db.seed(`courseAttendance/${RUN.agi}__${B}__w03`, {
    runId: RUN.agi,
    groupId: B,
    weekNumber: 3,
    occurrence: 1,
    records: {},
    cover: { kind: "given", byUid: "lloyd", at, covering: ["rahul", "sofia"], grantedByUid: "zach", grantedAt: at, until: new Date("2026-11-18T00:00:00Z") },
  });
}

// ---------------------------------------------------------------------------
// 1. The one rule
// ---------------------------------------------------------------------------

describe("1. the one rule for the guide's links, pure", () => {
  const view = (read, over = {}) =>
    guide.links.guideLinksView({ read, courseId: COURSE.agi, weekNumber: 3, knownReader: true, leadFirstName: "Claudia", ...over });
  const week3 = { href: `${AGI_GUIDE}/week-3`, label: "Facilitator guide for week 3" };
  const standing = { href: AGI_GUIDE, label: "Facilitator guide" };

  test("the week loaded: both links; not loaded while something is: the sentence and the course page", () => {
    assert.deepEqual(view(loaded(1, 3)), { week: week3, standing, sentence: null });
    assert.deepEqual(view(loaded(1)), { week: null, standing, sentence: "Week 3’s plan isn’t in the guide yet. Claudia or an admin loads it." });
    // Only the course's own documents: something is loaded, week 3 is not.
    assert.deepEqual(view(loaded()), { week: null, standing, sentence: "Week 3’s plan isn’t in the guide yet. Claudia or an admin loads it." });
  });

  test("nothing loaded: one sentence in place of both; who loads it is an admin where no lead stands", () => {
    assert.deepEqual(view(EMPTY), { week: null, standing: null, sentence: NOTHING_LOADED });
    assert.deepEqual(view(EMPTY, { leadFirstName: null }), {
      week: null,
      standing: null,
      sentence: "There’s nothing in this course’s facilitator guide yet. An admin loads it, and it will show here.",
    });
    assert.deepEqual(view(loaded(1), { leadFirstName: "  " }), {
      week: null,
      standing,
      sentence: "Week 3’s plan isn’t in the guide yet. An admin loads it.",
    });
  });

  test("failed: the course page alone for somebody the page knows the guide admits, and nothing for anybody else", () => {
    assert.deepEqual(view(FAILED), { week: null, standing, sentence: null });
    assert.deepEqual(view(FAILED, { knownReader: false }), { week: null, standing: null, sentence: null });
    // Whatever the guide held, a reader nobody knows is drawn nothing on a failed read, and never an error.
    for (const weekNumber of [null, 0, 3]) assert.deepEqual(view(FAILED, { knownReader: false, weekNumber }), guide.links.NO_GUIDE_LINKS);
  });

  test("no session ahead: the course page, or the sentence for a course with nothing; never a week's sentence", () => {
    assert.deepEqual(view(loaded(1, 3), { weekNumber: null }), { week: null, standing, sentence: null });
    assert.deepEqual(view(loaded(), { weekNumber: null }), { week: null, standing, sentence: null });
    assert.deepEqual(view(EMPTY, { weekNumber: null }), { week: null, standing: null, sentence: NOTHING_LOADED });
    assert.deepEqual(view(loaded(1, 3), { weekNumber: 0 }), { week: null, standing, sentence: null });
    // No course: nothing to link.
    assert.deepEqual(view(loaded(1, 3), { courseId: "" }), guide.links.NO_GUIDE_LINKS);
  });

  test("the store's answer read three ways: refused is failed, nothing is nothing, the documents alone are something", () => {
    const { guideReadOfIndex } = guide.links;
    assert.deepEqual(guideReadOfIndex(null), FAILED);
    assert.deepEqual(guideReadOfIndex({ weeks: [], documents: [] }), EMPTY);
    assert.deepEqual(guideReadOfIndex({ weeks: [], documents: [{ key: "handbook" }] }), loaded());
    assert.deepEqual(guideReadOfIndex({ weeks: [{ weekNumber: 1 }, { weekNumber: 3 }], documents: [] }), loaded(1, 3));
  });

  test("the sentence for a week that is not loaded is the guide's own page's too, and today's words are gone", () => {
    assert.equal(guide.words.guideWeekEmptyWords(6), "Week 6’s plan isn’t in the guide yet.");
    assert.equal(guide.words.whoLoadsItWords("Maya"), "Maya or an admin loads it.");
    assert.equal(guide.words.whoLoadsItWords(null), "An admin loads it.");
  });

  test("what the programme page hands on: for a reader the guide admitted, or one the page knows it admits; nothing otherwise", () => {
    const { facilitatorGuideProp, weekGuideLink, standingGuideLink } = guide.links;
    assert.deepEqual(facilitatorGuideProp(loaded(1, 3), COURSE.agi, false), { courseId: COURSE.agi, weeks: [1, 3] });
    assert.deepEqual(facilitatorGuideProp(EMPTY, COURSE.agi, false), { courseId: COURSE.agi, weeks: [] });
    assert.deepEqual(facilitatorGuideProp(FAILED, COURSE.agi, true), { courseId: COURSE.agi, weeks: [] });
    assert.equal(facilitatorGuideProp(FAILED, COURSE.agi, false), null);
    assert.equal(facilitatorGuideProp(loaded(1), "", true), null);
    const prop = { courseId: COURSE.agi, weeks: [1, 3] };
    assert.deepEqual(weekGuideLink(prop, 3), week3);
    assert.equal(weekGuideLink(prop, 2), null);
    assert.equal(weekGuideLink(prop, null), null);
    assert.equal(weekGuideLink(null, 3), null);
    assert.deepEqual(standingGuideLink(prop), standing);
  });

  test("the register's week: the session the address names, else the latest started, else the first to come; never one called off", () => {
    const { registerGuideWeek } = guide.registerWeek;
    const session = (weekNumber, dateKey, over = {}) => ({
      weekNumber,
      weekId: `w0${weekNumber}`,
      occurrence: 1,
      sessionKey: `w0${weekNumber}`,
      slotStartKey: dateKey,
      dateKey,
      session: { weekday: 2, startTimeLocal: "18:00", durationMinutes: 120, location: "Hallward B12", meetingUrl: null },
      cancelled: false,
      ...over,
    });
    const term = [session(1, "2026-11-03"), session(2, "2026-11-10"), session(3, "2026-11-17"), session(4, "2026-11-24")];
    assert.equal(registerGuideWeek(term, null, NOW), 2, "before Tuesday's session: last week's");
    assert.equal(registerGuideWeek(term, null, new Date("2026-11-17T18:30:00Z")), 3, "during it: its own");
    assert.equal(registerGuideWeek(term, "w04", NOW), 4, "the address names week 4");
    assert.equal(registerGuideWeek(term, "w09", NOW), 2, "an address naming no session of the group is passed over");
    assert.equal(registerGuideWeek(term, null, new Date("2026-10-30T12:00:00Z")), 1, "before the first: the first");
    assert.equal(registerGuideWeek([session(1, "2026-11-03"), session(2, "2026-11-10", { cancelled: true })], null, NOW), 1);
    assert.equal(registerGuideWeek([session(1, "")], null, NOW), null, "no dated session: no week");
  });
});

// ---------------------------------------------------------------------------
// 2. Home
// ---------------------------------------------------------------------------

describe("2. a facilitator's Home, in every state", () => {
  test("from the first session on: Open Group B under the register's line, and This week's guide links", async () => {
    const home = await homeWithGuide("rahul");
    assert.match(
      home.text,
      /Take the register Opens your group’s register for tonight\. Open Group B This week Week 3 · Who decides what AGI means Facilitator guide for week 3 Facilitator guide 3 exercises to review/,
    );
    assert.match(home.html, new RegExp(`<a href="${escape(GROUP_B)}" class="textLink">Open Group B<svg`));
  });

  test("before the first session: the ticket's Open your group, then This week with the guide, from the day somebody is made a facilitator", async (t) => {
    t.after(() => at(NOW));
    at("2026-10-28T12:00:00Z");
    const home = await homeWithGuide("rahul");
    assert.match(home.text, /Your first session · week 1 Group B, 6pm Hallward B12 · with Sofia Open your group This week Week 1 · Week 1 readings Facilitator guide for week 1 Facilitator guide Who’s coming/);
    // The ticket keeps its own way to the group; no second one is added before the first session.
    assert.doesNotMatch(home.text, /Open Group B/);
    // Neither the review rows nor the email line before the first session.
    assert.doesNotMatch(home.text, /to review|email goes/);
    // Nothing loaded: the sentence stands in for both links.
    reset();
    at("2026-10-28T12:00:00Z");
    assert.match((await homeWithGuide("rahul")).text, new RegExp(`This week Week 1 · Week 1 readings ${escape(NOTHING_LOADED)} Who’s coming`));
  });

  test("after the last session: Open Group B says what it opens, and the guide stays one press away", async (t) => {
    t.after(() => at(NOW));
    at("2026-12-20T12:00:00Z");
    const home = await homeWithGuide("rahul");
    assert.match(home.text, /No more sessions are planned for your group\. Open Group B Facilitator guide$/);
    assert.match(home.html, new RegExp(`<a href="${escape(GROUP_B)}" class="textLink">Open Group B<svg`));
    assert.match(home.html, new RegExp(`<a href="${escape(AGI_GUIDE)}" class="textLink">Facilitator guide<svg`));
    assert.doesNotMatch(home.text, /Open AGI Strategy/);
    // On a failed read too.
    assert.match((await homeWithGuide("rahul", "Rahul", FAILED)).text, /No more sessions are planned for your group\. Open Group B Facilitator guide$/);
  });

  test("a failed read draws the course page's link alone; an answer still on its way draws nothing of the guide", async () => {
    const failed = await homeWithGuide("rahul", "Rahul", FAILED);
    assert.match(failed.text, /This week Week 3 · Who decides what AGI means Facilitator guide 3 exercises to review/);
    assert.doesNotMatch(failed.text, /Facilitator guide for week|isn’t in the guide/);
    const waiting = await homeWithGuide("rahul", "Rahul", null);
    assert.match(waiting.text, /This week Week 3 · Who decides what AGI means 3 exercises to review/);
    assert.doesNotMatch(waiting.text, /Facilitator guide|isn’t in the guide|nothing in this course/);
    // Home keeps its order: the register, Open Group B, then This week.
    assert.match(waiting.text, /Take the register .* Open Group B This week/);
  });
});

// ---------------------------------------------------------------------------
// 3. The group page
// ---------------------------------------------------------------------------

describe("3. the group page", () => {
  for (const [what, broken] of [
    ["the gate's", "courses"],
    ["the store's", "courseFacilitatorGuide"],
  ]) {
    test(`a read of the guide that throws (${what}) never takes the page down: the ticket keeps the course page's link`, async (t) => {
      t.mock.method(console, "error", () => {});
      for (const who of ["rahul", "zach"]) {
        const drawn = await withBrokenCollection(broken, () => groupPage(who));
        assert.equal(drawn.to, null, who);
        const ticket = find(drawn.element, "FacilitatorTicket")[0]?.props;
        assert.ok(ticket, `${who}: no ticket`);
        assert.equal(ticket.guide, null, who);
        assert.deepEqual(ticket.guideContents, { href: AGI_GUIDE, label: "Facilitator guide" }, who);
        assert.equal(ticket.guideSentence, null, who);
        assert.match(drawn.text, /Take the register Facilitator guide/, who);
        // The rest of the page is there.
        assert.match(drawn.text, /Your group/, who);
      }
    });
  }

  test("after the last session: the sentence where the ticket was, and the guide's course page", async (t) => {
    t.after(() => at(NOW));
    at("2026-12-20T12:00:00Z");
    const drawn = await groupPage("rahul");
    assert.equal(find(drawn.element, "FacilitatorTicket").length, 0);
    assert.deepEqual(find(drawn.element, "NoMoreSessionsCard")[0]?.props.guide, {
      week: null,
      standing: { href: AGI_GUIDE, label: "Facilitator guide" },
      sentence: null,
    });
    assert.match(drawn.html, new RegExp(`No more sessions are planned for your group\\.</p><div class="ticketButtons"><a href="${escape(AGI_GUIDE)}" class="ticketGuide"><span>Facilitator guide</span>`));
  });

  test("a group with no dates yet: a small card with the guide alone", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { startDate: "" });
    const drawn = await groupPage("rahul");
    assert.equal(drawn.to, null);
    assert.equal(find(drawn.element, "FacilitatorTicket").length, 0);
    assert.equal(find(drawn.element, "NoMoreSessionsCard").length, 0);
    const card = find(drawn.element, "GuideOnlyCard")[0]?.props.guide;
    assert.deepEqual(card, { week: null, standing: { href: AGI_GUIDE, label: "Facilitator guide" }, sentence: null });
    assert.match(drawn.html, new RegExp(`<section class="card" aria-label="Facilitator guide"><div class="ticketButtons"><a href="${escape(AGI_GUIDE)}"`));
    assert.doesNotMatch(drawn.text, /No more sessions/);
  });
});

// ---------------------------------------------------------------------------
// 4. The register
// ---------------------------------------------------------------------------

describe("4. the register: the guide's own gate, never the register's", () => {
  const registerAt = (who, session) =>
    session === undefined ? registerPage(who) : draw(pages.register, who, { runId: RUN.agi, groupId: B }, { session });

  test("for the group's facilitators and an admin: the register's week, by the one rule, above the table", async () => {
    for (const who of ["rahul", "sofia", "zach"]) {
      // Before Tuesday's session the register is about week 2's, which has nothing in the guide.
      const drawn = await registerAt(who);
      assert.equal(drawn.to, null, who);
      assert.match(drawn.text, new RegExp(`Group B’s register ${escape(WEEK_2_NOT_LOADED)} Facilitator guide \\[AttendanceGrid\\]`), who);
      // The address names week 3's session, which has.
      const three = await registerAt(who, "w03");
      assert.match(three.text, /Group B’s register Facilitator guide for week 3 Facilitator guide \[AttendanceGrid\]/, who);
      assert.match(
        three.html,
        new RegExp(`<div class="registerGuide"><a href="${escape(AGI_GUIDE)}/week-3" class="ticketGuide"><span>Facilitator guide for week 3</span>`),
        who,
      );
    }
  });

  test("somebody given one session and a run's track lead, whom the guide refuses, are drawn no link and no sentence; a member is sent away", async () => {
    giveWeekThreeToLloyd();
    const lloyd = await registerAt("lloyd", "w03");
    assert.equal(lloyd.to, null, "Lloyd takes the session he was given");
    const yusuf = await registerAt("yusuf");
    assert.equal(yusuf.to, null, "the run's track lead takes a register");
    for (const [who, drawn] of [
      ["lloyd", lloyd],
      ["yusuf", yusuf],
    ]) {
      assert.match(drawn.text, /Group B’s register/, who);
      assert.doesNotMatch(drawn.text, /Facilitator guide|isn’t in the guide|nothing in this course/, who);
      assert.doesNotMatch(drawn.html, /facilitator-guide|registerGuide/, who);
    }
    for (const who of ["amara", "chloe"]) {
      const drawn = await registerAt(who);
      assert.equal(drawn.to, `/learn/${RUN.agi}`, who);
    }
  });

  test("a read of the guide that throws draws the course page's link for the group's facilitators, and nothing for anybody else", async (t) => {
    t.mock.method(console, "error", () => {});
    giveWeekThreeToLloyd();
    const rahul = await withBrokenCollection("courseFacilitatorGuide", () => registerAt("rahul"));
    assert.match(rahul.text, /Group B’s register Facilitator guide \[AttendanceGrid\]/);
    for (const [who, session] of [
      ["lloyd", "w03"],
      ["yusuf", undefined],
    ]) {
      const drawn = await withBrokenCollection("courseFacilitatorGuide", () => registerAt(who, session));
      assert.equal(drawn.to, null, who);
      assert.doesNotMatch(drawn.text, /Facilitator guide/, who);
    }
  });

  test("nothing loaded: the sentence alone, for a facilitator", async () => {
    reset();
    assert.match((await registerAt("rahul")).text, new RegExp(`Group B’s register ${escape(NOTHING_LOADED)} \\[AttendanceGrid\\]`));
  });
});

// ---------------------------------------------------------------------------
// 5. My programmes and the programme page's group card
// ---------------------------------------------------------------------------

describe("5. My programmes and the programme page's group card", () => {
  const MEETING = "https://meet.example.com/agi-group-b-secret";
  const rowOf = async (who) => (await me(who)).find((row) => row.runId === RUN.agi) ?? null;

  // The row an appointment writes for each of the run's facilitators, as Rahul's and Sofia's would be.
  beforeEach(() => {
    for (const uid of ["rahul", "sofia"]) {
      world.db.seed(`courseEnrolments/${RUN.agi}__${uid}`, enrolment(uid, null, { role: "facilitator", allocatedEmailAt: null }));
    }
  });

  test("/api/courses/me names a facilitator's groups on their row, in meeting order, by named fields, and never a meeting link", async () => {
    world.db.poke(`courseGroups/${B}`, { session: { ...world.db.read(`courseGroups/${B}`).session, meetingUrl: MEETING } });
    const rahul = await rowOf("rahul");
    assert.deepEqual(rahul.facilitates, [{ groupId: B, name: "Group B", slot: "Tuesdays 6pm", room: "Hallward B12" }]);
    const sofia = await rowOf("sofia");
    // Group B meets on Tuesdays and Group A on Thursdays: meeting order, not name order.
    assert.deepEqual(sofia.facilitates, [
      { groupId: B, name: "Group B", slot: "Tuesdays 6pm", room: "Hallward B12" },
      { groupId: A, name: "Group A", slot: "Thursdays 6pm", room: "Portland A13" },
    ]);
    for (const group of sofia.facilitates) assert.deepEqual(Object.keys(group), ["groupId", "name", "slot", "room"]);
    for (const who of ["rahul", "sofia"]) {
      const whole = JSON.stringify(await me(who));
      assert.doesNotMatch(whole, /meet\.example\.com|meetingUrl|@/, who);
    }
  });

  test("a member's row carries nothing new: the same fields it always had, and no groups", async () => {
    const amara = await rowOf("amara");
    assert.ok(amara, "Amara holds a place on the run");
    assert.equal("facilitates" in amara, false);
    assert.deepEqual(Object.keys(amara).sort(), [
      "academicYear",
      "archived",
      "courseId",
      "courseTitle",
      "currentWeek",
      "finished",
      "groupName",
      "label",
      "membership",
      "pacedByGroup",
      "roles",
      "runId",
      "shownCrest",
      "status",
      "totalWeeks",
    ]);
  });

  test("My programmes: a facilitator's card has three doors, and a member's is the one link it always was", async () => {
    const rahul = renderToStaticMarkup(createElement(RunCard, { entry: await rowOf("rahul") }));
    assert.match(textOf(rahul), /Open the programme Group B Tuesdays 6pm · Hallward B12 → Facilitator guide Only facilitators, the programme’s lead and admins see this\. →$/);
    assert.match(rahul, /^<article/);
    assert.match(rahul, new RegExp(`<a href="/learn/${escape(RUN.agi)}" class="openProgramme">Open the programme</a>`));
    assert.match(rahul, new RegExp(`<a href="${escape(GROUP_B)}" class="door">`));
    assert.match(rahul, new RegExp(`<a href="${escape(AGI_GUIDE)}" class="door">`));
    const amara = renderToStaticMarkup(createElement(RunCard, { entry: await rowOf("amara") }));
    assert.match(amara, new RegExp(`^<a href="/learn/${escape(RUN.agi)}" class="link">`));
    assert.doesNotMatch(amara, /Facilitator guide|Open the programme|facilitator-guide/);
    // An archived run's card stays one link.
    const archived = renderToStaticMarkup(createElement(RunCard, { entry: { ...(await rowOf("rahul")), archived: true } }));
    assert.doesNotMatch(archived, /Open the programme|facilitator-guide/);
  });

  test("the programme page's group card opens the group by name, and links its week's guide only when handed the guide", async () => {
    const overview = await w.call("rahul", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    const group = overview.body.groups.find((each) => each.id === B);
    const draw = (facilitatorGuide) =>
      textOf(
        renderToStaticMarkup(
          createElement(Panel, { runId: RUN.agi, group, publishedWeekNumbers: [1, 2, 3], showCohortLinks: false, facilitatorGuide }),
        ),
      );
    const handed = draw({ courseId: COURSE.agi, weeks: [1, 3] });
    assert.match(handed, /Open Group B → Facilitator guide for week 3 → Email the group → Review exercises → Open week 3 materials →$/);
    assert.doesNotMatch(handed, /Roster and attendance/);
    assert.match(draw({ courseId: COURSE.agi, weeks: [1] }), /Open Group B → Email the group → Review exercises/);
    assert.match(draw(null), /Open Group B → Email the group → Review exercises/);
    assert.doesNotMatch(draw(null), /Facilitator guide/);
  });
});
