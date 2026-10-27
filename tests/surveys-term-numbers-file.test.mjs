/**
 * THIS TERM IN NUMBERS, THE FILE ("Download totals (CSV)", board sv-term):
 * `GET /api/surveys/term/totals`, through the real route over
 * `tests/lib/termWorld.mjs`, as every kind of caller. An admin gets the
 * page's numbers as a spreadsheet, naming nobody; everybody else is refused
 * before anything is read. It is not a download the site records: it names
 * nobody, as the Kairos report of totals names nobody and is not recorded,
 * and the record (`dataExports`) is for files of named people.
 *
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AFTER, ROUND, makeTermWorld } from "./lib/termWorld.mjs";

const w = await makeTermWorld("__termNumbersFile");
const route = await w.loadTs(join("app", "api", "surveys", "term", "totals", "route.ts"));
const model = await w.loadTs(join("lib", "surveys", "term", "model.ts"));
const { termTotalsCsv, termTotalsFilename } = await w.loadTs(join("lib", "surveys", "term", "totals.ts"));

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = AFTER) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const NOT_ADMINS = [
  ["sue", "SU-recognised committee"],
  ["iris", "the events' organiser, committee the SU does not recognise"],
  ["claudia", "AGI Strategy's lead, SU-recognised committee"],
  ["amara", "a member who came to the events and took part"],
];

/** Words and ids of people in the world: none may reach the file. */
const ABOUT_PEOPLE = [
  "Amara", "Okafor", "Bea", "Lindqvist", "Gwen", "Price", "Dev Patel", "Mo Rahman", "Dan Fitzgerald", "Pat Ellis",
  "Tariq", "Rahul", "Sofia", "Wen", "Omar", "example.com", "Example.com", "account:", "address:", "walk-in:",
];

/** The route's raw answer as `who`: a file, or a refusal. */
async function totalsAs(who, { viewAs = false } = {}) {
  w.world.user = w.sessionOf(who);
  w.world.viewAs = viewAs;
  try {
    const response = await route.GET(new Request("https://naisi.invalid/api/surveys/term/totals"));
    if (response instanceof Response) {
      return { status: response.status, text: await response.text(), headers: Object.fromEntries(response.headers) };
    }
    return { status: response.status, body: response.body };
  } finally {
    w.world.viewAs = false;
  }
}

describe("Download totals (CSV)", () => {
  test("an admin gets the page's numbers as a file, naming nobody, and nothing is written or recorded", async (t) => {
    clock(t);
    w.reset();
    const before = w.everything();
    const file = await totalsAs("zach");
    assert.equal(file.status, 200);
    assert.equal(w.everything(), before, "the file wrote something, a record of the download included");
    assert.deepEqual(
      w.world.db.paths().filter((path) => path.startsWith("dataExports/")),
      [],
      "a file that names nobody is not a download the site records",
    );
    assert.equal(file.headers["content-type"], "text/csv; charset=utf-8");
    assert.equal(file.headers["content-disposition"], 'attachment; filename="this-term-in-numbers-autumn-2026-2026-12-10.csv"');
    assert.equal(file.headers["cache-control"], "no-store");
    assert.equal(
      file.text,
      [
        "Term,Events,Programmes,Check-ins,At events,Different people,Came to 2 or more,Note",
        // The VR night's record whose names came off is counted, as its Check-in tab counts it.
        'Autumn 2026,7,2,13,3,9,4,"Walk-ins without an account can’t be matched across events, so the 9 may count one walk-in twice, and the 4 may miss some."',
        "",
        "Date,Event,Came,Survey answers,How was it? Average out of 5,Note",
        "Wed 14 Oct,Board games and pizza,Not counted,No survey,,Before check-in",
        "Fri 16 Oct,Movie night: WarGames,Not counted,No survey,,Before check-in",
        "Sun 1 Nov,VR games night,7,3,4.5,",
        "Thu 5 Nov,AI policy careers panel,4,Not sent yet,,",
        "Thu 12 Nov,How do you test an AI model?,2,No survey,,No sign-up: checked in by QR and at the door",
        "Thu 19 Nov,Pizza and board games,Not counted,No survey,,No check-in",
        "Wed 25 Nov,Movie night: Ex Machina,Not counted,No survey,,No sign-up and no check-in",
        "",
        'Programme,Started,Finished,Answered both,"Considering, planning or already doing it: at the start","Considering, planning or already doing it: at the end",After survey',
        'Technical AI Safety Fellowship,2,Not yet,,,,"In February, after week 10"',
        "AGI Strategy Fellowship,6,4,3,1,2,Closed Wed 9 Dec: 5 of 6",
        '"Considering, planning or already doing it: at the start → at the end, of the people who answered both surveys."',
        "",
      ].join("\n"),
    );
    for (const bit of ABOUT_PEOPLE) assert.ok(!file.text.includes(bit), `the file holds "${bit}"`);
  });

  test("the file is the page's own view: every number the page shows, and no other", async (t) => {
    clock(t);
    w.reset();
    const { text } = await w.view("zach");
    const file = await totalsAs("zach");
    const numbers = file.text
      .split(/[\n,]/)
      .map((cell) => cell.replace(/^"|"$/g, ""))
      .filter((cell) => /^\d+(?:\.\d)?$/.test(cell));
    assert.equal(numbers.length, 17, "six in the term's row, five in the events', six in the programmes'");
    for (const cell of numbers) assert.ok(text.includes(cell), `the file holds ${cell}, which the page does not`);
    const { view } = await w.load("zach");
    assert.equal(file.text, termTotalsCsv(view), "the route hands over the loader's view, as the page draws it");
  });

  test("everybody but an admin is refused before anything is read; signed out is told to sign in; a view-as session is the member's", async (t) => {
    clock(t);
    w.reset();
    for (const [who, what] of NOT_ADMINS) {
      const reads = w.world.db.stats.reads;
      const refused = await totalsAs(who);
      assert.deepEqual([refused.status, refused.body], [403, { error: "Only an admin can do this with a survey." }], what);
      assert.equal(w.world.db.stats.reads, reads, `${what}: something was read before the refusal`);
    }
    assert.deepEqual(await totalsAs(null), { status: 401, body: { error: "Sign in to do this." } });
    assert.equal((await totalsAs("amara", { viewAs: true })).status, 403);
  });

  test("with no term, a sentence and no file", async (t) => {
    clock(t);
    const seed = w.seed();
    seed[`admissionRounds/${ROUND}`] = { ...seed[`admissionRounds/${ROUND}`], archived: true };
    w.reset(seed);
    assert.deepEqual(await totalsAs("zach"), { status: 404, body: { error: "There’s no term to count yet. A term starts when its application form opens." } });
  });

  test("a title typed into an event cannot be read as a formula, and the file is named from the term", () => {
    const view = model.buildTermView({
      label: "Autumn 2026",
      events: [{ title: "=HYPERLINK(1)", startAt: new Date("2026-11-01T14:00:00Z"), endsAt: new Date("2026-11-01T17:00:00Z"), noSignup: false, counted: [], survey: null }],
      checkInSince: null,
      programmes: [],
    });
    const file = termTotalsCsv(view);
    assert.ok(file.includes("\t=HYPERLINK(1)"));
    assert.ok(file.includes('Autumn 2026,1,0,,,,,"Nobody has been checked in at this term’s events yet, so there is nobody to count."'));
    assert.equal(termTotalsFilename("Spring 2027: incubator", "2027-03-01"), "this-term-in-numbers-spring-2027-incubator-2027-03-01.csv");
    assert.equal(termTotalsFilename("", "2027-03-01"), "this-term-in-numbers-2027-03-01.csv");
  });
});
