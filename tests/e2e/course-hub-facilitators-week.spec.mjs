/**
 * A facilitator's week, end to end, in a real browser: the course hub's third
 * spec, and the first driven by a member of staff who is not an admin.
 *
 * The term T1 and T2 stand on, three weeks after its run began, with Group
 * A's week 3 register never opened
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "week-three-unmarked")
 * -> the admin approves Ada and Ben (Group A) and Fern -> names the running run
 * on the programme's Settings tab and hands its people over -> appoints Fern to
 * Group A -> Fern signs in and opens her group: the roster, this week's
 * session, the register -> marks this week's register in every state it offers
 * -> Ada sees no mark from it yet -> Fern finishes it, in the words of this
 * target's ending, and it locks against her -> Ada reads her own marks for the
 * week, and nobody else's -> Fern moves next week's session with a reason, the
 * button saying how many it emails -> Ada and Ben read the change on their
 * programme page -> the update's email reaches exactly Group A, word for word,
 * with no meeting link in any email -> the lead's Overview and Sessions view,
 * read as the admin, show the register finished and the session moved.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-facilitators-week
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: the update's email is
 * read word for word out of each member's mailbox.
 *
 * ## Every expected word comes from the seed's clock and the world's plan
 *
 * Dates, times, counts and names are worked out here from the state file and
 * the world's constants (`WEEK_THREE_UNMARKED`, `EARLIER_UPDATE`), by the rules
 * of the screens restated beside each check, never written as a calendar
 * date. The words a target's settings decide (whether a register is "finished"
 * or "pushed", and whether the reminder and the task are on, with their
 * hours) are read once from the register's own GET, as register-push and T2
 * read them, and the checks follow them.
 *
 * ## Five identities, four browser contexts
 *
 * The admin (the programme's lead here), Fern (Group A's facilitator), Ada and
 * Ben (Group A), each in their own context; Cleo (Group B) never signs in and
 * is read only through her mailbox. CHROMIUM ONLY: a green run is a regression
 * net, never a substitute for the manual Safari pass.
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
import { getMessage, messagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
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
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-facilitators-week.mjs";
import {
  EARLIER_UPDATE,
  WEEK_THREE_UNMARKED,
  clockWords,
  compareGroupsByMeeting,
  dayLabel,
  dayMonthLabel,
  groupsInWords,
  londonClockLabel,
  londonDateKey,
  londonDayLabel,
  londonWallClockToInstant,
  namesInWords,
  sessionOf,
  sessionWhenLabel,
  shiftDateKey,
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

/**
 * What Fern does to next week's session, typed in the dialog as a facilitator
 * would: one day later, at another time, in another room, with a reason the
 * group reads. The day is worked out from the session's own date below.
 */
const MOVE = Object.freeze({
  daysLater: 1,
  time: "7pm",
  startTimeLocal: "19:00",
  room: "Room E5",
  reason: "The usual room is booked for an exam that evening.",
});

/** Present, late and left early count as came, as the board says. */
const CAME = new Set(["present", "late", "left-early"]);

/** `ABSENT_IN_A_ROW` in src/lib/courses/programmeAttendance.ts. */
const ABSENT_IN_A_ROW = 2;

/** Every email's last line (`EmailChrome`). */
const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";

/** Where a reply to an update goes (`UPDATE_REPLY_TO`). */
const REPLY_TO = "ai-safety@uonsu.com";

/**
 * How a member's programme page draws their marks (board wk-programme, C26):
 * a mark's letter, the dot for a session whose register is not finished yet,
 * the card's line, and the legend's name and order. `MARK_LETTER`,
 * `NOT_YET_MARK`, `MARK_STATE_WORDS`, `MARKS_LINE` and `MARKS_LEGEND_LABEL` in
 * src/lib/courses/memberPageWords.ts and `MARK_ORDER` in
 * src/features/courses/RunHome.tsx, restated. The five marks' words are the
 * register's own (`declaredStatuses`). Not marked, Cancelled and Didn't happen
 * are in the order for completeness: nothing this journey drives draws them.
 */
const MARK_LETTER = Object.freeze({ present: "P", late: "L", "left-early": "LE", excused: "E", absent: "A" });
const NOT_YET = Object.freeze({ word: "Not yet", glyph: "·" });
const MARKS_LINE = "Your facilitators fill these in after each session.";
const MARKS_LEGEND_LABEL = "What the marks mean";
const MARK_ORDER = Object.freeze([
  "present",
  "late",
  "left-early",
  "excused",
  "absent",
  "not-marked",
  "cancelled",
  "did-not-happen",
  "not-yet",
]);

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

/**
 * The attendance states the register offers, in its tap order, each with the
 * label a cell announces: read off the source rather than restated, as
 * register-push reads them, so a sixth state fails the marking step on
 * purpose instead of leaving it claiming "every state" over five.
 */
function declaredStatuses() {
  const source = readFileSync(new URL("../../src/lib/firestore/courseAttendance.ts", import.meta.url), "utf8");
  const order = /ATTENDANCE_STATUSES:\s*AttendanceStatus\[\]\s*=\s*\[([\s\S]*?)\];/.exec(source);
  assert.ok(order, "could not read ATTENDANCE_STATUSES out of src/lib/firestore/courseAttendance.ts");
  const labelBlock = /ATTENDANCE_STATUS_LABEL:\s*Record<AttendanceStatus,\s*string>\s*=\s*\{([\s\S]*?)\};/.exec(source);
  assert.ok(labelBlock, "could not read ATTENDANCE_STATUS_LABEL out of src/lib/firestore/courseAttendance.ts");
  const labels = new Map();
  for (const [, key, label] of labelBlock[1].matchAll(/"?([a-z-]+)"?\s*:\s*"([^"]+)"/g)) labels.set(key, label);
  return [...order[1].matchAll(/"([^"]+)"/g)].map(([, key]) => {
    const label = labels.get(key);
    assert.ok(label, `ATTENDANCE_STATUS_LABEL carries no label for ${JSON.stringify(key)}`);
    return { key, label };
  });
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
        ? "This journey reads its own mail, the update to the facilitator's group included, so it " +
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

/** "Tuesdays 6pm": a group's usual slot, as the group page's head says it (`slotWords`). */
const whenWeekly = (group) =>
  `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][group.weekday]}s ${clockWords(group.startTimeLocal)}`;

/** "AL" for "Ada Lovelace": the initials a person's disc carries (`InitialsChip`). */
const initialsOf = (name) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
};

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
    replyTo: (message.ReplyTo ?? []).map((entry) => String(entry.Address ?? "").toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// The register's own words, restated
// ---------------------------------------------------------------------------

/** "Rahul and Sofia", "Rahul, Sofia and Tom": `listOfNames` in src/features/courses/registerEndingWords.ts. */
function listOfNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Everything the foot of a register says, from the `ending` its GET answered:
 * `registerEndingWords` in src/features/courses/registerEndingWords.ts,
 * restated with its helpers (`nextEmailSentence`, `chaseSentence`, and
 * `pushEffect` with `heldFootSentence`, which word what pressing the register
 * emails from the GET's own answer, `ending.pushEmails`).
 */
function endingWords(ending) {
  const hours = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
  const remindedPeople = (names) => (names.length > 0 ? listOfNames(names) : "The group’s facilitators");
  const getsAReminder = (names) => (names.length === 1 ? "gets a reminder." : "get a reminder.");
  const taskPeople = (leadName) => (leadName ? `${leadName} and admins` : "admins");
  const capitalise = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
  const lowerFirst = (text) => (text.startsWith("The group’s") ? `t${text.slice(1)}` : text);
  const group = ending.groupName.trim() || "the group";

  const heldFootSentence = (line) => {
    switch (line.why) {
      case "unpublished":
        return `Week ${line.weekNumber} isn’t published yet, so nobody’s emailed.`;
      case "claimed":
        return `${capitalise(group)} has already had its email about week ${line.weekNumber}, so nobody’s emailed.`;
      case "nobody":
        return `Nobody in ${group} is set up to receive email.`;
      case "no-date":
        return `${capitalise(group)} has no dates set, so nobody’s emailed.`;
      case "refused":
        return `There are too many people in ${group} for one email, so nobody’s emailed.`;
      case "missing":
        return `Week ${line.weekNumber}’s email is missing something it needs, so nobody’s emailed.`;
      default:
        throw new Error(`the register's GET answered a reason for emailing nobody this spec does not know: ${line.why}`);
    }
  };

  const nextEmailSentence = (line) => {
    switch (line.state) {
      case "goes":
        return `Next week’s email goes to ${group} on ${line.at}, whatever happens here.`;
      case "went":
        return `Next week’s email went to ${group} on ${line.at}.`;
      case "waiting-for-week":
        return `Next week’s email to ${group} is waiting for week ${line.weekNumber} to be published.`;
      case "held":
        return `Next week’s email to ${group} is held: it’s missing ${listOfNames(line.missing)}.`;
      case "shortly":
        return `Next week’s email to ${group} goes out shortly.`;
      case "missed":
        return `Week ${line.weekNumber} has started without its email.`;
      default:
        throw new Error(`the register's GET answered a next week's email state this spec does not know: ${line.state}`);
    }
  };

  const chase = (() => {
    const { reminder, task } = ending;
    const first = reminder ?? task;
    if (!first) return "";
    if (ending.scheduled) {
      const parts = [`Not finished ${hours(first.hours)} hours after the session?`];
      if (reminder) parts.push(`${remindedPeople(reminder.names)} ${getsAReminder(reminder.names)}`);
      if (task) {
        parts.push(
          reminder
            ? `At ${hours(task.hours)} hours, ${taskPeople(task.leadName)} get a task.`
            : `${capitalise(taskPeople(task.leadName))} get a task.`,
        );
      }
      return parts.join(" ");
    }
    const parts = [];
    if (reminder) parts.push(`After ${hours(reminder.hours)} hours ${lowerFirst(remindedPeople(reminder.names))} ${getsAReminder(reminder.names)}`);
    if (task) parts.push(`After ${hours(task.hours)} hours ${taskPeople(task.leadName)} get a task.`);
    return parts.join(" ");
  })();

  const finished = ending.focus?.finished === true;
  if (ending.scheduled) {
    const notes = [];
    if (finished) notes.push("This register is finished. Everyone can see their mark.");
    if (ending.nextEmail) notes.push(nextEmailSentence(ending.nextEmail));
    if (!finished && chase) notes.push(chase);
    return {
      button: "Finish the register",
      columnButton: "Finish",
      effect: "Locks it and shows everyone their mark. Nobody’s emailed.",
      notes,
    };
  }
  const line = ending.focus && !finished ? ending.pushEmails?.[ending.focus.sessionKey] : undefined;
  const sends = line ? line.kind === "sends" : ending.hasNext;
  const notes = [];
  if (finished) notes.push("This register is pushed. Everyone can see their mark.");
  if (!finished && sends) notes.push("If nobody pushes, nobody gets next week’s email.");
  if (!finished && chase) notes.push(chase);
  const locks = "Locks the register and shows everyone their mark.";
  const kind = line?.kind ?? (ending.hasNext ? "sends" : "last");
  return {
    button: "Push attendance",
    columnButton: "Push",
    effect:
      kind === "sends"
        ? `Locks the register, shows everyone their mark and emails ${group} about next week.`
        : kind === "last"
          ? `${locks} It’s the group’s last session, so nobody’s emailed.`
          : line?.kind === "held"
            ? `${locks} ${heldFootSentence(line)}`
            : `${locks} Nobody’s emailed.`,
    notes,
  };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: a facilitator's week, from an unmarked register to a moved session its group reads",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const plan = WEEK_THREE_UNMARKED;

    const fern = state.facilitator;
    const groupOf = (key) => state.groups.find((group) => group.key === key);
    /** The one order every tab lists the groups in (People in groups' columns). */
    const ordered = [...state.groups].sort(compareGroupsByMeeting);
    /** Fern's group: the one whose week 3 register nobody has opened, and the one with the meeting link. */
    const facilitated = groupOf(plan.facilitated);
    const otherGroup = state.groups.find((group) => group !== facilitated);
    assert.equal(plan.unmarked.group, plan.facilitated, "the world's unmarked register is not in the facilitated group");
    assert.ok(facilitated.meetingUrl, "the facilitated group has no meeting link, so 'never in an email' would prove nothing");

    /** A group's people, in the register's order: the names they go by, then uid. */
    const membersOf = (group) =>
      state.people
        .filter((person) => person.groupKey === group.key)
        .sort((a, b) => a.first.localeCompare(b.first) || a.uid.localeCompare(b.uid));
    const inGroup = membersOf(facilitated);
    assert.equal(inGroup.length, 2, `Group ${facilitated.key} holds ${inGroup.length} people, and this journey spreads the marks over two`);
    const [ada, ben] = inGroup;
    const cleo = state.people.find((person) => person.groupKey === otherGroup.key);
    assert.ok(cleo, "the other group has nobody in it");

    const weeks = Array.from({ length: state.weekCount }, (_, i) => i + 1);

    // The run's week, by its own calendar: the world promises week 3.
    const elapsedDays = Math.round(
      (Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${state.startDate}T00:00:00Z`)) / 86_400_000,
    );
    const thisWeek = Math.floor(elapsedDays / 7) + 1;
    assert.equal(thisWeek, 3, `the term is in week ${thisWeek}, not week 3: the seed and this run are ${elapsedDays} days from its start`);
    assert.equal(plan.unmarked.weekNumber, thisWeek, "the unmarked register is not this week's");
    const nextWeek = thisWeek + 1;

    /** This week's session of Fern's group, which has happened, and next week's, which Fern moves. */
    const thisSession = sessionOf(facilitated, thisWeek);
    const nextSession = sessionOf(facilitated, nextWeek);
    const movedDateKey = shiftDateKey(nextSession.dateKey, MOVE.daysLater);
    /** The words the update carries, as `updateWords` in src/lib/courses/sessionChange/words.ts builds them. */
    const UPDATE = Object.freeze({
      title: `${dayLabel(nextSession.dateKey)}’s session has moved`,
      message: `${MOVE.reason} It’s on ${dayLabel(movedDateKey)} at ${clockWords(MOVE.startTimeLocal)} in ${MOVE.room}, this week only.`,
    });

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    /** The programme's own path, as the server builds the tabs' links. */
    const programmePathOnSite = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const setupUrl = `${formBase}/setup`;
    const facilitatorsUrl = `${formBase}/groups/facilitators`;
    const overviewUrl = `${formBase}/overview`;
    const sessionsViewUrl = (weekNumber) => `${formBase}/groups/sessions?week=${weekNumber}`;
    const learnPath = `/learn/${enc(state.runId)}`;
    const groupPagePath = `${learnPath}/group/${enc(facilitated.id)}`;
    const registerId = `${state.runId}__${facilitated.id}__${weekDocId(thisWeek)}`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: facilitatorContext, page: facilitatorPage } = await newIdentityPage(browser);
    const { context: adaContext, page: adaPage } = await newIdentityPage(browser);
    const { context: benContext, page: benPage } = await newIdentityPage(browser);

    /**
     * Which page a failed step photographs. The recorder takes one page and
     * this spec drives four, so each step names its page first.
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
    for (const pg of [facilitatorPage, adaPage, benPage]) await stubRecaptchaOnLoopback(pg, origin);
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

    /** A request made with a page's own session, its status and body read back. */
    const fetchAs = (pg, url, init = {}) =>
      pg.evaluate(
        async ({ url: target, init: options }) => {
          const res = await fetch(target, options);
          return { status: res.status, body: await res.json().catch(() => null) };
        },
        { url, init },
      );

    /**
     * The centre-screen action toast carrying one sentence, matched by the
     * sentence as well as the role: the register's saved status is a
     * `role="status"` too, and is always on the page.
     */
    const toastOf = (pg, pattern) => pg.locator('[role="status"][aria-live="polite"]').filter({ hasText: pattern }).first();

    // ---- What the register's rules make of the plan, restated ----------------

    /** The marks Fern gives this week: the first state the register offers to Ada, every state in turn to Ben. */
    const statuses = declaredStatuses();
    // A state the register offers and a member's page has no letter for would
    // be drawn as a blank box: fail here, by name, rather than in a mark.
    for (const { key } of statuses) {
      assert.ok(MARK_LETTER[key], `the member's marks restated here carry no letter for ${JSON.stringify(key)}`);
    }
    const fernMarks = { [ada.key]: statuses[0].key, [ben.key]: statuses[statuses.length - 1].key };
    /** A person's mark in a week, from the world's plan and, for this week, Fern's. */
    const markOf = (person, weekNumber) =>
      weekNumber === thisWeek && person.groupKey === facilitated.key
        ? (fernMarks[person.key] ?? null)
        : (plan.marks[person.groupKey]?.[weekNumber]?.[person.key] ?? null);
    const labelOf = (key) => statuses.find((status) => status.key === key)?.label ?? key;

    /** One person's own attendance once this week's register is finished (or not yet). */
    function ownRecordOf(person, { finishedThisWeek }) {
      const rows = [];
      for (const weekNumber of weeks) {
        if (weekNumber > thisWeek) break;
        if (weekNumber === thisWeek && person.groupKey === facilitated.key && !finishedThisWeek) continue;
        const mark = markOf(person, weekNumber);
        if (!mark) continue;
        rows.push({ weekNumber, dateKey: sessionOf(groupOf(person.groupKey), weekNumber).dateKey, status: mark });
      }
      return {
        rows,
        held: rows.length,
        inFull: rows.filter((row) => row.status === "present").length,
      };
    }

    /**
     * What a person's "Your marks" card draws (board wk-programme): a mark for
     * every session of their group's from week 1, the week they joined; the
     * week's own mark once its register is finished (`ownRecordOf`), and "Not
     * yet" until then and for every session still to come. Each mark is said
     * whole to a screen reader ("Week 1, Fri 9 Oct: Present": `markWords`)
     * over its letter, with its date under it ("9 Oct"). Next week's date is
     * the day it was moved to once Fern has moved it (`moved`).
     */
    function marksOf(person, { finishedThisWeek, moved }) {
      const group = groupOf(person.groupKey);
      const marked = new Map(ownRecordOf(person, { finishedThisWeek }).rows.map((row) => [row.weekNumber, row.status]));
      return weeks.map((weekNumber) => {
        const dateKey =
          moved && group === facilitated && weekNumber === nextWeek ? movedDateKey : sessionOf(group, weekNumber).dateKey;
        const status = marked.get(weekNumber) ?? null;
        const word = status ? labelOf(status) : NOT_YET.word;
        const glyph = status ? MARK_LETTER[status] : NOT_YET.glyph;
        return { kind: status ?? "not-yet", word, glyph, name: `Week ${weekNumber}, ${dayLabel(dateKey)}: ${word}`, date: dayMonthLabel(dateKey) };
      });
    }

    /** A group's session in one week, with what the clock says of it now, once Fern has moved next week's. */
    function sessionNow(group, weekNumber, now = new Date()) {
      const base = sessionOf(group, weekNumber);
      const session =
        group === facilitated && weekNumber === nextWeek
          ? (() => {
              const startsAt = londonWallClockToInstant(movedDateKey, MOVE.startTimeLocal);
              return {
                ...base,
                dateKey: movedDateKey,
                startsAt,
                endsAt: new Date(startsAt.getTime() + group.durationMinutes * 60_000),
              };
            })()
          : base;
      return {
        ...session,
        started: session.startsAt.getTime() <= now.getTime(),
        ended: session.endsAt.getTime() <= now.getTime(),
      };
    }

    /** The latest run of absences over marked sessions that happened: `absentWeeks`, or [] under two. */
    function absentRun(person, now = new Date()) {
      const run = [];
      for (const weekNumber of [...weeks].reverse()) {
        const mark = markOf(person, weekNumber);
        if (!mark || !sessionNow(groupOf(person.groupKey), weekNumber, now).started) continue;
        if (mark !== "absent") break;
        run.unshift(weekNumber);
      }
      return run.length >= ABSENT_IN_A_ROW ? run : [];
    }

    /**
     * Everything the Overview's "Needs attention" lists once every register is
     * finished, in its order, as [title, detail]: `buildProgrammeOverview` in
     * src/lib/courses/programmeOverview.ts, restated (T2's, with the move).
     */
    function attentionItems(now = new Date()) {
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
        const sessions = weeks
          .map((weekNumber) => sessionNow(group, weekNumber, now))
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        const nextAt = sessions.findIndex((session) => !session.started);
        if (nextAt <= 0) continue;
        const previous = sessions[nextAt - 1];
        const next = sessions[nextAt];
        if (!previous.ended || next.weekNumber <= plan.published) continue;
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
      // Every register of the term is finished by now: nothing to chase.
      return items;
    }

    // ---- The register ------------------------------------------------------------

    /** What this target's settings make of a register's ending, read off the register's own GET as Fern. */
    let ending = null;
    /** "finished" or "pushed". */
    const word = () => (ending.scheduled ? "finished" : "pushed");

    async function readEnding() {
      const answer = await fetchAs(facilitatorPage, `/api/courses/groups/${enc(facilitated.id)}/attendance`);
      assert.equal(answer.status, 200, `the register's GET answered ${answer.status}: ${JSON.stringify(answer.body)}`);
      assert.ok(answer.body?.ending, "the register's GET carries no ending");
      return answer.body.ending;
    }

    const grid = () => facilitatorPage.getByTestId("attendance-grid");
    /** One column's header, by week (1 = the first). */
    const headerOf = (weekNumber) => facilitatorPage.getByTestId("attendance-session").nth(weekNumber - 1);
    /** A person's cell in a week, a button while it can be marked and an image once it is locked. */
    const cellOf = (person, weekNumber, role = "button") =>
      grid().getByRole(role, { name: new RegExp(`^${escapeRegExp(person.first)}, week ${weekNumber}: `) });

    /** The status a cell announces: "Ada, week 3: Present. Sets Late." reads "Present". */
    async function statusOf(cell) {
      const label = (await cell.getAttribute("aria-label")) ?? "";
      const match = /week \d+: ([^.]+)\./.exec(label);
      assert.ok(match, `no status in the cell's accessible name: ${JSON.stringify(label)}`);
      return match[1];
    }

    /** One tap on a cell, the route's answer read before the next one. */
    async function tap(cell) {
      const [res] = await Promise.all([
        facilitatorPage.waitForResponse(
          (r) => new URL(r.url()).pathname.endsWith("/attendance") && r.request().method() === "POST",
          { timeout: WAIT_MS },
        ),
        cell.click(),
      ]);
      const body = await res.json().catch(() => null);
      assert.ok(res.ok() && body?.ok === true, `the register refused a mark: ${res.status()} ${JSON.stringify(body)}`);
      assert.equal(body.weekNumber, thisWeek, "the mark landed in another week");
      return body;
    }

    /** Reads the register's foot and holds it to the words of the ending the GET answered. */
    async function assertFoot(currentEnding) {
      const words = endingWords(currentEnding);
      const foot = facilitatorPage.getByTestId("register-ending");
      await foot.waitFor({ timeout: WAIT_MS });
      assert.equal(
        await textOf(foot.getByRole("heading", { level: 3 })),
        `Week ${thisWeek} register`,
        "the register's foot is not about this week's register",
      );
      const finished = currentEnding.focus?.finished === true;
      const paragraphs = await textsOf(foot.locator("p"));
      assert.deepEqual(
        paragraphs,
        [currentEnding.focus.line, ...(finished ? [] : [words.effect]), ...words.notes],
        "the register's foot does not say what this target's ending says",
      );
      const button = foot.getByRole("button", { name: words.button, exact: true });
      assert.equal(await button.count(), finished ? 0 : 1, `the foot ${finished ? "still offers" : "does not offer"} ${words.button}`);
      return words;
    }

    // ---- The member's programme page ---------------------------------------------

    /** Opens a member's programme page and hands back the overview route's answer, as the page asked it. */
    async function openProgrammePage(pg) {
      const answered = pg
        .waitForResponse(
          (r) => new URL(r.url()).pathname === `/api/courses/runs/${state.runId}/overview` && r.request().method() === "GET",
          { timeout: WAIT_MS },
        )
        .catch((err) => err);
      await pg.goto(`${origin}${learnPath}`, { waitUntil: "domcontentloaded" });
      const response = await answered;
      if (response instanceof Error) throw response;
      return okBody(response, "The programme page's overview");
    }

    /**
     * The "Your marks" card as drawn (board wk-programme): each mark's name,
     * its letter and its item's words (the letter, then the date under it),
     * the legend's items, and everything the card says. The marks are the
     * list whose items are images; the legend is the list named for what they
     * mean, and its letters are hidden from a screen reader.
     */
    async function readMarks(pg) {
      const card = pg.getByRole("region", { name: "Your marks", exact: true });
      await card.waitFor({ timeout: WAIT_MS });
      const items = card.getByRole("list").filter({ has: pg.getByRole("img") }).getByRole("listitem");
      const marks = [];
      for (let i = 0; i < (await items.count()); i += 1) {
        const image = items.nth(i).getByRole("img");
        marks.push({ name: (await image.getAttribute("aria-label")) ?? "", glyph: await textOf(image), text: await textOf(items.nth(i)) });
      }
      const legend = await textsOf(card.getByRole("list", { name: MARKS_LEGEND_LABEL, exact: true }).getByRole("listitem"));
      return { marks, legend, said: await textOf(card) };
    }

    /** Holds a member's own record, on the route's answer and on the page, to what the registers say. */
    async function assertOwnRecord(pg, person, body, { finishedThisWeek, moved = false }) {
      const expected = ownRecordOf(person, { finishedThisWeek });
      const sessions = body.ownAttendance?.sessions ?? [];
      assert.deepEqual(
        sessions.map((session) => [session.weekNumber, session.dateKey, session.status]),
        expected.rows.map((row) => [row.weekNumber, row.dateKey, row.status]),
        `${person.first}'s own sessions, from the overview route`,
      );
      assert.equal(body.ownAttendance.rollup.sessionsHeld, expected.held, `${person.first}'s sessions held`);
      assert.equal(body.ownAttendance.rollup.attendedInFull, expected.inFull, `${person.first}'s sessions in full`);

      // Drawn as board wk-programme draws "Your marks", with no target (C26).
      // The page this replaced drew a "Your progress" card whose line counted
      // the sessions attended in full ("You have been at 1 of 2 sessions in
      // full so far.") over a row for each finished register; that line is
      // gone on purpose. So every session's mark is held here instead, which
      // says more than the count did: each finished week's own mark, the
      // unfinished week as "Not yet", and every week to come.
      const marks = marksOf(person, { finishedThisWeek, moved });
      const drawn = await waitFor(`${person.first}'s marks to show ${marks.length} sessions`, async () => {
        const read = await readMarks(pg);
        return read.marks.length === marks.length ? read : null;
      });
      assert.deepEqual(
        drawn.marks,
        marks.map((mark) => ({ name: mark.name, glyph: mark.glyph, text: `${mark.glyph}${mark.date}` })),
        `${person.first}'s marks on their programme page`,
      );
      const used = new Set(marks.map((mark) => mark.kind));
      const legend = MARK_ORDER.filter((kind) => used.has(kind)).map((kind) => {
        const mark = marks.find((each) => each.kind === kind);
        return `${mark.glyph}${mark.word}`;
      });
      assert.deepEqual(drawn.legend, legend, `${person.first}'s legend is not the marks they were shown, in the page's order`);
      assert.ok(drawn.said.endsWith(MARKS_LINE), `${person.first}'s marks do not end with the board's line: ${drawn.said}`);
      // No count of any kind on the card: no "1 of 2", no "in full".
      assert.ok(!/\d+ of \d+/.test(drawn.said) && !/in full/i.test(drawn.said), `${person.first}'s marks carry a count: ${drawn.said}`);
      // Nothing of anybody else's: nobody else named on the card, and no other
      // person's uid anywhere in what the page was handed.
      for (const other of [...state.people, fern].filter((each) => each !== person)) {
        assert.ok(!drawn.said.includes(other.first), `${person.first}'s marks name ${other.first}`);
      }
      // And nothing else at all: its heading, the marks, the legend and the
      // line are the whole card, so no sentence, however it is worded, counts
      // them. (Text content joins the card's elements with no space between.)
      assert.equal(
        drawn.said,
        ["Your marks", ...marks.map((mark) => `${mark.glyph}${mark.date}`), ...legend, MARKS_LINE].join(""),
        `${person.first}'s marks card says something besides its heading, marks, legend and line`,
      );
      for (const other of state.people.filter((each) => each !== person)) {
        assert.ok(!JSON.stringify(body).includes(other.uid), `${person.first}'s programme page was handed ${other.first}'s uid`);
      }
    }

    /** A member's Updates, from the route's answer and as drawn: [title, line, message]. */
    async function readUpdates(pg) {
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
      return drawn;
    }

    // ---- Mail --------------------------------------------------------------------

    /** The messages to one fixture address, oldest first. */
    async function mailTo(address, count) {
      const summaries = await waitForMessagesTo(address, { count, timeoutMs: WAIT_MS });
      return summaries.slice().reverse();
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

    /** Neither half of an email names the facilitated group's meeting link, nor its host. */
    function assertNoMeetingLink(email, who) {
      for (const [part, body] of [
        ["HTML", email.html],
        ["text", email.text],
      ]) {
        assert.ok(
          !body.includes(facilitated.meetingUrl) && !body.includes(new URL(facilitated.meetingUrl).host),
          `${who}'s ${part} part carries the meeting link. A link to join lives on the site only.`,
        );
      }
    }

    /** Every send log row to one address, by kind. */
    const sendKindsTo = async (address) =>
      (await fixtureQuery("emailSends").where("to", "==", address).get()).docs
        .map((doc) => String(doc.data()?.kind ?? ""))
        .sort();

    /** How many messages each of the term's people has in Mailpit right now. */
    const mailCounts = async () => {
      const out = {};
      for (const account of [...state.people, fern]) out[account.first] = (await messagesTo(account.email)).length;
      return out;
    };

    try {
      await step("the admin approves the two members of the facilitated group and the facilitator", async () => {
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
        // The other group's member never signs in, so waits.
        const waiting = await readUserDoc(cleo.uid);
        assert.equal(waiting?.role, "pending", `${cleo.first} was approved, and nothing on this journey approves her`);
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
          const [handOver] = await Promise.all([
            responseTo(adminPage, "/run/hand-over", "POST"),
            panel.getByRole("button", { name: `Hand over ${holding} people`, exact: true }).click(),
          ]);
          const receipt = await okBody(handOver, "Handing over");
          assert.deepEqual(receipt.receipt, { handedOver: holding, alreadyThere: 0 }, "the hand-over's receipt");
          await panel.getByRole("status").filter({ hasText: `${holding} people handed over.` }).waitFor({ timeout: WAIT_MS });
          // Handing over places nobody and tells nobody: the places stay as Publish left them.
          for (const person of state.people) {
            const place = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).get()).data();
            assert.equal(place?.groupId, groupOf(person.groupKey).id, `${person.first}'s place moved`);
            assert.ok(place?.allocatedEmailAt, `${person.first} is no longer told`);
          }
        },
      );

      await step("the admin appoints a facilitator to the group whose register nobody has marked", async () => {
        activePage = adminPage;
        await adminPage.goto(facilitatorsUrl, { waitUntil: "domcontentloaded" });
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
        await card
          .getByText(`${facilitated.name}’s facilitators are saved. Nobody was emailed.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        assert.deepEqual(await sendKindsTo(fern.email), ["application"], "appointing a facilitator emailed them");
      });

      await step("the facilitator opens their group: the roster, this week's session and the register", async () => {
        activePage = facilitatorPage;
        await signIn(facilitatorPage, fern);
        await facilitatorPage.goto(`${origin}${groupPagePath}`, { waitUntil: "domcontentloaded" });
        await facilitatorPage.getByRole("heading", { name: facilitated.name, level: 1 }).waitFor({ timeout: WAIT_MS });

        // What a group's facilitator is offered: writing to the group, with the
        // count it emails, and changing a session.
        const write = facilitatorPage.getByRole("link", { name: `Write to ${facilitated.name} (${inGroup.length})`, exact: true });
        await write.waitFor({ timeout: WAIT_MS });
        await facilitatorPage
          .getByText(`Posts an update to the group and emails ${inGroup.length} people. Replies go to ${REPLY_TO}.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        assert.equal(
          await facilitatorPage.getByRole("link", { name: "Change a session", exact: true }).getAttribute("href"),
          `${groupPagePath}/sessions`,
          "Change a session does not lead to the group's sessions",
        );

        // Since board wk-fac-group the page is drawn on the server, in the
        // board's words. The head: the group, and the line of its programme,
        // day, time and room. Fern facilitates alone, so the line names no
        // other facilitator.
        const headLine = flat(await facilitatorPage.locator("main header p").first().innerText());
        for (const expected of [whenWeekly(facilitated), facilitated.room]) {
          assert.ok(headLine.includes(expected), `the head's line does not say ${JSON.stringify(expected)}: ${headLine}`);
        }
        assert.ok(!headLine.includes(" with "), `the head's line names another facilitator: ${headLine}`);

        // The ticket: the session the group meets at next (this week's has
        // happened), its room, who is expected, the way to the register, and
        // its way to join here, on the site.
        const card = facilitatorPage.getByTestId("session-card");
        await card.waitFor({ timeout: WAIT_MS });
        const said = flat(await card.innerText());
        for (const expected of [
          `Your next session · week ${nextWeek}`.toUpperCase(),
          `${dayLabel(nextSession.dateKey)}, ${clockWords(facilitated.startTimeLocal)}`,
          facilitated.room,
          `${inGroup.length} expected`,
          "Take the register",
          "The link is here, not in your emails, so it can’t be forwarded.",
        ]) {
          assert.ok(said.includes(expected), `the ticket does not say ${JSON.stringify(expected)}: ${said}`);
        }
        assert.equal(
          await card.getByRole("link", { name: "Join online", exact: true }).getAttribute("href"),
          facilitated.meetingUrl,
          "the facilitator's way to join is not the group's",
        );
        assert.equal(
          await card.getByRole("link", { name: "Take the register", exact: true }).getAttribute("href"),
          `${groupPagePath}/register`,
          "Take the register does not lead to the group's register",
        );

        // Your group: the group's two people by their whole names, each with
        // the marks of the two finished registers (this week's nobody has
        // opened), and the board's line about names.
        ending = await readEnding();
        const roster = facilitatorPage.getByTestId("group-roster");
        await roster.waitFor({ timeout: WAIT_MS });
        assert.equal(flat(await roster.getByRole("heading", { level: 2 }).innerText()), "Your group");
        const rows = roster.getByRole("list", { name: "Members of this group" }).getByRole("listitem");
        assert.equal(await rows.count(), inGroup.length, "Your group does not list the group's two people");
        // In the order of their whole names, as the lead's tabs list people.
        const byWholeName = [...inGroup].sort((a, b) => a.displayName.localeCompare(b.displayName, "en-GB") || a.uid.localeCompare(b.uid));
        for (const [index, person] of byWholeName.entries()) {
          const row = rows.nth(index);
          assert.ok(flat(await row.innerText()).startsWith(`${initialsOf(person.displayName)} ${person.displayName}`), `row ${index} is not ${person.displayName}`);
          const marks = row.getByRole("img");
          assert.equal(await marks.count(), thisWeek - 1, `${person.first}'s row has a mark for a register that is not finished`);
          for (const weekNumber of weeks.filter((n) => n < thisWeek)) {
            const mark = marks.nth(weekNumber - 1);
            assert.equal(await mark.getAttribute("aria-label"), `Week ${weekNumber}: ${labelOf(markOf(person, weekNumber))}`);
            assert.equal(flat(await mark.innerText()), MARK_LETTER[markOf(person, weekNumber)]);
          }
        }
        await roster.getByText("Names only. Email addresses stay with admins.", { exact: true }).waitFor({ timeout: WAIT_MS });

        // Registers: the two finished, with how many came, and this week's,
        // which has happened and nobody has finished, each leading to the register.
        const registers = facilitatorPage.getByRole("region", { name: "Registers", exact: true });
        const registerRows = registers.getByRole("listitem");
        assert.equal(await registerRows.count(), thisWeek, "the Registers card does not list each week so far");
        for (const weekNumber of weeks.filter((n) => n <= thisWeek)) {
          const text = flat(await registerRows.nth(weekNumber - 1).innerText());
          const finished = weekNumber < thisWeek;
          const came = inGroup.filter((person) => CAME.has(markOf(person, weekNumber))).length;
          const expected = [
            `Week ${weekNumber}`,
            dayLabel(sessionOf(facilitated, weekNumber).dateKey).toUpperCase(),
            finished ? (ending.scheduled ? "Finished" : "Pushed") : ending.scheduled ? "Not finished" : "Not pushed",
            ...(finished ? [`${came} of ${inGroup.length} came`] : []),
            "See it",
          ].join(" ");
          assert.equal(text, expected, `week ${weekNumber}'s register row`);
        }

        // The register itself is a page of its own beside the group's (board
        // wk-register), and "Take the register" leads there.
        await card.getByRole("link", { name: "Take the register", exact: true }).click();
        await facilitatorPage
          .getByRole("heading", { name: `${facilitated.name}’s register`, level: 1 })
          .waitFor({ timeout: WAIT_MS });
        assert.equal(new URL(facilitatorPage.url()).pathname, `${groupPagePath}/register`);

        // The register: a column a week so far, the first two finished and
        // locked against her, this week's open and nobody marked in it.
        await grid().waitFor({ timeout: WAIT_MS });
        const caption = await textOf(grid().locator("caption"));
        assert.ok(caption.startsWith(`Attendance for ${facilitated.name}`), `the register's caption: ${caption}`);
        assert.ok(caption.includes(`${inGroup.length} members, ${thisWeek} sessions so far.`), `the register's caption: ${caption}`);
        assert.equal(await facilitatorPage.getByTestId("attendance-session").count(), thisWeek, "the register's columns are not the weeks so far");
        ending = await readEnding();
        console.log(
          `[facilitators-week-spec] registers are ${word()} here; the reminder job is ${ending.reminder ? "on" : "off"}, ` +
            `the task job ${ending.task ? "on" : "off"}.`,
        );
        for (const weekNumber of weeks.filter((n) => n <= thisWeek)) {
          const head = await textOf(headerOf(weekNumber));
          const done = weekNumber < thisWeek;
          for (const expected of [
            `Week ${weekNumber}`,
            dayLabel(sessionOf(facilitated, weekNumber).dateKey),
            `E2E week ${weekNumber} reading`,
            done ? `${inGroup.length}/${inGroup.length}` : `0/${inGroup.length}`,
          ]) {
            assert.ok(head.includes(expected), `week ${weekNumber}'s column does not say ${JSON.stringify(expected)}: ${head}`);
          }
          assert.equal(head.includes(ending.scheduled ? "Finished" : "Pushed"), done, `week ${weekNumber}'s column and its badge`);
          for (const person of inGroup) {
            if (done) {
              const cell = cellOf(person, weekNumber, "img");
              assert.equal(
                await cell.getAttribute("aria-label"),
                `${person.first}, week ${weekNumber}: ${labelOf(markOf(person, weekNumber))}. This register is finished and locked.`,
                `${person.first}'s week ${weekNumber} is not locked against the facilitator`,
              );
            } else {
              assert.equal(
                await cellOf(person, weekNumber).getAttribute("aria-label"),
                `${person.first}, week ${weekNumber}: not marked. Sets ${statuses[0].label}.`,
                `${person.first}'s week ${weekNumber} is not an unmarked cell she can mark`,
              );
            }
          }
        }

        // The foot: this week's register, the button of this target's ending, and its words.
        assert.equal(ending.groupName, facilitated.name, "the register's ending names another group");
        assert.equal(ending.focus?.weekNumber, thisWeek, "the register's foot is about another week");
        assert.equal(ending.focus?.finished, false, "this week's register is already finished");
        assert.equal(
          ending.focus?.line,
          `${londonDayLabel(thisSession.startsAt)} · ${londonClockLabel(thisSession.startsAt)} · ${facilitated.room}`,
          "the register's session line",
        );
        assert.equal(ending.hasNext, true, "the register says this is the group's last session");
        // What pressing this week's register emails, as the GET answers it for
        // the foot and the confirm alike, from the push's own decision: week 4
        // is not published, so while the push sends next week's email it sends
        // nobody one, and on the schedule finishing never does.
        assert.deepEqual(
          ending.pushEmails,
          {
            [weekDocId(thisWeek)]: ending.scheduled
              ? { kind: "scheduled" }
              : { kind: "held", why: "unpublished", weekNumber: nextWeek },
          },
          "the register's GET does not say what pressing this week's register emails",
        );
        await assertFoot(ending);
      });

      await step("the facilitator marks this week's register in every state it offers, and every mark is saved", async () => {
        activePage = facilitatorPage;
        // Ada: one tap, the first state. Ben: one tap per state the register
        // offers, so every state lands, in the order the cycle goes.
        const adaCell = cellOf(ada, thisWeek);
        await tap(adaCell);
        assert.equal(await statusOf(adaCell), statuses[0].label, `${ada.first}'s first tap did not land on ${statuses[0].label}`);
        const benCell = cellOf(ben, thisWeek);
        for (const status of statuses) {
          await tap(benCell);
          assert.equal(await statusOf(benCell), status.label, `${ben.first}'s cell did not land on ${status.label}`);
        }
        // Every tap saves, and says so with the time, in London.
        await facilitatorPage
          .locator('[role="status"]')
          .filter({ hasText: /^✓?\s*Saved \d{1,2}(:\d{2})?(am|pm)$/ })
          .first()
          .waitFor({ timeout: WAIT_MS });
        const head = await textOf(headerOf(thisWeek));
        assert.ok(head.includes(`${inGroup.length}/${inGroup.length}`), `this week's column does not say everybody is marked: ${head}`);

        // Reloaded, so what is read is what the server stored.
        await facilitatorPage.reload({ waitUntil: "domcontentloaded" });
        await grid().waitFor({ timeout: WAIT_MS });
        for (const person of inGroup) {
          const cell = cellOf(person, thisWeek);
          await cell.waitFor({ timeout: WAIT_MS });
          assert.equal(await statusOf(cell), labelOf(fernMarks[person.key]), `${person.first}'s mark did not survive a reload`);
        }
        const register = (await fixtureDoc("courseAttendance", registerId).get()).data();
        assert.deepEqual(
          register?.records,
          Object.fromEntries(inGroup.map((person) => [person.uid, fernMarks[person.key]])),
          "the stored register is not what was marked",
        );
        assert.ok(register?.markedByUid === fern.uid, "the register does not name the facilitator who marked it");
        assert.ok(!register?.pushedAt, "marking the register finished it");
        // Still the same ending: a draft with its button.
        ending = await readEnding();
        assert.equal(ending.focus?.finished, false, "marking the register finished it");
        await assertFoot(ending);
      });

      await step("a member of the group sees no mark from a register that is not finished", async () => {
        activePage = adaPage;
        await signIn(adaPage, ada);
        const body = await openProgrammePage(adaPage);
        await assertOwnRecord(adaPage, ada, body, { finishedThisWeek: false });
        // Said once more, by itself: Fern has marked this week's register but
        // not finished it, so this week's mark reads "Not yet" whatever she put.
        const thisWeeks = (await readMarks(adaPage)).marks[thisWeek - 1];
        assert.equal(
          thisWeeks?.name,
          `Week ${thisWeek}, ${dayLabel(thisSession.dateKey)}: ${NOT_YET.word}`,
          `${ada.first} sees a mark from a register that is not finished`,
        );
      });

      await step("the facilitator finishes the register, which locks it, in the words of this target's ending", async () => {
        activePage = facilitatorPage;
        const before = await mailCounts();
        const words = endingWords(ending);
        await facilitatorPage.getByTestId("register-ending").getByRole("button", { name: words.button, exact: true }).click();
        const confirm = facilitatorPage.getByTestId("push-confirm");
        await confirm.waitFor({ timeout: WAIT_MS });
        assert.equal(
          await textOf(confirm.getByRole("heading", { level: 2 })),
          ending.scheduled ? `Finish the week ${thisWeek} register?` : `Push week ${thisWeek}?`,
          "the confirm's title",
        );
        assert.deepEqual(
          await textsOf(confirm.getByRole("listitem")),
          [
            ending.scheduled
              ? "Nobody’s emailed. Next week’s email goes on its own schedule, whatever happens here."
              : // While next week's email is not on its schedule, the confirm
                // says what the push will do with it, from the register's GET:
                // the session after this one in the group's whole schedule
                // (week 4, not the register's columns, which hold only the
                // sessions that have started), and the push's own decision
                // about it. Week 4 is not published, so nobody is emailed, and
                // the confirm says why before the press, as the push's answer
                // says it after.
                `Nobody is emailed: week ${nextWeek} isn’t published yet, so the group won’t be sent a reminder.`,
            "The register locks. An admin can still correct it afterwards, and every change they make is recorded.",
            "Everyone sees their mark, and everyone’s attendance figures are rebuilt from this register.",
          ],
          "the confirm does not say what finishing does",
        );
        // Everybody is marked, so nobody is about to be counted absent for want of a mark.
        assert.ok(!(await textOf(confirm)).includes("no mark yet"), "the confirm warns of somebody unmarked");

        // Week 4 is not published, so while the push sends next week's email it
        // has nothing to send yet, and while the schedule sends it, finishing
        // never does: either way, this press emails nobody.
        const reason = ending.scheduled
          ? "Next week’s email goes on its schedule, so finishing the register emailed nobody."
          : `Week ${nextWeek} isn't published yet, so the group wasn't sent a reminder. Publish it and use the run's catch-up send.`;
        const toast = toastOf(
          facilitatorPage,
          ending.scheduled ? "Register finished. Everyone can see their mark, and nobody was emailed." : `Register locked. ${reason}`,
        );
        const [, response] = await Promise.all([
          toast.waitFor({ timeout: WAIT_MS }),
          responseTo(facilitatorPage, "/attendance/push", "POST"),
          facilitatorPage.getByTestId("push-confirm-submit").click(),
        ]);
        assert.deepEqual(response.request().postDataJSON(), { weekNumber: thisWeek, occurrence: 1 }, "the press did not name this week's register");
        assert.deepEqual(
          await okBody(response, "Finishing the register"),
          {
            ok: true,
            sessionKey: weekDocId(thisWeek),
            alreadyPushed: false,
            mirrored: inGroup.length,
            sent: 0,
            skipped: 0,
            forced: false,
            reason,
            scheduled: ending.scheduled,
          },
          "finishing's answer",
        );
        // The toast covers the page while it is up, so a press before it goes lands on its backdrop.
        await toast.waitFor({ state: "hidden", timeout: WAIT_MS });

        // The column is finished, and locked against its facilitator: her cells
        // are no longer buttons, and the draft's controls have gone.
        await waitFor("this week's column to say it is finished", async () =>
          (await textOf(headerOf(thisWeek))).includes(ending.scheduled ? "Finished" : "Pushed") ? true : null,
        );
        for (const person of inGroup) {
          assert.equal(
            await cellOf(person, thisWeek, "img").getAttribute("aria-label"),
            `${person.first}, week ${thisWeek}: ${labelOf(fernMarks[person.key])}. This register is finished and locked.`,
            `${person.first}'s mark is not locked against the facilitator`,
          );
          assert.equal(await cellOf(person, thisWeek).count(), 0, `${person.first}'s cell is still a button`);
        }
        // Each by its literal id, so the test-id guard can see both sides.
        const finishedColumn = headerOf(thisWeek);
        for (const [what, control] of [
          ["its finish button", finishedColumn.getByTestId("attendance-push")],
          ["its mark-the-rest button", finishedColumn.getByTestId("attendance-bulk")],
          ["its did-not-happen switch", finishedColumn.getByTestId("attendance-held-toggle")],
          ["an admin's resend", finishedColumn.getByTestId("attendance-resend")],
        ]) {
          assert.equal(await control.count(), 0, `the finished column still offers the facilitator ${what}`);
        }
        ending = await readEnding();
        assert.equal(ending.focus?.weekNumber, thisWeek, "the register's foot moved to another week");
        assert.equal(ending.focus?.finished, true, "the register's GET does not say this week's register is finished");
        await assertFoot(ending);

        // Neither lane takes a mark from her now: the draft lane is locked for
        // everybody, and correcting a finished register is an admin's.
        const lane = (method) =>
          fetchAs(facilitatorPage, `/api/courses/groups/${enc(facilitated.id)}/attendance`, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ weekNumber: thisWeek, occurrence: 1, marks: [{ uid: ada.uid, status: "late" }] }),
          });
        const draft = await lane("POST");
        assert.deepEqual(
          [draft.status, draft.body?.error],
          [409, "This register has been pushed, so it's locked. An admin can still correct it."],
          "the draft lane took a mark on a finished register",
        );
        const correction = await lane("PATCH");
        assert.deepEqual(
          [correction.status, correction.body?.error],
          [403, "Only an admin can change a register after it has been pushed."],
          "a facilitator corrected a finished register",
        );

        // The record: stamped by her, and each person's tally rebuilt from it.
        const register = (await fixtureDoc("courseAttendance", registerId).get()).data();
        assert.ok(register?.pushedAt, "the register carries no stamp saying it is finished");
        assert.ok(register?.pushedByUid === fern.uid, "the register does not name the facilitator who finished it");
        assert.deepEqual(
          register?.records,
          Object.fromEntries(inGroup.map((person) => [person.uid, fernMarks[person.key]])),
          "finishing changed a mark",
        );
        for (const person of inGroup) {
          const record = ownRecordOf(person, { finishedThisWeek: true });
          const tally = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).get()).data()?.attendance;
          const count = (key) => record.rows.filter((row) => row.status === key).length;
          assert.deepEqual(
            [tally?.sessionsHeld, tally?.attendedInFull, tally?.late, tally?.leftEarly, tally?.absent, tally?.excused, tally?.lastPushedSessionKey],
            [record.held, record.inFull, count("late"), count("left-early"), count("absent"), count("excused"), weekDocId(thisWeek)],
            `${person.first}'s tally was not rebuilt from the finished registers`,
          );
        }
        const audit = (await fixtureQuery("courseAudit").where("runId", "==", state.runId).get()).docs
          .map((doc) => doc.data())
          .filter((row) => row.kind === "attendance-push");
        assert.equal(audit.length, 1, `finishing left ${audit.length} audit rows`);
        assert.ok(audit[0].groupId === facilitated.id && audit[0].actorUid === fern.uid, "the audit row is not the facilitator's, about her group");

        // Nobody was emailed.
        assert.deepEqual(await mailCounts(), before, "finishing the register emailed somebody");
        const aboutRun = await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get();
        assert.equal(aboutRun.size, 0, "finishing the register logged a send about the run");
      });

      await step(
        "the member reads their own marks for the week on their programme page, and nothing of anybody else's",
        async () => {
          activePage = adaPage;
          const body = await openProgrammePage(adaPage);
          await assertOwnRecord(adaPage, ada, body, { finishedThisWeek: true });
        },
      );

      await step("the facilitator moves next week's session with a reason, and the button says how many it emails", async () => {
        activePage = facilitatorPage;
        // From the group's page, the way a facilitator is offered it: back
        // from the register (its link to the group, over its title), then the
        // button.
        await facilitatorPage.getByRole("link", { name: facilitated.name, exact: true }).click();
        await facilitatorPage.getByRole("heading", { name: facilitated.name, level: 1 }).waitFor({ timeout: WAIT_MS });
        assert.equal(new URL(facilitatorPage.url()).pathname, groupPagePath);
        await facilitatorPage.getByRole("link", { name: "Change a session", exact: true }).click();
        await facilitatorPage
          .getByRole("heading", { name: `${facilitated.name}’s sessions`, level: 1 })
          .waitFor({ timeout: WAIT_MS });
        await facilitatorPage
          .getByText("Each session from today to the group’s last. Changing one asks for a reason, and can tell the group.")
          .waitFor({ timeout: WAIT_MS });

        // One card a session still to come, in date order: next week's first.
        const cardOf = (weekNumber) =>
          facilitatorPage
            .getByRole("heading", { name: `Week ${weekNumber}`, level: 3, exact: true })
            .locator("xpath=ancestor::div[.//button][1]");
        const toCome = weeks.filter((n) => n > thisWeek);
        await cardOf(nextWeek).waitFor({ timeout: WAIT_MS });
        assert.deepEqual(
          (await textsOf(facilitatorPage.locator("main").getByRole("heading", { level: 3 }))).filter((name) =>
            /^Week \d+$/.test(name),
          ),
          toCome.map((n) => `Week ${n}`),
          "the group's sessions from today are not its weeks still to come",
        );
        const today = londonDateKey(new Date());
        for (const weekNumber of toCome) {
          const session = sessionOf(facilitated, weekNumber);
          const when = `${session.dateKey === today ? "Today" : dayLabel(session.dateKey)}, ${clockWords(facilitated.startTimeLocal)}`;
          assert.ok((await textOf(cardOf(weekNumber))).includes(when), `week ${weekNumber}'s card does not say ${when}`);
        }

        // The dialog for next week's session.
        await cardOf(nextWeek).getByRole("button", { name: "Change a session", exact: true }).click();
        const dialog = facilitatorPage.getByRole("dialog", { name: `Change ${facilitated.name}’s week ${nextWeek} session`, exact: true });
        await dialog.waitFor({ timeout: WAIT_MS });
        const moment = `${dayLabel(nextSession.dateKey)} · ${clockWords(facilitated.startTimeLocal)}`;
        await dialog.getByText(`${moment} · ${facilitated.room} · ${fern.first}`, { exact: true }).waitFor({ timeout: WAIT_MS });
        for (const option of [/^Hold it online/, /^Move it/, /^Cancel it, and keep pace/, /^Cancel it, and push the rest back a week/]) {
          assert.equal(await dialog.getByRole("radio", { name: option }).count(), 1, `the dialog does not offer ${option}`);
        }
        await dialog.getByText(`${fern.first} and admins can change a session.`, { exact: true }).waitFor({ timeout: WAIT_MS });
        // Nothing is chosen yet, so nothing can be pressed.
        const unchosen = dialog.getByRole("button", { name: `Change ${dayLabel(nextSession.dateKey)}’s session`, exact: true });
        await unchosen.waitFor({ timeout: WAIT_MS });
        assert.equal(await unchosen.isDisabled(), true, "the dialog can be pressed before anything is chosen");

        // Move it: a day later, at another time, in another room, with a reason.
        await dialog.getByRole("radio", { name: /^Move it/ }).check();
        await dialog.getByLabel("Day", { exact: true }).selectOption({ label: dayLabel(movedDateKey) });
        await dialog.getByLabel("Time", { exact: true }).fill(MOVE.time);
        await dialog.getByLabel("Room", { exact: true }).fill(MOVE.room);
        await dialog.getByLabel("Reason (the group sees this)", { exact: true }).fill(MOVE.reason);
        assert.equal(await dialog.getByRole("radio", { name: /^Move it/ }).isChecked(), true, "Move it is not chosen");

        // Tell the group, and the count on the button: both of the group's people.
        const tell = dialog.getByRole("switch");
        assert.equal(await tell.isChecked(), true, "Tell the group is off");
        await dialog
          .getByText(`Emails the ${inGroup.length} people in ${facilitated.name} and puts an update on their programme page.`, {
            exact: true,
          })
          .waitFor({ timeout: WAIT_MS });
        await dialog.getByText(`Emails ${inGroup.length} people`, { exact: true }).waitFor({ timeout: WAIT_MS });

        const press = dialog.getByRole("button", { name: `Move ${dayLabel(nextSession.dateKey)}’s session`, exact: true });
        const [changed, posted] = await Promise.all([
          responseTo(facilitatorPage, `/groups/${facilitated.id}/session/change`, "POST"),
          responseTo(facilitatorPage, `/runs/${state.runId}/updates`, "POST"),
          press.click(),
        ]);
        assert.deepEqual(
          changed.request().postDataJSON(),
          {
            week: nextWeek,
            dateKey: nextSession.dateKey,
            kind: "move",
            move: { dateKey: movedDateKey, time: MOVE.time, room: MOVE.room },
            reason: MOVE.reason,
            tell: true,
            emailCount: inGroup.length,
          },
          "the press did not send the session it names, the move, the reason and the count on its button",
        );
        assert.deepEqual(
          await okBody(changed, "Changing the session"),
          {
            ok: true,
            change: { kind: "move", weekNumber: nextWeek, dateKey: nextSession.dateKey, newDateKey: movedDateKey },
            update: { groupId: facilitated.id, title: UPDATE.title, message: UPDATE.message, emailCount: inGroup.length },
          },
          "the change's answer",
        );
        assert.deepEqual(
          posted.request().postDataJSON(),
          { to: "group", groupId: facilitated.id, title: UPDATE.title, message: UPDATE.message, email: true, emailCount: inGroup.length },
          "the update did not go to the group with the count on the button",
        );
        const postedBody = await okBody(posted, "Telling the group");
        assert.deepEqual(postedBody.email, { sent: inGroup.length, held: 0, suppressed: 0, failed: 0 }, "the update's email did not reach the group");
        await facilitatorPage
          .getByText(`${dayLabel(nextSession.dateKey)}’s session has moved. Posted and emailed to ${inGroup.length} people.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });

        // The card says what is true now: the new day and time, the room, and that it moved.
        const movedWhen = `${dayLabel(movedDateKey)}, ${clockWords(MOVE.startTimeLocal)}`;
        await waitFor("next week's card to say it moved", async () => {
          const said = await textOf(cardOf(nextWeek));
          return said.includes(movedWhen) && said.includes(MOVE.room) && said.includes("Moved") ? said : null;
        });

        // The records: the week's own arrangement and why, and the update, by her.
        const group = (await fixtureDoc("courseGroups", facilitated.id).get()).data();
        const weekId = weekDocId(nextWeek);
        assert.deepEqual(
          group?.sessionOverrides?.[weekId],
          { weekday: new Date(`${movedDateKey}T12:00:00Z`).getUTCDay(), startTimeLocal: MOVE.startTimeLocal, location: MOVE.room },
          "the group does not hold the moved session",
        );
        const record = group?.sessionChanges?.[weekId];
        assert.deepEqual(
          [record?.kind, record?.reason, record?.dateKey],
          ["moved", MOVE.reason, nextSession.dateKey],
          "the group does not record what changed and why",
        );
        assert.ok(record?.byUid === fern.uid, "the change does not name the facilitator who made it");
        const stored = (await fixtureQuery("courseUpdates").where("runId", "==", state.runId).get()).docs
          .map((doc) => doc.data())
          .filter((update) => update.title === UPDATE.title);
        assert.equal(stored.length, 1, `the update was stored ${stored.length} times`);
        assert.deepEqual(
          { to: stored[0].to, groupId: stored[0].groupId, message: stored[0].message, email: stored[0].email },
          {
            to: "group",
            groupId: facilitated.id,
            message: UPDATE.message,
            email: { planned: inGroup.length, sent: inGroup.length, held: 0, suppressed: 0, failed: 0, settled: true },
          },
          "the stored update",
        );
        assert.ok(stored[0].authorUid === fern.uid, "the stored update does not name the facilitator who wrote it");

        // Back on her group's page, the update is in the group's list, newest first.
        await facilitatorPage.getByRole("link", { name: "Back to the group", exact: true }).click();
        const list = facilitatorPage.getByRole("region", { name: "Updates", exact: true });
        await list.getByText(UPDATE.title, { exact: true }).waitFor({ timeout: WAIT_MS });
        const rows = list.getByRole("listitem");
        const said = [];
        for (let i = 0; i < (await rows.count()); i += 1) said.push(await textsOf(rows.nth(i).locator("summary > span")));
        const postedAt = new Date(state.weekThree.earlierUpdatePostedAt);
        assert.deepEqual(
          said,
          [
            [UPDATE.title, `${fern.first} → ${facilitated.name} · ${londonDayLabel(new Date())} · Emailed to ${inGroup.length}`],
            [EARLIER_UPDATE.title, `NAISI → Everyone · ${londonDayLabel(postedAt)} · Not emailed`],
          ],
          "the group page's updates",
        );
      });

      await step("the group's members read the change on their programme page", async () => {
        const today = londonDayLabel(new Date());
        const postedAt = new Date(state.weekThree.earlierUpdatePostedAt);
        const earlier = [
          EARLIER_UPDATE.title,
          `NAISI · to everyone on ${state.programmeName} · ${londonDayLabel(postedAt)}`,
          flat(EARLIER_UPDATE.message),
        ];

        /** One member's programme page: the change in Updates, and the session it moved, as the page is handed it. */
        async function readsTheChange(pg, person) {
          const updatesAnswer = pg
            .waitForResponse(
              (r) => new URL(r.url()).pathname === `/api/courses/runs/${state.runId}/updates` && r.request().method() === "GET",
              { timeout: WAIT_MS },
            )
            .catch((err) => err);
          const body = await openProgrammePage(pg);
          const answered = await updatesAnswer;
          if (answered instanceof Error) throw answered;
          const updates = await okBody(answered, `${person.first}'s updates`);
          assert.deepEqual(
            updates.updates.map((update) => [update.title, update.message, update.toWords]),
            [
              [UPDATE.title, UPDATE.message, `to ${facilitated.name}`],
              [EARLIER_UPDATE.title, EARLIER_UPDATE.message, `to everyone on ${state.programmeName}`],
            ],
            `${person.first}'s updates, from the route`,
          );
          assert.deepEqual(
            await readUpdates(pg),
            [[UPDATE.title, `${fern.first} · to ${facilitated.name} · ${today}`, UPDATE.message], earlier],
            `${person.first}'s Updates`,
          );
          // The session the group meets at next is the moved one: its day, its time and its room.
          const next = body.group?.calendar?.nextSession;
          assert.deepEqual(
            [next?.weekNumber, next?.dateKey, next?.startTimeLocal, next?.location, next?.weekNumbers],
            [nextWeek, movedDateKey, MOVE.startTimeLocal, MOVE.room, [nextWeek]],
            `${person.first}'s next session is not the moved one`,
          );
          // A move takes no evening off, so there is no notice of one.
          assert.equal(body.group?.sessionNotice, null, `${person.first} is told an evening is off`);

          // The page's ticket is the group's NEXT session (board wk-programme),
          // so the member reads the move there too: the day and hours it moved
          // to, its room, and that the room is not the group's own this week.
          // (The page this replaced drew THIS week's session in that place,
          // which a move does not touch, and this step held it unchanged; this
          // week's session is held below where the page now says it happened.)
          // The moved day is never the seed's day, so the ticket says "Your
          // next session" rather than "Tonight".
          assert.notEqual(movedDateKey, londonDateKey(new Date()), "the moved session is today, which this world never makes it");
          const ticket = pg.getByRole("region", { name: "Your next session", exact: true });
          await ticket.waitFor({ timeout: WAIT_MS });
          await ticket.getByText(`Your next session · week ${nextWeek}`, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(
            await textOf(ticket.getByRole("heading", { level: 2 })),
            sessionWhenLabel({ ...facilitated, startTimeLocal: MOVE.startTimeLocal }, movedDateKey),
            `${person.first}'s ticket is not the moved session's day and hours`,
          );
          const ticketSays = await textOf(ticket);
          for (const expected of [MOVE.room, "Room changed this week", "The link is here, not in your emails, so it can’t be forwarded."]) {
            assert.ok(ticketSays.includes(expected), `${person.first}'s ticket does not say ${JSON.stringify(expected)}: ${ticketSays}`);
          }
          assert.ok(!ticketSays.includes(facilitated.room), `${person.first}'s ticket still names the usual room: ${ticketSays}`);
          assert.equal(
            await ticket.getByRole("link", { name: "Join online", exact: true }).getAttribute("href"),
            facilitated.meetingUrl,
            `${person.first}'s way to join is not the group's`,
          );

          // This week is still week 3, and its session happened on its own
          // day; next week's row is on the day it moved to.
          const thisWeekCard = pg.getByRole("region", { name: "This week", exact: true });
          await thisWeekCard.getByText(`Week ${thisWeek} · E2E week ${thisWeek} reading`, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(
            await thisWeekCard.getByRole("link", { name: `Open week ${thisWeek}`, exact: true }).getAttribute("href"),
            `${learnPath}/weeks/${thisWeek}`,
            `${person.first}'s This week does not lead to week ${thisWeek}`,
          );
          const weekRows = pg.getByRole("region", { name: `The ${state.weekCount} weeks`, exact: true }).getByRole("listitem");
          assert.equal(await weekRows.count(), state.weekCount, `${person.first}'s weeks are not the run's ${state.weekCount}`);
          const thisRow = await textOf(weekRows.nth(thisWeek - 1));
          assert.ok(
            thisRow.startsWith(`Week ${thisWeek}`) && thisRow.includes(`${dayLabel(thisSession.dateKey)} · Done`),
            `${person.first}'s week ${thisWeek} does not say its session happened on its day: ${thisRow}`,
          );
          const nextRow = await textOf(weekRows.nth(nextWeek - 1));
          assert.ok(
            nextRow.startsWith(`Week ${nextWeek}`) &&
              nextRow.includes(dayLabel(movedDateKey)) &&
              !nextRow.includes(dayLabel(nextSession.dateKey)),
            `${person.first}'s week ${nextWeek} is not on the day it moved to: ${nextRow}`,
          );
          return body;
        }

        activePage = adaPage;
        await readsTheChange(adaPage, ada);

        activePage = benPage;
        await signIn(benPage, ben);
        const benBody = await readsTheChange(benPage, ben);
        // And his own marks, which are his and nobody else's: next week's
        // under the day it moved to.
        await assertOwnRecord(benPage, ben, benBody, { finishedThisWeek: true, moved: true });
      });

      await step(
        "the update's email reaches exactly the group's people, word for word, and none carries the meeting link",
        async () => {
          activePage = adminPage;
          const sentences = [
            UPDATE.title,
            "Sent as an important notice",
            "You are getting this because you are in this course group, so it reaches you whatever your " +
              "notification settings say, and it is never marketing.",
            UPDATE.message,
            `Sent by ${fern.first} · ${facilitated.name} · ${state.courseTitle} (${state.runLabel})`,
            FOOTER,
          ];
          // Each of the group's people: their approval, then the update.
          for (const person of inGroup) {
            const mail = await mailTo(person.email, 2);
            assert.equal(mail.length, 2, `${person.first} has ${mail.length} emails`);
            const email = await readEmail(mail[1]);
            assert.equal(email.subject, UPDATE.title, `${person.first}'s update's subject`);
            assertSays(email, { who: `${person.first}'s update`, sentences });
            assert.ok(email.replyTo.includes(REPLY_TO), `${person.first}'s update does not reply to ${REPLY_TO}`);
          }
          // Nobody outside the group, and never the writer: Cleo none, Fern her approval only.
          assert.deepEqual(await mailCounts(), { [ada.first]: 2, [ben.first]: 2, [cleo.first]: 0, [fern.first]: 1 }, "who was emailed");

          // The send log, by address and by what each send was about.
          for (const [account, kinds] of [
            [ada, ["application", "notice"]],
            [ben, ["application", "notice"]],
            [cleo, []],
            [fern, ["application"]],
          ]) {
            const logged = await waitFor(`${account.first}'s send rows`, async () => {
              const rows = await sendKindsTo(account.email);
              return rows.length >= kinds.length ? rows : null;
            });
            assert.deepEqual(logged, [...kinds].sort(), `${account.first}'s send rows`);
          }
          const aboutGroup = (await fixtureQuery("emailSends").where("referenceId", "==", facilitated.id).get()).docs
            .map((doc) => String(doc.data()?.kind ?? ""))
            .sort();
          assert.deepEqual(aboutGroup, inGroup.map(() => "notice"), "the update's sends are not all logged against the group");
          const aboutRun = await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get();
          assert.equal(aboutRun.size, 0, "something on this journey was sent about the run");

          // And not one message this journey caused names the meeting link.
          const everything = [];
          for (const account of [...state.people, fern]) {
            for (const summary of await messagesTo(account.email)) everything.push(await readEmail(summary));
          }
          assert.equal(everything.length, 5, `the journey caused ${everything.length} emails`);
          for (const email of everything) assertNoMeetingLink(email, JSON.stringify(email.subject));
        },
      );

      await step(
        "the lead's Overview and Sessions view, read as the admin, show the register finished and the session moved",
        async () => {
          activePage = adminPage;
          const now = new Date();
          const todayKey = londonDateKey(now);
          const tomorrowKey = shiftDateKey(todayKey, 1);
          const region = (name) => adminPage.getByRole("region", { name, exact: true });

          await adminPage.goto(overviewUrl, { waitUntil: "domcontentloaded" });
          // This week's sessions, in time: Fern's register finished, 1 came of 2,
          // and the other group's as the world left it.
          const sessions = region("Sessions this week");
          const cards = sessions.getByRole("article");
          await cards.first().waitFor({ timeout: WAIT_MS });
          const inTime = state.groups
            .map((group) => ({ group, session: sessionNow(group, thisWeek, now) }))
            .sort(
              (a, b) =>
                a.session.startsAt.getTime() - b.session.startsAt.getTime() ||
                ordered.indexOf(a.group) - ordered.indexOf(b.group),
            );
          assert.equal(await cards.count(), inTime.length, "this week's sessions are not one card a group");
          for (const [index, { group, session }] of inTime.entries()) {
            const card = cards.nth(index);
            assert.equal(await textOf(card.getByRole("heading", { level: 3 })), group.name, `card ${index + 1} is not ${group.name}'s`);
            const said = await textOf(card);
            const members = membersOf(group);
            const came = members.filter((person) => CAME.has(markOf(person, thisWeek))).length;
            const day =
              session.dateKey === todayKey ? "Today" : session.dateKey === tomorrowKey ? "Tomorrow" : londonDayLabel(session.startsAt);
            for (const expected of [
              `${day} · ${londonClockLabel(session.startsAt)}`,
              group.room,
              group === facilitated ? fern.displayName : "No facilitator yet",
              `Register ${word()}`,
              `${came} of ${members.length} came`,
            ]) {
              assert.ok(said.includes(expected), `${group.name}'s session card does not say ${JSON.stringify(expected)}: ${said}`);
            }
            assert.equal(
              await card.getByRole("link", { name: "See it", exact: true }).getAttribute("href"),
              `${programmePathOnSite}/attendance?group=${enc(group.id)}`,
              `${group.name}'s See it does not lead to its row on Attendance`,
            );
          }

          // Needs attention: no register left to chase, and the week nobody can
          // open yet, from the day the groups meet again: the moved day.
          const attention = region("Needs attention");
          await attention.waitFor({ timeout: WAIT_MS });
          const items = attention.getByRole("listitem");
          const listed = [];
          for (let i = 0; i < (await items.count()); i += 1) {
            const lines = items.nth(i).locator("p");
            listed.push([await textOf(lines.first()), (await lines.count()) > 1 ? await textOf(lines.nth(1)) : ""]);
          }
          assert.deepEqual(listed, attentionItems(now), "Needs attention does not list what the records say");

          // The newest updates: Fern's, then week 1's.
          const postedAt = new Date(state.weekThree.earlierUpdatePostedAt);
          const updates = region("Updates").getByRole("listitem");
          const shown = [];
          for (let i = 0; i < (await updates.count()); i += 1) {
            const item = updates.nth(i);
            shown.push([await textOf(item.getByRole("link")), await textOf(item.locator("span span").last())]);
          }
          assert.deepEqual(
            shown,
            [
              [UPDATE.title, `${fern.first} → ${facilitated.name} · ${londonDayLabel(now)} · Emailed to ${inGroup.length}`],
              [EARLIER_UPDATE.title, `NAISI → Everyone · ${londonDayLabel(postedAt)} · Not emailed`],
            ],
            "the Overview's Updates card",
          );

          // The Sessions view, at next week: each group's session in it, Group
          // A's moved, with the reason's record behind its dialog.
          await adminPage.goto(sessionsViewUrl(nextWeek), { waitUntil: "domcontentloaded" });
          const slotStartKey = shiftDateKey(state.startDate, 7 * (nextWeek - 1));
          await adminPage
            .getByText(`Week ${nextWeek} of ${state.weekCount} · ${weekSpanLabel(slotStartKey)}`, { exact: true })
            .waitFor({ timeout: WAIT_MS });
          const groupNames = state.groups.map((group) => group.name);
          assert.deepEqual(
            (await textsOf(adminPage.locator("main").getByRole("heading", { level: 3 }))).filter((name) =>
              groupNames.includes(name),
            ),
            ordered.map((group) => group.name),
            "the Sessions view's cards are not the groups in the one order",
          );
          const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          for (const group of ordered) {
            const card = adminPage
              .getByRole("heading", { name: group.name, level: 3, exact: true })
              .locator("xpath=ancestor::div[.//button][1]");
            const said = await textOf(card);
            const session = sessionNow(group, nextWeek, now);
            const moved = group === facilitated;
            const expected = [
              `${weekdays[group.weekday]}s ${clockWords(group.startTimeLocal)} · ${group.room}`,
              `Week ${nextWeek}`,
              `${session.dateKey === todayKey ? "Today" : dayLabel(session.dateKey)}, ${clockWords(moved ? MOVE.startTimeLocal : group.startTimeLocal)}`,
              ...(moved ? [fern.displayName, MOVE.room, "Moved"] : []),
            ];
            for (const words of expected) {
              assert.ok(said.includes(words), `${group.name}'s card on the Sessions view does not say ${JSON.stringify(words)}: ${said}`);
            }
            if (!moved) assert.ok(!said.includes("Moved"), `${group.name}'s card says it moved`);
          }
          // Its dialog says the session was moved, and offers it back as usual.
          await adminPage
            .getByRole("heading", { name: facilitated.name, level: 3, exact: true })
            .locator("xpath=ancestor::div[.//button][1]")
            .getByRole("button", { name: "Change a session", exact: true })
            .click();
          const dialog = adminPage.getByRole("dialog", { name: `Change ${facilitated.name}’s week ${nextWeek} session`, exact: true });
          await dialog.waitFor({ timeout: WAIT_MS });
          await dialog
            .getByText(`${dayLabel(movedDateKey)} · ${clockWords(MOVE.startTimeLocal)} · ${MOVE.room} · ${fern.first}`, { exact: true })
            .waitFor({ timeout: WAIT_MS });
          await dialog.getByText("This session has been moved.", { exact: true }).waitFor({ timeout: WAIT_MS });
          await dialog.getByRole("radio", { name: /^Hold it as usual/ }).waitFor({ timeout: WAIT_MS });
          await dialog
            .getByText(`Back to ${weekdays[facilitated.weekday]}s ${clockWords(facilitated.startTimeLocal)} in ${facilitated.room}, like the group’s other weeks.`, {
              exact: true,
            })
            .waitFor({ timeout: WAIT_MS });
          await dialog.getByRole("button", { name: "Keep it", exact: true }).click();
          await dialog.waitFor({ state: "detached", timeout: WAIT_MS });
        },
      );
    } finally {
      await Promise.allSettled([benContext.close(), adaContext.close(), facilitatorContext.close(), context.close()]);
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
