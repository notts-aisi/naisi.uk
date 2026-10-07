/**
 * Reading a map by an id, safely.
 *
 * A programme's settings live in a plain object keyed by programme id, and so
 * do several of the editor's own tables. An id is letters, digits, hyphen and
 * underscore, which is also the shape of `constructor` and `toString`: names
 * every object answers to. A plain `map[id]` with such an id does not find a
 * programme and does not find nothing either. It finds a function, which is
 * truthy, and whatever read it then carries on as though the programme were
 * there.
 *
 * So every lookup in this lane that takes an id from a request, or from a
 * stored document, goes through `own`: the entry when the map itself holds
 * that key, and undefined otherwise.
 *
 * Pure, with no import, so the server and the browser use the same one.
 */
export function own<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** True when `id` names something every object has, and so can never be an id here. */
export function isObjectFurniture(id: string): boolean {
  return id in Object.prototype;
}
