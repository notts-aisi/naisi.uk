/**
 * A team's page and its hand-in, for the suites that hold them
 * (`tests/course-hub-team-page-*.test.mjs`).
 *
 * ## What it is made of
 *
 * The teams world (`teamsWorld.mjs`, on pitching week's): the form's
 * incubator programme (`research-incubator`, led by Tess, reviewed by Yusuf)
 * names a course run with a Thursday group (Thursdays 6pm, Room A13,
 * facilitated by Sofia, who holds no place) and a Wednesday group. On top of
 * it:
 *
 *  - THE CALENDAR across two terms, as Q10 draws it: the run starts on
 *    Thursday 29 October 2026 and its plan is weeks 1 to 7, seven breaks, and
 *    weeks 8 to 10, so the Thursday group meets on Thu 26 Nov in week 5, on
 *    Thu 10 Dec in week 7, and on Thu 4, 11 and 18 Feb 2027 in weeks 8 to 10;
 *  - THE HAND-IN DATES: due Thu 18 Feb 2027, the showcase in week 10;
 *  - THE TEAMS, made and told through the teams routes as the lead would
 *    (`teamsMadeAndTold`): Probe transfer (Amara, Dev, Lena) from Amara and
 *    Dev's pitch, and Reward hacking evals (Bea, Maya, Noor, Tariq) from
 *    Bea's, everybody told. Kai is in no team. Omar's group has no team.
 *
 * Callers a suite asks as (`CALLERS`): a team's person, another team's, a
 * person in no team, a member placed on another run, a person who left, the
 * group's facilitator (no place),
 * the programme's lead, another programme's lead, the run's track lead, the
 * programme's reviewer, an admin, and somebody signed out.
 *
 * ## What is real and what is stubbed
 *
 * Real: every route, loader, page and component a suite loads, the libraries
 * behind them (the run's gate, the teams' standing rule, the group's
 * calendar, the words), and both deletion cascades. Stubbed: what the teams
 * world stubs (`server-only`, `next/server`, the Admin SDK's sentinels and
 * handle, the session, the view-as guard, the mail door), and for pages
 * Next's navigation and link, the hydration hook and every stylesheet (its
 * class names).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./applicationsStore.mjs";
import { walkSource } from "./functionScan.mjs";
import { AT, INC, INCUBATOR, PITCH, ROUND, makeTeamsWorld, teamsSeed } from "./teamsWorld.mjs";
import { createLoader } from "./tsLoader.mjs";

export { AT, INC, INCUBATOR, PITCH, ROUND };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** Instants that matter, in UTC (GMT from 25 Oct 2026 to 28 Mar 2027). */
export const WHEN = {
  /** Wed 11 Nov 2026, noon: when the teams are made and told. */
  madeAndTold: AT.wednesdayNoon,
  /** Thu 26 Nov 2026, 10am: week 5, the session tonight at 6pm. */
  weekFive: new Date("2026-11-26T10:00:00Z"),
  /** Wed 2 Dec 2026, noon: still week 5, its last day. */
  weekFiveLastDay: new Date("2026-12-02T12:00:00Z"),
  /** Thu 3 Dec 2026, 9am: week 6 has begun. */
  weekSix: new Date("2026-12-03T09:00:00Z"),
  /** Sat 2 Jan 2027, noon: in the break between the terms. */
  inTheBreak: new Date("2027-01-02T12:00:00Z"),
  /** Thu 11 Feb 2027, noon: week 9, in February. */
  february: new Date("2027-02-11T12:00:00Z"),
  /** Thu 18 Feb 2027, noon: the due day and the showcase. */
  dueDay: new Date("2027-02-18T12:00:00Z"),
  /** 23:59:00 on the due day, the last instant a hand-in can change. */
  lastMinute: new Date("2027-02-18T23:59:00Z"),
  /** One second after it. */
  closed: new Date("2027-02-18T23:59:01Z"),
  /** Mon 1 Mar 2027: every week is over. */
  after: new Date("2027-03-01T12:00:00Z"),
};

/** The seven slots between the terms, as the run's plan holds them. */
const BREAKS = [
  "Holidays",
  "Holidays",
  "Holidays",
  "January exams",
  "January exams",
  "January exams",
  "January exams",
];

/** The run's plan: weeks 1 to 7, the break, weeks 8 to 10. */
export function twoTermPlan() {
  const week = (n) => ({ kind: "week", weekNumber: n, weekId: `w${String(n).padStart(2, "0")}` });
  return [
    ...[1, 2, 3, 4, 5, 6, 7].map(week),
    ...BREAKS.map((label) => ({ kind: "break", label })),
    ...[8, 9, 10].map(week),
  ];
}

/**
 * The world as documents by path. `handIn` is the run's hand-in dates (null
 * for unset), `plan` its week plan.
 */
export function teamPageSeed({ handIn = { dueOn: "2027-02-18", showcaseWeek: 10 }, plan = twoTermPlan() } = {}) {
  const seed = teamsSeed({ madeFrom: "pitches" });
  const run = seed[`courseRuns/${INC.run}`];
  run.weekPlan = plan;
  if (handIn !== null) run.teamHandIn = handIn;
  return seed;
}

/** Every caller a suite asks as, with the words a failure names them by. */
export const CALLERS = [
  ["amara", "a person in Probe transfer"],
  ["bea", "a person in another team"],
  ["kai", "a person taking part in no team"],
  ["nina", "a member placed on another programme's run"],
  ["wen", "a person who left"],
  ["sofia", "the group's facilitator, who holds no place"],
  ["tess", "the programme's lead"],
  ["claudia", "the lead of another programme"],
  ["tomas", "the run's track lead"],
  ["yusuf", "the programme's reviewer"],
  ["zach", "an admin"],
  [null, "somebody signed out"],
];

/** Everybody but the people in Probe transfer. */
export const NOT_PROBE = CALLERS.filter(([uid]) => !["amara", "dev", "lena"].includes(uid));

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

/** Every stylesheet any module in `src` imports, by the specifier it is imported by. */
function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
}

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

const MAIL_DOOR = (handle) =>
  "export async function sendEmail(args) {\n" +
  `  ${handle}.mail.push(args);\n` +
  "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
  "}";

/**
 * A world, its routes, its pages and short ways to ask them. `key` names the
 * handle on `globalThis` the stubs read.
 */
export async function makeTeamPageWorld(key = "__teamPage") {
  const made = await makeTeamsWorld(key);
  const { world } = made;
  world.h = createElement;
  const handle = `globalThis[${JSON.stringify(key)}]`;

  const { loadTs } = createLoader({
    stubs: new Map([
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
      [
        "next/navigation",
        "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
          "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
          "export function useRouter() { return { refresh() {}, push() {}, replace() {}, back() {} }; }\n" +
          "export function usePathname() { return '/learn/run/team'; }\n" +
          "export function useSearchParams() { return new URLSearchParams(); }\n" +
          `export function useSelectedLayoutSegment() { return 'teams'; }`,
      ],
      [
        "next/link",
        "export default ({ href, className, children, scroll, prefetch, ...rest }) =>\n" +
          `  ${handle}.h('a', { href, className, ...rest }, children);`,
      ],
      ["@/hooks/useHydrated", `export function useHydrated() { return ${handle}.hydrated === true; }`],
      ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
    ]),
  });

  const route = (...parts) => loadTs(join("app", "api", ...parts, "route.ts"));
  const routes = {
    checkIn: await route("courses", "runs", "[runId]", "team", "check-in"),
    links: await route("courses", "runs", "[runId]", "team", "links"),
    link: await route("courses", "runs", "[runId]", "team", "links", "[linkId]"),
    handIn: await route("courses", "runs", "[runId]", "team", "hand-in"),
    dates: await route("admissions", "forms", "[roundId]", "programmes", "[programmeId]", "teams", "hand-in"),
  };
  const page = async (...parts) => (await loadTs(join("app", "(app)", ...parts, "page.tsx"))).default;
  const pages = {
    team: await page("learn", "[runId]", "team"),
    handIn: await page("learn", "[runId]", "team", "hand-in"),
    lead: await page("admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "teams", "[teamId]"),
  };
  const lib = {
    access: await loadTs(join("lib", "courses", "teamPage", "access.ts")),
    load: await loadTs(join("lib", "courses", "teamPage", "load.ts")),
    lead: await loadTs(join("lib", "courses", "teamPage", "lead.ts")),
    model: await loadTs(join("lib", "courses", "teamPage", "model.ts")),
    words: await loadTs(join("lib", "courses", "teamPage", "words.ts")),
    weeks: await loadTs(join("lib", "courses", "teamPage", "weeks.ts")),
  };
  const components = {
    TeamPage: (await loadTs(join("features", "courses", "team", "TeamPage.tsx"))).default,
    HandInForm: (await loadTs(join("features", "courses", "team", "HandInForm.tsx"))).default,
    TeamHandIns: (await loadTs(join("features", "courses", "team", "TeamHandIns.tsx"))).default,
  };

  /** Start again: the seed, then the teams made and told through the teams routes. */
  async function reset(seed = teamPageSeed(), { told = true } = {}) {
    made.reset(seed);
    world.hydrated = false;
    if (told) await teamsMadeAndTold();
  }

  /** Probe transfer (Amara, Dev, Lena) and Reward hacking evals (Bea, Maya, Noor, Tariq), everybody told. */
  async function teamsMadeAndTold() {
    const { ask } = made;
    const must = (response, what) => {
      if (response.status !== 200) throw new Error(`${what}: ${response.status} ${JSON.stringify(response.body)}`);
    };
    must(await ask.fromPitch("tess", PITCH.probe), "making Probe transfer");
    must(await ask.fromPitch("tess", PITCH.reward), "making Reward hacking evals");
    must(await ask.test("tess"), "the lead's test");
    must(await ask.tell("tess", 7), "telling everyone");
  }

  const probe = () => made.teamNamed("Probe transfer");
  const reward = () => made.teamNamed("Reward hacking evals");

  const params = { runId: INC.run };
  const ask = {
    checkIn: (who, body, options) => made.call(who, routes.checkIn.POST, params, { body, ...options }),
    addLink: (who, body, options) => made.call(who, routes.links.POST, params, { body, ...options }),
    removeLink: (who, linkId, options) => made.call(who, routes.link.DELETE, { ...params, linkId }, options),
    handIn: (who, body, options) => made.call(who, routes.handIn.POST, params, { body, ...options }),
    dates: (who, body, { programmeId = INCUBATOR, ...options } = {}) =>
      made.call(who, routes.dates.PUT, { roundId: ROUND, programmeId }, { body, ...options }),
  };

  /**
   * A page as `who` is shown it: `{ html }` drawn, or `{ to }` when the page
   * sends them elsewhere.
   */
  async function show(who, Page, pageParams, searchParams = {}) {
    world.user = made.sessionOf(who);
    try {
      const element = await Page({ params: Promise.resolve(pageParams), searchParams: Promise.resolve(searchParams) });
      return { html: renderToStaticMarkup(element), to: null };
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) return { html: null, to: err.to };
      throw err;
    }
  }
  const view = {
    team: (who, searchParams) => show(who, pages.team, params, searchParams),
    handIn: (who) => show(who, pages.handIn, params),
    lead: (who, teamId, programmeId = INCUBATOR) => show(who, pages.lead, { roundId: ROUND, programmeId, teamId }),
  };

  /** Every stored entry on a team's page. */
  const entries = () =>
    world.db
      .paths()
      .filter((path) => path.startsWith("courseTeamEntries/"))
      .map((path) => ({ id: path.split("/")[1], ...world.db.read(path) }));

  return { ...made, made, reset, routes, pages, lib, components, ask, view, show, probe, reward, entries, loadTs };
}

/** One of the team page's pure modules, loaded as written, with nothing stood in: what the weeks suite reads. */
export async function loadPure(...parts) {
  const { loadTs } = createLoader({ stubs: new Map() });
  return loadTs(join(...parts));
}

/** HTML as the words a person reads. */
export function textOf(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
