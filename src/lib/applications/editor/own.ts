/**
 * Reading a map by an id, safely.
 *
 * A programme's settings live in a plain object keyed by programme id, and so
 * do several of the editor's own tables. A plain `map[id]` with an id of
 * `constructor` or `toString` does not find a programme and does not find
 * nothing either. It finds a function, which is truthy, and whatever read it
 * then carries on as though the programme were there.
 *
 * So every lookup in this folder that takes an id from a request, or from a
 * stored document, goes through `own`: the entry when the map itself holds
 * that key, and undefined otherwise.
 *
 * THERE IS ONE ACCESSOR, AND IT IS THE CONTRACT'S. `own` here is
 * `src/lib/applications/keys.ts`'s, passed on under this folder's import path
 * so the editor's files did not all have to change when the contract gained
 * it. Do not write a second one here: two accessors are two places for the
 * rule to drift.
 *
 * Pure, with no server import, so the server and the browser use the same one.
 */
export { own } from "../keys";

/**
 * True when `id` names something every object has, and so can never be an id
 * here. The contract's `isId` asks the same question and refuses such a name;
 * this states it on its own for the one place that mints ids.
 */
export function isObjectFurniture(id: string): boolean {
  return id in Object.prototype;
}
