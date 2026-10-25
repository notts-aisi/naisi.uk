/**
 * THE "OFFER FREED PLACES" PAGE, AND THE WAY TO IT FROM THE APPLICATIONS TAB.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 *  1. ONLY WHOEVER MAY OFFER IS SHOWN IT: an admin, or the programme's lead
 *     (since the course hub's lead access, Q1). Its reviewer is told who
 *     offers, and anybody with no role on it is answered as for a programme
 *     that is not there, before anybody's application is read. The lead is
 *     shown a person's score once their own review of that application is
 *     done, as on every list of applications.
 *  2. IT LISTS THE PEOPLE A FREED PLACE CAN BE OFFERED TO AND NOBODY ELSE:
 *     told "No offer this time", ranked the programme, pooled by it. Each
 *     with their score for it, when they are free in a few words, and which
 *     of the run's groups their week covers, by #67's fit reading.
 *  3. EVERY VALUE IS FROM A RECORD: how many places are free, who gave
 *     theirs back, the last day of week 1, the groups' times and seats.
 *  4. NOTHING IT IS SENT CARRIES AN ADDRESS OR A PAINTED WEEK.
 *  5. THE PREVIEW IS THE EMAIL: composed from the page's own fields by the
 *     function the send composes with, it is the text that arrives.
 *  6. THE APPLICATIONS TAB LEADS THERE, for an admin and the programme's
 *     lead once decisions have gone out, and for nobody else.
 *
 * Real: the loader, both pages (rendered to HTML), the client board, the
 * Applications tab's board, the routes a press makes, and every library
 * beneath them. Stubbed: what `tests/lib/freedPlacesWorld.mjs` stubs, the page
 * gate (it returns the session), the router, `next/link` and the stylesheets.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AGI,
  GROUP,
  ROUND,
  applicationPath,
  freedSeed,
  loadRoutes,
  makeFreedWorld,
} from "./lib/freedPlacesWorld.mjs";

const TUESDAY = new Date("2026-10-27T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: TUESDAY });

globalThis.__freedPage = { h: createElement };
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const STYLESHEETS = [
  "./FreedPlacesBoard.module.css",
  "./ApplicationsBoard.module.css",
  "./parts.module.css",
  "./Select.module.css",
  "./InitialsChip.module.css",
  "./decisionDay.module.css",
  "./editor.module.css",
  "@/features/applications/kit/kit.module.css",
];
const made = makeFreedWorld("__freedPageWorld", [
  ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
  ["next/link", "export default ({ href, className, children }) => globalThis.__freedPage.h('a', { href, className }, children);"],
  ["next/navigation", "export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });"],
  ["@/lib/firebase/pageGates", "export async function requireAdmissionsPage() { return __WORLD__.user; }"],
]);
const { world, reset, lib, loadTs, sessionOf } = made;
const api = await loadRoutes(made);
const load = await lib("applications", "freedPlaces", "load.ts");
const words = await lib("applications", "freedPlaces", "words.ts");
const rules = await lib("applications", "freedPlaces", "rules.ts");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "applications");
const { default: FreedPlacesPage } = await loadTs(join(PROGRAMME, "freed-places", "page.tsx"));
const { default: ApplicationsPage } = await loadTs(join(PROGRAMME, "page.tsx"));

const REPLY_BY = "2026-10-29";
const LIST = `/admin/admissions/forms/${ROUND}/programmes/${AGI}/applications`;

beforeEach(() => {
  mock.timers.setTime(TUESDAY.getTime());
  reset();
});

const boardFor = async (uid) => load.loadOfferBoard(world.db, sessionOf(uid), ROUND, AGI, new Date());
const params = { params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) };
const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
async function pageAs(uid, Page = FreedPlacesPage) {
  world.user = sessionOf(uid);
  return renderToStaticMarkup(await Page(params));
}

// ---------------------------------------------------------------------------
// 1. Who is shown it
// ---------------------------------------------------------------------------

describe("who is shown the page", () => {
  test("an admin and the lead are shown the board; the reviewer is told who offers; anybody else is not found", async () => {
    const answers = {};
    for (const uid of ["zach", "claudia", "lloyd", "tess", "yusuf", "omar", "nobody"]) {
      const loaded = await boardFor(uid);
      answers[uid] = loaded.ok ? "board" : loaded.kind;
    }
    // The lead is shown the board since the course hub's lead access (Q1).
    assert.deepEqual(answers, {
      zach: "board",
      claudia: "board",
      lloyd: "not-yours",
      tess: "not-found",
      yusuf: "not-found",
      omar: "not-found",
      nobody: "not-found",
    });
  });

  test("for anybody who may not offer, nobody's application is read", async () => {
    for (const uid of ["lloyd", "tess"]) {
      const before = world.db.stats.reads;
      await boardFor(uid);
      // The form, and nothing after it: the answer is decided on the form alone.
      assert.equal(world.db.stats.reads - before, 1, uid);
    }
  });

  test("the reviewer reads who offers, in words, and is shown nobody", async () => {
    const text = textOf(await pageAs("lloyd"));
    assert.ok(text.includes("This page is for the programme’s lead and admins"), text);
    assert.ok(text.includes(rules.ADMINS_OFFER), text);
    assert.equal(text.includes("Omar"), false, "nobody is named to them");
  });

  test("the lead is shown a score once their own review of that application is done, and an admin every score", async () => {
    const scores = async (uid) =>
      Object.fromEntries((await boardFor(uid)).board.people.map((person) => [person.uid, person.score]));
    // Claudia scored Omar, so she is shown what both reviewers gave; she has
    // not reviewed George, so his score is held back from her.
    assert.deepEqual(await scores("claudia"), { omar: "3.5", george: null, lena: null, rory: null });
    assert.deepEqual(await scores("zach"), { omar: "3.5", george: "3.0", lena: null, rory: null });
    // Once she has, she is.
    world.db.seed(`admissionReviews/${ROUND}__george__claudia`, {
      roundId: ROUND,
      applicantUid: "george",
      reviewerUid: "claudia",
      scores: { [`${AGI}.event`]: 4 },
      comments: [],
      notes: "",
    });
    assert.equal((await scores("claudia")).george, "3.5");
  });

  test("the lead's page is the board, and names the people a place can be offered to", async () => {
    const text = textOf(await pageAs("claudia"));
    assert.ok(text.includes("Offer 2 freed places"), text);
    assert.ok(text.includes("Omar Haddad"), text);
    assert.equal(text.includes("This page is for"), false);
  });
});

// ---------------------------------------------------------------------------
// 2. What the board says, every value from a record
// ---------------------------------------------------------------------------

describe("what an admin is shown", () => {
  test("the heading, who gave theirs back, and the window, from the records", async () => {
    const { board } = await boardFor("zach");
    assert.deepEqual(
      [board.free, board.heading, board.gaveBack, board.window, board.told],
      [
        2,
        "Offer 2 freed places",
        "Nina Petrova gave theirs back.",
        { open: true, sentence: "You can offer freed places until Sun 1 Nov, the end of week 1." },
        "All of them read No offer this time on Fri 23 Oct.",
      ],
    );
  });

  test("the people listed are exactly the pooled people told no offer who ranked it, those who fit first, by score", async () => {
    const { board } = await boardFor("zach");
    assert.deepEqual(
      board.people.map((person) => person.uid),
      ["omar", "george", "lena", "rory"],
    );
  });

  test("each with their score, when they are free, which groups they fit, and why one cannot be picked", async () => {
    const { board } = await boardFor("zach");
    const byUid = Object.fromEntries(board.people.map((person) => [person.uid, person]));
    assert.deepEqual(byUid.omar, {
      uid: "omar",
      name: "Omar Haddad",
      firstName: "Omar",
      detail: "Pooled: capacity · Free Thu mornings, Thu afternoons and Mon evenings",
      chips: [
        { label: "Fits Group A", tone: "ok" },
        { label: "Fits Group B", tone: "ok" },
      ],
      groupIds: [GROUP.thursday, GROUP.monday],
      score: "3.5",
      toldOn: "Friday",
      cannot: null,
    });
    assert.deepEqual([byUid.george.detail, byUid.george.chips, byUid.george.score], [
      "Pooled: capacity · Free Mon evenings",
      [{ label: "Fits Group B", tone: "ok" }],
      "3.0",
    ]);
    assert.deepEqual([byUid.lena.chips, byUid.lena.score, byUid.lena.cannot], [
      [{ label: "Fits none of the 2 times", tone: "warn" }],
      null,
      "Their week covers none of the groups’ times.",
    ]);
    assert.deepEqual([byUid.rory.detail, byUid.rory.chips, byUid.rory.cannot], [
      "Pooled: capacity",
      [{ label: "No availability given", tone: "plain" }],
      "They gave no times, so no email can say when they’re free.",
    ]);
  });

  test("the run's groups an email can name, with their times, next sessions and seats", async () => {
    const { board } = await boardFor("zach");
    assert.equal(board.timedGroups, 2);
    assert.deepEqual(board.groups, [
      { id: GROUP.thursday, name: "Group A", meets: "Thursdays at 10am", freeOn: "Thursday mornings", startsOn: "Thu 29 Oct", seatsFree: 8 },
      { id: GROUP.monday, name: "Group B", meets: "Mondays at 6pm", freeOn: "Monday evenings", startsOn: "Mon 2 Nov", seatsFree: 8 },
    ]);
  });

  test("nothing it is sent carries an address, a painted week or an answer", async () => {
    const { board } = await boardFor("zach");
    const text = JSON.stringify(board);
    for (const never of ["@example.com", "students.example", "00000000", "EU code of practice", "timelines"]) {
      assert.equal(text.includes(never), false, never);
    }
  });

  test("an offer moves its person to the list of those offered, with where it stands and its email", async () => {
    await api.test("zach", { uid: "george", groupId: GROUP.monday, replyBy: REPLY_BY });
    await api.offer("zach", { picks: [{ uid: "george", groupId: GROUP.monday }], replyBy: REPLY_BY, invitations: 1 });
    const { board } = await boardFor("zach");
    assert.deepEqual([board.free, board.heading], [1, "Offer 1 freed place"]);
    assert.equal(board.people.some((person) => person.uid === "george"), false);
    assert.deepEqual(board.offered, [
      { uid: "george", name: "George Lambert", said: "Waiting for an answer, by Thu 29 Oct", email: "Email sent", owed: false },
    ]);
    assert.deepEqual([board.test.state, board.test.by, board.test.replyBy], ["fresh", "Zach", REPLY_BY]);
    // The seat it was offered waits on Group B.
    assert.equal(board.groups.find((group) => group.id === GROUP.monday).seatsFree, 7);
  });

  test("before decisions have gone out, nobody is read and nothing is offered", async () => {
    reset(freedSeed({ sent: false }));
    const before = world.db.stats.reads;
    const { board } = await boardFor("zach");
    assert.deepEqual([board.window.open, board.people, board.offered, board.free], [false, [], [], 0]);
    // The form, the run, the lead's and the tester's names: no application.
    assert.ok(world.db.stats.reads - before <= 4);
  });
});

// ---------------------------------------------------------------------------
// 3. The page, as HTML
// ---------------------------------------------------------------------------

describe("the page an admin reads", () => {
  test("the board's words, real checkboxes, and buttons that say how many they email", async () => {
    const html = await pageAs("zach");
    const text = textOf(html);
    for (const words_ of [
      "Offer 2 freed places",
      "Nina Petrova gave theirs back. You can offer freed places until Sun 1 Nov, the end of week 1.",
      "Pooled applicants who ranked AGI Strategy",
      "All of them read No offer this time on Fri 23 Oct.",
      "0 picked",
      "Omar Haddad",
      "Pooled: capacity · Free Thu mornings, Thu afternoons and Mon evenings",
      "Fits Group A",
      "3.5",
      "AGI Strategy score",
      "Fits none of the 2 times",
      "Invitations accepted by",
      "Send a test to me",
      "Send 0 invitations",
    ]) {
      assert.ok(text.includes(words_), `${words_}\n${text}`);
    }
    // One real checkbox for each person, each with its label.
    const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    assert.equal(boxes.length, 4);
    for (const uid of ["omar", "george", "lena", "rory"]) assert.ok(html.includes(`for="freed-${uid}"`), uid);
    // A date to accept by: the form editor's own control, with no default.
    assert.match(html, /<input[^>]*type="date"[^>]*min="2026-10-27"/);
    assert.equal(/type="date"[^>]*value="2/.test(html), false);
    // Nothing is pressable before the page is live.
    assert.ok(boxes.every((box) => box.includes("disabled")));
  });

  test("with the window closed, it says so and offers nothing", async () => {
    mock.timers.setTime(new Date("2026-11-02T00:00:00Z").getTime());
    const html = await pageAs("zach");
    const text = textOf(html);
    assert.ok(text.includes("No freed places to offer"), text);
    assert.ok(text.includes("Freed places on AGI Strategy could be offered until Sun 1 Nov, the end of week 1. That has passed."), text);
    assert.equal(/type="checkbox"/.test(html), false);
    assert.equal(text.includes("Send a test to me"), false);
  });

  test("with no place free, it says so and offers nothing", async () => {
    reset(freedSeed({ places: 5 }));
    const html = await pageAs("zach");
    const text = textOf(html);
    assert.ok(
      text.includes(
        "Every place on AGI Strategy is held, or kept for an invitation nobody has answered yet. You can offer freed places until Sun 1 Nov, the end of week 1.",
      ),
      text,
    );
    assert.equal(/type="checkbox"/.test(html), false);
  });

  test("the preview is the email: composed from the page's own fields, it is the text the send emails", async () => {
    const { board } = await boardFor("zach");
    const omar = board.people.find((person) => person.uid === "omar");
    const groupB = board.groups.find((group) => group.id === GROUP.monday);
    const preview = words.composeFreedPlaceEmail({
      firstName: omar.firstName,
      programme: { shortName: board.shortName, kind: board.kind },
      leadName: board.leadName,
      toldOn: omar.toldOn,
      meets: groupB.meets,
      startsOn: groupB.startsOn,
      freeOn: groupB.freeOn,
      replyBy: "Thu 29 Oct",
      link: board.applicationLink,
    });
    await api.test("zach", { uid: "omar", groupId: GROUP.monday, replyBy: REPLY_BY });
    await api.offer("zach", { picks: [{ uid: "omar", groupId: GROUP.monday }], replyBy: REPLY_BY, invitations: 1 });
    const sent = world.mail.find((message) => message.to === "omar@example.com").react.props.email;
    assert.deepEqual(preview, sent);
  });
});

// ---------------------------------------------------------------------------
// 4. The way there, from the Applications tab
// ---------------------------------------------------------------------------

describe("the Applications tab leads there, under the places left", () => {
  const LINK = `href="${LIST}/freed-places"`;

  test("for an admin and the programme's lead once decisions have gone out, and for nobody else", async () => {
    for (const uid of ["zach", "claudia"]) {
      const page = await pageAs(uid, ApplicationsPage);
      assert.ok(page.includes(LINK), uid);
      assert.ok(textOf(page).includes("Offer freed places"), uid);
    }
    assert.equal((await pageAs("lloyd", ApplicationsPage)).includes(LINK), false);
  });

  test("not before decisions have gone out", async () => {
    reset(freedSeed({ sent: false }));
    assert.equal((await pageAs("zach", ApplicationsPage)).includes(LINK), false);
  });

  test("a place taken by an accepted offer is counted once on the tab", async () => {
    const steps = (text) => [/Applied (\d+)/.exec(text)?.[1], /Decided (\d+)/.exec(text)?.[1]];
    const before = steps(textOf(await pageAs("zach", ApplicationsPage)));
    await api.test("zach", { uid: "omar", groupId: GROUP.monday, replyBy: REPLY_BY });
    await api.offer("zach", { picks: [{ uid: "omar", groupId: GROUP.monday }], replyBy: REPLY_BY, invitations: 1 });
    await api.reply("omar", { reply: "accept-invitation" });
    const text = textOf(await pageAs("zach", ApplicationsPage));
    // 4 held before, and Omar: 5 of 7. One kept for Ines, so 1 left.
    assert.ok(text.includes("5 of 7"), text);
    assert.ok(text.includes("1 place left"), text);
    // Omar ranked AGI Strategy: he was among its applications and its
    // decisions already, and taking a freed place adds him to neither.
    assert.deepEqual(steps(text), before);
    assert.ok(before.every((count) => count !== undefined), JSON.stringify(before));
    assert.equal(world.db.read(applicationPath("omar")).status, "accepted");
  });
});
