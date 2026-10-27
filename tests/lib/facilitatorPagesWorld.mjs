/**
 * Week 3 of AGI Strategy's run, for the suites about the pages a facilitator
 * uses every week: their group's page (boards wk-fac-group and
 * wk-fac-group-phone), the group's register page, their Home
 * (wk-fac-home-phone), the summary route behind Home, the notes the group's
 * facilitators share, and the lead's reading of them on the Attendance tab.
 *
 * Built on `tests/lib/hubAttendanceWorld.mjs`: the run in its third week as
 * the lead's tabs draw it (four groups and their registers, Sam who left,
 * Omar whom staff took off, Una placed and not told), on the hand-over
 * world's real handlers. Group B is the boards' group: Tuesdays at 6pm for
 * two hours in Hallward B12, Rahul and Sofia facilitating, Chloe, Farah and
 * Kofi in it, its weeks 1 and 2 finished. On top of that:
 *
 *  - EXERCISES WAITING FOR A REVIEW in Group B: Farah's and Chloe's week 2
 *    answers sent and not reviewed, Kofi's week 1 answer sent and reviewed,
 *    Chloe's week 1 answer sent and not reviewed. Group A's Amara has one
 *    waiting too, which no Group B page may count.
 *  - EVERY WEEK has a title, weeks 1 to 3 published.
 *
 * THE CLOCK is Tue 17 Nov 2026 at noon in London (GMT): Group B meets
 * tonight. A suite moves it with `at(...)`; the routes' own `new Date()` and
 * the store's `serverTimestamp()` both read it.
 *
 * Real: the group page, the register page, the review page, the Attendance
 * tab, the summary, notes, register and overview routes, Home's facilitator
 * form, and every library under them. Stubbed: what the hand-over world
 * stubs (the session, the Admin SDK handle, the view-as guard, the mail
 * door), Next's navigation and link, the stylesheets, the register's grid
 * (a client component with its own suites), and the two browser hooks Home
 * reads, each handed the real route's own answer by the suite. Every address
 * is `example.com`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./applicationsStore.mjs";
import { walkSource } from "./functionScan.mjs";
import { makeWorld } from "./handoverWorld.mjs";
import { A, AGI, B, C, D, NOW, ROUND, RUN, attendanceSeed } from "./hubAttendanceWorld.mjs";

export { A, AGI, B, C, D, NOW, ROUND, RUN };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

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

/** The Firestore module as the routes import it, with the `FieldPath` the account sweep names. */
const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
);

/** An exercise answer as the submit route stores one. */
export function answer(uid, weekNumber, { sent, status = "unreviewed", exerciseId = `x${weekNumber}` }) {
  return {
    runId: RUN.agi,
    uid,
    weekId: `w0${weekNumber}`,
    weekNumber,
    exerciseId,
    responseType: "text",
    text: `${uid} wrote this.`,
    submittedAt: new Date(sent),
    reviewStatus: status,
  };
}

const answerPath = (uid, weekNumber, exerciseId = `x${weekNumber}`) =>
  `courseExerciseResponses/${RUN.agi}__${uid}__w0${weekNumber}__${exerciseId}`;

/** The world every facilitator-pages suite starts from. `over` adds or replaces whole documents. */
export function facilitatorSeed(over = {}) {
  const seed = attendanceSeed();
  for (let n = 1; n <= 6; n += 1) {
    seed[`courseRuns/${RUN.agi}/weeks/w0${n}`] = {
      weekNumber: n,
      title: n === 3 ? "Who decides what AGI means" : `Week ${n} readings`,
      summary: "",
      published: n <= 3,
      materials: [],
      checklist: [],
      exercises: [{ id: `x${n}`, prompt: `What is week ${n} about?`, responseType: "text", required: false, maxLength: 2000, peerVisible: false }],
    };
  }
  seed[answerPath("farah", 2)] = answer("farah", 2, { sent: "2026-11-16T09:00:00Z" });
  seed[answerPath("chloe", 2)] = answer("chloe", 2, { sent: "2026-11-15T09:00:00Z" });
  seed[answerPath("chloe", 1)] = answer("chloe", 1, { sent: "2026-11-08T09:00:00Z" });
  seed[answerPath("kofi", 1)] = answer("kofi", 1, { sent: "2026-11-07T09:00:00Z", status: "approved" });
  seed[answerPath("amara", 2)] = answer("amara", 2, { sent: "2026-11-16T10:00:00Z" });
  return { ...seed, ...over };
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

/** Every element below `element` whose component is called `name`. */
export function find(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) find(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element);
  const children = element.props?.children;
  if (children !== undefined) find(children, name, out);
  return out;
}

/**
 * The world, its routes, its pages and short ways to ask them. `key` names
 * the handle on `globalThis` the stubs read. `extraStubs` are
 * `[specifier, source]` pairs added after the world's own, for a suite that
 * draws something this world does not fake (an extra wins over a default of
 * the same name).
 */
export async function makeFacilitatorPagesWorld(key = "__facilitatorPages", extraStubs = []) {
  const ui = { h: createElement, overview: null, summary: null };
  const handle = `globalThis[${JSON.stringify(key)}].ui`;
  const quiet = (name) => `export default function ${name}() { return ${handle}.h('span', { 'data-stub': '${name}' }, '[${name}]'); }`;
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
    ["@/features/courses/useRunOverview", `export function useRunOverview() { return { data: ${handle}.overview, error: null, loading: false, reload() {} }; }`],
    [
      "@/features/courses/facilitator/useFacilitatorSummary",
      `export function useFacilitatorSummary() { return { data: ${handle}.summary, error: null, loading: false }; }\nexport default useFacilitatorSummary;`,
    ],
    ["@/features/courses/AttendanceGrid", quiet("AttendanceGrid")],
    ["@/features/courses/ReviewQueue", quiet("ReviewQueue")],
    [
      "@/lib/firebase/client",
      ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
        .map((name) => `export function ${name}() { throw new Error('no client SDK here'); }`)
        .join("\n"),
    ],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
    ...extraStubs,
  ]);
  made.world.ui = ui;
  const { world, call, courseRoute, loadTs } = made;

  const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
  const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
  const routes = {
    summary: await courseRoute("groups", "[groupId]", "summary"),
    notes: await courseRoute("groups", "[groupId]", "notes"),
    register: await courseRoute("groups", "[groupId]", "attendance"),
    overview: await courseRoute("runs", "[runId]", "overview"),
  };
  const pages = {
    group: (await loadTs(join(GROUP, "page.tsx"))).default,
    register: (await loadTs(join(GROUP, "register", "page.tsx"))).default,
    review: (await loadTs(join(GROUP, "review", "page.tsx"))).default,
    attendance: (await loadTs(join(TABS, "attendance", "page.tsx"))).default,
  };
  const components = {
    HomeFacilitator: (await loadTs(join("app", "(app)", "dashboard", "HomeFacilitator.tsx"))).default,
  };
  const words = await loadTs(join("lib", "courses", "facilitatorPageWords.ts"));
  const model = await loadTs(join("lib", "courses", "facilitatorGroup.ts"));

  /** Move every clock the routes and the store read. */
  function at(when) {
    mock.timers.setTime(new Date(when).getTime());
  }

  /** Start again from a seed, at `NOW`. */
  function reset(seed = facilitatorSeed()) {
    at(NOW);
    made.reset(seed, { now: () => new Date() });
    ui.overview = null;
    ui.summary = null;
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  }

  /** The session a page is handed: the stored account, with the reviewer flag the roles writer keeps. */
  function sessionFor(uid) {
    const base = made.sessionOf(uid);
    if (!base) return null;
    return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
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

  /** The group page as `who`. */
  const groupPage = (who, groupId = B) => draw(pages.group, who, { runId: RUN.agi, groupId });

  /** The register page as `who`. */
  const registerPage = (who, groupId = B) => draw(pages.register, who, { runId: RUN.agi, groupId });

  /** The Attendance tab as `who`. */
  const attendanceTab = (who) => draw(pages.attendance, who, { roundId: ROUND, programmeId: AGI });

  /** The summary route's answer to `who`. */
  const summary = (who, groupId = B) => call(who, routes.summary.GET, { groupId }, { course: true });

  /** A note written through the route, as `who`, at `when`. */
  async function note(who, body, { groupId = B, when = null } = {}) {
    if (when) at(when);
    const answer = await call(who, routes.notes.POST, { groupId }, { body: { body }, course: true });
    if (when) at(NOW);
    return answer;
  }

  /**
   * Home as `who` sees it: the overview route's answer and the summary
   * route's answer handed to the browser hooks, and the facilitator's form
   * drawn with them. Null when Home would not draw the facilitator's form
   * (the overview route refuses).
   */
  async function home(who, given = "Rahul") {
    const overview = await call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });
    if (overview.status !== 200) return null;
    ui.overview = overview.body;
    const groupId = [...overview.body.groups].sort((a, b) => {
      const key = (group) => (group.calendar.nextSession ? `${group.calendar.nextSession.dateKey} ${group.calendar.nextSession.startTimeLocal}` : "9999");
      return key(a).localeCompare(key(b));
    })[0]?.id;
    const answer = groupId ? await summary(who, groupId) : null;
    ui.summary = answer?.status === 200 ? answer.body : null;
    const entry = { runId: RUN.agi, courseTitle: "AGI Strategy Fellowship", groupName: null, roles: ["facilitator"] };
    const html = renderToStaticMarkup(
      createElement(components.HomeFacilitator, { given, invite: null, entry, comingUp: null, more: null }),
    );
    return { html, text: textOf(html), summary: ui.summary };
  }

  return { ...made, ui, routes, pages, components, words, model, at, reset, sessionFor, draw, groupPage, registerPage, attendanceTab, summary, note, home };
}
