/**
 * END-TO-END: asking to be excused from a week, driven by the people who use
 * it and read as the people it affects, in a real browser.
 *
 * The term three weeks in (scripts/e2e-fixtures/worlds/course-hub-term.mjs,
 * point "week-three-unmarked"): Group A (a room, with a meeting link) has
 * Ada and Ben, its weeks 1 and 2 registers are finished, its week 3 session
 * has passed with nobody having opened its register, and its week 4 session
 * is days ahead. The admin approves the people, Gus and Hal, makes Gus
 * SU-recognised committee, names the run and Gus as the programme's lead,
 * hands the people over, appoints Fern to Group A and Hal to Group B. Then:
 *
 *  1. BEN opens his next session's card: no instant button. Can't make it
 *     opens the short flow (joining online first, then the request); he asks
 *     to be excused from week 4 with a reason. The card says it waits.
 *     Nobody is emailed.
 *  2. FERN, Group A's facilitator, opens the register: it says Ben asked,
 *     and nothing else. Neither the page nor the register's own answer holds
 *     the reason.
 *  3. GUS, the programme's lead, opens the Requests page: no request to be
 *     excused is listed, Home's card does not count it, and the request's own
 *     page is not his.
 *  4. THE ADMIN opens it from Home's To do, reads what approving will do and
 *     approves it with a reply: Ben is emailed once, Fern once, neither email
 *     carries the reason or the meeting link, and Fern's carries no reply.
 *     The register says Excused; Ben's card says who approved it and the reply.
 *  5. FERN finishes week 3 with Ben absent; BEN asks about it from his last
 *     session's card; the admin approves it: the line becomes Excused, the
 *     group's History keeps it under Registers without the reason, and Ben's
 *     figures change on the pages that show them.
 *  6. ADA asks about week 4; the admin replies without deciding, then
 *     declines it with a reply: Ada is emailed once each time and reads the
 *     reply on her card; Fern's register shows nothing for her.
 *  7. ADA asks again, then withdraws: nobody is emailed, and the admin's list
 *     no longer shows it as waiting.
 *  8. CAME ANYWAY: week 4 starts (the fixture moves Group A's own calendar),
 *     Fern marks Ben in the room and finishes the register: the figures count
 *     him as there, the request stays approved, and his card says he came.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-excused-weeks
 *
 * It declares `requiresCaughtMail`: the runner skips it anywhere but a server
 * it started with its mail forced into Mailpit, because who is emailed is
 * read off the harness's own mailboxes.
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
import { getMessage, hrefUrls, messagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
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
import { EXCUSED_WEEKS_STEPS as STEPS, RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-excused-weeks.mjs";
import { startGroupSession } from "../../scripts/e2e-fixtures/course-hub-sessions-and-work.mjs";
import { dayLabel, sessionOf, weekDocId } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;
const POLL_MS = 500;

/**
 * The words the pages say, restated from src/lib/courses/excused/ownWords.ts,
 * staffWords.ts, requestWords.ts, words.ts and the pages that draw them.
 */
const WORDS = {
  committee: "Committee",
  recognisedSwitch: "SU-recognised committee",
  chooseLead: "Choose a lead",
  ticket: "Your next session",
  cantMakeIt: (day) => `Can’t make it on ${day}`,
  cantMakeDay: (day) => `Can’t make ${day}?`,
  joinOnlineFirst: (group) => `Try joining online first. You stay in ${group}.`,
  joiningOnline: (day) => `Joining online on ${day}`,
  askToBeExcused: "Ask to be excused",
  canMakeItAfterAll: "I can make it after all",
  medical: "Please don’t include medical details or anything about your health. A few words are enough.",
  why: "Why (a line is enough)",
  whoReads: "Only admins read it, and it’s deleted when your programme closes.",
  asked: "Asked to be excused",
  waiting: (first) => `Waiting for an admin, usually today. ${first} sees only that you’ve asked.`,
  withdraw: "Withdraw the request",
  excused: "Excused",
  waitingFact: "Asked to be excused, waiting",
  ifApproved: "If it’s approved, Absent becomes Excused by itself. You never see why.",
  missedIt: "Missed it for a reason? You can ask to be excused after a session, for example if you were ill.",
  cameAfterAll: "You came after all, so your register shows you there. Being excused stays on your request; nothing else changes.",
  approving: (person, facilitator) => `The register says Excused for ${person}, with nothing for ${facilitator} to do.`,
  told: (person, facilitator) => `2 emails: ${person}, with your reply; and ${facilitator}, without the reason.`,
  correcting: "The register is already finished and says Absent: approving changes it to Excused and logs it in the group’s history.",
  approveTwo: "Approve and email 2 people",
  declineTo: (first) => `Decline and email ${first}`,
};

/** Why each asked, and what the admin said: one line each, no link, nothing about anybody's health. */
const WHY = {
  ben: "A family wedding on that day that I can't move.",
  benPast: "My train was cancelled and I could not get in.",
  ada: "A careers fair shift I agreed to before term.",
  adaAgain: "The careers fair moved, so I may need that week after all.",
  reply: "Thanks for telling us. Enjoy the wedding.",
  question: "Could you join online for the second half?",
  decline: "The fair is in the morning, so you can still come to the session.",
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
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every decision on this journey is an admin's."
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
/** What a block reads as, with its lines apart, as a person reads it. */
const readOf = async (locator) => flat(await locator.innerText());

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: asking to be excused from a week, by the member, decided by an admin, read by the facilitator and the lead",
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

    // Group A's next session (week 4, days ahead) and the one before it (week 3, passed, never opened).
    const nextWeek = [1, 2, 3, 4, 5, 6].find((week) => sessionOf(groupA, week).startsAt.getTime() > Date.now());
    assert.ok(nextWeek && nextWeek >= 2, "Group A has no session ahead");
    const lastWeek = nextWeek - 1;
    const next = sessionOf(groupA, nextWeek);
    const last = sessionOf(groupA, lastWeek);
    const nextKey = weekDocId(nextWeek);
    const lastKey = weekDocId(lastWeek);
    const nextDay = dayLabel(next.dateKey);

    const formPath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const formBase = `${origin}${formPath}`;
    const groupPagePath = `${formPath}/groups/${enc(groupA.id)}`;
    const registerPath = `/learn/${enc(state.runId)}/group/${enc(groupA.id)}/register`;
    const learnUrl = `${origin}/learn/${enc(state.runId)}`;
    const requestPath = (id) => `/admin/admissions/requests/${id}`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: fernContext, page: fernPage } = await newIdentityPage(browser);
    const { context: gusContext, page: gusPage } = await newIdentityPage(browser);
    const { context: adaContext, page: adaPage } = await newIdentityPage(browser);
    const { context: benContext, page: benPage } = await newIdentityPage(browser);

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
    for (const pg of [fernPage, gusPage, adaPage, benPage]) await stubRecaptchaOnLoopback(pg, origin);
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

    const storedRegister = async (key) => (await fixtureDoc("courseAttendance", `${state.runId}__${groupA.id}__${key}`).get()).data() ?? null;
    const storedRequest = async (id) => (await fixtureDoc("courseRequests", id).get()).data() ?? null;
    const rollupOf = async (person) => (await fixtureDoc("courseEnrolments", `${state.runId}__${person.uid}`).get()).data()?.attendance ?? {};

    /** Every person's caught mail, counted, so who is emailed can be read back. */
    async function mailCounts() {
      const out = {};
      for (const account of everybody) out[account.key] = (await messagesTo(account.email)).length;
      return out;
    }
    /** Waits for exactly `expected` new messages per person (0 for everybody unnamed), then hands back the new ones. */
    async function assertEmailed(before, expected, what) {
      const want = Object.fromEntries(everybody.map((account) => [account.key, before[account.key] + (expected[account.key] ?? 0)]));
      await waitFor(`${what} to reach ${JSON.stringify(expected)}`, async () => {
        const now = await mailCounts();
        return everybody.every((account) => now[account.key] >= want[account.key]);
      });
      // A beat for anything that should NOT have gone to land in Mailpit first.
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      assert.deepEqual(await mailCounts(), want, `${what} emailed somebody it should not have`);
      const fresh = {};
      for (const account of everybody) {
        const all = await messagesTo(account.email);
        const extra = all.length - before[account.key];
        // Mailpit lists the newest first.
        fresh[account.key] = await Promise.all(all.slice(0, Math.max(extra, 0)).map((summary) => getMessage(summary.ID)));
      }
      return fresh;
    }
    const assertNobodyEmailed = (before, what) => assertEmailed(before, {}, what);

    /** What the register's own answer says, read from the page the way the page reads it. */
    const registerAnswer = (pg, groupId) =>
      pg.evaluate(async (path) => {
        const res = await fetch(path);
        return { status: res.status, text: await res.text() };
      }, `/api/courses/groups/${enc(groupId)}/attendance`);

    /** A row of the register's grid, by the person's first name, and one of its cells by column. */
    const rowOf = (pg, person) => pg.getByTestId("attendance-grid").getByRole("row").filter({ hasText: person.first }).first();
    const cellOf = (pg, person, column) => rowOf(pg, person).getByTestId("attendance-cell").nth(column);

    /** Taps one cell `times` times, waiting for each save. */
    async function tap(pg, cell, times) {
      for (let i = 0; i < times; i += 1) {
        const [saved] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/attendance`, "POST"), cell.click()]);
        await okBody(saved, "Saving a line");
      }
    }

    /** Finishes the register the foot is about. */
    async function finish(pg, key) {
      const ending = pg.getByTestId("register-ending");
      await ending.getByRole("button").first().click();
      const confirm = pg.getByTestId("push-confirm");
      await confirm.waitFor({ timeout: WAIT_MS });
      const [pushed] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/attendance/push`, "POST"), confirm.getByTestId("push-confirm-submit").click()]);
      await okBody(pushed, "Finishing the register");
      await waitFor(`${key}'s register to be finished`, async () => Boolean((await storedRegister(key))?.pushedAt));
    }

    /** From a person's next session's card: Can't make it, then the request, for the week the card is about. */
    async function askFromCard(pg, person, why) {
      await pg.goto(learnUrl, { waitUntil: "domcontentloaded" });
      const ticket = pg.getByRole("region", { name: WORDS.ticket, exact: true });
      // The way in to a request, by its own id: the instant button carries none.
      const press = ticket.getByTestId("excuse-open");
      await press.waitFor({ timeout: WAIT_MS });
      assert.equal(await press.getAttribute("aria-label"), WORDS.cantMakeIt(nextDay));
      await waitFor("Can't make it to be live once the page has hydrated", async () => press.isEnabled());
      await press.click();
      const sheet = pg.getByTestId("excuse-sheet");
      await sheet.getByRole("heading", { name: WORDS.cantMakeDay(nextDay), exact: true }).waitFor({ timeout: WAIT_MS });
      // A room with a link: joining online first, then the request. The seam
      // for another group's session that week stays empty.
      await sheet.getByText(WORDS.joinOnlineFirst(groupA.name), { exact: true }).waitFor({ timeout: WAIT_MS });
      await sheet.getByRole("button", { name: WORDS.joiningOnline(nextDay), exact: true }).waitFor({ timeout: WAIT_MS });
      await sheet.getByTestId("excuse-ask-instead").click();
      await sheet.getByRole("heading", { name: WORDS.askToBeExcused, exact: true }).waitFor({ timeout: WAIT_MS });
      const form = sheet.getByTestId("excuse-ask-form");
      const said = flat(await form.innerText());
      assert.ok(said.indexOf(WORDS.medical) >= 0 && said.indexOf(WORDS.medical) < said.indexOf(WORDS.why), "the line about medical details is not above the box");
      assert.ok(said.includes(WORDS.whoReads), "the request does not say who reads the reason");
      // Its labels are set in capitals by the stylesheet, which a page's own text keeps.
      assert.ok(said.toLowerCase().includes(`${fern.first} sees that you’ve asked, then excused if it’s approved. never your reason.`.toLowerCase()), said);
      const box = form.getByRole("checkbox", { name: `Week ${nextWeek} · ${nextDay}`, exact: true });
      assert.equal(await box.isChecked(), true, "the week the card is about is not ticked");
      await form.getByTestId("excuse-reason").fill(why);
      const [asked] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/excused`, "POST"), form.getByTestId("excuse-send").click()]);
      assert.deepEqual(asked.request().postDataJSON(), { sessionKeys: [nextKey], reason: why }, `${person.first}'s request named other weeks`);
      const body = await okBody(asked, "Asking to be excused");
      await sheet.waitFor({ state: "detached", timeout: WAIT_MS });
      await ticket.getByText(WORDS.waiting(fern.first), { exact: true }).waitFor({ timeout: WAIT_MS });
      return body.request.id;
    }

    /** One request's page, as the admin opens it. */
    async function openRequest(id) {
      await adminPage.goto(`${origin}${requestPath(id)}`, { waitUntil: "domcontentloaded" });
      await adminPage.getByTestId("excused-person").waitFor({ timeout: WAIT_MS });
    }

    let benRequest = null;
    let adaRequest = null;
    try {
      await step(STEPS[0], async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [ada, ben, fern, gus, hal]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          await waitFor(`${account.first}'s account to say member`, async () => (await readUserDoc(account.uid))?.role === "member");
        }
      });

      await step(STEPS[1], async () => {
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

      await step(STEPS[2], async () => {
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

      await step(STEPS[3], async () => {
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

      await step(STEPS[4], async () => {
        activePage = benPage;
        await signIn(benPage, { email: ben.email, password: ben.password });
        const before = await mailCounts();
        await benPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const ticket = benPage.getByRole("region", { name: WORDS.ticket, exact: true });
        await ticket.getByRole("button", { name: WORDS.cantMakeIt(nextDay), exact: true }).waitFor({ timeout: WAIT_MS });
        // No instant button: nothing records him as excused on the spot, and nothing to take back.
        assert.equal(await ticket.getByRole("button", { name: WORDS.canMakeItAfterAll, exact: true }).count(), 0, "the instant button's take-back is drawn");
        benRequest = await askFromCard(benPage, ben, WHY.ben);
        const ticketText = await textOf(ticket);
        assert.ok(ticketText.includes(WORDS.asked), `the card does not say he asked: ${ticketText}`);
        await ticket.getByRole("button", { name: WORDS.withdraw, exact: true }).waitFor({ timeout: WAIT_MS });

        const stored = await storedRequest(benRequest);
        assert.deepEqual([stored?.kind, stored?.status, stored?.subjectUid, stored?.reason], ["excused", "waiting", ben.uid, WHY.ben]);
        assert.equal((await storedRegister(nextKey))?.records?.[ben.uid], undefined, "asking wrote a line on the register");
        await assertNobodyEmailed(before, "asking to be excused");
      });

      await step(STEPS[5], async () => {
        activePage = fernPage;
        await signIn(fernPage, { email: fern.email, password: fern.password });
        await fernPage.goto(`${origin}${registerPath}`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        const list = fernPage.getByTestId("attendance-excuse-list");
        await list.waitFor({ timeout: WAIT_MS });
        const said = await textOf(list);
        assert.ok(said.includes(`Week ${nextWeek}: `) && said.includes(ben.first) && said.includes(WORDS.waitingFact), `the register does not say Ben asked: ${said}`);
        assert.ok(said.includes(WORDS.ifApproved), said);
        assert.ok(!said.includes(ada.first), "the register says Ada asked");
        // Neither the page nor what it is sent holds the reason.
        assert.ok(!(await fernPage.content()).includes(WHY.ben), "the register page carries the reason");
        const answer = await registerAnswer(fernPage, groupA.id);
        assert.equal(answer.status, 200);
        assert.ok(!answer.text.includes(WHY.ben), "the register's answer carries the reason");
        assert.equal(JSON.parse(answer.text).excuseRequests?.[nextKey]?.[ben.uid], "waiting");
        // Nothing asks the facilitator to do anything.
        assert.equal(await fernPage.getByRole("button", { name: /^(Approve|Decline)/ }).count(), 0, "the register asks the facilitator to decide");
      });

      await step(STEPS[6], async () => {
        activePage = gusPage;
        await signIn(gusPage, { email: gus.email, password: gus.password });
        await gusPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        await gusPage.locator("main").waitFor({ timeout: WAIT_MS });
        assert.equal(await gusPage.getByTestId("home-requests").count(), 0, "Home counts a request to be excused for the lead");
        await gusPage.goto(`${origin}/admin/admissions/requests`, { waitUntil: "domcontentloaded" });
        await gusPage.locator("main").getByRole("heading", { level: 1 }).first().waitFor({ timeout: WAIT_MS });
        assert.equal(await gusPage.getByTestId("requests-excused").count(), 0, "the lead's Requests page lists requests to be excused");
        assert.equal(await gusPage.locator(`a[href="${requestPath(benRequest)}"]`).count(), 0, "the lead's list leads to Ben's request");
        const list = await gusPage.content();
        assert.ok(!list.includes(WHY.ben), "the lead's list carries the reason");
        await gusPage.goto(`${origin}${requestPath(benRequest)}`, { waitUntil: "domcontentloaded" });
        await gusPage.locator("main").waitFor({ timeout: WAIT_MS });
        assert.equal(await gusPage.getByTestId("excused-person").count(), 0, "the lead opened a request to be excused");
        assert.ok(!(await gusPage.content()).includes(WHY.ben), "the lead was shown the reason");
      });

      await step(STEPS[7], async () => {
        activePage = adminPage;
        const before = await mailCounts();
        await adminPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        // The To do row that leads to the Requests page, not the sidebar's link there.
        const todo = adminPage.locator("main li").filter({ has: adminPage.locator('a[href="/admin/admissions/requests"]') }).first();
        await todo.waitFor({ timeout: WAIT_MS });
        assert.match(await textOf(todo), /asked to be excused|requests to be excused are waiting/, "the admin's To do does not count it");
        await todo.locator('a[href="/admin/admissions/requests"]').click();
        await adminPage.waitForURL((url) => url.pathname === "/admin/admissions/requests", { timeout: WAIT_MS });
        const card = adminPage.getByTestId("requests-excused");
        await card.waitFor({ timeout: WAIT_MS });
        const row = card.getByTestId("request-row").filter({ has: adminPage.locator(`a[href="${requestPath(benRequest)}"]`) });
        const said = await textOf(row);
        assert.ok(said.includes(`Excused for week ${nextWeek}`) && said.includes(groupA.name) && said.includes("Waiting"), said);
        assert.doesNotMatch(said, /Take it|has it/, "a request to be excused says who has it");
        assert.ok(!said.includes(WHY.ben), "the list carries the reason");
        await row.locator(`a[href="${requestPath(benRequest)}"]`).click();
        await adminPage.waitForURL((url) => url.pathname === requestPath(benRequest), { timeout: WAIT_MS });

        assert.equal(await textOf(adminPage.getByTestId("excused-reason")), `“${WHY.ben}”`, "the request's page does not say why");
        const week = adminPage.getByTestId("excused-week").first();
        const what = await textOf(week);
        assert.ok(what.includes(WORDS.approving(ben.first, fern.first)), `the page does not say what approving will do: ${what}`);
        assert.ok(what.includes(WORDS.told(ben.first, fern.first)), `the page does not say who is emailed: ${what}`);
        assert.ok((await textOf(adminPage.getByTestId("excused-before"))).includes("Never, this term."), "the page does not say how often");
        await adminPage.getByTestId("excused-reply-text").fill(WHY.reply);
        // One week waiting: its decision sits under the reply.
        const approve = adminPage.getByTestId("excused-approve");
        assert.equal(await textOf(approve), WORDS.approveTwo);
        const [approved] = await Promise.all([responseTo(adminPage, `/requests/${benRequest}/excused/approve`, "POST"), approve.click()]);
        const body = await okBody(approved, "Approving the week");
        assert.deepEqual([body.week?.register, body.emailed], ["written", { person: "sent", facilitators: 1 }]);

        const sent = await assertEmailed(before, { ben: 1, fern: 1 }, "approving");
        const [toBen] = sent.ben;
        const [toFern] = sent.fern;
        assert.equal(toBen.Subject, `You’re excused from week ${nextWeek}`);
        assert.ok(toBen.Text.includes(WHY.reply), "Ben's email does not carry the reply");
        for (const message of [toBen, toFern]) {
          assert.ok(!message.HTML.includes(WHY.ben) && !message.Text.includes(WHY.ben), "an email carries the reason");
          assert.ok(!hrefUrls(message.HTML).some((url) => url.includes("meet.example.com")), "an email carries the meeting link");
          assert.ok(!message.Text.includes("meet.example.com"), "an email carries the meeting link");
        }
        assert.match(toFern.Subject, new RegExp(` is excused from week ${nextWeek}$`));
        assert.ok(toFern.Text.includes("There’s nothing for you to do."), "the facilitator's email asks something of them");
        assert.ok(!toFern.Text.includes(WHY.reply), "the facilitator was sent the reply");

        const register = await storedRegister(nextKey);
        assert.deepEqual([register?.records?.[ben.uid], register?.setBy?.[ben.uid]?.how], ["excused", "approval"]);

        activePage = fernPage;
        await fernPage.reload({ waitUntil: "domcontentloaded" });
        const list = fernPage.getByTestId("attendance-excuse-list");
        await waitFor("the register to say Ben is excused", async () => {
          const text = await textOf(list);
          return text.includes(ben.first) && text.includes(WORDS.excused) && !text.includes(WORDS.waitingFact);
        });

        activePage = benPage;
        await benPage.reload({ waitUntil: "domcontentloaded" });
        const ticket = benPage.getByRole("region", { name: WORDS.ticket, exact: true });
        const line = ticket.getByText(new RegExp(`^Approved by \\S+ on .+: “${escapeRegExp(WHY.reply)}”$`));
        await line.waitFor({ timeout: WAIT_MS });
      });

      await step(STEPS[8], async () => {
        // Fern takes week 3's register: Ada in the room, Ben absent, finished.
        activePage = fernPage;
        await fernPage.goto(`${origin}${registerPath}?session=${lastKey}`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        const column = lastWeek - 1;
        await tap(fernPage, cellOf(fernPage, ada, column), 1);
        await tap(fernPage, cellOf(fernPage, ben, column), 4);
        await finish(fernPage, lastKey);
        assert.equal((await storedRegister(lastKey))?.records?.[ben.uid], "absent");
        const rollupBefore = await rollupOf(ben);

        // Ben asks about it from his last session's card.
        activePage = benPage;
        let before = await mailCounts();
        await benPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const card = benPage.getByTestId("excuse-last-session");
        await card.waitFor({ timeout: WAIT_MS });
        const said = await textOf(card);
        for (const words of [`Last session · week ${lastWeek}`, "Absent", WORDS.missedIt, `Ask to be excused for week ${lastWeek}`]) {
          assert.ok(said.includes(words), `the last session's card does not say "${words}": ${said}`);
        }
        await card.getByTestId("excuse-reason").fill(WHY.benPast);
        const send = card.getByTestId("excuse-send");
        await waitFor("Send to be live once the page has hydrated", async () => send.isEnabled());
        const [asked] = await Promise.all([responseTo(benPage, `/groups/${groupA.id}/excused`, "POST"), send.click()]);
        const askedBody = await okBody(asked, "Asking to be excused after the session");
        assert.deepEqual(askedBody.request?.weeks?.map((week) => [week.sessionKey, week.asked]), [[lastKey, "after"]]);
        const pastRequest = askedBody.request.id;
        await assertNobodyEmailed(before, "asking after the session");

        // The admin approves it.
        activePage = adminPage;
        before = await mailCounts();
        await openRequest(pastRequest);
        const week = adminPage.getByTestId("excused-week").first();
        const what = await textOf(week);
        assert.ok(what.includes(WORDS.correcting), `the page does not say approving changes a finished register: ${what}`);
        assert.ok(what.includes(`${fern.first} finished the register`), what);
        const [approved] = await Promise.all([
          responseTo(adminPage, `/requests/${pastRequest}/excused/approve`, "POST"),
          adminPage.getByTestId("excused-approve").click(),
        ]);
        const body = await okBody(approved, "Approving the past week");
        assert.deepEqual([body.week?.register, body.emailed], ["corrected", { person: "sent", facilitators: 1 }]);
        await assertEmailed(before, { ben: 1, fern: 1 }, "approving the past week");

        const register = await storedRegister(lastKey);
        assert.equal(register?.records?.[ben.uid], "excused", "the finished register still says Absent");
        assert.ok(register?.corrected?.[ben.uid], "the line is not stamped as corrected");
        assert.equal(register?.setBy?.[ben.uid]?.how, "approval");
        const rows = (await fixtureQuery("courseAudit").where("runId", "==", state.runId).get()).docs.map((doc) => doc.data());
        const row = rows.find((each) => each.requestId === pastRequest);
        assert.ok(row, "the group's history has no row for the approval");
        assert.ok(!JSON.stringify(row).includes(WHY.benPast), "the history row carries the reason");

        // The figures change on every page that shows them.
        const rollupAfter = await waitFor("Ben's figures to change", async () => {
          const now = await rollupOf(ben);
          return now.excused === (rollupBefore.excused ?? 0) + 1 ? now : null;
        });
        assert.equal(rollupAfter.absent, (rollupBefore.absent ?? 0) - 1, "Ben is still counted absent");
        await adminPage.goto(`${origin}${groupPagePath}`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("tab", { name: "Attendance, all weeks", exact: true }).click();
        const table = adminPage.getByTestId("group-attendance");
        await table.waitFor({ timeout: WAIT_MS });
        const benCell = table.getByRole("row").filter({ hasText: ben.first }).first().getByTestId("group-attendance-cell").nth(lastWeek - 1);
        assert.match(await textOf(benCell), /^Excused/, "the group's Attendance tab still says Absent");
        await adminPage.getByRole("tab", { name: "History", exact: true }).click();
        await adminPage.getByRole("button", { name: "Registers", exact: true }).click();
        const history = await textOf(adminPage.locator("ol").last());
        assert.match(history, new RegExp(`approved [^.]*${escapeRegExp(ben.first)}[^.]*’s request to be excused for week ${lastWeek}\\. The register changed from Absent to Excused\\.`), history);
        assert.ok(!history.includes(WHY.benPast), "the group's history carries the reason");

        activePage = benPage;
        await benPage.reload({ waitUntil: "domcontentloaded" });
        await benPage.getByRole("img", { name: new RegExp(`^Week ${lastWeek}, ${escapeRegExp(dayLabel(last.dateKey))}: Excused`) }).waitFor({ timeout: WAIT_MS });
      });

      await step(STEPS[9], async () => {
        activePage = adaPage;
        await signIn(adaPage, { email: ada.email, password: ada.password });
        let before = await mailCounts();
        adaRequest = await askFromCard(adaPage, ada, WHY.ada);
        await assertNobodyEmailed(before, "Ada asking");

        // The admin replies without deciding, then declines with a reply.
        activePage = adminPage;
        await openRequest(adaRequest);
        before = await mailCounts();
        await adminPage.getByTestId("excused-reply-text").fill(WHY.question);
        const [replied] = await Promise.all([
          responseTo(adminPage, `/requests/${adaRequest}/excused/reply`, "POST"),
          adminPage.getByTestId("excused-reply").click(),
        ]);
        assert.deepEqual((await okBody(replied, "Replying without deciding")).emailed, { person: "sent" });
        const [question] = (await assertEmailed(before, { ada: 1 }, "replying without deciding")).ada;
        assert.ok(question.Text.includes(WHY.question) && !question.Text.includes(WHY.ada), "the reply's email is wrong");
        assert.equal((await storedRequest(adaRequest))?.status, "waiting", "a reply decided the request");

        before = await mailCounts();
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        const decline = adminPage.getByTestId("excused-decline").first();
        await decline.waitFor({ timeout: WAIT_MS });
        assert.equal(await textOf(decline), WORDS.declineTo(ada.first));
        assert.equal(await decline.isDisabled(), true, "a week can be declined with no reply");
        await adminPage.getByTestId("excused-reply-text").fill(WHY.decline);
        const [declined] = await Promise.all([responseTo(adminPage, `/requests/${adaRequest}/excused/decline`, "POST"), decline.click()]);
        assert.deepEqual((await okBody(declined, "Declining the week")).emailed, { person: "sent" });
        const [toAda] = (await assertEmailed(before, { ada: 1 }, "declining")).ada;
        assert.equal(toAda.Subject, `About your request for week ${nextWeek}`);
        assert.ok(toAda.Text.includes(WHY.decline) && !toAda.Text.includes(WHY.ada), "the decline's email is wrong");
        assert.equal((await storedRegister(nextKey))?.records?.[ada.uid], undefined, "declining wrote a line");

        activePage = adaPage;
        await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const ticket = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
        await ticket.getByText(new RegExp(`^Not excused for week ${nextWeek}\\. \\S+: “${escapeRegExp(WHY.decline)}”$`)).waitFor({ timeout: WAIT_MS });

        activePage = fernPage;
        await fernPage.goto(`${origin}${registerPath}`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        const answer = JSON.parse((await registerAnswer(fernPage, groupA.id)).text);
        assert.equal(answer.excuseRequests?.[nextKey]?.[ada.uid], undefined, "the register shows a declined request");
        assert.ok(!(await textOf(fernPage.getByTestId("attendance-excuse-list"))).includes(ada.first), "the register says Ada asked");
      });

      await step(STEPS[10], async () => {
        activePage = adaPage;
        const before = await mailCounts();
        const again = await askFromCard(adaPage, ada, WHY.adaAgain);
        const ticket = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
        const withdraw = ticket.getByTestId("excuse-withdraw");
        assert.equal(await textOf(withdraw), WORDS.withdraw);
        await waitFor("Withdraw to be live once the page has hydrated", async () => withdraw.isEnabled());
        const [withdrawn] = await Promise.all([responseTo(adaPage, `/requests/${again}/excused/withdraw`, "POST"), withdraw.click()]);
        assert.equal((await okBody(withdrawn, "Withdrawing the request")).status, "withdrawn");
        await ticket.getByText(/^You withdrew your request to be excused at /).waitFor({ timeout: WAIT_MS });
        // Her own requests: the declined week and the withdrawn one, each with where it stands.
        const own = await readOf(adaPage.getByTestId("excuse-own-requests"));
        assert.match(own, new RegExp(`Excused for week ${nextWeek} Withdrawn by you, .+ Withdrawn`), own);
        assert.match(own, new RegExp(`Excused for week ${nextWeek} Declined by \\S+, .+ Declined`), own);
        assert.doesNotMatch(own, /\d+ times|this term/, "a member is shown a count");
        await assertNobodyEmailed(before, "asking and withdrawing");

        activePage = adminPage;
        await adminPage.goto(`${origin}/admin/admissions/requests`, { waitUntil: "domcontentloaded" });
        await adminPage.getByTestId("requests-excused").waitFor({ timeout: WAIT_MS });
        assert.equal(await adminPage.locator(`a[href="${requestPath(again)}"]`).count(), 0, "the admin's list still shows the withdrawn request");
        assert.equal((await storedRequest(again))?.status, "withdrawn");
      });

      await step(STEPS[11], async () => {
        // Week 4 starts now: the fixture moves Group A's own calendar, as the
        // sessions spec does, so the register can be taken on the day.
        await startGroupSession(groupA, nextWeek, { after: new Date() });
        activePage = fernPage;
        await fernPage.goto(`${origin}${registerPath}?session=${nextKey}`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        const column = nextWeek - 1;
        const benCell = cellOf(fernPage, ben, column);
        assert.match((await benCell.getAttribute("aria-label")) ?? "", /: Excused\./, "Ben's line does not say excused");
        await rowOf(fernPage, ben).getByTestId("attendance-excuse-chip").filter({ hasText: WORDS.excused }).first().waitFor({ timeout: WAIT_MS });
        const rollupBefore = await rollupOf(ben);
        // Ben came after all: Excused, Not marked, In the room.
        await tap(fernPage, benCell, 2);
        await tap(fernPage, cellOf(fernPage, ada, column), 1);
        const before = await mailCounts();
        await finish(fernPage, nextKey);
        assert.equal((await storedRegister(nextKey))?.records?.[ben.uid], "present", "the facilitator's mark did not win");
        const request = await storedRequest(benRequest);
        assert.equal(request?.change?.weeks?.[0]?.status, "approved", "the request did not stay approved");
        const rollupAfter = await waitFor("Ben's figures to count him there", async () => {
          const now = await rollupOf(ben);
          return now.attendedInFull === (rollupBefore.attendedInFull ?? 0) + 1 ? now : null;
        });
        assert.equal(rollupAfter.excused, rollupBefore.excused ?? 0, "Ben is still counted excused for the week he came");
        // Finishing may send next week's email; it sends nothing about being excused.
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        for (const account of everybody) {
          const all = await messagesTo(account.email);
          for (const summary of all.slice(0, all.length - before[account.key])) {
            assert.doesNotMatch(summary.Subject ?? "", /excused|your request/i, `${account.first} was emailed about being excused by the register`);
          }
        }

        activePage = benPage;
        await benPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        await benPage.getByRole("region", { name: WORDS.ticket, exact: true }).getByText(WORDS.cameAfterAll, { exact: true }).waitFor({ timeout: WAIT_MS });
      });
    } finally {
      await Promise.all([fernContext.close(), gusContext.close(), adaContext.close(), benContext.close(), context.close()]).catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
