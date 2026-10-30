/**
 * The end-to-end COVERAGE MAP (run under `npm test`: no browser, no network,
 * no credentials).
 *
 * WHY THIS EXISTS. The other guards in this repo ask "is this thing correct".
 * This one asks "is this thing tested at all", which is the question nobody
 * answers on their own initiative. A suite of end-to-end specs grows in the
 * direction of whatever was last broken, and the surfaces nobody has looked at
 * are exactly the surfaces nobody knows are uncovered. So the map is written
 * down, checked in both directions, and every gap carries a reason and the
 * trigger that closes it.
 *
 * HOW IT WORKS.
 *
 *  1. It WALKS `src/app` for every `route.ts` and every `page.tsx` and keys
 *     them the way a SPEC's `covers` does: the path under `src/app` with the
 *     trailing `/route.ts` or `/page.tsx` removed, route groups kept verbatim.
 *     A hand-written list of routes is a list that is wrong by the end of the
 *     week, so there is no hand-written list.
 *  2. The EXERCISED set is assembled from two places: every `SPEC.covers` in
 *     `scripts/e2e-fixtures/` whose `SPEC.status` is "verified", and the
 *     `AUTH_BATTERIES` map below, which names what each fetch battery under
 *     `scripts/e2e/tests/` drives.
 *  3. Everything else must be in `NOT_COVERED`, with a written reason and a
 *     written trigger. A key with neither an exercising spec nor an entry
 *     fails, naming itself.
 *
 * A SPEC WHOSE STATUS IS "unverified" CONTRIBUTES NOTHING. A spec that has
 * never passed end to end proves nothing about the routes it names, and a
 * coverage map that counted intentions would be a map that lies in the
 * direction nobody checks. Those specs are printed on every run, so writing
 * one and never running it is loud rather than quiet.
 *
 * BOTH DIRECTIONS, like every registry in this repo. An entry whose key no
 * longer exists fails (the route moved and the reason went stale with it). An
 * entry whose key a verified spec now covers fails (the burn-down rule: a
 * spec's pull request moves its keys out of this list in the same diff). A
 * `covers` key that resolves to no file fails, which
 * `tests/funnel-harness-guards.test.mjs` also checks, deliberately: the two
 * guards disagree the day somebody edits one of them.
 *
 * WHAT IT CANNOT SEE. It reads declarations, not behaviour. A spec that visits
 * a page and asserts nothing about it still counts that page as covered, and
 * an API route a page calls internally is covered only because a human wrote
 * it into `covers`. The map's honesty therefore rests on the SPEC modules
 * being honest about what they drove, which is the same bargain
 * `KNOWN_MISSING_INDEXES` and `MUST_GUARD` make.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(REPO_ROOT, "src", "app");
const FIXTURES_DIR = join(REPO_ROOT, "scripts", "e2e-fixtures");
const BATTERIES_DIR = join(REPO_ROOT, "scripts", "e2e", "tests");

/**
 * Every route or page in the app, keyed as a SPEC's `covers` names it and
 * mapped to the file it came from, so a failure can print the file rather than
 * leave the reader to find it.
 */
function appKeys(kind) {
  const file = kind === "routes" ? "route.ts" : "page.tsx";
  const found = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === file) {
        const key = `/${relative(APP_DIR, dirname(path)).split("\\").join("/")}`;
        found.set(key === "/." ? "/" : key, relative(REPO_ROOT, path).split("\\").join("/"));
      }
    }
  };
  walk(APP_DIR);
  return found;
}

const ROUTE_KEYS = appKeys("routes");
const PAGE_KEYS = appKeys("pages");
/** One map, because a key is unique across both kinds and the map is one map. */
const ALL_KEYS = new Map([...ROUTE_KEYS, ...PAGE_KEYS]);

/* -------------------------------------------------------------------------
 * 1. What the fetch batteries drive
 * ---------------------------------------------------------------------- */

/**
 * The nine batteries under `scripts/e2e/tests/`, and the routes each one
 * really drives. Written by reading them, one entry per file, checked in both
 * directions: a battery with no entry fails, an entry naming a file that is
 * gone fails, and a `drives` key that is not a route or page in `src/app`
 * fails.
 *
 * These are `fetch()` batteries rather than browser specs, so what they prove
 * is narrower: the route answers correctly. Nothing about the page that calls
 * it. That is enough to call the ROUTE exercised, which is what this map is
 * about, and it is why the pages in `redirectOnly` below are NOT counted.
 *
 * BOTH CI JOBS RUN THEM (`npm run e2e:local` in the local job, `npm run e2e`
 * in the dev job, before each one's browser step), because a credit collected
 * by no job is a credit that rots. If that ever stops being true, the honest
 * move is to say so here rather than to keep counting these routes.
 */
const AUTH_BATTERIES = {
  "api-path-separators.test.mjs": {
    why:
      "The proxy chokepoint: an encoded slash in any /api path is answered 404 before a " +
      "handler runs, and the same path with a plain id reaches the handler (401).",
    // Requests /api/tasks/[id]/notify, but only to prove the proxy answers first and that
    // a plain id gets through to the handler. The handler itself is not exercised, so
    // that key stays in NOT_COVERED.
    drives: [],
  },
  "password-set.test.mjs": {
    why: "The throwaway password is really replaced and the old session really revoked.",
    drives: ["/api/register/password-set", "/api/verify-email/reconcile"],
  },
  "persona-route-gates.test.mjs": {
    why:
      "The standing red team: every route and every authed page requested as every persona " +
      "against a real build with an emulator behind it, and each answer held to " +
      "tests/persona-route-gates.registry.mjs.",
    // Requests every route and page, but with ids that address nothing and
    // empty bodies, so what it proves is each GATE's answer to each persona
    // and never a handler's work. Nothing enters the exercised set.
    drives: [],
  },
  "protected-route-gate.test.mjs": {
    why:
      "The proxy gate: a protected path 307s to /login?next=, a minted cookie opens it, " +
      "and DELETE closes it again.",
    drives: ["/api/auth/session"],
    /**
     * Pages this battery requests, but only ever as a SIGNED-OUT visitor whose
     * request is redirected before the page renders. That proves the gate, not
     * the page, so these do not enter the exercised set: each one carries a
     * NOT_COVERED entry that says the redirect is all that is asserted, and
     * the test below checks the entry says so.
     */
    redirectOnly: [
      "/(app)/dashboard",
      "/(app)/tasks",
      "/(app)/credentials",
      "/(app)/profile",
      "/(app)/newsletter",
      "/(app)/admin/(admin-only)",
      "/collaborator",
    ],
    /**
     * Paths it also requests that resolve to no page at all. `/calendar` is in
     * `PROTECTED_PREFIXES` in src/proxy.ts and has no page behind it yet, so
     * the 307 comes from the proxy and there is nothing to cover. Declared
     * rather than dropped: the day a page lands there, this list is wrong and
     * the test says so.
     */
    unmappedPaths: {
      "/calendar": "PROTECTED_PREFIXES names it, but no page.tsx exists for it yet.",
    },
  },
  "public-write-gating.test.mjs": {
    why:
      "The same question as recaptcha-gate.test.mjs, asked of the other public writer: the " +
      "RSVP bot gate is live on every deployed backend, and it runs BEFORE the event is " +
      "fetched. Deliberately a twin rather than an addition, because the two routes hold the " +
      "secret independently and a check that proved one and implied the other is how the " +
      "second one drifts.",
    // It only ever posts a junk token to an event id that cannot exist, so the
    // handler is refused at the gate and never runs. That proves the gate, not
    // the route, so the key stays in NOT_COVERED.
    drives: [],
  },
  "recaptcha-gate.test.mjs": {
    why: "The reCAPTCHA gate is live on every deployed backend: a junk token must bounce.",
    drives: ["/api/register"],
  },
  "register-email-flow.test.mjs": {
    why:
      "What /api/register puts in the inbox, and the emailed link driven through to a " +
      "working credential. Local mode only.",
    drives: ["/api/register", "/api/register/password-set", "/verify-email/[tokenId]"],
  },
  "register-enumeration.test.mjs": {
    why: "Account-enumeration uniformity on /api/register. Local mode only.",
    drives: ["/api/register"],
  },
  "security-headers.test.mjs": {
    why:
      "The response headers next.config.ts declares are what a running server sends: HSTS, " +
      "X-Frame-Options, Referrer-Policy, Permissions-Policy, nosniff, the CSP header, " +
      "and the service worker's own no-store rule surviving the global rule.",
    // Requests the home page, the sign-in page, a protected redirect, an API
    // refusal and two static files, and reads only their headers. That proves
    // the headers, not any handler, so nothing here enters the exercised set.
    drives: [],
  },
  "token-negatives.test.mjs": {
    why: "Forged, edited, expired and cross-scope magic-link tokens are all refused.",
    drives: ["/api/verify-email/confirm"],
  },
  "uni-email-gate.test.mjs": {
    why: "The university-email gate: a non-Nottingham address is refused.",
    drives: ["/api/verify-email/send"],
  },
  "uni-email-inbox.test.mjs": {
    why: "Enumeration uniformity on the uni-email leg extends to what lands in the inbox.",
    /**
     * NOT `/verify-email/[tokenId]`, though this battery reads the link out of
     * the mail: it only string-matches the prefix the link is supposed to
     * carry and never requests the page, so it proves what was sent, not what
     * renders. `register-email-flow.test.mjs` really GETs that page, and the
     * page's coverage rests there alone.
     */
    drives: [
      "/api/register",
      "/api/verify-email/send",
      "/api/verify-email/confirm",
      "/api/verify-email/reconcile",
    ],
  },
  "uni-email-stamp.test.mjs": {
    why: "The two-phase uniEmailVerifiedAt stamp and its survival of the session revocation.",
    drives: [
      "/api/verify-email/confirm",
      "/api/verify-email/reconcile",
      "/api/register/password-set",
    ],
  },
};

/* -------------------------------------------------------------------------
 * 2. The gaps, each with a reason and a trigger
 * ---------------------------------------------------------------------- */

/**
 * Every route and page no spec and no battery exercises, with the reason it is
 * uncovered and the trigger that closes it.
 *
 * `reason` says why the gap is acceptable TODAY. `coverWhen` is a trigger, not
 * a wish: a thing that will happen, on which somebody writes the spec. "When
 * we get round to it" is not a trigger, which is why both strings are
 * length-checked and why the burn-down rule is that a spec's pull request
 * deletes its keys from here in the same diff.
 *
 * It is long on purpose. The list is the honest shape of the suite on the day
 * it shipped: the journeys the specs drive, and every other surface written
 * down rather than quietly absent.
 */
const NOT_COVERED = {
  // Worksheet engine. Built in a parallel branch during the week this map
  // landed (#278, #279) and still moving; a spec written against today's shape
  // would be thrown away with its next iteration.
  "/api/worksheets/circulations/[circulationId]/aggregate": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/aggregate belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations/[circulationId]/close": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/close belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations/[circulationId]/export": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/export belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations/[circulationId]/notify-copy-edited": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/notify-copy-edited belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations/[circulationId]/responses/[uid]/return": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/responses/[uid]/return belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations/[circulationId]/responses/[uid]/unfreeze": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/responses/[uid]/unfreeze belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations": {
    reason:
      "Worksheet engine: /api/worksheets/circulations belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations/[circulationId]/recipients": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/recipients belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations/[circulationId]/submit": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/submit belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/circulations/[circulationId]/upload": {
    reason:
      "Worksheet engine: /api/worksheets/circulations/[circulationId]/upload belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/recipients": {
    reason:
      "Worksheet engine: /api/worksheets/recipients belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/worksheets/[worksheetId]": {
    reason:
      "Worksheet engine: /api/worksheets/[worksheetId] belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/(app)/worksheets/(author)": {
    reason:
      "Worksheet engine: /(app)/worksheets/(author) belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/(app)/worksheets/(author)/[worksheetId]": {
    reason:
      "Worksheet engine: /(app)/worksheets/(author)/[worksheetId] belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/(app)/worksheets/(author)/[worksheetId]/circulations/[circulationId]": {
    reason:
      "Worksheet engine: /(app)/worksheets/(author)/[worksheetId]/circulations/[circulationId] belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/(app)/worksheets/respond/[circulationId]": {
    reason:
      "Worksheet engine: /(app)/worksheets/respond/[circulationId] belongs to a parallel build that is still landing on dev, so its shape is not yet stable enough to pin.",
    coverWhen:
      "When the worksheet engine has landed in full and its first circulation has gone to real committee members.",
  },
  "/api/account/delete": {
    reason:
      "Account deletion is irreversible and its sweep is pinned by three unit suites over a fake database.",
    coverWhen:
      "When account deletion is offered to members rather than run by hand, because a missed row is then somebody's data left behind.",
  },
  "/api/admin/application-emails/[templateId]/send-test": {
    reason:
      "Email rendering: /api/admin/application-emails/[templateId]/send-test renders a template for a person who is looking at the result, so a bad render is seen the moment it happens.",
    coverWhen:
      "When a template's copy is generated rather than written, so nobody reads it before it sends.",
  },
  "/api/admin/application-emails/preview": {
    reason:
      "Email rendering: /api/admin/application-emails/preview renders a template for a person who is looking at the result, so a bad render is seen the moment it happens.",
    coverWhen:
      "When a template's copy is generated rather than written, so nobody reads it before it sends.",
  },
  "/api/admin/backfill-subscriptions": {
    reason:
      "Admin CRUD: /api/admin/backfill-subscriptions answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/collaborators/verification": {
    reason:
      "Admin CRUD: /api/admin/collaborators/verification answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/config/task-emails": {
    reason:
      "Admin CRUD: /api/admin/config/task-emails answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/course-emails/[templateId]/send-test": {
    reason:
      "Email rendering: /api/admin/course-emails/[templateId]/send-test renders a template for a person who is looking at the result, so a bad render is seen the moment it happens.",
    coverWhen:
      "When a template's copy is generated rather than written, so nobody reads it before it sends.",
  },
  "/api/admin/course-emails/preview": {
    reason:
      "Email rendering: /api/admin/course-emails/preview renders a template for a person who is looking at the result, so a bad render is seen the moment it happens.",
    coverWhen:
      "When a template's copy is generated rather than written, so nobody reads it before it sends.",
  },
  "/api/admin/courses-config": {
    reason:
      "Admin CRUD: /api/admin/courses-config answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/deliverability/exports": {
    reason:
      "Admin CRUD: /api/admin/deliverability/exports answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/deliverability/sends": {
    reason:
      "Admin CRUD: /api/admin/deliverability/sends answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/deliverability/suppressed": {
    reason:
      "Admin CRUD: /api/admin/deliverability/suppressed answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/deliverability/suppressed/[docId]": {
    reason:
      "Admin CRUD: /api/admin/deliverability/suppressed/[docId] answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/impersonate": {
    reason:
      "View as: /api/admin/impersonate mints a custom token for another member's account, so driving it would act as that member.",
    coverWhen:
      "When impersonation can be driven on a project of its own rather than a shared one.",
  },
  "/api/admin/impersonate/exit": {
    reason:
      "View as: /api/admin/impersonate/exit ends a view-as session, which exists only once /api/admin/impersonate has started one as another member.",
    coverWhen:
      "When impersonation can be driven on a project of its own rather than a shared one.",
  },
  "/api/admin/members/[uid]/conduct-flag": {
    reason:
      "Admin CRUD: /api/admin/members/[uid]/conduct-flag answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/membership/export": {
    reason:
      "Membership: the column matching behind /api/admin/membership/export is a guess until a real Students' Union export exists to match against.",
    coverWhen:
      "When a real SU export is in hand and can be checked in as a fixture.",
  },
  "/api/admin/membership/import": {
    reason:
      "Membership: the column matching behind /api/admin/membership/import is a guess until a real Students' Union export exists to match against.",
    coverWhen:
      "When a real SU export is in hand and can be checked in as a fixture.",
  },
  "/api/admin/membership/import/[batchId]/abandon": {
    reason:
      "Membership: the column matching behind /api/admin/membership/import/[batchId]/abandon is a guess until a real Students' Union export exists to match against.",
    coverWhen:
      "When a real SU export is in hand and can be checked in as a fixture.",
  },
  "/api/admin/membership/import/[batchId]/commit": {
    reason:
      "Membership: the column matching behind /api/admin/membership/import/[batchId]/commit is a guess until a real Students' Union export exists to match against.",
    coverWhen:
      "When a real SU export is in hand and can be checked in as a fixture.",
  },
  "/api/admin/membership/periods/[periodId]": {
    reason:
      "Membership: /api/admin/membership/periods/[periodId] is an admin action whose result lands on the console that called it.",
    coverWhen:
      "When a period is recounted for a real cohort, because the number it prints is the one the Students' Union is given.",
  },
  "/api/admin/membership/periods/[periodId]/recount": {
    reason:
      "Membership: /api/admin/membership/periods/[periodId]/recount is an admin action whose result lands on the console that called it.",
    coverWhen:
      "When a period is recounted for a real cohort, because the number it prints is the one the Students' Union is given.",
  },
  "/api/admin/migrate-notifications": {
    reason:
      "Admin CRUD: /api/admin/migrate-notifications answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/registrations": {
    reason:
      "Admin CRUD: /api/admin/registrations answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/registrations/[uid]": {
    reason:
      "Admin CRUD: /api/admin/registrations/[uid] answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/registrations/summary": {
    reason:
      "Admin CRUD: /api/admin/registrations/summary answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/scheduler": {
    reason:
      "Scheduler: /api/admin/scheduler is executed against a fake database in tests/scheduler.test.mjs, which reaches branches a browser run cannot schedule.",
    coverWhen:
      "When a marker or cursor change has to be proven against real Firestore rather than the fake.",
  },
  "/api/admin/scheduler/config": {
    reason:
      "Scheduler: /api/admin/scheduler/config is executed against a fake database in tests/scheduler.test.mjs, which reaches branches a browser run cannot schedule.",
    coverWhen:
      "When a marker or cursor change has to be proven against real Firestore rather than the fake.",
  },
  "/api/admin/scheduler/run": {
    reason:
      "Scheduler: /api/admin/scheduler/run is executed against a fake database in tests/scheduler.test.mjs, which reaches branches a browser run cannot schedule.",
    coverWhen:
      "When a marker or cursor change has to be proven against real Firestore rather than the fake.",
  },
  "/api/admin/site-notice": {
    reason:
      "Admin CRUD: /api/admin/site-notice answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/subscriptions/[id]": {
    reason:
      "Admin CRUD: /api/admin/subscriptions/[id] answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/subscriptions/[id]/set-status": {
    reason:
      "Admin CRUD: /api/admin/subscriptions/[id]/set-status answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admin/test-email": {
    reason:
      "Email rendering: /api/admin/test-email renders a template for a person who is looking at the result, so a bad render is seen the moment it happens.",
    coverWhen:
      "When a template's copy is generated rather than written, so nobody reads it before it sends.",
  },
  "/api/admin/users/[uid]": {
    reason:
      "Admin CRUD: /api/admin/users/[uid] answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/admissions/applications/me": {
    reason:
      "/api/admissions/applications/me answers the signed-in applicant with their own applications, and a wrong answer is visible on the status hub that renders it.",
    coverWhen:
      "When the first round publishes its decisions, because this is the screen an applicant refreshes.",
  },
  "/api/admissions/forms": {
    reason:
      "Application forms: /api/admissions/forms is pressed by an admin who reads the outcome on the screen in front of them, and tests/applications-editor-routes.test.mjs executes it as every kind of caller.",
    coverWhen:
      "When the first application form is opened to applicants, because from then on what an admin saves here is what real people are asked.",
  },
  "/api/admissions/forms/[roundId]": {
    reason:
      "Application forms: /api/admissions/forms/[roundId] is pressed by an admin who reads the outcome on the screen in front of them, and tests/applications-editor-routes.test.mjs executes it as every kind of caller.",
    coverWhen:
      "When the first application form is opened to applicants, because from then on what an admin saves here is what real people are asked.",
  },
  "/api/admissions/forms/[roundId]/application": {
    reason:
      "The new application form's read and draft save. Both are executed against an in-memory store by tests/applications-apply-routes.test.mjs (gate, hidden forms, window, the first save, the counters), and the form that calls them has been driven by hand at 390 and 1440, but no browser spec drives it yet.",
    coverWhen:
      "Before the new form opens to applicants (the spring intake): an applicant spec that fills the form in, leaves it, comes back and sends it.",
  },
  "/api/admissions/forms/[roundId]/application/access-requirements": {
    reason:
      "The applicant's own access-requirements answer on the new application form. Both handlers are executed against an in-memory store by tests/applications-d2-zeta-access-requirements.test.mjs (the gate, view-as, hidden forms, the window, the limit, no row without an application, the application left untouched), and the box that calls them has been driven by hand at 390 and 1440, but no browser spec drives it yet.",
    coverWhen:
      "With the applicant spec for the new form: it types in the box on the last step, leaves, comes back and finds it there.",
  },
  "/api/admissions/forms/[roundId]/application/availability": {
    reason:
      "Changing when you're free from the application page until groups go out (Q7). Executed by tests/course-hub-when-free.test.mjs as every kind of caller (who may, the week written, the version kept, the board and the times picture reading it, the page's card), with no browser spec yet.",
    coverWhen:
      "When a browser spec signs in as somebody holding a place before Publish, changes their week on the application page, and the allocation board's fit marks follow it.",
  },
  "/api/admissions/forms/[roundId]/application/send": {
    reason:
      "The new application form's send. Executed by tests/applications-apply-routes.test.mjs (issues refused, the two copies, the counters, sending again, the version a send replaces), with no browser spec yet.",
    coverWhen:
      "With the spec above: the send is the last step of the same journey.",
  },
  // The application form's review screens. The loaders and writers behind
  // every one of these are executed offline by
  // tests/applications-review-routes.test.mjs against an in-memory database.
  "/(app)/admin/admissions/forms/[roundId]/intake": {
    reason:
      "An admin's page for planning the whole intake. Its first plan is the site's own draft and sends nothing; the routes it calls are executed by tests/applications-intake-plan.test.mjs and the draft by tests/applications-intake-match.test.mjs.",
    coverWhen:
      "With the assessment route's spec, once the harness can stand in for Anthropic and Pangram: a term with reviews, Read everyone, Plan with Claude, then Apply through the decision route.",
  },
  "/api/admissions/forms/[roundId]/intake": {
    reason:
      "An admin's plan of the whole intake, with Claude's changes and facilitator lists. It writes nothing; who may ask, what Claude is sent and what is kept of its advice are executed by tests/applications-intake-plan.test.mjs.",
    coverWhen:
      "With the intake page's spec above, once the harness can stand in for Anthropic.",
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/placement": {
    reason:
      "One person's placement: who may, what a pick writes through the decision route, and that it is recorded as the admin's, are executed by tests/applications-intake-plan.test.mjs.",
    coverWhen:
      "With the intake page's spec: a term with decisions, a pick on the Placement box beside an application, then the programme lists agree.",
  },
  "/api/admissions/forms/[roundId]/intake/fill": {
    reason:
      "The one-button fill: that it places only people nobody has placed and never overrides are executed by tests/applications-intake-plan.test.mjs.",
    coverWhen: "With the intake page's spec above.",
  },
  "/api/admissions/forms/[roundId]/intake/clear": {
    reason:
      "Deletes every stored read on a form. Who may, the confirm in the body, and that only that form's assessments go are executed by tests/applications-intake-plan.test.mjs.",
    coverWhen:
      "With the intake page's spec above: Clear all reads after Read everyone, then the reads are gone.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/arrangement": {
    reason:
      "An admin's proposed arrangement into groups, with Claude's facilitators and moves. It writes nothing; the plan and the checks on Claude's advice are executed by tests/applications-arrange-plan.test.mjs and tests/applications-arrange-advice.test.mjs.",
    coverWhen:
      "With the assessment route's spec, once the harness can stand in for Anthropic: a course hub world after the hand-over, Suggest, then Apply through the site's own routes.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/circles": {
    reason:
      "Circles reading the run's groups again after a change. It writes nothing; who may read it, who is on the screen and that a second Apply sends nothing are executed by tests/applications-circles.test.mjs.",
    coverWhen: "With a course hub spec after the hand-over: open Circles, move one person, see them in the new ring.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/assessments": {
    reason:
      "The Claude and Pangram marks on a programme's list, and Claude's comparison of its applications or a question about them. The gate, the labels sent and the names put back are executed by tests/applications-assessment.test.mjs; a browser spec waits on the same fake as the assessment route.",
    coverWhen:
      "With the assessment route's spec: the admin's list shows the mark the fake left, and a lead's list has no Claude column.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/applications": {
    reason:
      "Application review: the list and the bulk decision behind this route are executed by tests/applications-review-routes.test.mjs, and no end-to-end fixture seeds an application form with sent applications yet.",
    coverWhen:
      "When the end-to-end fixtures can seed an application form, which the first spec for the new applicant form needs before applications open on it.",
  },
  "/api/admissions/forms/[roundId]/applications/[uid]": {
    reason:
      "Application review: the one-application read behind this route, with its blind first review and its admin-only addresses, is executed by tests/applications-review-routes.test.mjs, and no end-to-end fixture seeds an application form yet.",
    coverWhen:
      "When the end-to-end fixtures can seed an application form, which the first spec for the new applicant form needs before applications open on it.",
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/review": {
    reason:
      "Application review: saving a reviewer's own scores and comments is executed by tests/applications-review-routes.test.mjs, and no end-to-end fixture seeds an application form or a named reviewer yet.",
    coverWhen:
      "When the end-to-end fixtures can seed an application form and name a reviewer on a programme, ahead of the first term reviewed on these screens.",
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/access-requirements": {
    reason:
      "An admin opening one applicant's access-requirements answer. Executed against an in-memory store by tests/applications-d2-zeta-access-requirements.test.mjs (every kind of account refused before anything is read, one log line for each open, an unsent draft not found), with no browser spec yet.",
    coverWhen:
      "With the review spec for the new form: an admin presses the button on one application and the log line is read back; a lead opens the same application and has no button.",
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/assessment": {
    reason:
      "An admin asking Claude and Pangram about one application calls two outside services that a browser spec must not spend money on or send fixture text to. The gate, what is sent and what is kept are executed by tests/applications-assessment.test.mjs.",
    coverWhen:
      "When the end-to-end harness can stand in for Anthropic and Pangram with a local fake, so an admin can press the button and read the stored read back.",
  },
  "/api/admissions/forms/[roundId]/applications/[uid]/decision": {
    reason:
      "Application review: a lead's decision and an admin's revocation are executed by tests/applications-review-routes.test.mjs, which also holds that neither touches the applicant's own document, and no end-to-end fixture seeds a programme lead yet.",
    coverWhen:
      "When the end-to-end fixtures can seed an application form and name a lead on a programme, ahead of the first term decided on these screens.",
  },
  "/api/admissions/forms/[roundId]/review-settings": {
    reason:
      "Application review: the admin's switch is one boolean on the form, executed by tests/applications-review-routes.test.mjs with what it changes for every reviewer.",
    coverWhen:
      "When the end-to-end fixtures can seed an application form with two reviewers' scores, so a spec can watch the switch change what the second one is shown.",
  },
  "/api/admissions/forms/[roundId]/pool": {
    reason:
      "Application system: /api/admissions/forms/[roundId]/pool is pressed by an admin picking what pooled applicants hear, who reads the result on the page it redraws; the writer and its gate are executed by tests/applications-decision-day-pool.test.mjs.",
    coverWhen:
      "When the first application form has closed on dev and a whole decision day is rehearsed there, because that rehearsal is the journey a spec would drive.",
  },
  "/api/admissions/forms/[roundId]/pool/note": {
    reason:
      "The personal note in a pooled applicant's invitation: who may save or draft one, that only a save reaches the email, what Claude is sent and that its draft is kept apart are executed by tests/applications-invite-notes.test.mjs.",
    coverWhen:
      "With the pooled applicants route above, when a whole decision day is rehearsed on dev and the harness can stand in for Anthropic.",
  },
  "/api/admissions/forms/[roundId]/send": {
    reason:
      "Application system: /api/admissions/forms/[roundId]/send publishes a term's outcomes and emails every applicant, so it must never be automated against a database other people are using; the send is executed by tests/applications-decision-day-send.test.mjs.",
    coverWhen:
      "When the first application form has closed on dev and a whole decision day is rehearsed there, because that rehearsal is the journey a spec would drive.",
  },
  "/api/admissions/forms/[roundId]/send/test": {
    reason:
      "Application system: /api/admissions/forms/[roundId]/send/test mails one decision-day email to the admin who asked, and the admin reads the result in their own inbox; the route is executed by tests/applications-decision-day-send.test.mjs.",
    coverWhen:
      "When the first application form has closed on dev and a whole decision day is rehearsed there, because that rehearsal is the journey a spec would drive.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/test-email": {
    reason:
      "Application system: /api/admissions/forms/[roundId]/programmes/[programmeId]/test-email mails one of a programme's decision emails to whoever asked, and they read the result in their own inbox; the route and its gate are executed as every kind of caller by tests/applications-decision-day-send.test.mjs.",
    coverWhen:
      "When the first application form has closed on dev and a whole decision day is rehearsed there, because that rehearsal is the journey a spec would drive.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]": {
    reason:
      "Application forms: /api/admissions/forms/[roundId]/programmes/[programmeId] is pressed by a programme's lead or an admin who reads the outcome on the screen in front of them, and tests/applications-editor-routes.test.mjs executes it as every kind of caller.",
    coverWhen:
      "When the first application form is opened to applicants, because from then on what a lead saves here is what real people are shown.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places": {
    reason:
      "Application forms: /api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places is pressed by an admin after decision day and answered on the page that called it; tests/applications-freed-places-offer.test.mjs executes it as every kind of caller across the window's edges, and tests/applications-freed-places-journey.test.mjs takes an accepted offer through Hand over, a placement and Publish.",
    coverWhen:
      "Before the first freed place is offered on the live site, alongside a spec for the hand-over and the allocation board, because that is the first time a changed outcome reaches a real person.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places/test": {
    reason:
      "Application forms: /api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places/test sends a test only to the address on the admin's own session; tests/applications-freed-places-offer.test.mjs executes it and the lock it unlocks.",
    coverWhen:
      "With the spec for the press above, because the test is the press's first step.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/ask": {
    reason:
      "Course hub: asking one person to facilitate one group, pressed by a programme's lead or an admin on the Groups tab's Facilitators view (board st-facilitators). tests/course-hub-facilitator-asks.test.mjs executes it as every kind of caller, with the email it sends read word for word and counted against the button.",
    coverWhen:
      "When the end-to-end fixtures can seed a term after decision day whose form asked about facilitating, with somebody who said yes, and its programme's lead signed in.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/ask/test": {
    reason:
      "Course hub: the test of the ask's email, sent only to the address on the session of whoever asks; tests/course-hub-facilitator-asks.test.mjs executes it and the lock it unlocks.",
    coverWhen: "With the spec for the ask above, because the test is the ask's first step.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/case/draft": {
    reason:
      "Course hub: Draft with Claude beside the sentence that makes the case, an admin's, on the Groups tab's Facilitators view. tests/course-hub-facilitator-case-draft.test.mjs executes it as every kind of caller with Claude stubbed, and holds what Claude is sent and that nothing is stored.",
    coverWhen:
      "Never against a live model: an end-to-end run would send a real application to Anthropic. With a stubbed model, when the fixtures can seed a term after decision day with somebody who did not offer.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/remind": {
    reason:
      "Course hub: Remind on an ask nobody has answered, emailing only that person; tests/course-hub-facilitator-asks.test.mjs executes it as every kind of caller and holds its limits.",
    coverWhen: "With the spec for the ask above.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/training": {
    reason:
      "Course hub: the facilitators' training, a setting of the run on a programme's Settings tab; tests/course-hub-facilitator-asks.test.mjs executes it as every kind of caller, and what the email and the answer page then say.",
    coverWhen: "With the spec for the ask above, which sets the training before it asks.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups": {
    reason:
      "Course hub: Add a group, on a programme's Groups tab's Times view. tests/course-hub-times-actions.test.mjs executes it as every kind of caller, before Publish and after, and draws its dialog from the setup the page hands it.",
    coverWhen:
      "When a browser spec signs in as a programme's lead and adds a group from the Times view.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/room": {
    reason:
      "Course hub: a group's weekly room, beside its campus on Circles and the Sessions view. tests/course-group-room-field.test.mjs executes it as every kind of caller, with what it writes and what it leaves alone.",
    coverWhen: "When the groups-go-out spec sets a group's room on the Sessions view before it presses Publish.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/campus": {
    reason:
      "Course hub: a group's campus, from the Sessions view of a programme's Groups tab. tests/course-hub-time-answer.test.mjs executes it as every kind of caller, before Publish and after, with the board's columns carrying it.",
    coverWhen: "When the groups-go-out spec sets a group's campus on the Sessions view before it presses Publish.",
  },
  "/api/courses/runs/[runId]/time-answer": {
    reason:
      "Course hub: a person's answer to Can you make this time? on their programme page. tests/course-hub-time-answer.test.mjs executes it as every kind of caller, with the card it is pressed from, every move that clears it and who reads it.",
    coverWhen: "When a browser spec signs in as somebody Publish has told their group and answers the card on their programme page.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/time": {
    reason:
      "Course hub: a group's day and start, from Change and Use for a group on a programme's Times view. tests/course-hub-times-actions.test.mjs executes it as every kind of caller, before Publish has told anybody and after, with a press of Publish landing between its read and its write.",
    coverWhen:
      "When the groups-go-out spec changes a group's time on the Times view before it presses Publish.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/when-free/remind": {
    reason:
      "Course hub: Remind on the Overview's card of who has not said when they are free; tests/course-hub-get-ready.test.mjs executes it as every kind of caller, with the count it must match, once a person a day, and a failed send given back.",
    coverWhen:
      "When the end-to-end fixtures can seed a fellowship whose people sent the form with no week painted, with its lead signed in and the suite's mail catcher reading the reminder.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/roles": {
    reason:
      "Application forms: /api/admissions/forms/[roundId]/programmes/[programmeId]/roles is pressed by a programme's lead or an admin, and tests/applications-editor-routes.test.mjs and tests/applications-access.test.mjs execute who may name whom.",
    coverWhen:
      "When a programme is first run with a reviewer who is not its lead, so a grant made here is used by somebody other than the person who made it.",
  },
  "/api/admissions/forms/[roundId]/sets": {
    reason:
      "Application forms: /api/admissions/forms/[roundId]/sets is pressed by an admin who reads the outcome on the screen in front of them, and tests/applications-editor-routes.test.mjs executes it as every kind of caller.",
    coverWhen:
      "When the first application form is opened to applicants, because from then on what an admin saves here is what real people are asked.",
  },
  "/api/admissions/forms/[roundId]/sets/[setId]": {
    reason:
      "Application forms: /api/admissions/forms/[roundId]/sets/[setId] is pressed by an admin who reads the outcome on the screen in front of them, and tests/applications-editor-routes.test.mjs executes it as every kind of caller, the lock included.",
    coverWhen:
      "When the first application form is opened to applicants, because from then on what an admin saves here is what real people are asked.",
  },
  "/api/admissions/forms/[roundId]/status": {
    reason:
      "The application form's lifecycle: every move, every refusal and the readiness list behind this route are executed by tests/applications-wave-e1-status-route.test.mjs against an in-memory database, and no end-to-end fixture seeds an application form yet.",
    coverWhen:
      "When the end-to-end fixtures can seed an application form, which the first spec for the new applicant form needs: that spec has to open a form before anybody can apply to it.",
  },
  "/api/admissions/rounds/[roundId]/apply/stage/[stageId]": {
    reason:
      "Admissions: /api/admissions/rounds/[roundId]/apply/stage/[stageId] is pressed by a reviewer or an admin who reads the outcome on the console.",
    coverWhen:
      "When a round runs with a reviewer other than the admin who runs it, so a release lands on somebody else's screen before anybody has read it.",
  },
  "/api/admissions/rounds/[roundId]/reminders/send-now": {
    reason:
      "Admissions: /api/admissions/rounds/[roundId]/reminders/send-now is pressed by a reviewer or an admin who reads the outcome on the console.",
    coverWhen:
      "When a round runs with a reviewer other than the admin who runs it, so a release lands on somebody else's screen before anybody has read it.",
  },
  "/api/admissions/rounds/[roundId]/stages": {
    reason:
      "Admissions: /api/admissions/rounds/[roundId]/stages is pressed by a reviewer or an admin who reads the outcome on the console.",
    coverWhen:
      "When a round runs with a reviewer other than the admin who runs it, so a release lands on somebody else's screen before anybody has read it.",
  },
  "/api/admissions/rounds/[roundId]/stages/[stageId]/release": {
    reason:
      "Admissions: /api/admissions/rounds/[roundId]/stages/[stageId]/release is pressed by a reviewer or an admin who reads the outcome on the console.",
    coverWhen:
      "When a round runs with a reviewer other than the admin who runs it, so a release lands on somebody else's screen before anybody has read it.",
  },
  "/api/auth/google/callback": {
    reason:
      "Google sign-in is not automatable by design: GIS refuses the interception a script would need, as src/auth/signInWithGoogle.ts documents.",
    coverWhen:
      "Never automated: keep Google sign-in on the manual smoke pass before every dev to main merge.",
  },
  "/api/auth/session/clear": {
    reason:
      "The clear route drops a stale cookie for a session the client can no longer repair, a branch a healthy run never reaches.",
    coverWhen:
      "When a member reports a stuck session again, which is the symptom this route exists to clear.",
  },
  "/api/collaborators": {
    reason:
      "Admin CRUD: /api/collaborators answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/collaborators/[id]": {
    reason:
      "Admin CRUD: /api/collaborators/[id] answers one admin's deliberate press, and its failure lands on that admin's own screen.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/api/courses/[courseId]/crest": {
    reason:
      "Courses: /api/courses/[courseId]/crest is admin-only, sets one mark beside a course's name, and is answered on the screen that called it.",
    coverWhen:
      "When a programme's crest is first changed while its members are on the run, because a wrong mark is then seen by people who did not choose it.",
  },
  "/api/courses/[courseId]/destroy": {
    reason:
      "Destroy protocol: /api/courses/[courseId]/destroy removes a whole course or run, and must never be automated against a database other people are using.",
    coverWhen:
      "Never automated here: cover it by hand against the written destroy checklist before an archive.",
  },
  "/api/courses/[courseId]/destroy-manifest": {
    reason:
      "Destroy protocol: /api/courses/[courseId]/destroy-manifest removes a whole course or run, and must never be automated against a database other people are using.",
    coverWhen:
      "Never automated here: cover it by hand against the written destroy checklist before an archive.",
  },
  "/api/courses/[courseId]/facilitator-guide": {
    reason:
      "Facilitator guide: /api/courses/[courseId]/facilitator-guide lists a course's facilitator guide by its titles for a facilitator's Home, and every answer it gives is driven as each kind of caller in tests/course-facilitator-guide.test.mjs.",
    coverWhen:
      "When a browser spec signs in as a group's facilitator, because Home's link is the only way a facilitator meets this route.",
  },
  "/api/courses/[courseId]/facilitator-guide/[slot]": {
    reason:
      "Course hub: /api/courses/[courseId]/facilitator-guide/[slot] loads a course's facilitator guide for admins and the lead of a programme naming a live run of it (the Weeks tab's guide box), and every answer it gives is driven as each kind of caller in tests/course-facilitator-guide.test.mjs and, as the lead, in tests/course-hub-weeks-tab-week.test.mjs.",
    coverWhen:
      "When a browser spec signs in as a programme's lead and loads a week's session plan from the Weeks tab, because a mistake then reaches a run's facilitators before an admin sees it.",
  },
  "/api/courses/[courseId]/facilitator-guide/printables/pdf": {
    reason:
      "Facilitator guide: /api/courses/[courseId]/facilitator-guide/printables/pdf draws a course's printables as an A4 PDF on request for the guide's readers, and every answer it gives (the PDF, the calm sentence, the way to sign in, the sentences for a session the course does not have) is driven as each kind of caller in tests/course-facilitator-guide-printables.test.mjs, which also holds its bytes to the renderer's.",
    coverWhen:
      "When a browser spec signs in as a group's facilitator and presses a download on the Printables page, because a file the browser saves is the one thing a server-side test never sees arrive.",
  },
  "/api/courses/[courseId]/page": {
    reason:
      "Courses: /api/courses/[courseId]/page is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/[courseId]/page/generate-themes": {
    reason:
      "Courses: /api/courses/[courseId]/page/generate-themes is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/[courseId]/publish": {
    reason:
      "Courses: /api/courses/[courseId]/publish is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/[courseId]/rubric": {
    reason:
      "Course authoring: an admin sets a course's rubric for written answers by pasting or typing its table; every answer it gives is driven as each kind of caller in tests/course-hub-written-answers.test.mjs.",
    coverWhen:
      "When a browser spec pastes a rubric into a course's details and gives feedback by it on the review page.",
  },
  "/api/courses/[courseId]/routes": {
    reason:
      "Course authoring: /api/courses/[courseId]/routes sets a course's routes and deadlines, an admin's job, answered on the course page's card that called it; reading, saving, taking off and every refusal are driven as each kind of caller in tests/course-routes-and-deadlines.test.mjs.",
    coverWhen:
      "When a lead or a facilitator can change a course's routes, or a browser spec loads week 6 of a run whose course has them, because a mistake then reaches a run's people before an admin sees it.",
  },
  "/api/courses/[courseId]/predictions": {
    reason:
      "Course authoring: /api/courses/[courseId]/predictions sets a course's sealed predictions card, an admin's job, answered on the course page's card that called it; reading, saving, taking off and every refusal are driven as each kind of caller in tests/course-hub-sealed-predictions.test.mjs.",
    coverWhen:
      "When a browser spec pastes a card into a course's details and a member then fills it in on week 1, because a mistake then reaches a run's people before an admin sees it.",
  },
  "/api/courses/[courseId]/templates": {
    reason:
      "Courses: /api/courses/[courseId]/templates is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/calendar": {
    reason:
      "Course hub: a person's own calendar link (st-calendar-phone), made on their first ask, the same after, and replaced on request; tests/course-hub-calendar-link.test.mjs executes the handler as every kind of caller, its four targets, replacing and deletion with the account.",
    coverWhen:
      "When the end-to-end fixtures can seed a run Publish has told, with a member signed in to open Add to calendar on their programme page.",
  },
  "/api/courses/calendar/[token]/sessions.ics": {
    reason:
      "Course hub: the calendar a person's link fills, fetched with no session; tests/course-hub-calendar-feed.test.mjs fetches it for every kind of person and every change to a session, reads it as strictly as RFC 5545 asks, and finds no meeting link, address or other group in it.",
    coverWhen:
      "When the end-to-end fixtures can seed a run Publish has told, and a spec can fetch the link a member's dialog shows.",
  },
  "/api/courses/exercise-responses/[responseId]/review": {
    reason:
      "Learn hub: /api/courses/exercise-responses/[responseId]/review belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/groups/[groupId]/email": {
    reason:
      "Courses: /api/courses/groups/[groupId]/email is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/groups/[groupId]/exercises": {
    reason:
      "Learn hub: /api/courses/groups/[groupId]/exercises belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/groups/[groupId]/notice": {
    reason:
      "Courses: /api/courses/groups/[groupId]/notice is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/groups/[groupId]/pace": {
    reason:
      "Courses: /api/courses/groups/[groupId]/pace is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/groups/[groupId]/session": {
    reason:
      "Courses: /api/courses/groups/[groupId]/session is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]": {
    reason:
      "Learn hub: /api/courses/groups/[groupId]/weeks/[weekId] belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]/blocks": {
    reason:
      "Course hub: a week for one group by Markdown round trip (Q39), for admins and the programme's lead on any group of the run and a group's facilitators on their own; every caller, the copy made through templateWeekFields with its ids kept, the count of the group's answers and that no other week is written are executed by tests/course-hub-weeks-tab-groups.test.mjs.",
    coverWhen:
      "When a browser spec signs in as a group's facilitator, changes a week for their group, and a member of that group and one of another group each open it.",
  },
  "/api/courses/groups/[groupId]/weeks/[weekId]/fork": {
    reason:
      "Learn hub: /api/courses/groups/[groupId]/weeks/[weekId]/fork belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/progress/[progressId]/moderate": {
    reason:
      "Learn hub: /api/courses/progress/[progressId]/moderate belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/runs/[runId]/applications": {
    reason:
      "Courses: /api/courses/runs/[runId]/applications is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/applications/[uid]/decide": {
    reason:
      "Courses: /api/courses/runs/[runId]/applications/[uid]/decide is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/applications/[uid]/notes": {
    reason:
      "Courses: /api/courses/runs/[runId]/applications/[uid]/notes is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/apply": {
    reason:
      "Courses: /api/courses/runs/[runId]/apply is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/apply-template": {
    reason:
      "Courses: /api/courses/runs/[runId]/apply-template is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/archive": {
    reason:
      "Courses: /api/courses/runs/[runId]/archive is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/clone-weeks": {
    reason:
      "Learn hub: /api/courses/runs/[runId]/clone-weeks belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/runs/[runId]/comments": {
    reason:
      "Courses: /api/courses/runs/[runId]/comments is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/destroy": {
    reason:
      "Destroy protocol: /api/courses/runs/[runId]/destroy removes a whole course or run, and must never be automated against a database other people are using.",
    coverWhen:
      "Never automated here: cover it by hand against the written destroy checklist before an archive.",
  },
  "/api/courses/runs/[runId]/destroy-manifest": {
    reason:
      "Destroy protocol: /api/courses/runs/[runId]/destroy-manifest removes a whole course or run, and must never be automated against a database other people are using.",
    coverWhen:
      "Never automated here: cover it by hand against the written destroy checklist before an archive.",
  },
  "/api/worksheets/circulations/[circulationId]/destroy": {
    reason:
      "Destroy protocol: /api/worksheets/circulations/[circulationId]/destroy removes a whole circulation with everything under it, and must never be automated against a database other people are using.",
    coverWhen:
      "Never automated here: cover it by hand against the written destroy checklist before an archive.",
  },
  "/api/worksheets/circulations/[circulationId]/destroy-manifest": {
    reason:
      "Destroy protocol: /api/worksheets/circulations/[circulationId]/destroy-manifest removes a whole circulation with everything under it, and must never be automated against a database other people are using.",
    coverWhen:
      "Never automated here: cover it by hand against the written destroy checklist before an archive.",
  },
  "/api/admissions/rounds/[roundId]/destroy": {
    reason:
      "Destroy protocol: /api/admissions/rounds/[roundId]/destroy removes a whole admission round with its applications and reviews, and must never be automated against a database other people are using.",
    coverWhen:
      "Never automated here: cover it by hand against the written destroy checklist before an archive.",
  },
  "/api/admissions/rounds/[roundId]/destroy-manifest": {
    reason:
      "Destroy protocol: /api/admissions/rounds/[roundId]/destroy-manifest removes a whole admission round with its applications and reviews, and must never be automated against a database other people are using.",
    coverWhen:
      "Never automated here: cover it by hand against the written destroy checklist before an archive.",
  },
  "/api/courses/runs/[runId]/email": {
    reason:
      "Courses: /api/courses/runs/[runId]/email is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/enrol-mode": {
    reason:
      "Courses: /api/courses/runs/[runId]/enrol-mode is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/enrolments/[uid]/reinstate": {
    reason:
      "Courses: /api/courses/runs/[runId]/enrolments/[uid]/reinstate is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/exercises/[exerciseId]/submit": {
    reason:
      "Learn hub: /api/courses/runs/[runId]/exercises/[exerciseId]/submit belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/runs/[runId]/allocation/publish/notes": {
    reason:
      "Course hub: the read and the writes behind Outside the times they gave on Publish's own page; tests/course-publish-outside-notes.test.mjs executes it as every kind of caller and holds that the lead is sent no week and no draft.",
    coverWhen: "With the spec for Publish's own page, which opens it.",
  },
  "/api/courses/runs/[runId]/allocation/publish/preview": {
    reason:
      "Course hub: the read behind Publish's own page's two emails; tests/course-hub-get-ready.test.mjs executes it as every kind of caller and holds each email it shows to be, byte for byte, the one the press then sends.",
    coverWhen:
      "With the spec above for Publish's own page, which opens it.",
  },
  "/api/courses/runs/[runId]/facilitators/asking": {
    reason:
      "Course hub: the read behind the Groups tab's Facilitators view. tests/course-hub-facilitator-asks.test.mjs executes it as every kind of caller and holds that it carries no address; the groups-go-out spec opens the view, and so this read, but does not yet list it among what it covers.",
    coverWhen:
      "When the groups-go-out spec, or the spec for the ask above, lists it among what it covers after a run that passed in CI.",
  },
  "/api/courses/facilitator-asks/[askId]/answer": {
    reason:
      "Course hub: the yes or no of the person asked to facilitate, on their own page (board st-fac-ask-phone). tests/course-hub-facilitator-asks.test.mjs executes it as every kind of caller, yes appointing them through the group's own appointment code and a late answer refused.",
    coverWhen:
      "With the spec for the ask above: the person asked signs in, opens the page from the email and says yes.",
  },
  "/api/courses/runs/[runId]/fill-in-boxes": {
    reason:
      "Course hub: one person's fill-in boxes, read by their group's facilitators, the programme's lead and admins (Q30 C; a facilitator's own by the lead and admins); every caller is executed by tests/course-hub-week-six.test.mjs. No page reads it yet: the facilitator's and the lead's pages that will are later pieces.",
    coverWhen:
      "When the page that shows a facilitator or a lead somebody's action plan exists and a browser spec opens it.",
  },
  "/api/courses/runs/[runId]/fill-in-boxes/[boxId]": {
    reason:
      "Course hub: a fill-in box on a week written as blocks (week 6's action plan, wk-week6-phone), saved as the person types; who writes, who is refused and what a box keeps are executed by tests/course-hub-week-six.test.mjs; typed in a browser on the preview kit at 390, saved, reloaded and read back.",
    coverWhen:
      "When a browser spec signs in a member of a group Publish has told, opens week 6 written as blocks, writes in a box of the plan, reloads and reads it back.",
  },
  "/api/courses/runs/[runId]/material-notes": {
    reason:
      "Learn hub: /api/courses/runs/[runId]/material-notes belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/runs/[runId]/normalise-weeks": {
    reason:
      "Learn hub: /api/courses/runs/[runId]/normalise-weeks belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/runs/[runId]/nudge": {
    reason:
      "Courses: /api/courses/runs/[runId]/nudge is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/packs-and-cases/[blockId]": {
    reason:
      "Course hub: a person's own pick in a Choose one and their Ready for my talk (wk-week, wk-week6-phone); who writes, who is refused, the pick's lock at the session and the ready box's wait for a case are executed by tests/course-hub-packs-and-cases.test.mjs; pressed in a browser on the preview kit.",
    coverWhen:
      "When a browser spec signs in a member of a group Publish has told, picks a pack on a week page, marks a talk ready, reloads and reads both back.",
  },
  "/api/courses/runs/[runId]/predictions": {
    reason:
      "Course hub: a person's own sealed predictions card, saved as they type, sealed in week 1 and opened in week 6; who writes, who is refused, the seal, the shut weeks and the opening are executed by tests/course-hub-sealed-predictions.test.mjs through the routes and the week page's shell; pressed in a browser on the preview kit.",
    coverWhen:
      "When a browser spec signs in a member of a group Publish has told, fills in and seals the card on week 1, moves the clock past the group's week 5 session and opens it on week 6.",
  },
  "/api/courses/runs/[runId]/predictions/people": {
    reason:
      "Course hub: an admin's list of whose predictions cards exist on a run, never an answer; every caller is executed by tests/course-hub-sealed-predictions.test.mjs.",
    coverWhen:
      "When a browser spec opens a run's page in the admin area with cards on it.",
  },
  "/api/courses/runs/[runId]/predictions/people/[uid]": {
    reason:
      "Course hub: an admin opens one person's predictions card, the opening recorded first; every caller, the order and a record that cannot be written are executed by tests/course-hub-sealed-predictions.test.mjs.",
    coverWhen:
      "When a browser spec opens a card from a run's page in the admin area and reads the record of the opening.",
  },
  "/api/courses/runs/[runId]/reflections": {
    reason:
      "Course hub: one person's reflections, read by the programme's lead and admins (Q30; a facilitator's own reflections too); every caller is executed by tests/course-hub-week-blocks-page.test.mjs. No page reads it yet: the facilitator's and the lead's pages that will are later pieces.",
    coverWhen:
      "When the page that shows a lead somebody's reflections exists and a browser spec opens it.",
  },
  "/api/courses/runs/[runId]/retrospective": {
    reason:
      "Learn hub: /api/courses/runs/[runId]/retrospective belongs to the curriculum surface being rebuilt in October.",
    coverWhen:
      "When the October curriculum rebuild lands, because a spec written against today's shape would be thrown away with it.",
  },
  "/api/courses/runs/[runId]/roles": {
    reason:
      "Courses: /api/courses/runs/[runId]/roles is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/sync-tasks": {
    reason:
      "Courses: /api/courses/runs/[runId]/sync-tasks is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/owner": {
    reason:
      "Course hub: a week's owner on the Weeks tab (pr-weeks), the programme's lead's and admins'; every caller, every refusal and what it stores are executed by tests/course-hub-weeks-tab-week.test.mjs.",
    coverWhen:
      "When a browser spec signs in as a programme's lead on the Weeks tab.",
  },
  "/api/courses/runs/[runId]/weeks/[weekId]/mode": {
    reason:
      "Course hub: In person or Online for a whole week on the Weeks tab (pr-weeks), written as the groups' own week mode; every caller, the groups it leaves alone, the link it needs and that it emails nobody are executed by tests/course-hub-weeks-tab-week.test.mjs.",
    coverWhen:
      "When a browser spec signs in as a programme's lead on the Weeks tab, holds a week online and a member of a group opens its join link on the programme page.",
  },
  "/api/courses/runs/[runId]/written-answers/[answerId]": {
    reason:
      "Course hub: a written answer on a week written as blocks, saved as the person types and sent once (wk-week, wk-week-phone); who writes, the first-sent time, the limit, the boxes and the lock are executed by tests/course-hub-written-answers.test.mjs.",
    coverWhen:
      "When a browser spec signs in a member of a group Publish has told, opens a week with a written answer, writes, sends, reloads and reads it back as sent.",
  },
  "/api/courses/runs/[runId]/written-answers/[answerId]/review": {
    reason:
      "Course hub: opening, reopening and feedback on a written answer by the rubric, with the one email that it is waiting (wk-review); every caller, the lock, Late and the email are executed by tests/course-hub-written-answers.test.mjs.",
    coverWhen:
      "When a browser spec signs in as a group's facilitator, opens a sent answer, gives feedback by the rubric, " +
        "and the member reads it on the feedback page.",
  },
  "/api/courses/templates/[templateId]": {
    reason:
      "Courses: /api/courses/templates/[templateId] is staff-facing, taken deliberately, and answered on the screen that called it.",
    coverWhen:
      "When the run that opens on 21 September is administered through these routes with real applicants in it, because a mistake then costs a member their group rather than an admin a retry.",
  },
  "/api/events/[id]/archive": {
    reason:
      "Events authoring: /api/events/[id]/archive is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/events/[id]/broadcast": {
    reason:
      "Events authoring: /api/events/[id]/broadcast is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/events/[id]/calendar.ics": {
    reason:
      "Events authoring: /api/events/[id]/calendar.ics is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/events/[id]/cancel": {
    reason:
      "Events authoring: /api/events/[id]/cancel is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/events/[id]/collaborators": {
    reason:
      "Events authoring: /api/events/[id]/collaborators is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/events/[id]/delete": {
    reason:
      "Events authoring: /api/events/[id]/delete is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/events/[id]/publish": {
    reason:
      "Events authoring: /api/events/[id]/publish is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/events/[id]/rsvp/[rsvpId]/approve": {
    reason:
      "Events RSVP: /api/events/[id]/rsvp/[rsvpId]/approve is guest-facing, and is proven today by the hand pass over the frozen mobile baseline.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/api/events/[id]/rsvp/[rsvpId]/approve-change": {
    reason:
      "Events RSVP: /api/events/[id]/rsvp/[rsvpId]/approve-change is guest-facing, and is proven today by the hand pass over the frozen mobile baseline.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/api/events/[id]/rsvp/[rsvpId]/cancel": {
    reason:
      "Events RSVP: /api/events/[id]/rsvp/[rsvpId]/cancel is guest-facing, and is proven today by the hand pass over the frozen mobile baseline.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/api/events/[id]/rsvp/[rsvpId]/deny": {
    reason:
      "Events RSVP: /api/events/[id]/rsvp/[rsvpId]/deny is guest-facing, and is proven today by the hand pass over the frozen mobile baseline.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/api/events/[id]/rsvp/[rsvpId]/deny-change": {
    reason:
      "Events RSVP: /api/events/[id]/rsvp/[rsvpId]/deny-change is guest-facing, and is proven today by the hand pass over the frozen mobile baseline.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/api/events/[id]/rsvp/[rsvpId]/request-change": {
    reason:
      "Events RSVP: /api/events/[id]/rsvp/[rsvpId]/request-change is guest-facing, and is proven today by the hand pass over the frozen mobile baseline.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/api/events/[id]/test-rsvps": {
    reason:
      "Events authoring: /api/events/[id]/test-rsvps is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/events/[id]/update": {
    reason:
      "Events authoring: /api/events/[id]/update is a deliberate committee action whose result is visible on the manage screen.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/api/kairos/export": {
    reason:
      "Surveys: the Kairos file; tests/kairos-file.test.mjs reads the file as an admin, its every refusal, the dataExports row written before it on each press, and the refusal when the row cannot be written.",
    coverWhen:
      "When an end-to-end spec downloads a file anywhere on the site, so the download path is driven in a browser once for all of them.",
  },
  "/api/members/roster": {
    reason:
      "The members roster feeds a directory that is feature-flagged off, so nothing renders from it today.",
    coverWhen:
      "When the members directory is switched back on.",
  },
  "/api/newsletter/[id]/send": {
    reason:
      "Newsletter: /api/newsletter/[id]/send is pressed by a drafter or an approver who then reads the outcome on the screen.",
    coverWhen:
      "When the first issue goes to the real list, because a mis-send cannot be recalled.",
  },
  "/api/newsletter/[id]/send-test": {
    reason:
      "Newsletter: /api/newsletter/[id]/send-test is pressed by a drafter or an approver who then reads the outcome on the screen.",
    coverWhen:
      "When the first issue goes to the real list, because a mis-send cannot be recalled.",
  },
  "/api/newsletter/preview": {
    reason:
      "Newsletter: /api/newsletter/preview is pressed by a drafter or an approver who then reads the outcome on the screen.",
    coverWhen:
      "When the first issue goes to the real list, because a mis-send cannot be recalled.",
  },
  "/api/push/subscribe": {
    reason:
      "Web push: /api/push/subscribe needs a browser permission grant and the VAPID secrets.",
    coverWhen:
      "When a spec can accept the permission prompt against a target that has VAPID secrets.",
  },
  "/api/push/test": {
    reason:
      "Web push: /api/push/test needs a browser permission grant and the VAPID secrets.",
    coverWhen:
      "When a spec can accept the permission prompt against a target that has VAPID secrets.",
  },
  "/api/push/unsubscribe": {
    reason:
      "Web push: /api/push/unsubscribe needs a browser permission grant and the VAPID secrets.",
    coverWhen:
      "When a spec can accept the permission prompt against a target that has VAPID secrets.",
  },
  "/api/q/[slug]": {
    reason:
      "Short links: /api/q/[slug] answers naisi.uk/q/<slug> with a redirect and nothing else, so there is no screen for a browser spec to assert on. tests/tracked-links.test.mjs runs the route against a fake database and holds every printed code to the exact status and Location production sent before the route existed, with no record, with the database down and with the Admin SDK missing.",
    coverWhen:
      "When the short-link console gets its spec: create a link as an admin, follow naisi.uk/q/<slug> and land where it says, repoint it and land somewhere else. The fixture link is removed by the harness teardown on the Admin SDK, which the no-delete rule does not bind.",
  },
  "/api/q/[slug]/scan": {
    reason:
      "Printed QR codes: /api/q/[slug]/scan is a fire-and-forget counter the landing page posts to. It changes nothing a person can see, so there is no screen for a browser spec to assert on; tests/scan-counting.test.mjs and the persona battery hold its contract.",
    coverWhen:
      "With the short-link console's spec: once a link has been made there, the same run opens the page it points at with ?q=<slug> and asserts the count on /admin/links went up by one.",
  },
  "/api/register/resend": {
    reason:
      "The resend route re-sends the registration magic link and sits behind the same reCAPTCHA gate as /api/register.",
    coverWhen:
      "When registration next changes the cooldown or the copy on the check-your-inbox screen.",
  },
  "/api/scheduler/tick": {
    reason:
      "Scheduler: /api/scheduler/tick is executed against a fake database in tests/scheduler.test.mjs, which reaches branches a browser run cannot schedule.",
    coverWhen:
      "When a marker or cursor change has to be proven against real Firestore rather than the fake.",
  },
  "/api/subscriptions": {
    reason:
      "Subscriptions: /api/subscriptions is covered by unit tests over the junction rows, and its answer is read on the page that posted it.",
    coverWhen:
      "When the first issue goes to the real list and an unsubscribe link is somebody's only way out.",
  },
  "/api/subscriptions/confirm": {
    reason:
      "Subscriptions: /api/subscriptions/confirm is covered by unit tests over the junction rows, and its answer is read on the page that posted it.",
    coverWhen:
      "When the first issue goes to the real list and an unsubscribe link is somebody's only way out.",
  },
  "/api/surveys/[surveyId]/open-at-event": {
    reason:
      "Surveys after events: opening one for its QR code; tests/surveys-events.test.mjs opens it once as an admin, refuses everybody else, view-as and a second press, and finds it emailed nobody.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups and check-ins, so a spec can make its survey, open it and answer it with the QR code.",
  },
  "/api/surveys/[surveyId]/people/[who]": {
    reason:
      "Surveys: opening one person's answers; tests/surveys-one-person.test.mjs opens them as every kind of caller, holds the opening recorded before anything of the person is read, and refuses whole when it cannot be recorded.",
    coverWhen:
      "When the end-to-end fixtures seed a term after decision day with a run whose sessions are dated, so a spec can make, send and answer a survey.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys": {
    reason:
      "Surveys: a programme's Surveys tab for its lead and admins (board sv-programme); tests/surveys-lead-tab.test.mjs renders it for an admin, the lead, another programme's lead, a reviewer, a track lead, a facilitator, a member and somebody signed out, finds no name, and holds each number to its own page's; the stage four journey draws it after the end.",
    coverWhen:
      "When the end-to-end fixtures seed a programme whose before survey and survey at the end have answers, so a spec can open the tab from the programme's head and follow its links.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/[surveyId]": {
    reason:
      "Surveys: one programme survey's results for its lead and admins; tests/surveys-leaving.test.mjs and tests/surveys-lead-tab.test.mjs render it for the lead, an admin, another programme's lead, a reviewer, a facilitator, a member and somebody signed out, and find no name.",
    coverWhen:
      "When the end-to-end fixtures seed a programme whose surveys have answers, so a spec can follow the Surveys tab's links from the programme's head.",
  },
  "/api/surveys/[surveyId]/open": {
    reason:
      "Surveys: opening a leaving survey; tests/surveys-leaving.test.mjs opens one once as an admin, refuses everybody else and a second press, and finds it emailed nobody.",
    coverWhen:
      "When the leaving spec (tests/e2e/course-hub-leaving.spec.mjs) makes and opens its programme's leaving survey before somebody leaves, and reads its card on the left page.",
  },
  "/api/surveys/public-numbers": {
    reason:
      "Public numbers: Publish; tests/surveys-public-numbers.test.mjs drives it as an admin, the programme's lead, a reviewer, a facilitator, a member, signed out and in a view-as session, and reads back the record it keeps, which holds no person.",
    coverWhen:
      "When the end-to-end fixtures seed a programme whose survey at the end has answers, so a spec can publish its numbers and read them on the programme's public page.",
  },
  "/api/surveys/public-numbers/take-down": {
    reason:
      "Public numbers: Take it down; tests/surveys-public-numbers.test.mjs deletes a published record as an admin, refuses everybody else, and never takes down a record whose ids name another programme.",
    coverWhen:
      "When the end-to-end fixtures seed a programme whose survey at the end has answers, so a spec can publish its numbers and take them down again.",
  },
  "/api/surveys/[surveyId]/consent": {
    reason:
      "Surveys: a follow-ups consent changed signed in; tests/surveys-routes.test.mjs changes it as the person the survey was sent to and is refused for everybody else, signed out and during view-as.",
    coverWhen:
      "When the end-to-end fixtures seed a term after decision day with a run whose sessions are dated, so a spec can make, send and answer a survey.",
  },
  "/api/account/kairos": {
    reason:
      "Surveys: the Kairos choice changed on the profile; tests/kairos-choice.test.mjs changes it both ways as the person signed in and is refused signed out, with a body that is not a yes or no, and during view-as.",
    coverWhen:
      "When the profile spec reaches the sections under the notification grid, so a browser presses the button and reads the line change.",
  },
  "/api/surveys/term/totals": {
    reason:
      "Surveys: This term in numbers as a file of totals; tests/surveys-term-numbers-file.test.mjs asks for it as every kind of caller, reads it line by line against the page's own view, and holds it to naming nobody and writing nothing.",
    coverWhen:
      "When an end-to-end spec downloads a file anywhere on the site, so the download path is driven in a browser once for all of them.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/anonymous-feedback": {
    reason:
      "The anonymous form's answers for the programme's lead and admins; tests/anonymous-feedback.test.mjs renders it as the lead, an admin, the lead of another programme, a reviewer, a facilitator, a member and signed out, and finds only answers from a day that is over, each question's in alphabetical order.",
    coverWhen:
      "When the end-to-end fixtures seed a term after decision day with a run whose sessions are dated and anonymous answers from an earlier day, so a spec can read them as the lead.",
  },
  "/api/feedback": {
    reason:
      "The anonymous keep, change and drop form: answering by the programme's one link; tests/anonymous-feedback.test.mjs answers signed out, signed in and in a view-as session, keeps only the three answers, the programme and the day, and refuses a wrong, malformed, closed or destroyed form's link and a flood past either limit.",
    coverWhen:
      "When the end-to-end fixtures seed a term after decision day with a run whose sessions are dated, so a spec can send the survey at the end, answer it and open the form from its end.",
  },
  "/api/tasks/[id]/delete": {
    reason:
      "Task manager: /api/tasks/[id]/delete is committee-only, pressed by hand every day, and its failure shows on the board that called it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/api/tasks/[id]/delete-block": {
    reason:
      "Task manager: /api/tasks/[id]/delete-block is committee-only, pressed by hand every day, and its failure shows on the board that called it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/api/tasks/[id]/delete-subtask": {
    reason:
      "Task manager: /api/tasks/[id]/delete-subtask is committee-only, pressed by hand every day, and its failure shows on the board that called it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/api/tasks/[id]/notify": {
    reason:
      "Task manager: /api/tasks/[id]/notify is committee-only, pressed by hand every day, and its failure shows on the board that called it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/api/tasks/[id]/notify-member": {
    reason:
      "Task manager: /api/tasks/[id]/notify-member is committee-only, pressed by hand every day, and its failure shows on the board that called it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/api/tasks/[id]/send-for-review": {
    reason:
      "Task manager: /api/tasks/[id]/send-for-review is committee-only, pressed by hand every day, and its failure shows on the board that called it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/api/tasks/[id]/send-initial-notifications": {
    reason:
      "Task manager: /api/tasks/[id]/send-initial-notifications is committee-only, pressed by hand every day, and its failure shows on the board that called it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/api/tasks/[id]/send-review-outcome": {
    reason:
      "Task manager: /api/tasks/[id]/send-review-outcome is committee-only, pressed by hand every day, and its failure shows on the board that called it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/api/unsubscribe": {
    reason:
      "Subscriptions: /api/unsubscribe is covered by unit tests over the junction rows, and its answer is read on the page that posted it.",
    coverWhen:
      "When the first issue goes to the real list and an unsubscribe link is somebody's only way out.",
  },
  "/api/webhooks/resend-events": {
    reason:
      "Webhooks: /api/webhooks/resend-events is driven by the provider rather than by a person, and its parsing is covered by the deliverability unit tests.",
    coverWhen:
      "When the provider changes its event shape and the parse has to be proven against a real delivery.",
  },
  "/(app)/admin/(admin-only)/collaborators": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/collaborators is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/deliverability": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/deliverability is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/email-designs": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/email-designs is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/email-designs/[templateId]": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/email-designs/[templateId] is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/email-designs/course/[templateId]": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/email-designs/course/[templateId] is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/members": {
    reason:
      "The Accounts list is read by one admin: a table of accounts, each row a link to that person's page. It changes nothing.",
    coverWhen:
      "When a permission grant is next handed to somebody other than the admin who makes it.",
  },
  "/(app)/admin/(admin-only)/members/[uid]": {
    reason:
      "One person's admin page is used by one admin: role changes, permission grants, the view-as button and deleting an account, each read back on the same page.",
    coverWhen:
      "When a permission grant is next handed to somebody other than the admin who makes it.",
  },
  "/(app)/admin/(admin-only)/newsletter": {
    reason:
      "Newsletter: /(app)/admin/(admin-only)/newsletter is used by two people deliberately, and the result is read back on the page they are looking at.",
    coverWhen:
      "When the first issue goes to the real list, because a mis-send cannot be recalled.",
  },
  "/(app)/admin/(admin-only)/projects": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/projects is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/registrations": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/registrations is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/links": {
    reason:
      "Admin CRUD and a dashboard: the short-link console is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it. What it can get wrong that matters is covered elsewhere: the destination validator and the route are unit-tested against every refused shape, the dashboard's arithmetic is unit-tested on rows shaped like the real ones, and both rules (admin-only with no delete, and counters nobody may write) are proved against every persona in the emulator.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/links/page-content": {
    reason:
      "Admin CRUD on one document: the /links page editor is used by one admin and fails loudly on the screen of the person who pressed Save. The thing it could get wrong that would matter is the PUBLIC page, and that cannot be broken by what is stored: tests/links-page-content.test.mjs runs the fetcher's projection over missing, damaged, empty and hostile documents and the built-in rows come back every time.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/sources": {
    reason:
      "Admin CRUD: the source-sheet library is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it. What it can get wrong that a browser spec would catch is covered elsewhere: the stored numbering is unit-tested and the admin-only rule is proved against every persona in the emulator.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/sources/[slug]": {
    reason:
      "Admin CRUD: the source-sheet editor is used by one admin and reports its own failures inline. The two things here that no deploy could fix afterwards, a reused source number and a published entry readable as a draft, are guarded by tests/source-numbering.test.mjs and scripts/rules-tests/tests/source-sheets.test.mjs rather than by a browser run.",
    coverWhen:
      "When a piece of printed material first carries a code pointing at one of these pages, because from then on a wrong page is a wrong sheet of paper in somebody's hand.",
  },
  "/(app)/admin/(admin-only)/site-status": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/site-status is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/subscriptions": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/subscriptions is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/(admin-only)/surveys/kairos": {
    reason:
      "Surveys: the Kairos page, each programme with its file and report; tests/kairos-file.test.mjs renders it before and after a run's last session.",
    coverWhen:
      "When the end-to-end fixtures seed a run whose last session is over, so a spec can open the file and the report.",
  },
  "/(app)/admin/(admin-only)/surveys/kairos/[roundId]/[programmeId]": {
    reason:
      "Surveys: the Kairos report, fourteen measures in totals; tests/kairos-report.test.mjs counts each on a made-up programme and renders the page over a programme's three surveys, its register and its ratings.",
    coverWhen:
      "When the end-to-end fixtures seed a run whose last session is over, so a spec can open the file and the report.",
  },
  "/(app)/admin/(admin-only)/surveys/public-numbers": {
    reason:
      "Public numbers: the admins' page; tests/surveys-public-numbers.test.mjs renders it before and after publishing, with the offer, the ticked quotes, the boxes of what is published ticked and both previews, and finds no name.",
    coverWhen:
      "When the end-to-end fixtures seed a programme whose survey at the end has answers, so a spec can publish its numbers and read them on the programme's public page.",
  },
  "/(app)/admin/(admin-only)/surveys/term": {
    reason:
      "Surveys: This term in numbers; tests/surveys-term-numbers-page.test.mjs renders the real page as every kind of caller over a term with events, check-ins, an event's survey and two programmes, and tests/surveys-term-numbers.test.mjs holds each number to its own page's reader.",
    coverWhen:
      "When the end-to-end fixtures seed a term whose events have check-ins and whose programmes have sent their surveys, so a spec can open the page as an admin.",
  },
  "/(app)/admin/(admin-only)/surveys/[surveyId]/answered/[who]": {
    reason:
      "Surveys: one person's answers, opened from Who answered; tests/surveys-one-person.test.mjs renders the page before the opening and what it draws once the opening route answers.",
    coverWhen:
      "When the end-to-end fixtures seed a term after decision day with a run whose sessions are dated, so a spec can make, send and answer a survey.",
  },
  "/(app)/admin/(admin-only)/task-templates": {
    reason:
      "Admin CRUD: /(app)/admin/(admin-only)/task-templates is used by one admin, fails loudly on the screen of the person who pressed the button, and nothing member-facing waits on it.",
    coverWhen:
      "When the risk-ordered list reaches admin CRUD, which is after every applicant-facing and member-facing journey in this map is verified.",
  },
  "/(app)/admin/admissions/forms": {
    reason:
      "Application forms: /(app)/admin/admissions/forms is a committee screen an admin uses a few times a term, and a fault in it is seen by the person using it.",
    coverWhen:
      "When the first application form is opened to applicants, alongside the spec that walks an applicant through it.",
  },
  "/(app)/admin/admissions/forms/[roundId]": {
    reason:
      "Application forms: /(app)/admin/admissions/forms/[roundId] is a committee screen, and a fault in it is seen by the lead or admin using it.",
    coverWhen:
      "When the first application form is opened to applicants, alongside the spec that walks an applicant through it.",
  },
  "/(app)/admin/admissions/forms/[roundId]/form": {
    reason:
      "Application forms: /(app)/admin/admissions/forms/[roundId]/form is the editor an admin builds the term's questions in, and a fault in it is seen by the admin using it.",
    coverWhen:
      "When the first application form is opened to applicants, alongside the spec that walks an applicant through it.",
  },
  "/(app)/admin/admissions/forms/[roundId]/pool": {
    reason:
      "Application system: /(app)/admin/admissions/forms/[roundId]/pool is an admin's page whose every number is worked out by modules the unit suite executes; nobody has applied through the new form yet, so there is no term to drive it against.",
    coverWhen:
      "When the first application form has closed on dev and a whole decision day is rehearsed there, because that rehearsal is the journey a spec would drive.",
  },
  "/(app)/admin/admissions/forms/[roundId]/send": {
    reason:
      "Application system: /(app)/admin/admissions/forms/[roundId]/send is an admin's page whose every number is worked out by modules the unit suite executes; nobody has applied through the new form yet, so there is no term to drive it against.",
    coverWhen:
      "When the first application form has closed on dev and a whole decision day is rehearsed there, because that rehearsal is the journey a spec would drive.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/applications/freed-places": {
    reason:
      "Application forms: the freed-places page is reached from a programme's Applications tab, is rendered to HTML as each caller by tests/applications-freed-places-page.test.mjs, and was checked by hand at 1440 and 390 against a seeded emulator.",
    coverWhen:
      "When the end-to-end fixtures can seed a form after decision day with a place given back and a pooled applicant told no offer.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/written": {
    reason:
      "Course hub: the programme's lead's way to the review page, where a facilitator's own answer gets feedback; drawn as the lead, another programme's lead and somebody signed out in tests/course-hub-written-answers.test.mjs.",
    coverWhen:
      "When a browser spec signs in as the programme's lead and gives feedback on a facilitator's own answer.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/applications/[uid]": {
    reason:
      "Application review: the review screen is reached from the list only, and was checked by hand at 1440 and 390 as a lead, a reviewer and an admin, keyboard included.",
    coverWhen:
      "When the end-to-end fixtures can seed an application form with a sent application for a lead to score and decide.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework": {
    reason:
      "Course hub: the Coursework tab, a row per person holding a place and per facilitator, a column per week; every caller is executed by tests/course-hub-coursework.test.mjs.",
    coverWhen:
      "When the coursework spec that seeds a run with reflections, ticks and a sent written answer and signs the lead in has passed end to end.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]": {
    reason:
      "Course hub: one person's coursework, newest week first, private notes for admins alone; every caller is executed by tests/course-hub-coursework.test.mjs.",
    coverWhen:
      "When the coursework spec that seeds a run with reflections, ticks and a sent written answer and signs the lead in has passed end to end.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections": {
    reason:
      "Course hub: the lead's and admins' reading of one group's reflections, its facilitators' own under their names; every caller is executed by tests/course-hub-facilitator-week.test.mjs, and it was checked in a browser on the preview kit at 1440 and 390.",
    coverWhen:
      "When the end-to-end fixtures can seed a run whose weeks are written as blocks, with reflections written, and the programme's lead signed in.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week": {
    reason:
      "Course hub: the lead's and admins' view of one group's week (This week's work with its pathway, written answer and case columns and each person's fill-in boxes, who ticked each source by name, its facilitators' own work); every caller is executed by tests/course-hub-facilitator-week.test.mjs, the columns and the boxes through the loaders the page calls by tests/course-hub-stage-four-journey.test.mjs, and it was checked in a browser on the preview kit at 1440 and 390.",
    coverWhen:
      "When the end-to-end fixtures can seed a run whose weeks are written as blocks, with ticks and reflections, and the programme's lead signed in.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/ratings": {
    reason:
      "Course hub: a programme's ratings for its lead and admins; tests/course-ratings.test.mjs renders it as the lead, an admin, a reviewer and another programme's lead, before and after the run's last session.",
    coverWhen:
      "When the end-to-end fixtures seed a run whose last session is over, with the programme's lead signed in.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups": {
    reason:
      "Course hub: the Groups tab's People in groups view is the run's own allocation board, drawn as st-groups draws it for the programme's lead and admins; its every caller, its words in every state and its one count are executed by tests/course-hub-people-in-groups.test.mjs and tests/course-hub-lead-pages.test.mjs, the board's routes by tests/course-hub-lead-routes.test.mjs and tests/applications-handover-board.test.mjs, and it was checked by hand at 1440 and 390.",
    coverWhen:
      "When the end-to-end fixtures can seed a programme that names a run with groups, with its lead signed in.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/circles": {
    reason:
      "An admin's Circles. Its read, its suggestions and Apply's differences are executed by tests/applications-circles.test.mjs and tests/applications-arrange-changes.test.mjs; the page's gate by the persona battery.",
    coverWhen: "With a course hub spec after the hand-over: open Circles, move one person, see them in the new ring.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/publish": {
    reason:
      "Course hub: Publish's own page (st-publish), its readiness check, the two emails and Publish's own buttons, for a programme's lead and admins; its every caller, what it blocks and what it only warns, each against a real press, are executed by tests/course-hub-get-ready.test.mjs, and it was checked by hand at 1440 and 390.",
    coverWhen:
      "When the groups-go-out spec presses Publish from the programme's own Groups tab rather than the run editor's board.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/copy": {
    reason:
      "Course hub: Copy weeks from the course, a page of the Weeks tab; its every caller and the copy it sends (never an overwrite) are executed by tests/course-hub-weeks-tab.test.mjs.",
    coverWhen:
      "When a course has two runs on dev and a browser spec copies one's weeks into the other as its programme's lead.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/publish": {
    reason:
      "Course hub: Publish's own page under a programme's Groups tab, reached from People in groups. The Publish area on it is the allocation board's, which the groups-go-out spec presses on the run editor's board; the page's every caller is executed by tests/course-hub-people-in-groups.test.mjs.",
    coverWhen:
      "When the groups-go-out spec presses Publish from a programme's Groups tab rather than from the run editor's board.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/people": {
    reason:
      "Course hub: the People tab lists everyone who holds a place on a programme or gave it back, for its lead and admins; its every caller, its counts, its rows and what it never sends are executed by tests/course-hub-people-tab.test.mjs, and it was checked by hand at 1440 and 390.",
    coverWhen:
      "When the end-to-end fixtures can seed a term whose decisions have been sent, with a programme naming a run and its lead signed in.",
  },
  "/(app)/admin/courses": {
    reason:
      "Course authoring: /(app)/admin/courses is admin-only, and a mistake there is visible to its author before a member reaches it.",
    coverWhen:
      "When a second person authors a course, because the cover today is the author reading back their own screen.",
  },
  "/(app)/admin/courses/[courseId]": {
    reason:
      "Course authoring: /(app)/admin/courses/[courseId] is admin-only, and a mistake there is visible to its author before a member reaches it.",
    coverWhen:
      "When a second person authors a course, because the cover today is the author reading back their own screen.",
  },
  "/(app)/admin/courses/[courseId]/facilitator-guide": {
    reason:
      "Course authoring: /(app)/admin/courses/[courseId]/facilitator-guide is admin-only, and what it loads is read back on the guide's own pages by the admin who loaded it; its every caller is executed by tests/course-facilitator-guide.test.mjs.",
    coverWhen:
      "When a second person loads a course's facilitator guide, because the cover today is the admin reading back their own screen.",
  },
  "/(app)/admin/courses/[courseId]/page": {
    reason:
      "Course authoring: /(app)/admin/courses/[courseId]/page is admin-only, and a mistake there is visible to its author before a member reaches it.",
    coverWhen:
      "When a second person authors a course, because the cover today is the author reading back their own screen.",
  },
  "/(app)/admin/courses/[courseId]/runs/[runId]/applications": {
    reason:
      "Course authoring: /(app)/admin/courses/[courseId]/runs/[runId]/applications is admin-only, and a mistake there is visible to its author before a member reaches it.",
    coverWhen:
      "When a second person authors a course, because the cover today is the author reading back their own screen.",
  },
  "/(app)/admin/courses/[courseId]/runs/[runId]/retrospective": {
    reason:
      "Course authoring: /(app)/admin/courses/[courseId]/runs/[runId]/retrospective is admin-only, and a mistake there is visible to its author before a member reaches it.",
    coverWhen:
      "When a second person authors a course, because the cover today is the author reading back their own screen.",
  },
  "/(app)/admin/courses/[courseId]/runs/[runId]/weeks/[weekId]": {
    reason:
      "Course authoring: /(app)/admin/courses/[courseId]/runs/[runId]/weeks/[weekId] is admin-only, and a mistake there is visible to its author before a member reaches it.",
    coverWhen:
      "When a second person authors a course, because the cover today is the author reading back their own screen.",
  },
  "/(app)/committee/tasks": {
    reason:
      "Task manager: the committee's daily surface, unchanged for months, and a break is reported by a person within the hour.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/(app)/credentials": {
    reason:
      "The credentials page is a placeholder: the feature has rules deployed but no code behind it. The protected-route-gate battery asserts only that a signed-out visitor is redirected off it.",
    coverWhen:
      "When the credentials store is built and holds a real secret.",
  },
  "/(app)/events/manage": {
    reason:
      "Events authoring: /(app)/events/manage is committee-facing, and a failure surfaces on the editor that caused it.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/(app)/events/manage/[id]": {
    reason:
      "Events authoring: /(app)/events/manage/[id] is committee-facing, and a failure surfaces on the editor that caused it.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/(app)/events/manage/[id]/attendees": {
    reason:
      "Events authoring: /(app)/events/manage/[id]/attendees is committee-facing, and a failure surfaces on the editor that caused it.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/(app)/events/manage/[id]/preview": {
    reason:
      "Events authoring: /(app)/events/manage/[id]/preview is committee-facing, and a failure surfaces on the editor that caused it.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/(app)/events/manage/new": {
    reason:
      "Events authoring: /(app)/events/manage/new is committee-facing, and a failure surfaces on the editor that caused it.",
    coverWhen:
      "When the events editor is next reshaped, because the hand pass that covers it today is a memory of the old screen.",
  },
  "/(app)/learn/facilitate/[askId]": {
    reason:
      "Course hub: the page an ask to facilitate opens (board st-fac-ask-phone), rendered to HTML for the person asked, somebody else and every state of an ask by tests/course-hub-facilitator-asks.test.mjs, and checked by hand at 390 and 1440.",
    coverWhen: "With the spec for the ask above.",
  },
  "/(app)/learn/facilitator-guide/[courseId]": {
    reason:
      "Facilitator guide: /(app)/learn/facilitator-guide/[courseId] is drawn on the server behind the guide's own gate; its every caller is executed by tests/course-facilitator-guide.test.mjs, and it was checked by hand at 1440 and 390 with a whole guide loaded.",
    coverWhen:
      "When the end-to-end fixtures seed a course's facilitator guide and sign in as a group's facilitator.",
  },
  "/(app)/learn/facilitator-guide/[courseId]/[doc]": {
    reason:
      "Facilitator guide: /(app)/learn/facilitator-guide/[courseId]/[doc] is drawn on the server behind the guide's own gate; its every caller is executed by tests/course-facilitator-guide.test.mjs, and it was checked by hand at 1440 and 390 with a whole guide loaded.",
    coverWhen:
      "When the end-to-end fixtures seed a course's facilitator guide and sign in as a group's facilitator.",
  },
  "/(app)/learn/[runId]/admissions": {
    reason:
      "Learn hub: /(app)/learn/[runId]/admissions is part of the curriculum surface being rebuilt in October, so a spec written now would be rewritten with it.",
    coverWhen:
      "When the October curriculum rebuild lands and its first cohort works a week through the new shape.",
  },
  "/(app)/learn/[runId]/email": {
    reason:
      "Learn hub: /(app)/learn/[runId]/email is part of the curriculum surface being rebuilt in October, so a spec written now would be rewritten with it.",
    coverWhen:
      "When the October curriculum rebuild lands and its first cohort works a week through the new shape.",
  },
  "/(app)/learn/[runId]/group/[groupId]/edit": {
    reason:
      "Learn hub: /(app)/learn/[runId]/group/[groupId]/edit is part of the curriculum surface being rebuilt in October, so a spec written now would be rewritten with it.",
    coverWhen:
      "When the October curriculum rebuild lands and its first cohort works a week through the new shape.",
  },
  "/(app)/learn/[runId]/group/[groupId]/edit/[weekId]": {
    reason:
      "Learn hub: /(app)/learn/[runId]/group/[groupId]/edit/[weekId] is part of the curriculum surface being rebuilt in October, so a spec written now would be rewritten with it.",
    coverWhen:
      "When the October curriculum rebuild lands and its first cohort works a week through the new shape.",
  },
  "/(app)/learn/[runId]/group/[groupId]/email": {
    reason:
      "Learn hub: /(app)/learn/[runId]/group/[groupId]/email is part of the curriculum surface being rebuilt in October, so a spec written now would be rewritten with it.",
    coverWhen:
      "When the October curriculum rebuild lands and its first cohort works a week through the new shape.",
  },
  "/(app)/learn/[runId]/group/[groupId]/reflections": {
    reason:
      "Course hub: the page where a group's facilitators pick reflections to read out without names (wk-reflections); every caller is executed by tests/course-hub-facilitator-week.test.mjs, and it was checked in a browser on the preview kit at 1440 and 390.",
    coverWhen:
      "When the end-to-end fixtures can seed a run whose weeks are written as blocks, with reflections written, and a group's facilitator signed in.",
  },
  "/(app)/learn/[runId]/group/[groupId]/reflections/names": {
    reason:
      "Course hub: a group's fellows' reflections read with names, for its live facilitators and admins; every caller is executed by tests/course-hub-facilitator-week.test.mjs.",
    coverWhen:
      "When the coursework spec that seeds a run with reflections written and signs a facilitator in has passed end to end.",
  },
  "/(app)/learn/[runId]/group/[groupId]/ratings": {
    reason:
      "Course hub: a group's ratings for its facilitators once the run is over; tests/course-ratings.test.mjs renders it as a facilitator, a co-facilitator, an admin, a fellow and somebody signed out.",
    coverWhen:
      "When the end-to-end fixtures seed a run whose last session is over, with a group's facilitator signed in.",
  },
  "/(app)/learn/[runId]/group/[groupId]/review": {
    reason:
      "Learn hub: /(app)/learn/[runId]/group/[groupId]/review is part of the curriculum surface being rebuilt in October, so a spec written now would be rewritten with it.",
    coverWhen:
      "When the October curriculum rebuild lands and its first cohort works a week through the new shape.",
  },
  "/(app)/learn/[runId]/group/[groupId]/update": {
    reason:
      "Course hub: the update composer for one group, opened from its page by its facilitators; the page's every caller is executed by tests/course-hub-updates-pages.test.mjs and its route by tests/course-hub-updates-routes.test.mjs.",
    coverWhen:
      "When the end-to-end fixtures can seed a run Publish has told, with a group's facilitator signed in.",
  },
  "/api/courses/groups/[groupId]/draw": {
    reason:
      "Course hub: the draw typed into the group page (Q32 A, wk-cases): who may type it, the case lists, the content note kept out, swaps and what a save clears are executed by tests/course-hub-packs-and-cases.test.mjs as every kind of caller; typed in a browser on the preview kit at 390 and 1440.",
    coverWhen:
      "When a browser spec signs in a group's facilitator after a session, copies the slips in on the draw page and a member of the group reads their case on their week page.",
  },
  "/api/courses/groups/[groupId]/pairs": {
    reason:
      "Course hub: pairs and laptops typed for a session in pairs (Technical AI Safety's hands-on night): who may type them, who can be in a pair, the sizes a save refuses, the laptop check that never refuses and what a save writes are executed by tests/course-hub-pairs.test.mjs as every kind of caller; typed in a browser on the preview kit at 390 and 1440.",
    coverWhen:
      "When a browser spec signs in a group's facilitator before a session in pairs, pairs the group on the pairs page and a member of the group reads their partner on their week page.",
  },
  "/api/courses/groups/[groupId]/notes": {
    reason:
      "Course hub: the notes a group's facilitators share (C30); who writes, who is refused, what a note keeps and what takes it away are executed by tests/course-hub-group-notes.test.mjs, and the page that reads them by tests/course-hub-facilitator-pages.test.mjs; written in a browser on the preview kit at 1440.",
    coverWhen:
      "When the facilitator's week spec writes a note on the group page and reads it back.",
  },
  "/api/courses/groups/[groupId]/ratings": {
    reason:
      "Course hub: one rating of one fellow at a programme's end; who rates whom, every refusal and what a rating keeps are executed by tests/course-ratings.test.mjs as each kind of caller.",
    coverWhen:
      "When the end-to-end fixtures seed a run whose last session is over, with a group's facilitator signed in.",
  },
  "/api/courses/groups/[groupId]/shared-notes": {
    reason:
      "Course hub: the notes a group shares on its week pages (C29); who adds one, who is refused, what a note keeps and what takes it away are executed by tests/course-hub-shared-notes.test.mjs, with the week page and the Attendance tab that draw them; added in a browser on the preview kit at 390 and 1440.",
    coverWhen:
      "When a browser spec signs in a member of a group Publish has told, opens a week's page, adds a note and reads it back.",
  },
  "/api/courses/groups/[groupId]/shared-notes/[noteId]": {
    reason:
      "Course hub: a note shared with a group, deleted by the person who wrote it (C29); its writer and every other caller are executed by tests/course-hub-shared-notes.test.mjs; deleted in a browser on the preview kit.",
    coverWhen:
      "When the same browser spec deletes the note it added.",
  },
  "/api/courses/runs/[runId]/team/check-in": {
    reason:
      "Course hub: this week's check-in on an incubator team's page (in-team); who saves it, who is refused, the week rule and what deletion does are executed by tests/course-hub-team-page-routes.test.mjs and tests/course-hub-team-page-deletion.test.mjs, and the page that draws it by tests/course-hub-team-page-pages.test.mjs; saved in a browser on the preview kit at 390 and 1440.",
    coverWhen:
      "When the incubator's browser spec, after telling everyone their team, signs in a person in a team, opens their team's page from the programme's page and saves a check-in.",
  },
  "/api/courses/runs/[runId]/team/links": {
    reason:
      "Course hub: a link added to an incubator team's page (in-team's Team links); the limit, the https rule and every caller are executed by tests/course-hub-team-page-routes.test.mjs; added in a browser on the preview kit.",
    coverWhen: "When the same browser spec adds a link and reads it back on the team's page.",
  },
  "/api/courses/runs/[runId]/team/links/[linkId]": {
    reason:
      "Course hub: a link removed from an incubator team's page, by anybody in the team; another team's person and every other caller are executed by tests/course-hub-team-page-routes.test.mjs; removed in a browser on the preview kit.",
    coverWhen: "When the same browser spec removes the link it added.",
  },
  "/api/courses/runs/[runId]/team/hand-in": {
    reason:
      "Course hub: an incubator team's one hand-in (en-handin-phone); the tick, the 200 words, the due day's 23:59 and every caller are executed by tests/course-hub-team-page-routes.test.mjs; handed in on the preview kit before and after the deadline.",
    coverWhen:
      "When the incubator's browser spec can seed a run whose hand-in is due, and a person in a team hands in for it.",
  },
  "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/hand-in": {
    reason:
      "Course hub: an incubator's hand-in dates, set by its lead or an admin on the Teams tab; every caller and every refusal are executed by tests/course-hub-team-page-routes.test.mjs.",
    coverWhen: "When the incubator's browser spec sets the hand-in dates on the Teams tab before a team hands in.",
  },
  "/(app)/learn/[runId]/team": {
    reason:
      "Course hub: an incubator team's own page (in-team, in-team-phone), drawn by tests/course-hub-team-page-pages.test.mjs as every kind of caller in week 5, in the break, in February and after the end; photographed on the preview kit at 390 and 1440.",
    coverWhen:
      "When the incubator's browser spec, after telling everyone their team, opens a person's team page from the programme's page.",
  },
  "/(app)/learn/[runId]/team/hand-in": {
    reason:
      "Course hub: an incubator team's hand-in page (en-handin-phone), drawn by tests/course-hub-team-page-pages.test.mjs before and after its deadline and for every kind of caller; photographed on the preview kit.",
    coverWhen: "With the spec for the hand-in route above.",
  },
  "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/teams/[teamId]": {
    reason:
      "Course hub: one team's page as an incubator's lead and admins read it, from the Teams tab's Hand-ins; drawn by tests/course-hub-team-page-pages.test.mjs for the lead, an admin, the reviewer and everybody else.",
    coverWhen: "When the incubator's browser spec opens a team's page from the Teams tab as the lead.",
  },
  "/(app)/learn/[runId]/nudge": {
    reason:
      "Learn hub: /(app)/learn/[runId]/nudge is part of the curriculum surface being rebuilt in October, so a spec written now would be rewritten with it.",
    coverWhen:
      "When the October curriculum rebuild lands and its first cohort works a week through the new shape.",
  },
  "/(app)/learn/[runId]/progress": {
    reason:
      "Learn hub: /(app)/learn/[runId]/progress is part of the curriculum surface being rebuilt in October, so a spec written now would be rewritten with it.",
    coverWhen:
      "When the October curriculum rebuild lands and its first cohort works a week through the new shape.",
  },
  "/(app)/learn/[runId]/group/[groupId]/written": {
    reason:
      "Course hub: a group's written answers one at a time (wk-review, wk-review-phone), for its facilitators and admins; drawn as each kind of caller in tests/course-hub-written-answers.test.mjs.",
    coverWhen:
      "When a browser spec signs in as a group's facilitator, opens a sent answer, gives feedback by the rubric, " +
        "and the member reads it on the feedback page.",
  },
  "/(app)/learn/[runId]/weeks/[n]/feedback": {
    reason:
      "Course hub: a fellow's own feedback page (wk-feedback-phone), their answer as sent with each level and the comment; drawn as its writer and refused to everybody else in tests/course-hub-written-answers.test.mjs.",
    coverWhen:
      "When a browser spec signs in as a group's facilitator, opens a sent answer, gives feedback by the rubric, " +
        "and the member reads it on the feedback page.",
  },
  "/(app)/learn/draw/[groupId]": {
    reason:
      "Course hub: the draw's page (wk-cases, option A), drawn as each kind of caller and with its lists held word for word by tests/course-hub-packs-and-cases.test.mjs; photographed on the preview kit at 390 and 1440.",
    coverWhen:
      "When the browser spec that copies the slips in drives the page.",
  },
  "/(app)/learn/pairs/[groupId]": {
    reason:
      "Course hub: the pairs page for a session in pairs, drawn as each kind of caller and with its pairs, checks and rows held word for word by tests/course-hub-pairs.test.mjs; photographed on the preview kit at 390 and 1440.",
    coverWhen:
      "When the browser spec that pairs a group drives the page.",
  },
  "/(app)/newsletter": {
    reason:
      "Newsletter: /(app)/newsletter is used by two people deliberately, and the result is read back on the page they are looking at. The protected-route-gate battery asserts only that a signed-out visitor is redirected off it.",
    coverWhen:
      "When the first issue goes to the real list, because a mis-send cannot be recalled.",
  },
  "/(app)/newsletter/[id]": {
    reason:
      "Newsletter: /(app)/newsletter/[id] is used by two people deliberately, and the result is read back on the page they are looking at.",
    coverWhen:
      "When the first issue goes to the real list, because a mis-send cannot be recalled.",
  },
  "/(app)/newsletter/new": {
    reason:
      "Newsletter: /(app)/newsletter/new is used by two people deliberately, and the result is read back on the page they are looking at.",
    coverWhen:
      "When the first issue goes to the real list, because a mis-send cannot be recalled.",
  },
  "/(app)/tasks": {
    reason:
      "My Work is the member half of the task manager: unchanged, and used daily by the people who would report it. The protected-route-gate battery asserts only that a signed-out visitor is redirected off it.",
    coverWhen:
      "When the task manager is next changed, or when the risk-ordered list reaches it: today it is covered only by the committee noticing within the hour.",
  },
  "/(auth)/pending-approval": {
    reason:
      "Pending approval is one sentence and a sign-out link, rendered for every account this harness creates.",
    coverWhen:
      "When registration next changes what a fresh account lands on.",
  },
  "/(public)": {
    reason:
      "The landing page is server-rendered from static content or one read, and a break is visible to anybody who opens it.",
    coverWhen:
      "When the public site is next restyled, which changes all of these renders in one pull request.",
  },
  "/(public)/about": {
    reason:
      "The About page is static: server-rendered from words in its own file, with no read and no form, and a break is visible to anybody who opens it.",
    coverWhen:
      "When the page gains anything read from the database or anything a visitor can submit, because from then on a break is no longer visible at a glance.",
  },
  "/(public)/applications/[roundId]/free": {
    reason:
      "Changing when you're free (Q7): the form's own week editor on a page of its own, for somebody holding a place on a fellowship until Publish has told them their group. Rendered by tests/course-hub-when-free.test.mjs for a holder before and after placement, for somebody told, for somebody with no place, signed out and in a view-as session, with no browser spec yet.",
    coverWhen:
      "When a browser spec signs in as somebody holding a place before Publish, changes their week on this page, and the allocation board's fit marks follow it.",
  },
  "/(public)/courses": {
    reason:
      "The fellowships page lists the fellowships on the term's form and then every published course on no form, from the term's one lookup, which tests/applications-public-term.test.mjs executes, and the catalogue's own reads. What a card says about applying is held by tests/applications-d2-gamma-find-the-form.test.mjs and tests/reskin-programme-pages.test.mjs, and the course page behind a card is driven by a spec.",
    coverWhen:
      "When the catalogue lists more than one published course, so an ordering or a filter can be wrong.",
  },
  "/(public)/courses/[courseId]/apply": {
    reason:
      "The course apply page forwards to the round a course points at, which the funnel drives directly.",
    coverWhen:
      "When a course points at a round on the day that round opens and applicants arrive by the forward.",
  },
  "/(public)/courses/[courseId]/weeks/[week]": {
    reason:
      "The public week page renders published curriculum, which the October rebuild reshapes.",
    coverWhen:
      "When the October curriculum rebuild lands and the first published week is public.",
  },
  "/(public)/incubator": {
    reason:
      "The research incubator's page is words, server-rendered, with the term's dates read through the one lookup tests/applications-public-term.test.mjs executes. tests/reskin-programme-pages.test.mjs holds its closing band to the words a course's own page uses, and a break is visible to anybody who opens it.",
    coverWhen:
      "When the incubator is first on an application form that is open on the live site, because its Apply button is then a way into the form that a browser spec should press.",
  },
  "/(public)/events": {
    reason:
      "Events RSVP: /(public)/events belongs to the flow frozen by docs/mobile-baseline-events.md, which is re-checked by hand on every touching change.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/events/[id]/calendar": {
    reason:
      "The add-to-calendar landing page is a server render of three facts and four links, with no form and no state; every link it builds is asserted in tests/events-ics.test.mjs, and the .ics route behind the first one is unchanged.",
    coverWhen:
      "When a printed code is first pointed at an event, because from then on a broken render is read by strangers at a stall rather than by the committee.",
  },
  "/(public)/events/[id]/rsvp/[rsvpId]/cancel": {
    reason:
      "Events RSVP: /(public)/events/[id]/rsvp/[rsvpId]/cancel belongs to the flow frozen by docs/mobile-baseline-events.md, which is re-checked by hand on every touching change.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/(public)/events/[id]/rsvp/[rsvpId]/change": {
    reason:
      "Events RSVP: /(public)/events/[id]/rsvp/[rsvpId]/change belongs to the flow frozen by docs/mobile-baseline-events.md, which is re-checked by hand on every touching change.",
    coverWhen:
      "When an event next runs with a capacity and a waitlist, because a wrong decision there is a real person losing their place.",
  },
  "/(public)/join": {
    reason:
      "The Join page is static apart from the site's one subscribe form, which it uses as it stands, and two links: one to /register and one to the Students' Union's own site. A break in the page is visible to anybody who opens it.",
    coverWhen:
      "When a spec first drives a mailing list sign-up from start to finish, because this page is then the natural place for it to start.",
  },
  "/(public)/members": {
    reason:
      "The public members page is server-rendered from static content or one read, and a break is visible to anybody who opens it.",
    coverWhen:
      "When the public site is next restyled, which changes all of these renders in one pull request.",
  },
  "/(public)/news": {
    reason:
      "The public news page is server-rendered from static content or one read, and a break is visible to anybody who opens it.",
    coverWhen:
      "When the public site is next restyled, which changes all of these renders in one pull request.",
  },
  "/(public)/news/[slug]": {
    reason:
      "The public news article page is server-rendered from one read, and a break is visible to anybody who opens it.",
    coverWhen:
      "When the public site is next restyled, which changes all of these renders in one pull request.",
  },
  "/(public)/privacy": {
    reason:
      "/(public)/privacy renders the versioned policy files, whose content tests/privacy-policy.test.mjs already pins.",
    coverWhen:
      "When one of these pages changes how it renders rather than what it says: member-journey drives the re-consent gate, and tests/privacy-policy.test.mjs pins the words.",
  },
  "/(public)/privacy/v/[version]": {
    reason:
      "/(public)/privacy/v/[version] renders the versioned policy files, whose content tests/privacy-policy.test.mjs already pins.",
    coverWhen:
      "When one of these pages changes how it renders rather than what it says: member-journey drives the re-consent gate, and tests/privacy-policy.test.mjs pins the words.",
  },
  "/(public)/privacy/versions": {
    reason:
      "/(public)/privacy/versions renders the versioned policy files, whose content tests/privacy-policy.test.mjs already pins.",
    coverWhen:
      "When one of these pages changes how it renders rather than what it says: member-journey drives the re-consent gate, and tests/privacy-policy.test.mjs pins the words.",
  },
  "/(public)/resources": {
    reason:
      "The public resources page is server-rendered from static content or one read, and a break is visible to anybody who opens it.",
    coverWhen:
      "When the public site is next restyled, which changes all of these renders in one pull request.",
  },
  "/(public)/sources": {
    reason:
      "The public sources index is server-rendered from one read, and a break is visible to anybody who opens it. It is also not the page a scanned code lands on: every printed code addresses a sheet directly, so this index is a convenience rather than the path that matters.",
    coverWhen:
      "When the public site is next restyled, which changes all of these renders in one pull request.",
  },
  "/(public)/sources/[slug]": {
    reason:
      "The public source sheet is server-rendered from one read. The property worth asserting is that an unpublished or unknown address answers calmly instead of 404ing, and that decision lives in one branch of the server fetcher rather than in the page.",
    coverWhen:
      "When a piece of printed material first carries a code pointing here, because from then on somebody standing in a hall with a poster is the person reading the answer.",
  },
  "/(public)/status": {
    reason:
      "The public status page is server-rendered from static content or one read, and a break is visible to anybody who opens it.",
    coverWhen:
      "When the public site is next restyled, which changes all of these renders in one pull request.",
  },
  "/(public)/terms": {
    reason:
      "/(public)/terms renders the versioned policy files, whose content tests/privacy-policy.test.mjs already pins.",
    coverWhen:
      "When one of these pages changes how it renders rather than what it says: member-journey drives the re-consent gate, and tests/privacy-policy.test.mjs pins the words.",
  },
  "/(public)/terms/v/[version]": {
    reason:
      "/(public)/terms/v/[version] renders the versioned policy files, whose content tests/privacy-policy.test.mjs already pins.",
    coverWhen:
      "When one of these pages changes how it renders rather than what it says: member-journey drives the re-consent gate, and tests/privacy-policy.test.mjs pins the words.",
  },
  "/(public)/terms/versions": {
    reason:
      "/(public)/terms/versions renders the versioned policy files, whose content tests/privacy-policy.test.mjs already pins.",
    coverWhen:
      "When one of these pages changes how it renders rather than what it says: member-journey drives the re-consent gate, and tests/privacy-policy.test.mjs pins the words.",
  },
  "/links": {
    reason:
      "The links page is checked-in rows, one read of published events and the home page's subscribe form, whose route tests/subscriptions-consent.test.mjs executes; what is new on it is the source attribution, which tests/campaign-attribution.test.mjs pins as a pure function.",
    coverWhen:
      "When scan counting or an admin-editable list of rows lands on it, because then the page writes and its content stops being a checked-in file.",
  },
  "/feedback/[token]": {
    reason:
      "The anonymous keep, change and drop form's page; tests/anonymous-feedback.test.mjs renders it signed out and signed in, finds the box before the questions, nothing about who is looking and nothing written, and renders a wrong, closed and destroyed form's link as one sentence.",
    coverWhen:
      "When the end-to-end fixtures seed a term after decision day with a run whose sessions are dated, so a spec can open the link at the end of the survey at the end and send the form.",
  },
  "/collaborator": {
    reason:
      "The collaborator page is reached by an invited outsider through a signed link, and the redirect half of it is asserted by the protected-route-gate battery.",
    coverWhen:
      "When an outside collaborator is next invited to an event and has to follow the signed link in.",
  },
  "/api/links/[slug]/qr": {
    reason:
      "Short links: the code's picture is drawn from the slug and read back by tests/qr-codes.test.mjs with the qr package's own decoder (it encodes /q/<slug>, never the destination, black on white), as every kind of caller.",
    coverWhen:
      "With the short-link console's spec: open a link's card, download its PNG and decode it.",
  },
  "/signs/[slug]": {
    reason:
      "Short links: the A4 sign is a server render of a name, a code and an address; tests/qr-codes.test.mjs and tests/event-door-code.test.mjs render it as every kind of caller and read its code square for square.",
    coverWhen:
      "When a sign is first printed for an event, so a broken print is found before the door.",
  },
  "/api/events/[id]/door-code": {
    reason:
      "Check-in: making an event's door code; tests/event-door-code.test.mjs drives the route as every kind of caller, the record field for field, the slug from the name and a slug that is taken, and follows the scan to the check-in page.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups, so a spec can make the code, scan it and check in.",
  },
  "/api/events/[id]/check-ins": {
    reason:
      "Check-in: the door list's tick and a walk-in; tests/event-door-list.test.mjs and tests/event-walk-ins.test.mjs drive it at each point of the evening as every kind of caller.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups, so a spec can check people in at the door on a phone.",
  },
  "/api/events/[id]/check-ins/[checkInId]": {
    reason:
      "Check-in: undo; tests/event-door-list.test.mjs undoes once, refuses twice and refuses a week after.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups, so a spec can check people in at the door on a phone.",
  },
  "/api/events/[id]/check-in": {
    reason:
      "Check-in: checking yourself in with the door code; tests/event-self-check-in.test.mjs drives it as a member with each kind of sign-up, a guest with their email's link, a wrong link, signed out and view-as.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups, so a spec can scan the door code and press I'm here.",
  },
  "/events/[id]/check-in": {
    reason:
      "Check-in: the page the door code lands on is a server render with one button; tests/event-self-check-in.test.mjs renders every state, signed out naming nobody and a gone event answering with a page.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups, so a spec can scan the door code and press I'm here.",
  },
  "/(app)/events/manage/[id]/door": {
    reason:
      "Check-in: the door list; tests/event-door-list.test.mjs renders it as every kind of caller before, during and after the door is open.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups, so a spec can check people in at the door on a phone.",
  },
  "/events/[id]/survey": {
    reason:
      "Surveys after events: the page a survey's QR code lands on is a server render; tests/surveys-events.test.mjs renders every state (no survey, not open, signed out naming nobody, signed in as somebody who came, signed up, neither, answered) and finds it writes nothing.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups and check-ins, so a spec can make its survey, open it and answer it with the QR code.",
  },
  "/(app)/events/manage/[id]/survey": {
    reason:
      "Surveys after events: an event's Survey after tab; tests/surveys-events.test.mjs renders it as the organiser the SU does not recognise, a collaborator, SU-recognised committee (that it went and when, no result) and an admin (the results), before and after the email.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups and check-ins, so a spec can send its survey and read the tab as its organiser.",
  },
  "/(app)/events/manage/[id]/check-in": {
    reason:
      "Check-in: an event's Check-in tab; tests/event-check-in-tab.test.mjs renders it as an organiser the SU does not recognise (numbers, no name anywhere in the page) and as the people who run check-in, through the evening.",
    coverWhen:
      "When the end-to-end fixtures seed a published event with sign-ups, so a spec can check people in and read who came.",
  },
};

/* -------------------------------------------------------------------------
 * 3. Reading the spec modules
 * ---------------------------------------------------------------------- */

/** The two answers `SPEC.status` may give. Anything else is a broken module. */
const STATUSES = ["verified", "unverified"];

/**
 * Every spec module beside `core.mjs`, imported for its `SPEC`.
 *
 * Safe under `npm test` because `core.mjs` does no work at import: no
 * `loadEnv()`, no Firestore handle, no file read. A module that reached for a
 * credential on import would make this guard unrunnable without credentials,
 * which is why that property is written down in `core.mjs` and asserted by
 * `tests/funnel-harness-guards.test.mjs`.
 */
async function readSpecs() {
  const out = [];
  for (const entry of readdirSync(FIXTURES_DIR).sort()) {
    if (!entry.endsWith(".mjs") || entry === "core.mjs") continue;
    const mod = await import(pathToFileURL(join(FIXTURES_DIR, entry)).href);
    out.push({ rel: `scripts/e2e-fixtures/${entry}`, spec: mod.SPEC });
  }
  return out;
}

const coversOf = (spec) => [...(spec?.covers?.routes ?? []), ...(spec?.covers?.pages ?? [])];

/* -------------------------------------------------------------------------
 * 4. The checks
 * ---------------------------------------------------------------------- */

test("the src/app walk finds the tree it is supposed to map", () => {
  // Without this, a walk rooted somewhere that no longer exists would find no
  // routes at all, every key would be trivially "covered", and this file would
  // pass by mapping nothing. The thresholds are far below today's counts (155
  // routes, 81 pages on 6 September 2026) and exist only to catch zero.
  assert.ok(
    ROUTE_KEYS.size > 100,
    `the walk found ${ROUTE_KEYS.size} route.ts files under src/app, which is far too few.`,
  );
  assert.ok(
    PAGE_KEYS.size > 50,
    `the walk found ${PAGE_KEYS.size} page.tsx files under src/app, which is far too few.`,
  );
});

test("every spec module declares a status this map can read", async () => {
  const specs = await readSpecs();
  assert.ok(specs.length > 0, "no spec module was found beside core.mjs.");
  for (const { rel, spec } of specs) {
    assert.ok(spec && typeof spec === "object", `${rel} exports no SPEC object.`);
    assert.ok(
      STATUSES.includes(spec.status),
      `${rel}: SPEC.status is ${JSON.stringify(spec.status)}. It must be one of ` +
        `${STATUSES.map((s) => JSON.stringify(s)).join(" or ")}. "verified" means this ` +
        "spec has passed end to end at least once, with a teardown manifest of zero; " +
        "until then it is \"unverified\" and its covers count for nothing here.",
    );
  }
});

test("a spec that has never passed is reported, and covers nothing", async () => {
  // Not a failure. Writing a spec and not running it is a normal state on the
  // day it is written. It is only dangerous when it is SILENT, because the map
  // would then read as covered while nothing had ever driven the routes.
  const specs = await readSpecs();
  const unverified = specs.filter(({ spec }) => spec?.status === "unverified");
  for (const { rel, spec } of unverified) {
    console.log(
      `[e2e-coverage] spec written, never run: ${spec.name} (${rel}): ` +
        `${coversOf(spec).join(", ") || "nothing declared"}`,
    );
  }
  const verified = specs.filter(({ spec }) => spec?.status === "verified");
  console.log(
    `[e2e-coverage] ${verified.length} of ${specs.length} spec module(s) are verified and ` +
      "count towards the map.",
  );
});

test("every auth battery is declared, and everything it names exists", () => {
  const files = readdirSync(BATTERIES_DIR)
    .filter((name) => name.endsWith(".test.mjs"))
    .sort();
  assert.ok(files.length > 0, `no batteries found under ${relative(REPO_ROOT, BATTERIES_DIR)}.`);

  // Both directions. A battery with no entry is a battery whose coverage this
  // map cannot see; an entry with no battery is a claim about a file somebody
  // deleted.
  for (const name of files) {
    assert.ok(
      AUTH_BATTERIES[name],
      `scripts/e2e/tests/${name} has no AUTH_BATTERIES entry, so whatever it drives is ` +
        "invisible to this map. Read it and add one naming the routes it exercises.",
    );
  }
  for (const name of Object.keys(AUTH_BATTERIES)) {
    assert.ok(
      files.includes(name),
      `AUTH_BATTERIES names scripts/e2e/tests/${name}, which does not exist. Delete the ` +
        "entry, or point it at the file that replaced it.",
    );
  }

  for (const [name, battery] of Object.entries(AUTH_BATTERIES)) {
    assert.ok(
      typeof battery.why === "string" && battery.why.length >= 25,
      `AUTH_BATTERIES["${name}"].why must say what the battery protects.`,
    );
    for (const key of battery.drives) {
      assert.ok(
        ALL_KEYS.has(key),
        `AUTH_BATTERIES["${name}"] drives ${JSON.stringify(key)}, which is not a route or ` +
          "page in src/app. Keys are the src/app path with /route.ts or /page.tsx removed.",
      );
    }
    for (const key of battery.redirectOnly ?? []) {
      assert.ok(
        ALL_KEYS.has(key),
        `AUTH_BATTERIES["${name}"].redirectOnly names ${JSON.stringify(key)}, which is not ` +
          "a page in src/app.",
      );
    }
    for (const [path, why] of Object.entries(battery.unmappedPaths ?? {})) {
      assert.ok(
        why.length >= 25,
        `AUTH_BATTERIES["${name}"].unmappedPaths["${path}"] needs a written reason.`,
      );
      // The one thing worth asserting about an unmapped path: that it is still
      // unmapped. A page landing there turns a declared hole into real
      // coverage nobody recorded.
      const asPageKeys = [...PAGE_KEYS.keys()].filter((key) =>
        key.replace(/\/\([^)]+\)/g, "") === path,
      );
      assert.equal(
        asPageKeys.length,
        0,
        `AUTH_BATTERIES["${name}"].unmappedPaths lists ${path} as having no page, but ` +
          `${asPageKeys.join(", ")} now serves it. Move it into drives or redirectOnly.`,
      );
    }
  }
});

test("every route and page is exercised, or written down as a gap", async () => {
  const specs = await readSpecs();
  const verified = specs.filter(({ spec }) => spec?.status === "verified");
  const unverified = specs.filter(({ spec }) => spec?.status !== "verified");

  /** key -> what exercises it, for the summary and the failure messages. */
  const exercised = new Map();
  for (const { rel, spec } of verified) {
    for (const key of coversOf(spec)) {
      exercised.set(key, `${spec.name} (${rel})`);
    }
  }
  for (const [name, battery] of Object.entries(AUTH_BATTERIES)) {
    for (const key of battery.drives) {
      const before = exercised.get(key);
      exercised.set(key, before ? `${before}, scripts/e2e/tests/${name}` : `scripts/e2e/tests/${name}`);
    }
  }

  const gaps = [];
  for (const [key, file] of ALL_KEYS) {
    if (exercised.has(key)) continue;
    if (NOT_COVERED[key]) continue;
    const claimed = unverified
      .filter(({ spec }) => coversOf(spec).includes(key))
      .map(({ rel }) => rel);
    gaps.push(
      `${key} (${file}) is exercised by nothing and has no NOT_COVERED entry.` +
        (claimed.length > 0
          ? ` ${claimed.join(", ")} ${claimed.length === 1 ? "claims" : "claim"} it, but ` +
            `${claimed.length === 1 ? "its" : "their"} SPEC.status is "unverified", so it ` +
            "counts for nothing until the spec has passed once."
          : " Write a spec for it, or add an entry saying why it is uncovered and what " +
            "would trigger covering it."),
    );
  }

  console.log(
    `[e2e-coverage] ${exercised.size} of ${ALL_KEYS.size} routes and pages are exercised; ` +
      `${Object.keys(NOT_COVERED).length} are written down as gaps.`,
  );
  assert.deepEqual(gaps, [], `\n${gaps.join("\n")}\n`);
});

test("no NOT_COVERED entry has gone stale", async () => {
  const specs = await readSpecs();
  const verified = specs.filter(({ spec }) => spec?.status === "verified");
  const stale = [];

  for (const key of Object.keys(NOT_COVERED)) {
    if (!ALL_KEYS.has(key)) {
      stale.push(
        `${key} is in NOT_COVERED but is no longer a route or page in src/app. It moved or ` +
          "was deleted, and its reason went with it. Delete the entry, or re-key it.",
      );
      continue;
    }
    const by = verified.filter(({ spec }) => coversOf(spec).includes(key));
    if (by.length > 0) {
      stale.push(
        `${key} is in NOT_COVERED and is also covered by ${by
          .map(({ spec }) => spec.name)
          .join(", ")}, which is verified. A key is covered or it is a written-down gap, ` +
          "never both: delete the entry in the same pull request as the spec that covers it.",
      );
    }
    // A battery's own routes are covered the same way, minus the pages it only
    // ever sees a redirect from, which are deliberately in both lists.
    for (const [name, battery] of Object.entries(AUTH_BATTERIES)) {
      if (battery.drives.includes(key)) {
        stale.push(
          `${key} is in NOT_COVERED and is driven by scripts/e2e/tests/${name}. Delete the ` +
            "entry: a route a battery exercises is covered.",
        );
      }
    }
  }
  assert.deepEqual(stale, [], `\n${stale.join("\n")}\n`);
});

test("every NOT_COVERED entry carries a real reason and a real trigger", () => {
  const bad = [];
  for (const [key, entry] of Object.entries(NOT_COVERED)) {
    if (typeof entry?.reason !== "string" || entry.reason.trim().length < 25) {
      bad.push(
        `${key}: reason must be a sentence saying why the gap is acceptable today, not ` +
          `${JSON.stringify(entry?.reason)}.`,
      );
    }
    if (typeof entry?.coverWhen !== "string" || entry.coverWhen.trim().length < 15) {
      bad.push(
        `${key}: coverWhen must name the trigger that closes the gap, not ` +
          `${JSON.stringify(entry?.coverWhen)}. A trigger is a thing that happens ` +
          "(a rebuild lands, a real export arrives, a spec reaches this screen), never " +
          "an intention.",
      );
    }
    /**
     * THE CIRCULAR TRIGGER, which the length check above cannot see. "When a
     * course spec drives /api/courses/[courseId]/publish for a seeded run" is
     * eighty characters of nothing: it says the gap closes when somebody
     * closes it. A trigger names an event OUTSIDE this file (a rebuild lands,
     * a cohort starts, a real export arrives, the risk-ordered list gets
     * here), and the cheapest tell of the circular kind is that it recites its
     * own key back. So a coverWhen may not name the route or page it belongs
     * to. The `reason` may, and does: that one is allowed to describe the
     * surface.
     */
    if (typeof entry?.coverWhen === "string" && entry.coverWhen.includes(key)) {
      bad.push(
        `${key}: coverWhen names its own key back, which makes it circular: it says the gap ` +
          "closes when somebody closes it. Name the event that will prompt the spec instead " +
          "(a rebuild landing, a cohort starting, a real export arriving, the risk-ordered " +
          "list reaching this group).",
      );
    }
    for (const field of Object.keys(entry ?? {})) {
      assert.ok(
        ["reason", "coverWhen"].includes(field),
        `${key}: unknown field ${JSON.stringify(field)}. An entry is { reason, coverWhen }.`,
      );
    }
  }
  assert.deepEqual(bad, [], `\n${bad.join("\n")}\n`);
});

test("every covers key resolves to a route or page that exists", async () => {
  // Also checked by tests/funnel-harness-guards.test.mjs, on purpose. That one
  // is the SPEC contract; this one is the map. They agree today, and the day
  // somebody relaxes one of them the other still fails.
  const specs = await readSpecs();
  const wrong = [];
  for (const { rel, spec } of specs) {
    for (const key of spec?.covers?.routes ?? []) {
      if (!ROUTE_KEYS.has(key)) wrong.push(`${rel}: covers.routes names ${key}, which is not a route.`);
    }
    for (const key of spec?.covers?.pages ?? []) {
      if (!PAGE_KEYS.has(key)) wrong.push(`${rel}: covers.pages names ${key}, which is not a page.`);
    }
  }
  assert.deepEqual(wrong, [], `\n${wrong.join("\n")}\n`);
});

test("the pages a battery only redirects off are written down as such", async () => {
  const specs = await readSpecs();
  const covered = new Set(
    specs.filter(({ spec }) => spec?.status === "verified").flatMap(({ spec }) => coversOf(spec)),
  );
  // The trap this closes: counting a 307 as coverage. The protected-route-gate
  // battery requests /dashboard and friends as a signed-out visitor and
  // asserts the redirect. Nothing renders. So each of those pages stays a
  // written-down gap, and its reason has to SAY that the redirect is all that
  // is asserted, or the next reader will take the entry as pessimism and
  // delete it.
  const missing = [];
  for (const [name, battery] of Object.entries(AUTH_BATTERIES)) {
    for (const key of battery.redirectOnly ?? []) {
      // A verified spec that really drives the page settles the question: the
      // page is covered, the redirect note is moot, and the stale check above
      // has already required the NOT_COVERED entry to be gone.
      if (covered.has(key)) continue;
      const entry = NOT_COVERED[key];
      if (!entry) {
        missing.push(
          `${key} is redirect-only for scripts/e2e/tests/${name} and has no NOT_COVERED ` +
            "entry. A redirect is not coverage of the page behind it.",
        );
        continue;
      }
      if (!/redirect/i.test(entry.reason)) {
        missing.push(
          `${key}: scripts/e2e/tests/${name} asserts only the signed-out redirect off this ` +
            "page, and the NOT_COVERED reason does not say so.",
        );
      }
    }
  }
  assert.deepEqual(missing, [], `\n${missing.join("\n")}\n`);
});
