/**
 * Rules tests for a group's time once its run's groups have gone out.
 *
 * A week has no stored date. It is dated from its group's day, start and
 * length (`session`), that week's override (`sessionOverrides`), the group's
 * own plan (`paceStartDate`, `paceWeekPlan`) and its run's `startDate` and
 * `weekPlan`. So once Publish has stamped the run's `allocationPublishedAt`,
 * a change to any of them can re-date a session that already met, and the
 * routes that make such changes (Admin SDK, which rules do not bind) refuse
 * to move a session whose register was taken. From then on no browser may
 * change, for a group of that run, the slot's day, start and length, the
 * overrides, `sessionModes`, `sessionChanges`, the pace pair,
 * `timeQuestionSince` or the run it belongs to; nor, for the run, its
 * `startDate`, `weekPlan` or `allocationPublishedAt`. Admins included.
 *
 * Before the groups go out every rule stands as it was, which this file runs
 * too: the same writes, by the same people, on a run without the stamp.
 *
 * And every write the pages still make after the groups have gone out
 * passes, in the shape the page makes it: the run editor's sections (its
 * start date and week plan read only) and the group card's save (the room,
 * the link and the notes, never the slot).
 *
 * Who may write a run or a group at all is the courses suite's to hold.
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
  await getTestEnv("course-told-times");
});
after(cleanup);
afterEach(clearData);

const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const removed = () => firebase.firestore.FieldValue.delete();

const ZERO_COUNTS = { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 };

/** When Publish sent the groups out, as the publish route stamps it. */
const TOLD = new Date("2026-10-26T10:00:00Z");

/** Who may update a group: an admin, an approver, the run's track lead, the group's named facilitator. */
const GROUP_WRITERS = ["admin1", "approver", "lead", "facil"];
/** Who may update a run: an admin, an approver, the drafter who owns it, its track lead. */
const RUN_WRITERS = ["admin1", "approver", "drafter", "lead"];
const NOT_ADMIN = (uid) => uid !== "admin1";

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("lead", { role: "member" });
  await seedUser("facil", { role: "member" });
  await seedUser("learner", { role: "member" });
}

const PLAN = [
  { kind: "week", weekNumber: 1, weekId: "w01" },
  { kind: "week", weekNumber: 2, weekId: "w02" },
  { kind: "week", weekNumber: 3, weekId: "w03" },
  { kind: "break", label: "Reading week" },
  { kind: "week", weekNumber: 4, weekId: "w04" },
];

/** A running run, as the run editor and the routes leave it: the drafter its author, "lead" its track lead. */
function runDoc(id, overrides = {}) {
  return {
    courseId: "course1",
    courseTitle: "AI Safety Fundamentals",
    label: "Autumn 2026",
    academicYear: "2026/27",
    status: "running",
    startDate: "2026-10-05",
    weekPlan: PLAN,
    applicationForm: [],
    applicationsOpenAt: null,
    applicationsCloseAt: null,
    applicationCap: null,
    authorUid: "drafter",
    admissionsReviewerUids: [],
    runFacilitatorUids: [],
    trackLeadUids: ["lead"],
    applicationCounts: { ...ZERO_COUNTS },
    groupCount: 1,
    channel: `cohort:${id}`,
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

/** A group as the routes leave it a few weeks into a term: a week moved, one held online, answers counted from a time. */
function groupDoc(runId, overrides = {}) {
  return {
    runId,
    courseId: "course1",
    name: "Group A",
    facilitatorUids: ["facil"],
    capacity: 12,
    memberCount: 6,
    session: { ...SESSION },
    sessionOverrides: { w02: { weekday: 3, startTimeLocal: "18:00" } },
    sessionModes: { w03: "virtual" },
    sessionChanges: { w02: { kind: "moved", reason: "Room clash" } },
    paceStartDate: null,
    paceWeekPlan: null,
    timeQuestionSince: TOLD,
    campus: "university-park",
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Every way a browser could change a group's time, each on its own. `server`
 * marks the fields every writer but an admin was already refused at any time
 * (groupPinnedFieldsUnchanged and its two neighbours): for those, the change
 * once the groups have gone out is that admins are refused too.
 */
const GROUP_TIME_CHANGES = [
  ["the day", () => ({ "session.weekday": 4 })],
  ["the start", () => ({ "session.startTimeLocal": "17:30" })],
  ["the length", () => ({ "session.durationMinutes": 60 })],
  ["the whole slot, with a new day", () => ({ session: { ...SESSION, weekday: 4 } })],
  ["the whole slot, removed", () => ({ session: removed() })],
  ["one week's override", () => ({ "sessionOverrides.w04": { weekday: 4 } })],
  ["every override, cleared", () => ({ sessionOverrides: {} })],
  ["every override, removed", () => ({ sessionOverrides: removed() })],
  ["one week's mode", () => ({ sessionModes: { w03: "virtual", w04: "virtual" } }), { server: true }],
  ["the record of changes", () => ({ sessionChanges: {} }), { server: true }],
  ["its own start date", () => ({ paceStartDate: "2026-10-12" }), { server: true }],
  ["its own plan", () => ({ paceWeekPlan: PLAN.slice(0, 3) }), { server: true }],
  ["when answers to the time question count from", () => ({ timeQuestionSince: new Date("2026-11-02T09:00:00Z") })],
  ["when answers count from, cleared", () => ({ timeQuestionSince: null })],
  ["the run it belongs to", () => ({ runId: "elsewhere" }), { server: true }],
];

/**
 * What the pages still write to a group once its run's groups have gone out,
 * in the shapes they write it. The group card in the run editor saves the
 * name, the capacity, the campus and the room, the link and the notes by
 * dotted path (`updateGroup`); its archive switch writes `archived`.
 */
const GROUP_KEPT_WRITES = [
  ["the room", () => ({ "session.location": "Trent Building A44", updatedAt: serverTimestamp() })],
  ["the meeting link", () => ({ "session.meetingUrl": "https://meet.example.com/group-a", updatedAt: serverTimestamp() })],
  ["the notes", () => ({ "session.notes": "Bring the reading.", updatedAt: serverTimestamp() })],
  ["the name", () => ({ name: "Group A (Tue)", updatedAt: serverTimestamp() })],
  ["the capacity", () => ({ capacity: 10, updatedAt: serverTimestamp() })],
  ["the campus", () => ({ campus: "jubilee", updatedAt: serverTimestamp() })],
  ["the archive switch", () => ({ archived: true, updatedAt: serverTimestamp() })],
  [
    "the group card's save once the groups have gone out",
    () => ({
      name: "Group A",
      capacity: 12,
      campus: "university-park",
      "session.location": "Portland A21",
      "session.meetingUrl": "https://meet.example.com/group-a",
      "session.notes": "Room changed for the term.",
      updatedAt: serverTimestamp(),
    }),
  ],
  [
    "a card opened before the groups went out, its day, time and length as stored",
    () => ({
      name: "Group A",
      capacity: 12,
      campus: "university-park",
      "session.weekday": 2,
      "session.startTimeLocal": "18:00",
      "session.durationMinutes": 90,
      "session.location": "Trent Building A44",
      "session.meetingUrl": null,
      "session.notes": "",
      updatedAt: serverTimestamp(),
    }),
  ],
  ["the whole slot, with only its room changed", () => ({ session: { ...SESSION, location: "Trent Building A44" } })],
];

/**
 * Every way a browser could change a run's dates, each on its own. `plan`
 * marks a change to `weekPlan`, which every writer but an admin was already
 * refused once the run left draft (weekPlanLockRespected).
 */
const RUN_DATE_CHANGES = [
  ["the start date", () => ({ startDate: "2026-10-12" })],
  ["a week added at the end", () => ({ weekPlan: [...PLAN, { kind: "week", weekNumber: 5, weekId: "w05" }] }), { plan: true }],
  ["a break added at the end", () => ({ weekPlan: [...PLAN, { kind: "break", label: "Exam week" }] }), { plan: true }],
  [
    "a break relabelled",
    () => ({ weekPlan: PLAN.map((entry) => (entry.kind === "break" ? { kind: "break", label: "Rest week" } : entry)) }),
    { plan: true },
  ],
  ["the plan cleared", () => ({ weekPlan: [] }), { plan: true }],
];

/** The stamp that says the groups have gone out, which no browser writes. */
const STAMP_CHANGES = [
  ["cleared", () => ({ allocationPublishedAt: null })],
  ["removed", () => ({ allocationPublishedAt: removed() })],
  ["moved", () => ({ allocationPublishedAt: new Date("2026-11-02T09:00:00Z") })],
];

/** What the run editor still writes once the groups have gone out, in its shapes (`updateRun`). */
const RUN_KEPT_WRITES = [
  [
    "the run details, which then leave the start date out",
    () => ({
      label: "Autumn 2026 (Tuesdays)",
      academicYear: "2026/27",
      cohort: { term: "autumn", year: 2026, number: 1 },
      updatedAt: serverTimestamp(),
    }),
  ],
  [
    "the run details from a tab opened before, the start date as stored",
    () => ({
      label: "Autumn 2026 (Tuesdays)",
      academicYear: "2026/27",
      startDate: "2026-10-05",
      cohort: { term: "autumn", year: 2026, number: 1 },
      updatedAt: serverTimestamp(),
    }),
  ],
  [
    "the application window",
    () => ({
      applicationsOpenAt: new Date("2026-09-01T09:00:00Z"),
      applicationsCloseAt: new Date("2026-09-20T23:00:00Z"),
      applicationCap: 40,
      updatedAt: serverTimestamp(),
    }),
  ],
  ["the application form", () => ({ applicationForm: [], updatedAt: serverTimestamp() })],
  [
    "the pitching week settings",
    () => ({
      pitchSettings: { pickLimit: 3, teamSizeMin: 2, teamSizeMax: 4, teamsMadeOn: null },
      teamsFrom: null,
      updatedAt: serverTimestamp(),
    }),
  ],
];

/** assertFails and assertSucceeds, saying which write and whose when one goes the other way. */
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

const groups = (db) => db.collection("courseGroups");
const runs = (db) => db.collection("courseRuns");

/** The run whose groups have gone out, the run whose have not, and a group in each. */
async function seedWorld() {
  await seedCast();
  await seed(async (db) => {
    await runs(db).doc("out").set(runDoc("out", { allocationPublishedAt: TOLD }));
    await runs(db).doc("notyet").set(runDoc("notyet"));
    await groups(db).doc("g-out").set(groupDoc("out"));
    await groups(db).doc("g-notyet").set(groupDoc("notyet"));
  });
}

/** Put a document back as seeded, so each write is tried on its own against the same starting point. */
async function reseed(path, data) {
  await seed(async (db) => {
    await db.doc(path).set(data);
  });
}

describe("courseGroups: a group's time once its run's groups have gone out", () => {
  it("refuses every change to it, from every writer, admins included", async () => {
    await seedWorld();
    for (const uid of [...GROUP_WRITERS, "learner"]) {
      const db = await asUser(uid);
      for (const [label, patch] of GROUP_TIME_CHANGES) {
        await refused(groups(db).doc("g-out").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("refuses a card opened before the groups went out putting back a day, time or length", async () => {
    await seedWorld();
    // The group's time was changed on its page meanwhile; the open card still holds the old one.
    await reseed("courseGroups/g-out", groupDoc("out", { session: { ...SESSION, weekday: 4, startTimeLocal: "17:30" } }));
    for (const uid of GROUP_WRITERS) {
      const db = await asUser(uid);
      await assertFails(
        groups(db).doc("g-out").update({
          name: "Group A",
          capacity: 12,
          campus: "university-park",
          "session.weekday": 2,
          "session.startTimeLocal": "18:00",
          "session.durationMinutes": 90,
          "session.location": "Portland A21",
          "session.meetingUrl": null,
          "session.notes": "",
          updatedAt: serverTimestamp(),
        }),
      );
    }
  });

  it("still saves everything else the pages write: the room, the link, the notes, the name, the capacity, the campus", async () => {
    await seedWorld();
    for (const uid of GROUP_WRITERS) {
      const db = await asUser(uid);
      for (const [label, patch] of GROUP_KEPT_WRITES) {
        await reseed("courseGroups/g-out", groupDoc("out"));
        await allowed(groups(db).doc("g-out").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("refuses a member everything, as before", async () => {
    await seedWorld();
    const db = await asUser("learner");
    for (const [label, patch] of GROUP_KEPT_WRITES) {
      await refused(groups(db).doc("g-out").update(patch()), label);
    }
  });
});

describe("courseGroups: before a run's groups have gone out, every rule stands as it was", () => {
  it("lets each writer change what they could change before", async () => {
    await seedWorld();
    for (const uid of GROUP_WRITERS) {
      const db = await asUser(uid);
      for (const [label, patch, about = {}] of GROUP_TIME_CHANGES) {
        await reseed("courseGroups/g-notyet", groupDoc("notyet"));
        const write = groups(db).doc("g-notyet").update(patch());
        // An admin may change any of them from a browser before the groups go
        // out. Everybody else was refused the server's fields at any time.
        if (NOT_ADMIN(uid) && about.server) {
          await refused(write, `${uid}: ${label}`);
        } else {
          await allowed(write, `${uid}: ${label}`);
        }
      }
    }
  });

  it("treats a run whose stamp is stored as null as not gone out", async () => {
    await seedWorld();
    await seed(async (db) => {
      await runs(db).doc("nulled").set(runDoc("nulled", { allocationPublishedAt: null }));
      await groups(db).doc("g-nulled").set(groupDoc("nulled"));
    });
    for (const uid of GROUP_WRITERS) {
      const db = await asUser(uid);
      await reseed("courseGroups/g-nulled", groupDoc("nulled"));
      await allowed(groups(db).doc("g-nulled").update({ "session.weekday": 4 }), uid);
    }
  });

  it("treats a group whose run is missing as not gone out", async () => {
    await seedWorld();
    await seed(async (db) => {
      await groups(db).doc("g-orphan").set(groupDoc("no-such-run"));
    });
    const admin = await asUser("admin1");
    await assertSucceeds(groups(admin).doc("g-orphan").update({ "session.weekday": 4 }));
    await assertSucceeds(groups(admin).doc("g-orphan").update({ sessionOverrides: {} }));
  });

  it("refuses a member everything, as before", async () => {
    await seedWorld();
    const db = await asUser("learner");
    for (const [label, patch] of GROUP_TIME_CHANGES) {
      await refused(groups(db).doc("g-notyet").update(patch()), label);
    }
  });
});

describe("courseRuns: a run's dates once its groups have gone out", () => {
  it("refuses a new start date or week plan, from every writer, admins included", async () => {
    await seedWorld();
    for (const uid of [...RUN_WRITERS, "facil", "learner"]) {
      const db = await asUser(uid);
      for (const [label, patch] of RUN_DATE_CHANGES) {
        await refused(runs(db).doc("out").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("refuses a run editor tab opened before saving a new start date", async () => {
    await seedWorld();
    for (const uid of RUN_WRITERS) {
      const db = await asUser(uid);
      await assertFails(
        runs(db).doc("out").update({
          label: "Autumn 2026",
          academicYear: "2026/27",
          startDate: "2026-10-12",
          cohort: { term: "autumn", year: 2026, number: 1 },
          updatedAt: serverTimestamp(),
        }),
        uid,
      );
    }
  });

  it("refuses a week plan change on a run still in draft whose groups have gone out", async () => {
    await seedWorld();
    await reseed("courseRuns/out", runDoc("out", { status: "draft", allocationPublishedAt: TOLD }));
    for (const uid of RUN_WRITERS) {
      const db = await asUser(uid);
      for (const [label, patch, about = {}] of RUN_DATE_CHANGES) {
        if (!about.plan) continue;
        await refused(runs(db).doc("out").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("keeps the stamp that says the groups have gone out as it is, for every writer", async () => {
    await seedWorld();
    for (const uid of [...RUN_WRITERS, "facil", "learner"]) {
      const db = await asUser(uid);
      for (const [label, patch] of STAMP_CHANGES) {
        await refused(runs(db).doc("out").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("still saves everything else the run editor writes", async () => {
    await seedWorld();
    for (const uid of RUN_WRITERS) {
      const db = await asUser(uid);
      for (const [label, patch] of RUN_KEPT_WRITES) {
        await reseed("courseRuns/out", runDoc("out", { allocationPublishedAt: TOLD }));
        await allowed(runs(db).doc("out").update(patch()), `${uid}: ${label}`);
      }
    }
  });
});

describe("courseRuns: before a run's groups have gone out, every rule stands as it was", () => {
  it("lets each writer change the start date, and an admin the plan of a running run", async () => {
    await seedWorld();
    for (const uid of RUN_WRITERS) {
      const db = await asUser(uid);
      for (const [label, patch, about = {}] of RUN_DATE_CHANGES) {
        await reseed("courseRuns/notyet", runDoc("notyet"));
        const write = runs(db).doc("notyet").update(patch());
        // Out of draft the plan was already pinned for everybody but an admin.
        if (NOT_ADMIN(uid) && about.plan) {
          await refused(write, `${uid}: ${label}`);
        } else {
          await allowed(write, `${uid}: ${label}`);
        }
      }
    }
  });

  it("lets each writer change the plan of a draft run", async () => {
    await seedWorld();
    for (const uid of RUN_WRITERS) {
      const db = await asUser(uid);
      for (const [label, patch, about = {}] of RUN_DATE_CHANGES) {
        if (!about.plan) continue;
        await reseed("courseRuns/notyet", runDoc("notyet", { status: "draft" }));
        await allowed(runs(db).doc("notyet").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("refuses a member everything, as before", async () => {
    await seedWorld();
    const db = await asUser("learner");
    for (const [label, patch] of [...RUN_DATE_CHANGES, ...RUN_KEPT_WRITES]) {
      await refused(runs(db).doc("notyet").update(patch()), label);
    }
  });
});
