/**
 * MISSED EVENTS, AND "CAN'T MAKE IT" ON AN EVENT.
 *
 * Privacy v15, "Attendance": "Admins can see which events you signed up for
 * and whether you came. Missing two events in a row that you had a place at
 * may be taken into account when places are decided. Telling us beforehand
 * that you can't make it, or giving your place back before the day, never
 * counts, and the count starts again each academic year."
 *
 * In order:
 *
 *  1. THE RULES (`src/lib/events/missedEvents.ts`), on their own: two in a
 *     row; what counts (a confirmed place when it started, a door that was
 *     opened, an event that is over and not cancelled, this academic year,
 *     after the person agreed to v15) and what never does (a place given
 *     back, a request not decided, the waiting list, a test sign-up, a
 *     drop-in, a place confirmed after the start).
 *  2. THE LOADER, against a store that keeps when each row was written: one
 *     person's own rows, never a guest's sign-up made with their address.
 *  3. THE ROUTES AS EVERY CALLER: the requests on an event's Sign-ups page
 *     carry the line for an admin alone, and the Events card's route answers
 *     an admin alone.
 *  4. THE EVENT PAGE for somebody holding a place: "You have a place" with
 *     "Can't make it" until it starts, which gives the place back through
 *     the cancel route and moves the waiting list up; the email's cancel page
 *     in the same words; and nothing of it during a view-as session.
 *  5. THE WALK: every file that reaches the module is behind the admin
 *     check, every file that names the sign-ups collection says what it
 *     writes and what that does to the count, and the module reaches no
 *     survey code.
 *
 * The world is the check-in suites' (`tests/lib/checkInWorld.mjs`) with a
 * season of events of its own: Priya missed the last two that count, Tom came
 * to the last one, Wren was moved up from the waiting list after two events
 * had started, and Kofi has not agreed to privacy v15. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeDb } from "./lib/applicationsStore.mjs";
import { PEOPLE, makeCheckInWorld, person, textOf } from "./lib/checkInWorld.mjs";
import { callsOf, resolveImport, walkSource } from "./lib/functionScan.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const MAIL = "__missedEventsMail";
const AUTH = "__missedEventsAuth";
// The email's cancel link is signed; its page and the route check it.
process.env.EVENTS_TOKEN_SECRET ||= "missed-events-test-secret-of-forty-characters";

const w = await makeCheckInWorld("__missedEvents", {
  stubs: [
    // Giving a place back emails the person moved up; here the email is kept, never sent.
    ["@/lib/events/sendRsvpEmail", `export const sendRsvpEmail = async (args) => { (globalThis.${MAIL} ||= []).push(args); };`],
    // The browser's session and the maintenance notice, which a server render never reaches.
    ["@/auth/AuthProvider", `export function useAuth() { return globalThis.${AUTH} ?? { user: null, accountName: null, loading: false }; }`],
    [
      "@/features/maintenance/useSiteNotice",
      "export function useSiteNotice() { return { paused: { eventSignups: false }, bannerMessage: '' }; }",
    ],
  ],
});
const { call, render, load } = w;
const rules = await load("lib/events/missedEvents.ts");
const words = await load("lib/events/attendanceWords.ts");
const requestWords = await load("lib/events/requestWords.ts");
const signupsRoute = await load("app/api/events/[id]/signups/route.ts");
const personRoute = await load("app/api/admin/members/[uid]/events/route.ts");
const cancelRoute = await load("app/api/events/[id]/rsvp/[rsvpId]/cancel/route.ts");
const eventPage = await load("app/(public)/events/[id]/page.tsx");
const cancelPage = await load("app/(public)/events/[id]/rsvp/[rsvpId]/cancel/page.tsx");
const { MemberEventsView } = await load("features/admin/MemberEvents.tsx");
const { SignupRequestsView } = await load("features/events/SignupRequests.tsx");

const MISSED = requestWords.REQUEST_WORDS.missed;
const HELD = words.HELD_PLACE_WORDS;

/** The clock, set to `at` for one test: Date only, so nothing else waits on a mocked timer. */
function clock(t, at) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

// ---------------------------------------------------------------------------
// The people and the season
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;
/** When Priya, Tom and Wren agreed to privacy v15. */
const AGREED = new Date("2026-10-01T09:00:00Z");
/** Fri 20 Nov 2026, midday. */
const NOW = new Date("2026-11-20T12:00:00Z");
/** When the season's rows were written, before any of its events: the rows nobody touched since. */
const SEEDED = new Date("2026-07-01T09:00:00Z");

const PRIYA = person("priya", "member", "Priya Shah");
const TOM = person("tom", "member", "Tom Okafor");
const WREN = person("wren", "member", "Wren Hale");
const KOFI = person("kofi", "member", "Kofi Asante");
const { zach: ZACH, sue: SUE, iris: IRIS, cal: CAL, mo: MO, ines: INES } = PEOPLE;

function account(who, extra = {}) {
  return {
    uid: who.uid,
    email: who.email,
    displayName: who.displayName,
    role: who.role,
    suRecognised: who.suRecognised,
    permissions: who.permissions,
    profile: { preferredName: who.displayName.split(" ")[0] },
    policyVersion: "terms.1+privacy.15",
    policyAgreedAt: AGREED,
    ...extra,
  };
}

/** An event three hours long, run by Iris with Cal helping, whose door Iris opened half an hour before it. */
function eventAt(title, start, extra = {}) {
  const startAt = new Date(start);
  return {
    title,
    blocks: [],
    startAt,
    endAt: new Date(startAt.getTime() + 3 * HOUR),
    location: "Room B52",
    locationHidden: false,
    locationPublicText: "",
    visibility: "public",
    capacity: 30,
    waitlistEnabled: true,
    noSignup: false,
    signupForm: [],
    status: "published",
    archived: false,
    authorUid: "iris",
    authorDisplayName: "Iris Walker",
    collaboratorUids: ["cal"],
    doorOpenedAt: new Date(startAt.getTime() - HOUR / 2),
    doorOpenedBy: "iris",
    rsvpCountPending: 0,
    rsvpCountConfirmed: 0,
    rsvpCountWaitlisted: 0,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
    ...extra,
  };
}

function signup(eventId, who, status, extra = {}) {
  return {
    eventId,
    uid: who ? who.uid : null,
    name: who ? who.displayName : "Gwen Price",
    email: who ? who.email : "gwen@example.com",
    answers: {},
    status,
    synthetic: false,
    decisionNote: null,
    decidedBy: "iris",
    decidedAt: new Date("2026-09-30T10:00:00Z"),
    pendingAnswers: null,
    signupSnapshot: null,
    createdAt: new Date("2026-09-29T10:00:00Z"),
    cancelledAt: null,
    ...extra,
  };
}

function cameIn(eventId, who, rsvpId, at) {
  return {
    eventId,
    kind: "signup",
    rsvpId,
    uid: who.uid,
    name: null,
    email: null,
    emailGoesAt: null,
    how: "door",
    byUid: "iris",
    at: new Date(at),
    namesOffAt: new Date("2027-12-01T00:00:00Z"),
    namesOff: false,
  };
}

/** The season's events, by id, with their starts (London is on BST until 25 Oct). */
const EVENTS = {
  "ev-last-year": eventAt("Summer picnic", "2026-07-10T17:00:00Z"),
  "ev-sep": eventAt("Welcome drinks", "2026-09-21T18:00:00Z"),
  "ev-a": eventAt("Reading group", "2026-10-08T18:00:00Z"),
  "ev-b": eventAt("Board games night", "2026-10-15T18:00:00Z"),
  "ev-c": eventAt("Film night", "2026-10-22T18:00:00Z"),
  "ev-d": eventAt("Policy social", "2026-10-29T19:00:00Z"),
  // Nobody opened its door: check-in was not used, so nobody's place there counts.
  "ev-e": eventAt("Pizza and papers", "2026-11-05T19:00:00Z", { doorOpenedAt: null, doorOpenedBy: null }),
  "ev-f": eventAt("Quiz night", "2026-11-12T19:00:00Z"),
  "ev-g": eventAt("Speaker evening", "2026-11-26T19:00:00Z", { rsvpCountConfirmed: 1, rsvpCountWaitlisted: 1, capacity: 1 }),
  "ev-req": eventAt("Winter social", "2026-12-03T19:00:00Z", { rsvpCountPending: 5 }),
};

/**
 * Priya: a place at every event; came to Board games night; missed Reading
 * group, Film night and Policy social; Pizza and papers had no check-in at
 * all; gave Quiz night back; Speaker evening is still to come; and a request
 * for a place at the Winter social is waiting. Tom came to Policy social after
 * missing Film night. Wren was on the waiting list for Film night and Policy
 * social and was moved up after each had started, when somebody gave a place
 * back. Kofi missed both and has not agreed to privacy v15. Gwen is a guest
 * who signed up with Priya's address.
 */
function season() {
  const seed = {};
  for (const [id, event] of Object.entries(EVENTS)) seed[`events/${id}`] = event;
  for (const who of [ZACH, SUE, IRIS, CAL, MO, INES, PRIYA, TOM, WREN]) seed[`users/${who.uid}`] = account(who);
  seed["users/kofi"] = account(KOFI, { policyVersion: "terms.1+privacy.14" });
  for (const id of ["ev-last-year", "ev-sep", "ev-a", "ev-b", "ev-c", "ev-d", "ev-e", "ev-g"]) {
    seed[`eventRsvps/${id}__priya`] = signup(id, PRIYA, "confirmed");
  }
  seed["eventCheckIns/ci-b-priya"] = cameIn("ev-b", PRIYA, "ev-b__priya", "2026-10-15T18:10:00Z");
  seed["eventRsvps/ev-c__tom"] = signup("ev-c", TOM, "confirmed");
  seed["eventRsvps/ev-d__tom"] = signup("ev-d", TOM, "confirmed");
  seed["eventCheckIns/ci-d-tom"] = cameIn("ev-d", TOM, "ev-d__tom", "2026-10-29T19:05:00Z");
  seed["eventRsvps/ev-c__kofi"] = signup("ev-c", KOFI, "confirmed");
  seed["eventRsvps/ev-d__kofi"] = signup("ev-d", KOFI, "confirmed");
  seed["eventRsvps/ev-g__wren"] = signup("ev-g", WREN, "waitlisted");
  for (const who of [PRIYA, TOM, WREN, KOFI]) {
    seed[`eventRsvps/ev-req__${who.uid}`] = signup("ev-req", who, "pending", { decidedBy: null, decidedAt: null });
  }
  seed["eventRsvps/ev-req__gwen"] = signup("ev-req", null, "pending", { email: PRIYA.email, decidedBy: null, decidedAt: null });
  seed["eventRsvps/ev-a__gwen"] = signup("ev-a", null, "confirmed", { email: PRIYA.email });
  return seed;
}

/** The store, with every row of the season written before its events, then the rows written later. */
function reset() {
  w.reset();
  const db = makeDb(season(), { now: () => new Date(), seededAt: SEEDED });
  // Quiz night: Priya gave her place back two days before.
  db.seed("eventRsvps/ev-f__priya", signup("ev-f", PRIYA, "cancelled", { cancelledAt: new Date("2026-11-10T09:00:00Z") }), new Date("2026-11-10T09:00:00Z"));
  // Wren: moved up from the waiting list after each event had started.
  db.seed("eventRsvps/ev-c__wren", signup("ev-c", WREN, "confirmed"), new Date("2026-10-22T18:40:00Z"));
  db.seed("eventRsvps/ev-d__wren", signup("ev-d", WREN, "confirmed"), new Date("2026-10-29T19:30:00Z"));
  w.world.db = db;
  globalThis[MAIL] = [];
  globalThis[AUTH] = undefined;
  return db;
}

// ---------------------------------------------------------------------------
// 1. The rules
// ---------------------------------------------------------------------------

/** One person, as the rules read them: events by id, every sign-up theirs unless it says otherwise. */
function attendance({ events, signups, checkIns = [], agreedFrom = AGREED }) {
  return {
    uid: "priya",
    agreedFrom,
    signups: signups.map((row, i) => ({
      id: row.id ?? `s${i}`,
      eventId: row.eventId,
      uid: "uid" in row ? row.uid : "priya",
      status: row.status ?? "confirmed",
      synthetic: row.synthetic ?? false,
      createdAt: row.createdAt ?? new Date("2026-09-29T10:00:00Z"),
      writtenAt: "writtenAt" in row ? row.writtenAt : SEEDED,
    })),
    checkIns: checkIns.map((row) => ({ rsvpId: null, uid: "priya", namesOff: false, ...row })),
    events: new Map(
      Object.entries(events).map(([id, event]) => [
        id,
        {
          id,
          title: event.title,
          status: event.status,
          startAt: event.startAt,
          endAt: event.endAt,
          noSignup: event.noSignup,
          doorOpenedAt: event.doorOpenedAt,
          doorOpenedBy: event.doorOpenedBy,
        },
      ]),
    ),
  };
}

const three = { "ev-b": EVENTS["ev-b"], "ev-c": EVENTS["ev-c"], "ev-d": EVENTS["ev-d"] };
const placesAt = (...ids) => ids.map((eventId) => ({ eventId }));

describe("the rules: two in a row that count", () => {
  test("the two most recent events that count both went by without them", () => {
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-c", "ev-d") }), NOW), true);
    // Three missed is two in a row as well.
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-b", "ev-c", "ev-d") }), NOW), true);
  });

  test("one missed is not two; and coming to the most recent, or the one before, breaks the row", () => {
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-d") }), NOW), false);
    const came = (eventId) => [{ eventId, uid: "priya" }];
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-b", "ev-c", "ev-d"), checkIns: came("ev-d") }), NOW), false);
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-b", "ev-c", "ev-d"), checkIns: came("ev-c") }), NOW), false);
    // Coming to an earlier one does not break a row after it.
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-b", "ev-c", "ev-d"), checkIns: came("ev-b") }), NOW), true);
    // Checked in by their sign-up rather than their account is coming too.
    const bySignup = attendance({
      events: three,
      signups: [{ id: "s-c", eventId: "ev-c" }, { id: "s-d", eventId: "ev-d" }],
      checkIns: [{ eventId: "ev-d", uid: null, rsvpId: "s-d" }],
    });
    assert.equal(rules.missedTwoInARow(bySignup, NOW), false);
  });

  test("an event that does not count neither makes the row nor breaks it", () => {
    // Film night given back between two missed places: still two in a row.
    const between = attendance({ events: three, signups: [{ eventId: "ev-b" }, { eventId: "ev-c", status: "cancelled" }, { eventId: "ev-d" }] });
    assert.deepEqual(rules.countedEvents(between, NOW).map((row) => row.event.id), ["ev-d", "ev-b"]);
    assert.equal(rules.missedTwoInARow(between, NOW), true);
  });
});

describe("the rules: what never counts", () => {
  test("a place given back, whenever it was given back", () => {
    for (const writtenAt of [new Date("2026-10-20T10:00:00Z"), new Date("2026-10-22T20:00:00Z"), new Date("2026-10-30T10:00:00Z")]) {
      const gave = attendance({ events: three, signups: [{ eventId: "ev-c", status: "cancelled", writtenAt }, { eventId: "ev-d" }] });
      assert.deepEqual(rules.countedEvents(gave, NOW).map((row) => row.event.id), ["ev-d"], String(writtenAt));
      assert.equal(rules.missedTwoInARow(gave, NOW), false);
    }
  });

  test("a request nobody decided, the waiting list, a turned-down request and a test sign-up", () => {
    for (const other of [{ status: "pending" }, { status: "waitlisted" }, { status: "denied" }, { synthetic: true }]) {
      const person = attendance({ events: three, signups: [{ eventId: "ev-c", ...other }, { eventId: "ev-d" }] });
      assert.equal(rules.missedTwoInARow(person, NOW), false, JSON.stringify(other));
      assert.deepEqual(rules.countedEvents(person, NOW).map((row) => row.event.id), ["ev-d"], JSON.stringify(other));
    }
  });

  test("a place confirmed after the event started: moved up from the waiting list, or approved late", () => {
    for (const writtenAt of [new Date("2026-10-22T18:40:00Z"), new Date("2026-10-23T09:00:00Z")]) {
      const late = attendance({ events: three, signups: [{ eventId: "ev-c", writtenAt }, { eventId: "ev-d" }] });
      assert.equal(rules.missedTwoInARow(late, NOW), false, String(writtenAt));
    }
    // Written at the very start is before it, by a hair.
    const onTime = attendance({ events: three, signups: [{ eventId: "ev-c", writtenAt: EVENTS["ev-c"].startAt }, { eventId: "ev-d" }] });
    assert.equal(rules.missedTwoInARow(onTime, NOW), true);
    // A row whose write time cannot be told is not taken to have been written before.
    const unknown = attendance({ events: three, signups: [{ eventId: "ev-c", writtenAt: null }, { eventId: "ev-d" }] });
    assert.equal(rules.missedTwoInARow(unknown, NOW), false);
  });

  test("an event whose door was never opened, or was opened for other hours than it has now", () => {
    const shut = { ...three, "ev-c": { ...EVENTS["ev-c"], doorOpenedAt: null, doorOpenedBy: null } };
    assert.equal(rules.missedTwoInARow(attendance({ events: shut, signups: placesAt("ev-c", "ev-d") }), NOW), false);
    // Opened a week before, when the event was set for then, and moved since: not this door.
    const moved = { ...three, "ev-c": { ...EVENTS["ev-c"], doorOpenedAt: new Date("2026-10-15T17:30:00Z") } };
    assert.equal(rules.missedTwoInARow(attendance({ events: moved, signups: placesAt("ev-c", "ev-d") }), NOW), false);
  });

  test("a cancelled event, a drop-in and an event not over yet", () => {
    const variants = {
      cancelled: { status: "cancelled" },
      dropIn: { noSignup: true },
    };
    for (const [name, change] of Object.entries(variants)) {
      const events = { ...three, "ev-c": { ...EVENTS["ev-c"], ...change } };
      assert.equal(rules.missedTwoInARow(attendance({ events, signups: placesAt("ev-c", "ev-d") }), NOW), false, name);
    }
    // During Policy social, before it is over: it does not count yet.
    const during = new Date("2026-10-29T20:00:00Z");
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-c", "ev-d") }), during), false);
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-c", "ev-d") }), new Date("2026-10-29T22:01:00Z")), true);
  });

  test("before they agreed to privacy v15, and for somebody who has not", () => {
    const late = new Date("2026-10-25T09:00:00Z");
    // Film night was before they agreed: only Policy social counts.
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-c", "ev-d"), agreedFrom: late }), NOW), false);
    assert.equal(rules.missedTwoInARow(attendance({ events: three, signups: placesAt("ev-c", "ev-d"), agreedFrom: null }), NOW), false);
    assert.deepEqual(rules.countedEvents(attendance({ events: three, signups: placesAt("ev-c", "ev-d"), agreedFrom: null }), NOW), []);
  });

  test("somebody else's sign-up: a guest's made with their address is never theirs", () => {
    const guest = attendance({ events: three, signups: [{ eventId: "ev-c", uid: null }, { eventId: "ev-d", uid: "tom" }] });
    assert.deepEqual(rules.countedEvents(guest, NOW), []);
  });
});

describe("the rules: the count starts again each academic year", () => {
  test("the academic year begins on 1 September, at midnight in London", () => {
    // 31 August, 11:59pm in London (BST) is still last year's; a minute later is this year's.
    assert.equal(rules.academicYearStart(new Date("2026-08-31T22:59:00Z")).toISOString(), "2025-08-31T23:00:00.000Z");
    assert.equal(rules.academicYearStart(new Date("2026-08-31T23:00:00Z")).toISOString(), "2026-08-31T23:00:00.000Z");
    assert.equal(rules.academicYearStart(NOW).toISOString(), "2026-08-31T23:00:00.000Z");
    assert.equal(rules.academicYearStart(new Date("2027-03-01T12:00:00Z")).toISOString(), "2026-08-31T23:00:00.000Z");
    assert.equal(rules.academicYearStart(new Date("2027-09-01T12:00:00Z")).toISOString(), "2027-08-31T23:00:00.000Z");
  });

  test("last year's events never count, and on 1 September the row is gone", () => {
    const july = { "ev-last-year": EVENTS["ev-last-year"], "ev-c": EVENTS["ev-c"] };
    const person = attendance({ events: july, signups: placesAt("ev-last-year", "ev-c"), agreedFrom: new Date("2026-06-01T09:00:00Z") });
    assert.deepEqual(rules.countedEvents(person, NOW).map((row) => row.event.id), ["ev-c"]);
    assert.equal(rules.missedTwoInARow(person, NOW), false);
    const twoMissed = attendance({ events: three, signups: placesAt("ev-c", "ev-d") });
    assert.equal(rules.missedTwoInARow(twoMissed, new Date("2027-08-31T12:00:00Z")), true);
    assert.equal(rules.missedTwoInARow(twoMissed, new Date("2027-09-01T12:00:00Z")), false);
  });
});

describe("the rules: what an admin's page lists", () => {
  test("this academic year's events, newest first, each with where they stand; nothing for somebody who has not agreed", () => {
    const person = attendance({
      events: { ...three, "ev-g": EVENTS["ev-g"], "ev-last-year": EVENTS["ev-last-year"], "ev-e": EVENTS["ev-e"], "ev-f": EVENTS["ev-f"] },
      signups: [
        { eventId: "ev-last-year" },
        { eventId: "ev-b" },
        { eventId: "ev-c" },
        { eventId: "ev-d", status: "waitlisted" },
        { eventId: "ev-e" },
        { eventId: "ev-f", status: "cancelled" },
        { eventId: "ev-g" },
      ],
      checkIns: [{ eventId: "ev-b" }],
    });
    assert.deepEqual(
      rules.personEventRows(person, NOW).map((row) => `${row.eventId} ${row.state}`),
      ["ev-g place", "ev-f cancelled", "ev-e unchecked", "ev-d waiting-list", "ev-c missed", "ev-b came"],
    );
    assert.deepEqual(rules.personEventRows({ ...person, agreedFrom: null }, NOW), []);
  });

  test("an event they came to with no sign-up is listed as came; a test sign-up is not listed", () => {
    const person = attendance({
      events: three,
      signups: [{ eventId: "ev-c", synthetic: true }],
      checkIns: [{ eventId: "ev-d" }],
    });
    assert.deepEqual(rules.personEventRows(person, NOW).map((row) => `${row.eventId} ${row.state}`), ["ev-d came"]);
  });
});

// ---------------------------------------------------------------------------
// 2. The loader
// ---------------------------------------------------------------------------

describe("the loader reads one person's own rows, and works it out each time", () => {
  test("Priya missed the last two; Tom came to the last; Wren was moved up after each had started; Kofi has not agreed", async () => {
    const db = reset();
    const missed = await rules.missedEventsOf(db, ["priya", "tom", "wren", "kofi", "nobody-here", "not/an/id"], NOW);
    assert.deepEqual([...missed].sort(), ["priya"]);
  });

  test("Priya's page: the year's events with where she stands, and the line", async () => {
    const db = reset();
    const view = await rules.eventsOfPerson(db, "priya", NOW);
    assert.equal(view.missed, true);
    assert.equal(view.agreedAt, AGREED.toISOString());
    assert.deepEqual(
      view.events.map((row) => `${row.title}: ${row.state}`),
      [
        "Winter social: asked",
        "Speaker evening: place",
        "Quiz night: cancelled",
        "Pizza and papers: unchecked",
        "Policy social: missed",
        "Film night: missed",
        "Board games night: came",
        "Reading group: missed",
        "Welcome drinks: missed",
      ],
    );
    // Gwen's sign-ups with Priya's address are a guest's, read by nobody here:
    // Reading group is Priya's own place once, and Winter social her own request.
    assert.deepEqual(view.events.filter((row) => row.eventId === "ev-a").map((row) => row.state), ["missed"]);
    assert.deepEqual(view.events.filter((row) => row.eventId === "ev-req").map((row) => row.state), ["asked"]);
    assert.deepEqual(Object.keys(view).sort(), ["agreedAt", "events", "missed"]);
    for (const row of view.events) assert.deepEqual(Object.keys(row).sort(), ["eventId", "startAt", "state", "title"]);
  });

  test("nothing is listed or counted for somebody who has not agreed, and an id with no account is nobody's", async () => {
    const db = reset();
    const kofi = await rules.eventsOfPerson(db, "kofi", NOW);
    assert.deepEqual(kofi, { agreedAt: null, missed: false, events: [] });
    assert.equal(await rules.eventsOfPerson(db, "nobody-here", NOW), null);
  });

  test("nothing is written", async () => {
    const db = reset();
    const before = JSON.stringify(db.paths().sort().map((path) => [path, db.read(path)]));
    await rules.missedEventsOf(db, ["priya", "tom"], NOW);
    await rules.eventsOfPerson(db, "priya", NOW);
    assert.equal(JSON.stringify(db.paths().sort().map((path) => [path, db.read(path)])), before);
    assert.deepEqual(db.stats.writes, []);
  });
});

// ---------------------------------------------------------------------------
// 3. The routes as every caller
// ---------------------------------------------------------------------------

const requestsFor = async (as) => {
  const res = await call(signupsRoute.GET, { as, params: { id: "ev-req" } });
  assert.equal(res.status, 200, as?.uid);
  return Object.fromEntries(res.body.requests.map((request) => [request.id, request.missed]));
};

describe("the line beside a request: an admin's alone", () => {
  test("an admin is told Priya did not come to the last two; nobody else is told anything", async (t) => {
    clock(t, NOW);
    reset();
    assert.deepEqual(await requestsFor(ZACH), {
      "ev-req__priya": true,
      "ev-req__tom": false,
      "ev-req__wren": false,
      "ev-req__kofi": false,
      "ev-req__gwen": false,
    });
    // SU-recognised committee see who signed up and who came at each event, and not this.
    for (const who of [SUE, IRIS, CAL]) {
      const missed = await requestsFor(who);
      assert.ok(Object.values(missed).every((value) => value === false), who.uid);
    }
  });

  test("the card draws the line and who sees it, and only where it was sent", () => {
    const request = {
      id: "r1",
      name: { name: "Priya Shah", goBy: "Priya", apart: null, note: null },
      askedAt: "2026-11-16T09:40:00.000Z",
      email: "priya@example.com",
      answers: [],
      about: [],
      page: "/admin/members/priya",
      missed: true,
      test: false,
    };
    const drawn = (missed) =>
      textOf(
        renderToStaticMarkup(
          createElement(SignupRequestsView, {
            answer: { requests: [{ ...request, missed }], decides: true },
            busyId: null,
            actionErr: null,
            denyFor: null,
            denyNote: "",
            onDenyNote() {},
            onApprove() {},
            onTurnDown() {},
            onConfirmTurnDown() {},
            onCancelTurnDown() {},
          }),
        ),
      );
    assert.ok(drawn(true).includes(`${MISSED} Admins only`));
    assert.ok(!drawn(false).includes("Didn’t come"));
    assert.equal(MISSED, "Didn’t come to the last 2 events they had a place at.");
  });
});

describe("the Events card's route: an admin's alone", () => {
  const ask = (as, uid = "priya") => call(personRoute.GET, { as, params: { uid } });

  test("signed out, and everybody but an admin, is refused before anything is read", async (t) => {
    clock(t, NOW);
    reset();
    assert.equal((await ask(null)).status, 401);
    for (const who of [INES, MO, PRIYA, IRIS, CAL, SUE]) {
      const res = await ask(who);
      assert.equal(res.status, 403, who.uid);
      assert.ok(!("events" in res.body), who.uid);
    }
    // Their own page included: nobody but an admin reads one person's events, the person too.
    assert.equal((await ask(PRIYA, "priya")).status, 403);
  });

  test("an admin is sent the view; an id with no account, or one that could not be an id, is not found", async (t) => {
    clock(t, NOW);
    reset();
    const res = await ask(ZACH);
    assert.equal(res.status, 200);
    assert.equal(res.body.missed, true);
    assert.equal(res.body.events.length, 9);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal((await ask(ZACH, "nobody-here")).status, 404);
    assert.equal((await ask(ZACH, "..")).status, 404);
  });

  test("the card: the line, the year's events and how the line is counted; or why there is nothing", () => {
    const view = {
      agreedAt: AGREED.toISOString(),
      missed: true,
      events: [
        { eventId: "ev-g", title: "Speaker evening", startAt: "2026-11-26T19:00:00.000Z", state: "place" },
        { eventId: "ev-c", title: "Film night", startAt: "2026-10-22T18:00:00.000Z", state: "missed" },
        { eventId: "ev-b", title: "Board games night", startAt: "2026-10-15T18:00:00.000Z", state: "came" },
      ],
    };
    const text = textOf(renderToStaticMarkup(createElement(MemberEventsView, { view })));
    assert.ok(text.startsWith(MISSED), text);
    for (const line of [
      "Speaker evening, Thu 26 Nov: has a place",
      "Film night, Thu 22 Oct: had a place, didn’t come",
      "Board games night, Thu 15 Oct: came",
      "Two in a row counts only events since they accepted the privacy policy on Thu 1 Oct, where check-in was used. It starts again each September.",
    ]) {
      assert.ok(text.includes(line), `the card no longer says: ${line}\n${text}`);
    }
    const quiet = textOf(renderToStaticMarkup(createElement(MemberEventsView, { view: { ...view, missed: false } })));
    assert.ok(!quiet.includes("Didn’t come"));
    assert.equal(
      textOf(renderToStaticMarkup(createElement(MemberEventsView, { view: { ...view, agreedAt: null, events: [] } }))),
      words.PERSON_EVENTS_WORDS.notAgreed,
    );
    assert.ok(
      textOf(renderToStaticMarkup(createElement(MemberEventsView, { view: { ...view, missed: false, events: [] } }))).startsWith(
        words.PERSON_EVENTS_WORDS.none,
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. The event page, "Can't make it", and the email's cancel page
// ---------------------------------------------------------------------------

const pageAs = async (as, id) => {
  globalThis[AUTH] = as ? { user: { uid: as.uid, email: as.email }, accountName: as.displayName, loading: false } : undefined;
  return render(eventPage, { as, params: { id } });
};

describe("the event page for somebody holding a place", () => {
  test("before it starts: 'You have a place', with 'Can't make it' in place of the form, and only on their own page", async (t) => {
    clock(t, NOW);
    reset();
    const mine = await pageAs(PRIYA, "ev-g");
    for (const words of [HELD.heading, HELD.lede, HELD.cantMakeIt, HELD.never]) assert.ok(mine.text.includes(words), words);
    assert.ok(!mine.text.includes("Request a place"), "a person holding a place is offered the form again");
    // Wren is on the waiting list there, Tom has no sign-up, and nobody is signed in: each sees the form.
    for (const who of [WREN, TOM, null]) {
      const page = await pageAs(who, "ev-g");
      assert.ok(page.text.includes("Request a place"), who?.uid ?? "signed out");
      assert.ok(!page.text.includes(HELD.cantMakeIt), who?.uid ?? "signed out");
      assert.ok(!page.html.includes("ev-g__priya"), `${who?.uid ?? "signed out"} was sent Priya's sign-up`);
    }
  });

  test("once it has started, they are told they have a place and offered nothing to give back", async (t) => {
    clock(t, new Date("2026-11-26T19:30:00Z"));
    reset();
    const page = await pageAs(PRIYA, "ev-g");
    assert.ok(page.text.includes(HELD.heading));
    assert.ok(page.text.includes(HELD.started));
    assert.ok(!page.text.includes(HELD.cantMakeIt));
  });

  test("'Can't make it' gives the place back through the cancel route and moves the waiting list up; nobody else is emailed", async (t) => {
    clock(t, NOW);
    const db = reset();
    const res = await call(cancelRoute.POST, { as: PRIYA, params: { id: "ev-g", rsvpId: "ev-g__priya" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(db.read("eventRsvps/ev-g__priya").status, "cancelled");
    assert.equal(db.read("eventRsvps/ev-g__wren").status, "confirmed", "the waiting list did not move up");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(
      globalThis[MAIL].map((mail) => `${mail.variant} ${mail.to}`),
      ["promoted wren@example.com"],
    );
    // A place given back never counts, so Speaker evening can never be one Priya missed.
    const view = await rules.eventsOfPerson(db, "priya", new Date("2026-11-27T12:00:00Z"));
    assert.equal(view.events.find((row) => row.eventId === "ev-g").state, "cancelled");
  });

  test("nobody gives anybody else's place back, and nothing is given back during a view-as session", async (t) => {
    clock(t, NOW);
    const db = reset();
    const before = JSON.stringify(db.read("eventRsvps/ev-g__priya"));
    const res = await call(cancelRoute.POST, { as: TOM, params: { id: "ev-g", rsvpId: "ev-g__priya" } });
    assert.equal(res.status, 403);
    w.world.viewingAs = true;
    const asThem = await call(cancelRoute.POST, { as: PRIYA, params: { id: "ev-g", rsvpId: "ev-g__priya" } });
    assert.equal(asThem.status, 403);
    assert.equal(JSON.stringify(db.read("eventRsvps/ev-g__priya")), before);
    assert.deepEqual(globalThis[MAIL], []);
  });

  test("the email's cancel page says it in the same words for a place, and as before for a request", async (t) => {
    clock(t, NOW);
    reset();
    const { signRsvpToken } = await load("lib/events/rsvpToken.ts");
    const open = (rsvpId, id, email) => render(cancelPage, { params: { id, rsvpId }, searchParams: { t: signRsvpToken(rsvpId, email) } });
    const place = await open("ev-g__priya", "ev-g", PRIYA.email);
    for (const words of ["Can’t make it to Speaker evening?", HELD.giveBack, HELD.keep, HELD.never]) {
      assert.ok(place.text.includes(words), `${words}\n${place.text}`);
    }
    const request = await open("ev-g__wren", "ev-g", WREN.email);
    assert.ok(request.text.includes("Cancel your RSVP for Speaker evening?"), request.text);
    assert.ok(request.text.includes("Yes, cancel my RSVP"));
    assert.ok(!request.text.includes(HELD.giveBack));
  });
});

// ---------------------------------------------------------------------------
// 5. The walk
// ---------------------------------------------------------------------------

const MODULE = join(SRC, "lib", "events", "missedEvents.ts");
const rel = (file) => relative(REPO_ROOT, file).split(sep).join("/");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
/** Every module specifier a file names: value and type imports, re-exports and dynamic imports. */
const SPECIFIERS = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

function importsOf(file) {
  return [...withoutComments(readFileSync(file, "utf8")).matchAll(SPECIFIERS)]
    .map(([, specifier]) => resolveImport(file, specifier, SRC))
    .filter(Boolean);
}

describe("the walk: an admin's alone, and no survey", () => {
  test("two files reach the module, and each is behind an admin check", () => {
    const reaching = [...walkSource(SRC)].filter((file) => file !== MODULE && importsOf(file).includes(MODULE)).map(rel).sort();
    assert.deepEqual(reaching, ["src/app/api/admin/members/[uid]/events/route.ts", "src/lib/events/requestCard.ts"]);

    // The requests' card: one call, in requestFacts, made only when the session is an admin's.
    const card = withoutComments(read("src/lib/events/requestCard.ts"));
    const calls = callsOf(MODULE.replace("missedEvents.ts", "requestCard.ts"), "missedEventsOf");
    assert.deepEqual(calls.map((found) => found.inFunction), ["requestFacts"]);
    assert.match(card, /viewer\.role === "admin" \? missedEventsOf\(db, uids, now\) : Promise\.resolve\(new Set<string>\(\)\),/);
    assert.match(card, /missed: viewer\.isAdmin && account !== null && facts\.missed\.has\(account\),/);
    // requestFacts is the requests route's alone, which hands it the session as the viewer.
    const askers = [...walkSource(SRC)].filter((file) => /\brequestFacts\(/.test(withoutComments(readFileSync(file, "utf8")))).map(rel).sort();
    assert.deepEqual(askers, ["src/app/api/events/[id]/signups/route.ts", "src/lib/events/requestCard.ts"]);
    assert.match(withoutComments(read("src/app/api/events/[id]/signups/route.ts")), /await requestFacts\(db, waiting, viewer, access, new Date\(\)\);/);

    // The Events card's route: everybody but an admin refused before the module is asked.
    const route = withoutComments(read("src/app/api/admin/members/[uid]/events/route.ts"));
    const refused = route.indexOf('if (viewer.role !== "admin") {');
    assert.ok(refused !== -1 && refused < route.indexOf("await eventsOfPerson(db, uid, new Date())"), "the route asks before it refuses");
    // The module itself is never in a browser.
    assert.match(read("src/lib/events/missedEvents.ts"), /^import "server-only";/);
  });

  /**
   * Every file that names the sign-ups collection, and what it writes to a
   * sign-up. The count trusts that nothing writes to a confirmed sign-up after
   * its event starts unless something about the place changed (the module's
   * header): a writer that runs after events start, a survey marking who it
   * reached, say, would quietly stop those events counting. So a file that
   * names the collection is listed here, both ways, and a writer says when it
   * writes and what that does to the count.
   */
  const NAMES_THE_SIGNUPS = {
    // Readers.
    "src/app/(app)/dashboard/homeData.ts": [null, "Home's card for an event somebody is invited to reads their own sign-up for it"],
    "src/app/(app)/events/manage/[id]/attendees/page.tsx": [null, "the Sign-ups page looks up the names of who signed up, for the whole list's viewers"],
    "src/app/(public)/events/[id]/rsvp/[rsvpId]/cancel/page.tsx": [null, "the email's cancel page reads the sign-up its link names"],
    "src/app/(public)/events/[id]/rsvp/[rsvpId]/change/page.tsx": [null, "the email's change page reads the sign-up its link names"],
    "src/app/api/events/[id]/broadcast/route.ts": [null, "reads who holds a place or waits for one, to email them an update"],
    "src/app/api/events/[id]/cancel/route.ts": [null, "reads who holds a place or waits for one, to tell them the event is off; it writes the event"],
    "src/app/api/events/[id]/check-ins/route.ts": [null, "reads the sign-up a tick on the door list names"],
    "src/features/events/fetchEvents.ts": [null, "the event page reads the person's own sign-up for that event"],
    "src/features/events/useEventRsvps.ts": [null, "the whole list, read in the browser by admins and SU-recognised committee"],
    "src/lib/events/checkInLoad.ts": [null, "the door list's sign-ups"],
    "src/lib/events/missedEvents.ts": [null, "one person's own sign-ups, for an admin"],
    "src/lib/events/requestCard.ts": [null, "the requests waiting for a decision"],
    "src/lib/events/selfCheckIn.ts": [null, "the sign-up a check-in link names, and the event's sign-ups for its check-in page"],
    "src/lib/surveys/events/audience.ts": [null, "who an event's survey reaches"],
    // Writers.
    "src/app/api/events/[id]/rsvp/route.ts": [
      "makes a sign-up, and stamps a duplicate notice on a live one",
      "a stamp after the start leaves that event uncounted for its person, the safe side",
    ],
    "src/app/api/events/[id]/rsvp/[rsvpId]/cancel/route.ts": [
      "gives a place back, and moves the first person on the waiting list up",
      "a place given back never counts, and a move up after the start is the write the count is built to see",
    ],
    "src/app/api/events/[id]/rsvp/[rsvpId]/approve/route.ts": ["decides a request", "a request is decided while it waits, and a place confirmed after the start does not count"],
    "src/app/api/events/[id]/rsvp/[rsvpId]/deny/route.ts": ["turns a request down", "a request turned down never counts"],
    "src/app/api/events/[id]/rsvp/[rsvpId]/request-change/route.ts": [
      "asks to change a sign-up's answers",
      "an ask after the start leaves that event uncounted for its person, the safe side",
    ],
    "src/app/api/events/[id]/rsvp/[rsvpId]/approve-change/route.ts": [
      "changes a sign-up's answers",
      "a change after the start leaves that event uncounted for its person, the safe side",
    ],
    "src/app/api/events/[id]/rsvp/[rsvpId]/deny-change/route.ts": [
      "turns down a change to a sign-up's answers",
      "a refusal after the start leaves that event uncounted for its person, the safe side",
    ],
    "src/app/api/events/[id]/test-rsvps/route.ts": ["makes and deletes test sign-ups", "a test sign-up never counts"],
    "src/app/api/events/[id]/delete/route.ts": ["deletes an event's sign-ups with the event", "a deleted event is no event to count"],
  };

  test("every file that names the sign-ups collection is listed, with what it writes and what that does to the count", () => {
    const found = [...walkSource(SRC)]
      .filter((file) => /["'`]eventRsvps["'`]/.test(withoutComments(readFileSync(file, "utf8"))))
      .map(rel)
      .sort();
    assert.deepEqual(
      found,
      Object.keys(NAMES_THE_SIGNUPS).sort(),
      "a file names the sign-ups collection and is not listed, or is listed and no longer names it. A writer that runs after an event starts stops it counting: say what it does here.",
    );
    for (const [file, [writes, why]] of Object.entries(NAMES_THE_SIGNUPS)) {
      assert.ok(typeof why === "string" && why.length > 20, `${file} has no reason`);
      assert.ok(writes === null || writes.length > 10, `${file} says it writes, and not what`);
    }
  });

  test("the module reaches no survey code, however far its imports go", () => {
    const seen = new Set([MODULE]);
    const queue = [MODULE];
    while (queue.length > 0) {
      const file = queue.shift();
      for (const next of importsOf(file)) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    const reached = [...seen].map(rel);
    // Not vacuous: the walk reaches the check-in rules and the policy's own moment.
    for (const expected of ["src/lib/events/checkIns.ts", "src/lib/legal/reviewUse.ts", "src/lib/firestore/eventCheckIns.ts"]) {
      assert.ok(reached.includes(expected), `the walk no longer reaches ${expected}`);
    }
    const survey = reached.filter((file) => /^src\/(?:lib|features)\/surveys\/|^src\/lib\/firestore\/surveys\.ts$/.test(file));
    assert.deepEqual(survey, [], "nothing said in a survey may affect a place: the missed-events module reaches survey code");
  });
});
