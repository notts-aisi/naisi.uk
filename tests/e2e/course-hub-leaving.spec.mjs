/**
 * Leaving the programme, by both doors, end to end in a real browser: the
 * course hub's fifth spec.
 *
 * Two terms of the world (scripts/e2e-fixtures/worlds/course-hub-term.mjs):
 * the fellowship in week 4, every register so far finished ("week-four"), and
 * a second fellowship past its last session ("after-the-end").
 *
 * -> the admin approves everybody who signs in -> Dan opens the application
 * page while the programme names no run yet, and it offers "I can’t make it"
 * -> the admin names the running run and hands its people over -> appoints
 * Fern to Group A -> Ben's programme page and Home show Group A and its link
 * -> Ben reads what leaving means, is refused a title typed wrong, and leaves
 * with it typed right and a reason -> Ben reads the page that says they
 * left and when, and nothing else, at the notes and reading list addresses
 * too -> Ben's programme page and Home show the group no more, and My
 * programmes has a card that says only that Ben left -> Dan, pointed to the
 * programme's page by a fresh look at the application, gives the place back
 * with "I can’t make it" on the page opened before, with a reason, and it
 * says Dan left and when -> the leave's email reaches each, word for word,
 * with no reason and no link -> Fern's Home says who left, the group page
 * lists both last as left, with the day, and the register shows them read
 * only with their marks -> the lead's Overview quotes each reason, and the
 * Applications tab gives neither -> the Settings tab counts the places given
 * back (what it says about the two who left is pinned, with its fix) -> the
 * Attendance grid and its CSV say each left and when -> the allocation board
 * counts both as left and offers no Remove for them, Remove itself refuses
 * them with the day, and Publish owes them nothing -> neither can read the
 * group any more -> on the run past its end, neither door offers leaving,
 * and a press is refused in leaving's words.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-leaving
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: the leave's email is
 * read word for word out of each leaver's mailbox.
 *
 * ## Every expected word comes from the seed's clock and the world's plan
 *
 * Dates, times, counts and names are worked out here from the state file and
 * the world's constants (`WEEK_FOUR`, `WEEK_ONE_READING`), by the rules of
 * the screens restated beside each check, never written as a calendar date.
 * The day somebody left is the day the leave stored, read back from their
 * place, so a run that crosses midnight still says the right day. The words a
 * target's settings decide (whether a register is "finished" or "pushed",
 * and whether Course settings name a feedback link for the leave's email)
 * are read from the register's own GET and from the leave's own answer.
 *
 * ## Six identities, five browser contexts
 *
 * The admin (the programme's lead here), Ben and Dan (who leave Group A),
 * Fern (Group A's facilitator), and Ivy (on the run past its end), each in
 * their own context; Dan's has two pages, a phone with the application open
 * from before the run was named and a laptop that opens it fresh. Ada (who
 * stays in Group A) and Cleo (Group B) never sign in. CHROMIUM ONLY: a green
 * run is a regression net, never a substitute for the manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import { getMessage, hrefUrls, messagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  enrolmentId,
  fixtureDoc,
  fixtureQuery,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
  subscriptionId,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-leaving.mjs";
import {
  WEEK_FOUR,
  WEEK_ONE_READING,
  compareGroupsByMeeting,
  dayLabel,
  londonDateKey,
  namesInWords,
  sessionOf,
  sessionWhenLabel,
  slotLine,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** The society's address, as every page and email writes it. */
const SOCIETY = "ai-safety@uonsu.com";

/** Every email's last line (`EmailChrome`). */
const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";

/**
 * What each leaver says when they leave: words a person might type, and words
 * nothing else on the site says, so "readable where the lead reads it and
 * nowhere else" can be held page by page and email by email. Ben types one in
 * the confirmation's box; Dan chooses "Other" on the application page and
 * writes one there.
 */
const BEN_SAID = "My placement started early, so my evenings are gone.";
const DAN_SAID = "The lab moved my shifts to Thursday evenings.";

/** Present, late and left early count as came, as the boards say. */
const CAME = new Set(["present", "late", "left-early"]);

/** A mark's word, as the register, the grid and the CSV say it (`ATTENDANCE_STATUS_LABEL`). */
const MARK_WORD = Object.freeze({
  present: "Present",
  late: "Late",
  "left-early": "Left early",
  excused: "Excused",
  absent: "Absent",
});

/** A mark's letter in a box (`MARK_LETTER`, src/lib/courses/memberPageWords.ts). */
const MARK_LETTER = Object.freeze({ present: "P", late: "L", "left-early": "LE", excused: "E", absent: "A" });

/**
 * THE WORDS OF LEAVING, restated from src/lib/courses/leavingWords.ts: the
 * link at the programme page's foot, the confirmation, and the page somebody
 * reads once they have left. `name` is the programme's short name; the course
 * title is what is typed.
 */
const LEAVING = Object.freeze({
  link: "Leave the programme",
  heading: (name) => `Leave ${name}?`,
  lines: (group) => [
    `You’ll leave ${group} straight away and give your place back.`,
    // A fellowship's groups share notes (`runSharesGroupNotes`), so the line names them.
    "Your marks so far stay on your group’s register, and the notes you shared stay with the group. " +
      "After you leave, your programme’s page shows only that you left. The weekly emails stop.",
    `You can’t undo this yourself. If you change your mind, email ${SOCIETY} and we’ll see what we can do.`,
  ],
  reasonLabel: "Why are you leaving? (optional)",
  // Nobody is named the programme's lead in this world (`reasonReaders`).
  readers: "Only the programme’s lead and admins read this.",
  confirmLabel: (title) => `Type ${title} to confirm`,
  button: (name) => `Leave ${name}`,
  stay: "Stay",
  wrongTitle: "That doesn't match the course title. Type it exactly to confirm.",
  ended: (title) =>
    `${title} has ended, so there’s nothing to leave. If you need something changed, email ${SOCIETY}.`,
  leftHeading: (name) => `You left ${name}`,
  leftOn: (day) => `That was on ${day}. Thanks for coming along.`,
  changedYourMind: "Changed your mind?",
  changedLine: `Email ${SOCIETY} and we’ll see what we can do.`,
  myProgrammes: "My programmes",
});

/**
 * WHAT THE PAGE THAT SAYS SOMEBODY LEFT USED TO SHOW THEM, and may not now
 * (somebody who leaves keeps nothing): the words of what stayed theirs, and
 * the site's events.
 */
const KEPT_NOTHING = Object.freeze([
  "What stays here",
  "Your notes and reflections",
  "The reading list",
  "Your sessions",
  "Still around",
  "Events are open to everyone.",
]);

/**
 * THE APPLICATION PAGE'S WORDS, restated from src/lib/applications/status/
 * (`runWords.ts`, `words.ts`), the page (`StatusPage.tsx`) and the reply
 * buttons (`ReplyButtons.tsx`).
 */
const APPLICATION = Object.freeze({
  youAreIn: (name) => `You’re in ${name}.`,
  saidComing: "You’ve told us you’re coming.",
  cantMakeIt: "I can’t make it",
  frees: "This frees your place for someone else.",
  inGroup: (group) => `You’re in ${group}. Your programme’s page has your sessions and each week’s reading.`,
  goToProgramme: "Go to your programme",
  leavingNow: (group) =>
    `Changed your mind? Giving your place back now means leaving ${group}. You can do that from your programme’s page.`,
  question: "Give your place back? This frees it for someone else, and you can’t undo it here.",
  legend: "What’s the main reason?",
  reasons: [
    "The times don’t work for me",
    "I have too much on this term",
    "I’m doing something else instead",
    "Other",
  ],
  tellUsMore: "Tell us a bit more",
  yes: "Yes, I can’t make it",
  leftChip: "Left the programme",
  leftTitle: (name) => `You left ${name}.`,
  // Once said here, gone with what it pointed to: the programme's page shows
  // somebody who left only that they left.
  stillYours: "Your notes and the reading list are still on your programme’s page.",
  changedLine: `Changed your mind? Email ${SOCIETY} and we’ll see what we can do.`,
});

/**
 * THE LEAVE'S EMAIL, restated from `courseTemplateDefaults["course-dropped-out"]`
 * in src/lib/firestore/courseEmails.ts and src/emails/CourseDroppedOutEmail.tsx,
 * with its slots filled from the records. Held to the seed copy: a target
 * whose Email designs carry other words for "Left a course" fails here, and
 * the message says so.
 */
function leavingEmail({ first, courseTitle, runLabel, feedback }) {
  return {
    subject: `You've left ${courseTitle}`,
    sentences: [
      `That's you off the list, ${first}`,
      `You're no longer on ${courseTitle} (${runLabel}), and your place has gone back to the group. The weekly emails will stop.`,
      "Thanks for giving it a go. If you'd like to join a future cohort, keep an eye on the courses page: applying again is welcome and counts for nothing against you.",
      "Nothing else is needed from you.",
      ...(feedback
        ? [
            "If you have two minutes, we'd really like to know what got in the way: tell us anonymously. It goes to nobody who taught you, and it is the main way we work out what to change.",
          ]
        : []),
      FOOTER,
    ],
  };
}

/**
 * Why a step may not run in this mode, or null. Nothing on this journey is
 * reCAPTCHA-gated (`SPEC.recaptchaDependentSteps` is empty), so this never
 * fires; the wiring is the funnel's, kept so a press that grows a gate later
 * is one line from being declared.
 */
let skipReasonFor = () => null;

/** The one reason this file may record for a step it did not run. */
const DEPLOYED_TARGET_SKIP = RECAPTCHA_SKIP_REASON;

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
const [term, ended] = state?.terms ?? [];

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !term || !ended
    ? `No course hub terms at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an " +
        "admin's, and this harness cannot create an admin."
      : term.suppress !== false || ended.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, the leave's email to each who left included, so it " +
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

/**
 * What an element says, as written: its text content, never `innerText`,
 * which is the text as CSS shows it (the site sets its labels in capitals with
 * CSS, and the words are the record's, not the look's). T2's, restated.
 */
const textOf = async (locator) => flat((await locator.textContent()) ?? "");

/** `textOf` for every element a locator matches, in order. */
const textsOf = async (locator) => (await locator.allTextContents()).map(flat);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * What an email's HTML says, as one line of words: block tags become a space,
 * inline ones vanish, and entities are decoded. Read off the HTML rather than
 * the text part, which writes headings in capitals. (T1's, restated.)
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
    text: message.Text ?? "",
    html: message.HTML ?? "",
  };
}

/** Holds one email to its sentences, in order. */
function assertSays(email, { who, sentences }) {
  let from = 0;
  for (const sentence of sentences) {
    const at = email.words.indexOf(sentence, from);
    assert.ok(
      at !== -1,
      `${who} does not say ${JSON.stringify(sentence)}${from > 0 ? " after what came before it" : ""}. ` +
        `It says: ${JSON.stringify(email.words)}`,
    );
    from = at + sentence.length;
  }
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: leaving the programme by both doors, and leaving closed after the run's last session",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const plan = WEEK_FOUR;

    const personOf = (key) => {
      const found = term.people.find((person) => person.key === key);
      assert.ok(found, `the week four term has nobody called ${key}`);
      return found;
    };
    const ada = personOf("ada");
    const ben = personOf("ben");
    const dan = personOf("dan");
    const cleo = personOf("cleo");
    const fern = term.facilitator;
    const ivy = ended.people[0];
    assert.ok(fern, "the week four term has no account to appoint as a facilitator");
    assert.ok(ivy, "the term past its end has nobody in it");

    const groupOf = (key) => term.groups.find((group) => group.key === key);
    /** The one order every tab lists the groups in (People in groups' columns). */
    const ordered = [...term.groups].sort(compareGroupsByMeeting);
    /** The group Ben and Dan leave, Fern's, and the one with the meeting link. */
    const groupA = groupOf(plan.facilitated);
    for (const person of [ada, ben, dan]) {
      assert.equal(person.groupKey, groupA.key, `${person.first} is not in ${groupA.name}, which this journey's leavers leave`);
    }
    assert.ok(groupA.meetingUrl, `${groupA.name} has no meeting link, so 'the link goes' would prove nothing`);
    const linkHost = new URL(groupA.meetingUrl).host;
    /**
     * A group's people in the order the lead's tabs list them: by the name
     * those tabs show, then uid. Course screens name people by the names rule
     * for their reader (`nameForViewer`): the admin, who reads the lead's tabs
     * here, is shown each full name, which for this term's fixtures is the
     * account's display name, unique to this run; Fern, a facilitator who is
     * not on the committee, the name each goes by, the fixture's `first`. The
     * two sort alike: every display name is its `first` and the same words.
     * The Applications tab and the Settings panel keep the name on the
     * application, the account's display name.
     */
    const membersOf = (group) =>
      term.people
        .filter((person) => person.groupKey === group.key)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "en-GB") || a.uid.localeCompare(b.uid));
    /**
     * A row heading's name pattern for this person, on a page drawn for Fern:
     * their whole go-by name at its start, never the start of a longer name.
     * Text read off the page runs the name straight into what follows it
     * ("BenLeft Fri 13 Nov").
     */
    const headingOf = (person) => new RegExp(`^${escapeRegExp(person.first)}(?![a-z])`);
    /** The same, on a page drawn for the admin: the full name the names rule shows them. */
    const adminHeadingOf = (person) => new RegExp(`^${escapeRegExp(person.displayName)}(?![A-Za-z0-9])`);

    const weeks = Array.from({ length: term.weekCount }, (_, i) => i + 1);

    // The run's week, by its own calendar: the world promises week 4.
    const elapsedDays = Math.round(
      (Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${term.startDate}T00:00:00Z`)) / 86_400_000,
    );
    const thisWeek = Math.floor(elapsedDays / 7) + 1;
    assert.equal(thisWeek, 4, `the term is in week ${thisWeek}, not week 4: the seed and this run are ${elapsedDays} days from its start`);
    const nextWeek = thisWeek + 1;
    /** Every register up to this week's is finished in the world's plan. */
    const finishedWeeks = weeks.filter((weekNumber) => weekNumber <= thisWeek);
    const markOf = (person, weekNumber) => plan.marks[person.groupKey]?.[weekNumber]?.[person.key] ?? null;
    for (const weekNumber of finishedWeeks) {
      for (const person of term.people) {
        assert.ok(markOf(person, weekNumber), `the world gives ${person.first} no mark in week ${weekNumber}`);
      }
    }

    const formBase = (aTerm) => `${origin}/admin/admissions/forms/${enc(aTerm.formId)}/programmes/${enc(aTerm.programmeId)}`;
    const learnPath = (aTerm) => `/learn/${enc(aTerm.runId)}`;
    const groupPagePath = `${learnPath(term)}/group/${enc(groupA.id)}`;
    const applicationUrl = (aTerm) => `${origin}/applications/${enc(aTerm.formId)}`;
    const leaveRoute = (aTerm) => `/api/courses/runs/${enc(aTerm.runId)}/enrol`;
    const replyRoute = (aTerm) => `/api/admissions/forms/${enc(aTerm.formId)}/application/reply`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: benContext, page: benPage } = await newIdentityPage(browser);
    const { context: danContext, page: danPhone } = await newIdentityPage(browser);
    const { context: fernContext, page: fernPage } = await newIdentityPage(browser);
    const { context: ivyContext, page: ivyPage } = await newIdentityPage(browser);
    /** Dan's second page, in Dan's own context: the application opened fresh. Opened in step 9. */
    let danLaptop = null;

    /**
     * Which page a failed step photographs. The recorder takes one page and
     * this spec drives six, so each step names its page first.
     */
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
    for (const pg of [benPage, danPhone, fernPage, ivyPage]) await stubRecaptchaOnLoopback(pg, origin);
    if (!recaptchaStubbed) {
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? DEPLOYED_TARGET_SKIP : null);
    }

    const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });

    /** The answer to the next request whose path ends `suffix`, by `method`. */
    const responseTo = (pg, suffix, method) =>
      pg.waitForResponse(
        (r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method,
        { timeout: WAIT_MS },
      );

    /** A JSON answer that must be a success, read once. */
    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    /**
     * A request made with a page's own session, its status and body read back:
     * what a page's own press sends, made by hand where the page will not send
     * it (a title typed wrong; a door that has closed).
     */
    const fetchAs = (pg, url, init = {}) =>
      pg.evaluate(
        async ({ url: target, init: options }) => {
          const res = await fetch(target, options);
          return { status: res.status, body: await res.json().catch(() => null) };
        },
        { url, init },
      );

    /** The JSON body of a request, as `fetchAs` sends it. */
    const jsonInit = (method, body) => ({
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    // ---- The records ------------------------------------------------------------

    const placeOf = async (aTerm, person) =>
      (await fixtureDoc("courseEnrolments", enrolmentId(aTerm.runId, person.uid)).get()).data() ?? null;
    const applicationOf = async (aTerm, person) =>
      (await fixtureDoc("admissionApplications", `${aTerm.formId}__${person.uid}`).get()).data() ?? null;
    const formCountsOf = async (aTerm) =>
      (await fixtureDoc("admissionRounds", aTerm.formId).get()).data()?.applicationCounts ?? null;
    const memberCountOf = async (group) => (await fixtureDoc("courseGroups", group.id).get()).data()?.memberCount ?? null;
    /** A stored instant, from a Timestamp. */
    const instantOf = (value) => (value && typeof value.toDate === "function" ? value.toDate() : null);

    /** The day each leaver left, as the leave stored it, keyed by person: "YYYY-MM-DD". */
    const leftKeyOf = new Map();
    /** "Left Sun 25 Oct", as every page that lists a leaver says it. */
    const leftLabelOf = (person) => `Left ${dayLabel(leftKeyOf.get(person.key))}`;

    /**
     * What one leave wrote, held to what leaving writes (src/lib/courses/leaveRun.ts):
     * the place withdrawn with the day and the reason, the group and Publish's
     * stamp kept; the group one person smaller; the place on the form given
     * back with no reason on the application; one line in the course log that
     * says what was done and not why; and off the cohort's list. The day is
     * read back and must be a day the press was made on, in London.
     */
    async function assertLeft(person, { said, before, after, members, formCounts }) {
      const place = await placeOf(term, person);
      assert.equal(place?.status, "withdrawn", `${person.first}'s place is not withdrawn`);
      assert.equal(place?.groupId, groupA.id, `${person.first}'s place no longer names the group they left`);
      assert.ok(place?.allocatedEmailAt, `${person.first}'s place lost Publish's stamp, which shows them their own row`);
      assert.equal(place?.dropOutReason, said, `${person.first}'s reason is not the one they gave`);
      const leftAt = instantOf(place?.droppedOutAt);
      assert.ok(leftAt, `${person.first}'s place carries no day they left`);
      const leftKey = londonDateKey(leftAt);
      assert.ok([before, after].includes(leftKey), `${person.first} left on ${leftKey}, not on the day of the press`);
      leftKeyOf.set(person.key, leftKey);
      // Their marks stay: no finished register lost them.
      for (const weekNumber of finishedWeeks) {
        const register = (
          await fixtureDoc("courseAttendance", `${term.runId}__${groupA.id}__w${String(weekNumber).padStart(2, "0")}`).get()
        ).data();
        assert.equal(register?.records?.[person.uid], markOf(person, weekNumber), `${person.first}'s week ${weekNumber} mark changed`);
        assert.ok(register?.pushedAt, `week ${weekNumber}'s register is no longer finished`);
      }
      assert.equal(await memberCountOf(groupA), members, `${groupA.name}'s count of people is not ${members}`);
      const application = await applicationOf(term, person);
      assert.equal(application?.status, "withdrawn", `${person.first}'s place on the form was not given back`);
      assert.equal(application?.attendance?.answer, "cant-make-it", `${person.first}'s application does not say they can't make it`);
      assert.ok(!application?.releaseReason, `${person.first}'s reason was written onto the application, which every reader of applications reads`);
      assert.deepEqual(
        [(await formCountsOf(term))?.accepted, (await formCountsOf(term))?.withdrawn],
        formCounts,
        "the form's places do not count the place given back",
      );
      const logged = (await fixtureQuery("courseAudit").where("runId", "==", term.runId).get()).docs
        .map((doc) => doc.data())
        .filter((row) => row.kind === "enrolment-dropout" && row.subjectUid === person.uid);
      assert.equal(logged.length, 1, `${person.first}'s leave was logged ${logged.length} times`);
      assert.equal(logged[0].detail, "Left the course.", "the course log says more than what was done");
      assert.ok(!JSON.stringify(logged[0]).includes(said), "the course log copies the reason");
      const cohort = (await fixtureDoc("subscriptions", subscriptionId(person.email, term.channel)).get()).data();
      assert.equal(cohort?.subscribed, false, `${person.first} is still on the cohort's list`);
    }

    // ---- Mail ---------------------------------------------------------------------

    /** The messages to one fixture address, oldest first, once there are `count`. */
    async function mailTo(address, count) {
      const summaries = await waitForMessagesTo(address, { count, timeoutMs: WAIT_MS });
      return summaries.slice().reverse();
    }

    /** Every send log row to one address, by kind. */
    const sendKindsTo = async (address) =>
      (await fixtureQuery("emailSends").where("to", "==", address).get()).docs
        .map((doc) => String(doc.data()?.kind ?? ""))
        .sort();

    /** Everybody on this journey with an address of their own. */
    const everybody = [...term.people, fern, ivy];

    /** How many messages each of them has in Mailpit right now. */
    const mailCounts = async () => {
      const out = {};
      for (const account of everybody) out[account.first] = (await messagesTo(account.email)).length;
      return out;
    };

    /** What the leave answered each who left: the feedback link Course settings name, or "". */
    const feedbackOf = new Map();

    // ---- Pages ----------------------------------------------------------------------

    /** The main column's words, the page's own and nothing of the shell around it. */
    const mainText = async (pg) => textOf(pg.locator("main"));

    /**
     * The page that says somebody left, read whole at `path`: the bar (back
     * to My programmes, the programme's name), that they left, the day, and
     * what to do if it was a mistake, and nothing else at all. `textContent`
     * runs the page's blocks together, so the words are joined with nothing
     * between them. No marks, no way to notes or the reading list, no events.
     */
    async function readLeftPage(pg, aTerm, day, path = learnPath(aTerm)) {
      await pg.getByRole("heading", { level: 1, name: LEAVING.leftHeading(aTerm.programmeName), exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(new URL(pg.url()).pathname, path, "the page that says they left is not at the address that was opened");
      const said = await mainText(pg);
      assert.equal(
        said,
        [
          LEAVING.myProgrammes,
          aTerm.programmeName,
          LEAVING.leftHeading(aTerm.programmeName),
          LEAVING.leftOn(day),
          LEAVING.changedYourMind,
          LEAVING.changedLine,
        ].join(""),
        "the page that says they left says more, or less, than that they left and when",
      );
      for (const words of KEPT_NOTHING) assert.ok(!said.includes(words), `the page that says they left shows ${JSON.stringify(words)}: ${said}`);
      assert.equal(await pg.getByRole("region", { name: "Your sessions" }).count(), 0, "the page that says they left lists their sessions");
      for (const suffix of ["/notes", "/reading"]) {
        assert.equal(await pg.locator(`main a[href$="${suffix}"]`).count(), 0, `the page that says they left links to ${suffix}`);
      }
      return said;
    }

    try {
      await step("the admin approves everybody who signs in on this journey", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [ben, dan, fern, ivy]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          const approved = await waitFor(`${account.first}'s account to say member`, async () => {
            const doc = await readUserDoc(account.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${account.first}'s approval left no approvedAt stamp`);
        }
        // Ada stays in the group and Cleo is in the other; neither signs in, so both wait.
        for (const account of [ada, cleo]) {
          assert.equal((await readUserDoc(account.uid))?.role, "pending", `${account.first} was approved, and nothing here approves them`);
        }
        // Each approval sends one email, a moment after its card leaves the queue.
        for (const account of [ben, dan, fern, ivy]) await mailTo(account.email, 1);
        assert.deepEqual(
          await mailCounts(),
          { Ada: 0, Ben: 1, Cleo: 0, Dan: 1, Ivy: 1, Fern: 1 },
          "approving emailed somebody twice, or nobody",
        );
      });

      await step(
        "a member opens their application page while their programme names no run, and it offers I can’t make it",
        async () => {
          activePage = danPhone;
          // The programme names no run yet: naming it is the admin's, next.
          const form = (await fixtureDoc("admissionRounds", term.formId).get()).data();
          assert.equal(form?.programmes?.[term.programmeId]?.runId ?? null, null, "the programme already names a run");
          await signIn(danPhone, dan);
          await danPhone.goto(applicationUrl(term), { waitUntil: "domcontentloaded" });
          await danPhone
            .getByRole("heading", { level: 1, name: APPLICATION.youAreIn(term.programmeName), exact: true })
            .waitFor({ timeout: WAIT_MS });
          // Dan said they were coming on decision day's page; the way to give the
          // place back is still offered, as it is to everybody holding one.
          await danPhone.getByText(APPLICATION.saidComing, { exact: true }).waitFor({ timeout: WAIT_MS });
          const cant = danPhone.getByRole("button", { name: APPLICATION.cantMakeIt, exact: true });
          await waitFor("I can’t make it to be live once the page has hydrated", async () => cant.isEnabled());
          await danPhone.getByText(APPLICATION.frees, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(
            await danPhone.getByRole("link", { name: APPLICATION.goToProgramme }).count(),
            0,
            "the page points to a programme page before the programme names a run",
          );
        },
      );

      await step("the admin names the running course run on the programme's Settings tab and hands its people over", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase(term)}/setup`, { waitUntil: "domcontentloaded" });
        const panel = adminPage.getByRole("region", { name: "Course run" });
        await panel.waitFor({ timeout: WAIT_MS });
        const runBox = panel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [response] = await Promise.all([
          responseTo(adminPage, `/programmes/${term.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${term.runLabel} · Running` }),
        ]);
        const body = await okBody(response, "Naming the run");
        assert.equal(body.changed, true, "naming the run changed nothing");
        assert.equal(body.panel?.runId, term.runId, "the panel names another run");
        const holding = term.people.length;
        await panel
          .getByText(`${holding} people hold a place on ${term.programmeName}. None of them is on the run’s list yet.`, {
            exact: true,
          })
          .waitFor({ timeout: WAIT_MS });
        const [handOver] = await Promise.all([
          responseTo(adminPage, "/run/hand-over", "POST"),
          panel.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
        ]);
        const receipt = await okBody(handOver, "Handing over");
        assert.deepEqual(receipt.receipt, { handedOver: holding, alreadyThere: 0 }, "the hand-over's receipt");
        await panel.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });
        // Handing over places nobody and tells nobody: the places stay as Publish left them.
        for (const person of term.people) {
          const place = await placeOf(term, person);
          assert.equal(place?.groupId, groupOf(person.groupKey).id, `${person.first}'s place moved`);
          assert.ok(place?.allocatedEmailAt, `${person.first} is no longer told`);
        }
      });

      await step("the admin appoints a facilitator to the group two of its people will leave", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase(term)}/groups/facilitators`, { waitUntil: "domcontentloaded" });
        const card = adminPage.locator('section[aria-labelledby="facilitators-title"]');
        await card.getByText(`0 facilitators for ${term.groups.length} groups`, { exact: true }).waitFor({ timeout: WAIT_MS });
        await card.getByRole("button", { name: `Change ${groupA.name}’s facilitators`, exact: true }).click();
        await card.getByPlaceholder("Search people…").fill(fern.displayName);
        await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(fern.displayName)) }).check();
        const [response] = await Promise.all([
          responseTo(adminPage, `/groups/${groupA.id}/facilitators`, "POST"),
          card.getByRole("button", { name: "Save", exact: true }).click(),
        ]);
        const body = await okBody(response, "Saving the facilitators");
        assert.deepEqual(body.facilitatorUids, [fern.uid], "the group's facilitators are not the one ticked");
        await card.getByText(`${groupA.name}’s facilitators are saved. Nobody was emailed.`, { exact: true }).waitFor({ timeout: WAIT_MS });
      });

      // What a person in Group A reads of the group, before anybody leaves.
      const nextSession = sessionOf(groupA, nextWeek);
      const ticketWhen = sessionWhenLabel(groupA, nextSession.dateKey);
      /** The reads a member's programme page makes about their run and their group. */
      const groupReads = [
        `/api/courses/runs/${enc(term.runId)}/overview`,
        `/api/courses/runs/${enc(term.runId)}/updates`,
        `/api/courses/groups/${enc(groupA.id)}/roster`,
      ];

      await step(
        "the first leaver's programme page and Home show their group and its meeting link, and Leave the programme",
        async () => {
          activePage = benPage;
          await signIn(benPage, ben);
          await benPage.goto(`${origin}${learnPath(term)}`, { waitUntil: "domcontentloaded" });
          // The head names Ben's group, its usual day and time, its room and its facilitator.
          const head = benPage.locator("main header");
          const groupLineEl = head.locator("p").filter({ hasText: groupA.name }).first();
          await groupLineEl.waitFor({ timeout: WAIT_MS });
          // "Group A · Fridays 6pm · Room E1 · with Fern" (`groupLineWords`).
          assert.equal(
            await textOf(groupLineEl),
            [groupA.name, slotLine(groupA), groupA.room, `with ${fern.first}`].join(" · "),
            "the head's line does not name Ben's group, its day and time, its room and its facilitator",
          );
          // Ben's next session, with its way to join on the site.
          const ticket = benPage.getByRole("region", { name: "Your next session", exact: true });
          await ticket.getByText(`Your next session · week ${nextWeek}`, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await textOf(ticket.getByRole("heading", { level: 2 })), ticketWhen, "Ben's ticket is not Group A's next session");
          assert.equal(
            await ticket.getByRole("link", { name: "Join online", exact: true }).getAttribute("href"),
            groupA.meetingUrl,
            "Ben's way to join is not Group A's",
          );
          // Your group: the group's name over its people.
          const yourGroup = benPage.getByRole("region", { name: "Your group", exact: true });
          await yourGroup.getByText(groupA.name, { exact: true }).waitFor({ timeout: WAIT_MS });
          // And at its foot, the way out.
          const leave = benPage.getByRole("link", { name: LEAVING.link, exact: true });
          await leave.waitFor({ timeout: WAIT_MS });
          assert.equal(await leave.getAttribute("href"), `${learnPath(term)}/leave`, "Leave the programme does not lead to its confirmation");
          // The reads behind this page answer Ben: the run, its updates, and the group's names.
          for (const path of groupReads) {
            const answer = await fetchAs(benPage, path);
            assert.equal(answer.status, 200, `${path} answered ${ben.first} ${answer.status} while still in the group`);
          }

          // Home: Ben's next session, named by the group, with the same way to join.
          await benPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
          const homeTicket = benPage.getByRole("region", { name: "Your next session", exact: true });
          await homeTicket.waitFor({ timeout: WAIT_MS });
          const homeWhen = await textOf(homeTicket.getByRole("heading", { level: 2 }));
          assert.ok(homeWhen.startsWith(`${groupA.name}, `), `Home's ticket does not name Ben's group: ${homeWhen}`);
          assert.equal(
            await homeTicket.getByRole("link", { name: "Join online", exact: true }).getAttribute("href"),
            groupA.meetingUrl,
            "Home's way to join is not Group A's",
          );
        },
      );

      await step(
        "the first leaver reads what leaving means, is refused a title typed wrong, and leaves with the title typed right",
        async () => {
          activePage = benPage;
          /** Every leave the page sends, with what it carried. */
          const leaves = [];
          const onRequest = (request) => {
            if (request.method() === "DELETE" && new URL(request.url()).pathname === leaveRoute(term)) {
              leaves.push(request.postDataJSON());
            }
          };
          benPage.on("request", onRequest);
          try {
            await benPage.goto(`${origin}${learnPath(term)}`, { waitUntil: "domcontentloaded" });
            await benPage.getByRole("link", { name: LEAVING.link, exact: true }).click();
            const heading = benPage.getByRole("heading", { level: 1, name: LEAVING.heading(term.programmeName), exact: true });
            await heading.waitFor({ timeout: WAIT_MS });
            assert.equal(new URL(benPage.url()).pathname, `${learnPath(term)}/leave`, "the way out is not the confirmation's page");

            // What leaving means: the group by name, what stays, and that it cannot be undone here.
            const said = await mainText(benPage);
            let from = 0;
            for (const expected of [term.programmeName, LEAVING.link, ...LEAVING.lines(groupA.name), LEAVING.reasonLabel, LEAVING.readers]) {
              const at = said.indexOf(expected, from);
              assert.ok(at !== -1, `the confirmation does not say ${JSON.stringify(expected)} where it should: ${said}`);
              from = at + expected.length;
            }
            assert.equal(
              await benPage.getByRole("link", { name: term.programmeName, exact: true }).first().getAttribute("href"),
              learnPath(term),
              "the confirmation's way back is not the programme's page",
            );
            assert.equal(
              await benPage.getByRole("link", { name: LEAVING.stay, exact: true }).getAttribute("href"),
              learnPath(term),
              "Stay does not lead back to the programme's page",
            );
            const reason = benPage.getByLabel(LEAVING.reasonLabel, { exact: true });
            const confirm = benPage.getByLabel(LEAVING.confirmLabel(term.courseTitle), { exact: true });
            const button = benPage.getByRole("button", { name: LEAVING.button(term.programmeName), exact: true });
            await confirm.waitFor({ timeout: WAIT_MS });
            assert.equal(await button.isDisabled(), true, "the leave can be pressed before the title is typed");

            // The title typed wrong, the way a person gets it wrong: the
            // programme's name, which the page names, for the course's title,
            // which it asks for. The page refuses it: the button stays dead,
            // and Enter in the box sends nothing.
            await reason.fill(BEN_SAID);
            await confirm.fill(term.programmeName);
            assert.notEqual(term.programmeName, term.courseTitle, "the world names the programme and the course alike");
            await confirm.press("Enter");
            assert.equal(await button.isDisabled(), true, "the leave can be pressed with the title typed wrong");
            // And the route refuses the page's own request with that title, in
            // the words the page would show, writing nothing.
            const wrong = await fetchAs(
              benPage,
              leaveRoute(term),
              jsonInit("DELETE", { confirmName: term.programmeName, reason: BEN_SAID }),
            );
            assert.deepEqual([wrong.status, wrong.body?.error], [400, LEAVING.wrongTitle], "the title typed wrong was not refused");
            assert.equal((await placeOf(term, ben))?.status, "active", "a refused leave took Ben off the run");

            // Typed right, it can be pressed, and it leaves.
            await confirm.fill(term.courseTitle);
            await waitFor("the leave to be live with the title typed right", async () => button.isEnabled());
            const before = londonDateKey(new Date());
            const [response] = await Promise.all([responseTo(benPage, leaveRoute(term), "DELETE"), button.click()]);
            assert.deepEqual(
              response.request().postDataJSON(),
              { confirmName: term.courseTitle, reason: BEN_SAID },
              "the press did not send the title typed and the reason",
            );
            const answer = await okBody(response, "Leaving");
            assert.equal(answer.ok, true, "the leave's answer");
            assert.equal(typeof answer.feedbackUrl, "string", "the leave's answer carries no feedback link, empty or not");
            feedbackOf.set(ben.key, answer.feedbackUrl);
            console.log(
              `[leaving-spec] this target's Course settings ${answer.feedbackUrl ? "name a" : "name no"} feedback link for the leave's email.`,
            );
            const after = londonDateKey(new Date());

            // Two requests left the page: the one made by hand with the title
            // typed wrong, and the press. Enter sent none.
            assert.deepEqual(
              leaves,
              [
                { confirmName: term.programmeName, reason: BEN_SAID },
                { confirmName: term.courseTitle, reason: BEN_SAID },
              ],
              "the page sent a leave it should not have",
            );
            await assertLeft(ben, {
              said: BEN_SAID,
              before,
              after,
              members: membersOf(groupA).length - 1,
              formCounts: [term.people.length - 1, 1],
            });
          } finally {
            benPage.off("request", onRequest);
          }
        },
      );

      // CHANGED ON PURPOSE (somebody who leaves keeps nothing, and the group
      // keeps their notes). Until then this step read Ben's marks, the links
      // to Ben's notes and the reading list, then those two pages with what
      // Ben wrote and every published week on them. Now the page says that Ben
      // left and when, word for word, and nothing else, and the notes' and the
      // reading list's addresses show that same page.
      await step(
        "the first leaver lands on the page that says they left and when, and nothing else, which the notes and reading list addresses show too",
        async () => {
          activePage = benPage;
          const day = dayLabel(leftKeyOf.get(ben.key));
          const said = await readLeftPage(benPage, term, day);
          // Nothing of Ben's records or the group's: not what Ben wrote, not
          // the reading list, not the group's name, its link, its people or
          // what Ben said. What Ben wrote is still in the records (the seed's
          // own note is what is looked for).
          const [note] = plan.notes;
          for (const [what, words] of [
            ["Ben's note", note.note],
            ["Ben's comment", note.comment],
            ["week 1's reading", WEEK_ONE_READING.title],
            ["the group's name", groupA.name],
            ["the meeting link", linkHost],
            ["a way to join", "Join online"],
            ["Ben's reason", BEN_SAID],
            ...[ada, dan, cleo, fern].map((other) => [`${other.first}'s name`, other.first]),
          ]) {
            assert.ok(!said.includes(words), `the page that says Ben left shows ${what}: ${said}`);
          }
          assert.equal(await benPage.getByRole("region", { name: "Your next session" }).count(), 0, "the page that says Ben left has a ticket");

          // The addresses of Ben's notes and the reading list: the same page, and none of what was there.
          for (const suffix of ["notes", "reading"]) {
            await benPage.goto(`${origin}${learnPath(term)}/${suffix}`, { waitUntil: "domcontentloaded" });
            const there = await readLeftPage(benPage, term, day, `${learnPath(term)}/${suffix}`);
            for (const words of [note.note, note.comment, WEEK_ONE_READING.title]) {
              assert.ok(!there.includes(words), `the ${suffix} address shows Ben ${JSON.stringify(words)}: ${there}`);
            }
          }
        },
      );

      await step(
        "the first leaver's programme page and Home no longer show the group or its meeting link, and My programmes says only that they left",
        async () => {
          activePage = benPage;
          // Ben's programme page is the page that says Ben left (held above),
          // and the group's link is on none of these.
          const noGroupHere = async (where) => {
            const said = await mainText(benPage);
            assert.ok(!said.includes(groupA.name), `${where} still names Ben's group: ${said}`);
            assert.ok(!said.includes(linkHost), `${where} still carries the meeting link`);
            assert.equal(
              await benPage.locator(`a[href="${groupA.meetingUrl}"]`).count(),
              0,
              `${where} still links to the meeting`,
            );
            assert.equal(await benPage.getByRole("region", { name: "Your next session" }).count(), 0, `${where} still has Ben's ticket`);
          };
          const day = dayLabel(leftKeyOf.get(ben.key));
          await benPage.goto(`${origin}${learnPath(term)}`, { waitUntil: "domcontentloaded" });
          await readLeftPage(benPage, term, day);
          await noGroupHere("Ben's programme page");

          // Home: no programme of Ben's now. What it says instead is Home's own
          // sentence for somebody on no programme and holding no place, which
          // Ben is once the place has gone back.
          const homeRuns = benPage
            .waitForResponse((r) => new URL(r.url()).pathname === "/api/courses/me" && r.request().method() === "GET", {
              timeout: WAIT_MS,
            })
            .catch((err) => err);
          await benPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
          const runs = await homeRuns;
          if (runs instanceof Error) throw runs;
          const mine = await okBody(runs, "Home's list of Ben's runs");
          assert.ok(!JSON.stringify(mine).includes(term.runId), "Home's list of Ben's runs still has the run Ben left");
          // A9: never "yet" to somebody who has been on one.
          await benPage.getByText("You’re not on a programme.", { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await benPage.getByText("You’re not on a programme yet.", { exact: true }).count(), 0, "Home says yet to somebody who left");
          await noGroupHere("Home");

          // CHANGED ON PURPOSE: My programmes said "You're not on a course
          // yet" to somebody who had left one, with no way to the page that
          // says so. Now the run Ben left is a card that says only that Ben
          // left, and leads to that page.
          await benPage.goto(`${origin}/learn`, { waitUntil: "domcontentloaded" });
          await benPage.getByRole("heading", { level: 1, name: "My programmes", exact: true }).waitFor({ timeout: WAIT_MS });
          const card = benPage.getByRole("link", { name: LEAVING.leftHeading(term.programmeName), exact: true });
          await card.waitFor({ timeout: WAIT_MS });
          assert.equal(await card.getAttribute("href"), learnPath(term), "the card for the run Ben left does not lead to its page");
          assert.equal(await textOf(card), LEAVING.leftHeading(term.programmeName), "the card for the run Ben left says more than that Ben left");
          assert.equal(await benPage.locator(`a[href="${learnPath(term)}"]`).count(), 1, "My programmes links to the run Ben left other than by its card");
          assert.equal(
            await benPage.getByText("You're not on a course yet", { exact: true }).count(),
            0,
            "My programmes tells Ben they are on no course, beside the card that says what became of it",
          );
          await noGroupHere("My programmes");
          await card.click();
          await readLeftPage(benPage, term, day);
        },
      );

      await step(
        "the second member, pointed to their programme's page, gives the place back with I can’t make it on the page they opened before",
        async () => {
          // Dan's application opened fresh, now the programme names its run and
          // Publish has told Dan the group: it points to the programme's
          // page, where leaving is, and offers no "I can’t make it".
          danLaptop = await danContext.newPage();
          await stubRecaptchaOnLoopback(danLaptop, origin);
          activePage = danLaptop;
          await danLaptop.goto(applicationUrl(term), { waitUntil: "domcontentloaded" });
          await danLaptop.getByText(APPLICATION.inGroup(groupA.name), { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(
            await danLaptop.getByRole("link", { name: APPLICATION.goToProgramme }).getAttribute("href"),
            learnPath(term),
            "Go to your programme does not lead to Dan's programme page",
          );
          await danLaptop.getByText(APPLICATION.leavingNow(groupA.name), { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(
            await danLaptop.getByRole("button", { name: APPLICATION.cantMakeIt, exact: true }).count(),
            0,
            "the page still offers I can’t make it to somebody in a group",
          );

          // Dan's phone still has the page from before: Dan presses "I can’t make it" there.
          activePage = danPhone;
          await danPhone.getByRole("button", { name: APPLICATION.cantMakeIt, exact: true }).click();
          const asking = danPhone.getByRole("group", { name: APPLICATION.question, exact: true });
          await asking.waitFor({ timeout: WAIT_MS });
          await asking.getByText(APPLICATION.legend, { exact: true }).waitFor({ timeout: WAIT_MS });
          const radios = asking.getByRole("radio");
          const offered = [];
          for (let i = 0; i < (await radios.count()); i += 1) {
            offered.push(flat((await radios.nth(i).locator("xpath=ancestor::label[1]").textContent()) ?? ""));
          }
          assert.deepEqual(offered, APPLICATION.reasons, "the reasons the page offers");
          // The row a person presses: the radio itself is a pixel under it, for the keyboard.
          await asking.locator("label").filter({ hasText: /^Other$/ }).click();
          assert.equal(await asking.getByRole("radio", { name: "Other", exact: true }).isChecked(), true, "Other is not chosen");
          await asking.getByLabel(APPLICATION.tellUsMore, { exact: true }).fill(DAN_SAID);
          const before = londonDateKey(new Date());
          const [response] = await Promise.all([
            responseTo(danPhone, replyRoute(term), "POST"),
            asking.getByRole("button", { name: APPLICATION.yes, exact: true }).click(),
          ]);
          assert.deepEqual(
            response.request().postDataJSON(),
            { reply: "cant-make-it", reason: { kind: "other", other: DAN_SAID } },
            "the press did not send the reply and the reason Dan wrote",
          );
          const answer = await okBody(response, "I can’t make it");
          assert.deepEqual([answer.ok, answer.changed], [true, true], "the reply's answer");
          const after = londonDateKey(new Date());

          // The one leave, from the other door: the same records Ben's wrote.
          await assertLeft(dan, {
            said: DAN_SAID,
            before,
            after,
            members: membersOf(groupA).length - 2,
            formCounts: [term.people.length - 2, 2],
          });

          // The page Dan pressed it on is drawn again from what is stored: Dan left, and when.
          const card = [
            APPLICATION.leftChip,
            APPLICATION.leftTitle(term.programmeName),
            LEAVING.leftOn(dayLabel(leftKeyOf.get(dan.key))),
            APPLICATION.changedLine,
            APPLICATION.goToProgramme,
          ];
          for (const pg of [danPhone, danLaptop]) {
            if (pg === danLaptop) await danLaptop.reload({ waitUntil: "domcontentloaded" });
            await pg.getByRole("heading", { name: APPLICATION.leftTitle(term.programmeName), exact: true }).waitFor({ timeout: WAIT_MS });
            const said = await mainText(pg);
            let from = 0;
            for (const expected of card) {
              const at = said.indexOf(expected, from);
              assert.ok(at !== -1, `Dan's application page does not say ${JSON.stringify(expected)} where it should: ${said}`);
              from = at + expected.length;
            }
            assert.equal(
              await pg.getByRole("link", { name: APPLICATION.goToProgramme }).getAttribute("href"),
              learnPath(term),
              "Go to your programme does not lead to Dan's programme page",
            );
            for (const [what, words] of [
              ["that Dan told us they can't make it", "You’ve told us you can’t make it."],
              // Gone with the notes and reading list it pointed to.
              ["that Dan's notes are still there", APPLICATION.stillYours],
              ["a reply button", APPLICATION.cantMakeIt],
              ["Dan's reason", DAN_SAID],
            ]) {
              assert.ok(!said.includes(words), `Dan's application page shows ${what}: ${said}`);
            }
          }
          // And Dan's programme page is the page that says Dan left, and when,
          // and nothing else (until then it listed Dan's marks too).
          await danLaptop.goto(`${origin}${learnPath(term)}`, { waitUntil: "domcontentloaded" });
          await readLeftPage(danLaptop, term, dayLabel(leftKeyOf.get(dan.key)));
        },
      );

      await step(
        "the leaving email reaches each who left, word for word, and nobody else, and no email carries a reason or the meeting link",
        async () => {
          activePage = adminPage;
          // The feedback link is Course settings', the same for every leave:
          // the programme page's leave answers it, and the email asks for
          // feedback only when there is one.
          const feedbackUrl = feedbackOf.get(ben.key) ?? "";
          for (const person of [ben, dan]) {
            const mail = await mailTo(person.email, 2);
            assert.equal(mail.length, 2, `${person.first} has ${mail.length} emails`);
            const email = await readEmail(mail[1]);
            const expected = leavingEmail({
              first: person.first,
              courseTitle: term.courseTitle,
              runLabel: term.runLabel,
              feedback: Boolean(feedbackUrl),
            });
            assert.equal(email.subject, expected.subject, `${person.first}'s leaving email's subject`);
            assertSays(email, { who: `${person.first}'s leaving email`, sentences: expected.sentences });
            if (feedbackUrl) assert.ok(hrefUrls(email.html).includes(feedbackUrl), `${person.first}'s email does not link to the feedback form`);
          }
          // Nobody else: Ada and Cleo nothing, Fern and Ivy their approval.
          assert.deepEqual(
            await mailCounts(),
            { Ada: 0, Ben: 2, Cleo: 0, Dan: 2, Ivy: 1, Fern: 1 },
            "who was emailed",
          );

          // The send log, by address and by what each send was about.
          for (const [account, kinds] of [
            [ben, ["application", "course-enrolment"]],
            [dan, ["application", "course-enrolment"]],
            [ada, []],
            [cleo, []],
            [fern, ["application"]],
            [ivy, ["application"]],
          ]) {
            const logged = await waitFor(`${account.first}'s send rows`, async () => {
              const rows = await sendKindsTo(account.email);
              return rows.length >= kinds.length ? rows : null;
            });
            assert.deepEqual(logged, [...kinds].sort(), `${account.first}'s send rows`);
          }
          const aboutRun = (await fixtureQuery("emailSends").where("referenceId", "==", term.runId).get()).docs
            .map((doc) => String(doc.data()?.kind ?? ""))
            .sort();
          assert.deepEqual(aboutRun, ["course-enrolment", "course-enrolment"], "the sends about the run are not the two leaves");

          // Not one message carries either reason, or the meeting link or its host, in either part.
          const everything = [];
          for (const account of everybody) {
            for (const summary of await messagesTo(account.email)) everything.push(await readEmail(summary));
          }
          assert.equal(everything.length, 6, `the journey caused ${everything.length} emails`);
          for (const email of everything) {
            for (const [part, body] of [
              ["HTML", email.html],
              ["text", email.text],
            ]) {
              for (const [what, words] of [
                ["Ben's reason", BEN_SAID],
                ["Dan's reason", DAN_SAID],
                ["the meeting link", groupA.meetingUrl],
                ["the meeting link's host", linkHost],
              ]) {
                assert.ok(!body.includes(words), `${JSON.stringify(email.subject)}'s ${part} part carries ${what}`);
              }
            }
          }
        },
      );

      await step(
        "the facilitator's Home says who left, the group page lists both last with the day, and the register shows them read only with their marks",
        async () => {
          activePage = fernPage;
          await signIn(fernPage, fern);
          const staying = membersOf(groupA).filter((person) => !leftKeyOf.has(person.key));
          const leavers = membersOf(groupA).filter((person) => leftKeyOf.has(person.key));

          // Home says it first, a line for each who left, by name, until the
          // group's first session after they left is over (`leftLine`): next
          // week's, a day still to come.
          const summary = fernPage
            .waitForResponse(
              (r) => new URL(r.url()).pathname === `/api/courses/groups/${groupA.id}/summary` && r.request().method() === "GET",
              { timeout: WAIT_MS },
            )
            .catch((err) => err);
          await fernPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
          const summarised = await summary;
          if (summarised instanceof Error) throw summarised;
          await okBody(summarised, "Home's summary of the group");
          const notices = fernPage.getByRole("status").filter({ hasText: " left the programme on " });
          await notices.first().waitFor({ timeout: WAIT_MS });
          assert.deepEqual(
            await textsOf(notices),
            leavers.map(
              (person) =>
                `${person.first} left the programme on ${dayLabel(leftKeyOf.get(person.key))}. ` +
                `${person.first}’s off the register from ${dayLabel(nextSession.dateKey)}.`,
            ),
            "Home does not say who left the group",
          );
          for (const words of [BEN_SAID, DAN_SAID]) {
            assert.ok(!(await mainText(fernPage)).includes(words), `the facilitator's Home shows a reason somebody gave for leaving: ${words}`);
          }

          await fernPage.goto(`${origin}${groupPagePath}`, { waitUntil: "domcontentloaded" });
          await fernPage.getByRole("heading", { name: groupA.name, level: 1, exact: true }).waitFor({ timeout: WAIT_MS });
          assert.deepEqual(staying.map((person) => person.key), [ada.key], "the world's group A is not Ada staying");

          // Who is left to write to: the one still taking part.
          await fernPage
            .getByRole("link", { name: `Write to ${groupA.name} (${staying.length})`, exact: true })
            .waitFor({ timeout: WAIT_MS });
          await fernPage
            .getByText(`Posts an update to the group and emails 1 person. Replies go to ${SOCIETY}.`, { exact: true })
            .waitFor({ timeout: WAIT_MS });

          // Your group: Ada, then the two who left, last, each with the day and the marks they had.
          const roster = fernPage.getByTestId("group-roster");
          await roster.waitFor({ timeout: WAIT_MS });
          // The weeks its marks come from: every finished register's (`finishedWeeksWords`).
          await roster
            .getByText(`Weeks ${namesInWords(finishedWeeks.map(String))}`, { exact: true })
            .waitFor({ timeout: WAIT_MS });
          const rows = roster.getByRole("list", { name: "Members of this group" }).getByRole("listitem");
          assert.equal(await rows.count(), staying.length + leavers.length, "Your group does not list everybody who was in it");
          for (const [index, person] of [...staying, ...leavers].entries()) {
            const row = rows.nth(index);
            const left = leftKeyOf.has(person.key);
            await row.getByText(person.first, { exact: true }).waitFor({ timeout: WAIT_MS });
            assert.equal(
              await row.getByText(/^Left /).count(),
              left ? 1 : 0,
              `${person.first}'s row ${left ? "does not say" : "says"} they left`,
            );
            if (left) await row.getByText(leftLabelOf(person), { exact: true }).waitFor({ timeout: WAIT_MS });
            const marks = row.getByRole("img");
            assert.equal(await marks.count(), finishedWeeks.length, `${person.first}'s row has not one mark a finished register`);
            for (const weekNumber of finishedWeeks) {
              const mark = marks.nth(weekNumber - 1);
              assert.equal(await mark.getAttribute("aria-label"), `Week ${weekNumber}: ${MARK_WORD[markOf(person, weekNumber)]}`);
              assert.equal(await textOf(mark), MARK_LETTER[markOf(person, weekNumber)]);
            }
          }
          // Registers: each finished week, with how many came of the three it marked.
          const ending = await fetchAs(fernPage, `/api/courses/groups/${enc(groupA.id)}/attendance`);
          assert.equal(ending.status, 200, `the register's GET answered ${ending.status}`);
          const scheduled = ending.body?.ending?.scheduled === true;
          const registers = fernPage.getByRole("region", { name: "Registers", exact: true }).getByRole("listitem");
          assert.equal(await registers.count(), finishedWeeks.length, "the Registers card does not list each week so far");
          for (const weekNumber of finishedWeeks) {
            // Of everybody the register marked, the two who left included.
            const people = membersOf(groupA);
            const came = people.filter((person) => CAME.has(markOf(person, weekNumber))).length;
            assert.equal(
              flat(await registers.nth(weekNumber - 1).innerText()),
              [
                `Week ${weekNumber}`,
                dayLabel(sessionOf(groupA, weekNumber).dateKey).toUpperCase(),
                scheduled ? "Finished" : "Pushed",
                `${came} of ${people.length} came`,
                "See it",
              ].join(" "),
              `week ${weekNumber}'s register row`,
            );
          }
          const groupSaid = await mainText(fernPage);
          for (const words of [BEN_SAID, DAN_SAID]) {
            assert.ok(!groupSaid.includes(words), `the group page shows a reason somebody gave for leaving: ${words}`);
          }

          // The register: Ada's row, then the two who left, read only, with their marks.
          await fernPage.getByRole("link", { name: "Take the register", exact: true }).click();
          await fernPage.getByRole("heading", { name: `${groupA.name}’s register`, level: 1 }).waitFor({ timeout: WAIT_MS });
          const grid = fernPage.getByTestId("attendance-grid");
          await grid.waitFor({ timeout: WAIT_MS });
          const caption = await textOf(grid.locator("caption"));
          for (const expected of [
            `Attendance for ${groupA.name}`,
            `${staying.length} member, ${thisWeek} sessions so far.`,
            `${leavers.length} people who left the group are listed last, read only, with the marks they had.`,
          ]) {
            assert.ok(caption.includes(expected), `the register's caption does not say ${JSON.stringify(expected)}: ${caption}`);
          }
          for (const person of leavers) {
            const row = grid
              .getByRole("row")
              .filter({ has: fernPage.getByRole("rowheader", { name: headingOf(person) }) });
            await row.waitFor({ timeout: WAIT_MS });
            assert.deepEqual(
              await textsOf(row.getByRole("rowheader").locator(":scope > span")),
              [person.first, leftLabelOf(person)],
              `${person.first}'s row on the register does not say when they left`,
            );
            const cells = row.getByRole("img");
            const labels = [];
            for (let i = 0; i < (await cells.count()); i += 1) labels.push(await cells.nth(i).getAttribute("aria-label"));
            assert.deepEqual(
              labels,
              finishedWeeks.map(
                (weekNumber) => `${person.first}, week ${weekNumber}: ${MARK_WORD[markOf(person, weekNumber)]}. ${leftLabelOf(person)}.`,
              ),
              `${person.first}'s marks on the register`,
            );
            assert.equal(await row.getByRole("button").count(), 0, `${person.first}'s row on the register can be pressed`);
          }
          // Last, after everybody still taking part.
          const rowHeads = await textsOf(grid.locator("tbody").getByRole("rowheader"));
          assert.ok(headingOf(ada).test(rowHeads[0]), `the register does not list ${ada.first} first: ${JSON.stringify(rowHeads)}`);
          assert.deepEqual(
            rowHeads.slice(1).map((said) => leavers.find((person) => headingOf(person).test(said))?.key ?? said),
            leavers.map((person) => person.key),
            "the register does not list the two who left last",
          );
          // The register's own answer: the two as leavers with their marks, never as members.
          const register = await fetchAs(fernPage, `/api/courses/groups/${enc(groupA.id)}/attendance`);
          assert.deepEqual(register.body.members.map((member) => member.uid), [ada.uid], "the register's members are not Ada alone");
          assert.deepEqual(
            register.body.leavers.map((leaver) => [leaver.uid, leaver.displayName, leaver.left, leaver.records]),
            leavers.map((person) => [
              person.uid,
              person.first,
              leftLabelOf(person),
              Object.fromEntries(finishedWeeks.map((weekNumber) => [`w${String(weekNumber).padStart(2, "0")}`, markOf(person, weekNumber)])),
            ]),
            "the register's answer about the two who left",
          );
          for (const records of Object.values(register.body.records ?? {})) {
            for (const person of leavers) {
              assert.ok(!(person.uid in records), `the register counts ${person.first}'s marks as a member's`);
            }
          }
          const registerSaid = `${await mainText(fernPage)} ${JSON.stringify(register.body)}`;
          for (const words of [BEN_SAID, DAN_SAID]) {
            assert.ok(!registerSaid.includes(words), `the register shows a reason somebody gave for leaving: ${words}`);
          }
        },
      );

      await step("the lead's Overview quotes each reason, and the Applications tab gives neither", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase(term)}/overview`, { waitUntil: "domcontentloaded" });
        const attention = adminPage.getByRole("region", { name: "Needs attention", exact: true });
        await attention.waitFor({ timeout: WAIT_MS });
        const items = attention.getByRole("listitem");
        await items.first().waitFor({ timeout: WAIT_MS });
        const listed = [];
        for (let i = 0; i < (await items.count()); i += 1) {
          const lines = items.nth(i).locator("p");
          listed.push([await textOf(lines.first()), (await lines.count()) > 1 ? await textOf(lines.nth(1)) : ""]);
        }
        // Somebody who left, the most recent first (`buildProgrammeOverview`),
        // each with what they said and the week they are off the register
        // from: the first session of their group's after they left. Nothing
        // else needs attention: every register is finished, nobody missed two
        // in a row, and the week the groups reach next is published.
        const said = new Map([
          [ben.key, BEN_SAID],
          [dan.key, DAN_SAID],
        ]);
        const leavers = membersOf(groupA)
          .filter((person) => leftKeyOf.has(person.key))
          .sort((a, b) => leftKeyOf.get(b.key).localeCompare(leftKeyOf.get(a.key)));
        // Each card names them by the names rule for the admin, in full; its sentences by the name they go by.
        assert.deepEqual(
          listed,
          leavers.map((person) => [
            `${person.displayName} left on ${dayLabel(leftKeyOf.get(person.key))}`,
            `${person.first} said: “${said.get(person.key)}” ${person.first}’s off ${groupA.name}’s register from week ${nextWeek}.`,
          ]),
          "Needs attention does not quote each who left",
        );
        assert.equal(await textOf(attention.locator("h2 + span")), String(leavers.length), "Needs attention's count is not its items");
        const people = await textOf(adminPage.getByRole("region", { name: "People", exact: true }));
        for (const expected of [`${term.people.length - leavers.length} taking part`, `${leavers.length} left. Places can’t be offered after week 1.`]) {
          assert.ok(people.includes(expected), `the People card does not say ${JSON.stringify(expected)}: ${people}`);
        }

        // The Applications tab: the two gave their place back by leaving, and
        // it says what they pressed, never why.
        await adminPage.goto(`${formBase(term)}/applications`, { waitUntil: "domcontentloaded" });
        const table = adminPage.locator("main table");
        await table.waitFor({ timeout: WAIT_MS });
        for (const person of term.people) {
          const row = table.locator("tr").filter({ has: adminPage.getByRole("link", { name: person.displayName, exact: true }) });
          await row.waitFor({ timeout: WAIT_MS });
          const status = await textsOf(row.locator('td[data-label="Status"] span, td[data-label="Status"] div'));
          if (leftKeyOf.has(person.key)) {
            for (const expected of ["Withdrawn", "Was accepted", "Said “I can’t make it”", "No reason given"]) {
              assert.ok(status.includes(expected), `${person.first}'s row does not say ${JSON.stringify(expected)}: ${JSON.stringify(status)}`);
            }
          } else {
            assert.ok(!status.includes("Withdrawn"), `${person.first}'s row says they withdrew: ${JSON.stringify(status)}`);
          }
        }
        const applicationsSaid = await mainText(adminPage);
        for (const words of [BEN_SAID, DAN_SAID]) {
          assert.ok(!applicationsSaid.includes(words), `the Applications tab shows a reason somebody gave for leaving: ${words}`);
        }
      });

      await step("the lead's Settings tab counts the places given back, and lists the two who left apart, with nothing to do", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase(term)}/setup`, { waitUntil: "domcontentloaded" });
        const panel = adminPage.getByRole("region", { name: "Course run" });
        await panel.waitFor({ timeout: WAIT_MS });
        // The places on the form, two fewer: Ada and Cleo hold theirs, and both
        // are on the run's list.
        const holding = term.people.filter((person) => !leftKeyOf.has(person.key));
        await panel
          .getByText(`${holding.length} people hold a place on ${term.programmeName}, and all of them are on the run’s list.`, {
            exact: true,
          })
          .waitFor({ timeout: WAIT_MS });
        await panel.getByRole("button", { name: "Hand over anybody new", exact: true }).waitFor({ timeout: WAIT_MS });
        // The two who left, named apart as having left, each a link to their
        // application, by name.
        const leavers = term.people
          .filter((person) => leftKeyOf.has(person.key))
          .sort((a, b) => a.displayName.localeCompare(b.displayName, "en") || a.uid.localeCompare(b.uid));
        const group = panel.getByText(`Left the programme (${leavers.length})`, { exact: true }).locator("xpath=..");
        await group.waitFor({ timeout: WAIT_MS });
        assert.deepEqual(
          await textsOf(group.getByRole("link")),
          leavers.map((person) => person.displayName),
          "the panel does not name the two who left under Left the programme",
        );
        // CHANGED 25 Oct 2026, with the fix this spec found: the panel read
        // the run's own list and who holds a place, never the seat, so a
        // leaver was listed under "No longer hold a place" and the lead was
        // told to Remove them, which the board does not offer and Remove
        // refuses for a seat that left. The panel's loader now reads each such
        // person's seat by its id and lists a seat that left apart, with
        // nothing to do. So the check holds the new words whole, and that
        // neither the old list nor its advice is drawn for anybody here.
        assert.equal(
          await textOf(panel.locator("p").filter({ hasText: "They left by themselves" })),
          "They left by themselves, so their seat is free and their place is given back. There’s nothing to do.",
          "the panel's words for people who left",
        );
        assert.equal(
          await panel.getByText(/^No longer hold a place \(/).count(),
          0,
          "the panel still lists people who left under No longer hold a place",
        );
        assert.equal(
          await panel.locator("p").filter({ hasText: "They gave their place back after they were handed over" }).count(),
          0,
          "the panel still tells the lead to Remove somebody who left",
        );
      });

      await step("the lead's Attendance grid and its CSV say each left and on which day, with the marks they had", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase(term)}/attendance`, { waitUntil: "domcontentloaded" });
        const grid = adminPage.getByRole("region", { name: "Attendance grid" });
        await grid.waitFor({ timeout: WAIT_MS });
        /** One person's cells as the grid tells assistive technology (`cellWords`), from the plan. */
        const cellsSaid = (person) =>
          weeks.map((weekNumber) => {
            const mark = weekNumber <= thisWeek ? markOf(person, weekNumber) : null;
            const left = leftKeyOf.has(person.key);
            const what = mark
              ? `${MARK_WORD[mark]}${left ? ", before they left" : ""}`
              : left
                ? "after they left"
                : "not yet";
            return `${person.displayName}, week ${weekNumber}: ${what}`;
          });
        const cameOf = (person) => {
          const marks = finishedWeeks.map((weekNumber) => markOf(person, weekNumber));
          return { came: marks.filter((mark) => CAME.has(mark)).length, of: marks.length };
        };
        for (const group of ordered) {
          for (const person of membersOf(group)) {
            const row = grid.getByRole("row").filter({
              has: adminPage.getByRole("rowheader", { name: adminHeadingOf(person) }),
            });
            await row.waitFor({ timeout: WAIT_MS });
            const marks = row.getByRole("img");
            const said = [];
            for (let i = 0; i < (await marks.count()); i += 1) said.push(await marks.nth(i).getAttribute("aria-label"));
            assert.deepEqual(said, cellsSaid(person), `${person.first}'s row of marks`);
            const { came, of } = cameOf(person);
            assert.equal(await textOf(row.locator("td").last()), `${came} of ${of}`, `${person.first}'s Came`);
            const header = row.getByRole("rowheader");
            await header.getByText(person.displayName, { exact: true }).waitFor({ timeout: WAIT_MS });
            if (leftKeyOf.has(person.key)) {
              await header.getByText(leftLabelOf(person), { exact: true }).waitFor({ timeout: WAIT_MS });
            } else {
              assert.equal(await header.getByText(/^Left/).count(), 0, `${person.first}'s row says they left`);
            }
          }
        }
        const gridSaid = await mainText(adminPage);
        for (const words of [BEN_SAID, DAN_SAID]) {
          assert.ok(!gridSaid.includes(words), `the Attendance tab shows a reason somebody gave for leaving: ${words}`);
        }

        // The CSV: the grid as a spreadsheet, the day each left in its Left column.
        const before = londonDateKey(new Date());
        const [response, download] = await Promise.all([
          responseTo(adminPage, "/attendance/export", "POST"),
          adminPage.waitForEvent("download", { timeout: WAIT_MS }),
          adminPage.getByRole("button", { name: "Download CSV", exact: true }).click(),
        ]);
        assert.ok(response.ok(), `Download CSV answered ${response.status()}`);
        const csv = readFileSync(await download.path(), "utf8");
        const after = londonDateKey(new Date());
        const header = ["Group", "Name", ...weeks.map((weekNumber) => `Week ${weekNumber}`), "Came", "Of", "Left"];
        const rows = [];
        for (const group of ordered) {
          for (const person of membersOf(group)) {
            const { came, of } = cameOf(person);
            rows.push([
              group.name,
              person.displayName,
              ...weeks.map((weekNumber) => (weekNumber <= thisWeek ? MARK_WORD[markOf(person, weekNumber)] : "")),
              came,
              of,
              leftKeyOf.get(person.key) ?? "",
            ]);
          }
        }
        assert.equal(csv, `﻿${header.join(",")}\n${rows.map((row) => row.join(",")).join("\n")}`, "the CSV is not the grid");
        for (const words of [BEN_SAID, DAN_SAID]) {
          assert.ok(!csv.includes(words), `the CSV carries a reason somebody gave for leaving: ${words}`);
        }
        const slug = term.programmeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        assert.ok(
          [before, after].some((day) => download.suggestedFilename() === `attendance-${slug}-${day}.csv`),
          `the file is called ${JSON.stringify(download.suggestedFilename())}`,
        );
        const logged = (await fixtureQuery("dataExports").where("scope.runId", "==", term.runId).get()).docs.map((doc) => doc.data());
        assert.deepEqual(
          logged.map((row) => [row.kind, row.rowCount]),
          [["register", rows.length]],
          "the download was not logged once, with every row",
        );
      });

      await step("the allocation board counts both as left, Remove refuses them with the day they left, and Publish owes them nothing", async () => {
        activePage = adminPage;
        const [answered] = await Promise.all([
          responseTo(adminPage, `/runs/${term.runId}/allocation`, "GET"),
          adminPage.goto(`${origin}/admin/courses/${enc(term.courseId)}/runs/${enc(term.runId)}/allocation`, {
            waitUntil: "domcontentloaded",
          }),
        ]);
        await okBody(answered, "The allocation board");
        await adminPage.getByRole("button", { name: "Refresh", exact: true }).waitFor({ timeout: WAIT_MS });
        await waitFor("the board to finish reading", async () => adminPage.getByRole("button", { name: "Refresh", exact: true }).isEnabled());
        const leavers = term.people.filter((person) => leftKeyOf.has(person.key));
        const staying = term.people.filter((person) => !leftKeyOf.has(person.key));
        // The rail: everybody on the run's list accepted, the two who left
        // counted as having left, never as somebody to place.
        await adminPage
          .getByText(
            `${term.people.length} accepted · ${staying.length} placed · 0 unallocated · ${leavers.length} left`,
            { exact: true },
          )
          .waitFor({ timeout: WAIT_MS });
        await adminPage
          .getByText(
            `All ${staying.length} accepted applicants are placed, and ${leavers.length} have left. No one is in two groups.`,
            { exact: true },
          )
          .waitFor({ timeout: WAIT_MS });
        // Each card that left says so, and offers no Remove; a card still on
        // the run does. A card is found from its drag handle, named for the
        // person (the board names people by the name they go by), up to the
        // nearest element that also holds that name: the card itself.
        const cardOf = (person) =>
          adminPage
            .getByRole("button", { name: `Drag ${person.first} to another group`, exact: true })
            .locator(`xpath=ancestor::*[.//span[normalize-space(.)='${person.first}']][1]`);
        for (const person of term.people) {
          const card = cardOf(person);
          await card.waitFor({ timeout: WAIT_MS });
          const left = leftKeyOf.has(person.key);
          assert.equal(await card.getByText("Withdrawn", { exact: true }).count(), left ? 1 : 0, `${person.first}'s card and Withdrawn`);
          // Leaving gave their place on the form back too, and their card says
          // so (`gaveTheirPlaceBack`, the card's and Publish's one answer),
          // which warns anybody about to put them back in a group.
          assert.equal(
            await card.getByText("Gave their place back", { exact: true }).count(),
            left ? 1 : 0,
            `${person.first}'s card and Gave their place back`,
          );
          assert.equal(
            await card.getByRole("button", { name: "Remove", exact: true }).count(),
            left ? 0 : 1,
            `${person.first}'s card ${left ? "offers" : "does not offer"} Remove`,
          );
        }
        // And Remove itself, sent for each who left as a board left open from
        // before they left would send it, is refused with the day they left,
        // and writes nothing: their seat is already free.
        for (const person of leavers) {
          const before = await placeOf(term, person);
          const answer = await fetchAs(
            adminPage,
            `/api/courses/runs/${enc(term.runId)}/enrolments/${enc(person.uid)}/remove`,
            { method: "POST" },
          );
          assert.deepEqual(
            [answer.status, answer.body?.error],
            [409, `They left on ${dayLabel(leftKeyOf.get(person.key))}, so their seat is already free and there’s nothing to remove.`],
            `Remove for ${person.first}, who left`,
          );
          const after = await placeOf(term, person);
          assert.deepEqual(
            [after?.status, after?.dropOutReason, instantOf(after?.droppedOutAt)?.getTime()],
            [before?.status, before?.dropOutReason, instantOf(before?.droppedOutAt)?.getTime()],
            `a refused Remove changed ${person.first}'s place`,
          );
        }
        // Publish: nobody placed is owed an email (everybody still in a group
        // was told before the start, and the two who left are owed nothing);
        // the one email still owed is Fern's, appointed after Publish. Its
        // heading is who a press would reach (`publishAudienceLine`).
        await adminPage
          .locator('section[aria-labelledby="allocation-publish-title"]')
          .getByRole("heading", { level: 3, name: "1 facilitator", exact: true })
          .waitFor({ timeout: WAIT_MS });
        for (const person of leavers) {
          const place = await placeOf(term, person);
          assert.equal(place?.status, "withdrawn", `opening the board changed ${person.first}'s place`);
        }
      });

      await step("the two who left can no longer read their group or open its pages", async () => {
        for (const [person, pg] of [
          [ben, benPage],
          [dan, danLaptop ?? danPhone],
        ]) {
          activePage = pg;
          // The reads that drew their group on their programme page (the run,
          // its updates, the group's names) refuse them now.
          for (const path of groupReads) {
            const answer = await fetchAs(pg, path);
            assert.equal(answer.status, 403, `${path} answered ${person.first} ${answer.status} after they left`);
          }
          // The group's own page and its register, a facilitator's, send them
          // to the page that says they left, and show nothing of the group on the way.
          for (const path of [groupPagePath, `${groupPagePath}/register`]) {
            await pg.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
            await pg
              .getByRole("heading", { level: 1, name: LEAVING.leftHeading(term.programmeName), exact: true })
              .waitFor({ timeout: WAIT_MS });
            assert.equal(new URL(pg.url()).pathname, learnPath(term), `${person.first} was not sent from ${path} to the page that says they left`);
          }
        }
      });

      await step("after the run's last session neither door offers leaving, and a press is refused in leaving's words", async () => {
        activePage = adminPage;
        const group = ended.groups[0];
        // The run's last session is over, by its own calendar.
        const lastEnds = sessionOf(group, ended.weekCount).endsAt;
        assert.ok(lastEnds.getTime() < Date.now(), "the run past its end has a session still to come");
        // The admin names it on its programme's Settings tab and hands Ivy over,
        // so Ivy's place is one the form gave, as Ben's and Dan's were.
        await adminPage.goto(`${formBase(ended)}/setup`, { waitUntil: "domcontentloaded" });
        const panel = adminPage.getByRole("region", { name: "Course run" });
        const runBox = panel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [named] = await Promise.all([
          responseTo(adminPage, `/programmes/${ended.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${ended.runLabel} · Running` }),
        ]);
        assert.equal((await okBody(named, "Naming the run past its end")).changed, true, "naming the run past its end changed nothing");
        const [handOver] = await Promise.all([
          responseTo(adminPage, "/run/hand-over", "POST"),
          panel.getByRole("button", { name: "Hand over 1 person", exact: true }).click(),
        ]);
        assert.deepEqual((await okBody(handOver, "Handing over")).receipt, { handedOver: 1, alreadyThere: 0 }, "the hand-over's receipt");

        activePage = ivyPage;
        await signIn(ivyPage, ivy);
        // Ivy's programme page says the programme has ended, and offers no way
        // out. Board en-after-nofinish-phone: the programme's name, then the
        // thanks with the term and Ivy's group (Ivy finished nothing: no rule
        // was set), never that Ivy did not finish.
        await ivyPage.goto(`${origin}${learnPath(ended)}`, { waitUntil: "domcontentloaded" });
        const head = ivyPage.locator("main header");
        await head.getByText(`${ended.programmeName} has ended.`, { exact: true }).waitFor({ timeout: WAIT_MS });
        await head
          .getByText(`Thanks for being part of it. ${ended.runLabel} · ${group.name}.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        assert.equal(await ivyPage.getByRole("link", { name: LEAVING.link }).count(), 0, "Ivy's programme page still offers Leave the programme");
        // The confirmation's address sends Ivy back to it.
        await ivyPage.goto(`${origin}${learnPath(ended)}/leave`, { waitUntil: "domcontentloaded" });
        await ivyPage.locator("main header").getByText(`${ended.programmeName} has ended.`, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(new URL(ivyPage.url()).pathname, learnPath(ended), "the confirmation opened after the run's end");
        // The press the confirmation would send, title typed right, is
        // refused in leaving's own words, which that page would show.
        const leave = await fetchAs(ivyPage, leaveRoute(ended), jsonInit("DELETE", { confirmName: ended.courseTitle, reason: null }));
        assert.deepEqual([leave.status, leave.body?.error], [409, LEAVING.ended(ended.courseTitle)], "a leave after the end was not refused");

        // Ivy's application page: in the group, the way to the programme's page,
        // and no "Changed your mind?": giving the place back is over too.
        await ivyPage.goto(applicationUrl(ended), { waitUntil: "domcontentloaded" });
        await ivyPage.getByText(APPLICATION.inGroup(group.name), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(
          await ivyPage.getByRole("link", { name: APPLICATION.goToProgramme }).getAttribute("href"),
          learnPath(ended),
          "Go to your programme does not lead to Ivy's programme page",
        );
        const applicationSaid = await mainText(ivyPage);
        assert.ok(!applicationSaid.includes("Changed your mind?"), `Ivy's application page offers a way to change one's mind: ${applicationSaid}`);
        assert.equal(await ivyPage.getByRole("button", { name: APPLICATION.cantMakeIt }).count(), 0, "Ivy's application page offers I can’t make it");
        // The reply the page's buttons send is refused in the same words.
        const reply = await fetchAs(
          ivyPage,
          replyRoute(ended),
          jsonInit("POST", { reply: "cant-make-it", reason: { kind: "times", other: "" } }),
        );
        assert.deepEqual([reply.status, reply.body?.error], [409, LEAVING.ended(ended.courseTitle)], "I can’t make it after the end was not refused");

        // Nothing was written, and nobody was emailed.
        assert.equal((await placeOf(ended, ivy))?.status, "active", "a refused leave took Ivy off the run");
        assert.equal((await applicationOf(ended, ivy))?.status, "accepted", "a refused reply gave Ivy's place back");
        assert.deepEqual(
          [(await formCountsOf(ended))?.accepted, (await formCountsOf(ended))?.withdrawn],
          [1, 0],
          "a refused leave moved the form's places",
        );
        assert.equal((await messagesTo(ivy.email)).length, 1, "a refused leave emailed Ivy");
        const logged = (await fixtureQuery("courseAudit").where("runId", "==", ended.runId).get()).docs
          .map((doc) => doc.data())
          .filter((row) => row.kind === "enrolment-dropout");
        assert.equal(logged.length, 0, "a refused leave was logged");
      });
    } finally {
      const contexts = [benContext, danContext, fernContext, ivyContext, context];
      await Promise.allSettled(contexts.map((each) => each.close()));
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
