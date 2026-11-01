/**
 * A programme's end, end to end in a real browser: its last week, who
 * finished, certificates, and the pages people read once it is over.
 *
 * Two terms of the world (scripts/e2e-fixtures/worlds/course-hub-term.mjs):
 * the fellowship in its last week, its one group's last session tonight
 * ("last-week"), and a fellowship past its run's last session, with somebody
 * who left in week 3 ("programme-over").
 *
 * -> the admin approves everybody who signs in or is sent a certificate ->
 * in the last week, names the run, appoints the group's facilitator, makes
 * the survey at the end from its template, tests it on themselves and emails
 * it to the person holding a place -> that person's Home says tonight is the
 * last session, with the survey at the end under it -> after the last
 * session, the admin names the other run, sets the rule for who finished on
 * Settings and appoints Group A's facilitator -> the Overview lists who
 * finished by the rule, the person who left apart, and the switch the lead
 * turns for one more keeps the counts and the list agreeing -> "Send a test to
 * me" emails the lead the first certificate's email, marked as a test -> the
 * send emails each person who finished and the facilitator once, as its
 * button said -> Ada reads that she finished, her certificate and what she
 * keeps, turns the certificate's link on and downloads its PDF -> a stranger
 * reads only what the certificate says and cannot download it, and a
 * certificate whose link is off shows them nothing -> Cleo, who did not
 * finish, reads that the programme has ended and nothing about finishing ->
 * Dan, who left, reads only that he left -> every email went to the send log,
 * and none carries the meeting link.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-programme-end
 *
 * It declares `requiresCaughtMail`, so the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit: both tests go to the
 * admin's own address, and every certificate email is read out of its
 * owner's mailbox.
 *
 * ## Every expected word comes from the seed's clock and the world's plan
 *
 * Dates, times, counts and names are worked out here from the state file and
 * the world's constants (`LAST_WEEK`, `PROGRAMME_OVER`), by the rules of the
 * screens restated beside each check, never written as a calendar date. Two
 * things the target decides are read from the routes' own answers: what the
 * survey at the end asks (the template's questions, from the survey as made),
 * and "What’s next" (the term's own application forms, read by the
 * programme's overview route), which the pages are held to.
 *
 * TONIGHT. The last week's group meets late in the evening, so its last
 * session is still to come at any hour the term is seeded before it, and Home
 * says "Tonight · your last session". A run read after midnight finds the
 * session the day before: Home then says "Your last session · week 6", and
 * the spec holds it to that, by the same rule, from the clock it reads.
 *
 * ## Six identities, six browser contexts
 *
 * The admin (the programme's lead here, as at every course hub spec); in the
 * last week, Ada (who reads Home); after the end, Ada (who finished), Cleo
 * (who did not, and who is also the stranger signed in), Dan (who left), and
 * somebody signed out (the stranger). Eve (ticked by the lead) and both Ferns
 * (the facilitators) never sign in: what they are sent is read out of their
 * mailboxes. CHROMIUM ONLY: a green run is a regression net, never a
 * substitute for the manual Safari pass.
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
import { getMessage, hrefUrls, messagesTo, waitForMessagesTo } from "../../scripts/e2e/lib/mailpit.mjs";
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
import { RECAPTCHA_DEPENDENT_STEPS, SPEC } from "../../scripts/e2e-fixtures/course-hub-programme-end.mjs";
import {
  PROGRAMME_OVER,
  clockWords,
  dayLabel,
  londonDateKey,
  londonWallClockToInstant,
  sessionOf,
  shiftDateKey,
} from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/**
 * How long a message may take to reach Mailpit, through the harness's own
 * wait (`waitForMessagesTo`). Longer than a locator's on purpose: on a loaded
 * CI runner an email has landed after thirty seconds. A message that never
 * comes still fails, a little later.
 */
const MAIL_WAIT_MS = 60_000;

/** How often a poll asks again. */
const POLL_MS = 500;

/** The society's address, as every page and email writes it. */
const SOCIETY = "ai-safety@uonsu.com";

/** Every email's last line (`EmailChrome`). */
const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";

/** The rule the lead sets: come to at least this many of the six sessions. */
const AT_LEAST = 4;

// ---------------------------------------------------------------------------
// The site's own words, restated from the files named beside each
// ---------------------------------------------------------------------------

/** "Wed 9 Dec" from a stored instant, read in London. */
const dayOfInstant = (at) => dayLabel(londonDateKey(at));

/**
 * The last week on Home (board wk-lastweek-phone): the ticket's eyebrow
 * (`sessionEyebrow` in src/lib/courses/memberPageWords.ts, "Tonight" from
 * 5pm), the card after the survey (`afterLastSessionHeading`,
 * `CERTIFICATE_LINE`), and the top card a survey would have had
 * (`CARD_WORDS`, src/lib/surveys/words.ts).
 */
const LAST_WEEK_WORDS = Object.freeze({
  tonight: "Tonight · your last session",
  before: (weekNumber) => `Your last session · week ${weekNumber}`,
  afterTonight: "After tonight",
  afterLast: "After your last session",
  certificateLine: "Everyone who finishes gets a certificate.",
  topCard: "A survey for you",
});

/**
 * "The survey at the end" in the last week (`END_CARD_WORDS` and
 * `endCardLastWeekWords` in src/lib/surveys/words.ts), for a survey that pairs
 * with none, so it asks its questions "on how it went".
 */
const END_SURVEY = Object.freeze({
  heading: "The survey at the end",
  open: "Open the survey",
  closesOn: (day) => `It closes on ${day}.`,
});

function endSurveyLine({ when, questions, minutes, facilitators, online }) {
  const at =
    when === "tonight"
      ? "At the end of tonight’s session"
      : when === "today"
        ? "At the end of today’s session"
        : `At the end of your last session, on ${when.day}`;
  const asks = `${questions} ${questions === 1 ? "question" : "questions"} on how it went`;
  const about = minutes === 1 ? "About a minute" : `About ${minutes} minutes`;
  const time = minutes === 1 ? "a minute" : `${minutes} minutes`;
  const one = facilitators.length === 1;
  const who =
    facilitators.length === 0
      ? "Your facilitators"
      : one
        ? facilitators[0]
        : `${facilitators.slice(0, -1).join(", ")} and ${facilitators[facilitators.length - 1]}`;
  const away = online ? `${one ? "steps" : "step"} away from the call` : `${one ? "steps" : "step"} out of the room`;
  return `${at}: ${asks}. ${about}. ${who} ${one ? "leaves" : "leave"} you ${time} for it and ${away}.`;
}

/**
 * The survey at the end, as New survey makes it (`STAGE_WORDS.after` and
 * `TEMPLATE_MINUTES` in src/lib/surveys/, the admin's own words for the Send
 * tab) and as its email's subject names it (`emailWords` there).
 */
const SURVEY = Object.freeze({
  card: "At the end of the programme",
  title: "At the end",
  minutes: 10,
  test: "Send a test to me",
  emailButton: (n) => `Email ${n} ${n === 1 ? "person" : "people"}`,
  subject: (title, questions, programme) => `${title}: ${questions} ${questions === 1 ? "question" : "questions"} for ${programme}`,
});

/**
 * "What’s next" (`WhatsNextCard` and `applicationsCloseWords`,
 * `applicationsOpenWords`, `FACILITATE_NEXT_TERM` in
 * src/lib/courses/memberPageWords.ts), from the overview route's answer.
 */
const WHATS_NEXT = "What’s next";

function whatsNextLines(whatsNext) {
  const applications = whatsNext?.applications ?? null;
  const lines = [];
  if (applications?.kind === "open") {
    const term = String(applications.label ?? "").trim() || "next term";
    lines.push(
      applications.closesOn ? `Applications for ${term} close on ${dayLabel(applications.closesOn)}.` : `Applications for ${term} are open.`,
    );
  } else if (applications?.kind === "opening") {
    const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Europe/London" }).format(
      new Date(`${applications.opensOn}T12:00:00Z`),
    );
    lines.push(`Applications for next term open in ${month}.`);
  }
  if (whatsNext?.facilitate === true) lines.push("Facilitate a group next term: say so when you apply.");
  return lines;
}

/**
 * WHO FINISHED, as the lead reads it (src/lib/courses/finishing/words.ts):
 * the rule's card on Settings, the Overview's section, and the programme's
 * head once its last session is over.
 */
const FINISHING = Object.freeze({
  card: "Who finished",
  label: "Came to at least",
  hint:
    "Of the sessions their group held: a cancelled session doesn’t count against anyone. After the last session, we tick everyone who came to this many, and you can change any. Only you and admins see this.",
  sentence: (atLeast, of) =>
    `We’ve ticked everyone who came to at least ${atLeast} of ${of} sessions. Change any you disagree with. Only you and admins see this rule.`,
  counts: (finished, not) => `${finished} finished · ${not} not`,
  caption: "Fewest sessions first",
  columns: ["Name", "Group", "Came to", "Written answers", "Finished"],
  noneSet: "None set",
  switchName: (name) => `Finished: ${name}`,
  changedByYou: "Changed by you",
  leftHead: "Left the programme",
  left: (day) => `Left ${day}`,
  head: (day) => `Finished · ${day}`,
  stayed: (n) => `${n} stayed to the end`,
});

/** "Excused in week 2. Missed weeks 4 and 5.": `missedLine`, restated. */
function missedLine(excused, missed) {
  const weeks = (list) => (list.length === 1 ? `week ${list[0]}` : `weeks ${namesOf(list.map(String))}`);
  const parts = [];
  if (excused.length > 0) parts.push(`Excused in ${weeks(excused)}`);
  if (missed.length > 0) parts.push(`Missed ${weeks(missed)}`);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return parts.map((part) => `${part}.`).join(" ");
}

/** "A", "A and B", "A, B and C". */
function namesOf(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * CERTIFICATES (src/lib/courses/certificates/words.ts): the Overview's
 * section, the preview, the email, the page, the card on the programme page,
 * and the routes' refusals.
 */
const CERTIFICATE = Object.freeze({
  section: "Certificates",
  counts: (finished, facilitators) =>
    `${finished} ${finished === 1 ? "person" : "people"} who finished and ${facilitators} ${facilitators === 1 ? "facilitator" : "facilitators"}.`,
  preview: (name) => `Preview ${name}’s certificate page`,
  theEmail: "The email",
  previewLink: "Preview",
  test: "Send a test to me",
  send: (n) => `Send ${n} ${n === 1 ? "certificate" : "certificates"}`,
  testFirst: "Send a test to yourself first. Then this unlocks.",
  emails: (n) => `Emails ${n} ${n === 1 ? "person" : "people"}. Each email links to their certificate page.`,
  notFinished: "People who didn’t finish get nothing and aren’t told.",
  testSaid: (subject) => `A test is on its way to you: “${subject}”.`,
  sent: (n) => `${n} ${n === 1 ? "certificate" : "certificates"} sent.`,
  allSent: "Everybody who finished and every facilitator has been sent theirs.",
  previewTitle: (name) => `${name}’s certificate page`,
  previewNote:
    "This is how the page will look to its owner once the certificate is sent, with its link off. Nobody else can open it until they turn the link on.",
  subject: (shortName) => `Your certificate for ${shortName}`,
  finishedLead: (programme) => `You finished the ${programme}, and your certificate is ready.`,
  facilitatedLead: (programme) => `Thank you for facilitating a group on the ${programme}. Your certificate is ready.`,
  see: "See your certificate",
  after: "It’s private: only you can see it until you turn its link on. From its page you can download it as a PDF or add it to LinkedIn.",
  signOff: "NAISI",
  pasteIt: "Or paste this into your browser:",
  did: { finished: "finished the", facilitated: "facilitated a group on the" },
  label: (name) => `Certificate for ${name}`,
  eyebrow: (term) => `Certificate · ${term}`,
  issued: (day) => `Issued on ${day} by NAISI, the AI safety student community at the University of Nottingham.`,
  check: (host, code) => `Check it at ${host}/c/${code}`,
  onlyYou: "Only you see this",
  download: "Download PDF",
  linkedIn: "Add to LinkedIn",
  linkSwitch: "Anyone with the link can see it",
  copy: "Copy link",
  card: "Your certificate",
  cardIssued: (day) => `Issued ${day}`,
  cardPrivate: "Only you can see it until you turn its link on.",
  notHere: "There’s no certificate here.",
  calmTitle: "There’s nothing to show at this address",
  calmBody:
    "A certificate shows here only while its owner has its link turned on. If somebody sent you this address, ask them to turn its link on.",
  calmSignIn: "If it’s yours, sign in to see it.",
  pdfName: (code) => `naisi-certificate-${code}.pdf`,
});

/** A code: sixteen characters of Crockford's base32 (`CODE_ALPHABET`, `CODE_LENGTH`). */
const CODE_SHAPE = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/**
 * The day a certificate states, read in London with the month cut to three
 * letters (`issuedOnWords` and `issuedShortWords` in
 * src/lib/courses/certificates/dates.ts).
 */
function issuedWords(at, { year }) {
  const part = (options) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...options }).format(at);
  const words = [part({ weekday: "short" }).slice(0, 3), part({ day: "numeric" }), part({ month: "short" }).slice(0, 3)];
  return (year ? [...words, part({ year: "numeric" })] : words).join(" ");
}

/**
 * The programme page once it is over (src/lib/courses/finishing/words.ts and
 * src/lib/courses/memberPageWords.ts; boards en-after-phone and
 * en-after-nofinish-phone).
 */
const AFTER = Object.freeze({
  finished: (name) => `You finished ${name}.`,
  ended: (name) => `${name} has ended.`,
  thanks: "Thanks for being part of it.",
  keep: "What you keep",
  readingList: (weeks) => `The reading list for all ${weeks} weeks`,
});

/** What a page must never say to somebody whose record does not say they finished. */
const TOLD_NOT_FINISHED = [/\bdid(?:n’t|n't| not) finish/i, /\bnot finished\b/i, /\bYou finished\b/];

/**
 * The page that says somebody left (src/lib/courses/leavingWords.ts), as the
 * leaving spec reads it whole: nothing but that they left, when, and what to
 * do if it was a mistake.
 */
const LEFT = Object.freeze({
  myProgrammes: "My programmes",
  heading: (name) => `You left ${name}`,
  on: (day) => `That was on ${day}. Thanks for coming along.`,
  changedYourMind: "Changed your mind?",
  changedLine: `Email ${SOCIETY} and we’ll see what we can do.`,
});

// ---------------------------------------------------------------------------
// The run, the state and the skip
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
const [lastWeek, over] = state?.terms ?? [];

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !lastWeek || !over
    ? `No course hub terms at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every grant on this journey is an " +
        "admin's, and this harness cannot create an admin."
      : lastWeek.suppress !== false || over.suppress !== false || !mailIsCaught({ origin: baseUrl() })
        ? "This journey reads its own mail, both tests to the admin included, so it runs only " +
          "against the server the harness starts with its mail caught by Mailpit."
        : null;

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

/** `textOf` for every element a locator matches, in order. */
const textsOf = async (locator) => (await locator.allTextContents()).map(flat);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * What an email's HTML says, as one line of words: block tags become a space,
 * inline ones vanish, and entities are decoded. Read off the HTML rather than
 * the text part, which writes headings in capitals.
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

/** Holds a text to a list of words in order, each after the one before. */
function assertInOrder(said, expected, what) {
  let from = 0;
  for (const words of expected) {
    const at = said.indexOf(words, from);
    assert.ok(at !== -1, `${what} does not say ${JSON.stringify(words)} where it should: ${said}`);
    from = at + words.length;
  }
}

/**
 * A request sent from a page, with that page's own session: exactly what the
 * page itself would send, so a refusal read here is the one the person gets.
 * The answer's words are JSON where they are JSON.
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

/**
 * A download fetched with a page's own session: its status, the headers a
 * download is judged by, its length, and its first bytes as text.
 */
async function fetchFileAs(pg, path) {
  return pg.evaluate(async (target) => {
    const res = await fetch(target);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const header = (name) => res.headers.get(name);
    return {
      status: res.status,
      type: header("content-type"),
      disposition: header("content-disposition"),
      cache: header("cache-control"),
      robots: header("x-robots-tag"),
      length: header("content-length"),
      size: bytes.length,
      head: String.fromCharCode(...bytes.slice(0, 5)),
    };
  }, path);
}


// `skipReason ?? false`, never `skipReason`: node:test reads the PRESENCE of a
// `skip` key, so a null there labels a fully successful run `# SKIP`.
test(
  "course hub: a programme's end, from its last week to who finished, certificates and the pages after it",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const host = new URL(origin).host;
    const secrets = loadSecrets();
    const enc = encodeURIComponent;
    const plan = PROGRAMME_OVER;

    // ---- The cast ----------------------------------------------------------------

    const [lwAda] = lastWeek.people;
    const lwFern = lastWeek.facilitator;
    const [lwGroup] = lastWeek.groups;
    assert.ok(lwAda && lwFern && lwGroup, "the last week's term has nobody in its group, or nobody to appoint");

    const personOf = (key) => {
      const found = over.people.find((person) => person.key === key);
      assert.ok(found, `the term past its end has nobody called ${key}`);
      return found;
    };
    const ada = personOf("ada");
    const cleo = personOf("cleo");
    const dan = personOf("dan");
    const eve = personOf("eve");
    const fern = over.facilitator;
    assert.ok(fern, "the term past its end has no account to appoint as a facilitator");
    const groupOf = (key) => over.groups.find((group) => group.key === key);
    const groupA = groupOf("A");
    const groupB = groupOf("B");
    assert.ok(groupA.meetingUrl, "Group A has no meeting link, so 'no email carries it' would prove nothing");
    const linkHost = new URL(groupA.meetingUrl).host;
    assert.ok(dan.leftAt, "the world wrote no day Dan left");
    const danLeftDay = dayOfInstant(new Date(dan.leftAt));

    /** Everybody with an address of their own, labelled so the two Adas and the two Ferns are told apart. */
    const everybody = [
      { label: "Ada (last week)", account: lwAda },
      { label: "Fern (last week)", account: lwFern },
      { label: "Ada", account: ada },
      { label: "Cleo", account: cleo },
      { label: "Dan", account: dan },
      { label: "Eve", account: eve },
      { label: "Fern", account: fern },
    ];

    // ---- What the registers and the rule make of each person -----------------------

    const weeks = Array.from({ length: over.weekCount }, (_, i) => i + 1);
    /** Present, late and left early count as came (the Attendance tab's rule, which who finished asks). */
    const CAME = new Set(["present", "late", "left-early"]);
    const markOf = (person, weekNumber) => plan.marks[person.groupKey]?.[weekNumber]?.[person.key] ?? null;
    const cameOf = (person) => weeks.filter((w) => CAME.has(markOf(person, w))).length;
    const markedOf = (person) => weeks.filter((w) => markOf(person, w) !== null).length;
    const lineOf = (person) =>
      missedLine(
        weeks.filter((w) => markOf(person, w) === "excused"),
        weeks.filter((w) => markOf(person, w) === "absent"),
      );
    /** Everybody taking part to the end: the people who did not leave. */
    const stayed = over.people.filter((person) => !plan.left?.[person.key]);
    /**
     * The section's rows, fewest sessions first, then by the name shown
     * (`buildWhoFinished`): the lead's tabs, read here by the admin, name
     * people by the names rule (`nameForViewer`), so each by the full name,
     * the fixture's display name. A certificate prints the account's display
     * name by its own rule (`certificateNameOf`).
     */
    const listed = [...stayed].sort(
      (a, b) => cameOf(a) - cameOf(b) || a.displayName.localeCompare(b.displayName, "en-GB") || a.uid.localeCompare(b.uid),
    );
    const byRule = (person) => cameOf(person) >= AT_LEAST;
    assert.deepEqual(
      stayed.filter(byRule).map((person) => person.key),
      ["ada"],
      "the world's marks no longer have the rule tick Ada alone",
    );
    /** The person the lead ticks, whom the rule leaves unticked. */
    const ticked = eve;
    assert.equal(byRule(ticked), false, "the person the lead ticks is ticked by the rule already");
    /** Who finished once the lead has ticked one more, and who is sent a certificate for it. */
    const finishers = [ada, ticked];
    /** Every certificate, finished first, in the order of whole names the send writes them. */
    const owed = [
      ...finishers.map((person) => ({ person, kind: "finished" })),
      { person: fern, kind: "facilitated" },
    ].sort((a, b) => a.person.displayName.localeCompare(b.person.displayName, "en-GB"));

    // ---- Dates, from each run's own calendar -----------------------------------------

    const lastSession = sessionOf(lwGroup, lastWeek.weekCount);
    const closesOn = shiftDateKey(lastSession.dateKey, 3);
    const closesAt = londonWallClockToInstant(closesOn, "23:59");
    const overLast = over.groups
      .map((group) => sessionOf(group, over.weekCount))
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())
      .at(-1);

    // ---- Addresses ------------------------------------------------------------------

    const programmePath = (aTerm) => `/admin/admissions/forms/${enc(aTerm.formId)}/programmes/${enc(aTerm.programmeId)}`;
    const formBase = (aTerm) => `${origin}${programmePath(aTerm)}`;
    const apiBase = (aTerm) => `/api/admissions/forms/${enc(aTerm.formId)}/programmes/${enc(aTerm.programmeId)}`;
    const learnPath = (aTerm) => `/learn/${enc(aTerm.runId)}`;
    const previewPath = `${programmePath(over)}/overview/certificates`;
    const pdfPath = (code) => `/api/courses/certificates/${code}/pdf`;

    // ---- Browsers -------------------------------------------------------------------

    const { browser, context, page: adminPage } = await openBrowser();
    const { context: lwAdaContext, page: lwAdaPage } = await newIdentityPage(browser);
    const { context: adaContext, page: adaPage } = await newIdentityPage(browser);
    const { context: cleoContext, page: cleoPage } = await newIdentityPage(browser);
    const { context: danContext, page: danPage } = await newIdentityPage(browser);
    const { context: strangerContext, page: strangerPage } = await newIdentityPage(browser);

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
    for (const pg of [lwAdaPage, adaPage, cleoPage, danPage, strangerPage]) await stubRecaptchaOnLoopback(pg, origin);
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

    /** The next request whose path ends `suffix`, by `method`: what the page sent. */
    const requestTo = (pg, suffix, method) =>
      pg.waitForRequest((r) => new URL(r.url()).pathname.endsWith(suffix) && r.method() === method, { timeout: WAIT_MS });

    /** A JSON answer that must be a success, read once. */
    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    /** Waits until a control can be pressed: a page's controls wait for it to hydrate. */
    const whenEnabled = async (locator, what) => {
      await waitFor(`${what} to be live`, async () => locator.isEnabled());
      return locator;
    };

    /** The main column's words, the page's own and nothing of the shell around it. */
    const mainText = async (pg) => textOf(pg.locator("main"));

    /** A stored instant, from a Timestamp. */
    const instantOf = (value) => (value && typeof value.toDate === "function" ? value.toDate() : null);

    // ---- Mail -----------------------------------------------------------------------

    /** The messages to one fixture address, oldest first, once there are `count`. */
    async function mailTo(address, count) {
      const summaries = await waitForMessagesTo(address, { count, timeoutMs: MAIL_WAIT_MS });
      return summaries.slice().reverse();
    }

    /** How many messages each of them has in Mailpit right now, by label. */
    const mailCounts = async () => {
      const out = {};
      for (const { label, account } of everybody) out[label] = (await messagesTo(account.email)).length;
      return out;
    };

    /** The admin's messages with exactly this subject: the tests this journey sent. The address is never printed. */
    const adminMail = async (subject) => {
      const found = [];
      for (const summary of await messagesTo(secrets.adminEmail)) {
        if ((summary.Subject ?? "") === subject) found.push(await readEmail(summary));
      }
      return found;
    };

    /** Neither half of an email names Group A's meeting link, nor its host. */
    function assertNoMeetingLink(email, who) {
      for (const [part, body] of [
        ["HTML", email.html],
        ["text", email.text],
      ]) {
        assert.ok(
          !body.includes(groupA.meetingUrl) && !body.includes(linkHost),
          `${who}'s ${part} part carries the meeting link. A link to join lives on the site only.`,
        );
      }
    }

    /** Every send log row to one address, by kind. */
    const sendKindsTo = async (address) =>
      (await fixtureQuery("emailSends").where("to", "==", address).get()).docs.map((doc) => String(doc.data()?.kind ?? "")).sort();

    // ---- The admin's pages ----------------------------------------------------------------

    /** Names a term's running run on its programme's Settings tab, as the admin does. */
    async function nameRun(aTerm) {
      await adminPage.goto(`${formBase(aTerm)}/setup`, { waitUntil: "domcontentloaded" });
      const panel = adminPage.getByRole("region", { name: "Course run" });
      const runBox = panel.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [response] = await Promise.all([
        responseTo(adminPage, `/programmes/${aTerm.programmeId}/run`, "PUT"),
        runBox.selectOption({ label: `${aTerm.runLabel} · Running` }),
      ]);
      const body = await okBody(response, "Naming the run");
      assert.equal(body.changed, true, "naming the run changed nothing");
      assert.equal(body.panel?.runId, aTerm.runId, "the panel names another run");
    }

    /** Appoints one account to one group on the Facilitators view, as the admin does, emailing nobody. */
    async function appointFacilitator(aTerm, group, person) {
      await adminPage.goto(`${formBase(aTerm)}/groups/facilitators`, { waitUntil: "domcontentloaded" });
      const card = adminPage.locator('section[aria-labelledby="facilitators-title"]');
      const groups = aTerm.groups.length;
      await card
        .getByText(`0 facilitators for ${groups} ${groups === 1 ? "group" : "groups"}`, { exact: true })
        .waitFor({ timeout: WAIT_MS });
      await card.getByRole("button", { name: `Change ${group.name}’s facilitators`, exact: true }).click();
      await card.getByPlaceholder("Search people…").fill(person.displayName);
      // The name whole: one term's run id is the start of the other's, so
      // "Fern Fixture <id>" is the start of the other Fern's name too.
      await card.getByRole("checkbox", { name: new RegExp(`${escapeRegExp(person.displayName)}(?![A-Za-z0-9])`) }).check();
      const [response] = await Promise.all([
        responseTo(adminPage, `/groups/${group.id}/facilitators`, "POST"),
        card.getByRole("button", { name: "Save", exact: true }).click(),
      ]);
      const body = await okBody(response, "Saving the facilitators");
      assert.deepEqual(body.facilitatorUids, [person.uid], "the group's facilitators are not the one ticked");
      await card.getByText(`${group.name}’s facilitators are saved. Nobody was emailed.`, { exact: true }).waitFor({ timeout: WAIT_MS });
    }

    // ---- A member's own answers ------------------------------------------------------

    /** This run's entry in the person's `/api/courses/me`, or null when it lists no such run. */
    async function myRun(pg, aTerm) {
      const answer = await fetchAs(pg, "/api/courses/me");
      assert.equal(answer.status, 200, `/api/courses/me answered ${answer.status}`);
      return (answer.body?.runs ?? []).find((entry) => entry.runId === aTerm.runId) ?? null;
    }

    // ---- The survey at the end ----------------------------------------------------------

    let surveyId = null;
    const surveyNow = async () => (await fixtureDoc("surveys", surveyId).get()).data() ?? null;
    const questionsIn = (survey) => (survey?.items ?? []).filter((item) => item.kind === "question").length;
    /** The person's own link to the survey, from their row: what their email and Home's card both open. */
    let lwAdaLink = null;

    // ---- The certificates ------------------------------------------------------------------

    /** The run's certificates, by `<uid>__<kind>`. */
    const certificatesNow = async () => {
      const out = new Map();
      for (const doc of (await fixtureQuery("courseCertificates").where("runId", "==", over.runId).get()).docs) {
        const data = doc.data() ?? {};
        out.set(`${data.uid}__${data.kind}`, data);
      }
      return out;
    };
    /** Ada's certificate's code, once the send has made it. */
    let adaCode = null;
    /** Eve's, whose link stays off. */
    let eveCode = null;

    try {
      await step("the admin approves everybody who signs in or is sent a certificate on this journey", async () => {
        activePage = adminPage;
        await signIn(adminPage, { email: secrets.adminEmail, password: secrets.adminPassword });
        for (const { label, account } of everybody) {
          await approvePendingApplicant(adminPage, origin, { email: account.email });
          const approved = await waitFor(`${label}'s account to say member`, async () => {
            const doc = await readUserDoc(account.uid);
            return doc && doc.role === "member" ? doc : null;
          });
          assert.ok(approved.approvedAt, `${label}'s approval left no approvedAt stamp`);
        }
        // Each approval sends one email, a moment after its card leaves the queue.
        for (const { account } of everybody) await mailTo(account.email, 1);
        assert.deepEqual(
          await mailCounts(),
          Object.fromEntries(everybody.map(({ label }) => [label, 1])),
          "approving emailed somebody twice, or nobody",
        );
      });

      await step("in the last week, the admin names the run and appoints its group's facilitator", async () => {
        activePage = adminPage;
        // The run's last session is today, by its own calendar, and every
        // register before it is finished.
        assert.equal(lastSession.weekNumber, lastWeek.weekCount, "the last week's session is not its sixth");
        await nameRun(lastWeek);
        await appointFacilitator(lastWeek, lwGroup, lwFern);
      });

      await step("the admin makes the survey at the end from its template, tests it on themselves and emails it to the person holding a place", async () => {
        activePage = adminPage;
        assert.equal(
          (await fixtureQuery("surveys").where("roundId", "==", lastWeek.formId).get()).size,
          0,
          "a survey of this programme exists already",
        );
        // New survey: the card for the survey at the end, the programme and the day it closes.
        await adminPage.goto(`${origin}/admin/surveys/new`, { waitUntil: "domcontentloaded" });
        const card = adminPage.getByRole("region", { name: SURVEY.card, exact: true });
        await card.waitFor({ timeout: WAIT_MS });
        await card.getByLabel("Programme", { exact: true }).selectOption({ label: `${lastWeek.programmeName} (${lastWeek.formLabel})` });
        await card.getByLabel("It closes on", { exact: true }).fill(closesOn);
        const make = await whenEnabled(card.getByRole("button", { name: "Make the survey", exact: true }), "Make the survey");
        const [request, response] = await Promise.all([
          adminPage.waitForRequest((r) => new URL(r.url()).pathname === "/api/surveys" && r.method() === "POST", { timeout: WAIT_MS }),
          responseTo(adminPage, "/api/surveys", "POST"),
          make.click(),
        ]);
        assert.deepEqual(
          request.postDataJSON(),
          { roundId: lastWeek.formId, programmeId: lastWeek.programmeId, stage: "after", closesOn, strand: null },
          "Make the survey sent something else",
        );
        surveyId = (await okBody(response, "Making the survey")).survey?.id ?? null;
        assert.ok(surveyId, "making the survey answered no survey");
        await adminPage.waitForURL(`${origin}/admin/surveys/${enc(surveyId)}/questions`, { timeout: WAIT_MS });
        // The record: the template's survey at the end, for this programme and its run, pairing with nothing.
        const made = await surveyNow();
        assert.deepEqual(
          {
            kind: made?.kind,
            title: made?.title,
            minutes: made?.minutes,
            audience: made?.audience,
            runId: made?.runId,
            pairOf: made?.pairOf ?? null,
            closesAt: instantOf(made?.closesAt)?.toISOString(),
            firstSentAt: made?.firstSentAt ?? null,
          },
          {
            kind: "after",
            title: SURVEY.title,
            minutes: SURVEY.minutes,
            audience: { kind: "programme", roundId: lastWeek.formId, programmeId: lastWeek.programmeId },
            runId: lastWeek.runId,
            pairOf: null,
            closesAt: closesAt.toISOString(),
            firstSentAt: null,
          },
          "the survey at the end as made",
        );
        const questions = questionsIn(made);
        assert.ok(questions > 0, "the survey at the end was made with no questions");
        const subject = SURVEY.subject(made.title, questions, lastWeek.programmeName);

        // The Send tab: the email waits for a test, which goes to the admin alone.
        await adminPage.goto(`${origin}/admin/surveys/${enc(surveyId)}/send`, { waitUntil: "domcontentloaded" });
        const send = adminPage.getByRole("region", { name: "Send", exact: true });
        await send.waitFor({ timeout: WAIT_MS });
        const emailButton = send.getByRole("button", { name: SURVEY.emailButton(1), exact: true });
        await emailButton.waitFor({ timeout: WAIT_MS });
        assert.equal(await emailButton.isDisabled(), true, "the survey can be sent before a test");
        assert.deepEqual(await adminMail(`[TEST] ${subject}`), [], "a test of this survey was in the admin's mailbox already");
        const testButton = await whenEnabled(send.getByRole("button", { name: SURVEY.test, exact: true }), SURVEY.test);
        const [tested] = await Promise.all([responseTo(adminPage, `/api/surveys/${surveyId}/test`, "POST"), testButton.click()]);
        const testBody = await okBody(tested, "Send a test to me");
        assert.deepEqual([testBody.delivery, testBody.recorded], ["sent", true], "the survey's test did not reach the admin, or was not recorded");
        const tests = await waitFor("the survey's test in the admin's mailbox", async () => {
          const found = await adminMail(`[TEST] ${subject}`);
          return found.length > 0 ? found : null;
        }, { timeout: MAIL_WAIT_MS });
        assert.equal(tests.length, 1, `the admin was sent ${tests.length} tests of this survey`);

        // The send, with the count on its button: the one person holding a place.
        await whenEnabled(emailButton, SURVEY.emailButton(1));
        const [sendRequest, sent] = await Promise.all([
          requestTo(adminPage, `/api/surveys/${surveyId}/send`, "POST"),
          responseTo(adminPage, `/api/surveys/${surveyId}/send`, "POST"),
          emailButton.click(),
        ]);
        assert.deepEqual(sendRequest.postDataJSON(), { to: "everyone", emails: 1 }, "the send did not carry the number on its button");
        const tally = await okBody(sent, "Email 1 person");
        assert.deepEqual(
          [tally.sent, tally.held, tally.suppressed, tally.failed, tally.noAddress],
          [1, 0, 0, 0, 0],
          "the send's tally",
        );
        // Ada's row: sent, not answered, with a secret of her own.
        const rows = (await fixtureQuery("surveyPeople").where("surveyId", "==", surveyId).get()).docs.map((doc) => doc.data());
        assert.equal(rows.length, 1, `the survey went to ${rows.length} people`);
        const [row] = rows;
        assert.deepEqual(
          [row.respondent, row.delivery, row.answered],
          [{ kind: "account", uid: lwAda.uid }, "sent", false],
          "Ada's row on the survey",
        );
        assert.match(row.token, /^[A-Za-z0-9_-]{43}$/, "Ada's link's secret is not 32 random bytes");
        lwAdaLink = `/survey/${row.token}`;
        // Her email: the survey's subject, and her own link.
        const [, email] = await mailTo(lwAda.email, 2);
        const read = await readEmail(email);
        assert.equal(read.subject, subject, "Ada's survey email has another subject");
        assert.ok(read.links.includes(`${origin}${lwAdaLink}`), `Ada's survey email does not carry her own link: ${JSON.stringify(read.links)}`);
        assert.equal((await messagesTo(lwFern.email)).length, 1, "the survey reached the group's facilitator");
      });

      await step("on the day of the last session, Home says tonight is the last session and shows the survey at the end", async () => {
        activePage = lwAdaPage;
        // The clock as Home reads it. The last session is still to come (or
        // still going, after midnight), and the run is in its sixth week.
        const now = new Date();
        assert.ok(
          now.getTime() < lastSession.endsAt.getTime(),
          `the last session ended at ${lastSession.endsAt.toISOString()}, before Home was read at ${now.toISOString()}: ` +
            "the term was seeded too close to midnight for its last session to be read.",
        );
        const todayKey = londonDateKey(now);
        const daysIn = Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${lastWeek.startDate}T00:00:00Z`)) / 86_400_000);
        assert.ok(daysIn >= 35 && daysIn <= 41, `the run is ${daysIn} days in, which is not its last week`);
        const isToday = todayKey === lastSession.dateKey;
        const survey = await surveyNow();

        await signIn(lwAdaPage, lwAda);
        await lwAdaPage.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
        // The ticket: tonight, the last session, the group's hours.
        const ticket = lwAdaPage.getByRole("region", { name: "Your next session", exact: true });
        const eyebrow = isToday ? LAST_WEEK_WORDS.tonight : LAST_WEEK_WORDS.before(lastWeek.weekCount);
        await ticket.getByText(eyebrow, { exact: true }).waitFor({ timeout: WAIT_MS });
        const [hour, minute] = lwGroup.startTimeLocal.split(":").map(Number);
        const endsAt = (hour * 60 + minute + lwGroup.durationMinutes) % 1440;
        const endClock = `${String(Math.floor(endsAt / 60)).padStart(2, "0")}:${String(endsAt % 60).padStart(2, "0")}`;
        assert.equal(
          await textOf(ticket.getByRole("heading", { level: 2 })),
          `${lwGroup.name}, ${clockWords(lwGroup.startTimeLocal)} to ${clockWords(endClock)}`,
          "Home's ticket is not the group's last session",
        );

        // The survey at the end, under it: when to answer it, what it asks,
        // how long, who steps out, the person's own link and when it closes.
        const card = lwAdaPage.getByRole("region", { name: END_SURVEY.heading, exact: true });
        await card.waitFor({ timeout: WAIT_MS });
        const line = endSurveyLine({
          when: isToday ? "tonight" : { day: dayLabel(lastSession.dateKey) },
          questions: questionsIn(survey),
          minutes: survey.minutes,
          facilitators: [lwFern.first],
          online: false,
        });
        await card.getByText(line, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(
          await card.getByRole("link", { name: END_SURVEY.open, exact: true }).getAttribute("href"),
          lwAdaLink,
          "Open the survey is not Ada's own link",
        );
        await card.getByText(END_SURVEY.closesOn(dayLabel(closesOn)), { exact: true }).waitFor({ timeout: WAIT_MS });
        // Moved from the top of Home: one survey, one card.
        assert.equal(await lwAdaPage.getByText(LAST_WEEK_WORDS.topCard, { exact: true }).count(), 0, "Home also draws the survey at the top");

        // After tonight: the certificate line.
        const after = lwAdaPage.getByRole("region", { name: isToday ? LAST_WEEK_WORDS.afterTonight : LAST_WEEK_WORDS.afterLast, exact: true });
        await after.getByText(LAST_WEEK_WORDS.certificateLine, { exact: true }).waitFor({ timeout: WAIT_MS });

        // What's next, as the term's forms stand: held to the overview route's own answer.
        const overview = await fetchAs(lwAdaPage, `/api/courses/runs/${enc(lastWeek.runId)}/overview`);
        assert.equal(overview.status, 200, `the run's overview answered Ada ${overview.status}`);
        const nextLines = whatsNextLines(overview.body?.whatsNext ?? null);
        const next = lwAdaPage.getByRole("region", { name: WHATS_NEXT, exact: true });
        if (nextLines.length === 0) {
          assert.equal(await next.count(), 0, "What’s next is drawn with nothing to say");
        } else {
          for (const each of nextLines) await next.getByText(each, { exact: true }).waitFor({ timeout: WAIT_MS });
        }

        // In the board's order: the ticket, the survey, after tonight, what's next.
        assertInOrder(
          await mainText(lwAdaPage),
          [
            eyebrow,
            END_SURVEY.heading,
            isToday ? LAST_WEEK_WORDS.afterTonight : LAST_WEEK_WORDS.afterLast,
            ...(nextLines.length > 0 ? [WHATS_NEXT] : []),
          ],
          "Home in the last week",
        );

        // The card opens the survey itself.
        await card.getByRole("link", { name: END_SURVEY.open, exact: true }).click();
        await lwAdaPage.waitForURL((url) => url.pathname === lwAdaLink, { timeout: WAIT_MS });
        await lwAdaPage.getByRole("heading", { level: 1, name: survey.title, exact: true }).waitFor({ timeout: WAIT_MS });
      });

      await step("after the last session, the admin names the run, sets the rule for who finished on Settings and appoints Group A's facilitator", async () => {
        activePage = adminPage;
        // The run's last session is over, by its own calendar.
        assert.ok(overLast.endsAt.getTime() < Date.now(), "the run past its end has a session still to come");
        await nameRun(over);
        // Settings again: the rule's card is drawn once the programme names its run.
        await adminPage.goto(`${formBase(over)}/setup`, { waitUntil: "domcontentloaded" });
        const rule = adminPage.getByRole("region", { name: FINISHING.card, exact: true });
        await rule.waitFor({ timeout: WAIT_MS });
        await rule.getByText(FINISHING.hint, { exact: true }).waitFor({ timeout: WAIT_MS });
        const box = rule.getByLabel(FINISHING.label, { exact: true });
        assert.equal(await box.inputValue(), "", "the rule's box holds a number before anybody set one");
        // The box is read only until the page is live, so nothing typed is written over.
        await waitFor("the rule's box to be live", async () => box.isEditable());
        const [request, response] = await Promise.all([
          requestTo(adminPage, `${apiBase(over)}/finishing/rule`, "PUT"),
          responseTo(adminPage, `${apiBase(over)}/finishing/rule`, "PUT"),
          box.fill(String(AT_LEAST)),
        ]);
        assert.deepEqual(request.postDataJSON(), { atLeast: AT_LEAST }, "the rule's card sent something else");
        const body = await okBody(response, "Setting the rule");
        assert.deepEqual(body.rule, { atLeast: AT_LEAST, sessions: over.weekCount }, "the rule as stored");
        await rule.getByText("Saved", { exact: true }).waitFor({ timeout: WAIT_MS });
        const stored = (await fixtureDoc("courseFinishing", over.runId).get()).data();
        assert.deepEqual([stored?.kind, stored?.runId, stored?.atLeast], ["rule", over.runId, AT_LEAST], "the stored rule");
        await appointFacilitator(over, groupA, fern);
      });

      /** The section's rows in the page, as a list of each row's cells. */
      const readRows = async (section) => {
        const out = [];
        const rows = section.locator("tbody tr");
        for (let at = 0; at < (await rows.count()); at += 1) out.push(await textsOf(rows.nth(at).locator("td")));
        return out;
      };

      /** Every switch in the section, as `[name, checked]`, in the list's order. */
      const switchesOf = async (section) => {
        const out = [];
        const switches = section.getByRole("switch");
        for (let at = 0; at < (await switches.count()); at += 1) {
          const one = switches.nth(at);
          out.push([await one.getAttribute("aria-label"), await one.isChecked()]);
        }
        return out;
      };

      /**
       * Who finished, held to the registers, the rule and the lead's switches:
       * the counts, the rows fewest sessions first with what each came to and
       * missed, each switch, the one who left apart with the day, and the
       * counts agreeing with the switches.
       */
      async function assertWhoFinished(section, finished) {
        const not = listed.length - finished.length;
        await section.getByText(FINISHING.sentence(AT_LEAST, over.weekCount), { exact: true }).waitFor({ timeout: WAIT_MS });
        await section.getByText(FINISHING.counts(finished.length, not), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.deepEqual(await textsOf(section.locator("thead th")), FINISHING.columns, "the section's columns");
        await section.getByText(FINISHING.caption, { exact: true }).waitFor({ timeout: WAIT_MS });
        const rows = await readRows(section);
        assert.equal(rows.length, listed.length + 2, `the section has ${rows.length} rows: ${JSON.stringify(rows)}`);
        for (const [at, person] of listed.entries()) {
          const [who, group, came, written] = rows[at];
          const line = lineOf(person) ?? "";
          assert.ok(
            who.endsWith(`${person.displayName}${line}`),
            `row ${at + 1} is not ${person.displayName} with ${JSON.stringify(line)}: ${who}`,
          );
          assert.deepEqual(
            [group, came, written],
            [groupOf(person.groupKey).name, `${cameOf(person)} of ${markedOf(person)}`, FINISHING.noneSet],
            `${person.first}'s row`,
          );
        }
        // Who left: listed apart, with the day, and no switch.
        assert.equal(rows[listed.length][0], FINISHING.leftHead, "the section does not list who left apart");
        const [leftWho, leftGroup, , , leftDay] = rows[listed.length + 1];
        assert.ok(leftWho.endsWith(dan.displayName), `the person listed as having left is not Dan: ${leftWho}`);
        assert.deepEqual([leftGroup, leftDay], [groupOf(dan.groupKey).name, FINISHING.left(danLeftDay)], "Dan's row as somebody who left");
        // Each switch, and the counts agreeing with them.
        const switches = await switchesOf(section);
        assert.deepEqual(
          switches,
          listed.map((person) => [FINISHING.switchName(person.displayName), finished.includes(person)]),
          "the switches",
        );
        assert.deepEqual(
          [switches.filter(([, on]) => on).length, switches.filter(([, on]) => !on).length],
          [finished.length, not],
          "the counts do not agree with the list",
        );
        // "Changed by you" beside the switch the lead turned, and nowhere else.
        for (const person of listed) {
          // The row with this person's switch: its name is "Finished: " and their whole name as the admin is shown it.
          const row = section
            .locator("tbody tr")
            .filter({ has: adminPage.getByRole("switch", { name: FINISHING.switchName(person.displayName), exact: true }) });
          assert.equal(
            await row.getByText(FINISHING.changedByYou, { exact: true }).count(),
            person === ticked && finished.includes(ticked) ? 1 : 0,
            `${person.first}'s switch says who changed it, or does not`,
          );
        }
      }

      await step("the Overview lists who finished by the rule, the one who left apart, and a switch the lead turns keeps the counts and the list agreeing", async () => {
        activePage = adminPage;
        await adminPage.goto(`${formBase(over)}/overview`, { waitUntil: "domcontentloaded" });
        // The head: finished on the last session's day, and how many stayed to the end.
        await adminPage.getByText(FINISHING.head(dayLabel(overLast.dateKey)), { exact: true }).waitFor({ timeout: WAIT_MS });
        await adminPage.getByText(FINISHING.stayed(stayed.length), { exact: true }).waitFor({ timeout: WAIT_MS });
        const section = adminPage.getByRole("region", { name: FINISHING.card, exact: true });
        await section.waitFor({ timeout: WAIT_MS });
        await assertWhoFinished(section, stayed.filter(byRule));

        // The lead ticks one more: saved at once, from the keyboard, and the
        // answer is the section as the server now has it.
        const toggle = await whenEnabled(
          section.getByRole("switch", { name: FINISHING.switchName(ticked.displayName), exact: true }),
          `${ticked.first}'s switch`,
        );
        const [request, response] = await Promise.all([
          requestTo(adminPage, `${apiBase(over)}/finishing`, "PUT"),
          responseTo(adminPage, `${apiBase(over)}/finishing`, "PUT"),
          toggle.press("Space"),
        ]);
        assert.deepEqual(request.postDataJSON(), { uid: ticked.uid, finished: true }, "the switch sent something else");
        const body = await okBody(response, "Turning the switch");
        assert.equal(body.model?.counts, FINISHING.counts(finishers.length, listed.length - finishers.length), "the section the switch answered with");
        await assertWhoFinished(section, finishers);
        // Stored where it differs from the rule, with who pressed it.
        const decision = (await fixtureDoc("courseFinishing", `${over.runId}__${ticked.uid}`).get()).data();
        assert.deepEqual(
          [decision?.kind, decision?.runId, decision?.uid, decision?.finished, decision?.byUid],
          ["person", over.runId, ticked.uid, true, over.adminUid],
          "the lead's decision as stored",
        );
        assert.equal(
          (await fixtureQuery("courseFinishing").where("runId", "==", over.runId).get()).size,
          2,
          "who finished stores something besides the rule and the one decision",
        );
        // And so after a reload.
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        await assertWhoFinished(adminPage.getByRole("region", { name: FINISHING.card, exact: true }), finishers);
      });

      await step("Send a test to me emails the lead the first certificate's email, marked as a test, and unlocks the send", async () => {
        activePage = adminPage;
        const certs = adminPage.getByRole("region", { name: CERTIFICATE.section, exact: true });
        await certs.getByText(CERTIFICATE.counts(finishers.length, 1), { exact: true }).waitFor({ timeout: WAIT_MS });
        // The first person owed one, in the order of whole names, is whose
        // certificate and email the preview and the test are.
        const first = owed[0].person;
        assert.equal(
          await certs.getByRole("link", { name: CERTIFICATE.preview(first.displayName), exact: true }).getAttribute("href"),
          `${previewPath}#page`,
          "the thumbnail does not open the preview of the first certificate",
        );
        await certs.getByText(CERTIFICATE.theEmail, { exact: true }).waitFor({ timeout: WAIT_MS });
        await certs.getByText(CERTIFICATE.subject(over.programmeName), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(
          await certs.getByRole("link", { name: CERTIFICATE.previewLink, exact: true }).getAttribute("href"),
          `${previewPath}#email`,
          "Preview does not open the email's preview",
        );
        const send = certs.getByRole("button", { name: CERTIFICATE.send(owed.length), exact: true });
        await send.waitFor({ timeout: WAIT_MS });
        assert.equal(await send.isDisabled(), true, "the certificates can be sent before a test");
        for (const words of [CERTIFICATE.testFirst, CERTIFICATE.emails(owed.length), CERTIFICATE.notFinished]) {
          await certs.getByText(words, { exact: true }).waitFor({ timeout: WAIT_MS });
        }

        // The preview: the first certificate as its page will show it to its owner, link off, and its email.
        await adminPage.goto(`${origin}${previewPath}`, { waitUntil: "domcontentloaded" });
        const pageRegion = adminPage.getByRole("region", { name: CERTIFICATE.previewTitle(first.displayName), exact: true });
        await pageRegion.getByText(CERTIFICATE.previewNote, { exact: true }).waitFor({ timeout: WAIT_MS });
        const face = pageRegion.getByRole("group", { name: CERTIFICATE.label(first.displayName), exact: true });
        const faceSaid = await textOf(face);
        assertInOrder(
          faceSaid,
          [
            CERTIFICATE.eyebrow(over.formLabel),
            first.displayName,
            CERTIFICATE.did.finished,
            over.programmeName,
            `${over.weekCount} weeks`,
            CERTIFICATE.issued(issuedWords(new Date(), { year: true })),
          ],
          "the preview's certificate",
        );
        assert.ok(!faceSaid.includes("Check it at"), "the preview's certificate says where to check it, with its link off");
        await adminPage
          .getByRole("region", { name: CERTIFICATE.theEmail, exact: true })
          .getByText(CERTIFICATE.subject(over.programmeName), { exact: true })
          .waitFor({ timeout: WAIT_MS });

        // The test, from the Overview: the first person's email, marked as a test, to the admin alone.
        await adminPage.goto(`${formBase(over)}/overview`, { waitUntil: "domcontentloaded" });
        const testSubject = `[TEST] ${CERTIFICATE.subject(over.programmeName)}`;
        assert.deepEqual(await adminMail(testSubject), [], "a test of these certificates was in the admin's mailbox already");
        const test = await whenEnabled(certs.getByRole("button", { name: CERTIFICATE.test, exact: true }), CERTIFICATE.test);
        const [response] = await Promise.all([responseTo(adminPage, `${apiBase(over)}/certificates/test`, "POST"), test.click()]);
        const body = await okBody(response, "Send a test to me");
        assert.deepEqual([body.delivery, body.subject], ["sent", testSubject], "the test did not reach the admin");
        await certs.getByText(CERTIFICATE.testSaid(testSubject), { exact: true }).waitFor({ timeout: WAIT_MS });
        await whenEnabled(send, CERTIFICATE.send(owed.length));
        assert.equal(await certs.getByText(CERTIFICATE.testFirst, { exact: true }).count(), 0, "the send still says to test first");
        const marker = (await fixtureDoc("courseNudges", `certificatestest__${over.runId}__${over.adminUid}`).get()).data();
        assert.deepEqual([marker?.kind, marker?.runId, marker?.byUid], ["certificates-test", over.runId, over.adminUid], "the test's record");

        const tests = await waitFor("the certificates' test in the admin's mailbox", async () => {
          const found = await adminMail(testSubject);
          return found.length > 0 ? found : null;
        }, { timeout: MAIL_WAIT_MS });
        assert.equal(tests.length, 1, `the admin was sent ${tests.length} tests of these certificates`);
        const [email] = tests;
        const back = `${origin}${previewPath}#page`;
        assertSays(email, {
          who: "The certificates' test",
          sentences: [
            `Hi ${first.first},`,
            CERTIFICATE.finishedLead(over.programmeName),
            CERTIFICATE.see,
            CERTIFICATE.after,
            CERTIFICATE.signOff,
            `${CERTIFICATE.pasteIt} ${back}`,
            FOOTER,
          ],
        });
        assert.ok(email.links.includes(back), `the test's button does not open the preview: ${JSON.stringify(email.links)}`);
        assertNoMeetingLink(email, "The certificates' test");
        // Nobody else was emailed by it, and no certificate exists yet.
        assert.deepEqual(
          await mailCounts(),
          { ...Object.fromEntries(everybody.map(({ label }) => [label, 1])), "Ada (last week)": 2 },
          "the test reached somebody besides the admin",
        );
        assert.equal((await certificatesNow()).size, 0, "the test made a certificate");
      });

      await step("the send emails each person who finished and the group's facilitator once, as the button's counts said", async () => {
        activePage = adminPage;
        const certs = adminPage.getByRole("region", { name: CERTIFICATE.section, exact: true });
        const send = await whenEnabled(
          certs.getByRole("button", { name: CERTIFICATE.send(owed.length), exact: true }),
          CERTIFICATE.send(owed.length),
        );
        const [request, response] = await Promise.all([
          requestTo(adminPage, `${apiBase(over)}/certificates`, "POST"),
          responseTo(adminPage, `${apiBase(over)}/certificates`, "POST"),
          send.click(),
        ]);
        assert.deepEqual(
          request.postDataJSON(),
          { certificates: owed.length, emails: owed.length },
          "the send did not carry the two numbers it showed",
        );
        const body = await okBody(response, CERTIFICATE.send(owed.length));
        assert.deepEqual(body.report, { sent: owed.length, held: 0, suppressed: 0, failed: [], noAddress: [] }, "the send's report");
        assert.deepEqual(body.said, [CERTIFICATE.sent(owed.length)], "what the send said");
        await certs.getByText(CERTIFICATE.sent(owed.length), { exact: true }).waitFor({ timeout: WAIT_MS });
        await certs.getByText(CERTIFICATE.allSent, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await certs.getByRole("button", { name: /^Send \d/ }).count(), 0, "the section still offers a send");

        // One certificate a person and kind, each with a code of its own, its link off, its email sent.
        const made = await certificatesNow();
        assert.deepEqual(
          [...made.keys()].sort(),
          owed.map(({ person, kind }) => `${person.uid}__${kind}`).sort(),
          "the certificates made are not one for each person who finished and the facilitator",
        );
        const codes = new Set();
        for (const { person, kind } of owed) {
          const cert = made.get(`${person.uid}__${kind}`);
          const issuedAt = instantOf(cert.issuedAt);
          assert.ok(issuedAt, `${person.first}'s certificate has no issue time`);
          assert.match(cert.code, CODE_SHAPE, `${person.first}'s certificate's code is not sixteen characters of the alphabet`);
          codes.add(cert.code);
          assert.deepEqual(
            [cert.runId, cert.linkOn, cert.email?.state],
            [over.runId, false, "sent"],
            `${person.first}'s certificate's run, link and email`,
          );
          assert.deepEqual(
            cert.snapshot,
            {
              name: person.displayName,
              did: CERTIFICATE.did[kind],
              programme: over.programmeName,
              term: over.formLabel,
              weeks: `${over.weekCount} weeks`,
              credit: null,
              issuedOn: issuedWords(issuedAt, { year: true }),
            },
            `what ${person.first}'s certificate says`,
          );
        }
        assert.equal(codes.size, owed.length, "two certificates share a code");
        adaCode = made.get(`${ada.uid}__finished`).code;
        eveCode = made.get(`${eve.uid}__finished`).code;

        // Each person sent one email, once, with a button to their own certificate's page.
        for (const { person, kind } of owed) {
          const summaries = await mailTo(person.email, 2);
          const email = await readEmail(summaries[summaries.length - 1]);
          const code = made.get(`${person.uid}__${kind}`).code;
          const page = `${origin}/c/${code}`;
          assert.equal(email.subject, CERTIFICATE.subject(over.programmeName), `${person.first}'s certificate email's subject`);
          assertSays(email, {
            who: `${person.first}'s certificate email`,
            sentences: [
              `Hi ${person.first},`,
              kind === "finished" ? CERTIFICATE.finishedLead(over.programmeName) : CERTIFICATE.facilitatedLead(over.programmeName),
              CERTIFICATE.see,
              CERTIFICATE.after,
              CERTIFICATE.signOff,
              `${CERTIFICATE.pasteIt} ${page}`,
              FOOTER,
            ],
          });
          assert.equal(email.words.split(CERTIFICATE.see).length - 1, 1, `${person.first}'s email has more than one button`);
          assert.deepEqual([...new Set(email.links.filter((link) => link.includes("/c/")))], [page], `${person.first}'s email links to another certificate`);
          assertNoMeetingLink(email, `${person.first}'s certificate email`);
        }
        // Once each: the people who finished and the facilitator have two
        // emails (their approval and their certificate), and nobody else a
        // second (counted again, after every later step, at the end).
        assert.deepEqual(
          await mailCounts(),
          { "Ada (last week)": 2, "Fern (last week)": 1, Ada: 2, Cleo: 1, Dan: 1, Eve: 2, Fern: 2 },
          "the certificates reached somebody twice, or somebody who is owed none",
        );
      });

      await step("a person who finished reads that they finished, their certificate and what they keep on their programme page", async () => {
        activePage = adaPage;
        await signIn(adaPage, ada);
        await adaPage.goto(`${origin}${learnPath(over)}`, { waitUntil: "domcontentloaded" });
        // The head: that Ada finished, the term, her group and its facilitator.
        await adaPage
          .getByRole("heading", { level: 1, name: AFTER.finished(over.programmeName), exact: true })
          .waitFor({ timeout: WAIT_MS });
        await adaPage
          .locator("main header")
          .getByText([over.runLabel, groupA.name, `with ${fern.first}`].join(" · "), { exact: true })
          .waitFor({ timeout: WAIT_MS });
        // Her certificate: issued, private, and the way to its page.
        const card = adaPage.getByRole("region", { name: CERTIFICATE.card, exact: true });
        await card.waitFor({ timeout: WAIT_MS });
        const issuedAt = instantOf((await certificatesNow()).get(`${ada.uid}__finished`).issuedAt);
        await card.getByText(CERTIFICATE.cardIssued(issuedWords(issuedAt, { year: false })), { exact: true }).waitFor({ timeout: WAIT_MS });
        await card.getByText(CERTIFICATE.cardPrivate, { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(
          await card.getByRole("link", { name: CERTIFICATE.see, exact: true }).getAttribute("href"),
          `/c/${adaCode}`,
          "See your certificate does not open Ada's certificate",
        );
        await card.getByRole("link", { name: CERTIFICATE.linkedIn }).waitFor({ timeout: WAIT_MS });
        // What she keeps: the reading list of every week, at the page that holds it.
        const keep = adaPage.getByRole("region", { name: AFTER.keep, exact: true });
        const reading = keep.getByRole("link", { name: AFTER.readingList(over.weekCount), exact: true });
        assert.equal(await reading.getAttribute("href"), `${learnPath(over)}/reading`, "the reading list is kept somewhere else");
        assert.equal(await keep.getByRole("link").count(), 1, "What you keep lists something with no page of its own");
        const said = await mainText(adaPage);
        assertInOrder(said, [AFTER.finished(over.programmeName), CERTIFICATE.card, AFTER.keep], "Ada's programme page");
        for (const words of [AFTER.ended(over.programmeName), AFTER.thanks]) {
          assert.ok(!said.includes(words), `Ada's programme page says ${JSON.stringify(words)}`);
        }
        // Her own answers say she finished.
        assert.equal((await myRun(adaPage, over))?.finished, true, "/api/courses/me does not say Ada finished");
      });

      await step("the owner turns the certificate's link on, and downloads its PDF", async () => {
        activePage = adaPage;
        await adaPage.getByRole("region", { name: CERTIFICATE.card, exact: true }).getByRole("link", { name: CERTIFICATE.see, exact: true }).click();
        await adaPage.waitForURL((url) => url.pathname === `/c/${adaCode}`, { timeout: WAIT_MS });
        await adaPage.getByRole("heading", { level: 1, name: ada.displayName, exact: true }).waitFor({ timeout: WAIT_MS });
        await adaPage.getByText(`${host}/c/${adaCode}`, { exact: true }).waitFor({ timeout: WAIT_MS });
        const face = adaPage.getByRole("group", { name: CERTIFICATE.label(ada.displayName), exact: true });
        const issuedAt = instantOf((await certificatesNow()).get(`${ada.uid}__finished`).issuedAt);
        const words = [
          CERTIFICATE.eyebrow(over.formLabel),
          ada.displayName,
          CERTIFICATE.did.finished,
          over.programmeName,
          `${over.weekCount} weeks`,
          CERTIFICATE.issued(issuedWords(issuedAt, { year: true })),
        ];
        assertInOrder(await textOf(face), words, "Ada's certificate, to its owner");
        assert.ok(!(await textOf(face)).includes("Check it at"), "the certificate says where to check it with its link off");
        // What only she sees.
        const mine = adaPage.getByRole("region", { name: CERTIFICATE.onlyYou, exact: true });
        const download = mine.getByRole("link", { name: CERTIFICATE.download, exact: true });
        assert.equal(await download.getAttribute("href"), pdfPath(adaCode), "Download PDF goes somewhere else");
        assert.notEqual(await download.getAttribute("download"), null, "Download PDF does not download");
        await mine.getByRole("link", { name: CERTIFICATE.linkedIn }).waitFor({ timeout: WAIT_MS });
        await mine.getByRole("button", { name: CERTIFICATE.copy, exact: true }).waitFor({ timeout: WAIT_MS });
        const linkSwitch = mine.getByRole("switch", { name: CERTIFICATE.linkSwitch, exact: true });
        assert.equal(await linkSwitch.isChecked(), false, "the certificate's link is on before its owner turned it on");

        // She turns the link on, from the keyboard (the switch shows what the
        // server stored, so it moves once the answer is in): the page then
        // says where to check it.
        await whenEnabled(linkSwitch, "the link's switch");
        const [request, response] = await Promise.all([
          requestTo(adaPage, `/api/courses/certificates/${adaCode}`, "PUT"),
          responseTo(adaPage, `/api/courses/certificates/${adaCode}`, "PUT"),
          linkSwitch.press("Space"),
        ]);
        assert.deepEqual(request.postDataJSON(), { linkOn: true }, "the switch sent something else");
        assert.deepEqual(await okBody(response, "Turning the link on"), { ok: true, linkOn: true }, "the switch's answer");
        await face.getByText(CERTIFICATE.check(host, adaCode), { exact: true }).waitFor({ timeout: WAIT_MS });
        assert.equal(await mine.getByRole("switch", { name: CERTIFICATE.linkSwitch, exact: true }).isChecked(), true, "the switch is off again");
        assert.equal((await certificatesNow()).get(`${ada.uid}__finished`).linkOn, true, "the stored link is still off");

        // The PDF: hers to download, as an attachment nothing keeps or indexes.
        const file = await fetchFileAs(adaPage, pdfPath(adaCode));
        assert.deepEqual(
          {
            status: file.status,
            type: file.type,
            disposition: file.disposition,
            cache: file.cache,
            robots: file.robots,
            head: file.head,
          },
          {
            status: 200,
            type: "application/pdf",
            disposition: `attachment; filename="${CERTIFICATE.pdfName(adaCode)}"`,
            cache: "private, no-store",
            robots: "noindex",
            head: "%PDF-",
          },
          "the certificate's PDF, to its owner",
        );
        assert.equal(Number(file.length), file.size, "the PDF's length is not what it says");
        const [saved] = await Promise.all([adaPage.waitForEvent("download", { timeout: WAIT_MS }), download.click()]);
        assert.equal(saved.suggestedFilename(), CERTIFICATE.pdfName(adaCode), "the PDF downloads under another name");
        assert.equal(await saved.failure(), null, "the PDF did not download");
      });

      await step("a stranger sees only what the certificate says, cannot download it, and a link that is off shows nothing", async () => {
        activePage = strangerPage;
        // Signed out, with the link on: the certificate and nothing else.
        await strangerPage.goto(`${origin}/c/${adaCode}`, { waitUntil: "domcontentloaded" });
        await strangerPage.getByRole("heading", { level: 1, name: ada.displayName, exact: true }).waitFor({ timeout: WAIT_MS });
        const issuedAt = instantOf((await certificatesNow()).get(`${ada.uid}__finished`).issuedAt);
        const said = await mainText(strangerPage);
        assertInOrder(
          said,
          [
            `${host}/c/${adaCode}`,
            CERTIFICATE.eyebrow(over.formLabel),
            ada.displayName,
            CERTIFICATE.did.finished,
            over.programmeName,
            `${over.weekCount} weeks`,
            CERTIFICATE.issued(issuedWords(issuedAt, { year: true })),
            CERTIFICATE.check(host, adaCode),
          ],
          "Ada's certificate, to a stranger",
        );
        for (const words of [CERTIFICATE.onlyYou, CERTIFICATE.download, CERTIFICATE.linkedIn, CERTIFICATE.linkSwitch, CERTIFICATE.copy, ada.email]) {
          assert.ok(!said.includes(words), `a stranger reads ${JSON.stringify(words)} on Ada's certificate`);
        }
        assert.equal(await strangerPage.getByRole("region", { name: CERTIFICATE.onlyYou }).count(), 0, "a stranger is shown the owner's controls");
        // The PDF is its owner's alone: refused signed out.
        const signedOut = await fetchFileAs(strangerPage, pdfPath(adaCode));
        assert.equal(signedOut.status, 401, `the PDF answered somebody signed out ${signedOut.status}`);

        // A certificate whose link is off shows nothing, the same as a code nobody has.
        const calm = async (code) => {
          await strangerPage.goto(`${origin}/c/${code}`, { waitUntil: "domcontentloaded" });
          await strangerPage.getByRole("heading", { level: 1, name: CERTIFICATE.calmTitle, exact: true }).waitFor({ timeout: WAIT_MS });
          return mainText(strangerPage);
        };
        const linkOff = await calm(eveCode);
        assertInOrder(linkOff, [CERTIFICATE.calmTitle, CERTIFICATE.calmBody, CERTIFICATE.calmSignIn], "a certificate whose link is off");
        assert.ok(!linkOff.includes(eve.displayName), "a certificate whose link is off names its owner");
        assert.equal(await calm("0000000000000000"), linkOff, "a link that is off says something a code nobody has does not");

        // Signed in as somebody else, the PDF is refused all the same.
        activePage = cleoPage;
        await signIn(cleoPage, cleo);
        const signedIn = await fetchAs(cleoPage, pdfPath(adaCode));
        assert.deepEqual([signedIn.status, signedIn.body?.error], [404, CERTIFICATE.notHere], "the PDF was not refused to somebody else");
      });

      await step("a person who did not finish reads that the programme has ended, and is told nothing about finishing and sent nothing", async () => {
        activePage = cleoPage;
        await cleoPage.goto(`${origin}${learnPath(over)}`, { waitUntil: "domcontentloaded" });
        // That the programme has ended, the thanks, her term and group, and nothing about finishing.
        await cleoPage
          .getByRole("heading", { level: 1, name: AFTER.ended(over.programmeName), exact: true })
          .waitFor({ timeout: WAIT_MS });
        await cleoPage
          .locator("main header")
          .getByText(`${AFTER.thanks} ${over.runLabel} · ${groupB.name}.`, { exact: true })
          .waitFor({ timeout: WAIT_MS });
        await cleoPage.getByRole("region", { name: AFTER.keep, exact: true }).waitFor({ timeout: WAIT_MS });
        const said = await mainText(cleoPage);
        for (const told of TOLD_NOT_FINISHED) assert.ok(!told.test(said), `Cleo's programme page says ${told}: ${said}`);
        assert.equal(await cleoPage.getByRole("region", { name: CERTIFICATE.card }).count(), 0, "Cleo is shown a certificate");
        assert.ok(!said.includes(CERTIFICATE.cardPrivate), "Cleo's programme page talks about a certificate");
        // Her own answers say nothing about finishing, and nobody sent her a certificate.
        assert.equal((await myRun(cleoPage, over))?.finished, false, "/api/courses/me says Cleo finished");
        assert.equal((await certificatesNow()).has(`${cleo.uid}__finished`), false, "Cleo was made a certificate");
        assert.equal((await messagesTo(cleo.email)).length, 1, "Cleo was emailed after her approval");
      });

      await step("somebody who left reads only that they left, and nothing of the programme's end", async () => {
        activePage = danPage;
        await signIn(danPage, dan);
        await danPage.goto(`${origin}${learnPath(over)}`, { waitUntil: "domcontentloaded" });
        await danPage
          .getByRole("heading", { level: 1, name: LEFT.heading(over.programmeName), exact: true })
          .waitFor({ timeout: WAIT_MS });
        assert.equal(new URL(danPage.url()).pathname, learnPath(over), "the page that says Dan left is not at the programme's address");
        // That he left, when, and what to do if it was a mistake: nothing else at all.
        assert.equal(
          await mainText(danPage),
          [
            LEFT.myProgrammes,
            over.programmeName,
            LEFT.heading(over.programmeName),
            LEFT.on(danLeftDay),
            LEFT.changedYourMind,
            LEFT.changedLine,
          ].join(""),
          "the page that says Dan left says more, or less, than that he left and when",
        );
        // No end of the programme for him: no run on his list, no certificate, no email.
        assert.equal(await myRun(danPage, over), null, "/api/courses/me still lists the run Dan left");
        assert.equal((await certificatesNow()).has(`${dan.uid}__finished`), false, "Dan was made a certificate");
        assert.equal((await messagesTo(dan.email)).length, 1, "Dan was emailed after his approval");
      });

      await step("every email went to the send log, and none carries the meeting link", async () => {
        activePage = adminPage;
        assert.deepEqual(
          {
            "Ada (last week)": await sendKindsTo(lwAda.email),
            "Fern (last week)": await sendKindsTo(lwFern.email),
            Ada: await sendKindsTo(ada.email),
            Cleo: await sendKindsTo(cleo.email),
            Dan: await sendKindsTo(dan.email),
            Eve: await sendKindsTo(eve.email),
            Fern: await sendKindsTo(fern.email),
          },
          {
            "Ada (last week)": ["application", "notice"],
            "Fern (last week)": ["application"],
            Ada: ["application", "course-certificate"],
            Cleo: ["application"],
            Dan: ["application"],
            Eve: ["application", "course-certificate"],
            Fern: ["application", "course-certificate"],
          },
          "the send log, person by person",
        );
        // About the run past its end: the certificates and the admin's test of them.
        const aboutRun = (await fixtureQuery("emailSends").where("referenceId", "==", over.runId).get()).docs.map((doc) => doc.data());
        assert.deepEqual(
          aboutRun.map((row) => String(row.kind)).sort(),
          [...owed.map(() => "course-certificate"), "course-test"].sort(),
          "the send log about the run past its end",
        );
        assert.ok(
          aboutRun.filter((row) => row.kind === "course-test").every((row) => String(row.to).toLowerCase() === secrets.adminEmail.toLowerCase()),
          "the certificates' test went to somebody other than the admin who pressed it",
        );
        // About the survey at the end: Ada's notice and the admin's test.
        const aboutSurvey = (await fixtureQuery("emailSends").where("referenceId", "==", surveyId).get()).docs.map((doc) => doc.data());
        assert.deepEqual(
          aboutSurvey.map((row) => [String(row.kind), row.kind === "notice" ? String(row.to).toLowerCase() : "the admin"]).sort(),
          [["course-test", "the admin"], ["notice", lwAda.email.toLowerCase()]].sort(),
          "the send log about the survey at the end",
        );
        // Every message this journey sent: none carries Group A's meeting link.
        const messages = [];
        for (const { account } of everybody) {
          for (const summary of await messagesTo(account.email)) messages.push(await readEmail(summary));
        }
        assert.equal(messages.length, 2 + 1 + 2 + 1 + 1 + 2 + 2, "Mailpit holds another number of messages for this journey");
        for (const message of messages) assertNoMeetingLink(message, `"${message.subject}"`);
      });
    } finally {
      const contexts = [lwAdaContext, adaContext, cleoContext, danContext, strangerContext, context];
      await Promise.allSettled(contexts.map((each) => each.close()));
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
