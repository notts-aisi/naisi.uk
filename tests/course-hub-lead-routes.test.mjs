/**
 * A programme's lead does a run's track lead's work on the run their
 * programme names, through the same routes and the same checks, and on no
 * other run. Every route a track lead passes, asked as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE LEAD PASSES EVERY TRACK LEAD'S GATE ON THEIR RUN, and is answered
 *     what an admin is answered past it: the board, placing, removing and
 *     putting back, Publish and its test, the run's own queue, staffing a
 *     group, copying weeks, a note on a material, the retrospective, a
 *     group's week, the run's email, and the list of who can facilitate.
 *     Sending a group its week's email again stays an admin's.
 *  2. NOBODY ELSE GAINS ANYTHING. The lead of another programme, the
 *     programme's reviewer, a facilitator, a member placed on the run and a
 *     member on nothing are refused exactly where they were, and somebody
 *     signed out is asked to sign in.
 *  3. THE POWER IS WORKED OUT WHEN IT IS USED. A lead who no longer meets the
 *     bar, a lead replaced by another and a lead whose programme stops naming
 *     the run are refused on the next request; the new lead is let in.
 *  4. DECIDING STAYS WHERE IT WAS. The run's decide and notes routes are its
 *     admissions reviewers' and admins', and a lead is not one by leading.
 *  5. A VIEW-AS SESSION is refused on every widened route that writes,
 *     before anything is read.
 *
 * Real: every handler and the libraries under it. Stubbed: the session, the
 * Admin SDK handle, the view-as guard and the mail door
 * (`tests/lib/handoverWorld.mjs`).
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { A, AGI, B, C, PERSONAS, RUN, formPath, leadSeed } from "./lib/leadWorld.mjs";

/**
 * The Admin SDK's sentinels with the two classes the register's push route
 * imports as well. The lead is refused there before either is used.
 */
const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { static documentId() { return '__name__'; } }",
);

// The run's email can go as a notice, whose push this world does not send.
const made = makeWorld("__leadRoutes", [
  ["firebase-admin/firestore", FIRESTORE],
  ["@/lib/push/noticeNotifications", "export async function sendNoticePush() { return { sent: 0 }; }"],
]);
const { world, reset, call, everything, courseRoute } = made;
const join_ = await loadJoin(made);
const { routes, press, place } = join_;

const more = {
  reinstate: await courseRoute("runs", "[runId]", "enrolments", "[uid]", "reinstate"),
  facilitators: await courseRoute("groups", "[groupId]", "facilitators"),
  cloneWeeks: await courseRoute("runs", "[runId]", "clone-weeks"),
  materialNotes: await courseRoute("runs", "[runId]", "material-notes"),
  retrospective: await courseRoute("runs", "[runId]", "retrospective"),
  groupWeek: await courseRoute("groups", "[groupId]", "weeks", "[weekId]"),
  email: await courseRoute("runs", "[runId]", "email"),
  candidates: await courseRoute("runs", "[runId]", "facilitators"),
  register: await courseRoute("groups", "[groupId]", "attendance"),
  push: await courseRoute("groups", "[groupId]", "attendance", "push"),
  notes: await courseRoute("groups", "[groupId]", "participant-notes"),
};

// Tue 27 Oct 2026, 5:38pm in London.
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-27T17:38:00Z") });

/**
 * The store answers `count()` the way Firestore's aggregate does, for the one
 * route here that counts (the retrospective's number enrolled).
 */
function withCount(db) {
  const wrapQuery = (q) =>
    new Proxy(q, {
      get(target, key) {
        if (key === "count") {
          return () => ({
            get: async () => {
              const size = (await target.get()).docs.length;
              return { data: () => ({ count: size }) };
            },
          });
        }
        const value = target[key];
        if (typeof value !== "function") return value;
        return (...args) => {
          const out = value.apply(target, args);
          return out && typeof out === "object" && "get" in out && "where" in out ? wrapQuery(out) : out;
        };
      },
    });
  return new Proxy(db, {
    get(target, key) {
      if (key === "collection") return (path) => wrapQuery(target.collection(path));
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** The term after the hand-over, with four people placed by an admin. Publish not yet pressed. */
async function ready(seed = leadSeed()) {
  reset(seed, { now: () => new Date() });
  world.courseDb = withCount(world.courseDb);
  assert.equal((await press()).status, 200);
  const placed = await place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: C },
  ]);
  assert.equal(placed.body.placed, 4, JSON.stringify(placed.body));
}

const run = { runId: RUN.agi };

/**
 * Every route a run's track lead passes, and the two that decide, each with
 * one request and what every persona is answered. `zach` is the admin;
 * `claudia` the lead; `yusuf` the run's track lead; `lloyd` its admissions
 * reviewer; `rahul` facilitates Group B; `amara` is placed in Group B.
 */
const ROUTES = [
  {
    name: "GET the allocation board",
    ask: (who, o) => call(who, routes.board.GET, run, { course: true, ...o }),
    expect: { zach: 200, claudia: 200, yusuf: 200 },
  },
  {
    name: "POST a placement",
    ask: (who, o) => call(who, routes.allocate.POST, run, { body: { placements: [{ uid: "amara", groupId: A }] }, course: true, ...o }),
    expect: { zach: 200, claudia: 200, yusuf: 200 },
  },
  {
    name: "POST Publish's test",
    ask: (who, o) => call(who, routes.publishTest.POST, run, { course: true, ...o }),
    // The track lead is told the run's people came from the form.
    expect: { zach: 200, claudia: 200, yusuf: 403 },
  },
  {
    name: "POST Publish, before anybody has sent a test",
    ask: (who, o) => call(who, routes.publish.POST, run, { body: { emails: 6 }, course: true, ...o }),
    expect: { zach: 409, claudia: 409, yusuf: 403 },
  },
  {
    name: "GET the run's own queue",
    ask: (who, o) => call(who, routes.queue.GET, run, { course: true, ...o }),
    expect: { zach: 200, claudia: 200, yusuf: 200, lloyd: 200 },
  },
  {
    name: "POST a decision on the run's own list",
    ask: (who, o) => call(who, routes.decide.POST, { runId: RUN.agi, uid: "tariq" }, { body: { action: "reject" }, course: true, ...o }),
    // The reviewer is told there is no such application: the row is the form's.
    expect: { zach: 200, lloyd: 404 },
  },
  {
    name: "PATCH a reviewer's notes on the run's own list",
    ask: (who, o) => call(who, routes.notes.PATCH, { runId: RUN.agi, uid: "tariq" }, { body: { reviewerNotes: "Keen." }, course: true, ...o }),
    expect: { zach: 200, lloyd: 404 },
  },
  {
    name: "POST remove somebody from the run",
    ask: (who, o) => call(who, routes.remove.POST, { runId: RUN.agi, uid: "amara" }, { course: true, ...o }),
    expect: { zach: 200, claudia: 200, yusuf: 200 },
  },
  {
    name: "POST put somebody back on the run",
    ask: (who, o) => call(who, more.reinstate.POST, { runId: RUN.agi, uid: "amara" }, { course: true, ...o }),
    expect: "as the admin, for the admin, the lead and the track lead",
    passes: ["zach", "claudia", "yusuf"],
  },
  {
    name: "POST a group's facilitators",
    ask: (who, o) => call(who, more.facilitators.POST, { groupId: B }, { body: { uids: ["rahul"] }, course: true, ...o }),
    expect: { zach: 200, claudia: 200, yusuf: 200 },
  },
  {
    name: "POST copy weeks from another run of the course",
    ask: (who, o) => call(who, more.cloneWeeks.POST, run, { body: { fromRunId: RUN.agiSpring }, course: true, ...o }),
    expect: "as the admin, for the admin, the lead and the track lead",
    passes: ["zach", "claudia", "yusuf"],
  },
  {
    name: "POST a note on a material",
    ask: (who, o) => call(who, more.materialNotes.POST, run, { body: { itemId: "m-1", weekNumber: 1, note: "It landed." }, course: true, ...o }),
    // A facilitator of one of the run's groups writes these too.
    expect: "as the admin, for the admin, the lead, the track lead and a group's facilitator",
    passes: ["zach", "claudia", "yusuf", "rahul"],
  },
  {
    name: "GET the retrospective",
    ask: (who, o) => call(who, more.retrospective.GET, run, { course: true, ...o }),
    expect: { zach: 200, claudia: 200, yusuf: 200 },
  },
  {
    name: "PATCH a group's week",
    ask: (who, o) => call(who, more.groupWeek.PATCH, { groupId: B, weekId: "w01" }, { body: {}, course: true, ...o }),
    expect: "as the admin, for the admin, the lead, the track lead and the group's facilitator",
    passes: ["zach", "claudia", "yusuf", "rahul"],
  },
  {
    name: "POST the run's email",
    ask: (who, o) => call(who, more.email.POST, run, { body: {}, course: true, ...o }),
    expect: "as the admin, for the admin, the lead and the track lead",
    passes: ["zach", "claudia", "yusuf"],
  },
  {
    name: "GET the run's groups, their facilitators and who could facilitate",
    ask: (who, o) => call(who, more.candidates.GET, run, { course: true, ...o }),
    expect: { zach: 200, claudia: 200, yusuf: 200 },
  },
];

/** What `who` is answered, as a status, for a route that compares with the admin's. */
async function answerOf(route, who) {
  await ready();
  const answer = await route.ask(who);
  assert.notEqual(answer.status, 599, `${route.name} as ${who}: ${answer.body?.error}`);
  return answer;
}

describe("1 and 2. every route a track lead passes, as every kind of caller", () => {
  for (const route of ROUTES) {
    test(route.name, async () => {
      const got = {};
      const want = {};
      const adminStatus = Array.isArray(route.passes) ? (await answerOf(route, "zach")).status : null;
      for (const [uid, label] of PERSONAS) {
        const key = uid ?? "signed out";
        got[key] = (await answerOf(route, uid)).status;
        if (uid === null) want[key] = 401;
        else if (Array.isArray(route.passes)) want[key] = route.passes.includes(uid) ? adminStatus : 403;
        else want[key] = route.expect[uid] ?? 403;
        void label;
      }
      assert.deepEqual(got, want);
      if (Array.isArray(route.passes)) {
        assert.notEqual(adminStatus, 403, `${route.name}: the admin is refused, so the lead passing proves nothing`);
      }
    });
  }

  test("the lead is answered what an admin is answered: the same people on the board, and the same email sent to themselves", async () => {
    await ready();
    const asAdmin = (await join_.board("zach")).body;
    const asLead = (await join_.board("claudia")).body;
    assert.deepEqual(asLead.people.map((row) => [row.uid, row.groupId, row.fromForm]), asAdmin.people.map((row) => [row.uid, row.groupId, row.fromForm]));
    assert.equal(asLead.publish.adminOnly, false);
    assert.equal(asLead.publish.emails, asAdmin.publish.emails);

    const tested = await call("claudia", routes.publishTest.POST, run, { course: true });
    assert.equal(tested.status, 200, JSON.stringify(tested.body));
    assert.deepEqual([...new Set(world.mail.map((mail) => mail.to))], ["claudia@example.com"], "a test reached somebody else");
    // The lead chooses for anybody placed outside the times they gave, as an admin would.
    await join_.withoutNotes("claudia");
    const summary = (await join_.board("claudia")).body.publish;
    assert.equal(summary.test.state, "fresh");
    const published = await call("claudia", routes.publish.POST, run, { body: { emails: summary.emails }, course: true });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.ok(world.db.read(`courseRuns/${RUN.agi}`).allocationPublishedAt);
  });

  test("sending a group its week's email again stays an admin's: the lead is refused, the group's facilitator is told so", async () => {
    // The run-wide catch-up nudge is gone; a group's "Week N is open" goes
    // again only by an admin's Resend on a finished register.
    await ready();
    const before = everything();
    const resend = (who) => call(who, more.push.POST, { groupId: B }, { body: { weekNumber: 1, force: true }, course: true });
    for (const who of ["claudia", "yusuf", "tess"]) {
      const answer = await resend(who);
      assert.equal(answer.status, 403, who);
      assert.equal(answer.body.error, "Forbidden", who);
    }
    const facilitator = await resend("rahul");
    assert.equal(facilitator.status, 403);
    assert.match(facilitator.body.error, /Only an admin can re-send an email that has already gone\./);
    assert.equal(everything(), before);
  });

  test("the groups and who could facilitate carry names, ids and roles, and no address", async () => {
    await ready();
    world.db.seed("users/erin", { uid: "erin", email: "erin@example.com", displayName: "Erin Walsh", role: "pending" });
    const answer = await call("claudia", more.candidates.GET, run, { course: true });
    const { groups, people } = answer.body;
    // The account's whole name: two members who go by one first name are told apart.
    assert.ok(people.some((person) => person.uid === "rahul" && person.name === "Rahul Mehta" && person.role === "member"), JSON.stringify(people));
    assert.ok(!people.some((person) => person.uid === "refused"), "a refused account is offered");
    assert.ok(!people.some((person) => person.uid === "erin"), "an account still waiting is offered");
    for (const person of people) assert.deepEqual(Object.keys(person).sort(), ["name", "role", "uid"]);
    assert.deepEqual(
      groups.map((group) => [group.name, group.when, group.facilitators.map((f) => `${f.uid}:${f.name}`)]),
      [
        ["Group B", "Tuesdays at 6pm", ["rahul:Rahul Mehta", "sofia:Sofia Rossi"]],
        ["Group C", "Wednesdays at 1pm", ["tom:Tom Fletcher"]],
        ["Group A", "Thursdays at 6pm", ["sofia:Sofia Rossi"]],
      ],
    );
    for (const group of groups) assert.deepEqual(Object.keys(group).sort(), ["facilitators", "id", "name", "when"]);
    assert.ok(!JSON.stringify(answer.body).includes("@"), "an address reached the lead");
  });

  test("an archived group is not offered for staffing", async () => {
    await ready();
    world.db.poke(`courseGroups/${C}`, { archived: true });
    const { groups } = (await call("claudia", more.candidates.GET, run, { course: true })).body;
    assert.deepEqual(groups.map((group) => group.name), ["Group B", "Group A"]);
  });

  test("a run's track lead who is a plain member is not handed the roster", async () => {
    await ready();
    world.db.poke(`courseRuns/${RUN.agi}`, { trackLeadUids: ["yusuf", "rahul"] });
    assert.equal((await call("rahul", routes.board.GET, run, { course: true })).status, 200);
    assert.equal((await call("rahul", more.candidates.GET, run, { course: true })).status, 403);
  });

  test("the lead of another programme does all of it on their own run", async () => {
    await ready();
    for (const ask of [
      () => call("tess", routes.board.GET, { runId: RUN.tais }, { course: true }),
      () => call("tess", routes.queue.GET, { runId: RUN.tais }, { course: true }),
      () => call("tess", more.retrospective.GET, { runId: RUN.tais }, { course: true }),
      () => call("tess", more.candidates.GET, { runId: RUN.tais }, { course: true }),
    ]) {
      assert.equal((await ask()).status, 200);
    }
    // And Claudia, AGI Strategy's lead, is nobody there.
    assert.equal((await call("claudia", routes.board.GET, { runId: RUN.tais }, { course: true })).status, 403);
  });
});

// ---------------------------------------------------------------------------
// 3. Worked out when used
// ---------------------------------------------------------------------------

describe("3. the lead's power is worked out from the form on every request", () => {
  /** The routes Claudia passes as AGI Strategy's lead, each asked once. */
  const LEADS = ROUTES.filter((route) => (Array.isArray(route.passes) ? route.passes : Object.keys(route.expect)).includes("claudia"));

  for (const [why, change] of [
    ["a lead moved to member", () => world.db.poke("users/claudia", { role: "member" })],
    ["a lead no longer SU-recognised", () => world.db.poke("users/claudia", { suRecognised: false })],
    ["a lead whose account was refused", () => world.db.poke("users/claudia", { role: "rejected" })],
    ["a lead replaced by another", () => world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "nadia" })],
    ["a programme that stops naming the run", () => world.db.poke(formPath, { [`programmes.${AGI}.runId`]: RUN.agiSpring })],
  ]) {
    test(`${why} is refused everywhere the lead passed`, async () => {
      assert.ok(LEADS.length >= 14, `only ${LEADS.length} routes are the lead's`);
      const refused = {};
      for (const route of LEADS) {
        await ready();
        change();
        const before = everything();
        const answer = await route.ask("claudia");
        refused[route.name] = answer.status;
        assert.equal(everything(), before, `${route.name} wrote something for ${why}`);
      }
      assert.deepEqual(new Set(Object.values(refused)), new Set([403]), JSON.stringify(refused));
    });
  }

  test("the new lead is let in at once, and nothing about it is stored on the run", async () => {
    await ready();
    world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "nadia" });
    assert.equal((await join_.board("nadia")).status, 200);
    assert.deepEqual((await join_.board("nadia")).body.people.map((row) => row.uid).sort(), ["amara", "bea", "dev", "tariq"]);
    assert.deepEqual(world.db.read(`courseRuns/${RUN.agi}`).trackLeadUids, ["yusuf"]);
  });
});

// ---------------------------------------------------------------------------
// 4. Deciding
// ---------------------------------------------------------------------------

describe("4. deciding stays the run's reviewers' and admins'", () => {
  test("the lead is refused the run's decide and notes routes, and nothing is written", async () => {
    await ready();
    const before = everything();
    assert.equal((await call("claudia", routes.decide.POST, { runId: RUN.agi, uid: "tariq" }, { body: { action: "reject" }, course: true })).status, 403);
    assert.equal((await call("claudia", routes.notes.PATCH, { runId: RUN.agi, uid: "tariq" }, { body: { reviewerNotes: "x" }, course: true })).status, 403);
    assert.equal(everything(), before);
  });

  test("a lead the run also names as an admissions reviewer decides their own programme's rows", async () => {
    await ready();
    world.db.poke(`courseRuns/${RUN.agi}`, { admissionsReviewerUids: ["lloyd", "claudia"] });
    const decided = await call("claudia", routes.decide.POST, { runId: RUN.agi, uid: "tariq" }, { body: { action: "reject" }, course: true });
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    assert.equal(world.db.read(`courseApplications/${RUN.agi}__tariq`).status, "rejected");
    // The other reviewer is still told there is no such row.
    assert.equal((await call("lloyd", routes.notes.PATCH, { runId: RUN.agi, uid: "dev" }, { body: { reviewerNotes: "x" }, course: true })).status, 404);
  });
});

// ---------------------------------------------------------------------------
// 5. View-as
// ---------------------------------------------------------------------------

describe("5. a view-as session is refused first on every widened route that writes", () => {
  const WRITES = ROUTES.filter((route) => !route.name.startsWith("GET "));

  test("refused before anything is read, and nothing is written", async () => {
    assert.ok(WRITES.length >= 12, `only ${WRITES.length} routes write`);
    for (const route of WRITES) {
      await ready();
      const reads = world.db.stats.reads;
      const before = everything();
      const answer = await route.ask("claudia", { viewAs: true });
      assert.equal(answer.status, 403, route.name);
      assert.equal(world.db.stats.reads, reads, `${route.name} read before refusing`);
      assert.equal(everything(), before, `${route.name} wrote something`);
    }
  });
});
