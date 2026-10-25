/**
 * A person's calendar link (board st-calendar-phone): the link route
 * (`POST /api/courses/calendar`), the record it keeps, its deletion with the
 * account, the dialog's words and the "Add to calendar" button on the session
 * ticket.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE LINK: made once and the same on every ask after; a random secret
 *     of 43 characters kept at the person's own uid; replaced, the old one
 *     opens nothing and the new one opens the same calendar; deleted with the
 *     account.
 *  2. EVERY CALLER: view-as is refused before anything; signed out is 401;
 *     the body is checked before anything is read; an account that does not
 *     stand is refused; somebody with no group Publish has told them about is
 *     told so and nothing is made; a facilitator gets theirs.
 *  3. WHERE THE BUTTONS GO: Apple subscribes to the `webcal:` address, Google
 *     and Outlook to their own "add from a link", Copy the link copies the
 *     link itself; nothing else is in the answer.
 *  4. THE DIALOG'S WORDS: the board's, word for word, with the line counting
 *     the sessions from records (the boards' Group B is "6 sessions on
 *     Tuesdays at 6pm, from Tue 3 Nov"), and the words of the states it does
 *     not draw.
 *  5. THE BUTTON: on the programme page's ticket and Home's card for
 *     somebody whose group it is, once, disabled until the page hydrates;
 *     never where there is no ticket, and an online week's ticket carries Join
 *     online in its place.
 *
 * Real: the link and feed routes, the pages, the components. Faked: what the
 * world fakes. See `tests/lib/calendarWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  B,
  NOW,
  RUN,
  SITE,
  calendarSeed,
  enrolment,
  makeCalendarWorld,
  readCalendar,
  taisSeat,
} from "./lib/calendarWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeCalendarWorld("__calendarLink");
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

const BOARD_LINE = "6 sessions on Tuesdays at 6pm, from Tue 3 Nov. If a time or room changes, your calendar changes too.";
const BOARD_NOTE =
  "The link is yours: anyone with it can see your group’s times and room. Online weeks say “Join on naisi.uk”, never the meeting link.";

/** The links stored, by uid. */
function storedLinks() {
  return Object.fromEntries(
    w.world.db
      .paths()
      .filter((path) => path.startsWith("calendarLinks/"))
      .map((path) => [path.slice("calendarLinks/".length), w.world.db.read(path)]),
  );
}

/** A group's stored document, changed in place. */
function changeGroup(groupId, change) {
  const path = `courseGroups/${groupId}`;
  w.world.db.seed(path, { ...w.world.db.read(path), ...change });
}

// ---------------------------------------------------------------------------
// 1. The link
// ---------------------------------------------------------------------------

describe("1. the link", () => {
  test("made the first time it is asked for, and the same on every ask after", async () => {
    assert.deepEqual(storedLinks(), {});
    const first = await w.ask("chloe", { action: "open" });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const token = w.tokenOf(first.body.url);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(storedLinks(), { chloe: { uid: "chloe", token, createdAt: NOW } });

    at("2026-11-18T09:00:00Z");
    const again = await w.ask("chloe", { action: "open" });
    assert.deepEqual(again, first, "a second ask is not the first answer");
    assert.deepEqual(storedLinks(), { chloe: { uid: "chloe", token, createdAt: NOW } }, "the link was made again");
  });

  test("two people's links are two secrets", async () => {
    const chloe = (await w.linkOf("chloe")).token;
    const farah = (await w.linkOf("farah")).token;
    assert.notEqual(chloe, farah);
    assert.deepEqual(Object.keys(storedLinks()).sort(), ["chloe", "farah"]);
  });

  test("replaced: a new secret, the old one opens nothing, the new one the same calendar", async () => {
    const { token: old } = await w.linkOf("chloe");
    const before = readCalendar((await w.fetchFeed(old)).body);
    at("2026-11-18T09:00:00Z");
    const replaced = await w.ask("chloe", { action: "replace" });
    assert.equal(replaced.status, 200);
    const fresh = w.tokenOf(replaced.body.url);
    assert.notEqual(fresh, old);
    assert.deepEqual(storedLinks(), { chloe: { uid: "chloe", token: fresh, createdAt: new Date("2026-11-18T09:00:00Z") } });
    assert.deepEqual(readCalendar((await w.fetchFeed(old)).body).events, [], "the old link still opens a calendar");
    assert.deepEqual(
      readCalendar((await w.fetchFeed(fresh)).body).events.map((e) => [e.UID, e.DTSTART]),
      before.events.map((e) => [e.UID, e.DTSTART]),
    );
    // And the next ask is the new one, not a third.
    assert.equal((await w.ask("chloe", { action: "open" })).body.url, replaced.body.url);
  });

  test("deleted with the account: the one document at their uid, and nobody else's", async () => {
    const { token } = await w.linkOf("chloe");
    await w.linkOf("farah");
    assert.equal(await w.cal.link.deleteCalendarLink(w.world.courseDb, "chloe"), true);
    assert.deepEqual(Object.keys(storedLinks()), ["farah"]);
    assert.deepEqual(readCalendar((await w.fetchFeed(token)).body).events, []);
    assert.equal(await w.cal.link.deleteCalendarLink(w.world.courseDb, "chloe"), false, "a second sweep found a link");
  });

  test("the account's deletion runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*calendarLinkDeleted: boolean;/m);
    assert.match(source, /^\s*calendarLinkDeleted: false,/m);
    const step = /try \{\s*summary\.calendarLinkDeleted = await deleteCalendarLink\(db, uid\);\s*\} catch \(err\) \{([\s\S]*?)\n {2}\}/.exec(source);
    assert.ok(step, "the cascade no longer deletes the calendar link in a step of its own");
    assert.match(step[1], /partialFailure = true;/);
    assert.doesNotMatch(step[1], /\bthrow\b/);
    // The log line names the error's code, never what it read.
    assert.doesNotMatch(step[1], /, err\)/);
  });
});

// ---------------------------------------------------------------------------
// 2. Every caller
// ---------------------------------------------------------------------------

describe("2. every caller of the link route", () => {
  test("view-as is refused first, and nothing is made", async () => {
    const answer = await w.ask("chloe", { action: "open" }, { viewAs: true });
    assert.equal(answer.status, 403);
    assert.deepEqual(storedLinks(), {});
  });

  test("signed out is 401, before the body is read", async () => {
    assert.deepEqual([(await w.ask(null, { action: "open" })).status, (await w.ask(null, {})).status], [401, 401]);
  });

  test("the body is checked before anything is read, with a sentence a person can act on", async () => {
    for (const body of [{}, { action: "delete" }, { action: "OPEN" }, [], "open", { action: ["open"] }]) {
      const reads = w.world.db.stats.reads;
      const answer = await w.ask("chloe", body);
      assert.deepEqual([answer.status, answer.body.error], [400, "Ask for your calendar link, or for a new one."], JSON.stringify(body));
      assert.equal(w.world.db.stats.reads, reads, `${JSON.stringify(body)} was read before its body was checked`);
    }
    assert.deepEqual(storedLinks(), {});
  });

  test("an account that does not stand is refused, and nothing is made", async () => {
    for (const who of ["erin", "refused"]) {
      const answer = await w.ask(who, { action: "open" });
      assert.deepEqual([answer.status, answer.body.error], [403, "Your account isn’t approved yet, so there are no sessions to add."], who);
    }
    assert.deepEqual(storedLinks(), {});
  });

  test("somebody with no group Publish has told them about is told so, and nothing is made", async () => {
    // Una (placed, not told), Nell (on nothing), Claudia (the lead, in no
    // group), Zach (an admin in no group), Sam (left, with nothing to come).
    for (const who of ["una", "nobody", "claudia", "zach", "sam"]) {
      const answer = await w.ask(who, { action: "open" });
      assert.deepEqual([answer.status, answer.body.error], [404, "You’re not in a group yet, so there are no sessions to add."], who);
    }
    assert.deepEqual(storedLinks(), {});
  });

  test("somebody who left with a link already keeps it, to replace it", async () => {
    w.world.db.seed("calendarLinks/sam", { uid: "sam", token: "S".repeat(43), createdAt: NOW });
    const answer = await w.ask("sam", { action: "replace" });
    assert.equal(answer.status, 200);
    assert.notEqual(w.tokenOf(answer.body.url), "S".repeat(43));
  });

  test("a facilitator, and a member told, get theirs", async () => {
    for (const who of ["rahul", "sofia", "chloe", "kofi"]) {
      assert.equal((await w.ask(who, { action: "open" })).status, 200, who);
    }
    assert.deepEqual(Object.keys(storedLinks()).sort(), ["chloe", "kofi", "rahul", "sofia"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Where the buttons go
// ---------------------------------------------------------------------------

describe("3. where the dialog's four buttons go", () => {
  test("each subscribes to the link, and nothing else is in the answer", async () => {
    const { answer, token } = await w.linkOf("chloe");
    const url = `${SITE}/api/courses/calendar/${token}/sessions.ics`;
    const webcal = `webcal://naisi.invalid/api/courses/calendar/${token}/sessions.ics`;
    assert.deepEqual(Object.keys(answer.body).sort(), ["apple", "google", "line", "outlook", "url"]);
    assert.equal(answer.body.url, url);
    assert.equal(answer.body.apple, webcal);

    const google = new URL(answer.body.google);
    assert.equal(google.origin + google.pathname, "https://calendar.google.com/calendar/u/0/r");
    assert.deepEqual([...google.searchParams.keys()], ["cid"]);
    assert.equal(google.searchParams.get("cid"), webcal);

    const outlook = new URL(answer.body.outlook);
    assert.equal(outlook.origin + outlook.pathname, "https://outlook.office.com/calendar/0/addfromweb/");
    assert.deepEqual([...outlook.searchParams.keys()], ["url", "name"]);
    assert.equal(outlook.searchParams.get("url"), webcal);
    assert.equal(outlook.searchParams.get("name"), "NAISI sessions");
  });

  test("a site that does not know its own address makes no link", async () => {
    const was = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "";
    try {
      const answer = await w.ask("chloe", { action: "open" });
      assert.deepEqual([answer.status, answer.body.error], [503, "This copy of the site doesn’t know its own address, so it can’t make a calendar link."]);
      assert.deepEqual(storedLinks(), {});
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = was;
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The dialog's words
// ---------------------------------------------------------------------------

describe("4. the dialog's words", () => {
  test("the boards' group reads the board's line, counted from records, and the board's words around it", async () => {
    const { answer } = await w.linkOf("chloe");
    assert.equal(answer.body.line, BOARD_LINE);
    const { text, html } = w.dialogBody({ kind: "ready", link: answer.body, renewed: false });
    assert.equal(
      text,
      `Add your sessions to your calendar ${BOARD_LINE} Apple Calendar Google Calendar Outlook Copy the link ${BOARD_NOTE} Get a new link`,
    );
    assert.match(html, /aria-label="Close"/);
    assert.ok(html.includes(`href="${answer.body.apple.replace(/&/g, "&amp;")}"`));
    assert.ok(html.includes(`href="${answer.body.google.replace(/&/g, "&amp;")}"`));
    assert.ok(html.includes(`href="${answer.body.outlook.replace(/&/g, "&amp;")}"`));
    // Google and Outlook open in a tab of their own; Apple's address is handed to the calendar app.
    assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length, 2);
  });

  test("the line counts what the calendar holds: a later joiner, a cancelled week, one session", async () => {
    w.world.db.seed(`courseEnrolments/${RUN.agi}__kofi`, enrolment("kofi", B, { joinedWeekNumber: 3 }));
    assert.equal(
      (await w.ask("kofi", { action: "open" })).body.line,
      "4 sessions on Tuesdays at 6pm, from Tue 17 Nov. If a time or room changes, your calendar changes too.",
    );
    changeGroup(B, {
      sessionChanges: { w04: { kind: "cancelled", reason: "Both away.", dateKey: "2026-11-24", byUid: "rahul", at: NOW } },
    });
    assert.equal(
      (await w.ask("chloe", { action: "open" })).body.line,
      "5 sessions on Tuesdays at 6pm, from Tue 3 Nov. If a time or room changes, your calendar changes too.",
    );
    w.world.db.seed(`courseEnrolments/${RUN.agi}__kofi`, enrolment("kofi", B, { joinedWeekNumber: 6 }));
    assert.equal(
      (await w.ask("kofi", { action: "open" })).body.line,
      "1 session, on Tue 8 Dec at 6pm. If a time or room changes, your calendar changes too.",
    );
  });

  test("a link holding two groups names each, by programme, and by group when one programme has both", async () => {
    w.world.db.seed(`courseEnrolments/${RUN.tais}__chloe`, taisSeat("chloe"));
    assert.equal(
      (await w.ask("chloe", { action: "open" })).body.line,
      "6 Technical AI Safety sessions on Mondays at 5pm, from Mon 2 Nov, and 6 AGI Strategy sessions on Tuesdays at 6pm, " +
        "from Tue 3 Nov. If a time or room changes, your calendar changes too.",
    );
    assert.equal(
      (await w.ask("sofia", { action: "open" })).body.line,
      "6 AGI Strategy Group A sessions on Thursdays at 6pm, from Thu 29 Oct, and 6 AGI Strategy Group B sessions on " +
        "Tuesdays at 6pm, from Tue 3 Nov. If a time or room changes, your calendar changes too.",
    );
    const { sessionsLine } = w.cal.words;
    const group = (programmeName, groupName, weekday) => ({
      programmeName,
      groupName,
      count: 2,
      weekday,
      startTimeLocal: "18:00",
      firstDateKey: "2026-11-02",
    });
    assert.equal(
      sessionsLine([group("One", "Group A", 1), group("Two", "Group B", 2), group("Three", "Group C", 3), { ...group("Four", "Group D", 4), count: 0 }]),
      "2 One sessions on Mondays at 6pm, from Mon 2 Nov; 2 Two sessions on Tuesdays at 6pm, from Mon 2 Nov; and " +
        "2 Three sessions on Wednesdays at 6pm, from Mon 2 Nov. If a time or room changes, your calendar changes too.",
    );
  });

  test("the states the board does not draw", async () => {
    const { answer } = await w.linkOf("chloe");
    const ready = { kind: "ready", link: answer.body, renewed: false };
    assert.equal(w.dialogBody({ kind: "idle" }).text, "Add your sessions to your calendar Getting your link…");
    assert.equal(w.dialogBody({ kind: "loading", action: "replace" }).text, "Add your sessions to your calendar Getting a new link…");
    assert.equal(
      w.dialogBody({ kind: "failed", message: "You’re not in a group yet, so there are no sessions to add.", action: "open" }).text,
      "Add your sessions to your calendar You’re not in a group yet, so there are no sessions to add. Try again",
    );
    assert.match(w.dialogBody({ ...ready, renewed: true }).text, new RegExp(
      `${BOARD_LINE.replace(/[.]/g, "\\.")} Here’s your new link\\. Your old one has stopped working, so add this one to your calendar again\\. Apple Calendar`,
    ));
    assert.match(
      w.dialogBody(ready, { confirming: true }).text,
      /never the meeting link\. Your old link will stop working, and any calendar using it will stop showing your sessions\. Get a new link Keep this one$/,
    );
    assert.match(w.dialogBody(ready, { copied: "yes" }).text, /Outlook Link copied The link is yours/);
    const byHand = w.dialogBody(ready, { copied: "by-hand" });
    assert.match(byHand.text, /Copy the link Copy this link into your calendar: The link is yours/);
    assert.ok(byHand.html.includes(`value="${answer.body.url}"`) && /readOnly|readonly/.test(byHand.html));
  });

  test("no sentence in the dialog or the calendar's words has a dash", () => {
    const source = readFileSync(join(SRC, "lib", "courses", "calendarWords.ts"), "utf8");
    assert.doesNotMatch(source, /[\u2013\u2014]/);
  });
});

// ---------------------------------------------------------------------------
// 5. The button
// ---------------------------------------------------------------------------

describe("5. Add to calendar on the session ticket", () => {
  const BUTTON = /<button type="button" class="calendarButton( calendarButtonHome)?" disabled="" aria-haspopup="dialog">/g;

  test("on the programme page's ticket, once, under the room, and disabled until the page hydrates", async () => {
    await w.asBrowser("chloe");
    const { html, text } = w.programmeHome("chloe");
    assert.equal((html.match(BUTTON) ?? []).length, 1);
    assert.match(html, /<button type="button" class="calendarButton" disabled="" aria-haspopup="dialog"><svg/);
    assert.match(text, /Tue 17 Nov, 6pm to 8pm Hallward B12 R S with Rahul and Sofia Add to calendar This week/);
  });

  test("in the row under Home's card, with no icon", async () => {
    await w.asBrowser("chloe");
    const home = await w.homeCard("chloe");
    assert.match(home.html, /<div class="ticketFoot"><button type="button" class="calendarButton calendarButtonHome" disabled="" aria-haspopup="dialog"><span>Add to calendar<\/span><\/button><\/div>/);
    assert.equal((home.html.match(BUTTON) ?? []).length, 1);
  });

  test("on a facilitator's ticket, whose calendar holds their group", async () => {
    await w.asBrowser("rahul");
    assert.equal((w.programmeHome("rahul").html.match(BUTTON) ?? []).length, 1);
  });

  test("an online week's ticket carries Join online in its place", async () => {
    changeGroup(B, { sessionModes: { w03: "virtual" }, sessionOverrides: { w03: { meetingUrl: "https://meet.example.com/week-3" } } });
    await w.asBrowser("chloe");
    const { html, text } = w.programmeHome("chloe");
    assert.match(text, /Join online/);
    assert.equal((html.match(BUTTON) ?? []).length, 0);
    assert.equal(((await w.homeCard("chloe")).html.match(BUTTON) ?? []).length, 0);
  });

  test("nobody without a ticket is offered it: after the end, placed and not told, left, an admin in no group", async () => {
    for (const [who, when] of [["chloe", "2026-12-20T12:00:00Z"], ["una"], ["sam"], ["zach"]]) {
      at(when ?? NOW.toISOString());
      w.reset(calendarSeed());
      await w.asBrowser(who);
      const page = w.ui.overview ? w.programmeHome(who).html : "";
      const home = (await w.homeCard(who))?.html ?? "";
      assert.equal((page.match(BUTTON) ?? []).length + (home.match(BUTTON) ?? []).length, 0, who);
      assert.doesNotMatch(page + home, /Add to calendar/, who);
    }
  });
});
