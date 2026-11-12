/**
 * Covering a register, as the pages ask it: which weeks offer the ways to
 * take a register in a facilitator's place, which week a group's page tells
 * its admins and lead about first, the words for whose place is taken and
 * who set each line, the check before Finish, and what "It didn't happen"
 * adds to "What will happen".
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE WAYS A WEEK OFFERS: none once its register is finished, for a
 *     session called off or with no day; only the register itself once a
 *     facilitator has started it; "It didn't happen" only once the session
 *     has started. The notice is about the latest started week nobody has
 *     started, finished or taken.
 *  2. THE WORDS for whose place: one facilitator, several, none; the
 *     reader's own cover, a facilitator arriving late (never a word about
 *     their own record), an admin or a lead before the first line, helping.
 *  3. WHO SET A LINE: "Set by you, 4:14pm", "Zach, 4:14pm", "Set before
 *     the session"; nothing for a register with no stamp.
 *  4. THE CHECK BEFORE FINISH: in the room, online, absent, excused, each
 *     with its count and names, nobody before they joined, and nothing for a
 *     row nobody is in.
 *  5. IT DIDN'T HAPPEN: the lines "What will happen" gains, from the change
 *     route's preview, and never "shows as late".
 *  6. THE BUTTON THAT GIVES A SESSION says what it sends and to how many.
 *
 * Every time prints through the house clock, in London.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const model = await loadTs("lib/courses/registerCover/pageModel.ts");
const words = await loadTs("lib/courses/registerCover/pageWords.ts");

/** A week's register facts, open and untouched unless told otherwise. */
const week = (over = {}) => ({
  weekNumber: 2,
  started: true,
  cancelled: false,
  dated: true,
  finished: false,
  heldFalse: false,
  facilitatorStarted: false,
  covered: false,
  taken: false,
  ...over,
});

describe("1. the ways a week offers, and the week the notice is about", () => {
  test("a started week nobody has started: all three; a week still to come: two, no It didn't happen", () => {
    assert.deepEqual(model.coverChoicesOf(week()), { offered: true, covering: true, someoneElse: true, didNotHappen: true, helpOnly: false });
    assert.deepEqual(model.coverChoicesOf(week({ started: false })), {
      offered: true,
      covering: true,
      someoneElse: true,
      didNotHappen: false,
      helpOnly: false,
    });
  });

  test("finished, called off, said not to have happened, or undated: nothing; a facilitator started it: the register itself", () => {
    const none = { offered: false, covering: false, someoneElse: false, didNotHappen: false, helpOnly: false };
    for (const over of [{ finished: true }, { cancelled: true }, { heldFalse: true }, { dated: false }]) {
      assert.deepEqual(model.coverChoicesOf(week(over)), none, JSON.stringify(over));
    }
    assert.deepEqual(model.coverChoicesOf(week({ facilitatorStarted: true })), { ...none, helpOnly: true });
    assert.deepEqual(model.coverChoicesOf(week({ facilitatorStarted: true, finished: true })), none, "a finished register helps nobody");
  });

  test("the notice: the latest started week nobody started, finished or took; none when there is none", () => {
    assert.equal(
      model.noticeWeekOf([week({ weekNumber: 1 }), week({ weekNumber: 2 }), week({ weekNumber: 3, started: false })]),
      2,
    );
    assert.equal(model.noticeWeekOf([week({ weekNumber: 1 }), week({ weekNumber: 2, covered: true })]), 1, "a week somebody took is not the notice's");
    assert.equal(model.noticeWeekOf([week({ weekNumber: 1, facilitatorStarted: true })]), null);
    assert.equal(model.noticeWeekOf([week({ weekNumber: 1, taken: true })]), null, "a register somebody saved lines on has been started");
    assert.equal(model.noticeWeekOf([week({ weekNumber: 1, finished: true }), week({ weekNumber: 2, started: false })]), null);
    assert.equal(model.noticeWeekOf([]), null);
  });
});

describe("2. the words for whose place is taken", () => {
  test("the notice, for one facilitator, several and none", () => {
    assert.equal(words.notStartedTitle(["Josh"], 2), "Josh hasn’t started week 2’s register");
    assert.equal(words.notStartedTitle(["Priya", "Sam"], 2), "Priya and Sam haven’t started week 2’s register");
    assert.equal(words.notStartedTitle([], 2), "Nobody has started week 2’s register");
    assert.equal(words.takeInPlaceWords(["Josh"]), "Take the register in Josh’s place");
    assert.equal(words.takeInPlaceWords([]), "Take the register");
    assert.equal(
      words.whicheverWords(["Josh"]),
      "Whichever you choose, the register records who took it, and the reminders to Josh about it stop.",
    );
    assert.equal(words.whicheverWords([]), "Whichever you choose, the register records who took it.");
    assert.equal(
      words.notStartedLine({ groupName: "Group E", dateKey: "2026-11-10", hhmm: "16:00", room: "Monica Partridge E05", ended: false, firstNames: ["Josh"] }),
      "Group E’s session began at 4pm in Monica Partridge E05, and Josh hasn’t started its register. Admins and leads can take it from here, for this session or any past one.",
    );
    assert.equal(
      words.notStartedLine({ groupName: "Group E", dateKey: "2026-11-03", hhmm: "16:00", room: "", ended: true, firstNames: [] }),
      "Group E’s session was Tue 3 Nov, 4pm, and nobody has started its register. Admins and leads can take it from here, for this session or any past one.",
    );
  });

  test("how long ago it started, in the house clock", () => {
    const start = new Date("2026-11-10T16:00:00Z");
    assert.equal(words.startedAgoWords(start, new Date("2026-11-10T16:12:00Z")), "Started 12 minutes ago");
    assert.equal(words.startedAgoWords(start, new Date("2026-11-10T16:01:30Z")), "Started 1 minute ago");
    assert.equal(words.startedAgoWords(start, new Date("2026-11-10T19:30:00Z")), "Started 3 hours ago");
    assert.equal(words.startedAgoWords(start, new Date("2026-11-12T09:00:00Z")), "Started on Tue 10 Nov");
  });

  test("the sheet: today or the day, and the question", () => {
    assert.equal(words.sheetTitle("Group E", "2026-11-10", "16:00", "2026-11-10"), "Group E, today at 4pm");
    assert.equal(words.sheetTitle("Group E", "2026-11-03", "16:00", "2026-11-10"), "Group E, Tue 3 Nov at 4pm");
    assert.equal(words.sheetQuestion(["Josh Bennett"], true), "Josh Bennett hasn’t started the register. What’s happening?");
    assert.equal(words.sheetQuestion(["Josh Bennett"], false), "If Josh Bennett can’t make it, choose who takes the register.");
    assert.equal(
      words.sheetQuestion(["Josh Bennett"], true, true),
      "Its register has lines on it and isn’t finished. What’s happening?",
      "a register somebody saved lines on is said to be unstarted",
    );
    assert.equal(words.didntHappenLine(2), "Nobody ran it. You choose what happens to week 2 next.");
  });

  const josh = { uid: "josh", name: "Josh Bennett" };
  const zach = { uid: "zach", name: "Zach Levin" };

  test("the reader's own cover: in whose place, who it will say took it, whose reminders stop", () => {
    const cover = { kind: "self", by: zach, at: "2026-11-10T16:12:00Z", covering: [josh], live: true, yours: true };
    assert.equal(
      words.placeLine({ cover, facilitators: [josh], readerFacilitates: false, facilitatorStarted: false, finished: false }),
      "You’re taking this in place of Josh Bennett. The register will say Zach took it, and the reminders to Josh about it stop.",
    );
    assert.equal(
      words.placeLine({ cover: { ...cover, covering: [] }, facilitators: [], readerFacilitates: false, facilitatorStarted: false, finished: false }),
      "You’re taking this register. It will say Zach took it.",
    );
    assert.equal(words.placeLine({ cover, facilitators: [josh], readerFacilitates: false, facilitatorStarted: false, finished: true }), null, "a finished register says nothing");
  });

  test("a facilitator arriving late: who started it and when, covering for them, and never their own record", () => {
    const cover = { kind: "self", by: zach, at: "2026-11-10T16:12:00Z", covering: [{ ...josh, you: true }], live: true, yours: false };
    const line = words.placeLine({ cover, facilitators: [{ ...josh, you: true }], readerFacilitates: true, facilitatorStarted: false, finished: false });
    assert.equal(line, "Zach started this register at 4:12pm, covering for you. Carry on from here: each line says who set it.");
    assert.doesNotMatch(line, /late|not there|record/i, "a facilitator is told about their own record");
    const given = words.placeLine({
      cover: { ...cover, kind: "given", by: { uid: "ola", name: "Ola Nowak" } },
      facilitators: [{ ...josh, you: true }],
      readerFacilitates: true,
      facilitatorStarted: false,
      finished: false,
    });
    assert.equal(given, "Ola Nowak was given this session, covering for you. Carry on from here: each line says who set it.");
  });

  test("an admin or a lead before the first line, and helping a facilitator who started it", () => {
    assert.equal(
      words.placeLine({ cover: null, facilitators: [josh], readerFacilitates: false, facilitatorStarted: false, finished: false }),
      "You’re not one of the group’s facilitators, so the first line you set takes this register in place of Josh Bennett. It will say you took it, and the reminders to Josh about it stop.",
    );
    assert.equal(
      words.placeLine({ cover: null, facilitators: [josh], readerFacilitates: false, facilitatorStarted: true, finished: false }),
      "One of the group’s facilitators started this register, so you’re helping, not covering. Each line says who set it.",
    );
    assert.equal(words.placeLine({ cover: null, facilitators: [josh], readerFacilitates: true, facilitatorStarted: false, finished: false }), null, "a facilitator taking their own register is told nothing");
  });
});

describe("3. who set a line", () => {
  test("the reader's own, somebody else's, the person's own word before the session", () => {
    assert.equal(words.setByWords({ name: "", at: "2026-11-10T16:14:00Z", how: "cover", yours: true }), "Set by you, 4:14pm");
    assert.equal(words.setByWords({ name: "Zach Levin", at: "2026-11-10T16:14:00Z", how: "cover", yours: false }), "Zach, 4:14pm");
    assert.equal(words.setByWords({ name: "Lily Zhang", at: "2026-11-09T09:00:00Z", how: "self", yours: false }), "Set before the session");
    // In the house clock: 6:14pm in October is British Summer Time.
    assert.equal(words.setByWords({ name: "Rahul Mehta", at: "2026-10-20T17:14:00Z", how: "facilitator", yours: false }), "Rahul, 6:14pm");
  });
});

describe("4. the check before Finish", () => {
  const members = [
    { uid: "a", displayName: "Aisha Rahman", joinedWeekNumber: 1 },
    { uid: "d", displayName: "Daniel Kim", joinedWeekNumber: 1 },
    { uid: "s", displayName: "Sofia Marin", joinedWeekNumber: 1 },
    { uid: "l", displayName: "Leo Park", joinedWeekNumber: 1 },
    { uid: "g", displayName: "Grace Chen", joinedWeekNumber: 1 },
    { uid: "j", displayName: "Jess Moore", joinedWeekNumber: 1 },
    { uid: "n", displayName: "Nadia Ali", joinedWeekNumber: 3 },
    { uid: "u", displayName: "Uma Shah", joinedWeekNumber: 1 },
  ];
  test("in the room (late and left early too), online, absent, excused; nobody before they joined; nobody unmarked", () => {
    const records = { a: "present", s: "late", l: "left-early", d: "absent", g: "excused", j: "present", n: "present" };
    const rows = model.finishSummary(members, 2, records, { j: true });
    assert.deepEqual(
      rows.map((row) => [row.label, row.count, model.summaryRowWords(row)]),
      [
        ["In the room", 3, "3: Aisha, Sofia, Leo"],
        ["Online", 1, "1: Jess Moore"],
        ["Absent", 1, "1: Daniel Kim"],
        ["Excused", 1, "1: Grace Chen"],
      ],
    );
  });

  test("a row nobody is in is left out, and an empty register has no rows", () => {
    assert.deepEqual(model.finishSummary(members, 2, { a: "present" }, {}).map((row) => row.key), ["room"]);
    assert.deepEqual(model.finishSummary(members, 2, {}, {}), []);
  });
});

describe("5. It didn't happen: what \"What will happen\" gains", () => {
  test("with a draft: attendance, whose lines go and what each said, the check-in and report, the chase", () => {
    const lines = words.didNotHappenLines(
      {
        leavesAttendance: true,
        chaseStops: true,
        checkIn: false,
        reports: 0,
        lines: { cleared: 2, said: { amara: "Present online", chloe: "Absent" }, names: { amara: "Amara", chloe: "Chloe" } },
      },
      2,
    );
    assert.deepEqual(lines, [
      { label: "Attendance", text: "Week 2 leaves everyone’s attendance. Nobody is counted absent." },
      {
        label: "Register",
        text: "2 lines set for it are cleared: Amara (present online) and Chloe (absent). The group’s history keeps what each said, and what people said in advance stays.",
      },
      { label: "Check-in, report", text: "Neither opens: there was no session." },
      { label: "Register reminders", text: "Reminders about week 2’s register stop." },
    ]);
    for (const line of lines) assert.doesNotMatch(line.text, /late/i, "says work shows as late, which it does not yet");
  });

  test("with nothing set, a check-in opened and a report written", () => {
    const lines = words.didNotHappenLines(
      { leavesAttendance: true, chaseStops: true, checkIn: true, reports: 1, lines: { cleared: 0, said: {}, names: {} } },
      3,
    );
    assert.equal(lines[1].text, "Nothing was set on its register, so nothing is cleared.");
    assert.equal(lines[2].text, "Its check-in was opened, and 1 session report was written. They are kept, and nothing more opens for it.");
  });

  test("pushed back, the words say the week meets again and its check-in and report are its new session's", () => {
    const facts = { leavesAttendance: true, chaseStops: true, checkIn: false, reports: 0, lines: { cleared: 0, said: {}, names: {} } };
    const pushed = words.didNotHappenLines(facts, 2, "push");
    assert.equal(
      pushed[0].text,
      "The session that didn’t happen leaves everyone’s attendance. Nobody is counted absent, and week 2’s register is taken at its new session.",
    );
    assert.equal(pushed[2].text, "Nothing was opened or written for it. Week 2’s check-in and report are for its new session.");
    // Kept pace, as before.
    const kept = words.didNotHappenLines(facts, 2, "cancel");
    assert.equal(kept[0].text, "Week 2 leaves everyone’s attendance. Nobody is counted absent.");
    assert.equal(kept[2].text, "Neither opens: there was no session.");
    assert.equal(words.DRAFT_DIDNT_HAPPEN_LINE.startsWith("Its register has lines on it and isn’t finished."), true);
  });

  test("the panel's words", () => {
    assert.equal(words.didntHappenTitle(2), "Week 2 didn’t happen");
    assert.equal(words.didntHappenLede("Group E", "2026-11-10", "16:00"), "Group E, Tue 10 Nov, 4pm.");
    assert.equal(words.emailGroupWords("Group E", 6), "Email Group E (6 people)");
  });
});

describe("6. giving a session to somebody else", () => {
  test("the picker lists admins, the committee, the programme's leads and the run's facilitators, never this group's", () => {
    const people = [
      { uid: "zach", role: "admin" },
      { uid: "nadia", role: "committee" },
      { uid: "rahul", role: "member" },
      { uid: "tom", role: "member" },
      { uid: "yusuf", role: "member" },
      { uid: "bea", role: "member" },
      { uid: "sofia", role: "committee" },
    ];
    const groups = [
      { id: "b", facilitators: [{ uid: "rahul" }, { uid: "sofia" }] },
      { id: "c", facilitators: [{ uid: "tom" }] },
    ];
    const listed = model.coverCandidatesOf({ people, groups, leadUids: ["yusuf"], groupId: "b" }).map((each) => each.uid);
    assert.deepEqual(listed, ["zach", "nadia", "tom", "yusuf"]);
  });

  test("who has the session already, over the picker", () => {
    const given = { name: "Ola Nowak", kind: "given", live: true };
    assert.equal(words.givenAlreadyWords(given, false), "Ola Nowak has this session until midnight. Giving it to somebody else replaces that.");
    assert.equal(words.givenAlreadyWords(given, true), "Ola Nowak has this session already, until midnight. Giving it again sends nothing.");
    assert.equal(words.givenAlreadyWords({ name: "Zach Levin", kind: "self", live: true }, false), "Zach Levin is taking this register. Giving it to somebody else replaces that.");
  });

  test("the button says what it sends and to how many", () => {
    assert.equal(words.giveButtonWords("Ola", 1, 0), "Give Ola this session and email Ola (1)");
    assert.equal(words.giveButtonWords("Ola", 1, 6), "Give Ola this session and email Ola and the group (7)");
    assert.equal(words.giveButtonWords("Ola", 0, 6), "Give Ola this session and email the group (6)");
    assert.equal(words.giveButtonWords("Ola", 0, 0), "Give Ola this session");
  });

  test("the tick, what they get and until when, and what the press said", () => {
    assert.equal(words.tellGroupWords("Group E", "Ola", true, "2026-11-10", 6), "Tell Group E that Ola is running today’s session (6 people)");
    assert.equal(words.tellGroupWords("Group E", "Ola", false, "2026-11-17", 1), "Tell Group E that Ola is running the session on Tue 17 Nov (1 person)");
    assert.equal(words.untilWords("2026-11-11T00:00:00.000Z"), "until midnight at the end of Tue 10 Nov");
    assert.match(
      words.giveWhatTheyGet("2026-11-11T00:00:00.000Z"),
      /^An admin, a committee member, the programme’s lead, one of its track leads or one of its facilitators\. For this session only, until midnight at the end of Tue 10 Nov, they get its register, check-in and session report/,
    );
    assert.equal(words.gaveWords("Ola", true, 0), "Ola has this session until midnight. Emailed Ola.");
    assert.equal(words.gaveWords("Ola", true, 6), "Ola has this session until midnight. Emailed Ola and 6 people in the group.");
    assert.equal(words.gaveWords("Ola", false, 0), "Ola has this session until midnight. Nobody was emailed.");
  });

  test("no dash and no word the site never uses, in every sentence here", () => {
    const every = [
      words.notStartedLine({ groupName: "Group E", dateKey: "2026-11-10", hhmm: "16:00", room: "E05", ended: false, firstNames: ["Josh"] }),
      words.giveWhatTheyGet(null),
      words.DIDNT_HAPPEN_MOVED_FACILITATOR,
      words.DIDNT_HAPPEN_MOVED_STAFF,
      words.ONLY_ADMINS_AND_LEAD_SEE_HERE,
      words.IM_COVERING_IT_LINE,
      words.SOMEONE_ELSE_LINE,
    ];
    for (const sentence of every) {
      assert.doesNotMatch(sentence, /[–—]/, sentence);
      assert.doesNotMatch(sentence, /collate/i, sentence);
    }
  });
});
