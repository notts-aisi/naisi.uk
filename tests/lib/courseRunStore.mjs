/**
 * The same database, as the COURSE routes ask for it.
 *
 * `tests/lib/applicationsStore.mjs` is the store the application system's
 * suites run on, and it has no `limit()` on purpose: the application system
 * reads by one or two equalities and sorts in memory, and that store refuses
 * a query that asks for more. The course routes are older and page their
 * reads with a limit (the allocation board reads at most 500 rows and 50
 * groups), so they cannot run on that store as it is.
 *
 * A suite that takes one term across both halves needs ONE set of documents
 * and both ways of asking. `courseView(db)` is the second way: an object that
 * reads and writes the very same documents, through the store's own
 * transactions, and whose queries also take `limit()`. The store itself is not
 * changed, so the application system's code is still held to it: hand that
 * code `db`, and hand a course route `courseView(db)`.
 *
 * A limit here cuts the list a query returns and nothing else. No ordering
 * and no ranges: a course route that sorted or ranged on the server would
 * still fail on this view, which is right, because it would need an index.
 */

function wrapSnapshot(snapshot) {
  return { ...snapshot, ref: wrapDoc(snapshot.ref) };
}

function wrapQuery(inner, max) {
  return {
    path: inner.path,
    isQuery: true,
    where: (...args) => wrapQuery(inner.where(...args), max),
    select: (...args) => wrapQuery(inner.select(...args), max),
    limit: (n) => wrapQuery(inner, n),
    get: async () => {
      const found = await inner.get();
      const docs = (typeof max === "number" ? found.docs.slice(0, max) : found.docs).map(wrapSnapshot);
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}

function wrapDoc(inner) {
  return {
    ...inner,
    get: async () => wrapSnapshot(await inner.get()),
    collection: (name) => wrapCollection(inner.collection(name)),
  };
}

function wrapCollection(inner) {
  return {
    ...wrapQuery(inner, undefined),
    doc: (id) => wrapDoc(inner.doc(id)),
    add: (data) => inner.add(data),
  };
}

/**
 * `db` is a store from `makeDb`. What comes back shares its documents, its
 * transactions (so `db.beforeCommit` still fires for a transaction started
 * here) and its helpers (`read`, `paths`, `seed`, `poke`, `stats`).
 */
export function courseView(db) {
  const view = Object.create(db);
  view.collection = (path) => wrapCollection(db.collection(path));
  return view;
}
