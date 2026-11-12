/**
 * THE PAGES THAT CORRECT A REGISTER, held to what they say and to whom.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. THE WORDS (`src/lib/courses/registerCorrection/pageWords.ts`), run as a
 *     table: the lines a line can be corrected to (never the one it says),
 *     what a register says beside an ask or a correction, a corrected line's
 *     story (a reason only when the reader is sent one), the column's
 *     "Before you save" from each preview, the buttons that name what they
 *     do, the Requests page's rows, and a member's "Corrected on". Times in
 *     the house clock; no dash and no word the house does not use.
 *  2. THE PAGES, drawn: the Requests page for an admin and for a lead, one
 *     request's page for the people who decide it and for the person who
 *     asked (who is offered neither Approve nor Decline), and the group's
 *     Attendance tab with and without the facilitators' row.
 *  3. THE WIRING, read from the source: nothing on the register changes a
 *     finished register without a reason; the Attendance tab is handed only
 *     to admins and the programme's lead; the Requests pages sit behind the
 *     admissions tree's gate; Home counts requests only for somebody that
 *     tree admits, and never in a view-as session; every new stylesheet ends
 *     with its phone block and its controls are 44px.
 *
 * The routes and loaders behind these pages are run in
 * tests/course-register-corrections.test.mjs.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

globalThis.__correctionPagesUi = { h: createElement };
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const STYLESHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) STYLESHEETS.add(specifier);
}
const { loadTs } = createLoader({
  stubs: [
    [
      "next/navigation",
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }\nexport function usePathname() { return '/'; }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, ...rest }) =>\n" +
        "  globalThis.__correctionPagesUi.h('a', { href, className, 'aria-label': rest['aria-label'] }, children);",
    ],
    ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
  ],
});

const P = await loadTs("lib/courses/registerCorrection/pageWords.ts");
const { default: RequestsList } = await loadTs("features/courses/requests/RequestsList.tsx");
const { default: RequestPage } = await loadTs("features/courses/requests/RequestPage.tsx");
const { default: AttendanceTab } = await loadTs("features/courses/groupPage/AttendanceTab.tsx");

const draw = (component, props) => {
  const html = renderToStaticMarkup(createElement(component, props));
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() };
};

/** 9:40am and 10:05am on Tue 10 Nov 2026, London (GMT). */
const ASKED = "2026-11-10T09:40:00.000Z";
const DECIDED = "2026-11-10T10:05:00.000Z";
const SAME_DAY = new Date("2026-11-10T15:00:00.000Z");
const NEXT_DAY = new Date("2026-11-11T09:00:00.000Z");

function noDashes(text, where) {
  assert.doesNotMatch(text, /[\u2013\u2014]/, `${where} carries a dash`);
  assert.doesNotMatch(text, /collate/i, `${where} uses a word the house does not`);
}

// ---------------------------------------------------------------------------
// 1. The words
// ---------------------------------------------------------------------------

describe("1. the words", () => {
  test("a line can be corrected to every line but the one it says, sent as the route takes it", () => {
    assert.deepEqual(
      P.LINE_CHOICES.map((each) => each.words),
      ["In the room", "Online", "Arrived late, in the room", "Arrived late, online", "Left early, in the room", "Left early, online", "Absent", "Excused"],
    );
    assert.deepEqual(P.choicesOtherThan("absent", false).map((each) => each.key), ["present", "present-online", "late", "late-online", "left-early", "left-early-online", "excused"]);
    assert.ok(!P.choicesOtherThan("present", true).some((each) => each.key === "present-online"), "Online is offered to a line that says Online");
    assert.ok(P.choicesOtherThan("present", true).some((each) => each.key === "present"), "In the room is not offered to a line that says Online");
    // Online only beside a mark that says they came; absent and excused carry no place.
    assert.deepEqual(P.lineBody(P.choiceOf("late-online")), { status: "late", online: true });
    assert.deepEqual(P.lineBody(P.choiceOf("present")), { status: "present", online: false });
    assert.deepEqual(P.lineBody(P.choiceOf("absent")), { status: "absent" });
    assert.equal(P.oneLine("Daniel was there.\nI tapped the wrong line."), "Daniel was there. I tapped the wrong line.");
    assert.equal(P.REASON_MAX, 300);
  });

  test("beside a line: an ask waiting, corrected as asked, or declined with the reply the reader is sent", () => {
    const waiting = { id: "r1", state: "waiting", from: "Absent", to: "In the room", askedBy: { name: "Rahul Mehta" }, askedAt: ASKED, yours: true, decidedBy: null, decidedAt: null };
    assert.equal(P.requestLine(waiting, SAME_DAY), "You asked for In the room at 9:40am. Waiting for an admin or the programme’s lead.");
    assert.equal(P.requestLine(waiting, NEXT_DAY), "You asked for In the room on Tue 10 Nov at 9:40am. Waiting for an admin or the programme’s lead.");
    assert.equal(
      P.requestLine({ ...waiting, yours: false, handling: { name: "Claudia Ward" } }, SAME_DAY),
      "Rahul asked for In the room at 9:40am. Waiting for an admin or the programme’s lead. Claudia has it.",
    );
    const approved = { ...waiting, state: "approved", decidedBy: { name: "Sam Okafor" }, decidedAt: DECIDED };
    assert.equal(P.requestLine(approved, SAME_DAY), "Corrected by Sam at 10:05am, as you asked.");
    const declined = { ...waiting, state: "declined", decidedBy: { name: "Sam Okafor" }, decidedAt: DECIDED, reply: "Daniel left at 3pm." };
    assert.equal(P.requestLine(declined, SAME_DAY), "Your ask for In the room was declined by Sam at 10:05am: “Daniel left at 3pm.”");
    // Another facilitator is never sent the reply, so the line says none.
    assert.equal(P.requestLine({ ...declined, yours: false, reply: undefined }, SAME_DAY), "Rahul’s ask for In the room was declined by Sam at 10:05am.");
    assert.equal(P.cellChip({ corrected: false, request: waiting }), "Asked");
    assert.equal(P.cellChip({ corrected: true, request: approved }), "Corrected");
    assert.equal(P.cellChip({ corrected: false, request: declined }), "Declined");
    assert.equal(P.cellChip({ corrected: false, request: null }), "");
  });

  test("a corrected line's story says what it was, who set it, who asked, who corrected it and, only when sent, why", () => {
    const story = {
      kind: "line",
      before: "Absent",
      beforeSetBy: { name: "Rahul Mehta", at: "2026-11-04T15:06:00.000Z" },
      correctedBy: { name: "Sam Okafor" },
      correctedAt: DECIDED,
      reason: "Daniel was there all session.",
      movedFrom: null,
      asked: { name: "Rahul Mehta", at: ASKED, yours: false },
    };
    assert.equal(
      P.storyWords(story),
      "Was Absent, set by Rahul, Wed 4 Nov, 3:06pm. Rahul asked, Tue 10 Nov, 9:40am. Corrected by Sam, Tue 10 Nov, 10:05am. Why: “Daniel was there all session.”",
    );
    const { reason: _gone, ...unsent } = story;
    assert.doesNotMatch(P.storyWords(unsent), /Why/, "a story says why with no reason sent");
    assert.match(P.storyWords({ ...story, kind: "moved", movedFrom: "w01" }, () => "week 1"), /^Moved here from week 1\./);
    assert.match(P.storyWords({ ...story, kind: "held-online", before: "In the room", beforeSetBy: null, asked: null }), /The whole column was corrected: it was held online\./);
  });

  test("the column's Before you save, from each preview, and a button that names what it does", () => {
    const online = P.columnPreviewLines(
      { kind: "online", weekNumber: 1, changes: 5, staying: [{ uid: "k", name: "Kai Thompson", line: "Absent" }] },
      "Group I",
    );
    assert.deepEqual(online[0], { label: "Changes", text: "5 lines: In the room to Online. Kai stays Absent." });
    assert.deepEqual(online.at(-1), { label: "Told", text: "Nobody is emailed. Its facilitators see it on the register; the people see it on their own pages." });
    const returns = {
      email: "returns",
      card: "returns",
      emailTo: { kind: "facilitators", names: ["Rahul Mehta", "Sofia Rossi"] },
      emailFrom: "2026-11-12T08:00:00.000Z",
    };
    const move = P.columnPreviewLines(
      { kind: "move", weekNumber: 1, moves: 2, to: { weekNumber: 2, dateKey: "2026-11-11" }, staying: [], stays: { checkIn: true, reports: 1 }, chase: returns, at: "2026-11-11T10:00:00.000Z" },
      "Group I",
    );
    assert.equal(move[0].text, "2 lines move to week 2, Wed 11 Nov, with who set each. Week 1 goes back to not taken.");
    assert.equal(move[1].text, "What people said in advance, and any notes on the register, stay with this week. So do its check-in and its session report: they don’t move.");
    assert.equal(move[2].text, "The reminder email goes again. The card for the lead and admins comes back.");
    assert.deepEqual(move.at(-1), {
      label: "Told",
      text: "Its facilitators, Rahul and Sofia, get the register reminder email soon after 8am on Thu 12 Nov if it isn’t finished by then. Nobody else is emailed.",
    });
    const clear = P.columnPreviewLines({ kind: "clear", weekNumber: 3, clears: 1, staying: [], stays: { checkIn: false, reports: 0 }, chase: { email: "passed", card: "returns", emailTo: null, emailFrom: null } }, "Group A");
    assert.equal(clear[0].text, "1 line cleared. Week 3 goes back to not taken, and the group’s history keeps what each said.");
    assert.equal(clear[2].text, "The reminder email’s time for this session has passed, so it doesn’t go again. The card for the lead and admins comes back.");
    assert.equal(clear.at(-1).text, "Nobody is emailed. Its facilitators see it on the register; the people see it on their own pages.");
    const keep = P.didNotHappenPreviewLines({ weekNumber: 2, pace: "keep", clearing: [{ uid: "a", name: "Ada Fixture", line: "In the room" }], didNotHappen: { checkIn: false, reports: 0 } });
    assert.deepEqual(keep.map((row) => row.label), ["Attendance", "Register", "Dates", "Check-in, report"]);
    assert.equal(keep[1].text, "1 line cleared: Ada (in the room). The group’s history keeps what each said.");
    assert.equal(keep[3].text, "Neither opens: there was no session.");
    const push = P.didNotHappenPreviewLines({ weekNumber: 2, pace: "push", clearing: [], after: { weekNumber: 2, dateKey: "2026-11-17", startTimeLocal: "18:00" } });
    assert.equal(push.find((row) => row.label === "Dates").text, "Week 2 meets on Tue 17 Nov at 6pm instead, and every week after it a week later.");
    assert.equal(P.columnButtonWords({ way: "online", weekNumber: 1, lines: 5, toWeek: null, tell: false, emails: 0 }), "Correct 5 lines");
    assert.equal(P.columnButtonWords({ way: "move", weekNumber: 1, lines: 1, toWeek: 2, tell: false, emails: 0 }), "Move 1 line to week 2");
    assert.equal(P.columnButtonWords({ way: "clear", weekNumber: 1, lines: 3, toWeek: null, tell: false, emails: 0 }), "Clear 3 lines");
    assert.equal(P.columnButtonWords({ way: "did-not-happen", weekNumber: 1, lines: 0, toWeek: null, tell: false, emails: 7 }), "Save: it didn’t happen");
    assert.equal(P.columnButtonWords({ way: "did-not-happen", weekNumber: 1, lines: 0, toWeek: null, tell: true, emails: 7 }), "Save: it didn’t happen, and email 7 people");
    assert.equal(P.columnButtonWords({ way: "did-happen", weekNumber: 1, lines: 0, toWeek: null, tell: false, emails: 0 }), "Save: it happened");
    assert.deepEqual(P.didHappenPreviewLines({ weekNumber: 1 }, { room: 2, online: 0, absent: 3, excused: 0 })[0], {
      label: "Attendance",
      text: "Week 1 comes back into everyone’s attendance: 2 in the room and 3 absent.",
    });
    assert.equal(P.correctColumnWords(1), "Correct week 1’s whole column");
    assert.equal(P.didHappenWords(1), "Week 1 did happen");
  });

  test("Told says nobody is emailed only while no reminder will go: who gets it and when when it returns, why not when it has passed or is off", () => {
    const at = new Date("2026-11-11T10:00:00.000Z");
    const nobody = "Nobody is emailed. Its facilitators see it on the register; the people see it on their own pages.";
    const facilitators = { kind: "facilitators", names: ["Rahul Mehta", "Sofia Rossi"] };
    // Returns: who, and when, in one sentence; never "Nobody is emailed".
    const later = { email: "returns", card: "returns", emailTo: facilitators, emailFrom: "2026-11-12T08:00:00.000Z" };
    assert.equal(P.toldWords(later, at), "Its facilitators, Rahul and Sofia, get the register reminder email soon after 8am on Thu 12 Nov if it isn’t finished by then. Nobody else is emailed.");
    assert.equal(
      P.toldWords({ ...later, emailFrom: "2026-11-11T20:00:00.000Z" }, at),
      "Its facilitators, Rahul and Sofia, get the register reminder email soon after 8pm today if it isn’t finished by then. Nobody else is emailed.",
    );
    assert.equal(
      P.toldWords({ ...later, emailFrom: "2026-11-10T20:00:00.000Z", emailTo: { kind: "facilitators", names: ["Rahul Mehta"] } }, at),
      "Its facilitator, Rahul, gets the register reminder email within about 15 minutes if it isn’t finished by then. Nobody else is emailed.",
    );
    assert.match(P.toldWords({ ...later, emailTo: { kind: "cover-taker", names: ["Claudia Ward"] } }, at), /^Claudia, who took it in a facilitator’s place, gets the register reminder email soon after 8am on Thu 12 Nov/);
    assert.match(P.toldWords({ ...later, emailTo: { kind: "cover-giver", names: ["Claudia Ward"] } }, at), /^Claudia, who gave the session to somebody, gets /);
    for (const chase of [
      later,
      { email: "passed", card: "returns", emailTo: null, emailFrom: null },
      { email: "passed", card: "passed", emailTo: null, emailFrom: null },
      { email: "off", card: "off", emailTo: null, emailFrom: null },
    ]) {
      const lines = P.columnPreviewLines({ kind: "clear", weekNumber: 1, clears: 2, staying: [], stays: { checkIn: false, reports: 0 }, chase, at: at.toISOString() }, "Group B");
      const told = lines.find((row) => row.label === "Told").text;
      const reminders = lines.find((row) => row.label === "Reminders").text;
      if (chase.email === "returns") {
        assert.doesNotMatch(told, /Nobody is emailed/, "Told says nobody is emailed while a reminder will go");
        assert.match(reminders, /^The reminder email goes again\./);
      } else {
        assert.equal(told, nobody);
        assert.doesNotMatch(reminders, /goes again/);
      }
    }
    // Passed and off say which: a job switched off is never said to have passed.
    assert.equal(
      P.columnPreviewLines({ kind: "clear", weekNumber: 1, clears: 1, staying: [], stays: { checkIn: false, reports: 0 }, chase: { email: "passed", card: "passed", emailTo: null, emailFrom: null } }, "Group B").find((row) => row.label === "Reminders").text,
      "The reminder email’s time for this session has passed, so it doesn’t go again. The card for the lead and admins doesn’t come back: its time has passed.",
    );
    assert.equal(
      P.columnPreviewLines({ kind: "clear", weekNumber: 1, clears: 1, staying: [], stays: { checkIn: false, reports: 0 }, chase: { email: "off", card: "off", emailTo: null, emailFrom: null } }, "Group B").find((row) => row.label === "Reminders").text,
      "The reminder email is switched off, so it doesn’t go. The card for the lead and admins is switched off, so it doesn’t come back.",
    );
    // A group with nobody for the reminder to go to: nobody is emailed, and the reminder says so.
    const nobodyToGo = { ...later, emailTo: { kind: "facilitators", names: [] } };
    assert.equal(P.toldWords(nobodyToGo, at), nobody);
    // Held online puts nothing back to not taken: nobody is emailed whatever the chase.
    assert.equal(P.columnPreviewLines({ kind: "online", weekNumber: 1, changes: 1, staying: [], chase: later }, "Group B").at(-1).text, nobody);
    // A move's line after it went through does not say nobody was emailed.
    assert.doesNotMatch(P.columnDoneWords("move", 1, 2, 2), /emailed/);
  });

  test("It did happen offers Excused, shows each person's line, and starts each from it", () => {
    assert.deepEqual(P.DID_HAPPEN_CHOICES.map((choice) => choice.words), ["In the room", "Online", "Absent", "Excused"]);
    assert.equal(P.choiceOfLine("Excused").key, "excused");
    assert.equal(P.choiceOfLine("Not set"), null);
    assert.equal(P.didHappenNowWords("Excused"), "Now: Excused");
    assert.equal(P.didHappenNowWords("Not set"), "Now: Not set");
    // A line the four do not say stays offered, so it can be kept.
    assert.deepEqual(P.didHappenChoicesFor("Arrived late, in the room").map((choice) => choice.key), ["present", "present-online", "absent", "excused", "late"]);
    assert.deepEqual(P.didHappenChoicesFor("Excused").map((choice) => choice.key), ["present", "present-online", "absent", "excused"]);
    assert.deepEqual(P.didHappenCounts(["present", "excused", null, "late-online", "absent", "excused"]), { room: 1, online: 1, absent: 1, excused: 2 });
    assert.deepEqual(P.didHappenPreviewLines({ weekNumber: 2 }, P.didHappenCounts(["present", "excused"]))[0], {
      label: "Attendance",
      text: "Week 2 comes back into everyone’s attendance: 1 in the room and 1 excused.",
    });
  });

  test("It didn't happen says what was opened or written for it, true for the cancel chosen", () => {
    const row = (preview) => P.didNotHappenPreviewLines(preview).find((each) => each.label === "Check-in, report")?.text;
    assert.equal(row({ weekNumber: 1, pace: "keep", clearing: [], didNotHappen: { checkIn: true, reports: 2 } }), "Its check-in was opened, and 2 session reports were written. They are kept, and nothing more opens for it.");
    assert.equal(row({ weekNumber: 1, pace: "keep", clearing: [], didNotHappen: { checkIn: false, reports: 0 } }), "Neither opens: there was no session.");
    // Push back is refused once either exists, so a push's preview has neither.
    assert.equal(row({ weekNumber: 1, pace: "push", clearing: [], didNotHappen: { checkIn: false, reports: 0 } }), "Nothing was opened or written for it. Week 1’s check-in and report are for its new session.");
  });

  test("the Requests page's rows, one request's page and Home say who, about what, when and who has it", () => {
    const row = { group: { name: "Group F" }, weekNumber: 1, occurrence: 1, subject: { name: "Kwame Asante" }, from: "Arrived late, in the room", to: "In the room" };
    assert.equal(P.requestAbout(row), "Group F, week 1: Kwame Asante, Arrived late, in the room to In the room");
    assert.equal(P.handlingWords(null, false), "Nobody has it yet");
    assert.equal(P.handlingWords({ name: "Sam Okafor" }, false), "Sam has it");
    assert.equal(P.handlingWords({ name: "Sam Okafor" }, true), "You have it");
    assert.deepEqual(
      ["waiting", "handling", "approved", "declined", "withdrawn"].map(P.stateChip),
      ["Waiting", "Being handled", "Approved", "Declined", "Withdrawn"],
    );
    assert.deepEqual(P.approvingLines({ subject: "Daniel Kim", asker: "Rahul Mehta", groupName: "Group C", mine: false }), [
      { label: "Approving", text: "Changes the line on the spot and records who, when, from, to and why." },
      { label: "Figures", text: "Daniel’s attendance, Group C’s and the programme’s update everywhere." },
      { label: "Told", text: "Rahul, on the register. Nobody is emailed." },
    ]);
    assert.equal(P.replyLabel("Rahul Mehta"), "Reply to Rahul (needed to decline)");
    assert.equal(P.finishedByWords({ by: { name: "Rahul Mehta" }, at: "2026-11-04T17:02:00.000Z" }), "Finished by Rahul, Wed 4 Nov, 5:02pm.");
    assert.equal(P.requestsWaitingTitle(1), "Request waiting");
    assert.equal(P.programmeRequestsWords(2), "2 requests waiting");
  });

  test("a member's own sessions say Corrected on with the day, never who, why or a count", () => {
    assert.equal(P.correctedOnWords("2026-11-10"), "Corrected on Tue 10 Nov");
    assert.equal(P.correctedSessionWords(1, "2026-11-04", "2026-11-10"), "Week 1, Wed 4 Nov: corrected on Tue 10 Nov.");
    assert.equal(P.cellWords({ state: "mark", mark: "late", online: true, saved: false }), "Arrived late, online");
    assert.equal(P.cellWords({ state: "not-held", mark: null, online: false, saved: false }), "Didn’t happen");
    assert.equal(P.cellWords({ state: "not-yet", mark: null, online: false, saved: false }), "Not taken yet");
    assert.equal(P.presenceCellWords({ state: "late", arrivedAt: "2026-11-10T16:40:00.000Z" }), "Arrived 4:40pm");
    assert.equal(P.presenceCellWords({ state: "not-there", arrivedAt: null }), "Not there");
    assert.equal(P.presenceCellWords(null), "");
  });

  test("no sentence the pages say carries a dash or a word the house does not use", () => {
    const source = read("src/lib/courses/registerCorrection/pageWords.ts");
    noDashes(source, "pageWords.ts");
    for (const file of [
      "src/features/courses/registerCorrection/LineSheet.tsx",
      "src/features/courses/registerCorrection/ColumnSheet.tsx",
      "src/features/courses/requests/RequestsList.tsx",
      "src/features/courses/requests/RequestPage.tsx",
      "src/features/courses/groupPage/AttendanceTab.tsx",
      "src/app/(app)/dashboard/RequestsWaiting.tsx",
    ]) {
      noDashes(read(file), file);
    }
    assert.equal(P.AFTER_FINISH, "The register locks. After that, a change goes through an admin or the programme’s lead, asked for from the line, and every change records who made it, when and why.");
  });
});

// ---------------------------------------------------------------------------
// 2. The pages, drawn
// ---------------------------------------------------------------------------

const ROW = {
  id: "req1",
  kind: "register-correction",
  status: "waiting",
  state: "waiting",
  askedBy: { uid: "rahul", name: "Rahul Mehta" },
  askedAt: ASKED,
  subject: { uid: "daniel", name: "Daniel Kim" },
  programme: { roundId: "r1", programmeId: "agi", name: "AGI Strategy" },
  runId: "run1",
  group: { id: "grpC", name: "Group C" },
  weekNumber: 1,
  occurrence: 1,
  dateKey: "2026-11-04",
  from: "Absent",
  to: "In the room",
  handling: null,
  mine: false,
  decidedBy: null,
  decidedAt: null,
};

describe("2. the pages, drawn", () => {
  test("the Requests page: who asked, about what, when, who has it, and the way to it", () => {
    const view = {
      viewer: "admin",
      counts: { waiting: 1, handling: 1, doneThisWeek: 0 },
      rows: [ROW, { ...ROW, id: "req2", state: "handling", handling: { uid: "zach", name: "Sam Okafor", at: DECIDED }, programme: { roundId: "r1", programmeId: "tas", name: "Technical AI Safety" }, runId: "run2" }],
      weekStartsAt: "2026-11-09T00:00:00.000Z",
    };
    const drawn = draw(RequestsList, { view });
    for (const said of ["Requests", "2 waiting", "Waiting 1", "Being handled 1", "Done this week 0", "Rahul Mehta · Register correction", "Group C, week 1: Daniel Kim, Absent to In the room", "Tue 10 Nov, 9:40am", "Nobody has it yet", "All programmes"]) {
      assert.ok(drawn.text.includes(said), `the Requests page does not say "${said}": ${drawn.text}`);
    }
    assert.ok(drawn.html.includes('href="/admin/admissions/requests/req1"'), "a row does not open its request");
    // Being handled is its own view: not drawn in Waiting.
    assert.ok(!drawn.text.includes("Sam has it"), "a request being handled is listed under Waiting");
    assert.doesNotMatch(drawn.text, /email me|access needs/i, "the page offers something that is not built");

    // A lead: their own programme's, no filter by programme.
    const lead = draw(RequestsList, { view: { ...view, viewer: "lead", rows: [ROW], counts: { waiting: 1, handling: 0, doneThisWeek: 0 } } });
    assert.ok(lead.text.includes("Register corrections for the programmes you lead."));
    assert.ok(!lead.text.includes("All programmes"), "a lead is offered every programme");

    const empty = draw(RequestsList, { view: { ...view, rows: [], counts: { waiting: 0, handling: 0, doneThisWeek: 0 } } });
    assert.ok(empty.text.includes("Nothing waiting") && empty.text.includes("No requests waiting"), empty.text);
  });

  test("one request's page: the line now and what it should say, why, what approving does, and no decision for the person who asked", () => {
    const view = {
      ...ROW,
      reason: "Daniel was there all session. I tapped the wrong line.",
      line: { now: "Absent", setBy: { name: "Rahul Mehta", at: "2026-11-04T15:06:00.000Z", how: "facilitator" }, asAsked: true },
      finished: { by: { uid: "rahul", name: "Rahul Mehta" }, at: "2026-11-04T17:02:00.000Z" },
      approving: { line: "Daniel Kim: Absent to In the room", figures: true, emailed: 0, toldOn: "register" },
      reply: "",
      history: [{ what: "asked", by: { uid: "rahul", name: "Rahul Mehta" }, at: ASKED }],
      canDecide: true,
      canTake: true,
      yours: false,
    };
    const drawn = draw(RequestPage, { view });
    for (const said of [
      "Register correction: Group C, week 1",
      "Asked by Rahul Mehta, Tue 10 Nov, 9:40am",
      "Daniel Kim",
      "Absent",
      "In the room",
      "Rahul: “Daniel was there all session. I tapped the wrong line.”",
      "Finished by Rahul, Wed 4 Nov, 5:02pm.",
      "What will happen",
      "Changes the line on the spot and records who, when, from, to and why.",
      "Rahul, on the register. Nobody is emailed.",
      "Approve and correct",
      "Reply to Rahul (needed to decline)",
      "Decline",
      "Nobody has it yet.",
      "Take it",
      "Rahul Mehta asked for this",
    ]) {
      assert.ok(drawn.text.includes(said), `the request's page does not say "${said}": ${drawn.text}`);
    }
    const asker = draw(RequestPage, { view: { ...view, canDecide: false, yours: true } });
    assert.ok(!asker.text.includes("Approve and correct") && !asker.html.includes('data-testid="request-decline"'), "the person who asked is offered a decision");
    assert.ok(asker.text.includes("You asked for this, so somebody else decides it."));
    const changed = draw(RequestPage, { view: { ...view, line: { ...view.line, now: "Excused", asAsked: false } } });
    assert.ok(changed.text.includes("The line says Excused now, not Absent as it did when this was asked."), changed.text);
  });

  const COLUMNS = [1, 2].map((weekNumber) => ({
    weekNumber,
    sessionKey: `w0${weekNumber}`,
    dateKey: `2026-11-0${weekNumber + 3}`,
    held: true,
    started: true,
    ended: true,
    taken: true,
    finished: { name: "Rahul Mehta", at: "2026-11-04T17:02:00.000Z" },
    cover: null,
    corrected: weekNumber === 1 ? 1 : 0,
  }));
  const cell = (weekNumber, mark, extra = {}) => ({ weekNumber, state: "mark", mark, online: false, saved: false, corrected: false, saidInAdvance: false, ...extra });
  const ATTENDANCE = {
    groupId: "grpC",
    groupName: "Group C",
    viewer: "lead",
    columns: COLUMNS,
    people: [
      { uid: "daniel", name: "Daniel Kim", left: null, cells: [cell(1, "present", { corrected: true }), cell(2, "late", { online: true })], room: 1, online: 1 },
      { uid: "grace", name: "Grace Chen", left: null, cells: [cell(1, "excused"), cell(2, "absent")], room: 0, online: 0 },
    ],
    facilitators: [
      {
        uid: "rahul",
        name: "Rahul Mehta",
        presence: [
          { weekNumber: 1, state: "there", arrivedAt: null },
          { weekNumber: 2, state: "late", arrivedAt: "2026-11-05T16:40:00.000Z" },
        ],
        place: null,
      },
    ],
    notYetTold: false,
  };

  test("Attendance, all weeks: people by weeks in words, Corrected, the two counts, and the lead's correction", () => {
    const drawn = draw(AttendanceTab, { view: ATTENDANCE, runId: "run1", requestsBase: "/admin/admissions/requests" });
    for (const said of [
      "Leads and admins can correct any line of a finished week",
      "Week 1 · Wed 4 Nov",
      "Week 2 · Thu 5 Nov",
      "Daniel Kim",
      "In the room",
      "Corrected",
      "Arrived late, online",
      "Excused",
      "Absent",
      "Correct week 1’s whole column",
      "Facilitators",
      "There",
      "Arrived 4:40pm",
      "Admins and the programme’s lead only",
      "Facilitators don’t see this, and nor does anyone in the group.",
    ]) {
      assert.ok(drawn.text.includes(said), `the tab does not say "${said}": ${drawn.text}`);
    }
    assert.ok(drawn.html.includes('aria-label="Daniel Kim, week 1: In the room. Corrected. Correct this line."'), "a finished line does not open its correction");
  });

  test("a track lead is sent the facilitators without the record, and the tab says nothing about it", () => {
    const facilitators = ATTENDANCE.facilitators.map(({ presence: _gone, ...rest }) => rest);
    const drawn = draw(AttendanceTab, { view: { ...ATTENDANCE, facilitators }, runId: "run1", requestsBase: null });
    assert.ok(!drawn.text.includes("Arrived 4:40pm") && !drawn.text.includes("Admins and the programme’s lead only") && !drawn.text.includes("Facilitators don’t see this"), drawn.text);
    const none = draw(AttendanceTab, { view: { ...ATTENDANCE, facilitators: null }, runId: "run1", requestsBase: null });
    assert.ok(!none.html.includes('id="group-attendance-facilitators"'), "a reader sent no facilitators is drawn their row");
  });
});

// ---------------------------------------------------------------------------
// 3. The wiring
// ---------------------------------------------------------------------------

describe("3. the wiring", () => {
  test("the register changes a finished register only through a sheet that asks why", () => {
    const grid = read("src/features/courses/AttendanceGrid.tsx");
    // The one PATCH caller left is the session note, with its reason.
    const edits = [...grid.matchAll(/\bedit\(([^)]*)\)/g)].map((match) => match[1]);
    assert.deepEqual(edits, ["session, [], { notes: text }, reason"], `the grid patches a finished register another way: ${edits.join(" | ")}`);
    assert.equal((grid.match(/if \(session\.pushedAt\) return;/g) ?? []).length, 3, "a tap, the place or the held switch reaches a finished register");
    assert.match(grid, /\{!corrects && !pushed && !session\.held && \(/, "the old switch is offered on a finished column");
    const hook = read("src/features/courses/useAttendance.ts");
    assert.match(hook, /\.\.\.\(patch\?\.notes !== undefined \? \{ notes: patch\.notes \} : \{\}\),\n\s+reason,/);
    assert.doesNotMatch(hook.slice(hook.indexOf("const edit = useCallback")), /held: patch\.held/, "a correction sends the held switch");
    const api = read("src/features/courses/registerCorrection/api.ts");
    assert.match(api, /reason: input\.reason,\n\s+\}\);\n\}/, "a line's correction is sent without its reason");
  });

  test("the column's sheet: It did happen starts each person from their line, push back is not offered once the session has a check-in or a report, and a week's second session is offered neither", () => {
    const sheet = read("src/features/courses/registerCorrection/ColumnSheet.tsx");
    assert.match(sheet, /const chosenFor = \(person: \{ uid: string; line: string \}\): string \| null => lines\[person\.uid\] \?\? P\.choiceOfLine\(person\.line\)\?\.key \?\? null;/);
    assert.match(sheet, /\{P\.didHappenNowWords\(each\.line\)\}/, "the sheet does not show each person's line");
    assert.match(sheet, /\{P\.didHappenChoicesFor\(each\.line\)\.map\(\(choice\) =>/);
    assert.match(sheet, /checked=\{chosenFor\(each\) === choice\.key\}/, "a person does not start from their line");
    assert.doesNotMatch(sheet, /DID_HAPPEN_CHOICES\.map/);
    // Push back: worked out from the preview's own check-in and report, disabled with the one-week change's hint.
    assert.match(sheet, /const pushBlocked = Boolean\(made && \(made\.checkIn \|\| made\.reports > 0\)\);/);
    assert.match(sheet, /disabled=\{busy \|\| \(value === "push" && !pushOffered\)\}/);
    assert.match(sheet, /\{value === "push" && pushBlocked && <span className=\{styles\.choiceLine\}>\{pushHasRecordsHint\(session\.weekNumber\)\}<\/span>\}/);
    assert.match(sheet, /pace: pace \?\? "keep", dateKey: session\.dateKey/, "the sheet does not ask before a pace is chosen");
    // A week's second session: It didn't happen is not offered, nor It did happen.
    assert.match(sheet, /P\.COLUMN_WAYS\.filter\(\(each\) => each\.way !== "did-not-happen" \|\| session\.occurrence === 1\)/);
    assert.match(sheet, /const kind: P\.ColumnWay \| "did-happen" \| null = happened \? way : firstSession \? "did-happen" : null;/);
    assert.match(read("src/features/courses/AttendanceGrid.tsx"), /\{corrects && \(session\.held \? pushed : session\.occurrence === 1\) && \(/);
    assert.match(
      read("src/features/courses/groupPage/AttendanceTab.tsx"),
      /\{corrects && column\.started && \(column\.held \? Boolean\(column\.finished\) : occurrenceOf\(column\.sessionKey\) === 1\) && \(/,
    );
  });

  test("the Attendance tab is handed to admins and the programme's lead only, never on a facilitator's own page", () => {
    const page = read("src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/page.tsx");
    assert.match(page, /attendance=\{attendance\.status === "ok" && attendance\.view\.viewer !== "facilitator" \? attendance\.view : null\}/);
    const facilitatorPage = read("src/app/(app)/learn/[runId]/group/[groupId]/page.tsx");
    assert.doesNotMatch(facilitatorPage, /loadGroupAttendance|AttendanceTab/, "a facilitator's own group page draws the Attendance tab");
  });

  test("the Requests pages sit behind the admissions tree's gate, which admits a programme's lead, and Home asks only for those it admits", () => {
    for (const file of ["src/app/(app)/admin/admissions/requests/page.tsx", "src/app/(app)/admin/admissions/requests/[requestId]/page.tsx"]) {
      assert.match(read(file), /requireAdmissionsPage\(\)/, `${file} does not restate the tree's gate`);
    }
    assert.match(read("src/lib/courses/requests/paths.ts"), /export const REQUESTS_PATH = "\/admin\/admissions\/requests";/);
    const home = read("src/lib/courses/requests/home.ts");
    assert.match(home, /canAuthorAdmissionRound\(user\) \|\| \(user\.admissionsReviewer === true && holdsStanding\(user, "admissionRounds\.reviewerUids"\)\)/);
    const gate = read("src/lib/firebase/pageGates.ts");
    assert.match(gate, /canAuthorAdmissionRound\(user\) \|\| namedReviewer/, "the tree's gate changed: Home's predicate must follow it");
    assert.match(read("src/app/(app)/dashboard/page.tsx"), /user && db && !viewingAs \? requestsWaitingFor\(db, user, now\) : NO_REQUESTS_WAITING,/);
    assert.match(read("src/lib/courses/requests/home.ts"), /export const NO_REQUESTS_WAITING: RequestsWaiting = \{ count: 0, excused: 0 \};/);
    const nav = read("src/layout/appNav.ts");
    assert.match(nav, /\{ label: "Requests", href: "\/admin\/admissions\/requests", match: under\("\/admin\/admissions\/requests"\), visible: ADMISSIONS, ownHead: true \}/);
  });

  test("every new stylesheet ends with its phone block, and its controls are 44px", () => {
    for (const file of [
      "src/features/courses/registerCorrection/CorrectionSheets.module.css",
      "src/features/courses/requests/Requests.module.css",
      "src/features/courses/groupPage/AttendanceTab.module.css",
    ]) {
      const css = read(file);
      const last = css.lastIndexOf("@media (max-width:");
      assert.ok(last > 0, `${file} has no phone block`);
      const tail = css.slice(last);
      let depth = 0;
      let end = -1;
      for (let i = 0; i < tail.length; i += 1) {
        if (tail[i] === "{") depth += 1;
        if (tail[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      assert.equal(tail.slice(end + 1).trim(), "", `${file} does not end with its phone block`);
      for (const [, name, body] of css.matchAll(/\.(choice|button|tab|open|cellButton|cellText|headButton|select|tick|link)\s*\{([^}]*)\}/g)) {
        assert.match(body, /min-height: 2\.75rem/, `${file} .${name} is under 44px`);
      }
      assert.doesNotMatch(css, /--color-text-subtle/, `${file} sets text in the subtle colour`);
    }
  });
});
