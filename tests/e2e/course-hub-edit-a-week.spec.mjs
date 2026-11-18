/**
 * END-TO-END: one block of a live week changed where it stands, on the
 * programme's Weeks page, by the people who use it and read as the people it
 * reaches.
 *
 * The term at its coursework point (`scripts/e2e-fixtures/course-hub-edit-a-week.mjs`):
 * three weeks into a running run, weeks 1 to 3 written as blocks and
 * published; Ada (Group A) has ticked week 3's first reading and written in
 * it, and Cleo (Group B) has written a reflection in it; Gus waits for
 * approval like every fixture account. Then:
 *
 *  - the admin approves Fern, Gus and Ada, makes Gus SU-recognised committee
 *    on Gus's member page, names the running run and Gus as the programme's
 *    lead on its Settings tab, and appoints Fern to Group A: every grant on
 *    the real pages, none by the fixture;
 *  - GUS, the programme's lead, opens week 3 on the Weeks page: the week as it
 *    reads, live, with the count beside each block; opens the first reading
 *    in its side panel (the week is then his alone), fixes its title and
 *    saves it for every group; the week's history and the stored block keep
 *    the reading's id, and the lock is given back; the tell dialog opens and
 *    Gus tells nobody;
 *  - ADA, who ticked that reading, still reads it ticked, under its new title;
 *  - Gus gives the same reading a new address (the page says it keeps Ada's
 *    tick and sends it as the same reading), and in the tell dialog "Send me
 *    a test first" emails Gus alone;
 *  - Gus tells the people who have started week 3: the count on the button is
 *    the count the route sent, each of them gets one email with no meeting
 *    link, and Gus gets none;
 *  - THE ADMIN, a second editor, opens week 3 while Gus has a panel open: the
 *    notice names Gus and since when, the week reads, and every Change and the
 *    paste are off; once Gus cancels, they open again;
 *  - Gus's History lists every save newest first, compares the first with
 *    now and restores it as a new save; Ada's tick is still there, under the
 *    title it had;
 *  - FERN, a facilitator, and Ada, a member, are refused the week's page, its
 *    history and the editing routes;
 *  - Gus rewords the reflection prompt Ada answered, telling nobody: Ada's
 *    week page says "You answered an earlier wording:" with the words she
 *    answered under her own, and Fern's reflections with names (the page of
 *    one question across the group, at the week's first reflection) say "The
 *    question when this was written:" with the same words under Ada's.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-edit-a-week
 *
 * It declares `requiresCaughtMail`: the test goes to Gus and the notice to the
 * people who have started the week, and the spec reads each out of Mailpit.
 * Every address it emails is one the harness made.
 *
 * ## The words it holds the pages to
 *
 * Restated from src/lib/courses/weekEdit/pageWords.ts and words.ts, with
 * their apostrophes. A change to one of them changes this file in the same
 * pull request.
 *
 * ## CHROMIUM ONLY
 *
 * A green run is a regression net, never a substitute for the manual Safari
 * pass.
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
  fixtureSubcollection,
  fixtureWeekSubcollection,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { EDIT_WEEK, RECAPTCHA_DEPENDENT_STEPS, SPEC, startedKeys } from "../../scripts/e2e-fixtures/course-hub-edit-a-week.mjs";
import { COURSEWORK, COURSEWORK_PROMPTS, COURSEWORK_SOURCES, courseworkItemId } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;

/** How often a poll asks again. */
const POLL_MS = 500;

const { weekNumber: WEEK, weekId: WEEK_ID } = EDIT_WEEK;

/** The reading the journey changes: week 3's first, in its second part, the one Ada ticked. */
const READING = Object.freeze({
  id: courseworkItemId(WEEK, "s1"),
  title: COURSEWORK_SOURCES.s1,
  newTitle: `${COURSEWORK_SOURCES.s1}, kept 1898 to 1911`,
  url: `https://example.com/e2e-diary-${WEEK}`,
  newUrl: `https://example.com/e2e-diary-${WEEK}-moved`,
  place: "Part 2’s source",
  partNumber: 2,
  by: "E2E Example",
});

/** The reflection the lead opens while the second admin looks: week 3's first, by its first prompt. */
const REFLECTION = Object.freeze({
  id: courseworkItemId(WEEK, "rs1"),
  place: "Part 1’s reflection",
  label: COURSEWORK_PROMPTS.rp1,
  newPrompt: "How many lighthouses on this coast still show a light at night?",
});

/** The words the pages say, restated from src/lib/courses/weekEdit/pageWords.ts and words.ts. */
const WORDS = {
  committee: "Committee",
  recognisedSwitch: "SU-recognised committee",
  chooseLead: "Choose a lead",
  blocksTitle: `Week ${WEEK}, as it reads`,
  live: "Live",
  editingLine: `Only you are editing week ${WEEK}.`,
  change: (place, label) => `Change ${place}: ${label}`,
  panelTitle: `Source · Part ${READING.partNumber}`,
  titleLabel: "Title",
  linkLabel: "Link",
  save: "Save for every group",
  cancel: "Cancel",
  ticksLine: (n) => `${n === 1 ? "1 person has" : `${n} people have`} ticked it. Fixing a title, link or detail keeps every tick.`,
  sameReading: (n) => `This is the same reading at a new address: it keeps ${n === 1 ? "its 1 tick" : `all ${n} ticks`}.`,
  differentReading: "To put a different reading here, paste the week.",
  scopeTitle: (programme, groups) => `Every group on ${programme} (${groups})`,
  liveLine: `Week ${WEEK} is live: people see the change straight away. You can tell them after saving.`,
  saved: (summary) => `Saved: ${summary}.`,
  titleSummary: `Part ${READING.partNumber}: new title for ${READING.by}’s reading`,
  linkSummary: `Part ${READING.partNumber}: new link for ${READING.by}’s reading`,
  tellTitle: "Saved. Tell people about it?",
  nobody: "Don’t tell anyone",
  test: "Send me a test first",
  started: (n) => `The people who’ve started week ${WEEK} (${n})`,
  sendTo: (n) => `Send to ${n === 1 ? "1 person" : `${n} people`}`,
  emailed: (n) => `Emailed ${n === 1 ? "1 person" : `${n} people`}.`,
  linkSubject: `A new link for a week ${WEEK} reading`,
  testSubject: `[TEST] A new link for a week ${WEEK} reading`,
  linkLine: `The link to ${READING.by}’s “${READING.newTitle}”, in week ${WEEK}’s part ${READING.partNumber}, has changed. Your ticks are as they were.`,
  heldTitle: (name) => `${name} is editing week ${WEEK}`,
  heldLine: (name) => `You can read it; editing opens when ${name} saves or leaves.`,
  history: "History",
  firstFound: "The week before its first change here",
  compareWithNow: "Comparing",
  restore: (day) => `Restore the ${day} version`,
  restoredSummary: "Restored the version from",
  doneItem: (title) => `Done: ${title}`,
  firstPrompt: "Prompt 1",
  ownEarlier: "You answered an earlier wording:",
  staffEarlier: "The question when this was written:",
};

let skipReasonFor = () => null;

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

const state = readState(SPEC.name, RUN_STATE_DIR);
const playwright = await loadPlaywright();

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an " +
        "admin's, and this harness cannot create an admin."
      : state.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, the lead's test and the notice to the people who have " +
          "started the week, so it runs only against the server the harness starts with its mail caught by Mailpit."
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

/** What an element says, as written: every text node in it, a space between each. */
const wordsIn = async (locator) =>
  flat(
    await locator.evaluate((element) => {
      const out = [];
      const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node.nodeValue ?? "");
      return out.join(" ");
    }),
  );

/** The named characters an email's HTML spells out. */
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·" };

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

/** An email's words, its links and its two halves. */
async function readEmail(summary) {
  const message = await getMessage(summary.ID);
  return {
    subject: message.Subject ?? summary.Subject ?? "",
    words: wordsOf(message.HTML),
    text: message.Text ?? "",
    html: message.HTML ?? "",
    links: hrefUrls(message.HTML ?? ""),
  };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: one block of a live week changed where it stands, its notice, one editor at a time, its history, and who is refused",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const fern = state.facilitator;
    const gus = state.lead;
    const ada = state.people.find((person) => person.key === "ada");
    const groupA = state.groups.find((group) => group.key === "A");
    for (const [key, value] of Object.entries({ fern, gus, ada, groupA })) assert.ok(value, `the term has no ${key}`);
    assert.ok(groupA.meetingUrl, "Group A has no meeting link, so 'never in an email' would have no teeth");
    const started = startedKeys().map((key) => state.people.find((person) => person.key === key));
    assert.ok(started.length >= 2 && started.every(Boolean) && started.some((person) => person.key === "ada"), "the term's plan has nobody else on week 3");
    const notStarted = state.people.filter((person) => !started.includes(person));

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const weekUrl = `${formBase}/weeks/${WEEK_ID}`;
    const historyUrl = `${weekUrl}/history`;
    const memberWeekUrl = `${origin}/learn/${enc(state.runId)}/weeks/${WEEK}`;
    const api = `/api/courses/runs/${enc(state.runId)}/weeks/${WEEK_ID}`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: leadContext, page: leadPage } = await newIdentityPage(browser);
    const { context: memberContext, page: memberPage } = await newIdentityPage(browser);
    const { context: facilitatorContext, page: facilitatorPage } = await newIdentityPage(browser);

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
    for (const pg of [leadPage, memberPage, facilitatorPage]) await stubRecaptchaOnLoopback(pg, origin);
    if (!recaptchaStubbed) {
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);
    }

    const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });

    /** The answer to the next request whose path ends `suffix`, by `method`. */
    const responseTo = (pg, suffix, method) =>
      pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });

    /** A JSON answer that must be a success, read once. */
    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    /** Week 3 as stored, and the reading in it. */
    async function storedWeek() {
      const snap = await fixtureSubcollection("courseRuns", state.runId, "weeks").doc(WEEK_ID).get();
      return snap.data() ?? null;
    }
    function readingIn(week) {
      for (const block of week?.blocks ?? []) {
        if (block.id === READING.id) return block;
        for (const child of block.blocks ?? []) if (child.id === READING.id) return child;
      }
      return null;
    }
    /** Week 3's history, oldest first. */
    async function storedSaves() {
      const snap = await fixtureWeekSubcollection(state.runId, WEEK_ID, "history").get();
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.seq - b.seq);
    }
    /** Week 3's lock, as stored, or null. */
    async function storedLock() {
      const snap = await fixtureWeekSubcollection(state.runId, WEEK_ID, "editLock").doc("current").get();
      return snap.exists ? snap.data() : null;
    }

    /** One block's card on the week's page. */
    const card = (pg, blockId) => pg.locator(`li#edit-${blockId}`);
    /** A Change button, once the page's script has made it pressable. */
    async function changeReady(pg, place, label) {
      const button = pg.getByRole("button", { name: WORDS.change(place, label), exact: true });
      await button.waitFor({ timeout: WAIT_MS });
      await waitFor(`${place}'s Change to be pressable`, async () => button.isEnabled());
      return button;
    }
    /** The side panel, open. */
    const panel = (pg) => pg.getByRole("dialog");

    /** Ada's week 3 page, and her tick on the reading by the title it has now. */
    async function adasTick(title) {
      activePage = memberPage;
      await memberPage.goto(memberWeekUrl, { waitUntil: "domcontentloaded" });
      const tick = memberPage.getByRole("checkbox", { name: WORDS.doneItem(title), exact: true });
      await tick.waitFor({ state: "attached", timeout: WAIT_MS });
      return tick;
    }

    /** Messages to `address` with `subject`, read. */
    async function mailTo(address, subject) {
      const read = [];
      for (const summary of await messagesTo(address)) {
        const email = await readEmail(summary);
        if (email.subject === subject) read.push(email);
      }
      return read;
    }

    try {
      await step("the admin approves the facilitator, the account that will lead the programme and the member who ticked week 3's reading", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [fern, gus, ada]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          const approved = await waitFor(`${account.first}'s account to say member`, async () => {
            const doc = await readUserDoc(account.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${account.first}'s approval left no approvedAt stamp`);
        }
      });

      await step("the admin makes that account SU-recognised committee on its member page", async () => {
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

      await step("the admin names the running course run and the programme's lead on the Settings tab", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
        const runPanel = adminPage.getByRole("region", { name: "Course run" });
        await runPanel.waitFor({ timeout: WAIT_MS });
        const runBox = runPanel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [runResponse] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${state.runLabel} · Running` }),
        ]);
        const run = await okBody(runResponse, "Naming the run");
        assert.equal(run.panel?.runId, state.runId, "the panel names another run");

        await adminPage.getByRole("button", { name: WORDS.chooseLead, exact: true }).click();
        const menu = adminPage.getByRole("menu", { name: WORDS.chooseLead });
        const [rolesResponse] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/roles`, "PUT"),
          menu.getByRole("menuitem", { name: new RegExp(escapeRegExp(gus.displayName)) }).click(),
        ]);
        const roles = await okBody(rolesResponse, "Naming the lead");
        assert.equal(roles.programme?.lead?.uid, gus.uid, "the programme's lead is not the one chosen");
        await adminPage.getByRole("button", { name: "Change the lead", exact: true }).waitFor({ timeout: WAIT_MS });
      });

      await step("the admin appoints the facilitator to Group A on the Facilitators view", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/groups/facilitators`, { waitUntil: "domcontentloaded" });
        const facilitators = adminPage.locator('section[aria-labelledby="facilitators-title"]');
        await facilitators.getByRole("button", { name: `Change ${groupA.name}’s facilitators`, exact: true }).waitFor({ timeout: WAIT_MS });
        await facilitators.getByRole("button", { name: `Change ${groupA.name}’s facilitators`, exact: true }).click();
        await facilitators.getByPlaceholder("Search people…").fill(fern.displayName);
        await facilitators.getByRole("checkbox", { name: new RegExp(escapeRegExp(fern.displayName)) }).check();
        const [response] = await Promise.all([
          responseTo(adminPage, `/groups/${groupA.id}/facilitators`, "POST"),
          facilitators.getByRole("button", { name: "Save", exact: true }).click(),
        ]);
        const body = await okBody(response, "Appointing the facilitator");
        assert.deepEqual(body.facilitatorUids, [fern.uid], "the group's facilitators are not the one ticked");
      });

      await step("the lead opens live week 3, fixes a reading's title in its side panel and saves it for every group, telling nobody", async () => {
        activePage = leadPage;
        await signIn(leadPage, { email: gus.email, password: gus.password });
        await leadPage.goto(weekUrl, { waitUntil: "domcontentloaded" });
        await leadPage.getByRole("heading", { name: WORDS.blocksTitle, exact: true }).waitFor({ timeout: WAIT_MS });

        // The week's line: live, every group reads it, the people in them as the editor's route counts them, and who has started it.
        const editor = await leadPage.request.get(`${origin}${api}/editor`);
        assert.equal(editor.status(), 200, "the lead is refused the week as the editor reads it");
        const reach = (await editor.json()).reach;
        assert.deepEqual([reach.reading, reach.groups.length, reach.started], [state.groups.length, state.groups.length, started.length]);
        const line = flat(await wordsIn(leadPage.locator('section[aria-labelledby="edit-week-title"]').locator("p").filter({ hasText: WORDS.live }).first()));
        assert.equal(line, `${WORDS.live} Open for ${state.groups.length} groups and ${reach.people} people · ${started.length} people have started it`);

        // The reading as it reads, with Ada's one tick beside it, numbers only.
        const reading = card(leadPage, READING.id);
        assert.match(await wordsIn(reading), new RegExp(`^Source · Part ${READING.partNumber} 1 ticked Change ${escapeRegExp(READING.title)}`));
        assert.ok(!(await wordsIn(leadPage.locator("main"))).includes(ada.first), "a name on the week's page");

        // Change takes the week, and the panel opens with the reading's own words.
        const before = readingIn(await storedWeek());
        const [taken] = await Promise.all([responseTo(leadPage, `${api}/lock`, "POST"), (await changeReady(leadPage, READING.place, READING.title)).click()]);
        assert.equal((await okBody(taken, "Taking the week")).lock?.state, "yours");
        assert.equal((await storedLock())?.holderUid, gus.uid, "the week's lock does not name the lead");
        const sheet = panel(leadPage);
        await sheet.getByRole("heading", { name: WORDS.panelTitle, exact: true }).waitFor({ timeout: WAIT_MS });
        await leadPage.getByText(WORDS.editingLine, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await sheet.getByLabel(WORDS.titleLabel, { exact: true }).inputValue(), READING.title);
        await sheet.getByText(WORDS.ticksLine(1), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.match(await wordsIn(sheet), new RegExp(escapeRegExp(WORDS.scopeTitle(state.programmeName, state.groups.length))));
        assert.match(await wordsIn(sheet), new RegExp(escapeRegExp(WORDS.liveLine)));

        await sheet.getByLabel(WORDS.titleLabel, { exact: true }).fill(READING.newTitle);
        const [savedResponse] = await Promise.all([
          responseTo(leadPage, `${api}/blocks/${READING.id}`, "PATCH"),
          sheet.getByRole("button", { name: WORDS.save, exact: true }).click(),
        ]);
        const sent = JSON.parse(savedResponse.request().postData() ?? "{}");
        assert.deepEqual(Object.keys(sent.fields), ["title"], "the save sent more than the field that changed");
        assert.equal(typeof sent.base, "string", "the save did not send the block's fingerprint as loaded");
        assert.equal(sent.reading, undefined, "a new title is not a new reading");
        const saved = await okBody(savedResponse, "Saving the reading's title");
        assert.deepEqual([saved.saved, saved.live, saved.summary], [true, true, WORDS.titleSummary]);

        // The tell dialog opens, Nobody chosen; Gus tells nobody.
        const dialog = leadPage.getByRole("dialog");
        await dialog.getByRole("heading", { name: WORDS.tellTitle, exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await dialog.getByRole("radio", { name: "Nobody" }).isChecked(), true, "Nobody is not the default");
        await dialog.getByRole("button", { name: WORDS.nobody, exact: true }).click();
        await waitFor("the tell dialog to close", async () => (await leadPage.getByRole("dialog").count()) === 0);
        await leadPage.getByText(WORDS.saved(WORDS.titleSummary), { exact: true }).waitFor({ timeout: WAIT_MS });

        // Stored: the same block, by its id, with its new title and nothing else changed; the lock given back; a history.
        const after = readingIn(await storedWeek());
        assert.deepEqual({ ...after, title: before.title }, before, "the save changed more than the title");
        assert.equal(after.title, READING.newTitle);
        await waitFor("the lead's hold to be given back", async () => (await storedLock()) === null);
        const saves = await storedSaves();
        assert.deepEqual(
          saves.map((save) => [save.kind, save.summary, save.told ?? null]),
          [
            ["found", WORDS.firstFound, null],
            ["edit", WORDS.titleSummary, null],
          ],
        );
        assert.equal(saves[1].work?.ticks, 1, "the history does not record the tick it kept");
      });

      await step("the member who ticked the reading still sees it ticked, under its new title", async () => {
        activePage = memberPage;
        await signIn(memberPage, { email: ada.email, password: ada.password });
        const tick = await adasTick(READING.newTitle);
        assert.equal(await tick.isChecked(), true, "Ada's tick did not stay with the reading");
        assert.equal(await memberPage.getByRole("checkbox", { name: WORDS.doneItem(READING.title), exact: true }).count(), 0, "the old title still shows");
      });

      let linkSaveId = null;
      await step("the lead gives the same reading a new address, and the tell dialog's test emails the lead alone", async () => {
        activePage = leadPage;
        await leadPage.goto(weekUrl, { waitUntil: "domcontentloaded" });
        await Promise.all([responseTo(leadPage, `${api}/lock`, "POST"), (await changeReady(leadPage, READING.place, READING.newTitle)).click()]);
        const sheet = panel(leadPage);
        await sheet.getByRole("heading", { name: WORDS.panelTitle, exact: true }).waitFor({ timeout: WAIT_MS });
        await sheet.getByLabel(WORDS.linkLabel, { exact: true }).fill(READING.newUrl);
        // Said plainly before the save: the same reading at a new address keeps Ada's tick; a different one is a paste.
        await sheet.getByText(WORDS.sameReading(1), { exact: true }).waitFor({ timeout: WAIT_MS });
        await sheet.getByText(WORDS.differentReading, { exact: true }).waitFor({ timeout: WAIT_MS });
        const [savedResponse] = await Promise.all([
          responseTo(leadPage, `${api}/blocks/${READING.id}`, "PATCH"),
          sheet.getByRole("button", { name: WORDS.save, exact: true }).click(),
        ]);
        const sent = JSON.parse(savedResponse.request().postData() ?? "{}");
        assert.deepEqual([Object.keys(sent.fields), sent.reading], [["url"], "same"], "a new link is not sent as the same reading");
        const saved = await okBody(savedResponse, "Saving the reading's new link");
        assert.deepEqual([saved.saved, saved.live, saved.summary], [true, true, WORDS.linkSummary]);
        linkSaveId = saved.saveId;
        assert.equal(readingIn(await storedWeek())?.url, READING.newUrl);

        const dialog = leadPage.getByRole("dialog");
        await dialog.getByRole("heading", { name: WORDS.tellTitle, exact: true }).waitFor({ timeout: WAIT_MS });
        await dialog.getByText(WORDS.linkSubject, { exact: true }).waitFor({ timeout: WAIT_MS });
        await dialog.getByText(WORDS.linkLine, { exact: true }).waitFor({ timeout: WAIT_MS });
        const [tested] = await Promise.all([
          responseTo(leadPage, `${api}/tell`, "POST"),
          dialog.getByRole("button", { name: WORDS.test, exact: true }).click(),
        ]);
        const test = await okBody(tested, "Sending the lead a test");
        assert.equal(test.test?.delivery, "sent");
        const mine = await waitFor("the test to reach the lead", async () => {
          const read = await mailTo(gus.email, WORDS.testSubject);
          return read.length === 1 ? read : null;
        });
        assert.ok(mine[0].words.includes(WORDS.linkLine), `the test is not the notice's words: ${mine[0].words}`);
        for (const person of state.people) {
          assert.equal((await mailTo(person.email, WORDS.testSubject)).length, 0, `${person.first} was sent the lead's test`);
          assert.equal((await mailTo(person.email, WORDS.linkSubject)).length, 0, `${person.first} was told before the lead chose to tell`);
        }
      });

      await step("the lead tells the people who have started week 3: the count on the button is the emails sent, none with a meeting link and none to the lead", async () => {
        activePage = leadPage;
        const dialog = leadPage.getByRole("dialog");
        await dialog.getByRole("radio", { name: WORDS.started(started.length) }).check();
        const send = dialog.getByRole("button", { name: WORDS.sendTo(started.length), exact: true });
        await send.waitFor({ timeout: WAIT_MS });
        const [toldResponse] = await Promise.all([responseTo(leadPage, `${api}/tell`, "POST"), send.click()]);
        const sentBody = JSON.parse(toldResponse.request().postData() ?? "{}");
        assert.deepEqual([sentBody.audience, sentBody.count], ["started", started.length], "the press did not send the count on its button");
        const told = await okBody(toldResponse, "Telling the people who have started the week");
        assert.deepEqual([told.told?.count, told.told?.sent], [started.length, started.length]);
        await dialog.getByText(WORDS.emailed(started.length), { exact: true }).waitFor({ timeout: WAIT_MS });

        for (const person of started) {
          const read = await waitFor(`${person.first}'s notice`, async () => {
            const got = await mailTo(person.email, WORDS.linkSubject);
            return got.length === 1 ? got : null;
          });
          assert.ok(read[0].words.includes(WORDS.linkLine), `${person.first}'s notice is not in the notice's words: ${read[0].words}`);
          for (const half of [read[0].text, read[0].html]) {
            assert.ok(!half.includes(groupA.meetingUrl) && !half.includes(new URL(groupA.meetingUrl).host), `${person.first}'s notice carries the meeting link`);
          }
          // "Week 3 is here: <the week's page>", as the notice's last line (`TELL_WORDS.weekLine`), as text or a link.
          assert.ok(read[0].words.includes(`Week ${WEEK} is here: `), `${person.first}'s notice does not say where the week is: ${read[0].words}`);
          assert.ok(
            [read[0].words, read[0].text, ...read[0].links].some((part) => part.includes(`/learn/${state.runId}/weeks/${WEEK}`)),
            `${person.first}'s notice has no way to the week`,
          );
        }
        for (const person of notStarted) assert.equal((await mailTo(person.email, WORDS.linkSubject)).length, 0, `${person.first} has not started the week and was told`);
        assert.equal((await mailTo(gus.email, WORDS.linkSubject)).length, 0, "the lead was sent their own notice");
        assert.equal((await mailTo(fern.email, WORDS.linkSubject)).length, 0, "the facilitator has not started the week and was told");

        const saves = await storedSaves();
        const linkSave = saves.find((save) => save.id === linkSaveId);
        assert.deepEqual([linkSave?.told?.audience, linkSave?.told?.count], ["started", started.length], "the history does not say who was told");
        await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
        await waitFor("the tell dialog to close", async () => (await leadPage.getByRole("dialog").count()) === 0);
      });

      await step("a second admin opens week 3 while the lead has a panel open: the notice names the lead and every editing control is off", async () => {
        activePage = leadPage;
        await leadPage.goto(weekUrl, { waitUntil: "domcontentloaded" });
        await Promise.all([responseTo(leadPage, `${api}/lock`, "POST"), (await changeReady(leadPage, REFLECTION.place, REFLECTION.label)).click()]);
        await panel(leadPage).getByRole("button", { name: WORDS.save, exact: true }).waitFor({ timeout: WAIT_MS });

        activePage = adminPage;
        await adminPage.goto(weekUrl, { waitUntil: "domcontentloaded" });
        await adminPage.getByText(WORDS.heldTitle(gus.first), { exact: true }).waitFor({ timeout: WAIT_MS });
        const notice = adminPage.getByText(WORDS.heldTitle(gus.first), { exact: true }).locator("xpath=ancestor::div[@role='status'][1]");
        assert.match(await wordsIn(notice), new RegExp(`Since \\d{1,2}(:\\d\\d)?(am|pm)\\. ${escapeRegExp(WORDS.heldLine(gus.first))}`));
        // The week still reads, and nothing on it can be changed: every Change and the paste are off.
        await adminPage.getByRole("heading", { name: WORDS.blocksTitle, exact: true }).waitFor({ timeout: WAIT_MS });
        await waitFor("the page's script to arrive", async () => adminPage.locator(`#week-markdown-${WEEK_ID}`).evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"))));
        const changes = adminPage.getByRole("button", { name: /^Change Part / });
        const count = await changes.count();
        assert.ok(count >= 4, `only ${count} Change buttons on the week`);
        for (let i = 0; i < count; i += 1) assert.equal(await changes.nth(i).isEnabled(), false, `${await changes.nth(i).getAttribute("aria-label")} is pressable while the lead edits`);
        assert.equal(await adminPage.locator(`#week-markdown-${WEEK_ID}`).isEnabled(), false, "the paste is open while the lead edits");
        // A save by the admin now is refused by name, whatever the page shows.
        const refused = await adminPage.request.post(`${origin}${api}/lock`);
        assert.equal(refused.status(), 409);
        assert.match((await refused.json()).error ?? "", new RegExp(`^${escapeRegExp(gus.first)} is editing week ${WEEK}`));

        // The lead cancels, and the week is free for the admin.
        activePage = leadPage;
        const [given] = await Promise.all([
          responseTo(leadPage, `${api}/lock`, "DELETE"),
          panel(leadPage).getByRole("button", { name: WORDS.cancel, exact: true }).click(),
        ]);
        await okBody(given, "Giving the week back");
        activePage = adminPage;
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        await changeReady(adminPage, READING.place, READING.newTitle);
        assert.equal(await adminPage.getByText(WORDS.heldTitle(gus.first), { exact: true }).count(), 0, "the notice outlived the lead's hold");
      });

      await step("the history lists every save, compares the first with now and restores it as a new save, and the member's tick is still there", async () => {
        activePage = leadPage;
        await leadPage.goto(weekUrl, { waitUntil: "domcontentloaded" });
        await leadPage.getByRole("link", { name: WORDS.history, exact: true }).click();
        await leadPage.waitForURL((url) => url.pathname.endsWith(`/weeks/${WEEK_ID}/history`), { timeout: WAIT_MS });
        const rows = leadPage.locator("li[data-save-id]");
        await rows.first().waitFor({ timeout: WAIT_MS });
        const said = [];
        for (let i = 0; i < (await rows.count()); i += 1) said.push(await wordsIn(rows.nth(i)));
        assert.equal(said.length, 3, said.join("\n"));
        assert.match(said[0], new RegExp(`${escapeRegExp(gus.first)} ${escapeRegExp(WORDS.linkSummary)} .*1 tick kept · told ${started.length} people · What the week says now`));
        assert.match(said[1], new RegExp(`${escapeRegExp(gus.first)} ${escapeRegExp(WORDS.titleSummary)}`));
        assert.match(said[2], new RegExp(escapeRegExp(WORDS.firstFound)));

        // Tick the first save: compared with now.
        const first = rows.nth(2);
        const firstId = await first.getAttribute("data-save-id");
        const [compared] = await Promise.all([
          responseTo(leadPage, `${api}/history/${firstId}`, "GET"),
          first.getByRole("checkbox").check(),
        ]);
        const comparison = await okBody(compared, "Comparing the first save with now");
        assert.equal(comparison.after?.id, "now");
        const changedRow = comparison.comparison.rows.find((row) => row.blockId === READING.id);
        assert.equal(changedRow?.state, "changed", "the comparison does not say the reading changed");
        assert.match(changedRow.fields, /link/);
        assert.match(changedRow.fields, /title/);
        const heading = leadPage.getByRole("heading", { name: new RegExp(`^${WORDS.compareWithNow} .* with now$`) });
        await heading.waitFor({ timeout: WAIT_MS });
        await leadPage.getByText(READING.place, { exact: true }).first().waitFor({ timeout: WAIT_MS });

        const whenFirst = flat(await wordsIn(first.locator("span").nth(0)));
        const day = whenFirst.split(",")[0];
        const [restoredResponse] = await Promise.all([
          responseTo(leadPage, `${api}/history/${firstId}/restore`, "POST"),
          leadPage.getByRole("button", { name: WORDS.restore(day), exact: true }).click(),
        ]);
        const restored = await okBody(restoredResponse, "Restoring the first save");
        assert.equal(restored.saved, true);
        await leadPage.getByText(new RegExp(`^Saved: ${escapeRegExp(WORDS.restoredSummary)} `)).waitFor({ timeout: WAIT_MS });
        await waitFor("the history to list the restore first", async () => (await rows.count()) === 4);
        assert.match(await wordsIn(rows.nth(0)), new RegExp(escapeRegExp(WORDS.restoredSummary)));

        const back = readingIn(await storedWeek());
        assert.deepEqual([back.id, back.title, back.url], [READING.id, READING.title, READING.url], "the restore did not bring the reading back as it was");
        const saves = await storedSaves();
        assert.deepEqual(saves.map((save) => save.kind), ["found", "edit", "edit", "restore"]);

        // Ada's tick, still hers, under the title it has again.
        const tick = await adasTick(READING.title);
        assert.equal(await tick.isChecked(), true, "Ada's tick did not survive the restore");
      });

      await step("a facilitator and a member are refused the week's page, its history and its routes", async () => {
        activePage = facilitatorPage;
        await signIn(facilitatorPage, { email: fern.email, password: fern.password });
        for (const [pg, who] of [
          [facilitatorPage, "Fern, Group A's facilitator"],
          [memberPage, "Ada, a member"],
        ]) {
          activePage = pg;
          for (const url of [weekUrl, historyUrl]) {
            await pg.goto(url, { waitUntil: "domcontentloaded" });
            await pg.waitForURL((at) => at.pathname === "/dashboard", { timeout: WAIT_MS });
          }
          const asked = [
            ["GET", `${api}/editor`],
            ["GET", `${api}/history`],
            ["POST", `${api}/lock`],
            ["PATCH", `${api}/blocks/${READING.id}`],
          ];
          for (const [method, path] of asked) {
            const answer = await pg.request.fetch(`${origin}${path}`, {
              method,
              headers: { "Content-Type": "application/json" },
              ...(method === "PATCH" ? { data: { base: "0000000000000000", fields: { title: "Not theirs" } } } : {}),
            });
            assert.equal(answer.status(), 403, `${who}: ${method} ${path} answered ${answer.status()}`);
          }
        }
        assert.equal(readingIn(await storedWeek())?.title, READING.title, "a refused save changed the reading");
        assert.equal(await storedLock(), null, "a refused caller took the week");
      });

      await step("the lead rewords a prompt the member answered: her week page shows the earlier wording under her words, and the facilitator's reflections with names show the question when it was written", async () => {
        activePage = leadPage;
        await leadPage.goto(weekUrl, { waitUntil: "domcontentloaded" });
        await Promise.all([responseTo(leadPage, `${api}/lock`, "POST"), (await changeReady(leadPage, REFLECTION.place, REFLECTION.label)).click()]);
        const sheet = panel(leadPage);
        const prompt = sheet.getByLabel(WORDS.firstPrompt, { exact: true });
        await prompt.waitFor({ timeout: WAIT_MS });
        assert.equal(await prompt.inputValue(), REFLECTION.label);
        await prompt.fill(REFLECTION.newPrompt);
        const [savedResponse] = await Promise.all([
          responseTo(leadPage, `${api}/blocks/${REFLECTION.id}`, "PATCH"),
          sheet.getByRole("button", { name: WORDS.save, exact: true }).click(),
        ]);
        const saved = await okBody(savedResponse, "Rewording the reflection");
        assert.deepEqual([saved.saved, saved.live], [true, true]);
        const dialog = leadPage.getByRole("dialog");
        await dialog.getByRole("heading", { name: WORDS.tellTitle, exact: true }).waitFor({ timeout: WAIT_MS });
        await dialog.getByRole("button", { name: WORDS.nobody, exact: true }).click();
        await waitFor("the tell dialog to close", async () => (await leadPage.getByRole("dialog").count()) === 0);
        await waitFor("the lead's hold to be given back", async () => (await storedLock()) === null);

        // Ada, who answered the old words: under her own words, the words she answered.
        const adasWords = COURSEWORK.coursework.reflections.find((row) => row.person === "ada" && row.weekNumber === WEEK && row.prompt === "rp1").text;
        activePage = memberPage;
        await memberPage.goto(memberWeekUrl, { waitUntil: "domcontentloaded" });
        const box = memberPage.getByRole("textbox", { name: REFLECTION.newPrompt, exact: true });
        await box.waitFor({ timeout: WAIT_MS });
        await waitFor("Ada's reflection to load into its box", async () => (await box.inputValue()) === adasWords);
        const own = memberPage.getByText(WORDS.ownEarlier, { exact: true });
        await own.waitFor({ timeout: WAIT_MS });
        assert.equal(await wordsIn(own.locator("xpath=..")), `${WORDS.ownEarlier} ${REFLECTION.label}`);
        assert.equal(await memberPage.getByText(WORDS.ownEarlier, { exact: true }).count(), 1, "an earlier wording beside an answer whose question did not change");

        // Fern, Group A's facilitator, reading the reflections with names on the page of one question, at the week's
        // first reflection (this one): asked in its new words, and under Ada's, the question when she wrote it.
        activePage = facilitatorPage;
        await facilitatorPage.goto(`${origin}/learn/${enc(state.runId)}/group/${enc(groupA.id)}/question?week=${WEEK}&first=reflection`, { waitUntil: "domcontentloaded" });
        const asked = facilitatorPage.locator("section[aria-labelledby=question-asked]");
        await asked.waitFor({ timeout: WAIT_MS });
        assert.ok((await wordsIn(asked)).endsWith(REFLECTION.newPrompt), `the page does not ask the reflection in its new words: ${await wordsIn(asked)}`);
        // Ada's row: a section carrying her id.
        const answer = facilitatorPage.locator(`section[id="p-${ada.uid}"]`);
        await answer.waitFor({ timeout: WAIT_MS });
        const said = await wordsIn(answer);
        assert.ok(said.includes(`${adasWords} ${WORDS.staffEarlier} ${REFLECTION.label}`), `the reflection with names does not say the question when it was written: ${said}`);
      });
    } finally {
      await facilitatorContext.close().catch(() => {});
      await memberContext.close().catch(() => {});
      await leadContext.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
