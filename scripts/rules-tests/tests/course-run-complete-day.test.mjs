/**
 * Rules tests for the day a live run completes by itself, as the
 * `courses-runs-complete` job reads it: the end of the London day
 * `workClosesAfterDays` days (14 when the run stores none) after the run's
 * last session.
 *
 * The rules refuse the move to Completed to everybody who may update a run
 * but holds neither admin nor `approveCourse`: the run's track lead and the
 * course drafter who owns the run. Neither may move the day it completes by
 * itself either:
 *
 *  - `workClosesAfterDays` is the approver's at any time, beside the status:
 *    a track lead and the owning drafter are refused setting it, changing
 *    it, clearing it and removing it, and a drafter cannot create a run
 *    carrying it. A save that leaves it alone, or sends it as stored, passes.
 *    An approver and an admin set it.
 *  - The dates the last session is worked out from (the run's `startDate`
 *    and `weekPlan`, each group's slot and overrides) are held for every
 *    browser writer once the run's groups have gone out, which is the only
 *    kind of run the job completes: `course-told-times.test.mjs` runs each
 *    of them as each writer.
 *
 * Who may write a run at all is the courses suite's to hold.
 */
import { after, afterEach, before, describe, it } from "node:test";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
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
  await getTestEnv("course-run-complete-day");
});
after(cleanup);
afterEach(clearData);

const removed = () => firebase.firestore.FieldValue.delete();

const ZERO_COUNTS = { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 };

/** Who may update a run but may not complete it: its track lead and the drafter who owns it. */
const CANNOT_COMPLETE = ["lead", "drafter"];
/** Who may complete a run from a browser: an admin and a course approver. */
const MAY_COMPLETE = ["admin1", "approver"];

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("lead", { role: "member" });
  await seedUser("learner", { role: "member" });
}

/** A live run as the routes leave one: "drafter" its author, "lead" its track lead. */
function runDoc(id, overrides = {}) {
  return {
    courseId: "course1",
    courseTitle: "AI Safety Fundamentals",
    label: "Autumn 2026",
    academicYear: "2026/27",
    status: "running",
    startDate: "2026-10-05",
    weekPlan: [{ kind: "week", weekNumber: 1, weekId: "w01" }],
    applicationForm: [],
    authorUid: "drafter",
    admissionsReviewerUids: [],
    runFacilitatorUids: [],
    trackLeadUids: ["lead"],
    applicationCounts: { ...ZERO_COUNTS },
    groupCount: 0,
    channel: `cohort:${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const runs = (db) => db.collection("courseRuns");

async function reseed(id, data) {
  await seed(async (db) => {
    await runs(db).doc(id).set(data);
  });
}

/** Every way a browser could set, move, clear or remove the number, each on its own, with what is stored first. */
const DAY_CHANGES = [
  ["set where none is stored", {}, () => ({ workClosesAfterDays: 0 })],
  ["set to a week where none is stored", {}, () => ({ workClosesAfterDays: 7 })],
  ["brought down", { workClosesAfterDays: 14 }, () => ({ workClosesAfterDays: 0 })],
  ["raised", { workClosesAfterDays: 7 }, () => ({ workClosesAfterDays: 21 })],
  ["cleared", { workClosesAfterDays: 21 }, () => ({ workClosesAfterDays: null })],
  ["removed", { workClosesAfterDays: 21 }, () => ({ workClosesAfterDays: removed() })],
  ["inside a label save", {}, () => ({ label: "Autumn 2026 (renamed)", workClosesAfterDays: 1 })],
];

describe("courseRuns: the number of days after the last session that work closes is the approver's", () => {
  it("refuses the run's track lead and the drafter who owns it every change to it, on a live run and on a draft", async () => {
    await seedCast();
    for (const uid of CANNOT_COMPLETE) {
      const db = await asUser(uid);
      for (const status of ["running", "applications-open", "draft"]) {
        for (const [label, stored, patch] of DAY_CHANGES) {
          await reseed("run1", runDoc("run1", { status, ...stored }));
          try {
            await assertFails(runs(db).doc("run1").update(patch()));
          } catch (error) {
            throw new Error(`expected a refusal: ${uid}, ${status}: ${label}`, { cause: error });
          }
        }
      }
      // A whole-document write that leaves it out takes it away: refused too.
      await reseed("run1", runDoc("run1", { workClosesAfterDays: 21 }));
      await assertFails(runs(db).doc("run1").set(runDoc("run1", { label: "Rewritten" })));
    }
  });

  it("still saves, from them, a write that leaves it alone, sends it as stored, or sends null where none is stored", async () => {
    await seedCast();
    for (const uid of CANNOT_COMPLETE) {
      const db = await asUser(uid);
      for (const [label, stored, patch] of [
        ["a label save, none stored", {}, { label: "Renamed" }],
        ["a label save, one stored", { workClosesAfterDays: 21 }, { label: "Renamed" }],
        ["sent as stored", { workClosesAfterDays: 21 }, { label: "Renamed", workClosesAfterDays: 21 }],
        ["null where none is stored", {}, { label: "Renamed", workClosesAfterDays: null }],
        ["absent where null is stored", { workClosesAfterDays: null }, { label: "Renamed" }],
      ]) {
        await reseed("run1", runDoc("run1", stored));
        try {
          await assertSucceeds(runs(db).doc("run1").update(patch));
        } catch (error) {
          throw new Error(`expected it to save: ${uid}: ${label}`, { cause: error });
        }
      }
    }
  });

  it("lets an approver and an admin set, move and clear it", async () => {
    await seedCast();
    for (const uid of MAY_COMPLETE) {
      const db = await asUser(uid);
      for (const [label, stored, patch] of DAY_CHANGES) {
        await reseed("run1", runDoc("run1", stored));
        try {
          await assertSucceeds(runs(db).doc("run1").update(patch()));
        } catch (error) {
          throw new Error(`expected it to save: ${uid}: ${label}`, { cause: error });
        }
      }
    }
  });

  it("refuses a member any write of it, as before", async () => {
    await seedCast();
    await reseed("run1", runDoc("run1"));
    const db = await asUser("learner");
    await assertFails(runs(db).doc("run1").update({ workClosesAfterDays: 0 }));
  });

  it("refuses a drafter creating a run that carries it, and still creates one without it", async () => {
    await seedCast();
    const db = await asUser("drafter");
    const draft = (id, over = {}) => runDoc(id, { status: "draft", trackLeadUids: [], ...over });
    await assertFails(runs(db).doc("born1").set(draft("born1", { workClosesAfterDays: 0 })));
    await assertFails(runs(db).doc("born2").set(draft("born2", { workClosesAfterDays: 14 })));
    await assertSucceeds(runs(db).doc("born3").set(draft("born3")));
    await assertSucceeds(runs(db).doc("born4").set(draft("born4", { workClosesAfterDays: null })));
    const admin = await asUser("admin1");
    await assertSucceeds(runs(admin).doc("born5").set(draft("born5", { authorUid: "admin1", workClosesAfterDays: 21 })));
  });
});
