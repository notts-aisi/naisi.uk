/**
 * A facilitator's Home before the group's first session (board
 * st-fac-before-phone, Q14): the first session as a ticket with "Open your
 * group", who's coming, and Say hello.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The contract
 *
 * Privacy policy version 7: before the first session, facilitators "will also
 * see whether each person in their group has said they are coming", and
 * apart from that one reply nothing from applications. So:
 *
 *  1. ONLY AFTER PUBLISH HAS TOLD THEM. Before Publish the list is nobody, and
 *     Home says when the names come.
 *  2. ONLY THEIR OWN GROUPS. Another group's facilitator, the lead, a member
 *     and somebody signed out are refused the summary; an admin is handed no
 *     list.
 *  3. ONLY FIRST NAMES, AND ONLY "COMING" OR "HASN'T SAID": the list's entries
 *     carry a first name and a yes or a no, and nothing else. Never "I can't
 *     make it", never a reason: somebody who gave their place back is not in
 *     the list, and what they said is nowhere.
 *  4. ONLY BEFORE THE FIRST SESSION'S DAY. From that day Home is the weekly
 *     Home, with "Take the register", and the summary hands no list.
 *  5. ONE READING. The list agrees with the "Coming?" column the programme's
 *     lead reads on the People tab, person by person.
 *
 * Driven through the real routes, as each person would: the hand-over, the
 * placements and Publish as the programme's lead and an admin, each reply on
 * the person's own application page, and the summary and Home as each
 * caller. Faked: see `tests/lib/peopleWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANSWER, B, C, MONDAY, makePeopleWorld, termSeed } from "./lib/peopleWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: MONDAY });

const w = await makePeopleWorld("__facilitatorBeforeSuite");
const { at, reset, summary, home, peoplePage, viewOf, loadTs, everything } = w;
const { press, place, publish, reply } = w.join;
const words = await loadTs(join("lib", "courses", "facilitatorPageWords.ts"));

/** Mon 2 Nov 2026, the day before Group B's first session. */
const DAY_BEFORE = new Date("2026-11-02T12:00:00Z");
/** Tue 3 Nov 2026, Group B's first session's day (6pm). */
const FIRST_DAY = new Date("2026-11-03T12:00:00Z");
/** What Sam writes on giving the place back, which no facilitator may read. */
const SAM_REASON = "My shifts at the library moved to Tuesdays.";

/** Everybody handed over and placed by the programme's lead: Group B is Amara, Dev, Kofi and Sam. */
async function placed() {
  assert.equal((await press("zach")).status, 200);
  const answer = await place("claudia", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "kofi", groupId: B },
    { uid: "sam", groupId: B },
    { uid: "tariq", groupId: C },
    { uid: "bea", groupId: C },
    { uid: "callum", groupId: C },
    { uid: "zach", groupId: C },
  ]);
  assert.equal(answer.body.placed, 8, JSON.stringify(answer.body));
}

/** Placed, then Publish pressed by the programme's lead, with the test it asks for first. */
async function told() {
  await placed();
  const answer = await publish("claudia");
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
}

beforeEach(() => {
  reset(termSeed());
  at(MONDAY);
});

// ---------------------------------------------------------------------------
// 1. Only after Publish has told them
// ---------------------------------------------------------------------------

describe("1. only after Publish has told the group", () => {
  test("before Publish the list is nobody, and Home says when the names come", async () => {
    await placed();
    const answer = await summary("rahul");
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.whosComing, []);
    assert.equal(answer.body.notYetTold, true);
    const drawn = await home("rahul");
    assert.ok(drawn.text.includes(`${words.WHOS_COMING} You’ll see your group’s names when groups go out.`), drawn.text);
    for (const name of ["Amara", "Dev", "Kofi", "Sam"]) assert.ok(!drawn.text.includes(name), `Home names ${name} before Publish`);
    // Nobody can be written to yet, so Say hello is not offered.
    assert.ok(!drawn.text.includes(words.SAY_HELLO), drawn.text);
  });

  test("once Publish has told them: each person by first name, coming or hasn't said, in the group's order", async () => {
    await told();
    const answer = await summary("rahul");
    assert.deepEqual(answer.body.whosComing, [
      { firstName: "Amara", coming: true },
      { firstName: "Dev", coming: false },
      { firstName: "Kofi", coming: true },
      { firstName: "Sam", coming: false },
    ]);
    const drawn = await home("rahul");
    assert.ok(drawn.text.includes("Who’s coming 2 of 4 said they’re coming. Dev and Sam haven’t said."), drawn.text);
    assert.match(drawn.html, /<ul aria-label="Who’s coming" class="comingList">/);
    assert.equal((drawn.html.match(/class="comingChip"/g) ?? []).length, 2);
    assert.equal((drawn.html.match(/class="notSaidChip"/g) ?? []).length, 2);
    for (const [name, said] of [["Amara", ", coming"], ["Dev", ", hasn’t said"], ["Kofi", ", coming"], ["Sam", ", hasn’t said"]]) {
      assert.match(drawn.html, new RegExp(`${name}<span class="srOnly">${said}</span>`), name);
    }
  });

  test("somebody placed after Publish is not in the list until Publish tells them", async () => {
    await told();
    // Callum is moved into Group B after Publish: the move clears the told stamp.
    const moved = await place("claudia", [{ uid: "callum", groupId: B }]);
    assert.equal(moved.body.placed, 1);
    const names = (await summary("rahul")).body.whosComing.map((person) => person.firstName);
    assert.ok(!names.includes("Callum"), JSON.stringify(names));
    assert.equal((await summary("rahul")).body.notYetTold, true);
  });
});

// ---------------------------------------------------------------------------
// 2. Only their own groups
// ---------------------------------------------------------------------------

describe("2. only the group's own facilitators", () => {
  test("the group's facilitators are handed the list; an admin none; everybody else is refused", async () => {
    await told();
    const said = {};
    for (const who of ["rahul", "sofia", "zach", "tom", "claudia", "tess", "lloyd", "yusuf", "amara", "nobody", null]) {
      const answer = await summary(who);
      said[who ?? "signed out"] =
        answer.status === 200 ? (answer.body.whosComing === null ? "no list" : `${answer.body.whosComing.length} people`) : answer.status;
    }
    assert.deepEqual(said, {
      rahul: "4 people",
      sofia: "4 people",
      // An admin reads the group everywhere else, and no admin's Home draws the list.
      zach: "no list",
      // Group C's facilitator, the programme's lead, another lead, the reviewer,
      // the run's track lead, a member in the group and a member in none.
      tom: 403,
      claudia: 403,
      tess: 403,
      lloyd: 403,
      yusuf: 403,
      amara: 403,
      nobody: 403,
      "signed out": 401,
    });
  });

  test("a facilitator who holds a place is handed the list of everybody else in the group, and is on their co-facilitators' list", async () => {
    await told();
    // Amara, placed in Group B and told, becomes one of its facilitators too:
    // a facilitator who holds a place is one of the group's people.
    w.world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "amara"] });
    assert.deepEqual((await summary("amara")).body.whosComing, [
      { firstName: "Dev", coming: false },
      { firstName: "Kofi", coming: true },
      { firstName: "Sam", coming: false },
    ]);
    const drawn = await home("amara", "Amara");
    assert.ok(drawn.text.includes("Who’s coming 1 of 3 said they’re coming. Dev and Sam haven’t said."), drawn.text);
    assert.doesNotMatch(drawn.html, /Amara<span class="srOnly">/, "Amara is told whether Amara is coming");
    // To Rahul, Amara is one of the group's people like anybody in it.
    assert.deepEqual(
      (await summary("rahul")).body.whosComing.map((person) => person.firstName),
      ["Amara", "Dev", "Kofi", "Sam"],
    );
  });

  test("a facilitator of another group is handed their own group's list, and never this one's", async () => {
    await told();
    const own = (await summary("tom", C)).body.whosComing.map((person) => person.firstName);
    assert.deepEqual(own, ["Bea", "Callum", "Tariq", "Zach"]);
    for (const name of ["Amara", "Dev", "Kofi", "Sam"]) assert.ok(!own.includes(name));
  });
});

// ---------------------------------------------------------------------------
// 3. Only first names, and only coming or hasn't said
// ---------------------------------------------------------------------------

describe("3. only a first name, and coming or hasn't said", () => {
  test("each entry is a first name and a yes or a no, and nothing else", async () => {
    await told();
    const { whosComing } = (await summary("rahul")).body;
    for (const person of whosComing) {
      assert.deepEqual(Object.keys(person).sort(), ["coming", "firstName"]);
      assert.equal(typeof person.coming, "boolean");
      assert.doesNotMatch(person.firstName, /\s/, `${person.firstName} is more than a first name`);
    }
    const sent = JSON.stringify(whosComing);
    for (const word of ["Okafor", "Patel", "Asante", "Whitfield", "@", ANSWER, "Philosophy", "Graduating"]) {
      assert.ok(!sent.includes(word), `the list carries ${word}`);
    }
  });

  test("somebody who gives their place back leaves the list, and what they said is nowhere", async () => {
    await told();
    const answer = await reply("sam", { reply: "cant-make-it", reason: { kind: "other", other: SAM_REASON } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const body = (await summary("rahul")).body;
    assert.deepEqual(body.whosComing.map((person) => person.firstName), ["Amara", "Dev", "Kofi"]);
    const drawn = await home("rahul");
    for (const [what, haystack] of [
      ["the summary", JSON.stringify(body)],
      ["Home", drawn.html],
    ]) {
      assert.ok(!haystack.includes(SAM_REASON), `${what} carries the reason Sam gave`);
      assert.ok(!haystack.includes("can’t make it") && !haystack.includes("can't make it"), `${what} says somebody can't make it`);
      assert.ok(!haystack.includes("The times don’t work for me"), `${what} carries Nina's reason`);
    }
    assert.ok(drawn.text.includes("2 of 3 said they’re coming. Dev hasn’t said."), drawn.text);
    // Nina gave the place back before anybody was placed: never in anybody's list.
    for (const who of ["rahul", "tom"]) {
      const groupId = who === "rahul" ? B : C;
      const names = (await summary(who, groupId)).body.whosComing.map((person) => person.firstName);
      assert.ok(!names.includes("Nina"));
    }
  });

  test("a reply on the person's own page moves the list", async () => {
    await told();
    assert.equal((await reply("dev", { reply: "coming" })).status, 200);
    assert.deepEqual(
      (await summary("rahul")).body.whosComing.find((person) => person.firstName === "Dev"),
      { firstName: "Dev", coming: true },
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Only before the first session's day
// ---------------------------------------------------------------------------

describe("4. before the first session's day, and then the weekly Home", () => {
  test("Home before the first session: the ticket with Open your group, who's coming and Say hello, and no register yet", async () => {
    await told();
    const drawn = await home("rahul");
    assert.ok(
      drawn.text.startsWith(
        "Hi Rahul. Group B · AGI Strategy Fellowship Tue 3 Nov Your first session · week 1 Group B, 6pm Hallward B12 · with Sofia Open your group",
      ),
      drawn.text,
    );
    assert.match(drawn.html, /<a href="\/learn\/[^"]+\/group\/[^"]+" class="primary beforeOpen">Open your group<\/a>/);
    assert.ok(drawn.text.includes("Say hello Send your group a hello before Tue 3 Nov."), drawn.text);
    assert.match(drawn.html, /<a href="\/learn\/[^"]+\/group\/[^"]+\/update" class="secondary sayHelloButton">Write to Group B \(4\)<\/a>/);
    assert.ok(drawn.text.includes("Posts an update to the group and emails 4 people. Replies go to ai-safety@uonsu.com."), drawn.text);
    assert.ok(!drawn.text.includes(words.TAKE_THE_REGISTER), "Take the register before the first session's day");
    // The board's Week 1 guide: no record holds one.
    assert.ok(!drawn.text.includes("guide"), drawn.text);
  });

  test("the day before: Tomorrow, and the weekday", async () => {
    await told();
    at(DAY_BEFORE);
    const drawn = await home("rahul");
    assert.ok(drawn.text.includes("Tue 3 Nov Tomorrow · week 1 Group B, 6pm"), drawn.text);
    assert.ok(drawn.text.includes("Send your group a hello before Tuesday."), drawn.text);
  });

  test("from the first session's day, Home is the weekly Home and the summary hands no list", async () => {
    await told();
    for (const when of [FIRST_DAY, new Date("2026-11-04T12:00:00Z")]) {
      at(when);
      const body = (await summary("rahul")).body;
      assert.equal(body.whosComing, null, `a list on ${when.toISOString()}`);
      assert.equal(body.write, null, `Say hello's count on ${when.toISOString()}`);
      const drawn = await home("rahul");
      assert.ok(!drawn.text.includes(words.WHOS_COMING), drawn.text);
      assert.ok(!drawn.text.includes(words.SAY_HELLO), drawn.text);
      assert.ok(drawn.text.includes(words.TAKE_THE_REGISTER), drawn.text);
    }
    at(FIRST_DAY);
    assert.ok((await home("rahul")).text.includes("Tonight · your first session"));
  });

  test("reading the summary writes nothing", async () => {
    await told();
    const before = everything();
    await summary("rahul");
    await summary("sofia");
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 5. One reading
// ---------------------------------------------------------------------------

describe("5. one reading of the reply", () => {
  test("the facilitator's list agrees with the lead's Coming? column, person by person", async () => {
    await told();
    await reply("dev", { reply: "coming" });
    const list = (await summary("rahul")).body.whosComing;
    const view = viewOf(await peoplePage("claudia"));
    for (const person of list) {
      const row = view.rows.find((each) => each.firstName === person.firstName && each.group === "Group B");
      assert.ok(row, `${person.firstName} is not on the People tab`);
      assert.equal(row.coming.kind === "yes", person.coming, person.firstName);
    }
  });

  test("the words", () => {
    const list = (pairs) => pairs.map(([firstName, coming]) => ({ firstName, coming }));
    assert.equal(
      words.whosComingSentence(list([["Amara", true], ["Kofi", false], ["Chloe", true], ["Zara", false], ["Farah", true], ["Isaac", true], ["Priya", true], ["Sam", true]])),
      "6 of 8 said they’re coming. Kofi and Zara haven’t said.",
    );
    assert.equal(words.whosComingSentence(list([["Amara", true], ["Kofi", false]])), "1 of 2 said they’re coming. Kofi hasn’t said.");
    assert.equal(
      words.whosComingSentence(list([["A", false], ["B", false], ["C", false], ["D", true]])),
      "1 of 4 said they’re coming. A, B and C haven’t said.",
    );
    assert.equal(
      words.whosComingSentence(list([["A", false], ["B", false], ["C", false], ["D", false]])),
      "0 of 4 said they’re coming. 4 haven’t said.",
    );
    assert.equal(words.whosComingSentence(list([["A", true], ["B", true]])), "All 2 said they’re coming.");
    assert.equal(words.whosComingSentence(list([["A", true]])), "1 of 1 said they’re coming.");
    assert.equal(words.firstSessionEyebrow(true, [1]), "Tomorrow · week 1");
    assert.equal(words.firstSessionEyebrow(false, [1]), "Your first session · week 1");
    assert.equal(words.sayHelloLine("2026-11-03", true), "Send your group a hello before Tuesday.");
    assert.equal(words.sayHelloLine("2026-11-03", false), "Send your group a hello before Tue 3 Nov.");
  });

  test("the course side reads an application for a facilitator in one place", () => {
    const source = readFileSync(join(SRC, "app", "api", "courses", "groups", "[groupId]", "summary", "route.ts"), "utf8");
    // Who is asked, and when: a facilitator, before the first session's day,
    // about the people the facilitator's own view of the group lists, but the
    // reader (a facilitator who holds a place is one of them, and is not told
    // about themselves; the test of a facilitator who holds a place runs it).
    assert.match(source, /!isAdmin && isBeforeFirstSessionDay\(firstSessionDayOf\(run, group, now\), now\)/);
    assert.match(
      source,
      /model\.people\s*\.filter\(\(person\) => person\.uid !== actor\.uid\)\s*\.map\(\(person\) => \(\{ uid: person\.uid, firstName: person\.firstName \}\)\)/,
    );
    // And what leaves: a first name and a yes or a no, field by field.
    assert.match(source, /whosComing\.map\(\(person\) => \(\{ firstName: person\.firstName, coming: person\.coming \}\)\)/);
  });
});
