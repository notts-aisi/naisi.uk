/**
 * Where a programme crest is set, who may set it, and which one a page shows
 * (run via `npm test`, Node's built-in runner, with the session, the Admin SDK
 * handle and the view-as guard faked and everything else the shipping code).
 *
 * A crest is set by an admin in two places: on a course (its own route,
 * `PUT /api/courses/[courseId]/crest`) and on a programme of a term's form
 * (the programme's settings route, `PATCH .../programmes/[programmeId]`).
 * What a page shows is one module's answer (`src/lib/crests/resolve.ts`).
 * This file holds:
 *
 *  1. THE RESOLVER, at every fallback: a programme's own crest, then its
 *     course's, then the emblem; a run's naming programme, then its course's,
 *     then the emblem; a course's own, then the emblem. A stored value that
 *     is not one of the four keys is no crest.
 *  2. ONE READING OF A SENT CREST, shared by both writers: a key, or null (or
 *     an empty choice) for none, and nothing else.
 *  3. THE READERS: a stored crest that is not one of the four reads as none,
 *     on a course and on a programme.
 *  4. THE COURSE'S ROUTE AS EVERY CALLER: an admin sets and clears it; a
 *     programme's lead, a course author, a member, a waiting account and a
 *     signed-out visitor are refused before the body or the course is read,
 *     and a view-as session is refused before anything.
 *  5. THE PROGRAMME'S SETTINGS AS EVERY CALLER: an admin sets and clears it,
 *     the programme's lead is refused the crest and keeps every other field,
 *     a reviewer and a stranger are refused as they always were, and nothing
 *     is written by a refused change. The settings view carries the crest and
 *     its course's, so the page can show what the programme shows.
 *  6. THE LOADERS: a form's programmes and a list of runs resolved in one read
 *     of the courses (and one of the forms for runs), and no read for no runs.
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";

globalThis.__crests = { db: null, user: null, viewAs: false };

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body, json: async () => body }; } };",
    ],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__crests.db; }"],
    ["@/lib/firebase/session", "export async function getCurrentUser() { return globalThis.__crests.user; }"],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() {" +
        " return globalThis.__crests.viewAs ? { status: 403, body: { error: 'view-as' }, json: async () => ({ error: 'view-as' }) } : null; }",
    ],
  ]),
});

const resolve = await loadTs("lib/crests/resolve.ts");
const choice = await loadTs("lib/crests/choice.ts");
const load = await loadTs("lib/crests/load.ts");
const runs = await loadTs("lib/crests/runs.ts");
const normalise = await loadTs("lib/applications/normalise.ts");
const courses = await loadTs("lib/firestore/courses.ts");
const write = await loadTs("lib/applications/editor/write.ts");
const { CREST_KEYS } = await loadTs("components/ProgrammeCrest.tsx");
const publicTerm = await loadTs(join("lib", "applications", "lifecycle", "publicTerm.ts"));
const courseCrestRoute = await loadTs(join("app", "api", "courses", "[courseId]", "crest", "route.ts"));
const programmeRoute = await loadTs(
  join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "route.ts"),
);

const { crestForProgramme, crestForRun, crestForCourse } = resolve;
const BAD = ["", "Alignment", "dragon", "__proto__", "constructor", 7, true, {}, ["alignment"]];

// ---------------------------------------------------------------------------
// 1. The resolver
// ---------------------------------------------------------------------------

describe("which crest a page shows", () => {
  test("a programme: its own crest wins over its course's", () => {
    assert.equal(crestForProgramme({ crest: "alignment" }, { crest: "agi-strategy" }), "alignment");
  });

  test("a programme with none of its own shows its course's", () => {
    assert.equal(crestForProgramme({ crest: null }, { crest: "agi-strategy" }), "agi-strategy");
  });

  test("a programme with neither shows the emblem, and so does one with no course", () => {
    assert.equal(crestForProgramme({ crest: null }, { crest: null }), null);
    assert.equal(crestForProgramme({ crest: null }, null), null);
    assert.equal(crestForProgramme({ crest: null }, undefined), null);
    assert.equal(crestForProgramme(null, null), null);
  });

  test("a programme with its own and no course still shows its own", () => {
    assert.equal(crestForProgramme({ crest: "technical-ai-safety" }, null), "technical-ai-safety");
  });

  test("a run: the crest of the programme that names it, then its course's, then the emblem", () => {
    assert.equal(crestForRun({ crest: "governance-macrostrategy" }, { crest: "alignment" }), "governance-macrostrategy");
    assert.equal(crestForRun({ crest: null }, { crest: "alignment" }), "alignment");
    assert.equal(crestForRun(null, { crest: "alignment" }), "alignment");
    assert.equal(crestForRun(null, null), null);
    assert.equal(crestForRun({ crest: null }, { crest: null }), null);
  });

  test("a course card: the course's crest, else the emblem", () => {
    assert.equal(crestForCourse({ crest: "agi-strategy" }), "agi-strategy");
    assert.equal(crestForCourse({ crest: null }), null);
    assert.equal(crestForCourse(null), null);
  });

  test("a stored value that is not one of the four keys is no crest, at every step", () => {
    for (const bad of BAD) {
      assert.equal(crestForProgramme({ crest: bad }, { crest: "alignment" }), "alignment", JSON.stringify(bad));
      assert.equal(crestForProgramme({ crest: null }, { crest: bad }), null, JSON.stringify(bad));
      assert.equal(crestForRun({ crest: bad }, { crest: "agi-strategy" }), "agi-strategy", JSON.stringify(bad));
      assert.equal(crestForCourse({ crest: bad }), null, JSON.stringify(bad));
    }
  });

  test("nothing about a holder but its crest decides: not its name, its id or its slug", () => {
    const named = { crest: null, id: "alignment", name: "Alignment Research Incubator", shortName: "Alignment", slug: "alignment" };
    assert.equal(crestForProgramme(named, null), null);
    assert.equal(crestForCourse({ crest: null, id: "agi-strategy", title: "AGI Strategy Fellowship" }), null);
  });
});

// ---------------------------------------------------------------------------
// 2. A crest as a request sends one
// ---------------------------------------------------------------------------

describe("reading a crest a request sends", () => {
  test("each of the four keys is taken as it is", () => {
    for (const key of CREST_KEYS) assert.deepEqual(choice.readCrestChoice(key), { ok: true, crest: key });
  });

  test("null and an empty choice are no crest", () => {
    assert.deepEqual(choice.readCrestChoice(null), { ok: true, crest: null });
    assert.deepEqual(choice.readCrestChoice(""), { ok: true, crest: null });
  });

  test("anything else is refused with a sentence, never trimmed or guessed into a key", () => {
    for (const bad of ["Alignment", " alignment", "alignment ", "dragon", "__proto__", undefined, 0, {}, ["alignment"]]) {
      const read = choice.readCrestChoice(bad);
      assert.equal(read.ok, false, JSON.stringify(bad));
      assert.equal(read.error, choice.CREST_NOT_ONE_OF_THE_FOUR);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The readers
// ---------------------------------------------------------------------------

describe("a stored crest is read one way", () => {
  test("a programme's: one of the four keys, else none", () => {
    for (const key of CREST_KEYS) assert.equal(normalise.normaliseProgramme("p", { name: "P", crest: key }).crest, key);
    for (const bad of [...BAD, null, undefined]) {
      assert.equal(normalise.normaliseProgramme("p", { name: "P", crest: bad }).crest, null, JSON.stringify(bad));
    }
  });

  test("a course's: one of the four keys, else none", () => {
    for (const key of CREST_KEYS) assert.equal(courses.normalizeCourse("c", { title: "C", crest: key }).crest, key);
    for (const bad of [...BAD, null, undefined]) {
      assert.equal(courses.normalizeCourse("c", { title: "C", crest: bad }).crest, null, JSON.stringify(bad));
    }
  });
});

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

const PERMISSIONS = {
  draftNewsletter: false,
  approveNewsletter: false,
  draftEvent: false,
  approveEvent: false,
  draftCourse: false,
  approveCourse: false,
  manageMembership: false,
  circulateWorksheet: false,
};
const session = (uid, role, extra = {}) => ({
  uid,
  email: `${uid}@example.com`,
  role,
  suRecognised: role === "committee",
  permissions: { ...PERMISSIONS, ...(extra.permissions ?? {}) },
});
const CAST = {
  /** An admin. */
  zach: session("zach", "admin"),
  /** SU-recognised committee, and the lead of AGI Strategy on the form. */
  claudia: session("claudia", "committee"),
  /** SU-recognised committee, a reviewer of AGI Strategy. */
  lloyd: session("lloyd", "committee"),
  /** A member who may draft and approve courses, but is not an admin. */
  ada: session("ada", "member", { permissions: { draftCourse: true, approveCourse: true } }),
  /** A member with nothing to do with any of it. */
  priya: session("priya", "member"),
  /** An account still waiting for approval. */
  jasmine: session("jasmine", "pending"),
};

const COURSE = "agi-strategy-fellowship__k1tcrs01";
const OTHER_COURSE = "research-incubator__k1tcrs03";
const ROUND = "autumn-2026__k1tterm1";
const AGI = "agi-strategy";
const INC = "research-incubator";
const ROUND_PATH = `admissionRounds/${ROUND}`;

const programme = (over) => ({
  kind: "fellowship",
  pitch: "",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 26 Oct",
  places: 24,
  groupCount: 3,
  groupSize: "Up to 8",
  leadUid: null,
  reviewerUids: [],
  useScores: true,
  closed: false,
  runId: null,
  courseId: null,
  emailWording: {},
  ...over,
});

const COUNTS = {
  draft: 0,
  submitted: 0,
  accepted: 0,
  "fellowship-offered": 0,
  waitlisted: 0,
  rejected: 0,
  withdrawn: 0,
  appointed: 0,
  invited: 0,
  "no-offer": 0,
  declined: 0,
};

function seed() {
  const userDoc = (uid) => ({
    role: CAST[uid].role,
    suRecognised: CAST[uid].suRecognised,
    permissions: CAST[uid].permissions,
    displayName: uid[0].toUpperCase() + uid.slice(1),
    email: `${uid}@example.com`,
    profile: { preferredName: uid[0].toUpperCase() + uid.slice(1), motivation: "" },
  });
  return {
    [`courses/${COURSE}`]: {
      title: "AGI Strategy Fellowship",
      status: "published",
      authorUid: "ada",
      collaboratorUids: [],
      crest: "agi-strategy",
    },
    [`courses/${OTHER_COURSE}`]: {
      title: "Research Incubator",
      status: "draft",
      authorUid: "ada",
      collaboratorUids: [],
    },
    [ROUND_PATH]: {
      formVersion: 2,
      kind: "enrolment",
      label: "Autumn 2026",
      slug: "autumn-2026",
      status: "draft",
      opensAt: new Date("2026-10-06T08:00:00Z"),
      closesAt: new Date("2026-10-18T22:59:00Z"),
      decisionsByDate: "2026-10-23",
      invitationReplyBy: "2026-10-27",
      stageIds: [],
      reviewerUids: ["zach", "claudia", "lloyd"],
      finalDeciderUid: null,
      applicationCounts: { ...COUNTS },
      archived: false,
      authorUid: "zach",
      programmeIds: [AGI, INC],
      programmes: {
        [AGI]: programme({
          name: "AGI Strategy Fellowship",
          shortName: "AGI Strategy",
          leadUid: "claudia",
          reviewerUids: ["lloyd"],
          courseId: COURSE,
        }),
        [INC]: programme({
          kind: "incubator",
          name: "Research Incubator",
          shortName: "Research incubator",
          leadUid: "zach",
          courseId: OTHER_COURSE,
          crest: "alignment",
        }),
      },
      questionSetIds: [],
      asksFacilitating: false,
      createdAt: new Date("2026-10-01T09:00:00Z"),
    },
    ...Object.fromEntries(Object.keys(CAST).map((uid) => [`users/${uid}`, userDoc(uid)])),
  };
}

let db;
beforeEach(() => {
  db = makeDb(seed());
  globalThis.__crests = { db, user: null, viewAs: false };
});

const as = (uid) => {
  globalThis.__crests.user = uid ? CAST[uid] : null;
};
const request = (body) => new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body) });
const stored = async (path) => (await db.collection(path.split("/")[0]).doc(path.split("/")[1]).get()).data();

// ---------------------------------------------------------------------------
// 4. The course's crest route
// ---------------------------------------------------------------------------

describe("PUT /api/courses/[courseId]/crest", () => {
  const put = (courseId, body) => courseCrestRoute.PUT(request(body), { params: Promise.resolve({ courseId }) });

  test("an admin sets a course's crest, and it is stored as the key", async () => {
    as("zach");
    const res = await put(OTHER_COURSE, { crest: "governance-macrostrategy" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { crest: "governance-macrostrategy" });
    assert.equal((await stored(`courses/${OTHER_COURSE}`)).crest, "governance-macrostrategy");
  });

  test("an admin clears it with null, and the course then holds none", async () => {
    as("zach");
    const res = await put(COURSE, { crest: null });
    assert.equal(res.status, 200);
    assert.equal((await stored(`courses/${COURSE}`)).crest, null);
    assert.equal(courses.normalizeCourse(COURSE, await stored(`courses/${COURSE}`)).crest, null);
  });

  test("every caller who is not an admin is refused, before the body or the course is read", async () => {
    for (const uid of ["claudia", "lloyd", "ada", "priya", "jasmine"]) {
      as(uid);
      const before = db.stats.reads;
      // A body that would be refused, so a refusal for the body would show.
      const res = await put(COURSE, { crest: "dragon" });
      assert.equal(res.status, 403, uid);
      assert.match(res.body.error, /Only an admin/);
      assert.equal(db.stats.reads, before, `${uid}: nothing was read`);
    }
    assert.equal((await stored(`courses/${COURSE}`)).crest, "agi-strategy", "nothing was written");
  });

  test("a signed-out visitor is refused for having no session", async () => {
    as(null);
    const res = await put(COURSE, { crest: "alignment" });
    assert.equal(res.status, 401);
    assert.equal((await stored(`courses/${COURSE}`)).crest, "agi-strategy");
  });

  test("a view-as session is refused before anything else", async () => {
    as("zach");
    globalThis.__crests.viewAs = true;
    const res = await put(COURSE, { crest: "alignment" });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "view-as");
    assert.equal((await stored(`courses/${COURSE}`)).crest, "agi-strategy");
  });

  test("an admin's body that is not one of the four keys is refused with a sentence, and nothing is read", async () => {
    as("zach");
    for (const body of [{ crest: "dragon" }, { crest: "Alignment" }, { crest: 7 }, {}, [], null]) {
      const before = db.stats.reads;
      const res = await put(COURSE, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(db.stats.reads, before, `${JSON.stringify(body)}: the body is read before the course`);
    }
    assert.equal((await stored(`courses/${COURSE}`)).crest, "agi-strategy");
  });

  test("a course that is not there, or an id that could not be one, is not found", async () => {
    as("zach");
    assert.equal((await put("no-such-course__k1t00000", { crest: "alignment" })).status, 404);
    assert.equal((await put("courses/agi", { crest: "alignment" })).status, 404);
  });

  test("a course on its way out takes no crest", async () => {
    db = makeDb({ ...seed(), [`courses/${COURSE}`]: { title: "AGI", status: "published", destroying: true } });
    globalThis.__crests.db = db;
    as("zach");
    const res = await put(COURSE, { crest: "alignment" });
    assert.equal(res.status, 409);
    assert.equal((await stored(`courses/${COURSE}`)).crest, undefined);
  });
});

// ---------------------------------------------------------------------------
// 5. A programme's crest, through its settings
// ---------------------------------------------------------------------------

describe("a programme's crest in its settings", () => {
  const ctx = (programmeId) => ({ params: Promise.resolve({ roundId: ROUND, programmeId }) });
  const patch = (programmeId, body) =>
    programmeRoute.PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), ctx(programmeId));
  const get = (programmeId) => programmeRoute.GET(new Request("http://localhost/x"), ctx(programmeId));
  const storedProgramme = async (programmeId) => (await stored(ROUND_PATH)).programmes[programmeId];

  test("an admin sets a programme's crest, and the settings say so", async () => {
    as("zach");
    const res = await patch(AGI, { crest: "technical-ai-safety" });
    assert.equal(res.status, 200);
    assert.equal(res.body.programme.crest, "technical-ai-safety");
    assert.equal((await storedProgramme(AGI)).crest, "technical-ai-safety");
  });

  test("an admin clears it, and the programme falls back to its course's", async () => {
    as("zach");
    assert.equal((await patch(INC, { crest: null })).status, 200);
    assert.equal((await storedProgramme(INC)).crest, null);
    const view = (await get(INC)).body.programme;
    assert.equal(view.crest, null);
    // The incubator's course holds no crest, so the programme shows the emblem.
    assert.equal(view.courseCrest, null);
    assert.equal(crestForProgramme({ crest: view.crest }, { crest: view.courseCrest }), null);
  });

  test("the settings carry the programme's own crest and its course's, for both who may open them", async () => {
    for (const uid of ["zach", "claudia"]) {
      as(uid);
      const view = (await get(AGI)).body.programme;
      assert.equal(view.crest, null, uid);
      assert.equal(view.courseCrest, "agi-strategy", uid);
      assert.equal(crestForProgramme({ crest: view.crest }, { crest: view.courseCrest }), "agi-strategy");
    }
  });

  test("the programme's lead is refused the crest, and nothing of the change is written", async () => {
    as("claudia");
    const res = await patch(AGI, { crest: "alignment", pitch: "A new line." });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, write.PROGRAMME_CREST_IS_AN_ADMINS);
    const after = await storedProgramme(AGI);
    assert.equal(after.crest, undefined);
    assert.equal(after.pitch, "", "the rest of a refused change is not written either");
  });

  test("the lead still changes everything else that is theirs", async () => {
    as("claudia");
    const res = await patch(AGI, { pitch: "A new line." });
    assert.equal(res.status, 200);
    assert.equal((await storedProgramme(AGI)).pitch, "A new line.");
  });

  test("a reviewer, a committee member with no role, a member, a waiting account and a visitor are refused as before", async () => {
    const expected = { lloyd: 403, ada: 404, priya: 404, jasmine: 404 };
    for (const [uid, status] of Object.entries(expected)) {
      as(uid);
      assert.equal((await patch(AGI, { crest: "alignment" })).status, status, uid);
    }
    as(null);
    assert.equal((await patch(AGI, { crest: "alignment" })).status, 401);
    assert.equal((await storedProgramme(AGI)).crest, undefined);
  });

  test("a crest that is not one of the four keys is refused with a sentence, whoever sends it", async () => {
    for (const uid of ["zach", "claudia"]) {
      as(uid);
      const res = await patch(AGI, { crest: "dragon" });
      assert.equal(res.status, 400, uid);
      assert.equal(res.body.error, choice.CREST_NOT_ONE_OF_THE_FOUR);
    }
    assert.equal((await storedProgramme(AGI)).crest, undefined);
  });

  test("a view-as session is refused before anything", async () => {
    as("zach");
    globalThis.__crests.viewAs = true;
    assert.equal((await patch(AGI, { crest: "alignment" })).status, 403);
    assert.equal((await storedProgramme(AGI)).crest, undefined);
  });

  test("a programme added to a form carries no crest of its own", () => {
    const parsed = normalise.normaliseProgramme("new", { name: "New", shortName: "New", kind: "fellowship" });
    assert.equal(parsed.crest, null);
  });
});

describe("what a visitor's page is told about a programme's crest", () => {
  test("the projection carries each programme's own crest, and a stored value that is not one as none", async () => {
    const raw = await stored(ROUND_PATH);
    raw.status = "open";
    raw.programmes[AGI].crest = "dragon";
    db = makeDb({ ...seed(), [ROUND_PATH]: raw });
    const term = await publicTerm.findPublicTerm(db, new Date("2026-10-10T12:00:00Z"));
    assert.equal(term.stage, "open");
    const byId = Object.fromEntries(term.programmes.map((p) => [p.id, p.crest]));
    // The incubator's own crest; AGI Strategy's stored value is not one of the four keys.
    assert.deepEqual(byId, { [AGI]: null, [INC]: "alignment" });
    // Its own crest only: the course's is the resolver's to add, on the page.
    assert.equal(crestForProgramme(term.programmes.find((p) => p.id === AGI), { crest: "agi-strategy" }), "agi-strategy");
  });
});

// ---------------------------------------------------------------------------
// 6. The loaders
// ---------------------------------------------------------------------------

describe("the loaders hand the resolver the stored crests", () => {
  test("a form's programmes, each resolved: its own, else its course's, else the emblem", async () => {
    const form = normalise.normaliseForm(ROUND, (await stored(ROUND_PATH)));
    assert.deepEqual(await load.formCrests(db, form), {
      [AGI]: "agi-strategy",
      [INC]: "alignment",
    });
  });

  test("a programme tied to a course that is not there shows its own crest or the emblem", async () => {
    const raw = await stored(ROUND_PATH);
    raw.programmes[AGI].courseId = "gone-course__k1t99999";
    raw.programmes[INC].courseId = null;
    raw.programmes[INC].crest = null;
    const form = normalise.normaliseForm(ROUND, raw);
    assert.deepEqual(await load.formCrests(db, form), { [AGI]: null, [INC]: null });
  });

  test("the courses are read once, whatever the number of programmes", async () => {
    const form = normalise.normaliseForm(ROUND, await stored(ROUND_PATH));
    const before = db.stats.reads;
    await load.formCrests(db, form);
    // `getAll` reads each document it is handed: two courses, two reads, and nothing else.
    assert.equal(db.stats.reads - before, 2);
  });

  test("a run: the programme that names it, else its course's, else the emblem", async () => {
    const raw = await stored(ROUND_PATH);
    raw.programmes[AGI].runId = "agi-run__k1trun01";
    raw.programmes[INC].runId = "inc-run__k1trun03";
    db = makeDb({ ...seed(), [ROUND_PATH]: raw });
    const shown = await runs.runCrests(db, [
      { id: "agi-run__k1trun01", courseId: COURSE },
      { id: "inc-run__k1trun03", courseId: OTHER_COURSE },
      { id: "nobody-names-me__k1trun09", courseId: COURSE },
      { id: "nothing-at-all__k1trun10", courseId: "gone-course__k1t99999" },
    ]);
    assert.deepEqual(Object.fromEntries(shown), {
      // AGI Strategy has no crest of its own: its course's.
      "agi-run__k1trun01": "agi-strategy",
      // The incubator's own crest wins over its course's (which has none).
      "inc-run__k1trun03": "alignment",
      // Named by nobody: the course's.
      "nobody-names-me__k1trun09": "agi-strategy",
      // Named by nobody, and its course is gone: the emblem.
      "nothing-at-all__k1trun10": null,
    });
  });

  test("a run two programmes name is named by neither, so it shows its course's", async () => {
    const raw = await stored(ROUND_PATH);
    raw.programmes[AGI].runId = "shared__k1trun01";
    raw.programmes[INC].runId = "shared__k1trun01";
    db = makeDb({ ...seed(), [ROUND_PATH]: raw });
    const shown = await runs.runCrests(db, [{ id: "shared__k1trun01", courseId: COURSE }]);
    assert.equal(shown.get("shared__k1trun01"), "agi-strategy");
  });

  test("no runs, no reads", async () => {
    const before = db.stats.reads;
    assert.equal((await runs.runCrests(db, [])).size, 0);
    assert.equal(db.stats.reads, before);
  });
});
