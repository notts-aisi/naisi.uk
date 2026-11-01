/**
 * A TERM JUST AFTER DECISION DAY, as fixture records, for the course hub's
 * browser specs.
 *
 * A helper module, not a spec: it exports no `SPEC`, and the spec modules
 * beside `core.mjs` build theirs from it (`course-hub-groups-go-out.mjs` is the
 * first). It lives in a subdirectory because the runner and the coverage map
 * read every `.mjs` beside `core.mjs` as a spec; `tests/funnel-harness-guards.test.mjs`
 * holds a helper to exporting no `SPEC`, to being imported by a spec module,
 * and to the same fence as everything else in the harness.
 *
 * ## What the term is, at its first point ("decisions-sent")
 *
 *  - AN APPLICATION FORM whose decisions have been sent, with one fellowship
 *    programme tied to the fixture's course page. The programme names NO run
 *    yet and has NO lead: naming the run and anybody's authority over it are
 *    the admin's to make on the real pages, never the fixture's.
 *  - THREE PEOPLE the programme accepted, each told (their application carries
 *    the published outcome), each having said they are coming, each having
 *    painted the week they are free: one can make Group A only, one either
 *    group, one Group B only.
 *  - ONE MORE ACCOUNT with no application at all, for the admin to approve and
 *    appoint as a facilitator.
 *  - THE COURSE SIDE: a published course, a DRAFT run of it taking people by
 *    admissions, starting a few days after the seed, and two groups with a
 *    weekly session each. Group A also has a meeting link, so a spec can prove
 *    that no email ever carries one.
 *
 * Every account is the fence's own: role `pending`, made by `createFixtureUser`.
 * The admin approves the ones a journey signs in as, on the Approvals page.
 *
 * ## Later points
 *
 * A spec asks for the term at a point (`TERM_POINTS`). The later ones a spec
 * will want (placed and published, after the last session) are added here by
 * the spec that first needs one, as more records written on top of this one,
 * and their teardown is this teardown, because every row they could add is
 * keyed on the same form, run and groups.
 *
 * ## The second point ("week-three")
 *
 * The same term, read three weeks after its run began: the clock is moved,
 * not the records. Everything decision day wrote is the first point's,
 * written as of the moment the first point describes (`anchor`, three days
 * before the run's first day), and on top of it what the weeks since would
 * have written:
 *
 *  - Publish has told everybody: each person's place in a group, stamped as
 *    told, and each on the run's cohort list, as Publish leaves them. Ada and
 *    Ben are in Group A, Cleo in Group B. The run is running.
 *  - The run's first three weeks are published, and the fourth is not.
 *  - The registers of the first three weeks (`WEEK_THREE.marks`): every one
 *    finished but Group B's week 3, which was saved and not finished, the day
 *    before the seed. Each person's attendance tally is the one the finishing
 *    press works out from them (`recomputeRollup`, restated).
 *  - One update from week 1, to everyone, posted without an email.
 *
 * What stays the admin's, on the real pages, as at the first point: approving
 * accounts, naming the run on the programme's Settings tab (and handing its
 * people over there, which writes the run's own list), and appointing Fern to
 * Group B. A route run now writes now's facts, which is why the places are
 * seeded rather than placed: the board stamps the week a person joins from
 * today, and a person who joined in week 3 has no week 1 or 2 on a register.
 *
 * Nothing a seeded record names as its author is an account: registers name
 * `REGISTER_RECORD_UID` as whoever marked and finished them, and the week 1
 * update `UPDATE_RECORD_UID` as its writer, so the pages name it for the
 * society, as they name an update whose writer's account is gone.
 *
 * ## The third point ("week-three-unmarked")
 *
 * The second point read on the same day, with one difference a facilitator's
 * week needs (`WEEK_THREE_UNMARKED`): Group A's week 3 register was never
 * opened, so its facilitator marks it from empty and finishes it, and every
 * other register of the first three weeks is finished. Group A is the group
 * with two people and the meeting link, so the marks are spread over two
 * people and an email to the group has a link it must never carry. The admin
 * appoints Fern to Group A on the real page, as at the second point.
 *
 * ## The coursework point ("coursework")
 *
 * The term three weeks in with its weeks written as blocks (`COURSEWORK`):
 * Ada and Ben in Group A and Cleo in Group B, told by Publish, and Dan, whom
 * the programme accepted and nobody has placed, holding a place in no group.
 * Weeks 1 to 3 are published, each with reflections, two sources and a
 * written answer; Ada, Cleo and Dan have written, ticked and sent what the
 * plan says. No register and no update. Fern is the account the admin
 * appoints to Group A.
 *
 * ## The fourth point ("pitching-week")
 *
 * An incubator in its pitching week (`PITCHING_WEEK`), read as the second
 * point reads its run, three weeks in, with its own cast: the form's one
 * programme is an INCUBATOR, whose run meets as one weekly group, and the
 * programme accepted five people, all placed in that group and told by
 * Publish. The run began `daysIn` days before the seed, so the seed's day is
 * early in week 3, and week 3 is the pitching week: published, ticked as one,
 * with two readings to pitch a paper from. The group's week 3 session is days
 * ahead, so pitching is open for the whole of a run, and its day is never the
 * seed's. The run's pitching settings are set as the run editor saves them
 * (how many pitches a person may pick, the smallest and largest team, and the
 * day the teams are made, the group's session the week after) and its teams
 * are made from the pitches. Weeks 1 and 2's registers are finished.
 *
 * Nobody has pitched, picked or made a team: those are the people's own
 * presses and the lead's, on the real pages. The admin still names the run on
 * the programme's Settings tab, as at every point; nobody facilitates, and
 * nobody leads the programme, so the pages say "The teams are made on" and
 * the team email is signed by nobody.
 *
 * ## The fifth point ("week-four")
 *
 * The fellowship in week 4, read as the second point reads its run, with a
 * cast of its own (`WEEK_FOUR`): Group A has three people (Ada, Ben and Dan),
 * so two of them can leave it while one stays, and Group B one (Cleo). Every
 * register of the first four weeks is finished, so whoever leaves has marks
 * that must stay theirs, and weeks 1 to 5 are published, so no week a group
 * has reached is waiting to be. Week 1 lists a reading, and Ben rated it,
 * commented on it and kept a note on it in week 1: what stays Ben's to read
 * once Ben leaves. Fern is the account the admin appoints to Group A.
 *
 * ## The sixth point ("after-the-end")
 *
 * A fellowship whose run's last session is over (`AFTER_THE_END`), so who
 * finished has opened and leaving has closed: one group, one person (Ivy)
 * placed in it and told by Publish, every register finished and every week
 * published. Nobody facilitates it and nobody leads it.
 *
 * ## The seventh point ("before-groups")
 *
 * The first point with the run's later weeks loaded (`BEFORE_GROUPS`):
 * decision day's records exactly as the first point writes them, at the
 * seed's own moment (the run a draft starting a few days later, nobody
 * placed, the programme naming no run), and weeks 2 to the last published as
 * an editor leaves them. Week 1 has no page at all: the programme's lead
 * writes it on the Weeks tab and marks it ready, which publishes it and opens
 * it to everybody holding a place before groups go out. The later weeks are
 * there so that a week a person holding a place may not open is a week that
 * exists and is published, not one that is missing.
 *
 * ## The eighth point ("first-day")
 *
 * The fellowship on its run's first day (`FIRST_DAY`): Publish told everybody
 * their group two days before, week 1 is published, and no group has met yet
 * (Group A meets the next day, Group B the day after), so whatever a person
 * sends now comes before their first session. No register exists and nothing
 * has been posted to the run. Its cast is the fifth point's: Ada, Ben and Dan
 * in Group A, Cleo in Group B, and Fern for the admin to appoint to Group A.
 * Every survey a spec makes here is the admin's, on the real pages; the
 * fixture writes none, and finds each one afterwards by the form it names.
 *
 * ## Two points at once
 *
 * A spec may need the term at two points in one run (the leaving spec reads
 * a run in week 4 and another past its last session). `seedTerms` seeds a
 * term for each, every one with its own form, course, run, groups and
 * accounts, so no record is shared; `countTerms` and `teardownTerms` add the
 * manifests up. The first term is keyed on the runner's run id, as every
 * single-point spec's is, and each later one on the run id and a letter of
 * its own, so a sweep by the run id finds every row of all of them.
 *
 * ## The end of a programme ("last-week", "programme-over")
 *
 * Two points a programme's end is read at, each with a cast of its own:
 *
 *  - "last-week" (`LAST_WEEK`): the fellowship in its last week, with one
 *    group whose sixth and last session is on the seed's own day, late in
 *    the evening, so a member's Home says it is tonight. Ada is in it, every
 *    register before it is finished, and Fern is the account the admin
 *    appoints to it. The survey at the end is the admin's to make and send on
 *    the real pages; the fixture writes none.
 *  - "programme-over" (`PROGRAMME_OVER`): the fellowship past its run's last
 *    session, every register finished, so who finished has opened. Ada and
 *    Dan are in Group A, Cleo and Eve in Group B, and Fern is the account the
 *    admin appoints to Group A. Dan left in week 3 (`left`), as leaving left
 *    them: their seat withdrawn with the day, their place on the form given
 *    back, off the cohort's list, and their marks from before kept. The rule
 *    for who finished, who the lead ticks, and every certificate are the
 *    admin's on the real pages; the fixture writes none of them.
 *
 * ## No term facts
 *
 * Every date is worked out from the moment the seed runs, in London: the run
 * starts `START_AFTER_DAYS` days later and each group meets on a weekday that
 * follows from that start. Nothing names a calendar date. The words a spec
 * checks dates and times against are restated below, from the files named
 * beside each, because this is plain Node and those are TypeScript.
 *
 * ## Mail
 *
 * Seeding writes a suppression row for every account first unless the runner
 * says this run's mail is caught (`suppress: false`). A spec on this term that
 * reads its own mail declares `requiresCaughtMail` and is skipped anywhere
 * else.
 */
import {
  assertFixtureTarget,
  cohortChannel,
  countAccounts,
  createFixtureUser,
  deleteQuery,
  enrolmentId,
  fixtureDoc,
  fixtureId,
  fixtureQuery,
  fixtureSubcollection,
  registerReminderMarkerDoc,
  subscriptionId,
} from "../core.mjs";
import {
  adminAuth,
  deleteHarnessUser,
  deleteHarnessUserDoc,
  isHarnessAccount,
} from "../../e2e/lib/admin.mjs";
import { loadSecrets } from "../../e2e/lib/env.mjs";

const log = (msg) => console.log(`[term-seed] ${msg}`);

/** The points in the term a spec can ask for, in term order. */
export const TERM_POINTS = Object.freeze([
  "decisions-sent",
  "before-groups",
  "first-day",
  "week-three",
  "week-three-unmarked",
  "coursework",
  "pitching-week",
  "week-four",
  "last-week",
  "after-the-end",
  "programme-over",
  "check-in",
]);

/** The form's one programme at the first three points. Fixed: a programme id is unique on its own form. */
export const PROGRAMME_ID = "e2e-fellowship";

/** The form's one question set and its one question. */
export const QUESTION_SET_ID = "fellowships";
export const QUESTION_ID = "why";

/** The form's one programme at the fourth point, an incubator, and its question set. */
export const INCUBATOR_PROGRAMME_ID = "e2e-incubator";
export const INCUBATOR_QUESTION_SET_ID = "incubators";

/**
 * A question set's own kind, which is NOT an account's role. Written through a
 * constant so the privilege fence's `role:` pattern never has to be widened
 * for it (see tests/funnel-harness-guards.test.mjs).
 */
const GENERAL_SET = "general";

/** How many days after the seed the run starts: its first session is upcoming. */
export const START_AFTER_DAYS = 3;

/** Taught weeks in the run's plan. */
export const WEEK_COUNT = 6;

/**
 * Every group's session length: a new group's default, `NEW_GROUP_SESSION_MINUTES`
 * in src/lib/courses/sessionLength.ts, restated.
 */
export const SESSION_MINUTES = 90;

/** Places in each group. More than anybody will put in one. */
export const GROUP_CAPACITY = 6;

/**
 * The two groups. Each meets `dayAfterStart` days after the run's first day,
 * so its weekday follows from the start and its first session is in week 1's
 * slot. Group A also has a meeting link: on the site for its own people and
 * its facilitators, never in an email.
 */
export const GROUP_PLAN = Object.freeze([
  Object.freeze({ key: "A", name: "Group A", dayAfterStart: 1, startTimeLocal: "18:00", room: "Room E1", online: true }),
  Object.freeze({ key: "B", name: "Group B", dayAfterStart: 2, startTimeLocal: "13:00", room: "Room E2", online: false }),
]);

/**
 * The people the programme accepted, and which groups the week they painted
 * fits. Their order is the order their accounts are made in.
 */
export const PEOPLE_PLAN = Object.freeze([
  Object.freeze({ key: "ada", first: "Ada", canMake: Object.freeze(["A"]) }),
  Object.freeze({ key: "ben", first: "Ben", canMake: Object.freeze(["A", "B"]) }),
  Object.freeze({ key: "cleo", first: "Cleo", canMake: Object.freeze(["B"]) }),
]);

/** The account with no application, for the admin to appoint as a facilitator. */
export const FACILITATOR_PLAN = Object.freeze({ key: "fern", first: "Fern" });

/**
 * Who a decision document says made each decision. A decision is read only
 * when it names somebody (`asProgrammeDecision` in
 * src/lib/applications/normalise.ts drops one that does not), and the name is
 * a record shown on the review screens, never an authority anything grants.
 * So it names an id no account has, rather than borrowing a real person's.
 */
export const DECISION_RECORD_UID = "e2e-decision-record";

/** The form's availability grid: 09:00 to 21:00 in quarter hours, as the sample term uses. */
export const GRID = Object.freeze({ version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 });

/**
 * THE TERM THREE WEEKS IN. Its run began `daysIn` days before the seed, so
 * the seed's day is in week 3 (days 14 to 20 of the plan), both groups'
 * week 3 sessions are over (Group A two days before, Group B the day before)
 * and their week 4 sessions are still to come. 17 rather than 15 or 16 so
 * that a run crossing midnight is still in week 3 with nothing today or
 * tomorrow, and so that Group B's unfinished register is a day old: past the
 * end of its session whatever the hour, and short of the hours the reminder
 * and the task wait by default.
 *
 * `places` are where Publish put each person; `marks` every register, by
 * group and week; `unfinished` the one register saved and not finished;
 * `facilitated` the group the admin appoints Fern to; `published` how many
 * weeks an editor has published.
 */
export const WEEK_THREE = Object.freeze({
  daysIn: 17,
  places: Object.freeze({ ada: "A", ben: "A", cleo: "B" }),
  marks: Object.freeze({
    A: Object.freeze({
      1: Object.freeze({ ada: "present", ben: "present" }),
      2: Object.freeze({ ada: "late", ben: "absent" }),
      3: Object.freeze({ ada: "present", ben: "absent" }),
    }),
    B: Object.freeze({
      1: Object.freeze({ cleo: "present" }),
      2: Object.freeze({ cleo: "left-early" }),
      3: Object.freeze({ cleo: "present" }),
    }),
  }),
  unfinished: Object.freeze({ group: "B", weekNumber: 3 }),
  facilitated: "B",
  published: 3,
});

/**
 * THE TERM THREE WEEKS IN, ONE REGISTER NOT YET MARKED: the same day of the
 * same run as `WEEK_THREE`, the same places and the same published weeks.
 * Group A's week 3 register was never opened (`unmarked`: no register at all,
 * so its facilitator marks it from empty), and every register that exists is
 * finished, so the one the facilitator finishes is the only one left. Fern is
 * appointed to Group A (`facilitated`), the group with two people and the
 * meeting link.
 */
export const WEEK_THREE_UNMARKED = Object.freeze({
  daysIn: WEEK_THREE.daysIn,
  places: WEEK_THREE.places,
  marks: Object.freeze({
    A: Object.freeze({
      1: Object.freeze({ ada: "present", ben: "present" }),
      2: Object.freeze({ ada: "late", ben: "absent" }),
    }),
    B: WEEK_THREE.marks.B,
  }),
  unfinished: null,
  unmarked: Object.freeze({ group: "A", weekNumber: 3 }),
  facilitated: "A",
  published: WEEK_THREE.published,
});

/** Weeks 1 and 2 of the incubator's group: everybody came. */
const ALL_FIVE_PRESENT = Object.freeze({ ada: "present", ben: "present", cleo: "present", dan: "present", eve: "present" });

/**
 * AN INCUBATOR IN ITS PITCHING WEEK, THREE WEEKS IN: the fourth point. Its
 * run began `daysIn` days before the seed, so the seed's day is in week 3
 * (days 14 to 20 of the plan), and its one group meets `dayAfterStart` days
 * into each week, so the group's week 3 session is two days after the seed.
 * So a run that crosses midnight is still in week 3, its pitching session is
 * still a day or more away (never "tonight’s", and pitching never closes
 * under it), and weeks 1 and 2's sessions are over.
 *
 * `programme` is the form's one programme, an incubator; `groups` the one
 * weekly group its run meets as (with a meeting link, so no email can be
 * shown to carry it); `people` the five it accepted, all placed in that group
 * (`places`); and nobody facilitates (`facilitator`). `marks` are weeks 1 and
 * 2's registers. `pitching` is what the run editor has saved: which week is
 * pitching week, the readings that week lists, how many pitches a person may
 * pick, the smallest and largest team, and that the teams are made from the
 * pitches. The day the teams are made is the group's session the week after
 * pitching week, worked out by the seed from its clock.
 */
export const PITCHING_WEEK = Object.freeze({
  daysIn: 15,
  programme: Object.freeze({
    id: INCUBATOR_PROGRAMME_ID,
    kind: "incubator",
    word: "incubator",
    questionSetId: INCUBATOR_QUESTION_SET_ID,
    questionSetLabel: "Incubators",
  }),
  groups: Object.freeze([
    Object.freeze({ key: "A", name: "Weekly session", dayAfterStart: 3, startTimeLocal: "17:00", room: "Room E3", online: true }),
  ]),
  people: Object.freeze([
    Object.freeze({ key: "ada", first: "Ada", canMake: Object.freeze(["A"]) }),
    Object.freeze({ key: "ben", first: "Ben", canMake: Object.freeze(["A"]) }),
    Object.freeze({ key: "cleo", first: "Cleo", canMake: Object.freeze(["A"]) }),
    Object.freeze({ key: "dan", first: "Dan", canMake: Object.freeze(["A"]) }),
    Object.freeze({ key: "eve", first: "Eve", canMake: Object.freeze(["A"]) }),
  ]),
  facilitator: null,
  places: Object.freeze({ ada: "A", ben: "A", cleo: "A", dan: "A", eve: "A" }),
  marks: Object.freeze({ A: Object.freeze({ 1: ALL_FIVE_PRESENT, 2: ALL_FIVE_PRESENT }) }),
  unfinished: null,
  published: 3,
  pitching: Object.freeze({
    weekNumber: 3,
    readings: Object.freeze([
      Object.freeze({ id: "e2e-reading-probes", title: "Probes that transfer" }),
      Object.freeze({ id: "e2e-reading-chess", title: "Board features in chess models" }),
    ]),
    pickLimit: 2,
    teamSize: Object.freeze({ min: 2, max: 3 }),
    teamsFrom: "pitches",
  }),
});

/** What a point after decision day is seeded from, or null for decision day itself. */
export function laterPlanOf(point) {
  if (point === "first-day") return FIRST_DAY;
  if (point === "week-three") return WEEK_THREE;
  if (point === "week-three-unmarked") return WEEK_THREE_UNMARKED;
  if (point === "pitching-week") return PITCHING_WEEK;
  if (point === "week-four") return WEEK_FOUR;
  if (point === "after-the-end") return AFTER_THE_END;
  if (point === "last-week") return LAST_WEEK;
  if (point === "programme-over") return PROGRAMME_OVER;
  if (point === "coursework") return COURSEWORK;
  if (point === "check-in") return CHECK_IN_DAY;
  return null;
}

/** The fellowship the first three points are about, as the form names it. */
const FELLOWSHIP = Object.freeze({
  id: PROGRAMME_ID,
  kind: "fellowship",
  word: "fellowship",
  questionSetId: QUESTION_SET_ID,
  questionSetLabel: "Fellowships",
});

/** The reading week 1 lists at the fifth point, and the one Ben wrote about. */
export const WEEK_ONE_READING = Object.freeze({ id: "e2e-reading-week-1", title: "The week 1 paper", minutes: 20 });

/**
 * THE FELLOWSHIP IN WEEK 4, EVERY REGISTER FINISHED: the fifth point. Its run
 * began `daysIn` days before the seed, so the seed's day is in week 4 (days
 * 21 to 27 of the plan): both groups' week 4 sessions are over (Group A two
 * days before, Group B the day before) and their week 5 sessions are days
 * ahead, so a run that crosses midnight is still in week 4 with nothing today
 * or tomorrow, and its last session is weeks away, so leaving is open.
 *
 * Its cast is the fellowship's with one more person in Group A (`people`),
 * so two of its three can leave it while one stays. `marks` are every
 * register of the first four weeks, all finished, chosen so that nobody has
 * missed two sessions in a row; `published` says weeks 1 to 5 are out, so no
 * week a group has reached waits to be. `readings` are what an editor listed
 * on a week, and `notes` what a person wrote on one in that week (a rating, a
 * comment for the run and a note for themselves), which their notes page
 * keeps once they leave. `facilitated` is the group the admin appoints Fern
 * to on the real page.
 */
export const WEEK_FOUR = Object.freeze({
  daysIn: 24,
  programme: FELLOWSHIP,
  groups: GROUP_PLAN,
  people: Object.freeze([...PEOPLE_PLAN, Object.freeze({ key: "dan", first: "Dan", canMake: Object.freeze(["A"]) })]),
  facilitator: FACILITATOR_PLAN,
  places: Object.freeze({ ada: "A", ben: "A", cleo: "B", dan: "A" }),
  marks: Object.freeze({
    A: Object.freeze({
      1: Object.freeze({ ada: "present", ben: "present", dan: "present" }),
      2: Object.freeze({ ada: "late", ben: "absent", dan: "present" }),
      3: Object.freeze({ ada: "present", ben: "present", dan: "excused" }),
      4: Object.freeze({ ada: "present", ben: "left-early", dan: "late" }),
    }),
    B: Object.freeze({
      1: Object.freeze({ cleo: "present" }),
      2: Object.freeze({ cleo: "present" }),
      3: Object.freeze({ cleo: "late" }),
      4: Object.freeze({ cleo: "present" }),
    }),
  }),
  unfinished: null,
  facilitated: "A",
  published: 5,
  readings: Object.freeze({ 1: Object.freeze([WEEK_ONE_READING]) }),
  notes: Object.freeze([
    Object.freeze({
      person: "ben",
      weekNumber: 1,
      itemId: WEEK_ONE_READING.id,
      rating: 4,
      comment: "Clearer than I expected.",
      note: "Reread the second half before the session.",
    }),
  ]),
});

/**
 * THE TERM THREE WEEKS IN, ITS WEEKS WRITTEN AS BLOCKS, WITH COURSEWORK DONE:
 * the coursework point. The same day of the same run as `WEEK_THREE`, with
 * one more person the programme accepted (Dan) who holds a place and was
 * never placed in a group, so the Coursework tab has somebody "Not in a
 * group yet" with week 1 work of their own. Weeks 1 to 3 are published and
 * written as blocks (`blockWeeks`, `courseworkWeekDoc`): a part asking for
 * two reflections, a part with two sources and a third reflection, and the
 * week's written answer. `coursework` is what the people wrote, ticked and
 * sent, each row as its route stores it: Ada's week 3 reflections, her tick
 * with a private note on it and her written answer, sent and waiting for
 * feedback; Cleo's week 3 reflection; Dan's week 1 reflections and tick.
 * No register exists and nothing has been posted. Fern is the account the
 * admin appoints to Group A.
 */
export const COURSEWORK = Object.freeze({
  daysIn: WEEK_THREE.daysIn,
  programme: FELLOWSHIP,
  groups: GROUP_PLAN,
  people: Object.freeze([...PEOPLE_PLAN, Object.freeze({ key: "dan", first: "Dan", canMake: Object.freeze(["A", "B"]) })]),
  facilitator: FACILITATOR_PLAN,
  places: Object.freeze({ ada: "A", ben: "A", cleo: "B" }),
  marks: Object.freeze({}),
  unfinished: null,
  facilitated: "A",
  published: 3,
  earlierUpdate: false,
  blockWeeks: true,
  coursework: Object.freeze({
    reflections: Object.freeze([
      Object.freeze({ person: "ada", weekNumber: 3, prompt: "rp1", text: "Three lamps along this coast, I think." }),
      Object.freeze({ person: "ada", weekNumber: 3, prompt: "rp2", text: "The harbour, since its boats use the light." }),
      Object.freeze({ person: "cleo", weekNumber: 3, prompt: "rp1", text: "None of them is lit by hand any more." }),
      Object.freeze({ person: "dan", weekNumber: 1, prompt: "rp1", text: "A keeper rows out at dusk to trim the wick." }),
      Object.freeze({ person: "dan", weekNumber: 1, prompt: "rp2", text: "Whoever owns the rocks the ships avoid." }),
    ]),
    ticks: Object.freeze([
      Object.freeze({ person: "ada", weekNumber: 3, source: "s1", note: "Skimmed the second half, worth a reread." }),
      Object.freeze({ person: "dan", weekNumber: 1, source: "s1", note: "" }),
    ]),
    answers: Object.freeze([
      Object.freeze({ person: "ada", weekNumber: 3, text: "The harbour board should keep the lamps lit, because it charges the ships that need them." }),
    ]),
  }),
});

/** The words a coursework week's blocks ask, by the key its ids end in. */
export const COURSEWORK_PROMPTS = Object.freeze({
  rp1: "How many lighthouses are still lit on this coast?",
  rp2: "Who should pay for the lamp oil?",
  rp3: "Where do the two keepers disagree?",
});

/** A coursework week's sources, by the key their ids end in. */
export const COURSEWORK_SOURCES = Object.freeze({
  s1: "A keeper's diary",
  s2: "Lamps at night",
});

/** A coursework week's written answer's question. */
export const COURSEWORK_ANSWER_PROMPT = "Who should keep the lamps lit, and why?";

/** The id of one item of a coursework week: `e2e-w3-rp1`. Ids differ from week to week, as an editor's do. */
export function courseworkItemId(weekNumber, key) {
  return `e2e-w${weekNumber}-${key}`;
}

/** Every one of the six weeks, for the one person at the sixth point: Ivy came to each. */
const IVY_CAME = Object.freeze({ ivy: "present" });

/**
 * A FELLOWSHIP PAST ITS LAST SESSION: the sixth point. Its run began `daysIn`
 * days before the seed, and its one group meets on the run's second day each
 * week, so the group's sixth and last session was nine days before the seed:
 * the run is over (`runEndOf(...).over`, the answer who finished and leaving
 * ask), and stays over across midnight. One person, Ivy, placed in that group
 * and told by Publish before the start, came to every session; every
 * register is finished and every week is published. Nobody facilitates, and
 * nobody leads the programme.
 */
export const AFTER_THE_END = Object.freeze({
  daysIn: 45,
  programme: FELLOWSHIP,
  groups: Object.freeze([GROUP_PLAN[0]]),
  people: Object.freeze([Object.freeze({ key: "ivy", first: "Ivy", canMake: Object.freeze(["A"]) })]),
  facilitator: null,
  places: Object.freeze({ ivy: "A" }),
  marks: Object.freeze({
    A: Object.freeze({ 1: IVY_CAME, 2: IVY_CAME, 3: IVY_CAME, 4: IVY_CAME, 5: IVY_CAME, 6: IVY_CAME }),
  }),
  unfinished: null,
  published: 6,
});

/**
 * THE TERM BEFORE GROUPS GO OUT, ITS LATER WEEKS LOADED: the seventh point.
 * Decision day's records as the first point writes them, and the run's weeks
 * from `firstPublished` to the last published as an editor leaves them, a
 * day before the seed. Week 1 has no page: its lead's first save on the
 * Weeks tab makes it, and marking it ready publishes it.
 */
export const BEFORE_GROUPS = Object.freeze({ firstPublished: 2 });

/**
 * THE FELLOWSHIP ON ITS RUN'S FIRST DAY, ITS GROUPS OUT: the eighth point.
 * Its run begins on the seed's own day (`daysIn` 0), Publish told everybody
 * their group before it (as at every later point), and each group's first
 * session is still to come: Group A's the next day, Group B's the day after.
 * So a run that crosses midnight is still in week 1 with nobody's group met,
 * and what a person sends counts as before their first session.
 *
 * Its cast is the fifth point's (`WEEK_FOUR`): Ada, Ben and Dan in Group A,
 * Cleo in Group B, and Fern, the account the admin appoints to Group A on the
 * real page (`facilitated`). No register exists (`marks` is empty), week 1 is
 * published, and nothing has been posted to the run (`earlierUpdate` false:
 * the later points' update from week 1 would be dated later than the seed on
 * a morning run, on this point's first day).
 */
export const FIRST_DAY = Object.freeze({
  daysIn: 0,
  programme: FELLOWSHIP,
  groups: GROUP_PLAN,
  people: WEEK_FOUR.people,
  facilitator: FACILITATOR_PLAN,
  places: WEEK_FOUR.places,
  marks: Object.freeze({}),
  unfinished: null,
  facilitated: "A",
  published: 1,
  earlierUpdate: false,
});

/**
 * Who and what a point is made of: the form's one programme, its run's
 * groups, the people the programme accepted, and the account with no
 * application. The first three points are the fellowship's; a plan that
 * names a programme of its own (the fourth to the seventh) brings its whole
 * cast.
 */
function castOf(plan) {
  if (plan?.programme) {
    return {
      programme: plan.programme,
      groupPlan: plan.groups,
      peoplePlan: plan.people,
      facilitatorPlan: plan.facilitator,
    };
  }
  return { programme: FELLOWSHIP, groupPlan: GROUP_PLAN, peoplePlan: PEOPLE_PLAN, facilitatorPlan: FACILITATOR_PLAN };
}

/** True for the one register of a plan that was saved and not finished. */
function isUnfinishedIn(plan, groupKey, weekNumber) {
  return Boolean(plan.unfinished) && plan.unfinished.group === groupKey && plan.unfinished.weekNumber === weekNumber;
}

/** The update the run's first week carries, to everyone, posted without an email. */
export const EARLIER_UPDATE = Object.freeze({
  title: "Welcome to the course",
  message: "The week 1 reading is on this page.\n\nBring one question from it to your first session.",
});

/**
 * Who a seeded register names as marking and finishing it, and who the seeded
 * update names as its writer: ids no account has. Each is a record shown
 * nowhere as an authority, so neither borrows a real person's account.
 */
export const REGISTER_RECORD_UID = "e2e-register-record";
export const UPDATE_RECORD_UID = "e2e-update-record";

/**
 * `courseEnrolments.role` for a person placed in a group. A named constant, not
 * a quoted literal at the use site: the privilege fence refuses a role literal
 * other than the governance role "pending" (see register-push's `LEARNER`).
 */
const LEARNER = "learner";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Civil dates and the words a spec checks them against, restated
// ---------------------------------------------------------------------------

/** Civil date key "YYYY-MM-DD" in Europe/London. */
export function londonDateKey(at) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** `addDaysToKey` from src/lib/courses/weekPlan.ts: civil-date arithmetic at UTC midnight. */
export function shiftDateKey(key, days) {
  const at = new Date(`${key}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The weekday of a civil date key, `Date.getDay()` numbering (0 is Sunday). */
export function weekdayOf(key) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** `currentAcademicYear` from src/lib/firestore/users.ts: "2026/27" from August. */
function academicYearOf(key) {
  const [year, month] = key.split("-").map(Number);
  const start = month >= 8 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "Wed 28 Oct": `formatRunStartShort` in src/lib/courses/window.ts and `londonDayLabel`. */
export function dayLabel(key) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${key}T12:00:00Z`));
}

/** "6pm", "1:30pm": `clockWords` in src/lib/courses/facilitatingEmail.ts. */
export function clockWords(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wednesdays at 6pm": `weeklySlotWords` in src/lib/courses/facilitatingEmail.ts. */
export function weeklySlotWords(group) {
  return `${WEEKDAYS[group.weekday]}s at ${clockWords(group.startTimeLocal)}`;
}

/** "Wed 6pm": `whenShort` in src/features/applications/times/timesWords.ts. */
export function whenShort(group) {
  return `${WEEKDAYS_SHORT[group.weekday]} ${clockWords(group.startTimeLocal)}`;
}

/** The wall clock `minutes` after "HH:MM": `wallClockAfter` in src/lib/courses/londonLabels.ts. */
function clockAfter(hhmm, minutes) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const total = (hour * 60 + minute + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "Wed 28 Oct, 6pm to 7:30pm": `sessionWhenLabel` in src/lib/courses/londonLabels.ts. */
export function sessionWhenLabel(group, dateKey) {
  const end = clockAfter(group.startTimeLocal, group.durationMinutes);
  return `${dayLabel(dateKey)}, ${clockWords(group.startTimeLocal)} to ${clockWords(end)}`;
}

/** "Wed 28 Oct, 6pm": `firstSessionWhen` in src/lib/courses/allocationPublish.ts. */
export function firstSessionWhen(group) {
  return `${dayLabel(group.firstDateKey)}, ${clockWords(group.startTimeLocal)}`;
}

/** `weekDocId` from src/lib/firestore/courses.ts; also the session key of a week's one session. */
export function weekDocId(weekNumber) {
  return `w${String(weekNumber).padStart(2, "0")}`;
}

const WALL_CLOCK_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** An instant's London wall clock, as if it were UTC: `londonWallAsUtcMs` in src/lib/courses/weekPlan.ts. */
function londonWallAsUtcMs(instant) {
  const parts = WALL_CLOCK_PARTS.formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/**
 * The instant London's wall clock reads `hhmm` on `dateKey`, across a clock
 * change: `londonWallClockToInstant` in src/lib/courses/weekPlan.ts, restated
 * (two probes). The second point's sessions straddle the end of summer time.
 */
export function londonWallClockToInstant(dateKey, hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const target = Date.parse(`${dateKey}T00:00:00Z`) + hour * 3_600_000 + minute * 60_000;
  const candidate = target - (londonWallAsUtcMs(new Date(target)) - target);
  const wall = londonWallAsUtcMs(new Date(candidate));
  return wall === target ? new Date(candidate) : new Date(target - (wall - candidate));
}

const LONDON_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Sun 22 Nov", an instant read in London: `londonDayLabel` in src/lib/courses/londonLabels.ts. */
export function londonDayLabel(at) {
  const parts = LONDON_DAY.formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

const LONDON_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "6pm", "7:58pm": `londonClockLabel` in src/lib/courses/londonLabels.ts. */
export function londonClockLabel(at) {
  const parts = LONDON_CLOCK.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour >= 12 ? "pm" : "am";
  return minute === "00" ? `${twelve}${suffix}` : `${twelve}:${minute}${suffix}`;
}

/** "Sun 22 Nov at 6pm": `londonDayAndClock` in src/lib/courses/londonLabels.ts. */
export function londonDayAndClock(at) {
  return `${londonDayLabel(at)} at ${londonClockLabel(at)}`;
}

/** "29 Oct", a civil date: `dayMonthLabel` in src/lib/courses/programmeAttendance.ts. */
export function dayMonthLabel(key) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(
    new Date(`${key}T12:00:00Z`),
  );
}

/** "Thu 12 to Wed 18 Nov", or across a month: `weekSpanLabel` in src/lib/courses/programmeOverview.ts. */
export function weekSpanLabel(startKey) {
  const parts = (key) => {
    const found = LONDON_DAY.formatToParts(new Date(`${key}T12:00:00Z`));
    const get = (type) => found.find((p) => p.type === type)?.value ?? "";
    return { weekday: get("weekday"), day: get("day"), month: get("month") };
  };
  const start = parts(startKey);
  const end = parts(shiftDateKey(startKey, 6));
  return start.month === end.month
    ? `${start.weekday} ${start.day} to ${end.weekday} ${end.day} ${end.month}`
    : `${start.weekday} ${start.day} ${start.month} to ${end.weekday} ${end.day} ${end.month}`;
}

/** "Thursdays 6pm": `slotLine` in src/lib/courses/programmeAttendance.ts. */
export function slotLine(group) {
  return `${WEEKDAYS[group.weekday]}s ${clockWords(group.startTimeLocal)}`;
}

/** "Rahul and Sofia", "A, B and D": `namesInWords` in src/lib/courses/facilitatingEmail.ts. */
export function namesInWords(names) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Groups A and B", "Group B": `groupsInWords` in src/lib/courses/programmeAttendance.ts, for groups named "Group" and a letter. */
export function groupsInWords(names) {
  const tags = [...names].sort().map((name) => /^group\s+(\S{1,3})$/i.exec(name.trim())?.[1]?.toUpperCase() ?? name);
  return `${tags.length === 1 ? "Group" : "Groups"} ${namesInWords(tags)}`;
}

/**
 * The one order every tab of a programme lists its groups in, as People in
 * groups draws its columns: Monday first, then the start time, then the name.
 * `compareGroupsByMeeting` in src/lib/firestore/courseGroups.ts, restated.
 */
export function compareGroupsByMeeting(a, b) {
  const day = ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7);
  return day || a.startTimeLocal.localeCompare(b.startTimeLocal) || a.name.localeCompare(b.name);
}

/** One group's session in one taught week: its civil date and its instants, in London. */
export function sessionOf(group, weekNumber) {
  const dateKey = shiftDateKey(group.firstDateKey, 7 * (weekNumber - 1));
  const startsAt = londonWallClockToInstant(dateKey, group.startTimeLocal);
  return { weekNumber, dateKey, startsAt, endsAt: new Date(startsAt.getTime() + group.durationMinutes * 60_000) };
}

// ---------------------------------------------------------------------------
// A painted week
// ---------------------------------------------------------------------------

/**
 * A painted week on the form's grid, as an application stores it: one string
 * of 12 hex characters a day (48 quarter hours), Sunday first. `windows` is a
 * list of `[weekday, fromMinute, toMinute]`. The handover suites' `week()` in
 * tests/lib/handoverWorld.mjs, restated.
 */
function paintWeek(windows) {
  const days = [];
  const slotsPerDay = (GRID.endMinute - GRID.startMinute) / GRID.slotMinutes;
  for (let day = 0; day < 7; day += 1) {
    const slots = new Array(slotsPerDay).fill(false);
    for (const [weekday, from, to] of windows) {
      if (weekday !== day) continue;
      for (let minute = from; minute < to; minute += GRID.slotMinutes) {
        const slot = (minute - GRID.startMinute) / GRID.slotMinutes;
        if (slot >= 0 && slot < slotsPerDay) slots[slot] = true;
      }
    }
    let hex = "";
    for (let c = 0; c < slotsPerDay / 4; c += 1) {
      let nibble = 0;
      for (let b = 0; b < 4; b += 1) if (slots[c * 4 + b]) nibble |= 8 >> b;
      hex += nibble.toString(16);
    }
    days.push(hex);
  }
  return { ...GRID, days };
}

function minutesOf(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Free from an hour and a half before each group's session until an hour
 * after it: four hours round a ninety-minute session, so every week here is a
 * real week, read exactly as painted. A week under four hours is read "from
 * then on" and kept out of the times picture's counts
 * (`src/lib/applications/handover/paintedWeek.ts`); the unit suites cover
 * that, and these worlds keep to weeks whose groups follow from the plan.
 */
function weekFor(canMake, groups) {
  return paintWeek(
    canMake.map((key) => {
      const group = groups.find((g) => g.key === key);
      const start = minutesOf(group.startTimeLocal);
      return [group.weekday, start - 90, start + group.durationMinutes + 60];
    }),
  );
}

// ---------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------

function formDoc({ state, now }) {
  const sentAt = new Date(now.getTime() - 2 * DAY_MS);
  return {
    e2eTermRunId: state.termRunId,
    formVersion: 2,
    kind: "enrolment",
    label: state.formLabel,
    slug: state.formId,
    blurb:
      "A throwaway application form made by a course hub end-to-end run. If you are " +
      "reading this on a live surface, a run stopped before its teardown.",
    academicYear: state.academicYear,
    status: "deciding",
    opensAt: new Date(now.getTime() - 21 * DAY_MS),
    closesAt: new Date(now.getTime() - 7 * DAY_MS),
    decisionsByDate: londonDateKey(sentAt),
    invitationReplyBy: londonDateKey(new Date(now.getTime() + 3 * DAY_MS)),
    stageIds: [],
    programmePreference: {
      enabled: false,
      streams: [],
      fellowships: [],
      maxRankedFellowships: 2,
      offerFellowshipFallback: false,
    },
    availabilityGrid: { ...GRID },
    accessRequirementsPrompt: "",
    criteria: [],
    scoreScale: { min: 1, max: 5 },
    reviewersPerApplication: 1,
    // Nobody reviews or decides on this form, and nobody leads its programme:
    // the fence forbids naming either, and the hand-over and the board are an
    // admin's to drive.
    reviewerUids: [],
    finalDeciderUid: null,
    blind: { hideNames: false, hideMembership: true },
    evidenceRunIds: [],
    reminderOffsets: [],
    outcomeRunIds: [],
    applicationCounts: {
      draft: 0,
      submitted: 0,
      accepted: state.people.length,
      invited: 0,
      "no-offer": 0,
      declined: 0,
      withdrawn: 0,
    },
    archived: false,
    clonedFromRoundId: null,
    authorUid: "",
    programmeIds: [state.programmeId],
    programmes: {
      [state.programmeId]: {
        kind: state.programmeKind,
        name: state.programmeName,
        shortName: state.programmeName,
        pitch: "A programme that exists so an automated run has somebody to place.",
        facts: `${WEEK_COUNT} WEEKS`,
        starts: "",
        places: 8,
        groupCount: state.groups.length,
        groupSize: `Up to ${GROUP_CAPACITY}`,
        leadUid: null,
        reviewerUids: [],
        useScores: false,
        closed: false,
        // Tied to the course page; the run is the admin's to name on the
        // programme's Settings tab.
        courseId: state.courseId,
        runId: null,
        emailWording: {},
      },
    },
    questionSetIds: [state.questionSetId],
    asksFacilitating: false,
    revealOtherReviews: false,
    noOfferWording: null,
    decisionEmailTest: null,
    decisionsSentAt: sentAt,
    decisionsSentByUid: null,
    createdAt: new Date(now.getTime() - 28 * DAY_MS),
    updatedAt: sentAt,
  };
}

function questionSetDoc({ state, now }) {
  return {
    e2eTermRunId: state.termRunId,
    roundId: state.formId,
    role: GENERAL_SET,
    scope: { type: "kind", kind: state.programmeKind },
    label: state.questionSetLabel,
    applicantLine: "",
    intro: "",
    questions: [
      {
        id: QUESTION_ID,
        text: "Why do you want to take part this term?",
        help: "",
        type: "long",
        options: [],
        optionsFromRanking: false,
        wordLimit: 100,
        required: true,
        scored: false,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function contentFor(state, person) {
  return {
    aboutYou: {
      preferredName: person.first,
      universityEmail: "",
      universityEmailVerified: false,
      status: "undergraduate",
      statusOther: "",
      subject: "BSc Fixture Studies",
      expectedGraduation: "",
      motivation: "I want to find out which arguments hold up.",
      interests: "",
    },
    rankedProgrammeIds: [state.programmeId],
    wantsToFacilitate: null,
    answers: { [state.questionSetId]: { [QUESTION_ID]: "To read and argue with people who disagree with me." } },
    availability: person.week,
    suMembership: "not-yet",
  };
}

/** One sent application, as decision day and a reply of "I'm coming" left it. */
function applicationDoc({ state, person, now }) {
  const appliedAt = new Date(now.getTime() - 14 * DAY_MS);
  const sentAt = new Date(now.getTime() - 2 * DAY_MS);
  const content = contentFor(state, person);
  return {
    e2eTermRunId: state.termRunId,
    formVersion: 2,
    roundId: state.formId,
    uid: person.uid,
    email: person.email,
    displayName: person.displayName,
    draft: content,
    sent: content,
    sentChangedAt: null,
    sentHistory: [],
    sentHistoryDropped: 0,
    status: "accepted",
    submittedAt: appliedAt,
    sentAt: appliedAt,
    withdrawnAt: null,
    result: {
      kind: "accepted",
      programmeId: state.programmeId,
      publishedAt: sentAt,
      email: "sent",
      emailedAt: sentAt,
      emailClaimedAt: sentAt,
    },
    invitation: null,
    attendance: { answer: "coming", answeredAt: new Date(now.getTime() - DAY_MS) },
    releaseReason: null,
    createdAt: appliedAt,
    updatedAt: sentAt,
  };
}

/** What the programme decided about one person: accepted, recorded by nobody's account. */
function decisionDoc({ state, person, now }) {
  const decidedAt = new Date(now.getTime() - 3 * DAY_MS);
  return {
    e2eTermRunId: state.termRunId,
    roundId: state.formId,
    uid: person.uid,
    programmes: {
      [state.programmeId]: {
        decision: "accept",
        poolReason: null,
        couldSuitProgrammeId: null,
        decidedByUid: DECISION_RECORD_UID,
        decidedAt,
      },
    },
    pooledOutcome: null,
    exception: null,
    updatedAt: decidedAt,
  };
}

function courseDoc({ state, now }) {
  return {
    e2eTermRunId: state.termRunId,
    title: state.courseTitle,
    tagline: "Throwaway fixture for a course hub end-to-end run.",
    summaryBlocks: [
      {
        id: "b1",
        type: "richText",
        html: "<p>This course exists only while an automated course hub run is in flight.</p>",
      },
    ],
    track: "governance",
    level: "No prior experience needed",
    estimatedWeeklyHours: 2,
    status: "published",
    showcaseRunId: null,
    authorUid: "",
    collaboratorUids: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The run: a DRAFT that takes people by admissions, as the course editor
 * leaves one. Moving it on from draft is the admin's, on the run editor.
 * `cohort`, `templateId` and `templateLabel` are absent rather than null,
 * as the authoring routes store them. Its application counters start at
 * nothing; the hand-over moves `accepted`.
 */
function runDoc({ state, now }) {
  return {
    e2eTermRunId: state.termRunId,
    courseId: state.courseId,
    courseTitle: state.courseTitle,
    label: state.runLabel,
    academicYear: state.academicYear,
    status: "draft",
    enrolMode: "admissions",
    streams: [],
    enrolledCount: 0,
    startDate: state.startDate,
    // `weekId` must match the week's number: leaving draft is refused while a
    // plan addresses a week two ways.
    weekPlan: Array.from({ length: WEEK_COUNT }, (_, i) => ({
      kind: "week",
      weekNumber: i + 1,
      weekId: weekDocId(i + 1),
    })),
    startHereBlocks: [],
    applicationForm: [],
    applicationsOpenAt: null,
    applicationsCloseAt: null,
    applicationCap: null,
    admissionsReviewerUids: [],
    runFacilitatorUids: [],
    trackLeadUids: [],
    applicationCounts: { pending: 0, accepted: 0, withdrawn: 0 },
    groupCount: state.groups.length,
    channel: state.channel,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** One group: its weekly session, a room, and nobody facilitating it yet. */
function groupDoc({ state, group, now }) {
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    courseId: state.courseId,
    name: group.name,
    facilitatorUids: [],
    facilitatorAppointments: {},
    streamId: null,
    capacity: GROUP_CAPACITY,
    memberCount: 0,
    session: {
      weekday: group.weekday,
      startTimeLocal: group.startTimeLocal,
      durationMinutes: group.durationMinutes,
      location: group.room,
      meetingUrl: group.meetingUrl,
      notes: "",
    },
    sessionOverrides: {},
    sessionModes: {},
    paceStartDate: null,
    paceWeekPlan: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// The second point's records: what the weeks after decision day wrote
// ---------------------------------------------------------------------------

/**
 * A reading a week lists, as the week editor stores one (`sanitizeMaterials`
 * in src/lib/firestore/courses.ts): not optional, with its minutes, at a
 * reserved domain nothing answers on.
 */
function listedReading(reading) {
  return {
    id: reading.id,
    title: reading.title,
    optional: false,
    estimatedMinutes: reading.minutes,
    type: "reading",
    url: `https://example.com/${reading.id}`,
  };
}

/**
 * One taught week, as an editor publishes it (the shape register-push seeds).
 * The run's pitching week, at a point that has one, is also ticked as one in
 * the week editor and lists its readings, which a pitch's paper is picked from.
 * A week a point's plan lists readings for (`readings`) carries them.
 * `summary` says why the seed wrote the week; the points three weeks in and
 * later keep the words they always had.
 */
function publishedWeekDoc({
  state,
  weekNumber,
  at,
  summary = "Seeded so a term three weeks in has the weeks an editor would have published.",
}) {
  const week = {
    e2eTermRunId: state.termRunId,
    weekNumber,
    title: `E2E week ${weekNumber} reading`,
    summary,
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    estimatedMinutes: null,
    published: true,
    updatedAt: at,
    updatedByUid: null,
  };
  const listed = state.readings?.[weekNumber] ?? [];
  if (state.pitching?.weekNumber !== weekNumber) {
    return listed.length > 0 ? { ...week, materials: listed.map(listedReading) } : week;
  }
  return {
    ...week,
    pitching: true,
    // A reserved domain: nothing answers there.
    materials: state.pitching.readings.map((reading) => ({
      id: reading.id,
      type: "reading",
      title: reading.title,
      url: `https://example.com/${reading.id}`,
    })),
  };
}

/**
 * The run's pitching settings and how its teams are made, as the run
 * editor's Pitching week section saves them (`storedPitchSettings` and
 * `normalizeTeamsFrom` in src/lib/firestore/courses.ts and
 * src/lib/courses/teams/model.ts, restated), or nothing at a point with no
 * pitching week.
 */
function pitchingFieldsOf(state) {
  if (!state.pitching) return {};
  const { pickLimit, teamSize, teamsMadeOn, teamsFrom } = state.pitching;
  return {
    pitchSettings: { pickLimit, teamSizeMin: teamSize.min, teamSizeMax: teamSize.max, teamsMadeOn },
    teamsFrom,
  };
}

/**
 * Each person's register marks in their group's weeks, oldest first, as the
 * finishing press reads them: `{ weekNumber, held, finished, status }`. A week
 * the plan has no marks for has no register at all.
 */
function registerFactsFor(plan, person) {
  const marks = plan.marks[person.groupKey] ?? {};
  return Object.keys(marks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((weekNumber) => ({
      sessionKey: weekDocId(weekNumber),
      weekNumber,
      held: true,
      finished: !isUnfinishedIn(plan, person.groupKey, weekNumber),
      status: marks[weekNumber][person.key] ?? null,
    }));
}

/**
 * A person's attendance tally from their group's finished registers:
 * `recomputeRollup` in src/lib/courses/attendanceRollup.ts, restated. Only a
 * finished, held register from the week they joined counts; an unmarked
 * person on one counts as absent.
 */
function rollupFor(plan, person, at) {
  const rollup = {
    sessionsHeld: 0,
    attendedInFull: 0,
    late: 0,
    leftEarly: 0,
    absent: 0,
    excused: 0,
    lastPushedSessionKey: null,
    lastComputedAt: at,
  };
  for (const fact of registerFactsFor(plan, person)) {
    if (!fact.finished || !fact.held) continue;
    rollup.sessionsHeld += 1;
    if (fact.status === "present") rollup.attendedInFull += 1;
    else if (fact.status === "late") rollup.late += 1;
    else if (fact.status === "left-early") rollup.leftEarly += 1;
    else if (fact.status === "excused") rollup.excused += 1;
    else rollup.absent += 1;
    rollup.lastPushedSessionKey = fact.sessionKey;
  }
  return rollup;
}

/**
 * One person's place, as the board created it, Publish stamped it told and
 * the finishing presses left its tally: the fields of the allocate route, the
 * two Publish adds, and the tally.
 */
function placementDoc({ state, plan, person, group, at }) {
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    courseId: state.courseId,
    uid: person.uid,
    groupId: group.id,
    status: "active",
    role: LEARNER,
    applicationId: `${state.runId}__${person.uid}`,
    // Week 1: they were placed before the run began.
    joinedWeekNumber: 1,
    allocatedEmailAt: at.published,
    allocatedEmailDelivery: "sent",
    attendance: rollupFor(plan, person, at.lastFinished),
    createdAt: at.placed,
    updatedAt: at.lastFinished,
  };
}

/** The cohort list's row for one person, as Publish's `subscribe()` writes it. */
function cohortRowDoc({ state, person, at }) {
  return {
    e2eTermRunId: state.termRunId,
    email: person.email.toLowerCase(),
    channel: state.channel,
    audience: "user",
    audienceId: person.uid,
    confirmed: true,
    confirmedAt: at.published,
    subscribed: true,
    subscribedAt: at.published,
    source: "course-allocation",
    name: person.first,
    createdAt: at.published,
  };
}

/**
 * One register, as the marking route saves it and, once finished, the
 * finishing press stamps it. Marked and finished by nobody's account
 * (`REGISTER_RECORD_UID`).
 */
function registerDoc({ state, group, weekNumber, marks, finished }) {
  const session = sessionOf(group, weekNumber);
  const records = {};
  for (const person of state.people) {
    if (marks[person.key]) records[person.uid] = marks[person.key];
  }
  const finishedAt = new Date(session.endsAt.getTime() + 30 * 60_000);
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    groupId: group.id,
    weekNumber,
    occurrence: 1,
    sessionKey: weekDocId(weekNumber),
    records,
    held: true,
    sessionAt: session.startsAt,
    pushedAt: finished ? finishedAt : null,
    pushedByUid: finished ? REGISTER_RECORD_UID : "",
    notes: "",
    participantNotes: {},
    markedByUid: REGISTER_RECORD_UID,
    updatedAt: finished ? finishedAt : session.endsAt,
  };
}

/**
 * What a person wrote on one of a week's readings in that week, as the week
 * page saves it (`buildProgressWrite` in src/lib/firestore/courseProgress.ts,
 * restated, with the save's own stamp): the reading ticked, a rating, a
 * comment the run reads and a note for themselves. Written by their own
 * account, so it names nobody else's.
 */
function progressDoc({ state, person, entry, at }) {
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    uid: person.uid,
    weekNumber: entry.weekNumber,
    itemKind: "material",
    itemId: entry.itemId,
    completed: true,
    completedAt: at,
    rating: entry.rating,
    hasPublicComment: true,
    publicComment: entry.comment,
    privateNote: entry.note,
    updatedAt: at,
  };
}

/**
 * One taught week of the coursework point, WRITTEN AS BLOCKS, as an editor
 * publishes one: a part asking for two reflections, a part with two sources
 * and a third reflection, and a part holding the week's written answer. Every
 * id carries the week's number, so no two weeks share one.
 */
export function courseworkWeekDoc({ state, weekNumber, at }) {
  const id = (key) => courseworkItemId(weekNumber, key);
  const run = (text) => ({ text });
  const p = (text) => ({ type: "p", runs: [run(text)] });
  const source = (key, kind, url) => ({
    id: id(key),
    type: "source",
    kind,
    lead: "",
    title: COURSEWORK_SOURCES[key],
    // A reserved domain: nothing answers there.
    url,
    by: "E2E Example",
    date: "2025",
    time: "20 minutes",
    compute: "",
    note: [],
  });
  return {
    e2eTermRunId: state.termRunId,
    weekNumber,
    title: `E2E week ${weekNumber} coursework`,
    summary: "Seeded so the coursework point has weeks written as blocks.",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    estimatedMinutes: null,
    published: true,
    ready: true,
    updatedAt: at,
    updatedByUid: null,
    blocks: [
      {
        id: id("p1"),
        type: "part",
        title: "Start with what you think",
        time: "About 5 minutes",
        framing: [p("Write before you read anything.")],
        blocks: [
          {
            id: id("rs1"),
            type: "reflection",
            prompts: [
              { id: id("rp1"), text: COURSEWORK_PROMPTS.rp1 },
              { id: id("rp2"), text: COURSEWORK_PROMPTS.rp2 },
            ],
          },
        ],
      },
      {
        id: id("p2"),
        type: "part",
        title: "Two keepers' views",
        time: "About 45 minutes",
        framing: [p("Two very different keepers.")],
        blocks: [
          source("s1", "read", `https://example.com/e2e-diary-${weekNumber}`),
          source("s2", "watch", `https://example.org/e2e-lamps-${weekNumber}`),
          { id: id("rs2"), type: "reflection", prompts: [{ id: id("rp3"), text: COURSEWORK_PROMPTS.rp3 }] },
        ],
      },
      {
        id: id("p3"),
        type: "part",
        title: "Your answer",
        time: "About 30 minutes",
        framing: [],
        blocks: [
          {
            id: id("wa"),
            type: "writtenAnswer",
            prompt: [p(COURSEWORK_ANSWER_PROMPT)],
            boxes: [],
            guidance: [],
            words: { min: 1, max: 300 },
            due: "dayBefore",
          },
        ],
      },
    ],
  };
}

/**
 * The coursework point's rows, each as its route writes it, saved an hour
 * after the session of that week of the writer's group, or of Group A for
 * somebody in no group (week 1's door opens before groups go out):
 * reflections (`kind: "reflection"`), ticks with the note a person keeps on a
 * source, and written answers, sent and waiting for feedback.
 */
async function seedCoursework(state, plan) {
  const personOf = (key) => state.people.find((each) => each.key === key);
  const savedAt = (person, weekNumber) => {
    const group = state.groups.find((each) => each.key === person.groupKey) ?? state.groups[0];
    return new Date(sessionOf(group, weekNumber).endsAt.getTime() - 26 * HOUR_MS);
  };
  for (const entry of plan.reflections) {
    const person = personOf(entry.person);
    const promptId = courseworkItemId(entry.weekNumber, entry.prompt);
    await fixtureDoc("courseExerciseResponses", `${state.runId}__${person.uid}__${weekDocId(entry.weekNumber)}__${promptId}`).set({
      e2eTermRunId: state.termRunId,
      runId: state.runId,
      uid: person.uid,
      weekId: weekDocId(entry.weekNumber),
      weekNumber: entry.weekNumber,
      exerciseId: promptId,
      kind: "reflection",
      responseType: "text",
      text: entry.text,
      submittedAt: null,
      reviewStatus: "unreviewed",
      updatedAt: savedAt(person, entry.weekNumber),
    });
  }
  for (const entry of plan.ticks) {
    const person = personOf(entry.person);
    const itemId = courseworkItemId(entry.weekNumber, entry.source);
    const when = savedAt(person, entry.weekNumber);
    await fixtureDoc("courseProgress", progressId(state.runId, person.uid, itemId)).set({
      e2eTermRunId: state.termRunId,
      runId: state.runId,
      uid: person.uid,
      weekNumber: entry.weekNumber,
      itemKind: "material",
      itemId,
      completed: true,
      completedAt: when,
      hasPublicComment: false,
      ...(entry.note ? { privateNote: entry.note } : {}),
      updatedAt: when,
    });
  }
  for (const entry of plan.answers) {
    const person = personOf(entry.person);
    const answerId = courseworkItemId(entry.weekNumber, "wa");
    const when = savedAt(person, entry.weekNumber);
    await fixtureDoc("courseExerciseResponses", `${state.runId}__${person.uid}__${weekDocId(entry.weekNumber)}__${answerId}`).set({
      e2eTermRunId: state.termRunId,
      runId: state.runId,
      uid: person.uid,
      weekId: weekDocId(entry.weekNumber),
      weekNumber: entry.weekNumber,
      exerciseId: answerId,
      responseType: "text",
      text: entry.text,
      // Counted as Worksheets count words (`countWords`), restated for one plain sentence.
      words: entry.text.trim().split(/\s+/).length,
      firstSentAt: when,
      submittedAt: when,
      reviewStatus: "unreviewed",
      updatedAt: when,
    });
  }
}

/** `courseProgressId` from src/lib/firestore/courseProgress.ts, restated. Construct-only. */
function progressId(runIdValue, uid, itemId) {
  return `${runIdValue}__${uid}__${itemId}`;
}

/** The update from week 1: to everyone, posted without an email, by nobody's account. */
function earlierUpdateDoc({ state, postedAt }) {
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    to: "everyone",
    groupId: null,
    title: EARLIER_UPDATE.title,
    message: EARLIER_UPDATE.message,
    authorUid: UPDATE_RECORD_UID,
    postedAt,
    email: null,
  };
}

/**
 * The uid behind the admin address the harness is given. READ ONLY, and kept
 * in the ledger's private half (`adminUid` is a private key): the updates
 * route's send counters are keyed on the presser's uid and carry nothing else
 * a teardown could find them by. Nothing here writes to the account.
 */
async function adminUidFromSecrets() {
  const { adminEmail } = loadSecrets();
  if (!adminEmail) {
    throw new Error(
      "The course hub term three weeks in needs the admin account the harness is given: " +
        "E2E_ADMIN_EMAIL is not set. This harness cannot create an admin, by design.",
    );
  }
  return (await adminAuth().getUserByEmail(adminEmail)).uid;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Seeds the term at `point` and returns the state a spec drives it from.
 *
 * Every id is worked out and published (`onState`) BEFORE the first write, so
 * a seed that stops part way leaves a ledger naming everything it could have
 * made, and teardown removes each by the id it was given.
 */
export async function seedTerm({ runId: termRunId, suppress = true, onState, point = TERM_POINTS[0] } = {}) {
  if (!TERM_POINTS.includes(point)) {
    throw new Error(`No term point ${JSON.stringify(point)}. The points are ${TERM_POINTS.join(", ")}.`);
  }
  const target = assertFixtureTarget();
  const now = new Date();
  const todayKey = londonDateKey(now);
  // Every later point is three weeks in, and they differ only in their plan.
  const laterPlan = laterPlanOf(point);
  const weekThree = laterPlan !== null;
  // The fellowship's programme, groups and people, or the plan's own.
  const cast = castOf(laterPlan);
  // The moment decision day's records describe: the seed itself at the first
  // point, and at a later one the same moment of a term whose run began
  // `daysIn` days ago, so every record of the first point is written as it
  // was then.
  const anchor = weekThree ? new Date(now.getTime() - (laterPlan.daysIn + START_AFTER_DAYS) * DAY_MS) : now;
  const startDate = weekThree ? shiftDateKey(todayKey, -laterPlan.daysIn) : shiftDateKey(todayKey, START_AFTER_DAYS);
  const startWeekday = weekdayOf(startDate);
  const runIdValue = fixtureId("e2e-term-run", termRunId);

  const groups = cast.groupPlan.map((plan) => {
    const firstDateKey = shiftDateKey(startDate, plan.dayAfterStart);
    return {
      key: plan.key,
      id: fixtureId(`e2e-term-group-${plan.key.toLowerCase()}`, termRunId),
      name: plan.name,
      weekday: (startWeekday + plan.dayAfterStart) % 7,
      // A session under way when the seed runs (`SESSION_UNDER_WAY`) starts
      // half an hour before it, by the seed's own clock.
      startTimeLocal: plan.startTimeLocal === SESSION_UNDER_WAY ? underWayClock(now) : plan.startTimeLocal,
      durationMinutes: SESSION_MINUTES,
      room: plan.room,
      // A reserved domain: nothing answers there.
      meetingUrl: plan.online ? `https://meet.example.com/e2e-${termRunId}` : null,
      firstDateKey,
      lastDateKey: shiftDateKey(firstDateKey, 7 * (WEEK_COUNT - 1)),
    };
  });

  const state = {
    termRunId,
    point,
    projectId: target.projectId,
    createdAt: now.toISOString(),
    /** The runner's answer, recorded so a spec branches on the same fact. */
    suppress,
    formId: fixtureId("e2e-term-form", termRunId),
    formLabel: `E2E term form ${termRunId}`,
    programmeId: cast.programme.id,
    programmeKind: cast.programme.kind,
    programmeName: `E2E ${cast.programme.word} ${termRunId}`,
    questionSetId: cast.programme.questionSetId,
    questionSetLabel: cast.programme.questionSetLabel,
    courseId: fixtureId("e2e-term-course", termRunId),
    courseTitle: `E2E term course ${termRunId}`,
    runId: runIdValue,
    runLabel: `E2E term ${termRunId}`,
    academicYear: academicYearOf(weekThree ? startDate : todayKey),
    startDate,
    weekCount: WEEK_COUNT,
    channel: cohortChannel(runIdValue),
    groups,
    /** Filled below, one per account made, in the order of the cast's people. */
    people: [],
    facilitator: null,
    suppressed: [],
    ...(weekThree
      ? {
          /** A later point's own facts, as instants and ids. */
          weekThree: {
            publishedAt: londonWallClockToInstant(shiftDateKey(startDate, -2), "10:00").toISOString(),
            earlierUpdateId: fixtureId("e2e-term-update", termRunId),
            earlierUpdatePostedAt: londonWallClockToInstant(startDate, "09:00").toISOString(),
          },
          /** The admin's uid: a private key, kept out of the ledger. Resolved below. */
          adminUid: null,
        }
      : {}),
    ...(laterPlan?.pitching ? { pitching: pitchingOf(laterPlan.pitching, groups) } : {}),
    // The readings a plan's weeks list, and what its people wrote on them.
    ...(laterPlan?.readings ? { readings: laterPlan.readings } : {}),
    ...(laterPlan?.notes ? { notes: laterPlan.notes.map((entry) => ({ ...entry })) } : {}),
  };

  // Published BEFORE the first write and filled in place from here on.
  onState?.(state);
  if (weekThree) state.adminUid = await adminUidFromSecrets();

  log(`Seeding the term (${point}) for run ${termRunId} into ${target.projectId}.`);

  // Accounts first: everything else can be torn down without them, and an
  // account with nothing to belong to is the harmless failure.
  const plans = [...cast.peoplePlan, ...(cast.facilitatorPlan ? [cast.facilitatorPlan] : [])];
  for (const [index, plan] of plans.entries()) {
    const names = { preferred: plan.first, display: `${plan.first} Fixture ${termRunId}` };
    const account = await createFixtureUser({ runId: termRunId, index, suppress, names });
    if (account.suppressionId) state.suppressed.push(account.suppressionId);
    const person = {
      key: plan.key,
      uid: account.uid,
      email: account.email,
      password: account.password,
      first: names.preferred,
      displayName: names.display,
    };
    if (plan === cast.facilitatorPlan) {
      state.facilitator = person;
    } else {
      state.people.push({
        ...person,
        canMake: [...plan.canMake],
        ...(weekThree ? { groupKey: laterPlan.places[plan.key] } : {}),
      });
    }
  }

  // Decision day's records, as of `anchor`: the seed's own moment at the
  // first point, so its records are what they always were.
  const at = weekThree ? weekThreeInstants(state, laterPlan) : null;
  await fixtureDoc("courses", state.courseId).set(courseDoc({ state, now: anchor }));
  const run = runDoc({ state, now: anchor });
  await fixtureDoc("courseRuns", state.runId).set(
    weekThree
      ? // Moved on from draft before the start, and published: its people were
        // told their groups. A run with a pitching week also carries what its
        // run editor saved for that week and for its teams.
        {
          ...run,
          status: "running",
          allocationPublishedAt: at.published,
          updatedAt: at.published,
          ...pitchingFieldsOf(state),
        }
      : run,
  );
  for (const group of state.groups) {
    const record = groupDoc({ state, group, now: anchor });
    await fixtureDoc("courseGroups", group.id).set(
      weekThree
        ? { ...record, memberCount: state.people.filter((person) => person.groupKey === group.key).length }
        : record,
    );
  }

  await fixtureDoc("admissionRounds", state.formId).set(formDoc({ state, now: anchor }));
  await fixtureSubcollection("admissionRounds", state.formId, "questionSets")
    .doc(state.questionSetId)
    .set(questionSetDoc({ state, now: anchor }));
  for (const person of state.people) {
    const week = weekFor(person.canMake, state.groups);
    await fixtureDoc("admissionApplications", `${state.formId}__${person.uid}`).set(
      applicationDoc({ state, person: { ...person, week }, now: anchor }),
    );
    await fixtureDoc("admissionDecisions", `${state.formId}__${person.uid}`).set(
      decisionDoc({ state, person, now: anchor }),
    );
  }

  if (weekThree) await seedWeekThree(state, laterPlan, at);
  if (point === "before-groups") await seedLaterWeeks(state, anchor);
  // A point whose plan has somebody who left: their records as leaving left them.
  if (laterPlan?.left) await seedLeavers(state, laterPlan);

  log(
    `Seeded form ${state.formId} (${state.programmeKind}, decisions sent, ${state.people.length} accepted and coming), ` +
      `course ${state.courseId}, ${weekThree ? "running" : "draft"} run ${state.runId} starting ${startDate}, ` +
      `${state.groups.length} ${state.groups.length === 1 ? "group" : "groups"}, and ${plans.length} waiting accounts` +
      (weekThree
        ? `; ${laterPlan.daysIn} days into its run: places told, ${laterPlan.published} weeks published` +
          (Object.keys(laterPlan.marks).length > 0 ? ", registers" : "") +
          (laterPlan.earlierUpdate === false ? "" : ", one update") +
          (state.notes ? `, ${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"} on a reading` : "")
        : "") +
      (point === "before-groups"
        ? `; weeks ${BEFORE_GROUPS.firstPublished} to ${WEEK_COUNT} published, week 1 not written`
        : "") +
      (state.pitching ? `; week ${state.pitching.weekNumber} is pitching week, teams made on ${state.pitching.teamsMadeOn}.` : "."),
  );
  return state;
}

/**
 * The seventh point's weeks (`BEFORE_GROUPS`): from its first published week
 * to the last, as an editor publishes them a day before the seed, and week 1
 * not written at all, so the lead's first save on the Weeks tab makes it.
 */
async function seedLaterWeeks(state, now) {
  const at = new Date(now.getTime() - DAY_MS);
  for (let weekNumber = BEFORE_GROUPS.firstPublished; weekNumber <= WEEK_COUNT; weekNumber += 1) {
    await fixtureSubcollection("courseRuns", state.runId, "weeks")
      .doc(weekDocId(weekNumber))
      .set(
        publishedWeekDoc({
          state,
          weekNumber,
          at,
          summary: "Seeded so the term before groups go out has its later weeks loaded.",
        }),
      );
  }
}

/**
 * A point's pitching week, as its spec reads it: the plan's settings, and the
 * day the teams are made, which is the first session of the week after
 * pitching week, from the groups' own calendars.
 */
function pitchingOf(plan, groups) {
  const teamsMadeOn = groups.map((group) => sessionOf(group, plan.weekNumber + 1).dateKey).sort()[0];
  return {
    weekNumber: plan.weekNumber,
    weekId: weekDocId(plan.weekNumber),
    readings: plan.readings.map((reading) => ({ id: reading.id, title: reading.title })),
    pickLimit: plan.pickLimit,
    teamSize: { min: plan.teamSize.min, max: plan.teamSize.max },
    teamsMadeOn,
    teamsFrom: plan.teamsFrom,
  };
}

/** The instants a later point's records are dated by, from the seed's clock. */
function weekThreeInstants(state, plan) {
  const published = new Date(state.weekThree.publishedAt);
  const finished = [];
  for (const group of state.groups) {
    for (const week of Object.keys(plan.marks[group.key] ?? {})) {
      const weekNumber = Number(week);
      if (isUnfinishedIn(plan, group.key, weekNumber)) continue;
      finished.push(sessionOf(group, weekNumber).endsAt.getTime() + 30 * 60_000);
    }
  }
  return {
    published,
    // The board placed them an hour before Publish told them.
    placed: new Date(published.getTime() - HOUR_MS),
    // An editor published the weeks the day before.
    weeksPublished: new Date(published.getTime() - DAY_MS),
    // The latest finishing press, which last worked out everybody's tally; at
    // a point with no finished register yet, Publish's moment, when each
    // place last changed.
    lastFinished: finished.length > 0 ? new Date(Math.max(...finished)) : published,
    earlierUpdate: new Date(state.weekThree.earlierUpdatePostedAt),
  };
}

/**
 * What the weeks after decision day wrote, on top of decision day's records:
 * the published weeks, each person's told place and cohort row, every
 * register the plan has marks for, the update from week 1, and what the
 * plan's people wrote on its readings. See the module header.
 */
async function seedWeekThree(state, plan, at) {
  for (let weekNumber = 1; weekNumber <= plan.published; weekNumber += 1) {
    await fixtureSubcollection("courseRuns", state.runId, "weeks")
      .doc(weekDocId(weekNumber))
      .set(
        plan.blockWeeks
          ? courseworkWeekDoc({ state, weekNumber, at: at.weeksPublished })
          : publishedWeekDoc({ state, weekNumber, at: at.weeksPublished }),
      );
  }
  for (const person of state.people) {
    const group = state.groups.find((each) => each.key === person.groupKey);
    // Somebody the plan placed in no group holds a place and has no seat:
    // Publish told them nothing, and they are on no cohort list.
    if (!group) continue;
    await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).set(
      placementDoc({ state, plan, person, group, at }),
    );
    await fixtureDoc("subscriptions", subscriptionId(person.email, state.channel)).set(
      cohortRowDoc({ state, person, at }),
    );
  }
  for (const group of state.groups) {
    for (const [week, marks] of Object.entries(plan.marks[group.key] ?? {})) {
      const weekNumber = Number(week);
      const finished = !isUnfinishedIn(plan, group.key, weekNumber);
      // `attendanceDocId` in src/lib/firestore/courseAttendance.ts, restated.
      await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${weekDocId(weekNumber)}`).set(
        registerDoc({ state, group, weekNumber, marks, finished }),
      );
    }
  }
  // The update from week 1, at every later point but one whose plan says no
  // update has been posted yet (`earlierUpdate: false`).
  if (plan.earlierUpdate !== false) {
    await fixtureDoc("courseUpdates", state.weekThree.earlierUpdateId).set(
      earlierUpdateDoc({ state, postedAt: at.earlierUpdate }),
    );
  }
  // The coursework point's reflections, ticks and written answers.
  if (plan.coursework) await seedCoursework(state, plan.coursework);
  // What a person wrote on a reading, saved an hour after their group's
  // session of that week.
  for (const entry of state.notes ?? []) {
    const person = state.people.find((each) => each.key === entry.person);
    const group = state.groups.find((each) => each.key === person.groupKey);
    const savedAt = new Date(sessionOf(group, entry.weekNumber).endsAt.getTime() + HOUR_MS);
    await fixtureDoc("courseProgress", progressId(state.runId, person.uid, entry.itemId)).set(
      progressDoc({ state, person, entry, at: savedAt }),
    );
  }
}

// ---------------------------------------------------------------------------
// Counting: the manifest that must read zero
// ---------------------------------------------------------------------------

/** Every account the term made, the ones the seed never reached left out. */
export function accountsOf(state) {
  return [...(state.people ?? []), state.facilitator].filter(Boolean);
}

/** Every cohort subscription id this term's people could be given, constructed. */
function subscriptionIdsOf(state) {
  return accountsOf(state).map((account) => subscriptionId(account.email, state.channel));
}

/**
 * The surveys an admin made on this term's programme. Each has an id the
 * survey routes make, which the fixture never knows in advance, and each
 * names the form it is about (`roundId`); every row its routes write is found
 * from it by the survey's id. So every count and teardown reads them first,
 * and teardown deletes them last of the term's rows, after everything found
 * by their ids: a teardown stopped part way still finds each row by its survey.
 */
async function surveyIdsOf(state) {
  const snap = await fixtureQuery("surveys").where("roundId", "==", state.formId).get();
  // A check-in at the end of a session names its run and no form at its top
  // (src/lib/surveys/checkIns/open.ts): found by the run, the rest by its id.
  const checkIns = state.runId ? await fixtureQuery("surveys").where("runId", "==", state.runId).get() : { docs: [] };
  return [...new Set([...snap.docs, ...checkIns.docs].map((doc) => doc.id))].sort();
}

/**
 * The send counters a survey's presses leave (`claimCaps` in
 * src/lib/surveys/sending.ts, restated: `reserveNoticeSlots` keeps them in
 * `courseNudges` as `emailrate__<key>`, with nothing on the row to query by):
 * each survey's daily one, and the presser's hourly one. Only an admin
 * presses a survey's buttons, so the presser is the admin the ledger names.
 */
function surveyCounterIdsOf(state, surveyIds) {
  const ids = [];
  for (const id of surveyIds) {
    ids.push(`emailrate__surveyday__${id}`);
    if (state.adminUid) ids.push(`emailrate__survey__${id}__${state.adminUid}`);
  }
  // A check-in's daily counter is its group's (`checkinday__<group>`), whoever opens it.
  for (const group of state.groups ?? []) ids.push(`emailrate__checkinday__${group.id}`);
  return ids;
}

/**
 * The send log, keyed four ways and counted once: every row to one of the
 * term's own addresses, every row about the term's course run, every row
 * about one of its groups, and every row about one of its surveys, whoever
 * they went to. The last three keys are what find a test, which goes to the
 * admin who pressed it, an address this ledger never holds: Publish's test is
 * about the run, the test of an update to one group is about that group, and
 * a survey's tests (of its email and of its reminder) are about the survey.
 */
async function sendRowsOf(state, surveyIds = []) {
  const rows = new Map();
  for (const account of accountsOf(state)) {
    const snap = await fixtureQuery("emailSends").where("to", "==", account.email).get();
    for (const doc of snap.docs) rows.set(doc.id, doc.ref);
  }
  const about = await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get();
  for (const doc of about.docs) rows.set(doc.id, doc.ref);
  for (const group of state.groups ?? []) {
    const aboutGroup = await fixtureQuery("emailSends").where("referenceId", "==", group.id).get();
    for (const doc of aboutGroup.docs) rows.set(doc.id, doc.ref);
  }
  for (const id of surveyIds) {
    const aboutSurvey = await fixtureQuery("emailSends").where("referenceId", "==", id).get();
    for (const doc of aboutSurvey.docs) rows.set(doc.id, doc.ref);
  }
  return rows;
}

/**
 * The send counters this term's presses leave, by the ids the routes build
 * (`reserveSendSlot` and `reserveNoticeSlots` keep them in `courseNudges` as
 * `emailrate__<key>`, with no run on the row to query by):
 *  - the updates route's: each audience's daily counter, and each presser's
 *    own hourly ones, the test's and the post's;
 *  - a register's push throttle, one per group and presser
 *    (`push__<groupId>__<uid>` in src/app/api/courses/groups/[groupId]/attendance/push/route.ts).
 * The pressers are the admin, while the ledger holds the admin's uid, and the
 * term's facilitator, who writes to their group and finishes its register.
 */
function sendCounterIdsOf(state) {
  const audiences = [
    ...(state.groups ?? []).map((group) => `group__${group.id}`),
    `everyone__${state.runId}`,
    `facilitators__${state.runId}`,
  ];
  const ids = audiences.map((key) => `emailrate__updateday__${key}`);
  for (const uid of [state.adminUid, state.facilitator?.uid].filter(Boolean)) {
    ids.push(`emailrate__updatetest__${state.runId}__${uid}`);
    ids.push(`emailrate__updatepost__${state.runId}__${uid}`);
    for (const key of audiences) ids.push(`emailrate__update__${key}__${uid}`);
    for (const group of state.groups ?? []) ids.push(`emailrate__push__${group.id}__${uid}`);
  }
  return ids;
}

/**
 * The register reminder's markers the term's facilitator could hold: one per
 * group and taught week, each addressed through its one door. A lead's Remind
 * claims one before it emails and keeps it; nothing else here writes one.
 */
function reminderMarkersOf(state) {
  if (!state.facilitator) return [];
  const refs = [];
  for (const group of state.groups ?? []) {
    for (let weekNumber = 1; weekNumber <= (state.weekCount ?? WEEK_COUNT); weekNumber += 1) {
      refs.push(
        registerReminderMarkerDoc({ groupId: group.id, sessionKey: weekDocId(weekNumber), uid: state.facilitator.uid }),
      );
    }
  }
  return refs;
}

/**
 * Every row this term owns, seeded or written by a route a spec drives on it,
 * counted by a key the term controls. Teardown is believed only when this
 * reads zero across the board.
 *
 * The routes and what they write, read off each route and its helpers:
 *  - naming the run (programme run route): the form document itself;
 *  - moving it on from draft (run status route): the run document itself;
 *  - the hand-over: `courseApplications` rows, one `courseAudit` row, the run's counter;
 *  - placing (allocate route): `courseEnrolments`, the groups' counters;
 *  - appointing a facilitator: the group, a facilitator `courseEnrolments` row;
 *  - "Send a test to me": a `courseNudges` record of the test, `emailSends` rows;
 *  - Publish: `courseNudges` (its press lock, one marker per facilitator told),
 *    cohort `subscriptions` and their `subscriptionEvents`, the enrolments'
 *    told stamps, `emailSends` rows;
 *  - a member opening their programme page: possibly a mirrored `tasks` card
 *    (none before the run starts) and nothing in `courseProgress`;
 *  - approving an account: the `users` document, and the approval email's send row.
 *
 * And at the second point, on top of its seeded registers, places, cohort rows,
 * weeks and update:
 *  - the Overview and the Attendance tab: they only read;
 *  - Remind: the reminder's marker in `schedulerMarkers` (`reminderMarkersOf`)
 *    and its send row to the facilitator;
 *  - Download CSV: one `dataExports` row, its scope the run;
 *  - an update, and its test: a `courseUpdates` row, the send rows (about the
 *    group, for an update to one group), and the route's send counters
 *    (`sendCounterIdsOf`).
 *
 * And at the third point, as its facilitator drives it:
 *  - marking the register: the week's `courseAttendance` row (`runId` on it);
 *  - finishing it: the row's stamp, each member's tally on `courseEnrolments`,
 *    one `courseAudit` row, the push throttle (`sendCounterIdsOf`), and, only
 *    while next week's email is not on its schedule and the next week is
 *    published, that email's marker in `courseNudges` (`runId` on it) and its
 *    send rows (`to ==` each member);
 *  - changing a session: the group document itself;
 *  - the update that tells the group: as an update above, with the
 *    facilitator as the presser.
 *
 * And at the fourth point, as its people and its lead drive it:
 *  - a pitch saved, and a pick pressed or taken back: one `coursePitches` row
 *    a pitch (`runId` on it), the picks on the pitch itself;
 *  - the Pitches view and the Teams tab: they only read;
 *  - making a team from a pitch, moving somebody, removing a team: the
 *    `courseTeams` rows (`runId` on them);
 *  - "Send a test to me" beside "Tell everyone their team": the test's
 *    marker in `courseNudges` (`runId` on it) and its send row (about the
 *    run);
 *  - "Tell everyone their team": the press's lock in `courseNudges` (`runId`
 *    on it, let go when the press ends), what each person was told on their
 *    team, and the send rows (`to ==` each person, about the run).
 *
 * And at the fifth point, as its people and the lead drive it:
 *  - leaving, by either door ("Leave the programme", the enrol route's leave,
 *    or "I can’t make it", the reply route), which is one leave
 *    (src/lib/courses/leaveRun.ts): the person's `courseEnrolments` row
 *    (withdrawn, the day, the reason), their group's counter, their
 *    application and the form's counters (the place given back), one
 *    `courseAudit` row (`runId` on it), their cohort row unsubscribed with its
 *    `subscriptionEvents` line, their mirrored `tasks` cards deleted, and the
 *    leave's email (`to ==` them, about the run);
 *  - the page that says they left, their notes and the reading list, the
 *    facilitator's group page and register, the lead's Overview,
 *    Applications and Attendance tabs and the allocation board: they only
 *    read (the attendance CSV writes its `dataExports` row, as at the second
 *    point).
 *
 * And at the sixth point, past the approval, the naming and the hand-over
 * every point has: nothing. Both doors refuse a leave once the run's last
 * session is over, before they write anything.
 *
 * And at the end of a programme ("last-week", "programme-over"), past the
 * approvals, the naming and the facilitator every point has:
 *  - making the survey at the end, its test and its send (src/lib/surveys/):
 *    the `surveys` document (the form's id on it as `roundId`), found by the
 *    form (`surveyIdsOf`); one `surveyPeople` row a person, with their link's
 *    secret (`surveyId` on it); the send counters (`surveyCounterIdsOf`); a
 *    send row to the admin about the survey (`referenceId`), and the notices
 *    (`to ==` each person);
 *  - the rule for who finished and the lead's switch (src/lib/courses/finishing/):
 *    `courseFinishing` rows, the rule's and each decision's (`runId` on each);
 *  - the certificates' test and send (src/lib/courses/certificates/): the
 *    test's marker and the press's lock in `courseNudges` (`runId` on each),
 *    one `courseCertificates` row a certificate (`runId` on it), a send row to
 *    the admin about the run, and the certificate emails (`to ==` each, about
 *    the run);
 *  - an owner's switch: their certificate row; the page, the PDF and the
 *    programme pages read, and a programme page or Home may mirror a week
 *    into `tasks`.
 *
 * And at the seventh point, as the lead and the people drive it, past the
 * first point's naming, hand-over, placing, test and Publish:
 *  - the day groups go out (the Groups tab): the run document itself;
 *  - Start here and the Glossary (the run's editor): the run document itself;
 *  - week 1 pasted, saved as a draft and marked ready (the Weeks tab): the
 *    run's week 1, made by its first save (`weeks`);
 *  - a tick on week 1 by somebody holding a place (week 1's door): their own
 *    `courseProgress` row (`runId` on it);
 *  - a reflection box written in on week 1: their own
 *    `courseExerciseResponses` row (`runId` on it);
 *  - "I can’t make it" before the hand-over: the person's own application and
 *    the form's counters, and no email;
 *  - Home, My programmes, the week page, Start here and the Glossary: they
 *    read, and a programme page or Home may mirror a week into `tasks` for
 *    somebody Publish has told.
 *
 * And at the eighth point, as the admin and the people drive a programme's
 * survey (src/lib/surveys/ and src/app/api/surveys/):
 *  - making it, and saving its words: the `surveys` document (the form's id
 *    on it as `roundId`), found by the form (`surveyIdsOf`);
 *  - "Send a test to me", of its email and of its reminder: the record of the
 *    test and the test's secret on the survey, and a send row to the admin
 *    about the survey (`referenceId`);
 *  - the send and Remind: one `surveyPeople` row a person, with their link's
 *    secret (`surveyId` on it), the press on the survey, the notices (`to ==`
 *    each person, about the survey) and the send counters
 *    (`surveyCounterIdsOf`);
 *  - an answer, by a person's link or signed in: one `surveyAnswers` row
 *    (`surveyId` on it), their row stamped, and their Kairos choice only when
 *    they changed its box (`kairosChoices`, by their uid);
 *  - a consent changed later: their row;
 *  - the download with names: one `dataExports` row (`scope.surveyId`);
 *  - Close it now: the survey document itself.
 */
export async function countTerm(state) {
  const counts = {};
  const { formId, runId } = state;
  // First, while they are there to be read: everything a survey's routes
  // write is found by the survey's id.
  const surveyIds = await surveyIdsOf(state);

  for (const [name, collection, id] of [
    ["admissionRounds", "admissionRounds", formId],
    ["courses", "courses", state.courseId],
    ["courseRuns", "courseRuns", runId],
  ]) {
    counts[name] = (await fixtureDoc(collection, id).get()).exists ? 1 : 0;
  }
  counts.questionSets = (await fixtureSubcollection("admissionRounds", formId, "questionSets").get()).size;
  counts.admissionApplications = (
    await fixtureQuery("admissionApplications").where("roundId", "==", formId).get()
  ).size;
  counts.admissionDecisions = (
    await fixtureQuery("admissionDecisions").where("roundId", "==", formId).get()
  ).size;

  // Each collection named where it is asked, so the index guard can read
  // every query: all of them are one equality on `runId`.
  counts.courseGroups = (await fixtureQuery("courseGroups").where("runId", "==", runId).get()).size;
  counts.courseApplications = (
    await fixtureQuery("courseApplications").where("runId", "==", runId).get()
  ).size;
  counts.courseEnrolments = (
    await fixtureQuery("courseEnrolments").where("runId", "==", runId).get()
  ).size;
  counts.courseAudit = (await fixtureQuery("courseAudit").where("runId", "==", runId).get()).size;
  counts.courseNudges = (await fixtureQuery("courseNudges").where("runId", "==", runId).get()).size;
  counts.courseProgress = (await fixtureQuery("courseProgress").where("runId", "==", runId).get()).size;
  counts.courseExerciseResponses = (
    await fixtureQuery("courseExerciseResponses").where("runId", "==", runId).get()
  ).size;
  counts.weeks = (await fixtureSubcollection("courseRuns", runId, "weeks").get()).size;
  counts.tasks = (await fixtureQuery("tasks").where("sourceRef.cohortId", "==", runId).get()).size;
  counts.subscriptions = (
    await fixtureQuery("subscriptions").where("channel", "==", state.channel).get()
  ).size;
  let events = 0;
  for (const id of subscriptionIdsOf(state)) {
    events += (await fixtureQuery("subscriptionEvents").where("subscriptionId", "==", id).get()).size;
  }
  counts.subscriptionEvents = events;
  counts.courseAttendance = (await fixtureQuery("courseAttendance").where("runId", "==", runId).get()).size;
  counts.courseUpdates = (await fixtureQuery("courseUpdates").where("runId", "==", runId).get()).size;
  counts.dataExports = (await fixtureQuery("dataExports").where("scope.runId", "==", runId).get()).size;
  counts.coursePitches = (await fixtureQuery("coursePitches").where("runId", "==", runId).get()).size;
  counts.courseTeams = (await fixtureQuery("courseTeams").where("runId", "==", runId).get()).size;
  // The end of a programme's: the rule for who finished and the lead's
  // decisions, and the certificates the send made.
  counts.courseFinishing = (await fixtureQuery("courseFinishing").where("runId", "==", runId).get()).size;
  counts.courseCertificates = (await fixtureQuery("courseCertificates").where("runId", "==", runId).get()).size;

  let counters = 0;
  for (const id of sendCounterIdsOf(state)) {
    if ((await fixtureDoc("courseNudges", id).get()).exists) counters += 1;
  }
  counts.sendCounters = counters;
  let markers = 0;
  for (const ref of reminderMarkersOf(state)) {
    if ((await ref.get()).exists) markers += 1;
  }
  counts.reminderMarkers = markers;

  // The eighth point's: the surveys, who each was sent to, the answers, the
  // download log's rows, the send counters, and any Kairos choice an answer kept.
  counts.surveys = surveyIds.length;
  let surveyPeople = 0;
  let surveyAnswers = 0;
  let surveyExports = 0;
  for (const id of surveyIds) {
    surveyPeople += (await fixtureQuery("surveyPeople").where("surveyId", "==", id).get()).size;
    surveyAnswers += (await fixtureQuery("surveyAnswers").where("surveyId", "==", id).get()).size;
    surveyExports += (await fixtureQuery("dataExports").where("scope.surveyId", "==", id).get()).size;
  }
  counts.surveyPeople = surveyPeople;
  counts.surveyAnswers = surveyAnswers;
  counts.surveyExports = surveyExports;
  let surveyCounters = 0;
  for (const id of surveyCounterIdsOf(state, surveyIds)) {
    if ((await fixtureDoc("courseNudges", id).get()).exists) surveyCounters += 1;
  }
  counts.surveyCounters = surveyCounters;
  let kairosChoices = 0;
  for (const account of accountsOf(state)) {
    if ((await fixtureDoc("kairosChoices", account.uid).get()).exists) kairosChoices += 1;
  }
  counts.kairosChoices = kairosChoices;

  let suppressionRows = 0;
  for (const id of state.suppressed ?? []) {
    if ((await fixtureDoc("suppressedEmails", id).get()).exists) suppressionRows += 1;
  }
  counts.suppressedEmails = suppressionRows;
  counts.emailSends = (await sendRowsOf(state, surveyIds)).size;

  const accounts = await countAccounts(accountsOf(state).map((account) => account.uid));
  counts.users = accounts.users;
  counts.authAccounts = accounts.authAccounts;

  counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
  counts.termRunId = state.termRunId;
  return counts;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/**
 * Removes everything, in the order that keeps a half-finished teardown
 * recoverable: the rows the routes wrote first, then the fixture's own
 * records, the send log last of the rows, then the accounts.
 */
export async function teardownTerm(state) {
  assertFixtureTarget();
  log(`Tearing down the term for run ${state.termRunId}.`);
  const failures = [];
  const accounts = accountsOf(state);

  // The namespace check FIRST, before a single delete: several sweeps below
  // are keyed on an address out of this state file, and a tampered or stale
  // ledger naming a real person must be refused before any of them runs.
  for (const account of accounts) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(
        `REFUSING to tear down ${account.email}: not a harness account. The state ` +
          "file names an address this fixture could not have created.",
      );
    }
  }
  const { formId, runId } = state;
  // Every survey made on the term's programme, read before anything is
  // deleted: the rows its routes wrote are found by its id.
  const surveyIds = await surveyIdsOf(state);

  // Rows the routes wrote. Event lines before the subscription rows they describe.
  for (const id of subscriptionIdsOf(state)) {
    await deleteQuery(fixtureQuery("subscriptionEvents").where("subscriptionId", "==", id));
    await fixtureDoc("subscriptions", id).delete();
  }
  await deleteQuery(fixtureQuery("subscriptions").where("channel", "==", state.channel));
  await deleteQuery(fixtureQuery("courseNudges").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseAudit").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseEnrolments").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseApplications").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseProgress").where("runId", "==", runId));
  // The seventh point's: the reflection boxes written in on a week page.
  await deleteQuery(fixtureQuery("courseExerciseResponses").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("tasks").where("sourceRef.cohortId", "==", runId));
  // The second point's: registers and updates (seeded and posted alike), the
  // download log's row, the updates route's counters, Remind's markers.
  await deleteQuery(fixtureQuery("courseAttendance").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseUpdates").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("dataExports").where("scope.runId", "==", runId));
  // The fourth point's: the pitches (with the picks on them) and the teams.
  await deleteQuery(fixtureQuery("coursePitches").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseTeams").where("runId", "==", runId));
  // The end of a programme's: the rule for who finished, the lead's
  // decisions, and the certificates (with the owners' links on them).
  await deleteQuery(fixtureQuery("courseFinishing").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseCertificates").where("runId", "==", runId));

  for (const id of sendCounterIdsOf(state)) await fixtureDoc("courseNudges", id).delete();
  for (const ref of reminderMarkersOf(state)) await ref.delete();
  // The eighth point's: each survey's answers, who it was sent to (with
  // their links), the download log's rows and the send counters. The surveys
  // themselves go after the send log, below.
  for (const id of surveyIds) {
    await deleteQuery(fixtureQuery("surveyAnswers").where("surveyId", "==", id));
    await deleteQuery(fixtureQuery("surveyPeople").where("surveyId", "==", id));
    await deleteQuery(fixtureQuery("dataExports").where("scope.surveyId", "==", id));
  }
  for (const id of surveyCounterIdsOf(state, surveyIds)) await fixtureDoc("courseNudges", id).delete();
  // Each account's Kairos choice, by its uid: an answer keeps one only when its box was changed.
  for (const account of accounts) await fixtureDoc("kairosChoices", account.uid).delete();

  // The fixture's own records.
  await deleteQuery(fixtureQuery("admissionDecisions").where("roundId", "==", formId));
  await deleteQuery(fixtureQuery("admissionApplications").where("roundId", "==", formId));
  const sets = await fixtureSubcollection("admissionRounds", formId, "questionSets").get();
  for (const doc of sets.docs) await doc.ref.delete();
  await fixtureDoc("admissionRounds", formId).delete();
  await deleteQuery(fixtureQuery("courseGroups").where("runId", "==", runId));
  for (const group of state.groups ?? []) await fixtureDoc("courseGroups", group.id).delete();
  const weeks = await fixtureSubcollection("courseRuns", runId, "weeks").get();
  for (const doc of weeks.docs) await doc.ref.delete();
  await fixtureDoc("courseRuns", runId).delete();
  await fixtureDoc("courses", state.courseId).delete();

  for (const id of state.suppressed ?? []) {
    await fixtureDoc("suppressedEmails", id).delete();
  }

  // The send log LAST of the rows: a send is logged a moment after its
  // message leaves, so the later this runs the smaller the window for a row
  // to land behind it.
  for (const ref of (await sendRowsOf(state, surveyIds)).values()) await ref.delete();
  // Then the surveys, the last record anything above was found by.
  for (const id of surveyIds) await fixtureDoc("surveys", id).delete();

  for (const account of accounts) {
    // The users document first: an Auth account whose document outlives it is
    // a ghost row in the admin members list. Both deletes resolve the account
    // BY UID and re-check the namespace on the address Auth returns. An
    // approved account's document says `member` by then, because the
    // Approvals page put it there; the delete never reads the role.
    try {
      await deleteHarnessUserDoc(account.uid);
      await deleteHarnessUser(account.uid);
    } catch (err) {
      failures.push(`${account.uid}: ${err.message}`);
      log(`Could not tear down ${account.uid}: ${err.message}`);
    }
  }

  const counts = await countTerm(state);
  if (failures.length > 0) {
    counts.teardownFailures = failures;
    counts.total += failures.length;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Two points at once
// ---------------------------------------------------------------------------

/**
 * The letter each term after the first adds to the runner's run id: the
 * second term is `<runId>b`, the third `<runId>c`. A letter, so an account's
 * harness id (`f<termRunId><index>`) can never be one of the first term's.
 */
const LATER_TERM_LETTERS = "bcdefgh";

/**
 * Every term a two-point state holds, the ones the seed never reached left
 * out. A state of any other shape is refused: counted or torn down as if it
 * held no term, it would read zero by looking nowhere.
 */
function termsOf(state) {
  if (!Array.isArray(state?.terms)) {
    throw new Error(
      "REFUSING to count or tear down a state seedTerms did not make: it holds no list of terms. " +
        "A single term's state is countTerm's and teardownTerm's.",
    );
  }
  return state.terms.filter(Boolean);
}

/**
 * Seeds the term at each of `points`, in order, each as a term of its own
 * (see "Two points at once" in the module header), and returns
 * `{ termRunId, terms }` with the terms in the order asked for.
 *
 * The state is published (`onState`) before anything is written, and each
 * term's own state goes into it before that term's first write, so a seed
 * that stops part way leaves a ledger naming everything any term had made.
 */
export async function seedTerms({ runId: termRunId, suppress = true, onState, points } = {}) {
  if (!Array.isArray(points) || points.length === 0 || points.length > LATER_TERM_LETTERS.length + 1) {
    throw new Error(`Ask for between 1 and ${LATER_TERM_LETTERS.length + 1} points, in order.`);
  }
  const state = { termRunId, points: [...points], terms: points.map(() => null) };
  onState?.(state);
  for (const [index, point] of points.entries()) {
    const ownRunId = index === 0 ? termRunId : `${termRunId}${LATER_TERM_LETTERS[index - 1]}`;
    await seedTerm({
      runId: ownRunId,
      suppress,
      point,
      onState: (published) => {
        state.terms[index] = published;
      },
    });
  }
  return state;
}

/**
 * Several manifests as one: each count added up, every term's run id listed,
 * and every teardown failure kept. Zero only when every term's is.
 */
function addCounts(list) {
  const counts = {};
  let total = 0;
  for (const one of list) {
    for (const [key, value] of Object.entries(one)) {
      if (key === "termRunId") continue;
      if (key === "total") {
        total += value;
        continue;
      }
      if (key === "teardownFailures") {
        counts.teardownFailures = [...(counts.teardownFailures ?? []), ...value];
        continue;
      }
      counts[key] = (counts[key] ?? 0) + value;
    }
  }
  counts.total = total;
  counts.termRunIds = list.map((one) => one.termRunId);
  return counts;
}

/** Every row of every term a two-point state holds, counted as `countTerm` counts one. */
export async function countTerms(state) {
  const list = [];
  for (const term of termsOf(state)) list.push(await countTerm(term));
  return addCounts(list);
}

/**
 * Tears every term down, each with `teardownTerm` (which checks every
 * address it holds before it deletes anything), and every one even when an
 * earlier one throws: the first error is thrown once they have all been
 * tried, so a teardown that fails for one term still drains the others.
 */
export async function teardownTerms(state) {
  const list = [];
  let failed = null;
  for (const term of termsOf(state)) {
    try {
      list.push(await teardownTerm(term));
    } catch (err) {
      failed ??= err;
    }
  }
  if (failed) throw failed;
  return addCounts(list);
}

// ---------------------------------------------------------------------------
// The check-in at the end of a session: a session under way when the seed runs
// ---------------------------------------------------------------------------

/**
 * A group plan's `startTimeLocal` that means "half an hour before the seed",
 * worked out when the seed runs (`underWayClock`), so the group's session that
 * day is under way while a spec runs.
 */
export const SESSION_UNDER_WAY = "under-way";

/**
 * The London wall clock half an hour before `now`, on five minutes, and never
 * before midnight: a seed at 00:10 has a session that started at 00:00 that
 * day. A ninety-minute session started then is under way for an hour at
 * least, and its check-in stays open until 11pm, or an hour after it ends
 * when that is later.
 */
export function underWayClock(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const minutes = Math.max(0, Number(parts.hour) * 60 + Number(parts.minute) - 30);
  const floored = minutes - (minutes % 5);
  return `${String(Math.floor(floored / 60)).padStart(2, "0")}:${String(floored % 60).padStart(2, "0")}`;
}

/**
 * THE CHECK-IN AT THE END OF A SESSION ("check-in"). The fellowship three
 * weeks in, with one group of five, every one of them in it, which meets on
 * the run's second day each week and whose week 3 session started half an
 * hour before the seed (`SESSION_UNDER_WAY`): the run began `daysIn` days
 * before the seed, so the seed's day is day 15 of the plan, week 3's session
 * day. Five, so its facilitator's totals have three answers to show without
 * everybody answering. Weeks 1 to 3 are published and written as blocks
 * (`courseworkWeekDoc`), so the check-in asks what was unclear by the week's
 * parts and how much of the reading people did; weeks 1 and 2's registers are
 * finished, everybody present, and week 3's is not opened. Fern is the account
 * the admin appoints to the group on the real page. Nobody leads the
 * programme, so the check-in's box names no lead.
 */
export const CHECK_IN_DAY = Object.freeze({
  daysIn: 15,
  programme: FELLOWSHIP,
  groups: Object.freeze([
    Object.freeze({ key: "A", name: "Group A", dayAfterStart: 1, startTimeLocal: SESSION_UNDER_WAY, room: "Room E1", online: false }),
  ]),
  people: Object.freeze(
    ["ada", "ben", "cleo", "dan", "eve"].map((key) => Object.freeze({ key, first: key[0].toUpperCase() + key.slice(1), canMake: Object.freeze(["A"]) })),
  ),
  facilitator: FACILITATOR_PLAN,
  places: Object.freeze({ ada: "A", ben: "A", cleo: "A", dan: "A", eve: "A" }),
  marks: Object.freeze({ A: Object.freeze({ 1: ALL_FIVE_PRESENT, 2: ALL_FIVE_PRESENT }) }),
  unfinished: null,
  facilitated: "A",
  published: 3,
  blockWeeks: true,
  earlierUpdate: false,
});

// ---------------------------------------------------------------------------
// The end of a programme: its last week, and after its last session
// ---------------------------------------------------------------------------

/**
 * When the last week's group meets: late enough in the evening that its last
 * session, on the seed's own day, is still to come at any hour a run is
 * seeded before it, and "Tonight" (the site says so of a session from 5pm).
 * It ends half an hour after midnight.
 */
export const LAST_SESSION_CLOCK = "23:00";

/** A week Ada came to, at the last week. */
const ADA_CAME = Object.freeze({ ada: "present" });

/**
 * THE FELLOWSHIP IN ITS LAST WEEK, ITS LAST SESSION TONIGHT ("last-week").
 * Its one group meets on the run's second day each week, at
 * `LAST_SESSION_CLOCK`, and the run began `daysIn` days before the seed, so
 * the group's sixth and last session is on the seed's own day (day 36 of the
 * plan), still to come: a member's Home says it is tonight. A run that
 * crosses midnight is still in week 6 (day 37), with that session the day
 * before, until it ends.
 *
 * Ada is in the group, told by Publish before the start, and came to each of
 * weeks 1 to 5, whose registers are finished; every week is published. Fern
 * is the account the admin appoints to the group on the real page, so the
 * survey at the end's card can say who steps out. Nobody leads the programme.
 */
export const LAST_WEEK = Object.freeze({
  daysIn: 36,
  programme: FELLOWSHIP,
  groups: Object.freeze([
    Object.freeze({
      key: "A",
      name: "Group A",
      dayAfterStart: 1,
      startTimeLocal: LAST_SESSION_CLOCK,
      room: "Room E1",
      online: false,
    }),
  ]),
  people: Object.freeze([PEOPLE_PLAN[0]]),
  facilitator: FACILITATOR_PLAN,
  places: Object.freeze({ ada: "A" }),
  marks: Object.freeze({ A: Object.freeze({ 1: ADA_CAME, 2: ADA_CAME, 3: ADA_CAME, 4: ADA_CAME, 5: ADA_CAME }) }),
  unfinished: null,
  facilitated: "A",
  published: WEEK_COUNT,
});

/**
 * THE FELLOWSHIP PAST ITS RUN'S LAST SESSION, WITH SOMEBODY WHO LEFT
 * ("programme-over"). Its run began `daysIn` days before the seed, as the
 * sixth point's did, so both groups' sixth and last sessions were over a
 * week before the seed: who finished has opened, and stays open across
 * midnight. Every register of the six weeks is finished and every week
 * published.
 *
 * Group A: Ada came to all six (one late); Dan came to weeks 1 and 2 and
 * then left (`left`: the day after Group A's week 2 session). Group B: Cleo
 * came to three (excused in week 2), and Eve came to three. So a rule of at
 * least 4 ticks Ada alone, and the lead decides about anybody else. Fern is
 * the account the admin appoints to Group A on the real page. Nobody leads
 * the programme.
 */
export const PROGRAMME_OVER = Object.freeze({
  daysIn: AFTER_THE_END.daysIn,
  programme: FELLOWSHIP,
  groups: GROUP_PLAN,
  people: Object.freeze([
    PEOPLE_PLAN[0],
    PEOPLE_PLAN[2],
    WEEK_FOUR.people[3],
    Object.freeze({ key: "eve", first: "Eve", canMake: Object.freeze(["B"]) }),
  ]),
  facilitator: FACILITATOR_PLAN,
  places: Object.freeze({ ada: "A", cleo: "B", dan: "A", eve: "B" }),
  marks: Object.freeze({
    A: Object.freeze({
      1: Object.freeze({ ada: "present", dan: "present" }),
      2: Object.freeze({ ada: "present", dan: "present" }),
      3: Object.freeze({ ada: "present" }),
      4: Object.freeze({ ada: "present" }),
      5: Object.freeze({ ada: "late" }),
      6: Object.freeze({ ada: "present" }),
    }),
    B: Object.freeze({
      1: Object.freeze({ cleo: "present", eve: "present" }),
      2: Object.freeze({ cleo: "excused", eve: "absent" }),
      3: Object.freeze({ cleo: "present", eve: "present" }),
      4: Object.freeze({ cleo: "absent", eve: "absent" }),
      5: Object.freeze({ cleo: "absent", eve: "present" }),
      6: Object.freeze({ cleo: "present", eve: "absent" }),
    }),
  }),
  left: Object.freeze({ dan: Object.freeze({ afterWeek: 2 }) }),
  unfinished: null,
  facilitated: "A",
  published: WEEK_COUNT,
});

/**
 * Everybody a plan says left (`left`), as leaving left them
 * (src/lib/courses/leaveRun.ts, and `givePlaceBack` in
 * src/lib/applications/status/record.ts, restated): their seat withdrawn with
 * the day and no reason, its group and Publish's stamp kept, and their tally
 * of the weeks before they went; their group one person smaller; their
 * application withdrawn, "I can’t make it", with no reason; the form's counts
 * moved; and their cohort row unsubscribed.
 *
 * Each left at noon the day after their group's session of the week the plan
 * names, so every register up to it marks them and none after it does. The
 * moment is written onto the person in the state, for a spec to read.
 */
async function seedLeavers(state, plan) {
  const leavers = state.people.filter((person) => plan.left[person.key]);
  for (const person of leavers) {
    const group = state.groups.find((each) => each.key === person.groupKey);
    const { afterWeek } = plan.left[person.key];
    const lastSession = sessionOf(group, afterWeek);
    const leftAt = londonWallClockToInstant(shiftDateKey(lastSession.dateKey, 1), "12:00");
    person.leftAt = leftAt.toISOString();
    // Their tally, from their group's registers up to the week they left: the
    // finishing press of that week was the last to count them.
    const marksBefore = Object.fromEntries(
      Object.entries(plan.marks[group.key] ?? {}).filter(([week]) => Number(week) <= afterWeek),
    );
    const tallied = new Date(lastSession.endsAt.getTime() + 30 * 60_000);
    await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).update({
      status: "withdrawn",
      droppedOutAt: leftAt,
      dropOutReason: null,
      attendance: rollupFor({ ...plan, marks: { ...plan.marks, [group.key]: marksBefore } }, person, tallied),
      updatedAt: leftAt,
    });
    await fixtureDoc("admissionApplications", `${state.formId}__${person.uid}`).update({
      status: "withdrawn",
      withdrawnAt: leftAt,
      attendance: { answer: "cant-make-it", answeredAt: leftAt },
      updatedAt: leftAt,
    });
    await fixtureDoc("subscriptions", subscriptionId(person.email, state.channel)).update({
      subscribed: false,
      unsubscribedAt: leftAt,
    });
  }
  for (const group of state.groups) {
    await fixtureDoc("courseGroups", group.id).update({
      memberCount: state.people.filter((person) => person.groupKey === group.key && !plan.left[person.key]).length,
    });
  }
  await fixtureDoc("admissionRounds", state.formId).update({
    "applicationCounts.accepted": state.people.length - leavers.length,
    "applicationCounts.withdrawn": leavers.length,
  });
}
