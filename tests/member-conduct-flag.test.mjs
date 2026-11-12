/**
 * The conduct flag: the reviewer projection, and source pins on the one route
 * allowed to write `memberConductFlags/{uid}`.
 *
 * ## Why the projection is tested this hard for a two-key object
 *
 * `conductFlagForQueue` is the boundary between "a reviewer knows to ask an
 * admin" and "a rotating pool of student reviewers reads an allegation about a
 * named classmate". The failure mode is not a thrown error, it is a payload
 * that quietly carries one extra key, so the assertions are on the KEY SET and
 * not only on the values: a `reason` that is present but empty is one careless
 * `Object.keys` away from being logged, exported, or rendered as a blank field
 * that invites somebody to fill it in.
 *
 * ## Why the rest are source pins
 *
 * The route is `import`-able only with `firebase-admin` and a request context,
 * so the properties that matter (the guard runs first, the gate is admin, the
 * clear is a delete) are asserted at the source in the `course-deletion.test.mjs`
 * idiom. If a pin fails, the route has drifted from the rule; do not fix it by
 * loosening the pin.
 *
 * The last tests drive the real opening handler (`conduct-flag/open`, a
 * POST, the only way a flag is read), in the stubbed world
 * `tests/lib/handoverWorld.mjs` provides, because the rules they hold (the
 * person a flag describes never reads it, an admin included; every opening is
 * recorded before the flag is read, and a flag stays closed when the opening
 * cannot be recorded) are about who asks and what is written, which a source
 * pin cannot see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g;
const STUBS = new Map([["server-only", "export {};"]]);

function resolveLocalTs(specifier, fromFile) {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const graph = new Map();
let tsc = null;

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

function stubUrl(key) {
  const cached = graph.get(key);
  if (cached) return cached;
  const url = dataUrl(STUBS.get(key));
  graph.set(key, url);
  return url;
}

async function transpileToDataUrl(file) {
  if (STUBS.has(file)) return stubUrl(file);
  const cached = graph.get(file);
  if (cached) return cached;

  const { outputText } = tsc.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      target: tsc.ScriptTarget.ES2022,
      module: tsc.ModuleKind.ESNext,
    },
  });

  const rewrites = new Map();
  for (const [, , , specifier] of outputText.matchAll(SPECIFIER)) {
    if (rewrites.has(specifier)) continue;
    if (STUBS.has(specifier)) {
      rewrites.set(specifier, stubUrl(specifier));
    } else if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const target = resolveLocalTs(specifier, file);
      if (!target) throw new Error(`cannot resolve "${specifier}" imported from ${file}`);
      rewrites.set(specifier, await transpileToDataUrl(target));
    } else {
      rewrites.set(specifier, import.meta.resolve(specifier));
    }
  }

  const rewritten = outputText.replace(
    SPECIFIER,
    (whole, prefix, quote, specifier) =>
      rewrites.has(specifier)
        ? `${prefix}${quote}${rewrites.get(specifier)}${quote}`
        : whole,
  );
  const url = dataUrl(rewritten);
  graph.set(file, url);
  return url;
}

async function loadTs(relativePath) {
  if (!tsc) {
    try {
      tsc = (await import("typescript")).default;
    } catch (err) {
      throw new Error(
        "the `typescript` devDependency is not installed. Run `npm install`.",
        { cause: err },
      );
    }
  }
  return import(await transpileToDataUrl(join(SRC, relativePath)));
}

const { conductChip, conductFlagForQueue, normalizeMemberConductFlag } = await loadTs(
  "lib/firestore/memberConductFlags.ts",
);

const ROUTE = readFileSync(
  join(SRC, "app", "api", "admin", "members", "[uid]", "conduct-flag", "route.ts"),
  "utf8",
);

/** Comments stripped: several pins below ask "does the code do X", and the
 *  comments in the file name the very things being asserted. */
const ROUTE_CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The one way a flag is read: an admin's opening, recorded first. */
const OPEN_CODE = readFileSync(
  join(SRC, "app", "api", "admin", "members", "[uid]", "conduct-flag", "open", "route.ts"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const FLAG = normalizeMemberConductFlag("u1", {
  flagged: true,
  reason: "Shouted down another participant in week two and would not stop.",
  byUid: "admin1",
  byName: "Admin One",
  at: new Date("2026-10-12T09:30:00Z"),
});

// ===========================================================================
// The projection
// ===========================================================================

test("a non-admin viewer gets a boolean and NO reason key at all", () => {
  const chip = conductFlagForQueue(FLAG, false);
  assert.deepEqual(Object.keys(chip), ["flagged"]);
  assert.equal(chip.flagged, true);
  // Absent, not undefined and not null. A key that exists with an empty value
  // is a key a downstream reader can render, log or export.
  assert.equal("reason" in chip, false);
  assert.equal("flaggedAt" in chip, false);
  assert.equal("byUid" in chip, false);
  assert.equal("byName" in chip, false);
});

test("an unflagged member reads the same shape as a flagged one", () => {
  // A payload whose shape changes with the answer tells a reviewer something
  // by its silence. Both cases are one key.
  const none = conductFlagForQueue(null, false);
  assert.deepEqual(none, { flagged: false });
  assert.deepEqual(Object.keys(none), ["flagged"]);
});

test("an admin viewer gets the reason, the date and the author, nothing more", () => {
  const view = conductFlagForQueue(FLAG, true);
  // `byName` is part of the projection, not a key a route bolts on beside it:
  // one function decides what an admin sees, so there is one place to read.
  assert.deepEqual(Object.keys(view).sort(), ["byName", "flagged", "flaggedAt", "reason"]);
  assert.equal(view.flagged, true);
  assert.equal(view.reason, FLAG.reason);
  assert.equal(view.flaggedAt, "2026-10-12T09:30:00.000Z");
  assert.equal(view.byName, "Admin One");
});

test("an admin viewing an unflagged member gets empties, not a missing key", () => {
  // The admin shape is what the Members row renders against, so it is stable
  // whether or not there is a flag; only the reviewer shape narrows.
  const view = conductFlagForQueue(null, true);
  assert.deepEqual(view, { flagged: false, reason: "", flaggedAt: null, byName: "" });
});

test("the reason survives the projection exactly, capped only by the normaliser", () => {
  const long = "x".repeat(600);
  const flag = normalizeMemberConductFlag("u1", { flagged: true, reason: long });
  assert.equal(flag.reason.length, 500);
  assert.equal(conductFlagForQueue(flag, true).reason.length, 500);
  assert.equal("reason" in conductFlagForQueue(flag, false), false);
});

test("a doc that says flagged: false is not a flag, however it got there", () => {
  const cleared = normalizeMemberConductFlag("u1", {
    flagged: false,
    reason: "left behind by an older write",
  });
  assert.deepEqual(conductFlagForQueue(cleared, false), { flagged: false });
  assert.deepEqual(conductChip(cleared), { flagged: false });
});

// ===========================================================================
// Source pins on the route
// ===========================================================================

test("MODEL: the view-as guard runs before anything else the POST does", () => {
  const post = ROUTE_CODE.slice(ROUTE_CODE.indexOf("export async function POST"));
  const guard = post.indexOf("assertNotImpersonating()");
  assert.ok(guard > -1, "POST no longer calls assertNotImpersonating()");
  // Before the session lookup, before the body is read, before the write.
  for (const later of ["requireAdmin()", "ctx.params", "req.json()", "ref.set("]) {
    const at = post.indexOf(later);
    assert.ok(at > guard, `${later} runs before the view-as guard`);
  }
});

test("MODEL: every handler is admin-only, and the gate is the live session", () => {
  assert.match(ROUTE_CODE, /getCurrentUser\(\)/);
  assert.match(ROUTE_CODE, /actor\.role !== "admin"/);
  // CHANGED ON PURPOSE (privacy v17, "we record each time one is opened"):
  // the route has no GET, so nothing answers with a flag unrecorded. Reading
  // one is the open route's POST, held below and run at the end of this file.
  assert.equal(ROUTE_CODE.indexOf("export async function GET"), -1, "the route answers a GET again, which would read a flag without recording the opening");
  for (const handler of ["export async function POST"]) {
    const body = ROUTE_CODE.slice(ROUTE_CODE.indexOf(handler));
    assert.ok(
      body.indexOf("requireAdmin()") > -1,
      `${handler} does not go through the admin gate`,
    );
    assert.ok(
      body.indexOf("requireAdmin()") < body.indexOf("collection(COLLECTION)"),
      `${handler} touches the collection before checking the caller`,
    );
  }
  // The opening: view-as, the live session, admin, not their own, then the
  // member, then the opening recorded, and the flag read only inside it.
  assert.deepEqual([...OPEN_CODE.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map((m) => m[1]), ["POST"], "the opening route answers something besides its POST");
  const order = [
    "assertNotImpersonating()",
    "getCurrentUser()",
    'actor.role !== "admin"',
    "uid === actor.uid",
    "getAdminDb()",
    'collection("users").doc(uid).get()',
    "openConductFlagRecorded(",
    'collection("memberConductFlags").doc(uid).get()',
  ].map((step) => [step, OPEN_CODE.indexOf(step)]);
  for (const [step, at] of order) assert.ok(at > -1, `the opening route no longer does ${step}`);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i - 1][1] < order[i][1], `the opening route does ${order[i][0]} before ${order[i - 1][0]}`);
  }
  assert.equal(OPEN_CODE.split('collection("memberConductFlags")').length, 2, "the opening route reads a flag somewhere besides inside the recorded opening");
  assert.match(OPEN_CODE, /if \(!opened\.ok\) return NextResponse\.json\(\{ error: NOT_RECORDED \}, \{ status: 500 \}\);/);
});

test("MODEL: clearing DELETES the row rather than writing flagged: false", () => {
  // Absence is the cleared state (`conductChip(null)` is `{ flagged: false }`),
  // so a kept row would only preserve the allegation with nothing pointing at
  // it, and the account-deletion sweep would have a second shape to handle.
  assert.match(ROUTE_CODE, /if \(!body\.flagged\) \{[\s\S]*?ref\.delete\(\)/);
  // Scoped to the WRITE, not to the whole file: the route may say the words
  // "flagged: false" in a comparison or an error string without writing one,
  // and a pin that forbids a literal anywhere is a pin the next edit trips
  // over for no reason.
  const set = /ref\.set\(\{([\s\S]*?)\}\);/.exec(ROUTE_CODE);
  assert.ok(set, "the flag write is no longer a single set()");
  assert.doesNotMatch(set[1], /flagged:\s*false/);
});

test("MODEL: re-flagging an already-flagged member rewrites the reason only", () => {
  // Correcting a typo must not re-date the record or reassign it to whoever
  // fixed the wording, so the second write is an update of `reason` alone.
  const post = ROUTE_CODE.slice(ROUTE_CODE.indexOf("export async function POST"));
  assert.match(post, /const alreadyFlagged =/);
  assert.match(post, /if \(alreadyFlagged\) \{\s*await ref\.update\(/);
  const update = /ref\.update\(\{([\s\S]*?)\}\)/.exec(post);
  assert.ok(update, "the correction path no longer goes through update()");
  for (const kept of ["at:", "byUid:", "byName:"]) {
    assert.ok(
      !update[1].includes(kept),
      `the correction write touches ${kept}, which belongs to the original flag`,
    );
  }
});

test("MODEL: an admin cannot flag their own account", () => {
  // Another admin can still flag this one: the refusal is about the actor
  // being the subject, not about the subject's role.
  const post = ROUTE_CODE.slice(ROUTE_CODE.indexOf("export async function POST"));
  const at = post.indexOf("uid === actor.uid");
  assert.ok(at > -1, "POST no longer refuses a self-flag");
  assert.match(post.slice(at, at + 300), /status: 400/);
  assert.ok(at < post.indexOf("ref.set("), "the self check runs after the write");
});

test("MODEL: an empty display name still names somebody in the record", () => {
  // `??` would keep an empty string, and the Members row would read "Set by "
  // with nothing after it.
  assert.match(ROUTE_CODE, /byName: actor\.displayName \|\| "An admin"/);
});

test("MODEL: the reason keeps its newlines, because MemberText renders pre-wrap", () => {
  const clean = /function cleanReason\([\s\S]*?\n\}/.exec(ROUTE_CODE);
  assert.ok(clean, "cleanReason is no longer a function in this file");
  // The control-character sweep must SKIP \u000a. A class that spans it turns
  // an admin's two-line reason into one run-on line the moment it is saved,
  // and the renderer on the other side is `pre-wrap`.
  assert.doesNotMatch(clean[0], /\\u0000-\\u001f/);
  assert.match(clean[0], /\\u0000-\\u0009\\u000b-\\u001f/);
  // And a paste of blank lines cannot stretch the Members row.
  assert.match(clean[0], /\\n\{3,\}/);
});

test("MODEL: a flag without a reason is refused, and the cap is the shared one", () => {
  assert.match(ROUTE_CODE, /CONDUCT_FLAG_FIELD_LIMITS\.reason/);
  assert.match(ROUTE_CODE, /const reason = cleanReason\(body\.reason\);\s*if \(!reason\)/);
  // 400, not a silently-empty flag.
  const at = ROUTE_CODE.indexOf("if (!reason)");
  assert.match(ROUTE_CODE.slice(at, at + 400), /status: 400/);
});

test("MODEL: the write names its author and never touches users/{uid}", () => {
  const set = /ref\.set\(\{([\s\S]*?)\}\);/.exec(ROUTE_CODE);
  assert.ok(set, "the flag write is no longer a single set()");
  for (const field of ["uid,", "flagged: true", "reason,", "byUid:", "byName:", "at:"]) {
    assert.ok(set[1].includes(field), `the written document lost ${field}`);
  }
  // The whole point of the collection: nothing here writes to the user doc,
  // which is own-row readable and carries a live listener.
  assert.doesNotMatch(ROUTE_CODE, /collection\("users"\)\.doc\(uid\)\.(set|update)/);
});

test("MODEL: neither handler answers with the reviewer projection", () => {
  // Only admins reach this route, so both handlers use the admin shape. A
  // `false` here would mean an admin control that cannot show its own state.
  // The opening route is held the same way.
  for (const code of [ROUTE_CODE, OPEN_CODE]) {
    assert.match(code, /conductFlagForQueue\(flag, true\)/);
    assert.doesNotMatch(code, /conductFlagForQueue\([^)]*, false\)/);
    // And neither handler spreads the projection to add a sibling key. The
    // moment a route does that, "what may this viewer see" is decided at the
    // call site again, and the next route to copy the shape may be a reviewer's.
    assert.doesNotMatch(code, /\.\.\.conductFlagForQueue/);
  }
});

// ===========================================================================
// What the control says, and the tree that keeps it true
// ===========================================================================

const CONTROL = readFileSync(join(SRC, "features", "admin", "ConductFlagControl.tsx"), "utf8");

test("WORDS: the confirm says only admins see a flag, and that its owner can ask for what is written", () => {
  assert.ok(
    CONTROL.includes(
      "`Flag ${displayName}?\\n\\nOnly admins will see this flag and its reason. ${displayName} can ask us for a copy of what you write, so write what happened and when.`",
    ),
    "the confirm when flagging has drifted from its words",
  );
});

test("WORDS: the line under the label says the same, in every state of the control", () => {
  const flat = CONTROL.replace(/\s+/g, " ");
  assert.ok(
    flat.includes("Only admins see this flag and its reason. Reviewers and the person flagged don&apos;t see it on the site."),
    "the line under the label has drifted from its words",
  );
  // The words before the privacy policy was settled said reviewers see a flag
  // exists. No screen a reviewer opens reads one (below), and the policy says
  // only admins see a flag and its reason.
  assert.doesNotMatch(CONTROL, /Reviewers will see|yes or no chip|neither will the member/);
});

test("WORDS: above the box for a reason, the line asking for no medical details and no alleged crime", () => {
  // Privacy policy version 17: "Conduct records aren't for health information
  // or allegations of crimes, and we ask anyone adding to one to leave them
  // out." This line is that asking, above the box whether an admin is flagging
  // or rewording a reason.
  const flat = CONTROL.replace(/\s+/g, " ");
  const LINE =
    "<p className={styles.muted}> Don&apos;t include medical details or describe an alleged crime. Take anything that might be a crime to the head admin instead. </p> <CountedTextarea";
  assert.ok(flat.includes(LINE), "the line above the reason box has drifted from its words, or is no longer above the box");
  assert.equal(flat.split("<CountedTextarea").length, 2, "there is a second box for a reason without the line above it");
  const compose = flat.slice(flat.indexOf("{state !== null && composing && ("));
  assert.ok(compose.indexOf("Don&apos;t include medical details") < compose.indexOf("<CountedTextarea"), "the line is not in the box's own block");
});

/**
 * WHO READS A FLAG. The control tells an admin that reviewers and the person
 * flagged never see a flag on the site, and that is true only while nothing a
 * reviewer or a member is served reads one. So every file under `src` whose
 * code names the collection, either projection, the route or the control is
 * listed here with what it does, both ways: a review screen that starts
 * reading a flag fails here until somebody decides, and the privacy policy
 * with it.
 */
const FLAG_READERS = new Map([
  [
    "app/api/admin/members/[uid]/conduct-flag/route.ts",
    "the one route that writes a flag, setting or clearing it; admin-only, and it answers with the admin projection",
  ],
  [
    "app/api/admin/members/[uid]/conduct-flag/open/route.ts",
    "the one route that reads a flag: an admin's opening, recorded first, answered with the admin projection",
  ],
  [
    "features/admin/ConductFlagControl.tsx",
    "the control on one person's page in the admin area, which calls those two routes and nothing else",
  ],
  [
    "features/admin/MemberItem.tsx",
    "draws the control on a person's page in the admin area, behind the admin-only page gate",
  ],
  [
    "lib/firestore/accountDeletion.ts",
    "deleting an account deletes its flag at the uid, and reads nothing of it back",
  ],
]);
/** The collection's own module: it defines the projections and reads nothing. */
const FLAG_HOME = "lib/firestore/memberConductFlags.ts";
const NAMES_A_FLAG = /["'`]memberConductFlags["'`]|\bconductFlagForQueue\b|\bconductChip\b|\bConductFlagControl\b|\/conduct-flag\b/;

test("TREE: every file that names a flag is listed, and every listed file still names one", async () => {
  const { walkSource } = await import("./lib/functionScan.mjs");
  const { stripSource } = await import("./lib/stripSource.mjs");
  const found = [];
  let files = 0;
  for (const full of walkSource(SRC)) {
    files += 1;
    const code = stripSource(readFileSync(full, "utf8"), { keepStrings: true });
    if (!NAMES_A_FLAG.test(code)) continue;
    const path = full.slice(SRC.length + 1).split("\\").join("/");
    if (path !== FLAG_HOME) found.push(path);
  }
  assert.ok(files > 1000, `read ${files} files: the walk reached too little of the tree`);
  assert.deepEqual(
    found.filter((path) => !FLAG_READERS.has(path)),
    [],
    "These read a conduct flag and are not listed. Only admins see a flag and its reason: a page or a route " +
      "a reviewer or a member is served must not read one, and the control and the privacy policy both say so.",
  );
  assert.deepEqual([...FLAG_READERS.keys()].filter((path) => !found.includes(path)), [], "a listed file no longer names a flag");
  for (const [path, why] of FLAG_READERS) {
    assert.ok(why.length >= 40, `${path}: a reason is missing or too short to be one`);
    assert.ok(
      path.startsWith("app/api/admin/") || path.startsWith("features/admin/") || path === "lib/firestore/accountDeletion.ts",
      `${path} is outside the admin area`,
    );
  }
});

// ===========================================================================
// THE HANDLER: the person a flag describes never reads it, admins included,
// and every opening is recorded before the flag is read.
// ===========================================================================

const OPEN_ROUTE = join("app", "api", "admin", "members", "[uid]", "conduct-flag", "open", "route.ts");
const REASON = "Talked over another member in the week two session.";

async function flagWorld() {
  const { makeWorld } = await import("./lib/handoverWorld.mjs");
  const { session, userDoc } = await import("./lib/applicationsSmallTerm.mjs");
  const w = makeWorld("__conductFlag");
  const route = await w.loadTs(OPEN_ROUTE);
  const flag = (byUid, byName) => ({ flagged: true, reason: REASON, byUid, byName, at: new Date("2026-10-20T10:00:00Z") });
  w.reset({
    "users/zach": userDoc(session("zach", "admin", false, "Zach Levin")),
    "users/ada": userDoc(session("ada", "admin", false, "Ada Byron")),
    "users/amara": userDoc(session("amara", "member", false, "Amara Okafor")),
    "users/kofi": userDoc(session("kofi", "member", false, "Kofi Mensah")),
    // Ada flagged Zach, and Zach flagged Amara. Kofi has no flag.
    "memberConductFlags/zach": flag("ada", "Ada Byron"),
    "memberConductFlags/amara": flag("zach", "Zach Levin"),
  });
  /** Every opening recorded so far, as stored. */
  const openings = () =>
    w.world.db
      .paths()
      .filter((path) => path.startsWith("recordOpenings/"))
      .map((path) => w.world.db.read(path));
  return { w, route, openings };
}

test("HANDLER: an admin reads another member's flag and never the flag on their own account", async () => {
  const { w, route, openings } = await flagWorld();

  const other = await w.call("zach", route.POST, { uid: "amara" });
  assert.equal(other.status, 200);
  assert.equal(other.body.flagged, true);
  assert.equal(other.body.reason, REASON);

  const before = w.everything();
  const own = await w.call("zach", route.POST, { uid: "zach" });
  assert.equal(own.status, 400, `the subject read their own flag: ${JSON.stringify(own.body)}`);
  assert.deepEqual(Object.keys(own.body), ["error"]);
  assert.doesNotMatch(JSON.stringify(own.body), /Talked over|Ada|flagged/i, "the refusal says something about the flag");
  // Nothing written, an opening included: the refusal comes before anything is read or recorded.
  assert.equal(w.everything(), before);
  // The same answer whether a flag is there or not, so the refusal is no answer either.
  w.world.db.poke("memberConductFlags/zach", { flagged: false });
  assert.deepEqual((await w.call("zach", route.POST, { uid: "zach" })).body, own.body);

  // Another admin still reads it.
  const byAnother = await w.call("ada", route.POST, { uid: "amara" });
  assert.equal(byAnother.status, 200);
  assert.equal(openings().length, 2, "an opening by another admin was not recorded, or a refusal was");
});

test("HANDLER: each opening is recorded first, with who, whose and when, and nothing the flag says", async () => {
  const { w, route, openings } = await flagWorld();

  const opened = await w.call("zach", route.POST, { uid: "amara" });
  assert.equal(opened.status, 200);
  const rows = openings();
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["actorName", "actorUid", "kind", "openedAt", "subjectUid"]);
  assert.equal(rows[0].kind, "conduct-flag");
  assert.equal(rows[0].actorUid, "zach");
  assert.equal(rows[0].actorName, "Zach Levin");
  assert.equal(rows[0].subjectUid, "amara");
  assert.ok(rows[0].openedAt instanceof Date, "the opening has no time");
  assert.doesNotMatch(JSON.stringify(rows), /Talked over|week two/, "an opening keeps something the flag says");

  // Opening it again is another opening.
  await w.call("zach", route.POST, { uid: "amara" });
  assert.equal(openings().length, 2);

  // An opening of somebody with no flag is recorded too, as an opening, and answers the empty shape.
  const none = await w.call("zach", route.POST, { uid: "kofi" });
  assert.equal(none.status, 200);
  assert.deepEqual(none.body, { flagged: false, reason: "", flaggedAt: null, byName: "" });
  assert.equal(openings().length, 3);

  // Nobody but an admin, and nobody in a view-as session; neither records anything.
  const before = w.everything();
  assert.equal((await w.call("amara", route.POST, { uid: "kofi" })).status, 403);
  assert.equal((await w.call(null, route.POST, { uid: "amara" })).status, 401);
  assert.equal((await w.call("zach", route.POST, { uid: "amara" }, { viewAs: true })).status, 403);
  // A made-up id records nothing: an opening is recorded only against a member who is there.
  assert.equal((await w.call("zach", route.POST, { uid: "nobody-here" })).status, 404);
  assert.equal(w.everything(), before);
});

test("HANDLER: when the opening cannot be recorded, nothing of the flag is read or answered", async () => {
  const { w, route, openings } = await flagWorld();
  const db = w.world.db;
  const collection = db.collection;
  const asked = [];
  db.collection = (name) => {
    asked.push(name);
    if (name !== "recordOpenings") return collection(name);
    return { doc: () => ({ create: async () => { throw new Error("the record of openings refused the write"); } }) };
  };
  try {
    const refused = await w.call("zach", route.POST, { uid: "amara" });
    assert.equal(refused.status, 500);
    assert.deepEqual(Object.keys(refused.body), ["error"]);
    assert.doesNotMatch(JSON.stringify(refused.body), /Talked over|week two|Zach Levin|flagged/i, "a refused opening says something of the flag");
    assert.ok(!asked.includes("memberConductFlags"), "the flag was read though its opening was never recorded");
  } finally {
    db.collection = collection;
  }
  assert.equal(openings().length, 0);
});
