/**
 * One term, from nothing to settled, through every part of the application
 * system at once.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * The application system was built as seven pieces: the form's editor, the
 * applicant's form, review, pooled applicants and decision day, the form's
 * lifecycle, what an applicant sees afterwards and their reply, and the
 * accounts an acceptance approves. Each piece has a suite of its own, run
 * against sample data shaped the way that piece expects. What none of them
 * can see is the seam between two pieces: a document one writes in a shape
 * the next does not read, a count one screen takes from the decision
 * documents and another from the applications, a status one route moves and
 * another route's gate was not told about.
 *
 * So this file runs ONE term through the real route handlers of all of them,
 * in order, against one database, and at each step asserts what the next
 * piece will read:
 *
 *  1. An admin makes a form from nothing, and it will not open until ready.
 *  2. People apply. Nobody reaches anybody else's data.
 *  3. The form closes. Reviewers score, leads decide, an admin picks what
 *     pooled applicants hear.
 *  4. NOBODY HEARS EARLY: until the send, everything an applicant's own
 *     routes say about their application is what it said when they sent it.
 *  5. The send. It stops part way, and what the one person told was told is
 *     fixed from that moment. Pressed again, the counts add up, each person
 *     is emailed once, and an email that failed is owed and goes later, once.
 *     After it no decision changes, and the dates cannot reopen the form.
 *  6. Each person sees their own outcome and replies. After each reply every
 *     staff screen shows the same numbers, and they are the numbers a
 *     recount of the documents gives.
 *  7. The term settles and the member records are written.
 *
 * ## How it is laid out
 *
 * The story is told once, by `tellTheStory()`, which makes the requests and
 * WRITES DOWN what came back at each step (`seen`). The tests then read what
 * was written down. A request that goes wrong is recorded like any other and
 * the story carries on, so one disagreement between two pieces shows up as
 * one failing test and does not hide the ones after it.
 *
 * ## What is real and what is stubbed
 *
 * Real: every route handler under `src/app/api/admissions/forms/`, the
 * server logic under `src/lib/applications/`, the access predicates, the
 * rate limiter, the email templates, and the member-record writer a settle
 * calls. Stubbed: `server-only`, `next/server`, the Admin SDK's sentinels and
 * handle, the session, the view-as guard, and `sendEmail`, which records
 * what it was handed and answers as the story tells it to. No message can
 * leave this process. The clock is the runner's, set by the story.
 *
 * The database is `tests/lib/applicationsStore.mjs`, the store the form
 * editor's own suite uses.
 */
import { before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";

// ---------------------------------------------------------------------------
// The world: one database, one mail door, one clock
// ---------------------------------------------------------------------------

const APP_URL = "https://staging.example.com";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;
delete process.env.SMTP_FROM_NAME;
delete process.env.SMTP_HOST;
delete process.env.EMAIL_AUDIENCE;

const world = {
  db: null,
  user: null,
  viewAs: false,
  mail: { calls: [], delivered: [], verdict: null },
};
globalThis.__journey = world;

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export class NextResponse {\n" +
        "  constructor(body, init) {\n" +
        "    this.body = body;\n" +
        "    this.status = (init && init.status) || 200;\n" +
        "    this.headers = (init && init.headers) || {};\n" +
        "  }\n" +
        "  static json(body, init) { return new NextResponse(body, init); }\n" +
        "  async json() { return this.body; }\n" +
        "}",
    ],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__journey.db; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__journey.user; }"],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() {\n" +
        "  return globalThis.__journey.viewAs ? { status: 403, body: { error: 'view-as' } } : null;\n" +
        "}",
    ],
    [
      // The one mail door. It records every message it is handed and answers
      // the way the story says to: sent, or a connection that was refused.
      "@/lib/email/send",
      "export async function sendEmail(args) {\n" +
        "  const mail = globalThis.__journey.mail;\n" +
        "  mail.calls.push(args);\n" +
        "  const verdict = mail.verdict ? mail.verdict(args) : 'sent';\n" +
        "  if (verdict === 'throw') {\n" +
        "    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:587'), {\n" +
        "      code: 'ESOCKET', syscall: 'connect', command: 'CONN',\n" +
        "    });\n" +
        "  }\n" +
        "  mail.delivered.push(args.to);\n" +
        "  return { messageId: 'm-' + mail.calls.length, delivered: [args.to], suppressed: [], held: [] };\n" +
        "}",
    ],
  ]),
});

const api = (...parts) => loadTs(join("app", "api", "admissions", "forms", ...parts, "route.ts"));
const lib = (...parts) => loadTs(join("lib", "applications", ...parts));

const R = "[roundId]";
const routes = {
  forms: await api(),
  form: await api(R),
  sets: await api(R, "sets"),
  set: await api(R, "sets", "[setId]"),
  programme: await api(R, "programmes", "[programmeId]"),
  roles: await api(R, "programmes", "[programmeId]", "roles"),
  status: await api(R, "status"),
  application: await api(R, "application"),
  applicationSend: await api(R, "application", "send"),
  reply: await api(R, "application", "reply"),
  board: await api(R, "programmes", "[programmeId]", "applications"),
  review: await api(R, "applications", "[uid]"),
  saveReview: await api(R, "applications", "[uid]", "review"),
  decision: await api(R, "applications", "[uid]", "decision"),
  reviewSettings: await api(R, "review-settings"),
  pool: await api(R, "pool"),
  send: await api(R, "send"),
  sendTest: await api(R, "send", "test"),
  programmeTest: await api(R, "programmes", "[programmeId]", "test-email"),
};

const reminders = await lib("decisionDay", "reminders.ts");
const termHome = await lib("lifecycle", "loadTermHome.ts");
const statusLoad = await lib("status", "load.ts");
const repo = await lib("repo.ts");

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/** The days of the term, in London. The clocks are still an hour ahead until Sun 25 Oct. */
const WHEN = {
  building: "2026-10-05T09:00:00Z",
  applying: "2026-10-10T10:00:00Z",
  closedEarly: "2026-10-11T10:00:00Z",
  reopened: "2026-10-12T10:00:00Z",
  afterTheClose: "2026-10-19T08:00:00Z",
  reviewing: "2026-10-20T10:00:00Z",
  decisionDay: "2026-10-23T09:00:00Z",
  replying: "2026-10-24T10:00:00Z",
  settling: "2026-10-27T10:00:00Z",
};
const at = (when) => mock.timers.setTime(new Date(WHEN[when]).getTime());

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

const PERMISSIONS = {
  draftNewsletter: false,
  approveNewsletter: false,
  draftEvent: false,
  approveEvent: false,
  draftCourse: false,
  approveCourse: false,
  manageMembership: false,
  circulateWorksheet: false,
};

/** [uid, name, role, SU-recognised]. Everybody's address is on a reserved domain. */
const CAST = [
  // The committee.
  ["zach", "Zach Levin", "admin", false],
  ["claudia", "Claudia Reyes", "committee", true],
  ["tess", "Tess Arnold", "committee", true],
  ["lloyd", "Lloyd Brandon", "committee", true],
  // SU-recognised committee, named nowhere on the form.
  ["yusuf", "Yusuf Demir", "committee", true],
  // The applicants.
  ["amara", "Amara Okafor", "member", false],
  ["jasmine", "Jasmine Park", "pending", false],
  ["oliver", "Oliver Grant", "pending", false],
  ["hannah", "Hannah Weiss", "member", false],
  ["priya", "Priya Nair", "member", false],
  ["abel", "Abel Hartley", "member", false],
  // Starts a draft and never sends it.
  ["dev", "Dev Patel", "member", false],
  // A member with no application, and an account that was refused.
  ["nell", "Nell Carter", "member", false],
  ["rex", "Rex Dunn", "rejected", false],
];

function userDoc([uid, name, role, suRecognised]) {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: name,
    role,
    suRecognised,
    permissions: PERMISSIONS,
    profile: {
      preferredName: name.split(" ")[0],
      universityEmail: "someone@nottingham.ac.uk",
      uniEmailVerifiedAt: new Date("2026-09-20T09:00:00Z"),
      status: "undergraduate",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments hold up.",
      interests: "Governance",
    },
    createdAt: new Date("2026-09-20T09:00:00Z"),
  };
}

/** The session a request arrives with: the account as it is stored RIGHT NOW. */
function sessionOf(uid) {
  if (!uid) return null;
  const account = world.db.read(`users/${uid}`);
  return {
    uid,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    suRecognised: account.suRecognised === true,
    admissionsReviewer: account.admissionsReviewer === true,
    permissions: PERMISSIONS,
  };
}

// ---------------------------------------------------------------------------
// Making a request
// ---------------------------------------------------------------------------

let requests = 0;

/**
 * One request to a real handler, as `who` (a uid, or null for nobody signed
 * in). Answers `{ status, body }` and never throws: a handler that throws is
 * written down as a 599 with the error, so the story can carry on.
 */
async function call(who, handler, params, { body, query } = {}) {
  requests += 1;
  world.user = sessionOf(who);
  const init = {
    method: handler.name,
    headers: {
      "Content-Type": "application/json",
      // Each request from its own address, so only the per-account limits count.
      "x-forwarded-for": `10.${(requests >> 16) & 255}.${(requests >> 8) & 255}.${requests & 255}`,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const url = `https://naisi.invalid/api${query ? `?${new URLSearchParams(query)}` : ""}`;
  try {
    const response = await handler(new Request(url, init), { params: Promise.resolve(params) });
    return { status: response.status, body: structuredClone(response.body) };
  } catch (err) {
    return { status: 599, body: { error: String(err?.stack ?? err) } };
  }
}

/**
 * Everything the story writes down. `steps` is every request it made with
 * the status it expected, so one test can say which did not go as told.
 */
const seen = { crashed: null, steps: [], outsiders: {}, earshot: [], census: {}, outcomes: {}, logged: [] };

/**
 * One request the story depends on. `expected` is the status the story
 * expects (or several, where two answers are equally a refusal).
 */
async function step(name, expected, who, handler, params, options) {
  const response = await call(who, handler, params, options);
  seen.steps.push({ name, expected, status: response.status, error: response.body?.error ?? null });
  return response;
}

const REFUSED = [403, 404];

// ---------------------------------------------------------------------------
// What the story reads back
// ---------------------------------------------------------------------------

let ROUND = "";
/** Programme ids and question set ids, as the editor minted them. */
const P = { agi: "", tais: "", inc: "" };
const SET = { fellowships: "", agi: "", tais: "", incubator: "", incStream: "", facilitator: "" };
/** Question ids by set, under the story's own short names for them. */
const Q = {};

const roundDoc = () => world.db.read(`admissionRounds/${ROUND}`);
const applicationDoc = (uid) => world.db.read(`admissionApplications/${ROUND}__${uid}`);
const accountDoc = (uid) => world.db.read(`users/${uid}`);
const applicationDocs = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith(`admissionApplications/${ROUND}__`))
    .map((path) => world.db.read(path));
/** The whole database as one string, to prove a request wrote nothing. */
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

const APPLICANTS = ["abel", "amara", "hannah", "jasmine", "oliver", "priya"];
const PROGRAMMES = ["agi", "tais", "inc"];

/** Later the same day: far enough on that the per-account request allowances have turned over. */
const later = (minutes = 11) => mock.timers.setTime(Date.now() + minutes * 60_000);

/**
 * WHAT EACH APPLICANT CAN LEARN ABOUT THEIR OWN APPLICATION, through every
 * route that serves them: the application their own route returns, what
 * their page would draw, and how a reply is answered.
 */
async function earshot(label) {
  later();
  const heard = {};
  for (const who of APPLICANTS) {
    const own = await call(who, routes.application.GET, { roundId: ROUND });
    const page = await statusLoad.loadStatus(world.db, ROUND, who, new Date());
    const reply = await call(who, routes.reply.POST, { roundId: ROUND }, { body: { reply: "coming" } });
    heard[who] = {
      status: own.status,
      application: own.body?.application ?? null,
      page: page?.view ?? null,
      reply: { status: reply.status, error: reply.body?.error ?? null },
      stored: structuredClone(applicationDoc(who)),
    };
  }
  seen.earshot.push({ label, heard });
}

/**
 * EVERY STAFF SCREEN'S NUMBERS AT ONE MOMENT, beside a recount of the
 * documents themselves.
 */
async function census(label) {
  const numbers = { label };

  // The form's counters, and the same count made from the applications.
  const counters = roundDoc().applicationCounts;
  numbers.counters = Object.fromEntries(Object.entries(counters).filter(([, count]) => count !== 0));
  const byStatus = {};
  for (const application of applicationDocs()) byStatus[application.status] = (byStatus[application.status] ?? 0) + 1;
  numbers.byStatus = byStatus;

  // The review list of each programme, as the admin and as its own lead.
  numbers.list = {};
  numbers.listAsLead = {};
  numbers.tab = {};
  const leads = { agi: "claudia", tais: "tess", inc: "zach" };
  for (const name of PROGRAMMES) {
    const programmeId = P[name];
    for (const [into, who] of [
      [numbers.list, "zach"],
      [numbers.listAsLead, leads[name]],
    ]) {
      const list = await call(who, routes.board.GET, { roundId: ROUND, programmeId });
      const board = list.body?.board;
      into[name] = board
        ? {
            counts: board.counts,
            placed: board.progress.placed,
            invited: board.progress.invited,
            placesLeft: board.progress.placesLeft,
            waiting: board.queue.length,
            rows: board.rows.map((row) => row.uid).sort(),
            withdrawn: board.rows.filter((row) => row.withdrawn).map((row) => row.uid).sort(),
          }
        : { refused: list.status };
    }
    // The number beside the programme's Applications tab.
    const settings = await call("zach", routes.programme.GET, { roundId: ROUND, programmeId });
    numbers.tab[name] = settings.body?.programme?.applications ?? { refused: settings.status };
  }

  // The term page, for the admin, a lead and a reviewer.
  const form = await repo.loadForm(world.db, ROUND);
  numbers.term = {};
  for (const who of ["zach", "claudia", "lloyd"]) {
    const loaded = await termHome.loadTermNumbers(world.db, sessionOf(who), form);
    numbers.term[who] = {
      work: Object.fromEntries(
        PROGRAMMES.filter((name) => loaded.work[P[name]]).map((name) => [name, loaded.work[P[name]]]),
      ),
      pool: loaded.pool,
    };
  }

  // Pooled applicants.
  const pool = await call("zach", routes.pool.GET, { roundId: ROUND });
  const poolBoard = pool.body?.board;
  numbers.pool = poolBoard
    ? {
        counts: poolBoard.counts,
        rows: poolBoard.rows.map((row) => row.uid).sort(),
        programmes: Object.fromEntries(
          PROGRAMMES.map((name) => {
            const programme = poolBoard.programmes.find((entry) => entry.id === P[name]);
            return [name, programme ? { placed: programme.placed, invited: programme.invited, left: programme.left } : null];
          }),
        ),
      }
    : { refused: pool.status };

  // Decision day.
  const send = await call("zach", routes.send.GET, { roundId: ROUND });
  const sendBoard = send.body?.board;
  numbers.send = sendBoard
    ? {
        applied: sendBoard.applied,
        published: sendBoard.published,
        accepted: sendBoard.accepted.people.map((person) => person.uid).sort(),
        invited: sendBoard.invited.people.map((person) => person.uid).sort(),
        noOffer: sendBoard.noOffer.people.map((person) => person.uid).sort(),
        declined: sendBoard.declined.count,
        pending: { people: sendBoard.pending.people, emails: sendBoard.pending.emails },
        owed: sendBoard.owed.people.map((person) => person.uid).sort(),
        accountsWaiting: sendBoard.accountsWaiting,
        ready: sendBoard.blockers.length === 0,
      }
    : { refused: send.status };

  // A RECOUNT, from the applications alone. After decision day everything
  // about a person's place is on their own document, so this owes nothing to
  // the decision documents the screens above are worked out from.
  const inTerm = applicationDocs().filter((application) => application.sent && application.status !== "withdrawn");
  const places = roundDoc().programmes;
  numbers.recount = {
    inTerm: inTerm.length,
    accepted: inTerm.filter((a) => a.result?.kind === "accepted").map((a) => a.uid).sort(),
    invited: inTerm.filter((a) => a.result?.kind === "invited").map((a) => a.uid).sort(),
    noOffer: inTerm.filter((a) => a.result?.kind === "no-offer").map((a) => a.uid).sort(),
    declined: inTerm.filter((a) => a.result?.kind === "declined").length,
    told: inTerm.filter((a) => a.result).length,
    ranking: Object.fromEntries(
      PROGRAMMES.map((name) => [name, inTerm.filter((a) => a.sent.rankedProgrammeIds.includes(P[name])).length]),
    ),
    holding: Object.fromEntries(
      PROGRAMMES.map((name) => {
        const held = inTerm.filter((a) => a.result?.programmeId === P[name]);
        return [
          name,
          {
            placed: held.filter((a) => a.result.kind === "accepted").length,
            invited: held.filter((a) => a.result.kind === "invited").length,
            left: places[P[name]].places - held.length,
          },
        ];
      }),
    ),
  };

  seen.census[label] = structuredClone(numbers);
  return numbers;
}

// ---------------------------------------------------------------------------
// The story
// ---------------------------------------------------------------------------

/** 1. An admin makes a form from nothing. It will not open until it is ready. */
async function theFormIsMade() {
  at("building");
  const made = await step("make the form", 201, "zach", routes.forms.POST, {}, { body: { label: "Autumn 2026" } });
  ROUND = made.body?.id ?? "";

  const names = [
    ["agi", { name: "AGI Strategy Fellowship", shortName: "AGI Strategy", kind: "fellowship" }],
    ["tais", { name: "Technical AI Safety Fellowship", shortName: "Technical AI Safety", kind: "fellowship" }],
    ["inc", { name: "Research Incubator", shortName: "Research incubator", kind: "incubator" }],
  ];
  for (const [name, addProgramme] of names) {
    const added = await step(`add ${name}`, 200, "zach", routes.form.PATCH, { roundId: ROUND }, { body: { addProgramme } });
    P[name] = added.body?.addedProgrammeId ?? "";
  }

  const sets = await step("read the sets the editor made", 200, "zach", routes.sets.GET, { roundId: ROUND });
  seen.setsAtFirst = sets.body?.sets ?? [];
  for (const set of seen.setsAtFirst) {
    if (set.role === "general" && set.scope.kind === "fellowship") SET.fellowships = set.id;
    else if (set.role === "general") SET.incubator = set.id;
    else if (set.role === "facilitator") SET.facilitator = set.id;
    else if (set.scope.programmeId === P.agi) SET.agi = set.id;
    else if (set.scope.programmeId === P.tais) SET.tais = set.id;
    else if (set.scope.programmeId === P.inc) SET.incStream = set.id;
  }

  // Nothing is ready yet: no dates, no leads, no questions.
  const open = { body: { status: "open" } };
  seen.openTooEarly = await step("open with nothing ready", 409, "zach", routes.status.POST, { roundId: ROUND }, open);

  // The questions. AGI Strategy's two are scored. The incubator's own stream
  // set is left as the editor made it, with no question in it.
  const long = (id, text, over = {}) => ({ id, text, help: "", type: "long", wordLimit: 300, required: true, scored: false, ...over });
  for (const [setName, setId, questions] of [
    ["fellowships", SET.fellowships, [long("why", "Why do you want to do a fellowship?")]],
    ["agi", SET.agi, [long("event", "Which event mattered most?", { scored: true }), long("law", "What would you change?", { scored: true })]],
    ["tais", SET.tais, [long("built", "What have you built?")]],
    ["incubator", SET.incubator, [long("idea", "What would you work on?")]],
    [
      "facilitator",
      SET.facilitator,
      [
        long("led", "Have you led a group before?"),
        { id: "which", text: "Which programme would you facilitate?", help: "", type: "choice", options: [], optionsFromRanking: true, required: true, scored: false },
      ],
    ],
  ]) {
    const saved = await step(`write the ${setName} questions`, 200, "zach", routes.set.PATCH, { roundId: ROUND, setId }, { body: { questions } });
    // The editor mints each question's id. The story's short names for them, in order.
    Q[setName] = Object.fromEntries(
      questions.map((question, index) => [question.id, saved.body?.set?.questions?.[index]?.id ?? ""]),
    );
  }

  for (const [name, body] of [
    ["agi", { places: 3, starts: "w/c 26 Oct", facts: "6 WEEKS", useScores: true }],
    ["tais", { places: 2, starts: "w/c 2 Nov", facts: "8 WEEKS", useScores: false }],
    ["inc", { places: 1, starts: "w/c 2 Nov", facts: "10 WEEKS", useScores: false }],
  ]) {
    await step(`settings for ${name}`, 200, "zach", routes.programme.PATCH, { roundId: ROUND, programmeId: P[name] }, { body });
  }
  // A lead who is not SU-recognised committee cannot be named.
  seen.memberAsLead = await step("name a member as a lead", [400, 403, 409, 422], "zach", routes.roles.PUT, { roundId: ROUND, programmeId: P.agi }, { body: { leadUid: "nell" } });
  for (const [name, body] of [
    ["agi", { leadUid: "claudia", reviewerUids: ["lloyd"] }],
    ["tais", { leadUid: "tess", reviewerUids: [] }],
    ["inc", { leadUid: "zach", reviewerUids: [] }],
  ]) {
    await step(`lead and reviewers for ${name}`, 200, "zach", routes.roles.PUT, { roundId: ROUND, programmeId: P[name] }, { body });
  }

  // Everything but the dates.
  seen.openWithoutDates = await step("open with no dates", 409, "zach", routes.status.POST, { roundId: ROUND }, open);
  seen.strangerBeforeOpen = await call("amara", routes.application.GET, { roundId: ROUND });

  await step("set the dates", 200, "zach", routes.form.PATCH, { roundId: ROUND }, {
    body: {
      opens: { date: "2026-10-06", time: "09:00" },
      closes: { date: "2026-10-18", time: "23:59" },
      decisions: "2026-10-23",
      replyBy: "2026-10-25",
    },
  });
  seen.opened = await step("open the form", 200, "zach", routes.status.POST, { roundId: ROUND }, open);
  seen.roundWhenOpened = structuredClone(roundDoc());
  seen.usersWhenOpened = Object.fromEntries(
    ["claudia", "tess", "lloyd", "zach", "yusuf"].map((uid) => [uid, accountDoc(uid).admissionsReviewer === true]),
  );
  // Open, and the opening hour has not come yet.
  seen.beforeTheOpening = await call("amara", routes.application.GET, { roundId: ROUND });
  seen.saveBeforeTheOpening = await call("amara", routes.application.PUT, { roundId: ROUND }, { body: { draft: {} } });
}

/** A week with Tuesday evening painted, on the form's own grid. */
const availabilityOn = (grid) => ({ ...grid, days: ["", "000000000fff", "", "", "", "", ""] });

/** What one person fills in. `ranked` is programme ids in their order. */
function draftFor(view, { ranked, facilitate = false, why = "I want to understand it." }) {
  const answers = {};
  if (ranked.some((id) => id === P.agi || id === P.tais)) answers[SET.fellowships] = { [Q.fellowships.why]: why };
  if (ranked.includes(P.agi)) {
    answers[SET.agi] = { [Q.agi.event]: "A new law came into force.", [Q.agi.law]: "Who is liable." };
  }
  if (ranked.includes(P.tais)) answers[SET.tais] = { [Q.tais.built]: "A small classifier." };
  if (ranked.includes(P.inc)) answers[SET.incubator] = { [Q.incubator.idea]: "Measure it." };
  if (facilitate) {
    // The options are the programmes they ranked, with "Either" when there are two.
    const names = ranked.map((id) => view.form.programmes.find((programme) => programme.id === id)?.shortName ?? "");
    answers[SET.facilitator] = {
      [Q.facilitator.led]: "A reading group, last year.",
      [Q.facilitator.which]: names.length > 1 ? "Either" : names[0],
    };
  }
  return {
    aboutYou: view.account,
    rankedProgrammeIds: ranked,
    wantsToFacilitate: facilitate,
    answers,
    availability: availabilityOn(view.form.availabilityGrid),
    suMembership: "yes",
  };
}

const params = () => ({ roundId: ROUND });
const mine = (who) => call(who, routes.application.GET, params());
const save = (who, draft) => call(who, routes.application.PUT, params(), { body: { draft } });
const sendIt = (who) => call(who, routes.applicationSend.POST, params(), { body: {} });

/** Who applies, with what they rank. */
const plans = () => ({
  amara: { ranked: [P.agi, P.tais] },
  jasmine: { ranked: [P.agi] },
  oliver: { ranked: [P.inc], facilitate: true },
  hannah: { ranked: [P.agi] },
  priya: { ranked: [P.tais] },
  abel: { ranked: [P.tais, P.inc] },
});

/** Every request a member of the committee can make, as somebody with no business making it. */
const staffRequests = (who, other) => [
  ["POST forms", routes.forms.POST, {}, { body: { label: "Mine" } }],
  ["GET form", routes.form.GET, params()],
  ["PATCH form", routes.form.PATCH, params(), { body: { label: "Mine" } }],
  ["GET sets", routes.sets.GET, params()],
  ["POST sets", routes.sets.POST, params(), { body: { label: "Mine", scope: { type: "facilitating" } } }],
  ["PATCH set", routes.set.PATCH, { roundId: ROUND, setId: SET.agi }, { body: { label: "Mine" } }],
  ["DELETE set", routes.set.DELETE, { roundId: ROUND, setId: SET.incStream }],
  ["GET programme", routes.programme.GET, { roundId: ROUND, programmeId: P.agi }],
  ["PATCH programme", routes.programme.PATCH, { roundId: ROUND, programmeId: P.agi }, { body: { places: 99 } }],
  ["PUT roles", routes.roles.PUT, { roundId: ROUND, programmeId: P.agi }, { body: { reviewerUids: [who ?? "nell"] } }],
  ["POST status", routes.status.POST, params(), { body: { status: "closed" } }],
  ["GET list", routes.board.GET, { roundId: ROUND, programmeId: P.agi }],
  ["POST list", routes.board.POST, { roundId: ROUND, programmeId: P.agi }, { body: { decision: "accept", uids: [who ?? other] } }],
  ["GET another's application", routes.review.GET, { roundId: ROUND, uid: other }, { query: { programme: P.agi } }],
  ["GET their own, as staff see it", routes.review.GET, { roundId: ROUND, uid: who ?? other }, { query: { programme: P.agi } }],
  ["PUT review", routes.saveReview.PUT, { roundId: ROUND, uid: other }, { body: { programmeId: P.agi, overallComment: "Mine" } }],
  ["PUT decision", routes.decision.PUT, { roundId: ROUND, uid: who ?? other }, { body: { programmeId: P.agi, decision: "accept" } }],
  ["DELETE decision", routes.decision.DELETE, { roundId: ROUND, uid: other }, { body: { programmeId: P.agi, reason: "Mine" } }],
  ["PUT review settings", routes.reviewSettings.PUT, params(), { body: { revealOtherReviews: true } }],
  ["GET pool", routes.pool.GET, params()],
  ["PUT pool", routes.pool.PUT, params(), { body: { uid: who ?? other, outcome: { kind: "invite", programmeId: P.agi } } }],
  ["GET send", routes.send.GET, params()],
  ["POST send", routes.send.POST, params(), { body: { emails: 0 } }],
  ["POST send test", routes.sendTest.POST, params(), { body: { kind: "accepted" } }],
  ["POST programme test", routes.programmeTest.POST, { roundId: ROUND, programmeId: P.agi }, { body: { kind: "accepted" } }],
];

/** Everybody who has no role on the form tries everything. Nothing may be written. */
async function outsidersTryEverything(label) {
  const before = everything();
  const mailBefore = world.mail.calls.length;
  const answers = [];
  for (const who of [null, ...APPLICANTS, "dev", "nell", "yusuf", "rex"]) {
    const other = who === "amara" ? "jasmine" : "amara";
    for (const [name, handler, handlerParams, options] of staffRequests(who, other)) {
      const response = await call(who, handler, handlerParams, options);
      answers.push({ who: who ?? "nobody signed in", name, status: response.status });
    }
    // The list of forms answers anybody signed in, with the forms they work on.
    const list = await call(who, routes.forms.GET, {});
    answers.push({ who: who ?? "nobody signed in", name: "GET forms", status: list.status, forms: list.body?.forms ?? null, canCreate: list.body?.canCreate ?? null });
  }
  seen.outsiders[label] = { answers, wroteNothing: everything() === before, mailed: world.mail.calls.length - mailBefore };
}

/** 2. People apply. */
async function peopleApply() {
  at("applying");
  const people = plans();

  // Hannah presses Send with one required answer left empty, and is told.
  const hannahFirst = await mine("hannah");
  const unfinished = draftFor(hannahFirst.body, people.hannah);
  unfinished.answers[SET.agi][Q.agi.law] = "";
  await save("hannah", unfinished);
  seen.unfinishedSend = await sendIt("hannah");
  seen.afterUnfinishedSend = { status: applicationDoc("hannah").status, counters: structuredClone(roundDoc().applicationCounts) };

  seen.applied = {};
  for (const who of APPLICANTS) {
    const look = await mine(who);
    const saved = await save(who, draftFor(look.body, people[who]));
    const sent = await sendIt(who);
    seen.steps.push({ name: `${who} saves`, expected: 200, status: saved.status, error: saved.body?.error ?? null });
    seen.steps.push({ name: `${who} sends`, expected: 200, status: sent.status, error: sent.body?.error ?? null });
    seen.applied[who] = { look, saved, sent, stored: structuredClone(applicationDoc(who)) };
  }

  // Amara changes an answer. Saved is not sent: the committee still has the first one.
  later(60);
  const changed = draftFor(seen.applied.amara.look.body, { ...people.amara, why: "I have changed my mind about why." });
  const savedAgain = await save("amara", changed);
  seen.amaraSavedAgain = { response: savedAgain, stored: structuredClone(applicationDoc("amara")) };
  const sentAgain = await sendIt("amara");
  seen.amaraSentAgain = { response: sentAgain, stored: structuredClone(applicationDoc("amara")) };

  // Dev starts and never sends.
  const devLook = await mine("dev");
  seen.devSaved = await save("dev", draftFor(devLook.body, { ranked: [P.agi] }));

  // Somebody with no application, somebody signed out, and a refused account.
  seen.noApplication = {
    look: await mine("nell"),
    send: await sendIt("nell"),
    reply: await call("nell", routes.reply.POST, params(), { body: { reply: "coming" } }),
    page: await statusLoad.loadStatus(world.db, ROUND, "nell", new Date()),
  };
  seen.signedOut = {
    look: await mine(null),
    save: await save(null, {}),
    send: await sendIt(null),
    reply: await call(null, routes.reply.POST, params(), { body: { reply: "coming" } }),
  };
  seen.refusedAccount = {
    look: await mine("rex"),
    save: await save("rex", {}),
    send: await sendIt("rex"),
    reply: await call("rex", routes.reply.POST, params(), { body: { reply: "coming" } }),
  };
  seen.countersAfterApplying = structuredClone(roundDoc().applicationCounts);

  await outsidersTryEverything("while applications are open");

  // The questions are locked now that somebody has applied.
  seen.editAfterApplying = await call("zach", routes.set.PATCH, { roundId: ROUND, setId: SET.agi }, { body: { questions: [] } });

  // An admin closes early, then opens again. The applicant's routes follow.
  at("closedEarly");
  seen.closedEarly = await step("close early", 200, "zach", routes.status.POST, params(), { body: { status: "closed" } });
  seen.whileClosedEarly = {
    staff: (await call("zach", routes.form.GET, params())).body?.form?.state ?? null,
    look: (await mine("dev")).body?.form?.windowState ?? null,
    save: await save("dev", draftFor(devLook.body, { ranked: [P.agi, P.inc] })),
    send: await sendIt("dev"),
  };
  at("reopened");
  seen.reopenUnasked = await call("zach", routes.status.POST, params(), { body: { status: "open" } });
  seen.reopened = await step("open again", 200, "zach", routes.status.POST, params(), { body: { status: "open", confirm: true } });
  seen.afterReopening = {
    staff: (await call("zach", routes.form.GET, params())).body?.form?.state ?? null,
    look: (await mine("dev")).body?.form?.windowState ?? null,
    save: await save("dev", draftFor(devLook.body, { ranked: [P.agi, P.inc] })),
  };
}

const key = (set, question) => `${SET[set]}.${Q[set][question]}`;
const reviewOf = (who, uid, programme) =>
  call(who, routes.review.GET, { roundId: ROUND, uid }, { query: { programme: P[programme] } });
const score = (who, uid, programme, scores, overallComment) =>
  call(who, routes.saveReview.PUT, { roundId: ROUND, uid }, { body: { programmeId: P[programme], scores, ...(overallComment ? { overallComment } : {}) } });
const decide = (who, uid, programme, decision, more = {}) =>
  call(who, routes.decision.PUT, { roundId: ROUND, uid }, { body: { programmeId: P[programme], decision, ...more } });
const pick = (uid, outcome) => call("zach", routes.pool.PUT, params(), { body: { uid, outcome } });

/** 3 and 4. The form closes, reviewers score, leads decide, an admin picks. Nobody hears. */
async function theCommitteeDecides() {
  at("afterTheClose");
  seen.afterTheClose = {
    staff: (await call("zach", routes.form.GET, params())).body?.form?.state ?? null,
    look: (await mine("dev")).body?.form?.windowState ?? null,
    save: await save("dev", draftFor(seen.applied.amara.look.body, { ranked: [P.agi] })),
    send: await sendIt("dev"),
    amaraSave: await save("amara", seen.amaraSentAgain.stored.draft),
    amaraSend: await sendIt("amara"),
  };
  await earshot("the form has closed");
  await census("nothing decided");

  at("reviewing");
  // Claudia, the lead, scores Amara first. Lloyd, the reviewer, has not yet.
  seen.claudiaScores = await step("the lead scores Amara", 200, "claudia", routes.saveReview.PUT, { roundId: ROUND, uid: "amara" }, {
    body: { programmeId: P.agi, scores: { [key("agi", "event")]: 4, [key("agi", "law")]: 5 }, overallComment: "Strong on the law." },
  });
  seen.lloydBeforeScoring = await reviewOf("lloyd", "amara", "agi");
  seen.lloydListBeforeScoring = await call("lloyd", routes.board.GET, { roundId: ROUND, programmeId: P.agi });
  // One of the two answers is not a finished first review.
  seen.lloydHalfScored = await score("lloyd", "amara", "agi", { [key("agi", "event")]: 3 });
  seen.lloydScored = await score("lloyd", "amara", "agi", { [key("agi", "law")]: 3 }, "Fine.");
  seen.lloydListAfterScoring = await call("lloyd", routes.board.GET, { roundId: ROUND, programmeId: P.agi });
  await earshot("the reviewers have scored");

  // A reviewer cannot decide. A lead cannot decide another lead's programme.
  seen.reviewerDecides = await decide("lloyd", "amara", "agi", "accept");
  seen.leadDecidesElsewhere = await decide("claudia", "priya", "tais", "accept");
  seen.leadReadsElsewhere = await reviewOf("claudia", "priya", "tais");
  seen.otherLeadDecidesHere = await decide("tess", "hannah", "agi", "accept");
  seen.leadPicksAnOutcome = await call("claudia", routes.pool.PUT, params(), { body: { uid: "hannah", outcome: { kind: "no-offer" } } });

  // The leads decide.
  seen.bulkAccept = await step("the AGI Strategy lead accepts two at once", 200, "claudia", routes.board.POST, { roundId: ROUND, programmeId: P.agi }, {
    body: { decision: "accept", uids: ["amara", "jasmine"] },
  });
  await step("she pools Hannah", 200, "claudia", routes.decision.PUT, { roundId: ROUND, uid: "hannah" }, {
    body: { programmeId: P.agi, decision: "pool", poolReason: "capacity" },
  });
  await earshot("AGI Strategy has decided");
  await step("the Technical AI Safety lead declines Priya", 200, "tess", routes.decision.PUT, { roundId: ROUND, uid: "priya" }, {
    body: { programmeId: P.tais, decision: "decline" },
  });
  await step("she pools Abel, who could suit AGI Strategy", 200, "tess", routes.decision.PUT, { roundId: ROUND, uid: "abel" }, {
    body: { programmeId: P.tais, decision: "pool", poolReason: "better-fit", couldSuitProgrammeId: P.agi },
  });
  await census("the incubator still owes two decisions");
  // The send is not ready: two applications are undecided.
  seen.sendWhileUndecided = await call("zach", routes.send.POST, params(), { body: { emails: 0 } });
  await step("the incubator's lead pools Abel", 200, "zach", routes.decision.PUT, { roundId: ROUND, uid: "abel" }, {
    body: { programmeId: P.inc, decision: "pool", poolReason: "capacity" },
  });
  await step("and pools Oliver", 200, "zach", routes.decision.PUT, { roundId: ROUND, uid: "oliver" }, {
    body: { programmeId: P.inc, decision: "pool", poolReason: "capacity" },
  });
  await earshot("every lead has decided");
  await census("decided, nothing picked for the pooled");

  // The send is still not ready: three pooled applicants have nothing picked.
  seen.sendWhileUnpicked = await call("zach", routes.send.POST, params(), { body: { emails: 0 } });

  // An admin picks what each pooled applicant hears.
  seen.inviteToARankedProgramme = await pick("abel", { kind: "invite", programmeId: P.tais });
  await step("invite Abel to AGI Strategy", 200, "zach", routes.pool.PUT, params(), { body: { uid: "abel", outcome: { kind: "invite", programmeId: P.agi } } });
  // AGI Strategy's three places are now two accepted and one invitation.
  seen.inviteWithNoPlaceLeft = await pick("oliver", { kind: "invite", programmeId: P.agi });
  await step("invite Oliver to Technical AI Safety", 200, "zach", routes.pool.PUT, params(), { body: { uid: "oliver", outcome: { kind: "invite", programmeId: P.tais } } });
  await step("no offer for Hannah", 200, "zach", routes.pool.PUT, params(), { body: { uid: "hannah", outcome: { kind: "no-offer" } } });
  await earshot("the pooled outcomes are picked");
  await census("ready to send");

  // A test email goes to the admin who asked for it, and to nobody who applied.
  seen.mailBeforeTheTest = world.mail.calls.length;
  seen.testEmail = await call("zach", routes.sendTest.POST, params(), { body: { kind: "accepted" } });
  seen.testMail = world.mail.calls.slice(seen.mailBeforeTheTest).map((mail) => ({ to: mail.to, subject: mail.subject, kind: mail.kind }));
  await earshot("a test email has been sent");
}

const address = (uid) => `${uid}@example.com`;
/** What the mail door has been handed since `from`, in order. */
const mailSince = (from) =>
  world.mail.calls.slice(from).map((mail) => ({ to: mail.to, subject: mail.subject, kind: mail.kind, replyTo: mail.replyTo }));
const told = () => applicationDocs().filter((application) => application.result).map((application) => application.uid).sort();
/** The number the Send button carries: everybody not yet told who gets an email, and every email still owed. */
async function onTheButton() {
  const board = (await call("zach", routes.send.GET, params())).body?.board;
  return board ? board.pending.emails + board.owed.people.length : -1;
}
const press = (emails, more = {}) => call("zach", routes.send.POST, params(), { body: { emails, ...more } });

/** What each applicant's own route and page say now. Reads only. */
async function outcomes(label) {
  const heard = {};
  for (const who of [...APPLICANTS, "dev"]) {
    const own = await call(who, routes.application.GET, params());
    const page = await statusLoad.loadStatus(world.db, ROUND, who, new Date());
    heard[who] = { status: own.status, application: own.body?.application ?? null, page: page?.view ?? null };
  }
  seen.outcomes[label] = heard;
}

/** 5. The send. It stops part way, is pressed again, and an email that failed goes later, once. */
async function decisionDay() {
  at("decisionDay");
  seen.mailBeforeTheSend = world.mail.calls.length;
  const emails = await onTheButton();
  seen.emailsOnTheButton = emails;

  // Only an admin sends, and only for the number the page showed.
  seen.leadSends = await call("claudia", routes.send.POST, params(), { body: { emails } });
  seen.wrongNumber = await press(emails + 1);
  seen.beforeAnyPress = { told: told(), mail: mailSince(seen.mailBeforeTheSend) };

  // The first press. The mail server refuses the first message, which is
  // Abel's: he is first by name. The press stops there.
  world.mail.verdict = (mail) => (mail.to === address("abel") ? "throw" : "sent");
  seen.firstPress = await press(emails);
  seen.afterFirstPress = {
    told: told(),
    sentAt: roundDoc().decisionsSentAt ?? null,
    abel: structuredClone(applicationDoc("abel")),
    mail: mailSince(seen.mailBeforeTheSend),
    accounts: Object.fromEntries(["jasmine", "oliver"].map((uid) => [uid, accountDoc(uid).role])),
  };
  await census("the send stopped after one person");
  await outcomes("the send stopped after one person");

  // What Abel was told is fixed from this moment, though the term is not sent.
  seen.partWay = {
    leadChangesIt: await decide("tess", "abel", "tais", "accept"),
    adminChangesIt: await decide("zach", "abel", "inc", "accept"),
    severalAtOnce: await call("zach", routes.board.POST, { roundId: ROUND, programmeId: P.inc }, { body: { decision: "pool", uids: ["abel", "oliver"] } }),
    anotherOutcome: await pick("abel", { kind: "no-offer" }),
    decisionAfter: structuredClone(world.db.read(`admissionDecisions/${ROUND}__abel`)),
    // Somebody the press has not reached can still be decided again.
    notToldYet: await decide("claudia", "jasmine", "agi", "pool", { poolReason: "capacity" }),
    andBack: await decide("claudia", "jasmine", "agi", "accept"),
    reviewScreen: (await reviewOf("tess", "abel", "tais")).body?.review?.decision ?? null,
    list: ((await call("zach", routes.board.GET, { roundId: ROUND, programmeId: P.tais })).body?.board?.rows ?? []).map((row) => [row.uid, row.told]),
  };

  // The second press. The mail server is back for everybody but Hannah.
  later();
  world.mail.verdict = (mail) => (mail.to === address("hannah") ? "throw" : "sent");
  seen.mailBeforeSecondPress = world.mail.calls.length;
  seen.secondButton = await onTheButton();
  seen.secondPress = await press(seen.secondButton);
  seen.afterSecondPress = {
    told: told(),
    round: structuredClone(roundDoc()),
    mail: mailSince(seen.mailBeforeSecondPress),
    accounts: Object.fromEntries(["jasmine", "oliver"].map((uid) => [uid, structuredClone(accountDoc(uid))])),
    hannah: structuredClone(applicationDoc("hannah").result),
  };
  await census("sent, one email owed");

  // Pressed again with nothing changed: the term is sent, and nothing new goes.
  later();
  seen.mailBeforeThirdPress = world.mail.calls.length;
  seen.pressedAgain = await press(await onTheButton());
  seen.afterPressedAgain = { mail: mailSince(seen.mailBeforeThirdPress) };

  // The owed email, once the mail server is back. And then there is nothing owed.
  world.mail.verdict = null;
  seen.owedPress = await press(1, { owedOnly: true });
  seen.owedPressAgain = await press(0, { owedOnly: true });
  seen.afterOwedPress = { mail: mailSince(seen.mailBeforeThirdPress), hannah: structuredClone(applicationDoc("hannah").result) };
  seen.allDecisionMail = mailSince(seen.mailBeforeTheSend);
  await census("sent, nothing owed");
  await outcomes("everybody has been told");

  // Nothing about a decision can change now, by anybody.
  seen.afterTheSend = {
    decide: await decide("claudia", "amara", "agi", "pool"),
    revoke: await call("zach", routes.decision.DELETE, { roundId: ROUND, uid: "amara" }, { body: { programmeId: P.agi, reason: "A mistake." } }),
    pick: await pick("hannah", { kind: "invite", programmeId: P.inc }),
    // The form is still marked open and its close has passed. Moving the
    // close forward would take applications again.
    moveTheClose: await call("zach", routes.form.PATCH, params(), { body: { closes: { date: "2026-10-30", time: "23:59" } } }),
    closesAt: roundDoc().closesAt,
    window: (await mine("dev")).body?.form?.windowState ?? null,
    devSaves: await save("dev", applicationDoc("dev").draft),
    devSends: await sendIt("dev"),
    amaraSaves: await save("amara", applicationDoc("amara").draft),
    amaraSends: await sendIt("amara"),
    nellSaves: await save("nell", applicationDoc("dev").draft),
  };
}

const replyAs = (who, reply) => call(who, routes.reply.POST, params(), { body: { reply } });

/** Who the daily reminder for an unanswered invitation would write to today. */
async function dueAReminder() {
  const form = await repo.loadForm(world.db, ROUND);
  const due = [];
  for (const who of APPLICANTS) {
    const application = await repo.loadOwnApplication(world.db, form, who);
    if (reminders.invitationReminderDue(application, new Date()).due) due.push(who);
  }
  return due;
}

/** 6. Each person sees their own outcome, and replies. */
async function peopleReply() {
  at("replying");
  seen.replies = {};
  const before = everything();
  // Replies that are not theirs to make. None may write anything.
  seen.refusedReplies = {
    "no offer, says coming": await replyAs("hannah", "coming"),
    "no offer, accepts an invitation": await replyAs("hannah", "accept-invitation"),
    "declined, says coming": await replyAs("priya", "coming"),
    "placed by their ranking, turns down an invitation": await replyAs("amara", "decline-invitation"),
    "invited, says coming before accepting": await replyAs("oliver", "coming"),
    "a draft never sent": await replyAs("dev", "coming"),
    "no application": await replyAs("nell", "coming"),
    "not a reply": await replyAs("amara", "maybe"),
  };
  seen.refusedRepliesWroteNothing = everything() === before;
  seen.remindersBeforeReplies = await dueAReminder();

  for (const [who, reply, label] of [
    ["amara", "coming", "Amara is coming"],
    ["jasmine", "cant-make-it", "Jasmine gave her place back"],
    ["oliver", "accept-invitation", "Oliver accepted his invitation"],
    ["abel", "decline-invitation", "Abel said no thanks"],
  ]) {
    later();
    const account = structuredClone(accountDoc(who));
    const response = await step(`${who} replies ${reply}`, 200, who, routes.reply.POST, params(), { body: { reply } });
    seen.replies[who] = {
      response,
      stored: structuredClone(applicationDoc(who)),
      accountBefore: account,
      accountAfter: structuredClone(accountDoc(who)),
    };
    await census(label);
  }
  // A place given back cannot be taken again from the page.
  later();
  seen.takesItBack = await replyAs("jasmine", "coming");
  seen.remindersAfterReplies = await dueAReminder();
  await outcomes("everybody has replied");
  await outsidersTryEverything("after decision day");
}

/** 7. The term settles, and the member records are written. */
async function theTermSettles() {
  at("settling");
  seen.leadSettles = await call("claudia", routes.status.POST, params(), { body: { status: "settled" } });
  seen.settled = await step("settle the term", 200, "zach", routes.status.POST, params(), { body: { status: "settled" } });
  seen.roundWhenSettled = structuredClone(roundDoc());
  seen.records = Object.fromEntries(
    world.db
      .paths()
      .filter((path) => path.startsWith("memberRecords/"))
      .sort()
      .map((path) => [path, structuredClone(world.db.read(path))]),
  );
  seen.accountsAtTheEnd = Object.fromEntries(CAST.map(([uid]) => [uid, accountDoc(uid).role]));
  await census("settled");
  await outcomes("settled");
}

async function tellTheStory() {
  mock.timers.enable({ apis: ["Date"], now: new Date(WHEN.building) });
  // The code under test logs an email that fails, with its stack. The story
  // makes two fail on purpose, so what is logged is kept and not printed.
  mock.method(console, "error", (...args) => {
    seen.logged.push(args.map((arg) => (arg instanceof Error ? arg.message : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  });
  world.db = makeDb(
    Object.fromEntries(CAST.map((person) => [`users/${person[0]}`, userDoc(person)])),
    { now: () => new Date() },
  );
  try {
    await theFormIsMade();
    await peopleApply();
    await theCommitteeDecides();
    await decisionDay();
    await peopleReply();
    await theTermSettles();
  } catch (err) {
    seen.crashed = err;
  }
}

// ---------------------------------------------------------------------------
// What the story has to have said
// ---------------------------------------------------------------------------

const short = (response) => [response.status, response.body?.error ?? null];
const censusAt = (label) => {
  const numbers = seen.census[label];
  assert.ok(numbers, `the story took no census called "${label}"`);
  return numbers;
};
const earshotAt = (label) => {
  const found = seen.earshot.find((entry) => entry.label === label);
  assert.ok(found, `the story listened at no moment called "${label}"`);
  return found.heard;
};
/** Everything in a value that is a string, for "does this name anybody else". */
function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => stringsIn(entry, out));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => stringsIn(entry, out));
  return out;
}

describe("one term, from nothing to settled", () => {
  before(tellTheStory);

  test("the story was told to the end, and every request it depended on answered as expected", () => {
    assert.equal(seen.crashed, null, String(seen.crashed?.stack ?? seen.crashed).slice(0, 800));
    assert.deepEqual(
      seen.steps.filter((entry) => ![].concat(entry.expected).includes(entry.status)),
      [],
    );
    assert.ok(seen.steps.length >= 35, `only ${seen.steps.length} steps: part of the story is missing`);
  });

  // -------------------------------------------------------------------------
  describe("1. an admin makes a form from nothing", () => {
    test("the editor makes the question sets that follow from the programmes", () => {
      assert.match(ROUND, /^autumn-2026__[a-z0-9]+$/);
      assert.deepEqual(
        seen.setsAtFirst.map((set) => [set.role, set.scope.type]),
        [
          ["general", "kind"],
          ["stream", "programme"],
          ["stream", "programme"],
          ["general", "kind"],
          ["stream", "programme"],
          ["facilitator", "facilitating"],
        ],
      );
      for (const id of [...Object.values(P), ...Object.values(SET)]) assert.ok(id, "an id the editor minted is missing");
    });

    test("it will not open while it is unready, and says what is missing each time", () => {
      assert.equal(seen.openTooEarly.body.code, "not-ready");
      assert.deepEqual(
        seen.openTooEarly.body.unmet.map((line) => line.id),
        ["window", "decisions", "leads", "general-fellowship", "general-incubator", "facilitator"],
      );
      assert.deepEqual(seen.openWithoutDates.body.unmet.map((line) => line.id), ["window", "decisions"]);
      assert.equal(seen.opened.body.status, "open");
    });

    test("a lead has to be an admin or SU-recognised committee", () => {
      assert.equal(seen.memberAsLead.status, 400);
      assert.match(seen.memberAsLead.body.error, /Leads and reviewers have to be admins or SU-recognised committee/);
    });

    test("opening leaves the round as the other pieces read it", () => {
      const round = seen.roundWhenOpened;
      assert.equal(round.status, "open");
      assert.equal(round.formVersion, 2);
      // The union of every lead and reviewer, which every older gate reads.
      assert.deepEqual([...round.reviewerUids].sort(), ["claudia", "lloyd", "tess", "zach"]);
      assert.deepEqual(seen.usersWhenOpened, { claudia: true, tess: true, lloyd: true, zach: true, yusuf: false });
      assert.equal(round.programmes[P.agi].leadUid, "claudia");
      assert.deepEqual(round.programmes[P.agi].reviewerUids, ["lloyd"]);
      assert.equal(round.programmes[P.agi].places, 3);
      assert.deepEqual(round.questionSetIds.length, 6);
      assert.equal(round.opensAt.toISOString(), "2026-10-06T08:00:00.000Z");
      assert.equal(round.closesAt.toISOString(), "2026-10-18T22:59:00.000Z");
      assert.deepEqual([round.decisionsByDate, round.invitationReplyBy], ["2026-10-23", "2026-10-25"]);
    });

    test("nobody is shown a draft form, and nobody can save before the opening hour", () => {
      assert.deepEqual(short(seen.strangerBeforeOpen), [404, "Form not found."]);
      assert.equal(seen.beforeTheOpening.body.form.windowState, "not-yet");
      assert.deepEqual(short(seen.saveBeforeTheOpening), [403, "Applications have not opened yet."]);
    });
  });

  // -------------------------------------------------------------------------
  describe("2. people apply", () => {
    test("a send with a required answer missing is refused, says where, and counts nobody", () => {
      assert.equal(seen.unfinishedSend.status, 400);
      assert.deepEqual(seen.unfinishedSend.body.issues, [
        { step: `set:${SET.agi}`, questionId: Q.agi.law, message: "Answer this question." },
      ]);
      assert.equal(seen.afterUnfinishedSend.status, "draft");
      assert.equal(seen.afterUnfinishedSend.counters.submitted, 0);
      assert.equal(seen.afterUnfinishedSend.counters.draft, 1);
    });

    test("a member, two accounts still waiting, somebody who ranks two and somebody who would facilitate all send", () => {
      for (const who of APPLICANTS) {
        const { saved, sent, stored } = seen.applied[who];
        assert.deepEqual([saved.status, sent.status], [200, 200], who);
        assert.equal(sent.body.first, true, who);
        // What the committee's screens read: the copy of record, whole.
        assert.equal(stored.status, "submitted", who);
        assert.deepEqual(stored.sent, stored.draft, who);
        assert.deepEqual(stored.sent.rankedProgrammeIds, plans()[who].ranked, who);
        // From the session at the time, never from the request.
        assert.equal(stored.email, address(who), who);
        assert.equal(stored.uid, who);
        assert.equal(stored.roundId, ROUND);
        assert.equal(stored.result, null);
      }
      assert.equal(accountDoc("nell").role, "member");
      assert.equal(seen.applied.oliver.stored.sent.wantsToFacilitate, true);
      assert.equal(seen.applied.oliver.stored.sent.answers[SET.facilitator][Q.facilitator.which], "Research incubator");
      // Answers are kept under the ids a reviewer's score will be keyed by.
      assert.deepEqual(Object.keys(seen.applied.amara.stored.sent.answers).sort(), [SET.agi, SET.fellowships, SET.tais].sort());
      assert.deepEqual(Object.keys(seen.applied.amara.stored.sent.answers[SET.agi]).sort(), [Q.agi.event, Q.agi.law].sort());
    });

    test("an answer changed after sending is saved, not sent, until Send is pressed again", () => {
      const first = seen.applied.amara.stored;
      const saved = seen.amaraSavedAgain.stored;
      assert.equal(saved.status, "submitted");
      assert.equal(saved.draft.answers[SET.fellowships][Q.fellowships.why], "I have changed my mind about why.");
      assert.equal(saved.sent.answers[SET.fellowships][Q.fellowships.why], "I want to understand it.");
      assert.deepEqual(saved.sent, first.sent, "the copy of record is untouched by a save");

      const again = seen.amaraSentAgain;
      assert.equal(again.response.body.first, false);
      assert.equal(again.stored.sent.answers[SET.fellowships][Q.fellowships.why], "I have changed my mind about why.");
      assert.equal(again.stored.submittedAt.getTime(), first.submittedAt.getTime(), "the first send is when they applied");
      assert.ok(again.stored.sentAt.getTime() > first.sentAt.getTime());
    });

    test("the form's counters are the applications, counted", () => {
      const counters = seen.countersAfterApplying;
      assert.equal(counters.submitted, 6);
      assert.equal(counters.draft, 1, "Dev started and has not sent");
      assert.equal(seen.devSaved.status, 200);
    });

    test("somebody with no application is told so, and learns nothing else", () => {
      const { look, send, reply, page } = seen.noApplication;
      assert.equal(look.status, 200);
      assert.equal(look.body.application, null);
      assert.deepEqual(short(send), [404, "There is no application to send yet. Fill in the form first."]);
      assert.equal(reply.status, 404);
      assert.equal(page.view.kind, "none");
    });

    test("nobody signed in, and an account that was refused, reach none of an applicant's routes", () => {
      for (const [name, response] of Object.entries(seen.signedOut)) assert.equal(response.status, 401, name);
      for (const [name, response] of Object.entries(seen.refusedAccount)) {
        assert.deepEqual(short(response), [403, "This account cannot apply."], name);
      }
    });

    test("the questions lock once somebody has applied", () => {
      assert.deepEqual(short(seen.editAfterApplying), [409, "6 people have applied, so the questions are locked."]);
    });

    test("when an admin closes early or opens again, the applicant's routes follow the form's own state", () => {
      const closed = seen.whileClosedEarly;
      assert.deepEqual([closed.staff.key, closed.staff.live, closed.look], ["closed", false, "closed"]);
      assert.equal(closed.save.status, 403);
      assert.equal(closed.send.status, 403);

      assert.equal(seen.reopenUnasked.status, 409);
      assert.equal(seen.reopenUnasked.body.needsConfirmation, true);
      const open = seen.afterReopening;
      assert.deepEqual([open.staff.key, open.staff.live, open.look], ["open", true, "open"]);
      assert.equal(open.save.status, 200);
    });
  });

  // -------------------------------------------------------------------------
  describe("nobody without a role on the form reaches anything of the committee's", () => {
    for (const label of ["while applications are open", "after decision day"]) {
      test(`${label}: every request is refused, nothing is written and nobody is emailed`, () => {
        const { answers, wroteNothing, mailed } = seen.outsiders[label];
        assert.equal(wroteNothing, true, "one of these requests changed a document");
        assert.equal(mailed, 0);
        const wrong = [];
        for (const answer of answers) {
          if (answer.name === "GET forms") {
            // Anybody signed in is answered, with the forms they work on: none.
            const fine =
              answer.who === "nobody signed in"
                ? answer.status === 401
                : answer.status === 200 && answer.forms.length === 0 && answer.canCreate === false;
            if (!fine) wrong.push(answer);
          } else if (answer.who === "nobody signed in" ? answer.status !== 401 : !REFUSED.includes(answer.status)) {
            wrong.push(answer);
          }
        }
        assert.deepEqual(wrong, []);
        // Each of the eleven tried all twenty-five, and the list.
        assert.equal(answers.length, 11 * 26);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe("3. the form closes, reviewers score, leads decide, an admin picks", () => {
    test("after the close nobody can save or send, though nothing moved the form's status", () => {
      const closed = seen.afterTheClose;
      assert.equal(seen.roundWhenOpened.status, "open");
      assert.deepEqual([closed.staff.key, closed.staff.live, closed.look], ["closed", false, "closed"]);
      for (const name of ["save", "send", "amaraSave", "amaraSend"]) {
        assert.deepEqual(short(closed[name]), [403, "Applications have closed, so this application can no longer be changed."], name);
      }
    });

    test("a first review is blind to the others until it is complete", () => {
      const before = seen.lloydBeforeScoring.body.review;
      assert.deepEqual(before.review.others, { count: 1, hidden: 1, visible: [] });
      assert.ok(!stringsIn(seen.lloydBeforeScoring.body).some((text) => text.includes("Strong on the law.")));
      const rowBefore = seen.lloydListBeforeScoring.body.board.rows.find((row) => row.uid === "amara");
      assert.equal(rowBefore.score, null, "the list's score column is blind too");

      // One of two answers scored is not a finished review.
      assert.deepEqual(seen.lloydHalfScored.body.review.review.others, { count: 1, hidden: 1, visible: [] });

      const after = seen.lloydScored.body.review.review.others;
      assert.equal(after.hidden, 0);
      assert.equal(after.visible.length, 1);
      assert.ok(stringsIn(after.visible).some((text) => text.includes("Strong on the law.")));
      const rowAfter = seen.lloydListAfterScoring.body.board.rows.find((row) => row.uid === "amara");
      // The lead gave 4 and 5, the reviewer 3 and 3: one voice each.
      assert.equal(rowAfter.scoreValue, 3.75);
    });

    test("a reviewer cannot decide, a lead cannot decide or read another lead's programme, and only an admin picks", () => {
      assert.equal(seen.reviewerDecides.status, 403);
      assert.ok(REFUSED.includes(seen.leadDecidesElsewhere.status));
      assert.equal(seen.leadReadsElsewhere.status, 404);
      assert.ok(REFUSED.includes(seen.otherLeadDecidesHere.status));
      assert.equal(seen.leadPicksAnOutcome.status, 403);
    });

    test("the decisions are stored where decision day reads them", () => {
      assert.equal(seen.bulkAccept.body.result.changed, 2);
      const decision = (uid) => world.db.read(`admissionDecisions/${ROUND}__${uid}`);
      for (const who of APPLICANTS) {
        assert.equal(decision(who).roundId, ROUND, who);
        assert.equal(decision(who).uid, who, who);
      }
      assert.equal(decision("amara").programmes[P.agi].decision, "accept");
      assert.equal(decision("amara").programmes[P.agi].decidedByUid, "claudia");
      assert.equal(P.tais in decision("amara").programmes, false, "her 2nd choice never had to decide");
      assert.deepEqual(decision("hannah").pooledOutcome.kind, "no-offer");
      assert.deepEqual(
        [decision("abel").programmes[P.tais].poolReason, decision("abel").programmes[P.tais].couldSuitProgrammeId],
        ["better-fit", P.agi],
      );
      assert.equal(decision("priya").programmes[P.tais].decision, "decline");
    });

    test("the send is refused while a decision or a pooled outcome is still owed", () => {
      assert.equal(seen.sendWhileUndecided.status, 409);
      assert.equal(seen.sendWhileUnpicked.status, 409);
    });

    test("an invitation is to a programme the person did not rank, with a place free", () => {
      assert.equal(seen.inviteToARankedProgramme.status, 409);
      assert.equal(seen.inviteWithNoPlaceLeft.status, 409);
    });

    test("every staff screen counts the term the same way before anybody is told", () => {
      const nothing = censusAt("nothing decided");
      assert.deepEqual(nothing.counters, { draft: 1, submitted: 6 });
      assert.deepEqual(nothing.list.agi, {
        counts: { all: 3, toReview: 3, accepted: 0, pooled: 0, declined: 0 },
        placed: 0,
        invited: 0,
        placesLeft: 3,
        waiting: 3,
        rows: ["amara", "hannah", "jasmine"],
        withdrawn: [],
      });
      assert.deepEqual(nothing.tab, { agi: 3, tais: 3, inc: 2 });
      assert.deepEqual(nothing.pool.counts, { pooled: 0, invitations: 0, noOffer: 0, needsOutcome: 0 });
      // The term page: an admin is shown every programme, a lead and a
      // reviewer their own, and only the admin the pooled numbers.
      assert.deepEqual(Object.keys(nothing.term.zach.work), ["agi", "tais", "inc"]);
      for (const who of ["claudia", "lloyd"]) {
        assert.deepEqual(Object.keys(nothing.term[who].work), ["agi"], who);
        assert.equal(nothing.term[who].pool, null, who);
        assert.deepEqual(nothing.term[who].work.agi.counts, nothing.list.agi.counts, who);
      }
      // A reviewer's button counts what they have not finished scoring.
      assert.equal(nothing.term.lloyd.work.agi.waiting, 3);
      assert.equal(nothing.send.applied, 6);
      assert.equal(nothing.send.ready, false);

      const part = censusAt("the incubator still owes two decisions");
      assert.deepEqual(part.list.agi.counts, { all: 3, toReview: 0, accepted: 2, pooled: 1, declined: 0 });
      assert.deepEqual([part.list.agi.placed, part.list.agi.placesLeft], [2, 1]);
      // Amara's 2nd choice owes her nothing: her 1st accepted her.
      assert.deepEqual(part.list.tais.counts, { all: 3, toReview: 0, accepted: 0, pooled: 1, declined: 1 });
      assert.deepEqual(part.list.inc.counts, { all: 2, toReview: 2, accepted: 0, pooled: 0, declined: 0 });
      assert.deepEqual(part.pool.counts, { pooled: 1, invitations: 0, noOffer: 0, needsOutcome: 1 });
      assert.deepEqual(part.term.zach.pool, { pooled: 1, needsOutcome: 1 });

      const decided = censusAt("decided, nothing picked for the pooled");
      assert.deepEqual(decided.pool.counts, { pooled: 3, invitations: 0, noOffer: 0, needsOutcome: 3 });
      assert.deepEqual(decided.pool.rows, ["abel", "hannah", "oliver"]);
      assert.equal(decided.send.ready, false);

      const ready = censusAt("ready to send");
      assert.deepEqual(ready.pool.counts, { pooled: 3, invitations: 2, noOffer: 1, needsOutcome: 0 });
      assert.deepEqual(ready.pool.programmes, {
        agi: { placed: 2, invited: 1, left: 0 },
        tais: { placed: 0, invited: 1, left: 1 },
        inc: { placed: 0, invited: 0, left: 1 },
      });
      assert.deepEqual(ready.send.accepted, ["amara", "jasmine"]);
      assert.deepEqual(ready.send.invited, ["abel", "oliver"]);
      assert.deepEqual(ready.send.noOffer, ["hannah"]);
      assert.equal(ready.send.declined, 1);
      assert.deepEqual(ready.send.pending, { people: 6, emails: 5 });
      assert.equal(ready.send.ready, true);
      // Jasmine is accepted and her join request has not been looked at.
      assert.equal(ready.send.accountsWaiting, 1);
    });
  });

  // -------------------------------------------------------------------------
  describe("4. nobody hears early", () => {
    const BEFORE_THE_SEND = [
      "the form has closed",
      "the reviewers have scored",
      "AGI Strategy has decided",
      "every lead has decided",
      "the pooled outcomes are picked",
      "a test email has been sent",
    ];

    test("the story listened after every thing the committee did", () => {
      assert.deepEqual(seen.earshot.map((entry) => entry.label), BEFORE_THE_SEND);
    });

    for (const label of BEFORE_THE_SEND) {
      test(`${label}: what each applicant's own route returns is what it returned when they sent`, () => {
        const heard = earshotAt(label);
        for (const who of APPLICANTS) {
          const sent = who === "amara" ? seen.amaraSentAgain : seen.applied[who];
          const whenSent = who === "amara" ? sent.response.body.application : sent.sent.body.application;
          assert.equal(heard[who].status, 200, who);
          assert.deepEqual(heard[who].application, whenSent, who);
          // And nothing wrote to their own document, a refused reply included.
          assert.deepEqual(heard[who].stored, sent.stored, who);
        }
      });

      test(`${label}: every applicant's page is the waiting page, and the same one as the day the form closed`, () => {
        const heard = earshotAt(label);
        const atTheClose = earshotAt("the form has closed");
        for (const who of APPLICANTS) {
          assert.equal(heard[who].page.kind, "sent", who);
          assert.deepEqual(heard[who].page, atTheClose[who].page, who);
        }
      });

      test(`${label}: a reply is refused in the same words for everybody, so a refusal tells nobody apart`, () => {
        const heard = earshotAt(label);
        const answers = new Set(APPLICANTS.map((who) => JSON.stringify(heard[who].reply)));
        assert.equal(answers.size, 1);
        assert.equal(heard.amara.reply.status, 409);
      });
    }

    test("a test email goes to the admin who asked, and nothing else is sent before the send", () => {
      assert.equal(seen.testEmail.status, 200);
      assert.equal(seen.testMail.length, 1);
      assert.equal(seen.testMail[0].to, address("zach"));
      assert.equal(seen.testMail[0].kind, "admin-test");
      assert.match(seen.testMail[0].subject, /^\[TEST\] /);
      assert.equal(seen.mailBeforeTheTest, 0);
      assert.deepEqual(seen.beforeAnyPress.mail, []);
      assert.deepEqual(seen.beforeAnyPress.told, []);
    });
  });

  // -------------------------------------------------------------------------
  describe("5. the send", () => {
    /** Everybody is somewhere, and every email is accounted for. */
    const adds = (report, people) => {
      assert.equal(report.published + report.retried + report.skipped + report.changed + report.notReached, people);
      assert.equal(
        report.published + report.retried,
        report.emailed + report.held + report.suppressed + report.failed + report.unconfirmed + report.notEmailed,
      );
    };

    test("only an admin sends, and only for the number the page showed", () => {
      assert.equal(seen.emailsOnTheButton, 5);
      assert.equal(seen.leadSends.status, 403);
      assert.equal(seen.wrongNumber.status, 409);
      assert.match(seen.wrongNumber.body.error, /this would now send 5 emails, not 6/);
    });

    test("a press that the mail server stops tells one person and leaves the term unsent", () => {
      const { report } = seen.firstPress.body;
      assert.deepEqual(
        [report.published, report.emailed, report.failed, report.notReached, report.stopped, report.complete],
        [1, 0, 1, 5, "emails-failing", false],
      );
      assert.deepEqual(report.failedNames, ["Abel Hartley"]);
      adds(report, 6);

      const after = seen.afterFirstPress;
      assert.deepEqual(after.told, ["abel"]);
      assert.equal(after.sentAt, null, "the term is stamped only once everybody has been told");
      assert.equal(after.abel.status, "invited");
      assert.deepEqual(
        [after.abel.result.kind, after.abel.result.programmeId, after.abel.result.email],
        ["invited", P.agi, "owed"],
      );
      assert.deepEqual(
        [after.abel.invitation.programmeId, after.abel.invitation.replyBy, after.abel.invitation.response],
        [P.agi, "2026-10-25", null],
      );
      // Tried, and tried once more, and handed to nobody.
      assert.deepEqual(after.mail.map((mail) => mail.to), [address("abel"), address("abel")]);
      assert.deepEqual(after.accounts, { jasmine: "pending", oliver: "pending" });

      const numbers = censusAt("the send stopped after one person");
      assert.deepEqual(numbers.counters, { draft: 1, submitted: 5, invited: 1 });
      assert.deepEqual(numbers.counters, numbers.byStatus);
      assert.equal(numbers.send.published, 1);
      assert.deepEqual(numbers.send.owed, ["abel"]);
      assert.deepEqual(numbers.send.pending, { people: 5, emails: 4 });
    });

    test("the one person told sees their outcome, and nobody else hears anything yet", () => {
      const heard = seen.outcomes["the send stopped after one person"];
      assert.equal(heard.abel.application.result.kind, "invited");
      assert.equal(heard.abel.page.kind, "invitation");
      const atTheClose = earshotAt("the form has closed");
      for (const who of APPLICANTS.filter((uid) => uid !== "abel")) {
        assert.deepEqual(heard[who].application, atTheClose[who].application, who);
        assert.equal(heard[who].page.kind, "sent", who);
      }
    });

    test("what he was told is fixed from that moment, though the term is not stamped as sent", () => {
      const part = seen.partWay;
      const sentence =
        "Abel Hartley has already been told their decision, so it can’t be changed here. " +
        "If they can’t take up a place, they can give it back from their own application page.";
      assert.deepEqual(short(part.leadChangesIt), [409, sentence]);
      assert.deepEqual(short(part.adminChangesIt), [409, sentence]);
      assert.equal(part.severalAtOnce.status, 200);
      assert.deepEqual(part.severalAtOnce.body.result.refused, [{ uid: "abel", name: "Abel Hartley", reason: sentence }]);
      // Oliver was pooled already, with a reason. Several at once leaves it be.
      assert.deepEqual(
        [part.severalAtOnce.body.result.changed, part.severalAtOnce.body.result.unchanged],
        [0, 1],
      );
      assert.equal(world.db.read(`admissionDecisions/${ROUND}__oliver`).programmes[P.inc].poolReason, "capacity");
      assert.deepEqual(short(part.anotherOutcome), [409, "Abel Hartley has already been told their outcome."]);
      // Nothing about his decisions moved.
      assert.deepEqual(
        [part.decisionAfter.programmes[P.tais].decision, part.decisionAfter.programmes[P.inc].decision],
        ["pool", "pool"],
      );
      assert.deepEqual(
        [part.decisionAfter.pooledOutcome.kind, part.decisionAfter.pooledOutcome.programmeId],
        ["invite", P.agi],
      );
      // The screens are told, so they need not offer what would be refused.
      assert.equal(part.reviewScreen.told, true);
      assert.deepEqual(part.list, [["abel", true], ["amara", false], ["priya", false]]);
    });

    test("somebody the press has not reached can still be decided again", () => {
      assert.deepEqual([seen.partWay.notToldYet.status, seen.partWay.notToldYet.body.changed], [200, true]);
      assert.deepEqual([seen.partWay.andBack.status, seen.partWay.andBack.body.changed], [200, true]);
    });

    test("the second press tells everybody else, sends the email the first one owed, and stamps the term", () => {
      assert.equal(seen.secondButton, 5);
      const { report } = seen.secondPress.body;
      assert.deepEqual(
        [report.published, report.retried, report.emailed, report.failed, report.notEmailed, report.stopped, report.complete],
        [5, 1, 4, 1, 1, null, true],
      );
      assert.deepEqual(report.failedNames, ["Hannah Weiss"]);
      adds(report, 6);

      const after = seen.afterSecondPress;
      assert.deepEqual(after.told, [...APPLICANTS]);
      assert.ok(after.round.decisionsSentAt instanceof Date);
      assert.equal(after.round.decisionsSentByUid, "zach");
      assert.equal(after.round.status, "open", "the send does not move the form's status");
      // Declined, and not emailed: nobody asked for that.
      assert.ok(!after.mail.some((mail) => mail.to === address("priya")));
      assert.equal(after.hannah.email, "owed");
    });

    test("the waiting account that was accepted is a member, in the name of the admin who sent", () => {
      assert.equal(seen.secondPress.body.report.accountsApproved, 1);
      const jasmine = seen.afterSecondPress.accounts.jasmine;
      assert.equal(jasmine.role, "member");
      assert.equal(jasmine.approvedBy, "zach");
      assert.ok(jasmine.approvedAt instanceof Date);
      // Oliver is invited, which is not yet a place.
      assert.equal(seen.afterSecondPress.accounts.oliver.role, "pending");
      const numbers = censusAt("sent, one email owed");
      assert.equal(numbers.send.accountsWaiting, 0);
      assert.deepEqual(numbers.send.owed, ["hannah"]);
    });

    test("pressing Send again sends nothing new", () => {
      assert.equal(seen.pressedAgain.status, 409);
      assert.match(seen.pressedAgain.body.error, /They can’t be sent again\.$/);
      assert.deepEqual(seen.afterPressedAgain.mail, []);
    });

    test("an email that failed is owed, and a later press sends it, once", () => {
      const first = seen.owedPress.body.report;
      assert.deepEqual([first.owedOnly, first.published, first.retried, first.emailed], [true, 0, 1, 1]);
      const again = seen.owedPressAgain.body.report;
      assert.deepEqual([again.published, again.retried, again.emailed], [0, 0, 0]);
      assert.deepEqual(seen.afterOwedPress.mail.map((mail) => mail.to), [address("hannah")]);
      assert.equal(seen.afterOwedPress.hannah.email, "sent");
      assert.ok(seen.afterOwedPress.hannah.emailedAt instanceof Date);
    });

    test("each person is emailed their decision exactly once, with the society's reply address", () => {
      const delivered = world.mail.delivered.filter((to) => to !== address("zach")).sort();
      assert.deepEqual(delivered, ["abel", "amara", "hannah", "jasmine", "oliver"].map(address));
      const subjects = Object.fromEntries(
        seen.allDecisionMail.map((mail) => [mail.to, mail.subject]),
      );
      assert.deepEqual(subjects, {
        [address("abel")]: "An invitation to AGI Strategy",
        [address("amara")]: "You’re in AGI Strategy",
        [address("hannah")]: "Your NAISI application",
        [address("jasmine")]: "You’re in AGI Strategy",
        [address("oliver")]: "An invitation to Technical AI Safety",
      });
      for (const mail of seen.allDecisionMail) {
        assert.equal(mail.replyTo, "ai-safety@uonsu.com", mail.to);
        assert.equal(mail.kind, "admissions", mail.to);
      }
    });

    test("the counts on every staff screen add up, and are the applications recounted", () => {
      const numbers = censusAt("sent, nothing owed");
      assert.deepEqual(numbers.counters, { draft: 1, accepted: 2, invited: 2, "no-offer": 1, declined: 1 });
      assert.deepEqual(numbers.counters, numbers.byStatus);
      assert.deepEqual(numbers.send.pending, { people: 0, emails: 0 });
      assert.deepEqual(numbers.send.owed, []);
      assert.equal(numbers.send.published, 6);
      assert.equal(
        numbers.send.accepted.length + numbers.send.invited.length + numbers.send.noOffer.length + numbers.send.declined,
        numbers.send.applied,
      );
      assert.deepEqual(numbers.send.accepted, numbers.recount.accepted);
      assert.deepEqual(numbers.send.invited, numbers.recount.invited);
      assert.deepEqual(numbers.send.noOffer, numbers.recount.noOffer);
      assert.equal(numbers.send.declined, numbers.recount.declined);
    });

    test("once the term is sent no decision changes, and the dates cannot be used to take applications again", () => {
      const after = seen.afterTheSend;
      assert.deepEqual(short(after.decide), [409, "Decisions for this term have been sent, so they can’t be changed here."]);
      assert.equal(after.revoke.status, 409);
      assert.equal(after.pick.status, 409);
      // The form is still marked open and its close has passed: a later
      // close would have opened it.
      assert.equal(seen.afterSecondPress.round.status, "open");
      assert.deepEqual(short(after.moveTheClose), [
        409,
        "Decisions for this term have been sent, so when applications open and close can no longer change.",
      ]);
      assert.equal(after.closesAt.toISOString(), "2026-10-18T22:59:00.000Z");
      assert.equal(after.window, "closed");
      for (const name of ["devSaves", "devSends", "amaraSaves", "amaraSends", "nellSaves"]) {
        assert.equal(after[name].status, 403, name);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("6. each person sees their own outcome, and replies", () => {
    test("each sees what they were told, on their own route and on their own page", () => {
      const heard = seen.outcomes["everybody has been told"];
      assert.deepEqual(
        Object.fromEntries(APPLICANTS.map((who) => [who, [heard[who].application.result.kind, heard[who].application.result.programmeId, heard[who].page.kind]])),
        {
          abel: ["invited", P.agi, "invitation"],
          amara: ["accepted", P.agi, "place"],
          hannah: ["no-offer", null, "no-place"],
          jasmine: ["accepted", P.agi, "place"],
          oliver: ["invited", P.tais, "invitation"],
          // Declined by the committee. She is told what Hannah is told.
          priya: ["no-offer", null, "no-place"],
        },
      );
      // Somebody who never sent is told nothing was sent.
      assert.equal(heard.dev.application.result, null);
      assert.equal(heard.dev.page.kind, "draft");
    });

    test("and only their own: nothing they are sent names anybody else, or the committee's work", () => {
      const heard = seen.outcomes["everybody has been told"];
      const names = Object.fromEntries(CAST.map(([uid, name]) => [uid, name.split(" ")[0]]));
      for (const who of APPLICANTS) {
        const text = stringsIn([heard[who].application, heard[who].page]).join(" | ");
        for (const [uid, first] of Object.entries(names)) {
          if (uid === who) continue;
          assert.ok(!text.includes(first), `${who} is sent ${first}'s name`);
          assert.ok(!text.includes(address(uid)), `${who} is sent ${uid}'s address`);
        }
        for (const word of ["Strong on the law.", "Fine.", "better-fit", "capacity", "pool"]) {
          assert.ok(!text.includes(word), `${who} is sent "${word}"`);
        }
      }
    });

    test("somebody every programme declined is told exactly what somebody with no offer is told", () => {
      const heard = seen.outcomes["everybody has been told"];
      // On the page.
      const same = (view) => ({ ...view, appliedFor: null, firstName: "" });
      assert.deepEqual(same(heard.priya.page), same(heard.hannah.page));
      // And in what their own route hands their browser, which sits beside the page.
      assert.deepEqual(
        [heard.priya.application.status, heard.priya.application.result.kind],
        [heard.hannah.application.status, heard.hannah.application.result.kind],
      );
      assert.ok(!stringsIn(heard.priya.application).includes("declined"));
      // The committee's own record keeps the word.
      assert.equal(applicationDoc("priya").result.kind, "declined");
      assert.equal(censusAt("sent, nothing owed").send.declined, 1);
    });

    test("a reply that is not theirs to make is refused, and writes nothing", () => {
      const refused = seen.refusedReplies;
      for (const name of [
        "no offer, says coming",
        "no offer, accepts an invitation",
        "declined, says coming",
        "placed by their ranking, turns down an invitation",
        "invited, says coming before accepting",
        "a draft never sent",
      ]) {
        assert.equal(refused[name].status, 409, name);
      }
      assert.equal(refused["no application"].status, 404);
      assert.equal(refused["not a reply"].status, 400);
      assert.equal(seen.refusedRepliesWroteNothing, true);
      // And the two kinds of no are refused in the same words.
      assert.deepEqual(short(refused["declined, says coming"]), short(refused["no offer, says coming"]));
    });

    test("I'm coming records the reply and moves nothing", () => {
      const { response, stored, accountBefore, accountAfter } = seen.replies.amara;
      assert.equal(response.body.changed, true);
      assert.equal(stored.status, "accepted");
      assert.equal(stored.attendance.answer, "coming");
      assert.deepEqual(accountAfter, accountBefore);
      const before = censusAt("sent, nothing owed");
      const after = censusAt("Amara is coming");
      for (const part of ["counters", "list", "tab", "term", "pool", "send", "recount"]) {
        assert.deepEqual(after[part], before[part], part);
      }
    });

    test("I can't make it gives the place back, and what decision day said stays said", () => {
      const { stored, accountBefore, accountAfter } = seen.replies.jasmine;
      assert.equal(stored.status, "withdrawn");
      assert.equal(stored.attendance.answer, "cant-make-it");
      assert.ok(stored.withdrawnAt instanceof Date);
      assert.deepEqual([stored.result.kind, stored.result.programmeId], ["accepted", P.agi]);
      // The send made her a member, and giving the place back does not undo that.
      assert.equal(accountBefore.role, "member");
      assert.deepEqual(accountAfter, accountBefore);
      assert.equal(seen.takesItBack.status, 409, "a place given back is not taken again from the page");
    });

    test("accepting an invitation takes the place and approves the account that was still waiting", () => {
      const { stored, accountBefore, accountAfter } = seen.replies.oliver;
      assert.equal(stored.status, "accepted");
      assert.equal(stored.invitation.response, "accepted");
      assert.deepEqual([stored.result.kind, stored.result.programmeId], ["invited", P.tais]);
      assert.equal(accountBefore.role, "pending");
      assert.equal(accountAfter.role, "member");
      // In the name of the admin who sent the decisions.
      assert.equal(accountAfter.approvedBy, "zach");
      assert.ok(accountAfter.approvedAt instanceof Date);
    });

    test("No thanks gives the invitation back", () => {
      const { stored, accountBefore, accountAfter } = seen.replies.abel;
      assert.equal(stored.status, "withdrawn");
      assert.equal(stored.invitation.response, "declined");
      assert.deepEqual(accountAfter, accountBefore);
    });

    const AFTER_EACH_REPLY = [
      "Amara is coming",
      "Jasmine gave her place back",
      "Oliver accepted his invitation",
      "Abel said no thanks",
    ];

    for (const label of AFTER_EACH_REPLY) {
      test(`${label}: the form's counters are the applications, recounted`, () => {
        const numbers = censusAt(label);
        assert.deepEqual(numbers.counters, numbers.byStatus);
      });

      test(`${label}: every staff screen shows the same numbers, and they are the documents recounted`, () => {
        const numbers = censusAt(label);
        for (const name of PROGRAMMES) {
          const list = numbers.list[name];
          // The review list, to its own lead and to the admin.
          assert.deepEqual(numbers.listAsLead[name], list, `${name}: the lead's list`);
          // The term page, for whoever has a role there.
          assert.deepEqual(numbers.term.zach.work[name].counts, list.counts, `${name}: the term page's counts`);
          assert.equal(numbers.term.zach.work[name].waiting, list.waiting, `${name}: the term page's button`);
          // The number beside the programme's Applications tab.
          assert.equal(numbers.tab[name], list.counts.all, `${name}: the tab`);
          // Pooled applicants.
          assert.deepEqual(
            numbers.pool.programmes[name],
            { placed: list.placed, invited: list.invited, left: list.placesLeft },
            `${name}: free places on the pooled applicants screen`,
          );
          // And the applications themselves, which owe nothing to the decision documents.
          assert.deepEqual(
            { placed: list.placed, invited: list.invited, left: list.placesLeft },
            numbers.recount.holding[name],
            `${name}: a recount of who holds a place`,
          );
          assert.equal(list.counts.all, numbers.recount.ranking[name], `${name}: a recount of who ranked it`);
          // Listed, and not counted: everybody who left still has a row.
          assert.equal(list.rows.length, list.counts.all + list.withdrawn.length, `${name}: rows`);
        }
        assert.deepEqual(numbers.term.claudia.work.agi.counts, numbers.list.agi.counts);
        assert.deepEqual(Object.keys(numbers.term.claudia.work), ["agi"]);
        assert.equal(numbers.term.claudia.pool, null);
        // Decision day.
        assert.equal(numbers.send.applied, numbers.recount.inTerm);
        assert.equal(numbers.send.published, numbers.recount.told);
        assert.deepEqual(numbers.send.accepted, numbers.recount.accepted);
        assert.deepEqual(numbers.send.invited, numbers.recount.invited);
        assert.deepEqual(numbers.send.noOffer, numbers.recount.noOffer);
        assert.equal(numbers.send.declined, numbers.recount.declined);
        assert.equal(numbers.term.zach.pool.pooled, numbers.pool.counts.pooled);
        assert.equal(numbers.pool.counts.pooled, numbers.pool.rows.length);
      });
    }

    test("the numbers themselves, so a wrong answer every screen agreed on would still be seen", () => {
      const gaveBack = censusAt("Jasmine gave her place back");
      assert.deepEqual(gaveBack.counters, { draft: 1, accepted: 1, invited: 2, "no-offer": 1, declined: 1, withdrawn: 1 });
      // AGI Strategy has three places: Amara, the invitation held for Abel, and one free again.
      assert.deepEqual(gaveBack.list.agi, {
        counts: { all: 2, toReview: 0, accepted: 1, pooled: 1, declined: 0 },
        placed: 1,
        invited: 1,
        placesLeft: 1,
        waiting: 0,
        rows: ["amara", "hannah", "jasmine"],
        withdrawn: ["jasmine"],
      });
      assert.equal(gaveBack.send.applied, 5);
      assert.deepEqual(gaveBack.send.accepted, ["amara"]);

      const accepted = censusAt("Oliver accepted his invitation");
      assert.deepEqual(accepted.counters, { draft: 1, accepted: 2, invited: 1, "no-offer": 1, declined: 1, withdrawn: 1 });
      // His place on Technical AI Safety is his, and is still one of its two.
      assert.deepEqual([accepted.list.tais.placed, accepted.list.tais.invited, accepted.list.tais.placesLeft], [0, 1, 1]);

      const noThanks = censusAt("Abel said no thanks");
      assert.deepEqual(noThanks.counters, { draft: 1, accepted: 2, "no-offer": 1, declined: 1, withdrawn: 2 });
      assert.deepEqual([noThanks.list.agi.placed, noThanks.list.agi.invited, noThanks.list.agi.placesLeft], [1, 0, 2]);
      assert.deepEqual(noThanks.list.tais.counts, { all: 2, toReview: 0, accepted: 0, pooled: 0, declined: 1 });
      assert.deepEqual(noThanks.list.tais.withdrawn, ["abel"]);
      assert.deepEqual(noThanks.list.inc.counts, { all: 1, toReview: 0, accepted: 0, pooled: 1, declined: 0 });
      assert.deepEqual(noThanks.pool.counts, { pooled: 2, invitations: 1, noOffer: 1, needsOutcome: 0 });
      assert.deepEqual(noThanks.send.invited, ["oliver"]);
      assert.equal(noThanks.send.applied, 4);
    });

    test("the daily reminder is for an invitation nobody has answered, and stops with the reply", () => {
      // The day after they were told, and before their reply-by day.
      assert.deepEqual(seen.remindersBeforeReplies, ["abel", "oliver"]);
      assert.deepEqual(seen.remindersAfterReplies, []);
    });

    test("each sees their own page afterwards", () => {
      const heard = seen.outcomes["everybody has replied"];
      assert.deepEqual(
        Object.fromEntries(APPLICANTS.map((who) => [who, heard[who].page.kind])),
        { abel: "released", amara: "place", hannah: "no-place", jasmine: "released", oliver: "place", priya: "no-place" },
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("7. the term settles", () => {
    test("only an admin settles, and it settles", () => {
      assert.equal(seen.leadSettles.status, 403);
      assert.deepEqual(
        [seen.settled.body.ok, seen.settled.body.status, seen.settled.body.recordWarning ?? null],
        [true, "settled", null],
      );
      assert.equal(seen.roundWhenSettled.status, "settled");
    });

    test("the member records are written, one for everybody with an application, saying how it ended", () => {
      const entry = (uid) => seen.records[`memberRecords/${uid}/applications/${ROUND}`];
      assert.deepEqual(
        Object.keys(seen.records).filter((path) => path.includes("/applications/")).sort(),
        [...APPLICANTS, "dev"].sort().map((uid) => `memberRecords/${uid}/applications/${ROUND}`),
      );
      assert.deepEqual(
        Object.fromEntries([...APPLICANTS, "dev"].map((uid) => [uid, [entry(uid).outcome.status, entry(uid).outcome.decision]])),
        {
          abel: ["withdrawn", "invited (AGI Strategy)"],
          amara: ["accepted", "accepted (AGI Strategy)"],
          hannah: ["no-offer", "no-offer"],
          jasmine: ["withdrawn", "accepted (AGI Strategy)"],
          oliver: ["accepted", "invited (Technical AI Safety)"],
          priya: ["declined", "declined"],
          dev: ["draft", null],
        },
      );
      assert.deepEqual(entry("amara").appliedFor, ["AGI Strategy", "Technical AI Safety"]);
      assert.deepEqual([entry("amara").writtenBy, entry("amara").writtenByUid], ["settle", "zach"]);
      // The scores the reviewers gave ride along: one voice each.
      assert.equal(entry("amara").scoreSummary.reviewerCount, 2);
      assert.equal(entry("amara").scoreSummary.mean, 3.75);
    });

    test("both accounts that were waiting and were accepted are members, and nobody else's account moved", () => {
      assert.deepEqual(
        seen.accountsAtTheEnd,
        Object.fromEntries(CAST.map(([uid, , role]) => [uid, uid === "jasmine" || uid === "oliver" ? "member" : role])),
      );
    });

    test("settling changes no number, and everybody still reads their own page", () => {
      const before = censusAt("Abel said no thanks");
      const after = censusAt("settled");
      for (const part of ["counters", "byStatus", "list", "tab", "pool", "recount"]) {
        assert.deepEqual(after[part], before[part], part);
      }
      assert.deepEqual(
        Object.fromEntries(APPLICANTS.map((who) => [who, seen.outcomes.settled[who].page.kind])),
        { abel: "released", amara: "place", hannah: "no-place", jasmine: "released", oliver: "place", priya: "no-place" },
      );
      // Their own route still answers them, too.
      for (const who of [...APPLICANTS, "dev"]) assert.equal(seen.outcomes.settled[who].status, 200, who);
    });
  });
});
