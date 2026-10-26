/**
 * Rules tests for a week written as blocks, and for the course setting that
 * says when work set for "the day before" a session is due.
 *
 *  - `courseRuns/{runId}/weeks/{weekId}`: a week's `blocks` and its Ready
 *    (`ready`, `readyAt`, `readyByUid`) are the server's, for every writer,
 *    admins included. The blocks route reads a paste against the answers
 *    people have given and holds the blocks to weekBlocksProblems
 *    (src/lib/courses/weekBlocks/model.ts), nested lists a rule cannot walk.
 *    The week editor's own writes (ensureWeekDoc's create, saveWeek's update
 *    of named keys) never carry those keys, and keep working on a week that
 *    has them.
 *  - `courses/{courseId}`: `dayBeforeDueTime` (CourseDoc in
 *    src/lib/firestore/courses.ts) is absent, null, or a London time
 *    "HH:MM" from 00:00 to 23:59, the one shape isClockTime reads, for every
 *    writer, admins included.
 *
 * Who may write a week or a course at all is unchanged, and is the courses
 * suite's to hold.
 */
import { after, afterEach, before, describe, it } from "node:test";
import {
  asUser,
  assertFails,
  assertSucceeds,
  cleanup,
  clearData,
  getTestEnv,
  seed,
  seedUser,
} from "../lib/harness.mjs";

before(async () => {
  await getTestEnv("course-week-blocks");
});
after(cleanup);
afterEach(clearData);

const ZERO_COUNTS = { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 };

/** Everyone who may author a run's weeks: the four hats the weeks rule admits. */
const AUTHORS = ["admin1", "approver", "drafter", "lead"];

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("lead", { role: "member" });
  await seedUser("collab", { role: "member" });
  await seedUser("learner", { role: "member" });
}

/** A run as the drafter's client wrote it, with the drafter as its author and "lead" as a track lead. */
async function seedRun() {
  await seed(async (db) => {
    await db.collection("courseRuns").doc("run1").set({
      courseId: "course1",
      courseTitle: "AI Safety Fundamentals",
      label: "Autumn 2026",
      academicYear: "2026/27",
      status: "draft",
      startDate: "2026-10-05",
      weekPlan: [],
      applicationForm: [],
      applicationsOpenAt: null,
      applicationsCloseAt: null,
      applicationCap: null,
      authorUid: "drafter",
      admissionsReviewerUids: [],
      runFacilitatorUids: [],
      trackLeadUids: ["lead"],
      applicationCounts: { ...ZERO_COUNTS },
      groupCount: 0,
      channel: "cohort:run1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
}

/** A week as ensureWeekDoc and saveWeek leave one. */
function weekDoc(overrides = {}) {
  return {
    weekNumber: 3,
    title: "Who decides what AGI means",
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: false,
    ...overrides,
  };
}

/** Two blocks as the blocks route stores them. */
const BLOCKS = [
  { id: "wt1", type: "whyThisWeek", body: [{ type: "paragraph", runs: [{ text: "Why it matters." }] }] },
  { id: "pt1", type: "part", number: 1, heading: "Part 1", time: "40 min", children: [] },
];

/** A week the blocks route has written, marked ready by a route. */
function blockWeek(overrides = {}) {
  return weekDoc({
    blocks: BLOCKS,
    published: true,
    ready: true,
    readyAt: new Date("2026-10-26T12:00:00Z"),
    readyByUid: "admin1",
    ...overrides,
  });
}

/** The four keys no browser writes, each with a value a browser might try. */
const SERVER_KEYS = {
  blocks: BLOCKS,
  ready: true,
  readyAt: new Date("2026-10-27T09:00:00Z"),
  readyByUid: "lead",
};

const weeks = (db) => db.collection("courseRuns").doc("run1").collection("weeks");

describe("courseRuns weeks: a week's blocks and its Ready are the server's", () => {
  it("every author still creates a week the way the editor does, and edits one that has blocks", async () => {
    await seedCast();
    await seedRun();
    await seed(async (db) => {
      await weeks(db).doc("w03").set(blockWeek());
    });
    let n = 4;
    for (const uid of AUTHORS) {
      const db = await asUser(uid);
      await assertSucceeds(weeks(db).doc(`w0${n}`).set(weekDoc({ weekNumber: n })));
      n += 1;
      await assertSucceeds(weeks(db).doc("w03").update({ title: `Renamed by ${uid}` }));
      await assertSucceeds(weeks(db).doc("w03").update({ questions: ["What would change your mind?"] }));
    }
    // Taking a ready week down is saveWeek's `published` alone: Ready stays as
    // stored, and the reader counts it only on a published week.
    await assertSucceeds(weeks(await asUser("lead")).doc("w03").update({ published: false }));
    await assertSucceeds(weeks(await asUser("drafter")).doc("w03").update({ published: true }));
  });

  it("refuses a create carrying blocks, ready, readyAt or readyByUid, for every author, admins included", async () => {
    await seedCast();
    await seedRun();
    for (const uid of AUTHORS) {
      const db = await asUser(uid);
      for (const [key, value] of Object.entries(SERVER_KEYS)) {
        await assertFails(weeks(db).doc("w03").set(weekDoc({ [key]: value })));
      }
      // The key alone is refused, whatever it holds.
      await assertFails(weeks(db).doc("w03").set(weekDoc({ blocks: [] })));
      await assertFails(weeks(db).doc("w03").set(weekDoc({ ready: false })));
    }
  });

  it("refuses an update that changes blocks, ready, readyAt or readyByUid, for every author, admins included", async () => {
    await seedCast();
    await seedRun();
    await seed(async (db) => {
      await weeks(db).doc("w03").set(blockWeek());
    });
    for (const uid of AUTHORS) {
      const db = await asUser(uid);
      await assertFails(weeks(db).doc("w03").update({ blocks: [BLOCKS[0]] }));
      await assertFails(weeks(db).doc("w03").update({ blocks: [] }));
      await assertFails(weeks(db).doc("w03").update({ ready: false }));
      await assertFails(weeks(db).doc("w03").update({ readyAt: new Date("2026-10-28T09:00:00Z") }));
      await assertFails(weeks(db).doc("w03").update({ readyByUid: "someone-else" }));
      // A whole-document write that leaves them out takes them away: refused too.
      await assertFails(weeks(db).doc("w03").set(weekDoc({ published: true })));
    }
  });

  it("refuses adding blocks or Ready to a week written before blocks, for every author", async () => {
    await seedCast();
    await seedRun();
    await seed(async (db) => {
      await weeks(db).doc("w03").set(weekDoc({ published: true }));
    });
    for (const uid of AUTHORS) {
      const db = await asUser(uid);
      for (const [key, value] of Object.entries(SERVER_KEYS)) {
        await assertFails(weeks(db).doc("w03").update({ [key]: value }));
      }
      await assertSucceeds(weeks(db).doc("w03").update({ title: `Still editable by ${uid}` }));
    }
  });

  it("a plain member still writes no week, with blocks or without", async () => {
    await seedCast();
    await seedRun();
    const learner = await asUser("learner");
    await assertFails(weeks(learner).doc("w03").set(weekDoc()));
    await assertFails(weeks(learner).doc("w03").set(weekDoc({ blocks: BLOCKS })));
  });
});

/** A clean course doc as the drafter's client writes one (createCourse). */
function courseDoc(overrides = {}) {
  return {
    title: "AI Safety Fundamentals",
    tagline: "An introduction to the field.",
    summaryBlocks: [],
    track: "technical",
    level: "No prior experience needed",
    estimatedWeeklyHours: null,
    status: "draft",
    showcaseRunId: null,
    authorUid: "drafter",
    collaboratorUids: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const courses = (db) => db.collection("courses");

/** Shapes that are not a London "HH:MM" from 00:00 to 23:59. */
const NOT_A_TIME = ["noon", "24:00", 900, "9:00", "12:60", "12:00:00", "", true, ["12:00"]];

/** Everyone who may update a course: admin, an approver, its own drafter, a collaborator. */
const COURSE_EDITORS = ["admin1", "approver", "drafter", "collab"];

describe("courses: when work for the day before a session is due", () => {
  it("a drafter creates a course with a time, with null, and without the setting", async () => {
    await seedCast();
    const drafter = await asUser("drafter");
    await assertSucceeds(courses(drafter).doc("c-noon").set(courseDoc({ dayBeforeDueTime: "12:00" })));
    await assertSucceeds(courses(drafter).doc("c-end").set(courseDoc({ dayBeforeDueTime: null })));
    await assertSucceeds(courses(drafter).doc("c-before").set(courseDoc()));
  });

  it("refuses a create whose setting is not null or a time", async () => {
    await seedCast();
    const drafter = await asUser("drafter");
    for (const odd of NOT_A_TIME) {
      await assertFails(courses(drafter).doc("c-odd").set(courseDoc({ dayBeforeDueTime: odd })));
    }
  });

  it("every course editor sets a time or null, and edits a course written before the setting", async () => {
    await seedCast();
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ collaboratorUids: ["collab"] }));
    });
    for (const uid of COURSE_EDITORS) {
      const db = await asUser(uid);
      await assertSucceeds(courses(db).doc("course1").update({ tagline: `Edited by ${uid}` }));
      await assertSucceeds(courses(db).doc("course1").update({ dayBeforeDueTime: "12:00" }));
      await assertSucceeds(courses(db).doc("course1").update({ dayBeforeDueTime: "00:00" }));
      await assertSucceeds(courses(db).doc("course1").update({ dayBeforeDueTime: "23:59" }));
      await assertSucceeds(courses(db).doc("course1").update({ dayBeforeDueTime: null }));
    }
  });

  it("refuses an update whose setting is not null or a time, for every course editor, admins included", async () => {
    await seedCast();
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ collaboratorUids: ["collab"], dayBeforeDueTime: "12:00" }));
    });
    for (const uid of COURSE_EDITORS) {
      const db = await asUser(uid);
      for (const odd of NOT_A_TIME) {
        await assertFails(courses(db).doc("course1").update({ dayBeforeDueTime: odd }));
      }
    }
  });
});
