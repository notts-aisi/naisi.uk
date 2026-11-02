/**
 * WHAT THE SIGN-UP ROUTES SAY WHEN THEY REFUSE OR FAIL: nothing the caller
 * may not learn.
 *
 *  - A failure inside the database answers one fixed sentence and keeps the
 *    detail for the server's log. An error's own message can carry a
 *    collection path, an index address or the project's id, and the cancel
 *    route answers somebody signed out holding a link.
 *  - Approve and Turn down on a request that is no longer waiting say it has
 *    been decided, never what it became: an organiser the Students' Union does
 *    not recognise is shown the requests waiting and nobody already holding a
 *    place, so "was confirmed" would tell them what the rule hides.
 *  - Giving a place back checks the caller's right (the link's token, the
 *    sign-up's own account, or an organiser who may) before it says anything
 *    about the sign-up: a missing one, another event's, and one the caller may
 *    not touch all get the same answer. And its answer says nothing about
 *    anybody else: not who was moved up from the waiting list. Asking to
 *    change a sign-up's answers, the other route a signed-out link reaches,
 *    checks the right first in the same way.
 *
 * Through the real routes. The world is `tests/lib/checkInWorld.mjs`: Iris
 * (committee the SU does not recognise) wrote the event, Cal (the same) helps
 * with it, Kofi holds a place, Gwen is a guest holding one, Wren is on the
 * waiting list and Pat is waiting for a decision. Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BEFORE, EVENT_ID, RSVP, makeCheckInWorld, withEvent } from "./lib/checkInWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAIL = "__rsvpAnswersMail";

process.env.EVENTS_TOKEN_SECRET = "a-secret-for-the-rsvp-answers-suite-only-0123456789";

const w = await makeCheckInWorld("__rsvpAnswers", {
  stubs: [["@/lib/events/sendRsvpEmail", `export const sendRsvpEmail = async (args) => { (globalThis.${MAIL} ||= []).push(args); };`]],
});
const { call, load } = w;
const cancel = await load("app/api/events/[id]/rsvp/[rsvpId]/cancel/route.ts");
const approve = await load("app/api/events/[id]/rsvp/[rsvpId]/approve/route.ts");
const deny = await load("app/api/events/[id]/rsvp/[rsvpId]/deny/route.ts");
const requestChange = await load("app/api/events/[id]/rsvp/[rsvpId]/request-change/route.ts");
const tokens = await load("lib/events/rsvpToken.ts");

const link = (rsvpId, email) => tokens.signRsvpToken(rsvpId, email);
const short = (res) => [res.status, res.body?.error ?? null];

/** What a Firestore failure's own message can carry. */
const INSIDE =
  "9 FAILED_PRECONDITION: The query requires an index. You can create it here: " +
  "https://console.firebase.google.com/v1/r/project/naisi-uk/firestore/indexes?create_composite=eventRsvps";

function failingDatabase(t) {
  t.mock.method(console, "error", () => {});
  w.world.db.runTransaction = async () => {
    throw new Error(INSIDE);
  };
}

describe("a failure inside the database answers a fixed sentence", () => {
  const cases = [
    ["giving a place back", () => cancel.POST, "kofi", RSVP.kofi],
    ["approving", () => approve.POST, "cal", RSVP.pat],
    ["turning down", () => deny.POST, "cal", RSVP.pat],
  ];
  for (const [what, handler, who, rsvpId] of cases) {
    test(what, async (t) => {
      w.reset();
      failingDatabase(t);
      const res = await call(handler(), { as: who, params: { id: EVENT_ID, rsvpId }, body: {} });
      assert.equal(res.status, 500);
      const said = JSON.stringify(res.body);
      for (const piece of ["FAILED_PRECONDITION", "console.firebase", "naisi-uk", "eventRsvps", "index"]) {
        assert.ok(!said.includes(piece), `${what} answered with the error's own words: ${said}`);
      }
      assert.deepEqual(Object.keys(res.body), ["error"]);
      assert.ok(console.error.mock.calls.length > 0, "the detail is kept for the server's log");
    });
  }

  test("no route in the events tree answers with a caught error's own message", () => {
    const tree = join(REPO_ROOT, "src", "app", "api", "events");
    const files = [];
    (function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "route.ts") files.push(path);
      }
    })(tree);
    assert.ok(files.length > 20, "the events tree was walked");
    // `err instanceof SomethingError ? err.message` of the route's own error
    // class is its own sentence; `instanceof Error ? err.message` is anybody's.
    const RAW = /instanceof\s+Error\s*\?\s*\w+\.message|String\(\s*(?:err|error|e)\s*\)|\{\s*error:\s*(?:err|error|e)\s*\}/;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const where = relative(REPO_ROOT, file).split(sep).join("/");
      assert.doesNotMatch(source, RAW, `${where} hands a caught error's own message to the caller`);
    }
  });
});

describe("approve and turn down say a request was decided, never what it became", () => {
  const decided = [
    [RSVP.kofi, "confirmed"],
    [RSVP.wren, "waitlisted"],
    [RSVP.cora, "cancelled"],
    [RSVP.dina, "denied"],
  ];
  for (const [name, handler] of [
    ["approve", () => approve.POST],
    ["turn down", () => deny.POST],
  ]) {
    test(`${name}: the same words for every request no longer waiting, and nothing changes`, async () => {
      w.reset();
      const before = w.everything();
      const answers = new Set();
      for (const [rsvpId, status] of decided) {
        const res = await call(handler(), { as: "cal", params: { id: EVENT_ID, rsvpId }, body: {} });
        assert.equal(res.status, 400, `${name} on a ${status} request`);
        assert.ok(!JSON.stringify(res.body).includes(status), `${name} said the request became ${status}`);
        answers.add(JSON.stringify(res.body));
      }
      assert.equal(answers.size, 1, `${name} told the requests apart: ${[...answers].join(" | ")}`);
      assert.equal(w.everything(), before);
    });
  }
});

describe("giving a place back: the right first, one refusal, nothing about anybody else", () => {
  test("signed out, a sign-up that exists, one that does not and another event's all get the same answer without a good link", async () => {
    w.reset({
      "eventRsvps/rsvp-elsewhere": {
        eventId: "another-event-ev02",
        uid: null,
        name: "Ella Stone",
        email: "ella@example.com",
        answers: {},
        status: "confirmed",
        synthetic: false,
      },
    });
    const before = w.everything();
    const asked = [
      ["a guest's sign-up, no link", RSVP.gwen, {}],
      ["a guest's sign-up, a wrong link", RSVP.gwen, { t: "y".repeat(32) }],
      ["a guest's sign-up, somebody else's link", RSVP.gwen, { t: link(RSVP.kofi, "kofi@example.com") }],
      ["a member's sign-up, no link", RSVP.kofi, {}],
      ["no such sign-up", "no-such-rsvp", { t: link("no-such-rsvp", "gwen@example.com") }],
      ["another event's sign-up, its own good link", "rsvp-elsewhere", { t: link("rsvp-elsewhere", "ella@example.com") }],
    ];
    const answers = new Set();
    for (const [what, rsvpId, body] of asked) {
      const res = await call(cancel.POST, { as: null, params: { id: EVENT_ID, rsvpId }, body });
      assert.equal(res.status, 404, what);
      answers.add(JSON.stringify(res.body));
    }
    assert.equal(answers.size, 1, `the refusals told the cases apart: ${[...answers].join(" | ")}`);
    assert.equal(w.everything(), before, "a refusal wrote something");
  });

  test("signed in as somebody with no right to it: the same answer as a sign-up that is not there", async () => {
    w.reset();
    const theirs = await call(cancel.POST, { as: "mo", params: { id: EVENT_ID, rsvpId: RSVP.kofi }, body: {} });
    const nobody = await call(cancel.POST, { as: "mo", params: { id: EVENT_ID, rsvpId: "no-such-rsvp" }, body: {} });
    assert.deepEqual(short(theirs), short(nobody));
    assert.equal(theirs.status, 404);
    assert.equal(w.world.db.read(`eventRsvps/${RSVP.kofi}`).status, "confirmed");
  });

  test("a good link gives the place back and moves the waiting list up, and the answer names nobody else", async (t) => {
    // A week before the event: once it has started nobody is moved up.
    t.mock.timers.enable({ apis: ["Date"], now: BEFORE });
    w.reset(withEvent({ capacity: 3 }));
    globalThis[MAIL] = [];
    const res = await call(cancel.POST, {
      as: null,
      params: { id: EVENT_ID, rsvpId: RSVP.gwen },
      body: { t: link(RSVP.gwen, "gwen@example.com") },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, status: "cancelled", started: false });
    assert.ok(!JSON.stringify(res.body).includes(RSVP.wren), "the answer named the person moved up");
    assert.equal(w.world.db.read(`eventRsvps/${RSVP.gwen}`).status, "cancelled");
    assert.equal(w.world.db.read(`eventRsvps/${RSVP.wren}`).status, "confirmed", "Wren was moved up");
    assert.ok(globalThis[MAIL].some((sent) => sent.to === "wren@example.com" && sent.variant === "promoted"), "Wren was told");
  });

  test("the sign-up's own account and an organiser who may still give it back", async () => {
    w.reset();
    assert.equal((await call(cancel.POST, { as: "kofi", params: { id: EVENT_ID, rsvpId: RSVP.kofi }, body: {} })).status, 200);
    assert.equal((await call(cancel.POST, { as: "zach", params: { id: EVENT_ID, rsvpId: RSVP.chloe }, body: {} })).status, 200);
    assert.equal(w.world.db.read(`eventRsvps/${RSVP.kofi}`).status, "cancelled");
    assert.equal(w.world.db.read(`eventRsvps/${RSVP.chloe}`).status, "cancelled");
  });
});

describe("asking to change a sign-up's answers: the right first, one refusal", () => {
  test("signed out without a good link, a live sign-up, a cancelled one, a turned-down one, a missing one and another event's all get the same answer", async () => {
    w.reset({
      ...withEvent({ signupForm: [{ id: "q_game", type: "shortText", label: "Which game first?", required: false }] }),
      "eventRsvps/rsvp-elsewhere": {
        eventId: "another-event-ev02",
        uid: null,
        name: "Ella Stone",
        email: "ella@example.com",
        answers: {},
        status: "confirmed",
        synthetic: false,
      },
    });
    const before = w.everything();
    const answers = { q_game: "Beat Saber" };
    const asked = [
      ["a live sign-up, no link", RSVP.gwen, { answers }],
      ["a cancelled sign-up, no link", RSVP.cora, { answers }],
      ["a turned-down sign-up, no link", RSVP.dina, { answers }],
      ["a live sign-up, a wrong link", RSVP.gwen, { answers, t: "y".repeat(32) }],
      ["no such sign-up", "no-such-rsvp", { answers, t: link("no-such-rsvp", "gwen@example.com") }],
      ["another event's sign-up, its own good link", "rsvp-elsewhere", { answers, t: link("rsvp-elsewhere", "ella@example.com") }],
    ];
    const said = new Set();
    for (const [what, rsvpId, body] of asked) {
      const res = await call(requestChange.POST, { as: null, params: { id: EVENT_ID, rsvpId }, body });
      assert.equal(res.status, 404, what);
      said.add(JSON.stringify(res.body));
    }
    assert.equal(said.size, 1, `the refusals told the cases apart: ${[...said].join(" | ")}`);
    assert.equal(w.everything(), before, "a refusal wrote something");
  });

  test("a good link still asks for the change; on a cancelled sign-up it says so, to the person holding it", async () => {
    w.reset(withEvent({ signupForm: [{ id: "q_game", type: "shortText", label: "Which game first?", required: false }] }));
    const ok = await call(requestChange.POST, {
      as: null,
      params: { id: EVENT_ID, rsvpId: RSVP.gwen },
      body: { answers: { q_game: "Beat Saber" }, t: link(RSVP.gwen, "gwen@example.com") },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(w.world.db.read(`eventRsvps/${RSVP.gwen}`).pendingAnswers, { q_game: "Beat Saber" });
    const gone = await call(requestChange.POST, {
      as: null,
      params: { id: EVENT_ID, rsvpId: RSVP.cora },
      body: { answers: { q_game: "Beat Saber" }, t: link(RSVP.cora, "cora@example.com") },
    });
    assert.equal(gone.status, 400);
    assert.match(gone.body.error, /cancelled or denied/);
  });
});
