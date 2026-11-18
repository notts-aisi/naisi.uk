/**
 * A person's page on a programme, for the team, end to end, in a real
 * browser: the harness's admin.
 *
 * The term T2 stands on, three weeks in with its weeks written as blocks
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "coursework")
 * -> the admin names the running run on the programme's Settings tab -> Ada's
 * name on the People tab opens her page -> the page's Coursework, Attendance
 * and Feedback cards, and Move -> Events and Activity, which an admin alone
 * is handed, and no word about conduct -> "Read week 1" opens the reading
 * view of Ada's week 1.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-person-page
 *
 * Nothing on it sends an email. Every expected word comes from the state file
 * and the page's own words, never a calendar date written here.
 *
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import { ARTIFACTS_DIR, RECAPTCHA_SKIP_REASON, markerPath, readState, stateDir, statePath } from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-person-page.mjs";

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
      : null;

const flat = (text) => text.replace(/\s+/g, " ").trim();
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("course hub: an admin opens a person's page on a programme", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const ada = state.people.find((each) => each.key === "ada");
  assert.ok(ada, "the term has no Ada");

  const programmePath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
  const formBase = `${origin}${programmePath}`;
  const personPath = `${programmePath}/people/${enc(ada.uid)}`;

  const { browser, context, page } = await openBrowser();
  const recorder = createStepRecorder({ t, page, markerPath: MARKER, artifactsDir: ARTIFACTS_DIR, skipReasonFor: (name) => skipReasonFor(name) });
  const step = (name, fn) => recorder.step(name, fn);
  if (!(await stubRecaptchaOnLoopback(page, origin))) {
    skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);
  }
  const responseTo = (suffix, method) =>
    page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });

  try {
    await step("the admin names the running course run on the programme's Settings tab", async () => {
      await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
      await page.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
      const region = page.getByRole("region", { name: "Course run" });
      await region.waitFor({ timeout: WAIT_MS });
      const runBox = region.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([responseTo(`/programmes/${state.programmeId}/run`, "PUT"), runBox.selectOption({ label: `${state.runLabel} · Running` })]);
      const body = await named.json().catch(() => null);
      assert.ok(named.ok(), `Naming the run answered ${named.status()}: ${JSON.stringify(body)}`);
      assert.equal(body.panel?.runId, state.runId, "the panel names another run");
    });

    await step("a person's name on the People tab opens their page on the programme", async () => {
      await page.goto(`${formBase}/people`, { waitUntil: "domcontentloaded" });
      const name = page.getByRole("link", { name: new RegExp(`^${escapeRegExp(ada.first)}\\b`) }).first();
      await name.waitFor({ timeout: WAIT_MS });
      assert.equal(await name.getAttribute("href"), personPath, "the name leads somewhere else");
      await name.click();
      await page.waitForURL((url) => url.pathname === personPath, { timeout: WAIT_MS });
      await page.getByRole("heading", { name: new RegExp(`^${escapeRegExp(ada.first)}\\b`), level: 1 }).waitFor({ timeout: WAIT_MS });
    });

    await step("the page shows their coursework week by week, their attendance as counts and the feedback they were given, with Move", async () => {
      for (const title of ["Coursework", "Attendance", "Feedback"]) {
        await page.getByRole("heading", { name: title, level: 2, exact: true }).waitFor({ timeout: WAIT_MS });
      }
      const attendance = page.getByRole("region", { name: "Attendance", exact: true });
      assert.ok(flat((await attendance.textContent()) ?? "").includes("In the room"), "the attendance card has no count of sessions in the room");
      const move = page.getByRole("link", { name: "Move to another group", exact: true });
      await move.waitFor({ timeout: WAIT_MS });
      assert.equal(await move.getAttribute("href"), `${personPath}/move`);
    });

    await step("an admin's page carries Events and Activity, and nothing about conduct", async () => {
      await page.getByRole("heading", { name: "Events", level: 2, exact: true }).waitFor({ timeout: WAIT_MS });
      await page.getByRole("heading", { name: "Activity", level: 2, exact: true }).waitFor({ timeout: WAIT_MS });
      const words = flat((await page.locator("main").textContent()) ?? "");
      assert.doesNotMatch(words, /conduct/i, "the page names conduct");
    });

    await step("Read week 1 opens the reading view of that week", async () => {
      const read = page.getByRole("link", { name: "Read week 1", exact: true }).first();
      await read.waitFor({ timeout: WAIT_MS });
      const readPath = `${programmePath}/coursework/${enc(ada.uid)}`;
      assert.equal(await read.getAttribute("href"), `${readPath}?week=1`);
      await read.click();
      await page.waitForURL((url) => url.pathname === readPath && url.searchParams.get("week") === "1", { timeout: WAIT_MS });
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
