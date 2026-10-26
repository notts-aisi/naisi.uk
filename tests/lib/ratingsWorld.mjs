/**
 * The ratings' world: AGI Strategy once its run is over, for the suites about
 * what a group's facilitators, the programme's lead and admins say about each
 * fellow at the end (src/lib/ratings/).
 *
 * Built on `tests/lib/surveyWorld.mjs` (the term after decision day, AGI
 * Strategy naming its run with Claudia as its lead, the run's six weeks from
 * Thu 29 Oct and its three groups). The run's last session is Group C's on
 * Wed 9 Dec at 1pm. On top of that, FACILITATORS ARE FELLOWS (Zach, 26 Oct):
 *
 *  - GROUP B (Tuesdays, run by Rahul and Sofia together): Amara, and Rahul
 *    and Sofia themselves, who hold places in the group they run.
 *  - GROUP A (Thursdays, run by Sofia): Bea and Dev.
 *  - GROUP C (Wednesdays, run by Tom, who holds no place): Tariq.
 *
 * Every register is finished, a mark for each fellow each week: Amara came
 * to all six, Rahul to five, Sofia to six, Bea to four, Dev to two and Tariq
 * to three. Everybody was told their group by Publish.
 *
 * THE CLOCK is a suite's to set with `mock.timers` (Date only): `AFTER` is
 * the day after the last session, `DURING` a day in week 4. Every address is
 * `example.com`.
 */
import { join } from "node:path";
import { A, AGI, B, C, ROUND, RUN, formPath, makeSurveyWorld, seat, surveySeed } from "./surveyWorld.mjs";

export { A, AGI, B, C, ROUND, RUN, formPath };

/** Thu 10 Dec 2026, noon: the day after the run's last session. */
export const AFTER = new Date("2026-12-10T12:00:00Z");
/** Fri 20 Nov 2026, noon: week 4, the run still going. */
export const DURING = new Date("2026-11-20T12:00:00Z");

/** Who came to how many of six, by group. */
const CAME = {
  [B]: { amara: 6, rahul: 5, sofia: 6 },
  [A]: { bea: 4, dev: 2 },
  [C]: { tariq: 3 },
};

/** A finished register, a mark for each fellow: present for the first `came` weeks, absent after. */
function register(groupId, week) {
  const records = {};
  for (const [uid, came] of Object.entries(CAME[groupId])) records[uid] = week <= came ? "present" : "absent";
  return {
    runId: RUN.agi,
    groupId,
    weekNumber: week,
    occurrence: 1,
    records,
    held: true,
    pushedAt: new Date("2026-12-09T20:00:00Z"),
    pushedByUid: "sofia",
    participantNotes: {},
    notes: "",
    markedByUid: "sofia",
    updatedAt: new Date("2026-12-09T20:00:00Z"),
  };
}

/** The world every ratings suite starts from. `over` adds or replaces whole documents. */
export function ratingsSeed(over = {}) {
  const seed = surveySeed();
  seed[`courseEnrolments/${RUN.agi}__rahul`] = seat("rahul", B);
  seed[`courseEnrolments/${RUN.agi}__sofia`] = seat("sofia", B);
  seed[`courseEnrolments/${RUN.agi}__dev`] = seat("dev", A);
  seed[`courseEnrolments/${RUN.agi}__tariq`] = seat("tariq", C);
  for (const groupId of [A, B, C]) {
    for (let week = 1; week <= 6; week += 1) {
      seed[`courseAttendance/${RUN.agi}__${groupId}__w0${week}`] = register(groupId, week);
    }
  }
  return { ...seed, ...over };
}

/**
 * The world, with the ratings' route and pages loaded beside the survey
 * world's. The admissions pages' gate is the session's account, as the
 * hand-over suites stub it: the page's own gate below it is what is tested.
 */
export async function makeRatingsWorld(key = "__ratings", extraStubs = []) {
  const handle = `globalThis[${JSON.stringify(key)}]`;
  const w = await makeSurveyWorld(key, [
    ["@/lib/firebase/pageGates", `export async function requireAdmissionsPage() { return ${handle}.user; }`],
    ...extraStubs,
  ]);
  const route = await w.loadTs(join("app", "api", "courses", "groups", "[groupId]", "ratings", "route.ts"));
  const groupPage = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "group", "[groupId]", "ratings", "page.tsx"))).default;
  const programmePage = (
    await w.loadTs(join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "ratings", "page.tsx"))
  ).default;
  const model = await w.loadTs(join("lib", "ratings", "model.ts"));
  w.lib.ratingRules = await w.loadTs(join("lib", "ratings", "rules.ts"));
  const words = await w.loadTs(join("lib", "ratings", "words.ts"));

  /** One rating, posted as `who` about `uid` in `groupId`. */
  const rate = (who, groupId, uid, answers, options = {}) =>
    w.call(who, route.POST, { groupId }, { body: { uid, answers }, course: true, ...options });

  /** The stored rating `rater` gave `rated`, or undefined. */
  const stored = (rater, rated) => w.world.db.read(`programmeRatings/${RUN.agi}__${rater}__${rated}`);

  /**
   * A group's ratings page as `who`; a redirect is answered by where it went.
   * The learning space's gate pages its reads with `limit()`, so the page is
   * handed the course routes' view of the store.
   */
  async function groupView(who, groupId) {
    w.world.course = true;
    try {
      return await w.page(groupPage, { params: Promise.resolve({ runId: RUN.agi, groupId }) }, who);
    } finally {
      w.world.course = false;
    }
  }

  /** The programme's Ratings page as `who`. */
  const programmeView = (who, programmeId = AGI) =>
    w.page(programmePage, { params: Promise.resolve({ roundId: ROUND, programmeId }) }, who);

  return { ...w, route, groupPage, programmePage, model, words, rate, stored, groupView, programmeView };
}
