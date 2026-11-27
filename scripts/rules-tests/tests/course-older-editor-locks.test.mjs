/**
 * Rules tests for what the older course editor can no longer write from a
 * browser while it is retired.
 *
 * 1. A GROUP'S ROOM, MEETING LINK AND CAMPUS (`session.location`,
 *    `session.meetingUrl`, `campus`). They are set on the group's page
 *    under its programme, through Admin SDK routes that write the group's
 *    History, and the older group card no longer sends them on a run a
 *    programme names. Every writer the group's update rule admits but an
 *    admin (an approver, the run's track lead, the group's own facilitator)
 *    is refused a change to any of the three, by dotted path and by a whole
 *    session map; an admin keeps them, which a run no programme names still
 *    needs. A save that leaves the three alone passes for every writer, and
 *    so does one that sends them as they are stored.
 *
 * 1b. EACH WEEK'S ROOM, MEETING LINK AND CAMPUS (`location`, `meetingUrl`
 *    and `campus` inside an entry of `sessionOverrides`, which every reader
 *    prefers to the group's own). Held as the group's are: every writer the
 *    update rule admits but an admin is refused adding, changing or
 *    removing any of the three in any week's entry, on an entry that exists
 *    and on a new one, by dotted path, by the entry written whole, by the
 *    entry or the whole map removed, and by the map written whole (as
 *    `updateGroup` writes it). A week's day, start and length still change,
 *    and the term's overrides still drop, before the groups go out, from
 *    every one of them; an admin keeps all of it. A facilitator of another
 *    group, a course drafter and a member are refused as before.
 *
 * 3. A GROUP'S NAME AND CAPACITY. They are changed on the group's page
 *    under its programme, through Admin SDK routes that refuse places below
 *    the people in the group and write the group's History, and the older
 *    group card no longer sends them on a run a programme names. As for the
 *    room: every writer but an admin is refused a change to either, a save
 *    that leaves both alone (or sends them as stored) passes for every
 *    writer, an admin's change passes, and creating a group with both is
 *    unchanged.
 *
 * 2. TAKING A WEEK BACK. No browser write takes a run's week's `published`
 *    from true to false, or removes it from a published week, admins
 *    included: PATCH /api/courses/runs/[runId]/weeks/[weekId]/published does
 *    it once it has checked nobody has started the week. No browser deletes
 *    a run's week at all, admins included: the routes remove weeks (the
 *    destroy cascade, Normalise week ids, the copies). Publishing, and
 *    every save that leaves `published` as it is, stands as before, and a
 *    week is still created unpublished.
 *
 * Who may write a group or a week at all is the courses suite's to hold.
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
  await getTestEnv("course-older-editor-locks");
});
after(cleanup);
afterEach(clearData);

const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const removed = () => firebase.firestore.FieldValue.delete();

/** Everybody the group's update rule admits but an admin. */
const GROUP_STAFF = ["approver", "lead", "facil"];
/** Everybody the run's weeks rule admits: an admin, an approver, the run's author, its track lead. */
const WEEK_WRITERS = ["admin1", "approver", "drafter", "lead"];

async function seedCast() {
  await seedUser("admin1", { role: "admin" });
  await seedUser("approver", { role: "member", permissions: { approveCourse: true } });
  await seedUser("drafter", { role: "member", permissions: { draftCourse: true } });
  await seedUser("lead", { role: "member" });
  await seedUser("facil", { role: "member" });
  await seedUser("learner", { role: "member" });
  await seedUser("facil2", { role: "member" });
}

function runDoc(overrides = {}) {
  return {
    courseId: "course1",
    courseTitle: "AI Safety Fundamentals",
    label: "Autumn 2026",
    academicYear: "2026/27",
    status: "running",
    startDate: "2026-10-05",
    weekPlan: [{ kind: "week", weekNumber: 1, weekId: "w01" }, { kind: "week", weekNumber: 2, weekId: "w02" }],
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
  meetingUrl: "https://meet.example.com/group-i",
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
    campus: "university-park",
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Every way a browser could change the room, the link or the campus, each on its own. */
const ROOM_CHANGES = [
  ["the room", () => ({ "session.location": "Trent Building A44", updatedAt: serverTimestamp() })],
  ["the room, emptied", () => ({ "session.location": "" })],
  ["the room, removed", () => ({ "session.location": removed() })],
  ["the meeting link", () => ({ "session.meetingUrl": "https://meet.example.com/elsewhere" })],
  ["the meeting link, cleared", () => ({ "session.meetingUrl": null })],
  ["the campus", () => ({ campus: "jubilee", updatedAt: serverTimestamp() })],
  ["the campus, cleared", () => ({ campus: null })],
  ["the campus, removed", () => ({ campus: removed() })],
  ["the whole session, with a new room", () => ({ session: { ...SESSION, location: "Trent Building A44" } })],
  ["the whole session, with no link", () => ({ session: { ...SESSION, meetingUrl: null } })],
  [
    "a card opened before the room was changed on the group's page",
    () => ({
      name: "Group I",
      capacity: 12,
      campus: "jubilee",
      "session.location": "Portland A21 (old)",
      "session.meetingUrl": null,
      "session.notes": "",
      updatedAt: serverTimestamp(),
    }),
  ],
];

/**
 * Every way a browser could change the name or the capacity, each on its own.
 * (Until the group's page had Places and Name, both were here among the
 * writes every writer saves; they are now refused to all but an admin.)
 */
const NAME_AND_PLACES_CHANGES = [
  ["the name", () => ({ name: "Group I (Tue)", updatedAt: serverTimestamp() })],
  ["the name, a change of case alone", () => ({ name: "group i" })],
  ["the capacity", () => ({ capacity: 10, updatedAt: serverTimestamp() })],
  ["the capacity, raised", () => ({ capacity: 13 })],
  ["the capacity, no limit", () => ({ capacity: null })],
  ["the capacity, removed", () => ({ capacity: removed() })],
  [
    "a card opened before the places were changed on the group's page",
    () => ({ name: "Group I", capacity: 8, "session.notes": "", updatedAt: serverTimestamp() }),
  ],
  [
    "a card opened before the group was renamed on its page",
    () => ({ name: "Group I (old)", capacity: 12, "session.notes": "", updatedAt: serverTimestamp() }),
  ],
];

/** What the older card still sends, and the group's other writes: every writer saves them. */
const KEPT_GROUP_WRITES = [
  ["the notes", () => ({ "session.notes": "Bring the reading.", updatedAt: serverTimestamp() })],
  ["the day and time, before the groups go out", () => ({ "session.weekday": 4, "session.startTimeLocal": "17:30" })],
  [
    "the card's save on a run a programme names, the three left out",
    () => ({ name: "Group I", capacity: 12, "session.notes": "", updatedAt: serverTimestamp() }),
  ],
  [
    "a save that sends the three as they are stored",
    () => ({
      name: "Group I",
      campus: "university-park",
      "session.location": "Portland A21",
      "session.meetingUrl": "https://meet.example.com/group-i",
      updatedAt: serverTimestamp(),
    }),
  ],
  ["the whole session, the three as stored", () => ({ session: { ...SESSION, notes: "Bring the reading." } })],
];

const groups = (db) => db.collection("courseGroups");
const weeks = (db) => db.collection("courseRuns").doc("run1").collection("weeks");

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

async function seedWorld() {
  await seedCast();
  await seed(async (db) => {
    await db.collection("courseRuns").doc("run1").set(runDoc());
    await groups(db).doc("g1").set(groupDoc());
  });
}

async function reseed(path, data) {
  await seed(async (db) => {
    await db.doc(path).set(data);
  });
}

describe("courseGroups: the room, the meeting link and the campus are the routes', for everybody but an admin", () => {
  it("refuses an approver, the run's track lead and the group's facilitator every change to the three", async () => {
    await seedWorld();
    for (const uid of GROUP_STAFF) {
      const db = await asUser(uid);
      for (const [label, patch] of ROOM_CHANGES) {
        await reseed("courseGroups/g1", groupDoc());
        await refused(groups(db).doc("g1").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("refuses the same changes to a group that stored none of the three", async () => {
    await seedWorld();
    const bare = groupDoc({ session: { weekday: 2, startTimeLocal: "18:00", durationMinutes: 90, notes: "" } });
    delete bare.campus;
    for (const uid of GROUP_STAFF) {
      const db = await asUser(uid);
      for (const patch of [{ "session.location": "Portland A21" }, { "session.meetingUrl": "https://meet.example.com/x" }, { campus: "jubilee" }]) {
        await reseed("courseGroups/g1", bare);
        await refused(groups(db).doc("g1").update(patch), `${uid}: ${JSON.stringify(patch)}`);
      }
      // Sending nothing of them, and a null link or campus where none is stored, is no change.
      await reseed("courseGroups/g1", bare);
      await allowed(groups(db).doc("g1").update({ "session.notes": "Bring the reading.", "session.meetingUrl": null, campus: null }), `${uid}: nulls where none stored`);
    }
  });

  it("lets an admin change all three, which a run no programme names still needs", async () => {
    await seedWorld();
    const db = await asUser("admin1");
    for (const [label, patch] of ROOM_CHANGES) {
      await reseed("courseGroups/g1", groupDoc());
      await allowed(groups(db).doc("g1").update(patch()), `admin1: ${label}`);
    }
  });

  it("still saves every write that leaves the three alone, from every writer", async () => {
    await seedWorld();
    for (const uid of ["admin1", ...GROUP_STAFF]) {
      const db = await asUser(uid);
      for (const [label, patch] of KEPT_GROUP_WRITES) {
        await reseed("courseGroups/g1", groupDoc());
        await allowed(groups(db).doc("g1").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("refuses a course drafter and a member everything, as before", async () => {
    await seedWorld();
    for (const uid of ["drafter", "learner"]) {
      const db = await asUser(uid);
      for (const [label, patch] of [...KEPT_GROUP_WRITES, ...ROOM_CHANGES, ...NAME_AND_PLACES_CHANGES]) {
        await reseed("courseGroups/g1", groupDoc());
        await refused(groups(db).doc("g1").update(patch()), `${uid}: ${label}`);
      }
    }
  });
});

/**
 * The weeks set apart, as the routes store them: week 3 moved to another
 * room, link and campus at a later start; week 4 a later start alone.
 */
const WEEK_3 = {
  startTimeLocal: "19:00",
  location: "Trent Building A44",
  meetingUrl: "https://meet.example.com/week-3",
  campus: "jubilee",
};
const WEEK_4 = { startTimeLocal: "17:00" };
const OVERRIDES = () => ({ w03: { ...WEEK_3 }, w04: { ...WEEK_4 } });
const withWeeks = () => groupDoc({ sessionOverrides: OVERRIDES() });

/** Every way a browser could add, change or remove a week's room, link or campus, each on its own. */
const WEEK_ROOM_CHANGES = [
  ...["location", "meetingUrl", "campus"].flatMap((field) => {
    const other = { location: "Portland A21", meetingUrl: "https://meet.example.com/elsewhere", campus: "university-park" }[field];
    return [
      [`week 3's ${field}, changed`, () => ({ [`sessionOverrides.w03.${field}`]: other })],
      [`week 3's ${field}, removed`, () => ({ [`sessionOverrides.w03.${field}`]: removed() })],
      [`week 4's ${field}, added`, () => ({ [`sessionOverrides.w04.${field}`]: other })],
      [`a new week 5 with a ${field}`, () => ({ "sessionOverrides.w05": { weekday: 4, [field]: other } })],
      [
        `the whole map, week 3's ${field} changed`,
        () => ({ sessionOverrides: { ...OVERRIDES(), w03: { ...WEEK_3, [field]: other } }, updatedAt: serverTimestamp() }),
      ],
      [
        `the whole map, a new week 5 with a ${field}`,
        () => ({ sessionOverrides: { ...OVERRIDES(), w05: { weekday: 4, [field]: other } } }),
      ],
    ];
  }),
  ["week 3 written whole, without the three", () => ({ "sessionOverrides.w03": { startTimeLocal: "19:00" } })],
  ["week 3 removed", () => ({ "sessionOverrides.w03": removed() })],
  ["week 3 set to null", () => ({ "sessionOverrides.w03": null })],
  ["the whole map, week 3 left out", () => ({ sessionOverrides: { w04: { ...WEEK_4 } } })],
  ["the whole map, week 3's room moved to week 4", () => ({ sessionOverrides: { w03: { startTimeLocal: "19:00" }, w04: { ...WEEK_4, location: WEEK_3.location } } })],
  ["the whole map, emptied", () => ({ sessionOverrides: {} })],
  ["the whole map, removed", () => ({ sessionOverrides: removed() })],
  ["the whole map, null", () => ({ sessionOverrides: null })],
];

/** A week's time, and the term's overrides dropped, before the groups go out: every writer saves them. */
const KEPT_WEEK_WRITES = [
  ["week 4's start, moved", () => ({ "sessionOverrides.w04.startTimeLocal": "16:30", updatedAt: serverTimestamp() })],
  ["week 3's start, moved, its room left as it is", () => ({ "sessionOverrides.w03.startTimeLocal": "18:30" })],
  ["a new week 5, a day and a start", () => ({ "sessionOverrides.w05": { weekday: 4, startTimeLocal: "18:00" } })],
  ["week 4 removed", () => ({ "sessionOverrides.w04": removed() })],
  [
    "the whole map, week 4's length changed and week 3 sent as stored",
    () => ({ sessionOverrides: { ...OVERRIDES(), w04: { ...WEEK_4, durationMinutes: 60 } }, updatedAt: serverTimestamp() }),
  ],
  ["the whole map, sent as stored", () => ({ sessionOverrides: OVERRIDES() })],
  ["the notes, the weeks left out", () => ({ "session.notes": "Bring the reading." })],
];

describe("courseGroups: each week's room, meeting link and campus are the routes', for everybody but an admin", () => {
  it("refuses an approver, the run's track lead and the group's facilitator every change to the three, in any week", async () => {
    await seedWorld();
    for (const uid of GROUP_STAFF) {
      const db = await asUser(uid);
      for (const [label, patch] of WEEK_ROOM_CHANGES) {
        await reseed("courseGroups/g1", withWeeks());
        await refused(groups(db).doc("g1").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("still saves, from every writer, a week's time, a new week with a time and a week without a room removed", async () => {
    await seedWorld();
    for (const uid of ["admin1", ...GROUP_STAFF]) {
      const db = await asUser(uid);
      for (const [label, patch] of KEPT_WEEK_WRITES) {
        await reseed("courseGroups/g1", withWeeks());
        await allowed(groups(db).doc("g1").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("still drops the term's overrides, from every writer, when no week carries a room, a link or a campus", async () => {
    await seedWorld();
    const timesOnly = { w02: { weekday: 3 }, w04: { ...WEEK_4 }, w05: { startTimeLocal: "18:30", durationMinutes: 60 } };
    for (const uid of ["admin1", ...GROUP_STAFF]) {
      const db = await asUser(uid);
      for (const [label, patch] of [
        ["emptied", { sessionOverrides: {} }],
        ["removed", { sessionOverrides: removed() }],
        ["one week left", { sessionOverrides: { w04: { ...WEEK_4 } } }],
      ]) {
        await reseed("courseGroups/g1", groupDoc({ sessionOverrides: timesOnly }));
        await allowed(groups(db).doc("g1").update(patch), `${uid}: the overrides ${label}`);
      }
    }
  });

  it("holds a week's room in a full map: the twentieth week as the first", async () => {
    await seedWorld();
    const full = {};
    for (let n = 1; n <= 20; n += 1) full[`w${String(n).padStart(2, "0")}`] = { startTimeLocal: "18:30" };
    full.w20 = { ...WEEK_3 };
    for (const uid of GROUP_STAFF) {
      const db = await asUser(uid);
      await reseed("courseGroups/g1", groupDoc({ sessionOverrides: full }));
      await refused(groups(db).doc("g1").update({ "sessionOverrides.w20.location": "Portland A21" }), `${uid}: the twentieth week's room`);
      await reseed("courseGroups/g1", groupDoc({ sessionOverrides: full }));
      await refused(groups(db).doc("g1").update({ "sessionOverrides.w20": removed() }), `${uid}: the twentieth week removed`);
      await reseed("courseGroups/g1", groupDoc({ sessionOverrides: full }));
      await allowed(groups(db).doc("g1").update({ "sessionOverrides.w19.startTimeLocal": "17:00" }), `${uid}: the nineteenth week's start`);
      await reseed("courseGroups/g1", groupDoc({ sessionOverrides: full }));
      await allowed(groups(db).doc("g1").update({ "sessionOverrides.w01": removed() }), `${uid}: the first week removed`);
    }
  });

  it("lets an admin make every one of those changes, which a run no programme names still needs", async () => {
    await seedWorld();
    const db = await asUser("admin1");
    for (const [label, patch] of WEEK_ROOM_CHANGES) {
      await reseed("courseGroups/g1", withWeeks());
      await allowed(groups(db).doc("g1").update(patch()), `admin1: ${label}`);
    }
  });

  it("refuses a facilitator of another group, a course drafter and a member every week write, as before", async () => {
    await seedWorld();
    await reseed("courseGroups/g2", groupDoc({ name: "Group II", facilitatorUids: ["facil2"] }));
    for (const uid of ["facil2", "drafter", "learner"]) {
      const db = await asUser(uid);
      for (const [label, patch] of [...KEPT_WEEK_WRITES, ...WEEK_ROOM_CHANGES]) {
        await reseed("courseGroups/g1", withWeeks());
        await refused(groups(db).doc("g1").update(patch()), `${uid}: ${label}`);
      }
    }
  });
});

describe("courseGroups: the name and the capacity are the routes', for everybody but an admin", () => {
  it("refuses an approver, the run's track lead and the group's facilitator every change to either", async () => {
    await seedWorld();
    for (const uid of GROUP_STAFF) {
      const db = await asUser(uid);
      for (const [label, patch] of NAME_AND_PLACES_CHANGES) {
        await reseed("courseGroups/g1", groupDoc());
        await refused(groups(db).doc("g1").update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("refuses a capacity set on a group that stored none, and passes a null sent where none is stored", async () => {
    await seedWorld();
    const bare = groupDoc();
    delete bare.capacity;
    for (const uid of GROUP_STAFF) {
      const db = await asUser(uid);
      await reseed("courseGroups/g1", bare);
      await refused(groups(db).doc("g1").update({ capacity: 8 }), `${uid}: a capacity where none is stored`);
      await reseed("courseGroups/g1", bare);
      await allowed(groups(db).doc("g1").update({ capacity: null, "session.notes": "Bring the reading." }), `${uid}: a null where none is stored`);
    }
  });

  it("lets an admin change both, which a run no programme names still needs", async () => {
    await seedWorld();
    const db = await asUser("admin1");
    for (const [label, patch] of NAME_AND_PLACES_CHANGES) {
      await reseed("courseGroups/g1", groupDoc());
      await allowed(groups(db).doc("g1").update(patch()), `admin1: ${label}`);
    }
  });

  it("still saves, from every writer, a save that leaves both alone and one that sends them as they are stored", async () => {
    await seedWorld();
    for (const uid of ["admin1", ...GROUP_STAFF]) {
      const db = await asUser(uid);
      for (const [label, patch] of [
        ["both left out", () => ({ "session.notes": "Bring the reading.", updatedAt: serverTimestamp() })],
        ["both sent as stored", () => ({ name: "Group I", capacity: 12, "session.notes": "", updatedAt: serverTimestamp() })],
        ["the whole document written back as stored", () => groupDoc({ updatedAt: serverTimestamp() })],
      ]) {
        await reseed("courseGroups/g1", groupDoc());
        const ref = groups(db).doc("g1");
        await allowed(label.startsWith("the whole") ? ref.set(patch()) : ref.update(patch()), `${uid}: ${label}`);
      }
    }
  });

  it("still lets an admin and an approver create a group with its name and capacity", async () => {
    await seedWorld();
    for (const uid of ["admin1", "approver"]) {
      const db = await asUser(uid);
      await allowed(
        groups(db).doc(`new-${uid}`).set(groupDoc({ name: "Group J", capacity: 8, facilitatorUids: [] })),
        `${uid}: create a group`,
      );
    }
  });
});

function weekDoc(overrides = {}) {
  return {
    weekNumber: 1,
    title: "Week 1",
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("courseRuns weeks: no browser write takes a published week back", () => {
  it("refuses unpublishing, removing the field and writing the week over unpublished, from every writer, admins included", async () => {
    await seedWorld();
    for (const uid of WEEK_WRITERS) {
      const db = await asUser(uid);
      for (const [label, write] of [
        ["published false", (ref) => ref.update({ published: false, updatedAt: serverTimestamp() })],
        ["inside the week details' save", (ref) => ref.update({ weekNumber: 1, title: "Week 1", summary: "", estimatedMinutes: null, published: false, pitching: false })],
        ["published removed", (ref) => ref.update({ published: removed() })],
        ["the whole week written over, unpublished", (ref) => ref.set(weekDoc({ published: false }))],
      ]) {
        await reseed("courseRuns/run1/weeks/w01", weekDoc());
        await refused(write(weeks(db).doc("w01")), `${uid}: ${label}`);
      }
    }
  });

  it("still publishes a week, saves a published week that stays published, and saves an unpublished one", async () => {
    await seedWorld();
    for (const uid of WEEK_WRITERS) {
      const db = await asUser(uid);
      await reseed("courseRuns/run1/weeks/w01", weekDoc({ published: false }));
      await allowed(weeks(db).doc("w01").update({ published: true, updatedAt: serverTimestamp() }), `${uid}: publish`);
      await allowed(
        weeks(db).doc("w01").update({ weekNumber: 1, title: "Week 1, again", summary: "", estimatedMinutes: null, pitching: false }),
        `${uid}: the details' save of a published week, published left out`,
      );
      await allowed(weeks(db).doc("w01").update({ published: true, title: "Week 1" }), `${uid}: published sent as it is`);
      await reseed("courseRuns/run1/weeks/w01", weekDoc({ published: false }));
      await allowed(weeks(db).doc("w01").update({ published: false, title: "Draft" }), `${uid}: an unpublished week saved unpublished`);
      const neverStored = weekDoc();
      delete neverStored.published;
      await reseed("courseRuns/run1/weeks/w01", neverStored);
      await allowed(weeks(db).doc("w01").update({ title: "Never stored it" }), `${uid}: a week that never stored the field`);
    }
  });

  it("still creates a week unpublished, as the week editor does when it opens a new slot", async () => {
    await seedWorld();
    for (const uid of WEEK_WRITERS) {
      const db = await asUser(uid);
      const id = "w02";
      await seed(async (admin) => {
        await admin.doc(`courseRuns/run1/weeks/${id}`).delete();
      });
      await allowed(weeks(db).doc(id).set(weekDoc({ weekNumber: 2, title: "", published: false })), `${uid}: created unpublished`);
    }
  });

  it("refuses every browser a week's delete, admins included: removing a week is the routes'", async () => {
    await seedWorld();
    for (const uid of [...WEEK_WRITERS, "facil", "learner"]) {
      const db = await asUser(uid);
      for (const published of [true, false]) {
        await reseed("courseRuns/run1/weeks/w01", weekDoc({ published }));
        await refused(weeks(db).doc("w01").delete(), `${uid}: delete a week, published ${published}`);
      }
    }
  });

  it("refuses a facilitator and a member any week write, as before", async () => {
    await seedWorld();
    await reseed("courseRuns/run1/weeks/w01", weekDoc());
    for (const uid of ["facil", "learner"]) {
      const db = await asUser(uid);
      await refused(weeks(db).doc("w01").update({ title: "Changed" }), uid);
    }
  });
});
