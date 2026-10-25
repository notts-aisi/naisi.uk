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
 *     st-emails draws, apart from the differences written beside each.
 *  3. A MISSING VALUE TAKES ITS OWN PARAGRAPH AND NOTHING ELSE: no room, one
 *     facilitator, no programme to sign it. Every combination of those comes
 *     back whole, with no token and no empty element.
 *  4. AN ESSENTIAL VALUE MISSING REFUSES THE EMAIL, with the problem named,
 *     and the refusal reads as a sentence an admin can act on.
 *  5. NEVER A MEETING LINK: an online group is told the link is on its page,
 *     and a room with a link typed into it is not printed.
 *  6. THE WORDS AROUND THE BUTTON: "6pm", "Tuesdays at 6pm", a group of one,
 *     the confirmation's number and the line about the last test.
 *
 * The composer is the placement email's own (`composeWholeEmail`), so the
 * hostile-wording and long-input checks in tests/email-unfilled-tokens.test.mjs
 * hold for this email too; what is checked here is what is its own.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const email = await loadTs(join("lib", "courses", "facilitatingEmail.ts"));
const seeds = await loadTs(join("lib", "firestore", "courseEmails.ts"));
const words = await loadTs(join("lib", "courses", "publishWords.ts"));

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
 * The board's email, with two differences written down in the notes and the
 * pull request: the room has a paragraph of its own ("Where: …") and so has
 * "You’re facilitating with Sofia.", because a missing value takes its own
 * paragraph and rooms are not needed to publish this week; and "Their names
 * and week 1’s guide are on your group page." is left out, because the group
 * page shows no week guide.
 */
const FULL =
  "You’re facilitating Group B: Tuesdays at 6pm | Hi Rahul, Group B meets on Tuesdays at 6pm, from Tue 3 Nov to Tue 8 Dec. " +
  "Where: Hallward B12 You’re facilitating with Sofia. There are 8 people in the group. Open your group " +
  "Take the register on your phone during the session. Claudia AGI Strategy lead, NAISI";

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
    });
    const used = tokensIn(`${SEED.subject}\n${printed(SEED.blocks)}`);
    assert.deepEqual(used.filter((token) => !(token in email.FACILITATING_TOKEN_RULES)), []);
    for (const token of [...ESSENTIAL, ...OPTIONAL, "firstName"]) assert.ok(used.includes(token), `the seed no longer says {${token}}`);
    // No optional value may sit in the subject, where it could not be left out.
    for (const token of OPTIONAL) assert.ok(!SEED.subject.includes(`{${token}}`), token);
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
});

describe("3. a missing value takes its own paragraph and nothing else", () => {
  const cases = [
    ["somebody facilitating alone", ["coFacilitators"], " You’re facilitating with Sofia."],
    ["a group with no room yet", ["where"], " Where: Hallward B12"],
    ["a run no programme names", ["leadName", "programmeName"], " Claudia AGI Strategy lead, NAISI"],
    ["a programme with no lead", ["leadName"], " Claudia AGI Strategy lead, NAISI"],
  ];
  for (const [label, absent, gone] of cases) {
    test(label, () => {
      const written = email.composeFacilitatingEmail(SEED, without(FACTS, absent));
      assert.equal(written.ok, true, JSON.stringify(written));
      assert.equal(read(written), FULL.replace(gone, ""));
    });
  }

  test("every combination of what can be missing comes back whole", () => {
    for (const absent of subsets(OPTIONAL)) {
      const written = email.composeFacilitatingEmail(SEED, without(FACTS, absent));
      assert.equal(written.ok, true, absent.join(", "));
      const all = `${written.subject}\n${printed(written.blocks)}`;
      assert.deepEqual(tokensIn(all), [], absent.join(", "));
      assert.doesNotMatch(all, EMPTY_SHELL, absent.join(", "));
      // The sentences that are not about a missing value are all still there.
      for (const kept of ["Group B meets on Tuesdays at 6pm, from Tue 3 Nov to Tue 8 Dec.", "There are 8 people in the group.", "Take the register on your phone during the session."]) {
        assert.ok(read(written).includes(kept), `${absent.join(", ")}: ${kept}`);
      }
    }
  });

  test("a group of one reads right", () => {
    const written = email.composeFacilitatingEmail(SEED, { ...FACTS, groupSize: 1 });
    assert.ok(read(written).includes("There is 1 person in the group."), read(written));
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
      [true, "Where: Online. The link to join is on your group page."],
      [false, "Where: Online"],
    ]) {
      const written = email.composeFacilitatingEmail(SEED, { ...FACTS, where: { kind: "online", linkOnPage } });
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
        assert.ok(read(written).includes("Where: You’ll find where it meets on your group page."), read(written));
      }
    }
  });

  test("nothing typed becomes markup", () => {
    const written = email.composeFacilitatingEmail(SEED, { ...FACTS, groupName: "<b>Group</b> {B}", coFacilitators: "Sofia & Tom" });
    const html = printed(written.blocks);
    assert.ok(html.includes("&lt;b&gt;Group&lt;/b&gt; (B)") && html.includes("Sofia &amp; Tom"), html);
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
