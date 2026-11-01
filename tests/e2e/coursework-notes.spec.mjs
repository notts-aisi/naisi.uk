/**
 * Notes the team keeps about a person, and Claude's draft of one (privacy v13
 * and v15), end to end, in a real browser.
 *
 * The term three weeks in (scripts/e2e-fixtures/coursework-notes.mjs, on
 * scripts/e2e-fixtures/worlds/course-hub-term.mjs at "week-three"), with
 * week 3 written as blocks, Ada's reflection to it written after she agreed
 * to privacy v13, and a note about Ada written before she agreed -> the admin
 * approves Ada -> her profile shows the notes the team keeps, says its rule
 * in one line and marks the earlier note, which only admins read -> the admin
 * adds a note, choosing who reads it, changes its words and deletes it, and
 * the database agrees each time -> keeps one for the programme's leads with a
 * suggestion for next term, then keeps it to admins -> keeps one ->
 * meets Claude's draft: in local mode, where the site has no key, the calm
 * sentence that says so; against a deployed target with a key, one press,
 * answered with a draft or one of the site's reasons, never Claude's words
 * asserted -> opens Ada's application, where only the note written after she
 * agreed shows, with its rule and the count of the earlier one -> names the
 * running run on the programme's Settings tab -> reads, under the Coursework
 * tab, Claude's best answers to week 3 (an admin's alone since privacy v15,
 * and the panel says so) and Pangram's count before any press -> opens Ada's
 * coursework page, where
 * the column beside her weeks holds the notes written from this run with the
 * earlier one held back, Claude's draft from this run, and Pangram with
 * nothing of hers to send. Nothing on the tab or her page is pressed: neither
 * Claude nor Pangram is sent a word by those steps.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec coursework-notes
 *
 * It reads no mail: every fixture address is suppressed and a note sends
 * nothing, so it does not declare `requiresCaughtMail`.
 *
 * ## The words it holds the pages to
 *
 * Restated from src/lib/memberNotes/words.ts and
 * src/lib/courses/coursework/claudeWords.ts, with their apostrophes. A
 * change to one of them changes this file in the same pull request.
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
import { EARLIER_NOTE, RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/coursework-notes.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/**
 * How long Claude's draft may take: `MAX_CALL_MS` in src/lib/ai/claude.ts is
 * 240 seconds and the route may run for 290, so a minute over that.
 */
const CLAUDE_WAIT_MS = 300_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** The words the pages say, restated from src/lib/memberNotes/words.ts. */
const WORDS = {
  ruleProfile:
    "Every note is here. One written before they agreed to version 13 of the privacy policy is marked: use it only within the programme it came from.",
  ruleApplication: "Only notes written after they agreed to version 13 of the privacy policy are shown beside an application.",
  beforeNoProgramme:
    "Written before they agreed to version 13 of the privacy policy: never use it when considering them for something else.",
  hiddenOne: "1 earlier note isn’t shown here: it was written before they agreed, so it stays with its own programme.",
  claudeNotSetUp: "Claude isn’t set up on this site yet.",
  drafted: "Claude’s draft. Change anything you like; nothing is kept until you press Save note.",
  audienceAdmins: "Admins only",
  audienceLeads: "Admins and the programme’s leads",
  staysWithAdmins: "Written before they agreed to version 15 of the privacy policy, so only admins read it.",
  suggestFacilitating: "Facilitating",
  suggestedFacilitating: "Suggested for next term: facilitating.",
  add: "Add a note",
  save: "Save note",
  edit: "Edit",
  remove: "Delete",
  draft: "Draft a note with Claude",
  cancel: "Cancel",
  ruleRun: "Notes written after they agreed to version 13 of the privacy policy, and earlier notes written from this programme.",
  hiddenOnRunOne: "1 earlier note isn’t shown here: it wasn’t written from this programme.",
  bestOneSendable: "1 answer can be sent.",
  bestWhoSees: "Admins only",
  pangramNotSetUp: "Pangram isn’t set up on this site yet.",
  pangramNobodyThisWeek: "Nobody’s answers this week can be sent to Pangram.",
  pangramTooShortOne: "1 answer is under 50 words and isn’t sent.",
};

/**
 * Every reason the site may answer a draft with instead of one (the draft
 * route's in src/lib/memberNotes/words.ts and the door's in src/lib/ai/claude.ts).
 * Against a live model any of them is a calm answer; the words Claude writes
 * are never asserted.
 */
const DRAFT_REASONS = [
  "Claude isn’t set up on this site yet.",
  "Claude took too long to answer. Try again.",
  "Claude refused this site’s key. Check the key on the Claude Platform.",
  "Claude is busy or this month’s spending limit is used up. Try again shortly.",
  "Claude couldn’t answer just now. Try again.",
  "Claude couldn’t be reached. Try again.",
  "Claude declined to assess this one. Read it yourself.",
  "Claude’s answer was cut short. Try again.",
  "Claude’s answer couldn’t be read. Try again.",
  "Claude couldn’t draft a note just now. Try again.",
];

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
    ? `No coursework notes term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Notes are an admin's, and this harness cannot create an admin."
      : null;

let skipReasonFor = () => null;

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

/** The notes about `uid`, as stored. */
async function storedNotes(uid) {
  const snap = await fixtureQuery("memberNotes").where("uid", "==", uid).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

test(
  "notes admins keep about a person: kept on the profile, and only what came after the agreement beside an application",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const deployed = origin !== HARNESS_LOCAL_ORIGIN;

    const ada = state.people[0];
    assert.ok(ada?.uid, "the term has nobody to keep notes about");
    const profileUrl = `${origin}/admin/members/${enc(ada.uid)}`;
    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const applicationUrl = `${formBase}/applications/${enc(ada.uid)}`;

    const { browser, context, page } = await openBrowser();
    const recorder = createStepRecorder({
      t,
      page,
      markerPath: MARKER,
      artifactsDir: ARTIFACTS_DIR,
      skipReasonFor: (name) => skipReasonFor(name),
    });
    const step = (name, fn) => recorder.step(name, fn);
    if (!(await stubRecaptchaOnLoopback(page, origin))) {
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);
    }

    /** The notes on a page: the section `PersonNotes` draws for Ada. */
    const notes = () => page.locator(`section[aria-labelledby="notes-${ada.uid}"]`);
    const responseTo = (suffix, method, timeout = WAIT_MS) =>
      page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout });
    const notesPath = `/api/admin/members/${ada.uid}/notes`;

    /** The one note open for changing: its words are in a box then, so it is found by the box, not by them. */
    const openEdit = () => notes().locator('textarea[id^="edit-"]').locator("xpath=ancestor::li[1]");

    /** Tick a box or choose a round one: the row's label is what the pointer presses, the input under it is out of sight. */
    async function press(control, what) {
      await control.locator("xpath=ancestor::label[1]").click();
      await waitFor(`${what} to be ticked`, async () => control.isChecked());
    }

    async function addNote(text, { audience = WORDS.audienceAdmins, suggest = [] } = {}) {
      await notes().getByRole("button", { name: WORDS.add }).click();
      await notes().locator(`#new-note-${ada.uid}`).fill(text);
      // Nothing is chosen for the admin: Save waits for who reads it.
      assert.equal(await notes().getByRole("button", { name: WORDS.save }).isDisabled(), true, "a note can be saved with nobody chosen to read it");
      await press(notes().getByRole("radio", { name: audience }), `who reads it: ${audience}`);
      for (const box of suggest) await press(notes().getByRole("checkbox", { name: box, exact: true }), `the suggestion ${box}`);
      const saved = responseTo(notesPath, "POST");
      await notes().getByRole("button", { name: WORDS.save }).click();
      const answer = await saved;
      assert.equal(answer.status(), 200, `keeping a note answered ${answer.status()}`);
      await notes().getByText(text, { exact: true }).waitFor({ timeout: WAIT_MS });
      return (await answer.json()).id;
    }

    try {
      await step("the admin approves the account the notes are about", async () => {
        await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
        await approvePendingApplicant(page, origin, { email: ada.email });
        await waitFor(`${ada.first}'s account to say member`, async () => (await readUserDoc(ada.uid))?.role === "member");
      });

      await step(
        "the profile shows the notes the team keeps, with its rule, and marks the note written before the agreement as read by admins only",
        async () => {
          await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
          await notes().getByText(WORDS.ruleProfile, { exact: true }).waitFor({ timeout: WAIT_MS });
          await notes().getByText(EARLIER_NOTE, { exact: true }).waitFor({ timeout: WAIT_MS });
          const earlier = notes().locator("li").filter({ hasText: EARLIER_NOTE });
          assert.ok((await textOf(earlier)).includes(WORDS.beforeNoProgramme), "the earlier note is not marked as written before the agreement");
          assert.ok((await textOf(earlier)).includes(WORDS.audienceAdmins), "the earlier note does not say only admins read it");
          // Written before Ada agreed to privacy v15, it can never be kept for leads: its form says so and offers no choice.
          await earlier.getByRole("button", { name: WORDS.edit }).click();
          const form = openEdit();
          await form.getByText(WORDS.staysWithAdmins, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await form.getByRole("radio").count(), 0, "a note written before the agreement offers a choice of who reads it");
          await form.getByRole("button", { name: WORDS.cancel }).click();
        },
      );

      let keptId = null;
      await step("the admin adds a note, changes its words and deletes it, and the record agrees each time", async () => {
        const id = await addNote("E2E note: asks good questions in the session.");
        let stored = (await storedNotes(ada.uid)).find((note) => note.id === id);
        assert.equal(stored?.authorUid, state.adminUid, "the note does not name the admin who kept it");
        assert.equal(stored?.draftedByClaude, false);

        const row = notes().locator("li").filter({ hasText: "E2E note: asks good questions in the session." });
        await row.getByRole("button", { name: WORDS.edit }).click();
        await notes().locator(`#edit-${id}`).fill("E2E note: asks the best questions in the session.");
        const changed = responseTo(`${notesPath}/${id}`, "PATCH");
        await notes().getByRole("button", { name: WORDS.save }).click();
        assert.equal((await changed).status(), 200);
        await notes().getByText("E2E note: asks the best questions in the session.", { exact: true }).waitFor({ timeout: WAIT_MS });
        stored = (await storedNotes(ada.uid)).find((note) => note.id === id);
        assert.equal(stored?.text, "E2E note: asks the best questions in the session.");

        page.once("dialog", (dialog) => void dialog.accept());
        const removed = responseTo(`${notesPath}/${id}`, "DELETE");
        await notes()
          .locator("li")
          .filter({ hasText: "E2E note: asks the best questions in the session." })
          .getByRole("button", { name: WORDS.remove })
          .click();
        assert.equal((await removed).status(), 200);
        await waitFor("the deleted note to leave the page", async () => (await notes().getByText("E2E note: asks the best questions").count()) === 0);
        assert.equal((await storedNotes(ada.uid)).some((note) => note.id === id), false, "the deleted note is still stored");
      });

      await step(
        "the admin keeps a note for the programme's leads with a suggestion for next term, then keeps it to admins, and the record agrees each time",
        async () => {
          const text = "E2E note for the leads: explains the reading to others.";
          const id = await addNote(text, { audience: WORDS.audienceLeads, suggest: [WORDS.suggestFacilitating] });
          let stored = (await storedNotes(ada.uid)).find((note) => note.id === id);
          assert.equal(stored?.audience, "leads", "the note is not kept for the programme's leads");
          assert.deepEqual(stored?.suggest, ["facilitating"], "the note does not keep its suggestion");
          const row = notes().locator("li").filter({ hasText: text });
          await row.getByText(WORDS.audienceLeads, { exact: true }).waitFor({ timeout: WAIT_MS });
          await row.getByText(WORDS.suggestedFacilitating, { exact: true }).waitFor({ timeout: WAIT_MS });

          // Who reads it changes later, and nothing else does.
          await row.getByRole("button", { name: WORDS.edit }).click();
          const form = openEdit();
          await press(form.getByRole("radio", { name: WORDS.audienceAdmins }), "who reads it: admins only");
          const changed = responseTo(`${notesPath}/${id}`, "PATCH");
          await form.getByRole("button", { name: WORDS.save }).click();
          assert.equal((await changed).status(), 200);
          await waitFor("the note to say only admins read it", async () => (await textOf(row)).includes(WORDS.audienceAdmins));
          stored = (await storedNotes(ada.uid)).find((note) => note.id === id);
          assert.equal(stored?.audience, "admins", "the note is still kept for the programme's leads");
          assert.equal(stored?.text, text, "changing who reads a note changed its words");
          assert.deepEqual(stored?.suggest, ["facilitating"], "changing who reads a note lost its suggestion");

          // Taken away again, so the steps after this one read the record as they always have.
          page.once("dialog", (dialog) => void dialog.accept());
          const removed = responseTo(`${notesPath}/${id}`, "DELETE");
          await row.getByRole("button", { name: WORDS.remove }).click();
          assert.equal((await removed).status(), 200);
          await waitFor("the note to leave the page", async () => (await notes().getByText(text).count()) === 0);
        },
      );

      await step("the admin keeps a note for the application screen", async () => {
        keptId = await addNote("E2E note kept: would make a good facilitator.");
        const all = await storedNotes(ada.uid);
        assert.equal(all.length, 2, `Ada has ${all.length} notes, not the earlier one and the one kept`);
      });

      await step("Claude's draft: the calm sentence where Claude is not set up, or one press answered with a draft or a reason", async () => {
        if (!deployed) {
          await notes().getByText(WORDS.claudeNotSetUp, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await notes().getByRole("button", { name: WORDS.draft }).count(), 0, "a draft button with no key behind it");
          return;
        }
        const before = (await storedNotes(ada.uid)).length;
        const answered = responseTo(`${notesPath}/draft`, "POST", CLAUDE_WAIT_MS);
        await notes().getByRole("button", { name: WORDS.draft }).click();
        const answer = await answered;
        if (answer.status() === 200) {
          await notes().getByText(WORDS.drafted, { exact: true }).waitFor({ timeout: WAIT_MS });
          const drafted = await notes().locator(`#new-note-${ada.uid}`).inputValue();
          assert.ok(drafted.trim().length > 0, "a draft came back and the box is empty");
          // Which way it went is said in the log, never the draft's words: a reason passes the step too.
          console.log(`[coursework-notes-spec] Claude's draft: a draft came back (${drafted.trim().split(/\s+/).length} words).`);
          await notes().getByRole("button", { name: WORDS.cancel }).click();
        } else {
          const alert = await textOf(notes().getByRole("alert"));
          assert.ok(DRAFT_REASONS.some((reason) => alert.includes(reason)), `the draft was refused in words the site does not say: ${alert}`);
          console.log(`[coursework-notes-spec] Claude's draft: answered ${answer.status()} with the reason "${alert}".`);
        }
        assert.equal((await storedNotes(ada.uid)).length, before, "drafting kept a note before anybody pressed Save");
      });

      await step("beside the application only the note written after the agreement shows, with its rule and the count of earlier notes", async () => {
        await page.goto(applicationUrl, { waitUntil: "domcontentloaded" });
        await notes().getByText(WORDS.ruleApplication, { exact: true }).waitFor({ timeout: WAIT_MS });
        await notes().getByText("E2E note kept: would make a good facilitator.", { exact: true }).waitFor({ timeout: WAIT_MS });
        await notes().getByText(WORDS.hiddenOne, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await notes().getByText(EARLIER_NOTE).count(), 0, "a note written before the agreement shows beside the application");
        assert.ok(keptId, "no note was kept");
      });

      await step("the admin names the running course run on the programme's Settings tab", async () => {
        await page.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
        const panel = page.getByRole("region", { name: "Course run" });
        await panel.waitFor({ timeout: WAIT_MS });
        const runBox = panel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [response] = await Promise.all([
          responseTo(`/programmes/${state.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${state.runLabel} · Running` }),
        ]);
        const body = await response.json().catch(() => null);
        assert.ok(response.ok(), `naming the run answered ${response.status()}: ${JSON.stringify(body)}`);
        assert.equal(body.changed, true, "naming the run changed nothing");
        assert.equal(body.panel?.runId, state.runId, "the panel names another run");
      });

      await step(
        "under the Coursework tab, Claude's best answers to week 3, an admin's alone, and Pangram's count before any press, with nothing pressed",
        async () => {
          const bestRead = responseTo(`/programmes/${state.programmeId}/coursework/best-answers`, "GET");
          const pangramRead = responseTo(`/programmes/${state.programmeId}/coursework/pangram`, "GET");
          await page.goto(`${formBase}/coursework`, { waitUntil: "domcontentloaded" });
          // Week 3 is the run's one week written as blocks, and the one Ada wrote in.
          await page.getByRole("heading", { level: 2, name: /^Week 3\b/ }).waitFor({ timeout: WAIT_MS });
          assert.equal((await bestRead).status(), 200, "reading Claude's best answers was refused");
          assert.equal((await pangramRead).status(), 200, "reading Pangram's count was refused");

          // In local mode the site has no key; against a target with one, Ada's answer is the one that may be sent.
          const best = page.locator('section[aria-label="Best answers"]');
          const bestSays = deployed ? [WORDS.claudeNotSetUp, WORDS.bestOneSendable] : [WORDS.claudeNotSetUp];
          await waitFor("the best answers panel to say what Claude may be sent", async () => {
            const text = await textOf(best);
            return bestSays.some((words) => text.includes(words));
          });
          // Privacy v15: what Claude returns is seen by admins only, and the panel says who sees it.
          await best.getByText(WORDS.bestWhoSees, { exact: true }).waitFor({ timeout: WAIT_MS });

          // Ada's one answer is under 50 words, so Pangram has nobody to check and no button.
          const pangram = page.locator('section[aria-label="Pangram"]');
          const pangramSays = deployed ? [WORDS.pangramNotSetUp, WORDS.pangramNobodyThisWeek] : [WORDS.pangramNotSetUp];
          await waitFor("Pangram's panel to say who it would check", async () => {
            const text = await textOf(pangram);
            return pangramSays.some((words) => text.includes(words));
          });
          assert.equal(await pangram.getByRole("button").count(), 0, "a Pangram button with nothing of anybody's to send");
        },
      );

      await step(
        "beside Ada's weeks on her coursework page: the notes written from this run, Claude's draft from it, and Pangram with nothing of hers to send",
        async () => {
          const pangramRead = responseTo(`/coursework/${ada.uid}/pangram`, "GET");
          await page.goto(`${formBase}/coursework/${enc(ada.uid)}`, { waitUntil: "domcontentloaded" });
          await notes().getByText(WORDS.ruleRun, { exact: true }).waitFor({ timeout: WAIT_MS });
          await notes().getByText("E2E note kept: would make a good facilitator.", { exact: true }).waitFor({ timeout: WAIT_MS });
          await notes().getByText(WORDS.hiddenOnRunOne, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await notes().getByText(EARLIER_NOTE).count(), 0, "a note written before the agreement from no programme shows on the programme's page");
          if (!deployed) {
            await notes().getByText(WORDS.claudeNotSetUp, { exact: true }).waitFor({ timeout: WAIT_MS });
            assert.equal(await notes().getByRole("button", { name: WORDS.draft }).count(), 0, "a draft button with no key behind it");
          } else {
            await waitFor("Claude's draft from this run to be offered, or the sentence that says it cannot be", async () =>
              (await notes().getByRole("button", { name: WORDS.draft }).count()) > 0 || (await notes().getByText(WORDS.claudeNotSetUp, { exact: true }).count()) > 0,
            );
          }

          assert.equal((await pangramRead).status(), 200, "reading what Pangram found was refused");
          const pangram = page.locator('section[aria-label="Pangram"]');
          await pangram.getByText(WORDS.pangramTooShortOne, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await pangram.getByRole("button").count(), 0, "a Pangram button with nothing of Ada's to send");
        },
      );
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
