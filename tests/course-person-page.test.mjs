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
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGI, B, C, ROUND, RUN, makePeopleWorld, peopleSeed } from "./lib/peopleWorld.mjs";
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

/** Every word anybody wrote in the world: none may ever be in a view or on a page. */
const WRITTEN = {
  reflection: "The keepers on the north coast trimmed their own wicks.",
  answer: "A harbour trust should keep the lamps lit for every ship.",
  rahulFeedback: "A strong argument about the harbour trust.",
  claudiaFeedback: "Good week, keep reading the second source.",
  ratingComment: "Ready to facilitate next term, in my view.",
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
    if (node.props?.view && typeof node.props.view === "object" && "weeks" in node.props.view) return node.props.view;
    if (typeof node.type === "function" && !node.props?.children) return null;
    return visit(node.props?.children);
  };
  return drawn.element ? visit(drawn.element) : null;
}

const team = (who, uid = "amara") => w.draw(pages.team, who, { roundId: ROUND, programmeId: AGI, uid });
const cut = (who, uid = "amara", groupId = B) => w.draw(pages.cut, who, { runId: RUN.agi, groupId, uid });

/** Nothing anybody wrote, and nothing about conduct, in the payload or on the page. */
function assertNothingWritten(drawn, label) {
  const payload = JSON.stringify(viewOf(drawn) ?? {});
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
      feedback: [{ id: "f", weekNumber: 1, on: "writtenAnswer", byName: "Rahul", createdAt: new Date("2026-11-07T10:00:00Z"), emailedAt: null }],
      readHref: "/read",
      now: NOW,
    });
    assert.equal(row.state, "Started");
    assert.equal(row.readings, "2 of 3");
    assert.equal(row.reflection, "Saved Mon 9 Nov, 9:02pm");
    assert.equal(row.answer, "Sent Thu 5 Nov, 2:02pm · late");
    assert.deepEqual(row.feedback, ["Rahul, Sat 7 Nov · Not emailed yet"]);
    assert.equal(row.readLabel, "Read week 1");
  });

  test("the empty states the boards draw", () => {
    const row = model.weekRowOf({ column: { weekNumber: 4, title: "Four" }, cell: cell({ reached: false, opensOn: "2026-11-26", ticks: null }), week, work: work(), feedback: [], readHref: null, now: NOW });
    assert.equal(row.open, false);
    assert.equal(row.state, "Opens Thu 26 Nov");
    assert.equal(row.reflection, "Not written");
    assert.equal(row.answer, "Not sent");
    const empty = model.attendanceViewOf([]);
    assert.equal(empty.empty, true);
    assert.deepEqual(empty.counts.map((count) => count.value), [0, 0]);
    assert.deepEqual(model.feedbackLinesOf([]), []);
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
    assert.deepEqual(view.counts.map((count) => [count.key, count.value]), [["room", 1], ["online", 1]]);
    assert.deepEqual(view.lines.map((line) => `${line.when}: ${line.said}`), [
      "Week 1 · Tue 3 Nov: In the room",
      "Week 2 · Tue 10 Nov: Late, online",
      "Week 3 · Tue 17 Nov: Still to come",
      "Week 5 · Tue 1 Dec: Didn’t happen",
    ]);
    assert.deepEqual(model.attendanceViewOf(facts, { came: 4, online: 1 }).counts.map((count) => count.value), [3, 1], "the record's counts win");
    assert.doesNotMatch(JSON.stringify(view), /miss|allow|left to|more than|at most/i);
  });

  test("activity: newest first, one line per email of feedback, at most twelve", () => {
    const lines = model.activityOf({
      toldAt: new Date("2026-10-28T18:00:00Z"),
      toldGroup: "Group B",
      work: work({ reflections: new Set(["1 rp1"]), savedAt: new Map([["1 rp1", new Date("2026-11-09T21:02:00Z")]]) }),
      weeks: [{ weekNumber: 1, week }],
      feedback: [
        { id: "a", weekNumber: 1, on: "week", byName: "Rahul", createdAt: null, emailedAt: new Date("2026-11-10T08:00:00Z") },
        { id: "b", weekNumber: 1, on: "writtenAnswer", byName: "Rahul", createdAt: null, emailedAt: new Date("2026-11-10T08:00:00Z") },
      ],
    });
    assert.deepEqual(lines.map((line) => line.said), ["Emailed feedback on week 1", "Saved a reflection in week 1", "Publish told them about Group B"]);
    assert.equal(model.ACTIVITY_SHOWN, 12);
  });
});

describe("the source", () => {
  const load = codeOf("lib/courses/personPage/load.ts");

  test("events and activity are read only once the reader is known to be an admin", () => {
    const adminOnly = load.indexOf("if (!isAdmin) return");
    assert.ok(adminOnly > 0);
    assert.ok(adminOnly < load.indexOf("eventsOfPerson(db"), "events are read after the admin check");
    assert.ok(adminOnly < load.indexOf("activity: activityOf("), "activity is made after the admin check");
  });

  test("ratings are read only behind the gate every reader of ratings asks", () => {
    assert.ok(load.indexOf("mayRateWorkOf(actor, facts, owner, liveGroups)") < load.indexOf("readPersonRatings(db"));
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
