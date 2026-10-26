/**
 * Week 3 of AGI Strategy's run, for the suites about the lead's Weeks tab
 * (board pr-weeks) and a week changed for one group (Q39).
 *
 * Built on `tests/lib/handoverWorld.mjs` with the member pages' seed
 * (`memberSeed` in `tests/lib/memberPagesWorld.mjs`): the run as the lead's
 * tabs draw it, four groups with their own days (A Thursdays with Sofia, B
 * Tuesdays with Rahul and Sofia, C Wednesdays with Tom, D Mondays with
 * Grace), six weeks with readings, weeks 1 to 4 published, the clock at Tue
 * 17 Nov 2026 noon. On top of it:
 *
 *  - WEEK 3 IS WRITTEN AS BLOCKS: the synthetic week of
 *    `tests/lib/weekBlocksFixture.mjs`, published.
 *  - DREW is a course drafter (`draftCourse`), named on nothing.
 *  - The staff named on the form carry the reviewer flag the form's roles
 *    writer keeps, so the admissions pages' gate admits them.
 *
 * Real: the pages and their layout, the routes, every library under them.
 * Stubbed: what the hand-over world stubs (the session, the Admin SDK handle,
 * the view-as guard, the mail door), Next's navigation and link, the
 * stylesheets, `useHydrated` (false: the page as it is before its script
 * arrives), and the browser SDK, which no page here may reach while it is
 * drawn. Every address is `example.com`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { session, userDoc } from "./applicationsSmallTerm.mjs";
import { walkSource } from "./functionScan.mjs";
import { CAST, makeWorld } from "./handoverWorld.mjs";
import { A, AGI, B, C, COURSE, D, NOW, ROUND, RUN } from "./hubAttendanceWorld.mjs";
import { memberSeed, textOf } from "./memberPagesWorld.mjs";
import { syntheticWeekDoc } from "./weekBlocksFixture.mjs";

export { A, AGI, B, C, COURSE, D, NOW, ROUND, RUN, textOf };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** A course drafter, named on nothing: the admissions pages and the weeks are not theirs. */
const drafter = session("drew", "member", false, "Drew Ellis");
CAST.drew = { ...drafter, permissions: { ...drafter.permissions, draftCourse: true } };

/** Everybody a suite asks as, with what they are on this term. */
export const PERSONAS = [
  ["zach", "an admin"],
  ["claudia", "the lead of the programme that names the run"],
  ["tess", "the lead of another programme"],
  ["lloyd", "the programme's reviewer"],
  ["yusuf", "the run's track lead"],
  ["rahul", "a facilitator of Group B"],
  ["sofia", "Group B's co-facilitator (who facilitates Group A too)"],
  ["tom", "Group C's facilitator"],
  ["chloe", "a member placed in Group B"],
  ["drew", "a course drafter"],
  ["nobody", "a member on nothing"],
  [null, "somebody signed out"],
];

/** The world every suite starts from. `over` adds or replaces whole documents. */
export function weeksTabSeed(over = {}) {
  const seed = memberSeed();
  seed[`courseRuns/${RUN.agi}/weeks/w03`] = syntheticWeekDoc();
  seed["users/drew"] = { ...userDoc(CAST.drew), permissions: CAST.drew.permissions };
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

/** The world, its routes, its pages, and short ways to ask them. `key` names the handle the stubs read. */
export async function makeWeeksTabWorld(key = "__weeksTab") {
  const ui = { h: createElement };
  const handle = `globalThis[${JSON.stringify(key)}]`;
  const made = makeWorld(key, [
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
        "export function useRouter() { return { replace() {}, push() {}, refresh() {}, back() {} }; }\n" +
        "export function usePathname() { return '/admin'; }\n" +
        "export function useSearchParams() { return new URLSearchParams(); }\n" +
        `export function useSelectedLayoutSegment() { return ${handle}.segment ?? null; }`,
    ],
    [
      "next/link",
      "export default ({ href, className, children, scroll, prefetch, onClick, ...rest }) =>\n" +
        `  ${handle}.ui.h('a', { href, className, ...rest }, children);`,
    ],
    // The admissions pages' gate asks the session by its relative name.
    ["./session", `export async function getCurrentUser() { return ${handle}.user; }`],
    ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
    ["@/components/motion/PageEnter", `export default function PageEnter({ className, children }) { return ${handle}.ui.h('div', { className }, children); }`],
    [
      "@/lib/firebase/client",
      ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
        .map((name) => `export function ${name}() { throw new Error('no browser SDK while a page is drawn'); }`)
        .join("\n"),
    ],
    // A facilitator's group week editor reads its week in the browser: it is
    // handed what a suite sets (`world.groupWeek`), and its writes are recorded.
    [
      "./useGroupWeeks",
      `export function useGroupWeek() { return ${handle}.groupWeek; }\n` +
        "export function useGroupWeeks() { return { rows: [], forkedCount: 0, loading: false, error: null, reload() {} }; }\n" +
        `export async function forkGroupWeek(...args) { ${handle}.clientWrites.push(['fork', ...args]); return { ok: true }; }\n` +
        `export async function patchGroupWeek(...args) { ${handle}.clientWrites.push(['patch', ...args]); return { ok: true }; }\n` +
        `export async function setGroupWeekMode(...args) { ${handle}.clientWrites.push(['mode', ...args]); return { ok: true }; }`,
    ],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  made.world.ui = ui;
  made.world.segment = null;
  made.world.groupWeek = null;
  made.world.clientWrites = [];
  const { world, loadTs, courseRoute } = made;

  /** Start again from a seed: the form's staff carry the reviewer flag. */
  function reset(seed = weeksTabSeed()) {
    made.reset(seed, { now: () => new Date() });
    world.segment = null;
    world.groupWeek = null;
    world.clientWrites = [];
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  }

  /** The session a page is drawn for: the stored account, with the reviewer flag the admissions gate reads. */
  function sessionFor(uid) {
    const base = made.sessionOf(uid);
    if (!base) return null;
    return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
  }

  /**
   * A server component drawn as `who`: its HTML and words, or where it sent
   * them. `params` and `searchParams` are handed as the page is handed them.
   */
  async function draw(who, Component, params, { searchParams = {}, segment = null, children = null } = {}) {
    world.user = sessionFor(who);
    world.course = true;
    world.segment = segment;
    try {
      const element = await Component({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams), children });
      const html = renderToStaticMarkup(element);
      return { html, text: textOf(html), to: null, element };
    } catch (err) {
      if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to, element: null };
      throw err;
    } finally {
      world.course = false;
    }
  }

  const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
  const tabsPage = async (...parts) => (await loadTs(join(TABS, ...parts))).default;

  return { ...made, reset, sessionFor, draw, tabsPage, courseRoute, TABS };
}

/** The programme page's own address, as the tabs build it. */
export const PROGRAMME_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;
