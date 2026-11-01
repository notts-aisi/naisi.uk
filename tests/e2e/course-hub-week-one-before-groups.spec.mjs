/**
 * Week 1 before groups go out, end to end, in a real browser.
 *
 * The course hub's term just after decision day with its later weeks loaded
 * (scripts/e2e-fixtures/worlds/course-hub-term.mjs, point "before-groups")
 * -> the admin approves the three accounts that sign in -> names the course
 * run on the programme's Settings tab and moves it on from draft -> sets the
 * day groups go out -> loads the programme's Start here and Glossary -> as
 * the programme's lead, writes week 1 on the Weeks tab, saves it as a draft
 * and previews it as a fellow, while the person holding a place still reads
 * only that their group is on its way -> marks week 1 ready, which publishes
 * it -> the person holding a place opens week 1 from Home and from My
 * programmes, reads Start here and the Glossary from it, ticks a source and
 * writes in a reflection box, and finds both after a reload, with every
 * other week and the groups still shut -> somebody who gives their place
 * back, and somebody who never held one, are refused -> the admin hands the
 * people still holding a place over, places them, sends Publish's test to
 * themselves and presses Publish -> the same week 1 now says when the work is
 * due for the group, with the tick and the reflection kept.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-week-one-before-groups
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: Publish needs its test
 * first, and "Send a test to me" emails the admin's own address, which the
 * harness does not own.
 *
 * ## What the lead pastes
 *
 * Week 1, Start here and the Glossary are SYNTHETIC: each in the fellow
 * guide's own Markdown shape (docs/course-weeks.md), every word made up and
 * every address on example.com or example.org, never the real course files.
 * Each reads with no problem and nothing to check through the loader's own
 * reading, and the spec holds the page to the words it pasted.
 *
 * ## Four identities, four browser contexts
 *
 * The admin (who is the programme's lead here, as at every course hub spec),
 * Ada (holds a place, reads week 1, is placed and told), Cleo (holds a place
 * and gives it back) and Fern (never held one). Ben holds a place too and
 * never signs in: Publish places him with Ada. Each identity has its own
 * context, so its cookies and its Firebase Auth state are its own.
 *
 * ## CHROMIUM ONLY
 *
 * A green run is a regression net, never a substitute for the manual Safari
 * pass.
 *
 * ## It writes a completion marker, and the runner insists on it
 *
 * The shared recorder records each step as it finishes and writes the list in
 * the `finally`; the runner refuses to report success unless the marker names
 * every step in `SPEC.steps`.
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
  waitForHydration,
} from "../../scripts/e2e/lib/browser.mjs";
import { getMessage, hrefUrls, messagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  enrolmentId,
  fixtureDoc,
  fixtureQuery,
  fixtureSubcollection,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-week-one-before-groups.mjs";
import {
  BEFORE_GROUPS,
  WEEK_COUNT,
  dayLabel,
  shiftDateKey,
  weekDocId,
  weekSpanLabel,
  weeklySlotWords,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/**
 * How long a message may take to reach Mailpit, through the harness's own
 * wait (`waitForMessagesTo`). Longer than a locator's on purpose: on a loaded
 * CI runner an email has landed after thirty seconds, and a mailbox counted
 * sooner failed runs whose sends were right. A message that never comes
 * still fails, a little later.
 */
const MAIL_WAIT_MS = 60_000;

/** How often a poll asks again. */
const POLL_MS = 500;

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
        ? "This journey reads its own mail, the test of Publish's emails to the admin included, so " +
          "it runs only against the server the harness starts with its mail caught by Mailpit."
        : null;

// ---------------------------------------------------------------------------
// What the lead pastes: synthetic, in the fellow guide's own shape
// ---------------------------------------------------------------------------

/**
 * Week 1, as the guide's export writes a first week: This week's table with
 * one task over the three parts and a row with nothing to do, Why this week
 * and its outcomes, Before the session with three parts (two sources to tick
 * and three reflection stops), In the session and Go further. No ids: the
 * paste mints them.
 */
const WEEK_ONE_MARKDOWN = `# Week 1: Who keeps the hives

## This week

| Do this | Time | When |
| --- | --- | --- |
| Work through the three parts below, writing in the boxes as you go | About 50 minutes | Before session 1, if you can |
| Talk and short answer | None this week | You'll pick a topic at the end of the session |
| **In all** | **About 50 minutes** | |

Do what you can before the session. Short of time? Do part 1.

## Why this week

Bees pollinate much of what we eat. This week asks **who** looks after the hives.

After this week you can:

- Name three kinds of hive.
- Say what a keeper does in spring.

## Before the session (about 50 minutes)

Work through the parts in order.

### Part 1: Start with what you think (about 5 minutes)

Write before you read anything.

**Reflect**

- How many hives are kept in your county, do you think?
- Who should pay for a swarm that leaves?

### Part 2: Two keepers' views (about 35 minutes)

Two very different keepers.

1. **Read:** [A keeper's year](https://example.com/keepers-year), Ada Example, 2024. 15 minutes. The first chapter is enough.
2. **Watch:** [Hives at dawn](https://example.org/hives-at-dawn), Example Films, March 2025. About 20 minutes.

**Reflect**

- Where do the two keepers disagree?
- Which scene felt most true?

### Part 3: What would change your mind? (about 10 minutes)

Say what would move you.

**Reflect**

- Look back at your number from part 1.
- What would you need to see next spring?

## In the session

You'll compare notes in pairs.

## Go further (optional)

More for anyone who wants it.

- **Listen:** [Keepers talk](https://example.com/keepers-talk), Example Radio, 2023. 40 minutes. A long conversation.
- **Read:** [The hive book](https://example.org/hive-book), Example Press. The whole history.
`;

/** What the page says of the week, from the Markdown above. */
const WEEK_ONE = Object.freeze({
  title: "Who keeps the hives",
  task: "Work through the three parts below, writing in the boxes as you go",
  taskTime: "About 50 minutes",
  /** The guide's "when" words: the page keeps what follows the comma. */
  whenText: "Before session 1, if you can",
  ticked: "A keeper's year",
  firstPrompt: "How many hives are kept in your county, do you think?",
});

/**
 * Start here, as the guide's export writes it: the title line (kept for the
 * copy, never drawn), an opening, sections with a list, a table and the bold
 * "Reflections." paragraph the page's box goes under, Support (drawn in a box
 * of its own), and the credit line.
 */
const START_HERE_MARKDOWN = `# Hive Fellowship: fellow guide

Four weeks, one evening a week among the hives. You'll learn how a hive is kept, who keeps it and why it matters.

## What you'll get out of it

- Say how a hive is opened and closed.
- Explain who pays for a lost swarm, and why people disagree.

## A week, step by step

Each week's page opens with a box of what to do.

| Part | What you do | Time |
| --- | --- | --- |
| Before the evening | Readings and a short film | About an hour |
| The evening | Two hours together at the apiary | 2 hours |

**Reflections.** Most weeks have a reflection stop or two. Jot a few lines for each as you go.

## How we behave

- **Come curious.** Nobody expects you to know this already.
- **Look after each other.** Step out whenever you need to.

### Support

If anything this term weighs on you, tell your facilitator.

Adapted from [Example Apiary's course](https://example.org/apiary-course), with the evenings redesigned for a group in a garden.
`;

/** What the Start here page says of the paste above. */
const START_HERE = Object.freeze({
  opening: "Four weeks, one evening a week among the hives. You'll learn how a hive is kept, who keeps it and why it matters.",
  sections: ["What you'll get out of it", "A week, step by step", "How we behave", "Support"],
  credit: "Adapted from Example Apiary's course, with the evenings redesigned for a group in a garden.",
});

/** The Glossary, as the guide's export writes it: an opening and one table of two columns. */
const GLOSSARY_MARKDOWN = `# Glossary

The words you'll meet most, in plain words.

| Term | In plain words |
| --- | --- |
| Brood | The eggs and young bees in a hive. |
| Frame | A wooden rectangle the bees build their comb on. |
| Queen excluder | A grid that keeps the queen out of the honey. |
| Smoker | A can that puffs cool smoke to calm the bees. |
| Super | The box on top where the honey is stored. |
`;

/** What the Glossary page says of the paste above, and what its find box keeps. */
const GLOSSARY = Object.freeze({
  opening: "The words you'll meet most, in plain words.",
  terms: ["Brood", "Frame", "Queen excluder", "Smoker", "Super"],
  /** A word only two definitions hold: the box finds a term by what it means, too. */
  find: "honey",
  found: ["Queen excluder", "Super"],
  /** A word nothing holds. */
  nothing: "lighthouse",
});

/** What Ada writes in her first reflection box. */
const ADA_WROTE = "About forty, I think, mostly in gardens.";

// ---------------------------------------------------------------------------
// The site's own words, restated from the files named beside each
// ---------------------------------------------------------------------------

/**
 * Home's and My programmes' card for a place held before groups go out:
 * src/lib/courses/weekOne/cards.ts and the sentences of
 * src/lib/courses/groupsGoOut.ts (board st-waiting, and v20's "Week 1 is open").
 */
const CARD = Object.freeze({
  title: "Your group’s on its way",
  eyebrow: (programme) => `Fellowship: ${programme}`,
  body: (day, from, to) =>
    `We’re putting groups together now. You’ll get an email with your group, day and room by ${day}. ` +
    `Your first session will be between ${from} and ${to}.`,
  weekOne: "Week 1 is open",
  free: "Check when you’re free",
});

/** Week 1's line before groups go out (board st-week1-phone): `weekOneOpenWords`, src/lib/courses/groupsGoOut.ts. */
const weekOneLine = (day) => `Week 1 is open now. You’ll hear your group and when it meets on ${day}.`;

/**
 * Who reads and who sees, on a week page and Start here, for somebody with no
 * group yet and a programme with no lead: `reflectionsReadByWords`,
 * `readOutWords`, `ticksSeenByWords` and `BOXES_SAVE_LINE` in
 * src/lib/courses/memberPageWords.ts, `onThisSiteWords` in
 * src/lib/courses/guide/words.ts. Ada's group has no facilitator, so she reads
 * the same lines once she is placed.
 */
const READERS = Object.freeze({
  reflections: "Your facilitators and admins can read your reflections. Other fellows can’t.",
  readOut: "Your facilitators may read a line out in the session, without your name.",
  ticks: "Your facilitators and admins can see which sources you tick.",
  boxes: "Write your answers in the boxes below. They save as you type.",
  onThisSite:
    "On this site: write your reflections in the boxes on each week’s page. They save as you type. " +
    "You don’t need to send them. Your facilitators and admins can read them; other fellows can’t. " +
    "Your facilitators may read a line out in the session, without your name.",
});

/** A week page's own lines (src/lib/courses/memberPageWords.ts, src/features/courses/weekBlocks/). */
const WEEK_PAGE = Object.freeze({
  eyebrow: (programme, range) => [`Fellowship: ${programme}`, `Week 1 of ${WEEK_COUNT}`, range].filter(Boolean).join(" · "),
  /** `taskWhenWords`: the rule alone before a group has a day, then the group's day. */
  dueBefore: "Before your first session, if you can",
  dueOn: (day) => `Before your first session, ${day}, if you can`,
  rateIt: "Rate it or leave a note",
  progress: "See your progress week by week",
  /** The way on to week 2: a link named for it, once it is published (every published week is open to read ahead). */
  weekTwo: "Week 2",
});

/** Start here's and the Glossary's own words (src/lib/courses/guide/words.ts). */
const GUIDE = Object.freeze({
  findLabel: "Find a term",
  count: (shown, total) => (shown === null ? `${total} terms` : `${shown} of ${total} terms`),
  noMatch: (query) => `No term matches “${query}”.`,
  foot: "Something missing? Ask your facilitator.",
});

/** The Weeks tab's words (src/lib/courses/weeksTab/words.ts, the week page and Mark ready). */
const WEEKS_TAB = Object.freeze({
  noPage: "Week 1 has no page on this run yet: saving its Markdown here makes it.",
  notPublished: "Week 1 isn’t published yet: marking it ready publishes it.",
  ready: "Ready: everyone holding a place can open week 1.",
  saved: "Week 1 saved.",
  preview: "Week 1 as a fellow reads it. This is a preview: nothing here can be ticked or sent, and nobody’s answers are shown.",
});

/**
 * How each door refuses somebody week 1 does not open to: the tick route's
 * and the reflection route's own sentences, and what Home and My programmes
 * say to somebody on no programme and holding no place.
 */
const REFUSED = Object.freeze({
  tick: "Week 1 isn’t open to you yet.",
  reflection: "Only somebody taking part in this programme can write in its reflection boxes.",
  home: "You’re not on a programme.",
  learn: "You're not on a course yet",
});

/**
 * The application page's reply (src/features/applications/status/ReplyButtons.tsx,
 * src/lib/applications/status/reasons.ts and words.ts), as T4 reads it.
 */
const REPLY = Object.freeze({
  cantMakeIt: "I can’t make it",
  question: "Give your place back? This frees it for someone else, and you can’t undo it here.",
  reason: "I have too much on this term",
  yes: "Yes, I can’t make it",
  givenBack: "You’ve told us you can’t make it.",
  chip: "Place given back",
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

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
 * which is the text as CSS shows it (labels are set in capitals by CSS, and
 * the words are the record's, not the look's).
 */
const textOf = async (locator) => flat((await locator.textContent()) ?? "");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** What an email's HTML says, as one line of words. */
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

/** One email, read out of Mailpit whole: its subject, its words, its links and both parts. */
async function readEmail(summary) {
  const message = await getMessage(summary.ID);
  return {
    subject: message.Subject ?? summary.Subject ?? "",
    words: wordsOf(message.HTML),
    links: hrefUrls(message.HTML ?? ""),
    text: message.Text ?? "",
    html: message.HTML ?? "",
  };
}

/**
 * A request sent from a page, with that page's own session: exactly what the
 * page itself would send, so a refusal read here is the one the person gets.
 */
async function fetchAs(pg, path, init = {}) {
  return pg.evaluate(
    async ({ path: target, init: options }) => {
      const res = await fetch(target, options);
      const text = await res.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON: kept as the words it is.
      }
      return { status: res.status, body };
    },
    { path, init },
  );
}

/** A JSON PUT as the page sends one. */
const putJson = (body) => ({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * The sources and reflection prompts of a week written as blocks, as the
 * paste minted their ids: a tick and a box are addressed by them.
 */
function itemsOf(week) {
  const sources = [];
  const prompts = [];
  for (const block of week?.blocks ?? []) {
    if (block.type !== "part") continue;
    for (const child of block.blocks ?? []) {
      if (child.type === "source") sources.push({ id: child.id, title: child.title });
      if (child.type === "reflection") {
        for (const prompt of child.prompts ?? []) prompts.push({ id: prompt.id, text: prompt.text });
      }
    }
  }
  return { sources, prompts };
}

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: week 1 before groups go out, from the lead's Weeks tab to the group's due day",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const [ada, ben, cleo] = state.people;
    const fern = state.facilitator;
    const groupOf = (key) => state.groups.find((group) => group.key === key);
    const groupA = groupOf("A");
    const groupB = groupOf("B");
    /** Where Publish puts each person still holding a place: Ada can make Group A only, Ben either. */
    const placeOf = { [ada.key]: groupA, [ben.key]: groupB };
    /** Everybody who holds a place once Cleo has given hers back. */
    const holding = [ada, ben];

    const formPath = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const formBase = `${origin}${formPath}`;
    const setupUrl = `${formBase}/setup`;
    const sessionsUrl = `${formBase}/groups/sessions`;
    const weeksUrl = `${formBase}/weeks`;
    const weekOneTabPath = `${formPath}/weeks/${weekDocId(1)}`;
    const runEditorUrl = `${origin}/admin/courses/${enc(state.courseId)}/runs/${enc(state.runId)}`;
    const boardUrl = `${runEditorUrl}/allocation`;
    const programmePath = `/learn/${enc(state.runId)}`;
    const weekPath = (n) => `${programmePath}/weeks/${n}`;
    const startHerePath = `${programmePath}/start-here`;
    const glossaryPath = `${programmePath}/glossary`;
    const overviewPath = `/api/courses/runs/${enc(state.runId)}/overview`;
    const tickPath = (itemId) => `/api/courses/runs/${enc(state.runId)}/ticks/${enc(itemId)}`;
    const reflectionPath = (promptId) => `/api/courses/runs/${enc(state.runId)}/reflections/${enc(promptId)}`;
    const applicationUrl = `${origin}/applications/${enc(state.formId)}`;
    const freeHref = `/applications/${enc(state.formId)}#when-youre-free`;

    // The day groups go out: the day before the run's first day, so it is
    // still today or later whatever the hour the run reaches it.
    const goOutKey = shiftDateKey(state.startDate, -1);
    const goOutDay = dayLabel(goOutKey);
    const cardBody = CARD.body(goOutDay, dayLabel(state.startDate), dayLabel(shiftDateKey(state.startDate, 6)));

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: adaContext, page: adaPage } = await newIdentityPage(browser);
    const { context: cleoContext, page: cleoPage } = await newIdentityPage(browser);
    const { context: fernContext, page: fernPage } = await newIdentityPage(browser);

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
    for (const pg of [adaPage, cleoPage, fernPage]) await stubRecaptchaOnLoopback(pg, origin);
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
     * The centre-screen action toast carrying one sentence, matched by the
     * sentence as well as the role: other parts of these pages carry
     * `role="status"` too.
     */
    const toastOf = (pg, pattern) =>
      pg.locator('[role="status"][aria-live="polite"]').filter({ hasText: pattern }).first();

    /** Waits for the toast to say something while `run` presses, then for it to go. */
    async function readToast(pg, pattern, run) {
      const said = toastOf(pg, pattern);
      const [, answer] = await Promise.all([said.waitFor({ timeout: WAIT_MS }), run()]);
      // The toast covers the page while it is up, so a press before it goes
      // lands on its backdrop.
      await said.waitFor({ state: "hidden", timeout: WAIT_MS });
      return answer;
    }

    /** The page's address, without its origin. */
    const pathOf = (pg) => new URL(pg.url()).pathname;

    /** Opens `path` and waits to be sent to `to`: a redirect, which is how the run's pages refuse. */
    async function sentTo(pg, path, to, who) {
      await pg.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      await pg.waitForURL((url) => url.pathname === to, { timeout: WAIT_MS }).catch(() => {
        throw new Error(`${who} opened ${path} and stayed on ${pathOf(pg)}, where the page sends them to ${to}.`);
      });
    }

    /** The stored week of the run, or null when it has no page. */
    async function storedWeek(n) {
      const snap = await fixtureSubcollection("courseRuns", state.runId, "weeks").doc(weekDocId(n)).get();
      return snap.exists ? (snap.data() ?? null) : null;
    }

    // ---- Mail ------------------------------------------------------------------

    /** The messages to one fixture address, oldest first, once there are `count`. */
    async function mailTo(address, count) {
      const summaries = await waitForMessagesTo(address, { count, timeoutMs: MAIL_WAIT_MS });
      return summaries.slice().reverse();
    }

    /** How many messages each account has, by first name. */
    async function mailCounts() {
      const counts = {};
      for (const account of [...state.people, fern]) counts[account.first] = (await messagesTo(account.email)).length;
      return counts;
    }

    /**
     * The tests of Publish's emails this run sent to the admin, read out of the
     * admin's own mailbox in Mailpit and told apart by the run's id, which the
     * email's link to the programme's page carries. The address is never printed.
     */
    async function adminTests() {
      const found = [];
      for (const summary of await messagesTo(secrets.adminEmail)) {
        if (!String(summary.Subject ?? "").startsWith("[TEST] ")) continue;
        const email = await readEmail(summary);
        if (email.html.includes(state.runId)) found.push(email);
      }
      return found;
    }

    /** Neither half of an email names Group A's meeting link, nor its host. */
    function assertNoMeetingLink(email, who) {
      for (const [part, body] of [
        ["HTML", email.html],
        ["text", email.text],
      ]) {
        assert.ok(
          !body.includes(groupA.meetingUrl) && !body.includes(new URL(groupA.meetingUrl).host),
          `${who}'s ${part} part carries the meeting link. A link to join lives on the site only.`,
        );
      }
    }

    /** Every send log row to one address, by kind. */
    const sendKindsTo = async (address) =>
      (await fixtureQuery("emailSends").where("to", "==", address).get()).docs
        .map((doc) => String(doc.data()?.kind ?? ""))
        .sort();

    // ---- Home and My programmes ---------------------------------------------------

    /** "Your group’s on its way", on Home or My programmes. */
    const onItsWay = (pg) => pg.getByRole("region", { name: CARD.title, exact: true });

    /**
     * The card for Ada's place, as st-waiting draws it: the programme, the
     * title, when the group email comes and when the first session will be,
     * and the way to when she is free; "Week 1 is open" only once its door is.
     */
    async function assertOnItsWay(pg, where, { weekOneOpen }) {
      const card = onItsWay(pg);
      await card.waitFor({ timeout: WAIT_MS });
      await card.getByText(CARD.eyebrow(state.programmeName), { exact: true }).waitFor({ timeout: WAIT_MS });
      const body = card.getByText(cardBody, { exact: true });
      assert.equal(await body.count(), 1, `${where}'s card does not say ${JSON.stringify(cardBody)}: ${await textOf(card)}`);
      assert.equal(
        await card.getByRole("link", { name: CARD.free, exact: true }).getAttribute("href"),
        freeHref,
        `${where}'s card does not lead to when the person is free on their application`,
      );
      const weekOne = card.getByRole("link", { name: CARD.weekOne, exact: true });
      if (weekOneOpen) {
        assert.equal(await weekOne.getAttribute("href"), weekPath(1), `${where}'s "Week 1 is open" does not lead to week 1`);
      } else {
        assert.equal(await weekOne.count(), 0, `${where}'s card says week 1 is open before it is ready`);
      }
      return card;
    }

    /**
     * Home and My programmes for somebody holding no place and on no
     * programme: each says so in its own words, and neither draws the card or
     * a way to week 1.
     */
    async function assertOnNothing(pg, who) {
      await pg.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
      await pg.getByText(REFUSED.home, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await onItsWay(pg).count(), 0, `${who}'s Home says their group is on its way`);
      assert.equal(await pg.locator(`a[href="${weekPath(1)}"]`).count(), 0, `${who}'s Home links to week 1`);
      await pg.goto(`${origin}/learn`, { waitUntil: "domcontentloaded" });
      await pg.getByRole("heading", { level: 1, name: "My programmes", exact: true }).waitFor({ timeout: WAIT_MS });
      await pg.getByText(REFUSED.learn, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await onItsWay(pg).count(), 0, `${who}'s My programmes says their group is on its way`);
      assert.equal(await pg.locator(`a[href^="${programmePath}"]`).count(), 0, `${who}'s My programmes links into the run`);
    }

    /**
     * Every door week 1 opens through, tried as somebody it does not open to:
     * the week, Start here and the Glossary send them to My programmes, the
     * week's data is refused, and a tick and a reflection sent as the page
     * sends them are refused in the routes' own words, with nothing written.
     */
    async function assertRefused(pg, person, { sourceId, promptId }) {
      for (const [what, path] of [
        ["week 1", weekPath(1)],
        ["Start here", startHerePath],
        ["the Glossary", glossaryPath],
      ]) {
        await sentTo(pg, path, "/learn", `${person.first}, opening ${what},`);
        await pg.getByText(REFUSED.learn, { exact: true }).waitFor({ timeout: WAIT_MS });
      }
      const overview = await fetchAs(pg, overviewPath);
      assert.equal(overview.status, 403, `week 1's data answered ${person.first} ${overview.status}: ${JSON.stringify(overview.body)}`);
      const tick = await fetchAs(pg, tickPath(sourceId), putJson({ weekId: weekDocId(1), completed: true }));
      assert.deepEqual([tick.status, tick.body?.error], [403, REFUSED.tick], `${person.first}'s tick was not refused in its words`);
      const box = await fetchAs(pg, reflectionPath(promptId), putJson({ weekId: weekDocId(1), text: "Let me in." }));
      assert.deepEqual(
        [box.status, box.body?.error],
        [403, REFUSED.reflection],
        `${person.first}'s reflection was not refused in its words`,
      );
      const rows = await fixtureQuery("courseProgress").where("runId", "==", state.runId).get();
      assert.ok(!rows.docs.some((doc) => doc.data()?.uid === person.uid), `${person.first}'s refused tick was written`);
      const boxes = await fixtureQuery("courseExerciseResponses").where("runId", "==", state.runId).get();
      assert.ok(!boxes.docs.some((doc) => doc.data()?.uid === person.uid), `${person.first}'s refused reflection was written`);
    }

    // ---- Week 1 as the person holding a place reads it ---------------------------

    /** The reflection box of one prompt, by the prompt it is labelled with. */
    const boxOf = (pg, prompt) => pg.getByRole("textbox", { name: prompt, exact: true });

    /**
     * Week 1's page, as somebody holding a place reads it before groups go
     * out (board st-week1-phone): the week's title, the programme over it,
     * the line saying when they hear their group, Start here and the
     * Glossary, This week with the rule alone for when (no group, no day),
     * and nothing a group brings: no rating box on a reading, no progress
     * page, no way to another week.
     */
    async function assertWeekOneBeforeGroups(pg) {
      await pg.getByRole("heading", { level: 1, name: WEEK_ONE.title, exact: true }).waitFor({ timeout: WAIT_MS });
      await pg.getByText(WEEK_PAGE.eyebrow(state.programmeName, ""), { exact: true }).waitFor({ timeout: WAIT_MS });
      await pg.getByRole("status").filter({ hasText: weekOneLine(goOutDay) }).waitFor({ timeout: WAIT_MS });
      assert.equal(
        await pg.getByRole("link", { name: "Start here", exact: true }).getAttribute("href"),
        startHerePath,
        "week 1 does not lead to Start here",
      );
      assert.equal(
        await pg.getByRole("link", { name: "Glossary", exact: true }).getAttribute("href"),
        glossaryPath,
        "week 1 does not lead to the Glossary",
      );
      const thisWeek = pg.getByRole("region", { name: "This week", exact: true });
      await thisWeek.getByText(WEEK_ONE.task, { exact: false }).first().waitFor({ timeout: WAIT_MS });
      await thisWeek.getByText(WEEK_ONE.taskTime, { exact: true }).first().waitFor({ timeout: WAIT_MS });
      await thisWeek.getByText(WEEK_PAGE.dueBefore, { exact: true }).waitFor({ timeout: WAIT_MS });
      await pg.getByText(READERS.boxes, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await pg.getByRole("link", { name: WEEK_PAGE.progress }).count(), 0, "week 1 leads somebody with no group to a progress page");
      assert.equal(await pg.locator(`a[href="${weekPath(2)}"]`).count(), 0, "week 1 leads somebody with no group to week 2");
      return thisWeek;
    }

    // ---- The programme's Settings tab and the allocation board -------------------

    /** The "Course run" panel. */
    const runPanel = () => adminPage.getByRole("region", { name: "Course run" });

    /** One column of the board, by its group's name ("Unallocated" for the pool). */
    const column = (name) => adminPage.getByRole("region", { name, exact: true });
    /** A person's Move to menu, wherever their card is. */
    const moveMenu = (person) =>
      adminPage.getByRole("combobox", { name: `Move ${person.first} to another group`, exact: true });
    /** The Publish area: who a press reaches, the last test and the two buttons. */
    const publishArea = () => adminPage.locator('section[aria-labelledby="allocation-publish-title"]');
    /** Waits for the line over the Publish buttons to say exactly `words`. */
    const publishTitleSays = (words) =>
      adminPage
        .locator("#allocation-publish-title")
        .filter({ hasText: new RegExp(`^${escapeRegExp(words)}$`) })
        .waitFor({ timeout: WAIT_MS });

    /**
     * Moves one person into one group with their card's Move to menu, from the
     * keyboard, and reads the write back (T1's, restated: the menu is a
     * popover that closes when the page scrolls, so Enter opens it on the
     * person's current place, the arrows walk to the group, and Enter moves
     * them; the menu is found through the trigger's `aria-controls`).
     */
    async function moveWithMenu(person, group) {
      const menu = moveMenu(person);
      await menu.scrollIntoViewIfNeeded();
      await adminPage.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await menu.press("Enter");
      const listboxId = await waitFor(`${person.first}'s Move to menu to open`, async () =>
        (await menu.getAttribute("aria-expanded")) === "true" ? menu.getAttribute("aria-controls") : null,
      );
      const options = adminPage.locator(`[id="${listboxId}"]`).getByRole("option");
      await options.first().waitFor({ timeout: WAIT_MS });
      const count = await options.count();
      let from = -1;
      let to = -1;
      for (let i = 0; i < count; i += 1) {
        if ((await options.nth(i).getAttribute("aria-selected")) === "true") from = i;
        if (flat(await options.nth(i).innerText()).startsWith(`${group.name} · `)) to = i;
      }
      assert.ok(from !== -1 && to !== -1, `${person.first}'s menu offers no ${group.name}, or no current place`);
      for (let i = 0; i < Math.abs(to - from); i += 1) await menu.press(to > from ? "ArrowDown" : "ArrowUp");
      const [response] = await Promise.all([responseTo(adminPage, "/allocate", "POST"), menu.press("Enter")]);
      const body = await okBody(response, `Placing ${person.first} in ${group.name}`);
      assert.equal(body.placed, 1, `the board placed ${body.placed} people, not ${person.first} alone: ${JSON.stringify(body)}`);
      await column(group.name).getByRole("combobox", { name: `Move ${person.first} to another group` }).waitFor({
        timeout: WAIT_MS,
      });
    }

    /** Opens the board and waits for it to settle: its columns drawn and its Refresh live again. */
    async function openBoard() {
      await adminPage.goto(boardUrl, { waitUntil: "domcontentloaded" });
      await column("Unallocated").waitFor({ timeout: WAIT_MS });
      await publishArea().waitFor({ timeout: WAIT_MS });
      const refresh = adminPage.getByRole("button", { name: "Refresh", exact: true });
      await waitFor("the board to finish reading the run", async () => ((await refresh.isEnabled()) ? true : null));
    }

    /** Presses Publish, accepts its confirmation, and hands back the confirmation and the answer. */
    async function pressPublish(label) {
      const asked = new Promise((resolve) => {
        adminPage.once("dialog", async (dialog) => {
          const message = dialog.message();
          await dialog.accept();
          resolve(message);
        });
      });
      const answer = await readToast(adminPage, /Published\. What went is on the board\./, async () => {
        const [response] = await Promise.all([
          responseTo(adminPage, "/allocation/publish", "POST"),
          publishArea().getByRole("button", { name: label, exact: true }).click(),
        ]);
        return okBody(response, "Publish");
      });
      return { confirm: await asked, answer };
    }

    // ---- The admin's paste cards ------------------------------------------------

    /**
     * The card a paste box sits in: the nearest enclosing element that also
     * holds its "Read it". Each card's controls are found inside its own.
     */
    const cardOf = (box) => box.locator("xpath=ancestor::div[.//button[normalize-space()='Read it']][1]");

    /** Week 1's things to tick and boxes to write in, by the ids its first save minted. */
    let weekOneItems = null;

    try {
      await step("the admin approves the three accounts that sign in on this journey", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        // Ada reads week 1, Cleo gives her place back, Fern never held one: an
        // account that does not stand opens nothing, so each is approved for
        // the refusals to be about the place. Ben holds a place and never
        // signs in, so he waits, which Publish does not mind.
        for (const account of [ada, cleo, fern]) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          const approved = await waitFor(`${account.first}'s account to say member`, async () => {
            const doc = await readUserDoc(account.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${account.first}'s approval left no approvedAt stamp`);
        }
        assert.equal((await readUserDoc(ben.uid))?.role, "pending", "Ben was approved, and nothing on this journey approves him");
        // Each approval sends one email, a moment after its card leaves the queue.
        for (const account of [ada, cleo, fern]) await mailTo(account.email, 1);
        assert.deepEqual(
          await mailCounts(),
          { [ada.first]: 1, [ben.first]: 0, [cleo.first]: 1, [fern.first]: 1 },
          "approving emailed somebody twice, or nobody",
        );
      });

      await step("the admin names the course run on the programme's Settings tab and moves it on from draft", async () => {
        activePage = adminPage;
        await adminPage.goto(setupUrl, { waitUntil: "domcontentloaded" });
        const panel = runPanel();
        await panel.waitFor({ timeout: WAIT_MS });
        const runBox = panel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [response] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${state.runLabel} · Draft` }),
        ]);
        const body = await okBody(response, "Naming the run");
        assert.equal(body.changed, true, "naming the run changed nothing");
        assert.equal(body.panel?.runId, state.runId, "the panel names another run");
        await panel
          .getByText("That run is still a draft. Move it on from draft first: its members cannot open a draft run.", {
            exact: true,
          })
          .waitFor({ timeout: WAIT_MS });
        const form = (await fixtureDoc("admissionRounds", state.formId).get()).data();
        assert.equal(form?.programmes?.[state.programmeId]?.runId, state.runId, "the form does not name the run");

        await adminPage.goto(runEditorUrl, { waitUntil: "domcontentloaded" });
        const statusBox = adminPage.getByRole("combobox", { name: "Run status", exact: true });
        await statusBox.waitFor({ timeout: WAIT_MS });
        await readToast(adminPage, /Status set to Applications open/, async () => {
          const [moved] = await Promise.all([
            responseTo(adminPage, "/status", "POST"),
            statusBox.selectOption({ label: "Applications open" }),
          ]);
          return okBody(moved, "Moving the run on from draft");
        });
        const run = (await fixtureDoc("courseRuns", state.runId).get()).data();
        assert.equal(run?.status, "applications-open", "the run is still not open");
      });

      await step("the admin sets the day groups go out on the Groups tab's Sessions view", async () => {
        activePage = adminPage;
        await adminPage.goto(sessionsUrl, { waitUntil: "domcontentloaded" });
        const card = adminPage.getByRole("region", { name: "When groups go out", exact: true });
        await card.waitFor({ timeout: WAIT_MS });
        const day = card.getByLabel("Groups go out on", { exact: true });
        // Saved a moment after it changes, with no Save button: the box is
        // read only until the page is live, which `fill` waits out.
        const [response] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/groups-go-out`, "PUT"),
          day.fill(goOutKey),
        ]);
        assert.deepEqual(response.request().postDataJSON(), { on: goOutKey }, "the card sent another day");
        assert.deepEqual(await okBody(response, "Setting the day groups go out"), { ok: true, on: goOutKey }, "the day's answer");
        const run = (await fixtureDoc("courseRuns", state.runId).get()).data();
        assert.equal(run?.groupsGoOutOn, goOutKey, "the run does not hold the day groups go out");
      });

      await step("the admin loads the programme's Start here and Glossary in the run's editor", async () => {
        activePage = adminPage;
        await adminPage.goto(runEditorUrl, { waitUntil: "domcontentloaded" });
        for (const page of [
          {
            doc: "start-here",
            markdown: START_HERE_MARKDOWN,
            none: "This run has no Start here yet.",
            has: "This run has its Start here.",
            saved: "Start here is saved.",
            link: "Open Start here",
            href: startHerePath,
          },
          {
            doc: "glossary",
            markdown: GLOSSARY_MARKDOWN,
            none: "This run has no Glossary yet.",
            has: `This run has its Glossary. ${GLOSSARY.terms.length} terms.`,
            saved: "The Glossary is saved.",
            link: "Open the Glossary",
            href: glossaryPath,
          },
        ]) {
          const box = adminPage.locator(`#guide-markdown-${page.doc}`);
          await box.waitFor({ timeout: WAIT_MS });
          await waitForHydration(adminPage, `#guide-markdown-${page.doc}`);
          const card = cardOf(box);
          await card.getByText(page.none, { exact: false }).waitFor({ timeout: WAIT_MS });
          await box.fill(page.markdown);
          const [read] = await Promise.all([
            responseTo(adminPage, `/guide/${page.doc}`, "POST"),
            card.getByRole("button", { name: "Read it", exact: true }).click(),
          ]);
          const found = await okBody(read, `Reading ${page.doc}`);
          assert.deepEqual([found.problems, found.checks], [[], []], `${page.doc} read with something to fix or check`);
          await card.getByRole("heading", { name: "What we found", exact: true }).waitFor({ timeout: WAIT_MS });
          const [save] = await Promise.all([
            responseTo(adminPage, `/guide/${page.doc}`, "PUT"),
            card.getByRole("button", { name: "Save", exact: true }).click(),
          ]);
          const saved = await okBody(save, `Saving ${page.doc}`);
          assert.deepEqual([saved.saved, saved.message], [true, page.saved], `${page.doc}'s save answered otherwise`);
          await card.getByRole("status").filter({ hasText: page.saved }).waitFor({ timeout: WAIT_MS });
          await card.getByText(page.has, { exact: false }).waitFor({ timeout: WAIT_MS });
          assert.equal(await card.getByRole("link", { name: page.link, exact: true }).getAttribute("href"), page.href);
        }
        const run = (await fixtureDoc("courseRuns", state.runId).get()).data();
        assert.equal(run?.startHere?.sections?.length, START_HERE.sections.length, "the run does not hold Start here's sections");
        assert.equal(run?.glossary?.terms?.length, GLOSSARY.terms.length, "the run does not hold the Glossary's terms");
      });

      await step("the lead pastes week 1 on the Weeks tab, saves it as a draft and previews it as a fellow", async () => {
        activePage = adminPage;
        assert.equal(await storedWeek(1), null, "week 1 already has a page: the first save on the Weeks tab is what makes it");
        assert.equal((await storedWeek(BEFORE_GROUPS.firstPublished))?.published, true, "the term's later weeks are not published");

        await adminPage.goto(weeksUrl, { waitUntil: "domcontentloaded" });
        const weeks = adminPage.getByRole("list", { name: "Weeks, in order", exact: true });
        await weeks.waitFor({ timeout: WAIT_MS });
        assert.equal(await weeks.getByRole("listitem").count(), WEEK_COUNT, "the Weeks tab does not list the run's weeks");
        const first = weeks.getByRole("listitem").first();
        await first.getByText("Week 1", { exact: true }).waitFor({ timeout: WAIT_MS });
        await first.getByText("Empty", { exact: true }).waitFor({ timeout: WAIT_MS });
        await first.getByRole("link").click();
        await adminPage.waitForURL((url) => url.pathname === weekOneTabPath, { timeout: WAIT_MS });

        // A week of the plan with no page: the paste box, and nothing to mark.
        const weekPage = adminPage.locator('section[aria-labelledby="week-page-title"]');
        await weekPage.getByText(WEEKS_TAB.noPage, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await adminPage.getByRole("button", { name: "Mark ready" }).count(), 0, "a week with no page offers Mark ready");

        const box = adminPage.locator(`#week-markdown-${weekDocId(1)}`);
        await box.waitFor({ timeout: WAIT_MS });
        // A box the page controls: typed into before it is live, it would be
        // wiped by the page's first render.
        await waitForHydration(adminPage, `#week-markdown-${weekDocId(1)}`);
        const card = cardOf(box);
        await box.fill(WEEK_ONE_MARKDOWN);
        const [read] = await Promise.all([
          responseTo(adminPage, `/weeks/${weekDocId(1)}/blocks`, "POST"),
          card.getByRole("button", { name: "Read it", exact: true }).click(),
        ]);
        const found = await okBody(read, "Reading week 1");
        assert.deepEqual(
          [found.title, found.problems, found.checks, found.removed, found.answers],
          [WEEK_ONE.title, [], [], [], 0],
          "week 1 read with something to fix or check",
        );
        await card.getByRole("heading", { name: "What we found in week 1", exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await card.getByRole("heading", { name: "Before it can be saved" }).count(), 0, "week 1 cannot be saved");

        const [save] = await Promise.all([
          responseTo(adminPage, `/weeks/${weekDocId(1)}/blocks`, "PUT"),
          card.getByRole("button", { name: "Save draft", exact: true }).click(),
        ]);
        const saved = await okBody(save, "Saving week 1 as a draft");
        assert.deepEqual(
          [saved.saved, saved.kept, saved.removed, saved.answers],
          [true, 0, 0, 0],
          `the first save did not make week 1 from nothing: ${JSON.stringify(saved)}`,
        );
        assert.ok(saved.minted > 0, "the first save minted no ids");
        await card.getByRole("status").filter({ hasText: WEEKS_TAB.saved }).waitFor({ timeout: WAIT_MS });

        // The page read again from what is stored: week 1 has a page now, a
        // draft, and it can be marked ready.
        await weekPage
          .getByRole("heading", { name: `Week 1 · ${WEEK_ONE.title}`, exact: true })
          .waitFor({ timeout: WAIT_MS });
        // An admin reads "Open the run’s week editor" after it, so the sentence
        // is held within its line, not as the whole of it.
        await weekPage.getByText(WEEKS_TAB.notPublished, { exact: false }).waitFor({ timeout: WAIT_MS });
        await adminPage.getByRole("button", { name: "Mark ready", exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await weekPage.getByText(WEEKS_TAB.noPage).count(), 0, "the page still says week 1 has none");
        await first.getByText("Draft", { exact: true }).waitFor({ timeout: WAIT_MS });

        const stored = await storedWeek(1);
        assert.equal(stored?.title, WEEK_ONE.title, "week 1's page is not the week pasted");
        assert.equal(stored?.published, false, "saving a draft published week 1");
        assert.notEqual(stored?.ready, true, "saving a draft marked week 1 ready");
        weekOneItems = itemsOf(stored);
        assert.deepEqual(
          weekOneItems.sources.map((source) => source.title),
          ["A keeper's year", "Hives at dawn"],
          "week 1's sources are not the two pasted",
        );
        assert.equal(weekOneItems.prompts[0]?.text, WEEK_ONE.firstPrompt, "week 1's first reflection prompt is not the one pasted");

        // Preview as a fellow: the member's own week page, nothing that can be pressed.
        await adminPage.getByRole("link", { name: "Preview as a fellow", exact: true }).click();
        await adminPage.waitForURL((url) => url.pathname === `${weekOneTabPath}/preview`, { timeout: WAIT_MS });
        await adminPage.getByText(WEEKS_TAB.preview, { exact: true }).waitFor({ timeout: WAIT_MS });
        await adminPage.getByRole("heading", { level: 1, name: WEEK_ONE.title, exact: true }).waitFor({ timeout: WAIT_MS });
        const tick = adminPage.getByRole("checkbox", { name: `Done: ${WEEK_ONE.ticked}`, exact: true });
        await tick.waitFor({ timeout: WAIT_MS });
        assert.equal(await tick.isDisabled(), true, "the preview's tick can be pressed");
        assert.equal(await tick.isChecked(), false, "the preview shows a tick");
      });

      await step(
        "while week 1 is a draft, a person holding a place reads that their group is on its way, and week 1, Start here and the Glossary stay shut",
        async () => {
          activePage = adaPage;
          await signIn(adaPage, ada);
          await adaPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
          await assertOnItsWay(adaPage, "Home", { weekOneOpen: false });
          await adaPage.goto(`${origin}/learn`, { waitUntil: "domcontentloaded" });
          await assertOnItsWay(adaPage, "My programmes", { weekOneOpen: false });
          // Saved and not ready opens nothing: every page week 1 opens to
          // sends her back, and week 1's data is refused.
          for (const [what, path] of [
            ["week 1", weekPath(1)],
            ["Start here", startHerePath],
            ["the Glossary", glossaryPath],
          ]) {
            await sentTo(adaPage, path, "/learn", `Ada, opening ${what} before it is ready,`);
          }
          const overview = await fetchAs(adaPage, overviewPath);
          assert.equal(overview.status, 403, `week 1's data answered Ada ${overview.status} before week 1 was ready`);
        },
      );

      await step("the lead marks week 1 ready on the Weeks tab, which publishes it", async () => {
        activePage = adminPage;
        await adminPage.goto(`${origin}${weekOneTabPath}`, { waitUntil: "domcontentloaded" });
        // Mark ready has no box of its own to wait on: the paste box beside it
        // is live once the page is, so the press reaches the page's handler.
        await adminPage.locator(`#week-markdown-${weekDocId(1)}`).waitFor({ timeout: WAIT_MS });
        await waitForHydration(adminPage, `#week-markdown-${weekDocId(1)}`);
        const [response] = await Promise.all([
          responseTo(adminPage, `/weeks/${weekDocId(1)}/ready`, "PUT"),
          adminPage.getByRole("button", { name: "Mark ready", exact: true }).click(),
        ]);
        assert.deepEqual(response.request().postDataJSON(), { ready: true }, "the press did not ask for Ready");
        const answer = await okBody(response, "Mark ready");
        assert.deepEqual(
          [answer.week?.weekId, answer.week?.ready, typeof answer.week?.readyAt],
          [weekDocId(1), true, "string"],
          `Mark ready answered ${JSON.stringify(answer)}`,
        );
        const weekPage = adminPage.locator('section[aria-labelledby="week-page-title"]');
        await weekPage.getByText(WEEKS_TAB.ready, { exact: true }).waitFor({ timeout: WAIT_MS });
        await adminPage.getByRole("button", { name: "Not ready", exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await weekPage.getByText(WEEKS_TAB.notPublished).count(), 0, "the page still says week 1 is not published");
        const weeks = adminPage.getByRole("list", { name: "Weeks, in order", exact: true });
        await weeks.getByRole("listitem").first().getByText("Ready", { exact: true }).waitFor({ timeout: WAIT_MS });

        const stored = await storedWeek(1);
        assert.deepEqual([stored?.published, stored?.ready], [true, true], "marking week 1 ready did not publish it and mark it");
        assert.ok(stored?.readyAt, "week 1 has no time it was marked ready");
        assert.ok(
          typeof stored?.readyByUid === "string" && stored.readyByUid !== "" &&
            ![...state.people, fern].some((account) => account.uid === stored.readyByUid),
          "week 1 does not name the admin who marked it ready",
        );
      });

      await step("the person holding a place opens week 1 from Home and from My programmes, before the hand-over", async () => {
        activePage = adaPage;
        // Nobody is on the run's list yet: Ada holds a place on the form alone.
        const listed = await fixtureQuery("courseApplications").where("runId", "==", state.runId).get();
        assert.equal(listed.size, 0, "somebody was handed over before week 1 opened");

        await adaPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        await assertOnItsWay(adaPage, "Home", { weekOneOpen: true });
        await adaPage.goto(`${origin}/learn`, { waitUntil: "domcontentloaded" });
        const card = await assertOnItsWay(adaPage, "My programmes", { weekOneOpen: true });
        await card.getByRole("link", { name: CARD.weekOne, exact: true }).click();
        await adaPage.waitForURL((url) => url.pathname === weekPath(1), { timeout: WAIT_MS });
        const thisWeek = await assertWeekOneBeforeGroups(adaPage);
        await thisWeek.getByText("0 of 1 done", { exact: true }).waitFor({ timeout: WAIT_MS });
        // Her own box to write in, and her own sources to tick.
        await boxOf(adaPage, WEEK_ONE.firstPrompt).waitFor({ timeout: WAIT_MS });
        const tick = adaPage.getByRole("checkbox", { name: `Done: ${WEEK_ONE.ticked}`, exact: true });
        assert.equal(await tick.isEnabled(), true, "Ada cannot tick week 1's sources");
      });

      await step("Start here and the Glossary open from week 1, and the Glossary's find box filters its terms", async () => {
        activePage = adaPage;
        await adaPage.goto(`${origin}${weekPath(1)}`, { waitUntil: "domcontentloaded" });
        await adaPage.getByRole("link", { name: "Start here", exact: true }).click();
        await adaPage.waitForURL((url) => url.pathname === startHerePath, { timeout: WAIT_MS });
        await adaPage.getByRole("heading", { level: 1, name: "Start here", exact: true }).waitFor({ timeout: WAIT_MS });
        await adaPage.getByText(CARD.eyebrow(state.programmeName), { exact: true }).waitFor({ timeout: WAIT_MS });
        // The way back is week 1, the one page of the run open to her.
        const crumbs = adaPage.getByRole("navigation", { name: "Breadcrumb" });
        assert.equal(
          await crumbs.getByRole("link", { name: state.programmeName, exact: true }).getAttribute("href"),
          weekPath(1),
          "Start here's way back is not week 1",
        );
        await adaPage.getByText(START_HERE.opening, { exact: true }).waitFor({ timeout: WAIT_MS });
        for (const heading of START_HERE.sections) {
          await adaPage.getByRole("region", { name: heading, exact: true }).waitFor({ timeout: WAIT_MS });
        }
        // Who reads reflections, in a box straight under the guide's
        // "Reflections." paragraph, named from records.
        const said = await textOf(adaPage.getByRole("region", { name: "A week, step by step", exact: true }));
        const reflectionsAt = said.indexOf("Jot a few lines for each as you go.");
        const boxAt = said.indexOf(READERS.onThisSite);
        assert.ok(
          reflectionsAt !== -1 && boxAt > reflectionsAt,
          `Start here does not say who reads reflections under its Reflections paragraph: ${said}`,
        );
        await adaPage.getByText(START_HERE.credit, { exact: true }).waitFor({ timeout: WAIT_MS });

        await crumbs.getByRole("link", { name: state.programmeName, exact: true }).click();
        await adaPage.waitForURL((url) => url.pathname === weekPath(1), { timeout: WAIT_MS });
        await adaPage.getByRole("link", { name: "Glossary", exact: true }).click();
        await adaPage.waitForURL((url) => url.pathname === glossaryPath, { timeout: WAIT_MS });
        await adaPage.getByRole("heading", { level: 1, name: "Glossary", exact: true }).waitFor({ timeout: WAIT_MS });
        await adaPage.getByText(GLOSSARY.opening, { exact: true }).waitFor({ timeout: WAIT_MS });
        const terms = adaPage.locator("dl dt");
        const termsShown = async () => {
          const names = [];
          for (let i = 0; i < (await terms.count()); i += 1) names.push(await textOf(terms.nth(i)));
          return names;
        };
        await adaPage.getByText(GUIDE.count(null, GLOSSARY.terms.length), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.deepEqual(await termsShown(), GLOSSARY.terms, "the Glossary's terms are not the guide's, in its order");
        await adaPage.getByText(GUIDE.foot, { exact: true }).waitFor({ timeout: WAIT_MS });

        // The find box: a word that is in two definitions and no term, a word
        // that is in nothing, then nothing at all.
        const find = adaPage.getByLabel(GUIDE.findLabel, { exact: true });
        await waitForHydration(adaPage, "#glossary-find");
        await find.fill(GLOSSARY.find);
        await adaPage.getByText(GUIDE.count(GLOSSARY.found.length, GLOSSARY.terms.length), { exact: true }).waitFor({
          timeout: WAIT_MS,
        });
        assert.deepEqual(await termsShown(), GLOSSARY.found, `the find box kept the wrong terms for ${GLOSSARY.find}`);
        await find.fill(GLOSSARY.nothing);
        await adaPage.getByRole("status").filter({ hasText: GUIDE.noMatch(GLOSSARY.nothing) }).waitFor({ timeout: WAIT_MS });
        assert.equal(await terms.count(), 0, "the find box kept a term for a word no term holds");
        await find.fill("");
        await adaPage.getByText(GUIDE.count(null, GLOSSARY.terms.length), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.deepEqual(await termsShown(), GLOSSARY.terms, "an empty find box does not show every term again");
        assert.equal(
          await adaPage.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link").getAttribute("href"),
          weekPath(1),
          "the Glossary's way back is not week 1",
        );
      });

      await step(
        "a tick and a reflection save on week 1, and are there after a reload, under the lines that say who sees them",
        async () => {
          activePage = adaPage;
          const source = weekOneItems.sources.find((item) => item.title === WEEK_ONE.ticked);
          const prompt = weekOneItems.prompts[0];
          await adaPage.goto(`${origin}${weekPath(1)}`, { waitUntil: "domcontentloaded" });
          const tick = adaPage.getByRole("checkbox", { name: `Done: ${source.title}`, exact: true });
          await tick.waitFor({ timeout: WAIT_MS });
          assert.equal(await tick.isChecked(), false, "a source is ticked before Ada ticked it");
          await adaPage.getByText(READERS.ticks, { exact: true }).waitFor({ timeout: WAIT_MS });

          // The tick goes through the tick route, which asks week 1's door: her own row, written by the server.
          const [ticked] = await Promise.all([responseTo(adaPage, tickPath(source.id), "PUT"), tick.check()]);
          assert.deepEqual(ticked.request().postDataJSON(), { weekId: weekDocId(1), completed: true }, "the tick sent something else");
          assert.deepEqual(
            await okBody(ticked, "Ada's tick"),
            { ok: true, itemId: source.id, completed: true },
            "the tick's answer",
          );
          await waitFor("the tick to hold once its row is back", async () => tick.isChecked());
          // Rating a reading is for the group's facilitators to read: not
          // before there is a group.
          assert.equal(await adaPage.getByRole("button", { name: WEEK_PAGE.rateIt }).count(), 0, "a rating box is offered before groups go out");

          // The box saves as she types, and at once when she leaves it.
          const box = boxOf(adaPage, prompt.text);
          const wrote = responseTo(adaPage, reflectionPath(prompt.id), "PUT");
          await box.fill(ADA_WROTE);
          await box.press("Tab");
          const written = await wrote;
          assert.deepEqual(written.request().postDataJSON(), { weekId: weekDocId(1), text: ADA_WROTE }, "the box sent something else");
          assert.equal((await okBody(written, "Ada's reflection")).response?.text, ADA_WROTE, "the box's answer");
          const promptCard = box.locator("xpath=..");
          await promptCard.getByText("Saved", { exact: true }).waitFor({ timeout: WAIT_MS });

          // Who reads what she writes, under the page's first stop.
          const firstStop = adaPage.getByRole("region", { name: "Reflect", exact: true }).first();
          await firstStop.getByText(READERS.reflections, { exact: true }).waitFor({ timeout: WAIT_MS });
          await firstStop.getByText(READERS.readOut, { exact: true }).waitFor({ timeout: WAIT_MS });

          // Both are hers, and stored.
          const row = (await fixtureDoc("courseProgress", `${state.runId}__${ada.uid}__${source.id}`).get()).data();
          assert.deepEqual(
            [row?.uid, row?.runId, row?.weekNumber, row?.itemKind, row?.completed],
            [ada.uid, state.runId, 1, "material", true],
            "Ada's tick is not her own row for the source on week 1",
          );
          const boxes = (await fixtureQuery("courseExerciseResponses").where("runId", "==", state.runId).get()).docs.map((doc) =>
            doc.data(),
          );
          assert.deepEqual(
            boxes.map((entry) => [entry.uid, entry.kind, entry.weekId, entry.exerciseId, entry.text]),
            [[ada.uid, "reflection", weekDocId(1), prompt.id, ADA_WROTE]],
            "the run holds other reflections than Ada's one",
          );

          // A reload reads both back.
          await adaPage.reload({ waitUntil: "domcontentloaded" });
          await boxOf(adaPage, prompt.text).waitFor({ timeout: WAIT_MS });
          await waitFor("the reloaded box to hold what Ada wrote", async () => (await boxOf(adaPage, prompt.text).inputValue()) === ADA_WROTE);
          await boxOf(adaPage, prompt.text).locator("xpath=..").getByText("Saved", { exact: true }).waitFor({ timeout: WAIT_MS });
          await waitFor("the reloaded tick to hold", async () =>
            adaPage.getByRole("checkbox", { name: `Done: ${source.title}`, exact: true }).isChecked(),
          );
          // One source of two and one box of six: the task is not done yet.
          await adaPage
            .getByRole("region", { name: "This week", exact: true })
            .getByText("0 of 1 done", { exact: true })
            .waitFor({ timeout: WAIT_MS });
        },
      );

      await step("week 2, the programme's page and the groups stay shut to the person holding a place", async () => {
        activePage = adaPage;
        // Week 2 is published: it is the door, not a missing page, that keeps it shut.
        assert.equal((await storedWeek(2))?.published, true, "week 2 is not published");
        await sentTo(adaPage, weekPath(2), weekPath(1), "Ada, opening week 2,");
        await adaPage.getByRole("heading", { level: 1, name: WEEK_ONE.title, exact: true }).waitFor({ timeout: WAIT_MS });
        await sentTo(adaPage, programmePath, "/learn", "Ada, opening the programme's page,");
        for (const group of state.groups) {
          await sentTo(adaPage, `${programmePath}/group/${enc(group.id)}`, "/learn", `Ada, opening ${group.name}'s page,`);
        }

        // Week 1's data is week 1 alone: no group, no session, no other week.
        const overview = await fetchAs(adaPage, overviewPath);
        assert.equal(overview.status, 200, `week 1's data answered Ada ${overview.status}`);
        const data = overview.body;
        assert.deepEqual(
          (data.weeks ?? []).map((week) => week.weekNumber),
          [1],
          "week 1's data hands somebody holding a place another week",
        );
        assert.deepEqual(
          [data.group, data.groups, data.weekSchedule, data.enrolment, data.currentWeek],
          [null, [], [], null, null],
          "week 1's data hands somebody holding a place a group, a session or a seat",
        );
        assert.equal(data.beforeGroups?.line, weekOneLine(goOutDay), "week 1's data does not carry its line");
        assert.ok(!JSON.stringify(data).includes(groupA.meetingUrl), "week 1's data carries a group's meeting link");
      });

      await step("somebody who gives their place back loses week 1, and is refused it in the page's words", async () => {
        activePage = cleoPage;
        await signIn(cleoPage, cleo);
        // Holding a place, Cleo is offered week 1 like anybody holding one.
        await cleoPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        await assertOnItsWay(cleoPage, "Cleo's Home", { weekOneOpen: true });

        await cleoPage.goto(applicationUrl, { waitUntil: "domcontentloaded" });
        const cant = cleoPage.getByRole("button", { name: REPLY.cantMakeIt, exact: true });
        await cant.waitFor({ timeout: WAIT_MS });
        await waitFor("I can’t make it to be live once the page has hydrated", async () => cant.isEnabled());
        await cant.click();
        const asking = cleoPage.getByRole("group", { name: REPLY.question, exact: true });
        await asking.waitFor({ timeout: WAIT_MS });
        // The row a person presses: the radio itself is a pixel under it, for the keyboard.
        await asking.locator("label").filter({ hasText: new RegExp(`^${escapeRegExp(REPLY.reason)}$`) }).click();
        assert.equal(await asking.getByRole("radio", { name: REPLY.reason, exact: true }).isChecked(), true, "the reason is not chosen");
        const [response] = await Promise.all([
          responseTo(cleoPage, `/admissions/forms/${state.formId}/application/reply`, "POST"),
          asking.getByRole("button", { name: REPLY.yes, exact: true }).click(),
        ]);
        // A reason other than "Other" carries no words of its own
        // (`parseReleaseReason`, src/lib/applications/status/reasons.ts).
        assert.deepEqual(
          response.request().postDataJSON(),
          { reply: "cant-make-it", reason: { kind: "too-much-on", other: "" } },
          "the press did not send the reply and the reason Cleo chose",
        );
        const answer = await okBody(response, "I can’t make it");
        assert.deepEqual([answer.ok, answer.changed], [true, true], "the reply's answer");
        await cleoPage.getByRole("heading", { name: REPLY.givenBack, exact: true }).waitFor({ timeout: WAIT_MS });
        await cleoPage.getByText(REPLY.chip, { exact: true }).waitFor({ timeout: WAIT_MS });
        const application = (await fixtureDoc("admissionApplications", `${state.formId}__${cleo.uid}`).get()).data();
        assert.deepEqual(
          [application?.status, application?.attendance?.answer],
          ["withdrawn", "cant-make-it"],
          "Cleo's application does not say she gave her place back",
        );

        // The place has gone, and week 1 with it: Home and My programmes say
        // she is on nothing, and every door says no.
        await assertOnNothing(cleoPage, "Cleo");
        await assertRefused(cleoPage, cleo, { sourceId: weekOneItems.sources[0].id, promptId: weekOneItems.prompts[0].id });
      });

      await step("somebody who never held a place is refused week 1 in the page's words", async () => {
        activePage = fernPage;
        await signIn(fernPage, fern);
        await assertOnNothing(fernPage, "Fern");
        await assertRefused(fernPage, fern, { sourceId: weekOneItems.sources[0].id, promptId: weekOneItems.prompts[0].id });
      });

      await step("the admin hands the people still holding a place over and places each in a group", async () => {
        activePage = adminPage;
        await adminPage.goto(setupUrl, { waitUntil: "domcontentloaded" });
        const panel = runPanel();
        await panel
          .getByText(`${holding.length} people hold a place on ${state.programmeName}. None of them is on the run’s list yet.`, {
            exact: true,
          })
          .waitFor({ timeout: WAIT_MS });
        for (const person of holding) {
          await panel.getByRole("link", { name: person.displayName, exact: true }).waitFor({ timeout: WAIT_MS });
        }
        assert.equal(await panel.getByRole("link", { name: cleo.displayName }).count(), 0, "the panel still names Cleo, who gave her place back");
        const [response] = await Promise.all([
          responseTo(adminPage, "/run/hand-over", "POST"),
          panel.getByRole("button", { name: `Hand over ${holding.length} people`, exact: true }).click(),
        ]);
        const body = await okBody(response, "Hand over");
        assert.deepEqual(body.receipt, { handedOver: holding.length, alreadyThere: 0 }, "the hand-over's receipt");
        await panel.getByRole("status").filter({ hasText: `${holding.length} people handed over.` }).waitFor({ timeout: WAIT_MS });

        await openBoard();
        for (const person of holding) {
          await column("Unallocated").getByRole("combobox", { name: `Move ${person.first} to another group` }).waitFor({
            timeout: WAIT_MS,
          });
        }
        assert.equal(await moveMenu(cleo).count(), 0, "the board offers Cleo a group");
        for (const person of holding) await moveWithMenu(person, placeOf[person.key]);
        await adminPage
          .getByText(`All ${holding.length} accepted applicants are placed. No one is in two groups.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        await publishTitleSays(`${holding.length} people`);
        await publishArea().getByText("Send yourself a test before you publish.", { exact: true }).waitFor({ timeout: WAIT_MS });
        for (const person of holding) {
          const seat = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).get()).data();
          assert.deepEqual(
            [seat?.groupId, seat?.status, seat?.allocatedEmailAt ?? null],
            [placeOf[person.key].id, "active", null],
            `${person.first} is not placed where the board put them, untold`,
          );
        }

        // Placed and not told: Ada still reads week 1 through its door, and no group.
        activePage = adaPage;
        await adaPage.goto(`${origin}${weekPath(1)}`, { waitUntil: "domcontentloaded" });
        await assertWeekOneBeforeGroups(adaPage);
      });

      await step("Publish, after its test to the admin, tells each person placed their group", async () => {
        activePage = adminPage;
        await openBoard();
        await publishTitleSays(`${holding.length} people`);
        assert.deepEqual(await adminTests(), [], "a test of this run's emails was already in the admin's mailbox");
        const [response] = await Promise.all([
          responseTo(adminPage, "/allocation/publish/test", "POST"),
          publishArea().getByRole("button", { name: "Send a test to me", exact: true }).click(),
        ]);
        const body = await okBody(response, "Send a test to me");
        // No facilitator is appointed: the first person's email is the whole test.
        assert.deepEqual(
          { delivery: body.delivery, emails: body.emails, recorded: body.recorded },
          { delivery: "sent", emails: 1, recorded: true },
          "the test was not the first person's email, sent and recorded",
        );
        await publishArea().getByText(/^Test sent to you at \d{1,2}(:\d{2})?(am|pm)\.$/).waitFor({ timeout: WAIT_MS });
        const label = `Publish and send ${holding.length} emails`;
        const publish = publishArea().getByRole("button", { name: label, exact: true });
        await waitFor("Publish to unlock once a test has reached the admin", async () => ((await publish.isEnabled()) ? true : null));
        const tests = await waitFor(
          "the test in the admin's mailbox",
          async () => {
            const found = await adminTests();
            return found.length >= 1 ? found : null;
          },
          { timeout: MAIL_WAIT_MS },
        );
        assert.equal(tests.length, 1, `the test sent ${tests.length} emails`);
        assert.ok(tests[0].subject.startsWith(`[TEST] Your ${state.programmeName} group: `), `the test is not a placement email: ${tests[0].subject}`);
        assertNoMeetingLink(tests[0], "The test");

        const { confirm, answer } = await pressPublish(label);
        assert.equal(
          confirm,
          `Publish ${state.runLabel} and send ${holding.length} emails?\n\n` +
            `${holding.length} emails to people placed in a group, with their group, day, room and facilitators.\n\n` +
            "Emails cannot be unsent.",
          "the confirmation is not the one the boards draw",
        );
        assert.deepEqual(
          answer.report,
          {
            people: { sent: holding.length, held: 0, suppressed: 0 },
            facilitators: { sent: 0, held: 0, suppressed: 0 },
            failed: [],
            noAddress: [],
            alreadyTold: 0,
            more: 0,
          },
          "the press did not send exactly what its button said",
        );
        await publishArea()
          .getByText(`Published. ${holding.length} emails sent: ${holding.length} to people with their group.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });

        for (const person of holding) {
          // Ada was approved first, so her placement is her second email.
          const approvals = person.key === ada.key ? 1 : 0;
          const mail = await mailTo(person.email, approvals + 1);
          assert.equal(mail.length, approvals + 1, `${person.first} has ${mail.length} emails`);
          const email = await readEmail(mail[mail.length - 1]);
          assert.equal(
            email.subject,
            `Your ${state.programmeName} group: ${weeklySlotWords(placeOf[person.key])}`,
            `${person.first}'s placement email is not about their group`,
          );
          assertNoMeetingLink(email, `${person.first}'s placement email`);
          const seat = (await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).get()).data();
          assert.ok(seat?.allocatedEmailAt, `${person.first} is not stamped as told`);
        }
        const run = (await fixtureDoc("courseRuns", state.runId).get()).data();
        assert.ok(run?.allocationPublishedAt, "the run does not say it was published");
      });

      await step("once Publish has told them, week 1 gives their group's due day, with their tick and reflection kept", async () => {
        activePage = adaPage;
        const source = weekOneItems.sources.find((item) => item.title === WEEK_ONE.ticked);
        const prompt = weekOneItems.prompts[0];
        await adaPage.goto(`${origin}${weekPath(1)}`, { waitUntil: "domcontentloaded" });
        await adaPage.getByRole("heading", { level: 1, name: WEEK_ONE.title, exact: true }).waitFor({ timeout: WAIT_MS });
        // The week's seven days, on her group's calendar, and when the work is
        // due: before her group's first session, on its day.
        await adaPage
          .getByText(WEEK_PAGE.eyebrow(state.programmeName, weekSpanLabel(state.startDate)), { exact: true })
          .waitFor({ timeout: WAIT_MS });
        const thisWeek = adaPage.getByRole("region", { name: "This week", exact: true });
        await thisWeek.getByText(WEEK_PAGE.dueOn(dayLabel(groupA.firstDateKey)), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await thisWeek.getByText(WEEK_PAGE.dueBefore, { exact: true }).count(), 0, "week 1 still gives no day");
        assert.equal(
          await adaPage.getByRole("status").filter({ hasText: "Week 1 is open now." }).count(),
          0,
          "week 1 still says Ada will hear her group",
        );
        // What she did before her group was told is still hers.
        await waitFor("Ada's tick to be there", async () =>
          adaPage.getByRole("checkbox", { name: `Done: ${source.title}`, exact: true }).isChecked(),
        );
        await waitFor("Ada's reflection to be there", async () => (await boxOf(adaPage, prompt.text).inputValue()) === ADA_WROTE);
        // And what a group brings: the reading's box for Ada's facilitators,
        // the progress page, and the way on to week 2, which is published and
        // so open to read before the group's first session (every published
        // week is).
        await adaPage.getByRole("button", { name: WEEK_PAGE.rateIt }).first().waitFor({ timeout: WAIT_MS });
        await adaPage.getByRole("link", { name: WEEK_PAGE.progress, exact: true }).waitFor({ timeout: WAIT_MS });
        const weekTwo = adaPage.getByRole("link", { name: WEEK_PAGE.weekTwo, exact: true }).first();
        await weekTwo.waitFor({ timeout: WAIT_MS });
        assert.equal(await weekTwo.getAttribute("href"), weekPath(2), "week 1's way on does not lead to week 2");

        const overview = await fetchAs(adaPage, overviewPath);
        assert.equal(overview.status, 200, `the run's data answered Ada ${overview.status}`);
        assert.deepEqual(
          [overview.body.beforeGroups, overview.body.enrolment?.groupId, overview.body.group?.id],
          [null, groupA.id, groupA.id],
          "the run's data does not hand Ada her group once Publish has told her",
        );
        // Home names her group's next session now, and no longer says her
        // group is on its way. The ticket is drawn once Home has read her
        // runs, which is when the card would be too.
        await adaPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        const homeTicket = adaPage.getByRole("region", { name: "Your next session", exact: true });
        await homeTicket.waitFor({ timeout: WAIT_MS });
        const homeWhen = await textOf(homeTicket.getByRole("heading", { level: 2 }));
        assert.ok(homeWhen.startsWith(`${groupA.name}, `), `Home's ticket does not name Ada's group: ${homeWhen}`);
        assert.equal(await onItsWay(adaPage).count(), 0, "Home still says Ada's group is on its way");
      });

      await step("every email the journey caused went to the send log, and none carries the meeting link", async () => {
        activePage = adminPage;
        // Who was written to, by kind: the three approvals and the two
        // placements. Giving a place back emails nobody.
        const expected = [
          [ada, ["application", "course-application"]],
          [ben, ["course-application"]],
          [cleo, ["application"]],
          [fern, ["application"]],
        ];
        for (const [account, kinds] of expected) {
          const logged = await waitFor(`${account.first}'s send rows`, async () => {
            const rows = await sendKindsTo(account.email);
            return rows.length >= kinds.length ? rows : null;
          });
          assert.deepEqual(logged, [...kinds].sort(), `${account.first}'s send rows`);
        }
        const about = (await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get()).docs.map((doc) =>
          doc.data(),
        );
        assert.equal(about.filter((row) => row.kind === "course-test").length, 1, "the run's test is not logged once");
        assert.equal(
          about.filter((row) => row.kind === "course-application").length,
          holding.length,
          "Publish's emails are not all logged against the run",
        );

        const everything = [...(await adminTests())];
        for (const account of [...state.people, fern]) {
          for (const summary of await messagesTo(account.email)) everything.push(await readEmail(summary));
        }
        assert.equal(everything.length, 1 + 3 + holding.length, `the journey caused ${everything.length} emails`);
        for (const email of everything) assertNoMeetingLink(email, JSON.stringify(email.subject));
      });
    } finally {
      await Promise.allSettled([fernContext.close(), cleoContext.close(), adaContext.close(), context.close()]);
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
