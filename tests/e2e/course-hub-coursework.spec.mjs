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
 *    tab: everybody in their group, each group's head naming its
 *    facilitators, Dan under "Not in a group yet" with his week 1 work
 *    counted, each cell saying one thing in words ("Started", "Not started")
 *    with the flags beside it ("Not read yet", "No feedback yet") and never
 *    anybody's words, the cell opening the reading view of that week, the
 *    filters as links one at a time with their counts, "Read one question",
 *    and the list of what waits for feedback, oldest first: Ada's and Cleo's
 *    answers;
 *  - opens Dan's week and Ada's in the reading view (one person, one week):
 *    Dan's from his name, on the newest week he wrote in, Ada's from her
 *    week 3 cell; reflections under their questions with when they were
 *    written, the answer as sent, and, because the lead here is an admin,
 *    Ada's private note;
 *  - writes a piece of feedback on Ada's week as a whole there and reads it
 *    back;
 *  - reads Group A's reflections with each writer's whole name;
 *  - Fern reads the same group's reflections with names from the page to
 *    read lines out, never a private note, and that page still names nobody
 *    beside an answer;
 *  - Fern opens Ada's week from Feedback to write on the group's page, the
 *    reading view on the group's side: the answer, the private note, never a
 *    rating; writes feedback on the answer beside it and reads it back;
 *  - the lead reads Fern's feedback beside the answer on the programme's
 *    side;
 *  - one question across the group (the other way of reading a week), as
 *    the lead and as Fern: from a person's week, "One question, whole
 *    group"; an answer nobody on the team has opened says "Not read yet",
 *    the page names what it showed once it is in the browser, and after it
 *    the answer reads as read; Fern keeps only the answers with no feedback
 *    yet, goes to Ada's week and back; the lead writes feedback on Ada's
 *    answer from the page, reads it back, and switches to her week and back;
 *  - back on the tab, the lead's filters "Not read yet" and "No feedback yet"
 *    each keep the right people; the lead opens Cleo's answer from the list
 *    of what waits, writes feedback on it, and finds it gone from the list;
 *  - Ada, signed in, changes her written answer, and it comes back as
 *    "Changed since feedback" on the lead's list and on Fern's card, whose
 *    row opens the reading view at the answer with both versions.
 *
 * A lead who is not an admin is never signed in by the harness, so that the
 * lead never sees a private note, an untold placement or the panels under
 * the tab (Claude's best answers and Pangram, an admin's alone since privacy
 * v15) is held by `tests/course-hub-coursework.test.mjs` instead.
 *
 * Every name and word is the fixture's own (`COURSEWORK` and friends in
 * `scripts/e2e-fixtures/worlds/course-hub-term.mjs`), or the two pieces of
 * feedback below. Nothing here reads mail, and saving feedback or changing a
 * written answer emails nobody (an admin's batch does, which this spec never
 * presses).
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
import { CLEO_ANSWER, RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-coursework.mjs";
import {
  COURSEWORK,
  COURSEWORK_ANSWER_PROMPT,
  COURSEWORK_PROMPTS,
  COURSEWORK_SOURCES,
  compareGroupsByMeeting,
  courseworkItemId,
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

/** The admin's piece on Ada's week as a whole, and Fern's on her written answer: the spec's own words. */
const LEAD_SAYS = "A clear week: say which lamp you would keep first.";
const FERN_SAYS = "Good reason. Which ships pay the most?";
/** The lead's piece on Ada's written answer, written from the page of one question across the group. */
const LEAD_ON_THE_ANSWER = "Say who pays when no ship comes in.";
/** The lead's piece on Cleo's written answer, written from the Coursework tab's list of what waits. */
const LEAD_ON_CLEOS = "Who pays the board, though?";
/** What Ada adds to her written answer once the lead and Fern have given feedback on it. */
const ADA_ADDS = " And the town pays when no ship comes in.";

/**
 * THE WORDS THIS JOURNEY CHECKS on the Coursework tab, Feedback to write and
 * Ada's week page, restated from src/lib/courses/coursework/words.ts,
 * src/lib/courses/writtenAnswerWords.ts and src/lib/courses/memberPageWords.ts;
 * tests/course-coursework-overview.test.mjs holds each to the product's own.
 */
const WORDS = Object.freeze({
  started: "Started",
  notStarted: "Not started",
  notReadYet: "Not read yet",
  noFeedbackYet: "No feedback yet",
  changedSinceFeedback: "Changed since feedback",
  weekNotDone: "Week not done",
  everyone: "Everyone",
  readOneQuestion: "Read one question",
  waitingTitle: "Waiting for feedback, oldest first",
  read: "Read",
  writtenAnswerOfWeek3: "week 3 written answer",
  nothingWaiting: "Nothing is waiting for feedback.",
  writtenAnswer: "Written answer",
  yourAnswer: "Your answer",
  changeMyAnswer: "Change my answer",
});

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
    const adaSecond = said(ada, 3, "rp2");
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
    /** A section as `sectionsOn` reads it: "Group A · Fern 3", then each row, sorted by name as the tab sorts it. */
    const sectionOf = (title, rows, facilitators = []) => [
      `${title}${facilitators.length > 0 ? ` · ${facilitators.join(", ")}` : ""} ${rows.length}`,
      [...rows].sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" })).map((row) => (row.mark ? `${row.name} ${row.mark}` : row.name)),
    ];
    /** Everything a page's main area says. */
    const mainOf = (pg) => wordsIn(pg.locator("main"));
    /** The Coursework tab's list of what waits for feedback. */
    const waitingList = (pg) => pg.locator('section[aria-labelledby="coursework-waiting"]');
    /** Each row of that list, as its first line says it: "Ada … · week 3 written answer". */
    async function waitingOn(pg) {
      await waitingList(pg).waitFor({ timeout: WAIT_MS });
      const out = [];
      for (const row of await waitingList(pg).locator("li").all()) out.push(await wordsIn(row.locator("p").first()));
      return out;
    }
    /** One of the tab's filters, by its words and count: "No feedback yet 2". */
    const showFilter = (pg, name) => pg.getByRole("navigation", { name: "Show", exact: true }).getByRole("link", { name, exact: true });

    /** Week 3's written answer, by its id: the question the page of one question asks last. */
    const answerId = courseworkItemId(3, "wa");
    /** One person's row on the page of one question across a group: a section carrying their id. */
    const rowOn = (pg, person) => pg.locator(`section[id="p-${person.uid}"]`);
    /** The two ways to read a week, drawn on both pages. */
    const waysOn = (pg) => pg.getByRole("navigation", { name: "Ways to read", exact: true });
    /** The filters over the people of one question. */
    const filtersOn = (pg) => pg.getByRole("navigation", { name: "Show whose answers", exact: true });
    /**
     * Every call the reading pages on `pg` make to the first-read route once
     * they are in the browser, from now on: `named` waits for one whose body
     * names `id` of `person`'s and which the route answered, and holds the
     * answer to exactly ok.
     */
    function watchMarks(pg) {
      const seen = [];
      const listener = (response) => {
        if (response.request().method() !== "POST" || !new URL(response.url()).pathname.endsWith(`/runs/${state.runId}/first-read`)) return;
        seen.push(response);
      };
      pg.on("response", listener);
      return {
        async named(person, id, what) {
          const found = await waitFor(what, async () =>
            seen.find((response) => {
              const body = JSON.parse(response.request().postData() ?? "{}");
              return (body.people ?? []).some((each) => each.uid === person.uid && each.ids.includes(id));
            }),
          );
          assert.deepEqual(await okBody(found, what), { ok: true }, `${what}: the route answered more than ok`);
        },
        stop: () => pg.off("response", listener),
      };
    }
    /** From one question, "Next question" until the question is the week's written answer. */
    async function stepToTheAnswer(pg) {
      for (let at = 0; at < 6; at += 1) {
        if ((await wordsIn(pg.locator("section[aria-labelledby=question-asked]"))).includes(COURSEWORK_ANSWER_PROMPT)) return;
        const next = pg.getByRole("link", { name: "Next question", exact: true }).first();
        const href = await next.getAttribute("href");
        await Promise.all([pg.waitForURL((url) => `${url.pathname}${url.search}` === href, { timeout: WAIT_MS }), next.click()]);
        await pg.getByRole("heading", { name: "One question, the whole group", level: 1 }).waitFor({ timeout: WAIT_MS });
      }
      throw new Error("Next question never reached the week's written answer");
    }

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
        "the lead opens the Coursework tab: everybody in their group, the person in no group last, and each cell in words",
        async () => {
          activePage = adminPage;
          // Everybody is named off their account by the names rule for an admin
          // (`nameForViewer`): the full name, here the fixture's display name,
          // unique to this run, which begins with the name each goes by.
          await adminPage.goto(`${formBase}/attendance`, { waitUntil: "domcontentloaded" });
          // The tab sits after Attendance in the programme's row.
          const tabLink = adminPage.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Coursework", exact: true });
          await tabLink.waitFor({ timeout: WAIT_MS });
          await Promise.all([adminPage.waitForURL((url) => url.pathname.endsWith("/coursework"), { timeout: WAIT_MS }), tabLink.click()]);

          await adminPage.getByText("4 holding a place · 1 facilitating · 2 with no feedback yet", { exact: true }).waitFor({ timeout: WAIT_MS });
          // Sorted by group in the run's one order, then name; nobody's last. Each group's head names its
          // facilitators: Fern, marked as facilitating on her own row.
          const expected = ordered.map((group) =>
            sectionOf(
              group.name,
              [
                ...state.people.filter((person) => person.groupKey === group.key).map((person) => ({ name: person.displayName })),
                ...(group === facilitated ? [{ name: fern.displayName, mark: "Facilitator" }] : []),
              ],
              group === facilitated ? [fern.displayName] : [],
            ),
          );
          expected.push(sectionOf("Not in a group yet", [{ name: dan.displayName }]));
          assert.deepEqual(await sectionsOn(adminPage), expected, "the tab's sections and rows");

          // Ada's week 3: begun and not done, since nobody has done a week here; her answer sent, opened by
          // nobody on the team, with no feedback. One thing, in words, then the flags.
          const adaCell = adminPage.getByRole("link", { name: `${ada.displayName}, week 3: ${WORDS.started}, ${WORDS.notReadYet}, ${WORDS.noFeedbackYet}`, exact: true });
          assert.equal(await wordsIn(adaCell), `${WORDS.started} ${WORDS.notReadYet} ${WORDS.noFeedbackYet}`, "Ada's week 3 cell");
          // The whole cell opens the reading view of Ada's week 3.
          assert.equal(await adaCell.getAttribute("href"), `${programmePathOnSite}/coursework/${enc(ada.uid)}?week=3`, "Ada's week 3 cell");
          // Cleo has written one prompt of part 1 and sent her answer, which nobody has opened.
          assert.match(
            await wordsIn(adminPage.getByRole("link", { name: new RegExp(`^${escapeRegExp(cleo.displayName)}, week 3: `) })),
            new RegExp(`^${WORDS.started} ${WORDS.notReadYet} ${WORDS.noFeedbackYet}$`),
          );
          // Ben has done nothing in week 3.
          assert.equal(await wordsIn(adminPage.getByRole("link", { name: `${ben.displayName}, week 3: ${WORDS.notStarted}`, exact: true })), WORDS.notStarted);
          // Dan, in no group, is counted on the run's own week 1, where his week 1 work was written. Nobody
          // reviews the work of somebody in no group, so no flag.
          assert.equal(await wordsIn(adminPage.getByRole("link", { name: `${dan.displayName}, week 1: ${WORDS.started}`, exact: true })), WORDS.started);
          // Never a word anybody wrote, and never a count, anywhere on the tab.
          const said = await mainOf(adminPage);
          for (const words of everyWord) assert.ok(!said.includes(words), `the tab shows ${JSON.stringify(words)}`);
          assert.ok(!/Reflections \d+ of \d+|Sources \d+ of \d+/.test(said), "a cell still counts");

          // Read one question: the first group's, on the week the tab is on.
          assert.equal(
            await adminPage.getByRole("link", { name: WORDS.readOneQuestion, exact: true }).getAttribute("href"),
            `${programmePathOnSite}/question?group=${enc(ordered[0].id)}&week=3`,
          );
          // The list of what waits for feedback, oldest first: Ada's, then Cleo's a minute later.
          assert.deepEqual(await waitingOn(adminPage), [
            `${ada.displayName} · ${WORDS.writtenAnswerOfWeek3}`,
            `${cleo.displayName} · ${WORDS.writtenAnswerOfWeek3}`,
          ]);
          assert.equal(
            await waitingList(adminPage).getByRole("link", { name: `${WORDS.read} ${ada.displayName}’s ${WORDS.writtenAnswerOfWeek3}`, exact: true }).getAttribute("href"),
            `${programmePathOnSite}/coursework/${enc(ada.uid)}?week=3#reading-answer`,
          );

          // The filters are links, one at a time, each with its count: the ones with no feedback yet.
          const sections = adminPage.getByRole("region", { name: "Coursework", exact: true }).locator("tbody");
          await showFilter(adminPage, `${WORDS.noFeedbackYet} 2`).click();
          await waitFor(
            "the No feedback yet filter to leave two groups",
            async () => new URL(adminPage.url()).searchParams.get("waiting") === "1" && (await sections.count()) === 2,
          );
          const twoGroups = [facilitated, otherGroup].sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b));
          assert.deepEqual(
            await sectionsOn(adminPage),
            twoGroups.map((group) =>
              group === facilitated ? sectionOf(group.name, [{ name: ada.displayName }], [fern.displayName]) : sectionOf(group.name, [{ name: cleo.displayName }]),
            ),
            "the No feedback yet filter",
          );
          // Week not done is the next filter, not one more on top: everybody has a week begun and not done.
          await showFilter(adminPage, `${WORDS.weekNotDone} 5`).click();
          await waitFor("the Week not done filter to replace the other", async () => {
            const query = new URL(adminPage.url()).searchParams;
            return query.get("notdone") === "1" && query.get("waiting") === null && (await sections.count()) === expected.length;
          });
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
        // The reading view, opened with no week named on the newest week Dan wrote in: week 1.
        assert.match(await wordsIn(adminPage.locator("header").filter({ hasText: dan.displayName })), /· Not in a group yet · week 1 of \d+/);
        const reflections = await wordsIn(adminPage.locator('section[aria-labelledby="reading-reflections"]'));
        // Each reflection under its question, with when it was last saved.
        assert.ok(reflections.includes(`The question ${COURSEWORK_PROMPTS.rp1} Saved `), `Dan's reflection is not under its question: ${reflections}`);
        assert.ok(reflections.includes(danSaid), `Dan's week 1 does not show his reflection: ${reflections}`);
        assert.match(reflections, WHEN, "Dan's reflection does not say when it was written");
        const readings = await wordsIn(adminPage.locator('section[aria-labelledby="reading-readings"]'));
        assert.ok(readings.startsWith("Readings 1 of 2 "), `Dan's week 1 does not count his tick: ${readings}`);
        // One week at a time, with the way to the next.
        assert.equal(
          await adminPage.getByRole("link", { name: "Next week: week 2", exact: true }).first().getAttribute("href"),
          `${programmePathOnSite}/coursework/${enc(dan.uid)}?week=2`,
        );
      });

      await step(
        "the lead opens one question across the group from a person's week: an answer not read yet, then read once opened",
        async () => {
          activePage = adminPage;
          // Ben has written nothing, so his week names nothing as read.
          await adminPage.goto(`${courseworkUrl}/${enc(ben.uid)}?week=3`, { waitUntil: "domcontentloaded" });
          await adminPage.getByRole("heading", { name: ben.displayName, level: 1 }).waitFor({ timeout: WAIT_MS });
          const toQuestion = waysOn(adminPage).getByRole("link", { name: "One question, whole group", exact: true });
          assert.equal(await toQuestion.getAttribute("href"), `${programmePathOnSite}/question?group=${enc(facilitated.id)}&week=3#p-${enc(ben.uid)}`);
          const marks = watchMarks(adminPage);
          await Promise.all([adminPage.waitForURL((url) => url.pathname.endsWith("/question"), { timeout: WAIT_MS }), toQuestion.click()]);
          await adminPage.getByRole("heading", { name: "One question, the whole group", level: 1 }).waitFor({ timeout: WAIT_MS });
          // The week's first question, asked once.
          const asked = await wordsIn(adminPage.locator("section[aria-labelledby=question-asked]"));
          assert.equal(asked, `The question · Part 1: Start with what you think · Question 1 of 4 ${COURSEWORK_PROMPTS.rp1}`);
          assert.ok(await waysOn(adminPage).locator('[aria-current="page"]', { hasText: "One question, whole group" }).isVisible());
          assert.ok((await wordsIn(rowOn(adminPage, ada))).includes(adaSaid), "Ada's first reflection is not drawn in full");
          // On to the second, which Ada saved after the site began keeping read times.
          const next = adminPage.getByRole("link", { name: "Next question", exact: true }).first();
          await Promise.all([adminPage.waitForURL((url) => url.searchParams.get("question") === courseworkItemId(3, "rp2"), { timeout: WAIT_MS }), next.click()]);
          await adminPage.getByText(COURSEWORK_PROMPTS.rp2, { exact: true }).waitFor({ timeout: WAIT_MS });
          // Once in the browser, the page names what it showed in full: Ada's reflection.
          await marks.named(ada, courseworkItemId(3, "rp2"), "the lead's page of one question naming Ada's reflection");
          marks.stop();
          // As it stood when the lead arrived: Ada's reflection opened by nobody on the team.
          const adaRow = await wordsIn(rowOn(adminPage, ada));
          assert.ok(adaRow.includes("Not read yet") && adaRow.includes(adaSecond), `Ada's reflection is not drawn as not read yet: ${adaRow}`);
          assert.ok((await wordsIn(rowOn(adminPage, ben))).endsWith("Nothing written yet"), "Ben's row does not say nothing is written");
          // The filters, each with its count of the people the lead may read (Ada, Ben and Fern's own).
          for (const name of ["Everybody 3", "Not read yet 1"]) {
            assert.ok(await filtersOn(adminPage).getByRole("button", { name, exact: true }).isVisible(), `no filter "${name}"`);
          }
          // A reflection takes no feedback of its own: no feedback filter on it.
          assert.equal(await filtersOn(adminPage).getByRole("button", { name: /^No feedback yet/ }).count(), 0);
          // Back to it: the lead's own opening has marked it read.
          await adminPage.reload({ waitUntil: "domcontentloaded" });
          await rowOn(adminPage, ada).waitFor({ timeout: WAIT_MS });
          assert.ok(!(await wordsIn(rowOn(adminPage, ada))).includes("Not read yet"), "Ada's reflection still reads as not read yet");
          const none = filtersOn(adminPage).getByRole("button", { name: "Not read yet 0", exact: true });
          await Promise.all([adminPage.waitForURL((url) => url.searchParams.get("unread") === "1", { timeout: WAIT_MS }), none.click()]);
          await adminPage.getByText("Nobody here matches that.", { exact: true }).waitFor({ timeout: WAIT_MS });
          // A filter says it is on as a toggle does: pressed, and Everybody no longer is.
          assert.equal(await filtersOn(adminPage).getByRole("button", { name: "Not read yet 0", exact: true, pressed: true }).count(), 1, "the filter does not say it is on");
          assert.equal(await filtersOn(adminPage).getByRole("button", { name: "Everybody 3", exact: true, pressed: false }).count(), 1);
        },
      );

      await step(
        "the facilitator opens the written answer across the group: not read yet, no feedback yet, the person's week and back, and read",
        async () => {
          activePage = facilitatorPage;
          await signIn(facilitatorPage, fern);
          // From Ben's week on the group's side, who has written nothing, to the week's questions, and on to its written answer.
          await facilitatorPage.goto(`${origin}${groupPath}/coursework/${enc(ben.uid)}?week=3`, { waitUntil: "domcontentloaded" });
          const toQuestion = waysOn(facilitatorPage).getByRole("link", { name: "One question, whole group", exact: true });
          await toQuestion.waitFor({ timeout: WAIT_MS });
          assert.equal(await toQuestion.getAttribute("href"), `${groupPath}/question?week=3#p-${enc(ben.uid)}`);
          const marks = watchMarks(facilitatorPage);
          await Promise.all([facilitatorPage.waitForURL((url) => url.pathname.endsWith(`${groupPath}/question`), { timeout: WAIT_MS }), toQuestion.click()]);
          await facilitatorPage.getByRole("heading", { name: "One question, the whole group", level: 1 }).waitFor({ timeout: WAIT_MS });
          await stepToTheAnswer(facilitatorPage);
          await marks.named(ada, answerId, "the facilitator's page of the written answer naming Ada's");
          marks.stop();
          assert.match(await wordsIn(facilitatorPage.locator("section[aria-labelledby=question-asked]")), /· Question 4 of 4 /);
          // A facilitator is shown the group's fellows, never their own work.
          assert.equal(await rowOn(facilitatorPage, fern).count(), 0, "a facilitator is shown their own answer");
          const adaRow = await wordsIn(rowOn(facilitatorPage, ada));
          assert.ok(adaRow.includes("Not read yet") && adaRow.includes("No feedback yet") && adaRow.includes(adaAnswer), `Ada's answer is not drawn as not read yet with no feedback yet: ${adaRow}`);
          assert.ok(!(await mainOf(facilitatorPage)).includes("Rating for the team"), "a facilitator is offered a rating");
          // Keep only the answers with no feedback yet: Ada's.
          const noFeedback = filtersOn(facilitatorPage).getByRole("button", { name: "No feedback yet 1", exact: true });
          await Promise.all([facilitatorPage.waitForURL((url) => url.searchParams.get("nofeedback") === "1", { timeout: WAIT_MS }), noFeedback.click()]);
          await waitFor("the filter to keep Ada alone", async () => (await facilitatorPage.locator('section[id^="p-"]').count()) === 1 && (await rowOn(facilitatorPage, ada).count()) === 1);
          // To Ada's week at this question, and back to one question across the group.
          const toWeek = rowOn(facilitatorPage, ada).getByRole("link", { name: `Open ${ada.first}’s week`, exact: true });
          assert.equal(await toWeek.getAttribute("href"), `${groupPath}/coursework/${enc(ada.uid)}?week=3#q-${answerId}`);
          await Promise.all([facilitatorPage.waitForURL((url) => url.pathname.endsWith(`${groupPath}/coursework/${ada.uid}`), { timeout: WAIT_MS }), toWeek.click()]);
          await facilitatorPage.locator('section[aria-labelledby="reading-answer"]').waitFor({ timeout: WAIT_MS });
          const back = waysOn(facilitatorPage).getByRole("link", { name: "One question, whole group", exact: true });
          await Promise.all([facilitatorPage.waitForURL((url) => url.pathname.endsWith(`${groupPath}/question`), { timeout: WAIT_MS }), back.click()]);
          await rowOn(facilitatorPage, ada).waitFor({ timeout: WAIT_MS });
          // And the written answer again: read now.
          await stepToTheAnswer(facilitatorPage);
          const again = await wordsIn(rowOn(facilitatorPage, ada));
          assert.ok(!again.includes("Not read yet") && again.includes("No feedback yet"), `Ada's answer is not read, or has lost its feedback state: ${again}`);
          assert.ok(await filtersOn(facilitatorPage).getByRole("button", { name: "Not read yet 0", exact: true }).isVisible());
        },
      );

      await step(
        "the lead opens a fellow's page: reflections with when, the answer waiting for feedback, and as an admin the private note",
        async () => {
          activePage = adminPage;
          // From her week 3 cell on the tab: the reading view of that week. Her answer still waits for feedback;
          // whether something of her week is still not read yet depends on what the steps before opened.
          await adminPage.goto(courseworkUrl, { waitUntil: "domcontentloaded" });
          const marks = watchMarks(adminPage);
          await Promise.all([
            adminPage.waitForURL((url) => url.pathname.endsWith(`/coursework/${ada.uid}`) && url.searchParams.get("week") === "3", { timeout: WAIT_MS }),
            adminPage.getByRole("link", { name: new RegExp(`^${escapeRegExp(ada.displayName)}, week 3: ${WORDS.started}(, ${WORDS.notReadYet})?, ${WORDS.noFeedbackYet}$`) }).click(),
          ]);
          await adminPage.getByRole("heading", { name: ada.displayName, level: 1 }).waitFor({ timeout: WAIT_MS });
          // Once in the browser, the page names what it showed in full, her answer among them: all of it is read now.
          await marks.named(ada, answerId, "the lead's reading view naming Ada's week");
          marks.stop();
          const head = await wordsIn(adminPage.locator("header").filter({ hasText: ada.displayName }));
          assert.match(head, new RegExp(`· ${escapeRegExp(facilitated.name)} · week 3 of \\d+`));
          // The week's title under the name.
          assert.ok(head.includes("Week 3 · "), `the week's title is not drawn: ${head}`);
          const reflections = await wordsIn(adminPage.locator('section[aria-labelledby="reading-reflections"]'));
          assert.ok(reflections.includes(`The question ${COURSEWORK_PROMPTS.rp1} Saved `), `Ada's reflection is not under its question: ${reflections}`);
          assert.ok(reflections.includes(adaSaid), `Ada's reflection is not on her week: ${reflections}`);
          assert.match(reflections, WHEN);
          const answer = await wordsIn(adminPage.locator('section[aria-labelledby="reading-answer"]'));
          assert.ok(answer.includes(`The question ${COURSEWORK_ANSWER_PROMPT} ${adaAnswer}`), `Ada's answer is not under its question: ${answer}`);
          // Where it stands and how long it is, at a glance, then when it was sent.
          assert.match(answer, /^Written answer No feedback yet \d+ words Sent /, `the answer does not say it waits, its length and when it was sent: ${answer}`);
          // Waiting for feedback: nobody has given any, and it is written here, beside the answer.
          assert.ok(answer.includes("Your feedback") && answer.includes("Save feedback"), `Ada's answer offers no feedback to write: ${answer}`);
          assert.ok(!answer.includes("Feedback from"), `Ada's answer is not waiting for feedback: ${answer}`);
          // An admin rates it for the team beside it, and may write feedback on it there.
          assert.ok(answer.includes("Rating for the team"), "an admin is not offered the rating for the team");
          // The way to the answer's review page, where Pangram and the session reports' lines sit beside it.
          assert.equal(
            await adminPage.getByRole("link", { name: `Open ${ada.first}’s answer on the written answers page`, exact: true }).getAttribute("href"),
            `${programmePathOnSite}/written?group=${enc(facilitated.id)}&week=3&person=${enc(ada.uid)}`,
          );
          const notes = await wordsIn(adminPage.locator('section[aria-labelledby="reading-notes"]'));
          assert.ok(notes.includes(`${COURSEWORK_SOURCES.s1} Private note ${adaNote}`), `an admin is not shown Ada's private note: ${notes}`);
          // The way back to the group's page, and on to the next person of the group.
          assert.equal(
            await adminPage.getByRole("link", { name: `Back to ${facilitated.name}`, exact: true }).getAttribute("href"),
            `${programmePathOnSite}/groups/${enc(facilitated.id)}`,
          );
          // The group's people in the tab's order (by name, Fern among them as facilitating): whoever follows Ada.
          const groupOrder = [ada, ben, fern].sort((a, b) => a.displayName.localeCompare(b.displayName, "en-GB", { sensitivity: "base" }));
          const after = groupOrder[groupOrder.indexOf(ada) + 1];
          if (after) {
            assert.equal(
              await adminPage.getByRole("link", { name: `Next person: ${after.displayName}`, exact: true }).first().getAttribute("href"),
              `${programmePathOnSite}/coursework/${enc(after.uid)}?week=3`,
            );
          }
        },
      );

      await step("the lead writes feedback on a fellow's week in the reading view, and reads it back", async () => {
        activePage = adminPage;
        const section = adminPage.locator('section[aria-labelledby="reading-week-feedback"]');
        await section.waitFor({ timeout: WAIT_MS });
        await section.getByLabel("Comment", { exact: true }).fill(LEAD_SAYS);
        const [response] = await Promise.all([
          responseTo(adminPage, `/runs/${state.runId}/feedback`, "POST"),
          section.getByRole("button", { name: "Save feedback", exact: true }).click(),
        ]);
        await okBody(response, "Saving feedback on the week");
        await section.getByRole("button", { name: "Save changes", exact: true }).waitFor({ timeout: WAIT_MS });
        // Read back from the server: the piece is the admin's own, not emailed yet.
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        const again = adminPage.locator('section[aria-labelledby="reading-week-feedback"]');
        await again.getByRole("button", { name: "Save changes", exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await again.getByLabel("Comment", { exact: true }).inputValue(), LEAD_SAYS);
        assert.ok((await wordsIn(again)).includes("Not emailed yet"), "the admin's piece does not say it is not emailed yet");
      });

      await step("the lead keeps, with the filters, the people with something not read yet and the people with no feedback yet", async () => {
        activePage = adminPage;
        await adminPage.goto(courseworkUrl, { waitUntil: "domcontentloaded" });
        // Ada's week has been read in full by now (the reading view the step before opened); Cleo's never.
        const sections = adminPage.getByRole("region", { name: "Coursework", exact: true }).locator("tbody");
        await showFilter(adminPage, `${WORDS.notReadYet} 1`).click();
        await waitFor("Not read yet to keep Cleo alone", async () => new URL(adminPage.url()).searchParams.get("unread") === "1" && (await sections.count()) === 1);
        assert.deepEqual(await sectionsOn(adminPage), [sectionOf(otherGroup.name, [{ name: cleo.displayName }])], "Not read yet");
        // No feedback yet: Ada and Cleo both, read or not.
        await showFilter(adminPage, `${WORDS.noFeedbackYet} 2`).click();
        await waitFor("No feedback yet to keep Ada and Cleo", async () => new URL(adminPage.url()).searchParams.get("waiting") === "1" && (await sections.count()) === 2);
        const names = (await sectionsOn(adminPage)).flatMap(([, rows]) => rows);
        assert.deepEqual(names.sort(), [ada.displayName, cleo.displayName].sort(), "No feedback yet");
        // Ada's cell says so: no feedback, and nothing of her week unread.
        const adaCell = adminPage.getByRole("link", { name: `${ada.displayName}, week 3: ${WORDS.started}, ${WORDS.noFeedbackYet}`, exact: true });
        assert.equal(await wordsIn(adaCell), `${WORDS.started} ${WORDS.noFeedbackYet}`);
        // Everyone clears it.
        await showFilter(adminPage, `${WORDS.everyone} 5`).click();
        await waitFor("Everyone to show every group again", async () => !new URL(adminPage.url()).search && (await sections.count()) === ordered.length + 1);
      });

      await step("the lead opens an answer from the waiting list, writes feedback on it, and finds it gone from the list", async () => {
        activePage = adminPage;
        const read = waitingList(adminPage).getByRole("link", { name: `${WORDS.read} ${cleo.displayName}’s ${WORDS.writtenAnswerOfWeek3}`, exact: true });
        await read.waitFor({ timeout: WAIT_MS });
        assert.equal(await read.getAttribute("href"), `${programmePathOnSite}/coursework/${enc(cleo.uid)}?week=3#reading-answer`);
        // Cleo's row says when she sent it, and that nobody has opened it.
        const cleoRow = waitingList(adminPage).locator("li").filter({ hasText: cleo.displayName });
        assert.match(await wordsIn(cleoRow), new RegExp(`^${escapeRegExp(cleo.displayName)} · ${WORDS.writtenAnswerOfWeek3} Sent [A-Z][a-z]{2} \\d{1,2} [A-Z][a-z]{2}( · late)? ${WORDS.notReadYet} ${WORDS.read}$`));
        const marks = watchMarks(adminPage);
        await Promise.all([adminPage.waitForURL((url) => url.pathname.endsWith(`/coursework/${cleo.uid}`) && url.hash === "#reading-answer", { timeout: WAIT_MS }), read.click()]);
        const answer = adminPage.locator('section[aria-labelledby="reading-answer"]');
        await answer.waitFor({ timeout: WAIT_MS });
        // Once in the browser, the reading view names what it showed in full: Cleo's week is read now.
        await marks.named(cleo, answerId, "the lead's reading view naming Cleo's answer");
        marks.stop();
        assert.ok((await wordsIn(answer)).includes(CLEO_ANSWER), "Cleo's answer is not drawn");
        await answer.getByLabel("Comment", { exact: true }).fill(LEAD_ON_CLEOS);
        const [response] = await Promise.all([
          responseTo(adminPage, `/runs/${state.runId}/feedback`, "POST"),
          answer.getByRole("button", { name: "Save feedback", exact: true }).click(),
        ]);
        await okBody(response, "Saving feedback on Cleo's answer");
        await answer.getByRole("button", { name: "Save changes", exact: true }).waitFor({ timeout: WAIT_MS });
        // Back on the tab: Cleo's answer is gone from the list, and Ada's still waits.
        await adminPage.goto(courseworkUrl, { waitUntil: "domcontentloaded" });
        assert.deepEqual(await waitingOn(adminPage), [`${ada.displayName} · ${WORDS.writtenAnswerOfWeek3}`], "the list after feedback on Cleo's answer");
        assert.ok(await showFilter(adminPage, `${WORDS.noFeedbackYet} 1`).isVisible(), "No feedback yet still counts Cleo");
        assert.ok(await showFilter(adminPage, `${WORDS.notReadYet} 0`).isVisible(), "opening Cleo's answer did not read it");
      });

      await step("the lead reads the group's reflections with each writer's name", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase}/reflections?group=${enc(facilitated.id)}&week=3`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("heading", { name: "Week 3 reflections", level: 1 }).waitFor({ timeout: WAIT_MS });
        const prompt = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: COURSEWORK_PROMPTS.rp1, level: 2 }) });
        const words = await wordsIn(prompt);
        // Each by the names rule for an admin: the full name, the fixture's display name.
        assert.ok(words.includes(`1 of 2 wrote one · ${ben.displayName} hasn’t`), `the prompt does not name who has not written: ${words}`);
        assert.ok(new RegExp(`${escapeRegExp(ada.displayName)} ${WHEN.source} ${escapeRegExp(adaSaid)}`).test(words), `Ada's reflection is not under her name: ${words}`);
        // Fern's own reflections are the lead's to read, marked as hers.
        assert.ok(words.includes(`Facilitators’ own reflections ${fern.displayName} Facilitator Not written yet.`), `Fern's own reflection is not marked: ${words}`);
        // Another group's never.
        assert.ok(!(await mainOf(adminPage)).includes(cleoSaid), "Group B's reflection is on Group A's page");
      });

      await step("the facilitator reads the group's reflections with names, and never a private note", async () => {
        activePage = facilitatorPage;
        // Fern signed in on the step that read one question across the group.
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

      await step(
        "the facilitator opens a person's week from the group page, reads it with the private note and no rating, and writes feedback there",
        async () => {
          activePage = facilitatorPage;
          await facilitatorPage.goto(`${origin}${groupPath}`, { waitUntil: "domcontentloaded" });
          // Feedback to write: Ada's name leads to the reading view of her week 3.
          const toAda = facilitatorPage.locator(`section[aria-labelledby="group-review-queue"] a[href="${groupPath}/coursework/${enc(ada.uid)}?week=3"]`);
          await toAda.waitFor({ timeout: WAIT_MS });
          await Promise.all([
            facilitatorPage.waitForURL((url) => url.pathname.endsWith(`${groupPath}/coursework/${ada.uid}`), { timeout: WAIT_MS }),
            toAda.click(),
          ]);
          const answer = facilitatorPage.locator('section[aria-labelledby="reading-answer"]');
          await answer.waitFor({ timeout: WAIT_MS });
          const answerWords = await wordsIn(answer);
          assert.ok(answerWords.includes(`The question ${COURSEWORK_ANSWER_PROMPT} ${adaAnswer}`), `Ada's answer is not under its question: ${answerWords}`);
          // A facilitator writes feedback; never a rating.
          assert.ok(!(await mainOf(facilitatorPage)).includes("Rating for the team"), "a facilitator is offered a rating");
          const notes = await wordsIn(facilitatorPage.locator('section[aria-labelledby="reading-notes"]'));
          assert.ok(
            notes.includes(`Only ${facilitated.name}’s facilitators and admins read private notes.`) && notes.includes(`Private note ${adaNote}`),
            `the group's facilitator is not shown Ada's private note: ${notes}`,
          );
          // The draft grade and the sealed prediction are an admin's alone.
          assert.ok(!(await mainOf(facilitatorPage)).includes("Draft grade"), "a facilitator is shown a draft grade");
          assert.ok(!(await mainOf(facilitatorPage)).includes("Claude’s draft grade"), "a facilitator is told a draft grade waits");
          await answer.getByLabel("Comment", { exact: true }).fill(FERN_SAYS);
          const [response] = await Promise.all([
            responseTo(facilitatorPage, `/runs/${state.runId}/feedback`, "POST"),
            answer.getByRole("button", { name: "Save feedback", exact: true }).click(),
          ]);
          const body = await okBody(response, "Saving feedback on the answer");
          assert.ok(body.ok, "the feedback was not saved");
          await answer.getByRole("button", { name: "Save changes", exact: true }).waitFor({ timeout: WAIT_MS });
          await facilitatorPage.reload({ waitUntil: "domcontentloaded" });
          const again = facilitatorPage.locator('section[aria-labelledby="reading-answer"]');
          await again.getByRole("button", { name: "Save changes", exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await again.getByLabel("Comment", { exact: true }).inputValue(), FERN_SAYS);
        },
      );

      await step("the lead reads the facilitator's feedback beside the answer on the programme's side", async () => {
        activePage = adminPage;
        await adminPage.goto(`${courseworkUrl}/${enc(ada.uid)}?week=3`, { waitUntil: "domcontentloaded" });
        const answer = adminPage.locator('section[aria-labelledby="reading-answer"]');
        await answer.waitFor({ timeout: WAIT_MS });
        const said = await wordsIn(answer);
        assert.ok(
          said.includes(`Feedback from ${fern.first} ${ada.first}’s facilitator · `) && said.includes(`${FERN_SAYS} Not emailed yet`),
          `the facilitator's feedback is not beside Ada's answer: ${said}`,
        );
        // And the answer now says, at a glance, that it has feedback.
        assert.match(said, /^Written answer Feedback given \d+ words Sent /, `the answer does not say it has feedback: ${said}`);
      });

      await step(
        "the lead writes feedback from the page of one question and reads it back, then switches to the person's week and back",
        async () => {
          activePage = adminPage;
          // From Ada's week (where the last step left the lead): one question across her group, landing on her.
          const toQuestion = waysOn(adminPage).getByRole("link", { name: "One question, whole group", exact: true });
          assert.equal(await toQuestion.getAttribute("href"), `${programmePathOnSite}/question?group=${enc(facilitated.id)}&week=3#p-${enc(ada.uid)}`);
          await Promise.all([adminPage.waitForURL((url) => url.pathname.endsWith("/question"), { timeout: WAIT_MS }), toQuestion.click()]);
          await adminPage.getByRole("heading", { name: "One question, the whole group", level: 1 }).waitFor({ timeout: WAIT_MS });
          await stepToTheAnswer(adminPage);
          const row = rowOn(adminPage, ada);
          // Fern's feedback is on it, with who and when; nothing of the lead's own yet.
          const before = await wordsIn(row);
          assert.ok(before.includes("Feedback given") && before.includes(`Feedback from ${fern.first} ${ada.first}’s facilitator · `), `Fern's feedback is not on Ada's row: ${before}`);
          assert.ok(before.includes("Rating for the team"), "an admin is not offered the rating for the team on the row");
          await row.locator("summary", { hasText: "Add feedback" }).click();
          await row.getByLabel("Comment", { exact: true }).fill(LEAD_ON_THE_ANSWER);
          const [response] = await Promise.all([responseTo(adminPage, `/runs/${state.runId}/feedback`, "POST"), row.getByRole("button", { name: "Save feedback", exact: true }).click()]);
          await okBody(response, "Saving feedback on the answer from the page of one question");
          await row.getByRole("button", { name: "Save changes", exact: true }).waitFor({ timeout: WAIT_MS });
          // Read back from the server: the lead's own piece, open to change, not emailed yet.
          await adminPage.reload({ waitUntil: "domcontentloaded" });
          const again = rowOn(adminPage, ada);
          await again.getByRole("button", { name: "Save changes", exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await again.getByLabel("Comment", { exact: true }).inputValue(), LEAD_ON_THE_ANSWER);
          // To her week at this question, where the piece is beside the answer, and back.
          const toWeek = waysOn(adminPage).getByRole("link", { name: "One person, one week", exact: true });
          assert.equal(await toWeek.getAttribute("href"), `${programmePathOnSite}/coursework/${enc(ada.uid)}?week=3#q-${answerId}`);
          await Promise.all([adminPage.waitForURL((url) => url.pathname.endsWith(`/coursework/${ada.uid}`), { timeout: WAIT_MS }), toWeek.click()]);
          const answer = adminPage.locator('section[aria-labelledby="reading-answer"]');
          await answer.getByRole("button", { name: "Save changes", exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await answer.getByLabel("Comment", { exact: true }).inputValue(), LEAD_ON_THE_ANSWER);
          const back = waysOn(adminPage).getByRole("link", { name: "One question, whole group", exact: true });
          await Promise.all([adminPage.waitForURL((url) => url.pathname.endsWith("/question"), { timeout: WAIT_MS }), back.click()]);
          await rowOn(adminPage, ada).waitFor({ timeout: WAIT_MS });
        },
      );

      await step("the person changes the written answer the lead and the facilitator gave feedback on", async () => {
        const { context: adaContext, page: adaPage } = await newIdentityPage(browser);
        activePage = adaPage;
        try {
          await stubRecaptchaOnLoopback(adaPage, origin);
          await signIn(adaPage, ada);
          await adaPage.goto(`${origin}/learn/${enc(state.runId)}/weeks/3`, { waitUntil: "domcontentloaded" });
          const card = adaPage.getByRole("region", { name: WORDS.writtenAnswer, exact: true });
          await card.getByText(COURSEWORK_ANSWER_PROMPT, { exact: true }).waitFor({ timeout: WAIT_MS });
          // Sent, so it opens to writing with Change my answer.
          const change = card.getByRole("button", { name: WORDS.changeMyAnswer, exact: true });
          await change.waitFor({ timeout: WAIT_MS });
          await waitFor("Change my answer to be live once the page has hydrated", async () => change.isEnabled());
          await change.click();
          const box = card.getByLabel(WORDS.yourAnswer, { exact: true });
          await waitFor("the answer box to take writing", async () => box.isEditable());
          const [saved] = await Promise.all([responseTo(adaPage, `/written-answers/${answerId}`, "PUT"), box.fill(`${adaAnswer}${ADA_ADDS}`)]);
          await okBody(saved, "Ada changing her written answer");
          // Nothing on her own page says whether anybody on the team has opened her work.
          const own = await mainOf(adaPage);
          assert.ok(!own.includes(WORDS.notReadYet) && !own.includes(WORDS.waitingTitle), "Ada's own page says something of her work being read");
        } finally {
          await adaContext.close().catch(() => {});
        }
      });

      await step("the lead finds it back on the waiting list as changed since feedback, and so does the facilitator's card", async () => {
        activePage = adminPage;
        await adminPage.goto(courseworkUrl, { waitUntil: "domcontentloaded" });
        const adaRow = waitingList(adminPage).locator("li").filter({ hasText: ada.displayName });
        await adaRow.waitFor({ timeout: WAIT_MS });
        assert.match(await wordsIn(adaRow), new RegExp(`^${escapeRegExp(ada.displayName)} · ${WORDS.writtenAnswerOfWeek3} ${WORDS.changedSinceFeedback}, [A-Z][a-z]{2} \\d{1,2} [A-Z][a-z]{2} ${WORDS.read}$`));
        // The filter keeps her alone, and her cell says it.
        await showFilter(adminPage, `${WORDS.changedSinceFeedback} 1`).click();
        await waitFor("Changed since feedback to keep Ada alone", async () => new URL(adminPage.url()).searchParams.get("changed") === "1");
        assert.deepEqual(await sectionsOn(adminPage), [sectionOf(facilitated.name, [{ name: ada.displayName }], [fern.displayName])], "Changed since feedback");
        // Read opens her week at the answer, where both versions are drawn.
        await Promise.all([
          adminPage.waitForURL((url) => url.pathname.endsWith(`/coursework/${ada.uid}`) && url.hash === "#reading-answer", { timeout: WAIT_MS }),
          waitingList(adminPage).getByRole("link", { name: `${WORDS.read} ${ada.displayName}’s ${WORDS.writtenAnswerOfWeek3}`, exact: true }).click(),
        ]);
        await adminPage.getByText(new RegExp(`^${escapeRegExp(ada.first)}’s answer has changed since this feedback was written\\.`)).first().waitFor({ timeout: WAIT_MS });

        // Fern's card on the group's page: back, marked, and opening the reading view at the answer.
        activePage = facilitatorPage;
        await facilitatorPage.goto(`${origin}${groupPath}`, { waitUntil: "domcontentloaded" });
        const queue = facilitatorPage.locator('section[aria-labelledby="group-review-queue"]');
        const toAda = queue.locator(`a[href="${groupPath}/coursework/${enc(ada.uid)}?week=3#reading-answer"]`).first();
        await toAda.waitFor({ timeout: WAIT_MS });
        // Fern is not on the committee, so her card names Ada as Ada goes by.
        assert.ok((await wordsIn(queue)).includes(`${ada.first} ${WORDS.changedSinceFeedback}, `), "Fern's card does not say Ada's answer changed since feedback");
        await Promise.all([
          facilitatorPage.waitForURL((url) => url.pathname.endsWith(`${groupPath}/coursework/${ada.uid}`) && url.hash === "#reading-answer", { timeout: WAIT_MS }),
          toAda.click(),
        ]);
        await facilitatorPage.locator('section[aria-labelledby="reading-answer"]').waitFor({ timeout: WAIT_MS });
        assert.ok((await mainOf(facilitatorPage)).includes(ADA_ADDS.trim()), "Fern is not shown Ada's change");
      });
    } finally {
      await Promise.allSettled([facilitatorContext.close(), context.close()]);
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
