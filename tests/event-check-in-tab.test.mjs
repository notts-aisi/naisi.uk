/**
 * AN EVENT'S PAGE IN SECTIONS (ev-manage): Details, Sign-ups and Check-in, and
 * the Check-in tab itself.
 *
 * The Check-in tab is drawn on the server: four numbers for everybody in the
 * events area, and who came, who did not, the door code and the door list
 * only for the people who run check-in. An organiser the SU does not
 * recognise sees the numbers and no name, anywhere in the page. Through the
 * real page at each point of the evening, and the tabs as each kind of
 * caller sees them. The world is `tests/lib/checkInWorld.mjs`. Run with
 * `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AFTER, BEFORE, DURING, EVENT_ID, RSVP, WEEK_LATER, makeCheckInWorld, textOf } from "./lib/checkInWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const w = await makeCheckInWorld("__checkInTab");
const { call, render, load } = w;
const tab = await load("app/(app)/events/manage/[id]/check-in/page.tsx");
const tick = await load("app/api/events/[id]/check-ins/route.ts");
const self = await load("app/api/events/[id]/check-in/route.ts");
const doorCode = await load("app/api/events/[id]/door-code/route.ts");
const { default: EventTabs } = await load("features/events/checkIn/EventTabs.tsx");

function clock(t, at) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const open = (as, id = EVENT_ID) => render(tab, { as, params: { id } });
const NAMES = ["Kofi", "Chloe", "Gwen", "Wren", "Pat", "Dan Fitzgerald", "Mo Rahman", "Asante"];

/** The night as it went: Kofi with the code, Chloe on the door list, two walk-ins, Gwen never came. */
async function theNight() {
  w.reset();
  await call(self.POST, { as: "kofi", params: { id: EVENT_ID }, body: {} });
  await call(tick.POST, { as: "sue", params: { id: EVENT_ID }, body: { rsvpId: RSVP.chloe, from: "door" } });
  await call(tick.POST, {
    as: "sue",
    params: { id: EVENT_ID },
    body: { from: "door", walkIn: { name: "Dan Fitzgerald", email: "dan@example.com" } },
  });
  await call(tick.POST, { as: "sue", params: { id: EVENT_ID }, body: { from: "door", walkIn: { name: "Mo Rahman" } } });
}

describe("the tabs", () => {
  const tabs = (props) => renderToStaticMarkup(createElement(EventTabs, { eventId: EVENT_ID, ...props }));

  // The survey after an event is built (docs/surveys.md, "Surveys after events"), so the
  // fourth section, Survey after, sits beside Check-in, as ev-manage draws it.
  test("Details, Sign-ups with its count, Check-in and Survey after, each its own address, the current one marked", () => {
    const html = tabs({ current: "check-in", showSignups: true, signups: 18, showCheckIn: true });
    assert.equal(textOf(html), "Details Sign-ups 18 Check-in Survey after");
    assert.match(html, new RegExp(`href="/events/manage/${EVENT_ID}/survey"[^>]*>Survey after`));
    assert.match(html, /<nav[^>]*aria-label="Sections"/);
    assert.match(html, new RegExp(`href="/events/manage/${EVENT_ID}"[^>]*>Details`));
    assert.match(html, new RegExp(`href="/events/manage/${EVENT_ID}/attendees"[^>]*>Sign-ups`));
    assert.match(html, new RegExp(`href="/events/manage/${EVENT_ID}/check-in"[^>]*aria-current="page"[^>]*>Check-in`));
  });

  test("Sign-ups only for those its page admits; Check-in and Survey after only for a published event", () => {
    assert.equal(textOf(tabs({ current: "details", showSignups: false, showCheckIn: true })), "Details Check-in Survey after");
    assert.equal(textOf(tabs({ current: "details", showSignups: true, showCheckIn: false })), "Details Sign-ups");
    assert.ok(!tabs({ current: "details", showSignups: true, showCheckIn: false }).includes("Survey"));
  });

  test("the editor and the attendees page both draw them, with the attendees page's own gate for Sign-ups", () => {
    const editor = readFileSync(join(REPO_ROOT, "src/features/events/EventEditor.tsx"), "utf8");
    assert.match(
      editor,
      /<EventTabs\s+eventId=\{event\.id\}\s+current="details"\s+showSignups=\{canSeeAttendees\}\s+signups=\{event\.rsvpCountConfirmed \?\? undefined\}\s+showCheckIn=\{status === "published"\}\s+\/>/,
    );
    assert.match(editor, /const canSeeAttendees =\s+role === "admin" \|\| \(role === "committee" && suRecognised\);/);
    const attendees = readFileSync(join(REPO_ROOT, "src/app/(app)/events/manage/[id]/attendees/page.tsx"), "utf8");
    assert.match(attendees, /<EventTabs\s+eventId=\{event\.id\}\s+current="signups"\s+showSignups/);
  });
});

describe("the Check-in tab", () => {
  test("signed out goes to sign in; an event that is not there is not found", async (t) => {
    clock(t, AFTER);
    w.reset();
    assert.deepEqual(await open(null), { redirect: "/login" });
    await assert.rejects(open("sue", "no-such-event"), /NEXT_NOT_FOUND/);
  });

  test("the organiser the SU does not recognise sees the numbers and no name, anywhere in the page", async (t) => {
    clock(t, DURING);
    await theNight();
    t.mock.timers.reset();
    clock(t, AFTER);
    for (const who of ["iris", "cal"]) {
      const { text, html } = await open(who);
      assert.match(
        text,
        /^Manage events VR games night Past Sun 1 Nov 2pm to 5pm Room B52 30 places Details Check-in /,
        who,
      );
      assert.match(
        text,
        /4 came 2 of 3 who signed up, and 2 walk-ins 1 checked themselves in With the QR code at the door 1 at the door list Plus the 2 walk-ins 1 didn’t come Check-in never stops anyone signing up again, and nobody else sees who didn’t come\./,
        who,
      );
      assert.match(text, /Only NAISI’s admins and the committee members the Students’ Union recognises see who came, as they see who signed up\.$/);
      for (const name of NAMES) assert.ok(!html.includes(name), `${who}: ${name} is nowhere in the page`);
      assert.ok(!html.includes("See the door list"), `${who}: no door list link`);
      assert.ok(!html.includes("/door\""), `${who}: no address of the door list`);
      assert.ok(!html.includes("<svg"), "no door code");
    }
  });

  test("the people who run check-in see who came, how and when, and who didn't", async (t) => {
    clock(t, DURING);
    await theNight();
    t.mock.timers.reset();
    clock(t, AFTER);
    const { text } = await open("sue");
    assert.match(text, /Details Sign-ups 3 Check-in/);
    assert.match(text, /Who came 4 Until Sun 8 Nov, a week after the event Add someone who came/);
    // In the order they were checked in; two at the same minute, by name.
    assert.match(
      text,
      /Who came, in the order they were checked in Name How Checked in CN Chloe Nguyen Door list 2:05pm KA Kofi Asante QR at the door 2:05pm/,
    );
    assert.match(text, /DF Dan Fitzgerald Email kept for the survey until Sun 8 Nov Walk-in 2:05pm MR Mo Rahman No email Walk-in 2:05pm/);
    assert.match(text, /Didn’t come 1 GP Gwen Price They came/);
  });

  test("the door's two cards: no code yet, then the code, its sign and its PNG; the door list's hours", async (t) => {
    clock(t, DURING);
    w.reset();
    const before = await open("sue");
    assert.match(
      before.text,
      /The door QR code No door code yet\. Make one, then print it for the door\. Signed-in people check themselves in\. Everyone else gives their name at the door\. Make the door code/,
    );
    assert.match(
      before.text,
      /Door list Opens an hour before and closes an hour after: 1pm to 6pm\. After that, add people from this page\. See the door list$/,
    );
    assert.match(before.html, new RegExp(`href="/events/manage/${EVENT_ID}/door"`));

    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    const after = await open("sue");
    assert.match(
      after.text,
      /The door QR code naisi\.uk\/q\/vr-in Signed-in people check themselves in\. Everyone else gives their name at the door\. Print an A4 sign Download PNG/,
    );
    assert.match(after.html, /aria-label="QR code for naisi.uk\/q\/vr-in"/);
    assert.match(after.html, /href="\/signs\/vr-in" target="_blank" rel="noopener"/);
    assert.match(after.html, /href="\/api\/links\/vr-in\/qr\?format=png&amp;download=1" download="naisi-q-vr-in.png"/);
    assert.ok(!/<a[^>]*>\s*<button/.test(after.html), "no button inside a link");
  });

  test("a switched-off door code says where a scan lands", async (t) => {
    clock(t, DURING);
    w.reset();
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    w.world.db.poke("trackedLinks/vr-in", { active: false });
    const { text } = await open("zach");
    assert.match(text, /This code is switched off in Short links, so a scan lands on \/links\./);
  });

  test("before the door opens: when it opens, no numbers; a week after: nothing more is added", async (t) => {
    w.reset();
    clock(t, BEFORE);
    const before = await open("sue");
    assert.match(before.text, /Check-in opens at 1pm on Sun 1 Nov, an hour before the start\./);
    assert.ok(!before.text.includes(" came "));
    t.mock.timers.reset();
    clock(t, DURING);
    await theNight();
    t.mock.timers.reset();
    clock(t, WEEK_LATER);
    const closed = await open("sue");
    assert.match(closed.text, /Who came 4 Who came, in the order they were checked in Name How/);
    for (const gone of ["Add someone who came", "They came", "Email kept", "No email"]) {
      assert.ok(!closed.text.includes(gone), gone);
    }
  });

  test("an event that is not published says check-in is for a published one", async (t) => {
    clock(t, DURING);
    w.reset({ [`events/${EVENT_ID}`]: { ...w.world.db.read(`events/${EVENT_ID}`), status: "draft" } });
    const { text } = await open("sue");
    assert.match(text, /Check-in is for a published event, and this one isn’t published\.$/);
  });
});
