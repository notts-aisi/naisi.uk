/**
 * Groups go out, end to end, in a real browser: the course hub's first spec.
 *
 * A term just after decision day (scripts/e2e-fixtures/worlds/course-hub-term.mjs)
 * -> the admin approves the two waiting accounts the journey signs in as ->
 * names the course run on the programme's Settings tab -> moves it on from
 * draft in the run editor -> hands the people holding a place over to it, and
 * presses again to see nothing written twice -> reads who can make each group
 * on the Times view -> places each person with the Move to menu -> appoints a
 * facilitator -> sends the test of Publish's emails to themselves -> presses
 * Publish with the count on its button -> the person placed reads their group
 * and its first session -> the admin moves them after Publish and they see
 * nothing until Publish is pressed again, which emails only them -> the
 * facilitator reads their group, its roster and its register -> every email
 * went to the send log and none carries the meeting link.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-groups-go-out
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: "Send a test to me"
 * emails the admin's own address, which the harness does not own.
 *
 * ## The words it holds the emails to
 *
 * The test, each person's "Placed in a group" and the facilitator's "You’re
 * facilitating" are read out of Mailpit and held word for word to the seed
 * copy of their templates (`courseTemplateDefaults` in
 * src/lib/firestore/courseEmails.ts), which is what the boards draw, with
 * each slot filled from the fixture's own records. A project whose admins have
 * saved other wording in Email designs fails here, saying which sentence
 * differs.
 *
 * ## Three identities, three browser contexts
 *
 * The admin, the person who is placed and then moved, and the facilitator.
 * Each has its own context, so its cookies and its Firebase Auth state are its
 * own and nobody signs out for somebody else to act.
 *
 * ## CHROMIUM ONLY
 *
 * A green run is a regression net, never a substitute for the manual Safari
 * pass.
 *
 * ## It writes a completion marker, and the runner insists on it
 *
 * The shared recorder records each step as it finishes and writes the list in
 * the `finally`; the runner refuses to report success unless the marker names
 * every step in `SPEC.steps`.
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
  enrolmentId,
  fixtureDoc,
  fixtureQuery,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-groups-go-out.mjs";
import {
  dayLabel,
  firstSessionWhen,
  sessionWhenLabel,
  weeklySlotWords,
  whenShort,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/**
 * Why a step may not run in this mode, or null. Nothing on this journey is
 * reCAPTCHA-gated (`SPEC.recaptchaDependentSteps` is empty), so this never
 * fires; the wiring is the funnel's, kept so a press that grows a gate later
 * is one line from being declared.
 */
let skipReasonFor = () => null;

/** The one reason this file may record for a step it did not run. */
const DEPLOYED_TARGET_SKIP = RECAPTCHA_SKIP_REASON;

/** Through `readState`, never the ledger file itself: the ledger holds no credential. */
function loadState() {
  return readState(SPEC.name, RUN_STATE_DIR);
}

/** Playwright is not a dependency of this repo, so it is resolved at runtime. */
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

/** The origin under test, through the auth harness's own allowlist. */
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
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an " +
        "admin's, and this harness cannot create an admin."
      : state.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, the test of Publish's emails to the admin included, so " +
          "it runs only against the server the harness starts with its mail caught by Mailpit."
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

/** Every space, newline and tab run in a page's text, as one space. */
const flat = (text) => text.replace(/\s+/g, " ").trim();

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * What an email's HTML says, as one line of words: block tags become a space,
 * inline ones (a bold group name, a link) vanish, and entities are decoded.
 * Read off the HTML rather than the text part, which writes headings in
 * capitals.
 */
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

/** One email, read out of Mailpit whole: its subject, its words, its links and its text part. */
async function readEmail(summary) {
  const message = await getMessage(summary.ID);
  return {
    subject: message.Subject ?? summary.Subject ?? "",
    words: wordsOf(message.HTML),
    links: hrefUrls(message.HTML ?? ""),
    text: message.Text ?? "",
    html: message.HTML ?? "",
  };
}

/**
 * Holds one email to the sentences its template's seed copy says, in order of
 * the paragraphs. `absent` are sentences a left-out paragraph would have said.
 */
function assertSays(email, { who, sentences, absent = [] }) {
  const hint =
    "The words are the seed copy in src/lib/firestore/courseEmails.ts, which is what the boards " +
    "draw. If somebody saved other wording for this email in Email designs on this project, that " +
    "is the difference.";
  let from = 0;
  for (const sentence of sentences) {
    const at = email.words.indexOf(sentence, from);
    assert.ok(
      at !== -1,
      `${who} does not say ${JSON.stringify(sentence)}${from > 0 ? " after what came before it" : ""}. ` +
        `It says: ${JSON.stringify(email.words)}. ${hint}`,
    );
    from = at + sentence.length;
  }
  for (const sentence of absent) {
    assert.ok(
      !email.words.includes(sentence),
      `${who} says ${JSON.stringify(sentence)}, whose paragraph should have been left out.`,
    );
  }
  assert.ok(
    !/\{[A-Za-z]+\}/.test(email.words),
    `${who} still carries a token nobody filled: ${JSON.stringify(email.words)}`,
  );
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: groups go out, from the hand-over to the facilitator's register",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const [ada, ben, cleo] = state.people;
    const fern = state.facilitator;
    const groupOf = (key) => state.groups.find((group) => group.key === key);
    const groupA = groupOf("A");
    const groupB = groupOf("B");
    /** Where each person is placed first. Ben can make both groups, so he is the one moved. */
    const firstGroupOf = { [ada.key]: groupA, [ben.key]: groupA, [cleo.key]: groupB };

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const setupUrl = `${formBase}/setup`;
    const timesUrl = `${formBase}/groups/times`;
    const facilitatorsUrl = `${formBase}/groups/facilitators`;
    const runEditorUrl = `${origin}/admin/courses/${enc(state.courseId)}/runs/${enc(state.runId)}`;
    const boardUrl = `${runEditorUrl}/allocation`;
    const programmePath = `/learn/${enc(state.runId)}`;
    const groupPagePath = (group) => `${programmePath}/group/${enc(group.id)}`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: memberContext, page: memberPage } = await newIdentityPage(browser);
    const { context: facilitatorContext, page: facilitatorPage } = await newIdentityPage(browser);

    /**
     * Which page a failed step photographs. The recorder takes one page and
     * this spec drives three, so each step names its page first.
     */
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
    await stubRecaptchaOnLoopback(memberPage, origin);
    await stubRecaptchaOnLoopback(facilitatorPage, origin);
    if (!recaptchaStubbed) {
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? DEPLOYED_TARGET_SKIP : null);
    }

    const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });

    /** The answer to the next request whose path ends `suffix`, by `method`. */
    const responseTo = (pg, suffix, method) =>
      pg.waitForResponse(
        (r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method,
        { timeout: WAIT_MS },
      );

    /** A JSON answer that must be a success, read once. */
    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    /**
     * The centre-screen action toast carrying one sentence, matched by the
     * sentence as well as the role: other parts of these pages carry
     * `role="status"` too.
     */
    const toastOf = (pg, pattern) =>
      pg.locator('[role="status"][aria-live="polite"]').filter({ hasText: pattern }).first();

    /** Waits for the toast to say something while `run` presses, then for it to go. */
    async function readToast(pg, pattern, run) {
      const said = toastOf(pg, pattern);
      const [, answer] = await Promise.all([said.waitFor({ timeout: WAIT_MS }), run()]);
      // The toast covers the page while it is up, so a press before it goes
      // lands on its backdrop.
      await said.waitFor({ state: "hidden", timeout: WAIT_MS });
      return answer;
    }

    // ---- The programme's Settings tab ------------------------------------

    /** The "Course run" panel. */
    const runPanel = () => adminPage.getByRole("region", { name: "Course run" });

    // ---- The allocation board ---------------------------------------------

    /** One column of the board, by its group's name ("Unallocated" for the pool). */
    const column = (name) => adminPage.getByRole("region", { name, exact: true });
    /** A person's Move to menu, wherever their card is. */
    const moveMenu = (person) =>
      adminPage.getByRole("combobox", { name: `Move ${person.first} to another group`, exact: true });
    /** The Publish area: who a press reaches, the last test and the two buttons. */
    const publishArea = () => adminPage.locator('section[aria-labelledby="allocation-publish-title"]');
    /** Waits for the line over the Publish buttons to say exactly `words`. */
    const publishTitleSays = (words) =>
      adminPage
        .locator("#allocation-publish-title")
        .filter({ hasText: new RegExp(`^${escapeRegExp(words)}$`) })
        .waitFor({ timeout: WAIT_MS });

    /**
     * Moves one person into one group with their card's Move to menu, from the
     * keyboard, and reads the write back.
     *
     * The keyboard because the menu is a popover that closes the moment the
     * page scrolls, and a click on an option below the fold has the browser
     * scroll to it first, which shuts the menu under the pointer (a run lost
     * a step to exactly that). Enter opens it on the person's current place,
     * the arrows walk to the group, and Enter moves them: the menu's own
     * keyboard route, which nothing scrolls.
     *
     * Two details, each from a run's trace. The menu is found through the
     * trigger's `aria-controls`, not by name: it is named by the combobox,
     * and a name taken from a combobox is its current value, never its
     * label. And the trigger is brought into view, with a frame let go by,
     * BEFORE the menu opens: a scroll's event is delivered on the next frame,
     * and one arriving after the menu opened would shut it.
     */
    async function moveWithMenu(person, group) {
      const menu = moveMenu(person);
      await menu.scrollIntoViewIfNeeded();
      await adminPage.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await menu.press("Enter");
      const listboxId = await waitFor(`${person.first}'s Move to menu to open`, async () =>
        (await menu.getAttribute("aria-expanded")) === "true" ? menu.getAttribute("aria-controls") : null,
      );
      const options = adminPage.locator(`[id="${listboxId}"]`).getByRole("option");
      await options.first().waitFor({ timeout: WAIT_MS });
      const count = await options.count();
      let from = -1;
      let to = -1;
      for (let i = 0; i < count; i += 1) {
        if ((await options.nth(i).getAttribute("aria-selected")) === "true") from = i;
        if (flat(await options.nth(i).innerText()).startsWith(`${group.name} · `)) to = i;
      }
      assert.ok(from !== -1 && to !== -1, `${person.first}'s menu offers no ${group.name}, or no current place`);
      for (let i = 0; i < Math.abs(to - from); i += 1) await menu.press(to > from ? "ArrowDown" : "ArrowUp");
      const [response] = await Promise.all([responseTo(adminPage, "/allocate", "POST"), menu.press("Enter")]);
      const body = await okBody(response, `Placing ${person.first} in ${group.name}`);
      // One placed is the whole answer: a refused move places nobody, and the
      // answer printed below says why it was refused.
      assert.equal(
        body.placed,
        1,
        `the board placed ${body.placed} people, not ${person.first} alone: ${JSON.stringify(body)}`,
      );
      await column(group.name).getByRole("combobox", { name: `Move ${person.first} to another group` }).waitFor({
        timeout: WAIT_MS,
      });
    }

    /**
     * Opens the board and waits for it to settle: its columns drawn, and its
     * Refresh button enabled again, which it is not while a read is in flight.
     */
    async function openBoard() {
      await adminPage.goto(boardUrl, { waitUntil: "domcontentloaded" });
      await column("Unallocated").waitFor({ timeout: WAIT_MS });
      await publishArea().waitFor({ timeout: WAIT_MS });
      const refresh = adminPage.getByRole("button", { name: "Refresh", exact: true });
      await waitFor("the board to finish reading the run", async () => ((await refresh.isEnabled()) ? true : null));
    }

    /** Presses Publish, accepts its confirmation, and hands back the confirmation and the answer. */
    async function pressPublish(label) {
      const asked = new Promise((resolve) => {
        adminPage.once("dialog", async (dialog) => {
          const message = dialog.message();
          await dialog.accept();
          resolve(message);
        });
      });
      const answer = await readToast(adminPage, /Published\. What went is on the board\./, async () => {
        const [response] = await Promise.all([
          responseTo(adminPage, "/allocation/publish", "POST"),
          publishArea().getByRole("button", { name: label, exact: true }).click(),
        ]);
        return okBody(response, "Publish");
      });
      return { confirm: await asked, answer };
    }

    // ---- Mail ------------------------------------------------------------------

    /** The messages to one fixture address, oldest first. */
    async function mailTo(address, count) {
      const summaries = await waitForMessagesTo(address, { count, timeoutMs: WAIT_MS });
      return summaries.slice().reverse();
    }

    /**
     * The tests of Publish's emails this run sent to the admin, read out of the
     * admin's own mailbox in Mailpit. The admin's address is never printed.
     */
    async function adminTests() {
      const found = [];
      for (const summary of await messagesTo(secrets.adminEmail)) {
        if (!String(summary.Subject ?? "").startsWith("[TEST] ")) continue;
        const email = await readEmail(summary);
        if (email.subject.includes(state.courseTitle) || email.html.includes(state.runId)) found.push(email);
      }
      return found;
    }

    /** "Placed in a group", for one person in one group, as the seed copy writes it. */
    function assertPlacement(email, { person, group, facilitator, test: isTest = false }) {
      const subject = `Your ${state.courseTitle} group: first session ${firstSessionWhen(group)}`;
      assert.equal(email.subject, isTest ? `[TEST] ${subject}` : subject, "the placement email's subject");
      assertSays(email, {
        who: `${isTest ? "The test of " : ""}${person.first}'s placement email`,
        sentences: [
          `You've been placed, ${person.first}`,
          `You're in ${group.name} for ${state.courseTitle} (${state.runLabel}).`,
          ...(facilitator ? [`Your group is facilitated by ${facilitator.first}.`] : []),
          `Your first session is ${firstSessionWhen(group)}.`,
          `Where: ${group.room}`,
          "Everything you need is in the learning space on the website: the week's reading, your group's details and your progress.",
          "Do the first week's reading before you come; the sessions work best when everyone arrives with opinions.",
        ],
        absent: facilitator ? [] : ["Your group is facilitated by"],
      });
    }

    /** "You’re facilitating", for one group, as the seed copy writes it. */
    function assertFacilitating(email, { group, size, test: isTest = false }) {
      const subject = `You’re facilitating ${group.name}: ${weeklySlotWords(group)}`;
      assert.equal(email.subject, isTest ? `[TEST] ${subject}` : subject, "the facilitators' email's subject");
      assertSays(email, {
        who: `${isTest ? "The test of " : ""}the facilitators' email`,
        sentences: [
          `Hi ${fern.first},`,
          `${group.name} meets on ${weeklySlotWords(group)}, from ${dayLabel(group.firstDateKey)} to ${dayLabel(group.lastDateKey)}.`,
          `Where: ${group.room}`,
          size === 1 ? "There is 1 person in the group." : `There are ${size} people in the group.`,
          "Open your group",
          "Take the register on your phone during the session.",
        ],
        // One facilitator, and a programme with no lead to sign it.
        absent: ["You’re facilitating with", "lead, NAISI"],
      });
      const groupPage = `${origin}${groupPagePath(group)}`;
      assert.ok(
        email.links.includes(groupPage),
        `the facilitators' email does not link to the group's page (${groupPage}): ${JSON.stringify(email.links)}`,
      );
    }

    /** Neither half of an email names the meeting link, nor its host. */
    function assertNoMeetingLink(email, who) {
      for (const [part, body] of [
        ["HTML", email.html],
        ["text", email.text],
      ]) {
        assert.ok(
          !body.includes(groupA.meetingUrl) && !body.includes(new URL(groupA.meetingUrl).host),
          `${who}'s ${part} part carries the meeting link. A link to join lives on the site only.`,
        );
      }
    }

    /** Every send log row to one address, by kind. */
    const sendKindsTo = async (address) =>
      (await fixtureQuery("emailSends").where("to", "==", address).get()).docs
        .map((doc) => String(doc.data()?.kind ?? ""))
        .sort();

    try {
      await step("the admin approves the two waiting accounts the journey signs in as", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        // The person who is placed and then moved, and the facilitator: both
        // sign in, and a facilitator has to be an approved account before a
        // group can be given one. The other two never sign in, so they wait.
        for (const account of [ben, fern]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          const approved = await waitFor(`${account.first}'s account to say member`, async () => {
            const doc = await readUserDoc(account.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${account.first}'s approval left no approvedAt stamp`);
        }
        for (const account of [ada, cleo]) {
          const doc = await readUserDoc(account.uid);
          assert.equal(doc?.role, "pending", `${account.first} was approved, and nothing on this journey approves them`);
        }
      });

      await step("the admin names the course run on the programme's Settings tab", async () => {
        activePage = adminPage;
        await adminPage.goto(setupUrl, { waitUntil: "domcontentloaded" });
        const panel = runPanel();
        await panel.waitFor({ timeout: WAIT_MS });
        const runBox = panel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        // The run is a draft, and a draft can be named: the hand-over is what
        // waits for it to move on.
        const [response] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${state.runLabel} · Draft` }),
        ]);
        const body = await okBody(response, "Naming the run");
        assert.equal(body.changed, true, "naming the run changed nothing");
        assert.equal(body.panel?.runId, state.runId, "the panel names another run");

        // Waited for rather than read at once: the panel is redrawn from the
        // answer a moment after it lands.
        await panel
          .getByText(
            `People who hold a place on ${state.programmeName} are handed over to this run. ` +
              "Its own apply page takes no applications.",
            { exact: true },
          )
          .waitFor({ timeout: WAIT_MS });
        await panel
          .getByText("That run is still a draft. Move it on from draft first: its members cannot open a draft run.", {
            exact: true,
          })
          .waitFor({ timeout: WAIT_MS });
        const press = panel.getByRole("button", { name: `Hand over ${state.people.length} people` });
        await press.waitFor({ timeout: WAIT_MS });
        assert.equal(await press.isDisabled(), true, "Hand over can be pressed while the run is a draft");

        const form = (await fixtureDoc("admissionRounds", state.formId).get()).data();
        assert.equal(form?.programmes?.[state.programmeId]?.runId, state.runId, "the form does not name the run");
      });

      await step("the run editor moves the run on from draft", async () => {
        activePage = adminPage;
        await adminPage.goto(runEditorUrl, { waitUntil: "domcontentloaded" });
        const statusBox = adminPage.getByRole("combobox", { name: "Run status", exact: true });
        await statusBox.waitFor({ timeout: WAIT_MS });
        await readToast(adminPage, /Status set to Applications open/, async () => {
          const [response] = await Promise.all([
            responseTo(adminPage, "/status", "POST"),
            statusBox.selectOption({ label: "Applications open" }),
          ]);
          return okBody(response, "Moving the run on from draft");
        });
        const run = (await fixtureDoc("courseRuns", state.runId).get()).data();
        assert.equal(run?.status, "applications-open", "the run is still not open");
      });

      await step(
        "Hand over puts each person holding a place on the run's list, and a second press writes nothing new",
        async () => {
          activePage = adminPage;
          await adminPage.goto(setupUrl, { waitUntil: "domcontentloaded" });
          const panel = runPanel();
          const holding = state.people.length;
          await panel
            .getByText(
              `${holding} people hold a place on ${state.programmeName}. None of them is on the run’s list yet.`,
              { exact: true },
            )
            .waitFor({ timeout: WAIT_MS });
          for (const person of state.people) {
            await panel.getByRole("link", { name: person.displayName, exact: true }).waitFor({ timeout: WAIT_MS });
          }

          const handOver = async (label) => {
            const [response] = await Promise.all([
              responseTo(adminPage, "/run/hand-over", "POST"),
              panel.getByRole("button", { name: label, exact: true }).click(),
            ]);
            return okBody(response, label);
          };
          const first = await handOver(`Hand over ${holding} people`);
          assert.deepEqual(first.receipt, { handedOver: holding, alreadyThere: 0 }, "the first press's receipt");
          await panel.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({
            timeout: WAIT_MS,
          });
          await panel
            .getByText(`${holding} people hold a place on ${state.programmeName}, and all of them are on the run’s list.`, {
              exact: true,
            })
            .waitFor({ timeout: WAIT_MS });
          // Handed over, the run can no longer be changed here.
          assert.equal(await panel.getByLabel("Run", { exact: true }).isDisabled(), true, "the run box is still live");

          const again = await handOver("Hand over anybody new");
          assert.deepEqual(again.receipt, { handedOver: 0, alreadyThere: holding }, "the second press's receipt");
          await panel
            .getByRole("status")
            .filter({
              hasText: "Nobody new to hand over. Everybody who holds a place already has a row on the run’s list.",
            })
            .waitFor({ timeout: WAIT_MS });

          // What the two presses wrote between them: one row each, one log line, one count.
          const rows = await fixtureQuery("courseApplications").where("runId", "==", state.runId).get();
          assert.equal(rows.size, holding, `the run's list has ${rows.size} rows`);
          for (const doc of rows.docs) {
            const row = doc.data();
            assert.equal(row.status, "accepted", `a row on the list says ${row.status}`);
            assert.deepEqual(
              row.fromForm,
              { roundId: state.formId, programmeId: state.programmeId },
              "a row does not say where its place came from",
            );
          }
          const audit = await fixtureQuery("courseAudit").where("runId", "==", state.runId).get();
          const handOvers = audit.docs.filter((doc) => doc.data().kind === "run-hand-over");
          assert.equal(handOvers.length, 1, `the two presses wrote ${handOvers.length} log lines`);
          assert.match(
            String(handOvers[0].data().detail ?? ""),
            new RegExp(`handed over ${holding} people who hold a place on ${escapeRegExp(state.programmeName)}`),
          );
          const run = (await fixtureDoc("courseRuns", state.runId).get()).data();
          assert.equal(run?.applicationCounts?.accepted, holding, "the run's count of places moved twice");
        },
      );

      await step("the Times view counts who can make each group from the weeks they painted", async () => {
        activePage = adminPage;
        await adminPage.goto(timesUrl, { waitUntil: "domcontentloaded" });
        const holding = state.people.length;
        await adminPage
          .getByText(
            `${holding} of the ${holding} people holding a place have said when they’re free. ` +
              `Sessions last ${groupA.durationMinutes} minutes.`,
            { exact: true },
          )
          .waitFor({ timeout: WAIT_MS });
        // The innermost section holding the heading: the card, not a wrapper round it.
        const yours = adminPage
          .locator("section")
          .filter({ has: adminPage.getByRole("heading", { name: `Your ${state.groups.length} groups`, exact: true }) })
          .last();
        await yours.waitFor({ timeout: WAIT_MS });
        for (const group of state.groups) {
          const canMake = state.people.filter((person) => person.canMake.includes(group.key)).length;
          const line = flat(await yours.getByRole("listitem").filter({ hasText: group.name }).innerText());
          assert.match(
            line,
            new RegExp(`${escapeRegExp(whenShort(group))} · ${canMake} can make it`),
            `the Times view says ${JSON.stringify(line)} for ${group.name}`,
          );
        }
        await yours
          .getByText(`${holding} of ${holding} can make at least one of these times.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
      });

      await step("the allocation board places each person with the Move to menu", async () => {
        activePage = adminPage;
        await openBoard();
        for (const person of state.people) {
          await column("Unallocated").getByRole("combobox", { name: `Move ${person.first} to another group` }).waitFor({
            timeout: WAIT_MS,
          });
        }
        for (const person of state.people) await moveWithMenu(person, firstGroupOf[person.key]);

        await adminPage
          .getByText(`All ${state.people.length} accepted applicants are placed. No one is in two groups.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        await publishTitleSays(`${state.people.length} people`);
        await publishArea()
          .getByText("Send yourself a test before you publish.", { exact: true })
          .waitFor({ timeout: WAIT_MS });
        const publish = publishArea().getByRole("button", { name: `Publish and send ${state.people.length} emails` });
        assert.equal(await publish.isDisabled(), true, "Publish can be pressed before any test was sent");

        // The places, read back: one learner row each, in the group the board shows.
        for (const person of state.people) {
          const enrolment = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).get()).data();
          assert.equal(enrolment?.groupId, firstGroupOf[person.key].id, `${person.first} is not where the board put them`);
          assert.equal(enrolment?.status, "active", `${person.first}'s place is not active`);
          assert.equal(enrolment?.role, "learner", `${person.first}'s row on the run is not a learner's`);
        }
        for (const group of state.groups) {
          const placed = state.people.filter((person) => firstGroupOf[person.key] === group).length;
          const stored = (await fixtureDoc("courseGroups", group.id).get()).data();
          assert.equal(stored?.memberCount, placed, `${group.name}'s count is ${stored?.memberCount}`);
        }
      });

      await step("the admin appoints a facilitator on the Groups tab's Facilitators view", async () => {
        activePage = adminPage;
        await adminPage.goto(facilitatorsUrl, { waitUntil: "domcontentloaded" });
        const card = adminPage.locator('section[aria-labelledby="facilitators-title"]');
        await card.getByText(`0 facilitators for ${state.groups.length} groups`, { exact: true }).waitFor({
          timeout: WAIT_MS,
        });
        await card.getByRole("button", { name: `Change ${groupA.name}’s facilitators`, exact: true }).click();
        // Every approved account on the project is offered, so the search
        // narrows to the one this run made.
        await card.getByPlaceholder("Search people…").fill(fern.displayName);
        await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(fern.displayName)) }).check();
        const [response] = await Promise.all([
          responseTo(adminPage, `/groups/${groupA.id}/facilitators`, "POST"),
          card.getByRole("button", { name: "Save", exact: true }).click(),
        ]);
        const body = await okBody(response, "Saving the facilitators");
        assert.deepEqual(body.facilitatorUids, [fern.uid], "the group's facilitators are not the one ticked");
        await card
          .getByText(`${groupA.name}’s facilitators are saved. Nobody was emailed.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        await card.getByText(`1 facilitator for ${state.groups.length} groups`, { exact: true }).waitFor({
          timeout: WAIT_MS,
        });

        const group = (await fixtureDoc("courseGroups", groupA.id).get()).data();
        assert.deepEqual(group?.facilitatorUids, [fern.uid], "the group does not name its facilitator");
        const enrolment = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, fern.uid)).get()).data();
        assert.equal(enrolment?.status, "active", "the facilitator has no live row on the run");
        assert.equal(enrolment?.groupId ?? null, null, "a facilitator's row holds a learner's place");
        // Nobody was emailed, as the page says.
        assert.deepEqual(await sendKindsTo(fern.email), ["application"], "appointing a facilitator emailed them");
      });

      await step("Send a test to me emails the admin the first email of each kind, marked as a test", async () => {
        activePage = adminPage;
        await openBoard();
        const emails = state.people.length + 1;
        await publishTitleSays(`${state.people.length} people and 1 facilitator`);
        assert.deepEqual(await adminTests(), [], "a test of this run's emails was already in the admin's mailbox");

        const [response] = await Promise.all([
          responseTo(adminPage, "/allocation/publish/test", "POST"),
          publishArea().getByRole("button", { name: "Send a test to me", exact: true }).click(),
        ]);
        const body = await okBody(response, "Send a test to me");
        assert.deepEqual(
          { delivery: body.delivery, emails: body.emails, recorded: body.recorded },
          { delivery: "sent", emails: 2, recorded: true },
          "the test was not one of each email, sent and recorded",
        );
        await publishArea()
          .getByText(/^Test sent to you at \d{1,2}(:\d{2})?(am|pm)\.$/)
          .waitFor({ timeout: WAIT_MS });
        const publish = publishArea().getByRole("button", { name: `Publish and send ${emails} emails`, exact: true });
        await waitFor("Publish to unlock once a test has reached the admin", async () =>
          (await publish.isEnabled()) ? true : null,
        );

        const tests = await waitFor("both tests in the admin's mailbox", async () => {
          const found = await adminTests();
          return found.length >= 2 ? found : null;
        });
        assert.equal(tests.length, 2, `the test sent ${tests.length} emails`);
        const placementTest = tests.find((email) => email.subject.startsWith("[TEST] Your "));
        const facilitatingTest = tests.find((email) => email.subject.startsWith("[TEST] You’re facilitating "));
        assert.ok(placementTest && facilitatingTest, `the two tests are not one of each kind: ${tests.map((e) => e.subject)}`);
        // The first person a press would write to. Whoever that is, the test
        // is their real email, so it is held to their group.
        const shown = state.people.find((person) => placementTest.words.includes(`You've been placed, ${person.first}`));
        assert.ok(shown, `the test of the placement email greets nobody placed: ${placementTest.words}`);
        const shownGroup = firstGroupOf[shown.key];
        assertPlacement(placementTest, {
          person: shown,
          group: shownGroup,
          facilitator: shownGroup === groupA ? fern : null,
          test: true,
        });
        assertFacilitating(facilitatingTest, { group: groupA, size: 2, test: true });
        for (const email of tests) assertNoMeetingLink(email, "A test email");

        const record = (await fixtureDoc("courseNudges", `publishtest__${state.runId}`).get()).data();
        assert.equal(record?.kind, "allocation-test", "the test was not recorded against the run");
      });

      await step("Publish with the count on its button emails each person placed and the facilitator once", async () => {
        activePage = adminPage;
        const emails = state.people.length + 1;
        const { confirm, answer } = await pressPublish(`Publish and send ${emails} emails`);
        assert.equal(
          confirm,
          `Publish ${state.runLabel} and send ${emails} emails?\n\n` +
            `${state.people.length} emails to people placed in a group, with their group, day, room and facilitators. ` +
            "1 email to a facilitator, with their group, day and room.\n\n" +
            "Emails cannot be unsent.",
          "the confirmation is not the one the boards draw",
        );
        assert.deepEqual(
          answer.report,
          {
            people: { sent: state.people.length, held: 0, suppressed: 0 },
            facilitators: { sent: 1, held: 0, suppressed: 0 },
            failed: [],
            noAddress: [],
            alreadyTold: 0,
            more: 0,
          },
          "the press did not send exactly what its button said",
        );
        await publishArea()
          .getByText(
            `Published. ${emails} emails sent: ${state.people.length} to people with their group and 1 to facilitators.`,
            { exact: true },
          )
          .waitFor({ timeout: WAIT_MS });
        // Everybody is told, so a press now would send nothing, and says so.
        await publishArea().getByRole("button", { name: "Publish", exact: true }).waitFor({ timeout: WAIT_MS });

        for (const person of state.people) {
          // Ben was approved first, so his placement is his second email.
          const approvals = person.key === ben.key ? 1 : 0;
          const mail = await mailTo(person.email, approvals + 1);
          assert.equal(mail.length, approvals + 1, `${person.first} has ${mail.length} emails`);
          const email = await readEmail(mail[mail.length - 1]);
          const group = firstGroupOf[person.key];
          assertPlacement(email, { person, group, facilitator: group === groupA ? fern : null });
          assertNoMeetingLink(email, `${person.first}'s placement email`);
          const enrolment = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).get()).data();
          assert.ok(enrolment?.allocatedEmailAt, `${person.first} is not stamped as told`);
          assert.equal(enrolment?.allocatedEmailDelivery, "sent", `${person.first}'s email was not handed over`);
        }
        // Her approval, then the facilitators' email.
        const fernsMail = await mailTo(fern.email, 2);
        assert.equal(fernsMail.length, 2, `Fern has ${fernsMail.length} emails`);
        const facilitating = await readEmail(fernsMail[fernsMail.length - 1]);
        assertFacilitating(facilitating, { group: groupA, size: 2 });
        assertNoMeetingLink(facilitating, "The facilitators' email");

        const run = (await fixtureDoc("courseRuns", state.runId).get()).data();
        assert.ok(run?.allocationPublishedAt, "the run does not say it was published");
        const markers = (await fixtureQuery("courseNudges").where("runId", "==", state.runId).get()).docs
          .map((doc) => doc.data())
          .filter((marker) => marker.kind === "group-facilitating");
        assert.deepEqual(
          markers.map((marker) => [marker.uid, marker.groupId, marker.state]),
          [[fern.uid, groupA.id, "sent"]],
          "the facilitator is not marked told about their group, once",
        );
        const cohort = await fixtureQuery("subscriptions").where("channel", "==", state.channel).get();
        assert.equal(cohort.size, state.people.length, "not everybody placed joined the run's cohort list");
      });

      await step("a person placed sees their group and its first session on their programme page", async () => {
        activePage = memberPage;
        await signIn(memberPage, ben);
        await memberPage.goto(`${origin}${programmePath}`, { waitUntil: "domcontentloaded" });
        const card = memberPage.getByTestId("session-card");
        await card.waitFor({ timeout: WAIT_MS });
        const said = flat(await card.innerText());
        for (const expected of [
          "Your first session",
          `${groupA.name} with ${fern.first}`,
          sessionWhenLabel(groupA, groupA.firstDateKey),
          groupA.room,
        ]) {
          assert.ok(said.includes(expected), `Ben's session card does not say ${JSON.stringify(expected)}: ${said}`);
        }
        // The way to join is here, on the site, for the group's own people.
        const join = card.getByRole("link", { name: "Join online", exact: true });
        await join.waitFor({ timeout: WAIT_MS });
        assert.equal(await join.getAttribute("href"), groupA.meetingUrl, "the card's way to join is not the group's");
        assert.ok(
          said.includes("The link is here, not in your emails, so it can’t be forwarded."),
          `the card does not say the link is on the site only: ${said}`,
        );
      });

      await step("a person moved after Publish sees nothing of the run until Publish is pressed again", async () => {
        activePage = adminPage;
        await openBoard();
        await moveWithMenu(ben, groupB);
        await publishTitleSays("1 person");
        await publishArea()
          .getByRole("button", { name: "Publish and send 1 email", exact: true })
          .waitFor({ timeout: WAIT_MS });
        const moved = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, ben.uid)).get()).data();
        assert.equal(moved?.groupId, groupB.id, "Ben's place did not move");
        assert.equal(moved?.allocatedEmailAt ?? null, null, "Ben is still stamped as told about a group he left");

        activePage = memberPage;
        // Caught here and thrown below, so a page that never asks cannot
        // leave a rejection with nobody waiting on it.
        const hub = memberPage
          .waitForResponse(
            (r) => new URL(r.url()).pathname === "/api/courses/me" && r.request().method() === "GET",
            { timeout: WAIT_MS },
          )
          .catch((err) => err);
        await memberPage.goto(`${origin}${programmePath}`, { waitUntil: "domcontentloaded" });
        await memberPage.waitForURL((url) => url.pathname === "/learn", { timeout: WAIT_MS });
        const listed = await hub;
        if (listed instanceof Error) throw listed;
        const runs = await okBody(listed, "The member's runs");
        assert.ok(
          !JSON.stringify(runs).includes(state.runId),
          "the member's list of runs still has the run, before Publish has told him his new group",
        );
        await memberPage.getByRole("heading", { name: "Your courses", level: 1 }).waitFor({ timeout: WAIT_MS });
        const page = flat(await memberPage.locator("main").innerText());
        for (const group of state.groups) {
          assert.ok(!page.includes(group.name), `the courses page names ${group.name}: ${page}`);
        }
        assert.equal(
          await memberPage.locator(`a[href="${programmePath}"]`).count(),
          0,
          "the courses page links to the run",
        );
      });

      await step("Publish again emails only the person moved, who then sees their new group", async () => {
        activePage = adminPage;
        const { confirm, answer } = await pressPublish("Publish and send 1 email");
        assert.equal(
          confirm,
          `Publish ${state.runLabel} and send 1 email?\n\n` +
            "1 email to the person placed in a group, with their group, day, room and facilitators.\n\n" +
            "Only people and facilitators not told before are emailed. Emails cannot be unsent.",
          "the second confirmation is not the one the boards draw",
        );
        assert.deepEqual(
          answer.report,
          {
            people: { sent: 1, held: 0, suppressed: 0 },
            facilitators: { sent: 0, held: 0, suppressed: 0 },
            failed: [],
            noAddress: [],
            alreadyTold: 0,
            more: 0,
          },
          "the second press did not email Ben alone",
        );
        await publishArea()
          .getByText("Published. 1 email sent: 1 to people with their group.", { exact: true })
          .waitFor({ timeout: WAIT_MS });

        // Approval, Group A, then Group B: the newest is about the group he is in now.
        const bensMail = await mailTo(ben.email, 3);
        assert.equal(bensMail.length, 3, `Ben has ${bensMail.length} emails`);
        const newest = await readEmail(bensMail[2]);
        assertPlacement(newest, { person: ben, group: groupB, facilitator: null });
        assertNoMeetingLink(newest, "Ben's second placement email");
        // Nobody else was written to again.
        for (const [account, count] of [
          [ada, 1],
          [cleo, 1],
          [fern, 2],
        ]) {
          const mail = await messagesTo(account.email);
          assert.equal(mail.length, count, `${account.first} has ${mail.length} emails, not ${count}`);
        }
        assert.equal((await adminTests()).length, 2, "the second press sent the admin another test");

        activePage = memberPage;
        await memberPage.goto(`${origin}${programmePath}`, { waitUntil: "domcontentloaded" });
        const card = memberPage.getByTestId("session-card");
        await card.waitFor({ timeout: WAIT_MS });
        const said = flat(await card.innerText());
        for (const expected of [
          "Your first session",
          groupB.name,
          sessionWhenLabel(groupB, groupB.firstDateKey),
          groupB.room,
        ]) {
          assert.ok(said.includes(expected), `Ben's card after the move does not say ${JSON.stringify(expected)}: ${said}`);
        }
        assert.ok(!said.includes(groupA.name), `Ben's card still names the group he left: ${said}`);
        assert.equal(await card.getByRole("link", { name: "Join online" }).count(), 0, "Group B has no link to join");
      });

      await step("the facilitator sees their group, its roster and its register", async () => {
        activePage = facilitatorPage;
        await signIn(facilitatorPage, fern);
        await facilitatorPage.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
        await facilitatorPage.getByRole("heading", { name: groupA.name, level: 1 }).waitFor({ timeout: WAIT_MS });

        const roster = facilitatorPage.getByTestId("group-roster");
        await roster.waitFor({ timeout: WAIT_MS });
        const facilitators = roster.getByRole("list", { name: "Facilitators of this group" });
        await facilitators.getByRole("listitem").filter({ hasText: fern.first }).waitFor({ timeout: WAIT_MS });
        const members = roster.getByRole("list", { name: "Members of this group" });
        await members.waitFor({ timeout: WAIT_MS });
        // Ada stayed in Group A; Ben moved to Group B. Each row carries its
        // person's initials beside the name, so the rows are matched by name.
        const inGroup = state.people.filter((person) => person.key !== ben.key && firstGroupOf[person.key] === groupA);
        assert.equal(
          await members.getByRole("listitem").count(),
          inGroup.length,
          "the roster is not the people in the group now",
        );
        for (const person of inGroup) {
          await members.getByRole("listitem").filter({ hasText: person.first }).waitFor({ timeout: WAIT_MS });
        }

        const grid = facilitatorPage.getByTestId("attendance-grid");
        await grid.waitFor({ timeout: WAIT_MS });
        const caption = flat(await grid.locator("caption").innerText());
        assert.match(caption, new RegExp(`Attendance for ${escapeRegExp(groupA.name)}`), `the register's caption: ${caption}`);
        assert.match(caption, new RegExp(`${inGroup.length} members?, 1 session so far`), `the register's caption: ${caption}`);
        assert.equal(await facilitatorPage.getByTestId("attendance-session").count(), 1, "the register has more than week 1");
        assert.match(flat(await facilitatorPage.getByTestId("attendance-session").first().innerText()), /Week 1/);
        assert.equal(await grid.locator("tbody tr").count(), inGroup.length, "the register's rows are not the group");
        assert.match(flat(await grid.locator("tbody tr").first().innerText()), new RegExp(escapeRegExp(inGroup[0].first)));

        // The session, with the way to join that no email carries.
        const card = facilitatorPage.getByTestId("session-card");
        await card.waitFor({ timeout: WAIT_MS });
        assert.ok(flat(await card.innerText()).includes(groupA.room), "the facilitator's session card has no room");
        const join = card.getByRole("link", { name: "Join online", exact: true });
        await join.waitFor({ timeout: WAIT_MS });
        assert.equal(await join.getAttribute("href"), groupA.meetingUrl, "the facilitator's way to join is not the group's");
      });

      await step("every email went to the send log, and none carries the meeting link", async () => {
        activePage = adminPage;
        // Who was written to, by kind: the two approvals, each placement, the
        // facilitators' email, and Ben's second placement.
        const expected = [
          [ada, ["course-application"]],
          [ben, ["application", "course-application", "course-application"]],
          [cleo, ["course-application"]],
          [fern, ["application", "course-application"]],
        ];
        for (const [account, kinds] of expected) {
          const logged = await waitFor(`${account.first}'s send rows`, async () => {
            const rows = await sendKindsTo(account.email);
            return rows.length >= kinds.length ? rows : null;
          });
          assert.deepEqual(logged, [...kinds].sort(), `${account.first}'s send rows`);
        }
        // About the run, whoever it went to: the two tests and the five emails Publish sent.
        const about = (await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get()).docs.map(
          (doc) => doc.data(),
        );
        assert.equal(about.filter((row) => row.kind === "course-test").length, 2, "the run's tests are not both logged");
        assert.equal(
          about.filter((row) => row.kind === "course-application").length,
          state.people.length + 2,
          "Publish's emails are not all logged against the run",
        );

        // And not one message this journey caused names the meeting link.
        const everything = [...(await adminTests())];
        for (const account of [...state.people, fern]) {
          for (const summary of await messagesTo(account.email)) everything.push(await readEmail(summary));
        }
        assert.equal(everything.length, 2 + 1 + 3 + 1 + 2, `the journey caused ${everything.length} emails`);
        for (const email of everything) assertNoMeetingLink(email, JSON.stringify(email.subject));
      });
    } finally {
      await Promise.allSettled([facilitatorContext.close(), memberContext.close(), context.close()]);
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
