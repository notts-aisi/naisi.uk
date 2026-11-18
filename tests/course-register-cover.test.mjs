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
 *  3. GIVING IT: one session's register, check-in and report to somebody
 *     who runs things on the programme (an admin, the committee, its lead,
 *     its track leads, its facilitators) but the caller, until midnight; one
 *     email to them, no meeting link; an optional notice to the group with
 *     its count checked again; a preview that changes nothing; a replacement
 *     that leaves nothing of the old grant behind; the same grant twice
 *     sends nothing.
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
 *  9. AFTER ITS REVIEW: a facilitator's own word before the session is not
 *     starting the register; a member is never given a session; a register
 *     caught up after the session records nobody as not there; a cover's
 *     reason never reaches a facilitator's history; a report is written only
 *     by somebody who still passes the register's gate; Remind never emails
 *     its presser; the reminder links each person to a page they can open.
 * 10. A REGISTER SOMEBODY TOOK THEMSELVES opens its check-in and its report
 *     to them only while they are an admin or lead the run; a session given
 *     to them opens while the grant holds and stands.
 * 11. WHO MARKS SOMEBODY EXCUSED, AND WHO CHANGES AN EXCUSAL THAT STANDS:
 *     an admin and the programme's lead, a lead who facilitates the group
 *     included; never a run's track lead by that alone, a facilitator, a
 *     co-facilitator or somebody given the session. Where an excusal stands
 *     (an approved request, an excused line, or one they recorded the person
 *     came over) those people record only that the person came, or put the
 *     line back; absent and not marked are refused in one sentence and nothing
 *     is written; the person's word in advance stays through it. A save that
 *     only excuses somebody never takes the register. On a finished register
 *     a track lead's correction to excused is refused the same way. The
 *     register's read says which reader is which and where an excusal stands,
 *     and the grid's cycle follows it.
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
import { A, AGI, B, C, ROUND, RUN, formPath, leadSeed } from "./lib/leadWorld.mjs";

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
const columnRoute = await courseRoute("groups", "[groupId]", "attendance", "column");
const sessionChange = await courseRoute("groups", "[groupId]", "session", "change");
const cantMakeItRoute = await courseRoute("groups", "[groupId]", "cant-make-it");
const checkIn = await courseRoute("groups", "[groupId]", "check-in");
const checkInClose = await courseRoute("groups", "[groupId]", "check-in", "close");
const report = await courseRoute("groups", "[groupId]", "session-report");
const participantNotes = await courseRoute("groups", "[groupId]", "participant-notes");
const model = await loadTs("lib/courses/registerCover/model.ts");
const words = await loadTs("lib/courses/registerCover/words.ts");
const attendanceLib = await loadTs("lib/firestore/courseAttendance.ts");
const reminders = await loadTs("lib/scheduler/jobs/registerReminders.ts");
const remind = await loadTs("lib/courses/registerRemind.ts");
const reminderEmail = await loadTs("lib/email/registerReminderEmail.ts");
const history = await loadTs("lib/courses/groupHistory/load.ts");
const registerAccessLib = await loadTs("lib/courses/registerAccess.ts");
const pageWords = await loadTs("lib/courses/registerCover/pageWords.ts");
const marking = await loadTs("lib/courses/excused/marking.ts");
const correctionWords = await loadTs("lib/courses/registerCorrection/pageWords.ts");
const cantMakeItSeat = await loadTs("lib/courses/cantMakeIt/seat.ts");
const cantMakeItWords = await loadTs("lib/courses/cantMakeIt/words.ts");

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
    const answer = await take("claudia", { person: "tom", preview: true });
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
    assert.equal(preview.notice.subject, "Tom is running today’s session");
    assert.match(preview.notice.lines[0], /^Rahul and Sofia can’t make it today, so Tom is running Group B’s session at 6pm, as usual in Hallward B12\.$/);
    assert.equal(preview.notice.emails, 2, "Amara and Dev, never the presser, never Tom");
    assert.equal(everything(), before);
    assert.deepEqual(world.mail, []);
  });

  test("given: the cover, until midnight, one email to them with the register's link and no meeting link, one history row", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": "https://meet.example/group-b" });
    const answer = await take("claudia", { person: "tom", reason: "Rahul and Sofia are both ill." });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const doc = stored();
    assert.deepEqual([doc.cover.kind, doc.cover.byUid, doc.cover.grantedByUid], ["given", "tom", "claudia"]);
    assert.equal(new Date(doc.cover.until).toISOString(), "2026-11-04T00:00:00.000Z");
    assert.equal(doc.cover.reason, "Rahul and Sofia are both ill.");
    assert.equal(world.mail.length, 1);
    const [email] = world.mail;
    assert.equal(email.to, world.db.read("users/tom").email);
    assert.equal(email.subject, "You’re covering Group B today at 6pm");
    const html = await render(email.react);
    assert.match(html, /group\/agi-autumn-2026-monday__grp00001\/register\?session=w01/);
    assert.doesNotMatch(html, /meet\.example/);
    const [row] = auditRows("register-given");
    // The name each goes by: the history is read by whoever its page admits.
    assert.equal(row.detail, "Gave week 1’s session to Tom, in Rahul and Sofia’s place. Reason: Rahul and Sofia are both ill.");
    assert.equal(row.subjectUid, "tom");
    assert.equal(row.emailed, 1);
  });

  test("the notice to the group: its count checked again, then the group's told people, never the presser or the person given it", async () => {
    const stale = await take("claudia", { person: "tom", tell: true, emailCount: 5 });
    assert.deepEqual([stale.status, stale.body.emails], [409, 2]);
    assert.equal(stored(), null, "a stale count changes nothing");
    assert.deepEqual(world.mail, []);
    const answer = await take("claudia", { person: "tom", tell: true, emailCount: 2 });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const notices = world.mail.filter((mail) => mail.subject === "Tom is running today’s session");
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

  test("where the session meets, in both emails: online for a group that meets online with no room; room to be confirmed for one in a room with none", async () => {
    world.db.poke(`courseGroups/${B}`, { campus: "online", "session.location": "" });
    const online = (await take("claudia", { person: "tom", preview: true })).body.preview;
    assert.match(online.email.lines[0], /^Claudia has given you Group B’s session today, Tue 3 Nov, 6pm to 8pm, online\. /);
    assert.match(online.notice.lines[0], /, online as planned\.$/);
    assert.doesNotMatch(JSON.stringify([online.email, online.notice]), /to be confirmed/);

    world.db.poke(`courseGroups/${B}`, { campus: "university-park", "session.location": "" });
    const inARoom = (await take("claudia", { person: "tom", preview: true })).body.preview;
    assert.match(inARoom.email.lines[0], /^Claudia has given you Group B’s session today, Tue 3 Nov, 6pm to 8pm, room to be confirmed\. /);
    assert.match(inARoom.notice.lines[0], /, room to be confirmed\.$/);
    assert.doesNotMatch(JSON.stringify([inARoom.email, inARoom.notice]), /online/);
  });

  test("a give is held to its limits on stored counters: an ordinary give claims one of each", async () => {
    assert.deepEqual(model.GIVE_LIMITS, { perGiverHour: 12, perGroupDay: 20, perPersonDay: 12 });
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    for (const id of [`covergive__${B}__claudia`, `covergiveday__${B}`, "covergiven__tom"]) {
      assert.equal(world.db.read(`courseNudges/emailrate__${id}`)?.count, 1, id);
    }
    // A preview, and I'm covering it, claim nothing and email nobody.
    assert.equal((await take("claudia", { person: "nadia", preview: true })).status, 200);
    assert.equal((await take("claudia", {})).status, 200);
    assert.equal(world.db.read(`courseNudges/emailrate__covergiveday__${B}`).count, 1);
    assert.equal(world.db.read("courseNudges/emailrate__covergiven__nadia"), undefined);
  });

  test("alternating I'm covering it with a give stops at the hourly limit: the refused give writes, claims and sends nothing", async () => {
    for (let i = 1; i <= model.GIVE_LIMITS.perGiverHour; i += 1) {
      assert.equal((await take("claudia", { person: "tom" })).status, 200, `give ${i}`);
      assert.equal((await take("claudia", {})).status, 200, `I'm covering it ${i}`);
    }
    assert.equal(world.mail.length, model.GIVE_LIMITS.perGiverHour, "one email to Tom for each give");
    const before = everything();
    const refused = await take("claudia", { person: "tom" });
    assert.deepEqual([refused.status, refused.body.error], [429, words.GIVE_LIMIT_WORDS.giverHour(model.GIVE_LIMITS.perGiverHour)]);
    assert.ok(refused.body.retryAfterSeconds > 0, "the refusal says when to try again");
    assert.equal(everything(), before, "a refused give wrote something");
    assert.equal(world.mail.length, model.GIVE_LIMITS.perGiverHour, "a refused give emailed somebody");
    assert.equal(stored().cover.kind, "self", "the register says it was given");
    // An hour on, the same person may give again (to somebody not given a day's worth already).
    at(new Date(DURING.getTime() + 61 * 60 * 1000));
    assert.equal((await take("claudia", { person: "nadia" })).status, 200);
  });

  test("two people giving one group's sessions stop at the group's daily limit", async () => {
    let gives = 0;
    for (const giver of ["claudia", "yusuf"]) {
      for (let i = 0; i < model.GIVE_LIMITS.perGiverHour && gives < model.GIVE_LIMITS.perGroupDay; i += 1) {
        const answer = await take(giver, { person: gives % 2 === 0 ? "tom" : "nadia" });
        assert.equal(answer.status, 200, `${giver} ${i}: ${JSON.stringify(answer.body)}`);
        gives += 1;
      }
    }
    assert.equal(gives, model.GIVE_LIMITS.perGroupDay);
    const before = everything();
    const mailed = world.mail.length;
    const refused = await take("zach", { person: "tom" });
    assert.deepEqual([refused.status, refused.body.error], [429, words.GIVE_LIMIT_WORDS.groupDay(model.GIVE_LIMITS.perGroupDay)]);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, mailed);
  });

  test("one person handed the rest of a term of two groups in one sitting is never refused; one give more is", async () => {
    const give = (who, groupId, weekNumber, person = "tom") =>
      call(who, cover.POST, { groupId }, { body: { weekNumber, person }, course: true });
    // Every session of Group B and Group A, all six weeks of each, to Tom.
    for (const groupId of [B, A]) {
      for (let weekNumber = 1; weekNumber <= 6; weekNumber += 1) {
        const answer = await give("claudia", groupId, weekNumber);
        assert.equal(answer.status, 200, `${groupId} week ${weekNumber}: ${JSON.stringify(answer.body)}`);
      }
    }
    assert.equal(model.GIVE_LIMITS.perPersonDay, 12);
    // Week 1 to Nadia, then back to Tom: the thirteenth session given to Tom today.
    assert.equal((await give("yusuf", B, 1, "nadia")).status, 200);
    const before = everything();
    const mailed = world.mail.length;
    const refused = await give("yusuf", B, 1);
    assert.deepEqual([refused.status, refused.body.error], [429, words.GIVE_LIMIT_WORDS.personDay("Tom", model.GIVE_LIMITS.perPersonDay)]);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, mailed);
  });

  test("past the group's notices, a give with Tell the group ticked is refused whole, and the same give unticked goes", async () => {
    world.db.seed(`courseNudges/emailrate__groupchangeday__${B}`, {
      kind: "staff-email-throttle",
      key: `groupchangeday__${B}`,
      windowStartAt: new Date(),
      count: 10,
      updatedAt: new Date(),
    });
    const before = everything();
    const refused = await take("claudia", { person: "tom", tell: true, emailCount: 2 });
    assert.deepEqual([refused.status, refused.body.error], [429, words.GIVE_LIMIT_WORDS.groupNotices(10)]);
    assert.match(refused.body.error, /this session wasn’t given and nobody was emailed: untick Tell the group/);
    assert.equal(everything(), before, "a refused give wrote or claimed something");
    assert.deepEqual(world.mail, []);
    const given = await take("claudia", { person: "tom" });
    assert.equal(given.status, 200, JSON.stringify(given.body));
    assert.equal(world.mail.length, 1, "the give alone emails the person given it");
  });

  test("a new grant replaces the old one; I'm covering it replaces a grant, leaving nothing of it behind", async () => {
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    assert.equal((await take("zach", { person: "nadia" })).status, 200);
    assert.deepEqual([stored().cover.byUid, stored().cover.grantedByUid], ["nadia", "zach"]);
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
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    world.mail.length = 0;
  });

  test("the register: that session only, no notes, nobody who left, no facilitator record", async () => {
    assert.equal((await mark("rahul", [], { notes: "Not here today." })).status, 200);
    const answer = await read("tom");
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
    const marked = await mark("tom", [{ uid: "amara", status: "present" }]);
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.deepEqual([stored().setBy.amara.byUid, stored().setBy.amara.how], ["tom", "cover"]);
    const noted = await mark("tom", [{ uid: "dev", status: "absent" }], { notes: "x" });
    assert.deepEqual([noted.status, noted.body.error], [403, words.REGISTER_COVER_REFUSAL.notes]);
    assert.equal((await call("tom", participantNotes.POST, { groupId: B }, { body: { weekNumber: 1, uid: "dev", note: "x" }, course: true })).status, 403);
    const other = await call("tom", register.POST, { groupId: B }, { body: { weekNumber: 2, marks: [{ uid: "amara", status: "present" }] }, course: true });
    assert.equal(other.status, 403);
    assert.equal((await read("tom", A)).status, 403, "nothing of any other group");
    assert.equal((await finish("tom")).status, 200);
  });

  test("the check-in: theirs to open and see, never its totals; nobody else's session", async () => {
    const own = await card("tom", "w01");
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.last, null);
    if (own.body.card?.state === "closed") assert.equal(own.body.card.totals, null);
    const other = await card("tom", "w02");
    assert.equal(other.status, 403);
    // The lead who did not take it is refused, as before.
    await told();
    const lead = await card("claudia", "w01");
    assert.equal(lead.status, 403);
  });

  test("the session report: theirs, covering for the facilitators; an admin who did not take it still writes none", async () => {
    const written = await call("tom", report.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 4, wentWell: "Good talk." } }, course: true });
    assert.equal(written.status, 200, JSON.stringify(written.body));
    const doc = world.db.read(`courseSessionReports/${RUN.agi}__${B}__w01__tom`);
    assert.deepEqual(doc.coveringFor, ["rahul", "sofia"]);
    const admin = await call("zach", report.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 4 } }, course: true });
    assert.equal(admin.status, 403);
    const facilitator = await call("rahul", report.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 4 } }, course: true });
    assert.equal(facilitator.status, 200);
    assert.equal(world.db.read(`courseSessionReports/${RUN.agi}__${B}__w01__rahul`).coveringFor, undefined);
  });

  test("once the grant has ended: nothing; and the register stays a draft", async () => {
    at("2026-11-04T00:00:00Z");
    assert.equal((await read("tom")).status, 403);
    assert.equal((await mark("tom", [{ uid: "amara", status: "present" }])).status, 403);
    assert.equal((await finish("tom")).status, 403);
    assert.equal(stored().pushedAt, undefined);
  });
});

describe("4a. who took a register, and whose place it was, by reader", () => {
  /** The six readers: an admin, the programme's lead, a track lead, the two facilitators whose place it was, the person given it. */
  const READERS = ["zach", "claudia", "yusuf", "rahul", "sofia", "tom"];

  test("who took it and when, who gave it and until when, reach every reader; whose place, admins and the programme's lead; a facilitator their own place alone", async () => {
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    const until = stored().cover.until.toISOString();
    const seen = {};
    for (const who of READERS) {
      const answer = await read(who);
      assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
      const cover = answer.body.covers.w01;
      assert.equal(cover.by.uid, "tom", `${who} is not told who has it`);
      assert.equal(typeof cover.at, "string", `${who} is not told when`);
      seen[who] = {
        covering: cover.covering.map((each) => each.uid),
        givenBy: cover.givenBy?.uid ?? null,
        until: cover.until,
      };
    }
    assert.deepEqual(seen, {
      zach: { covering: ["rahul", "sofia"], givenBy: "claudia", until },
      claudia: { covering: ["rahul", "sofia"], givenBy: "claudia", until },
      yusuf: { covering: [], givenBy: "claudia", until },
      rahul: { covering: ["rahul"], givenBy: "claudia", until },
      sofia: { covering: ["sofia"], givenBy: "claudia", until },
      tom: { covering: [], givenBy: "claudia", until },
    });
    // The facilitator's line says it was their place, and never a co-facilitator's.
    const asRahul = (await read("rahul")).body;
    const line = pageWords.placeLine({
      cover: asRahul.covers.w01,
      facilitators: asRahul.facilitators,
      readerFacilitates: true,
      facilitatorStarted: false,
      finished: false,
    });
    assert.match(line, /was given this session, covering for you\./);
    assert.doesNotMatch(line, /Sofia/);
  });

  test("each reader's line over a given session, with who gave it and until when sent: whose place only to a reader sent it", async () => {
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    const lines = {};
    const place = {};
    for (const who of READERS) {
      const body = (await read(who)).body;
      const cover = body.covers.w01;
      assert.ok(cover.givenBy && cover.until, `${who} is not sent who gave it and until when`);
      lines[who] = pageWords.placeLine({
        cover,
        facilitators: body.facilitators,
        readerFacilitates: who === "rahul" || who === "sofia",
        facilitatorStarted: false,
        finished: false,
      });
      place[who] = cover.covering.map((each) => each.name.split(" ")[0]);
    }
    // Each reader is sent names by the names rule for them: staff read a whole name, a facilitator the name a person goes by.
    assert.deepEqual(lines, {
      zach: "Tom Fletcher has this session until midnight in Rahul and Sofia’s place.",
      claudia: "Tom Fletcher has this session until midnight in Rahul and Sofia’s place.",
      yusuf: "Tom Fletcher has this session until midnight.",
      rahul: "Tom was given this session, covering for you. Carry on from here: each line says who set it.",
      sofia: "Tom was given this session, covering for you. Carry on from here: each line says who set it.",
      tom: "You’re taking this register. It will say Tom took it.",
    });
    // No line names a facilitator whose place the reader is not sent.
    for (const who of READERS) {
      for (const name of ["Rahul", "Sofia"]) {
        if (!place[who].includes(name)) assert.doesNotMatch(lines[who], new RegExp(name), `${who}'s line names ${name}'s place`);
      }
    }
  });

  test("the register's foot and its cover agree: the person the foot says is reminded about a given session is the person every reader is sent as having given it", async () => {
    world.db.seed("config/scheduler", { enabled: true, jobs: { "courses-register-reminders": { enabled: true } } });
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    for (const who of READERS) {
      const body = (await read(who)).body;
      assert.equal(body.ending.focus?.sessionKey, "w01", who);
      const givenBy = body.covers.w01.givenBy;
      assert.equal(givenBy?.uid, "claudia", who);
      assert.deepEqual(body.ending.reminder?.names, [givenBy.name.split(" ")[0]], `${who}: the foot names somebody else`);
    }
    // A register somebody took themselves: nobody gave it, and the foot names who took it.
    await told();
    world.db.seed("config/scheduler", { enabled: true, jobs: { "courses-register-reminders": { enabled: true } } });
    assert.equal((await take("claudia", {})).status, 200);
    for (const who of ["zach", "claudia", "yusuf", "rahul", "sofia"]) {
      const body = (await read(who)).body;
      assert.deepEqual([body.covers.w01.givenBy, body.covers.w01.until], [null, null], who);
      assert.deepEqual(body.ending.reminder?.names, [body.covers.w01.by.name.split(" ")[0]], who);
    }
  });
});

describe("4b. a given session is held to the bar it was given behind, at every use", () => {
  /** Every door the grant opened, as Tom, for week 1. */
  async function doors() {
    return {
      read: (await read("tom")).status,
      mark: (await mark("tom", [{ uid: "amara", status: "present" }])).status,
      checkIn: (await card("tom", "w01")).status,
      close: (await call("tom", checkInClose.POST, { groupId: B }, { body: { session: "w01" }, course: true })).status,
      report: (await call("tom", report.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 4 } }, course: true })).status,
      finish: (await finish("tom")).status,
    };
  }
  const tomAt = () => world.db.read("users/tom");
  const lapsed = (uid) =>
    registerAccessLib.givenSessionLapsed(world.courseDb ?? world.db, { runId: RUN.agi, groupId: B, sessionKey: "w01" }, { ...tomAt(), uid, role: world.db.read(`users/${uid}`).role }, new Date());

  test("given, then taken off their only group: every door the grant opened refuses, the page says why, and it can be given again", async () => {
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    assert.equal((await read("tom")).status, 200, "the grant opens the register while Tom runs a group");
    // Tom stops facilitating Group C, the one thing he ran on the programme.
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: [] });
    const before = everything();
    const refused = await doors();
    assert.deepEqual(refused, { read: 403, mark: 403, checkIn: 403, close: 403, report: 403, finish: 403 });
    assert.equal(everything(), before, "a refused door wrote something");
    assert.equal(stored().cover.byUid, "tom", "the grant itself is left as it was");
    // The register's page tells Tom in a sentence; the lead is told it does not stand.
    assert.equal(await lapsed("tom"), true);
    assert.match(pageWords.GIVEN_NO_LONGER_YOURS, /no longer run anything on this programme/);
    const asLead = await read("claudia");
    assert.equal(asLead.body.covers.w01.stands, false);
    const line = pageWords.placeLine({
      cover: asLead.body.covers.w01,
      facilitators: [],
      readerFacilitates: false,
      facilitatorStarted: false,
      finished: false,
    });
    assert.equal(line, pageWords.givenNoLongerStandsLine(asLead.body.covers.w01.by.name));
    // The session can be given again.
    assert.equal((await take("claudia", { person: "nadia" })).status, 200);
    assert.equal(stored().cover.byUid, "nadia");
  });

  test("whether a given session stands is sent to an admin, the programme's lead and the person holding it; a track lead and the facilitators read the usual line", async () => {
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    const standsFor = async (who) => {
      const cover = (await read(who)).body.covers.w01;
      return "stands" in cover ? cover.stands : "not sent";
    };
    const before = {};
    for (const who of ["zach", "claudia", "yusuf", "rahul", "sofia", "tom"]) before[who] = await standsFor(who);
    assert.deepEqual(before, { zach: true, claudia: true, yusuf: "not sent", rahul: "not sent", sofia: "not sent", tom: true });

    world.db.poke(`courseGroups/${C}`, { facilitatorUids: [] });
    const after = {};
    for (const who of ["zach", "claudia", "yusuf", "rahul", "sofia"]) after[who] = await standsFor(who);
    assert.deepEqual(after, { zach: false, claudia: false, yusuf: "not sent", rahul: "not sent", sofia: "not sent" });
    assert.equal((await read("tom")).status, 403, "the person it was given to reads nothing of the register");
    for (const who of ["rahul", "sofia"]) {
      const body = (await read(who)).body;
      const line = pageWords.placeLine({
        cover: body.covers.w01,
        facilitators: body.facilitators,
        readerFacilitates: true,
        facilitatorStarted: false,
        finished: false,
      });
      assert.equal(line, `${body.covers.w01.by.name} was given this session, covering for you. Carry on from here: each line says who set it.`, who);
    }
    const asTrackLead = (await read("yusuf")).body.covers.w01;
    const trackLine = pageWords.placeLine({ cover: asTrackLead, facilitators: [], readerFacilitates: false, facilitatorStarted: false, finished: false });
    assert.equal(trackLine, `${asTrackLead.by.name} has this session until midnight.`);
  });

  test("a grant to somebody who runs something on the run stands: moved to another group, the committee, an admin", async () => {
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    // Tom leaves Group C and facilitates Group A: he runs a group of the run.
    world.db.poke(`courseGroups/${C}`, { facilitatorUids: [] });
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "tom"] });
    assert.deepEqual(await doors().then(({ finish: _f, report: _r, close: _c, ...rest }) => rest), { read: 200, mark: 200, checkIn: 200 });
    assert.equal(await lapsed("tom"), false);
    assert.equal((await read("claudia")).body.covers.w01.stands, true);

    // Nadia is on the committee and runs nothing named: her grant stands.
    await told();
    assert.equal((await take("claudia", { person: "nadia" })).status, 200);
    assert.equal((await read("nadia")).status, 200);
    assert.equal((await mark("nadia", [{ uid: "amara", status: "present" }])).status, 200);
    assert.equal((await read("claudia")).body.covers.w01.stands, true);

    // An admin given a session stands too, as an admin.
    await told();
    assert.equal((await take("claudia", { person: "zach" })).status, 200);
    assert.equal((await read("claudia")).body.covers.w01.stands, true);
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
    assert.equal((await take("claudia", { person: "tom", reason: "Both away." })).status, 200);
    const sent = {};
    for (const who of ["zach", "claudia", "yusuf", "rahul", "sofia", "bea", "amara", "tom"]) {
      const answer = await read(who);
      sent[who] = answer.status === 200 ? "facilitatorRecord" in answer.body : answer.status;
    }
    // Yusuf is the run's track lead and does not lead the programme: he reads
    // and takes its registers, and is sent none of this (the privacy policy:
    // "The programme's lead and admins see this").
    assert.deepEqual(sent, { zach: true, claudia: true, yusuf: false, rahul: false, sofia: false, bea: 403, amara: 403, tom: false });
    assert.equal((await read("claudia")).body.covers.w01.reason, "Both away.");
    for (const who of ["rahul", "yusuf", "tom"]) {
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
    assert.equal((await take("zach", { person: "tom" })).status, 200);
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
    const given = await take("claudia", { person: "tom" });
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
      "lib/courses/registerCorrection/column.ts":
        "a column moved to the session it belongs to (sessionInTransaction), and a session that did or did not happen (groupRef in its transaction)",
    };
    const NOT_A_REGISTER_WRITE = {
      "lib/courses/sessionChange/didNotHappen.ts": "written inside the change route's transaction, which reads the group first",
      "lib/courses/nextWeekEmail.ts": "the email's facts, never stored on a register",
      "lib/courses/sessionReports/readers.ts": "a report's view, read only",
      "lib/courses/weekEmails/words.ts": "an email's words",
      "lib/courses/groupWeekWork/load.ts": "a week's card on the group's page, read only",
      "lib/courses/groupWeekWork/remind.ts": "Remind's email facts, never stored on a register",
      "lib/courses/groupWeekWork/words.ts": "Remind's email words",
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

// ---------------------------------------------------------------------------
// 9. After the review
// ---------------------------------------------------------------------------

describe("9. after the review", () => {
  /** Rahul facilitates Group B and holds a place in it: he said in advance he can't make week 1. */
  const rahulCantMakeIt = () => {
    const told = new Date("2026-11-02T09:00:00Z");
    world.db.seed(W1, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 1,
      occurrence: 1,
      records: { rahul: "excused" },
      excusedInAdvance: { rahul: told },
      setBy: { rahul: { byUid: "rahul", at: told, how: "self" } },
    });
  };
  const AFTER_IT_ENDED = "2026-11-03T21:00:00Z";

  test("a facilitator who said they can't make it has not started the register: it can be taken, given, and a lead's first line takes it", async () => {
    rahulCantMakeIt();
    assert.equal(model.startedByFacilitator(attendanceLib.normalizeCourseAttendance("w", stored()), ["rahul", "sofia"]), false);
    const took = await take("claudia", {});
    assert.equal(took.status, 200, JSON.stringify(took.body));
    assert.deepEqual(stored().cover.covering, ["rahul", "sofia"]);
    assert.equal(stored().facilitatorRecord.rahul.state, "not-there");

    await told();
    rahulCantMakeIt();
    const given = await take("claudia", { person: "tom" });
    assert.equal(given.status, 200, JSON.stringify(given.body));
    assert.equal(stored().cover.byUid, "tom");

    await told();
    rahulCantMakeIt();
    assert.equal((await mark("claudia", [{ uid: "amara", status: "present" }])).status, 200);
    assert.deepEqual([stored().cover.kind, stored().cover.byUid], ["self", "claudia"], "the lead's first line did not take it");
    assert.equal(auditRows("register-covered").length, 1);
    // A facilitator's own line, as a facilitator, still starts it.
    await told();
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    assert.deepEqual([(await take("claudia", {})).status], [409]);
  });

  test("a session is given only to somebody who runs things on the programme; a plain member is refused in one sentence", async () => {
    const before = everything();
    for (const who of ["bea", "amara", "nobody"]) {
      const refused = await take("claudia", { person: who, preview: true });
      assert.deepEqual([refused.status, refused.body.error], [400, words.COVER_REFUSAL.notRunning], who);
      assert.equal((await take("claudia", { person: who })).body.error, words.COVER_REFUSAL.notRunning, who);
    }
    assert.equal(everything(), before);
    assert.deepEqual(world.mail, []);
    // An admin, the committee, the programme's lead, another group's facilitator.
    for (const [giver, person] of [["claudia", "zach"], ["claudia", "nadia"], ["zach", "claudia"], ["claudia", "tom"]]) {
      assert.equal((await take(giver, { person, preview: true })).status, 200, person);
    }
    // A member who is one of the run's track leads may be given one.
    world.db.poke(`courseRuns/${RUN.agi}`, { trackLeadUids: ["yusuf", "bea"] });
    assert.equal((await take("claudia", { person: "bea", preview: true })).status, 200, "a track lead");
    // A facilitator of an archived group runs nothing there any more.
    world.db.poke(`courseRuns/${RUN.agi}`, { trackLeadUids: ["yusuf"] });
    world.db.poke(`courseGroups/${C}`, { archived: true });
    assert.equal((await take("claudia", { person: "tom", preview: true })).body.error, words.COVER_REFUSAL.notRunning);
  });

  test("giving the same session to the same person again writes nothing and sends nothing; the preview says who has it", async () => {
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    assert.equal(world.mail.length, 1);
    const preview = (await take("zach", { person: "tom", preview: true })).body.preview;
    assert.deepEqual(preview.replaces, { kind: "given", byUid: "tom", name: "Tom", live: true });
    const before = everything();
    for (const body of [{ person: "tom" }, { person: "tom", tell: true, emailCount: 2 }]) {
      const again = await take("zach", body);
      assert.deepEqual([again.status, again.body.error], [409, words.COVER_REFUSAL.alreadyGiven], JSON.stringify(body));
    }
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 1, "the person was emailed again");
    assert.equal(auditRows("register-given").length, 1);
    // Once the grant has ended, it may be given to them again.
    at("2026-11-04T09:00:00Z");
    assert.equal((await take("zach", { person: "tom" })).status, 200);
  });

  test("a register caught up after its session ended records nobody as not there; taken or given before then, it does", async () => {
    at(AFTER_IT_ENDED);
    assert.equal((await take("claudia", {})).status, 200);
    assert.deepEqual(stored().facilitatorRecord ?? {}, {}, "taken after the session, somebody was recorded not there");
    await told();
    at(AFTER_IT_ENDED);
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    assert.deepEqual(stored().facilitatorRecord ?? {}, {});
    await told();
    at(AFTER_IT_ENDED);
    assert.equal((await mark("zach", [{ uid: "amara", status: "present" }])).status, 200);
    assert.equal(stored().cover.kind, "self", "the first line took it");
    assert.deepEqual(stored().facilitatorRecord ?? {}, {});
    // Before the session ended: recorded not there, as ever.
    await told();
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    assert.deepEqual(Object.keys(stored().facilitatorRecord).sort(), ["rahul", "sofia"]);
    // The line before an admin's first tap says nothing about the record, so it is true either way.
    const line = (await loadTs("lib/courses/registerCover/pageWords.ts")).placeLine({
      cover: null,
      facilitators: [{ uid: "rahul", name: "Rahul Mehta" }],
      readerFacilitates: false,
      facilitatorStarted: false,
      finished: false,
    });
    assert.doesNotMatch(line, /not there|was there/);
  });

  test("a cover's reason is left out of the history drawn for anybody who facilitates the group", async () => {
    assert.equal((await take("claudia", { person: "tom", reason: "Rahul is ill." })).status, 200);
    // "I'm covering it" replaces the grant, with a reason of its own.
    assert.equal((await take("claudia", { reason: "Sofia is away." })).status, 200);
    const plain = await history.loadGroupHistory(world.courseDb, RUN.agi, B);
    const rows = plain.rows.filter((row) => row.kind === "register-given" || row.kind === "register-covered");
    assert.ok(rows.length >= 2);
    for (const row of rows) {
      assert.equal(row.reason, null, row.kind);
      assert.doesNotMatch(row.detail, /Reason:|ill|away/, row.detail);
    }
    const toLeads = await history.loadGroupHistory(world.courseDb, RUN.agi, B, { facilitatorRecord: true });
    assert.ok(toLeads.rows.some((row) => row.kind === "register-covered" && row.reason === "Sofia is away." && /Reason: Sofia is away\./.test(row.detail)));
  });

  test("a report is written in a facilitator's place only by somebody who still passes the register's gate", async () => {
    assert.equal((await take("claudia", {})).status, 200);
    const write = () => call("claudia", report.PUT, { groupId: B }, { body: { sessionKey: "w01", answers: { how: 4 } }, course: true });
    world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "nadia" });
    assert.equal((await write()).status, 403, "somebody who stopped leading the programme wrote the report");
    world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "claudia" });
    assert.equal((await write()).status, 200);
  });

  test("somebody given a session sees that one session's meeting link on its register, while the grant holds, and no other", async () => {
    const audience = await loadTs("lib/courses/meetingLink/audience.ts");
    const given = await loadTs("lib/courses/meetingLink/givenSession.ts");
    const access = await loadTs("lib/courses/registerAccess.ts");
    const groupsLib = await loadTs("lib/firestore/courseGroups.ts");
    const runsLib = await loadTs("lib/firestore/courses.ts");
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": "https://meet.example/group-b" });
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    const tom = session("tom", "member", false, "Tom Fletcher");
    const group = groupsLib.normalizeCourseGroup(B, world.db.read(`courseGroups/${B}`));
    const run = runsLib.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const gated = await access.gateGroupRegister(B, tom, world.courseDb);
    assert.deepEqual(gated.givenSessions, ["w01"]);
    const ask = (sessionKey) => given.givenSessionLink({ run, group, viewer: tom, sessionKey, givenSessions: gated.givenSessions });
    assert.equal(ask("w01"), "https://meet.example/group-b");
    assert.equal(ask("w02"), null, "another session's link");
    assert.equal(
      audience.seesSessionLink({ viewer: tom, isAdmin: false, seat: null, group, sessionKey: null, givenSessions: gated.givenSessions }),
      false,
      "the group's standing link",
    );
    // A fellow of another group, given nothing, sees none; nor does Tom once the grant has ended.
    assert.equal(audience.seesSessionLink({ viewer: session("bea", "member", false, "Bea"), isAdmin: false, seat: null, group, sessionKey: "w01" }), false);
    at("2026-11-04T00:00:00Z");
    assert.equal((await access.gateGroupRegister(B, tom, world.courseDb)).ok, false);
    // The email given with the session still carries no link.
    assert.doesNotMatch(await render(world.mail[0].react), /meet\.example/);
  });

  test("Remind never emails the person pressing it, and each reminder links to a page its reader can open", async () => {
    const group = world.db.read(`courseGroups/${B}`);
    const groupDoc = { id: B, runId: RUN.agi, name: "Group B", facilitatorUids: group.facilitatorUids };
    const send = (state, presser) =>
      remind.sendReminders(world.courseDb, {
        run: { id: RUN.agi },
        group: groupDoc,
        sessionKey: "w01",
        sessionStartsAt: STARTS,
        sendable: state.sendable,
        switches: { scheduled: true, tasksOn: false },
        config: { registerTaskHours: 60 },
        appUrl: "https://naisi.example",
        pressedByUid: presser,
      });
    const linkIn = async (mail) => /href="([^"]*register[^"]*)"/.exec((await render(mail.react)).replaceAll("&amp;", "&"))?.[1] ?? "";

    // Uncovered: the group's facilitators, linked to the run's own register.
    at(AFTER_IT_ENDED);
    const facilitators = await remind.readReminderState(world.courseDb, groupDoc, "w01", new Date(), "zach");
    assert.deepEqual(facilitators.sendable.map((each) => each.uid).sort(), ["rahul", "sofia"]);
    assert.ok(facilitators.sendable.every((each) => each.opens.kind === "learn"));

    // Taken by the programme's lead: their press emails nobody, an admin's emails them, linked to the programme's page.
    await told();
    assert.equal((await take("claudia", {})).status, 200);
    at(AFTER_IT_ENDED);
    const own = await remind.readReminderState(world.courseDb, groupDoc, "w01", new Date(), "claudia");
    assert.deepEqual(own.sendable, [], "the lead's own press would email the lead");
    assert.deepEqual(await send({ sendable: [{ uid: "claudia", firstName: "Claudia", to: "claudia@example.com", opens: reminderEmail.LEARN }] }, "claudia"), { emailed: 0, failed: 0, names: [] });
    assert.deepEqual(world.mail, []);
    const byAdmin = await remind.readReminderState(world.courseDb, groupDoc, "w01", new Date(), "zach");
    assert.deepEqual(byAdmin.sendable.map((each) => each.uid), ["claudia"]);
    assert.equal((await send(byAdmin, "zach")).emailed, 1);
    assert.equal(
      await linkIn(world.mail[0]),
      `https://naisi.example/admin/admissions/forms/${ROUND}/programmes/${AGI}/groups/${B}/register?session=w01`,
    );

    // Taken by an admin, or a track lead: the run's own register, which admits them.
    for (const taker of ["zach", "yusuf"]) {
      await told();
      assert.equal((await take(taker, {})).status, 200);
      at(AFTER_IT_ENDED);
      const person = await reminders.resolveChased(world.courseDb, taker, groupDoc, "w01");
      assert.deepEqual(person.opens, { kind: "learn" }, taker);
    }
    assert.equal(
      reminderEmail.registerReminderLink("https://naisi.example", RUN.agi, B),
      `https://naisi.example/learn/${RUN.agi}/group/${B}/register`,
    );
  });
});

// ---------------------------------------------------------------------------
// 10. A register somebody took themselves, and while it counts as theirs
// ---------------------------------------------------------------------------

describe("10. a register somebody took themselves opens its check-in and its report to them only while they can take one", () => {
  /** Week 3's session: Tue 17 Nov, 6pm in London (GMT). */
  const WEEK_3 = "2026-11-17T18:12:00Z";
  /**
   * The check-in (read, open, close) and the session report of one session,
   * as `who`: 403 is the door refusing them; anything else is the door
   * letting them through (opening and closing a check-in nobody is marked
   * here for answers 409 from past the door).
   */
  async function doorsOn(who, key) {
    const door = (answer) => (answer.status === 403 ? 403 : `through (${answer.status})`);
    return {
      read: door(await card(who, key)),
      open: door(await call(who, checkIn.POST, { groupId: B }, { body: { session: key, people: 2 }, course: true })),
      close: door(await call(who, checkInClose.POST, { groupId: B }, { body: { session: key }, course: true })),
      report: door(await call(who, report.PUT, { groupId: B }, { body: { sessionKey: key, answers: { how: 4 } }, course: true })),
    };
  }
  const REFUSED = { read: 403, open: 403, close: 403, report: 403 };
  const THROUGH = { read: "through (200)", open: "through (409)", close: "through (409)", report: "through (200)" };

  test("taken while leading the run, leading nothing today, and given another session: refused the one taken, admitted to the one given", async () => {
    assert.equal((await take("yusuf", {})).status, 200);
    // Yusuf stops being the run's track lead, and stays on the committee.
    world.db.poke(`courseRuns/${RUN.agi}`, { trackLeadUids: [] });
    const given = await call("claudia", cover.POST, { groupId: B }, { body: { weekNumber: 3, person: "yusuf" }, course: true });
    assert.equal(given.status, 200, JSON.stringify(given.body));
    at(WEEK_3);
    const before = everything();
    assert.deepEqual(await doorsOn("yusuf", "w01"), REFUSED);
    assert.equal(everything(), before, "a refused door wrote something");
    assert.equal(stored().cover.byUid, "yusuf", "the cover itself is left as it was");
    assert.deepEqual(await doorsOn("yusuf", "w03"), THROUGH);
  });

  test("a lead who took it and leads today, an admin who took it, and a facilitator of the group are admitted as before", async () => {
    for (const taker of ["yusuf", "zach"]) {
      await told();
      assert.equal((await take(taker, {})).status, 200);
      assert.deepEqual(await doorsOn(taker, "w01"), THROUGH, taker);
    }
    await told();
    assert.deepEqual(await doorsOn("rahul", "w01"), THROUGH);
  });
});

// ---------------------------------------------------------------------------
// 11. Who marks somebody excused, and who changes an excusal that stands
// ---------------------------------------------------------------------------

describe("11. only an admin or the programme's lead marks somebody excused, or turns an excusal into an absence", () => {
  /** When Dev told us in advance, on the line laid as their own word. */
  const SAID = new Date("2026-11-02T09:00:00Z");
  /** Claudia leads the programme, and facilitates Group B as well. */
  const leadFacilitates = () => world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "claudia"] });
  /** A request to be excused about `uid` from `sessionKey`, decided (or not) as `status` says. */
  const excuseRequest = (uid, status, sessionKey = "w01") =>
    world.db.seed(`courseRequests/excused-${uid}-${sessionKey}-${status}`, {
      kind: "excused",
      status,
      runId: RUN.agi,
      groupId: B,
      subjectUid: uid,
      askedByUid: uid,
      askedAt: new Date("2026-10-30T09:00:00Z"),
      change: {
        weeks: [
          {
            sessionKey,
            status,
            ...(status === "waiting" ? {} : { decidedByUid: "zach", decidedAt: new Date("2026-10-31T09:00:00Z") }),
          },
        ],
      },
    });
  /** Week 1's register, made if nobody has made it yet, with `fields` laid on it by path. */
  const lay = (fields) => {
    if (!stored()) world.db.seed(W1, { runId: RUN.agi, groupId: B, weekNumber: 1, occurrence: 1, records: {} });
    world.db.poke(W1, fields);
  };
  /** The six people of the rule, and what makes each who they are on week 1. */
  const PEOPLE = {
    "an admin": { who: "zach", decides: true },
    "the programme's lead": { who: "claudia", decides: true },
    "the lead, facilitating the group": { who: "claudia", decides: true, setUp: leadFacilitates },
    "a run's track lead": { who: "yusuf", decides: false },
    "the group's facilitator": { who: "rahul", decides: false },
    "a co-facilitator": { who: "sofia", decides: false },
    "somebody given the session": {
      who: "tom",
      decides: false,
      setUp: async () => assert.equal((await take("claudia", { person: "tom" })).status, 200),
    },
  };
  /** The four lines an excusal stands on, each laid on Dev's line of week 1. */
  const LINES = {
    "an approved request": async () => {
      excuseRequest("dev", "approved");
      lay({ "records.dev": "present" });
    },
    "excused by an admin's hand": async () => {
      assert.equal((await mark("zach", [{ uid: "dev", status: "excused" }])).status, 200);
    },
    "the person's own word in advance": async () => {
      lay({ "records.dev": "excused", "excusedInAdvance.dev": SAID, "setBy.dev": { byUid: "dev", at: SAID, how: "self" } });
    },
    "kept after a facilitator recorded that the person came": async () => {
      assert.equal((await mark("zach", [{ uid: "dev", status: "excused" }])).status, 200);
      assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }])).status, 200);
      // Recording that Dev came over an excused line keeps that it was, with the admin's stamp it displaced.
      assert.deepEqual([stored().excusalKept.dev.byUid, stored().excusalKept.dev.how], ["zach", "cover"]);
    },
  };

  for (const [label, person] of Object.entries(PEOPLE).filter(([, each]) => !each.decides)) {
    test(`${label}: where an excusal stands, that the person came is written, absent and not marked are refused with nothing written, and excused goes back`, async () => {
      for (const [kind, layLine] of Object.entries(LINES)) {
        await told();
        await person.setUp?.();
        await layLine();
        const toldBefore = stored().excusedInAdvance?.dev;
        for (const status of ["absent", null]) {
          const before = everything();
          const refused = await mark(person.who, [{ uid: "dev", status }]);
          assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSAL_STANDS], `${kind}: ${status}`);
          assert.equal(everything(), before, `${kind}: a refused ${status} wrote something`);
        }
        for (const status of ["present", "late", "left-early"]) {
          const saved = await mark(person.who, [{ uid: "dev", status }]);
          assert.equal(saved.status, 200, `${kind}: ${status}: ${JSON.stringify(saved.body)}`);
          assert.equal(stored().records.dev, status, kind);
          assert.deepEqual(stored().excusedInAdvance?.dev, toldBefore, `${kind}: the person's word went with ${status}`);
        }
        // Still standing after three taps: absent is refused again.
        assert.equal((await mark(person.who, [{ uid: "dev", status: "absent" }])).status, 403, kind);
        const back = await mark(person.who, [{ uid: "dev", status: "excused" }]);
        assert.equal(back.status, 200, `${kind}: ${JSON.stringify(back.body)}`);
        assert.equal(stored().records.dev, "excused", kind);
        assert.deepEqual(stored().excusedInAdvance?.dev, toldBefore, `${kind}: putting the line back lost the person's word`);
        assert.equal(stored().excusalKept?.dev, undefined, `${kind}: an excused line keeps no marker`);
      }
    });
  }

  for (const [label, person] of Object.entries(PEOPLE).filter(([, each]) => each.decides)) {
    test(`${label}: any mark is written over an excusal that stands, and what was kept of it goes`, async () => {
      for (const [kind, layLine] of Object.entries(LINES)) {
        await told();
        await person.setUp?.();
        await layLine();
        for (const status of ["absent", null, "late", "excused"]) {
          const saved = await mark(person.who, [{ uid: "dev", status }]);
          assert.equal(saved.status, 200, `${kind}: ${status}: ${JSON.stringify(saved.body)}`);
          assert.equal(stored().records.dev, status ?? undefined, `${kind}: ${status}`);
          assert.equal(stored().excusalKept?.dev, undefined, `${kind}: the marker stayed after ${status}`);
        }
        assert.equal(stored().excusedInAdvance?.dev, undefined, `${kind}: an admin's or the lead's mark takes the person's word over`);
        assert.equal((await read(person.who)).body.caller.marksExcused, true, label);
      }
    });
  }

  test("the two saves: a facilitator records that the excused person came, then absent and not marked are refused, late is written, and excused goes back", async () => {
    assert.equal((await mark("zach", [{ uid: "dev", status: "excused" }])).status, 200);
    assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }])).status, 200);
    assert.equal(stored().records.dev, "present");
    for (const status of ["absent", null]) {
      const before = everything();
      const refused = await mark("rahul", [{ uid: "dev", status }]);
      assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSAL_STANDS], String(status));
      assert.equal(everything(), before, `a refused ${status} wrote something`);
    }
    assert.equal((await mark("rahul", [{ uid: "dev", status: "late" }])).status, 200);
    assert.equal(stored().records.dev, "late");
    assert.equal((await mark("rahul", [{ uid: "dev", status: "excused" }])).status, 200);
    assert.equal(stored().records.dev, "excused");
  });

  test("excused where no excusal stands: an admin, the lead and a lead who facilitates write it; a run's track lead, a facilitator, a co-facilitator and somebody given the session are refused, and nothing is written", async () => {
    for (const [label, person] of Object.entries(PEOPLE)) {
      await told();
      await person.setUp?.();
      if (person.decides) {
        const answer = await mark(person.who, [{ uid: "dev", status: "excused" }]);
        assert.equal(answer.status, 200, `${label}: ${JSON.stringify(answer.body)}`);
        assert.deepEqual([stored().records.dev, stored().setBy.dev.byUid], ["excused", person.who], label);
        const caller = (await read(person.who)).body.caller;
        assert.equal(caller.marksExcused, true, label);
        assert.equal(caller.facilitates, Boolean(person.setUp), `${label}: facilitates the group`);
        continue;
      }
      const before = everything();
      const refused = await mark(person.who, [{ uid: "amara", status: "present" }, { uid: "dev", status: "excused" }]);
      assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSED_BY_ADMIN_OR_LEAD], label);
      assert.equal(everything(), before, `${label}'s refused save wrote something`);
      // The rest of the same save, without the excused line, goes as before.
      assert.equal((await mark(person.who, [{ uid: "amara", status: "present" }, { uid: "dev", status: "absent" }])).status, 200, label);
      assert.equal((await read(person.who)).body.caller.marksExcused, false, label);
    }
    // A run's track lead takes the register, and marks every line but excused.
    await told();
    const before = everything();
    const refused = await mark("yusuf", [{ uid: "dev", status: "excused" }]);
    assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSED_BY_ADMIN_OR_LEAD], "a run's track lead");
    assert.equal(everything(), before, "the track lead's refused save wrote something");
    assert.equal((await mark("yusuf", [{ uid: "dev", status: "absent" }])).status, 200);
    assert.equal((await read("yusuf")).body.caller.marksExcused, false);
  });

  test("a line already excused goes through a facilitator's save untouched, and the person's word stays through the person coming and the line going back", async () => {
    lay({ "records.dev": "excused", "excusedInAdvance.dev": SAID, "setBy.dev": { byUid: "dev", at: SAID, how: "self" } });
    for (const who of ["rahul", "sofia"]) {
      const saved = await mark(who, [{ uid: "amara", status: "present" }, { uid: "dev", status: "excused" }]);
      assert.equal(saved.status, 200, `${who}: ${JSON.stringify(saved.body)}`);
      assert.equal(stored().records.dev, "excused", who);
      assert.deepEqual(stored().excusedInAdvance.dev, SAID, `${who}'s save took Dev's own word over`);
      assert.deepEqual([stored().setBy.dev.byUid, stored().setBy.dev.how], ["dev", "self"], `${who}'s save touched Dev's line`);
    }
    // A mis-tap and its undo: the word is still Dev's, and Dev may still take it back.
    assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }])).status, 200);
    assert.deepEqual([stored().records.dev, stored().excusedInAdvance.dev, stored().excusalKept.dev], ["present", SAID, { byUid: "dev", at: SAID, how: "self" }]);
    assert.equal((await mark("rahul", [{ uid: "dev", status: "excused" }])).status, 200);
    assert.deepEqual([stored().records.dev, stored().excusedInAdvance.dev], ["excused", SAID]);
    // An admin's mark takes the line over, and the word goes with it.
    assert.equal((await mark("zach", [{ uid: "dev", status: "absent" }])).status, 200);
    assert.equal(stored().excusedInAdvance?.dev, undefined);
  });

  test("a facilitator puts a line back to excused where an approved request stands for that person and that session", async () => {
    excuseRequest("dev", "approved");
    assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }])).status, 200);
    const restored = await mark("rahul", [{ uid: "dev", status: "excused" }]);
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(stored().records.dev, "excused");
  });

  test("a request that does not stand behind the line lets nobody but an admin or the lead set excused: waiting, declined, or approved for another week", async () => {
    for (const [label, setUp] of [
      ["waiting", () => excuseRequest("dev", "waiting")],
      ["declined", () => excuseRequest("dev", "declined")],
      ["approved for week 2", () => excuseRequest("dev", "approved", "w02")],
    ]) {
      await told();
      setUp();
      assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }])).status, 200, label);
      const before = everything();
      const refused = await mark("rahul", [{ uid: "dev", status: "excused" }]);
      assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSED_BY_ADMIN_OR_LEAD], label);
      assert.equal(everything(), before, `${label}: a refused save wrote something`);
      // Nor does it hold an absence back: no excusal stands here.
      assert.equal((await mark("rahul", [{ uid: "dev", status: "absent" }])).status, 200, label);
    }
  });

  test("a save that only excuses somebody never takes the register: no cover, nobody recorded not there, and the facilitator's later save is its first take", async () => {
    assert.equal((await mark("zach", [{ uid: "dev", status: "excused" }])).status, 200);
    let doc = stored();
    assert.equal(doc.records.dev, "excused");
    assert.equal(doc.cover, undefined, "an excusal stamped a cover");
    assert.equal(doc.facilitatorRecord, undefined, "an excusal recorded a facilitator as not there");
    assert.equal(attendanceLib.registerIsTaken(doc), false, "an excusal took the register");
    // The lead clearing it, and setting it again, takes nothing either.
    assert.equal((await mark("claudia", [{ uid: "dev", status: null }])).status, 200);
    assert.equal((await mark("claudia", [{ uid: "dev", status: "excused" }])).status, 200);
    doc = stored();
    assert.deepEqual([doc.cover, doc.facilitatorRecord, attendanceLib.registerIsTaken(doc)], [undefined, undefined, false]);
    assert.equal(auditRows("register-covered").length, 0);
    // The facilitator's save, during the session: the first take, theirs, with nobody covered and nobody arriving late.
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
    doc = stored();
    assert.equal(doc.markedByUid, "rahul");
    assert.deepEqual([doc.cover, doc.facilitatorRecord], [undefined, undefined]);
    assert.equal(model.startedByFacilitator(attendanceLib.normalizeCourseAttendance("w", doc), ["rahul", "sofia"]), true);
    assert.equal(auditRows("register-covered").length, 0);
  });

  test("on a finished register, a run's track lead's correction to excused, of a line or a whole column, is refused in the same sentence and writes nothing; the lead's is written", async () => {
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }, { uid: "dev", status: "absent" }])).status, 200);
    assert.equal((await finish("rahul")).status, 200);
    const correct = (who, marks) =>
      call(who, register.PATCH, { groupId: B }, { body: { weekNumber: 1, marks, reason: "Dev told us before the session." }, course: true });
    const before = everything();
    const refused = await correct("yusuf", [{ uid: "dev", status: "excused" }]);
    assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSED_BY_ADMIN_OR_LEAD]);
    assert.equal(everything(), before, "the track lead's refused correction wrote something");
    // The track lead corrects every other line as before; the lead corrects it to excused.
    assert.equal((await correct("yusuf", [{ uid: "dev", status: "late" }])).status, 200);
    assert.equal((await correct("claudia", [{ uid: "dev", status: "excused" }])).status, 200);
    assert.equal(stored().records.dev, "excused");
    // "It did happen", for the whole column, with an excused line where no
    // excusal stands (Dev's stands now, by the lead's correction: Amara's does not).
    const press = {
      weekNumber: 1,
      kind: "did-happen",
      reason: "It went ahead after all.",
      lines: [
        { uid: "amara", status: "excused" },
        { uid: "dev", status: "excused" },
      ],
    };
    const beforeColumn = everything();
    const columnRefused = await call("yusuf", columnRoute.POST, { groupId: B }, { body: press, course: true });
    assert.deepEqual([columnRefused.status, columnRefused.body.error], [403, marking.EXCUSED_BY_ADMIN_OR_LEAD]);
    assert.equal(everything(), beforeColumn, "the track lead's refused column wrote something");
    const byLead = await call("claudia", columnRoute.POST, { groupId: B }, { body: press, course: true });
    assert.notEqual(byLead.body.error, marking.EXCUSED_BY_ADMIN_OR_LEAD, "the lead is refused an excused line");
  });

  test("on a finished register, where an excusal stands, a run's track lead's correction to absent or not marked, of a line or a whole column, is refused and writes nothing; the person came is written; an admin's and the lead's absent is written and the marker goes", async () => {
    const correct = (who, marks) =>
      call(who, register.PATCH, { groupId: B }, { body: { weekNumber: 1, marks, reason: "From the sign-in sheet." }, course: true });
    const column = (who, press) => call(who, columnRoute.POST, { groupId: B }, { body: { weekNumber: 1, reason: "Taken for the wrong week.", ...press }, course: true });
    /** Dev excused by an admin, recorded as having come by the facilitator, and the register finished. */
    const finishedWithExcusal = async () => {
      await told();
      assert.equal((await mark("zach", [{ uid: "dev", status: "excused" }])).status, 200);
      assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }, { uid: "amara", status: "present" }])).status, 200);
      assert.equal((await finish("rahul")).status, 200);
      assert.equal(stored().excusalKept.dev.byUid, "zach");
    };
    await finishedWithExcusal();
    for (const status of ["absent", null]) {
      const before = everything();
      const refused = await correct("yusuf", [{ uid: "dev", status }]);
      assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSAL_STANDS], `a line to ${status}`);
      assert.equal(everything(), before, `the track lead's refused correction to ${status} wrote something`);
    }
    for (const [label, press] of [
      ["not marked: the column cleared", { kind: "clear" }],
      ["absent: It did happen, asked before it is written", { kind: "did-happen", preview: true, lines: [{ uid: "dev", status: "absent" }] }],
    ]) {
      const before = everything();
      const refused = await column("yusuf", press);
      assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSAL_STANDS], label);
      assert.equal(everything(), before, `${label}: the track lead's refused column wrote something`);
    }
    // That Dev came stays the track lead's to correct, and the excusal still stands after it.
    assert.equal((await correct("yusuf", [{ uid: "dev", status: "late" }])).status, 200);
    assert.equal((await correct("yusuf", [{ uid: "dev", status: "present" }])).status, 200);
    assert.deepEqual([stored().records.dev, stored().excusalKept.dev.byUid], ["present", "zach"]);
    assert.equal((await correct("yusuf", [{ uid: "dev", status: "absent" }])).status, 403, "a correction of theirs let the excusal go");
    // An admin's absent, and the lead's, are written, and what was kept of the excusal goes.
    for (const who of ["zach", "claudia"]) {
      if (who === "claudia") await finishedWithExcusal();
      const decided = await correct(who, [{ uid: "dev", status: "absent" }]);
      assert.equal(decided.status, 200, `${who}: ${JSON.stringify(decided.body)}`);
      assert.deepEqual([stored().records.dev, stored().excusalKept?.dev], ["absent", undefined], who);
    }
  });

  test("a move does not write a line that is not that the person came over an excusal on the week its lines go to: a track lead is refused, an admin moves as before", async () => {
    const W2 = `courseAttendance/${RUN.agi}__${B}__w02`;
    const markWeek2 = (who, marks) => call(who, register.POST, { groupId: B }, { body: { weekNumber: 2, marks }, course: true });
    const move = (who) =>
      call(who, columnRoute.POST, { groupId: B }, { body: { weekNumber: 1, kind: "move", to: { weekNumber: 2, occurrence: 1 }, reason: "These lines belong to week 2." }, course: true });
    // Week 1 finished with Dev absent; week 2 under way, nobody has taken it, and an admin has excused Dev from it.
    assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }, { uid: "dev", status: "absent" }])).status, 200);
    assert.equal((await finish("rahul")).status, 200);
    at("2026-11-10T18:30:00Z");
    assert.equal((await markWeek2("zach", [{ uid: "dev", status: "excused" }])).status, 200);
    assert.equal(attendanceLib.registerIsTaken(world.db.read(W2)), false, "an excusal took week 2's register");
    const before = everything();
    const refused = await move("yusuf");
    assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSAL_STANDS]);
    assert.equal(everything(), before, "the track lead's refused move wrote something");
    const moved = await move("zach");
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(world.db.read(W2).records.dev, "absent", "an admin's move writes the line as before");
  });

  test("a run's track lead moving a line that says the person came onto a line excused there keeps that the excusal stands, so a second correction to absent is refused; an admin's move decides the line", async () => {
    const W2 = `courseAttendance/${RUN.agi}__${B}__w02`;
    const markWeek2 = (who, marks) => call(who, register.POST, { groupId: B }, { body: { weekNumber: 2, marks }, course: true });
    const move = (who) =>
      call(who, columnRoute.POST, { groupId: B }, { body: { weekNumber: 1, kind: "move", to: { weekNumber: 2, occurrence: 1 }, reason: "These lines belong to week 2." }, course: true });
    const correctWeek2 = (who, marks) =>
      call(who, register.PATCH, { groupId: B }, { body: { weekNumber: 2, marks, reason: "From the sign-in sheet." }, course: true });
    for (const [who, decides] of [
      ["yusuf", false],
      ["zach", true],
    ]) {
      await told();
      // 1. Week 1 finished with Dev present. 2. Week 2 under way, nobody has taken it, and an admin has excused Dev from it.
      assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }, { uid: "dev", status: "present" }])).status, 200);
      assert.equal((await finish("rahul")).status, 200);
      at("2026-11-10T18:30:00Z");
      assert.equal((await markWeek2("zach", [{ uid: "dev", status: "excused" }])).status, 200);
      const excusedBy = world.db.read(W2).setBy.dev;
      // 3. The move: Dev's line on week 2 now says they came.
      const moved = await move(who);
      assert.equal(moved.status, 200, `${who}: ${JSON.stringify(moved.body)}`);
      assert.equal(world.db.read(W2).records.dev, "present", who);
      if (!decides) {
        // The excusal still stands under it, with the stamp it displaced.
        assert.deepEqual(
          [world.db.read(W2).excusalKept?.dev?.byUid, world.db.read(W2).excusalKept?.dev?.how],
          [excusedBy.byUid, excusedBy.how],
          "the track lead's move ended the excusal",
        );
        // 4. A second correction, to absent and to not marked: refused, and nothing written.
        for (const status of ["absent", null]) {
          const before = everything();
          const refused = await correctWeek2(who, [{ uid: "dev", status }]);
          assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSAL_STANDS], `${who}: to ${status}`);
          assert.equal(everything(), before, `${who}: the refused correction to ${status} wrote something`);
        }
      } else {
        // An admin's move decides the line: no marker is left, and their absent is written.
        assert.equal(world.db.read(W2).excusalKept?.dev, undefined, "an admin's move left a marker");
        const written = await correctWeek2(who, [{ uid: "dev", status: "absent" }]);
        assert.equal(written.status, 200, JSON.stringify(written.body));
        assert.deepEqual([world.db.read(W2).records.dev, world.db.read(W2).excusalKept?.dev], ["absent", undefined]);
      }
    }
  });

  test("a session called off names every line it puts back to excused, with what it said, in the panel's preview, the column sheet's, and the history row", async () => {
    const press = (who, body) =>
      call(who, sessionChange.POST, { groupId: B }, { body: { week: 1, dateKey: "2026-11-03", reason: "The room flooded.", tell: false, ...body }, course: true });
    /** An admin excused Dev; the facilitator recorded that Dev came after all, and Amara came. */
    assert.equal((await mark("zach", [{ uid: "dev", status: "excused" }])).status, 200);
    assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }, { uid: "amara", status: "present" }])).status, 200);
    assert.ok(stored().excusalKept?.dev, "the facilitator's came mark kept no marker");
    // The group page's panel: Amara's line is cleared and Dev's goes back to excused, each named with what it said.
    const preview = await press("rahul", { kind: "cancel", preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const facts = preview.body.preview?.didNotHappen ?? preview.body.didNotHappen ?? preview.body.preview;
    const lines = pageWords.didNotHappenLines(facts, 1, "cancel");
    const said = lines.find((row) => row.label === "Register")?.text ?? "";
    assert.match(said, /^1 line set for it is cleared: Amara [^(]*\(present\)\. Dev [^(]*\(present\) goes back to excused\. /, said);
    // Only Dev's line goes back: nothing set for it is cleared, and it is still named.
    const onlyBack = pageWords.didNotHappenLines({ ...facts, lines: { ...facts.lines, cleared: 0, said: {} } }, 1, "cancel");
    assert.match(onlyBack.find((row) => row.label === "Register")?.text ?? "", /^Nothing set for it is cleared\. Dev [^(]*\(present\) goes back to excused\. /);
    // The history row: Dev named as put back, with what the line said, in the sentence and in `before`.
    const cancelled = await press("rahul", { kind: "cancel" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    const [row] = auditRows("session-did-not-happen");
    assert.ok(row, "no history row for the session called off");
    assert.match(row.detail, /Cleared 1 line of its register: Amara[^.,]* Present\. Put back to excused: Dev[^.,]* Present\./, row.detail);
    assert.deepEqual([row.before.amara, row.before.dev], ["Present", "Present"], "the row's before lost a line it changed");
    assert.equal(stored().records.dev, "excused");

    // The same register finished, called off from the column sheet: its preview names Dev's line, and so does its row.
    await told();
    assert.equal((await mark("zach", [{ uid: "dev", status: "excused" }])).status, 200);
    assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }, { uid: "amara", status: "present" }])).status, 200);
    assert.equal((await finish("rahul")).status, 200);
    const column = (body) =>
      call("claudia", columnRoute.POST, { groupId: B }, { body: { weekNumber: 1, kind: "did-not-happen", pace: "keep", dateKey: "2026-11-03", ...body }, course: true });
    const sheet = await column({ preview: true });
    assert.equal(sheet.status, 200, JSON.stringify(sheet.body));
    assert.deepEqual(
      [sheet.body.preview.clearing.map((each) => [each.uid, each.line]), sheet.body.preview.puttingBack.map((each) => [each.uid, each.line])],
      [[["amara", "In the room"]], [["dev", "In the room"]]],
    );
    assert.match(
      correctionWords.didNotHappenPreviewLines(sheet.body.preview).find((each) => each.label === "Register")?.text ?? "",
      /^1 line cleared: Amara \(in the room\)\. Dev \(in the room\) goes back to excused\. /,
    );
    const off = await column({ tell: false, reason: "Only two people came." });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const [fromColumn] = auditRows("session-did-not-happen");
    assert.match(fromColumn.detail, /Put back to excused: Dev[^.,]* Present\./, fromColumn.detail);
    assert.equal(fromColumn.before.dev, "Present");
    assert.equal(stored().records.dev, "excused");
  });

  test("the column sheet's It didn't happen names a line it puts back to excused as it names a cleared one", () => {
    const preview = {
      weekNumber: 1,
      pace: "keep",
      clearing: [{ uid: "amara", name: "Amara Okafor", line: "In the room" }],
      puttingBack: [{ uid: "dev", name: "Dev Shah", line: "Online" }],
    };
    const text = (each) => correctionWords.didNotHappenPreviewLines(each).find((row) => row.label === "Register")?.text;
    assert.equal(text(preview), "1 line cleared: Amara (in the room). Dev (online) goes back to excused. The group’s history keeps what each said.");
    assert.equal(text({ ...preview, clearing: [] }), "Nothing set for it is cleared. Dev (online) goes back to excused. The group’s history keeps what each said.");
    assert.equal(
      text({ ...preview, puttingBack: [...preview.puttingBack, { uid: "tariq", name: "Tariq Aziz", line: "In the room" }] }),
      "1 line cleared: Amara (in the room). Dev (online) and Tariq (in the room) go back to excused. The group’s history keeps what each said.",
    );
    assert.equal(text({ ...preview, clearing: [], puttingBack: [] }), "Nothing was set on its register, so nothing is cleared.");
  });

  test("a session called off keeps every excusal that stands, and brought back, absent is still refused: after the facilitator's own Move it to when it met, and in a track lead's It did happen", async () => {
    const press = (who, body) =>
      call(who, sessionChange.POST, { groupId: B }, { body: { week: 1, dateKey: "2026-11-03", reason: "The room flooded.", tell: false, ...body }, course: true });
    /** An admin excused Amara and Dev by hand; the facilitator recorded that Amara came after all, and so took the register. */
    const takenWithExcusals = async () => {
      await told();
      assert.equal((await mark("zach", [{ uid: "amara", status: "excused" }, { uid: "dev", status: "excused" }])).status, 200);
      const byZach = stored().setBy.amara;
      assert.equal((await mark("rahul", [{ uid: "amara", status: "present" }])).status, 200);
      assert.equal(attendanceLib.registerIsTaken(stored()), true);
      const cancelled = await press("rahul", { kind: "cancel" });
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      const doc = stored();
      assert.deepEqual(doc.records, { amara: "excused", dev: "excused" }, "calling the session off cleared an excusal");
      assert.deepEqual([doc.setBy.amara.byUid, doc.setBy.amara.how], [byZach.byUid, byZach.how], "Amara's line went back without the stamp it had");
      assert.equal(doc.setBy.dev.byUid, "zach");
      assert.deepEqual(doc.excusalKept ?? {}, {}, "a marker was left half there");
      assert.equal(doc.online?.amara, undefined, "where Amara was is left beside an excused line");
    };

    // The facilitator brings it back ("Move it to when it met"), and is refused absent on both.
    await takenWithExcusals();
    const back = await press("rahul", { kind: "move", metAtAnotherTime: true, move: { dateKey: "2026-11-03", time: "6pm", room: "Hallward B12" } });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    for (const uid of ["amara", "dev"]) {
      const refused = await mark("rahul", [{ uid, status: "absent" }]);
      assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSAL_STANDS], uid);
    }

    // A track lead says it did happen: absent over an excusal is refused, the excusal kept is written.
    await takenWithExcusals();
    at("2026-11-03T20:30:00Z");
    const happened = (lines) =>
      call("yusuf", columnRoute.POST, { groupId: B }, { body: { weekNumber: 1, kind: "did-happen", reason: "It went ahead in another room.", lines }, course: true });
    const before = everything();
    const refused = await happened([{ uid: "amara", status: "present" }, { uid: "dev", status: "absent" }]);
    assert.deepEqual([refused.status, refused.body.error], [403, marking.EXCUSAL_STANDS]);
    assert.equal(everything(), before, "the track lead's refused It did happen wrote something");
    const written = await happened([{ uid: "amara", status: "present" }, { uid: "dev", status: "excused" }]);
    assert.equal(written.status, 200, JSON.stringify(written.body));
    assert.deepEqual([stored().records.amara, stored().records.dev], ["present", "excused"]);
    assert.ok(stored().excusalKept?.amara, "the track lead recorded Amara came over an excusal, and the register no longer keeps that it stood");
  });

  test("putting a line back gives it back its approval's stamp, and the person's own three ways of taking a word back still leave it alone", async () => {
    const asked = new Date("2026-11-01T09:00:00Z");
    at("2026-11-02T12:00:00Z");
    excuseRequest("dev", "approved");
    lay({ "records.dev": "excused", "excusedInAdvance.dev": asked, "setBy.dev": { byUid: "zach", at: asked, how: "approval" } });
    assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }])).status, 200);
    assert.equal(stored().setBy.dev.how, "facilitator");
    assert.equal((await mark("rahul", [{ uid: "dev", status: "excused" }])).status, 200);
    assert.deepEqual([stored().setBy.dev.byUid, stored().setBy.dev.how], ["zach", "approval"], "putting the line back lost the approval's stamp");
    assert.deepEqual(stored().excusedInAdvance.dev, asked);
    // "I can make it after all", from an old page: refused, and the line stays.
    const takenBack = await call("dev", cantMakeItRoute.POST, { groupId: B }, { body: { sessionKey: "w01", cantMakeIt: false }, course: true });
    assert.deepEqual([takenBack.status, takenBack.body.error], [409, cantMakeItWords.CANT_MAKE_IT_REFUSAL.approved]);
    assert.equal(stored().records.dev, "excused");
    // Unticking "Most weeks, not all" and a new regular time take a word back only through the one write, which leaves this line.
    const writes = [];
    const tx = { set: (...args) => writes.push(args) };
    assert.equal(cantMakeItSeat.writeTakenBack(tx, { data: stored(), ref: {} }, "dev"), false);
    assert.deepEqual(writes, [], "the take-back wrote over a line an admin approved");
    for (const file of ["lib/courses/timeAnswer/seat.ts", "lib/courses/regularTime/apply.ts"]) {
      const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "src", file), "utf8");
      assert.match(source, /writeTakenBack\(tx, /, `${file} takes a word back another way`);
      assert.doesNotMatch(source, /records: \{ \[/, `${file} writes a register line of its own`);
    }
  });

  test("a sheet that corrects a finished register offers a track lead only what the route takes, and It did happen fills Excused where an excusal stands", () => {
    const keys = (choices) => choices.map((choice) => choice.key);
    const all = correctionWords.LINE_CHOICES;
    // An admin and the programme's lead: every line, wherever an excusal stands.
    assert.deepEqual(keys(correctionWords.choicesFor(all, { marksExcused: true, excusalStands: true, restores: false })), keys(all));
    // A track lead correcting a line: never Excused, and no Absent where an excusal stands.
    assert.deepEqual(keys(correctionWords.choicesFor(all, { marksExcused: false, excusalStands: false, restores: false })), keys(all).filter((key) => key !== "excused"));
    assert.deepEqual(
      keys(correctionWords.choicesFor(all, { marksExcused: false, excusalStands: true, restores: false })),
      keys(all).filter((key) => key !== "excused" && key !== "absent"),
    );
    // It did happen restates every line: Excused where an excusal stands, Absent where none does.
    const happen = correctionWords.DID_HAPPEN_CHOICES;
    assert.deepEqual(keys(correctionWords.choicesFor(happen, { marksExcused: false, excusalStands: true, restores: true })), ["present", "present-online", "excused"]);
    assert.deepEqual(keys(correctionWords.choicesFor(happen, { marksExcused: false, excusalStands: false, restores: true })), ["present", "present-online", "absent"]);
    assert.equal(correctionWords.didHappenFill(true), "excused");
    assert.equal(correctionWords.didHappenFill(false), "absent");
    // The two sheets ask these, and the grid hands them who the reader is and where an excusal stands.
    const read_ = (path) => readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "src", path), "utf8");
    assert.match(read_("features/courses/registerCorrection/ColumnSheet.tsx"), /P\.didHappenFill\(excusalStands\.includes\(each\.uid\)\)/);
    assert.match(read_("features/courses/registerCorrection/ColumnSheet.tsx"), /P\.choicesFor\(P\.didHappenChoicesFor\(each\.line\), \{/);
    assert.match(read_("features/courses/registerCorrection/LineSheet.tsx"), /mode === "correct" \? P\.choicesFor\(others, \{ marksExcused, excusalStands, restores: false \}\) : others/);
    const grid = read_("features/courses/AttendanceGrid.tsx");
    assert.equal((grid.match(/marksExcused=\{marksExcused\}/g) ?? []).length, 2, "a sheet is not told who the reader is");
  });

  test("the register's read says who decides excusals and where one stands, rows only, and nothing of who decided", async () => {
    assert.equal((await take("claudia", { person: "tom" })).status, 200);
    const said = {};
    for (const who of ["zach", "claudia", "yusuf", "rahul", "sofia", "tom"]) said[who] = (await read(who)).body.caller.marksExcused;
    leadFacilitates();
    said["claudia, facilitating"] = (await read("claudia")).body.caller.marksExcused;
    assert.deepEqual(said, { zach: true, claudia: true, yusuf: false, rahul: false, sofia: false, tom: false, "claudia, facilitating": true });

    await told();
    excuseRequest("amara", "approved");
    assert.equal((await mark("zach", [{ uid: "dev", status: "excused" }])).status, 200);
    const first = (await read("rahul")).body.excusalStands;
    assert.deepEqual(first, { w01: ["amara", "dev"] });
    assert.doesNotMatch(JSON.stringify(first), /zach|approv|decid/, "who decided reached the register's read");
    assert.equal((await mark("rahul", [{ uid: "dev", status: "present" }])).status, 200);
    assert.deepEqual((await read("rahul")).body.excusalStands, { w01: ["amara", "dev"] }, "Dev came, over an excused line");
    assert.equal((await mark("zach", [{ uid: "dev", status: "absent" }])).status, 200);
    assert.deepEqual((await read("rahul")).body.excusalStands, { w01: ["amara"] }, "an admin decided Dev's line");
  });

  test("a register with no marker reads as before; a marker is the stamp it displaced, or true from before", () => {
    assert.deepEqual(attendanceLib.normalizeCourseAttendance("x", { records: { amara: "present" } }).excusalKept, {});
    assert.deepEqual(attendanceLib.normalizeCourseAttendance("x", { excusalKept: { amara: true, dev: "yes", tariq: 1 } }).excusalKept, { amara: true });
    assert.deepEqual(attendanceLib.normalizeCourseAttendance("x", { excusalKept: "garbled" }).excusalKept, {});
    const at = new Date("2026-11-01T09:00:00Z");
    assert.deepEqual(
      attendanceLib.normalizeCourseAttendance("x", {
        excusalKept: { amara: { byUid: "zach", at, how: "approval" }, dev: { byUid: "zach", at, how: "sideways" }, tariq: { at, how: "cover" } },
      }).excusalKept,
      { amara: { byUid: "zach", at, how: "approval" } },
      "a stamp that would not read as a line's stamp is no marker",
    );
  });

  test("the register's cycle on each kind of cell, and the words that list it", () => {
    const taps = (cell, from = null) => {
      const seen = [];
      let at = from;
      for (let i = 0; i < 6; i += 1) seen.push((at = marking.nextMark(at, cell)));
      return seen;
    };
    // An admin and the programme's lead: every mark, then back to not marked.
    assert.equal(marking.cellMarks(true, true), "every");
    assert.equal(marking.cellMarks(true, false), "every");
    assert.deepEqual(taps("every"), ["present", "late", "left-early", "absent", "excused", null]);
    // Anybody else, where no excusal stands: no Excused. An excused line they tap says the person came.
    assert.equal(marking.cellMarks(false, false), "no-excused");
    assert.deepEqual(taps("no-excused"), ["present", "late", "left-early", "absent", null, "present"]);
    assert.equal(marking.nextMark("excused", "no-excused"), "present");
    // Anybody else, where an excusal stands: excused and the marks that say the person came, never absent or not marked.
    assert.equal(marking.cellMarks(false, true), "excusal-stands");
    assert.deepEqual(taps("excusal-stands", "excused"), ["present", "late", "left-early", "excused", "present", "late"]);
    assert.equal(marking.nextMark("absent", "excusal-stands"), "excused");
    assert.equal(marking.nextMark(null, "excusal-stands"), "excused");
    assert.equal(marking.cycleWords(true), "present, late, left early, absent, excused and back to not marked");
    assert.equal(
      marking.cycleWords(false),
      "present, late, left early, absent and back to not marked; a cell where somebody is excused, through excused, present, late and left early",
    );
    assert.equal(marking.EXCUSED_WHO_CAN, "Only an admin or the programme’s lead can excuse somebody, or take an excusal away. People ask on their programme page.");
    assert.equal(marking.EXCUSAL_STANDS, "Only an admin or the programme’s lead can change an excused line to absent or not marked.");
    // The grid asks these, per cell, from the reader's answer and the cell's excusal.
    const grid = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "src", "features", "courses", "AttendanceGrid.tsx"), "utf8");
    assert.match(grid, /cellMarks\(marksExcused, excusalStands\[sessionKey\]\?\.includes\(uid\) \?\? false\)/);
    assert.equal((grid.match(/nextMark\([a-z]+, marksOn\(session\.sessionKey, member\.uid\)\)/g) ?? []).length, 2, "a tap and its label ask different cycles");
  });
});
