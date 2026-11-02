/**
 * END-TO-END: the course hub's work loop (privacy v15, "Feedback" and
 * "Ratings for the team"), in a real browser.
 *
 * The term at its coursework point (`scripts/e2e-fixtures/course-hub-work-loop.mjs`):
 * three weeks into a running run whose weeks are written as blocks, Ada and
 * Ben in Group A with week 3 submitted and a written answer each, Cleo in
 * Group B and Dan in no group. The admin approves Fern, Ada and Ben, names the
 * run on the programme's Settings tab and appoints Fern to Group A. Then:
 *
 *  - Fern, signed in, opens Ada's answer from Feedback to write on Group A's
 *    page, reads it on its review page (which draws no rating for a
 *    facilitator), and saves feedback on it: the page says Ada reads it now
 *    and is emailed when an admin sends the batch, and nobody is emailed;
 *  - Fern saves feedback on Ben's answer, from the same page's list;
 *  - the admin, as the programme's lead, opens Ada's answer on its review
 *    page, rates it 8 of 10 with a comment for the team, and reads it under
 *    What the team said;
 *  - the programme's Overview lists both pieces under Feedback to send, with
 *    the press locked until a test; Send a test to me reaches the admin, in
 *    Mailpit, marked as a test, and unlocks the press;
 *  - Send 2 emails sends one email to Ada and one to Ben, each saying who left
 *    feedback and on what with a button to the week's Feedback and none of the
 *    feedback's words, and nobody else in the term is emailed;
 *  - Ada, signed in, follows her email's button to her week 3 page, reads
 *    Fern's feedback there signed as her facilitator, and finds none of the
 *    rating: not its number, not its comment, not its headings;
 *  - the old feedback page sends her to the same week's Feedback.
 *
 * The lead's own rating (saved as the lead's, and read by an admin) is never
 * driven here: the harness signs in no lead who is not an admin, so the
 * admin stands in for the lead and rates as an admin.
 * `tests/course-work-ratings.test.mjs` and the persona battery hold the lead.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-work-loop
 *
 * It reads its own mail, the test to the admin included, so it runs only
 * against the server the harness starts with its mail caught by Mailpit.
 *
 * ## The words it holds the pages and the emails to
 *
 * Restated from src/lib/courses/feedback/words.ts and
 * src/lib/courses/workRatings/words.ts, with their apostrophes. A change to
 * one of them changes this file in the same pull request.
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
import { getMessage, hrefUrls, messagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
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
  RECAPTCHA_SKIP_REASON,
  fixtureQuery,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { BEN_ANSWER, LOOP_WEEK, RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-work-loop.mjs";
import { COURSEWORK } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** What Fern writes on each answer, and what the admin says for the team. Made up. */
const FEEDBACK = {
  ada: "Good use of who pays for the light. Say what happens when the harbour board cannot charge a ship.",
  ben: "A clear answer. Name one lighthouse the port does not use, and say who should keep that one lit.",
};
const RATING = 8;
const RATING_COMMENT = "Argues from the reading and answers the question asked. Worth asking about facilitating.";

/** The words the pages and the emails say, restated from the two words files. */
const WORDS = {
  // The review page: feedback.
  feedbackToWrite: "Feedback to write",
  yourFeedback: "Your feedback",
  comment: "Comment",
  saveFeedback: "Save feedback",
  saved: (first) =>
    `Saved. ${first} can read it on the week ${LOOP_WEEK} page now. ${first} will be emailed when an admin sends the feedback emails.`,
  notEmailedYet: "Not emailed yet",
  answerHead: (first) => `${first}’s answer`,
  // The review page: ratings, an admin's and the lead's alone.
  ratingForTheTeam: "Rating for the team",
  whatTheTeamSaid: "What the team said",
  whoReadsRatings: "Admins and the programme’s lead only",
  commentForTheTeam: "Comment for the team",
  saveRating: "Save rating",
  ratingSaved: "Saved. Only admins and the programme’s lead see it.",
  notRatedYet: "Not rated yet",
  neverShown: (first) => `Never shown to ${first}.`,
  outOfTen: (n) => `${n} of 10`,
  admin: "Admin",
  // The Overview's card.
  feedbackToSend: "Feedback to send",
  waiting: "2 pieces of feedback for 2 people aren’t emailed yet.",
  testFirst: "Send a test to yourself first. A test unlocks this for a day.",
  sendTest: "Send a test to me",
  sendEmails: "Send 2 emails",
  onTheAnswer: `Week ${LOOP_WEEK} written answer`,
  tick: new RegExp(`^Email .+ about this feedback: Week ${LOOP_WEEK} written answer$`),
  testSaid: (subject) => `A test is on its way to you: “${subject}”.`,
  sent: "2 emails sent.",
  allEmailed: /^Every piece of feedback has been emailed\. The last send was \w{3} \d{1,2} \w{3}\.$/,
  // The email.
  subject: (programme) => `New feedback on your ${programme} work`,
  testSubject: (programme) => `[TEST] New feedback on your ${programme} work`,
  greeting: (first) => `Hi ${first},`,
  lead: (writer) => `${writer} has left feedback on your week ${LOOP_WEEK} written answer.`,
  button: "Read your feedback",
  // The person's week page.
  feedbackHeading: "Feedback",
  fromFacilitator: (writer) => `Feedback from ${writer}`,
  yourFacilitator: "Your facilitator",
};

let skipReasonFor = () => null;

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
        ? "This journey reads its own mail, the test of the feedback batch to the admin included, so it " +
          "runs only against the server the harness starts with its mail caught by Mailpit."
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

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * What an email's HTML says, as one line of words: block tags become a space,
 * inline ones vanish, and entities are decoded. (T1's, restated.)
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

/** One email, read out of Mailpit whole. */
async function readEmail(summary) {
  const message = await getMessage(summary.ID);
  return {
    subject: message.Subject ?? summary.Subject ?? "",
    words: wordsOf(message.HTML),
    links: hrefUrls(message.HTML ?? ""),
    text: message.Text ?? "",
  };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: the work loop, from a facilitator's feedback and a rating for the team to the batch of emails and the person's week page",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const fern = state.facilitator;
    const personOf = (key) => state.people.find((person) => person.key === key);
    const groupOf = (key) => state.groups.find((group) => group.key === key);
    const [ada, ben, cleo, dan] = ["ada", "ben", "cleo", "dan"].map(personOf);
    for (const [key, person] of Object.entries({ ada, ben, cleo, dan, fern })) assert.ok(person, `the term has no ${key}`);
    const groupA = groupOf("A");
    assert.ok(groupA, "the term has no Group A");
    const adaAnswer = COURSEWORK.coursework.answers.find((entry) => entry.person === "ada")?.text;
    assert.ok(adaAnswer, "the term wrote Ada no answer");

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const runBase = `${origin}/learn/${enc(state.runId)}`;
    const groupPage = `${runBase}/group/${enc(groupA.id)}`;
    const weekPagePath = `/learn/${state.runId}/weeks/${LOOP_WEEK}`;
    const subject = WORDS.subject(state.programmeName);
    const testSubject = WORDS.testSubject(state.programmeName);

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: facilitatorContext, page: facilitatorPage } = await newIdentityPage(browser);
    const { context: memberContext, page: memberPage } = await newIdentityPage(browser);

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
    await stubRecaptchaOnLoopback(memberPage, origin);
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

    /** The run's feedback, as the database holds it, by whose week it is on. */
    async function piecesFor(uid) {
      const snap = await fixtureQuery("courseFeedback").where("runId", "==", state.runId).get();
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((piece) => piece.uid === uid);
    }

    /** The emails one address was sent with `wanted` as their subject, read whole. */
    async function mailWithSubject(address, wanted) {
      const found = [];
      for (const summary of await messagesTo(address)) {
        if (String(summary.Subject ?? "") === wanted) found.push(await readEmail(summary));
      }
      return found;
    }

    /** Fern's review page's side column: the feedback writer, the cards, and nothing of a rating. */
    async function saveFeedbackAs(pg, person, words) {
      const writer = pg.getByRole("region", { name: WORDS.yourFeedback });
      await writer.waitFor({ timeout: WAIT_MS });
      const box = writer.getByRole("textbox", { name: WORDS.comment });
      // Nothing takes a word until React has the page.
      await waitFor("the feedback box to take words", async () => box.isEnabled());
      await box.fill(words);
      const [response] = await Promise.all([
        responseTo(pg, `/runs/${state.runId}/feedback`, "POST"),
        writer.getByRole("button", { name: WORDS.saveFeedback, exact: true }).click(),
      ]);
      const body = await okBody(response, `Saving feedback on ${person.first}'s answer`);
      assert.equal(body.ok, true);
      await writer.getByRole("status").filter({ hasText: WORDS.saved(person.first) }).waitFor({ timeout: WAIT_MS });
      // Drawn again from the server: the writer's own piece, its email still to go.
      await writer.getByText(new RegExp(`${escapeRegExp(WORDS.notEmailedYet)}$`)).waitFor({ timeout: WAIT_MS });
      const pieces = await piecesFor(person.uid);
      assert.equal(pieces.length, 1, `saving made no piece on ${person.first}'s week, or more than one`);
      const piece = pieces[0];
      assert.equal(piece.text, words, "the piece is not the words written");
      assert.equal(piece.byUid, fern.uid, "the piece is not signed by its writer");
      assert.equal(piece.byRole, "facilitator", "the group's facilitator did not write as the facilitator");
      assert.equal(piece.weekNumber, LOOP_WEEK);
      assert.equal(piece.on?.kind, "writtenAnswer", "the piece is not on the written answer");
      assert.equal(piece.emailedAt, null, "saving feedback emailed it");
      // Saving emails nobody: the person's mailbox holds no feedback email yet.
      assert.equal((await mailWithSubject(person.email, subject)).length, 0, `saving emailed ${person.first}`);
    }

    /** A facilitator's review page draws no rating at all. */
    async function assertNoRatingOn(pg, who) {
      const said = await wordsIn(pg.locator("main"));
      for (const words of [WORDS.ratingForTheTeam, WORDS.whatTheTeamSaid, WORDS.whoReadsRatings]) {
        assert.ok(!said.includes(words), `${who} is drawn "${words}"`);
      }
      assert.equal(await pg.getByRole("radio", { name: WORDS.outOfTen(RATING) }).count(), 0, `${who} is drawn a rating's choices`);
    }

    try {
      await step("the admin approves the facilitator and the two people whose answers get feedback", async () => {
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

      await step("the facilitator opens a submitted answer from Feedback to write and saves feedback on it, with no rating on the page", async () => {
        activePage = facilitatorPage;
        await signIn(facilitatorPage, fern);
        await facilitatorPage.goto(groupPage, { waitUntil: "domcontentloaded" });
        const queue = facilitatorPage.locator('section[aria-labelledby="group-review-queue"]');
        await queue.getByRole("heading", { name: WORDS.feedbackToWrite }).waitFor({ timeout: WAIT_MS });
        // Both submitted answers wait for feedback, Ada's and Ben's, and nobody else's.
        const writeLinks = queue.getByRole("link", { name: /^Write feedback: / });
        await writeLinks.first().waitFor({ timeout: WAIT_MS });
        const labels = (await writeLinks.evaluateAll((links) => links.map((link) => link.getAttribute("aria-label") ?? ""))).sort();
        assert.equal(labels.length, 2, `Feedback to write lists ${labels.length} answers: ${JSON.stringify(labels)}`);
        for (const person of [ada, ben]) {
          assert.ok(
            labels.some((label) => new RegExp(`^Write feedback: ${escapeRegExp(person.first)}\\b.*, week ${LOOP_WEEK}$`).test(label)),
            `Feedback to write does not list ${person.first}'s week ${LOOP_WEEK} answer: ${JSON.stringify(labels)}`,
          );
        }
        await queue.getByRole("link", { name: new RegExp(`^Write feedback: ${escapeRegExp(ada.first)}\\b`) }).click();
        await facilitatorPage.waitForURL((url) => url.pathname.endsWith(`/group/${groupA.id}/written`) && url.searchParams.get("person") === ada.uid, {
          timeout: WAIT_MS,
        });
        await facilitatorPage.getByRole("heading", { level: 2, name: WORDS.answerHead(ada.first) }).waitFor({ timeout: WAIT_MS });
        assert.ok((await wordsIn(facilitatorPage.locator("main"))).includes(adaAnswer), "the review page does not show Ada's answer");
        await assertNoRatingOn(facilitatorPage, "the facilitator");
        await saveFeedbackAs(facilitatorPage, ada, FEEDBACK.ada);
        await assertNoRatingOn(facilitatorPage, "the facilitator, after saving");
      });

      await step("the facilitator saves feedback on the second person's answer", async () => {
        activePage = facilitatorPage;
        const list = facilitatorPage.getByRole("region", { name: "Written answers" }).first();
        await list.locator(`a[href*="person=${enc(ben.uid)}"]`).first().click();
        await facilitatorPage.waitForURL((url) => url.searchParams.get("person") === ben.uid, { timeout: WAIT_MS });
        await facilitatorPage.getByRole("heading", { level: 2, name: WORDS.answerHead(ben.first) }).waitFor({ timeout: WAIT_MS });
        assert.ok((await wordsIn(facilitatorPage.locator("main"))).includes(BEN_ANSWER), "the review page does not show Ben's answer");
        await saveFeedbackAs(facilitatorPage, ben, FEEDBACK.ben);
        // Ada's piece is still the one, and on her week alone.
        assert.equal((await piecesFor(ada.uid)).length, 1, "Ben's feedback changed Ada's");
      });

      await step("the lead rates the first answer for the team on its review page, and an admin reads it under What the team said", async () => {
        activePage = adminPage;
        await adminPage.goto(`${groupPage}/written?week=${LOOP_WEEK}&person=${enc(ada.uid)}`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("heading", { level: 2, name: WORDS.answerHead(ada.first) }).waitFor({ timeout: WAIT_MS });
        // The facilitator's piece is there for the people running the group.
        assert.ok((await wordsIn(adminPage.locator("main"))).includes(FEEDBACK.ada), "the review page does not show Fern's feedback");

        const said = adminPage.getByRole("region", { name: WORDS.whatTheTeamSaid });
        await said.waitFor({ timeout: WAIT_MS });
        assert.ok((await wordsIn(said)).includes(WORDS.notRatedYet), "What the team said does not say the reader has not rated it yet");

        const card = adminPage.getByRole("region", { name: WORDS.ratingForTheTeam });
        const cardSays = await wordsIn(card);
        assert.ok(cardSays.includes(WORDS.whoReadsRatings), "the rating does not say who reads it");
        assert.ok(cardSays.includes(WORDS.neverShown(ada.first)), "the rating does not say Ada never sees it");
        const choice = card.getByRole("radio", { name: WORDS.outOfTen(RATING) });
        await waitFor("the rating's choices to take a press", async () => choice.isEnabled());
        await choice.check();
        await card.getByRole("textbox", { name: WORDS.commentForTheTeam }).fill(RATING_COMMENT);
        const [response] = await Promise.all([
          responseTo(adminPage, `/runs/${state.runId}/work-ratings`, "PUT"),
          card.getByRole("button", { name: WORDS.saveRating, exact: true }).click(),
        ]);
        const body = await okBody(response, "Saving the rating");
        assert.deepEqual(body, { ok: true }, "the rating's answer carries more than that it saved");
        await card.getByRole("status").filter({ hasText: WORDS.ratingSaved }).waitFor({ timeout: WAIT_MS });

        // Read back under What the team said, as the page draws it from the server.
        const row = said.getByRole("listitem").filter({ hasText: RATING_COMMENT });
        await row.waitFor({ timeout: WAIT_MS });
        const rowSays = await wordsIn(row);
        assert.ok(rowSays.includes(WORDS.outOfTen(RATING)), `the rating's row does not say ${WORDS.outOfTen(RATING)}: ${rowSays}`);
        assert.ok(rowSays.includes(WORDS.admin), `the rating's row does not say who rated it as: ${rowSays}`);
        assert.ok(!(await wordsIn(said)).includes(WORDS.notRatedYet), "What the team said still says the reader has not rated it");

        const ratings = await fixtureQuery("courseWorkRatings").where("runId", "==", state.runId).get();
        assert.equal(ratings.size, 1, "rating made no record, or more than one");
        const rating = ratings.docs[0].data();
        assert.equal(rating.uid, ada.uid);
        assert.equal(rating.weekNumber, LOOP_WEEK);
        assert.equal(rating.rating, RATING);
        assert.equal(rating.comment, RATING_COMMENT);
        assert.equal(rating.raterUid, state.adminUid, "the rating is not the admin's own");
        assert.equal(rating.raterRole, "admin", "an admin's rating is not recorded as an admin's");
        // A rating emails nobody: Ada's mailbox holds nothing about it.
        assert.equal((await mailWithSubject(ada.email, subject)).length, 0, "rating emailed Ada");
      });

      await step("Feedback to send lists both pieces, and the test of the batch reaches the admin", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/overview`, { waitUntil: "domcontentloaded" });
        const card = adminPage.locator('section[aria-labelledby="overview-feedback-to-send"]');
        await card.getByRole("heading", { name: WORDS.feedbackToSend }).waitFor({ timeout: WAIT_MS });
        const says = await wordsIn(card);
        assert.ok(says.includes(WORDS.waiting), `the card's line: ${says}`);
        assert.ok(says.includes(WORDS.testFirst), "the card does not say a test comes first");
        // One row each, every one ticked, on the answer, by Fern.
        const rows = card.locator("tbody tr");
        assert.equal(await rows.count(), 2, "the list is not one row for each piece");
        for (const person of [ada, ben]) {
          const row = rows.filter({ hasText: person.displayName });
          assert.equal(await row.count(), 1, `the list has no row, or more than one, for ${person.first}`);
          const rowSays = await wordsIn(row);
          for (const words of [groupA.name, WORDS.onTheAnswer, fern.first]) {
            assert.ok(rowSays.includes(words), `${person.first}'s row does not say "${words}": ${rowSays}`);
          }
          const tick = row.getByRole("checkbox", { name: WORDS.tick });
          assert.equal(await tick.count(), 1, `${person.first}'s row has no tick box named for the piece`);
          assert.equal(await tick.isChecked(), true, `${person.first}'s row starts unticked`);
        }
        // The email each person gets, as the card shows it, and the press locked until a test.
        const preview = card.getByRole("complementary", { name: "The email each person gets" });
        const previewSays = await wordsIn(preview);
        assert.ok(previewSays.includes(subject), `the preview's subject: ${previewSays}`);
        const send = card.getByRole("button", { name: WORDS.sendEmails, exact: true });
        assert.equal(await send.isDisabled(), true, "the batch can be sent before a test");

        const test = card.getByRole("button", { name: WORDS.sendTest, exact: true });
        await waitFor("Send a test to me to take a press", async () => test.isEnabled());
        const [response] = await Promise.all([responseTo(adminPage, `/runs/${state.runId}/feedback/send/test`, "POST"), test.click()]);
        const body = await okBody(response, "The test of the batch");
        assert.equal(body.delivery, "sent", "the test did not go to the admin");
        assert.equal(body.subject, testSubject);
        await card.getByRole("status").filter({ hasText: WORDS.testSaid(testSubject) }).waitFor({ timeout: WAIT_MS });

        // Mailpit holds it, in the admin's mailbox and nobody else's. Never printed.
        const tests = await waitFor("the test in the admin's mailbox", async () => {
          const found = await mailWithSubject(secrets.adminEmail, testSubject);
          return found.length > 0 ? found : null;
        });
        assert.equal(tests.length, 1, "the admin was sent more than one test");
        const [email] = tests;
        // The first person in the list, by name: Ada's email, as the admin reads it.
        assert.ok(email.words.includes(WORDS.lead(fern.first)), "the test does not say who left feedback and on what");
        assert.ok(email.words.includes(WORDS.button), "the test has no button to the feedback");
        assert.ok(
          email.links.some((link) => link === `${origin}${weekPagePath}#feedback`),
          "the test's button does not lead to the week's Feedback",
        );
        for (const person of [ada, ben, cleo, dan, fern]) {
          assert.equal((await mailWithSubject(person.email, testSubject)).length, 0, `the test went to ${person.first}`);
        }
        const tested = await fixtureQuery("courseFeedbackSends").where("runId", "==", state.runId).get();
        const testRows = tested.docs.map((doc) => doc.data()).filter((row) => row.kind === "test");
        assert.equal(testRows.length, 1, "the test left no record, or more than one");
        assert.equal(testRows[0].byUid, state.adminUid, "the test's record is not the presser's");
        // The test unlocked the press.
        await waitFor("Send 2 emails to take a press", async () => send.isEnabled());
      });

      await step("the batch sends one email per person, and nobody else is emailed", async () => {
        activePage = adminPage;
        const card = adminPage.locator('section[aria-labelledby="overview-feedback-to-send"]');
        const [response] = await Promise.all([
          responseTo(adminPage, `/runs/${state.runId}/feedback/send`, "POST"),
          card.getByRole("button", { name: WORDS.sendEmails, exact: true }).click(),
        ]);
        const body = await okBody(response, "The batch");
        assert.equal(body.report?.sent, 2, `the batch did not send two emails: ${JSON.stringify(body.report)}`);
        assert.deepEqual(body.said, [WORDS.sent]);
        await card.getByRole("status").filter({ hasText: WORDS.sent }).waitFor({ timeout: WAIT_MS });
        await card.getByText(WORDS.allEmailed).waitFor({ timeout: WAIT_MS });

        for (const person of [ada, ben]) {
          const emails = await waitFor(`${person.first}'s feedback email`, async () => {
            const found = await mailWithSubject(person.email, subject);
            return found.length > 0 ? found : null;
          });
          assert.equal(emails.length, 1, `${person.first} was sent more than one feedback email`);
          const [email] = emails;
          for (const words of [WORDS.greeting(person.first), WORDS.lead(fern.first), WORDS.button]) {
            assert.ok(email.words.includes(words), `${person.first}'s email does not say "${words}": ${email.words}`);
          }
          assert.ok(
            email.links.some((link) => link === `${origin}${weekPagePath}#feedback`),
            `${person.first}'s email does not lead to the week's Feedback`,
          );
          // The feedback stays on the site, and the rating is never anybody's email.
          for (const words of [...Object.values(FEEDBACK), RATING_COMMENT]) {
            assert.ok(!email.words.includes(words) && !email.text.includes(words), `${person.first}'s email carries words it must not`);
          }
          const pieces = await piecesFor(person.uid);
          assert.equal(pieces.length, 1);
          assert.ok(pieces[0].emailedAt, `${person.first}'s piece is not stamped as emailed`);
          assert.equal(pieces[0].emailDelivery, "sent");
          assert.equal(pieces[0].emailedByUid, state.adminUid, "the piece does not say who sent its email");
        }
        // Nobody else in the term had feedback, so nobody else is emailed.
        for (const person of [cleo, dan, fern]) {
          assert.equal((await mailWithSubject(person.email, subject)).length, 0, `the batch emailed ${person.first}`);
        }
        const sends = await fixtureQuery("courseFeedbackSends").where("runId", "==", state.runId).get();
        const sendRows = sends.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const presses = sendRows.filter((row) => row.kind === "send");
        assert.equal(presses.length, 1, "the batch left no record of its press, or more than one");
        assert.equal(presses[0].people, 2);
        assert.equal(presses[0].pieces, 2);
        assert.equal(presses[0].sent, 2);
        assert.equal(sendRows.filter((row) => row.kind === "press").length, 0, "the press still holds the run");
      });

      await step("the person follows the email to their week page and reads the feedback, and none of the rating", async () => {
        activePage = memberPage;
        const [email] = await mailWithSubject(ada.email, subject);
        const link = email.links.find((href) => href === `${origin}${weekPagePath}#feedback`);
        assert.ok(link, "Ada's email has no link to her week's Feedback");
        await signIn(memberPage, ada);
        await memberPage.goto(link, { waitUntil: "domcontentloaded" });
        const feedback = memberPage.locator("section#feedback");
        await feedback.getByRole("heading", { name: WORDS.feedbackHeading, exact: true }).waitFor({ timeout: WAIT_MS });
        const cards = feedback.getByRole("listitem");
        assert.equal(await cards.count(), 1, "Ada's week page does not show one piece of feedback");
        const says = await wordsIn(cards.first());
        assert.ok(says.includes(WORDS.fromFacilitator(fern.first)), `the piece is not signed as Fern's: ${says}`);
        assert.ok(says.includes(WORDS.yourFacilitator), `the piece does not say it is from Ada's facilitator: ${says}`);
        assert.ok(says.includes(FEEDBACK.ada), "the piece does not carry Fern's words");

        // None of the rating, and none of Ben's feedback, anywhere on the page.
        const page = await wordsIn(memberPage.locator("main"));
        for (const words of [RATING_COMMENT, WORDS.ratingForTheTeam, WORDS.whatTheTeamSaid, WORDS.whoReadsRatings, WORDS.outOfTen(RATING), FEEDBACK.ben]) {
          assert.ok(!page.includes(words), `Ada's week page says "${words}"`);
        }
        const html = await memberPage.content();
        assert.ok(!html.includes(RATING_COMMENT), "the rating's comment is in the page Ada is handed");
      });

      await step("the old feedback link lands on the week page's Feedback", async () => {
        activePage = memberPage;
        await memberPage.goto(`${runBase}/weeks/${LOOP_WEEK}/feedback`, { waitUntil: "domcontentloaded" });
        await memberPage.waitForURL((url) => url.pathname === weekPagePath && url.hash === "#feedback", { timeout: WAIT_MS });
        const feedback = memberPage.locator("section#feedback");
        await feedback.getByRole("heading", { name: WORDS.feedbackHeading, exact: true }).waitFor({ timeout: WAIT_MS });
        assert.ok((await wordsIn(feedback)).includes(FEEDBACK.ada), "the old link's page does not show Fern's feedback");
      });
    } finally {
      await memberContext.close().catch(() => {});
      await facilitatorContext.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
