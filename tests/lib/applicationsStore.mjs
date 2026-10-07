/**
 * A Firestore small enough to read, for the suites that execute the
 * application system's routes.
 *
 * ## Where it came from
 *
 * This is the store the form editor's route suite was written with
 * (`tests/applications-editor-routes.test.mjs`), moved here so that a second
 * suite can use the same one instead of writing another. That suite still
 * uses it, unchanged in behaviour: documents by path, subcollections, a
 * filter or two, `getAll`, a batch, and a transaction that runs again when
 * something it read changed before it committed.
 *
 * `tests/applications-journey.test.mjs` runs every part of the application
 * system against ONE store, so it needs the calls the other parts make as
 * well. Each was added for the code named beside it, and none changes what
 * the editor's suite sees:
 *
 *  - `set`, whole, with `merge` and with `mergeFields` (review decisions and
 *    pooled outcomes are written that way);
 *  - a transaction's `set` and `getAll` (the status move, the send);
 *  - a batch's `set` and `delete`, and a query's `select()` (the member
 *    records written when a term settles);
 *  - a document reference that can write outside a transaction, and an
 *    automatic id for `doc()` with no argument (audit rows);
 *  - `arrayUnion` beside the other sentinels, and the sentinels on the
 *    handle's own class as well, where the member-record writer looks;
 *  - a clock the suite can move, for `serverTimestamp()`.
 *
 * ## The sentinels
 *
 * The suite's stub of `firebase-admin/firestore` has to mint the values this
 * store resolves. `FIELD_VALUE_STUB` below is that stub's source, so the two
 * cannot drift apart.
 *
 * ## What it does not do
 *
 * No ordering, no range filters, no limits: the application system reads by
 * one or two equalities and sorts in memory, and a query here that asked for
 * more would be a query that needs an index.
 */

/** The source of a `firebase-admin/firestore` stub whose sentinels this store resolves. */
export const FIELD_VALUE_STUB =
  "export const FieldValue = {" +
  " serverTimestamp: () => ({ __sentinel: 'now' })," +
  " delete: () => ({ __sentinel: 'delete' })," +
  " increment: (n) => ({ __sentinel: 'increment', n })," +
  " arrayUnion: (...values) => ({ __sentinel: 'arrayUnion', values })," +
  " arrayRemove: (...values) => ({ __sentinel: 'arrayRemove', values })," +
  " };" +
  " export class Timestamp {}";

/**
 * The Admin SDK hangs its sentinels off the class of the database handle as
 * well as exporting them, and the member-record writer reads
 * `db.constructor.FieldValue` so that it needs no import of its own. The
 * store is an instance of this class for that one reader.
 */
class Store {
  static FieldValue = {
    serverTimestamp: () => ({ __sentinel: "now" }),
    delete: () => ({ __sentinel: "delete" }),
    increment: (n) => ({ __sentinel: "increment", n }),
    arrayUnion: (...values) => ({ __sentinel: "arrayUnion", values }),
    arrayRemove: (...values) => ({ __sentinel: "arrayRemove", values }),
  };
}

const isSentinel = (value, kind) =>
  value !== null && typeof value === "object" && value.__sentinel === kind;
const isMap = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);

/**
 * `seed` is documents by path. `options.now` is the instant a
 * `serverTimestamp()` resolves to: a Date, or a function returning one for a
 * suite that moves its clock.
 */
export function makeDb(seed = {}, options = {}) {
  const clock =
    typeof options.now === "function"
      ? options.now
      : () => new Date(options.now ?? "2026-10-05T12:00:00Z");
  const docs = new Map();
  const versions = new Map();
  const stats = { reads: 0, writes: [] };
  let autoId = 0;
  const put = (path, data) => {
    docs.set(path, data);
    versions.set(path, (versions.get(path) ?? 0) + 1);
  };
  const drop = (path) => {
    docs.delete(path);
    versions.set(path, (versions.get(path) ?? 0) + 1);
  };
  for (const [path, data] of Object.entries(seed)) put(path, structuredClone(data));

  const last = (path) => path.split("/").pop();
  const snap = (path) => ({
    id: last(path),
    exists: docs.has(path),
    ref: docRef(path),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
  });
  const read = (path) => {
    stats.reads += 1;
    return snap(path);
  };
  const childrenOf = (collectionPath) =>
    [...docs.keys()].filter(
      (path) => path.startsWith(`${collectionPath}/`) && !path.slice(collectionPath.length + 1).includes("/"),
    );
  const fieldAt = (data, field) => field.split(".").reduce((node, part) => (node == null ? undefined : node[part]), data);
  const matches = (data, [field, op, value]) => {
    const found = fieldAt(data, field);
    if (op === "==") return found === value;
    if (op === "in") return value.includes(found);
    if (op === "array-contains") return Array.isArray(found) && found.includes(value);
    throw new Error(`the test database does not know the operator ${op}`);
  };
  const query = (collectionPath, filters) => ({
    path: collectionPath,
    isQuery: true,
    where: (field, op, value) => query(collectionPath, [...filters, [field, op, value]]),
    // A projection changes what is sent, not which documents match.
    select: () => query(collectionPath, filters),
    get: async () => {
      stats.reads += 1;
      return {
        docs: childrenOf(collectionPath)
          .filter((path) => filters.every((filter) => matches(docs.get(path), filter)))
          .map(snap),
      };
    },
  });
  function docRef(path) {
    return {
      id: last(path),
      path,
      get: async () => read(path),
      collection: (name) => collection(`${path}/${name}`),
      set: async (data, setOptions) => apply([["set", path, data, setOptions]]),
      update: async (data) => apply([["update", path, data]]),
      create: async (data) => apply([["create", path, data]]),
      delete: async () => apply([["delete", path]]),
    };
  }
  function collection(path) {
    return {
      ...query(path, []),
      doc: (id) => docRef(`${path}/${id ?? `auto-${(autoId += 1)}`}`),
      add: async (data) => {
        const ref = docRef(`${path}/auto-${(autoId += 1)}`);
        apply([["create", ref.path, data]]);
        return ref;
      },
    };
  }

  const resolve = (value, current) => {
    if (isSentinel(value, "now")) return clock();
    if (isSentinel(value, "increment")) return (typeof current === "number" ? current : 0) + value.n;
    if (isSentinel(value, "arrayUnion")) {
      const next = Array.isArray(current) ? [...current] : [];
      for (const entry of value.values) if (!next.includes(entry)) next.push(entry);
      return next;
    }
    if (isSentinel(value, "arrayRemove")) {
      return (Array.isArray(current) ? current : []).filter((entry) => !value.values.includes(entry));
    }
    if (isMap(value)) {
      const out = {};
      for (const [key, inner] of Object.entries(value)) out[key] = resolve(inner, undefined);
      return out;
    }
    return value;
  };
  const applyUpdate = (path, patch) => {
    if (!docs.has(path)) throw Object.assign(new Error(`NOT_FOUND: ${path}`), { code: 5 });
    const next = structuredClone(docs.get(path));
    for (const [field, value] of Object.entries(patch)) {
      const parts = field.split(".");
      let node = next;
      for (const part of parts.slice(0, -1)) {
        if (!Object.hasOwn(node, part) || typeof node[part] !== "object" || node[part] === null) node[part] = {};
        node = node[part];
      }
      const key = parts[parts.length - 1];
      if (isSentinel(value, "delete")) delete node[key];
      else node[key] = resolve(value, node[key]);
    }
    put(path, next);
  };
  const applyCreate = (path, data) => {
    if (docs.has(path)) throw Object.assign(new Error(`ALREADY_EXISTS: ${path}`), { code: 6 });
    put(path, resolve(data, undefined));
  };
  /** A merge keeps what the patch does not name, map by map. */
  const mergeInto = (target, patch) => {
    for (const [key, value] of Object.entries(patch)) {
      if (isSentinel(value, "delete")) delete target[key];
      else if (isMap(value) && typeof value.__sentinel !== "string") {
        if (!isMap(target[key])) target[key] = {};
        mergeInto(target[key], value);
      } else target[key] = resolve(value, target[key]);
    }
  };
  const applySet = (path, data, setOptions) => {
    if (setOptions?.mergeFields) {
      // Only the fields named are written, and each is replaced whole.
      const next = structuredClone(docs.get(path) ?? {});
      for (const field of setOptions.mergeFields) {
        const value = fieldAt(data, field);
        const parts = field.split(".");
        let node = next;
        for (const part of parts.slice(0, -1)) {
          if (!isMap(node[part])) node[part] = {};
          node = node[part];
        }
        const key = parts[parts.length - 1];
        if (value === undefined || isSentinel(value, "delete")) delete node[key];
        else node[key] = resolve(value, node[key]);
      }
      put(path, next);
      return;
    }
    if (setOptions?.merge && docs.has(path)) {
      const next = structuredClone(docs.get(path));
      mergeInto(next, data);
      put(path, next);
      return;
    }
    put(path, resolve(data, undefined));
  };
  function apply(writes) {
    for (const [kind, path, data, setOptions] of writes) {
      stats.writes.push([kind, path, data ? Object.keys(data) : []]);
      if (kind === "update") applyUpdate(path, data);
      else if (kind === "create") applyCreate(path, data);
      else if (kind === "set") applySet(path, data, setOptions);
      else if (kind === "delete") drop(path);
    }
  }

  const db = Object.assign(new Store(), {
    stats,
    /** Runs once, after a transaction's function returns and before it commits. */
    beforeCommit: null,
    collection,
    getAll: async (...refs) => refs.map((ref) => read(ref.path)),
    batch() {
      const writes = [];
      return {
        create: (ref, data) => writes.push(["create", ref.path, data]),
        update: (ref, data) => writes.push(["update", ref.path, data]),
        set: (ref, data, setOptions) => writes.push(["set", ref.path, data, setOptions]),
        delete: (ref) => writes.push(["delete", ref.path]),
        commit: async () => apply(writes),
      };
    },
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const seen = new Map();
        const writes = [];
        const note = (path) => {
          if (!seen.has(path)) seen.set(path, versions.get(path) ?? 0);
        };
        const tx = {
          get: async (target) => {
            const result = await target.get();
            if (target.isQuery) {
              seen.set(`list:${target.path}`, childrenOf(target.path).join("|"));
              for (const doc of result.docs) note(doc.ref.path);
            } else {
              note(target.path);
            }
            return result;
          },
          getAll: async (...refs) =>
            refs.map((ref) => {
              note(ref.path);
              return read(ref.path);
            }),
          update: (ref, data) => writes.push(["update", ref.path, data]),
          create: (ref, data) => writes.push(["create", ref.path, data]),
          set: (ref, data, setOptions) => writes.push(["set", ref.path, data, setOptions]),
          delete: (ref) => writes.push(["delete", ref.path]),
        };
        const result = await fn(tx);
        if (db.beforeCommit) {
          const hook = db.beforeCommit;
          db.beforeCommit = null;
          hook();
        }
        const moved = [...seen].some(([key, was]) =>
          key.startsWith("list:") ? childrenOf(key.slice(5)).join("|") !== was : (versions.get(key) ?? 0) !== was,
        );
        if (moved) continue;
        apply(writes);
        return result;
      }
      throw new Error("the transaction never settled");
    },
    read: (path) => docs.get(path),
    paths: () => [...docs.keys()],
    /** A change made by somebody else, outside any request under test. */
    poke: (path, patch) => applyUpdate(path, patch),
    /** A document put there by the suite, whole. */
    seed: (path, data) => put(path, structuredClone(data)),
  });
  return db;
}
