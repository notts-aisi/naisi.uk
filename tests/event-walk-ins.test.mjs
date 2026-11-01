/**
 * WALK-INS (ev-walkin-phone, Q44 B): somebody who came without signing up is
 * added with a name, and an email only if they want that event's survey,
 * which is deleted a week after the event.
 *
 * Through the real route (`POST /api/events/<id>/check-ins` with a `walkIn`),
 * the door list page that offers it, the form's own words, and the tidy job
 * on the day the email goes. As the people who run check-in, the organiser
 * the SU does not recognise, a member, signed out and view-as. At the door
 * only once the door is open (`tests/event-door-list.test.mjs` opens it); from
 * the event's page whether or not it was. The world is
 * `tests/lib/checkInWorld.mjs`. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AFTER, DOOR_OPEN, DURING, EVENT_ID, WEEK_LATER, makeCheckInWorld, textOf, withEvent } from "./lib/checkInWorld.mjs";

const w = await makeCheckInWorld("__walkIns");
const { call, render, load } = w;
const tick = await load("app/api/events/[id]/check-ins/route.ts");
const doorPage = await load("app/(app)/events/manage/[id]/door/page.tsx");
const { WalkInForm } = await load("features/events/checkIn/WalkInDialog.tsx");
const { eventCheckInsTidyJob } = await load("lib/scheduler/jobs/eventCheckInsTidy.ts");

function clock(t, at) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const add = (as, walkIn, from = "door") => call(tick.POST, { as, params: { id: EVENT_ID }, body: { from, walkIn } });
const checkIns = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("eventCheckIns/"))
    .map((path) => w.world.db.read(path));
const short = (res) => [res.status, res.body?.error ?? null];
const BAD_EMAIL = "That email doesn’t look right. Leave it empty if they don’t want the survey.";
/** The night, with the door open. */
const opened = () => w.reset(withEvent(DOOR_OPEN));

describe("adding a walk-in", () => {
  test("a name and an email: kept for the survey until a week after the event, and never sent back", async (t) => {
    clock(t, DURING);
    opened();
    const res = await add("sue", { name: "  Dan   Fitzgerald ", email: " Dan@Example.com " });
    assert.equal(res.status, 201);
    assert.deepEqual(
      { ...res.body.row, key: "-", checkIn: { ...res.body.row.checkIn, id: "-" } },
      {
        key: "-",
        rsvpId: null,
        name: "Dan Fitzgerald",
        // A guest's name as typed: no other name to show, and two words, so
        // nothing marks it.
        goBy: null,
        apart: null,
        note: null,
        standing: "walk-in",
        checkIn: {
          id: "-",
          how: "door",
          at: DURING.toISOString(),
          by: "Sue",
          emailGoesAt: "2026-11-08T17:00:00.000Z",
          noEmail: false,
        },
      },
    );
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes("dan@example.com"), "the email is not sent back");
    const [row] = checkIns();
    assert.deepEqual(
      [row.kind, row.name, row.email, row.uid, row.rsvpId, row.how, row.byUid],
      ["walk-in", "Dan Fitzgerald", "dan@example.com", null, null, "door", "sue"],
    );
    assert.equal(row.emailGoesAt.toISOString(), "2026-11-08T17:00:00.000Z");
  });

  test("a walk-in who gives one word is marked as a first name only, so the door can ask for the second", async (t) => {
    clock(t, DURING);
    opened();
    const res = await add("sue", { name: "  Dan " });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.row.name, res.body.row.note], ["Dan", "Guest: first name only"]);
  });

  test("a name alone: no email is kept, and the row says so", async (t) => {
    clock(t, DURING);
    opened();
    for (const email of [undefined, null, "", "   "]) {
      const res = await add("zach", { name: "Mo Rahman", email });
      assert.equal(res.status, 201, String(email));
      assert.equal(res.body.row.checkIn.noEmail, true);
    }
    assert.equal(checkIns().length, 4, "walk-ins with no account are each their own");
    assert.ok(checkIns().every((row) => row.email === null && row.emailGoesAt === null));
  });

  test("a name it cannot use, or an email that is not one, is a 400 with a sentence, before anything is read", async (t) => {
    clock(t, DURING);
    w.reset();
    const reads = w.world.db.stats.reads;
    const cases = [
      [{ email: "a@example.com" }, "Give the walk-in’s name."],
      [{ name: "   " }, "Give the walk-in’s name."],
      [{ name: "Dan\u0007" }, "Give the walk-in’s name."],
      [{ name: "x".repeat(81) }, "Keep the name to 80 characters."],
      [{ name: "Dan", email: "not an email" }, BAD_EMAIL],
      [{ name: "Dan", email: "dan@example" }, BAD_EMAIL],
      [{ name: "Dan", email: 42 }, BAD_EMAIL],
      [{ name: "Dan", email: `${"d".repeat(120)}@example.com` }, BAD_EMAIL],
    ];
    for (const [walkIn, words] of cases) {
      assert.deepEqual(short(await add("sue", walkIn)), [400, words], JSON.stringify(walkIn));
    }
    assert.deepEqual(short(await add("sue", "Dan")), [400, "Give the walk-in’s name."]);
    assert.equal(w.world.db.stats.reads, reads);
    assert.equal(checkIns().length, 0);
  });

  test("only the people who run check-in add one; not during view-as", async (t) => {
    clock(t, DURING);
    w.reset();
    assert.equal((await add(null, { name: "Dan" })).status, 401);
    for (const who of ["kofi", "iris", "cal", "ines"]) assert.equal((await add(who, { name: "Dan" })).status, 403, who);
    w.world.viewingAs = true;
    assert.equal((await add("sue", { name: "Dan" })).status, 403);
    w.world.viewingAs = false;
    assert.equal(checkIns().length, 0);
  });

  test("at the door while it is open; from the event's page until a week after", async (t) => {
    clock(t, DURING);
    w.reset();
    assert.deepEqual(short(await add("sue", { name: "Dan" }, "door")), [
      409,
      "The door isn’t open yet. The event’s author or an admin opens it from the Check-in tab.",
    ]);
    assert.equal(checkIns().length, 0, "not at the door before it is opened");
    t.mock.timers.reset();
    clock(t, AFTER);
    assert.equal((await add("sue", { name: "Dan" }, "door")).status, 409);
    const later = await add("sue", { name: "Dan", email: "dan@example.com" }, "page");
    assert.equal(later.status, 201);
    assert.equal(later.body.row.checkIn.how, "page");
    t.mock.timers.reset();
    clock(t, WEEK_LATER);
    assert.equal((await add("sue", { name: "Rosa" }, "page")).status, 409);
    assert.equal(checkIns().length, 1);
  });

  test("a week after the event the job deletes the email; the walk-in is still counted, with their name", async (t) => {
    clock(t, DURING);
    opened();
    await add("sue", { name: "Rosa Martinez", email: "rosa@example.com" });
    t.mock.timers.reset();
    clock(t, WEEK_LATER);
    await eventCheckInsTidyJob.handler({ now: new Date(), maxPerTick: 1, budget: { expired: () => false }, log: () => {} });
    const [row] = checkIns();
    assert.deepEqual([row.name, row.email, row.emailGoesAt], ["Rosa Martinez", null, null]);
  });
});

describe("where a walk-in is added", () => {
  test("the door list offers Add a walk-in while it is open, and not before it is opened or after", async (t) => {
    w.reset();
    clock(t, DURING);
    const shut = await render(doorPage, { as: "sue", params: { id: EVENT_ID } });
    assert.ok(!shut.text.includes("Add a walk-in"), "not before the door is opened");
    opened();
    const during = await render(doorPage, { as: "sue", params: { id: EVENT_ID } });
    assert.match(during.text, /Add a walk-in$/);
    t.mock.timers.reset();
    clock(t, AFTER);
    const after = await render(doorPage, { as: "sue", params: { id: EVENT_ID } });
    assert.ok(!after.text.includes("Add a walk-in"));
  });

  test("the form: a name, an email marked optional, and the day it is deleted, each control labelled", () => {
    const html = renderToStaticMarkup(
      createElement(WalkInForm, {
        eventId: EVENT_ID,
        eventLine: "VR games night · Sun 1 Nov",
        emailGoesOn: "Sun 8 Nov",
        from: "door",
        onAdded: () => {},
        onCancel: () => {},
      }),
    );
    assert.equal(
      textOf(html),
      "Add a walk-in VR games night · Sun 1 Nov Name Email (optional) " +
        "Only for the survey after this event. We delete it on Sun 8 Nov, a week after the event. Check in Cancel",
    );
    for (const name of ["name", "email"]) {
      const id = html.match(new RegExp(`<input id="([^"]+)"[^>]*name="${name}"`))[1];
      assert.match(html, new RegExp(`<label[^>]*for="${id}"`), `${name} has a label`);
    }
    assert.match(html, /aria-label="Close"/);
    assert.match(html, /type="email"/);
  });
});
