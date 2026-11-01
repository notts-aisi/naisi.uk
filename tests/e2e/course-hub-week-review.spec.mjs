/**
 * END-TO-END: a week's review, an admin's page (privacy v15).
 *
 * The term at its coursework point (`scripts/e2e-fixtures/course-hub-week-review.mjs`):
 * three weeks into a running run whose weeks are written as blocks, Ada and
 * Ben in Group A, Cleo in Group B and Dan in no group, week 3's sessions
 * over, and Ada's week 3 written answer and first reflection written after
 * she agreed to the policy. The admin approves Fern and Group A's two people,
 * names the run on the programme's Settings tab and appoints Fern to Group A.
 * Then:
 *
 *  - the Weeks tab offers the admin Review beside each week whose first
 *    session has started, week 3 among them, and none beside week 4;
 *  - the review says what would be sent before any press (one written answer
 *    and one reflection, two not included yet), and in local mode, where the
 *    site has no key, the calm sentence that Claude is not set up and no
 *    press; Pangram says who it would check, and nothing is pressed;
 *  - who might need a hand, from the site's own records: Ben has not started
 *    week 3 though his group has met, with where that came from;
 *  - the admin asks Fern to have a word with Ben, which makes one task on
 *    Fern's board with fixed words and no reason;
 *  - the week's Notes, beside its review, say who submitted and show the
 *    draft of a note about Ada the fixture seeded (the local server has no
 *    key, so nothing is drafted here), built only from her submitted week,
 *    with its boxes for next term unticked;
 *  - the admin edits it and saves it to Ada's notes: one note, drafted by
 *    Claude and in the admin's words, and the draft gone;
 *  - Fern, signed in, finds it on My Work.
 *
 * The lead's side (a calm "a week's review is for admins", nothing of the week
 * read; the saved notes kept for leads and never a draft) is never driven
 * here: the harness signs in no lead who is not an admin.
 * `tests/week-review.test.mjs`, `tests/week-notes.test.mjs` and the persona
 * battery hold it.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-week-review
 *
 * It reads no mail: every fixture address is suppressed.
 *
 * ## The words it holds the pages to
 *
 * Restated from src/lib/courses/weekReview/words.ts,
 * src/lib/courses/weekNotes/words.ts and
 * src/lib/courses/coursework/claudeWords.ts, with their apostrophes. A change
 * to one of them changes this file in the same pull request.
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
import {
  ARTIFACTS_DIR,
  HARNESS_LOCAL_ORIGIN,
  RECAPTCHA_SKIP_REASON,
  fixtureQuery,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { DRAFTED, RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-week-review.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** The words the pages say, restated from src/lib/courses/weekReview/words.ts and claudeWords.ts. */
const WORDS = {
  review: "Review",
  title: "Week 3 review",
  whoSees: "Admins only",
  counts: "1 written answer · 1 reflection · 0 check-ins · 0 facilitator reports",
  notIncluded: "2 not included yet: written before their writers agreed to version 15 of the privacy policy.",
  claudeNotSetUp: "Claude isn’t set up on this site yet.",
  press: "Review with Claude",
  handsTitle: "Might need a hand",
  notStarted: "Week 3 not started when their group met.",
  fromWeek: "Their week",
  pangramNotSetUp: "Pangram isn’t set up on this site yet.",
  gradesLine:
    "Grades help you choose what to read first. They’re never shown to the person, a lead or a facilitator, never become feedback, and never go into anyone’s notes or profile.",
  notesTitle: "Week 3 notes",
  notesTab: "Notes about people",
  builtOnlyFrom: "Built only from",
  save: "Save to their notes",
  savedBy: "Saved to their notes by ",
  suggestTitle: "Suggest for next term",
};

let skipReasonFor = () => null;

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

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: a week's review for an admin, what it would send, who might need a hand, and a follow-up a facilitator finds",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const deployed = origin !== HARNESS_LOCAL_ORIGIN;

    const fern = state.facilitator;
    const personOf = (key) => state.people.find((person) => person.key === key);
    const groupOf = (key) => state.groups.find((group) => group.key === key);
    const [ada, ben] = ["ada", "ben"].map(personOf);
    for (const [key, person] of Object.entries({ ada, ben, fern })) assert.ok(person, `the term has no ${key}`);
    const groupA = groupOf("A");
    assert.ok(groupA, "the term has no Group A");

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;

    const { browser, context, page: adminPage } = await openBrowser();
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
    await stubRecaptchaOnLoopback(facilitatorPage, origin);
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

    /** Every request the review page sends to Claude's or Pangram's press, counted. */
    const pressed = [];
    adminPage.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST" && (/\/weeks\/w03\/review$/.test(path) || /\/pangram$/.test(path))) pressed.push(path);
    });

    try {
      await step("the admin approves the facilitator and the two people of the group they will facilitate", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [ada, ben, fern]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          const approved = await waitFor(`${account.first}'s account to say member`, async () => {
            const doc = await readUserDoc(account.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${account.first}'s approval left no approvedAt stamp`);
        }
      });

      await step("the admin names the running course run on the programme's Settings tab", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
        const panel = adminPage.getByRole("region", { name: "Course run" });
        await panel.waitFor({ timeout: WAIT_MS });
        const runBox = panel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [response] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${state.runLabel} · Running` }),
        ]);
        const body = await okBody(response, "Naming the run");
        assert.equal(body.changed, true, "naming the run changed nothing");
        assert.equal(body.panel?.runId, state.runId, "the panel names another run");
      });

      await step("the admin appoints the facilitator to Group A on the Facilitators view", async () => {
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
        const body = await okBody(response, "Saving the facilitators");
        assert.deepEqual(body.facilitatorUids, [fern.uid], "the group's facilitators are not the one ticked");
      });

      await step("the Weeks tab offers the admin week 3's review, and no week whose first session is still to come", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/weeks`, { waitUntil: "domcontentloaded" });
        const weeks = adminPage.getByRole("navigation", { name: "Weeks" });
        await weeks.waitFor({ timeout: WAIT_MS });
        const weekThree = weeks.locator('a[href$="/weeks/w03/review"]');
        await weekThree.waitFor({ timeout: WAIT_MS });
        assert.equal(flat((await weekThree.textContent()) ?? ""), WORDS.review);
        // Week 4's sessions are days ahead of the seed.
        assert.equal(await weeks.locator('a[href$="/weeks/w04/review"]').count(), 0, "a week not yet met offers its review");
      });

      await step("the review says what would be sent before any press, and with no key that Claude is not set up, with nothing pressed", async () => {
        activePage = adminPage;
        const pangramRead = responseTo(adminPage, `/programmes/${state.programmeId}/coursework/pangram`, "GET");
        await adminPage.locator('a[href$="/weeks/w03/review"]').click();
        await adminPage.getByRole("heading", { level: 2, name: WORDS.title }).waitFor({ timeout: WAIT_MS });
        const main = adminPage.locator("main");
        const said = await wordsIn(main);
        assert.ok(said.includes(WORDS.whoSees), "the review does not say who sees it");
        assert.ok(said.includes(WORDS.counts), `the review does not say what would be sent: ${said}`);
        assert.ok(said.includes(WORDS.notIncluded), "the review does not say what is not included yet");
        assert.ok(said.includes(WORDS.gradesLine), "the review does not say what grades are for");
        if (!deployed) {
          assert.ok(said.includes(WORDS.claudeNotSetUp), "with no key, the review does not say Claude is not set up");
          assert.equal(await main.getByRole("button", { name: WORDS.press }).count(), 0, "a press with no key behind it");
        }
        // Pangram says who it would check before any press.
        assert.equal((await pangramRead).status(), 200, "reading Pangram's count was refused");
        const pangram = main.locator('section[aria-label="Pangram"]').first();
        await waitFor("Pangram's panel to say who it would check", async () => {
          const text = await wordsIn(pangram);
          return deployed ? text.length > 0 : text.includes(WORDS.pangramNotSetUp);
        });
        assert.deepEqual(pressed, [], "drawing the review pressed something");
      });

      await step("who might need a hand, from the site's own records, each line saying where it came from", async () => {
        activePage = adminPage;
        const hands = adminPage.locator('section[aria-labelledby="review-hands"]');
        await hands.getByRole("heading", { name: WORDS.handsTitle }).waitFor({ timeout: WAIT_MS });
        const row = hands.locator("li").filter({ hasText: WORDS.notStarted }).filter({ hasText: ben.displayName }).first();
        await row.waitFor({ timeout: WAIT_MS });
        const said = await wordsIn(row);
        assert.ok(said.includes(WORDS.fromWeek), `Ben's line does not say where it came from: ${said}`);
        assert.ok(said.includes(groupA.name), `Ben's row does not name his group: ${said}`);
      });

      await step("the admin asks the facilitator to have a word with a person: one task, fixed words and no reason", async () => {
        activePage = adminPage;
        const hands = adminPage.locator('section[aria-labelledby="review-hands"]');
        const ask = hands.getByRole("button", { name: new RegExp(`^Ask ${escapeRegExp(fern.first)} to have a word with Ben$`) });
        await ask.waitFor({ timeout: WAIT_MS });
        const [response] = await Promise.all([responseTo(adminPage, "/weeks/w03/review/follow-up", "POST"), ask.click()]);
        const body = await okBody(response, "Asking for a word");
        assert.deepEqual(Object.keys(body).sort(), ["emailed", "taskId"]);
        // The press says it is done, and the page drawn again says when it was asked.
        await hands.getByText(/^Asked\b/).first().waitFor({ timeout: WAIT_MS });
        const tasks = await fixtureQuery("tasks").where("source", "==", "review-follow-up").where("sourceRef.cohortId", "==", state.runId).get();
        assert.equal(tasks.size, 1, "asking made no task, or more than one");
        const task = tasks.docs[0].data();
        assert.match(task.title, new RegExp(`^Have a word with Ben\\b.* \\(${escapeRegExp(groupA.name)}\\)$`));
        assert.deepEqual(task.completerUids, [fern.uid], "the task is not for the group's facilitator");
        assert.equal(task.visibility, "assignees-only");
        assert.equal(task.sourceRef?.aboutUid, ben.uid);
        assert.doesNotMatch(task.description, /not started|Claude|check-in|register|report/i, "the task gives a reason");
      });

      await step("the week's notes, beside its review: who submitted, and a waiting draft built only from a submitted week", async () => {
        activePage = adminPage;
        await adminPage.getByRole("navigation", { name: "This week" }).getByRole("link", { name: WORDS.notesTab }).click();
        await adminPage.getByRole("heading", { level: 2, name: WORDS.notesTitle }).waitFor({ timeout: WAIT_MS });
        const main = adminPage.locator("main");
        const said = await wordsIn(main);
        // Ada submitted week 3, and the seeded draft is hers; Ben, in the same group, did not submit.
        assert.match(said, /\b\d+ people · 1 draft · [1-9]\d* submitted nothing this week, so there’s no note for them · 0 saved\b/, `the counts: ${said}`);
        if (!deployed) assert.ok(said.includes(WORDS.claudeNotSetUp), "with no key, the notes do not say Claude is not set up");
        const card = main.locator("article").filter({ hasText: ada.displayName }).first();
        await card.waitFor({ timeout: WAIT_MS });
        const onCard = await wordsIn(card);
        assert.ok(onCard.includes(WORDS.builtOnlyFrom), `the draft does not say what it was built from: ${onCard}`);
        assert.match(onCard, /Week 3 answer and 1 reflection, submitted \w{3} \d{1,2} \w{3}/, `the draft's sources: ${onCard}`);
        // The seeded words, with the person's name put back where Claude wrote "the fellow".
        const box = card.getByRole("textbox", { name: "Draft note" });
        assert.match(await box.inputValue(), new RegExp(`^${escapeRegExp(ada.first)}\\b`), "the draft's box does not name the person");
        // Every box for next term starts unticked: only a person ticks one.
        const suggest = card.getByRole("group", { name: WORDS.suggestTitle });
        assert.equal(await suggest.getByRole("checkbox", { checked: true }).count(), 0, "a suggestion is ticked before anybody ticked it");
        assert.deepEqual(pressed, [], "opening the notes pressed something");
      });

      await step("the admin saves the draft to the person's notes, in the admin's words, and the card says who saved it", async () => {
        activePage = adminPage;
        const card = adminPage.locator("main article").filter({ hasText: ada.displayName }).first();
        const box = card.getByRole("textbox", { name: "Draft note" });
        await box.fill(`${ada.first} argues from the reading with care.`);
        await card.getByRole("checkbox", { name: "Facilitating" }).check();
        const [response] = await Promise.all([
          responseTo(adminPage, `/weeks/w03/notes/${ada.uid}/save`, "POST"),
          card.getByRole("button", { name: WORDS.save, exact: true }).click(),
        ]);
        const body = await okBody(response, "Saving the note");
        assert.deepEqual(Object.keys(body), ["id"]);
        await adminPage.locator("main article").filter({ hasText: WORDS.savedBy }).first().waitFor({ timeout: WAIT_MS });
        const notes = await fixtureQuery("memberNotes").where("runId", "==", state.runId).get();
        assert.equal(notes.size, 1, "saving made no note, or more than one");
        const note = notes.docs[0].data();
        assert.equal(note.uid, ada.uid);
        assert.equal(note.text, `${ada.first} argues from the reading with care.`, "the note is not the admin's words");
        assert.equal(note.draftedByClaude, true);
        assert.equal(note.kind, "weekly");
        assert.equal(note.weekId, "w03");
        assert.deepEqual(note.suggest, ["facilitating"]);
        assert.notEqual(note.text, DRAFTED);
        const drafts = await fixtureQuery("courseNoteDrafts").where("runId", "==", state.runId).get();
        assert.equal(drafts.size, 0, "the draft outlived its save");
      });

      await step("the facilitator finds the task on My Work", async () => {
        activePage = facilitatorPage;
        await signIn(facilitatorPage, fern);
        await facilitatorPage.goto(`${origin}/tasks`, { waitUntil: "domcontentloaded" });
        await facilitatorPage.getByText(/^Have a word with Ben\b/).first().waitFor({ timeout: WAIT_MS });
      });
    } finally {
      await facilitatorContext.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
