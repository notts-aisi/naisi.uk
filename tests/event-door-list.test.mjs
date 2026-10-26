/**
 * THE DOOR LIST (ev-door-phone): the event's sign-ups with a Check in each, a
 * search and the count, for the people who run check-in, open from an hour
 * before the start to an hour after the end.
 *
 * Through the real page (`/events/manage/<id>/door`) and the real routes
 * (`POST /api/events/<id>/check-ins`, `DELETE .../check-ins/<checkInId>`), as
 * an admin, SU-recognised committee, the event's organiser and its
 * collaborator (committee the SU does not recognise: counts only, so no door
 * list), a member, a pending account, signed out and view-as. The clock is
 * set per test. The world is `tests/lib/checkInWorld.mjs`. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AFTER, BEFORE, DURING, EVENT_ID, RSVP, WEEK_LATER, makeCheckInWorld } from "./lib/checkInWorld.mjs";

const w = await makeCheckInWorld("__doorList");
const { call, render, load } = w;
const page = await load("app/(app)/events/manage/[id]/door/page.tsx");
const tick = await load("app/api/events/[id]/check-ins/route.ts");
const undoRoute = await load("app/api/events/[id]/check-ins/[checkInId]/route.ts");
const doorCode = await load("app/api/events/[id]/door-code/route.ts");

function clock(t, at) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const press = (as, body) => call(tick.POST, { as, params: { id: EVENT_ID }, body });
const undo = (as, checkInId) => call(undoRoute.DELETE, { as, params: { id: EVENT_ID, checkInId } });
const open = (as) => render(page, { as, params: { id: EVENT_ID } });
const checkIns = () => w.world.db.paths().filter((path) => path.startsWith("eventCheckIns/"));
const short = (res) => [res.status, res.body?.error ?? null];

const STAFF_ONLY = "Only admins and SU-recognised committee members run check-in.";

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

describe("the door list page", () => {
  test("for the people who run check-in only: everybody else goes back to the event", async (t) => {
    clock(t, DURING);
    w.reset();
    assert.deepEqual(await open(null), { redirect: "/login" });
    for (const who of ["kofi", "iris", "cal", "ines"]) {
      assert.deepEqual(await open(who), { redirect: `/events/manage/${EVENT_ID}` }, who);
    }
    for (const who of ["sue", "zach"]) {
      const shown = await open(who);
      assert.ok(shown.text, who);
      assert.match(shown.text, /Door list/, who);
    }
  });

  test("on the night: the count, every sign-up to come with a Check in, and the not confirmed after them", async (t) => {
    clock(t, DURING);
    w.reset();
    const { text, html } = await open("sue");
    assert.match(text, /VR games night Door list 0 of 3 here/);
    assert.match(text, /To come 3 Here 0/);
    assert.match(text, /CN Chloe Nguyen Signed up Check in GP Gwen Price Signed up Check in KA Kofi Asante Signed up Check in/);
    for (const name of ["Chloe Nguyen", "Gwen Price", "Kofi Asante"]) {
      assert.match(html, new RegExp(`aria-label="Check in ${name}"`), name);
    }
    assert.match(text, /Not confirmed WH Wren Hale On the waiting list Check in PE Pat Ellis Not decided yet Check in/);
    for (const absent of ["Cora Lind", "Dina Shah", "Test Person"]) {
      assert.ok(!text.includes(absent), `${absent} is not on the door list`);
    }
    assert.match(html, /aria-pressed="true"[^>]*>To come/);
    assert.match(html, /placeholder="Find a name"/);
    // Nothing presses before the page's script has arrived.
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Check in Kofi Asante"|aria-label="Check in Kofi Asante"[^>]*disabled=""/);
    assert.ok(!text.includes("check themselves in at"), "no door code yet, so no line about it");
  });

  test("with a door code, the line under the list gives its address", async (t) => {
    clock(t, DURING);
    w.reset();
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    const { text } = await open("sue");
    assert.match(text, /People with an account can check themselves in at naisi\.uk\/q\/vr-in ?\. Add a walk-in$/);
  });

  test("before the door opens and after it closes, it says when, and offers no Check in", async (t) => {
    w.reset();
    clock(t, BEFORE);
    const before = await open("sue");
    assert.match(before.text, /The door list opens at 1pm on Sun 1 Nov, an hour before the start\./);
    assert.ok(!before.html.includes('aria-label="Check in'), "nothing to press");
    t.mock.timers.reset();
    clock(t, AFTER);
    const after = await open("sue");
    assert.match(
      after.text,
      /The door list closed at 6pm, an hour after the end\. Add people who came from the event’s page\./,
    );
    assert.ok(!after.html.includes('aria-label="Check in'));
  });

  test("who came already is under Just checked in, with how and when", async (t) => {
    clock(t, DURING);
    w.reset();
    await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    const { text } = await open("zach");
    assert.match(text, /1 of 3 here/);
    assert.match(text, /To come 2 Here 1/);
    assert.match(text, /Just checked in KA Kofi Asante Door · 2:05pm/);
  });
});

// ---------------------------------------------------------------------------
// Check in
// ---------------------------------------------------------------------------

describe("POST /api/events/<id>/check-ins", () => {
  test("refused to everybody who does not run check-in, and to view-as, writing nothing", async (t) => {
    clock(t, DURING);
    w.reset();
    const before = w.everything();
    assert.equal((await press(null, { rsvpId: RSVP.kofi, from: "door" })).status, 401);
    for (const who of ["kofi", "iris", "cal", "ines"]) {
      assert.deepEqual(short(await press(who, { rsvpId: RSVP.kofi, from: "door" })), [403, STAFF_ONLY], who);
    }
    w.world.viewingAs = true;
    assert.equal((await press("sue", { rsvpId: RSVP.kofi, from: "door" })).status, 403);
    w.world.viewingAs = false;
    assert.equal(w.everything(), before);
  });

  test("a press checks one sign-up in, and answers with the row as the list draws it, nothing more", async (t) => {
    clock(t, DURING);
    w.reset();
    const res = await press("sue", { rsvpId: RSVP.gwen, from: "door" });
    assert.equal(res.status, 201);
    assert.equal(res.body.created, true);
    assert.deepEqual(Object.keys(res.body.row).sort(), ["checkIn", "key", "name", "rsvpId", "standing"]);
    assert.deepEqual(Object.keys(res.body.row.checkIn).sort(), ["at", "emailGoesAt", "how", "id", "noEmail"]);
    assert.deepEqual(
      { ...res.body.row, checkIn: { ...res.body.row.checkIn, id: "-" } },
      {
        key: RSVP.gwen,
        rsvpId: RSVP.gwen,
        name: "Gwen Price",
        standing: "signed-up",
        checkIn: { id: "-", how: "door", at: DURING.toISOString(), emailGoesAt: null, noEmail: false },
      },
    );
    assert.ok(!JSON.stringify(res.body).includes("gwen@example.com"), "no address in the answer");
    const stored = w.world.db.read(checkIns()[0]);
    assert.deepEqual([stored.kind, stored.rsvpId, stored.uid, stored.how, stored.byUid], ["signup", RSVP.gwen, null, "door", "sue"]);
  });

  test("pressed again, by anybody: the first check-in stands and nothing is added", async (t) => {
    clock(t, DURING);
    w.reset();
    await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    const again = await press("zach", { rsvpId: RSVP.kofi, from: "door" });
    assert.equal(again.status, 200);
    assert.equal(again.body.created, false);
    assert.equal(checkIns().length, 1);
  });

  test("the waiting list and the undecided can be let in; cancelled, refused and test sign-ups cannot", async (t) => {
    clock(t, DURING);
    w.reset();
    assert.equal((await press("sue", { rsvpId: RSVP.wren, from: "door" })).status, 201);
    assert.equal((await press("sue", { rsvpId: RSVP.pat, from: "door" })).status, 201);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.cora, from: "door" })), [
      409,
      "Cora Lind’s sign-up was cancelled or refused. Add them as a walk-in.",
    ]);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.dina, from: "door" })), [
      409,
      "Dina Shah’s sign-up was cancelled or refused. Add them as a walk-in.",
    ]);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.test, from: "door" })), [
      404,
      "There is no such sign-up for this event.",
    ]);
    assert.equal(checkIns().length, 2);
  });

  test("a body that says nothing usable is a 400 with a sentence, before anything is read", async (t) => {
    clock(t, DURING);
    w.reset();
    const reads = w.world.db.stats.reads;
    assert.deepEqual(short(await press("sue", undefined)), [400, "Say who to check in."]);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.kofi })), [400, "Say whether this is the door list or the event’s page."]);
    assert.deepEqual(short(await press("sue", { from: "door" })), [400, "Say who to check in."]);
    assert.deepEqual(short(await press("sue", { rsvpId: "../x", from: "door" })), [400, "Say who to check in."]);
    assert.equal(w.world.db.stats.reads, reads);
  });

  test("a sign-up that is not this event's, or not there, is a 404", async (t) => {
    clock(t, DURING);
    w.reset({ "eventRsvps/rsvp-elsewhere": { ...w.world.db.read(`eventRsvps/${RSVP.kofi}`), eventId: "another-event" } });
    assert.equal((await press("sue", { rsvpId: "rsvp-elsewhere", from: "door" })).status, 404);
    assert.equal((await press("sue", { rsvpId: "no-such-rsvp", from: "door" })).status, 404);
    assert.equal(checkIns().length, 0);
  });

  test("the door list only while the door is open; the event's page until a week after", async (t) => {
    w.reset();
    clock(t, BEFORE);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.kofi, from: "door" })), [
      409,
      "The door list opens at 1pm on Sun 1 Nov, an hour before the start.",
    ]);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.kofi, from: "page" })), [
      409,
      "Nobody can be checked in before the door list opens at 1pm on Sun 1 Nov.",
    ]);
    t.mock.timers.reset();
    clock(t, AFTER);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.kofi, from: "door" })), [
      409,
      "The door list closed at 6pm, an hour after the end. Add people who came from the event’s page.",
    ]);
    const later = await press("sue", { rsvpId: RSVP.kofi, from: "page" });
    assert.equal(later.status, 201);
    assert.equal(later.body.row.checkIn.how, "page");
    t.mock.timers.reset();
    clock(t, WEEK_LATER);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.chloe, from: "page" })), [
      409,
      "It’s more than a week since this event, so nobody more can be added.",
    ]);
    assert.equal(checkIns().length, 1);
  });

  test("an event that is not published takes no check-ins", async (t) => {
    clock(t, DURING);
    for (const status of ["draft", "cancelled"]) {
      w.reset({ [`events/${EVENT_ID}`]: { ...w.world.db.read(`events/${EVENT_ID}`), status } });
      assert.deepEqual(short(await press("zach", { rsvpId: RSVP.kofi, from: "door" })), [
        409,
        "Only a published event takes check-ins.",
      ]);
    }
    assert.equal((await call(tick.POST, { as: "zach", params: { id: "nope" }, body: { rsvpId: RSVP.kofi, from: "door" } })).status, 404);
  });
});

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

describe("DELETE /api/events/<id>/check-ins/<checkInId>", () => {
  test("for the people who run check-in only, and not during view-as", async (t) => {
    clock(t, DURING);
    w.reset();
    const made = await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    const id = made.body.row.checkIn.id;
    assert.equal((await undo(null, id)).status, 401);
    for (const who of ["kofi", "iris", "cal"]) assert.deepEqual(short(await undo(who, id)), [403, STAFF_ONLY], who);
    w.world.viewingAs = true;
    assert.equal((await undo("sue", id)).status, 403);
    w.world.viewingAs = false;
    assert.equal(checkIns().length, 1);
  });

  test("undoes it, once; a week after the event nothing changes any more", async (t) => {
    clock(t, DURING);
    w.reset();
    const made = await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    const id = made.body.row.checkIn.id;
    const res = await undo("sue", id);
    assert.deepEqual([res.status, res.body.removed], [200, id]);
    assert.equal(checkIns().length, 0);
    assert.deepEqual(short(await undo("sue", id)), [404, "That check-in isn’t there any more."]);

    const again = await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    t.mock.timers.reset();
    clock(t, WEEK_LATER);
    assert.deepEqual(short(await undo("sue", again.body.row.checkIn.id)), [
      409,
      "Check-ins can be changed from the door opening until a week after the event.",
    ]);
    assert.equal(checkIns().length, 1);
  });

  test("a check-in of another event is not this event's to undo", async (t) => {
    clock(t, DURING);
    w.reset({
      "eventCheckIns/elsewhere": { eventId: "another-event", kind: "walk-in", name: "X", how: "door", at: DURING, namesOff: false },
    });
    assert.equal((await undo("sue", "elsewhere")).status, 404);
    assert.ok(w.world.db.read("eventCheckIns/elsewhere"));
  });
});
