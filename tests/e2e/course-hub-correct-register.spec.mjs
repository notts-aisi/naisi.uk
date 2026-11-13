/**
 * END-TO-END: a register that is wrong, driven by the people who use it and
 * read as the people it affects, in a real browser.
 *
 * The term three weeks in (scripts/e2e-fixtures/worlds/course-hub-term.mjs,
 * point "week-three-unmarked"): Group A's weeks 1 and 2 registers are
 * finished and its week 3 register was never opened. The admin approves the
 * people, Gus and Hal, makes Gus SU-recognised committee, names the run and
 * Gus as the programme's lead, hands the people over, appoints Fern to Group
 * A and Hal to Group B. Then:
 *
 *  1. FERN, Group A's facilitator, finishes week 3's register with Ada down
 *     as absent by mistake, opens Ada's line and asks for a correction with
 *     why. The line says the ask is waiting. Nobody is emailed.
 *  2. GUS, the programme's lead, opens the Requests page from Home, opens the
 *     request, takes it and approves it. The register's line changes. Nobody
 *     is emailed.
 *  3. ADA reads "Corrected on" with the day on her programme page, and not
 *     who corrected it or why; BEN, in the same group, reads nothing.
 *  4. FERN reads "as you asked" on the line; asks about Ben's line, withdraws
 *     it, asks again; Gus declines it with a reply, which Fern reads on the
 *     line; HAL, Group B's facilitator, cannot open Group A's register and
 *     reads no reply on his own.
 *  5. THE ADMIN opens Group A's "Attendance, all weeks", corrects Ben's week
 *     2 line with why, reads that week 1's column cannot push the rest back
 *     because a later week has met (the choice is not offered, and the sheet
 *     says why), corrects week 1's whole column as held online after
 *     reading "Before you save", and the group's History keeps each under
 *     Registers. Nobody is emailed.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-correct-register
 *
 * It declares `requiresCaughtMail`: the runner skips it anywhere but a server
 * it started with its mail forced into Mailpit, because "nobody is emailed"
 * is read off the harness's own mailboxes.
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
import { messagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  fixtureDoc,
  fixtureQuery,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-correct-register.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;
const POLL_MS = 500;

/** The words the pages say, restated from src/lib/courses/registerCorrection/pageWords.ts and the pages that draw them. */
const WORDS = {
  committee: "Committee",
  recognisedSwitch: "SU-recognised committee",
  chooseLead: "Choose a lead",
  ask: "Ask for a correction",
  correct: "Correct this line",
  withdraw: "Withdraw the correction",
  attendanceTab: "Attendance, all weeks",
  heldOnline: "It was held online",
  beforeYouSave: "Before you save",
};

/** Why each correction is asked for or made: one line each, no link. */
const WHY = {
  ada: "Ada was there all session. I tapped the wrong line.",
  benFirst: "Ben came in ten minutes after the start.",
  benAgain: "Ben left before the second exercise.",
  reply: "Ben stayed to the end: I saw Ben leave with everybody.",
  benWeek2: "Ben told us in advance and we missed the message.",
  online: "The room was flooded, so the whole session ran on the call.",
};

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

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flat = (text) => text.replace(/\s+/g, " ").trim();
const textOf = async (locator) => flat((await locator.textContent()) ?? "");

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: a register that is wrong, by the facilitator, the lead and an admin, read by the people it is about",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const fern = state.facilitator;
    const gus = state.lead;
    const hal = state.otherFacilitator;
    const groupA = state.groups.find((group) => group.key === "A");
    const groupB = state.groups.find((group) => group.key === "B");
    const ada = state.people.find((person) => person.key === "ada");
    const ben = state.people.find((person) => person.key === "ben");
    const cleo = state.people.find((person) => person.key === "cleo");
    for (const [key, value] of Object.entries({ fern, gus, hal, groupA, groupB, ada, ben, cleo })) assert.ok(value, `the term has no ${key}`);
    const everybody = [ada, ben, cleo, fern, gus, hal];

    const formPath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const formBase = `${origin}${formPath}`;
    const groupPagePath = (group) => `${formPath}/groups/${enc(group.id)}`;
    const registerPath = (group) => `/learn/${enc(state.runId)}/group/${enc(group.id)}/register`;
    const registerDocPath = (group, weekNumber) => `${state.runId}__${group.id}__w0${weekNumber}`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: fernContext, page: fernPage } = await newIdentityPage(browser);
    const { context: gusContext, page: gusPage } = await newIdentityPage(browser);
    const { context: adaContext, page: adaPage } = await newIdentityPage(browser);
    const { context: benContext, page: benPage } = await newIdentityPage(browser);
    const { context: halContext, page: halPage } = await newIdentityPage(browser);

    /** Which page a failed step photographs: each step names its page first. */
    let activePage = adminPage;
    const recorderPage = {
      screenshot: (options) => activePage.screenshot(options),
      locator: (selector) => activePage.locator(selector),
      url: () => activePage.url(),
      context: () => activePage.context(),
    };
    const recorder = createStepRecorder({
      t,
      page: recorderPage,
      markerPath: MARKER,
      artifactsDir: ARTIFACTS_DIR,
      skipReasonFor: (name) => skipReasonFor(name),
    });
    const step = (name, fn) => recorder.step(name, fn);

    const recaptchaStubbed = await stubRecaptchaOnLoopback(adminPage, origin);
    for (const pg of [fernPage, gusPage, adaPage, benPage, halPage]) await stubRecaptchaOnLoopback(pg, origin);
    if (!recaptchaStubbed) {
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);
    }

    const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });

    /** The answer to the next request whose path ends `suffix`, by `method`. */
    const responseTo = (pg, suffix, method) =>
      pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });

    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    const storedRegister = async (group, weekNumber) => (await fixtureDoc("courseAttendance", registerDocPath(group, weekNumber)).get()).data() ?? null;
    const requestsOfRun = async () => (await fixtureQuery("courseRequests").where("runId", "==", state.runId).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    /** Every person's caught mail, counted, so "nobody is emailed" can be read back. */
    async function mailCounts() {
      const out = {};
      for (const account of everybody) out[account.key] = (await messagesTo(account.email)).length;
      return out;
    }
    async function assertNobodyEmailed(before, what) {
      // A beat for anything that would have gone to land in Mailpit first.
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const after = await mailCounts();
      assert.deepEqual(after, before, `somebody was emailed by ${what}`);
    }

    /** A row of the register's grid, by the person's name. */
    const rowOf = (pg, person) => pg.getByTestId("attendance-grid").getByRole("row").filter({ hasText: person.first }).first();
    /** A person's week 3 cell on Group A's register: its third column. */
    const week3 = (pg, person) => rowOf(pg, person).getByTestId("attendance-cell").nth(2);

    /** Taps one cell `times` times, waiting for each save. */
    async function tap(pg, cell, times) {
      for (let i = 0; i < times; i += 1) {
        const [saved] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/attendance`, "POST"), cell.click()]);
        await okBody(saved, "Saving a line");
      }
    }

    /** Opens a finished line's sheet and asks for a correction: what it should say, and why. */
    async function askFor(pg, person, to, why) {
      await week3(pg, person).click();
      const sheet = pg.getByTestId("line-sheet");
      await sheet.getByRole("heading", { name: WORDS.ask, exact: true }).waitFor({ timeout: WAIT_MS });
      // Every line but the one it says: seven of the eight.
      assert.equal(await sheet.getByRole("radio").count(), 7, "the sheet does not offer every other line");
      await sheet.getByRole("radio", { name: to, exact: true }).check();
      const send = sheet.getByTestId("line-sheet-submit");
      assert.equal(await send.isDisabled(), true, "an ask can be sent with no reason");
      await sheet.getByRole("textbox").fill(why);
      const said = flat(await sheet.innerText());
      assert.ok(said.includes("It goes to the admins and the programme’s lead, who approve or decline it. Nobody is emailed"), said);
      const [asked] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/attendance/requests`, "POST"), send.click()]);
      const body = await okBody(asked, "Asking for a correction");
      assert.equal(body.request?.state, "waiting");
      await sheet.waitFor({ state: "detached", timeout: WAIT_MS });
      return body.request.id;
    }

    /** A line's chip on the register, once the register has read again. */
    async function chipOf(pg, person, expected) {
      return waitFor(`${person.first}'s line to say ${expected ?? "nothing"}`, async () => {
        const chips = rowOf(pg, person).getByTestId("attendance-line-chip");
        const said = (await chips.count()) > 0 ? await textOf(chips.last()) : null;
        return said === expected ? said ?? "none" : null;
      });
    }

    try {
      await step("the admin approves the people, the account that will lead the programme and the other group's facilitator", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [ada, ben, fern, gus, hal]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          await waitFor(`${account.first}'s account to say member`, async () => (await readUserDoc(account.uid))?.role === "member");
        }
      });

      await step("the admin makes the lead's account SU-recognised committee on its member page", async () => {
        activePage = adminPage;
        await adminPage.goto(`${origin}/admin/members/${enc(gus.uid)}`, { waitUntil: "domcontentloaded" });
        const access = adminPage.locator(`section[aria-labelledby="access-${gus.uid}"]`);
        await access.waitFor({ timeout: WAIT_MS });
        await access.getByRole("combobox", { name: "Role", exact: true }).selectOption({ label: WORDS.committee });
        await waitFor("Gus's account to say committee", async () => (await readUserDoc(gus.uid))?.role === "committee");
        const recognised = access.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(WORDS.recognisedSwitch)}`) });
        await recognised.waitFor({ state: "attached", timeout: WAIT_MS });
        await recognised.locator("xpath=ancestor::label[1]").click();
        await waitFor("Gus's account to say SU-recognised", async () => (await readUserDoc(gus.uid))?.suRecognised === true);
      });

      await step("the admin names the running course run and the programme's lead on the Settings tab, and hands its people over", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
        const region = adminPage.getByRole("region", { name: "Course run" });
        await region.waitFor({ timeout: WAIT_MS });
        const runBox = region.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [named] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${state.runLabel} · Running` }),
        ]);
        assert.equal((await okBody(named, "Naming the run")).panel?.runId, state.runId, "the panel names another run");
        const holding = state.people.length;
        const [handOver] = await Promise.all([
          responseTo(adminPage, "/run/hand-over", "POST"),
          region.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
        ]);
        await okBody(handOver, "Handing over");
        await region.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });

        await adminPage.getByRole("button", { name: WORDS.chooseLead, exact: true }).click();
        const menu = adminPage.getByRole("menu", { name: WORDS.chooseLead });
        const [rolesResponse] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/roles`, "PUT"),
          menu.getByRole("menuitem", { name: new RegExp(escapeRegExp(gus.displayName)) }).click(),
        ]);
        assert.equal((await okBody(rolesResponse, "Naming the lead")).programme?.lead?.uid, gus.uid, "the programme's lead is not the one chosen");
      });

      await step("the admin appoints a facilitator to each group", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/groups/facilitators`, { waitUntil: "domcontentloaded" });
        const card = adminPage.locator('section[aria-labelledby="facilitators-title"]');
        await card.getByText(`0 facilitators for ${state.groups.length} groups`, { exact: true }).waitFor({ timeout: WAIT_MS });
        for (const [group, person] of [
          [groupA, fern],
          [groupB, hal],
        ]) {
          await card.getByRole("button", { name: `Change ${group.name}’s facilitators`, exact: true }).click();
          await card.getByPlaceholder("Search people…").fill(person.displayName);
          await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(person.displayName)) }).check();
          const [response] = await Promise.all([
            responseTo(adminPage, `/groups/${group.id}/facilitators`, "POST"),
            card.getByRole("button", { name: "Save", exact: true }).click(),
          ]);
          assert.deepEqual((await okBody(response, "Saving the facilitators")).facilitatorUids, [person.uid]);
        }
      });

      let adaRequest = null;
      await step("the facilitator finishes week 3's register with a wrong line, asks for a correction with why, and the line says the ask is waiting; nobody is emailed by the ask", async () => {
        activePage = fernPage;
        await signIn(fernPage, { email: fern.email, password: fern.password });
        await fernPage.goto(`${origin}${registerPath(groupA)}?session=w03`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        // Ada down as absent by mistake (present, late, left early, absent), Ben in the room.
        await tap(fernPage, week3(fernPage, ada), 4);
        await tap(fernPage, week3(fernPage, ben), 1);
        const ending = fernPage.getByTestId("register-ending");
        await ending.getByRole("button").first().click();
        const confirm = fernPage.getByTestId("push-confirm");
        await confirm.waitFor({ timeout: WAIT_MS });
        // The Finish sheet says what comes after Finish, truly.
        assert.ok(
          flat(await confirm.innerText()).includes(
            "The register locks. After that, a change goes through an admin or the programme’s lead, asked for from the line, and every change records who made it, when and why.",
          ),
          "the Finish sheet does not say a change goes through an admin or the programme's lead",
        );
        const [pushed] = await Promise.all([responseTo(fernPage, `/groups/${groupA.id}/attendance/push`, "POST"), confirm.getByTestId("push-confirm-submit").click()]);
        await okBody(pushed, "Finishing the register");
        await waitFor("the register to be finished", async () => Boolean((await storedRegister(groupA, 3))?.pushedAt));
        await fernPage.reload({ waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });

        const before = await mailCounts();
        // A finished line asks rather than changes: its control says so.
        assert.match((await week3(fernPage, ada).getAttribute("aria-label")) ?? "", /: Absent\. Ask for a correction\.$/);
        adaRequest = await askFor(fernPage, ada, "In the room", WHY.ada);
        await chipOf(fernPage, ada, "Asked");
        await week3(fernPage, ada).click();
        const sheet = fernPage.getByTestId("line-sheet");
        const line = await textOf(sheet.getByTestId("line-request"));
        assert.match(line, /^You asked for In the room at \d{1,2}(:\d{2})?(am|pm)\. Waiting for an admin or the programme’s lead\.$/, line);
        await sheet.getByRole("button", { name: WORDS.withdraw, exact: true }).waitFor({ timeout: WAIT_MS });
        await sheet.getByRole("button", { name: "Close", exact: true }).click();
        await sheet.waitFor({ state: "detached", timeout: WAIT_MS });

        const stored = (await requestsOfRun()).find((each) => each.id === adaRequest);
        assert.deepEqual(
          [stored?.status, stored?.askedByUid, stored?.subjectUid, stored?.reason, stored?.change?.to?.mark],
          ["waiting", fern.uid, ada.uid, WHY.ada, "present"],
        );
        assert.equal((await storedRegister(groupA, 3))?.records?.[ada.uid], "absent", "asking changed the line");
        await assertNobodyEmailed(before, "asking for a correction");
      });

      await step("the lead opens the Requests page from Home, takes the request and approves it; the register's line changes, and nobody is emailed", async () => {
        activePage = gusPage;
        const before = await mailCounts();
        await signIn(gusPage, { email: gus.email, password: gus.password });
        await gusPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        const card = gusPage.getByTestId("home-requests");
        await card.waitFor({ timeout: WAIT_MS });
        const home = flat(await card.innerText());
        assert.ok(home.startsWith("1") && home.includes("Request waiting") && home.includes("A facilitator has asked for a line of a register to be corrected."), home);
        await card.getByRole("link", { name: "Open" }).click();
        await gusPage.waitForURL((url) => url.pathname === "/admin/admissions/requests", { timeout: WAIT_MS });
        const row = gusPage.getByTestId("request-row").filter({ hasText: ada.first }).first();
        await row.waitFor({ timeout: WAIT_MS });
        const said = await textOf(row);
        assert.ok(said.includes(`${fern.first}`) && said.includes("Register correction") && said.includes("week 3:") && said.includes("Absent to In the room") && said.includes("Nobody has it yet"), said);
        await row.getByRole("link").click();
        await gusPage.waitForURL((url) => url.pathname === `/admin/admissions/requests/${adaRequest}`, { timeout: WAIT_MS });
        const what = await textOf(gusPage.getByTestId("request-what"));
        assert.ok(what.includes(`“${WHY.ada}”`), `the request's page does not say why: ${what}`);
        const decide = gusPage.getByTestId("request-decide");
        assert.ok((await textOf(decide)).includes("Nobody is emailed."), "the request's page does not say nobody is emailed");

        const [taken] = await Promise.all([responseTo(gusPage, `/requests/${adaRequest}/take`, "POST"), gusPage.getByTestId("request-take").click()]);
        assert.equal((await okBody(taken, "Taking the request")).handlingUid, gus.uid);
        await gusPage.getByText("You have it.", { exact: true }).waitFor({ timeout: WAIT_MS });
        const [approved] = await Promise.all([responseTo(gusPage, `/requests/${adaRequest}/approve`, "POST"), gusPage.getByTestId("request-approve").click()]);
        assert.equal((await okBody(approved, "Approving the request")).status, "approved");

        const register = await waitFor("Ada's line to say in the room", async () => {
          const doc = await storedRegister(groupA, 3);
          return doc?.records?.[ada.uid] === "present" ? doc : null;
        });
        assert.ok(register.corrected?.[ada.uid], "the line is not stamped as corrected");
        assert.equal(register.setBy?.[ada.uid]?.how, "correction");
        const rows = (await fixtureQuery("courseAudit").where("runId", "==", state.runId).get()).docs.map((doc) => doc.data());
        assert.ok(rows.some((each) => each.kind === "attendance-edit" && each.requestId === adaRequest && each.reason === WHY.ada), "the history has no row for the approved request");
        await assertNobodyEmailed(before, "taking and approving a request");
      });

      await step("the member whose line it was reads Corrected on and nothing more; another member of the group reads nothing", async () => {
        activePage = adaPage;
        await signIn(adaPage, { email: ada.email, password: ada.password });
        await adaPage.goto(`${origin}/learn/${enc(state.runId)}`, { waitUntil: "domcontentloaded" });
        const corrected = adaPage.getByTestId("marks-corrected");
        await corrected.waitFor({ timeout: WAIT_MS });
        assert.match(await textOf(corrected), /^Week 3, \w{3} \d{1,2} \w{3}: corrected on \w{3} \d{1,2} \w{3}\.$/);
        const page = await textOf(adaPage.locator("main"));
        for (const never of [WHY.ada, "Corrected by", "as you asked"]) {
          assert.ok(!page.includes(never), `Ada's page says "${never}"`);
        }

        activePage = benPage;
        await signIn(benPage, { email: ben.email, password: ben.password });
        await benPage.goto(`${origin}/learn/${enc(state.runId)}`, { waitUntil: "domcontentloaded" });
        await benPage.getByRole("region", { name: "Your sessions", exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await benPage.getByTestId("marks-corrected").count(), 0, "Ben's page says a line was corrected");
        assert.ok(!(await textOf(benPage.locator("main"))).includes(WHY.ada), "Ben's page carries the reason for Ada's line");
      });

      await step("the facilitator reads as you asked; a second ask is withdrawn, asked again and declined with a reply, which the facilitator reads and the other group's facilitator cannot", async () => {
        activePage = fernPage;
        const before = await mailCounts();
        await fernPage.reload({ waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        await chipOf(fernPage, ada, "Corrected");
        await week3(fernPage, ada).click();
        const sheet = fernPage.getByTestId("line-sheet");
        assert.match(await textOf(sheet.getByTestId("line-request")), new RegExp(`^Corrected by ${escapeRegExp(gus.first)} at .+, as you asked\\.$`));
        assert.ok((await textOf(sheet.getByTestId("line-story"))).startsWith("Was Absent"), "the corrected line does not say what it was");
        await sheet.getByRole("button", { name: "Close", exact: true }).click();
        await sheet.waitFor({ state: "detached", timeout: WAIT_MS });

        // Ask, withdraw, ask again.
        const first = await askFor(fernPage, ben, "Arrived late, in the room", WHY.benFirst);
        await chipOf(fernPage, ben, "Asked");
        await week3(fernPage, ben).click();
        const [withdrawn] = await Promise.all([
          responseTo(fernPage, `/requests/${first}/withdraw`, "POST"),
          fernPage.getByTestId("line-sheet").getByRole("button", { name: WORDS.withdraw, exact: true }).click(),
        ]);
        assert.equal((await okBody(withdrawn, "Withdrawing the request")).status, "withdrawn");
        await chipOf(fernPage, ben, null);
        const second = await askFor(fernPage, ben, "Left early, in the room", WHY.benAgain);

        activePage = gusPage;
        await gusPage.goto(`${origin}/admin/admissions/requests`, { waitUntil: "domcontentloaded" });
        await gusPage.getByTestId("request-row").filter({ hasText: ben.first }).first().getByRole("link").click();
        await gusPage.waitForURL((url) => url.pathname === `/admin/admissions/requests/${second}`, { timeout: WAIT_MS });
        const decline = gusPage.getByTestId("request-decline");
        assert.equal(await decline.isDisabled(), true, "a request can be declined with no reply");
        await gusPage.getByRole("textbox", { name: `Reply to ${fern.first} (needed to decline)` }).fill(WHY.reply);
        const [declined] = await Promise.all([responseTo(gusPage, `/requests/${second}/decline`, "POST"), decline.click()]);
        assert.equal((await okBody(declined, "Declining the request")).status, "declined");
        assert.equal((await storedRegister(groupA, 3))?.records?.[ben.uid], "present", "declining changed the line");

        activePage = fernPage;
        await fernPage.reload({ waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        await chipOf(fernPage, ben, "Declined");
        await week3(fernPage, ben).click();
        const declinedLine = await textOf(fernPage.getByTestId("line-sheet").getByTestId("line-request"));
        assert.ok(declinedLine.includes(`declined by ${gus.first}`) && declinedLine.includes(`“${WHY.reply}”`), `the facilitator does not read the reply: ${declinedLine}`);

        // Hal facilitates Group B: Group A's register is not his to open, and
        // nothing on his own carries the reply or a reason.
        activePage = halPage;
        await signIn(halPage, { email: hal.email, password: hal.password });
        await halPage.goto(`${origin}${registerPath(groupA)}`, { waitUntil: "domcontentloaded" });
        await halPage.waitForURL((url) => url.pathname === `/learn/${state.runId}`, { timeout: WAIT_MS });
        const theirs = await halPage.evaluate(async (path) => {
          const res = await fetch(path);
          return { status: res.status, text: await res.text() };
        }, `/api/courses/groups/${enc(groupA.id)}/attendance`);
        assert.equal(theirs.status, 403, "another group's facilitator reads Group A's register");
        const own = await halPage.evaluate(async (path) => {
          const res = await fetch(path);
          return { status: res.status, text: await res.text() };
        }, `/api/courses/groups/${enc(groupB.id)}/attendance`);
        assert.equal(own.status, 200, `Hal cannot read his own register: ${own.text.slice(0, 200)}`);
        for (const never of [WHY.reply, WHY.benAgain, WHY.ada]) assert.ok(!own.text.includes(never), `Hal's register carries "${never}"`);
        await assertNobodyEmailed(before, "asking, withdrawing and declining");
      });

      await step("the admin corrects a line and then a whole column as held online from the group's Attendance tab, after reading Before you save, and the group's history keeps each under Registers", async () => {
        activePage = adminPage;
        const before = await mailCounts();
        await adminPage.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("tab", { name: WORDS.attendanceTab, exact: true }).click();
        const table = adminPage.getByTestId("group-attendance");
        await table.waitFor({ timeout: WAIT_MS });
        const benRow = table.getByRole("row").filter({ hasText: ben.first }).first();
        const adaRow = table.getByRole("row").filter({ hasText: ada.first }).first();
        // Week 3 is corrected, as the tab says; week 2 is Ben's absence.
        assert.ok((await textOf(adaRow)).includes("Corrected"), "the corrected line does not say Corrected on the tab");
        const benWeek2 = benRow.getByTestId("group-attendance-cell").nth(1);
        assert.equal(await textOf(benWeek2), "Absent");
        await benWeek2.click();
        const sheet = adminPage.getByTestId("line-sheet");
        await sheet.getByRole("heading", { name: WORDS.correct, exact: true }).waitFor({ timeout: WAIT_MS });
        assert.ok(flat(await sheet.innerText()).includes("Nobody is emailed."), "the correction does not say nobody is emailed");
        await sheet.getByRole("radio", { name: "Excused", exact: true }).check();
        await sheet.getByRole("textbox").fill(WHY.benWeek2);
        const [corrected] = await Promise.all([responseTo(adminPage, `/groups/${groupA.id}/attendance`, "PATCH"), sheet.getByTestId("line-sheet-submit").click()]);
        assert.equal((await okBody(corrected, "Correcting a line")).marked, 1);
        await waitFor("Ben's week 2 to say excused", async () => (await storedRegister(groupA, 2))?.records?.[ben.uid] === "excused");

        await table.getByTestId("group-attendance-column").first().click();
        const column = adminPage.getByTestId("column-sheet");
        await column.getByRole("heading", { name: "Correct week 1’s whole column", exact: true }).waitFor({ timeout: WAIT_MS });
        // It didn't happen: weeks 2 and 3 have met, so pushing the rest back is
        // not offered, and the sheet says why in the group page's own words.
        const [keepPace] = await Promise.all([
          responseTo(adminPage, `/groups/${groupA.id}/attendance/column`, "POST"),
          column.getByRole("radio", { name: /^It didn’t happen/ }).check(),
        ]);
        assert.deepEqual((await okBody(keepPace, "Previewing It didn't happen")).preview?.push, {
          offered: false,
          why: "A later week has already met, so the rest can’t be pushed back.",
        });
        await waitFor("the sheet to say why push back is not offered", async () =>
          (await textOf(column)).includes("A later week has already met, so the rest can’t be pushed back."),
        );
        assert.equal(await column.getByRole("radio", { name: /^Push the rest back a week/ }).isDisabled(), true, "push back is offered though a later week met");
        assert.equal(await column.getByRole("radio", { name: /^Keep pace/ }).isDisabled(), false, "keep pace is not offered");
        const [previewed] = await Promise.all([
          responseTo(adminPage, `/groups/${groupA.id}/attendance/column`, "POST"),
          column.getByRole("radio", { name: new RegExp(`^${escapeRegExp(WORDS.heldOnline)}`) }).check(),
        ]);
        assert.equal((await okBody(previewed, "Previewing the column")).preview?.changes, 2);
        const beforeYouSave = column.getByTestId("column-before");
        await waitFor("Before you save to say what changes", async () => (await textOf(beforeYouSave)).includes("2 lines: In the room to Online."));
        assert.ok((await textOf(beforeYouSave)).includes("Nobody is emailed."), "Before you save does not say nobody is emailed");
        assert.equal((await storedRegister(groupA, 1))?.online?.[ada.uid] ?? false, false, "the preview changed the register");
        await column.getByRole("textbox").fill(WHY.online);
        const [pressed] = await Promise.all([
          responseTo(adminPage, `/groups/${groupA.id}/attendance/column`, "POST"),
          column.getByRole("button", { name: "Correct 2 lines", exact: true }).click(),
        ]);
        assert.equal((await okBody(pressed, "Correcting the column")).changed, 2);
        const week1 = await waitFor("week 1 to say online", async () => {
          const doc = await storedRegister(groupA, 1);
          return doc?.online?.[ada.uid] === true && doc?.online?.[ben.uid] === true ? doc : null;
        });
        assert.ok(week1.corrected?.[ada.uid] && week1.corrected?.[ben.uid], "the column's lines are not stamped as corrected");

        await adminPage.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("tab", { name: "History", exact: true }).click();
        await adminPage.getByRole("button", { name: "Registers", exact: true }).click();
        const history = await textOf(adminPage.locator("ol").last());
        for (const line of [
          new RegExp(`Corrected week 2’s register: [^.]*${escapeRegExp(ben.first)}[^.]*, Absent to Excused\\. Why: “${escapeRegExp(WHY.benWeek2)}”`),
          new RegExp(`Corrected week 1’s register: it was held online\\. 2 lines from In the room to Online\\. Why: “${escapeRegExp(WHY.online)}”`),
          new RegExp(`Corrected week 3’s register: [^.]*${escapeRegExp(ada.first)}[^.]*, Absent to In the room\\. Asked by ${escapeRegExp(fern.first)} `),
        ]) {
          assert.match(history, line, `the history does not keep the correction: ${history}`);
        }
        await assertNobodyEmailed(before, "correcting a line and a column");
      });
    } finally {
      await Promise.all([fernContext.close(), gusContext.close(), adaContext.close(), benContext.close(), halContext.close(), context.close()]).catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
