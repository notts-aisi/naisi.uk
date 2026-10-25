/**
 * The end of AGI Strategy's run, for the suites about who finished
 * (`tests/course-hub-finishing-*.test.mjs`, board en-finish, Q8, C43).
 *
 * ## What it is made of
 *
 * The Attendance tab's world (`hubAttendanceWorld.mjs`: AGI Strategy names
 * its run, Claudia leads it, Lloyd reviews it, Yusuf is the run's track lead,
 * Tess leads another programme; four groups and their people), taken to the
 * end of its six weeks:
 *
 *  - THE GROUPS meet for two hours: Group A on Thursdays at 6pm (Sofia),
 *    Group B on Tuesdays at 6pm (Rahul and Sofia), Group C on Wednesdays at
 *    1pm (Tom), Group D on Mondays at 6pm (Grace). Group B's session on Tue
 *    24 Nov (week 4) was cancelled through "Change a session". The last
 *    session is Group C's on Wed 9 Dec, over at 3pm.
 *  - THE CLOCK. `END` is Thu 10 Dec 2026 at noon: the run is over. `BEFORE`
 *    is Wed 9 Dec at noon, before Group C's last session.
 *  - THE REGISTERS, all six weeks, every one finished. Came (present, late,
 *    left early) of the sessions each group held:
 *      Group A: Amara 6 of 6; Dev 4 of 6 (late in week 1; missed 4 and 5);
 *               Bea 2 of 6 (excused in week 2; missed 4, 5 and 6); Tariq
 *               3 of 6 (missed 2, 3 and 6); Sam left on Fri 6 Nov.
 *      Group B: Chloe 5 of 5; Farah 3 of 5 (missed 5 and 6); Kofi 3 of 5
 *               (excused in weeks 1 and 3); Omar was taken off after week 1.
 *      Group C: Hamza 6 of 6; Una, placed by an admin and never told, 4.
 *      Group D: Freya 1 of 6; Yasmin 5 of 6.
 *  - THE EXERCISES. Each published week sets one exercise; Group C's own
 *    copy of week 6 sets two, so Group C was set seven. What each person
 *    sent is `ANSWERED`; a draft never sent and an answer to an exercise no
 *    week sets count for nobody.
 *  - NO RULE AND NO DECISION until a suite stores one (`RULE`, `decision`).
 *
 * ## What is real and what is stubbed
 *
 * Real: both routes, the Overview and Settings pages and the programme's
 * head, the run home's route and the hub's, the member's run home, card,
 * Home line and programmes list, and every library under them. Stubbed:
 * `server-only`, `next/server`, the Admin SDK's sentinels and handle, the
 * session, the view-as guard, `next/link`, `next/navigation`, the
 * stylesheets, and on the member's pages the parts drawn around the words
 * this world is about. Every address is `example.com`.
 */
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./applicationsStore.mjs";
import { CAST } from "./applicationsSmallTerm.mjs";
import { courseView } from "./courseRunStore.mjs";
import { A, AGI, B, C, COURSE, D, PEOPLE, ROUND, RUN, attendanceSeed, register, registerPath } from "./hubAttendanceWorld.mjs";
import { createLoader } from "./tsLoader.mjs";

export { A, AGI, B, C, COURSE, D, PEOPLE, ROUND, RUN };

/** Thu 10 Dec 2026 at noon in London: the run is over. */
export const END = new Date("2026-12-10T12:00:00Z");
/** Wed 9 Dec 2026 at noon: Group C's last session, at 1pm, is still to come. */
export const BEFORE = new Date("2026-12-09T12:00:00Z");
/** When Group C's last session ends: the moment who finished can be said. */
export const LAST_ENDS = new Date("2026-12-09T15:00:00Z");

/** The registers, week 1 to 6, for each group. `null` is a week the person has no mark. */
const MARKS = {
  [A]: {
    amara: ["present", "present", "present", "present", "present", "present"],
    dev: ["late", "present", "present", "absent", "absent", "present"],
    bea: ["present", "excused", "present", "absent", "absent", "absent"],
    tariq: ["present", "absent", "absent", "present", "present", "absent"],
    sam: ["present", "absent", null, null, null, null],
  },
  [B]: {
    chloe: ["present", "present", "present", null, "present", "present"],
    farah: ["present", "late", "present", null, "absent", "absent"],
    kofi: ["excused", "present", "excused", null, "present", "present"],
    omar: ["present", null, null, null, null, null],
  },
  [C]: {
    hamza: ["present", "present", "present", "present", "present", "present"],
    una: ["present", "present", "present", "present", "absent", "absent"],
  },
  [D]: {
    freya: ["present", "absent", "absent", "absent", "absent", "absent"],
    yasmin: ["present", "present", "present", "present", "present", "absent"],
  },
};

/** Each person's exercises sent: week numbers, and "6b" for Group C's second in week 6. */
export const ANSWERED = {
  amara: [1, 2, 3, 4, 5, 6],
  dev: [1, 2, 3, 4],
  bea: [1, 2],
  tariq: [],
  chloe: [1, 2, 3, 4, 5, 6],
  farah: [1],
  kofi: [1, 2, 3, 4, 5, 6],
  hamza: [1, 2, 3, 4, 5],
  una: [1, 2],
  freya: [1, 2],
  yasmin: [1, 2, 3, 4],
};

const exercise = (id) => ({ id, prompt: `Answer for ${id}.`, responseType: "text", required: true, maxLength: 2000, peerVisible: false });

function weekDoc(n) {
  return {
    weekNumber: n,
    title: `Week ${n} readings`,
    summary: "",
    published: true,
    exercises: [exercise(`x${n}`)],
  };
}

/** One response as the submit route leaves one. */
function response(uid, weekNumber, exerciseId, { sent = true } = {}) {
  const weekId = `w0${weekNumber}`;
  return {
    runId: RUN.agi,
    uid,
    weekId,
    weekNumber,
    exerciseId,
    responseType: "text",
    text: "My answer.",
    submittedAt: sent ? new Date("2026-11-20T10:00:00Z") : null,
    reviewStatus: "unreviewed",
    updatedAt: new Date("2026-11-20T10:00:00Z"),
  };
}

export const responsePath = (uid, weekNumber, exerciseId) =>
  `courseExerciseResponses/${RUN.agi}__${uid}__w0${weekNumber}__${exerciseId}`;

/** The world every suite starts from. `over` adds or replaces whole documents. */
export function finishSeed(over = {}) {
  const seed = attendanceSeed();
  // Every register of the six weeks, finished.
  for (const path of Object.keys(seed)) if (path.startsWith("courseAttendance/")) delete seed[path];
  for (const [groupId, people] of Object.entries(MARKS)) {
    for (let week = 1; week <= 6; week += 1) {
      if (groupId === B && week === 4) continue;
      const records = {};
      for (const [uid, marks] of Object.entries(people)) if (marks[week - 1]) records[uid] = marks[week - 1];
      seed[registerPath(groupId, week)] = register(groupId, week, records);
    }
  }
  // Group B's week 4 was cancelled, keeping pace.
  const b = seed[`courseGroups/${B}`];
  seed[`courseGroups/${B}`] = {
    ...b,
    sessionChanges: {
      w04: { kind: "cancelled", reason: "The room is closed.", dateKey: "2026-11-24", byUid: "rahul", at: new Date("2026-11-20T09:00:00Z") },
    },
  };
  // Every week published, one exercise each; Group C's own week 6 sets two.
  for (let n = 1; n <= 6; n += 1) seed[`courseRuns/${RUN.agi}/weeks/w0${n}`] = weekDoc(n);
  seed[`courseGroups/${C}/weeks/w06`] = {
    ...weekDoc(6),
    exercises: [exercise("x6"), exercise("x6b")],
    forkedAt: new Date("2026-11-01T09:00:00Z"),
    forkedByUid: "tom",
  };
  for (const [uid, weeks] of Object.entries(ANSWERED)) {
    for (const n of weeks) seed[responsePath(uid, n, `x${n}`)] = response(uid, n, `x${n}`);
  }
  seed[responsePath("hamza", 6, "x6b")] = response("hamza", 6, "x6b");
  // A draft never sent, and an answer to an exercise no week sets.
  seed[responsePath("tariq", 1, "x1")] = response("tariq", 1, "x1", { sent: false });
  seed[responsePath("amara", 2, "x-gone")] = response("amara", 2, "x-gone");
  return { ...seed, ...over };
}

/** The run's rule, as the rule's route stores it. */
export const rulePath = `courseFinishing/${RUN.agi}`;
export const RULE = (atLeast, setAt = new Date("2026-11-30T09:00:00Z")) => ({ kind: "rule", runId: RUN.agi, atLeast, setAt });

/** A lead's decision about one person, as the switch's route stores it. */
export const decisionPath = (uid) => `courseFinishing/${RUN.agi}__${uid}`;
export const decision = (uid, finished, byUid = "claudia", at = new Date("2026-12-10T09:00:00Z")) => ({
  kind: "person",
  runId: RUN.agi,
  uid,
  finished,
  byUid,
  at,
});

// ---------------------------------------------------------------------------
// The loaders
// ---------------------------------------------------------------------------

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

const STYLESHEETS = [
  "./ProgrammeOverview.module.css",
  "./ProgrammeSetup.module.css",
  "@/features/applications/editor/ProgrammeSetup.module.css",
  "./ProgrammeFrame.module.css",
  "@/features/applications/editor/ProgrammeFrame.module.css",
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./InitialsChip.module.css",
  "./Modal.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  "./Chip.module.css",
  "./Select.module.css",
  "./RunHome.module.css",
  // The run home draws "Leave the programme" at its foot with the leaving
  // pages' own stylesheet.
  "./leaving/Leaving.module.css",
  "./RunCard.module.css",
  "./MyCoursesSummary.module.css",
  "./home.module.css",
];

/** A component stood in by its name and nothing else: the words around it are what a suite reads. */
const QUIET = (handle) => (name) =>
  `export default function ${name}() { return ${handle}.h('span', { 'data-stub': '${name}' }); }`;

/**
 * A world, its loaders, its routes and the ways a suite asks them. `key`
 * names the handle on `globalThis` the stubs read.
 */
export async function makeFinishWorld(key = "__finish") {
  const world = {
    db: null,
    courseDb: null,
    user: null,
    viewAs: false,
    ui: { segment: "overview", hydrated: false },
    /** What the member's run home is handed by its one fetch. */
    overview: null,
    h: createElement,
  };
  globalThis[key] = world;
  const handle = `globalThis[${JSON.stringify(key)}]`;
  const quiet = QUIET(handle);

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
    ["@/lib/email/send", "export async function sendEmail() { throw new Error('who finished emailed somebody'); }"],
    ["./send", "export async function sendEmail() { throw new Error('who finished emailed somebody'); }"],
  ];
  const { loadTs } = createLoader({ stubs: new Map(serverStubs) });

  const uiStubs = [
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
        `  ${handle}.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);`,
    ],
    ["@/hooks/useHydrated", `export function useHydrated() { return ${handle}.ui.hydrated === true; }`],
    // An admin's Course run panel on Settings: another job's, drawn as its name.
    ["@/features/applications/editor/RunHandOver", quiet("RunHandOver")],
    [
      "@/lib/firebase/client",
      ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
        .map((name) => `export function ${name}() { throw new Error('no client SDK here'); }`)
        .join("\n"),
    ],
    ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
  ];
  /** The lead's pages and the programme's head. */
  const { loadTs: loadUi } = createLoader({ stubs: new Map(uiStubs) });

  /**
   * The member's own pages, with what is drawn around their words stood in:
   * the run home is handed the payload the real route answered.
   */
  const { loadTs: loadMember } = createLoader({
    stubs: new Map([
      ...uiStubs,
      ["./useRunOverview", `export function useRunOverview() { return { data: ${handle}.overview, error: null, reload() {} }; }`],
      ["@/features/courses/useRunOverview", `export function useRunOverview() { return { data: ${handle}.overview, error: null, reload() {} }; }`],
      ["./useSyncTasks", "export function useSyncTasks() {}\nexport function SyncTasksTrigger() { return null; }"],
      ["@/hooks/useMagneticPull", "export function useMagneticPull() { return { current: null }; }"],
      ["@/components/motion/PageEnter", `export default function PageEnter({ className, children }) { return ${handle}.h('div', { className }, children); }`],
      ["@/components/motion/DigitRoll", `export default function DigitRoll({ value }) { return ${handle}.h('span', null, value); }`],
      ["@/components/ui/Button", `export default function Button({ children }) { return ${handle}.h('button', null, children); }`],
      ["@/components/ui/Card", `export default function Card({ children }) { return ${handle}.h('section', null, children); }`],
      ["@/components/ui/Chip", `export default function Chip({ children }) { return ${handle}.h('span', null, children); }`],
      ["@/components/ui/ProgressRing", "export default function ProgressRing() { return null; }"],
      ["@/components/ui/ProgressBar", "export default function ProgressBar() { return null; }"],
      ["@/components/ui/EmptyState", quiet("EmptyState")],
      ["@/components/ui/Skeleton", quiet("Skeleton")],
      [
        "@/components/ui/PageHead",
        `export default function PageHead({ title, description }) { return ${handle}.h('header', null, ${handle}.h('h1', null, title), description); }`,
      ],
      ["./FacilitatorGroupPanel", quiet("FacilitatorGroupPanel")],
      ["./SessionCard", quiet("SessionCard")],
      ["./sessionChange/SessionNotice", quiet("SessionNotice")],
      ["./sessionChange/cardFacts", "export function cancelledIn() { return []; }\nexport function coversTitle() { return ''; }\nexport function nextSessionCard() { return null; }"],
      ["./updates/RunUpdates", quiet("RunUpdates")],
      ["./WeekRail", quiet("WeekRail")],
      ["@/features/courses/useRunProgress", "export function useRunProgress() { return { byItemId: new Map(), rows: [], loading: false }; }"],
      ["@/features/courses/useWeek", "export function useWeek() { return { data: null, loading: false, error: null }; }"],
      ["./NextSession", `export default function NextSession() { return null; }\nexport function sessionFacts() { return null; }`],
      ["./icons", "export const ArrowRight = () => null; export const Check = () => null; export const External = () => null;"],
    ]),
  });

  function reset(seed = finishSeed()) {
    world.db = makeDb(seed, { now: () => new Date() });
    world.courseDb = courseView(world.db);
    world.user = null;
    world.viewAs = false;
    world.overview = null;
    world.ui = { segment: "overview", hydrated: false };
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
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
      permissions: CAST.zach.permissions,
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

  const formRoute = (...parts) =>
    loadTs(join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", ...parts, "route.ts"));
  const routes = {
    decide: await formRoute("finishing"),
    rule: await formRoute("finishing", "rule"),
    overview: await loadTs(join("app", "api", "courses", "runs", "[runId]", "overview", "route.ts")),
    me: await loadTs(join("app", "api", "courses", "me", "route.ts")),
  };
  const lib = {
    record: await loadTs(join("lib", "courses", "finishing", "record.ts")),
    who: await loadTs(join("lib", "courses", "finishing", "whoFinished.ts")),
    model: await loadTs(join("lib", "courses", "finishing", "model.ts")),
    words: await loadTs(join("lib", "courses", "finishing", "words.ts")),
    attendance: await loadTs(join("lib", "courses", "programmeAttendance.ts")),
  };

  const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
  const pages = {
    overview: (await loadUi(join(PROGRAMME, "overview", "page.tsx"))).default,
    setup: (await loadUi(join(PROGRAMME, "setup", "page.tsx"))).default,
    layout: (await loadUi(join(PROGRAMME, "layout.tsx"))).default,
  };
  const member = {
    RunHome: (await loadMember(join("features", "courses", "RunHome.tsx"))).default,
    RunCard: (await loadMember(join("features", "courses", "RunCard.tsx"))).default,
    MyCoursesSummary: (await loadMember(join("features", "courses", "MyCoursesSummary.tsx"))).default,
    HomeProgramme: (await loadMember(join("app", "(app)", "dashboard", "HomeProgramme.tsx"))).default,
  };

  const params = { roundId: ROUND, programmeId: AGI };
  const ask = {
    /** A press of one person's Finished switch. */
    decide: (who, uid, finished, { viewAs = false, programmeId = AGI } = {}) =>
      call(who, routes.decide.PUT, { roundId: ROUND, programmeId }, { body: { uid, finished }, viewAs }),
    /** The rule's box on Settings, saved. */
    rule: (who, atLeast, { viewAs = false, programmeId = AGI } = {}) =>
      call(who, routes.rule.PUT, { roundId: ROUND, programmeId }, { body: { atLeast }, viewAs }),
    /** The run home's one fetch, as `who`. */
    overview: (who) => call(who, routes.overview.GET, { runId: RUN.agi }),
    /** The hub's runs, as `who`. */
    me: async (who) => (await call(who, routes.me.GET, {})).body?.runs ?? [],
  };

  /** Render a server page as `who`: its HTML and text, what it read, and where it sent them. */
  async function renderPage(page, who, props = {}) {
    world.user = sessionOf(who);
    const reads = [];
    const collection = world.db.collection;
    world.db.collection = (path) => {
      reads.push(path);
      return collection(path);
    };
    try {
      const element = await page({ params: Promise.resolve(params), ...props });
      const html = renderToStaticMarkup(element);
      return { element, html, text: textOf(html), reads, to: null };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { element: null, html: "", text: "", reads, to: err.to };
    } finally {
      world.db.collection = collection;
    }
  }

  /** The programme's head, as `who`, around an empty page. */
  async function head(who) {
    world.user = sessionOf(who);
    const element = await pages.layout({ children: createElement("main", null, "page"), params: Promise.resolve(params) });
    return textOf(renderToStaticMarkup(element));
  }

  /** The whole database as one string, to prove a request wrote nothing. */
  const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));

  return { world, loadTs, reset, call, sessionOf, routes, lib, pages, member, ask, renderPage, head, everything };
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
