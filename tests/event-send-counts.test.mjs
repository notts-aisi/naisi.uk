/**
 * EVERY BUTTON THAT EMAILS SAYS HOW MANY PEOPLE IT REACHES: the two event
 * buttons that did not.
 *
 * Publish mails the events list and asked "Publish this event?" with no
 * number. The change notice after an edit to a published event went to the
 * waiting list as well as the people coming and said "Email confirmed
 * attendees" and "Send to attendees". Each now asks the server first, and the
 * server answers with a count made by the send's own audience functions,
 * behind the send's own gate, without sending. This suite executes both
 * counts as every kind of caller, holds each one to the send it describes,
 * and proves neither writes, claims or sends anything:
 *
 *  1. THE WORDS, in `src/features/events/manageWords.ts`: the confirm's
 *     counted phrase, the tick's counters, the button and the line after it,
 *     singular at one.
 *  2. THE ANNOUNCEMENT'S COUNT, `announcementReach` in
 *     `src/lib/email/eventAnnouncement.ts`, against a fake Firestore with the
 *     real audience, the real device enumeration and the real push cell: what
 *     it counts, the ceilings it applies on each path, and that the send then
 *     reaches exactly the people it counted.
 *  3. `GET /api/events/[id]/publish`, the count's route, as every persona: the
 *     press's own gate (the two handlers are asked the same question and give
 *     the same answer), counts only, and nothing written.
 *  4. THE BROADCAST PREVIEW, `{ preview: true }` on
 *     `POST /api/events/[id]/broadcast`, as every persona: the send's own gate
 *     and audience, no subject needed, no slot taken, nothing sent.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";

// ---------------------------------------------------------------------------
// A fake Firestore: documents, equality and `in` queries, a limit, `getAll`,
// a transaction, and a log of every write so "writes nothing" is a count.
// ---------------------------------------------------------------------------

function makeDb(store = {}) {
  const data = structuredClone(store);
  const writes = [];

  // The stored object itself, not a copy: a copy would lose the class of a
  // `Timestamp` the caps write, and the caps read it back by `instanceof`.
  const snapOf = (collection, id) => ({
    id,
    exists: Object.hasOwn(data[collection] ?? {}, id),
    data: () => (data[collection] ?? {})[id],
  });
  const matches = (row, [field, op, value]) => {
    const actual = field.split(".").reduce((node, key) => node?.[key], row);
    if (op === "==") return actual === value;
    if (op === "in") return value.includes(actual);
    throw new Error(`the fake Firestore does not implement "${op}"`);
  };
  const write = (collection, id, patch, merge) => {
    writes.push([collection, id]);
    data[collection] ??= {};
    const next = { ...(merge ? (data[collection][id] ?? {}) : {}), ...patch };
    for (const [key, value] of Object.entries(next)) {
      if (value && typeof value === "object" && value.__op === "delete") delete next[key];
    }
    data[collection][id] = next;
  };

  function docRef(collection, id) {
    return {
      __collection: collection,
      __id: id,
      id,
      get: async () => snapOf(collection, id),
      set: async (patch, options) => write(collection, id, patch, options?.merge === true),
      update: async (patch) => write(collection, id, patch, true),
    };
  }
  function query(collection, filters = [], limit) {
    return {
      where: (field, op, value) => query(collection, [...filters, [field, op, value]], limit),
      limit: (n) => query(collection, filters, n),
      get: async () => {
        const rows = Object.entries(data[collection] ?? {})
          .filter(([, row]) => filters.every((filter) => matches(row, filter)))
          .map(([id]) => snapOf(collection, id));
        const docs = typeof limit === "number" ? rows.slice(0, limit) : rows;
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }
  return {
    data,
    writes,
    collection: (name) => ({ ...query(name), doc: (id) => docRef(name, id) }),
    getAll: async (...refs) => refs.map((ref) => snapOf(ref.__collection, ref.__id)),
    async runTransaction(fn) {
      return fn({
        get: async (ref) => snapOf(ref.__collection, ref.__id),
        set: (ref, patch) => write(ref.__collection, ref.__id, patch, false),
        update: (ref, patch) => write(ref.__collection, ref.__id, patch, true),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// One loader, one module graph. Every door to the outside is closed and
// recorded; everything that decides who is counted is the shipping code.
// ---------------------------------------------------------------------------

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export const NextResponse = { json(body, init) {\n" +
        "  return { status: (init && init.status) || 200, body, headers: (init && init.headers) || {} };\n" +
        "} };",
    ],
    [
      "firebase-admin/firestore",
      "export class Timestamp {\n" +
        "  constructor(ms) { this.ms = ms; }\n" +
        "  toMillis() { return this.ms; }\n" +
        "  static fromMillis(ms) { return new Timestamp(ms); }\n" +
        "}\n" +
        "export const FieldValue = {\n" +
        "  serverTimestamp: () => ({ __op: 'serverTimestamp' }),\n" +
        "  delete: () => ({ __op: 'delete' }),\n" +
        "};",
    ],
    ["@/lib/firebase/admin", "export const getAdminDb = () => globalThis.__db ?? null;"],
    ["@/lib/firebase/session", "export const getCurrentUser = async () => globalThis.__user ?? null;"],
    // Which path a publish takes. The real reader is executed by
    // tests/event-announcements-job.test.mjs; here it is the knob, and it can
    // fail the way a config read can.
    [
      "@/lib/scheduler/announcementQueue",
      "export const announcementQueueEnabled = async () => {\n" +
        "  if (globalThis.__switchThrows) throw new Error('config unreadable');\n" +
        "  return globalThis.__queued === true;\n" +
        "};",
    ],
    // The events channel of the subscriptions junction, as rows.
    [
      "@/lib/firestore/subscriptions",
      "export const findRecipientsForChannel = async (db, channel) => {\n" +
        "  if (globalThis.__channelThrows) throw new Error('junction unreadable');\n" +
        "  globalThis.__channelAsked = channel;\n" +
        "  return globalThis.__channelRows ?? [];\n" +
        "};",
    ],
    [
      "@/lib/firestore/suppression",
      "export const filterSuppressed = async (db, addrs) => ({\n" +
        "  allowed: addrs.filter((a) => !(globalThis.__suppressed ?? []).includes(a.toLowerCase())),\n" +
        "  suppressed: addrs.filter((a) => (globalThis.__suppressed ?? []).includes(a.toLowerCase())),\n" +
        "});",
    ],
    ["@/lib/push/config", "export const isPushConfigured = () => globalThis.__vapid !== false;"],
    // THE FOUR TRANSPORTS, recorded. A count that reached one of them would be
    // a send, which is the thing this suite exists to rule out.
    [
      "./send",
      "export const sendEmail = async (args) => { (globalThis.__sent ||= []).push(args); };",
    ],
    [
      "@/lib/push/send",
      "export const sendPushToUid = async (uid, n) => {\n" +
        "  (globalThis.__pushed ||= []).push({ uid, ...n });\n" +
        "  return { sent: 1, pruned: 0, deferred: 0, failed: 0, retried: 0 };\n" +
        "};",
    ],
    [
      "@/lib/email/notice",
      "export const sendNotice = async (args) => { (globalThis.__notices ||= []).push(args); };",
    ],
    [
      "@/lib/push/noticeNotifications",
      "export const sendNoticePush = async (uid, n) => { (globalThis.__noticePushes ||= []).push({ uid, ...n }); return true; };",
    ],
    ["@/lib/signedTokens", "export const signToken = (payload) => `tok:${JSON.stringify(payload)}`;"],
    [
      "@/lib/events/rsvpToken",
      "export const baseUrl = () => 'https://naisi.test';\n" +
        "export const signRsvpToken = () => 'tok';\n" +
        "export const cancelUrl = (e, r) => `https://naisi.test/c/${e}/${r}`;\n" +
        "export const changeUrl = (e, r) => `https://naisi.test/u/${e}/${r}`;",
    ],
    [
      "@/lib/events/changeSummary",
      "export const formatEventWhen = () => 'Fri 6 Nov, 6pm';\n" +
        "export const parseEventChanges = () => [];",
    ],
  ]),
});

const words = await loadTs("features/events/manageWords.ts");
const announcement = await loadTs("lib/email/eventAnnouncement.ts");
const { MAX_PUSH_ROWS } = await loadTs("lib/push/rowAudience.ts");
const publishRoute = await loadTs("app/api/events/[id]/publish/route.ts");
const broadcastRoute = await loadTs("app/api/events/[id]/broadcast/route.ts");
const caps = await loadTs("lib/email/noticeCaps.ts");

const ctxFor = (id) => ({ params: Promise.resolve({ id }) });
const jsonRequest = (body) => ({ json: async () => structuredClone(body) });

/** A session as `getCurrentUser` hands it back. */
const session = (uid, role, extra = {}) => ({
  uid,
  email: `${uid}@e2e.invalid`,
  role,
  suRecognised: false,
  permissions: {},
  ...extra,
});

beforeEach(() => {
  globalThis.__user = null;
  globalThis.__queued = false;
  globalThis.__switchThrows = false;
  globalThis.__channelThrows = false;
  globalThis.__channelAsked = undefined;
  globalThis.__channelRows = [];
  globalThis.__suppressed = [];
  globalThis.__vapid = true;
  globalThis.__sent = [];
  globalThis.__pushed = [];
  globalThis.__notices = [];
  globalThis.__noticePushes = [];
  globalThis.__db = makeDb();
});

// ===========================================================================
// 1. The words
// ===========================================================================

describe("the words the two buttons use", () => {
  test("the confirm names the people emailed and the people notified, singular at one", () => {
    const cases = [
      [{ emailed: 21, notified: 5 }, "21 people are emailed about it (5 also get a notification)"],
      [{ emailed: 1, notified: 1 }, "1 person is emailed about it (1 also gets a notification)"],
      [{ emailed: 2, notified: 0 }, "2 people are emailed about it"],
      [{ emailed: 2, notified: null }, "2 people are emailed about it"],
      [{ emailed: 0, notified: 0 }, "nobody is emailed about it"],
      [{ emailed: 0, notified: 3 }, "nobody is emailed about it (3 get a notification)"],
    ];
    for (const [reach, said] of cases) {
      assert.equal(words.announcementReachWords(reach), said, JSON.stringify(reach));
    }
  });

  test("no email count is no phrase, so the confirm keeps the words it had before there was one", () => {
    assert.equal(words.announcementReachWords(null), null);
    assert.equal(words.announcementReachWords({ emailed: null, notified: 4 }), null);
  });

  test("the tick names both lists from the event's counters, and the button and the line after it name the count", () => {
    assert.equal(words.notifyReachWords({ confirmed: 21, waitlisted: 3 }), "(21 coming, 3 on the waiting list)");
    assert.equal(words.notifyReachWords({ confirmed: 1, waitlisted: 0 }), "(1 coming, 0 on the waiting list)");
    assert.equal(words.sendToWords(24), "Send to 24 people");
    assert.equal(words.sendToWords(1), "Send to 1 person");
    assert.equal(words.sendToWords(0), "Send to 0 people");
    assert.equal(words.sentToWords(24), "Sent to 24 people.");
    assert.equal(words.sentToWords(1), "Sent to 1 person.");
  });
});

// ===========================================================================
// 2. The announcement's count, against the send it describes
// ===========================================================================

const EVENT_ID = "event-1";

/** A member with an events email row, and a device whose events push cell is as given. */
function member(uid, { emailCell = true, pushCell = true, uniEmail = false } = {}) {
  return {
    email: `${uid}@e2e.invalid`,
    displayName: uid,
    role: "member",
    profile: {
      ...(uniEmail ? { universityEmail: `${uid}@nottingham.ac.uk` } : {}),
      notifications: {
        channels: { gmail: true, uniEmail },
        categories: { events: emailCell },
        push: { events: pushCell },
      },
    },
  };
}

/**
 * The world most of this section counts: two members on the events list (one
 * with a second, university address), a third member whose events email cell
 * is off, a guest, and devices for three accounts, one of which has turned
 * the events push cell off and one of which holds two devices.
 */
function announcementWorld() {
  globalThis.__channelRows = [
    { email: "ada@e2e.invalid", audience: "user", audienceId: "ada" },
    { email: "bo@e2e.invalid", audience: "user", audienceId: "bo" },
    { email: "cy@e2e.invalid", audience: "user", audienceId: "cy" },
    { email: "guest@e2e.invalid", audience: "guest", audienceId: "guest@e2e.invalid" },
  ];
  globalThis.__db = makeDb({
    users: {
      ada: member("ada", { uniEmail: true }),
      bo: member("bo", { pushCell: false }),
      cy: member("cy", { emailCell: false }),
      dee: member("dee"),
    },
    pushSubscriptions: {
      "ada-phone": { uid: "ada", endpoint: "https://push.test/1" },
      "ada-laptop": { uid: "ada", endpoint: "https://push.test/2" },
      "bo-phone": { uid: "bo", endpoint: "https://push.test/3" },
      "dee-phone": { uid: "dee", endpoint: "https://push.test/4" },
    },
  });
}

const reachOf = (opts = {}) =>
  announcement.announcementReach(
    globalThis.__db,
    { eventId: EVENT_ID, membersOnly: opts.membersOnly === true },
    { queued: opts.queued === true },
  );

/** Guests on the events list, as junction rows. */
const guests = (n, prefix = "g") =>
  Array.from({ length: n }, (_, i) => ({
    email: `${prefix}${i}@e2e.invalid`,
    audience: "guest",
    audienceId: `${prefix}${i}@e2e.invalid`,
  }));

describe("the announcement's count", () => {
  test("it counts people, not messages, and asks the events row on both columns", async () => {
    announcementWorld();
    const reach = await reachOf();
    // ada (two addresses, one person), bo, the guest. cy's events email cell
    // is off, so the junction row reaches nobody.
    assert.equal(reach.emailed, 3);
    assert.equal(globalThis.__channelAsked, "events");
    // ada (two devices, one person) and dee. bo's events push cell is off.
    assert.equal(reach.notified, 2);
  });

  test("it sends nothing and writes nothing", async () => {
    announcementWorld();
    await reachOf();
    await reachOf({ queued: true });
    assert.deepEqual(globalThis.__sent, []);
    assert.deepEqual(globalThis.__pushed, []);
    assert.deepEqual(globalThis.__db.writes, []);
  });

  test("the send then reaches exactly the people it counted", async () => {
    announcementWorld();
    const reach = await reachOf();
    const result = await announcement.sendEventAnnouncement(globalThis.__db, {
      eventId: EVENT_ID,
      title: "Reading group",
      whenLine: "Fri 6 Nov, 6pm",
      locationLine: "B52",
      eventUrl: "https://naisi.test/events/event-1",
      coverImageUrl: null,
      membersOnly: false,
      actorUid: "approver",
    });
    const people = new Set(
      globalThis.__sent.map((m) => m.to.replace("@nottingham.ac.uk", "@e2e.invalid")),
    );
    assert.equal(people.size, reach.emailed, "the confirm counted a different number of people from the send");
    assert.equal(result.pushed, reach.notified);
  });

  test("a members-only event counts nobody without an account, as its send reaches nobody without one", async () => {
    announcementWorld();
    assert.equal((await reachOf({ membersOnly: true })).emailed, 2);
  });

  test("a person whose every address is suppressed is not emailed, so is not counted", async () => {
    announcementWorld();
    globalThis.__suppressed = ["bo@e2e.invalid", "ada@e2e.invalid"];
    // ada keeps her university address; bo has none left.
    assert.equal((await reachOf()).emailed, 2);
  });

  test("over the request path's message ceiling the inline send refuses, so there is no number", async () => {
    globalThis.__channelRows = guests(announcement.MAX_ANNOUNCEMENT_SENDS + 1);
    assert.equal((await reachOf()).emailed, null);
    // The queued path has no message ceiling and sends to all of them.
    assert.equal((await reachOf({ queued: true })).emailed, announcement.MAX_ANNOUNCEMENT_SENDS + 1);
  });

  test("over a path's row ceiling the list is refused whole, so there is no number", async (t) => {
    t.mock.method(console, "error", () => {});
    globalThis.__channelRows = guests(announcement.MAX_ANNOUNCEMENT_ROWS + 1);
    assert.equal((await reachOf()).emailed, null);
    globalThis.__channelRows = guests(announcement.MAX_QUEUED_ANNOUNCEMENT_ROWS + 1);
    assert.equal((await reachOf({ queued: true })).emailed, null);
  });

  test("a device list over the ceiling notifies nobody, so the notification count is left out", async (t) => {
    t.mock.method(console, "error", () => {});
    announcementWorld();
    for (let i = 0; i <= MAX_PUSH_ROWS; i += 1) {
      globalThis.__db.data.pushSubscriptions[`extra-${i}`] = { uid: "dee", endpoint: `https://push.test/x${i}` };
    }
    const reach = await reachOf();
    assert.equal(reach.notified, null);
    assert.equal(reach.emailed, 3, "the email leg is counted on its own");
  });

  test("with push unprovisioned nobody is notified, which is a count of nobody", async () => {
    announcementWorld();
    globalThis.__vapid = false;
    assert.equal((await reachOf()).notified, 0);
  });
});

// ===========================================================================
// 3. GET /api/events/[id]/publish, as every persona
// ===========================================================================

/** Everyone the battery asks about, as the session the route would see. */
const PERSONAS = {
  pending: session("pending-1", "pending"),
  rejected: session("rejected-1", "rejected"),
  member: session("member-1", "member"),
  committee: session("committee-1", "committee"),
  suCommittee: session("su-1", "committee", { suRecognised: true }),
  draftEvent: session("drafter-1", "member", { permissions: { draftEvent: true } }),
  approveEvent: session("approver-1", "member", { permissions: { approveEvent: true } }),
  // The key outlives no account: a rejected or pending holder is off the roster.
  approveEventRejected: session("approver-2", "rejected", { permissions: { approveEvent: true } }),
  approveEventPending: session("approver-3", "pending", { permissions: { approveEvent: true } }),
  admin: session("admin-1", "admin"),
};
const PUBLISHERS = new Set(["approveEvent", "admin"]);

function publishWorld(event = {}) {
  announcementWorld();
  globalThis.__db.data.events = {
    [EVENT_ID]: { title: "Reading group", status: "approved", visibility: "public", ...event },
  };
}

const countFor = (id = EVENT_ID) => publishRoute.GET({}, ctxFor(id));

describe("GET /api/events/[id]/publish: the count before the press", () => {
  test("a signed-out caller is refused before anything is read", async () => {
    publishWorld();
    const res = await countFor();
    assert.equal(res.status, 401);
    assert.equal(globalThis.__channelAsked, undefined);
  });

  for (const [name, user] of Object.entries(PERSONAS)) {
    const publishes = PUBLISHERS.has(name);
    test(`${name} is ${publishes ? "counted for" : "refused, and learns nothing about the list"}`, async () => {
      publishWorld();
      globalThis.__user = user;
      const res = await countFor();
      if (publishes) {
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.deepEqual(res.body, { ok: true, emailed: 3, notified: 2 });
      } else {
        assert.equal(res.status, 403);
        assert.deepEqual(Object.keys(res.body), ["error"]);
        assert.equal(globalThis.__channelAsked, undefined, "the list was read for somebody who may not publish");
      }
    });
  }

  test("THE PRESS'S OWN GATE: every persona gets the same answer from the count as from Publish", async () => {
    // A missing id, so neither handler reaches anything but its gate and its
    // first read: the 401, the 403 and the 404 have to line up exactly.
    for (const [name, user] of [["anonymous", null], ...Object.entries(PERSONAS)]) {
      publishWorld();
      globalThis.__user = user;
      const count = await countFor("no-such-event");
      const press = await publishRoute.POST({}, ctxFor("no-such-event"));
      assert.equal(count.status, press.status, `${name}: the count answers ${count.status}, Publish ${press.status}`);
    }
  });

  test("the answer is counts only, never an address or a uid", async () => {
    publishWorld();
    globalThis.__user = PERSONAS.approveEvent;
    const res = await countFor();
    assert.deepEqual(Object.keys(res.body).sort(), ["emailed", "notified", "ok"]);
    assert.doesNotMatch(JSON.stringify(res.body), /@|ada|dee|guest/);
  });

  test("it writes nothing, claims nothing and sends nothing", async () => {
    publishWorld();
    globalThis.__user = PERSONAS.admin;
    await countFor();
    assert.deepEqual(globalThis.__db.writes, []);
    const stored = globalThis.__db.data.events[EVENT_ID];
    assert.equal(stored.status, "approved");
    assert.equal(stored.announcedAt, undefined, "a count stamped the once-per-event claim");
    assert.deepEqual(globalThis.__sent, []);
    assert.deepEqual(globalThis.__pushed, []);
  });

  test("a members-only event is counted without its guests", async () => {
    publishWorld({ visibility: "members" });
    globalThis.__user = PERSONAS.admin;
    assert.equal((await countFor()).body.emailed, 2);
  });

  test("an event already announced reaches nobody, because the press would announce nothing", async () => {
    publishWorld({ announcedAt: { __op: "serverTimestamp" } });
    globalThis.__user = PERSONAS.admin;
    const res = await countFor();
    assert.deepEqual(res.body, { ok: true, emailed: 0, notified: 0 });
    assert.equal(globalThis.__channelAsked, undefined);
  });

  test("it counts the path the press would take: queued has no message ceiling", async () => {
    publishWorld();
    globalThis.__channelRows = guests(announcement.MAX_ANNOUNCEMENT_SENDS + 1);
    globalThis.__user = PERSONAS.admin;
    assert.equal((await countFor()).body.emailed, null, "the inline send would refuse this list");
    globalThis.__queued = true;
    assert.equal((await countFor()).body.emailed, announcement.MAX_ANNOUNCEMENT_SENDS + 1);
  });

  test("a switch that cannot be read counts the inline path, as the press then takes it", async (t) => {
    t.mock.method(console, "error", () => {});
    publishWorld();
    globalThis.__channelRows = guests(announcement.MAX_ANNOUNCEMENT_SENDS + 1);
    globalThis.__switchThrows = true;
    globalThis.__user = PERSONAS.admin;
    const res = await countFor();
    assert.equal(res.status, 200);
    assert.equal(res.body.emailed, null);
  });

  test("a list that cannot be read is a refusal with a sentence, and the editor falls back", async (t) => {
    t.mock.method(console, "error", () => {});
    publishWorld();
    globalThis.__channelThrows = true;
    globalThis.__user = PERSONAS.admin;
    const res = await countFor();
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: "Couldn't count the events list just now." });
  });
});

// ===========================================================================
// 4. The broadcast preview, as every persona
// ===========================================================================

const PREVIEW = { preview: true };

/**
 * An event with its RSVP rows: two confirmed, one waitlisted, and one row in
 * each state that is not attending. The author and a named collaborator are on
 * the event.
 */
function broadcastWorld(extraRsvps = {}) {
  const row = (status, n, extra = {}) => ({
    eventId: EVENT_ID,
    status,
    email: `${status}${n}@e2e.invalid`,
    name: `${status} ${n}`,
    uid: `${status}-uid-${n}`,
    ...extra,
  });
  globalThis.__db = makeDb({
    events: {
      [EVENT_ID]: {
        title: "Reading group",
        status: "published",
        authorUid: "author-1",
        collaboratorUids: ["collab-1"],
        location: "B52",
      },
    },
    eventRsvps: {
      c1: row("confirmed", 1),
      c2: row("confirmed", 2),
      w1: row("waitlisted", 1),
      p1: row("pending", 1),
      d1: row("denied", 1),
      x1: row("cancelled", 1),
      ...extraRsvps,
    },
  });
}

const BROADCASTERS = {
  "the event's author": session("author-1", "committee"),
  "a named collaborator": session("collab-1", "member"),
  "SU-recognised committee": PERSONAS.suCommittee,
  "an admin": PERSONAS.admin,
};
const REFUSED = {
  "a committee member with no part in the event": PERSONAS.committee,
  "a plain member": PERSONAS.member,
  "an approver with no part in the event": PERSONAS.approveEvent,
  "the event's author, since rejected": session("author-1", "rejected"),
  "a named collaborator still pending": session("collab-1", "pending"),
};

const preview = (body = PREVIEW, id = EVENT_ID) => broadcastRoute.POST(jsonRequest(body), ctxFor(id));
const send = (id = EVENT_ID) =>
  broadcastRoute.POST(jsonRequest({ subject: "Room change", body: "We are in B52." }), ctxFor(id));

describe("the broadcast preview: the count on the change notice's button", () => {
  test("a signed-out caller is refused", async () => {
    broadcastWorld();
    assert.equal((await preview()).status, 401);
  });

  for (const [who, user] of Object.entries(BROADCASTERS)) {
    test(`${who} is told how many the send would email`, async () => {
      broadcastWorld();
      globalThis.__user = user;
      const res = await preview();
      assert.equal(res.status, 200, JSON.stringify(res.body));
      // The two confirmed and the one waitlisted. The waiting list is in the
      // send, so it is in the count.
      assert.deepEqual(res.body, { ok: true, people: 3 });
    });
  }

  for (const [who, user] of Object.entries(REFUSED)) {
    test(`${who} is refused the count as they are refused the send`, async () => {
      broadcastWorld();
      globalThis.__user = user;
      const counted = await preview();
      const sent = await send();
      assert.equal(counted.status, 403);
      assert.equal(sent.status, 403);
      assert.deepEqual(Object.keys(counted.body), ["error"]);
    });
  }

  test("a missing event is told apart only to those the gate admits, as the send does", async () => {
    broadcastWorld();
    for (const [who, user] of Object.entries({ ...BROADCASTERS, ...REFUSED })) {
      globalThis.__user = user;
      const counted = await preview(PREVIEW, "no-such-event");
      const sent = await send("no-such-event");
      assert.equal(counted.status, sent.status, `${who}: the preview answers ${counted.status}, the send ${sent.status}`);
    }
  });

  test("it needs no subject or message, sends nothing, writes nothing and takes no slot", async () => {
    broadcastWorld();
    globalThis.__user = BROADCASTERS["the event's author"];
    for (let i = 0; i < caps.NOTICES_PER_HOUR + 2; i += 1) {
      assert.equal((await preview()).status, 200);
    }
    assert.deepEqual(globalThis.__notices, []);
    assert.deepEqual(globalThis.__noticePushes, []);
    assert.deepEqual(globalThis.__db.writes, [], "a preview wrote to Firestore");
    // And the hour's allowance is whole: every send it allows still goes, and
    // the one after them is refused, so the counter is live and the previews
    // spent none of it.
    for (let i = 0; i < caps.NOTICES_PER_HOUR; i += 1) {
      assert.equal((await send()).status, 200, `send ${i + 1} was refused after the previews`);
    }
    assert.equal((await send()).status, 429);
  });

  test("it counts whom the send emails: no address and a suppressed address are not emailed", async () => {
    broadcastWorld({
      blank: { eventId: EVENT_ID, status: "confirmed", email: "  ", name: "No address", uid: null },
    });
    globalThis.__suppressed = ["confirmed2@e2e.invalid"];
    globalThis.__user = PERSONAS.admin;
    const counted = await preview();
    const sent = await send();
    assert.equal(counted.body.people, 2);
    assert.equal(sent.body.sent, counted.body.people, "the button named a different number from the send");
  });

  test("without the waiting list, as the route still allows, only the people coming are counted", async () => {
    broadcastWorld();
    globalThis.__user = PERSONAS.admin;
    assert.equal((await preview({ preview: true, includeWaitlisted: false })).body.people, 2);
  });

  test("over the cap the preview is refused with the send's own words", async () => {
    const many = {};
    for (let i = 0; i <= caps.MAX_NOTICE_RECIPIENTS; i += 1) {
      many[`many-${i}`] = { eventId: EVENT_ID, status: "confirmed", email: `m${i}@e2e.invalid`, name: "M", uid: null };
    }
    broadcastWorld(many);
    globalThis.__user = PERSONAS.admin;
    const counted = await preview();
    const sent = await send();
    assert.equal(counted.status, 400);
    assert.deepEqual(counted.body, sent.body);
    assert.deepEqual(globalThis.__notices, []);
  });

  test("the answer is a count, never an address", async () => {
    broadcastWorld();
    globalThis.__user = PERSONAS.suCommittee;
    const res = await preview();
    assert.deepEqual(Object.keys(res.body).sort(), ["ok", "people"]);
    assert.doesNotMatch(JSON.stringify(res.body), /@/);
  });
});
