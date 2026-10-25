/**
 * An incubator's pitching week and its teams, end to end, in a real browser:
 * the course hub's fourth spec.
 *
 * The term T1 to T3 stand on, at its fourth point: an incubator three weeks
 * in, in its pitching week (scripts/e2e-fixtures/worlds/course-hub-term.mjs,
 * point "pitching-week") -> the admin approves the five people taking part
 * -> names the incubator's running run on the programme's Settings tab ->
 * Ada opens pitching week and pitches alone, on one of the week's readings ->
 * Ben pitches with Cleo, on a paper he types in, and picks Ada's pitch -> Dan
 * pitches alone and picks both other pitches, the limit -> Ada picks Dan's,
 * and the pitching read answers what the pages drew, and refuses the lead ->
 * Eve, who did not pitch, picks two and is refused a third in the page's
 * words -> the lead's Pitches view counts who would join each, naming nobody
 * who picked -> on the Teams tab the lead makes teams from two pitches -> moves
 * Eve, left over, into one with the Move to… menu -> sends the team email's
 * test to themselves -> tells everyone their team with the count on the
 * button -> each person's email names their own team, word for word, and no
 * email carries the meeting link.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-incubator-pitching-and-teams
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: the test of the team
 * email goes to the admin's own address, and each person's email is read word
 * for word out of their mailbox.
 *
 * ## Every expected word comes from the seed's clock and the world's plan
 *
 * Dates, times, counts and names are worked out here from the state file and
 * the world's plan (`PITCHING_WEEK`), by the rules of the screens restated
 * beside each check, never written as a calendar date. Who goes into a team
 * made from a pitch is worked out by the rule the teams route keeps, restated,
 * from the picks this spec makes.
 *
 * ## Six identities, five browser contexts
 *
 * The admin (the programme's lead here: nobody is named lead), and Ada, Ben,
 * Dan and Eve, each in their own context; Eve's has a second page, the same
 * person with pitching week open twice. Cleo pitches as Ben's partner and is
 * read only through her mailbox. CHROMIUM ONLY: a green run is a regression
 * net, never a substitute for the manual Safari pass.
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
import { getMessage, messagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  fixtureDoc,
  fixtureQuery,
  mailIsCaught,
  markerPath,
  readState,
  stateDir,
  statePath,
} from "../../scripts/e2e-fixtures/core.mjs";
import {
  RECAPTCHA_DEPENDENT_STEPS,
  SPEC,
} from "../../scripts/e2e-fixtures/course-hub-incubator-pitching-and-teams.mjs";
import {
  clockWords,
  dayLabel,
  londonDateKey,
  namesInWords,
  sessionOf,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/**
 * What each pitch says, typed into the form as a person would. A paper is one
 * of pitching week's readings (by its place in the world's list) or typed in.
 */
const PITCH = Object.freeze({
  probe: Object.freeze({
    key: "probe",
    title: "Probe transfer",
    reading: 0,
    twist: "Test whether the probes still work on a smaller open model.",
  }),
  reward: Object.freeze({
    key: "reward",
    title: "Reward hacking evals",
    typed: "Reward hacking in the wild",
    twist: "Rebuild the evaluation with tasks the team writes.",
  }),
  chess: Object.freeze({
    key: "chess",
    title: "Chess model features",
    reading: 1,
    twist: "Check whether a smaller chess model learns the same board features.",
  }),
});

/** A twist may run to this many characters: `PITCH_LIMITS.twist` in src/lib/courses/pitching/model.ts. */
const TWIST_LIMIT = 280;

/** The partner menu's first choice: `PitchForm` in src/features/courses/pitching/PitchingWeek.tsx. */
const PITCHING_ALONE = "No partner, I’m pitching alone";

/** Every email's last line (`EmailChrome`). */
const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";

/** Where a reply to the team email goes (`TEAMS_REPLY_TO` in src/lib/applications/handover/teamsTell.ts). */
const REPLY_TO = "ai-safety@uonsu.com";

/** The pitching read's refusal for anybody not taking part: `NOT_IN_A_GROUP` in src/lib/courses/pitching/load.ts. */
const NOT_TAKING_PART = "Pitching week is for the people in this programme’s groups.";

/** The keys of one row of a person's pitches, and nothing about anybody else's picks: `PitchRow`. */
const PITCH_ROW_KEYS = ["id", "picked", "pitchedBy", "title", "twist", "yours"];

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
        ? "This journey reads its own mail, the test of the team email to the admin included, so it " +
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
    replyTo: (message.ReplyTo ?? []).map((entry) => String(entry.Address ?? "").toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// The teams' own words and rules, restated
// ---------------------------------------------------------------------------

/**
 * A twist as the second half of a sentence: `asSentenceTail` in
 * src/lib/courses/teams/words.ts, restated. The first letter is lowered when
 * the first word is an ordinary capitalised word, and left alone when that
 * would change a name.
 */
function asSentenceTail(text) {
  const trimmed = text.trim();
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  const first = firstWord.charAt(0);
  const rest = firstWord.slice(1);
  const ordinary =
    first !== "" &&
    first === first.toUpperCase() &&
    first !== first.toLowerCase() &&
    rest.length > 0 &&
    rest === rest.toLowerCase() &&
    /^[a-z’']*$/.test(rest) &&
    !/^I[’']/.test(firstWord);
  return ordinary ? `${first.toLowerCase()}${trimmed.slice(1)}` : trimmed;
}

/** "Replicate [the paper], then: [the twist]": `teamProjectLine`, restated. */
const projectLineOf = (paperTitle, twist) => `Replicate ${paperTitle}, then: ${asSentenceTail(twist)}`;

/** A sentence's last mark, added when the text has none: `stop` in the same file. */
const withStop = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** "1 person", "3 people": `peopleWords`. */
const peopleWords = (count) => `${count} ${count === 1 ? "person" : "people"}`;

// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: an incubator's pitching week, the pitches its people would join, and the teams its lead makes and tells",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const pitching = state.pitching;
    assert.ok(pitching, "the world's fourth point carries no pitching week");
    assert.equal(state.programmeKind, "incubator", "the form's programme is not an incubator");
    assert.equal(state.groups.length, 1, "an incubator's run meets as one weekly group");
    const [group] = state.groups;
    assert.ok(group.meetingUrl, "the group has no meeting link, so 'never in an email' would prove nothing");
    assert.equal(state.facilitator, null, "somebody facilitates the incubator, and nothing on this journey appoints anybody");

    const byKey = (key) => {
      const person = state.people.find((each) => each.key === key);
      assert.ok(person, `the world has nobody called ${key}`);
      return person;
    };
    const [ada, ben, cleo, dan, eve] = ["ada", "ben", "cleo", "dan", "eve"].map(byKey);
    assert.deepEqual(
      state.people.map((person) => person.key),
      ["ada", "ben", "cleo", "dan", "eve"],
      "the incubator's five are not the five this journey is written for",
    );

    // ---- The week, by the run's own calendar ----------------------------------

    const elapsedDays = Math.round(
      (Date.parse(`${londonDateKey(new Date())}T00:00:00Z`) - Date.parse(`${state.startDate}T00:00:00Z`)) / 86_400_000,
    );
    const thisWeek = Math.floor(elapsedDays / 7) + 1;
    assert.equal(thisWeek, pitching.weekNumber, `the term is in week ${thisWeek}, not its pitching week`);
    /** The group's session in pitching week, which closes it. */
    const closing = sessionOf(group, pitching.weekNumber);
    assert.ok(closing.startsAt.getTime() > Date.now(), "the group's pitching session has started: pitching is closed");
    const clock = clockWords(group.startTimeLocal);

    /**
     * "the session on Fri 13 Nov at 5pm", or tonight's or today's on its day:
     * `sessionWords` in src/lib/courses/pitching/words.ts, restated.
     */
    const sessionWords = () => {
      if (londonDateKey(new Date()) === closing.dateKey) {
        return `${Number(group.startTimeLocal.slice(0, 2)) >= 17 ? "tonight’s" : "today’s"} session at ${clock}`;
      }
      return `the session on ${dayLabel(closing.dateKey)} at ${clock}`;
    };
    /** The line under "Pitching week" while it is open: `ledeWords`, restated. */
    const ledeOf = (pitchCount) =>
      `${pitchCount > 0 ? "Pitches are in." : "No pitches yet."} Pick up to ${pitching.pickLimit} you’d join before ${sessionWords()}.`;
    /** "Edit until 5pm on Fri 13 Nov", or "Edit until 5pm" on its day: `editUntilWords`. */
    const editUntil = () =>
      londonDateKey(new Date()) === closing.dateKey ? `Edit until ${clock}` : `Edit until ${clock} on ${dayLabel(closing.dateKey)}`;
    /** `eyebrowWords`: the programme names the run once the admin has named it. */
    const eyebrow = `Incubator: ${state.programmeName} · Week ${pitching.weekNumber}`;
    /** `teamsWords` for a programme with no lead: nobody is named lead on this journey. */
    const teamsMadeOnDay = dayLabel(pitching.teamsMadeOn);
    const teamsLine =
      `The teams are made on ${teamsMadeOnDay}. Teams are ${pitching.teamSize.min} to ${pitching.teamSize.max} people.`;
    /** "2 of 2 picked": `pickedWords`. */
    const pickedLine = (count) => `${count} of ${pitching.pickLimit} picked`;
    /** "You can change them until Fri 20 Nov.": `changeUntilWords`, while the day has not passed. */
    const changeUntil = () =>
      londonDateKey(new Date()) <= pitching.teamsMadeOn ? ` You can change them until ${teamsMadeOnDay}.` : "";
    const paperOf = (pitch) => (pitch.typed ? pitch.typed : pitching.readings[pitch.reading].title);

    // ---- What has happened, as the spec makes it happen -----------------------

    /** The pitches sent, in the order they came in: `{ ...PITCH[x], pitchers, id }`. */
    const sent = [];
    /** Each person's picks, by pitch key. */
    const picks = new Map(state.people.map((person) => [person.key, new Set()]));
    const pitchOf = (key) => sent.find((pitch) => pitch.key === key);

    /** "Pitched by Ben and Cleo", and "Pitched by you", "Pitched by you and Cleo" on a person's own: `pitchedByWords`. */
    const pitchedBy = (pitch, viewer = null) => {
      if (viewer && pitch.pitchers.includes(viewer)) {
        const partner = pitch.pitchers.find((person) => person !== viewer);
        return partner ? `Pitched by you and ${partner.first}` : "Pitched by you";
      }
      return `Pitched by ${namesInWords(pitch.pitchers.map((person) => person.first))}`;
    };

    /** One person's list of pitches, as their page draws it: [title, pitched by, twist, mark]. */
    const rowsFor = (viewer) =>
      sent.map((pitch) => [
        pitch.title,
        pitchedBy(pitch, viewer),
        pitch.twist,
        pitch.pitchers.includes(viewer) ? "yours" : picks.get(viewer.key).has(pitch.key) ? "picked" : "",
      ]);
    const pickedBy = (viewer) => sent.filter((pitch) => picks.get(viewer.key).has(pitch.key)).length;

    /** How many would join each pitch, and the lead's order: most first, then by title. */
    const wouldJoin = (pitch) => state.people.filter((person) => picks.get(person.key).has(pitch.key)).length;
    const leadsOrder = () =>
      [...sent].sort((a, b) => wouldJoin(b) - wouldJoin(a) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

    /** The teams, in the order they were made, each `{ name, project, members, pitch }`. */
    const teams = [];
    const teamOfPerson = (person) => teams.find((team) => team.members.includes(person)) ?? null;

    /**
     * Who goes into a team made from a pitch: its pitchers, wherever they are,
     * then the people who would join it and are in no team, fewest picks first,
     * then by name, up to the largest team (`pitchTeamPeople` in
     * src/lib/courses/teams/make.ts, restated). The pitchers come out of the
     * team they were in.
     */
    function makeTeam(pitch) {
      const joiners = state.people
        .filter((person) => picks.get(person.key).has(pitch.key))
        .filter((person) => !pitch.pitchers.includes(person) && !teamOfPerson(person))
        .sort((a, b) => pickedBy(a) - pickedBy(b) || a.first.localeCompare(b.first, "en-GB") || a.uid.localeCompare(b.uid));
      const members = [...pitch.pitchers, ...joiners.slice(0, pitching.teamSize.max - pitch.pitchers.length)];
      for (const team of teams) team.members = team.members.filter((person) => !members.includes(person));
      const team = { name: pitch.title, project: projectLineOf(paperOf(pitch), pitch.twist), members, pitch };
      teams.push(team);
      return team;
    }

    /** A move: off every team, onto the end of the one named (`move` in src/lib/applications/handover/teamsAct.ts). */
    function moveTo(person, team) {
      for (const each of teams) each.members = each.members.filter((member) => member !== person);
      team.members.push(person);
    }

    /** The cards in the order the tab draws them: by name. */
    const cardsInOrder = () => [...teams].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    const inATeam = () => state.people.filter((person) => teamOfPerson(person));

    // ---- Pages, contexts and the recorder ---------------------------------------

    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const programmePathOnSite = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const setupUrl = `${formBase}/setup`;
    const pitchesUrl = `${formBase}/groups/pitches`;
    const learnPath = `/learn/${enc(state.runId)}`;
    const pitchingUrl = `${origin}${learnPath}/pitching`;
    const pitchingApi = `/api/courses/runs/${enc(state.runId)}/pitching`;

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: adaContext, page: adaPage } = await newIdentityPage(browser);
    const { context: benContext, page: benPage } = await newIdentityPage(browser);
    const { context: danContext, page: danPage } = await newIdentityPage(browser);
    const { context: eveContext, page: evePage } = await newIdentityPage(browser);

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
    for (const pg of [adaPage, benPage, danPage, evePage]) await stubRecaptchaOnLoopback(pg, origin);
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

    /** Waits for a control to be live: the pages draw them disabled until their script has arrived. */
    const whenEnabled = (locator, what) => waitFor(`${what} to be live`, async () => (await locator.count()) > 0 && locator.isEnabled());

    // ---- Pitching week, as a person taking part reads it ---------------------------

    const pitchingHeader = (pg) =>
      pg.locator("header").filter({ has: pg.getByRole("heading", { name: "Pitching week", level: 1, exact: true }) });
    const pitchList = (pg) => pg.getByRole("region", { name: /^Pitches \(\d+\)$/ });
    const yourPitch = (pg) => pg.getByRole("region", { name: "Your pitch", exact: true });
    const joinButton = (pg, pitch) => pg.getByRole("button", { name: `I’d join this: ${pitch.title}`, exact: true });

    /** Everything a person's pitching page says about the week and its pitches. */
    async function readPitching(pg) {
      const header = pitchingHeader(pg);
      await header.waitFor({ timeout: WAIT_MS });
      const [eyebrowShown, lede] = await textsOf(header.locator("p"));
      const list = pitchList(pg);
      await list.waitFor({ timeout: WAIT_MS });
      const rows = [];
      const items = list.getByRole("listitem");
      for (let i = 0; i < (await items.count()); i += 1) {
        const item = items.nth(i);
        const [title, by, twist] = await textsOf(item.locator("p"));
        const toggle = item.getByRole("button", { name: `I’d join this: ${title}`, exact: true });
        let mark = "?";
        if ((await toggle.count()) > 0) mark = (await toggle.getAttribute("aria-pressed")) === "true" ? "picked" : "";
        else if ((await item.getByText("Your pitch", { exact: true }).count()) > 0) mark = "yours";
        rows.push([title, by, twist, mark]);
      }
      const picked = list.getByText(/^\d+ of \d+ picked$/);
      return {
        eyebrow: eyebrowShown,
        lede,
        heading: await textOf(list.getByRole("heading", { level: 2 })),
        rows,
        picked: (await picked.count()) > 0 ? await textOf(picked) : null,
        teams: (await pg.getByText(teamsLine, { exact: true }).count()) > 0 ? teamsLine : null,
      };
    }

    /** Holds a person's page to what has happened, from their seat. */
    async function assertPitchingPage(pg, viewer) {
      const expected = {
        eyebrow,
        lede: ledeOf(sent.length),
        heading: `Pitches (${sent.length})`,
        rows: rowsFor(viewer),
        picked: pickedLine(pickedBy(viewer)),
        teams: teamsLine,
      };
      const read = await waitFor(`${viewer.first}'s pitching page to show ${sent.length} pitches`, async () => {
        const now = await readPitching(pg);
        return now.rows.length === sent.length && now.picked === expected.picked ? now : null;
      });
      assert.deepEqual(read, expected, `${viewer.first}'s pitching page`);
      return read;
    }

    /** Opens pitching week, the way the run home's card does. */
    async function openPitching(pg, viewer) {
      await pg.goto(pitchingUrl, { waitUntil: "domcontentloaded" });
      assert.equal(new URL(pg.url()).pathname, `${learnPath}/pitching`, `${viewer.first} was sent away from pitching week`);
      await pitchingHeader(pg).waitFor({ timeout: WAIT_MS });
    }

    /** The choices of a menu, as its options say them. */
    const optionsOf = async (select) => textsOf(select.locator("option"));

    /**
     * Sends one pitch from the form, as its pitcher fills it in, and holds the
     * request and the card that replaces the form to what was typed.
     */
    async function sendPitch(pg, pitcher, pitch, { partner = null, partnersOffered }) {
      const region = yourPitch(pg);
      await region.waitFor({ timeout: WAIT_MS });
      const send = region.getByRole("button", { name: "Send pitch", exact: true });
      await whenEnabled(send, "Send pitch");

      const paper = region.getByLabel("Paper", { exact: true });
      assert.deepEqual(
        await optionsOf(paper),
        [...pitching.readings.map((reading) => reading.title), "Another paper"],
        "the paper menu is not the week's readings, then another paper",
      );
      const partnerBox = region.getByLabel("Partner", { exact: true });
      assert.deepEqual(
        await optionsOf(partnerBox),
        [PITCHING_ALONE, ...partnersOffered.map((person) => person.first)],
        `${pitcher.first}'s partner menu is not the people in the group on no pitch`,
      );

      await region.getByLabel("Title", { exact: true }).fill(pitch.title);
      if (pitch.typed) {
        await paper.selectOption({ label: "Another paper" });
        const which = region.getByLabel("Which paper", { exact: true });
        await which.waitFor({ timeout: WAIT_MS });
        await which.fill(pitch.typed);
      } else {
        await paper.selectOption({ label: paperOf(pitch) });
      }
      await region.getByLabel("Twist", { exact: true }).fill(pitch.twist);
      await region
        .getByText(`${TWIST_LIMIT - pitch.twist.length} characters left`, { exact: true })
        .waitFor({ timeout: WAIT_MS });
      await partnerBox.selectOption({ label: partner ? partner.first : PITCHING_ALONE });

      const [response] = await Promise.all([responseTo(pg, "/pitching/pitch", "POST"), send.click()]);
      const body = await okBody(response, `${pitcher.first}'s pitch`);
      assert.deepEqual(
        response.request().postDataJSON(),
        {
          title: pitch.title,
          paper: pitch.typed
            ? { kind: "typed", title: pitch.typed }
            : { kind: "reading", materialId: pitching.readings[pitch.reading].id },
          twist: pitch.twist,
          partnerUid: partner ? partner.uid : null,
        },
        `${pitcher.first}'s pitch was not sent as typed`,
      );
      const mine = body.view?.mine;
      assert.ok(mine?.id, `${pitcher.first}'s pitch came back with no id`);
      sent.push({ ...pitch, id: mine.id, pitchers: partner ? [pitcher, partner] : [pitcher] });

      // The card that replaces the form: the pitch, sent, and until when it can change.
      const card = region.getByRole("heading", { name: pitch.title, level: 3, exact: true });
      await card.waitFor({ timeout: WAIT_MS });
      await region.getByText("Sent", { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.deepEqual(
        await textsOf(region.locator("p")),
        [`Paper: ${paperOf(pitch)}`, `Twist: ${pitch.twist}`, ...(partner ? [`Partner: ${partner.first}`] : [])],
        `${pitcher.first}'s card does not say what was pitched`,
      );
      const edit = region.getByRole("link", { name: editUntil(), exact: true });
      await edit.waitFor({ timeout: WAIT_MS });
      assert.ok((await edit.getAttribute("href"))?.endsWith("?edit=1"), "Edit until does not open the pitch in its form");
      return mine;
    }

    /** One press of "I’d join this", and the answer read back. */
    async function pressJoin(pg, viewer, pitch) {
      const toggle = joinButton(pg, pitch);
      const [response] = await Promise.all([responseTo(pg, "/pitching/picks", "POST"), toggle.click()]);
      await okBody(response, `${viewer.first}'s pick of ${pitch.title}`);
      assert.deepEqual(response.request().postDataJSON(), { pitchId: pitch.id, join: true }, "the pick was not sent as pressed");
      picks.get(viewer.key).add(pitch.key);
      await waitFor(`${pitch.title} to show as picked`, async () => (await toggle.getAttribute("aria-pressed")) === "true");
    }

    /** The stored pitches, by title: who pitched each and who would join it, as uids. */
    async function storedPitches() {
      const snap = await fixtureQuery("coursePitches").where("runId", "==", state.runId).get();
      return new Map(snap.docs.map((doc) => [doc.data().title, doc.data()]));
    }

    /** What the pitching read answers one person, as their page would be drawn. */
    async function readAnswered(pg, viewer) {
      const answer = await fetchAs(pg, pitchingApi);
      assert.equal(answer.status, 200, `the pitching read refused ${viewer.first}: ${JSON.stringify(answer.body)}`);
      const view = answer.body?.view;
      for (const row of view.pitches) {
        assert.deepEqual(Object.keys(row).sort(), PITCH_ROW_KEYS, `a pitch row handed to ${viewer.first} carries more than its own picks`);
      }
      assert.deepEqual(
        {
          eyebrow: view.eyebrow,
          lede: view.lede,
          open: view.open,
          pickLimit: view.pickLimit,
          picked: view.picked,
          teams: view.teams,
          rows: view.pitches.map((row) => [row.title, row.pitchedBy, row.twist, row.yours ? "yours" : row.picked ? "picked" : ""]),
        },
        {
          eyebrow,
          lede: ledeOf(sent.length),
          open: true,
          pickLimit: pitching.pickLimit,
          picked: pickedBy(viewer),
          teams: teamsLine,
          rows: rowsFor(viewer),
        },
        `what the pitching read answers ${viewer.first}`,
      );
      return view;
    }

    // ---- The Teams tab ----------------------------------------------------------------

    const teamsRegion = () => adminPage.getByRole("region", { name: /^Teams \(\d+\)$/ });
    const noTeamRegion = () => adminPage.getByRole("region", { name: /^No team \(\d+\)$/ });
    const teamPitches = () => adminPage.getByRole("region", { name: /^Pitches from week \d+ \(\d+\)$/ });
    const saidOnTab = (line) => adminPage.getByRole("status").filter({ hasText: line });

    /** A person's name out of the menu beside them, "Move to… (Eve)". */
    const nameInMenu = (label) => /^Move to… \((.+)\)$/.exec(label ?? "")?.[1] ?? `?${label}`;

    /** The names in one card or section, from the menu beside each person, in the order drawn. */
    async function namesInMenus(scope) {
      const menus = scope.getByRole("combobox");
      const names = [];
      for (let i = 0; i < (await menus.count()); i += 1) names.push(nameInMenu(await menus.nth(i).getAttribute("aria-label")));
      return names;
    }

    /** The pitches column of the Teams tab: [title, would join, pitched by, state, twist, offers Make it a team]. */
    async function readTeamPitches() {
      const region = teamPitches();
      await region.waitFor({ timeout: WAIT_MS });
      const items = region.getByRole("listitem");
      const rows = [];
      for (let i = 0; i < (await items.count()); i += 1) {
        const item = items.nth(i);
        const became = (await item.getByText("Became a team", { exact: true }).count()) > 0;
        const notForward = (await item.getByText("Not taken forward", { exact: true }).count()) > 0;
        rows.push([
          await textOf(item.locator("p").first()),
          await textOf(item.getByText(/^\d+ would join$/)),
          await textOf(item.getByText(/^Pitched by /)),
          became ? "Became a team" : notForward ? "Not taken forward" : "",
          await textOf(item.locator("p").last()),
          (await item.getByRole("button", { name: "Make it a team", exact: true }).count()) === 1,
        ]);
      }
      return { heading: await textOf(region.getByRole("heading", { level: 2 })), rows };
    }

    /** The pitches column as it should read now. */
    const teamPitchesNow = () => ({
      heading: `Pitches from week ${pitching.weekNumber} (${sent.length})`,
      rows: leadsOrder().map((pitch) => {
        const became = teams.some((team) => team.pitch === pitch);
        const anyTeam = teams.length > 0;
        return [
          pitch.title,
          `${wouldJoin(pitch)} would join`,
          pitchedBy(pitch),
          became ? "Became a team" : anyTeam ? "Not taken forward" : "",
          pitch.twist,
          !became,
        ];
      }),
    });

    /** The teams column: each card [name, size, project, people], then who is in no team. */
    async function readTeamCards() {
      const region = teamsRegion();
      await region.waitFor({ timeout: WAIT_MS });
      const cards = [];
      const articles = region.getByRole("article");
      for (let i = 0; i < (await articles.count()); i += 1) {
        const card = articles.nth(i);
        cards.push([
          await textOf(card.getByRole("heading", { level: 3 })),
          await textOf(card.getByText(/^\d+ (?:people|person)$/)),
          await textsOf(card.locator("p")),
          await namesInMenus(card),
        ]);
      }
      const noTeam = noTeamRegion();
      return {
        heading: await textOf(region.getByRole("heading", { level: 2 })),
        cards,
        noTeam:
          (await noTeam.count()) > 0
            ? { heading: await textOf(noTeam.getByRole("heading", { level: 3 })), names: await namesInMenus(noTeam) }
            : null,
        foot: await textOf(region.locator("p").filter({ hasText: " in a team." })),
        emails: (await region.getByText(/^Emails \d+ (?:people|person)$/).count()) > 0
          ? await textOf(region.getByText(/^Emails \d+ (?:people|person)$/))
          : null,
      };
    }

    /** The teams column as it should read now, and who would be emailed. */
    function teamCardsNow({ told = false } = {}) {
      // In no team, by name. Their names are read off the menu beside each,
      // and with no team at all there is nowhere to move anybody, so the tab
      // draws no menu (`moveMenu` in ProgrammeTeams.tsx) and no name is read.
      const leftOut = state.people
        .filter((person) => !teamOfPerson(person))
        .sort((a, b) => a.first.localeCompare(b.first, "en-GB") || a.uid.localeCompare(b.uid));
      const owed = told ? 0 : inATeam().length;
      return {
        heading: `Teams (${teams.length})`,
        cards: cardsInOrder().map((team) => [
          team.name,
          peopleWords(team.members.length),
          [team.project],
          team.members.map((person) => person.first),
        ]),
        noTeam:
          leftOut.length > 0
            ? { heading: `No team (${leftOut.length})`, names: teams.length > 0 ? leftOut.map((person) => person.first) : [] }
            : null,
        foot: `${inATeam().length} of ${state.people.length} in a team.${changeUntil()}`,
        emails: owed > 0 ? `Emails ${peopleWords(owed)}` : null,
      };
    }

    /** One press on the Teams tab that answers with a sentence, and the sentence on the tab. */
    async function pressOnTab(suffix, press, said) {
      const [response] = await Promise.all([responseTo(adminPage, suffix, "POST"), press()]);
      const body = await okBody(response, `The Teams tab's press (${suffix})`);
      await saidOnTab(said).waitFor({ timeout: WAIT_MS });
      return { body, request: response.request().postDataJSON() };
    }

    /** The stored teams, by name: who is in each and who has been told. */
    async function storedTeams() {
      const snap = await fixtureQuery("courseTeams").where("runId", "==", state.runId).get();
      return new Map(snap.docs.map((doc) => [doc.data().name, { id: doc.id, ...doc.data() }]));
    }

    // ---- Mail --------------------------------------------------------------------

    /** The messages to one fixture address, oldest first. */
    async function mailTo(address, count) {
      const summaries = await waitForMessagesTo(address, { count, timeoutMs: WAIT_MS });
      return summaries.slice().reverse();
    }

    /** The tests of this programme's team email the admin was sent, read out of the admin's mailbox. Never printed. */
    async function adminTeamTests() {
      const found = [];
      for (const summary of await messagesTo(secrets.adminEmail)) {
        if (!String(summary.Subject ?? "").startsWith("[TEST] Your team: ")) continue;
        const email = await readEmail(summary);
        if (email.words.includes(`one of ${state.programmeName}’s teams.`)) found.push(email);
      }
      return found;
    }

    /**
     * One person's team email, from its heading to its last line, as
     * `teamEmailWords` writes it and `TeamEmail` lays it out: the subject as
     * the heading, the greeting, the paragraphs, no sign-off (nobody leads
     * the programme), then the footer.
     */
    function teamEmailWords(person, { test: isTest = false } = {}) {
      const team = teamOfPerson(person);
      const subject = `${isTest ? "[TEST] " : ""}Your team: ${team.name}`;
      const teammates = team.members.filter((member) => member !== person).map((member) => member.first);
      return {
        subject,
        tail: [
          subject,
          `Hi ${person.first},`,
          `Your team is ${team.name}, one of ${state.programmeName}’s teams.`,
          `Your project: ${withStop(team.project)}`,
          teammates.length > 0 ? `You’re with ${namesInWords(teammates)}.` : "Nobody else is in it yet.",
          "Your weekly session stays as it is: the teams work inside it.",
          "If something here isn’t right, reply to this email.",
          FOOTER,
        ].join(" "),
      };
    }

    /** Neither half of an email names the group's meeting link, nor its host. */
    function assertNoMeetingLink(email, who) {
      for (const [part, body] of [
        ["HTML", email.html],
        ["text", email.text],
      ]) {
        assert.ok(
          !body.includes(group.meetingUrl) && !body.includes(new URL(group.meetingUrl).host),
          `${who}'s ${part} part carries the meeting link. A link to join lives on the site only.`,
        );
      }
    }

    /** Every send log row to one address, by kind. */
    const sendKindsTo = async (address) =>
      (await fixtureQuery("emailSends").where("to", "==", address).get()).docs
        .map((doc) => String(doc.data()?.kind ?? ""))
        .sort();

    /** How many messages each of the five has in Mailpit right now. */
    const mailCounts = async () => {
      const out = {};
      for (const person of state.people) out[person.first] = (await messagesTo(person.email)).length;
      return out;
    };
    const everyone = (count) => Object.fromEntries(state.people.map((person) => [person.first, count]));

    try {
      await step("the admin approves the five people taking part in the incubator", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const person of state.people) {
          await approvePendingApplicant(adminPage, origin, { email: person.email });
          const approved = await waitFor(`${person.first}'s account to say member`, async () => {
            const doc = await readUserDoc(person.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${person.first}'s approval left no approvedAt stamp`);
        }
        // Approving is the one thing that has emailed anybody so far. Each
        // message reaches Mailpit a moment after its card leaves the queue, so
        // each is waited for before the mailboxes are counted.
        for (const person of state.people) await mailTo(person.email, 1);
        assert.deepEqual(await mailCounts(), everyone(1), "approving emailed somebody twice");
      });

      await step("the admin names the incubator's running course run on the programme's Settings tab", async () => {
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
        await panel
          .getByText(
            `${state.people.length} people hold a place on ${state.programmeName}. None of them is on the run’s list yet.`,
            { exact: true },
          )
          .waitFor({ timeout: WAIT_MS });
        const form = (await fixtureDoc("admissionRounds", state.formId).get()).data();
        assert.equal(form?.programmes?.[state.programmeId]?.runId, state.runId, "the form does not name the run");
        assert.equal(form?.programmes?.[state.programmeId]?.leadUid, null, "naming the run named a lead");
        // Naming tells nobody anything, and moves nobody: the places stay as Publish left them.
        const places = await fixtureQuery("courseEnrolments").where("runId", "==", state.runId).get();
        assert.equal(places.size, state.people.length, "the run's places changed");
        for (const doc of places.docs) {
          assert.equal(doc.data().groupId, group.id, "somebody's place moved");
          assert.ok(doc.data().allocatedEmailAt, "somebody's place is no longer told");
        }
      });

      await step("a member opens pitching week and pitches alone, on one of the week's readings", async () => {
        activePage = adaPage;
        await signIn(adaPage, ada);
        await openPitching(adaPage, ada);
        await assertPitchingPage(adaPage, ada);
        // The back link: to the programme's home, by the programme's name.
        assert.equal(
          await adaPage.getByRole("link", { name: state.programmeName, exact: true }).getAttribute("href"),
          learnPath,
          "the back link does not lead to the programme's home",
        );
        await sendPitch(adaPage, ada, PITCH.probe, { partnersOffered: [ben, cleo, dan, eve] });
        await assertPitchingPage(adaPage, ada);

        const stored = (await storedPitches()).get(PITCH.probe.title);
        assert.ok(stored, "the pitch is not stored");
        assert.deepEqual(
          {
            groupId: stored.groupId,
            weekId: stored.weekId,
            weekNumber: stored.weekNumber,
            paper: stored.paper,
            twist: stored.twist,
            pitcherUids: stored.pitcherUids,
            wouldJoinUids: stored.wouldJoinUids,
          },
          {
            groupId: group.id,
            weekId: pitching.weekId,
            weekNumber: pitching.weekNumber,
            paper: { kind: "reading", materialId: pitching.readings[PITCH.probe.reading].id, title: paperOf(PITCH.probe) },
            twist: PITCH.probe.twist,
            pitcherUids: [ada.uid],
            wouldJoinUids: [],
          },
          "the stored pitch",
        );
        // Pitching emails nobody.
        assert.deepEqual(await mailCounts(), everyone(1), "pitching emailed somebody");
      });

      await step("a second member pitches with a partner from the group, on a paper typed in, and picks a pitch", async () => {
        activePage = benPage;
        await signIn(benPage, ben);
        await openPitching(benPage, ben);
        await assertPitchingPage(benPage, ben);
        // Ada is on a pitch, so she is nobody's partner now.
        await sendPitch(benPage, ben, PITCH.reward, { partner: cleo, partnersOffered: [cleo, dan, eve] });
        await assertPitchingPage(benPage, ben);
        await pressJoin(benPage, ben, pitchOf("probe"));
        await assertPitchingPage(benPage, ben);

        const stored = await storedPitches();
        assert.deepEqual(stored.get(PITCH.reward.title)?.pitcherUids, [ben.uid, cleo.uid], "the pair's pitch is not Ben's and Cleo's");
        assert.deepEqual(stored.get(PITCH.reward.title)?.paper, { kind: "typed", title: PITCH.reward.typed }, "the typed paper");
        assert.deepEqual(stored.get(PITCH.probe.title)?.wouldJoinUids, [ben.uid], "Ben's pick is not on Ada's pitch");
      });

      await step("a third member pitches alone, reads both other pitches and picks up to the limit", async () => {
        activePage = danPage;
        await signIn(danPage, dan);
        await openPitching(danPage, dan);
        await assertPitchingPage(danPage, dan);
        // Everybody else but Eve is on a pitch.
        await sendPitch(danPage, dan, PITCH.chess, { partnersOffered: [eve] });
        for (const key of ["probe", "reward"]) await pressJoin(danPage, dan, pitchOf(key));
        assert.equal(pickedBy(dan), pitching.pickLimit, "Dan has not picked up to the limit");
        await assertPitchingPage(danPage, dan);
      });

      await step(
        "the first member picks a pitch, and the pitching read answers what each page drew and refuses the lead",
        async () => {
          activePage = adaPage;
          await openPitching(adaPage, ada);
          await assertPitchingPage(adaPage, ada);
          await pressJoin(adaPage, ada, pitchOf("chess"));
          const drawn = await assertPitchingPage(adaPage, ada);

          // The read the page is drawn from answers the same, and her own pitch whole.
          const view = await readAnswered(adaPage, ada);
          assert.equal(view.lede, drawn.lede, "the read and the page say different things");
          assert.deepEqual(
            view.mine,
            {
              id: pitchOf("probe").id,
              title: PITCH.probe.title,
              paperTitle: paperOf(PITCH.probe),
              readingId: pitching.readings[PITCH.probe.reading].id,
              twist: PITCH.probe.twist,
              partner: null,
              sentByMe: true,
            },
            "Ada's own pitch, as the read answers it",
          );
          for (const [pg, viewer] of [
            [benPage, ben],
            [danPage, dan],
          ]) {
            const theirs = await readAnswered(pg, viewer);
            assert.equal(theirs.mine?.title, pitchOf(viewer === ben ? "reward" : "chess").title, `${viewer.first}'s own pitch`);
          }
          // The lead takes no part in pitching week: the read refuses them as it refuses anybody.
          const lead = await fetchAs(adminPage, pitchingApi);
          assert.deepEqual([lead.status, lead.body?.error], [403, NOT_TAKING_PART], "the pitching read answered the lead");
        },
      );

      await step("a member who did not pitch picks up to the limit, and one more is refused in the page's words", async () => {
        activePage = evePage;
        await signIn(evePage, eve);
        await openPitching(evePage, eve);
        await assertPitchingPage(evePage, eve);
        for (const pitch of sent) await whenEnabled(joinButton(evePage, pitch), `Eve's I’d join this on ${pitch.title}`);

        // The same person with pitching week open twice: she picks up to the
        // limit on her second page, while the first still shows none picked.
        const otherPage = await eveContext.newPage();
        await stubRecaptchaOnLoopback(otherPage, origin);
        activePage = otherPage;
        await openPitching(otherPage, eve);
        for (const key of ["probe", "chess"]) await pressJoin(otherPage, eve, pitchOf(key));
        await assertPitchingPage(otherPage, eve);
        const third = pitchOf("reward");
        assert.equal(await joinButton(otherPage, third).isDisabled(), true, "a pitch can still be picked past the limit");

        // On the first page the third press goes to the route, which refuses it,
        // and the page says why.
        activePage = evePage;
        const [response] = await Promise.all([
          responseTo(evePage, "/pitching/picks", "POST"),
          joinButton(evePage, third).click(),
        ]);
        const refusal = `You’ve picked ${pitching.pickLimit}. Take one off before you pick another.`;
        assert.deepEqual(
          [response.status(), (await response.json().catch(() => null))?.error],
          [409, refusal],
          "a pick past the limit was not refused",
        );
        await evePage.getByRole("status").filter({ hasText: refusal }).waitFor({ timeout: WAIT_MS });
        assert.equal(await joinButton(evePage, third).getAttribute("aria-pressed"), "false", "the refused pick shows as picked");

        // Read again, the first page agrees with the second.
        await evePage.reload({ waitUntil: "domcontentloaded" });
        await assertPitchingPage(evePage, eve);
        assert.equal(await joinButton(evePage, third).isDisabled(), true, "after a reload a pitch can be picked past the limit");
        await otherPage.close();

        const stored = await storedPitches();
        assert.deepEqual(
          Object.fromEntries(sent.map((pitch) => [pitch.title, stored.get(pitch.title)?.wouldJoinUids.length])),
          Object.fromEntries(sent.map((pitch) => [pitch.title, wouldJoin(pitch)])),
          "the stored picks are not the presses",
        );
        assert.ok(!stored.get(third.title)?.wouldJoinUids.includes(eve.uid), "the refused pick was stored");
      });

      await step("the lead's Pitches view shows each pitch and how many would join, and names nobody who picked", async () => {
        activePage = adminPage;
        await adminPage.goto(pitchesUrl, { waitUntil: "domcontentloaded" });
        const views = adminPage.getByRole("navigation", { name: "Groups views" });
        assert.equal(
          await views.getByRole("link", { name: "Pitches", exact: true }).getAttribute("aria-current"),
          "page",
          "the Groups tab's views do not say this is Pitches",
        );
        const region = adminPage.getByRole("region", { name: `Pitches from week ${pitching.weekNumber} (${sent.length})`, exact: true });
        await region.waitFor({ timeout: WAIT_MS });
        const items = region.getByRole("listitem");
        const rows = [];
        for (let i = 0; i < (await items.count()); i += 1) {
          const item = items.nth(i);
          rows.push([
            await textOf(item.locator("p").first()),
            await textOf(item.getByText(/^\d+ would join$/)),
            await textOf(item.getByText(/^Pitched by /)),
            await textOf(item.locator("p").last()),
          ]);
        }
        assert.deepEqual(
          rows,
          leadsOrder().map((pitch) => [pitch.title, `${wouldJoin(pitch)} would join`, pitchedBy(pitch), pitch.twist]),
          "the lead's list of pitches, most would join first",
        );
        const said = await textOf(region);
        for (const note of ["isn’t published yet", "Nobody can pick yet"]) {
          assert.ok(!said.includes(note), `the lead's list says ${JSON.stringify(note)}`);
        }
        // Eve only picked: her name is nowhere on the list.
        assert.ok(!new RegExp(`\\b${escapeRegExp(eve.first)}\\b`).test(said), "the lead's list names somebody who picked");
      });

      await step("on the Teams tab the lead makes teams from the pitches", async () => {
        activePage = adminPage;
        const tab = adminPage.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /^Teams\s*\d*$/ });
        assert.equal(await tab.getAttribute("href"), `${programmePathOnSite}/teams`, "the Teams tab does not lead to the teams");
        await Promise.all([adminPage.waitForURL(`${formBase}/teams`, { timeout: WAIT_MS }), tab.click()]);
        await adminPage.getByText(`Teams by ${teamsMadeOnDay}`, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await tab.getAttribute("aria-current"), "page", "the Teams tab is not the current one");

        assert.deepEqual(await readTeamPitches(), teamPitchesNow(), "the Teams tab's pitches, before any team");
        assert.deepEqual(await readTeamCards(), teamCardsNow(), "the Teams tab's teams, before any team");
        await teamsRegion()
          .getByText("No teams yet. Make a pitch a team with its Make it a team.", { exact: true })
          .waitFor({ timeout: WAIT_MS });
        for (const name of ["Send a test to me", "Tell everyone their team"]) {
          assert.equal(
            await adminPage.getByRole("button", { name, exact: true }).isDisabled(),
            true,
            `${name} can be pressed with nobody in a team`,
          );
        }

        // The pitch most would join, then the pair's, whose pitchers come out
        // of the team the first made.
        for (const key of ["probe", "reward"]) {
          const pitch = pitchOf(key);
          const team = makeTeam(pitch);
          const row = teamPitches().getByRole("listitem").filter({ has: adminPage.getByText(pitch.title, { exact: true }) });
          const { request } = await pressOnTab(
            "/teams",
            () => row.getByRole("button", { name: "Make it a team", exact: true }).click(),
            `${pitch.title} is a team of ${peopleWords(team.members.length)}.`,
          );
          assert.deepEqual(request, { action: "from-pitch", pitchId: pitch.id }, `making ${pitch.title} a team was not sent as pressed`);
          assert.deepEqual(await readTeamPitches(), teamPitchesNow(), `the Teams tab's pitches, after ${pitch.title}`);
          assert.deepEqual(await readTeamCards(), teamCardsNow(), `the Teams tab's teams, after ${pitch.title}`);
        }

        const stored = await storedTeams();
        assert.deepEqual(
          [...stored.values()]
            .map((team) => [team.name, team.groupId, team.source?.pitchId, team.project, team.memberUids, team.toldAs])
            .sort((a, b) => a[0].localeCompare(b[0])),
          cardsInOrder().map((team) => [team.name, group.id, team.pitch.id, team.project, team.members.map((person) => person.uid), []]),
          "the stored teams",
        );
      });

      await step("the lead moves the person left without a team with the Move to… menu, never a drag", async () => {
        activePage = adminPage;
        const left = state.people.filter((person) => !teamOfPerson(person));
        assert.deepEqual(left, [eve], "somebody other than Eve is in no team");
        const target = teams.find((team) => team.pitch.key === "probe");
        const menu = noTeamRegion().getByRole("combobox", { name: `Move to… (${eve.first})`, exact: true });
        assert.deepEqual(
          await optionsOf(menu),
          ["Move to…", ...cardsInOrder().map((team) => team.name)],
          "Eve's menu does not offer her group's teams",
        );
        moveTo(eve, target);
        const { request } = await pressOnTab(
          "/teams",
          () => menu.selectOption({ label: target.name }),
          `${eve.first} is in ${target.name} now.`,
        );
        const storedTarget = (await storedTeams()).get(target.name);
        assert.deepEqual(request, { action: "move", uid: eve.uid, teamId: storedTarget.id }, "the move was not sent as chosen");
        assert.deepEqual(await readTeamCards(), teamCardsNow(), "the Teams tab's teams, after the move");
        assert.equal(await noTeamRegion().count(), 0, "somebody is still in no team");
        // Each person in a team is offered the other team and no team.
        const menuOfAda = adminPage.getByRole("combobox", { name: `Move to… (${ada.first})`, exact: true });
        assert.deepEqual(
          await optionsOf(menuOfAda),
          ["Move to…", ...cardsInOrder().filter((team) => team !== teamOfPerson(ada)).map((team) => team.name), "No team"],
          "a person's menu in a team",
        );
        assert.deepEqual(storedTarget.memberUids, target.members.map((person) => person.uid), "the stored team after the move");
        await teamsRegion()
          .getByText("Send yourself a test first: it’s the first person’s email, marked as a test.", { exact: true })
          .waitFor({ timeout: WAIT_MS });
        assert.equal(
          await adminPage.getByRole("button", { name: "Tell everyone their team", exact: true }).isDisabled(),
          true,
          "everyone can be told before the presser has sent themselves a test",
        );
      });

      await step(
        "the lead sends the team email's test to themselves, and it is the first person's email marked as a test",
        async () => {
          activePage = adminPage;
          assert.deepEqual(await adminTeamTests(), [], "a test of this programme's team email was already in the admin's mailbox");
          // The first person a press would tell: the first person of the team made first.
          const first = teams[0].members[0];
          const { subject, tail } = teamEmailWords(first, { test: true });
          const { body, request } = await pressOnTab(
            "/tell/test",
            () => adminPage.getByRole("button", { name: "Send a test to me", exact: true }).click(),
            `A test is on its way to you: “${subject}”.`,
          );
          assert.deepEqual(request, {}, "the test was sent a body");
          assert.deepEqual([body.delivery, body.subject], ["sent", subject], "the test's answer");

          const tests = await waitFor("the test in the admin's mailbox", async () => {
            const found = await adminTeamTests();
            return found.length > 0 ? found : null;
          });
          assert.equal(tests.length, 1, `the admin was sent ${tests.length} tests of this programme's team email`);
          const [email] = tests;
          assert.equal(email.subject, subject, "the test's subject");
          assert.ok(email.words.endsWith(tail), `the test does not say, word for word, ${JSON.stringify(tail)}. It says: ${JSON.stringify(email.words)}`);
          assert.ok(email.replyTo.includes(REPLY_TO), `the test does not reply to ${REPLY_TO}`);
          assertNoMeetingLink(email, "the test");

          // The press is open now, and says how many it emails.
          await whenEnabled(adminPage.getByRole("button", { name: "Tell everyone their team", exact: true }), "Tell everyone their team");
          assert.deepEqual(await readTeamCards(), teamCardsNow(), "the Teams tab's teams, after the test");
          const markers = (await fixtureQuery("courseNudges").where("runId", "==", state.runId).get()).docs.filter((doc) =>
            doc.id.startsWith("teamstest__"),
          );
          assert.equal(markers.length, 1, "the test left no marker, or more than one");
          assert.equal(markers[0].data().byUid === state.adminUid, true, "the test's marker is not the presser's");
          // Nobody taking part was emailed by the test.
          assert.deepEqual(await mailCounts(), everyone(1), "the test reached somebody taking part");
        },
      );

      await step("the lead tells everyone their team, with the count on the button", async () => {
        activePage = adminPage;
        const count = inATeam().length;
        await teamsRegion().getByText(`Emails ${peopleWords(count)}`, { exact: true }).waitFor({ timeout: WAIT_MS });
        const { body, request } = await pressOnTab(
          "/tell",
          () => adminPage.getByRole("button", { name: "Tell everyone their team", exact: true }).click(),
          `Told ${peopleWords(count)} their team.`,
        );
        assert.deepEqual(request, { emails: count }, "the press did not send the number on the button");
        assert.deepEqual(
          body.report,
          { sent: count, held: 0, suppressed: 0, failed: [], noAddress: [] },
          "the press did not send one email to each person in a team",
        );
        assert.deepEqual(body.said, [`Told ${peopleWords(count)} their team.`], "the press's lines");

        // Told: nothing is owed, so nothing more can be pressed.
        await teamsRegion().getByText("Everyone in a team has been told their team.", { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.deepEqual(await readTeamCards(), teamCardsNow({ told: true }), "the Teams tab's teams, once everyone is told");
        assert.equal(
          await adminPage.getByRole("button", { name: "Tell everyone their team", exact: true }).isDisabled(),
          true,
          "everyone can be told again with nothing owed",
        );
        // What each was told is kept on their team; the press let the run go.
        for (const team of teams) {
          const stored = (await storedTeams()).get(team.name);
          assert.deepEqual(
            stored.toldAs.map((told) => told.uid).sort(),
            team.members.map((person) => person.uid).sort(),
            `${team.name} does not record each of its people as told`,
          );
        }
        const lock = (await fixtureQuery("courseNudges").where("runId", "==", state.runId).get()).docs.filter((doc) =>
          doc.id.startsWith("teamstell__"),
        );
        assert.equal(lock.length, 0, "the press still holds the run");
      });

      await step(
        "each person's email names their own team, word for word, and nobody else's, and no email carries the meeting link",
        async () => {
          activePage = adminPage;
          const everything = [];
          for (const person of state.people) {
            // Their approval, then their team.
            const mail = await mailTo(person.email, 2);
            assert.equal(mail.length, 2, `${person.first} has ${mail.length} emails`);
            for (const summary of mail) everything.push(await readEmail(summary));
            const email = await readEmail(mail[1]);
            const { subject, tail } = teamEmailWords(person);
            assert.equal(email.subject, subject, `${person.first}'s team email's subject`);
            assert.ok(
              email.words.endsWith(tail),
              `${person.first}'s team email does not say, word for word, ${JSON.stringify(tail)}. It says: ${JSON.stringify(email.words)}`,
            );
            assert.ok(email.replyTo.includes(REPLY_TO), `${person.first}'s team email does not reply to ${REPLY_TO}`);
            // Nobody else's team, and nobody outside their own.
            const own = teamOfPerson(person);
            for (const other of teams.filter((team) => team !== own)) {
              assert.ok(!email.words.includes(other.name), `${person.first}'s email names ${other.name}`);
            }
            for (const stranger of state.people.filter((each) => !own.members.includes(each))) {
              assert.ok(
                !new RegExp(`\\b${escapeRegExp(stranger.first)}\\b`).test(email.words),
                `${person.first}'s email names ${stranger.first}, who is in another team`,
              );
            }
          }
          assert.deepEqual(await mailCounts(), everyone(2), "who was emailed");
          everything.push(...(await adminTeamTests()));
          assert.equal(everything.length, state.people.length * 2 + 1, `the journey caused ${everything.length} emails`);
          for (const email of everything) assertNoMeetingLink(email, JSON.stringify(email.subject));

          // The send log, by address and by what each send was about.
          for (const person of state.people) {
            const logged = await waitFor(`${person.first}'s send rows`, async () => {
              const rows = await sendKindsTo(person.email);
              return rows.length >= 2 ? rows : null;
            });
            assert.deepEqual(logged, ["application", "course-application"], `${person.first}'s send rows`);
          }
          const aboutRun = (await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get()).docs
            .map((doc) => String(doc.data()?.kind ?? ""))
            .sort();
          assert.deepEqual(
            aboutRun,
            [...state.people.map(() => "course-application"), "course-test"].sort(),
            "the run's send rows are not one team email a person and the test",
          );
        },
      );
    } finally {
      await Promise.allSettled([
        eveContext.close(),
        danContext.close(),
        benContext.close(),
        adaContext.close(),
        context.close(),
      ]);
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
