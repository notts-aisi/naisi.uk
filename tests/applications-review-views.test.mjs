/**
 * What the review screens show, worked out from what is stored.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * Nothing on the review screens is stored that can be worked out, so each
 * thing a lead reads off them is a small pure function, and each is executed
 * here on the cases that would otherwise be argued about:
 *
 *  - WHEN THEY'RE FREE. An availability answer is a hex mask of quarter
 *    hours. The grid and the lines of words under it are both drawn from the
 *    same decoded runs, on the grid the answer was drawn on, in wall-clock
 *    time. A slot can never move with the clocks and a block can never
 *    disagree with its sentence.
 *  - WHO THEY ARE. The line under a name comes from the join questions. Those
 *    ask when somebody expects to graduate and not which year they are in, so
 *    the line says the first and never guesses the second. A missing name
 *    falls back to a word, never to an address.
 *  - THE LIST. Filtering, searching and sorting happen in the browser on the
 *    rows the server sent. "To review" means what the programme still owes,
 *    which is not the same as "has no decision here".
 *  - THE QUEUE. Next and previous walk the people still to review, from
 *    wherever the caller is standing, including on an application that is no
 *    longer one of them.
 *
 * Everything loaded here is the real module. Nothing is stubbed.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader();
const lib = (file) => join("lib", "applications", "review", file);

const availability = await loadTs(lib("availabilityView.ts"));
const people = await loadTs(lib("people.ts"));
const detail = await loadTs(lib("detail.ts"));
const audit = await loadTs(lib("audit.ts"));
const term = await loadTs(lib("term.ts"));
const listModel = await loadTs(join("features", "applications", "review", "listModel.ts"));
const { encodeMask } = await loadTs(join("lib", "admissions", "availability.ts"));

// ---------------------------------------------------------------------------
// When they're free
// ---------------------------------------------------------------------------

const GRID = { version: 1, startMinute: 9 * 60, endMinute: 21 * 60, slotMinutes: 15 };

/** A mask from `[weekday (0 = Sunday), "HH:MM", "HH:MM"]` blocks, on any grid. */
function maskOf(blocks, grid = GRID) {
  const slots = Math.floor((grid.endMinute - grid.startMinute) / grid.slotMinutes);
  const days = Array.from({ length: 7 }, () => new Array(slots).fill(false));
  const slot = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h * 60 + m - grid.startMinute) / grid.slotMinutes;
  };
  for (const [day, from, to] of blocks) {
    for (let s = slot(from); s < slot(to); s += 1) days[day][s] = true;
  }
  return { ...grid, days: encodeMask(days, grid) };
}

describe("when they're free", () => {
  const AMARA = maskOf([
    [1, "18:00", "21:00"],
    [2, "18:00", "21:00"],
    [4, "18:00", "21:00"],
    [3, "10:00", "12:00"],
    [3, "18:00", "19:30"],
    [6, "10:00", "13:00"],
  ]);

  test("days that share the same times read as one line, Monday first", () => {
    const view = availability.availabilityViewFor(AMARA);
    assert.equal(view.empty, false);
    assert.deepEqual(view.lines, [
      "Mon, Tue and Thu, 6pm to 9pm",
      "Wed, 10am to 12pm and 6pm to 7:30pm",
      "Sat, 10am to 1pm",
    ]);
    assert.equal(view.total, "15.5 hours across 5 days");
  });

  test("the picture is drawn from the same runs as the words", () => {
    const view = availability.availabilityViewFor(AMARA);
    assert.deepEqual(
      view.days.map((day) => day.label),
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    );
    const wed = view.days[2];
    assert.deepEqual(
      wed.blocks.map((block) => block.label),
      ["10am to 12pm", "6pm to 7:30pm"],
    );
    // 10:00 is one hour into a twelve-hour day; 6pm is three quarters across.
    assert.ok(Math.abs(wed.blocks[0].left - 100 / 12) < 1e-9);
    assert.ok(Math.abs(wed.blocks[0].width - 200 / 12) < 1e-9);
    assert.equal(wed.blocks[1].left, 75);
    assert.equal(wed.blocks[1].width, 12.5);
    assert.deepEqual(view.days[4].blocks, [], "Friday has nothing painted");
    assert.deepEqual(
      view.axis.map((tick) => [tick.label, tick.at]),
      [["9am", 0], ["12pm", 25], ["3pm", 50], ["6pm", 75], ["9pm", 100]],
    );
    assert.ok(Math.abs(view.hourWidth - 100 / 12) < 1e-9);
  });

  test("an answer is read on the grid it was drawn on, not on today's", () => {
    // Drawn when the form ran 10am to 6pm in half hours: the first slot is
    // 10am, whatever the form's grid has become since.
    const older = { version: 1, startMinute: 10 * 60, endMinute: 18 * 60, slotMinutes: 30 };
    const view = availability.availabilityViewFor(maskOf([[0, "10:00", "11:30"]], older));
    assert.deepEqual(view.lines, ["Sun, 10am to 11:30am"]);
    assert.equal(view.total, "1.5 hours across 1 day");
    assert.equal(view.days[6].blocks[0].left, 0);
  });

  test("nothing painted, and a mask nobody can read, are both empty and say nothing", () => {
    const blank = availability.availabilityViewFor(maskOf([]));
    assert.equal(blank.empty, true);
    assert.deepEqual(blank.lines, []);
    assert.equal(blank.total, null);
    const broken = availability.availabilityViewFor({
      version: 1,
      startMinute: 600,
      endMinute: 600,
      slotMinutes: 15,
      days: [],
    });
    assert.equal(broken.empty, true);
  });

  test("times are written the way the site writes them", () => {
    const cases = [
      [0, "12am"],
      [9 * 60, "9am"],
      [12 * 60, "12pm"],
      [13 * 60 + 5, "1:05pm"],
      [19 * 60 + 30, "7:30pm"],
      [21 * 60, "9pm"],
      [24 * 60, "12am"],
    ];
    for (const [minute, label] of cases) assert.equal(availability.clockLabel(minute), label);
  });

  test("one hour and one day are singular, and a quarter hour is not rounded away", () => {
    assert.equal(
      availability.availabilityViewFor(maskOf([[1, "09:00", "10:00"]])).total,
      "1 hour across 1 day",
    );
    assert.equal(
      availability.availabilityViewFor(maskOf([[1, "09:00", "10:15"], [2, "09:00", "10:00"]])).total,
      "2.25 hours across 2 days",
    );
  });
});

// ---------------------------------------------------------------------------
// Who they are
// ---------------------------------------------------------------------------

describe("the line under a name", () => {
  const about = (over) => ({
    preferredName: "Amara",
    status: "undergraduate",
    statusOther: "",
    subject: "BA Philosophy",
    expectedGraduation: "2028-07",
    ...over,
  });

  test("an undergraduate reads by when they graduate, because the year of study is not asked", () => {
    assert.equal(people.applicantDetail(about({})), "BA Philosophy · Graduating 2028");
    assert.equal(
      people.applicantDetail(about({ expectedGraduation: "" })),
      "BA Philosophy · Undergraduate",
    );
  });

  test("a master's or PhD student is a postgrad, and staff are staff", () => {
    assert.equal(people.stageLabel(about({ status: "masters" })), "Postgrad");
    assert.equal(people.stageLabel(about({ status: "phd" })), "Postgrad");
    assert.equal(people.stageLabel(about({ status: "employee" })), "Staff");
    assert.equal(people.stageLabel(about({ status: "postdoc" })), "Post-doc");
    assert.equal(people.stageLabel(about({ status: "other", statusOther: "Visiting researcher" })), "Visiting researcher");
    assert.equal(people.stageLabel(about({ status: "", expectedGraduation: "" })), "");
  });

  test("a graduation month is written out, and a malformed one is nothing", () => {
    assert.equal(people.graduationLabel("2028-07"), "July 2028");
    assert.equal(people.graduationLabel("2027-01"), "January 2027");
    assert.equal(people.graduationLabel("2028-13"), null);
    assert.equal(people.graduationLabel(""), null);
    assert.equal(people.graduationLabel("July 2028"), null);
  });

  test("a missing name falls back to a word, never to an address", () => {
    assert.equal(people.applicantName(about({}), "Amara Okafor"), "Amara Okafor");
    assert.equal(people.applicantName(about({}), "  "), "Amara");
    assert.equal(people.applicantName(about({ preferredName: "" }), ""), "Applicant");
    assert.equal(people.applicantFirstName(about({ preferredName: "" }), "Amara Okafor"), "Amara");
    assert.equal(people.applicantFirstName(about({ preferredName: "" }), ""), "Applicant");
  });

  test("the degree answer wears the label its question had", () => {
    assert.equal(people.degreeLabel(about({})), "Degree");
    assert.equal(people.degreeLabel(about({ status: "employee" })), "Area of work");
    assert.equal(people.statusLabel(about({})), "Undergraduate");
  });

  test("a list reads as a sentence would say it", () => {
    assert.equal(people.listInWords([]), "");
    assert.equal(people.listInWords(["Mon"]), "Mon");
    assert.equal(people.listInWords(["Mon", "Tue"]), "Mon and Tue");
    assert.equal(people.listInWords(["Mon", "Tue", "Thu"]), "Mon, Tue and Thu");
  });
});

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

describe("filtering, searching and sorting the list", () => {
  const row = (uid, over = {}) => ({
    uid,
    name: uid[0].toUpperCase() + uid.slice(1),
    detail: "BA Philosophy · Graduating 2028",
    accountWaiting: false,
    withdrawn: false,
    choice: 1,
    firstChoiceName: null,
    score: null,
    scoreValue: null,
    wantsToFacilitate: false,
    comments: 0,
    standing: "to-review",
    owesDecision: true,
    placedOn: null,
    appliedAt: "2026-10-17T13:20:00.000Z",
    searchText: `${uid} ba philosophy · graduating 2028 agi strategy`,
    ...over,
  });
  const ROWS = [
    row("amara", { wantsToFacilitate: true, appliedAt: "2026-10-17T13:20:00.000Z" }),
    row("ben", { standing: "pooled", owesDecision: false, score: "2.0", scoreValue: 2, appliedAt: "2026-10-16T09:00:00.000Z" }),
    row("chloe", { standing: "accepted", owesDecision: false, score: "4.5", scoreValue: 4.5, wantsToFacilitate: true, appliedAt: "2026-10-18T20:00:00.000Z" }),
    row("wen", {
      choice: 2,
      firstChoiceName: "Technical AI Safety",
      owesDecision: false,
      placedOn: "Technical AI Safety",
      searchText: "wen msc computer science · postgrad technical ai safety agi strategy",
      appliedAt: "2026-10-15T09:00:00.000Z",
    }),
    row("zara", { standing: "declined", owesDecision: false, appliedAt: null }),
  ];
  const query = (over) => ({ ...listModel.DEFAULT_QUERY, ...over });
  const uids = (rows) => rows.map((entry) => entry.uid);

  test("with nothing chosen everybody is listed, newest first", () => {
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({}))), ["chloe", "amara", "ben", "wen", "zara"]);
  });

  test("To review is what the programme still owes, not everybody without a decision", () => {
    // Wen has no decision here, and a higher choice has accepted them.
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ status: "to-review" }))), ["amara"]);
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ status: "accepted" }))), ["chloe"]);
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ status: "pooled" }))), ["ben"]);
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ status: "declined" }))), ["zara"]);
  });

  test("the two toggles narrow the list and combine", () => {
    assert.deepEqual(
      uids(listModel.filterRows(ROWS, query({ firstChoiceOnly: true }))),
      ["chloe", "amara", "ben", "zara"],
    );
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ facilitatingOnly: true }))), ["chloe", "amara"]);
    assert.deepEqual(
      uids(listModel.filterRows(ROWS, query({ facilitatingOnly: true, status: "accepted" }))),
      ["chloe"],
    );
  });

  test("search matches every word, in a name, a degree or a programme they ranked", () => {
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ search: "  WEN " }))), ["wen"]);
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ search: "technical" }))), ["wen"]);
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ search: "philosophy ben" }))), ["ben"]);
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ search: "nobody" }))), []);
  });

  test("a group picked from the recommendations shows those people and nobody else", () => {
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ group: ["wen", "ben", "gone"] }))), ["ben", "wen"]);
    assert.deepEqual(uids(listModel.filterRows(ROWS, query({ group: [] }))), []);
  });

  test("the other orders: oldest, by name, and by score with the unscored last", () => {
    assert.deepEqual(
      uids(listModel.filterRows(ROWS, query({ sort: "oldest" }))),
      ["zara", "wen", "ben", "amara", "chloe"],
    );
    assert.deepEqual(
      uids(listModel.filterRows(ROWS, query({ sort: "name" }))),
      ["amara", "ben", "chloe", "wen", "zara"],
    );
    assert.deepEqual(
      uids(listModel.filterRows(ROWS, query({ sort: "score" }))),
      ["chloe", "ben", "amara", "wen", "zara"],
    );
  });

  test("filtering never reorders or changes the rows it was given", () => {
    const before = JSON.stringify(ROWS);
    listModel.filterRows(ROWS, query({ sort: "name", search: "a" }));
    assert.equal(JSON.stringify(ROWS), before);
  });

  test("the footer has words for every order, and the counts take the right verb", () => {
    for (const key of Object.keys(listModel.SORT_LABEL)) {
      assert.ok(listModel.SORT_WORDS[key], `no footer words for the ${key} order`);
    }
    assert.equal(listModel.isOrAre(1), "is");
    assert.equal(listModel.isOrAre(6), "are");
  });
});

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

describe("next and previous", () => {
  const ORDER = ["amara", "ben", "chloe", "dev", "farah"];
  const QUEUE = ["amara", "dev", "farah"];

  test("an application still to review knows its place, and its neighbours in the queue", () => {
    assert.deepEqual(detail.queuePlaceFor(ORDER, QUEUE, "dev"), {
      position: 2,
      total: 3,
      previousUid: "amara",
      nextUid: "farah",
    });
    assert.deepEqual(detail.queuePlaceFor(ORDER, QUEUE, "amara"), {
      position: 1,
      total: 3,
      previousUid: null,
      nextUid: "dev",
    });
    assert.equal(detail.queuePlaceFor(ORDER, QUEUE, "farah").nextUid, null);
  });

  test("a decided application has no place, and still leads to the people who are left", () => {
    assert.deepEqual(detail.queuePlaceFor(ORDER, QUEUE, "chloe"), {
      position: null,
      total: 3,
      previousUid: "amara",
      nextUid: "dev",
    });
  });

  test("somebody who is not on the list at all leads nowhere", () => {
    assert.deepEqual(detail.queuePlaceFor(ORDER, QUEUE, "nobody"), {
      position: null,
      total: 3,
      previousUid: null,
      nextUid: null,
    });
  });

  test("the list's order is newest first, then by name, and is the same between reads", () => {
    const rows = [
      { uid: "b", name: "Ben", appliedAt: "2026-10-17T13:20:00.000Z" },
      { uid: "a", name: "Amara", appliedAt: "2026-10-17T13:20:00.000Z" },
      { uid: "z", name: "Zara", appliedAt: "2026-10-18T09:00:00.000Z" },
      { uid: "n", name: "Nina", appliedAt: null },
    ];
    assert.deepEqual(
      [...rows].sort(term.newestFirst).map((entry) => entry.uid),
      ["z", "a", "b", "n"],
    );
  });
});

// ---------------------------------------------------------------------------
// What the audit log is told
// ---------------------------------------------------------------------------

describe("the sentences written to the audit log", () => {
  // Neither sentence can name the applicant, because neither is handed a
  // name: who a line is about is the row's `subjectUid`. The log is kept when
  // an account is deleted, and a name in the sentence would outlive it.
  test("a decision says who decided what, and what it replaced, and names no applicant", () => {
    assert.equal(
      audit.decisionSentence({
        actorName: "Claudia",
        programmeName: "AGI Strategy",
        decision: "accept",
        previous: null,
      }),
      "Claudia accepted an applicant for AGI Strategy.",
    );
    assert.equal(
      audit.decisionSentence({
        actorName: "Claudia",
        programmeName: "AGI Strategy",
        decision: "pool",
        previous: "accept",
      }),
      "Claudia pooled an applicant for AGI Strategy. It was accepted before.",
    );
  });

  test("a revocation carries the reason the admin gave, and names no applicant", () => {
    assert.equal(
      audit.revocationSentence({
        actorName: "Zach",
        programmeName: "AGI Strategy",
        reason: "She has taken a place on the incubator instead.",
      }),
      "Zach revoked an applicant’s acceptance for AGI Strategy. Reason: She has taken a place on the incubator instead.",
    );
  });

  test("a name handed to either sentence anyway does not reach it", () => {
    // The signatures take no name. A caller that passes one all the same (a
    // spread of a wider object, say) must not find it in the sentence.
    const decision = audit.decisionSentence({
      actorName: "Claudia",
      applicantName: "Priya Shah",
      programmeName: "AGI Strategy",
      decision: "decline",
      previous: null,
    });
    const revocation = audit.revocationSentence({
      actorName: "Zach",
      applicantName: "Priya Shah",
      programmeName: "AGI Strategy",
      reason: "A mistake.",
    });
    for (const sentence of [decision, revocation]) {
      assert.ok(!sentence.includes("Priya") && !sentence.includes("Shah"), `"${sentence}" names the applicant`);
    }
  });

  test("whoever draws a line says who it was about from the account as it is now", () => {
    assert.equal(audit.subjectLabel("Priya Shah"), "Priya Shah");
    assert.equal(audit.subjectLabel("  Priya Shah  "), "Priya Shah");
    // No account any more: the id on the line leads nowhere, and the screen says so.
    for (const gone of [null, undefined, "", "   "]) {
      assert.equal(audit.subjectLabel(gone), "somebody whose account has been deleted");
    }
    assert.equal(audit.DELETED_ACCOUNT_LABEL, "somebody whose account has been deleted");
  });

  test("neither sentence uses a word an applicant must never read", async () => {
    const { WORDS_APPLICANTS_NEVER_SEE } = await loadTs(join("lib", "applications", "words.ts"));
    const sentences = ["accept", "pool", "decline"].map((decision) =>
      audit.decisionSentence({
        actorName: "Claudia",
        programmeName: "AGI Strategy",
        decision,
        previous: "decline",
      }),
    );
    for (const sentence of sentences) {
      for (const word of WORDS_APPLICANTS_NEVER_SEE) {
        assert.ok(!sentence.toLowerCase().includes(word), `"${sentence}" says "${word}"`);
      }
    }
  });

  test("the two kinds are the strings the log's readers look for", () => {
    assert.equal(audit.DECISION_AUDIT_KIND, "application-decision");
    assert.equal(audit.REVOCATION_AUDIT_KIND, "application-decision-revoked");
  });
});
