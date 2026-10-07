/**
 * WHAT COUNTS AS A PATH ON THIS SITE, decided in one place.
 *
 * Code is handed a string and has to know whether it names a page here: the
 * page somebody comes back to after signing in, the page an installed app is
 * put back on when it relaunches, the page a notification opens. That is one
 * decision, and this module is the only place it is made. Everything that
 * needs the answer asks `safeReturnPath` and does what it already did with a
 * refusal:
 *
 *  - the copies of a sign-in's return address, and the address a document
 *    load is asked for (`src/lib/signInReturn.ts`,
 *    `src/lib/navigation/hardNavigate.ts`);
 *  - the last page a signed-in member had open (`src/features/pwa/lastRoute.ts`);
 *  - the page a notification opens (`src/lib/push/`).
 *
 * THE RULE A MAINTAINER KEEPS: never test an address for this by hand.
 * `tests/site-path.test.mjs` walks the tree for the shapes such a test is
 * written in and fails a file that holds one, unless it is written down
 * there with what it decides instead.
 *
 * This file imports nothing and holds nothing but the decision, so anything
 * may import it: a route, a component, a job, a test.
 */

/** The longest address that is carried or followed. Far longer than any path this site makes. */
export const RETURN_MAX_LENGTH = 1024;

/**
 * `raw` when it is a path on this site, otherwise null.
 *
 * A path on this site starts with ONE slash. Three things a browser reads as
 * the start of another site's address are refused, and the test of this
 * function asks a URL parser the same question of every string it accepts:
 *
 *  - a second slash (`//host`);
 *  - a backslash, which a browser reads as a slash (`/\host`), refused
 *    wherever it stands;
 *  - a tab, a line break or any other control character, which a browser
 *    drops before it reads the address, so that `/<tab>/host` is `//host`.
 *
 * No path this site makes holds a backslash or a control character, so
 * nothing real is lost by refusing them.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > RETURN_MAX_LENGTH) return null;
  if (raw[0] !== "/" || raw[1] === "/") return null;
  // By code point, so this file carries no control character of its own.
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || ch === "\\") return null;
  }
  return raw;
}
