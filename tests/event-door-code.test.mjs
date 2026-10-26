/**
 * AN EVENT'S DOOR CODE: a short link per event, made on demand by the people
 * who run check-in, that goes to the event's check-in page, and is printed
 * and permanent like every other short link (docs/tracked-links.md).
 *
 * Driven through the real routes: making it (`POST /api/events/<id>/door-code`)
 * as every kind of caller, the record it writes field for field, its slug
 * from the event's name and what happens when that slug is taken, the scan of
 * `naisi.uk/q/<slug>` landing on the check-in page, and its picture and sign
 * for the people who run check-in. The world is `tests/lib/checkInWorld.mjs`.
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import decodeQR from "qr/decode.js";
import { EVENT_ID, ORIGIN, makeCheckInWorld } from "./lib/checkInWorld.mjs";

const w = await makeCheckInWorld("__doorCode");
const { call, render, load } = w;
const doorRoute = await load("app/api/events/[id]/door-code/route.ts");
const scanRoute = await load("app/api/q/[slug]/route.ts");
const door = await load("lib/events/doorCode.ts");
const { routes, pages } = w;

const make = (as, id = EVENT_ID) => call(doorRoute.POST, { as, params: { id } });
const links = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("trackedLinks/"))
    .sort();

const RULE_KEYS = [
  "active",
  "campaign",
  "countOffsite",
  "createdAt",
  "createdByUid",
  "destination",
  "label",
  "slug",
  "type",
  "updatedAt",
  "updatedByUid",
];

describe("the slug a door code is made from", () => {
  test("the first word of the event's name that says something, then -in", () => {
    const cases = [
      ["VR games night", "vr-in"],
      ["The Big Debate", "big-in"],
      ["NAISI social: board games", "social-in"],
      ["Café Scientifique", "cafe-in"],
      ["🎉 🎉", "event-in"],
      ["Interpretability reading group", "interpreta-in"],
    ];
    for (const [title, slug] of cases) assert.equal(door.doorCodeCandidates(title)[0], slug, title);
    assert.deepEqual(door.doorCodeCandidates("VR games night").slice(1, 3), ["vr-in-2", "vr-in-3"]);
    for (const slug of door.doorCodeCandidates("Interpretability reading group")) {
      assert.ok(slug.length <= 16, slug);
    }
  });

  test("a check-in page's path names its event, and nothing else does", () => {
    assert.equal(door.eventOfCheckInPath(`/events/${EVENT_ID}/check-in`), EVENT_ID);
    for (const other of [`/events/${EVENT_ID}`, `/events/${EVENT_ID}/check-in?q=x`, "/links", "/events/a/b/check-in"]) {
      assert.equal(door.eventOfCheckInPath(other), null, other);
    }
  });
});

describe("POST /api/events/<id>/door-code", () => {
  test("refused to everybody who does not run check-in, and nothing is written", async () => {
    w.reset();
    const before = w.everything();
    assert.equal((await make(null)).status, 401);
    for (const who of ["ines", "kofi", "iris", "cal"]) {
      const res = await make(who);
      assert.equal(res.status, 403, who);
      assert.equal(res.body.error, "Only admins and SU-recognised committee members run check-in.", who);
    }
    assert.equal(w.everything(), before);
  });

  test("refused during view-as, before anything else", async () => {
    w.reset();
    w.world.viewingAs = true;
    const before = w.everything();
    w.world.user = null;
    const res = await doorRoute.POST({}, { params: Promise.resolve({ id: EVENT_ID }) });
    assert.equal(res.status, 403);
    assert.equal(w.everything(), before);
  });

  test("SU-recognised committee makes it: one link, exactly the fields the console allows", async () => {
    w.reset();
    const res = await make("sue");
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { made: true, slug: "vr-in", active: true });
    const stored = w.world.db.read("trackedLinks/vr-in");
    assert.deepEqual(Object.keys(stored).sort(), RULE_KEYS);
    assert.equal(stored.slug, "vr-in");
    assert.equal(stored.label, "VR games night: door code");
    assert.equal(stored.destination, `/events/${EVENT_ID}/check-in`);
    assert.equal(stored.type, "qr");
    assert.equal(stored.campaign, "Check-in");
    assert.equal(stored.active, true);
    assert.equal(stored.countOffsite, false);
    assert.equal(stored.createdByUid, "sue");
    assert.equal(stored.updatedByUid, "sue");
    assert.ok(stored.createdAt instanceof Date && stored.updatedAt instanceof Date);
  });

  test("asking again hands back the same code and makes no second one, whoever asks", async () => {
    w.reset();
    await make("sue");
    const after = links();
    const again = await make("zach");
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, { made: false, slug: "vr-in", active: true });
    assert.deepEqual(links(), after);
  });

  test("a slug somebody holds is never taken: the next one is", async () => {
    const holder = (slug) => ({
      slug,
      label: "Somebody else's",
      destination: "/links",
      type: "qr",
      campaign: "",
      active: true,
      countOffsite: false,
      createdByUid: "zach",
      updatedByUid: "zach",
      createdAt: new Date("2026-09-01T10:00:00Z"),
      updatedAt: new Date("2026-09-01T10:00:00Z"),
    });
    w.reset({ "trackedLinks/vr-in": holder("vr-in"), "trackedLinks/vr-in-2": holder("vr-in-2") });
    const res = await make("zach");
    assert.equal(res.body.slug, "vr-in-3");
    assert.equal(w.world.db.read("trackedLinks/vr-in").label, "Somebody else's", "untouched");
    assert.equal(w.world.db.read("trackedLinks/vr-in-2").label, "Somebody else's", "untouched");
  });

  test("when every slug the name gives is taken, a code nobody would pick", async () => {
    const over = {};
    for (const slug of door.doorCodeCandidates("VR games night")) {
      over[`trackedLinks/${slug}`] = { slug, label: "x", destination: "/links", type: "qr", campaign: "", active: true, countOffsite: false };
    }
    w.reset(over);
    const res = await make("zach");
    assert.equal(res.status, 201);
    assert.match(res.body.slug, /^in-[a-z2-9]{6}$/);
  });

  test("an event that is not there, not published or cancelled gets no code", async () => {
    w.reset();
    assert.equal((await make("zach", "no-such-event")).status, 404);
    for (const [status, words] of [
      ["draft", "Publish the event first. A door code is for an event people can come to."],
      ["pending", "Publish the event first. A door code is for an event people can come to."],
      ["cancelled", "This event is cancelled, so there is no door to check people in at."],
    ]) {
      w.reset({ [`events/${EVENT_ID}`]: { ...w.world.db.read(`events/${EVENT_ID}`), status } });
      const res = await make("zach");
      assert.deepEqual([res.status, res.body.error], [409, words], status);
      assert.deepEqual(links(), ["trackedLinks/insta", "trackedLinks/poster"], `${status}: nothing made`);
    }
  });

  test("a code repointed elsewhere in the console stops being the door code, and a new one can be made", async () => {
    w.reset();
    await make("sue");
    w.world.db.poke("trackedLinks/vr-in", { destination: "/links" });
    const res = await make("sue");
    assert.equal(res.status, 201);
    assert.equal(res.body.slug, "vr-in-2");
  });
});

describe("what the door code does", () => {
  test("a scan of naisi.uk/q/<slug> lands on the event's check-in page, carrying the slug to count it", async () => {
    w.reset();
    await make("sue");
    const res = await scanRoute.GET({}, { params: Promise.resolve({ slug: "vr-in" }) });
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), `/events/${EVENT_ID}/check-in?q=vr-in`);
  });

  test("the people who run check-in can download it and print its sign; nobody else can", async () => {
    w.reset();
    await make("sue");
    const draw = (as) =>
      call(routes.qr.GET, { as, params: { slug: "vr-in" }, url: "https://internal.invalid/api/links/vr-in/qr" });
    for (const who of ["sue", "zach"]) {
      const res = await draw(who);
      assert.equal(res.status, 200, who);
      const png = res.raw;
      assert.ok(png.length > 100, who);
    }
    for (const who of ["iris", "cal", "kofi"]) assert.equal((await draw(who)).status, 403, who);
  });

  test("its sign says the event's name, the address and who checks themselves in, and goes back to check-in", async () => {
    w.reset();
    await make("sue");
    const page = await render(pages.sign, { as: "sue", params: { slug: "vr-in" } });
    assert.match(
      page.text,
      /VR games night naisi\.uk\/q\/vr-in Signed-in people check themselves in\. Everyone else gives their name at the door\.$/,
    );
    assert.match(page.html, new RegExp(`<a href="/events/manage/${EVENT_ID}/check-in"`));
    const refused = await render(pages.sign, { as: "iris", params: { slug: "vr-in" } });
    assert.match(refused.text, /Only admins can print or download this code\./);
  });

  test("the PNG a person downloads reads back as the short address, never the check-in page", async () => {
    w.reset();
    await make("sue");
    const code = await load("lib/qr/shortLinkCode.ts");
    const grid = code.qrGrid(code.shortLinkUrl("vr-in"));
    const n = grid.length;
    const data = new Uint8Array(n * n * 4 * 64);
    const W = n * 8;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const v = grid[y >> 3][x >> 3] ? 0 : 255;
        const i = (y * W + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    assert.equal(decodeQR({ width: W, height: W, data }), `${ORIGIN}/q/vr-in`);
  });
});
