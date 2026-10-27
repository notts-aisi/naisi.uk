/**
 * What a facilitator's pages say where their group's names will be, while
 * the people placed in it have not been told their group yet.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Before Publish the roster, the register and the review queue name nobody
 * to a facilitator (`course-hub-group-published-facilitator.test.mjs` holds
 * that of the routes). Each page that draws one of them used to say, of an
 * empty list, that nobody was placed in the group, which is untrue at exactly
 * that moment, and Home said "0 in the group". The routes now say when
 * somebody is waiting to be told (`notYetTold`), and every one of those
 * places says the boards' sentence instead:
 *
 *   "You’ll see your group’s names when groups go out."
 *
 * The two composers add that there is nobody to email, or to tell, until
 * then. The register, which sits under the roster on the group page, draws
 * nothing at all rather than say it a second time. A group that really is
 * empty still says so, in the words it always did, and a group with names
 * lists them.
 *
 * The components are the real ones, rendered to HTML. Only the hook that
 * fetches each one's data is replaced, by a stand-in handing it a payload.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const SENTENCE = "You’ll see your group’s names when groups go out.";

const page = { roster: null, overview: null, summary: null, attendance: null, queue: null, h: createElement };
globalThis.__groupPages = page;
const handle = "globalThis.__groupPages";

const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

/** Every stylesheet any file under `src` imports, by the specifier it is imported by. */
const stylesheets = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) {
    stylesheets.add(specifier);
  }
}

const noop = "() => {}";
const { loadTs } = createLoader({
  stubs: new Map([
    ...[...stylesheets].map((specifier) => [specifier, CLASS_NAMES]),
    ["server-only", "export {};"],
    ["next/link", `export default ({ href, className, children }) => ${handle}.h("a", { href, className }, children);`],
    [
      "next/navigation",
      `export const useRouter = () => ({ push: ${noop}, replace: ${noop}, refresh: ${noop}, back: ${noop} });\n` +
        "export const usePathname = () => '/';\n" +
        "export const useSearchParams = () => new URLSearchParams();",
    ],
    [
      "@/features/courses/useGroupRoster",
      `export function useGroupRoster() { return ${handle}.roster; }\nexport default useGroupRoster;`,
    ],
    ["./useGroupRoster", `export function useGroupRoster() { return ${handle}.roster; }\nexport default useGroupRoster;`],
    ["@/features/courses/useRunOverview", `export function useRunOverview() { return ${handle}.overview; }`],
    // Home's own answer about the group (the summary route), since board wk-fac-home-phone.
    [
      "@/features/courses/facilitator/useFacilitatorSummary",
      `export function useFacilitatorSummary() { return ${handle}.summary; }\nexport default useFacilitatorSummary;`,
    ],
    [
      "./useAttendance",
      `export default function useAttendance() { return ${handle}.attendance; }`,
    ],
    ["./useReviewQueue", `export function useReviewQueue() { return ${handle}.queue; }`],
  ]),
});

const load = async (...parts) => (await loadTs(join(...parts))).default;
const HomeFacilitator = await load("app", "(app)", "dashboard", "HomeFacilitator.tsx");
const GroupRoster = await load("features", "courses", "GroupRoster.tsx");
const FacilitatorGroupPanel = await load("features", "courses", "FacilitatorGroupPanel.tsx");
const AttendanceGrid = await load("features", "courses", "AttendanceGrid.tsx");
const ReviewQueue = await load("features", "courses", "ReviewQueue.tsx");
const StaffEmailComposer = await load("features", "courses", "StaffEmailComposer.tsx");
const RoomNoticeComposer = await load("features", "courses", "RoomNoticeComposer.tsx");

/** The words a page shows, with its markup gone and its entities read. */
const textOf = (element) =>
  renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const PEOPLE = [
  { uid: "bea", displayName: "Bea Lindqvist" },
  { uid: "dev", displayName: "Dev Patel" },
];

/** What the roster hook hands a page. */
function roster({ members, notYetTold }) {
  return {
    group: { id: "g-monday", name: "Monday evening" },
    facilitators: [{ uid: "claudia", displayName: "Claudia Reyes" }],
    members,
    notYetTold,
    memberCount: members.length,
    loading: false,
    error: null,
    reload: () => {},
  };
}

/** The three states a facilitator's group can be in, as the roster route answers. */
const STATES = {
  waiting: { members: [], notYetTold: true },
  told: { members: PEOPLE, notYetTold: false },
  empty: { members: [], notYetTold: false },
};

/** One group card, as the run's overview sends it. */
const GROUP_CARD = {
  id: "g-monday",
  name: "Monday evening",
  calendar: {
    source: "run",
    startDate: "2026-10-26",
    totalWeeks: 6,
    currentWeek: { phase: "running", weekNumber: 1, anchorWeekNumber: 1, breakLabel: null, slotStartKey: "2026-10-26", planIndex: 0 },
    firstSessionDate: "2026-10-26",
    lastSessionDate: "2026-11-30",
    nextSession: {
      weekNumber: 1,
      occurrence: 1,
      sessionKey: "w01",
      dateKey: "2026-10-26",
      startTimeLocal: "18:00",
      durationMinutes: 90,
      // What the overview route has put on every next session since Change a
      // session (Q25): the weeks it covers, its own room and its own link.
      weekNumbers: [1],
      location: "Room B12",
      meetingUrl: null,
    },
  },
  sessionLabel: "Mondays 18:00\u201319:30",
  weekday: 1,
  startTimeLocal: "18:00",
  durationMinutes: 90,
  location: "Room B12",
  meetingUrl: null,
  sessionModes: {},
  facilitatorNames: ["Claudia Reyes"],
};

/**
 * Home, drawn to board wk-fac-home-phone: the session's ticket counts who is
 * expected ("2 expected", the summary route's count of the people Publish
 * has told), and names nobody: the board draws no names on Home, and they
 * are on the group page's "Your group". Before Publish has told anybody, the
 * ticket says the sentence in place of the count, and a group nobody is in
 * says so, as Home always has.
 */
describe("Home, for a facilitator", () => {
  const entry = { runId: "run-1", courseTitle: "AGI Strategy Fellowship", groupName: null, roles: ["facilitator"] };
  /** What the summary route answers for each state, as the roster route answers it. */
  const SUMMARIES = {
    waiting: { expected: 0, notYetTold: true },
    told: { expected: PEOPLE.length, notYetTold: false },
    empty: { expected: 0, notYetTold: false },
  };
  const draw = (state) => {
    page.roster = roster(STATES[state]);
    page.overview = { data: { groups: [GROUP_CARD], weeks: [] }, error: null };
    page.summary = {
      data: { groupId: GROUP_CARD.id, ...SUMMARIES[state], toReview: 0, nextEmail: null, leftRecently: [], coFacilitators: [] },
      error: null,
      loading: false,
    };
    return textOf(createElement(HomeFacilitator, { given: "Claudia", invite: null, entry, comingUp: null, more: null }));
  };

  test("before anybody is told, the session card says when the names come, and counts nobody", () => {
    const text = draw("waiting");
    assert.ok(text.includes(SENTENCE), text);
    assert.ok(!/\d+ expected/.test(text), text);
    assert.ok(!text.includes("Your group"), "a list of nobody is drawn");
  });

  test("once they are told, the count, and no names on Home", () => {
    const text = draw("told");
    assert.ok(text.includes("2 expected"), text);
    assert.ok(!text.includes("Bea") && !text.includes("Dev"), text);
    assert.ok(!text.includes(SENTENCE), text);
  });

  test("a group nobody is placed in says so, as it did", () => {
    const text = draw("empty");
    assert.ok(text.includes("Nobody is in this group yet."), text);
    assert.ok(!/\d+ expected/.test(text), text);
    assert.ok(!text.includes(SENTENCE), text);
  });
});

describe("the group page's roster", () => {
  const draw = (state) => {
    page.roster = roster(STATES[state]);
    return textOf(createElement(GroupRoster, { groupId: "g-monday", groupName: "Monday evening" }));
  };

  test("before anybody is told: the sentence, and no count of nobody", () => {
    const text = draw("waiting");
    assert.ok(text.includes(SENTENCE), text);
    assert.ok(!text.includes("No one is placed"), text);
    assert.ok(!/\b0 members\b/.test(text), text);
  });

  test("told: the names, counted", () => {
    const text = draw("told");
    assert.ok(text.includes("2 members") && text.includes("Dev Patel"), text);
    assert.ok(!text.includes(SENTENCE), text);
  });

  test("empty: as it was", () => {
    const text = draw("empty");
    assert.ok(text.includes("No one is placed in Monday evening yet"), text);
    assert.ok(!text.includes(SENTENCE), text);
  });
});

describe("the run home's panel for a facilitator", () => {
  const draw = (state) => {
    page.roster = roster(STATES[state]);
    return textOf(
      createElement(FacilitatorGroupPanel, {
        runId: "run-1",
        group: GROUP_CARD,
        publishedWeekNumbers: [1],
        showCohortLinks: false,
      }),
    );
  };

  test("before anybody is told the sentence; told, the names; empty, as it was", () => {
    assert.ok(draw("waiting").includes(SENTENCE));
    assert.ok(!draw("waiting").includes("No one is placed"));
    assert.ok(draw("told").includes("Dev Patel") && !draw("told").includes(SENTENCE));
    assert.ok(draw("empty").includes("No one is placed in this group yet."));
  });
});

describe("the register", () => {
  const draw = ({ notYetTold }) => {
    page.attendance = {
      group: { id: "g-monday", name: "Monday evening" },
      sessions: [],
      members: [],
      notYetTold,
      records: {},
      participantNotes: {},
      canEditPushed: false,
      loading: false,
      loaded: true,
      error: null,
      reload: () => {},
      mark: async () => {},
      edit: async () => ({}),
      push: async () => ({}),
      saveNote: async () => ({}),
    };
    return textOf(createElement(AttendanceGrid, { groupId: "g-monday", runId: "run-1" }));
  };

  test("before anybody is told it draws nothing: the roster above it says when the names come", () => {
    assert.equal(draw({ notYetTold: true }), "");
  });

  test("a group nobody is placed in says so, as it did", () => {
    assert.ok(draw({ notYetTold: false }).includes("Nobody is in this group yet."));
  });
});

describe("the review queue", () => {
  const draw = ({ notYetTold }) => {
    page.queue = {
      group: { id: "g-monday", name: "Monday evening" },
      week: {
        weekId: "w01",
        weekNumber: 1,
        title: "Week 1",
        exercises: [{ id: "x1", prompt: "What would change your mind?", helpText: null, responseType: "text", required: true }],
      },
      rows: [],
      notYetTold,
      loading: false,
      error: null,
      reload: () => {},
      review: async () => {},
    };
    return textOf(createElement(ReviewQueue, { runId: "run-1", groupId: "g-monday", weeks: [1], initialWeek: 1 }));
  };

  test("before anybody is told the sentence; otherwise, as it was", () => {
    const waiting = draw({ notYetTold: true });
    assert.ok(waiting.includes(SENTENCE), waiting);
    assert.ok(!waiting.includes("No one is in this group yet"), waiting);
    assert.ok(draw({ notYetTold: false }).includes("No one is in this group yet"));
  });
});

describe("the two composers say there is nobody to reach until then", () => {
  test("the group email", () => {
    page.roster = roster(STATES.waiting);
    const audience = { kind: "group", groupId: "g-monday", groupName: "Monday evening" };
    const text = textOf(createElement(StaffEmailComposer, { runId: "run-1", audience }));
    assert.ok(text.includes(`${SENTENCE} There is nobody to email until then.`), text);
    assert.ok(!text.includes("No one is placed"), text);
    page.roster = roster(STATES.empty);
    assert.ok(
      textOf(createElement(StaffEmailComposer, { runId: "run-1", audience })).includes(
        "No one is placed in Monday evening yet, so there is nobody to email.",
      ),
    );
  });

  test("the room notice", () => {
    const props = { groupId: "g-monday", groupName: "Monday evening", groupHref: "/learn/run-1/group/g-monday", session: null };
    page.roster = roster(STATES.waiting);
    const text = textOf(createElement(RoomNoticeComposer, props));
    assert.ok(text.includes(`${SENTENCE} There is nobody to tell until then.`), text);
    page.roster = roster(STATES.empty);
    assert.ok(
      textOf(createElement(RoomNoticeComposer, props)).includes(
        "No one is placed in Monday evening yet, so there is nobody to tell.",
      ),
    );
  });
});

test("the sentence is written once, in the boards' words", () => {
  const words = readFileSync(join(SRC, "features", "courses", "groupNamesWords.ts"), "utf8");
  assert.ok(words.includes(`export const NAMES_WHEN_GROUPS_GO_OUT = "${SENTENCE}";`));
  for (const file of walkSource(SRC)) {
    if (file.endsWith("groupNamesWords.ts")) continue;
    assert.ok(!readFileSync(file, "utf8").includes("names when groups go out"), `${file} spells the sentence out again`);
  }
});
