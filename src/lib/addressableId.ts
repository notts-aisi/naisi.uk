/**
 * One definition of "a value that may name exactly one Firestore document",
 * and the request-level check that keeps such values from ever carrying a
 * separator.
 *
 * WHY THIS EXISTS. A dynamic route segment arrives URL-DECODED, so a `%2F` in
 * a path reaches a handler as a real slash inside what it takes to be an id.
 * `db.collection("tasks").doc(id)` with a slash in `id` can address a document
 * in a SUBCOLLECTION instead of the one the route names. So an id must never
 * carry a separator: the proxy refuses an encoded separator in ANY `/api` path
 * before a route sees it, and `tests/api-addressable-ids.test.mjs` holds that
 * in place.
 *
 * `hasEncodedPathSeparator` runs on the ENCODED pathname. The URL parser keeps
 * `%2F` encoded (it would change the path's meaning to decode it) and folds
 * `.` and `..` segments away before anything server-side runs, so the encoded
 * slash is the only way a separator can enter a segment.
 */

export function isAddressableId(value: string): boolean {
  return Boolean(value) && !value.includes("/") && value !== "." && value !== "..";
}

export function hasEncodedPathSeparator(pathname: string): boolean {
  return /%2f/i.test(pathname);
}
