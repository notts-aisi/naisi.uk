/**
 * Who finished, the record itself (board en-finish, Q8): its words, the two
 * bodies its routes take, the run's end, the suggestion at the rule's edges,
 * each person's record, and the exercises beside it.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE BOARD'S WORDS, exactly: the sentence over the list with the rule's
 *     slot filled, the counts, a person's line ("Excused in week 2. Missed
 *     weeks 4, 5 and 6." with two parts, no full stop with one), and the
 *     note under the list for a group whose session was cancelled.
 *  2. THE BODIES are checked before anything is read, with a sentence a
 *     person can act on.
 *  3. THE RUN'S END is its last session's end, a cancelled session left out,
 *     and nothing is over before then.
 *  4. THE SUGGESTION is "came" (present, late and left early) against the
 *     rule, at the rule's edges; excused never counts as came; a cancelled
 *     session counts for nobody; no rule ticks nobody.
 *  5. EACH PERSON'S RECORD: finished or not, who decided (the lead or the
 *     suggestion) and when, none for somebody who left or before the end.
 *  6. THE EXERCISES set to a group (its own copy of a week where it has one,
 *     published weeks only) and what each person sent.
 *
 * Real: the libraries. Faked: the Admin SDK handle (the in-memory store) and
 * the clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  BEFORE,
  C,
  END,
  LAST_ENDS,
  RULE,
  RUN,
  decision,
  decisionPath,
  finishSeed,
  makeFinishWorld,
  rulePath,
} from "./lib/finishWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: END });

const made = await makeFinishWorld("__finishRecord");
const { world, reset, lib } = made;
const words = lib.words;

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
});

/** The run's records, as the Overview reads them. */
const records = () => lib.attendance.readRunRecords(world.courseDb, RUN.agi);

/** The section as `who` sees it, at the clock's instant. */
async function section(viewer = { isAdmin: false, uid: "claudia" }) {
  return lib.who.loadWhoFinished(world.courseDb, await records(), viewer, new Date());
}

/** name -> finished, from the section's rows. */
const ticks = (model) => Object.fromEntries(model.rows.map((row) => [row.name.split(" ")[0], row.finished]));

// ---------------------------------------------------------------------------
// 1. Words
// ---------------------------------------------------------------------------

describe("1. the board's words", () => {
  test("the sentence over the list fills the rule's slot, and says only the lead and admins see it", () => {
    assert.equal(
      words.ruleSentence(4, 6),
      "We’ve ticked everyone who came to at least 4 of 6 sessions. Change any you disagree with. Only you and admins see this rule.",
    );
    assert.equal(words.ruleSlot(4, 6), "at least 4 of 6");
    assert.equal(words.countsLine(28, 3), "28 finished · 3 not");
    assert.equal(words.ofLine(2, 6), "2 of 6");
  });

  test("a person's line: two parts are two sentences, one stands alone with no full stop", () => {
    assert.equal(words.missedLine([2], [4, 5, 6]), "Excused in week 2. Missed weeks 4, 5 and 6.");
    assert.equal(words.missedLine([], [2, 3, 5]), "Missed weeks 2, 3 and 5");
    assert.equal(words.missedLine([1, 3], []), "Excused in weeks 1 and 3");
    assert.equal(words.missedLine([], [6]), "Missed week 6");
    assert.equal(words.missedLine([], []), null);
  });

  test("the note under the list for a group whose session did not happen", () => {
    assert.equal(
      words.cancelledNote("Group B", 5, ["Tue 24 Nov"]),
      "Group B met 5 times. Its session on Tue 24 Nov was cancelled, and it doesn’t count against anyone.",
    );
    assert.equal(
      words.cancelledNote("Group B", 4, ["Tue 24 Nov", "Tue 1 Dec"]),
      "Group B met 4 times. Its sessions on Tue 24 Nov and Tue 1 Dec were cancelled, and they don’t count against anyone.",
    );
    assert.match(words.cancelledNote("Group B", 1, ["Tue 24 Nov"]), /^Group B met once\./);
  });

  test("a change is marked as the viewer's own, by name, or plainly once its maker is gone", () => {
    assert.equal(words.changedByLine("claudia", "claudia", "Claudia"), "Changed by you");
    assert.equal(words.changedByLine("zach", "claudia", "Zach"), "Changed by Zach");
    assert.equal(words.changedByLine(null, "claudia", null), "Changed");
    assert.equal(words.changedByLine("gone", "claudia", null), "Changed");
  });

  test("a member is told they finished, or that the programme has ended, and never a number", () => {
    assert.equal(words.youFinished("AGI Strategy"), "You finished AGI Strategy.");
    assert.equal(words.hasEnded("AGI Strategy"), "AGI Strategy has ended.");
    assert.match(words.ENDED_SUB, /^Thanks for being part of it\./);
    assert.deepEqual([words.endedWord(true), words.endedWord(false)], ["Finished", "Ended"]);
    for (const line of [words.youFinished("X"), words.hasEnded("X"), words.FINISHED_SUB, words.ENDED_SUB]) {
      assert.doesNotMatch(line, /\d/, line);
    }
  });

  test("no dash and no word the house does not use, in any of it", () => {
    const all = Object.values(words)
      .flatMap((value) => (typeof value === "string" ? [value] : typeof value === "function" ? [value.toString()] : []))
      .join("\n");
    assert.doesNotMatch(all, /[–—]/);
    assert.doesNotMatch(all, /attendance threshold|dropped out|waitlist|rejected|collate/i);
  });
});

// ---------------------------------------------------------------------------
// 2. The bodies
// ---------------------------------------------------------------------------

describe("2. the two bodies", () => {
  test("the rule: a whole number from 1 to 60, or null to clear it", () => {
    const { parseFinishRule } = lib.model;
    assert.deepEqual(parseFinishRule({ atLeast: 4 }), { ok: true, value: { atLeast: 4 } });
    assert.deepEqual(parseFinishRule({ atLeast: null }), { ok: true, value: { atLeast: null } });
    assert.deepEqual(parseFinishRule({ atLeast: 60 }), { ok: true, value: { atLeast: 60 } });
    for (const bad of [{ atLeast: 0 }, { atLeast: 61 }, { atLeast: 4.5 }, { atLeast: "4" }, { atLeast: -1 }]) {
      const parsed = parseFinishRule(bad);
      assert.equal(parsed.ok, false, JSON.stringify(bad));
      assert.equal(parsed.error, "The number of sessions has to be a whole number from 1 to 60.");
    }
    for (const bad of [{}, null, [], "4"]) assert.equal(parseFinishRule(bad).ok, false, JSON.stringify(bad));
  });

  test("a switch: whose, and which way, with no path or separator in the uid", () => {
    const { parseFinishDecision } = lib.model;
    assert.deepEqual(parseFinishDecision({ uid: "bea", finished: true }), { ok: true, value: { uid: "bea", finished: true } });
    for (const uid of ["", "a/b", "a__b", ".", "..", "x".repeat(129), 7, null]) {
      assert.deepEqual(parseFinishDecision({ uid, finished: true }), { ok: false, error: "Say whose switch this is." }, String(uid));
    }
    assert.deepEqual(parseFinishDecision({ uid: "bea", finished: "yes" }), { ok: false, error: "Say whether they finished: true or false." });
    assert.equal(parseFinishDecision(null).ok, false);
  });

  test("a stored document is read only as what it says it is, its id built from its own fields", () => {
    const { normalizeFinishRule, normalizeFinishDecision } = lib.model;
    assert.deepEqual(normalizeFinishRule(RUN.agi, RULE(4, null)), { runId: RUN.agi, atLeast: 4, setAt: null });
    assert.equal(normalizeFinishRule(RUN.agi, { ...RULE(4), kind: "person" }), null);
    assert.equal(normalizeFinishRule("another-run", RULE(4)), null);
    assert.equal(normalizeFinishRule(RUN.agi, RULE(0)), null);
    const read = normalizeFinishDecision(`${RUN.agi}__bea`, decision("bea", true));
    assert.equal(read.finished, true);
    assert.equal(read.byUid, "claudia");
    assert.equal(normalizeFinishDecision(`${RUN.agi}__dev`, decision("bea", true)), null);
    assert.equal(normalizeFinishDecision(`${RUN.agi}__bea`, { ...decision("bea", true), finished: "yes" }), null);
    assert.equal(normalizeFinishDecision(`${RUN.agi}__bea`, { ...decision("bea", true), kind: "rule" }), null);
  });
});

// ---------------------------------------------------------------------------
// 3. The run's end
// ---------------------------------------------------------------------------

describe("3. the run's end", () => {
  test("is the end of its last session, Group C's on Wed 9 Dec, and it is the most any group meets", async () => {
    const read = await records();
    const end = lib.record.runEndOf(read.run, read.groups, END);
    assert.deepEqual(
      [end.lastDateKey, end.lastDay, end.endsAt.toISOString(), end.over, end.sessions],
      ["2026-12-09", "Wed 9 Dec", LAST_ENDS.toISOString(), true, 6],
    );
  });

  test("is not over before that session ends, nor a minute before, and is at its end", async () => {
    const read = await records();
    assert.equal(lib.record.runEndOf(read.run, read.groups, BEFORE).over, false);
    assert.equal(lib.record.runEndOf(read.run, read.groups, new Date(LAST_ENDS.getTime() - 60_000)).over, false);
    assert.equal(lib.record.runEndOf(read.run, read.groups, LAST_ENDS).over, true);
  });

  test("a last session that was cancelled is no meeting: the run ends on the one before", async () => {
    world.db.poke(`courseGroups/${C}`, {
      "sessionChanges.w06": { kind: "cancelled", reason: "Snow.", dateKey: "2026-12-09", byUid: "tom", at: new Date() },
    });
    const read = await records();
    const end = lib.record.runEndOf(read.run, read.groups, BEFORE);
    assert.deepEqual([end.lastDay, end.over], ["Tue 8 Dec", true]);
  });

  test("a run whose groups have no day or time is never over", async () => {
    const read = await records();
    const undated = read.groups.map((group) => ({ ...group, session: { ...group.session, startTimeLocal: "" } }));
    const end = lib.record.runEndOf(read.run, undated, END);
    assert.deepEqual([end.lastDay, end.over], [null, false]);
  });
});

// ---------------------------------------------------------------------------
// 4. The suggestion
// ---------------------------------------------------------------------------

describe("4. the suggestion, at the rule's edges", () => {
  test("at least 4: whoever came to 4 is ticked (Dev, late once), 3 is not (Tariq); excused is never came", async () => {
    world.db.seed(rulePath, RULE(4));
    assert.deepEqual(ticks(await section()), {
      Freya: false,
      Bea: false,
      Farah: false,
      Kofi: false,
      Tariq: false,
      Dev: true,
      Chloe: true,
      Yasmin: true,
      Amara: true,
      Hamza: true,
    });
  });

  test("at least 3 ticks the three who came to 3, Kofi among them though two of his five were excused", async () => {
    world.db.seed(rulePath, RULE(3));
    const model = await section();
    assert.deepEqual(
      model.rows.filter((row) => row.finished).map((row) => row.name.split(" ")[0]).sort(),
      ["Amara", "Chloe", "Dev", "Farah", "Hamza", "Kofi", "Tariq", "Yasmin"],
    );
    assert.equal(model.counts, "8 finished · 2 not");
  });

  test("at least 5: Group B's cancelled session counts for nobody, so Chloe's 5 of 5 is enough and Dev's 4 is not", async () => {
    world.db.seed(rulePath, RULE(5));
    const tick = ticks(await section());
    assert.deepEqual([tick.Chloe, tick.Yasmin, tick.Dev, tick.Amara], [true, true, false, true]);
  });

  test("at least 6, the most there is, ticks only those who came to every session their group held", async () => {
    world.db.seed(rulePath, RULE(6));
    assert.deepEqual(
      (await section()).rows.filter((row) => row.finished).map((row) => row.name.split(" ")[0]).sort(),
      ["Amara", "Hamza"],
    );
  });

  test("with no rule nobody is ticked, and the sentence says so without a number", async () => {
    const model = await section();
    assert.equal(model.counts, "0 finished · 10 not");
    assert.equal(model.sentence, words.NO_RULE_SENTENCE);
    assert.doesNotMatch(model.sentence, /\d/);
  });
});

// ---------------------------------------------------------------------------
// 5. The record
// ---------------------------------------------------------------------------

describe("5. each person's record", () => {
  test("the suggestion decides where the lead did not, dated the later of the last session and the rule", async () => {
    world.db.seed(rulePath, RULE(4, new Date("2026-11-30T09:00:00Z")));
    const read = await records();
    const finishing = await lib.record.readFinishing(world.courseDb, RUN.agi);
    const end = lib.record.runEndOf(read.run, read.groups, END);
    const row = (uid) =>
      lib.attendance
        .listGroups(read, { isAdmin: true }, END, lib.attendance.weeksOf(read))
        .flatMap((listed) => listed.people)
        .find((person) => person.row.uid === uid).row;
    const dev = lib.record.recordOf(row("dev"), finishing, end);
    assert.deepEqual([dev.finished, dev.suggested, dev.decidedBy, dev.at.toISOString()], [true, true, "suggestion", LAST_ENDS.toISOString()]);
    // A rule set after the end dates the suggestion from when it was set.
    world.db.seed(rulePath, RULE(4, new Date("2026-12-10T08:00:00Z")));
    const later = lib.record.recordOf(row("dev"), await lib.record.readFinishing(world.courseDb, RUN.agi), end);
    assert.equal(later.at.toISOString(), "2026-12-10T08:00:00.000Z");
  });

  test("the lead decides where they disagreed: Kofi ticked at 3, Dev unticked at 4, each with who and when", async () => {
    world.db.seed(rulePath, RULE(4));
    world.db.seed(decisionPath("kofi"), decision("kofi", true, "claudia"));
    world.db.seed(decisionPath("dev"), decision("dev", false, "zach"));
    const read = await records();
    const finishing = await lib.record.readFinishing(world.courseDb, RUN.agi);
    const end = lib.record.runEndOf(read.run, read.groups, END);
    const people = lib.attendance.listGroups(read, { isAdmin: true }, END, lib.attendance.weeksOf(read)).flatMap((l) => l.people);
    const of = (uid) => lib.record.recordOf(people.find((p) => p.row.uid === uid).row, finishing, end);
    assert.deepEqual([of("kofi").finished, of("kofi").suggested, of("kofi").decidedBy, of("kofi").decision.byUid], [true, false, "lead", "claudia"]);
    assert.deepEqual([of("dev").finished, of("dev").suggested, of("dev").decidedBy, of("dev").decision.byUid], [false, true, "lead", "zach"]);
    assert.equal(of("kofi").at.toISOString(), "2026-12-10T09:00:00.000Z");
  });

  test("somebody who left has no record at all, and nobody has one before the end", async () => {
    world.db.seed(rulePath, RULE(1));
    world.db.seed(decisionPath("sam"), decision("sam", true));
    const read = await records();
    const finishing = await lib.record.readFinishing(world.courseDb, RUN.agi);
    const people = lib.attendance.listGroups(read, { isAdmin: true }, END, lib.attendance.weeksOf(read)).flatMap((l) => l.people);
    const sam = people.find((p) => p.row.uid === "sam").row;
    assert.equal(lib.record.recordOf(sam, finishing, lib.record.runEndOf(read.run, read.groups, END)), null);
    const amara = people.find((p) => p.row.uid === "amara").row;
    assert.equal(lib.record.recordOf(amara, finishing, lib.record.runEndOf(read.run, read.groups, BEFORE)), null);
  });

  test("a decision stored for another run, or a document of another kind, is no decision here", async () => {
    world.db.seed(rulePath, RULE(4));
    world.db.seed(`courseFinishing/another-run__bea`, { ...decision("bea", true), runId: "another-run" });
    world.db.seed(`courseFinishing/${RUN.agi}__x`, { kind: "person", runId: RUN.agi, uid: "bea", finished: true });
    const finishing = await lib.record.readFinishing(world.courseDb, RUN.agi);
    assert.equal(finishing.decisions.size, 0);
    assert.equal(finishing.rule.atLeast, 4);
  });
});

// ---------------------------------------------------------------------------
// 6. Exercises
// ---------------------------------------------------------------------------

describe("6. the exercises beside each person", () => {
  test("what each sent of what their group was set: Group C's own week 6 sets two", async () => {
    const tallies = await lib.who.readExerciseTallies(world.courseDb, await records());
    const got = Object.fromEntries([...tallies].map(([uid, tally]) => [uid, `${tally.done} of ${tally.of}`]));
    assert.equal(got.amara, "6 of 6", "an answer to an exercise no week sets counted");
    assert.equal(got.tariq, "0 of 6", "a draft never sent counted");
    assert.equal(got.hamza, "6 of 7");
    assert.equal(got.bea, "2 of 6");
    assert.equal(got.kofi, "6 of 6");
  });

  test("a week nobody could open sets nothing", async () => {
    world.db.poke(`courseRuns/${RUN.agi}/weeks/w05`, { published: false });
    const tallies = await lib.who.readExerciseTallies(world.courseDb, await records());
    assert.deepEqual([tallies.get("amara"), tallies.get("hamza")], [{ done: 5, of: 5 }, { done: 5, of: 6 }]);
  });
});
