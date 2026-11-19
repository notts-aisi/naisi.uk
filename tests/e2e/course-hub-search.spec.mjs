/**
 * Searching for a person or a group from the sidebar, end to end, in a real
 * browser: the admin.
 *
 * The term T2 stands on, three weeks after its run began
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "week-three")
 * -> on Home, "/" opens "Search people and groups" with its box ready for
 * typing -> Ben's whole name finds him, by the name an admin is shown, with
 * his page under Members -> "Group B" and the run's label find Group B, and
 * Enter opens the group's page (the programme names no run at this point, so
 * the group's own page under /learn).
 *
 * WHAT EACH STEP RELIES ON, in the markup:
 *  - the sidebar's button, `<button aria-haspopup="dialog">` named "Search
 *    people and groups", drawn once `GET /api/search` has said yes;
 *  - the dialog, `role="dialog"` named "Search people and groups", and in it
 *    the box, `<input role="combobox">` labelled by the same words;
 *  - each result, `<a role="option">` whose name is the result's name and
 *    then its line, and whose `href` is the page it opens;
 *  - the first result of an answer is the active one, so Enter opens it.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-search
 *
 * Nothing on this journey sends an email. Every expected word comes from the
 * state file, never written here.
 *
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import { ARTIFACTS_DIR, RECAPTCHA_SKIP_REASON, markerPath, readState, stateDir, statePath } from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-search.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);
const WAIT_MS = 30_000;
const LABEL = "Search people and groups";

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
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Search on this journey is an admin's."
      : null;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("course hub: an admin searches for a person and a group from the sidebar", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const ben = state.people.find((each) => each.key === "ben");
  const groupB = state.groups.find((each) => each.key === "B");
  assert.ok(ben && groupB, "the term has no Ben or no Group B");

  const { browser, context, page } = await openBrowser();
  const recorder = createStepRecorder({ t, page, markerPath: MARKER, artifactsDir: ARTIFACTS_DIR, skipReasonFor: (name) => skipReasonFor(name) });
  const step = (name, fn) => recorder.step(name, fn);
  if (!(await stubRecaptchaOnLoopback(page, origin))) {
    skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);
  }
  const searched = () =>
    page.waitForResponse((r) => new URL(r.url()).pathname === "/api/search" && r.request().method() === "POST", { timeout: WAIT_MS });
  const dialog = page.getByRole("dialog", { name: LABEL });
  const box = dialog.getByRole("combobox", { name: LABEL });

  try {
    await step("the admin presses / on Home and the search opens, its box ready for typing", async () => {
      await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
      await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
      // The button is drawn once the route has said this reader may search.
      await page.getByRole("button", { name: LABEL, exact: true }).first().waitFor({ timeout: WAIT_MS });
      await page.keyboard.press("/");
      await box.waitFor({ timeout: WAIT_MS });
      assert.equal(await box.evaluate((element) => element === document.activeElement), true, "the box does not have the focus");
    });

    await step("a person's name finds them, by the name the admin is shown, with their page under Members", async () => {
      const [answer] = await Promise.all([searched(), box.fill(ben.displayName)]);
      const body = await answer.json();
      assert.ok(answer.ok(), `search answered ${answer.status()}`);
      const hit = body.people.find((each) => each.name === ben.displayName);
      assert.ok(hit, `${ben.displayName} is not found: ${JSON.stringify(body.people.map((each) => each.name))}`);
      assert.equal(hit.href, `/admin/members/${encodeURIComponent(ben.uid)}`);
      // Nothing in any result is an address.
      assert.ok(!JSON.stringify(body).includes("@"), "a result carries an address");
      const option = dialog.getByRole("option", { name: new RegExp(`^${escapeRegExp(ben.displayName)}`) }).first();
      await option.waitFor({ timeout: WAIT_MS });
      assert.equal(await option.getAttribute("href"), hit.href);
    });

    await step("a group's name and run find it, and Enter opens the group's page", async () => {
      const groupPath = `/learn/${encodeURIComponent(state.runId)}/group/${encodeURIComponent(groupB.id)}`;
      const [answer] = await Promise.all([searched(), box.fill(`${groupB.name} ${state.runLabel}`)]);
      const body = await answer.json();
      assert.ok(answer.ok(), `search answered ${answer.status()}`);
      assert.equal(body.groups[0]?.href, groupPath, `the first group is not ${groupB.name}: ${JSON.stringify(body.groups)}`);
      const option = dialog.getByRole("option", { name: new RegExp(`^${escapeRegExp(groupB.name)}`) }).first();
      await option.waitFor({ timeout: WAIT_MS });
      assert.equal(await option.getAttribute("aria-selected"), "true", "the first result is not the active one");
      await box.press("Enter");
      await page.waitForURL((url) => url.pathname === groupPath, { timeout: WAIT_MS });
      await dialog.waitFor({ state: "hidden", timeout: WAIT_MS });
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
