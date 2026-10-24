/**
 * OFFERING A FREED PLACE, THROUGH THE REAL ROUTES.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards (Q15, approved on Sat 24 Oct 2026)
 *
 * After decision day's send, an outcome may change ONLY from "No offer this
 * time" to an invitation, ONLY for a pooled applicant who ranked the
 * programme and whom it pooled, ONLY while a place is free and the window is
 * open (from the send until the end of week 1 of the run the programme
 * names, in London), ONLY by an admin this term, and with a log line naming
 * nobody. The person accepts on their own page with decision day's Accept
 * and No thanks. Every part of that is broken here once, and every other way
 * of asking is refused with the store untouched.
 *
 * Driven: the two freed-place routes, the person's reply route and decision
 * day's own page, as an admin, a programme's lead, its reviewer, a run's
 * track lead, the pooled person, somebody not pooled, somebody who did not
 * rank the programme, a member who applied to nothing, signed out, and in a
 * view-as session. The clock is moved across the window's edges.
 *
 * Real: every handler, the libraries behind them, the access predicates and
 * the standing checks. Stubbed: `server-only`, `next/server`, the Admin SDK's
 * sentinels and handle, the session, the view-as guard, the push mirror and
 * `sendEmail`, which records what it was handed and answers as a test says.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  AGI,
  APP_URL,
  CAST,
  GROUP,
  ROUND,
  RUN,
  TAIS,
  applicationPath,
  decisionPath,
  freedSeed,
  loadRoutes,
  makeFreedWorld,
  short,
} from "./lib/freedPlacesWorld.mjs";

/** Tue 27 Oct 2026, noon in London (the clocks went back on Sunday). */
const TUESDAY = new Date("2026-10-27T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: TUESDAY });

const made = makeFreedWorld("__freedOffer");
const { world, reset, everything, lib } = made;
const api = await loadRoutes(made);
const rules = await lib("applications", "freedPlaces", "rules.ts");
const reminders = await lib("applications", "decisionDay", "reminders.ts");
const normalise = await lib("applications", "normalise.ts");
const { applicationInvitationRemindersJob: job } = await lib("scheduler", "jobs", "applicationInvitationReminders.ts");

const REPLY_BY = "2026-10-29";
const FORM_PATH = `admissionRounds/${ROUND}`;
const SUBJECT = "A place has come up on AGI Strategy";

beforeEach(() => {
  mock.timers.setTime(TUESDAY.getTime());
  reset();
});

const pick = (uid, groupId = GROUP.monday) => ({ uid, groupId });
const offerBody = (picks, replyBy = REPLY_BY) => ({ picks, replyBy, invitations: picks.length });
/** An admin's test, then the press it unlocks. */
async function testThenOffer(picks, replyBy = REPLY_BY) {
  const tested = await api.test("zach", { ...picks[0], replyBy });
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  return api.offer("zach", offerBody(picks, replyBy));
}
const read = (uid) => world.db.read(applicationPath(uid));
const counts = () => world.db.read(FORM_PATH).applicationCounts;
const auditRows = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => world.db.read(path));

// ---------------------------------------------------------------------------
// 1. Who may press
// ---------------------------------------------------------------------------

describe("who may offer a freed place: an admin, this term", () => {
  /** [caller, who they are, the answer to a press, the answer to a test]. */
  const CALLERS = [
    [null, "signed out", 401, 401],
    ["claudia", "AGI Strategy's lead", 403, 403],
    ["lloyd", "AGI Strategy's reviewer", 403, 403],
    ["yusuf", "the run's track lead, named on nothing on the form", 404, 404],
    ["tess", "another programme's lead", 404, 404],
    ["omar", "the pooled person themselves", 404, 404],
    ["amara", "somebody holding a place, not pooled", 404, 404],
    ["hana", "somebody who did not rank AGI Strategy", 404, 404],
    ["nobody", "a member who applied to nothing", 404, 404],
  ];

  for (const [who, label, offered, tested] of CALLERS) {
    test(`${label} is refused, and nothing is written or sent`, async () => {
      const before = everything();
      // George is offerable, so nothing but the caller is in the way.
      const press = await api.offer(who, offerBody([pick("george")]));
      const test_ = await api.test(who, { ...pick("george"), replyBy: REPLY_BY });
      assert.deepEqual([press.status, test_.status], [offered, tested], JSON.stringify([press.body, test_.body]));
      if (offered === 403) assert.equal(press.body.error, rules.ADMINS_OFFER);
      if (offered === 404) assert.equal(press.body.error, rules.NO_PROGRAMME);
      assert.equal(everything(), before);
      assert.equal(world.mail.length, 0);
    });
  }

  test("an admin meets the rule, and the test it asks for first", async () => {
    const press = await api.offer("zach", offerBody([pick("omar")]));
    assert.deepEqual(short(press), [
      409,
      "Send yourself a test of this email first. The page’s “Send a test to me” does it.",
    ]);
    assert.equal((await testThenOffer([pick("omar")])).status, 200);
  });

  test("the gate is one predicate of the caller's role on the programme, and only an admin's role passes it", () => {
    assert.deepEqual(
      ["admin", "lead", "reviewer", null].map((role) => rules.offersFreedPlaces(role)),
      [true, false, false, false],
    );
  });

  test("a view-as session is turned away before anything, by both routes", async () => {
    const before = everything();
    const reads = world.db.stats.reads;
    for (const route of [api.offer, api.test]) {
      const answer = await route("zach", { ...offerBody([pick("omar")]), ...pick("omar") }, { viewAs: true });
      assert.deepEqual(short(answer), [403, "view-as"]);
    }
    assert.equal(world.db.stats.reads, reads);
    assert.equal(everything(), before);
  });

  test("an admin cannot offer a place to themselves, and is told so before anything is read", async () => {
    const reads = world.db.stats.reads;
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("zach")]))), [403, "You can’t decide your own application."]);
    assert.deepEqual(short(await api.test("zach", { ...pick("zach"), replyBy: REPLY_BY })), [
      403,
      "You can’t decide your own application.",
    ]);
    assert.equal(world.db.stats.reads, reads);
  });
});

// ---------------------------------------------------------------------------
// 2. What a request may carry
// ---------------------------------------------------------------------------

describe("what a press may carry, checked before anything is read", () => {
  const P = rules.REQUEST_PROBLEMS;
  const CASES = [
    ["nobody picked", { picks: [], replyBy: REPLY_BY, invitations: 0 }, P.noPicks],
    ["no group", { picks: [{ uid: "omar" }], replyBy: REPLY_BY, invitations: 1 }, P.pick],
    ["a name every object carries", { picks: [pick("constructor")], replyBy: REPLY_BY, invitations: 1 }, P.pick],
    ["somebody twice", { picks: [pick("omar"), pick("omar")], replyBy: REPLY_BY, invitations: 2 }, P.twice],
    ["no day to accept by", { picks: [pick("omar")], invitations: 1 }, P.replyBy],
    ["a day that is not a date", { picks: [pick("omar")], replyBy: "2026-02-31", invitations: 1 }, P.replyBy],
    ["a day that has passed", { picks: [pick("omar")], replyBy: "2026-10-26", invitations: 1 }, P.replyByPast],
    // THE COUNT ON THE BUTTON: "Send 2 invitations" carries 2, and the press
    // is refused when the people picked are not that many.
    ["a button that named another number", { picks: [pick("omar")], replyBy: REPLY_BY, invitations: 2 }, P.count],
    ["a button that named none", { picks: [pick("omar")], replyBy: REPLY_BY }, P.count],
  ];

  for (const [label, body, error] of CASES) {
    test(label, async () => {
      const reads = world.db.stats.reads;
      assert.deepEqual(short(await api.offer("zach", body)), [400, error]);
      assert.equal(world.db.stats.reads, reads, "the body is refused before any document is read");
    });
  }

  test("today is a day to accept by, in London", async () => {
    assert.equal(rules.parseReplyBy("2026-10-27", "2026-10-27").ok, true);
    assert.equal(rules.parseReplyBy("2026-10-26", "2026-10-27").ok, false);
  });

  test("a body that is not JSON, and a test with no day, are refused in words", async () => {
    assert.deepEqual(short(await api.offer("zach", "{not json")), [400, "Invalid JSON body"]);
    assert.deepEqual(short(await api.test("zach", pick("omar"))), [400, P.replyBy]);
  });
});

// ---------------------------------------------------------------------------
// 3. The test comes first
// ---------------------------------------------------------------------------

describe("the test comes first, held on the server", () => {
  test("a test is the first person's real email, to the admin's own address, and it is recorded", async () => {
    const before = read("omar");
    const tested = await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    assert.deepEqual(tested.body, { ok: true, delivery: "sent", subject: SUBJECT, recorded: true });
    assert.deepEqual(
      world.mail.map((message) => [message.to, message.subject, message.kind, message.replyTo]),
      [["zach@example.com", `[TEST] ${SUBJECT}`, "admin-test", "ai-safety@uonsu.com"]],
    );
    const record = world.db.read(FORM_PATH).freedPlaceTests[AGI];
    assert.deepEqual([record.byUid, record.replyBy, typeof record.wording], ["zach", REPLY_BY, "string"]);
    // It tells the person nothing and writes nothing on their application.
    assert.deepEqual(read("omar"), before);
  });

  test("a test for another day to accept by does not unlock this one, and a test for this day does", async () => {
    await api.test("zach", { ...pick("omar"), replyBy: "2026-10-30" });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")]))), [
      409,
      "Your last test asked for an answer by Fri 30 Oct. Send yourself a test with Thu 29 Oct before you send.",
    ]);
    await api.test("zach", { ...pick("george"), replyBy: REPLY_BY });
    // A test with any one person unlocks a press for anybody: the words are
    // the same, and only the slots differ, as on decision day.
    assert.equal((await api.offer("zach", offerBody([pick("omar")]))).status, 200);
  });

  test("a test that reached nobody is not recorded and unlocks nothing", async () => {
    for (const verdict of ["held", "suppressed"]) {
      reset();
      world.verdict = () => verdict;
      const tested = await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
      assert.deepEqual([tested.status, tested.body.delivery, tested.body.recorded], [200, verdict, false]);
      assert.deepEqual(world.db.read(FORM_PATH).freedPlaceTests ?? {}, {});
      assert.equal((await api.offer("zach", offerBody([pick("omar")]))).status, 409);
    }
  });

  test("a test that could not be sent says so and records nothing", async (t) => {
    t.mock.method(console, "error", () => {});
    world.verdict = () => "throw";
    assert.deepEqual(short(await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY })), [
      502,
      "That test could not be sent. Try again in a minute.",
    ]);
    assert.deepEqual(world.db.read(FORM_PATH).freedPlaceTests ?? {}, {});
  });

  test("a test asks what the send asks about the person and the group", async () => {
    assert.deepEqual(short(await api.test("zach", { ...pick("hana"), replyBy: REPLY_BY })), [
      409,
      "Hana Ito didn’t rank AGI Strategy, so its freed places aren’t theirs to be offered.",
    ]);
    assert.deepEqual(short(await api.test("zach", { ...pick("lena"), replyBy: REPLY_BY })), [
      409,
      "Lena Sato’s week doesn’t cover Group B’s time, so the email can’t say they’re free then.",
    ]);
    assert.equal(world.mail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. What an offer writes
// ---------------------------------------------------------------------------

describe("an offer, and all it writes", () => {
  test("the invitation, the offer's own record, the status and the counters, and decision day's result untouched", async () => {
    const before = read("omar");
    const decisionBefore = world.db.read(decisionPath("omar"));
    const countsBefore = counts();
    const pressed = await testThenOffer([pick("omar")]);
    assert.deepEqual(pressed.body, {
      ok: true,
      report: { offered: 1, emailed: 1, held: 0, suppressed: 0, failed: [], unconfirmed: [] },
    });
    const after = read("omar");
    assert.deepEqual(after.result, before.result, "what decision day said stays what it said");
    assert.equal(after.status, "invited");
    assert.deepEqual(after.invitation, {
      programmeId: AGI,
      replyBy: REPLY_BY,
      response: null,
      respondedAt: null,
      lastReminderOn: null,
    });
    assert.deepEqual(after.freedPlace, {
      groupId: GROUP.monday,
      offeredAt: TUESDAY,
      email: "sent",
      emailedAt: TUESDAY,
      emailClaimedAt: null,
    });
    assert.deepEqual(world.db.read(decisionPath("omar")), decisionBefore, "no decision document is written");
    assert.deepEqual(counts(), {
      ...countsBefore,
      "no-offer": countsBefore["no-offer"] - 1,
      invited: countsBefore.invited + 1,
    });
  });

  test("the email is the board's, whole, from records, to the address on the application", async () => {
    await testThenOffer([pick("omar")]);
    const message = world.mail[1];
    assert.deepEqual([message.to, message.subject, message.kind, message.replyTo], [
      "omar@example.com",
      SUBJECT,
      "admissions",
      "ai-safety@uonsu.com",
    ]);
    const email = message.react.props.email;
    assert.deepEqual(email.paragraphs, [
      "On Friday we couldn’t offer you a place this term. Someone has given theirs back, and we’d love you to have it.",
      "It meets on Mondays at 6pm, starting Mon 2 Nov. You told us you’re free on Monday evenings. Once you accept, we’ll email you your group and room.",
      "Please accept by Thu 29 Oct. If you can’t take it, just press No thanks.",
    ]);
    assert.deepEqual(
      email.buttons.map((button) => [button.label, button.href]),
      [
        ["Accept your invitation", `${APP_URL}/applications/${ROUND}`],
        ["No thanks", `${APP_URL}/applications/${ROUND}`],
      ],
    );
    assert.deepEqual(email.signOff, { name: "Claudia", role: "AGI Strategy lead, NAISI" });
    // Never the group's name, its room or a meeting link.
    const text = JSON.stringify(email);
    for (const never of ["Group B", "Room B12", "http://", "meet."]) assert.equal(text.includes(never), false, never);
  });

  test("one line in the log for the press, naming nobody", async () => {
    await testThenOffer([pick("omar"), pick("george")]);
    const rows = auditRows();
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].kind, rows[0].subjectUid, rows[0].runId, rows[0].roundId, rows[0].actorUid, rows[0].detail],
      ["application-freed-places-offered", null, "", ROUND, "zach", "Offered 2 freed places on AGI Strategy, to be accepted by Thu 29 Oct."],
    );
    const text = JSON.stringify(rows[0]);
    for (const name of ["Omar", "Haddad", "George", "Lambert", "omar@", "george@"]) assert.equal(text.includes(name), false, name);
  });

  test("decision day's page still reports what decision day sent", async () => {
    await testThenOffer([pick("omar")]);
    const board = (await api.sendBoard()).body.board;
    assert.ok(board.noOffer.people.some((person) => person.uid === "omar"));
    assert.equal(board.invited.people.some((person) => person.uid === "omar"), false);
  });
});

// ---------------------------------------------------------------------------
// 5. The window, in London
// ---------------------------------------------------------------------------

describe("the window: from the send to the end of week 1 of the run the programme names", () => {
  // The run starts Mon 26 Oct, so week 1 is Mon 26 Oct to Sun 1 Nov, and
  // the window closes at midnight in London at the end of Sun 1 Nov.
  const LAST_SECOND = new Date("2026-11-01T23:59:59Z");
  const CLOSED = new Date("2026-11-02T00:00:00Z");

  test("open in the last second of week 1, and closed at midnight, in London (GMT)", async () => {
    mock.timers.setTime(LAST_SECOND.getTime());
    await api.test("zach", { ...pick("omar"), replyBy: "2026-11-01" });
    assert.equal((await api.offer("zach", offerBody([pick("omar")], "2026-11-01"))).status, 200);

    reset();
    mock.timers.setTime(TUESDAY.getTime());
    await api.test("zach", { ...pick("omar"), replyBy: "2026-11-03" });
    mock.timers.setTime(CLOSED.getTime());
    const before = everything();
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")], "2026-11-03"))), [
      409,
      "Freed places on AGI Strategy could be offered until Sun 1 Nov, the end of week 1. That has passed.",
    ]);
    assert.equal(everything(), before);
  });

  test("in summer time the window closes at 23:00 UTC, which is midnight in London", () => {
    const run = { startDate: "2026-10-01", weekPlan: [{ kind: "week", weekNumber: 1, weekId: "w01" }] };
    const sent = new Date("2026-09-28T09:00:00Z");
    const at = (iso) => rules.freedPlaceWindow(sent, run, new Date(iso)).state;
    assert.equal(at("2026-10-07T22:59:59Z"), "open");
    assert.equal(at("2026-10-07T23:00:00Z"), "closed");
    assert.equal(rules.weekOneLastDay(run), "2026-10-07");
  });

  test("week 1 is the week the run's plan numbers 1, after a break that opens it", () => {
    const run = {
      startDate: "2026-10-26",
      weekPlan: [
        { kind: "break", label: "Induction" },
        { kind: "week", weekNumber: 1, weekId: "w01" },
      ],
    };
    assert.equal(rules.weekOneLastDay(run), "2026-11-08");
  });

  test("no date is typed in code: a run that starts a week later moves the window with it", async () => {
    reset(freedSeed({ run: { startDate: "2026-11-02" } }));
    mock.timers.setTime(CLOSED.getTime());
    assert.equal((await testThenOffer([pick("omar")], "2026-11-03")).status, 200);
  });

  test("before decisions have gone out, with no run, or with no week 1, nothing can be offered", async () => {
    const CASES = [
      [freedSeed({ sent: false }), "Decisions for Autumn 2026 haven’t gone out yet. Freed places are offered after decision day."],
      [
        (() => {
          const seed = freedSeed();
          seed[FORM_PATH].programmes[AGI].runId = null;
          return seed;
        })(),
        "AGI Strategy doesn’t name its course run yet, so the end of its week 1 can’t be worked out. Name the run on the programme’s Settings tab first.",
      ],
      [freedSeed({ run: { startDate: "" } }), "AGI Strategy’s course run has no start date or no week 1 yet, so the end of week 1 can’t be worked out."],
      [freedSeed({ run: { weekPlan: [] } }), "AGI Strategy’s course run has no start date or no week 1 yet, so the end of week 1 can’t be worked out."],
    ];
    for (const [seed, sentence] of CASES) {
      reset(seed);
      assert.deepEqual(short(await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY })), [409, sentence]);
    }
  });

  test("a finished form offers nothing", async () => {
    for (const [round, sentence] of [
      [{ status: "settled" }, "This term is settled, so no outcome can change now."],
      [{ status: "cancelled" }, "This application form was cancelled, so nothing can be offered from it."],
      [{ archived: true }, "This application form is archived, so nothing can be offered from it."],
    ]) {
      const seed = freedSeed();
      Object.assign(seed[FORM_PATH], round);
      reset(seed);
      assert.deepEqual(short(await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY })), [409, sentence]);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Places
// ---------------------------------------------------------------------------

describe("only while a place is free", () => {
  test("with no place free, nothing is offered", async () => {
    // 4 hold a place and 1 is kept for Ines's unanswered invitation.
    reset(freedSeed({ places: 5 }));
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    const before = everything();
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")]))), [409, "AGI Strategy has no freed places to offer."]);
    assert.equal(everything(), before);
  });

  test("never more people than places", async () => {
    reset(freedSeed({ places: 6 }));
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar"), pick("george")]))), [
      409,
      "AGI Strategy has 1 freed place, so 2 people can’t be offered one.",
    ]);
  });

  test("an offer keeps its place while it is unanswered, so the next press has one fewer", async () => {
    await testThenOffer([pick("omar")]);
    await api.test("zach", { ...pick("george"), replyBy: REPLY_BY });
    assert.equal((await api.offer("zach", offerBody([pick("george")]))).status, 200);
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("lena", GROUP.thursday)]))), [
      409,
      "AGI Strategy has no freed places to offer.",
    ]);
  });

  test("two presses at once for the last place: one is offered it, and the other is refused", async () => {
    reset(freedSeed({ places: 6 }));
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    const [first, second] = await Promise.all([
      api.offer("zach", offerBody([pick("omar")])),
      api.offer("zach", offerBody([pick("george")])),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const refused = first.status === 409 ? first : second;
    assert.equal(refused.body.error, "AGI Strategy has no freed places to offer.");
    const offered = ["omar", "george"].filter((uid) => read(uid).invitation !== null);
    assert.equal(offered.length, 1);
    assert.equal(auditRows().length, 1);
  });

  test("a place somebody wrote a moment before the press commits is seen, and the press starts again", async () => {
    reset(freedSeed({ places: 6 }));
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    // Somebody else's offer of the last place lands while this press runs.
    world.db.beforeCommit = () =>
      world.db.poke(applicationPath("george"), {
        status: "invited",
        invitation: { programmeId: AGI, replyBy: REPLY_BY, response: null, respondedAt: null, lastReminderOn: null },
        freedPlace: { groupId: GROUP.monday, offeredAt: TUESDAY, email: "sent", emailedAt: TUESDAY, emailClaimedAt: null },
      });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")]))), [409, "AGI Strategy has no freed places to offer."]);
    assert.equal(read("omar").invitation, null);
  });
});

// ---------------------------------------------------------------------------
// 7. Who can be offered one
// ---------------------------------------------------------------------------

describe("only to a pooled applicant told “No offer this time” who ranked the programme", () => {
  const CASES = [
    ["hana", GROUP.monday, "Hana Ito didn’t rank AGI Strategy, so its freed places aren’t theirs to be offered."],
    ["kai", GROUP.monday, "AGI Strategy declined Kai Moreau, so they aren’t offered its place."],
    ["zed", GROUP.monday, "Zed Olsen wasn’t told “No offer this time”, so a freed place isn’t theirs to be offered."],
    ["amara", GROUP.monday, "Amara Okafor wasn’t told “No offer this time”, so a freed place isn’t theirs to be offered."],
    ["ines", GROUP.monday, "Ines Carvalho wasn’t told “No offer this time”, so a freed place isn’t theirs to be offered."],
    ["nina", GROUP.monday, "Nina Petrova is no longer in the term: they withdrew, or gave a place or an invitation back."],
    ["lena", GROUP.monday, "Lena Sato’s week doesn’t cover Group B’s time, so the email can’t say they’re free then."],
    ["rory", GROUP.monday, "Rory Quinn’s week doesn’t cover Group B’s time, so the email can’t say they’re free then."],
  ];
  for (const [uid, groupId, error] of CASES) {
    test(`${CAST[uid].displayName}: refused, and nothing written`, async () => {
      await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
      const before = everything();
      assert.deepEqual(short(await api.offer("zach", offerBody([pick(uid, groupId)]))), [409, error]);
      assert.equal(everything(), before);
    });
  }

  test("one refusal refuses the whole press: nobody else picked with them is offered anything", async () => {
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    assert.equal((await api.offer("zach", offerBody([pick("omar"), pick("hana")]))).status, 409);
    assert.equal(read("omar").invitation, null);
  });

  test("a second offer to the same person is refused, whatever became of the first", async () => {
    await testThenOffer([pick("omar")]);
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")]))), [409, "Omar Haddad already has an invitation to answer."]);
    await api.reply("omar", { reply: "accept-invitation" });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")]))), [409, "Omar Haddad already holds a place."]);
    reset();
    await testThenOffer([pick("omar")]);
    await api.reply("omar", { reply: "decline-invitation", reason: { kind: "too-much-on" } });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")]))), [
      409,
      "Omar Haddad is no longer in the term: they withdrew, or gave a place or an invitation back.",
    ]);
  });

  test("somebody with no application on the form is not found", async () => {
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("nobody")]))), [
      404,
      "Nobody by that id has an application on this form.",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 8. The group whose time the email names
// ---------------------------------------------------------------------------

describe("the group whose time the email names", () => {
  test("a group with no time, or of another run, cannot be named", async () => {
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    const error = "That group isn’t one of AGI Strategy’s run’s groups with a weekly time.";
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar", GROUP.unset)]))), [409, error]);
    world.db.seed("courseGroups/elsewhere__grp9", { ...world.db.read(`courseGroups/${GROUP.monday}`), runId: RUN.tais });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar", "elsewhere__grp9")]))), [409, error]);
    world.db.poke(`courseGroups/${GROUP.monday}`, { archived: true });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")]))), [409, error]);
  });

  test("a full group is not promised, counting offers already waiting on a seat in it", async () => {
    world.db.poke(`courseGroups/${GROUP.monday}`, { capacity: 8, memberCount: 8 });
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar")]))), [409, "Group B has no free seat."]);

    reset();
    world.db.poke(`courseGroups/${GROUP.monday}`, { capacity: 8, memberCount: 7 });
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("omar"), pick("george")]))), [
      409,
      "Group B has 1 free seat, not 2.",
    ]);
    assert.equal((await api.offer("zach", offerBody([pick("omar")]))).status, 200);
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("george")]))), [409, "Group B has no free seat."]);
  });

  test("a group with no session still to come cannot be named: the email would not be whole", async () => {
    // Every session of the run's two weeks is over by Wed 11 Nov, after week 1 too.
    reset(freedSeed({ run: { weekPlan: [{ kind: "week", weekNumber: 1, weekId: "w01" }] } }));
    mock.timers.setTime(new Date("2026-10-31T12:00:00Z").getTime());
    assert.deepEqual(short(await api.test("zach", { ...pick("omar"), replyBy: "2026-10-31" })), [
      409,
      "The email to Omar Haddad can’t be written whole, so nothing was sent: Group B has no session still to come.",
    ]);
    assert.equal(world.mail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 9. The person answers on their own page
// ---------------------------------------------------------------------------

describe("the person answers with decision day's Accept and No thanks, through the same route", () => {
  test("Accept: the place is theirs, and the counters move as decision day's do", async () => {
    await testThenOffer([pick("omar")]);
    const before = counts();
    const answered = await api.reply("omar", { reply: "accept-invitation" });
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.deepEqual([answered.body.application.status, answered.body.application.invitation.response], ["accepted", "accepted"]);
    assert.deepEqual(counts(), { ...before, invited: before.invited - 1, accepted: before.accepted + 1 });
    // Their place is held: the second free place is still the only one left.
    await api.test("zach", { ...pick("george"), replyBy: REPLY_BY });
    assert.equal((await api.offer("zach", offerBody([pick("george")]))).status, 200);
    assert.deepEqual(short(await api.offer("zach", offerBody([pick("lena", GROUP.thursday)]))), [409, "AGI Strategy has no freed places to offer."]);
  });

  test("No thanks: the place is free again, the reason is kept, and the counters move", async () => {
    await testThenOffer([pick("omar")]);
    const before = counts();
    const answered = await api.reply("omar", { reply: "decline-invitation", reason: { kind: "times" } });
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.deepEqual([read("omar").status, read("omar").releaseReason], ["withdrawn", { kind: "times", other: "" }]);
    assert.deepEqual(counts(), { ...before, invited: before.invited - 1, withdrawn: (before.withdrawn ?? 0) + 1 });
  });

  test("a late yes still counts, as on decision day", async () => {
    await testThenOffer([pick("omar")]);
    mock.timers.setTime(new Date("2026-10-30T12:00:00Z").getTime());
    assert.equal((await api.reply("omar", { reply: "accept-invitation" })).status, 200);
    assert.equal(read("omar").invitation.response, "accepted");
  });

  test("a waiting account is approved on accepting, in the name of the admin who sent the decisions", async () => {
    world.db.poke("users/omar", { role: "pending" });
    await testThenOffer([pick("omar")]);
    await api.reply("omar", { reply: "accept-invitation" });
    assert.deepEqual([world.db.read("users/omar").role, world.db.read("users/omar").approvedBy], ["member", "zach"]);
  });
});

// ---------------------------------------------------------------------------
// 10. Emails that do not go
// ---------------------------------------------------------------------------

describe("what became of each email, and the ones still to go", () => {
  test("held and suppressed are said, and never sent again", async () => {
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    world.verdict = (args) => (args.to === "omar@example.com" ? "held" : args.to === "george@example.com" ? "suppressed" : "sent");
    const pressed = await api.offer("zach", offerBody([pick("omar"), pick("george")]));
    assert.deepEqual(pressed.body.report, { offered: 2, emailed: 0, held: 1, suppressed: 1, failed: [], unconfirmed: [] });
    assert.deepEqual([read("omar").freedPlace.email, read("george").freedPlace.email], ["held", "suppressed"]);
    assert.deepEqual(short(await api.offer("zach", { owedOnly: true, emails: 1 })), [
      409,
      "The emails still to go have changed since this page loaded: there are now 0, not 1. Reload the page and check again.",
    ]);
  });

  test("an email known not to have gone is still to go, and the smaller press sends it once", async (t) => {
    t.mock.method(console, "error", () => {});
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    world.verdict = () => "throw";
    const pressed = await api.offer("zach", offerBody([pick("omar")]));
    assert.deepEqual(pressed.body.report.failed, ["Omar Haddad"]);
    assert.equal(read("omar").freedPlace.email, "owed");
    // The offer stands: they can read it on their own page.
    assert.equal(read("omar").status, "invited");

    world.verdict = null;
    const sent = await api.offer("zach", { owedOnly: true, emails: 1 });
    assert.deepEqual(sent.body.report, { offered: 0, emailed: 1, held: 0, suppressed: 0, failed: [], unconfirmed: [] });
    assert.equal(read("omar").freedPlace.email, "sent");
    assert.deepEqual(short(await api.offer("zach", { owedOnly: true, emails: 1 })), [
      409,
      "The emails still to go have changed since this page loaded: there are now 0, not 1. Reload the page and check again.",
    ]);
  });

  test("an email nobody can vouch for is never sent again", async (t) => {
    t.mock.method(console, "error", () => {});
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    world.verdict = () => "cut-off";
    const pressed = await api.offer("zach", offerBody([pick("omar")]));
    assert.deepEqual(pressed.body.report.unconfirmed, ["Omar Haddad"]);
    assert.equal(read("omar").freedPlace.email, "unconfirmed");
  });

  test("the press for emails still to go asks who may again inside each claim, of the form it reads", async (t) => {
    t.mock.method(console, "error", () => {});
    await api.test("zach", { ...pick("omar"), replyBy: REPLY_BY });
    world.verdict = () => "throw";
    await api.offer("zach", offerBody([pick("omar")]));
    assert.equal(read("omar").freedPlace.email, "owed");
    world.verdict = null;
    world.mail.length = 0;
    // The programme leaves the form while the first claim is being taken: the
    // claim runs again, reads the form again, and finds nobody may send it.
    world.db.beforeCommit = () => world.db.poke(FORM_PATH, { programmeIds: [TAIS] });
    assert.deepEqual(short(await api.offer("zach", { owedOnly: true, emails: 1 })), [403, rules.ADMINS_OFFER]);
    assert.deepEqual(world.mail, []);
    assert.equal(read("omar").freedPlace.email, "owed");
  });

  test("the press for emails still to go is an admin's, and asks for a test of the wording as it is", async () => {
    assert.deepEqual(short(await api.offer("claudia", { owedOnly: true, emails: 1 })), [403, rules.ADMINS_OFFER]);
    assert.deepEqual(short(await api.offer("zach", { owedOnly: true, emails: 1 })), [
      409,
      "This email’s wording has changed since your last test. Send yourself a test again before you send.",
    ]);
    assert.deepEqual(short(await api.offer("zach", { owedOnly: true })), [400, rules.REQUEST_PROBLEMS.emails]);
  });
});

// ---------------------------------------------------------------------------
// 11. The daily reminder leaves a freed place alone
// ---------------------------------------------------------------------------

describe("the invitation reminder job leaves a freed place alone", () => {
  const atTenPastTen = new Date("2026-10-28T10:10:00Z");
  const context = (now) => ({
    now,
    maxLateHours: 8,
    maxPerTick: 100,
    budget: { expired: () => false },
    log: () => {},
  });

  test("the rule names the reason", async () => {
    await testThenOffer([pick("omar")]);
    const application = normalise.normaliseApplication(`${ROUND}__omar`, read("omar"));
    assert.deepEqual(reminders.invitationReminderDue(application, atTenPastTen), { due: false, why: "freed-place" });
  });

  test("a run of the job reminds decision day's invitation and not the freed place", async () => {
    await testThenOffer([pick("omar")]);
    // Ines's own invitation, from decision day, due later than the day it ran.
    world.db.poke(applicationPath("ines"), { "invitation.replyBy": "2026-10-30" });
    world.mail.length = 0;
    mock.timers.setTime(atTenPastTen.getTime());
    const result = await job.handler(context(atTenPastTen));
    assert.equal(result.note, "1 sent");
    assert.deepEqual(world.mail.map((message) => message.to), ["ines@example.com"]);
    assert.equal(read("omar").invitation.lastReminderOn, null);
  });

  test("the job still ships switched off", () => {
    assert.equal(job.enabledByDefault, false);
  });
});
