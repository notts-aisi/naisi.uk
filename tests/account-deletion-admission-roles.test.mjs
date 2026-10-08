/**
 * `clearAdmissionRoundRoles` from the account-deletion cascade, EXECUTED.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * ## Why this step gets a real test
 *
 * An admission round outlives the accounts named on it. Until this ran, a
 * deleted reviewer left a uid on the round that nothing could resolve, and the
 * roles section wedged around it: the picker could not draw a name for
 * somebody who is no longer in the member list, the roles route refused a save
 * naming an account that does not exist, and the save that would have taken
 * them off also has to clear `users.admissionsReviewer` on everyone it
 * removes, which is an update to a missing document and therefore a batch that
 * rejects. Three symptoms of one dangling reference.
 *
 * The route was fixed on both halves. This is the half that stops the state
 * arising, so it is worth more than a source pin: the assertions below are the
 * shape of the write (arrayRemove, not a rewritten list; the decider nulled
 * only where it matched; one update for a round that is both).
 *
 * ## An application form names people a second way
 *
 * Each programme on an application form has a lead and its own reviewers,
 * inside the round's `programmes` map, and the round's `reviewerUids` is kept
 * as their union. A sweep that cleared the union and left the programmes would
 * leave a deleted account as a programme's lead with nothing a query can see
 * saying so, and the next save of that programme would put it back into the
 * union. The second half of this file is that sweep, executed: the lead
 * nulled, the reviewer removed, the union cleared in the same update, the rest
 * of each programme untouched, and a round found even when its union had
 * already lost them.
 *
 * Faked: `firebase-admin/firestore` (sentinels this store can interpret) and
 * `server-only`. The function under test is the real one. Nothing here can
 * reach a Firestore project.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g;

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "firebase-admin/firestore",
    "export const FieldValue = {\n" +
      "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
      "  arrayUnion: (...values) => ({ __op: 'arrayUnion', values }),\n" +
      "  arrayRemove: (...values) => ({ __op: 'arrayRemove', values }),\n" +
      "  increment: (by) => ({ __op: 'increment', by }),\n" +
      "};\n" +
      // A CLASS: the sweep addresses a field inside one programme with
      // `new FieldPath("programmes", id, "leadUid")`.
      "export class FieldPath {\n" +
      "  constructor(...segments) { this.segments = segments; }\n" +
      "  static documentId() { return '__name__'; }\n" +
      "}\n" +
      "export const Timestamp = { fromDate: (d) => d, now: () => new Date() };",
  ],
]);

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
      // The scan is a regex over source text, so a plain string literal can
      // look like an import: `"su-import"`, in the membership module this
      // cascade now reaches, carries the word `import` inside it and the match
      // that follows is not a module specifier at all. Anything that will not
      // resolve is left exactly as it was written.
      try {
        rewrites.set(specifier, import.meta.resolve(specifier));
      } catch {
        // Not a module. Leave the source alone.
      }
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

// ---------------------------------------------------------------------------
// A Firestore small enough to read: one collection, the two single-field
// queries and the one projected read this function makes, and batched updates
// that apply together.
//
// `update` takes BOTH shapes the Admin SDK does: one object of top-level
// fields, or alternating field paths and values. A path is applied segment by
// segment and never split on a dot, which is the property the second shape is
// used for.
// ---------------------------------------------------------------------------

function makeDb(rounds) {
  const docs = new Map(
    Object.entries(rounds).map(([id, data]) => [id, structuredClone(data)]),
  );
  let batches = 0;
  /** Every update as it was queued: `[roundId, [[segments, value], ...]]`. */
  const updates = [];

  /** One field's new value, from what is there now and what was written. */
  function resolve(current, value) {
    if (value && typeof value === "object" && "__op" in value) {
      if (value.__op === "serverTimestamp") return new Date("2026-09-02T12:00:00Z");
      if (value.__op === "arrayRemove") {
        const list = Array.isArray(current) ? current : [];
        return list.filter((v) => !value.values.includes(v));
      }
      if (value.__op === "arrayUnion") {
        const list = Array.isArray(current) ? current.slice() : [];
        for (const v of value.values) if (!list.includes(v)) list.push(v);
        return list;
      }
    }
    return value;
  }

  /** `update(ref, {a: 1})` and `update(ref, pathA, 1, pathB, 2)` as one list. */
  function asPairs(args) {
    if (args.length === 1) {
      return Object.entries(args[0]).map(([key, value]) => [[key], value]);
    }
    const pairs = [];
    for (let i = 0; i < args.length; i += 2) {
      const field = args[i];
      pairs.push([typeof field === "string" ? [field] : field.segments, args[i + 1]]);
    }
    return pairs;
  }

  function apply(target, pairs) {
    const next = structuredClone(target);
    for (const [segments, value] of pairs) {
      let node = next;
      for (const segment of segments.slice(0, -1)) {
        if (!node[segment] || typeof node[segment] !== "object") node[segment] = {};
        node = node[segment];
      }
      const leaf = segments.at(-1);
      node[leaf] = resolve(node[leaf], value);
    }
    return next;
  }

  function snapshot(entries) {
    return {
      empty: entries.length === 0,
      size: entries.length,
      docs: entries.map(([id, data]) => ({
        id,
        exists: true,
        data: () => ({ ...data }),
      })),
    };
  }

  function collection(name) {
    if (name !== "admissionRounds") throw new Error(`unexpected collection ${name}`);
    return {
      doc: (id) => ({ id, path: id }),
      where(field, op, value) {
        return {
          async get() {
            return snapshot(
              [...docs.entries()].filter(([, data]) => {
                if (op === "array-contains") {
                  return Array.isArray(data[field]) && data[field].includes(value);
                }
                return data[field] === value;
              }),
            );
          },
        };
      },
      // Every round, cut down to the fields asked for, as a projection is.
      select(...fields) {
        return {
          async get() {
            return snapshot(
              [...docs.entries()].map(([id, data]) => [
                id,
                Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]])),
              ]),
            );
          },
        };
      },
    };
  }

  return {
    collection,
    batch() {
      const writes = [];
      return {
        update(ref, ...args) {
          writes.push([ref.path, asPairs(args)]);
        },
        async commit() {
          batches += 1;
          for (const [id, pairs] of writes) {
            if (!docs.has(id)) throw new Error(`NOT_FOUND: ${id}`);
            docs.set(id, apply(docs.get(id), pairs));
            updates.push([id, pairs]);
          }
        },
      };
    },
    raw: docs,
    updates,
    get batches() {
      return batches;
    },
  };
}

const { clearAdmissionRoundRoles } = await loadTs("lib/firestore/accountDeletion.ts");

test("a deleted account comes off every round that named it", async () => {
  const db = makeDb({
    r1: { reviewerUids: ["gone", "keep"], finalDeciderUid: "keep" },
    r2: { reviewerUids: ["keep"], finalDeciderUid: "gone" },
    r3: { reviewerUids: [], finalDeciderUid: null },
  });

  const cleared = await clearAdmissionRoundRoles(db, "gone");

  assert.equal(cleared, 2, "the round that never named them is left alone");
  assert.deepEqual(db.raw.get("r1").reviewerUids, ["keep"]);
  assert.equal(db.raw.get("r1").finalDeciderUid, "keep", "the other decider stands");
  assert.deepEqual(db.raw.get("r2").reviewerUids, ["keep"]);
  assert.equal(db.raw.get("r2").finalDeciderUid, null);
  assert.deepEqual(db.raw.get("r3"), { reviewerUids: [], finalDeciderUid: null });
});

test("a round that named them twice takes ONE update carrying both fields", async () => {
  const db = makeDb({
    r1: { reviewerUids: ["gone", "keep"], finalDeciderUid: "gone" },
  });

  assert.equal(await clearAdmissionRoundRoles(db, "gone"), 1);
  assert.deepEqual(db.raw.get("r1").reviewerUids, ["keep"]);
  assert.equal(db.raw.get("r1").finalDeciderUid, null);
  assert.equal(db.batches, 1, "one batch, so a partial clear is not a state this can reach");
});

test("nothing to clear writes nothing at all", async () => {
  const db = makeDb({ r1: { reviewerUids: ["keep"], finalDeciderUid: "keep" } });
  assert.equal(await clearAdmissionRoundRoles(db, "gone"), 0);
  assert.equal(db.batches, 0);
});

test("the reviewer list is edited by arrayRemove, never rewritten wholesale", () => {
  const src = readFileSync(
    join(REPO_ROOT, "src", "lib", "firestore", "accountDeletion.ts"),
    "utf8",
  );
  assert.match(
    src,
    /reviewerUids: FieldValue\.arrayRemove\(uid\)/,
    "a rewritten list would drop whatever an admin saved between the read and " +
      "the write; this touches only the entry it is removing.",
  );
  assert.match(
    src,
    /summary\.admissionRoundRolesCleared = await clearAdmissionRoundRoles\(db, uid\)/,
    "the cascade has to actually call it, or the wedge comes back.",
  );
});

// ---------------------------------------------------------------------------
// The programmes of an application form
// ---------------------------------------------------------------------------

/**
 * One application form with two programmes. `gone` leads one and reviews the
 * other; `keep` is named on both. The union is what the roles writer keeps.
 */
function formRound(overrides = {}) {
  return {
    formVersion: 2,
    programmeIds: ["agi-strategy", "tech"],
    programmes: {
      "agi-strategy": {
        kind: "fellowship",
        name: "AGI Strategy Fellowship",
        places: 8,
        leadUid: "gone",
        reviewerUids: ["keep"],
        emailWording: { accepted: { subject: "You are in", body: "Welcome." } },
      },
      tech: {
        kind: "fellowship",
        name: "Technical AI Safety Fellowship",
        leadUid: "keep",
        reviewerUids: ["gone", "keep"],
      },
    },
    reviewerUids: ["gone", "keep"],
    finalDeciderUid: null,
    ...overrides,
  };
}

test("a deleted lead and reviewer comes off every programme, and off the union", async () => {
  const db = makeDb({
    form: formRound(),
    other: { reviewerUids: ["keep"], finalDeciderUid: "keep" },
  });

  const cleared = await clearAdmissionRoundRoles(db, "gone");

  assert.equal(cleared, 1, "one round named them, however many ways");
  const form = db.raw.get("form");
  assert.equal(form.programmes["agi-strategy"].leadUid, null, "the lead is cleared");
  assert.deepEqual(form.programmes.tech.reviewerUids, ["keep"], "the reviewer is removed");
  assert.deepEqual(form.reviewerUids, ["keep"], "and the union no longer names them either");

  // Everybody else, and everything else about each programme, is as it was.
  assert.deepEqual(form.programmes["agi-strategy"].reviewerUids, ["keep"]);
  assert.equal(form.programmes.tech.leadUid, "keep");
  assert.equal(form.programmes["agi-strategy"].name, "AGI Strategy Fellowship");
  assert.equal(form.programmes["agi-strategy"].places, 8);
  assert.deepEqual(form.programmes["agi-strategy"].emailWording, {
    accepted: { subject: "You are in", body: "Welcome." },
  });
  assert.deepEqual(form.programmeIds, ["agi-strategy", "tech"]);
  assert.deepEqual(db.raw.get("other"), { reviewerUids: ["keep"], finalDeciderUid: "keep" });
  assert.equal(db.batches, 1);
});

test("a programme that names them is found even when the union has lost them", async () => {
  // The union is a convenience the roles writer keeps, and nothing says a
  // stored one cannot have drifted. A search of the union alone would walk
  // past this round and leave a deleted account leading a programme.
  const db = makeDb({
    drifted: formRound({ reviewerUids: ["keep"] }),
  });

  assert.equal(await clearAdmissionRoundRoles(db, "gone"), 1);
  const form = db.raw.get("drifted");
  assert.equal(form.programmes["agi-strategy"].leadUid, null);
  assert.deepEqual(form.programmes.tech.reviewerUids, ["keep"]);
  assert.deepEqual(form.reviewerUids, ["keep"]);
});

test("a round that names them three ways still takes ONE update", async () => {
  const db = makeDb({
    form: formRound({ finalDeciderUid: "gone" }),
  });

  assert.equal(await clearAdmissionRoundRoles(db, "gone"), 1);
  assert.equal(db.batches, 1, "one batch, so a partial clear is not a state this can reach");
  assert.equal(db.updates.length, 1, "and one update for the round, carrying every field");

  const form = db.raw.get("form");
  assert.equal(form.finalDeciderUid, null);
  assert.equal(form.programmes["agi-strategy"].leadUid, null);
  assert.deepEqual(form.programmes.tech.reviewerUids, ["keep"]);
  assert.deepEqual(form.reviewerUids, ["keep"]);

  // The union appears once in that update, not once per way they were found.
  const fields = db.updates[0][1].map(([segments]) => segments.join("/"));
  assert.deepEqual(fields.sort(), [
    "finalDeciderUid",
    "programmes/agi-strategy/leadUid",
    "programmes/tech/reviewerUids",
    "reviewerUids",
    "updatedAt",
  ]);
});

test("a programme's fields are addressed by path, so its id is never read as one", async () => {
  // A programme id is a key in a map. Written into a dotted string it would be
  // read as part of the path, and an id carrying a dot would address a field
  // that is not there while the name it was meant to clear stayed put.
  const db = makeDb({
    form: {
      reviewerUids: ["gone"],
      programmes: { "odd.key": { leadUid: "gone", reviewerUids: ["gone"] } },
    },
  });

  assert.equal(await clearAdmissionRoundRoles(db, "gone"), 1);
  const form = db.raw.get("form");
  assert.deepEqual(form.programmes["odd.key"], { leadUid: null, reviewerUids: [] });
  assert.deepEqual(
    Object.keys(form.programmes),
    ["odd.key"],
    "no second entry was created under a path the id was split into",
  );
});

test("a form that names only other people is left exactly as it was", async () => {
  const before = formRound({
    programmes: {
      tech: { kind: "fellowship", name: "Technical", leadUid: "keep", reviewerUids: ["keep"] },
    },
    reviewerUids: ["keep"],
  });
  const db = makeDb({ form: before });

  assert.equal(await clearAdmissionRoundRoles(db, "gone"), 0);
  assert.equal(db.batches, 0, "nothing to clear writes nothing at all");
  assert.deepEqual(db.raw.get("form"), before);
});

test("a programmes map that is not one cannot take the sweep down", async () => {
  // Hand-edited rounds exist. Whatever is stored there, the two top-level
  // clears on the same round still have to land.
  const db = makeDb({
    a: { reviewerUids: ["gone"], programmes: "not a map" },
    b: { reviewerUids: ["gone"], programmes: { tech: null, agi: ["gone"] } },
    c: { reviewerUids: [], programmes: { tech: { leadUid: 7, reviewerUids: "gone" } } },
  });

  assert.equal(await clearAdmissionRoundRoles(db, "gone"), 2);
  assert.deepEqual(db.raw.get("a").reviewerUids, []);
  assert.deepEqual(db.raw.get("b").reviewerUids, []);
  assert.deepEqual(db.raw.get("c").programmes, { tech: { leadUid: 7, reviewerUids: "gone" } });
});

test("the programme fields are edited in place, never by rewriting the map", () => {
  const src = readFileSync(
    join(REPO_ROOT, "src", "lib", "firestore", "accountDeletion.ts"),
    "utf8",
  );
  assert.match(
    src,
    /new FieldPath\("programmes", programmeId, "leadUid"\), null/,
    "the lead is cleared at its own path. A rewritten `programmes` map would drop " +
      "whatever a lead saved to their programme between the read and the write.",
  );
  assert.match(
    src,
    /new FieldPath\("programmes", programmeId, "reviewerUids"\),\s*FieldValue\.arrayRemove\(uid\)/,
    "and a programme's reviewer list is edited by arrayRemove, for the same reason " +
      "the round's own list is.",
  );
});
