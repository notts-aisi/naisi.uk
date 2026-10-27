/**
 * WHO MAY DELETE AN EVENT, through the real route.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The rule: an event that was told to the public is cancelled, never deleted.
 * An author holding `draftEvent` may delete only an event that was never
 * published, so a draft, a pending, an approved and a rejected one; a
 * published one and a cancelled one stay, with their sign-ups and check-ins,
 * and the cancelled event stays at its link. An admin may delete any event.
 * The editor offers Delete on the same events for an author, and on every
 * event that is not published for an admin (a published one is cancelled
 * first).
 *
 * Driven: the delete handler as the author, the author without the draft
 * permission, another member of the committee, a member, a pending account,
 * signed out, and an admin, on each status. A refusal changes nothing.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DURING, EVENT_ID, PEOPLE, RSVP, eventDoc, makeCheckInWorld } from "./lib/checkInWorld.mjs";

const w = await makeCheckInWorld("__eventDeleteGate");
const route = await w.load("app/api/events/[id]/delete/route.ts");
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const AUTHOR = { ...PEOPLE.iris, permissions: { draftEvent: true } };
const AUTHOR_WITHOUT = { ...PEOPLE.iris, permissions: {} };
const OTHER_DRAFTER = { ...PEOPLE.cal, permissions: { draftEvent: true } };

const seedWith = (status) => ({
  [`events/${EVENT_ID}`]: eventDoc({ status }),
  "eventCheckIns/c1": { eventId: EVENT_ID, kind: "walk-in", name: "Somebody", how: "door", at: DURING, namesOff: false },
});
const del = (as, options = {}) => w.call(route.POST, { as, params: { id: EVENT_ID }, ...options });
const stands = () => w.world.db.read(`events/${EVENT_ID}`) !== undefined;
const signups = () => w.world.db.paths().filter((path) => path.startsWith("eventRsvps/"));
const checkIns = () => w.world.db.paths().filter((path) => path.startsWith("eventCheckIns/"));

describe("the author deletes an event that was never published", () => {
  for (const status of ["draft", "pending", "approved", "rejected"]) {
    test(`a ${status} event goes, with its sign-ups and check-ins`, async () => {
      w.reset(seedWith(status));
      const res = await del(AUTHOR);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.checkInsDeleted, 1);
      assert.equal(stands(), false);
      assert.equal(signups().length, 0);
      assert.equal(checkIns().length, 0);
    });
  }
});

describe("an event that was published stays for its author", () => {
  for (const status of ["published", "cancelled"]) {
    test(`a ${status} event is refused, and nothing is deleted`, async () => {
      w.reset(seedWith(status));
      const before = w.everything();
      const res = await del(AUTHOR);
      assert.deepEqual([res.status, res.body.error], [403, "Forbidden"]);
      assert.equal(w.everything(), before);
      assert.equal(stands(), true);
      assert.ok(signups().includes(`eventRsvps/${RSVP.kofi}`));
      assert.equal(checkIns().length, 1);
    });
  }

  test("a cancelled event is still refused once its date has passed", async () => {
    w.reset({ [`events/${EVENT_ID}`]: eventDoc({ status: "cancelled", startAt: new Date("2026-01-01T10:00:00Z") }) });
    assert.equal((await del(AUTHOR)).status, 403);
    assert.equal(stands(), true);
  });
});

describe("an admin deletes an event of any status", () => {
  for (const status of ["draft", "cancelled", "published"]) {
    test(`a ${status} event goes, with its sign-ups and check-ins`, async () => {
      w.reset(seedWith(status));
      const res = await del("zach");
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(stands(), false);
      assert.equal(signups().length, 0);
      assert.equal(checkIns().length, 0);
    });
  }
});

describe("everybody else is refused, on a draft and on a cancelled event", () => {
  const CALLERS = [
    [null, "signed out", 401],
    [AUTHOR_WITHOUT, "the author without the draft permission", 403],
    [OTHER_DRAFTER, "another member of the committee holding the draft permission", 403],
    ["kofi", "a member", 403],
    ["ines", "a pending account", 403],
  ];
  for (const status of ["draft", "cancelled"]) {
    for (const [who, label, expected] of CALLERS) {
      test(`${label}, on a ${status} event`, async () => {
        w.reset(seedWith(status));
        const before = w.everything();
        const res = await del(who);
        assert.equal(res.status, expected, JSON.stringify(res.body));
        assert.equal(w.everything(), before);
      });
    }
  }
});

describe("the editor offers Delete on the events the route lets the author delete", () => {
  const source = readFileSync(join(REPO_ROOT, "src", "features", "events", "EventEditor.tsx"), "utf8");
  const start = source.indexOf("const showDelete =");
  const statement = start === -1 ? "" : source.slice(start, source.indexOf(";", start)).replace(/\s+/g, " ");

  test("the author's half holds back published and cancelled events, and the admin's only published ones", () => {
    assert.equal(
      statement,
      'const showDelete = (isAuthor && status !== "published" && status !== "cancelled") || (role === "admin" && status !== "published")',
    );
  });
});
