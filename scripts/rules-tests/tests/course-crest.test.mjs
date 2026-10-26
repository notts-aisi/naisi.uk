/**
 * A course's programme crest, as the rules hold it (run in
 * `scripts/rules-tests` with `npm test`, against the Firestore emulator).
 *
 * The crest on `courses/{id}` is an admin's to set, through
 * `PUT /api/courses/[courseId]/crest` (Admin SDK). The course editor saves
 * everything else client-direct, and the `courses` block admits drafters,
 * approvers and a course's collaborators to that save. So the rules hold:
 *
 *  1. NOBODY BUT AN ADMIN CHANGES IT client-direct: a drafter who owns the
 *     course, a collaborator and an approver carry it through as it was,
 *     and their other edits still go through.
 *  2. A COURSE IS BORN WITHOUT ONE, whoever creates it.
 *  3. WHATEVER IS WRITTEN IS ONE OF THE FOUR KEYS, OR NONE, admins included.
 *     The four are read from `src/lib/crests/keys.ts`, the site's own list,
 *     so the rules' copy of it cannot drift without this failing.
 */
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The four keys, as the site's own module lists them. */
const KEYS = [
  ...readFileSync(join(REPO_ROOT, "src/lib/crests/keys.ts"), "utf8")
    .match(/CREST_KEYS = \[([^\]]*)\]/)[1]
    .matchAll(/"([a-z-]+)"/g),
].map((match) => match[1]);

before(async () => {
  await getTestEnv("course-crest");
});
after(cleanup);
afterEach(clearData);

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("facil", { role: "member" });
  await seedUser("learner", { role: "member" });
}

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
    collaboratorUids: ["facil"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function seedCourse(overrides = {}) {
  await seed(async (db) => {
    await db.collection("courses").doc("course1").set(courseDoc(overrides));
  });
}

describe("a course's crest", () => {
  it("reads the site's four keys", () => {
    assert.deepEqual(KEYS, ["agi-strategy", "technical-ai-safety", "governance-macrostrategy", "alignment"]);
  });

  it("an admin may set each of the four keys, and clear it", async () => {
    await seedCast();
    await seedCourse();
    const admin = await asUser("admin1");
    for (const key of KEYS) {
      await assertSucceeds(admin.collection("courses").doc("course1").update({ crest: key }));
    }
    await assertSucceeds(admin.collection("courses").doc("course1").update({ crest: null }));
  });

  it("nobody may write a value that is not one of the four, admins included", async () => {
    await seedCast();
    await seedCourse();
    const admin = await asUser("admin1");
    for (const bad of ["dragon", "Alignment", " alignment", "", 7, true, ["alignment"], { key: "alignment" }]) {
      await assertFails(admin.collection("courses").doc("course1").update({ crest: bad }));
    }
  });

  it("the drafter who owns it, a collaborator and an approver cannot change it", async () => {
    await seedCast();
    await seedCourse({ crest: "agi-strategy" });
    for (const uid of ["drafter", "facil", "approver"]) {
      const db = await asUser(uid);
      await assertFails(db.collection("courses").doc("course1").update({ crest: "alignment" }), uid);
      await assertFails(db.collection("courses").doc("course1").update({ crest: null }), uid);
    }
  });

  it("their other edits carry the crest through and still go", async () => {
    await seedCast();
    await seedCourse({ crest: "agi-strategy" });
    for (const uid of ["drafter", "facil", "approver"]) {
      const db = await asUser(uid);
      await assertSucceeds(db.collection("courses").doc("course1").update({ tagline: `Edited by ${uid}.` }));
    }
  });

  it("a member, an account with no role on the course and a visitor cannot touch it", async () => {
    await seedCast();
    await seedCourse({ crest: "agi-strategy" });
    const learner = await asUser("learner");
    await assertFails(learner.collection("courses").doc("course1").update({ crest: "alignment" }));
    const anon = await asAnon();
    await assertFails(anon.collection("courses").doc("course1").update({ crest: "alignment" }));
  });

  it("a course is born without one, whoever creates it", async () => {
    await seedCast();
    const drafter = await asUser("drafter");
    await assertFails(drafter.collection("courses").doc("c-crest").set(courseDoc({ collaboratorUids: [], crest: "alignment" })));
    await assertSucceeds(drafter.collection("courses").doc("c-plain").set(courseDoc({ collaboratorUids: [] })));
    await assertSucceeds(drafter.collection("courses").doc("c-null").set(courseDoc({ collaboratorUids: [], crest: null })));
    const admin = await asUser("admin1");
    await seedUser("admin1", { role: "admin", permissions: { draftCourse: true } });
    await assertFails(
      admin.collection("courses").doc("c-admin").set(courseDoc({ authorUid: "admin1", collaboratorUids: [], crest: "alignment" })),
    );
  });
});
