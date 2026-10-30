/**
 * A programme's before survey, end to end in a real browser: the course
 * hub's spec for the survey that opens week 1.
 *
 * The world (scripts/e2e-fixtures/worlds/course-hub-term.mjs) at its seventh
 * point, "first-day": the fellowship's run begins on the seed's day, Publish
 * has told Ada, Ben and Dan their place in Group A and Cleo hers in Group B,
 * and no group has met.
 *
 * -> the admin approves Ben, Dan and Fern -> names the running run on the
 * programme's Settings tab -> appoints Fern to Group A -> makes the
 * programme's before survey from its template on New survey, which then
 * offers no second -> changes its words on the Questions tab -> sends a test
 * to themselves, reads it, and opens its link, which keeps nothing -> emails
 * the four people holding a place, each their own link, with the count on
 * the button, and the questions lock -> Ada, signed out, answers every kind
 * of question through her own link, the percentage by keyboard, and sends ->
 * her link then says she has answered, and she stops the follow-ups there ->
 * Ben answers from the card on Home, signed in, after Send has refused his
 * last question left blank (every question needs an answer unless marked
 * optional), and the card goes -> Dan answers signed in at the survey's
 * address inside the programme, after Next has refused a page with one left
 * blank -> the
 * lead's results: totals with n and the response rate, the comments, and no
 * name -> Fern is refused the survey's pages and its download -> Who answered
 * names each person, and the download with names is that table, logged ->
 * the reminder, after its own test, reaches Cleo alone, with her own link ->
 * Close it now, and Cleo's link says it has closed -> every survey email is
 * in the send log, and none carries an answer or the meeting link.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-before-survey
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: the tests go to the
 * admin's own address, and each person's link is read out of their mailbox.
 *
 * ## Where each expected word comes from
 *
 * The survey's own sentences (the page, its box, the two emails, the admins'
 * tabs) are restated from src/lib/surveys/words.ts beside each check. The
 * questions' words are read from the survey as the admin made and saved it
 * (the template's, then the admin's changes), and the pages are held to that
 * record, so this file restates only the words it types, picks or changes.
 * Every date is worked out from the state file, or read back from the record
 * a press wrote, in London, never written as a calendar date.
 *
 * ## Six identities
 *
 * The admin (the programme's lead here), Ada and Cleo signed out in contexts
 * of their own (neither is ever approved: a personal link needs no account
 * that stands), Ben and Dan, who sign in, and Fern, Group A's facilitator.
 * CHROMIUM ONLY: a green run is a regression net, never a substitute for the
 * manual Safari pass.
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
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-before-survey.mjs";
import {
  FIRST_DAY,
  londonClockLabel,
  londonDateKey,
  londonDayLabel,
  londonWallClockToInstant,
  namesInWords,
  sessionOf,
  shiftDateKey,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator and mailbox waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** Where every survey email's replies go (`SURVEY_REPLY_TO`). */
const SOCIETY = "ai-safety@uonsu.com";

/** Every email's last line (`EmailChrome`). */
const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";

// ---------------------------------------------------------------------------
// The survey's words, restated from src/lib/surveys/words.ts
// ---------------------------------------------------------------------------

/** A programme's before survey, as New survey makes it (`STAGE_WORDS.before`, `introFor`, `TEMPLATE_MINUTES`). */
const BEFORE = Object.freeze({
  card: "Before the programme",
  title: "Before you start",
  name: (programme) => `${programme}: before`,
  questions: 14,
  minutes: 5,
  intro: [
    "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 14 questions and takes about 5 minutes.",
    "We’ll ask the same at the end.",
  ],
  pages: 5,
});

/** The answer page (`ANSWER_WORDS`, `STATE_WORDS`, `closingWords`, `pageWords`, `pickUpToWords`). */
const PAGE = Object.freeze({
  bar: "Survey",
  eyebrow: (programme) => `Fellowship: ${programme} · Week 1`,
  // Zach, 30 Oct 2026: every question needs an answer unless it is marked
  // optional, and the boxes asking permission are up to the person.
  rule: "Every question needs an answer unless it’s marked optional. The boxes asking your permission are up to you.",
  blank: "This question needs an answer.",
  missing: (n) => `Question ${n} still needs an answer.`,
  pageOf: (n, of) => `Page ${n} of ${of}`,
  pickUpTo: (n) => `Pick up to ${n}`,
  next: "Next",
  send: "Send my answers",
  thanks: "Thank you. Your answers are in.",
  closing: (day) => `It closes on ${day}. Once sent, your answers can’t change.`,
  consent: "Consent",
  answered: { title: "You’ve answered", body: "Thank you." },
  closed: (day) => ({ title: "This survey has closed", body: `It closed on ${day}, so it takes no more answers.` }),
  notYours: "This survey isn’t one you were sent",
  test: "This is a test of the survey’s link. Nothing you send from here is kept, so there is no Send button.",
});

/**
 * The confidential box (`confidentialPoints`): who sees what, from records.
 * Nobody leads this programme, so no lead is named; `facilitators` are the
 * first names of the person's told group's facilitators, or null for a
 * person whose told group has none.
 */
function boxPoints({ facilitators, namesOff }) {
  const who =
    facilitators === null
      ? "Your facilitators never see your answers."
      : facilitators.length === 1
        ? `${facilitators[0]} never sees your answers.`
        : `${namesInWords(facilitators)} never see your answers.`;
  return [
    "Only NAISI’s admins can see who said what.",
    who,
    "Nothing you say here affects your place or a future application.",
    "Totals, and comments you tick to be quoted, may go in reports to the committee and our funder, Kairos, or on our site.",
    `Your name comes off on ${namesOff}, two years after the fellowship ends. The totals stay.`,
  ];
}
const BOX_HEADING = "Confidential";
const BOX_NOTE = "We ask who you are so we can compare your answers at the start and the end.";

/** The Kairos choice the form ends with (`KAIROS_FORM_WORDS` in src/lib/kairos/words.ts). */
const KAIROS = Object.freeze({
  heading: "Sharing with Kairos",
  what: "We share your name and your record on this programme with Kairos, our funder: how many sessions you came to, whether you finished, and how you were rated at the end.",
  why: "Sharing helps us make our case to our funders and sponsors, so leaving it on helps NAISI.",
  box: "Don’t share my details with Kairos",
  after:
    "Saying no stops only what goes to Kairos with your name. We still see your answers, and they still count in our totals. You can change this at any time on your profile.",
});

/** Changing the follow-ups later, on a person's own page (`CONSENT_WORDS.followUps`). */
const FOLLOW_UPS = Object.freeze({
  region: "Follow-ups",
  yes: "You said we may contact you at 6 and 12 months with a short follow-up survey.",
  no: "You haven’t said we may contact you at 6 and 12 months.",
  stop: "Stop the follow-ups",
  start: "Contact me at 6 and 12 months",
  stopped: "Done. We won’t send you the follow-ups.",
});

/** The two emails and their test (`surveyEmailWords`, `reminderEmailWords`, `TEST_LINE`, `NoticeMarker`). */
const CONFIDENTIAL_LINE = "It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it.";
const TEST_LINE =
  "This is a test, sent to you alone. Its button opens the survey as people will see it; nothing you send from there is kept.";
const NOTICE = [
  "Sent as an important notice",
  "You are getting this because you hold a place on this programme, so it reaches you whatever your notification settings say, and it is never marketing.",
];

/** The admins' pages (`LIST_WORDS`, `SEND_WORDS`, `RESULT_WORDS`, the tabs' own sentences). */
const ADMIN = Object.freeze({
  list: "Surveys",
  newSurvey: "New survey",
  notSent: "Not sent yet",
  hasOne: "It has its before survey already.",
  editorLock: "The questions lock once this is sent, so every stage of the programme asks the same.",
  sentLock: "This survey has been sent, so its words and questions are fixed.",
  saved: "Saved.",
  test: "Send a test to me",
  waitsForTest: "Send yourself a test of this email first. The button waits for it.",
  emailButton: (n) => `Email ${n} ${n === 1 ? "person" : "people"}`,
  sentTo: (n) => `Sent to ${n} ${n === 1 ? "person" : "people"}.`,
  firstSent: (n) => `Emailed the ${n} people holding a place`,
  progress: (answered, of, day) => `${answered} of ${of} have answered. It closes on ${day}.`,
  progressClosed: (answered, of, day) => `${answered} of ${of} have answered. It closed on ${day}.`,
  nobodyNew: (day) =>
    `Nobody new since ${day}. When someone takes a place after you’ve sent it, a button here sends it to them, like “Send to the 2 who joined since”.`,
  remindLead: (n) => `${n} haven’t answered. Nothing goes until you press the button.`,
  remindersGoTo: "Reminders go only to people who haven’t answered. Nobody else is told who has.",
  reminded: (n) => `Reminded the ${n} who hadn’t answered`,
  who: (programme, n) => `Everyone holding a place on ${programme} (${n})`,
  namesOff: (words) => `${words}, two years after the programme ends.`,
  close: "Close it now",
  closeSure: "Nobody will be able to answer after this, and it can’t be opened again.",
  closeConfirm: "Close it now: no more answers",
  answeredHeading: (answered, of) => `${answered} of ${of} have answered`,
  download: "Download the answers, with names",
  recorded: "Each download is recorded. Delete your copy when you’re done.",
  adminOnly: "Only an admin can do this with a survey.",
  sentRefusal: "This survey has been sent, so its questions, words and closing date can’t change.",
  answeredRefusal: "You’ve already sent your answers to this survey. They can’t change.",
  closedRefusal: "This survey has closed, so it takes no more answers.",
  rate: (n, of, verb = "answered") => `${n} ${verb}, ${Math.round((n / of) * 100)}% of the ${of} it was sent to`,
  answersRate: (n, of) => `${n} ${n === 1 ? "answer" : "answers"} from the ${of} people it was sent to (${Math.round((n / of) * 100)}%).`,
  leaveOut: "Leave out before-survey answers sent after someone’s first session",
  consent: "Consent",
});

// ---------------------------------------------------------------------------
// What the admin changes, and what each person answers
// ---------------------------------------------------------------------------

/** The admin's three changes on the Questions tab: the intro's second paragraph, one question and one answer. */
const EDITS = Object.freeze({
  introSecond: "We’ll ask the same questions at the end of the fellowship.",
  question: { number: 14, was: "What do you most want to get out of this programme?", now: "What do you most want to get out of this fellowship?" },
  answer: { number: 4, at: 1, was: "Freshers’ fair", now: "The freshers’ fair stall" },
});

/**
 * Ada, signed out, answers every question, so every kind the template asks
 * is pressed once: two menus, pick any, a described point, a percentage (by
 * keyboard: the slider beside it is no stop on the way), pick up to three,
 * two scales of 1 to 7, a number, an agreement grid, and a short answer;
 * then she ticks the follow-ups box. Nobody touches the Kairos box.
 */
const ADA_SAYS = Object.freeze({
  q_p3_level: { menu: "Undergraduate, second year" },
  q_p3_subject: { menu: "Philosophy" },
  q_p4: { tick: ["AI safety books, LessWrong or 80,000 Hours", "An AI safety talk or event"] },
  q_p5: { tick: [EDITS.answer.now] },
  q_c1: { pick: "One of several options I’m seriously considering" },
  q_c2: { keys: "35" },
  q_c3: { tick: ["Technical research", "Governance or policy", "Strategy"] },
  q_c4: { point: 4 },
  q_c5: { point: 3 },
  q_c6: { type: "2" },
  q_c7: { lines: { l_next: 4, l_contribute: 3 } },
  q_c8: { tick: ["Don’t know what roles exist", "Contacts"] },
  q_c9: { tick: ["None of these"] },
  q_p6: { write: "A reading habit that lasts past the last session." },
});

/**
 * Ben, from the card on Home, answers every question, as each needs an answer
 * since 30 Oct 2026: 0 and "None of these" count as answers. He first leaves
 * the last one blank and presses Send, which says so beside it and sends
 * nothing (`BEN_BLANK`).
 */
const BEN_SAYS = Object.freeze({
  q_p3_level: { menu: "Undergraduate, first year" },
  q_p3_subject: { menu: "Computer science" },
  q_p4: { tick: ["None of these"] },
  q_p5: { tick: ["Friend"] },
  q_c1: { pick: "Thought about it, not a serious option" },
  q_c2: { type: "10" },
  q_c3: { tick: ["Engineering"] },
  q_c4: { point: 2 },
  q_c5: { point: 1 },
  q_c6: { type: "0" },
  q_c7: { lines: { l_next: 2, l_contribute: 2 } },
  q_c8: { tick: ["Nothing major"] },
  q_c9: { tick: ["None of these"] },
  q_p6: { write: "Somebody to argue with about the arguments." },
});
const BEN_BLANK = "q_p6";

/**
 * Dan, signed in inside the programme, answers every question, both lines of
 * the grid among them, and ticks the follow-ups box. He first leaves the
 * subject blank and presses Next, which keeps him on the page and says so
 * beside it (`DAN_BLANK`).
 */
const DAN_SAYS = Object.freeze({
  q_p3_level: { menu: "Master’s" },
  q_p3_subject: { menu: "Maths" },
  q_p4: { tick: ["ML research or coursework"] },
  q_p5: { tick: ["Lecturer or module"] },
  q_c1: { pick: "My leading plan, no concrete steps yet" },
  q_c2: { type: "70" },
  q_c3: { tick: ["Technical research"] },
  q_c4: { point: 6 },
  q_c5: { point: 4 },
  q_c6: { type: "3" },
  q_c7: { lines: { l_next: 5, l_contribute: 4 } },
  q_c8: { tick: ["Technical skills", "Research experience"] },
  q_c9: { tick: ["Had a 1:1 with someone in the field"] },
  q_p6: { write: "A way in that suits a maths student." },
});
const DAN_BLANK = "q_p3_subject";

// ---------------------------------------------------------------------------
// Dates, restated
// ---------------------------------------------------------------------------

/** Two years after a civil date, 29 Feb to 28 Feb (`twoYearsAfter` in src/lib/surveys/namesOff.ts). */
function twoYearsAfter(key) {
  const [y, m, d] = key.split("-").map(Number);
  const year = y + 2;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function londonParts(at, options) {
  const out = {};
  for (const part of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...options }).formatToParts(at)) {
    out[part.type] = part.value;
  }
  return out;
}

/** "Sat 9 Dec 2028" (`dateKeyWords`). */
function dateKeyWords(key) {
  const p = londonParts(new Date(`${key}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

/** "Wed 4 Nov, 23:59" (`deadlineWords`). */
function deadlineWords(at) {
  const p = londonParts(at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** "Thu 29 Oct, 9am" (`dayAndClockWords`). */
const dayAndClock = (at) => `${londonDayLabel(at)}, ${londonClockLabel(at)}`;

/** "2026-10-29 09:00", a spreadsheet's day and time (`when` in src/lib/surveys/exportTable.ts). */
function spreadsheetWhen(at) {
  const p = londonParts(at, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** A stored instant, from a Timestamp. */
const instantOf = (value) => (value && typeof value.toDate === "function" ? value.toDate() : null);

// ---------------------------------------------------------------------------
// The spreadsheet, restated from src/lib/surveys/exportTable.ts and src/lib/csv.ts
// ---------------------------------------------------------------------------

function escapeCsvCell(v) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `\t${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(header, rows) {
  const head = header.map(escapeCsvCell).join(",");
  const body = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  return body ? `${head}\n${body}` : head;
}

/** The questions of a survey's items, in order, numbered from 1. */
const questionsOf = (items) => items.filter((item) => item.kind === "question");

/** The survey's answers as a table (`surveyExportTable`): a column per question, and per line of a grid. */
function exportTable(items, rows) {
  const columns = [];
  questionsOf(items).forEach((question, index) => {
    const number = index + 1;
    if (question.type === "lines") {
      for (const line of question.lines) {
        columns.push({
          header: `${number}. ${question.title}: ${line.label}`,
          cell: (answers) => {
            const value = answers[question.id]?.type === "lines" ? answers[question.id].values?.[line.id] : undefined;
            return typeof value === "number" ? String(value) : "";
          },
        });
      }
      return;
    }
    if (["scale", "percent", "number"].includes(question.type)) {
      columns.push({
        header: `${number}. ${question.title}`,
        cell: (answers) => {
          const answer = answers[question.id];
          return answer && ["scale", "percent", "number"].includes(answer.type) ? String(answer.value) : "";
        },
      });
      return;
    }
    const labelOf = (id) => (question.options ?? []).find((option) => option.id === id)?.label ?? "";
    columns.push({
      header: `${number}. ${question.title}`,
      cell: (answers) => {
        const answer = answers[question.id];
        if (!answer) return "";
        if (answer.type === "choice") return labelOf(answer.optionId);
        if (answer.type === "choices") return answer.optionIds.map(labelOf).filter(Boolean).join("; ");
        if (answer.type === "text") return answer.text;
        return "";
      },
    });
  });
  const header = ["Name", "Sent", "How", "After their first session", ...columns.map((column) => column.header)];
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, "en") || a.sentAt.getTime() - b.sentAt.getTime());
  return {
    header,
    rows: sorted.map((row) => [
      row.name,
      spreadsheetWhen(row.sentAt),
      row.via === "signed-in" ? "Signed in" : "Personal link",
      row.afterFirstSession ? "Yes" : "No",
      ...columns.map((column) => column.cell(row.answers)),
    ]),
  };
}

// ---------------------------------------------------------------------------
// Harness wiring
// ---------------------------------------------------------------------------

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
  : !state?.people?.length
    ? `No course hub term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an " +
        "admin's, and this harness cannot create an admin."
      : state.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, the admin's tests and each person's link included, so it " +
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

/** What an element says, as written: its text content, never `innerText` (CSS sets labels in capitals). */
const textOf = async (locator) => flat((await locator.textContent()) ?? "");

/** `textOf` for every element a locator matches, in order. */
const textsOf = async (locator) => (await locator.allTextContents()).map(flat);

/**
 * The admin's first name, which signs every survey email the admin presses
 * (`firstNameOfUser`). Read from the admin's account, and never printed: a
 * failure message says "<the admin's name>" in its place.
 */
let signer = "";
const hidden = (text) => (signer ? String(text).split(signer).join("<the admin's name>") : String(text));

/** Holds a text to some parts, in order, each after the one before it. */
function assertInOrder(text, parts, what) {
  let from = 0;
  for (const part of parts) {
    const at = text.indexOf(part, from);
    assert.ok(
      at !== -1,
      hidden(`${what} does not say ${JSON.stringify(part)}${from > 0 ? " after what came before it" : ""}. It says: ${JSON.stringify(text)}`),
    );
    from = at + part.length;
  }
}

/** `assert.deepEqual`, with the admin's name kept out of the message. */
function assertSame(actual, expected, what) {
  try {
    assert.deepEqual(actual, expected);
  } catch {
    throw new assert.AssertionError({ message: hidden(`${what}: ${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`) });
  }
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** What an email's HTML says, as one line of words: block tags become a space, inline ones vanish. (T1's, restated.) */
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
    links: hrefUrls(message.HTML ?? "").filter((href) => href.includes("/survey/")),
  };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: a programme's before survey, made, tested, sent, answered by every door, read, downloaded, reminded and closed",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const plan = FIRST_DAY;

    const personOf = (key) => {
      const found = state.people.find((person) => person.key === key);
      assert.ok(found, `the first day's term has nobody called ${key}`);
      return found;
    };
    const ada = personOf("ada");
    const ben = personOf("ben");
    const cleo = personOf("cleo");
    const dan = personOf("dan");
    const fern = state.facilitator;
    assert.ok(fern, "the first day's term has no account to appoint as a facilitator");
    const people = [ada, ben, cleo, dan];
    const everybody = [...people, fern];

    const groupOf = (key) => state.groups.find((group) => group.key === key);
    /** The group Fern is appointed to, the one with the meeting link. */
    const groupA = groupOf(plan.facilitated);
    for (const person of [ada, ben, dan]) {
      assert.equal(person.groupKey, groupA.key, `${person.first} is not in ${groupA.name}, whose facilitator the box names`);
    }
    assert.notEqual(cleo.groupKey, groupA.key, "Cleo is in the facilitated group, so her box would name a facilitator");
    assert.ok(groupA.meetingUrl, `${groupA.name} has no meeting link, so 'no email carries it' would prove nothing`);
    const linkHost = new URL(groupA.meetingUrl).host;

    // The run's week, by its own calendar: the world promises week 1, with no group met.
    const elapsedDays = Math.round(
      (Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${state.startDate}T00:00:00Z`)) / 86_400_000,
    );
    assert.ok(elapsedDays >= 0 && elapsedDays < 7, `the term is ${elapsedDays} days from its start, not in week 1`);
    for (const group of state.groups) {
      assert.ok(sessionOf(group, 1).startsAt.getTime() > Date.now(), `${group.name} has met already, so answers would not be before anybody's first session`);
    }

    // The survey closes at the end of the run's first week (the admin picks the day).
    const closesOn = shiftDateKey(state.startDate, 6);
    const closesAt = londonWallClockToInstant(closesOn, "23:59");
    const closesDay = londonDayLabel(closesAt);
    // Names come off two years after the run's last session, the latest-ending of any group's.
    const lastSession = state.groups
      .map((group) => sessionOf(group, state.weekCount))
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
    const namesOffOn = twoYearsAfter(lastSession.dateKey);
    const namesOffWords = dateKeyWords(namesOffOn);
    const surveyName = BEFORE.name(state.programmeName);

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: adaContext, page: adaPage } = await newIdentityPage(browser);
    const { context: benContext, page: benPage } = await newIdentityPage(browser);
    const { context: danContext, page: danPage } = await newIdentityPage(browser);
    const { context: fernContext, page: fernPage } = await newIdentityPage(browser);
    const { context: cleoContext, page: cleoPage } = await newIdentityPage(browser);

    /** Which page a failed step photographs: the recorder takes one page, and this spec drives six. */
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
    for (const pg of [adaPage, benPage, danPage, fernPage, cleoPage]) await stubRecaptchaOnLoopback(pg, origin);
    if (!recaptchaStubbed) {
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? DEPLOYED_TARGET_SKIP : null);
    }

    const signIn = (pg, credentials) => signInWithPassword(pg, origin, credentials, { timeout: WAIT_MS });

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

    /**
     * A request made with a page's own session, its status and body read
     * back: what a page's own press sends, made by hand where the page will
     * not send it (a change after the send; an answer a second time).
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
    const jsonInit = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    /** A control once the page's script has made it live. */
    async function whenEnabled(locator, what) {
      await locator.waitFor({ timeout: WAIT_MS });
      await waitFor(`${what} to be live`, async () => locator.isEnabled());
      return locator;
    }

    /**
     * A box or a round button pressed the way a person presses it: on its
     * row or point, the label around it, whose own input is drawn out of
     * sight. Then read as ticked.
     */
    async function press(control, what) {
      await control.locator("xpath=ancestor::label[1]").click();
      await waitFor(`${what} to be ticked`, async () => control.isChecked());
    }

    /** The main column's words, the page's own and nothing of the shell around it. */
    const mainText = async (pg) => textOf(pg.locator("main"));

    /**
     * One survey's row on the list (sv-list), found by its name's link: the
     * row is the third box out from the link (row, its first column, the name
     * line), so a part another survey's row says is never read as this one's.
     */
    const listRow = (region) => region.getByRole("link", { name: surveyName, exact: true }).locator("xpath=ancestor::div[3]");

    // ---- The records ------------------------------------------------------------

    /** The one survey made on this term's programme, read from its record. */
    async function theSurvey() {
      const docs = (await fixtureQuery("surveys").where("roundId", "==", state.formId).get()).docs;
      assert.equal(docs.length, 1, `${docs.length} surveys name this term's form`);
      return { id: docs[0].id, ...docs[0].data() };
    }
    let surveyId = null;
    const survey = async () => ({ id: surveyId, ...(await fixtureDoc("surveys", surveyId).get()).data() });
    const rowsOf = async () =>
      new Map(
        (await fixtureQuery("surveyPeople").where("surveyId", "==", surveyId).get()).docs.map((doc) => [doc.data().respondent?.uid, doc.data()]),
      );
    const answersOfSurvey = async () =>
      new Map(
        (await fixtureQuery("surveyAnswers").where("surveyId", "==", surveyId).get()).docs.map((doc) => [doc.data().respondent?.uid, doc.data()]),
      );
    const kairosChoiceOf = async (person) => (await fixtureDoc("kairosChoices", person.uid).get()).exists;

    // ---- The questions, from the survey as made ------------------------------

    /** The survey's pages as the answer page draws them (`surveyPagesOf`): split at each page break. */
    function pagesOf(items) {
      const pages = [[]];
      for (const item of items) {
        if (item.kind === "pageBreak") pages.push([]);
        else pages[pages.length - 1].push(item);
      }
      return pages.map((page) => ({
        heading: page.find((item) => item.kind === "section")?.heading ?? "",
        questions: page.filter((item) => item.kind === "question"),
        consents: page.filter((item) => item.kind === "consent"),
      }));
    }

    /** An option's id by its words, on the question as saved. */
    function optionIdOf(question, label) {
      const found = (question.options ?? []).find((option) => option.label === label);
      assert.ok(found, `question ${JSON.stringify(question.title)} has no answer ${JSON.stringify(label)}`);
      return found.id;
    }

    /** A point's name, as a screen reader says it (`pointWords`): "4 out of 7: The gist, to a friend". */
    const pointName = (point, max, words) => (words ? `${point} out of ${max}: ${words}` : `${point} out of ${max}`);

    /** What one question's answer is kept as, from what the person does (`answersIn`, then the route). */
    function keptAs(question, does) {
      if (does.menu !== undefined || does.pick !== undefined) {
        return { type: "choice", optionId: optionIdOf(question, does.menu ?? does.pick) };
      }
      if (does.tick) return { type: "choices", optionIds: does.tick.map((label) => optionIdOf(question, label)).sort() };
      if (does.keys !== undefined || does.type !== undefined) {
        return { type: question.type === "percent" ? "percent" : "number", value: Number(does.keys ?? does.type) };
      }
      if (does.point !== undefined) return { type: "scale", value: does.point };
      if (does.lines) return { type: "lines", values: { ...does.lines } };
      if (does.write !== undefined) return { type: "text", text: does.write };
      throw new Error(`nothing to keep for ${question.id}`);
    }

    /** Answers as compared: a pick-any's ids in order, since the order they were ticked in says nothing. */
    const comparable = (answers) =>
      Object.fromEntries(
        Object.entries(answers ?? {}).map(([id, answer]) => [
          id,
          answer?.type === "choices" ? { ...answer, optionIds: [...answer.optionIds].sort() } : answer,
        ]),
      );

    /** The group a question is, named by its words. */
    const questionGroup = (pg, question) => pg.getByRole("group", { name: question.title });

    /**
     * One question answered the way a person answers it, by its kind as
     * saved. Hands back the control last touched, for a keyboard press to
     * start from.
     */
    async function answerQuestion(pg, question, does, before) {
      const group = questionGroup(pg, question);
      assert.equal(await group.count(), 1, `the page shows ${await group.count()} questions called ${JSON.stringify(question.title)}`);
      if (does.menu !== undefined) {
        const menu = group.getByRole("combobox");
        await menu.selectOption({ label: does.menu });
        return menu;
      }
      if (does.pick !== undefined) {
        const option = group.getByRole("radio", { name: does.pick });
        await press(option, `${question.id}'s ${does.pick}`);
        return option;
      }
      if (does.tick) {
        let last = null;
        for (const label of does.tick) {
          last = group.getByRole("checkbox", { name: label, exact: true });
          await press(last, `${question.id}'s ${label}`);
        }
        if (question.maxPicks && does.tick.length === question.maxPicks) {
          // At the limit the page greys out the rest: the server refuses more anyway.
          await group.getByText(PAGE.pickUpTo(question.maxPicks), { exact: true }).waitFor({ timeout: WAIT_MS });
          for (const option of question.options) {
            if (does.tick.includes(option.label)) continue;
            const other = group.getByRole("checkbox", { name: option.label, exact: true });
            await waitFor(`${option.label} to be greyed out at the limit`, async () => other.isDisabled());
          }
        }
        return last;
      }
      if (does.keys !== undefined) {
        // By keyboard: from the control before it, Tab lands on the typed box,
        // never the slider beside it, which is out of the keyboard's way, and
        // the digits typed are the answer. The slider follows what is typed.
        const box = group.getByRole("spinbutton");
        const slider = group.locator('input[type="range"]');
        assert.ok(before, `${question.id} is answered by keyboard, so a control before it must have been touched`);
        await before.focus();
        await pg.keyboard.press("Tab");
        assert.equal(await box.evaluate((el) => el === document.activeElement), true, "Tab from the question before did not land on the percentage's typed box");
        assert.deepEqual(
          [await slider.getAttribute("tabindex"), await slider.getAttribute("aria-hidden")],
          ["-1", "true"],
          "the slider is in the keyboard's way, or is read out beside the box",
        );
        await pg.keyboard.type(does.keys);
        assert.equal(await box.inputValue(), does.keys, "the typed box does not hold what was typed");
        assert.equal(await slider.inputValue(), does.keys, "the slider does not follow what was typed");
        return box;
      }
      if (does.type !== undefined) {
        const box = group.getByRole("spinbutton");
        await box.fill(does.type);
        return box;
      }
      if (does.point !== undefined) {
        const words = new Map((question.anchors ?? []).map((anchor) => [anchor.at, anchor.label]));
        const point = group.getByRole("radio", { name: pointName(does.point, question.max, words.get(does.point) ?? ""), exact: true });
        await press(point, `${question.id}'s ${does.point}`);
        return point;
      }
      if (does.lines) {
        let last = null;
        for (const [lineId, value] of Object.entries(does.lines)) {
          const line = question.lines.find((each) => each.id === lineId);
          assert.ok(line, `question ${question.id} has no line ${lineId}`);
          const words = question.scale.points?.[value - 1] ?? "";
          last = pg.getByRole("group", { name: line.label, exact: true }).getByRole("radio", {
            name: pointName(value, question.scale.max, words),
            exact: true,
          });
          await press(last, `${question.id}'s ${line.label} at ${value}`);
        }
        return last;
      }
      if (does.write !== undefined) {
        const box = group.getByRole("textbox");
        await box.fill(does.write);
        return box;
      }
      throw new Error(`nothing to do with ${question.id}`);
    }

    /**
     * The answer page's head and box, read whole: the programme and week, the
     * title and intro, that every question needs an answer unless it is
     * marked optional, and the box with whom it names.
     */
    async function readSurveyHead(pg, saved, { facilitators }) {
      await pg.getByRole("heading", { level: 1, name: saved.title, exact: true }).waitFor({ timeout: WAIT_MS });
      const head = await textsOf(pg.locator("main header p"));
      assert.deepEqual(
        head,
        [PAGE.eyebrow(state.programmeName), ...saved.intro.split(/\n\s*\n/).map(flat), PAGE.rule],
        "the survey's head is not the programme and week, the intro as saved, and that every question needs an answer unless marked optional",
      );
      const box = pg.getByRole("region", { name: BOX_HEADING, exact: true });
      assert.deepEqual(await textsOf(box.getByRole("listitem")), boxPoints({ facilitators, namesOff: namesOffWords }), "the confidential box's points");
      assert.equal(await textOf(box.locator("p").last()), BOX_NOTE, "the confidential box's note");
    }

    /**
     * A survey answered page by page, as `does` says, then sent: each page
     * named by its heading and its place ("Page 2 of 5"), only its own
     * questions shown, Next between them; the follow-ups box ticked or not;
     * the Kairos box read and left as it was. Hands back what the press sent.
     *
     * `blank` is a question first left blank: its page's Next (or, on the
     * last page, Send) is pressed with it blank, which keeps the person
     * there, says so beside it and by the buttons, moves focus into it and
     * sends nothing; then it is answered and the marker goes.
     */
    async function answerSurvey(pg, saved, does, { followUps, sendsTo, blank = null }) {
      const numbers = new Map(questionsOf(saved.items).map((question, index) => [question.id, index + 1]));
      let sentEarly = 0;
      const counting = (request) => {
        if (new URL(request.url()).pathname === sendsTo && request.method() === "POST") sentEarly += 1;
      };
      /** The button pressed with `blank` left blank, its refusal read, then the question answered. */
      async function refusedThenAnswered(region, button, page, before) {
        const question = page.questions.find((each) => each.id === blank);
        const group = questionGroup(pg, question);
        pg.on("request", counting);
        await button.click();
        await group.getByText(PAGE.blank, { exact: true }).waitFor({ timeout: WAIT_MS });
        await region.getByRole("alert").filter({ hasText: PAGE.missing(numbers.get(blank)) }).waitFor({ timeout: WAIT_MS });
        await waitFor(`focus to move into ${blank}`, async () => group.evaluate((el) => el.contains(document.activeElement)));
        assert.equal(await region.isVisible(), true, "a page with a required question blank was left");
        pg.off("request", counting);
        assert.equal(sentEarly, 0, "answers with a required question blank were sent");
        const last = await answerQuestion(pg, question, does[blank], before);
        await waitFor(`${blank}'s marker to go once it is answered`, async () => (await group.getByText(PAGE.blank, { exact: true }).count()) === 0);
        return last;
      }
      // The page is live once its script has drawn Next: until then every page shows at once.
      await whenEnabled(pg.getByRole("button", { name: PAGE.next, exact: true }), "Next");
      const pages = pagesOf(saved.items);
      assert.equal(pages.length, BEFORE.pages, `the survey has ${pages.length} pages`);
      let before = null;
      for (const [index, page] of pages.entries()) {
        const region = pg.getByRole("region", { name: page.heading, exact: true });
        await region.waitFor({ timeout: WAIT_MS });
        await region.getByText(PAGE.pageOf(index + 1, pages.length), { exact: true }).waitFor({ timeout: WAIT_MS });
        for (const question of page.questions) {
          await questionGroup(pg, question).waitFor({ timeout: WAIT_MS });
          if (does[question.id] && question.id !== blank) before = await answerQuestion(pg, question, does[question.id], before);
        }
        const here = page.questions.some((question) => question.id === blank);
        if (index < pages.length - 1) {
          const next = region.getByRole("button", { name: PAGE.next, exact: true });
          if (here) before = await refusedThenAnswered(region, next, page, before);
          await next.click();
          continue;
        }
        // The last page: the follow-ups box, the Kairos choice, and the closing line.
        const consent = region.getByRole("group", { name: PAGE.consent, exact: true });
        const [item] = page.consents;
        assert.ok(item, "the last page carries no consent");
        assert.equal(await textOf(consent.locator("p").first()), item.statement, "the consent's statement is not the survey's");
        const box = consent.getByRole("checkbox", { name: item.boxes[0].label, exact: true });
        assert.equal(await box.isChecked(), false, "the follow-ups box starts ticked");
        if (followUps) await press(box, "the follow-ups box");
        const kairos = region.getByRole("group", { name: KAIROS.heading, exact: true });
        assert.deepEqual(await textsOf(kairos.locator("p")), [KAIROS.what, KAIROS.why, KAIROS.after], "the Kairos choice's words");
        assert.equal(await kairos.getByRole("checkbox", { name: KAIROS.box, exact: true }).isChecked(), false, "the Kairos box starts ticked for somebody whose record says nothing");
        await region.getByText(PAGE.closing(closesDay), { exact: true }).waitFor({ timeout: WAIT_MS });
        const send = await whenEnabled(region.getByRole("button", { name: PAGE.send, exact: true }), PAGE.send);
        if (here) before = await refusedThenAnswered(region, send, page, before);
        const [request, response] = await Promise.all([
          pg.waitForRequest((r) => new URL(r.url()).pathname === sendsTo && r.method() === "POST", { timeout: WAIT_MS }),
          responseTo(pg, sendsTo, "POST"),
          send.click(),
        ]);
        await okBody(response, "Send my answers");
        await pg.getByRole("status").filter({ hasText: PAGE.thanks }).waitFor({ timeout: WAIT_MS });
        return request.postDataJSON();
      }
      throw new Error("the survey has no last page");
    }

    /** What a person's answers are kept as, from what they did, by the questions as saved. */
    const expectedAnswers = (saved, does) =>
      Object.fromEntries(questionsOf(saved.items).filter((question) => does[question.id]).map((question) => [question.id, keptAs(question, does[question.id])]));

    // ---- Mail ---------------------------------------------------------------------

    /** The messages to one fixture address, oldest first, once there are `count`. */
    async function mailTo(address, count) {
      const summaries = await waitForMessagesTo(address, { count, timeoutMs: WAIT_MS });
      return summaries.slice().reverse();
    }

    /** How many messages each fixture account has in Mailpit right now. */
    const mailCounts = async () => {
      const out = {};
      for (const account of everybody) out[account.first] = (await messagesTo(account.email)).length;
      return out;
    };

    /** The admin's tests of this survey's emails, out of the admin's own mailbox, oldest first. Never printed. */
    async function adminTests() {
      const found = [];
      for (const summary of await messagesTo(secrets.adminEmail)) {
        const subject = String(summary.Subject ?? "");
        if (subject.startsWith("[TEST] ") && subject.includes(` for ${state.programmeName}`)) found.push(await readEmail(summary));
      }
      return found.reverse();
    }

    /** Who signs a survey email the admin presses (`signOffOf`). */
    const signOff = () => (signer ? [signer, "For NAISI"] : ["NAISI"]);

    /** A survey email's words, in order: the heading, the test line or the notice, the paragraphs, the button and its link, the sign-off. */
    const surveyEmail = ({ intro, link, test }) => {
      const subject = `${BEFORE.title}: ${BEFORE.questions} questions for ${state.programmeName}`;
      return {
        subject: test ? `[TEST] ${subject}` : subject,
        sentences: [
          subject,
          ...(test ? [TEST_LINE] : NOTICE),
          ...intro,
          CONFIDENTIAL_LINE,
          `It closes on ${closesDay}.`,
          `Answer the ${BEFORE.questions} questions`,
          `Or paste this into your browser: ${link}`,
          ...signOff(),
          FOOTER,
        ],
      };
    };
    const reminderEmail = ({ link, test }) => {
      const subject = `A reminder: ${BEFORE.questions} questions for ${state.programmeName}, by ${closesDay}`;
      return {
        subject: test ? `[TEST] ${subject}` : subject,
        sentences: [
          subject,
          ...(test ? [TEST_LINE] : NOTICE),
          `You haven’t answered yet. It’s ${BEFORE.questions} questions and takes about ${BEFORE.minutes} minutes.`,
          CONFIDENTIAL_LINE,
          `It closes on ${closesDay}.`,
          `Answer the ${BEFORE.questions} questions`,
          `Or paste this into your browser: ${link}`,
          ...signOff(),
          FOOTER,
        ],
      };
    };

    /** Holds one email to its words, reply-to and link: the subject, the words in order, and no meeting link. */
    function assertEmail(email, expected, who) {
      assert.equal(email.subject, expected.subject, `${who}'s subject`);
      assertInOrder(email.words, expected.sentences, who);
      assert.ok(email.replyTo.includes(SOCIETY), `${who} does not reply to ${SOCIETY}`);
      for (const part of [email.html, email.text]) {
        assert.ok(!part.includes(groupA.meetingUrl) && !part.includes(linkHost), `${who} carries the meeting link`);
      }
    }

    /** The one personal link an email carries (its button and its pasted line agree), as a path on this site. */
    function linkIn(email, who) {
      const links = [...new Set(email.links)];
      assert.equal(links.length, 1, `${who} carries ${links.length} different survey links`);
      const url = new URL(links[0]);
      assert.equal(url.origin, origin, `${who}'s link is not to this site`);
      assert.match(url.pathname, /^\/survey\/[A-Za-z0-9_-]{43}$/, `${who}'s link is not a personal link`);
      return url.pathname;
    }

    /** Each person's own link, read out of their survey email. */
    const linkOf = new Map();

    try {
      await step("the admin approves the two members who answer signed in and the facilitator to be appointed", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const account of [ben, dan, fern]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          const approved = await waitFor(`${account.first}'s account to say member`, async () => {
            const doc = await readUserDoc(account.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${account.first}'s approval left no approvedAt stamp`);
        }
        // Ada and Cleo answer, or are reminded, through their own links, which need no account that stands.
        for (const account of [ada, cleo]) {
          assert.equal((await readUserDoc(account.uid))?.role, "pending", `${account.first} was approved, and nothing here approves them`);
        }
        // Each approval sends one email, a moment after its card leaves the queue.
        for (const account of [ben, dan, fern]) await mailTo(account.email, 1);
        assert.deepEqual(await mailCounts(), { Ada: 0, Ben: 1, Cleo: 0, Dan: 1, Fern: 1 }, "approving emailed somebody twice, or nobody");
        // The admin's first name signs every survey email the admin presses.
        const admin = await readUserDoc(state.adminUid);
        const preferred = String(admin?.profile?.preferredName ?? "").trim();
        signer = (preferred || String(admin?.displayName ?? "").trim()).split(/\s+/)[0] ?? "";
      });

      await step("the admin names the running course run on the programme's Settings tab", async () => {
        activePage = adminPage;
        // A survey is made only for a programme that names its run: nothing names one yet.
        const form = (await fixtureDoc("admissionRounds", state.formId).get()).data();
        assert.equal(form?.programmes?.[state.programmeId]?.runId ?? null, null, "the programme already names a run");
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
        // Everybody holding a place is who a survey reaches; the run's own list is not asked.
        await panel
          .getByText(`${people.length} people hold a place on ${state.programmeName}. None of them is on the run’s list yet.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        for (const person of people) {
          const place = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).get()).data();
          assert.equal(place?.groupId, groupOf(person.groupKey).id, `${person.first}'s place moved`);
          assert.ok(place?.allocatedEmailAt, `${person.first} is not told their group`);
        }
      });

      await step("the admin appoints a facilitator to the group three of the people are in", async () => {
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
        await card.getByText(`${groupA.name}’s facilitators are saved. Nobody was emailed.`, { exact: true }).waitFor({ timeout: WAIT_MS });
      });

      await step("the admin makes the programme's before survey from its template, and New survey offers no second", async () => {
        activePage = adminPage;
        // No survey names this term's form yet.
        assert.equal((await fixtureQuery("surveys").where("roundId", "==", state.formId).get()).size, 0, "a survey of this programme exists already");
        await adminPage.goto(`${origin}/admin/surveys`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("heading", { level: 1, name: ADMIN.list, exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await adminPage.getByRole("link", { name: surveyName, exact: true }).count(), 0, "the list names this programme's survey before it is made");
        await adminPage.getByRole("link", { name: ADMIN.newSurvey, exact: true }).click();
        await adminPage.waitForURL(`${origin}/admin/surveys/new`, { timeout: WAIT_MS });

        // The before survey's card: the template's size, and a form to make one.
        const card = adminPage.getByRole("region", { name: BEFORE.card, exact: true });
        await card.waitFor({ timeout: WAIT_MS });
        assert.ok(
          (await textOf(card)).includes(`${BEFORE.questions} questions for a fellowship`),
          "the before survey's card does not say a fellowship's survey has fourteen questions",
        );
        const programmeLabel = `${state.programmeName} (${state.formLabel})`;
        await card.getByLabel("Programme", { exact: true }).selectOption({ label: programmeLabel });
        await card.getByLabel("It closes on", { exact: true }).fill(closesOn);
        const make = await whenEnabled(card.getByRole("button", { name: "Make the survey", exact: true }), "Make the survey");
        const [request, response] = await Promise.all([
          adminPage.waitForRequest((r) => new URL(r.url()).pathname === "/api/surveys" && r.method() === "POST", { timeout: WAIT_MS }),
          responseTo(adminPage, "/api/surveys", "POST"),
          make.click(),
        ]);
        assert.deepEqual(
          request.postDataJSON(),
          { roundId: state.formId, programmeId: state.programmeId, stage: "before", closesOn, strand: null },
          "Make the survey sent something else",
        );
        const body = await okBody(response, "Making the survey");
        surveyId = body.survey?.id;
        assert.ok(surveyId, "making the survey answered no survey");
        await adminPage.waitForURL(`${origin}/admin/surveys/${enc(surveyId)}/questions`, { timeout: WAIT_MS });

        // The record: the template's, for this programme and its run, confidential, sent to nobody.
        const made = await theSurvey();
        assert.equal(made.id, surveyId, "the survey made is not the one the page opened");
        assert.deepEqual(
          {
            kind: made.kind,
            privacy: made.privacy,
            name: made.name,
            title: made.title,
            intro: made.intro,
            minutes: made.minutes,
            audience: made.audience,
            programmeName: made.programmeName,
            programmeKind: made.programmeKind,
            runId: made.runId,
            pairOf: made.pairOf,
            strand: made.strand,
            closesAt: instantOf(made.closesAt)?.toISOString(),
            namesOffOn: made.namesOffOn,
            firstSentAt: made.firstSentAt,
            presses: made.presses,
            tests: made.tests,
            testToken: made.testToken,
          },
          {
            kind: "before",
            privacy: "confidential",
            name: surveyName,
            title: BEFORE.title,
            intro: BEFORE.intro.join("\n\n"),
            minutes: BEFORE.minutes,
            audience: { kind: "programme", roundId: state.formId, programmeId: state.programmeId },
            programmeName: state.programmeName,
            programmeKind: "fellowship",
            runId: state.runId,
            pairOf: null,
            strand: null,
            closesAt: closesAt.toISOString(),
            namesOffOn,
            firstSentAt: null,
            presses: [],
            tests: { survey: null, reminder: null },
            testToken: null,
          },
          "the survey as made",
        );
        assert.equal(made.createdByUid, state.adminUid, "the survey does not name the admin who made it");
        // The template's fourteen questions on five pages, the follow-ups box last.
        assert.deepEqual(
          questionsOf(made.items).map((question) => question.id),
          ["q_p3_level", "q_p3_subject", "q_p4", "q_p5", "q_c1", "q_c2", "q_c3", "q_c4", "q_c5", "q_c6", "q_c7", "q_c8", "q_c9", "q_p6"],
          "the survey's questions are not the before template's",
        );
        assert.deepEqual(
          pagesOf(made.items).map((page) => page.heading),
          ["About you", "Where you are now", "What you know, and who", "What you’ve done", "To finish"],
          "the survey's pages are not the before template's",
        );
        assert.deepEqual(
          made.items.filter((item) => item.kind === "consent").map((item) => item.boxes.map((box) => box.purpose)),
          [["followUps"]],
          "the survey does not end with the follow-ups box",
        );
        const changed = questionsOf(made.items)[EDITS.question.number - 1];
        assert.equal(changed.title, EDITS.question.was, "the question the admin changes is not the template's");
        assert.equal(
          questionsOf(made.items)[EDITS.answer.number - 1].options[EDITS.answer.at - 1].label,
          EDITS.answer.was,
          "the answer the admin changes is not the template's",
        );

        // New survey now offers this programme no second before survey, and says why.
        await adminPage.goto(`${origin}/admin/surveys/new`, { waitUntil: "domcontentloaded" });
        const again = adminPage.getByRole("region", { name: BEFORE.card, exact: true });
        await again.getByText(`${programmeLabel}: ${ADMIN.hasOne}`, { exact: true }).waitFor({ timeout: WAIT_MS });
        const offered = await again.locator("select option").allTextContents().catch(() => []);
        assert.ok(!offered.map(flat).includes(programmeLabel), "New survey still offers this programme a before survey");
        // And the list has it as a draft.
        await adminPage.goto(`${origin}/admin/surveys`, { waitUntil: "domcontentloaded" });
        const drafts = adminPage.getByRole("region", { name: "Drafts", exact: true });
        await drafts.getByRole("link", { name: surveyName, exact: true }).waitFor({ timeout: WAIT_MS });
        assertInOrder(
          await textOf(listRow(drafts)),
          [surveyName, "Confidential", `Fellowship: ${state.programmeName}`, ADMIN.notSent, "Edit"],
          "the list's draft",
        );
        assert.equal(
          await drafts.getByRole("link", { name: `Edit ${surveyName}`, exact: true }).getAttribute("href"),
          `/admin/surveys/${enc(surveyId)}/questions`,
          "the draft's Edit does not open its Questions tab",
        );
      });

      await step("the admin changes the survey's words and saves them", async () => {
        activePage = adminPage;
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}`, { waitUntil: "domcontentloaded" });
        // A draft's own address opens its Questions tab.
        await adminPage.waitForURL(`${origin}/admin/surveys/${enc(surveyId)}/questions`, { timeout: WAIT_MS });
        await adminPage.getByRole("heading", { level: 1, name: surveyName, exact: true }).waitFor({ timeout: WAIT_MS });
        const save = await whenEnabled(adminPage.getByRole("button", { name: "Save", exact: true }), "Save");
        await adminPage.getByText(ADMIN.editorLock, { exact: true }).waitFor({ timeout: WAIT_MS });
        const title = adminPage.getByLabel("Title", { exact: true });
        assert.equal(await title.inputValue(), BEFORE.title, "the editor's title is not the survey's");
        const intro = adminPage.getByLabel("Intro", { exact: true });
        assert.equal(await intro.inputValue(), BEFORE.intro.join("\n\n"), "the editor's intro is not the survey's");
        await intro.fill(`${BEFORE.intro[0]}\n\n${EDITS.introSecond}`);
        const question = adminPage.getByLabel(`Question ${EDITS.question.number}`, { exact: true });
        assert.equal(await question.inputValue(), EDITS.question.was, "the editor's question is not the survey's");
        await question.fill(EDITS.question.now);
        const answer = adminPage.getByLabel(`Question ${EDITS.answer.number}, answer ${EDITS.answer.at}`, { exact: true });
        assert.equal(await answer.inputValue(), EDITS.answer.was, "the editor's answer is not the survey's");
        await answer.fill(EDITS.answer.now);
        const [response] = await Promise.all([responseTo(adminPage, `/api/surveys/${surveyId}/questions`, "POST"), save.click()]);
        await okBody(response, "Saving the survey");
        await adminPage.getByRole("status").filter({ hasText: ADMIN.saved }).waitFor({ timeout: WAIT_MS });

        // The record holds the changes, and only them: the same questions, ids and kinds.
        const saved = await survey();
        assert.equal(saved.intro, `${BEFORE.intro[0]}\n\n${EDITS.introSecond}`, "the intro as saved");
        assert.equal(saved.title, BEFORE.title, "the title changed");
        assert.equal(questionsOf(saved.items)[EDITS.question.number - 1].title, EDITS.question.now, "the question as saved");
        assert.equal(questionsOf(saved.items)[EDITS.answer.number - 1].options[EDITS.answer.at - 1].label, EDITS.answer.now, "the answer as saved");
        assert.equal(questionsOf(saved.items).length, BEFORE.questions, "saving added or took out a question");
        // And the editor shows them after a reload.
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        await whenEnabled(adminPage.getByRole("button", { name: "Save", exact: true }), "Save");
        assert.equal(await adminPage.getByLabel(`Question ${EDITS.question.number}`, { exact: true }).inputValue(), EDITS.question.now, "the question after a reload");
      });

      await step("Send a test to me emails the admin the survey as it will go, marked as a test, and its link keeps nothing", async () => {
        activePage = adminPage;
        const saved = await survey();
        const intro = saved.intro.split(/\n\s*\n/).map(flat);
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}/send`, { waitUntil: "domcontentloaded" });
        const send = adminPage.getByRole("region", { name: "Send", exact: true });
        await send.waitFor({ timeout: WAIT_MS });
        // The email as it will go, to everybody holding a place, and its button held for a test.
        const subject = `${BEFORE.title}: ${BEFORE.questions} questions for ${state.programmeName}`;
        const preview = send.getByRole("article", { name: subject, exact: true });
        await preview.waitFor({ timeout: WAIT_MS });
        const envelope = await textsOf(preview.locator("dd"));
        assert.deepEqual(envelope.slice(1), [SOCIETY, `${people.length} people`], "the email's reply-to and who it is to");
        assert.ok(envelope[0].startsWith("NAISI <"), "the email is not from NAISI");
        assertSame(
          await textsOf(preview.locator("p")),
          [subject, ...intro, CONFIDENTIAL_LINE, `It closes on ${closesDay}.`, signOff().join(" ")],
          "the email as the Send tab shows it",
        );
        const emailButton = send.getByRole("button", { name: ADMIN.emailButton(people.length), exact: true });
        await emailButton.waitFor({ timeout: WAIT_MS });
        assert.equal(await emailButton.isDisabled(), true, "the survey can be sent before a test");
        await send.getByText(ADMIN.waitsForTest, { exact: true }).waitFor({ timeout: WAIT_MS });
        // Who it is for, when it closes and when names come off.
        const summary = adminPage.getByRole("region", { name: "Summary", exact: true });
        assertInOrder(
          await textOf(summary),
          [surveyName, `${BEFORE.questions} questions · about ${BEFORE.minutes} minutes`, "Who", ADMIN.who(state.programmeName, people.length), "Closes", deadlineWords(closesAt), "Names come off", ADMIN.namesOff(namesOffWords)],
          "the Send tab's summary",
        );

        assert.deepEqual(await adminTests(), [], "a test of this survey was in the admin's mailbox already");
        const test = await whenEnabled(send.getByRole("button", { name: ADMIN.test, exact: true }), ADMIN.test);
        const [response] = await Promise.all([responseTo(adminPage, `/api/surveys/${surveyId}/test`, "POST"), test.click()]);
        const body = await okBody(response, "Send a test to me");
        assert.deepEqual([body.delivery, body.recorded], ["sent", true], "the test did not reach the admin, or was not recorded");
        const tested = await waitFor("the test to be recorded on the survey", async () => {
          const now = await survey();
          return now.tests?.survey ? now : null;
        });
        assert.equal(tested.tests.survey.byUid, state.adminUid, "the test is not recorded as the admin's");
        const testedAt = instantOf(tested.tests.survey.at);
        await send
          .getByText(
            new RegExp(
              `^(${escapeRegExp(`Test sent to you at ${londonClockLabel(testedAt)}`)}|${escapeRegExp(`Test sent to you on ${londonDayLabel(testedAt)} at ${londonClockLabel(testedAt)}`)})$`,
            ),
          )
          .waitFor({ timeout: WAIT_MS });
        await whenEnabled(emailButton, ADMIN.emailButton(people.length));

        // The test in the admin's mailbox: the email as it will go, marked, signed by the admin.
        const tests = await waitFor("the test in the admin's mailbox", async () => {
          const found = await adminTests();
          return found.length > 0 ? found : null;
        });
        assert.equal(tests.length, 1, `the admin was sent ${tests.length} tests of this survey`);
        const [email] = tests;
        assert.ok(tested.testToken, "the test made no test link");
        const testPath = `/survey/${tested.testToken}`;
        assertEmail(email, surveyEmail({ intro, link: `${origin}${testPath}`, test: true }), "the test");
        assert.equal(linkIn(email, "the test"), testPath, "the test's button does not open the survey's test link");
        // Nobody holding a place was emailed by the test.
        assert.deepEqual(await mailCounts(), { Ada: 0, Ben: 1, Cleo: 0, Dan: 1, Fern: 1 }, "the test reached somebody holding a place");

        // Its link shows the survey as people will, and has no Send button: it keeps nothing.
        const testPage = await context.newPage();
        try {
          await testPage.goto(`${origin}${testPath}`, { waitUntil: "domcontentloaded" });
          await readSurveyHead(testPage, saved, { facilitators: null });
          await whenEnabled(testPage.getByRole("button", { name: PAGE.next, exact: true }), PAGE.next);
          const pages = pagesOf(saved.items);
          for (let n = 1; n < pages.length; n += 1) {
            await testPage.getByRole("region", { name: pages[n - 1].heading, exact: true }).getByRole("button", { name: PAGE.next, exact: true }).click();
          }
          const last = testPage.getByRole("region", { name: pages[pages.length - 1].heading, exact: true });
          await last.getByText(PAGE.test, { exact: true }).waitFor({ timeout: WAIT_MS });
          assert.equal(await testPage.getByRole("button", { name: PAGE.send }).count(), 0, "the test link offers Send my answers");
          // The answer route refuses the test link's secret too.
          const kept = await fetchAs(testPage, "/api/surveys/answer", jsonInit("POST", { token: tested.testToken, answers: {} }));
          assert.deepEqual([kept.status, kept.body?.error], [409, "This is a test link, so nothing sent from it is kept."], "the test link's answer was not refused");
        } finally {
          await testPage.close();
        }
        assert.equal((await answersOfSurvey()).size, 0, "the test link kept an answer");
      });

      await step("the send emails everybody holding a place their own link, with the count on its button, and the questions lock", async () => {
        activePage = adminPage;
        const saved = await survey();
        const intro = saved.intro.split(/\n\s*\n/).map(flat);
        const send = adminPage.getByRole("region", { name: "Send", exact: true });
        const emailButton = await whenEnabled(send.getByRole("button", { name: ADMIN.emailButton(people.length), exact: true }), ADMIN.emailButton(people.length));
        const [request, response] = await Promise.all([
          adminPage.waitForRequest((r) => new URL(r.url()).pathname === `/api/surveys/${surveyId}/send` && r.method() === "POST", { timeout: WAIT_MS }),
          responseTo(adminPage, `/api/surveys/${surveyId}/send`, "POST"),
          emailButton.click(),
        ]);
        assert.deepEqual(request.postDataJSON(), { to: "everyone", emails: people.length }, "the send did not carry the number on its button");
        const body = await okBody(response, "Email 4 people");
        assert.deepEqual(
          { sent: body.sent, held: body.held, suppressed: body.suppressed, failed: body.failed, noAddress: body.noAddress },
          { sent: people.length, held: 0, suppressed: 0, failed: 0, noAddress: 0 },
          "the send's tally",
        );

        // The tab now says what went, and how many have answered.
        const sentRegion = adminPage.getByRole("region", { name: "Sent", exact: true });
        await sentRegion.getByText(ADMIN.firstSent(people.length), { exact: true }).waitFor({ timeout: WAIT_MS });
        await sentRegion.getByText(ADMIN.progress(0, people.length, closesDay), { exact: true }).waitFor({ timeout: WAIT_MS });
        const sentNow = await survey();
        const firstSentAt = instantOf(sentNow.firstSentAt);
        assert.ok(firstSentAt, "the send left no first-send stamp");
        assert.deepEqual(
          (sentNow.presses ?? []).map((pressed) => [pressed.kind, pressed.count]),
          [["first", people.length]],
          "the survey's record of what went",
        );
        assert.equal(sentNow.inFlight ?? null, null, "the send still holds the survey");
        assert.equal(sentNow.namesOffOn, namesOffOn, "the send fixed another day for names to come off");
        await adminPage
          .getByRole("region", { name: "Joined since", exact: true })
          .getByText(ADMIN.nobodyNew(londonDayLabel(firstSentAt)), { exact: true })
          .waitFor({ timeout: WAIT_MS });
        await adminPage
          .getByRole("region", { name: "Remind", exact: true })
          .getByText(ADMIN.remindLead(people.length), { exact: true })
          .waitFor({ timeout: WAIT_MS });

        // Each person holding a place has a row with their own secret, sent and answered by nobody yet.
        const rows = await rowsOf();
        assert.deepEqual([...rows.keys()].sort(), people.map((person) => person.uid).sort(), "the survey went to somebody else, or missed somebody");
        const tokens = new Set();
        for (const person of people) {
          const row = rows.get(person.uid);
          assert.deepEqual(
            [row.respondent, row.delivery, row.answered, row.reminders, Boolean(instantOf(row.sentAt))],
            [{ kind: "account", uid: person.uid }, "sent", false, 0, true],
            `${person.first}'s row on the survey`,
          );
          assert.match(row.token, /^[A-Za-z0-9_-]{43}$/, `${person.first}'s link's secret is not 32 random bytes`);
          tokens.add(row.token);
        }
        assert.equal(tokens.size, people.length, "two people were given the same link");

        // Each person's email, word for word, with their own link and nobody else's.
        for (const person of people) {
          const summaries = await mailTo(person.email, person === ada || person === cleo ? 1 : 2);
          const email = await readEmail(summaries[summaries.length - 1]);
          const path = `/survey/${rows.get(person.uid).token}`;
          assertEmail(email, surveyEmail({ intro, link: `${origin}${path}`, test: false }), `${person.first}'s survey email`);
          assert.equal(linkIn(email, `${person.first}'s survey email`), path, `${person.first}'s email does not carry their own link`);
          linkOf.set(person.key, path);
        }
        assert.deepEqual(await mailCounts(), { Ada: 1, Ben: 2, Cleo: 1, Dan: 2, Fern: 1 }, "the send reached somebody twice, or the facilitator");

        // The questions are fixed now: the tab reads them, and the route refuses a change.
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}/questions`, { waitUntil: "domcontentloaded" });
        await adminPage.getByText(ADMIN.sentLock, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await adminPage.getByRole("button", { name: "Save", exact: true }).count(), 0, "a sent survey's Questions tab offers Save");
        assert.equal(await adminPage.getByLabel(`Question ${EDITS.question.number}`, { exact: true }).count(), 0, "a sent survey's questions can be typed in");
        assert.ok((await mainText(adminPage)).includes(EDITS.question.now), "the read-only questions do not show the saved words");
        const change = await fetchAs(
          adminPage,
          `/api/surveys/${enc(surveyId)}/questions`,
          jsonInit("POST", { title: saved.title, intro: saved.intro, minutes: saved.minutes, closesOn, items: saved.items }),
        );
        assert.deepEqual([change.status, change.body?.error], [409, ADMIN.sentRefusal], "a change after the send was not refused");
        // The list has it open, none of four answered.
        await adminPage.goto(`${origin}/admin/surveys`, { waitUntil: "domcontentloaded" });
        const open = adminPage.getByRole("region", { name: "Open", exact: true });
        await open.getByRole("link", { name: surveyName, exact: true }).waitFor({ timeout: WAIT_MS });
        assertInOrder(
          await textOf(listRow(open)),
          [surveyName, `Fellowship: ${state.programmeName}`, `0 of ${people.length}`, `Closes ${closesDay}`, "Remind", `${people.length} haven’t answered`, "Results"],
          "the list's open survey",
        );
      });

      // The answers each person gives, as each is to be kept.
      const keptFor = new Map();

      await step(
        "a person opens their own link signed out, answers every kind of question, by keyboard where a slider is offered, and sends",
        async () => {
          activePage = adaPage;
          const now = await survey();
          const link = linkOf.get("ada");
          assert.ok(link, "Ada's link was not read out of her email");
          // Signed out: Ada's context has never signed in, and her account was never approved.
          await adaPage.goto(`${origin}${link}`, { waitUntil: "domcontentloaded" });
          await adaPage.getByText(PAGE.bar, { exact: true }).first().waitFor({ timeout: WAIT_MS });
          await readSurveyHead(adaPage, now, { facilitators: [fern.first] });
          // Every kind the template asks, each pressed once.
          const kinds = new Set(questionsOf(now.items).map((question) => question.type));
          assert.deepEqual(
            [...kinds].sort(),
            ["lines", "multipleChoice", "number", "percent", "scale", "shortText", "singleChoice"],
            "the template asks a kind of question this spec does not press",
          );
          const sent = await answerSurvey(adaPage, now, ADA_SAYS, { followUps: true, sendsTo: "/api/surveys/answer" });
          const expected = expectedAnswers(now, ADA_SAYS);
          assert.equal(Object.keys(expected).length, BEFORE.questions, "Ada's plan skips a question");
          assert.deepEqual(Object.keys(sent).sort(), ["answers", "consents", "token"], "the page sent more than the answers, the box and the link, or the Kairos box it never touched");
          assert.equal(sent.token, link.slice("/survey/".length), "the page sent another person's link");
          assert.deepEqual(comparable(sent.answers), expected, "the answers the page sent");
          assert.deepEqual(sent.consents, { followUps: true }, "the follow-ups box the page sent");
          keptFor.set("ada", expected);

          // Kept once, against Ada, by her link, before her group has met.
          const answers = await answersOfSurvey();
          const kept = answers.get(ada.uid);
          assert.ok(kept, "Ada's answers were not kept");
          assert.deepEqual(
            [kept.roundId, kept.respondent, kept.via, kept.afterFirstSession, comparable(kept.answers)],
            [state.formId, { kind: "account", uid: ada.uid }, "link", false, expected],
            "Ada's answers as kept",
          );
          const row = (await rowsOf()).get(ada.uid);
          assert.deepEqual([row.answered, row.consents], [true, { followUps: true }], "Ada's row does not say she answered, or what her box said");
          assert.equal(await kairosChoiceOf(ada), false, "a Kairos box left as it was kept a choice");
        },
      );

      await step("their link then says they have answered, and they stop the follow-ups there", async () => {
        activePage = adaPage;
        const link = linkOf.get("ada");
        await adaPage.goto(`${origin}${link}`, { waitUntil: "domcontentloaded" });
        await adaPage.getByRole("heading", { level: 1, name: PAGE.answered.title, exact: true }).waitFor({ timeout: WAIT_MS });
        await adaPage.getByText(PAGE.answered.body, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await adaPage.getByRole("button", { name: PAGE.send }).count(), 0, "an answered link offers Send my answers");
        // A second answer through the link is refused, in the route's words.
        const again = await fetchAs(adaPage, "/api/surveys/answer", jsonInit("POST", { token: link.slice("/survey/".length), answers: {} }));
        assert.deepEqual([again.status, again.body?.error], [409, ADMIN.answeredRefusal], "a second answer was not refused");

        // What she said about follow-ups, and the way to change it.
        const panel = adaPage.getByRole("region", { name: FOLLOW_UPS.region, exact: true });
        await panel.getByText(FOLLOW_UPS.yes, { exact: true }).waitFor({ timeout: WAIT_MS });
        const stop = await whenEnabled(panel.getByRole("button", { name: FOLLOW_UPS.stop, exact: true }), FOLLOW_UPS.stop);
        const [request, response] = await Promise.all([
          adaPage.waitForRequest((r) => new URL(r.url()).pathname === "/api/surveys/consent" && r.method() === "POST", { timeout: WAIT_MS }),
          responseTo(adaPage, "/api/surveys/consent", "POST"),
          stop.click(),
        ]);
        assert.deepEqual(request.postDataJSON(), { token: link.slice("/survey/".length), purpose: "followUps", given: false }, "Stop the follow-ups sent something else");
        const body = await okBody(response, "Stop the follow-ups");
        assert.equal(body.given, false, "the follow-ups were not stopped");
        await panel.getByRole("status").filter({ hasText: FOLLOW_UPS.stopped }).waitFor({ timeout: WAIT_MS });
        await panel.getByText(FOLLOW_UPS.no, { exact: true }).waitFor({ timeout: WAIT_MS });
        await panel.getByRole("button", { name: FOLLOW_UPS.start, exact: true }).waitFor({ timeout: WAIT_MS });
        const row = (await rowsOf()).get(ada.uid);
        assert.deepEqual([row.answered, row.consents], [true, { followUps: false }], "Ada's row does not say she stopped the follow-ups");
        // Her answers are as they were: a consent is kept on her row, never in them.
        assert.deepEqual(comparable((await answersOfSurvey()).get(ada.uid)?.answers), keptFor.get("ada"), "changing the follow-ups changed Ada's answers");
      });

      await step("a second person answers from the card on Home, signed in, and the card goes", async () => {
        activePage = benPage;
        const now = await survey();
        await signIn(benPage, ben);
        await benPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        // "A survey for you": what it is, its programme, how long, when it closes, and Answer.
        const card = benPage.getByRole("region", { name: now.title, exact: true });
        await card.waitFor({ timeout: WAIT_MS });
        assert.deepEqual(
          await textsOf(card.locator("p")),
          ["A survey for you", `${state.programmeName} · ${BEFORE.questions} questions, about ${BEFORE.minutes} minutes · Closes ${closesDay}`],
          "the card's words",
        );
        const answer = card.getByRole("link", { name: "Answer", exact: true });
        assert.equal(await answer.getAttribute("href"), linkOf.get("ben"), "the card does not open Ben's own link");
        // The card is the first thing under the greeting, above the programme's own session.
        const ticket = benPage.getByRole("region", { name: "Your next session", exact: true });
        await ticket.waitFor({ timeout: WAIT_MS });
        const home = await mainText(benPage);
        assert.ok(home.indexOf("A survey for you") < home.indexOf(await textOf(ticket)), "the survey's card is not above the programme's own session");

        await Promise.all([benPage.waitForURL(`${origin}${linkOf.get("ben")}`, { timeout: WAIT_MS }), answer.click()]);
        await readSurveyHead(benPage, now, { facilitators: [fern.first] });
        const sent = await answerSurvey(benPage, now, BEN_SAYS, { followUps: false, sendsTo: "/api/surveys/answer", blank: BEN_BLANK });
        const expected = expectedAnswers(now, BEN_SAYS);
        assert.deepEqual(Object.keys(sent).sort(), ["answers", "consents", "token"], "the page sent more than the answers, the box and the link");
        assert.equal(sent.token, linkOf.get("ben").slice("/survey/".length), "the page sent another person's link");
        assert.equal(Object.keys(expected).length, BEFORE.questions, "Ben's plan leaves a question blank");
        assert.deepEqual(comparable(sent.answers), expected, "the answers the page sent");
        assert.deepEqual(sent.consents, { followUps: false }, "a box left unticked was not sent as a no");
        keptFor.set("ben", expected);
        const kept = (await answersOfSurvey()).get(ben.uid);
        assert.deepEqual(
          [kept?.respondent, kept?.via, kept?.afterFirstSession, comparable(kept?.answers)],
          [{ kind: "account", uid: ben.uid }, "link", false, expected],
          "Ben's answers as kept: by his own link, signed in or not",
        );
        assert.equal((await rowsOf()).get(ben.uid)?.consents?.followUps, false, "Ben's row does not say no to follow-ups");
        assert.equal(await kairosChoiceOf(ben), false, "a Kairos box left as it was kept a choice");

        // Home again, drawn whole (its session is there): nothing waits for Ben.
        await benPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        await benPage.getByRole("region", { name: "Your next session", exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await benPage.getByText("A survey for you", { exact: true }).count(), 0, "Home still offers Ben the survey Ben answered");
      });

      await step("a third person answers signed in at the survey's own address inside the programme", async () => {
        activePage = danPage;
        const now = await survey();
        const address = `/learn/${enc(state.runId)}/survey/${enc(surveyId)}`;
        await signIn(danPage, dan);
        await danPage.goto(`${origin}${address}`, { waitUntil: "domcontentloaded" });
        // The same page, inside the programme: the way back to it, then the survey.
        await readSurveyHead(danPage, now, { facilitators: [fern.first] });
        assert.equal(
          await danPage.getByRole("link", { name: state.programmeName, exact: true }).first().getAttribute("href"),
          `/learn/${enc(state.runId)}`,
          "the signed-in survey's way back is not the programme's page",
        );
        const sent = await answerSurvey(danPage, now, DAN_SAYS, { followUps: true, sendsTo: `/api/surveys/${surveyId}/answer`, blank: DAN_BLANK });
        const expected = expectedAnswers(now, DAN_SAYS);
        assert.equal(Object.keys(expected).length, BEFORE.questions, "Dan's plan leaves a question blank");
        // Signed in, the session says who: the request carries no link.
        assert.deepEqual(Object.keys(sent).sort(), ["answers", "consents"], "the signed-in page sent a link, or the Kairos box it never touched");
        assert.deepEqual(comparable(sent.answers), expected, "the answers the page sent");
        assert.deepEqual(sent.consents, { followUps: true }, "the follow-ups box the page sent");
        keptFor.set("dan", expected);
        const kept = (await answersOfSurvey()).get(dan.uid);
        assert.deepEqual(
          [kept?.respondent, kept?.via, kept?.afterFirstSession, comparable(kept?.answers)],
          [{ kind: "account", uid: dan.uid }, "signed-in", false, expected],
          "Dan's answers as kept: signed in",
        );
        assert.equal((await rowsOf()).get(dan.uid)?.consents?.followUps, true, "Dan's row does not say yes to follow-ups");
        assert.equal(await kairosChoiceOf(dan), false, "a Kairos box left as it was kept a choice");
        // The page then says Dan answered.
        await danPage.reload({ waitUntil: "domcontentloaded" });
        await danPage.getByRole("heading", { level: 1, name: PAGE.answered.title, exact: true }).waitFor({ timeout: WAIT_MS });
      });

      await step("the lead's results give totals with n and the response rate, and comments, and no name anywhere", async () => {
        activePage = adminPage;
        const now = await survey();
        const questions = questionsOf(now.items);
        const byId = new Map(questions.map((question, index) => [question.id, { question, number: index + 1 }]));
        const of = people.length;
        const answered = [...keptFor.values()];
        // A sent survey's own address opens its results.
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}`, { waitUntil: "domcontentloaded" });
        await adminPage.waitForURL(`${origin}/admin/surveys/${enc(surveyId)}/results`, { timeout: WAIT_MS });
        await adminPage.getByText(ADMIN.answersRate(answered.length, of), { exact: true }).waitFor({ timeout: WAIT_MS });
        // Before-survey answers sent after a first session can be left out: there are none.
        await adminPage.getByRole("link", { name: ADMIN.leaveOut, exact: true }).waitFor({ timeout: WAIT_MS });
        // The follow-ups box, as each row says it now: Ada stopped hers, Dan said yes.
        const consentLabel = now.items.find((item) => item.kind === "consent").boxes[0].label;
        assert.equal(
          await textOf(adminPage.getByRole("region", { name: ADMIN.consent, exact: true }).locator("p")),
          `${ADMIN.rate(1, of, "said yes")}: ${consentLabel}.`,
          "the results' count of yes to follow-ups",
        );
        assert.equal(
          await adminPage.locator("main section[aria-labelledby^='result-q_']").count(),
          questions.length,
          "the results do not have a card for each question",
        );
        const result = (id) => adminPage.getByRole("region", { name: `${byId.get(id).number}. ${byId.get(id).question.title}`, exact: true });
        const answeredHow = (id) => answered.filter((answers) => answers[id] !== undefined);

        // A described point, counted per answer and averaged by its number.
        const c1 = byId.get("q_c1").question;
        const c1Answers = answeredHow("q_c1");
        const c1Parts = [ADMIN.rate(c1Answers.length, of)];
        for (const option of c1.options) {
          const count = c1Answers.filter((answers) => answers.q_c1.optionId === option.id).length;
          c1Parts.push(option.label, `${count} (${Math.round((count / c1Answers.length) * 100)}%)`);
        }
        const scores = c1Answers.map((answers) => c1.scores[answers.q_c1.optionId]);
        const c1Mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
        c1Parts.push(`Average ${Number.isInteger(c1Mean) ? c1Mean : c1Mean.toFixed(1)}, from ${scores.length} answers.`);
        assertInOrder(await textOf(result("q_c1")), c1Parts, "the described point's result");

        // A percentage and a number: the average, the middle value and the spread, in bands.
        const valueParts = (id, unit, bands) => {
          const values = answeredHow(id).map((answers) => answers[id].value).sort((a, b) => a - b);
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
          const middle = values.length % 2 === 1 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
          const words = (value) => `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
          const parts = [
            `${ADMIN.rate(values.length, of)}. Average ${words(mean)}, middle value ${words(middle)}, from ${words(values[0])} to ${words(values[values.length - 1])}.`,
          ];
          for (const [low, high, label] of bands) {
            const count = values.filter((value) => value >= low && value <= high).length;
            parts.push(label, `${count} (${Math.round((count / values.length) * 100)}%)`);
          }
          return parts;
        };
        assertInOrder(
          await textOf(result("q_c2")),
          valueParts("q_c2", "%", [[0, 19, "0 to 19%"], [20, 39, "20 to 39%"], [40, 59, "40 to 59%"], [60, 79, "60 to 79%"], [80, 100, "80 to 100%"]]),
          "the percentage's result",
        );
        assertInOrder(
          await textOf(result("q_c6")),
          valueParts("q_c6", "", [[0, 0, "0"], [1, 2, "1 to 2"], [3, 5, "3 to 5"], [6, 10, "6 to 10"], [11, Number.POSITIVE_INFINITY, "More than 10"]]),
          "the number's result, 0 counted as an answer",
        );

        // An agreement grid, line by line.
        const c7 = byId.get("q_c7").question;
        const gridParts = [];
        for (const line of c7.lines) {
          const values = answeredHow("q_c7").map((answers) => answers.q_c7.values[line.id]).filter((value) => typeof value === "number");
          gridParts.push(line.label, ADMIN.rate(values.length, of));
          for (let point = 1; point <= c7.scale.max; point += 1) gridParts.push(`${point} ${values.filter((value) => value === point).length}`);
          gridParts.push(`Mean ${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)}`);
        }
        gridParts.push(`1 is ${c7.scale.points[0]}, ${c7.scale.max} is ${c7.scale.points[c7.scale.max - 1]}.`);
        assertInOrder(await textOf(result("q_c7")), gridParts, "the agreement grid's result");

        // Pick any, under the admin's own words for an answer.
        const p5 = byId.get("q_p5").question;
        const p5Answers = answeredHow("q_p5");
        const p5Parts = [`${ADMIN.rate(p5Answers.length, of)}, ticking as many as applied`];
        for (const option of p5.options) {
          const count = p5Answers.filter((answers) => answers.q_p5.optionIds.includes(option.id)).length;
          p5Parts.push(option.label, `${count} (${Math.round((count / p5Answers.length) * 100)}%)`);
        }
        assertInOrder(await textOf(result("q_p5")), p5Parts, "the pick-any question's result");

        // The comments, in full, in the order they came, under the admin's own words for the question.
        const comments = result("q_p6");
        assert.equal(
          await textOf(comments.locator("p").first()),
          ADMIN.rate(answeredHow("q_p6").length, of, "wrote something"),
          "the comments' count",
        );
        assert.deepEqual(
          await textsOf(comments.getByRole("listitem")),
          ["ada", "ben", "dan"].map((key) => keptFor.get(key).q_p6.text),
          "the comments, in full",
        );
        assert.equal(await textOf(comments.getByRole("heading")), `${byId.get("q_p6").number}. ${EDITS.question.now}`, "the comments' question is not the admin's words");

        // No name anywhere: not a whole name, a first name, an address or an account's id.
        const said = await mainText(adminPage);
        for (const account of everybody) {
          for (const part of [account.displayName, account.email, account.uid]) {
            assert.ok(!said.includes(part), `the results name ${account.first}`);
          }
          assert.ok(!new RegExp(`\\b${escapeRegExp(account.first)}\\b`).test(said), `the results name ${account.first}`);
        }
      });

      await step("a facilitator is refused the survey's pages and its download, and is sent nothing", async () => {
        activePage = fernPage;
        await signIn(fernPage, fern);
        for (const path of [`/admin/surveys/${enc(surveyId)}/results`, `/admin/surveys/${enc(surveyId)}/answered`, "/admin/surveys"]) {
          await fernPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
          await waitFor(`${path} to send the facilitator away`, async () => new URL(fernPage.url()).pathname === "/dashboard");
        }
        const said = await mainText(fernPage);
        for (const words of [ADMIN.answersRate(keptFor.size, people.length), ...[...keptFor.values()].map((answers) => answers.q_p6.text)]) {
          assert.ok(!said.includes(words), "the facilitator's page shows the survey's results");
        }
        // The download with names answers her with a refusal, and makes nothing.
        const download = await fetchAs(fernPage, `/api/surveys/${enc(surveyId)}/export`, { method: "POST" });
        assert.deepEqual([download.status, download.body?.error], [403, ADMIN.adminOnly], "the download was not refused to the facilitator");
        assert.equal(
          (await fixtureQuery("dataExports").where("scope.surveyId", "==", surveyId).get()).size,
          0,
          "the refused download was logged",
        );
        // Nothing of the survey reached her: no card, no row, no email.
        assert.equal(await fernPage.getByText("A survey for you", { exact: true }).count(), 0, "the facilitator is offered the survey");
        assert.equal((await rowsOf()).has(fern.uid), false, "the survey was sent to the facilitator");
        assert.equal((await messagesTo(fern.email)).length, 1, "the facilitator was emailed about the survey");
      });

      await step("Who answered names each person, and the download with names is that table, logged", async () => {
        activePage = adminPage;
        const now = await survey();
        const rows = await rowsOf();
        const answers = await answersOfSurvey();
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}/answered`, { waitUntil: "domcontentloaded" });
        await adminPage
          .getByRole("heading", { level: 2, name: ADMIN.answeredHeading(keptFor.size, people.length), exact: true })
          .waitFor({ timeout: WAIT_MS });
        // By whole name, with when it went, when and how each answered.
        const expectedRows = [...people]
          .sort((a, b) => a.displayName.localeCompare(b.displayName, "en"))
          .map((person) => {
            const answer = answers.get(person.uid);
            return [
              person.displayName,
              dayAndClock(instantOf(rows.get(person.uid).sentAt)),
              answer ? dayAndClock(instantOf(answer.sentAt)) : "Not yet",
              answer ? (answer.via === "signed-in" ? "Signed in" : "Personal link") : "",
              "",
            ];
          });
        const table = adminPage.getByRole("table");
        await table.waitFor({ timeout: WAIT_MS });
        const drawn = [];
        for (const row of await table.locator("tbody tr").all()) drawn.push(await textsOf(row.locator("td")));
        assert.deepEqual(drawn, expectedRows, "Who answered");
        assert.equal(await textOf(table.locator("caption")), "Who it was sent to, and who has answered", "the table's caption");

        // The download: the answers with names, laid out from the survey as saved, recorded before it is handed over.
        await adminPage.getByText(ADMIN.recorded, { exact: true }).waitFor({ timeout: WAIT_MS });
        const before = londonDateKey(new Date());
        const [response, download] = await Promise.all([
          responseTo(adminPage, `/api/surveys/${surveyId}/export`, "POST"),
          adminPage.waitForEvent("download", { timeout: WAIT_MS }),
          (await whenEnabled(adminPage.getByRole("button", { name: ADMIN.download, exact: true }), ADMIN.download)).click(),
        ]);
        assert.ok(response.ok(), `the download answered ${response.status()}`);
        const after = londonDateKey(new Date());
        const csv = readFileSync(await download.path(), "utf8");
        const expected = exportTable(
          now.items,
          [...answers.entries()].map(([uid, answer]) => ({
            name: everybody.find((account) => account.uid === uid).displayName,
            sentAt: instantOf(answer.sentAt),
            via: answer.via,
            afterFirstSession: answer.afterFirstSession,
            answers: answer.answers,
          })),
        );
        assert.equal(csv, toCsv(expected.header, expected.rows), "the download is not the answers with names, laid out as the survey's questions");
        assert.ok(!csv.includes("@"), "the download carries an address");
        // Its name, and its log row.
        const slug = surveyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
        const name = download.suggestedFilename();
        assert.ok([before, after].some((day) => name === `${slug}-answers-${day}.csv`), `the file is called ${JSON.stringify(name)}`);
        const logged = (await fixtureQuery("dataExports").where("scope.surveyId", "==", surveyId).get()).docs.map((doc) => doc.data());
        assert.equal(logged.length, 1, `the download was logged ${logged.length} times`);
        const [row] = logged;
        assert.deepEqual(
          { kind: row.kind, scope: row.scope, rowCount: row.rowCount, filename: row.filename },
          { kind: "survey-answers", scope: { surveyId, roundId: state.formId }, rowCount: keptFor.size, filename: name },
          "the download's log row",
        );
        assert.ok(row.actorUid === state.adminUid, "the download's log row does not name the admin who pressed it");
      });

      await step("the reminder, after its own test, goes only to the person who has not answered, with their own link", async () => {
        activePage = adminPage;
        const unanswered = people.filter((person) => !keptFor.has(person.key));
        assert.deepEqual(unanswered, [cleo], "somebody other than Cleo has not answered");
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}/send`, { waitUntil: "domcontentloaded" });
        const remind = adminPage.getByRole("region", { name: "Remind", exact: true });
        await remind.getByText(ADMIN.remindLead(unanswered.length), { exact: true }).waitFor({ timeout: WAIT_MS });
        await remind.getByText(ADMIN.remindersGoTo, { exact: true }).waitFor({ timeout: WAIT_MS });
        const reminderSubject = reminderEmail({ link: "", test: false }).subject;
        const preview = remind.getByRole("article", { name: reminderSubject, exact: true });
        await preview.waitFor({ timeout: WAIT_MS });
        assert.deepEqual((await textsOf(preview.locator("dd"))).slice(1), [SOCIETY, "1 person"], "the reminder's reply-to and who it is to");
        const remindButton = remind.getByRole("button", { name: ADMIN.emailButton(unanswered.length), exact: true });
        await remindButton.waitFor({ timeout: WAIT_MS });
        assert.equal(await remindButton.isDisabled(), true, "the reminder can be sent before its own test");
        await remind.getByText(ADMIN.waitsForTest, { exact: true }).waitFor({ timeout: WAIT_MS });

        // Its own test, to the admin alone.
        const test = await whenEnabled(remind.getByRole("button", { name: ADMIN.test, exact: true }), ADMIN.test);
        const [testRequest, testResponse] = await Promise.all([
          adminPage.waitForRequest((r) => new URL(r.url()).pathname === `/api/surveys/${surveyId}/test` && r.method() === "POST", { timeout: WAIT_MS }),
          responseTo(adminPage, `/api/surveys/${surveyId}/test`, "POST"),
          test.click(),
        ]);
        assert.deepEqual(testRequest.postDataJSON(), { email: "reminder" }, "the reminder's test was asked for another email");
        const testBody = await okBody(testResponse, "the reminder's test");
        assert.deepEqual([testBody.delivery, testBody.recorded], ["sent", true], "the reminder's test did not reach the admin, or was not recorded");
        const tested = await waitFor("the reminder's test in the admin's mailbox", async () => {
          const found = await adminTests();
          return found.length >= 2 ? found : null;
        });
        assert.equal(tested.length, 2, `the admin was sent ${tested.length} tests of this survey`);
        const testPath = `/survey/${(await survey()).testToken}`;
        assertEmail(tested[1], reminderEmail({ link: `${origin}${testPath}`, test: true }), "the reminder's test");
        assert.equal(linkIn(tested[1], "the reminder's test"), testPath, "the reminder's test does not open the test link");

        // Then the reminder, with the number on its button.
        await whenEnabled(remindButton, ADMIN.emailButton(unanswered.length));
        const [request, response] = await Promise.all([
          adminPage.waitForRequest((r) => new URL(r.url()).pathname === `/api/surveys/${surveyId}/remind` && r.method() === "POST", { timeout: WAIT_MS }),
          responseTo(adminPage, `/api/surveys/${surveyId}/remind`, "POST"),
          remindButton.click(),
        ]);
        assert.deepEqual(request.postDataJSON(), { emails: unanswered.length }, "the reminder did not carry the number on its button");
        const body = await okBody(response, "the reminder");
        assert.deepEqual(
          { sent: body.sent, held: body.held, suppressed: body.suppressed, failed: body.failed, noAddress: body.noAddress },
          { sent: 1, held: 0, suppressed: 0, failed: 0, noAddress: 0 },
          "the reminder's tally",
        );
        await remind.getByRole("status").filter({ hasText: ADMIN.sentTo(1) }).waitFor({ timeout: WAIT_MS });
        await adminPage.getByRole("region", { name: "Sent", exact: true }).getByText(ADMIN.reminded(1), { exact: true }).waitFor({ timeout: WAIT_MS });

        // Cleo's reminder, word for word, with her own link; nobody who answered was reminded.
        const [, reminder] = await mailTo(cleo.email, 2);
        const email = await readEmail(reminder);
        assertEmail(email, reminderEmail({ link: `${origin}${linkOf.get("cleo")}`, test: false }), "Cleo's reminder");
        assert.equal(linkIn(email, "Cleo's reminder"), linkOf.get("cleo"), "Cleo's reminder does not carry her own link");
        assert.deepEqual(await mailCounts(), { Ada: 1, Ben: 2, Cleo: 2, Dan: 2, Fern: 1 }, "the reminder reached somebody who answered");
        const rows = await rowsOf();
        for (const person of people) {
          assert.equal(rows.get(person.uid)?.reminders, person === cleo ? 1 : 0, `${person.first}'s row's count of reminders`);
        }
        const pressed = (await survey()).presses.map((each) => [each.kind, each.count]);
        assert.deepEqual(pressed, [["first", people.length], ["remind", 1]], "the survey's record of what went");
        // Who answered says so beside her name.
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}/answered`, { waitUntil: "domcontentloaded" });
        const cleoRow = adminPage.getByRole("row").filter({ hasText: cleo.displayName });
        await cleoRow.waitFor({ timeout: WAIT_MS });
        assert.equal((await textsOf(cleoRow.locator("td")))[4], "Reminded once", "Who answered does not say Cleo was reminded");

        // Her link opens her own survey, whose box names no facilitator: Group B has none.
        activePage = cleoPage;
        await cleoPage.goto(`${origin}${linkOf.get("cleo")}`, { waitUntil: "domcontentloaded" });
        await readSurveyHead(cleoPage, await survey(), { facilitators: null });
      });

      await step("Close it now ends the survey, and the person who never answered is told it has closed", async () => {
        activePage = adminPage;
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}/send`, { waitUntil: "domcontentloaded" });
        const summary = adminPage.getByRole("region", { name: "Summary", exact: true });
        await (await whenEnabled(summary.getByRole("button", { name: ADMIN.close, exact: true }), ADMIN.close)).click();
        await summary.getByText(ADMIN.closeSure, { exact: true }).waitFor({ timeout: WAIT_MS });
        const [response] = await Promise.all([
          responseTo(adminPage, `/api/surveys/${surveyId}/close`, "POST"),
          summary.getByRole("button", { name: ADMIN.closeConfirm, exact: true }).click(),
        ]);
        await okBody(response, "Close it now");
        const closed = await survey();
        const closedAt = instantOf(closed.closedAt);
        assert.ok(closedAt, "closing left no stamp");
        const closedDay = londonDayLabel(closedAt);
        await adminPage
          .getByRole("region", { name: "Sent", exact: true })
          .getByText(ADMIN.progressClosed(keptFor.size, people.length, closedDay), { exact: true })
          .waitFor({ timeout: WAIT_MS });
        assert.equal(await adminPage.getByRole("region", { name: "Remind", exact: true }).count(), 0, "a closed survey still offers Remind");
        // The list has it closed.
        await adminPage.goto(`${origin}/admin/surveys`, { waitUntil: "domcontentloaded" });
        const closedList = adminPage.getByRole("region", { name: "Closed", exact: true });
        await closedList.getByRole("link", { name: surveyName, exact: true }).waitFor({ timeout: WAIT_MS });
        const closedRow = await textOf(listRow(closedList));
        assertInOrder(closedRow, [surveyName, `${keptFor.size} of ${people.length}`, `Closed ${closedDay}`, "Results"], "the list's closed survey");
        assert.ok(!closedRow.includes("Remind"), "the list offers Remind on a closed survey");

        // Cleo's link says it has closed, and her answer is refused in its words.
        activePage = cleoPage;
        await cleoPage.goto(`${origin}${linkOf.get("cleo")}`, { waitUntil: "domcontentloaded" });
        const words = PAGE.closed(closedDay);
        await cleoPage.getByRole("heading", { level: 1, name: words.title, exact: true }).waitFor({ timeout: WAIT_MS });
        await cleoPage.getByText(words.body, { exact: true }).waitFor({ timeout: WAIT_MS });
        const late = await fetchAs(cleoPage, "/api/surveys/answer", jsonInit("POST", { token: linkOf.get("cleo").slice("/survey/".length), answers: {} }));
        assert.deepEqual([late.status, late.body?.error], [409, ADMIN.closedRefusal], "an answer after the close was not refused");
        assert.equal((await answersOfSurvey()).has(cleo.uid), false, "an answer was kept after the close");
        // Closing emailed nobody.
        assert.deepEqual(await mailCounts(), { Ada: 1, Ben: 2, Cleo: 2, Dan: 2, Fern: 1 }, "closing emailed somebody");
      });

      await step("every survey email went to the send log as it should, and none carries an answer or the meeting link", async () => {
        activePage = adminPage;
        // About the survey: four notices from the send, one from the reminder, and the admin's two tests.
        const about = (await fixtureQuery("emailSends").where("referenceId", "==", surveyId).get()).docs.map((doc) => doc.data());
        const notices = about.filter((row) => row.kind === "notice");
        assert.deepEqual(
          notices.map((row) => [String(row.to).toLowerCase(), row.surface]).sort(),
          [ada, ben, cleo, cleo, dan].map((person) => [person.email.toLowerCase(), "course-survey"]).sort(),
          "the survey's notices in the send log",
        );
        const tests = about.filter((row) => row.kind === "course-test");
        assert.equal(tests.length, 2, `the send log has ${tests.length} tests of this survey`);
        assert.ok(
          tests.every((row) => String(row.to).toLowerCase() === secrets.adminEmail.toLowerCase()),
          "a test of this survey went to somebody other than the admin who pressed it",
        );
        assert.equal(about.length, notices.length + tests.length, "the send log has another kind of email about the survey");
        // Each person's own sends: the approvals, the survey, and Cleo's reminder.
        const kindsTo = async (account) =>
          (await fixtureQuery("emailSends").where("to", "==", account.email).get()).docs.map((doc) => String(doc.data()?.kind ?? "")).sort();
        assert.deepEqual(
          {
            Ada: await kindsTo(ada),
            Ben: await kindsTo(ben),
            Cleo: await kindsTo(cleo),
            Dan: await kindsTo(dan),
            Fern: await kindsTo(fern),
          },
          {
            Ada: ["notice"],
            Ben: ["application", "notice"],
            Cleo: ["notice", "notice"],
            Dan: ["application", "notice"],
            Fern: ["application"],
          },
          "the send log, person by person",
        );
        // No message carries anybody's answer, a result, or the meeting link.
        const messages = [...(await adminTests())];
        for (const account of everybody) {
          for (const summary of await messagesTo(account.email)) messages.push(await readEmail(summary));
        }
        assert.equal(messages.length, 2 + 1 + 2 + 2 + 2 + 1, "Mailpit holds another number of messages for this journey");
        const answersSaid = [...keptFor.values()].map((answers) => answers.q_p6.text);
        for (const message of messages) {
          for (const part of [message.html, message.text]) {
            assert.ok(!part.includes(groupA.meetingUrl) && !part.includes(linkHost), `"${message.subject}" carries the meeting link`);
            for (const said of answersSaid) assert.ok(!part.includes(said), `"${message.subject}" carries somebody's answer`);
            assert.ok(!part.includes("have answered") && !part.includes("% of the"), `"${message.subject}" carries a result`);
          }
        }
      });
    } finally {
      const contexts = [adaContext, benContext, danContext, fernContext, cleoContext, context];
      await Promise.allSettled(contexts.map((each) => each.close()));
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
