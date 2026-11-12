/**
 * Covering a register: who takes a session's register, in whose place, who
 * set each line, and whether each facilitator was there.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST  /api/courses/groups/[groupId]/attendance/cover        (take it, or give it)
 *   POST  /api/courses/groups/[groupId]/attendance/facilitators (whether a facilitator was there)
 *   GET   /api/courses/groups/[groupId]/attendance              (what each reader is sent)
 *   POST  /api/courses/groups/[groupId]/attendance              (who set each line)
 *   POST  /api/courses/groups/[groupId]/attendance/push         (Finish: who was here, the history's sentence)
 *   GET   /api/courses/groups/[groupId]/check-in                (whoever took it; no totals for a session given)
 *   PUT   /api/courses/groups/[groupId]/session-report          (whoever took it, covering for whom)
 *
 * ## What this guards
 *
 *  1. THE ARITHMETIC: until when a session given to somebody holds, which
 *     lines a save moved, the facilitator record at a save and at Finish,
 *     who the chase emails, what a finished register said. A register that
 *     holds only a cover is NOT taken.
 *  2. TAKING IT: a lead or an admin takes a session's register in its
 *     facilitators' place, before any line is set; the facilitators are
 *     recorded not there; one history row. A facilitator of the group is
 *     refused, so is anybody else.
 *  3. GIVING IT: one session's register, check-in and report to any approved
 *     account but the caller's own, until midnight; one email to them, no
 *     meeting link; an optional notice to the group with its count checked
 *     again; a preview that changes nothing; a replacement that leaves
 *     nothing of the old grant behind.
 *  4. SOMEBODY GIVEN A SESSION reads and takes that one register, names only,
 *     no notes, no other session, no facilitator record, no check-in
 *     totals, and nothing once the grant has ended.
 *  5. WHO SET EACH LINE: stamped when a line moves, never when it did not,
 *     taken away when it is cleared; a person's own word is `self`.
 *  6. WHETHER EACH FACILITATOR WAS THERE: arriving late, Finish's ticks,
 *     the admins' and leads' change with its history row, and who is sent it
 *     (admins and leads only, never a facilitator, never somebody given a
 *     session, never a member).
 *  7. THE CHASE: covered registers chase who took or gave them, never the
 *     facilitators covered.
 *  8. THE START A REGISTER KEEPS (`sessionAt`) is worked out from the group
 *     read inside the write's own transaction, so a register marked as the
 *     group's weeks are re-dated keeps the session's real start: the three
 *     register routes, and every file that writes the field, held to it.
 *
 * Deleting an account (a person's own stamp and entry go, who acted stays)
 * is held in tests/account-deletion-attendance.test.mjs.
 *
 * Real: the routes and every library under them. Stubbed: the session, the
 * Admin SDK handle, the view-as guard and the mail door.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { A, B, C, RUN, leadSeed } from "./lib/leadWorld.mjs";

const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { static documentId() { return '__name__'; } }",
);
const made = makeWorld("__registerCover", [["firebase-admin/firestore", FIRESTORE]]);
const { world, reset, call, everything, courseRoute, loadTs } = made;
const join_ = await loadJoin(made);
const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const cover = await courseRoute("groups", "[groupId]", "attendance", "cover");
const record = await courseRoute("groups", "[groupId]", "attendance", "facilitators");
const checkIn = await courseRoute("groups", "[groupId]", "check-in");
const report = await courseRoute("groups", "[groupId]", "session-report");
const participantNotes = await courseRoute("groups", "[groupId]", "participant-notes");
const model = await loadTs("lib/courses/registerCover/model.ts");
const words = await loadTs("lib/courses/registerCover/words.ts");
const attendanceLib = await loadTs("lib/firestore/courseAttendance.ts");
const reminders = await loadTs("lib/scheduler/jobs/registerReminders.ts");
const history = await loadTs("lib/courses/groupHistory/load.ts");

const PLACED_ON = new Date("2026-10-27T17:38:00Z");
/** Group B's week 1 session: Tue 3 Nov, 6pm to 8pm in London (GMT). */
const STARTS = new Date("2026-11-03T18:00:00Z");
const DURING = new Date("2026-11-03T18:12:00Z");
mock.timers.enable({ apis: ["Date"], now: PLACED_ON });
const at = (when) => mock.timers.setTime(new Date(when).getTime());

const W1 = `courseAttendance/${RUN.agi}__${B}__w01`;
const stored = () => world.db.read(W1) ?? null;
const auditRows = (kind) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => world.db.read(path))
    .filter((row) => !kind || row.kind === kind);

/** Amara and Dev placed in Group B, Bea in Group A, Tariq in Group C, and told. Penny is pending. */
async function told() {
  at(PLACED_ON);
  const seed = leadSeed();
  seed["users/penny"] = userDoc(session("penny", "pending", false, "Penny Lane"));
  reset(seed, { now: () => new Date() });
  assert.equal((await join_.press()).status, 200);
  const placed = await join_.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: C },
  ]);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  assert.equal((await join_.publish("zach")).status, 200);
  world.mail.length = 0;
  at(DURING);
}

const take = (who, body) => call(who, cover.POST, { groupId: B }, { body: { weekNumber: 1, ...body }, course: true });
const read = (who, groupId = B) => call(who, register.GET, { groupId }, { course: true });
/** The check-in's card for one session, as the register asks it. */
const card = (who, session) =>
  call(
    who,
    async function GET(req, ctx) {
      return checkIn.GET(new Request(`https://naisi.invalid/api?session=${session}`), ctx);
    },
    { groupId: B },
    { course: true },
  );
const mark = (who, marks, extra = {}) =>
  call(who, register.POST, { groupId: B }, { body: { weekNumber: 1, marks, ...extra }, course: true });
const finish = (who, extra = {}) => call(who, push.POST, { groupId: B }, { body: { weekNumber: 1, ...extra }, course: true });

beforeEach(async () => {
  await told();
});

// ---------------------------------------------------------------------------
// 1. The arithmetic
// ---------------------------------------------------------------------------

describe("1. the arithmetic", () => {
  test("a session given to somebody holds until midnight on the later of the grant's day and the session's", () => {
    assert.equal(model.coverUntil(new Date("2026-11-03T15:35:00Z"), STARTS).toISOString(), "2026-11-04T00:00:00.000Z");
    // Given on Monday for Wednesday's session: midnight after Wednesday.
    assert.equal(
      model.coverUntil(new Date("2026-11-02T10:00:00Z"), new Date("2026-11-04T13:00:00Z")).toISOString(),
      "2026-11-05T00:00:00.000Z",
    );
    // Given for a session that has passed: midnight tonight. In summer time, London's midnight.
    assert.equal(model.coverUntil(new Date("2026-11-05T09:00:00Z"), STARTS).toISOString(), "2026-11-06T00:00:00.000Z");
    // 10.30pm on Wed 10 June in London: midnight is 11pm by the UTC clock.
    assert.equal(model.coverUntil(new Date("2026-06-10T21:30:00Z"), null).toISOString(), "2026-06-10T23:00:00.000Z");
  });

  test("a cover a lead took holds; one given holds until its until", () => {
    const now = new Date("2026-11-03T22:00:00Z");
    assert.equal(model.coverIsLive({ kind: "self", byUid: "claudia", at: now, covering: [] }, now), true);
    const given = { kind: "given", byUid: "bea", at: now, covering: [], until: new Date("2026-11-04T00:00:00Z") };
    assert.equal(model.holdsGivenCover(given, "bea", now), true);
    assert.equal(model.holdsGivenCover(given, "bea", new Date("2026-11-04T00:00:00Z")), false);
    assert.equal(model.holdsGivenCover(given, "dev", now), false);
    assert.equal(model.coverIsLive(null, now), false);
  });

  test("a line moved when its mark did, or where somebody who came was; not otherwise", () => {
    assert.equal(model.lineMoved({ mark: null, online: undefined }, { mark: "present", online: false }), true);
    assert.equal(model.lineMoved({ mark: "present", online: false }, { mark: "present", online: true }), true);
    assert.equal(model.lineMoved({ mark: "present", online: false }, { mark: "present", online: false }), false);
    assert.equal(model.lineMoved({ mark: "present", online: undefined }, { mark: "present", online: false }), false);
    assert.equal(model.lineMoved({ mark: "absent", online: true }, { mark: "absent", online: undefined }), false);
    assert.equal(model.lineMoved({ mark: "absent", online: undefined }, { mark: null, online: undefined }), true);
  });

  test("a register that holds only a cover is not taken; one a line was saved on is", () => {
    const now = new Date();
    assert.equal(attendanceLib.registerIsTaken({ cover: { kind: "self", byUid: "claudia", at: now, covering: ["rahul"] } }), false);
    assert.equal(
      attendanceLib.registerIsTaken({ cover: { kind: "given", byUid: "bea", at: now, covering: [] }, facilitatorRecord: { rahul: { state: "not-there" } } }),
      false,
    );
    assert.equal(attendanceLib.registerIsTaken({ cover: { kind: "self", byUid: "claudia", at: now, covering: [] }, markedByUid: "claudia" }), true);
  });

  test("an old register reads no stamps, no cover and no record; a garbled one reads the same", () => {
    const old = attendanceLib.normalizeCourseAttendance("x", { records: { amara: "present" }, markedByUid: "rahul" });
    assert.deepEqual([old.setBy, old.cover, old.facilitatorRecord], [{}, null, {}]);
    const garbled = attendanceLib.normalizeCourseAttendance("x", {
      setBy: { amara: { byUid: "rahul", at: new Date(), how: "sideways" } },
      cover: { kind: "given", at: new Date() },
      facilitatorRecord: { rahul: { state: "maybe", byUid: "zach", at: new Date(), how: "cover" } },
    });
    assert.deepEqual([garbled.setBy, garbled.cover, garbled.facilitatorRecord], [{}, null, {}]);
  });

  test("the chase: who took it, who gave it, the facilitator who last saved it, or every facilitator", () => {
    const now = new Date();
    const self = { kind: "self", byUid: "claudia", at: now, covering: ["rahul"] };
    const given = { kind: "given", byUid: "bea", at: now, covering: ["rahul"], grantedByUid: "zach" };
    assert.deepEqual(model.chaseTargets({ cover: self, markedByUid: "claudia", facilitatorsWithStanding: ["rahul"] }), { kind: "cover-taker", uids: ["claudia"] });
    assert.deepEqual(model.chaseTargets({ cover: given, markedByUid: "bea", facilitatorsWithStanding: ["rahul"] }), { kind: "cover-giver", uids: ["zach"] });
    assert.deepEqual(model.chaseTargets({ cover: null, markedByUid: "rahul", facilitatorsWithStanding: ["rahul", "sofia"] }), { kind: "last-saver", uids: ["rahul"] });
    assert.deepEqual(model.chaseTargets({ cover: null, markedByUid: "", facilitatorsWithStanding: ["rahul", "sofia"] }), { kind: "facilitators", uids: ["rahul", "sofia"] });
    assert.deepEqual(model.chaseTargets({ cover: null, markedByUid: "zach", facilitatorsWithStanding: ["rahul", "sofia"] }), { kind: "facilitators", uids: ["rahul", "sofia"] });
  });

  test("what a finished register said, and whose place it was taken in", () => {
    const counts = model.finishCounts({ a: "present", b: "late", c: "present", d: "absent", e: "excused" }, { c: true });
    assert.deepEqual(counts, { room: 2, online: 1, absent: 1, excused: 1 });
    assert.equal(words.finishedDetail(1, counts, []), "Finished week 1’s register. 2 in the room, 1 online, 1 absent, 1 excused.");
    assert.equal(words.finishedDetail(2, { room: 3, online: 0, absent: 1, excused: 0 }, ["Josh"]), "Finished week 2’s register, covering for Josh. 3 in the room, 1 absent.");
  });
});

// ---------------------------------------------------------------------------
// 2. Taking it
// ---------------------------------------------------------------------------

describe("2. a lead or an admin takes a session's register in its facilitators' place", () => {
  test("the lead: the cover, the facilitators not there, one history row, nothing sent, and the register not taken", async () => {
    const answer = await take("claudia", {});
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const doc = stored();
    assert.equal(doc.cover.kind, "self");
    assert.equal(doc.cover.byUid, "claudia");
    assert.deepEqual(doc.cover.covering, ["rahul", "sofia"]);
    assert.equal(doc.cover.until, undefined);
    assert.deepEqual(Object.keys(doc.facilitatorRecord).sort(), ["rahul", "sofia"]);
    assert.ok(Object.values(doc.facilitatorRecord).every((entry) => entry.state === "not-there" && entry.how === "cover"));
    assert.equal(attendanceLib.registerIsTaken(doc), false, "covering it is not taking it");
    const [row] = auditRows("register-covered");
    assert.equal(row.detail, "Took week 1’s register in Rahul and Sofia’s place.");
    assert.equal(row.weekId, "w01");
    assert.equal(row.emailed, 0);
    assert.deepEqual(world.mail, []);
  });

  test("the run's track lead and an admin may; a facilitator of the group, another group's, a member and the signed out may not", async () => {
    for (const who of ["yusuf", "zach"]) {
      await told();
      assert.equal((await take(who, {})).status, 200, who);
    }
    await told();
    const before = everything();
    const refused = {};
    for (const who of ["rahul", "sofia", "tom", "amara", "bea", "tess", "lloyd", null]) refused[who ?? "signed out"] = (await take(who, {})).status;
    assert.deepEqual(refused, { rahul: 403, sofia: 403, tom: 403, amara: 403, bea: 403, tess: 403, lloyd: 403, "signed out": 401 });
    assert.equal((await take("rahul", {})).body.error, words.COVER_REFUSAL.facilitates);
    assert.equal(everything(), before);
  });

  test("refused once a facilitator has started the register, and once it is finished", async () => {
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    const started = await take("claudia", {});
    assert.deepEqual([started.status, started.body.error], [409, words.COVER_REFUSAL.started]);
    assert.equal(stored().cover, undefined);
    assert.equal((await finish("rahul")).status, 200);
    const done = await take("zach", {});
    assert.equal(done.status, 409);
  });

  test("an admin's or a lead's first line on a register nobody covered takes it, with the record; a facilitator's never does", async () => {
    const marked = await mark("claudia", [{ uid: "amara", status: "present" }]);
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.equal(stored().cover.kind, "self");
    assert.equal(stored().cover.byUid, "claudia");
    assert.equal(auditRows("register-covered").length, 1);
    // A second line by the lead covers nothing again.
    assert.equal((await mark("claudia", [{ uid: "dev", status: "absent" }])).status, 200);
    assert.equal(auditRows("register-covered").length, 1);

    await told();
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    assert.equal(stored().cover, undefined, "a facilitator's save covers nothing");
    // An admin helping a facilitator who started it covers nothing either.
    assert.equal((await mark("zach", [{ uid: "dev", status: "absent" }])).status, 200);
    assert.equal(stored().cover, undefined);
    assert.equal(stored().setBy.dev.how, "cover");
    assert.equal(auditRows("register-covered").length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Giving it
// ---------------------------------------------------------------------------

describe("3. one session given to somebody else", () => {
  test("the preview says whose place, until when, both emails and the count, and changes nothing", async () => {
    const before = everything();
    const answer = await take("claudia", { person: "bea", preview: true });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const { preview } = answer.body;
    assert.equal(preview.kind, "given");
    assert.deepEqual(preview.covering.map((each) => each.uid), ["rahul", "sofia"]);
    assert.equal(preview.until, "2026-11-04T00:00:00.000Z");
    assert.equal(preview.email.subject, "You’re covering Group B today at 6pm");
    assert.equal(
      preview.email.lines[0],
      "Claudia has given you Group B’s session today, Tue 3 Nov, 6pm to 8pm, Hallward B12. Take the register, open the check-in and write the report from the link below.",
    );
    assert.equal(preview.notice.subject, "Bea is running today’s session");
    assert.match(preview.notice.lines[0], /^Rahul and Sofia can’t make it today, so Bea is running Group B’s session at 6pm, as usual in Hallward B12\.$/);
    assert.equal(preview.notice.emails, 2, "Amara and Dev, never the presser, never Bea");
    assert.equal(everything(), before);
    assert.deepEqual(world.mail, []);
  });

  test("given: the cover, until midnight, one email to them with the register's link and no meeting link, one history row", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": "https://meet.example/group-b" });
    const answer = await take("claudia", { person: "bea", reason: "Rahul and Sofia are both ill." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const doc = stored();
    assert.deepEqual([doc.cover.kind, doc.cover.byUid, doc.cover.grantedByUid], ["given", "bea", "claudia"]);
    assert.equal(new Date(doc.cover.until).toISOString(), "2026-11-04T00:00:00.000Z");
    assert.equal(doc.cover.reason, "Rahul and Sofia are both ill.");
    assert.equal(world.mail.length, 1);
    const [email] = world.mail;
    assert.equal(email.to, world.db.read("users/bea").email);
    assert.equal(email.subject, "You’re covering Group B today at 6pm");
    const html = await render(email.react);
    assert.match(html, /group\/agi-autumn-2026-monday__grp00001\/register\?session=w01/);
    assert.doesNotMatch(html, /meet\.example/);
    const [row] = auditRows("register-given");
    // The name each goes by: the history is read by whoever its page admits.
    assert.equal(row.detail, "Gave week 1’s session to Bea, in Rahul and Sofia’s place. Reason: Rahul and Sofia are both ill.");
    assert.equal(row.subjectUid, "bea");
    assert.equal(row.emailed, 1);
  });

  test("the notice to the group: its count checked again, then the group's told people, never the presser or the person given it", async () => {
    const stale = await take("claudia", { person: "bea", tell: true, emailCount: 5 });
    assert.deepEqual([stale.status, stale.body.emails], [409, 2]);
    assert.equal(stored(), null, "a stale count changes nothing");
    assert.deepEqual(world.mail, []);
    const answer = await take("claudia", { person: "bea", tell: true, emailCount: 2 });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const notices = world.mail.filter((mail) => mail.subject === "Bea is running today’s session");
    assert.equal(notices.length, 2);
    assert.equal(auditRows("register-given")[0].emailed, 3);
  });

  test("refused: yourself, a pending account, a facilitator of the group, the telling tick with I'm covering it", async () => {
    const before = everything();
    assert.equal((await take("claudia", { person: "claudia" })).status, 400);
    assert.equal((await take("claudia", { person: "claudia" })).body.error, words.COVER_REFUSAL.yourself);
    assert.equal((await take("claudia", { person: "penny" })).body.error, words.COVER_REFUSAL.noAccount);
    assert.equal((await take("claudia", { person: "nobody-at-all" })).body.error, words.COVER_REFUSAL.noAccount);
    assert.equal((await take("zach", { person: "rahul" })).body.error, words.COVER_REFUSAL.theyFacilitate);
    assert.equal((await take("claudia", { tell: true, emailCount: 2 })).body.error, words.COVER_REFUSAL.tellSelf);
    assert.equal(everything(), before);
  });

  test("a new grant replaces the old one; I'm covering it replaces a grant, leaving nothing of it behind", async () => {
    assert.equal((await take("claudia", { person: "bea" })).status, 200);
    assert.equal((await take("zach", { person: "tariq" })).status, 200);
    assert.deepEqual([stored().cover.byUid, stored().cover.grantedByUid], ["tariq", "zach"]);
    assert.equal((await take("claudia", {})).status, 200);
    const doc = stored();
    assert.deepEqual([doc.cover.kind, doc.cover.byUid], ["self", "claudia"]);
    for (const gone of ["grantedByUid", "grantedAt", "until", "reason"]) assert.equal(doc.cover[gone], undefined, gone);
    assert.deepEqual(doc.cover.covering, ["rahul", "sofia"], "whose place stays whose it was");
    assert.equal(auditRows("register-given").length, 2);
    assert.equal(auditRows("register-covered").length, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. Somebody given a session
// ---------------------------------------------------------------------------

describe("4. somebody given a session takes that one register, names only", () => {
  beforeEach(async () => {
    assert.equal((await take("claudia", { person: "bea" })).status, 200);
    world.mail.length = 0;
  });

  test("the register: that session only, no notes, nobody who left, no facilitator record", async () => {
    assert.equal((await mark("rahul", [], { notes: "Not here today." })).status, 200);
    const answer = await read("bea");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.sessions.map((each) => each.sessionKey), ["w01"]);
    assert.equal(answer.body.sessions[0].notes, "");
    assert.deepEqual(answer.body.participantNotes, {});
    assert.deepEqual(answer.body.leavers, []);
    assert.equal("facilitatorRecord" in answer.body, false, "somebody given a session is sent the facilitator record");
    assert.equal(answer.body.caller.standing, "given");
    assert.equal(answer.body.covers.w01.yours, true);
    assert.equal("reason" in answer.body.covers.w01, false);
    assert.doesNotMatch(JSON.stringify(answer.body), /@/, "an address reaches somebody given a session");
  });

  test("marks, never notes; Finish; and nothing of another session", async () => {
    const marked = await mark("bea", [{ uid: "amara", status: "present" }]);
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.deepEqual([stored().setBy.amara.byUid, stored().setBy.amara.how], ["bea", "cover"]);
    const noted = await mark("bea", [{ uid: "dev", status: "absent" }], { notes: "x" });
    assert.deepEqual([noted.status, noted.body.error], [403, words.REGISTER_COVER_REFUSAL.notes]);
    assert.equal((await call("bea", participantNotes.POST, { groupId: B }, { body: { weekNumber: 1, uid: "dev", note: "x" }, course: true })).status, 403);
    const other = await call("bea", register.POST, { groupId: B }, { body: { weekNumber: 2, marks: [{ uid: "amara", status: "present" }] }, course: true });
    assert.equal(other.status, 403);
    assert.equal((await read("bea", A)).status, 403, "nothing of any other group");
    assert.equal((await finish("bea")).status, 200);
  });

  test("the check-in: theirs to open and see, never its totals; nobody else's session", async () => {
    const own = await card("bea", "w01");
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.last, null);
    if (own.body.card?.state === "closed") assert.equal(own.body.card.totals, null);
    const other = await card("bea", "w02");
    assert.equal(other.status, 403);
    // The lead who did not take it is refused, as before.
    await told();
    const lead = await card("claudia", "w01");
    assert.equal(lead.status, 403);
  });

  test("the session report: theirs, covering for the facilitators; an admin who did not take it still writes none", async () => {
    const written = await call("bea", report.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 4, wentWell: "Good talk." } }, course: true });
    assert.equal(written.status, 200, JSON.stringify(written.body));
    const doc = world.db.read(`courseSessionReports/${RUN.agi}__${B}__w01__bea`);
    assert.deepEqual(doc.coveringFor, ["rahul", "sofia"]);
    const admin = await call("zach", report.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 4 } }, course: true });
    assert.equal(admin.status, 403);
    const facilitator = await call("rahul", report.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 4 } }, course: true });
    assert.equal(facilitator.status, 200);
    assert.equal(world.db.read(`courseSessionReports/${RUN.agi}__${B}__w01__rahul`).coveringFor, undefined);
  });

  test("once the grant has ended: nothing; and the register stays a draft", async () => {
    at("2026-11-04T00:00:00Z");
    assert.equal((await read("bea")).status, 403);
    assert.equal((await mark("bea", [{ uid: "amara", status: "present" }])).status, 403);
    assert.equal((await finish("bea")).status, 403);
    assert.equal(stored().pushedAt, undefined);
  });
});

// ---------------------------------------------------------------------------
// 5. Who set each line
// ---------------------------------------------------------------------------

describe("5. who set each line", () => {
  test("stamped when a line moves, kept when it does not, taken away when it is cleared, and read by everybody who reads the marks", async () => {
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    const first = stored().setBy.amara;
    assert.deepEqual([first.byUid, first.how], ["rahul", "facilitator"]);
    at("2026-11-03T18:20:00Z");
    assert.equal((await mark("sofia", [{ uid: "amara", status: "present" }, { uid: "dev", status: "late" }])).status, 200);
    assert.equal(stored().setBy.amara.byUid, "rahul", "a line a save did not move keeps its stamp");
    assert.equal(stored().setBy.dev.byUid, "sofia");
    assert.equal((await mark("sofia", [{ uid: "amara", status: "present", online: true }])).status, 200);
    assert.equal(stored().setBy.amara.byUid, "sofia", "where somebody was moved");
    assert.equal((await mark("rahul", [{ uid: "dev", status: null }])).status, 200);
    assert.equal(stored().setBy.dev, undefined);

    for (const who of ["rahul", "zach", "claudia"]) {
      const body = (await read(who)).body;
      assert.equal(body.setBy.w01.amara.name.split(" ")[0], "Sofia", who);
      assert.equal(body.setBy.w01.amara.how, "facilitator", who);
    }
  });

  test("an old register shows nobody", async () => {
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    // As every register written before lines were stamped: no stamp at all.
    world.db.poke(W1, { setBy: {} });
    const body = (await read("rahul")).body;
    assert.deepEqual(body.setBy, {});
    assert.deepEqual(body.covers, {});
  });
});

// ---------------------------------------------------------------------------
// 6. Whether each facilitator was there
// ---------------------------------------------------------------------------

describe("6. whether each facilitator was there", () => {
  test("arriving late after a cover; a save after the session is no arrival", async () => {
    assert.equal((await take("claudia", {})).status, 200);
    at("2026-11-03T18:40:00Z");
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    const rahul = stored().facilitatorRecord.rahul;
    assert.deepEqual([rahul.state, new Date(rahul.arrivedAt).toISOString(), rahul.how], ["late", "2026-11-03T18:40:00.000Z", "arrived"]);
    at("2026-11-03T20:30:00Z");
    assert.equal((await mark("sofia", [{ uid: "dev", status: "absent" }])).status, 200);
    assert.equal(stored().facilitatorRecord.sofia.state, "not-there");
  });

  test("Finish: the finisher there, the ticks for the others; without the ticks, only the finisher", async () => {
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }, { uid: "dev", status: "absent" }])).status, 200);
    assert.equal((await finish("rahul", { facilitatorsHere: ["rahul"] })).status, 200);
    assert.deepEqual(
      Object.fromEntries(Object.entries(stored().facilitatorRecord).map(([uid, entry]) => [uid, entry.state])),
      { rahul: "there", sofia: "not-there" },
    );
    const [row] = auditRows("attendance-push");
    assert.equal(row.detail, "Finished week 1’s register. 1 in the room, 1 absent.");
    assert.equal(row.weekId, "w01");

    await told();
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    assert.equal((await finish("rahul")).status, 200);
    assert.deepEqual(Object.keys(stored().facilitatorRecord), ["rahul"]);
  });

  test("the ticks are a facilitator's to send, about the group's facilitators", async () => {
    assert.equal((await mark("claudia", [{ uid: "amara", status: "present" }])).status, 200);
    assert.equal((await finish("claudia", { facilitatorsHere: ["rahul"] })).status, 403);
    assert.equal((await finish("zach", { facilitatorsHere: ["tom"] })).status, 403);
    await told();
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    assert.equal((await finish("rahul", { facilitatorsHere: ["tom"] })).status, 400);
    const covered = await finish("claudia");
    assert.equal(covered.status, 200);
  });

  test("a finish after a cover says whose place it was taken in", async () => {
    assert.equal((await take("claudia", {})).status, 200);
    assert.equal((await mark("claudia", [{ uid: "amara", status: "present" }, { uid: "dev", status: "excused" }])).status, 200);
    assert.equal((await finish("claudia")).status, 200);
    assert.equal(auditRows("attendance-push")[0].detail, "Finished week 1’s register, covering for Rahul and Sofia. 1 in the room, 1 excused.");
  });

  test("who is sent it: admins and the programme's lead, never a run's track lead, a facilitator, somebody given a session or a member", async () => {
    assert.equal((await take("claudia", { person: "bea", reason: "Both away." })).status, 200);
    const sent = {};
    for (const who of ["zach", "claudia", "yusuf", "rahul", "sofia", "bea", "amara", "tom"]) {
      const answer = await read(who);
      sent[who] = answer.status === 200 ? "facilitatorRecord" in answer.body : answer.status;
    }
    // Yusuf is the run's track lead and does not lead the programme: he reads
    // and takes its registers, and is sent none of this (the privacy policy:
    // "The programme's lead and admins see this").
    assert.deepEqual(sent, { zach: true, claudia: true, yusuf: false, rahul: false, sofia: false, bea: false, amara: 403, tom: 403 });
    assert.equal((await read("claudia")).body.covers.w01.reason, "Both away.");
    for (const who of ["rahul", "yusuf", "bea"]) {
      const body = (await read(who)).body;
      assert.equal("reason" in body.covers.w01, false, `${who} is sent the cover's reason`);
      assert.doesNotMatch(JSON.stringify(body), /not-there|Both away/, `${who} is sent the facilitator record`);
      assert.equal(body.caller.readsFacilitatorRecord, false, who);
    }
    assert.equal((await read("claudia")).body.caller.readsFacilitatorRecord, true);
  });

  test("a run's track lead takes a register and opens its check-in, and is sent none of its totals", async () => {
    assert.equal((await take("yusuf", {})).status, 200);
    assert.equal((await mark("yusuf", [{ uid: "amara", status: "present" }])).status, 200);
    const own = await card("yusuf", "w01");
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.last, null, "a track lead is sent the group's last check-in");
    if (own.body.card?.state === "closed") assert.equal(own.body.card.totals, null);
    assert.equal((await read("yusuf")).body.caller.sessions.w01.readsCheckInTotals, false);
    assert.equal((await read("yusuf")).body.caller.sessions.w01.checksIn, true);
    // The programme's lead who took it is sent them.
    await told();
    assert.equal((await take("claudia", {})).status, 200);
    assert.equal((await read("claudia")).body.caller.sessions.w01.readsCheckInTotals, true);
  });

  test("an admin or the programme's lead changes one entry, with a history row only they are shown", async () => {
    assert.equal((await take("claudia", {})).status, 200);
    const change = (who, body) => call(who, record.POST, { groupId: B }, { body: { weekNumber: 1, ...body }, course: true });
    const changed = await change("claudia", { uid: "rahul", state: "late", arrivedAt: "2026-11-03T18:35:00.000Z" });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(stored().facilitatorRecord.rahul.how, "changed");
    const [row] = auditRows("facilitator-record-changed");
    assert.equal(row.detail, "Changed whether Rahul was at week 1’s session: not there, now arrived late, at 6:35pm.");
    assert.deepEqual([row.before.state, row.after.state, row.subjectUid], ["not-there", "late", "rahul"]);
    const before = everything();
    for (const who of ["rahul", "sofia", "bea", "amara", "yusuf"]) assert.equal((await change(who, { uid: "sofia", state: "there" })).status, 403, who);
    assert.equal((await change("zach", { uid: "tom", state: "there" })).status, 400);
    assert.equal((await change("zach", { uid: "rahul", state: "late" })).status, 400, "late needs when they arrived");
    assert.equal(everything(), before);

    const shown = await history.loadGroupHistory(world.courseDb, RUN.agi, B);
    assert.ok(!shown.rows.some((each) => each.kind === "facilitator-record-changed"), "a history drawn for anybody shows the record");
    assert.ok(shown.rows.some((each) => each.kind === "register-covered" && each.category === "registers" && each.weekId === "w01"));
    const toLeads = await history.loadGroupHistory(world.courseDb, RUN.agi, B, { facilitatorRecord: true });
    assert.ok(toLeads.rows.some((each) => each.kind === "facilitator-record-changed" && each.label && each.category === "registers"));
  });
});

// ---------------------------------------------------------------------------
// 7. The chase
// ---------------------------------------------------------------------------

describe("7. who the register's reminder is about", () => {
  const chased = async () => reminders.chasedUids(world.courseDb, world.db.read(`courseGroups/${B}`), attendanceLib.normalizeCourseAttendance("w", stored() ?? {}));

  test("nobody saved it: every facilitator; one facilitator saved it: that one", async () => {
    assert.deepEqual(await chased(), ["rahul", "sofia"]);
    assert.equal((await mark("sofia", [{ uid: "amara", status: "present" }])).status, 200);
    assert.deepEqual(await chased(), ["sofia"]);
  });

  test("covered: who took it, or who gave it; never the facilitators covered", async () => {
    assert.equal((await take("claudia", {})).status, 200);
    assert.deepEqual(await chased(), ["claudia"]);
    assert.equal((await take("zach", { person: "bea" })).status, 200);
    assert.deepEqual(await chased(), ["zach"]);
  });
});

// ---------------------------------------------------------------------------
// 8. The start a register keeps
// ---------------------------------------------------------------------------

describe("8. the start a register keeps is read from the group inside the write", () => {
  const GROUP_PATH = `courseGroups/${B}`;
  /** Somebody re-dates week 1 to 6:30pm between the route's first read and its commit. */
  const reDateMidWrite = () => {
    world.db.beforeCommit = () => world.db.poke(GROUP_PATH, { "sessionOverrides.w01": { startTimeLocal: "18:30" } });
  };

  test("a mark saved as the week is re-dated keeps the new start, never the one read before", async () => {
    reDateMidWrite();
    const marked = await mark("rahul", [{ uid: "amara", status: "present" }]);
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.equal(new Date(stored().sessionAt).toISOString(), "2026-11-03T18:30:00.000Z");
  });

  test("a cover pressed as the week is re-dated is refused, and nothing is stored or emailed", async () => {
    reDateMidWrite();
    const given = await take("claudia", { person: "bea" });
    assert.deepEqual([given.status, given.body.error], [409, words.COVER_REFUSAL.changed]);
    assert.deepEqual(world.mail, []);
    assert.equal(stored(), null);
    assert.equal(auditRows("register-given").length, 0);
  });

  test("the facilitator record, written as the week is re-dated, keeps the new start", async () => {
    assert.equal((await take("claudia", {})).status, 200);
    reDateMidWrite();
    at("2026-11-03T18:45:00Z");
    const changed = await call("claudia", record.POST, { groupId: B }, { body: { weekNumber: 1, uid: "rahul", state: "there" }, course: true });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(new Date(stored().sessionAt).toISOString(), "2026-11-03T18:30:00.000Z");
  });

  test("every file that writes a register's start reads the group inside the same transaction", () => {
    const root = fileURLToPath(new URL("../src", import.meta.url));
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    walk(root);
    // A file that names `sessionAt:` either stores it on a register while it
    // changes the register (and reads the group in that transaction), or does
    // not store it on a register at all. Both lists carry a reason, and both
    // are checked against the tree.
    const WRITERS = {
      "app/api/courses/groups/[groupId]/attendance/route.ts": "the register's marks: sessionInTransaction",
      "app/api/courses/groups/[groupId]/attendance/cover/route.ts": "taking or giving a session: sessionInTransaction",
      "app/api/courses/groups/[groupId]/attendance/facilitators/route.ts": "the facilitator record: sessionInTransaction",
      "app/api/courses/groups/[groupId]/session/change/route.ts": "one week's change reads the group as freshSnap in its transaction",
      "lib/courses/regularTime/apply.ts": "a new regular time reads the group as groupSnap in its transaction",
      "lib/courses/cantMakeIt/seat.ts": "a person's own word reads the group as groupSnap in its transaction",
      "lib/courses/joiningOnline/seat.ts": "a person's own word reads the group as groupSnap in its transaction",
    };
    const NOT_A_REGISTER_WRITE = {
      "lib/courses/sessionChange/didNotHappen.ts": "written inside the change route's transaction, which reads the group first",
      "lib/courses/nextWeekEmail.ts": "the email's facts, never stored on a register",
      "lib/courses/sessionReports/readers.ts": "a report's view, read only",
      "lib/courses/weekEmails/words.ts": "an email's words",
      "lib/scheduler/jobs/weekReminders.ts": "a reminder's facts, never stored on a register",
    };
    const naming = files
      .filter((path) => /sessionAt\s*:/.test(readFileSync(path, "utf8")))
      .map((path) => relative(root, path).split("\\").join("/"))
      .sort();
    const known = new Set([...Object.keys(WRITERS), ...Object.keys(NOT_A_REGISTER_WRITE)]);
    assert.deepEqual(naming.filter((path) => !known.has(path)), [], "a new file writes sessionAt: say how it reads the group");
    assert.deepEqual([...known].filter((path) => !naming.includes(path)).sort(), [], "a listed file no longer names sessionAt");
    for (const path of Object.keys(WRITERS)) {
      const text = readFileSync(join(root, path), "utf8");
      const readsInside = /sessionInTransaction\(tx,/.test(text) || /await tx\.get\(groupRef\)/.test(text) || /tx\.get\(db\.collection\("courseGroups"\)/.test(text) || /freshSnap = await tx\.get\(/.test(text);
      assert.ok(readsInside, `${path} stores sessionAt without reading the group in its transaction`);
    }
  });
});
