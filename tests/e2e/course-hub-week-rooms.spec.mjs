/**
 * The week's rooms and the term's rooms, end to end, in a real browser,
 * driven by the admin.
 *
 * The term T2 stands on, three weeks after its run began
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "week-three")
 * -> the admin names the running run on the programme's Settings tab and
 * hands its people over -> opens the week's rooms from All groups,
 * filtered to the programme, and goes to the week Group A's week 4 falls in:
 * its row says its day, time and room -> types a new room into the row, the
 * button counting whom it emails with Tell the group on, gives a reason and
 * saves: the route saves the room alone (no day, no time, not moved) and tells
 * the group itself -> Ada's and Ben's mail carries the room-only notice
 * ("Week 4 is in Portland A21") and no meeting link -> pastes Group B's week 4
 * room from two columns, the box matching it, and saves -> the term's rooms
 * shows Group A's week 4 as its own room, not moved, and its link opens the
 * week with the row in view -> sets Group A's weeks 5 and 6 in the grid with
 * one Save that says it emails nobody, reads each back on its week's page,
 * and nobody in Group A has a second email.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-week-rooms
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit.
 *
 * ## What each step relies on in the markup
 *
 *  - All groups' link named "The week’s rooms";
 *  - the week picker, a navigation landmark named "Weeks", each week a link
 *    whose name starts "w/c " and the Monday;
 *  - a row's room field, named "Room for <programme>, <group>", inside the
 *    row whose id is `room-<groupId>__w04`;
 *  - the reason, labelled "Reason (optional)", the switch "Tell the group"
 *    (on), and the button "Save 1 room and email 1 group (N people)";
 *  - the paste box, a region named "Paste rooms from a spreadsheet", its text
 *    box labelled "Paste here";
 *  - the term's rooms, reached by the link "The term’s rooms": a week still to
 *    come is a field named "Room for <group>, week <n>, <day>" with "This week
 *    only" beside its own room and a link "Open week" to its week; the button
 *    "Save 2 rooms. Emails nobody." and the status "2 rooms saved. Nobody was
 *    emailed.".
 *
 * Every expected word comes from the seed's clock and the world's plan.
 *
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import { getMessage, settleMessagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  fixtureDoc,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-week-rooms.mjs";
import { clockWords, dayLabel, sessionOf, shiftDateKey, weekdayOf } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** The week whose rooms change: the next to meet for both groups at this point. */
const WEEK = 4;

const ROOM_A = "Portland A21";
const ROOM_B = "George Green B09";
/** Group A's weeks 5 and 6, set from the term's grid. */
const GRID_ROOMS = ["Portland A22", "Portland A23"];
/** How long the last step waits before it counts each inbox: a second email, had one gone, is there by then. */
const NO_SECOND_EMAIL_MS = 5000;
const REASON = "The usual rooms are booked for exams that week.";

let skipReasonFor = () => null;
const DEPLOYED_TARGET_SKIP = RECAPTCHA_SKIP_REASON;

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

function baseUrl() {
  return assertTarget(process.env.E2E_TARGET ?? "https://dev.naisi.uk");
}

const state = readState(SPEC.name, RUN_STATE_DIR);
const playwright = await loadPlaywright();

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an admin's."
      : state.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, so it runs only against the server the harness starts with its mail caught by Mailpit."
        : null;

const flat = (text) => text.replace(/\s+/g, " ").trim();
const textOf = async (locator) => flat((await locator.textContent()) ?? "");
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "1 person", "2 people". */
const peopleWords = (n) => (n === 1 ? "1 person" : `${n} people`);

/** The Monday of the London week a date falls in. */
function mondayOf(dateKey) {
  return shiftDateKey(dateKey, -((weekdayOf(dateKey) + 6) % 7));
}

/** A row's anchor, as the page makes it (`rowAnchor` in src/lib/courses/weekRooms/paths.ts). */
const anchorOf = (groupId, weekNumber) => `room-${`${groupId}__w0${weekNumber}`.replace(/[^A-Za-z0-9_-]/g, "-")}`;

async function readEmail(summary) {
  const message = await getMessage(summary.ID);
  return { subject: message.Subject ?? summary.Subject ?? "", html: message.HTML ?? "", text: message.Text ?? "" };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test("course hub: the week's rooms, a room set in its row and one pasted, and the term's rooms", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;

  const groupA = state.groups.find((each) => each.key === "A");
  const groupB = state.groups.find((each) => each.key === "B");
  assert.ok(groupA && groupB, "the term has no Group A or no Group B");
  assert.ok(groupA.meetingUrl, "Group A has no meeting link, so 'never in an email' would prove nothing");
  const peopleA = state.people.filter((person) => person.groupKey === "A");
  const peopleB = state.people.filter((person) => person.groupKey === "B");
  const weekA = sessionOf(groupA, WEEK);
  const weekB = sessionOf(groupB, WEEK);

  const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}`;
  const programmeBase = `${formBase}/programmes/${enc(state.programmeId)}`;
  const roomsPath = `/admin/admissions/forms/${enc(state.formId)}/rooms`;

  const { browser, context, page } = await openBrowser();
  const recorder = createStepRecorder({
    t,
    page,
    markerPath: MARKER,
    artifactsDir: ARTIFACTS_DIR,
    skipReasonFor: (name) => skipReasonFor(name),
  });
  const step = (name, fn) => recorder.step(name, fn);

  if (!(await stubRecaptchaOnLoopback(page, origin))) {
    skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? DEPLOYED_TARGET_SKIP : null);
  }

  const responseTo = (suffix, method) =>
    page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, {
      timeout: WAIT_MS,
    });
  /** The answer to the press itself, never to one of the previews asked before it. */
  const pressTo = (groupId) =>
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.endsWith(`/groups/${groupId}/session/change`) &&
        r.request().method() === "POST" &&
        JSON.parse(r.request().postData() ?? "{}").preview !== true,
      { timeout: WAIT_MS },
    );

  async function okBody(response, what) {
    const body = await response.json().catch(() => null);
    assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }

  /** The week's rooms on the week `dateKey` falls in, by its link in the week picker. */
  async function openWeekOf(dateKey) {
    const weeks = page.getByRole("navigation", { name: "Weeks", exact: true });
    const link = weeks.getByRole("link", { name: new RegExp(`^w/c ${escapeRegExp(dayLabel(mondayOf(dateKey)))}`) });
    await link.waitFor({ timeout: WAIT_MS });
    await link.click();
    await page.waitForURL((url) => url.searchParams.get("week") === mondayOf(dateKey), { timeout: WAIT_MS });
  }

  function assertNoMeetingLink(email, who) {
    for (const [part, body] of [
      ["HTML", email.html],
      ["text", email.text],
    ]) {
      assert.ok(
        !body.includes(groupA.meetingUrl) && !body.includes(new URL(groupA.meetingUrl).host),
        `${who}'s ${part} part carries the meeting link. A link to join lives on the site only.`,
      );
    }
  }

  try {
    await step("the admin names the running course run on the programme's Settings tab and hands its people over", async () => {
      await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
      await page.goto(`${programmeBase}/setup`, { waitUntil: "domcontentloaded" });
      const region = page.getByRole("region", { name: "Course run" });
      await region.waitFor({ timeout: WAIT_MS });
      const runBox = region.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([
        responseTo(`/programmes/${state.programmeId}/run`, "PUT"),
        runBox.selectOption({ label: `${state.runLabel} · Running` }),
      ]);
      await okBody(named, "Naming the run");
      const holding = state.people.length;
      const [handOver] = await Promise.all([
        responseTo("/run/hand-over", "POST"),
        region.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
      ]);
      await okBody(handOver, "Handing over");
      await region.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });
    });

    await step("the admin opens the week's rooms from All groups: Group A's week 4 is a row with its day, time and room", async () => {
      await page.goto(`${programmeBase}/groups/sessions`, { waitUntil: "domcontentloaded" });
      const link = page.getByRole("link", { name: "The week’s rooms", exact: true });
      await link.waitFor({ timeout: WAIT_MS });
      assert.equal(await link.getAttribute("href"), `${roomsPath}?programme=${enc(state.programmeId)}`);
      await link.click();
      await page.getByRole("heading", { name: "The week’s rooms", level: 1, exact: true }).waitFor({ timeout: WAIT_MS });
      await openWeekOf(weekA.dateKey);
      const row = page.locator(`#${anchorOf(groupA.id, WEEK)}`);
      await row.waitFor({ timeout: WAIT_MS });
      const said = await textOf(row);
      assert.ok(said.includes(groupA.name), `the row does not name Group A: ${said}`);
      assert.ok(said.includes(`${dayLabel(weekA.dateKey)}, ${clockWords(groupA.startTimeLocal)}`), `the row's day and time: ${said}`);
      assert.ok(said.includes("Set: every week"), `the row does not say Group A's link is set: ${said}`);
      assert.ok(!(await page.content()).includes(groupA.meetingUrl), "the page carries the meeting link");
      const field = row.getByLabel(new RegExp(`^Room for .*, ${escapeRegExp(groupA.name)}$`));
      assert.equal(await field.inputValue(), groupA.room, "the row's room is not Group A's room that week");
    });

    await step("the admin sets Group A's week 4 room in its row, the button counts whom it emails, and the group is told", async () => {
      const row = page.locator(`#${anchorOf(groupA.id, WEEK)}`);
      await row.getByLabel(new RegExp(`^Room for .*, ${escapeRegExp(groupA.name)}$`)).fill(ROOM_A);
      await row.getByText(`Emails ${peopleWords(peopleA.length)}`, { exact: true }).waitFor({ timeout: WAIT_MS });
      await page.getByLabel("Reason (optional)", { exact: true }).fill(REASON);
      assert.equal(await page.getByRole("switch", { name: "Tell the group", exact: true }).isChecked(), true, "Tell the group is not on");
      const button = page.getByRole("button", { name: `Save 1 room and email 1 group (${peopleWords(peopleA.length)})`, exact: true });
      await button.waitFor({ timeout: WAIT_MS });
      const [changed] = await Promise.all([pressTo(groupA.id), button.click()]);
      const body = await okBody(changed, "The room");
      // The route tells the group itself, in the same request.
      assert.equal(body.email?.sent ?? 0, peopleA.length, "the room's notice did not email the group's people");
      await page.getByRole("status").filter({ hasText: "1 room saved." }).waitFor({ timeout: WAIT_MS });
      const stored = (await fixtureDoc("courseGroups", groupA.id).get()).data();
      assert.deepEqual(stored?.sessionOverrides?.[`w0${WEEK}`], { location: ROOM_A }, "week 4 holds more than its room");
      assert.equal(stored?.sessionChanges?.[`w0${WEEK}`], undefined, "week 4 was marked as changed");
      assert.equal(stored?.session?.location, groupA.room, "the room for every week changed");
    });

    await step("the room's email reaches Group A's people with its subject and the room, and none carries the meeting link", async () => {
      for (const person of peopleA) {
        const [summary] = await waitForMessagesTo(person.email, { count: 1, timeoutMs: WAIT_MS });
        const email = await readEmail(summary);
        assert.equal(email.subject, `Week ${WEEK} is in ${ROOM_A}`, `${person.first}'s subject`);
        assert.ok(email.text.includes(`is now in ${ROOM_A}`), `${person.first}'s email does not name the room`);
        assert.ok(email.text.includes(`not ${groupA.room}. The day and time are the same.`), `${person.first}'s email: ${email.text}`);
        assert.ok(email.text.includes(`Why: ${REASON}`), `${person.first}'s email has no reason`);
        assert.ok(!email.text.includes("new time"), `${person.first}'s email speaks of a new time`);
        assertNoMeetingLink(email, person.first);
      }
    });

    await step("the admin pastes Group B's week 4 room from two columns, the box matches it, and Save tells the group", async () => {
      await page.goto(`${origin}${roomsPath}?programme=${enc(state.programmeId)}&week=${weekB.dateKey}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Paste rooms from a spreadsheet", exact: true }).click();
      const box = page.getByRole("region", { name: "Paste rooms from a spreadsheet", exact: true });
      await box.waitFor({ timeout: WAIT_MS });
      await box.getByLabel("Paste here", { exact: true }).fill(`${groupB.name}\t${ROOM_B}`);
      const line = box.getByRole("row").filter({ hasText: ROOM_B });
      await line.waitFor({ timeout: WAIT_MS });
      assert.ok((await textOf(line)).includes(`Was ${groupB.room}`), `the line: ${await textOf(line)}`);
      await box.getByText("1 line: 1 is ready", { exact: false }).waitFor({ timeout: WAIT_MS });
      await box.getByLabel("Reason (optional)", { exact: true }).fill(REASON);
      const button = box.getByRole("button", { name: `Save 1 room and email 1 group (${peopleWords(peopleB.length)})`, exact: true });
      await button.waitFor({ timeout: WAIT_MS });
      const [changed] = await Promise.all([pressTo(groupB.id), button.click()]);
      await okBody(changed, "The pasted room");
      await page.getByRole("status").filter({ hasText: "1 room saved." }).waitFor({ timeout: WAIT_MS });
      for (const person of peopleB) {
        const [summary] = await waitForMessagesTo(person.email, { count: 1, timeoutMs: WAIT_MS });
        const email = await readEmail(summary);
        assert.equal(email.subject, `Week ${WEEK} is in ${ROOM_B}`, `${person.first}'s subject`);
        assert.ok(email.text.includes(`is now in ${ROOM_B}`), `${person.first}'s email does not name the room`);
      }
    });

    await step("the term's rooms shows Group A's week 4 as its own room, not moved, and its link opens the week with the row in view", async () => {
      await page.getByRole("link", { name: "The term’s rooms", exact: true }).click();
      await page.getByRole("heading", { name: "The term’s rooms", level: 1, exact: true }).waitFor({ timeout: WAIT_MS });
      const field = page.getByLabel(new RegExp(`^Room for ${escapeRegExp(groupA.name)}, week ${WEEK}, `));
      await field.waitFor({ timeout: WAIT_MS });
      assert.equal(await field.inputValue(), ROOM_A);
      const cell = field.locator("xpath=..");
      const said = await textOf(cell);
      assert.ok(said.includes("This week only") && !said.includes("Moved"), `Group A's week 4 cell: ${said}`);
      const hash = `#${anchorOf(groupA.id, WEEK)}`;
      await cell.getByRole("link", { name: "Open week", exact: true }).click();
      await page.waitForURL((url) => url.hash === hash, { timeout: WAIT_MS });
      const row = page.locator(hash);
      await row.waitFor({ timeout: WAIT_MS });
      assert.ok(await row.isVisible(), "the group's row is not in view");
      assert.equal(await row.getByLabel(new RegExp(`^Room for .*, ${escapeRegExp(groupA.name)}$`)).inputValue(), ROOM_A);
    });

    await step("the admin sets Group A's weeks 5 and 6 in the grid with one Save that emails nobody, and each week's page reads them back", async () => {
      await page.goto(`${origin}${roomsPath}/term?programme=${enc(state.programmeId)}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "The term’s rooms", level: 1, exact: true }).waitFor({ timeout: WAIT_MS });
      const later = [
        [WEEK + 1, GRID_ROOMS[0]],
        [WEEK + 2, GRID_ROOMS[1]],
      ];
      for (const [week, room] of later) {
        const field = page.getByLabel(new RegExp(`^Room for ${escapeRegExp(groupA.name)}, week ${week}, `));
        await field.waitFor({ timeout: WAIT_MS });
        await field.fill(room);
      }
      const button = page.getByRole("button", { name: "Save 2 rooms. Emails nobody.", exact: true });
      await button.waitFor({ timeout: WAIT_MS });
      const [changed] = await Promise.all([pressTo(groupA.id), button.click()]);
      const body = await okBody(changed, "The grid's rooms");
      assert.equal(body.email, null, "the grid's save emailed somebody");
      assert.equal(JSON.parse(changed.request().postData() ?? "{}").weeks?.length, 2, "the two weeks were not one press");
      await page.getByRole("status").filter({ hasText: "2 rooms saved. Nobody was emailed." }).waitFor({ timeout: WAIT_MS });
      for (const [week, room] of later) {
        const session = sessionOf(groupA, week);
        await page.goto(`${origin}${roomsPath}?programme=${enc(state.programmeId)}&week=${session.dateKey}`, { waitUntil: "domcontentloaded" });
        const row = page.locator(`#${anchorOf(groupA.id, week)}`);
        await row.waitFor({ timeout: WAIT_MS });
        assert.equal(await row.getByLabel(new RegExp(`^Room for .*, ${escapeRegExp(groupA.name)}$`)).inputValue(), room, `week ${week}`);
      }
      // Nobody in Group A has a second email: the grid told nobody. A send would follow the save within the
      // same request, so the harness's settle window (`settleMessagesTo`) lets one land before each inbox is counted.
      for (const person of peopleA) {
        const seen = await settleMessagesTo(person.email, { settleMs: NO_SECOND_EMAIL_MS });
        assert.equal(seen.length, 1, `${person.first} has ${seen.length} emails`);
      }
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
