/**
 * A small in-memory Firestore for the AI at Nottingham survey's suites.
 *
 * `tests/ai-survey-flow.test.mjs` runs the survey's real email check, saving
 * and admin actions against it. It implements only what
 * `src/lib/aiSurvey/store.ts` uses, and it keeps the two things those suites
 * are about: EVERY DOCUMENT'S UPDATE TIME (a counter that moves once a
 * commit, so "these documents were written together" can be asked), and the
 * documents exactly as written, so "no time anywhere inside an answer" can be
 * asked of the bytes.
 *
 * The values it is handed are the Admin SDK's own (`FieldValue`, `FieldPath`,
 * `Timestamp`), because the code under test imports the real package.
 */
import { FieldPath, Timestamp } from "firebase-admin/firestore";

const segmentsOf = (field) => (field instanceof FieldPath ? field.segments : String(field).split("."));

function applyValue(target, key, value, now) {
  const kind = value?.constructor?.name;
  if (kind === "DeleteTransform") delete target[key];
  else if (kind === "ServerTimestampTransform") target[key] = Timestamp.fromMillis(now());
  else if (kind === "NumericIncrementTransform") target[key] = (typeof target[key] === "number" ? target[key] : 0) + value.operand;
  else if (kind === "ArrayUnionTransform") target[key] = [...(Array.isArray(target[key]) ? target[key] : []), ...value.elements];
  else target[key] = value;
}

function setPath(data, segments, value, now) {
  let at = data;
  for (const segment of segments.slice(0, -1)) {
    if (at[segment] === null || typeof at[segment] !== "object" || Array.isArray(at[segment])) at[segment] = {};
    at = at[segment];
  }
  applyValue(at, segments[segments.length - 1], value, now);
}

function getPath(data, segments) {
  let at = data;
  for (const segment of segments) {
    if (at === null || typeof at !== "object") return undefined;
    at = at[segment];
  }
  return at;
}

function mergeInto(target, source, now) {
  for (const [key, value] of Object.entries(source)) {
    const plainMap = value !== null && typeof value === "object" && !Array.isArray(value) && value.constructor === Object;
    if (plainMap) {
      if (target[key] === null || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
      mergeInto(target[key], value, now);
    } else {
      applyValue(target, key, value, now);
    }
  }
}

/** A deep copy that keeps the SDK's own values (a Timestamp is still a Timestamp). */
const clone = (value) =>
  value instanceof Timestamp
    ? value
    : Array.isArray(value)
      ? value.map(clone)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, clone(inner)]))
        : value;

export function createWorld() {
  /** path -> { data, updated } */
  const docs = new Map();
  let clock = 0;
  let wall = Date.UTC(2026, 10, 17, 12, 0, 0);
  const now = () => wall;

  /** Apply a list of operations as ONE commit: every document it touches gets the same update time. */
  function commit(operations) {
    for (const op of operations) {
      if ((op.kind === "update") && !docs.has(op.path)) {
        const error = new Error(`5 NOT_FOUND: no document to update: ${op.path}`);
        error.code = 5;
        throw error;
      }
    }
    clock += 1;
    for (const op of operations) {
      if (op.kind === "delete") {
        docs.delete(op.path);
        continue;
      }
      const existing = docs.get(op.path);
      let data = existing ? existing.data : {};
      if (op.kind === "set") {
        if (op.merge) mergeInto(data, op.data, now);
        else {
          data = {};
          mergeInto(data, op.data, now);
        }
      } else {
        for (const [field, value] of op.pairs) setPath(data, segmentsOf(field), value, now);
      }
      docs.set(op.path, { data, updated: clock });
    }
  }

  /** `update(ref, data)` or `update(ref, field, value, field, value, ...)`. */
  function pairsOf(args) {
    if (args.length === 1 && args[0] !== null && typeof args[0] === "object" && !(args[0] instanceof FieldPath)) {
      return Object.entries(args[0]).map(([field, value]) => [field, value]);
    }
    const pairs = [];
    for (let i = 0; i < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
    return pairs;
  }

  function snapOf(ref) {
    const found = docs.get(ref.path);
    return {
      exists: Boolean(found),
      id: ref.id,
      ref,
      updateTime: found ? found.updated : null,
      data: () => (found ? clone(found.data) : undefined),
      get: (field) => (found ? getPath(found.data, segmentsOf(field)) : undefined),
    };
  }

  function docRef(collection, id) {
    const ref = {
      id,
      path: `${collection}/${id}`,
      get: async () => snapOf(ref),
      set: async (data, options) => commit([{ kind: "set", path: ref.path, data, merge: Boolean(options?.merge) }]),
      update: async (...args) => commit([{ kind: "update", path: ref.path, pairs: pairsOf(args) }]),
      delete: async () => commit([{ kind: "delete", path: ref.path }]),
    };
    return ref;
  }

  function writer() {
    const operations = [];
    return {
      operations,
      set(ref, data, options) {
        operations.push({ kind: "set", path: ref.path, data, merge: Boolean(options?.merge) });
      },
      update(ref, ...args) {
        operations.push({ kind: "update", path: ref.path, pairs: pairsOf(args) });
      },
      delete(ref) {
        operations.push({ kind: "delete", path: ref.path });
      },
    };
  }

  function collectionRef(name) {
    const inCollection = () => [...docs.keys()].filter((path) => path.startsWith(`${name}/`));
    const query = (filters, max) => ({
      where: (field, op, value) => query([...filters, [field, op, value]], max),
      limit: (n) => query(filters, n),
      get: async () => {
        const millis = (v) => (v instanceof Timestamp ? v.toMillis() : v);
        const matching = inCollection().filter((path) =>
          filters.every(([field, op, value]) => {
            const have = millis(getPath(docs.get(path).data, segmentsOf(field)));
            const want = millis(value);
            if (have === undefined) return false;
            return op === "<" ? have < want : op === "<=" ? have <= want : op === ">=" ? have >= want : op === ">" ? have > want : have === want;
          }),
        );
        const taken = max === undefined ? matching : matching.slice(0, max);
        const snaps = taken.map((path) => snapOf(docRef(name, path.slice(name.length + 1))));
        return { docs: snaps, size: snaps.length, empty: snaps.length === 0 };
      },
    });
    return { name, doc: (id) => docRef(name, id), ...query([], undefined) };
  }

  const db = {
    collection: collectionRef,
    batch() {
      const w = writer();
      return { ...w, commit: async () => commit(w.operations) };
    },
    async runTransaction(fn) {
      const w = writer();
      const tx = {
        get: async (ref) => snapOf(ref),
        getAll: async (...args) => args.filter((arg) => typeof arg?.path === "string").map(snapOf),
        set: w.set,
        update: w.update,
        delete: w.delete,
      };
      const result = await fn(tx);
      commit(w.operations);
      return result;
    },
    getAll: async (...args) => args.filter((arg) => typeof arg?.path === "string").map(snapOf),
    async recursiveDelete(collection) {
      for (const path of [...docs.keys()].filter((p) => p.startsWith(`${collection.name}/`))) docs.delete(path);
    },
  };

  return {
    db,
    /** Every document of a collection, as stored: `[id, data, updateTime]`. */
    all(name) {
      return [...docs.entries()]
        .filter(([path]) => path.startsWith(`${name}/`))
        .map(([path, doc]) => [path.slice(name.length + 1), clone(doc.data), doc.updated]);
    },
    /** Every stored document of every collection, as one string, for "is this anywhere". */
    everything() {
      return JSON.stringify([...docs.entries()].map(([path, doc]) => [path, doc.data]));
    },
    /** Move the wall clock the fake stamps server times with. */
    setNow(ms) {
      wall = ms;
    },
    now,
  };
}

/** True when a stored value holds a time anywhere inside it. */
export function holdsATime(value) {
  if (value instanceof Timestamp || value instanceof Date) return true;
  if (Array.isArray(value)) return value.some(holdsATime);
  if (value !== null && typeof value === "object") return Object.values(value).some(holdsATime);
  return false;
}
