/**
 * Rules tests for a course's routes and deadlines (CourseDoc.routes in
 * src/lib/firestore/courses.ts; src/lib/courses/routes/model.ts).
 *
 * The list is the server's: its route (`/api/courses/[courseId]/routes`)
 * reads a pasted list against courseRoutesProblems, groups of rows of words
 * with links, which a rule cannot walk, and only an admin may save one. So no
 * browser writes `routes`, for every writer, admins included. The course
 * editor's own writes (createCourse, updateCourse's named keys) never carry
 * it, and keep working on a course that has one.
 *
 * Who may write a course at all is unchanged, and is the courses suite's to
 * hold.
 *
 * To place at scripts/rules-tests/tests/course-routes.test.mjs beside the
 * rules change (`courseRoutesUntouched()` on the courses create and update).
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
  await getTestEnv("course-routes");
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

const ROUTES = {
  checkedOn: "2026-11-01",
  intro: [],
  groups: [
    {
      heading: "Part-time",
      routes: [
        { name: "A sprint", url: "https://example.com/sprint", what: [{ text: "Five weeks." }], suits: [], deadline: "2026-11-20", rolling: false, nextRound: [] },
      ],
    },
  ],
  after: [],
};

const courses = (db) => db.collection("courses");

/** Everyone who may update a course: admin, an approver, its own drafter, a collaborator. */
const COURSE_EDITORS = ["admin1", "approver", "drafter", "collab"];

describe("courses: a course's routes and deadlines are the server's", () => {
  it("a drafter still creates a course as the editor does, and every editor edits one that has routes", async () => {
    await seedCast();
    const drafter = await asUser("drafter");
    await assertSucceeds(courses(drafter).doc("c-new").set(courseDoc()));
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ collaboratorUids: ["collab"], routes: ROUTES }));
    });
    for (const uid of COURSE_EDITORS) {
      const db = await asUser(uid);
      await assertSucceeds(courses(db).doc("course1").update({ tagline: `Edited by ${uid}` }));
      await assertSucceeds(courses(db).doc("course1").update({ dayBeforeDueTime: "12:00" }));
    }
  });

  it("refuses a create carrying routes, even none, for every writer", async () => {
    await seedCast();
    for (const uid of ["drafter", "admin1"]) {
      const db = await asUser(uid);
      await assertFails(courses(db).doc(`c-${uid}`).set(courseDoc({ authorUid: uid, routes: ROUTES })));
      await assertFails(courses(db).doc(`c-${uid}-null`).set(courseDoc({ authorUid: uid, routes: null })));
    }
  });

  it("refuses an update that sets, changes or takes off the routes, for every course editor, admins included", async () => {
    await seedCast();
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ collaboratorUids: ["collab"], routes: ROUTES }));
      await courses(db).doc("course2").set(courseDoc({ collaboratorUids: ["collab"] }));
    });
    for (const uid of COURSE_EDITORS) {
      const db = await asUser(uid);
      await assertFails(courses(db).doc("course1").update({ routes: { ...ROUTES, checkedOn: "2026-12-01" } }));
      await assertFails(courses(db).doc("course1").update({ routes: null }));
      await assertFails(courses(db).doc("course2").update({ routes: ROUTES }));
    }
  });

  it("a plain member still writes no course, with routes or without", async () => {
    await seedCast();
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ routes: ROUTES }));
    });
    const learner = await asUser("learner");
    await assertFails(courses(learner).doc("course1").update({ tagline: "x" }));
    await assertFails(courses(learner).doc("course1").update({ routes: null }));
  });
});
