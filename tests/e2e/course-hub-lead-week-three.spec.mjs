/**
 * The lead's week three, end to end, in a real browser: the course hub's
 * second spec.
 *
 * The term T1 stands on, three weeks after its run began
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "week-three") ->
 * the admin approves the two members who sign in and the facilitator ->
 * names the running run on the programme's Settings tab and hands its people
 * over -> appoints Fern to Group B, whose week 3 register was saved and not
 * finished -> the Overview: the week, this week's sessions and their
 * registers, what needs attention, the newest update -> Remind emails Fern,
 * once, with the count on its button -> the Attendance tab's grid -> its CSV,
 * through the download log -> Messages: an update to Group A, a test to the
 * admin first, then posted and emailed to the count on its button -> a member
 * of Group A reads it on their programme page, a member of Group B does not
 * -> every email is in the send log and none carries the meeting link.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-lead-week-three
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: "Send a test to me"
 * emails the admin's own address, which the harness does not own.
 *
 * ## Every expected word comes from the seed's clock and the world's plan
 *
 * Dates, times, counts and names are worked out here from the state file and
 * the world's constants (`WEEK_THREE`, `EARLIER_UPDATE`), by the rules of the
 * screens restated beside each check, never written as a calendar date. The
 * three words a target's settings decide (whether a register is "finished"
 * or "pushed", and whether the reminder and the task are on, with their
 * hours) are read once from the register's own GET, as register-push reads
 * its ending, and the checks follow them.
 *
 * ## The admin's name
 *
 * An update's email and lists name its writer, the admin the harness is
 * given. The spec reads that account's name to check the words, and never
 * prints it: every message that could quote it says "<the admin's name>".
 *
 * ## Three identities, three browser contexts
 *
 * The admin (the programme's lead here), Ada in Group A and Cleo in Group B,
 * each in their own context. CHROMIUM ONLY: a green run is a regression net,
 * never a substitute for the manual Safari pass.
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
  fixtureDoc,
  fixtureQuery,
  mailIsCaught,
  markerPath,
  readState,
  registerReminderMarkerDoc,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-lead-week-three.mjs";
import {
  EARLIER_UPDATE,
  WEEK_THREE,
  compareGroupsByMeeting,
  dayLabel,
  dayMonthLabel,
  groupsInWords,
  londonClockLabel,
  londonDateKey,
  londonDayAndClock,
  londonDayLabel,
  namesInWords,
  sessionOf,
  shiftDateKey,
  slotLine,
  weekDocId,
  weekSpanLabel,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** The update the lead writes to one group. Typed on the page, as a lead would. */
const UPDATE = Object.freeze({
  title: "Week 3 notes for your group",
  message: "We meet in the same room at the usual time.\n\nBring one question from the week 3 reading.",
});

/** `ATTENDANCE_STATUS_LABEL` in src/lib/firestore/courseAttendance.ts. */
const MARK_WORD = Object.freeze({
  present: "Present",
  late: "Late",
  "left-early": "Left early",
  absent: "Absent",
  excused: "Excused",
});

/** Present, late and left early count as came, as the board says. */
const CAME = new Set(["present", "late", "left-early"]);

/** `ABSENT_IN_A_ROW` in src/lib/courses/programmeAttendance.ts. */
const ABSENT_IN_A_ROW = 2;

/** Every email's last line (`EmailChrome`). */
const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";

/** Where a reply to an update goes (`UPDATE_REPLY_TO`). */
const REPLY_TO = "ai-safety@uonsu.com";

/** What stands for the admin's name in anything this file prints. */
const ADMIN_NAME_SHOWN = "<the admin's name>";

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

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an " +
        "admin's, and this harness cannot create an admin."
      : state.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, the test of the update to the admin included, so it " +
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
 * which is the text as CSS shows it. The site sets its labels in capitals with
 * CSS ("THIS WEEK", "WEEK 1"), and the words are the record's, not the look's.
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
    links: hrefUrls(message.HTML ?? ""),
    text: message.Text ?? "",
    html: message.HTML ?? "",
    replyTo: (message.ReplyTo ?? []).map((entry) => String(entry.Address ?? "").toLowerCase()),
  };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: the lead's week three, from the Overview to an update read by one group",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const fern = state.facilitator;
    const groupOf = (key) => state.groups.find((group) => group.key === key);
    const placeOf = (person) => groupOf(person.groupKey);
    /** The one order every tab lists the groups in (People in groups' columns). */
    const ordered = [...state.groups].sort(compareGroupsByMeeting);
    /** The group whose week 3 register was saved and not finished, and whose facilitator is appointed. */
    const unfinishedGroup = groupOf(WEEK_THREE.unfinished.group);
    const facilitatedGroup = groupOf(WEEK_THREE.facilitated);
    /** The update goes to the group with the meeting link, so "never in an email" has teeth. */
    const updateGroup = state.groups.find((group) => group.meetingUrl);
    const otherGroup = state.groups.find((group) => group !== updateGroup);
    const reader = state.people.find((person) => person.groupKey === updateGroup.key);
    const notReader = state.people.find((person) => person.groupKey === otherGroup.key);
    assert.ok(updateGroup && reader && notReader, "the term has no group with a meeting link and a member in each group");
    assert.equal(facilitatedGroup, unfinishedGroup, "the facilitator is appointed to another group than the unfinished register's");

    /**
     * A group's people, in the grid's order: the names it shows, then uid.
     * The lead's tabs, read here by the admin, name people by the names rule
     * (`nameForViewer`): the full name, which for this term's fixtures is the
     * account's display name, unique to this run.
     */
    const membersOf = (group) =>
      state.people
        .filter((person) => person.groupKey === group.key)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "en-GB") || a.uid.localeCompare(b.uid));
    const markOf = (person, weekNumber) => WEEK_THREE.marks[person.groupKey]?.[weekNumber]?.[person.key] ?? null;
    const hasRegister = (group, weekNumber) => Boolean(WEEK_THREE.marks[group.key]?.[weekNumber]);
    const isFinished = (group, weekNumber) =>
      hasRegister(group, weekNumber) &&
      !(WEEK_THREE.unfinished.group === group.key && WEEK_THREE.unfinished.weekNumber === weekNumber);
    const weeks = Array.from({ length: state.weekCount }, (_, i) => i + 1);

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    /** The programme's own path, as the server builds the tabs' links. */
    const programmePathOnSite = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const setupUrl = `${formBase}/setup`;
    const facilitatorsUrl = `${formBase}/groups/facilitators`;
    const overviewUrl = `${formBase}/overview`;
    const attendanceUrl = `${formBase}/attendance`;
    const messagesUrl = `${formBase}/messages`;
    const learnPath = `/learn/${enc(state.runId)}`;
    const groupPagePath = (group) => `${learnPath}/group/${enc(group.id)}`;

    // The run's week, by its own calendar: the world promises week 3.
    const elapsedDays = Math.round(
      (Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${state.startDate}T00:00:00Z`)) / 86_400_000,
    );
    const thisWeek = Math.floor(elapsedDays / 7) + 1;
    assert.equal(thisWeek, 3, `the term is in week ${thisWeek}, not week 3: the seed and this run are ${elapsedDays} days from its start`);
    const slotStartKey = shiftDateKey(state.startDate, 7 * (thisWeek - 1));

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: readerContext, page: readerPage } = await newIdentityPage(browser);
    const { context: otherContext, page: otherPage } = await newIdentityPage(browser);

    /**
     * Which page a failed step photographs. The recorder takes one page and
     * this spec drives three, so each step names its page first.
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
    await stubRecaptchaOnLoopback(readerPage, origin);
    await stubRecaptchaOnLoopback(otherPage, origin);
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

    // ---- The admin's name, read once and never printed ------------------------

    /** `memberNameOf` in src/lib/email/courseFacilitatorEmails.ts: preferred, then account name. */
    let adminName = "";
    /** Its first word, which the lists show as an update's writer ("Rahul → Group B"). */
    const adminFirst = () => adminName.split(/\s+/)[0];
    /**
     * Hides the admin's name in anything a failure prints: the whole name, and
     * its first word where a list shows it as the writer of an update.
     */
    const shown = (text) => {
      if (!adminName) return String(text);
      return String(text)
        .split(adminName)
        .join(ADMIN_NAME_SHOWN)
        .split(`${adminFirst()} → `)
        .join(`${ADMIN_NAME_SHOWN} → `)
        .split(`${adminFirst()} · to `)
        .join(`${ADMIN_NAME_SHOWN} · to `);
    };
    /** `assert.equal`, saying what it saw without the admin's name. */
    const sameAs = (actual, expected, what) => {
      if (actual !== expected) {
        assert.fail(`${what}: the page says ${JSON.stringify(shown(actual))}, not ${JSON.stringify(shown(expected))}`);
      }
    };

    // ---- What the registers' rules make of the plan, restated ------------------

    /** A group's session in one week, with what the clock says of it now. */
    function sessionNow(group, weekNumber, now = new Date()) {
      const session = sessionOf(group, weekNumber);
      return {
        ...session,
        started: session.startsAt.getTime() <= now.getTime(),
        ended: session.endsAt.getTime() <= now.getTime(),
      };
    }

    /** One person's cells, week by week, as `personRow` in src/lib/courses/programmeAttendance.ts builds them. */
    function cellsOf(person, now = new Date()) {
      const group = placeOf(person);
      const todayKey = londonDateKey(now);
      return weeks.map((weekNumber) => {
        const session = sessionNow(group, weekNumber, now);
        const mark = markOf(person, weekNumber);
        if (mark) return { weekNumber, mark, saved: !isFinished(group, weekNumber), happened: session.started };
        const today = session.dateKey === todayKey && !session.ended;
        return { weekNumber, mark: null, saved: false, happened: session.started, today };
      });
    }

    /** "Came" and "Of": marks on registers of sessions that have started. */
    function cameOf(person, now = new Date()) {
      let came = 0;
      let of = 0;
      for (const cell of cellsOf(person, now)) {
        if (!cell.mark || !cell.happened) continue;
        of += 1;
        if (CAME.has(cell.mark)) came += 1;
      }
      return { came, of };
    }

    /** The latest run of absences over marked sessions that happened: `absentWeeks`, or [] under two. */
    function absentRun(person, now = new Date()) {
      const run = [];
      for (const cell of [...cellsOf(person, now)].reverse()) {
        if (!cell.mark || !cell.happened) continue;
        if (cell.mark !== "absent") break;
        run.unshift(cell.weekNumber);
      }
      return run.length >= ABSENT_IN_A_ROW ? run : [];
    }

    /** One week's figure over some groups: `weekTotal` in src/lib/courses/programmeAttendance.ts. */
    function weekTotal(groups, weekNumber, now = new Date()) {
      let came = 0;
      let of = 0;
      let soFar = false;
      const from = [];
      for (const group of groups) {
        if (!isFinished(group, weekNumber)) soFar = true;
        if (!sessionNow(group, weekNumber, now).started) continue;
        let counted = 0;
        for (const person of membersOf(group)) {
          const mark = markOf(person, weekNumber);
          if (!mark) continue;
          counted += 1;
          if (CAME.has(mark)) came += 1;
        }
        if (counted > 0) {
          of += counted;
          from.push(group.name);
        }
      }
      const percent = of > 0 ? Math.round((came * 100) / of) : null;
      return { weekNumber, percent, came, of, soFar: percent !== null && soFar, from };
    }

    /** What the target's settings make the register's ending, read off the register's own GET. */
    let ending = null;
    /** "finished" or "pushed". */
    const word = () => (ending.scheduled ? "finished" : "pushed");

    async function readEnding(group) {
      const answer = await adminPage.evaluate(async (groupId) => {
        const res = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/attendance`);
        return { status: res.status, body: await res.json().catch(() => null) };
      }, group.id);
      assert.equal(answer.status, 200, `the register's GET answered ${answer.status}: ${JSON.stringify(answer.body)}`);
      assert.ok(answer.body?.ending, "the register's GET carries no ending");
      return answer.body.ending;
    }

    /** "You and admins" is for the lead; this programme names none, so the task is "admins". */
    const TASK_PEOPLE = "admins";

    /**
     * What the Overview says will happen to the unfinished register:
     * `chaseDetail` in src/lib/courses/programmeOverview.ts, from the
     * switches and hours the register's GET reported.
     */
    function chaseDetail(reminded, now = new Date()) {
      const { endsAt } = sessionOf(unfinishedGroup, WEEK_THREE.unfinished.weekNumber);
      const sentences = [];
      if (reminded) {
        sentences.push(reminded);
      } else if (ending.reminder) {
        const at = new Date(endsAt.getTime() + ending.reminder.hours * 3_600_000);
        if (at.getTime() > now.getTime()) sentences.push(`We’ll remind ${fern.first} on ${londonDayAndClock(at)}.`);
      }
      if (ending.task) {
        const at = new Date(endsAt.getTime() + ending.task.hours * 3_600_000);
        sentences.push(
          at.getTime() > now.getTime()
            ? `If it’s still not ${word()} on ${londonDayAndClock(at)}, ${TASK_PEOPLE} get a task.`
            : `${TASK_PEOPLE[0].toUpperCase()}${TASK_PEOPLE.slice(1)} have a task for it.`,
        );
      }
      return sentences.join(" ");
    }

    /** Everything the Overview's "Needs attention" lists, in its order, as [title, detail]. */
    function attentionItems(reminded, now = new Date()) {
      const items = [];
      for (const group of ordered) {
        for (const person of membersOf(group)) {
          const run = absentRun(person, now);
          if (run.length === 0) continue;
          items.push([
            `${person.displayName} has missed ${run.length} sessions in a row without saying`,
            `${group.name} · weeks ${namesInWords(run.map(String))}`,
          ]);
        }
      }
      const reached = new Map();
      for (const group of ordered) {
        const sessions = weeks.map((weekNumber) => sessionNow(group, weekNumber, now));
        const nextAt = sessions.findIndex((session) => !session.started);
        if (nextAt <= 0) continue;
        const previous = sessions[nextAt - 1];
        const next = sessions[nextAt];
        if (!previous.ended || next.weekNumber <= WEEK_THREE.published) continue;
        const found = reached.get(next.weekNumber) ?? { names: [], lastKey: "", nextKey: "" };
        found.names.push(group.name);
        if (!found.lastKey || previous.dateKey < found.lastKey) found.lastKey = previous.dateKey;
        if (!found.nextKey || next.dateKey < found.nextKey) found.nextKey = next.dateKey;
        reached.set(next.weekNumber, found);
      }
      for (const [weekNumber, found] of [...reached].sort((a, b) => a[0] - b[0])) {
        const who = groupsInWords(found.names);
        const one = found.names.length === 1;
        items.push([
          `Week ${weekNumber} isn’t ready, and ${who} ${one ? "has" : "have"} reached it`,
          one
            ? `${who} met on ${dayLabel(found.lastKey)} and meets again on ${dayLabel(found.nextKey)}. Week ${weekNumber} isn’t published, so people in the group can’t open it yet.`
            : `${who} meet again from ${dayLabel(found.nextKey)}. Week ${weekNumber} isn’t published, so people in these groups can’t open it yet.`,
        ]);
      }
      for (const group of ordered) {
        for (const weekNumber of weeks) {
          const session = sessionNow(group, weekNumber, now);
          // Ended and not finished, a register saved or none at all (`tag === "not-finished"`).
          if (isFinished(group, weekNumber) || !session.ended) continue;
          items.push([
            `${group.name}’s register for ${dayLabel(session.dateKey)} isn’t ${word()}`,
            chaseDetail(group === unfinishedGroup ? reminded : null, now),
          ]);
        }
      }
      return items;
    }

    // ---- The Overview ------------------------------------------------------------

    const overviewRegion = (name) => adminPage.getByRole("region", { name, exact: true });

    /** Reads every "Needs attention" item as [title, detail], in the page's order. */
    async function readAttention() {
      const items = overviewRegion("Needs attention").getByRole("listitem");
      const out = [];
      for (let i = 0; i < (await items.count()); i += 1) {
        const item = items.nth(i);
        const lines = item.locator("p");
        const title = await textOf(lines.first());
        const detail = (await lines.count()) > 1 ? await textOf(lines.nth(1)) : "";
        out.push([title, detail]);
      }
      return out;
    }

    /** The Overview's (or the Messages tab's) list of updates, as [title, line]. */
    async function readOverviewUpdates() {
      const items = overviewRegion("Updates").getByRole("listitem");
      const out = [];
      for (let i = 0; i < (await items.count()); i += 1) {
        const item = items.nth(i);
        out.push([await textOf(item.getByRole("link")), await textOf(item.locator("span span").last())]);
      }
      return out;
    }

    // ---- Mail --------------------------------------------------------------------

    /** The messages to one fixture address, oldest first. */
    async function mailTo(address, count) {
      const summaries = await waitForMessagesTo(address, { count, timeoutMs: WAIT_MS });
      return summaries.slice().reverse();
    }

    /** The tests of this run's update the admin was sent, read out of the admin's mailbox. Never printed. */
    async function adminUpdateTests() {
      const found = [];
      for (const summary of await messagesTo(secrets.adminEmail)) {
        if (String(summary.Subject ?? "") !== `[TEST] ${UPDATE.title}`) continue;
        const email = await readEmail(summary);
        if (email.words.includes(state.courseTitle)) found.push(email);
      }
      return found;
    }

    /** Holds one email to its sentences, in order; `absent` are sentences it must not say. */
    function assertSays(email, { who, sentences, absent = [] }) {
      let from = 0;
      for (const sentence of sentences) {
        const at = email.words.indexOf(sentence, from);
        assert.ok(
          at !== -1,
          `${who} does not say ${JSON.stringify(shown(sentence))}${from > 0 ? " after what came before it" : ""}. ` +
            `It says: ${JSON.stringify(shown(email.words))}`,
        );
        from = at + sentence.length;
      }
      for (const sentence of absent) {
        assert.ok(!email.words.includes(sentence), `${who} says ${JSON.stringify(sentence)}, which it should not`);
      }
    }

    /** Neither half of an email names Group A's meeting link, nor its host. */
    function assertNoMeetingLink(email, who) {
      for (const [part, body] of [
        ["HTML", email.html],
        ["text", email.text],
      ]) {
        assert.ok(
          !body.includes(updateGroup.meetingUrl) && !body.includes(new URL(updateGroup.meetingUrl).host),
          `${who}'s ${part} part carries the meeting link. A link to join lives on the site only.`,
        );
      }
    }

    /** The update's words: its title, the notice line (not on a test), the message, who sent it, the footer. */
    function updateSentences({ test: isTest }) {
      const paragraphs = UPDATE.message.split(/\n{2,}/).map((p) => flat(p));
      return [
        UPDATE.title,
        ...(isTest
          ? []
          : [
              "Sent as an important notice",
              "You are getting this because you are in this course group, so it reaches you whatever your " +
                "notification settings say, and it is never marketing.",
            ]),
        ...paragraphs,
        `Sent by ${adminName} · ${updateGroup.name} · ${state.courseTitle} (${state.runLabel})`,
        FOOTER,
      ];
    }

    /** Every send log row to one address, by kind. */
    const sendKindsTo = async (address) =>
      (await fixtureQuery("emailSends").where("to", "==", address).get()).docs
        .map((doc) => String(doc.data()?.kind ?? ""))
        .sort();

    try {
      await step("the admin approves the two members who sign in and the facilitator to be appointed", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [reader, notReader, fern]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          const approved = await waitFor(`${account.first}'s account to say member`, async () => {
            const doc = await readUserDoc(account.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${account.first}'s approval left no approvedAt stamp`);
        }
        // Everybody else never signs in, so waits.
        for (const account of state.people.filter((person) => person !== reader && person !== notReader)) {
          const doc = await readUserDoc(account.uid);
          assert.equal(doc?.role, "pending", `${account.first} was approved, and nothing on this journey approves them`);
        }
        // The name the updates will carry, from the account the harness is given.
        const admin = await readUserDoc(state.adminUid);
        const profile = admin?.profile ?? {};
        adminName =
          (typeof profile.preferredName === "string" && profile.preferredName.trim()) ||
          (typeof admin?.displayName === "string" && admin.displayName.trim()) ||
          "NAISI member";
      });

      await step(
        "the admin names the running course run on the programme's Settings tab and hands its people over",
        async () => {
          activePage = adminPage;
          await adminPage.goto(setupUrl, { waitUntil: "domcontentloaded" });
          const panel = adminPage.getByRole("region", { name: "Course run" });
          await panel.waitFor({ timeout: WAIT_MS });
          const runBox = panel.getByLabel("Run", { exact: true });
          await runBox.waitFor({ timeout: WAIT_MS });
          // Three weeks in, the run is running: it can be named, and nobody
          // from this programme is on its list yet, so naming is not locked.
          const [response] = await Promise.all([
            responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
            runBox.selectOption({ label: `${state.runLabel} · Running` }),
          ]);
          const body = await okBody(response, "Naming the run");
          assert.equal(body.changed, true, "naming the run changed nothing");
          assert.equal(body.panel?.runId, state.runId, "the panel names another run");
          const holding = state.people.length;
          await panel
            .getByText(`${holding} people hold a place on ${state.programmeName}. None of them is on the run’s list yet.`, {
              exact: true,
            })
            .waitFor({ timeout: WAIT_MS });

          // A running run takes a hand-over: the press writes the run's own
          // list, which the weeks since Publish would have had.
          const [handOver] = await Promise.all([
            responseTo(adminPage, "/run/hand-over", "POST"),
            panel.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
          ]);
          const receipt = await okBody(handOver, "Handing over");
          assert.deepEqual(receipt.receipt, { handedOver: holding, alreadyThere: 0 }, "the hand-over's receipt");
          await panel.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });

          const form = (await fixtureDoc("admissionRounds", state.formId).get()).data();
          assert.equal(form?.programmes?.[state.programmeId]?.runId, state.runId, "the form does not name the run");
          const rows = await fixtureQuery("courseApplications").where("runId", "==", state.runId).get();
          assert.equal(rows.size, holding, `the run's list has ${rows.size} rows`);
          // Handing over places nobody and tells nobody: the places stay as Publish left them.
          for (const person of state.people) {
            const place = (await fixtureDoc("courseEnrolments", `${state.runId}__${person.uid}`).get()).data();
            assert.equal(place?.groupId, placeOf(person).id, `${person.first}'s place moved`);
            assert.ok(place?.allocatedEmailAt, `${person.first} is no longer told`);
          }
        },
      );

      await step("the admin appoints a facilitator to the group whose register is not finished", async () => {
        activePage = adminPage;
        await adminPage.goto(facilitatorsUrl, { waitUntil: "domcontentloaded" });
        const card = adminPage.locator('section[aria-labelledby="facilitators-title"]');
        await card.getByText(`0 facilitators for ${state.groups.length} groups`, { exact: true }).waitFor({
          timeout: WAIT_MS,
        });
        await card
          .getByRole("button", { name: `Change ${facilitatedGroup.name}’s facilitators`, exact: true })
          .click();
        await card.getByPlaceholder("Search people…").fill(fern.displayName);
        await card.getByRole("checkbox", { name: new RegExp(escapeRegExp(fern.displayName)) }).check();
        const [response] = await Promise.all([
          responseTo(adminPage, `/groups/${facilitatedGroup.id}/facilitators`, "POST"),
          card.getByRole("button", { name: "Save", exact: true }).click(),
        ]);
        const body = await okBody(response, "Saving the facilitators");
        assert.deepEqual(body.facilitatorUids, [fern.uid], "the group's facilitators are not the one ticked");
        await card
          .getByText(`${facilitatedGroup.name}’s facilitators are saved. Nobody was emailed.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        const group = (await fixtureDoc("courseGroups", facilitatedGroup.id).get()).data();
        assert.deepEqual(group?.facilitatorUids, [fern.uid], "the group does not name its facilitator");
        assert.deepEqual(await sendKindsTo(fern.email), ["application"], "appointing a facilitator emailed them");
      });

      await step(
        "the Overview shows week 3, this week's sessions and their registers, what needs attention and the newest update",
        async () => {
          activePage = adminPage;
          await adminPage.goto(overviewUrl, { waitUntil: "domcontentloaded" });
          // What this target's settings make of a register's ending, asked once.
          ending = await readEnding(unfinishedGroup);
          console.log(
            `[week-three-spec] registers are ${word()} here; the reminder job is ${ending.reminder ? "on" : "off"}, ` +
              `the task job ${ending.task ? "on" : "off"}.`,
          );
          const now = new Date();
          const todayKey = londonDateKey(now);
          const tomorrowKey = shiftDateKey(todayKey, 1);

          // The line under the programme's name, from the run's own records:
          // where the run is, who is taking part, and the day the last sessions are.
          const lastKey = state.groups
            .map((group) => sessionOf(group, state.weekCount).dateKey)
            .sort()
            .at(-1);
          for (const words of [
            `Running · week ${thisWeek} of ${state.weekCount}`,
            `${state.people.length} taking part in ${state.groups.length} groups`,
            `Last sessions ${dayLabel(lastKey)}`,
          ]) {
            await adminPage.getByText(words, { exact: true }).first().waitFor({ timeout: WAIT_MS });
          }

          // The week: its label, its days, its published title, and for an admin the way to its editor.
          const week = overviewRegion(`Week ${thisWeek} of ${state.weekCount}`);
          await week.waitFor({ timeout: WAIT_MS });
          const weekSaid = await textOf(week);
          for (const expected of ["This week", weekSpanLabel(slotStartKey), `E2E week ${thisWeek} reading`]) {
            assert.ok(weekSaid.includes(expected), `the week card does not say ${JSON.stringify(expected)}: ${weekSaid}`);
          }
          const open = week.getByRole("link", { name: `Open week ${thisWeek}`, exact: true });
          assert.equal(
            await open.getAttribute("href"),
            `/admin/courses/${enc(state.courseId)}/runs/${enc(state.runId)}/weeks/${weekDocId(thisWeek)}`,
            "Open week 3 does not lead to the week's editor",
          );
          // The rail marks this week, the day it starts, and says so in words.
          const current = week.locator('[aria-current="step"]');
          assert.equal(await current.count(), 1, "the rail does not mark one week as this week");
          const railSays = (await textsOf(current.locator("span"))).filter(Boolean);
          assert.ok(
            railSays.includes(`Week ${thisWeek}`) && railSays.some((said) => said.startsWith(dayLabel(slotStartKey))),
            `the rail's current week says ${JSON.stringify(railSays)}`,
          );

          // This week's sessions: what happens when, so in time, one card a group.
          const sessions = overviewRegion("Sessions this week");
          const inTime = state.groups
            .map((group) => ({ group, session: sessionNow(group, thisWeek, now) }))
            .sort(
              (a, b) =>
                a.session.startsAt.getTime() - b.session.startsAt.getTime() ||
                ordered.indexOf(a.group) - ordered.indexOf(b.group),
            );
          const cards = sessions.getByRole("article");
          await cards.first().waitFor({ timeout: WAIT_MS });
          assert.equal(await cards.count(), inTime.length, "the week's sessions are not one card a group");
          for (const [index, { group, session }] of inTime.entries()) {
            const card = cards.nth(index);
            const said = await textOf(card);
            const day =
              session.dateKey === todayKey ? "Today" : session.dateKey === tomorrowKey ? "Tomorrow" : londonDayLabel(session.startsAt);
            const members = membersOf(group);
            const came = members.filter((person) => CAME.has(markOf(person, thisWeek))).length;
            const marked = members.filter((person) => markOf(person, thisWeek)).length;
            const expected = [
              group.name,
              `${day} · ${londonClockLabel(session.startsAt)}`,
              group.room,
              group === facilitatedGroup ? fern.displayName : "No facilitator yet",
            ];
            if (isFinished(group, thisWeek)) {
              expected.push(`Register ${word()}`, `${came} of ${members.length} came`);
              assert.equal(
                await card.getByRole("link", { name: "See it", exact: true }).getAttribute("href"),
                `${programmePathOnSite}/attendance?group=${enc(group.id)}`,
                `${group.name}'s See it does not lead to its row on Attendance`,
              );
            } else {
              assert.ok(session.ended, `${group.name}'s week ${thisWeek} session has not ended, so the plan is off`);
              expected.push(
                `Register not ${word()}`,
                marked > 0 ? `Saved, not ${word()}. ${came} of ${members.length} so far.` : "Nothing’s saved yet.",
                `Remind ${fern.first}`,
                "Emails 1 person",
              );
            }
            for (const words of expected) {
              assert.ok(said.includes(words), `${group.name}'s session card does not say ${JSON.stringify(words)}: ${said}`);
            }
            assert.equal(
              await textOf(card.getByRole("heading", { level: 3 })),
              group.name,
              `card ${index + 1} of this week's sessions is not ${group.name}'s`,
            );
          }

          // Needs attention: two missed in a row, the week nobody can open,
          // the register not finished, with what happens next.
          const attention = overviewRegion("Needs attention");
          await attention.waitFor({ timeout: WAIT_MS });
          const expectedItems = attentionItems(null, now);
          assert.deepEqual(await readAttention(), expectedItems, "Needs attention does not list what the records say");
          assert.equal(
            await textOf(attention.locator("h2 + span")),
            String(expectedItems.length),
            "Needs attention's count is not its items",
          );

          // Who came by week, and the people.
          const totals = weeks.map((weekNumber) => weekTotal(ordered, weekNumber, now));
          const withData = totals.filter((total) => total.percent !== null);
          const without = totals.filter((total) => total.percent === null).map((total) => total.weekNumber);
          const notYet =
            without.length === 1
              ? ` Week ${without[0]} not yet.`
              : without.length > 1
                ? ` Weeks ${without[0]} to ${without[without.length - 1]} not yet.`
                : "";
          const description = `Who came, by week: ${withData
            .map((total) => `week ${total.weekNumber} ${total.percent}%${total.soFar ? " so far" : ""}`)
            .join(", ")}.${notYet}`;
          await overviewRegion("Attendance by week").getByRole("img", { name: description, exact: true }).waitFor({
            timeout: WAIT_MS,
          });
          const latestSoFar = [...withData].reverse().find((total) => total.soFar);
          if (latestSoFar) {
            await overviewRegion("Attendance by week")
              .getByText(`Week ${latestSoFar.weekNumber} is from ${groupsInWords(latestSoFar.from)} so far.`, { exact: true })
              .waitFor({ timeout: WAIT_MS });
          }
          const people = await textOf(overviewRegion("People"));
          for (const expected of [
            `${state.people.length} taking part`,
            "Nobody has left. Places can’t be offered after week 1.",
          ]) {
            assert.ok(people.includes(expected), `the People card does not say ${JSON.stringify(expected)}: ${people}`);
          }

          // The newest updates: the one from week 1, by nobody's account, so named for the society.
          const postedAt = new Date(state.weekThree.earlierUpdatePostedAt);
          assert.deepEqual(
            await readOverviewUpdates(),
            [[EARLIER_UPDATE.title, `NAISI → Everyone · ${londonDayLabel(postedAt)} · Not emailed`]],
            "the Overview's Updates card does not show the newest update",
          );
        },
      );

      await step("Remind emails the unfinished register's facilitator once, with the count its button says", async () => {
        activePage = adminPage;
        const session = sessionOf(unfinishedGroup, WEEK_THREE.unfinished.weekNumber);
        const sessionKey = weekDocId(WEEK_THREE.unfinished.weekNumber);
        const card = overviewRegion("Sessions this week").getByRole("article", { name: unfinishedGroup.name, exact: true });
        const remind = card.getByRole("button", { name: `Remind ${fern.first}`, exact: true });
        await remind.waitFor({ timeout: WAIT_MS });

        const asked = new Promise((resolve) => {
          adminPage.once("dialog", async (dialog) => {
            const message = dialog.message();
            await dialog.accept();
            resolve(message);
          });
        });
        const [response] = await Promise.all([
          responseTo(adminPage, "/registers/remind", "POST"),
          remind.click(),
        ]);
        assert.equal(
          await asked,
          `Remind ${fern.first} to ${ending.scheduled ? "finish" : "push"} ${unfinishedGroup.name}’s register for ` +
            `${dayLabel(session.dateKey)}? This emails 1 person.`,
          "the confirmation is not the one the board draws",
        );
        // The press sends the count it showed, for the session it names.
        assert.deepEqual(
          response.request().postDataJSON(),
          { groupId: unfinishedGroup.id, sessionKey, emails: 1 },
          "the press did not send the count on its button",
        );
        assert.deepEqual(await okBody(response, "Remind"), { emailed: 1, failed: 0, names: [fern.first] }, "Remind's answer");

        // The marker the press claimed, and the card that reads it: who was reminded, and when.
        const marker = (
          await registerReminderMarkerDoc({ groupId: unfinishedGroup.id, sessionKey, uid: fern.uid }).get()
        ).data();
        assert.ok(marker?.sentAt, "Remind left no marker saying the reminder went");
        const reminded = `${fern.first} was reminded on ${londonDayAndClock(marker.sentAt.toDate())}.`;
        await card.getByText(reminded, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await remind.count(), 0, "Remind is still offered once its facilitator has been reminded");
        assert.deepEqual(await readAttention(), attentionItems(reminded), "Needs attention does not say who was reminded");

        // Fern's mailbox: her approval, then the reminder, in the register's own word.
        const mail = await mailTo(fern.email, 2);
        assert.equal(mail.length, 2, `Fern has ${mail.length} emails`);
        const email = await readEmail(mail[1]);
        // The register's own page (the group's page, one tap from it, until
        // the follow-ups to Publish of October 2026).
        const link = `${origin}${groupPagePath(unfinishedGroup)}/register`;
        assert.equal(email.subject, `${unfinishedGroup.name}’s register isn’t ${word()}`, "the reminder's subject");
        assertSays(email, {
          who: "The reminder",
          sentences: [
            `${unfinishedGroup.name}’s register isn’t ${word()}`,
            `Hi ${fern.first},`,
            `${unfinishedGroup.name}’s register for ${londonDayLabel(session.startsAt)} isn’t ${word()} yet.`,
            ending.scheduled
              ? "Finish the register to lock it and show everyone their mark. Nobody’s emailed."
              : "Push attendance to lock the register, show everyone their mark and email the group about next week.",
            "Open the register",
            `Or paste this into your browser: ${link}`,
            `If the session didn’t happen, the register can say so, and it still needs ${ending.scheduled ? "finishing" : "pushing"}.`,
            ...(ending.task
              ? [`If it’s still not ${word()} ${ending.task.hours} hours after the session, ${TASK_PEOPLE} get a task.`]
              : []),
            FOOTER,
          ],
        });
        assert.ok(email.links.includes(link), `the reminder does not link to the register (${link}): ${JSON.stringify(email.links)}`);
        assertNoMeetingLink(email, "The reminder");

        // A second press: nobody is left to remind, and nobody is emailed.
        const again = await adminPage.evaluate(
          async ({ url, body }) => {
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            return { status: res.status, body: await res.json().catch(() => null) };
          },
          {
            url: `/api/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}/registers/remind`,
            body: { groupId: unfinishedGroup.id, sessionKey, emails: 1 },
          },
        );
        assert.deepEqual(
          [again.status, again.body?.error],
          [
            409,
            `Nobody is left to remind about ${unfinishedGroup.name}’s register: its facilitators have been reminded already, or can’t be emailed.`,
          ],
          "a second press was not refused",
        );
        assert.equal((await messagesTo(fern.email)).length, 2, "a second press emailed Fern again");
      });

      await step("the Attendance tab shows every mark of the three weeks, each person's row and each week's figure", async () => {
        activePage = adminPage;
        await adminPage.goto(attendanceUrl, { waitUntil: "domcontentloaded" });
        const grid = adminPage.getByRole("region", { name: "Attendance grid" });
        await grid.waitFor({ timeout: WAIT_MS });
        const now = new Date();
        const todayKey = londonDateKey(now);
        const tomorrowKey = shiftDateKey(todayKey, 1);

        /** The words of each `span` inside an element, in order. */
        const spansOf = async (element) => (await textsOf(element.locator("span"))).filter(Boolean);

        // The columns: every taught week, this one marked.
        const weekHeads = grid.locator('th[scope="col"]');
        for (const weekNumber of weeks) {
          assert.deepEqual(
            await spansOf(weekHeads.nth(weekNumber)),
            weekNumber === thisWeek ? [`Week ${weekNumber}`, "This week"] : [`Week ${weekNumber}`],
            `the grid's column for week ${weekNumber}`,
          );
        }

        // The groups in the one order, each with its slot, its facilitators, and its dates.
        const heads = grid.locator('th[scope="rowgroup"]');
        assert.equal(await heads.count(), ordered.length, "the grid does not head every group");
        for (const [index, group] of ordered.entries()) {
          const facilitators = group === facilitatedGroup ? [fern.first] : [];
          const line = [slotLine(group), namesInWords(facilitators)].filter(Boolean).join(" · ");
          assert.deepEqual(await spansOf(heads.nth(index)), [group.name, line], `group ${index + 1} of the grid`);
          const dates = heads.nth(index).locator("xpath=..").locator("td");
          for (const weekNumber of weeks) {
            const session = sessionNow(group, weekNumber, now);
            // The word over a group's date (`groupSessions`): a session today
            // or tomorrow, or one over and not finished.
            const tag = isFinished(group, weekNumber)
              ? null
              : session.ended
                ? `Not ${word()}`
                : session.dateKey === todayKey
                  ? group.startTimeLocal >= "17:00"
                    ? "Tonight"
                    : "Today"
                  : session.dateKey === tomorrowKey
                    ? "Tomorrow"
                    : null;
            assert.deepEqual(
              await spansOf(dates.nth(weekNumber - 1)),
              tag ? [dayMonthLabel(session.dateKey), tag] : [dayMonthLabel(session.dateKey)],
              `${group.name}'s week ${weekNumber} on the grid`,
            );
          }
        }

        // Every person's every week, as the cell tells assistive technology, and "Came".
        for (const group of ordered) {
          for (const person of membersOf(group)) {
            const row = grid.getByRole("row").filter({
              // The whole name the grid shows the admin, never the start of a longer one.
              has: adminPage.getByRole("rowheader", { name: new RegExp(`^${escapeRegExp(person.displayName)}(?![A-Za-z0-9])`) }),
            });
            await row.waitFor({ timeout: WAIT_MS });
            const marks = row.getByRole("img");
            const said = [];
            for (let i = 0; i < (await marks.count()); i += 1) said.push(await marks.nth(i).getAttribute("aria-label"));
            const expected = cellsOf(person, now).map((cell) => {
              const what = cell.mark
                ? `${MARK_WORD[cell.mark]}${cell.saved ? `, saved, not ${word()}` : ""}`
                : cell.today
                  ? "today, not yet"
                  : "not yet";
              return `${person.displayName}, week ${cell.weekNumber}: ${what}`;
            });
            assert.deepEqual(said, expected, `${person.first}'s row of marks`);
            const { came, of } = cameOf(person, now);
            assert.equal(await textOf(row.locator("td").last()), of > 0 ? `${came} of ${of}` : "·", `${person.first}'s Came`);
            // The name, and "2 in a row" for a run of absences (never for somebody who left).
            const run = absentRun(person, now);
            const header = row.getByRole("rowheader");
            await header.getByText(person.displayName, { exact: true }).waitFor({ timeout: WAIT_MS });
            assert.equal(
              await header.getByText(/^\d+ in a row$/).count(),
              run.length > 0 ? 1 : 0,
              `${person.first}'s row ${run.length > 0 ? "does not say" : "says"} they missed sessions in a row`,
            );
            if (run.length > 0) await header.getByText(`${run.length} in a row`, { exact: true }).waitFor({ timeout: WAIT_MS });
          }
        }

        // The foot: who came each week, over every group, "so far" while a register is not finished.
        const foot = grid.locator("tfoot tr");
        assert.deepEqual(await spansOf(foot.locator("th")), ["All groups", "% who came"], "the grid's foot");
        const figures = foot.locator("td");
        for (const weekNumber of weeks) {
          const total = weekTotal(ordered, weekNumber, now);
          assert.deepEqual(
            await spansOf(figures.nth(weekNumber - 1)),
            total.percent === null ? ["·"] : total.soFar ? [`${total.percent}%`, "so far"] : [`${total.percent}%`],
            `the foot's week ${weekNumber}`,
          );
        }
      });

      await step("Download CSV is the grid, word for word, and the download is logged", async () => {
        activePage = adminPage;
        const before = londonDateKey(new Date());
        const [response, download] = await Promise.all([
          responseTo(adminPage, "/attendance/export", "POST"),
          adminPage.waitForEvent("download", { timeout: WAIT_MS }),
          adminPage.getByRole("button", { name: "Download CSV", exact: true }).click(),
        ]);
        assert.ok(response.ok(), `Download CSV answered ${response.status()}`);
        // The file as it reached the person: the page turns the answer into a
        // download, and the browser keeps no copy of the answer's body after it.
        const csv = readFileSync(await download.path(), "utf8");
        const after = londonDateKey(new Date());
        const now = new Date();

        // The grid as a spreadsheet (`attendanceCsvTable`): the groups in the one
        // order, their people by name, each week's mark in words, Came, Of, Left.
        const header = ["Group", "Name", ...weeks.map((weekNumber) => `Week ${weekNumber}`), "Came", "Of", "Left"];
        const rows = [];
        for (const group of ordered) {
          for (const person of membersOf(group)) {
            const { came, of } = cameOf(person, now);
            rows.push([
              group.name,
              person.displayName,
              ...cellsOf(person, now).map((cell) =>
                cell.mark ? `${MARK_WORD[cell.mark]}${cell.saved ? ` (not ${word()})` : ""}` : "",
              ),
              came,
              of,
              "",
            ]);
          }
        }
        const expected = `\uFEFF${header.join(",")}\n${rows.map((row) => row.join(",")).join("\n")}`;
        assert.equal(csv, expected, "the CSV is not the grid");

        // Its name, and the log written before it was handed over.
        const slug = state.programmeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const name = download.suggestedFilename();
        assert.ok(
          [before, after].some((day) => name === `attendance-${slug}-${day}.csv`),
          `the file is called ${JSON.stringify(name)}`,
        );
        const logged = (await fixtureQuery("dataExports").where("scope.runId", "==", state.runId).get()).docs.map((doc) =>
          doc.data(),
        );
        assert.equal(logged.length, 1, `the download was logged ${logged.length} times`);
        const [row] = logged;
        assert.deepEqual(
          { kind: row.kind, scope: row.scope, rowCount: row.rowCount, filename: row.filename },
          { kind: "register", scope: { runId: state.runId, roundId: state.formId }, rowCount: rows.length, filename: name },
          "the download's log row",
        );
        assert.ok(row.actorUid === state.adminUid, "the download's log row does not name the admin who pressed it");
      });

      // ---- Messages ------------------------------------------------------------

      const composer = () =>
        adminPage.locator("form").filter({ has: adminPage.getByRole("heading", { name: "New update", exact: true }) });

      await step("Send a test to me emails the admin the update to one group, marked as a test", async () => {
        activePage = adminPage;
        await adminPage.goto(messagesUrl, { waitUntil: "domcontentloaded" });
        const form = composer();
        await form.waitFor({ timeout: WAIT_MS });
        const testButton = form.getByRole("button", { name: "Send a test to me", exact: true });
        await waitFor("the composer to be ready", async () => ((await testButton.isEnabled()) ? true : null));

        // To: everyone, each group in the one order, the facilitators, each with who reads it.
        const to = form.getByLabel("To", { exact: true });
        const offered = await textsOf(to.locator("option"));
        assert.deepEqual(
          offered,
          [
            `Everyone on ${state.programmeName} (${state.people.length})`,
            ...ordered.map((group) => `${group.name} (${membersOf(group).length})`),
            "The facilitators (1)",
          ],
          "To does not offer the run's audiences, each with who reads it",
        );
        const inGroup = membersOf(updateGroup);
        await to.selectOption({ label: `${updateGroup.name} (${inGroup.length})` });
        await form.getByLabel("Title", { exact: true }).fill(UPDATE.title);
        await form.getByLabel("Message", { exact: true }).fill(UPDATE.message);
        await form.getByText(`${UPDATE.message.length} / 4,000`, { exact: true }).waitFor({ timeout: WAIT_MS });
        const emails = inGroup.length;
        assert.equal(await form.getByRole("switch").isChecked(), true, "Also email it is off");
        await form.getByText(`Emails ${emails} people`, { exact: true }).waitFor({ timeout: WAIT_MS });
        await form
          .getByRole("button", { name: `Post and email ${emails} people`, exact: true })
          .waitFor({ timeout: WAIT_MS });
        assert.deepEqual(await adminUpdateTests(), [], "a test of this update was already in the admin's mailbox");

        const [response] = await Promise.all([
          responseTo(adminPage, `/runs/${state.runId}/updates`, "POST"),
          testButton.click(),
        ]);
        assert.deepEqual(
          response.request().postDataJSON(),
          { to: "group", groupId: updateGroup.id, title: UPDATE.title, message: UPDATE.message, test: true },
          "the test did not send the update as written",
        );
        const body = await okBody(response, "Send a test to me");
        assert.equal(body.test?.delivery, "sent", "the test was not sent");
        await form.getByText(`Test sent to you at ${body.test.at}.`, { exact: true }).waitFor({ timeout: WAIT_MS });

        const tests = await waitFor("the test in the admin's mailbox", async () => {
          const found = await adminUpdateTests();
          return found.length > 0 ? found : null;
        });
        assert.equal(tests.length, 1, `the test sent ${tests.length} emails`);
        const [email] = tests;
        assert.equal(email.subject, `[TEST] ${UPDATE.title}`, "the test's subject");
        assertSays(email, {
          who: "The test of the update",
          sentences: updateSentences({ test: true }),
          absent: ["Sent as an important notice"],
        });
        assert.ok(email.replyTo.includes(REPLY_TO), `the test does not reply to ${REPLY_TO}`);
        assertNoMeetingLink(email, "The test of the update");

        // A test posts nothing.
        const updates = await fixtureQuery("courseUpdates").where("runId", "==", state.runId).get();
        assert.equal(updates.size, 1, `the run has ${updates.size} updates after a test`);
      });

      await step("the update to one group is posted and emailed to its people, with the count on the button", async () => {
        activePage = adminPage;
        const form = composer();
        const inGroup = membersOf(updateGroup);
        const emails = inGroup.length;
        const [response] = await Promise.all([
          responseTo(adminPage, `/runs/${state.runId}/updates`, "POST"),
          form.getByRole("button", { name: `Post and email ${emails} people`, exact: true }).click(),
        ]);
        assert.deepEqual(
          response.request().postDataJSON(),
          { to: "group", groupId: updateGroup.id, title: UPDATE.title, message: UPDATE.message, email: true, emailCount: emails },
          "the press did not send the count on its button",
        );
        const body = await okBody(response, "Posting the update");
        assert.deepEqual(body.email, { sent: emails, held: 0, suppressed: 0, failed: 0 }, "the update's email did not reach its group");
        await form.getByText(`Posted and emailed to ${emails} people.`, { exact: true }).waitFor({ timeout: WAIT_MS });

        // The list under the composer: newest first, with who it was to and what its email did.
        const today = londonDayLabel(new Date());
        const list = adminPage.getByRole("region", { name: "Updates", exact: true });
        const rows = list.getByRole("listitem");
        await rows.filter({ hasText: UPDATE.title }).waitFor({ timeout: WAIT_MS });
        const said = [];
        for (let i = 0; i < (await rows.count()); i += 1) {
          said.push(await textsOf(rows.nth(i).locator("summary > span")));
        }
        const postedAt = new Date(state.weekThree.earlierUpdatePostedAt);
        sameAs(
          JSON.stringify(said),
          JSON.stringify([
            [UPDATE.title, `${adminFirst()} → ${updateGroup.name} · ${today} · Emailed to ${emails}`],
            [EARLIER_UPDATE.title, `NAISI → Everyone · ${londonDayLabel(postedAt)} · Not emailed`],
          ]),
          "the Messages tab's updates",
        );

        // The record: to the group, from the admin, its email settled.
        const stored = (await fixtureQuery("courseUpdates").where("runId", "==", state.runId).get()).docs
          .map((doc) => doc.data())
          .filter((update) => update.title === UPDATE.title);
        assert.equal(stored.length, 1, `the update was stored ${stored.length} times`);
        assert.deepEqual(
          {
            to: stored[0].to,
            groupId: stored[0].groupId,
            message: stored[0].message,
            email: stored[0].email,
          },
          {
            to: "group",
            groupId: updateGroup.id,
            message: UPDATE.message,
            email: { planned: emails, sent: emails, held: 0, suppressed: 0, failed: 0, settled: true },
          },
          "the stored update",
        );
        assert.ok(stored[0].authorUid === state.adminUid, "the stored update does not name the admin who wrote it");

        // Each of the group's people: one email, the update's own words, a notice.
        for (const person of inGroup) {
          const approved = person === reader ? 1 : 0;
          const mail = await mailTo(person.email, approved + 1);
          assert.equal(mail.length, approved + 1, `${person.first} has ${mail.length} emails`);
          const email = await readEmail(mail[mail.length - 1]);
          assert.equal(email.subject, UPDATE.title, `${person.first}'s update's subject`);
          assertSays(email, { who: `${person.first}'s update`, sentences: updateSentences({ test: false }) });
          assert.ok(email.replyTo.includes(REPLY_TO), `${person.first}'s update does not reply to ${REPLY_TO}`);
          assertNoMeetingLink(email, `${person.first}'s update`);
        }
        // Nobody outside the group was written to.
        for (const [account, count] of [
          [notReader, 1],
          [fern, 2],
        ]) {
          assert.equal((await messagesTo(account.email)).length, count, `${account.first} was emailed the update`);
        }
        assert.equal((await adminUpdateTests()).length, 1, "posting sent the admin another test");

        // The Overview's Updates card: the newest first.
        await adminPage.goto(overviewUrl, { waitUntil: "domcontentloaded" });
        await overviewRegion("Updates").waitFor({ timeout: WAIT_MS });
        const card = await readOverviewUpdates();
        sameAs(
          JSON.stringify(card),
          JSON.stringify([
            [UPDATE.title, `${adminFirst()} → ${updateGroup.name} · ${today} · Emailed to ${emails}`],
            [EARLIER_UPDATE.title, `NAISI → Everyone · ${londonDayLabel(postedAt)} · Not emailed`],
          ]),
          "the Overview's Updates card",
        );
      });

      await step("a member of that group reads it on their programme page, and a member of the other group does not", async () => {
        const today = londonDayLabel(new Date());
        const postedAt = new Date(state.weekThree.earlierUpdatePostedAt);

        /** Opens a member's programme page and reads its Updates: the route's answer and what is drawn. */
        async function updatesOn(pg, person) {
          await signIn(pg, person);
          const answered = pg
            .waitForResponse(
              (r) =>
                new URL(r.url()).pathname === `/api/courses/runs/${state.runId}/updates` && r.request().method() === "GET",
              { timeout: WAIT_MS },
            )
            .catch((err) => err);
          await pg.goto(`${origin}${learnPath}`, { waitUntil: "domcontentloaded" });
          const response = await answered;
          if (response instanceof Error) throw response;
          const body = await okBody(response, `${person.first}'s updates`);
          const section = pg.getByRole("region", { name: "Updates", exact: true });
          await section.waitFor({ timeout: WAIT_MS });
          const articles = section.getByRole("article");
          await articles.first().waitFor({ timeout: WAIT_MS });
          const drawn = [];
          for (let i = 0; i < (await articles.count()); i += 1) {
            const article = articles.nth(i);
            drawn.push([
              await textOf(article.getByRole("heading", { level: 3 })),
              await textOf(article.locator("p").first()),
              await textOf(article.locator("p").last()),
            ]);
          }
          return { titles: body.updates.map((update) => update.title), drawn, page: await textOf(pg.locator("main")) };
        }

        const earlier = [
          EARLIER_UPDATE.title,
          `NAISI · to everyone on ${state.programmeName} · ${londonDayLabel(postedAt)}`,
          flat(EARLIER_UPDATE.message),
        ];

        activePage = readerPage;
        const read = await updatesOn(readerPage, reader);
        assert.deepEqual(read.titles, [UPDATE.title, EARLIER_UPDATE.title], `${reader.first}'s updates, from the route`);
        sameAs(
          JSON.stringify(read.drawn),
          JSON.stringify([[UPDATE.title, `${adminFirst()} · to ${updateGroup.name} · ${today}`, flat(UPDATE.message)], earlier]),
          `${reader.first}'s Updates`,
        );

        activePage = otherPage;
        const notRead = await updatesOn(otherPage, notReader);
        assert.deepEqual(notRead.titles, [EARLIER_UPDATE.title], `${notReader.first} is answered the update to ${updateGroup.name}`);
        assert.deepEqual(notRead.drawn, [earlier], `${notReader.first}'s Updates`);
        assert.ok(!notRead.page.includes(UPDATE.title), `${notReader.first}'s programme page names the update to ${updateGroup.name}`);
      });

      await step("every email went to the send log, and none carries the meeting link", async () => {
        activePage = adminPage;
        // Who was written to, by kind: approvals, the reminder, the update's notices.
        const expected = [
          [reader, ["application", "notice"]],
          ...membersOf(updateGroup)
            .filter((person) => person !== reader)
            .map((person) => [person, ["notice"]]),
          [notReader, ["application"]],
          [fern, ["application", "course-facilitator"]],
        ];
        for (const [account, kinds] of expected) {
          const logged = await waitFor(`${account.first}'s send rows`, async () => {
            const rows = await sendKindsTo(account.email);
            return rows.length >= kinds.length ? rows : null;
          });
          assert.deepEqual(logged, [...kinds].sort(), `${account.first}'s send rows`);
        }
        // About the group the update was to, whoever it went to: the test and each notice.
        const aboutGroup = (await fixtureQuery("emailSends").where("referenceId", "==", updateGroup.id).get()).docs
          .map((doc) => String(doc.data()?.kind ?? ""))
          .sort();
        assert.deepEqual(
          aboutGroup,
          ["course-test", ...membersOf(updateGroup).map(() => "notice")].sort(),
          "the update's sends are not all logged against its group",
        );
        // About the run: the reminder.
        const aboutRun = (await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get()).docs.map((doc) =>
          String(doc.data()?.kind ?? ""),
        );
        assert.deepEqual(aboutRun, ["course-facilitator"], "the reminder is not logged against the run");

        // And not one message this journey caused names the meeting link.
        const everything = [...(await adminUpdateTests())];
        for (const account of [...state.people, fern]) {
          for (const summary of await messagesTo(account.email)) everything.push(await readEmail(summary));
        }
        const people = expected.reduce((sum, [, kinds]) => sum + kinds.length, 0);
        assert.equal(everything.length, 1 + people, `the journey caused ${everything.length} emails`);
        for (const email of everything) assertNoMeetingLink(email, JSON.stringify(email.subject));
      });
    } finally {
      await Promise.allSettled([otherContext.close(), readerContext.close(), context.close()]);
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
