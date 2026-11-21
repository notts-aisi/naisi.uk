/**
 * Home for somebody who facilitates on two courses, and for an admin who
 * facilitates (src/app/(app)/dashboard/HomeFacilitator.tsx, HomeMember.tsx,
 * HomeAdmin.tsx, HomeAdminFacilitating.tsx, useFacilitatedRuns.ts and
 * src/lib/courses/homeGroups.ts).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. THE PICK, pure: the group that meets next of every run's groups, the
 *     runs' order kept for a tie and for groups with no session ahead, and
 *     only the groups somebody facilitates out of an overview's.
 *  2. TWO COURSES ON HOME: the group shown is the one that meets next of ALL
 *     the live groups, the count is all of them, and the others are on one
 *     card with their own course's guide and "See them all" to My
 *     programmes. The nearer session on the second course; one course with
 *     no dates; one run completed (never read); a second run that could not
 *     be read.
 *  3. ONE RUN: exactly what was asked before (one overview, one summary, one
 *     guide, no list of other runs), and two groups on one run keep their
 *     line, now leading to My programmes.
 *  4. AN ADMIN WHO FACILITATES: their group's card first, with one group and
 *     with two; with none (or only an archived group), nothing is asked and
 *     nothing is drawn (counted); its place held while its runs answer.
 *  5. A RUN THAT HANGS: each overview has about eight seconds, then counts as
 *     failed; a run that did not answer still counts and "See them all"
 *     stays; nothing is said under the greeting until the group is known; a
 *     facilitator who takes part always has the way to their own week.
 *
 * The world is `tests/lib/facilitatorPagesWorld.mjs`'s: week 3 of AGI
 * Strategy on Tue 17 Nov 2026 at noon. Rahul facilitates Group B (Tuesdays
 * 6pm, tonight) and Sofia Groups A and B. The overview and summary are the
 * real routes' answers; a second course's run is that answer with its run,
 * group and session changed, so every field Home reads has the route's
 * shape. The browser hooks are handed the answers by id, and each records
 * what it was asked for: an id handed to a hook is a request.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, B, NOW, RUN, makeFacilitatorPagesWorld, textOf } from "./lib/facilitatorPagesWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const KEY = "__homeTwoCourses";
const ui = `globalThis[${JSON.stringify(KEY)}].ui`;
const asked = `${ui}.asked`;
const nothing = (name) => `export default function ${name}() { return null; }\nexport function ${name}Stub() { return null; }`;

const w = await makeFacilitatorPagesWorld(KEY, [
  [
    "@/features/courses/useRunOverview",
    `export function useRunOverview(runId) {
       if (runId) ${asked}.overview.push(runId);
       const data = ${ui}.overviews[runId] ?? null;
       return { data, error: data ? null : (${ui}.failed.includes(runId) ? new Error("failed") : null), loading: false, reload() {} };
     }
     export default useRunOverview;`,
  ],
  [
    "@/features/courses/useRunOverviews",
    `export function useRunOverviews(runIds) {
       ${asked}.overviews.push(...runIds);
       if (runIds.length > 0 && ${ui}.unsettled) return { byRun: new Map(), settled: false };
       const byRun = new Map();
       for (const runId of runIds) if (${ui}.overviews[runId]) byRun.set(runId, ${ui}.overviews[runId]);
       return { byRun, settled: true };
     }
     export default useRunOverviews;`,
  ],
  [
    "@/features/courses/facilitatorGuide/useFacilitatorGuide",
    `export function useFacilitatorGuide(courseId) {
       if (courseId) ${asked}.guide.push(courseId);
       return ${ui}.guides[courseId] ?? null;
     }
     export default useFacilitatorGuide;`,
  ],
  [
    "@/features/courses/facilitator/useFacilitatorSummary",
    `export function useFacilitatorSummary(groupId) {
       if (groupId) ${asked}.summary.push(groupId);
       return { data: ${ui}.summaries[groupId] ?? null, error: null, loading: false };
     }
     export default useFacilitatorSummary;`,
  ],
  ["@/features/courses/useMyRuns", `export function useMyRuns() { return ${ui}.myRuns; }\nexport default useMyRuns;`],
  ["./useSyncTasks", "export const SyncTasksTrigger = () => null;"],
  ["@/features/tasks/components/MyWorkSummary", nothing("MyWorkSummary")],
  ["@/features/courses/weekOne/OnItsWay", nothing("OnItsWay")],
  ["@/features/surveys/cards/SurveyCards", nothing("SurveyCards")],
  ["@/features/admin/usePendingCount", "export function usePendingCount() { return 0; }"],
  [
    "@/features/maintenance/useSiteNotice",
    "export function useSiteNoticeState() { return { notice: { bannerVisible: false }, connection: 'loading' }; }",
  ],
  ["@/features/newsletter/useDrafts", "export function useDrafts() { return { drafts: [] }; }"],
  ["@/features/tasks/hooks/useTasks", "export function useTasks() { return { tasks: [] }; }"],
]);
const { world, call, reset, routes, summary, loadTs } = w;
const DASH = join("app", "(app)", "dashboard");
const HomeFacilitator = (await loadTs(join(DASH, "HomeFacilitator.tsx"))).default;
const HomeMember = (await loadTs(join(DASH, "HomeMember.tsx"))).default;
const HomeAdmin = (await loadTs(join(DASH, "HomeAdmin.tsx"))).default;
const homeGroups = await loadTs(join("lib", "courses", "homeGroups.ts"));
const runOverviewsModule = await loadTs(join("features", "courses", "useRunOverviews.ts"));
const state = world.ui;

/** The second course's run: Technical AI Safety, Group T. */
const TAIS_RUN = "tais-autumn-2026";
const TAIS_COURSE = "technical-ai-safety";
const TAIS_GROUP = "tais-autumn-2026__grp00001";

let AGI_COURSE = "";
let agiOverview = null;

/** The overview route's answer for `who` on AGI Strategy's run. */
async function overviewFor(who) {
  const answer = await call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body;
}

/**
 * The second course's overview: Group B's own answer, as another run of
 * another course, its next session moved to `next` (a date key and a start)
 * or to none.
 */
function taisOverview(next) {
  const base = structuredClone(agiOverview);
  const group = structuredClone(base.groups.find((each) => each.id === B));
  group.id = TAIS_GROUP;
  group.name = "Group T";
  group.facilitatorNames = [];
  if (next === null) {
    group.calendar.nextSession = null;
  } else {
    group.calendar.nextSession = {
      ...group.calendar.nextSession,
      dateKey: next.dateKey,
      startTimeLocal: next.start,
      weekNumber: 2,
      weekNumbers: [2],
      sessionKey: "w02",
      location: "Monica Partridge E02",
      meetingUrl: null,
      explainer: null,
    };
    group.calendar.firstSessionDate = "2026-11-10";
  }
  return {
    ...base,
    run: { ...base.run, id: TAIS_RUN, courseId: TAIS_COURSE, courseTitle: "Technical AI Safety" },
    programme: { name: "Technical AI Safety", kind: "fellowship", leadFirstName: "Tess" },
    weeks: [],
    groups: [group],
  };
}

/** A hub entry as `/api/courses/me` gives it for a run somebody facilitates on. */
function entry(runId, courseId, courseTitle, groupIds, over = {}) {
  return {
    runId,
    courseId,
    courseTitle,
    label: "Autumn 2026",
    academicYear: "2026-27",
    status: "running",
    roles: ["facilitator"],
    membership: "enrolled",
    archived: false,
    currentWeek: null,
    totalWeeks: 6,
    pacedByGroup: false,
    groupName: null,
    finished: false,
    shownCrest: null,
    facilitates: groupIds.map((groupId) => ({ groupId, name: "", slot: "", room: "" })),
    ...over,
  };
}

const agiEntry = (groupIds = [B], over = {}) => entry(RUN.agi, AGI_COURSE, "AGI Strategy Fellowship", groupIds, over);
const taisEntry = (over = {}) => entry(TAIS_RUN, TAIS_COURSE, "Technical AI Safety", [TAIS_GROUP], over);

/** Start again, with Rahul's real answers for Group B handed to the hooks. */
async function fresh(who = "rahul") {
  reset();
  state.asked = { overview: [], overviews: [], guide: [], summary: [] };
  state.failed = [];
  state.unsettled = false;
  agiOverview = await overviewFor(who);
  AGI_COURSE = agiOverview.run.courseId;
  const answered = await summary(who, B);
  assert.equal(answered.status, 200, JSON.stringify(answered.body));
  state.overviews = { [RUN.agi]: agiOverview };
  state.summaries = { [B]: answered.body };
  state.guides = { [AGI_COURSE]: { kind: "loaded", weeks: [3] }, [TAIS_COURSE]: { kind: "loaded", weeks: [2] } };
  state.myRuns = { runs: [], loading: false, error: null };
}

/** "See them all", to My programmes. */
const SEE_THEM_ALL_LINK = /<a href="\/learn"[^>]*>See them all(?:<svg[\s\S]*?<\/svg>)?<\/a>/;

const guideHref = (courseId, week) => `/learn/facilitator-guide/${courseId}${week ? `/week-${week}` : ""}`;

/** The facilitator's Home, drawn. */
function home(first, others) {
  const props = { given: "Rahul", invite: null, entry: first, comingUp: null, more: null };
  const html = renderToStaticMarkup(createElement(HomeFacilitator, others === undefined ? props : { ...props, others }));
  return { html, text: textOf(html) };
}

/** The admin's Home, drawn with `runs` as the hub's answer. */
function adminHome(runs) {
  state.myRuns = { runs, loading: false, error: null };
  const html = renderToStaticMarkup(
    createElement(HomeAdmin, {
      given: "Zach",
      invite: null,
      greeting: "Afternoon",
      applicationsInHand: false,
      decisionsBy: null,
      weekRange: "",
      weekEvents: [],
      weekStartsAt: NOW.toISOString(),
      weekEndsAt: NOW.toISOString(),
      applications: null,
    }),
  );
  return { html, text: textOf(html) };
}

// ---------------------------------------------------------------------------
// 1. The pick, pure
// ---------------------------------------------------------------------------

describe("the pick", () => {
  const group = (id, dateKey, start) => ({
    id,
    calendar: { nextSession: dateKey ? { dateKey, startTimeLocal: start } : null },
  });

  test("the group that meets next of every run's groups comes first; a tie and no session ahead keep the runs' order", () => {
    const ordered = homeGroups.byMeetingNext([
      { run: "first", groups: [group("a1", "2026-11-19", "18:00"), group("a2", null)] },
      { run: "second", groups: [group("b1", "2026-11-17", "15:00"), group("b2", "2026-11-19", "18:00"), group("b3", null)] },
    ]);
    assert.deepEqual(
      ordered.map((item) => `${item.run}:${item.group.id}`),
      ["second:b1", "first:a1", "second:b2", "first:a2", "second:b3"],
    );
  });

  test("one run is ordered as Home always ordered it: by when each group meets next, ties in the overview's order", () => {
    const groups = [group("x", null), group("y", "2026-11-18", "13:00"), group("z", "2026-11-17", "18:00"), group("w", "2026-11-17", "18:00")];
    assert.deepEqual(
      homeGroups.byMeetingNext([{ run: "only", groups }]).map((item) => item.group.id),
      ["z", "w", "y", "x"],
    );
  });

  test("only the groups somebody facilitates, when the run says which; every group when it does not", () => {
    const groups = [group("mine", null), group("my-place", null)];
    assert.deepEqual(homeGroups.facilitatedOf(groups, [{ groupId: "mine" }]).map((each) => each.id), ["mine"]);
    assert.deepEqual(homeGroups.facilitatedOf(groups, undefined).map((each) => each.id), ["mine", "my-place"]);
    assert.deepEqual(homeGroups.facilitatedOf(groups, []).map((each) => each.id), ["mine", "my-place"]);
  });

  test("the words", () => {
    assert.equal(homeGroups.facilitateGroupsWords(2), "You facilitate 2 groups. This is the one that meets next.");
    assert.equal(homeGroups.facilitateGroupsWords(3, false), "You facilitate 3 groups.");
    assert.equal(homeGroups.otherGroupsTitle(1), "Your other group");
    assert.equal(homeGroups.otherGroupsTitle(2), "Your other groups");
    assert.equal(homeGroups.groupAndCourseWords("Group B", "Technical AI Safety"), "Group B · Technical AI Safety");
    assert.equal(homeGroups.nextMeetingWords("2026-11-12", "17:00", "Monica Partridge E02"), "Thu 12 Nov, 5pm · Monica Partridge E02");
    assert.equal(homeGroups.nextMeetingWords("2026-11-12", "17:00", null), "Thu 12 Nov, 5pm");
    assert.equal(homeGroups.adminCardEyebrow("Group C"), "You facilitate Group C");
    assert.equal(homeGroups.roomAndExpectedWords("Portland A21", 7), "Portland A21 · 7 expected");
    assert.equal(homeGroups.roomAndExpectedWords(null, 0), "");
    assert.equal(homeGroups.SEE_THEM_ALL, "See them all");
    assert.equal(homeGroups.MY_PROGRAMMES_PATH, "/learn");
    const said = [
      homeGroups.facilitateGroupsWords(3),
      homeGroups.otherGroupsTitle(2),
      homeGroups.groupAndCourseWords("A", "B"),
      homeGroups.nextMeetingWords("2026-11-12", "17:00", "Room"),
      homeGroups.adminCardEyebrow(""),
      homeGroups.roomAndExpectedWords("Room", 2),
      homeGroups.SEE_THEM_ALL,
    ];
    assert.equal(homeGroups.adminCardEyebrow(""), "You facilitate a group with no name");
    assert.equal(homeGroups.NOT_ALL_LOADED, "We couldn’t load all your groups just now.");
    assert.equal(
      homeGroups.takingPartInWords(" AGI Strategy "),
      "You’re taking part in AGI Strategy too: your own week, with its readings and questions, is on its programme’s page.",
    );
    said.push(homeGroups.NOT_ALL_LOADED, homeGroups.takingPartInWords("AGI Strategy"), homeGroups.takingPartInWords(""));
    // The other groups' one guide link: the week when loaded, else the guide's own page, never a sentence.
    const loaded = { kind: "loaded", weeks: [2] };
    assert.deepEqual(homeGroups.oneGuideLink(loaded, "c1", 2), { href: "/learn/facilitator-guide/c1/week-2", label: "Facilitator guide for week 2" });
    // CHANGED ON PURPOSE: a guide with nothing loaded is no longer linked, as the session card's rule never links it.
    assert.equal(homeGroups.oneGuideLink({ kind: "empty" }, "c1", 2), null);
    for (const [read, week] of [[loaded, 3], [loaded, null], [{ kind: "failed" }, 2]]) {
      assert.deepEqual(homeGroups.oneGuideLink(read, "c1", week), { href: "/learn/facilitator-guide/c1", label: "Facilitator guide" }, JSON.stringify([read, week]));
    }
    assert.equal(homeGroups.oneGuideLink(loaded, "", 2), null);
    for (const line of said) assert.ok(!/[\u2013\u2014]/.test(line) && !/collat/i.test(line), line);
  });
});

// ---------------------------------------------------------------------------
// 2. Two courses on Home
// ---------------------------------------------------------------------------

describe("two courses on Home", () => {
  beforeEach(() => fresh());

  test("the nearer session on the second course is the one shown, and the count is all of them", () => {
    // Group T meets at 3pm today; Group B at 6pm.
    state.overviews[TAIS_RUN] = taisOverview({ dateKey: "2026-11-17", start: "15:00" });
    state.summaries[TAIS_GROUP] = { ...state.summaries[B], expected: 5, coFacilitators: [] };
    const { html, text } = home(agiEntry(), [taisEntry()]);
    assert.ok(text.includes("You facilitate 2 groups. This is the one that meets next."), text);
    assert.ok(text.indexOf("You facilitate 2 groups") < text.indexOf("Group T, 3pm"), "the sentence leads");
    assert.ok(text.includes("Group T · Technical AI Safety"), "the head line names the course shown");
    assert.ok(html.includes(`href="/learn/${TAIS_RUN}/group/${TAIS_GROUP}/register"`), "the register is Group T's");
    assert.ok(text.includes("5 expected"), "the summary is Group T's");
    // This week's guide is Group T's course's, with its title under the link.
    assert.ok(html.includes(`href="${guideHref(TAIS_COURSE, 2)}"`), html);
    // The other group: its course, when it meets next, its page, its own course's guide.
    const other = text.slice(text.indexOf("Your other group"));
    assert.ok(other.startsWith("Your other group Group B · AGI Strategy Fellowship"), other);
    assert.ok(other.includes("Tue 17 Nov, 6pm · Hallward B12"), other);
    assert.ok(other.includes("Open Group B"), other);
    assert.ok(html.includes(`href="/learn/${RUN.agi}/group/${B}"`));
    assert.ok(html.includes(`href="${guideHref(AGI_COURSE, 3)}"`), "Group B's own week of its own guide");
    assert.ok(other.includes("Facilitator guide for week 3 , AGI Strategy Fellowship"), other);
    // One guide link for the other group: no second link to the guide's own page, and no sentence.
    assert.ok(!other.includes("Facilitator guide , AGI Strategy Fellowship"), other);
    assert.equal(html.split(`href="${guideHref(AGI_COURSE)}"`).length - 1, 0, "the other group has its week's link only");
    assert.ok(SEE_THEM_ALL_LINK.test(html), "See them all goes to My programmes");
    // What was asked: each run's overview once, Group T's summary, each course's guide once.
    // Across runs every overview is read with its limit, the first run's too, and nothing is asked twice.
    assert.deepEqual(state.asked.overview, []);
    assert.deepEqual(state.asked.overviews, [RUN.agi, TAIS_RUN]);
    assert.deepEqual(state.asked.summary, [TAIS_GROUP]);
    assert.deepEqual([...state.asked.guide].sort(), [AGI_COURSE, TAIS_COURSE].sort());
  });

  test("the nearer session on the first course is shown, and the second course's group is the other", () => {
    state.overviews[TAIS_RUN] = taisOverview({ dateKey: "2026-11-19", start: "17:00" });
    const { text } = home(agiEntry(), [taisEntry()]);
    assert.ok(text.includes("Group B, 6pm"), text);
    const other = text.slice(text.indexOf("Your other group"));
    assert.ok(other.includes("Group T · Technical AI Safety"), other);
    assert.ok(other.includes("Thu 19 Nov, 5pm · Monica Partridge E02"), other);
    assert.ok(other.includes("Open Group T"), other);
    assert.ok(other.includes("Facilitator guide for week 2 , Technical AI Safety"), other);
    assert.deepEqual(state.asked.summary, [B]);
  });

  test("a course with no dates yet: the other course's group is shown, and the dateless group is listed without a date", () => {
    state.overviews[TAIS_RUN] = taisOverview(null);
    const { text } = home(taisEntry(), [agiEntry()]);
    assert.ok(text.includes("Group B, 6pm"), "the group with a session ahead is shown, though its run is second");
    const other = text.slice(text.indexOf("Your other group"));
    assert.ok(other.startsWith("Your other group Group T · Technical AI Safety Open Group T"), other);
    // No week to point at: the guide's own page, by the rule.
    assert.ok(other.includes("Facilitator guide , Technical AI Safety"), other);
  });

  test("a run that is completed is not live: never read, and Home is about one run as before", () => {
    state.overviews[TAIS_RUN] = taisOverview({ dateKey: "2026-11-17", start: "15:00" });
    state.myRuns = { runs: [agiEntry(), taisEntry({ status: "completed" })], loading: false, error: null };
    const html = renderToStaticMarkup(
      createElement(HomeMember, {
        given: "Rahul",
        invite: null,
        termCard: null,
        comingUpRows: null,
        comingUpCards: null,
        applications: null,
        nothingYet: null,
        holdsNoPlace: false,
        beforeGroups: [],
        surveys: [],
        finishProfile: null,
      }),
    );
    const text = textOf(html);
    assert.ok(text.includes("Group B, 6pm"), text);
    assert.ok(!text.includes("Your other group") && !text.includes("You facilitate 2 groups"), text);
    assert.deepEqual(state.asked.overviews, [], "no other run is asked for");
    assert.deepEqual(state.asked.overview, [RUN.agi]);
  });

  test("two live runs from the hub: Home is handed the second, and the list of other programmes leaves both out", () => {
    state.overviews[TAIS_RUN] = taisOverview({ dateKey: "2026-11-19", start: "17:00" });
    state.myRuns = { runs: [agiEntry(), taisEntry(), agiEntry([], { runId: "learning-run", roles: ["learner"], courseTitle: "Governance" })], loading: false, error: null };
    const text = textOf(
      renderToStaticMarkup(
        createElement(HomeMember, {
          given: "Rahul",
          invite: null,
          termCard: null,
          comingUpRows: null,
          comingUpCards: null,
          applications: null,
          nothingYet: null,
          holdsNoPlace: false,
          beforeGroups: [],
          surveys: [],
          finishProfile: null,
        }),
      ),
    );
    assert.deepEqual(state.asked.overviews, [RUN.agi, TAIS_RUN]);
    assert.ok(text.includes("Your other group Group T"), text);
    const programmes = text.slice(text.indexOf("Your other programmes"));
    assert.ok(programmes.includes("Governance"), programmes);
    assert.ok(!programmes.includes("Technical AI Safety"), "a run whose group is on the card is not listed again");
  });

  test("a second run that could not be read is never dropped without a word: it still counts, and See them all stays", () => {
    // No overview for the second run: failed, refused or past its limit.
    const { html, text } = home(agiEntry(), [taisEntry()]);
    assert.ok(text.includes("Group B, 6pm"), text);
    assert.ok(text.includes("You facilitate 2 groups."), "the count is the hub's list, not what answered");
    // The run that did not answer might meet sooner: only the count is said.
    assert.ok(!text.includes("meets next"), text);
    assert.ok(!text.includes("Your other group"), "nothing is listed for a run that did not answer");
    assert.ok(text.includes("We couldn’t load all your groups just now."), text);
    assert.ok(SEE_THEM_ALL_LINK.test(html), "the way to every group stays");
    assert.ok(!text.includes("We couldn’t load your group just now"), text);
  });

  test("while the runs answer, nothing is said under the greeting, so it never names one course and then another", () => {
    state.overviews[TAIS_RUN] = taisOverview({ dateKey: "2026-11-17", start: "15:00" });
    state.unsettled = true;
    const waiting = home(agiEntry(), [taisEntry()]);
    assert.ok(!waiting.text.includes("AGI Strategy Fellowship") && !waiting.text.includes("Technical AI Safety"), waiting.text);
    assert.ok(waiting.text.startsWith("Hi Rahul."), waiting.text);
    assert.deepEqual(state.asked.summary, [], "no group is asked about before the one to show is known");
    state.unsettled = false;
    assert.ok(home(agiEntry(), [taisEntry()]).text.includes("Group T · Technical AI Safety"));
  });

  test("a facilitator who takes part has one press to their own week, whichever group is shown", () => {
    // Takes part in AGI Strategy and facilitates there and on Technical AI Safety, whose group meets first.
    state.overviews[TAIS_RUN] = taisOverview({ dateKey: "2026-11-17", start: "15:00" });
    const { html, text } = home(agiEntry([B], { roles: ["learner", "facilitator"] }), [taisEntry()]);
    assert.ok(text.includes("Group T, 3pm"), "the other course's group is shown");
    assert.ok(
      text.includes("You’re taking part in AGI Strategy Fellowship too: your own week, with its readings and questions, is on its programme’s page. Open your programme"),
      text,
    );
    assert.ok(html.includes(`<a href="/learn/${RUN.agi}" class="inlineLink">Open your programme</a>`), html);
    assert.ok(!text.includes("taking part in Technical AI Safety"), "no line for a course they only facilitate");
    // Taking part in both: a line for each.
    const both = home(agiEntry([B], { roles: ["learner", "facilitator"] }), [taisEntry({ roles: ["learner", "facilitator"] })]);
    assert.ok(both.html.includes(`href="/learn/${RUN.agi}" class="inlineLink"`) && both.html.includes(`href="/learn/${TAIS_RUN}" class="inlineLink"`), both.html);
  });

  test("the course's title sits under a guide link, never over it", () => {
    const css = readFileSync(join(SRC, "app", "(app)", "dashboard", "home.module.css"), "utf8");
    const rule = css.slice(css.indexOf(".guideCourse {"), css.indexOf("}", css.indexOf(".guideCourse {")));
    assert.match(rule, /pointer-events: none;/);
    assert.ok(!/margin-top:\s*calc\(-/.test(rule), rule);
  });

  test("neither run could be read: the one sentence Home always had, no count over it, and the way to every group", () => {
    state.overviews = {};
    state.failed = [RUN.agi];
    const { html, text } = home(agiEntry(), [taisEntry()]);
    assert.ok(text.includes("We couldn’t load your group just now. Open AGI Strategy Fellowship"), text);
    assert.ok(!text.includes("You facilitate") && !text.includes("meets next"), text);
    assert.ok(SEE_THEM_ALL_LINK.test(html), "See them all is on the card that says none could be read");
    // One run that could not be read: exactly as before, with no See them all.
    const one = home(agiEntry());
    assert.ok(one.text.includes("We couldn’t load your group just now.") && !SEE_THEM_ALL_LINK.test(one.html), one.text);
  });

  test("an other group whose guide has nothing loaded has the way to its group alone", () => {
    state.overviews[TAIS_RUN] = taisOverview({ dateKey: "2026-11-19", start: "17:00" });
    state.guides[TAIS_COURSE] = { kind: "empty" };
    const { html, text } = home(agiEntry(), [taisEntry()]);
    const other = text.slice(text.indexOf("Your other group"));
    assert.ok(other.includes("Open Group T"), other);
    // No link anywhere into that course's guide: neither its page nor a week of it.
    assert.ok(!html.includes(`/learn/facilitator-guide/${TAIS_COURSE}`), html);
    // The shown group's own guide is unaffected.
    assert.ok(html.includes(`href="${guideHref(AGI_COURSE, 3)}"`), html);
  });
});

describe("a run that hangs", () => {
  const { overviewOf, OVERVIEW_LIMIT_MS } = runOverviewsModule;

  test("each run's overview has about eight seconds, then counts as failed and its request is stopped", async (t) => {
    assert.equal(OVERVIEW_LIMIT_MS, 8_000);
    let stopped = false;
    t.mock.method(globalThis, "fetch", (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          stopped = true;
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      }),
    );
    assert.equal(await overviewOf(RUN.agi, 20), null);
    assert.ok(stopped, "the request is stopped at the limit");
  });

  test("a run that answers in time is read as useRunOverview reads it, and its limit is let go", async (t) => {
    t.mock.method(globalThis, "fetch", async (url) => ({
      ok: true,
      json: async () => ({ run: { id: String(url) }, group: { id: "g" } }),
    }));
    const answered = await overviewOf(RUN.agi, 20);
    assert.equal(answered.run.id, `/api/courses/runs/${RUN.agi}/overview`);
    assert.deepEqual(answered.groups, [{ id: "g" }], "an answer with no groups list reads its one group");
    t.mock.method(globalThis, "fetch", async () => ({ ok: false, json: async () => ({ error: "Forbidden" }) }));
    assert.equal(await overviewOf(RUN.agi, 20), null, "a refusal counts as failed");
  });
});

// ---------------------------------------------------------------------------
// 3. One run
// ---------------------------------------------------------------------------

describe("one run", () => {
  test("one group: the same Home whether or not it is handed an empty list, and nothing more asked", async () => {
    await fresh();
    const without = home(agiEntry());
    const asked = structuredClone(state.asked);
    state.asked = { overview: [], overviews: [], guide: [], summary: [] };
    const withEmpty = home(agiEntry(), []);
    assert.equal(withEmpty.html, without.html);
    assert.deepEqual(state.asked, asked);
    assert.deepEqual(asked, { overview: [RUN.agi], overviews: [], guide: [AGI_COURSE], summary: [B] });
    assert.ok(!without.text.includes("You facilitate") && !without.text.includes("Your other group"), without.text);
  });

  test("two groups on one run keep their line in its place, and See them all now goes to My programmes", async () => {
    await fresh("sofia");
    const { html, text } = home(agiEntry([A, B]));
    assert.ok(text.includes("You facilitate 2 groups. This is the one that meets next. See them all"), text);
    assert.ok(SEE_THEM_ALL_LINK.test(html), html);
    assert.ok(!text.includes("Your other group"), text);
    assert.deepEqual(state.asked.overviews, []);
  });
});

// ---------------------------------------------------------------------------
// 4. An admin who facilitates
// ---------------------------------------------------------------------------

describe("an admin who facilitates", () => {
  beforeEach(() => fresh());

  test("with a group: their group's card first, as the facilitator's Home would say it", () => {
    const { html, text } = adminHome([agiEntry()]);
    assert.ok(text.indexOf("You facilitate Group B") < text.indexOf("To do"), "the card leads the admin's Home");
    assert.ok(text.includes("You facilitate Group B Tue 17 Nov, 6pm Hallward B12 · 3 expected Take the register Open Group B"), text);
    assert.ok(html.includes(`href="/learn/${RUN.agi}/group/${B}/register"`));
    assert.ok(html.includes(`href="${guideHref(AGI_COURSE, 3)}"`) && html.includes(`href="${guideHref(AGI_COURSE)}"`), html);
    assert.ok(text.includes("Facilitator guide for week 3 Facilitator guide"), text);
    assert.ok(!text.includes("You facilitate 2 groups"), text);
    // The admin's card reads every run with its limit.
    assert.deepEqual(state.asked, { overview: [], overviews: [RUN.agi], guide: [AGI_COURSE], summary: [B] });
    // "Open Group B" wraps, as every other "Open Group" link on Home does.
    assert.ok(html.includes(`<div class="groupLinkWraps"><a href="/learn/${RUN.agi}/group/${B}" class="textLink">Open Group B`), html);
  });

  test("while its runs answer, the card's place is held, so To do does not jump", () => {
    state.unsettled = true;
    const { html, text } = adminHome([agiEntry()]);
    assert.ok(!text.includes("You facilitate"), text);
    const before = html.indexOf("home-todo");
    assert.ok(before > 0 && html.slice(0, before).includes("height:12rem"), html.slice(0, before));
  });

  test("a run that did not answer: the count is the hub's list, and See them all stays", () => {
    const { html, text } = adminHome([agiEntry(), taisEntry()]);
    assert.ok(text.includes("You facilitate Group B"), text);
    assert.ok(text.includes("You facilitate 2 groups. We couldn’t load all your groups just now. See them all"), text);
    assert.ok(!text.includes("meets next"), text);
    assert.ok(SEE_THEM_ALL_LINK.test(html));
  });

  test("with two, on two courses: the one that meets next, and the way to both", () => {
    state.overviews[TAIS_RUN] = taisOverview({ dateKey: "2026-11-17", start: "15:00" });
    state.summaries[TAIS_GROUP] = { ...state.summaries[B], expected: 5 };
    const { html, text } = adminHome([agiEntry(), taisEntry()]);
    assert.ok(text.includes("You facilitate Group T Tue 17 Nov, 3pm Monica Partridge E02 · 5 expected"), text);
    assert.ok(text.includes("You facilitate 2 groups. This is the one that meets next. See them all"), text);
    assert.ok(SEE_THEM_ALL_LINK.test(html));
    assert.ok(html.includes(`href="${guideHref(TAIS_COURSE, 2)}"`));
    assert.deepEqual(state.asked, { overview: [], overviews: [RUN.agi, TAIS_RUN], guide: [TAIS_COURSE], summary: [TAIS_GROUP] });
  });

  test("with none: nothing is asked and nothing is drawn, whatever else the hub lists", () => {
    for (const runs of [
      [],
      [agiEntry([], { roles: ["learner"] })],
      [agiEntry([], { roles: ["lead"], membership: "none" })],
      [agiEntry([B], { status: "completed" })],
      // The facilitator role from an older row, after the admin's only group was archived: no live group named.
      [agiEntry([], { roles: ["facilitator"] })],
      [agiEntry([], { roles: ["facilitator"], facilitates: undefined })],
    ]) {
      state.asked = { overview: [], overviews: [], guide: [], summary: [] };
      const { text } = adminHome(runs);
      assert.deepEqual(state.asked, { overview: [], overviews: [], guide: [], summary: [] }, JSON.stringify(runs.map((run) => run.roles)));
      assert.ok(!text.includes("You facilitate"), text);
      assert.ok(text.startsWith("Afternoon, Zach."), text);
      assert.ok(text.indexOf("To do") < text.indexOf("Site"), text);
    }
  });

  test("whether an admin facilitates is read off the list of runs the admin's Home already asks for, and nothing else", () => {
    const code = readFileSync(join(SRC, "app", "(app)", "dashboard", "HomeAdmin.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.match(code, /liveRunsOf\(myRuns\.runs\)\.filter\(\(entry\) => \(entry\.facilitates\?\.length \?\? 0\) > 0\)/);
    assert.match(code, /\{facilitating\.length > 0 && <HomeAdminFacilitating runs=\{facilitating\} \/>\}/);
    // The admin's Home asks the same three things it always asked, and no more.
    assert.deepEqual([...code.matchAll(/fetch\(\s*[`"]([^`"?]+)/g)].map((m) => m[1]).sort(), ["/api/admin/deliverability/sends", "/api/admin/scheduler"]);
  });
});
