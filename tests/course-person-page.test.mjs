/**
 * A PERSON'S PAGE (Wed 18 Nov 2026): one person on a programme, for the team
 * (`.../programmes/[programmeId]/people/[uid]`), and a facilitator's cut of
 * it behind their group's door (`/learn/[runId]/group/[groupId]/people/[uid]`).
 *
 * The page is a server page: what leaves the server is the view it hands its
 * component. So every persona is asked on the PAYLOAD, the `view` prop read
 * off the element, as well as on the words drawn: a section a reader may not
 * see is absent from the view, its key and all, and nothing written by
 * anybody (a reflection, an answer, a piece of feedback, a rating's comment)
 * is ever in it.
 *
 * Built on `tests/lib/peopleWorld.mjs` (AGI Strategy after decision day:
 * Claudia leads it, Lloyd reviews it, Tess leads Technical AI Safety, Yusuf
 * is the run's track lead, Rahul and Sofia facilitate Group B, Tom Group C;
 * Amara holds a place in Group B and was told, Kofi is in Group B and not
 * told, Zach the admin holds a place in Group A, Wen holds a place on
 * Technical AI Safety). On top of it: three weeks written as blocks, Amara's
 * week 1 reflection and week 3 written answer, two pieces of feedback on
 * them, a rating for the team, and Group B's registers for weeks 1 and 2.
 * The clock is Tue 17 Nov 2026 at noon in London.
 */
import { describe, mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { A, AGI, B, C, ROUND, RUN, TAIS, makePeopleWorld, peopleSeed } from "./lib/peopleWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const codeOf = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

const NOW = new Date("2026-11-17T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makePeopleWorld("__personPageSuite");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const pages = {
  team: (await w.loadTs(join(PROGRAMME, "people", "[uid]", "page.tsx"))).default,
  cut: (await w.loadTs(join("app", "(app)", "learn", "[runId]", "group", "[groupId]", "people", "[uid]", "page.tsx"))).default,
};
const model = await w.loadTs(join("lib", "courses", "personPage", "model.ts"));
const { GroupPeopleCard } = await w.loadTs(join("features", "courses", "facilitator", "GroupCards.tsx"));

/** Every word anybody wrote in the world: none may ever be in a view or on a page. */
const WRITTEN = {
  reflection: "The keepers on the north coast trimmed their own wicks.",
  answer: "A harbour trust should keep the lamps lit for every ship.",
  rahulFeedback: "A strong argument about the harbour trust.",
  claudiaFeedback: "Good week, keep reading the second source.",
  ratingComment: "Ready to facilitate next term, in my view.",
  olderFeedback: "Older feedback about the harbour trust, given before pieces.",
};
const SENT = new Date("2026-11-16T09:00:00Z");

const run = (text) => ({ text });
const p = (...runs) => ({ type: "p", runs });

/** A week written as blocks, in week 1's shape, with a written answer in week 3. */
function blockWeek(n) {
  const blocks = weekOneBlocks(`k${n}`);
  if (n === 3) {
    blocks.push({
      id: "k3-p4",
      type: "part",
      title: "Your keeper's plan",
      time: "About 30 minutes",
      framing: [],
      blocks: [{ id: "k3-wa", type: "writtenAnswer", prompt: [p(run("Who should keep the lamps lit?"))], boxes: [], guidance: [], words: { min: 1, max: 200 }, due: "dayBefore" }],
    });
  }
  return { weekNumber: n, title: `Week ${n} lamps`, summary: "", guideBlocks: [], materials: [], exercises: [], checklist: [], questions: [], estimatedMinutes: null, published: true, blocks };
}

function piece(id, by, role, on, at, text, emailedAt = null) {
  return {
    runId: RUN.agi,
    uid: "amara",
    weekId: "w03",
    weekNumber: 3,
    on,
    text,
    aboutSavedAt: on.kind === "writtenAnswer" ? SENT : null,
    byUid: by,
    byRole: role,
    createdAt: at,
    editedAt: null,
    emailedAt,
    emailedByUid: emailedAt ? "zach" : "",
    emailDelivery: null,
    emailClaimedAt: null,
    sendId: "",
  };
}

function registerDoc(groupId, week, records, online = {}) {
  return {
    runId: RUN.agi,
    groupId,
    weekNumber: week,
    occurrence: 1,
    records,
    online,
    held: true,
    pushedAt: new Date("2026-11-11T09:00:00Z"),
    pushedByUid: "rahul",
    participantNotes: {},
    notes: "",
    markedByUid: "rahul",
    updatedAt: new Date("2026-11-11T09:00:00Z"),
  };
}

function seed(over = {}) {
  const s = peopleSeed();
  for (const n of [1, 2, 3]) s[`courseRuns/${RUN.agi}/weeks/w0${n}`] = blockWeek(n);
  s[`courseExerciseResponses/${RUN.agi}__amara__w01__k1-rp1`] = {
    runId: RUN.agi,
    uid: "amara",
    weekId: "w01",
    weekNumber: 1,
    exerciseId: "k1-rp1",
    kind: "reflection",
    responseType: "text",
    text: WRITTEN.reflection,
    submittedAt: null,
    reviewStatus: "unreviewed",
    updatedAt: new Date("2026-11-04T21:02:00Z"),
  };
  s[`courseExerciseResponses/${RUN.agi}__amara__w03__k3-wa`] = {
    runId: RUN.agi,
    uid: "amara",
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "k3-wa",
    responseType: "text",
    text: WRITTEN.answer,
    words: WRITTEN.answer.split(/\s+/).length,
    submittedAt: SENT,
    firstSentAt: SENT,
    updatedAt: SENT,
    reviewStatus: "unreviewed",
  };
  s["courseFeedback/piece-rahul"] = piece("piece-rahul", "rahul", "facilitator", { kind: "writtenAnswer", itemId: "k3-wa" }, new Date("2026-11-16T18:00:00Z"), WRITTEN.rahulFeedback, new Date("2026-11-16T20:00:00Z"));
  s["courseFeedback/piece-claudia"] = piece("piece-claudia", "claudia", "lead", { kind: "week" }, new Date("2026-11-16T19:00:00Z"), WRITTEN.claudiaFeedback);
  s[`courseWorkRatings/${RUN.agi}__amara__w03__claudia`] = {
    runId: RUN.agi,
    uid: "amara",
    weekId: "w03",
    weekNumber: 3,
    itemId: "k3-wa",
    rating: 7,
    comment: WRITTEN.ratingComment,
    aboutSavedAt: SENT,
    raterUid: "claudia",
    raterRole: "lead",
    programmeLabel: "AGI Strategy",
    createdAt: new Date("2026-11-16T19:10:00Z"),
    updatedAt: new Date("2026-11-16T19:10:00Z"),
  };
  s[`courseAttendance/${RUN.agi}__${B}__w01`] = registerDoc(B, 1, { amara: "present", kofi: "present" });
  s[`courseAttendance/${RUN.agi}__${B}__w02`] = registerDoc(B, 2, { amara: "late", kofi: "absent" }, { amara: true });
  return { ...s, ...over };
}

/** The `view` a page hands its component, read off the element: the payload. */
function viewOf(drawn) {
  const visit = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    }
    if (node.props?.view && typeof node.props.view === "object" && "attendance" in node.props.view) return node.props.view;
    if (typeof node.type === "function" && !node.props?.children) return null;
    return visit(node.props?.children);
  };
  return drawn.element ? visit(drawn.element) : null;
}

const team = (who, uid = "amara") => w.draw(pages.team, who, { roundId: ROUND, programmeId: AGI, uid });
const cut = (who, uid = "amara", groupId = B) => w.draw(pages.cut, who, { runId: RUN.agi, groupId, uid });

/**
 * Nothing anybody wrote, and nothing about conduct, in the payload or on the
 * page; and no address anywhere in it but the person's own, under `email`,
 * for an admin alone.
 */
function assertNothingWritten(drawn, label) {
  const view = viewOf(drawn) ?? {};
  if (view.reader !== "admin") assert.ok(!("email" in view), `${label}: the payload carries the person's address`);
  const { email: _address, ...rest } = view;
  const payload = JSON.stringify(rest);
  for (const [what, words] of Object.entries(WRITTEN)) {
    assert.ok(!payload.includes(words), `${label}: the payload carries the ${what}`);
    assert.ok(!drawn.html.includes(words), `${label}: the page shows the ${what}`);
  }
  assert.doesNotMatch(payload, /conduct/i, `${label}: the payload names conduct`);
  assert.doesNotMatch(drawn.text, /conduct/i, `${label}: the page names conduct`);
  assert.doesNotMatch(payload, /@/, `${label}: the payload carries an address`);
}

describe("the team's page, persona by persona, on the payload", () => {
  test("an admin: every section, ratings, notes, application, Move, events and activity", async () => {
    w.reset(seed());
    const drawn = await team("zach");
    const view = viewOf(drawn);
    assert.ok(view, "an admin is handed the page");
    assert.equal(view.reader, "admin");
    assert.equal(view.header.name.includes("Amara"), true);
    assert.match(view.header.group, /^Group/);
    assert.deepEqual(view.weeks.map((week) => week.weekNumber), [1, 2, 3]);
    assert.deepEqual(view.ratings.find((each) => each.weekNumber === 3).lines, ["7 of 10 · Claudia"]);
    assert.ok(view.notes && view.notes.lead === null, "an admin's notes go through the admins' route");
    assert.ok(view.application, "an admin may open the application");
    assert.ok(view.move, "Move, as the People tab offers it");
    assert.ok("events" in view, "an admin is handed the events");
    assert.ok(Array.isArray(view.activity), "an admin is handed the activity");
    assert.ok(view.activity.some((line) => /Sent week 3’s written answer/.test(line.said)));
    assert.equal(view.feedback.length, 2);
    assertNothingWritten(drawn, "admin");
  });

  test("the programme's lead: ratings and notes for leads, and no events, no activity, nothing hinting at them", async () => {
    w.reset(seed());
    const drawn = await team("claudia");
    const view = viewOf(drawn);
    assert.equal(view.reader, "lead");
    assert.ok(view.ratings, "the lead reads ratings for the team while they stand");
    assert.deepEqual(view.notes.lead, { roundId: ROUND, programmeId: AGI });
    assert.ok(!("events" in view), "events are absent for the lead");
    assert.ok(!("activity" in view), "activity is absent for the lead");
    assert.doesNotMatch(drawn.text, /Events|Activity|Admins only/);
    assertNothingWritten(drawn, "lead");
  });

  test("an admin on their own page: no ratings and no notes about themselves", async () => {
    w.reset(seed());
    const view = viewOf(await team("zach", "zach"));
    assert.ok(view);
    assert.ok(!("ratings" in view), "nobody reads the ratings about themselves");
    assert.ok(!("notes" in view), "nobody reads the notes about themselves");
    assert.ok(!("application" in view), "the People tab offers nobody their own application");
  });

  test("refused: a lead of another programme, a reviewer, the track lead, a facilitator, a member, signed out", async () => {
    w.reset(seed());
    const tess = await team("tess");
    assert.equal(viewOf(tess), null);
    assert.match(tess.text, /There is no programme here/);
    assert.doesNotMatch(tess.text, /Amara/);
    const lloyd = await team("lloyd");
    assert.equal(viewOf(lloyd), null);
    assert.doesNotMatch(lloyd.text, /Amara/);
    for (const who of ["yusuf", "rahul", "amara", "nobody", null]) {
      const drawn = await team(who);
      assert.equal(viewOf(drawn), null, `${who} is handed nothing`);
      assert.doesNotMatch(drawn.text, /Amara/, `${who} reads nothing about Amara`);
    }
  });

  test("one answer for somebody who is not here, whether or not the account exists", async () => {
    w.reset(seed());
    const elsewhere = await team("claudia", "wen");
    const nobody = await team("claudia", "no-such-person");
    assert.equal(viewOf(elsewhere), null);
    assert.equal(elsewhere.text, nobody.text, "the same words, so the page says nothing about who exists");
    assert.match(nobody.text, /Nobody to show here/);
    for (const drawn of [elsewhere, nobody]) assert.equal(drawn.wrote, false);
  });

  test("nothing is written by any reader", async () => {
    w.reset(seed());
    for (const who of ["zach", "claudia", "tess", "lloyd", "rahul", "amara", null]) assert.equal((await team(who)).wrote, false, `${who} wrote`);
  });
});

describe("the facilitator's cut, on the payload", () => {
  test("Group B's facilitator: their group's weeks, attendance and their own feedback, and nothing else", async () => {
    w.reset(seed());
    const drawn = await cut("rahul");
    const view = viewOf(drawn);
    assert.ok(view, "Rahul facilitates Group B, where Amara is");
    assert.deepEqual(Object.keys(view).sort(), ["attendance", "back", "elsewhere", "feedback", "header", "uid", "weeks"]);
    assert.equal(view.feedback.length, 1, "only the feedback Rahul wrote");
    assert.match(view.feedback[0].line, /^Rahul/);
    assert.equal(view.elsewhere, null);
    assert.deepEqual(view.attendance.counts, [
      { key: "room", label: "In the room", value: 1 },
      { key: "online", label: "Online", value: 1 },
      { key: "visits", label: "Visits to another group", value: 0 },
    ]);
    assert.match(drawn.text, /Applications, notes and contact details are for the programme team/);
    assertNothingWritten(drawn, "facilitator");
  });

  test("refused, to the run's home: another group's facilitator, the lead, an admin, somebody not told, themselves", async () => {
    w.reset(seed());
    const home = `/learn/${RUN.agi}`;
    assert.equal((await cut("rahul", "amara", C)).to, home, "not Rahul's group");
    for (const who of ["claudia", "zach", "yusuf", "lloyd"]) assert.equal((await cut(who)).to, home, `${who} is not Group B's facilitator`);
    assert.equal((await cut("rahul", "kofi")).to, home, "Kofi has not been told the group");
    assert.equal((await cut("rahul", "rahul")).to, home, "never their own page");
    assert.equal((await cut("rahul", "no-such-person")).to, home, "nobody by that id: the same answer");
  });

  test("somebody moved in from another group: this group's weeks only, and the other group never named", async () => {
    w.reset(
      seed({
        [`courseEnrolments/${RUN.agi}__amara`]: {
          ...peopleSeed()[`courseEnrolments/${RUN.agi}__amara`],
          groupsByWeek: [
            { groupId: C, fromWeek: 1 },
            { groupId: B, fromWeek: 3 },
          ],
        },
      }),
    );
    const view = viewOf(await cut("rahul"));
    assert.deepEqual(view.weeks.map((week) => week.weekNumber), [3]);
    assert.equal(view.elsewhere, "Weeks 1 and 2 were with another group.");
    assert.doesNotMatch(JSON.stringify(view), new RegExp(C));
    assert.doesNotMatch(JSON.stringify(view), /Group C/);
    assert.deepEqual(view.attendance.lines.map((line) => line.weekNumber), [3]);
  });
});

const AMARA_SEAT = `courseEnrolments/${RUN.agi}__amara`;
const ANSWER_ROW = `courseExerciseResponses/${RUN.agi}__amara__w03__k3-wa`;

describe("what the page says is true of the live records", () => {
  test("feedback stopped by the do-not-email list, or held, is never called emailed, and adds nothing to Activity", async () => {
    const s = seed();
    s["courseFeedback/piece-rahul"] = { ...s["courseFeedback/piece-rahul"], emailDelivery: "suppressed" };
    s["courseFeedback/piece-held"] = { ...s["courseFeedback/piece-rahul"], weekId: "w03", on: { kind: "week" }, emailDelivery: "held", text: "Held for the week." };
    w.reset(s);
    for (const who of ["zach", "rahul"]) {
      const view = viewOf(await (who === "zach" ? team(who) : cut(who)));
      const lines = view.feedback.map((each) => each.line).join(" | ");
      assert.match(lines, /Not emailed: Amara’s address is on the do-not-email list\./, who);
      assert.match(lines, /Not emailed: this copy of the site doesn’t email Amara’s address\./, who);
      assert.doesNotMatch(lines, /Emailed to Amara/, `${who}: a stopped email is called emailed`);
      assert.match(view.weeks.find((week) => week.weekNumber === 3).feedback.join(" | "), /do-not-email list/, `${who}: the week's cell agrees`);
    }
    const admin = viewOf(await team("zach"));
    assert.ok(!admin.activity.some((line) => /Emailed feedback/.test(line.said)), "Activity counts a stopped email");
  });

  test("feedback given before pieces existed shows on both pages as the reading view counts it, never its words", async () => {
    const s = seed();
    delete s["courseFeedback/piece-rahul"];
    delete s["courseFeedback/piece-claudia"];
    s[ANSWER_ROW] = {
      ...s[ANSWER_ROW],
      feedback: { levels: [{ row: "Argument", level: "Strong", descriptor: "Names a keeper." }], comment: WRITTEN.olderFeedback, byUid: "rahul", sentAt: new Date("2026-11-08T10:00:00Z") },
    };
    w.reset(s);
    const admin = await team("zach");
    const view = viewOf(admin);
    assert.deepEqual(view.feedback.map((each) => [each.on, each.line]), [["Week 3 written answer", "Rahul, Sun 8 Nov · Emailed to Amara on Sun 8 Nov"]]);
    assert.deepEqual(view.weeks.find((week) => week.weekNumber === 3).feedback, ["Rahul, Sun 8 Nov · Emailed to Amara on Sun 8 Nov"]);
    assert.doesNotMatch(admin.text, /Nobody has given them feedback yet/);
    assert.ok(view.activity.some((line) => line.said === "Emailed feedback on week 3"), "it was emailed when it was given");
    assertNothingWritten(admin, "admin, older feedback");
    // On the cut, only where that facilitator wrote it: Rahul did, Sofia (who facilitates Group B with Rahul) did not.
    assert.equal(viewOf(await cut("rahul")).feedback.length, 1);
    const sofia = viewOf(await cut("sofia"));
    assert.ok(sofia, "Sofia facilitates Group B");
    assert.deepEqual(sofia.feedback, [], "Sofia is shown feedback Rahul gave");
    assert.deepEqual(sofia.weeks.find((week) => week.weekNumber === 3).feedback, []);
  });

  test("Publish's line never names a group, and says nothing when its email was stopped", async () => {
    const moved = { ...peopleSeed()[AMARA_SEAT], groupsByWeek: [{ groupId: C, fromWeek: 1 }, { groupId: B, fromWeek: 3 }], toldGroupId: B };
    w.reset(seed({ [AMARA_SEAT]: moved }));
    const lines = viewOf(await team("zach")).activity.map((line) => line.said);
    assert.ok(lines.includes("Publish told them their group"));
    assert.ok(!lines.some((line) => /Publish told them about/.test(line)), "a group is paired with the day Publish first told them");
    w.reset(seed({ [AMARA_SEAT]: { ...peopleSeed()[AMARA_SEAT], allocatedEmailDelivery: "suppressed" } }));
    assert.ok(!viewOf(await team("zach")).activity.some((line) => /Publish/.test(line.said)), "a stopped email is said to have told them");
  });

  test("somebody who left: the head and their attendance only, as the tabs show a leaver; the cut refuses them", async () => {
    w.reset(seed({ [`courseAttendance/${RUN.agi}__${B}__w01`]: registerDoc(B, 1, { amara: "present", kofi: "present", sam: "present" }) }));
    for (const who of ["zach", "claudia"]) {
      const drawn = await team(who, "sam");
      const view = viewOf(drawn);
      assert.ok(view, `${who} is handed Sam's page`);
      // The head (with, for an admin alone, their address) and the attendance.
      const head = who === "zach" ? ["about", "attendance", "back", "email", "header", "reader", "uid"] : ["about", "attendance", "back", "header", "reader", "uid"];
      assert.deepEqual(Object.keys(view).sort(), head, `${who}: a section the tabs do not show for a leaver`);
      assert.equal(view.header.group, null);
      assert.match(view.header.status, /Left the programme/);
      assert.equal(view.attendance.counts.find((count) => count.key === "room").value, 1, "the mark the register kept");
      assert.doesNotMatch(drawn.text, /Read week/);
    }
    assert.equal((await cut("rahul", "sam")).to, `/learn/${RUN.agi}`);
  });

  test("the cut refuses: somebody moved out of the group, an archived group, and another run's id", async () => {
    const home = `/learn/${RUN.agi}`;
    w.reset(seed({ [AMARA_SEAT]: { ...peopleSeed()[AMARA_SEAT], groupId: C, groupsByWeek: [{ groupId: B, fromWeek: 1 }, { groupId: C, fromWeek: 3 }] } }));
    assert.equal((await cut("rahul")).to, home, "Amara moved out of Group B: Group B's facilitators read nothing more");
    const s = seed();
    s[`courseGroups/${B}`] = { ...s[`courseGroups/${B}`], archived: true };
    w.reset(s);
    assert.equal((await cut("rahul")).to, home, "an archived group's door is closed");
    w.reset(seed());
    const other = await w.draw(pages.cut, "rahul", { runId: RUN.tais, groupId: B, uid: "amara" });
    assert.equal(viewOf(other), null);
    assert.ok(other.to, "another run's id in the address is refused");
  });

  test("weeks spent in a group archived since: the team's page shows their marks once, dated; the cut shows only its own group's weeks", async () => {
    // Amara was in Group A for weeks 1 and 2 and is in Group B from week 3; Group A has since been archived. Its
    // finished registers of sessions held still count for her (the record's rule); Group B's carry no line of hers then.
    const s = seed({ [AMARA_SEAT]: { ...peopleSeed()[AMARA_SEAT], groupsByWeek: [{ groupId: A, fromWeek: 1 }, { groupId: B, fromWeek: 3 }] } });
    s[`courseGroups/${A}`] = { ...s[`courseGroups/${A}`], archived: true };
    s[`courseAttendance/${RUN.agi}__${B}__w01`] = registerDoc(B, 1, { kofi: "present" });
    s[`courseAttendance/${RUN.agi}__${B}__w02`] = registerDoc(B, 2, { kofi: "absent" });
    s[`courseAttendance/${RUN.agi}__${A}__w01`] = registerDoc(A, 1, { amara: "present" });
    s[`courseAttendance/${RUN.agi}__${A}__w02`] = registerDoc(A, 2, { amara: "late" }, { amara: true });
    w.reset(s);
    const view = viewOf(await team("zach"));
    const lines = view.attendance.lines.filter((line) => line.weekNumber <= 2);
    assert.deepEqual(lines.map((line) => line.weekNumber), [1, 2], "each week once");
    assert.equal(lines[0].said, "In the room");
    assert.equal(lines[1].said, "Late, online");
    for (const line of lines) assert.match(line.when, /^Week \d · \w{3} \d{1,2} \w{3}$/, "dated as the archived group's session was held");
    assert.deepEqual(view.attendance.counts.map((count) => [count.key, count.value]), [["room", 1], ["online", 1], ["visits", 0]]);
    const facilitator = viewOf(await cut("rahul"));
    assert.ok(facilitator.attendance.lines.every((line) => line.weekNumber >= 3), "the cut shows another group's weeks");
    assert.deepEqual(facilitator.weeks.map((week) => week.weekNumber), [3]);
    assert.equal(facilitator.elsewhere, "Weeks 1 and 2 were with another group.");
    assert.doesNotMatch(JSON.stringify(facilitator), new RegExp(A));
  });

  test("Your group links a name to its page, never the reader's own or a facilitator's of the group", () => {
    const person = (uid, name) => ({ uid, name, firstName: name, left: null, marks: [] });
    const html = renderToStaticMarkup(
      createElement(GroupPeopleCard, {
        people: [person("amara", "Amara Okafor"), person("rahul", "Rahul Mehta"), person("sofia", "Sofia Rossi")],
        leavers: [],
        finishedWeeks: [],
        notYetTold: false,
        personBase: "/learn/run/group/b/people",
        unlinked: ["rahul", "sofia"],
      }),
    );
    assert.match(html, /href="\/learn\/run\/group\/b\/people\/amara"/);
    assert.doesNotMatch(html, /people\/rahul|people\/sofia/);
    assert.doesNotMatch(renderToStaticMarkup(createElement(GroupPeopleCard, { people: [person("amara", "Amara")], leavers: [], finishedWeeks: [], notYetTold: false })), /href=/);
  });
});

// ---------------------------------------------------------------------------
// Visits, the head's details, the application's line, the batch's sender and
// the events line: each as every kind of reader, on the payload.
// ---------------------------------------------------------------------------

const ARRANGED = new Date("2026-11-04T10:40:00Z");
/** Amara's place with one-week visits to Group C's session (Wednesdays at 1pm). */
const visiting = (...weeks) => ({ ...peopleSeed()[AMARA_SEAT], visits: weeks.map((weekNumber) => ({ weekNumber, groupId: C, arrangedByUid: "claudia", arrangedAt: ARRANGED })) });
/** Week 2 spent at Group C's session, in the room, off Group C's register; Group B's register for it has no line of hers. */
function heldVisitSeed(over = {}) {
  return seed({
    [AMARA_SEAT]: visiting(2),
    [`courseAttendance/${RUN.agi}__${B}__w02`]: registerDoc(B, 2, { kofi: "absent" }),
    [`courseAttendance/${RUN.agi}__${C}__w02`]: { ...registerDoc(C, 2, { amara: "present" }), pushedByUid: "tom", markedByUid: "tom" },
    ...over,
  });
}
/** The History rows arranging a visit and calling it off write, one on each group. */
function visitHistory() {
  const row = (id, kind, groupId, detail, at, extra = {}) => ({
    kind,
    runId: RUN.agi,
    groupId,
    subjectUid: "amara",
    actorUid: "claudia",
    actorName: "Claudia Reyes",
    targetLabel: groupId === C ? "Group C" : "Group B",
    detail,
    weekId: "w04",
    emailed: 3,
    at,
    ...extra,
  });
  const on = new Date("2026-11-10T12:20:00Z");
  const off = new Date("2026-11-12T09:00:00Z");
  return {
    "courseAudit/v-home": row("v-home", "member-visits", B, "Amara Okafor visits Group C for week 4.", on, { after: { groupId: C, group: "Group C" } }),
    "courseAudit/v-host": row("v-host", "member-visits", C, "Amara Okafor is at Group C for week 4.", on, { before: { groupId: B, group: "Group B" } }),
    "courseAudit/off-home": row("off-home", "member-visit-off", B, "Amara Okafor’s visit to Group C for week 4 is off.", off),
    "courseAudit/off-host": row("off-host", "member-visit-off", C, "Amara Okafor’s visit to Group C for week 4 is off.", off),
    // Not a visit's: never on this page.
    "courseAudit/moved": row("moved", "member-moved", B, "Amara Okafor moves to Group B from week 1.", on),
  };
}

describe("visits, as each kind of reader", () => {
  test("a visit held: the week's line at the host's session with the Visit chip, the count, and where its work was due", async () => {
    w.reset(heldVisitSeed());
    for (const who of ["zach", "claudia"]) {
      const view = viewOf(await team(who));
      const line = view.attendance.lines.find((each) => each.weekNumber === 2);
      assert.equal(line.said, "At Group C’s session, in the room", who);
      assert.deepEqual(line.chips, ["Visit"], who);
      assert.deepEqual(view.attendance.counts.map((count) => [count.key, count.value]), [["room", 2], ["online", 0], ["visits", 1]], who);
      assert.equal(view.weeks.find((week) => week.weekNumber === 2).visit, "Due at Group C, Wed 11 Nov, 1pm: a visit", who);
      assert.ok(view.weeks.filter((week) => week.weekNumber !== 2).every((week) => week.visit === null), `${who}: a week with no visit says one`);
    }
    // Group B's facilitator: the visit week's line, and nothing else from this piece.
    const drawn = await cut("rahul");
    const view = viewOf(drawn);
    assert.deepEqual(Object.keys(view).sort(), ["attendance", "back", "elsewhere", "feedback", "header", "uid", "weeks"]);
    const line = view.attendance.lines.find((each) => each.weekNumber === 2);
    assert.equal(line.said, "At Group C’s session, in the room");
    assert.deepEqual(line.chips, ["Visit"]);
    assert.equal(view.attendance.counts.find((count) => count.key === "visits").value, 1);
    assert.equal(view.weeks.find((week) => week.weekNumber === 2).visit, "Due at Group C, Wed 11 Nov, 1pm: a visit");
    assert.equal(view.elsewhere, null, "a visit week stays the group's own");
    assert.doesNotMatch(JSON.stringify(view), /Coming|Today, with|batch sent by|Signed up|Ranked|Joined/);
    assertNothingWritten(drawn, "facilitator, visit held");
  });

  test("a visit ahead: tomorrow's session reads as the board draws it, Coming and Visit; the cut says it without Coming", async () => {
    w.reset(seed({ [AMARA_SEAT]: visiting(3) }));
    const view = viewOf(await team("zach"));
    const line = view.attendance.lines.find((each) => each.weekNumber === 3);
    assert.equal(line.when, "Week 3 · Wed 18 Nov");
    assert.equal(line.said, "Tomorrow, with Group C");
    assert.deepEqual(line.chips, ["Coming", "Visit"]);
    assert.equal(view.attendance.counts.find((count) => count.key === "visits").value, 0, "a visit still to come is not counted");
    assert.equal(view.weeks.find((week) => week.weekNumber === 3).visit, "Due at Group C, Wed 18 Nov, 1pm: a visit");
    const rahul = viewOf(await cut("rahul"));
    const theirs = rahul.attendance.lines.find((each) => each.weekNumber === 3);
    assert.equal(theirs.said, "At Group C’s session, still to come");
    assert.deepEqual(theirs.chips, ["Visit"]);
  });

  test("no visit: today's session with their own group reads Coming, and nothing says a visit", async () => {
    w.reset(seed());
    const view = viewOf(await team("claudia"));
    const line = view.attendance.lines.find((each) => each.weekNumber === 3);
    assert.equal(line.said, "Today, with Group B");
    assert.deepEqual(line.chips, ["Coming"]);
    assert.ok(view.weeks.every((week) => week.visit === null));
    assert.doesNotMatch(JSON.stringify(view), /Visit”|"Visit"|a visit/);
    assert.equal(viewOf(await cut("rahul")).attendance.lines.find((each) => each.weekNumber === 3).said, "Still to come", "the cut keeps its own words");
  });

  test("a visit whose session was called off is no visit here: no chip, no count, no line naming the host", async () => {
    w.reset(heldVisitSeed({ [`courseAttendance/${RUN.agi}__${C}__w02`]: { ...registerDoc(C, 2, {}), held: false } }));
    const view = viewOf(await team("zach"));
    const line = view.attendance.lines.find((each) => each.weekNumber === 2);
    assert.deepEqual(line.chips, []);
    assert.doesNotMatch(line.said, /Group C/);
    assert.equal(view.attendance.counts.find((count) => count.key === "visits").value, 0);
    assert.equal(view.weeks.find((week) => week.weekNumber === 2).visit, null);
    const rahul = viewOf(await cut("rahul"));
    assert.ok(!rahul.attendance.lines.some((each) => each.weekNumber === 2), "the cut keeps a week whose session was another group's");
  });

  test("a visit standing to a session cancelled through Change a session is no visit here either", async () => {
    const s = seed({ [AMARA_SEAT]: visiting(3) });
    s[`courseGroups/${C}`] = {
      ...s[`courseGroups/${C}`],
      sessionChanges: { w03: { kind: "cancelled", reason: "Reading week", dateKey: "2026-11-18", byUid: "tom", at: new Date("2026-11-16T09:00:00Z") } },
    };
    w.reset(s);
    const view = viewOf(await team("zach"));
    assert.ok(!view.attendance.lines.some((each) => each.chips.includes("Visit")), "a cancelled session's visit is drawn as a visit");
    assert.equal(view.weeks.find((week) => week.weekNumber === 3).visit, null);
    assert.equal(view.attendance.counts.find((count) => count.key === "visits").value, 0);
  });

  test("a visit that ended: nothing beyond its History rows, which an admin's Activity carries in their own words, once each", async () => {
    w.reset(seed(visitHistory()));
    const admin = viewOf(await team("zach"));
    assert.ok(admin.weeks.every((week) => week.visit === null));
    assert.equal(admin.attendance.counts.find((count) => count.key === "visits").value, 0);
    const rows = admin.activity.filter((line) => line.who === "Claudia Reyes");
    assert.deepEqual(
      rows.map((line) => line.said),
      ["Amara Okafor’s visit to Group C for week 4 is off.", "Amara Okafor visits Group C for week 4."],
      "the home row of the arranging, the calling off once, and nothing of a move",
    );
    assert.equal(rows[0].when, "Thu 12 Nov, 9am");
    // The lead has no Activity, and is handed none of it.
    const lead = viewOf(await team("claudia"));
    assert.ok(!("activity" in lead));
    assert.doesNotMatch(JSON.stringify(lead), /visit to Group C|visits Group C/);
  });

  test("the host's facilitator during a visit, and the person themselves, are refused the cut", async () => {
    w.reset(heldVisitSeed());
    const home = `/learn/${RUN.agi}`;
    assert.equal((await cut("tom", "amara", C)).to, home, "Tom facilitates the host group, not Amara's");
    assert.equal(viewOf(await cut("tom", "amara", C)), null);
    assert.equal((await cut("amara", "amara", B)).to, home);
    assert.equal(viewOf(await cut(null)), null, "signed out");
  });
});

describe("the header's details and its two links", () => {
  test("Goes by and Joined for admins and leads, the address for an admin alone, never on the cut", async () => {
    const approved = new Date("2026-09-14T10:00:00Z");
    w.reset(seed({ "users/amara": { ...peopleSeed()["users/amara"], approvedAt: approved, createdAt: new Date("2026-08-01T10:00:00Z") } }));
    const admin = await team("zach");
    const adminView = viewOf(admin);
    assert.deepEqual(adminView.about, { goesBy: "Amara", joined: "Sep 2026" }, "the approval's month, not the account's");
    assert.equal(adminView.email, "amara@example.com");
    assert.match(admin.text, /amara@example\.com/);
    assert.match(admin.text, /\(admins only\)/);
    const lead = await team("claudia");
    const leadView = viewOf(lead);
    assert.deepEqual(leadView.about, { goesBy: "Amara", joined: "Sep 2026" });
    assert.ok(!("email" in leadView), "the lead is never sent the address");
    assert.doesNotMatch(lead.html, /@/, "no address anywhere on the lead's page");
    assertNothingWritten(lead, "lead, head");
    const rahul = await cut("rahul");
    assert.ok(!("email" in viewOf(rahul)) && !("about" in viewOf(rahul)));
    assert.doesNotMatch(rahul.html, /@|Joined|Goes by/);
  });

  test("an account with no approval on record joined when it was made, and with neither says nothing", async () => {
    w.reset(seed({ "users/amara": { ...peopleSeed()["users/amara"], createdAt: new Date("2026-10-02T10:00:00Z") } }));
    assert.equal(viewOf(await team("zach")).about.joined, "Oct 2026");
    w.reset(seed());
    const view = viewOf(await team("zach"));
    assert.equal(view.about.joined, null);
    assert.doesNotMatch((await team("zach")).text, /Joined/);
  });

  test("Visit and Move are drawn exactly where the People tab offers them, from its one decision", async () => {
    w.reset(seed());
    const rows = (await w.peoplePage("claudia")) && w.viewOf(await w.peoplePage("claudia")).rows;
    for (const row of rows) {
      assert.equal(row.visitHref !== null, row.moveHref !== null, `${row.uid}: the two links go together`);
      const view = viewOf(await team("claudia", row.uid));
      if (!view) continue;
      assert.equal(view.move?.href ?? null, row.moveHref, `${row.uid}: Move`);
      assert.equal(view.visit?.href ?? null, row.visitHref, `${row.uid}: Visit`);
    }
    const amara = await team("zach");
    assert.equal(viewOf(amara).visit.label, "Visit another group for one week");
    assert.ok(amara.html.indexOf("Visit another group for one week") < amara.html.indexOf("Move to another group"), "Visit comes first, as drawn");
    // Kofi is placed and not told: neither link.
    const kofi = viewOf(await team("zach", "kofi"));
    assert.ok(!("visit" in kofi) && !("move" in kofi));
  });

  test("the strip of section links names only the sections the reader is shown", async () => {
    w.reset(seed());
    const strip = (drawn) => [...drawn.html.matchAll(/href="#person-([a-z]+)"/g)].map((match) => match[1]);
    assert.deepEqual(strip(await team("zach")), ["coursework", "attendance", "feedback", "notes", "application", "events", "activity"]);
    assert.deepEqual(strip(await team("claudia")), ["coursework", "attendance", "feedback", "notes", "application"]);
    assert.deepEqual(strip(await team("zach", "zach")), ["coursework", "attendance", "feedback", "events", "activity"], "no notes and no application about themselves");
    assert.deepEqual(strip(await cut("rahul")), [], "the cut has no strip");
    for (const id of strip(await team("zach"))) assert.match((await team("zach")).html, new RegExp(`id="person-${id}"`), `${id}: the link has somewhere to go`);
  });
});

describe("the application's line", () => {
  test("ranked and accepted: the board's line, with Read the application, for an admin and the lead", async () => {
    w.reset(seed());
    for (const who of ["zach", "claudia"]) {
      const view = viewOf(await team(who));
      assert.deepEqual(view.application, {
        href: `/admin/admissions/forms/${ROUND}/programmes/${AGI}/applications/amara`,
        label: "Read the application",
        line: "Ranked AGI Strategy first. Accepted Fri 23 Oct.",
      }, who);
    }
  });

  test("a ranking says where the programme sat; an application that did not rank it says only what it has", async () => {
    const s = seed();
    const path = `admissionApplications/${ROUND}__amara`;
    s[path] = { ...s[path], sent: { ...s[path].sent, rankedProgrammeIds: [TAIS, AGI] } };
    w.reset(s);
    assert.equal(viewOf(await team("zach")).application.line, "Ranked AGI Strategy second. Accepted Fri 23 Oct.");
    w.reset(seed());
    // Kofi ranked only Technical AI Safety and said yes to an invitation to AGI Strategy: no ranking of it to say.
    assert.equal(viewOf(await team("zach", "kofi")).application.line, "Said yes to an invitation Tue 27 Oct.");
    assert.equal(viewOf(await team("claudia", "kofi")).application.line, "Said yes to an invitation Tue 27 Oct.");
  });

  test("nobody is sent the line without the link: not about themselves, not on the cut", async () => {
    w.reset(seed());
    assert.ok(!("application" in viewOf(await team("zach", "zach"))));
    assert.doesNotMatch(JSON.stringify(viewOf(await cut("rahul"))), /Ranked|Accepted|invitation/);
  });
});

describe("who sent the batch", () => {
  test("an emailed piece names who pressed Send, on the team's page alone; a stopped one and older feedback never do", async () => {
    w.reset(seed());
    for (const who of ["zach", "claudia"]) {
      const view = viewOf(await team(who));
      assert.equal(view.feedback.find((each) => each.id === "piece-rahul").line, "Rahul, Mon 16 Nov · Emailed to Amara on Mon 16 Nov in a batch sent by Zach", who);
      assert.equal(view.feedback.find((each) => each.id === "piece-claudia").line, "Claudia, Mon 16 Nov · Not emailed yet", who);
    }
    assert.doesNotMatch(JSON.stringify(viewOf(await cut("rahul"))), /batch sent by/, "the cut is never told who sent it");
    const s = seed();
    s["courseFeedback/piece-rahul"] = { ...s["courseFeedback/piece-rahul"], emailDelivery: "suppressed" };
    w.reset(s);
    assert.doesNotMatch(JSON.stringify(viewOf(await team("zach"))), /batch sent by/, "an email that never went was sent by nobody");
  });
});

describe("events this term, for an admin alone", () => {
  const AGREED_AT = new Date("2026-09-20T10:00:00Z");
  const event = (title, start, extra = {}) => ({
    title,
    blocks: [],
    startAt: new Date(start),
    endAt: new Date(new Date(start).getTime() + 2 * 3600_000),
    location: "Room B52",
    locationHidden: false,
    locationPublicText: "",
    visibility: "public",
    capacity: 30,
    waitlistEnabled: true,
    noSignup: false,
    signupForm: [],
    status: "published",
    archived: false,
    authorUid: "zach",
    collaboratorUids: [],
    doorOpenedAt: null,
    doorOpenedBy: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
    ...extra,
  });
  const signup = (eventId, status) => ({
    eventId,
    uid: "amara",
    name: "Amara Okafor",
    email: "amara@example.com",
    answers: {},
    status,
    synthetic: false,
    createdAt: new Date("2026-09-29T10:00:00Z"),
    cancelledAt: null,
  });
  const agreed = { ...peopleSeed()["users/amara"], policyVersion: "terms.1+privacy.15", policyAgreedAt: AGREED_AT };

  test("a count of sign-ups inside the run's dates; nothing said of who came; absent for the lead and the cut", async () => {
    w.reset(
      seed({
        "users/amara": agreed,
        "events/ev-before": event("Welcome drinks", "2026-10-08T18:00:00Z"),
        "events/ev-in": event("Film night", "2026-11-05T19:00:00Z"),
        "events/ev-ahead": event("Speaker evening", "2026-11-26T19:00:00Z"),
        "events/ev-gave-back": event("Quiz night", "2026-11-12T19:00:00Z"),
        "events/ev-off": event("Pizza and papers", "2026-11-10T19:00:00Z", { status: "cancelled" }),
        "eventRsvps/ev-before__amara": signup("ev-before", "confirmed"),
        "eventRsvps/ev-in__amara": signup("ev-in", "confirmed"),
        "eventRsvps/ev-ahead__amara": signup("ev-ahead", "waitlisted"),
        "eventRsvps/ev-gave-back__amara": signup("ev-gave-back", "cancelled"),
        "eventRsvps/ev-off__amara": signup("ev-off", "confirmed"),
      }),
    );
    const admin = await team("zach");
    assert.equal(viewOf(admin).signedUp, "Signed up to 2 this term.");
    assert.match(admin.text, /Signed up to 2 this term\./);
    assert.doesNotMatch(admin.text, /Came to/);
    const lead = await team("claudia");
    assert.ok(!("signedUp" in viewOf(lead)) && !("events" in viewOf(lead)));
    assert.doesNotMatch(lead.text, /Signed up/);
    assert.doesNotMatch(JSON.stringify(viewOf(await cut("rahul"))), /Signed up/);
  });

  test("no sign-ups says so; somebody who has not accepted the policy is sent no count at all", async () => {
    w.reset(seed({ "users/amara": agreed }));
    assert.equal(viewOf(await team("zach")).signedUp, "Not signed up to any this term.");
    w.reset(seed());
    assert.ok(!("signedUp" in viewOf(await team("zach"))), "the events card lists nothing for them, so nothing is counted");
  });
});

describe("the page's model, pure", () => {
  const cell = (over = {}) => ({
    weekNumber: 1,
    counted: true,
    done: false,
    doneAt: null,
    doneLateMs: null,
    due: { at: null, by: "group" },
    reached: true,
    opensOn: null,
    started: false,
    reflections: null,
    ticks: { ticked: 2, of: 3 },
    answer: null,
    boxes: null,
    flags: { unread: false, noFeedback: false, changed: false },
    waiting: null,
    href: "",
    ...over,
  });
  const week = { weekNumber: 1, title: "One", parts: [{ prompts: [{ id: "rp1" }] }], sources: [], answer: { id: "wa" }, boxes: [], tasks: [], writes: true };
  const work = (over = {}) => ({ reflections: new Set(), boxes: new Set(), answers: new Map(), ticked: new Set(), ...over });

  test("a week: readings, the reflection's last save, the answer sent late, feedback as who and when", () => {
    const row = model.weekRowOf({
      column: { weekNumber: 1, title: "One" },
      cell: cell({ started: true }),
      week,
      work: work({
        reflections: new Set(["1 rp1"]),
        savedAt: new Map([["1 rp1", new Date("2026-11-09T21:02:00Z")]]),
        answerFacts: new Map([["1 wa", { firstSentAt: new Date("2026-11-05T14:02:00Z"), sentLateMs: 60000 }]]),
      }),
      feedback: [{ id: "f", weekNumber: 1, on: "writtenAnswer", byName: "Rahul", createdAt: new Date("2026-11-07T10:00:00Z"), emailedAt: null, delivery: null, sending: false, legacy: false }],
      firstName: "Amara",
      readHref: "/read",
      now: NOW,
    });
    assert.equal(row.state, "Started");
    assert.equal(row.readings, "2 of 3");
    assert.equal(row.reflection, "Saved Mon 9 Nov, 9:02pm");
    assert.equal(row.answer, "Sent Thu 5 Nov, 2:02pm · late");
    assert.deepEqual(row.feedback, ["Rahul, Sat 7 Nov · Not emailed yet"]);
    // What became of an email, in the reading view's own words: a stopped one is never called emailed.
    const line = (over) => model.feedbackLineOf({ id: "f", weekNumber: 1, on: "week", byName: "Rahul", createdAt: null, emailedAt: new Date("2026-11-08T10:00:00Z"), delivery: "sent", sending: false, legacy: false, ...over }, "Amara");
    assert.equal(line({}), "Rahul · Emailed to Amara on Sun 8 Nov");
    assert.equal(line({ delivery: "suppressed" }), "Rahul · Not emailed: Amara’s address is on the do-not-email list.");
    assert.equal(line({ delivery: "held" }), "Rahul · Not emailed: this copy of the site doesn’t email Amara’s address.");
    assert.equal(line({ legacy: true, delivery: "sent" }), "Rahul · Emailed to Amara on Sun 8 Nov");
    assert.equal(row.readLabel, "Read week 1");
  });

  test("the empty states the boards draw", () => {
    const row = model.weekRowOf({ column: { weekNumber: 4, title: "Four" }, cell: cell({ reached: false, opensOn: "2026-11-26", ticks: null }), week, work: work(), feedback: [], firstName: "Amara", readHref: null, now: NOW });
    assert.equal(row.open, false);
    assert.equal(row.state, "Opens Thu 26 Nov");
    assert.equal(row.reflection, "Not written");
    assert.equal(row.answer, "Not sent");
    const empty = model.attendanceViewOf([]);
    assert.equal(empty.empty, true);
    assert.deepEqual(empty.counts.map((count) => count.value), [0, 0, 0]);
    assert.deepEqual(model.feedbackLinesOf([], "Amara"), []);
    assert.deepEqual(model.ratingColumnOf([1], []), [{ weekNumber: 1, lines: ["Not rated"] }]);
  });

  test("attendance: counts only, the record's own counts, one session still to come, never a threshold", () => {
    const facts = [
      { weekNumber: 1, state: "mark", mark: "present", online: false, dateLabel: "Tue 3 Nov", happened: true },
      { weekNumber: 2, state: "mark", mark: "late", online: true, dateLabel: "Tue 10 Nov", happened: true },
      { weekNumber: 3, state: "not-yet", mark: null, online: false, dateLabel: "Tue 17 Nov", happened: false },
      { weekNumber: 4, state: "not-yet", mark: null, online: false, dateLabel: "Tue 24 Nov", happened: false },
      { weekNumber: 5, state: "not-held", mark: null, online: false, dateLabel: "Tue 1 Dec", happened: false },
    ];
    const view = model.attendanceViewOf(facts);
    assert.deepEqual(view.counts.map((count) => [count.key, count.value]), [["room", 1], ["online", 1], ["visits", 0]]);
    assert.deepEqual(view.lines.map((line) => `${line.when}: ${line.said}`), [
      "Week 1 · Tue 3 Nov: In the room",
      "Week 2 · Tue 10 Nov: Late, online",
      "Week 3 · Tue 17 Nov: Still to come",
      "Week 5 · Tue 1 Dec: Didn’t happen",
    ]);
    assert.deepEqual(model.attendanceViewOf(facts, { came: 4, online: 1 }).counts.map((count) => count.value), [3, 1, 0], "the record's counts win");
    assert.doesNotMatch(JSON.stringify(view), /miss|allow|left to|more than|at most/i);
  });

  test("activity: newest first, one line per email of feedback, at most twelve", () => {
    const emailed = new Date("2026-11-10T08:00:00Z");
    const fact = (id, over = {}) => ({ id, weekNumber: 1, on: "week", byName: "Rahul", createdAt: null, emailedAt: emailed, delivery: "sent", sending: false, legacy: false, ...over });
    const lines = model.activityOf({
      toldAt: new Date("2026-10-28T18:00:00Z"),
      work: work({ reflections: new Set(["1 rp1"]), savedAt: new Map([["1 rp1", new Date("2026-11-09T21:02:00Z")]]) }),
      weeks: [{ weekNumber: 1, week }],
      feedback: [
        fact("a"),
        fact("b", { on: "writtenAnswer" }),
        // Stopped by the do-not-email list, and held by this copy of the site: neither is an email.
        fact("c", { weekNumber: 2, delivery: "suppressed", emailedAt: new Date("2026-11-11T08:00:00Z") }),
        fact("d", { weekNumber: 3, delivery: "held", emailedAt: new Date("2026-11-12T08:00:00Z") }),
      ],
    });
    // Publish's line names no group: a move keeps the day Publish first told them.
    assert.deepEqual(lines.map((line) => line.said), ["Emailed feedback on week 1", "Saved a reflection in week 1", "Publish told them their group"]);
    assert.equal(model.ACTIVITY_SHOWN, 12);
  });
});

describe("this piece's model, pure", () => {
  const fact = (over) => ({ weekNumber: 1, state: "mark", mark: "present", online: false, dateLabel: "Thu 5 Nov", happened: true, ...over });

  test("a visit's week names the host's session, counts once among visits, and never reads as an allowance", () => {
    const view = model.attendanceViewOf(
      [
        fact({ visit: true, groupName: "Group F" }),
        fact({ weekNumber: 2, mark: "late", online: true, visit: true, groupName: "Group F" }),
        fact({ weekNumber: 3, mark: "absent", visit: true, groupName: "Group F" }),
        fact({ weekNumber: 4, state: "not-yet", mark: null, happened: false, dayWord: "Tomorrow", groupName: "Group C" }),
      ],
      undefined,
      { coming: true },
    );
    assert.deepEqual(
      view.lines.map((line) => [line.said, line.chips]),
      [
        ["At Group F’s session, in the room", ["Visit"]],
        ["At Group F’s session, late, online", ["Visit"]],
        ["At Group F’s session, absent", ["Visit"]],
        ["Tomorrow, with Group C", ["Coming"]],
      ],
    );
    assert.deepEqual(view.counts.map((count) => [count.label, count.value]), [["In the room", 1], ["Online", 1], ["Visits to another group", 2]]);
    assert.doesNotMatch(JSON.stringify(view), /miss|allow|left to|more than|at most/i);
    // On another day the line says the group alone; without `coming`, the line it always said.
    const later = [fact({ state: "not-yet", mark: null, happened: false, dayWord: null, groupName: "Group C" })];
    assert.equal(model.attendanceViewOf(later, undefined, { coming: true }).lines[0].said, "With Group C");
    assert.equal(model.attendanceViewOf(later).lines[0].said, "Still to come");
    assert.deepEqual(model.attendanceViewOf(later).lines[0].chips, []);
  });

  test("the batch's sender only after an email that went; activity carries a History row with who did it", () => {
    const piece = { id: "f", weekNumber: 1, on: "week", byName: "Rahul", createdAt: null, emailedAt: new Date("2026-11-08T10:00:00Z"), delivery: "sent", sending: false, legacy: false, sentBy: "Zach" };
    assert.equal(model.feedbackLineOf(piece, "Amara"), "Rahul · Emailed to Amara on Sun 8 Nov in a batch sent by Zach");
    assert.equal(model.feedbackLineOf({ ...piece, delivery: "held" }, "Amara"), "Rahul · Not emailed: this copy of the site doesn’t email Amara’s address.");
    assert.equal(model.feedbackLineOf({ ...piece, sending: true }, "Amara"), "Rahul · Being emailed now");
    assert.equal(model.feedbackLineOf({ ...piece, sentBy: undefined }, "Amara"), "Rahul · Emailed to Amara on Sun 8 Nov");
    const lines = model.activityOf({
      toldAt: null,
      work: { reflections: new Set(), boxes: new Set(), answers: new Map(), ticked: new Set() },
      weeks: [],
      feedback: [],
      history: [{ at: new Date("2026-11-04T10:40:00Z"), who: "Zach Levin", said: "Kwame Asante visits Group F for week 1." }],
    });
    assert.deepEqual(lines, [{ at: "2026-11-04T10:40:00.000Z", when: "Wed 4 Nov, 10:40am", said: "Kwame Asante visits Group F for week 1.", who: "Zach Levin" }]);
  });

  test("the words: joined, ranked, accepted, an invitation, the events count", async () => {
    const words = await w.loadTs(join("lib", "courses", "personPage", "words.ts"));
    assert.equal(words.joinedMonthWords(new Date("2026-09-14T10:00:00Z")), "Sep 2026");
    assert.equal(words.joinedMonthWords(new Date("2026-06-30T23:30:00Z")), "Jul 2026", "the month in London");
    assert.equal(words.rankedWords("AGI Strategy", 1), "Ranked AGI Strategy first.");
    assert.equal(words.rankedWords("AGI Strategy", 3), "Ranked AGI Strategy third.");
    assert.equal(words.acceptedWords(null), "Accepted.");
    assert.equal(words.invitationTakenWords(null), "Said yes to an invitation.");
    assert.equal(words.signedUpWords(1), "Signed up to 1 this term.");
    assert.equal(words.signedUpWords(0), "Not signed up to any this term.");
    assert.equal(words.visitDueWords("Group F", null), "Due at Group F: a visit");
  });
});

describe("the source", () => {
  const load = codeOf("lib/courses/personPage/load.ts");

  test("events and activity are read only once the reader is known to be an admin", () => {
    const adminOnly = load.indexOf("if (!isAdmin) return");
    assert.ok(adminOnly > 0);
    assert.ok(adminOnly < load.indexOf("eventsOfPersonInTerm(db"), "events are read after the admin check");
    assert.ok(adminOnly < load.indexOf("visitHistoryOf(db, run.id, uid)"), "the visits' History rows are read after the admin check");
    assert.equal((load.match(/eventsOfPersonInTerm\(db/g) ?? []).length, 1, "one read of the events");
    assert.ok(adminOnly < load.indexOf("activity: activityOf("), "activity is made after the admin check");
  });

  test("ratings are read only behind the gate every reader of ratings asks", () => {
    assert.ok(load.indexOf("mayRateWorkOf(actor, facts, owner, liveGroups)") < load.indexOf("readPersonRatings(db"));
    assert.equal((load.match(/readPersonRatings\(/g) ?? []).length, 1, "one query for the person on the run");
    assert.doesNotMatch(load, /readAnswerRatings\(|readWeekRatings\(|readRatingsAbout\(|loadTeamRatings\(/);
  });

  test("nobody's words are read: the run's coursework is read with no person's words", () => {
    assert.match(load, /readRunCoursework\(db, \{ run, liveGroups, now, enrolments: input\.enrolments \}, null\)/);
  });

  test("conduct is named nowhere in the page's files", () => {
    for (const file of [
      "lib/courses/personPage/load.ts",
      "lib/courses/personPage/model.ts",
      "lib/courses/personPage/words.ts",
      "features/courses/personPage/PersonPage.tsx",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/page.tsx",
      "app/(app)/learn/[runId]/group/[groupId]/people/[uid]/page.tsx",
    ]) {
      assert.doesNotMatch(readFileSync(join(SRC, file), "utf8"), /conduct/i, file);
    }
  });
});
