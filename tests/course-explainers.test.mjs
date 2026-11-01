/**
 * EXPLAINERS, scheduled from a week's review (the week review's plan,
 * clashes 14 to 19), driven through their real page, routes, tickets and
 * emails on AGI Strategy's run in its third week.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is `tests/lib/facilitatorWeekWorld.mjs` (Group A on Thursdays at
 * 6pm in Portland A13 with Sofia, Group B on Tuesdays at 6pm in Hallward B12
 * with Rahul and Sofia, Group C on Wednesdays at 1pm in Room B8 with Tom,
 * Group D on Mondays at 6pm in Room D4 with Grace; Amara in Group A, Chloe in
 * Group B; Claudia leads the programme, Lloyd reviews it, Nadia is on the
 * committee and named on nothing, Zach is an admin).
 *
 * THE CLOCK is Wed 18 Nov 2026 at 10am: Groups A, D and B have met for week
 * 3, so each group's next session is Group C's week 3 today at 1pm, then
 * Group A's week 4 on Thu 19 Nov, Group D's on Mon 23 Nov and Group B's on
 * Tue 24 Nov, each at 6pm but Group C's.
 *
 * Every name, address and word is made up. The mail door and the push mirror
 * record and send nothing.
 *
 * What is held, by section:
 *  1. The words: a topic in a sentence, every line a ticket, an email or a
 *     task says, within its limits, and the house's rules.
 *  2. The model: each group's next session that meets, a cancelled week, a
 *     session moved for one week, a group with no time; what a request may
 *     ask for.
 *  3. The page: an admin's alone; the lead is told it is the admins'; a
 *     theme's title, its groups and where it came from to start from; a
 *     typed topic without one.
 *  4. Scheduling: every caller and view-as; who may explain is read on the
 *     server; each session must be its group's next; one explainer to a
 *     session; one record, a task per session, ONE email on the tasks row.
 *  5. The tickets: each group's facilitators and its members, and nobody
 *     else's; Home's; "Week N is open" while it has not gone.
 *  6. The lead: the week's page and nothing of the review.
 *  7. Cancel: an admin's; the tasks closed, every ticket cleared, nobody
 *     emailed.
 *  8. Deletion: an account's id comes off an explainer; the run's destroy
 *     takes the explainers and their tasks.
 */
import { after, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { C, D, makeFacilitatorPagesWorld, textOf } from "./lib/facilitatorPagesWorld.mjs";
import { A, AGI, B, NOW, ROUND, RUN, facilitatorWeekSeed } from "./lib/facilitatorWeekWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
after(() => mock.timers.reset());

const PUSH_STUB = "export async function mirrorTaskEmailToPush(uid, note) { globalThis.__ex.pushes.push({ uid, ...note }); }";

const w = await makeFacilitatorPagesWorld("__ex", [["@/lib/push/taskNotifications", PUSH_STUB]]);
const PROGRAMME_API = ["admissions", "forms", "[roundId]", "programmes", "[programmeId]"];
const routes = {
  schedule: await w.loadTs(join("app", "api", ...PROGRAMME_API, "weeks", "[weekId]", "explainers", "route.ts")),
  cancel: await w.loadTs(join("app", "api", ...PROGRAMME_API, "explainers", "[explainerId]", "route.ts")),
};
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const pages = {
  explainer: (await w.loadTs(join(TABS, "weeks", "[weekId]", "review", "explainer", "page.tsx"))).default,
  review: (await w.loadTs(join(TABS, "weeks", "[weekId]", "review", "page.tsx"))).default,
  week: (await w.loadTs(join(TABS, "weeks", "[weekId]", "page.tsx"))).default,
};
const words = await w.loadTs(join("lib", "courses", "explainers", "words.ts"));
const model = await w.loadTs(join("lib", "courses", "explainers", "model.ts"));
const record = await w.loadTs(join("lib", "firestore", "courseExplainers.ts"));
const sessionsLib = await w.loadTs(join("lib", "courses", "sessions.ts"));
const weekEmails = await w.loadTs(join("lib", "courses", "weekEmails", "words.ts"));
const nextWeek = await w.loadTs(join("lib", "courses", "nextWeekEmail.ts"));
const firestoreCourses = await w.loadTs(join("lib", "firestore", "courses.ts"));
const firestoreGroups = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { default: ExplainerEmail } = await w.loadTs(join("emails", "ExplainerEmail.tsx"));

/** Wed 18 Nov at 10am: Groups A, D and B have met for week 3. */
const WEDNESDAY = "2026-11-18T10:00:00Z";
const params = { roundId: ROUND, programmeId: AGI, weekId: "w03" };
const SESSIONS = {
  C: { groupId: C, sessionKey: "w03" },
  A: { groupId: A, sessionKey: "w04" },
  D: { groupId: D, sessionKey: "w04" },
  B: { groupId: B, sessionKey: "w04" },
};
const TOPIC = "Who pays for the lamps";
/** What Claude said of week 3, kept with the run, as the review keeps it. */
const THEME_DETAIL = "Mixed up the harbour board and the town in two groups.";

function storedReview() {
  return {
    runId: RUN.agi,
    weekId: "w03",
    weekNumber: 3,
    grades: null,
    hands: null,
    themes: {
      state: "ready",
      at: new Date("2026-11-18T09:00:00Z"),
      askedByUid: "zach",
      model: "claude-opus-5-5",
      fingerprint: "f",
      sent: { answers: 2, reflections: 0, checkIns: 3, reports: 1 },
      groupLabels: { "Group 1": A, "Group 2": B },
      list: [
        {
          title: "Who pays for the lamps, in Group 1",
          partId: null,
          groupIds: [A, B],
          answers: [{ uid: "amara", rowId: "r1" }],
          checkIns: 3,
          reports: 1,
          detail: THEME_DETAIL,
        },
      ],
    },
    uids: ["amara"],
  };
}

/** The world for every test here, with `over` laid on top. */
function seed(over = {}) {
  const s = facilitatorWeekSeed();
  s[`courseWeekReviews/${RUN.agi}__w03`] = storedReview();
  return { ...s, ...over };
}

/** Start again from the seed at Wednesday 10am. */
function reset(over = {}, when = WEDNESDAY) {
  w.reset(seed(over));
  w.at(when);
  w.world.pushes = [];
}

/** A page as `who`. */
const draw = (page, who, ps = params, searchParams = {}) => w.draw(page, who, ps, searchParams);

/** The press, as `who`. */
const schedule = (who, body, options = {}) => w.call(who, routes.schedule.POST, params, { body, ...options });
/** Cancel, as `who`. */
const cancel = (who, explainerId, options = {}) =>
  w.call(who, routes.cancel.DELETE, { roundId: ROUND, programmeId: AGI, explainerId }, options);

/** A body for the press, Nadia explaining at Groups A's and D's next sessions unless said. */
const body = (over = {}) => ({
  topic: TOPIC,
  explainerUid: "nadia",
  minutes: 10,
  sessions: [SESSIONS.A, SESSIONS.D],
  ...over,
});

const explainerPaths = () => w.world.db.paths().filter((path) => path.startsWith("courseExplainers/"));
const taskPaths = () => w.world.db.paths().filter((path) => path.startsWith("tasks/explainer__"));

/** Every element below `element` whose component is called `name`, by its props, through server components. */
function findProps(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) findProps(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element.props);
  if (typeof element.type === "function" && !["ExplainerForm", "CancelExplainer", "ReviewPress", "FollowUpButton", "PangramWeek"].includes(element.type.name)) {
    try {
      findProps(element.type(element.props), name, out);
    } catch {
      // A component that needs a hook runs only in a browser.
    }
  }
  const children = element.props?.children;
  if (children !== undefined) findProps(children, name, out);
  return out;
}

// ---------------------------------------------------------------------------
// 1. The words
// ---------------------------------------------------------------------------

describe("1. the words", () => {
  test("a topic reads as part of a sentence: lower case after an ordinary capital, acronyms kept, one line, no full stop of its own", () => {
    assert.equal(words.topicInSentence("Compute as a lever for governance"), "compute as a lever for governance");
    assert.equal(words.topicInSentence("RLHF and its limits"), "RLHF and its limits");
    assert.equal(words.topicInSentence("AI governance"), "AI governance");
    assert.equal(words.topicInSentence("  Who pays\n for   the lamps.  "), "who pays for the lamps");
    assert.equal(words.topicAsTitle("who pays for the lamps"), "Who pays for the lamps");
  });

  test("the tickets, the email line and the Overview, word for word", () => {
    assert.equal(
      words.facilitatorLineWords(10, "Compute as a lever for governance", "Maya"),
      "10 minutes on compute as a lever for governance, by Maya. Then the week as planned.",
    );
    assert.equal(words.facilitatorLineWords(5, "Who pays", null), "5 minutes on who pays. Then the week as planned.");
    assert.equal(words.scheduledByWords("Zach", 3), "Scheduled by Zach from the week 3 review.");
    assert.equal(words.scheduledByWords(null, 3), "Scheduled from the week 3 review.");
    assert.equal(
      words.memberLineWords(10, "Compute as a lever for governance"),
      "Your session starts with a 10-minute explainer on compute as a lever for governance.",
    );
    assert.equal(words.overviewExplainersWords(3, 1, 4), "The week 3 review has an explainer booked for four groups.");
    assert.equal(words.overviewExplainersWords(3, 2, 1), "The week 3 review has two explainers booked for one group.");
    assert.equal(words.EXPLAINER_WORDS.schedule(4), "Schedule for 4 groups");
    assert.equal(words.EXPLAINER_WORDS.schedule(1), "Schedule for 1 group");
    assert.equal(
      words.EXPLAINER_WORDS.gets("Maya"),
      "Maya gets a task for each session, and an email if their task emails are on.",
    );
    assert.equal(
      words.sessionChoiceWords("Group C", 4, new Date("2026-11-25T15:00:00Z")),
      "Group C, week 4: Wed 25 Nov, 3pm",
    );
  });

  test("a task's title keeps its group and time whatever the topic's length, within 120 characters", () => {
    const at = new Date("2026-11-25T15:00:00Z");
    assert.equal(
      words.explainerTaskTitle("Compute as a lever for governance", "Group C", at, 120),
      "Explain compute as a lever for governance: Group C, Wed 25 Nov, 3pm",
    );
    const long = words.explainerTaskTitle("A".repeat(10) + " " + "b".repeat(120), "Group C", at, 120);
    assert.ok(long.length <= 120, long);
    assert.match(long, /…: Group C, Wed 25 Nov, 3pm$/);
  });

  test("the task and the email say the day, the time and the room, never a link to join; online says to ask the facilitators", () => {
    const description = words.explainerTaskDescription({
      askedBy: "Zach Levin",
      minutes: 10,
      topic: TOPIC,
      groupName: "Group A",
      weekNumber: 4,
      programme: "AGI Strategy",
      at: new Date("2026-11-19T18:00:00Z"),
      where: "Portland A13",
    });
    assert.match(description, /^Zach Levin asked you to give a 10-minute explainer on who pays for the lamps at the start of Group A’s week 4 session of AGI Strategy\./);
    assert.match(description, /When: Thu 19 Nov, 6pm\nWhere: Portland A13/);
    const online = words.explainerTaskDescription({
      askedBy: "Zach",
      minutes: 5,
      topic: TOPIC,
      groupName: "Group A",
      weekNumber: 4,
      programme: "",
      at: null,
      where: "Online",
    });
    assert.match(online, /Where: online\. Ask the group’s facilitators for the link to join\./);
    const email = words.explainerEmailWords({
      firstName: "Nadia",
      askedBy: "Zach Levin",
      minutes: 10,
      topic: TOPIC,
      programme: "AGI Strategy",
      sessions: [
        { groupName: "Group A", weekNumber: 4, at: new Date("2026-11-19T18:00:00Z"), where: "Portland A13" },
        { groupName: "Group D", weekNumber: 4, at: new Date("2026-11-23T18:00:00Z"), where: "Online" },
      ],
      link: "https://naisi.uk/tasks",
    });
    assert.equal(email.subject, "A 10-minute explainer on who pays for the lamps");
    assert.equal(email.greeting, "Hi Nadia,");
    assert.equal(email.lead, "Zach Levin asked you to give a 10-minute explainer on who pays for the lamps at the start of these two sessions of AGI Strategy:");
    assert.deepEqual(email.sessions, ["Group A, week 4: Thu 19 Nov, 6pm, Portland A13", "Group D, week 4: Mon 23 Nov, 6pm, online"]);
    assert.ok(email.after.includes("For a session held online, ask its facilitators for the link to join."));
    const html = renderToStaticMarkup(createElement(ExplainerEmail, { words: email }));
    assert.match(textOf(html), /Group D, week 4: Mon 23 Nov, 6pm, online/);
    assert.match(html, /href="https:\/\/naisi\.uk\/tasks"/);
    assert.doesNotMatch(html, /meet\.|zoom|teams\.microsoft/i);
  });

  test("no dash of either kind, no gendered pronoun and no word the house does not use in what a person reads", () => {
    // Each function is asked with numbers first, then with words first when it wants a topic or a name,
    // then with a list of groups.
    const asked = (fn) => {
      for (const args of [[3, "Maya", 2], ["Maya", 3, 2], [["Group A", "Group B"]]]) {
        try {
          return fn(...args);
        } catch {
          // Not what it takes: the next.
        }
      }
      throw new Error(`${fn.name} takes none of the arguments this test asks with`);
    };
    const said = JSON.stringify(
      { ...words.EXPLAINER_WORDS, ...words.REVIEW_EXPLAINER_WORDS, ...words.WEEK_EXPLAINER_WORDS },
      (_, value) => (typeof value === "function" ? asked(value) : value),
    );
    assert.doesNotMatch(said, /[–—]/);
    assert.doesNotMatch(said, /\b(?:he|she|him|her|his|hers)\b/i);
    assert.doesNotMatch(said, /\b(?:mark|grade|score|collate)\b/i);
  });
});

// ---------------------------------------------------------------------------
// 2. The model
// ---------------------------------------------------------------------------

describe("2. each group's next session that meets", () => {
  const run = () => firestoreCourses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
  const group = (id) => firestoreGroups.normalizeCourseGroup(id, w.world.db.read(`courseGroups/${id}`));
  const nextOf = (id) => model.nextMeeting(sessionsLib.resolveSessions(run(), group(id)), new Date());

  test("the soonest session not started and not cancelled, at its own day and time", () => {
    reset();
    const next = nextOf(A);
    assert.equal(next.session.sessionKey, "w04");
    assert.equal(next.startsAt.toISOString(), "2026-11-19T18:00:00.000Z");
    // Group C's week 3 is later today: still to start, so it is the next.
    assert.equal(nextOf(C).session.sessionKey, "w03");
  });

  test("a cancelled week is passed over, a session moved for one week is at its new time, and a group with no time has none", () => {
    reset();
    // "Change a session": Thu 19 Nov's cancelled, the group keeping pace.
    w.world.db.poke(`courseGroups/${A}`, {
      "sessionChanges.w04": { kind: "cancelled", reason: "Reading week", dateKey: "2026-11-19", byUid: "sofia", at: new Date("2026-11-10T09:00:00Z") },
    });
    const cancelled = nextOf(A);
    assert.equal(cancelled.session.sessionKey, "w05", "a cancelled session was offered");
    assert.equal(cancelled.startsAt.toISOString(), "2026-11-26T18:00:00.000Z");
    reset();
    w.world.db.poke(`courseGroups/${A}`, { "sessionOverrides.w04": { weekday: 5, startTimeLocal: "14:00", durationMinutes: 60, location: "Room X1", meetingUrl: null, notes: "" } });
    const moved = nextOf(A);
    assert.equal(moved.session.sessionKey, "w04");
    assert.equal(moved.startsAt.toISOString(), "2026-11-20T14:00:00.000Z");
    reset();
    w.world.db.poke(`courseGroups/${C}`, { "session.startTimeLocal": "" });
    const { choices, undated } = model.sessionChoices(
      [A, C].map((id) => ({ id, name: group(id).name, sessions: sessionsLib.resolveSessions(run(), group(id)) })),
      [],
      new Date(),
    );
    assert.deepEqual(choices.map((choice) => choice.label), ["Group A, week 4: Thu 19 Nov, 6pm"]);
    assert.deepEqual(undated, ["Group C"]);
  });

  test("a request is read before anything is looked up: a topic within 120 characters on one line, a length, somebody, each group once", () => {
    assert.equal(model.readScheduleAsk(body()).ok, true);
    assert.equal(model.readScheduleAsk(body({ topic: "  Who  pays\nfor it " })).ask.topic, "Who pays for it");
    for (const bad of [
      null,
      {},
      body({ topic: "" }),
      body({ topic: "x".repeat(121) }),
      body({ minutes: 7 }),
      body({ minutes: "10" }),
      body({ explainerUid: "" }),
      body({ explainerUid: "a/b" }),
      body({ sessions: [] }),
      body({ sessions: "A" }),
      body({ sessions: [{ groupId: A, sessionKey: "week4" }] }),
      body({ sessions: [SESSIONS.A, { ...SESSIONS.A }] }),
    ]) {
      assert.equal(model.readScheduleAsk(bad).ok, false, JSON.stringify(bad));
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The page
// ---------------------------------------------------------------------------

describe("3. the page: an admin's alone", () => {
  test("opened from a theme: its title to start from, its groups ticked, where it came from, and each group's next session", async () => {
    reset();
    const drawn = await draw(pages.explainer, "zach", params, { theme: "0" });
    assert.equal(drawn.to, null);
    assert.equal(drawn.wrote, false, "drawing the page wrote something");
    const [form] = findProps(drawn.element, "ExplainerForm");
    assert.ok(form, drawn.text);
    assert.equal(form.topic, "Who pays for the lamps, in Group A");
    assert.equal(form.from, "1 answer, 3 check-ins and 1 facilitator report, from Group A and Group B");
    assert.deepEqual(
      form.choices.map((choice) => [choice.label, choice.ticked]),
      [
        ["Group C, week 3: Wed 18 Nov, 1pm", false],
        ["Group A, week 4: Thu 19 Nov, 6pm", true],
        ["Group D, week 4: Mon 23 Nov, 6pm", false],
        ["Group B, week 4: Tue 24 Nov, 6pm", true],
      ],
    );
    // Who may explain: the committee, then admins, by the name an admin sees.
    assert.deepEqual(
      form.people.map((person) => [person.uid, person.role]),
      [["claudia", "committee"], ["lloyd", "committee"], ["nadia", "committee"], ["tess", "committee"], ["yusuf", "committee"], ["zach", "admin"]],
    );
    assert.equal(form.people.find((person) => person.uid === "nadia").name, "Nadia Hassan");
    assert.match(drawn.text, /AGI Strategy \/ Weeks \/ Week 3 review Schedule an explainer/);
  });

  test("a typed topic: nothing ticked, nothing from a review, and a review need not exist", async () => {
    reset();
    w.world.db.collection("courseWeekReviews").doc(`${RUN.agi}__w03`).delete();
    const drawn = await draw(pages.explainer, "zach");
    const [form] = findProps(drawn.element, "ExplainerForm");
    assert.equal(form.topic, "");
    assert.equal(form.from, null);
    assert.ok(form.choices.every((choice) => !choice.ticked));
    // A theme the review does not hold is a typed topic too.
    reset();
    const missing = findProps((await draw(pages.explainer, "zach", params, { theme: "7" })).element, "ExplainerForm")[0];
    assert.equal(missing.topic, "");
  });

  test("the lead is told a week's review is for admins and nothing is read; a reviewer and anybody else reach nothing", async () => {
    reset();
    const lead = await draw(pages.explainer, "claudia", params, { theme: "0" });
    assert.match(lead.text, /A week’s review is for admins/);
    assert.doesNotMatch(lead.text, /Who pays|Group A|Schedule/);
    for (const who of ["lloyd", "rahul", "amara", "tess"]) {
      const drawn = await draw(pages.explainer, who, params, { theme: "0" });
      assert.equal(findProps(drawn.element, "ExplainerForm").length, 0, `${who} reached the form`);
      assert.doesNotMatch(drawn.text, /Who pays|1 answer/, who);
    }
  });

  test("before the week's first session it says when, and offers nothing", async () => {
    reset({}, "2026-11-11T10:00:00Z");
    const drawn = await draw(pages.explainer, "zach");
    assert.match(drawn.text, /Week 3 can be reviewed once its first session has started/);
    assert.equal(findProps(drawn.element, "ExplainerForm").length, 0);
  });

  test("the review offers it from each theme and with a typed topic, and lists what was scheduled", async () => {
    reset();
    const before = await draw(pages.review, "zach");
    assert.ok(before.html.includes('/weeks/w03/review/explainer?theme=0"'), "no way in from the theme");
    assert.ok(before.html.includes('/weeks/w03/review/explainer"'), "no way in with a typed topic");
    assert.match(before.text, /Explainers None scheduled from this review yet\./);
    assert.equal((await schedule("zach", body())).status, 200);
    const after = await draw(pages.review, "zach");
    assert.match(after.text, /Who pays for the lamps 10 minutes, by Nadia Hassan Group A, week 4: Thu 19 Nov, 6pm Group D, week 4: Mon 23 Nov, 6pm/);
    assert.equal(findProps(after.element, "CancelExplainer").length, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. Scheduling
// ---------------------------------------------------------------------------

describe("4. Schedule for N groups", () => {
  test("one record, a task per session for whoever explains, and ONE email on their tasks row with its push", async () => {
    reset();
    const made = await schedule("zach", body());
    assert.equal(made.status, 200, JSON.stringify(made.body));
    assert.deepEqual(Object.keys(made.body).sort(), ["emailed", "explainerId", "tasks"]);
    assert.equal(made.body.tasks, 2);
    assert.equal(made.body.emailed, 1);
    const stored = w.world.db.read(`courseExplainers/${made.body.explainerId}`);
    assert.equal(stored.runId, RUN.agi);
    assert.equal(stored.topic, TOPIC);
    assert.equal(stored.explainerUid, "nadia");
    assert.equal(stored.scheduledByUid, "zach");
    assert.equal(stored.fromWeekNumber, 3);
    assert.equal(stored.cancelledAt, null);
    assert.deepEqual(
      stored.sessions.map((session) => [session.groupId, session.sessionKey, session.weekNumber]),
      [[A, "w04", 4], [D, "w04", 4]],
    );
    // Nothing of the review is kept on it.
    assert.doesNotMatch(JSON.stringify(stored), /theme|Group 1|check|harbour/i);

    const task = w.world.db.read(`tasks/explainer__${made.body.explainerId}__${A}__w04`);
    assert.equal(task.source, "explainer");
    assert.equal(task.visibility, "assignees-only");
    assert.deepEqual(task.completerUids, ["nadia"]);
    assert.equal(task.creatorUid, "zach");
    assert.deepEqual(task.sourceRef, { cohortId: RUN.agi, weekNumber: 4, groupId: A, sessionKey: "w04" });
    assert.equal(task.title, "Explain who pays for the lamps: Group A, Thu 19 Nov, 6pm");
    assert.equal(new Date(task.dueDate).toISOString(), "2026-11-19T18:00:00.000Z");
    assert.match(task.description, /Where: Portland A13/);
    assert.doesNotMatch(task.description, /Amara|Dev|Bea|Tariq|http/, "the task names somebody in the group, or a link");
    assert.ok(task.initialNotifyAt, "the task system would send its own email for each task");
    assert.equal(taskPaths().length, 2);

    // One email, to Nadia, on the tasks row; and the push beside it.
    assert.equal(w.world.mail.length, 1);
    assert.equal(w.world.mail[0].to, w.world.db.read("users/nadia").email);
    assert.equal(w.world.mail[0].kind, "task");
    assert.equal(w.world.mail[0].subject, "A 10-minute explainer on who pays for the lamps");
    assert.deepEqual(w.world.pushes.map((push) => push.uid), ["nadia"]);
  });

  test("their task emails off, or the site's task emails off: the tasks, and no email", async () => {
    reset();
    w.world.db.poke("users/nadia", { "profile.notifications": { channels: { gmail: true, uniEmail: true }, categories: { newsletter: false, events: false, courses: true, tasks: false } } });
    const made = await schedule("zach", body());
    assert.equal(made.status, 200);
    assert.equal(made.body.emailed, 0);
    assert.equal(w.world.mail.length, 0);
    reset({ "config/taskEmails": { enabled: false } });
    const quiet = await schedule("zach", body());
    assert.equal(quiet.body.emailed, 0);
    assert.equal(w.world.mail.length, 0);
    assert.equal(w.world.pushes.length, 0);
    assert.equal(taskPaths().length, 2);
  });

  test("only an admin, decided before the body is read; never in a view-as session", async () => {
    reset();
    for (const who of ["claudia", "lloyd", "rahul", "nadia", "amara"]) {
      assert.equal((await schedule(who, body())).status, 403, who);
      assert.equal((await schedule(who, {})).status, 403, `${who} met the body check`);
    }
    assert.equal((await schedule(null, body())).status, 401);
    assert.equal((await schedule("zach", body(), { viewAs: true })).status, 403);
    assert.equal((await schedule("zach", {})).status, 400);
    assert.equal(explainerPaths().length, 0);
    assert.equal(w.world.mail.length, 0);
  });

  test("whoever explains is on the committee or an admin, read on the server; a session must be its group's next", async () => {
    reset();
    for (const uid of ["rahul", "amara", "nobody", "wen", "refused"]) {
      const refused = await schedule("zach", body({ explainerUid: uid }));
      assert.equal(refused.status, 409, uid);
      assert.equal(refused.body.error, words.EXPLAINER_WORDS.notCommittee);
    }
    // An admin may explain too.
    assert.equal((await schedule("zach", body({ explainerUid: "zach", sessions: [SESSIONS.B] }))).status, 200);
    // A week's session that is not the group's next, or a group not on the run.
    for (const sessions of [[{ groupId: A, sessionKey: "w05" }], [{ groupId: A, sessionKey: "w03" }], [{ groupId: "elsewhere", sessionKey: "w04" }]]) {
      const moved = await schedule("zach", body({ sessions }));
      assert.equal(moved.status, 409, JSON.stringify(sessions));
      assert.equal(moved.body.error, words.EXPLAINER_WORDS.moved);
    }
    assert.equal(explainerPaths().length, 1);
  });

  test("one explainer to a session: a second is refused, and the page shows the session as taken", async () => {
    reset();
    assert.equal((await schedule("zach", body())).status, 200);
    const twice = await schedule("zach", body({ topic: "Something else", sessions: [SESSIONS.D, SESSIONS.B] }));
    assert.equal(twice.status, 409);
    assert.equal(twice.body.error, "Group D’s next session already starts with an explainer.");
    assert.equal(explainerPaths().length, 1);
    assert.equal(taskPaths().length, 2);
    const [form] = findProps((await draw(pages.explainer, "zach")).element, "ExplainerForm");
    assert.deepEqual(
      form.choices.map((choice) => [choice.groupId, choice.taken]),
      [[C, null], [A, TOPIC], [D, TOPIC], [B, null]],
    );
  });
});

// ---------------------------------------------------------------------------
// 5. The tickets, Home and "Week N is open"
// ---------------------------------------------------------------------------

describe("5. the tickets: each group's facilitators and its members, nobody else's", () => {
  test("the group page's ticket, for the group's facilitators and an admin, named as each sees people; another group's has none", async () => {
    reset();
    await schedule("zach", body({ sessions: [SESSIONS.A, SESSIONS.B] }));
    const sofia = await w.groupPage("sofia", A);
    const ticket = find(sofia.element, "FacilitatorTicket");
    const { minutes, topic, by, scheduledBy, fromWeekNumber } = ticket.explainer;
    assert.deepEqual({ minutes, topic, by, scheduledBy, fromWeekNumber }, { minutes: 10, topic: TOPIC, by: "Nadia", scheduledBy: "Zach", fromWeekNumber: 3 });
    assert.match(sofia.text, /Starts with an explainer 10 minutes on who pays for the lamps, by Nadia\. Then the week as planned\./);
    assert.match(sofia.text, /Scheduled by Zach from the week 3 review\./);
    // An admin sees the committee's names in full.
    const zach = await w.groupPage("zach", A);
    assert.match(zach.text, /by Nadia Hassan\. Then the week as planned\. .*Scheduled by Zach Levin from the week 3 review\./s);
    // Group B's ticket has it; Group C's and D's have none.
    assert.match((await w.groupPage("rahul", B)).text, /Starts with an explainer/);
    for (const [who, group] of [["tom", C], ["grace", D]]) {
      const drawn = await w.groupPage(who, group);
      assert.equal(find(drawn.element, "FacilitatorTicket").explainer, null, who);
      assert.doesNotMatch(drawn.text, /explainer/i, who);
    }
    // Never the review it came from.
    for (const drawn of [sofia, zach]) assert.ok(!drawn.text.includes(THEME_DETAIL) && !/check-ins/.test(drawn.text));
  });

  test("Home's ticket says it too, on that session alone", async () => {
    reset();
    await schedule("zach", body({ sessions: [SESSIONS.B] }));
    const home = await w.home("rahul");
    assert.match(home.text, /Starts with an explainer 10 minutes on who pays for the lamps, by Nadia\. Then the week as planned\./);
    assert.match(home.text, /Scheduled by Zach from the week 3 review\./);
    assert.equal(home.summary.explainer.sessionKey, "w04");
    const grace = await w.home("grace", "Grace");
    assert.doesNotMatch(grace.text, /explainer/i);
    assert.equal(grace.summary.explainer, null);
  });

  test("Home's ticket before the group's first session says it too", async () => {
    // Sun 1 Nov: Group B first meets on Tue 3 Nov, so Home is the first session's ticket.
    reset(
      {
        "courseExplainers/e1": {
          runId: RUN.agi,
          roundId: ROUND,
          programmeId: AGI,
          fromWeekId: "w01",
          fromWeekNumber: 1,
          topic: TOPIC,
          explainerUid: "nadia",
          minutes: 5,
          sessions: [{ groupId: B, sessionKey: "w01", weekNumber: 1, startsAt: new Date("2026-11-03T18:00:00Z") }],
          scheduledByUid: "zach",
          scheduledAt: new Date("2026-10-30T10:00:00Z"),
          cancelledAt: null,
          cancelledByUid: null,
        },
      },
      "2026-11-01T10:00:00Z",
    );
    const home = await w.home("rahul");
    assert.match(home.text, /Open your group/);
    assert.match(home.text, /Starts with an explainer 5 minutes on who pays for the lamps, by Nadia\. Then the week as planned\./);
    assert.match(home.text, /Scheduled by Zach from the week 1 review\./);
  });

  test("each member's overview carries how long and what about, for their own group's next session, and nothing more", async () => {
    reset();
    await schedule("zach", body({ sessions: [SESSIONS.A] }));
    const amara = await w.call("amara", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal(amara.status, 200);
    assert.deepEqual(amara.body.group.calendar.nextSession.explainer, { minutes: 10, topic: TOPIC });
    const chloe = await w.call("chloe", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal(chloe.body.group.calendar.nextSession.explainer, null, "another group's member was told of it");
    assert.doesNotMatch(JSON.stringify(amara.body), /nadia|Nadia|Hassan|zach/, "the overview names who explains or who scheduled it");
    // The member's ticket says it.
    const { default: SessionTicket } = await w.loadTs(join("features", "courses", "weekly", "SessionTicket.tsx"));
    const { ticketFacts } = await w.loadTs(join("features", "courses", "sessionChange", "cardFacts.ts"));
    const facts = ticketFacts(amara.body.group);
    const html = renderToStaticMarkup(
      createElement(SessionTicket, { facts, eyebrow: "Your next session", heading: "Thu 19 Nov", roomChanged: false, facilitators: [] }),
    );
    assert.match(textOf(html), /Your session starts with a 10-minute explainer on who pays for the lamps\./);
  });

  test("\"Week N is open\" carries the line while that email has not gone, and an email that has gone is never sent again for it", async () => {
    reset();
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w04`, { published: true });
    const run = firestoreCourses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
    const group = firestoreGroups.normalizeCourseGroup(D, w.world.db.read(`courseGroups/${D}`));
    const session = sessionsLib.resolveSessions(run, group).find((each) => each.sessionKey === "w04");
    const read = () => nextWeek.readNextWeekEmail(w.world.db, { run, group, session, feedbackUrl: "", appUrl: "https://naisi.uk" });
    assert.equal((await read()).facts.explainer, null);
    await schedule("zach", body());
    const reading = await read();
    assert.deepEqual(reading.facts.explainer, { minutes: 10, topic: TOPIC });
    const email = weekEmails.weekOpenEmailWords(reading.facts, "Freya");
    assert.ok(email.paragraphs.includes("Your session starts with a 10-minute explainer on who pays for the lamps."), email.paragraphs.join(" | "));
    // A cancelled session's email says it is off, and nothing of an explainer.
    const off = weekEmails.weekOpenEmailWords({ ...reading.facts, cancelled: true, change: "No session on Mon 23 Nov." }, "Freya");
    assert.ok(!off.paragraphs.some((line) => line.includes("explainer")));
    // Not a value a whole email waits for.
    assert.ok(!reading.missing.includes("explainer"));
    // The email goes once; scheduling after it sends nothing more to the group.
    const config = { weeklyFeedbackUrl: "" };
    const send = () =>
      nextWeek.sendNextWeekEmail({
        db: w.world.db,
        run,
        group,
        session,
        pushedSessionKey: null,
        by: { kind: "schedule", jobId: "courses-next-week-email" },
        force: false,
        whole: false,
        config,
        now: new Date(),
        appUrl: "https://naisi.uk",
      });
    const before = w.world.mail.length;
    const first = await send();
    assert.ok(first.sent > 0, JSON.stringify(first));
    const sent = w.world.mail.slice(before);
    assert.ok(sent.every((mail) => JSON.stringify(mail).includes("10-minute explainer")), "the group's email left out its explainer");
    const again = await send();
    assert.equal(again.sent, 0);
    assert.equal(again.held, "claimed");
  });
});

// ---------------------------------------------------------------------------
// 6. The lead
// ---------------------------------------------------------------------------

describe("6. the lead sees what was booked, never the review", () => {
  test("the week's page lists each explainer for the lead and an admin; nothing of the theme or its counts", async () => {
    reset();
    await schedule("zach", body());
    const lead = await draw(pages.week, "claudia");
    assert.match(lead.text, /Explainers from the week 3 review Who pays for the lamps 10 minutes, by Nadia Hassan Group A, week 4: Thu 19 Nov, 6pm Group D, week 4: Mon 23 Nov, 6pm/);
    assert.ok(!lead.text.includes(THEME_DETAIL), "the lead reads Claude's words");
    assert.doesNotMatch(lead.text, /check-ins|facilitator report|Group 1/, "the lead reads the theme's counts");
    const admin = await draw(pages.week, "zach");
    assert.match(admin.text, /Explainers from the week 3 review/);
    // Another week's page lists none.
    const week4 = await draw(pages.week, "claudia", { ...params, weekId: "w04" });
    assert.doesNotMatch(week4.text, /Explainers from/);
  });
});

// ---------------------------------------------------------------------------
// 7. Cancel
// ---------------------------------------------------------------------------

describe("7. Cancel: the tasks closed, every ticket cleared, nobody emailed", () => {
  test("an admin cancels: the record stays stamped, its tasks are archived, the tickets and the email line drop it", async () => {
    reset();
    const made = await schedule("zach", body({ sessions: [SESSIONS.A] }));
    const mailBefore = w.world.mail.length;
    const done = await cancel("zach", made.body.explainerId);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual(done.body, { archived: 1 });
    const stored = w.world.db.read(`courseExplainers/${made.body.explainerId}`);
    assert.ok(stored.cancelledAt, "the record was not stamped");
    assert.equal(stored.cancelledByUid, "zach");
    assert.equal(w.world.db.read(`tasks/explainer__${made.body.explainerId}__${A}__w04`).archived, true);
    assert.equal(w.world.mail.length, mailBefore, "cancelling emailed somebody");
    assert.equal(w.world.pushes.length, 1, "cancelling pushed to somebody");
    assert.doesNotMatch((await w.groupPage("sofia", A)).text, /explainer/i);
    const amara = await w.call("amara", w.routes.overview.GET, { runId: RUN.agi }, { course: true });
    assert.equal(amara.body.group.calendar.nextSession.explainer, null);
    assert.doesNotMatch((await draw(pages.week, "claudia")).text, /Explainers from/);
    assert.match((await draw(pages.review, "zach")).text, /None scheduled from this review yet\./);
    // Cancelled again: nothing more closes. The session is free for another.
    assert.deepEqual((await cancel("zach", made.body.explainerId)).body, { archived: 0 });
    assert.equal((await schedule("zach", body({ sessions: [SESSIONS.A] }))).status, 200);
  });

  test("only an admin, never in a view-as session, and only an explainer of this programme's run", async () => {
    reset();
    const made = await schedule("zach", body());
    for (const who of ["claudia", "nadia", "sofia", "amara"]) assert.equal((await cancel(who, made.body.explainerId)).status, 403, who);
    assert.equal((await cancel(null, made.body.explainerId)).status, 401);
    assert.equal((await cancel("zach", made.body.explainerId, { viewAs: true })).status, 403);
    assert.equal((await cancel("zach", "nothing-here")).status, 404);
    // Another programme's address does not reach this run's explainer.
    const elsewhere = await w.call("zach", routes.cancel.DELETE, { roundId: ROUND, programmeId: "tais", explainerId: made.body.explainerId });
    assert.ok([403, 404].includes(elsewhere.status), String(elsewhere.status));
    assert.equal(w.world.db.read(`courseExplainers/${made.body.explainerId}`).cancelledAt, null);
  });
});

// ---------------------------------------------------------------------------
// 8. Deletion
// ---------------------------------------------------------------------------

describe("8. an account's deletion, and the run's destroy", () => {
  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
      ["next/server", "export class NextResponse { static json(body, init) { return { body, status: (init && init.status) || 200 }; } }"],
      ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }\nexport function getAdminStorage() { return null; }"],
      ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
      ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
    ]),
  });
  const auth = { async deleteUser() {}, async revokeRefreshTokens() {} };
  const explainer = (over) => ({
    runId: RUN.agi,
    roundId: ROUND,
    programmeId: AGI,
    fromWeekId: "w03",
    fromWeekNumber: 3,
    topic: TOPIC,
    explainerUid: "nadia",
    minutes: 10,
    sessions: [{ groupId: A, sessionKey: "w04", weekNumber: 4, startsAt: new Date("2026-11-19T18:00:00Z") }],
    scheduledByUid: "zach",
    scheduledAt: new Date("2026-11-18T10:00:00Z"),
    cancelledAt: null,
    cancelledByUid: null,
    ...over,
  });

  test("the explainer stays without the deleted account's id, as the one explaining or the admin who scheduled or cancelled it", async () => {
    const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
    const db = makeCascadeDb({
      "users/nadia": { uid: "nadia", role: "committee" },
      "courseExplainers/e1": explainer({}),
      "courseExplainers/e2": explainer({ explainerUid: "lloyd", scheduledByUid: "nadia", cancelledByUid: "nadia", cancelledAt: new Date() }),
      "courseExplainers/e3": explainer({ explainerUid: "lloyd" }),
    });
    db.recursiveDelete = async (ref) => ref.delete();
    const summary = await deleteAccountCascade(auth, db, "nadia");
    assert.equal(summary.courseExplainersCleared, 2);
    assert.equal(db.read("courseExplainers/e1").explainerUid, null);
    assert.equal(db.read("courseExplainers/e1").scheduledByUid, "zach");
    assert.equal(db.read("courseExplainers/e2").scheduledByUid, null);
    assert.equal(db.read("courseExplainers/e2").cancelledByUid, null);
    assert.equal(db.read("courseExplainers/e2").explainerUid, "lloyd");
    assert.deepEqual(db.read("courseExplainers/e3"), explainer({ explainerUid: "lloyd" }));
  });

  test("a ticket then says it starts with an explainer, naming nobody", async () => {
    reset({ "courseExplainers/e1": explainer({ explainerUid: null, scheduledByUid: null }) });
    const sofia = await w.groupPage("sofia", A);
    assert.match(sofia.text, /Starts with an explainer 10 minutes on who pays for the lamps\. Then the week as planned\./);
    assert.match(sofia.text, /Scheduled from the week 3 review\./);
  });

  test("whoever explained on the run is scrubbed from what goes to Claude, a cancelled explainer's included", async () => {
    reset({
      "courseExplainers/e1": explainer({ explainerUid: "nadia" }),
      "courseExplainers/e2": explainer({ explainerUid: "tess", cancelledAt: new Date(), cancelledByUid: "zach" }),
    });
    const door = await w.loadTs(join("lib", "courses", "coursework", "door.ts"));
    // Neither runs the programme otherwise: Nadia is named on nothing, and Tess leads another programme.
    const staff = await door.runStaffUids(w.world.db, RUN.agi);
    assert.ok(staff.includes("nadia") && staff.includes("tess"), staff.join(", "));
    // Another run's explainer is no name on this one.
    reset({ "courseExplainers/e3": explainer({ runId: RUN.tais, explainerUid: "lloyd" }) });
    assert.ok(!(await door.runStaffUids(w.world.db, RUN.agi)).includes("lloyd"));
  });

  test("the record reads back what was kept, and nothing that is not an explainer", () => {
    const read = record.normalizeExplainer("e1", explainer({ topic: "  Lamps  ", minutes: 10 }));
    assert.equal(read.topic, "Lamps");
    assert.equal(record.normalizeExplainer("x", explainer({ minutes: 7 })), null);
    assert.equal(record.normalizeExplainer("x", explainer({ sessions: [] })), null);
    assert.equal(record.normalizeExplainer("x", explainer({ topic: "" })), null);
    assert.equal(record.explainerTaskId("e1", A, "w04"), `explainer__e1__${A}__w04`);
    assert.equal(record.explainerOnSession([read], A, "w04")?.id, "e1");
    assert.equal(record.explainerOnSession([{ ...read, cancelledAt: new Date() }], A, "w04"), null);
  });
});

// ---------------------------------------------------------------------------
// 9. The page's shape
// ---------------------------------------------------------------------------

describe("9. the files of this piece keep the house's rules", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const FILES = [
    "lib/firestore/courseExplainers.ts",
    "lib/courses/explainers/words.ts",
    "lib/courses/explainers/model.ts",
    "lib/courses/explainers/task.ts",
    "lib/courses/explainers/readers.ts",
    "lib/courses/explainers/schedule.ts",
    "emails/ExplainerEmail.tsx",
    "features/courses/explainers/ExplainerForm.tsx",
    "features/courses/explainers/CancelExplainer.tsx",
    "features/courses/explainers/ExplainerList.tsx",
    "features/courses/explainers/explainers.module.css",
  ];

  test("no dash of either kind, no word the house does not use, and no meeting link anywhere in them", () => {
    for (const file of FILES) {
      const source = readFileSync(join(SRC, file), "utf8");
      assert.doesNotMatch(source, /[–—]/, `${file} carries a dash`);
      assert.doesNotMatch(source, /\bcollate\b/i, file);
      assert.doesNotMatch(source, /\bmeetingUrl\b/, `${file} names a group's link`);
    }
  });

  test("the stylesheet ends with its phone block, and every press and row a finger lands on is at least 44px", () => {
    const css = readFileSync(join(SRC, "features/courses/explainers/explainers.module.css"), "utf8");
    assert.match(css, /@media \(max-width: 48rem\) \{[^]*\}\s*$/);
    for (const rule of [".linkButton", ".choice"]) {
      const block = new RegExp(`\\${rule} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      assert.match(block, /min-height: 44px;/, `${rule} is under 44px`);
    }
  });
});

/** The first element below `element` whose component is called `name`, by its props. */
function find(element, name) {
  return findProps(element, name)[0];
}
