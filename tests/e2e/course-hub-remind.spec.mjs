/**
 * Who has done a week, and Remind by hand, end to end in a real browser:
 * driven as the group's FACILITATOR, read as a MEMBER.
 *
 * The term at its coursework point, with week 1 counting its readings, its
 * reflections and its written answer, and Ada's week 1 all done before her
 * group met (scripts/e2e-fixtures/course-hub-remind.mjs) -> the admin approves
 * Fern and Ben, names the running run and appoints Fern to Group A -> Fern
 * opens week 1 on her group page: "1 of 2 have done week 1", and Remind for
 * one person -> previews it: Ben alone, never reminded, the email word for
 * word -> sends it: one email, to Ben alone, in its words, with no meeting
 * link and nothing in Ada's or Fern's mailbox -> the panel says when Ben was
 * last reminded and by Fern, and warns before a second reminder -> Ben, signed
 * in, finishes week 1 on its page -> Fern's page says everybody has done week
 * 1, there is no Remind, and the route's preview reaches nobody.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-remind
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit. Every address it can
 * email is the fixture's own.
 *
 * ## Every expected word comes from the seed's clock and the world's plan
 *
 * Days are worked out from the state file and the world's helpers, never
 * written as a calendar date. CHROMIUM ONLY: a green run is a regression net,
 * never a substitute for the manual Safari pass.
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
import { getMessage, messagesTo, settleMessagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, REMIND_WEEK, SPEC } from "../../scripts/e2e-fixtures/course-hub-remind.mjs";
import {
  COURSEWORK_ANSWER_PROMPT,
  COURSEWORK_PROMPTS,
  COURSEWORK_SOURCES,
  courseworkItemId,
  londonDayLabel,
  sessionOf,
  weekDocId,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/**
 * THE WORDS THIS JOURNEY CHECKS, restated from src/lib/courses/groupWeekWork/words.ts
 * and src/lib/courses/weekWork/words.ts, with their slots filled from the records.
 */
const WORDS = Object.freeze({
  haveDone: (done, of, week) => `${done} of ${of} ${of === 1 ? "has" : "have"} done week ${week}`,
  remindAll: (n) => `Remind ${n === 1 ? "1 person" : `${n} people`} whose week isn’t done`,
  panelTitle: (n, week) => `Remind ${n === 1 ? "1 person" : `${n} people`} whose week ${week} isn’t done`,
  lede: (week) => `Their week ${week} isn’t done. Nobody else is emailed.`,
  notYet: "Not reminded yet",
  byFern: (first) => new RegExp(`Last reminded [A-Z][a-z]{2} \\d{1,2} [A-Z][a-z]{2}, \\d{1,2}(?::\\d{2})?[ap]m: by ${first}$`),
  from: (first) => new RegExp(`^Notice, from ${first} and the .+ team$`),
  subject: (week) => `Week ${week} isn’t done yet`,
  met: (group, week, at) =>
    `${group} met for week ${week} on ${londonDayLabel(at)}, and week ${week} is still open. Still to do: two readings, your reflections and your written answer.`,
  addedNow: "Anything you add now shows as late, with how late, to the people who read your work.",
  sendTo: (n) => `Send to ${n === 1 ? "1 person" : `${n} people`}`,
  emailed: (n) => `Emailed ${n === 1 ? "1 person" : `${n} people`}.`,
  warning: (first) => `${first} was reminded in the last day. Sending now emails them again.`,
  writtenAnswer: "Written answer",
  yourAnswer: "Your answer",
  sendMyAnswer: "Send my answer",
});

/** What Ben writes of week 1, once reminded. Made up, every word. */
const BEN = Object.freeze({
  rp1: "Seven lamps on this stretch, I would guess.",
  rp2: "Whoever charges the ships for passing the point.",
  rp3: "They disagree about who should trim the wicks.",
  answer: "The port should keep the lamps lit, because the ships that pay its dues are the ones the light keeps safe.",
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

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an admin's."
      : state.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, so it runs only against the server the harness starts with its mail caught by Mailpit."
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

/** One email, read out of Mailpit whole. */
async function readEmail(summary) {
  const message = await getMessage(summary.ID);
  return { subject: message.Subject ?? summary.Subject ?? "", html: message.HTML ?? "", text: message.Text ?? "" };
}

/**
 * A request sent from a page, with that page's own session: exactly what the
 * page itself would send.
 */
async function fetchAs(pg, path, init = {}) {
  return pg.evaluate(
    async ({ path: target, init: options }) => {
      const res = await fetch(target, options);
      const text = await res.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON: kept as the words it is.
      }
      return { status: res.status, body };
    },
    { path, init },
  );
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test("course hub: who has done a week, and Remind by hand, as the group's facilitator and its member", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const personOf = (key) => {
    const found = state.people.find((person) => person.key === key);
    assert.ok(found, `the term has nobody called ${key}`);
    return found;
  };
  const ada = personOf("ada");
  const ben = personOf("ben");
  const fern = state.facilitator;
  assert.ok(fern, "the term has no account to appoint as a facilitator");
  const group = state.groups.find((each) => each.key === "A");
  assert.ok(group, "the term has no Group A");
  assert.ok(group.meetingUrl, "Group A has no meeting link, so 'never in an email' would prove nothing");
  assert.deepEqual(
    state.people.filter((person) => person.groupKey === group.key).map((person) => person.key),
    ["ada", "ben"],
    "Group A is not Ada and Ben",
  );
  const session = sessionOf(group, REMIND_WEEK);
  assert.ok(session.endsAt < new Date(), "Group A's week 1 session is not over");

  const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
  const groupUrl = `${origin}/learn/${enc(state.runId)}/group/${enc(group.id)}?week=${REMIND_WEEK}`;
  const weekPath = `/learn/${enc(state.runId)}/weeks/${REMIND_WEEK}`;
  const remindPath = `/api/courses/groups/${enc(group.id)}/remind`;
  const subject = WORDS.subject(REMIND_WEEK);

  const { browser, context, page: adminPage } = await openBrowser();
  const { context: fernContext, page: fernPage } = await newIdentityPage(browser);
  const { context: benContext, page: benPage } = await newIdentityPage(browser);

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
  for (const pg of [fernPage, benPage]) await stubRecaptchaOnLoopback(pg, origin);
  if (!recaptchaStubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);

  const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });
  const responseTo = (pg, suffix, method) =>
    pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });
  async function okBody(response, what) {
    const body = await response.json().catch(() => null);
    assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }

  /** The card that counts who has done the week, on Fern's page. */
  const countCard = () => fernPage.getByTestId("week-work-count");
  /** Remind's panel, once open. */
  const panel = () => fernPage.getByTestId("remind-panel");

  /** Opens Remind from the card and waits for its preview to name the people it reaches. */
  async function openRemind(count) {
    const [previewed] = await Promise.all([
      responseTo(fernPage, remindPath, "POST"),
      countCard().getByRole("button", { name: WORDS.remindAll(count), exact: true }).click(),
    ]);
    const body = await okBody(previewed, "Remind's preview");
    assert.equal(body.preview?.count, count, "the preview counts somebody else");
    await panel().getByRole("heading", { name: WORDS.panelTitle(count, REMIND_WEEK), exact: true }).waitFor({ timeout: WAIT_MS });
    return body.preview;
  }

  /** The reminders in a mailbox. */
  const remindersTo = async (address) => (await messagesTo(address)).filter((summary) => (summary.Subject ?? "") === subject);

  try {
    await step("the admin approves the facilitator and the fellow who has not done week 1", async () => {
      activePage = adminPage;
      await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
      for (const account of [fern, ben]) {
        await approvePendingApplicant(adminPage, origin, { email: account.email });
        await waitFor(`${account.first}'s account to say member`, async () => (await readUserDoc(account.uid))?.role === "member");
      }
    });

    await step("the admin names the running course run on the programme's Settings tab", async () => {
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
    });

    await step("the admin appoints the facilitator to Group A on the Facilitators view", async () => {
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

    await step(
      "the facilitator opens week 1 on their group page: who has done it, and Remind for the one fellow who has not",
      async () => {
        activePage = fernPage;
        await signIn(fernPage, fern);
        await fernPage.goto(groupUrl, { waitUntil: "domcontentloaded" });
        await countCard().getByRole("heading", { name: WORDS.haveDone(1, 2, REMIND_WEEK), exact: true }).waitFor({ timeout: WAIT_MS });
        await countCard().getByRole("button", { name: WORDS.remindAll(1), exact: true }).waitFor({ timeout: WAIT_MS });
        // The week chosen on the row of weeks is week 1, and it says so.
        await fernPage.getByRole("link", { name: new RegExp(`^Week ${REMIND_WEEK}, `) }).first().waitFor({ timeout: WAIT_MS });
        assert.equal(
          await fernPage.getByRole("link", { name: new RegExp(`^Week ${REMIND_WEEK}, `) }).first().getAttribute("aria-current"),
          "true",
          "week 1 is not the week shown",
        );
      },
    );

    await step("the facilitator previews Remind: the one fellow, never reminded, and the email word for word", async () => {
      activePage = fernPage;
      const preview = await openRemind(1);
      assert.deepEqual(preview.people.map((person) => person.uid), [ben.uid], "Remind reaches somebody other than Ben");
      assert.doesNotMatch(JSON.stringify(preview), new RegExp(escapeRegExp(ben.email)), "the preview carries an address");
      await panel().getByText(WORDS.lede(REMIND_WEEK), { exact: true }).waitFor({ timeout: WAIT_MS });
      const people = panel().getByTestId("remind-person");
      assert.equal(await people.count(), 1);
      assert.match(await textOf(people.first()), new RegExp(`^${escapeRegExp(ben.first)}.*${WORDS.notYet}$`));
      const email = panel().getByTestId("remind-email");
      const lines = email.locator("p");
      assert.match(await textOf(lines.nth(0)), WORDS.from(fern.first));
      assert.equal(await textOf(lines.nth(1)), subject);
      assert.equal(await textOf(lines.nth(2)), `Hi ${ben.first},`);
      assert.equal(await textOf(lines.nth(3)), WORDS.met(group.name, REMIND_WEEK, session.startsAt));
      assert.equal(await textOf(lines.nth(4)), WORDS.addedNow);
      await panel().getByTestId("remind-send").getByText(WORDS.sendTo(1), { exact: true }).waitFor({ timeout: WAIT_MS });
    });

    await step("the facilitator sends it, and the one email goes to that fellow alone, in its words and with no meeting link", async () => {
      activePage = fernPage;
      const send = panel().getByTestId("remind-send");
      await waitFor("Send to be live once the page has hydrated", async () => send.isEnabled());
      const [pressed] = await Promise.all([responseTo(fernPage, remindPath, "POST"), send.click()]);
      assert.deepEqual(pressed.request().postDataJSON(), { week: REMIND_WEEK, count: 1 }, "the press carried something else");
      const body = await okBody(pressed, "Remind");
      assert.deepEqual(body.sent, { sent: 1, justReminded: 0, suppressed: 0, held: 0, failed: 0 });
      await countCard().getByRole("status").filter({ hasText: WORDS.emailed(1) }).waitFor({ timeout: WAIT_MS });

      await waitForMessagesTo(ben.email, { count: 1, timeoutMs: WAIT_MS });
      const reminders = await waitFor("Ben's reminder to arrive", async () => {
        const found = await remindersTo(ben.email);
        return found.length > 0 ? found : null;
      });
      assert.equal(reminders.length, 1, "Ben was reminded more than once");
      const email = await readEmail(reminders[0]);
      const said = flat(email.text);
      assert.ok(said.includes(`Hi ${ben.first},`), `the greeting: ${said}`);
      assert.ok(said.includes(WORDS.met(group.name, REMIND_WEEK, session.startsAt)), `the first paragraph: ${said}`);
      assert.ok(said.includes(WORDS.addedNow), `the line about late work: ${said}`);
      assert.ok(said.includes("our records show this week’s work isn’t finished"), "the notice line is missing");
      assert.ok(said.includes(`${fern.first} and the`), "it does not say who it is from");
      for (const [part, text] of [["HTML", email.html], ["text", email.text]]) {
        assert.ok(!text.includes(group.meetingUrl) && !text.includes(new URL(group.meetingUrl).host), `the ${part} part carries the meeting link`);
      }
      assert.ok(email.html.includes(weekPath), "the button does not lead to week 1's page");
      assert.doesNotMatch(email.text, /unsubscribe/i, "a notice offers no unsubscribe");
      for (const other of [ada, fern]) {
        assert.equal((await settleMessagesTo(other.email)).filter((summary) => (summary.Subject ?? "") === subject).length, 0, `${other.first} was reminded`);
      }
    });

    await step("the panel says when the fellow was last reminded and by whom, and warns before a second reminder", async () => {
      activePage = fernPage;
      await openRemind(1);
      const person = panel().getByTestId("remind-person").first();
      await waitFor("the last reminder to show", async () => WORDS.byFern(fern.first).test(await textOf(person)));
      await panel().getByRole("status").filter({ hasText: WORDS.warning(ben.first) }).waitFor({ timeout: WAIT_MS });
      await panel().getByRole("button", { name: "Close", exact: true }).click();
      await panel().waitFor({ state: "detached", timeout: WAIT_MS });
      assert.equal((await remindersTo(ben.email)).length, 1, "opening the panel again sent something");
    });

    await step("the fellow finishes week 1 on its page, as a member", async () => {
      activePage = benPage;
      await signIn(benPage, ben);
      await benPage.goto(`${origin}${weekPath}`, { waitUntil: "domcontentloaded" });
      for (const key of ["s1", "s2"]) {
        const itemId = courseworkItemId(REMIND_WEEK, key);
        const tick = benPage.getByRole("checkbox", { name: `Done: ${COURSEWORK_SOURCES[key]}`, exact: true });
        await tick.waitFor({ timeout: WAIT_MS });
        await waitFor(`the tick on ${COURSEWORK_SOURCES[key]} to take a press`, async () => tick.isEnabled());
        const [ticked] = await Promise.all([responseTo(benPage, `/ticks/${itemId}`, "PUT"), tick.check()]);
        await okBody(ticked, `Ticking ${COURSEWORK_SOURCES[key]}`);
      }
      for (const key of ["rp1", "rp2", "rp3"]) {
        const promptId = courseworkItemId(REMIND_WEEK, key);
        const box = benPage.getByLabel(COURSEWORK_PROMPTS[key], { exact: true });
        await waitFor("the reflection box to take writing", async () => box.isEditable());
        const [saved] = await Promise.all([responseTo(benPage, `/reflections/${promptId}`, "PUT"), box.fill(BEN[key])]);
        await okBody(saved, `Saving the reflection ${key}`);
      }
      const answerId = courseworkItemId(REMIND_WEEK, "wa");
      const card = benPage.getByRole("region", { name: WORDS.writtenAnswer, exact: true });
      await card.getByText(COURSEWORK_ANSWER_PROMPT, { exact: true }).waitFor({ timeout: WAIT_MS });
      const answer = card.getByLabel(WORDS.yourAnswer, { exact: true });
      await waitFor("the answer box to take writing", async () => answer.isEditable());
      const [wrote] = await Promise.all([responseTo(benPage, `/written-answers/${answerId}`, "PUT"), answer.fill(BEN.answer)]);
      await okBody(wrote, "Saving the written answer");
      const send = card.getByRole("button", { name: WORDS.sendMyAnswer, exact: true });
      await waitFor("Send my answer to be live", async () => send.isEnabled());
      const [sent] = await Promise.all([responseTo(benPage, `/written-answers/${answerId}/send`, "POST"), send.click()]);
      assert.deepEqual(sent.request().postDataJSON(), { weekId: weekDocId(REMIND_WEEK) });
      assert.ok((await okBody(sent, "Sending the written answer")).written?.firstSentAt, "the send stamped no first send");
    });

    await step("the fellow drops out of Remind: week 1 is done by everybody, and nobody is left to remind", async () => {
      activePage = fernPage;
      await fernPage.goto(groupUrl, { waitUntil: "domcontentloaded" });
      await countCard().getByRole("heading", { name: WORDS.haveDone(2, 2, REMIND_WEEK), exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await countCard().getByRole("button", { name: /^Remind / }).count(), 0, "Remind is still offered");
      const preview = await fetchAs(fernPage, remindPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: REMIND_WEEK, preview: true }),
      });
      assert.equal(preview.status, 200, JSON.stringify(preview.body));
      assert.deepEqual([preview.body.preview.count, preview.body.preview.people], [0, []], "somebody is left to remind");
      assert.equal((await remindersTo(ben.email)).length, 1, "Ben was reminded again");
    });
  } finally {
    await benContext.close().catch(() => {});
    await fernContext.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
