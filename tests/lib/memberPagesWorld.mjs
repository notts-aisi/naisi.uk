/**
 * Week 3 of AGI Strategy's run, for the suites about the pages a member uses
 * every week: their programme's home (boards st-programme, wk-programme), a
 * week's page (wk-week-phone) and Home's card for their programme
 * (wk-home-phone), with each week opening straight after the group's previous
 * session (C17), marks with no count (C26) and ticks from Home (C33).
 *
 * Built on `tests/lib/hubAttendanceWorld.mjs`: the run in its third week as
 * the lead's tabs draw it (four groups and their registers; Sam, who left;
 * Omar, whom staff took off; Una, placed and not told), on the hand-over
 * world's real handlers. On top of that:
 *
 *  - EVERY WEEK CARRIES THE BOARDS' READINGS: a reading of 25 minutes, a
 *    video of 20 and a reading of 30, with an exercise. Weeks 1 to 4 are
 *    published (week 4 so that it can be shut and still say when it opens),
 *    5 and 6 are not.
 *  - GROUP B is the boards' group: Tuesdays at 6pm for two hours, Rahul and
 *    Sofia, Chloe, Farah and Kofi in it. Its sessions fall on Tue 3, 10, 17
 *    and 24 Nov and Tue 1 and 8 Dec.
 *
 * THE CLOCK is Tue 17 Nov 2026 at noon in London (GMT), as in the world it is
 * built on: Group B meets tonight, and week 4 opens when that session ends at
 * 8pm. A suite moves the clock with `mock.timers`.
 *
 * Real: the overview route, the roster route, the week page's server shell,
 * the programme home, the week page and Home's card, and every library under
 * them. Stubbed: what the hand-over world stubs (the session, the Admin SDK
 * handle, the view-as guard, the mail door), Next's navigation and link, the
 * stylesheets, and the browser's data hooks, each of which hands its
 * component what a suite sets (the overview route's own answer, the roster
 * route's own answer, the week's own document, the member's own ticks). The
 * browser SDK's writes are recorded, not sent. Every address is
 * `example.com`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./functionScan.mjs";
import { makeWorld } from "./handoverWorld.mjs";
import { B, NOW, RUN, attendanceSeed } from "./hubAttendanceWorld.mjs";

export { B, NOW, RUN };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** Group B's readings for one week, as the boards draw them. */
export function readingsOf(n) {
  return [
    { id: `w${n}r1`, type: "reading", title: `Week ${n} reading one`, url: `https://example.com/w${n}/one`, author: "Example Press", estimatedMinutes: 25 },
    // A video is stored as a bare YouTube id: the week's own normaliser takes nothing else.
    { id: `w${n}v1`, type: "video", title: `Week ${n} talk`, url: `w${n}TalkVideo`, estimatedMinutes: 20 },
    { id: `w${n}r2`, type: "reading", title: `Week ${n} reading two`, url: `https://example.com/w${n}/two`, estimatedMinutes: 30 },
  ];
}

/** One week's document: the boards' three readings and an exercise. */
export function weekDoc(n, published) {
  return {
    weekNumber: n,
    title: n === 3 ? "Who decides what AGI means" : `Week ${n} readings`,
    summary: "",
    published,
    materials: readingsOf(n),
    checklist: [],
    exercises: [{ id: `x${n}`, prompt: `What is week ${n} about?`, responseType: "text", required: false, maxLength: 2000, peerVisible: false }],
  };
}

/** The world every member-pages suite starts from. `over` adds or replaces whole documents. */
export function memberSeed(over = {}) {
  const seed = attendanceSeed();
  for (let n = 1; n <= 6; n += 1) seed[`courseRuns/${RUN.agi}/weeks/w0${n}`] = weekDoc(n, n <= 4);
  return { ...seed, ...over };
}

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

/** Every stylesheet any file under `src` imports, by the specifier it is imported by. */
function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
}

/**
 * The rows of readings, stood in by a recorder under every name a page
 * imports them by: each drawing hands the suite its rows and the page's own
 * tick handler, so a suite can tick as the member would and read where the
 * write went. The rows are a week's materials, as the real module lists them.
 */
function tickRowsStubs(handle) {
  const source =
    "export function tickItemsOf(week) {\n" +
    "  return week.materials.map((m) => ({ id: m.id, kind: 'material', title: m.title, chip: null, minutes: null, source: null, href: null, body: null, optional: m.optional === true }));\n" +
    "}\n" +
    `export default function TickRows(props) { ${handle}.tickRows.push(props); return null; }`;
  return [
    ["./weekly/TickRows", source],
    ["./TickRows", source],
    ["@/features/courses/weekly/TickRows", source],
  ];
}

/** The words of a page: markup gone, entities read, space folded. */
export function textOf(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The world, its routes, its pages and short ways to ask them. `key` names
 * the handle on `globalThis` the stubs read.
 */
export async function makeMemberPagesWorld(key = "__memberPages", { recordTickRows = false } = {}) {
  const ui = {
    h: createElement,
    overview: null,
    roster: null,
    weekDocs: {},
    progress: new Map(),
    authUser: null,
    writes: [],
    toasts: [],
    tickRows: [],
  };
  const handle = `globalThis[${JSON.stringify(key)}].ui`;
  const quiet = (name) => `export default function ${name}() { return ${handle}.h('span', { 'data-stub': '${name}' }, '[${name}]'); }`;
  const useWeekStub =
    "export function useWeek(runId, weekId, canSeeUnpublished) {\n" +
    `  if (!weekId) return { status: 'loading', week: null, forked: false, error: null };\n` +
    `  const week = ${handle}.weekDocs[weekId] ?? null;\n` +
    "  if (!week) return { status: 'missing', week: null, forked: false, error: null };\n" +
    "  if (!week.published && !canSeeUnpublished) return { status: 'unpublished', week: null, forked: false, error: null };\n" +
    "  return { status: 'ready', week, forked: false, error: null };\n" +
    "}\nexport default useWeek;";
  const made = makeWorld(key, [
    ["@/lib/rateLimit", "export function rateLimit() { return { ok: true, retryAfterSeconds: 0 }; }\nexport function clientIp() { return '10.0.0.1'; }"],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
        "export function useRouter() { return { replace() {}, push() {}, refresh() {}, back() {} }; }\n" +
        "export function usePathname() { return '/learn'; }\n" +
        "export function useSearchParams() { return new URLSearchParams(); }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, scroll, prefetch, onClick, ...rest }) =>\n" +
        `  ${handle}.h('a', { href, className, ...rest }, children);`,
    ],
    ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
    // The browser's data hooks: each hands its component what a suite set.
    ["./useRunOverview", `export function useRunOverview() { return { data: ${handle}.overview, error: null, loading: false, reload() {} }; }\nexport default useRunOverview;`],
    ["@/features/courses/useRunOverview", `export function useRunOverview() { return { data: ${handle}.overview, error: null, loading: false, reload() {} }; }`],
    ["./useSyncTasks", "export function useSyncTasks() {}"],
    ["@/features/courses/useRunProgress", `export function useRunProgress() { return { byItemId: ${handle}.progress, loading: false, error: null }; }`],
    ["./useWeek", useWeekStub],
    ["../useWeek", useWeekStub],
    ["@/features/courses/useWeek", useWeekStub],
    ["../useGroupRoster", `export function useGroupRoster() { return ${handle}.roster; }`],
    [
      "./useMyExercises",
      "export function useMyExercises() { return { loading: false, loaded: true, byExerciseId: new Map(), error: null, reload() {}, apply() {} }; }",
    ],
    [
      "./useWeekComments",
      "export function useWeekComments() { return { byItemId: new Map(), loaded: false, loading: false, error: null, load() {}, reload() {} }; }",
    ],
    ["./updates/RunUpdates", quiet("RunUpdates")],
    ["./FacilitatorGroupPanel", quiet("FacilitatorGroupPanel")],
    ["./ExerciseSubmit", quiet("ExerciseSubmit")],
    ["@/components/motion/PageEnter", `export default function PageEnter({ className, children }) { return ${handle}.h('div', { className }, children); }`],
    [
      "@/components/ui/ActionToast",
      "export default function ActionToast() { return null; }\n" +
        "export function useActionToast() {\n" +
        `  return { toast: null, dismiss() {}, run: async (fn) => { try { await fn(); } catch (e) { ${handle}.toasts.push(e.message); } } };\n` +
        "}",
    ],
    ["@/auth/AuthProvider", `export function useAuth() { return { user: ${handle}.authUser, loading: false }; }`],
    // The browser SDK: a tick's write is recorded where it would have gone.
    ["@/lib/firebase/client", "export function getClientDb() { return { browser: true }; }\nexport function getClientAuth() { return {}; }"],
    [
      "firebase/firestore",
      "export function doc(db, ...segments) { return { path: segments.join('/') }; }\n" +
        "export async function getDoc(ref) { return { exists: () => false, data: () => undefined, id: ref.path }; }\n" +
        `export async function setDoc(ref, data) { ${handle}.writes.push({ path: ref.path, data }); }\n` +
        "export function serverTimestamp() { return 'serverTimestamp()'; }\n" +
        "export function collection() { return {}; }\nexport function query() { return {}; }\nexport function where() { return {}; }\n" +
        "export function onSnapshot() { return () => {}; }",
    ],
    ...(recordTickRows ? tickRowsStubs(handle) : []),
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  made.world.ui = ui;
  const { world, call, courseRoute, loadTs } = made;

  const routes = {
    overview: await courseRoute("runs", "[runId]", "overview"),
    roster: await courseRoute("groups", "[groupId]", "roster"),
    me: await courseRoute("me"),
  };
  const pages = {
    week: (await loadTs(join("app", "(app)", "learn", "[runId]", "weeks", "[n]", "page.tsx"))).default,
    layout: (await loadTs(join("app", "(app)", "learn", "[runId]", "layout.tsx"))).default,
  };
  const components = {
    RunHome: (await loadTs(join("features", "courses", "RunHome.tsx"))).default,
    WeekView: (await loadTs(join("features", "courses", "WeekView.tsx"))).default,
    HomeProgramme: (await loadTs(join("app", "(app)", "dashboard", "HomeProgramme.tsx"))).default,
  };
  const lib = {
    opening: await loadTs(join("lib", "courses", "weekOpening.ts")),
    sessions: await loadTs(join("lib", "courses", "sessions.ts")),
    words: await loadTs(join("lib", "courses", "memberPageWords.ts")),
    rows: await loadTs(join("features", "courses", "weekly", "weekRows.ts")),
    courses: await loadTs(join("lib", "firestore", "courses.ts")),
    groups: await loadTs(join("lib", "firestore", "courseGroups.ts")),
  };

  /** Start again from a seed. */
  function reset(seed = memberSeed()) {
    made.reset(seed, { now: () => new Date() });
    ui.overview = null;
    ui.roster = null;
    ui.weekDocs = {};
    ui.progress = new Map();
    ui.authUser = null;
    ui.writes = [];
    ui.toasts = [];
    ui.tickRows = [];
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  }

  /** The overview route's answer to `who`. */
  const overview = (who) => call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });

  /** The roster route's answer to `who`, as the group card's hook hands it on. */
  async function rosterOf(who, groupId = B) {
    const answer = await call(who, routes.roster.GET, { groupId }, { course: true });
    if (answer.status !== 200) return { group: null, facilitators: [], members: [], loading: false, error: new Error(answer.body.error) };
    return { ...answer.body, loading: false, error: null, notYetTold: answer.body.notYetTold, memberCount: answer.body.members.length };
  }

  /** The week documents the browser would read for `who`, as stored: every week, canonical. */
  function weekDocsAsStored() {
    const docs = {};
    for (let n = 1; n <= 9; n += 1) {
      const id = `w0${n}`;
      const stored = world.db.read(`courseRuns/${RUN.agi}/weeks/${id}`);
      if (stored) docs[id] = lib.courses.normalizeCourseWeek(id, stored);
    }
    return docs;
  }

  /**
   * Everything the browser would hold for `who`: the overview payload, the
   * roster of their group, the week documents and their ticks. Answers the
   * overview's status, so a suite can say a page is refused.
   */
  async function asBrowser(who) {
    const answer = await overview(who);
    ui.overview = answer.status === 200 ? answer.body : null;
    const groupId = ui.overview?.enrolment?.groupId ?? null;
    ui.roster = groupId ? await rosterOf(who, groupId) : { group: null, facilitators: [], members: [], loading: false, error: null };
    ui.weekDocs = weekDocsAsStored();
    ui.authUser = who ? { uid: who } : null;
    return answer;
  }

  /** The programme home as `who` sees it, in words. */
  function programmeHome(who, props = {}) {
    const html = renderToStaticMarkup(
      createElement(components.RunHome, { runId: RUN.agi, isAdmin: who === "zach", canEmailCohort: false, pitching: null, canLeave: false, uid: who, ...props }),
    );
    return { html, text: textOf(html) };
  }

  /** A week's page, as the client component draws it for `who`. */
  function weekPage(who, weekNumber, viewerRole = "learner") {
    const html = renderToStaticMarkup(createElement(components.WeekView, { runId: RUN.agi, weekNumber, uid: who, viewerRole }));
    return { html, text: textOf(html) };
  }

  /** Home's card for the run, as `who` sees it. */
  async function homeCard(who) {
    const runs = (await call(who, routes.me.GET, {}, { course: true })).body?.runs ?? [];
    const entry = runs.find((row) => row.runId === RUN.agi);
    if (!entry) return null;
    const html = renderToStaticMarkup(
      createElement(components.HomeProgramme, { given: "Chloe", invite: null, entry, comingUp: null, applications: null, more: null }),
    );
    return { html, text: textOf(html), entry };
  }

  /** The week page's server shell as `who`: the element it returns, its words, and where it sent them. */
  async function weekShell(who, n) {
    world.user = made.sessionOf(who);
    world.course = true;
    try {
      const element = await pages.week({ params: Promise.resolve({ runId: RUN.agi, n: String(n) }) });
      const name = element?.type?.name ?? null;
      const html = name === "WeekNotOpen" ? renderToStaticMarkup(element) : "";
      return { element, component: name, props: element?.props ?? null, text: textOf(html), to: null };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { element: null, component: null, props: null, text: "", to: err.to };
    } finally {
      world.course = false;
    }
  }

  return { ...made, ui, routes, pages, components, lib, reset, overview, rosterOf, asBrowser, programmeHome, weekPage, homeCard, weekShell };
}
