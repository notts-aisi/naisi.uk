/**
 * Rules tests for a course's rubric for written answers (CourseDoc.rubric in
 * src/lib/firestore/courses.ts; src/lib/courses/rubric.ts).
 *
 * The rubric is the server's: its route (`/api/courses/[courseId]/rubric`)
 * holds a pasted table to rubricProblems, rows by levels with a descriptor
 * in each cell, which a rule cannot walk, and only an admin may save one. So
 * no browser writes `rubric`, for every writer, admins included. The course
 * editor's own writes (createCourse, updateCourse's named keys) never carry
 * it, and keep working on a course that has one.
 *
 * Who may write a course at all is unchanged, and is the courses suite's to
 * hold.
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
  await getTestEnv("course-rubric");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("collab", { role: "member" });
  await seedUser("learner", { role: "member" });
}

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

const RUBRIC = {
  levels: ["Not yet", "Solid", "Strong"],
  rows: [{ name: "A clear view", descriptors: ["Describes without a view", "States a view", "States a view someone could dispute"] }],
};

const courses = (db) => db.collection("courses");

/** Everyone who may update a course: admin, an approver, its own drafter, a collaborator. */
const COURSE_EDITORS = ["admin1", "approver", "drafter", "collab"];

describe("courses: a course's rubric is the server's", () => {
  it("a drafter still creates a course as the editor does, and every editor edits one that has a rubric", async () => {
    await seedCast();
    const drafter = await asUser("drafter");
    await assertSucceeds(courses(drafter).doc("c-new").set(courseDoc()));
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ collaboratorUids: ["collab"], rubric: RUBRIC }));
    });
    for (const uid of COURSE_EDITORS) {
      const db = await asUser(uid);
      await assertSucceeds(courses(db).doc("course1").update({ tagline: `Edited by ${uid}` }));
      await assertSucceeds(courses(db).doc("course1").update({ dayBeforeDueTime: "12:00" }));
    }
  });

  it("refuses a create carrying a rubric, even an empty one, for every writer", async () => {
    await seedCast();
    for (const uid of ["drafter", "admin1"]) {
      const db = await asUser(uid);
      await assertFails(courses(db).doc(`c-${uid}`).set(courseDoc({ authorUid: uid, rubric: RUBRIC })));
      await assertFails(courses(db).doc(`c-${uid}-null`).set(courseDoc({ authorUid: uid, rubric: null })));
    }
  });

  it("refuses an update that sets, changes or takes off the rubric, for every course editor, admins included", async () => {
    await seedCast();
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ collaboratorUids: ["collab"], rubric: RUBRIC }));
      await courses(db).doc("course2").set(courseDoc({ collaboratorUids: ["collab"] }));
    });
    for (const uid of COURSE_EDITORS) {
      const db = await asUser(uid);
      await assertFails(courses(db).doc("course1").update({ rubric: { levels: ["A", "B"], rows: [] } }));
      await assertFails(courses(db).doc("course1").update({ rubric: null }));
      await assertFails(courses(db).doc("course2").update({ rubric: RUBRIC }));
    }
  });

  it("a plain member still writes no course, with a rubric or without", async () => {
    await seedCast();
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ rubric: RUBRIC }));
    });
    const learner = await asUser("learner");
    await assertFails(courses(learner).doc("course1").update({ tagline: "x" }));
    await assertFails(courses(learner).doc("course1").update({ rubric: null }));
  });
});
