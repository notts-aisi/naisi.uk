/**
 * CHECK-IN RECORDS (`eventCheckIns`, `src/lib/events/checkIns.ts`): one per
 * person per event, who checked them in and when, and what is kept for how
 * long.
 *
 *  1. THE WINDOWS: the door list and the door code from an hour before the
 *     start to an hour after the end; adding from the event's page until a
 *     week after; nothing for an undated event.
 *  2. ONE RECORD PER PERSON, however many phones press at once, and the
 *     fields a record may hold, as a closed list.
 *  3. UNDO, for this event's records only.
 *  4. WHAT IS KEPT: a walk-in's email goes a week after the event, names come
 *     off a year after it, by the `event-check-ins-tidy` job, which emails
 *     nobody and so registers on. The counts stay.
 *  5. DELETIONS: an account deleted takes its name off at once (the real
 *     account cascade); an event deleted takes its check-ins (the real route).
 *  6. THE TREE: only two files address the collection, both server-only, so
 *     no browser ever reads or writes a check-in.
 *
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";
import {
  AFTER,
  BEFORE,
  DURING,
  END,
  EVENT_ID,
  RSVP,
  START,
  WEEK_LATER,
  makeCheckInWorld,
} from "./lib/checkInWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const w = await makeCheckInWorld("__eventCheckIns");
const lib = await w.load("lib/events/checkIns.ts");
const deleteRoute = await w.load("app/api/events/[id]/delete/route.ts");
const { eventCheckInsTidyJob } = await w.load("lib/scheduler/jobs/eventCheckInsTidy.ts");
const registry = await w.load("lib/scheduler/registry.ts");

const event = () => ({ id: EVENT_ID, startAt: START, endAt: END, status: "published" });
const rsvpOf = (key) => ({ id: RSVP[key], ...w.world.db.read(`eventRsvps/${RSVP[key]}`) });
const checkIns = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("eventCheckIns/"))
    .map((path) => ({ id: path.split("/")[1], ...w.world.db.read(path) }));

const RECORD_FIELDS = [
  "at",
  "byUid",
  "email",
  "emailGoesAt",
  "eventId",
  "how",
  "kind",
  "name",
  "namesOff",
  "namesOffAt",
  "rsvpId",
  "uid",
];

// ---------------------------------------------------------------------------
// 1. The windows
// ---------------------------------------------------------------------------

describe("when check-in is open", () => {
  test("the door list from an hour before the start to an hour after the end: 1pm to 6pm", () => {
    const door = lib.doorWindow(event());
    assert.equal(door.opensAt.toISOString(), "2026-11-01T13:00:00.000Z");
    assert.equal(door.closesAt.toISOString(), "2026-11-01T18:00:00.000Z");
  });

  test("each phase, at its edges", () => {
    const at = (iso) => lib.checkInPhase(event(), new Date(iso));
    assert.equal(lib.checkInPhase(event(), BEFORE), "before");
    assert.equal(at("2026-11-01T12:59:59Z"), "before");
    assert.equal(at("2026-11-01T13:00:00Z"), "door");
    assert.equal(lib.checkInPhase(event(), DURING), "door");
    assert.equal(at("2026-11-01T18:00:00Z"), "door");
    assert.equal(at("2026-11-01T18:00:01Z"), "later");
    assert.equal(lib.checkInPhase(event(), AFTER), "later");
    assert.equal(at("2026-11-08T17:00:00Z"), "later", "a week after the end, to the minute");
    assert.equal(at("2026-11-08T17:00:01Z"), "closed");
    assert.equal(lib.checkInPhase(event(), WEEK_LATER), "closed");
    assert.equal(lib.checkInPhase({ startAt: null, endAt: null }, DURING), "undated");
  });

  test("an event with no end is timed from its start", () => {
    const door = lib.doorWindow({ startAt: START, endAt: null });
    assert.equal(door.closesAt.toISOString(), "2026-11-01T15:00:00.000Z");
  });

  test("a walk-in's email goes a week after the event; names come off a year after it", () => {
    assert.equal(lib.walkInEmailGoesAt(event()).toISOString(), "2026-11-08T17:00:00.000Z");
    assert.equal(lib.checkInNamesOffAt(event()).toISOString(), "2027-11-01T17:00:00.000Z");
  });

  test("only a published event has a door", () => {
    for (const status of ["draft", "pending", "approved", "rejected", "cancelled"]) {
      assert.equal(lib.eventTakesCheckIns({ status }), false, status);
    }
    assert.equal(lib.eventTakesCheckIns({ status: "published" }), true);
  });

  test("the door list: confirmed, then the waiting list and the undecided; never cancelled, refused or a test", () => {
    w.reset();
    const rows = Object.keys(RSVP).map(rsvpOf);
    const shown = lib.doorListSignups(rows).map((row) => row.id);
    assert.deepEqual(shown.sort(), [RSVP.chloe, RSVP.gwen, RSVP.kofi, RSVP.pat, RSVP.wren].sort());
  });
});

// ---------------------------------------------------------------------------
// 2. One record per person
// ---------------------------------------------------------------------------

describe("one record per person per event", () => {
  test("a sign-up checked in at the door: who, how, by whom and when, and nothing else", async () => {
    w.reset();
    const made = await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "signup", rsvp: rsvpOf("kofi") },
      how: "door",
      byUid: "sue",
      now: DURING,
    });
    assert.equal(made.created, true);
    const [row] = checkIns();
    assert.deepEqual(Object.keys(row).filter((k) => k !== "id").sort(), RECORD_FIELDS);
    assert.deepEqual(
      { ...row, id: undefined },
      {
        id: undefined,
        eventId: EVENT_ID,
        kind: "signup",
        rsvpId: RSVP.kofi,
        uid: "kofi",
        name: null,
        email: null,
        emailGoesAt: null,
        how: "door",
        byUid: "sue",
        at: DURING,
        namesOffAt: new Date("2027-11-01T17:00:00Z"),
        namesOff: false,
      },
    );
    assert.ok(!row.id.includes("kofi") && !row.id.includes(RSVP.kofi), "the id names nobody");
  });

  test("pressed twice, on the door list and with the code, still one record", async () => {
    w.reset();
    const first = await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "signup", rsvp: rsvpOf("kofi") },
      how: "qr",
      byUid: null,
      now: DURING,
    });
    const second = await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "signup", rsvp: rsvpOf("kofi") },
      how: "door",
      byUid: "sue",
      now: new Date(DURING.getTime() + 60_000),
    });
    assert.equal(second.created, false);
    assert.equal(second.checkIn.id, first.checkIn.id);
    assert.equal(second.checkIn.how, "qr", "the first one stands");
    assert.equal(checkIns().length, 1);
  });

  test("two phones at the same moment: one record", async () => {
    w.reset();
    const press = (byUid) =>
      lib.recordCheckIn(w.world.db, {
        event: event(),
        person: { kind: "signup", rsvp: rsvpOf("chloe") },
        how: "door",
        byUid,
        now: DURING,
      });
    const [a, b] = await Promise.all([press("sue"), press("zach")]);
    assert.equal(checkIns().length, 1);
    assert.equal([a.created, b.created].filter(Boolean).length, 1);
  });

  test("an account with no sign-up is a walk-in with its account, once; a sign-up of the same account is the same person", async () => {
    w.reset();
    const mo = await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "account", uid: "mo", name: "Mo Rahman" },
      how: "qr",
      byUid: null,
      now: DURING,
    });
    assert.deepEqual([mo.created, mo.checkIn.kind, mo.checkIn.uid, mo.checkIn.name], [true, "walk-in", "mo", "Mo Rahman"]);
    const again = await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "account", uid: "mo", name: "Mo Rahman" },
      how: "qr",
      byUid: null,
      now: DURING,
    });
    assert.equal(again.created, false);
    const asSignup = await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "signup", rsvp: { id: "rsvp-mo-late", uid: "mo", eventId: EVENT_ID } },
      how: "door",
      byUid: "sue",
      now: DURING,
    });
    assert.equal(asSignup.created, false, "the same account is the same person");
    assert.equal(checkIns().length, 1);
  });

  test("walk-ins with no account are each their own; an email is kept with its day to go", async () => {
    w.reset();
    for (const [name, email] of [
      ["Dan Fitzgerald", "dan@example.com"],
      ["Dan Fitzgerald", null],
    ]) {
      const made = await lib.recordCheckIn(w.world.db, {
        event: event(),
        person: { kind: "walk-in", name, email },
        how: "door",
        byUid: "sue",
        now: DURING,
      });
      assert.equal(made.created, true);
    }
    const rows = checkIns();
    assert.equal(rows.length, 2);
    const withEmail = rows.find((row) => row.email);
    assert.equal(withEmail.emailGoesAt.toISOString(), "2026-11-08T17:00:00.000Z");
    assert.equal(rows.find((row) => !row.email).emailGoesAt, null);
  });

  test("a sign-up of another event is refused", async () => {
    w.reset();
    await assert.rejects(
      lib.recordCheckIn(w.world.db, {
        event: event(),
        person: { kind: "signup", rsvp: { id: "x", uid: null, eventId: "another-event" } },
        how: "door",
        byUid: "sue",
        now: DURING,
      }),
      /another event/,
    );
    assert.equal(checkIns().length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Undo
// ---------------------------------------------------------------------------

describe("undoing a check-in", () => {
  test("removes this event's record, and only this event's", async () => {
    w.reset();
    const made = await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "signup", rsvp: rsvpOf("kofi") },
      how: "door",
      byUid: "sue",
      now: DURING,
    });
    assert.equal(await lib.removeCheckIn(w.world.db, "another-event", made.checkIn.id), null);
    assert.equal(checkIns().length, 1);
    const removed = await lib.removeCheckIn(w.world.db, EVENT_ID, made.checkIn.id);
    assert.equal(removed.id, made.checkIn.id);
    assert.equal(checkIns().length, 0);
    assert.equal(await lib.removeCheckIn(w.world.db, EVENT_ID, made.checkIn.id), null, "nothing left to undo");
  });
});

// ---------------------------------------------------------------------------
// 4. What is kept, and for how long
// ---------------------------------------------------------------------------

describe("the event-check-ins-tidy job", () => {
  async function night() {
    w.reset();
    await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "signup", rsvp: rsvpOf("kofi") },
      how: "qr",
      byUid: null,
      now: DURING,
    });
    await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "walk-in", name: "Rosa Martinez", email: "rosa@example.com" },
      how: "door",
      byUid: "sue",
      now: DURING,
    });
    await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "walk-in", name: "Mo Rahman", email: null },
      how: "door",
      byUid: "sue",
      now: DURING,
    });
  }
  const ctx = (now) => ({
    now,
    maxPerTick: eventCheckInsTidyJob.maxPerTick,
    budget: { expired: () => false },
    log: () => {},
  });

  test("before a week has passed, nothing changes", async () => {
    await night();
    const before = w.everything();
    const result = await eventCheckInsTidyJob.handler(ctx(AFTER));
    assert.equal(result.processed, 0);
    assert.equal(w.everything(), before);
  });

  test("a week after the event, walk-ins' emails are deleted and nothing else changes", async () => {
    await night();
    const result = await eventCheckInsTidyJob.handler(ctx(WEEK_LATER));
    assert.equal(result.processed, 1);
    const rosa = checkIns().find((row) => row.name === "Rosa Martinez");
    assert.equal(rosa.email, null);
    assert.equal(rosa.emailGoesAt, null);
    assert.equal(checkIns().length, 3, "everybody who came is still counted");
    assert.equal(checkIns().filter((row) => row.uid || row.rsvpId || row.name).length, 3, "names stay for the year");
    const again = await eventCheckInsTidyJob.handler(ctx(WEEK_LATER));
    assert.equal(again.processed, 0, "a record leaves the range once it is done");
  });

  test("a year after the event, the names come off and the count stays", async () => {
    await night();
    const yearOn = new Date("2027-11-01T17:00:00Z");
    await eventCheckInsTidyJob.handler(ctx(yearOn));
    const rows = checkIns();
    assert.equal(rows.length, 3, "three people came, and still did");
    for (const row of rows) {
      assert.deepEqual(
        [row.rsvpId, row.uid, row.name, row.email, row.emailGoesAt, row.byUid, row.namesOffAt, row.namesOff],
        [null, null, null, null, null, null, null, true],
      );
      assert.equal(row.eventId, EVENT_ID);
    }
    const again = await eventCheckInsTidyJob.handler(ctx(new Date("2028-01-01T00:00:00Z")));
    assert.equal(again.processed, 0);
  });

  test("it is registered, on by default, because it emails nobody", () => {
    assert.ok(registry.SCHEDULER_JOB_IDS.includes("event-check-ins-tidy"));
    assert.ok(registry.JOBS.some((job) => job.id === "event-check-ins-tidy"));
    assert.equal(eventCheckInsTidyJob.enabledByDefault, undefined, "no switch to press");
    assert.equal(registry.jobDefaultEnabled(eventCheckInsTidyJob), true);
  });
});

// ---------------------------------------------------------------------------
// 5. Deletions
// ---------------------------------------------------------------------------

describe("deleting an account takes its name off every event it came to, at once", () => {
  test("its records stay as counts; nobody else's change", async () => {
    const { loadTs } = createLoader({
      stubs: new Map([
        ["server-only", "export {};"],
        ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
        [
          "next/server",
          "export class NextResponse {\n" +
            "  constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; }\n" +
            "  static json(body, init) { return new NextResponse(body, init); }\n" +
            "}",
        ],
        ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }\nexport function getAdminStorage() { return null; }"],
        ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
        ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
      ]),
    });
    const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
    const row = (extra) => ({
      eventId: EVENT_ID,
      kind: "signup",
      rsvpId: null,
      uid: null,
      name: null,
      email: null,
      emailGoesAt: null,
      how: "door",
      byUid: "sue",
      at: DURING,
      namesOffAt: new Date("2027-11-01T17:00:00Z"),
      namesOff: false,
      ...extra,
    });
    const db = makeCascadeDb({
      "users/kofi": { uid: "kofi", role: "member" },
      "eventCheckIns/c1": row({ rsvpId: RSVP.kofi, uid: "kofi" }),
      "eventCheckIns/c2": row({ kind: "walk-in", uid: "kofi", name: "Kofi Asante", how: "qr", byUid: null, eventId: "another-event" }),
      "eventCheckIns/c3": row({ rsvpId: RSVP.chloe, uid: "chloe" }),
    });
    const auth = { async deleteUser() {}, async revokeRefreshTokens() {} };
    const summary = await deleteAccountCascade(auth, db, "kofi");
    assert.equal(summary.eventCheckInsNamesTakenOff, 2);
    for (const id of ["c1", "c2"]) {
      const kept = db.read(`eventCheckIns/${id}`);
      assert.ok(kept, `${id} is still counted`);
      assert.deepEqual([kept.uid, kept.rsvpId, kept.name, kept.namesOff], [null, null, null, true], id);
    }
    assert.equal(db.read("eventCheckIns/c3").uid, "chloe", "Chloe is untouched");
  });
});

describe("deleting an event takes its check-ins with it", () => {
  test("the event's records go, another event's stay, and the answer counts them", async () => {
    w.reset({
      "eventCheckIns/other": {
        eventId: "another-event",
        kind: "walk-in",
        name: "Somebody",
        how: "door",
        at: DURING,
        namesOff: false,
      },
    });
    await lib.recordCheckIn(w.world.db, {
      event: event(),
      person: { kind: "signup", rsvp: rsvpOf("kofi") },
      how: "door",
      byUid: "sue",
      now: DURING,
    });
    const res = await w.call(deleteRoute.POST, { as: "zach", params: { id: EVENT_ID } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.checkInsDeleted, 1);
    assert.deepEqual(
      checkIns().map((row) => row.id),
      ["other"],
    );
  });
});

// ---------------------------------------------------------------------------
// 6. The tree
// ---------------------------------------------------------------------------

describe("no browser reaches a check-in", () => {
  // Every file that addresses the collection, and why. Both directions.
  const ADDRESSES_THE_COLLECTION = {
    "src/lib/firestore/eventCheckIns.ts": "names the collection and normalises a record; holds no query",
    "src/lib/events/checkIns.ts": "every read and write of a check-in, on the Admin SDK, behind server-only",
  };

  test("only the files listed name the collection, and none of them runs in a browser", () => {
    const found = [];
    for (const file of walkSource(join(REPO_ROOT, "src"))) {
      // Code only: a comment that names the collection reaches nothing.
      const text = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      if (/\bEVENT_CHECK_INS_COLLECTION\b|["'`]eventCheckIns["'`/]/.test(text)) {
        found.push(relative(REPO_ROOT, file).split("\\").join("/"));
      }
    }
    assert.deepEqual(found.sort(), Object.keys(ADDRESSES_THE_COLLECTION).sort());
    for (const file of found) {
      const text = readFileSync(join(REPO_ROOT, file), "utf8");
      assert.ok(!/^\s*["']use client["']/m.test(text), `${file} must not run in a browser`);
    }
    assert.match(
      readFileSync(join(REPO_ROOT, "src/lib/events/checkIns.ts"), "utf8"),
      /^import "server-only";/,
      "the reads and writes are server-only",
    );
  });
});
