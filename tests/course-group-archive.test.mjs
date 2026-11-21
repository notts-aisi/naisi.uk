/**
 * Archiving a group, and restoring one, through the one route that may
 * change `courseGroups.archived`.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PATCH /api/courses/groups/[groupId]/archive
 *
 * On the sessions world (the AGI run's six taught weeks from Thu 29 Oct 2026;
 * Group B on Tuesdays at 6pm with four people in it and Nina, who left;
 * Rahul and Sofia facilitating; Group A on Thursdays, Group C on Wednesdays;
 * Yusuf the run's track lead, Claudia the programme's lead, Zach an admin;
 * the clock at Thu 19 Nov, 10am). On top of it, Group D: Mondays at 6pm,
 * nobody in it, Tom facilitating, so its weeks 1 to 3 have met and week 4
 * (Mon 23 Nov) is still to come.
 *
 * ## What this guards
 *
 *  1. WHO: an admin, an approveCourse holder and the lead of the programme
 *     that names the run; never the group's own facilitator, the run's track
 *     lead, a course drafter, a member or a view-as session. Refused before
 *     the body is read.
 *  2. ARCHIVING IS REFUSED, in one sentence and with nothing written, while
 *     anybody still holds a place in the group (three sentences: the plain
 *     one, a run with no other group, a run that takes no move), somebody
 *     moved from a week still to come is in it until then, a visit to one of
 *     its sessions is still to come, or a register of a session that has
 *     started is neither finished nor said not to have happened.
 *  3. ALLOWED once none of that holds: the write is `archived` and
 *     `updatedAt`, nothing else in the database moves, and a move or a visit
 *     in a week that has met is no reason to refuse.
 *  4. THE TRANSACTION decides again on what it reads: somebody placed in the
 *     group between the first read and the write is answered, not archived
 *     over.
 *  5. RESTORING is refused while one of the group's facilitators holds a
 *     place in another group; both are refused on a run being destroyed; a
 *     press for the state the group has writes nothing.
 *  6. THE ONE WRITER: no file in `src` or `scripts` writes `archived` to a
 *     group but the route, read with the compiler's parser.
 *  7. The run editor's switch and the group's page call the route.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { CAST, RUN, makeSessionsWorld, updatesSeed } from "./lib/sessionsWorld.mjs";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const w = await makeSessionsWorld("__groupArchive");
const { world, everything } = w;
const route = await w.courseRoute("groups", "[groupId]", "archive");
const words = await w.loadTs("lib/courses/groupArchive/words.ts");
const plan = await w.loadTs("lib/courses/groupArchive/plan.ts");
const staffMove = await w.loadTs("lib/courses/staffMove/plan.ts");

const B = "agi-autumn-2026-monday__grp00001";
const A = "agi-autumn-2026-thursday__grp00002";
const C = "agi-autumn-2026-tbc__grp00003";
const D = "agi-autumn-2026-spare__grp00009";

// An approver and a drafter, as the session hands them over: the world's cast
// holds nobody with a course key.
const keyed = (uid, name, key) => {
  const who = session(uid, "member", false, name);
  return { ...who, permissions: { ...who.permissions, [key]: true } };
};
CAST.paula = keyed("paula", "Paula Grant", "approveCourse");
CAST.dara = keyed("dara", "Dara Quinn", "draftCourse");

const groupD = (over = {}) => ({
  runId: RUN.agi,
  courseId: "agi-strategy-fellowship__c0urse01",
  name: "Group D",
  facilitatorUids: ["tom"],
  capacity: 8,
  memberCount: 0,
  archived: false,
  session: { weekday: 1, startTimeLocal: "18:00", durationMinutes: 90, location: "Room D1", meetingUrl: null, notes: "" },
  sessionOverrides: {},
  ...over,
});
const registerPath = (groupId, n) => `courseAttendance/${RUN.agi}__${groupId}__w${String(n).padStart(2, "0")}`;
const register = (groupId, n, over = {}) => ({
  runId: RUN.agi,
  groupId,
  weekNumber: n,
  records: {},
  held: true,
  pushedAt: new Date(`2026-11-0${n}T20:00:00Z`),
  pushedByUid: "tom",
  markedByUid: "tom",
  ...over,
});
/** Group D's three sessions that have met, each finished. */
const finishedD = () =>
  Object.fromEntries([1, 2, 3].map((n) => [registerPath(D, n), register(D, n)]));
const placePath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;

function seed(over = {}) {
  const base = updatesSeed();
  base[`courseGroups/${D}`] = groupD();
  base["users/paula"] = userDoc(CAST.paula);
  base["users/dara"] = userDoc(CAST.dara);
  return { ...base, ...over };
}

beforeEach(() => w.reset(seed()));

const press = (who, groupId, body, options = {}) => w.call(who, route.PATCH, { groupId }, { body, course: true, ...options });
const archive = (who, groupId) => press(who, groupId, { archived: true });
const restore = (who, groupId) => press(who, groupId, { archived: false });
const stored = (groupId) => world.db.read(`courseGroups/${groupId}`);

/** The press is refused with exactly this sentence, and the database is as it was. */
async function refusedWith(who, groupId, body, sentence) {
  const before = everything();
  const answer = await press(who, groupId, body);
  assert.equal(answer.status, 409, JSON.stringify(answer.body));
  assert.equal(answer.body.error, sentence);
  assert.equal(everything(), before, "a refused press wrote something");
}

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who may archive or restore a group", () => {
  const CASES = [
    ["zach", 400, "an admin"],
    ["paula", 400, "an approveCourse holder"],
    ["yusuf", 403, "the run's track lead"],
    ["claudia", 400, "the lead of the programme that names the run"],
    ["rahul", 403, "a facilitator of the group"],
    ["tom", 403, "a facilitator of another group"],
    ["dara", 403, "a draftCourse holder on nothing"],
    ["tess", 403, "the lead of another programme"],
    ["amara", 403, "a member of the group"],
    ["nobody", 403, "a member on nothing"],
    [null, 401, "somebody signed out"],
  ];
  for (const [who, status, what] of CASES) {
    test(`${what}: ${status} before the body is read`, async () => {
      const before = everything();
      const answer = await press(who, B, {});
      assert.equal(answer.status, status, JSON.stringify(answer.body));
      if (status === 400) assert.equal(answer.body.error, words.ARCHIVE_REFUSAL.body);
      assert.equal(everything(), before);
    });
  }

  test("a view-as session is refused first, even an admin's", async () => {
    const answer = await press("zach", D, { archived: true }, { viewAs: true });
    assert.equal(answer.status, 403);
    assert.equal(stored(D).archived, false);
  });

  test("a group that is not there: 403 for anybody it would be asked of, 404 for an admin or an approver", async () => {
    assert.equal((await archive("yusuf", "no-such-group")).status, 403);
    assert.equal((await archive("rahul", "no-such-group")).status, 403);
    assert.equal((await archive("paula", "no-such-group")).status, 404);
    assert.equal((await archive("zach", "a/b")).status, 404);
  });

  test("a group's own facilitator and the run's track lead are refused, even where the archive would go through", async () => {
    w.reset(seed(finishedD()));
    const before = everything();
    for (const who of ["tom", "yusuf"]) {
      const answer = await archive(who, D);
      assert.equal(answer.status, 403, `${who}: ${JSON.stringify(answer.body)}`);
      assert.equal(answer.body.error, "Forbidden");
    }
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }) }));
    for (const who of ["tom", "yusuf"]) assert.equal((await restore(who, D)).status, 403, who);
    assert.equal(stored(D).archived, true);
    w.reset(seed(finishedD()));
    assert.equal(everything(), before);
  });

  test("a programme's lead on an account no longer approved is refused", async () => {
    w.reset(seed({ ...finishedD(), "users/claudia": userDoc(session("claudia", "rejected", true, "Claudia Reyes")) }));
    assert.equal((await archive("claudia", D)).status, 403);
    assert.equal(stored(D).archived, false);
  });
});

// ---------------------------------------------------------------------------
// 2. Refused while it would lose something
// ---------------------------------------------------------------------------

describe("2. archiving is refused while it would lose something", () => {
  test("people still in the group, counted as the Groups tab counts them", async () => {
    // Amara, Dev, Ines and Omar; Nina left, and Rahul and Sofia's rows are a facilitator's.
    await refusedWith("zach", B, { archived: true }, "Group B still has 4 people in it. Move them to another group first, then archive it.");
    assert.equal(words.stillHasPeopleWords("Group I", 1), "Group I still has 1 person in it. Move them to another group first, then archive it.");
  });

  test("people still in the group on a run that takes no move any more", async () => {
    for (const over of [{ status: "completed" }, { status: "cancelled" }, { archived: true }]) {
      w.reset(seed({ [`courseRuns/${RUN.agi}`]: { ...updatesSeed()[`courseRuns/${RUN.agi}`], ...over } }));
      await refusedWith(
        "zach",
        B,
        { archived: true },
        "Group B still has 4 people in it, and nobody can be moved on this run any more, so it stays as it is: " +
          "archiving it would take their attendance and who finished off the record.",
      );
    }
  });

  test("people still in the run's only group that still meets", async () => {
    for (const other of [A, C, D]) world.db.poke(`courseGroups/${other}`, { archived: true });
    await refusedWith(
      "claudia",
      B,
      { archived: true },
      "Group B still has 4 people in it, and its run has no other group that still meets to move them to, " +
        "so it stays as it is while they hold their places.",
    );
  });

  test("somebody moved to another group from a week still to come is in it until then", async () => {
    w.reset(
      seed({
        ...finishedD(),
        [placePath("bea")]: { ...updatesSeed()[placePath("bea")], groupsByWeek: [{ groupId: D, fromWeek: 1 }, { groupId: A, fromWeek: 6 }] },
      }),
    );
    await refusedWith(
      "zach",
      D,
      { archived: true },
      "Group D is still 1 person’s group for weeks 4 and 5, before their move to another group. Move them from the first of those weeks or earlier, then archive it.",
    );
  });

  test("a one-week visit to one of its sessions still to come", async () => {
    w.reset(
      seed({
        ...finishedD(),
        [placePath("bea")]: { ...updatesSeed()[placePath("bea")], visits: [{ weekNumber: 5, groupId: D, arrangedByUid: "claudia", arrangedAt: new Date("2026-11-18T10:00:00Z") }] },
      }),
    );
    await refusedWith("zach", D, { archived: true }, "Group D still has 1 visit to come, in week 5. Cancel it first, then archive the group.");
  });

  test("registers of sessions that have met: none opened", async () => {
    await refusedWith(
      "zach",
      D,
      { archived: true },
      "Group D’s registers for weeks 1, 2 and 3 aren’t finished. Finish them, or say the sessions didn’t happen, then archive the group: " +
        "an unfinished register counts for nothing once a group is archived.",
    );
  });

  test("one register left a draft; one finished and one said not to have happened count as done", async () => {
    w.reset(
      seed({
        [registerPath(D, 1)]: register(D, 1),
        [registerPath(D, 2)]: register(D, 2, { held: false, pushedAt: null }),
        [registerPath(D, 3)]: register(D, 3, { pushedAt: null }),
      }),
    );
    await refusedWith(
      "zach",
      D,
      { archived: true },
      "Group D’s register for week 3 isn’t finished. Finish it, or say the session didn’t happen, then archive the group: " +
        "an unfinished register counts for nothing once a group is archived.",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Allowed, and what it writes
// ---------------------------------------------------------------------------

describe("3. archiving once nothing is lost", () => {
  test("writes the field and updatedAt, and nothing else anywhere", async () => {
    w.reset(seed(finishedD()));
    const before = JSON.parse(everything());
    const answer = await archive("paula", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, { ok: true, archived: true });
    const after = JSON.parse(everything());
    const changed = after.filter(([path, doc]) => JSON.stringify(before.find(([p]) => p === path)?.[1]) !== JSON.stringify(doc));
    assert.deepEqual(changed.map(([path]) => path), [`courseGroups/${D}`]);
    const was = before.find(([p]) => p === `courseGroups/${D}`)[1];
    const now = changed[0][1];
    assert.deepEqual(
      Object.keys(now).filter((key) => JSON.stringify(now[key]) !== JSON.stringify(was[key])).sort(),
      ["archived", "updatedAt"],
    );
    assert.equal(now.archived, true);
    assert.equal(world.mail.length, 0, "archiving emails nobody");
  });

  test("a move or a visit in a week that has met is no reason to refuse", async () => {
    w.reset(
      seed({
        ...finishedD(),
        [placePath("bea")]: {
          ...updatesSeed()[placePath("bea")],
          groupsByWeek: [{ groupId: D, fromWeek: 1 }, { groupId: A, fromWeek: 3 }],
          visits: [{ weekNumber: 4, groupId: C, arrangedByUid: "claudia", arrangedAt: new Date("2026-11-18T10:00:00Z") }],
        },
        [placePath("tariq")]: { ...updatesSeed()[placePath("tariq")], visits: [{ weekNumber: 2, groupId: D, arrangedByUid: "claudia", arrangedAt: new Date("2026-11-01T10:00:00Z") }] },
      }),
    );
    const answer = await archive("claudia", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  });

  test("a session called off is not asked about", async () => {
    // Group D's week 3 (Mon 16 Nov) was called off through Change a session; weeks 1 and 2 are finished.
    const calledOff = { w03: { kind: "cancelled", dateKey: "2026-11-16", reason: "Room flooded.", byUid: "claudia", at: new Date("2026-11-15T10:00:00Z") } };
    w.reset(seed({ [registerPath(D, 1)]: register(D, 1), [registerPath(D, 2)]: register(D, 2), [`courseGroups/${D}`]: groupD({ sessionChanges: calledOff }) }));
    assert.ok(w.sessionsOf(D).find((each) => each.weekNumber === 3)?.cancelled, "week 3 reads as called off");
    const answer = await archive("zach", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
  });

  test("a press for the state the group already has writes nothing", async () => {
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }) }));
    const before = everything();
    const answer = await archive("zach", D);
    assert.equal(answer.status, 200);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 4. The transaction decides again
// ---------------------------------------------------------------------------

describe("4. the transaction decides on what it read", () => {
  test("somebody placed in the group between the first read and the write is answered, not archived over", async () => {
    w.reset(seed(finishedD()));
    world.db.beforeCommit = () => world.db.poke(placePath("bea"), { groupId: D });
    const answer = await archive("zach", D);
    assert.equal(answer.status, 409, JSON.stringify(answer.body));
    assert.equal(answer.body.error, "Group D still has 1 person in it. Move them to another group first, then archive it.");
    assert.equal(stored(D).archived, false);
  });
});

// ---------------------------------------------------------------------------
// 5. Restoring, and a run being destroyed
// ---------------------------------------------------------------------------

describe("5. restoring", () => {
  test("goes through for an archived group whose facilitators hold no place elsewhere", async () => {
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }) }));
    const answer = await restore("claudia", D);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(stored(D).archived, false);
  });

  test("is refused while one of its facilitators holds a place in another group", async () => {
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true, facilitatorUids: ["tom", "tariq"] }) }));
    await refusedWith(
      "zach",
      D,
      { archived: false },
      "Group D can’t be restored while 1 of its facilitators holds a place in Group C: a facilitator who holds a place " +
        "sits in the group they facilitate. Take them off Group D’s facilitators first, then restore it.",
    );
  });

  test("both are refused on a run being destroyed", async () => {
    const run = { ...updatesSeed()[`courseRuns/${RUN.agi}`], destroying: true };
    w.reset(seed({ ...finishedD(), [`courseRuns/${RUN.agi}`]: run }));
    await refusedWith("zach", D, { archived: true }, words.ARCHIVE_REFUSAL.destroying);
    w.reset(seed({ [`courseGroups/${D}`]: groupD({ archived: true }), [`courseRuns/${RUN.agi}`]: run }));
    await refusedWith("zach", D, { archived: false }, words.ARCHIVE_REFUSAL.destroying);
  });

  test("a body that does not say true or false is refused", async () => {
    for (const body of [{}, { archived: "yes" }, { archived: 1 }, null]) {
      const answer = await press("zach", D, body);
      assert.equal(answer.status, 400, JSON.stringify(body));
    }
  });
});

describe("the words", () => {
  test("weeks and lists", () => {
    assert.equal(words.weeksWords([2]), "week 2");
    assert.equal(words.weeksWords([2, 3]), "weeks 2 and 3");
    assert.equal(words.weeksWords([1, 2, 4]), "weeks 1, 2 and 4");
    assert.equal(words.groupName("  "), "Untitled group");
    assert.equal(
      words.facilitatorSitsElsewhereWords("Group I", 2, ["Group J", "Group K"]),
      "Group I can’t be restored while 2 of its facilitators hold places in Group J and Group K: a facilitator who holds a place " +
        "sits in the group they facilitate. Take them off Group I’s facilitators first, then restore it.",
    );
    assert.equal(words.visitsToComeWords("Group I", 2, [4, 5]), "Group I still has 2 visits to come, in weeks 4 and 5. Cancel them first, then archive the group.");
  });

  test("no dashes in the words", () => {
    const source = readFileSync(join(REPO, "src", "lib", "courses", "groupArchive", "words.ts"), "utf8");
    assert.doesNotMatch(source, /[\u2013\u2014]/);
  });

  test("a run that takes no move is the staff move's own answer", () => {
    for (const status of ["draft", "applications-open", "applications-closed", "running", "completed", "cancelled"]) {
      for (const archived of [false, true]) {
        const run = { status, archived };
        assert.equal(plan.runTakesNoMove(run), staffMove.runMoveRefusal(run, false) !== null, `${status}, archived ${archived}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The one writer
// ---------------------------------------------------------------------------

/**
 * EVERY WRITE OF `archived` TO A GROUP, read with the compiler's parser from
 * every file in `src` and `scripts`.
 *
 * A write is a call of `update`, `set`, `create`, `add`, `updateDoc`,
 * `setDoc` or `addDoc` whose data names `archived`: an object literal with
 * the key (or one held in a constant of the same file, or returned by a
 * function of it), a dotted-path pair, or an object the file assigns
 * `.archived` on. Its target is a group when the target, or a constant of
 * the file it is built from, names `courseGroups`; another collection when
 * it names one; and UNRESOLVED when it names neither (a parameter, a
 * document handed in). A group write and an unresolved write must each be
 * listed below with why; every listed file must still hold one.
 *
 * Not findings: a group BORN not archived (`archived: false` in a create or
 * a whole-document set, as the run editor and the fixtures make groups),
 * because it changes no group's state; and `scripts/rules-tests`, which
 * writes to an emulator through the rules precisely to show them refusing.
 */
const THROUGH_THE_CHECKS = {
  "src/app/api/courses/groups/[groupId]/archive/route.ts": "the archive route: its write follows the checks, in their transaction",
};
const NOT_A_GROUP = {
  "src/app/api/admissions/rounds/[roundId]/route.ts": "archives an admission round (`ref` is the round's own document)",
  "src/app/api/worksheets/circulations/[circulationId]/close/route.ts": "archives the tasks of a closed circulation",
  "src/lib/applications/editor/write.ts": "creates an application form, not archived",
  "src/lib/courses/explainers/schedule.ts": "archives an explainer's tasks when it is cancelled",
  "src/lib/courses/registerCorrection/chase.ts": "reopens the register follow-up task a correction chases",
  "src/lib/courses/sessionChange/didNotHappen.ts": "archives the register follow-up task of a session that did not happen",
};

const WRITE_CALLS = new Set(["update", "set", "create", "add", "updateDoc", "setDoc", "addDoc"]);
const BIRTHS = new Set(["set", "create", "add", "setDoc", "addDoc"]);

function* sourceFiles(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith(".d.ts")) yield full;
  }
}

const unwrap = (node) => {
  let n = node;
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)))) {
    n = n.expression;
  }
  return n;
};

/** Every write of `archived` in one file: `{ line, target: "group" | "unresolved", birth }`. */
function archivedWritesIn(file, text = readFileSync(file, "utf8")) {
  if (!text.includes("archived")) return [];
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const decls = new Map();
  const functions = new Map();
  const assignsArchived = new Set();
  const index = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!decls.has(node.name.text)) decls.set(node.name.text, []);
      decls.get(node.name.text).push(node.initializer);
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) functions.set(node.name.text, node.initializer);
    }
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;
      const named =
        (ts.isPropertyAccessExpression(left) && left.name.text === "archived") ||
        (ts.isElementAccessExpression(left) && ts.isStringLiteral(left.argumentExpression) && left.argumentExpression.text === "archived");
      if (named && ts.isIdentifier(left.expression)) assignsArchived.add(left.expression.text);
    }
    ts.forEachChild(node, index);
  };
  index(sf);
  const returnsOf = (fn) => {
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
    const out = [];
    const walk = (node) => {
      if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
      if (!ts.isFunctionLike(node)) ts.forEachChild(node, walk);
    };
    if (fn.body) ts.forEachChild(fn.body, walk);
    return out;
  };
  const resolve = (node, depth = 0) => {
    const n = unwrap(node);
    if (!n || depth >= 4) return [n];
    if (ts.isIdentifier(n) && decls.has(n.text)) return decls.get(n.text).flatMap((d) => resolve(d, depth + 1));
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && functions.has(n.expression.text)) {
      return returnsOf(functions.get(n.expression.text)).flatMap((r) => resolve(r, depth + 1));
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return returnsOf(n).flatMap((r) => resolve(r, depth + 1));
    return [n];
  };
  /** The values an object literal gives `archived`, as source text. */
  const archivedIn = (node) => {
    if (!node || !ts.isObjectLiteralExpression(node)) return [];
    return node.properties
      .filter((p) => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === "archived")
      .map((p) => (ts.isPropertyAssignment(p) ? unwrap(p.initializer).getText() : "archived"));
  };
  const isOptions = (node) => {
    const n = unwrap(node);
    return Boolean(n && ts.isObjectLiteralExpression(n) && n.properties.length > 0 && n.properties.every((p) => p.name && ["merge", "mergeFields"].includes(p.name.getText())));
  };
  /** The target's text with the constants it is built from, so `groupRef` reads as what it names. */
  const targetText = (node, depth = 0) => {
    const n = unwrap(node);
    let out = n.getText();
    if (depth >= 4) return out;
    const ids = [];
    const collect = (m) => {
      if (ts.isIdentifier(m)) ids.push(m.text);
      ts.forEachChild(m, collect);
    };
    collect(n);
    for (const id of ids) for (const d of decls.get(id) ?? []) out += ` ${targetText(d, depth + 1)}`;
    return out;
  };

  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : null;
      if (name && WRITE_CALLS.has(name)) {
        const args = node.arguments;
        const first = args[0] ? unwrap(args[0]) : null;
        let target = null;
        let data = [];
        const values = [];
        if (!ts.isPropertyAccessExpression(callee)) {
          target = args[0];
          data = args[1] ? [args[1]] : [];
        } else if (first && ts.isStringLiteral(first)) {
          target = callee.expression;
          for (let i = 0; i < args.length; i += 2) {
            const key = unwrap(args[i]);
            if (ts.isStringLiteral(key) && key.text === "archived") values.push(args[i + 1]?.getText() ?? "?");
          }
        } else if (args.length === 1 || isOptions(args[1])) {
          target = callee.expression;
          data = [args[0]];
        } else {
          target = args[0];
          data = args[1] ? [args[1]] : [];
        }
        for (const d of data) {
          const u = unwrap(d);
          if (u && ts.isIdentifier(u) && assignsArchived.has(u.text)) values.push("assigned");
          for (const r of resolve(d)) values.push(...archivedIn(r));
        }
        if (values.length > 0 && target) {
          const named = targetText(target);
          const where = /courseGroups/.test(named) ? "group" : /["'`][A-Za-z]+[/"'`]/.test(named) ? "other" : "unresolved";
          const birth = BIRTHS.has(name) && values.every((v) => v === "false");
          if (where !== "other" && !(where === "group" && birth)) {
            found.push({ line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, target: where, values });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("6. nothing else writes a group's archived", () => {
  test("every write of archived in src and scripts is the route's, or listed with why it is not a group's", () => {
    const found = new Map();
    for (const top of ["src", "scripts"]) {
      for (const file of sourceFiles(join(REPO, top))) {
        const path = relative(REPO, file).split("\\").join("/");
        if (path.startsWith("scripts/rules-tests/")) continue;
        const writes = archivedWritesIn(file);
        if (writes.length > 0) found.set(path, writes);
      }
    }
    const listed = { ...THROUGH_THE_CHECKS, ...NOT_A_GROUP };
    const unlisted = [...found].filter(([path]) => !(path in listed));
    assert.deepEqual(
      unlisted.map(([path, writes]) => `${path}: ${writes.map((each) => `line ${each.line} (${each.target}: ${each.values.join(", ")})`).join("; ")}`),
      [],
      "A new write of archived to a group, or one this guard cannot tell is not a group's. A group's archived " +
        "changes only through PATCH /api/courses/groups/[groupId]/archive and its checks; anything else goes in NOT_A_GROUP with why.",
    );
    for (const path of Object.keys(listed)) {
      assert.ok(found.has(path), `${path} is listed but writes no archived any more: take it off the list`);
    }
    for (const path of Object.keys(NOT_A_GROUP)) {
      assert.ok(found.get(path).every((each) => each.target === "unresolved"), `${path} now writes archived to a group`);
    }
  });

  test("the guard sees the forms a writer takes", () => {
    const fixtures = [
      ['const ref = db.collection("courseGroups").doc(id); await ref.update({ archived: true });', "group"],
      ['await updateDoc(doc(db, "courseGroups", id), { archived, updatedAt });', "group"],
      ['const patch = { archived: true }; tx.update(db.collection("courseGroups").doc(id), patch);', "group"],
      ['const out = {}; out.archived = x; await db.collection("courseGroups").doc(id).update(out);', "group"],
      ['await db.collection("courseGroups").doc(id).update("archived", true);', "group"],
      ['const shape = () => ({ archived: true }); await db.collection("courseGroups").doc(id).set(shape(), { merge: true });', "group"],
      ["await snap.ref.update({ archived: true });", "unresolved"],
      ['await db.collection("tasks").doc(id).update({ archived: true });', null],
      ['await db.collection("courseGroups").doc(id).set({ name: "G", archived: false });', null],
      ['await db.collection("courseGroups").doc(id).update({ name: "G" });', null],
    ];
    for (const [source, expected] of fixtures) {
      assert.equal(archivedWritesIn("fixture.ts", source)[0]?.target ?? null, expected, source);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. The two ways in
// ---------------------------------------------------------------------------

describe("7. the run editor and the group's page call the route", () => {
  const read = (...parts) => readFileSync(join(REPO, "src", ...parts), "utf8");
  test("the run editor's switch keeps its words and calls the route", () => {
    const editor = read("features", "courses", "GroupEditor.tsx");
    for (const said of [
      'label="Archived"',
      'description="Archived groups stay on the run for the record but drop out of allocation."',
      '"Archiving group…"',
      '"Group archived"',
      '"Restoring group…"',
      '"Group restored"',
    ]) {
      assert.ok(editor.includes(said), said);
    }
    assert.match(editor, /await setGroupArchived\(group\.id, next\);/);
    // A course drafter reaches the editor and the route refuses them: the switch is disabled, and says who.
    assert.match(editor, /disabled=\{disabled \|\| !canArchive\}/);
    assert.match(editor, /"Only an admin or somebody who can approve courses archives or restores a group\."/);
    const runEditor = read("features", "courses", "RunEditor.tsx");
    assert.match(runEditor, /const canArchiveGroups = role !== null && canApproveCourse\(\{ role, permissions \}\);/);
    assert.match(runEditor, /canArchive=\{canArchiveGroups\}/);
    const mutations = read("features", "courses", "courseMutations.ts");
    assert.match(mutations, /\/api\/courses\/groups\/\$\{encodeURIComponent\(groupId\)\}\/archive/);
    assert.doesNotMatch(mutations, /out\.archived|archived: boolean;\s*\}>;/);
  });

  test("the group's page archives and restores through the same route", () => {
    const panel = read("features", "courses", "groupPage", "ArchiveGroup.tsx");
    assert.match(panel, /\/api\/courses\/groups\/\$\{encodeURIComponent\(groupId\)\}\/archive/);
    assert.match(read("features", "courses", "groupPage", "GroupPage.tsx"), /<ArchiveItem groupId=\{view\.groupId\} groupName=\{view\.groupName\} \/>/);
  });
});
