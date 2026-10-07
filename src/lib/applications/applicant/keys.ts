import { isId } from "../normalise";

/**
 * LOOKING SOMETHING UP BY AN ID THAT CAME FROM OUTSIDE.
 *
 * A programme id, a question set id and a question id are all used as keys
 * of plain objects (`form.programmes`, `answers`). A plain `map[id]` answers
 * for more than the keys somebody put there: `map["constructor"]` is the
 * function every object inherits, and `map["__proto__"]` is the prototype
 * itself. Both pass the shape test for an id, so an id from a request, a
 * stored document or an address must never be handed straight to a lookup.
 *
 * So every keyed read in the applicant's lane goes through `own`, which
 * answers only for a key the object itself holds, and every keyed write
 * checks `isSafeKey` first. Pure, so the form in the browser uses the same
 * two functions as the routes.
 */

/** True when `key` is one of `map`'s OWN keys, not something it inherits. */
export function hasOwn(map: object | null | undefined, key: string): boolean {
  return map !== null && map !== undefined && Object.prototype.hasOwnProperty.call(map, key);
}

/** `map[key]` when the object itself holds that key, otherwise undefined. */
export function own<T>(map: Record<string, T> | null | undefined, key: string): T | undefined {
  return map && hasOwn(map, key) ? map[key] : undefined;
}

/**
 * A key that may be WRITTEN onto a plain object: an id by shape, and not the
 * one name whose assignment replaces the object's prototype instead of adding
 * a key.
 */
export function isSafeKey(key: unknown): key is string {
  return isId(key) && key !== "__proto__";
}
