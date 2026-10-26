/**
 * When groups go out, as a record (4b-5 piece 1): the run's planned day, the
 * route the programme's lead and admins set it through, and every sentence
 * that names it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/groups-go-out   { on }
 *
 * ## What this guards
 *
 *  1. THE RECORD. `groupsGoOutOn` reads back only as a whole London date;
 *     anything else stored there is no day.
 *  2. WHO SETS IT. The programme's lead and admins; a reviewer is refused,
 *     anybody with no role is told the programme is not here, signed out is
 *     401, a view-as session is refused first, and a body that is not a date
 *     or null is 400. A programme with no run is told to name one first.
 *  3. THE WORDS. With a day that is today or later each sentence names it;
 *     with no day, or one that has passed, each is said without a day. The
 *     first week's window comes from the run's start date and plan.
 *  4. THE PAGES. The Groups tab's Sessions view draws the card with the day
 *     as stored for the lead and an admin; the programme's head says "Groups
 *     go out" before the run is under way, and not once the day has passed.
 *
 * Real: the route, the pages, the libraries under them and the store.
 * Faked: the session, the Admin SDK handle, the view-as guard, `next/link`,
 * `next/navigation`, the stylesheets and the clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { RUN, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";
import { AGI, CAST, ROUND, TAIS } from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

/** Sat 24 Oct 2026, 1pm in London: decisions are out and nobody has met. */
const NOW = new Date("2026-10-24T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const made = await makeGroupWorld("__groupsGoOutDay");
const { world, loadTs, reset, call } = made;
const route = await loadTs(
  join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "groups-go-out", "route.ts"),
);
const words = await loadTs(join("lib", "courses", "groupsGoOut.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));

const RUN_PATH = `courseRuns/${RUN.agi}`;
const set = (who, body, { programmeId = AGI, viewAs = false } = {}) =>
  call(who, route.PUT, { roundId: ROUND, programmeId }, { body, viewAs });
const stored = () => world.db.read(RUN_PATH).groupsGoOutOn;

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset();
});

describe("1. the record", () => {
  test("only a whole date reads back as the day", () => {
    const read = (value) => normalizeCourseRun("r", { groupsGoOutOn: value }).groupsGoOutOn;
    assert.equal(read("2026-10-28"), "2026-10-28");
    for (const value of [undefined, null, "", "2026-02-30", "28 Oct", "2026-10-28T09:00", 20261028, true, ["2026-10-28"]]) {
      assert.equal(read(value), null, JSON.stringify(value));
    }
  });
});

describe("2. who sets it", () => {
  test("the lead sets it and an admin clears it", async () => {
    const lead = await set("claudia", { on: "2026-10-28" });
    assert.deepEqual([lead.status, lead.body], [200, { ok: true, on: "2026-10-28" }]);
    assert.equal(stored(), "2026-10-28");
    const admin = await set("zach", { on: null });
    assert.deepEqual([admin.status, admin.body], [200, { ok: true, on: null }]);
    assert.equal(stored(), null);
  });

  test("a reviewer is refused, somebody with no role is told there is no programme, and nothing is written", async () => {
    const reviewer = await set("lloyd", { on: "2026-10-28" });
    assert.deepEqual([reviewer.status, reviewer.body.error], [403, "Only the programme’s lead and admins can say when groups go out."]);
    for (const who of ["amara", "nobody", "yusuf"]) {
      const answer = await set(who, { on: "2026-10-28" });
      assert.deepEqual([answer.status, answer.body.error], [404, "That programme is not on this form."], who);
    }
    assert.equal(stored(), undefined);
  });

  test("signed out is 401, view-as is refused first, and a body that is not a date is 400", async () => {
    assert.equal((await set(null, { on: "2026-10-28" })).status, 401);
    const borrowed = await set("zach", { on: "2026-10-28" }, { viewAs: true });
    assert.deepEqual([borrowed.status, borrowed.body.error], [403, "view-as"]);
    for (const body of [{}, { on: "" }, { on: "Wed 28 Oct" }, { on: "2026-13-01" }, { on: 3 }]) {
      const answer = await set("claudia", body);
      assert.deepEqual(
        [answer.status, answer.body.error],
        [400, "Say the day groups go out as a date, like 2026-10-28, or clear it."],
        JSON.stringify(body),
      );
    }
    assert.equal(stored(), undefined);
  });

  test("a programme that names no run is told to name one first", async () => {
    const answer = await set("tess", { on: "2026-10-28" }, { programmeId: TAIS });
    assert.deepEqual(
      [answer.status, answer.body.error],
      [409, "This programme doesn’t name a course run yet. Name its run first, then say when groups go out."],
    );
  });
});

describe("3. the words", () => {
  test("a day today or later is named; none, or one that has passed, is not", () => {
    assert.equal(words.groupsGoOutDay("2026-10-28", "2026-10-24"), "Wed 28 Oct");
    assert.equal(words.groupsGoOutDay("2026-10-28", "2026-10-28"), "Wed 28 Oct");
    assert.equal(words.groupsGoOutDay("2026-10-28", "2026-10-29"), null);
    assert.equal(words.groupsGoOutDay(null, "2026-10-24"), null);
    assert.equal(words.groupsGoOutDay("not a day", "2026-10-24"), null);
  });

  test("each sentence, with the day and without it", () => {
    assert.equal(
      words.groupEmailComingWords("Wed 28 Oct"),
      "We’re putting groups together now. You’ll get an email with your group, day and room by Wed 28 Oct.",
    );
    assert.equal(
      words.groupEmailComingWords(null),
      "We’re putting groups together now. You’ll get an email with your group, day and room once they’re ready.",
    );
    assert.equal(
      words.weekOneOpenWords("Wed 28 Oct"),
      "Week 1 is open now. You’ll hear your group and when it meets on Wed 28 Oct.",
    );
    assert.equal(words.weekOneOpenWords(null), "Week 1 is open now. You’ll hear your group and when it meets once groups go out.");
    assert.equal(
      words.freeUntilWords("Wed 28 Oct"),
      "We use this to put you in a group. You can change it until we email your group on Wed 28 Oct.",
    );
    assert.equal(words.freeUntilWords(null), "You can change it until we email your group.");
  });

  test("the first week's window comes from the run's start and plan", () => {
    const plan = [
      { kind: "week", weekNumber: 1, weekId: "w01" },
      { kind: "week", weekNumber: 2, weekId: "w02" },
    ];
    assert.deepEqual(words.firstWeekOf({ startDate: "2026-10-29", weekPlan: plan }), { from: "2026-10-29", to: "2026-11-04" });
    assert.equal(
      words.firstSessionWindowWords(words.firstWeekOf({ startDate: "2026-10-29", weekPlan: plan })),
      "Your first session will be between Thu 29 Oct and Wed 4 Nov.",
    );
    // A week off first moves week 1 on by a week.
    assert.deepEqual(
      words.firstWeekOf({ startDate: "2026-10-22", weekPlan: [{ kind: "break", label: "Reading week" }, ...plan] }),
      { from: "2026-10-29", to: "2026-11-04" },
    );
    assert.equal(words.firstWeekOf({ startDate: "", weekPlan: plan }), null);
    assert.equal(words.firstWeekOf({ startDate: "2026-10-29", weekPlan: [] }), null);
    assert.equal(words.firstSessionWindowWords(null), null);
  });
});

describe("4. the pages", () => {
  const ui = { h: createElement };
  globalThis.__groupsGoOutUi = ui;
  const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const STYLESHEETS = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) STYLESHEETS.add(specifier);
  }
  const SESSION = "export async function getCurrentUser() { return globalThis.__groupsGoOutDay.user; }";
  const { loadTs: loadPage } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["firebase-admin/firestore", FIELD_VALUE_STUB],
      ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__groupsGoOutDay.db; }"],
      ["@/lib/firebase/session", SESSION],
      ["./session", SESSION],
      [
        "next/navigation",
        "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
          "export function useSelectedLayoutSegment() { return 'groups'; }\n" +
          "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
      ],
      [
        "next/link",
        "export default ({ href, className, children }) => globalThis.__groupsGoOutUi.h('a', { href, className }, children);",
      ],
      ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
    ]),
  });
  const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
  let pages = null;
  const pagesLoaded = async () =>
    (pages ??= {
      sessions: (await loadPage(join(TABS, "groups", "sessions", "page.tsx"))).default,
      layout: (await loadPage(join(TABS, "layout.tsx"))).default,
    });

  function sessionFor(uid) {
    const base = made.sessionOf(uid);
    if (!base) return null;
    return { ...base, permissions: CAST.zach.permissions, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
  }
  const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

  async function sessionsAs(who) {
    const { sessions } = await pagesLoaded();
    world.user = sessionFor(who);
    const params = Promise.resolve({ roundId: ROUND, programmeId: AGI });
    return renderToStaticMarkup(await sessions({ params, searchParams: Promise.resolve({}) }));
  }
  async function headAs(who) {
    const { layout } = await pagesLoaded();
    world.user = sessionFor(who);
    const params = Promise.resolve({ roundId: ROUND, programmeId: AGI });
    return text(renderToStaticMarkup(await layout({ params, children: null })));
  }

  beforeEach(() => {
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  });

  test("the Sessions view draws the card with the day as stored, for the lead and an admin", async () => {
    world.db.poke(RUN_PATH, { groupsGoOutOn: "2026-10-28" });
    for (const who of ["claudia", "zach"]) {
      const html = await sessionsAs(who);
      assert.match(html, /When groups go out/, who);
      assert.match(html, /<label for="[^"]+" class="label">Groups go out on<\/label>/, who);
      assert.match(html, /type="date"[^>]*value="2026-10-28"/, who);
      assert.match(html, /readOnly=""|readonly=""/, `${who}: the box is read only until the page is live`);
    }
    world.db.poke(RUN_PATH, { groupsGoOutOn: null });
    assert.match(await sessionsAs("claudia"), /type="date"[^>]*value=""/);
  });

  test("the head says Groups go out before the run is under way, while the day is ahead", async () => {
    world.db.poke(RUN_PATH, { groupsGoOutOn: "2026-10-28" });
    assert.match(await headAs("claudia"), /Groups go out Wed 28 Oct/);
    assert.match(await headAs("zach"), /Groups go out Wed 28 Oct/);
    // A reviewer keeps the form's line.
    assert.doesNotMatch(await headAs("lloyd"), /Groups go out/);
    // Once the day has passed it is no longer said.
    mock.timers.setTime(new Date("2026-10-29T12:00:00Z").getTime());
    assert.doesNotMatch(await headAs("claudia"), /Groups go out/);
    mock.timers.setTime(NOW.getTime());
    world.db.poke(RUN_PATH, { groupsGoOutOn: null });
    assert.doesNotMatch(await headAs("claudia"), /Groups go out/);
  });
});
