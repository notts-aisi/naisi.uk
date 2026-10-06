/**
 * What a fixture ledger may hold, and where a fixture account's password comes
 * from (run via `npm test`, Node's built-in test runner, no dependencies).
 *
 * WHY. The state directory is uploaded when a run fails, so that a person can
 * tear a stranded fixture down, and an uploaded file is read by whoever can
 * read the repository. A run also prints its run id. So four things have to
 * hold for every fixture, present and future:
 *
 *  1. A LEDGER HOLDS NO CREDENTIAL. `writeState` lifts every value under a key
 *     in `PRIVATE_KEYS`, at any depth, into a second file beside the state
 *     directory, and `readState` puts it back. Checked by writing real files.
 *  2. A PASSWORD IS MADE, NOT BUILT. It comes from `fixturePassword()`, which
 *     is random, and never from a template, a run id or the clock. Checked by
 *     reading every fixture module and every file of the harness.
 *  3. A SPEC READS ITS STATE THROUGH `readState`. One that parsed the ledger
 *     file itself would find no password in it and fail at its first sign-in,
 *     so this is here to say why rather than to catch a leak.
 *  4. ONLY THE STATE AND ARTIFACT DIRECTORIES ARE UPLOADED. Every
 *     `upload-artifact` step in every workflow names one of the two, and the
 *     private directory is neither of them and is ignored by git.
 *
 * Each walk covers the tree, so a new fixture, spec or workflow is held to the
 * same rules without anyone remembering this file exists. A file the reader
 * below cannot make sense of fails rather than being skipped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACTS_DIR,
  PRIVATE_KEYS,
  STATE_DIR,
  clearState,
  fixturePassword,
  privateDir,
  privatePath,
  readState,
  statePath,
  writeState,
} from "../scripts/e2e-fixtures/core.mjs";
import { assertReadable, stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (file) => relative(REPO_ROOT, file).split(sep).join("/");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** A file as code: comments gone, strings kept, and a loud failure if that reading is implausible. */
function code(file) {
  const source = readFileSync(file, "utf8");
  const stripped = stripSource(source, { keepStrings: true });
  assertReadable(source, stripped, rel(file), assert);
  return stripped;
}

const FIXTURE_MODULES = walk(join(REPO_ROOT, "scripts", "e2e-fixtures")).filter((f) => f.endsWith(".mjs"));
const SPECS = walk(join(REPO_ROOT, "tests", "e2e")).filter((f) => f.endsWith(".spec.mjs"));
const HARNESS = [
  ...FIXTURE_MODULES,
  ...walk(join(REPO_ROOT, "scripts", "e2e")).filter((f) => /\.m?js$/.test(f)),
  ...SPECS,
  join(REPO_ROOT, "scripts", "run-e2e.mjs"),
  join(REPO_ROOT, "scripts", "seed-fake-applicants.mjs"),
];
const WORKFLOWS = walk(join(REPO_ROOT, ".github", "workflows")).filter((f) => /\.ya?ml$/.test(f));

// ---------------------------------------------------------------------------
// 1. A ledger holds no credential
// ---------------------------------------------------------------------------

/** A state directory of its own, under a temporary root that is removed afterwards. */
function scratch(run) {
  const root = mkdtempSync(join(tmpdir(), "e2e-ledger-"));
  try {
    return run(join(root, ".e2e-state"), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Every `[path, value]` in a parsed ledger whose key is private and whose value is not null. */
function privateValuesIn(value, trail = []) {
  if (Array.isArray(value)) return value.flatMap((item, i) => privateValuesIn(item, [...trail, i]));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    PRIVATE_KEYS.includes(key) && inner !== null
      ? [[[...trail, key].join("."), inner]]
      : privateValuesIn(inner, [...trail, key]),
  );
}

test("a ledger holds no value under a private key, at any depth, and the state reads back whole", () => {
  scratch((dir, root) => {
    const first = fixturePassword();
    const second = fixturePassword();
    const state = {
      runId: "abc123",
      member: { uid: "u1", email: "e2e-fabc1230@e2e.invalid", password: first },
      applicants: [
        { index: 0, uid: "u2", password: second },
        { index: 1, uid: "u3", password: null },
      ],
      adminUid: "uid-of-the-account-the-harness-did-not-make",
      throttleId: "group1__uid-of-the-account-the-harness-did-not-make",
      suppressed: ["sup1"],
    };
    writeState("spec", state, dir);

    const ledgerText = readFileSync(statePath("spec", dir), "utf8");
    assert.deepEqual(privateValuesIn(JSON.parse(ledgerText)), [], "the ledger still holds a value under a private key");
    // Not only under its own key: nowhere in anything the state directory holds.
    for (const file of walk(dir)) {
      const text = readFileSync(file, "utf8");
      for (const value of [first, second, state.adminUid]) {
        assert.ok(!text.includes(value), `${relative(root, file)} carries a private value`);
      }
    }

    const held = privatePath("spec", dir);
    assert.ok(existsSync(held), "the private half was not written");
    assert.ok(relative(dir, held).startsWith(".."), "the private half must sit outside the state directory");
    if (process.platform !== "win32") {
      assert.equal(statSync(held).mode & 0o777, 0o600, "the private half must be readable by its owner only");
    }

    assert.deepEqual(readState("spec", dir), state, "readState must give back exactly what writeState was given");

    clearState("spec", dir);
    assert.ok(!existsSync(statePath("spec", dir)), "clearState left the ledger behind");
    assert.ok(!existsSync(held), "clearState left the private half behind");
  });
});

test("a state with nothing private writes no private half, and removes a stale one", () => {
  scratch((dir) => {
    writeState("spec", { member: { uid: "u1", password: fixturePassword() } }, dir);
    assert.ok(existsSync(privatePath("spec", dir)));
    writeState("spec", { member: { uid: "u1" }, adminUid: null }, dir);
    assert.ok(!existsSync(privatePath("spec", dir)), "a private half outlived the state it belonged to");
    assert.deepEqual(readState("spec", dir), { member: { uid: "u1" }, adminUid: null });
  });
});

test("a ledger with no private half still reads, which is a ledger carried to another machine", () => {
  scratch((dir) => {
    writeState("spec", { runId: "abc123", member: { uid: "u1", password: fixturePassword() } }, dir);
    rmSync(privateDir(dir), { recursive: true, force: true });
    assert.deepEqual(readState("spec", dir), { runId: "abc123", member: { uid: "u1" } });
    assert.equal(readState("no-such-spec", dir), null);
  });
});

test("the private directory is beside the state directory and is neither upload path", () => {
  const held = privateDir(STATE_DIR);
  assert.ok(relative(STATE_DIR, held).startsWith(".."), "the private directory must not be inside the state directory");
  assert.ok(relative(ARTIFACTS_DIR, held).startsWith(".."), "the private directory must not be inside the artifacts directory");
  const ignored = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8").split("\n");
  assert.ok(ignored.includes(`/${rel(held)}/`), `.gitignore must ignore /${rel(held)}/`);
});

// ---------------------------------------------------------------------------
// 2. A password is made, not built
// ---------------------------------------------------------------------------

test("fixturePassword is random and long", () => {
  const made = new Set(Array.from({ length: 64 }, () => fixturePassword()));
  assert.equal(made.size, 64, "fixturePassword returned the same value twice");
  for (const password of made) assert.ok(password.length >= 24, "a fixture password must be at least 24 characters");
});

test("createFixtureUser chooses the password itself", () => {
  const core = code(join(REPO_ROOT, "scripts", "e2e-fixtures", "core.mjs"));
  const signature = /export async function createFixtureUser\(\{([^}]*)\}\)/.exec(core);
  assert.ok(signature, "could not read createFixtureUser's parameters");
  assert.ok(
    !/\bpassword\b/.test(signature[1]),
    "createFixtureUser must not take a password: it makes one with fixturePassword(), so no caller can build one",
  );
});

/**
 * What may stand to the right of `password:` or `password =` in a fixture
 * module: the random one, or one already made and being carried along.
 */
const ALLOWED_IN_FIXTURES = [/^fixturePassword\(\)/, /^account\.password\b/];

test("no fixture module gives a password a value of its own", () => {
  assert.ok(FIXTURE_MODULES.length >= 8, "the walk found too few fixture modules to be looking at the tree");
  const offenders = [];
  for (const file of FIXTURE_MODULES) {
    const text = code(file);
    for (const m of text.matchAll(/\bpassword\s*[:=]\s*(?!=)([^\n]{0,60})/g)) {
      const value = m[1].trim();
      if (ALLOWED_IN_FIXTURES.some((re) => re.test(value))) continue;
      offenders.push(`${rel(file)}: password is given \`${value}\``);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "A fixture account's password comes from createFixtureUser, or from fixturePassword() where the site's own form " +
      "sets it. Anything else risks a password that can be worked out from what a run prints.",
  );
});

test("nowhere in the harness is a password built from a template that holds anything but random bytes", () => {
  const offenders = [];
  for (const file of HARNESS) {
    const text = code(file);
    for (const m of text.matchAll(/\b(password|chosen|throwaway)\b\s*[:=]\s*`([^`]*)`/g)) {
      const parts = [...m[2].matchAll(/\$\{([^}]*)\}/g)].map((p) => p[1].trim());
      const built = parts.filter((part) => !/^randomBytes\(/.test(part));
      if (built.length > 0) offenders.push(`${rel(file)}: ${m[1]} interpolates ${built.join(", ")}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "A password in the harness may interpolate randomBytes(...) and nothing else: a run id is printed and the clock can be guessed.",
  );
});

// ---------------------------------------------------------------------------
// 3. A spec reads its state through readState
// ---------------------------------------------------------------------------

test("every browser spec reads its state through readState", () => {
  assert.ok(SPECS.length >= 8, "the walk found too few specs to be looking at the tree");
  const offenders = [];
  for (const file of SPECS) {
    const text = code(file);
    if (!/\breadState\(/.test(text)) offenders.push(`${rel(file)}: does not call readState`);
    if (/readFileSync\(\s*(STATE_PATH|statePath\()/.test(text)) offenders.push(`${rel(file)}: parses the ledger file itself`);
  }
  assert.deepEqual(offenders, [], "The ledger holds no password: a spec that parses it directly cannot sign its fixture in.");
});

// ---------------------------------------------------------------------------
// 4. Only the state and artifact directories are uploaded
// ---------------------------------------------------------------------------

/** Every path an `upload-artifact` step in a workflow uploads, with where it is. */
function uploadedPaths(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  const found = [];
  lines.forEach((line, i) => {
    if (!/^\s*(?:-\s*)?uses:\s*actions\/upload-artifact@/.test(line)) return;
    const indent = line.search(/\S/);
    let seen = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];
      if (next.trim() === "" || /^\s*#/.test(next)) continue;
      // The step ends at the next list item at its own depth, or at anything shallower.
      const depth = next.search(/\S/);
      if (depth < indent || (depth <= indent && /^\s*-\s/.test(next))) break;
      const single = /^\s*path:\s*(\S.*)$/.exec(next);
      if (!single) continue;
      seen = true;
      if (single[1].trim() === "|" || single[1].trim() === ">") {
        for (let k = j + 1; k < lines.length && lines[k].search(/\S/) > depth; k += 1) {
          found.push({ where: `${rel(file)}:${k + 1}`, path: lines[k].trim() });
        }
      } else {
        found.push({ where: `${rel(file)}:${j + 1}`, path: single[1].trim().replace(/^["']|["']$/g, "") });
      }
    }
    if (!seen) found.push({ where: `${rel(file)}:${i + 1}`, path: "(no path: could not read this step)" });
  });
  return found;
}

test("every upload step uploads the state directory or the artifact directory and nothing else", () => {
  const allowed = new Set([rel(STATE_DIR), rel(ARTIFACTS_DIR)]);
  const uploads = WORKFLOWS.flatMap(uploadedPaths);
  assert.ok(uploads.length >= 2, "the walk found no upload steps, so it is not reading the workflows");
  const offenders = uploads.filter((u) => !allowed.has(u.path.replace(/\/$/, ""))).map((u) => `${u.where} uploads ${u.path}`);
  assert.deepEqual(
    offenders,
    [],
    `An uploaded file is read by whoever can read the repository. Only ${[...allowed].join(" and ")} may be uploaded; ` +
      "a new path needs the same care about what it holds, and an entry here.",
  );
  const privateName = rel(privateDir(STATE_DIR));
  for (const file of WORKFLOWS) {
    const steps = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    assert.ok(!steps.includes(privateName), `${rel(file)} names ${privateName}, which no workflow step may touch`);
  }
});
