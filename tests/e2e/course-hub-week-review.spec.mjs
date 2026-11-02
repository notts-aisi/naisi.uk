/**
 * END-TO-END: a week's review, an admin's page (privacy v15).
 *
 * The term at its coursework point (`scripts/e2e-fixtures/course-hub-week-review.mjs`):
 * three weeks into a running run whose weeks are written as blocks, Ada and
 * Ben in Group A, Cleo in Group B and Dan in no group, week 3's sessions
 * over, Ada's week 3 written answer and first reflection and Cleo's first
 * reflection written after they agreed to the policy, both weeks submitted,
 * and a waiting draft of a note about each. The admin approves Fern and
 * Group A's two people, names the run on the programme's Settings tab and
 * appoints Fern to Group A. Then:
 *
 *  - the Weeks tab offers the admin Review beside each week whose first
 *    session has started, week 3 among them, and none beside week 4;
 *  - the review says what would be sent before any press (one written answer
 *    and two reflections, one not included yet), and in local mode, where the
 *    server's Claude is the harness's fake (scripts/e2e/lib/fakeClaude.mjs),
 *    offers Review with Claude; Pangram says who it would check, and nothing
 *    is pressed;
 *  - who might need a hand, from the site's own records: Ben has not started
 *    week 3 though his group has met, with where that came from;
 *  - the admin asks Fern to have a word with Ben, which makes one task on
 *    Fern's board with fixed words and no reason;
 *  - the admin presses Review with Claude once: in local mode the fake is
 *    asked its three asks once each, with nobody's name or address in them,
 *    and the page shows its draft grade, its theme and its hand for Ada;
 *    against a deployed target, the review or one of the site's reasons;
 *  - the week's Notes, beside its review, say who submitted and show both
 *    drafts, Ada's built only from her submitted week, with its boxes for
 *    next term unticked, and the fake asked nothing more;
 *  - the admin edits Ada's and saves it to her notes: one note, drafted by
 *    Claude and in the admin's words, and the draft gone;
 *  - the admin discards Cleo's, and Cleo is the one person left to draft for;
 *  - the admin presses Draft this week's notes once: one request, for Cleo,
 *    and in local mode the fake's draft with her name put back;
 *  - next term's page suggests Ada for facilitating, from the saved note;
 *  - Fern, signed in, finds the task on My Work.
 *
 * The lead's side (a calm "a week's review is for admins", nothing of the week
 * read; the saved notes kept for leads and never a draft) is never driven
 * here: this spec names no lead. `tests/week-review.test.mjs`,
 * `tests/week-notes.test.mjs` and the persona battery hold it.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-week-review
 *
 * It reads no mail: every fixture address is suppressed. In local mode it
 * sends Claude three requests for the review and one for Cleo's draft, all to
 * the harness's fake; against a deployed target those four go to Claude.
 *
 * ## The words it holds the pages to
 *
 * Restated from src/lib/courses/weekReview/words.ts,
 * src/lib/courses/weekNotes/words.ts, src/lib/courses/coursework/claudeWords.ts
 * and src/lib/applications/nextTerm/words.ts, with their apostrophes. A change
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
import { FAKE_CLAUDE_WORDS, fakeClaudeRequests } from "../../scripts/e2e/lib/fakeClaude.mjs";
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
import { DRAFTED, DRAFTED_TO_DISCARD, RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-week-review.mjs";

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
  counts: "1 written answer · 2 reflections · 0 check-ins · 0 facilitator reports",
  notIncluded: "1 not included yet: written before its writer agreed to version 15 of the privacy policy.",
  claudeNotSetUp: "Claude isn’t set up on this site yet.",
  press: "Review with Claude",
  pressAgain: "Review again",
  gradeBar: "1 answer graded 7",
  fromClaudeAnswers: "Claude, from their answers",
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
  discard: "Discard",
  draftNotes: "Draft this week’s notes",
  pressLineOne:
    "Sends one request to Anthropic, for the 1 person who submitted and has no draft or note from this week, with labels and numbers in place of names. Nobody is emailed.",
  nextTermTitle: "Next term: who to ask",
  nextTermChip: "Admins only",
  facilitating: "Facilitating",
  nextTermCaption: "People suggested for next term: facilitating",
};

/**
 * How long a press that reaches Claude may take: `MAX_CALL_MS` in
 * src/lib/ai/claude.ts is 240 seconds and a route may run for 290, so a
 * minute over that. The fake answers at once.
 */
const CLAUDE_WAIT_MS = 300_000;

/**
 * Every reason the site may answer a press that reaches Claude with (the
 * review's and the notes' own in src/lib/courses/weekReview/words.ts and
 * src/lib/courses/weekNotes/words.ts, and the door's in src/lib/ai/claude.ts).
 * Against a deployed target any of them is a calm answer; Claude's words are
 * never asserted there.
 */
const CLAUDE_REASONS = [
  "Claude isn’t set up on this site yet.",
  "Claude took too long to answer. Try again.",
  "Claude refused this site’s key. Check the key on the Claude Platform.",
  "Claude is busy or this month’s spending limit is used up. Try again shortly.",
  "Claude couldn’t answer just now. Try again.",
  "Claude couldn’t be reached. Try again.",
  "Claude declined to assess this one. Read it yourself.",
  "Claude’s answer was cut short. Try again.",
  "Claude’s answer couldn’t be read. Try again.",
  "Claude couldn’t review it just now. Try again.",
  "Claude couldn’t draft a note just now. Try again.",
];

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
    const [ada, ben, cleo] = ["ada", "ben", "cleo"].map(personOf);
    for (const [key, person] of Object.entries({ ada, ben, cleo, fern })) assert.ok(person, `the term has no ${key}`);
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
    const responseTo = (pg, suffix, method, timeout = WAIT_MS) =>
      pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout });

    /** A JSON answer that must be a success, read once. */
    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    /** In local mode, how many requests the fake Claude had answered before this spec began. */
    const askedBefore = deployed ? null : (await fakeClaudeRequests()).length;
    /** In local mode, how many it had answered once Review with Claude came back. */
    let askedAfterReview = null;
    /** How many presses the review page had sent once Review with Claude came back. */
    let pressedAfterReview = null;

    /** Every word of a person's that must never reach Claude: their names and their address. */
    const namesOf = (person) => [person.displayName, person.first, person.email];

    /** The week's Notes page, as the admin opens it from the week's tabs. */
    const notesUrl = `${formBase}/weeks/w03/notes`;

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

      await step("the review says what would be sent before any press, and offers Review with Claude, with nothing pressed", async () => {
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
          // Claude is the fake here: the press is offered, and nothing says it is not set up.
          assert.equal(await main.getByRole("button", { name: WORDS.press }).count(), 1, "the review does not offer its press where Claude is set up");
          assert.ok(!said.includes(WORDS.claudeNotSetUp), "the review says Claude is not set up where the fake is");
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

      await step("the admin presses Review with Claude once, and its draft grades, what people found hard and a hand come back", async () => {
        activePage = adminPage;
        const main = adminPage.locator("main");
        const button = main.getByRole("button", { name: WORDS.press, exact: true });
        if (deployed && (await button.count()) === 0) {
          // A deployed target with no key offers no press and says why.
          assert.ok((await wordsIn(main)).includes(WORDS.claudeNotSetUp), "the review offers no press and does not say why");
          console.log("[course-hub-week-review-spec] Review with Claude: not offered, Claude is not set up on the target.");
          pressedAfterReview = pressed.length;
          return;
        }
        const answered = responseTo(adminPage, "/weeks/w03/review", "POST", CLAUDE_WAIT_MS);
        await button.click();
        const answer = await answered;
        pressedAfterReview = pressed.length;
        assert.equal(pressed.length, 1, "one press sent more than one request, or none");
        if (!deployed) {
          assert.equal(answer.status(), 200, `the fake Claude's review answered ${answer.status()}`);
          // The page drawn again on the server, with what came back.
          await main.getByRole("button", { name: WORDS.pressAgain, exact: true }).waitFor({ timeout: WAIT_MS });
          // Draft grades: Ada's one written answer, graded as the fake grades every answer.
          const grades = main.locator('section[aria-labelledby="review-grades"]');
          await grades.getByRole("listitem", { name: WORDS.gradeBar, exact: true }).waitFor({ timeout: WAIT_MS });
          // What people found hard: the fake's one theme, with the names put back where it has any.
          const themes = main.locator('section[aria-labelledby="review-themes"]');
          await themes.getByText(FAKE_CLAUDE_WORDS.themeTitle, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.ok((await wordsIn(themes)).includes(FAKE_CLAUDE_WORDS.themeDetail), "the theme does not say what it found");
          // Who might need a hand: the first fellow sent, Ada, resting on her own answer, beside the site's own line about Ben.
          const hands = main.locator('section[aria-labelledby="review-hands"]');
          const adaRow = hands.locator("li").filter({ hasText: FAKE_CLAUDE_WORDS.handWhy }).filter({ hasText: ada.displayName }).first();
          await adaRow.waitFor({ timeout: WAIT_MS });
          assert.ok((await wordsIn(adaRow)).includes(WORDS.fromClaudeAnswers), "Claude's hand does not say where it came from");
          await hands.locator("li").filter({ hasText: WORDS.notStarted }).filter({ hasText: ben.displayName }).first().waitFor({ timeout: WAIT_MS });
          // The three asks, once each, and no name or address of anybody's in what would have gone to Anthropic.
          const sent = (await fakeClaudeRequests()).slice(askedBefore);
          assert.deepEqual(
            sent.map((request) => request.caller).sort(),
            ["week-review-grades", "week-review-hands", "week-review-themes"],
            "the review asked the fake something else, or one part more than once",
          );
          for (const request of sent) {
            for (const person of [ada, ben, cleo, fern]) {
              for (const words of namesOf(person)) {
                assert.ok(words && !request.message.includes(words), `what ${request.caller} sent to Claude carries ${words}`);
              }
            }
          }
          askedAfterReview = askedBefore + sent.length;
        } else if (answer.status() === 200) {
          await main.getByRole("button", { name: WORDS.pressAgain, exact: true }).waitFor({ timeout: WAIT_MS });
          // Which way each part went is the target's business; the page is drawn again with an answer.
          console.log("[course-hub-week-review-spec] Review with Claude: the review came back.");
        } else {
          const alert = flat((await main.getByRole("alert").first().textContent()) ?? "");
          assert.ok(CLAUDE_REASONS.some((reason) => alert.includes(reason)), `the review was refused in words the site does not say: ${alert}`);
          console.log(`[course-hub-week-review-spec] Review with Claude: answered ${answer.status()} with the reason "${alert}".`);
        }
      });

      await step("the week's notes, beside its review: who submitted, and a waiting draft built only from a submitted week", async () => {
        activePage = adminPage;
        await adminPage.getByRole("navigation", { name: "This week" }).getByRole("link", { name: WORDS.notesTab }).click();
        await adminPage.getByRole("heading", { level: 2, name: WORDS.notesTitle }).waitFor({ timeout: WAIT_MS });
        const main = adminPage.locator("main");
        const said = await wordsIn(main);
        // Ada and Cleo submitted week 3, and the two seeded drafts are theirs; Ben, in Ada's group, did not submit.
        assert.match(said, /\b\d+ people · 2 drafts · [1-9]\d* submitted nothing this week, so there’s no note for them · 0 saved\b/, `the counts: ${said}`);
        if (!deployed) assert.ok(!said.includes(WORDS.claudeNotSetUp), "the notes say Claude is not set up where the fake is");
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
        assert.equal(pressed.length, pressedAfterReview, "opening the notes pressed something");
        // Everybody who submitted has a draft, so nobody is left for Draft this week's notes.
        assert.equal(await main.getByRole("button", { name: WORDS.draftNotes }).count(), 0, "Draft this week's notes is offered with nobody to draft for");
        if (!deployed) {
          assert.ok(askedAfterReview !== null, "the review step did not reach the fake, so there is nothing to compare with");
          assert.equal((await fakeClaudeRequests()).length, askedAfterReview, "drawing the review or the notes sent something to Claude");
        }
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
        const drafts = await fixtureQuery("courseNoteDrafts").where("runId", "==", state.runId).where("uid", "==", ada.uid).get();
        assert.equal(drafts.size, 0, "the draft outlived its save");
      });

      await step("the admin discards a waiting draft, and its person is the one left to draft for", async () => {
        activePage = adminPage;
        const main = adminPage.locator("main");
        const card = main.locator("article").filter({ hasText: cleo.displayName }).first();
        await card.waitFor({ timeout: WAIT_MS });
        // The seeded words, with Cleo's first name put back where they say "the fellow".
        assert.match(await card.getByRole("textbox", { name: "Draft note" }).inputValue(), new RegExp(`^${escapeRegExp(cleo.first)}\\b`));
        const [response] = await Promise.all([
          responseTo(adminPage, `/weeks/w03/notes/${cleo.uid}`, "DELETE"),
          card.getByRole("button", { name: WORDS.discard, exact: true }).click(),
        ]);
        await okBody(response, "Discarding the draft");
        // The page drawn again: no card of Cleo's, and Cleo the one person a press would draft for.
        await waitFor("Cleo's card to leave the page", async () => (await main.locator("article").filter({ hasText: cleo.displayName }).count()) === 0);
        await main.getByText(WORDS.pressLineOne, { exact: true }).waitFor({ timeout: WAIT_MS });
        const drafts = await fixtureQuery("courseNoteDrafts").where("runId", "==", state.runId).get();
        assert.equal(drafts.size, 0, "the discarded draft is still kept");
        const notes = await fixtureQuery("memberNotes").where("runId", "==", state.runId).get();
        assert.equal(notes.size, 1, "discarding a draft kept a note, or took the saved one away");
        assert.ok(!(await wordsIn(main)).includes(DRAFTED_TO_DISCARD.slice("The fellow".length)), "the discarded words are still on the page");
        assert.equal(pressed.length, pressedAfterReview, "discarding pressed something");
      });

      await step("the admin presses Draft this week's notes once, and a draft comes back for the one person without one", async () => {
        activePage = adminPage;
        const main = adminPage.locator("main");
        const asked = deployed ? 0 : (await fakeClaudeRequests()).length;
        const answered = responseTo(adminPage, "/weeks/w03/notes/draft", "POST", CLAUDE_WAIT_MS);
        await main.getByRole("button", { name: WORDS.draftNotes, exact: true }).click();
        const answer = await answered;
        const request = answer.request().postDataJSON();
        assert.deepEqual(request, { uid: cleo.uid }, "the press drafted for somebody else, or asked for more");
        const card = main.locator("article").filter({ hasText: cleo.displayName }).first();
        if (!deployed) {
          assert.equal(answer.status(), 200, `the fake Claude's draft answered ${answer.status()}`);
          await card.waitFor({ timeout: WAIT_MS });
          // The fake's draft, with Cleo's first name where it wrote "the fellow".
          const expected = FAKE_CLAUDE_WORDS.note.replace(/\bThe fellow\b/g, cleo.first).replace(/\bthe fellow\b/g, cleo.first);
          assert.equal(await card.getByRole("textbox", { name: "Draft note" }).inputValue(), expected, "the box does not hold the fake's draft with Cleo's name put back");
          assert.ok((await wordsIn(card)).includes(WORDS.builtOnlyFrom), "the new draft does not say what it was built from");
          // Asked once, by the note's own ask, with nobody's name or address in it.
          const sent = (await fakeClaudeRequests()).slice(asked);
          assert.deepEqual(sent.map((each) => each.caller), ["coursework-note-draft"], "the press asked the fake something else, or more than once");
          for (const person of [ada, ben, cleo, fern]) {
            for (const words of namesOf(person)) assert.ok(words && !sent[0].message.includes(words), `what was sent to Claude carries ${words}`);
          }
          const drafts = await fixtureQuery("courseNoteDrafts").where("runId", "==", state.runId).get();
          assert.deepEqual(drafts.docs.map((doc) => doc.data().uid), [cleo.uid], "the press kept a draft for somebody else, or more than one");
        } else if (answer.status() === 200) {
          await card.waitFor({ timeout: WAIT_MS });
          console.log("[course-hub-week-review-spec] Draft this week's notes: a draft came back.");
        } else {
          const alert = flat((await main.getByRole("alert").first().textContent()) ?? "");
          assert.ok(CLAUDE_REASONS.some((reason) => alert.includes(reason)), `the draft was refused in words the site does not say: ${alert}`);
          console.log(`[course-hub-week-review-spec] Draft this week's notes: answered ${answer.status()} with the reason "${alert}".`);
        }
        const notes = await fixtureQuery("memberNotes").where("runId", "==", state.runId).get();
        assert.equal(notes.size, 1, "drafting kept a note before anybody pressed Save");
      });

      await step("next term's page shows the person the saved note suggests for facilitating", async () => {
        activePage = adminPage;
        await adminPage.goto(`${origin}/admin/admissions/forms/${enc(state.formId)}/next-term`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("heading", { name: WORDS.nextTermTitle }).first().waitFor({ timeout: WAIT_MS });
        const main = adminPage.locator("main");
        assert.ok((await wordsIn(main)).includes(WORDS.nextTermChip), "the page does not say who sees it");
        // Facilitating is the first tab, and its count is the one person suggested for it.
        const tab = main.getByRole("group", { name: "Who they are suggested for" }).getByRole("button", { name: new RegExp(`^${WORDS.facilitating}\\s*1$`) });
        await tab.waitFor({ timeout: WAIT_MS });
        assert.equal(await tab.getAttribute("aria-pressed"), "true", "Facilitating is not the tab shown");
        const table = main.getByRole("region", { name: WORDS.nextTermCaption });
        const row = table.getByRole("row").filter({ hasText: ada.displayName });
        await row.waitFor({ timeout: WAIT_MS });
        const said = await wordsIn(row);
        assert.ok(said.includes("Week 3"), `Ada's row does not say which week suggested her: ${said}`);
        assert.ok(said.includes(state.programmeName) && said.includes(groupA.name), `Ada's row does not say where she sits: ${said}`);
        // Only Ada: the saved note is the term's one suggestion, and nobody else is listed.
        assert.equal(await table.getByRole("row").filter({ hasText: ben.displayName }).count(), 0, "somebody nobody suggested is listed");
        assert.equal(await table.getByRole("row").filter({ hasText: cleo.displayName }).count(), 0, "somebody nobody suggested is listed");
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
