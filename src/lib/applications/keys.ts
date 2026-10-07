/**
 * IDS, AND READING A MAP BY ONE.
 *
 * The application system keeps several things in plain maps keyed by an id:
 * a form's `programmes`, an application's `answers`, a review's `scores`, a
 * decision document's `programmes`. The ids those maps are read by very often
 * did NOT come from the map. They come from somebody else: the ranking an
 * applicant typed, a programme id in an address, a question id off the form
 * being used to look inside an answer the applicant sent.
 *
 * A plain object answers such a read from more than its own keys. Every
 * object also carries the names its prototype gives it (`constructor`,
 * `toString`, `hasOwnProperty`, `__proto__` and the rest), so
 * `programmes["constructor"]` is not `undefined`: it is a function, it is
 * truthy, and code that then treats it as a programme goes on to read fields
 * off it or, worse, to write to it.
 *
 * Two rules close that, and both live here so there is one place to read
 * them:
 *
 *  1. SUCH A NAME IS NEVER AN ID. `isId` refuses it, so it cannot be the id
 *     of a programme, a question set or a question, and the normalisers,
 *     which keep only ids, drop it wherever it turns up in stored data.
 *  2. A MAP IS READ BY ITS OWN KEYS. `own` is the one way this system looks
 *     a key up in one of those maps when the key came from anywhere but the
 *     map itself. It answers `undefined` for anything the map does not hold
 *     as its own, whatever the name.
 *
 * Either rule alone would do for most reads. Both are kept because they fail
 * differently: the first is only as good as every write path remembering to
 * ask it, and the second is only as good as every read going through it.
 *
 * THE MAPS STAY PLAIN OBJECTS. Building them on a null prototype would make
 * the first rule unnecessary, and is not an option: a form is handed from a
 * server component to a client component, and React refuses to pass an
 * object with a null prototype across that boundary.
 *
 * Pure, with no imports, so it runs in a route, in a test and in the browser,
 * and so the member record's builder (`src/lib/firestore/memberRecords.ts`)
 * can use the same accessor without reaching the rest of this system.
 */

/**
 * The shape of an id this system mints: letters, digits, hyphen and
 * underscore. No dot, because ids are used as keys in Firestore field paths
 * and in `questionKey()`, and a dot in either would address a different field.
 */
const ID_SHAPE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * True for a well-formed id that is not a name every object carries.
 *
 * The second half is asked of the running `Object.prototype` and not of a
 * list, because the question is exactly "would a plain object answer to this
 * name without owning it", and that is the object to ask.
 */
export function isId(v: unknown): v is string {
  return typeof v === "string" && ID_SHAPE.test(v) && !(v in Object.prototype);
}

/** A question key is two ids joined by one dot. See `questionKey()`. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{1,80}\.[A-Za-z0-9_-]{1,80}$/;

/**
 * True for a key `questionKey()` could have built: the shape, and each half
 * an id in its own right, so a key cannot name a question set or a question
 * that could never exist.
 */
export function isQuestionKey(v: unknown): v is string {
  return typeof v === "string" && KEY_SHAPE.test(v) && v.split(".").every(isId);
}

/**
 * The value a map holds under `key` AS ITS OWN, or `undefined`.
 *
 * Use it for every read of a map by a key that did not come from that map's
 * own keys. A name the map merely inherits reads as not there, which is what
 * it is. Takes a missing map as an empty one, so a caller holding an optional
 * map does not have to branch first.
 */
export function own<T>(
  map: Readonly<Record<string, T>> | null | undefined,
  key: string,
): T | undefined {
  if (map === null || map === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}
