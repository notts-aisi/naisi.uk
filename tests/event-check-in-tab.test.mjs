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
        /4 came 2 of 3 who signed up, and 2 walk-ins 1 checked themselves in With the QR code at the door 1 at the door list Plus the 2 walk-ins 1 didn’t come Check-in never stops anyone signing up again\. Admins may see when someone has missed two events in a row that they had a place at\./,
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

  // A member with no sign-up who checks themselves in with the code walks in
  // with their account: their survey goes to the account, so there is no
  // "No email" under them; they came by the code, so "QR at the door" and a
  // place among who checked themselves in; and the three numbers still add
  // up to who came (walk 4b, L5). A walk-in with no account given at the
  // door keeps "No email" and "Walk-in" (above).
  test("a member who walks in with the code, signed in: QR at the door, no No email, counted among who checked themselves in", async (t) => {
    clock(t, DURING);
    w.reset();
    await call(self.POST, { as: "kofi", params: { id: EVENT_ID }, body: {} });
    await call(tick.POST, { as: "sue", params: { id: EVENT_ID }, body: { rsvpId: RSVP.chloe, from: "door" } });
    await call(tick.POST, {
      as: "sue",
      params: { id: EVENT_ID },
      body: { from: "door", walkIn: { name: "Dan Fitzgerald", email: "dan@example.com" } },
    });
    assert.equal((await call(self.POST, { as: "mo", params: { id: EVENT_ID }, body: {} })).status, 201);
    t.mock.timers.reset();
    clock(t, AFTER);
    const counts =
      "4 came 2 of 3 who signed up, and 2 walk-ins 2 checked themselves in With the QR code at the door 1 at the door list Plus 1 of the 2 walk-ins 1 didn’t come";
    for (const who of ["sue", "iris"]) assert.ok((await open(who)).text.includes(counts), who);
    const { text } = await open("sue");
    assert.match(text, /DF Dan Fitzgerald Email kept for the survey until Sun 8 Nov Walk-in 2:05pm/);
    assert.match(text, /MR Mo Rahman QR at the door 2:05pm/);
    assert.ok(!/Mo Rahman No email/.test(text), "an account's survey goes to the account");
  });

  test("the walk-ins the door list adds to its count: the board's words, then how many of them came in at the door", async () => {
    const { plusWalkInsWords, cameWords } = await load("lib/events/checkInView.ts");
    const counts = (walkIns, walkInsByCode) => ({
      expected: 18, signupsHere: 15, confirmed: 18, confirmedHere: 15, waitingHere: 0, undecidedHere: 0,
      walkIns, walkInsByCode, here: 15 + walkIns, toCome: 3, byQr: 9, byList: 6,
    });
    assert.equal(cameWords(counts(3, 0)), "15 of 18 who signed up, and 3 walk-ins");
    assert.equal(plusWalkInsWords(counts(3, 0)), "Plus the 3 walk-ins");
    assert.equal(plusWalkInsWords(counts(1, 0)), "Plus the 1 walk-in");
    assert.equal(plusWalkInsWords(counts(3, 1)), "Plus 2 of the 3 walk-ins");
    assert.equal(plusWalkInsWords(counts(2, 2)), null, "every walk-in checked themselves in");
    assert.equal(plusWalkInsWords(counts(0, 0)), null);
    // "Of 18 who signed up" is the confirmed, the Sign-ups tab's number;
    // anybody let in from the waiting list, or not decided yet, is said apart
    // (walk 4b, L9).
    const letIn = { ...counts(3, 0), expected: 20, signupsHere: 17, waitingHere: 1, undecidedHere: 1 };
    assert.equal(cameWords(letIn), "15 of 18 who signed up, 1 from the waiting list, 1 whose place wasn’t decided yet, and 3 walk-ins");
    assert.equal(cameWords({ ...letIn, undecidedHere: 2 }), "15 of 18 who signed up, 1 from the waiting list, 2 whose places weren’t decided yet, and 3 walk-ins");
    assert.equal(cameWords({ ...letIn, undecidedHere: 0, walkIns: 0 }), "15 of 18 who signed up, and 1 from the waiting list");
    assert.equal(cameWords({ ...counts(0, 0) }), "15 of 18 who signed up");
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

// A record whose names have come off (a year after the event, or at once when
// the account is deleted) "stays in the count", as the privacy policy says:
// the tab counts it with who came, lists it nowhere, and its sign-up's row,
// which keeps no tick, is not said to be somebody who didn't come.
describe("a check-in whose names have come off still counts", () => {
  /** Mon 1 Nov 2027, after the names came off the night's check-ins. */
  const YEAR_ON = new Date("2027-11-02T10:00:00Z");
  const NIGHT =
    /4 came 2 of 3 who signed up, and 2 walk-ins 1 checked themselves in With the QR code at the door 1 at the door list Plus the 2 walk-ins 1 didn’t come Check-in never stops anyone signing up again\. Admins may see when someone has missed two events in a row that they had a place at\./;

  test("a year after the event every name comes off, and the four numbers are still the night's, for everybody who sees them", async (t) => {
    clock(t, DURING);
    await theNight();
    t.mock.timers.reset();
    clock(t, YEAR_ON);
    const { tidyCheckIns } = await load("lib/events/checkIns.ts");
    assert.equal((await tidyCheckIns(w.world.db, YEAR_ON)).namesOff, 4);
    for (const who of ["iris", "cal", "sue", "zach"]) {
      const { text, html } = await open(who);
      assert.match(text, NIGHT, who);
      if (who === "iris" || who === "cal") for (const name of NAMES) assert.ok(!html.includes(name), `${who}: ${name} is nowhere in the page`);
    }
    const { text } = await open("sue");
    assert.match(text, /Who came 4 4 came whose names have come off: counted, not listed\. Didn’t come 1 /);
    assert.ok(!text.includes("Nobody is checked in yet."), "the list says nobody came");
    assert.match(
      text,
      /Didn’t come 1 2 of these came, but their names have come off, so we can’t tell which\. CN Chloe Nguyen GP Gwen Price KA Kofi Asante/,
    );
    assert.ok(!text.includes("They came"), "nothing is added a year on");
  });

  test("an account deleted: its record's names come off at once and it still counts; its sign-up stays, and the list says one of those came", async (t) => {
    clock(t, DURING);
    await theNight();
    const { takeCheckInNamesOffForAccount } = await load("lib/events/checkIns.ts");
    assert.equal(await takeCheckInNamesOffForAccount(w.world.db, "kofi"), 1);
    t.mock.timers.reset();
    clock(t, AFTER);
    for (const who of ["iris", "cal"]) {
      const { text, html } = await open(who);
      assert.match(text, NIGHT, who);
      for (const name of NAMES) assert.ok(!html.includes(name), `${who}: ${name} is nowhere in the page`);
    }
    const { text } = await open("sue");
    assert.match(text, NIGHT);
    assert.match(
      text,
      /Who came 4 Until Sun 8 Nov, a week after the event Add someone who came Who came, in the order they were checked in Name How Checked in CN Chloe Nguyen Door list 2:05pm DF Dan Fitzgerald .+ MR Mo Rahman No email Walk-in 2:05pm 1 more came whose name has come off: counted, not listed\./,
    );
    assert.match(
      text,
      /Didn’t come 1 1 of these came, but their name has come off, so we can’t tell which\. GP Gwen Price They came KA Kofi Asante They came/,
    );
  });

  test("the counting: every record whose names have come off is one person, a sign-up's taken from the confirmed with no tick while there are any", async () => {
    const view = await load("lib/events/checkInView.ts");
    const row = (rsvpId, standing, checkIn = null) => ({ key: rsvpId, rsvpId, name: rsvpId, standing, checkIn });
    const ticked = (how) => ({ id: "c", how, at: "2026-11-01T14:05:00.000Z", emailGoesAt: null, noEmail: false });
    const off = (kind, how) => ({ id: `off-${kind}-${how}`, eventId: EVENT_ID, kind, how, namesOff: true });
    assert.deepEqual(view.namesOffOf([off("signup", "qr"), off("signup", "door"), off("walk-in", "door"), { ...off("signup", "page"), namesOff: false }]), {
      signups: 2,
      signupsByQr: 1,
      walkIns: 1,
    });
    // Three confirmed, one of them ticked; two sign-ups and a walk-in whose names came off.
    const rows = [row("a", "signed-up", ticked("door")), row("b", "signed-up"), row("c", "signed-up"), row("w", "waiting")];
    assert.deepEqual(view.doorCounts(rows, { signups: 2, signupsByQr: 1, walkIns: 1 }), {
      expected: 3,
      signupsHere: 3,
      walkIns: 1,
      here: 4,
      toCome: 0,
      byQr: 1,
      byList: 2,
      notListed: 3,
      cameUnticked: 2,
      // Of the confirmed, the one ticked and the two whose names came off
      // with their ticks; nobody from the waiting list or undecided came by a
      // row, and no walk-in row used the code (walk 4b, L5 and L9).
      confirmed: 3,
      confirmedHere: 3,
      waitingHere: 0,
      undecidedHere: 0,
      walkInsByCode: 0,
    });
    // More whose names came off than confirmed with no tick: the rest were let in, and are expected as they came.
    assert.deepEqual(view.doorCounts([row("a", "signed-up")], { signups: 3, signupsByQr: 0, walkIns: 0 }), {
      expected: 3,
      signupsHere: 3,
      walkIns: 0,
      here: 3,
      toCome: 0,
      byQr: 0,
      byList: 3,
      notListed: 3,
      cameUnticked: 1,
      // One confirmed, taken to be one of the three whose names came off.
      confirmed: 1,
      confirmedHere: 1,
      waitingHere: 0,
      undecidedHere: 0,
      walkInsByCode: 0,
    });
    // With none, the numbers are the rows' alone, as before.
    assert.deepEqual(view.doorCounts(rows), view.doorCounts(rows, view.NO_NAMES_OFF));
    assert.deepEqual(
      [view.doorCounts(rows).here, view.doorCounts(rows).toCome, view.doorCounts(rows).notListed, view.doorCounts(rows).cameUnticked],
      [1, 2, 0, 0],
    );
    assert.equal(view.notListedWords(1, false), "1 came whose name has come off: counted, not listed.");
    assert.equal(view.notListedWords(3, true), "3 more came whose names have come off: counted, not listed.");
    assert.equal(view.cameUntickedWords(1), "1 of these came, but their name has come off, so we can’t tell which.");
    assert.equal(view.cameUntickedWords(2), "2 of these came, but their names have come off, so we can’t tell which.");
  });

  test("the came line's parts still add up to who came once names have come off", async () => {
    const view = await load("lib/events/checkInView.ts");
    const row = (rsvpId, standing, checkIn = null) => ({ key: rsvpId, rsvpId, name: rsvpId, standing, checkIn });
    const ticked = (how) => ({ id: "c", how, at: "2026-11-01T14:05:00.000Z", emailGoesAt: null, noEmail: false });
    // Three confirmed: two ticked, one whose names came off with its tick; one
    // let in from the waiting list; one walk-in on a row and one whose names came off.
    const rows = [
      row("a", "signed-up", ticked("door")),
      row("b", "signed-up", ticked("qr")),
      row("c", "signed-up"),
      row("w", "waiting", ticked("door")),
      row("x", "walk-in", ticked("door")),
    ];
    const counts = view.doorCounts(rows, { signups: 1, signupsByQr: 0, walkIns: 1 });
    assert.equal(counts.here, 6);
    assert.equal(counts.confirmedHere + counts.waitingHere + counts.undecidedHere + counts.walkIns, counts.here);
    assert.equal(view.cameWords(counts), "3 of 3 who signed up, 1 from the waiting list, and 2 walk-ins");
    assert.equal(view.plusWalkInsWords(counts), "Plus the 2 walk-ins");
    assert.equal(counts.toCome, 0);
  });
});
