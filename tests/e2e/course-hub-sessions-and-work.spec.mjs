/**
 * A group's sessions and a week's work, end to end in a real browser.
 *
 * The world's week's work point (scripts/e2e-fixtures/worlds/course-hub-term.mjs):
 * three weeks into the fellowship, Ada and Ben in Group A, Group A's week 3
 * register never opened, weeks 1 to 4 published and written as blocks, and
 * Group A's week 4 session days ahead.
 *
 * -> the admin approves Ada and Fern -> names the running run -> appoints
 * Fern to Group A -> Ada's next session's ticket offers Can't make it as a
 * request an admin decides (joining online beside what it asks her to
 * confirm), never the instant button, and opening it writes nothing -> Ada
 * answers Can you make this time most weeks? with Most weeks, not all,
 * ticking weeks 4 and 5 (her first answer, so ticks are taken), and their
 * registers record her as excused, after a reload too -> Fern's
 * register says Ada can't make week 4, and leads to week 3's
 * session report before it is finished; Fern marks week 3, puts Ada down as
 * having joined it online, and finishes it -> Fern follows "Next: two
 * minutes on how it went." to the session report and sends one -> Ada can
 * make week 4 after all and unticks it: having answered, unticking is all
 * the card offers, a week added is refused, and week 6 is asked about on
 * Can't make it instead (the sheet offers it; nothing is sent, because
 * asking emails the admins and this spec runs where mail is real); then she
 * says she is joining week 4 online, one thing at a time on the ticket, and
 * the email log holds the one email that tells Fern so -> the box at the top of Fern's group page asks
 * for a meeting link for week 4, Fern adds one, and the box and the register
 * say Ada is joining online -> Ada's ticket, on the programme page and on
 * Home, carries the link for anybody joining online, beside Add to calendar
 * -> Ada writes week 4's written answer and presses Send my answer: the page
 * says when it was sent, with Change my answer, and the week stays open,
 * after a reload too -> Ada changes it before the session, and the page says
 * the people who read her work still see the version she sent -> Fern's
 * reading view of Ada's week shows the answer as sent, never the change, and
 * says Ada has changed it since sending it -> the programme's
 * lead (the admin) opens the Surveys tab from the programme's head, follows
 * the Overview's "Read the report" to the session reports, and reads Fern's
 * report with names -> the lead's Attendance tab says Ada came to one session
 * online -> Group A's week 4 session starts (the fixture moves Group A's own
 * calendar so it started minutes ago): Ada's page says Group A met and that
 * she can still finish it; she writes a reflection, changes her answer and
 * sends it, and each says how many minutes after her session -> Fern's reading
 * view says "Late" with how late and shows the answer as it stood at the
 * session; the group's reflections with names (the page of one question) and
 * This week's work say how late too -> Ben, another fellow of Group A, reads
 * none of Ada's work on any of those pages, nor through the older pages'
 * addresses, which forward to them.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-sessions-and-work
 *
 * It reads no mail (of the mail, only the email log's row for the email that
 * tells Fern Ada is joining online), so it runs against a deployed target
 * too. Every account it signs in as is the harness's own, and the only email
 * it can cause (the approvals, the email that tells Fern Ada is joining
 * online, the week 4 email the finished register may send) goes to the
 * fixture's own addresses. CHROMIUM ONLY:
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
import { RECAPTCHA_DEPENDENT_STEPS, SPEC, startGroupSession } from "../../scripts/e2e-fixtures/course-hub-sessions-and-work.mjs";
import {
  COURSEWORK_ANSWER_PROMPT,
  COURSEWORK_PROMPTS,
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
 * src/lib/courses/joiningOnline/words.ts, src/lib/courses/sessionChange/words.ts,
 * src/lib/courses/timeAnswer/words.ts, src/lib/courses/sessionReports/words.ts,
 * src/lib/courses/weekWork/words.ts and src/lib/courses/writtenAnswerWords.ts,
 * with their slots filled from the records.
 */
const WORDS = Object.freeze({
  // "Can you make this time most weeks?" (src/lib/courses/timeAnswer/words.ts).
  timeCard: "Can you make this time most weeks?",
  mostWeeks: "Most weeks, not all",
  sessionOption: (week, day) => `Week ${week}, ${day}`,
  sendAnswer: "Send",
  changeAnswer: "Change your answer",
  savedMostWeeks: "Thanks. You’ve told us you can make it most weeks.",
  saidMostWeeks: "You’ve told us you can make it most weeks.",
  missing: (days) => `You can’t make ${days.join(" or ")}, and whoever runs your sessions knows.`,
  ticket: "Your next session",
  cantMakeIt: (day) => `Can’t make it on ${day}`,
  // The request behind Can't make it (src/lib/courses/excused/ownWords.ts).
  cantMakeDay: (day) => `Can’t make ${day}?`,
  // What the request asks them to confirm (src/lib/courses/excused/ownWords.ts).
  confirmOwnOnline: "I can’t join my own group’s session online.",
  weekChoice: (week, day) => `Week ${week} · ${day}`,
  // Once answered, unticking is all the card takes (src/lib/courses/timeAnswer/words.ts).
  untickOnly: "You can untick a week here. To miss another week, press Can’t make it on your next session’s card and ask to be excused.",
  addLater:
    "You’ve answered this already, so no week can be added here. To miss another week, press Can’t make it on your next session’s card and ask to be excused.",
  excused: "Excused",
  saidWhenTimeSet: "Said when the time was set",
  // The instant button's own words, which a member taking part is never shown now.
  toldUs:
    "You’ve told us you can’t make this session, so the register records you as excused. Your facilitators see it there.",
  canMakeItAfterAll: "I can make it after all",
  joiningOnline: (day) => `Joining online on ${day}`,
  saidOnline:
    "You’ve said you’re joining online, and your facilitators can see that. The link to join will be on this ticket, not in your emails.",
  saidOnlineLinked: "You’ve said you’re joining online, and your facilitators can see that. The link to join is on this ticket.",
  inTheRoomAfterAll: "I’ll be in the room after all",
  // The email that tells the group's facilitators (src/lib/courses/joiningOnline/words.ts).
  toldFacilitators: (name, week) => `${name} is joining week ${week} online`,
  whereChoice: (name, week, online) =>
    `Where ${name} was in week ${week}: ${online ? "joined online" : "in the room"}. Sets ${online ? "in the room" : "joined online"}.`,
  boxAsks: (count, day, week) =>
    `${count === 1 ? "1 person is" : `${count} people are`} joining online on ${day}. Add a meeting link for week ${week}.`,
  boxSays: (name, day) => `${name} is joining online on ${day}.`,
  linkField: (week) => `Meeting link for week ${week}`,
  addLink: "Add the link",
  joinOnline: "Join online",
  forJoiningOnline: "For anybody joining online. The link is here, not in your emails, so it can’t be forwarded.",
  addToCalendar: "Add to calendar",
  attendanceTab: "Attendance",
  roomAndOnline: (room, online) => `${room} in the room, ${online} online`,
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
  // The week stays open (src/lib/courses/weekWork/words.ts).
  sendMyAnswer: "Send my answer",
  changeMyAnswer: "Change my answer",
  untilLine: (session, room) =>
    new RegExp(
      `^Your session: ${escapeRegExp(`${londonDayLabel(session)}, ${londonClockLabel(session)}, ${room}`)}\\. ` +
        "Your work stays open after it: anything you add or change after it shows as late to the people who read your work, with how late\\. " +
        "This week stays open until the programme closes, at the end of [A-Z][a-z]{2} \\d{1,2} [A-Z][a-z]{2}\\.$",
    ),
  staysOpen: /^This week stays open until the programme closes, at the end of [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}\.$/,
  doneOnceSent: (week) => `Week ${week} is done once it’s sent and everything else it asks for is done.`,
  sentLine: (at) => `Sent ${londonDayLabel(at)}, ${londonClockLabel(at)}.`,
  changedBefore: "You’ve changed it since you sent it. The people who read your work still see the version you sent until you send it again.",
  changedAfter: "You’ve changed it since you sent it. Your session has started, so the people who read your work see your latest words.",
  staffChangedBefore: (first) => `${first} has changed it since sending it. You read it as sent until it’s sent again or the session starts.`,
  met: (group, week, at) =>
    `${group} met for week ${week} on ${londonDayLabel(at)}. You can still finish it. Anything you add or change now shows as late to the people who read your work, with how late.`,
  savedLate: /^Saved [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{1,2}(?::\d{2})?[ap]m: \d+ minutes? after your session$/,
  sentLate: /^Sent [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{1,2}(?::\d{2})?[ap]m: \d+ minutes? after your session$/,
  staffLate: /Late: \d+ minutes? after the session/,
  atSession: "As it stood at the session",
  thisWeeksWork: "This week’s work",
});

/** The link Fern gives week 4, at a reserved domain nothing answers on. */
const LINK = "https://meet.example.com/e2e-week-4";

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
  more: " Volunteers could take the dark months in turns.",
});
/** What Ada writes in week 4's first reflection, once the session has started. */
const REFLECTION = "Three of the five lamps on the point still burn every night.";

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

test("course hub: a group's sessions and a week's work, from Can't make it to work added after the session", { skip: skipReason ?? false }, async (t) => {
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
  // The session after next, which only "Most weeks, not all" reaches from the programme page.
  const laterWeek = nextWeek + 1;
  const laterSession = sessionOf(group, laterWeek);
  const laterKey = weekDocId(laterWeek);
  assert.ok(laterSession.startsAt > nextSession.startsAt, "Group A's week 5 session is not after week 4's");

  const { browser, context, page: adminPage } = await openBrowser();
  const identities = [];
  for (let i = 0; i < 3; i += 1) identities.push(await newIdentityPage(browser));
  const [fernPage, adaPage, benPage] = identities.map((each) => each.page);

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
  for (const pg of [fernPage, adaPage, benPage]) await stubRecaptchaOnLoopback(pg, origin);
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

  /** The week page's line under its title: until when the work can change. */
  const untilLineOf = (pg) => pg.locator("main header").getByText(/This week stays open until the programme closes|The programme closed/).first();

  /** The written answer's card on the week page, and its box. */
  const answerCard = (pg) => pg.getByRole("region", { name: WORDS.writtenAnswer, exact: true });
  const answerBox = (pg) => answerCard(pg).getByLabel(WORDS.yourAnswer, { exact: true });
  const sendButton = (pg) => answerCard(pg).getByRole("button", { name: WORDS.sendMyAnswer, exact: true });
  const changeButton = (pg) => answerCard(pg).getByRole("button", { name: WORDS.changeMyAnswer, exact: true });

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

  /** Send my answer, and the route's answer: the answer as sent, and the week, still open. */
  async function sendAnswer(pg) {
    const press = sendButton(pg);
    await press.waitFor({ timeout: WAIT_MS });
    await waitFor("Send my answer to be live once the page has hydrated", async () => press.isEnabled());
    const [sent] = await Promise.all([responseTo(pg, `/written-answers/${answerId}/send`, "POST"), press.click()]);
    assert.deepEqual(sent.request().postDataJSON(), { weekId: nextKey }, "Send my answer sent somebody else's week");
    const body = await okBody(sent, "Sending the written answer");
    assert.ok(body.written?.firstSentAt, "the send stamped no first send");
    assert.equal(body.work?.closed, false, "a send closed the week");
    await press.waitFor({ state: "detached", timeout: WAIT_MS });
    return body;
  }

  /** The reading view of Ada's week 4 on the group's side, at her written answer, as `pg`'s reader opens it. */
  const readingUrl = `${origin}${groupPath}/coursework/${enc(ada.uid)}?week=${nextWeek}#reading-answer`;
  /** The group's week 4 reflections with names: the page of one question across the group, at the week's first reflection. */
  const namesUrl = `${origin}${groupPath}/question?week=${nextWeek}&first=reflection`;
  /** The older addresses of the same two, which forward to them. */
  const olderUrls = [`${origin}${groupPath}/written?week=${nextWeek}&person=${enc(ada.uid)}`, `${origin}${groupPath}/reflections/names?week=${nextWeek}`];
  /** The written answer in the reading view: the answer, and what is said beside it. */
  const answerOn = (pg) => pg.locator('section[aria-labelledby="reading-answer"]');
  /** Ada's row on the page of one question: a section carrying her id. */
  const adaRowOn = (pg) => pg.locator(`section[id="p-${ada.uid}"]`);

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
      "the member's next session's ticket offers Can't make it as a request an admin decides, joining online beside what it asks them to confirm, never the instant button, and opening it writes nothing",
      async () => {
        activePage = adaPage;
        await signIn(adaPage, ada);
        await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const ticket = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
        const day = dayLabel(nextSession.dateKey);
        const press = ticket.getByRole("button", { name: WORDS.cantMakeIt(day), exact: true });
        await press.waitFor({ timeout: WAIT_MS });
        // The way in to a request, not the instant button: no take-back, no line saying the register records her.
        assert.equal(await press.getAttribute("data-testid"), "excuse-open", "the ticket offers the instant Can't make it");
        assert.equal(await ticket.getByRole("button", { name: WORDS.canMakeItAfterAll, exact: true }).count(), 0, "the instant button's take-back is drawn");
        assert.ok(!(await textOf(ticket)).includes(WORDS.toldUs), "the instant button's line is drawn");
        await waitFor("Can't make it to be live once the page has hydrated", async () => press.isEnabled());
        await press.click();
        const sheet = adaPage.getByTestId("excuse-sheet");
        await sheet.getByRole("heading", { name: WORDS.cantMakeDay(day), exact: true }).waitFor({ timeout: WAIT_MS });
        // Week 4 is in a room: the request asks her to confirm she can't join
        // it online, with today's Joining online beside that line.
        const form = sheet.getByTestId("excuse-ask-form");
        await form.getByRole("button", { name: WORDS.joiningOnline(day), exact: true }).waitFor({ timeout: WAIT_MS });
        await form.getByRole("checkbox", { name: WORDS.confirmOwnOnline, exact: true }).waitFor({ state: "attached", timeout: WAIT_MS });
        await sheet.getByRole("button", { name: "Close", exact: true }).click();
        await sheet.waitFor({ state: "detached", timeout: WAIT_MS });

        // Opening it wrote nothing: no line on the register, no request.
        const register = (await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${nextKey}`).get()).data();
        assert.equal(register?.records?.[ada.uid], undefined, "opening Can't make it wrote a line");
        const requests = await fixtureQuery("courseRequests").where("runId", "==", state.runId).get();
        assert.equal(requests.size, 0, "opening Can't make it made a request");
      },
    );

    await step(
      "the member answers Can you make this time most weeks? with Most weeks, not all, ticking the next session and a later one, and their registers record them as excused",
      async () => {
        activePage = adaPage;
        // Still on her programme page from the step before.
        const card = adaPage.getByRole("region", { name: WORDS.timeCard, exact: true });
        const most = card.getByRole("button", { name: WORDS.mostWeeks, exact: true });
        await most.waitFor({ timeout: WAIT_MS });
        await waitFor("Most weeks, not all to be live once the page has hydrated", async () => most.isEnabled());
        await most.click();
        const nextDay = dayLabel(nextSession.dateKey);
        const laterDay = dayLabel(laterSession.dateKey);
        // The group's sessions still to come, none ticked: she has told nobody anything yet.
        const nextBox = card.getByRole("checkbox", { name: WORDS.sessionOption(nextWeek, nextDay), exact: true });
        const laterBox = card.getByRole("checkbox", { name: WORDS.sessionOption(laterWeek, laterDay), exact: true });
        await nextBox.waitFor({ state: "attached", timeout: WAIT_MS });
        assert.equal(await nextBox.isChecked(), false, "a session she said nothing about is ticked");
        assert.equal(await laterBox.isChecked(), false, "a session she said nothing about is ticked");
        // The row is the box's label: pressing it ticks the box.
        await card.getByText(WORDS.sessionOption(nextWeek, nextDay), { exact: true }).click();
        await waitFor("week 4 to be ticked", async () => nextBox.isChecked());
        await card.getByText(WORDS.sessionOption(laterWeek, laterDay), { exact: true }).click();
        await waitFor("week 5 to be ticked", async () => laterBox.isChecked());
        const [sent] = await Promise.all([
          responseTo(adaPage, `/runs/${enc(state.runId)}/time-answer`, "POST"),
          card.getByRole("button", { name: WORDS.sendAnswer, exact: true }).click(),
        ]);
        assert.deepEqual(
          sent.request().postDataJSON(),
          { groupId: group.id, kind: "mostWeeks", sessionKeys: [nextKey, laterKey] },
          "the answer named other sessions than the ticks",
        );
        assert.deepEqual(await okBody(sent, "Most weeks, not all"), {
          ok: true,
          answer: { kind: "mostWeeks", reason: null, alternatives: null, sessionKeys: [nextKey, laterKey] },
          message: WORDS.savedMostWeeks,
        });
        await card.getByRole("status").filter({ hasText: WORDS.savedMostWeeks }).waitFor({ timeout: WAIT_MS });
        await card.getByText(WORDS.missing([nextDay, laterDay]), { exact: true }).waitFor({ timeout: WAIT_MS });

        // Weeks 4 and 5's registers: her line alone on each, excused on her word, not finished.
        for (const key of [nextKey, laterKey]) {
          const doc = (await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${key}`).get()).data();
          assert.equal(doc?.records?.[ada.uid], "excused", `${key}'s register does not record Ada as excused`);
          assert.ok(doc?.excusedInAdvance?.[ada.uid], `${key}'s register does not say Ada told us in advance`);
          assert.deepEqual(Object.keys(doc?.records ?? {}), [ada.uid], "her answer wrote somebody else's line");
          assert.ok(!doc?.pushedAt, "her answer finished a register");
        }
        const seat = (await fixtureDoc("courseEnrolments", `${state.runId}__${ada.uid}`).get()).data();
        assert.equal(seat?.timeAnswer?.kind, "mostWeeks");
        assert.deepEqual(seat?.timeAnswer?.sessionKeys, [nextKey, laterKey]);
        assert.equal(seat?.groupId, group.id, "her answer moved her");

        // Kept, so a reload says the same.
        await adaPage.reload({ waitUntil: "domcontentloaded" });
        await card.getByText(WORDS.saidMostWeeks, { exact: true }).waitFor({ timeout: WAIT_MS });
        await card.getByText(WORDS.missing([nextDay, laterDay]), { exact: true }).waitFor({ timeout: WAIT_MS });
        // The ticket says she is excused, said when the time was set, and offers nothing to take back.
        const ticket = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
        await ticket.getByText(WORDS.saidWhenTimeSet, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await ticket.getByRole("button", { name: WORDS.canMakeItAfterAll, exact: true }).count(), 0, "the instant button's take-back is drawn");
        assert.equal(await ticket.getByRole("button", { name: WORDS.cantMakeIt(nextDay), exact: true }).count(), 0, "Can't make it is offered on a session she is excused from");
      },
    );

    await step(
      "the facilitator's register says who can't make next week's session, leads to this week's session report before it is finished, and the facilitator marks this week's, puts the member down as having joined it online, and finishes it",
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

        // The way on to this week's session report is there from the
        // session's start, beside the check-in, while nobody is marked and
        // the register is not finished, and never in the register's foot.
        const reportLink = fernPage.getByTestId("register-report").getByRole("link", { name: WORDS.reportNext, exact: true });
        await reportLink.waitFor({ timeout: WAIT_MS });
        const reportHref = `${groupPath}/report?session=${weekDocId(thisWeek)}`;
        assert.equal(await reportLink.getAttribute("href"), reportHref, "the unfinished register leads to another session's report");
        assert.equal(
          await fernPage.getByTestId("register-ending").getByRole("link", { name: WORDS.reportNext, exact: true }).count(),
          0,
          "the register's foot leads to the report as well",
        );

        // "Rest present" on this week's column marks the two.
        const column = fernPage.getByTestId("attendance-session").filter({ hasText: `Week ${thisWeek}` });
        const [marked] = await Promise.all([
          responseTo(fernPage, `/groups/${group.id}/attendance`, "POST"),
          column.getByTestId("attendance-bulk").click(),
        ]);
        await okBody(marked, "Marking the register");
        // Nobody said they were joining week 3 online, so "Rest present" puts both in the room.
        assert.deepEqual(
          marked.request().postDataJSON()?.marks?.map((mark) => [mark.uid, mark.status, mark.online]).sort(),
          [[ada.uid, "present", false], [ben.uid, "present", false]].sort(),
          "Rest present did not say where each of them was",
        );
        // Marked and still not finished: the way on is where it was.
        assert.equal(await reportLink.getAttribute("href"), reportHref, "marking the register moved the way on to the report");

        // Ada joined from home: the choice beside Ada's mark, in the register as it is taken.
        const where = fernPage.getByTestId("attendance-grid").getByRole("button", { name: WORDS.whereChoice(ada.first, thisWeek, false), exact: true });
        await where.waitFor({ timeout: WAIT_MS });
        const [placed] = await Promise.all([responseTo(fernPage, `/groups/${group.id}/attendance`, "POST"), where.click()]);
        assert.deepEqual(
          placed.request().postDataJSON(),
          { weekNumber: thisWeek, occurrence: 1, marks: [{ uid: ada.uid, status: "present", online: true }] },
          "the choice sent something other than Ada's place",
        );
        await okBody(placed, "Putting Ada down as having joined online");
        await fernPage
          .getByTestId("attendance-grid")
          .getByRole("button", { name: WORDS.whereChoice(ada.first, thisWeek, true), exact: true })
          .waitFor({ timeout: WAIT_MS });

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
        // Where they were, beside the marks and never one of them.
        assert.deepEqual(stored?.online, { [ada.uid]: true, [ben.uid]: false }, "week 3's register does not say Ada joined online and Ben was in the room");
        // Finishing rebuilt their figures: Ada came to one session online.
        const rollupOf = async (person) => (await fixtureDoc("courseEnrolments", `${state.runId}__${person.uid}`).get()).data()?.attendance;
        assert.equal((await rollupOf(ada))?.online, 1, "Ada's figures do not count the session online");
        assert.equal((await rollupOf(ben))?.online, 0, "Ben's figures count a session online");
      },
    );

    await step("the facilitator follows the finished register's link to the session report and sends one", async () => {
      activePage = fernPage;
      // Kept once the register is finished, beside the check-in where it was.
      const link = fernPage.getByTestId("register-report").getByRole("link", { name: WORDS.reportNext, exact: true });
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
      "the member can make next week's session after all and unticks it, all an answer takes once given, asks about another week on Can't make it instead, and says they are joining online, one thing at a time, and the group's facilitator is emailed that they are",
      async () => {
        activePage = adaPage;
        const day = dayLabel(nextSession.dateKey);
        const laterDay = dayLabel(laterSession.dateKey);
        await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const ticket = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
        await ticket.getByText(WORDS.saidWhenTimeSet, { exact: true }).waitFor({ timeout: WAIT_MS });
        // While Ada is excused from it, Joining online is not offered.
        assert.equal(await ticket.getByRole("button", { name: WORDS.joiningOnline(day), exact: true }).count(), 0, "Joining online is offered on a session she is excused from");

        // Her way back is the answer she gave: week 4 unticked, week 5 kept.
        const card = adaPage.getByRole("region", { name: WORDS.timeCard, exact: true });
        const change = card.getByRole("button", { name: WORDS.changeAnswer, exact: true });
        await waitFor("Change your answer to be live once the page has hydrated", async () => change.isEnabled());
        await change.click();
        await card.getByRole("button", { name: WORDS.mostWeeks, exact: true }).click();
        const nextBox = card.getByRole("checkbox", { name: WORDS.sessionOption(nextWeek, day), exact: true });
        const laterBox = card.getByRole("checkbox", { name: WORDS.sessionOption(laterWeek, laterDay), exact: true });
        await nextBox.waitFor({ state: "attached", timeout: WAIT_MS });
        assert.equal(await nextBox.isChecked(), true, "week 4, which she gave, is not ticked");
        // She has answered this asking: the card offers the weeks she ticked, to untick, and says where to ask instead.
        await card.getByText(WORDS.untickOnly, { exact: true }).waitFor({ timeout: WAIT_MS });
        const lastWeek = laterWeek + 1;
        const lastDay = dayLabel(sessionOf(group, lastWeek).dateKey);
        assert.equal(await card.getByRole("checkbox", { name: WORDS.sessionOption(lastWeek, lastDay), exact: true }).count(), 0, "a week she did not tick is offered");
        await card.getByText(WORDS.sessionOption(nextWeek, day), { exact: true }).click();
        await waitFor("week 4 to be unticked", async () => !(await nextBox.isChecked()));
        assert.equal(await laterBox.isChecked(), true, "week 5 lost its tick");
        const [undone] = await Promise.all([
          responseTo(adaPage, `/runs/${enc(state.runId)}/time-answer`, "POST"),
          card.getByRole("button", { name: WORDS.sendAnswer, exact: true }).click(),
        ]);
        assert.deepEqual(undone.request().postDataJSON(), { groupId: group.id, kind: "mostWeeks", sessionKeys: [laterKey] }, "the answer named other sessions than the ticks");
        await okBody(undone, "Most weeks, not all, without week 4");
        await waitFor("week 4's line to be taken back", async () => {
          const doc = (await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${nextKey}`).get()).data();
          return doc?.records?.[ada.uid] === undefined;
        });
        // A week added to the answer now, by an old page or by hand, is refused, and says where to ask.
        const lastKey = weekDocId(lastWeek);
        const added = await adaPage.evaluate(
          async ({ path, body }) => {
            const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            return { status: res.status, body: await res.json().catch(() => null) };
          },
          { path: `/api/courses/runs/${enc(state.runId)}/time-answer`, body: { groupId: group.id, kind: "mostWeeks", sessionKeys: [laterKey, lastKey] } },
        );
        assert.equal(added.status, 409, `adding a week answered ${added.status}: ${JSON.stringify(added.body)}`);
        assert.ok(String(added.body?.error ?? "").endsWith(WORDS.addLater), JSON.stringify(added.body));
        const lastRegister = (await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${lastKey}`).get()).data();
        assert.equal(lastRegister?.records?.[ada.uid], undefined, "a refused tick wrote a line");

        // The ticket, read again, offers Joining online and Can't make it, one at a time.
        await adaPage.reload({ waitUntil: "domcontentloaded" });
        const join = ticket.getByRole("button", { name: WORDS.joiningOnline(day), exact: true });
        await join.waitFor({ timeout: WAIT_MS });
        const cant = ticket.getByRole("button", { name: WORDS.cantMakeIt(day), exact: true });
        await cant.waitFor({ timeout: WAIT_MS });
        // Week 6 is asked about here instead: the request offers it beside week 4. Nothing is sent:
        // asking emails the admins, and this journey runs where mail is real.
        await waitFor("Can't make it to be live once the page has hydrated", async () => cant.isEnabled());
        await cant.click();
        const sheet = adaPage.getByTestId("excuse-sheet");
        await sheet.getByRole("checkbox", { name: WORDS.weekChoice(lastWeek, lastDay), exact: true }).waitFor({ state: "attached", timeout: WAIT_MS });
        await sheet.getByRole("button", { name: "Close", exact: true }).click();
        await sheet.waitFor({ state: "detached", timeout: WAIT_MS });
        await waitFor("Joining online to be live once the page has hydrated", async () => join.isEnabled());
        const [said] = await Promise.all([responseTo(adaPage, `/groups/${group.id}/joining-online`, "POST"), join.click()]);
        assert.deepEqual(said.request().postDataJSON(), { sessionKey: nextKey, online: true }, "the press named another session");
        assert.deepEqual(await okBody(said, "Joining online"), { ok: true, online: true, message: WORDS.saidOnline });
        await ticket.getByRole("status").filter({ hasText: WORDS.saidOnline }).waitFor({ timeout: WAIT_MS });
        await ticket.getByRole("button", { name: WORDS.inTheRoomAfterAll, exact: true }).waitFor({ timeout: WAIT_MS });
        // And now Can't make it waits until Ada is in the room after all.
        assert.equal(await ticket.getByRole("button", { name: WORDS.cantMakeIt(day), exact: true }).count(), 0, "Can't make it is offered beside Joining online");

        // Kept on the register beside its marks, never one of them; the excuse is gone with the word that made it.
        const register = (await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${nextKey}`).get()).data();
        assert.ok(register?.onlineSaid?.[ada.uid], "the register does not keep Ada's word about joining online");
        assert.equal(register?.records?.[ada.uid], undefined, "saying it wrote a mark");
        assert.equal(register?.excusedInAdvance?.[ada.uid], undefined, "Ada's word that Ada can't make it is still there");
        assert.equal(register?.onlineSaid?.[ben.uid], undefined, "Ada's press wrote somebody else's word");
        assert.ok(register?.onlineEmailed?.[ada.uid], "the register does not keep that Fern was told");
        // Fern, the group's facilitator, is emailed once, with its own kind in the log, and Ada is not.
        const told = await waitFor("the email that tells Fern Ada is joining online, in the email log", async () => {
          const rows = (await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get()).docs
            .map((doc) => doc.data())
            .filter((row) => row.kind === "course-joining-online");
          return rows.length > 0 ? rows : null;
        });
        assert.deepEqual(
          told.map((row) => [String(row.to ?? "").toLowerCase(), row.subject]),
          [[fern.email.toLowerCase(), WORDS.toldFacilitators(ada.first, nextWeek)]],
          "the email that tells the facilitators went to somebody else, or said something else",
        );
        await adaPage.reload({ waitUntil: "domcontentloaded" });
        await ticket.getByRole("status").filter({ hasText: WORDS.saidOnline }).waitFor({ timeout: WAIT_MS });
        await ticket.getByRole("button", { name: WORDS.inTheRoomAfterAll, exact: true }).waitFor({ timeout: WAIT_MS });
      },
    );

    await step(
      "the box at the top of the facilitator's group page asks for a link for the week the member is joining online, the facilitator adds one, and the box and the register say who is joining online",
      async () => {
        activePage = fernPage;
        const day = dayLabel(nextSession.dateKey);
        assert.equal(group.meetingUrl, null, "Group A has a meeting link at this point");
        await fernPage.goto(`${origin}${groupPath}`, { waitUntil: "domcontentloaded" });
        const box = fernPage.getByTestId("joining-online-box");
        await box.getByText(WORDS.boxAsks(1, day, nextWeek), { exact: true }).waitFor({ timeout: WAIT_MS });
        await box.getByText(ada.first, { exact: true }).waitFor({ timeout: WAIT_MS });
        const field = box.getByLabel(WORDS.linkField(nextWeek), { exact: true });
        const add = box.getByRole("button", { name: WORDS.addLink, exact: true });
        await waitFor("Add the link to be live once the page has hydrated", async () => add.isEnabled());
        await field.fill(LINK);
        const [saved] = await Promise.all([responseTo(fernPage, `/groups/${group.id}/meeting-link`, "POST"), add.click()]);
        assert.deepEqual(saved.request().postDataJSON(), { sessionKey: nextKey, url: LINK, everyWeek: false }, "the box saved something else");
        assert.deepEqual(await okBody(saved, "Adding the link"), { ok: true, sessionKey: nextKey, everyWeek: false });
        // The page asks the server again: who is joining online, and nothing to add.
        await box.getByText(WORDS.boxSays(ada.first, day), { exact: true }).waitFor({ timeout: WAIT_MS });
        await add.waitFor({ state: "detached", timeout: WAIT_MS });
        assert.ok(!(await textOf(box)).includes(LINK), "the box shows the link");

        // The week's own link, and the group's standing link untouched.
        const stored = (await fixtureDoc("courseGroups", group.id).get()).data();
        assert.equal(stored?.sessionOverrides?.[nextKey]?.meetingUrl, LINK, "week 4 does not have the link");
        assert.equal(stored?.session?.meetingUrl ?? null, null, "the link was kept for every week");

        // The register says the same at its top.
        await fernPage.goto(`${origin}${groupPath}/register`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        await fernPage.getByTestId("joining-online-box").getByText(WORDS.boxSays(ada.first, day), { exact: true }).waitFor({ timeout: WAIT_MS });
      },
    );

    await step("the member's ticket carries the week's link for anybody joining online, beside Add to calendar, on the programme page and on Home", async () => {
      activePage = adaPage;
      await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
      const ticket = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
      const join = ticket.getByRole("link", { name: WORDS.joinOnline, exact: true });
      await join.waitFor({ timeout: WAIT_MS });
      assert.equal(await join.getAttribute("href"), LINK, "the ticket's way to join is not week 4's link");
      const said = flat(await ticket.innerText());
      assert.ok(said.includes(WORDS.forJoiningOnline), `the ticket does not say who the link is for: ${said}`);
      await ticket.getByRole("button", { name: WORDS.addToCalendar, exact: true }).waitFor({ timeout: WAIT_MS });
      await ticket.getByRole("status").filter({ hasText: WORDS.saidOnlineLinked }).waitFor({ timeout: WAIT_MS });

      // Home's ticket: the same link, said the same way.
      await adaPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
      const home = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
      const homeJoin = home.getByRole("link", { name: WORDS.joinOnline, exact: true });
      await homeJoin.waitFor({ timeout: WAIT_MS });
      assert.equal(await homeJoin.getAttribute("href"), LINK, "Home's way to join is not week 4's link");
      assert.ok(flat(await home.innerText()).includes(WORDS.forJoiningOnline), "Home's ticket does not say who the link is for");
    });

    await step(
      "the member writes the week's written answer and sends it with its own Send, and the week stays open, saying when it was sent",
      async () => {
        activePage = adaPage;
        await openWeek(adaPage);
        // Before the session: when it is, that the work stays open after it, and when the programme closes.
        await untilLineOf(adaPage).waitFor({ timeout: WAIT_MS });
        assert.match(await textOf(untilLineOf(adaPage)), WORDS.untilLine(nextSession.startsAt, group.room), "the week does not say its session and that it stays open");
        // Nothing to send yet, and nothing on the page submits, locks or reopens.
        assert.equal(await sendButton(adaPage).count(), 0, "an empty answer offers Send");
        assert.doesNotMatch(flat(await adaPage.locator("main").innerText()), /\bSubmit|\block|reopen/i, "the week page still speaks of submitting or locking");
        await writeAnswer(adaPage, ANSWER.first);
        await answerCard(adaPage).getByText(WORDS.doneOnceSent(nextWeek), { exact: true }).waitFor({ timeout: WAIT_MS });
        const body = await sendAnswer(adaPage);
        const sentAt = new Date(body.written.sentAt);
        await answerCard(adaPage).getByText(WORDS.sentLine(sentAt), { exact: true }).waitFor({ timeout: WAIT_MS });
        await changeButton(adaPage).waitFor({ timeout: WAIT_MS });
        assert.equal(await answerBox(adaPage).isEditable(), false, "a sent answer takes writing before Change my answer");

        // Stored, and drawn the same from the server after a reload: sent once, and the old Submit never pressed.
        const row = await adasAnswer();
        assert.equal(row?.text, ANSWER.first, "the stored answer is not what Ada wrote");
        assert.ok(row?.firstSentAt && row?.sentAt, "the answer was not sent");
        assert.equal((await adasWeek())?.submittedAt ?? null, null, "Send pressed the old Submit");
        await openWeek(adaPage);
        await answerCard(adaPage).getByText(WORDS.sentLine(asDate(row.sentAt)), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await answerBox(adaPage).inputValue(), ANSWER.first, "the answer read back is not what Ada wrote");
        await changeButton(adaPage).waitFor({ timeout: WAIT_MS });
      },
    );

    await step("the member changes the answer before the session, and the page says the people who read it still see the version sent", async () => {
      activePage = adaPage;
      await openWeek(adaPage);
      const sentAt = asDate((await adasAnswer())?.sentAt);
      await changeButton(adaPage).click();
      await writeAnswer(adaPage, `${ANSWER.first}${ANSWER.added}`);
      await answerCard(adaPage).getByText(WORDS.changedBefore, { exact: true }).waitFor({ timeout: WAIT_MS });
      await sendButton(adaPage).waitFor({ timeout: WAIT_MS });
      // Changed, not sent again: the send is where it was, and the version sent is kept on the row.
      const row = await adasAnswer();
      assert.equal(row?.text, `${ANSWER.first}${ANSWER.added}`, "the stored answer is not the changed one");
      assert.equal(asDate(row?.sentAt)?.getTime(), sentAt?.getTime(), "a change moved when the answer was sent");
      const kept = Array.isArray(row?.earlierVersions) ? row.earlierVersions : [];
      assert.deepEqual(kept.map((version) => [version.text, version.reasons]), [[ANSWER.first, ["sent"]]], "the version sent is not kept");
      // After a reload, the same.
      await openWeek(adaPage);
      await answerCard(adaPage).getByText(WORDS.changedBefore, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await answerBox(adaPage).inputValue(), `${ANSWER.first}${ANSWER.added}`);
    });

    await step("the facilitator's reading view shows the answer as it was sent, never the change", async () => {
      activePage = fernPage;
      await fernPage.goto(readingUrl, { waitUntil: "domcontentloaded" });
      await answerOn(fernPage).waitFor({ timeout: WAIT_MS });
      await answerOn(fernPage).getByText(WORDS.staffChangedBefore(ada.first), { exact: true }).waitFor({ timeout: WAIT_MS });
      const said = flat(await fernPage.locator("main").innerText());
      assert.ok(flat(await answerOn(fernPage).innerText()).includes(ANSWER.first), `the reading view does not show the answer as sent: ${said}`);
      assert.ok(!said.includes(ANSWER.added.trim()), "the reading view shows a change Ada has not sent, before the session");
      assert.doesNotMatch(said, /Late|After its deadline|Reopen/, "the reading view calls an answer sent before the session late, or offers a reopen");
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

    await step("the programme's lead reads on the Attendance tab how many sessions the member came to in the room and online", async () => {
      activePage = adminPage;
      await adminPage.goto(`${formBase}/attendance`, { waitUntil: "domcontentloaded" });
      const grid = adminPage.getByRole("region", { name: "Attendance grid", exact: true });
      await grid.waitFor({ timeout: WAIT_MS });
      const row = grid.getByRole("row").filter({ has: adminPage.getByRole("rowheader", { name: new RegExp(escapeRegExp(ada.first)) }) });
      // Ada came to weeks 1 to 3 (present, late, present): week 3 online, the rest in the room.
      await row.getByRole("img", { name: new RegExp(`, week ${thisWeek}: Present, online$`) }).waitFor({ timeout: WAIT_MS });
      const came = flat(await row.locator("td").last().innerText());
      assert.equal(came, `3 of 3 ${WORDS.roomAndOnline(2, 1)}`, `Ada's Came does not say where Ada was: ${came}`);
      const benCame = flat(
        await grid
          .getByRole("row")
          .filter({ has: adminPage.getByRole("rowheader", { name: new RegExp(escapeRegExp(ben.first)) }) })
          .locator("td")
          .last()
          .innerText(),
      );
      assert.ok(!/online|in the room/.test(benCame), `Ben's Came speaks of where Ben was, always in the room: ${benCame}`);
    });

    await step(
      "once the group's session has started, the member's page says the group met, and what the member adds, changes and sends now says how late",
      async () => {
        // The clock moves, as the term's points move it: Group A's week 4 session starts the minute after
        // Ada's last change, so that change was before it, and the fixture waits until it has started.
        const lastChange = asDate((await adasAnswer())?.updatedAt);
        assert.ok(lastChange, "Ada's answer has no time of its last change");
        const session = await startGroupSession(group, nextWeek, { after: lastChange });
        activePage = adaPage;
        await openWeek(adaPage);
        await adaPage.getByText(WORDS.met(group.name, nextWeek, session.startsAt), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.match(await textOf(untilLineOf(adaPage)), WORDS.staysOpen, "after the session the line no longer says until when");
        // Her change before the session is what her readers read now.
        await answerCard(adaPage).getByText(WORDS.changedAfter, { exact: true }).waitFor({ timeout: WAIT_MS });

        // A reflection written now says how many minutes after her session.
        const prompt = adaPage.getByLabel(COURSEWORK_PROMPTS.rp1, { exact: true });
        await waitFor("the reflection box to take writing", async () => prompt.isEditable());
        const [reflected] = await Promise.all([responseTo(adaPage, `/reflections/${courseworkItemId(nextWeek, "rp1")}`, "PUT"), prompt.fill(REFLECTION)]);
        await okBody(reflected, "Saving the reflection");
        await adaPage.locator("main").getByText(WORDS.savedLate).first().waitFor({ timeout: WAIT_MS });

        // The answer changed again and sent: late, with how late.
        await writeAnswer(adaPage, `${ANSWER.first}${ANSWER.added}${ANSWER.more}`);
        await sendAnswer(adaPage);
        await answerCard(adaPage).getByText(WORDS.sentLate).waitFor({ timeout: WAIT_MS });
        await changeButton(adaPage).waitFor({ timeout: WAIT_MS });
        const row = await adasAnswer();
        assert.ok(asDate(row?.sentAt).getTime() > session.startsAt.getTime(), "the send is not after the session");
        // The answer as it stood at the session is kept, once, beside the version sent before it.
        const kept = (Array.isArray(row?.earlierVersions) ? row.earlierVersions : []).map((version) => [version.text, version.reasons]);
        assert.deepEqual(kept, [[ANSWER.first, ["sent"]], [`${ANSWER.first}${ANSWER.added}`, ["session"]]], "the version at the session is not kept");
      },
    );

    await step("the facilitator's pages say late with how late, and show the answer as it stood at the session", async () => {
      activePage = fernPage;
      await fernPage.goto(readingUrl, { waitUntil: "domcontentloaded" });
      await answerOn(fernPage).waitFor({ timeout: WAIT_MS });
      await answerOn(fernPage).getByText(WORDS.atSession, { exact: true }).waitFor({ timeout: WAIT_MS });
      const said = flat(await answerOn(fernPage).innerText());
      assert.match(said, WORDS.staffLate, `the reading view does not say how late the answer was sent: ${said}`);
      const latest = said.indexOf(ANSWER.more.trim());
      const atSession = said.indexOf(WORDS.atSession);
      assert.ok(latest >= 0 && atSession > latest, "the latest words are not shown above the answer as it stood at the session");
      assert.ok(said.slice(atSession).includes(`${ANSWER.first}${ANSWER.added}`), "the answer as it stood at the session is not shown");
      assert.ok(!said.slice(atSession).includes(ANSWER.more.trim()), "the version at the session holds a change made after it");

      // The group's reflections with names, on the page of one question at the week's first reflection: Ada's, said late with how late.
      await fernPage.goto(namesUrl, { waitUntil: "domcontentloaded" });
      const answer = adaRowOn(fernPage);
      await answer.waitFor({ timeout: WAIT_MS });
      // Its own text, not as drawn, whatever the stylesheet sets in capitals.
      assert.ok((await textOf(answer)).includes(REFLECTION), "the page of one question does not show Ada's reflection");
      assert.match(await textOf(answer), WORDS.staffLate, "the page of one question does not say how late Ada's reflection was");

      // This week's work on the group page: the written answer's cell says how late it was sent.
      await fernPage.goto(`${origin}${groupPath}`, { waitUntil: "domcontentloaded" });
      await fernPage.getByRole("heading", { name: group.name, level: 1 }).waitFor({ timeout: WAIT_MS });
      const row = fernPage.getByRole("region", { name: WORDS.thisWeeksWork, exact: true }).getByRole("row").filter({ hasText: ada.first });
      await row.first().waitFor({ timeout: WAIT_MS });
      assert.match(await textOf(row.first()), WORDS.staffLate, "This week's work does not say how late Ada's answer was sent");
    });

    await step("another fellow of the group reads none of the member's work", async () => {
      activePage = adminPage;
      await approvePendingApplicant(adminPage, origin, { email: ben.email });
      await waitFor("Ben's account to say member", async () => (await readUserDoc(ben.uid))?.role === "member");
      activePage = benPage;
      await signIn(benPage, ben);
      const adasWords = [ANSWER.first, ANSWER.added.trim(), ANSWER.more.trim(), REFLECTION];
      // Ben's own week 4: his own box, and nothing of Ada's.
      await openWeek(benPage);
      const own = flat(await benPage.locator("main").innerText());
      for (const words of adasWords) assert.ok(!own.includes(words), `Ben's week page shows Ada's "${words}"`);
      // The facilitators' pages refuse a fellow, and so do the older addresses that forward to them: no answer, no reflection, no lateness of Ada's.
      for (const url of [readingUrl, namesUrl, ...olderUrls, `${origin}${groupPath}`]) {
        await benPage.goto(url, { waitUntil: "domcontentloaded" });
        await benPage.waitForLoadState("networkidle", { timeout: WAIT_MS }).catch(() => {});
        const html = await benPage.content();
        for (const words of adasWords) assert.ok(!html.includes(words), `${url} shows Ben Ada's "${words}"`);
        assert.equal(await answerOn(benPage).count(), 0, `${url} draws a written answer for Ben`);
        assert.equal(await adaRowOn(benPage).count(), 0, `${url} draws Ada's row for Ben`);
        assert.doesNotMatch(flat(await benPage.locator("body").innerText()), WORDS.staffLate, `${url} tells Ben how late somebody's work was`);
      }
    });
  } finally {
    await Promise.allSettled([context, ...identities.map((each) => each.context)].map((each) => each.close()));
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
