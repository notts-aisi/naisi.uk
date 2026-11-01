/**
 * AGI Strategy's run in week 3, with WRITTEN ANSWERS, for the suites about
 * the written answer, its review and the feedback on it (boards wk-week,
 * wk-week-phone, wk-review, wk-review-phone, wk-fac-group, wk-programme,
 * en-finish).
 *
 * Built on `tests/lib/facilitatorPagesWorld.mjs`'s seed (the attendance
 * world: four groups; Group B on Tuesdays at 6pm with Rahul and Sofia, its
 * fellows Chloe, Farah and Kofi; Group A on Thursdays at 6pm with Sofia,
 * Amara, Dev, Bea and Tariq, and Sam, who left; Group C with Tom, Hamza and
 * Una, placed and not told; Omar taken off; Claudia leads the programme,
 * Tess another; Zach is an admin), and on the hand-over world's real
 * handlers. On top of it:
 *
 *  - WEEK 2 and WEEK 3 are written as blocks, each with one written answer:
 *    week 2's of one box with a range of 20 to 40 words, week 3's of three
 *    labelled boxes sent together (a one-page plan, as Technical AI
 *    Safety's week 6 is). Both are due the day before the session. Week 1
 *    stays written before blocks, with the summer's exercise answers on it:
 *    Chloe's sent and waiting, Kofi's approved.
 *  - The course carries a rubric of four rows at Not yet, Solid, Strong,
 *    every word made up, and its day-before time is noon.
 *  - Rahul and Sofia hold the facilitator enrolments the facilitators route
 *    writes, and Rahul writes an answer too as a fellow does.
 *
 * THE CLOCK is Tue 17 Nov 2026 at noon in London, as the attendance world's:
 * Group B meets tonight, in week 3, so week 3's answer was due by noon
 * yesterday and week 2's by noon on Mon 9 Nov. A suite moves the clock with
 * `at` to send before or after a due moment.
 *
 * Real: the overview, my-exercises, the written answer's route, the
 * feedback route and the batch's two, the ratings for the team's route, the
 * rubric's route, the summary route, the summer's review route and queue,
 * the week page's shell and the week page, the programme home, the review
 * page for the group and for the lead, the old feedback page, the group
 * page, the Attendance and Overview tabs, Home's facilitator form, and every
 * library under them.
 * Stubbed: what the hand-over world stubs (the session, view-as, the mail
 * door), Next's navigation and link, the stylesheets, and the browser's
 * data hooks, each handing its component what a suite set.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./applicationsStore.mjs";
import { walkSource } from "./functionScan.mjs";
import { COURSE, makeWorld } from "./handoverWorld.mjs";
import { A, AGI, B, C, NOW, ROUND, RUN, facilitatorSeed } from "./facilitatorPagesWorld.mjs";
import { enrolment } from "./hubAttendanceWorld.mjs";

export { A, AGI, B, C, COURSE, NOW, ROUND, RUN };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/** The course's rubric: four rows at three levels. Every word is made up. */
export const RUBRIC = {
  levels: ["Not yet", "Solid", "Strong"],
  rows: [
    { name: "A clear view", descriptors: ["Describes without a view", "States a view", "States a view someone could dispute"] },
    { name: "Reasons", descriptors: ["Assertions alone", "Gives reasons from the week", "Reasons weighed and checked"] },
    { name: "The best objection", descriptors: ["None", "Names one", "Answers the strongest fairly"] },
    { name: "So what", descriptors: ["No link to action", "Says what should happen", "Says who should do what"] },
  ],
};

/** A week written as blocks with one written answer in its last part. */
function answerWeek(n, title, answer) {
  const k = `n${n}`;
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
    blocks: [
      {
        id: `${k}-tw`,
        type: "thisWeek",
        rows: [
          { type: "task", what: "Part 1 below", time: "About 20 minutes", when: "before", whenText: "", covers: [`${k}-p1`] },
          { type: "task", what: "Part 2: your lamp plan, the week's written answer", time: "About 30 minutes", when: "dayBefore", whenText: "", covers: [`${k}-p2`] },
        ],
        total: "About 50 minutes",
        note: [],
      },
      { id: `${k}-why`, type: "text", role: "why", heading: "Why this week", time: "", body: [p(run("Lamps need keepers."))] },
      {
        id: `${k}-p1`,
        type: "part",
        title: "A keeper's diary",
        time: "About 20 minutes",
        framing: [p(run("Read one keeper."))],
        blocks: [
          {
            id: `${k}-s1`,
            type: "source",
            kind: "read",
            lead: "",
            title: "The diary",
            url: "https://example.com/diary",
            by: "Ada Example",
            date: "2024",
            time: "20 minutes",
            compute: "",
            note: [],
          },
        ],
      },
      {
        id: `${k}-p2`,
        type: "part",
        title: "Your lamp plan, the week’s written answer",
        time: answer.words ? `${answer.words.min} to ${answer.words.max} words` : "",
        framing: [p(run("This is the week’s written answer. Your facilitator reads it before the session."))],
        blocks: [answer],
      },
    ],
  };
}

/** Week 2's answer: one box, 20 to 40 words. */
export const ONE_BOX = {
  id: "wa-two",
  type: "writtenAnswer",
  prompt: [p(run("Who should keep the lamps lit, and why?", { bold: true }))],
  boxes: [],
  guidance: [p(run("A strong answer names a keeper and a reason."))],
  words: { min: 20, max: 40 },
  due: "dayBefore",
};

/** Week 3's answer: three labelled boxes, sent together. */
export const BOXES = {
  id: "wa-three",
  type: "writtenAnswer",
  prompt: [p(run("Your plan for the lighthouse, in three parts.", { bold: true }))],
  boxes: [
    { id: "wb-what", label: "What I want to work on", hint: "two or three sentences." },
    { id: "wb-who", label: "Who I will ask", hint: "" },
    { id: "wb-next", label: "My next step", hint: "one line." },
  ],
  guidance: [p(run("A strong plan names one step you will take."))],
  words: null,
  due: "dayBefore",
};

const answerPath = (uid, weekNumber, exerciseId) => `courseExerciseResponses/${RUN.agi}__${uid}__w0${weekNumber}__${exerciseId}`;

/** The world every suite starts from. `over` adds or replaces whole documents. */
export function writtenSeed(over = {}) {
  const seed = facilitatorSeed();
  // The summer's answers on weeks 2 and 3 go with those weeks: they were never set there.
  for (const path of Object.keys(seed)) {
    if (/__w0[23]__x[23]$/.test(path)) delete seed[path];
  }
  seed[`courseRuns/${RUN.agi}/weeks/w02`] = answerWeek(2, "Who keeps the lamps", ONE_BOX);
  seed[`courseRuns/${RUN.agi}/weeks/w03`] = answerWeek(3, "The lamp makers", BOXES);
  seed[`courses/${COURSE.agi}`] = { ...seed[`courses/${COURSE.agi}`], rubric: RUBRIC, dayBeforeDueTime: "12:00" };
  // The facilitator enrolments the facilitators route writes for Group B's two.
  for (const uid of ["rahul", "sofia"]) {
    seed[`courseEnrolments/${RUN.agi}__${uid}`] = enrolment(uid, null, { role: "facilitator", allocatedEmailAt: null });
  }
  return { ...seed, ...over };
}

/** The Firestore module as the routes import it, with what the account sweep and the pages name. */
const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
);

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

export async function makeWrittenAnswersWorld(key = "__writtenAnswers") {
  const ui = {
    h: createElement,
    overview: null,
    summary: null,
    weekDocs: {},
    progress: new Map(),
    ownRows: new Map(),
    ownRowsLoaded: true,
    authUser: null,
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
    ["firebase-admin/firestore", FIRESTORE],
    // The admissions tree's page gate imports the session by its own path.
    ["./session", `export async function getCurrentUser() { return globalThis[${JSON.stringify(key)}].user; }`],
    ["@/lib/rateLimit", "export function rateLimit() { return { ok: true, retryAfterSeconds: 0 }; }\nexport function clientIp() { return '10.0.0.1'; }"],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
        "export function useRouter() { return { replace() {}, push() {}, refresh() {}, back() {} }; }\n" +
        "export function usePathname() { return '/learn'; }\n" +
        "export function useSelectedLayoutSegment() { return 'attendance'; }\n" +
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
    [
      "@/features/courses/facilitator/useFacilitatorSummary",
      `export function useFacilitatorSummary() { return { data: ${handle}.summary, error: null, loading: false }; }\nexport default useFacilitatorSummary;`,
    ],
    ["./useSyncTasks", "export function useSyncTasks() {}"],
    ["@/features/courses/useRunProgress", `export function useRunProgress() { return { byItemId: ${handle}.progress, loading: false, error: null }; }`],
    ["./useWeek", useWeekStub],
    ["../useWeek", useWeekStub],
    ["@/features/courses/useWeek", useWeekStub],
    ["../useGroupRoster", "export function useGroupRoster() { return { group: null, facilitators: [], members: [], loading: false, error: null }; }"],
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
    ["@/features/courses/AttendanceGrid", quiet("AttendanceGrid")],
    ["@/features/courses/ReviewQueue", quiet("ReviewQueue")],
    ["@/components/motion/PageEnter", `export default function PageEnter({ className, children }) { return ${handle}.h('div', { className }, children); }`],
    [
      "@/components/ui/ActionToast",
      "export default function ActionToast() { return null; }\n" +
        "export function useActionToast() { return { toast: null, dismiss() {}, run: async (fn) => { try { await fn(); } catch {} } }; }",
    ],
    ["@/auth/AuthProvider", `export function useAuth() { return { user: ${handle}.authUser, loading: false, role: ${handle}.authUser?.role ?? null }; }`],
    [
      "@/lib/firebase/client",
      ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
        .map((name) => `export function ${name}() { return { browser: true }; }`)
        .join("\n"),
    ],
    [
      "firebase/firestore",
      "export function doc(db, ...segments) { return { path: segments.join('/') }; }\n" +
        "export async function getDoc(ref) { return { exists: () => false, data: () => undefined, id: ref.path }; }\n" +
        "export async function setDoc() {}\n" +
        "export function serverTimestamp() { return 'serverTimestamp()'; }\n" +
        "export function collection() { return {}; }\nexport function query() { return {}; }\nexport function where() { return {}; }\n" +
        "export function onSnapshot() { return () => {}; }",
    ],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  made.world.ui = ui;
  const { world, call, courseRoute, loadTs } = made;

  const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
  const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
  const routes = {
    overview: await courseRoute("runs", "[runId]", "overview"),
    myExercises: await courseRoute("runs", "[runId]", "my-exercises"),
    write: await courseRoute("runs", "[runId]", "written-answers", "[answerId]"),
    // Feedback as a signed comment, and the batch email that says it is there.
    feedback: await courseRoute("runs", "[runId]", "feedback"),
    send: await courseRoute("runs", "[runId]", "feedback", "send"),
    sendTest: await courseRoute("runs", "[runId]", "feedback", "send", "test"),
    // Ratings for the team: an admin's or the lead's rating of a written answer.
    workRatings: await courseRoute("runs", "[runId]", "work-ratings"),
    rubric: await courseRoute("[courseId]", "rubric"),
    summary: await courseRoute("groups", "[groupId]", "summary"),
    verdict: await courseRoute("exercise-responses", "[responseId]", "review"),
    queue: await courseRoute("groups", "[groupId]", "exercises"),
    submit: await courseRoute("runs", "[runId]", "exercises", "[exerciseId]", "submit"),
    // The week you submit: Submit, Reopen and the one tick route.
    submitWeek: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "submit"),
    reopenWeek: await courseRoute("runs", "[runId]", "weeks", "[weekId]", "reopen"),
    tick: await courseRoute("runs", "[runId]", "ticks", "[itemId]"),
  };
  const pages = {
    week: (await loadTs(join("app", "(app)", "learn", "[runId]", "weeks", "[n]", "page.tsx"))).default,
    feedback: (await loadTs(join("app", "(app)", "learn", "[runId]", "weeks", "[n]", "feedback", "page.tsx"))).default,
    written: (await loadTs(join(GROUP, "written", "page.tsx"))).default,
    group: (await loadTs(join(GROUP, "page.tsx"))).default,
    oldReview: (await loadTs(join(GROUP, "review", "page.tsx"))).default,
    leadWritten: (await loadTs(join(PROGRAMME, "written", "page.tsx"))).default,
    attendance: (await loadTs(join(PROGRAMME, "(tabs)", "attendance", "page.tsx"))).default,
    overviewTab: (await loadTs(join(PROGRAMME, "(tabs)", "overview", "page.tsx"))).default,
  };
  const components = {
    WeekView: (await loadTs(join("features", "courses", "WeekView.tsx"))).default,
    RunHome: (await loadTs(join("features", "courses", "RunHome.tsx"))).default,
    HomeFacilitator: (await loadTs(join("app", "(app)", "dashboard", "HomeFacilitator.tsx"))).default,
  };
  const lib = {
    courses: await loadTs(join("lib", "firestore", "courses.ts")),
    words: await loadTs(join("lib", "courses", "writtenAnswerWords.ts")),
    rubric: await loadTs(join("lib", "courses", "rubric.ts")),
    rubricMarkdown: await loadTs(join("lib", "courses", "rubricMarkdown.ts")),
    model: await loadTs(join("lib", "courses", "writtenAnswers", "model.ts")),
    access: await loadTs(join("lib", "courses", "writtenAnswers", "access.ts")),
    queue: await loadTs(join("lib", "courses", "writtenAnswers", "queue.ts")),
    feedbackWords: await loadTs(join("lib", "courses", "feedback", "words.ts")),
    feedbackModel: await loadTs(join("lib", "courses", "feedback", "model.ts")),
    feedbackSend: await loadTs(join("lib", "courses", "feedback", "send.ts")),
    workRatingsWords: await loadTs(join("lib", "courses", "workRatings", "words.ts")),
    workRatingsModel: await loadTs(join("lib", "courses", "workRatings", "model.ts")),
    workRatingsRecord: await loadTs(join("lib", "firestore", "courseWorkRatings.ts")),
    whoFinished: await loadTs(join("lib", "courses", "finishing", "whoFinished.ts")),
    worksheets: await loadTs(join("lib", "firestore", "worksheets.ts")),
  };

  /** Move every clock the routes and the store read. */
  function at(when) {
    mock.timers.setTime(new Date(when).getTime());
  }

  function reset(seed = writtenSeed()) {
    at(NOW);
    made.reset(seed, { now: () => new Date() });
    ui.overview = null;
    ui.summary = null;
    ui.weekDocs = {};
    ui.progress = new Map();
    ui.ownRows = new Map();
    ui.ownRowsLoaded = true;
    ui.authUser = null;
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  }

  /** The session a page is handed: the stored account, with the reviewer flag the roles writer keeps. */
  function sessionFor(uid) {
    const base = made.sessionOf(uid);
    if (!base) return null;
    return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
  }

  const weekIdOf = (n) => `w0${n}`;
  const rowPath = (uid, n, answerId = n === 2 ? ONE_BOX.id : BOXES.id) => answerPath(uid, n, answerId);

  /**
   * `who` saves their own answer to week `n`'s written answer; with `send`,
   * then submits the week, which is how an answer is sent (the week you
   * submit), answering with the submit's own answer when the save went.
   */
  const write = async (who, n, content, { send = false, viewAs = false, answerId = n === 2 ? ONE_BOX.id : BOXES.id } = {}) => {
    const saved = await call(who, routes.write.PUT, { runId: RUN.agi, answerId }, { course: true, viewAs, body: { weekId: weekIdOf(n), ...content } });
    if (!send || saved.status !== 200) return saved;
    return call(who, routes.submitWeek.POST, { runId: RUN.agi, weekId: weekIdOf(n) }, { course: true, viewAs, body: { submit: true } });
  };

  /** `who` submits their own week `n`, which sends its written answer. */
  const submitWeek = (who, n, { viewAs = false, body = { submit: true } } = {}) =>
    call(who, routes.submitWeek.POST, { runId: RUN.agi, weekId: weekIdOf(n) }, { course: true, viewAs, body });

  /** `who` reopens `uid`'s week `n`. */
  const reopenWeek = (who, uid, n, { viewAs = false } = {}) =>
    call(who, routes.reopenWeek.POST, { runId: RUN.agi, weekId: weekIdOf(n) }, { course: true, viewAs, body: { uid } });

  /** `who` ticks (or unticks) one of week `n`'s items. */
  const tick = (who, n, itemId, completed = true, { viewAs = false } = {}) =>
    call(who, routes.tick.PUT, { runId: RUN.agi, itemId }, { course: true, viewAs, body: { weekId: weekIdOf(n), completed } });

  /** Every row of the work log for `uid`, oldest first as written. */
  const logOf = (uid) =>
    world.db
      .paths()
      .filter((path) => path.startsWith("courseWorkLog/"))
      .map((path) => world.db.read(path))
      .filter((row) => row.uid === uid);

  /** `uid`'s stored week `n`, or undefined. */
  const weekWorkOf = (uid, n) => world.db.read(`courseWeekWork/${RUN.agi}__${uid}__${weekIdOf(n)}`);

  /**
   * `who` saves a piece of feedback on `uid`'s week `n`: on its written
   * answer, or with `on: "week"` on the week as a whole.
   */
  const give = (who, uid, n, text, { viewAs = false, on = "writtenAnswer", itemId = n === 2 ? ONE_BOX.id : BOXES.id, extra = {} } = {}) =>
    call(who, routes.feedback.POST, { runId: RUN.agi }, {
      course: true,
      viewAs,
      body: { uid, weekId: weekIdOf(n), on, ...(on === "writtenAnswer" ? { itemId } : {}), text, ...extra },
    });

  /** `who` changes the words of piece `id`. */
  const change = (who, id, text, { viewAs = false } = {}) =>
    call(who, routes.feedback.PATCH, { runId: RUN.agi }, { course: true, viewAs, body: { id, text } });

  /** `who` deletes piece `id`. */
  const remove = (who, id, { viewAs = false } = {}) =>
    call(who, routes.feedback.DELETE, { runId: RUN.agi }, { course: true, viewAs, body: { id } });

  /** Every stored piece of feedback, oldest written first, each with its id. */
  const pieces = () =>
    world.db
      .paths()
      .filter((path) => path.startsWith("courseFeedback/"))
      .map((path) => ({ id: path.slice("courseFeedback/".length), ...world.db.read(path) }));

  /** `who` sends themselves a test of the feedback emails. */
  const sendTest = (who, { viewAs = false } = {}) =>
    call(who, routes.sendTest.POST, { runId: RUN.agi }, { course: true, viewAs });

  /**
   * `who` rates `uid`'s week `n` written answer for the team: `rating` from 1
   * to 10 and `comment`, or, with `extra`, whatever else a body carries.
   */
  const rate = (who, uid, n, rating, comment, { viewAs = false, itemId = n === 2 ? ONE_BOX.id : BOXES.id, extra = {} } = {}) =>
    call(who, routes.workRatings.PUT, { runId: RUN.agi }, {
      course: true,
      viewAs,
      body: { uid, weekId: weekIdOf(n), itemId, rating, comment, ...extra },
    });

  /** `who` clears their own rating of `uid`'s week `n` written answer. */
  const clearRating = (who, uid, n, { viewAs = false } = {}) =>
    call(who, routes.workRatings.DELETE, { runId: RUN.agi }, { course: true, viewAs, body: { uid, weekId: weekIdOf(n) } });

  /** Every stored rating for the team, each with its id. */
  const workRatings = () =>
    world.db
      .paths()
      .filter((path) => path.startsWith("courseWorkRatings/"))
      .map((path) => ({ id: path.slice("courseWorkRatings/".length), ...world.db.read(path) }));

  /** `who` presses Send with `body` (the ticked ids and the button's two numbers). */
  const send = (who, body, { viewAs = false } = {}) =>
    call(who, routes.send.POST, { runId: RUN.agi }, { course: true, viewAs, body });

  /** The full rubric's levels, one per row: `level` for every row. */
  const levels = (level = "Solid") => RUBRIC.rows.map((row) => ({ row: row.name, level }));

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

  /** A server page as `who`: its element, its HTML and words, and where it sent them. */
  async function draw(Page, who, params, searchParams = {}) {
    world.user = who === null ? null : sessionFor(who);
    world.course = true;
    const before = made.everything();
    try {
      const element = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) });
      const html = renderToStaticMarkup(element);
      return { element, html, text: textOf(html), to: null, wrote: made.everything() !== before };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { element: null, html: "", text: "", to: err.to, wrote: made.everything() !== before };
    } finally {
      world.course = false;
    }
  }

  /** The week page as `who`: the shell's props, then the page drawn as the browser would hold it. */
  async function weekPage(who, n) {
    world.user = made.sessionOf(who);
    world.course = true;
    let shell;
    try {
      shell = await pages.week({ params: Promise.resolve({ runId: RUN.agi, n: String(n) }) });
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { html: "", text: "", to: err.to };
    } finally {
      world.course = false;
    }
    const overview = await call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });
    ui.overview = overview.status === 200 ? overview.body : null;
    ui.weekDocs = weekDocsAsStored();
    ui.authUser = who ? { uid: who } : null;
    const own = await ownRowsOf(who, n);
    ui.ownRows = new Map((own.status === 200 ? own.body.responses : []).map((row) => [row.exerciseId, row]));
    const html = renderToStaticMarkup(createElement(components.WeekView, shell.props));
    return { html, text: textOf(html), to: null, overview: ui.overview, own };
  }

  /** The programme home as `who` sees it. */
  async function programmeHome(who) {
    const overview = await call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });
    ui.overview = overview.status === 200 ? overview.body : null;
    ui.weekDocs = weekDocsAsStored();
    ui.authUser = who ? { uid: who } : null;
    const html = renderToStaticMarkup(
      createElement(components.RunHome, { runId: RUN.agi, isAdmin: who === "zach", canEmailCohort: false, pitching: null, canLeave: false, uid: who }),
    );
    return { html, text: textOf(html), overview: ui.overview };
  }

  /** The review page for a group, as `who`. */
  const writtenPage = (who, query = {}, groupId = B) => draw(pages.written, who, { runId: RUN.agi, groupId }, query);
  /** The lead's review page, as `who`. */
  const leadPage = (who, query = {}) => draw(pages.leadWritten, who, { roundId: ROUND, programmeId: AGI }, query);
  /** The old feedback page for week `n`, as `who`: it only sends its reader on. */
  const feedbackPage = (who, n) => draw(pages.feedback, who, { runId: RUN.agi, n: String(n) });
  /** The programme's Overview tab, as `who`. */
  const overviewTab = (who) => draw(pages.overviewTab, who, { roundId: ROUND, programmeId: AGI });
  /** The group page, as `who`. */
  const groupPage = (who, groupId = B) => draw(pages.group, who, { runId: RUN.agi, groupId });
  /** The summer's review page, as `who`. */
  const oldReviewPage = (who, query = {}, groupId = B) => draw(pages.oldReview, who, { runId: RUN.agi, groupId }, query);
  /** The Attendance tab, as `who`. */
  const attendanceTab = (who) => draw(pages.attendance, who, { roundId: ROUND, programmeId: AGI });
  /** The summary route's answer to `who`. */
  const summary = (who, groupId = B) => call(who, routes.summary.GET, { groupId }, { course: true });

  /** Home's facilitator form as `who`: the overview and the summary handed to its hooks. */
  async function home(who, given = "Rahul") {
    const overview = await call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });
    if (overview.status !== 200) return null;
    ui.overview = overview.body;
    const answer = await summary(who, B);
    ui.summary = answer.status === 200 ? answer.body : null;
    const entry = { runId: RUN.agi, courseTitle: "AGI Strategy Fellowship", groupName: null, roles: ["facilitator"] };
    const html = renderToStaticMarkup(createElement(components.HomeFacilitator, { given, invite: null, entry, comingUp: null, more: null }));
    return { html, text: textOf(html), summary: ui.summary };
  }

  return {
    ...made,
    ui,
    routes,
    pages,
    components,
    lib,
    at,
    reset,
    sessionFor,
    rowPath,
    write,
    submitWeek,
    reopenWeek,
    tick,
    logOf,
    weekWorkOf,
    give,
    change,
    remove,
    pieces,
    sendTest,
    send,
    rate,
    clearRating,
    workRatings,
    levels,
    ownRowsOf,
    draw,
    weekPage,
    programmeHome,
    writtenPage,
    leadPage,
    feedbackPage,
    overviewTab,
    groupPage,
    oldReviewPage,
    attendanceTab,
    summary,
    home,
  };
}
