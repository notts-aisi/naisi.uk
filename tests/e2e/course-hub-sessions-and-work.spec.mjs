/**
 * A group's sessions and a week's work, end to end in a real browser.
 *
 * The world's week's work point (scripts/e2e-fixtures/worlds/course-hub-term.mjs):
 * three weeks into the fellowship, Ada and Ben in Group A, Group A's week 3
 * register never opened, weeks 1 to 4 published and written as blocks, and
 * Group A's week 4 session days ahead.
 *
 * -> the admin approves Ada and Fern -> names the running run -> appoints
 * Fern to Group A -> Ada presses Can't make it on her next session's ticket,
 * which says the register records her as excused, and still does after a
 * reload -> Fern's register says Ada can't make week 4; Fern marks week 3
 * and finishes it -> Fern follows "Next: two minutes on how it went." to the
 * session report and sends one -> Ada writes week 4's written answer, presses
 * Submit week 4, reads the check (two reflections empty) and presses Submit
 * anyway: the week reads submitted and locked, the box read only, after a
 * reload too -> Fern presses "Reopen week 4 for Ada" on This week's work ->
 * Ada's week page says Fern reopened it and until when; Ada changes the
 * answer and submits again -> the programme's lead (the admin) opens the
 * Surveys tab from the programme's head, follows the Overview's "Read the
 * report" to the session reports, and reads Fern's report with names.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-sessions-and-work
 *
 * It reads no mail, so it runs against a deployed target too. CHROMIUM ONLY:
 * a green run is a regression net, never a substitute for the manual Safari
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
  fixtureDoc,
  fixtureQuery,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-sessions-and-work.mjs";
import {
  COURSEWORK_ANSWER_PROMPT,
  WEEK_THREE_WORK,
  courseworkItemId,
  dayLabel,
  londonClockLabel,
  londonDateKey,
  londonDayLabel,
  sessionOf,
  weekDocId,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/**
 * THE WORDS THIS JOURNEY CHECKS, restated from src/lib/courses/cantMakeIt/words.ts,
 * src/lib/courses/sessionReports/words.ts, src/lib/courses/weekWork/words.ts
 * and src/lib/courses/writtenAnswerWords.ts, with their slots filled from the
 * records.
 */
const WORDS = Object.freeze({
  ticket: "Your next session",
  cantMakeIt: (day) => `Can’t make it on ${day}`,
  toldUs:
    "You’ve told us you can’t make this session, so the register records you as excused. Your facilitators see it there.",
  canMakeItAfterAll: "I can make it after all",
  registerLine: (day) => new RegExp(`^${escapeRegExp(day)}: .+ can’t make it\\.$`),
  reportNext: "Next: two minutes on how it went.",
  reportTitle: (week) => `How did week ${week} go?`,
  how: "How did the session go?",
  wentWell: "What went well?",
  didnt: "What didn’t?",
  unclear: "What seemed unclear to the group?",
  engaged: "Who engaged well?",
  needsHand: "Anyone who might need a hand?",
  standOut: (first) => `What made ${first} stand out?`,
  aWordAbout: (first) => `A word about ${first}`,
  // The programme has no lead, so the report is the admins'.
  forLead: "Anything for the admins?",
  send: "Send report",
  sent: "Report sent.",
  reportsTitle: "Session reports",
  // The programme's tabs and its Surveys tab (`ProgrammeTabs`, `SurveysViews`,
  // `reportsWeekTitleWords`, `reportsAverageWords`, `readReportsWords` in src/lib/surveys/words.ts).
  sections: "Sections",
  surveysTab: "Surveys",
  surveysViews: "Surveys views",
  reportsView: "Facilitators’ reports",
  reportsWeek: (week) => `Facilitators’ reports, week ${week}`,
  reportsAverage: (how) => `Average ${(Math.round(how * 10) / 10).toFixed(1)} of 5 for how it went.`,
  readReport: "Read the report",
  howOf: (how) => `${how} of 5`,
  writtenAnswer: "Written answer",
  yourAnswer: "Your answer",
  saved: "Saved",
  submitWeek: (week) => `Submit week ${week}`,
  checkTitle: (week) => `Before you submit week ${week}`,
  twoNotDone: "Two things aren’t done yet:",
  reflectionEmpty: (part) => `Your part ${part} reflection is empty.`,
  checkLockLine:
    "Submitting locks your work for this week, and your facilitator and the programme team can then read your written answer.",
  submitAnyway: "Submit anyway",
  goBackAndFinish: "Go back and finish",
  submittedLine: (at) => `Submitted ${londonDayLabel(at)}, ${londonClockLabel(at)}. Your work for this week is locked.`,
  openLine: /This week locks when it starts\.$/,
  reopenWeek: (week, first) => `Reopen week ${week} for ${first}`,
  reopen: "Reopen",
  reopenedDone: (week, first) => `Week ${week} is open again for ${first}.`,
  reopenedNotAgain: "Reopened, not submitted again",
  reopenedLine: (by, at) =>
    `${by} reopened this week for you. It locks again when you submit it, or at your next session, ${londonDayLabel(at)}, ${londonClockLabel(at)}.`,
});

/** What Fern writes in the report, and what Ada writes in her answer: words nothing else on the site says. */
const REPORT = Object.freeze({
  how: 4,
  wentWell: "The two keepers' argument filled the whole hour.",
  didnt: "We ran out of time for the harbour board question.",
  unclearPart: "Two keepers' views",
  aboutAda: "Brought the diary's numbers to the argument.",
  aboutBen: "Quiet tonight; worth a word before next week.",
  forLead: "Room E1's projector needs a new cable.",
});
const ANSWER = Object.freeze({
  first: "The harbour board should keep the lamps lit, because the ships it charges are the ones that need them.",
  added: " The parish could share the cost of the oil in winter.",
});

let skipReasonFor = () => null;

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
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an admin's, and this harness cannot create an admin."
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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const flat = (text) => text.replace(/\s+/g, " ").trim();
const textOf = async (locator) => flat((await locator.textContent()) ?? "");

test("course hub: a group's sessions and a week's work, from Can't make it to a reopened week", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;
  const personOf = (key) => {
    const found = state.people.find((person) => person.key === key);
    assert.ok(found, `the term has nobody called ${key}`);
    return found;
  };
  const ada = personOf("ada");
  const ben = personOf("ben");
  const fern = state.facilitator;
  assert.ok(fern, "the term has no account to appoint as a facilitator");
  const group = state.groups.find((each) => each.key === WEEK_THREE_WORK.facilitated);
  assert.ok(group, `the term has no group ${WEEK_THREE_WORK.facilitated}`);
  const inGroup = state.people.filter((person) => person.groupKey === group.key);
  assert.deepEqual(inGroup.map((person) => person.key), ["ada", "ben"], "Group A is not Ada and Ben");

  // The run's week, by the group's own calendar: week 3's session is over and week 4's is ahead.
  const thisWeek = 3;
  const nextWeek = 4;
  const thisSession = sessionOf(group, thisWeek);
  const nextSession = sessionOf(group, nextWeek);
  const now = new Date();
  assert.ok(thisSession.endsAt < now, "Group A's week 3 session is not over");
  assert.ok(nextSession.startsAt > now, "Group A's week 4 session has started");
  assert.equal(londonDateKey(now) < nextSession.dateKey, true, "Group A's week 4 session is today");

  const formPath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
  const formBase = `${origin}${formPath}`;
  const groupPath = `/learn/${enc(state.runId)}/group/${enc(group.id)}`;
  const learnUrl = `${origin}/learn/${enc(state.runId)}`;
  const weekUrl = `${origin}/learn/${enc(state.runId)}/weeks/${nextWeek}`;
  const answerId = courseworkItemId(nextWeek, "wa");
  const nextKey = weekDocId(nextWeek);

  const { browser, context, page: adminPage } = await openBrowser();
  const identities = [];
  for (let i = 0; i < 2; i += 1) identities.push(await newIdentityPage(browser));
  const [fernPage, adaPage] = identities.map((each) => each.page);

  let activePage = adminPage;
  const recorder = createStepRecorder({
    t,
    page: {
      screenshot: (options) => activePage.screenshot(options),
      locator: (selector) => activePage.locator(selector),
      url: () => activePage.url(),
      context: () => activePage.context(),
    },
    markerPath: MARKER,
    artifactsDir: ARTIFACTS_DIR,
    skipReasonFor: (name) => skipReasonFor(name),
  });
  const step = (name, fn) => recorder.step(name, fn);

  const recaptchaStubbed = await stubRecaptchaOnLoopback(adminPage, origin);
  for (const pg of [fernPage, adaPage]) await stubRecaptchaOnLoopback(pg, origin);
  if (!recaptchaStubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);

  const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });
  const responseTo = (pg, suffix, method) =>
    pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });
  async function okBody(response, what) {
    const body = await response.json().catch(() => null);
    assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }

  /** Ada's week 4 as stored: where it stands, and her written answer's row. */
  const adasWeek = async () =>
    (await fixtureQuery("courseWeekWork").where("runId", "==", state.runId).get()).docs
      .map((doc) => doc.data())
      .find((doc) => doc.uid === ada.uid && doc.weekId === nextKey) ?? null;
  const adasAnswer = async () =>
    (await fixtureQuery("courseExerciseResponses").where("runId", "==", state.runId).get()).docs
      .map((doc) => doc.data())
      .find((doc) => doc.uid === ada.uid && doc.exerciseId === answerId) ?? null;
  const asDate = (value) => (value && typeof value.toDate === "function" ? value.toDate() : value ? new Date(value) : null);

  /** The week page's line under its title. */
  const lockLineOf = (pg) => pg.locator("main header").getByText(/locks|locked|reopened this week/).first();

  /** The written answer's card on the week page, and its box. */
  const answerCard = (pg) => pg.getByRole("region", { name: WORDS.writtenAnswer, exact: true });
  const answerBox = (pg) => answerCard(pg).getByLabel(WORDS.yourAnswer, { exact: true });

  /** Opens week 4's page and waits for the box to hold what the server stored. */
  async function openWeek(pg) {
    await pg.goto(weekUrl, { waitUntil: "domcontentloaded" });
    await answerCard(pg).getByText(COURSEWORK_ANSWER_PROMPT, { exact: true }).waitFor({ timeout: WAIT_MS });
    await answerBox(pg).waitFor({ timeout: WAIT_MS });
  }

  /** Types into the answer box and waits for the save the box sends. */
  async function writeAnswer(pg, text) {
    const box = answerBox(pg);
    await waitFor("the answer box to take writing", async () => box.isEditable());
    const [saved] = await Promise.all([responseTo(pg, `/written-answers/${answerId}`, "PUT"), box.fill(text)]);
    await okBody(saved, "Saving the written answer");
    await answerCard(pg).getByText(WORDS.saved, { exact: true }).waitFor({ timeout: WAIT_MS });
  }

  /** Submit week 4, the check before it, and Submit anyway; returns the route's answer. */
  async function submitThroughTheCheck(pg) {
    await pg.getByRole("button", { name: WORDS.submitWeek(nextWeek), exact: true }).click();
    const check = pg.getByRole("dialog", { name: WORDS.checkTitle(nextWeek) });
    await check.getByRole("heading", { name: WORDS.checkTitle(nextWeek), exact: true }).waitFor({ timeout: WAIT_MS });
    await check.getByText(WORDS.twoNotDone, { exact: true }).waitFor({ timeout: WAIT_MS });
    const items = (await check.getByRole("listitem").allTextContents()).map(flat);
    assert.deepEqual(items, [WORDS.reflectionEmpty(1), WORDS.reflectionEmpty(2)], "the check names something else as not done");
    await check.getByText(WORDS.checkLockLine, { exact: true }).waitFor({ timeout: WAIT_MS });
    await check.getByRole("button", { name: WORDS.goBackAndFinish, exact: true }).waitFor({ timeout: WAIT_MS });
    const [submitted] = await Promise.all([
      responseTo(pg, `/weeks/${nextKey}/submit`, "POST"),
      check.getByRole("button", { name: WORDS.submitAnyway, exact: true }).click(),
    ]);
    assert.deepEqual(submitted.request().postDataJSON(), { submit: true }, "Submit anyway did not ask to submit the week");
    const body = await okBody(submitted, "Submitting the week");
    assert.equal(body.work?.state, "submitted", "the week is not submitted");
    await check.waitFor({ state: "hidden", timeout: WAIT_MS });
    return body;
  }

  /** The week as Ada reads it once it is submitted: the line, a box that takes nothing, no Submit. */
  async function assertSubmitted(pg, at) {
    await pg.locator("main header").getByText(WORDS.submittedLine(at), { exact: true }).waitFor({ timeout: WAIT_MS });
    assert.equal(await answerBox(pg).isEditable(), false, "the answer box still takes writing once the week is submitted");
    assert.equal(await pg.getByRole("button", { name: WORDS.submitWeek(nextWeek), exact: true }).count(), 0, "a submitted week still offers Submit");
  }

  try {
    await step("the admin approves the facilitator and the member of the group who signs in", async () => {
      activePage = adminPage;
      await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
      for (const account of [fern, ada]) {
        await approvePendingApplicant(adminPage, origin, { email: account.email });
        await waitFor(`${account.first}'s account to say member`, async () => (await readUserDoc(account.uid))?.role === "member");
      }
    });

    await step("the admin names the running course run on the programme's Settings tab", async () => {
      activePage = adminPage;
      await adminPage.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
      const panel = adminPage.getByRole("region", { name: "Course run" });
      await panel.waitFor({ timeout: WAIT_MS });
      const runBox = panel.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [named] = await Promise.all([
        responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
        runBox.selectOption({ label: `${state.runLabel} · Running` }),
      ]);
      assert.equal((await okBody(named, "Naming the run")).panel?.runId, state.runId, "the panel names another run");
    });

    await step("the admin appoints the facilitator to the group whose register nobody has marked", async () => {
      activePage = adminPage;
      await adminPage.goto(`${formBase}/groups/facilitators`, { waitUntil: "domcontentloaded" });
      const card = adminPage.locator('section[aria-labelledby="facilitators-title"]');
      await card.getByRole("button", { name: `Change ${group.name}’s facilitators`, exact: true }).click();
      await card.getByPlaceholder("Search people…").fill(fern.displayName);
      await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(fern.displayName)) }).check();
      const [saved] = await Promise.all([
        responseTo(adminPage, `/groups/${group.id}/facilitators`, "POST"),
        card.getByRole("button", { name: "Save", exact: true }).click(),
      ]);
      assert.deepEqual((await okBody(saved, "Saving the facilitators")).facilitatorUids, [fern.uid]);
    });

    await step(
      "the member presses Can't make it on their next session's ticket, and the ticket says the register records them as excused",
      async () => {
        activePage = adaPage;
        await signIn(adaPage, ada);
        await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const ticket = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
        const press = ticket.getByRole("button", { name: WORDS.cantMakeIt(dayLabel(nextSession.dateKey)), exact: true });
        await press.waitFor({ timeout: WAIT_MS });
        await waitFor("Can't make it to be live once the page has hydrated", async () => press.isEnabled());
        const [said] = await Promise.all([responseTo(adaPage, `/groups/${group.id}/cant-make-it`, "POST"), press.click()]);
        assert.deepEqual(said.request().postDataJSON(), { sessionKey: nextKey, cantMakeIt: true }, "the press named another session");
        assert.deepEqual(await okBody(said, "Can't make it"), { ok: true, told: true, message: WORDS.toldUs });
        await ticket.getByRole("status").filter({ hasText: WORDS.toldUs }).waitFor({ timeout: WAIT_MS });
        await ticket.getByRole("button", { name: WORDS.canMakeItAfterAll, exact: true }).waitFor({ timeout: WAIT_MS });

        // Kept by the register, so a reload still says so.
        const register = (await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${nextKey}`).get()).data();
        assert.equal(register?.records?.[ada.uid], "excused", "the register does not record Ada as excused");
        assert.ok(register?.excusedInAdvance?.[ada.uid], "the register does not say Ada told us in advance");
        assert.equal(register?.records?.[ben.uid], undefined, "Ada's press wrote somebody else's line");
        assert.ok(!register?.pushedAt, "saying Can't make it finished a register");
        await adaPage.reload({ waitUntil: "domcontentloaded" });
        await ticket.getByRole("status").filter({ hasText: WORDS.toldUs }).waitFor({ timeout: WAIT_MS });
        await ticket.getByRole("button", { name: WORDS.canMakeItAfterAll, exact: true }).waitFor({ timeout: WAIT_MS });
      },
    );

    await step(
      "the facilitator's register says who can't make next week's session, and the facilitator marks this week's and finishes it",
      async () => {
        activePage = fernPage;
        await signIn(fernPage, fern);
        await fernPage.goto(`${origin}${groupPath}/register`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        const line = fernPage.getByText(WORDS.registerLine(dayLabel(nextSession.dateKey))).first();
        await line.waitFor({ timeout: WAIT_MS });
        const said = await textOf(line);
        assert.ok(said.includes(ada.first), `the register's line does not name Ada: ${said}`);
        assert.ok(!said.includes(ben.first), `the register's line names Ben: ${said}`);

        // "Rest present" on this week's column marks the two.
        const column = fernPage.getByTestId("attendance-session").filter({ hasText: `Week ${thisWeek}` });
        const [marked] = await Promise.all([
          responseTo(fernPage, `/groups/${group.id}/attendance`, "POST"),
          column.getByTestId("attendance-bulk").click(),
        ]);
        await okBody(marked, "Marking the register");

        const foot = fernPage.getByTestId("register-ending");
        await foot.getByRole("heading", { name: `Week ${thisWeek} register`, exact: true }).waitFor({ timeout: WAIT_MS });
        await foot.getByRole("button").first().click();
        const confirm = fernPage.getByTestId("push-confirm");
        await confirm.waitFor({ timeout: WAIT_MS });
        // The toast that says it is finished covers the page while it is up:
        // caught as it comes, then waited out before the next press.
        const toast = fernPage.locator('[role="status"][aria-live="polite"]').filter({ hasText: /Register (locked|finished)\./ }).first();
        const [pushed] = await Promise.all([
          responseTo(fernPage, "/attendance/push", "POST"),
          toast.waitFor({ timeout: WAIT_MS }),
          fernPage.getByTestId("push-confirm-submit").click(),
        ]);
        assert.deepEqual(pushed.request().postDataJSON(), { weekNumber: thisWeek, occurrence: 1 }, "the press did not name week 3's register");
        const body = await okBody(pushed, "Finishing the register");
        assert.equal(body.sessionKey, weekDocId(thisWeek), "finishing named another register");
        assert.equal(body.alreadyPushed, false, "week 3's register was finished already");
        await toast.waitFor({ state: "hidden", timeout: WAIT_MS });
        const stored = (await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${weekDocId(thisWeek)}`).get()).data();
        assert.ok(stored?.pushedAt, "week 3's register is not finished");
        assert.deepEqual(stored?.records, { [ada.uid]: "present", [ben.uid]: "present" }, "week 3's register is not the two marked present");
      },
    );

    await step("the facilitator follows the finished register's link to the session report and sends one", async () => {
      activePage = fernPage;
      const link = fernPage.getByTestId("register-ending").getByRole("link", { name: WORDS.reportNext, exact: true });
      await link.waitFor({ timeout: WAIT_MS });
      assert.equal(await link.getAttribute("href"), `${groupPath}/report?session=${weekDocId(thisWeek)}`, "the link leads somewhere else");
      await link.click();
      await fernPage.waitForURL((url) => url.pathname === `${groupPath}/report`, { timeout: WAIT_MS });
      await fernPage.getByRole("heading", { level: 1, name: WORDS.reportTitle(thisWeek), exact: true }).waitFor({ timeout: WAIT_MS });

      const form = fernPage.locator("form");
      const send = form.getByRole("button", { name: WORDS.send, exact: true });
      await send.waitFor({ timeout: WAIT_MS });
      await waitFor("Send report to be live once the page has hydrated", async () => send.isEnabled());
      await form.getByRole("group", { name: WORDS.how }).getByRole("radio", { name: String(REPORT.how), exact: true }).check();
      await form.getByLabel(WORDS.wentWell, { exact: true }).fill(REPORT.wentWell);
      await form.getByLabel(WORDS.didnt, { exact: true }).fill(REPORT.didnt);
      await form.getByRole("group", { name: WORDS.unclear }).getByRole("checkbox", { name: REPORT.unclearPart, exact: true }).check();
      await form.getByRole("group", { name: WORDS.engaged }).getByRole("checkbox", { name: new RegExp(escapeRegExp(ada.first)) }).check();
      await form.getByLabel(WORDS.standOut(ada.first), { exact: true }).fill(REPORT.aboutAda);
      await form.getByRole("group", { name: WORDS.needsHand }).getByRole("checkbox", { name: new RegExp(escapeRegExp(ben.first)) }).check();
      await form.getByLabel(WORDS.aWordAbout(ben.first), { exact: true }).fill(REPORT.aboutBen);
      await form.getByLabel(WORDS.forLead, { exact: true }).fill(REPORT.forLead);
      const [sent] = await Promise.all([responseTo(fernPage, `/groups/${group.id}/session-report`, "PUT"), send.click()]);
      const answer = await okBody(sent, "Sending the report");
      assert.equal(answer.ok, true, "the report was not sent");
      assert.equal(sent.request().postDataJSON()?.sessionKey, weekDocId(thisWeek), "the report is on another session");
      await form.getByRole("status").filter({ hasText: WORDS.sent }).waitFor({ timeout: WAIT_MS });

      const reports = (await fixtureQuery("courseSessionReports").where("runId", "==", state.runId).get()).docs.map((doc) => doc.data());
      assert.equal(reports.length, 1, "there is not exactly one report");
      const [report] = reports;
      assert.equal(report.writerUid, fern.uid, "the report is not Fern's");
      assert.equal(report.groupId, group.id);
      assert.equal(report.weekNumber, thisWeek);
      assert.deepEqual([...report.aboutUids].sort(), [ada.uid, ben.uid].sort(), "the report does not pick Ada and Ben");
    });

    await step(
      "the member writes the week's written answer, goes through the check and submits anyway, and the week reads submitted and locked",
      async () => {
        activePage = adaPage;
        await openWeek(adaPage);
        await lockLineOf(adaPage).waitFor({ timeout: WAIT_MS });
        assert.match(await textOf(lockLineOf(adaPage)), WORDS.openLine, "the week does not say it locks at the session");
        await writeAnswer(adaPage, ANSWER.first);
        const body = await submitThroughTheCheck(adaPage);
        assert.deepEqual(body.sent.map((each) => each.id), [answerId], "submitting did not send the written answer");
        const submittedAt = new Date(body.work.submittedAt);
        await assertSubmitted(adaPage, submittedAt);

        // Stored, and drawn the same from the server after a reload.
        const work = await adasWeek();
        assert.ok(work?.submittedAt, "the week has no submit stamp");
        assert.equal(work.submitCount, 1, "the week was submitted more than once");
        const row = await adasAnswer();
        assert.equal(row?.text, ANSWER.first, "the stored answer is not what Ada wrote");
        assert.ok(row?.firstSentAt, "the answer was not sent");
        await openWeek(adaPage);
        await assertSubmitted(adaPage, asDate(work.submittedAt));
        assert.equal(await answerBox(adaPage).inputValue(), ANSWER.first, "the answer read back is not what Ada wrote");
      },
    );

    await step("the facilitator reopens the member's week from This week's work", async () => {
      activePage = fernPage;
      await fernPage.goto(`${origin}${groupPath}`, { waitUntil: "domcontentloaded" });
      await fernPage.getByRole("heading", { name: group.name, level: 1 }).waitFor({ timeout: WAIT_MS });
      const press = fernPage.getByRole("button", { name: WORDS.reopenWeek(nextWeek, ada.first), exact: true });
      await press.waitFor({ timeout: WAIT_MS });
      await waitFor("Reopen to be live once the page has hydrated", async () => press.isEnabled());
      // Nobody else's week is submitted, so only Ada's offers a reopen.
      assert.equal(
        await fernPage.getByRole("button", { name: WORDS.reopenWeek(nextWeek, ben.first), exact: true }).count(),
        0,
        "Ben's week, never submitted and not locked, offers a reopen",
      );
      await press.click();
      const dialog = fernPage.getByRole("dialog", { name: WORDS.reopenWeek(nextWeek, ada.first) });
      await dialog.getByRole("heading", { name: `${WORDS.reopenWeek(nextWeek, ada.first)}?`, exact: true }).waitFor({ timeout: WAIT_MS });
      const [reopened] = await Promise.all([
        responseTo(fernPage, `/weeks/${nextKey}/reopen`, "POST"),
        dialog.getByRole("button", { name: WORDS.reopen, exact: true }).click(),
      ]);
      assert.deepEqual(reopened.request().postDataJSON(), { uid: ada.uid }, "the press reopened somebody else's week");
      const body = await okBody(reopened, "Reopening the week");
      assert.equal(body.work?.state, "reopened", "the week is not reopened");
      assert.equal(body.work?.reopened?.byName, fern.first, "the reopen does not name Fern");
      // The press says so, and then the page is drawn again from the server,
      // where Ada's week is open again: no reopen to offer, and her line says
      // where it stands. (The press's own line goes with its button.)
      await fernPage
        .getByText(new RegExp(`^(${escapeRegExp(WORDS.reopenedDone(nextWeek, ada.first))}|${escapeRegExp(WORDS.reopenedNotAgain)})$`))
        .first()
        .waitFor({ timeout: WAIT_MS });
      await fernPage.getByText(WORDS.reopenedNotAgain, { exact: true }).first().waitFor({ timeout: WAIT_MS });
      await press.waitFor({ state: "detached", timeout: WAIT_MS });

      const work = await adasWeek();
      assert.equal(work?.submittedAt, null, "the reopen left the submit stamp");
      assert.equal(work?.reopenedByUid, fern.uid, "the reopen does not name Fern");
      assert.equal(work?.reopenCount, 1);
    });

    await step("the member's week page says who reopened it, and the member changes the answer and submits it again", async () => {
      activePage = adaPage;
      await openWeek(adaPage);
      await adaPage
        .locator("main header")
        .getByText(WORDS.reopenedLine(fern.first, nextSession.startsAt), { exact: true })
        .waitFor({ timeout: WAIT_MS });
      const firstSentAt = asDate((await adasAnswer())?.firstSentAt);
      await writeAnswer(adaPage, `${ANSWER.first}${ANSWER.added}`);
      const body = await submitThroughTheCheck(adaPage);
      // Sent the first time: the answer is not sent again, and keeps when it first was.
      assert.deepEqual(body.sent, [], "submitting again sent the answer a second time");
      await assertSubmitted(adaPage, new Date(body.work.submittedAt));

      const work = await adasWeek();
      assert.equal(work?.submitCount, 2, "the week was not submitted twice");
      assert.equal(work?.reopenCount, 1);
      const row = await adasAnswer();
      assert.equal(row?.text, `${ANSWER.first}${ANSWER.added}`, "the stored answer is not the changed one");
      assert.equal(asDate(row?.firstSentAt)?.getTime(), firstSentAt?.getTime(), "submitting again moved when the answer was first sent");
      await openWeek(adaPage);
      await assertSubmitted(adaPage, asDate(work.submittedAt));
    });

    await step("the programme's lead follows the Surveys tab's link to the session reports and reads the facilitator's report, with names", async () => {
      activePage = adminPage;
      // From the programme's head, its Surveys tab: no week of check-ins
      // shows yet, so the Overview's reports are the latest week's with one.
      await adminPage.goto(`${formBase}/overview`, { waitUntil: "domcontentloaded" });
      await adminPage.getByRole("navigation", { name: WORDS.sections }).getByRole("link", { name: WORDS.surveysTab, exact: true }).click();
      await adminPage.waitForURL((url) => url.pathname === `${formPath}/surveys`, { timeout: WAIT_MS });
      const overview = adminPage.getByRole("region", { name: WORDS.reportsWeek(thisWeek), exact: true });
      await overview.getByText(WORDS.reportsAverage(REPORT.how), { exact: true }).waitFor({ timeout: WAIT_MS });
      const read = overview.getByRole("link", { name: WORDS.readReport, exact: true });
      assert.equal(await read.getAttribute("href"), `${formPath}/surveys/reports#reports-week-${thisWeek}`, "Read the report leads somewhere else");
      await read.click();
      await adminPage.waitForURL((url) => url.pathname === `${formPath}/surveys/reports` && url.hash === `#reports-week-${thisWeek}`, {
        timeout: WAIT_MS,
      });
      await adminPage.getByRole("heading", { level: 2, name: WORDS.reportsTitle, exact: true }).waitFor({ timeout: WAIT_MS });
      const current = adminPage.getByRole("navigation", { name: WORDS.surveysViews }).locator('a[aria-current="page"]');
      assert.equal(await textOf(current), WORDS.reportsView, "the row of views does not mark Facilitators' reports as current");
      const week = adminPage.getByRole("region", { name: `Week ${thisWeek}`, exact: true });
      await week.waitFor({ timeout: WAIT_MS });
      const card = week.getByRole("article");
      assert.equal(await card.count(), 1, "week 3 does not hold exactly one report");
      const heading = await textOf(card.getByRole("heading", { level: 4 }));
      assert.ok(heading.startsWith(`${group.name} · `) && heading.includes(fern.first), `the report's heading is not Group A's and Fern's: ${heading}`);
      const said = await textOf(card);
      for (const words of [WORDS.howOf(REPORT.how), REPORT.wentWell, REPORT.didnt, REPORT.unclearPart, REPORT.aboutAda, REPORT.aboutBen, REPORT.forLead]) {
        assert.ok(said.includes(words), `the report does not say ${JSON.stringify(words)}: ${said}`);
      }
      // With names: the people it picks, by the names the lead is shown.
      for (const person of [ada, ben]) assert.ok(said.includes(person.first), `the report does not name ${person.first}: ${said}`);
      assert.ok(said.includes(londonDayLabel(thisSession.startsAt)), `the report does not give its session's day: ${said}`);
    });
  } finally {
    await Promise.allSettled([context, ...identities.map((each) => each.context)].map((each) => each.close()));
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
