/**
 * THIS TERM IN NUMBERS, THE PAGE (board sv-term): Run NAISI › Surveys › This
 * term in numbers, through the real page over `tests/lib/termWorld.mjs`, as
 * every kind of caller: an admin, SU-recognised committee, the events'
 * organiser, a programme's lead, a member, a view-as session and somebody
 * signed out. The board's words and numbers for an admin; for everybody else
 * the dashboard; and nothing about a person anywhere in the page. The counting
 * is `surveys-term-numbers`; the file is `surveys-term-numbers-file`.
 *
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AFTER, EV, ROUND, checkInDoc, eventDoc, makeTermWorld } from "./lib/termWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const w = await makeTermWorld("__termNumbersPage");

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = AFTER) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

/** Everybody but an admin, and how a failure names them. */
const NOT_ADMINS = [
  ["sue", "SU-recognised committee"],
  ["iris", "the events' organiser, committee the SU does not recognise"],
  ["claudia", "AGI Strategy's lead, SU-recognised committee"],
  ["amara", "a member who came to the events and took part"],
];

/** Words and ids of people in the world: none may reach the page or its HTML. */
const ABOUT_PEOPLE = [
  "Amara", "Okafor", "Bea", "Lindqvist", "Gwen", "Price", "Dev Patel", "Mo Rahman", "Dan Fitzgerald", "Pat Ellis",
  "Tariq", "Rahul", "Sofia", "Wen", "Omar", "example.com", "Example.com", "vr-amara", "account:", "address:", "walk-in:",
];

function assertNamesNobody(text, where) {
  for (const bit of ABOUT_PEOPLE) assert.ok(!text.includes(bit), `${where} holds "${bit}"`);
  for (const uid of ["amara", "bea", "gwen", "dev", "tariq", "rahul", "sofia", "wen", "omar", "zach", "iris"]) {
    assert.ok(!new RegExp(`\\b${uid}\\b`).test(text), `${where} holds the account id "${uid}"`);
  }
}

describe("the page, for an admin", () => {
  test("the term at a glance, in the board's words, from the records, and nothing written", async (t) => {
    clock(t);
    w.reset();
    const before = w.everything();
    const page = await w.view("zach");
    assert.equal(page.to, null);
    assert.equal(w.everything(), before, "the page wrote something");
    const { text, html } = page;
    assert.ok(text.startsWith("Surveys This term in numbers Autumn 2026 · 7 events and 2 programmes Download totals (CSV)"), text.slice(0, 160));
    assert.ok(html.includes('<a href="/admin/surveys">Surveys</a>'), "the way back to the list");
    assert.match(html, /<a href="\/api\/surveys\/term\/totals" download="" class="download">/, "the download is an ordinary link to the file, which works before any script arrives");
    // The VR night's record whose names came off is counted, as its Check-in tab counts it.
    assert.ok(
      text.includes(
        "13 Check-ins At 3 events 9 Different people Walk-ins without an account can’t be matched across events, so the 9 may count one walk-in twice, and the 4 may miss some. 4 Came to 2 or more Of the 9 different people",
      ),
    );
    assert.ok(text.includes("Events 7 this term Date Event Came Survey answers How was it? Average out of 5 Note"));
    for (const line of [
      "Wed 14 Oct Board games and pizza Not counted No survey Before check-in",
      "Fri 16 Oct Movie night: WarGames Not counted No survey Before check-in",
      "Sun 1 Nov VR games night 7 3 4.5",
      "Thu 5 Nov AI policy careers panel 4 Not sent yet",
      "Thu 12 Nov How do you test an AI model? 2 No survey No sign-up: checked in by QR and at the door",
      "Thu 19 Nov Pizza and board games Not counted No survey No check-in",
      "Wed 25 Nov Movie night: Ex Machina Not counted No survey No sign-up and no check-in",
    ]) {
      assert.ok(text.includes(line), `the events table lacks "${line}"`);
    }
    for (const gone of ["A draft", "Called off", "Freshers social", "Winter social"]) assert.ok(!text.includes(gone), `${gone} is not this term's`);
    assert.ok(text.includes("Programmes 2 this term"));
    assert.ok(text.includes("Programme Started Finished Answered both Considering, planning or already doing it After survey"));
    assert.ok(text.includes("Technical AI Safety Fellowship 2 Not yet In February, after week 10"));
    assert.ok(text.includes("AGI Strategy Fellowship 6 4 3 1 → 2 of 3 Closed Wed 9 Dec: 5 of 6"));
    assert.ok(!text.includes("Research Incubator"), "a programme that names no run is no programme of the term");
    assert.ok(text.includes("Considering, planning or already doing it: at the start → at the end, of the people who answered both surveys."));
    // As drawn: "Not yet" across Finished, Answered both and Considering; "No survey" across both survey columns.
    assert.match(html, /<td colspan="3" data-label="Finished"><span class="muted">Not yet<\/span><\/td>/i);
    assert.match(html, /<td colspan="2" data-label="Survey answers"><span class="muted">No survey<\/span><\/td>/i);
    // Each table is named by its heading; each row by its event or programme.
    assert.match(html, /<table class="table" aria-labelledby="term-events">/);
    assert.match(html, /<th scope="row">VR games night<\/th>/);
    assert.match(html, /<th scope="row">AGI Strategy Fellowship<\/th>/);
  });

  test("nothing about a person reaches the page: no name, account id, address or answer's words", async (t) => {
    clock(t);
    w.reset();
    const { html } = await w.view("zach");
    assertNamesNobody(html, "the page");
  });

  test("with no form opened, there is no term, the page says so, and there is no file to download", async (t) => {
    clock(t);
    const seed = w.seed();
    seed[`admissionRounds/${ROUND}`] = { ...seed[`admissionRounds/${ROUND}`], opensAt: new Date("2027-01-04T09:00:00Z"), decisionsSentAt: null };
    w.reset(seed);
    const { text, html } = await w.view("zach");
    assert.equal(text, "Surveys This term in numbers There’s no term to count yet. A term starts when its application form opens.");
    assert.ok(!html.includes("/api/surveys/term/totals"));
  });

  test("an event with nobody counted after check-in was used elsewhere reads as such; a check-in before the term means none of its events came before check-in", async (t) => {
    clock(t);
    w.reset(
      w.seed({
        "events/old-social__ev000099": eventDoc("An old social", "2026-05-01T18:00:00Z", "2026-05-01T21:00:00Z"),
        "eventCheckIns/old-1": checkInDoc("old-social__ev000099", "2026-05-01T18:30:00Z", { kind: "walk-in", name: "Someone" }),
      }),
    );
    const { text } = await w.view("zach");
    assert.ok(text.includes("Wed 14 Oct Board games and pizza Not counted No survey No check-in"));
    assert.ok(text.includes("Fri 16 Oct Movie night: WarGames Not counted No survey No sign-up and no check-in"));
    assert.ok(!text.includes("Before check-in"));
    assert.ok(!text.includes("An old social"), "an event before the term's form opened is not the term's");
  });

  test("with nobody checked in at any of the term's events, no numbers are made up: a line says so", async (t) => {
    clock(t);
    const seed = w.seed();
    for (const path of Object.keys(seed)) if (path.startsWith("eventCheckIns/")) delete seed[path];
    w.reset(seed);
    const { text } = await w.view("zach");
    assert.ok(text.includes("Nobody has been checked in at this term’s events yet, so there is nobody to count."));
    assert.ok(!text.includes("Check-ins At"));
    assert.ok(text.includes("Sun 1 Nov VR games night Not counted 3 4.5 Before check-in"));
  });

  test("when only one event had walk-ins with no account, they cannot have been counted twice, and the sentence is not shown", async (t) => {
    clock(t);
    const seed = w.seed();
    delete seed["eventCheckIns/panel-mo"];
    delete seed["eventCheckIns/talk-pat"];
    w.reset(seed);
    const { text } = await w.view("zach");
    assert.ok(text.includes("11 Check-ins At 3 events 7 Different people 4 Came to 2 or more Of the 7 different people"));
    assert.ok(!text.includes("can’t be matched"));
  });

  test("a check-in whose names have come off is counted at its own event, and is no walk-in: the sentence stays the walk-ins' alone", async (t) => {
    clock(t);
    const seed = w.seed();
    // Dan, at the VR night, is the only walk-in with no account; the record
    // whose names came off is at the careers panel.
    delete seed["eventCheckIns/panel-mo"];
    delete seed["eventCheckIns/talk-pat"];
    seed["eventCheckIns/vr-gone"] = { ...seed["eventCheckIns/vr-gone"], eventId: EV.panel };
    w.reset(seed);
    const { text } = await w.view("zach");
    assert.ok(text.includes("11 Check-ins At 3 events 7 Different people 4 Came to 2 or more Of the 7 different people"), text);
    assert.ok(text.includes("Sun 1 Nov VR games night 6 3 4.5"));
    assert.ok(text.includes("Thu 5 Nov AI policy careers panel 4 Not sent yet"));
    assert.ok(!text.includes("can’t be matched"), "the walk-ins' sentence shows for a record that is not a walk-in's");
  });
});

describe("the page, for everybody else", () => {
  test("committee, the events' organiser, a programme's lead, a member, a view-as session and signed out are sent to the dashboard", async (t) => {
    clock(t);
    w.reset();
    for (const [who, what] of NOT_ADMINS) {
      const reads = w.world.db.stats.reads;
      const page = await w.view(who);
      assert.equal(page.to, "/dashboard", what);
      assert.equal(w.world.db.stats.reads, reads, `${what}: the page read something before sending them away`);
    }
    assert.equal((await w.view(null)).to, "/dashboard", "somebody signed out");
    w.world.viewAs = true;
    try {
      assert.equal((await w.view("amara")).to, "/dashboard", "a view-as session is the member's");
    } finally {
      w.world.viewAs = false;
    }
  });

  test("the page sits in the admin-only tree, whose layout is the first gate", () => {
    const layout = readFileSync(join(REPO_ROOT, "src", "app", "(app)", "admin", "(admin-only)", "layout.tsx"), "utf8");
    assert.match(layout, /await requireAdminPage\(\);/);
  });
});

describe("the way in", () => {
  test("Run NAISI › Surveys leads here, as sv-list draws it", async (t) => {
    clock(t);
    w.reset();
    const list = await w.page(w.pages.list, {}, "zach");
    assert.match(list.html, /<a href="\/admin\/surveys\/term" class="linkButtonGhost">This term in numbers<\/a>/);
  });
});
