/**
 * Rules tests for a group's `archived` field, and when and by whom it was
 * archived and restored (`archivedAt`, `archivedByUid`, `restoredAt`).
 *
 * Archiving and restoring a group go through
 * PATCH /api/courses/groups/[groupId]/archive (Admin SDK, which rules do not
 * bind), because archiving is refused while it would lose something: anybody
 * still in the group, somebody due at one of its sessions still to come, a
 * register of a session that met left unfinished. A rule cannot count those,
 * so no browser write changes the field at all, an admin's included, and no
 * group is created archived.
 *
 * WHO. Every writer the group's update rule admits (an admin, an approver,
 * the run's track lead and the group's own facilitator) is refused a change
 * to any of the four fields, and so are a course drafter and a member, and
 * no group is created carrying the three stamps. The route admits only an
 * admin and the lead of the programme that names the run; an approver, a
 * facilitator and a track lead are refused there too
 * (tests/course-group-archive.test.mjs).
 *
 * Everything else a browser could write to a group before stands as it was:
 * an admin's, an approver's, a track lead's and a facilitator's saves of the
 * group card still pass, including one that sends `archived` unchanged.
 *
 * Who may write a group at all is the courses suite's to hold.
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
  await getTestEnv("course-group-archived");
});
after(cleanup);
afterEach(clearData);

const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const removed = () => firebase.firestore.FieldValue.delete();

/** Everybody a group's update rule admits: an admin, an approver, the run's track lead, the group's facilitator. */
const GROUP_WRITERS = ["admin1", "approver", "lead", "facil"];
/** And the people it never admitted: a course drafter on nothing, and a member. */
const NOT_WRITERS = ["drafter", "learner"];

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("lead", { role: "member" });
  await seedUser("facil", { role: "member" });
  await seedUser("learner", { role: "member" });
}

function runDoc(overrides = {}) {
  return {
    courseId: "course1",
    courseTitle: "AI Safety Fundamentals",
    label: "Autumn 2026",
    academicYear: "2026/27",
    status: "running",
    startDate: "2026-10-05",
    weekPlan: [{ kind: "week", weekNumber: 1, weekId: "w01" }],
    authorUid: "drafter",
    admissionsReviewerUids: [],
    runFacilitatorUids: [],
    trackLeadUids: ["lead"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const SESSION = {
  weekday: 2,
  startTimeLocal: "18:00",
  durationMinutes: 90,
  location: "Portland A21",
  meetingUrl: null,
  notes: "",
};

function groupDoc(overrides = {}) {
  return {
    runId: "run1",
    courseId: "course1",
    name: "Group I",
    facilitatorUids: ["facil"],
    capacity: 12,
    memberCount: 0,
    session: { ...SESSION },
    sessionOverrides: {},
    campus: null,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Every way a browser could change the field, from a group in the state each starts in. */
const ARCHIVE_CHANGES = [
  ["archive it", groupDoc(), () => ({ archived: true, updatedAt: serverTimestamp() })],
  ["archive it inside a save of the card", groupDoc(), () => ({ name: "Group I", capacity: 12, archived: true, updatedAt: serverTimestamp() })],
  ["restore it", groupDoc({ archived: true }), () => ({ archived: false, updatedAt: serverTimestamp() })],
  ["restore it by removing the field", groupDoc({ archived: true }), () => ({ archived: removed() })],
  ["archive a group that never stored the field", groupDoc({ archived: undefined }), () => ({ archived: true })],
];

/**
 * What the pages still write to a group, and must still save. `adminOnly`
 * marks the name, the room, the capacity and the campus, which only an admin
 * writes from a browser (everybody else sets them through the routes on the
 * group's page: course-older-editor-locks.test.mjs).
 */
const KEPT_WRITES = [
  ["the name", () => ({ name: "Group I (Tue)", updatedAt: serverTimestamp() }), { adminOnly: true }],
  ["the room", () => ({ "session.location": "Trent Building A44", updatedAt: serverTimestamp() }), { adminOnly: true }],
  ["the capacity", () => ({ capacity: 10, updatedAt: serverTimestamp() }), { adminOnly: true }],
  ["the campus", () => ({ campus: "jubilee", updatedAt: serverTimestamp() }), { adminOnly: true }],
  ["a save that sends archived as it is", () => ({ name: "Group I", archived: false, updatedAt: serverTimestamp() })],
];

const groups = (db) => db.collection("courseGroups");

/** Drop the keys a test left undefined, the way a group written before the field existed has none. */
function stored(doc) {
  return Object.fromEntries(Object.entries(doc).filter(([, value]) => value !== undefined));
}

/** Publish has sent the run's groups out, as its route stamps it. */
const TOLD = new Date("2026-10-26T10:00:00Z");

/** Before the run's groups go out, and after: the field is pinned the same in both. */
const RUNS = [
  ["before the groups go out", {}],
  ["once the groups have gone out", { allocationPublishedAt: TOLD }],
];

async function seedWorld(group = groupDoc(), run = {}) {
  await seedCast();
  await seed(async (db) => {
    await db.collection("courseRuns").doc("run1").set(runDoc(run));
    await groups(db).doc("g1").set(stored(group));
  });
}

async function reseedGroup(group) {
  await seed(async (db) => {
    await groups(db).doc("g1").set(stored(group));
  });
}

async function refused(write, what) {
  try {
    await assertFails(write);
  } catch (error) {
    throw new Error(`expected a refusal: ${what}`, { cause: error });
  }
}
async function allowed(write, what) {
  try {
    await assertSucceeds(write);
  } catch (error) {
    throw new Error(`expected it to save: ${what}`, { cause: error });
  }
}

describe("courseGroups: no browser changes archived", () => {
  it("refuses every change to it, from every writer, admins included, before and after the groups go out", async () => {
    for (const [when, run] of RUNS) {
      await seedWorld(groupDoc(), run);
      for (const uid of [...GROUP_WRITERS, ...NOT_WRITERS]) {
        const db = await asUser(uid);
        for (const [label, start, patch] of ARCHIVE_CHANGES) {
          await reseedGroup(start);
          await refused(groups(db).doc("g1").update(patch()), `${uid}, ${when}: ${label}`);
        }
      }
      await clearData();
    }
  });

  it("refuses a whole document written over the group with archived changed", async () => {
    await seedWorld();
    for (const uid of GROUP_WRITERS) {
      const db = await asUser(uid);
      await reseedGroup(groupDoc());
      await refused(groups(db).doc("g1").set(groupDoc({ archived: true })), `${uid}: set archived`);
      await reseedGroup(groupDoc({ archived: true }));
      await refused(groups(db).doc("g1").set(groupDoc({ archived: false })), `${uid}: set restored`);
    }
  });

  it("refuses a group created archived, and creates one that is not, as the run editor does", async () => {
    await seedWorld();
    for (const uid of ["admin1", "approver"]) {
      const db = await asUser(uid);
      await refused(groups(db).doc(`born-archived-${uid}`).set(groupDoc({ facilitatorUids: [], archived: true })), `${uid}: born archived`);
      await allowed(groups(db).doc(`born-${uid}`).set(groupDoc({ facilitatorUids: [] })), `${uid}: born live`);
      await allowed(
        groups(db).doc(`born-no-field-${uid}`).set(stored(groupDoc({ facilitatorUids: [], archived: undefined }))),
        `${uid}: born with no archived field`,
      );
    }
  });
});

describe("courseGroups: every other write stands as it was", () => {
  it("still saves what the pages write, from every writer, on a live group and an archived one, before and after the groups go out", async () => {
    for (const [when, run] of RUNS) {
      await seedWorld(groupDoc(), run);
      for (const uid of GROUP_WRITERS) {
        const db = await asUser(uid);
        for (const archived of [false, true]) {
          for (const [label, patch, about = {}] of KEPT_WRITES) {
            await reseedGroup(groupDoc({ archived }));
            const write = patch();
            const what = `${uid}, ${when}: ${label}${archived ? " on an archived group" : ""}`;
            // Sending the stored value is no change; sending false to an archived group is one.
            if (archived && write.archived === false) {
              await refused(groups(db).doc("g1").update(write), what);
            } else if (about.adminOnly && uid !== "admin1") {
              await refused(groups(db).doc("g1").update(write), what);
            } else {
              await allowed(groups(db).doc("g1").update(write), what);
            }
          }
        }
      }
      await clearData();
    }
  });

  it("still saves an older group that never stored the field, without adding it", async () => {
    await seedWorld(groupDoc({ archived: undefined }));
    for (const uid of GROUP_WRITERS) {
      const db = await asUser(uid);
      // The notes: the name is the name route's for all but an admin now (course-older-editor-locks.test.mjs).
      await allowed(groups(db).doc("g1").update({ "session.notes": "Bring the reading.", updatedAt: serverTimestamp() }), uid);
    }
  });

  it("refuses the drafter and the member everything, as before", async () => {
    await seedWorld();
    for (const uid of NOT_WRITERS) {
      const db = await asUser(uid);
      for (const [label, patch] of KEPT_WRITES) {
        await refused(groups(db).doc("g1").update(patch()), `${uid}: ${label}`);
      }
    }
  });
});

/** When and by whom a group was archived, and when it was restored: the route's alone, as `archived` is. */
const ARCHIVED_AT = new Date("2026-11-02T10:15:00Z");
const RESTORED_AT = new Date("2026-11-09T09:00:00Z");
const STAMP_CHANGES = [
  ["set when it was archived", groupDoc({ archived: true }), () => ({ archivedAt: serverTimestamp() })],
  ["change when it was archived", groupDoc({ archived: true, archivedAt: ARCHIVED_AT }), () => ({ archivedAt: RESTORED_AT })],
  ["remove when it was archived", groupDoc({ archived: true, archivedAt: ARCHIVED_AT }), () => ({ archivedAt: removed() })],
  ["set who archived it", groupDoc({ archived: true }), () => ({ archivedByUid: "admin1" })],
  ["change who archived it", groupDoc({ archived: true, archivedByUid: "admin1" }), () => ({ archivedByUid: "facil" })],
  ["remove who archived it", groupDoc({ archived: true, archivedByUid: "admin1" }), () => ({ archivedByUid: removed() })],
  ["set when it was restored", groupDoc(), () => ({ restoredAt: serverTimestamp() })],
  ["change when it was restored", groupDoc({ restoredAt: RESTORED_AT }), () => ({ restoredAt: ARCHIVED_AT })],
  ["remove when it was restored", groupDoc({ restoredAt: RESTORED_AT }), () => ({ restoredAt: removed() })],
  ["set them inside a save of the card", groupDoc(), () => ({ name: "Group I", capacity: 12, archivedAt: ARCHIVED_AT, updatedAt: serverTimestamp() })],
];

describe("courseGroups: no browser changes when or by whom a group was archived or restored", () => {
  it("refuses every change to the three, from every writer, admins included, before and after the groups go out", async () => {
    for (const [when, run] of RUNS) {
      await seedWorld(groupDoc(), run);
      for (const uid of [...GROUP_WRITERS, ...NOT_WRITERS]) {
        const db = await asUser(uid);
        for (const [label, start, patch] of STAMP_CHANGES) {
          await reseedGroup(start);
          await refused(groups(db).doc("g1").update(patch()), `${uid}, ${when}: ${label}`);
        }
      }
      await clearData();
    }
  });

  it("refuses a group created carrying any of the three", async () => {
    await seedWorld();
    for (const uid of ["admin1", "approver"]) {
      const db = await asUser(uid);
      for (const [field, value] of [["archivedAt", ARCHIVED_AT], ["archivedByUid", "admin1"], ["restoredAt", RESTORED_AT]]) {
        await refused(groups(db).doc(`born-${field}-${uid}`).set(groupDoc({ facilitatorUids: [], [field]: value })), `${uid}: born with ${field}`);
      }
    }
  });

  it("still saves every writer's ordinary save of a group that carries them, leaving them as they are", async () => {
    await seedWorld(groupDoc({ archivedAt: ARCHIVED_AT, archivedByUid: "admin1", restoredAt: RESTORED_AT }));
    for (const uid of GROUP_WRITERS) {
      const db = await asUser(uid);
      await allowed(groups(db).doc("g1").update({ "session.notes": "Bring the reading.", updatedAt: serverTimestamp() }), `${uid}: the notes`);
      await allowed(
        groups(db).doc("g1").update({ "session.notes": "Bring the reading.", restoredAt: RESTORED_AT, updatedAt: serverTimestamp() }),
        `${uid}: the notes, sending when it was restored as it is`,
      );
    }
    for (const uid of NOT_WRITERS) {
      const db = await asUser(uid);
      await refused(groups(db).doc("g1").update({ "session.notes": "Bring the reading.", updatedAt: serverTimestamp() }), `${uid}: the notes`);
    }
  });
});
