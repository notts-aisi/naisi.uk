/**
 * "WEEK N IS OPEN" TO SOMEBODY ON A ONE-WEEK VISIT, THROUGH THE REAL JOB:
 * never two, and one wherever one is possible, whenever the visit is
 * arranged against the two groups' sends.
 *
 * Each group's email goes once, six days before its session at 9am in
 * London, to the people due at that session when it goes. A person's email
 * of a week is claimed once across every group of the run (a marker per
 * person and week), and somebody who belongs to a group but visits another
 * that week is in their own group's send too, so whichever send reaches
 * them first is the one they get, about the session they go to.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is `tests/lib/registerWorld.mjs` with the schedule switched on:
 * Group A (Ana) meets on Mondays at 6pm, Group B (Amara, Chloe, Farah) on
 * Tuesdays at 6pm. Week 5 is Group A's Mon 16 Nov and Group B's Tue 17 Nov,
 * so Group A's email goes on Tue 10 Nov at 9am and Group B's on Wed 11 Nov
 * at 9am.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { GROUP, RUN, jobContext, makeWorld, seedWorld } from "./lib/registerWorld.mjs";

const START = new Date("2026-11-04T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: START });
const at = (instant) => mock.timers.setTime(new Date(instant).getTime());

const made = makeWorld("__visitWeekOpen");
const { world, reset, lib } = made;
const { nextWeekEmailJob } = await lib("scheduler", "jobs", "nextWeekEmail.ts");
const { previewNextWeekEmails } = await lib("courses", "nextWeekEmail.ts");
const { resolveSessions } = await lib("courses", "sessions.ts");
const { normalizeCourseRun } = await lib("firestore", "courses.ts");
const { normalizeCourseGroup } = await lib("firestore", "courseGroups.ts");
const { DEFAULT_COURSES_CONFIG } = await lib("firestore", "config.ts");
const accountDeletion = await lib("firestore", "accountDeletion.ts");
const endingWords = await made.loadTs(join("features", "courses", "registerEndingWords.ts"));

const seatPath = (uid) => `courseEnrolments/${RUN}__${uid}`;
const runOf = () => normalizeCourseRun(RUN, world.db.read(`courseRuns/${RUN}`));
const groupOf = (id) => normalizeCourseGroup(id, world.db.read(`courseGroups/${id}`));
const HOUR = 3_600_000;

/** A visit for week 5, as the visit's save writes one. */
const visitFor = (uid, groupId, instant) => world.db.poke(seatPath(uid), { visits: [{ weekNumber: 5, groupId, arrangedByUid: "zach", arrangedAt: new Date(instant) }] });

/**
 * Every hour from `from` for `hours`, the job's tick; `before(instant)` runs
 * first each hour. Answers each week 5 email that went: the hour, to whom, and
 * the line saying when the session is.
 */
async function ticks(from, hours, before = () => {}) {
  const got = [];
  for (let h = 0; h < hours; h += 1) {
    const instant = new Date(new Date(from).getTime() + h * HOUR);
    before(instant);
    at(instant);
    await nextWeekEmailJob.handler(jobContext(nextWeekEmailJob, instant).ctx);
    for (const message of world.mail) {
      if (!/Week 5/.test(message.subject)) continue;
      // The preheader says when the session is: "... Your next session is Mon 16 Nov at 6pm in Room A13."
      const when = /(Mon|Tue) 1[67] Nov/.exec(message.react?.props?.preheader ?? "")?.[0] ?? null;
      got.push([instant.toISOString().slice(0, 13), message.to.split("@")[0], when]);
    }
    world.mail.length = 0;
  }
  return got;
}
const to = (got, uid) => got.filter(([, who]) => who === uid);

beforeEach(() => {
  at(START);
  reset(seedWorld({ scheduled: true }));
  for (const n of [4, 5]) world.db.poke(`courseRuns/${RUN}/weeks/w0${n}`, { published: true });
});

describe("Chloe (Group B, Tuesdays) visits Group A (Mondays) for week 5", () => {
  test("arranged before both emails: one, Group A's, about Monday", async () => {
    const got = await ticks(START, 24 * 12, (instant) => {
      if (instant.getTime() === new Date("2026-11-05T12:00:00Z").getTime()) visitFor("chloe", GROUP.a, instant);
    });
    assert.deepEqual(to(got, "chloe"), [["2026-11-10T09", "chloe", "Mon 16 Nov"]]);
  });

  test("arranged between Group A's email and Group B's: one, in Group B's send, about the Monday she goes to", async () => {
    const got = await ticks(START, 24 * 12, (instant) => {
      if (instant.getTime() === new Date("2026-11-10T12:00:00Z").getTime()) visitFor("chloe", GROUP.a, instant);
    });
    assert.deepEqual(to(got, "chloe"), [["2026-11-11T09", "chloe", "Mon 16 Nov"]]);
  });

  test("arranged after both emails: the one she already had, Group B's", async () => {
    const got = await ticks(START, 24 * 12, (instant) => {
      if (instant.getTime() === new Date("2026-11-11T12:00:00Z").getTime()) visitFor("chloe", GROUP.a, instant);
    });
    assert.deepEqual(to(got, "chloe"), [["2026-11-11T09", "chloe", "Tue 17 Nov"]]);
  });

  test("everybody else is emailed exactly as with no visit", async () => {
    const got = await ticks(START, 24 * 12, (instant) => {
      if (instant.getTime() === new Date("2026-11-10T12:00:00Z").getTime()) visitFor("chloe", GROUP.a, instant);
    });
    assert.deepEqual(
      got.filter(([, who]) => who !== "chloe"),
      [
        ["2026-11-10T09", "ana", "Mon 16 Nov"],
        ["2026-11-11T09", "amara", "Tue 17 Nov"],
        ["2026-11-11T09", "farah", "Tue 17 Nov"],
      ],
    );
  });

  test("her own copy of week 5 not published at Group A's send: left out of it and out of its count; Group B's send, once her copy is published, is hers", async () => {
    world.db.seed(`courseGroups/${GROUP.b}/weeks/w05`, { ...world.db.read(`courseRuns/${RUN}/weeks/w05`), published: false, groupId: GROUP.b, runId: RUN });
    world.db.poke(seatPath("chloe"), { visits: [{ weekNumber: 5, groupId: GROUP.a, arrangedByUid: "zach", arrangedAt: START }] });
    const run = runOf();
    const groupA = groupOf(GROUP.a);
    const session = resolveSessions(run, groupA).find((each) => each.sessionKey === "w05");
    const preview = await previewNextWeekEmails(world.db, { run, group: groupA, sessions: [session], config: DEFAULT_COURSES_CONFIG, appUrl: "https://naisi.invalid" });
    assert.deepEqual(preview.get("w05"), { goes: true, emails: 1 });
    const first = await ticks(START, 24 * 12);
    assert.deepEqual(first, [["2026-11-10T09", "ana", "Mon 16 Nov"]]);
    world.db.poke(`courseGroups/${GROUP.b}/weeks/w05`, { published: true });
    const later = await ticks(new Date(START.getTime() + 24 * 12 * HOUR), 24 * 2);
    assert.deepEqual(to(later, "chloe"), [["2026-11-16T12", "chloe", "Mon 16 Nov"]]);
  });

  test("her own copy published only after both sends: none, and nobody else is sent twice", async () => {
    world.db.seed(`courseGroups/${GROUP.b}/weeks/w05`, { ...world.db.read(`courseRuns/${RUN}/weeks/w05`), published: false, groupId: GROUP.b, runId: RUN });
    world.db.poke(seatPath("chloe"), { visits: [{ weekNumber: 5, groupId: GROUP.a, arrangedByUid: "zach", arrangedAt: START }] });
    const first = await ticks(START, 24 * 14);
    world.db.poke(`courseGroups/${GROUP.b}/weeks/w05`, { published: true });
    const later = await ticks(new Date(START.getTime() + 24 * 14 * HOUR), 24);
    assert.deepEqual(to([...first, ...later], "chloe"), []);
    assert.deepEqual(to([...first, ...later], "ana"), [["2026-11-10T09", "ana", "Mon 16 Nov"]]);
  });

  test("a visit called off after Group A's email went to her: Group B's does not send her a second", async () => {
    const got = await ticks(START, 24 * 12, (instant) => {
      if (instant.getTime() === new Date("2026-11-05T12:00:00Z").getTime()) visitFor("chloe", GROUP.a, instant);
      if (instant.getTime() === new Date("2026-11-10T12:00:00Z").getTime()) world.db.poke(seatPath("chloe"), { visits: [] });
    });
    assert.deepEqual(to(got, "chloe"), [["2026-11-10T09", "chloe", "Mon 16 Nov"]]);
  });
});

describe("Ana (Group A, Mondays) visits Group B (Tuesdays) for week 5", () => {
  test("arranged before both emails: one, in Group A's send, about the Tuesday she goes to", async () => {
    const got = await ticks(START, 24 * 12, (instant) => {
      if (instant.getTime() === new Date("2026-11-05T12:00:00Z").getTime()) visitFor("ana", GROUP.b, instant);
    });
    assert.deepEqual(to(got, "ana"), [["2026-11-10T09", "ana", "Tue 17 Nov"]]);
  });

  test("arranged between Group A's email and Group B's: the one she already had, Group A's, never a second", async () => {
    const got = await ticks(START, 24 * 12, (instant) => {
      if (instant.getTime() === new Date("2026-11-10T12:00:00Z").getTime()) visitFor("ana", GROUP.b, instant);
    });
    assert.deepEqual(to(got, "ana"), [["2026-11-10T09", "ana", "Mon 16 Nov"]]);
  });
});

describe("with no visit anywhere", () => {
  test("each person is sent their own group's week 5 email once, at its hour, and each register's count is its group's people", async () => {
    const run = runOf();
    const counts = {};
    for (const id of [GROUP.a, GROUP.b]) {
      const group = groupOf(id);
      const session = resolveSessions(run, group).find((each) => each.sessionKey === "w05");
      counts[id] = (await previewNextWeekEmails(world.db, { run, group, sessions: [session], config: DEFAULT_COURSES_CONFIG, appUrl: "https://naisi.invalid" })).get("w05");
    }
    assert.deepEqual(counts, { [GROUP.a]: { goes: true, emails: 1 }, [GROUP.b]: { goes: true, emails: 3 } });
    const got = await ticks(START, 24 * 12);
    assert.deepEqual(got, [
      ["2026-11-10T09", "ana", "Mon 16 Nov"],
      ["2026-11-11T09", "amara", "Tue 17 Nov"],
      ["2026-11-11T09", "chloe", "Tue 17 Nov"],
      ["2026-11-11T09", "farah", "Tue 17 Nov"],
    ]);
  });
});

describe("a claim on the week's email that cannot be written", () => {
  test("every person's claim failing to write: the same people are emailed at the same hours as with claims written", async () => {
    const realCollection = world.db.collection.bind(world.db);
    world.db.collection = (name) => {
      const collection = realCollection(name);
      if (name !== "courseNudges") return collection;
      const realDoc = collection.doc.bind(collection);
      return Object.assign(Object.create(Object.getPrototypeOf(collection)), collection, {
        doc: (id) => {
          const ref = realDoc(id);
          if (String(id).startsWith("wkopen__")) ref.create = async () => Promise.reject(Object.assign(new Error("unavailable"), { code: 14 }));
          return ref;
        },
      });
    };
    try {
      const got = await ticks(START, 24 * 12);
      assert.deepEqual(got, [
        ["2026-11-10T09", "ana", "Mon 16 Nov"],
        ["2026-11-11T09", "amara", "Tue 17 Nov"],
        ["2026-11-11T09", "chloe", "Tue 17 Nov"],
        ["2026-11-11T09", "farah", "Tue 17 Nov"],
      ]);
    } finally {
      world.db.collection = realCollection;
    }
  });
});

describe("everybody a send would reach has had the week's email elsewhere", () => {
  test("Group B down to Chloe, who visits Group A and had Group A's: Group B's register says so truly, and nothing is claimed", async () => {
    for (const uid of ["amara", "farah"]) world.db.poke(seatPath(uid), { status: "withdrawn" });
    world.db.poke(seatPath("chloe"), { visits: [{ weekNumber: 5, groupId: GROUP.a, arrangedByUid: "zach", arrangedAt: START }] });
    const got = await ticks(START, 24 * 12);
    assert.deepEqual(to(got, "chloe"), [["2026-11-10T09", "chloe", "Mon 16 Nov"]]);
    const run = runOf();
    const groupB = groupOf(GROUP.b);
    const session = resolveSessions(run, groupB).find((each) => each.sessionKey === "w05");
    const preview = await previewNextWeekEmails(world.db, { run, group: groupB, sessions: [session], config: DEFAULT_COURSES_CONFIG, appUrl: "https://naisi.invalid" });
    assert.deepEqual(preview.get("w05"), { goes: false, why: "had" });
    assert.ok(!world.db.paths().some((path) => path.startsWith(`courseNudges/gnudge__${RUN}__${GROUP.b}__`) && world.db.read(path).weekNumber === 5));
    // What the register's confirm says of it: the true sentence, never "nobody is set up to receive email".
    assert.equal(
      endingWords.pushEmailSentence("Group B", { kind: "held", why: "had", weekNumber: 5 }),
      "Nobody is emailed: everybody in Group B has already had week 5’s email from another group.",
    );
  });
});

describe("the claims carry the run and the person, and go with either", () => {
  test("each claim names its run (a run's destroy drains them by it), and deleting an account takes its claims and nothing else", async () => {
    await ticks(START, 24 * 12);
    const claims = world.db.paths().filter((path) => path.startsWith("courseNudges/wkopen__"));
    // Weeks 4 and 5 are both published and both sent in these twelve days: two each.
    assert.equal(claims.length, 8);
    for (const path of claims) assert.equal(world.db.read(path).runId, RUN, path);
    world.db.seed("courseNudges/other__chloe", { kind: "week-remind-by-hand", uid: "chloe" });
    const removed = await accountDeletion.deleteWeekEmailClaims(world.db, "chloe");
    assert.equal(removed, 2);
    assert.deepEqual(
      world.db.paths().filter((path) => path.startsWith("courseNudges/wkopen__")).map((path) => world.db.read(path).uid).sort(),
      ["amara", "amara", "ana", "ana", "farah", "farah"],
    );
    assert.ok(world.db.read("courseNudges/other__chloe"), "another kind's record stays");
  });
});
