/**
 * People in groups shown as Rings, end to end, in a real browser: the
 * harness's admin.
 *
 * The term T2 stands on, three weeks in (scripts/e2e-fixtures/worlds/
 * course-hub-term.mjs, point "week-three") -> the admin names the running
 * run and hands its people over -> People in groups as Columns -> "Rings"
 * puts `?show=rings` in the address, and a reload keeps it -> Group A and
 * Group B as rings, each with its people -> a name opens the person's panel
 * -> Times and People in groups in the row of views carry the choice, and
 * Circles' old address lands on Rings -> "Columns" takes the choice out of
 * the address again.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-board-rings
 *
 * Nothing on it moves anybody or sends an email. Every expected word comes
 * from the state file and the page's own words, never a calendar date
 * written here.
 *
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import { ARTIFACTS_DIR, RECAPTCHA_SKIP_REASON, markerPath, readState, stateDir, statePath } from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-board-rings.mjs";

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
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test("course hub: People in groups shown as Rings", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const groupA = state.groups.find((each) => each.key === "A");
  const groupB = state.groups.find((each) => each.key === "B");
  assert.ok(groupA && groupB, "the term has no Group A or no Group B");
  const peopleA = state.people.filter((person) => person.groupKey === "A");
  const peopleB = state.people.filter((person) => person.groupKey === "B");
  assert.ok(peopleA.length > 0 && peopleB.length > 0, "the term has nobody in a group");

  const programmePath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
  const boardPath = `${programmePath}/groups`;

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
  const showAs = () => page.getByRole("group", { name: "Show as", exact: true });
  const ringOf = (group) => page.getByRole("region", { name: group.name, exact: true });
  // The legend under the rings: drawn on Rings alone (a column is a region of the group's name too).
  const legend = () => page.getByText("Click a person to see their week", { exact: false }).first();
  // A ring's name tags: buttons titled with the person's full name. Not "button[title]": on Columns each card's
  // "..." menu is a button titled "Move to…" inside a section of the group's name, so that would count the cards.
  const ringChips = (group, people) =>
    page.locator(people.map((person) => `section[aria-label="${group.name}"] button[title^="${person.first}"]`).join(", "));

  try {
    await step("the admin names the running course run on the programme's Settings tab and hands its people over", async () => {
      await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
      await page.goto(`${origin}${programmePath}/setup`, { waitUntil: "domcontentloaded" });
      const region = page.getByRole("region", { name: "Course run" });
      await region.waitFor({ timeout: WAIT_MS });
      const runBox = region.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([responseTo(`/programmes/${state.programmeId}/run`, "PUT"), runBox.selectOption({ label: `${state.runLabel} · Running` })]);
      await okBody(named, "Naming the run");
      const holding = state.people.length;
      const [handOver] = await Promise.all([
        responseTo("/run/hand-over", "POST"),
        region.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
      ]);
      await okBody(handOver, "Handing over");
      await region.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });
    });

    await step("People in groups opens as Columns, and Show as Rings is carried in the address and kept by a reload", async () => {
      await page.goto(`${origin}${boardPath}`, { waitUntil: "domcontentloaded" });
      const columns = showAs().getByRole("link", { name: "Columns", exact: true });
      await columns.waitFor({ timeout: WAIT_MS });
      assert.equal(await columns.getAttribute("aria-current"), "true", "an address with no choice is not Columns");
      await page.getByRole("region", { name: "Groups board", exact: true }).waitFor({ timeout: WAIT_MS });
      const rings = showAs().getByRole("link", { name: "Rings", exact: true });
      assert.equal(await rings.getAttribute("href"), `${boardPath}?show=rings`);
      const [read] = await Promise.all([responseTo("/panel", "GET"), rings.click()]);
      await okBody(read, "Reading everybody's week for the rings");
      await page.waitForURL((url) => url.pathname === boardPath && url.searchParams.get("show") === "rings", { timeout: WAIT_MS });
      await legend().waitFor({ timeout: WAIT_MS });
      // The rings' marks come from the panel's read, made again after the reload: waited for, so that the next
      // step's "nobody is tagged" is read from rings drawn with everybody's week, not before it arrived.
      const [again] = await Promise.all([responseTo("/panel", "GET"), page.reload({ waitUntil: "domcontentloaded" })]);
      await okBody(again, "Reading everybody's week again after the reload");
      await legend().waitFor({ timeout: WAIT_MS });
      assert.equal(await showAs().getByRole("link", { name: "Rings", exact: true }).getAttribute("aria-current"), "true", "a reload lost Rings");
    });

    await step("each group is a ring with its name, how full it is and its people, and the legend under the rings is the admin's", async () => {
      for (const [group, people] of [
        [groupA, peopleA],
        [groupB, peopleB],
      ]) {
        const ring = ringOf(group);
        await ring.getByRole("link", { name: group.name, exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await ring.getByRole("link", { name: group.name, exact: true }).getAttribute("href"), `${programmePath}/groups/${enc(group.id)}`);
        const said = flat((await ring.textContent()) ?? "");
        assert.ok(said.includes(`${people.length} of `) || said.includes(`${people.length} ·`), `${group.name}'s ring says: ${said}`);
        for (const person of people) {
          await ring.locator(`button[title^="${person.first}"]`).waitFor({ timeout: WAIT_MS });
        }
      }
      const words = flat((await page.locator("main").textContent()) ?? "");
      assert.ok(words.includes("Click a person to see their week and what Claude made of their application"), "the admin's legend is not under the rings");
      assert.doesNotMatch(words, /didn’t mark this time as free/, "a ring says somebody can't make a time they all fit");
    });

    await step("a name on a ring opens the same panel as on Columns, with when they're free", async () => {
      const person = peopleA[0];
      // The rings already read everybody's week, so opening a panel reads nothing more.
      await ringOf(groupA).locator(`button[title^="${person.first}"]`).click();
      const heading = page.getByRole("heading", { name: new RegExp(`^${escapeRegExp(person.first)}\\b`), level: 2 });
      await heading.waitFor({ timeout: WAIT_MS });
      await page.getByRole("heading", { name: "When they’re free", level: 3, exact: true }).waitFor({ timeout: WAIT_MS });
      await page.getByText(`In ${groupA.name}. Pick a group on the chart, or click another ring, to move them.`, { exact: true }).waitFor({ timeout: WAIT_MS });
      // Moving them is offered in the middle of the other ring, and nothing is pressed here.
      await ringOf(groupB).getByRole("button", { name: `Move ${flat((await heading.textContent()) ?? "")} to ${groupB.name}`, exact: true }).waitFor({ timeout: WAIT_MS });
    });

    await step("the Groups tab's own links keep the choice, and Circles' old address opens People in groups as Rings", async () => {
      const views = page.getByRole("navigation", { name: "Groups views", exact: true });
      const times = views.getByRole("link", { name: "Times", exact: true });
      assert.equal(await times.getAttribute("href"), `${boardPath}/times?show=rings`);
      await times.click();
      await page.waitForURL((url) => url.pathname === `${boardPath}/times`, { timeout: WAIT_MS });
      const back = page.getByRole("navigation", { name: "Groups views", exact: true }).getByRole("link", { name: "People in groups", exact: true });
      assert.equal(await back.getAttribute("href"), `${boardPath}?show=rings`);
      await page.goto(`${origin}${boardPath}/circles`, { waitUntil: "domcontentloaded" });
      await page.waitForURL((url) => url.pathname === boardPath && url.searchParams.get("show") === "rings", { timeout: WAIT_MS });
      await legend().waitFor({ timeout: WAIT_MS });
      const strip = flat((await page.getByRole("navigation", { name: "Groups views", exact: true }).textContent()) ?? "");
      assert.doesNotMatch(strip, /Circles/, "the row of views still offers Circles");
    });

    await step("Show as Columns opens the board as columns again, with no choice in the address", async () => {
      const columns = showAs().getByRole("link", { name: "Columns", exact: true });
      assert.equal(await columns.getAttribute("href"), boardPath);
      await columns.click();
      await page.waitForURL((url) => url.pathname === boardPath && !url.searchParams.has("show"), { timeout: WAIT_MS });
      // The state the step is about: the columns board drawn (Rings draws no "Groups board"), and the rings' legend gone.
      await page.getByRole("region", { name: "Groups board", exact: true }).waitFor({ timeout: WAIT_MS });
      await legend().waitFor({ state: "detached", timeout: WAIT_MS });
      assert.equal(await ringChips(groupA, peopleA).count(), 0, "a ring is still drawn on Columns");
      // Each of Group A's people is a card in its column instead.
      for (const person of peopleA) {
        await ringOf(groupA).getByRole("button", { name: new RegExp(`^${escapeRegExp(person.first)}\\b`) }).first().waitFor({ timeout: WAIT_MS });
      }
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
