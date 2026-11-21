/**
 * A ONE-WEEK VISIT, READ BY EVERY READER IT REACHES: the registers, the
 * rollup and the Attendance tab, the group pages, who is told, the link, the
 * person's own card, who reads the work, and a move for good with a visit
 * ahead. And WITH NO VISIT ANYWHERE NOTHING CHANGES FOR ANYBODY.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock starts on Tue 17 Nov 2026 at noon. Group B meets on Tuesdays at
 * 6pm in Hallward B12 (Rahul and Sofia), tonight for week 3; Group C on
 * Wednesdays at 1pm in Room B8 (Tom), tomorrow for week 3; Group A on
 * Thursdays at 6pm (Sofia); Group D on Mondays at 6pm (Grace). Chloe is in
 * Group B. Staff send her to Group C's session for week 3.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visitReaders");
const { world, call, routes, sessionOf } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const moveRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "move");
const pushRoute = await w.courseRoute("groups", "[groupId]", "attendance", "push");
const onlineRoute = await w.courseRoute("groups", "[groupId]", "joining-online");
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { loadRegisterMembers } = await w.loadTs(join("lib", "courses", "registerAccess.ts"));
const { loadFacilitatorGroup } = await w.loadTs(join("lib", "courses", "facilitatorGroup.ts"));
const { loadGroupPage } = await w.loadTs(join("lib", "courses", "groupPage", "load.ts"));
const { seesSessionLink } = await w.loadTs(join("lib", "courses", "meetingLink", "audience.ts"));
const { hostReadsWeek, hostReadsWeekOf } = await w.loadTs(join("lib", "courses", "visit", "reading.ts"));
const { writtenReviewRole, reviewerFactsOf, ownerFactsOf } = await w.loadTs(join("lib", "courses", "writtenAnswers", "access.ts"));
const { loadGroupPersonWeek } = await w.loadTs(join("lib", "courses", "coursework", "readingLoad.ts"));
const { resolveNoticeAudience } = await w.loadTs(join("lib", "email", "courseFacilitatorEmails.ts"));
const { readVisitFacts, dbReader, weekChoices, sessionChoices, standingVisits } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));
const { LEAD_ONLY_REASON_KINDS } = await w.loadTs(join("lib", "firestore", "courseAudit.ts"));

const read = (path) => world.db.read(path);
const db = () => world.courseDb;
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const runOf = () => normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
const groupOf = (id) => normalizeCourseGroup(id, read(`courseGroups/${id}`));
const liveGroups = () => [A, B, C, D].map(groupOf);
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

const visit = (who, uid, body) => call(who, visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
/** Staff arrange a visit the way the page does: the preview's count and full flag sent back. */
async function arrange(uid, weekNumber, hostGroupId, who = "zach") {
  const shown = await visit(who, uid, { weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit(who, uid, { weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return saved.body;
}
async function callOff(uid, weekNumber) {
  const facts = await readVisitFacts(dbReader(db()), db(), RUN.agi, uid, "ahead", new Date());
  const standing = standingVisits(facts.facts, "zach", new Date()).find((each) => each.weekNumber === weekNumber);
  const answer = await visit("zach", uid, { weekNumber, callOff: true, emailCount: standing.emails });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
}
const mark = (who, groupId, weekNumber, uid, status = "present") =>
  call(who, routes.register.POST, { groupId }, { body: { weekNumber, marks: [{ uid, status }] }, course: true });
const push = async (who, groupId, weekNumber) => {
  const answer = await call(who, pushRoute.POST, { groupId }, { body: { weekNumber }, course: true });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
};
const rowsOf = async (groupId, forWeek = null) =>
  (await loadRegisterMembers(db(), RUN.agi, groupId, { isAdmin: true }, forWeek)).members;

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  for (const [groupId, count] of [
    [A, 4],
    [B, 3],
    [C, 2],
    [D, 2],
  ]) {
    world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  }
});

// ---------------------------------------------------------------------------
// 0. With no visit anywhere, nothing changes for anybody
// ---------------------------------------------------------------------------

/** What every reader here answers, as one string: registers, the facilitator pages and the staff pages, for every group and week. */
async function everyReader() {
  const out = {};
  for (const groupId of [A, B, C, D]) {
    out[`rows ${groupId}`] = await rowsOf(groupId);
    for (const week of [3, 4]) out[`rows ${groupId} w${week}`] = (await rowsOf(groupId, week)).map((row) => row.uid);
    const fac = await loadFacilitatorGroup(db(), runOf(), groupOf(groupId), { isAdmin: true, actor: sessionOf("zach") }, new Date());
    out[`facilitator ${groupId}`] = { people: fac.people, expected: fac.expected, expectedIn: fac.expectedIn, visitors: fac.visitors };
    for (const week of [3, 4]) {
      const page = await loadGroupPage(db(), { run: runOf(), group: groupOf(groupId), viewer: "admin", viewerUid: "zach", now: new Date(), week });
      out[`page ${groupId} w${week}`] = page?.weeks?.map((each) => ({ weekNumber: each.weekNumber, people: each.people, joiningOnline: each.joiningOnline, cantMakeIt: each.cantMakeIt }));
    }
  }
  return JSON.stringify(out);
}

describe("0. with no visit anywhere, nothing changes for anybody", () => {
  test("a place with no field, an empty list, or a list the normaliser cannot read whole: every reader answers the same", async () => {
    const base = await everyReader();
    world.db.poke(seatPath("chloe"), { visits: [] });
    assert.equal(await everyReader(), base);
    world.db.poke(seatPath("chloe"), { visits: [{ weekNumber: 3, groupId: B }] });
    assert.equal(await everyReader(), base, "a visit to their own group reads as none");
    world.db.poke(seatPath("chloe"), { visits: [{ weekNumber: "3", groupId: C }] });
    assert.equal(await everyReader(), base, "a list not read whole reads as none");
  });

  test("a visit arranged and called off leaves every reader as it was", async () => {
    const base = await everyReader();
    await arrange("chloe", 3, C);
    assert.notEqual(await everyReader(), base, "the visit is read while it stands");
    await callOff("chloe", 3);
    assert.equal(await everyReader(), base);
    assert.equal(read(seatPath("chloe")).visits, undefined, "the field itself is gone");
  });

  test("with a visit, nobody else's line, count or row changes", async () => {
    const strip = (json) => JSON.parse(json);
    const base = strip(await everyReader());
    await arrange("chloe", 3, C);
    const after = strip(await everyReader());
    // Group A and Group D never hear of it.
    for (const key of Object.keys(base).filter((each) => each.includes(A) || each.includes(D))) assert.deepEqual(after[key], base[key], key);
    // In Groups B and C every row but Chloe's is as it was.
    const others = (rows) => rows.filter((row) => row.uid !== "chloe");
    for (const groupId of [B, C]) assert.deepEqual(others(after[`rows ${groupId}`]), others(base[`rows ${groupId}`]));
  });
});

// ---------------------------------------------------------------------------
// 1. The registers, the rollup and the Attendance tab
// ---------------------------------------------------------------------------

describe("1. both registers, the rollup through a real push of each, and the tab", () => {
  test("the host's register lists the visitor for that week alone; the home register shows the line and never counts it", async () => {
    await arrange("chloe", 3, C);
    const host = (await rowsOf(C)).find((row) => row.uid === "chloe");
    assert.deepEqual(host.visitingFrom, [{ weekNumber: 3, groupName: "Group B" }]);
    assert.deepEqual(host.inGroupWeeks, [{ fromWeek: 3, untilWeek: 4 }]);
    assert.deepEqual((await rowsOf(C, 3)).map((row) => row.uid).sort(), ["chloe", "hamza", "una"].sort());
    assert.ok(!(await rowsOf(C, 4)).some((row) => row.uid === "chloe"));
    const home = (await rowsOf(B)).find((row) => row.uid === "chloe");
    assert.deepEqual(home.awayAt, [{ weekNumber: 3, groupName: "Group C" }]);
    assert.ok(!(await rowsOf(B, 3)).some((row) => row.uid === "chloe"), "not one of the home session's rows that week");
    assert.ok((await rowsOf(B, 4)).some((row) => row.uid === "chloe"));
  });

  test("a mark on the home line is refused in one sentence; the host marks her like anybody", async () => {
    await arrange("chloe", 3, C);
    at("2026-11-18T15:00:00Z");
    const refused = await mark("rahul", B, 3, "chloe");
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, "Chloe is at Group C this week.");
    assert.equal((await mark("tom", C, 3, "chloe")).status, 200);
    assert.equal(read(registerPath(C, 3)).records.chloe, "present");
  });

  test("the rollup through both pushes, in both orders, agrees with the Attendance tab", async () => {
    const rollupOf = () => {
      const { sessionsHeld, attendedInFull, absent } = read(seatPath("chloe")).attendance;
      return { sessionsHeld, attendedInFull, absent };
    };
    for (const order of [
      [C, B],
      [B, C],
    ]) {
      w.reset();
      mock.timers.setTime(NOW.getTime());
      await arrange("chloe", 3, C);
      at("2026-11-18T15:00:00Z");
      assert.equal((await mark("rahul", B, 3, "farah")).status, 200);
      assert.equal((await mark("tom", C, 3, "chloe")).status, 200);
      for (const groupId of order) await push(groupId === B ? "rahul" : "tom", groupId, 3);
      // Weeks 1 and 2 present on Group B's registers, week 3 present on Group C's: never an absence.
      assert.deepEqual(rollupOf(), { sessionsHeld: 3, attendedInFull: 3, absent: 0 }, `order ${order.join(" then ")}`);
      const tab = w.lib.attendance.buildRunAttendance(await w.lib.attendance.readRunRecords(db(), RUN.agi), { isAdmin: true }, new Date());
      const row = tab.groups.find((group) => group.id === B).people.find((person) => person.uid === "chloe");
      assert.ok(row, "one row, under the group she is in");
      const cells = row.cells.slice(0, 3).map((cell) => (cell.state === "mark" ? cell.mark : cell.state));
      assert.deepEqual(cells, ["present", "present", "present"]);
      assert.ok(!tab.groups.find((group) => group.id === C).people.some((person) => person.uid === "chloe"), "never a row of the host's tab");
    }
  });

  test("her own attendance reads week 3 off the host's register", async () => {
    await arrange("chloe", 3, C);
    at("2026-11-18T15:00:00Z");
    await mark("tom", C, 3, "chloe", "late");
    await push("tom", C, 3);
    const answer = await call("chloe", routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body).slice(0, 300));
    const w3 = answer.body.ownAttendance.sessions.find((session) => session.sessionKey === "w03");
    assert.equal(w3.status, "late");
  });
});

// ---------------------------------------------------------------------------
// 2. The group pages
// ---------------------------------------------------------------------------

describe("2. the host's and the home group's pages", () => {
  test("the host's pages list her with the board's line and chip, and expect her; the home's say where she is and do not", async () => {
    await arrange("chloe", 3, C);
    const host = await loadFacilitatorGroup(db(), runOf(), groupOf(C), { isAdmin: false, actor: sessionOf("tom") }, new Date());
    assert.deepEqual(host.visitors, [
      { uid: "chloe", name: "Chloe Nguyen", weekNumber: 3, line: "Visiting from Group B, week 3 only. You can read Chloe’s week 3; Rahul and Sofia give the feedback." },
    ]);
    const base = await loadFacilitatorGroup(db(), runOf(), groupOf(B), { isAdmin: false, actor: sessionOf("rahul") }, new Date());
    assert.equal(host.expectedIn[3], host.expectedIn[4] + 1, "she is expected at the host's week 3 alone");
    assert.equal(base.expectedIn[3], base.expectedIn[4] - 1, "and not at her own group's week 3");
    assert.equal(base.people.find((person) => person.uid === "chloe").awayAt, "Group C");

    const page = await loadGroupPage(db(), { run: runOf(), group: groupOf(C), viewer: "admin", viewerUid: "zach", now: new Date(), week: 3 });
    const w3 = page.weeks.find((each) => each.weekNumber === 3);
    assert.deepEqual(
      w3.people.find((person) => person.uid === "chloe"),
      { uid: "chloe", name: "Chloe Nguyen", said: "coming", visiting: { line: "Visiting from Group B, week 3 only. You can read Chloe’s week 3; Rahul and Sofia give the feedback." } },
    );
    assert.ok(!page.weeks.find((each) => each.weekNumber === 4).people.some((person) => person.uid === "chloe"));
    const home = await loadGroupPage(db(), { run: runOf(), group: groupOf(B), viewer: "admin", viewerUid: "zach", now: new Date(), week: 3 });
    assert.equal(home.weeks.find((each) => each.weekNumber === 3).people.find((person) => person.uid === "chloe").awayAt, "Group C");
  });

  test("the facilitator's cut of the host's page names nobody, as always", async () => {
    await arrange("chloe", 3, C);
    const page = await loadGroupPage(db(), { run: runOf(), group: groupOf(C), viewer: "facilitator", viewerUid: "tom", now: new Date(), week: 3 });
    assert.deepEqual(page.weeks.find((each) => each.weekNumber === 3).people, []);
  });
});

// ---------------------------------------------------------------------------
// 3. Who is told, and the link
// ---------------------------------------------------------------------------

describe("3. the session's notices, joining online and the link follow the host's session", () => {
  test("a notice about the host's week 3 session reaches her, and her own group's week 3 notice does not", async () => {
    await arrange("chloe", 3, C);
    const uidsOf = async (groupId, weekNumber) =>
      (await resolveNoticeAudience(db(), RUN.agi, "course-notice", { groupId, weekNumber })).members.map((member) => member.uid).sort();
    assert.ok((await uidsOf(C, 3)).includes("chloe"));
    assert.ok(!(await uidsOf(C, 4)).includes("chloe"));
    assert.ok(!(await uidsOf(B, 3)).includes("chloe"));
    assert.ok((await uidsOf(B, 4)).includes("chloe"));
  });

  test("I'm joining online goes on the host's register and tells the host's facilitator once; never on her own group's that week", async () => {
    await arrange("chloe", 3, C);
    world.mail.length = 0;
    const said = await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: true }, course: true });
    assert.equal(said.status, 200, JSON.stringify(said.body));
    assert.ok(read(registerPath(C, 3)).onlineSaid.chloe);
    assert.deepEqual(world.mail.map((message) => message.to), ["tom@example.com"]);
    const again = await call("chloe", onlineRoute.POST, { groupId: C }, { body: { sessionKey: "w03", online: true }, course: true });
    assert.equal(again.status, 200);
    assert.equal(world.mail.length, 1, "once");
    const home = await call("chloe", onlineRoute.POST, { groupId: B }, { body: { sessionKey: "w03", online: true }, course: true });
    assert.notEqual(home.status, 200);
  });

  test("the link: the host's for that week's session alone", () => {
    const place = { status: "active", groupId: B, visits: [{ weekNumber: 3, groupId: C, arrangedByUid: null, arrangedAt: null }] };
    const viewer = sessionOf("chloe");
    assert.equal(seesSessionLink({ viewer, isAdmin: false, seat: place, group: groupOf(C), sessionKey: "w03" }), true);
    assert.equal(seesSessionLink({ viewer, isAdmin: false, seat: place, group: groupOf(C), sessionKey: "w04" }), false);
    assert.equal(seesSessionLink({ viewer, isAdmin: false, seat: place, group: groupOf(C), sessionKey: null }), false, "never the standing link");
    assert.equal(seesSessionLink({ viewer, isAdmin: false, seat: { status: "active", groupId: B }, group: groupOf(C), sessionKey: "w03" }), false);
  });
});

// ---------------------------------------------------------------------------
// 4. The person's own card
// ---------------------------------------------------------------------------

describe("4. her own programme page's card", () => {
  test("the approved words, until the session she goes to ends; the cancel line until the earlier session starts", async () => {
    await arrange("chloe", 4, A, "claudia");
    const overview = async () => (await call("chloe", routes.overview.GET, { runId: RUN.agi }, { course: true })).body;
    const card = (await overview()).visits[0];
    assert.equal(card.chip, "Visiting Group A");
    assert.equal(card.when, "Thu 19 Nov, 6pm to 8pm");
    assert.equal(card.place, "Portland A13");
    assert.equal(card.withLine, "Group A with Sofia, this week only");
    assert.equal(card.stillIn, "You’re still in Group B: back on Tue 1 Dec.");
    assert.equal(card.arrangedBy, "Arranged by Claudia, Tue 17 Nov, 12pm.");
    assert.deepEqual(card.cancel, {
      // Her own group's facilitators, then the host's, once each: Sofia facilitates both.
      until: "You can cancel until Thu 19 Nov, 6pm. Rahul and Sofia are told.",
      question: "Cancel your visit to Group A on Thu 19 Nov? You’ll be with Group B as usual: Tue 24 Nov, 6pm. Rahul and Sofia are told.",
      done: "You cancelled your visit to Group A. You’re with Group B as usual on Tue 24 Nov, 6pm.",
    });
    at("2026-11-19T18:30:00Z");
    assert.equal((await overview()).visits[0].cancel, null, "the button and its line go once the session starts");
    at("2026-11-19T21:00:00Z");
    assert.equal((await overview()).visits, undefined, "and the card once it has ended");
  });

  test("nobody with no visit is sent the field", async () => {
    const answer = await call("farah", routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal("visits" in answer.body, false);
  });
});

// ---------------------------------------------------------------------------
// 5. Who reads the work
// ---------------------------------------------------------------------------

describe("5. the host's facilitators read that week alone, and nothing else", () => {
  test("the second answer: the host's facilitator, that week alone, while the visit stands", async () => {
    await arrange("chloe", 3, C);
    const groups = liveGroups();
    const place = seat("chloe");
    assert.equal(hostReadsWeek(sessionOf("tom"), place, groups, 3), true);
    assert.equal(hostReadsWeek(sessionOf("tom"), place, groups, 2), false, "never another week");
    assert.equal(hostReadsWeek(sessionOf("rahul"), place, groups, 3), false, "her own group's read through the full gate, not this");
    assert.equal(hostReadsWeek(sessionOf("grace"), place, groups, 3), false);
    // A co-facilitator of the host whose account no longer stands behind the role (refused).
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "ghost"] });
    assert.equal(hostReadsWeek({ uid: "ghost", role: "member", email: "", displayName: "" }, seat("chloe"), liveGroups(), 3), true, "one who stands reads");
    assert.equal(hostReadsWeek({ uid: "ghost", role: "rejected", email: "", displayName: "" }, seat("chloe"), liveGroups(), 3), false);
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom"] });
    assert.equal(await hostReadsWeekOf(db(), sessionOf("tom"), RUN.agi, "chloe", 3), true);
    await callOff("chloe", 3);
    assert.equal(await hostReadsWeekOf(db(), sessionOf("tom"), RUN.agi, "chloe", 3), false, "reading stops when the visit is called off");
  });

  test("the gate itself is unchanged: the host's facilitator may not give feedback, rate or reopen; her own group's facilitators, the lead and an admin may", async () => {
    await arrange("chloe", 3, C);
    const groups = liveGroups();
    const owner = await ownerFactsOf(db(), RUN.agi, "chloe", groups, { isAdmin: false });
    for (const [who, may] of [
      ["tom", false],
      ["rahul", true],
      ["sofia", true],
      ["claudia", true],
      ["zach", true],
    ]) {
      const actor = sessionOf(who);
      const facts = await reviewerFactsOf(db(), actor, RUN.agi);
      assert.equal(writtenReviewRole(actor, facts, owner, groups).mayReview, may, who);
    }
  });

  test("the host group's reading door admits its facilitator to the visitor alone, and refuses once it is called off", async () => {
    await arrange("chloe", 3, C);
    const input = (uid, askedWeek = "3") => ({
      run: runOf(),
      group: groupOf(C),
      liveGroups: liveGroups(),
      facts: { isAdmin: false, isLead: false },
      facilitatesThisGroup: true,
      uid,
      askedWeek,
      programmeName: "AGI Strategy",
      groupPath: `/learn/${RUN.agi}/group/${C}`,
      runHome: `/learn/${RUN.agi}`,
    });
    // This world's weeks are not written as blocks, so an admitted reader is drawn the blank state.
    assert.equal((await loadGroupPersonWeek(db(), sessionOf("tom"), input("chloe"))).status, "blank");
    assert.equal((await loadGroupPersonWeek(db(), sessionOf("tom"), input("farah"))).status, "refused");
    assert.equal((await loadGroupPersonWeek(db(), sessionOf("tom"), { ...input("chloe"), facilitatesThisGroup: false })).status, "refused");
    await callOff("chloe", 3);
    assert.equal((await loadGroupPersonWeek(db(), sessionOf("tom"), input("chloe"))).status, "refused");
  });
});

// ---------------------------------------------------------------------------
// 6. The staff page's choices, History, and a move for good with a visit ahead
// ---------------------------------------------------------------------------

describe("6. what the staff page offers, History, and a move with a visit ahead", () => {
  test("the weeks of her own group still to come, and the other groups' sessions that week with their places left", async () => {
    const { facts } = await readVisitFacts(dbReader(db()), db(), RUN.agi, "chloe", "ahead", new Date());
    const weeks = weekChoices(facts, new Date());
    assert.deepEqual(weeks.slice(0, 2), [
      { weekNumber: 3, words: "Week 3 · Group B meets Tue 17 Nov, 6pm", visiting: false },
      { weekNumber: 4, words: "Week 4 · Group B meets Tue 24 Nov, 6pm", visiting: false },
    ]);
    // Week 3: Group A and Group D have met; Group C meets tomorrow, with 2 of its 8 places taken.
    assert.deepEqual(sessionChoices(facts, 3, new Date()), [
      { groupId: C, words: "Group C · Wed 18 Nov, 1pm to 3pm", detail: "Room B8 · Tom · 6 places left", full: false },
    ]);
    world.db.poke(`courseGroups/${C}`, { capacity: 2 });
    const full = await readVisitFacts(dbReader(db()), db(), RUN.agi, "chloe", "ahead", new Date());
    assert.deepEqual(sessionChoices(full.facts, 3, new Date())[0].detail, "Room B8 · Tom · Full this week");
  });

  test("History: one row on each group, a reason only the programme's lead and admins read", async () => {
    assert.ok(LEAD_ONLY_REASON_KINDS.includes("member-visits"));
    assert.ok(!LEAD_ONLY_REASON_KINDS.includes("member-visit-off"));
  });

  test("a move for good: the week rule goes by the groups she belongs to; a visit to the group she moves into goes, any other stays", async () => {
    await arrange("chloe", 4, D);
    await arrange("chloe", 5, C);
    const shown = await call("zach", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { toGroupId: C, preview: true }, course: true });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    // Group B's week 3 is still to come tonight: the move is from week 3, as with no visit.
    assert.equal(shown.body.preview.weekNumber, 3);
    const visits = shown.body.preview.lines.find((line) => line.label === "Visits");
    assert.equal(visits.text, "Chloe’s week 4 visit to Group D stays. Chloe’s week 5 visit to Group C goes: from week 3 Chloe is in Group C.");
    const saved = await call("zach", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { toGroupId: C, weekNumber: 3, emailCount: shown.body.preview.emails }, course: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(read(seatPath("chloe")).visits.map((each) => [each.weekNumber, each.groupId]), [[4, D]]);
    assert.equal(enrolments.groupForWeek(seat("chloe"), 4), D);
    assert.equal(enrolments.ownGroupForWeek(seat("chloe"), 4), C);
  });
});
