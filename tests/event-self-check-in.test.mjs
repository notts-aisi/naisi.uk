/**
 * CHECKING YOURSELF IN (ev-self-phone): the page an event's door code lands
 * on (`/events/<id>/check-in`) and its button (`POST /api/events/<id>/check-in`).
 *
 * Every kind of person at the door: a member with a confirmed sign-up, a
 * member with no sign-up (a walk-in with their account), one who cancelled,
 * one on the waiting list, one not decided yet, one refused, a guest with no
 * account through the link in their own confirmation email, a wrong link,
 * somebody signed out, and view-as. And every state of the evening: before
 * the door opens, while it is open, after; a cancelled event, a draft and one
 * that is not there, which a printed code must still answer with a page.
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
import { AFTER, BEFORE, DURING, EVENT_ID, RSVP, makeCheckInWorld, textOf } from "./lib/checkInWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

process.env.EVENTS_TOKEN_SECRET = "a-secret-for-the-check-in-suite-only-0123456789";

const w = await makeCheckInWorld("__selfCheckIn");
const { call, render, load } = w;
const page = await load("app/events/[id]/check-in/page.tsx");
const checkedIn = await load("app/events/[id]/check-in/CheckedIn.tsx");
const route = await load("app/api/events/[id]/check-in/route.ts");
const tokens = await load("lib/events/rsvpToken.ts");

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

const LINE = "VR games night · Sun 1 Nov · 2pm to 5pm · Room B52";
const WHO_SEES =
  "This checks you in on the door list. Only NAISI’s admins and the committee members the Students’ Union recognises can see who came.";
const NAMES = ["Kofi", "Chloe", "Gwen", "Wren", "Pat", "Cora", "Dina", "Asante", "Nguyen"];

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

describe("the page the door code lands on", () => {
  test("signed out at the door: asked to sign in, told about the email's link, and nobody is named", async (t) => {
    clock(t, DURING);
    w.reset();
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

  test("a member with a confirmed sign-up: Hi, are you here, and one button that waits for the script", async (t) => {
    clock(t, DURING);
    w.reset();
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
      w.reset();
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
    w.reset({ [`events/${EVENT_ID}`]: { ...w.world.db.read(`events/${EVENT_ID}`), noSignup: true } });
    const { text } = await open("mo");
    assert.match(text, /Hi Mo\. Are you here\? No sign-up needed for this one\. I’m here/);
  });

  test("the waiting list, the undecided and the refused give their name at the door: no button", async (t) => {
    clock(t, DURING);
    w.reset();
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
    w.reset();
    await press("kofi", {});
    const { text } = await open("kofi");
    assert.match(text, /You’re checked in, Kofi\. Checked in at 2:05pm\./);
    assert.ok(!text.includes("I’m here"));
  });

  test("B5: once checked in the question goes: the answer is one view, after the press as on the next visit", async (t) => {
    clock(t, DURING);
    w.reset();
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
    const shell = code("page.tsx");
    assert.equal((shell.match(/Are you here\?/g) ?? []).length, 2, "the question is the button's, and the signed-out page's own");
    assert.ok(!shell.includes("{WHO_SEES}</p>"), "the line about what the press does is drawn by the button, so it goes with the question");
  });

  test("a guest through their own email's link: their sign-up, no account and no sign-out", async (t) => {
    clock(t, DURING);
    w.reset();
    const { text } = await open(null, gwenLink());
    assert.equal(
      text,
      `NAISI Check in ${LINE} Hi Gwen. Are you here? You signed up for this. I’m here ${WHO_SEES} ` +
        "There may be a short survey afterwards.",
    );
  });

  test("a link that is wrong, or for somebody else's sign-up, works for nothing and names nobody", async (t) => {
    clock(t, DURING);
    w.reset();
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

  test("before the door opens, and after it closes, it says when; no button", async (t) => {
    w.reset();
    clock(t, BEFORE);
    assert.equal((await open("kofi")).text, `NAISI Check in ${LINE} Check in Check-in opens at 1pm on Sun 1 Nov, an hour before the start.`);
    t.mock.timers.reset();
    clock(t, AFTER);
    assert.equal((await open("kofi")).text, `NAISI Check in ${LINE} Check in Check-in at the door has closed.`);
  });

  test("a cancelled event, a draft and one that is gone each answer with a page, never a blank 404", async (t) => {
    clock(t, DURING);
    w.reset({ [`events/${EVENT_ID}`]: { ...w.world.db.read(`events/${EVENT_ID}`), status: "cancelled" } });
    assert.equal((await open("kofi")).text, `NAISI Check in ${LINE} This event was cancelled`);
    const gone =
      "NAISI Check in There’s nothing to check in to here This code is for an event that isn’t on the site any more. Give your name at the door. See what’s on";
    w.reset({ [`events/${EVENT_ID}`]: { ...w.world.db.read(`events/${EVENT_ID}`), status: "draft" } });
    assert.equal((await open("kofi")).text, gone, "a draft is not shown");
    w.reset();
    assert.equal((await open("kofi", {}, "no-such-event")).text, gone);
    assert.equal((await open(null, {}, "../../x")).text, gone);
  });
});

// ---------------------------------------------------------------------------
// The button
// ---------------------------------------------------------------------------

describe("POST /api/events/<id>/check-in", () => {
  test("a confirmed sign-up checks in as the sign-up, by themselves, once", async (t) => {
    clock(t, DURING);
    w.reset();
    const res = await press("kofi", {});
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { checkedIn: true, created: true, at: DURING.toISOString(), atWords: "2:05pm" });
    const [row] = checkIns();
    assert.deepEqual([row.kind, row.rsvpId, row.uid, row.how, row.byUid], ["signup", RSVP.kofi, "kofi", "qr", null]);
    const again = await press("kofi", {});
    assert.deepEqual([again.status, again.body.created], [200, false]);
    assert.equal(checkIns().length, 1);
  });

  test("a member with no sign-up is a walk-in with their account and their name", async (t) => {
    clock(t, DURING);
    w.reset();
    assert.equal((await press("mo", {})).status, 201);
    const [row] = checkIns();
    assert.deepEqual([row.kind, row.rsvpId, row.uid, row.name, row.email], ["walk-in", null, "mo", "Mo Rahman", null]);
  });

  test("the waiting list, the undecided and the refused are told to give their name; nothing is written", async (t) => {
    clock(t, DURING);
    w.reset();
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
    w.reset();
    const link = gwenLink();
    assert.deepEqual(short(await press(null, { rsvpId: link.r, token: "y".repeat(32) })), [
      403,
      "This link doesn’t work for this event. Give your name at the door.",
    ]);
    assert.equal(checkIns().length, 0);
    const res = await press(null, { rsvpId: link.r, token: link.t });
    assert.equal(res.status, 201);
    const [row] = checkIns();
    assert.deepEqual([row.kind, row.rsvpId, row.uid, row.how, row.byUid], ["signup", RSVP.gwen, null, "qr", null]);
  });

  test("signed out with no link: 401; a half link: 400 with a sentence; view-as: refused", async (t) => {
    clock(t, DURING);
    w.reset();
    assert.deepEqual(short(await press(null, {})), [
      401,
      "Sign in to check yourself in, or use the link in your confirmation email.",
    ]);
    assert.deepEqual(short(await press(null, { rsvpId: RSVP.gwen })), [
      400,
      "That link isn’t complete. Open it again from your email, or give your name at the door.",
    ]);
    w.world.viewingAs = true;
    assert.equal((await press("kofi", {})).status, 403);
    w.world.viewingAs = false;
    assert.equal(checkIns().length, 0);
  });

  test("only while the door is open, and only at a published event", async (t) => {
    w.reset();
    clock(t, BEFORE);
    assert.deepEqual(short(await press("kofi", {})), [409, "Check-in opens at 1pm on Sun 1 Nov, an hour before the start."]);
    t.mock.timers.reset();
    clock(t, AFTER);
    assert.deepEqual(short(await press("kofi", {})), [409, "Check-in at the door has closed."]);
    t.mock.timers.reset();
    clock(t, DURING);
    w.reset({ [`events/${EVENT_ID}`]: { ...w.world.db.read(`events/${EVENT_ID}`), status: "draft" } });
    assert.deepEqual(short(await press("kofi", {})), [404, "There’s no event to check in to here."]);
    w.reset({ [`events/${EVENT_ID}`]: { ...w.world.db.read(`events/${EVENT_ID}`), status: "cancelled" } });
    assert.deepEqual(short(await press("kofi", {})), [409, "This event was cancelled."]);
    assert.equal(checkIns().length, 0);
  });
});

// ---------------------------------------------------------------------------
// The link in the confirmation email
// ---------------------------------------------------------------------------

describe("the confirmation email carries the guest's own check-in link", () => {
  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["@/lib/firebase/admin", "export const getAdminDb = () => null;"],
      ["@/lib/email/send", "export const sendEmail = async (args) => { (globalThis.__checkInMail ||= []).push(args); };"],
      ["@/lib/firestore/suppression", "export const isSuppressed = async () => false;"],
    ]),
  });

  test("an email that holds a place links to check in with the sign-up's token; the others do not", async () => {
    const { sendRsvpEmail } = await loadTs("lib/events/sendRsvpEmail.ts");
    globalThis.__checkInMail = [];
    const event = { id: EVENT_ID, title: "VR games night", location: "Room B52", startAt: new Date("2026-11-01T14:00:00Z"), endAt: new Date("2026-11-01T17:00:00Z") };
    for (const variant of ["approved", "requested", "waitlisted"]) {
      await sendRsvpEmail({ variant, to: "gwen@example.com", recipientName: "Gwen", event, rsvpId: RSVP.gwen });
    }
    const [approved, requested, waitlisted] = await Promise.all(globalThis.__checkInMail.map((sent) => renderEmail(sent.react)));
    const token = tokens.signRsvpToken(RSVP.gwen, "gwen@example.com");
    const url = `/events/${EVENT_ID}/check-in?r=${RSVP.gwen}&amp;t=${token}`;
    assert.ok(approved.includes(url), "the approved email links to check in");
    assert.match(approved, /On the day, you can/);
    assert.match(approved, /at the door from this email, or give your name there\./);
    for (const [name, html] of [["requested", requested], ["waitlisted", waitlisted]]) {
      assert.ok(!html.includes("/check-in?"), `${name} holds no place, so no check-in link`);
    }
  });
});
