/**
 * AGI Strategy's run in week 3, with WEEKS WRITTEN AS BLOCKS, for the suite
 * about the member's side of the coursework (boards st-week1-phone,
 * wk-week-phone, wk-week and wk-programme): the week page for a block week,
 * its reflection boxes and their store, and the counts by This week's tasks
 * on the week page, the programme page and Home.
 *
 * Built on `tests/lib/hubAttendanceWorld.mjs` (four groups; Chloe in Group B,
 * told; Amara in Group A; Una placed in Group C and not told; Sam, who left;
 * Omar, taken off; Rahul and Sofia facilitate Group B, Sofia Group A too;
 * Claudia leads the programme; Zach is an admin; Nobody is on nothing), on
 * the hand-over world's real handlers. On top of it:
 *
 *  - WEEK 1 and WEEK 3 are written as blocks in week 1's shape: one task
 *    covering three parts, a row with nothing to do this week, two sources in
 *    part 2 and three reflection stops of two prompts each, In the session,
 *    Go further. Each week's ids are its own (ticks key on them run-wide).
 *  - WEEK 2 is the foundation's synthetic week holding every kind of block
 *    (`tests/lib/weekBlocksFixture.mjs`): packs, a table, the written answer,
 *    cases and fill-in boxes, which this page does not draw yet.
 *  - WEEK 4 is written before blocks (three readings and an exercise).
 *  - Rahul and Sofia hold the facilitator enrolments the facilitators route
 *    writes.
 *
 * THE CLOCK is Tue 17 Nov 2026 at noon in London: Group B meets tonight, in
 * week 3. Every word in the weeks is made up for these tests, and every
 * address is on example.com or example.org.
 *
 * Real: the overview, my-exercises and reflection routes, the week page's
 * server shell, the week page, the programme home and Home's card, and every
 * library under them. Stubbed: what the hand-over world stubs, Next's
 * navigation and link, the stylesheets, and the browser's data hooks, each
 * handing its component what a suite set (the overview route's own answer,
 * the week's own document, the member's own ticks, the member's own rows as
 * the my-exercises route answered them).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./functionScan.mjs";
import { makeWorld } from "./handoverWorld.mjs";
import { B, NOW, RUN, attendanceSeed, enrolment } from "./hubAttendanceWorld.mjs";
import { syntheticWeekDoc } from "./weekBlocksFixture.mjs";

export { B, NOW, RUN };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/**
 * A week in week 1's shape, its ids prefixed with `k` so two such weeks of
 * one run never share one. Every word is made up.
 */
export function weekOneBlocks(k) {
  return [
    {
      id: `${k}-tw`,
      type: "thisWeek",
      rows: [
        {
          type: "task",
          what: "Work through the three parts below, writing in the boxes as you go",
          time: "About 60 minutes",
          when: "before",
          covers: [`${k}-p1`, `${k}-p2`, `${k}-p3`],
        },
        { type: "none", what: "Talk and short answer", time: "None this week", note: "You will pick a topic at the end of the session" },
      ],
      total: "About 60 minutes",
      note: [p(run("Do what you can before the session. Short of time? Do part 1."))],
    },
    {
      id: `${k}-why`,
      type: "text",
      role: "why",
      heading: "Why this week",
      time: "",
      body: [p(run("Lighthouses keep ships off rocks. This week asks "), run("who", { bold: true }), run(" keeps the lamps lit.")) ],
    },
    { id: `${k}-oc`, type: "outcomes", heading: "After this week you can", items: ["Name three kinds of lamp.", "Say who trims the wick."] },
    {
      id: `${k}-before`,
      type: "text",
      role: "before",
      heading: "Before the session",
      time: "About 60 minutes",
      body: [p(run("Work through the parts in order."))],
    },
    {
      id: `${k}-p1`,
      type: "part",
      title: "Start with what you think",
      time: "About 5 minutes",
      framing: [p(run("Write before you read anything."))],
      blocks: [
        {
          id: `${k}-rs1`,
          type: "reflection",
          prompts: [
            { id: `${k}-rp1`, text: "How many lighthouses are still lit, do you think?" },
            { id: `${k}-rp2`, text: "Who should pay for the lamp oil?" },
          ],
        },
      ],
    },
    {
      id: `${k}-p2`,
      type: "part",
      title: "Two keepers' views",
      time: "About 45 minutes",
      framing: [p(run("Two very different keepers."))],
      blocks: [
        {
          id: `${k}-s1`,
          type: "source",
          kind: "read",
          title: "A keeper's diary",
          url: "https://example.com/diary",
          by: "Ada Example",
          date: "2024",
          time: "20 minutes",
          note: [run("The first chapter is enough.")],
        },
        {
          id: `${k}-s2`,
          type: "source",
          kind: "watch",
          title: "Lamps at night",
          url: "https://example.org/lamps",
          by: "Example Films",
          date: "March 2025",
          time: "About 25 minutes",
          note: [],
        },
        {
          id: `${k}-rs2`,
          type: "reflection",
          prompts: [
            { id: `${k}-rp3`, text: "Where do the two keepers disagree?" },
            { id: `${k}-rp4`, text: "Which scene felt most true?" },
          ],
        },
      ],
    },
    {
      id: `${k}-p3`,
      type: "part",
      title: "What would change your mind?",
      time: "About 10 minutes",
      framing: [p(run("Say what would move you."))],
      blocks: [
        {
          id: `${k}-rs3`,
          type: "reflection",
          prompts: [
            { id: `${k}-rp5`, text: "Look back at your number from part 1." },
            { id: `${k}-rp6`, text: "What would you need to see next year?" },
          ],
        },
      ],
    },
    { id: `${k}-is`, type: "inTheSession", body: [p(run("You will compare notes in pairs."))] },
    {
      id: `${k}-gf`,
      type: "goFurther",
      heading: "Go further (optional)",
      intro: [p(run("More for anyone who wants it."))],
      items: [
        { kind: "listen", title: "Keepers talk", url: "https://example.com/talk", by: "Example Radio", date: "2023", time: "40 minutes", why: [run("A long conversation.")] },
        { kind: "read", title: "The lamp book", url: "https://example.org/book", by: "Example Press", date: "", time: "", why: [run("The whole history.")] },
      ],
    },
  ];
}

/** A week document as the loader stores one. */
function blockWeekDoc(n, title, blocks) {
  return {
    weekNumber: n,
    title,
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks,
  };
}

/** Week 4: written before blocks, three readings and an exercise. */
function legacyWeekDoc(n) {
  return {
    weekNumber: n,
    title: `Week ${n} readings`,
    summary: "",
    published: true,
    materials: [
      { id: `w${n}r1`, type: "reading", title: `Week ${n} reading one`, url: `https://example.com/w${n}/one`, author: "Example Press", estimatedMinutes: 25 },
      { id: `w${n}r2`, type: "reading", title: `Week ${n} reading two`, url: `https://example.com/w${n}/two`, estimatedMinutes: 30 },
    ],
    checklist: [],
    exercises: [{ id: `x${n}`, prompt: `What is week ${n} about?`, responseType: "text", required: false, maxLength: 2000, peerVisible: false }],
  };
}

/** The world every suite starts from. `over` adds or replaces whole documents. */
export function blocksSeed(over = {}) {
  const seed = attendanceSeed();
  seed[`courseRuns/${RUN.agi}/weeks/w01`] = blockWeekDoc(1, "Who keeps the lamps", weekOneBlocks("k1"));
  seed[`courseRuns/${RUN.agi}/weeks/w02`] = syntheticWeekDoc({ weekNumber: 2 });
  seed[`courseRuns/${RUN.agi}/weeks/w03`] = blockWeekDoc(3, "The lamp makers", weekOneBlocks("k3"));
  seed[`courseRuns/${RUN.agi}/weeks/w04`] = legacyWeekDoc(4);
  // The facilitator enrolments the facilitators route writes for Group B's two.
  for (const uid of ["rahul", "sofia"]) {
    seed[`courseEnrolments/${RUN.agi}__${uid}`] = enrolment(uid, null, { role: "facilitator", allocatedEmailAt: null });
  }
  return { ...seed, ...over };
}

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
}

/** The words of a page: markup gone, entities read, space folded. */
export function textOf(html) {
  return html
    .replace(/<!-- -->/g, "")
    // Marks inside a line (bold, italics, a link) join the words they mark.
    .replace(/<\/?(?:strong|em|a)(?:\s[^>]*)?>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function makeWeekBlocksPageWorld(key = "__weekBlocksPage") {
  const ui = {
    h: createElement,
    overview: null,
    roster: null,
    weekDocs: {},
    progress: new Map(),
    ownRows: new Map(),
    ownRowsLoaded: true,
    authUser: null,
    writes: [],
    toasts: [],
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
  const overviewStub = `export function useRunOverview() { return { data: ${handle}.overview, error: null, loading: false, reload() {} }; }\nexport default useRunOverview;`;
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
    ["./useRunOverview", overviewStub],
    ["@/features/courses/useRunOverview", overviewStub],
    ["./useSyncTasks", "export function useSyncTasks() {}"],
    ["@/features/courses/useRunProgress", `export function useRunProgress() { return { byItemId: ${handle}.progress, loading: false, error: null }; }`],
    ["./useWeek", useWeekStub],
    ["../useWeek", useWeekStub],
    ["@/features/courses/useWeek", useWeekStub],
    ["../useGroupRoster", `export function useGroupRoster() { return ${handle}.roster; }`],
    [
      "./useMyExercises",
      `export function useMyExercises(runId) { const on = Boolean(runId); return { loading: false, loaded: on && ${handle}.ownRowsLoaded, byExerciseId: on ? ${handle}.ownRows : new Map(), error: null, reload() {}, apply() {} }; }`,
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
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  made.world.ui = ui;
  const { world, call, courseRoute, loadTs } = made;

  const routes = {
    overview: await courseRoute("runs", "[runId]", "overview"),
    roster: await courseRoute("groups", "[groupId]", "roster"),
    me: await courseRoute("me"),
    myExercises: await courseRoute("runs", "[runId]", "my-exercises"),
    reflection: await courseRoute("runs", "[runId]", "reflections", "[promptId]"),
    reflections: await courseRoute("runs", "[runId]", "reflections"),
    review: await courseRoute("exercise-responses", "[responseId]", "review"),
    queue: await courseRoute("groups", "[groupId]", "exercises"),
  };
  const pages = {
    week: (await loadTs(join("app", "(app)", "learn", "[runId]", "weeks", "[n]", "page.tsx"))).default,
  };
  const components = {
    RunHome: (await loadTs(join("features", "courses", "RunHome.tsx"))).default,
    WeekView: (await loadTs(join("features", "courses", "WeekView.tsx"))).default,
    HomeProgramme: (await loadTs(join("app", "(app)", "dashboard", "HomeProgramme.tsx"))).default,
  };
  const lib = {
    courses: await loadTs(join("lib", "firestore", "courses.ts")),
    progress: await loadTs(join("lib", "courses", "weekBlocks", "progress.ts")),
    words: await loadTs(join("lib", "courses", "memberPageWords.ts")),
  };

  function reset(seed = blocksSeed()) {
    made.reset(seed, { now: () => new Date() });
    ui.overview = null;
    ui.roster = null;
    ui.weekDocs = {};
    ui.progress = new Map();
    ui.ownRows = new Map();
    ui.ownRowsLoaded = true;
    ui.authUser = null;
    ui.writes = [];
    ui.toasts = [];
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  }

  const overview = (who) => call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });

  /** `who` writes in one of their own boxes. */
  const writeBox = (who, promptId, weekId, text, options = {}) =>
    call(who, routes.reflection.PUT, { runId: RUN.agi, promptId }, { course: true, body: { weekId, text }, ...options });

  /** `who` asks for `uid`'s reflections in week `n`. */
  function readReflections(who, uid, n) {
    world.user = made.sessionOf(who);
    world.course = true;
    const query = new URLSearchParams();
    if (uid !== undefined) query.set("uid", uid);
    if (n !== undefined) query.set("week", String(n));
    return (async () => {
      try {
        const response = await routes.reflections.GET(new Request(`https://naisi.invalid/api?${query}`), {
          params: Promise.resolve({ runId: RUN.agi }),
        });
        return { status: response.status, body: structuredClone(response.body) };
      } finally {
        world.course = false;
      }
    })();
  }

  /** `who`'s own rows for week `n`, as the my-exercises route answers them. */
  function ownRowsOf(who, n) {
    world.user = made.sessionOf(who);
    world.course = true;
    return (async () => {
      try {
        const response = await routes.myExercises.GET(new Request(`https://naisi.invalid/api?week=${n}`), {
          params: Promise.resolve({ runId: RUN.agi }),
        });
        return { status: response.status, body: structuredClone(response.body) };
      } finally {
        world.course = false;
      }
    })();
  }

  function weekDocsAsStored() {
    const docs = {};
    for (let n = 1; n <= 6; n += 1) {
      const id = `w0${n}`;
      const stored = world.db.read(`courseRuns/${RUN.agi}/weeks/${id}`);
      if (stored) docs[id] = lib.courses.normalizeCourseWeek(id, stored);
    }
    return docs;
  }

  /**
   * Everything the browser would hold for `who` on week `n`: the overview,
   * the week documents, their own rows as the route answers them, and the
   * ticks a suite hands in.
   */
  async function asBrowser(who, n = 1, ticked = []) {
    const answer = await overview(who);
    ui.overview = answer.status === 200 ? answer.body : null;
    ui.weekDocs = weekDocsAsStored();
    ui.authUser = who ? { uid: who } : null;
    ui.roster = { group: null, facilitators: [], members: [], loading: false, error: null };
    const own = who ? await ownRowsOf(who, n) : { status: 401, body: null };
    ui.ownRows = new Map((own.status === 200 ? own.body.responses : []).map((row) => [row.exerciseId, row]));
    ui.progress = new Map(ticked.map((id) => [id, { id, itemId: id, itemKind: "material", completed: true, weekNumber: n }]));
    return answer;
  }

  /** The week page's server shell as `who`: the element it returns, or where it sent them. */
  async function weekShell(who, n) {
    world.user = made.sessionOf(who);
    world.course = true;
    try {
      const element = await pages.week({ params: Promise.resolve({ runId: RUN.agi, n: String(n) }) });
      return { element, component: element?.type?.name ?? null, props: element?.props ?? null, to: null };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { element: null, component: null, props: null, to: err.to };
    } finally {
      world.course = false;
    }
  }

  /** A week's page as `who` reads it, through the shell's own props. */
  async function weekPage(who, n, ticked = []) {
    const shell = await weekShell(who, n);
    if (!shell.props) return { html: "", text: "", shell };
    await asBrowser(who, n, ticked);
    const html = renderToStaticMarkup(createElement(components.WeekView, shell.props));
    return { html, text: textOf(html), shell };
  }

  /** The programme home as `who` sees it. */
  async function programmeHome(who, ticked = []) {
    await asBrowser(who, 3, ticked);
    const html = renderToStaticMarkup(
      createElement(components.RunHome, { runId: RUN.agi, isAdmin: who === "zach", canEmailCohort: false, pitching: null, canLeave: false, uid: who }),
    );
    return { html, text: textOf(html) };
  }

  /** Home's card for the run, as `who` sees it. */
  async function homeCard(who, ticked = []) {
    await asBrowser(who, 3, ticked);
    const runs = (await call(who, routes.me.GET, {}, { course: true })).body?.runs ?? [];
    const entry = runs.find((row) => row.runId === RUN.agi);
    if (!entry) return null;
    const html = renderToStaticMarkup(
      createElement(components.HomeProgramme, { given: "Chloe", invite: null, entry, comingUp: null, applications: null, more: null }),
    );
    return { html, text: textOf(html) };
  }

  return {
    ...made,
    ui,
    routes,
    pages,
    components,
    lib,
    reset,
    overview,
    writeBox,
    readReflections,
    ownRowsOf,
    asBrowser,
    weekShell,
    weekPage,
    programmeHome,
    homeCard,
  };
}
