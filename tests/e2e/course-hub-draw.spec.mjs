/**
 * The draw, end to end in a real browser: a facilitator copies next week's
 * slips in during the session that hands them out, and a member reads their
 * case.
 *
 * The world's "draw-night" point (scripts/e2e-fixtures/worlds/course-hub-term.mjs):
 * the fellowship three weeks in, one group of two (Ada and Ben), its week 3
 * session under way when the seed ran, and weeks 3 and 4 each giving out a
 * pathway and a case study grouped by it.
 *
 * -> the admin approves Fern and Ada -> names the running run and hands its
 * people over -> appoints Fern to the group -> during the session, Fern's
 * group page card says "Week 4" and opens the draw on week 4 -> the draw page
 * is about week 4, its Week picker lists weeks 3 and 4, and it says "Copy in
 * the slips you handed out tonight." -> Fern gives Ada and Ben a pathway and
 * a case each and saves: "Saved. 2 of 3 have a pathway and a case." -> Ada's
 * week 4 page shows her pathway and her case, and nobody was emailed -> Fern
 * opens week 3 from the picker: its own editor, nothing from week 4 carried
 * in, and "Week 3 is the week people are working on now. Its session has
 * started."; Save asks that again, then "Changing a case takes back that
 * person’s Ready for my talk.", before it changes anything -> Fern leaves with
 * that change not saved: asked first, and leaving without saving changes
 * nothing.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-draw
 *
 * It needs the admin's credentials (E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD) and
 * Playwright with Chromium. It reads no mail, so it runs on a server whose
 * mail is suppressed too; where the mail is caught it also checks that the
 * draw sent Ada nothing past her approval. A seed within an hour of midnight
 * puts the session across it: "tonight" is then checked only while the London
 * day is the session's. CHROMIUM ONLY: a green run is a regression net, never
 * a substitute for the manual Safari pass.
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
import { messagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  fixtureQuery,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-draw.mjs";
import { DRAW_NIGHT, DRAW_SLIPS, londonDateKey } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/**
 * THE DRAW'S WORDS, restated from src/lib/courses/packsAndCases/words.ts,
 * with their slots filled for the world this spec's fixture builds: weeks 3
 * and 4 each give out a Choose one titled "Pathway" (`DRAW_SLIPS`) and a case
 * study grouped by it, and no This week block, so no pack counts towards a
 * week. So `drawTitleWords` says "Pathways and cases", `spreadTitleWords`
 * "Pathways in Group A", `changeDrawWords` "Change pathways and cases",
 * `drawHoldingWords` "a pathway and a case", and a late save asks the week's
 * standing then the owner's sentence about a case, and no line about a
 * pathway (`lateSaveChangesWords` says one only for a pack a task counts).
 */
const WORDS = Object.freeze({
  title: "Pathways and cases",
  cardTitle: (group) => `Pathways in ${group}`,
  cardWeek: (week) => `Week ${week}`,
  notGiven: (names) => `Not given yet: ${names}`,
  change: "Change pathways and cases",
  option: (week) => `Week ${week} · Pathways and cases`,
  hint: "Weeks 3 and 4 give something out. Weeks 1, 2, 5 and 6 don’t.",
  eyebrow: (group, session) => `${group} · after session ${session}`,
  tonight: "Copy in the slips you handed out tonight.",
  saved: (have, of, week) => `Saved. ${have} of ${of} have a pathway and a case. Each person sees theirs on their week ${week} page.`,
  foot: (week) => `Each person sees theirs on their week ${week} page. No email.`,
  notGivenYet: "Not given yet",
  choosePathwayFirst: "Choose a pathway first",
  now: (week) => `Week ${week} is the week people are working on now. Its session has started.`,
  workingOnNow: /is the week people are working on now/,
  ask: "Changing a case takes back that person’s Ready for my talk.",
  saveAnyway: "Save anyway",
  cancel: "Cancel",
  leaving: (n) => `You’ve changed ${n === 1 ? "1 person" : `${n} people`} and haven’t saved.`,
  leave: "Leave without saving",
  yourCase: "Your case",
  yourPathway: "Your pathway",
  ready: "Ready for my talk",
});

let skipReasonFor = () => null;

function loadState() {
  return readState(SPEC.name, RUN_STATE_DIR);
}

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

const state = loadState();
const playwright = await loadPlaywright();
const [term] = state?.terms ?? [];

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !term
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an admin's, and this harness cannot create an admin."
      : null;

async function waitFor(what, predicate, { timeout = WAIT_MS } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const answer = await predicate();
    if (answer) return answer;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeout}ms waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flat = (text) => text.replace(/\s+/g, " ").trim();
const textOf = async (locator) => flat((await locator.textContent()) ?? "");

test("course hub: the draw, copied in during the session that hands the slips out, and a member's case", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const personOf = (key) => {
    const found = term.people.find((person) => person.key === key);
    assert.ok(found, `the draw term has nobody called ${key}`);
    return found;
  };
  const [ada, ben] = ["ada", "ben"].map(personOf);
  const fern = term.facilitator;
  assert.ok(fern, "the draw term has no account to appoint as a facilitator");
  const group = term.groups[0];
  assert.equal(term.groups.length, 1, "the draw term has more than its one group");
  for (const person of term.people) assert.equal(person.groupKey, group.key, `${person.first} is not in ${group.name}`);

  // The run's week, by its own calendar: the world promises week 3, and the group's session today.
  const elapsedDays = Math.round((Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${term.startDate}T00:00:00Z`)) / 86_400_000);
  const week = Math.floor(elapsedDays / 7) + 1;
  assert.equal(week, 3, `the term is in week ${week}, not week 3`);
  assert.equal(elapsedDays, DRAW_NIGHT.daysIn, "the seed's day is not the group's session day");
  const next = week + 1;
  const [harbour, keepers] = DRAW_SLIPS.packs;

  const formBase = `${origin}/admin/admissions/forms/${enc(term.formId)}/programmes/${enc(term.programmeId)}`;
  const groupUrl = `${origin}/learn/${enc(term.runId)}/group/${enc(group.id)}`;
  const drawPath = `/learn/draw/${enc(group.id)}`;

  const { browser, context, page: adminPage } = await openBrowser();
  const identities = [];
  for (let i = 0; i < 2; i += 1) identities.push(await newIdentityPage(browser));
  const [fernPage, adaPage] = identities.map((each) => each.page);

  let activePage = adminPage;
  const recorder = createStepRecorder({
    t,
    page: {
      screenshot: (options) => activePage.screenshot(options),
      locator: (selector) => activePage.locator(selector),
      url: () => activePage.url(),
      context: () => activePage.context(),
    },
    markerPath: MARKER,
    artifactsDir: ARTIFACTS_DIR,
    skipReasonFor: (name) => skipReasonFor(name),
  });
  const step = (name, fn) => recorder.step(name, fn);

  const recaptchaStubbed = await stubRecaptchaOnLoopback(adminPage, origin);
  for (const pg of [fernPage, adaPage]) await stubRecaptchaOnLoopback(pg, origin);
  if (!recaptchaStubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);

  const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });
  const responseTo = (pg, suffix, method) =>
    pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });
  async function okBody(response, what) {
    const body = await response.json().catch(() => null);
    assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }

  /** The draw's records on the term's run. */
  const drawRows = async () => (await fixtureQuery("coursePacksAndCases").where("runId", "==", term.runId).get()).docs.map((doc) => doc.data());
  /** The Week picker, and the week it is on. */
  const picker = (pg) => pg.getByLabel("Week", { exact: true });
  /** One person's box on the draw page: the fieldset their name is the legend of. */
  const personBox = (pg, person) => pg.getByRole("group", { name: new RegExp(`^${escapeRegExp(person.first)}\\b`) });
  /** Whether the London day is still the session's, so "tonight" still holds. */
  const sessionDay = londonDateKey(new Date());
  const stillTonight = () => londonDateKey(new Date()) === sessionDay;

  try {
    await step("the admin approves everybody who signs in on this journey", async () => {
      activePage = adminPage;
      await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
      for (const account of [fern, ada]) {
        await approvePendingApplicant(adminPage, origin, { email: account.email });
        await waitFor(`${account.first}'s account to say member`, async () => (await readUserDoc(account.uid))?.role === "member");
      }
    });

    await step("the admin names the running course run on the programme's Settings tab and hands its people over", async () => {
      activePage = adminPage;
      await adminPage.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
      const panel = adminPage.getByRole("region", { name: "Course run" });
      await panel.waitFor({ timeout: WAIT_MS });
      const runBox = panel.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([
        responseTo(adminPage, `/programmes/${term.programmeId}/run`, "PUT"),
        runBox.selectOption({ label: `${term.runLabel} · Running` }),
      ]);
      assert.equal((await okBody(named, "Naming the run")).panel?.runId, term.runId);
      const holding = term.people.length;
      const [handOver] = await Promise.all([
        responseTo(adminPage, "/run/hand-over", "POST"),
        panel.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
      ]);
      assert.deepEqual((await okBody(handOver, "Handing over")).receipt, { handedOver: holding, alreadyThere: 0 });
    });

    await step("the admin appoints a facilitator to the group", async () => {
      activePage = adminPage;
      await adminPage.goto(`${formBase}/groups/facilitators`, { waitUntil: "domcontentloaded" });
      const card = adminPage.locator('section[aria-labelledby="facilitators-title"]');
      await card.getByRole("button", { name: `Change ${group.name}’s facilitators`, exact: true }).click();
      await card.getByPlaceholder("Search people…").fill(fern.displayName);
      await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(fern.displayName)) }).check();
      const [saved] = await Promise.all([
        responseTo(adminPage, `/groups/${group.id}/facilitators`, "POST"),
        card.getByRole("button", { name: "Save", exact: true }).click(),
      ]);
      assert.deepEqual((await okBody(saved, "Saving the facilitators")).facilitatorUids, [fern.uid]);
    });

    await step("during the session the group page's card is about next week, and opens the draw on it", async () => {
      activePage = fernPage;
      await signIn(fernPage, fern);
      await fernPage.goto(groupUrl, { waitUntil: "domcontentloaded" });
      const card = fernPage.locator('section[aria-labelledby="group-spread"]');
      await card.getByRole("heading", { name: WORDS.cardTitle(group.name), exact: true }).waitFor({ timeout: WAIT_MS });
      await card.getByText(WORDS.cardWeek(next), { exact: true }).waitFor({ timeout: WAIT_MS });
      // Nobody has a pathway for next week yet: Fern takes part too, so the three of them.
      const said = await textOf(card);
      assert.ok(said.includes(WORDS.notGiven(`${ada.first}, ${ben.first} and ${fern.first}`)), `the card does not say who has nothing: ${said}`);
      for (const pack of DRAW_SLIPS.packs) assert.ok(said.includes(pack.name), `the card has no tile for ${pack.name}: ${said}`);
      const link = card.getByRole("link", { name: new RegExp(`^${escapeRegExp(WORDS.change)}`) });
      assert.equal(new URL(await link.getAttribute("href"), origin).search, `?week=${next}`, "the card does not open the draw on next week");
      await Promise.all([fernPage.waitForURL((url) => url.pathname === drawPath, { timeout: WAIT_MS }), link.click()]);
    });

    await step("the draw page is about next week, its Week picker lists every week that gives something out, and it says tonight's slips go in here", async () => {
      activePage = fernPage;
      // The page without an address's week opens on the same week the card does.
      await fernPage.goto(`${origin}${drawPath}`, { waitUntil: "domcontentloaded" });
      await fernPage.getByRole("heading", { level: 1, name: WORDS.title, exact: true }).waitFor({ timeout: WAIT_MS });
      const main = fernPage.locator("main");
      await main.getByText(WORDS.eyebrow(group.name, week), { exact: true }).waitFor({ timeout: WAIT_MS });
      const options = (await picker(fernPage).locator("option").allTextContents()).map(flat);
      assert.deepEqual(options, [WORDS.option(week), WORDS.option(next)]);
      assert.equal(await picker(fernPage).inputValue(), String(next), "the draw page is not on next week");
      await main.getByText(WORDS.hint, { exact: true }).waitFor({ timeout: WAIT_MS });
      if (stillTonight()) await main.getByText(WORDS.tonight, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await main.getByText(WORDS.workingOnNow).count(), 0, "next week is called the week people are working on now");
      await main.getByText(WORDS.foot(next), { exact: true }).waitFor({ timeout: WAIT_MS });
    });

    await step("the facilitator copies two people's slips in and saves, and the page says how many have theirs", async () => {
      activePage = fernPage;
      for (const [person, pack] of [
        [ada, harbour],
        [ben, keepers],
      ]) {
        const box = personBox(fernPage, person);
        // Grouped by pathway: no case is offered until the person has one.
        const caseList = box.getByLabel("Case", { exact: true });
        assert.ok(await caseList.isDisabled(), `${person.first}'s case list is open before they have a pathway`);
        assert.equal(flat((await caseList.locator("option:checked").textContent()) ?? ""), WORDS.choosePathwayFirst);
        await box.getByLabel(DRAW_SLIPS.chooseOneTitle, { exact: true }).selectOption({ label: pack.name });
        await box.getByLabel("Case", { exact: true }).selectOption({ label: pack.cases[0].title });
      }
      const save = fernPage.getByRole("button", { name: "Save", exact: true });
      const [saved] = await Promise.all([responseTo(fernPage, `/groups/${group.id}/draw`, "PUT"), save.click()]);
      assert.deepEqual(await okBody(saved, "Saving the draw"), { ok: true, saved: 4 });
      // Fern takes part too and has nothing yet: two of the three.
      await fernPage.getByText(WORDS.saved(2, 3, next), { exact: true }).waitFor({ timeout: WAIT_MS });
      const rows = await drawRows();
      assert.equal(rows.length, 4, `the draw wrote ${rows.length} records, not 4`);
      for (const row of rows) assert.equal(row.weekNumber, next, "a slip was saved into the session's own week");
    });

    await step("a member reads their pathway and case on that week's page, and nobody was emailed", async () => {
      activePage = adaPage;
      await signIn(adaPage, ada);
      await adaPage.goto(`${origin}/learn/${enc(term.runId)}/weeks/${next}`, { waitUntil: "domcontentloaded" });
      // Her case card names her case as its heading; the full list under it names cases in plain lines.
      await adaPage.getByRole("heading", { level: 3, name: harbour.cases[0].title, exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await adaPage.getByRole("heading", { level: 3, name: WORDS.notGivenYet, exact: true }).count(), 0, "Ada's case card still says not given yet");
      const words = await textOf(adaPage.locator("main"));
      const at = words.indexOf(WORDS.yourCase);
      assert.ok(at >= 0 && words.indexOf(harbour.cases[0].title, at) > at, `Ada's week ${next} page does not show her case under Your case: ${words}`);
      assert.ok(words.includes(WORDS.yourPathway), `Ada's pathway is not marked as hers: ${words}`);
      assert.ok(words.includes(WORDS.ready), "Ada's case has no ready box");
      if (mailIsCaught({ origin })) {
        // Her approval's email, and nothing from the draw.
        await waitForMessagesTo(ada.email, { count: 1, timeoutMs: WAIT_MS });
        assert.equal((await messagesTo(ada.email)).length, 1, "copying the slips in emailed Ada");
      }
    });

    await step("the session's own week says it is the week people are working on now, and Save asks before it changes anything", async () => {
      activePage = fernPage;
      await Promise.all([
        fernPage.waitForURL((url) => url.pathname === drawPath && url.searchParams.get("week") === String(week), { timeout: WAIT_MS }),
        picker(fernPage).selectOption(String(week)),
      ]);
      const main = fernPage.locator("main");
      await main.getByText(WORDS.now(week), { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await main.getByText(WORDS.tonight, { exact: true }).count(), 0, "the session's own week says tonight's slips go in here");
      assert.equal(await picker(fernPage).inputValue(), String(week));
      const box = personBox(fernPage, ada);
      // Week 3's own editor, as week 3 is: nothing typed for week 4 is carried in.
      const pathwayList = box.getByLabel(DRAW_SLIPS.chooseOneTitle, { exact: true });
      assert.equal(await pathwayList.inputValue(), "", "Ada's week 3 pathway is not empty: something was carried over from week 4");
      assert.equal(flat((await pathwayList.locator("option:checked").textContent()) ?? ""), WORDS.notGivenYet);
      assert.ok(await box.getByLabel("Case", { exact: true }).isDisabled(), "Ada's week 3 case list is open with no pathway");
      await main.getByText(WORDS.foot(week), { exact: true }).waitFor({ timeout: WAIT_MS });
      await pathwayList.selectOption({ label: keepers.name });
      let puts = 0;
      const count = (request) => {
        if (request.method() === "PUT" && new URL(request.url()).pathname.endsWith(`/groups/${group.id}/draw`)) puts += 1;
      };
      fernPage.on("request", count);
      await fernPage.getByRole("button", { name: "Save", exact: true }).click();
      // What Save asks, named by its own sentences: which week this is first, then what a changed case does.
      const asked = main.getByRole("group", { name: new RegExp(`^${escapeRegExp(WORDS.now(week))}`) });
      await asked.waitFor({ timeout: WAIT_MS });
      const lines = (await asked.locator("p").allTextContents()).map(flat);
      assert.deepEqual(lines, [WORDS.now(week), WORDS.ask], "Save asks something other than which week it is and what a changed case does");
      await asked.getByRole("button", { name: WORDS.saveAnyway, exact: true }).waitFor({ timeout: WAIT_MS });
      await asked.getByRole("button", { name: WORDS.cancel, exact: true }).click();
      await waitFor("the ask to go", async () => (await main.getByText(WORDS.ask, { exact: true }).count()) === 0);
      fernPage.off("request", count);
      assert.equal(puts, 0, "Save sent the change before it asked");
      assert.equal((await drawRows()).length, 4, "the session's own week changed");
    });

    await step("leaving with a change not saved asks first, and leaving without saving changes nothing", async () => {
      activePage = fernPage;
      const main = fernPage.locator("main");
      // The way back to the group: the phone's bar or the laptop's breadcrumb, whichever this width shows.
      await main.getByRole("link", { name: group.name, exact: true }).filter({ visible: true }).first().click();
      const leaving = main.getByRole("group", { name: WORDS.leaving(1), exact: true });
      await leaving.waitFor({ timeout: WAIT_MS });
      assert.equal(new URL(fernPage.url()).pathname, drawPath, "the page left before it asked");
      await Promise.all([
        fernPage.waitForURL((url) => url.pathname === new URL(groupUrl).pathname, { timeout: WAIT_MS }),
        leaving.getByRole("button", { name: WORDS.leave, exact: true }).click(),
      ]);
      const rows = await drawRows();
      assert.equal(rows.length, 4);
      assert.ok(rows.every((row) => row.weekNumber === next), "leaving without saving saved something");
    });
  } finally {
    await Promise.allSettled([context, ...identities.map((each) => each.context)].map((each) => each.close()));
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
