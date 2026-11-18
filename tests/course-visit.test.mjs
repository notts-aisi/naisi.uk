/**
 * A ONE-WEEK VISIT TO ANOTHER GROUP'S SESSION, arranged by staff from a
 * person's page under the programme, and called off by staff or by the
 * person themselves.
 *
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/visit
 *   POST /api/courses/runs/[runId]/visit/cancel
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 *  1. WHO MAY: an admin or the programme's lead; a reviewer is told it is not
 *     theirs; a track lead, a facilitator, a member and somebody signed out
 *     are refused; a view-as session never.
 *  2. EVERY REFUSAL, one sentence each, writes nothing and emails nobody.
 *  3. THE PREVIEW EQUALS THE SAVE; 409 on a changed count; a full session is
 *     arranged only with the flag the page sends back after showing it.
 *  4. THE TRANSACTION: the visit on the place, one history row on each group,
 *     the reason for the lead and admins only.
 *  5. THE EMAILS: each variation's exact words, who gets them, none to the
 *     presser, after the commit, a failed send reported and the visit kept.
 *  6. CALLING IT OFF: by staff until the host's session starts, emailing the
 *     person too; by the person until the earlier of the two sessions starts,
 *     emailing both groups' facilitators and nobody else; their own words on
 *     the host's register taken off; their own visit only.
 *  7. PLACES LEFT IN A WEEK: its own people, visitors in, its people away, no
 *     capacity, over the limit.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * the clock is Tue 17 Nov 2026 at noon. Group A meets on Thursdays at 6pm in
 * Portland A13 (Sofia); Group B on Tuesdays at 6pm in Hallward B12 (Rahul and
 * Sofia), tonight for week 3; Group C on Wednesdays at 1pm in Room B8 (Tom),
 * tomorrow for week 3; Group D on Mondays at 6pm in Room D4 (Grace). Claudia
 * leads the programme. Chloe is in Group B.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { A, AGI, B, C, D, NOW, ROUND, RUN, makeLeavingWorld, registerPath } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__visit");
const { world, call } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const cancelRoute = await w.courseRoute("runs", "[runId]", "visit", "cancel");
const words = await w.loadTs(join("lib", "courses", "visit", "words.ts"));
const places = await w.loadTs(join("lib", "courses", "visit", "places.ts"));
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
const short = (response) => [response.status, response.body?.error ?? null];
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
/** A snapshot of every document, to prove a refusal wrote nothing. */
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)]));

const visit = (who, uid, body, options = {}) =>
  call(who, visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, viewAs: options.viewAs, course: true });
const preview = (who, uid, weekNumber, hostGroupId) => visit(who, uid, { weekNumber, hostGroupId, preview: true });
/** A press made the way the page makes one: the preview's count and full flag sent back. */
async function press(who, uid, weekNumber, hostGroupId, reason) {
  const shown = await preview(who, uid, weekNumber, hostGroupId);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const body = { weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null };
  if (reason !== undefined) body.reason = reason;
  return { shown: shown.body.preview, saved: await visit(who, uid, body) };
}
const cancel = (who, weekNumber, options = {}) =>
  call(who, cancelRoute.POST, { runId: RUN.agi }, { body: { weekNumber }, viewAs: options.viewAs, course: true });

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  for (const [groupId, count] of [
    [A, 4],
    [B, 3],
    [C, 2],
    [D, 2],
  ]) {
    world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  }
});

// ---------------------------------------------------------------------------
// 1. Who may
// ---------------------------------------------------------------------------

describe("1. who may arrange a visit", () => {
  test("an admin and the programme's lead are answered the preview", async () => {
    for (const who of ["zach", "claudia"]) {
      const shown = await preview(who, "chloe", 4, A);
      assert.equal(shown.status, 200, `${who}: ${JSON.stringify(shown.body)}`);
      assert.deepEqual(Object.keys(shown.body).sort(), ["ok", "preview"]);
    }
  });

  test("a reviewer is told it is not theirs; a track lead, a facilitator, a member and nobody are refused; nothing is written", async () => {
    const before = everything();
    assert.deepEqual(short(await preview("lloyd", "chloe", 4, A)), [403, words.VISIT_REFUSAL.notYours]);
    for (const who of ["yusuf", "rahul", "tom", "amara", "tess", "nobody"]) {
      assert.deepEqual(short(await preview(who, "chloe", 4, A)), [404, words.VISIT_REFUSAL.noProgramme], who);
      const body = { weekNumber: 4, hostGroupId: A, emailCount: 3, overLimit: false };
      assert.deepEqual(short(await visit(who, "chloe", body)), [404, words.VISIT_REFUSAL.noProgramme], who);
    }
    assert.equal((await preview(null, "chloe", 4, A)).status, 401);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a view-as session is turned away before anything is read, on both routes", async () => {
    const before = everything();
    assert.equal((await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: 3, overLimit: false }, { viewAs: true })).status, 403);
    assert.equal((await cancel("chloe", 4, { viewAs: true })).status, 403);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. Every refusal
// ---------------------------------------------------------------------------

describe("2. every refusal, one sentence, nothing written", () => {
  async function refused(uid, weekNumber, hostGroupId, expected, status = 409) {
    const before = everything();
    const shown = await preview("zach", uid, weekNumber, hostGroupId);
    assert.deepEqual(short(shown), [status, expected], JSON.stringify(shown.body));
    const pressed = await visit("zach", uid, { weekNumber, hostGroupId, emailCount: 3, overLimit: true });
    assert.deepEqual(short(pressed), [status, expected]);
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  }

  test("not an active learner's place", async () => {
    await refused("sam", 4, A, words.VISIT_REFUSAL.noPlace, 404);
    await refused("omar", 4, A, words.VISIT_REFUSAL.noPlace, 404);
    await refused("nobody", 4, A, words.VISIT_REFUSAL.noPlace, 404);
  });

  test("a place not told its group yet", async () => {
    await refused("una", 4, A, "Una hasn’t been told a group yet. Groups that haven’t gone out are changed in Arrange and told at Publish.");
  });

  test("somebody who facilitates a group of the run", async () => {
    world.db.poke(`courseGroups/${D}`, { facilitatorUids: ["grace", "chloe"] });
    await refused("chloe", 4, A, "Chloe facilitates Group D, so Chloe sits only in Group D.");
  });

  test("a run with one live group", async () => {
    for (const id of [A, C, D]) world.db.poke(`courseGroups/${id}`, { archived: true });
    await refused("chloe", 4, A, words.VISIT_REFUSAL.oneGroup);
  });

  test("a run that is over, archived or being destroyed", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    await refused("chloe", 4, A, words.VISIT_REFUSAL.runOver);
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "active", archived: true });
    await refused("chloe", 4, A, words.VISIT_REFUSAL.runArchived);
    world.db.poke(`courseRuns/${RUN.agi}`, { archived: false, destroying: true });
    await refused("chloe", 4, A, words.VISIT_REFUSAL.runGone);
  });

  test("a host that is missing, archived, or the group they belong to that week", async () => {
    await refused("chloe", 4, "no-such-group", words.VISIT_REFUSAL.noGroup, 404);
    world.db.poke(`courseGroups/${A}`, { archived: true });
    await refused("chloe", 4, A, "Group A no longer meets.");
    world.db.poke(`courseGroups/${A}`, { archived: false });
    await refused("chloe", 4, B, "Chloe is in Group B that week, so there is nothing to visit.");
  });

  test("a host of another run is not one of this run's groups", async () => {
    world.db.seed("courseGroups/elsewhere", { ...read(`courseGroups/${A}`), runId: RUN.other, name: "Elsewhere" });
    await refused("chloe", 4, "elsewhere", words.VISIT_REFUSAL.noGroup, 404);
  });

  test("a host session that week missing, called off, marked as not held, or started", async () => {
    // Group D met yesterday for week 3: started.
    await refused("chloe", 3, D, "Group D’s week 3 session has started.");
    // Group A's week 4 called off, the group keeping pace.
    world.db.poke(`courseGroups/${A}`, {
      sessionChanges: { w04: { kind: "cancelled", reason: "Away", dateKey: "2026-11-19", byUid: "sofia", at: new Date("2026-11-10T09:00:00Z") } },
    });
    await refused("chloe", 4, A, "Group A’s week 4 session is called off.");
    world.db.poke(`courseGroups/${A}`, { sessionChanges: {} });
    world.db.seed(registerPath(A, 4), { runId: RUN.agi, groupId: A, weekNumber: 4, occurrence: 1, records: {}, held: false, pushedAt: null });
    await refused("chloe", 4, A, "Group A’s week 4 session didn’t happen.");
  });

  test("somebody already marked as having come on their own group's register that week", async () => {
    for (const mark of ["present", "late", "left-early"]) {
      world.db.seed(registerPath(B, 4), { runId: RUN.agi, groupId: B, weekNumber: 4, occurrence: 1, records: { chloe: mark }, held: true, pushedAt: null });
      await refused("chloe", 4, A, "Chloe is already marked on Group B’s register for week 4.");
    }
  });

  test("a week that already has a visit", async () => {
    const first = await press("zach", "chloe", 4, A);
    assert.equal(first.saved.status, 200, JSON.stringify(first.saved.body));
    world.mail.length = 0;
    await refused("chloe", 4, C, "Chloe already has a visit in week 4.");
  });

  test("a week whose own session has started, or that is not theirs", async () => {
    // Group B's week 2 met on Tue 10 Nov.
    await refused("chloe", 2, A, "Group B has no session to come in week 2.");
  });

  test("a host register at its limit of people", async () => {
    // Forty people in Group A that week.
    for (let n = 0; n < 36; n += 1) {
      world.db.seed(seatPath(`extra${n}`), { ...read(seatPath("amara")), uid: `extra${n}` });
    }
    await refused("chloe", 4, A, "Group A’s week 4 register can’t take anybody more.");
  });

  test("a body that is not whole", async () => {
    for (const body of [null, [], { weekNumber: 4 }, { weekNumber: 0, hostGroupId: A, preview: true }, { weekNumber: 4, hostGroupId: A, preview: true, extra: 1 }]) {
      assert.equal((await visit("zach", "chloe", body)).status, 400, JSON.stringify(body));
    }
    assert.deepEqual(short(await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: 3, reason: "line one\nline two" })), [400, words.VISIT_REFUSAL.reasonLine]);
    assert.deepEqual(short(await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: 3, reason: "see https://example.com" })), [400, words.VISIT_REFUSAL.reasonLink]);
  });
});

// ---------------------------------------------------------------------------
// 3. The preview, the save, 409
// ---------------------------------------------------------------------------

describe("3. the preview equals the save", () => {
  test("the preview draws the board's lines and the email to the person", async () => {
    const shown = (await preview("zach", "chloe", 4, A)).body.preview;
    assert.deepEqual(shown.lines, [
      { label: "Week 4", text: "Chloe goes to Group A: Thu 19 Nov, 6pm to 8pm, Portland A13, with Sofia. Chloe stays in Group B and is back on Tue 1 Dec." },
      { label: "Late from", text: "Thu 19 Nov, 6pm: Group A’s session." },
      { label: "Reminders", text: "Follow Group A’s time." },
      { label: "Registers", text: "On Group A’s as visiting, with Group A’s check-in. Group B’s shows “At Group A this week”." },
      { label: "Reading", text: "Sofia can read Chloe’s week 4 only. Rahul and Sofia keep everything and give the feedback." },
      { label: "Link", text: "If Chloe joins online, the link shown is Group A’s for that week." },
    ]);
    // Sofia facilitates both groups: told once, as the host's.
    assert.deepEqual(shown.told, { count: "3 emails", rest: ": Chloe, Sofia and Rahul." });
    assert.equal(shown.button, "Arrange the visit and email 3 people");
    assert.equal(shown.overLimit, null);
    assert.deepEqual(shown.personEmail, {
      subject: "You’re going to Group A’s session on Thu 19 Nov",
      lines: [
        "For week 4 you’re with Group A:",
        "Thu 19 Nov, 6pm to 8pm",
        "Portland A13, with Sofia",
        "You’re still in Group B, and back with them on Tue 1 Dec. Week 4’s work is due by Group A’s session.",
        "Changed your mind? You can cancel the visit on your programme page until Thu 19 Nov, 6pm.",
      ],
    });
  });

  test("the press sends what the preview said, to exactly those people", async () => {
    const { shown, saved } = await press("zach", "chloe", 4, A);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(Object.keys(saved.body).sort(), ["emails", "hostGroupId", "message", "ok", "weekNumber"]);
    assert.deepEqual(saved.body.emails, { sent: 3, suppressed: 0, failed: 0 });
    assert.equal(world.mail.length, shown.emails);
    assert.deepEqual(world.mail.map((message) => [message.to, message.subject, message.kind]), [
      ["chloe@example.com", "You’re going to Group A’s session on Thu 19 Nov", "course-visit"],
      ["sofia@example.com", "Chloe Nguyen is joining Group A for week 4", "course-visit"],
      ["rahul@example.com", "Chloe Nguyen is at Group A for week 4", "course-visit"],
    ]);
    assert.equal(saved.body.message, "Chloe goes to Group A for week 4. 3 emails sent.");
  });

  test("a changed count: 409 with the new count, nothing written", async () => {
    const shown = (await preview("zach", "chloe", 4, A)).body.preview;
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "tom"] });
    const before = everything();
    const answer = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: shown.emails, overLimit: false });
    assert.equal(answer.status, 409);
    assert.equal(answer.body.emails, 4);
    assert.equal(answer.body.error, words.changedWords(4));
    assert.equal(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("a full session: the warning, and the save needs the flag the page sends back after showing it", async () => {
    world.db.poke(`courseGroups/${A}`, { capacity: 4 });
    const shown = (await preview("zach", "chloe", 4, A)).body.preview;
    assert.equal(shown.overLimit, "Group A is full this week: this makes 5, one over its limit of 4.");
    const before = everything();
    const unflagged = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: shown.emails, overLimit: false });
    assert.equal(unflagged.status, 409);
    assert.equal(unflagged.body.overLimit, true);
    assert.equal(everything(), before);
    const flagged = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: shown.emails, overLimit: true });
    assert.equal(flagged.status, 200, JSON.stringify(flagged.body));
    assert.equal(seat("chloe").visits[0].groupId, A);
  });

  test("a session that fills between the page and the press: 409", async () => {
    world.db.poke(`courseGroups/${A}`, { capacity: 5 });
    const shown = (await preview("zach", "chloe", 4, A)).body.preview;
    assert.equal(shown.overLimit, null);
    // Kofi is sent to Group A that week first.
    assert.equal((await press("zach", "kofi", 4, A)).saved.status, 200);
    const answer = await visit("zach", "chloe", { weekNumber: 4, hostGroupId: A, emailCount: shown.emails, overLimit: false });
    assert.equal(answer.status, 409);
    assert.equal(answer.body.overLimit, true);
    assert.equal(seat("chloe").visits, undefined);
  });
});

// ---------------------------------------------------------------------------
// 4. What the save writes
// ---------------------------------------------------------------------------

describe("4. what the save writes", () => {
  test("the visit on the place, read back by the one function; nothing else about the place changes", async () => {
    const before = read(seatPath("chloe"));
    const { saved } = await press("claudia", "chloe", 4, A);
    assert.equal(saved.status, 200);
    const after = read(seatPath("chloe"));
    assert.equal(after.groupId, before.groupId);
    assert.deepEqual(after.allocatedEmailAt, before.allocatedEmailAt);
    assert.equal(after.groupsByWeek, undefined);
    const place = seat("chloe");
    assert.deepEqual(place.visits.map((each) => [each.weekNumber, each.groupId, each.arrangedByUid]), [[4, A, "claudia"]]);
    assert.equal(enrolments.groupForWeek(place, 4), A);
    assert.equal(enrolments.ownGroupForWeek(place, 4), B);
    assert.equal(enrolments.groupForWeek(place, 5), B);
  });

  test("one history row on each group, the reason for the lead and admins only", async () => {
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["tom"] });
    const { saved } = await press("zach", "chloe", 4, A, "Clashes  with a lab that week");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const rows = world.db
      .paths()
      .filter((path) => path.startsWith("courseAudit/"))
      .map((path) => read(path))
      .filter((row) => row.kind === "member-visits");
    assert.deepEqual(
      rows.map((row) => [row.groupId, row.detail, row.reason, row.subjectUid]).sort(),
      [
        [A, "Chloe Nguyen is at Group A for week 4. Reason: Clashes with a lab that week", "Clashes with a lab that week", "chloe"],
        [B, "Chloe Nguyen visits Group A for week 4. Reason: Clashes with a lab that week", "Clashes with a lab that week", "chloe"],
      ].sort(),
    );
    // The reason in no email.
    assert.ok(world.mail.every((message) => !JSON.stringify(message).includes("lab")));
  });
});

// ---------------------------------------------------------------------------
// 5. The emails
// ---------------------------------------------------------------------------

describe("5. the emails", () => {
  const facts = (over = {}) => ({
    personName: "Daniel Kim",
    personFirstName: "Daniel",
    weekNumber: 2,
    hostName: "Group I",
    homeName: "Group C",
    host: { dateKey: "2026-11-11", startTimeLocal: "18:00", durationMinutes: 120, room: "Monica Partridge C12", campus: "University Park" },
    hostFacilitatorFirstNames: ["Lucy"],
    backDateKey: "2026-11-18",
    cancelUntil: { dateKey: "2026-11-11", startTimeLocal: "18:00" },
    ...over,
  });

  test("the approved words, word for word, with nobody having asked", () => {
    assert.deepEqual(words.personEmailWords(facts()), {
      subject: "You’re going to Group I’s session on Wed 11 Nov",
      lines: [
        "For week 2 you’re with Group I:",
        "Wed 11 Nov, 6pm to 8pm",
        "Monica Partridge C12, University Park, with Lucy",
        "You’re still in Group C, and back with them on Wed 18 Nov. Week 2’s work is due by Group I’s session.",
      ],
      button: "Open your programme page",
      footnote: "Changed your mind? You can cancel the visit on your programme page until Wed 11 Nov, 6pm.",
    });
    assert.deepEqual(words.hostEmailWords(facts()), {
      subject: "Daniel Kim is joining Group I for week 2",
      lines: [
        "Daniel Kim, from Group C, is coming to your week 2 session on Wed 11 Nov, 6pm, for that week only.",
        "Your register will list Daniel as visiting, and you can read Daniel’s week 2 work. Group C’s facilitators still give the feedback.",
      ],
      button: "Open your group",
      footnote: "This is an automated email, sent because a visit to your session was approved.",
    });
    assert.deepEqual(words.homeEmailWords(facts()), {
      subject: "Daniel Kim is at Group I for week 2",
      lines: [
        "Daniel Kim is going to Group I’s session on Wed 11 Nov, 6pm, for week 2 only, and is back with Group C on Wed 18 Nov.",
        "Your register will show Daniel as “At Group I this week”. There’s nothing for you to do, and you still give the feedback on Daniel’s work.",
      ],
      button: "Open your group",
      footnote: "This is an automated email, sent because a visit was approved for somebody in your group.",
    });
    assert.deepEqual(words.calledOffEmailWords({ personName: "Daniel Kim", hostName: "Group I", homeName: "Group C", weekNumber: 2 }), {
      subject: "Daniel Kim’s visit to Group I for week 2 is off",
      lines: ["Daniel Kim is no longer coming to Group I’s week 2 session, and will be at Group C’s as usual."],
      button: "Open your group",
      footnote: "This is an automated email.",
    });
    assert.deepEqual(
      words.calledOffPersonEmailWords({ hostName: "Group I", homeName: "Group C", weekNumber: 2, hostDateKey: "2026-11-11", own: { dateKey: "2026-11-12", startTimeLocal: "15:00" } }),
      {
        subject: "Your visit to Group I for week 2 is off",
        lines: ["Your visit to Group I’s session on Wed 11 Nov has been cancelled. You’re with Group C as usual on Thu 12 Nov, 3pm."],
        button: "Open your programme page",
        footnote: "",
      },
    );
  });

  test("the online lines have their place in the host's email, and none is sent today", () => {
    assert.deepEqual(words.hostEmailWords(facts(), ["(a line)"]).lines.slice(2), ["(a line)"]);
    assert.equal(words.hostEmailWords(facts()).lines.length, 2);
  });

  test("a missing fact: no room leaves the room out; no later session of their own leaves \"and back with them\" out", () => {
    const noRoom = words.personEmailWords(facts({ host: { ...facts().host, room: "" } }));
    assert.equal(noRoom.lines[2], "University Park, with Lucy");
    const linkRoom = words.personEmailWords(facts({ host: { ...facts().host, room: "https://meet.example.com/x" } }));
    assert.equal(linkRoom.lines[2], "University Park, with Lucy");
    const noBack = words.personEmailWords(facts({ backDateKey: null }));
    assert.equal(noBack.lines[3], "You’re still in Group C. Week 2’s work is due by Group I’s session.");
    assert.equal(words.homeEmailWords(facts({ backDateKey: null })).lines[0], "Daniel Kim is going to Group I’s session on Wed 11 Nov, 6pm, for week 2 only.");
  });

  test("the cancel line's time is when the earlier of the two sessions starts", async () => {
    // Chloe to Group C for week 3: Group C meets Wed 18 Nov at 1pm, Group B tonight at 6pm.
    const shown = (await preview("zach", "chloe", 3, C)).body.preview;
    assert.equal(shown.personEmail.lines.at(-1), "Changed your mind? You can cancel the visit on your programme page until Tue 17 Nov, 6pm.");
  });

  test("nobody without standing or an address, never the person among the facilitators, never the presser", async () => {
    world.db.poke("users/rahul", { email: "" });
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "claudia"] });
    const { shown, saved } = await press("claudia", "chloe", 4, A);
    assert.equal(saved.status, 200);
    assert.deepEqual(shown.told, { count: "2 emails", rest: ": Chloe and Sofia." });
    assert.deepEqual(world.mail.map((message) => message.to), ["chloe@example.com", "sofia@example.com"]);
  });

  test("the emails go after the commit; a failed send is reported and the visit kept", async () => {
    world.mailFate = (args) => (args.to === "rahul@example.com" ? "fail" : "sent");
    try {
      const { saved } = await press("zach", "chloe", 4, A);
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.body.emails, { sent: 2, suppressed: 0, failed: 1 });
      assert.equal(saved.body.message, "Chloe goes to Group A for week 4. 2 emails sent. 1 email could not be sent; the visit is kept.");
      assert.equal(seat("chloe").visits.length, 1);
    } finally {
      world.mailFate = undefined;
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Calling it off
// ---------------------------------------------------------------------------

describe("6. calling a visit off", () => {
  test("by staff: the visit goes, both groups' facilitators and the person are emailed, a row on each history", async () => {
    await press("zach", "chloe", 4, A);
    world.mail.length = 0;
    const answer = await visit("claudia", "chloe", { weekNumber: 4, callOff: true, emailCount: 3 });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(seat("chloe").visits, undefined);
    assert.equal(enrolments.groupForWeek(seat("chloe"), 4), B);
    assert.deepEqual(world.mail.map((message) => [message.to, message.subject]), [
      ["chloe@example.com", "Your visit to Group A for week 4 is off"],
      ["sofia@example.com", "Chloe Nguyen’s visit to Group A for week 4 is off"],
      ["rahul@example.com", "Chloe Nguyen’s visit to Group A for week 4 is off"],
    ]);
    const offRows = world.db.paths().filter((path) => path.startsWith("courseAudit/")).map(read).filter((row) => row.kind === "member-visit-off");
    assert.deepEqual(offRows.map((row) => row.groupId).sort(), [A, B].sort());
    assert.equal(answer.body.message, "Chloe’s visit to Group A for week 4 is off. 3 emails sent.");
  });

  test("by staff: refused once the host's session has started, and a changed count is 409", async () => {
    await press("zach", "chloe", 4, A);
    world.mail.length = 0;
    const changed = await visit("zach", "chloe", { weekNumber: 4, callOff: true, emailCount: 9 });
    assert.equal(changed.status, 409);
    at("2026-11-19T18:05:00Z");
    const late = await visit("zach", "chloe", { weekNumber: 4, callOff: true, emailCount: 3 });
    assert.equal(late.status, 409);
    assert.equal(seat("chloe").visits.length, 1);
    assert.equal(world.mail.length, 0);
  });

  test("by the person: their own visit only; both groups' facilitators are emailed and nobody else", async () => {
    await press("zach", "chloe", 4, A);
    world.mail.length = 0;
    // Farah has no visit: nothing to cancel, and Chloe's is not reachable by anybody else.
    assert.equal((await cancel("farah", 4)).status, 404);
    assert.equal(seat("chloe").visits.length, 1);
    const answer = await cancel("chloe", 4);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, { ok: true, weekNumber: 4 });
    assert.equal(seat("chloe").visits, undefined);
    assert.deepEqual(world.mail.map((message) => [message.to, message.subject]), [
      ["sofia@example.com", "Chloe Nguyen’s visit to Group A for week 4 is off"],
      ["rahul@example.com", "Chloe Nguyen’s visit to Group A for week 4 is off"],
    ]);
    // No greeting on the facilitators' email, as approved.
    assert.ok(world.mail.every((message) => !JSON.stringify(message).includes("Hi Sofia")));
  });

  test("by the person: refused once the earlier of the two sessions has started", async () => {
    // Chloe to Group C for week 3: Group B meets tonight at 6pm, Group C tomorrow at 1pm.
    assert.equal((await press("zach", "chloe", 3, C)).saved.status, 200);
    world.mail.length = 0;
    at("2026-11-17T18:01:00Z");
    assert.equal((await cancel("chloe", 3)).status, 409);
    assert.equal(seat("chloe").visits.length, 1);
    // Staff still may, until Group C's session starts: Chloe, Tom, Rahul and Sofia.
    assert.equal((await visit("zach", "chloe", { weekNumber: 3, callOff: true, emailCount: 4 })).status, 200);
  });

  test("a cancel that does not happen: the route says why as a kind, and the page says its own line from status and kind alone", async () => {
    // Too late: the earlier of the two sessions (Group B's, tonight at 6pm) has started.
    assert.equal((await press("zach", "chloe", 3, C)).saved.status, 200);
    at("2026-11-17T18:01:00Z");
    const late = await cancel("chloe", 3);
    assert.equal(late.status, 409);
    assert.equal(late.body.kind, "too-late");
    assert.equal(words.cancelOutcomeLine({ status: late.status, kind: late.body.kind }, "Group C"), "Group C’s session has started, so this visit can’t be cancelled now.");
    // Already gone (staff called it off, or another tab): nothing is said.
    at("2026-11-17T12:00:00Z");
    assert.equal((await visit("zach", "chloe", { weekNumber: 3, callOff: true, emailCount: 4 })).status, 200);
    const gone = await cancel("chloe", 3);
    assert.equal(gone.status, 404);
    assert.equal(gone.body.kind, "no-visit");
    assert.equal(words.cancelOutcomeLine({ status: gone.status, kind: gone.body.kind }, "Group C"), null);
    // Signed out: the site's own sign-in, nothing said here.
    assert.equal(words.cancelOutcomeLine({ status: 401 }, "Group C"), null);
    // Did not go through, the visit standing: a dropped request, or any other error.
    for (const answer of [{ status: 0 }, { status: 500 }, { status: 409, kind: "something-else" }]) {
      assert.equal(words.cancelOutcomeLine(answer, "Group I"), "That didn’t go through, so your visit to Group I still stands. Try again.");
    }
    // Never by the server's words: the staff sentence is not what the page shows.
    assert.notEqual(words.cancelOutcomeLine({ status: 409, kind: "too-late" }, "Group C"), late.body.error);
  });

  test("their own words on the host's register come off while it is not finished", async () => {
    await press("zach", "chloe", 4, A);
    world.db.seed(registerPath(A, 4), {
      runId: RUN.agi,
      groupId: A,
      weekNumber: 4,
      occurrence: 1,
      records: {},
      held: true,
      pushedAt: null,
      onlineSaid: { chloe: new Date("2026-11-17T10:00:00Z"), amara: new Date("2026-11-17T10:00:00Z") },
      excusedInAdvance: {},
    });
    assert.equal((await cancel("chloe", 4)).status, 200);
    const after = read(registerPath(A, 4));
    assert.deepEqual(Object.keys(after.onlineSaid), ["amara"]);
  });

  test("a signed-out caller and a view-as session are refused", async () => {
    assert.equal((await cancel(null, 4)).status, 401);
  });
});

// ---------------------------------------------------------------------------
// 7. Places left in a week
// ---------------------------------------------------------------------------

describe("7. places left in a week", () => {
  const place = (uid, groupId, over = {}) => ({ uid, status: "active", groupId, joinedWeekNumber: 1, ...over });
  const group = (capacity) => ({ id: "F", capacity });
  const visitTo = (groupId, weekNumber) => ({ groupId, weekNumber, arrangedByUid: null, arrangedAt: null });

  test("its own people that week, visitors in, less its people away", () => {
    const all = [
      place("a", "F"),
      place("b", "F"),
      place("c", "F", { visits: [visitTo("G", 2)] }),
      place("d", "G", { visits: [visitTo("F", 2)] }),
      place("e", "G", { visits: [visitTo("F", 2)] }),
      place("left", "F", { status: "withdrawn" }),
      place("late", "F", { joinedWeekNumber: 3 }),
    ];
    assert.deepEqual(places.peopleInWeek(all, "F", 2).sort(), ["a", "b", "d", "e"]);
    assert.equal(places.placesLeftInWeek(group(6), all, 2), 2);
    assert.equal(places.placesLeftInWeek(group(6), all, 1), 3);
  });

  test("no capacity is no limit; over the limit is below nought", () => {
    const all = [place("a", "F"), place("b", "F")];
    assert.equal(places.placesLeftInWeek(group(null), all, 2), null);
    assert.equal(places.placesLeftInWeek(group(1), all, 2), -1);
  });

  test("a mover's week counts in the group of that week", () => {
    const mover = place("m", "F", { groupsByWeek: [{ groupId: "G", fromWeek: 1 }, { groupId: "F", fromWeek: 3 }] });
    assert.deepEqual(places.peopleInWeek([mover], "F", 2), []);
    assert.deepEqual(places.peopleInWeek([mover], "G", 2), ["m"]);
    assert.deepEqual(places.peopleInWeek([mover], "F", 3), ["m"]);
  });
});
