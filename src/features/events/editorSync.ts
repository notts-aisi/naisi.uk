/**
 * What the event editor keeps when the event changes underneath it.
 *
 * The editor listens to its event, and an event changes while somebody is
 * typing in it: a sign-up arrives and moves a counter, a collaborator is
 * ticked, the event is archived, somebody else saves. Each of those hands the
 * editor the whole event again.
 *
 * The rule, one field at a time:
 *
 *  - A field the person has CHANGED and not saved is kept as they have it.
 *  - Every other field takes what the server now says, at once. So somebody
 *    else's change to a field this person has not touched still arrives.
 *
 * "Changed" is not a flag that somebody remembers to set. It is worked out:
 * a field has been changed when what the form holds differs from what the
 * form last took from the server, or last saved. A field typed in and then
 * put back as it was is, correctly, a field nobody has changed.
 *
 * What this does NOT do: if two people change the SAME field, the second to
 * save wins and the first is not told. A list (the description's blocks, the
 * sign-up questions, the dietary tags) is one field, so changing one question
 * keeps the whole list as this person has it.
 *
 * Nothing here knows what an event is. `tests/event-editor-unsaved-edits
 * .test.mjs` runs these two functions, and holds the editor to using them
 * for every field it saves.
 */

/**
 * Whether two values of one field are the same thing: a date by its instant,
 * a list by its items in order, an object by its own keys.
 *
 * A key whose value is `undefined` counts as absent, because that is how the
 * event is stored: an optional part of a question that was never set is left
 * out of the document, and comes back as a missing key.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    // Two numbers that are both not-a-number are the same empty box.
    return typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const set = (o: Record<string, unknown>) =>
    Object.keys(o).filter((key) => o[key] !== undefined);
  const keys = set(left);
  if (keys.length !== set(right).length) return false;
  return keys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && sameValue(left[key], right[key]),
  );
}

/**
 * The value one field of the form should hold after the event changed.
 *
 *  - `current`  what the form holds now
 *  - `synced`   what the form last took from the server for this field, or
 *               last saved
 *  - `incoming` what the server says now
 *
 * A field that still holds what it was last given has not been touched, so
 * it takes the new value. A field that differs is somebody's unsaved work
 * and is kept.
 */
export function takeIncoming<T>(current: T, synced: T, incoming: T): T {
  return sameValue(current, synced) ? incoming : current;
}
