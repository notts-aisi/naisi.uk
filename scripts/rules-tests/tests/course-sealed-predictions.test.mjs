/**
 * Rules tests for sealed predictions (Zach's extra (d)):
 *
 *  - `coursePredictions`, each person's two cards on a run
 *    (src/lib/firestore/coursePredictions.ts), and `recordOpenings`, one row
 *    each time an admin opened somebody's card (src/lib/firestore/recordOpenings.ts),
 *    are shut to every browser: the person a card is about, the group's
 *    facilitators, the programme's lead and admins included. One route on the
 *    Admin SDK writes a card, in its owner's own name; the server reads it
 *    after its own gate, never handing a sealed card back to its owner before
 *    it opens; and an admin opens one through a route that records the
 *    opening first. A client read would hand a sealed card back to its owner
 *    early, and an admin's read would go unrecorded.
 *  - A course's card (`CourseDoc.predictionCard`) is the server's: its route
 *    (/api/courses/[courseId]/predictions) reads a pasted card against
 *    predictionCardProblems, a list of questions a rule cannot walk, and only
 *    an admin may save one. No browser writes the field, admins included; the
 *    course editor's own writes never carry it, and keep working on a course
 *    that has one.
 *
 * To place at scripts/rules-tests/tests/course-sealed-predictions.test.mjs
 * beside the rules change (the two match blocks, and
 * `coursePredictionCardUntouched()` on the courses create and update).
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import {
  asAnon,
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
  await getTestEnv("course-sealed-predictions");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("lead", { role: "committee", suRecognised: true });
  await seedUser("facilitator", { role: "member" });
  await seedUser("member", { role: "member" });
  await seedUser("othermember", { role: "member" });
  await seedUser("pending1", { role: "pending" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("collab", { role: "member" });
}

const EVERYONE = ["admin1", "lead", "facilitator", "member", "othermember", "pending1"];

const CARD = {
  title: "MY LAMP CARD (sealed until week 6)",
  intro: "Put a number on each, from 0% to 100%.",
  sealWeek: 1,
  openWeek: 6,
  questions: [
    { number: "1", kind: "percent", statement: "Most lighthouses will run with no keeper.", max: 100, lowLabel: "", highLabel: "" },
    { number: "", kind: "sentence", statement: "The lamp I'd most like to tend:", max: 0, lowLabel: "", highLabel: "" },
  ],
};

const RECORD = {
  runId: "run1",
  uid: "member",
  courseId: "course1",
  card: { title: CARD.title, intro: CARD.intro, questions: CARD.questions },
  start: { answers: { q1: 35 }, sealedAt: new Date("2026-11-03T19:00:00Z"), opensInWeek: 6, updatedAt: new Date("2026-11-03T19:00:00Z") },
  now: { answers: {}, openedAt: null, updatedAt: null },
  createdAt: new Date("2026-11-03T18:40:00Z"),
  updatedAt: new Date("2026-11-03T19:00:00Z"),
};

const OPENING = {
  kind: "sealed-predictions",
  actorUid: "admin1",
  actorName: "An admin",
  subjectUid: "member",
  runId: "run1",
  openedAt: new Date("2026-11-20T10:00:00Z"),
};

async function seedRecords() {
  await seed(async (db) => {
    await db.collection("courseGroups").doc("grp1").set({ runId: "run1", name: "Group B", facilitatorUids: ["facilitator", "member"] });
    await db.collection("courseEnrolments").doc("run1__member").set({
      runId: "run1",
      uid: "member",
      groupId: "grp1",
      role: "learner",
      status: "active",
      allocatedEmailAt: new Date("2026-10-28T18:00:00Z"),
    });
    await db.collection("coursePredictions").doc("run1__member").set(RECORD);
    await db.collection("recordOpenings").doc("opening1").set(OPENING);
  });
}

describe("coursePredictions and recordOpenings: shut to every browser", () => {
  it("nobody reads a card or an opening, or lists them: the person it is about, a facilitator, the lead and an admin included", async () => {
    await seedCast();
    await seedRecords();
    // The control: both are there, and an admin's session is served a read
    // only an admin may make, so the refusals below are these blocks'.
    await seed(async (unruled) => {
      assert.equal((await unruled.collection("coursePredictions").doc("run1__member").get()).exists, true);
      assert.equal((await unruled.collection("recordOpenings").doc("opening1").get()).exists, true);
    });
    await assertSucceeds((await asUser("admin1")).collection("users").doc("member").get());
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePredictions").doc("run1__member").get());
      await assertFails(db.collection("coursePredictions").doc(`run1__${uid}`).get());
      await assertFails(db.collection("coursePredictions").where("runId", "==", "run1").get());
      await assertFails(db.collection("coursePredictions").where("uid", "==", uid).get());
      await assertFails(db.collection("recordOpenings").doc("opening1").get());
      await assertFails(db.collection("recordOpenings").where("runId", "==", "run1").get());
      await assertFails(db.collection("recordOpenings").where("subjectUid", "==", uid).get());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("coursePredictions").doc("run1__member").get());
    await assertFails(anon.collection("recordOpenings").doc("opening1").get());
  });

  it("nobody writes one: not an answer, not a seal, not an opening, not a delete, the owner and admins included", async () => {
    await seedCast();
    await seedRecords();
    for (const uid of EVERYONE) {
      const db = await asUser(uid);
      await assertFails(db.collection("coursePredictions").doc(`run1__${uid}`).set({ ...RECORD, uid }));
      await assertFails(db.collection("coursePredictions").doc("run1__member").update({ "start.answers.q1": 90 }));
      await assertFails(db.collection("coursePredictions").doc("run1__member").update({ "start.sealedAt": null }));
      await assertFails(db.collection("coursePredictions").doc("run1__member").update({ "now.openedAt": new Date() }));
      await assertFails(db.collection("coursePredictions").doc("run1__member").delete());
      await assertFails(db.collection("recordOpenings").doc(`by-${uid}`).set({ ...OPENING, actorUid: uid }));
      await assertFails(db.collection("recordOpenings").doc("opening1").update({ actorUid: uid }));
      await assertFails(db.collection("recordOpenings").doc("opening1").delete());
    }
    const anon = await asAnon();
    await assertFails(anon.collection("coursePredictions").doc("run1__x").set(RECORD));
    await assertFails(anon.collection("recordOpenings").doc("x").set(OPENING));
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

/** Everyone who may update a course: admin, an approver, its own drafter, a collaborator. */
const COURSE_EDITORS = ["admin1", "approver", "drafter", "collab"];

describe("courses: a course's predictions card is the server's", () => {
  it("a drafter still creates a course as the editor does, and every editor edits one that has a card", async () => {
    await seedCast();
    const drafter = await asUser("drafter");
    await assertSucceeds(courses(drafter).doc("c-new").set(courseDoc()));
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ collaboratorUids: ["collab"], predictionCard: CARD }));
    });
    for (const uid of COURSE_EDITORS) {
      const db = await asUser(uid);
      await assertSucceeds(courses(db).doc("course1").update({ tagline: `Edited by ${uid}` }));
    }
  });

  it("refuses a create carrying a card, even none, for every writer", async () => {
    await seedCast();
    for (const uid of ["drafter", "admin1"]) {
      const db = await asUser(uid);
      await assertFails(courses(db).doc(`c-${uid}`).set(courseDoc({ authorUid: uid, predictionCard: CARD })));
      await assertFails(courses(db).doc(`c-${uid}-null`).set(courseDoc({ authorUid: uid, predictionCard: null })));
    }
  });

  it("refuses an update that sets, changes or takes off the card, for every course editor, admins included", async () => {
    await seedCast();
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ collaboratorUids: ["collab"], predictionCard: CARD }));
      await courses(db).doc("course2").set(courseDoc({ collaboratorUids: ["collab"] }));
    });
    for (const uid of COURSE_EDITORS) {
      const db = await asUser(uid);
      await assertFails(courses(db).doc("course1").update({ predictionCard: { ...CARD, openWeek: 5 } }));
      await assertFails(courses(db).doc("course1").update({ "predictionCard.sealWeek": 2 }));
      await assertFails(courses(db).doc("course1").update({ predictionCard: null }));
      await assertFails(courses(db).doc("course2").update({ predictionCard: CARD }));
    }
  });

  it("a plain member still writes no course, with a card or without", async () => {
    await seedCast();
    await seed(async (db) => {
      await courses(db).doc("course1").set(courseDoc({ predictionCard: CARD }));
    });
    const learner = await asUser("member");
    await assertFails(courses(learner).doc("course1").update({ tagline: "x" }));
    await assertFails(courses(learner).doc("course1").update({ predictionCard: null }));
  });
});
