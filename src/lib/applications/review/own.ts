import { own } from "../keys";
import type { ApplicationFormFields, ProgrammeSettings } from "../model";
import { isId } from "../normalise";

/**
 * Looking something up by an id that came from outside.
 *
 * A programme id arrives in a path, a query string or a request body, and a
 * ranking or an answer is keyed by ids somebody once sent. A plain `map[id]`
 * with an id of `constructor` or `__proto__` does not miss: it finds the
 * object's own furniture and hands it back as if it were a programme. So every
 * lookup in this folder that is keyed by such an id goes through one of these,
 * which answer only for a key the object really has.
 *
 * THERE IS ONE ACCESSOR, AND IT IS THE CONTRACT'S. `own` here is
 * `src/lib/applications/keys.ts`'s, passed on under this folder's import path.
 * Do not write a second one here: two accessors are two places for the rule
 * to drift.
 *
 * Pure, with no server import.
 */
export { own };

/** The programme with this id on the form, or null when there is none. */
export function programmeOn(
  form: Pick<ApplicationFormFields, "programmes">,
  id: unknown,
): ProgrammeSettings | null {
  if (!isId(id)) return null;
  return own(form.programmes, id) ?? null;
}

/** An empty map with no inherited keys, for one that is filled by id. */
export function emptyMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
