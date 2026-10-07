import { isId, own } from "../keys";

/**
 * LOOKING SOMETHING UP BY AN ID THAT CAME FROM OUTSIDE.
 *
 * A programme id, a question set id and a question id are all used as keys
 * of plain objects (`form.programmes`, `answers`). A plain `map[id]` answers
 * for more than the keys somebody put there: `map["constructor"]` is the
 * function every object inherits, and `map["__proto__"]` is the prototype
 * itself. So an id from a request, a stored document or an address must never
 * be handed straight to a lookup.
 *
 * THERE IS ONE ACCESSOR, AND IT IS THE CONTRACT'S. `own` here is
 * `src/lib/applications/keys.ts`'s `own`, handed on under the same name so
 * the applicant's modules and the form in the browser import it from beside
 * them. Nothing in this file reads a map any other way: `hasOwn` asks `own`,
 * and `isSafeKey` asks the contract's `isId`. A second way of reading a map
 * written here would be a second rule to keep in step with the first.
 *
 * Pure, with no import that runs outside the contract's own pure module, so
 * the form in the browser uses the same functions as the routes.
 */
export { own };

/**
 * True when `map` holds something under `key` AS ITS OWN. A name the map only
 * inherits reads as not there, and so does a key holding nothing.
 */
export function hasOwn(map: object | null | undefined, key: string): boolean {
  return own(map as Readonly<Record<string, unknown>> | null | undefined, key) !== undefined;
}

/**
 * A key that may be WRITTEN onto a plain object: an id, and nothing else.
 *
 * The contract's `isId` refuses every name a plain object carries without
 * owning it. `__proto__` is one of them, which is the name that matters most
 * for a write: assigning to it replaces the object's prototype instead of
 * adding a key.
 */
export function isSafeKey(key: unknown): key is string {
  return isId(key);
}
