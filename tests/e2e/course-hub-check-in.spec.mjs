/**
 * The check-in at the end of a session, end to end in a real browser.
 *
 * The world's "check-in" point (scripts/e2e-fixtures/worlds/course-hub-term.mjs):
 * the fellowship three weeks in, one group of five, its week 3 session under
 * way when the seed ran.
 *
 * -> the admin approves the people who sign in -> names the running run and
 * hands its people over -> appoints Fern to the group -> Fern's register
 * offers the check-in on the session's day ("Take the register first"), and
 * once Fern marks the five, "Open it for the 5 here" -> Fern opens it: one
 * notice each to the five, each with a link of its own, and none to Fern ->
 * Ada and Dan answer from their links, on the check-in's own page, the box at
 * the top -> Ben answers signed in, from the code Fern shows -> Cleo's Home
 * shows "A check-in for you" -> Fern's card says "3 of 5 have sent it", never
 * who; Fern closes it, and the card shows the totals from three answers and
 * no comment -> Cleo's Home card has gone, and Cleo's link says it has closed.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-check-in
 *
 * It declares `requiresCaughtMail`: each person's link is read out of their
 * mailbox, so the runner skips it anywhere but a server it started with its
 * mail caught by Mailpit. CHROMIUM ONLY: a green run is a regression net,
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
import { getMessage, hrefUrls, messagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
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
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-check-in.mjs";
import { CHECK_IN_DAY, londonDateKey } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/**
 * THE CHECK-IN'S WORDS, restated from src/lib/surveys/checkIns/words.ts and
 * src/lib/surveys/words.ts, with their slots filled from the records.
 */
const WORDS = Object.freeze({
  cardTitle: "Last 10 minutes: the check-in",
  takeRegisterFirst: "Take the register first: the check-in goes to the people marked here.",
  openButton: (n) => `Open it for the ${n} here`,
  opened: (n) => `It’s open. ${n} people emailed.`,
  sentSoFar: (answered, of) => `${answered} of ${of} ${answered === 1 ? "has" : "have"} sent it`,
  showCode: "Show the QR code",
  codeTitle: "Scan to answer the check-in",
  closeNow: "Close it now",
  closedHeading: (week, group) => `Week ${week}’s check-in, ${group}`,
  answered: (answered, of) => `${answered} of ${of} answered`,
  title: (week) => `How was week ${week}?`,
  subject: (week, programme) => `How was week ${week}? 6 questions for ${programme}`,
  notice: "You are getting this because you were at this session of your course group",
  confidential: "It’s confidential: only NAISI’s admins can see who said what. Your facilitators see your group’s totals, never your answers.",
  button: "Answer the check-in",
  eyebrow: "Check-in",
  box: [
    "Only NAISI’s admins see who said what.",
    "Your facilitators see your group’s totals, never your answers.",
  ],
  send: "Send check-in",
  thanks: "Thank you. Your answers are in.",
  homeEyebrow: "A check-in for you",
  closedTitle: "This survey has closed",
});

/** What each person who answers writes as the most useful thing: words nothing else on the site says. */
const MOST = Object.freeze({
  ada: "Arguing the lamp keepers’ case out loud.",
  dan: "The second reading's map of who keeps what.",
  ben: "Hearing how the other keepers decided.",
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
      : term.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, each person's link included, so it runs only against the server the harness starts with its mail caught by Mailpit."
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

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** What an email's HTML says, as one line of words. */
function wordsOf(html) {
  return flat(
    String(html ?? "")
      .replace(/<(style|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/?(p|div|h[1-6]|li|ul|ol|tr|td|th|table|tbody|thead|section|body|html))\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole),
  );
}

test("course hub: the check-in at the end of a session, from the register to the facilitator's totals", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const personOf = (key) => {
    const found = term.people.find((person) => person.key === key);
    assert.ok(found, `the check-in term has nobody called ${key}`);
    return found;
  };
  const [ada, ben, cleo, dan, eve] = ["ada", "ben", "cleo", "dan", "eve"].map(personOf);
  const fern = term.facilitator;
  assert.ok(fern, "the check-in term has no account to appoint as a facilitator");
  const group = term.groups[0];
  assert.equal(term.groups.length, 1, "the check-in term has more than its one group");
  for (const person of term.people) assert.equal(person.groupKey, group.key, `${person.first} is not in ${group.name}`);

  // The run's week, by its own calendar: the world promises week 3, and the group's session today.
  const elapsedDays = Math.round((Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${term.startDate}T00:00:00Z`)) / 86_400_000);
  const week = Math.floor(elapsedDays / 7) + 1;
  assert.equal(week, 3, `the term is in week ${week}, not week 3`);
  assert.equal(elapsedDays, CHECK_IN_DAY.daysIn, "the seed's day is not the group's session day");

  const formBase = `${origin}/admin/admissions/forms/${enc(term.formId)}/programmes/${enc(term.programmeId)}`;
  const registerUrl = `${origin}/learn/${enc(term.runId)}/group/${enc(group.id)}/register`;

  const { browser, context, page: adminPage } = await openBrowser();
  const identities = [];
  for (let i = 0; i < 5; i += 1) identities.push(await newIdentityPage(browser));
  const [fernPage, adaPage, danPage, benPage, cleoPage] = identities.map((each) => each.page);

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
  for (const pg of [fernPage, adaPage, danPage, benPage, cleoPage]) await stubRecaptchaOnLoopback(pg, origin);
  if (!recaptchaStubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);

  const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });
  const responseTo = (pg, suffix, method) =>
    pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });
  async function okBody(response, what) {
    const body = await response.json().catch(() => null);
    assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }

  /** The check-in's own document, found by the run it names (it carries no form at its top). */
  const checkInOf = async () =>
    (await fixtureQuery("surveys").where("runId", "==", term.runId).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() })).find((doc) => doc.kind === "checkIn") ?? null;

  /** Each person's own link, out of their one check-in email. */
  const linkOf = new Map();

  /** Answer the check-in's one page as a person would: a point, a line, a tick, the reading, a point, Send. */
  async function answer(pg, key) {
    const form = pg.locator("form");
    await pg.getByRole("button", { name: WORDS.send, exact: true }).waitFor({ timeout: WAIT_MS });
    await waitFor("Send check-in to be live once the page has hydrated", async () => pg.getByRole("button", { name: WORDS.send, exact: true }).isEnabled());
    await form.getByRole("group", { name: /How useful was today’s session\?/ }).getByLabel(/^4 out of 5/).check();
    await form.getByRole("group", { name: /What was the most useful thing\?/ }).getByRole("textbox").fill(MOST[key]);
    await form.getByRole("group", { name: /Was anything unclear\?/ }).getByRole("checkbox", { name: "Nothing was unclear" }).check();
    await form.getByRole("group", { name: /How much of this week’s reading/ }).getByRole("radio", { name: "Most" }).check();
    await form.getByRole("group", { name: /How confident do you feel/ }).getByLabel(/^3 out of 5/).check();
    await pg.getByRole("button", { name: WORDS.send, exact: true }).click();
    await pg.getByText(WORDS.thanks, { exact: true }).waitFor({ timeout: WAIT_MS });
  }

  try {
    await step("the admin approves everybody who signs in on this journey", async () => {
      activePage = adminPage;
      await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
      for (const account of [fern, ben, cleo]) {
        await approvePendingApplicant(adminPage, origin, { email: account.email });
        await waitFor(`${account.first}'s account to say member`, async () => (await readUserDoc(account.uid))?.role === "member");
      }
      // Each approval sends one email, a moment after its card leaves the queue.
      for (const account of [fern, ben, cleo]) await waitForMessagesTo(account.email, { count: 1, timeoutMs: WAIT_MS });
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

    await step("the facilitator's register offers the check-in on the session's day, and counts the five once they are marked", async () => {
      activePage = fernPage;
      await signIn(fernPage, fern);
      await fernPage.goto(registerUrl, { waitUntil: "domcontentloaded" });
      const card = fernPage.getByTestId("check-in");
      await card.getByRole("heading", { name: WORDS.cardTitle, exact: true }).waitFor({ timeout: WAIT_MS });
      await card.getByText(WORDS.takeRegisterFirst, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await card.getByTestId("check-in-open").count(), 0, "the card offers to open the check-in before anybody is marked");
      // "Rest present" on this week's column marks the five.
      const thisWeek = fernPage.getByTestId("attendance-session").filter({ hasText: `Week ${week}` });
      await Promise.all([
        responseTo(fernPage, `/groups/${group.id}/attendance`, "POST"),
        thisWeek.getByTestId("attendance-bulk").click(),
      ]);
      await card.getByTestId("check-in-open").filter({ hasText: WORDS.openButton(5) }).waitFor({ timeout: WAIT_MS });
    });

    await step("the facilitator opens it, and each of the five has one notice with a link of their own", async () => {
      activePage = fernPage;
      const card = fernPage.getByTestId("check-in");
      const [opened] = await Promise.all([responseTo(fernPage, `/groups/${group.id}/check-in`, "POST"), card.getByTestId("check-in-open").click()]);
      assert.deepEqual(await okBody(opened, "Opening the check-in"), { ok: true, people: 5, emailed: 5, failed: 0, noAddress: 0 });
      await card.getByText(WORDS.opened(5), { exact: true }).waitFor({ timeout: WAIT_MS });
      await card.getByTestId("check-in-sent").filter({ hasText: "None of the 5 have sent it yet" }).waitFor({ timeout: WAIT_MS });
      const survey = await checkInOf();
      assert.ok(survey, "no check-in was made");
      assert.equal(survey.audience?.groupId, group.id);
      assert.equal(survey.audience?.weekNumber, week);
      for (const person of [ada, ben, cleo, dan, eve]) {
        // Ben and Cleo have their approval's email too: the check-in's is the one with its subject.
        const summary = await waitFor(`${person.first}'s check-in email`, async () =>
          (await messagesTo(person.email)).find((each) => each.Subject === WORDS.subject(week, term.programmeName)),
        );
        const message = await getMessage(summary.ID);
        const words = wordsOf(message.HTML);
        for (const sentence of [WORDS.notice, WORDS.confidential, WORDS.button]) assert.ok(words.includes(sentence), `${person.first}'s email does not say ${JSON.stringify(sentence)}: ${words}`);
        const link = hrefUrls(message.HTML).find((url) => new URL(url).pathname.startsWith("/survey/"));
        assert.ok(link, `${person.first}'s email carries no link of their own`);
        linkOf.set(person.key, link);
      }
      assert.equal(new Set(linkOf.values()).size, 5, "two people were sent the same link");
      const fernCheckIns = (await messagesTo(fern.email)).filter((each) => each.Subject === WORDS.subject(week, term.programmeName));
      assert.equal(fernCheckIns.length, 0, "the facilitator was sent the check-in");
    });

    await step("two people answer from their email's link, on its own page with the box at the top", async () => {
      for (const [person, pg] of [
        [ada, adaPage],
        [dan, danPage],
      ]) {
        activePage = pg;
        await pg.goto(linkOf.get(person.key), { waitUntil: "domcontentloaded" });
        await pg.getByRole("heading", { level: 1, name: WORDS.title(week), exact: true }).waitFor({ timeout: WAIT_MS });
        const main = await textOf(pg.locator("main"));
        assert.ok(main.includes(WORDS.eyebrow), "the page does not say it is a check-in");
        for (const point of WORDS.box) assert.ok(main.includes(point), `the box does not say ${JSON.stringify(point)}`);
        assert.ok(main.indexOf(WORDS.box[0]) < main.indexOf("How useful was today’s session?"), "the box is not at the top");
        await answer(pg, person.key);
      }
    });

    await step("somebody answers signed in, from the code the facilitator shows", async () => {
      activePage = fernPage;
      await fernPage.getByRole("button", { name: WORDS.showCode, exact: true }).click();
      const dialog = fernPage.getByRole("dialog");
      await dialog.getByRole("heading", { name: WORDS.codeTitle, exact: true }).waitFor({ timeout: WAIT_MS });
      const label = await dialog.getByRole("img").getAttribute("aria-label");
      const address = /^QR code for (.+)$/.exec(label ?? "")?.[1];
      assert.ok(address, `the code says nothing of where it goes: ${label}`);
      const path = address.slice(address.indexOf("/"));
      assert.match(path, new RegExp(`^/learn/${escapeRegExp(term.runId)}/survey/ci-[0-9a-f]{40}$`));
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      activePage = benPage;
      await signIn(benPage, ben);
      await benPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      await benPage.getByRole("heading", { level: 1, name: WORDS.title(week), exact: true }).waitFor({ timeout: WAIT_MS });
      await answer(benPage, "ben");
    });

    await step("a member who has not answered sees it on Home", async () => {
      activePage = cleoPage;
      await signIn(cleoPage, cleo);
      await cleoPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
      const card = cleoPage.getByRole("region", { name: WORDS.title(week) });
      await card.getByText(WORDS.homeEyebrow, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(new URL(await card.getByRole("link").getAttribute("href"), origin).pathname, new URL(linkOf.get("cleo")).pathname, "Home's card does not open Cleo's own link");
    });

    await step("the facilitator's card counts who has sent it, never who, and once closed shows the totals from three answers and no comment", async () => {
      activePage = fernPage;
      await fernPage.reload({ waitUntil: "domcontentloaded" });
      const card = fernPage.getByTestId("check-in");
      await card.getByTestId("check-in-sent").filter({ hasText: WORDS.sentSoFar(3, 5) }).waitFor({ timeout: WAIT_MS });
      const said = await textOf(card);
      for (const person of term.people) assert.ok(!said.includes(person.first), `the card names ${person.first}`);
      await card.getByTestId("check-in-close").click();
      const [closed] = await Promise.all([responseTo(fernPage, `/groups/${group.id}/check-in/close`, "POST"), fernPage.getByTestId("check-in-close-confirm").click()]);
      await okBody(closed, "Closing the check-in");
      await card.getByRole("heading", { name: WORDS.closedHeading(week, group.name), exact: true }).waitFor({ timeout: WAIT_MS });
      const totals = await textOf(card.getByTestId("check-in-totals"));
      assert.ok(totals.includes(WORDS.answered(3, 5)), `the totals do not say how many answered: ${totals}`);
      assert.ok(totals.includes("Useful: 4.0 of 5"), `the totals do not say how useful: ${totals}`);
      const page = await textOf(fernPage.locator("main"));
      for (const words of Object.values(MOST)) assert.ok(!page.includes(words), `a comment reached the facilitator: ${words}`);
      const survey = await checkInOf();
      assert.ok(survey?.closedAt, "closing it left no stamp");
    });

    await step("once it has closed it is off Home, and a link to it says so", async () => {
      activePage = cleoPage;
      await cleoPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
      await cleoPage.getByRole("heading", { level: 1 }).first().waitFor({ timeout: WAIT_MS });
      assert.equal(await cleoPage.getByText(WORDS.homeEyebrow, { exact: true }).count(), 0, "a closed check-in is still on Home");
      await cleoPage.goto(linkOf.get("cleo"), { waitUntil: "domcontentloaded" });
      await cleoPage.getByRole("heading", { level: 1, name: WORDS.closedTitle, exact: true }).waitFor({ timeout: WAIT_MS });
    });
  } finally {
    await Promise.allSettled([context, ...identities.map((each) => each.context)].map((each) => each.close()));
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
