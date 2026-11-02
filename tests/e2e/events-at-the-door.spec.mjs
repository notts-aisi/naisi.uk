/**
 * An evening at the door, end to end, in a real browser, driven by the
 * event's organiser: a member the admin lets draft events, who is not an
 * admin and whom the Students' Union does not recognise.
 *
 * Sign in as the admin -> approve Olive, Pia and Rex, and give Olive the
 * Events permission on her page -> Olive finds her two events on Manage
 * events -> on the chosen event's Sign-ups she reads who is asking (a name,
 * no address) and approves Rex, who is emailed -> on the door event's
 * Check-in tab she opens the door and is shown numbers and no names -> the
 * admin, on a phone, checks Pia and Gwen in on the door list -> Olive's tab
 * counts them -> on the door event's Survey after tab, whose survey was
 * switched off, Send it now sets the standard questions up and emails both,
 * each their own link -> on the chosen event's tab Save sets its survey up
 * and Send a test to me reaches Olive alone -> the chosen event's Sign-ups
 * offers to invite the one person new since (Pia came, and it is for whoever
 * came), the press reaches Pia, who finds it on Home -> the admin reads
 * Pia's Events card.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec events-at-the-door
 *
 * It reads its own mail, so it declares `requiresCaughtMail` and the runner
 * skips it against a deployed target. The fixture is
 * `scripts/e2e-fixtures/events-at-the-door.mjs`.
 *
 * ## CHROMIUM ONLY, and that is a limitation rather than a choice
 *
 * A green run here is a regression net and never a substitute for the manual
 * Safari pass before dev goes to main. The door list step is drawn at a
 * phone's size; it does not stand in for a phone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import {
  approvePendingApplicant,
  createStepRecorder,
  newIdentityPage,
  openBrowser,
  signInWithPassword,
  stubRecaptchaOnLoopback,
} from "../../scripts/e2e/lib/browser.mjs";
import { getMessage, hrefUrls, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import { readUserDoc } from "../../scripts/e2e/lib/firestore.mjs";
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
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/events-at-the-door.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** A phone, for the door list: the smallest the events baseline holds. */
const PHONE = { width: 375, height: 667 };

/**
 * The words the pages and emails say, restated from the files beside each:
 * src/lib/events/checkInView.ts, src/lib/events/requestWords.ts,
 * src/features/events/SignupRequests.tsx, src/lib/surveys/events/afterView.ts,
 * src/features/surveys/events/SurveyAfterPanel.tsx, src/lib/surveys/events/words.ts,
 * src/lib/surveys/words.ts, src/features/events/InviteNewSince.tsx,
 * src/lib/events/inviteWords.ts, src/lib/events/attendanceWords.ts and
 * src/emails/EventRsvpEmail.tsx.
 */
const WORDS = {
  eventsPermissions: "Event permissions",
  draft: "Draft",
  waiting: (n) => `Waiting for a decision (${n})`,
  nobodyWaiting: "Nobody is waiting. A new request shows here.",
  allInvited: "Everybody it’s for is invited already.",
  openDoor: "Open the door",
  doorOpenByYou: "The door is open. You opened it at",
  noNames:
    "Only NAISI’s admins and the committee members the Students’ Union recognises see who came, as they see who signed up.",
  hereOf: (here, of) => `${here} of ${of} here`,
  cameOf: (here, of) => `${here} of ${of} who signed up`,
  standardLine: "No survey is set up for this event, so this sends the standard questions to everyone who came",
  sendNow: (n) => `Send it now (${n})`,
  sendConfirm: (n) => `Send the survey now? It emails ${n} people, each with their own link.`,
  sent: (n) => `Sent to ${n} people.`,
  notSetUp: "It isn’t set up yet. Saving sets it up.",
  byHand: /Only when you or an admin send it/,
  notStarted: "You can send it from here once the event has started.",
  sendTest: "Send a test to me",
  testOnItsWay: "A test is on its way to your own address.",
  surveySubject: (title) => `How was ${title}?`,
  testSubject: (title) => `[TEST] How was ${title}?`,
  newSinceLine: "1 person in its tags isn’t invited yet. Nothing is sent until you invite them.",
  newSinceButton: "Invite the 1 new since",
  newSinceConfirm: "Invite the 1 person new since? It shows on their Home, and emails nobody.",
  invited: "Invited 1 person. Nobody was emailed.",
  forYou: "For you",
  eventsCard: "Events",
  cameLine: (title, day) => `${title}, ${day}: came`,
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every space, newline and tab run in a page's text, as one space. */
const flat = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** "Mon 2 Nov": a day in London, as `dayWords` in src/features/events/manageWords.ts writes it. */
function dayWords(at) {
  const part = (options) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...options }).format(at);
  return `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })}`;
}

/** What an email's HTML says, as one line of words. */
function wordsOf(html) {
  return flat(
    String(html ?? "")
      .replace(/<(style|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&rsquo;/g, "’"),
  );
}

/** The emails to one address, read whole, newest first. */
async function emailsTo(address, count) {
  const summaries = await waitForMessagesTo(address, { count, timeoutMs: WAIT_MS });
  const out = [];
  for (const summary of summaries) {
    const message = await getMessage(summary.ID);
    out.push({
      subject: message.Subject ?? summary.Subject ?? "",
      words: wordsOf(message.HTML),
      links: hrefUrls(message.HTML ?? ""),
    });
  }
  return out;
}

let skipReasonFor = () => null;

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

const state = readState(SPEC.name, RUN_STATE_DIR);
const playwright = await loadPlaywright();
const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state
    ? `No events at the door fixture at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "This spec signs in as an admin. Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD: see scripts/e2e/README.md."
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

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "events at the door: the organiser's evening, from the requests to the survey and the people new since",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const { olive, pia, rex, guest, door, chosen } = state;
    const doorStart = new Date(door.startAtIso);

    const { browser, context: adminContext, page: adminPage } = await openBrowser();
    const { context: oliveContext, page: olivePage } = await newIdentityPage(browser);
    const { context: phoneContext, page: phonePage } = await newIdentityPage(browser, { viewport: PHONE });
    const others = [];

    /** Which page a failed step photographs: each step names its page first. */
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
    const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });

    // Nothing here is reCAPTCHA-gated (the fixture's list is empty), but the
    // stub is armed as on every journey, so a gated press added later is
    // declared rather than discovered.
    let recaptchaStubbed = true;
    for (const pg of [adminPage, olivePage, phonePage]) recaptchaStubbed = (await stubRecaptchaOnLoopback(pg, origin)) && recaptchaStubbed;
    if (!recaptchaStubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);

    // Every confirm the organiser is asked is answered yes, and its words kept.
    const confirms = [];
    olivePage.on("dialog", async (dialog) => {
      confirms.push(dialog.message());
      await dialog.accept();
    });

    /** The answer to the next request whose path ends `suffix`, by `method`. */
    const responseTo = (pg, suffix, method) =>
      pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, {
        timeout: WAIT_MS,
      });

    /** A JSON answer that must be a success, read once. */
    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    /** What a page says, as one line, for an assertion that names what it saw. */
    const pageWords = async (pg) => flat(await pg.locator("main").first().innerText().catch(() => ""));

    try {
      await step("the admin approves the three people and lets the organiser draft events on their page", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [olive, pia, rex]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          await waitFor(`${account.first}'s account to say member`, async () => (await readUserDoc(account.uid))?.role === "member");
        }
        await adminPage.goto(`${origin}/admin/members/${enc(olive.uid)}`, { waitUntil: "domcontentloaded" });
        const events = adminPage.getByRole("radiogroup", { name: WORDS.eventsPermissions });
        await events.waitFor({ timeout: WAIT_MS });
        const draft = events.getByRole("radio", { name: WORDS.draft, exact: true });
        await events.getByText(WORDS.draft, { exact: true }).click();
        await waitFor("the Events permission to read Draft", async () => draft.isChecked());
        // The page writes it as the admin's own browser; a reload reads it back
        // from the account, which is what the events area will ask.
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        await events.waitFor({ timeout: WAIT_MS });
        await waitFor("the Events permission to read Draft after a reload", async () => draft.isChecked());
      });

      await step("the organiser finds both events on Manage events", async () => {
        activePage = olivePage;
        await signIn(olivePage, { email: olive.email, password: olive.password });
        await olivePage.goto(`${origin}/events/manage`, { waitUntil: "domcontentloaded" });
        // Upcoming shows twenty at first, and the shared dev project may hold more.
        const showAll = olivePage.getByRole("button", { name: /^Show all/ });
        for (const title of [door.title, chosen.title]) {
          const link = olivePage.getByRole("link", { name: title, exact: true }).first();
          await link
            .waitFor({ timeout: 10_000 })
            .catch(async () => {
              if ((await showAll.count()) > 0) await showAll.first().click();
              await link.waitFor({ timeout: WAIT_MS });
            });
        }
      });

      await step("the organiser reads who is asking for a place on Sign-ups, with no address, and approves the request", async () => {
        activePage = olivePage;
        await olivePage.goto(`${origin}/events/manage/${enc(chosen.id)}/attendees`, { waitUntil: "domcontentloaded" });
        await olivePage.getByRole("heading", { name: WORDS.waiting(1) }).waitFor({ timeout: WAIT_MS });
        const requests = olivePage.locator("section[aria-labelledby='signup-requests-heading']");
        await requests.getByText(new RegExp(`^${escapeRegExp(rex.first)}`)).first().waitFor({ timeout: WAIT_MS });
        // An organiser the Students' Union does not recognise is sent the name and never the address.
        const said = await pageWords(olivePage);
        assert.ok(!said.includes(rex.email), `the organiser's Sign-ups page shows Rex's address: ${said.slice(0, 800)}`);
        // Nobody has come to the door event yet, so its tag adds nobody.
        await olivePage.getByText(WORDS.allInvited, { exact: true }).waitFor({ timeout: WAIT_MS });

        const [approved] = await Promise.all([
          responseTo(olivePage, `/rsvp/${state.signups.rex}/approve`, "POST"),
          requests.getByRole("button", { name: "Approve", exact: true }).click(),
        ]);
        await okBody(approved, "Approve");
        await olivePage.getByRole("heading", { name: WORDS.waiting(0) }).waitFor({ timeout: WAIT_MS });
        await olivePage.getByText(WORDS.nobodyWaiting, { exact: true }).waitFor({ timeout: WAIT_MS });
        const row = await fixtureDoc("eventRsvps", state.signups.rex).get();
        assert.equal(row.data()?.status, "confirmed", "Rex's request was not given a place");
        const [mail] = await emailsTo(rex.email, 1);
        assert.ok(mail.subject.endsWith(`: ${chosen.title}`), `Rex's email is about something else: ${mail.subject}`);
      });

      await step("the organiser opens the door on the Check-in tab, and is shown numbers and no names", async () => {
        activePage = olivePage;
        await olivePage.goto(`${origin}/events/manage/${enc(door.id)}/check-in`, { waitUntil: "domcontentloaded" });
        const button = olivePage.getByRole("button", { name: WORDS.openDoor, exact: true });
        await button.waitFor({ timeout: WAIT_MS });
        const [opened] = await Promise.all([responseTo(olivePage, `/events/${door.id}/door`, "POST"), button.click()]);
        const body = await okBody(opened, "Open the door");
        assert.equal(body.created, true, "the door was open before the organiser opened it");
        await olivePage.getByText(WORDS.doorOpenByYou, { exact: false }).waitFor({ timeout: WAIT_MS });
        await olivePage.getByText(WORDS.noNames, { exact: true }).waitFor({ timeout: WAIT_MS });
        await olivePage.getByText(WORDS.cameOf(0, 2), { exact: true }).waitFor({ timeout: WAIT_MS });
        const said = await pageWords(olivePage);
        for (const name of [pia.first, guest.name]) {
          assert.ok(!said.includes(name), `the organiser's Check-in tab names ${name}: ${said.slice(0, 800)}`);
        }
        const event = await fixtureDoc("events", door.id).get();
        assert.equal(event.data()?.doorOpenedBy, olive.uid, "the door's opening does not name the organiser");
      });

      await step("the admin checks the two people with a place in on the door list, on a phone", async () => {
        activePage = phonePage;
        await signIn(phonePage, { email: secrets.adminEmail, password: secrets.adminPassword });
        await phonePage.goto(`${origin}/events/manage/${enc(door.id)}/door`, { waitUntil: "domcontentloaded" });
        await phonePage.getByText(WORDS.hereOf(0, 2), { exact: true }).waitFor({ timeout: WAIT_MS });
        for (const [index, name] of [pia.first, guest.name].entries()) {
          const button = phonePage.getByRole("button", { name: new RegExp(`^Check in ${escapeRegExp(name)}`) });
          await button.waitFor({ timeout: WAIT_MS });
          const [checked] = await Promise.all([responseTo(phonePage, `/events/${door.id}/check-ins`, "POST"), button.click()]);
          await okBody(checked, `Check in ${name}`);
          await phonePage.getByText(WORDS.hereOf(index + 1, 2), { exact: true }).waitFor({ timeout: WAIT_MS });
        }
        const checkIns = await fixtureQuery("eventCheckIns").where("eventId", "==", door.id).get();
        assert.equal(checkIns.size, 2, `the door list made ${checkIns.size} check-ins, not 2`);
      });

      await step("the organiser's Check-in tab counts the two who came", async () => {
        activePage = olivePage;
        await olivePage.goto(`${origin}/events/manage/${enc(door.id)}/check-in`, { waitUntil: "domcontentloaded" });
        await olivePage.getByText(WORDS.cameOf(2, 2), { exact: true }).waitFor({ timeout: WAIT_MS });
        const said = await pageWords(olivePage);
        for (const name of [pia.first, guest.name]) {
          assert.ok(!said.includes(name), `the organiser's Check-in tab names ${name} once they came: ${said.slice(0, 800)}`);
        }
      });

      await step("the organiser sends the survey now at the event whose survey was switched off, and each person who came gets their own link", async () => {
        activePage = olivePage;
        await olivePage.goto(`${origin}/events/manage/${enc(door.id)}/survey`, { waitUntil: "domcontentloaded" });
        await olivePage.getByText(WORDS.standardLine, { exact: false }).first().waitFor({ timeout: WAIT_MS });
        const button = olivePage.getByRole("button", { name: WORDS.sendNow(2), exact: true });
        await button.waitFor({ timeout: WAIT_MS });
        assert.equal(
          (await fixtureQuery("surveys").where("eventId", "==", door.id).get()).size,
          0,
          "the door event has a survey before Send it now, so this is not the switched-off case",
        );
        const [sent] = await Promise.all([responseTo(olivePage, `/events/${door.id}/survey-after/send`, "POST"), button.click()]);
        await okBody(sent, "Send it now");
        assert.equal(confirms.at(-1), WORDS.sendConfirm(2), "Send it now asked something else first");
        await olivePage.getByText(WORDS.sent(2), { exact: true }).waitFor({ timeout: WAIT_MS });

        const surveys = (await fixtureQuery("surveys").where("eventId", "==", door.id).get()).docs.map((doc) => doc.data());
        const main = surveys.find((survey) => survey.audience?.kind === "event-came");
        assert.ok(main, "Send it now set up no survey for the people who came");
        assert.ok(main.firstSentAt, "the survey Send it now set up has not gone");
        const setting = (await fixtureDoc("events", door.id).get()).data()?.surveyAfter;
        assert.equal(setting?.on, true, "the event does not keep the setting the press set up");
        assert.equal(setting?.when, "hand", "the press set up a survey that goes by itself");

        const seen = new Set();
        for (const address of [pia.email, guest.email]) {
          const [mail] = await emailsTo(address, 1);
          assert.equal(mail.subject, WORDS.surveySubject(door.title));
          assert.ok(mail.words.includes(`Thanks for coming on`), `the survey's email does not thank them: ${mail.words.slice(0, 600)}`);
          assert.ok(mail.words.includes(olive.first), `the survey's email is not signed by the organiser: ${mail.words.slice(0, 600)}`);
          const links = mail.links.filter((href) => href.includes("/survey/"));
          assert.equal(links.length > 0, true, `the survey's email to ${address} has no link of its own`);
          for (const link of links) seen.add(link);
          assert.ok(links.every((href) => href.startsWith(origin)), `a survey link leaves the site: ${links.join(", ")}`);
        }
        assert.equal(seen.size, 2, "the two people who came were sent the same link");
      });

      await step("the organiser saves the chosen event's survey, which sets it up, and sends a test to their own address", async () => {
        activePage = olivePage;
        await olivePage.goto(`${origin}/events/manage/${enc(chosen.id)}/survey`, { waitUntil: "domcontentloaded" });
        await olivePage.getByText(WORDS.notSetUp, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await olivePage.getByRole("button", { name: WORDS.sendTest }).count(), 0, "a test is offered before there is a survey");
        await olivePage.getByRole("radio", { name: WORDS.byHand }).check();
        const [saved] = await Promise.all([
          responseTo(olivePage, `/events/${chosen.id}/survey-after`, "PATCH"),
          olivePage.getByRole("button", { name: "Save", exact: true }).click(),
        ]);
        await okBody(saved, "Save");
        await olivePage.getByText("Saved.", { exact: true }).waitFor({ timeout: WAIT_MS });
        await olivePage.getByText(WORDS.notStarted, { exact: true }).waitFor({ timeout: WAIT_MS });
        const made = await fixtureQuery("surveys").where("eventId", "==", chosen.id).get();
        assert.equal(made.size, 1, `Save set up ${made.size} surveys, not 1`);

        const test = olivePage.getByRole("button", { name: WORDS.sendTest, exact: true });
        await test.waitFor({ timeout: WAIT_MS });
        const [tested] = await Promise.all([responseTo(olivePage, `/events/${chosen.id}/survey-after/test`, "POST"), test.click()]);
        const body = await okBody(tested, "Send a test to me");
        assert.equal(body.delivery, "sent", `the test was not sent: ${JSON.stringify(body)}`);
        await olivePage.getByText(WORDS.testOnItsWay, { exact: true }).waitFor({ timeout: WAIT_MS });
        const [mail] = await emailsTo(olive.email, 1);
        assert.equal(mail.subject, WORDS.testSubject(chosen.title));
        const survey = (await fixtureQuery("surveys").where("eventId", "==", chosen.id).get()).docs[0].data();
        assert.equal(survey.firstSentAt ?? null, null, "a test opened the survey");
      });

      await step("the organiser invites the one person new since, who came to the door event, and they find it on Home", async () => {
        activePage = olivePage;
        await olivePage.goto(`${origin}/events/manage/${enc(chosen.id)}/attendees`, { waitUntil: "domcontentloaded" });
        await olivePage.getByText(WORDS.newSinceLine, { exact: true }).waitFor({ timeout: WAIT_MS });
        const button = olivePage.getByRole("button", { name: WORDS.newSinceButton, exact: true });
        const [invited] = await Promise.all([responseTo(olivePage, `/events/${chosen.id}/invitations`, "POST"), button.click()]);
        const body = await okBody(invited, "Invite the 1 new since");
        assert.deepEqual({ invited: body.invited, emailed: body.emailed }, { invited: 1, emailed: 0 });
        assert.equal(confirms.at(-1), WORDS.newSinceConfirm, "the invitation press asked something else first");
        await olivePage.getByText(WORDS.invited, { exact: true }).waitFor({ timeout: WAIT_MS });
        await olivePage.getByText(WORDS.allInvited, { exact: true }).waitFor({ timeout: WAIT_MS });
        const list = await fixtureDoc("eventInvitations", `${chosen.id}__${pia.uid}`).get();
        assert.equal(list.data()?.via, "new-since", "Pia is not on the list by the press");

        const piaSide = await newIdentityPage(browser);
        others.push(piaSide);
        activePage = piaSide.page;
        await signIn(piaSide.page, { email: pia.email, password: pia.password });
        await piaSide.page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        await piaSide.page
          .locator("section")
          .filter({ hasText: chosen.title })
          .filter({ hasText: WORDS.forYou })
          .first()
          .waitFor({ timeout: WAIT_MS });
      });

      await step("the admin reads the Events card on the page about somebody who came", async () => {
        activePage = adminPage;
        await adminPage.goto(`${origin}/admin/members/${enc(pia.uid)}`, { waitUntil: "domcontentloaded" });
        const card = adminPage.locator(`section[aria-labelledby="events-${pia.uid}"]`);
        await card.getByRole("heading", { name: WORDS.eventsCard, exact: true }).waitFor({ timeout: WAIT_MS });
        await card.getByText(WORDS.cameLine(door.title, dayWords(doorStart)), { exact: true }).waitFor({ timeout: WAIT_MS });
      });
    } finally {
      for (const other of others) await other.context.close().catch(() => {});
      await phoneContext.close().catch(() => {});
      await oliveContext.close().catch(() => {});
      await adminContext.close().catch(() => {});
      await browser.close();
      recorder.writeMarker();
    }
  },
);
