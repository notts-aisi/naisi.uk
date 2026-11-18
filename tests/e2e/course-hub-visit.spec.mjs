/**
 * A one-week visit to another group's session, end to end, in a real
 * browser: the admin, as the programme's lead would be.
 *
 * The term T2 stands on, three weeks after its run began
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "week-three")
 * -> the admin names the running run on the programme's Settings tab and
 * hands its people over -> the People tab's More menu for Ben leads to his
 * visit page -> choosing week 4 and Group B's session, the page says what will
 * happen and the email to Ben, and the button counts one email (nobody
 * facilitates either group at this point) -> the press arranges it and says
 * so -> Ben's mailbox holds "You’re going to Group B’s session on ..." with
 * the approved words -> Group B's page for week 4 lists Ben visiting, and
 * Group A's says he is at Group B that week -> the same page calls the visit
 * off, and Ben's mailbox holds "Your visit to Group B for week 4 is off".
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-visit
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
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-visit.mjs";
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

test("course hub: an admin arranges a one-week visit to another group's session, and calls it off", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const home = state.groups.find((each) => each.key === "A");
  const host = state.groups.find((each) => each.key === "B");
  const ben = state.people.find((each) => each.key === "ben");
  assert.ok(home && host && ben, "the term has no Group A, Group B or Ben");
  assert.equal(ben.groupKey, "A", "Ben is not in Group A at this point");

  // The run's week by its own calendar: the world promises week 3, both groups' week 4 still to come.
  const elapsedDays = Math.round((Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${state.startDate}T00:00:00Z`)) / 86_400_000);
  assert.equal(Math.floor(elapsedDays / 7) + 1, 3, "the term is not in week 3");
  const hostDay = sessionOf(host, 4).dateKey;
  const backDay = sessionOf(home, 5).dateKey;

  const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
  const visitPath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}/people/${enc(ben.uid)}/visit`;

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
      "the People tab's More menu leads to a person's page for a one-week visit to another group",
      async () => {
      await page.goto(`${formBase}/people`, { waitUntil: "domcontentloaded" });
      const more = page.getByRole("button", { name: new RegExp(`^More for ${escapeRegExp(ben.first)}\\b`) }).first();
      await more.waitFor({ timeout: WAIT_MS });
      await more.click();
      const item = page.getByRole("menuitem", { name: "Visit another group for one week", exact: true });
      await item.waitFor({ timeout: WAIT_MS });
      assert.equal(await item.getAttribute("href"), visitPath, "the menu leads somewhere else");
      await item.click();
      await page.waitForURL((url) => url.pathname === visitPath, { timeout: WAIT_MS });
      await page.getByRole("heading", { name: `${ben.first}: visit another group for one week`, level: 1, exact: true }).waitFor({ timeout: WAIT_MS });
    });

    await step(
      "the page offers the weeks still to come and that week's other sessions, says what will happen and the email to the person, and the button counts the emails",
      async () => {
      // Choosing a week reads the page again with that week's sessions.
      await Promise.all([
        page.waitForURL((url) => url.pathname === visitPath && url.searchParams.get("week") === "4", { timeout: WAIT_MS }),
        page.getByTestId("staff-visit-week").selectOption("4"),
      ]);
      // A ?week= address ends in no #fragment, so no reload is owed here.
      const session = page.getByTestId("staff-visit-session").and(page.locator(`[value="${host.id}"]`));
      await session.waitFor({ timeout: WAIT_MS });
      const [shown] = await Promise.all([responseTo(`/people/${ben.uid}/visit`, "POST"), session.check()]);
      const body = await okBody(shown, "The preview");
      assert.equal(body.preview.weekNumber, 4);
      assert.equal(body.preview.emails, 1, "the visit does not email one person");
      const labels = (await page.getByTestId("staff-visit-lines").locator("dt").allTextContents()).map(flat);
      assert.deepEqual(labels, ["Week 4", "Late from", "Reminders", "Registers", "Reading", "Link", "Told"]);
      const lines = await textOf(page.getByTestId("staff-visit-lines"));
      assert.ok(lines.includes(`On ${host.name}’s as visiting, with ${host.name}’s check-in. ${home.name}’s shows “At ${host.name} this week”.`), lines);
      const email = await textOf(page.getByTestId("staff-visit-email"));
      assert.ok(email.includes(`You’re going to ${host.name}’s session on ${dayLabel(hostDay)}`), email);
      assert.ok(email.includes(`For week 4 you’re with ${host.name}:`), email);
      assert.equal(await textOf(page.getByTestId("staff-visit-press")), "Arrange the visit and email 1 person");
    });

    await step(
      "the press arranges the visit, and the page says so",
      async () => {
      const [saved] = await Promise.all([responseTo(`/people/${ben.uid}/visit`, "POST"), page.getByTestId("staff-visit-press").click()]);
      const body = await okBody(saved, "The visit");
      assert.deepEqual([body.weekNumber, body.hostGroupId], [4, host.id]);
      assert.equal(body.emails.failed, 0);
      assert.equal(await textOf(page.getByTestId("staff-visit-done")), `${ben.first} goes to ${host.name} for week 4. 1 email sent.`);
    });

    await step(
      "the person's email reaches their mailbox with the approved words",
      async () => {
      const summaries = await waitForMessagesTo(ben.email, { count: 1, timeoutMs: WAIT_MS });
      const message = await getMessage(summaries[0].ID);
      assert.equal(message.Subject, `You’re going to ${host.name}’s session on ${dayLabel(hostDay)}`);
      const text = flat(message.Text ?? "");
      assert.ok(text.includes(`For week 4 you’re with ${host.name}:`), text);
      assert.ok(text.includes(`You’re still in ${home.name}, and back with them on ${dayLabel(backDay)}. Week 4’s work is due by ${host.name}’s session.`), text);
      assert.ok(text.includes("Changed your mind? You can cancel the visit on your programme page until"), text);
      assert.ok(!text.includes("Your request is approved."), "nobody asked");
    });

    await step(
      "the host group's page lists them visiting for that week, and their own group's page says where they are",
      async () => {
      await page.goto(`${formBase}/groups/${enc(host.id)}?week=4`, { waitUntil: "domcontentloaded" });
      const visiting = page.getByTestId("group-visiting").filter({ hasText: ben.first });
      await visiting.waitFor({ timeout: WAIT_MS });
      const said = await textOf(visiting);
      assert.ok(said.includes(`Visiting from ${home.name}, week 4 only. You can read ${ben.first}’s week 4; ${home.name}’s facilitators give the feedback.`), said);
      assert.ok(said.includes("Visiting"), said);
      await page.goto(`${formBase}/groups/${enc(home.id)}?week=4`, { waitUntil: "domcontentloaded" });
      const away = page.getByTestId("group-away").filter({ hasText: ben.first });
      await away.waitFor({ timeout: WAIT_MS });
      assert.ok((await textOf(away)).includes(`At ${host.name} this week`));
    });

    await step(
      "the same page calls the visit off, and the person's email says so",
      async () => {
      await page.goto(`${origin}${visitPath}`, { waitUntil: "domcontentloaded" });
      const standing = page.getByTestId("staff-visit-standing");
      await standing.waitFor({ timeout: WAIT_MS });
      const button = page.getByTestId("staff-visit-call-off");
      assert.equal(await textOf(button), "Call off this visit and email 1 person");
      const [off] = await Promise.all([responseTo(`/people/${ben.uid}/visit`, "POST"), button.click()]);
      await okBody(off, "Calling it off");
      await page.getByTestId("staff-visit-done").waitFor({ timeout: WAIT_MS });
      const summaries = await waitForMessagesTo(ben.email, { count: 2, timeoutMs: WAIT_MS });
      const subjects = await Promise.all(summaries.map(async (each) => (await getMessage(each.ID)).Subject));
      assert.ok(subjects.includes(`Your visit to ${host.name} for week 4 is off`), JSON.stringify(subjects));
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
