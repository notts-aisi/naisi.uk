/**
 * CHECKING YOURSELF IN (ev-self-phone): the page an event's door code lands
 * on (`/events/<id>/check-in`) and its button (`POST /api/events/<id>/check-in`).
 *
 * THE SWITCH. An event lets people check themselves in only when it says so
 * (`selfCheckIn`, a stored true and nothing else): every event starts off,
 * and an event made before the switch existed has no field and is off. Off,
 * the page and the route say one sentence to everybody and nothing is
 * written, and the confirmation emails say to give your name at the door and
 * carry no link. On, it works only once the event's author or an admin has
 * opened the door.
 *
 * Every kind of person at the door: a member with a confirmed sign-up, a
 * member with no sign-up (a walk-in with their account), one who cancelled,
 * one on the waiting list, one not decided yet, one refused, a guest with no
 * account through the link in their own confirmation email, a wrong link,
 * somebody signed out, and view-as. Each way in is recorded as itself: `code`
 * from a page the door code opened, `email` through the link, `site` signed
 * in and neither. And every state of the evening: before the door's hours,
 * inside them before the door is opened and after, after them; a cancelled
 * event, a draft and one that is not there, which a printed code must still
 * answer with a page. Last, the door code's words (its card, its sign and the
 * door list), held person by person to who the press lets in, at an event
 * that takes sign-ups and at one with no sign-up.
 *
 * The world is `tests/lib/checkInWorld.mjs`. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { render as renderEmail } from "@react-email/render";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AFTER,
  BEFORE,
  DOOR_OPEN,
  DURING,
  END,
  EVENT_ID,
  OPENED_AT,
  PEOPLE,
  RSVP,
  SELF_ON,
  START,
  checkInSeed,
  eventDoc,
  makeCheckInWorld,
  person,
  rsvp,
  textOf,
  withDropIn,
  withEvent,
} from "./lib/checkInWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

process.env.EVENTS_TOKEN_SECRET = "a-secret-for-the-check-in-suite-only-0123456789";

const w = await makeCheckInWorld("__selfCheckIn");
const { call, render, load } = w;
const page = await load("app/events/[id]/check-in/page.tsx");
const checkedIn = await load("app/events/[id]/check-in/CheckedIn.tsx");
const imHere = await load("app/events/[id]/check-in/ImHere.tsx");
const route = await load("app/api/events/[id]/check-in/route.ts");
const tokens = await load("lib/events/rsvpToken.ts");
const self = await load("lib/events/selfCheckIn.ts");
const rules = await load("lib/events/checkIns.ts");
const { normalizeEvent } = await load("lib/firestore/events.ts");

function clock(t, at) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const open = (as, searchParams = {}, id = EVENT_ID) => render(page, { as, params: { id }, searchParams });
const press = (as, body, id = EVENT_ID) => call(route.POST, { as, params: { id }, body });
const checkIns = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("eventCheckIns/"))
    .map((path) => w.world.db.read(path));
const short = (res) => [res.status, res.body?.error ?? null];
const gwenLink = () => ({ r: RSVP.gwen, t: tokens.signRsvpToken(RSVP.gwen, "gwen@example.com") });
/** The night with people allowed to check themselves in, and the door open. */
const night = (...extras) => w.reset(withEvent(SELF_ON, DOOR_OPEN, ...extras));

const LINE = "VR games night · Sun 1 Nov · 2pm to 5pm · Room B52";
const WHO_SEES =
  "This checks you in on the door list. Only NAISI’s admins and the committee members the Students’ Union recognises can see who came.";
const NAMES = ["Kofi", "Chloe", "Gwen", "Wren", "Pat", "Cora", "Dina", "Asante", "Nguyen"];
const AT_THE_DOOR_ONLY = "Check-in for this event is at the door. Give your name to whoever’s there.";
const NOT_OPEN_YET = "The door isn’t open yet. Try again in a few minutes, or give your name at the door.";

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

describe("whether an event lets people check themselves in", () => {
  test("an event made before the switch existed does not, as a new one does not", () => {
    assert.equal(normalizeEvent("e1", { title: "Reading group" }).selfCheckIn, false);
    assert.equal(normalizeEvent(EVENT_ID, eventDoc()).selfCheckIn, false, "the suite's own event has no field");
    assert.ok(!("selfCheckIn" in eventDoc()), "and stores none");
  });

  test("only a strict true is on", () => {
    assert.equal(normalizeEvent("e1", { selfCheckIn: true }).selfCheckIn, true);
    for (const value of [false, null, undefined, "true", 1, "yes", {}]) {
      assert.equal(normalizeEvent("e1", { selfCheckIn: value }).selfCheckIn, false, JSON.stringify(value));
    }
  });

  test("the door is read as opened only by the door route's two fields, inside the event's hours as they stand", () => {
    const night = (extra) => normalizeEvent(EVENT_ID, eventDoc(extra));
    assert.deepEqual(rules.openingOf(night(DOOR_OPEN)), { at: OPENED_AT, by: "iris" });
    assert.equal(rules.openingOf(night({})), null);
    assert.equal(rules.openingOf(night({ doorOpenedAt: OPENED_AT })), null, "an opening nobody made");
    assert.equal(rules.openingOf(night({ doorOpenedAt: "2026-11-01T13:05:00Z", doorOpenedBy: "iris" })), null, "not a time");
    // Moved a week on after the door was opened: that opening was of another door.
    const moved = night({ ...DOOR_OPEN, startAt: new Date("2026-11-08T14:00:00Z"), endAt: new Date("2026-11-08T17:00:00Z") });
    assert.equal(rules.openingOf(moved), null);
    assert.equal(rules.doorListOpen(moved, new Date("2026-11-08T14:05:00Z")), false);
  });

  test("self check-in works exactly when the switch is on, the event is published and its door is open", () => {
    const at = (extra, now = DURING) => rules.selfCheckInOpen(normalizeEvent(EVENT_ID, eventDoc(extra)), now);
    assert.equal(at({ ...SELF_ON, ...DOOR_OPEN }), true);
    assert.equal(at({ ...DOOR_OPEN }), false, "off");
    assert.equal(at({ ...SELF_ON }), false, "the door not opened");
    assert.equal(at({ ...SELF_ON, ...DOOR_OPEN, status: "cancelled" }), false, "cancelled");
    assert.equal(at({ ...SELF_ON, ...DOOR_OPEN }, AFTER), false, "after the door's hours");
    assert.equal(at({ ...SELF_ON, ...DOOR_OPEN }, BEFORE), false, "before them");
    // The page's words say why exactly when it does not.
    for (const [extra, now] of [
      [{ ...SELF_ON, ...DOOR_OPEN }, DURING],
      [{ ...DOOR_OPEN }, DURING],
      [{ ...SELF_ON }, DURING],
      [{ ...SELF_ON, ...DOOR_OPEN }, AFTER],
      [{ ...SELF_ON, ...DOOR_OPEN }, BEFORE],
      [{ selfCheckIn: "true", ...DOOR_OPEN }, DURING],
    ]) {
      const event = normalizeEvent(EVENT_ID, eventDoc(extra));
      assert.equal(self.selfClosedWords(event, now) === null, rules.selfCheckInOpen(event, now), JSON.stringify(extra));
    }
  });
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

describe("the page the door code lands on", () => {
  test("an event that does not let people check themselves in: one sentence, to everybody, and no button", async (t) => {
    clock(t, DURING);
    // As every event starts, with no field; and with the switch stored off, the door open either way.
    for (const over of [{}, withEvent(DOOR_OPEN), withEvent({ selfCheckIn: false }, DOOR_OPEN), withEvent({ selfCheckIn: "true" }, DOOR_OPEN)]) {
      w.reset(over);
      for (const [who, searchParams] of [[null, {}], ["kofi", {}], ["mo", {}], ["wren", {}], [null, gwenLink()], ["kofi", { q: "vr-in" }]]) {
        const { text, html } = await open(who, searchParams);
        assert.equal(text, `NAISI Check in ${LINE} Check in ${AT_THE_DOOR_ONLY}`, `${who ?? "signed out"}`);
        assert.ok(!html.includes("I’m here") && !html.includes("Sign in"), "no button, and nothing to sign in for");
        for (const name of NAMES) assert.ok(!html.includes(name), `${name} is not named`);
      }
    }
  });

  test("the switch on, inside the door's hours, before the door is opened: it says so, and no button", async (t) => {
    clock(t, DURING);
    w.reset(withEvent(SELF_ON));
    for (const who of [null, "kofi"]) {
      const { text, html } = await open(who);
      assert.equal(text, `NAISI Check in ${LINE} Check in ${NOT_OPEN_YET}`);
      assert.ok(!html.includes("I’m here"));
    }
  });

  test("signed out at the door: asked to sign in, told about the email's link, and nobody is named", async (t) => {
    clock(t, DURING);
    night();
    const { text, html } = await open(null);
    assert.equal(
      text,
      `NAISI Check in ${LINE} Are you here? Sign in to check yourself in. Sign in ` +
        "Signed up without an account? Open the check-in link in your confirmation email. " +
        "Otherwise, give your name at the door.",
    );
    assert.match(html, new RegExp(`href="/login\\?next=%2Fevents%2F${EVENT_ID}%2Fcheck-in"`));
    for (const name of NAMES) assert.ok(!html.includes(name), `${name} is not named`);
  });

  test("opened by the door code, signing in comes back the same way in, without counting the scan twice", async (t) => {
    clock(t, DURING);
    night();
    const { html } = await open(null, { q: "vr-in", counted: "1" });
    assert.match(html, new RegExp(`href="/login\\?next=%2Fevents%2F${EVENT_ID}%2Fcheck-in%3Fq%3Dvr-in%26counted%3D1"`));
    // A `q` that is not a short link's is not a door code.
    for (const q of ["VR-IN", "x".repeat(17), "../links"]) {
      assert.match((await open(null, { q })).html, new RegExp(`href="/login\\?next=%2Fevents%2F${EVENT_ID}%2Fcheck-in"`), q);
    }
    assert.equal(self.checkInReturnPath(EVENT_ID, "vr-in"), `/events/${EVENT_ID}/check-in?q=vr-in&counted=1`);
    assert.equal(self.checkInReturnPath(EVENT_ID, null), `/events/${EVENT_ID}/check-in`);
  });

  test("the page hands its button the way it was opened: the door code, or not", async (t) => {
    clock(t, DURING);
    night();
    /** The props the page gives "I'm here", read off the page it draws. */
    async function buttonProps(as, searchParams) {
      w.world.user = as ? PEOPLE[as] : null;
      const tree = await page.default({ params: Promise.resolve({ id: EVENT_ID }), searchParams: Promise.resolve(searchParams) });
      const found = [];
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        if (node.type === imHere.ImHere) found.push(node.props);
        walk(node.props?.children);
      };
      walk(tree);
      assert.equal(found.length, 1, "one button");
      return found[0];
    }
    assert.equal((await buttonProps("kofi", { q: "vr-in" })).doorCode, true);
    assert.equal((await buttonProps("kofi", {})).doorCode, false);
    assert.equal((await buttonProps("kofi", { q: "Not a slug" })).doorCode, false);
    // What the press then sends: the email's link decides alone; the door code says so; else nothing.
    assert.deepEqual(imHere.pressBody({ rsvpId: RSVP.gwen, token: "t", doorCode: true }), { rsvpId: RSVP.gwen, token: "t" });
    assert.deepEqual(imHere.pressBody({ rsvpId: null, token: null, doorCode: true }), { doorCode: true });
    assert.deepEqual(imHere.pressBody({ rsvpId: null, token: null, doorCode: false }), {});
  });

  test("a member with a confirmed sign-up: Hi, are you here, and one button that waits for the script", async (t) => {
    clock(t, DURING);
    night();
    const { text, html } = await open("kofi");
    assert.equal(
      text,
      `NAISI Check in ${LINE} Hi Kofi. Are you here? You signed up for this. I’m here ${WHO_SEES} ` +
        "There may be a short survey afterwards. Not you? Sign out →",
    );
    assert.match(html, /<button[^>]*disabled=""[^>]*>I’m here<\/button>/);
  });

  test("a member with no sign-up, or a cancelled one, is checked in as a walk-in", async (t) => {
    clock(t, DURING);
    for (const who of ["mo", "cora"]) {
      night();
      const { text } = await open(who);
      assert.match(
        text,
        /Are you here\? You didn’t sign up, so this checks you in as a walk-in\. I’m here/,
        who,
      );
    }
  });

  test("a drop-in needs no sign-up, and says so", async (t) => {
    clock(t, DURING);
    night({ noSignup: true });
    const { text } = await open("mo");
    assert.match(text, /Hi Mo\. Are you here\? No sign-up needed for this one\. I’m here/);
  });

  test("the waiting list, the undecided and the refused give their name at the door: no button", async (t) => {
    clock(t, DURING);
    night();
    const cases = [
      ["wren", "Hi Wren. You’re on the waiting list for this. Give your name at the door, and they’ll check you in if there’s room."],
      ["pat", "Hi Pat. Your sign-up hasn’t been confirmed yet. Give your name at the door, and they’ll check you in."],
      ["dina", "Hi Dina. Give your name at the door, and they’ll check you in."],
    ];
    for (const [who, words] of cases) {
      const { text, html } = await open(who);
      assert.equal(text, `NAISI Check in ${LINE} ${words} Not you? Sign out →`, who);
      assert.ok(!html.includes("I’m here"), `${who} has no button`);
    }
  });

  test("somebody already checked in is told so, and when", async (t) => {
    clock(t, DURING);
    night();
    await press("kofi", {});
    const { text } = await open("kofi");
    assert.match(text, /You’re checked in, Kofi\. Checked in at 2:05pm\./);
    assert.ok(!text.includes("I’m here"));
  });

  test("B5: once checked in the question goes: the answer is one view, after the press as on the next visit", async (t) => {
    clock(t, DURING);
    night();
    const pressed = await press("kofi", {});
    assert.equal(pressed.status, 201);
    // What the button draws the moment its press goes through: the shared view, with the route's own answer.
    const afterPress = textOf(renderToStaticMarkup(createElement(checkedIn.CheckedIn, { firstName: "Kofi", atWords: pressed.body.atWords })));
    assert.equal(
      afterPress,
      "You’re checked in, Kofi. Checked in at 2:05pm. " +
        "You’re on the door list. Only NAISI’s admins and the committee members the Students’ Union recognises can see who came.",
    );
    // The page on the next visit draws the same, then what the question page has under it; nothing of the question.
    const { text } = await open("kofi");
    assert.equal(text, `NAISI Check in ${LINE} ${afterPress} There may be a short survey afterwards. Not you? Sign out →`);
    assert.doesNotMatch(text, /Are you here|You signed up for this|This checks you in|I’m here/);
    // The button's done state is that view and nothing else: the question above it was the button's own to draw.
    const code = (file) =>
      stripSource(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "events", "[id]", "check-in", file), "utf8"), { keepStrings: true });
    const button = code("ImHere.tsx");
    assert.match(button, /if \(state\.kind === "done"\) return <CheckedIn firstName=\{firstName\} atWords=\{state\.atWords\} \/>;/);
    // And what it sends is the body the suite runs above.
    assert.match(button, /body: JSON\.stringify\(pressBody\(\{ rsvpId, token, doorCode \}\)\),/);
    const shell = code("page.tsx");
    assert.equal((shell.match(/Are you here\?/g) ?? []).length, 2, "the question is the button's, and the signed-out page's own");
    assert.ok(!shell.includes("{WHO_SEES}</p>"), "the line about what the press does is drawn by the button, so it goes with the question");
  });

  test("a guest through their own email's link: their sign-up, no account and no sign-out", async (t) => {
    clock(t, DURING);
    night();
    const { text } = await open(null, gwenLink());
    assert.equal(
      text,
      `NAISI Check in ${LINE} Hi Gwen. Are you here? You signed up for this. I’m here ${WHO_SEES} ` +
        "There may be a short survey afterwards.",
    );
  });

  test("a link that is wrong, or for somebody else's sign-up, works for nothing and names nobody", async (t) => {
    clock(t, DURING);
    night();
    const wrong = [
      { r: RSVP.gwen, t: "x".repeat(32) },
      { r: RSVP.kofi, t: gwenLink().t },
      { r: "no-such-rsvp", t: gwenLink().t },
    ];
    for (const link of wrong) {
      const { text, html } = await open(null, link);
      assert.equal(text, `NAISI Check in ${LINE} This link doesn’t work here It isn’t for this event. Give your name at the door.`);
      for (const name of NAMES) assert.ok(!html.includes(name), `${name} is not named`);
    }
  });

  test("before the door's hours, and after they end, it says when; no button", async (t) => {
    night();
    clock(t, BEFORE);
    assert.equal((await open("kofi")).text, `NAISI Check in ${LINE} Check in Check-in opens at 1pm on Sun 1 Nov, an hour before the start.`);
    t.mock.timers.reset();
    clock(t, AFTER);
    assert.equal((await open("kofi")).text, `NAISI Check in ${LINE} Check in Check-in at the door has closed.`);
  });

  test("a cancelled event, a draft and one that is gone each answer with a page, never a blank 404", async (t) => {
    clock(t, DURING);
    night({ status: "cancelled" });
    assert.equal((await open("kofi")).text, `NAISI Check in ${LINE} This event was cancelled`);
    const gone =
      "NAISI Check in There’s nothing to check in to here This code is for an event that isn’t on the site any more. Give your name at the door. See what’s on";
    night({ status: "draft" });
    assert.equal((await open("kofi")).text, gone, "a draft is not shown");
    night();
    assert.equal((await open("kofi", {}, "no-such-event")).text, gone);
    assert.equal((await open(null, {}, "../../x")).text, gone);
  });
});

// ---------------------------------------------------------------------------
// The button
// ---------------------------------------------------------------------------

describe("POST /api/events/<id>/check-in", () => {
  test("an event that does not let people check themselves in refuses everybody with the one sentence, and writes nothing", async (t) => {
    clock(t, DURING);
    for (const over of [{}, withEvent(DOOR_OPEN), withEvent({ selfCheckIn: "true" }, DOOR_OPEN)]) {
      w.reset(over);
      const before = w.everything();
      const link = gwenLink();
      for (const [who, body] of [["kofi", {}], ["kofi", { doorCode: true }], ["mo", {}], ["wren", {}], [null, { rsvpId: link.r, token: link.t }]]) {
        assert.deepEqual(short(await press(who, body)), [409, AT_THE_DOOR_ONLY], `${who ?? "the guest's link"}`);
      }
      assert.equal(w.everything(), before);
    }
  });

  test("the switch on, before the door is opened: refused, and nothing written", async (t) => {
    clock(t, DURING);
    w.reset(withEvent(SELF_ON));
    const link = gwenLink();
    assert.deepEqual(short(await press("kofi", {})), [409, NOT_OPEN_YET]);
    assert.deepEqual(short(await press(null, { rsvpId: link.r, token: link.t })), [409, NOT_OPEN_YET]);
    assert.equal(checkIns().length, 0);
  });

  test("a confirmed sign-up checks in as the sign-up, by themselves, once", async (t) => {
    clock(t, DURING);
    night();
    const res = await press("kofi", {});
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { checkedIn: true, created: true, at: DURING.toISOString(), atWords: "2:05pm" });
    const [row] = checkIns();
    assert.deepEqual([row.kind, row.rsvpId, row.uid, row.how, row.byUid], ["signup", RSVP.kofi, "kofi", "site", null]);
    const again = await press("kofi", {});
    assert.deepEqual([again.status, again.body.created], [200, false]);
    assert.equal(checkIns().length, 1);
  });

  test("a member with no sign-up is a walk-in with their account and their name", async (t) => {
    clock(t, DURING);
    night();
    assert.equal((await press("mo", {})).status, 201);
    const [row] = checkIns();
    assert.deepEqual([row.kind, row.rsvpId, row.uid, row.name, row.email, row.how], ["walk-in", null, "mo", "Mo Rahman", null, "site"]);
  });

  test("the waiting list, the undecided and the refused are told to give their name; nothing is written", async (t) => {
    clock(t, DURING);
    night();
    assert.deepEqual(short(await press("wren", {})), [
      409,
      "You’re on the waiting list for this. Give your name at the door, and they’ll check you in if there’s room.",
    ]);
    assert.equal((await press("pat", {})).status, 409);
    assert.equal((await press("dina", {})).status, 409);
    assert.equal(checkIns().length, 0);
  });

  test("a guest through their email's link checks in as their sign-up; a wrong link does nothing", async (t) => {
    clock(t, DURING);
    night();
    const link = gwenLink();
    assert.deepEqual(short(await press(null, { rsvpId: link.r, token: "y".repeat(32) })), [
      403,
      "This link doesn’t work for this event. Give your name at the door.",
    ]);
    assert.equal(checkIns().length, 0);
    const res = await press(null, { rsvpId: link.r, token: link.t });
    assert.equal(res.status, 201);
    const [row] = checkIns();
    assert.deepEqual([row.kind, row.rsvpId, row.uid, row.how, row.byUid], ["signup", RSVP.gwen, null, "email", null]);
  });

  test("signed out with no link: 401; a half link, or a door code that is not a yes or no: 400 with a sentence; view-as: refused", async (t) => {
    clock(t, DURING);
    night();
    assert.deepEqual(short(await press(null, {})), [
      401,
      "Sign in to check yourself in, or use the link in your confirmation email.",
    ]);
    assert.deepEqual(short(await press(null, { rsvpId: RSVP.gwen })), [
      400,
      "That link isn’t complete. Open it again from your email, or give your name at the door.",
    ]);
    for (const doorCode of ["yes", 1, "vr-in", null]) {
      assert.equal((await press("kofi", { doorCode })).status, 400, JSON.stringify(doorCode));
    }
    w.world.viewingAs = true;
    assert.equal((await press("kofi", {})).status, 403);
    w.world.viewingAs = false;
    assert.equal(checkIns().length, 0);
  });

  test("only while the door is open, and only at a published event", async (t) => {
    night();
    clock(t, BEFORE);
    assert.deepEqual(short(await press("kofi", {})), [409, "Check-in opens at 1pm on Sun 1 Nov, an hour before the start."]);
    t.mock.timers.reset();
    clock(t, AFTER);
    assert.deepEqual(short(await press("kofi", {})), [409, "Check-in at the door has closed."]);
    t.mock.timers.reset();
    clock(t, DURING);
    night({ status: "draft" });
    assert.deepEqual(short(await press("kofi", {})), [404, "There’s no event to check in to here."]);
    night({ status: "cancelled" });
    assert.deepEqual(short(await press("kofi", {})), [409, "This event was cancelled."]);
    assert.equal(checkIns().length, 0);
  });
});

// ---------------------------------------------------------------------------
// Each way in, recorded as itself
// ---------------------------------------------------------------------------

describe("each way in is recorded as itself", () => {
  test("the door code, the email's link and the page itself, for a sign-up and for a walk-in", async (t) => {
    clock(t, DURING);
    const link = gwenLink();
    const cases = [
      ["kofi", {}, "site", "a member on the check-in page, signed in"],
      ["kofi", { doorCode: true }, "code", "a member on a page the door code opened"],
      ["mo", {}, "site", "a walk-in with an account, on the page"],
      ["mo", { doorCode: true }, "code", "a walk-in with an account, by the door code"],
      [null, { rsvpId: link.r, token: link.t }, "email", "a guest through their email's link"],
      // The link is the guest's whole credential: it decides, whatever page it was pressed on.
      [null, { rsvpId: link.r, token: link.t, doorCode: true }, "email", "the link, on a page the door code opened"],
      ["kofi", { doorCode: false }, "site", "a door code that says no"],
    ];
    for (const [who, body, how, why] of cases) {
      night();
      assert.equal((await press(who, body)).status, 201, why);
      const [row] = checkIns();
      assert.equal(row.how, how, why);
      assert.equal(row.byUid, null, why);
    }
  });

  test("the way is decided in one place for the route: the link, then the door code, then the page", () => {
    assert.equal(self.selfHow({ viaLink: true, doorCode: true }), "email");
    assert.equal(self.selfHow({ viaLink: true, doorCode: false }), "email");
    assert.equal(self.selfHow({ viaLink: false, doorCode: true }), "code");
    assert.equal(self.selfHow({ viaLink: false, doorCode: false }), "site");
    const routeCode = stripSource(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "api", "events", "[id]", "check-in", "route.ts"), "utf8"), { keepStrings: true });
    assert.match(routeCode, /how: selfHow\(\{ viaLink: decision\.viaLink, doorCode: parsed\.doorCode \}\),/);
    assert.ok(!/how: "qr"/.test(routeCode), "a self check-in is still written as the old catch-all");
  });
});

// The mail door and the database the RSVP routes reach, for the emails below.
const mail = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export class NextResponse {\n" +
        "  constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; }\n" +
        "  static json(body, init = {}) { return new NextResponse(body, init); }\n" +
        "}",
    ],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export const getAdminDb = () => globalThis.__checkInMailDb ?? null;"],
    ["@/lib/firebase/session", "export const getCurrentUser = async () => globalThis.__checkInMailUser ?? null;"],
    ["@/lib/email/send", "export const sendEmail = async (args) => { (globalThis.__checkInMail ||= []).push(args); };"],
    ["@/lib/firestore/suppression", "export const isSuppressed = async () => false;"],
  ]),
});
const { sendRsvpEmail } = await mail.loadTs("lib/events/sendRsvpEmail.ts");
const approveRoute = await mail.loadTs("app/api/events/[id]/rsvp/[rsvpId]/approve/route.ts");
const cancelRoute = await mail.loadTs("app/api/events/[id]/rsvp/[rsvpId]/cancel/route.ts");

// ---------------------------------------------------------------------------
// The confirmation emails
// ---------------------------------------------------------------------------

describe("the confirmation emails follow the switch", () => {
  const ON = "On the day, check yourself in from this email, or give your name at the door.";
  const OFF = "On the day, give your name at the door.";
  const TODAY = "at the door from this email, or give your name there.";
  const token = () => tokens.signRsvpToken(RSVP.gwen, "gwen@example.com");
  const linkTo = () => `/events/${EVENT_ID}/check-in?r=${RSVP.gwen}&amp;t=${token()}`;
  const event = (extra = {}) => ({
    id: EVENT_ID,
    title: "VR games night",
    location: "Room B52",
    startAt: new Date("2026-11-01T14:00:00Z"),
    endAt: new Date("2026-11-01T17:00:00Z"),
    ...extra,
  });
  /** The email `variant` sends Gwen about the event with `extra` on it: its words, and its markup. */
  async function mailed(variant, extra) {
    globalThis.__checkInMail = [];
    await sendRsvpEmail({ variant, to: "gwen@example.com", recipientName: "Gwen", event: event(extra), rsvpId: RSVP.gwen });
    const [sent] = globalThis.__checkInMail;
    const html = await renderEmail(sent.react);
    return { text: textOf(html), html };
  }

  test("on: the emails that hold a place link to check in with the sign-up's token; the others do not", async () => {
    for (const variant of ["approved", "promoted"]) {
      const { text, html } = await mailed(variant, SELF_ON);
      assert.ok(html.includes(linkTo()), `${variant}: the link`);
      assert.ok(text.includes(ON), `${variant}: the words`);
      assert.match(
        html,
        /On the day,(?:<!-- -->)?\s*<a[^>]*href="[^"]*\/check-in\?r=[^"]*"[^>]*>check yourself in<\/a>/,
        `${variant}: the link is on "check yourself in"`,
      );
      assert.ok(!text.includes(OFF) && !text.includes(TODAY), variant);
    }
    for (const variant of ["requested", "waitlisted"]) {
      const { text, html } = await mailed(variant, SELF_ON);
      assert.ok(!html.includes("/check-in?"), `${variant} holds no place, so no check-in link`);
      assert.ok(!text.includes("On the day"), `${variant} says nothing about the day`);
    }
  });

  test("off, or never said: give your name at the door, and no check-in link is built at all", async () => {
    for (const extra of [{}, { selfCheckIn: false }, { selfCheckIn: "true" }, { selfCheckIn: null }]) {
      for (const variant of ["approved", "promoted"]) {
        const { text, html } = await mailed(variant, extra);
        assert.ok(text.includes(OFF), `${variant} ${JSON.stringify(extra)}`);
        assert.ok(!html.includes("/check-in"), `${variant} ${JSON.stringify(extra)}: a check-in link`);
        assert.ok(!text.includes("check yourself in") && !text.includes(TODAY), `${variant} ${JSON.stringify(extra)}`);
      }
      for (const variant of ["requested", "waitlisted"]) {
        assert.ok(!(await mailed(variant, extra)).text.includes("On the day"), variant);
      }
    }
  });

  /** The same documents, with the ordering the cancel route's waiting list asks for, sorted here. */
  function ordered(db) {
    const wrapQuery = (inner, order = null, max = null) => ({
      path: inner.path,
      isQuery: true,
      where: (...args) => wrapQuery(inner.where(...args), order, max),
      orderBy: (field, direction = "asc") => wrapQuery(inner, [field, direction], max),
      limit: (n) => wrapQuery(inner, order, n),
      get: async () => {
        let docs = (await inner.get()).docs;
        if (order) {
          const [field, direction] = order;
          const at = (doc) => doc.data()?.[field]?.getTime?.() ?? 0;
          docs = [...docs].sort((a, b) => (direction === "desc" ? at(b) - at(a) : at(a) - at(b)));
        }
        if (typeof max === "number") docs = docs.slice(0, max);
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    });
    return Object.assign(Object.create(Object.getPrototypeOf(db)), db, {
      collection: (name) => {
        const inner = db.collection(name);
        return { ...wrapQuery(inner), doc: inner.doc };
      },
    });
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  test("through the routes: a place confirmed, and a move up from the waiting list, each as the event says", async () => {
    for (const [extra, words] of [[{}, OFF], [SELF_ON, ON]]) {
      // A place confirmed: Gwen's sign-up, pending, approved by an admin.
      const seed = checkInSeed(withEvent(extra));
      seed[`eventRsvps/${RSVP.gwen}`] = { ...seed[`eventRsvps/${RSVP.gwen}`], status: "pending" };
      globalThis.__checkInMailDb = makeDb(seed, { now: () => new Date() });
      globalThis.__checkInMailUser = PEOPLE.zach;
      globalThis.__checkInMail = [];
      const approved = await approveRoute.POST({}, { params: Promise.resolve({ id: EVENT_ID, rsvpId: RSVP.gwen }) });
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      await settle();
      const approvedMail = await renderEmail(globalThis.__checkInMail.find((sent) => sent.to === "gwen@example.com").react);
      assert.ok(textOf(approvedMail).includes(words), `approved, ${JSON.stringify(extra)}`);
      assert.equal(approvedMail.includes("/check-in?r="), words === ON);

      // A move up: Kofi gives his place back and Wren, on the waiting list, gets it.
      const later = checkInSeed(withEvent(extra));
      globalThis.__checkInMailDb = ordered(makeDb(later, { now: () => new Date() }));
      globalThis.__checkInMail = [];
      const cancelled = await cancelRoute.POST(
        { url: "https://internal.invalid/", json: async () => ({}) },
        { params: Promise.resolve({ id: EVENT_ID, rsvpId: RSVP.kofi }) },
      );
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      assert.deepEqual(cancelled.body.promoted, { id: RSVP.wren });
      await settle();
      const promoted = globalThis.__checkInMail.find((sent) => sent.to === "wren@example.com");
      assert.ok(promoted, "Wren was told");
      const promotedMail = await renderEmail(promoted.react);
      assert.ok(textOf(promotedMail).includes(words), `promoted, ${JSON.stringify(extra)}`);
      assert.equal(promotedMail.includes("/check-in?r="), words === ON);
    }
    globalThis.__checkInMailDb = null;
    globalThis.__checkInMailUser = null;
  });
});

// ---------------------------------------------------------------------------
// What the door code's words say, person by person
// ---------------------------------------------------------------------------

/**
 * The door code's card on the Check-in tab and its printed sign say who can
 * check themselves in (`doorCodeLine`), and the door list says the same
 * beside the code's address. Here every kind of person presses "I'm here" on
 * a page the code opened, at an event that takes sign-ups and at one with no
 * sign-up, and each answer is held to the group the words put them in: anyone
 * signed in can, unless still waiting for a place or turned down (a refused
 * sign-up, or an account whose request to join was turned down); a place's
 * email link can, if the email has one; everyone else gives their name at the
 * door. A person the words leave out, or put in the wrong group, fails here.
 */
const view = await load("lib/events/checkInView.ts");

describe("the door code's words say exactly who can press I’m here", () => {
  /** An account whose request to join was turned down, signed in: `decideSelf` sends it to the door. */
  const rex = person("rex", "rejected", "Rex Moor");
  const CAN = "anyone signed in";
  const WAITING = "still waiting for a place";
  const TURNED_DOWN = "were turned down";
  /** What each group's press answers: checked in by the code, or sent to the door with nothing written. */
  async function pressedByCode(who, why) {
    const before = checkIns().length;
    const res = await press(who, { doorCode: true });
    return { res, wrote: checkIns().length - before, why };
  }

  test("an event that takes sign-ups: anyone signed in, unless still waiting for a place or turned down; a place's email link, if it has one", async (t) => {
    clock(t, DURING);
    const line = view.doorCodeLine({ noSignup: false });
    assert.equal(
      line,
      "Anyone signed in can check themselves in by scanning this code, unless they’re still waiting for a place or were turned down. " +
        "People with a place can also use the link in their confirmation email, if it has one. Everyone else gives their name at the door.",
    );
    // The door list says the same beside the code's address: the same groups, the same email link.
    const listed = view.doorListSelfWords({ noSignup: false });
    assert.equal(
      `${listed.before}naisi.uk/q/vr-in${listed.after}`,
      "Anyone signed in can check themselves in at naisi.uk/q/vr-in, unless they’re still waiting for a place or were turned down. " +
        "People with a place can also use the link in their confirmation email, if it has one.",
    );
    const rows = [
      ["kofi", CAN, "a confirmed sign-up, checked in as it"],
      ["mo", CAN, "no sign-up: a walk-in with the account"],
      ["cora", CAN, "only a cancelled sign-up: a walk-in with the account"],
      ["ines", CAN, "a pending account with no sign-up: a walk-in with the account"],
      ["wren", WAITING, "on the waiting list"],
      ["pat", WAITING, "a sign-up not decided yet"],
      ["dina", TURNED_DOWN, "a refused sign-up"],
      [rex, TURNED_DOWN, "an account whose request to join was turned down"],
    ];
    for (const [who, group, why] of rows) {
      night();
      assert.ok(group === CAN ? line.startsWith("Anyone signed in can check themselves in") : line.includes(group), `the words name ${why}`);
      const { res, wrote } = await pressedByCode(who, why);
      if (group === CAN) {
        assert.equal(res.status, 201, why);
        assert.equal(checkIns()[0].how, "code", why);
      } else {
        assert.equal(res.status, 409, why);
        assert.match(res.body.error, /Give your name at the door/, why);
        assert.equal(wrote, 0, why);
      }
    }
    // Turned down is the account, whatever its sign-up says: even a confirmed one.
    night();
    w.world.db.seed("eventRsvps/rsvp-rex", rsvp("rsvp-rex", "confirmed", "Rex Moor", "rex@example.com", "rex"));
    assert.equal((await pressedByCode(rex, "a turned-down account with a place")).res.status, 409);
    assert.equal(checkIns().length, 0);

    // A place's email link checks its sign-up in, with no account...
    night();
    const link = gwenLink();
    assert.ok(line.includes("People with a place can also use the link in their confirmation email"));
    const guest = await press(null, { rsvpId: link.r, token: link.t, doorCode: true });
    assert.equal(guest.status, 201);
    assert.deepEqual([checkIns()[0].rsvpId, checkIns()[0].how], [RSVP.gwen, "email"]);
    // ...if the email has one: a confirmation sent while the event did not let
    // people check themselves in carries none, which is why the words say so.
    assert.ok(line.includes("if it has one"));
    for (const [extra, carries] of [[{}, false], [SELF_ON, true]]) {
      globalThis.__checkInMail = [];
      await sendRsvpEmail({
        variant: "approved",
        to: "gwen@example.com",
        recipientName: "Gwen",
        rsvpId: RSVP.gwen,
        event: { id: EVENT_ID, title: "VR games night", startAt: START, endAt: END, ...extra },
      });
      const html = await renderEmail(globalThis.__checkInMail[0].react);
      assert.equal(html.includes("/check-in?r="), carries, JSON.stringify(extra));
    }

    // Everyone else: signed out with no link is asked to sign in, or to give their name.
    night();
    assert.equal((await press(null, { doorCode: true })).status, 401);
    assert.equal(checkIns().length, 0);
  });

  test("an event with no sign-up: anyone signed in, unless turned down; it names no place and no email", async (t) => {
    clock(t, DURING);
    const line = view.doorCodeLine({ noSignup: true });
    assert.equal(
      line,
      "Anyone signed in can check themselves in by scanning this code, unless they were turned down. Everyone else gives their name at the door.",
    );
    // Nobody holds a place at it or was sent a confirmation: the RSVP route refuses it a sign-up (tests/event-no-signup.test.mjs).
    assert.ok(!/place|email/i.test(line), line);
    const listed = view.doorListSelfWords({ noSignup: true });
    assert.equal(
      `${listed.before}naisi.uk/q/vr-in${listed.after}`,
      "Anyone signed in can check themselves in at naisi.uk/q/vr-in, unless they were turned down.",
    );
    const rows = [
      ["kofi", CAN, "a member"],
      ["mo", CAN, "another member"],
      ["sue", CAN, "a committee member"],
      ["ines", CAN, "a pending account"],
      [rex, TURNED_DOWN, "an account whose request to join was turned down"],
    ];
    for (const [who, group, why] of rows) {
      w.reset(withDropIn(SELF_ON, DOOR_OPEN));
      assert.ok(group === CAN ? line.startsWith("Anyone signed in can check themselves in") : line.includes(group), `the words name ${why}`);
      const { res, wrote } = await pressedByCode(who, why);
      if (group === CAN) {
        assert.equal(res.status, 201, why);
        assert.deepEqual([checkIns()[0].kind, checkIns()[0].how], ["walk-in", "code"], why);
      } else {
        assert.equal(res.status, 409, why);
        assert.equal(wrote, 0, why);
      }
    }
    w.reset(withDropIn(SELF_ON, DOOR_OPEN));
    assert.equal((await press(null, { doorCode: true })).status, 401);
    // The page says the drop-in's own words to a walk-in.
    assert.match((await open("mo", { q: "vr-in" })).text, /Hi Mo\. Are you here\? No sign-up needed for this one\. I’m here/);
  });
});
