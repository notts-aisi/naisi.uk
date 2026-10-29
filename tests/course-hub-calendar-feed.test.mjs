/**
 * What a person's calendar link holds (board st-calendar-phone): the feed
 * `GET /api/courses/calendar/[token]/sessions.ics`, fetched as a calendar app
 * fetches it, and read as strictly as RFC 5545 asks.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHOSE SESSIONS: a member Publish has told about their group gets every
 *     session of it, dated as the site dates it (the overview route's own
 *     schedule is the yardstick); somebody placed and not told gets nothing of
 *     that run; somebody who left keeps nothing after the day they left; a
 *     facilitator gets each group they facilitate; somebody on two programmes
 *     gets both, each under its own programme's name.
 *  2. ONE ANSWER for every link that opens nothing: never made, malformed,
 *     replaced, deleted, an account that does not stand, a live link with
 *     nothing in it. Same status, same headers, same bytes.
 *  3. CHANGES LAND: a moved week keeps its UID and moves, with a higher
 *     SEQUENCE; a cancelled one stays, marked CANCELLED; put back, it is
 *     CONFIRMED again; a week pushed back moves every later week; an online
 *     week says "Join on naisi.uk" with the programme page; a clock-change
 *     week is at its own London hour; after the end nothing new appears.
 *  4. NEVER CARRIED: the meeting link (set on every group, and per week), an
 *     email address, a person's name, another group's sessions.
 *  5. THE ROUTE: writes nothing, answers our own failure with a 503 the same
 *     for every token, and logs no token.
 *
 * Real: the feed and link routes, the session resolver, the hand-over world's
 * store. Faked: what the world fakes (the session, the Admin SDK handle, the
 * clock). See `tests/lib/calendarWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  A,
  B,
  B_TOUCHED,
  C,
  CALL,
  D,
  NOW,
  RUN,
  SITE,
  TAIS_GROUP,
  calendarSeed,
  enrolment,
  makeCalendarWorld,
  readCalendar,
  taisSeat,
  uidOf,
  utc,
} from "./lib/calendarWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeCalendarWorld("__calendarFeed");
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

/** A group's stored document, changed in place. */
function changeGroup(groupId, change) {
  const path = `courseGroups/${groupId}`;
  w.world.db.seed(path, { ...w.world.db.read(path), ...change });
}

/** A document put there whole. */
const put = (path, data) => w.world.db.seed(path, data);

/** Group B's six Tuesdays, 6pm to 8pm (GMT), as instants. */
const B_TUESDAYS = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"];

/** The programme page an online week points at. */
const PAGE = `${SITE}/learn/${encodeURIComponent(RUN.agi)}`;

/** The answer to a link that never was, the yardstick for every link that opens nothing. */
async function nobodysAnswer() {
  return w.fetchFeed("A".repeat(43));
}

// ---------------------------------------------------------------------------
// 1. Whose sessions
// ---------------------------------------------------------------------------

describe("1. whose sessions the calendar holds", () => {
  test("a member told about their group: every session of it, as the site dates it", async () => {
    const { fetched, calendar, events } = await w.calendarOf("chloe");
    assert.equal(fetched.status, 200);
    assert.deepEqual(calendar, {
      VERSION: "2.0",
      PRODID: "-//NAISI//Sessions//EN",
      CALSCALE: "GREGORIAN",
      METHOD: "PUBLISH",
      NAME: "NAISI sessions",
      "X-WR-CALNAME": "NAISI sessions",
      "REFRESH-INTERVAL": "PT1H",
      "X-PUBLISHED-TTL": "PT1H",
    });
    assert.equal(events.length, 6);
    events.forEach((event, i) => {
      const day = B_TUESDAYS[i];
      assert.deepEqual(
        event,
        {
          UID: uidOf(RUN.agi, B, `w0${i + 1}`),
          DTSTAMP: utc(NOW.toISOString()),
          SEQUENCE: String(Math.floor((B_TOUCHED.getTime() - Date.UTC(2020, 0, 1)) / 1000)),
          DTSTART: utc(`${day}T18:00:00Z`),
          DTEND: utc(`${day}T20:00:00Z`),
          SUMMARY: "AGI Strategy · Group B",
          "LAST-MODIFIED": utc(B_TOUCHED.toISOString()),
          LOCATION: "Hallward B12",
          URL: PAGE,
          STATUS: "CONFIRMED",
        },
        `week ${i + 1}`,
      );
    });
    // The site's own dates for the same weeks: the overview's schedule.
    const overview = (await w.overview("chloe")).body;
    for (const week of overview.weekSchedule) {
      const event = events.find((e) => e.UID === uidOf(RUN.agi, B, `w0${week.weekNumber}`));
      assert.equal(event.DTSTART.slice(0, 8), week.dateKey.replace(/-/g, ""), `week ${week.weekNumber}'s day`);
      assert.equal(event.LOCATION, week.location, `week ${week.weekNumber}'s room`);
    }
  });

  test("somebody placed and not told sees nothing of that run", async () => {
    // Una is in Group C and Publish has not told her: no link is made for
    // nothing, and a link of hers answers as one that never was.
    assert.equal((await w.ask("una", { action: "open" })).status, 404);
    put("calendarLinks/una", { uid: "una", token: "U".repeat(43), createdAt: NOW });
    assert.deepEqual(await w.fetchFeed("U".repeat(43)), await nobodysAnswer());
  });

  test("somebody who left keeps the sessions before the day they left, and none after", async () => {
    // Sam left on Fri 6 Nov, after Group A's Thursdays of 29 Oct and 5 Nov.
    put("calendarLinks/sam", { uid: "sam", token: "S".repeat(43), createdAt: NOW });
    const { events } = readCalendar((await w.fetchFeed("S".repeat(43))).body);
    assert.deepEqual(
      events.map((e) => [e.DTSTART, e.SUMMARY]),
      [
        [utc("2026-10-29T18:00:00Z"), "AGI Strategy · Group A"],
        [utc("2026-11-05T18:00:00Z"), "AGI Strategy · Group A"],
      ],
    );
  });

  test("somebody staff took off keeps the sessions before that day, and with no day recorded, none", async () => {
    put(`courseEnrolments/${RUN.agi}__farah`, enrolment("farah", B, { status: "removed", droppedOutAt: new Date("2026-11-11T09:00:00Z") }));
    put("calendarLinks/farah", { uid: "farah", token: "F".repeat(43), createdAt: NOW });
    const { events } = readCalendar((await w.fetchFeed("F".repeat(43))).body);
    assert.deepEqual(events.map((e) => e.DTSTART), [utc("2026-11-03T18:00:00Z"), utc("2026-11-10T18:00:00Z")]);

    put(`courseEnrolments/${RUN.agi}__farah`, enrolment("farah", B, { status: "withdrawn", droppedOutAt: null }));
    assert.deepEqual(await w.fetchFeed("F".repeat(43)), await nobodysAnswer());
  });

  test("a facilitator gets every session of each group they facilitate", async () => {
    const rahul = await w.calendarOf("rahul");
    assert.deepEqual(rahul.events.map((e) => e.DTSTART), B_TUESDAYS.map((day) => utc(`${day}T18:00:00Z`)));
    assert.ok(rahul.events.every((e) => e.SUMMARY === "AGI Strategy · Group B"));

    const sofia = await w.calendarOf("sofia");
    assert.equal(sofia.events.length, 12);
    assert.equal(sofia.events.filter((e) => e.SUMMARY === "AGI Strategy · Group A").length, 6);
    assert.equal(sofia.events.filter((e) => e.SUMMARY === "AGI Strategy · Group B").length, 6);
    // In start order: Group A's Thursday comes first.
    assert.deepEqual(sofia.events.slice(0, 2).map((e) => e.DTSTART), [utc("2026-10-29T18:00:00Z"), utc("2026-11-03T18:00:00Z")]);
  });

  test("somebody on two programmes gets both, each under its own programme's name", async () => {
    put(`courseEnrolments/${RUN.tais}__chloe`, taisSeat("chloe"));
    const { events } = await w.calendarOf("chloe");
    assert.equal(events.length, 12);
    const tais = events.filter((e) => e.SUMMARY === "Technical AI Safety · Group T");
    assert.equal(tais.length, 6);
    assert.equal(tais[0].DTSTART, utc("2026-11-02T17:00:00Z"));
    assert.equal(tais[0].LOCATION, "Room T1");
    assert.equal(tais[0].URL, `${SITE}/learn/${encodeURIComponent(RUN.tais)}`);
    assert.equal(tais[0].UID, uidOf(RUN.tais, TAIS_GROUP, "w01"));
  });

  test("a member who joined in week 3 gets their sessions from week 3", async () => {
    put(`courseEnrolments/${RUN.agi}__kofi`, enrolment("kofi", B, { joinedWeekNumber: 3 }));
    const { events } = await w.calendarOf("kofi");
    assert.deepEqual(events.map((e) => e.DTSTART), B_TUESDAYS.slice(2).map((day) => utc(`${day}T18:00:00Z`)));
  });

  test("an account that no longer stands opens nothing, whatever its link", async () => {
    const { token } = await w.linkOf("chloe");
    assert.equal(readCalendar((await w.fetchFeed(token)).body).events.length, 6);
    w.world.db.poke("users/chloe", { role: "rejected" });
    assert.deepEqual(await w.fetchFeed(token), await nobodysAnswer());
    w.world.db.poke("users/chloe", { role: "pending" });
    assert.deepEqual(await w.fetchFeed(token), await nobodysAnswer());
  });

  test("the route asks first: an account that does not stand has none of its seats read", async () => {
    const { token } = await w.linkOf("chloe");
    w.world.db.poke("users/chloe", { role: "rejected" });
    const reads = w.world.db.stats.reads;
    await w.fetchFeed(token);
    // The token's one equality and the account: nothing of a seat or a group.
    assert.equal(w.world.db.stats.reads - reads, 2);
  });

  test("the feed asks too: read for an account that does not stand, it holds nothing", async () => {
    const owner = (role) => ({
      uid: "chloe",
      email: null,
      role,
      suRecognised: false,
      permissions: {},
    });
    const standing = await w.cal.feed.readCalendarFeed(w.world.courseDb, owner("member"));
    assert.equal(standing.events.length, 6);
    for (const role of ["rejected", "pending"]) {
      assert.deepEqual(await w.cal.feed.readCalendarFeed(w.world.courseDb, owner(role)), { events: [], groups: [] }, role);
    }
    // A facilitator's groups ask it of their own array.
    const rahul = { ...owner("rejected"), uid: "rahul" };
    assert.deepEqual(await w.cal.feed.readCalendarFeed(w.world.courseDb, rahul), { events: [], groups: [] });
  });

  test("a draft or cancelled run, a run being destroyed, and an archived group add nothing", async () => {
    const { token } = await w.linkOf("chloe");
    const run = w.world.db.read(`courseRuns/${RUN.agi}`);
    for (const change of [{ status: "draft" }, { status: "cancelled" }, { destroying: true }]) {
      put(`courseRuns/${RUN.agi}`, { ...run, ...change });
      assert.deepEqual(await w.fetchFeed(token), await nobodysAnswer(), JSON.stringify(change));
    }
    put(`courseRuns/${RUN.agi}`, { ...run, status: "completed", archived: true });
    assert.equal(readCalendar((await w.fetchFeed(token)).body).events.length, 6, "a finished run is history, and stays");
    changeGroup(B, { archived: true });
    assert.deepEqual(await w.fetchFeed(token), await nobodysAnswer());
  });
});

// ---------------------------------------------------------------------------
// 2. One answer for every link that opens nothing
// ---------------------------------------------------------------------------

describe("2. one answer for every link that opens nothing", () => {
  test("never made, malformed, replaced, deleted, and a live link with nothing in it: the same bytes", async () => {
    const yardstick = await nobodysAnswer();
    assert.equal(yardstick.status, 200);
    const empty = readCalendar(yardstick.body);
    assert.deepEqual(empty.events, [], "the answer is a calendar with nothing in it");
    assert.equal(empty.calendar.NAME, "NAISI sessions");

    // Malformed: wrong length, wrong characters, a path's worth of dots.
    for (const token of ["", "x", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}=`, `${"A".repeat(42)}/`, "../../users", "A".repeat(42) + "é"]) {
      assert.deepEqual(await w.fetchFeed(token), yardstick, JSON.stringify(token));
    }

    // Replaced: the old token answers as one that never was.
    const first = (await w.linkOf("chloe")).token;
    const second = w.tokenOf((await w.ask("chloe", { action: "replace" })).body.url);
    assert.notEqual(first, second);
    assert.deepEqual(await w.fetchFeed(first), yardstick);
    assert.equal(readCalendar((await w.fetchFeed(second)).body).events.length, 6);

    // Deleted with the account.
    assert.equal(await w.cal.link.deleteCalendarLink(w.world.courseDb, "chloe"), true);
    assert.deepEqual(await w.fetchFeed(second), yardstick);

    // A live link with nothing in it (Nell is on nothing).
    put("calendarLinks/nobody", { uid: "nobody", token: "N".repeat(43), createdAt: NOW });
    assert.deepEqual(await w.fetchFeed("N".repeat(43)), yardstick);

    // A link whose account is gone, and one stored somewhere that is not its owner's own document.
    put("calendarLinks/ghost", { uid: "ghost", token: "G".repeat(43), createdAt: NOW });
    assert.deepEqual(await w.fetchFeed("G".repeat(43)), yardstick);
    put("calendarLinks/someone-else", { uid: "farah", token: "E".repeat(43), createdAt: NOW });
    assert.deepEqual(await w.fetchFeed("E".repeat(43)), yardstick);
  });

  test("two documents claiming one token open nothing", async () => {
    put("calendarLinks/farah", { uid: "farah", token: "T".repeat(43), createdAt: NOW });
    put("calendarLinks/kofi", { uid: "kofi", token: "T".repeat(43), createdAt: NOW });
    assert.deepEqual(await w.fetchFeed("T".repeat(43)), await nobodysAnswer());
  });

  test("the headers suit a calendar that polls, the same on every answer", async () => {
    const live = (await w.calendarOf("chloe")).fetched;
    const empty = await nobodysAnswer();
    for (const answer of [live, empty]) {
      assert.deepEqual(answer.headers, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="naisi-sessions.ics"',
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Changes land
// ---------------------------------------------------------------------------

describe("3. a change lands on the calendar's next fetch", () => {
  const LATER = new Date("2026-11-19T09:00:00Z");

  test("a week moved: the same UID at its new day, time and room, with a higher SEQUENCE", async () => {
    const before = await w.calendarOf("chloe");
    changeGroup(B, {
      sessionOverrides: { w04: { weekday: 3, startTimeLocal: "19:00", location: "Room C21" } },
      sessionChanges: { w04: { kind: "moved", reason: "The room is taken.", dateKey: "2026-11-24", byUid: "rahul", at: LATER } },
      updatedAt: LATER,
    });
    const after = readCalendar((await w.fetchFeed(before.token)).body);
    const was = before.events[3];
    const now = after.events.find((e) => e.UID === was.UID);
    assert.equal(now.DTSTART, utc("2026-11-25T19:00:00Z"));
    assert.equal(now.DTEND, utc("2026-11-25T21:00:00Z"));
    assert.equal(now.LOCATION, "Room C21");
    assert.ok(Number(now.SEQUENCE) > Number(was.SEQUENCE), "the move did not raise SEQUENCE");
    assert.equal(now["LAST-MODIFIED"], utc(LATER.toISOString()));
    assert.equal(after.events.length, 6);
  });

  test("a week cancelled stays, marked CANCELLED; put back, it is CONFIRMED again", async () => {
    const before = await w.calendarOf("chloe");
    changeGroup(B, {
      sessionChanges: { w04: { kind: "cancelled", reason: "Rahul and Sofia are both away.", dateKey: "2026-11-24", byUid: "rahul", at: LATER } },
      updatedAt: LATER,
    });
    const after = readCalendar((await w.fetchFeed(before.token)).body);
    const off = after.events.find((e) => e.UID === uidOf(RUN.agi, B, "w04"));
    assert.equal(off.STATUS, "CANCELLED");
    assert.equal(off.SUMMARY, "Cancelled · AGI Strategy · Group B");
    assert.equal(off.DTSTART, utc("2026-11-24T18:00:00Z"));
    assert.equal(off.DESCRIPTION, undefined);
    assert.ok(!JSON.stringify(after).includes("both away"), "the reason the group was given is not in the calendar");
    assert.equal(after.events.filter((e) => e.STATUS === "CONFIRMED").length, 5);

    changeGroup(B, { sessionChanges: {}, updatedAt: new Date("2026-11-20T09:00:00Z") });
    const back = readCalendar((await w.fetchFeed(before.token)).body).events.find((e) => e.UID === off.UID);
    assert.equal(back.STATUS, "CONFIRMED");
    assert.equal(back.SUMMARY, "AGI Strategy · Group B");
    assert.ok(Number(back.SEQUENCE) > Number(off.SEQUENCE));
  });

  test("a week pushed back: its evening goes, and it and every week after move a week", async () => {
    const before = await w.calendarOf("chloe");
    const plan = [
      { kind: "week", weekNumber: 1, weekId: "w01" },
      { kind: "week", weekNumber: 2, weekId: "w02" },
      { kind: "week", weekNumber: 3, weekId: "w03" },
      { kind: "break", label: "No session" },
      { kind: "week", weekNumber: 4, weekId: "w04" },
      { kind: "week", weekNumber: 5, weekId: "w05" },
      { kind: "week", weekNumber: 6, weekId: "w06" },
    ];
    changeGroup(B, {
      paceStartDate: "2026-10-29",
      paceWeekPlan: plan,
      sessionChanges: { w04: { kind: "pushed", reason: "Rahul and Sofia are both away.", dateKey: "2026-11-24", byUid: "rahul", at: LATER } },
      updatedAt: LATER,
    });
    const after = readCalendar((await w.fetchFeed(before.token)).body);
    assert.deepEqual(
      after.events.map((e) => [e.UID, e.DTSTART, e.STATUS]),
      [
        [uidOf(RUN.agi, B, "w01"), utc("2026-11-03T18:00:00Z"), "CONFIRMED"],
        [uidOf(RUN.agi, B, "w02"), utc("2026-11-10T18:00:00Z"), "CONFIRMED"],
        [uidOf(RUN.agi, B, "w03"), utc("2026-11-17T18:00:00Z"), "CONFIRMED"],
        [uidOf(RUN.agi, B, "w04"), utc("2026-12-01T18:00:00Z"), "CONFIRMED"],
        [uidOf(RUN.agi, B, "w05"), utc("2026-12-08T18:00:00Z"), "CONFIRMED"],
        [uidOf(RUN.agi, B, "w06"), utc("2026-12-15T18:00:00Z"), "CONFIRMED"],
      ],
    );
    assert.ok(!after.events.some((e) => e.DTSTART === utc("2026-11-24T18:00:00Z")), "the lost evening is still there");
  });

  test("an online week says Join on naisi.uk with the programme page, and never the link", async () => {
    changeGroup(B, { sessionModes: { w05: "virtual" }, sessionOverrides: { w05: { meetingUrl: "https://meet.example.com/week-5-only" } } });
    const { events, fetched } = await w.calendarOf("chloe");
    const online = events.find((e) => e.UID === uidOf(RUN.agi, B, "w05"));
    assert.equal(online.LOCATION, "Join on naisi.uk");
    assert.equal(online.DESCRIPTION, `Join on naisi.uk: ${PAGE}`);
    assert.equal(online.URL, PAGE);
    // The other weeks meet in their room, with nothing about joining.
    for (const event of events.filter((e) => e !== online)) {
      assert.equal(event.LOCATION, "Hallward B12");
      assert.equal(event.DESCRIPTION, undefined);
    }
    assert.ok(!fetched.body.includes("meet.example.com"), "a link to the call is in the calendar");
  });

  test("a week held in person says only its room; a group with a link and no week set is joined online with its room, as its ticket says", async () => {
    w.reset(calendarSeed({ calls: true }));
    changeGroup(B, { sessionModes: { w05: "in-person" } });
    const { events, token } = await w.calendarOf("chloe");
    // Nothing is set for weeks 1 to 4 and 6, and Group B has a link: the
    // ticket shows its room and Join online, and so does the calendar.
    const usual = events.find((e) => e.UID === uidOf(RUN.agi, B, "w01"));
    assert.equal(usual.LOCATION, "Hallward B12");
    assert.equal(usual.DESCRIPTION, `Join on naisi.uk: ${PAGE}`);
    const inPerson = events.find((e) => e.UID === uidOf(RUN.agi, B, "w05"));
    assert.equal(inPerson.LOCATION, "Hallward B12");
    assert.equal(inPerson.DESCRIPTION, undefined);
    // With no link at all, nothing is said about joining.
    changeGroup(B, { session: { ...w.world.db.read(`courseGroups/${B}`).session, meetingUrl: null } });
    const plain = readCalendar((await w.fetchFeed(token)).body).events;
    assert.ok(plain.every((e) => e.DESCRIPTION === undefined && e.LOCATION === "Hallward B12"));
  });

  test("a group with no room yet is where its campus is; an online week still says Join on naisi.uk; a room wins", async () => {
    // Zach, 29 Oct 2026: rooms are released separately, so a group may have
    // a campus and no room for a while.
    const slot = w.world.db.read(`courseGroups/${B}`).session;
    changeGroup(B, { campus: "jubilee", session: { ...slot, location: "" }, sessionModes: { w05: "virtual" } });
    const { events, token } = await w.calendarOf("chloe");
    const online = events.find((e) => e.UID === uidOf(RUN.agi, B, "w05"));
    assert.equal(online.LOCATION, "Join on naisi.uk");
    for (const event of events.filter((e) => e !== online)) assert.equal(event.LOCATION, "Jubilee", event.UID);
    // A group meeting online with no link yet is where its campus says.
    changeGroup(B, { campus: "online", sessionModes: {} });
    assert.ok(readCalendar((await w.fetchFeed(token)).body).events.every((e) => e.LOCATION === "Online"));
    // No campus and no room: nothing, as before campuses.
    changeGroup(B, { campus: null });
    assert.ok(readCalendar((await w.fetchFeed(token)).body).events.every((e) => e.LOCATION === undefined));
    // A room, with a campus: the room.
    changeGroup(B, { campus: "jubilee", session: slot });
    assert.ok(readCalendar((await w.fetchFeed(token)).body).events.every((e) => e.LOCATION === "Hallward B12"));
  });

  test("the week the clocks go back: each session at its own London hour", async () => {
    const run = w.world.db.read(`courseRuns/${RUN.agi}`);
    put(`courseRuns/${RUN.agi}`, { ...run, startDate: "2026-10-15" });
    const { events } = await w.calendarOf("chloe");
    // Tue 20 Oct is British Summer Time, Tue 27 Oct is not (the clocks went back on Sun 25 Oct).
    assert.deepEqual(events.slice(0, 2).map((e) => [e.DTSTART, e.DTEND]), [
      [utc("2026-10-20T17:00:00Z"), utc("2026-10-20T19:00:00Z")],
      [utc("2026-10-27T18:00:00Z"), utc("2026-10-27T20:00:00Z")],
    ]);
  });

  test("after the run's end: the same sessions, nothing new, and only the stamp of the fetch moves", async () => {
    const { token, fetched } = await w.calendarOf("chloe");
    at("2026-12-20T12:00:00Z");
    const later = await w.fetchFeed(token);
    const stamp = (body) => body.replace(/DTSTAMP:\d{8}T\d{6}Z/g, "DTSTAMP:X");
    assert.equal(stamp(later.body), stamp(fetched.body));
    assert.match(later.body, /DTSTAMP:20261220T120000Z/);
  });
});

// ---------------------------------------------------------------------------
// 4. Never carried
// ---------------------------------------------------------------------------

describe("4. what the calendar never carries", () => {
  test("no meeting link, from any group or any week", async () => {
    w.reset(calendarSeed({ calls: true }));
    for (const id of [A, B, C, D]) {
      changeGroup(id, { sessionOverrides: { w02: { meetingUrl: `${CALL[id]}/week-two` } }, sessionModes: { w03: "virtual" } });
    }
    put(`courseEnrolments/${RUN.tais}__chloe`, taisSeat("chloe"));
    for (const who of ["chloe", "sofia", "rahul", "grace"]) {
      const { fetched } = await w.calendarOf(who);
      assert.doesNotMatch(fetched.body, /meet\.example\.com|-call/, `${who}'s calendar carries a link to a call`);
    }
  });

  test("no email address, no person's name, no uid", async () => {
    w.reset(calendarSeed({ calls: true }));
    const { fetched } = await w.calendarOf("chloe");
    const unfolded = fetched.body.replace(/\r\n[ \t]/g, "");
    // The only @ is the UID's own domain.
    for (const line of unfolded.split("\r\n").filter((l) => l.includes("@"))) {
      assert.match(line, /^UID:[0-9a-f]{32}@naisi\.uk$/, line);
    }
    assert.doesNotMatch(unfolded, /example\.com|students\./);
    assert.doesNotMatch(unfolded, /Chloe|Rahul|Sofia|Farah|Kofi|Nguyen|Mehta|Rossi/);
    assert.doesNotMatch(unfolded, /\bchloe\b|\brahul\b|\bsofia\b/);
  });

  test("no other group's sessions", async () => {
    const { fetched } = await w.calendarOf("chloe");
    assert.doesNotMatch(fetched.body, /Group A|Group C|Group D|Portland A13|Room B8|Room D4|Thursday|Wednesday/);
    for (const other of [A, C, D]) {
      for (let n = 1; n <= 6; n += 1) assert.ok(!fetched.body.includes(uidOf(RUN.agi, other, `w0${n}`)));
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The route itself
// ---------------------------------------------------------------------------

describe("5. the feed route", () => {
  test("it writes nothing, for a live link or a dead one", async () => {
    const { token } = await w.linkOf("chloe");
    const before = w.everything();
    await w.fetchFeed(token);
    await w.fetchFeed("Z".repeat(43));
    await w.fetchFeed("../../users");
    assert.equal(w.everything(), before);
  });

  test("our own failure is a 503, the same for every token, and no log line carries the token", async (t) => {
    const { token } = await w.linkOf("chloe");
    const logged = [];
    for (const method of ["error", "warn", "log", "info"]) {
      t.mock.method(console, method, (...args) => logged.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg))).join(" ")));
    }
    const collection = w.world.courseDb.collection;
    w.world.courseDb.collection = () => {
      throw Object.assign(new Error(`database unavailable while reading ${token}`), { code: "unavailable" });
    };
    try {
      const failed = await w.fetchFeed(token);
      const unknown = await w.fetchFeed("Q".repeat(43));
      assert.equal(failed.status, 503);
      assert.deepEqual(failed, unknown, "a failure tells one token from another");
      assert.equal(failed.headers["Retry-After"], "600");
      assert.equal(failed.headers["Cache-Control"], "no-store");
    } finally {
      w.world.courseDb.collection = collection;
    }
    assert.ok(logged.length >= 1, "the failure was not logged at all");
    for (const line of logged) {
      assert.ok(!line.includes(token), `a log line carries the token: ${line}`);
      assert.ok(!line.includes("Q".repeat(43)), `a log line carries the token: ${line}`);
      assert.ok(!line.includes("sessions.ics"), `a log line carries the link: ${line}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The builder the feed and the event download share
// ---------------------------------------------------------------------------

describe("6. the calendar builder", () => {
  const START = new Date("2026-11-03T18:00:00Z");

  test("a long line folds at 75 octets, never inside a character, and unfolds to itself", () => {
    const title = `${"AGI Strategy · Group B · ".repeat(6)}the room’s café`;
    const file = w.cal.ics.buildCalendarIcs({
      name: "NAISI sessions",
      refreshMinutes: 60,
      events: [{ uid: "u1", title, startAt: START, location: "Hallward B12 ".repeat(9).trim() }],
    });
    const physical = file.slice(0, -2).split("\r\n");
    const encoder = new TextEncoder();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let folded = 0;
    for (const line of physical) {
      const bytes = encoder.encode(line);
      assert.ok(bytes.length <= 75, `a line of ${bytes.length} octets`);
      // Each physical line is whole UTF-8 on its own: no character was cut.
      assert.doesNotThrow(() => decoder.decode(bytes));
      if (line.startsWith(" ")) folded += 1;
    }
    assert.ok(folded >= 3, "nothing was folded");
    const { events } = readCalendar(file);
    assert.equal(events[0].SUMMARY, title);
    assert.equal(events[0].LOCATION, "Hallward B12 ".repeat(9).trim());
  });

  test("the event download is the file it was for a short event, folded only where a line is long", () => {
    const short = w.cal.ics.buildEventIcs({ uid: "abc123", title: "NAISI intro", startAt: START, location: "Portland A40" });
    assert.ok(short.split("\r\n").every((line) => !line.startsWith(" ")));
    assert.equal(readCalendar(short).events[0].SUMMARY, "NAISI intro");
    assert.equal(readCalendar(short).calendar.PRODID, "-//NAISI//Events//EN");
    const long = w.cal.ics.buildEventIcs({ uid: "abc123", title: "x".repeat(200), startAt: START });
    assert.equal(readCalendar(long).events[0].SUMMARY, "x".repeat(200));
  });

  test("a calendar with nothing in it is still a calendar: its name, and how often to fetch it", () => {
    const empty = w.cal.ics.buildCalendarIcs({ name: "NAISI sessions", refreshMinutes: 90, events: [] });
    assert.deepEqual(readCalendar(empty), {
      calendar: {
        VERSION: "2.0",
        PRODID: "-//NAISI//Sessions//EN",
        CALSCALE: "GREGORIAN",
        METHOD: "PUBLISH",
        NAME: "NAISI sessions",
        "X-WR-CALNAME": "NAISI sessions",
        "REFRESH-INTERVAL": "PT90M",
        "X-PUBLISHED-TTL": "PT90M",
      },
      calendarParams: readCalendar(empty).calendarParams,
      events: [],
    });
    assert.match(empty, /\r\nREFRESH-INTERVAL;VALUE=DURATION:PT90M\r\n/);
  });

  test("STATUS says on or off when an event says, and nothing when it does not", () => {
    const file = w.cal.ics.buildCalendarIcs({
      name: "N",
      refreshMinutes: 60,
      events: [
        { uid: "a", title: "On", startAt: START, status: "confirmed" },
        { uid: "b", title: "Off", startAt: START, status: "cancelled" },
        { uid: "c", title: "Unsaid", startAt: START },
      ],
    });
    assert.deepEqual(readCalendar(file).events.map((e) => e.STATUS), ["CONFIRMED", "CANCELLED", undefined]);
  });

  test("the subscribe addresses take only a web address, and keep it whole", () => {
    const { webcalUrl, googleSubscribeUrl, outlookSubscribeUrl } = w.cal.ics;
    const feed = "https://naisi.uk/api/courses/calendar/abc_DEF-123/sessions.ics";
    assert.equal(webcalUrl(feed), "webcal://naisi.uk/api/courses/calendar/abc_DEF-123/sessions.ics");
    assert.equal(webcalUrl("http://127.0.0.1:3330/x.ics"), "webcal://127.0.0.1:3330/x.ics");
    for (const notOne of ["", "javascript:alert(1)", "ftp://naisi.uk/x", "webcal://naisi.uk/x"]) {
      assert.equal(webcalUrl(notOne), "", notOne);
      assert.equal(googleSubscribeUrl(notOne), "", notOne);
      assert.equal(outlookSubscribeUrl(notOne, "N"), "", notOne);
    }
    assert.equal(new URL(googleSubscribeUrl(feed)).searchParams.get("cid"), webcalUrl(feed));
    assert.equal(new URL(outlookSubscribeUrl(feed, "NAISI sessions")).searchParams.get("name"), "NAISI sessions");
  });
});
