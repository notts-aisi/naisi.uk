/**
 * AN EVENT'S PAGE IN SECTIONS (ev-manage): Details, Sign-ups and Check-in, and
 * the Check-in tab itself.
 *
 * The Check-in tab is drawn on the server: four numbers for everybody in the
 * events area, the "At the door" card (Open the door, for the event's author
 * and admins; the door's state in words for everybody else), and who came,
 * how, who checked them in and when, who did not, the door code and the door
 * list only for the people who run check-in. The door code only at an event
 * that lets people check themselves in. An organiser the SU does not
 * recognise sees the numbers and no name of anybody who came, anywhere in the
 * page. Through the real page at each point of the evening, and the tabs as
 * each kind of caller sees them. The world is `tests/lib/checkInWorld.mjs`.
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AFTER,
  BEFORE,
  DOOR_OPEN,
  DURING,
  EVENT_ID,
  PEOPLE,
  RSVP,
  SELF_ON,
  WEEK_LATER,
  makeCheckInWorld,
  person,
  textOf,
  withDropIn,
  withEvent,
} from "./lib/checkInWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.EVENTS_TOKEN_SECRET = "a-secret-for-the-check-in-suite-only-0123456789";

const w = await makeCheckInWorld("__checkInTab");
const { call, render, load } = w;
const tab = await load("app/(app)/events/manage/[id]/check-in/page.tsx");
const tick = await load("app/api/events/[id]/check-ins/route.ts");
const self = await load("app/api/events/[id]/check-in/route.ts");
const doorCode = await load("app/api/events/[id]/door-code/route.ts");
const { default: EventTabs } = await load("features/events/checkIn/EventTabs.tsx");
const { default: OpenDoorButton } = await load("features/events/checkIn/OpenDoorButton.tsx");
const tokens = await load("lib/events/rsvpToken.ts");
const doorRoute = await load("app/api/events/[id]/door/route.ts");
const view = await load("lib/events/checkInView.ts");
const { NO_SELF } = view;

function clock(t, at) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}
const open = (as, id = EVENT_ID) => render(tab, { as, params: { id } });
const NAMES = ["Kofi", "Chloe", "Gwen", "Wren", "Pat", "Dan Fitzgerald", "Mo Rahman", "Asante"];
/**
 * Under the door code, as patterns: who can check themselves in at an event
 * that takes sign-ups, and at one with no sign-up (`doorCodeLine`, held to
 * `decideSelf` person by person in tests/event-self-check-in.test.mjs).
 */
const SIGNUPS =
  "Anyone signed in can check themselves in by scanning this code, unless they’re still waiting for a place or were turned down\\. " +
  "People with a place can also use the link in their confirmation email, if it has one\\. Everyone else gives their name at the door\\.";
const NO_SIGNUP =
  "Anyone signed in can check themselves in by scanning this code, unless they were turned down\\. Everyone else gives their name at the door\\.";

/**
 * The night as it went, at an event that lets people check themselves in,
 * with the door opened by Iris at 1:05pm: Kofi with the door code, Chloe on
 * the door list, two walk-ins, Gwen never came.
 */
async function theNight() {
  w.reset(withEvent(SELF_ON, DOOR_OPEN));
  await call(self.POST, { as: "kofi", params: { id: EVENT_ID }, body: { doorCode: true } });
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
        /4 came 2 of 3 who signed up, and 2 walk-ins 1 checked themselves in With the door code 1 at the door list Plus the 2 walk-ins 1 didn’t come Check-in never stops anyone signing up again\. Admins may see when someone has missed two events in a row that they had a place at\./,
        who,
      );
      // The door's state: who opened it is the one name, and it is not anybody who came.
      assert.match(
        text,
        new RegExp(`At the door ${who === "iris" ? "You" : "Iris"} opened the door at 1:05pm\\. It closed by itself at 6pm, an hour after the end\\.`),
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
      /Who came, in the order they were checked in Name How Checked in by When CN Chloe Nguyen Door list Sue 2:05pm KA Kofi Asante Scanned the door code Themselves 2:05pm/,
    );
    assert.match(text, /DF Dan Fitzgerald Email kept for the survey until Sun 8 Nov Walk-in Sue 2:05pm MR Mo Rahman No email Walk-in Sue 2:05pm/);
    assert.match(text, /Didn’t come 1 GP Gwen Price They came/);
    assert.ok(!text.includes("QR at the door"), "the old words, which named a scan nobody made");
  });

  // Every way in, as itself, with who did it: the How and Checked in by
  // columns, and the counts split the same way. A record from before the ways
  // were told apart (`qr`) says only that they checked themselves in.
  test("each way in reads as itself, with who checked them in, and the counts split the same way", async (t) => {
    clock(t, DURING);
    const gwen = tokens.signRsvpToken(RSVP.gwen, "gwen@example.com");
    w.reset({
      ...withEvent(SELF_ON, DOOR_OPEN),
      // Wren, let in before the ways were told apart: a record that says only `qr`.
      "eventCheckIns/legacy-wren": {
        eventId: EVENT_ID,
        kind: "signup",
        rsvpId: RSVP.wren,
        uid: "wren",
        name: null,
        email: null,
        emailGoesAt: null,
        how: "qr",
        byUid: null,
        at: new Date("2026-11-01T14:01:00Z"),
        namesOffAt: new Date("2027-11-01T17:00:00Z"),
        namesOff: false,
      },
    });
    await call(self.POST, { as: "kofi", params: { id: EVENT_ID }, body: { doorCode: true } });
    await call(self.POST, { as: null, params: { id: EVENT_ID }, body: { rsvpId: RSVP.gwen, token: gwen } });
    await call(self.POST, { as: "mo", params: { id: EVENT_ID }, body: {} });
    await call(tick.POST, { as: "sue", params: { id: EVENT_ID }, body: { rsvpId: RSVP.chloe, from: "door" } });
    await call(tick.POST, { as: "zach", params: { id: EVENT_ID }, body: { from: "door", walkIn: { name: "Dan Fitzgerald" } } });
    await call(tick.POST, { as: "sue", params: { id: EVENT_ID }, body: { rsvpId: RSVP.pat, from: "page" } });
    const { text } = await open("sue");
    assert.match(
      text,
      /7 came 3 of 3 who signed up, 1 from the waiting list, 1 whose place wasn’t decided yet, and 2 walk-ins 4 checked themselves in 1 with the door code, 1 from their email, 1 on the check-in page, and 1 whose way in wasn’t recorded 2 at the door list Plus 1 of the 2 walk-ins 0 still to come/,
    );
    for (const row of [
      "WH Wren Hale Checked themselves in Themselves 2:01pm",
      "KA Kofi Asante Scanned the door code Themselves 2:05pm",
      "GP Gwen Price From their email Themselves 2:05pm",
      "MR Mo Rahman On the check-in page Themselves 2:05pm",
      "CN Chloe Nguyen Door list Sue 2:05pm",
      "DF Dan Fitzgerald No email Walk-in Zach 2:05pm",
      "PE Pat Ellis Added later Sue 2:05pm",
    ]) {
      assert.ok(text.includes(row), row);
    }
    // One way alone is said without its number.
    const counts = (themselvesBy) => ({ themselves: Object.values(themselvesBy).reduce((a, b) => a + b, 0), themselvesBy: { ...NO_SELF, ...themselvesBy } });
    const ON = { selfCheckIn: true, noSignup: false };
    const OFF = { selfCheckIn: false, noSignup: false };
    assert.equal(view.themselvesWords(counts({ code: 2 }), ON), "With the door code");
    assert.equal(view.themselvesWords(counts({ email: 1 }), ON), "From their email");
    assert.equal(view.themselvesWords(counts({ site: 3 }), ON), "On the check-in page");
    assert.equal(view.themselvesWords(counts({ qr: 2 }), OFF), "The way in wasn’t recorded");
    assert.equal(view.themselvesWords(counts({ code: 2, qr: 2 }), ON), "2 with the door code, and 2 whose ways in weren’t recorded");
    assert.equal(view.themselvesWords(counts({}), ON), "With the door code, or the link in their email");
    assert.equal(view.themselvesWords(counts({}), OFF), "Self check-in is off for this event");
    // Only a stored true is on, as everywhere else.
    assert.equal(view.themselvesWords(counts({}), { selfCheckIn: "true", noSignup: false }), "Self check-in is off for this event");
    // An event with no sign-up sends no confirmation email: before anybody
    // comes, the door code is the one way it names. Who came is said as itself.
    const DROP_IN = { selfCheckIn: true, noSignup: true };
    assert.equal(view.themselvesWords(counts({}), DROP_IN), "With the door code");
    assert.equal(view.themselvesWords(counts({}), { ...DROP_IN, selfCheckIn: false }), "Self check-in is off for this event");
    assert.equal(view.themselvesWords(counts({ code: 1, site: 2 }), DROP_IN), "1 with the door code, and 2 on the check-in page");
    // Who checked them in: themselves for every way of their own, else a name, else said not to be known.
    assert.equal(view.byWords({ how: "qr", by: null }), "Themselves");
    assert.equal(view.byWords({ how: "door", by: "Sue" }), "Sue");
    assert.equal(view.byWords({ how: "page", by: null }), "Not known");
    assert.equal(view.howWords({ standing: "walk-in", checkIn: { how: "page" } }), "Added later");
    assert.equal(view.howWords({ standing: "signed-up", checkIn: { how: "door" } }), "Door list");
    assert.equal(view.howWords({ standing: "walk-in", checkIn: { how: "door" } }), "Walk-in");
    assert.equal(view.howWords({ standing: "signed-up", checkIn: null }), "");
  });

  test("an event that does not let people check themselves in: the count says so, and every check-in is the committee's", async (t) => {
    clock(t, DURING);
    w.reset(withEvent(DOOR_OPEN));
    await call(tick.POST, { as: "sue", params: { id: EVENT_ID }, body: { rsvpId: RSVP.chloe, from: "door" } });
    assert.equal((await call(self.POST, { as: "kofi", params: { id: EVENT_ID }, body: { doorCode: true } })).status, 409);
    const { text } = await open("sue");
    assert.match(text, /1 came 1 of 3 who signed up 0 checked themselves in Self check-in is off for this event 1 at the door list 2 still to come/);
  });

  // A member with no sign-up who checks themselves in with the code walks in
  // with their account: their survey goes to the account, so there is no
  // "No email" under them; they came by the code, so "Scanned the door code"
  // and a place among who checked themselves in; and the three numbers still add
  // up to who came (walk 4b, L5). A walk-in with no account given at the
  // door keeps "No email" and "Walk-in" (above).
  test("a member who walks in with the code, signed in: Scanned the door code, no No email, counted among who checked themselves in", async (t) => {
    clock(t, DURING);
    w.reset(withEvent(SELF_ON, DOOR_OPEN));
    await call(self.POST, { as: "kofi", params: { id: EVENT_ID }, body: { doorCode: true } });
    await call(tick.POST, { as: "sue", params: { id: EVENT_ID }, body: { rsvpId: RSVP.chloe, from: "door" } });
    await call(tick.POST, {
      as: "sue",
      params: { id: EVENT_ID },
      body: { from: "door", walkIn: { name: "Dan Fitzgerald", email: "dan@example.com" } },
    });
    assert.equal((await call(self.POST, { as: "mo", params: { id: EVENT_ID }, body: { doorCode: true } })).status, 201);
    t.mock.timers.reset();
    clock(t, AFTER);
    const counts =
      "4 came 2 of 3 who signed up, and 2 walk-ins 2 checked themselves in With the door code 1 at the door list Plus 1 of the 2 walk-ins 1 didn’t come";
    for (const who of ["sue", "iris"]) assert.ok((await open(who)).text.includes(counts), who);
    const { text } = await open("sue");
    assert.match(text, /DF Dan Fitzgerald Email kept for the survey until Sun 8 Nov Walk-in Sue 2:05pm/);
    assert.match(text, /MR Mo Rahman Scanned the door code Themselves 2:05pm/);
    assert.ok(!/Mo Rahman No email/.test(text), "an account's survey goes to the account");
  });

  test("the walk-ins the door list adds to its count: the board's words, then how many of them came in at the door", async () => {
    const { plusWalkInsWords, cameWords } = await load("lib/events/checkInView.ts");
    const counts = (walkIns, walkInsThemselves) => ({
      expected: 18, signupsHere: 15, confirmed: 18, confirmedHere: 15, waitingHere: 0, undecidedHere: 0,
      walkIns, walkInsThemselves, here: 15 + walkIns, toCome: 3, themselves: 9, byList: 6,
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
    w.reset(withEvent(SELF_ON));
    const before = await open("sue");
    assert.match(
      before.text,
      new RegExp(`The door QR code No door code yet\\. Make one, then print it for the door\\. ${SIGNUPS} Make the door code`),
    );
    assert.match(
      before.text,
      /Door list Check people in on it from 1pm to 6pm, once the door is open\. After that, add them from this page\. See the door list$/,
    );
    assert.match(before.html, new RegExp(`href="/events/manage/${EVENT_ID}/door"`));

    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    const after = await open("sue");
    assert.match(
      after.text,
      new RegExp(`The door QR code naisi\\.uk\\/q\\/vr-in ${SIGNUPS} Print an A4 sign Download PNG`),
    );
    assert.match(after.html, /aria-label="QR code for naisi.uk\/q\/vr-in"/);
    assert.match(after.html, /href="\/signs\/vr-in" target="_blank" rel="noopener"/);
    assert.match(after.html, /href="\/api\/links\/vr-in\/qr\?format=png&amp;download=1" download="naisi-q-vr-in.png"/);
    assert.ok(!/<a[^>]*>\s*<button/.test(after.html), "no button inside a link");
  });

  test("an event that does not let people check themselves in has no door code card at all, even with a code made", async (t) => {
    clock(t, DURING);
    w.reset();
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    for (const who of ["sue", "zach"]) {
      const { text, html } = await open(who);
      assert.ok(!text.includes("The door QR code"), who);
      assert.ok(!html.includes("QR code for"), `${who}: no code drawn`);
      assert.ok(!text.includes("naisi.uk/q/vr-in"), who);
      assert.match(text, /Door list Check people in on it from 1pm to 6pm/, `${who}: the door list stays`);
    }
  });

  test("the door code card says who can check themselves in: at an event that takes sign-ups, and at a drop-in, where it names no place or email", async (t) => {
    clock(t, DURING);
    w.reset(withEvent(SELF_ON, DOOR_OPEN));
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    assert.match((await open("sue")).text, new RegExp(`The door QR code naisi\\.uk\\/q\\/vr-in ${SIGNUPS} Print an A4 sign`));
    // No sign-up: nobody holds a place or was sent a confirmation, so its
    // card, and the count before anybody comes, name neither.
    w.reset(withDropIn(SELF_ON, DOOR_OPEN));
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    for (const who of ["sue", "zach"]) {
      const { text } = await open(who);
      assert.match(text, new RegExp(`The door QR code naisi\\.uk\\/q\\/vr-in ${NO_SIGNUP} Print an A4 sign`), who);
      const card = /The door QR code ([\s\S]*?) Print an A4 sign/.exec(text)[1];
      assert.ok(!/place|email/i.test(card), `${who}: ${card}`);
      assert.match(text, /0 checked themselves in With the door code 0 at the door list/, who);
    }
    // Before the code is made, the card says the same words.
    w.reset(withDropIn(SELF_ON));
    assert.match((await open("sue")).text, new RegExp(`No door code yet\\. Make one, then print it for the door\\. ${NO_SIGNUP} Make the door code`));
  });

  test("a switched-off door code says where a scan lands", async (t) => {
    clock(t, DURING);
    w.reset(withEvent(SELF_ON));
    await call(doorCode.POST, { as: "sue", params: { id: EVENT_ID } });
    w.world.db.poke("trackedLinks/vr-in", { active: false });
    const { text } = await open("zach");
    assert.match(text, /This code is switched off in Short links, so a scan lands on \/links\./);
  });

  test("before the door's hours: when the door can be opened, no numbers; a week after: nothing more is added", async (t) => {
    w.reset();
    clock(t, BEFORE);
    const before = await open("sue");
    assert.match(
      before.text,
      /At the door The door list opens when the event’s author or an admin opens it\. Only the committee check people in\. It can be opened from 1pm on Sun 1 Nov, an hour before the start\./,
    );
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

// The door list takes a tick, and people check themselves in, once the door
// is open. The event's author, while their account stands, and admins open
// it from this card; everybody else reads whether it is open. Opening it
// shows nobody a name they could not see before.
describe("the At the door card", () => {
  /** The props the page gives "Open the door" for `as`, or null when it draws none. */
  async function doorButton(as) {
    w.world.user = typeof as === "string" ? PEOPLE[as] : as;
    const tree = await tab.default({ params: Promise.resolve({ id: EVENT_ID }) });
    const found = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      if (node.type === OpenDoorButton) found.push(node.props);
      walk(node.props?.children);
    };
    walk(tree);
    assert.ok(found.length <= 1, "one button at most");
    return found[0] ?? null;
  }
  const YOU = "At the door The door list opens when you or an admin open it. Only the committee check people in.";
  const THEY = "At the door The door list opens when the event’s author or an admin opens it. Only the committee check people in.";
  const approver = person("april", "member", "April Stone", { permissions: { approveEvent: true } });

  test("inside the door's hours, the event's author and admins are told they open it, and can", async (t) => {
    clock(t, DURING);
    w.reset();
    for (const who of ["iris", "zach"]) {
      const { text, html } = await open(who);
      assert.ok(text.includes(`${YOU} Open the door`), who);
      assert.match(html, />Open the door</, who);
      assert.deepEqual(await doorButton(who), { eventId: EVENT_ID, enabled: true }, who);
    }
  });

  test("everybody else reads the door's state, and is offered no button", async (t) => {
    clock(t, DURING);
    w.reset();
    for (const who of ["sue", "cal", approver, { ...PEOPLE.iris, role: "rejected" }]) {
      const { text, html } = await open(who);
      assert.ok(text.includes(`${THEY} The door isn’t open yet.`), String(who.uid ?? who));
      assert.ok(!html.includes("Open the door"), String(who.uid ?? who));
      assert.equal(await doorButton(who), null);
    }
  });

  test("before the door's hours the button is held, with when it can be pressed", async (t) => {
    clock(t, BEFORE);
    w.reset();
    const iris = await open("iris");
    assert.ok(iris.text.includes(`${YOU} You can open the door from 1pm on Sun 1 Nov, an hour before the start. Open the door`));
    assert.deepEqual(await doorButton("iris"), { eventId: EVENT_ID, enabled: false });
    const sue = await open("sue");
    assert.ok(sue.text.includes(`${THEY} It can be opened from 1pm on Sun 1 Nov, an hour before the start.`));
    assert.equal(await doorButton("sue"), null);
  });

  test("once it is open, everybody reads who opened it and when it closes by itself; nobody is offered the button", async (t) => {
    clock(t, DURING);
    w.reset(withEvent(DOOR_OPEN));
    const OPEN = "At the door The door is open. Iris opened it at 1:05pm. It closes by itself at 6pm, an hour after the end.";
    for (const who of ["sue", "cal", "zach", approver]) {
      assert.ok((await open(who)).text.includes(OPEN), String(who.uid ?? who));
      assert.equal(await doorButton(who), null);
    }
    assert.ok((await open("iris")).text.includes("At the door The door is open. You opened it at 1:05pm."), "to the person who opened it");
    assert.equal(await doorButton("iris"), null);
    // An opener whose name is not known any more.
    w.reset(withEvent({ ...DOOR_OPEN, doorOpenedBy: "a-deleted-account" }));
    assert.ok((await open("sue")).text.includes("The door is open. Somebody opened it at 1:05pm."));
  });

  test("after the door's hours: when it closed, and who had opened it", async (t) => {
    clock(t, AFTER);
    w.reset(withEvent(DOOR_OPEN));
    assert.ok((await open("sue")).text.includes("At the door Iris opened the door at 1:05pm. It closed by itself at 6pm, an hour after the end."));
    w.reset();
    for (const who of ["sue", "iris"]) {
      const { text } = await open(who);
      assert.ok(text.includes("At the door The door closed at 6pm, an hour after the end."), who);
      assert.equal(await doorButton(who), null, who);
    }
  });

  test("pressing it opens the door, the card says so, and the author still sees no name of anybody who came", async (t) => {
    clock(t, DURING);
    w.reset();
    assert.equal((await call(doorRoute.POST, { as: "iris", params: { id: EVENT_ID } })).status, 201);
    assert.equal((await call(tick.POST, { as: "sue", params: { id: EVENT_ID }, body: { rsvpId: RSVP.kofi, from: "door" } })).status, 201);
    assert.ok((await open("sue")).text.includes("The door is open. Iris opened it at 2:05pm."));
    const { text, html } = await open("iris");
    assert.ok(text.includes("The door is open. You opened it at 2:05pm."));
    assert.match(text, /1 came 1 of 3 who signed up/);
    for (const name of NAMES) assert.ok(!html.includes(name), `${name} is nowhere in the author's page`);
  });

  test("no card for an event with no door: not published, or no date", async (t) => {
    clock(t, DURING);
    for (const extra of [{ status: "draft" }, { status: "cancelled" }, { startAt: null, endAt: null }]) {
      w.reset(withEvent(extra));
      const { text } = await open("zach");
      assert.ok(!text.includes("At the door"), JSON.stringify(extra));
      assert.equal(await doorButton("zach"), null);
    }
  });

  test("the button: one press, held until the page's script arrives, the height of a finger", () => {
    const html = renderToStaticMarkup(createElement(OpenDoorButton, { eventId: EVENT_ID, enabled: true }));
    assert.equal(textOf(html), "Open the door");
    assert.match(html, /<button[^>]*disabled=""/);
    assert.match(html, /class="[^"]*\bmd\b/, "the default size, 44px tall");
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
    /4 came 2 of 3 who signed up, and 2 walk-ins 1 checked themselves in With the door code 1 at the door list Plus the 2 walk-ins 1 didn’t come Check-in never stops anyone signing up again\. Admins may see when someone has missed two events in a row that they had a place at\./;

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
      /Who came 4 Until Sun 8 Nov, a week after the event Add someone who came Who came, in the order they were checked in Name How Checked in by When CN Chloe Nguyen Door list Sue 2:05pm DF Dan Fitzgerald .+ MR Mo Rahman No email Walk-in Sue 2:05pm 1 more came whose name has come off: counted, not listed\./,
    );
    assert.match(
      text,
      /Didn’t come 1 1 of these came, but their name has come off, so we can’t tell which\. GP Gwen Price They came KA Kofi Asante They came/,
    );
  });

  test("the counting: every record whose names have come off is one person, a sign-up's taken from the confirmed with no tick while there are any", async () => {
    const row = (rsvpId, standing, checkIn = null) => ({ key: rsvpId, rsvpId, name: rsvpId, standing, checkIn });
    const ticked = (how) => ({ id: "c", how, at: "2026-11-01T14:05:00.000Z", by: null, emailGoesAt: null, noEmail: false });
    const off = (kind, how) => ({ id: `off-${kind}-${how}`, eventId: EVENT_ID, kind, how, namesOff: true });
    // Each keeps the way it came in: a sign-up from before the ways were told
    // apart (`qr`), one on the door list, a walk-in on the door list, and a
    // walk-in with an account who used the door code.
    assert.deepEqual(
      view.namesOffOf([off("signup", "qr"), off("signup", "door"), off("walk-in", "door"), off("walk-in", "code"), { ...off("signup", "page"), namesOff: false }]),
      { signups: 2, signupsThemselves: { ...NO_SELF, qr: 1 }, walkIns: 2, walkInsThemselves: { ...NO_SELF, code: 1 } },
    );
    // Three confirmed, one of them ticked; two sign-ups and a walk-in whose names came off.
    const namesOff = { signups: 2, signupsThemselves: { ...NO_SELF, qr: 1 }, walkIns: 1, walkInsThemselves: NO_SELF };
    const rows = [row("a", "signed-up", ticked("door")), row("b", "signed-up"), row("c", "signed-up"), row("w", "waiting")];
    assert.deepEqual(view.doorCounts(rows, namesOff), {
      expected: 3,
      signupsHere: 3,
      walkIns: 1,
      here: 4,
      toCome: 0,
      // The sign-up whose names came off after checking themselves in, before
      // the ways were told apart: themselves, the way not recorded.
      themselves: 1,
      themselvesBy: { ...NO_SELF, qr: 1 },
      byList: 2,
      notListed: 3,
      cameUnticked: 2,
      // Of the confirmed, the one ticked and the two whose names came off
      // with their ticks; nobody from the waiting list or undecided came by a
      // row, and no walk-in checked themselves in (walk 4b, L5 and L9).
      confirmed: 3,
      confirmedHere: 3,
      waitingHere: 0,
      undecidedHere: 0,
      walkInsThemselves: 0,
    });
    // More whose names came off than confirmed with no tick: the rest were let in, and are expected as they came.
    assert.deepEqual(
      view.doorCounts([row("a", "signed-up")], { signups: 3, signupsThemselves: NO_SELF, walkIns: 0, walkInsThemselves: NO_SELF }),
      {
        expected: 3,
        signupsHere: 3,
        walkIns: 0,
        here: 3,
        toCome: 0,
        themselves: 0,
        themselvesBy: NO_SELF,
        byList: 3,
        notListed: 3,
        cameUnticked: 1,
        // One confirmed, taken to be one of the three whose names came off.
        confirmed: 1,
        confirmedHere: 1,
        waitingHere: 0,
        undecidedHere: 0,
        walkInsThemselves: 0,
      },
    );
    // A walk-in who checked themselves in, whose names came off, is still
    // somebody who checked themselves in, and not one more at the door.
    const walkedIn = view.doorCounts([], { signups: 0, signupsThemselves: NO_SELF, walkIns: 2, walkInsThemselves: { ...NO_SELF, code: 1 } });
    assert.deepEqual([walkedIn.here, walkedIn.themselves, walkedIn.byList, walkedIn.walkInsThemselves], [2, 1, 0, 1]);
    assert.equal(view.plusWalkInsWords(walkedIn), "Plus 1 of the 2 walk-ins");
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
    const row = (rsvpId, standing, checkIn = null) => ({ key: rsvpId, rsvpId, name: rsvpId, standing, checkIn });
    const ticked = (how) => ({ id: "c", how, at: "2026-11-01T14:05:00.000Z", by: null, emailGoesAt: null, noEmail: false });
    // Three confirmed: two ticked, one whose names came off with its tick; one
    // let in from the waiting list; one walk-in on a row and one whose names came off.
    const rows = [
      row("a", "signed-up", ticked("door")),
      row("b", "signed-up", ticked("qr")),
      row("c", "signed-up"),
      row("w", "waiting", ticked("door")),
      row("x", "walk-in", ticked("door")),
    ];
    const counts = view.doorCounts(rows, { signups: 1, signupsThemselves: NO_SELF, walkIns: 1, walkInsThemselves: NO_SELF });
    assert.equal(counts.here, 6);
    assert.equal(counts.confirmedHere + counts.waitingHere + counts.undecidedHere + counts.walkIns, counts.here);
    // And the three ways in add up to it too: themselves, the door list, and the walk-ins at the door.
    assert.equal(counts.themselves + counts.byList + (counts.walkIns - counts.walkInsThemselves), counts.here);
    assert.equal(view.cameWords(counts), "3 of 3 who signed up, 1 from the waiting list, and 2 walk-ins");
    assert.equal(view.plusWalkInsWords(counts), "Plus the 2 walk-ins");
    assert.equal(counts.toCome, 0);
  });
});
