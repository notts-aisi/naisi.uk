/**
 * Rules tests for two dates a programme's lead or an admin sets on its run,
 * each through its programme tab's route on the Admin SDK, and which the run
 * editor's own writes (createRun's set, updateRun's update of named keys)
 * never carry:
 *
 *  - `courseRuns.groupsGoOutOn`, the day groups go out: null, or a civil
 *    "YYYY-MM-DD" date in London (the Groups tab,
 *    `.../programmes/[programmeId]/groups-go-out`). Every sentence that names
 *    the day reads it: Home's "Your group’s on its way", week 1's line, the
 *    application page's "When you’re free", the programme's head.
 *  - `courseRuns.teamHandIn`, an incubator's hand-in dates,
 *    `{ dueOn, showcaseWeek }` (the Teams tab,
 *    `.../programmes/[programmeId]/teams/hand-in`), read by each team's page.
 *
 * Both are pinned in `runPinnedFieldsUnchanged()`, against every browser write
 * but an admin's: a run's drafter, an approver and its track lead keep
 * editing the run, and are refused a change to either. The day groups go out
 * is also shaped in `runContentOk()`, so a run is created with it null or a
 * whole date, never words.
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
  await getTestEnv("course-run-dates");
});
after(cleanup);
afterEach(clearData);

const ZERO_COUNTS = { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 };

/** Everyone who may update a run but is not an admin: the three hats the run's update rule admits besides. */
const NOT_ADMINS = ["approver", "drafter", "lead"];

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

/** The two dates as their routes store them. */
const GOES_OUT = "2026-10-28";
const HAND_IN = { dueOn: "2026-12-04", showcaseWeek: 8 };

const runs = (db) => db.collection("courseRuns");

describe("courseRuns: the day groups go out and an incubator's hand-in dates are the routes'", () => {
  it("every writer still edits a run that has both, the way the run editor does", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc({ groupsGoOutOn: GOES_OUT, teamHandIn: HAND_IN }));
      await runs(db).doc("run2").set(runDoc({ channel: "cohort:run2", groupsGoOutOn: null, teamHandIn: { dueOn: null, showcaseWeek: null } }));
      await runs(db).doc("run3").set(runDoc({ channel: "cohort:run3" }));
    });
    for (const uid of ["admin1", ...NOT_ADMINS]) {
      const db = await asUser(uid);
      for (const runId of ["run1", "run2", "run3"]) {
        await assertSucceeds(runs(db).doc(runId).update({ label: `Renamed by ${uid}` }));
      }
    }
  });

  it("an admin writes both from the browser, as before", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc());
    });
    const db = await asUser("admin1");
    await assertSucceeds(runs(db).doc("run1").update({ groupsGoOutOn: GOES_OUT }));
    await assertSucceeds(runs(db).doc("run1").update({ groupsGoOutOn: "2026-11-04" }));
    await assertSucceeds(runs(db).doc("run1").update({ groupsGoOutOn: null }));
    await assertSucceeds(runs(db).doc("run1").update({ teamHandIn: HAND_IN }));
    await assertSucceeds(runs(db).doc("run1").update({ teamHandIn: { dueOn: "2026-12-11", showcaseWeek: 9 } }));
  });

  it("the drafter who owns the run, an approver and its track lead are refused a change to the day groups go out", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc({ groupsGoOutOn: GOES_OUT }));
      await runs(db).doc("run2").set(runDoc({ channel: "cohort:run2" }));
    });
    for (const uid of NOT_ADMINS) {
      const db = await asUser(uid);
      // Moved, cleared, and set where there was none, each a whole date.
      await assertFails(runs(db).doc("run1").update({ groupsGoOutOn: "2026-11-04" }));
      await assertFails(runs(db).doc("run1").update({ groupsGoOutOn: null }));
      await assertFails(runs(db).doc("run2").update({ groupsGoOutOn: GOES_OUT }));
      // A whole-document write that leaves it out takes it away: refused too.
      await assertFails(runs(db).doc("run1").set(runDoc({ label: "Rewritten" })));
    }
  });

  it("the drafter who owns the run, an approver and its track lead are refused a change to the hand-in dates", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc({ teamHandIn: HAND_IN }));
      await runs(db).doc("run2").set(runDoc({ channel: "cohort:run2" }));
    });
    for (const uid of NOT_ADMINS) {
      const db = await asUser(uid);
      await assertFails(runs(db).doc("run1").update({ teamHandIn: { ...HAND_IN, dueOn: "2026-12-11" } }));
      await assertFails(runs(db).doc("run1").update({ teamHandIn: { ...HAND_IN, showcaseWeek: 9 } }));
      await assertFails(runs(db).doc("run1").update({ teamHandIn: null }));
      await assertFails(runs(db).doc("run2").update({ teamHandIn: HAND_IN }));
      await assertFails(runs(db).doc("run1").set(runDoc({ label: "Rewritten" })));
    }
  });

  it("a run is created with the day groups go out as null or a whole date, never words", async () => {
    await seedCast();
    const db = await asUser("drafter");
    // Born with nobody on it, as the create rule requires (a track lead is
    // named by a route), so only the day groups go out decides each answer.
    const created = (runId, over) => runs(db).doc(runId).set(runDoc({ channel: `cohort:${runId}`, trackLeadUids: [], ...over }));
    await assertSucceeds(created("run-date", { groupsGoOutOn: GOES_OUT }));
    await assertSucceeds(created("run-null", { groupsGoOutOn: null }));
    await assertSucceeds(created("run-none", {}));
    await assertFails(created("run-words", { groupsGoOutOn: "Wed 28 Oct" }));
    await assertFails(created("run-instant", { groupsGoOutOn: "2026-10-28T18:00:00Z" }));
    await assertFails(created("run-number", { groupsGoOutOn: 20261028 }));
  });

  it("nobody else writes either: a member, or somebody signed out", async () => {
    await seedCast();
    await seed(async (db) => {
      await runs(db).doc("run1").set(runDoc({ status: "running", groupsGoOutOn: GOES_OUT, teamHandIn: HAND_IN }));
    });
    const learner = await asUser("learner");
    await assertFails(runs(learner).doc("run1").update({ groupsGoOutOn: "2026-11-04" }));
    await assertFails(runs(learner).doc("run1").update({ teamHandIn: { ...HAND_IN, dueOn: "2026-12-11" } }));
    const anon = await asAnon();
    await assertFails(runs(anon).doc("run1").update({ groupsGoOutOn: "2026-11-04" }));
    await assertFails(runs(anon).doc("run1").update({ teamHandIn: { ...HAND_IN, dueOn: "2026-12-11" } }));
  });
});
