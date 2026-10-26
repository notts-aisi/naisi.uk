/**
 * Rules tests for a programme's Start here and Glossary, stored on the run's
 * own document as `startHere` and `glossary` (src/lib/courses/guide/model.ts).
 *
 *  - `courseRuns/{runId}`: both fields are the server's, for every writer,
 *    admins included. The guide route (`/api/courses/runs/[runId]/guide/
 *    [doc]`) holds each to its check (startHereProblems, glossaryProblems),
 *    nested lists a rule cannot walk, and every copy of a run's curriculum
 *    goes through Admin SDK routes. The run editor's own writes (createRun's
 *    set, updateRun's update of named keys) never carry them, and keep
 *    working on a run that has them.
 *  - Neither is public: the run's document is read by signed-in accounts
 *    only, as its weeks are.
 *
 * Who may write a run at all is unchanged, and is the courses suite's to hold.
 */
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
  await getTestEnv("course-guide");
});
after(cleanup);
afterEach(clearData);

const ZERO_COUNTS = { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 };

/** Everyone who may update a run: the four hats the run's update rule admits. */
const WRITERS = ["admin1", "approver", "drafter", "lead"];

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("lead", { role: "member" });
  await seedUser("learner", { role: "member" });
}

/** A run as the drafter's client wrote it: the drafter its author, "lead" its track lead. */
function runDoc(overrides = {}) {
  return {
    courseId: "course1",
    courseTitle: "Lighthouse Fellowship",
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
    ...overrides,
  };
}

/** The two documents as the guide route stores them. */
const START_HERE = {
  title: "Lighthouse Fellowship: fellow guide",
  lead: [{ type: "p", runs: [{ text: "Four weeks by the sea." }] }],
  sections: [{ heading: "A week, step by step", level: 2, body: [{ type: "p", runs: [{ text: "Read, then talk." }] }] }],
  credit: [],
};
const GLOSSARY = {
  title: "Glossary",
  lead: [],
  columns: ["Term", "In plain words"],
  terms: [{ term: [{ text: "Beam" }], definition: [{ text: "The light a lamp throws." }] }],
  after: [],
};

/** The two keys no browser writes, each with a value a browser might try. */
const SERVER_KEYS = { startHere: START_HERE, glossary: GLOSSARY };

const runs = (db) => db.collection("courseRuns");

describe("courseRuns: a programme's Start here and Glossary are the server's", () => {
  it("every writer still edits a run that has both, the way the run editor does", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc({ startHere: START_HERE, glossary: GLOSSARY }));
    });
    for (const uid of WRITERS) {
      const db = await asUser(uid);
      await assertSucceeds(runs(db).doc("run1").update({ label: `Renamed by ${uid}` }));
    }
  });

  it("refuses a run created with either, for every creator, admins included", async () => {
    await seedCast();
    for (const uid of ["admin1", "drafter"]) {
      const db = await asUser(uid);
      for (const [key, value] of Object.entries(SERVER_KEYS)) {
        await assertFails(runs(db).doc(`run-${uid}-${key}`).set(runDoc({ authorUid: uid, channel: `cohort:run-${uid}-${key}`, [key]: value })));
      }
      // The key alone is refused, whatever it holds.
      await assertFails(runs(db).doc(`run-${uid}-null`).set(runDoc({ authorUid: uid, channel: `cohort:run-${uid}-null`, glossary: null })));
      // And the run editor's own create, which carries neither, still passes.
      await assertSucceeds(runs(db).doc(`run-${uid}-ok`).set(runDoc({ authorUid: uid, channel: `cohort:run-${uid}-ok` })));
    }
  });

  it("refuses an update that adds, changes or removes either, for every writer, admins included", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc({ startHere: START_HERE }));
    });
    for (const uid of WRITERS) {
      const db = await asUser(uid);
      // Changing the one it has.
      await assertFails(runs(db).doc("run1").update({ startHere: { ...START_HERE, title: "Mine now" } }));
      await assertFails(runs(db).doc("run1").update({ startHere: null }));
      // Adding the one it has not.
      await assertFails(runs(db).doc("run1").update({ glossary: GLOSSARY }));
      // A whole-document write that leaves it out takes it away: refused too.
      await assertFails(runs(db).doc("run1").set(runDoc({ label: "Rewritten" })));
    }
  });

  it("a plain member writes no run, with a guide or without", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc({ status: "running", startHere: START_HERE }));
    });
    const learner = await asUser("learner");
    await assertFails(runs(learner).doc("run1").update({ startHere: { ...START_HERE, title: "x" } }));
    await assertFails(runs(learner).doc("run1").update({ label: "x" }));
  });

  it("neither is public: somebody signed out reads no run, and a signed-in account reads a live one as before", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc({ status: "running", startHere: START_HERE, glossary: GLOSSARY }));
    });
    await assertFails(runs(await asAnon()).doc("run1").get());
    await assertSucceeds(runs(await asUser("learner")).doc("run1").get());
  });
});
