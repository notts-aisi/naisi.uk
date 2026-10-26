/**
 * Week 3 of AGI Strategy's run, for the suite about leaving a run (Q12,
 * board wk-left-phone) and what everybody else then sees of somebody who left.
 *
 * Built on `tests/lib/hubAttendanceWorld.mjs`: the run in its third week as
 * the lead's tabs draw it (four groups and their registers; Sam, who left on
 * Fri 6 Nov saying why; Omar, whom staff took off; Una, placed and not told
 * yet), on the hand-over world's real handlers and recording mail door. On
 * top of that:
 *
 *  - EVERYBODY IN A GROUP HOLDS THEIR PLACE THROUGH THE FORM: a row on the
 *    run's own list as an admin's hand-over writes it (`fromForm`), except
 *    Chloe, who applied to the run itself on its older form.
 *  - AMARA (Group A, told, Present at all three of its sessions) is on the
 *    run's cohort list, has week 1's card in her tasks, and has written on
 *    two of week 1's readings. Dev has written on one too.
 *  - Weeks 1 to 3 carry readings and are published; 4 to 6 carry readings
 *    and are not.
 *  - The site lists two upcoming events, one with its room held back; a past
 *    event and a draft are not listed.
 *  - A SECOND RUN IS OPEN: Kai took a seat in its one group himself.
 *
 * The clock is Tue 17 Nov 2026 at noon in London (GMT), as in the world it
 * is built on, and the freed places window (the end of the run's week 1,
 * Wed 4 Nov) has closed. Every address is `example.com`.
 *
 * Real: every handler, page and library a suite loads, the access gate, the
 * email templates. Stubbed: what the hand-over world stubs (the session, the
 * Admin SDK handle, the view-as guard, the mail door, which records), the
 * rate limiter, Next's navigation and link, whether the page's script has
 * arrived, the stylesheets, the run home's client component where the page
 * imports it (it records what it is handed), and the data hooks of the run
 * home, the register and My programmes (each hands its component what a
 * suite sets), and whether a member holds a place, which My programmes asks
 * (no, here: that question is tests/applications-place-in-the-member-area's).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { walkSource } from "./functionScan.mjs";
import { loadJoin, makeWorld } from "./handoverWorld.mjs";
import {
  A,
  AGI,
  B,
  C,
  COURSE,
  D,
  NOW,
  PEOPLE,
  ROUND,
  RUN,
  SAM_LEFT,
  SAM_SAID,
  TOLD_ON,
  account,
  attendanceSeed,
  enrolment,
  registerPath,
} from "./hubAttendanceWorld.mjs";

export { A, AGI, B, C, COURSE, D, NOW, PEOPLE, ROUND, RUN, SAM_LEFT, SAM_SAID, TOLD_ON, registerPath };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** The open run: the pre-course, which the hand-over world names and no programme does. */
export const OPEN_RUN = RUN.other;
export const OPEN_GROUP = "pre-course-tuesday__grp00009";

/** What Amara types when she leaves. */
export const AMARA_SAID = "Too much on this term, and the times moved.";

export const cohortChannel = (runId) => `cohort:${runId}`;
export const subscriptionPath = (uid, runId = RUN.agi) => `subscriptions/sub_${uid}@example.com__${cohortChannel(runId)}`;
export const enrolmentPath = (uid, runId = RUN.agi) => `courseEnrolments/${runId}__${uid}`;
export const rowPath = (uid, runId = RUN.agi) => `courseApplications/${runId}__${uid}`;
export const applicationPath = (uid) => `admissionApplications/${ROUND}__${uid}`;
export const formPath = `admissionRounds/${ROUND}`;
export const taskPath = (uid, week = 1, runId = RUN.agi) => `tasks/course-w0${week}__${runId}__${uid}`;

/** A reading, a link and a note per week; the ids are the week's own. */
function materials(n) {
  return [
    {
      id: `m_w${n}_reading`,
      type: "reading",
      title: n === 1 ? "Racing to the precipice" : `Week ${n} reading`,
      url: `https://example.com/readings/week-${n}`,
      estimatedMinutes: 25,
    },
    { id: `m_w${n}_slides`, type: "link", title: `Week ${n} slides`, url: `https://example.com/slides/week-${n}`, optional: true },
    { id: `m_w${n}_note`, type: "note", title: "Before the session", body: `Bring one question about week ${n}.` },
  ];
}

/** An event as the events editor and its routes leave one. */
function eventDoc(over) {
  return {
    title: "",
    blocks: [],
    location: "",
    locationHidden: false,
    locationPublicText: null,
    visibility: "public",
    capacity: null,
    waitlistEnabled: false,
    noSignup: true,
    signupForm: [],
    foodProvenance: "none",
    coverBranding: "none",
    archived: false,
    status: "published",
    authorUid: "zach",
    collaboratorUids: [],
    rsvpCountConfirmed: 0,
    rsvpCountPending: 0,
    ...over,
  };
}

/** A progress row as the week page writes one. */
function progress(uid, weekNumber, itemId, over = {}, runId = RUN.agi) {
  return {
    runId,
    uid,
    weekNumber,
    itemKind: "material",
    itemId,
    completed: true,
    completedAt: new Date("2026-11-01T10:00:00Z"),
    hasPublicComment: false,
    updatedAt: new Date("2026-11-01T10:00:00Z"),
    ...over,
  };
}

/** The world every leaving suite starts from. `over` adds or replaces whole documents. */
export function leavingSeed(over = {}) {
  const seed = attendanceSeed();

  // Each group's count of people in it, as the allocate route keeps it.
  for (const [groupId, count] of [
    [A, 4],
    [B, 3],
    [C, 2],
    [D, 2],
  ]) {
    seed[`courseGroups/${groupId}`] = { ...seed[`courseGroups/${groupId}`], memberCount: count };
  }

  // AGI Strategy has places enough for a place given back to show.
  const form = seed[formPath];
  form.programmes[AGI].places = 6;
  form.applicationCounts = { draft: 0, submitted: 0, accepted: 4, invited: 1, withdrawn: 1, "no-offer": 1 };

  // Everybody in a group holds their place through the form, as the hand-over writes it.
  for (const [uid, [name]] of Object.entries(PEOPLE)) {
    seed[rowPath(uid)] = {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid,
      displayName: name,
      status: "accepted",
      fromForm: { roundId: ROUND, programmeId: AGI },
      createdAt: TOLD_ON,
      updatedAt: TOLD_ON,
    };
  }
  // Chloe applied to the run itself.
  const chloe = seed[rowPath("chloe")];
  delete chloe.fromForm;
  chloe.email = "chloe@example.com";
  // Una holds no place on the form yet: she is placed, and nobody has told her.

  // Amara: on the cohort list, week 1's card in her tasks, notes on week 1.
  seed[subscriptionPath("amara")] = {
    email: "amara@example.com",
    channel: cohortChannel(RUN.agi),
    audience: "user",
    audienceId: "amara",
    confirmed: true,
    subscribed: true,
  };
  seed[taskPath("amara")] = {
    title: "AGI Strategy: week 1",
    source: "fellowship-reminder",
    completerUids: ["amara"],
    reviewerUids: [],
    visibility: "assignees-only",
  };
  seed[`courseProgress/${RUN.agi}__amara__m_w1_reading`] = progress("amara", 1, "m_w1_reading", {
    rating: 4,
    publicComment: "Clearer than I expected.",
    hasPublicComment: true,
    privateNote: "Reread section 3 before the session.",
  });
  seed[`courseProgress/${RUN.agi}__amara__m_w1_slides`] = progress("amara", 1, "m_w1_slides");
  seed[`courseProgress/${RUN.agi}__amara__m_w2_reading`] = progress("amara", 2, "m_w2_reading", { rating: 2 });
  seed[`courseProgress/${RUN.agi}__dev__m_w1_reading`] = progress("dev", 1, "m_w1_reading", {
    privateNote: "Dev's own note, which nobody else reads.",
  });
  seed[`courseProgress/${RUN.tais}__amara__m_w1_reading`] = progress(
    "amara",
    1,
    "m_w1_reading",
    { privateNote: "A note on another run." },
    RUN.tais,
  );

  // The weeks carry readings; 4 to 6 are not published yet.
  for (let n = 1; n <= 6; n += 1) {
    const path = `courseRuns/${RUN.agi}/weeks/w0${n}`;
    seed[path] = { ...seed[path], materials: materials(n), checklist: [], exercises: [], guideBlocks: [] };
  }

  // The site's events.
  seed["events/pizza"] = eventDoc({
    title: "Pizza and board games",
    startAt: new Date("2026-11-19T19:00:00Z"),
    endAt: new Date("2026-11-19T21:00:00Z"),
    location: "Hallward B12",
  });
  seed["events/movie"] = eventDoc({
    title: "Movie night",
    startAt: new Date("2026-11-25T19:00:00Z"),
    endAt: new Date("2026-11-25T21:30:00Z"),
    location: "Flat 3, 21 Example Road",
    locationHidden: true,
    locationPublicText: "Somewhere in Lenton",
  });
  seed["events/past"] = eventDoc({
    title: "Welcome social",
    startAt: new Date("2026-11-10T19:00:00Z"),
    endAt: new Date("2026-11-10T21:00:00Z"),
    location: "Portland A13",
  });
  seed["events/draft"] = eventDoc({
    title: "Not announced yet",
    status: "draft",
    startAt: new Date("2026-11-20T19:00:00Z"),
    endAt: new Date("2026-11-20T21:00:00Z"),
  });

  // The open run, and Kai's seat on it.
  seed[`courseRuns/${OPEN_RUN}`] = {
    ...seed[`courseRuns/${OPEN_RUN}`],
    enrolMode: "open",
    status: "running",
    startDate: "2026-10-29",
    weekPlan: seed[`courseRuns/${RUN.agi}`].weekPlan,
    enrolledCount: 1,
  };
  seed[`courseGroups/${OPEN_GROUP}`] = {
    runId: OPEN_RUN,
    courseId: COURSE.other,
    name: "Tuesday drop-in",
    facilitatorUids: ["tom"],
    capacity: 20,
    memberCount: 1,
    archived: false,
    session: { weekday: 2, startTimeLocal: "17:00", durationMinutes: 60, location: "Room C1", meetingUrl: null, notes: "" },
  };
  seed["users/kai"] = account("kai", "Kai Brennan");
  seed[enrolmentPath("kai", OPEN_RUN)] = enrolment("kai", OPEN_GROUP, {
    runId: OPEN_RUN,
    courseId: COURSE.other,
    selfEnrolled: true,
    allocatedEmailAt: null,
  });
  seed[subscriptionPath("kai", OPEN_RUN)] = {
    email: "kai@example.com",
    channel: cohortChannel(OPEN_RUN),
    audience: "user",
    audienceId: "kai",
    confirmed: true,
    subscribed: true,
  };

  return { ...seed, ...over };
}

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

/** Every stylesheet any file under `src` imports, by the specifier it is imported by. */
function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) {
      found.add(specifier);
    }
  }
  return [...found];
}

/**
 * The world, its routes, its pages and short ways to ask them. `key` names
 * the handle on `globalThis` the stubs read.
 */
export async function makeLeavingWorld(key = "__leaving") {
  const ui = { h: createElement, hydrated: false, replaced: [], runHome: null, attendance: null, overview: null, myRuns: null };
  const handle = `globalThis[${JSON.stringify(key)}].ui`;
  const made = makeWorld(key, [
    // Every request is somebody's first: the limiter is not what is under test.
    [
      "@/lib/rateLimit",
      "export function rateLimit() { return { ok: true, retryAfterSeconds: 0 }; }\n" +
        "export function clientIp() { return '10.0.0.1'; }",
    ],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        `export function useRouter() { return { replace: (to) => ${handle}.replaced.push(to), push() {}, refresh() {}, back() {} }; }\n` +
        "export function usePathname() { return '/learn'; }\n" +
        "export function useSearchParams() { return new URLSearchParams(); }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, scroll, prefetch, ...rest }) =>\n" +
        `  ${handle}.h('a', { href, className, ...rest }, children);`,
    ],
    // Whether the page's script has arrived: no, as in the server's own
    // markup, unless a suite says so.
    ["@/hooks/useHydrated", `export function useHydrated() { return ${handle}.hydrated === true; }`],
    // The run home's client component, which fetches in the browser: it
    // records what the server page hands it.
    [
      "@/features/courses/RunHome",
      `export default function RunHome(props) { ${handle}.runHome = props; return ${handle}.h('div', null, '[RunHome]'); }`,
    ],
    // The register's data hook: the grid is handed what a suite sets.
    ["./useAttendance", `export default function useAttendance() { return ${handle}.attendance; }`],
    // The run home's data hooks, for the real component drawn on its own: it
    // is handed what a suite sets (the overview route's own answer), and
    // mirrors no tasks.
    [
      "./useRunOverview",
      `export function useRunOverview() { return ${handle}.overview; }\nexport default useRunOverview;`,
    ],
    ["./useSyncTasks", "export function useSyncTasks() {}"],
    // The list of runs My programmes fetches in the browser: the hub is
    // handed what a suite sets, and none unless it sets some.
    [
      "@/features/courses/useMyRuns",
      `export function useMyRuns() { return ${handle}.myRuns ?? { runs: [], loading: false, error: null, reload() {} }; }\n` +
        "export default useMyRuns;",
    ],
    // Whether a member holds a place, which My programmes asks before it says
    // they are on nothing: here, no, so the hub is handed nothing in a run's
    // stead and what it draws is the runs and the runs left.
    ["@/features/applications/home/holdsPlace", "export async function holdsPlace() { return 'no'; }"],
    // The page gates' own import of the session, by the name they write: a
    // programme's pages ask requireAdmissionsPage, which reads the same
    // session the world hands every handler.
    ["./session", `export async function getCurrentUser() { return globalThis[${JSON.stringify(key)}].user; }`],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  made.world.ui = ui;
  const { world, call, courseRoute, loadTs } = made;
  const join_ = await loadJoin(made);

  const routes = {
    ...join_.routes,
    enrol: await courseRoute("runs", "[runId]", "enrol"),
    register: await courseRoute("groups", "[groupId]", "attendance"),
    roster: await courseRoute("groups", "[groupId]", "roster"),
    updates: await courseRoute("runs", "[runId]", "updates"),
    overview: await courseRoute("runs", "[runId]", "overview"),
  };
  const page = (...parts) => loadTs(join("app", "(app)", "learn", "[runId]", ...parts));
  const pages = {
    home: (await page("page.tsx")).default,
    leave: (await page("leave", "page.tsx")).default,
    notes: (await page("notes", "page.tsx")).default,
    reading: (await page("reading", "page.tsx")).default,
    progress: (await page("progress", "page.tsx")).default,
    layout: (await page("layout.tsx")).default,
    // My programmes, the list every run page's bar goes back to.
    programmes: (await loadTs(join("app", "(app)", "learn", "page.tsx"))).default,
  };
  const components = {
    AttendanceGrid: (await loadTs(join("features", "courses", "AttendanceGrid.tsx"))).default,
    LeaveForm: (await loadTs(join("features", "courses", "leaving", "LeaveForm.tsx"))).default,
    // The real one, loaded by its path: the page's import of it is stood in.
    RunHome: (await loadTs(join("features", "courses", "RunHome.tsx"))).default,
  };
  const lib = {
    attendance: await loadTs(join("lib", "courses", "programmeAttendance.ts")),
    overview: await loadTs(join("lib", "courses", "programmeOverview.ts")),
    freed: await loadTs(join("lib", "applications", "freedPlaces", "load.ts")),
    words: await loadTs(join("lib", "courses", "leavingWords.ts")),
  };

  /** Start again from a seed: the clock is the world's own (`NOW` unless a suite moves it). */
  function reset(seed = leavingSeed()) {
    made.reset(seed, { now: () => new Date() });
    // The Admin SDK's sweep of a document and what is under it. Nothing a
    // leave deletes has anything under it here.
    world.courseDb.recursiveDelete = async (ref) => ref.delete();
    ui.hydrated = false;
    ui.replaced = [];
    ui.runHome = null;
    ui.attendance = null;
    ui.overview = null;
    ui.myRuns = null;
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  }

  /** Let the work a route left running after its answer (its email) finish. */
  async function settle() {
    for (let i = 0; i < 25; i += 1) await new Promise((resolve) => setImmediate(resolve));
  }

  /** A press of "Leave", as the confirmation sends it. */
  async function leave(who, body = { confirmName: "AGI Strategy Fellowship", reason: AMARA_SAID }, runId = RUN.agi, options = {}) {
    const answer = await call(who, routes.enrol.DELETE, { runId }, { body, course: true, ...options });
    await settle();
    return answer;
  }

  /** A page as `who` sees it: the element, its HTML, where it sent them, and whether it wrote. */
  async function draw(Page, who, params) {
    world.user = who === null ? null : made.sessionOf(who);
    world.course = true;
    ui.runHome = null;
    const before = made.everything();
    try {
      const element = await Page({ params: Promise.resolve(params), children: createElement("div", null, "[children]") });
      const { renderToStaticMarkup } = await import("react-dom/server");
      const html = renderToStaticMarkup(element);
      return { element, html, text: textOf(html), to: null, wrote: made.everything() !== before };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { element: null, html: "", text: "", to: err.to, wrote: made.everything() !== before };
    } finally {
      world.course = false;
    }
  }

  return { ...made, join: join_, ui, routes, pages, components, lib, reset, settle, leave, draw };
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
