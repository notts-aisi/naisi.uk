/**
 * An incubator's teams, for the suites that hold them
 * (`tests/course-hub-teams-*.test.mjs`).
 *
 * ## What it is made of
 *
 * Pitching week's world (`pitchingWorld.mjs`): the form's incubator
 * programme (`research-incubator`, led by Tess, reviewed by Yusuf) names a
 * course run with a Thursday group and a Wednesday group, week 3 ticked as
 * pitching week and published. On top of it:
 *
 *  - THE PEOPLE. The Thursday group holds Amara, Dev, Bea and Tariq from
 *    pitching week's world, and Kai, Lena, Maya and Noor beside them, all
 *    told by Publish: eight taking part. Ines is placed there and NOT told;
 *    Wen sat in it and left; Rory's account was refused after he was told.
 *    The Wednesday group holds Omar.
 *  - THE STAFF. Sofia facilitates the Thursday group (and nothing else);
 *    Tomas is the run's track lead; Claudia leads AGI Strategy, another
 *    programme; Zach is the admin.
 *  - THE SETTINGS. `teamsFrom` is the seed's `madeFrom` ("pitches" unless a
 *    suite says), teams of 2 to 4 (or the seed's `sizes`), made on Thursday
 *    19 November.
 *  - THE PITCHES (for "pitches"): four in week 3, stored as the pitching
 *    routes leave them (`PITCH`): Probe transfer (Amara and Dev; Bea, Kai and
 *    Lena would join, and Ines and Wen, who do not count), Reward hacking
 *    evals (Bea; Maya, Noor, Tariq, Kai and Amara would join), Chess
 *    (Tariq; nobody would join), and in the Wednesday group Omar's.
 *  - THE AGENDA (for "agenda"): the incubator's own question set asks people
 *    to rank `AGENDA`, and each person taking part sent an application to the
 *    form with the ranking in `RANKINGS`.
 *
 * ## What is real and what is stubbed
 *
 * Real: every handler, loader and page a suite loads, the libraries behind
 * them, both deletion cascades, and the team email's template. Stubbed:
 * `server-only`, `next/server`, the Admin SDK's sentinels and handle, the
 * session, the view-as guard, and `sendEmail`, which records what it was
 * handed: no message can leave this process. Stylesheets are their own class
 * names.
 */
import { join } from "node:path";
import { createElement } from "react";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import { GRID, session, userDoc } from "./applicationsSmallTerm.mjs";
import { courseView } from "./courseRunStore.mjs";
import { AGI, CAST, INCUBATOR, ROUND, RUN } from "./handoverWorld.mjs";
import { AT, INC, READING, pitchingSeed } from "./pitchingWorld.mjs";
import { createLoader } from "./tsLoader.mjs";

export { AGI, AT, INC, INCUBATOR, READING, ROUND, RUN };

/** The people beside pitching week's four, each with the name the group sees first. */
const MORE = {
  kai: session("kai", "member", false, "Kai Robertson"),
  lena: session("lena", "member", false, "Lena Brandt"),
  maya: session("maya", "member", false, "Maya Siddiqui"),
  noor: session("noor", "member", false, "Noor Hassan"),
  sofia: session("sofia", "member", false, "Sofia Marin"),
  tomas: session("tomas", "member", false, "Tomas Rey"),
};

/** Everybody taking part in the Thursday group: told, standing, in a live seat. */
export const THURSDAY = ["amara", "dev", "bea", "tariq", "kai", "lena", "maya", "noor"];

/** Every caller a suite asks as, with the words a failure names them by. */
export const CALLERS = [
  ["zach", "an admin"],
  ["tess", "the programme's lead"],
  ["claudia", "the lead of another programme"],
  ["yusuf", "the programme's reviewer"],
  ["tomas", "the run's track lead"],
  ["sofia", "the group's facilitator"],
  ["amara", "a member taking part"],
  ["wen", "a member who left"],
  [null, "somebody signed out"],
];

/** The agenda the incubator's applicants ranked: in-agenda's own items. */
export const AGENDA = [
  "Compute governance",
  "International coordination",
  "Frontier lab safety policies",
  "Open-weight models",
  "AI in elections",
];

/** What each person taking part ranked, first choice first. */
export const RANKINGS = {
  amara: ["Compute governance", "Open-weight models", "AI in elections"],
  dev: ["Compute governance", "International coordination", "Frontier lab safety policies"],
  bea: ["Compute governance", "Frontier lab safety policies", "International coordination"],
  tariq: ["International coordination", "Compute governance", "AI in elections"],
  kai: ["International coordination", "Frontier lab safety policies", "Open-weight models"],
  lena: ["Frontier lab safety policies", "International coordination", "Compute governance"],
  maya: ["Open-weight models", "Compute governance", "Frontier lab safety policies"],
  noor: ["Compute governance", "International coordination", "Open-weight models"],
  omar: ["AI in elections", "Compute governance", "Open-weight models"],
};

const APPLIED_ON = new Date("2026-10-09T14:20:00+01:00");
const SENT_ON = new Date("2026-10-23T09:00:00+01:00");

/** An application to the incubator, sent, ranking the agenda as given, accepted on decision day. */
function incubatorApplication(uid, ranking) {
  const who = CAST[uid] ?? MORE[uid];
  const content = {
    aboutYou: {
      preferredName: who.displayName.split(" ")[0],
      universityEmail: `${uid}@students.example.com`,
      universityEmailVerified: true,
      status: "undergraduate",
      statusOther: "",
      subject: "BA Politics",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments hold up.",
      interests: "Governance",
    },
    rankedProgrammeIds: [INCUBATOR],
    wantsToFacilitate: null,
    answers: { incubator: { agenda: ranking, why: "A sentence nobody else wrote." } },
    availability: { ...GRID, days: ["", "000000000fff", "", "", "", "", ""] },
    suMembership: "yes",
  };
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: who.email,
    displayName: who.displayName,
    draft: content,
    sent: content,
    status: "accepted",
    submittedAt: APPLIED_ON,
    sentAt: APPLIED_ON,
    withdrawnAt: null,
    result: { kind: "accepted", programmeId: INCUBATOR, publishedAt: SENT_ON, email: "sent", emailedAt: SENT_ON },
    invitation: null,
    attendance: null,
    createdAt: APPLIED_ON,
    updatedAt: APPLIED_ON,
  };
}

const seat = (uid, groupId, over = {}) => ({
  runId: INC.run,
  courseId: INC.course,
  uid,
  groupId,
  status: "active",
  role: "learner",
  selfEnrolled: false,
  applicationId: null,
  joinedWeekNumber: 1,
  allocatedEmailAt: new Date("2026-10-28T09:00:00Z"),
  ...over,
});

/** A pitch as the pitching routes store one. */
const pitch = (over) => ({
  runId: INC.run,
  courseId: INC.course,
  groupId: INC.thursday,
  weekId: "w03",
  weekNumber: 3,
  paper: { kind: "reading", materialId: READING.probe, title: "Probes that transfer" },
  pitcherUids: [],
  wouldJoinUids: [],
  createdAt: new Date("2026-11-10T10:00:00Z"),
  updatedAt: new Date("2026-11-10T10:00:00Z"),
  ...over,
});

/** Pitch ids, by what a suite calls them. */
export const PITCH = { probe: "p-probe", reward: "p-reward", chess: "p-chess", omar: "p-omar" };

/**
 * The world as documents by path. `madeFrom` is the run's `teamsFrom` (null
 * for unset), `sizes` its smallest and largest team (null for unset).
 */
export function teamsSeed({ madeFrom = "pitches", sizes = { min: 2, max: 4 }, teamsMadeOn = "2026-11-19" } = {}) {
  const seed = pitchingSeed({
    settings: {
      pickLimit: 3,
      teamSizeMin: sizes?.min ?? null,
      teamSizeMax: sizes?.max ?? null,
      teamsMadeOn,
    },
  });
  const run = seed[`courseRuns/${INC.run}`];
  run.trackLeadUids = ["tomas"];
  if (madeFrom !== null) run.teamsFrom = madeFrom;
  seed[`courseGroups/${INC.thursday}`].facilitatorUids = ["sofia"];
  delete seed[`courseEnrolments/${INC.run}__claudia`];
  seed[`courseEnrolments/${INC.run}__sofia`] = seat("sofia", INC.thursday, { role: "facilitator", allocatedEmailAt: null });
  for (const who of Object.values(MORE)) seed[`users/${who.uid}`] = userDoc(who);
  for (const uid of ["kai", "lena", "maya", "noor"]) seed[`courseEnrolments/${INC.run}__${uid}`] = seat(uid, INC.thursday);

  if (madeFrom === "pitches") {
    seed[`coursePitches/${PITCH.probe}`] = pitch({
      title: "Probe transfer",
      twist: "Test whether the probes still work on a smaller open model",
      pitcherUids: ["amara", "dev"],
      wouldJoinUids: ["bea", "kai", "lena", "ines", "wen"],
      createdAt: new Date("2026-11-10T10:00:00Z"),
    });
    seed[`coursePitches/${PITCH.reward}`] = pitch({
      title: "Reward hacking evals",
      paper: { kind: "typed", title: "Reward hacking in the wild" },
      twist: "Rebuild the evaluation with tasks written by the team",
      pitcherUids: ["bea"],
      wouldJoinUids: ["maya", "noor", "tariq", "kai", "amara"],
      createdAt: new Date("2026-11-10T11:00:00Z"),
    });
    seed[`coursePitches/${PITCH.chess}`] = pitch({
      title: "Interpretability of chess models",
      twist: "Check whether a smaller chess model learns the same features",
      pitcherUids: ["tariq"],
      wouldJoinUids: [],
      createdAt: new Date("2026-11-10T12:00:00Z"),
    });
    seed[`coursePitches/${PITCH.omar}`] = pitch({
      groupId: INC.wednesday,
      title: "Red-teaming a small chatbot",
      twist: "Write new attacks and test them on a small open chatbot",
      pitcherUids: ["omar"],
      wouldJoinUids: [],
      createdAt: new Date("2026-11-10T13:00:00Z"),
    });
  }

  if (madeFrom === "agenda") {
    const form = seed[`admissionRounds/${ROUND}`];
    form.questionSetIds = [...form.questionSetIds, "incubator"];
    seed[`admissionRounds/${ROUND}/questionSets/incubator`] = {
      roundId: ROUND,
      intro: "",
      role: "stream",
      scope: { type: "programme", programmeId: INCUBATOR },
      label: "Research incubator",
      applicantLine: "",
      questions: [
        {
          id: "agenda",
          text: "Put the projects in the order you’d like to work on them.",
          help: "",
          type: "rank",
          options: [...AGENDA],
          optionsFromRanking: false,
          wordLimit: null,
          required: true,
          scored: false,
        },
        {
          id: "why",
          text: "Take your first choice. What would you do in your first week on it?",
          help: "",
          type: "long",
          options: [],
          optionsFromRanking: false,
          wordLimit: null,
          required: true,
          scored: false,
        },
      ],
    };
    for (const [uid, ranking] of Object.entries(RANKINGS)) {
      seed[`admissionApplications/${ROUND}__${uid}`] = incubatorApplication(uid, ranking);
    }
  }
  return seed;
}

/** The Admin SDK's sentinels the store resolves, a `Timestamp`, and a `FieldPath`. */
const FIRESTORE_STUB =
  FIELD_VALUE_STUB.replace(
    "export class Timestamp {}",
    "export class Timestamp {" +
      " static now() { return new Date(); }" +
      " static fromDate(date) { return date; }" +
      " static fromMillis(ms) { return new Date(ms); }" +
      " }",
  ) +
  " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }";

const NEXT_SERVER_STUB =
  "export class NextResponse {\n" +
  "  constructor(body, init) {\n" +
  "    this.body = body;\n" +
  "    this.status = (init && init.status) || 200;\n" +
  "    this.headers = (init && init.headers) || {};\n" +
  "  }\n" +
  "  static json(body, init) { return new NextResponse(body, init); }\n" +
  "  async json() { return this.body; }\n" +
  "}";

/**
 * A stand-in for `sendEmail`: it writes down what it was handed, and that is
 * all. `world.mailFate`, when a suite sets it, says what the real door would
 * have answered for one message: "held", "suppressed" or "fail" (it throws).
 */
const MAIL_DOOR = (handle) =>
  "export async function sendEmail(args) {\n" +
  `  const w = ${handle};\n` +
  "  const fate = w.mailFate ? w.mailFate(args) : 'sent';\n" +
  "  if (fate === 'fail') throw new Error('the mail door refused');\n" +
  "  w.mail.push(args);\n" +
  "  if (fate === 'held') return { messageId: '', delivered: [], suppressed: [], held: [args.to] };\n" +
  "  if (fate === 'suppressed') return { messageId: '', delivered: [], suppressed: [args.to], held: [] };\n" +
  "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
  "}";

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

const STYLESHEETS = [
  "./ProgrammeTeams.module.css",
  "./ProgrammeFrame.module.css",
  "@/features/applications/editor/ProgrammeFrame.module.css",
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./Button.module.css",
  "./Select.module.css",
  "./InitialsChip.module.css",
  "./Modal.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  // The Teams tab's Hand-ins section, from the team pages (src/features/courses/team/).
  "./team.module.css",
  "@/features/courses/team/team.module.css",
];

/**
 * A world, its loaders, its routes and the way to make a request in it. `key`
 * names the handle on `globalThis` the stubs read.
 */
export async function makeTeamsWorld(key = "__teams") {
  const world = {
    db: null,
    courseDb: null,
    user: null,
    viewAs: false,
    mail: [],
    mailFate: null,
    /** The tab the programme's tabs are drawn on, for the layout. */
    ui: { segment: "teams", hydrated: false },
    h: createElement,
  };
  globalThis[key] = world;
  const handle = `globalThis[${JSON.stringify(key)}]`;

  const serverStubs = [
    ["server-only", "export {};"],
    ["next/server", NEXT_SERVER_STUB],
    ["firebase-admin/firestore", FIRESTORE_STUB],
    ["@/lib/firebase/admin", `export function getAdminDb() { return ${handle}.courseDb; }`],
    ["@/lib/firebase/session", `export async function getCurrentUser() { return ${handle}.user; }`],
    ["./session", `export async function getCurrentUser() { return ${handle}.user; }`],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() {\n" +
        `  return ${handle}.viewAs ? { status: 403, body: { error: 'view-as' } } : null;\n` +
        "}\n" +
        "export async function getImpersonator() {\n" +
        `  return ${handle}.viewAs ? { actorUid: 'zach', actorName: 'Zach Levin' } : null;\n` +
        "}\n" +
        "export function markerIsLive(marker, currentUid) {\n" +
        "  return marker !== null && marker.actorUid !== currentUid;\n" +
        "}",
    ],
    ["@/lib/email/send", MAIL_DOOR(handle)],
    ["./send", MAIL_DOOR(handle)],
  ];
  const { loadTs } = createLoader({ stubs: new Map(serverStubs) });

  /** The pages and the layout, rendered to HTML: Next's client hooks, its link and every stylesheet stood in. */
  const { loadTs: loadUi } = createLoader({
    stubs: new Map([
      ...serverStubs,
      [
        "next/navigation",
        "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
          `export function useSelectedLayoutSegment() { return ${handle}.ui.segment; }\n` +
          "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }\n" +
          "export function usePathname() { return '/'; }",
      ],
      [
        "next/link",
        "export default ({ href, className, children, scroll, prefetch, ...rest }) =>\n" +
          `  ${handle}.h('a', { href, className, ...rest }, children);`,
      ],
      ["@/hooks/useHydrated", `export function useHydrated() { return ${handle}.ui.hydrated === true; }`],
      [
        "@/features/applications/editor/Refusals",
        `const h = (...args) => ${handle}.h(...args);\n` +
          "export function Refusal({ title, children, href, action }) {\n" +
          "  return h('section', { 'data-refusal': '' }, h('h1', null, title), h('p', null, children), h('a', { href }, action));\n" +
          "}\n" +
          "export function NoProgrammeHere() { return h('section', { 'data-refusal': '' }, 'There is no programme here'); }",
      ],
      ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
    ]),
  });

  /**
   * The course editors' client writes, with the Firebase client SDK stood in:
   * each write is recorded in `world.clientWrites` rather than sent.
   */
  const { loadTs: loadClient } = createLoader({
    stubs: new Map([
      [
        "firebase/firestore",
        "export function doc(db, ...path) { return { path: path.join('/') }; }\n" +
          "export function collection(db, ...path) { return { path: path.join('/') }; }\n" +
          "export function serverTimestamp() { return '__now__'; }\n" +
          "export function deleteField() { return '__delete__'; }\n" +
          "export async function getDoc() { return { exists: () => false, data: () => undefined }; }\n" +
          `export async function setDoc(ref, data) { ${handle}.clientWrites.push(['set', ref.path, data]); }\n` +
          `export async function updateDoc(ref, data) { ${handle}.clientWrites.push(['update', ref.path, data]); }`,
      ],
      [
        "@/lib/firebase/client",
        "export function getClientDb() { return {}; }\n" +
          "export function getClientAuth() { return { currentUser: { uid: 'zach' } }; }",
      ],
    ]),
  });

  function reset(seed = teamsSeed()) {
    world.clientWrites = [];
    world.db = makeDb(seed, { now: () => new Date() });
    world.courseDb = courseView(world.db);
    world.user = null;
    world.viewAs = false;
    world.mail.length = 0;
    world.mailFate = null;
    world.ui = { segment: "teams", hydrated: false };
    return world.db;
  }

  /** The session a request arrives with: the account as it is stored right now. */
  function sessionOf(uid) {
    if (!uid) return null;
    const account = world.db.read(`users/${uid}`);
    if (!account) return null;
    return {
      uid,
      email: account.email,
      displayName: account.displayName,
      role: account.role,
      suRecognised: account.suRecognised === true,
      admissionsReviewer: account.admissionsReviewer === true,
      permissions: CAST[uid]?.permissions ?? MORE[uid]?.permissions ?? CAST.amara.permissions,
    };
  }

  /** One request to a real handler, as `who`. Answers `{ status, body }`; a handler that throws is a 599. */
  async function call(who, handler, params, { body, viewAs = false } = {}) {
    world.user = sessionOf(who);
    world.viewAs = viewAs;
    const init = { method: handler.name, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
    try {
      const response = await handler(new Request("https://naisi.invalid/api", init), {
        params: Promise.resolve(params),
      });
      return { status: response.status, body: structuredClone(response.body) };
    } catch (err) {
      return { status: 599, body: { error: String(err?.stack ?? err) } };
    } finally {
      world.viewAs = false;
    }
  }

  const route = (...parts) =>
    loadTs(join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "teams", ...parts, "route.ts"));
  const routes = { teams: await route(), tell: await route("tell"), test: await route("tell", "test") };
  const lib = {
    load: await loadTs(join("lib", "applications", "handover", "teamsLoad.ts")),
  };

  const params = (programmeId = INCUBATOR) => ({ roundId: ROUND, programmeId });
  const ask = {
    /** A press on the Teams tab: make, move or remove. */
    act: (who, body, { programmeId = INCUBATOR, viewAs = false } = {}) =>
      call(who, routes.teams.POST, params(programmeId), { body, viewAs }),
    fromPitch: (who, pitchId, options) => ask.act(who, { action: "from-pitch", pitchId }, options),
    fromAgenda: (who, options) => ask.act(who, { action: "from-agenda" }, options),
    move: (who, uid, teamId, options) => ask.act(who, { action: "move", uid, teamId }, options),
    remove: (who, teamId, options) => ask.act(who, { action: "remove", teamId }, options),
    test: (who, { programmeId = INCUBATOR, viewAs = false } = {}) =>
      call(who, routes.test.POST, params(programmeId), { body: {}, viewAs }),
    tell: (who, emails, { programmeId = INCUBATOR, viewAs = false } = {}) =>
      call(who, routes.tell.POST, params(programmeId), { body: { emails }, viewAs }),
    /** The tab as `who` would be shown it. */
    async view(who, programmeId = INCUBATOR) {
      world.user = sessionOf(who);
      return lib.load.loadProgrammeTeams(world.courseDb, world.user, ROUND, programmeId);
    },
  };

  /** Every stored team. */
  const teams = () =>
    world.db
      .paths()
      .filter((path) => path.startsWith("courseTeams/"))
      .map((path) => ({ id: path.split("/")[1], ...world.db.read(path) }));
  const teamNamed = (name) => teams().find((team) => team.name === name) ?? null;

  /** The whole database as one string, to prove a request wrote nothing. */
  const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

  return { world, loadTs, loadUi, loadClient, reset, call, sessionOf, routes, lib, ask, teams, teamNamed, everything };
}

/** `[status, error]`, for comparing a refusal in one line. */
export const short = (response) => [response.status, response.body?.error ?? null];

/** HTML as the words a person reads. */
export const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
