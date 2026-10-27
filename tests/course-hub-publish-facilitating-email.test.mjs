/**
 * The "You’re facilitating" email, written whole or not at all, and the words
 * around Publish.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. THE TOKEN LIST IS THE EMAIL'S WHOLE SET, and the seed copy uses every
 *     one and nothing outside it.
 *  2. WITH EVERYTHING KNOWN, THE SEED READS AS THE BOARD DOES, in the words
 *     st-emails draws, apart from the difference written beside it. The
 *     wording before the board's, which an admin may have saved, still reads
 *     as it did (`SAVED`).
 *  3. A MISSING VALUE TAKES ITS OWN PIECE AND NOTHING ELSE: no room, one
 *     facilitator, no programme to sign it (and then NAISI signs it). Every
 *     combination of those comes back whole, word for word, with no token and
 *     no empty element.
 *  4. AN ESSENTIAL VALUE MISSING REFUSES THE EMAIL, with the problem named,
 *     and the refusal reads as a sentence an admin can act on.
 *  5. NEVER A MEETING LINK: an online group is told the link is on its page,
 *     and a room with a link typed into it is not printed.
 *  6. THE WORDS AROUND THE BUTTON: "6pm", "Tuesdays at 6pm", a group of one,
 *     the confirmation's number and the line about the last test.
 *  7. WEEK 1'S GUIDE IS PROMISED ONLY WHEN THE GROUP PAGE SHOWS IT: the
 *     board's "Their names and week 1’s guide are on your group page." when
 *     Publish's plan says the page shows it, the names alone otherwise, and
 *     never in a proof, whose samples are no course.
 *  8. NAISI SIGNS IT WHEN NO LEAD STANDS, as the group email does, with the
 *     group email's own sign-off (Zach, Mon 26 Oct 2026). With a lead the
 *     email is as it was.
 *
 * The composer is the placement email's own (`composeWholeEmail`), so the
 * hostile-wording and long-input checks in tests/email-unfilled-tokens.test.mjs
 * hold for this email too; what is checked here is what is its own.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const email = await loadTs(join("lib", "courses", "facilitatingEmail.ts"));
const seeds = await loadTs(join("lib", "firestore", "courseEmails.ts"));
const words = await loadTs(join("lib", "courses", "publishWords.ts"));
const placement = await loadTs(join("lib", "courses", "placementEmail.ts"));

const SEED = seeds.courseTemplateDefaults["course-facilitating"];
const TOKEN = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
const tokensIn = (text) => [...new Set([...text.matchAll(TOKEN)].map((m) => m[1]))];
const printed = (blocks) => blocks.map((block) => (block.type === "heading" ? block.text : block.html ?? "")).join("\n");
const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const read = (written) => `${written.subject} | ${textOf(printed(written.blocks))}`;
const EMPTY_SHELL = /<(p|li|ul|ol|blockquote|h[1-6]|div)\b[^>]*>\s*<\/\1>/i;

/** Rahul's email for Group B, as the board draws it. */
const FACTS = {
  name: "Rahul Mehta",
  courseTitle: "AGI Strategy Fellowship",
  runLabel: "Autumn 2026",
  groupName: "Group B",
  weeklySlot: "Tuesdays at 6pm",
  firstSession: "Tue 3 Nov",
  lastSession: "Tue 8 Dec",
  where: { kind: "room", room: "Hallward B12" },
  coFacilitators: "Sofia",
  groupSize: 8,
  groupUrl: "https://naisi.invalid/learn/run-1/group/group-b",
  leadName: "Claudia",
  programmeName: "AGI Strategy",
};
const OPTIONAL = ["where", "coFacilitators", "leadName", "programmeName"];
const ESSENTIAL = ["groupName", "weeklySlot", "firstSession", "lastSession", "groupSize", "groupUrl"];
const without = (facts, absent) =>
  Object.fromEntries(Object.entries(facts).map(([key, value]) => [key, absent.includes(key) ? null : value]));
function subsets(list) {
  return list.reduce((all, item) => [...all, ...all.map((subset) => [...subset, item])], [[]]);
}

/**
 * The board's email (st-emails), word for word since October 2026, for a
 * group whose page does not show week 1's guide (`FACTS` leaves
 * `weekOneGuide` unset): "Their names are on your group page." When the page
 * shows it, the email says the board's whole sentence (`BOARD_FULL`, section
 * 7).
 */
const FULL =
  "You’re facilitating Group B: Tuesdays at 6pm | Hi Rahul, Group B meets on Tuesdays at 6pm in Hallward B12, from Tue 3 Nov to Tue 8 Dec. " +
  "You’re facilitating with Sofia. There are 8 people in the group. Their names are on your group page. Open your group " +
  "Take the register on your phone during the session. Claudia AGI Strategy lead, NAISI";

/**
 * THE WORDING BEFORE THE BOARD'S (until October 2026), word for word, as an
 * admin may have saved it in Email designs: the room and "You’re
 * facilitating with Sofia." each in a paragraph of its own. Every token in
 * it is still filled as it was, so it still reads as it did.
 */
const SAVED = {
  subject: "You’re facilitating {groupName}: {weeklySlot}",
  blocks: [
    {
      id: "saved",
      type: "richText",
      html:
        "<p>Hi {firstName},</p>" +
        "<p>{groupName} meets on {weeklySlot}, from {firstSession} to {lastSession}.</p>" +
        "<p>Where: {where}</p>" +
        "<p>You’re facilitating with {coFacilitators}.</p>" +
        "<p>{groupSize}</p>" +
        '<p><a href="{groupUrl}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#6a82ff;color:#050810;font-weight:600;text-decoration:none">Open your group</a></p>' +
        "<p>Take the register on your phone during the session.</p>" +
        '<p>{leadName}<br /><span style="color:#71717a">{programmeName} lead, NAISI</span></p>',
    },
  ],
};
const SAVED_FULL =
  "You’re facilitating Group B: Tuesdays at 6pm | Hi Rahul, Group B meets on Tuesdays at 6pm, from Tue 3 Nov to Tue 8 Dec. " +
  "Where: Hallward B12 You’re facilitating with Sofia. There are 8 people in the group. Open your group " +
  "Take the register on your phone during the session. Claudia AGI Strategy lead, NAISI";
/** The board's tokens, which the seed says: the inline three and the sentence about names. */
const BOARD = ["namesOnPage", "place", "placeNote", "facilitatingWith"];

describe("1. each token has its rule", () => {
  test("the list is the email's whole token set, and the seed uses all of it and nothing more", () => {
    assert.deepEqual(email.FACILITATING_TOKEN_RULES, {
      firstName: "always",
      preferredName: "always",
      courseTitle: "always",
      runLabel: "always",
      groupName: "essential",
      weeklySlot: "essential",
      firstSession: "essential",
      lastSession: "essential",
      groupSize: "essential",
      groupUrl: "essential",
      where: "optional",
      coFacilitators: "optional",
      leadName: "optional",
      programmeName: "optional",
      // NAISI's sign-off when no lead stands, as the group email's (Mon 26 Oct 2026).
      naisiSignOff: "optional",
      // The board's, since October 2026.
      namesOnPage: "always",
      place: "inline",
      placeNote: "inline",
      facilitatingWith: "inline",
    });
    const used = tokensIn(`${SEED.subject}\n${printed(SEED.blocks)}`);
    assert.deepEqual(used.filter((token) => !(token in email.FACILITATING_TOKEN_RULES)), []);
    for (const token of [...ESSENTIAL, "leadName", "programmeName", "naisiSignOff", "firstName", ...BOARD]) {
      assert.ok(used.includes(token), `the seed no longer says {${token}}`);
    }
    // The wording before the board's is still the email's to fill, every token of it.
    const saved = tokensIn(`${SAVED.subject}\n${printed(SAVED.blocks)}`);
    assert.deepEqual(saved.filter((token) => !(token in email.FACILITATING_TOKEN_RULES)), []);
    for (const token of [...ESSENTIAL, ...OPTIONAL, "firstName"]) assert.ok(saved.includes(token), `the saved wording no longer says {${token}}`);
    // No optional value may sit in the subject, where it could not be left out.
    for (const token of [...OPTIONAL, "naisiSignOff"]) assert.ok(!SEED.subject.includes(`{${token}}`) && !SAVED.subject.includes(`{${token}}`), token);
  });

  test("it is a course email an admin can edit, named as the designer names it", () => {
    assert.ok(seeds.COURSE_TEMPLATE_IDS.includes("course-facilitating"));
    assert.equal(seeds.COURSE_DEFAULT_LABELS["course-facilitating"], "You’re facilitating");
    assert.equal(seeds.COURSE_TEMPLATE_TRIGGER["course-facilitating"], "facilitating");
    assert.equal(email.FACILITATING_TEMPLATE_LABEL, "You’re facilitating");
  });
});

describe("2. with everything known, the seed reads as the board does", () => {
  test("in full", () => {
    const written = email.composeFacilitatingEmail(SEED, FACTS);
    assert.equal(written.ok, true, JSON.stringify(written));
    assert.equal(read(written), FULL);
    assert.ok(printed(written.blocks).includes(`href="${FACTS.groupUrl}"`), "the button leads to the group page");
  });

  test("wording saved before the board's reads in full as it did", () => {
    const written = email.composeFacilitatingEmail(SAVED, FACTS);
    assert.equal(written.ok, true, JSON.stringify(written));
    assert.equal(read(written), SAVED_FULL);
  });
});

describe("3. a missing value takes its own piece and nothing else", () => {
  // What each missing value takes out of the board's email, and nothing more.
  const GONE = {
    coFacilitators: " You’re facilitating with Sofia.",
    where: " in Hallward B12",
    leadName: " Claudia AGI Strategy lead, NAISI",
    programmeName: " Claudia AGI Strategy lead, NAISI",
  };
  /**
   * The board's email less what each missing value takes, word for word. With
   * no lead to sign it NAISI signs it in the lead's place, as the group email
   * is signed (Mon 26 Oct 2026; until then it was signed by nobody, and the
   * lead's sign-off simply went).
   */
  const expectedWithout = (absent) => {
    const text = [...new Set(absent.map((token) => GONE[token]))].reduce((said, gone) => said.replace(gone, ""), FULL);
    return absent.includes("leadName") ? `${text} NAISI` : text;
  };
  const cases = [
    ["somebody facilitating alone", ["coFacilitators"]],
    ["a group with no room yet", ["where"]],
    ["a run no programme names", ["leadName", "programmeName"]],
    ["a programme with no lead", ["leadName"]],
  ];
  for (const [label, absent] of cases) {
    test(label, () => {
      const written = email.composeFacilitatingEmail(SEED, without(FACTS, absent));
      assert.equal(written.ok, true, JSON.stringify(written));
      assert.equal(read(written), expectedWithout(absent));
    });
  }

  // The wording before the board's, as it always did: each in a paragraph of its own.
  // It has no {naisiSignOff}, so nothing is written in a missing lead's place
  // until an admin adds it (docs/courses-ops.md says so): the composer never
  // writes a paragraph the wording does not have.
  const savedCases = [
    ["saved wording, somebody facilitating alone", ["coFacilitators"], " You’re facilitating with Sofia."],
    ["saved wording, a group with no room yet", ["where"], " Where: Hallward B12"],
    ["saved wording, a run no programme names", ["leadName", "programmeName"], " Claudia AGI Strategy lead, NAISI"],
    ["saved wording, a programme with no lead", ["leadName"], " Claudia AGI Strategy lead, NAISI"],
  ];
  for (const [label, absent, gone] of savedCases) {
    test(label, () => {
      const written = email.composeFacilitatingEmail(SAVED, without(FACTS, absent));
      assert.equal(written.ok, true, JSON.stringify(written));
      assert.equal(read(written), SAVED_FULL.replace(gone, ""));
    });
  }

  test("every combination of what can be missing comes back whole, word for word", () => {
    for (const absent of subsets(OPTIONAL)) {
      const written = email.composeFacilitatingEmail(SEED, without(FACTS, absent));
      assert.equal(written.ok, true, absent.join(", "));
      const all = `${written.subject}\n${printed(written.blocks)}`;
      assert.deepEqual(tokensIn(all), [], absent.join(", "));
      assert.doesNotMatch(all, EMPTY_SHELL, absent.join(", "));
      // Exactly the board's email less what each missing value takes, NAISI signing where no lead stands.
      assert.equal(read(written), expectedWithout(absent), absent.join(", "));
      // And the saved wording keeps every sentence that is not about a missing value.
      const saved = email.composeFacilitatingEmail(SAVED, without(FACTS, absent));
      for (const kept of ["Group B meets on Tuesdays at 6pm, from Tue 3 Nov to Tue 8 Dec.", "There are 8 people in the group.", "Take the register on your phone during the session."]) {
        assert.ok(read(saved).includes(kept), `${absent.join(", ")}: ${kept}`);
      }
    }
  });

  test("a group of one reads right", () => {
    const written = email.composeFacilitatingEmail(SEED, { ...FACTS, groupSize: 1 });
    assert.equal(
      read(written),
      FULL.replace("There are 8 people in the group. Their names are on your group page.", "There is 1 person in the group. Their name is on your group page."),
    );
    assert.ok(read(email.composeFacilitatingEmail(SAVED, { ...FACTS, groupSize: 1 })).includes("There is 1 person in the group."));
  });
});

describe("4. an essential value missing refuses the email", () => {
  for (const token of ESSENTIAL) {
    test(`no ${token}`, () => {
      const written = email.composeFacilitatingEmail(SEED, without(FACTS, [token]));
      assert.equal(written.ok, false);
      assert.deepEqual(written.problems, [{ kind: "missing", token }]);
    });
  }

  test("a group with nobody in it is not one to write to", () => {
    assert.deepEqual(email.composeFacilitatingEmail(SEED, { ...FACTS, groupSize: 0 }).problems, [{ kind: "missing", token: "groupSize" }]);
  });

  test("wording that puts a value that can be missing beside what the email is for is refused for a group that lacks it", () => {
    const template = { subject: "You’re facilitating {groupName}", blocks: [{ id: "r", type: "richText", html: "<p>{groupName} meets on {weeklySlot} in {where}.</p>" }] };
    assert.equal(email.composeFacilitatingEmail(template, FACTS).ok, true);
    const written = email.composeFacilitatingEmail(template, without(FACTS, ["where"]));
    assert.deepEqual(written.problems, [{ kind: "cannot-leave-out", tokens: ["where"], where: "paragraph" }]);
  });

  test("every refusal reads as a sentence that says what to do, and none has a token-shaped hole", () => {
    const refused = (problems, extra = {}) => ({ name: "Group B", problems, ...extra });
    const sentences = email.facilitatingRefusal([
      refused([{ kind: "missing", token: "groupName" }]),
      refused([{ kind: "missing", token: "weeklySlot" }]),
      refused([{ kind: "missing", token: "firstSession" }], { noFirstSession: "no-start-date", name: "Group A" }),
      refused([{ kind: "missing", token: "groupUrl" }]),
      refused([{ kind: "unknown-token", tokens: ["facilitatorName"] }]),
      refused([{ kind: "cannot-leave-out", tokens: ["where"], where: "paragraph" }]),
      refused([{ kind: "cannot-leave-out", tokens: ["coFacilitators"], where: "subject" }]),
    ]);
    assert.deepEqual(sentences, [
      "A group with a facilitator to tell has no name, so they cannot be told which group they facilitate. Name the group, then publish again.",
      "Group B has no day and time, so its facilitators cannot be told when it meets. Set its day and time, then publish again.",
      "This run has no start date, so its facilitators cannot be told when their groups meet. Set the start date on the run, then publish again.",
      "This copy of the site doesn’t know its own address, so the button in the “You’re facilitating” email would lead nowhere.",
      "The “You’re facilitating” email uses {facilitatorName}, which this email cannot fill. Correct its wording in Email designs, then publish again.",
      "Group B has one facilitator, so there is nobody to name beside them, and the “You’re facilitating” email uses {coFacilitators} in its subject, where it cannot be left out. Take {coFacilitators} out of the subject in Email designs, then publish again.",
      "Group B has no room or meeting link, and the “You’re facilitating” email uses {where} in the same paragraph as the group or when it meets, where it cannot be left out. Set its room, or give {where} a paragraph of its own in Email designs, then publish again.",
    ]);
    for (const sentence of sentences) assert.doesNotMatch(sentence, /—|–|undefined|null/);
  });
});

describe("5. never a meeting link", () => {
  test("an online group is told it is online, and where the link is", () => {
    for (const [linkOnPage, said] of [
      [true, "Group B meets on Tuesdays at 6pm online, from Tue 3 Nov to Tue 8 Dec. The link to join is on your group page. You’re facilitating with Sofia."],
      [false, "Group B meets on Tuesdays at 6pm online, from Tue 3 Nov to Tue 8 Dec. You’re facilitating with Sofia."],
    ]) {
      const written = email.composeFacilitatingEmail(SEED, { ...FACTS, where: { kind: "online", linkOnPage } });
      assert.ok(read(written).includes(said), read(written));
    }
    for (const [linkOnPage, said] of [
      [true, "Where: Online. The link to join is on your group page."],
      [false, "Where: Online"],
    ]) {
      const written = email.composeFacilitatingEmail(SAVED, { ...FACTS, where: { kind: "online", linkOnPage } });
      assert.ok(read(written).includes(said), read(written));
    }
  });

  test("a room with a way into a call typed into it is not printed, wherever it was classified", () => {
    // The shapes tests/email-unfilled-tokens.test.mjs types into a room.
    for (const room of ["https://meet.example/j/8675309?pwd=opensesame", "Hallward B12 or meet.example/j/8675309", "www.meet.example/j/8675309 (pwd opensesame)"]) {
      for (const where of [{ kind: "room", room }, { kind: "on-page" }]) {
        const written = email.composeFacilitatingEmail(SEED, { ...FACTS, where });
        const all = `${written.subject}\n${printed(written.blocks)}`.toLowerCase();
        assert.ok(!all.includes("meet.example") && !all.includes("8675309"), all);
        assert.ok(
          read(written).includes(
            "Group B meets on Tuesdays at 6pm, from Tue 3 Nov to Tue 8 Dec. You’ll find where it meets on your group page. You’re facilitating with Sofia.",
          ),
          read(written),
        );
        const saved = email.composeFacilitatingEmail(SAVED, { ...FACTS, where });
        assert.ok(!`${saved.subject}\n${printed(saved.blocks)}`.toLowerCase().includes("meet.example"));
        assert.ok(read(saved).includes("Where: You’ll find where it meets on your group page."), read(saved));
      }
    }
  });

  test("nothing typed becomes markup", () => {
    const written = email.composeFacilitatingEmail(SEED, {
      ...FACTS,
      groupName: "<b>Group</b> {B}",
      coFacilitators: "Sofia & Tom",
      where: { kind: "room", room: "Room <i>B</i>" },
    });
    const html = printed(written.blocks);
    assert.ok(html.includes("&lt;b&gt;Group&lt;/b&gt; (B)") && html.includes("You’re facilitating with Sofia &amp; Tom."), html);
    assert.ok(html.includes("on Tuesdays at 6pm in Room &lt;i&gt;B&lt;/i&gt;, from"), html);
  });
});

describe("6. the words around the button", () => {
  test("a stored time is written as the site writes one", () => {
    for (const [stored, said] of [["18:00", "6pm"], ["18:30", "6:30pm"], ["12:00", "12pm"], ["00:00", "12am"], ["09:05", "9:05am"], ["13:00", "1pm"]]) {
      assert.equal(email.clockWords(stored), said, stored);
    }
    for (const nonsense of ["", "6pm", "24:00", "18:60", "1800", "18:0"]) assert.equal(email.clockWords(nonsense), null, nonsense);
    assert.equal(email.weeklySlotWords({ weekday: 2, startTimeLocal: "18:00" }), "Tuesdays at 6pm");
    assert.equal(email.weeklySlotWords({ weekday: 0, startTimeLocal: "10:30" }), "Sundays at 10:30am");
    assert.equal(email.weeklySlotWords({ weekday: 2, startTimeLocal: "" }), null);
    assert.equal(email.weeklySlotWords({ weekday: 9, startTimeLocal: "18:00" }), null);
    assert.equal(email.namesInWords(["Sofia", "Tom", "Ana"]), "Sofia, Tom and Ana");
  });

  test("the button, and a press that would send nothing", () => {
    assert.equal(words.publishButtonLabel(37), "Publish and send 37 emails");
    assert.equal(words.publishButtonLabel(1), "Publish and send 1 email");
    assert.equal(words.publishButtonLabel(0), "Publish");
    assert.equal(words.publishAudienceLine(32, 5), "32 people and 5 facilitators");
    assert.equal(words.publishAudienceLine(1, 0), "1 person");
    assert.equal(words.publishAudienceLine(0, 1), "1 facilitator");
  });

  test("the confirmation says the button's number, who it reaches and who it does not", () => {
    assert.equal(
      words.publishConfirmText({ runLabel: "Autumn 2026", emails: 37, people: 32, facilitators: 5, more: 0, noAddress: [], emptyGroups: [], republish: false }),
      "Publish Autumn 2026 and send 37 emails?\n\n" +
        "32 emails to people placed in a group, with their group, day, room and facilitators. 5 emails to facilitators, with their group, day and room.\n\n" +
        "Emails cannot be unsent.",
    );
    const busy = words.publishConfirmText({ runLabel: "Autumn 2026", emails: 2, people: 1, facilitators: 1, more: 3, noAddress: ["Bea"], emptyGroups: ["Group C"], republish: true });
    assert.equal(
      busy,
      "Publish Autumn 2026 and send 2 emails?\n\n" +
        "1 email to the person placed in a group, with their group, day, room and facilitators. 1 email to a facilitator, with their group, day and room.\n\n" +
        "3 emails more after this. Press Publish again to send them.\n\n" +
        "Bea has no email address on file, so is not emailed.\n\n" +
        "Group C has nobody in it yet, so its facilitators are not emailed.\n\n" +
        "Only people and facilitators not told before are emailed. Emails cannot be unsent.",
    );
    assert.match(words.publishConfirmText({ runLabel: "Autumn 2026", emails: 0, people: 0, facilitators: 0, more: 0, noAddress: [], emptyGroups: [], republish: true }), /^Publish Autumn 2026\? Publishing now sends no email/);
  });

  test("the line about the last test", () => {
    assert.equal(words.testLine({ state: "fresh", when: "5:38pm", who: null }), "Test sent to you at 5:38pm.");
    assert.equal(words.testLine({ state: "fresh", when: "Mon 26 Oct at 5:38pm", who: "Zoe" }), "Test sent to Zoe at Mon 26 Oct at 5:38pm.");
    assert.equal(
      words.testLine({ state: "stale", when: "5:38pm", who: null }),
      "Test sent to you at 5:38pm. The wording changed in Email designs since, so send yourself another before you publish.",
    );
    assert.equal(words.testLine({ state: "none", when: null, who: null }), "Send yourself a test before you publish.");
  });

  test("no word around Publish has a dash or says skipped", () => {
    const report = { people: { sent: 1, held: 2, suppressed: 1 }, facilitators: { sent: 1, held: 0, suppressed: 1 }, failed: ["A"], noAddress: ["B"], alreadyTold: 1, more: 4 };
    const all = [
      ...words.publishResultLines(report),
      words.publishConfirmText({ runLabel: "R", emails: 3, people: 2, facilitators: 1, more: 4, noAddress: ["B"], emptyGroups: ["C"], republish: true }),
      words.NOTHING_TO_SEND,
      words.PUBLISH_ADMIN_ONLY,
    ];
    for (const said of all) assert.doesNotMatch(said, /—|–|skipped/i, said);
  });
});

describe("7. week 1's guide, promised only when the group page shows it", () => {
  /** The board's email with its whole sentence, as Publish writes it when the group page shows week 1's guide. */
  const BOARD_FULL = FULL.replace("Their names are on your group page.", "Their names and week 1’s guide are on your group page.");

  test("the sentence, for a group of many and a group of one, with the guide and without", () => {
    assert.equal(email.namesOnPageSentence(8, true), "Their names and week 1’s guide are on your group page.");
    assert.equal(email.namesOnPageSentence(1, true), "Their name and week 1’s guide are on your group page.");
    assert.equal(email.namesOnPageSentence(8, false), "Their names are on your group page.");
    assert.equal(email.namesOnPageSentence(1, false), "Their name is on your group page.");
    assert.equal(email.namesOnPageSentence(8), "Their names are on your group page.");
  });

  test("the seed says the board's whole sentence when the page shows it, and the names alone when it does not or nobody said", () => {
    assert.equal(BOARD_FULL.includes("There are 8 people in the group. Their names and week 1’s guide are on your group page. Open your group"), true);
    assert.equal(read(email.composeFacilitatingEmail(SEED, { ...FACTS, weekOneGuide: true })), BOARD_FULL);
    assert.equal(read(email.composeFacilitatingEmail(SEED, { ...FACTS, weekOneGuide: false })), FULL);
    assert.equal(read(email.composeFacilitatingEmail(SEED, FACTS)), FULL);
    // Only `true` promises it: anything else that reached the facts is not a yes.
    for (const notAYes of ["yes", 1, null, {}]) {
      assert.equal(read(email.composeFacilitatingEmail(SEED, { ...FACTS, weekOneGuide: notAYes })), FULL, String(notAYes));
    }
    assert.equal(
      read(email.composeFacilitatingEmail(SEED, { ...FACTS, weekOneGuide: true, groupSize: 1 })),
      BOARD_FULL.replace("There are 8 people in the group. Their names and week 1’s guide are on your group page.", "There is 1 person in the group. Their name and week 1’s guide are on your group page."),
    );
    // With every combination of what can be missing, the guide changes that one sentence and nothing else.
    for (const absent of subsets(OPTIONAL)) {
      const without_ = read(email.composeFacilitatingEmail(SEED, without(FACTS, absent)));
      const with_ = read(email.composeFacilitatingEmail(SEED, { ...without(FACTS, absent), weekOneGuide: true }));
      assert.equal(with_, without_.replace("Their names are on your group page.", "Their names and week 1’s guide are on your group page."), absent.join(", "));
    }
  });

  test("wording saved before the board's has no sentence about names, so the guide changes nothing in it", () => {
    assert.equal(read(email.composeFacilitatingEmail(SAVED, { ...FACTS, weekOneGuide: true })), SAVED_FULL);
  });

  test("a proof never promises the guide: its samples are no course", () => {
    const facts = email.facilitatingFactsFromSample({ firstName: "Alex", groupName: "Group B", weeklySlot: "Tuesdays at 6pm", firstSession: "Tue 7 Oct", lastSession: "Tue 11 Nov", groupSize: "8", groupUrl: "https://naisi.invalid/g" });
    assert.equal(facts.weekOneGuide, false);
    const proof = read(email.composeFacilitatingEmail(SEED, facts, { proof: true }));
    assert.ok(proof.includes("There are 8 people in the group. Their names are on your group page."), proof);
    assert.doesNotMatch(proof, /week 1’s guide/);
  });
});

describe("8. NAISI signs it when no lead stands, as the group email does", () => {
  /** The last paragraph of an email's body, as written. */
  const lastParagraph = (blocks) => {
    const html = printed(blocks);
    return html.slice(html.lastIndexOf("<p>"));
  };
  /** The group email, as Publish writes it for a programme with no lead. */
  const groupEmail = placement.composePlacementEmail(
    seeds.courseTemplateDefaults["course-allocated"],
    placement.placementFactsFromSample({
      firstName: "Amara",
      groupName: "Group B",
      weeklySlot: "Tuesdays at 6pm",
      firstSession: "Tue 3 Nov",
      firstSessionWhen: "Tue 3 Nov, 6pm",
      firstSessionDay: "Tuesday",
      programmeUrl: "https://naisi.invalid/learn/run-1",
      programmeName: "AGI Strategy",
    }),
  );

  test("with a lead the email is as it was, signed by the lead alone", () => {
    const written = email.composeFacilitatingEmail(SEED, FACTS);
    assert.equal(read(written), FULL);
    assert.equal(lastParagraph(written.blocks), '<p>Claudia<br /><span style="color:#71717a">AGI Strategy lead, NAISI</span></p>');
  });

  test("with none it ends with the very sign-off the group email ends with", () => {
    assert.equal(groupEmail.ok, true, JSON.stringify(groupEmail));
    assert.equal(lastParagraph(groupEmail.blocks), "<p>NAISI</p>");
    for (const absent of [["leadName"], ["leadName", "programmeName"]]) {
      const written = email.composeFacilitatingEmail(SEED, without(FACTS, absent));
      assert.equal(written.ok, true, absent.join(", "));
      assert.equal(lastParagraph(written.blocks), lastParagraph(groupEmail.blocks), absent.join(", "));
      assert.ok(read(written).endsWith("Take the register on your phone during the session. NAISI"), read(written));
      assert.doesNotMatch(read(written), /lead, NAISI/);
    }
    // A blank name is no lead.
    for (const blank of ["", "   "]) {
      assert.equal(lastParagraph(email.composeFacilitatingEmail(SEED, { ...FACTS, leadName: blank }).blocks), "<p>NAISI</p>", JSON.stringify(blank));
    }
  });

  test("a proof signs as a send would: the sample lead, or NAISI with none", () => {
    const sample = {
      firstName: "Alex",
      groupName: "Group B",
      weeklySlot: "Tuesdays at 6pm",
      firstSession: "Tue 7 Oct",
      lastSession: "Tue 11 Nov",
      groupSize: "8",
      groupUrl: "https://naisi.invalid/g",
      programmeName: "AI Safety Fundamentals",
    };
    const proof = (over) => email.composeFacilitatingEmail(SEED, email.facilitatingFactsFromSample({ ...sample, ...over }), { proof: true });
    assert.ok(read(proof({ leadName: "Jordan" })).endsWith("Jordan AI Safety Fundamentals lead, NAISI"));
    assert.ok(read(proof({})).endsWith("Take the register on your phone during the session. NAISI"));
  });

  test("one sign-off, the group email's own constant, and no second NAISI written in this email's code", () => {
    assert.equal(placement.NAISI_SIGN_OFF, "NAISI");
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "courses", "facilitatingEmail.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.match(code, /import \{\s*NAISI_SIGN_OFF,[\s\S]*?\} from "@\/lib\/courses\/placementEmail";/);
    assert.match(code, /naisiSignOff: lead \? null : typed\(NAISI_SIGN_OFF\),/);
    assert.doesNotMatch(code, /["'`]NAISI["'`]/, "a sign-off of this email's own");
  });
});
