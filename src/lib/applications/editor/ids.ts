import { slugify } from "@/lib/firestore/slugId";
import { isId } from "../normalise";
import { isObjectFurniture } from "./own";

/**
 * Ids for the things the editor makes: programmes, question sets and
 * questions.
 *
 * An id is minted from a name and never taken from one. It is a key in a
 * Firestore field path (`programmes.<id>.places`) and half of a question key,
 * so it has to be letters, digits, hyphen and underscore and nothing else, and
 * whatever somebody typed is only ever the readable start of it: `slugify`
 * reduces the name to that alphabet and a short random suffix makes it this
 * form's alone.
 */

const SUFFIX_LENGTH = 4;
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
/** The largest multiple of 36 that fits in a byte, so no character is favoured. */
const UNBIASED_BELOW = 252;
/** Short enough that the id reads at a glance and stays far inside 80 characters. */
const SLUG_LENGTH = 32;

function shortSuffix(): string {
  let out = "";
  const bytes = new Uint8Array(SUFFIX_LENGTH * 2);
  while (out.length < SUFFIX_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= UNBIASED_BELOW) continue;
      out += BASE36[byte % 36];
      if (out.length === SUFFIX_LENGTH) break;
    }
  }
  return out;
}

/**
 * A new id that reads like `source` and is not in `taken`.
 *
 * `taken` is every id it must not collide with: the form's other programmes,
 * its other sets, or the other questions in the same set. It is also never a
 * name every object has (`constructor`, `toString`), which would be found in
 * a map that does not hold it.
 */
export function mintId(source: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const slug = slugify(source, SLUG_LENGTH);
  for (;;) {
    const id = `${slug}-${shortSuffix()}`;
    if (isId(id) && !isObjectFurniture(id) && !used.has(id)) return id;
  }
}
