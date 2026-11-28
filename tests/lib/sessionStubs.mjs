/**
 * The session, stubbed under BOTH names `src` imports it by, for a world that
 * renders server pages.
 *
 * Pages and routes import `@/lib/firebase/session`. The page gates beside it
 * (`src/lib/firebase/pageGates.ts`) import `./session`. The loader matches a
 * stub on the specifier exactly as written (`tests/lib/tsLoader.mjs`), so a
 * world that stubs only the alias leaves the gates on the real module, which
 * dies on `next/headers`. Stubbing both means a page's own gate runs for real
 * against the account the world is driving, so a page rendered as somebody
 * its gate refuses is redirected as it would be on the site, and a test that
 * drives a page as a member still proves something.
 *
 * `sessionStubs(source)` returns the two `[specifier, source]` pairs, with the
 * one module text the world gives its `getCurrentUser`.
 *
 * Because the `./session` key stubs that string from whichever file writes
 * it, every module in `src` that writes it has to mean
 * `src/lib/firebase/session.ts`. That is checked once, when this file loads:
 * a `./session` anywhere else fails every world built on this by name, and so
 * does there being none (the stub would then be dead).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./functionScan.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const HOME = join(SRC, "lib", "firebase");

const writers = [];
for (const file of walkSource(SRC)) {
  if (/from\s+["']\.\/session["']/.test(readFileSync(file, "utf8"))) writers.push(file);
}
const elsewhere = writers.filter((file) => dirname(file) !== HOME);
if (elsewhere.length > 0) {
  throw new Error(
    `sessionStubs stubs "./session" as src/lib/firebase/session.ts, and these import a different ./session: ${elsewhere.join(", ")}`,
  );
}
if (writers.length === 0) {
  throw new Error('sessionStubs stubs "./session", and nothing in src imports it any more: drop that half.');
}

/** Both names the session is imported by, each stubbed with `source`. */
export function sessionStubs(source) {
  return [
    ["@/lib/firebase/session", source],
    ["./session", source],
  ];
}
