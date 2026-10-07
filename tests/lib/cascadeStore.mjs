/**
 * A Firestore small enough to read, for running the two deletion cascades.
 *
 * The round destroy (`src/lib/admissions/destroy.ts`) and the account cascade
 * (`src/lib/firestore/accountDeletion.ts`) ask more of a database than the
 * application system's own routes do: pages with a limit, counts, batches,
 * a collection group. `tests/lib/applicationsStore.mjs` deliberately has none
 * of those. This store has them, and it is also enough for the application
 * system's own writers, so one suite can write a document with the real
 * writer and then delete it with the real cascade.
 *
 * Documents are kept by path (`collection/doc/collection/doc`), so a
 * subcollection is a longer path and a query on a collection matches its
 * direct children only.
 *
 * EVERY COMMITTED BATCH IS RECORDED AS ONE LIST OF DELETED PATHS, in
 * `db.batches`. "In the same batch" is a claim about atomicity, and a store
 * that only showed the end state could not tell one commit from two.
 */

/** The instant every `serverTimestamp()` resolves to. */
export const CASCADE_STAMP = new Date("2026-10-26T10:00:00Z");

/** A `firebase-admin/firestore` stub whose sentinels this store resolves. */
export const CASCADE_FIRESTORE_STUB =
  "export const FieldValue = {\n" +
  "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
  "  increment: (by) => ({ __op: 'increment', by }),\n" +
  "  arrayUnion: (...values) => ({ __op: 'arrayUnion', values }),\n" +
  "  arrayRemove: (...values) => ({ __op: 'arrayRemove', values }),\n" +
  "  delete: () => ({ __op: 'delete' }),\n" +
  "};\n" +
  "export class FieldPath {\n" +
  "  constructor(...segments) { this.segments = segments; }\n" +
  "  static documentId() { return '__name__'; }\n" +
  "}\n" +
  "export class Timestamp {\n" +
  "  constructor(ms) { this.ms = ms; }\n" +
  "  static fromMillis(ms) { return new Timestamp(ms); }\n" +
  "  static fromDate(d) { return new Timestamp(d.getTime()); }\n" +
  "  static now() { return new Timestamp(Date.now()); }\n" +
  "  toMillis() { return this.ms; }\n" +
  "  toDate() { return new Date(this.ms); }\n" +
  "}";

const isOp = (value) =>
  value !== null &&
  typeof value === "object" &&
  !(value instanceof Date) &&
  typeof value.toMillis !== "function" &&
  typeof value.__op === "string";

/**
 * A deep copy that keeps a Date a Date and leaves a Timestamp whole: a
 * Timestamp is an instance with methods the cascades call, and a structured
 * clone would hand back a plain object without them.
 */
function copy(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") {
    if (typeof value.toMillis === "function") return value;
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = copy(inner);
    return out;
  }
  return value;
}

/** `seed` is documents by path. */
export function makeCascadeDb(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([path, data]) => [path, copy(data)]));
  /** One list of deleted paths per committed batch. */
  const batches = [];
  let autoId = 0;

  function resolve(value) {
    if (Array.isArray(value)) return value.map(resolve);
    if (value instanceof Date) return value;
    if (value && typeof value === "object" && typeof value.toMillis === "function") return value;
    if (isOp(value)) {
      if (value.__op === "serverTimestamp") return CASCADE_STAMP;
      if (value.__op === "increment") return value.by;
      if (value.__op === "arrayUnion") return [...value.values];
      return undefined;
    }
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, inner] of Object.entries(value)) {
        const settled = resolve(inner);
        if (settled !== undefined) out[key] = settled;
      }
      return out;
    }
    return value;
  }

  function readPath(target, path) {
    let node = target;
    for (const part of path.split(".")) {
      if (node === undefined || node === null) return undefined;
      node = node[part];
    }
    return node;
  }

  /** `a.b` is a path into a nested map, not a key with a dot. */
  function setPath(target, path, value) {
    const parts = path.split(".");
    let node = target;
    for (const part of parts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== "object") node[part] = {};
      node = node[part];
    }
    const key = parts.at(-1);
    if (isOp(value)) {
      const current = node[key];
      if (value.__op === "delete") delete node[key];
      else if (value.__op === "replace") node[key] = resolve(value.value);
      else if (value.__op === "serverTimestamp") node[key] = CASCADE_STAMP;
      else if (value.__op === "increment") node[key] = (typeof current === "number" ? current : 0) + value.by;
      else if (value.__op === "arrayUnion") {
        const next = Array.isArray(current) ? [...current] : [];
        for (const entry of value.values) if (!next.includes(entry)) next.push(entry);
        node[key] = next;
      } else if (value.__op === "arrayRemove") {
        node[key] = Array.isArray(current) ? current.filter((entry) => !value.values.includes(entry)) : [];
      }
    } else if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && typeof value.toMillis !== "function") {
      // A merge goes into a map field by field, so its sentinels are applied
      // where they sit and what the patch does not name is kept.
      if (!node[key] || typeof node[key] !== "object" || Array.isArray(node[key])) node[key] = {};
      for (const [inner, innerValue] of Object.entries(value)) setPath(node[key], inner, innerValue);
    } else {
      node[key] = resolve(value);
    }
  }

  function write(path, data, { merge }) {
    const next = merge ? copy(docs.get(path) ?? {}) : {};
    if (merge) for (const [key, value] of Object.entries(data)) setPath(next, key, value);
    else Object.assign(next, resolve(data));
    docs.set(path, next);
  }

  function update(path, data) {
    if (!docs.has(path)) throw Object.assign(new Error(`NOT_FOUND: ${path}`), { code: 5 });
    const next = copy(docs.get(path));
    for (const [key, value] of Object.entries(data)) {
      // An update replaces a map whole, where a merge goes into it.
      if (isOp(value) || value === null || typeof value !== "object" || Array.isArray(value)) setPath(next, key, value);
      else setPath(next, key, { __op: "replace", value });
    }
    docs.set(path, next);
  }

  function create(path, data) {
    if (docs.has(path)) throw Object.assign(new Error(`ALREADY_EXISTS: ${path}`), { code: 6 });
    docs.set(path, resolve(data));
  }

  function snapshot(path, projection) {
    const data = docs.get(path);
    return {
      id: path.split("/").pop(),
      path,
      ref: docRef(path),
      exists: data !== undefined,
      data: () => {
        if (data === undefined) return undefined;
        if (!projection) return copy(data);
        const out = {};
        for (const field of projection) if (data[field] !== undefined) out[field] = copy(data[field]);
        return out;
      },
    };
  }

  function docRef(path) {
    return {
      id: path.split("/").pop(),
      path,
      collection: (name) => collectionRef(`${path}/${name}`),
      get: async () => snapshot(path),
      set: async (data, options) => write(path, data, { merge: options?.merge === true }),
      update: async (data) => update(path, data),
      create: async (data) => create(path, data),
      delete: async () => void docs.delete(path),
    };
  }

  function matches(data, { field, op, value }) {
    const actual = readPath(data ?? {}, field);
    if (op === "==") return actual === value;
    if (op === "in") return Array.isArray(value) && value.includes(actual);
    if (op === "array-contains") return Array.isArray(actual) && actual.includes(value);
    throw new Error(`the test database does not know the operator ${op}`);
  }

  function rows(path, filters) {
    const out = [];
    for (const [docPath, data] of docs) {
      if (!docPath.startsWith(`${path}/`)) continue;
      if (docPath.slice(path.length + 1).includes("/")) continue;
      if (filters.every((filter) => matches(data, filter))) out.push(docPath);
    }
    return out;
  }

  function query(path, filters, max, projection) {
    return {
      where: (field, op, value) => query(path, [...filters, { field, op, value }], max, projection),
      // Ordering changes nothing this store can observe.
      orderBy: () => query(path, filters, max, projection),
      startAfter: () => query(path, filters, max, projection),
      limit: (n) => query(path, filters, n, projection),
      select: (...fields) => query(path, filters, max, fields),
      count: () => ({ get: async () => ({ data: () => ({ count: rows(path, filters).length }) }) }),
      async get() {
        const all = rows(path, filters);
        const page = typeof max === "number" ? all.slice(0, max) : all;
        const snaps = page.map((docPath) => snapshot(docPath, projection));
        return { docs: snaps, empty: snaps.length === 0, size: snaps.length };
      },
    };
  }

  function collectionRef(path) {
    return {
      path,
      doc: (id) => docRef(`${path}/${id ?? `auto${(autoId += 1)}`}`),
      add: async (data) => {
        const ref = docRef(`${path}/auto${(autoId += 1)}`);
        create(ref.path, data);
        return ref;
      },
      ...query(path, [], undefined, undefined),
    };
  }

  function run(ops) {
    // Whole or not at all: an update to a missing document refuses the lot.
    for (const op of ops) {
      if (op.kind === "update" && !docs.has(op.ref.path)) {
        throw Object.assign(new Error(`NOT_FOUND: ${op.ref.path}`), { code: 5 });
      }
      if (op.kind === "create" && docs.has(op.ref.path)) {
        throw Object.assign(new Error(`ALREADY_EXISTS: ${op.ref.path}`), { code: 6 });
      }
    }
    for (const op of ops) {
      if (op.kind === "delete") docs.delete(op.ref.path);
      else if (op.kind === "update") update(op.ref.path, op.data);
      else if (op.kind === "create") create(op.ref.path, op.data);
      else write(op.ref.path, op.data, { merge: op.options?.merge === true });
    }
  }

  const collect = () => {
    const ops = [];
    return {
      ops,
      writer: {
        set: (ref, data, options) => void ops.push({ kind: "set", ref, data, options }),
        update: (ref, data) => void ops.push({ kind: "update", ref, data }),
        create: (ref, data) => void ops.push({ kind: "create", ref, data }),
        delete: (ref) => void ops.push({ kind: "delete", ref }),
      },
    };
  };

  const db = {
    collection: collectionRef,
    doc: (path) => docRef(path),
    // Nothing in a suite that uses this store keeps anything in a collection group.
    collectionGroup: (name) => query(`__group__/${name}`, [], undefined, undefined),
    getAll: async (...refs) => refs.map((ref) => snapshot(ref.path)),
    batch() {
      const { ops, writer } = collect();
      return {
        ...writer,
        async commit() {
          run(ops);
          batches.push(ops.filter((op) => op.kind === "delete").map((op) => op.ref.path));
        },
      };
    },
    async runTransaction(fn) {
      const { ops, writer } = collect();
      const result = await fn({
        get: async (target) => (typeof target.get === "function" ? target.get() : snapshot(target.path)),
        getAll: async (...refs) => refs.map((ref) => snapshot(ref.path)),
        ...writer,
      });
      run(ops);
      return result;
    },
    batches,
    has: (path) => docs.has(path),
    read: (path) => (docs.has(path) ? copy(docs.get(path)) : undefined),
    paths: (prefix = "") => [...docs.keys()].filter((path) => path.startsWith(prefix)),
    /** A change made by something outside the code under test. */
    poke: (path, patch) => update(path, patch),
    /** The same documents, in a store of their own. */
    clone: () => makeCascadeDb(Object.fromEntries([...docs].map(([path, data]) => [path, copy(data)]))),
  };

  // The member-record writer takes its server timestamp off the class the
  // handle came from, so the handle has to carry one.
  Object.defineProperty(db, "constructor", {
    value: { FieldValue: { serverTimestamp: () => ({ __op: "serverTimestamp" }) } },
  });
  return db;
}
