/**
 * A programme's People in groups, restyled (board st-groups), and Publish's
 * own page behind its "Publish groups…", as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/groups           People in groups
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/publish   Publish
 *   src/lib/applications/handover/peopleInGroups.ts, src/features/applications/groups/
 *
 * ## What this guards
 *
 *  1. WHO: the programme's lead and admins are drawn the board; a reviewer is
 *     told the tab is theirs, having had only the form read; another
 *     programme's lead is told there is no programme here; the run's track
 *     lead, a facilitator, a member and somebody signed out are sent away by
 *     the tree's gate. Nothing is written by opening either page.
 *  2. THE VIEW, FIELD BY FIELD: who holds a place, each degree line and
 *     "Coming", who is invited (a freed place's offer named by its group, as
 *     the viewer may see it) and who gave their place back with their reason
 *     or the day they left: the People tab's own answers. No address, no
 *     painted week and no answer to a question.
 *  3. THE BOARD'S WORDS in every state a card and a column can be in: To
 *     place first, each group's "7 of 8" or "Full", its time and room or "No
 *     room yet", its facilitators; a card's degree line, "Hasn’t said when
 *     they’re free", "Fits A, B", "Fits none of the 2 times", "Not free Mon
 *     6pm", "Coming", "Gave their place back"; "Invited [day] · fits A" in the
 *     column its offer named or in To place; the list of who gave their
 *     place back; the line over the board; "N still to place" with "Publish
 *     groups…"; and the note under it before Publish and after.
 *  4. ONE ANSWER, MANY READERS: the line, the number beside Publish and the
 *     People tab's count are one function's (`placingCounts`) over the same
 *     records, and Publish's own refusal names exactly the people still to
 *     place on the run's list.
 *  5. PUBLISH'S OWN PAGE: the lead and admins are drawn Publish as the board
 *     drew it, under "Publish AGI Strategy’s groups", with the way back.
 *
 * Real: both pages, the tree's gate, the loaders and every library under
 * them, the board and its words, and #67's hand-over, board, allocate,
 * reply and Publish routes, which make the world the pages are drawn in.
 * Faked: see `tests/lib/handoverWorld.mjs`; and the board's data hook,
 * which hands the board the allocation route's own answer to the caller.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, GROUP, ROUND, RUN, applicationPath, loadJoin, makeWorld, namedSeed } from "./lib/handoverWorld.mjs";

const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const HANDLE = 'globalThis["__hubPeopleInGroups"]';
const SESSION = `export async function getCurrentUser() { return ${HANDLE}.user; }`;
const STYLESHEETS = [
  "./PeopleInGroups.module.css",
  "./PublishGroups.module.css",
  // Publish's own page draws its readiness check (Get ready for week 1's) above the buttons.
  "@/features/applications/groups/PublishGroups.module.css",
  "./ProgrammeOverview.module.css",
  "./GroupsViews.module.css",
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./Dropdown.module.css",
  "./InitialsChip.module.css",
  "./ActionToast.module.css",
  "./AllocationPublish.module.css",
  "./Button.module.css",
  "./Refusals.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  // Publish's page: Outside the times they gave, its text box and its week chart.
  "./OutsideNotes.module.css",
  "@/features/applications/decisionDay/decisionDay.module.css",
  "./WeekChart.module.css",
  "./Input.module.css",
];

const made = makeWorld("__hubPeopleInGroups", [
  ["./session", SESSION],
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }\n" +
      "export function useSelectedLayoutSegment() { return 'groups'; }",
  ],
  [
    "next/link",
    `export default ({ href, className, children, ...rest }) => ${HANDLE}.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);`,
  ],
  // The initials on a card are drawn for the eye and hidden from a reader: a
  // silent stand-in, so the words read here are the words a reader hears.
  ["@/components/ui/InitialsChip", `export default ({ name }) => ${HANDLE}.h('span', { 'aria-hidden': 'true', 'data-initials': name });`],
  // The board's data: the allocation route's own answer to the caller, read
  // by the suite through the route and handed in.
  [
    "@/features/courses/useAllocation",
    "export function useAllocation() {\n" +
      `  return { data: ${HANDLE}.board, loading: false, error: null, reload() {}, place: async () => ({ ok: true, placed: 1, rejected: [] }),\n` +
      "    publishAllocation: async () => ({ ok: true }), sendPublishTest: async () => ({ ok: true }),\n" +
      "    removeEnrolment: async () => ({ ok: true }) };\n" +
      "}",
  ],
  ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
]);
const { world, reset, call, everything } = made;
world.h = createElement;
world.board = null;
const { press, place, reply, publish, board, routes } = await loadJoin(made);

const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: PeoplePage } = await made.loadTs(join(TABS, "groups", "page.tsx"));
const { default: PublishPage } = await made.loadTs(join(TABS, "groups", "publish", "page.tsx"));
const { loadPeopleInGroups } = await made.lib("applications", "handover", "peopleInGroups.ts");
const { countPlaceHolders, loadProgrammePeople } = await made.lib("applications", "people", "load.ts");
const { loadForm } = await made.lib("applications", "repo.ts");
const { placingCounts } = await made.loadTs(join("features", "courses", "allocationTally.ts"));
const words = await made.loadTs(join("features", "applications", "groups", "peopleInGroupsWords.ts"));
const getReadyWords = await made.loadTs(join("lib", "courses", "getReady", "words.ts"));

const PAGE_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;
const A = GROUP.monday;
const B = GROUP.thursday;
const C = GROUP.unset;

/** The session `getCurrentUser()` builds, with the reviewer flag the roles writer keeps. */
function sessionFor(uid) {
  const base = made.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Every element below `element` whose component is called `name`. */
function find(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) find(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element);
  for (const value of Object.values(element.props ?? {})) find(value, name, out);
  return out;
}

/** A page as `who` opens it: the element, its markup, what it read, where it sent them, whether it wrote. */
async function open(Page, who) {
  world.user = who === null ? null : sessionFor(who);
  const reads = [];
  const collection = world.db.collection;
  world.db.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  const before = everything();
  let element;
  try {
    element = await Page({ params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) });
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { element: null, html: "", text: "", reads, to: err.to, wrote: everything() !== before };
  } finally {
    world.db.collection = collection;
  }
  // The board draws the allocation route's answer to the same caller, read
  // after the page's own reads are counted.
  try {
    world.board = who ? (await board(who)).body : null;
    const html = renderToStaticMarkup(element);
    return { element, html, text: text(html), reads, to: null, wrote: everything() !== before };
  } finally {
    world.board = null;
  }
}

/** The view People in groups is drawn from, as `who`. */
async function viewFor(who) {
  const outcome = await loadPeopleInGroups(world.db, sessionFor(who), ROUND, AGI);
  assert.equal(outcome.status, "ok", JSON.stringify(outcome));
  return outcome.view;
}

/** The board's one count, over the allocation route's answer to `who`, as the board asks it. */
async function countsFor(who) {
  const shown = (await board(who)).body;
  const columns = new Set(shown.groups.map((group) => group.id));
  const view = await viewFor(who);
  return placingCounts(shown.people, (row) => !row.groupId || !columns.has(row.groupId), {
    holders: view.holders,
    invited: view.invited.length,
  });
}

/**
 * The term the board is drawn in: AGI Strategy's groups named Group A to C,
 * Group A on Mondays at 6pm in Room B12 for one person, Group B on Thursdays
 * at 10am in Room A3 with Nell facilitating, Group C with no time and no
 * room. Amara (free Monday evenings and Thursday mornings) and Dev (Monday
 * evenings only) are placed, Dev in Group B, which he cannot make; Bea
 * (nothing painted) and Tariq (half of Monday) are still to place. Amara has
 * said she is coming. Omar was offered a freed place in Group A on Mon 26
 * Oct. Ines was invited on decision day and has not answered. Nina gave her
 * place back before the hand-over.
 */
async function termOnTheBoard() {
  world.db.poke(`courseGroups/${A}`, { name: "Group A", capacity: 1 });
  world.db.poke(`courseGroups/${B}`, { name: "Group B", facilitatorUids: ["nobody"] });
  world.db.poke(`courseGroups/${C}`, { name: "Group C", facilitatorUids: [] });
  const handed = await press("zach");
  assert.equal(handed.status, 200, JSON.stringify(handed.body));
  const placed = await place("zach", [
    { uid: "amara", groupId: A },
    { uid: "dev", groupId: B },
  ]);
  assert.equal(placed.body.placed, 2, JSON.stringify(placed.body));
  assert.equal((await reply("amara", { reply: "coming" })).status, 200);
  world.db.poke(applicationPath("omar"), {
    status: "invited",
    invitation: { programmeId: AGI, replyBy: "2026-10-29", response: null, respondedAt: null, lastReminderOn: null },
    freedPlace: {
      groupId: A,
      offeredAt: new Date("2026-10-26T10:00:00Z"),
      email: "sent",
      emailedAt: new Date("2026-10-26T10:00:00Z"),
      emailClaimedAt: null,
    },
  });
}

/**
 * The suite's clock: the store's own day, moved on eleven minutes before
 * each case, so the reply route's limit on one person's replies (twelve in
 * ten minutes) starts again for every case, as it would for a person.
 */
const START = new Date("2026-10-24T10:00:00Z").getTime();
let tick = 0;
mock.timers.enable({ apis: ["Date"], now: START });

beforeEach(() => {
  tick += 1;
  mock.timers.setTime(START + tick * 11 * 60_000);
  reset(namedSeed());
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
});

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who opens People in groups and Publish", () => {
  for (const [Page, label] of [
    [PeoplePage, "People in groups"],
    [PublishPage, "Publish"],
  ]) {
    test(`${label}: the lead and an admin are drawn it; everybody else is answered without the run being read`, async () => {
      await termOnTheBoard();
      const said = {};
      for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "nobody", "amara", null]) {
        const drawn = await open(Page, who);
        assert.equal(drawn.wrote, false, `${who} wrote something by opening ${label}`);
        said[who ?? "signed out"] = drawn.to
          ? `sent to ${drawn.to}`
          : find(drawn.element, Page === PeoplePage ? "PeopleInGroups" : "PublishGroups").length === 1
            ? "drawn"
            : drawn.text.includes("Only the programme’s lead and admins can open Groups")
              ? "told it is the lead's"
              : drawn.text.includes("There is no programme here")
                ? "no programme here"
                : drawn.text;
        if (who === "lloyd") assert.deepEqual([...new Set(drawn.reads)], ["admissionRounds"], "the reviewer's page read more than the form");
      }
      assert.deepEqual(said, {
        zach: "drawn",
        claudia: "drawn",
        lloyd: "told it is the lead's",
        // Leads Technical AI Safety, and has no role on AGI Strategy.
        tess: "no programme here",
        // The run's track lead, Group B's facilitator, a member placed on the
        // run and somebody signed out: the admissions tree's gate.
        yusuf: "sent to /dashboard",
        nobody: "sent to /dashboard",
        amara: "sent to /dashboard",
        "signed out": "sent to /dashboard",
      });
    });
  }

  test("a programme with no run, and a run being destroyed, say so in place of the board", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    const gone = await open(PeoplePage, "claudia");
    assert.equal(find(gone.element, "PeopleInGroups").length, 0);
    assert.match(gone.text, /The course run AGI Strategy names is no longer on the site\. An admin names another/);
  });
});

// ---------------------------------------------------------------------------
// 2. The view
// ---------------------------------------------------------------------------

describe("2. the view is the People tab's answers, field by field", () => {
  test("holders, cards, invitations and places given back, as the lead and as an admin", async () => {
    await termOnTheBoard();
    const lead = await viewFor("claudia");
    assert.deepEqual(Object.keys(lead).sort(), [
      "blank",
      "gaveBack",
      "holders",
      "invited",
      "people",
      "pitchingWeek",
      "programmeId",
      "programmeName",
      "roundId",
      "run",
      "sent",
      "viewer",
    ]);
    assert.deepEqual([...lead.holders].sort(), ["amara", "bea", "dev", "tariq"]);
    assert.deepEqual(lead.people.amara, { name: "Amara Okafor", detail: "BSc Mathematics · Graduating 2028", coming: true });
    assert.equal(lead.people.dev.coming, false);
    // Omar ranked AGI Strategy and was offered a freed place in Group A.
    assert.deepEqual(lead.invited, [{ uid: "omar", name: "Omar Haddad", on: "Mon 26 Oct", groupId: A, fits: ["A"] }]);
    assert.deepEqual(lead.gaveBack, [{ uid: "nina", name: "Nina Petrova", line: "The times don’t work for me" }]);

    // Ines was invited here on decision day and did not rank it: an admin's to see, not the lead's.
    const admin = await viewFor("zach");
    assert.deepEqual(
      admin.invited.map((person) => [person.uid, person.on, person.groupId, person.fits]),
      [
        ["ines", "Fri 23 Oct", null, ["A"]],
        ["omar", "Mon 26 Oct", A, ["A"]],
      ],
    );
    assert.ok(!("ines" in lead.people), "the lead was handed an invitation to somebody who did not rank the programme");
  });

  test("no address, no painted week and no answer reaches the board", async () => {
    await termOnTheBoard();
    for (const who of ["claudia", "zach"]) {
      const wire = JSON.stringify(await viewFor(who));
      assert.ok(!wire.includes("@"), `an address reached the board as ${who}`);
      assert.doesNotMatch(wire, /[0-9a-f]{12}/, `a painted week reached the board as ${who}`);
      for (const answer of ["I keep changing my mind", "The EU code of practice", "which arguments survive"]) {
        assert.ok(!wire.includes(answer), `an answer reached the board as ${who}`);
      }
    }
  });

  test("before decisions go out nobody is read, and the line says nobody holds a place", async () => {
    reset(namedSeed({ sent: false }));
    world.db.poke("users/claudia", { admissionsReviewer: true });
    const view = await viewFor("claudia");
    assert.deepEqual([view.sent, view.holders, view.invited, view.gaveBack, view.people], [false, [], [], [], {}]);
    const drawn = await open(PeoplePage, "claudia");
    assert.ok(drawn.text.includes(words.NOBODY_YET), drawn.text);
  });

  test("somebody taken off the run is listed with the day, in People's words, and their card leaves the board", async () => {
    await termOnTheBoard();
    // The lead takes Dev off the run: Remove gives the place on the form back.
    const removed = await call("claudia", routes.remove.POST, { runId: RUN.agi, uid: "dev" }, { course: true });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    const lead = await viewFor("claudia");
    const dev = lead.gaveBack.find((person) => person.uid === "dev");
    assert.match(dev?.line ?? "", /^Taken off the programme on [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/);
    assert.ok(!lead.holders.includes("dev"));
    const { text: said } = await open(PeoplePage, "claudia");
    assert.match(said, /3 holding a place · 1 in a group · 2 to place · 1 invited/);
    assert.match(said, /Group B 0 of 8 Thu 10am · Room A3 Nell Nobody here yet/);
    assert.match(said, /Gave their place back \(2\) Dev Patel · Taken off the programme on/);
  });
});

// ---------------------------------------------------------------------------
// 3. The board's words
// ---------------------------------------------------------------------------

describe("3. the board says what the records say, in the board's words", () => {
  test("the line, the publish line, To place, each group and each card, before Publish", async () => {
    await termOnTheBoard();
    const { text: said, html } = await open(PeoplePage, "claudia");
    // The publish line beside the views, and the line over the board.
    assert.match(said, /Facilitators 2 still to place Publish groups… 4 holding a place · 2 in a group · 2 to place · 1 invited/);
    assert.match(html, new RegExp(`<a href="${PAGE_PATH}/groups/publish" class="btn publishLink">Publish groups…</a>`));
    // To place: Bea and Tariq, with what each card says.
    assert.match(
      said,
      /To place 2 Bea Lindqvist BSc Mathematics · Graduating 2028 Hasn’t said when they’re free Tariq Mensah BSc Mathematics · Graduating 2028 Fits none of the 2 times/,
    );
    // Group A: full at one place, its time, room and facilitator, Amara coming, and Omar's offer.
    assert.match(
      said,
      /Group A Full 1 of 1 Mon 6pm · Room B12 Claudia Amara Okafor BSc Mathematics · Graduating 2028 Fits A, B Coming Omar Haddad Invited Mon 26 Oct · fits A/,
    );
    // Group B: Dev cannot make Thursday mornings; Nell facilitates.
    assert.match(said, /Group B 1 of 8 Thu 10am · Room A3 Nell Dev Patel BSc Mathematics · Graduating 2028 Not free Thu 10am Fits A/);
    // Group C: no time, no room, no facilitator, nobody in it. It sits where
    // its stored day puts it, Monday first, as every tab lists groups.
    assert.match(
      said,
      new RegExp(`fits A Group C 0 of 8 ${words.NO_TIME_YET} · ${words.NO_ROOM_YET} ${words.NO_FACILITATOR_YET} ${words.EMPTY_GROUP} Group B`),
    );
    // Who gave their place back, and the note under the board.
    assert.match(said, /Gave their place back \(1\) Nina Petrova · The times don’t work for me/);
    assert.ok(said.endsWith(words.BEFORE_PUBLISH), said.slice(-200));
    // Each card's menu, named as the board names it.
    assert.deepEqual(
      [...html.matchAll(/aria-label="(Move [^"]+ to another group)"/g)].map((m) => m[1]),
      ["Move Bea Lindqvist to another group", "Move Tariq Mensah to another group", "Move Amara Okafor to another group", "Move Dev Patel to another group"],
    );
    // Somebody sitting where they cannot be is outlined.
    assert.equal([...html.matchAll(/class="card cardWarn/g)].length, 1);
    // A column per group, To place first, each a region named for it.
    assert.deepEqual(
      [...html.matchAll(/<section aria-label="([^"]+)"/g)].map((m) => m[1]),
      ["To place", "Group A", "Group C", "Group B"],
    );
  });

  test("an admin also sees an invitation the lead may not, in To place, and is counted it", async () => {
    await termOnTheBoard();
    const { text: said } = await open(PeoplePage, "zach");
    assert.match(said, /4 holding a place · 2 in a group · 2 to place · 2 invited/);
    assert.match(said, /Tariq Mensah BSc Mathematics · Graduating 2028 Fits none of the 2 times Ines Carvalho Invited Fri 23 Oct · fits A Group A/);
  });

  test("somebody placed who gives their place back keeps their card, says so, and is listed under the board", async () => {
    await termOnTheBoard();
    assert.equal((await reply("amara", { reply: "cant-make-it", reason: { kind: "too-much-on", other: "" } })).status, 200);
    const { text: said } = await open(PeoplePage, "claudia");
    assert.match(said, /Amara Okafor BSc Mathematics · Graduating 2028 Fits A, B Gave their place back/);
    assert.match(said, /3 holding a place · 1 in a group · 2 to place · 1 invited/);
    assert.match(said, /Gave their place back \(2\) Amara Okafor · I have too much on this term Nina Petrova · The times don’t work for me/);
  });

  test("somebody still to place who gives their place back leaves To place for the list under the board", async () => {
    await termOnTheBoard();
    assert.equal((await reply("tariq", { reply: "cant-make-it", reason: { kind: "times", other: "" } })).status, 200);
    const { text: said, html } = await open(PeoplePage, "claudia");
    assert.match(said, /1 still to place Publish groups… 3 holding a place · 2 in a group · 1 to place · 1 invited To place 1 Bea Lindqvist/);
    assert.ok(!html.includes("Move Tariq Mensah to another group"), "Tariq's card is still in To place");
    assert.match(said, /Gave their place back \(2\) Nina Petrova · The times don’t work for me Tariq Mensah · The times don’t work for me/);
    // Publish does not wait for Tariq either: one press, one answer.
    const refused = await publish("claudia");
    assert.deepEqual(refused.body.unplaced, ["Bea Lindqvist"]);
  });

  test("everybody placed: no number beside Publish groups…, and To place says so", async () => {
    await termOnTheBoard();
    world.db.poke(`courseGroups/${A}`, { capacity: 8 });
    await place("zach", [
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: A },
    ]);
    const { text: said } = await open(PeoplePage, "claudia");
    assert.match(said, /Facilitators Publish groups… 4 holding a place · 4 in a group · 0 to place · 1 invited To place 0 Everyone holding a place is in a group\./);
  });

  test("after Publish the note says what a move does now", async () => {
    await termOnTheBoard();
    world.db.poke(`courseGroups/${A}`, { capacity: 8 });
    await place("zach", [
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: A },
    ]);
    const pressed = await publish("zach");
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    const { text: said } = await open(PeoplePage, "claudia");
    assert.ok(said.endsWith(words.AFTER_PUBLISH), said.slice(-200));
  });
});

// ---------------------------------------------------------------------------
// 4. One answer
// ---------------------------------------------------------------------------

describe("4. the line, the number beside Publish and the People tab count with one function", () => {
  test("holding a place is the People tab's number, and still to place is who Publish waits for", async () => {
    await termOnTheBoard();
    for (const who of ["claudia", "zach"]) {
      const counts = await countsFor(who);
      const form = await loadForm(world.db, ROUND);
      assert.equal(counts.holding, await countPlaceHolders(world.db, form, AGI), who);
      const people = await loadProgrammePeople(world.db, sessionFor(who), ROUND, AGI);
      assert.equal(counts.holding, people.view.counts.coming + people.view.counts["havent-said"], who);
      assert.equal(counts.invited, people.view.counts.invited, who);
      // Publish refuses for exactly the people the line says are still to place.
      const refused = await publish(who);
      assert.equal(refused.status, 409, JSON.stringify(refused.body));
      assert.deepEqual([refused.body.unplaced.length, counts.toPlace, counts.notOnTheRun], [2, 2, 0], who);
      assert.deepEqual([...refused.body.unplaced].sort(), ["Bea Lindqvist", "Tariq Mensah"]);
    }
  });

  test("somebody who accepts a freed place is handed over by accepting, in no group, and Publish waits for them", async () => {
    await termOnTheBoard();
    const accepted = await reply("omar", { reply: "accept-invitation" });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    // On the run's list from the acceptance itself, so nobody is "not on the
    // run yet"; still to place, because accepting places nobody.
    const counts = await countsFor("claudia");
    assert.deepEqual(counts, { holding: 5, inAGroup: 2, toPlace: 3, notOnTheRun: 0, invited: 0 });
    const { text: said } = await open(PeoplePage, "zach");
    assert.match(said, /5 holding a place · 2 in a group · 3 to place · 1 invited/);
    assert.ok(!said.includes("not on the run yet"));
    const refused = await publish("zach");
    assert.deepEqual([...refused.body.unplaced].sort(), ["Bea Lindqvist", "Omar Haddad", "Tariq Mensah"]);
  });

  test("somebody who accepted while the run could not take people is named as not on the run yet", async () => {
    await termOnTheBoard();
    // The run cannot take anybody at the moment Omar accepts, so the
    // acceptance hands nobody over (handOverBlocker); the run is put right after.
    const status = world.db.read(`courseRuns/${RUN.agi}`).status;
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "draft" });
    const accepted = await reply("omar", { reply: "accept-invitation" });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    world.db.poke(`courseRuns/${RUN.agi}`, { status });
    const counts = await countsFor("claudia");
    assert.deepEqual(counts, { holding: 5, inAGroup: 2, toPlace: 3, notOnTheRun: 1, invited: 0 });
    const { text: said, html } = await open(PeoplePage, "zach");
    // An admin also sees Ines's invitation, which the lead may not.
    assert.match(said, /5 holding a place · 2 in a group · 3 to place · 1 invited · 1 not on the run yet/);
    assert.ok(said.includes(words.notOnTheRunWords(1, true)));
    assert.match(html, new RegExp(`<a href="${PAGE_PATH}/setup" class="noteLink">`));
    const lead = await open(PeoplePage, "claudia");
    assert.ok(lead.text.includes(words.notOnTheRunWords(1, false)));
    assert.ok(!lead.html.includes(`${PAGE_PATH}/setup`), "the lead was sent to the Settings tab's Course run panel");
    // Publish waits for the run's own list, and Omar is not on it yet.
    const refused = await publish("zach");
    assert.deepEqual([...refused.body.unplaced].sort(), ["Bea Lindqvist", "Tariq Mensah"]);
  });

  test("the function: a move counts the moment the card lands, a seat that left counts as nobody in a group", () => {
    const rows = [
      { uid: "a", enrolmentStatus: "active", groupId: "g1" },
      { uid: "b", enrolmentStatus: "none", groupId: null },
      { uid: "c", enrolmentStatus: "withdrawn", groupId: "g1" },
    ];
    const inPool = (row) => row.groupId === null;
    assert.deepEqual(placingCounts(rows, inPool, { holders: ["a", "b", "c", "d", "a"], invited: 3 }), {
      holding: 4,
      inAGroup: 1,
      toPlace: 3,
      notOnTheRun: 1,
      invited: 3,
    });
    // The board's own moves: b's card lands in g2 before the server answers.
    assert.equal(placingCounts(rows, (row) => row.uid !== "b" && inPool(row), { holders: ["a", "b"], invited: 0 }).inAGroup, 2);
  });
});

// ---------------------------------------------------------------------------
// 5. Publish's own page
// ---------------------------------------------------------------------------

describe("5. Publish's own page draws Publish as the board did, under its readiness check", () => {
  // The page is Get ready for week 1's Publish page (tests/course-hub-get-ready.test.mjs holds its
  // readiness check and its emails); here, that it is still the way back to People in groups and
  // the Publish area the board has always drawn, from the same summary.
  test("the way back, the heading, the readiness check, and the Publish area with its count and its test", async () => {
    await termOnTheBoard();
    world.db.poke(`courseGroups/${A}`, { capacity: 8 });
    await place("zach", [
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: A },
    ]);
    const { text: said, html, element } = await open(PublishPage, "claudia");
    assert.match(html, new RegExp(`<a href="${PAGE_PATH}/groups" class="back">`));
    assert.match(said, /^People in groups Publish AGI Strategy’s groups/);
    assert.equal(find(element, "PublishReadiness").length, 1, "the readiness check is drawn above the Publish area");
    const area = find(element, "PublishGroups");
    assert.equal(area.length, 1);
    // The run, and what can follow by itself, read on the server from the
    // scheduler's switches: next week's email off as it ships, so Group C's
    // missing room holds nothing yet, but it is named for when it is on.
    assert.deepEqual(area[0].props, {
      runId: RUN.agi,
      admin: false,
      follows: {
        paused: false,
        nextWeekEmail: { on: false, waitsForRoom: ["Group C"] },
        registerReminders: { on: false },
        placeConfirmations: null,
      },
    });
    assert.match(said, /Send a test to me/);
    assert.match(said, /Publish and send \d+ emails?/);
    assert.ok(said.includes(getReadyWords.AFTER_YOU_PUBLISH), "what publishing does next is said above the buttons");
  });
});

// ---------------------------------------------------------------------------
// 6. Each card's marks in every state, and its menu
// ---------------------------------------------------------------------------

const boardParts = await made.loadTs(join("features", "applications", "groups", "peopleInGroupsBoard.ts"));
const { default: Dropdown } = await made.loadTs(join("components", "ui", "Dropdown.tsx"));

/** A column as the allocation route sends it, with the head st-groups draws. */
const column = (id, name, tag, when, sessionLabel, over = {}) => ({
  id,
  name,
  capacity: 8,
  sessionLabel,
  facilitatorNames: [],
  facilitatorUids: [],
  facilitatorFirstNames: [],
  tag,
  when,
  room: "",
  memberCount: 0,
  paceStartDate: null,
  paceWeekPlan: null,
  forkedWeekIds: [],
  ...over,
});
const COLUMNS = [
  column("ga", "Group A", "A", "Mon 6pm", "Mondays 18:00 to 19:30"),
  column("gb", "Group B", "B", "Thu 10am", "Thursdays 10:00 to 11:30"),
  column("gc", "Group C", "C", "", ""),
];
/** A card as the allocation route sends it. */
const card = (over = {}) => ({
  uid: "p",
  displayName: "Pat Doe",
  paidMembership: null,
  availability: [],
  reviewerPreferredGroupId: null,
  reviewerPreferredFacilitatorName: null,
  reviewerNotes: null,
  groupId: null,
  enrolmentStatus: "none",
  allocatedEmailAt: null,
  allocatedEmailDelivery: null,
  fromForm: { availability: "given", canMakeGroupIds: ["ga", "gb"], holdsPlace: true },
  ...over,
});
const said = (row, group = null, coming = false) => {
  const { marks, warns } = boardParts.marksOf(row, group, COLUMNS, coming);
  return [marks.map((mark) => `${mark.words} (${mark.tone})`), warns];
};

describe("6. each card's marks in every state, and its menu", () => {
  test("when they are free, in To place and in a group", () => {
    assert.deepEqual(said(card()), [["Fits A, B (plain)"], false]);
    assert.deepEqual(said(card({ fromForm: { availability: "none-given", canMakeGroupIds: [], holdsPlace: true } })), [
      ["Hasn’t said when they’re free (warn)"],
      false,
    ]);
    assert.deepEqual(said(card({ fromForm: { availability: "given", canMakeGroupIds: [], holdsPlace: true } })), [
      ["Fits none of the 2 times (warn)"],
      false,
    ]);
    assert.deepEqual(said(card({ fromForm: { availability: "not-on-file", canMakeGroupIds: [], holdsPlace: true } })), [
      ["When they’re free is no longer on file (plain)"],
      false,
    ]);
    // In a group they can make, and in one they cannot: outlined, said first, and where they fit still said.
    assert.deepEqual(said(card({ groupId: "ga", enrolmentStatus: "active" }), COLUMNS[0]), [["Fits A, B (plain)"], false]);
    const onlyA = card({ groupId: "gb", enrolmentStatus: "active", fromForm: { availability: "given", canMakeGroupIds: ["ga"], holdsPlace: true } });
    assert.deepEqual(said(onlyA, COLUMNS[1]), [["Not free Thu 10am (warn)", "Fits A (plain)"], true]);
    const none = card({ groupId: "gb", enrolmentStatus: "active", fromForm: { availability: "given", canMakeGroupIds: [], holdsPlace: true } });
    assert.deepEqual(said(none, COLUMNS[1]), [["Not free Thu 10am (warn)"], true]);
    // A group with no time is nobody's to miss: not outlined, and the card still says they fit no time there is.
    assert.deepEqual(said(none, COLUMNS[2]), [["Fits none of the 2 times (warn)"], false]);
    // Somebody who applied to the run itself ticked its sessions.
    assert.deepEqual(said(card({ fromForm: null, availability: ["Thursdays 10:00 to 11:30"] })), [["Fits B (plain)"], false]);
  });

  test("Coming, a place given back, facilitating, and an email that did not go", () => {
    assert.deepEqual(said(card(), null, true), [["Fits A, B (plain)", "Coming (ok)"], false]);
    const gaveBack = card({ groupId: "ga", enrolmentStatus: "active", fromForm: { availability: "given", canMakeGroupIds: ["ga"], holdsPlace: false } });
    assert.deepEqual(said(gaveBack, COLUMNS[0]), [["Fits A (plain)", "Gave their place back (warn)"], false]);
    // Put back on the run after leaving: not a place given back.
    assert.deepEqual(said({ ...gaveBack, putBack: true }, COLUMNS[0]), [["Fits A (plain)"], false]);
    const facilitating = [{ ...COLUMNS[0], facilitatorUids: ["p"] }, COLUMNS[1], COLUMNS[2]];
    assert.deepEqual(boardParts.marksOf(card({ groupId: "ga" }), facilitating[0], facilitating, false).marks.map((m) => [m.words, m.tone]), [
      ["Fits A, B", "plain"],
      ["Facilitates Group A", "plain"],
    ]);
    assert.deepEqual(boardParts.marksOf(card({ groupId: "gb" }), facilitating[1], facilitating, false).marks.at(-1), {
      words: "Facilitates Group A",
      tone: "warn",
    });
    const held = card({ groupId: "ga", enrolmentStatus: "active", allocatedEmailAt: "2026-10-28T10:00:00Z", allocatedEmailDelivery: "held" });
    assert.deepEqual(said(held, COLUMNS[0])[0].at(-1), "Email held (warn)");
    const stopped = { ...held, allocatedEmailDelivery: "suppressed" };
    assert.deepEqual(said(stopped, COLUMNS[0])[0].at(-1), "Not emailed: do-not-email list (warn)");
    assert.deepEqual(said({ ...held, allocatedEmailDelivery: "sent" }, COLUMNS[0])[0], ["Fits A, B (plain)"]);
  });

  test("the menu: To place, each group with who sits there now, and taking an active seat off the run last", () => {
    const seated = (id) => ({ ga: 8, gb: 2, gc: 0 })[id];
    const uncapped = [COLUMNS[0], COLUMNS[1], { ...COLUMNS[2], capacity: null }];
    assert.deepEqual(boardParts.menuOptions({ enrolmentStatus: "active" }, uncapped, seated), [
      { value: boardParts.POOL, label: "To place" },
      { value: "ga", label: "Group A · 8 of 8" },
      { value: "gb", label: "Group B · 2 of 8" },
      { value: "gc", label: "Group C · 0" },
      { value: boardParts.TAKE_OFF, label: "Take off the run…" },
    ]);
    for (const status of ["none", "withdrawn", "removed"]) {
      assert.ok(
        !boardParts.menuOptions({ enrolmentStatus: status }, uncapped, seated).some((option) => option.value === boardParts.TAKE_OFF),
        status,
      );
    }
    // A move the allocate route refuses is said in a sentence, from its reason's code.
    assert.equal(words.notMovedWords("Pat Doe", "Group A", "group-full"), "Pat Doe wasn’t moved: Group A is full.");
    assert.equal(words.notMovedWords("Pat Doe", "Group A", "group-archived"), "Pat Doe wasn’t moved: Group A has been archived.");
    assert.equal(
      words.notMovedWords("Pat Doe", "Group A", "facilitates-another-group"),
      "Pat Doe wasn’t moved: they facilitate another group, and somebody holding a place sits in the group they facilitate.",
    );
    assert.equal(words.notMovedWords("Pat Doe", "Group A", "anything else"), "Pat Doe wasn’t moved: the move was refused. Try again.");
    assert.equal(
      words.takeOffConfirm("Pat Doe", "Group A", "AGI Strategy"),
      "Take Pat Doe off the run?\n\nTheir seat in Group A is freed and their place on AGI Strategy is given back. Nobody is emailed.",
    );
  });

  test("the menu's button is the board's three dots, named for the person, a listbox like #67's", () => {
    const html = renderToStaticMarkup(
      createElement(Dropdown, {
        value: "ga",
        onChange() {},
        options: boardParts.menuOptions({ enrolmentStatus: "active" }, COLUMNS, () => 1),
        ariaLabel: words.moveLabel("Pat Doe"),
        title: words.MOVE_TITLE,
        className: "menuTrigger",
        triggerIcon: createElement("svg", { "data-icon": "more" }),
      }),
    );
    assert.match(html, /<button [^>]*aria-label="Move Pat Doe to another group"[^>]*role="combobox"[^>]*aria-haspopup="listbox"/);
    assert.match(html, /title="Move to…"/);
    assert.match(html, /<svg data-icon="more"><\/svg><\/button>$/);
    assert.ok(!html.includes("Group A · 1 of 8"), "the trigger shows the current choice's label as well as the dots");
    // Without an icon, #67's trigger is as it was: the current choice and the chevron.
    const plain = renderToStaticMarkup(
      createElement(Dropdown, { value: "ga", onChange() {}, options: [{ value: "ga", label: "Group A" }], ariaLabel: "x", triggerPrefix: "Move to" }),
    );
    assert.match(plain, /Move to: Group A<\/span><svg/);
  });
});
