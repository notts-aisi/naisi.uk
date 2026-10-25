/**
 * Rules tests for a week's "Questions to think about" (C29) on the run's own
 * weeks (`courseRuns/{runId}/weeks/{weekId}`), which the week editor writes
 * client-direct: at most five, each a line of text of 1 to 160 characters
 * (COURSE_FIELD_LIMITS.maxWeekQuestions and .weekQuestion in
 * src/lib/firestore/courses.ts). A week with none, and one written before the
 * field existed, write as they always have. Who may write a week is
 * unchanged, and is the courses suite's to hold.
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
  await getTestEnv("course-week-questions");
});
after(cleanup);
afterEach(clearData);

const ZERO_COUNTS = { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 };

async function seedCast() {
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("learner", { role: "member" });
}

/** A run as the drafter's client wrote it, with the drafter as its author. */
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
      trackLeadUids: [],
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

const QUESTIONS = [
  "Which claim did you disagree with, and why?",
  "What would change your mind?",
  "What's one thing you'd want to understand better?",
];
const weeks = (db) => db.collection("courseRuns").doc("run1").collection("weeks");

describe("courseRuns weeks: questions to think about", () => {
  it("takes up to five lines of 1 to 160 characters, none at all, and a week written before them", async () => {
    await seedCast();
    await seedRun();
    const drafter = await asUser("drafter");
    await assertSucceeds(weeks(drafter).doc("w03").set(weekDoc({ questions: QUESTIONS })));
    await assertSucceeds(weeks(drafter).doc("w03").update({ questions: Array.from({ length: 5 }, (_, i) => `${i}`.padEnd(160, "x")) }));
    await assertSucceeds(weeks(drafter).doc("w03").update({ questions: ["Q"] }));
    await assertSucceeds(weeks(drafter).doc("w03").update({ questions: [] }));
    const before = weekDoc({ weekNumber: 4 });
    delete before.questions;
    await assertSucceeds(weeks(drafter).doc("w04").set(before));
    await assertSucceeds(weeks(drafter).doc("w04").update({ title: "Renamed, questions untouched" }));
  });

  it("refuses six, an empty one, one too long, one that is not text, and a value that is not a list", async () => {
    await seedCast();
    await seedRun();
    const drafter = await asUser("drafter");
    for (const questions of [
      Array.from({ length: 6 }, (_, i) => `Question ${i + 1}?`),
      ["Fine?", ""],
      ["x".repeat(161)],
      ["Fine?", "Fine?", "Fine?", "Fine?", "x".repeat(161)],
      ["Fine?", 7],
      ["Fine?", null],
      "Why?",
      { first: "Why?" },
    ]) {
      await assertFails(weeks(drafter).doc("w03").set(weekDoc({ questions })));
    }
  });

  it("an edit to another field keeps the stored questions, and a list grown past five is refused", async () => {
    await seedCast();
    await seedRun();
    await seed(async (db) => {
      await weeks(db).doc("w03").set(weekDoc({ questions: QUESTIONS }));
    });
    const drafter = await asUser("drafter");
    await assertSucceeds(weeks(drafter).doc("w03").update({ title: "Renamed" }));
    await assertFails(weeks(drafter).doc("w03").update({ questions: [...QUESTIONS, "Four?", "Five?", "Six?"] }));
  });

  it("a plain member still writes no week, questions or not", async () => {
    await seedCast();
    await seedRun();
    await assertFails(weeks(await asUser("learner")).doc("w03").set(weekDoc({ questions: QUESTIONS })));
  });
});
