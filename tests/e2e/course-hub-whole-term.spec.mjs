/**
 * END-TO-END: A WHOLE TERM, driven in a real browser by the people who run it
 * and read by the people it affects, with every person's caught mail counted
 * before and after every press, and at the end the books held to balance.
 *
 * The term two weeks in (scripts/e2e-fixtures/worlds/course-hub-term.mjs,
 * point "whole-term"): Group A is Ada, Ben, Dan, Eve (told her group after its
 * week 2 session) and Ivo (who holds a fellow's place in it and becomes its
 * second facilitator), Group B is Cleo. The admin approves everybody, makes
 * Gus SU-recognised committee and the programme's lead, Kit a committee
 * member, names the run and hands its people over, and appoints Fern and Ivo
 * to Group A and Hal to Group B. Then, in order:
 *
 *  THE TIME. Fern moves Group A's week 3 from her group's page, with the
 *  notice on; Gus gives Group A a new regular time from week 4, and Ada
 *  answers "Most weeks, not all", naming week 5.
 *  THE REGISTER. Gus takes Group A's week 2 register in the facilitators'
 *  place and finishes it with Ada wrongly absent; the admin gives Group B's
 *  week 3 to Kit; Fern asks for Ada's line to be corrected and Gus approves
 *  it; the admin says Group B's week 1 didn't happen, keeping pace.
 *  THE WORK. Ada does week 3 before its session, Ben week 2 after its
 *  session; Ivo does his own week 2 late; Fern reminds Group A about week 1
 *  by hand and Dan then finishes it.
 *  EXCUSED. Ben asks to be excused from week 3 and the admin approves it;
 *  Dan, absent in week 2, asks about it and the admin approves it.
 *  A LIVE WEEK. Gus fixes a reading's title and link in week 3 and tells the
 *  people who have started it, rewords a question Ada answered, and restores
 *  the week's first version.
 *  THE BOOKS. Every fellow's attendance and every week's work, read on every
 *  page that shows them and held to one table worked out from the presses;
 *  the groups' and the week's histories; every person's mail.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-whole-term
 *
 * It declares `requiresCaughtMail`: the runner skips it anywhere but a server
 * it started with its mail forced into Mailpit.
 *
 * ## Any day, any hour
 *
 * Every date comes from the world's clock helpers, in London: the run began
 * twelve days before the seed, so the seed's day is in week 2 and every
 * session the journey reads as coming is two or more days ahead, even when a
 * run crosses midnight. The first step asserts that, and every time the
 * journey reads ("how late") is worked out from the instants the routes
 * stored, never from the clock of the spec.
 *
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
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
import { getMessage, hrefUrls, messagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  fixtureDoc,
  fixtureQuery,
  fixtureSubcollection,
  fixtureWeekSubcollection,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC, WHOLE_TERM_STEPS } from "../../scripts/e2e-fixtures/course-hub-whole-term.mjs";
import {
  COURSEWORK_ANSWER_PROMPT,
  COURSEWORK_PROMPTS,
  COURSEWORK_SOURCES,
  SEEDED_WORK_WORDS,
  clockWords,
  courseworkItemId,
  dayLabel,
  londonDateKey,
  londonDayLabel,
  sessionOf,
  shiftDateKey,
  weekDocId,
  weekdayOf,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 60_000;
const POLL_MS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The weeks the journey is about. */
const MOVED_WEEK = 3;
const FROM_WEEK = 4;
const MOST_WEEKS_WEEK = 5;
const TAKEN_WEEK = 2;
const GIVEN_WEEK = 3;
const NOT_HELD_WEEK = 1;
const LATE_WEEK = 2;
const ON_TIME_WEEK = 3;
const REMIND_WEEK = 1;
const EDITED_WEEK = 3;
const EDITED_WEEK_ID = weekDocId(EDITED_WEEK);

/** Where week 3 of Group A moves to: the next day, at 7pm. */
const MOVED_START = "19:00";

/** Every reason and reply the journey writes: one line each, no link, nothing about anybody's health. */
const WHY = Object.freeze({
  move: "The usual room is booked for an exam that evening.",
  regular: "The department needs the room on that day from week 4.",
  correction: "Ada was there all session. The line was tapped by mistake.",
  notHeld: "The building was shut for a power cut that evening.",
  benExcused: "A family wedding on that day that I cannot move.",
  benReply: "Thanks for telling us. Enjoy the wedding.",
  danExcused: "My train was cancelled and I could not get in.",
});

/** What the people who do a week in the browser write. Made up, every word. */
const WRITES = Object.freeze({
  ada: { rp1: "Six lamps along this coast, I think.", rp2: "The port, since its ships use the light.", rp3: "They disagree about who trims the wicks.", answer: "The port should keep the lamps lit, because its dues come from the ships the light keeps safe." },
  ben: { rp1: "Four lamps, one of them on the pier.", rp2: "Whoever owns the harbour wall.", rp3: "One keeper wants electric lamps and one does not.", answer: "The council should keep them lit, because a wreck on its shore costs it far more than oil." },
  ivo: { rp1: "Three that I know of, all on headlands.", rp2: "The ships themselves, by a toll on passing.", rp3: "They disagree about whether the light is a public good.", answer: "The coastguard should keep the lamps lit, because only it is answerable to everybody at sea." },
  dan: { rp1: "Eight, counting the one on the island.", rp2: "The fishing fleet, since it uses the light most.", rp3: "They disagree about who should pay for repairs.", answer: "The fishing fleet should keep the lamps lit, because it would be the first to suffer if they went out." },
});

/** The reading and the question the lead changes in week 3. */
const READING = Object.freeze({
  id: courseworkItemId(EDITED_WEEK, "s1"),
  title: COURSEWORK_SOURCES.s1,
  newTitle: `${COURSEWORK_SOURCES.s1}, kept 1898 to 1911`,
  newUrl: `https://example.com/e2e-diary-${EDITED_WEEK}-moved`,
  place: "Part 2’s source",
  partNumber: 2,
  by: "E2E Example",
});
const REFLECTION = Object.freeze({
  id: courseworkItemId(EDITED_WEEK, "rs1"),
  place: "Part 1’s reflection",
  label: COURSEWORK_PROMPTS.rp1,
  newPrompt: "How many lighthouses on this coast still show a light at night?",
});

/** The words the pages say, restated from the words modules each names. */
const WORDS = Object.freeze({
  // src/features/admin and the member pages.
  committee: "Committee",
  recognisedSwitch: "SU-recognised committee",
  chooseLead: "Choose a lead",
  // src/lib/courses/groupPage/words.ts.
  changeOneWeek: "Change one week",
  whichWeek: "Which week?",
  fromWhichWeek: "From which week?",
  day: "Day",
  starts: "Starts",
  reasonNeeded: "Reason, shown to the group (needed)",
  reasonOptional: "Reason, shown to the group (optional)",
  // src/lib/courses/timeAnswer/words.ts.
  timeCard: "Can you make this time most weeks?",
  mostWeeks: "Most weeks, not all",
  sendAnswer: "Send",
  savedMostWeeks: "Thanks. You’ve told us you can make it most weeks.",
  changeAnswer: "Change your answer",
  untickOnly: "You can untick a week here. To miss another week, press Can’t make it on your next session’s card and ask to be excused.",
  addLater: "You’ve answered this already, so no week can be added here. To miss another week, press Can’t make it on your next session’s card and ask to be excused.",
  // src/lib/courses/registerCover/pageWords.ts.
  someoneElse: "Someone else is covering",
  takeTheRegister: "Take the register",
  // src/lib/courses/registerCorrection/pageWords.ts.
  ask: "Ask for a correction",
  attendanceTab: "Attendance, all weeks",
  didntHappen: "It didn’t happen",
  keepPace: "Keep pace",
  saveDidntHappen: "Save: it didn’t happen",
  // src/lib/courses/groupWeekWork/words.ts.
  haveDone: (done, of, week) => `${done} of ${of} ${of === 1 ? "has" : "have"} done week ${week}`,
  remindAll: (n) => `Remind ${n === 1 ? "1 person" : `${n} people`} whose week isn’t done`,
  sendTo: (n) => `Send to ${n === 1 ? "1 person" : `${n} people`}`,
  remindSubject: (week) => `Week ${week} isn’t done yet`,
  // src/lib/courses/weekWork/words.ts and the week page.
  writtenAnswer: "Written answer",
  yourAnswer: "Your answer",
  sendMyAnswer: "Send my answer",
  doneItem: (title) => `Done: ${title}`,
  doneOnTime: "Done on time",
  doneLate: "Done late",
  done: "Done",
  joinedLate: "Joined late",
  // src/lib/courses/excused/*Words.ts.
  ticket: "Your next session",
  cantMakeIt: (day) => `Can’t make it on ${day}`,
  waitingFact: "Asked to be excused, waiting",
  excused: "Excused",
  // src/lib/courses/weekEdit/pageWords.ts.
  change: (place, label) => `Change ${place}: ${label}`,
  titleLabel: "Title",
  linkLabel: "Link",
  firstPrompt: "Prompt 1",
  save: "Save for every group",
  tellTitle: "Saved. Tell people about it?",
  nobody: "Don’t tell anyone",
  started: (n) => `The people who’ve started week ${EDITED_WEEK} (${n})`,
  linkSubject: `A new link for a week ${EDITED_WEEK} reading`,
  history: "History",
  restore: (day) => `Restore the ${day} version`,
  ownEarlier: "You answered an earlier wording:",
  staffEarlier: "The question when this was written:",
});

/** A mark in the words each page uses. */
const MARK_LABEL = Object.freeze({ present: "Present", late: "Late", "left-early": "Left early", absent: "Absent", excused: "Excused" });
const CAME = new Set(["present", "late", "left-early"]);
/** `lineWords` in src/lib/courses/registerCorrection/words.ts. */
function lineWords(mark, online) {
  if (mark === "present") return online ? "Online" : "In the room";
  if (mark === "late") return online ? "Arrived late, online" : "Arrived late, in the room";
  if (mark === "left-early") return online ? "Left early, online" : "Left early, in the room";
  return MARK_LABEL[mark];
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
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an admin's."
      : state.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, so it runs only against the server the harness starts with its mail caught by Mailpit."
        : null;

/** Polls `predicate` until it answers something truthy, and hands that back. */
async function waitFor(what, predicate, { timeout = WAIT_MS } = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    const answer = await predicate().catch((err) => {
      last = err;
      return null;
    });
    if (answer) return answer;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeout}ms waiting for ${what}.${last ? ` Last error: ${last.message}` : ""}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flat = (text) => text.replace(/\s+/g, " ").trim();
const textOf = async (locator) => flat((await locator.textContent()) ?? "");
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

/** The week of a run a civil day falls in, by the run's own calendar. */
function runWeekOn(startDate, dateKey) {
  const days = Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
  return Math.floor(days / 7) + 1;
}

/** "40 minutes", "5 hours", "3 days": `lateWords` in src/lib/courses/weekWork/words.ts. */
function lateWords(ms) {
  const count = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
  if (ms < 60 * 60_000) return count(Math.max(1, Math.floor(ms / 60_000)), "minute");
  if (ms < DAY_MS) return count(Math.floor(ms / (60 * 60_000)), "hour");
  return count(Math.floor(ms / DAY_MS), "day");
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: a whole term, every piece of running it used together, by the people who use it, and the books balance",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const personOf = (key) => {
      const found = state.people.find((person) => person.key === key);
      assert.ok(found, `the term has nobody called ${key}`);
      return found;
    };
    const [ada, ben, cleo, dan, eve, ivo] = ["ada", "ben", "cleo", "dan", "eve", "ivo"].map(personOf);
    const fern = state.facilitator;
    const gus = state.lead;
    const hal = state.otherFacilitator;
    const kit = state.covering;
    const max = state.outsider;
    for (const [key, value] of Object.entries({ fern, gus, hal, kit, max })) assert.ok(value, `the term has no ${key}`);
    const groupA = state.groups.find((group) => group.key === "A");
    const groupB = state.groups.find((group) => group.key === "B");
    assert.ok(groupA && groupB, "the term has not two groups");
    assert.ok(groupA.meetingUrl, "Group A has no meeting link, so 'never in an email' would prove nothing");
    const meetingHost = new URL(groupA.meetingUrl).host;
    /** Everybody whose mail is counted: the term's own accounts. */
    const everybody = [ada, ben, cleo, dan, eve, ivo, fern, gus, hal, kit, max];
    /** Group A's people told their group, Ivo among them; its fellows leave out Ivo, who facilitates it. */
    const toldA = [ada, ben, dan, eve, ivo];
    const fellowsA = [ada, ben, dan, eve];
    const fellows = [ada, ben, cleo, dan, eve];

    // ---- Any day, any hour -------------------------------------------------
    const todayKey = londonDateKey(new Date());
    const runWeek = runWeekOn(state.startDate, todayKey);
    assert.equal(runWeek, 2, `the term is in week ${runWeek}, not week 2`);
    for (const group of [groupA, groupB]) {
      for (const week of [1, 2]) assert.ok(sessionOf(group, week).endsAt < new Date(), `${group.name}'s week ${week} has not met`);
      assert.ok(sessionOf(group, 3).dateKey > shiftDateKey(todayKey, 1), `${group.name}'s week 3 is today or tomorrow`);
    }

    // ---- The calendar as the story changes it ------------------------------
    const original = (group, week) => sessionOf(group, week);
    const movedDateKey = shiftDateKey(original(groupA, MOVED_WEEK).dateKey, 1);
    const newWeekday = (groupA.weekday + 2) % 7;
    const onNewDay = (weekNumber) => {
      const from = shiftDateKey(state.startDate, 7 * (weekNumber - 1));
      for (let day = 0; day < 7; day += 1) {
        const key = shiftDateKey(from, day);
        if (weekdayOf(key) === newWeekday) return key;
      }
      throw new Error("no day of the week has that weekday");
    };
    /** Group A's session of a week once the time steps are done: its date and start. */
    const sessionA = (week) =>
      week === MOVED_WEEK
        ? { dateKey: movedDateKey, start: MOVED_START }
        : week >= FROM_WEEK
          ? { dateKey: onNewDay(week), start: groupA.startTimeLocal }
          : { dateKey: original(groupA, week).dateKey, start: groupA.startTimeLocal };

    const formPath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const formBase = `${origin}${formPath}`;
    const groupPagePath = (group) => `${formPath}/groups/${enc(group.id)}`;
    const learnGroupPath = (group) => `/learn/${enc(state.runId)}/group/${enc(group.id)}`;
    const learnRegisterPath = (group) => `${learnGroupPath(group)}/register`;
    const learnUrl = `${origin}/learn/${enc(state.runId)}`;
    const weekPageUrl = (week) => `${origin}/learn/${enc(state.runId)}/weeks/${week}`;
    const requestPath = (id) => `/admin/admissions/requests/${id}`;
    const weekEditUrl = `${formBase}/weeks/${EDITED_WEEK_ID}`;
    const weekApi = `/api/courses/runs/${enc(state.runId)}/weeks/${EDITED_WEEK_ID}`;

    // ---- One browser, a context each ---------------------------------------
    const { browser, context: adminContext, page: adminPage } = await openBrowser();
    /** Each open person's context and page, by key, in the order they were last used. */
    const pages = new Map();
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
    if (!recaptchaStubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);

    const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });

    /**
     * The page of one person, in a context of their own, signed in the first
     * time it is asked for, and made the page a failed step photographs. At
     * most `OPEN_IDENTITIES` people are open at once besides the admin: the
     * one used longest ago is closed, and signs in again when next asked for,
     * so a run of a dozen people never holds a dozen renderers on a laptop.
     */
    const OPEN_IDENTITIES = 5;
    async function as(account) {
      if (account === "admin") {
        activePage = adminPage;
        return adminPage;
      }
      let open = pages.get(account.key);
      if (open) {
        pages.delete(account.key);
      } else {
        if (pages.size >= OPEN_IDENTITIES) {
          const [oldest, held] = pages.entries().next().value;
          pages.delete(oldest);
          await held.context.close().catch(() => {});
        }
        const opened = await newIdentityPage(browser);
        open = opened;
        await stubRecaptchaOnLoopback(open.page, origin);
        await signIn(open.page, { email: account.email, password: account.password });
      }
      // Kept in the order of use, the most recent last.
      pages.set(account.key, open);
      activePage = open.page;
      return open.page;
    }

    /** The answer to the next request whose path ends `suffix`, by `method`. */
    const responseTo = (pg, suffix, method) =>
      pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });

    /**
     * The answer to the next PRESS of a POST route whose path ends `suffix`,
     * never one of its previews (`preview: true`), which go to the same route
     * and can still be on their way when the button is pressed.
     */
    const pressTo = (pg, suffix) =>
      pg.waitForResponse(
        (r) => {
          if (r.request().method() !== "POST" || !new URL(r.url()).pathname.endsWith(suffix)) return false;
          try {
            return JSON.parse(r.request().postData() ?? "{}")?.preview !== true;
          } catch {
            return true;
          }
        },
        { timeout: WAIT_MS },
      );

    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    /** A request sent from a page, with that page's own session: exactly what the page itself would send. */
    async function fetchAs(pg, path, init = {}) {
      return pg.evaluate(
        async ({ target, options }) => {
          const res = await fetch(target, options);
          const text = await res.text();
          let body = text;
          try {
            body = JSON.parse(text);
          } catch {
            // Not JSON: kept as the words it is.
          }
          return { status: res.status, body, text };
        },
        { target: path, options: init },
      );
    }

    const storedRegister = async (group, week) =>
      (await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${weekDocId(week)}`).get()).data() ?? null;
    const auditRows = async () =>
      (await fixtureQuery("courseAudit").where("runId", "==", state.runId).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // ---- The mail ledger ---------------------------------------------------
    /**
     * Every mailbox the ledger counts: the term's accounts, and the harness's
     * admin, whom asking to be excused emails (every admin is; this is the one
     * whose address the harness holds).
     */
    const admin = { key: "admin", email: secrets.adminEmail, first: "the admin" };
    const mailboxes = [...everybody, admin];
    /** What each step said it sends, added up per mailbox. */
    const ledger = Object.fromEntries(mailboxes.map((account) => [account.key, 0]));
    /** Every email the journey caught, read, by mailbox. */
    const caught = Object.fromEntries(mailboxes.map((account) => [account.key, []]));

    async function mailCounts() {
      const out = {};
      for (const account of mailboxes) out[account.key] = (await messagesTo(account.email)).length;
      return out;
    }
    /** Each mailbox before the first press: the ledger counts from here. */
    const mailAtStart = await mailCounts();

    /** Asserts nothing in an email carries the meeting link, in its words or its links. */
    function assertNoMeetingLink(message, who, what) {
      for (const [part, body] of [
        ["HTML", message.HTML ?? ""],
        ["text", message.Text ?? ""],
      ]) {
        assert.ok(!body.includes(meetingHost), `${who}'s email (${what}, ${part}) carries a meeting link`);
      }
      assert.ok(!hrefUrls(message.HTML ?? "").some((url) => url.includes(meetingHost)), `${who}'s email (${what}) links to a meeting`);
    }

    /**
     * Runs one press with every person's mail counted before and after it:
     * exactly the people `expected` names get exactly that many, nobody else
     * anything. Hands back what the press returned and each person's new
     * messages, read whole.
     */
    async function press(what, expected, fn) {
      for (const key of Object.keys(expected)) assert.ok(key in ledger, `${what}: nobody called ${key} is counted`);
      const before = await mailCounts();
      const result = await fn();
      const want = Object.fromEntries(mailboxes.map((account) => [account.key, before[account.key] + (expected[account.key] ?? 0)]));
      await waitFor(`${what} to reach ${JSON.stringify(expected)}`, async () => {
        const now = await mailCounts();
        return mailboxes.every((account) => now[account.key] >= want[account.key]);
      }).catch(async (err) => {
        throw new Error(`${err.message} Caught: ${JSON.stringify(await mailCounts())}, wanted ${JSON.stringify(want)}.`);
      });
      // A beat for anything that should NOT have gone to land in Mailpit first.
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      const after = await mailCounts();
      assert.deepEqual(after, want, `${what} emailed somebody it should not have, or somebody twice`);
      const fresh = {};
      for (const account of mailboxes) {
        const n = after[account.key] - before[account.key];
        // Mailpit lists the newest first.
        const summaries = n > 0 ? (await messagesTo(account.email)).slice(0, n) : [];
        fresh[account.key] = await Promise.all(summaries.map((summary) => getMessage(summary.ID)));
        for (const message of fresh[account.key]) {
          assertNoMeetingLink(message, account.first, what);
          caught[account.key].push({ what, subject: message.Subject ?? "" });
        }
        ledger[account.key] += expected[account.key] ?? 0;
      }
      return { result, fresh };
    }
    const nobody = {};
    const eachOf = (accounts) => Object.fromEntries(accounts.map((account) => [account.key, 1]));

    // ---- Pages read the same way everywhere ---------------------------------
    /** A row of a register's grid, by the person's first name. */
    const rowOf = (pg, person) => pg.getByTestId("attendance-grid").getByRole("row").filter({ hasText: person.first }).first();
    const cellOf = (pg, person, week) => rowOf(pg, person).getByTestId("attendance-cell").nth(week - 1);

    /** Taps one cell `times` times, waiting for each save. */
    async function tap(pg, group, cell, times) {
      for (let i = 0; i < times; i += 1) {
        const [saved] = await Promise.all([responseTo(pg, `/groups/${group.id}/attendance`, "POST"), cell.click()]);
        await okBody(saved, "Saving a line");
      }
    }

    /** One person's week, done on its page as a member does it: both readings, three reflections, the answer sent. */
    async function doTheWeek(person, week, words) {
      const pg = await as(person);
      await pg.goto(weekPageUrl(week), { waitUntil: "domcontentloaded" });
      for (const key of ["s1", "s2"]) {
        const itemId = courseworkItemId(week, key);
        const tick = pg.getByRole("checkbox", { name: WORDS.doneItem(COURSEWORK_SOURCES[key]), exact: true });
        await tick.waitFor({ timeout: WAIT_MS });
        await waitFor(`${person.first}'s tick on ${COURSEWORK_SOURCES[key]} to take a press`, async () => tick.isEnabled());
        if (await tick.isChecked()) continue;
        const [ticked] = await Promise.all([responseTo(pg, `/ticks/${itemId}`, "PUT"), tick.check()]);
        await okBody(ticked, `${person.first} ticking ${COURSEWORK_SOURCES[key]}`);
      }
      for (const key of ["rp1", "rp2", "rp3"]) {
        const promptId = courseworkItemId(week, key);
        const box = pg.getByLabel(COURSEWORK_PROMPTS[key], { exact: true });
        await waitFor(`${person.first}'s reflection box to take writing`, async () => box.isEditable());
        const [saved] = await Promise.all([responseTo(pg, `/reflections/${promptId}`, "PUT"), box.fill(words[key])]);
        await okBody(saved, `${person.first} saving reflection ${key}`);
      }
      const answerId = courseworkItemId(week, "wa");
      const card = pg.getByRole("region", { name: WORDS.writtenAnswer, exact: true });
      await card.getByText(COURSEWORK_ANSWER_PROMPT, { exact: true }).waitFor({ timeout: WAIT_MS });
      const answer = card.getByLabel(WORDS.yourAnswer, { exact: true });
      await waitFor(`${person.first}'s answer box to take writing`, async () => answer.isEditable());
      const [wrote] = await Promise.all([responseTo(pg, `/written-answers/${answerId}`, "PUT"), answer.fill(words.answer)]);
      await okBody(wrote, `${person.first} saving the written answer`);
      const send = card.getByRole("button", { name: WORDS.sendMyAnswer, exact: true });
      await waitFor(`${person.first}'s Send my answer to be live`, async () => send.isEnabled());
      const [sent] = await Promise.all([responseTo(pg, `/written-answers/${answerId}/send`, "POST"), send.click()]);
      const body = await okBody(sent, `${person.first} sending the written answer`);
      assert.ok(body.written?.firstSentAt, `${person.first}'s send stamped no first send`);
      return new Date(body.written.sentAt ?? body.written.firstSentAt);
    }

    /** When a person's week became done: the latest of its ticks, reflections and the answer's send, as stored. */
    async function doneAtOf(person, week) {
      const weekId = weekDocId(week);
      const times = [];
      for (const key of ["s1", "s2"]) {
        const tick = (await fixtureDoc("courseProgress", `${state.runId}__${person.uid}__${courseworkItemId(week, key)}`).get()).data();
        times.push(tick?.completedAt?.toDate?.() ?? null);
      }
      for (const key of ["rp1", "rp2", "rp3"]) {
        const row = (await fixtureDoc("courseExerciseResponses", `${state.runId}__${person.uid}__${weekId}__${courseworkItemId(week, key)}`).get()).data();
        times.push(row?.updatedAt?.toDate?.() ?? null);
      }
      const answer = (await fixtureDoc("courseExerciseResponses", `${state.runId}__${person.uid}__${weekId}__${courseworkItemId(week, "wa")}`).get()).data();
      times.push(answer?.firstSentAt?.toDate?.() ?? null);
      assert.ok(times.every(Boolean), `${person.first}'s week ${week} is missing a piece: ${JSON.stringify(times)}`);
      return new Date(Math.max(...times.map((at) => at.getTime())));
    }

    /** When a person's written answer of a week was first sent, as stored. */
    async function firstSentOf(person, week) {
      const answer = (await fixtureDoc("courseExerciseResponses", `${state.runId}__${person.uid}__${weekDocId(week)}__${courseworkItemId(week, "wa")}`).get()).data();
      const at = answer?.firstSentAt?.toDate?.() ?? null;
      assert.ok(at, `${person.first}'s week ${week} answer was never sent`);
      return at;
    }

    /**
     * The group's week card on the facilitator's page, on one week: its
     * heading ("2 of 4 have done week 2") and the counts its bar draws.
     */
    async function weekCardOf(pg, week) {
      await pg.goto(`${origin}${learnGroupPath(groupA)}?week=${week}`, { waitUntil: "domcontentloaded" });
      const card = pg.getByTestId("week-work-count");
      await card.getByRole("heading").first().waitFor({ timeout: WAIT_MS });
      const said = await wordsIn(card);
      const buckets = {};
      for (const found of said.matchAll(/(Done on time|Done late|Not started|Started|Joined late|Done) (\d+)/g)) buckets[found[1]] = Number(found[2]);
      return { heading: await textOf(card.getByRole("heading").first()), buckets, said };
    }

    /** Feedback to write, on the facilitator's page: one line per answer sent and not reviewed, as written. */
    async function reviewQueueOf(pg) {
      const items = pg.locator('section[aria-labelledby="group-review-queue"] li');
      await items.first().waitFor({ timeout: WAIT_MS });
      const out = [];
      for (let i = 0; i < (await items.count()); i += 1) out.push(await wordsIn(items.nth(i)));
      return out;
    }
    /** The line of the review queue for one person's answer, by the day it was sent. */
    const queueLineOf = (lines, person, sentAt) => lines.find((line) => line.includes(`${person.first} Sent ${londonDayLabel(sentAt)},`)) ?? null;

    // ---- Asking to be excused ----------------------------------------------
    /** Before an ask: the Requests page, with the harness admin's email about new requests switched on (on unless somebody switched it off). */
    async function adminEmailsOn() {
      const pg = await as("admin");
      await pg.goto(`${origin}/admin/admissions/requests`, { waitUntil: "domcontentloaded" });
      const card = pg.getByTestId("requests-email-me");
      await card.waitFor({ timeout: WAIT_MS });
      const box = card.getByRole("checkbox");
      await waitFor("the switch to be live once the page has hydrated", async () => box.isEnabled());
      if (!(await box.isChecked())) {
        const [saved] = await Promise.all([responseTo(pg, "/api/courses/requests/emails", "POST"), box.check()]);
        await okBody(saved, "Switching the email about new requests back on");
      }
      assert.equal(await box.isChecked(), true);
    }
    /**
     * The three things a person confirms before asking about a session still
     * to come, ticked in the order the form asks them: Send stays off until
     * the last. The middle one is asked only where joining online is a real
     * choice for that session, which it is for Group A (a room, and a link).
     */
    async function confirmInOrder(form) {
      const send = form.getByTestId("excuse-send");
      const ticks = [form.getByTestId("excuse-confirm-in-person"), form.getByTestId("excuse-confirm-own-online"), form.getByTestId("excuse-confirm-other-online")];
      await waitFor("the form to be live once the page has hydrated", async () => ticks[0].isEnabled());
      for (const tick of ticks) {
        assert.equal(await send.isDisabled(), true, "Send works before everything is confirmed");
        await tick.check();
      }
      await waitFor("Send to be live once everything is confirmed", async () => send.isEnabled());
    }
    /** The admins' word of one ask, as the harness's admin gets it: who and which week, never why or a meeting link, and the way to the request. */
    function assertAboutTheAsk(message, { person, week, why, requestId }) {
      assert.match(message.Subject ?? "", new RegExp(`^${person.first}\\b.* asked to be excused from week ${week}(, for (today|tomorrow))?$`), "the admins' email does not say who asked about which week");
      assert.ok(!(message.HTML ?? "").includes(why) && !(message.Text ?? "").includes(why), "the admins' email carries the reason");
      assert.ok(hrefUrls(message.HTML ?? "").some((url) => url.endsWith(requestPath(requestId))), "the admins' email does not lead to the request");
    }

    // ---- The story's own record, which the books are held to -------------
    /** Who did which week, when, by the presses and the seed: [person, week] -> "on time" | "late". */
    const work = new Map();
    const workKey = (person, week) => `${person.key}:${week}`;

    let excusedRequestId = null;
    let pastRequestId = null;
    let correctionRequestId = null;

    try {
      await step("the admin approves everybody on the term and the member on no programme", async () => {
        const pg = await as("admin");
        await signIn(pg, { email: secrets.adminEmail, password: secrets.adminPassword });
        await press("approving the accounts", eachOf(everybody), async () => {
          for (const account of everybody) {
            await approvePendingApplicant(pg, origin, { email: account.email });
            await waitFor(`${account.first}'s account to say member`, async () => (await readUserDoc(account.uid))?.role === "member");
          }
        });
      });

      await step("the admin makes the lead SU-recognised committee, and the account that will cover a session committee, on their member pages", async () => {
        const pg = await as("admin");
        await press("making the lead and the committee member", nobody, async () => {
          for (const [account, recognised] of [
            [gus, true],
            [kit, false],
          ]) {
            await pg.goto(`${origin}/admin/members/${enc(account.uid)}`, { waitUntil: "domcontentloaded" });
            const access = pg.locator(`section[aria-labelledby="access-${account.uid}"]`);
            await access.waitFor({ timeout: WAIT_MS });
            await access.getByRole("combobox", { name: "Role", exact: true }).selectOption({ label: WORDS.committee });
            await waitFor(`${account.first}'s account to say committee`, async () => (await readUserDoc(account.uid))?.role === "committee");
            if (!recognised) continue;
            const box = access.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(WORDS.recognisedSwitch)}`) });
            await box.waitFor({ state: "attached", timeout: WAIT_MS });
            await box.locator("xpath=ancestor::label[1]").click();
            await waitFor(`${account.first}'s account to say SU-recognised`, async () => (await readUserDoc(account.uid))?.suRecognised === true);
          }
        });
      });

      await step("the admin names the running course run and the programme's lead on the Settings tab, and hands its people over", async () => {
        const pg = await as("admin");
        await press("naming the run and the lead", nobody, async () => {
          await pg.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
          const region = pg.getByRole("region", { name: "Course run" });
          await region.waitFor({ timeout: WAIT_MS });
          const runBox = region.getByLabel("Run", { exact: true });
          await runBox.waitFor({ timeout: WAIT_MS });
          const [named] = await Promise.all([
            responseTo(pg, `/programmes/${state.programmeId}/run`, "PUT"),
            runBox.selectOption({ label: `${state.runLabel} · Running` }),
          ]);
          assert.equal((await okBody(named, "Naming the run")).panel?.runId, state.runId, "the panel names another run");
          const holding = state.people.length;
          const [handOver] = await Promise.all([
            responseTo(pg, "/run/hand-over", "POST"),
            region.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
          ]);
          await okBody(handOver, "Handing over");
          await region.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });
          await pg.getByRole("button", { name: WORDS.chooseLead, exact: true }).click();
          const menu = pg.getByRole("menu", { name: WORDS.chooseLead });
          const [roles] = await Promise.all([
            responseTo(pg, `/programmes/${state.programmeId}/roles`, "PUT"),
            menu.getByRole("menuitem", { name: new RegExp(escapeRegExp(gus.displayName)) }).click(),
          ]);
          assert.equal((await okBody(roles, "Naming the lead")).programme?.lead?.uid, gus.uid, "the programme's lead is not the one chosen");
        });
      });

      await step("the admin appoints two facilitators to Group A, one of them holding a place in it, and one to Group B", async () => {
        const pg = await as("admin");
        await press("appointing the facilitators", nobody, async () => {
          await pg.goto(`${formBase}/groups/facilitators`, { waitUntil: "domcontentloaded" });
          const card = pg.locator('section[aria-labelledby="facilitators-title"]');
          await card.getByText(`0 facilitators for ${state.groups.length} groups`, { exact: true }).waitFor({ timeout: WAIT_MS });
          for (const [group, people] of [
            [groupA, [fern, ivo]],
            [groupB, [hal]],
          ]) {
            await card.getByRole("button", { name: `Change ${group.name}’s facilitators`, exact: true }).click();
            for (const person of people) {
              await card.getByPlaceholder("Search people…").fill(person.displayName);
              await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(person.displayName)) }).check();
            }
            const [response] = await Promise.all([
              responseTo(pg, `/groups/${group.id}/facilitators`, "POST"),
              card.getByRole("button", { name: "Save", exact: true }).click(),
            ]);
            const body = await okBody(response, `Saving ${group.name}'s facilitators`);
            assert.deepEqual([...body.facilitatorUids].sort(), people.map((person) => person.uid).sort());
          }
        });
        // Ivo sits where he was placed: still a fellow's place in Group A.
        const seat = (await fixtureDoc("courseEnrolments", `${state.runId}__${ivo.uid}`).get()).data();
        assert.deepEqual([seat?.groupId, seat?.status], [groupA.id, "active"], "appointing Ivo moved his place");
      });

      // ======================================================================
      // A. THE TIME
      // ======================================================================

      await step("the facilitator moves one coming week from her group's page, reading the preview and its count first, with the notice on: the group alone is emailed, once each, with no meeting link, and a fellow reads the new time", async () => {
        const pg = await as(fern);
        const { fresh } = await press("moving Group A's week 3", eachOf(toldA), async () => {
          await pg.goto(`${origin}${learnGroupPath(groupA)}`, { waitUntil: "domcontentloaded" });
          const open = pg.getByRole("button", { name: WORDS.changeOneWeek, exact: true });
          await waitFor("Change one week to be live once the page has hydrated", async () => open.isEnabled());
          await open.click();
          const panel = pg.getByRole("dialog", { name: WORDS.changeOneWeek, exact: true });
          await panel.getByLabel(WORDS.whichWeek, { exact: true }).selectOption(String(MOVED_WEEK));
          await panel.getByRole("radio", { name: /^Move it/ }).check();
          await panel.getByLabel(WORDS.day, { exact: true }).selectOption(movedDateKey);
          await panel.getByLabel(WORDS.starts, { exact: true }).selectOption(MOVED_START);
          await panel.getByLabel(WORDS.reasonNeeded, { exact: true }).fill(WHY.move);
          // What will happen, from the route's own preview: the session before and after, and who is told.
          const preview = await waitFor("the move's preview", async () => {
            const said = await textOf(panel.locator("dl"));
            return said.includes(dayLabel(movedDateKey)) ? said : null;
          });
          assert.ok(preview.includes(dayLabel(original(groupA, MOVED_WEEK).dateKey)), `the preview does not say when week 3 was: ${preview}`);
          const button = panel.getByRole("button", { name: /^Move week 3 and email \d+ (person|people)$/ });
          await button.waitFor({ timeout: WAIT_MS });
          const label = await textOf(button);
          const count = Number(/email (\d+) /.exec(label)?.[1]);
          assert.equal(count, toldA.length, `the button's count is not Group A's ${toldA.length} people: ${label} (preview: ${preview})`);
          const [changed, posted] = await Promise.all([
            pressTo(pg, `/groups/${groupA.id}/session/change`),
            responseTo(pg, `/runs/${state.runId}/updates`, "POST"),
            button.click(),
          ]);
          const body = await okBody(changed, "The move");
          assert.equal(body.update?.withFacilitators, true, "the move's update does not reach the group's facilitators too");
          const sent = await okBody(posted, "Telling the group");
          assert.equal(sent.email?.sent, count, "the update emailed another number than its button");
        });
        for (const person of toldA) {
          const [email] = fresh[person.key];
          assert.equal(email.Subject, `Week ${MOVED_WEEK} moves to ${dayLabel(movedDateKey)}, ${clockWords(MOVED_START)}`, `${person.first}'s subject`);
        }
        const group = (await fixtureDoc("courseGroups", groupA.id).get()).data();
        assert.equal(group?.sessionChanges?.[weekDocId(MOVED_WEEK)]?.kind, "moved", "week 3 carries no move");

        // A fellow reads the new time on their programme page.
        const adaPage = await as(ada);
        await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const ticket = adaPage.getByRole("region", { name: WORDS.ticket, exact: true });
        await waitFor("Ada's next session to be the moved one", async () => {
          const said = await textOf(ticket);
          return said.includes(dayLabel(movedDateKey)) && said.includes(clockWords(MOVED_START)) ? said : null;
        });
      });

      await step("the lead changes Group A's regular time from a later week: the weeks that met keep their day and time on the group's page, the fellow's own sessions and the register, and a fellow answers most weeks, not all, naming one week, and later can add no other", async () => {
        const pg = await as(gus);
        const told = [...toldA, fern];
        const { fresh } = await press("Group A's new regular time", eachOf(told), async () => {
          await pg.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
          await pg.getByRole("button", { name: "Change: Day and time", exact: true }).click();
          const panel = pg.getByRole("dialog", { name: `Change ${groupA.name}’s time or room`, exact: true });
          await panel.waitFor({ timeout: WAIT_MS });
          await panel.getByRole("radio", { name: /^From a week onwards/ }).check();
          await panel.getByLabel(WORDS.fromWhichWeek, { exact: true }).selectOption(String(FROM_WEEK));
          await panel.getByLabel(WORDS.day, { exact: true }).selectOption(String(newWeekday));
          await panel.getByLabel(WORDS.reasonOptional, { exact: true }).fill(WHY.regular);
          // "Weeks 1 to 3 keep their dates": the weeks before the change, the two that met among them.
          const preview = await waitFor("the new time's preview", async () => {
            const said = await textOf(panel.locator("dl"));
            return said.includes("keep their dates") ? said : null;
          });
          assert.match(preview, /Weeks 1 (and 2|to [23]) keep their dates/, `the preview does not keep the weeks that met: ${preview}`);
          const button = panel.getByRole("button", { name: new RegExp(`^Change ${escapeRegExp(groupA.name)}’s time and email \\d+ (person|people)$`) });
          await button.waitFor({ timeout: WAIT_MS });
          const label = await textOf(button);
          const count = Number(/email (\d+) /.exec(label)?.[1]);
          assert.equal(count, told.length, `the button's count is not Group A's people and its other facilitator: ${label} (preview: ${preview})`);
          const [changed] = await Promise.all([pressTo(pg, `/groups/${groupA.id}/session/regular`), button.click()]);
          const body = await okBody(changed, "The new regular time");
          assert.equal(body.email?.sent, count, "the notice emailed another number than its button");
          await pg.getByRole("status").filter({ hasText: `${groupA.name} now meets on ${WEEKDAYS[newWeekday]}s` }).waitFor({ timeout: WAIT_MS });
        });
        for (const person of told) {
          const [email] = fresh[person.key];
          assert.equal(email.Subject, `${groupA.name} now meets on ${WEEKDAYS[newWeekday]}s, ${clockWords(groupA.startTimeLocal)}`, `${person.first}'s subject`);
          // Asked "Can you make this time most weeks?" when holding a place, and never as a facilitator (Ivo is both).
          const asks = `${email.Text ?? ""} ${email.HTML ?? ""}`.includes(WORDS.timeCard);
          assert.equal(asks, person !== fern && person !== ivo, `${person.first} ${asks ? "is" : "is not"} asked whether they can make the time`);
        }

        // The weeks that met keep their day and time: on the group's page ...
        await pg.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
        const pills = pg.getByRole("group", { name: "Weeks", exact: true }).getByRole("button");
        await pills.first().waitFor({ timeout: WAIT_MS });
        const named = [];
        for (let i = 0; i < (await pills.count()); i += 1) named.push((await pills.nth(i).getAttribute("aria-label")) ?? "");
        for (let week = 1; week <= state.weekCount; week += 1) {
          assert.ok(named[week - 1]?.startsWith(`Week ${week}, ${dayLabel(sessionA(week).dateKey)}`), `week ${week}'s pill on the group's page: ${named[week - 1]}`);
        }
        // ... on the fellow's own sessions ...
        const adaPage = await as(ada);
        await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const marks = adaPage.locator('section[aria-labelledby="your-marks"]').getByRole("img");
        await marks.first().waitFor({ timeout: WAIT_MS });
        const own = [];
        for (let i = 0; i < (await marks.count()); i += 1) own.push((await marks.nth(i).getAttribute("aria-label")) ?? "");
        for (let week = 1; week <= state.weekCount; week += 1) {
          assert.ok(own.some((said) => said.startsWith(`Week ${week}, ${dayLabel(sessionA(week).dateKey)}:`)), `Ada's own week ${week} is not on ${dayLabel(sessionA(week).dateKey)}: ${JSON.stringify(own)}`);
        }
        // ... and on the register, which the facilitator reads.
        const fernPage = await as(fern);
        await fernPage.goto(`${origin}${learnRegisterPath(groupA)}`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        // The register draws the sessions that have met: weeks 1 and 2, each on the day it met.
        const heads = (await fernPage.getByTestId("attendance-session").allTextContents()).map(flat);
        for (const week of [1, 2]) {
          const head = heads.find((said) => new RegExp(`^Week ${week}(?!\\d)`).test(said)) ?? "";
          assert.ok(head.includes(dayLabel(original(groupA, week).dateKey)), `the register's week ${week} is not on ${dayLabel(original(groupA, week).dateKey)}: ${JSON.stringify(heads)}`);
        }
        const storedA = (await fixtureDoc("courseGroups", groupA.id).get()).data();
        assert.equal(storedA?.session?.weekday, newWeekday, "the group's regular day is not the new one");

        // A fellow is asked again, and answers Most weeks, not all, naming week 5.
        await press("Ada's answer", nobody, async () => {
          await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
          const card = adaPage.getByRole("region", { name: WORDS.timeCard, exact: true });
          const most = card.getByRole("button", { name: WORDS.mostWeeks, exact: true });
          await most.waitFor({ timeout: WAIT_MS });
          await waitFor("Most weeks, not all to be live", async () => most.isEnabled());
          await most.click();
          const option = `Week ${MOST_WEEKS_WEEK}, ${dayLabel(onNewDay(MOST_WEEKS_WEEK))}`;
          const box = card.getByRole("checkbox", { name: option, exact: true });
          await box.waitFor({ state: "attached", timeout: WAIT_MS });
          await card.getByText(option, { exact: true }).click();
          await waitFor(`${option} to be ticked`, async () => box.isChecked());
          const [sent] = await Promise.all([
            responseTo(adaPage, `/runs/${enc(state.runId)}/time-answer`, "POST"),
            card.getByRole("button", { name: WORDS.sendAnswer, exact: true }).click(),
          ]);
          assert.deepEqual(sent.request().postDataJSON(), { groupId: groupA.id, kind: "mostWeeks", sessionKeys: [weekDocId(MOST_WEEKS_WEEK)] });
          await okBody(sent, "Most weeks, not all");
          await card.getByRole("status").filter({ hasText: WORDS.savedMostWeeks }).waitFor({ timeout: WAIT_MS });
        });
        const week5 = await storedRegister(groupA, MOST_WEEKS_WEEK);
        assert.equal(week5?.records?.[ada.uid], "excused", "week 5's register does not record Ada's word");

        // Later, the same answer takes no week more: the card offers her own tick, to untick, and says to ask.
        await press("Ada trying to add a week", nobody, async () => {
          await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
          const card = adaPage.getByRole("region", { name: WORDS.timeCard, exact: true });
          const change = card.getByRole("button", { name: WORDS.changeAnswer, exact: true });
          await change.waitFor({ timeout: WAIT_MS });
          await waitFor("Change your answer to be live", async () => change.isEnabled());
          await change.click();
          await card.getByRole("button", { name: WORDS.mostWeeks, exact: true }).click();
          await card.getByText(WORDS.untickOnly, { exact: true }).waitFor({ timeout: WAIT_MS });
          const own = card.getByRole("checkbox", { name: `Week ${MOST_WEEKS_WEEK}, ${dayLabel(onNewDay(MOST_WEEKS_WEEK))}`, exact: true });
          await own.waitFor({ state: "attached", timeout: WAIT_MS });
          assert.equal(await own.isChecked(), true, "her own tick is not on the card");
          const other = card.getByRole("checkbox", { name: `Week ${MOST_WEEKS_WEEK + 1}, ${dayLabel(onNewDay(MOST_WEEKS_WEEK + 1))}`, exact: true });
          assert.equal(await other.count(), 0, "a week she did not tick is offered to tick");
          // A tick by hand, as an old page would send it, is refused and says where to ask.
          const added = await fetchAs(adaPage, `/api/courses/runs/${enc(state.runId)}/time-answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ groupId: groupA.id, kind: "mostWeeks", sessionKeys: [weekDocId(MOST_WEEKS_WEEK), weekDocId(MOST_WEEKS_WEEK + 1)] }),
          });
          assert.equal(added.status, 409, `adding a week answered ${added.status}: ${added.text.slice(0, 300)}`);
          assert.ok(String(added.body?.error ?? "").endsWith(WORDS.addLater), JSON.stringify(added.body));
        });
        assert.equal((await storedRegister(groupA, MOST_WEEKS_WEEK + 1))?.records?.[ada.uid], undefined, "a refused tick wrote a line");
      });

      // ======================================================================
      // B. THE REGISTER
      // ======================================================================

      await step("the lead takes a passed week's register in the facilitators' place, marks every line, one of them wrongly, and finishes it, and the facilitator reads who took it", async () => {
        const pg = await as(gus);
        await pg.goto(`${origin}${groupPagePath(groupA)}`, { waitUntil: "domcontentloaded" });
        const notice = pg.getByTestId("cover-notice");
        await notice.waitFor({ timeout: WAIT_MS });
        const said = await textOf(notice);
        assert.ok(said.includes(`week ${TAKEN_WEEK}’s register`), `the notice is not about week 2's register: ${said}`);
        const take = notice.getByRole("button", { name: /^Take the register in .+ place$/ });
        await press("taking the register", nobody, async () => {
          const [covered] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/attendance/cover`, "POST"), take.click()]);
          assert.equal((await okBody(covered, "Taking the register")).cover?.kind, "self");
        });
        await pg.waitForURL((url) => url.pathname === `${groupPagePath(groupA)}/register` && url.searchParams.get("session") === weekDocId(TAKEN_WEEK), { timeout: WAIT_MS });
        await pg.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        // Ada down as absent by mistake; Ben late; Dan absent; Ivo in the room and then online. Eve had not joined.
        await press("marking the lines", nobody, async () => {
          await tap(pg, groupA, cellOf(pg, ada, TAKEN_WEEK), 4);
          await tap(pg, groupA, cellOf(pg, ben, TAKEN_WEEK), 2);
          await tap(pg, groupA, cellOf(pg, dan, TAKEN_WEEK), 4);
          await tap(pg, groupA, cellOf(pg, ivo, TAKEN_WEEK), 1);
          const where = rowOf(pg, ivo).getByRole("button", { name: new RegExp(`^Where .+ was in week ${TAKEN_WEEK}: in the room`) });
          const [placed] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/attendance`, "POST"), where.click()]);
          await okBody(placed, "Saying Ivo joined online");
        });
        const eveCells = await rowOf(pg, eve).getByRole("img", { name: /^Not in the group yet: joined in week 3/ }).count();
        assert.ok(eveCells >= 2, "Eve's weeks before she joined are not shown as before she joined");
        const draft = await storedRegister(groupA, TAKEN_WEEK);
        assert.deepEqual(
          [draft?.records?.[ada.uid], draft?.records?.[ben.uid], draft?.records?.[dan.uid], draft?.records?.[ivo.uid], draft?.online?.[ivo.uid], draft?.records?.[eve.uid]],
          ["absent", "late", "absent", "present", true, undefined],
          "the lines are not the ones set",
        );

        // What finishing emails, said by the register before the press.
        const answer = await fetchAs(pg, `/api/courses/groups/${enc(groupA.id)}/attendance`);
        assert.equal(answer.status, 200, JSON.stringify(answer.body).slice(0, 300));
        const line = answer.body?.ending?.pushEmails?.[weekDocId(TAKEN_WEEK)];
        assert.ok(line, `the register does not say what finishing week 2 emails: ${JSON.stringify(answer.body?.ending ?? null)}`);
        const sends = line.kind === "sends";
        console.log(`[whole-term] finishing week ${TAKEN_WEEK}'s register, as the register says before the press: ${JSON.stringify(line)}`);
        if (sends) {
          assert.deepEqual([line.weekNumber, line.day, line.emails], [MOVED_WEEK, dayLabel(movedDateKey), toldA.length], `what finishing says it emails: ${JSON.stringify(line)}`);
        }
        const { fresh } = await press("finishing week 2's register", sends ? eachOf(toldA) : nobody, async () => {
          await pg.getByTestId("register-ending").getByRole("button").first().click();
          const confirm = pg.getByTestId("push-confirm");
          await confirm.waitFor({ timeout: WAIT_MS });
          const [pushed] = await Promise.all([responseTo(pg, `/groups/${groupA.id}/attendance/push`, "POST"), confirm.getByTestId("push-confirm-submit").click()]);
          const body = await okBody(pushed, "Finishing the register");
          assert.equal(body.sent, sends ? toldA.length : 0, `finishing sent ${body.sent}: ${JSON.stringify(body)}`);
          await waitFor("the register to be finished", async () => Boolean((await storedRegister(groupA, TAKEN_WEEK))?.pushedAt));
        });
        if (sends) {
          for (const person of toldA) {
            const [email] = fresh[person.key];
            assert.ok(flat(email.Text ?? "").includes(dayLabel(movedDateKey)), `${person.first}'s week 3 email does not name the day it moved to: ${flat(email.Text ?? "").slice(0, 400)}`);
          }
        }
        const finished = await storedRegister(groupA, TAKEN_WEEK);
        assert.equal(finished?.cover?.byUid, gus.uid, "the register does not say the lead took it");

        // The facilitator opens it and reads who took it.
        const fernPage = await as(fern);
        await fernPage.goto(`${origin}${learnRegisterPath(groupA)}?session=${weekDocId(TAKEN_WEEK)}`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        // Who set each line of it, and when: the lead, on every one.
        for (const person of [ada, ben, dan, ivo]) {
          const stamp = rowOf(fernPage, person).getByTestId("attendance-set-by").last();
          assert.match(await textOf(stamp), new RegExp(`^${escapeRegExp(gus.first)}, `), `${person.first}'s week 2 line does not say the lead set it`);
        }
      });

      await step("the admin gives the other group's coming session to the committee member, who is emailed once, opens that one register and is refused the rest of the group; the member on no programme cannot be chosen", async () => {
        const pg = await as("admin");
        await pg.goto(`${origin}${groupPagePath(groupB)}`, { waitUntil: "domcontentloaded" });
        await pg.getByRole("group", { name: "Weeks", exact: true }).getByRole("button", { name: new RegExp(`^Week ${GIVEN_WEEK},`) }).click();
        await pg.getByRole("button", { name: `${WORDS.takeTheRegister}: Week ${GIVEN_WEEK}`, exact: true }).click();
        const sheet = pg.getByTestId("cover-sheet");
        await sheet.waitFor({ timeout: WAIT_MS });
        await sheet.getByRole("button", { name: new RegExp(`^${escapeRegExp(WORDS.someoneElse)}`) }).click();
        const panel = pg.getByTestId("give-panel");
        await panel.waitFor({ timeout: WAIT_MS });
        const search = panel.getByPlaceholder("Search people…");
        await search.fill(kit.displayName);
        await panel.getByRole("checkbox", { name: new RegExp(escapeRegExp(kit.displayName)) }).waitFor({ timeout: WAIT_MS });
        // The member on no programme, and a fellow: neither runs anything, so neither is offered.
        for (const nobodyToGive of [max, cleo]) {
          await search.fill(nobodyToGive.displayName);
          assert.equal(await panel.getByRole("checkbox", { name: new RegExp(escapeRegExp(nobodyToGive.displayName)) }).count(), 0, `${nobodyToGive.first} is offered the session`);
        }
        await search.fill(kit.displayName);
        const [previewed] = await Promise.all([
          responseTo(pg, `/groups/${groupB.id}/attendance/cover`, "POST"),
          panel.getByRole("checkbox", { name: new RegExp(escapeRegExp(kit.displayName)) }).check(),
        ]);
        assert.equal((await okBody(previewed, "Previewing the cover")).preview?.person?.uid, kit.uid);
        const tick = panel.getByRole("checkbox", { name: new RegExp(`^Tell ${escapeRegExp(groupB.name)} that`) });
        assert.equal(await tick.isChecked(), false, "telling the group is on before anybody ticks it");
        const { fresh } = await press("giving Group B's week 3 to Kit", { kit: 1 }, async () => {
          const button = panel.getByRole("button", { name: `Give ${kit.first} this session and email ${kit.first} (1)`, exact: true });
          const [given] = await Promise.all([pressTo(pg, `/groups/${groupB.id}/attendance/cover`), button.click()]);
          const body = await okBody(given, "Giving the session");
          assert.deepEqual([body.cover?.kind, body.email, body.notice], ["given", "sent", null]);
        });
        const [email] = fresh.kit;
        assert.match(email.Subject ?? "", new RegExp(`^You’re covering ${escapeRegExp(groupB.name)} `));
        const link = `${learnRegisterPath(groupB)}?session=${weekDocId(GIVEN_WEEK)}`;
        assert.ok((email.HTML ?? "").includes(link) || (email.Text ?? "").includes(link), "the email does not link to the register");

        // Kit opens that one register, and nothing else of the group.
        const kitPage = await as(kit);
        await kitPage.goto(`${origin}${link}`, { waitUntil: "domcontentloaded" });
        await kitPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        assert.equal(await kitPage.getByTestId("attendance-session").count(), 1, "somebody given one session sees another week");
        assert.ok((await textOf(kitPage.getByTestId("attendance-session").first())).startsWith(`Week ${GIVEN_WEEK}`));
        for (const path of [learnGroupPath(groupB), `${learnRegisterPath(groupB)}?session=${weekDocId(1)}`, learnRegisterPath(groupA)]) {
          await kitPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
          await kitPage.waitForURL((url) => url.pathname === "/learn", { timeout: WAIT_MS });
        }
        const theirs = await fetchAs(kitPage, `/api/courses/groups/${enc(groupA.id)}/attendance`);
        assert.equal(theirs.status, 403, "the committee member reads another group's register");
      });

      await step("the facilitator asks for a correction of the wrong line with a reason, the lead approves it from the Requests page, the fellow reads corrected with the day and another fellow nothing, and nobody is emailed", async () => {
        const fernPage = await as(fern);
        await press("asking for a correction", nobody, async () => {
          await fernPage.goto(`${origin}${learnRegisterPath(groupA)}?session=${weekDocId(TAKEN_WEEK)}`, { waitUntil: "domcontentloaded" });
          await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
          assert.match((await cellOf(fernPage, ada, TAKEN_WEEK).getAttribute("aria-label")) ?? "", /: Absent\. .*Ask for a correction\.$/);
          await cellOf(fernPage, ada, TAKEN_WEEK).click();
          const sheet = fernPage.getByTestId("line-sheet");
          await sheet.getByRole("heading", { name: WORDS.ask, exact: true }).waitFor({ timeout: WAIT_MS });
          await sheet.getByRole("radio", { name: "In the room", exact: true }).check();
          await sheet.getByRole("textbox").fill(WHY.correction);
          const [asked] = await Promise.all([responseTo(fernPage, `/groups/${groupA.id}/attendance/requests`, "POST"), sheet.getByTestId("line-sheet-submit").click()]);
          const body = await okBody(asked, "Asking for a correction");
          assert.equal(body.request?.state, "waiting");
          correctionRequestId = body.request.id;
          await sheet.waitFor({ state: "detached", timeout: WAIT_MS });
        });

        const pg = await as(gus);
        await press("the lead approving it", nobody, async () => {
          await pg.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
          const card = pg.getByTestId("home-requests");
          await card.waitFor({ timeout: WAIT_MS });
          await card.getByRole("link", { name: "Open" }).click();
          await pg.waitForURL((url) => url.pathname === "/admin/admissions/requests", { timeout: WAIT_MS });
          const row = pg.getByTestId("request-row").filter({ hasText: ada.first }).first();
          await row.waitFor({ timeout: WAIT_MS });
          await row.getByRole("link").click();
          await pg.waitForURL((url) => url.pathname === requestPath(correctionRequestId), { timeout: WAIT_MS });
          const [taken] = await Promise.all([responseTo(pg, `/requests/${correctionRequestId}/take`, "POST"), pg.getByTestId("request-take").click()]);
          assert.equal((await okBody(taken, "Taking the request")).handlingUid, gus.uid);
          await pg.getByText("You have it.", { exact: true }).waitFor({ timeout: WAIT_MS });
          const [approved] = await Promise.all([responseTo(pg, `/requests/${correctionRequestId}/approve`, "POST"), pg.getByTestId("request-approve").click()]);
          assert.equal((await okBody(approved, "Approving the request")).status, "approved");
        });
        const register = await waitFor("Ada's line to say in the room", async () => {
          const doc = await storedRegister(groupA, TAKEN_WEEK);
          return doc?.records?.[ada.uid] === "present" ? doc : null;
        });
        assert.ok(register.corrected?.[ada.uid], "the line is not stamped as corrected");

        // Ada reads corrected, with the day, and nothing else; Ben nothing.
        const adaPage = await as(ada);
        await adaPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        const corrected = adaPage.getByTestId("marks-corrected");
        await corrected.waitFor({ timeout: WAIT_MS });
        assert.equal(await textOf(corrected), `Week ${TAKEN_WEEK}, ${dayLabel(original(groupA, TAKEN_WEEK).dateKey)}: corrected on ${dayLabel(londonDateKey(new Date(register.corrected[ada.uid].at.toDate())))}.`);
        const adaSays = await textOf(adaPage.locator("main"));
        for (const never of [WHY.correction, "Corrected by", "as you asked"]) assert.ok(!adaSays.includes(never), `Ada's page says "${never}"`);
        const benPage = await as(ben);
        await benPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
        await benPage.locator('section[aria-labelledby="your-marks"]').waitFor({ timeout: WAIT_MS });
        assert.equal(await benPage.getByTestId("marks-corrected").count(), 0, "Ben's page says a line was corrected");
        assert.ok(!(await textOf(benPage.locator("main"))).includes(WHY.correction), "Ben's page carries the reason");
      });

      await step("the admin says the other group's passed week didn't happen, keeping pace, with no notice", async () => {
        const pg = await as("admin");
        await pg.goto(`${origin}${groupPagePath(groupB)}`, { waitUntil: "domcontentloaded" });
        await pg.getByRole("tab", { name: WORDS.attendanceTab, exact: true }).click();
        const table = pg.getByTestId("group-attendance");
        await table.waitFor({ timeout: WAIT_MS });
        await table.getByTestId("group-attendance-column").nth(NOT_HELD_WEEK - 1).click();
        const column = pg.getByTestId("column-sheet");
        await column.getByRole("heading", { name: `Correct week ${NOT_HELD_WEEK}’s whole column`, exact: true }).waitFor({ timeout: WAIT_MS });
        await column.getByRole("radio", { name: new RegExp(`^${escapeRegExp(WORDS.didntHappen)}`) }).check();
        await column.getByRole("radio", { name: new RegExp(`^${escapeRegExp(WORDS.keepPace)}`) }).check();
        const tell = column.getByRole("checkbox", { name: new RegExp(`^Email ${escapeRegExp(groupB.name)}`) });
        if ((await tell.count()) > 0 && (await tell.isChecked())) await tell.uncheck();
        await column.getByRole("textbox").fill(WHY.notHeld);
        await waitFor("Before you save to say what it does", async () => (await textOf(column.getByTestId("column-before"))).length > 0);
        await press("saying Group B's week 1 didn't happen", nobody, async () => {
          const [saved] = await Promise.all([
            pressTo(pg, `/groups/${groupB.id}/attendance/column`),
            column.getByRole("button", { name: WORDS.saveDidntHappen, exact: true }).click(),
          ]);
          const body = await okBody(saved, "It didn't happen");
          assert.ok(!body.update, "keeping pace with no notice still handed back an update to post");
        });
        const group = (await fixtureDoc("courseGroups", groupB.id).get()).data();
        assert.equal(group?.sessionChanges?.[weekDocId(NOT_HELD_WEEK)]?.kind, "cancelled", "Group B's week 1 is not cancelled");
        const register = await storedRegister(groupB, NOT_HELD_WEEK);
        assert.deepEqual([Object.keys(register?.records ?? {}).length, register?.pushedAt ?? null], [0, null], "week 1's lines and its finish are still there");
      });

      // ======================================================================
      // C. THE WORK
      // ======================================================================

      await step("one fellow does week 3 before its session and another does week 2 after its session, and the facilitator and the lead read the second as late, with how late, and the on time ones as on time", async () => {
        await press("Ada doing week 3 and Ben doing week 2", nobody, async () => {
          await doTheWeek(ada, ON_TIME_WEEK, WRITES.ada);
          await doTheWeek(ben, LATE_WEEK, WRITES.ben);
        });
        const adaDone = await doneAtOf(ada, ON_TIME_WEEK);
        const benDone = await doneAtOf(ben, LATE_WEEK);
        assert.ok(londonDateKey(adaDone) < movedDateKey, "Ada's week 3 is not done before the day of its session");
        const benLate = benDone.getTime() - original(groupA, LATE_WEEK).startsAt.getTime();
        assert.ok(benLate > 0, "Ben's week 2 is not after its session");
        work.set(workKey(ada, ON_TIME_WEEK), { on: "time" });
        work.set(workKey(ben, LATE_WEEK), { on: "late", lateMs: benLate });

        // The facilitator: week 2's card on her group's page counts one on time and one late ...
        const fernPage = await as(fern);
        const card = await weekCardOf(fernPage, LATE_WEEK);
        assert.equal(card.heading, WORDS.haveDone(2, fellowsA.length, LATE_WEEK), card.said);
        assert.deepEqual([card.buckets[WORDS.doneOnTime], card.buckets[WORDS.doneLate]], [1, 1], `week 2's bar: ${card.said}`);
        // ... and her Feedback to write says Ben's answer came late, and how late, and Dan's not.
        const queue = await reviewQueueOf(fernPage);
        const benSent = await firstSentOf(ben, LATE_WEEK);
        const benLine = queueLineOf(queue, ben, benSent);
        const benSentLate = benSent.getTime() - original(groupA, LATE_WEEK).startsAt.getTime();
        assert.ok(benLine?.includes(`Late: ${lateWords(benSentLate)} after the session`), `the facilitator does not read Ben's week 2 as late: ${JSON.stringify(queue)}`);
        const danLine = queueLineOf(queue, dan, await firstSentOf(dan, LATE_WEEK));
        assert.ok(danLine && !danLine.includes("Late:"), `the facilitator does not read Dan's week 2 as on time: ${JSON.stringify(queue)}`);

        // The lead: the Coursework tab.
        const pg = await as(gus);
        await pg.goto(`${formBase}/coursework`, { waitUntil: "domcontentloaded" });
        const benCell = pg.getByRole("link", { name: `Week ${LATE_WEEK}, done: ${ben.displayName}’s coursework`, exact: true });
        await benCell.waitFor({ timeout: WAIT_MS });
        const benSays = await textOf(benCell);
        assert.ok(benSays.startsWith(WORDS.doneLate) && benSays.includes(`Late: ${lateWords(benLate)} after the session`), `the lead does not read Ben's week 2 as late: ${benSays}`);
        const danCell = pg.getByRole("link", { name: `Week ${LATE_WEEK}, done: ${dan.displayName}’s coursework`, exact: true });
        assert.ok((await textOf(danCell)).startsWith(WORDS.doneOnTime), `the lead does not read Dan's week 2 as on time: ${await textOf(danCell)}`);
        const adaCell = pg.getByRole("link", { name: `Week ${ON_TIME_WEEK}, done: ${ada.displayName}’s coursework`, exact: true });
        assert.ok((await textOf(adaCell)).startsWith(WORDS.done), `the lead does not read Ada's week 3 as done: ${await textOf(adaCell)}`);
        assert.ok(!(await textOf(adaCell)).startsWith(WORDS.doneLate), "Ada's week 3 reads as late");
      });

      await step("the second facilitator does their own week late: the lead and the admin read it, the facilitator of the group they sit in is shown nothing of it, and it is in no count", async () => {
        await press("Ivo doing his own week 2", nobody, async () => {
          await doTheWeek(ivo, LATE_WEEK, WRITES.ivo);
        });
        const ivoDone = await doneAtOf(ivo, LATE_WEEK);
        const ivoLate = ivoDone.getTime() - original(groupA, LATE_WEEK).startsAt.getTime();
        work.set(workKey(ivo, LATE_WEEK), { on: "late", lateMs: ivoLate });

        // The lead and the admin read it, marked as a facilitator's own.
        for (const reader of [gus, "admin"]) {
          const pg = await as(reader);
          await pg.goto(`${formBase}/coursework`, { waitUntil: "domcontentloaded" });
          const cell = pg.getByRole("link", { name: `Week ${LATE_WEEK}, done: ${ivo.displayName}’s coursework`, exact: true });
          await cell.waitFor({ timeout: WAIT_MS });
          const said = await textOf(cell);
          assert.ok(said.startsWith(WORDS.doneLate) && said.includes(`Late: ${lateWords(ivoLate)} after the session`), `${reader === "admin" ? "the admin" : "the lead"} does not read Ivo's week 2 as late: ${said}`);
          const row = pg.getByRole("row").filter({ has: pg.getByRole("link", { name: ivo.displayName, exact: true }) }).first();
          assert.ok((await textOf(row)).includes("Facilitator"), "Ivo's row is not marked as a facilitator's");
        }
        // The facilitator of the group he sits in: nothing of it, and the count unchanged.
        const fernPage = await as(fern);
        await fernPage.goto(`${origin}${learnGroupPath(groupA)}?week=${LATE_WEEK}`, { waitUntil: "domcontentloaded" });
        const card = fernPage.getByTestId("week-work-count");
        await card.getByRole("heading", { name: WORDS.haveDone(2, fellowsA.length, LATE_WEEK), exact: true }).waitFor({ timeout: WAIT_MS });
        const main = await textOf(fernPage.locator("main"));
        for (const words of Object.values(WRITES.ivo)) assert.ok(!main.includes(words), `the facilitator's group page carries Ivo's words: ${words}`);
        const table = fernPage.getByRole("region", { name: "This week’s work" }).first();
        assert.equal(await table.getByRole("row").filter({ hasText: ivo.first }).count(), 0, "the facilitator's table has a row for Ivo's own week");
        await fernPage.goto(`${origin}${learnGroupPath(groupA)}/reflections/names?week=${LATE_WEEK}`, { waitUntil: "domcontentloaded" });
        const names = await waitFor("the facilitator's reflections with names to show Ben's", async () => {
          const said = await textOf(fernPage.locator("main"));
          return said.includes(WRITES.ben.rp1) ? said : null;
        });
        for (const words of [WRITES.ivo.rp1, WRITES.ivo.rp2, WRITES.ivo.rp3]) assert.ok(!names.includes(words), "the facilitator reads Ivo's own reflections");
        // In no count on the lead's page of the group either.
        const pg = await as(gus);
        await pg.goto(`${origin}${groupPagePath(groupA)}?week=${LATE_WEEK}`, { waitUntil: "domcontentloaded" });
        await pg.getByText(WORDS.haveDone(2, fellowsA.length, LATE_WEEK), { exact: true }).first().waitFor({ timeout: WAIT_MS });
      });

      await step("the facilitator reads who has done week 1 and reminds by hand: only the fellows whose week is not done are emailed, once each, with no meeting link, and one of them finishes it and is offered no reminder", async () => {
        const fernPage = await as(fern);
        const remindPath = `/api/courses/groups/${enc(groupA.id)}/remind`;
        await fernPage.goto(`${origin}${learnGroupPath(groupA)}?week=${REMIND_WEEK}`, { waitUntil: "domcontentloaded" });
        const card = fernPage.getByTestId("week-work-count");
        await card.getByRole("heading", { name: WORDS.haveDone(1, fellowsA.length, REMIND_WEEK), exact: true }).waitFor({ timeout: WAIT_MS });
        const notDone = [ben, dan];
        const { fresh } = await press("reminding Group A about week 1", eachOf(notDone), async () => {
          const [previewed] = await Promise.all([
            responseTo(fernPage, remindPath, "POST"),
            card.getByRole("button", { name: WORDS.remindAll(notDone.length), exact: true }).click(),
          ]);
          const preview = (await okBody(previewed, "Remind's preview")).preview;
          assert.deepEqual(preview.people.map((person) => person.uid).sort(), notDone.map((person) => person.uid).sort(), "Remind reaches somebody else");
          const panel = fernPage.getByTestId("remind-panel");
          const send = panel.getByTestId("remind-send");
          await send.waitFor({ timeout: WAIT_MS });
          assert.equal(await textOf(send), WORDS.sendTo(notDone.length));
          await waitFor("Send to be live", async () => send.isEnabled());
          const [pressed] = await Promise.all([pressTo(fernPage, remindPath), send.click()]);
          assert.deepEqual(pressed.request().postDataJSON(), { week: REMIND_WEEK, count: notDone.length });
          assert.equal((await okBody(pressed, "Remind")).sent?.sent, notDone.length);
        });
        for (const person of notDone) {
          const [email] = fresh[person.key];
          assert.equal(email.Subject, WORDS.remindSubject(REMIND_WEEK), `${person.first}'s reminder`);
          assert.ok(flat(email.Text ?? "").includes(`our records show week ${REMIND_WEEK} isn’t done`), "the reminder does not name its week");
        }

        // Dan finishes week 1, late, and is no longer offered a reminder.
        await press("Dan doing week 1", nobody, async () => {
          await doTheWeek(dan, REMIND_WEEK, WRITES.dan);
        });
        const danDone = await doneAtOf(dan, REMIND_WEEK);
        work.set(workKey(dan, REMIND_WEEK), { on: "late", lateMs: danDone.getTime() - original(groupA, REMIND_WEEK).startsAt.getTime() });
        await fernPage.goto(`${origin}${learnGroupPath(groupA)}?week=${REMIND_WEEK}`, { waitUntil: "domcontentloaded" });
        await card.getByRole("heading", { name: WORDS.haveDone(2, fellowsA.length, REMIND_WEEK), exact: true }).waitFor({ timeout: WAIT_MS });
        await card.getByRole("button", { name: WORDS.remindAll(1), exact: true }).waitFor({ timeout: WAIT_MS });
        const again = await fetchAs(fernPage, remindPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week: REMIND_WEEK, preview: true }),
        });
        assert.equal(again.status, 200, again.text.slice(0, 300));
        assert.deepEqual(again.body.preview.people.map((person) => person.uid), [ben.uid], "Dan is still offered a reminder");
      });

      // ======================================================================
      // D. EXCUSED
      // ======================================================================

      await step("a fellow confirms they can't take part another way and asks to be excused from their next session with a reason: the admins alone are emailed, the facilitator's register says they asked and nothing else, and the lead's Requests page does not list it", async () => {
        await adminEmailsOn();
        const benPage = await as(ben);
        const nextDay = dayLabel(movedDateKey);
        const { fresh } = await press("Ben asking to be excused", { admin: 1 }, async () => {
          await benPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
          const ticket = benPage.getByRole("region", { name: WORDS.ticket, exact: true });
          const open = ticket.getByTestId("excuse-open");
          await open.waitFor({ timeout: WAIT_MS });
          assert.equal(await open.getAttribute("aria-label"), WORDS.cantMakeIt(nextDay), "the card is not about the moved session");
          await waitFor("Can't make it to be live", async () => open.isEnabled());
          await open.click();
          const sheet = benPage.getByTestId("excuse-sheet");
          await sheet.waitFor({ timeout: WAIT_MS });
          const form = sheet.getByTestId("excuse-ask-form");
          await form.waitFor({ timeout: WAIT_MS });
          const box = form.getByRole("checkbox", { name: `Week ${MOVED_WEEK} · ${nextDay}`, exact: true });
          assert.equal(await box.isChecked(), true, "the week the card is about is not ticked");
          await form.getByTestId("excuse-reason").fill(WHY.benExcused);
          await confirmInOrder(form);
          const [asked] = await Promise.all([responseTo(benPage, `/groups/${groupA.id}/excused`, "POST"), form.getByTestId("excuse-send").click()]);
          assert.deepEqual(asked.request().postDataJSON(), {
            sessionKeys: [weekDocId(MOVED_WEEK)],
            reason: WHY.benExcused,
            inPerson: true,
            ownOnline: true,
            otherOnline: true,
          });
          excusedRequestId = (await okBody(asked, "Asking to be excused")).request.id;
          await sheet.waitFor({ state: "detached", timeout: WAIT_MS });
        });
        assertAboutTheAsk(fresh.admin[0], { person: ben, week: MOVED_WEEK, why: WHY.benExcused, requestId: excusedRequestId });
        const stored = (await fixtureDoc("courseRequests", excusedRequestId).get()).data();
        assert.deepEqual([stored?.confirmed?.inPerson, stored?.confirmed?.ownOnline, stored?.confirmed?.otherOnline], [true, true, true], "the request does not keep what he confirmed");

        // The facilitator's register: that he asked, and nothing else.
        const fernPage = await as(fern);
        await fernPage.goto(`${origin}${learnRegisterPath(groupA)}`, { waitUntil: "domcontentloaded" });
        await fernPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
        const list = fernPage.getByTestId("attendance-excuse-list");
        await list.waitFor({ timeout: WAIT_MS });
        const said = await textOf(list);
        assert.ok(said.includes(`Week ${MOVED_WEEK}: `) && said.includes(ben.first) && said.includes(WORDS.waitingFact), `the register does not say Ben asked: ${said}`);
        assert.ok(!(await fernPage.content()).includes(WHY.benExcused), "the register page carries the reason");
        const answer = await fetchAs(fernPage, `/api/courses/groups/${enc(groupA.id)}/attendance`);
        assert.equal(answer.status, 200);
        assert.ok(!answer.text.includes(WHY.benExcused), "what the register is sent carries the reason");
        assert.equal(answer.body.excuseRequests?.[weekDocId(MOVED_WEEK)]?.[ben.uid], "waiting");

        // The lead's Requests page does not list it.
        const pg = await as(gus);
        await pg.goto(`${origin}/admin/admissions/requests`, { waitUntil: "domcontentloaded" });
        await pg.locator("main").getByRole("heading", { level: 1 }).first().waitFor({ timeout: WAIT_MS });
        assert.equal(await pg.getByTestId("requests-excused").count(), 0, "the lead's Requests page lists requests to be excused");
        assert.equal(await pg.locator(`a[href="${requestPath(excusedRequestId)}"]`).count(), 0, "the lead's list leads to Ben's request");
        assert.ok(!(await pg.content()).includes(WHY.benExcused), "the lead's list carries the reason");
      });

      await step("the admin approves it with a reply: the fellow is emailed once and the group's facilitators once each without the reason, and the register's line says excused", async () => {
        const pg = await as("admin");
        const { fresh } = await press("approving Ben's request", eachOf([ben, fern, ivo]), async () => {
          await pg.goto(`${origin}${requestPath(excusedRequestId)}`, { waitUntil: "domcontentloaded" });
          await pg.getByTestId("excused-person").waitFor({ timeout: WAIT_MS });
          assert.equal(await textOf(pg.getByTestId("excused-reason")), `“${WHY.benExcused}”`);
          await pg.getByTestId("excused-reply-text").fill(WHY.benReply);
          const approve = pg.getByTestId("excused-approve");
          assert.equal(await textOf(approve), "Approve and email 3 people", "the button does not say it emails Ben and both facilitators");
          const [approved] = await Promise.all([responseTo(pg, `/requests/${excusedRequestId}/excused/approve`, "POST"), approve.click()]);
          const body = await okBody(approved, "Approving the week");
          assert.deepEqual([body.week?.register, body.emailed], ["written", { person: "sent", facilitators: 2 }]);
        });
        assert.equal(fresh.ben[0].Subject, `You’re excused from week ${MOVED_WEEK}`);
        assert.ok((fresh.ben[0].Text ?? "").includes(WHY.benReply), "Ben's email does not carry the reply");
        for (const [person, [message]] of [
          [ben, fresh.ben],
          [fern, fresh.fern],
          [ivo, fresh.ivo],
        ]) {
          assert.ok(!(message.HTML ?? "").includes(WHY.benExcused) && !(message.Text ?? "").includes(WHY.benExcused), `${person.first}'s email carries the reason`);
        }
        for (const message of [fresh.fern[0], fresh.ivo[0]]) {
          assert.match(message.Subject ?? "", new RegExp(` is excused from week ${MOVED_WEEK}$`));
          assert.ok(!(message.Text ?? "").includes(WHY.benReply), "a facilitator was sent the reply");
        }
        const register = await storedRegister(groupA, MOVED_WEEK);
        assert.deepEqual([register?.records?.[ben.uid], register?.setBy?.[ben.uid]?.how], ["excused", "approval"]);
        const fernPage = await as(fern);
        await fernPage.goto(`${origin}${learnRegisterPath(groupA)}`, { waitUntil: "domcontentloaded" });
        const list = fernPage.getByTestId("attendance-excuse-list");
        await waitFor("the register to say Ben is excused", async () => {
          const said = await textOf(list);
          return said.includes(ben.first) && said.includes(WORDS.excused) && !said.includes(WORDS.waitingFact);
        });
      });

      await step("a fellow marked absent on a finished register asks about that week, confirming nothing about a session past, the admins alone are told, and the admin approves it: absent becomes excused, which the facilitator and the lead read as set by an approved request", async () => {
        const danPage = await as(dan);
        const { fresh: toldOfDan } = await press("Dan asking about week 2", { admin: 1 }, async () => {
          await danPage.goto(learnUrl, { waitUntil: "domcontentloaded" });
          const card = danPage.getByTestId("excuse-last-session");
          await card.waitFor({ timeout: WAIT_MS });
          const said = await textOf(card);
          assert.ok(said.includes(`Last session · week ${TAKEN_WEEK}`) && said.includes("Absent"), `the last session's card: ${said}`);
          // A session already past: none of the three is asked.
          assert.equal(await card.getByTestId("excuse-confirm-in-person").count(), 0, "a tick about a session already past");
          await card.getByTestId("excuse-reason").fill(WHY.danExcused);
          const send = card.getByTestId("excuse-send");
          await waitFor("Send to be live", async () => send.isEnabled());
          const [asked] = await Promise.all([responseTo(danPage, `/groups/${groupA.id}/excused`, "POST"), send.click()]);
          assert.deepEqual(asked.request().postDataJSON(), { sessionKeys: [weekDocId(TAKEN_WEEK)], reason: WHY.danExcused, inPerson: false, ownOnline: false, otherOnline: false });
          pastRequestId = (await okBody(asked, "Asking after the session")).request.id;
        });
        assertAboutTheAsk(toldOfDan.admin[0], { person: dan, week: TAKEN_WEEK, why: WHY.danExcused, requestId: pastRequestId });
        const pg = await as("admin");
        await press("approving Dan's week 2", eachOf([dan, fern, ivo]), async () => {
          await pg.goto(`${origin}${requestPath(pastRequestId)}`, { waitUntil: "domcontentloaded" });
          await pg.getByTestId("excused-person").waitFor({ timeout: WAIT_MS });
          const [approved] = await Promise.all([responseTo(pg, `/requests/${pastRequestId}/excused/approve`, "POST"), pg.getByTestId("excused-approve").click()]);
          const body = await okBody(approved, "Approving the past week");
          assert.deepEqual([body.week?.register, body.emailed], ["corrected", { person: "sent", facilitators: 2 }]);
        });
        const register = await storedRegister(groupA, TAKEN_WEEK);
        assert.deepEqual([register?.records?.[dan.uid], register?.setBy?.[dan.uid]?.how, Boolean(register?.corrected?.[dan.uid])], ["excused", "approval", true]);

        // Who set the line: an approved request, with no name and no time, for the facilitator and the lead; who and when for an admin.
        for (const [reader, path] of [
          [fern, `${learnRegisterPath(groupA)}?session=${weekDocId(TAKEN_WEEK)}`],
          [gus, `${groupPagePath(groupA)}/register?session=${weekDocId(TAKEN_WEEK)}`],
          ["admin", `${groupPagePath(groupA)}/register?session=${weekDocId(TAKEN_WEEK)}`],
        ]) {
          const readerPage = await as(reader);
          await readerPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
          await readerPage.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
          const stamp = await textOf(rowOf(readerPage, dan).getByTestId("attendance-set-by").last());
          if (reader === "admin") assert.match(stamp, /^(Set by you|\S+’s approval), \d{1,2}(:\d{2})?(am|pm)$/, `the admin is not told who approved Dan's line, and when: ${stamp}`);
          else assert.equal(stamp, "Set by an approved request", `${reader.first} is told more than that an approved request set Dan's line`);
        }
      });

      // ======================================================================
      // E. A LIVE WEEK, CHANGED IN PLACE
      // ======================================================================

      const startedWeek3 = [ada, cleo];
      await step("the lead fixes the title of a reading a fellow ticked and then its link, and tells the people who have started the week: the count on the button is the emails caught, none to the lead and none with a meeting link, and the tick stays", async () => {
        const pg = await as(gus);
        const panel = () => pg.getByRole("dialog");
        async function openChange(place, label) {
          await pg.goto(weekEditUrl, { waitUntil: "domcontentloaded" });
          const button = pg.getByRole("button", { name: WORDS.change(place, label), exact: true });
          await button.waitFor({ timeout: WAIT_MS });
          await waitFor(`${place}'s Change to be pressable`, async () => button.isEnabled());
          const [taken] = await Promise.all([responseTo(pg, `${weekApi}/lock`, "POST"), button.click()]);
          await okBody(taken, "Taking the week");
        }
        await press("fixing the reading's title", nobody, async () => {
          await openChange(READING.place, READING.title);
          await panel().getByLabel(WORDS.titleLabel, { exact: true }).fill(READING.newTitle);
          const [saved] = await Promise.all([responseTo(pg, `${weekApi}/blocks/${READING.id}`, "PATCH"), panel().getByRole("button", { name: WORDS.save, exact: true }).click()]);
          assert.equal((await okBody(saved, "Saving the title")).saved, true);
          const dialog = pg.getByRole("dialog");
          await dialog.getByRole("heading", { name: WORDS.tellTitle, exact: true }).waitFor({ timeout: WAIT_MS });
          await dialog.getByRole("button", { name: WORDS.nobody, exact: true }).click();
          await waitFor("the tell dialog to close", async () => (await pg.getByRole("dialog").count()) === 0);
        });
        const { fresh } = await press("the new link, told to the people who have started the week", eachOf(startedWeek3), async () => {
          await openChange(READING.place, READING.newTitle);
          await panel().getByLabel(WORDS.linkLabel, { exact: true }).fill(READING.newUrl);
          const [saved] = await Promise.all([responseTo(pg, `${weekApi}/blocks/${READING.id}`, "PATCH"), panel().getByRole("button", { name: WORDS.save, exact: true }).click()]);
          assert.equal((await okBody(saved, "Saving the link")).saved, true);
          const dialog = pg.getByRole("dialog");
          await dialog.getByRole("heading", { name: WORDS.tellTitle, exact: true }).waitFor({ timeout: WAIT_MS });
          await dialog.getByRole("radio", { name: WORDS.started(startedWeek3.length) }).check();
          const send = dialog.getByRole("button", { name: WORDS.sendTo(startedWeek3.length), exact: true });
          await send.waitFor({ timeout: WAIT_MS });
          const [told] = await Promise.all([responseTo(pg, `${weekApi}/tell`, "POST"), send.click()]);
          const body = await okBody(told, "Telling the people who have started the week");
          assert.deepEqual([body.told?.count, body.told?.sent], [startedWeek3.length, startedWeek3.length]);
          await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
          await waitFor("the tell dialog to close", async () => (await pg.getByRole("dialog").count()) === 0);
        });
        for (const person of startedWeek3) assert.equal(fresh[person.key][0].Subject, WORDS.linkSubject, `${person.first}'s notice`);

        // Ada still sees her tick, under the new title.
        const adaPage = await as(ada);
        await adaPage.goto(weekPageUrl(EDITED_WEEK), { waitUntil: "domcontentloaded" });
        const tick = adaPage.getByRole("checkbox", { name: WORDS.doneItem(READING.newTitle), exact: true });
        await tick.waitFor({ state: "attached", timeout: WAIT_MS });
        assert.equal(await tick.isChecked(), true, "Ada's tick did not stay with the reading");
      });

      await step("the lead rewords a question a fellow answered: the fellow reads their answer under the wording they answered, and the facilitator reads the question as it was when the answer was written", async () => {
        const pg = await as(gus);
        await press("rewording the question", nobody, async () => {
          await pg.goto(weekEditUrl, { waitUntil: "domcontentloaded" });
          const button = pg.getByRole("button", { name: WORDS.change(REFLECTION.place, REFLECTION.label), exact: true });
          await button.waitFor({ timeout: WAIT_MS });
          await waitFor("the reflection's Change to be pressable", async () => button.isEnabled());
          await Promise.all([responseTo(pg, `${weekApi}/lock`, "POST"), button.click()]);
          const prompt = pg.getByRole("dialog").getByLabel(WORDS.firstPrompt, { exact: true });
          await prompt.waitFor({ timeout: WAIT_MS });
          await prompt.fill(REFLECTION.newPrompt);
          const [saved] = await Promise.all([responseTo(pg, `${weekApi}/blocks/${REFLECTION.id}`, "PATCH"), pg.getByRole("dialog").getByRole("button", { name: WORDS.save, exact: true }).click()]);
          assert.equal((await okBody(saved, "Rewording the reflection")).saved, true);
          const dialog = pg.getByRole("dialog");
          await dialog.getByRole("heading", { name: WORDS.tellTitle, exact: true }).waitFor({ timeout: WAIT_MS });
          await dialog.getByRole("button", { name: WORDS.nobody, exact: true }).click();
          await waitFor("the tell dialog to close", async () => (await pg.getByRole("dialog").count()) === 0);
        });
        const adaPage = await as(ada);
        await adaPage.goto(weekPageUrl(EDITED_WEEK), { waitUntil: "domcontentloaded" });
        const box = adaPage.getByRole("textbox", { name: REFLECTION.newPrompt, exact: true });
        await box.waitFor({ timeout: WAIT_MS });
        await waitFor("Ada's reflection to load into its box", async () => (await box.inputValue()) === WRITES.ada.rp1);
        const own = adaPage.getByText(WORDS.ownEarlier, { exact: true });
        await own.waitFor({ timeout: WAIT_MS });
        assert.equal(await wordsIn(own.locator("xpath=..")), `${WORDS.ownEarlier} ${REFLECTION.label}`);

        const fernPage = await as(fern);
        await fernPage.goto(`${origin}${learnGroupPath(groupA)}/reflections/names?week=${EDITED_WEEK}`, { waitUntil: "domcontentloaded" });
        const answer = fernPage.locator("li").filter({ hasText: WRITES.ada.rp1 });
        await answer.first().waitFor({ timeout: WAIT_MS });
        const said = await wordsIn(answer.first());
        assert.ok(said.includes(`${WORDS.staffEarlier} ${REFLECTION.label}`), `the facilitator does not read the question when it was written: ${said}`);
      });

      await step("the lead restores the week's first version from its history, and every tick and answer is still there", async () => {
        const pg = await as(gus);
        await press("restoring the first version", nobody, async () => {
          await pg.goto(weekEditUrl, { waitUntil: "domcontentloaded" });
          await pg.getByRole("link", { name: WORDS.history, exact: true }).click();
          await pg.waitForURL((url) => url.pathname.endsWith(`/weeks/${EDITED_WEEK_ID}/history`), { timeout: WAIT_MS });
          const rows = pg.locator("li[data-save-id]");
          await rows.first().waitFor({ timeout: WAIT_MS });
          assert.equal(await rows.count(), 4, "the history does not list the week as found and three saves");
          const first = rows.nth(3);
          const firstId = await first.getAttribute("data-save-id");
          await Promise.all([responseTo(pg, `${weekApi}/history/${firstId}`, "GET"), first.getByRole("checkbox").check()]);
          const when = flat((await first.locator("span").nth(0).textContent()) ?? "");
          const [restored] = await Promise.all([
            responseTo(pg, `${weekApi}/history/${firstId}/restore`, "POST"),
            pg.getByRole("button", { name: WORDS.restore(when.split(",")[0]), exact: true }).click(),
          ]);
          assert.equal((await okBody(restored, "Restoring the first version")).saved, true);
          await waitFor("the history to list the restore", async () => (await rows.count()) === 5);
        });
        const stored = (await fixtureSubcollection("courseRuns", state.runId, "weeks").doc(EDITED_WEEK_ID).get()).data();
        const reading = stored.blocks.flatMap((block) => [block, ...(block.blocks ?? [])]).find((block) => block.id === READING.id);
        assert.deepEqual([reading?.title, reading?.url], [READING.title, `https://example.com/e2e-diary-${EDITED_WEEK}`], "the restore did not bring the reading back");

        // Every tick and answer on the week is still there.
        const adaPage = await as(ada);
        await adaPage.goto(weekPageUrl(EDITED_WEEK), { waitUntil: "domcontentloaded" });
        for (const key of ["s1", "s2"]) {
          const tick = adaPage.getByRole("checkbox", { name: WORDS.doneItem(COURSEWORK_SOURCES[key]), exact: true });
          await tick.waitFor({ state: "attached", timeout: WAIT_MS });
          assert.equal(await tick.isChecked(), true, `Ada's tick on ${COURSEWORK_SOURCES[key]} is gone`);
        }
        for (const key of ["rp1", "rp2", "rp3"]) {
          const box = adaPage.getByLabel(COURSEWORK_PROMPTS[key], { exact: true });
          await waitFor(`Ada's ${key} to be in its box`, async () => (await box.inputValue()) === WRITES.ada[key]);
        }
        const cleoRow = (await fixtureDoc("courseExerciseResponses", `${state.runId}__${cleo.uid}__${EDITED_WEEK_ID}__${courseworkItemId(EDITED_WEEK, "rp1")}`).get()).data();
        assert.equal(cleoRow?.text, SEEDED_WORK_WORDS.rp1, "Cleo's reflection is gone");
        const answer = (await fixtureDoc("courseExerciseResponses", `${state.runId}__${ada.uid}__${EDITED_WEEK_ID}__${courseworkItemId(EDITED_WEEK, "wa")}`).get()).data();
        assert.ok(answer?.firstSentAt && answer.text === WRITES.ada.answer, "Ada's answer is not as she sent it");
      });

      // ======================================================================
      // F. THE BOOKS BALANCE
      // ======================================================================

      /**
       * THE ATTENDANCE THE STORY MADE, worked out from its presses. A
       * register's line per person and week; `finished` says the register
       * was finished, so the line counts.
       */
      const ATTENDANCE = {
        A: {
          1: { finished: true, lines: { ada: ["present", false], ben: ["present", false], dan: ["late", false], ivo: ["present", false] } },
          2: { finished: true, lines: { ada: ["present", false], ben: ["late", false], dan: ["excused", false], ivo: ["present", true] } },
          3: { finished: false, lines: { ben: ["excused", false] } },
          5: { finished: false, lines: { ada: ["excused", false] } },
        },
        B: {
          1: { finished: false, cancelled: true, lines: {} },
          2: { finished: true, lines: { cleo: ["left-early", false] } },
        },
      };
      const groupKeyOf = (person) => (person === cleo ? "B" : "A");
      const dateOf = (person, week) => (groupKeyOf(person) === "A" ? sessionA(week).dateKey : original(groupB, week).dateKey);
      /** A person's finished line in a week, or null. */
      const finishedLine = (person, week) => {
        const register = ATTENDANCE[groupKeyOf(person)][week];
        if (!register?.finished) return null;
        const line = register.lines[person.key];
        return line ? { mark: line[0], online: line[1] } : null;
      };
      /** The sessions that count for a person (held and finished, from the week they joined) and how many they came to. */
      function tally(person) {
        let of = 0;
        let came = 0;
        for (let week = 1; week <= state.weekCount; week += 1) {
          if (person === eve && week < 3) continue;
          const line = finishedLine(person, week);
          if (!line) continue;
          of += 1;
          if (CAME.has(line.mark)) came += 1;
        }
        return { came, of };
      }

      await step("every fellow's attendance reads the same on their own page, the facilitator's register, the group's page, the Attendance tab and the Overview", async () => {
        const problems = [];
        const expectEqual = (said, want, where) => {
          if (said !== want) problems.push(`${where}: says ${JSON.stringify(said)}, the story says ${JSON.stringify(want)}`);
        };

        // 1. Each fellow's own programme page.
        for (const person of fellows) {
          const pg = await as(person);
          await pg.goto(learnUrl, { waitUntil: "domcontentloaded" });
          const marks = pg.locator('section[aria-labelledby="your-marks"]').getByRole("img");
          await marks.first().waitFor({ timeout: WAIT_MS });
          const said = [];
          for (let i = 0; i < (await marks.count()); i += 1) said.push((await marks.nth(i).getAttribute("aria-label")) ?? "");
          for (let week = person === eve ? 3 : 1; week <= state.weekCount; week += 1) {
            const line = finishedLine(person, week);
            const register = ATTENDANCE[groupKeyOf(person)][week];
            const word = register?.cancelled ? "Cancelled" : line ? (line.online ? `${MARK_LABEL[line.mark]}, online` : MARK_LABEL[line.mark]) : "Not yet";
            const found = said.find((each) => each.startsWith(`Week ${week}, `)) ?? null;
            const want = `Week ${week}, ${dayLabel(dateOf(person, week))}: ${word}`;
            expectEqual(found?.split(" Corrected on")[0]?.replace(/ corrected on .*$/, "") ?? null, want, `${person.first}'s own page, week ${week}`);
          }
        }

        // 2. The facilitators' registers: the cells and what the page is sent.
        for (const [group, facilitator, people] of [
          [groupA, fern, [ada, ben, dan, eve, ivo]],
          [groupB, hal, [cleo]],
        ]) {
          const pg = await as(facilitator);
          await pg.goto(`${origin}${learnRegisterPath(group)}`, { waitUntil: "domcontentloaded" });
          await pg.getByTestId("attendance-grid").waitFor({ timeout: WAIT_MS });
          for (const person of people) {
            // Each cell by the week its own label names: a session that did not happen has no cell to tap.
            const labels = [];
            const cells = rowOf(pg, person).getByTestId("attendance-cell");
            for (let i = 0; i < (await cells.count()); i += 1) labels.push((await cells.nth(i).getAttribute("aria-label")) ?? "");
            // The register draws the sessions that have met, weeks 1 and 2.
            for (const week of [1, 2]) {
              if (person === eve) continue;
              const register = ATTENDANCE[group.key][week];
              const label = labels.find((each) => each.includes(`, week ${week}: `)) ?? null;
              if (register?.cancelled) {
                expectEqual(label === null || !/: (Present|Late|Left early|Absent|Excused)\./.test(label), true, `${facilitator.first}'s register, ${person.first} week ${week} did not happen (${label})`);
                continue;
              }
              const mark = register?.lines?.[person.key]?.[0] ?? null;
              const word = mark ? MARK_LABEL[mark] : "not marked";
              // Named as the facilitator is shown names: the name the person goes by, or their whole name.
              expectEqual(Boolean(label?.startsWith(person.first) && label.includes(`, week ${week}: ${word}.`)), true, `${facilitator.first}'s register, ${person.first} week ${week} (${label})`);
              if (register?.lines?.[person.key]?.[1]) expectEqual(label?.includes("Joined online.") ?? false, true, `${facilitator.first}'s register, ${person.first} week ${week} online`);
            }
          }
        }

        // 3. The programme's group pages, across all weeks.
        const adminPg = await as("admin");
        for (const [group, people] of [
          [groupA, [ada, ben, dan, eve]],
          [groupB, [cleo]],
        ]) {
          await adminPg.goto(`${origin}${groupPagePath(group)}`, { waitUntil: "domcontentloaded" });
          await adminPg.getByRole("tab", { name: WORDS.attendanceTab, exact: true }).click();
          const table = adminPg.getByTestId("group-attendance");
          await table.waitFor({ timeout: WAIT_MS });
          for (const person of people) {
            const row = table.getByRole("row").filter({ hasText: person.first }).first();
            const cells = row.getByTestId("group-attendance-cell");
            for (const week of [1, 2]) {
              const line = finishedLine(person, week);
              const register = ATTENDANCE[group.key][week];
              const want = register?.cancelled ? "Didn’t happen" : person === eve ? "Not in the group yet" : line ? lineWords(line.mark, line.online) : "Not taken yet";
              const said = (await textOf(cells.nth(week - 1))).replace(/Corrected$/, "").trim();
              // A session called off says so in either of the page's two words for it.
              expectEqual(register?.cancelled && said === "No session" ? want : said, want, `the group's page, ${person.first} week ${week}`);
            }
            const counts = await row.locator("td").allTextContents();
            const room = [1, 2].filter((week) => {
              const line = finishedLine(person, week);
              return line && CAME.has(line.mark) && !line.online;
            }).length;
            const online = [1, 2].filter((week) => finishedLine(person, week)?.online).length;
            expectEqual(counts.slice(-2).map(flat).join(" | "), `${room} | ${online}`, `the group's page, ${person.first}'s two counts`);
          }
          if (group === groupA) {
            const facilitators = await textOf(adminPg.locator('section[aria-labelledby="group-attendance-facilitators"]'));
            expectEqual(facilitators.includes(ivo.first) && facilitators.includes("Their place: Online"), true, `the group's page, Ivo with the facilitators and his place (${facilitators.slice(0, 300)})`);
          }
        }

        // 4. The programme's Attendance tab: every mark and Came.
        await adminPg.goto(`${formBase}/attendance`, { waitUntil: "domcontentloaded" });
        const grid = adminPg.getByRole("region", { name: "Attendance grid" });
        await grid.waitFor({ timeout: WAIT_MS });
        // A group's rows past its first few are behind "+2 more": everybody, shown.
        for (const group of [groupA, groupB]) {
          const more = grid.getByRole("button", { name: new RegExp(`^Show \\d+ more in ${escapeRegExp(group.name)}$`) });
          if ((await more.count()) > 0) await more.click();
        }
        for (const person of [...fellows, ivo]) {
          const row = grid.getByRole("row").filter({ has: adminPg.getByRole("rowheader", { name: new RegExp(`^${escapeRegExp(person.displayName)}(?![A-Za-z0-9])`) }) });
          const shown = await row.waitFor({ timeout: 15_000 }).then(() => true, () => false);
          if (!shown) {
            problems.push(`the Attendance tab has no row for ${person.first}`);
            continue;
          }
          const marks = row.getByRole("img");
          const said = [];
          for (let i = 0; i < (await marks.count()); i += 1) said.push((await marks.nth(i).getAttribute("aria-label")) ?? "");
          for (const week of [1, 2]) {
            if (person === eve) continue;
            const line = finishedLine(person, week);
            const found = said.find((each) => each.startsWith(`${person.displayName}, week ${week}:`)) ?? null;
            const want = line ? `${person.displayName}, week ${week}: ${MARK_LABEL[line.mark]}` : null;
            if (want) expectEqual(found?.startsWith(want) ?? false, true, `the Attendance tab, ${person.first} week ${week} (${found})`);
            else expectEqual(found === null || !/: (Present|Late|Left early|Absent|Excused)$/.test(found), true, `the Attendance tab, ${person.first} week ${week} (${found})`);
          }
          // Came, and under it where the sessions they came to were, once any was online.
          const { came, of } = tally(person);
          const online = [1, 2].filter((week) => finishedLine(person, week)?.online).length;
          const room = [1, 2].filter((week) => finishedLine(person, week) && CAME.has(finishedLine(person, week).mark) && !finishedLine(person, week).online).length;
          const wantCame = of > 0 ? `${came} of ${of}${online > 0 ? `${room} in the room, ${online} online` : ""}` : "·";
          expectEqual(await textOf(row.locator("td").last()), wantCame, `the Attendance tab, ${person.first}'s Came`);
        }

        // 5. The Overview: who came, by week, from the same lines.
        await adminPg.goto(`${formBase}/overview`, { waitUntil: "domcontentloaded" });
        const byWeek = adminPg.getByRole("region", { name: "Attendance by week", exact: true });
        await byWeek.waitFor({ timeout: WAIT_MS });
        const description = (await byWeek.getByRole("img").first().getAttribute("aria-label")) ?? "";
        for (const week of [1, 2]) {
          let came = 0;
          let of = 0;
          for (const person of [...fellows, ivo]) {
            const line = finishedLine(person, week);
            if (!line) continue;
            of += 1;
            if (CAME.has(line.mark)) came += 1;
          }
          const percent = Math.round((100 * came) / of);
          expectEqual(description.includes(`week ${week} ${percent}%`), true, `the Overview, week ${week} at ${percent}% (${description})`);
        }

        assert.deepEqual(problems, [], `the pages do not agree with the story:\n${problems.join("\n")}`);
      });

      await step("every week's work reads the same on the fellow's own week page, the group's week card, the page of the week's work, the Coursework tab and one person's page", async () => {
        const problems = [];
        const expectEqual = (said, want, where) => {
          if (said !== want) problems.push(`${where}: says ${JSON.stringify(said)}, the story says ${JSON.stringify(want)}`);
        };
        // The story's work: seeded on time for Ada's week 1 and Dan's week 2.
        work.set(workKey(ada, 1), { on: "time" });
        work.set(workKey(dan, 2), { on: "time" });
        const stateOf = (person, week) => {
          const did = work.get(workKey(person, week));
          if (did) return did.on === "late" ? "late" : "on time";
          if (person === eve && week < 3) return "joined late";
          return "not done";
        };
        /** What a staff page says first of a week: "Done on time" or "Done late" once the session has passed, "Done" before it. */
        const staffWord = (person, week) => {
          const said = stateOf(person, week);
          if (said === "late") return WORDS.doneLate;
          if (said === "on time") return week === ON_TIME_WEEK ? null : WORDS.doneOnTime;
          if (said === "joined late") return WORDS.joinedLate;
          return null;
        };

        // 1. The group's week card, on the facilitator's page, week by week:
        // its count and the bar's own counts; This week's work under it, on the
        // week the group is getting ready for; and Feedback to write, which
        // says of each answer whether it came late, and how late.
        const BUCKET = { "on time": WORDS.doneOnTime, late: WORDS.doneLate, "joined late": WORDS.joinedLate, "not done": "Not started" };
        const sorted = (object) => JSON.stringify(Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b))));
        const fernPage = await as(fern);
        for (const week of [1, 2, 3]) {
          const card = await weekCardOf(fernPage, week);
          const done = fellowsA.filter((person) => ["on time", "late"].includes(stateOf(person, week))).length;
          expectEqual(card.heading, WORDS.haveDone(done, fellowsA.length, week), `the group's week card, week ${week}`);
          const want = {};
          for (const person of fellowsA) want[BUCKET[stateOf(person, week)]] = (want[BUCKET[stateOf(person, week)]] ?? 0) + 1;
          expectEqual(sorted(card.buckets), sorted(want), `the group's week card, week ${week}'s bar (${card.said})`);
          expectEqual(card.said.includes(ivo.first), false, `the group's week card, week ${week}, names Ivo`);
        }
        const table = fernPage.getByRole("region", { name: "This week’s work" }).first();
        await table.waitFor({ timeout: WAIT_MS });
        for (const person of fellowsA) {
          const row = await textOf(table.getByRole("row").filter({ hasText: person.first }).first()).catch(() => "");
          const said = stateOf(person, ON_TIME_WEEK);
          expectEqual(row.includes(said === "on time" ? WORDS.doneOnTime : "Not started"), true, `This week's work, ${person.first}'s week ${ON_TIME_WEEK} (${row})`);
        }
        expectEqual(await table.getByRole("row").filter({ hasText: ivo.first }).count(), 0, "This week's work has a row for Ivo");
        const queue = await reviewQueueOf(fernPage);
        for (const [person, week] of [
          [ben, LATE_WEEK],
          [dan, LATE_WEEK],
        ]) {
          const sentAt = await firstSentOf(person, week);
          const line = queueLineOf(queue, person, sentAt);
          const late = sentAt.getTime() - original(groupA, week).startsAt.getTime();
          const want = stateOf(person, week) === "late" ? `Late: ${lateWords(late)} after the session` : null;
          expectEqual(line === null ? "no line" : want ? line.includes(want) : !line.includes("Late:"), true, `Feedback to write, ${person.first}'s week ${week} answer (${line})`);
        }
        expectEqual(queue.some((line) => line.includes(ivo.first)), false, "Feedback to write lists Ivo's own answer");

        // 2. The page of the week's work, the lead's: the week the group is getting ready for.
        const pg = await as(gus);
        await pg.goto(`${formBase}/week?group=${enc(groupA.id)}`, { waitUntil: "domcontentloaded" });
        const lead = pg.getByRole("region", { name: "This week’s work" }).first();
        await lead.waitFor({ timeout: WAIT_MS });
        const adaRow = await textOf(lead.getByRole("row").filter({ hasText: ada.first }).first());
        expectEqual(adaRow.includes(WORDS.doneOnTime) || adaRow.includes(WORDS.done), true, `the page of the week's work, Ada's week 3 (${adaRow})`);
        for (const person of [ben, dan, eve]) {
          const row = await textOf(lead.getByRole("row").filter({ hasText: person.first }).first());
          expectEqual(row.includes(WORDS.done), false, `the page of the week's work, ${person.first}'s week 3 (${row})`);
        }

        // 3. The Coursework tab, every fellow and every week; 4. one person's page.
        await pg.goto(`${formBase}/coursework`, { waitUntil: "domcontentloaded" });
        await pg.getByRole("link", { name: `Week 1, done: ${ada.displayName}’s coursework`, exact: true }).waitFor({ timeout: WAIT_MS });
        for (const person of [...fellows, ivo]) {
          for (const week of [1, 2, 3]) {
            const said = stateOf(person, week);
            const doneOrNot = said === "on time" || said === "late" ? "done" : "not done";
            const cell = pg.getByRole("link", { name: `Week ${week}, ${doneOrNot}: ${person.displayName}’s coursework`, exact: true });
            if ((await cell.count()) === 0) {
              problems.push(`the Coursework tab, ${person.first} week ${week}: no cell reads ${doneOrNot}`);
              continue;
            }
            const words = await textOf(cell);
            const word = staffWord(person, week) ?? (doneOrNot === "done" ? WORDS.done : said === "joined late" ? WORDS.joinedLate : "Not done");
            expectEqual(words.startsWith(word), true, `the Coursework tab, ${person.first} week ${week} (${words})`);
          }
        }
        for (const person of [ben, ada]) {
          await pg.goto(`${formBase}/coursework/${enc(person.uid)}`, { waitUntil: "domcontentloaded" });
          const page = await textOf(pg.locator("main"));
          const week = person === ben ? LATE_WEEK : ON_TIME_WEEK;
          const did = work.get(workKey(person, week));
          expectEqual(page.includes(WRITES[person.key].rp2), true, `${person.first}'s page has their week ${week} reflection`);
          if (did?.on === "late") expectEqual(page.includes(`Late: ${lateWords(did.lateMs)} after the session`), true, `${person.first}'s page says how late week ${week} was`);
        }

        // 5. Each fellow's own week page: done of the week's tasks, and late in their own words.
        for (const [person, week] of [
          [ben, LATE_WEEK],
          [ada, ON_TIME_WEEK],
          [dan, REMIND_WEEK],
        ]) {
          const own = await as(person);
          await own.goto(weekPageUrl(week), { waitUntil: "domcontentloaded" });
          await own.getByRole("region", { name: WORDS.writtenAnswer, exact: true }).waitFor({ timeout: WAIT_MS });
          // The count is worked out once the page has read the person's work: give it the time it takes.
          const counted = await waitFor(`${person.first}'s own week ${week} to count what is done`, async () => {
            const said = await textOf(own.locator("main"));
            return said.includes("3 of 3 done") ? said : null;
          }, { timeout: 20_000 }).catch(() => null);
          const page = counted ?? (await textOf(own.locator("main")));
          expectEqual(/\d of 3 done/.exec(page)?.[0] ?? null, "3 of 3 done", `${person.first}'s own week ${week} page, what is done`);
          const did = work.get(workKey(person, week));
          if (did?.on === "late") expectEqual(page.includes("after your session"), true, `${person.first}'s own week ${week} page says it was after the session`);
          else expectEqual(page.includes("after your session"), false, `${person.first}'s own week ${week} page says it was late`);
        }

        assert.deepEqual(problems, [], `the pages do not agree with the story:\n${problems.join("\n")}`);
      });

      await step("the group's history lists every change of the time, the register and being excused in the order made, with who and when and no reason for being excused, and the week's history lists every save", async () => {
        const rows = (await auditRows()).sort((a, b) => (a.at?.toMillis?.() ?? 0) - (b.at?.toMillis?.() ?? 0));
        const ofA = rows.filter((row) => row.groupId === groupA.id).map((row) => row.kind);
        const ofB = rows.filter((row) => row.groupId === groupB.id).map((row) => row.kind);
        const order = (list, kinds, where) => {
          let from = 0;
          for (const kind of kinds) {
            const at = list.indexOf(kind, from);
            assert.ok(at >= 0, `${where}'s history has no ${kind} after the ones before it: ${JSON.stringify(list)}`);
            from = at + 1;
          }
        };
        order(ofA, ["session-moved", "group-time-changed", "register-covered", "attendance-edit"], "Group A");
        order(ofB, ["register-given"], "Group B");
        for (const row of rows) {
          for (const reason of [WHY.benExcused, WHY.danExcused]) assert.ok(!JSON.stringify(row).includes(reason), `a history row carries the reason for being excused: ${row.kind}`);
        }
        const pg = await as(gus);
        for (const group of [groupA, groupB]) {
          await pg.goto(`${origin}${groupPagePath(group)}`, { waitUntil: "domcontentloaded" });
          await pg.getByRole("tab", { name: "History", exact: true }).click();
          const list = pg.getByRole("region", { name: "Who changed what" }).getByRole("listitem");
          await list.first().waitFor({ timeout: WAIT_MS });
          const said = [];
          for (let i = 0; i < (await list.count()); i += 1) said.push(await wordsIn(list.nth(i)));
          const page = said.join("\n");
          for (const reason of [WHY.benExcused, WHY.danExcused]) assert.ok(!page.includes(reason), `${group.name}'s history carries a reason for being excused`);
          if (group === groupA) {
            const at = (pattern) => said.findIndex((line) => pattern.test(line));
            const moved = at(new RegExp(`Moved week ${MOVED_WEEK} to ${escapeRegExp(dayLabel(movedDateKey))}`));
            const regular = at(/Changed the regular time to /);
            const took = at(new RegExp(`Took week ${TAKEN_WEEK}’s register in `));
            const corrected = at(new RegExp(`Corrected week ${TAKEN_WEEK}’s register: [^.]*${escapeRegExp(ada.first)}`));
            const excusedDan = at(new RegExp(`approved [^.]*${escapeRegExp(dan.first)}[^.]*’s request to be excused for week ${TAKEN_WEEK}`));
            for (const [name, index] of Object.entries({ moved, regular, took, corrected, excusedDan })) assert.ok(index >= 0, `Group A's history has no ${name} row:\n${page}`);
            // Newest first.
            assert.ok(excusedDan < corrected && corrected < took && took < regular && regular < moved, `Group A's history is not in the order the changes were made:\n${page}`);
            for (const [line, who] of [
              [said[moved], fern],
              [said[regular], gus],
              [said[took], gus],
              [said[corrected], gus],
              [said[excusedDan], null],
            ]) {
              if (who) assert.ok(line.includes(who.first), `"${line}" does not say who`);
              assert.match(line, /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{1,2}(:\d{2})?(am|pm) \S/, `"${line}" does not say when, then who`);
            }
          } else {
            const at = (pattern) => said.findIndex((line) => pattern.test(line));
            const given = at(new RegExp(`Gave week ${GIVEN_WEEK}’s session to [^.]*${escapeRegExp(kit.first)}`));
            const notHeld = at(new RegExp(`week ${NOT_HELD_WEEK}`, "i"));
            assert.ok(given >= 0 && notHeld >= 0 && notHeld < given, `Group B's history does not list the session given and then week 1 that didn't happen, newest first:\n${page}`);
            for (const index of [given, notHeld]) assert.match(said[index], /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{1,2}(:\d{2})?(am|pm) \S/, `"${said[index]}" does not say when, then who`);
          }
        }
        const saves = (await fixtureWeekSubcollection(state.runId, EDITED_WEEK_ID, "history").get()).docs.map((doc) => doc.data()).sort((a, b) => a.seq - b.seq);
        assert.deepEqual(saves.map((save) => save.kind), ["found", "edit", "edit", "edit", "restore"], "the week's history is not every save");
        assert.deepEqual([saves[2].told?.audience, saves[2].told?.count], ["started", startedWeek3.length], "the week's history does not say who was told");
      });

      await step("every person's mail adds up to what each step sent, no email holds a meeting link or a reason for being excused, and nobody outside the term got anything but the admins' word of each ask", async () => {
        const totals = await mailCounts();
        const sinceStart = Object.fromEntries(mailboxes.map((account) => [account.key, totals[account.key] - mailAtStart[account.key]]));
        assert.deepEqual(sinceStart, ledger, `the mail caught is not what the steps sent: ${JSON.stringify(caught)}`);
        // Every send about the term, by the run and its groups: to the term's
        // own addresses, or the admins' word of a request (`course-request`),
        // which goes to every admin and to nobody else.
        const ours = new Set(everybody.map((account) => account.email.toLowerCase()));
        const about = [];
        for (const id of [state.runId, groupA.id, groupB.id]) {
          for (const doc of (await fixtureQuery("emailSends").where("referenceId", "==", id).get()).docs) about.push(doc.data());
        }
        const outside = new Set();
        for (const row of about) {
          const to = String(row.to ?? "").toLowerCase();
          if (ours.has(to)) continue;
          assert.equal(row.kind, "course-request", `a send about the term went to an address outside it (${row.kind ?? "?"})`);
          outside.add(to);
        }
        assert.ok(outside.has(admin.email.toLowerCase()), "the admins' word of an ask is not in the send log for the harness's admin");
        // Every email the run caught, the other admins' among them: no meeting
        // link, and never the reason anybody gave for being excused.
        const addresses = [...mailboxes.map((account) => account.email), ...[...outside]];
        for (const address of new Set(addresses.map((each) => each.toLowerCase()))) {
          for (const summary of await messagesTo(address)) {
            const message = await getMessage(summary.ID);
            assertNoMeetingLink(message, address, summary.Subject ?? "an email");
            for (const reason of [WHY.benExcused, WHY.danExcused]) {
              assert.ok(!(message.HTML ?? "").includes(reason) && !(message.Text ?? "").includes(reason), `an email to ${address} (${summary.Subject}) carries a reason for being excused`);
            }
          }
        }
        assert.equal(WHOLE_TERM_STEPS.length, SPEC.steps.length);
      });
    } finally {
      await Promise.all([adminContext, ...[...pages.values()].map((open) => open.context)].map((context) => context.close().catch(() => {})));
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
