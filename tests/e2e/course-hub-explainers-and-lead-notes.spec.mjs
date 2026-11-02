/**
 * END-TO-END: an explainer scheduled from a week's review, read on a
 * facilitator's ticket and cancelled, and the notes about a person a
 * programme's lead who is not an admin reads and keeps (privacy v15).
 *
 * The term at its coursework point (`scripts/e2e-fixtures/course-hub-explainers-and-lead-notes.mjs`):
 * three weeks into a running run, Ada and Ben in Group A, Cleo in Group B,
 * week 3's sessions over and week 4's days ahead, Gus waiting for approval
 * like every fixture account, and two notes about Ada from the run, one kept
 * for the programme's leads and one kept to admins. Then:
 *
 *  - the admin approves Fern and Gus, makes Gus SU-recognised committee on
 *    Gus's member page, names the running run and Gus as the programme's lead
 *    on its Settings tab, and appoints Fern to Group A: every grant made by
 *    the admin on the real pages, none by the fixture;
 *  - from week 3's review the admin schedules an explainer with a typed
 *    topic, given by Gus, at the start of Group A's next session: one record,
 *    one task for Gus, and the review lists it;
 *  - Fern, signed in, reads it on her next session's ticket on Home;
 *  - the admin cancels it from the review: the record is stamped cancelled
 *    and Gus's task closes;
 *  - Fern's ticket is clear of it;
 *  - Gus, signed in as the programme's lead, opens Ada's weeks on the
 *    Coursework tab and reads the note kept for leads and never the one kept
 *    to admins, with no count of what is not shown, no Claude and no Pangram;
 *  - Gus adds a note about Ada, changes its words and deletes it, and the
 *    record agrees each time; the admin's note offers Gus no change.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-explainers-and-lead-notes
 *
 * It reads no mail: every fixture address is suppressed, Gus's among them, so
 * the explainer's one email to Gus does not leave. Nothing here sends anything
 * to Claude or Pangram.
 *
 * ## The words it holds the pages to
 *
 * Restated from src/lib/courses/explainers/words.ts and
 * src/lib/memberNotes/words.ts, with their apostrophes. A change to one of
 * them changes this file in the same pull request.
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
  RECAPTCHA_SKIP_REASON,
  fixtureQuery,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import {
  NOTE_FOR_ADMINS,
  NOTE_FOR_LEADS,
  RECAPTCHA_DEPENDENT_STEPS,
  SPEC,
} from "../../scripts/e2e-fixtures/course-hub-explainers-and-lead-notes.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** The explainer's topic, as the admin types it, and how a sentence on a ticket says it. */
const TOPIC = "Reading a source against its funding";
const TOPIC_IN_A_SENTENCE = "reading a source against its funding";

/** The words the pages say, restated from src/lib/courses/explainers/words.ts and src/lib/memberNotes/words.ts. */
const WORDS = {
  committee: "Committee",
  recognisedSwitch: "SU-recognised committee",
  chooseLead: "Choose a lead",
  scheduleTitle: "Schedule an explainer",
  scheduleOne: "Schedule for 1 group",
  explainersNone: "None scheduled from this review yet.",
  startsWith: "Starts with an explainer",
  ticketLine: `10 minutes on ${TOPIC_IN_A_SENTENCE}, by `,
  ticketThen: "Then the week as planned.",
  scheduledFrom: "from the week 3 review.",
  cancel: `Cancel explainer: ${TOPIC}`,
  confirmYes: "Yes, cancel it",
  cancelled: "Cancelled: it’s off the session tickets, and the tasks are closed.",
  ruleLead: "The notes kept for admins and the programme’s leads. A note you add is kept for both, and only you and admins can change it.",
  leadsRead: "Admins and the programme’s leads read the notes you add.",
  audienceLeads: "Admins and the programme’s leads",
  you: "By you",
  add: "Add a note",
  save: "Save note",
  edit: "Edit",
  remove: "Delete",
  draft: "Draft a note with Claude",
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

/** The notes about `uid`, as stored. */
async function storedNotes(uid) {
  const snap = await fixtureQuery("memberNotes").where("uid", "==", uid).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: an explainer from a week's review on a facilitator's ticket, cancelled, and a lead's notes about a person",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const fern = state.facilitator;
    const gus = state.lead;
    const ada = state.people.find((person) => person.key === "ada");
    const groupA = state.groups.find((group) => group.key === "A");
    const groupB = state.groups.find((group) => group.key === "B");
    for (const [key, value] of Object.entries({ fern, gus, ada, groupA, groupB })) assert.ok(value, `the term has no ${key}`);

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const reviewUrl = `${formBase}/weeks/w03/review`;
    const notesPath = `/programmes/${state.programmeId}/people/${ada.uid}/notes`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: facilitatorContext, page: facilitatorPage } = await newIdentityPage(browser);
    const { context: leadContext, page: leadPage } = await newIdentityPage(browser);

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
    await stubRecaptchaOnLoopback(leadPage, origin);
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

    /** The explainers scheduled on the run, as stored. */
    const storedExplainers = async () =>
      (await fixtureQuery("courseExplainers").where("runId", "==", state.runId).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    /** Gus's explainer tasks, as stored. */
    const explainerTasks = async () =>
      (await fixtureQuery("tasks").where("source", "==", "explainer").where("sourceRef.cohortId", "==", state.runId).get()).docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

    /** Home for Fern, with the group's summary read: the ticket and what the ticket was drawn from. */
    async function fernsTicket() {
      const summary = responseTo(facilitatorPage, `/groups/${groupA.id}/summary`, "GET");
      await facilitatorPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
      const body = await okBody(await summary, "Reading the group's summary");
      const ticket = facilitatorPage.getByRole("region", { name: "Your next session", exact: true });
      await ticket.waitFor({ timeout: WAIT_MS });
      await ticket.getByText(groupA.name).first().waitFor({ timeout: WAIT_MS });
      return { ticket, body };
    }

    /** The notes about Ada beside her weeks, as Gus sees them. */
    const notes = () => leadPage.locator(`section[aria-labelledby="notes-${ada.uid}"]`);

    try {
      await step("the admin approves the facilitator and the account that will lead the programme", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [fern, gus]) {
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
        // The switch is offered once the role is committee; the input sits under its label, out of sight.
        const recognised = access.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(WORDS.recognisedSwitch)}`) });
        await recognised.waitFor({ state: "attached", timeout: WAIT_MS });
        assert.equal(await recognised.isChecked(), false, "a new committee member starts SU-recognised");
        await recognised.locator("xpath=ancestor::label[1]").click();
        await waitFor("Gus's account to say SU-recognised", async () => (await readUserDoc(gus.uid))?.suRecognised === true);
      });

      await step("the admin names the running course run and the programme's lead on the Settings tab", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
        const panel = adminPage.getByRole("region", { name: "Course run" });
        await panel.waitFor({ timeout: WAIT_MS });
        const runBox = panel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [runResponse] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${state.runLabel} · Running` }),
        ]);
        const run = await okBody(runResponse, "Naming the run");
        assert.equal(run.panel?.runId, state.runId, "the panel names another run");

        // The lead is chosen from admins and SU-recognised committee, Gus among them now.
        await adminPage.getByRole("button", { name: WORDS.chooseLead, exact: true }).click();
        const menu = adminPage.getByRole("menu", { name: WORDS.chooseLead });
        const [rolesResponse] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/roles`, "PUT"),
          menu.getByRole("menuitem", { name: new RegExp(escapeRegExp(gus.displayName)) }).click(),
        ]);
        const roles = await okBody(rolesResponse, "Naming the lead");
        assert.equal(roles.programme?.lead?.uid, gus.uid, "the programme's lead is not the one chosen");
        await adminPage.getByRole("button", { name: "Change the lead", exact: true }).waitFor({ timeout: WAIT_MS });
        const doc = await readUserDoc(gus.uid);
        assert.equal(doc?.admissionsReviewer, true, "naming the lead did not let Gus into the admissions pages");
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

      await step(
        "the admin schedules an explainer with a typed topic from week 3's review, for Group A's next session, given by the lead",
        async () => {
          activePage = adminPage;
          await adminPage.goto(reviewUrl, { waitUntil: "domcontentloaded" });
          const card = adminPage.locator("#review-explainers");
          await card.getByText(WORDS.explainersNone, { exact: true }).waitFor({ timeout: WAIT_MS });
          await card.locator('a[href$="/weeks/w03/review/explainer"]').click();
          await adminPage.getByRole("heading", { level: 2, name: WORDS.scheduleTitle }).waitFor({ timeout: WAIT_MS });
          const form = adminPage.locator('form[aria-labelledby="explainer-title"]');
          await form.locator("#explainer-topic").fill(TOPIC);
          await form.locator("#explainer-who").selectOption({ value: gus.uid });
          // A typed topic ticks no group: the admin ticks Group A's next session, week 4, and leaves Group B's.
          const groupABox = form.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(groupA.name)}, week 4\\b`) });
          const groupBBox = form.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(groupB.name)}, week \\d`) });
          assert.equal(await groupABox.isChecked(), false, "a typed topic ticked a group");
          await groupABox.check();
          assert.equal(await groupBBox.isChecked(), false, "Group B's session is ticked");
          const [response] = await Promise.all([
            responseTo(adminPage, "/weeks/w03/explainers", "POST"),
            form.getByRole("button", { name: WORDS.scheduleOne, exact: true }).click(),
          ]);
          const body = await okBody(response, "Scheduling the explainer");
          assert.equal(body.tasks, 1, "scheduling made no task for the one session, or more than one");

          // Back on the review, where the list says what was scheduled and Cancel waits.
          await adminPage.getByRole("button", { name: WORDS.cancel, exact: true }).waitFor({ timeout: WAIT_MS });
          const listed = await wordsIn(adminPage.locator("#review-explainers"));
          assert.ok(listed.includes(TOPIC), `the review does not list the explainer: ${listed}`);
          assert.ok(listed.includes(`${groupA.name}, week 4`), `the review does not say which session: ${listed}`);

          const explainers = await storedExplainers();
          assert.equal(explainers.length, 1, "scheduling kept no explainer, or more than one");
          const [explainer] = explainers;
          assert.equal(explainer.id, body.explainerId);
          assert.equal(explainer.topic, TOPIC, "the explainer is not the admin's words");
          assert.equal(explainer.explainerUid, gus.uid, "the explainer is not given by the one chosen");
          assert.equal(explainer.minutes, 10);
          assert.deepEqual(
            explainer.sessions.map((session) => [session.groupId, session.weekNumber]),
            [[groupA.id, 4]],
            "the explainer opens another session",
          );
          const tasks = await explainerTasks();
          assert.equal(tasks.length, 1, "the explainer has no task, or more than one");
          assert.deepEqual(tasks[0].completerUids, [gus.uid], "the task is not for whoever explains");
          assert.notEqual(tasks[0].archived, true);
        },
      );

      await step("the facilitator reads the explainer on their next session's ticket", async () => {
        activePage = facilitatorPage;
        await signIn(facilitatorPage, fern);
        const { ticket, body } = await fernsTicket();
        assert.equal(body.explainer?.topic, TOPIC, "the summary does not carry the explainer");
        await ticket.getByText(WORDS.startsWith, { exact: true }).waitFor({ timeout: WAIT_MS });
        const said = await wordsIn(ticket);
        assert.ok(said.includes(WORDS.ticketLine) && said.includes(WORDS.ticketThen), `the ticket does not say the explainer: ${said}`);
        const home = await wordsIn(facilitatorPage.locator("main"));
        assert.ok(home.includes(WORDS.scheduledFrom), `Home does not say where the explainer came from: ${home}`);
      });

      await step("the admin cancels the explainer from the review, and its task closes", async () => {
        activePage = adminPage;
        await adminPage.goto(reviewUrl, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("button", { name: WORDS.cancel, exact: true }).click();
        const [response] = await Promise.all([
          responseTo(adminPage, `/explainers/${(await storedExplainers())[0].id}`, "DELETE"),
          adminPage.getByRole("button", { name: WORDS.confirmYes, exact: true }).click(),
        ]);
        const body = await okBody(response, "Cancelling the explainer");
        assert.deepEqual(body, { archived: 1 }, "cancelling closed no task, or more than one");
        await adminPage.getByText(WORDS.cancelled, { exact: true }).waitFor({ timeout: WAIT_MS });
        // Cancelled, never deleted: the record is stamped and kept, and the task is closed.
        const [explainer] = await storedExplainers();
        assert.ok(explainer?.cancelledAt, "the explainer is not stamped cancelled");
        assert.equal((await explainerTasks())[0]?.archived, true, "the explainer's task is still open");
        // The review drawn again lists nothing scheduled.
        await adminPage.goto(reviewUrl, { waitUntil: "domcontentloaded" });
        await adminPage.locator("#review-explainers").getByText(WORDS.explainersNone, { exact: true }).waitFor({ timeout: WAIT_MS });
      });

      await step("the facilitator's ticket is clear of it", async () => {
        activePage = facilitatorPage;
        const { ticket, body } = await fernsTicket();
        assert.equal(body.explainer, null, "the summary still carries the cancelled explainer");
        assert.equal(await ticket.getByText(WORDS.startsWith, { exact: true }).count(), 0, "the ticket still starts with the explainer");
        assert.ok(!(await wordsIn(facilitatorPage.locator("main"))).includes(TOPIC_IN_A_SENTENCE), "Home still names the explainer's topic");
      });

      await step("the lead reads the notes about a person kept for leads beside their weeks, and none kept for admins alone", async () => {
        activePage = leadPage;
        await signIn(leadPage, gus);
        const listed = responseTo(leadPage, notesPath, "GET");
        await leadPage.goto(`${formBase}/coursework/${enc(ada.uid)}`, { waitUntil: "domcontentloaded" });
        const body = await okBody(await listed, "Reading the notes as the lead");
        // A lead is sent the notes kept for leads and whether more may be kept for them, never a count of the others.
        assert.deepEqual(Object.keys(body).sort(), ["forLeads", "notes"], "the lead is sent more than the notes kept for leads");
        assert.equal(body.forLeads, true);
        assert.deepEqual(
          body.notes.map((note) => note.text),
          [NOTE_FOR_LEADS],
          "the lead is sent a note not kept for leads, or not the one that is",
        );
        await notes().getByText(WORDS.ruleLead, { exact: true }).waitFor({ timeout: WAIT_MS });
        const row = notes().locator("li").filter({ hasText: NOTE_FOR_LEADS });
        await row.waitFor({ timeout: WAIT_MS });
        assert.ok((await wordsIn(row)).includes(WORDS.audienceLeads), "the note does not say who reads it");
        // The admin's note is the admin's to change.
        assert.equal(await row.getByRole("button", { name: WORDS.edit }).count(), 0, "the lead is offered to change an admin's note");
        const said = await wordsIn(leadPage.locator("main"));
        assert.ok(!said.includes(NOTE_FOR_ADMINS), "the lead is shown a note kept to admins");
        // No Claude and no Pangram for a lead.
        assert.equal(await notes().getByRole("button", { name: WORDS.draft }).count(), 0, "the lead is offered Claude's draft");
        assert.equal(await leadPage.locator('section[aria-label="Pangram"]').count(), 0, "the lead is shown Pangram");
      });

      await step("the lead adds a note, changes it and deletes it, and the record agrees each time", async () => {
        activePage = leadPage;
        const text = "E2E lead's note: explains the reading to the others in the group.";
        await notes().getByRole("button", { name: WORDS.add, exact: true }).click();
        await notes().locator(`#new-note-${ada.uid}`).fill(text);
        // A lead chooses nobody: what a lead adds is always kept for admins and leads.
        await notes().getByText(WORDS.leadsRead, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await notes().getByRole("radio").count(), 0, "the lead is offered a choice of who reads it");
        const [added] = await Promise.all([responseTo(leadPage, notesPath, "POST"), notes().getByRole("button", { name: WORDS.save }).click()]);
        const { id } = await okBody(added, "Adding the lead's note");
        await notes().getByText(text, { exact: true }).waitFor({ timeout: WAIT_MS });
        let stored = (await storedNotes(ada.uid)).find((note) => note.id === id);
        assert.equal(stored?.authorUid, gus.uid, "the note does not name the lead who kept it");
        assert.equal(stored?.audience, "leads", "the lead's note is not kept for leads");
        assert.equal(stored?.runId, state.runId, "the lead's note is not from the programme's run");
        assert.equal(stored?.draftedByClaude, false);

        const changedText = "E2E lead's note: explains the reading to the whole group.";
        const row = notes().locator("li").filter({ hasText: text });
        assert.ok((await wordsIn(row)).startsWith(WORDS.you), "the lead's own note does not say it is theirs");
        await row.getByRole("button", { name: WORDS.edit }).click();
        await notes().locator(`#edit-${id}`).fill(changedText);
        const [changed] = await Promise.all([responseTo(leadPage, `${notesPath}/${id}`, "PATCH"), notes().getByRole("button", { name: WORDS.save }).click()]);
        await okBody(changed, "Changing the lead's note");
        await notes().getByText(changedText, { exact: true }).waitFor({ timeout: WAIT_MS });
        stored = (await storedNotes(ada.uid)).find((note) => note.id === id);
        assert.equal(stored?.text, changedText, "the stored note is not the changed words");
        assert.equal(stored?.audience, "leads", "changing the words changed who reads it");

        leadPage.once("dialog", (dialog) => void dialog.accept());
        const [removed] = await Promise.all([
          responseTo(leadPage, `${notesPath}/${id}`, "DELETE"),
          notes().locator("li").filter({ hasText: changedText }).getByRole("button", { name: WORDS.remove }).click(),
        ]);
        await okBody(removed, "Deleting the lead's note");
        await waitFor("the deleted note to leave the page", async () => (await notes().getByText(changedText).count()) === 0);
        const left = await storedNotes(ada.uid);
        assert.equal(left.some((note) => note.id === id), false, "the deleted note is still stored");
        assert.deepEqual(left.map((note) => note.text).sort(), [NOTE_FOR_ADMINS, NOTE_FOR_LEADS].sort(), "the admin's notes changed");
      });
    } finally {
      await leadContext.close().catch(() => {});
      await facilitatorContext.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
