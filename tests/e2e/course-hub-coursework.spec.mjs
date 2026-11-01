/**
 * END-TO-END: reading a programme's coursework, as its lead and as a group's
 * facilitator (owner decision, 30 October 2026).
 *
 * The term at its coursework point (`scripts/e2e-fixtures/course-hub-coursework.mjs`):
 * three weeks into a running run whose weeks are written as blocks, Ada and
 * Ben in Group A, Cleo in Group B, and Dan holding a place in no group, with
 * reflections, ticks, a private note and a sent written answer already
 * written. The admin approves Fern and Group A's two people, names the run on
 * the programme's Settings tab and appoints Fern to Group A. Then:
 *
 *  - the lead (the admin, as at every course hub spec) opens the Coursework
 *    tab: everybody in their group, Dan under "Not in a group yet" with his
 *    week 1 work counted, each cell leading with "Not done" (nobody has
 *    submitted a week here) and then in counts, never in words, Ada's answer
 *    waiting for feedback and opening the feedback page, and the filters as
 *    links, "Not done" among them;
 *  - opens Dan's page and Ada's: reflections under their prompts with when
 *    they were written, the answer waiting, and, because the lead here is an
 *    admin, Ada's private note;
 *  - reads Group A's reflections with each writer's whole name;
 *  - Fern reads the same group's reflections with names from the page to
 *    read lines out, never a private note, and that page still names nobody
 *    beside an answer.
 *
 * A lead who is not an admin is never signed in by the harness, so that the
 * lead never sees a private note, an untold placement or the panels under
 * the tab (Claude's best answers and Pangram, an admin's alone since privacy
 * v15) is held by `tests/course-hub-coursework.test.mjs` instead.
 *
 * Every name and word is the fixture's own (`COURSEWORK` and friends in
 * `scripts/e2e-fixtures/worlds/course-hub-term.mjs`). Nothing here reads
 * mail.
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
import { ARTIFACTS_DIR, RECAPTCHA_SKIP_REASON, markerPath, readState, stateDir, statePath } from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-coursework.mjs";
import {
  COURSEWORK,
  COURSEWORK_ANSWER_PROMPT,
  COURSEWORK_PROMPTS,
  compareGroupsByMeeting,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** The one reason this file may record for a step it did not run. */
const DEPLOYED_TARGET_SKIP = RECAPTCHA_SKIP_REASON;

/** "Mon 2 Nov, 5:30pm": when a reflection was last written, as the pages date it (`dayAndClockWords`). */
const WHEN = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec), \d{1,2}(?::\d{2})?(?:am|pm)/;

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

/**
 * What an element says, as written: every text node in it, a space between
 * each, so two elements side by side read as two words. Never `innerText`,
 * which is the text as CSS shows it (the site sets dates and labels in
 * capitals with CSS, and the words are the record's, not the look's).
 */
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
  "course hub: the lead reads a programme's coursework, and a facilitator reads the group's reflections with names",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const plan = COURSEWORK;

    const fern = state.facilitator;
    const personOf = (key) => state.people.find((person) => person.key === key);
    const groupOf = (key) => state.groups.find((group) => group.key === key);
    const [ada, ben, cleo, dan] = ["ada", "ben", "cleo", "dan"].map(personOf);
    for (const [key, person] of Object.entries({ ada, ben, cleo, dan })) assert.ok(person, `the term has no ${key}`);
    assert.equal(dan.groupKey, undefined, "Dan was placed in a group, and this journey needs somebody in none");
    const facilitated = groupOf(plan.facilitated);
    const otherGroup = state.groups.find((group) => group !== facilitated);
    /** The one order every tab lists the groups in. */
    const ordered = [...state.groups].sort(compareGroupsByMeeting);

    /** What the plan says each person wrote, by person and prompt key. */
    const said = (person, weekNumber, prompt) =>
      plan.coursework.reflections.find((entry) => entry.person === person.key && entry.weekNumber === weekNumber && entry.prompt === prompt)?.text;
    const adaSaid = said(ada, 3, "rp1");
    const cleoSaid = said(cleo, 3, "rp1");
    const danSaid = said(dan, 1, "rp1");
    const adaNote = plan.coursework.ticks.find((entry) => entry.person === "ada").note;
    const adaAnswer = plan.coursework.answers.find((entry) => entry.person === "ada").text;
    /** Every word anybody wrote, which no cell and no page to read lines out may name a writer beside. */
    const everyWord = [...plan.coursework.reflections.map((entry) => entry.text), adaNote, adaAnswer];

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    /** The programme's own path, as the server builds the tab's links. */
    const programmePathOnSite = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const courseworkUrl = `${formBase}/coursework`;
    const groupPath = `/learn/${enc(state.runId)}/group/${enc(facilitated.id)}`;

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
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? DEPLOYED_TARGET_SKIP : null);
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

    /** The tab's sections as drawn: each section's title, how many it holds, and its people's names with their marks. */
    async function sectionsOn(pg) {
      const region = pg.getByRole("region", { name: "Coursework", exact: true });
      await region.waitFor({ timeout: WAIT_MS });
      const out = [];
      for (const body of await region.locator("tbody").all()) {
        const title = await wordsIn(body.locator("th[scope=colgroup]"));
        const rows = [];
        for (const head of await body.locator("th[scope=row]").all()) rows.push(await wordsIn(head));
        out.push([title, rows]);
      }
      return out;
    }
    /** A section as `sectionsOn` reads it: "Group A 3", then each row, sorted by name as the tab sorts it. */
    const sectionOf = (title, rows) => [
      `${title} ${rows.length}`,
      [...rows].sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" })).map((row) => (row.mark ? `${row.name} ${row.mark}` : row.name)),
    ];
    /** Everything a page's main area says. */
    const mainOf = (pg) => wordsIn(pg.locator("main"));

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
        await card.getByRole("button", { name: `Change ${facilitated.name}’s facilitators`, exact: true }).click();
        await card.getByPlaceholder("Search people…").fill(fern.displayName);
        await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(fern.displayName)) }).check();
        const [response] = await Promise.all([
          responseTo(adminPage, `/groups/${facilitated.id}/facilitators`, "POST"),
          card.getByRole("button", { name: "Save", exact: true }).click(),
        ]);
        const body = await okBody(response, "Saving the facilitators");
        assert.deepEqual(body.facilitatorUids, [fern.uid], "the group's facilitators are not the one ticked");
        await card.getByText(`${facilitated.name}’s facilitators are saved. Nobody was emailed.`, { exact: true }).waitFor({ timeout: WAIT_MS });
      });

      await step(
        "the lead opens the Coursework tab: everybody in their group, the person in no group last, and each cell in counts",
        async () => {
          activePage = adminPage;
          // Each fellow is named by the name their row on the run carries (the
          // account's display name when they applied, unique to this run); a
          // facilitator by the name they go by (`fullNameOfUser`, the fixture's
          // `first`), since only the committee is shown more than that.
          await adminPage.goto(`${formBase}/attendance`, { waitUntil: "domcontentloaded" });
          // The tab sits after Attendance in the programme's row.
          const tabLink = adminPage.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Coursework", exact: true });
          await tabLink.waitFor({ timeout: WAIT_MS });
          await Promise.all([adminPage.waitForURL((url) => url.pathname.endsWith("/coursework"), { timeout: WAIT_MS }), tabLink.click()]);

          await adminPage.getByText("4 holding a place · 1 facilitating · 1 waiting for feedback", { exact: true }).waitFor({ timeout: WAIT_MS });
          // Sorted by group in the run's one order, then name; nobody's last. Fern is marked as facilitating.
          const expected = ordered.map((group) =>
            sectionOf(group.name, [
              ...state.people.filter((person) => person.groupKey === group.key).map((person) => ({ name: person.displayName })),
              ...(group === facilitated ? [{ name: fern.first, mark: "Facilitator" }] : []),
            ]),
          );
          expected.push(sectionOf("Not in a group yet", [{ name: dan.displayName }]));
          assert.deepEqual(await sectionsOn(adminPage), expected, "the tab's sections and rows");

          // Ada's week 3: not done, since nobody has submitted a week here; part 1's reflection
          // written of two parts, one source of two, waiting for feedback.
          const adaCell = adminPage.getByRole("link", { name: `Week 3, not done: ${ada.displayName}’s coursework`, exact: true });
          assert.equal(await wordsIn(adaCell), "Not done Reflections 1 of 2 Sources 1 of 2", "Ada's week 3 cell");
          const adaAnswer = adminPage.getByRole("link", { name: `Week 3 written answer, Waiting for feedback: ${ada.displayName}`, exact: true });
          assert.equal(
            await adaAnswer.getAttribute("href"),
            `${programmePathOnSite}/written?group=${enc(facilitated.id)}&week=3&person=${enc(ada.uid)}`,
            "the waiting answer does not open the feedback page",
          );
          // Cleo has written one prompt of part 1, so no part is written.
          assert.match(await wordsIn(adminPage.getByRole("link", { name: `Week 3, not done: ${cleo.displayName}’s coursework`, exact: true })), /^Not done Reflections 0 of 2 /);
          // Dan, in no group, is counted on the run's own week 1, where his week 1 work was written.
          assert.equal(await wordsIn(adminPage.getByRole("link", { name: `Week 1, not done: ${dan.displayName}’s coursework`, exact: true })), "Not done Reflections 1 of 2 Sources 1 of 2");
          // Never a word anybody wrote, anywhere on the tab.
          const said = await mainOf(adminPage);
          for (const words of everyWord) assert.ok(!said.includes(words), `the tab shows ${JSON.stringify(words)}`);

          // The filters are links: the waiting ones alone, then those of them not done, then everybody in no group.
          const sections = adminPage.getByRole("region", { name: "Coursework", exact: true }).locator("tbody");
          await adminPage.getByRole("link", { name: "Waiting for feedback", exact: true }).click();
          await waitFor(
            "the waiting filter to leave one group",
            async () => new URL(adminPage.url()).searchParams.get("waiting") === "1" && (await sections.count()) === 1,
          );
          assert.deepEqual(await sectionsOn(adminPage), [sectionOf(facilitated.name, [{ name: ada.displayName }])], "the waiting filter");
          // Not done keeps the waiting filter: Ada has a week that has begun and is not done.
          await adminPage.getByRole("link", { name: "Not done", exact: true }).click();
          await waitFor("the not done filter to keep the waiting one", async () => {
            const query = new URL(adminPage.url()).searchParams;
            return query.get("waiting") === "1" && query.get("notdone") === "1" && (await sections.count()) === 1;
          });
          assert.deepEqual(await sectionsOn(adminPage), [sectionOf(facilitated.name, [{ name: ada.displayName }])], "the waiting and not done filters");
          await adminPage.goto(`${courseworkUrl}?group=none`, { waitUntil: "domcontentloaded" });
          assert.deepEqual(await sectionsOn(adminPage), [sectionOf("Not in a group yet", [{ name: dan.displayName }])], "the filter of people in no group");
          assert.ok(otherGroup, "the term has one group");
        },
      );

      await step("the lead opens the person in no group: their week 1 reflections under their prompts", async () => {
        activePage = adminPage;
        await Promise.all([
          adminPage.waitForURL((url) => url.pathname.endsWith(`/coursework/${dan.uid}`), { timeout: WAIT_MS }),
          adminPage.getByRole("link", { name: dan.displayName, exact: true }).click(),
        ]);
        await adminPage.getByRole("heading", { name: dan.displayName, level: 1 }).waitFor({ timeout: WAIT_MS });
        assert.match(await wordsIn(adminPage.locator("header").filter({ hasText: dan.displayName })), /· Not in a group yet/);
        const words = await wordsIn(adminPage.locator("#week-1"));
        assert.ok(words.includes(`${COURSEWORK_PROMPTS.rp1} ${danSaid}`), `Dan's week 1 does not show his reflection under its prompt: ${words}`);
        assert.match(words, WHEN, "Dan's reflection does not say when it was written");
        assert.ok(words.includes("Ticked 1 of 2"), `Dan's week 1 does not count his tick: ${words}`);
        // Newest week first.
        const order = await adminPage.locator("section[id^='week-']").evaluateAll((sections) => sections.map((section) => section.id));
        assert.deepEqual(order, ["week-3", "week-2", "week-1"], "the weeks are not newest first");
      });

      await step(
        "the lead opens a fellow's page: reflections with when, the answer waiting for feedback, and as an admin the private note",
        async () => {
          activePage = adminPage;
          await adminPage.goto(`${courseworkUrl}/${enc(ada.uid)}`, { waitUntil: "domcontentloaded" });
          await adminPage.getByRole("heading", { name: ada.displayName, level: 1 }).waitFor({ timeout: WAIT_MS });
          assert.match(await wordsIn(adminPage.locator("header").filter({ hasText: ada.displayName })), new RegExp(`· ${escapeRegExp(facilitated.name)}`));
          const weekThree = await wordsIn(adminPage.locator("#week-3"));
          assert.ok(weekThree.includes(`${COURSEWORK_PROMPTS.rp1} ${adaSaid}`), `Ada's reflection is not under its prompt: ${weekThree}`);
          assert.match(weekThree, WHEN);
          assert.ok(weekThree.includes(`${COURSEWORK_ANSWER_PROMPT} Waiting for feedback`), `Ada's answer is not waiting: ${weekThree}`);
          assert.ok(weekThree.includes(adaAnswer), "Ada's answer is not on her page");
          assert.ok(weekThree.includes(`Private note ${adaNote}`), `an admin is not shown Ada's private note: ${weekThree}`);
          assert.equal(
            await adminPage.locator("#week-3").getByRole("link", { name: "Open the feedback page", exact: true }).getAttribute("href"),
            `${programmePathOnSite}/written?group=${enc(facilitated.id)}&week=3&person=${enc(ada.uid)}`,
          );
        },
      );

      await step("the lead reads the group's reflections with each writer's name", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/reflections?group=${enc(facilitated.id)}&week=3`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("heading", { name: "Week 3 reflections", level: 1 }).waitFor({ timeout: WAIT_MS });
        const prompt = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: COURSEWORK_PROMPTS.rp1, level: 2 }) });
        const words = await wordsIn(prompt);
        assert.ok(words.includes(`1 of 2 wrote one · ${ben.first} hasn’t`), `the prompt does not name who has not written: ${words}`);
        assert.ok(new RegExp(`${escapeRegExp(ada.first)} ${WHEN.source} ${escapeRegExp(adaSaid)}`).test(words), `Ada's reflection is not under her name: ${words}`);
        // Fern's own reflections are the lead's to read, marked as hers.
        assert.ok(words.includes(`Facilitators’ own reflections ${fern.first} Facilitator Not written yet.`), `Fern's own reflection is not marked: ${words}`);
        // Another group's never.
        assert.ok(!(await mainOf(adminPage)).includes(cleoSaid), "Group B's reflection is on Group A's page");
      });

      await step("the facilitator reads the group's reflections with names, and never a private note", async () => {
        activePage = facilitatorPage;
        await signIn(facilitatorPage, fern);
        await facilitatorPage.goto(`${origin}${groupPath}/reflections?week=3`, { waitUntil: "domcontentloaded" });
        const withNames = facilitatorPage.getByRole("link", { name: "Read them with names", exact: true });
        await withNames.waitFor({ timeout: WAIT_MS });
        await Promise.all([
          facilitatorPage.waitForURL((url) => url.pathname.endsWith("/reflections/names"), { timeout: WAIT_MS }),
          withNames.click(),
        ]);
        await facilitatorPage.getByRole("heading", { name: "Week 3 reflections", level: 1 }).waitFor({ timeout: WAIT_MS });
        const said = await mainOf(facilitatorPage);
        assert.ok(new RegExp(`${escapeRegExp(ada.first)} ${WHEN.source} ${escapeRegExp(adaSaid)}`).test(said), `Ada's reflection is not under her name: ${said}`);
        assert.ok(said.includes(`1 of 2 wrote one · ${ben.first} hasn’t`), "the prompt does not name who has not written");
        for (const words of [adaNote, adaAnswer, cleoSaid]) assert.ok(!said.includes(words), `the facilitator is shown ${JSON.stringify(words)}`);
        assert.ok(!said.includes("Facilitators’ own reflections"), "a facilitator is shown facilitators' own reflections");
        assert.ok(!said.includes("Private note"), "a facilitator's page with names shows a private note");
        assert.ok(
          await facilitatorPage.getByRole("link", { name: "Pick lines to read out", exact: true }).isVisible(),
          "the page with names offers no way back to reading lines out",
        );
      });

      await step("the facilitator's page to read lines out still names nobody beside an answer", async () => {
        activePage = facilitatorPage;
        await facilitatorPage.getByRole("link", { name: "Pick lines to read out", exact: true }).click();
        await facilitatorPage.waitForURL((url) => url.pathname.endsWith(`${groupPath}/reflections`), { timeout: WAIT_MS });
        await facilitatorPage.getByRole("button", { name: "Read this out: reflection 1 of 1", exact: true }).waitFor({ timeout: WAIT_MS });
        const said = await mainOf(facilitatorPage);
        assert.ok(said.includes(`Reflection 1 Read this out ${adaSaid}`), `the answer is not drawn as a reflection with no name: ${said}`);
        assert.ok(!said.includes(ada.displayName), "the page to read lines out names Ada");
        assert.ok(!new RegExp(`\\b${escapeRegExp(ada.first)}\\b`).test(said), "the page to read lines out names Ada");
        assert.ok(!WHEN.test(said), "the page to read lines out says when an answer was written");
      });
    } finally {
      await Promise.allSettled([facilitatorContext.close(), context.close()]);
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
