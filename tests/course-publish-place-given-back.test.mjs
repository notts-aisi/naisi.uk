/**
 * Publish leaves out a place given back, and Remove leaves alone somebody who
 * left by themselves.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET   /api/courses/runs/[runId]/allocation              the cards and the Publish summary
 *   POST  /api/courses/runs/[runId]/allocation/publish/test
 *   POST  /api/courses/runs/[runId]/allocation/publish
 *   POST  /api/courses/runs/[runId]/enrolments/[uid]/remove
 *   POST  /api/courses/runs/[runId]/allocate                 putting somebody back
 *   the allocation board, drawn from the board route's own answer
 *
 * ## What this guards
 *
 *  1. ONE ANSWER FOR "GAVE THEIR PLACE BACK". Somebody placed in a group and
 *     not told yet who gives their place back on the form keeps their seat,
 *     and their card says "Gave their place back". Publish asks the card's
 *     own question of the card's own facts, so its count, its test and its
 *     press leave them out: nobody who gave their place back is emailed a
 *     group, counted, stamped as told, put on the cohort's list or pushed.
 *     The summary says how many, and the press sends exactly the number on
 *     the button. As an admin and as the programme's lead. Somebody handed
 *     over and never placed who gives it back is not waited for either:
 *     their card stays in Unallocated with its badge, the rail counts them
 *     apart from who is still to place, and the press goes without them.
 *  2. BESIDE EVERY OTHER KIND OF CARD: one that left by each door, one
 *     removed, a late placement and the people told already. The
 *     facilitators' email counts nobody who gave their place back.
 *  3. THE BOARD DRAWS IT: the sentence in the Publish area, the cards'
 *     badges, the button's number, which cards offer Remove, and the
 *     confirmation.
 *  4. PUTTING SOMEBODY BACK is still how somebody who left comes back: their
 *     card stops saying they gave their place back, and Publish tells them.
 *     A move records nothing, and somebody who leaves again is not back.
 *  5. NO REMOVE FOR SOMEBODY WHO LEFT BY THEMSELVES, by either door. The
 *     board offers none, and the route refuses with the day they left, in
 *     London, writing nothing. Somebody removed, placed and not told, or told
 *     and in their group is removed as before.
 *  6. THE TREE: one reading of each fact, one answer, and every route that
 *     reads a plan hands it the facts the cards are drawn from.
 *
 * Built on `tests/lib/handoverWorld.mjs`: the real handlers, the term's form
 * (AGI Strategy names the run and Claudia leads it), and the run as the
 * Publish suite reshapes it (Group B on Tuesdays with Rahul and Sofia, Group
 * A on Thursdays with Sofia, Group C online with Tom and nobody in it). The
 * board is drawn on the server through the same loader, with its data hook
 * handed the route's answer. Faked beside the world's own: the rate limiter
 * (every request is somebody's first), the stylesheets and Next's link.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { walkSource } from "./lib/functionScan.mjs";
import {
  COURSE,
  GROUP,
  RUN,
  applicationPath,
  decisionPath,
  groupDoc,
  loadJoin,
  makeWorld,
  namedSeed,
} from "./lib/handoverWorld.mjs";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const repoPath = (file) => relative(REPO_ROOT, file).split(sep).join("/");

const KEY = "__publishGivenBack";
const HANDLE = `globalThis[${JSON.stringify(KEY)}]`;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

/** Every stylesheet any file under `src` imports, by the specifier it is imported by. */
function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
}

const made = makeWorld(KEY, [
  [
    "@/lib/rateLimit",
    "export function rateLimit() { return { ok: true, retryAfterSeconds: 0 }; }\n" +
      "export function clientIp() { return '10.0.0.1'; }",
  ],
  ["next/link", `export default ({ href, className, children }) => ${HANDLE}.h('a', { href, className }, children);`],
  // The board's data hook, handed what the board route answered.
  [
    "./useAllocation",
    "export function useAllocation() {\n" +
      `  return { data: ${HANDLE}.board, loading: false, error: null, reload() {}, place: async () => ({ ok: true }),\n` +
      "    publishAllocation: async () => ({ ok: true }), sendPublishTest: async () => ({ ok: true }),\n" +
      "    removeEnrolment: async () => ({ ok: true }) };\n" +
      "}\n" +
      "export default useAllocation;",
  ],
  ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
]);
const { world, reset, call, everything } = made;
world.h = createElement;
world.board = null;
const join_ = await loadJoin(made);
const { routes, press, board, place, reply } = join_;
const enrol = await made.courseRoute("runs", "[runId]", "enrol");
const words = await made.lib("courses", "publishWords.ts");
const fit = await made.lib("..", "features", "courses", "allocationFit.ts");
const tally = await made.lib("..", "features", "courses", "allocationTally.ts");
const { default: AllocationBoard } = await made.loadTs(join("features", "courses", "AllocationBoard.tsx"));

// Tue 27 Oct 2026, 5:38pm in London (the clocks went back on the 25th).
const NOW = new Date("2026-10-27T17:38:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const B = GROUP.monday;
const A = GROUP.thursday;
const C = GROUP.unset;
const CALLERS = [
  ["an admin", "zach"],
  ["the programme's lead", "claudia"],
];
const TIMES = { kind: "times", other: "" };
const LEFT_ON_THE_27TH = "They left on Tue 27 Oct, so their seat is already free and there’s nothing to remove.";

/** Six taught weeks from Thu 29 Oct: a Tuesday group meets from Tue 3 Nov to Tue 8 Dec. */
const SIX_WEEKS = Array.from({ length: 6 }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: `w0${i + 1}` }));
const slot = (over) => ({ weekday: 2, startTimeLocal: "18:00", durationMinutes: 120, location: "Hallward B12", meetingUrl: null, notes: "", ...over });

/** The term after decision day, with the run reshaped as the Publish suite has it. */
function hubSeed() {
  const seed = namedSeed();
  for (const [uid, name] of [["rahul", "Rahul Mehta"], ["sofia", "Sofia Rossi"], ["tom", "Tom Fletcher"]]) {
    seed[`users/${uid}`] = userDoc(session(uid, "member", false, name));
  }
  seed[`courseRuns/${RUN.agi}`] = { ...seed[`courseRuns/${RUN.agi}`], startDate: "2026-10-29", weekPlan: SIX_WEEKS };
  seed[`courseGroups/${B}`] = groupDoc({ name: "Group B", facilitatorUids: ["rahul", "sofia"], session: slot() });
  seed[`courseGroups/${A}`] = groupDoc({ name: "Group A", facilitatorUids: ["sofia"], session: slot({ weekday: 4, location: "Portland A13" }) });
  seed[`courseGroups/${C}`] = groupDoc({
    name: "Group C",
    facilitatorUids: ["tom"],
    session: slot({ weekday: 3, startTimeLocal: "13:00", location: "", meetingUrl: "https://meet.example/j/1" }),
  });
  return seed;
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  reset(hubSeed(), { now: () => new Date() });
  world.board = null;
  // The Admin SDK's sweep of a document and what is under it, which a leave's
  // sweep of somebody's week cards calls. Nothing here has anything under it.
  world.db.recursiveDelete = async (ref) => ref.delete();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const seat = (uid) => read(seatPath(uid));

/** Let the work a route leaves running after its answer (an email) finish. */
async function settle() {
  for (let i = 0; i < 25; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Somebody else who holds a place on AGI Strategy by their own ranking: a copy
 * of Amara's application and decision, theirs, and an account.
 */
function holdsAPlace(uid, name) {
  const application = structuredClone(read(applicationPath("amara")));
  Object.assign(application, { uid, email: `${uid}@example.com`, displayName: name });
  for (const content of [application.draft, application.sent]) content.aboutYou.preferredName = name.split(" ")[0];
  world.db.seed(applicationPath(uid), application);
  world.db.seed(decisionPath(uid), { ...structuredClone(read(decisionPath("amara"))), uid });
  world.db.seed(`users/${uid}`, userDoc(session(uid, "member", false, name)));
}

/** Everybody who holds a place, handed over and put in a group: Amara and Dev in B, Bea and Tariq in A. */
async function placed(who = "zach") {
  assert.equal((await press()).status, 200);
  const done = await place(who, [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: A },
  ]);
  assert.equal(done.body.placed, 4, JSON.stringify(done.body));
}

/** "I can’t make it" from somebody's application page, and what it sends after its answer. */
async function cantMakeIt(uid) {
  const answer = await reply(uid, { reply: "cant-make-it", reason: TIMES });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  await settle();
}

/** "Leave the programme" on somebody's programme page. */
async function leaves(uid) {
  const answer = await call(uid, enrol.DELETE, { runId: RUN.agi }, {
    body: { confirmName: "AGI Strategy Fellowship", reason: "Too much on this term." },
    course: true,
  });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  await settle();
}

const summary = async (who) => (await board(who)).body.publish;
const sendTest = (who) => call(who, routes.publishTest.POST, { runId: RUN.agi }, { course: true });
const pressWith = (who, emails) => call(who, routes.publish.POST, { runId: RUN.agi }, { body: { emails }, course: true });
const remove = (who, uid) => call(who, routes.remove.POST, { runId: RUN.agi, uid }, { course: true });

const isTest = (mail) => mail.subject.startsWith("[TEST]");
const isFacilitating = (mail) => mail.subject.replace("[TEST] ", "").startsWith("You’re facilitating");
const realMail = () => world.mail.filter((mail) => !isTest(mail));

/** A test first, then a press with the number on the button: the board's own way. Returns the number and the answer. */
async function testThenPress(who) {
  const tested = await sendTest(who);
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  const shown = (await summary(who)).emails;
  const before = realMail().length;
  const pressed = await pressWith(who, shown);
  assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
  return { shown, pressed, sent: realMail().slice(before) };
}

/** One sent email as its reader gets it. */
async function opened(mail) {
  const html = await render(mail.react);
  const text = html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { to: mail.to, subject: mail.subject, text };
}

/** The number a facilitators' email says is in the group. */
const groupSizeIn = (text) => Number((/There (?:is|are) (\d+) (?:person|people) in the group\./.exec(text) ?? [])[1]);

/** The cohort's mailing list, by address. */
const onTheList = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("subscriptions/"))
    .map((path) => read(path))
    .filter((row) => row.channel === `cohort:${RUN.agi}` && row.subscribed === true)
    .map((row) => row.email)
    .sort();

/** What each card on the board says, worked out by the card's own rule from the route's answer: uid to badge. */
async function cards(who) {
  const shown = (await board(who)).body;
  const groups = shown.groups.map((group) => ({ id: group.id, sessionLabel: group.sessionLabel }));
  return Object.fromEntries(
    shown.people.map((row) => [row.uid, fit.cardFit(row, groups.find((group) => group.id === row.groupId) ?? null, groups).gaveBack]),
  );
}

/** The board as `who` is drawn it: its words, its markup and the route's answer it was drawn from. */
async function drawn(who) {
  const answer = await board(who);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  world.board = answer.body;
  try {
    const html = renderToStaticMarkup(createElement(AllocationBoard, { courseId: COURSE.agi, runId: RUN.agi, runEditorHref: null }));
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return { html, text, body: answer.body };
  } finally {
    world.board = null;
  }
}

/** Whether a card offers Remove: its button carries the person's name as drawn. */
const offersRemove = (view, uid) => {
  const row = view.body.people.find((each) => each.uid === uid);
  assert.ok(row, `${uid} has no card`);
  return view.html.includes(`title="Take ${row.displayName} off this run"`);
};

/** The state section 2 builds, as `who` runs the board. */
async function everyKindOfCard(who) {
  await placed(who);
  await testThenPress(who);
  // Bea leaves from the programme's page; Dev, told, says "I can’t make it",
  // which is the same leave; the lead takes Tariq off the run.
  await leaves("bea");
  await cantMakeIt("dev");
  assert.equal((await remove("claudia", "tariq")).status, 200);
  // Two late acceptances are handed over and placed; Una, placed and not
  // told, gives the place back on the form. (Bea and Dev gave theirs back by
  // leaving, and Tariq's went back when the lead removed Tariq, so Amara is
  // the one already there. Until Remove gave the place on the form back, in
  // the follow-ups to Publish of October 2026, Tariq was there too and the
  // receipt said alreadyThere: 2.)
  holdsAPlace("una", "Una Byrne");
  holdsAPlace("kit", "Kit Morgan");
  assert.deepEqual((await press()).body.receipt, { handedOver: 2, alreadyThere: 1 });
  assert.equal((await place(who, [{ uid: "una", groupId: B }, { uid: "kit", groupId: A }])).body.placed, 2);
  await cantMakeIt("una");
  // And the lead asks Tom to run Group B as well.
  world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "tom"] });
}

// ---------------------------------------------------------------------------
// 1. Publish leaves out a card that says "Gave their place back"
// ---------------------------------------------------------------------------

describe("1. Publish leaves out somebody placed and not told who gave their place back", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: the count, the test and the press leave Amara out, and the summary says so`, async () => {
      await placed(who);
      await cantMakeIt("amara");
      // Amara's seat is where it was: nothing of the run moved.
      assert.deepEqual([seat("amara").status, seat("amara").groupId, seat("amara").allocatedEmailAt], ["active", B, undefined]);
      assert.equal((await cards(who)).amara, true, "Amara's card says Gave their place back");

      // The count: Bea, Dev and Tariq, and the three facilitators of the two
      // groups with somebody in them. Until Publish read the form (October
      // 2026) it was 7, Amara among them.
      const shown = await summary(who);
      assert.deepEqual(
        [shown.emails, shown.people, shown.facilitators, shown.more, shown.noAddress, shown.emptyGroups, shown.refusals, shown.gaveBack],
        [6, 3, 3, 0, [], ["Group C"], [], 1],
      );

      // The test is the first person a press writes to: Bea, never Amara.
      const tested = await sendTest(who);
      assert.deepEqual([tested.status, tested.body.emails, tested.body.recorded], [200, 2, true]);
      const [person, facilitator] = await Promise.all(world.mail.map(opened));
      assert.ok(person.text.includes("You've been placed, Bea"), person.text);
      assert.ok(!person.text.includes("Amara"), person.text);
      // Rahul's Group B, which Amara's seat sits in: Dev alone is counted.
      assert.ok(facilitator.text.includes("Hi Rahul,"), facilitator.text);
      assert.equal(groupSizeIn(facilitator.text), 1);

      // The press sends exactly the number on the button, and Amara nothing.
      const pressed = await pressWith(who, (await summary(who)).emails);
      assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
      assert.equal(realMail().length, 6);
      assert.deepEqual(realMail().filter((mail) => !isFacilitating(mail)).map((mail) => mail.to).sort(), [
        "bea@example.com",
        "dev@example.com",
        "tariq@example.com",
      ]);
      assert.deepEqual(realMail().filter(isFacilitating).map((mail) => mail.to).sort(), [
        "rahul@example.com",
        "sofia@example.com",
        "sofia@example.com",
      ]);
      assert.deepEqual([pressed.body.report.people, pressed.body.report.facilitators], [
        { sent: 3, held: 0, suppressed: 0 },
        { sent: 3, held: 0, suppressed: 0 },
      ]);
      for (const mail of await Promise.all(realMail().filter(isFacilitating).map(opened))) {
        assert.equal(groupSizeIn(mail.text), mail.subject.includes("Group B") ? 1 : 2, mail.subject);
      }
      // Nothing stamps Amara as told, lists Amara or pushes to Amara.
      assert.deepEqual([seat("amara").allocatedEmailAt, seat("amara").allocatedEmailDelivery], [undefined, undefined]);
      for (const uid of ["bea", "dev", "tariq"]) assert.ok(seat(uid).allocatedEmailAt instanceof Date, uid);
      assert.deepEqual(onTheList(), ["bea@example.com", "dev@example.com", "tariq@example.com"]);
      assert.deepEqual(world.pushes.map((push) => push.uid).sort(), ["bea", "dev", "tariq"]);

      // Afterwards the board still says so, and owes nothing.
      const after = await summary(who);
      assert.deepEqual([after.emails, after.people, after.facilitators, after.gaveBack], [0, 0, 0, 1]);
      // Removing Amara frees the seat, and the sentence goes.
      assert.equal((await remove(who, "amara")).status, 200);
      assert.equal(read(`courseGroups/${B}`).memberCount, 1);
      assert.equal("gaveBack" in (await summary(who)), false);
      assert.equal(world.mail.filter((mail) => mail.to === "amara@example.com").length, 0);
    });
  }

  test("a summary with nobody who gave their place back is exactly as it was: no count at all", async () => {
    await placed();
    assert.deepEqual(await summary("zach"), {
      adminOnly: false,
      emails: 7,
      people: 4,
      facilitators: 3,
      more: 0,
      noAddress: [],
      emptyGroups: ["Group C"],
      refusals: [],
      test: { state: "none", when: null, who: null },
    });
  });

  test("the run's track lead is told only that Publish is an admin's or the lead's, with no count", async () => {
    await placed();
    await cantMakeIt("amara");
    const shown = await summary("yusuf");
    assert.deepEqual([shown.adminOnly, shown.emails, "gaveBack" in shown], [true, 0, false]);
  });

  // Until the follow-ups to Publish (October 2026) somebody handed over and
  // never placed who gave their place back was waited for: their row still
  // said Accepted, only an admin could change it, and the press was refused
  // naming them (409, unplaced ["Tariq Mensah"], nothing sent). That test
  // ("is waited for as before, and named, not counted") is this one, as
  // strict, for both callers: their card is now nobody to place, as a
  // leaver's is, so the press goes, and still writes nothing to them.
  for (const [label, who] of CALLERS) {
    test(`as ${label}: somebody handed over and never placed who gives their place back is not waited for, counted or emailed`, async () => {
      assert.equal((await press()).status, 200);
      const done = await place(who, [
        { uid: "amara", groupId: B },
        { uid: "dev", groupId: B },
        { uid: "bea", groupId: A },
      ]);
      assert.equal(done.body.placed, 3, JSON.stringify(done.body));
      await cantMakeIt("tariq");
      assert.equal(seat("tariq"), undefined, "Tariq was never placed");

      // The board: Tariq's card stays in Unallocated with its badge, the
      // rail counts Tariq apart from who is still to place, and the pool's
      // own number leaves Tariq out.
      const view = await drawn(who);
      const row = view.body.people.find((each) => each.uid === "tariq");
      assert.deepEqual([row.groupId, row.enrolmentStatus, row.fromForm.holdsPlace], [null, "none", false]);
      assert.equal((await cards(who)).tariq, true, "Tariq's card says Gave their place back");
      const columns = new Set(view.body.groups.map((group) => group.id));
      const counted = tally.boardTally(view.body.people, (each) => !each.groupId || !columns.has(each.groupId));
      assert.deepEqual(
        [counted.accepted, counted.placed, counted.toPlace.map((each) => each.uid), counted.gaveBack, counted.left],
        [4, 3, [], 1, 0],
      );
      assert.ok(
        view.text.includes(
          "4 accepted · 3 placed · 0 unallocated · 1 gave their place back Refresh Select several " +
            "All 3 accepted applicants are placed, and 1 gave their place back. No one is in two groups.",
        ),
        view.text,
      );
      assert.ok(view.html.includes('aria-valuenow="100" aria-valuetext="3 of 3 accepted applicants placed"'), view.html);
      assert.ok(view.text.includes("Unallocated 0 Accepted applicants with no group yet."), view.text);
      assert.ok(view.html.includes('<section class="column columnPoolEmpty" aria-label="Unallocated">'), view.html);
      assert.equal(view.html.split("Gave their place back").length - 1, 1);

      // Publish's counts leave Tariq out: no seat, so nothing to free either.
      const shown = view.body.publish;
      assert.deepEqual(
        [shown.emails, shown.people, shown.facilitators, shown.more, shown.noAddress, shown.emptyGroups, shown.refusals, "gaveBack" in shown],
        [6, 3, 3, 0, [], ["Group C"], [], false],
      );

      // The test is the first person a press writes to, never Tariq.
      const tested = await sendTest(who);
      assert.deepEqual([tested.status, tested.body.emails, tested.body.recorded], [200, 2, true]);
      const [person] = await Promise.all(world.mail.filter(isTest).map(opened));
      assert.ok(person.text.includes("You've been placed, "), person.text);
      assert.ok(!person.text.includes("Tariq"), person.text);

      // The press is not refused for Tariq, and sends the number on the button.
      const pressed = await pressWith(who, (await summary(who)).emails);
      assert.deepEqual([pressed.status, pressed.body.unplaced], [200, []], JSON.stringify(pressed.body));
      assert.equal(realMail().length, 6);
      assert.deepEqual(realMail().filter((mail) => !isFacilitating(mail)).map((mail) => mail.to).sort(), [
        "amara@example.com",
        "bea@example.com",
        "dev@example.com",
      ]);
      assert.equal(world.mail.filter((mail) => mail.to === "tariq@example.com").length, 0);
      assert.ok(!onTheList().includes("tariq@example.com"));
      assert.ok(!world.pushes.some((push) => push.uid === "tariq"));
      assert.equal(seat("tariq"), undefined, "a press writes no seat for Tariq");

      // Afterwards the board owes nothing and still counts Tariq apart.
      const after = await drawn(who);
      assert.deepEqual([after.body.publish.emails, "gaveBack" in after.body.publish], [0, false]);
      assert.ok(after.text.includes("4 accepted · 3 placed · 0 unallocated · 1 gave their place back Refresh"), after.text);
    });
  }

  test("somebody in Unallocated who gives their place back beside somebody still to place: only the second is waited for", async () => {
    assert.equal((await press()).status, 200);
    await place("claudia", [
      { uid: "amara", groupId: B },
      { uid: "dev", groupId: B },
    ]);
    await cantMakeIt("tariq");
    const view = await drawn("claudia");
    const columns = new Set(view.body.groups.map((group) => group.id));
    const counted = tally.boardTally(view.body.people, (each) => !each.groupId || !columns.has(each.groupId));
    assert.deepEqual([counted.placed, counted.toPlace.map((each) => each.uid), counted.gaveBack], [2, ["bea"], 1]);
    assert.ok(view.text.includes("4 accepted · 2 placed · 1 unallocated · 1 gave their place back Refresh"), view.text);
    assert.ok(view.text.includes("Unallocated 1 Accepted applicants with no group yet."), view.text);
    assert.ok(!view.text.includes("No one is in two groups."), view.text);
    await sendTest("claudia");
    const refused = await pressWith("claudia", (await summary("claudia")).emails);
    assert.deepEqual([refused.status, refused.body.unplaced], [409, ["Bea Lindqvist"]]);
    assert.equal(realMail().length, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. Beside every other kind of card
// ---------------------------------------------------------------------------

describe("2. beside a card that left by each door, one removed, a late placement and the people told", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: the press sends Kit's and Tom's emails and nothing else, and Tom's counts Amara alone`, async () => {
      await everyKindOfCard(who);
      // Who is where: Amara told in B; Bea and Dev left by themselves; Tariq
      // removed; Kit placed in A and not told; Una placed in B and not told,
      // having given the place back.
      assert.deepEqual(
        Object.fromEntries(["amara", "bea", "dev", "tariq", "kit", "una"].map((uid) => [uid, [seat(uid).status, Boolean(seat(uid).allocatedEmailAt)]])),
        {
          amara: ["active", true],
          bea: ["withdrawn", true],
          dev: ["withdrawn", true],
          tariq: ["removed", false],
          kit: ["active", false],
          una: ["active", false],
        },
      );
      const shown = await summary(who);
      assert.deepEqual(
        [shown.emails, shown.people, shown.facilitators, shown.noAddress, shown.emptyGroups, shown.refusals, shown.gaveBack],
        [2, 1, 1, [], ["Group C"], [], 1],
      );

      const mailBefore = world.mail.length;
      const { shown: number, pressed, sent } = await testThenPress(who);
      // The test: Kit's email and Tom's, to the presser.
      const tests = await Promise.all(world.mail.slice(mailBefore).filter(isTest).map(opened));
      assert.deepEqual(tests.map((mail) => mail.to), [`${who}@example.com`, `${who}@example.com`]);
      assert.ok(tests[0].text.includes("You've been placed, Kit"), tests[0].text);
      // The press: the number on the button, and those two.
      assert.equal(sent.length, number);
      assert.deepEqual(sent.map((mail) => mail.to), ["kit@example.com", "tom@example.com"]);
      assert.deepEqual([pressed.body.report.people.sent, pressed.body.report.facilitators.sent], [1, 1]);
      const tom = await opened(sent[1]);
      assert.match(tom.subject, /^You’re facilitating Group B/);
      // Amara: told. Una gave the place back and Dev left: neither is counted.
      assert.equal(groupSizeIn(tom.text), 1);
      assert.deepEqual([seat("una").allocatedEmailAt, seat("una").allocatedEmailDelivery], [undefined, undefined]);
      assert.ok(seat("kit").allocatedEmailAt instanceof Date);
      assert.ok(!onTheList().includes("una@example.com"));
      assert.ok(!world.pushes.some((push) => push.uid === "una"));
      assert.equal(world.mail.filter((mail) => mail.to === "una@example.com").length, 0);
      // And the board still says it.
      const after = await summary(who);
      assert.deepEqual([after.emails, after.gaveBack], [0, 1]);
    });
  }

  test("the board's rail counts the same people, and the cards that say Gave their place back are every one the press left out", async () => {
    await everyKindOfCard("claudia");
    const shown = (await board("claudia")).body;
    const columns = new Set(shown.groups.map((group) => group.id));
    const counted = tally.boardTally(shown.people, (row) => !row.groupId || !columns.has(row.groupId));
    assert.deepEqual([counted.accepted, counted.placed, counted.toPlace.map((row) => row.uid), counted.left], [6, 3, [], 3]);
    // Una gave the place back while placed; Bea and Dev gave theirs back by
    // leaving; Tariq's went back when the lead removed Tariq, as leaving
    // gives it. (Until the follow-ups to Publish of October 2026 a removal
    // gave nothing back, and this list was bea, dev and una.)
    const badges = await cards("claudia");
    const saysItsGiven = Object.keys(badges).filter((uid) => badges[uid]).sort();
    assert.deepEqual(saysItsGiven, ["bea", "dev", "tariq", "una"]);
    // Nobody whose card says it is written to by this press.
    const { sent } = await testThenPress("claudia");
    assert.deepEqual(sent.map((mail) => mail.to), ["kit@example.com", "tom@example.com"]);
    for (const uid of saysItsGiven) assert.ok(!sent.some((mail) => mail.to === `${uid}@example.com`), uid);
  });
});

// ---------------------------------------------------------------------------
// 3. The board draws it
// ---------------------------------------------------------------------------

describe("3. the board draws it: the sentence, the badges, the button's number and which cards offer Remove", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}`, async () => {
      await everyKindOfCard(who);
      const view = await drawn(who);
      assert.ok(view.text.includes("1 person gave their place back, so they aren’t emailed. Remove them to free their seat."), view.text);
      assert.ok(view.text.includes("1 person and 1 facilitator"));
      assert.ok(view.text.includes("Publish and send 2 emails"));
      // The badge on Una's card, on the two who left by giving theirs back,
      // and on Tariq's, whose removal gave it back (3 until the follow-ups to
      // Publish of October 2026, when a removal gave nothing back).
      assert.equal(view.html.split("Gave their place back").length - 1, 4);
      // Remove for the people still on the run, and for nobody who left.
      assert.deepEqual(
        Object.fromEntries(["amara", "kit", "una", "bea", "dev", "tariq"].map((uid) => [uid, offersRemove(view, uid)])),
        { amara: true, kit: true, una: true, bea: false, dev: false, tariq: false },
      );
      // The lead takes Una off: the sentence goes, and so does the card's Remove.
      assert.equal((await remove(who, "una")).status, 200);
      const tidied = await drawn(who);
      assert.ok(!tidied.text.includes("gave their place back, so they aren’t emailed"));
      assert.equal(offersRemove(tidied, "una"), false);
    });
  }

  test("two or more are counted in one sentence, and the confirmation says it too", async () => {
    await placed();
    await cantMakeIt("amara");
    await cantMakeIt("tariq");
    const view = await drawn("zach");
    assert.ok(view.text.includes("2 people gave their place back, so they aren’t emailed. Remove them to free their seats."), view.text);
    const shown = view.body.publish;
    const confirm = words.publishConfirmText({
      runLabel: "Autumn 2026",
      emails: shown.emails,
      people: shown.people,
      facilitators: shown.facilitators,
      more: shown.more,
      noAddress: shown.noAddress,
      emptyGroups: shown.emptyGroups,
      gaveBack: shown.gaveBack,
      republish: false,
    });
    assert.equal(
      confirm,
      [
        "Publish Autumn 2026 and send 5 emails?",
        "2 emails to people placed in a group, with their group, day, room and facilitators. 3 emails to facilitators, with their group, day and room.",
        "Group C has nobody in it yet, so its facilitators are not emailed.",
        "2 people gave their place back, so they aren’t emailed. Remove them to free their seats.",
        "Emails cannot be unsent.",
      ].join("\n\n"),
    );
    // With nobody to leave out the confirmation is as it was.
    const plain = { runLabel: "R", emails: 1, people: 1, facilitators: 0, more: 0, noAddress: [], emptyGroups: [], republish: false };
    assert.equal(words.publishConfirmText({ ...plain, gaveBack: 0 }), words.publishConfirmText(plain));
    assert.ok(!words.publishConfirmText(plain).includes("gave their place back"));
  });

  test("the board hands its confirmation the summary's count", () => {
    const code = stripSource(readFileSync(join(SRC, "features", "courses", "AllocationBoard.tsx"), "utf8"));
    assert.match(code, /publishConfirmText\(\{[^}]*\bgaveBack: summary\.gaveBack \?\? 0,/);
  });
});

// ---------------------------------------------------------------------------
// 4. Putting somebody back
// ---------------------------------------------------------------------------

describe("4. putting somebody who left back is still how they come back", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: Bea's card stops saying Gave their place back, and Publish tells Bea`, async () => {
      await placed();
      await testThenPress("zach");
      await leaves("bea");
      assert.equal((await cards(who)).bea, true, "Bea gave the place back by leaving");
      const placedAgain = await place(who, [{ uid: "bea", groupId: A }]);
      assert.equal(placedAgain.body.placed, 1, JSON.stringify(placedAgain.body));
      // Putting Bea back gives her the place on the form again (the allocate
      // route, since the small follow-ups), so the seat keeps no put-back
      // record and her card reads the form: until then the place stayed given
      // back and the record was what stopped the card saying so.
      assert.deepEqual([seat("bea").status, "putBackAt" in seat("bea"), seat("bea").allocatedEmailAt], ["active", false, undefined]);
      const row = (await board(who)).body.people.find((each) => each.uid === "bea");
      assert.deepEqual([row.fromForm.holdsPlace, "putBack" in row], [true, false]);
      assert.equal((await cards(who)).bea, false);
      const shown = await summary(who);
      assert.deepEqual([shown.emails, shown.people, "gaveBack" in shown], [1, 1, false]);
      const { sent } = await testThenPress(who);
      assert.deepEqual(sent.map((mail) => mail.to), ["bea@example.com"]);
      assert.ok(seat("bea").allocatedEmailAt instanceof Date);
    });
  }

  test("somebody put back who leaves again is not back, and a move records nothing", async () => {
    await placed();
    await testThenPress("zach");
    await leaves("bea");
    await place("zach", [{ uid: "bea", groupId: A }]);
    await testThenPress("zach");
    await leaves("bea");
    const row = (await board("zach")).body.people.find((each) => each.uid === "bea");
    assert.equal("putBack" in row, false);
    assert.equal((await cards("zach")).bea, true);
    // Moving somebody who never left writes no such record.
    await place("zach", [{ uid: "amara", groupId: A }]);
    assert.equal(seat("amara").putBackAt, undefined);
    assert.equal("putBack" in (await board("zach")).body.people.find((each) => each.uid === "amara"), false);
  });
});

// ---------------------------------------------------------------------------
// 5. No Remove for somebody who left by themselves
// ---------------------------------------------------------------------------

describe("5. Remove refuses somebody who left by themselves, by either door, and is unchanged for everybody else", () => {
  for (const [label, who] of CALLERS) {
    test(`as ${label}: Bea and Dev are refused with the day they left, and nothing is written`, async () => {
      await everyKindOfCard("zach");
      const mailBefore = world.mail.length;
      for (const uid of ["bea", "dev"]) {
        const before = everything();
        const refused = await remove(who, uid);
        assert.deepEqual([refused.status, refused.body.error], [409, LEFT_ON_THE_27TH], uid);
        assert.equal(everything(), before, `refusing ${uid} wrote something`);
        assert.equal(seat(uid).status, "withdrawn");
      }
      await settle();
      assert.equal(world.mail.length, mailBefore, "a refused Remove sent something");
    });

    test(`as ${label}: somebody removed, placed and not told, or told and in their group is removed as before`, async () => {
      await everyKindOfCard("zach");
      // Tariq, removed already: answered as before, and the seat untouched.
      const tariq = JSON.stringify(seat("tariq"));
      assert.equal((await remove(who, "tariq")).status, 200);
      assert.equal(JSON.stringify(seat("tariq")), tariq);
      // Una, placed and not told, who gave the place back; and Amara, told.
      const memberCount = read(`courseGroups/${B}`).memberCount;
      for (const uid of ["una", "amara"]) {
        assert.equal((await remove(who, uid)).status, 200, uid);
        assert.deepEqual([seat(uid).status, seat(uid).groupId, seat(uid).droppedOutAt?.toISOString?.()], ["removed", null, NOW.toISOString()], uid);
      }
      assert.equal(read(`courseGroups/${B}`).memberCount, memberCount - 2);
    });
  }

  test("the day is London's: a leave half an hour after midnight on the night the clocks went back", async () => {
    await placed();
    await testThenPress("zach");
    await leaves("bea");
    // 00:30 on Sun 25 Oct in London is still Sat 24 Oct in UTC.
    world.db.poke(seatPath("bea"), { droppedOutAt: new Date("2026-10-24T23:30:00Z") });
    const refused = await remove("zach", "bea");
    assert.deepEqual([refused.status, refused.body.error], [409, "They left on Sun 25 Oct, so their seat is already free and there’s nothing to remove."]);
  });

  test("with no day on record, it says they left by themselves", async () => {
    await placed();
    await testThenPress("zach");
    await leaves("bea");
    world.db.poke(seatPath("bea"), { droppedOutAt: null });
    const before = everything();
    const refused = await remove("claudia", "bea");
    assert.deepEqual([refused.status, refused.body.error], [409, "They left by themselves, so their seat is already free and there’s nothing to remove."]);
    assert.equal(everything(), before);
  });

  test("signed out, a member and a facilitator are refused before anything is read, as before", async () => {
    await placed();
    await testThenPress("zach");
    await leaves("bea");
    const before = everything();
    const signedOut = await remove(null, "bea");
    assert.deepEqual([signedOut.status, signedOut.body.error], [401, "Not signed in"]);
    for (const uid of ["amara", "rahul"]) {
      const refused = await remove(uid, "bea");
      assert.deepEqual([refused.status, refused.body.error], [403, "Forbidden"], uid);
    }
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 6. The tree
// ---------------------------------------------------------------------------

/** Every TypeScript file under `src`, by its path from the repository, with its code (comments gone, strings emptied). */
const SOURCE = [...walkSource(SRC)]
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => [repoPath(file), stripSource(readFileSync(file, "utf8"))]);

const filesWhere = (pattern) => SOURCE.filter(([, code]) => pattern.test(code)).map(([file]) => file).sort();

/**
 * Every file whose code names `holdsPlace` at all, and what the word means
 * there. Three things share it: the board's fact about a place on the form
 * (`board`), the events' answer to whether an attendee holds a place
 * (`events`), and Home's answer to whether a member holds a place on any
 * programme (`home`). A new file that names it is listed here with what it
 * means, so a second reading of the board's fact cannot arrive unlisted.
 */
const NAMES_HOLDS_PLACE = {
  "src/lib/applications/handover/board.ts": ["board", "works the fact out from the form, by holdsPlaceOn"],
  "src/app/api/courses/runs/[runId]/allocation/route.ts": ["board", "copies the fact onto the board's row, field by field"],
  "src/features/courses/allocationFit.ts": ["board", "the card's type for the fact, which it hands to the one answer"],
  "src/lib/courses/placeGivenBack.ts": ["board", "the one answer, asked by the card and by Publish's plan"],
  "src/lib/events/location.ts": ["events", "whether an event's attendee holds a place, for where the event is"],
  "src/lib/events/sendRsvpEmail.ts": ["events", "asks the events' answer for one attendee's email"],
  "src/app/api/events/[id]/broadcast/route.ts": ["events", "asks the events' answer for each attendee's copy"],
  "src/features/applications/home/holdsPlace.ts": ["home", "Home's answer to whether a member holds a place on any programme"],
  "src/app/(app)/dashboard/page.tsx": ["home", "asks Home's answer"],
  "src/app/(app)/learn/page.tsx": ["home", "asks Home's answer"],
};

/** Of the files that name the board's fact, the ones that read it, and why they may. */
const READS_THE_PLACE = {
  "src/lib/courses/placeGivenBack.ts": "the one answer: the card and Publish's plan both ask it",
  "src/app/api/courses/runs/[runId]/allocation/route.ts": "copies the server's fact onto the board's row, field by field, for the card to ask the one answer",
};

/** Every file that reads or writes when somebody was put back on a run, and why. */
const READS_THE_PUT_BACK = {
  "src/lib/firestore/courseEnrolments.ts": "the enrolment's normaliser, and enrolmentIsPutBack, the one reading of it",
  "src/app/api/courses/runs/[runId]/allocate/route.ts":
    "writes it, in the patch that puts somebody who left back on the run when the form has no place to give them again, and clears it when it gives one",
};

/** Every caller of the one answer, and of the one reading of a put-back. */
const ASKS_THE_ANSWER = {
  "src/features/courses/allocationFit.ts": "the card: whether it says Gave their place back",
  "src/lib/courses/allocationPublish.ts": "Publish's plan: whom it leaves out",
};
const ASKS_THE_PUT_BACK = {
  "src/app/api/courses/runs/[runId]/allocation/route.ts": "the board's row, which the card hands to the one answer",
  "src/lib/courses/allocationPublish.ts": "Publish's plan, which hands it to the one answer",
};

/** Every route that reads a plan of Publish. */
const READS_A_PLAN = [
  "src/app/api/courses/runs/[runId]/allocation/publish/route.ts",
  "src/app/api/courses/runs/[runId]/allocation/publish/test/route.ts",
  "src/app/api/courses/runs/[runId]/allocation/route.ts",
];

describe("6. one reading of each fact, one answer, and the facts handed to every plan", () => {
  test("the walk reads the tree and finds the files it expects there", () => {
    assert.ok(SOURCE.length > 500, "too few files were read: has the tree moved?");
    assert.ok(SOURCE.some(([file]) => file === "src/lib/courses/placeGivenBack.ts"));
  });

  test("every file that names holdsPlace is listed with what it means there, both ways", () => {
    assert.deepEqual(
      filesWhere(/\bholdsPlace\b/),
      Object.keys(NAMES_HOLDS_PLACE).sort(),
      "the files whose code names holdsPlace are not the ones listed in NAMES_HOLDS_PLACE. A file that reads the " +
        "board's fact about a place on the form asks gaveTheirPlaceBack (src/lib/courses/placeGivenBack.ts) instead, " +
        "so the card and Publish cannot disagree; anything else goes on the list with what the word means there.",
    );
    for (const [file, [meaning, why]] of Object.entries(NAMES_HOLDS_PLACE)) {
      assert.ok(["board", "events", "home"].includes(meaning), file);
      assert.ok(why.length > 15, `${file} needs its reason written down`);
    }
    // The other two meanings are their own functions, not the board's fact.
    assert.match(readFileSync(join(SRC, "lib", "events", "location.ts"), "utf8"), /export function holdsPlace\(status/);
    assert.match(readFileSync(join(SRC, "features", "applications", "home", "holdsPlace.ts"), "utf8"), /export async function holdsPlace\(uid/);
  });

  test("the board's fact is read only by the one answer and by the row that carries it", () => {
    assert.deepEqual(
      filesWhere(/\.holdsPlace\b/),
      Object.keys(READS_THE_PLACE).sort(),
      "a file reads holdsPlace off the board's facts and is not listed. Whether somebody gave their place back is " +
        "asked of gaveTheirPlaceBack (src/lib/courses/placeGivenBack.ts), so the card and Publish cannot disagree.",
    );
    for (const file of Object.keys(READS_THE_PLACE)) assert.equal(NAMES_HOLDS_PLACE[file]?.[0], "board", file);
  });

  test("when somebody was put back is read in one place and written in one", () => {
    assert.deepEqual(filesWhere(/\.putBackAt\b/), Object.keys(READS_THE_PUT_BACK).sort());
    assert.deepEqual(filesWhere(/\benrolmentIsPutBack\s*\(/), [...Object.keys(ASKS_THE_PUT_BACK), "src/lib/firestore/courseEnrolments.ts"].sort());
  });

  test("the card and Publish's plan, and nothing else, ask the one answer", () => {
    assert.deepEqual(
      filesWhere(/\bgaveTheirPlaceBack\s*\(/),
      [...Object.keys(ASKS_THE_ANSWER), "src/lib/courses/placeGivenBack.ts"].sort(),
    );
    for (const [file, what] of Object.entries({ ...READS_THE_PLACE, ...READS_THE_PUT_BACK, ...ASKS_THE_ANSWER, ...ASKS_THE_PUT_BACK })) {
      assert.ok(what.length > 20, `${file} needs its reason written down`);
    }
  });

  test("every route that reads a plan hands it the facts the cards are drawn from", () => {
    assert.deepEqual(filesWhere(/\bloadPublishPlan\s*\(/), [...READS_A_PLAN, "src/lib/courses/allocationPublish.ts"].sort());
    for (const file of READS_A_PLAN) {
      const code = SOURCE.find(([path]) => path === file)[1];
      assert.match(code, /\bformPlaceFactsFor\(\s*db,\s*staffing,/, `${file} does not read the facts the cards are drawn from`);
      const plan = /loadPublishPlan\(db, run, \{([^}]*)\}\)/.exec(code);
      assert.ok(plan, `${file} reads a plan some other way`);
      assert.match(plan[1], /\bformPlaces\b/, `${file} hands its plan no facts`);
    }
  });
});
