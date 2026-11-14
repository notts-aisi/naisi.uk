/**
 * Moving somebody to another group for good, mid-term, end to end, in a real
 * browser: the admin, as the programme's lead would be.
 *
 * The term T2 stands on, three weeks after its run began
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "week-three")
 * -> the admin names the running run on the programme's Settings tab and
 * hands its people over -> the People tab's More menu for Ben leads to his
 * page -> choosing Group B, the page states "Week 4 · Group B meets ..." (Group
 * A met for week 3 already), what will happen and the email to Ben, and the
 * button counts one email (nobody facilitates either group at this point) ->
 * the press moves him and says so -> Ben's mailbox holds "You’re moving to
 * Group B" with the approved words -> Group B's page for week 3 lists Ben as
 * joining it from week 4.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-staff-move
 *
 * It declares `requiresCaughtMail`. Every expected word comes from the
 * state file and the world's helpers, never a calendar date written here.
 *
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import { getMessage, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-staff-move.mjs";
import { dayLabel, londonDateKey, sessionOf } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);
const WAIT_MS = 30_000;

let skipReasonFor = () => null;

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

test("course hub: an admin moves somebody to another group for good, mid-term", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const from = state.groups.find((each) => each.key === "A");
  const to = state.groups.find((each) => each.key === "B");
  const ben = state.people.find((each) => each.key === "ben");
  assert.ok(from && to && ben, "the term has no Group A, Group B or Ben");
  assert.equal(ben.groupKey, "A", "Ben is not in Group A at this point");

  // The run's week by its own calendar: the world promises week 3, Group A's met.
  const elapsedDays = Math.round((Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${state.startDate}T00:00:00Z`)) / 86_400_000);
  assert.equal(Math.floor(elapsedDays / 7) + 1, 3, "the term is not in week 3");
  const firstWithThem = sessionOf(to, 4).dateKey;

  const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
  const movePath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}/people/${enc(ben.uid)}/move`;

  const { browser, context, page } = await openBrowser();
  const recorder = createStepRecorder({ t, page, markerPath: MARKER, artifactsDir: ARTIFACTS_DIR, skipReasonFor: (name) => skipReasonFor(name) });
  const step = (name, fn) => recorder.step(name, fn);
  if (!(await stubRecaptchaOnLoopback(page, origin))) {
    skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);
  }
  const responseTo = (suffix, method) =>
    page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });
  async function okBody(response, what) {
    const body = await response.json().catch(() => null);
    assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }

  try {
    await step(
      "the admin names the running course run on the programme's Settings tab and hands its people over",
      async () => {
      await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
      await page.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
      const region = page.getByRole("region", { name: "Course run" });
      await region.waitFor({ timeout: WAIT_MS });
      const runBox = region.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([responseTo(`/programmes/${state.programmeId}/run`, "PUT"), runBox.selectOption({ label: `${state.runLabel} · Running` })]);
      assert.equal((await okBody(named, "Naming the run")).panel?.runId, state.runId, "the panel names another run");
      const holding = state.people.length;
      const [handOver] = await Promise.all([
        responseTo("/run/hand-over", "POST"),
        region.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
      ]);
      await okBody(handOver, "Handing over");
      await region.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });
    });

    await step(
      "the People tab's More menu leads to a person's page for moving them to another group for good",
      async () => {
      await page.goto(`${formBase}/people`, { waitUntil: "domcontentloaded" });
      const more = page.getByRole("button", { name: new RegExp(`^More for ${escapeRegExp(ben.first)}\\b`) }).first();
      await more.waitFor({ timeout: WAIT_MS });
      await more.click();
      const item = page.getByRole("menuitem", { name: "Move to another group", exact: true });
      await item.waitFor({ timeout: WAIT_MS });
      assert.equal(await item.getAttribute("href"), movePath, "the menu leads somewhere else");
      await item.click();
      await page.waitForURL((url) => url.pathname === movePath, { timeout: WAIT_MS });
      await page.getByRole("heading", { name: `${ben.first}: move to another group for good`, level: 1, exact: true }).waitFor({ timeout: WAIT_MS });
    });

    await step(
      "the page states the week the move is from, what will happen and the email to the person, and the button counts the emails",
      async () => {
      const [shown] = await Promise.all([responseTo(`/people/${ben.uid}/move`, "POST"), page.getByTestId("staff-move-to").selectOption(to.id)]);
      const body = await okBody(shown, "The preview");
      assert.equal(body.preview.weekNumber, 4, "the move is not from week 4");
      assert.equal(body.preview.emails, 1, "the move does not email one person");
      assert.equal(await textOf(page.getByTestId("staff-move-week")), `Week 4 · ${to.name} meets ${dayLabel(firstWithThem)}`);
      const lines = await textOf(page.getByTestId("staff-move-lines"));
      // Each line's label is its own <dt>: exactly these, in this order (no copy differs and nothing is left behind here).
      const labels = (await page.getByTestId("staff-move-lines").locator("dt").allTextContents()).map(flat);
      assert.deepEqual(labels, ["Group", "Work", "Attendance", "Late, reminders", "Registers", "Told"]);
      assert.ok(lines.includes(`${ben.first} leaves ${from.name}’s from week 4 and joins ${to.name}’s.`), lines);
      const email = await textOf(page.getByTestId("staff-move-email"));
      assert.ok(email.includes(`You’re moving to ${to.name}`), email);
      assert.ok(email.includes(`Your first session with them is ${dayLabel(firstWithThem)}.`), email);
      assert.equal(await textOf(page.getByTestId("staff-move-press")), `Move ${ben.first} to ${to.name} and email 1 person`);
    });

    await step(
      "the press moves them, and the page says so",
      async () => {
      const [saved] = await Promise.all([responseTo(`/people/${ben.uid}/move`, "POST"), page.getByTestId("staff-move-press").click()]);
      const body = await okBody(saved, "The move");
      assert.deepEqual([body.weekNumber, body.toGroupId, body.fromGroupId], [4, to.id, from.id]);
      assert.equal(body.emails.failed, 0);
      assert.ok((await textOf(page.getByTestId("staff-move-done"))).startsWith(`${ben.first} is in ${to.name} from week 4.`));
    });

    await step(
      "the person's email reaches their mailbox with the approved words, from the week stated",
      async () => {
      const summaries = await waitForMessagesTo(ben.email, { count: 1, timeoutMs: WAIT_MS });
      const message = await getMessage(summaries[0].ID);
      assert.equal(message.Subject, `You’re moving to ${to.name}`);
      const text = flat(message.Text ?? "");
      assert.ok(text.includes(`From week 4 you’re in ${to.name}:`), text);
      assert.ok(text.includes("Your work and feedback from weeks 1 to 3 come with you."), text);
      assert.ok(text.includes(`From week 4 you’re no longer in ${from.name}, so you don’t need to go to its sessions.`), text);
    });

    await step(
      "the new group's page lists them for a week before the move as joining from that week, and never as one of that week's people",
      async () => {
      await page.goto(`${formBase}/groups/${enc(to.id)}?week=3`, { waitUntil: "domcontentloaded" });
      const joining = page.getByTestId("group-joins-later").first();
      await joining.waitFor({ timeout: WAIT_MS });
      const said = await textOf(joining);
      assert.ok(said.includes(`Joins ${to.name} from week 4, with weeks 1 to 3 to read`), said);
      // The week's table (This week's work, or the week's people when its work is not drawn) is
      // section[aria-labelledby="group-people"]: any row of it naming Ben is the joining line, never a row of the week's.
      const rows = await page.locator('section[aria-labelledby="group-people"] table tbody tr', { hasText: ben.first }).all();
      for (const row of rows) assert.equal(await row.getByTestId("group-joins-later").count(), 1, `${ben.first} is one of week 3's people: ${await textOf(row)}`);
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
