/**
 * NO EVENT WRITE IN A VIEW-AS SESSION, asked of the real handlers.
 *
 * Admin "view as" swaps the session for the member's, so a write made in one
 * is recorded as the member making it: a request approved in their name, a
 * place asked for as them, an event published or emailed about by them. So
 * every handler under `src/app/api/events` that writes or sends refuses
 * while the view-as marker is live, before it reads anything.
 *
 * `tests/impersonation-guard.test.mjs` holds the same rule by reading the
 * source (the events tree is one of its guarded trees). This suite asks the
 * handlers themselves: it walks the tree, finds every POST, PUT, PATCH and
 * DELETE, and calls each one in a view-as session as a person every gate in
 * the tree would admit (an admin's powers, named on the event, every
 * permission), at an event with sign-ups of every kind and a body each
 * handler would act on. Each must answer the view-as refusal, write nothing
 * and send nothing. A handler added to the tree is asked the day it lands.
 *
 * And the other half: a signed-out person holding the link in their own
 * email is not in a view-as session, so the token paths still work.
 *
 * The world is `tests/lib/checkInWorld.mjs`. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_ID, RSVP, makeCheckInWorld, person, withEvent } from "./lib/checkInWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TREE = join(REPO_ROOT, "src", "app", "api", "events");
const MAIL = "__eventViewAsMail";

process.env.EVENTS_TOKEN_SECRET = "a-secret-for-the-view-as-suite-only-0123456789";

const w = await makeCheckInWorld("__eventViewAs", {
  stubs: [
    // Every email and push is kept, never sent: a refused write sends nothing.
    ["@/lib/events/sendRsvpEmail", `export const sendRsvpEmail = async (args) => { (globalThis.${MAIL} ||= []).push(args); };`],
  ],
});

/** Every route file under the events tree, repo-relative. */
function routeFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(path));
    else if (entry.name === "route.ts") out.push(path);
  }
  return out.sort();
}

const MUTATING = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\(|export\s+const\s+(POST|PUT|PATCH|DELETE)\s*[:=]/g;

/** `[file, method]` for every mutating handler in the tree. */
const HANDLERS = routeFiles(TREE).flatMap((file) => {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(MUTATING)].map((m) => [relative(join(REPO_ROOT, "src"), file).split(sep).join("/"), m[1] ?? m[2]]);
});

/** Somebody every gate in the tree admits: an admin's role, named on the event, holding every permission. */
const ALL_POWERS = person("zach", "admin", "Zach Levin", {
  suRecognised: true,
  permissions: {
    draftEvent: true,
    approveEvent: true,
    draftNewsletter: true,
    approveNewsletter: true,
    manageMembership: true,
  },
});

/** A body each handler would act on, so a refusal is the guard's and not the body's. */
const BODY = {
  note: "A note",
  t: "x".repeat(32),
  token: "x".repeat(32),
  rsvpId: RSVP.gwen,
  name: "Someone New",
  email: "someone.new@example.com",
  answers: {},
  preview: false,
  subject: "A message to everybody",
  message: "Hello",
  count: 3,
  uids: ["kofi"],
  title: "VR games night",
  startAt: "2026-11-01T14:00:00Z",
  endAt: "2026-11-01T17:00:00Z",
  include: ["role:member"],
  exclude: [],
  doorCode: true,
};

/** The view-as refusal as the world's guard returns it. */
const REFUSED = { error: "Not while you are viewing as someone else." };

function paramsFor(file) {
  const params = { id: EVENT_ID };
  if (file.includes("[rsvpId]")) params.rsvpId = RSVP.pat;
  if (file.includes("[checkInId]")) params.checkInId = "some-check-in";
  return params;
}

describe("every event write refuses a view-as session, through the real handler", () => {
  test("the tree has the writes this suite is about", () => {
    const files = new Set(HANDLERS.map(([file]) => file));
    for (const expected of [
      "app/api/events/[id]/rsvp/[rsvpId]/approve/route.ts",
      "app/api/events/[id]/rsvp/[rsvpId]/deny/route.ts",
      "app/api/events/[id]/rsvp/route.ts",
      "app/api/events/[id]/update/route.ts",
      "app/api/events/[id]/publish/route.ts",
      "app/api/events/[id]/broadcast/route.ts",
      "app/api/events/[id]/delete/route.ts",
    ]) {
      assert.ok(files.has(expected), `${expected} is not in the tree the suite walked`);
    }
  });

  for (const [file, method] of HANDLERS) {
    test(`${method} ${file.replace(/^app/, "").replace(/\/route\.ts$/, "")}`, async () => {
      w.reset(withEvent({ signupForm: [] }));
      globalThis[MAIL] = [];
      const route = await w.load(file);
      const before = w.everything();
      w.world.viewingAs = true;
      const res = await w.call(route[method], {
        as: ALL_POWERS,
        params: paramsFor(file),
        url: `https://internal.invalid/api/events/${EVENT_ID}`,
        body: BODY,
      });
      w.world.viewingAs = false;
      assert.equal(res.status, 403, `${method} ${file} answered ${res.status} in a view-as session`);
      assert.deepEqual(res.body, REFUSED, `${method} ${file} did not answer with the view-as refusal`);
      assert.equal(w.everything(), before, `${method} ${file} wrote in a view-as session`);
      assert.deepEqual(globalThis[MAIL], [], `${method} ${file} sent an email in a view-as session`);
    });
  }
});

describe("a signed-out link is not a view-as session", () => {
  test("a guest's own cancel link still gives the place back", async () => {
    const tokens = await w.load("lib/events/rsvpToken.ts");
    const cancel = await w.load("app/api/events/[id]/rsvp/[rsvpId]/cancel/route.ts");
    w.reset();
    globalThis[MAIL] = [];
    const t = tokens.signRsvpToken(RSVP.gwen, "gwen@example.com");
    const res = await w.call(cancel.POST, { as: null, params: { id: EVENT_ID, rsvpId: RSVP.gwen }, body: { t } });
    assert.equal(res.status, 200);
    assert.equal(w.world.db.read(`eventRsvps/${RSVP.gwen}`).status, "cancelled");
  });
});
