/**
 * Select several on People in groups, before the groups go out, end to end
 * in a real browser: the harness's admin.
 *
 * The term just after decision day (scripts/e2e-fixtures/worlds/
 * course-hub-term.mjs, point "decisions-sent") -> the admin names the run,
 * moves it on from draft and hands its people over -> People in groups as
 * Columns offers "Select several" -> a box on every card -> the bar names who
 * is chosen -> "Move to…" lists To place and each group with its room ->
 * everybody chosen moves into Group A in one press (`together: true`) -> Clear
 * and Done.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-board-select-several
 *
 * Nothing on it publishes or sends an email. Every expected word comes from
 * the state file and the page's own words.
 *
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  enrolmentId,
  fixtureDoc,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-board-select-several.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);
/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
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
/** "Ada, Ben and Cleo". */
const namesList = (names) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test("course hub: Select several on People in groups, before the groups go out", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const groupA = state.groups.find((each) => each.key === "A");
  assert.ok(groupA, "the term has no Group A");
  const people = state.people;
  assert.ok(people.length >= 2, "the term has fewer than two people to choose");

  const programmePath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
  const boardPath = `${programmePath}/groups`;
  const runEditorUrl = `${origin}/admin/courses/${enc(state.courseId)}/runs/${enc(state.runId)}`;

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
  const bar = () => page.getByRole("group", { name: "Select several", exact: true });
  const box = (person) => page.getByRole("checkbox", { name: `Select ${person.displayName}`, exact: true });

  try {
    await step("the admin names the course run on the programme's Settings tab, moves it on from draft and hands its people over", async () => {
      await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
      await page.goto(`${origin}${programmePath}/setup`, { waitUntil: "domcontentloaded" });
      const region = page.getByRole("region", { name: "Course run" });
      await region.waitFor({ timeout: WAIT_MS });
      const runBox = region.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([responseTo(`/programmes/${state.programmeId}/run`, "PUT"), runBox.selectOption({ label: `${state.runLabel} · Draft` })]);
      await okBody(named, "Naming the run");

      await page.goto(runEditorUrl, { waitUntil: "domcontentloaded" });
      const statusBox = page.getByRole("combobox", { name: "Run status", exact: true });
      await statusBox.waitFor({ timeout: WAIT_MS });
      await statusBox.selectOption({ label: "Applications open" });
      const question = page.getByRole("dialog", { name: /to Applications open\?$/ });
      await question.waitFor({ timeout: WAIT_MS });
      const [moved] = await Promise.all([responseTo("/status", "POST"), question.getByRole("button", { name: "Move it to Applications open", exact: true }).click()]);
      await okBody(moved, "Moving the run on from draft");

      await page.goto(`${origin}${programmePath}/setup`, { waitUntil: "domcontentloaded" });
      const panel = page.getByRole("region", { name: "Course run" });
      const [handOver] = await Promise.all([
        responseTo("/run/hand-over", "POST"),
        panel.getByRole("button", { name: `Hand over ${people.length} people`, exact: true }).click(),
      ]);
      await okBody(handOver, "Handing over");
      await panel.getByRole("status").filter({ hasText: `${people.length} people handed over.` }).waitFor({ timeout: WAIT_MS });
    });

    await step("People in groups before the groups go out offers Select several, which puts a box on every card", async () => {
      await page.goto(`${origin}${boardPath}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("region", { name: "Groups board", exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await page.getByRole("checkbox").count(), 0, "a card has a box before Select several is pressed");
      const select = page.getByRole("button", { name: "Select several", exact: true });
      await select.click();
      await bar().waitFor({ timeout: WAIT_MS });
      // The bar takes the button's place.
      assert.equal(await select.count(), 0, "Select several is still in the toolbar while choosing");
      for (const person of people) await box(person).waitFor({ timeout: WAIT_MS });
      await bar().getByText("Nobody selected yet.", { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await bar().getByRole("button", { name: "Move to…", exact: true }).isDisabled(), true, "Move to… can be pressed with nobody chosen");
    });

    const chosen = people.slice(0, 2);
    await step("the bar names who is chosen, and Move to… lists To place and each group with its room", async () => {
      for (const person of chosen) await box(person).check();
      await bar()
        .getByText(`${chosen.length} selected: ${namesList(chosen.map((person) => person.first))}`, { exact: true })
        .waitFor({ timeout: WAIT_MS });
      await bar().getByRole("button", { name: "Move to…", exact: true }).click();
      await bar().getByText(`Move ${namesList(chosen.map((person) => person.first))} to`, { exact: true }).waitFor({ timeout: WAIT_MS });
      await bar().getByRole("button", { name: "To place", exact: true }).waitFor({ timeout: WAIT_MS });
      for (const group of state.groups) {
        const choice = bar().getByRole("button", { name: new RegExp(`^${group.name} · 0 of \\d+`) });
        await choice.waitFor({ timeout: WAIT_MS });
        assert.match(flat((await choice.textContent()) ?? ""), /Room for \d+$/, `${group.name} does not say its room`);
      }
    });

    await step("everybody chosen moves into one group in one press, and the bar says nobody was emailed", async () => {
      const [pressed] = await Promise.all([
        page.waitForResponse(
          (r) => new URL(r.url()).pathname.endsWith("/allocate") && r.request().method() === "POST" && (r.request().postDataJSON?.() ?? {}).together === true,
          { timeout: WAIT_MS },
        ),
        bar().getByRole("button", { name: new RegExp(`^${groupA.name} · `) }).click(),
      ]);
      const body = await okBody(pressed, "Moving several together");
      assert.deepEqual(body, { ok: true, placed: chosen.length, rejected: [] });
      await bar()
        .getByText(`${namesList(chosen.map((person) => person.first))} are in ${groupA.name}. Nobody was emailed.`, { exact: true })
        .waitFor({ timeout: WAIT_MS });
      for (const person of chosen) {
        const seat = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).get()).data();
        assert.equal(seat?.groupId, groupA.id, `${person.first} is not in ${groupA.name}`);
      }
      // The board is read again: both cards sit in Group A now.
      const column = page.getByRole("region", { name: groupA.name, exact: true });
      for (const person of chosen) await column.getByText(person.displayName, { exact: true }).waitFor({ timeout: WAIT_MS });
    });

    await step("Clear empties the bar, and Done takes the boxes away", async () => {
      await box(people[people.length - 1]).check();
      await bar().getByText(`1 selected: ${people[people.length - 1].first}`, { exact: true }).waitFor({ timeout: WAIT_MS });
      await bar().getByRole("button", { name: "Clear", exact: true }).click();
      await bar().getByText("Nobody selected yet.", { exact: true }).waitFor({ timeout: WAIT_MS });
      await bar().getByRole("button", { name: "Done", exact: true }).click();
      await page.getByRole("button", { name: "Select several", exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await page.getByRole("checkbox").count(), 0, "a card still has a box after Done");
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
