/**
 * THE DOOR LIST (ev-door-phone): the event's sign-ups with a Check in each, a
 * search and the count, for the people who run check-in, inside the door's
 * hours (an hour before the start to an hour after the end) and only once the
 * door is open.
 *
 * OPENING THE DOOR (`POST /api/events/<id>/door`): the event's author while
 * their account stands, and admins, inside the door's hours, once. Until
 * then the list shows the names and no Check in, and the route refuses a tick
 * and a walk-in at the door; adding somebody from the event's page works
 * either way.
 *
 * Through the real page (`/events/manage/<id>/door`) and the real routes
 * (`POST /api/events/<id>/door`, `POST /api/events/<id>/check-ins`,
 * `DELETE .../check-ins/<checkInId>`), as an admin, SU-recognised committee,
 * the event's organiser and its collaborator (committee the SU does not
 * recognise: counts only, so no door list), an approver, a member, a pending
 * account, signed out and view-as. The clock is set per test. The world is
 * `tests/lib/checkInWorld.mjs`. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  AFTER,
  BEFORE,
  DOOR_OPEN,
  DURING,
  EVENT_ID,
  OPENED_AT,
  PEOPLE,
  RSVP,
  SELF_ON,
  WEEK_LATER,
  makeCheckInWorld,
  person,
  withDropIn,
  withEvent,
} from "./lib/checkInWorld.mjs";

const w = await makeCheckInWorld("__doorList");
const { call, render, load } = w;
const page = await load("app/(app)/events/manage/[id]/door/page.tsx");
const tick = await load("app/api/events/[id]/check-ins/route.ts");
const undoRoute = await load("app/api/events/[id]/check-ins/[checkInId]/route.ts");
const doorCode = await load("app/api/events/[id]/door-code/route.ts");
const doorRoute = await load("app/api/events/[id]/door/route.ts");

function clock(t, at) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const press = (as, body) => call(tick.POST, { as, params: { id: EVENT_ID }, body });
const undo = (as, checkInId) => call(undoRoute.DELETE, { as, params: { id: EVENT_ID, checkInId } });
const open = (as) => render(page, { as, params: { id: EVENT_ID } });
const checkIns = () => w.world.db.paths().filter((path) => path.startsWith("eventCheckIns/"));
const short = (res) => [res.status, res.body?.error ?? null];

const STAFF_ONLY = "Only admins and SU-recognised committee members run check-in.";
const NOT_OPEN = "The door isn’t open yet. The event’s author or an admin opens it from the Check-in tab.";
const SELF_OFF = "Self check-in is off for this event: everyone gives their name here.";
/** The night, with the door open: Iris opened it at 1:05pm. */
const opened = (...extras) => w.reset(withEvent(DOOR_OPEN, ...extras));

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
    opened();
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
    assert.ok(!text.includes(NOT_OPEN), "the door is open");
    assert.match(text, /Add a walk-in$/);
  });

  test("before the door is opened: every name, no Check in and no walk-in, and a line saying who opens it", async (t) => {
    clock(t, DURING);
    w.reset();
    const { text, html } = await open("sue");
    assert.match(text, new RegExp(`VR games night Door list 0 of 3 here ${SELF_OFF} ${NOT_OPEN} To come 3 Here 0`));
    assert.match(text, /CN Chloe Nguyen Signed up GP Gwen Price Signed up KA Kofi Asante Signed up/);
    assert.match(text, /Not confirmed WH Wren Hale On the waiting list PE Pat Ellis Not decided yet/);
    assert.ok(!html.includes('aria-label="Check in'), "nothing to press");
    assert.ok(!text.includes("Add a walk-in"), "no walk-in either");
    // A door opened for the event before it was moved opens nothing tonight.
    w.reset(withEvent({ doorOpenedAt: new Date("2026-10-25T13:05:00Z"), doorOpenedBy: "iris" }));
    assert.match((await open("sue")).text, new RegExp(NOT_OPEN));
  });

  test("an event that does not let people check themselves in says so over the names, and offers no door code", async (t) => {
    clock(t, DURING);
    opened();
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    const off = await open("sue");
    assert.match(off.text, new RegExp(`Door list 0 of 3 here ${SELF_OFF} To come 3`));
    assert.ok(!off.text.includes("naisi.uk/q/vr-in"), "a door code that checks nobody in is not offered");
    opened(SELF_ON);
    const on = await open("sue");
    assert.ok(!on.text.includes(SELF_OFF));
  });

  test("letting people check themselves in, with a door code, the line under the list gives its address and who can use it", async (t) => {
    clock(t, DURING);
    opened(SELF_ON);
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    const { text, html } = await open("sue");
    assert.match(
      text,
      /Anyone signed in can check themselves in at naisi\.uk\/q\/vr-in ?, unless they’re still waiting for a place or were turned down\. People with a place can also use the link in their confirmation email, if it has one\. Add a walk-in$/,
    );
    assert.match(html, /check themselves in at <strong>naisi\.uk\/q\/vr-in<\/strong>, unless/);
    // At an event with no sign-up nobody holds a place or was sent a
    // confirmation, so the line names neither, by the rule the code's sign says.
    w.reset(withDropIn(SELF_ON, DOOR_OPEN));
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    const dropIn = await open("sue");
    assert.match(dropIn.text, /Anyone signed in can check themselves in at naisi\.uk\/q\/vr-in ?, unless they were turned down\. Add a walk-in$/);
    assert.ok(!/place|email/i.test(dropIn.text.slice(dropIn.text.indexOf("Anyone signed in"))), dropIn.text);
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
    opened();
    await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    const { text } = await open("zach");
    assert.match(text, /1 of 3 here/);
    assert.match(text, /To come 2 Here 1/);
    assert.match(text, /Just checked in KA Kofi Asante Door · 2:05pm/);
  });

  // A record whose names have come off stays in the count, as on the event's
  // Check-in tab: counted as here, listed nowhere, and its sign-up's row,
  // which keeps no tick, is said to be one of those who came.
  test("a name that comes off on the night: still here in the count, and the list says one of those to come came", async (t) => {
    clock(t, DURING);
    opened();
    await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    const { takeCheckInNamesOffForAccount } = await load("lib/events/checkIns.ts");
    assert.equal(await takeCheckInNamesOffForAccount(w.world.db, "kofi"), 1);
    const { text } = await open("sue");
    assert.match(text, /VR games night Door list 1 of 3 here/);
    assert.match(text, /To come 2 Here 1/);
    assert.match(
      text,
      /1 of these came, but their name has come off, so we can’t tell which\. CN Chloe Nguyen Signed up Check in GP Gwen Price Signed up Check in KA Kofi Asante Signed up Check in/,
    );
    assert.ok(!text.includes("Just checked in"), "nobody named came");
    // Once everybody else has come, nobody is still to come.
    await press("sue", { rsvpId: RSVP.chloe, from: "door" });
    await press("sue", { rsvpId: RSVP.gwen, from: "door" });
    const later = await open("sue");
    assert.match(later.text, /3 of 3 here/);
    assert.match(later.text, /To come 0 Here 3/);
    assert.match(later.text, /Everybody who signed up is here\./);
    assert.ok(!later.text.includes("of these came"));
  });

  test("a year on, when every name has come off: the night's count, and the list of who signed up says which can't be told", async (t) => {
    clock(t, DURING);
    opened();
    await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    await press("sue", { rsvpId: RSVP.chloe, from: "door" });
    await press("sue", { from: "door", walkIn: { name: "Mo Rahman" } });
    t.mock.timers.reset();
    const yearOn = new Date("2027-11-02T10:00:00Z");
    clock(t, yearOn);
    const { tidyCheckIns } = await load("lib/events/checkIns.ts");
    assert.equal((await tidyCheckIns(w.world.db, yearOn)).namesOff, 3);
    const { text, html } = await open("sue");
    assert.match(text, /VR games night Door list 2 of 3 here · 1 walk-in/);
    assert.match(text, /To come 1 Here 3/);
    assert.match(
      text,
      /2 of these came, but their names have come off, so we can’t tell which\. CN Chloe Nguyen Signed up GP Gwen Price Signed up KA Kofi Asante Signed up/,
    );
    assert.ok(!html.includes('aria-label="Check in'), "nothing to press a year on");
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
    opened();
    const res = await press("sue", { rsvpId: RSVP.gwen, from: "door" });
    assert.equal(res.status, 201);
    assert.equal(res.body.created, true);
    assert.deepEqual(Object.keys(res.body.row).sort(), ["checkIn", "key", "name", "rsvpId", "standing"]);
    assert.deepEqual(Object.keys(res.body.row.checkIn).sort(), ["at", "by", "emailGoesAt", "how", "id", "noEmail"]);
    assert.deepEqual(
      { ...res.body.row, checkIn: { ...res.body.row.checkIn, id: "-" } },
      {
        key: RSVP.gwen,
        rsvpId: RSVP.gwen,
        name: "Gwen Price",
        standing: "signed-up",
        // Who checked them in, by the name they go by: the event's page says it.
        checkIn: { id: "-", how: "door", at: DURING.toISOString(), by: "Sue", emailGoesAt: null, noEmail: false },
      },
    );
    assert.ok(!JSON.stringify(res.body).includes("gwen@example.com"), "no address in the answer");
    const stored = w.world.db.read(checkIns()[0]);
    assert.deepEqual([stored.kind, stored.rsvpId, stored.uid, stored.how, stored.byUid], ["signup", RSVP.gwen, null, "door", "sue"]);
  });

  test("pressed again, by anybody: the first check-in stands and nothing is added", async (t) => {
    clock(t, DURING);
    opened();
    await press("sue", { rsvpId: RSVP.kofi, from: "door" });
    const again = await press("zach", { rsvpId: RSVP.kofi, from: "door" });
    assert.equal(again.status, 200);
    assert.equal(again.body.created, false);
    assert.equal(again.body.row.checkIn.by, "Sue", "the first check-in's own, not the second press's");
    assert.equal(checkIns().length, 1);
  });

  test("the waiting list and the undecided can be let in; cancelled, refused and test sign-ups cannot", async (t) => {
    clock(t, DURING);
    opened();
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
    opened();
    const reads = w.world.db.stats.reads;
    assert.deepEqual(short(await press("sue", undefined)), [400, "Say who to check in."]);
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.kofi })), [400, "Say whether this is the door list or the event’s page."]);
    assert.deepEqual(short(await press("sue", { from: "door" })), [400, "Say who to check in."]);
    assert.deepEqual(short(await press("sue", { rsvpId: "../x", from: "door" })), [400, "Say who to check in."]);
    assert.equal(w.world.db.stats.reads, reads);
  });

  test("a sign-up that is not this event's, or not there, is a 404", async (t) => {
    clock(t, DURING);
    w.reset({
      ...withEvent(DOOR_OPEN),
      "eventRsvps/rsvp-elsewhere": { ...w.world.db.read(`eventRsvps/${RSVP.kofi}`), eventId: "another-event" },
    });
    assert.equal((await press("sue", { rsvpId: "rsvp-elsewhere", from: "door" })).status, 404);
    assert.equal((await press("sue", { rsvpId: "no-such-rsvp", from: "door" })).status, 404);
    assert.equal(checkIns().length, 0);
  });

  test("the door list only once the door is open, inside its hours; the event's page whether or not it was opened", async (t) => {
    clock(t, DURING);
    w.reset();
    const before = w.everything();
    assert.deepEqual(short(await press("sue", { rsvpId: RSVP.kofi, from: "door" })), [409, NOT_OPEN]);
    assert.deepEqual(short(await press("zach", { from: "door", walkIn: { name: "Dan Fitzgerald" } })), [409, NOT_OPEN]);
    assert.equal(w.everything(), before, "nothing was written");
    // From the event's page, as on any night: nobody had to open the door.
    const fromPage = await press("sue", { rsvpId: RSVP.kofi, from: "page" });
    assert.equal(fromPage.status, 201);
    assert.equal(fromPage.body.row.checkIn.how, "page");
    // Once Iris opens it, the door list takes its ticks.
    assert.equal((await call(doorRoute.POST, { as: "iris", params: { id: EVENT_ID } })).status, 201);
    assert.equal((await press("sue", { rsvpId: RSVP.chloe, from: "door" })).status, 201);
    assert.equal(checkIns().length, 2);
  });

  test("the door list only while the door is open; the event's page until a week after", async (t) => {
    opened();
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
    opened();
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
    opened();
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

// ---------------------------------------------------------------------------
// Opening the door
// ---------------------------------------------------------------------------

describe("POST /api/events/<id>/door", () => {
  const openDoor = (as, id = EVENT_ID) => call(doorRoute.POST, { as, params: { id } });
  const stored = () => {
    const event = w.world.db.read(`events/${EVENT_ID}`);
    return { at: event.doorOpenedAt ?? null, by: event.doorOpenedBy ?? null };
  };
  const ONLY = "Only the event’s author or an admin opens the door.";
  /** A member who approves events: not the event's author, so not somebody who opens its door. */
  const approver = person("april", "member", "April Stone", { permissions: { approveEvent: true } });

  test("refused to everybody but the event's author, while their account stands, and admins; nothing is written", async (t) => {
    clock(t, DURING);
    w.reset();
    const before = w.everything();
    assert.deepEqual(short(await openDoor(null)), [401, "Sign in first."]);
    const refused = [
      ["kofi", "a member"],
      ["cal", "a collaborator on the event"],
      ["sue", "SU-recognised committee, who run check-in"],
      [approver, "an approver of events"],
      ["ines", "a pending account"],
      [{ ...PEOPLE.iris, role: "rejected" }, "the event's author, rejected"],
      [{ ...PEOPLE.iris, role: "pending" }, "the event's author, pending"],
    ];
    for (const [who, why] of refused) assert.deepEqual(short(await openDoor(who)), [403, ONLY], why);
    w.world.viewingAs = true;
    assert.equal((await openDoor("iris")).status, 403, "view-as");
    assert.equal((await openDoor("zach")).status, 403, "view-as, as an admin");
    w.world.viewingAs = false;
    assert.equal(w.everything(), before);
  });

  test("decided before the event is shown to exist: one 403 for an event that is not there", async (t) => {
    clock(t, DURING);
    w.reset();
    for (const id of ["no-such-event", "../x"]) {
      for (const who of ["iris", "sue", "kofi"]) assert.deepEqual(short(await openDoor(who, id)), [403, ONLY], `${who} ${id}`);
      assert.deepEqual(short(await openDoor("zach", id)), [404, "There is no such event."], id);
    }
  });

  test("the author opens it inside the door's hours; pressing again, by anybody who may, answers with the first opening", async (t) => {
    clock(t, OPENED_AT);
    w.reset();
    const res = await openDoor("iris");
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { created: true, openedAt: OPENED_AT.toISOString() });
    assert.deepEqual(stored(), { at: OPENED_AT, by: "iris" });
    t.mock.timers.setTime(DURING.getTime());
    for (const who of ["iris", "zach"]) {
      const again = await openDoor(who);
      assert.equal(again.status, 200, who);
      assert.deepEqual(again.body, { created: false, openedAt: OPENED_AT.toISOString() }, who);
    }
    assert.deepEqual(stored(), { at: OPENED_AT, by: "iris" }, "the first opening stands");
  });

  test("an admin opens it as well", async (t) => {
    clock(t, DURING);
    w.reset();
    assert.equal((await openDoor("zach")).status, 201);
    assert.deepEqual(stored(), { at: DURING, by: "zach" });
  });

  test("only inside the door's hours, an hour either side of the event, and only for a published event", async (t) => {
    w.reset();
    clock(t, BEFORE);
    assert.deepEqual(short(await openDoor("iris")), [409, "You can open the door from 1pm on Sun 1 Nov, an hour before the start."]);
    t.mock.timers.setTime(new Date("2026-11-01T12:59:59Z").getTime());
    assert.equal((await openDoor("iris")).status, 409, "a second before");
    t.mock.timers.setTime(AFTER.getTime());
    assert.deepEqual(short(await openDoor("zach")), [409, "The door closed at 6pm, an hour after the end."]);
    t.mock.timers.setTime(new Date("2026-11-01T18:00:01Z").getTime());
    assert.equal((await openDoor("zach")).status, 409, "a second after");
    assert.deepEqual(stored(), { at: null, by: null }, "nothing was opened");
    t.mock.timers.setTime(new Date("2026-11-01T13:00:00Z").getTime());
    assert.equal((await openDoor("iris")).status, 201, "on the hour it opens");
    for (const status of ["draft", "pending", "approved", "cancelled"]) {
      w.reset(withEvent({ status }));
      assert.deepEqual(short(await openDoor("zach")), [409, "Only a published event has a door to open."], status);
      assert.deepEqual(stored(), { at: null, by: null }, status);
    }
    w.reset(withEvent({ startAt: null, endAt: null }));
    assert.deepEqual(short(await openDoor("zach")), [409, "This event has no date yet, so it has no door to open."]);
  });

  test("a door opened before the event was moved is no opening of tonight's: it is opened again", async (t) => {
    clock(t, DURING);
    const earlier = new Date("2026-10-25T13:05:00Z");
    w.reset(withEvent({ doorOpenedAt: earlier, doorOpenedBy: "zach" }));
    const res = await openDoor("iris");
    assert.equal(res.status, 201);
    assert.deepEqual(stored(), { at: DURING, by: "iris" });
  });
});
