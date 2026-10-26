/**
 * Pitching week, on an incubator's course run, for the suites that hold it
 * (`tests/course-hub-pitching-*.test.mjs`).
 *
 * ## What it is made of
 *
 * The term after decision day is `handoverWorld`'s (its form, its cast, the
 * AGI Strategy run and its groups). On top of it, the form's incubator
 * programme (`research-incubator`, led by Tess, with Yusuf as its reviewer)
 * names a course run of its own:
 *
 *  - the run starts on Thursday 29 October 2026 and has seven taught weeks;
 *    week 3 is ticked as pitching week and published, with two readings and a
 *    video. Its settings: pick up to 3, teams of 2 to 4, made on Thursday 19
 *    November;
 *  - two groups. Thursday evening (Thursdays 6pm, facilitated by Claudia, who
 *    leads AGI Strategy) holds Amara, Dev, Bea and Tariq, all told by Publish,
 *    and Ines, placed and NOT told; Wen sat in it and left (withdrawn); Rory's
 *    account was refused after he was told. Wednesday evening (Wednesdays
 *    6:30pm) holds Omar;
 *  - Nina holds a told seat on the AGI Strategy run, so she is on another run.
 *
 * So week 3's session is Thursday 12 November at 6pm (GMT, so 18:00Z) for the
 * Thursday group and Wednesday 18 November at 6:30pm for the Wednesday group.
 * `pitchingSeed({ startDate: "2026-10-08" })` moves the run three weeks earlier,
 * so week 3's session is Thursday 22 October at 6pm, BST, which is 17:00Z.
 *
 * ## What is real and what is stubbed
 *
 * Real: every handler and loader a suite loads, the libraries behind them
 * (the gate, the told rule, the standing checks, the group's calendar, the
 * words), and both deletion cascades. Stubbed: `server-only`, `next/server`,
 * the Admin SDK's sentinels and handle, the session and the view-as guard.
 * Nothing in pitching week sends anything.
 *
 * The clock is the suite's: each one mocks `Date` (`mock.timers`).
 */
import { join } from "node:path";
import { createElement } from "react";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import { courseView } from "./courseRunStore.mjs";
import { AGI, CAST, COURSE, GROUP, INCUBATOR, ROUND, RUN, groupDoc, runDoc, seedWorld } from "./handoverWorld.mjs";
import { createLoader } from "./tsLoader.mjs";

export { AGI, CAST, COURSE, GROUP, INCUBATOR, ROUND, RUN };

export const INC = {
  course: "research-incubator__c0urse05",
  run: "research-incubator-autumn-2026__run00009",
  thursday: "inc-autumn-2026-thursday__grp00010",
  wednesday: "inc-autumn-2026-wednesday__grp00011",
};

/** Week 3's two readings. */
export const READING = { probe: "m_probe_paper", reward: "m_reward_paper" };

/** People in the Thursday group who were told it. */
export const THURSDAY = ["amara", "dev", "bea", "tariq"];

/** Instants that matter, in UTC. November is GMT; 22 October is BST. */
export const AT = {
  /** Wednesday 11 November, noon in London: pitching is open. */
  wednesdayNoon: new Date("2026-11-11T12:00:00Z"),
  /** Thursday 12 November, 10am in London: the session is tonight. */
  thursdayMorning: new Date("2026-11-12T10:00:00Z"),
  /** One second before the Thursday group's session, 6pm GMT. */
  justBefore: new Date("2026-11-12T17:59:59Z"),
  /** The Thursday group's session starts. */
  sessionStarts: new Date("2026-11-12T18:00:00Z"),
  /** The Thursday group's session day, after it. */
  thursdayNight: new Date("2026-11-12T21:00:00Z"),
  /** The next day. */
  friday: new Date("2026-11-13T10:00:00Z"),
};

const week = (n, over = {}) => ({
  weekNumber: n,
  title: `Week ${n}`,
  summary: "",
  guideBlocks: [],
  materials: [],
  exercises: [],
  checklist: [],
  estimatedMinutes: null,
  published: n <= 3,
  ...over,
});

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

/** The world as documents by path. `startDate` moves the incubator's run. */
export function pitchingSeed({ startDate = "2026-10-29", settings = undefined } = {}) {
  const seed = seedWorld();
  const form = seed[`admissionRounds/${ROUND}`];
  form.programmes[INCUBATOR].courseId = INC.course;
  form.programmes[INCUBATOR].runId = INC.run;
  form.programmes[INCUBATOR].reviewerUids = ["yusuf"];
  form.programmes[AGI].runId = RUN.agi;

  seed[`courses/${INC.course}`] = { title: "Research Incubator", status: "published" };
  seed[`courseRuns/${INC.run}`] = runDoc({
    courseId: INC.course,
    courseTitle: "Research Incubator",
    status: "running",
    startDate,
    weekPlan: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ kind: "week", weekNumber: n, weekId: `w0${n}` })),
    groupCount: 2,
    pitchSettings:
      settings === undefined
        ? { pickLimit: 3, teamSizeMin: 2, teamSizeMax: 4, teamsMadeOn: "2026-11-19" }
        : settings,
  });
  seed[`courseGroups/${INC.thursday}`] = groupDoc({
    runId: INC.run,
    courseId: INC.course,
    name: "Thursday evening",
    facilitatorUids: ["claudia"],
    capacity: 12,
    memberCount: 6,
    session: {
      weekday: 4,
      startTimeLocal: "18:00",
      durationMinutes: 120,
      location: "Room A13",
      meetingUrl: null,
      notes: "",
    },
  });
  seed[`courseGroups/${INC.wednesday}`] = groupDoc({
    runId: INC.run,
    courseId: INC.course,
    name: "Wednesday evening",
    facilitatorUids: [],
    capacity: 12,
    memberCount: 1,
    session: {
      weekday: 3,
      startTimeLocal: "18:30",
      durationMinutes: 120,
      location: "Room B5",
      meetingUrl: null,
      notes: "",
    },
  });
  seed[`courseRuns/${INC.run}/weeks/w01`] = week(1);
  seed[`courseRuns/${INC.run}/weeks/w02`] = week(2);
  seed[`courseRuns/${INC.run}/weeks/w03`] = week(3, {
    title: "Pitching week",
    pitching: true,
    materials: [
      { id: READING.probe, type: "reading", title: "Probes that transfer", url: "https://example.com/probes", minutes: 30, required: true },
      { id: READING.reward, type: "reading", title: "Reward hacking in the wild", url: "https://example.com/reward", minutes: 25, required: true },
      { id: "m_talk_video", type: "video", title: "A talk", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", minutes: 20, required: false },
    ],
  });

  for (const uid of THURSDAY) seed[`courseEnrolments/${INC.run}__${uid}`] = seat(uid, INC.thursday);
  seed[`courseEnrolments/${INC.run}__ines`] = seat("ines", INC.thursday, { allocatedEmailAt: null });
  seed[`courseEnrolments/${INC.run}__wen`] = seat("wen", INC.thursday, { status: "withdrawn" });
  seed[`courseEnrolments/${INC.run}__refused`] = seat("refused", INC.thursday);
  seed[`courseEnrolments/${INC.run}__omar`] = seat("omar", INC.wednesday);
  seed[`courseEnrolments/${INC.run}__claudia`] = seat("claudia", null, { role: "facilitator", allocatedEmailAt: null });
  seed[`courseEnrolments/${RUN.agi}__nina`] = seat("nina", GROUP.monday, { runId: RUN.agi, courseId: COURSE.agi });
  return seed;
}

/** The Admin SDK's sentinels the store resolves, a `Timestamp`, and a `FieldPath` with its document id. */
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

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

/**
 * A world, its loaders, its routes and the way to make a request in it. `key`
 * names the handle on `globalThis` the stubs read.
 */
export async function makePitchingWorld(key = "__pitching") {
  const world = {
    db: null,
    courseDb: null,
    user: null,
    viewAs: false,
    /** The page under test's address and its router's replacements. */
    ui: { pathname: "/learn", replaced: [] },
    /** React's element maker, for the stubs, which cannot import. */
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
    // The page gates import the session by its own name.
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
  ];
  const { loadTs } = createLoader({ stubs: new Map(serverStubs) });

  /**
   * The pages, rendered to HTML: the same server stubs, and Next's client
   * hooks, its link and every stylesheet stood in.
   */
  const { loadTs: loadUi } = createLoader({
    stubs: new Map([
      ...serverStubs,
      [
        "next/navigation",
        `export function useRouter() { return { replace: (to) => ${handle}.ui.replaced.push(to), push() {}, refresh() {} }; }\n` +
          `export function usePathname() { return ${handle}.ui.pathname; }\n` +
          "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }",
      ],
      [
        "next/link",
        "export default ({ href, className, children, scroll, prefetch, ...rest }) =>\n" +
          `  ${handle}.h('a', { href, className, ...rest }, children);`,
      ],
      // Whether the page's script has arrived: false, as in the server's own
      // markup, unless a suite says otherwise.
      ["@/hooks/useHydrated", `export function useHydrated() { return ${handle}.ui.hydrated === true; }`],
      ["./GroupsViews.module.css", CLASS_NAMES],
      ["./PitchingWeek.module.css", CLASS_NAMES],
      ["./ProgrammePitches.module.css", CLASS_NAMES],
      ["./Select.module.css", CLASS_NAMES],
      ["./TimesPicture.module.css", CLASS_NAMES],
      // The Times view's dialogs (the site's Modal, in the editor's frame).
      ["./Modal.module.css", CLASS_NAMES],
      ["./editor.module.css", CLASS_NAMES],
      ["./kit.module.css", CLASS_NAMES],
      ["@/features/applications/kit/kit.module.css", CLASS_NAMES],
      ["@/features/applications/editor/editor.module.css", CLASS_NAMES],
      [
        "@/features/applications/editor/Refusals",
        `const h = (...args) => ${handle}.h(...args);\n` +
          "export function Refusal({ title, children, href, action }) {\n" +
          "  return h('section', { 'data-refusal': '' }, h('h1', null, title), h('p', null, children), h('a', { href }, action));\n" +
          "}\n" +
          "export function NoProgrammeHere() { return h('section', { 'data-refusal': '' }, 'There is no programme here'); }",
      ],
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
          "export function getClientAuth() { return { currentUser: { uid: 'tess' } }; }",
      ],
    ]),
  });

  function reset(seed = pitchingSeed()) {
    world.clientWrites = [];
    world.db = makeDb(seed, { now: () => new Date() });
    world.courseDb = courseView(world.db);
    world.user = null;
    world.viewAs = false;
    world.ui = { pathname: `/learn/${INC.run}/pitching`, replaced: [], hydrated: false };
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
      // The flag the form's roles writer keeps, which the admissions tree's gate reads.
      admissionsReviewer: account.admissionsReviewer === true,
      permissions: CAST[uid]?.permissions ?? {
        draftNewsletter: false,
        approveNewsletter: false,
        draftEvent: false,
        approveEvent: false,
        draftCourse: false,
        approveCourse: false,
        manageMembership: false,
        circulateWorksheet: false,
      },
    };
  }

  /**
   * One request to a real handler, as `who`. `viewAs` is an admin's view-as
   * session: the session is `who`'s, as it is on the site. Answers
   * `{ status, body }`; a handler that throws is a 599.
   */
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

  const route = (...parts) => loadTs(join("app", "api", "courses", "runs", "[runId]", "pitching", ...parts, "route.ts"));
  const routes = {
    view: await route(),
    pitch: await route("pitch"),
    picks: await route("picks"),
  };
  const lib = {
    load: await loadTs(join("lib", "courses", "pitching", "load.ts")),
    staff: await loadTs(join("lib", "applications", "handover", "pitchesLoad.ts")),
    times: await loadTs(join("lib", "applications", "handover", "timesLoad.ts")),
    programmeRun: await loadTs(join("lib", "applications", "handover", "programmeRun.ts")),
  };

  const params = { runId: INC.run };
  const ask = {
    view: (who, options) => call(who, routes.view.GET, params, options),
    pitch: (who, body, options = {}) => call(who, routes.pitch.POST, params, { ...options, body }),
    pick: (who, pitchId, join = true, options = {}) =>
      call(who, routes.picks.POST, params, { ...options, body: { pitchId, join } }),
    /** The lead's and admins' list, as `who`. */
    async staff(who, programmeId = INCUBATOR) {
      world.user = sessionOf(who);
      return lib.staff.loadProgrammePitches(world.courseDb, world.user, ROUND, programmeId);
    },
    /** The run home's card, as `who`. */
    async card(who) {
      world.user = sessionOf(who);
      return lib.load.pitchingCard(world.courseDb, world.user, INC.run);
    },
  };

  /** A pitch body, with the parts a test changes. */
  const pitchBody = (over = {}) => ({
    title: "Probe transfer",
    paper: { kind: "reading", materialId: READING.probe },
    twist: "Test whether the probes still work on a smaller open model.",
    partnerUid: null,
    ...over,
  });

  /** Every stored pitch, by its title. */
  const pitches = () =>
    world.db
      .paths()
      .filter((path) => path.startsWith("coursePitches/"))
      .map((path) => ({ id: path.split("/")[1], ...world.db.read(path) }));
  const pitchTitled = (title) => pitches().find((pitch) => pitch.title === title) ?? null;

  /** The whole database as one string, to prove a request wrote nothing. */
  const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

  return { world, loadTs, loadUi, loadClient, reset, call, sessionOf, routes, lib, ask, pitchBody, pitches, pitchTitled, everything };
}

/** `[status, error]`, for comparing a refusal in one line. */
export const short = (response) => [response.status, response.body?.error ?? null];
