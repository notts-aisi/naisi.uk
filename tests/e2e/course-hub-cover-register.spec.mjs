/**
 * END-TO-END: covering a register, driven by the people who use it, in a real
 * browser.
 *
 * The term three weeks in (scripts/e2e-fixtures/worlds/course-hub-term.mjs,
 * point "week-three-covering"): Group A's week 3 session has passed and
 * nobody opened its register; Group B's week 3 was saved with a mark and not
 * finished. The admin approves Fern, Gus and Ola, makes Gus SU-recognised
 * committee, names the run and Gus as the programme's lead, hands the
 * people over and appoints Fern to Group A. Then:
 *
 *  1. GUS, THE PROGRAMME'S LEAD, opens Group A's page, which says nobody has
 *     started week 3's register, and takes it in Fern's place; sets lines,
 *     each saying it was him; reads the check before Finish and finishes;
 *     reads that the report he would write says whose place he took; changes
 *     whether Fern was there; and the group's history says who took it.
 *  2. THE ADMIN gives Group A's week 4 session to Ola, a plain member with no
 *     place on the run, with the tick to tell the group off: one email, to
 *     Ola alone, with the register's link and no meeting link.
 *  3. OLA opens the link, sets a line, and is refused the group's page and
 *     another week's register.
 *  4. FERN, Group A's facilitator, opens that register and reads who set each
 *     line, and nothing about her own record.
 *  5. GUS says Group B's week 3 didn't happen with the notice ticked: the
 *     count on the button is the emails caught, and the register's lines are
 *     gone.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-cover-register
 *
 * It declares `requiresCaughtMail`: the runner skips it anywhere but a server
 * it started with its mail forced into Mailpit.
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
import { getMessage, messagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
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
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-cover-register.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;
const POLL_MS = 500;

/** The words the pages say, restated from src/lib/courses/registerCover/pageWords.ts and the pages that draw them. */
const WORDS = {
  committee: "Committee",
  recognisedSwitch: "SU-recognised committee",
  chooseLead: "Choose a lead",
  check: "Check it before you finish",
  keepEditing: "Keep editing",
  someoneElse: "Someone else is covering",
  didntHappen: "It didn’t happen",
  keepPace: "Keep pace",
  takeTheRegister: "Take the register",
};

/** The reason the lead gives for the session that didn't happen. */
const DIDNT_HAPPEN_REASON = "The room was locked and nobody could get in.";

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

/** One email, read out of Mailpit whole. */
async function readEmail(summary) {
  const message = await getMessage(summary.ID);
  return { subject: message.Subject ?? summary.Subject ?? "", html: message.HTML ?? "", text: message.Text ?? "" };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: covering a register, by the lead, the admin, a member given a session and the facilitator",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const fern = state.facilitator;
    const gus = state.lead;
    const ola = state.covering;
    const groupA = state.groups.find((group) => group.key === "A");
    const groupB = state.groups.find((group) => group.key === "B");
    const ada = state.people.find((person) => person.key === "ada");
    const ben = state.people.find((person) => person.key === "ben");
    const cleo = state.people.find((person) => person.key === "cleo");
    for (const [key, value] of Object.entries({ fern, gus, ola, groupA, groupB, ada, ben, cleo })) assert.ok(value, `the term has no ${key}`);
    assert.ok(groupA.meetingUrl, "Group A has no meeting link, so 'never in an email' would prove nothing");

    const formPath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const formBase = `${origin}${formPath}`;
    const groupPagePath = (group) => `${formPath}/groups/${enc(group.id)}`;
    const leadRegisterPath = `${groupPagePath(groupA)}/register`;
    const learnRegisterPath = `/learn/${enc(state.runId)}/group/${enc(groupA.id)}/register`;
    const registerDocPath = (group, weekNumber) => `${state.runId}__${group.id}__w0${weekNumber}`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: leadContext, page: leadPage } = await newIdentityPage(browser);
    const { context: olaContext, page: olaPage } = await newIdentityPage(browser);
    const { context: fernContext, page: fernPage } = await newIdentityPage(browser);

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
    for (const pg of [leadPage, olaPage, fernPage]) await stubRecaptchaOnLoopback(pg, origin);
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

    /** A row of the register's grid, by the person's name. */
    const rowOf = (pg, person) => pg.getByTestId("attendance-grid").getByRole("row").filter({ hasText: person.first }).first();

    /** Taps one cell `times` times, waiting for each save. */
    async function tap(pg, cell, times) {
      for (let i = 0; i < times; i += 1) {
        const [saved] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/attendance`, "POST"), cell.click()]);
        await okBody(saved, "Saving a line");
      }
    }

    function assertNoMeetingLink(email, who) {
      for (const body of [email.html, email.text]) {
        assert.ok(!body.includes(groupA.meetingUrl) && !body.includes(new URL(groupA.meetingUrl).host), `${who}'s email carries the meeting link`);
      }
    }

    try {
      await step("the admin approves the facilitator, the account that will lead the programme and the member who will cover a session", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [fern, gus, ola]) {
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

      await step("the admin appoints the facilitator to the group whose week 3 register nobody started", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/groups/facilitators`, { waitUntil: "domcontentloaded" });
        const card = adminPage.locator('section[aria-labelledby="facilitators-title"]');
        await card.getByText(`0 facilitators for ${state.groups.length} groups`, { exact: true }).waitFor({ timeout: WAIT_MS });
        await card.getByRole("button", { name: `Change ${groupA.name}’s facilitators`, exact: true }).click();
        await card.getByPlaceholder("Search people…").fill(fern.displayName);
        await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(fern.displayName)) }).check();
        const [response] = await Promise.all([
          responseTo(adminPage, `/groups/${groupA.id}/facilitators`, "POST"),
          card.getByRole("button", { name: "Save", exact: true }).click(),
        ]);
        assert.deepEqual((await okBody(response, "Saving the facilitators")).facilitatorUids, [fern.uid]);
      });

      await step("the lead's group page says nobody has started week 3's register, and the lead takes it in the facilitator's place", async () => {
        activePage = leadPage;
        await signIn(leadPage, { email: gus.email, password: gus.password });
        await leadPage.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
        const notice = leadPage.getByTestId("cover-notice");
        await notice.waitFor({ timeout: WAIT_MS });
        const said = await textOf(notice);
        assert.ok(said.includes(`${fern.first} hasn’t started week 3’s register`), `the notice does not say whose register is not started: ${said}`);
        assert.ok(said.includes(`the register records who took it, and the reminders to ${fern.first} about it stop.`), said);
        const take = notice.getByRole("button", { name: `Take the register in ${fern.first}’s place`, exact: true });
        const [covered] = await Promise.all([responseTo(leadPage, `/groups/${groupA.id}/attendance/cover`, "POST"), take.click()]);
        assert.equal((await okBody(covered, "Taking the register")).cover?.kind, "self");
        await leadPage.waitForURL((url) => url.pathname === leadRegisterPath && url.searchParams.get("session") === "w03", { timeout: WAIT_MS });
        const place = leadPage.getByTestId("register-place");
        await place.waitFor({ timeout: WAIT_MS });
        assert.match(
          await textOf(place),
          new RegExp(`^You’re taking this in place of ${escapeRegExp(fern.first)}.*The register will say ${escapeRegExp(gus.first)} took it, and the reminders to ${escapeRegExp(fern.first)} about it stop\\.$`),
        );
        const stored = await storedRegister(groupA, 3);
        assert.equal(stored?.cover?.byUid, gus.uid, "the register does not say the lead took it");
        assert.deepEqual(stored?.cover?.covering, [fern.uid]);
      });

      await step("the lead sets lines that each say who set them, reads the check before Finish and finishes, and the report page says whose place it is written in", async () => {
        activePage = leadPage;
        // Week 3 is the third column; Ada is in the room, Ben absent (four taps: present, late, left early, absent).
        await tap(leadPage, rowOf(leadPage, ada).getByTestId("attendance-cell").nth(2), 1);
        await tap(leadPage, rowOf(leadPage, ben).getByTestId("attendance-cell").nth(2), 4);
        for (const person of [ada, ben]) {
          const stamp = rowOf(leadPage, person).getByTestId("attendance-set-by").last();
          assert.match(await textOf(stamp), /^Set by you, \d{1,2}(:\d{2})?(am|pm)$/, `${person.first}'s line does not say the lead set it`);
        }
        // No box for a note: a register's notes are its facilitators' and admins'.
        assert.equal(await leadPage.getByTestId("attendance-note-open").count(), 0, "the lead is offered a box for a note");

        const ending = leadPage.getByTestId("register-ending");
        await ending.getByRole("button").first().click();
        const confirm = leadPage.getByTestId("push-confirm");
        await confirm.waitFor({ timeout: WAIT_MS });
        const check = await textOf(confirm.getByTestId("push-confirm-check"));
        assert.ok(check.startsWith(WORDS.check), check);
        assert.match(check, new RegExp(`In the room 1: ${escapeRegExp(ada.first)}`));
        assert.match(check, new RegExp(`Absent 1: ${escapeRegExp(ben.first)}`));
        await confirm.getByRole("button", { name: WORDS.keepEditing, exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await confirm.getByTestId("push-confirm-here").count(), 0, "a lead is asked which facilitators were here");
        const [pushed] = await Promise.all([responseTo(leadPage, `/groups/${groupA.id}/attendance/push`, "POST"), confirm.getByTestId("push-confirm-submit").click()]);
        await okBody(pushed, "Finishing the register");
        await waitFor("the register to be finished", async () => Boolean((await storedRegister(groupA, 3))?.pushedAt));

        const side = leadPage.getByTestId("register-side");
        await side.waitFor({ timeout: WAIT_MS });
        assert.match(await textOf(side), new RegExp(`Taken by ${escapeRegExp(gus.first)}.*, from .*, covering for ${escapeRegExp(fern.first)}`));
        await side.getByRole("link", { name: "Write the session report", exact: true }).click();
        await leadPage.waitForURL((url) => url.pathname === `${groupPagePath(groupA)}/report` && url.searchParams.get("session") === "w03", { timeout: WAIT_MS });
        const covering = leadPage.getByTestId("report-covering");
        await covering.waitFor({ timeout: WAIT_MS });
        assert.equal(await textOf(covering), `Written by you, covering for ${fern.first}. The programme’s lead and admins read it, as with any report.`);
      });

      await step("the lead changes whether the facilitator was there, and the group's history says who took the register and, to the lead, the change", async () => {
        activePage = leadPage;
        await leadPage.goto(`${origin}${leadRegisterPath}?session=w03`, { waitUntil: "domcontentloaded" });
        const side = leadPage.getByTestId("register-side");
        await side.waitFor({ timeout: WAIT_MS });
        assert.match(await textOf(side), /: not there/, "the facilitator record does not say the facilitator was not there");
        await side.getByRole("button", { name: new RegExp(`^Change: ${escapeRegExp(fern.first)}`) }).click();
        await side.getByRole("combobox").first().selectOption("there");
        const [changed] = await Promise.all([
          responseTo(leadPage, `/groups/${groupA.id}/attendance/facilitators`, "POST"),
          side.getByRole("button", { name: "Save", exact: true }).click(),
        ]);
        assert.equal((await okBody(changed, "Changing the facilitator record")).entry?.state, "there");
        await waitFor("the record to say there", async () => /: there/.test(await textOf(side)));

        await leadPage.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
        await leadPage.getByRole("tab", { name: "History", exact: true }).click();
        await leadPage.getByRole("button", { name: "Registers", exact: true }).click();
        const history = await textOf(leadPage.locator("ol").last());
        for (const line of [
          `Took week 3’s register in ${fern.first}’s place.`,
          `Finished week 3’s register, covering for ${fern.first}. 1 in the room, 1 absent.`,
          `Changed whether ${fern.first} was at week 3’s session: not there, now there.`,
        ]) {
          assert.ok(history.includes(line), `the history does not say "${line}": ${history}`);
        }
      });

      await step("the admin gives week 4's session to the member with the tick off, and one email reaches that member alone, with the register's link and no meeting link", async () => {
        activePage = adminPage;
        const before = {};
        for (const account of [ola, ada, ben, cleo, fern]) before[account.key] = (await messagesTo(account.email)).length;
        await adminPage.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("group", { name: "Weeks", exact: true }).getByRole("button", { name: /^Week 4,/ }).click();
        await adminPage.getByRole("button", { name: `${WORDS.takeTheRegister}: Week 4`, exact: true }).click();
        const sheet = adminPage.getByTestId("cover-sheet");
        await sheet.waitFor({ timeout: WAIT_MS });
        await sheet.getByRole("button", { name: new RegExp(`^${escapeRegExp(WORDS.someoneElse)}`) }).click();
        const panel = adminPage.getByTestId("give-panel");
        await panel.waitFor({ timeout: WAIT_MS });
        await panel.getByPlaceholder("Search people…").fill(ola.displayName);
        const [previewed] = await Promise.all([
          responseTo(adminPage, `/groups/${groupA.id}/attendance/cover`, "POST"),
          panel.getByRole("checkbox", { name: new RegExp(escapeRegExp(ola.displayName)) }).check(),
        ]);
        const preview = (await okBody(previewed, "Previewing the cover")).preview;
        assert.equal(preview.person?.uid, ola.uid);
        const tick = panel.getByRole("checkbox", { name: new RegExp(`^Tell ${escapeRegExp(groupA.name)} that`) });
        assert.equal(await tick.isChecked(), false, "telling the group is on before anybody ticks it");
        const button = panel.getByRole("button", { name: `Give ${ola.first} this session and email ${ola.first} (1)`, exact: true });
        const [given] = await Promise.all([responseTo(adminPage, `/groups/${groupA.id}/attendance/cover`, "POST"), button.click()]);
        const body = await okBody(given, "Giving the session");
        assert.deepEqual([body.cover?.kind, body.email, body.notice], ["given", "sent", null]);

        const mail = await waitForMessagesTo(ola.email, { count: before.ola + 1, timeoutMs: WAIT_MS });
        const email = await readEmail(mail[0]);
        assert.match(email.subject, new RegExp(`^You’re covering ${escapeRegExp(groupA.name)} `));
        const link = `${learnRegisterPath}?session=w04`;
        assert.ok(email.html.includes(link) || email.text.includes(link), `the email does not link to the register: ${email.text}`);
        assertNoMeetingLink(email, ola.first);
        // Nobody else: the tick was off.
        for (const account of [ada, ben, cleo, fern]) {
          assert.equal((await messagesTo(account.email)).length, before[account.key], `${account.first} was emailed`);
        }
      });

      await step("the member opens the link, sets a line, and is refused the group's page and another week's register", async () => {
        activePage = olaPage;
        await signIn(olaPage, { email: ola.email, password: ola.password });
        await olaPage.goto(`${origin}${learnRegisterPath}?session=w04`, { waitUntil: "domcontentloaded" });
        await olaPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        assert.equal(await olaPage.getByTestId("attendance-session").count(), 1, "somebody given one session sees another week");
        assert.ok((await textOf(olaPage.getByTestId("attendance-session").first())).startsWith("Week 4"));
        assert.equal(await olaPage.getByTestId("attendance-note-open").count(), 0, "somebody given a session is offered a note");
        assert.equal(await olaPage.getByRole("link", { name: groupA.name, exact: true }).count(), 0, "the register leads into the group's page");
        await tap(olaPage, rowOf(olaPage, ada).getByTestId("attendance-cell").first(), 1);
        assert.match(await textOf(rowOf(olaPage, ada).getByTestId("attendance-set-by").first()), /^Set by you, /);
        const stored = await storedRegister(groupA, 4);
        assert.equal(stored?.setBy?.[ada.uid]?.byUid, ola.uid);

        for (const path of [`/learn/${enc(state.runId)}/group/${enc(groupA.id)}`, `${learnRegisterPath}?session=w03`]) {
          await olaPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
          await olaPage.waitForURL((url) => url.pathname === "/learn", { timeout: WAIT_MS });
        }
      });

      await step("the facilitator opens that register and reads who set each line, and nothing about their own record", async () => {
        activePage = fernPage;
        await signIn(fernPage, { email: fern.email, password: fern.password });
        await fernPage.goto(`${origin}${learnRegisterPath}?session=w04`, { waitUntil: "domcontentloaded" });
        const place = fernPage.getByTestId("register-place");
        await place.waitFor({ timeout: WAIT_MS });
        assert.equal(await textOf(place), `${ola.first} was given this session, covering for you. Carry on from here: each line says who set it.`);
        const stamps = rowOf(fernPage, ada).getByTestId("attendance-set-by");
        assert.match(await textOf(stamps.last()), new RegExp(`^${escapeRegExp(ola.first)}, \\d{1,2}(:\\d{2})?(am|pm)$`));
        assert.match(await textOf(stamps.first()), new RegExp(`^${escapeRegExp(gus.first)}, `), "week 3's line does not say the lead set it");
        const said = await textOf(fernPage.locator("main"));
        assert.ok(!/not there|arrived late/i.test(said), "the facilitator is told about their own record");
        assert.equal(await fernPage.getByTestId("register-side").count(), 0, "the facilitator is shown the side panel");
      });

      await step("the lead says the other group's week 3 didn't happen with the notice ticked: the button's count is the emails caught, and its lines are gone", async () => {
        activePage = leadPage;
        const before = (await messagesTo(cleo.email)).length;
        assert.deepEqual(Object.keys((await storedRegister(groupB, 3))?.records ?? {}), [cleo.uid], "Group B's week 3 draft has no mark to clear");
        await leadPage.goto(`${origin}${groupPagePath(groupB)}`, { waitUntil: "domcontentloaded" });
        await leadPage.getByRole("group", { name: "Weeks", exact: true }).getByRole("button", { name: /^Week 3,/ }).click();
        await leadPage.getByRole("button", { name: `${WORDS.takeTheRegister}: Week 3`, exact: true }).click();
        const sheet = leadPage.getByTestId("cover-sheet");
        await sheet.waitFor({ timeout: WAIT_MS });
        await sheet.getByRole("button", { name: new RegExp(`^${escapeRegExp(WORDS.didntHappen)}`) }).click();
        const panel = leadPage.getByRole("dialog", { name: WORDS.didntHappen, exact: true });
        await panel.getByRole("heading", { name: "Week 3 didn’t happen", exact: true }).waitFor({ timeout: WAIT_MS });
        await panel.getByRole("radio", { name: new RegExp(`^${WORDS.keepPace}`) }).check();
        await panel.getByRole("textbox").fill(DIDNT_HAPPEN_REASON);
        const lines = panel.locator("dl > div");
        await lines.first().waitFor({ timeout: WAIT_MS });
        const preview = await textOf(panel.locator("dl"));
        assert.ok(preview.includes("Week 3 leaves everyone’s attendance. Nobody is counted absent."), preview);
        assert.ok(preview.includes(`1 line set for it is cleared: ${cleo.first} (present)`), preview);
        assert.ok(!/shows as late/i.test(preview), "the panel says work shows as late");
        const tick = panel.getByRole("checkbox", { name: /^Email Group B \(/ });
        await tick.check();
        const label = await textOf(panel.getByRole("button", { name: /^Cancel week 3/ }));
        const count = Number(/email (\d+) (?:person|people)$/.exec(label)?.[1] ?? NaN);
        assert.ok(Number.isInteger(count) && count > 0, `the button does not say how many it emails: ${label}`);
        // The change, then the notice it hands back, posted by the panel: both answers are waited for from before the press.
        const [changed, told] = await Promise.all([
          responseTo(leadPage, `/groups/${groupB.id}/session/change`, "POST"),
          responseTo(leadPage, `/runs/${state.runId}/updates`, "POST"),
          panel.getByRole("button", { name: label, exact: true }).click(),
        ]);
        await okBody(changed, "Calling the session off");
        await okBody(told, "Telling the group");
        const mail = await waitForMessagesTo(cleo.email, { count: before + count, timeoutMs: WAIT_MS });
        assert.equal(mail.length - before, count, "the emails caught are not the count on the button");
        const email = await readEmail(mail[0]);
        assert.equal(email.subject, "No session for week 3");
        const register = await waitFor("the draft's lines to go", async () => {
          const doc = await storedRegister(groupB, 3);
          return doc && Object.keys(doc.records ?? {}).length === 0 ? doc : null;
        });
        assert.equal(register.markedByUid, undefined, "the register is still taken");
        const rows = (await fixtureQuery("courseAudit").where("runId", "==", state.runId).get()).docs.map((doc) => doc.data());
        assert.ok(rows.some((row) => row.kind === "session-did-not-happen" && row.groupId === groupB.id), "the history keeps nothing of what the lines said");
      });
    } finally {
      await Promise.all([leadContext.close(), olaContext.close(), fernContext.close(), context.close()]);
      await browser.close();
    }
  },
);
