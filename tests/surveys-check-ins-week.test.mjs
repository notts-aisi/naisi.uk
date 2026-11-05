/**
 * THIS WEEK'S CHECK-INS, FOR ADMINS, AND THE TWO REMINDERS (docs/surveys.md,
 * "Check-ins at the end of a session").
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE TABLE, an admin's alone, above the weeks on the programme's
 *     Check-ins view: a row for each group's session in the week the run is
 *     in (or one chosen with `?week=`), its register (not taken, being taken,
 *     finished, didn't happen), its check-in (not opened, open until when,
 *     closed) and how many answered of how many it reached, with what an
 *     admin can do: open it for the people the register marks there (late
 *     once its window has passed, until 48 hours after the session ended),
 *     take the register first when nobody is, close it now, and remind the
 *     group's facilitators. The programme's lead never has it, and nothing on
 *     it names anybody.
 *  2. REMIND, the route behind it, as every kind of caller: an admin's alone,
 *     the number on the button the number emailed, what is left to do (the
 *     register, or the check-in while its facilitators can still open it),
 *     once a session a London day, a failed send giving the day back, and the
 *     facilitators' email itself: transactional, the way to the register, no
 *     answer and no meeting link.
 *  3. THE REMINDER THE MORNING AFTER (`surveys-check-in-reminders`, switched
 *     off until somebody switches it on): at 9am the day after a session, one
 *     notice to each person an open check-in reached who has not sent it,
 *     whose seat is still live; once each; never for a check-in opened the
 *     next morning or late; stale past its twelve hours; and each person's row
 *     stamped with when they were reminded.
 *  4. WHO READS THE TABLE: every file under `src` that reads it or presses
 *     its reminder, listed with why, both ways.
 *
 * The world is `tests/lib/registerWorld.mjs`: AGI Strategy's run in its
 * second week. Group A meets on Mondays 6pm to 8pm (Amelia facilitates, Ana
 * is in it), Group B on Tuesdays 6pm to 8pm (Rahul and Sofia facilitate;
 * Amara, Chloe and Farah are in it). Claudia leads the programme, Zach is the
 * admin. The mail door writes down what it was handed, and every message is
 * rendered to text with the real template.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { AGI, GROUP, ROUND, RUN, jobContext, makeWorld } from "./lib/registerWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

/** Every stylesheet a module imports, as its own class names, so a page can be drawn. */
const STYLESHEETS = (() => {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found].map((specifier) => [specifier, "export default new Proxy({}, { get: (_, name) => String(name) });"]);
})();

// The link stub draws with the suite's own React, handed over on a handle.
globalThis.__checkInsWeekUi = { h: createElement };
const made = makeWorld("__checkInsWeek", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {}, back() {} }; }\n" +
      "export function usePathname() { return '/admin'; }\n" +
      "export function useSearchParams() { return new URLSearchParams(); }",
  ],
  [
    "next/link",
    "export default ({ href, className, children, prefetch, scroll, ...rest }) => globalThis.__checkInsWeekUi.h('a', { href, className, ...rest }, children);",
  ],
  ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
  // The page gates read the session by a relative path.
  ["./session", "export async function getCurrentUser() { return globalThis.__checkInsWeek.user; }"],
  ...STYLESHEETS,
]);
const { world, reset, call, courseRoute, lib, loadTs, sessionOf } = made;

const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const CheckInsPage = (await loadTs(join(TABS, "surveys", "check-ins", "page.tsx"))).default;
const checkIn = await courseRoute("groups", "[groupId]", "check-in");
const closeRoute = await courseRoute("groups", "[groupId]", "check-in", "close");
const register = await courseRoute("groups", "[groupId]", "attendance");
const remindRoute = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "check-ins", "remind", "route.ts"));
const answerByLink = await loadTs(join("app", "api", "surveys", "answer", "route.ts"));
const { surveyCheckInRemindersJob } = await lib("scheduler", "jobs", "surveyCheckInReminders.ts");
const registry = await lib("scheduler", "registry.ts");
const words = await lib("surveys", "checkIns", "words.ts");
const { checkInSurveyId } = await lib("surveys", "checkIns", "ids.ts");
const remindLib = await lib("surveys", "checkIns", "remind.ts");
const nudgeLib = await lib("surveys", "checkIns", "nudge.ts");
const surveys = await lib("firestore", "surveys.ts");
const weekTable = await lib("surveys", "checkIns", "weekTable.ts");
const attendance = await lib("courses", "programmeAttendance.ts");
const { THIS_WEEK_WORDS } = words;

/** Tuesday 27 October 2026, 7:50pm GMT: the last ten minutes of Group B's week 2 session; Group A met last night. */
const DURING = new Date("2026-10-27T19:50:00Z");
/** Wednesday 28 October, 10am GMT: the morning after B's session; A's window closed at 11pm last night. */
const WEDNESDAY = new Date("2026-10-28T10:00:00Z");
/** Thursday 29 October, 10am GMT: more than 48 hours after A's session ended (Mon 8pm). */
const THURSDAY = new Date("2026-10-29T10:00:00Z");

mock.timers.enable({ apis: ["Date"], now: DURING });
const at = (instant) => mock.timers.setTime(new Date(instant).getTime());

const A = GROUP.a;
const B = GROUP.b;
const read = (path) => world.db.read(path);

beforeEach(() => {
  at(DURING);
  reset();
});

/** The words of a page: markup gone, entities read, space folded. */
function textOf(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** A message as its reader sees it: the real template, rendered to text. */
async function mailText(message) {
  return (await render(message.react, { plainText: true })).replace(/\s+/g, " ");
}

/** The Check-ins view as `who` draws it, its words, or where it sent them. */
async function draw(who, query = {}) {
  const base = sessionOf(who);
  // The lead is appointed on the form, which the admissions tree admits by the flag the roles writer keeps.
  world.user = base && who === "claudia" ? { ...base, admissionsReviewer: true } : base;
  try {
    const html = renderToStaticMarkup(await CheckInsPage({ params: Promise.resolve({ roundId: ROUND, programmeId: AGI }), searchParams: Promise.resolve(query) }));
    return { html, text: textOf(html), to: null };
  } catch (err) {
    if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to };
    throw err;
  }
}

/** A group's register of week 2, as `who` taps it in. */
async function mark(groupId, marks, who) {
  const response = await call(who, register.POST, { groupId }, { body: { weekNumber: 2, marks: Object.entries(marks).map(([uid, status]) => ({ uid, status })) } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}

const remind = (who, body, options = {}) => call(who, remindRoute.POST, { roundId: ROUND, programmeId: AGI }, { body, ...options });

/** The table's one row for a group, from an admin's page, as words. */
function rowText(page, groupName) {
  const start = page.text.indexOf(`${groupName} `, page.text.indexOf(THIS_WEEK_WORDS.lede));
  assert.ok(start >= 0, `no row for ${groupName}: ${page.text.slice(0, 900)}`);
  const ends = [page.text.indexOf(" Group ", start + groupName.length), page.text.indexOf(words.checkInsTabLine(3, 5), start)].filter((i) => i > 0);
  return page.text.slice(start, Math.min(...ends)).trim();
}

// ---------------------------------------------------------------------------
// 1. The table
// ---------------------------------------------------------------------------

describe("1. this week's check-ins: an admin's table, never the lead's", () => {
  test("an admin has a row for each group's session this week, its register, its check-in and what can be done; the lead has none of it", async () => {
    await mark(B, { amara: "present", chloe: "late", farah: "left-early" }, "rahul");
    const admin = await draw("zach");
    assert.equal(admin.to, null);
    assert.ok(admin.text.includes(`${THIS_WEEK_WORDS.title} ${THIS_WEEK_WORDS.lede}`), admin.text.slice(0, 600));
    // Group A met last night: nobody marked, its register not taken, its check-in not opened, and its facilitator can still open it.
    assert.equal(
      rowText(admin, "Group A"),
      `Group A Mon 26 Oct, 6pm ${THIS_WEEK_WORDS.notTaken} ${THIS_WEEK_WORDS.notOpened} ${THIS_WEEK_WORDS.takeRegisterFirst} ${THIS_WEEK_WORDS.openRegister} Remind 1 facilitator`,
    );
    assert.ok(admin.html.includes(`href="/learn/${RUN}/group/${A}/register"`), "the way to the register");
    // Group B is meeting now: its register is being taken, and its check-in can be opened for the three marked there.
    assert.equal(rowText(admin, "Group B"), `Group B Tue 27 Oct, 6pm ${THIS_WEEK_WORDS.beingTaken} ${THIS_WEEK_WORDS.notOpened} Open it for 3 people`);
    // The lead reads the weeks, never a group's session.
    const lead = await draw("claudia");
    assert.equal(lead.to, null);
    for (const said of [THIS_WEEK_WORDS.title, THIS_WEEK_WORDS.lede, "Group A", "Group B", "Open it for", "Remind 1"]) {
      assert.ok(!lead.text.includes(said), `the lead is shown ${said}`);
    }
    assert.ok(!lead.html.includes("/check-ins/remind") && !lead.html.includes("/register"));
    // Nobody else reaches the page at all.
    for (const who of ["rahul", "amara", "nell"]) assert.equal((await draw(who)).to, "/dashboard", who);
  });

  test("it names nobody, and holds no uid, address, link of anybody's or answer", async () => {
    await mark(B, { amara: "present", chloe: "present", farah: "present" }, "rahul");
    assert.equal((await call("rahul", checkIn.POST, { groupId: B }, { body: { session: "w02", people: 3 } })).status, 200);
    const token = read(`surveyPeople/${checkInSurveyId(RUN, B, "w02")}__amara`).token;
    assert.equal((await call(null, answerByLink.POST, {}, { body: { token, answers: ANSWERS } })).status, 200);
    const admin = await draw("zach");
    for (const said of ["amara", "chloe", "farah", "rahul", "sofia", "amelia", "Amara", "Chloe", "Farah", "Rahul", "Sofia", "Amelia", "example.com", token, "compute thresholds"]) {
      assert.ok(!admin.html.includes(said), `the table holds ${said}`);
    }
    assert.doesNotMatch(admin.text, /\b(?:ana|Ana)\b/, "the table names Ana");
  });

  test("open, then closed: until when it is open, how many answered of how many it reached, and Close it now", async () => {
    await mark(B, { amara: "present", chloe: "present", farah: "present" }, "rahul");
    const opened = await call("zach", checkIn.POST, { groupId: B }, { body: { session: "w02", people: 3 } });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    const token = read(`surveyPeople/${checkInSurveyId(RUN, B, "w02")}__amara`).token;
    assert.equal((await call(null, answerByLink.POST, {}, { body: { token, answers: ANSWERS } })).status, 200);
    let row = rowText(await draw("zach"), "Group B");
    assert.equal(row, `Group B Tue 27 Oct, 6pm ${THIS_WEEK_WORDS.beingTaken} Open until Wed 28 Oct, 11pm 1 of 3 ${THIS_WEEK_WORDS.closeNow}`);
    assert.equal((await call("zach", closeRoute.POST, { groupId: B }, { body: { session: "w02" } })).status, 200);
    row = rowText(await draw("zach"), "Group B");
    assert.equal(row, `Group B Tue 27 Oct, 6pm ${THIS_WEEK_WORDS.beingTaken} ${THIS_WEEK_WORDS.closed} 1 of 3`);
  });

  test("past its window an admin opens it late, saying until when; and 48 hours after the session ended, nobody can", async () => {
    await mark(A, { ana: "present" }, "amelia");
    at(WEDNESDAY);
    const page = await draw("zach");
    assert.equal(
      rowText(page, "Group A"),
      `Group A Mon 26 Oct, 6pm ${THIS_WEEK_WORDS.beingTaken} ${THIS_WEEK_WORDS.notOpened} Open it late for 1 person It stays open until 11pm on Thu 29 Oct. Remind 1 facilitator`,
    );
    // The press the button makes, and the question it asks first.
    const table = await weekTable.readWeekTable(world.db, { records: await attendance.readRunRecords(world.db, RUN), weekNumber: null, now: new Date() });
    const row = table.rows.find((each) => each.groupId === A);
    assert.deepEqual(row.open, {
      late: true,
      people: 1,
      label: "Open it late for 1 person",
      confirm: "Open the check-in late for the 1 person the register marks there? Each is emailed their own link, and it closes at 11pm on Thu 29 Oct.",
      closes: "It stays open until 11pm on Thu 29 Oct.",
    });
    // In the register's own word for ending it, as its email says it: the push still sends the week's email here.
    assert.deepEqual(row.remind, { emails: 1, label: "Remind 1 facilitator", confirm: "Email Group A’s facilitator that its register isn’t pushed? Each gets one email with the way to the register." });
    const opened = await call("zach", checkIn.POST, { groupId: A }, { body: { session: "w02", people: 1, late: true } });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.equal(read(`surveys/${checkInSurveyId(RUN, A, "w02")}`).closesAt.toISOString(), "2026-10-29T23:00:00.000Z");
    assert.equal(rowText(await draw("zach"), "Group A"), `Group A Mon 26 Oct, 6pm ${THIS_WEEK_WORDS.beingTaken} Open until Thu 29 Oct, 11pm 0 of 1 ${THIS_WEEK_WORDS.closeNow} Remind 1 facilitator`);
    // Another week's session with none: too late, 48 hours on.
    reset();
    await mark(A, { ana: "present" }, "amelia");
    at(THURSDAY);
    const later = await draw("zach", { week: "2" });
    assert.ok(rowText(later, "Group A").includes(THIS_WEEK_WORDS.tooLate), rowText(later, "Group A"));
    assert.ok(!later.html.includes("Open it late"));
  });

  test("a week is chosen with ?week=, its own title, and the week the run is in by default", async () => {
    const now = await draw("zach");
    assert.ok(now.text.includes(THIS_WEEK_WORDS.title));
    assert.ok(now.html.includes('aria-current="page" aria-label="Week 2"'), "the week on screen is not marked as current");
    assert.ok(now.html.includes(`?week=1"`) && now.html.includes(`?week=6"`), "the weeks to choose from are not every week of the run");
    const first = await draw("zach", { week: "1" });
    assert.ok(first.text.includes("Week 1’s check-ins"), first.text.slice(0, 400));
    assert.ok(rowText(first, "Group A").startsWith("Group A Mon 19 Oct, 6pm"), rowText(first, "Group A"));
    // A week the run does not have is the week it is in.
    assert.ok((await draw("zach", { week: "40" })).text.includes(THIS_WEEK_WORDS.title));
    // A week to come offers nothing yet.
    const third = await draw("zach", { week: "3" });
    assert.ok(rowText(third, "Group B").includes(THIS_WEEK_WORDS.notYet), rowText(third, "Group B"));
  });

  test("drawing it writes nothing", async () => {
    await mark(B, { amara: "present" }, "rahul");
    const before = JSON.stringify(world.db.paths().map((path) => [path, read(path)]));
    await draw("zach");
    await draw("zach", { week: "1" });
    assert.equal(JSON.stringify(world.db.paths().map((path) => [path, read(path)])), before);
  });
});

/** Every required question of a check-in answered, as the form sends it. */
const ANSWERS = {
  q_ci_useful: { type: "rating", value: 4 },
  q_ci_most: { type: "text", text: "The part on compute thresholds" },
  q_ci_unclear: { type: "choices", optionIds: ["o_ci_nothing"] },
  q_ci_reading: { type: "choice", optionId: "o_ci_read_most" },
  q_ci_confident: { type: "rating", value: 3 },
};

// ---------------------------------------------------------------------------
// 2. Remind
// ---------------------------------------------------------------------------

describe("2. remind the facilitators: an admin's alone, the number on the button, once a session a day", () => {
  const body = { groupId: A, sessionKey: "w02", emails: 1 };

  test("as every kind of caller: signed out, view-as, an empty body, the lead, a facilitator and a member are refused before anything is sent", async () => {
    assert.equal((await remind(null, body)).status, 401);
    assert.equal((await remind("zach", body, { viewAs: true })).status, 403, "view-as is refused first");
    assert.equal((await remind("zach", {})).status, 400);
    assert.equal((await remind("zach", { ...body, emails: 0 })).status, 400);
    const lead = await remind("claudia", body);
    assert.deepEqual([lead.status, lead.body.error], [403, "Only an admin can remind a group’s facilitators from here."]);
    for (const who of ["amelia", "rahul", "amara", "nell"]) {
      const refused = await remind(who, body);
      assert.deepEqual([refused.status, refused.body.error], [404, "There is no programme here."], who);
    }
    assert.equal(world.mail.length, 0);
    assert.deepEqual(world.db.paths().filter((path) => path.startsWith("courseNudges/cinudge__")), []);
  });

  test("Zach reminds Group A's one facilitator: one email, transactional, with what is not done and the way to the register; nothing of anybody's answers", async () => {
    const response = await remind("zach", body);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { emailed: 1, failed: 0 });
    assert.deepEqual(world.mail.map((message) => [message.to, message.kind, message.surface ?? null]), [["amelia@example.com", "course-facilitator", null]]);
    const [message] = world.mail;
    assert.equal(message.subject, "Group A’s register and check-in aren’t done");
    const text = await mailText(message);
    for (const said of [
      "Hi Amelia,",
      "The register and the check-in for Group A’s session on Mon 26 Oct aren’t done yet.",
      "Take the register, then open the check-in from it before 11pm on Tue 27 Oct, so the people who were there can say how the session went.",
      "Open the register",
      `https://naisi.invalid/learn/${RUN}/group/${A}/register`,
      "Zach For NAISI",
    ]) {
      assert.ok(text.includes(said), `the email does not say: ${said}\n${text}`);
    }
    assert.ok(!/Sent as an important notice|unsubscribe|meet\.|zoom|teams\.microsoft/i.test(text), "the reminder carries a notice line, an unsubscribe or a meeting link");
    // The day's marker: the session, who pressed and when, never a facilitator or an address.
    const marker = read(`courseNudges/cinudge__${RUN}__${A}__w02__2026-10-27`);
    assert.ok(marker);
    assert.deepEqual(
      Object.keys(marker).sort(),
      ["byUid", "claimedAt", "dateKey", "emailed", "groupId", "kind", "runId", "sessionKey", "settledAt", "state"],
    );
    assert.deepEqual([marker.kind, marker.runId, marker.byUid, marker.state, marker.emailed], ["check-in-nudge", RUN, "zach", "sent", 1]);
    assert.ok(!JSON.stringify(marker).includes("amelia"));
  });

  test("once a session a London day: a second press is refused, the table says when; the next day, again, about what is left", async () => {
    assert.equal((await remind("zach", body)).status, 200);
    const again = await remind("zach", body);
    assert.deepEqual([again.status, again.body.error], [409, "This session’s facilitators have been reminded today already. Reload the page to see when."]);
    assert.equal(world.mail.length, 1);
    assert.ok(rowText(await draw("zach"), "Group A").endsWith("Facilitators reminded today at 7:50pm."));
    // Wednesday: A's check-in can no longer be opened by its facilitator, so only the register is left.
    at(WEDNESDAY);
    const wednesday = await remind("zach", body);
    assert.equal(wednesday.status, 200, JSON.stringify(wednesday.body));
    assert.equal(world.mail[1].subject, "Group A’s register isn’t pushed");
    const text = await mailText(world.mail[1]);
    assert.ok(text.includes("The register for Group A’s session on Mon 26 Oct isn’t pushed yet."), text);
    assert.ok(text.includes("Push it from the register, so everybody’s attendance is right."), text);
    assert.ok(!text.includes("check-in"), "the reminder asks for a check-in its facilitator can no longer open");
  });

  test("the number on the button is the number emailed: a moved count is refused with the new one", async () => {
    const moved = await remind("zach", { ...body, emails: 2 });
    assert.deepEqual([moved.status, moved.body.error], [409, "Nothing was sent: the reminder now emails 1 person. Reload the page and press again."]);
    // A facilitator on the do-not-email list is never counted.
    world.db.seed("suppressedEmails/amelia@example.com", { email: "amelia@example.com", reason: "bounce" });
    const nobody = await remind("zach", body);
    assert.equal(nobody.status, 409, JSON.stringify(nobody.body));
    assert.equal(world.mail.length, 0);
  });

  test("nothing left to do, a session to come, a group not the programme's: refused in a sentence", async () => {
    // Group B is meeting now: its session has not ended.
    const early = await remind("zach", { groupId: B, sessionKey: "w02", emails: 2 });
    assert.deepEqual([early.status, early.body.error], [409, "There’s nothing left for this group’s facilitators to do about that session."]);
    const other = await remind("zach", { groupId: GROUP.other, sessionKey: "w02", emails: 1 });
    assert.deepEqual([other.status, other.body.error], [404, "That group isn’t one of this programme’s groups that still meet."]);
    const noSession = await remind("zach", { groupId: A, sessionKey: "w09", emails: 1 });
    assert.equal(noSession.status, 404);
    // Its register marked and pushed, and its check-in opened by Amelia: nothing left.
    await mark(A, { ana: "present" }, "amelia");
    world.db.poke(`courseAttendance/${RUN}__${A}__w02`, { pushedAt: new Date("2026-10-26T20:05:00Z") });
    assert.equal((await call("amelia", checkIn.POST, { groupId: A }, { body: { session: "w02", people: 1 } })).status, 200);
    world.mail.length = 0;
    const done = await remind("zach", body);
    assert.deepEqual([done.status, done.body.error], [409, "There’s nothing left for this group’s facilitators to do about that session."]);
    assert.equal(world.mail.length, 0);
  });

  test("a press whose every send fails gives the day back, so a later press can try again", async (t) => {
    t.mock.method(console, "error", () => {});
    world.mailFails = () => true;
    const failed = await remind("zach", body);
    assert.equal(failed.status, 502, JSON.stringify(failed.body));
    assert.equal(read(`courseNudges/cinudge__${RUN}__${A}__w02__2026-10-27`), undefined, "a failed press kept the day");
    world.mailFails = null;
    assert.equal((await remind("zach", body)).status, 200);
    assert.equal(world.mail.length, 1);
  });

  test("what is left, worked out once: the register, and the check-in only while its facilitators can open it", () => {
    const window = { opensAt: new Date("2026-10-26T18:00:00Z"), closesAt: new Date("2026-10-27T23:00:00Z"), lateUntil: new Date("2026-10-28T20:00:00Z") };
    const of = (facts, now) => nudgeLib.nudgeNeedOf({ held: true, ended: true, finished: false, hasCheckIn: false, window, ...facts }, new Date(now));
    assert.deepEqual(of({}, "2026-10-27T10:00:00Z"), { register: true, checkIn: true, checkInClosesAt: window.closesAt });
    assert.deepEqual(of({ finished: true }, "2026-10-27T10:00:00Z"), { register: false, checkIn: true, checkInClosesAt: window.closesAt });
    assert.deepEqual(of({}, "2026-10-28T10:00:00Z"), { register: true, checkIn: false, checkInClosesAt: null });
    assert.equal(of({ finished: true }, "2026-10-28T10:00:00Z"), null, "past the window an admin opens it late, and nobody is asked to");
    assert.equal(of({ finished: true, hasCheckIn: true }, "2026-10-27T10:00:00Z"), null);
    assert.equal(of({ held: false }, "2026-10-27T10:00:00Z"), null, "a session that didn't happen needs nothing");
    assert.equal(of({ ended: false }, "2026-10-26T19:00:00Z"), null, "a session still under way is not chased");
    assert.equal(nudgeLib.nudgeMarkerId(RUN, A, "w02", "2026-10-27"), `cinudge__${RUN}__${A}__w02__2026-10-27`);
  });
});

// ---------------------------------------------------------------------------
// 3. The reminder the morning after
// ---------------------------------------------------------------------------

describe("3. the check-in's one reminder, at 9am the day after its session", () => {
  const ID = checkInSurveyId(RUN, B, "w02");
  const rowOf = (uid) => read(`surveyPeople/${ID}__${uid}`);
  const tick = async (now) => {
    at(now);
    const { ctx } = jobContext(surveyCheckInRemindersJob, new Date(now));
    return surveyCheckInRemindersJob.handler(ctx);
  };
  /** Group B's check-in, opened in the session's last ten minutes for the three marked there, and Amara's answer. */
  async function opened() {
    await mark(B, { amara: "present", chloe: "present", farah: "late" }, "rahul");
    assert.equal((await call("rahul", checkIn.POST, { groupId: B }, { body: { session: "w02", people: 3 } })).status, 200);
    assert.equal((await call(null, answerByLink.POST, {}, { body: { token: rowOf("amara").token, answers: ANSWERS } })).status, 200);
    world.mail.length = 0;
  }

  test("it registers switched off, beside the jobs that email people", () => {
    assert.equal(surveyCheckInRemindersJob.id, "surveys-check-in-reminders");
    assert.equal(surveyCheckInRemindersJob.enabledByDefault, false);
    assert.equal(registry.jobDefaultEnabled(surveyCheckInRemindersJob), false);
    assert.ok(registry.JOBS.includes(surveyCheckInRemindersJob));
    assert.ok(registry.SCHEDULER_JOB_IDS.includes("surveys-check-in-reminders"));
    assert.equal(surveyCheckInRemindersJob.maxLateHours, 12);
    assert.doesNotMatch(`${surveyCheckInRemindersJob.label} ${surveyCheckInRemindersJob.description}`, /[–—]/);
  });

  test("at 9am, one notice to each person it reached who has not sent it, with their own link; their rows stamped; once", async () => {
    await opened();
    assert.equal((await tick("2026-10-28T08:59:00Z")).processed, 0, "before 9am");
    assert.equal(world.mail.length, 0);
    const result = await tick("2026-10-28T09:00:00Z");
    assert.equal(result.processed, 2, JSON.stringify(result));
    assert.deepEqual(world.mail.map((message) => [message.to, message.kind, message.surface]).sort(), [
      ["chloe@example.com", "notice", "course-check-in-reminder"],
      ["farah@example.com", "notice", "course-check-in-reminder"],
    ]);
    const chloe = world.mail.find((message) => message.to === "chloe@example.com");
    assert.equal(chloe.subject, "A reminder: the check-in for AGI Strategy, by 11pm on Wed 28 Oct");
    const text = await mailText(chloe);
    for (const said of [
      "Sent as an important notice",
      "You are getting this because you were at this session of your course group and haven’t sent its check-in, so it reaches you whatever your notification settings say, and it is never marketing.",
      "Group B, Tue 27 Oct, 6pm. You haven’t sent the check-in for this session yet. It’s 6 questions and takes about 2 minutes.",
      "It’s confidential: only NAISI’s admins can see who said what. Your facilitators see your group’s totals, never your answers.",
      "It closes at 11pm on Wed 28 Oct.",
      "Answer the check-in",
      `https://naisi.invalid/survey/${rowOf("chloe").token}`,
    ]) {
      assert.ok(text.includes(said), `the reminder does not say: ${said}\n${text}`);
    }
    assert.ok(!text.includes(rowOf("farah").token), "somebody's reminder carries another person's link");
    assert.ok(!/\b(?:mark(?:s|ed)?|grades?|scores?)\b/i.test(text), "the reminder speaks of a mark, a grade or a score");
    for (const uid of ["chloe", "farah"]) {
      assert.ok(rowOf(uid).remindedAt instanceof Date, uid);
      assert.equal(rowOf(uid).reminders, 1, uid);
      assert.ok(read(`schedulerMarkers/ciremind__${B}__w02__${uid}`).sentAt instanceof Date, uid);
    }
    assert.equal(rowOf("amara").reminders, 0, "somebody who sent it was reminded");
    assert.equal(read(`schedulerMarkers/ciremind__${B}__w02__amara`), undefined);
    // A later tick, and two at once, send nothing more.
    assert.equal((await tick("2026-10-28T09:15:00Z")).processed, 0);
    await Promise.all([tick("2026-10-28T09:30:00Z"), tick("2026-10-28T09:30:00Z")]);
    assert.equal(world.mail.length, 2);
    // The reminder is not a send: the check-in still reached three.
    assert.deepEqual(read(`surveys/${ID}`).presses.map((press) => [press.kind, press.count]), [["first", 3]]);
  });

  test("somebody who sends it first, or whose seat on the run is gone, is stamped with why and sent nothing", async () => {
    await opened();
    // Chloe answers at breakfast; Farah's place is withdrawn overnight.
    at("2026-10-28T08:00:00Z");
    assert.equal((await call(null, answerByLink.POST, {}, { body: { token: rowOf("chloe").token, answers: ANSWERS } })).status, 200);
    world.db.poke(`courseEnrolments/${RUN}__farah`, { status: "withdrawn" });
    assert.equal((await tick("2026-10-28T09:00:00Z")).processed, 0);
    assert.equal(world.mail.length, 0);
    assert.equal(read(`schedulerMarkers/ciremind__${B}__w02__chloe`), undefined, "somebody who answered is not looked at");
    assert.equal(read(`schedulerMarkers/ciremind__${B}__w02__farah`).skippedReason, "left");
  });

  test("never for a check-in closed by hand, one opened the morning after, or one an admin opened late", async () => {
    await opened();
    assert.equal((await call("rahul", closeRoute.POST, { groupId: B }, { body: { session: "w02" } })).status, 200);
    assert.equal((await tick("2026-10-28T09:00:00Z")).processed, 0);
    // Opened the morning after: its own email is the morning's.
    reset();
    await mark(B, { chloe: "present" }, "rahul");
    at("2026-10-28T08:30:00Z");
    assert.equal((await call("rahul", checkIn.POST, { groupId: B }, { body: { session: "w02", people: 1 } })).status, 200);
    world.mail.length = 0;
    assert.equal((await tick("2026-10-28T09:00:00Z")).processed, 0);
    assert.equal(remindLib.reminderDueAt(surveys.normalizeSurvey(ID, read(`surveys/${ID}`))), null);
    // Opened late by an admin.
    reset();
    await mark(A, { ana: "present" }, "amelia");
    at(WEDNESDAY);
    assert.equal((await call("zach", checkIn.POST, { groupId: A }, { body: { session: "w02", people: 1, late: true } })).status, 200);
    world.mail.length = 0;
    assert.equal((await tick("2026-10-29T09:00:00Z")).processed, 0);
    assert.equal(world.mail.length, 0);
  });

  test("twelve hours late it is stale: stamped, and nobody emailed; and the switch that ships off", async () => {
    await opened();
    const result = await tick("2026-10-28T21:01:00Z");
    assert.equal(result.processed, 0);
    assert.equal(world.mail.length, 0);
    for (const uid of ["chloe", "farah"]) assert.equal(read(`schedulerMarkers/ciremind__${B}__w02__${uid}`).skippedReason, "stale", uid);
  });

  test("due at 9am the day after its session's London day, for one opened that day", async () => {
    await opened();
    const survey = surveys.normalizeSurvey(ID, read(`surveys/${ID}`));
    assert.equal(remindLib.reminderDueAt(survey).toISOString(), "2026-10-28T09:00:00.000Z");
    // A 9:30 to 11:30pm session opened at 11:20pm: still its own day, still the next morning.
    const lateNight = { ...survey, checkIn: { ...survey.checkIn, startsAt: new Date("2026-10-27T21:30:00Z") }, presses: [{ ...survey.presses[0], at: new Date("2026-10-27T23:20:00Z") }] };
    assert.equal(remindLib.reminderDueAt(lateNight).toISOString(), "2026-10-28T09:00:00.000Z");
    // British summer time: 9am in London is 8am in UTC.
    const summer = { ...survey, checkIn: { ...survey.checkIn, startsAt: new Date("2026-10-20T17:00:00Z") }, presses: [{ ...survey.presses[0], at: new Date("2026-10-20T18:50:00Z") }] };
    assert.equal(remindLib.reminderDueAt(summer).toISOString(), "2026-10-21T08:00:00.000Z");
    assert.equal(remindLib.REMINDER_CLOCK, "09:00");
  });
});

// ---------------------------------------------------------------------------
// 4. Who reads the table
// ---------------------------------------------------------------------------

describe("4. who reads the table, and who presses its reminder", () => {
  test("every file under src that reads the table or works out its reminder is listed with why, both ways", () => {
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    walk(SRC);
    const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const finding = files
      .filter((file) => /\b(?:readWeekTable|nudgePlanFor|sendNudge)\(/.test(strip(readFileSync(file, "utf8"))))
      .map((file) => relative(SRC, file).split(sep).join("/"))
      .sort();
    const LISTED = {
      "lib/surveys/checkIns/weekTable.ts": "defines the table's reading and the reminder's plan, the same reads for both",
      "lib/surveys/checkIns/nudge.ts": "defines the reminder's send, claimed once a session a day",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/check-ins/page.tsx":
        "the Check-ins view, which reads the table only when loadProgrammeRun said the reader is an admin",
      "app/api/admissions/forms/[roundId]/programmes/[programmeId]/check-ins/remind/route.ts":
        "Remind, an admin's alone: loadProgrammeRun, then the admin, before the run is read",
    };
    assert.deepEqual(finding, Object.keys(LISTED).sort(), "a file reads the table or presses its reminder and is not listed with why (or a listed one no longer does)");
    // The page reads it for an admin and nobody else.
    const page = strip(readFileSync(join(SRC, "app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "surveys", "check-ins", "page.tsx"), "utf8"));
    assert.match(page, /const table = view\.viewer === "admin" \? await readWeekTable\(db, \{ records, weekNumber: weekAsked\(query\.week\), now \}\) : null;/);
    // The route refuses the lead before the run is read.
    const route = strip(readFileSync(join(SRC, "app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "check-ins", "remind", "route.ts"), "utf8"));
    const gate = route.indexOf('if (outcome.status === "not-yours" || outcome.view.viewer !== "admin") {');
    assert.ok(gate > 0 && gate < route.indexOf("await readRunRecords(db, view.run.id)"), "the reminder reads the run before it refuses the lead");
    // What an opening reaches is the register's told rows, as every opening's.
    assert.match(strip(readFileSync(join(SRC, "lib", "surveys", "checkIns", "weekTable.ts"), "utf8")), /\bloadToldRegisterMembers\(db, runId, group\.id\)/);
  });

  test("the table's words and the reminders' are plain: no dash, and nothing that marks anybody in what a member reads", () => {
    for (const said of Object.values(THIS_WEEK_WORDS)) assert.doesNotMatch(said, /[–—]/);
    const reminder = words.checkInReminderWords({
      groupName: "Group B",
      startsAt: new Date("2026-10-27T18:00:00Z"),
      questions: 6,
      minutes: 2,
      programmeName: "AGI Strategy",
      closesAt: new Date("2026-10-28T23:00:00Z"),
    });
    const all = [reminder.subject, ...reminder.paragraphs, reminder.button, ...reminder.signOff].join(" ");
    assert.doesNotMatch(all, /[–—]/);
    assert.doesNotMatch(all, /\b(?:mark(?:s|ed)?|grades?|scores?)\b/i);
    assert.equal(words.openForWords(1, false), "Open it for 1 person");
    assert.equal(words.openForWords(6, true), "Open it late for 6 people");
    assert.equal(words.remindFacilitatorsWords(1), "Remind 1 facilitator");
    assert.equal(words.remindFacilitatorsWords(2), "Remind 2 facilitators");
    assert.equal(words.openUntilWords(new Date("2026-10-28T23:00:00Z")), "Open until Wed 28 Oct, 11pm");
    assert.equal(words.weekCheckInsTitle(2), "Week 2’s check-ins");
    assert.equal(words.registerDoneWords(true), "Finished");
    assert.equal(words.registerDoneWords(false), "Pushed");
    assert.equal(words.remindConfirmWords("Group A", 2, { register: false, checkIn: true }, "finished"), "Email Group A’s 2 facilitators that its check-in hasn’t been opened? Each gets one email with the way to the register.");
    assert.equal(words.remindConfirmWords("Group A", 1, { register: true, checkIn: false }, "finished"), "Email Group A’s facilitator that its register isn’t finished? Each gets one email with the way to the register.");
    assert.equal(words.remindConfirmWords("Group A", 1, { register: true, checkIn: true }, "pushed"), "Email Group A’s facilitator that its register and check-in aren’t done? Each gets one email with the way to the register.");
  });
});
