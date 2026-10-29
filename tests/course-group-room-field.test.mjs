/**
 * A GROUP'S ROOM ON THE GROUPS TAB, beside its campus: the room it meets in
 * every week, the same field as the run editor's group card's "Location".
 *
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/room
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 *  1. The programme's lead and admins set it, before Publish and after, as
 *     the campus beside it; nobody else, and a view-as session never.
 *  2. It writes the group's own weekly room (`session.location`), trimmed,
 *     "" for none, and nothing else: no week's change of room, no email.
 *  3. A group that is not the run's, or is archived, is refused; text that
 *     is not a room is refused before anything is read.
 *  4. The Sessions view's card and Circles carry the room for the field.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, NOW, OPEN_GROUP, ROUND, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__groupRoomField");
const { world, call } = w;
const roomRoute = await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "room");
const words = await w.loadTs(join("lib", "courses", "roomWords.ts"));
const { parseRoomBody } = await w.loadTs(join("lib", "courses", "roomSet.ts"));

const read = (path) => world.db.read(path);
const short = (response) => [response.status, response.body?.error ?? null];
const setRoom = (who, groupId, room, options = {}) =>
  call(who, roomRoute.PUT, { roundId: ROUND, programmeId: AGI, groupId }, {
    body: options.body ?? { room },
    viewAs: options.viewAs,
  });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

describe("a group's room, from the Groups tab", () => {
  test("the body: text up to the field's limit, trimmed and its spaces closed up, empty for none", () => {
    assert.deepEqual(parseRoomBody({ room: "  Portland   A21 " }), { ok: true, value: "Portland A21" });
    assert.deepEqual(parseRoomBody({ room: "" }), { ok: true, value: "" });
    assert.deepEqual(parseRoomBody({ room: "x".repeat(201) }), { ok: false, error: words.ROOM_REFUSAL.tooLong });
    assert.deepEqual(parseRoomBody({ room: 3 }), { ok: false, error: words.ROOM_REFUSAL.notText });
    assert.deepEqual(parseRoomBody({}), { ok: false, error: words.ROOM_REFUSAL.notText });
    assert.deepEqual(parseRoomBody([]), { ok: false, error: words.ROOM_REFUSAL.body });
  });

  test("the programme's lead and an admin set it; it writes the weekly room alone, moves the stamp and emails nobody", async () => {
    const before = read(`courseGroups/${A}`);
    for (const [who, room] of [
      ["zach", "Portland A21"],
      ["claudia", "Hallward B12"],
      ["claudia", ""],
    ]) {
      const response = await setRoom(who, A, room);
      assert.equal(response.status, 200, `${who}: ${JSON.stringify(response.body)}`);
      assert.deepEqual(response.body, {
        ok: true,
        changed: true,
        groupId: A,
        groupName: "Group A",
        room,
        message: words.roomSavedWords("Group A", room),
      });
      const after = read(`courseGroups/${A}`);
      assert.equal(after.session.location, room);
      assert.ok(after.updatedAt instanceof Date);
      // Nothing else of the group moves: its day, time, length, link and the weeks' own changes.
      const { location: _l, ...rest } = after.session;
      const { location: _b, ...was } = before.session;
      assert.deepEqual(rest, was);
      assert.deepEqual(after.sessionOverrides ?? {}, before.sessionOverrides ?? {});
    }
    // The room it already has: nothing written.
    const unchanged = w.everything();
    const same = await setRoom("zach", A, "");
    assert.deepEqual([same.status, same.body.changed], [200, false]);
    assert.equal(w.everything(), unchanged);
    assert.deepEqual(world.mail, []);
  });

  for (const [who, expected, why] of [
    [null, [401, "Not signed in"], "somebody signed out"],
    ["lloyd", [403, words.ROOM_REFUSAL.notYours], "the programme's reviewer"],
    ["tess", [404, words.ROOM_REFUSAL.noProgramme], "the lead of another programme"],
    ["yusuf", [404, words.ROOM_REFUSAL.noProgramme], "the run's track lead"],
    ["sofia", [404, words.ROOM_REFUSAL.noProgramme], "a facilitator of the group"],
    ["amara", [404, words.ROOM_REFUSAL.noProgramme], "somebody in the group"],
    ["nobody", [404, words.ROOM_REFUSAL.noProgramme], "a member on nothing"],
  ]) {
    test(`${why} is refused, and nothing is written`, async () => {
      const before = w.everything();
      assert.deepEqual(short(await setRoom(who, A, "Portland A21")), expected);
      assert.equal(w.everything(), before);
    });
  }

  test("a view-as session is refused first, and a body that is not a room before anything is read", async () => {
    const before = w.everything();
    assert.equal((await setRoom("zach", A, "Portland A21", { viewAs: true })).status, 403);
    assert.deepEqual(short(await setRoom("nobody", A, 7)), [400, words.ROOM_REFUSAL.notText]);
    assert.deepEqual(short(await setRoom("nobody", A, "x".repeat(201))), [400, words.ROOM_REFUSAL.tooLong]);
    assert.equal(w.everything(), before);
  });

  test("a group that is not the run's, or is archived, is refused", async () => {
    assert.deepEqual(short(await setRoom("zach", OPEN_GROUP, "Portland A21")), [404, words.ROOM_REFUSAL.noGroup]);
    assert.deepEqual(short(await setRoom("zach", "no-such-group", "Portland A21")), [404, words.ROOM_REFUSAL.noGroup]);
    const location = read(`courseGroups/${A}`).session.location;
    world.db.seed(`courseGroups/${A}`, { ...read(`courseGroups/${A}`), archived: true });
    assert.deepEqual(short(await setRoom("zach", A, "Portland A21")), [409, words.ROOM_REFUSAL.archived]);
    assert.equal(read(`courseGroups/${A}`).session.location, location);
  });

  test("the board's columns read the new room", async () => {
    await setRoom("zach", B, "Portland A21");
    const board = await w.join.board("claudia");
    assert.equal(board.body.groups.find((group) => group.id === B).room, "Portland A21");
  });
});
