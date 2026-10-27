/**
 * The client/server module boundary, walked rather than asserted about.
 *
 * ## The bug this exists for
 *
 * `import "server-only"` is a build-time tripwire: Next refuses a production
 * build when a module carrying it ends up in a client component's graph. The
 * trap is that NOTHING ELSE CATCHES IT. `tsc --noEmit` is happy, eslint is
 * happy, `npm test` is happy, and `next dev` only compiles the routes you
 * happen to open. The whole courses V3 stack went through twenty-seven
 * branches that were typechecked, linted and unit tested green, and the first
 * production build failed with four errors of exactly this shape:
 *
 *   RoundEditor.tsx ("use client")
 *     -> lib/admissions/appointmentQueue.ts   (for appointmentDecideBlock)
 *     -> lib/admissions/statusHub.ts          (for answerText)
 *     -> lib/admissions/applyRoutes.ts        import "server-only"
 *     -> lib/admissions/roundRoutes.ts        import "server-only"
 *
 * One value import of a nine-line helper, four modules down, and the build is
 * dead. The chain is invisible at the call site, which is the point: nobody
 * reads four modules deep to import a predicate.
 *
 * ## What this does
 *
 * It walks the REAL import graph: every file under `src` that begins with
 * `"use client"`, then transitively every relative and `@/` specifier those
 * files reach, and fails naming the whole chain if any reached module imports
 * `server-only`.
 *
 * TYPE-ONLY IMPORTS ARE SKIPPED, because TypeScript erases them and they carry
 * nothing into the bundle. `import type { AppointmentQueueRow } from
 * "@/lib/admissions/appointmentQueue"` is fine and must stay fine: refusing it
 * would push every wire shape into a parallel types module for no benefit.
 * A value import of the same module is not fine, and that is the distinction
 * the walker makes.
 *
 * ## The fix shape, when this test goes red
 *
 * Do NOT delete the `server-only` marker. It is what stops a route module
 * reaching the browser, and other guards lean on it (see
 * `tests/privacy-policy.test.mjs`, which treats reaching
 * `lib/admissions/applyContext.ts` as reaching the access-requirements
 * collection). Move the pure piece the client actually needs into a LEAF
 * module that imports nothing server-only, and have the server module
 * re-export it so no existing call site changes. `lib/admissions/answerText.ts`
 * and `lib/admissions/appointmentRules.ts` are the worked examples.
 *
 * ## The second class: the Admin SDK itself
 *
 * `server-only` is a marker somebody has to remember to write. The Admin SDK
 * is the thing the marker is usually protecting, and reaching it breaks the
 * build whether or not a marker was ever added: `firebase-admin` resolves
 * `fs`, `net` and `http2`, none of which a browser chunk can bundle.
 *
 * That gap is not hypothetical. `src/lib/firestore/memberRecords.ts` is read
 * client-direct by the admin Members page (`useMemberApplications.ts`) and
 * written by the settle and destroy routes, so it sits on both sides at once.
 * It carries no `server-only` marker precisely so the client half can import
 * the normaliser, and it keeps its `firebase-admin/firestore` import TYPE-ONLY
 * for the same reason. Nothing in `npm test` noticed if that first line lost
 * its `type` keyword; the failure arrived as a red production build. A module
 * shaped like that one is the pattern to expect more of, so the walker checks
 * for the SDK by name as well as for the marker.
 *
 * The fix shape is the same one, with an extra option: a type-only import is
 * always fine, so a client-readable module can keep its Admin SDK TYPES and
 * get its sentinels from the Firestore instance it was handed
 * (`memberRecords.ts`'s `serverTimestamp(db)` is the worked example).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { repoPath, walkClientGraph } from "./lib/clientGraph.mjs";

const SERVER_ONLY = "server-only";

/**
 * The Admin SDK, in every spelling a specifier can take it: the package itself
 * and each of its entry points (`firebase-admin/firestore`, `/auth`, `/app`).
 * A value import of any of them from a client graph fails `next build`, with
 * or without a `server-only` marker anywhere near it.
 */
const FIREBASE_ADMIN = /^firebase-admin(?:\/|$)/;

// ---------------------------------------------------------------------------
// The walk: every module a "use client" file reaches by value, read and
// resolved in tests/lib/clientGraph.mjs, which the keepalive guard walks too.
// ---------------------------------------------------------------------------

const violations = [];
const adminSdkReaches = [];

const { clientFiles, edgesFollowed, unresolved } = walkClientGraph({
  onPackage: ({ entry, chain, file, specifier }) => {
    if (specifier === SERVER_ONLY) violations.push({ entry, chain, offender: file });
    else if (FIREBASE_ADMIN.test(specifier)) adminSdkReaches.push({ entry, chain, offender: file, specifier });
  },
});

function describeChain({ chain }, tail = 'import "server-only"') {
  return chain
    .map((file, index) => `${"  ".repeat(index)}${index === 0 ? "" : "-> "}${repoPath(file)}`)
    .join("\n")
    .concat(`\n${"  ".repeat(chain.length)}-> ${tail}`);
}

describe("the client/server module boundary", () => {
  test("the walk is not vacuous: it found client files and followed edges", () => {
    // A resolver that silently returns null for everything would make the
    // guard below pass on a broken tree, which is the one way a test like this
    // fails quietly. These floors are far below the real counts.
    assert.ok(
      clientFiles.length > 20,
      `only ${clientFiles.length} "use client" files found under src; the scan is broken`,
    );
    assert.ok(
      edgesFollowed > 200,
      `only ${edgesFollowed} import edges followed from client files; the resolver is broken`,
    );
  });

  test("every relative import from a client graph resolves to a real file", () => {
    // An unresolvable specifier is a hole in the walk, so it is reported
    // rather than shrugged off: the chain it would have opened is unwalked.
    assert.deepEqual(unresolved, []);
  });

  test("no client component reaches a module that imports server-only", () => {
    assert.deepEqual(
      violations.map(describeChain),
      [],
      'these "use client" modules reach a `server-only` module through value ' +
        "imports, which fails `next build` even though tsc, eslint and the unit " +
        "suites are all green. Do not delete the marker: move the pure piece " +
        "the client needs into a leaf module that imports nothing server-only, " +
        "and re-export it from the server module so no call site changes. See " +
        "the docblock at the top of this file.",
    );
  });

  test("no client component reaches the Firebase Admin SDK by value", () => {
    // The class the `server-only` check misses: a module that is READ from the
    // browser and WRITTEN from a route (`src/lib/firestore/memberRecords.ts`)
    // has no marker to trip, and one lost `type` keyword on its Admin SDK
    // import puts `firebase-admin` in a client chunk. That fails only when Next
    // bundles, which is a failed rollout rather than a red test.
    assert.deepEqual(
      adminSdkReaches.map((reach) => describeChain(reach, `import "${reach.specifier}"`)),
      [],
      'these "use client" modules reach `firebase-admin` through value ' +
        "imports, which resolves `fs`, `net` and `http2` and fails `next " +
        "build`. Either make the import type-only (types are erased and carry " +
        "nothing into the bundle, so a shared module can keep its Admin SDK " +
        "types and take its sentinels off the Firestore instance it was " +
        "handed, as `memberRecords.ts` does), or move the pure piece the " +
        "client needs into a leaf module. See the docblock at the top of this " +
        "file.",
    );
  });
});
