/**
 * Messages, end to end in a real browser: one message to a programme's
 * people, from its Messages tab to their inboxes.
 *
 * The world's "week-three" point (scripts/e2e-fixtures/worlds/course-hub-term.mjs):
 * Publish told everybody their group before the run began, so Ada, Ben and
 * Cleo each hold a place on the programme.
 *
 * -> the picker reads this term (the seed made the fixture's form the term)
 * and offers the admin the programme's people -> the admin names the running
 * run on the programme's Settings tab, which gives its groups their tags and
 * lets a message be kept on its page -> the programme's Messages tab links to
 * Messages set to the programme's people: "3 people", "3 will be emailed · 0
 * left out", a programme notice, and "Also post it on the programme's page"
 * on -> Send waits for a test; the test reaches the admin's own address
 * alone, marked [TEST], with no notice line -> "Send to 3 people" sends one
 * notice each to Ada, Ben and Cleo, saying why it reached them, and nothing
 * to anybody else -> the message is an update on the programme's page too,
 * and the record of the send names no address -> Sent lists it, with who it
 * reached by name and no address -> the run's home opens Messages set to the
 * programme's people holding a place, from "Email the whole cohort".
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec messages
 *
 * It declares `requiresCaughtMail`: the test goes to the admin's own address
 * and each notice is read out of its person's mailbox, so the runner skips it
 * anywhere but a server it started with its mail caught by Mailpit. CHROMIUM
 * ONLY: a green run is a regression net, never a substitute for the manual
 * Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import { getMessage, messagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
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
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/messages.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/**
 * MESSAGES' WORDS, restated from src/lib/messages/words.ts, src/lib/audience/words.ts
 * and src/emails/NoticeMarker.tsx, with their slots filled from the records.
 */
const WORDS = Object.freeze({
  openInMessages: "Write in Messages",
  pageTitle: "Messages",
  chip: (programme) => `${programme}: everyone`,
  headline: "3 people",
  emailed: "3 will be emailed · 0 left out",
  notice: "Programme notice",
  seeWho: "See who",
  willBeEmailed: "Will be emailed",
  post: "Also post it on the programme’s page",
  subjectLabel: "Subject",
  messageLabel: "Message",
  test: "Send a test to me",
  testFirst: "Send yourself a test of these words first.",
  testSent: "Test sent to you at ",
  send: "Send to 3 people",
  sent: (programme) => `Sent to 3 people. Posted on ${programme}’s page too.`,
  marker: "You are getting this because you hold a place on a programme or help run one",
  sentTab: "Sent",
  sentCounts: "3 emailed · 0 left out",
  byYou: "by you",
  emailedTitle: "Emailed (3)",
  cohortTitle: "The whole cohort",
  cohortLink: "Email the whole cohort",
});

/** The message the admin writes: words nothing else on the site says. */
const SUBJECT = "Lamp keepers: a room change this week";
const MESSAGE = "We are in Room E3 this week, not E1. Same time.\n\nBring the second reading's map.";

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
const [term] = state?.terms ?? [];

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !term
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Messages for a whole programme is an admin's here, and this harness cannot create an admin."
      : term.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, the admin's test included, so it runs only against the server the harness starts with its mail caught by Mailpit."
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

test("messages: one message to a programme's people, from a test to their inboxes", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const people = ["ada", "ben", "cleo"].map((key) => {
    const found = term.people.find((person) => person.key === key);
    assert.ok(found, `the week-three term has nobody called ${key}`);
    return found;
  });
  const everyone = `programme:${term.formId}:${term.programmeId}:everyone`;
  const formBase = `${origin}/admin/admissions/forms/${enc(term.formId)}/programmes/${enc(term.programmeId)}`;

  const { browser, context, page } = await openBrowser();
  const recorder = createStepRecorder({ t, page, markerPath: MARKER, artifactsDir: ARTIFACTS_DIR, skipReasonFor: (name) => skipReasonFor(name) });
  const step = (name, fn) => recorder.step(name, fn);

  const recaptchaStubbed = await stubRecaptchaOnLoopback(page, origin);
  if (!recaptchaStubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);

  const responseTo = (suffix, method) =>
    page.waitForResponse((r) => new URL(r.url()).pathname === suffix && r.request().method() === method, { timeout: WAIT_MS });
  async function okBody(response, what) {
    const body = await response.json().catch(() => null);
    assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }
  const notices = async (person) => (await messagesTo(person.email)).filter((each) => each.Subject === SUBJECT);

  /** The picker's own answer for the admin: the term it reads, and every tag it offers, under its heading. */
  async function catalogue(what) {
    return okBody(await page.request.get(`${origin}/api/audience`), what);
  }
  const programmeTags = (answer) => answer.groups?.find((group) => group.heading === term.programmeName)?.tags ?? [];

  try {
    await step("the picker reads this term, and offers the admin the programme's people", async () => {
      await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
      const answer = await catalogue("The picker's tags");
      // Everything after this needs the fixture's form to be the current term: the
      // opened form whose decisions went out most recently, which the seed stamped.
      assert.equal(
        answer.term,
        term.formLabel,
        `The picker reads the term ${JSON.stringify(answer.term)}, not this spec's form ${JSON.stringify(term.formLabel)}. ` +
          "Messages writes to the current term, the opened form whose decisions went out most recently, and the seed " +
          "stamped this form's decision day later than every other decided form's on the server: another form now " +
          "has a later one, set after the seed ran.",
      );
      const tags = programmeTags(answer);
      assert.deepEqual(
        tags.map((tag) => tag.listLabel),
        ["Everyone", "Holding a place", "Facilitating"],
        `The picker does not offer the admin ${term.programmeName}'s tags as a programme of the term (and no group's, its run not ` +
          `named yet). Its headings: ${JSON.stringify((answer.groups ?? []).map((group) => group.heading))}.`,
      );
      const everyoneTag = tags.find((tag) => tag.id === everyone);
      assert.ok(everyoneTag, `The programme's everyone tag is not ${everyone}: ${JSON.stringify(tags.map((tag) => tag.id))}`);
      assert.equal(everyoneTag.count, people.length, `${term.programmeName}'s everyone counts ${everyoneTag.count}, not the ${people.length} holding a place`);
    });

    await step("the admin names the running course run on the programme's Settings tab, so its groups have tags and a message can be kept on its page", async () => {
      await page.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
      const panel = page.getByRole("region", { name: "Course run" });
      await panel.waitFor({ timeout: WAIT_MS });
      const runBox = panel.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([
        page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/programmes/${term.programmeId}/run`) && r.request().method() === "PUT", { timeout: WAIT_MS }),
        runBox.selectOption({ label: `${term.runLabel} · Running` }),
      ]);
      assert.equal((await okBody(named, "Naming the run")).panel?.runId, term.runId);
      // The run's allocation was published, so its groups now have tags beside the programme's.
      const labels = programmeTags(await catalogue("The picker's tags, once the run is named")).map((tag) => tag.listLabel);
      for (const group of term.groups) assert.ok(labels.includes(group.name), `The picker offers no tag for ${group.name} once the run is named: ${JSON.stringify(labels)}`);
    });

    await step("the programme's Messages tab opens Messages set to its people, as a programme notice, with the post switch on", async () => {
      await page.goto(`${formBase}/messages`, { waitUntil: "domcontentloaded" });
      const link = page.getByRole("link", { name: WORDS.openInMessages, exact: true });
      await link.waitFor({ timeout: WAIT_MS }).catch((err) => {
        throw new Error(
          `The programme's Messages tab draws no ${JSON.stringify(WORDS.openInMessages)}. It is drawn when Messages would start ` +
            "with the programme's people for the reader (postTargetsOf in src/lib/messages/posting.ts): the programme is the " +
            `term's, its run is named and still there. ${err.message}`,
        );
      });
      assert.equal(new URL(await link.getAttribute("href"), origin).searchParams.get("for"), everyone);
      const [counted] = await Promise.all([responseTo("/api/audience", "POST"), link.click()]);
      const count = (await okBody(counted, "Counting the programme's people")).count;
      assert.deepEqual({ people: count.people, emailed: count.emailed, leftOut: count.leftOut, mode: count.mode }, { people: 3, emailed: 3, leftOut: 0, mode: "notice" });
      await page.getByRole("heading", { level: 1, name: WORDS.pageTitle, exact: true }).waitFor({ timeout: WAIT_MS });
      const main = page.locator("main");
      await main.getByText(WORDS.emailed, { exact: true }).waitFor({ timeout: WAIT_MS });
      const said = await textOf(main);
      for (const words of [WORDS.chip(term.programmeName), WORDS.headline, WORDS.notice, WORDS.post]) {
        assert.ok(said.includes(words), `Messages does not say ${JSON.stringify(words)}: ${said}`);
      }
      assert.equal(await main.getByRole("checkbox", { name: new RegExp(WORDS.post) }).isChecked(), true, "the post switch is off for one programme's people");
      // See who: the three by name, each to be emailed, and never an address.
      const [whoAnswer] = await Promise.all([responseTo("/api/audience/who", "POST"), main.getByRole("button", { name: WORDS.seeWho, exact: true }).click()]);
      const lines = (await okBody(whoAnswer, "See who")).people;
      assert.equal(lines.length, 3);
      assert.ok(lines.every((line) => line.emailed === true && line.you === false), JSON.stringify(lines));
      await main.getByText(`${WORDS.willBeEmailed} (3)`, { exact: true }).waitFor({ timeout: WAIT_MS });
      const named = await textOf(main);
      for (const person of people) assert.ok(named.includes(person.first), `See who does not name ${person.first}`);
      assert.doesNotMatch(named, /@/, "an address is on the page");
    });

    await step("the send waits for a test, and the test reaches the admin alone, marked as one", async () => {
      const main = page.locator("main");
      await main.getByLabel(WORDS.subjectLabel, { exact: true }).fill(SUBJECT);
      await main.getByLabel(WORDS.messageLabel, { exact: true }).fill(MESSAGE);
      await main.getByText(WORDS.testFirst, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await main.getByRole("button", { name: WORDS.send, exact: true }).isEnabled(), false, "Send is live before a test");
      const [tested] = await Promise.all([responseTo("/api/messages/test", "POST"), main.getByRole("button", { name: WORDS.test, exact: true }).click()]);
      assert.equal((await okBody(tested, "Sending the test")).test?.delivery, "sent");
      await main.getByText(new RegExp(`^${WORDS.testSent}`)).waitFor({ timeout: WAIT_MS });
      const testMail = await waitFor("the admin's test", async () =>
        (await messagesTo(secrets.adminEmail)).find((each) => each.Subject === `[TEST] ${SUBJECT}`),
      );
      const words = wordsOf((await getMessage(testMail.ID)).HTML);
      assert.ok(words.includes("We are in Room E3 this week, not E1. Same time."), `the test does not carry the message: ${words}`);
      assert.ok(!words.includes(WORDS.marker), "the test carries the notice line");
      for (const person of people) assert.deepEqual(await notices(person), [], `${person.first} was sent the test`);
    });

    await step("the send goes to the number on its button: one notice each, and nobody else", async () => {
      const main = page.locator("main");
      const send = main.getByRole("button", { name: WORDS.send, exact: true });
      await waitFor("Send to be live once the test reached the admin", async () => send.isEnabled());
      const [sent] = await Promise.all([responseTo("/api/messages", "POST"), send.click()]);
      // A notice to a programme's people is email alone: only a notice to one group pushes.
      assert.deepEqual(await okBody(sent, "Sending"), { ok: true, sent: 3, held: 0, suppressed: 0, failed: 0, pushed: 0, posted: term.programmeName });
      await main.getByText(WORDS.sent(term.programmeName), { exact: true }).waitFor({ timeout: WAIT_MS });
      for (const person of people) {
        const [notice] = await waitFor(`${person.first}'s notice`, async () => {
          const found = await notices(person);
          return found.length > 0 ? found : null;
        });
        const words = wordsOf((await getMessage(notice.ID)).HTML);
        assert.ok(words.includes(WORDS.marker), `${person.first}'s notice does not say why it reached them: ${words}`);
        assert.ok(words.includes("Bring the second reading's map."), `${person.first}'s notice does not carry the message`);
        assert.doesNotMatch(words, /unsubscribe/i, `${person.first}'s notice offers to unsubscribe`);
        assert.equal((await notices(person)).length, 1, `${person.first} was sent it twice`);
      }
      const admins = (await messagesTo(secrets.adminEmail)).filter((each) => each.Subject === SUBJECT);
      assert.equal(admins.length, 0, "the admin, who is not among the programme's people, was sent it");
    });

    await step("the message is kept on the programme's page too, and the send's record names no address", async () => {
      const updates = (await fixtureQuery("courseUpdates").where("runId", "==", term.runId).get()).docs.map((doc) => doc.data());
      const posted = updates.find((each) => each.title === SUBJECT);
      assert.ok(posted, "the message was not posted on the programme's page");
      assert.equal(posted.to, "everyone");
      assert.deepEqual(posted.email, { planned: 3, sent: 3, held: 0, suppressed: 0, failed: 0, settled: true });
      const records = (await fixtureQuery("messageSends").where("tagIds", "array-contains", everyone).get()).docs.map((doc) => doc.data());
      assert.equal(records.length, 1, "the send left no record, or more than one");
      const [record] = records;
      assert.equal(record.mode, "notice");
      assert.equal(record.counts.sent, 3);
      assert.deepEqual(record.people.map((person) => person.uid).sort(), people.map((person) => person.uid).sort());
      assert.doesNotMatch(JSON.stringify(record), /@/, "the record keeps an address");
      assert.ok(!JSON.stringify(record).includes("Room E3"), "the record keeps the message");
      assert.equal(record.counts.pushed, 0, "a notice to a programme's people was pushed");
    });

    await step("Sent lists the send, with who it reached by name and no address", async () => {
      const main = page.locator("main");
      await Promise.all([
        page.waitForURL((url) => url.pathname === "/messages/sent", { timeout: WAIT_MS }),
        main.getByRole("link", { name: WORDS.sentTab, exact: true }).click(),
      ]);
      const card = main.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: SUBJECT, exact: true }) });
      await card.waitFor({ timeout: WAIT_MS });
      const said = await textOf(card);
      for (const words of [WORDS.notice, WORDS.byYou, WORDS.chip(term.programmeName), WORDS.sentCounts]) {
        assert.ok(said.includes(words), `Sent's card does not say ${JSON.stringify(words)}: ${said}`);
      }
      await card.getByText(WORDS.seeWho, { exact: true }).click();
      await card.getByText(WORDS.emailedTitle, { exact: true }).waitFor({ timeout: WAIT_MS });
      const named = await textOf(card);
      for (const person of people) assert.ok(named.includes(person.first), `Sent does not name ${person.first}: ${named}`);
      assert.doesNotMatch(await textOf(main), /@/, "an address is on Sent");
    });

    await step("the run's home opens Messages set to the programme's people holding a place, from Email the whole cohort", async () => {
      await page.goto(`${origin}/learn/${enc(term.runId)}`, { waitUntil: "domcontentloaded" });
      const card = page.locator("section").filter({ has: page.getByRole("heading", { name: WORDS.cohortTitle, exact: true }) });
      await card.waitFor({ timeout: WAIT_MS });
      const link = card.getByRole("link", { name: WORDS.cohortLink });
      const href = new URL(await link.getAttribute("href"), origin);
      assert.equal(href.pathname, "/messages", "Email the whole cohort does not open Messages for the admin");
      assert.equal(href.searchParams.get("for"), `programme:${term.formId}:${term.programmeId}:holding`);
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
