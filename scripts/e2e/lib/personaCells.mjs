/**
 * HOW THE PERSONA BATTERY READS A CELL: the pure half of
 * `scripts/e2e/tests/persona-route-gates.test.mjs`, kept apart so the offline
 * guard (`tests/persona-route-gates.test.mjs`) can hold it to its rules with
 * no build, no server and no emulator. Nothing here reads or writes anything.
 *
 *  - `pathFor` fills a key's dynamic segments from a set of the world's ids,
 *    or with an id that addresses nothing (`e2e-missing-<segment>`).
 *  - `queryFor` fills a `realDrive.query` template from the same set.
 *  - `normalisePath` puts a redirect target back into key shape: a made-up id
 *    to its segment, and every WHOLE path segment that is one of the set's ids
 *    to the segment it fills, so `/learn/<a real run>` reads `/learn/[runId]`.
 *  - `statesIn` names the calm states a page's HTML says it drew in place of
 *    itself (`STATES`).
 *  - `pageOutcome` turns what a page answered into what the key names: every
 *    redirect target, else every calm state, else the status. States are a
 *    set for the reason redirects are: a page renders beside the layout that
 *    refuses it, so both can be in the stream.
 *  - `pageMatches` holds an outcome to an expectation: a status exactly, or a
 *    name or a list of names that every observed name must be one of.
 */
import { REDIRECTS, STATES } from "../../../tests/persona-route-gates.registry.mjs";

export function pathFor(key, ids = {}) {
  return (
    key
      .split("/")
      .filter((seg) => !/^\(.*\)$/.test(seg))
      .map((seg) =>
        seg.replace(/^\[\.{0,3}(\w+)\]$/, (_, name) =>
          typeof ids[name] === "string" ? encodeURIComponent(ids[name]) : `e2e-missing-${name}`,
        ),
      )
      .join("/") || "/"
  );
}

export function queryFor(template, ids) {
  return template.replace(/\{(\w+)\}/g, (_, name) => encodeURIComponent(ids[name] ?? `e2e-missing-${name}`));
}

export function normalisePath(location, ids = {}) {
  const byValue = new Map(Object.entries(ids).map(([name, value]) => [encodeURIComponent(value), name]));
  return new URL(location.replace(/&amp;/g, "&"), "http://placeholder.invalid").pathname
    .split("/")
    .map((seg) => {
      const missing = /^e2e-missing-(\w+)$/.exec(seg);
      if (missing) return `[${missing[1]}]`;
      return byValue.has(seg) ? `[${byValue.get(seg)}]` : seg;
    })
    .join("/");
}

export function statesIn(text) {
  const plain = text.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
  return Object.keys(STATES).filter((name) => plain.includes(STATES[name]));
}

export function pageOutcome(observed) {
  if (observed.locations.length === 0) {
    const states = observed.states ?? [];
    return states.length > 0 ? [...states] : observed.status;
  }
  return observed.locations.map(
    (path) => Object.keys(REDIRECTS).find((n) => REDIRECTS[n] === path) ?? `redirect:${path}`,
  );
}

export function pageMatches(want, got) {
  if (typeof want === "number") return got === want;
  const allowed = Array.isArray(want) ? want : [want];
  return Array.isArray(got) && got.length > 0 && got.every((name) => allowed.includes(name));
}
