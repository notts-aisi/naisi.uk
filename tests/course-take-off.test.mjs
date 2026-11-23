/**
 * TAKING SOMEBODY OFF A RUN ASKS FIRST, AND EMAILS THEM AND THE FACILITATORS
 * OF THE GROUP THEY HAD BEEN TOLD.
 *
 *   POST /api/courses/runs/[runId]/enrolments/[uid]/remove
 *
 * `preview: true` answers every sentence the sheet prints and the count of
 * emails a press sends; the press sends the count back with an optional line
 * for the person, and the transaction works it out again. After the commit:
 * the person's email ("Your place on AGI Strategy has ended"), one to each of
 * their group's facilitators when Publish had told them their group ("Chloe
 * has left Group B"), and each visit's host's facilitators as before. The
 * line goes to the person alone: no other email, no stored document, no log
 * line and no History line carries it.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`),
 * Tue 17 Nov at noon: Group B (Rahul and Sofia) meets tonight at 6pm, Group
 * A (Sofia) met on Thursday, Group C (Tom) meets tomorrow at 1pm. Chloe
 * (Group B) applied to the run itself; Amara (Group A) holds a place
 * through the form; Una (Group C) is placed and not told; Sam left by
 * their own act; Omar was taken off before. Zach is an admin, Claudia leads the
 * programme, Yusuf is the run's track lead.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { CAST } from "./lib/applicationsSmallTerm.mjs";
import { register as registerOf } from "./lib/hubAttendanceWorld.mjs";
import { AGI, B, C, NOW, OPEN_RUN, PEOPLE, ROUND, RUN, makeLeavingWorld, registerPath, textOf } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__takeOff");
const { world, call } = w;
const removeRoute = await w.courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove");
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const words = await w.loadTs("lib/courses/takeOff/words.ts");
const audit = await w.loadTs("lib/firestore/courseAudit.ts");
const handoverLoad = await w.loadTs("lib/applications/handover/load.ts");
const decideRoute = await w.courseRoute("runs", "[runId]", "applications", "[uid]", "decide");
const careful = await w.loadTs("lib/courses/runCareful/words.ts");

const read = (path) => world.db.read(path);
/** The foot every email of the site carries. */
const FOOTER = " Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";
const seatPath = (uid, runId = RUN.agi) => `courseEnrolments/${runId}__${uid}`;
const ask = (who, uid, options = {}) =>
  call(who, removeRoute.POST, { runId: options.runId ?? RUN.agi, uid }, { body: { preview: true }, course: true, viewAs: options.viewAs ?? false });
const press = (who, uid, body, options = {}) =>
  call(who, removeRoute.POST, { runId: options.runId ?? RUN.agi, uid }, { ...(body === undefined ? {} : { body }), course: true, viewAs: options.viewAs ?? false });
const historyRows = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map(read)
    .filter((row) => row.kind === "member-taken-off");

/** An email as its reader reads it, from its heading on. */
async function emailText(sent) {
  const said = textOf(await render(sent.react));
  return said.slice(said.indexOf(sent.subject, 1));
}

/** A visit arranged by an admin the way the person's page arranges one. */
async function arrange(uid, weekNumber, hostGroupId) {
  const visit = (body) => call("zach", visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
  const shown = await visit({ weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit({ weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. The plain case, word for word
// ---------------------------------------------------------------------------

describe("1. Chloe, told Group B, taken off by an admin", () => {
  test("the question says everything the press will do", async () => {
    const shown = await ask("zach", "chloe");
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.deepEqual(shown.body.preview, {
      emails: 3,
      visits: [],
      sheet: {
        title: "Take Chloe Nguyen off AGI Strategy?",
        seat: "Their seat in Group B is freed. Their registers and work so far are kept.",
        emailed: "Chloe is emailed to say their place has ended. Rahul and Sofia, Group B’s facilitators, are emailed to say Chloe has left the group.",
        box: { label: "A line for Chloe (optional)", hint: "Only Chloe sees this. The facilitators’ email never carries a reason." },
        keep: "Keep Chloe",
        go: "Take Chloe off and email 3 people",
      },
      limit: null,
    });
    // The question writes nothing and sends nothing.
    assert.equal(read(seatPath("chloe")).status, "active");
    assert.equal(world.mail.length, 0);
  });

  test("the press: Chloe is off, the three emails word for word, the History line, who and when on the seat", async () => {
    const line = "We tried to reach you about the times twice.";
    const done = await press("zach", "chloe", { emails: 3, line });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual(done.body, { ok: true, emails: { sent: 3, suppressed: 0, failed: 0 }, said: "Chloe is off AGI Strategy. 3 people were emailed." });

    const seat = read(seatPath("chloe"));
    assert.deepEqual([seat.status, seat.groupId, seat.removedByUid], ["removed", null, "zach"]);
    assert.equal(new Date(seat.droppedOutAt).getTime(), NOW.getTime());

    assert.deepEqual(
      world.mail.map((sent) => [sent.to, sent.subject, sent.kind]),
      [
        ["chloe@example.com", "Your place on AGI Strategy has ended", "course-taken-off"],
        ["rahul@example.com", "Chloe has left Group B", "course-taken-off"],
        ["sofia@example.com", "Chloe has left Group B", "course-taken-off"],
      ],
    );
    assert.equal(
      await emailText(world.mail[0]),
      "Your place on AGI Strategy has ended " +
        "Hi Chloe, your place on AGI Strategy (Autumn 2026) has ended, and you’re no longer in Group B. " +
        `${line} ` +
        "Your work so far stays on your account. If you think this is a mistake, or you’d like to talk about it, reply to this email and it reaches the NAISI team." +
        FOOTER,
    );
    assert.equal(
      await emailText(world.mail[1]),
      "Chloe has left Group B " +
        "Hi Rahul, Chloe is no longer in Group B on AGI Strategy. They come off your register from week 3. You don’t need to do anything. Questions? Reply to this email and it reaches the NAISI team." +
        FOOTER,
    );
    // No email sets its own reply address: replies go to the site's own.
    for (const sent of world.mail) assert.equal(sent.replyTo, undefined);
    // Every email names the actor and the run in the log.
    for (const sent of world.mail) assert.deepEqual([sent.actorUid, sent.referenceId], ["zach", RUN.agi]);

    const rows = historyRows();
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].groupId, rows[0].subjectUid, rows[0].actorUid, rows[0].detail, rows[0].emailed],
      [B, "chloe", "zach", `${CAST.zach.displayName} took ${PEOPLE.chloe[0]} off the run.`, 3],
    );
    assert.equal(audit.courseAuditCategory("member-taken-off"), "people");
    assert.equal(audit.courseAuditKindLabel("member-taken-off"), "Taken off the run");
  });

  test("the line goes to the person alone: no other email, no document, no History line and no log line carries it", async () => {
    const line = "Sorry this one did not work out, Chloe.";
    const logged = [];
    const restore = ["log", "info", "warn", "error"].map((name) => {
      const original = console[name];
      console[name] = (...args) => logged.push(args.map(String).join(" "));
      return () => {
        console[name] = original;
      };
    });
    let done;
    try {
      done = await press("claudia", "chloe", { emails: 3, line });
    } finally {
      for (const undo of restore) undo();
    }
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const texts = await Promise.all(world.mail.map(emailText));
    assert.ok(texts[0].includes(line), "the person's email carries the line");
    for (const text of texts.slice(1)) assert.ok(!text.includes(line), "a facilitator's email carries the line");
    for (const sent of world.mail) assert.ok(!sent.subject.includes(line));
    assert.ok(!JSON.stringify(w.everything()).includes(line), "a stored document carries the line");
    assert.ok(!logged.some((each) => each.includes(line)), "a log line carries the line");
    assert.ok(!JSON.stringify(done.body).includes(line), "the answer carries the line");
  });

  test("a second press writes nothing and emails nobody", async () => {
    assert.equal((await press("zach", "chloe", { emails: 3 })).status, 200);
    world.mail.length = 0;
    const before = w.everything();
    const again = await press("zach", "chloe", { emails: 3 });
    assert.deepEqual([again.status, again.body.said], [200, "They’re already off the run. Nobody was emailed."]);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
    // And the question, once they are off, says so.
    assert.deepEqual([(await ask("zach", "chloe")).status, (await ask("zach", "chloe")).body.error], [409, "They’re already off the run."]);
  });
});

// ---------------------------------------------------------------------------
// 2. Every case of the sheet's sentences
// ---------------------------------------------------------------------------

describe("2. the sentences stay true in every case the route allows", () => {
  test("a place the form gave, given back: Amara, Group A, one facilitator", async () => {
    const shown = await ask("claudia", "amara");
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.equal(shown.body.preview.sheet.seat, "Their seat in Group A is freed and their place on AGI Strategy is given back. Their registers and work so far are kept.");
    assert.equal(shown.body.preview.sheet.emailed, "Amara is emailed to say their place has ended. Sofia, Group A’s facilitator, is emailed to say Amara has left the group.");
    assert.equal(shown.body.preview.sheet.go, "Take Amara off and email 2 people");
    const done = await press("claudia", "amara", { emails: 2 });
    assert.equal(done.body.said, "Amara is off AGI Strategy. 2 people were emailed.");
    // Group A met on Thursday: its next session is week 4's.
    assert.match(await emailText(world.mail[1]), /They come off your register from week 4\./);
  });

  test("not told their group yet: Una is emailed, nobody else, and the email names no group", async () => {
    const shown = await ask("zach", "una");
    assert.equal(shown.body.preview.sheet.seat, "Their seat in Group C is freed. Their registers and work so far are kept.");
    assert.equal(shown.body.preview.sheet.emailed, "Una is emailed to say their place has ended.");
    assert.equal(shown.body.preview.sheet.go, "Take Una off and email Una");
    // No facilitator is emailed, so the hint says nothing of their email.
    assert.deepEqual(shown.body.preview.sheet.box, { label: "A line for Una (optional)", hint: "Only Una sees this." });
    assert.equal(shown.body.preview.emails, 1);
    const done = await press("zach", "una", { emails: 1 });
    assert.equal(done.body.said, "Una is off AGI Strategy. Una was emailed.");
    assert.deepEqual(world.mail.map((sent) => sent.to), ["una@example.com"]);
    const text = await emailText(world.mail[0]);
    assert.ok(text.includes("Hi Una, your place on AGI Strategy (Autumn 2026) has ended. "), text);
    assert.ok(!text.includes("Group C"), text);
  });

  test("no group yet: the seat's part goes", async () => {
    world.db.poke(seatPath("chloe"), { groupId: null });
    const shown = await ask("zach", "chloe");
    assert.equal(shown.body.preview.sheet.seat, "Their registers and work so far are kept.");
    assert.equal(shown.body.preview.sheet.emailed, "Chloe is emailed to say their place has ended.");
    await press("zach", "chloe", { emails: shown.body.preview.emails });
    assert.ok((await emailText(world.mail[0])).includes("has ended. "));
    assert.equal(historyRows().length, 0, "a seat in no group writes no group's History");
  });

  test("a group with no facilitator: the facilitators' sentence goes and the count drops", async () => {
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: [] });
    const shown = await ask("zach", "chloe");
    assert.equal(shown.body.preview.sheet.emailed, "Chloe is emailed to say their place has ended.");
    assert.deepEqual([shown.body.preview.emails, shown.body.preview.sheet.go], [1, "Take Chloe off and email Chloe"]);
  });

  test("a facilitator who pressed is not emailed, and the sheet says how many of the group's are", async () => {
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "yusuf"] });
    world.db.poke(seatPath("chloe"), {});
    const shown = await ask("yusuf", "chloe");
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.equal(shown.body.preview.sheet.emailed, "Chloe is emailed to say their place has ended. Rahul and Sofia, two of Group B’s facilitators, are emailed to say Chloe has left the group.");
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "yusuf"] });
    assert.equal((await ask("yusuf", "chloe")).body.preview.sheet.emailed, "Chloe is emailed to say their place has ended. Rahul, one of Group B’s facilitators, is emailed to say Chloe has left the group.");
  });

  test("a run no programme names: the course's own name, as the page prints it", async () => {
    const shown = await ask("zach", "kai", { runId: OPEN_RUN });
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    const title = read(`courseRuns/${OPEN_RUN}`).courseTitle;
    assert.equal(shown.body.preview.sheet.title, `Take Kai Brennan off ${title}?`);
    assert.equal(shown.body.preview.sheet.emailed, `Kai is emailed to say their place has ended. Tom, Tuesday drop-in’s facilitator, is emailed to say Kai has left the group.`);
    const done = await press("zach", "kai", { emails: shown.body.preview.emails }, { runId: OPEN_RUN });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(world.mail[0].subject, `Your place on ${title} has ended`);
  });

  test("a visit still to come: its host's facilitators are counted and named, and sent the visit's own email", async () => {
    await arrange("chloe", 3, C);
    world.mail.length = 0;
    const shown = await ask("zach", "chloe");
    assert.equal(shown.body.preview.emails, 4);
    assert.deepEqual(shown.body.preview.visits, [{ hostName: "Group C", weekNumber: 3 }]);
    assert.equal(
      shown.body.preview.sheet.emailed,
      "Chloe is emailed to say their place has ended. Rahul and Sofia, Group B’s facilitators, are emailed to say Chloe has left the group. " +
        "Group C’s facilitator is emailed to say Chloe’s week 3 visit is off.",
    );
    assert.equal(shown.body.preview.sheet.go, "Take Chloe off and email 4 people");
    const done = await press("zach", "chloe", { emails: 4 });
    assert.equal(done.body.said, "Chloe is off AGI Strategy. 4 people were emailed.");
    assert.deepEqual(
      world.mail.map((sent) => [sent.to, sent.subject, sent.kind]),
      [
        ["chloe@example.com", "Your place on AGI Strategy has ended", "course-taken-off"],
        ["rahul@example.com", "Chloe has left Group B", "course-taken-off"],
        ["sofia@example.com", "Chloe has left Group B", "course-taken-off"],
        ["tom@example.com", "Chloe Nguyen’s visit to Group C for week 3 is off", "course-visit"],
      ],
    );
  });

  test("somebody who gave their place back on the form: no place goes back, and their email says as they asked", async () => {
    // Amara says "I can't make it" on the application page before Publish told Amara a group: the place on the
    // form goes back, and the seat stays where it was put.
    world.db.poke(seatPath("amara"), { allocatedEmailAt: null });
    const replied = await w.join.reply("amara", { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    assert.equal(replied.status, 200, JSON.stringify(replied.body));
    assert.equal(read(seatPath("amara")).status, "active");
    world.mail.length = 0;
    const shown = await ask("zach", "amara");
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.equal(shown.body.preview.sheet.seat, "Their seat in Group A is freed. Their registers and work so far are kept.");
    assert.equal(shown.body.preview.sheet.emailed, "Amara is emailed to say their place has ended.");
    await press("zach", "amara", { emails: shown.body.preview.emails });
    assert.ok((await emailText(world.mail[0])).includes("Hi Amara, your place on AGI Strategy (Autumn 2026) has ended, as you asked. "));
  });
});

// ---------------------------------------------------------------------------
// 3. "From week 3": the register at each moment
// ---------------------------------------------------------------------------

describe("3. which week they come off the register from", () => {
  const facilitatorLine = async () => {
    const shown = await ask("zach", "chloe");
    await press("zach", "chloe", { emails: shown.body.preview.emails });
    return emailText(world.mail.find((sent) => sent.to === "rahul@example.com"));
  };

  test("on the day of a session, before it starts: that session's week", async () => {
    assert.match(await facilitatorLine(), /from week 3\./);
  });

  // A person taken off stops being a row of every register at once, so the
  // week is the first session whose register holds no saved mark for them.
  test("while tonight's session is under way: this week, whose register no longer lists them", async () => {
    mock.timers.setTime(new Date("2026-11-17T18:30:00Z").getTime());
    assert.match(await facilitatorLine(), /from week 3\./);
  });

  test("the morning after, with last night's register not saved yet: still that week", async () => {
    mock.timers.setTime(new Date("2026-11-18T09:00:00Z").getTime());
    assert.match(await facilitatorLine(), /from week 3\./);
  });

  test("once that register is saved with a mark for them: the next week", async () => {
    mock.timers.setTime(new Date("2026-11-19T09:00:00Z").getTime());
    world.db.seed(registerPath(B, 3), registerOf(B, 3, { chloe: "present", farah: "present", kofi: "present" }));
    assert.match(await facilitatorLine(), /from week 4\./);
  });

  test("a register saved without them, or one that says the session was not held, is passed over as it should be", async () => {
    mock.timers.setTime(new Date("2026-11-19T09:00:00Z").getTime());
    world.db.seed(registerPath(B, 3), registerOf(B, 3, { farah: "present" }, { held: false }));
    assert.match(await facilitatorLine(), /from week 4\./);
  });

  test("after the group's last session, every register saved with a mark for them: the register's sentence goes, and no place goes back", async () => {
    mock.timers.setTime(new Date("2026-12-20T12:00:00Z").getTime());
    for (const week of [3, 4, 5, 6]) world.db.seed(registerPath(B, week), registerOf(B, week, { chloe: "present" }));
    const shown = await ask("claudia", "amara");
    assert.equal(shown.body.preview.sheet.seat, "Their seat in Group A is freed. Their registers and work so far are kept.");
    const text = await facilitatorLine();
    assert.ok(!text.includes("register"), text);
    assert.ok(text.includes("Hi Rahul, Chloe is no longer in Group B on AGI Strategy. You don’t need to do anything."), text);
  });

  test("after the group's last session with a register still not saved: that register's week", async () => {
    mock.timers.setTime(new Date("2026-12-20T12:00:00Z").getTime());
    for (const week of [3, 4, 5]) world.db.seed(registerPath(B, week), registerOf(B, week, { chloe: "present" }));
    assert.match(await facilitatorLine(), /from week 6\./);
  });
});

// ---------------------------------------------------------------------------
// 4. The count, the limits and the line, checked again at the press
// ---------------------------------------------------------------------------

describe("4. the press is held to what the question said", () => {
  test("a press that sends no count, or another count, is refused with the count as it is now, and nothing is written", async () => {
    const before = w.everything();
    for (const body of [undefined, {}, { emails: 0 }, { emails: 2 }]) {
      const refused = await press("zach", "chloe", body);
      assert.deepEqual([refused.status, refused.body.emails], [409, 3], JSON.stringify(body));
      assert.equal(refused.body.error, "Taking them off now emails 3 people, so nothing was changed. Check it, then press again.");
    }
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a facilitator added between the question and the press: 409 with the new count", async () => {
    const shown = await ask("zach", "chloe");
    assert.equal(shown.body.preview.emails, 3);
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "tom"] });
    const before = w.everything();
    const refused = await press("zach", "chloe", { emails: 3 });
    assert.deepEqual([refused.status, refused.body.emails], [409, 4]);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
    const again = await ask("zach", "chloe");
    assert.equal(again.body.preview.sheet.emailed, "Chloe is emailed to say their place has ended. Rahul, Sofia and Tom, Group B’s facilitators, are emailed to say Chloe has left the group.");
  });

  test("at the limit: the question says so, and the press is refused with nothing written and nobody emailed", async () => {
    world.db.seed(`courseNudges/emailrate__takenoff__${RUN.agi}__chloe`, { kind: "staff-email-throttle", key: `takenoff__${RUN.agi}__chloe`, windowStartAt: new Date(), count: 4, updatedAt: new Date() });
    const said = "Chloe has been taken off this run 4 times in the last day, so nothing was changed and nobody was emailed. Try again tomorrow, or ask an admin.";
    assert.equal((await ask("zach", "chloe")).body.preview.limit, said);
    const before = w.everything();
    const refused = await press("zach", "chloe", { emails: 3 });
    assert.deepEqual([refused.status, refused.body.error], [429, said]);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a press that emails claims the person's and the presser's counters, in the removal's own write", async () => {
    await press("zach", "chloe", { emails: 3 });
    assert.equal(read(`courseNudges/emailrate__takenoff__${RUN.agi}__chloe`).count, 1);
    assert.equal(read("courseNudges/emailrate__takeoffpresser__zach").count, 1);
  });

  test("a line that is not one line of text, carries a link or runs long is refused before anything is read", async () => {
    const before = w.everything();
    for (const [line, error] of [
      [7, "The line must be text."],
      ["First line\nsecond line", "The line must be one line."],
      ["See naisi.uk/links for the next one", "Leave links out of the line."],
      ["x".repeat(301), "The line must be 300 characters or fewer."],
    ]) {
      const refused = await press("zach", "chloe", { emails: 3, line });
      assert.deepEqual([refused.status, refused.body.error], [400, error], String(line));
    }
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
    assert.deepEqual(words.parseTakeOffLine("  "), { ok: true, value: "" });
  });

  test("every line break a mail client may break at is refused, and a body with a field the sheet does not send", async () => {
    const before = w.everything();
    for (const mark of ["\u2028", "\u2029", "\u0085", "\v", "\f"]) {
      const refused = await press("zach", "chloe", { emails: 3, line: `First${mark}second` });
      assert.deepEqual([refused.status, refused.body.error], [400, "The line must be one line."], JSON.stringify(mark));
    }
    for (const body of [{ preview: true, to: "someone@example.com" }, { emails: 3, reason: "No show." }]) {
      const refused = await press("zach", "chloe", body);
      assert.deepEqual([refused.status, refused.body.error], [400, "Expected no body, or a JSON object."], JSON.stringify(body));
    }
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a seat recorded as finished is refused, by the question and the press, writing nothing", async () => {
    world.db.poke(seatPath("chloe"), { status: "completed" });
    const before = w.everything();
    const said = "They finished the programme, so they can’t be taken off it.";
    assert.deepEqual([(await ask("zach", "chloe")).status, (await ask("zach", "chloe")).body.error], [409, said]);
    assert.deepEqual([(await press("zach", "chloe", { emails: 3 })).status, (await press("zach", "chloe", { emails: 3 })).body.error], [409, said]);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a failed send never undoes the removal, and the answer says how many went", async () => {
    world.mailFate = (args) => (args.to === "sofia@example.com" ? "fail" : "sent");
    const done = await press("zach", "chloe", { emails: 3 });
    assert.equal(done.status, 200);
    assert.equal(done.body.said, "Chloe is off AGI Strategy. 2 of 3 emails were sent.");
    assert.equal(read(seatPath("chloe")).status, "removed");
  });
});

// ---------------------------------------------------------------------------
// 5. Who may ask, and who may press
// ---------------------------------------------------------------------------

describe("5. every kind of caller, the question and the press", () => {
  test("signed out, a member, the person themselves and a facilitator of the group: refused, writing nothing", async () => {
    const before = w.everything();
    for (const [who, status] of [
      [null, 401],
      ["nobody", 403],
      ["chloe", 403],
      ["rahul", 403],
    ]) {
      assert.equal((await ask(who, "chloe")).status, status, `${who} asking`);
      assert.equal((await press(who, "chloe", { emails: 3 })).status, status, `${who} pressing`);
    }
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a view-as session is refused before anything", async () => {
    const before = w.everything();
    assert.equal((await ask("zach", "chloe", { viewAs: true })).status, 403);
    assert.equal((await press("zach", "chloe", { emails: 3 }, { viewAs: true })).status, 403);
    assert.equal(w.everything(), before);
  });

  test("the run's track lead, the programme's lead and an admin are asked and pressed through", async () => {
    for (const who of ["yusuf", "claudia", "zach"]) {
      w.reset();
      const shown = await ask(who, "chloe");
      assert.equal(shown.status, 200, `${who}: ${JSON.stringify(shown.body)}`);
      const done = await press(who, "chloe", { emails: shown.body.preview.emails });
      assert.equal(done.status, 200, `${who}: ${JSON.stringify(done.body)}`);
      assert.equal(read(seatPath("chloe")).removedByUid, who);
    }
  });

  test("a run's track lead is answered about a person the form placed as about a uid with no place", async () => {
    for (const uid of ["amara", "nobody-at-all"]) {
      assert.deepEqual([(await ask("yusuf", uid)).status, (await ask("yusuf", uid)).body], [404, { error: "Enrolment not found" }], uid);
    }
  });

  test("somebody with no right gets the same answer for a run that exists and one that does not; an admin is told it is not found", async () => {
    for (const who of ["nobody", "chloe", "rahul"]) {
      const real = await ask(who, "chloe");
      const none = await ask(who, "chloe", { runId: "no-such-run" });
      assert.deepEqual([none.status, none.body], [real.status, real.body], who);
      assert.deepEqual([none.status, none.body], [403, { error: "Forbidden" }], who);
    }
    assert.deepEqual([(await ask("zach", "chloe", { runId: "no-such-run" })).status, (await ask("zach", "chloe", { runId: "no-such-run" })).body], [404, { error: "Run not found" }]);
  });

  test("somebody who left by themselves is refused by the question and the press alike, with the day they left", async () => {
    const said = "They left on Fri 6 Nov, so their seat is already free and there’s nothing to remove.";
    assert.deepEqual([(await ask("zach", "sam")).status, (await ask("zach", "sam")).body.error], [409, said]);
    assert.deepEqual([(await press("zach", "sam")).status, (await press("zach", "sam")).body.error], [409, said]);
    assert.equal(world.mail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. Course run's "Taken off the programme"
// ---------------------------------------------------------------------------

describe("6. Course run's list says who took them off and when", () => {
  test("Amara, taken off by the lead, is listed with who and the day", async () => {
    const shown = await ask("claudia", "amara");
    await press("claudia", "amara", { emails: shown.body.preview.emails });
    world.user = w.sessionOf("zach");
    const outcome = await handoverLoad.loadRunPanel(world.db, w.sessionOf("zach"), ROUND, AGI);
    assert.equal(outcome.status, "ok");
    const amara = outcome.panel.takenOff.find((person) => person.uid === "amara");
    assert.ok(amara, JSON.stringify(outcome.panel.takenOff));
    assert.equal(amara.note, "Taken off by Claudia Reyes on Tue 17 Nov");
    assert.equal(words.takenOffByWords(null, "Tue 17 Nov"), "Taken off on Tue 17 Nov");
    assert.equal(words.takenOffByWords(null, null), "");
  });

  test("the seat's who is read only off a seat that is removed", async () => {
    const enrolments = await w.loadTs("lib/firestore/courseEnrolments.ts");
    assert.equal(enrolments.normalizeCourseEnrolment("x", { status: "active", removedByUid: "zach" }).removedByUid, null);
    assert.equal(enrolments.normalizeCourseEnrolment("x", { status: "removed", removedByUid: "zach" }).removedByUid, "zach");
  });
});


// ---------------------------------------------------------------------------
// 7. Every caller of the route asks in the sheet
// ---------------------------------------------------------------------------

describe("7. every way of taking somebody off asks in the one sheet", () => {
  const SRC = new URL("../src/", import.meta.url);
  const files = [...walkSource(fileURLToPath(SRC))].map((file) => [relative(fileURLToPath(SRC), file).split(sep).join("/"), readFileSync(file, "utf8")]);

  test("the sheet is the only thing in the browser that presses the route, and both boards open it", () => {
    // Anywhere in src but the route itself: an address built in one template
    // (`/enrolments/${uid}/remove`), or a file that names both a course run's
    // address and the `/remove` that ends this one, however it joins them.
    const pressing = files
      .filter(([file]) => !file.startsWith("app/api/courses/runs/[runId]/enrolments/[uid]/remove/"))
      .filter(([, source]) => {
        const code = stripSource(source, { keepStrings: true });
        return /\/enrolments\/\$\{[^}]+\}(?:\/remove|`)/.test(code) || (/["'`][^"'`]*courses\/runs/.test(code) && /["'`/]\/?remove["'`]|\/remove\b/.test(code));
      })
      .map(([file]) => file);
    assert.deepEqual(pressing, ["features/courses/takeOff/TakeOffSheet.tsx"]);
    const opening = files.filter(([, code]) => /from "@\/features\/courses\/takeOff\/TakeOffSheet"/.test(code)).map(([file]) => file).sort();
    // Course run on a programme's Settings opens it too, for somebody who gave their place back.
    assert.deepEqual(opening, [
      "features/applications/editor/RunHandOver.tsx",
      "features/applications/groups/PeopleInGroups.tsx",
      "features/courses/AllocationBoard.tsx",
    ]);
    for (const [file, code] of files.filter(([file]) => opening.includes(file))) {
      assert.doesNotMatch(code, /window\.confirm\([^)]*(?:off this run|off the run|takeOff)/, `${file} still asks in the browser's own confirmation`);
      assert.match(code, /<TakeOffSheet runId=\{runId\} uid=\{\w+\}/, `${file} does not open the sheet`);
    }
    // Only Course run could close a row, and only through the one switch (off).
    for (const [file, code] of files.filter(([file]) => opening.includes(file))) {
      if (file === "features/applications/editor/RunHandOver.tsx") assert.match(code, /closeRow=\{COURSE_RUN_CLOSES_THE_ROW\}/, file);
      else assert.doesNotMatch(code, /closeRow/, `${file} closes a row`);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. From Course run: somebody who gave their place back, their row left
//    open; the route's closeRow, which Course run no longer sends, still
//    closes it in the same act
// ---------------------------------------------------------------------------

describe("8. Course run takes off somebody who gave their place back and leaves their row open; the route's closeRow closes it in the same act", () => {
  const rowPath = (uid) => `courseApplications/${RUN.agi}__${uid}`;
  const counts = () => read(`courseRuns/${RUN.agi}`).applicationCounts ?? {};
  const askRow = (who, uid, options = {}) =>
    call(who, removeRoute.POST, { runId: RUN.agi, uid }, { body: { preview: true, closeRow: true }, course: true, viewAs: options.viewAs ?? false });
  const pressRow = (who, uid, body, options = {}) =>
    call(who, removeRoute.POST, { runId: RUN.agi, uid }, { body: { ...body, closeRow: true }, course: true, viewAs: options.viewAs ?? false });
  const panel = async () => {
    const outcome = await handoverLoad.loadRunPanel(world.db, w.sessionOf("zach"), ROUND, AGI);
    assert.equal(outcome.status, "ok");
    return outcome.panel;
  };
  /** Amara says "I can't make it" before Publish told Amara a group: the place goes back on the form, the seat stays. */
  const giveBack = async (uid = "amara") => {
    world.db.poke(seatPath(uid), { allocatedEmailAt: null });
    const replied = await w.join.reply(uid, { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    assert.equal(replied.status, 200, JSON.stringify(replied.body));
    assert.equal(read(seatPath(uid)).status, "active");
    world.mail.length = 0;
  };

  test("the list names them with the day and the group they are still in, and offers the take-off", async () => {
    await giveBack();
    const amara = (await panel()).gaveBack.find((person) => person.uid === "amara");
    assert.ok(amara);
    assert.deepEqual([amara.line, amara.firstName, amara.canTakeOff], ["Gave their place back on Tue 17 Nov · still in Group A", "Amara", true]);
    assert.equal(careful.takeOffWords(amara.firstName), "Take Amara off the run…");
    // The note the list shows says only that the seat is freed: the row stays open.
    const options = await w.loadTs("lib/courses/runCareful/options.ts");
    assert.equal(
      careful.gaveBackNote(options.COURSE_RUN_CLOSES_THE_ROW),
      "They gave their place back after they were handed over. Take them off the run here: their seat is freed.",
    );
  });

  test("not told their group: the sheet as built, Amara alone emailed, the seat freed and the row closed and counted, together", async () => {
    await giveBack();
    const ordinary = await ask("zach", "amara");
    const shown = await askRow("zach", "amara");
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    // The question is the take-off sheet's, word for word, with one sentence
    // more: the row closes too, and nothing opens it again.
    const { closesRow, ...asked } = shown.body.preview;
    assert.deepEqual(asked, ordinary.body.preview);
    assert.equal(closesRow, "Their row on the run’s list is closed too, so they can’t be put back on this run afterwards.");
    assert.equal(closesRow, words.ROW_CLOSES_TOO);
    assert.equal("closesRow" in ordinary.body.preview, false);
    assert.equal(shown.body.preview.sheet.emailed, "Amara is emailed to say their place has ended.");
    assert.equal(shown.body.preview.emails, 1);
    const before = counts();
    assert.equal(read(rowPath("amara")).status, "accepted");

    const done = await pressRow("zach", "amara", { emails: 1 });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.said, "Amara is off AGI Strategy. Amara was emailed.");
    assert.equal(read(seatPath("amara")).status, "removed");
    assert.equal(read(rowPath("amara")).status, "withdrawn");
    assert.deepEqual(
      [counts().accepted, counts().withdrawn],
      [(before.accepted ?? 0) - 1, (before.withdrawn ?? 0) + 1],
    );
    assert.deepEqual(world.mail.map((sent) => [sent.to, sent.subject]), [["amara@example.com", "Your place on AGI Strategy has ended"]]);
    assert.ok((await emailText(world.mail[0])).includes("Hi Amara, your place on AGI Strategy (Autumn 2026) has ended, as you asked. "));

    // Off the list of people to act on, and on Taken off the programme with who and when.
    const after = await panel();
    assert.ok(!after.gaveBack.some((person) => person.uid === "amara"));
    assert.equal(after.takenOff.find((person) => person.uid === "amara")?.note, `Taken off by ${CAST.zach.displayName} on Tue 17 Nov`);
  });

  test("told their group: their group's facilitator is emailed too, exactly as the sheet says", async () => {
    await giveBack();
    world.db.poke(seatPath("amara"), { allocatedEmailAt: NOW });
    const shown = await askRow("zach", "amara");
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.equal(shown.body.preview.sheet.emailed, "Amara is emailed to say their place has ended. Sofia, Group A’s facilitator, is emailed to say Amara has left the group.");
    const done = await pressRow("zach", "amara", { emails: 2 });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual(world.mail.map((sent) => [sent.to, sent.subject]), [
      ["amara@example.com", "Your place on AGI Strategy has ended"],
      ["sofia@example.com", "Amara has left Group A"],
    ]);
    assert.equal(read(rowPath("amara")).status, "withdrawn");
  });

  test("a visit to come: its host's facilitators are counted and emailed, and the row closes", async () => {
    await arrange("amara", 4, C);
    await giveBack();
    const shown = await askRow("zach", "amara");
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.deepEqual(shown.body.preview.visits, [{ hostName: "Group C", weekNumber: 4 }]);
    const done = await pressRow("zach", "amara", { emails: shown.body.preview.emails });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(world.mail.length, shown.body.preview.emails);
    assert.ok(world.mail.some((sent) => sent.to === "tom@example.com"));
    assert.equal(read(rowPath("amara")).status, "withdrawn");
  });

  test("Course run's take-off, an ordinary one, leaves the row accepted and counted", async () => {
    await giveBack();
    const before = counts();
    const shown = await ask("zach", "amara");
    assert.equal((await press("zach", "amara", { emails: shown.body.preview.emails })).status, 200);
    assert.equal(read(seatPath("amara")).status, "removed");
    assert.equal(read(rowPath("amara")).status, "accepted");
    assert.deepEqual(counts(), before);
    assert.ok((await panel()).takenOff.some((person) => person.uid === "amara"));
  });

  test("a count that changed is refused with nothing written, the row included", async () => {
    await giveBack();
    const before = w.everything();
    const done = await pressRow("zach", "amara", { emails: 3 });
    assert.equal(done.status, 409);
    assert.equal(done.body.emails, 1);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("nobody but an admin closes a row: the lead, the track lead, a member and a view-as session are refused, signed out told to sign in", async () => {
    await giveBack();
    const before = w.everything();
    for (const who of ["claudia", "yusuf"]) {
      assert.deepEqual([(await askRow(who, "amara")).status, (await askRow(who, "amara")).body], [403, { error: "Forbidden" }], who);
      assert.equal((await pressRow(who, "amara", { emails: 1 })).status, 403, who);
    }
    for (const who of ["nobody", "amara", "sofia"]) {
      assert.equal((await askRow(who, "amara")).status, 403, who);
      assert.equal((await pressRow(who, "amara", { emails: 1 })).status, 403, who);
    }
    assert.equal((await askRow(null, "amara")).status, 401);
    assert.equal((await pressRow("zach", "amara", { emails: 1 }, { viewAs: true })).status, 403);
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("nobody who still holds their place, and no row the form did not write, is closed", async () => {
    const before = w.everything();
    assert.deepEqual(
      [(await askRow("zach", "amara")).status, (await askRow("zach", "amara")).body.error],
      [409, "They still hold their place, so their row on the run’s list stays as it is."],
    );
    assert.equal((await pressRow("zach", "amara", { emails: 2 })).status, 409);
    // Chloe applied to the run itself: that row is not the form's.
    assert.deepEqual(
      [(await askRow("zach", "chloe")).status, (await askRow("zach", "chloe")).body.error],
      [409, "Their row on the run’s list didn’t come from a programme, so it stays as it is."],
    );
    // A row of the form's that is not open: nothing to close.
    world.db.poke(rowPath("amara"), { status: "waitlisted" });
    assert.deepEqual(
      [(await askRow("zach", "amara")).status, (await askRow("zach", "amara")).body.error],
      [409, "Their row on the run’s list isn’t open, so there’s nothing to close."],
    );
    world.db.poke(rowPath("amara"), { status: "accepted" });
    assert.equal(w.everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("the button is offered exactly where the route goes through: not for somebody staff put back, nor with no seat", async () => {
    await giveBack();
    // Put back on the run by staff since: the board no longer says they gave it back, and nor does Course run.
    world.db.poke(seatPath("amara"), { putBackAt: NOW });
    let amara = (await panel()).gaveBack.find((person) => person.uid === "amara");
    assert.deepEqual([amara?.canTakeOff, amara?.noSeat], [false, false]);
    assert.equal((await askRow("zach", "amara")).body.error, "They still hold their place, so their row on the run’s list stays as it is.");
    // No seat at all (handed over, never placed): the line says so, and the way to their row is today's.
    world.db.poke(seatPath("amara"), { putBackAt: null });
    await world.db.collection("courseEnrolments").doc(`${RUN.agi}__amara`).delete();
    const shown = await panel();
    amara = shown.gaveBack.find((person) => person.uid === "amara");
    assert.deepEqual(
      [amara?.canTakeOff, amara?.noSeat, amara?.line],
      [false, true, "Gave their place back on Tue 17 Nov · not in a group, so there’s no seat to free"],
    );
    assert.match(shown.listPath, /^\/admin\/courses\/[^/]+\/runs\/[^/]+\/applications$/);
    assert.equal(careful.CHANGE_THEIR_ROW, "Change their row on the run’s own applications list");
  });

  test("a holder whose row is closed is named apart, with what is true and nothing to press", async () => {
    const holders = await w.loadTs("lib/applications/handover/holders.ts");
    const compared = holders.compareWithRun({
      holders: [{ uid: "x", name: "Xan" }, { uid: "y", name: "Yan" }],
      rows: [
        { uid: "x", status: "withdrawn", fromForm: { roundId: ROUND, programmeId: AGI }, displayName: "Xan" },
        { uid: "y", status: "pending", fromForm: { roundId: ROUND, programmeId: AGI }, displayName: "Yan" },
      ],
      roundId: ROUND,
      programmeId: AGI,
      names: new Map(),
    });
    assert.deepEqual([compared.closed.map((p) => p.uid), compared.notAccepted.map((p) => p.uid)], [["x"], ["y"]]);
    assert.equal(careful.CLOSED_ROW_NOTE, "A closed row can’t be opened again, so they can’t be put on this run’s board.");
    assert.doesNotMatch(careful.CLOSED_ROW_NOTE, /Accept/);
  });

  test("the list's note and the sheet follow the one switch", async () => {
    const options = await w.loadTs("lib/courses/runCareful/options.ts");
    assert.equal(options.COURSE_RUN_CLOSES_THE_ROW, false);
    assert.equal(careful.gaveBackNote(true), careful.GAVE_BACK_NOTE);
    assert.equal(careful.gaveBackNote(false), "They gave their place back after they were handed over. Take them off the run here: their seat is freed.");
  });

  test("a second press finds them off and writes and sends nothing more; no route opens the row again", async () => {
    await giveBack();
    assert.equal((await pressRow("zach", "amara", { emails: 1 })).status, 200);
    const after = w.everything();
    world.mail.length = 0;
    const again = await pressRow("zach", "amara", { emails: 1 });
    assert.equal(again.status, 200);
    assert.equal(again.body.said, "They’re already off the run. Nobody was emailed.");
    assert.equal(w.everything(), after);
    assert.equal(world.mail.length, 0);
    // The run's own list refuses to decide a withdrawn row.
    const decided = await call("zach", decideRoute.POST, { runId: RUN.agi, uid: "amara" }, { body: { action: "accept" }, course: true });
    assert.equal(decided.status, 409);
    assert.equal(read(rowPath("amara")).status, "withdrawn");
  });
});
