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
 * the group's own page under /learn) -> the admin approves Gus, makes Gus
 * SU-recognised committee, names the running run and Gus as the programme's
 * lead -> Gus, signed in, finds Ivy (offered a place given back, not answered
 * yet), and Enter opens the People tab on her row, under Invited, which the
 * tab's opening filter, Everyone, would leave out.
 *
 * WHAT EACH STEP RELIES ON, in the markup:
 *  - the sidebar's button, `<button aria-haspopup="dialog">` named "Search
 *    people and groups", drawn once `GET /api/search` has said yes;
 *  - the dialog, `role="dialog"` named "Search people and groups", and in it
 *    the box, `<input role="combobox">` labelled by the same words;
 *  - each result, `<a role="option">` whose name is the result's name and
 *    then its line, and whose `href` is the page it opens;
 *  - the first result of an answer is the active one, so Enter opens it;
 *  - Approvals' `approval-card`, the member page's access section with its
 *    Role box and SU-recognised switch, and the Settings tab's "Course run"
 *    region with its Run box and "Choose a lead" menu, as the lead's notes
 *    spec drives them;
 *  - the People tab's filter buttons (`aria-pressed`, "Invited") and each
 *    row's name in a table row.
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
import { readUserDoc } from "../../scripts/e2e/lib/firestore.mjs";
import {
  approvePendingApplicant,
  createStepRecorder,
  newIdentityPage,
  openBrowser,
  signInWithPassword,
  stubRecaptchaOnLoopback,
} from "../../scripts/e2e/lib/browser.mjs";
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

const POLL_MS = 500;

/** Polls `predicate` until it answers something truthy, and hands that back. */
async function waitFor(what, predicate, { timeout = WAIT_MS } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const answer = await predicate();
    if (answer) return answer;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeout}ms waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

test("course hub: an admin searches for a person and a group from the sidebar", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const ben = state.people.find((each) => each.key === "ben");
  const groupB = state.groups.find((each) => each.key === "B");
  const gus = state.lead;
  const ivy = state.invited;
  assert.ok(ben && groupB && gus && ivy, "the term has no Ben, no Group B, no lead or nobody invited");
  const enc = encodeURIComponent;
  const programmePath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;

  const { browser, context, page } = await openBrowser();
  const { context: leadContext, page: leadPage } = await newIdentityPage(browser);
  /** Which page a failed step photographs: each step names its page first. */
  let activePage = page;
  const recorderPage = {
    screenshot: (options) => activePage.screenshot(options),
    locator: (selector) => activePage.locator(selector),
    url: () => activePage.url(),
    context: () => activePage.context(),
  };
  const recorder = createStepRecorder({ t, page: recorderPage, markerPath: MARKER, artifactsDir: ARTIFACTS_DIR, skipReasonFor: (name) => skipReasonFor(name) });
  const step = (name, fn) => recorder.step(name, fn);
  const stubbed = await stubRecaptchaOnLoopback(page, origin);
  await stubRecaptchaOnLoopback(leadPage, origin);
  if (!stubbed) {
    skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);
  }
  const searchedOn = (pg) =>
    pg.waitForResponse((r) => new URL(r.url()).pathname === "/api/search" && r.request().method() === "POST", { timeout: WAIT_MS });
  const searched = () => searchedOn(page);
  const responseTo = (pg, suffix, method) =>
    pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });
  async function okBody(response, what) {
    const body = await response.json().catch(() => null);
    assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }
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

    await step("the admin approves the account that will lead the programme and makes it SU-recognised committee", async () => {
      activePage = page;
      await approvePendingApplicant(page, origin, { email: gus.email });
      await waitFor("Gus's account to say member", async () => (await readUserDoc(gus.uid))?.role === "member");
      await page.goto(`${origin}/admin/members/${enc(gus.uid)}`, { waitUntil: "domcontentloaded" });
      const access = page.locator(`section[aria-labelledby="access-${gus.uid}"]`);
      await access.waitFor({ timeout: WAIT_MS });
      await access.getByRole("combobox", { name: "Role", exact: true }).selectOption({ label: "Committee" });
      await waitFor("Gus's account to say committee", async () => (await readUserDoc(gus.uid))?.role === "committee");
      // The switch is offered once the role is committee; the input sits under its label, out of sight.
      const recognised = access.getByRole("checkbox", { name: /^SU-recognised committee/ });
      await recognised.waitFor({ state: "attached", timeout: WAIT_MS });
      await recognised.locator("xpath=ancestor::label[1]").click();
      await waitFor("Gus's account to say SU-recognised", async () => (await readUserDoc(gus.uid))?.suRecognised === true);
    });

    await step("the admin names the running course run and the programme's lead on the Settings tab", async () => {
      activePage = page;
      await page.goto(`${origin}${programmePath}/setup`, { waitUntil: "domcontentloaded" });
      const panel = page.getByRole("region", { name: "Course run" });
      await panel.waitFor({ timeout: WAIT_MS });
      const runBox = panel.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([
        responseTo(page, `/programmes/${state.programmeId}/run`, "PUT"),
        runBox.selectOption({ label: `${state.runLabel} · Running` }),
      ]);
      assert.equal((await okBody(named, "Naming the run")).panel?.runId, state.runId, "the panel names another run");
      await page.getByRole("button", { name: "Choose a lead", exact: true }).click();
      const menu = page.getByRole("menu", { name: "Choose a lead" });
      const [roles] = await Promise.all([
        responseTo(page, `/programmes/${state.programmeId}/roles`, "PUT"),
        menu.getByRole("menuitem", { name: new RegExp(escapeRegExp(gus.displayName)) }).click(),
      ]);
      assert.equal((await okBody(roles, "Naming the lead")).programme?.lead?.uid, gus.uid, "the programme's lead is not the one chosen");
      await waitFor("Gus's account to be let into the admissions pages", async () => (await readUserDoc(gus.uid))?.admissionsReviewer === true);
    });

    await step("the lead finds somebody invited, and Enter opens the People tab on their row, under Invited", async () => {
      activePage = leadPage;
      await signInWithPassword(leadPage, origin, { email: gus.email, password: gus.password }, { timeout: WAIT_MS });
      await leadPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
      // The lead's box is drawn once the route has said a lead may search.
      await leadPage.getByRole("button", { name: LABEL, exact: true }).first().click({ timeout: WAIT_MS });
      const leadDialog = leadPage.getByRole("dialog", { name: LABEL });
      const leadBox = leadDialog.getByRole("combobox", { name: LABEL });
      await leadBox.waitFor({ timeout: WAIT_MS });
      const rowPath = `${programmePath}/people`;
      const [answer] = await Promise.all([searchedOn(leadPage), leadBox.fill(ivy.displayName)]);
      const body = await answer.json();
      assert.ok(answer.ok(), `search answered ${answer.status()}`);
      assert.equal(body.people[0]?.name, ivy.displayName, `${ivy.displayName} is not the first person found: ${JSON.stringify(body.people)}`);
      assert.equal(body.people[0].href, `${rowPath}?person=${enc(ivy.uid)}`);
      const option = leadDialog.getByRole("option", { name: new RegExp(`^${escapeRegExp(ivy.displayName)}`) }).first();
      await option.waitFor({ timeout: WAIT_MS });
      await leadBox.press("Enter");
      await leadPage.waitForURL((url) => url.pathname === rowPath && url.searchParams.get("person") === ivy.uid, { timeout: WAIT_MS });
      // The tab opens under Invited, the filter that holds her, and her row is drawn.
      const invited = leadPage.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Invited/ });
      await invited.waitFor({ timeout: WAIT_MS });
      assert.equal(await invited.getAttribute("aria-pressed"), "true", "the tab does not open under Invited");
      await leadPage.locator("table tbody tr", { hasText: ivy.displayName }).first().waitFor({ timeout: WAIT_MS });
    });
  } finally {
    await leadContext.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
