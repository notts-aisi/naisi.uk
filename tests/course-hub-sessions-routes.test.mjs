/**
 * Changing a session (Q25): the change route, as every kind of caller, each
 * kind of change end to end, and every refusal before the write.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/courses/groups/[groupId]/session/change
 *
 * ## What this guards
 *
 *  1. WHO. "Rahul, Sofia, Claudia and admins can change a session": a
 *     group's live facilitators, the lead of the programme that names the
 *     run, the run's track leads and admins. Nobody else, and a refusal
 *     writes nothing. View-as is refused first; the body is checked before
 *     anything is read.
 *  2. EACH KIND, WHAT IS STORED. Hold it online, move it, cancel it and keep
 *     pace, cancel it and push the rest back a week, and put it back as usual:
 *     each writes exactly its own fields on the group, and the sessions every
 *     surface resolves then say so.
 *  3. THE GROUP IS TOLD THROUGH THE UPDATES LANE. With "Tell the group" on,
 *     the route answers with the update's words and the dialog posts them to
 *     the group through the updates route: the email reaches the people that
 *     route counts, nobody else, word for word, and never a meeting link.
 *  4. WHOLE OR NOT AT ALL. A stale dialog, a session that has started, a day
 *     outside the week, a time that is no time, a room or reason holding a
 *     link, nothing to put back, and a count that no longer holds are each
 *     refused before anything changes.
 *  5. THE FINISHING DATE under both kinds of cancel.
 *
 * Real: the route, the session resolver, the model, the updates route and
 * its audience, the notice door and the email template. Stubbed by the
 * hand-over world: the session, the Admin SDK handle, the view-as guard and
 * `sendEmail`, which records what it was handed and sends nothing.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { AGI, AWAY, A, B, C, LINK, NOW, ROUND, RUN, TUE_24, makeSessionsWorld } from "./lib/sessionsWorld.mjs";

const w = await makeSessionsWorld("__sessionsRoutes");
const { world, ask, press, everything, group, sessionsOf, reset, at, loadTs } = w;
const model = await loadTs("lib/courses/sessionChange/model.ts");

beforeEach(() => reset());

/** The board's press: cancel Group B's week 4 session and keep pace, telling nobody. */
const CANCEL = { week: 4, dateKey: TUE_24, kind: "cancel" };
const silently = (body) => ({ reason: AWAY, ...body, tell: false });

/** Group B's week, as the resolver reads it now. */
const weekOf = (n, groupId = B) => sessionsOf(groupId).find((s) => s.weekNumber === n && s.occurrence === 1);

/** Everything a message handed to the mail door says, as one string. */
const allOf = (message) => JSON.stringify(message);

/** A message as its reader reads it: the plain-text lines, blank ones left out. */
async function linesOf(message) {
  const text = (await render(message.react, { plainText: true })).trim();
  return text.split("\n").filter((line) => line.trim() !== "");
}
const RULE = "----------------------------------------";
const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who may change a session of Group B", () => {
  const ALLOWED = [
    ["zach", "an admin"],
    ["claudia", "the lead of the programme that names the run"],
    ["yusuf", "the run's track lead"],
    ["rahul", "a facilitator of Group B"],
    ["sofia", "a facilitator of Groups B and A"],
  ];
  const REFUSED = [
    ["tess", "the lead of another programme"],
    ["lloyd", "the programme's reviewer"],
    ["tom", "a facilitator of another group"],
    ["amara", "a member of Group B, told"],
    ["dev", "a member of Group B, placed and not yet told"],
    ["nina", "a member of Group B who left"],
    ["nobody", "a member who is on nothing"],
  ];

  for (const [who, words] of ALLOWED) {
    test(`${words} changes it`, async () => {
      const response = await ask.change(who, B, silently(CANCEL));
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.deepEqual(group().sessionChanges.w04.kind, "cancelled");
      assert.equal(group().sessionChanges.w04.byUid, who);
    });
  }

  for (const [who, words] of REFUSED) {
    test(`${words} is refused, and nothing is written`, async () => {
      const before = everything();
      const response = await ask.change(who, B, silently(CANCEL));
      assert.deepEqual([response.status, response.body.error], [403, "Forbidden"]);
      assert.equal(everything(), before);
    });
  }

  test("somebody signed out is refused before anything", async () => {
    const before = everything();
    const response = await ask.change(null, B, silently(CANCEL));
    assert.equal(response.status, 401);
    assert.equal(everything(), before);
  });

  test("view-as is refused first, even for an admin, and nothing is written", async () => {
    const before = everything();
    const response = await ask.change("zach", B, silently(CANCEL), { viewAs: true });
    assert.equal(response.status, 403);
    assert.equal(response.body.error, "view-as");
    assert.equal(everything(), before);
  });

  test("the body is checked before any document is read", async () => {
    for (const who of ["zach", "rahul", "nobody"]) {
      const reads = world.db.stats.reads;
      const response = await ask.change(who, B, { week: 4, dateKey: TUE_24, kind: "cancel", tell: false });
      assert.deepEqual([response.status, response.body.error], [400, "Give a reason. The group sees it."]);
      assert.equal(world.db.stats.reads, reads, `${who}'s refusal read a document`);
    }
  });

  test("Tom facilitates Group C and changes its session, never Group B's", async () => {
    const own = await ask.change("tom", C, silently({ week: 4, dateKey: "2026-11-25", kind: "cancel" }));
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(group(C).sessionChanges.w04.kind, "cancelled");
    assert.equal((await ask.change("tom", B, silently(CANCEL))).status, 403);
  });

  test("a facilitator of an archived group is refused; an admin is told the group has gone", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await ask.change("rahul", B, silently(CANCEL))).status, 403);
    const admin = await ask.change("zach", B, silently(CANCEL));
    assert.deepEqual([admin.status, admin.body.error], [400, "That group isn’t on this programme any more."]);
  });

  test("a facilitator who no longer meets the bar is refused", async () => {
    world.db.poke("users/rahul", { role: "pending" });
    assert.equal((await ask.change("rahul", B, silently(CANCEL))).status, 403);
  });

  test("a group that is not there: Forbidden for everybody but an admin, who is told it is missing", async () => {
    assert.deepEqual((await ask.change("claudia", "no-such-group", silently(CANCEL))).status, 403);
    assert.deepEqual((await ask.change("rahul", "no-such-group", silently(CANCEL))).status, 403);
    const admin = await ask.change("zach", "no-such-group", silently(CANCEL));
    assert.deepEqual([admin.status, admin.body.error], [404, "Group not found"]);
  });

  test("the lead of the programme loses the power the moment another is named", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.leadUid`]: "nadia" });
    assert.equal((await ask.change("claudia", B, silently(CANCEL))).status, 403);
    assert.equal((await ask.change("nadia", B, silently(CANCEL))).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 2 and 3. Each kind, end to end
// ---------------------------------------------------------------------------

/** The one message the update's email sent, which must be to Amara alone. */
function onlyEmail() {
  assert.equal(world.mail.length, 1, `expected one email, got ${world.mail.map((m) => m.to).join(", ")}`);
  const [message] = world.mail;
  assert.equal(message.to, "amara@example.com", "Group B's one emailable person, and nobody else");
  return message;
}

describe("2. cancel it, and keep pace", () => {
  test("stores the cancellation and nothing else, tells the group, and the sessions say so", async () => {
    const before = world.db.read(`courseGroups/${B}`);
    const { changed, told } = await press("claudia", B, CANCEL);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.deepEqual(changed.body.change, { kind: "cancel", weekNumber: 4, dateKey: TUE_24, newDateKey: null });
    assert.deepEqual(changed.body.update, {
      groupId: B,
      title: "Tue 24 Nov’s session is cancelled",
      message: "Rahul and Sofia are both away. Week 4’s reading stays open.",
      emailCount: 1,
    });

    const after = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(after.sessionChanges, {
      w04: { kind: "cancelled", reason: AWAY, dateKey: TUE_24, byUid: "claudia", at: NOW },
    });
    // Nothing else of the group moved: no override, no mode, no plan.
    for (const field of ["sessionOverrides", "sessionModes", "paceWeekPlan", "paceStartDate", "session"]) {
      assert.deepEqual(after[field], before[field], `${field} changed`);
    }

    // The sessions: week 4 is off, week 5 is the next meeting, and the group
    // still finishes on Tue 8 Dec.
    assert.equal(weekOf(4).cancelled, true);
    const range = w.sessionsLib.sessionRange(sessionsOf(), NOW);
    assert.equal(range.next.dateKey, "2026-12-01");
    assert.equal(range.next.weekNumber, 5);
    assert.equal(range.lastDateKey, "2026-12-08");
    assert.deepEqual(model.coveredWeeks(sessionsOf(), weekOf(5)), [4, 5]);

    // The update went through the updates lane: kept for Group B and emailed
    // to the one person in it the cohort list reaches.
    assert.equal(told.status, 200, JSON.stringify(told.body));
    const [update] = w.stored();
    assert.equal(update.to, "group");
    assert.equal(update.groupId, B);
    assert.equal(update.title, "Tue 24 Nov’s session is cancelled");
    const message = onlyEmail();
    assert.equal(message.subject, "Tue 24 Nov’s session is cancelled");
    assert.ok(allOf(message).includes("Rahul and Sofia are both away. Week 4’s reading stays open."));
    assert.equal(message.replyTo, "ai-safety@uonsu.com");
  });

  test("cancelling the last session moves the finish to the session before it", async () => {
    const outcome = model.keepPaceOutcome(w.run(), group(), 6);
    assert.deepEqual(outcome, { next: null, finishDateKey: "2026-12-01", finishMoves: true });
    const { changed } = await press("rahul", B, { week: 6, dateKey: "2026-12-08", kind: "cancel" }, { tell: false });
    assert.equal(changed.status, 200);
    assert.equal(w.sessionsLib.sessionRange(sessionsOf(), NOW).lastDateKey, "2026-12-01");
  });

  test("a cancellation is of one evening: when the run is re-dated, the week is held on its new date", async () => {
    await press("rahul", B, CANCEL, { tell: false });
    assert.equal(weekOf(4).cancelled, true);
    world.db.poke(`courseRuns/${RUN.agi}`, { startDate: "2026-11-05" });
    assert.equal(weekOf(4).dateKey, "2026-12-01");
    assert.equal(weekOf(4).cancelled, false, "Tue 24 Nov was the evening cancelled, not week 4 wherever it falls");
  });

  test("two cancelled in a row: the next session covers all three weeks", async () => {
    await press("rahul", B, CANCEL, { tell: false });
    await press("rahul", B, { week: 5, dateKey: "2026-12-01", kind: "cancel" }, { tell: false });
    assert.deepEqual(model.coveredWeeks(sessionsOf(), weekOf(6)), [4, 5, 6]);
  });
});

describe("2. cancel it, and push the rest back a week", () => {
  test("puts a break where week 4 was, records the evening, tells the group, and the group finishes a week later", async () => {
    const outcome = model.pushBackOutcome(w.run(), group(), 4);
    assert.equal(outcome.newDateKey, "2026-12-01");
    assert.equal(outcome.lastDateKey, "2026-12-15");

    const { changed, told } = await press("yusuf", B, { week: 4, dateKey: TUE_24, kind: "push" });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.deepEqual(changed.body.change, { kind: "push", weekNumber: 4, dateKey: TUE_24, newDateKey: "2026-12-01" });
    assert.equal(changed.body.update.title, "Tue 24 Nov’s session is cancelled");
    assert.equal(
      changed.body.update.message,
      "Rahul and Sofia are both away. Week 4 is now on Tue 1 Dec, and every session after it moves back a week.",
    );

    const stored = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(
      stored.paceWeekPlan.map((entry) => (entry.kind === "week" ? entry.weekNumber : entry.label)),
      [1, 2, 3, "No session this week", 4, 5, 6],
    );
    assert.deepEqual(stored.sessionChanges.w04, { kind: "pushed", reason: AWAY, dateKey: TUE_24, byUid: "yusuf", at: NOW });
    assert.equal(stored.sessionOverrides, undefined, "no week's own arrangement was touched");

    assert.equal(weekOf(4).dateKey, "2026-12-01");
    assert.equal(weekOf(4).cancelled, false, "week 4 is held, a week later");
    assert.equal(weekOf(6).dateKey, "2026-12-15");
    assert.equal(w.sessionsLib.sessionRange(sessionsOf(), NOW).lastDateKey, "2026-12-15");

    assert.equal(told.status, 200);
    const message = onlyEmail();
    assert.ok(allOf(message).includes("Week 4 is now on Tue 1 Dec, and every session after it moves back a week."));
  });

  test("the other groups keep their dates", async () => {
    await press("claudia", B, { week: 4, dateKey: TUE_24, kind: "push" }, { tell: false });
    assert.equal(weekOf(4, A).dateKey, "2026-11-19");
    assert.equal(weekOf(4, C).dateKey, "2026-11-25");
  });
});

describe("2. hold it online", () => {
  test("switches the week online, records why, and the email never carries the link", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    const { changed, told } = await press("sofia", B, { week: 6, dateKey: "2026-12-08", kind: "online" });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.deepEqual(changed.body.update, {
      groupId: B,
      title: "Tue 8 Dec’s session is online",
      message: "Rahul and Sofia are both away. Same day and time. The link to join is on your programme page, not in your emails.",
      emailCount: 1,
    });
    const stored = world.db.read(`courseGroups/${B}`);
    assert.equal(stored.sessionModes.w06, "virtual");
    assert.equal(stored.sessionChanges.w06.kind, "online");
    assert.equal(group().sessionOverrides.w06.mode, "virtual");
    assert.equal(weekOf(6).dateKey, "2026-12-08", "same day");
    assert.equal(weekOf(6).session.startTimeLocal, "18:00", "same time");

    assert.equal(told.status, 200);
    const message = onlyEmail();
    assert.ok(!allOf(message).includes(LINK), "the meeting link is in the email");
    assert.ok(!allOf(message).includes("meet.example"), "the link's host is in the email");
  });

  test("a group with no join link cannot be held online", async () => {
    const before = everything();
    const response = await ask.change("rahul", B, silently({ week: 6, dateKey: "2026-12-08", kind: "online" }));
    assert.deepEqual(
      [response.status, response.body.error],
      [400, "This group has no join link yet, so it can’t be held online. Add the link to the group’s session first."],
    );
    assert.equal(everything(), before);
  });
});

describe("2. move it", () => {
  const MOVE = { week: 4, dateKey: TUE_24, kind: "move", move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13" } };

  test("moves that week only, in its room, and tells the group where", async () => {
    world.db.poke(`courseGroups/${B}`, { "sessionModes.w04": "virtual" });
    const { changed, told } = await press("rahul", B, MOVE);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.change.newDateKey, "2026-11-25");
    assert.equal(changed.body.update.title, "Tue 24 Nov’s session has moved");
    assert.equal(
      changed.body.update.message,
      "Rahul and Sofia are both away. It’s on Wed 25 Nov at 7pm in Portland A13, this week only.",
    );
    const stored = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(stored.sessionOverrides.w04, { weekday: 3, startTimeLocal: "19:00", location: "Portland A13" });
    assert.equal(stored.sessionModes?.w04, undefined, "the online switch went with the old arrangement");
    assert.equal(stored.sessionChanges.w04.kind, "moved");
    assert.equal(stored.sessionChanges.w04.dateKey, TUE_24, "the date it moved from");

    assert.equal(weekOf(4).dateKey, "2026-11-25");
    assert.equal(weekOf(4).session.location, "Portland A13");
    assert.equal(weekOf(5).dateKey, "2026-12-01", "one week only");
    assert.equal(weekOf(5).session.location, "Hallward B12");
    assert.equal(told.status, 200);
    assert.ok(allOf(onlyEmail()).includes("It’s on Wed 25 Nov at 7pm in Portland A13, this week only."));
  });

  const REFUSALS = [
    [
      "a day outside the week",
      { ...MOVE.move, dateKey: "2026-11-26" },
      "Choose a day in week 4, from Thu 19 to Wed 25 Nov.",
    ],
    ["a time that is no time", { ...MOVE.move, time: "six" }, "Write the time like 6pm."],
    ["a bare hour", { ...MOVE.move, time: "6" }, "Write the time like 6pm."],
    ["no room for a group that meets in one", { ...MOVE.move, room: "  " }, "Say which room it’s in."],
    [
      "a room that is a link",
      { ...MOVE.move, room: "zoom.example/j/123" },
      "A room can’t be a link. To meet online, choose Hold it online.",
    ],
    [
      "where and when it already is",
      { dateKey: TUE_24, time: "18:00", room: "Hallward B12" },
      "That’s already when and where it is. Change the day, the time or the room.",
    ],
    ["a day that has passed", { ...MOVE.move, dateKey: "2026-11-19", time: "9am" }, "That day and time have passed. Choose a later one."],
  ];
  for (const [what, move, sentence] of REFUSALS) {
    test(`refuses ${what}, and changes nothing`, async () => {
      const before = everything();
      const response = await ask.change("rahul", B, silently({ ...MOVE, move }));
      assert.deepEqual([response.status, response.body.error], [400, sentence]);
      assert.equal(everything(), before);
    });
  }
});

describe("2. hold it as usual", () => {
  test("puts a cancelled session back, and tells the group when and where it is", async () => {
    await press("rahul", B, CANCEL, { tell: false });
    world.mail.length = 0;
    const { changed, told } = await press("rahul", B, { week: 4, dateKey: TUE_24, kind: "restore", reason: "Sofia can make it after all." });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.deepEqual(changed.body.update, {
      groupId: B,
      title: "Week 4’s session is back to usual",
      message: "Sofia can make it after all. It’s on Tue 24 Nov at 6pm in Hallward B12.",
      emailCount: 1,
    });
    const stored = world.db.read(`courseGroups/${B}`);
    assert.deepEqual(stored.sessionChanges, {});
    assert.equal(weekOf(4).cancelled, false);
    assert.equal(told.status, 200);
    onlyEmail();
  });

  test("puts a moved session back on its own day", async () => {
    await press("rahul", B, { week: 4, dateKey: TUE_24, kind: "move", move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13" } }, { tell: false });
    const { changed } = await press("rahul", B, { week: 4, dateKey: "2026-11-25", kind: "restore" }, { tell: false });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.change.newDateKey, TUE_24);
    assert.equal(world.db.read(`courseGroups/${B}`).sessionOverrides.w04, undefined);
    assert.equal(weekOf(4).dateKey, TUE_24);
  });

  test("a session that was never changed has nothing to put back", async () => {
    const before = everything();
    const response = await ask.change("rahul", B, silently({ week: 4, dateKey: TUE_24, kind: "restore" }));
    assert.deepEqual([response.status, response.body.error], [400, "That session is already as usual."]);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 4. Whole or not at all
// ---------------------------------------------------------------------------

describe("4. every refusal comes before the write", () => {
  const cases = [
    ["a dialog opened on another date", { ...CANCEL, dateKey: "2026-11-23" }, 409, "That session has changed since this was opened. Close it and open it again."],
    ["a session that has started", { week: 3, dateKey: "2026-11-17", kind: "cancel" }, 409, "That session has started, so it can’t be changed now."],
    ["a week the group has no session in", { week: 9, dateKey: TUE_24, kind: "cancel" }, 400, "That group has no session in that week."],
    ["no reason", { ...CANCEL, reason: "  " }, 400, "Give a reason. The group sees it."],
    ["a reason of two lines", { ...CANCEL, reason: "Away.\nSorry." }, 400, "The reason must be one line."],
    ["a reason over the cap", { ...CANCEL, reason: "a".repeat(201) }, 400, "The reason must be 200 characters or fewer."],
    [
      "a reason holding a link",
      { ...CANCEL, reason: `Join us at ${LINK} instead.` },
      400,
      "Leave links out of the reason. It goes into an email, and a link to a session never does.",
    ],
    ["no kind", { ...CANCEL, kind: "postpone" }, 400, "Choose what happens to the session."],
    ["no week", { ...CANCEL, week: "4" }, 400, "Say which week’s session to change."],
    ["a field nobody sends", { ...CANCEL, groupId: A }, 400, "Expected a JSON object body."],
  ];
  for (const [what, body, status, sentence] of cases) {
    test(`${what}`, async () => {
      const before = everything();
      const response = await ask.change("claudia", B, { reason: AWAY, tell: false, ...body });
      assert.deepEqual([response.status, response.body.error], [status, sentence]);
      assert.equal(everything(), before);
    });
  }

  test("a session under way is not changed: the register is its now", async () => {
    at("2026-11-24T18:30:00Z");
    const response = await ask.change("rahul", B, silently(CANCEL));
    assert.equal(response.status, 409);
  });

  test("the number on the button is a promise: a count that no longer holds changes nothing", async () => {
    const before = everything();
    const response = await ask.change("claudia", B, { ...CANCEL, reason: AWAY, tell: true, emailCount: 7 });
    assert.deepEqual(
      [response.status, response.body.error, response.body.emails],
      [409, "The number of people this emails has changed to 1. Check it, then press again.", 1],
    );
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("Tell the group off: the route answers no update, and nothing is posted or sent", async () => {
    const { changed, told } = await press("claudia", B, CANCEL, { tell: false });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.update, null);
    assert.equal(told, null);
    assert.equal(w.stored().length, 0);
    assert.equal(world.mail.length, 0);
  });

  test("the route itself never sends, even with Tell the group on", async () => {
    const response = await ask.change("claudia", B, { ...CANCEL, reason: AWAY, tell: true, emailCount: 1 });
    assert.equal(response.status, 200);
    assert.equal(world.mail.length, 0, "the email goes through the updates route, never this one");
    assert.equal(w.stored().length, 0, "the update is posted by the updates route, never this one");
  });

  test("answers field by field: the change and the update's words, nothing of the group", async () => {
    const response = await ask.change("claudia", B, { ...CANCEL, reason: AWAY, tell: true, emailCount: 1 });
    assert.deepEqual(Object.keys(response.body).sort(), ["change", "ok", "update"]);
    assert.deepEqual(Object.keys(response.body.change).sort(), ["dateKey", "kind", "newDateKey", "weekNumber"]);
    assert.deepEqual(Object.keys(response.body.update).sort(), ["emailCount", "groupId", "message", "title"]);
  });
});

// ---------------------------------------------------------------------------
// The run's other people never hear of it
// ---------------------------------------------------------------------------

describe("the update's email, word for word", () => {
  test("cancelled, keeping pace: the board's update, as a notice to the group, from whoever pressed", async () => {
    await press("claudia", B, CANCEL);
    const message = onlyEmail();
    assert.equal(message.subject, "Tue 24 Nov’s session is cancelled");
    assert.deepEqual(await linesOf(message), [
      "TUE 24 NOV’S SESSION IS CANCELLED",
      "Sent as an important notice",
      "You are getting this because you are in this course group, so it reaches you whatever your notification settings say, and it is never marketing.",
      "Rahul and Sofia are both away. Week 4’s reading stays open.",
      RULE,
      "Sent by Claudia · Group B · AGI Strategy Fellowship (Autumn 2026)",
      RULE,
      FOOTER,
    ]);
  });

  test("held online: where the link is, and no link", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    await press("rahul", B, { week: 6, dateKey: "2026-12-08", kind: "online", reason: "The room is being painted." });
    const message = onlyEmail();
    assert.equal(message.subject, "Tue 8 Dec’s session is online");
    const lines = await linesOf(message);
    assert.deepEqual(lines.slice(3, 4), [
      "The room is being painted. Same day and time. The link to join is on your programme page, not in your emails.",
    ]);
    assert.equal(lines[5], "Sent by Rahul · Group B · AGI Strategy Fellowship (Autumn 2026)");
    assert.ok(!allOf(message).includes(LINK));
  });
});

describe("the update reaches Group B's people and nobody else", () => {
  test("not the members of other groups, not somebody not yet told, not somebody who left, not a facilitator", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    await press("claudia", B, CANCEL);
    const to = world.mail.map((message) => message.to).sort();
    assert.deepEqual(to, ["amara@example.com"]);
    for (const uid of ["bea", "tariq", "dev", "nina", "ines", "omar", "rahul", "sofia", "tom"]) {
      assert.ok(!to.includes(`${uid}@example.com`), `${uid} was emailed`);
    }
    // And the run's other runs and groups have nothing new.
    assert.deepEqual(group(A).sessionChanges, {});
    assert.deepEqual(group(C).sessionChanges, {});
    assert.equal(RUN.agi, w.run().id);
  });
});
