/**
 * "When you’re free" stays open until groups go out (Q7: boards
 * st-application-phone and st-late-phone).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT /api/admissions/forms/[roundId]/application/availability   { days }
 *
 * ## What this guards
 *
 *  1. WHO. Somebody holding a place on a fellowship changes their painted
 *     week until Publish has told them their group: painted or not, before
 *     the hand-over, after it, and placed and not told. Told, gave the place
 *     back, no offer, an invitation not answered, an incubator's place: shut,
 *     with a sentence, and nothing written. A view-as session is refused
 *     first, signed out is 401, and a body that is not a week is 400.
 *  2. WHAT. The week is held to the form's own grid and codec, written where
 *     it has always been (the application of record and its draft), and the
 *     one it replaces is kept with the sent versions. The same week again
 *     writes nothing.
 *  3. WHO READS IT. The allocation board's fit marks and the times picture's
 *     one reading (`paintedWeekOf`) read the changed week.
 *  4. THE PAGES. The card says when it can be changed until (the run's
 *     planned day groups go out, or without a day), draws each day's times or
 *     "Not free", and links "Change when you’re free" to the editor's own
 *     page; it is not drawn once Publish has told them. That page draws the
 *     form's own editor for somebody holding a place, sends anybody else
 *     (told, no place, signed out) away, and in a view-as session says so and
 *     reads nothing.
 *  5. A LATE JOINER (st-late-phone): somebody offered a freed place after
 *     decision day has nothing to change until they accept; once they have,
 *     they change their week as anybody holding a place does, week 1 opens
 *     and Home draws the card. Once the planned day has passed, the line
 *     names no day: no record says when a late joiner hears.
 *
 * Real: the route, the loader and the writer, the board's facts and the
 * painted week's reading, the pages and the card, the store. Faked: the
 * session, the Admin SDK handle, the view-as guard, `next/navigation`,
 * `next/link`, the stylesheets and the clock.
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
import { GROUP, RUN, groupSeed, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";
import { freedSeed, loadRoutes, makeFreedWorld } from "./lib/freedPlacesWorld.mjs";
import { AGI, ROUND, applicationPath, week } from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

/** Sat 24 Oct 2026, 1pm in London. */
const NOW = new Date("2026-10-24T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const made = await makeGroupWorld("__whenFree");
const { world, loadTs, reset, call, steps } = made;
const route = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "application", "availability", "route.ts"));
const { loadWhenFree, WHEN_FREE_SHUT_PLACE, WHEN_FREE_SHUT_TOLD } = await loadTs(
  join("lib", "applications", "status", "whenFree.ts"),
);
const { formPlaceFactsFor } = await loadTs(join("lib", "applications", "handover", "board.ts"));
const { paintedWeekOf } = await loadTs(join("lib", "applications", "handover", "paintedWeek.ts"));
const { normaliseApplication } = await loadTs(join("lib", "applications", "normalise.ts"));
const { loadForm } = await loadTs(join("lib", "applications", "repo.ts"));

/** Free on Tuesday evening only: can make neither AGI group (Monday 6pm, Thursday 10am). */
const TUESDAY = week({ 2: [["17:00", "21:00"]] });
/** Free on Monday evening only: can make the Monday group. */
const MONDAY = week({ 1: [["17:00", "21:00"]] });

const change = (who, days, options = {}) =>
  call(who, route.PUT, { roundId: ROUND }, { body: days === undefined ? {} : { days }, ...options });
const stored = (who) => world.db.read(applicationPath(who));
const snapshot = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

function seed({ groupsGoOutOn = "2026-10-28" } = {}) {
  const docs = groupSeed();
  docs[`courseRuns/${RUN.agi}`].groupsGoOutOn = groupsGoOutOn;
  return docs;
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(seed());
});

describe("1. who may change it", () => {
  test("somebody holding a place, before the hand-over, after it, and placed and not told", async () => {
    let answer = await change("amara", TUESDAY.days);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.changed, true);
    await steps.handOver();
    answer = await change("amara", MONDAY.days);
    assert.deepEqual([answer.status, answer.body.changed], [200, true]);
    await steps.place([{ uid: "amara", groupId: GROUP.thursday }]);
    answer = await change("amara", TUESDAY.days);
    assert.deepEqual([answer.status, answer.body.changed], [200, true], "placed and not told");
    assert.deepEqual(stored("amara").sent.availability.days, TUESDAY.days);
  });

  test("somebody who painted nothing can paint a week now", async () => {
    assert.ok(stored("bea").sent.availability.days.every((day) => /^0+$/.test(day)));
    const answer = await change("bea", MONDAY.days);
    assert.deepEqual([answer.status, answer.body.changed], [200, true]);
    assert.deepEqual(stored("bea").sent.availability.days, MONDAY.days);
  });

  test("told: shut, with a sentence, and nothing written", async () => {
    await steps.published();
    const before = snapshot();
    const answer = await change("amara", TUESDAY.days);
    assert.deepEqual([answer.status, answer.body.error], [409, WHEN_FREE_SHUT_TOLD]);
    assert.equal(snapshot(), before);
  });

  test("gave the place back, no offer, an invitation not answered, an incubator's place: shut", async () => {
    const before = snapshot();
    for (const who of ["nina", "omar", "ines"]) {
      const answer = await change(who, TUESDAY.days);
      assert.deepEqual([answer.status, answer.body.error], [409, WHEN_FREE_SHUT_PLACE], who);
    }
    assert.equal(snapshot(), before);
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.kind`]: "incubator" });
    assert.deepEqual([(await change("amara", TUESDAY.days)).status, (await change("amara", TUESDAY.days)).body.error], [409, WHEN_FREE_SHUT_PLACE]);
  });

  test("view-as is refused first, signed out is 401, and a body that is not a week is 400", async () => {
    const before = snapshot();
    assert.deepEqual((await change("amara", TUESDAY.days, { viewAs: true })).body, { error: "view-as" });
    assert.equal((await change(null, TUESDAY.days)).status, 401);
    for (const days of [undefined, "ffff", [...TUESDAY.days, "000000000000"]]) {
      assert.equal((await change("amara", days)).status, 400, JSON.stringify(days));
    }
    assert.equal(snapshot(), before);
  });
});

describe("2. what it writes", () => {
  test("the week on the form's own grid, in the application of record and its draft, the old one kept", async () => {
    const was = structuredClone(stored("amara").sent);
    assert.equal((await change("amara", TUESDAY.days)).status, 200);
    const now = stored("amara");
    assert.deepEqual(now.sent.availability.days, TUESDAY.days);
    assert.deepEqual(now.draft.availability.days, TUESDAY.days);
    const form = world.db.read(`admissionRounds/${ROUND}`);
    assert.equal(now.sent.availability.slotMinutes, form.availabilityGrid.slotMinutes);
    // Everything else they sent is as it was.
    assert.deepEqual({ ...now.sent, availability: null }, { ...was, availability: null });
    assert.equal(now.sentHistory.length, 1);
    assert.deepEqual(now.sentHistory[0].content.availability.days, was.availability.days);
    assert.ok(now.sentChangedAt instanceof Date);
  });

  test("days drawn on another geometry are read on the form's grid, and the same week again writes nothing", async () => {
    assert.equal((await change("amara", TUESDAY.days)).status, 200);
    const before = snapshot();
    const again = await change("amara", TUESDAY.days);
    assert.deepEqual([again.status, again.body.changed], [200, false]);
    assert.equal(snapshot(), before);
  });
});

describe("3. the board and the times picture read the changed week", () => {
  test("the board's fit marks follow the week", async () => {
    await steps.handOver();
    const groups = [
      { id: GROUP.monday, session: { weekday: 1, startTimeLocal: "18:00", durationMinutes: 90 } },
      { id: GROUP.thursday, session: { weekday: 4, startTimeLocal: "10:00", durationMinutes: 90 } },
    ];
    const rows = [{ uid: "bea", fromForm: { roundId: ROUND, programmeId: AGI } }];
    const facts = async () => (await formPlaceFactsFor(world.db, { isAdmin: true, leadOf: null }, rows, groups)).get("bea");
    assert.equal((await facts()).availability, "none-given");
    await change("bea", MONDAY.days);
    assert.deepEqual(await facts(), { availability: "given", canMakeGroupIds: [GROUP.monday], holdsPlace: true });
    const form = await loadForm(world.db, ROUND);
    const application = normaliseApplication(applicationPath("bea").split("/")[1], stored("bea"), form.round.availabilityGrid);
    const painted = paintedWeekOf(form.round.availabilityGrid, application);
    assert.equal(painted.kind, "given");
    assert.equal(painted.covers({ weekday: 1, startTimeLocal: "18:00", durationMinutes: 90 }), true);
    assert.equal(painted.covers({ weekday: 4, startTimeLocal: "10:00", durationMinutes: 90 }), false);
  });
});

describe("4. the page", () => {
  test("the card's facts: the line with the day, without one, and nothing once told", async () => {
    const view = await loadWhenFree(world.db, ROUND, "amara", new Date());
    assert.equal(view.line, "We use this to put you in a group. You can change it until we email your group on Wed 28 Oct.");
    reset(seed({ groupsGoOutOn: null }));
    assert.equal((await loadWhenFree(world.db, ROUND, "amara", new Date())).line, "You can change it until we email your group.");
    reset(seed());
    mock.timers.setTime(new Date("2026-10-29T12:00:00Z").getTime());
    assert.equal((await loadWhenFree(world.db, ROUND, "amara", new Date())).line, "You can change it until we email your group.");
    mock.timers.setTime(NOW.getTime());
    await steps.published();
    assert.equal(await loadWhenFree(world.db, ROUND, "amara", new Date()), null);
    for (const who of ["nina", "omar", "ines", "nobody"]) assert.equal(await loadWhenFree(world.db, ROUND, who, new Date()), null, who);
  });

  /** The pages' own loader: every stylesheet in the tree stubbed, the session and view-as read off the world. */
  let pageLoader = null;
  const loadPage = (rel) => {
    if (!pageLoader) {
      const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
      const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
      const STYLESHEETS = new Set();
      for (const file of walkSource(SRC)) {
        for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) STYLESHEETS.add(specifier);
      }
      pageLoader = createLoader({
        stubs: new Map([
          ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
          ["server-only", "export {};"],
          ["firebase-admin/firestore", FIELD_VALUE_STUB],
          [
            "next/server",
            "export class NextResponse { constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; }\n" +
              "  static json(body, init) { return new NextResponse(body, init); } }",
          ],
          ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__whenFree.db; }"],
          ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__whenFree.user; }"],
          [
            "@/lib/firebase/impersonation",
            "export async function getImpersonator() {\n" +
              "  return globalThis.__whenFree.viewAs ? { actorUid: 'zach', actorName: 'Zach Levin' } : null;\n" +
              "}\n" +
              "export function markerIsLive(marker, currentUid) {\n" +
              "  return marker !== null && marker.actorUid !== currentUid;\n" +
              "}",
          ],
          [
            "next/navigation",
            "export function useRouter() { return { refresh() {}, push() {} }; }\n" +
              "export function redirect(to) { throw Object.assign(new Error('redirect'), { redirectedTo: to }); }",
          ],
          ["next/link", `export default ({ href, className, children }) => globalThis.__whenFreeUi.h("a", { href, className }, children);`],
        ]),
      });
      globalThis.__whenFreeUi = { h: createElement };
    }
    return pageLoader.loadTs(rel);
  };
  const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

  test("the page draws the card for a place, with each day's times, and not once told", async () => {
    const { renderApplicationStatus } = await loadPage(join("features", "applications", "status", "renderApplicationStatus.tsx"));
    const draw = async (who) => renderToStaticMarkup(await renderApplicationStatus({ roundId: ROUND, user: made.sessionOf(who) }));

    const html = await draw("amara");
    const page = text(html);
    assert.match(page, /When you’re free We use this to put you in a group\. You can change it until we email your group on Wed 28 Oct\./);
    assert.match(page, /Mon Monday: 5pm to 9pm/);
    assert.match(page, /Wed Wednesday: Not free/);
    // Read only: the change is the editor's own page, and the card is where Home's link lands.
    const card = /<section id="when-youre-free"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.match(card, new RegExp(`<a href="/applications/${ROUND}/free"[^>]*>Change when you’re free</a>`));
    assert.doesNotMatch(card, /<button|<input/);
    await steps.published();
    assert.doesNotMatch(text(await draw("amara")), /When you’re free/);
  });

  test("the editor's own page: the form's editor for a place; told, no place and signed out sent away; view-as told and nothing read", async () => {
    const { default: WhenYoureFreePage } = await loadPage(join("app", "(public)", "applications", "[roundId]", "free", "page.tsx"));
    const open = async (who, { viewAs = false } = {}) => {
      world.user = made.sessionOf(who);
      world.viewAs = viewAs;
      try {
        return { html: renderToStaticMarkup(await WhenYoureFreePage({ params: Promise.resolve({ roundId: ROUND }) })) };
      } catch (err) {
        if (err?.redirectedTo) return { redirectedTo: err.redirectedTo };
        throw err;
      } finally {
        world.user = null;
        world.viewAs = false;
      }
    };

    // Holding a place: the form's own editor, on the week as stored, with the card's line.
    const drawn = await open("amara");
    const page = text(drawn.html);
    assert.match(page, /When you’re free We use this to put you in a group\. You can change it until we email your group on Wed 28 Oct\./);
    assert.match(page, /Save/);
    assert.match(drawn.html, new RegExp(`<a href="/applications/${ROUND}#when-youre-free"[^>]*>Cancel</a>`));
    assert.match(drawn.html, new RegExp(`<a href="/applications/${ROUND}#when-youre-free"[^>]*>.*Your application`));
    // Placed and not told is still holding a place.
    await steps.placed();
    assert.match(text((await open("amara")).html ?? ""), /Save/, "placed and not told");

    // Signed out: to sign in, and back here after.
    assert.deepEqual(await open(null), { redirectedTo: `/login?next=${encodeURIComponent(`/applications/${ROUND}/free`)}` });
    // No place: to their application page, which says where they stand.
    for (const who of ["nina", "omar", "ines"]) assert.deepEqual(await open(who), { redirectedTo: `/applications/${ROUND}` }, who);

    // A view-as session: told it may not, and nothing of the member's read.
    const before = world.db.stats.reads;
    const viewing = await open("amara", { viewAs: true });
    assert.equal(world.db.stats.reads, before, "a view-as session read something");
    assert.doesNotMatch(text(viewing.html), /Save|Cancel|We use this/);

    // Told: sent back too.
    await steps.publishes();
    assert.deepEqual(await open("amara"), { redirectedTo: `/applications/${ROUND}` });
  });
});

// ---------------------------------------------------------------------------
// 5. A late joiner: a freed place, accepted after decision day
// ---------------------------------------------------------------------------

describe("5. a late joiner (st-late-phone): a freed place accepted after decision day", () => {
  /** Tue 27 Oct 2026, 12pm: inside the freed places window, the day before groups go out. */
  const TUESDAY = new Date("2026-10-27T12:00:00Z");
  const REPLY_BY = "2026-10-29";
  const late = makeFreedWorld("__whenFreeLate");
  let api = null;
  let lateRoute = null;
  let lateLib = null;
  const lateSession = (uid) => late.sessionOf(uid);

  beforeEach(async () => {
    api ??= await loadRoutes(late);
    lateRoute ??= await late.formRoute("application", "availability");
    lateLib ??= {
      free: await late.lib("applications", "status", "whenFree.ts"),
      door: await late.lib("courses", "weekOne", "door.ts"),
      cards: await late.lib("courses", "weekOne", "cards.ts"),
    };
    mock.timers.setTime(TUESDAY.getTime());
    late.reset(freedSeed());
    late.world.db.poke(`courseRuns/${RUN.agi}`, { groupsGoOutOn: "2026-10-28" });
    // Week 1 as the run holds it, marked ready.
    late.world.db.seed(`courseRuns/${RUN.agi}/weeks/w01`, {
      ...groupSeed()[`courseRuns/${RUN.agi}/weeks/w01`],
      ready: true,
      readyAt: TUESDAY,
      readyByUid: "claudia",
    });
  });

  const offer = async () => {
    await api.test("zach", { uid: "omar", groupId: GROUP.monday, replyBy: REPLY_BY });
    const offered = await api.offer("zach", { picks: [{ uid: "omar", groupId: GROUP.monday }], replyBy: REPLY_BY, invitations: 1 });
    assert.equal(offered.status, 200, JSON.stringify(offered.body));
  };

  test("offered and not answered: nothing to change, no week 1 and no card", async () => {
    await offer();
    assert.equal(await lateLib.free.loadWhenFree(late.world.db, ROUND, "omar", new Date()), null);
    const answer = await late.call("omar", lateRoute.PUT, { roundId: ROUND }, { body: { days: MONDAY.days } });
    assert.deepEqual([answer.status, answer.body.error], [409, lateLib.free.WHEN_FREE_SHUT_PLACE]);
    assert.equal((await lateLib.door.weekOneDoorFor(late.world.courseDb, lateSession("omar"), RUN.agi)).open, false);
    assert.deepEqual(await lateLib.cards.beforeGroupsCardsFor(late.world.courseDb, lateSession("omar"), new Date()), []);
  });

  test("accepted: the card says the day groups go out, the change is written, and week 1 is open with Home's card", async () => {
    await offer();
    const answered = await api.reply("omar", { reply: "accept-invitation" });
    assert.equal(answered.status, 200, JSON.stringify(answered.body));

    const view = await lateLib.free.loadWhenFree(late.world.db, ROUND, "omar", new Date());
    assert.equal(view.line, "We use this to put you in a group. You can change it until we email your group on Wed 28 Oct.");
    const changed = await late.call("omar", lateRoute.PUT, { roundId: ROUND }, { body: { days: MONDAY.days } });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.deepEqual(late.world.db.read(applicationPath("omar")).sent.availability.days, MONDAY.days);

    const door = await lateLib.door.weekOneDoorFor(late.world.courseDb, lateSession("omar"), RUN.agi);
    assert.equal(door.open, true);
    const [card] = await lateLib.cards.beforeGroupsCardsFor(late.world.courseDb, lateSession("omar"), new Date());
    assert.equal(card.title, lateLib.cards.ON_ITS_WAY);
    assert.match(card.body, /by Wed 28 Oct\./);
    assert.equal(card.weekOne?.href, `/learn/${RUN.agi}/weeks/1`);
  });

  test("once the planned day has passed, the line names no day: nothing says when a late joiner hears", async () => {
    await offer();
    await api.reply("omar", { reply: "accept-invitation" });
    mock.timers.setTime(new Date("2026-10-29T12:00:00Z").getTime());
    assert.equal((await lateLib.free.loadWhenFree(late.world.db, ROUND, "omar", new Date())).line, "You can change it until we email your group.");
  });
});
