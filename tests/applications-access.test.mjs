/**
 * Who may read, score and decide applications, and who may say so.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## The rule this guards
 *
 * A programme's lead reads every application that ranked it and decides for
 * it. Its reviewers read and score, and cannot decide. An admin does
 * everything. Being named is only half of it: a lead or a reviewer has to be
 * an admin or SU-recognised committee when they are named AND when they act,
 * because applications are personal and nothing takes a name off a form when
 * its owner's standing changes.
 *
 * Two modules are executed here, both real:
 *
 *  - `src/lib/applications/access.ts`, the predicates every staff route uses,
 *    against a cast that includes the people the bar exists to stop: somebody
 *    still named after losing SU recognition, and a plain member named by
 *    mistake.
 *  - `src/lib/applications/roles.ts`, the one writer of a programme's lead
 *    and reviewers, against an in-memory Firestore: who may change what, the
 *    live eligibility check, the union kept on the round, and the sidebar
 *    flag on each person's own document.
 *
 * Stubbed: `server-only`, and the one value `firebase-admin/firestore`
 * supplies (`FieldValue`). The eligibility module is the real one.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", "export const FieldValue = { serverTimestamp: () => new Date(0) };"],
  ]),
});
const at = (file) => join("lib", "applications", file);

const access = await loadTs(at("access.ts"));
const roles = await loadTs(at("roles.ts"));
const normalise = await loadTs(at("normalise.ts"));

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

const AGI = "agi-strategy";
const TAIS = "technical-ai-safety";
const ROUND = "autumn-2026__k3f9a2b1";

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

const session = (uid, role, suRecognised = false) => ({
  uid,
  email: `${uid}@example.com`,
  role,
  suRecognised,
  permissions: PERMISSIONS,
});

const CAST = {
  zach: session("zach", "admin"),
  claudia: session("claudia", "committee", true),
  lloyd: session("lloyd", "committee", true),
  yusuf: session("yusuf", "committee", true),
  /** Named as a lead, and no longer SU-recognised. */
  kofi: session("kofi", "committee", false),
  /** Named as a reviewer by mistake: a plain member. */
  priya: session("priya", "member"),
  jasmine: session("jasmine", "pending"),
};

function programme(overrides = {}) {
  return {
    kind: "fellowship",
    name: "A fellowship",
    shortName: "A fellowship",
    places: 10,
    leadUid: null,
    reviewerUids: [],
    useScores: true,
    ...overrides,
  };
}

function roundData(programmes) {
  return {
    formVersion: 2,
    kind: "enrolment",
    label: "Autumn 2026",
    status: "open",
    programmeIds: Object.keys(programmes),
    programmes,
    questionSetIds: [],
    reviewerUids: [],
    finalDeciderUid: null,
  };
}

const FORM = normalise.normaliseForm(
  ROUND,
  roundData({
    [AGI]: programme({ leadUid: "claudia", reviewerUids: ["lloyd", "priya"] }),
    [TAIS]: programme({ leadUid: "kofi", reviewerUids: [] }),
  }),
);

// ---------------------------------------------------------------------------
// The predicates
// ---------------------------------------------------------------------------

describe("who has which role on a programme", () => {
  test("an admin has the admin role on every programme, named or not", () => {
    assert.equal(access.roleOnProgramme(CAST.zach, FORM, AGI), "admin");
    assert.equal(access.roleOnProgramme(CAST.zach, FORM, TAIS), "admin");
    assert.equal(access.roleOnProgramme(CAST.zach, FORM, "not-on-the-form"), null);
  });

  test("a lead and a reviewer are who the programme names, on that programme only", () => {
    assert.equal(access.roleOnProgramme(CAST.claudia, FORM, AGI), "lead");
    assert.equal(access.roleOnProgramme(CAST.claudia, FORM, TAIS), null);
    assert.equal(access.roleOnProgramme(CAST.lloyd, FORM, AGI), "reviewer");
    assert.equal(access.roleOnProgramme(CAST.yusuf, FORM, AGI), null, "SU-recognised, and named nowhere");
  });

  test("being named is not enough: the bar is asked again when the role is used", () => {
    assert.equal(access.roleOnProgramme(CAST.kofi, FORM, TAIS), null, "a lead who lost SU recognition");
    assert.equal(access.roleOnProgramme(CAST.priya, FORM, AGI), null, "a member named as a reviewer");
    assert.equal(access.roleOnProgramme(CAST.jasmine, FORM, AGI), null);
  });

  test("the roles a person holds are listed in the form's order", () => {
    assert.deepEqual(access.programmeRolesFor(CAST.zach, FORM), [
      { programmeId: AGI, role: "admin" },
      { programmeId: TAIS, role: "admin" },
    ]);
    assert.deepEqual(access.programmeRolesFor(CAST.claudia, FORM), [{ programmeId: AGI, role: "lead" }]);
    assert.deepEqual(access.programmeRolesFor(CAST.kofi, FORM), []);
  });
});

describe("what a role allows", () => {
  /** [who, sees the form, reads an AGI application, reviews AGI, decides AGI, edits AGI, runs the term] */
  const EXPECTED = {
    zach: [true, true, true, true, true, true],
    claudia: [true, true, true, true, true, false],
    lloyd: [true, true, true, false, false, false],
    yusuf: [false, false, false, false, false, false],
    kofi: [false, false, false, false, false, false],
    priya: [false, false, false, false, false, false],
    jasmine: [false, false, false, false, false, false],
  };

  for (const [who, expected] of Object.entries(EXPECTED)) {
    test(`${who}`, () => {
      const user = CAST[who];
      assert.deepEqual(
        [
          access.canSeeForm(user, FORM),
          access.canReadApplication(user, FORM, [AGI]),
          access.canReviewFor(user, FORM, AGI),
          access.canDecideFor(user, FORM, AGI),
          access.canEditProgramme(user, FORM, AGI),
          access.canRunTerm(user),
        ],
        expected,
      );
    });
  }

  test("a lead reads only applications that ranked their own programme", () => {
    assert.equal(access.canReadApplication(CAST.claudia, FORM, [TAIS]), false);
    assert.equal(access.canReadApplication(CAST.claudia, FORM, [TAIS, AGI]), true);
    assert.equal(access.canReadApplication(CAST.claudia, FORM, []), false);
    assert.equal(access.canReadApplication(CAST.zach, FORM, []), true);
  });
});

// ---------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------

/** A Firestore small enough to read: documents by path, and the calls roles.ts makes. */
function makeDb(seed) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
  const snap = (path) => ({
    exists: docs.has(path),
    id: path.split("/").pop(),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
  });
  const ref = (path) => ({ id: path.split("/").pop(), path, get: async () => snap(path) });
  const update = (path, patch) => {
    if (!docs.has(path)) throw new Error(`NOT_FOUND: ${path}`);
    const next = structuredClone(docs.get(path));
    for (const [field, value] of Object.entries(patch)) {
      const parts = field.split(".");
      let node = next;
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      node[parts[parts.length - 1]] = value;
    }
    docs.set(path, next);
  };
  const matches = (data, field, op, value) =>
    op === "array-contains" ? Array.isArray(data[field]) && data[field].includes(value) : data[field] === value;
  return {
    collection(name) {
      return {
        doc: (id) => ref(`${name}/${id}`),
        where: (field, op, value) => ({
          get: async () => ({
            docs: [...docs.entries()]
              .filter(([path, data]) => path.startsWith(`${name}/`) && matches(data, field, op, value))
              .map(([path]) => snap(path)),
          }),
        }),
      };
    },
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    runTransaction: async (fn) => fn({ get: async (r) => snap(r.path), update: (r, patch) => update(r.path, patch) }),
    batch() {
      const writes = [];
      return {
        update: (r, patch) => writes.push([r.path, patch]),
        commit: async () => writes.forEach(([path, patch]) => update(path, patch)),
      };
    },
    read: (path) => docs.get(path),
  };
}

const userDoc = ({ role, suRecognised }, extra = {}) => ({
  role,
  suRecognised,
  displayName: "",
  email: "",
  profile: { preferredName: "", motivation: "" },
  ...extra,
});

function seed(overrides = {}) {
  return {
    [`admissionRounds/${ROUND}`]: roundData({
      [AGI]: programme({ leadUid: "claudia", reviewerUids: [] }),
      [TAIS]: programme(),
    }),
    "admissionRounds/older-round": { kind: "enrolment", reviewerUids: [], finalDeciderUid: null },
    "users/zach": userDoc(CAST.zach),
    "users/claudia": userDoc(CAST.claudia, { displayName: "Claudia", admissionsReviewer: true }),
    "users/lloyd": userDoc(CAST.lloyd, { displayName: "Lloyd" }),
    "users/yusuf": userDoc(CAST.yusuf, { displayName: "Yusuf" }),
    "users/kofi": userDoc(CAST.kofi, { displayName: "Kofi" }),
    "users/priya": userDoc(CAST.priya, { displayName: "Priya" }),
    ...overrides,
  };
}

const round = (db) => db.read(`admissionRounds/${ROUND}`);

describe("naming a programme's lead and reviewers", () => {
  test("an admin names a lead, the round's union follows, and the lead's sidebar flag is set", async () => {
    const db = makeDb(seed());
    const result = await roles.setProgrammeRoles(db, CAST.zach, ROUND, TAIS, { leadUid: "lloyd" });
    assert.equal(result.ok, true);
    assert.equal(round(db).programmes[TAIS].leadUid, "lloyd");
    assert.deepEqual(round(db).reviewerUids, ["claudia", "lloyd"]);
    assert.equal(db.read("users/lloyd").admissionsReviewer, true);
    assert.deepEqual(result.added, ["lloyd"]);
    assert.equal(result.form.programmes[TAIS].leadUid, "lloyd");
  });

  test("a lead adds reviewers to their own programme", async () => {
    const db = makeDb(seed());
    const result = await roles.setProgrammeRoles(db, CAST.claudia, ROUND, AGI, {
      reviewerUids: ["lloyd", " yusuf ", "lloyd"],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(round(db).programmes[AGI].reviewerUids, ["lloyd", "yusuf"]);
    assert.deepEqual(round(db).reviewerUids, ["claudia", "lloyd", "yusuf"]);
    assert.equal(db.read("users/yusuf").admissionsReviewer, true);
  });

  test("only an admin changes the lead", async () => {
    const db = makeDb(seed());
    const result = await roles.setProgrammeRoles(db, CAST.claudia, ROUND, AGI, { leadUid: "lloyd" });
    assert.deepEqual([result.ok, result.status], [false, 403]);
    assert.equal(round(db).programmes[AGI].leadUid, "claudia");
  });

  test("nobody else changes anything: another programme's lead, a reviewer, a member", async () => {
    for (const who of ["lloyd", "yusuf", "priya", "jasmine"]) {
      const db = makeDb(
        seed({
          [`admissionRounds/${ROUND}`]: roundData({
            [AGI]: programme({ leadUid: "claudia", reviewerUids: ["lloyd"] }),
            [TAIS]: programme({ leadUid: "yusuf" }),
          }),
        }),
      );
      const result = await roles.setProgrammeRoles(db, CAST[who], ROUND, AGI, { reviewerUids: [who] });
      assert.deepEqual([who, result.ok, result.status], [who, false, 403]);
      assert.deepEqual(round(db).programmes[AGI].reviewerUids, ["lloyd"]);
    }
  });

  test("a lead who lost their standing can no longer name anybody", async () => {
    const db = makeDb(
      seed({
        [`admissionRounds/${ROUND}`]: roundData({ [AGI]: programme({ leadUid: "kofi" }), [TAIS]: programme() }),
      }),
    );
    const result = await roles.setProgrammeRoles(db, CAST.kofi, ROUND, AGI, { reviewerUids: ["lloyd"] });
    assert.deepEqual([result.ok, result.status], [false, 403]);
  });

  test("everybody named is checked against their live document, and a refusal names them", async () => {
    const db = makeDb(seed());
    const result = await roles.setProgrammeRoles(db, CAST.zach, ROUND, AGI, {
      reviewerUids: ["lloyd", "kofi", "priya"],
    });
    assert.deepEqual([result.ok, result.status], [false, 400]);
    assert.match(result.error, /Kofi, Priya cannot be named here/);
    assert.deepEqual(result.uids, ["Kofi", "Priya"]);
    assert.deepEqual(round(db).programmes[AGI].reviewerUids, [], "a refused save writes nothing");
    assert.equal(db.read("users/lloyd").admissionsReviewer, undefined);
  });

  test("a lead cannot be somebody who is not eligible, even when an admin asks", async () => {
    const db = makeDb(seed());
    const result = await roles.setProgrammeRoles(db, CAST.zach, ROUND, TAIS, { leadUid: "priya" });
    assert.deepEqual([result.ok, result.status], [false, 400]);
    assert.equal(round(db).programmes[TAIS].leadUid, null);
  });

  test("an account that no longer exists is refused by id", async () => {
    const db = makeDb(seed());
    const result = await roles.setProgrammeRoles(db, CAST.zach, ROUND, AGI, { reviewerUids: ["gone"] });
    assert.deepEqual([result.ok, result.status, result.uids], [false, 400, ["gone"]]);
  });

  test("taking somebody off clears their flag, unless another round still names them", async () => {
    const start = roundData({ [AGI]: programme({ leadUid: "claudia", reviewerUids: ["lloyd", "yusuf"] }), [TAIS]: programme() });
    start.reviewerUids = ["claudia", "lloyd", "yusuf"];
    const db = makeDb(
      seed({
        [`admissionRounds/${ROUND}`]: start,
        "admissionRounds/older-round": { kind: "enrolment", reviewerUids: ["yusuf"], finalDeciderUid: null },
        "users/lloyd": userDoc(CAST.lloyd, { admissionsReviewer: true }),
        "users/yusuf": userDoc(CAST.yusuf, { admissionsReviewer: true }),
      }),
    );
    const result = await roles.setProgrammeRoles(db, CAST.claudia, ROUND, AGI, { reviewerUids: [] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.removed.sort(), ["lloyd", "yusuf"]);
    assert.deepEqual(round(db).reviewerUids, ["claudia"]);
    assert.equal(db.read("users/lloyd").admissionsReviewer, false);
    assert.equal(db.read("users/yusuf").admissionsReviewer, true, "still a reviewer on the older round");
  });

  test("somebody named on two programmes stays on the round when one lets them go", async () => {
    const start = roundData({
      [AGI]: programme({ leadUid: "claudia", reviewerUids: ["lloyd"] }),
      [TAIS]: programme({ leadUid: "yusuf", reviewerUids: ["lloyd"] }),
    });
    start.reviewerUids = ["claudia", "lloyd", "yusuf"];
    const db = makeDb(
      seed({
        [`admissionRounds/${ROUND}`]: start,
        "users/lloyd": userDoc(CAST.lloyd, { admissionsReviewer: true }),
      }),
    );
    const result = await roles.setProgrammeRoles(db, CAST.claudia, ROUND, AGI, { reviewerUids: [] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(round(db).reviewerUids, ["claudia", "yusuf", "lloyd"]);
    assert.equal(db.read("users/lloyd").admissionsReviewer, true);
  });

  test("an admin removing the lead leaves the programme with none", async () => {
    const db = makeDb(seed());
    const result = await roles.setProgrammeRoles(db, CAST.zach, ROUND, AGI, { leadUid: null });
    assert.equal(result.ok, true);
    assert.equal(round(db).programmes[AGI].leadUid, null);
    assert.deepEqual(round(db).reviewerUids, []);
    assert.equal(db.read("users/claudia").admissionsReviewer, false);
  });

  test("more reviewers than a programme takes is refused before anything is read", async () => {
    const db = makeDb(seed());
    const many = Array.from({ length: 13 }, (_, i) => `person-${i}`);
    const result = await roles.setProgrammeRoles(db, CAST.zach, ROUND, AGI, { reviewerUids: many });
    assert.deepEqual([result.ok, result.status], [false, 400]);
  });

  test("a programme that is not on the form, and a round that is not a form, are both not found", async () => {
    const db = makeDb(seed());
    assert.equal((await roles.setProgrammeRoles(db, CAST.zach, ROUND, "nope", { leadUid: "lloyd" })).status, 404);
    assert.equal((await roles.setProgrammeRoles(db, CAST.zach, "older-round", AGI, { leadUid: "lloyd" })).status, 404);
    assert.equal((await roles.setProgrammeRoles(db, CAST.zach, "no-such-round", AGI, { leadUid: "lloyd" })).status, 404);
  });

  test("everyone a form names is each lead and each reviewer, once", () => {
    assert.deepEqual(roles.everyoneNamedOn(FORM), ["claudia", "lloyd", "priya", "kofi"]);
  });
});
