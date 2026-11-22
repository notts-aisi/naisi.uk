/**
 * The card for a member's next session: one card, on Home and on the
 * programme page, decided once and told the same server answers.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET /api/courses/runs/[runId]/next-session   Home's answers: the programme page's own (`nextSessionAnswersFor`)
 *   RunHome -> NextSessionCards                   the programme page's card
 *   HomeProgramme -> NextSessionCards             Home's card
 *
 * ## What this guards
 *
 *  1. THE ROUTE answers the caller's own place alone: signed out, somebody
 *     not told their group, a facilitator with no place, an admin and the
 *     person, with no field beyond the four it names.
 *  2. THE TWO PAGES AGREE: one walk through the states, each drawn from the
 *     same world on Home and on the programme page, and the card compared.
 *  3. "MOVED THIS WEEK" says why, with the group's usual slot and room, and
 *     says only what is known.
 *  4. A VISIT on Home: the visit's card is the next session when it comes
 *     first, its buttons act on the host's session, and Cancel goes once the
 *     earlier of the two sessions has started.
 *  5. The words: no dash of either kind, never "collate".
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { join } from "node:path";
import { walkSource } from "./lib/functionScan.mjs";
import { B, NOW, RUN, makeMemberPagesWorld, textOf } from "./lib/memberPagesWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
const w = await makeMemberPagesWorld("__nextSessionCard");
const words = w.lib.words;
const online = await w.courseRoute("groups", "[groupId]", "joining-online");
const askRoute = await w.courseRoute("groups", "[groupId]", "excused");
const visitAskRoute = await w.courseRoute("runs", "[runId]", "requests", "visit");
/** Group C, whose week 3 session (Wed 18 Nov, 1pm) is the one other session Chloe can be offered that week. */
const GROUP_C = "agi-autumn-2026-tbc__grp00003";
const O = await w.loadTs(join("lib", "courses", "excused", "ownWords.ts"));
const J = await w.loadTs(join("lib", "courses", "joiningOnline", "words.ts"));
const answersLib = await w.loadTs(join("lib", "courses", "nextSession", "answers.ts"));
const refresh = await w.loadTs(join("features", "courses", "nextSession", "refresh.ts"));
const LINK = "https://meet.example.com/week-3";

const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

/** The first card on a page: its own section's markup and words. */
function firstCard(html) {
  const start = html.indexOf('<section class="ticket');
  if (start < 0) return { html: "", text: "" };
  const end = html.indexOf("</section>", start);
  const own = html.slice(start, end + "</section>".length);
  return { html: own, text: textOf(own) };
}

/** The card's words with Add to calendar left out: Home draws it in a row of its own, the programme page beside the buttons. */
const comparable = (text) => text.replace(/ ?Add to calendar ?/g, " ").replace(/\s+/g, " ").trim();

/** Both pages as `who` sees them now: the route's answers handed to Home, and the same answers as the programme page's props. */
async function bothPages(who) {
  await w.asBrowser(who);
  const answer = await w.answersFor(who);
  const props = answer.status === 200 ? { cantMakeIt: answer.body.cantMakeIt, joiningOnline: answer.body.joiningOnline, excused: answer.body.excused, anotherSession: answer.body.anotherSession } : {};
  const programme = w.programmeHome(who, props);
  const home = await w.homeCard(who);
  return { answer, programme, home, programmeCard: firstCard(programme.html), homeCard: firstCard(home?.html ?? "") };
}

function changeGroupB(change) {
  const path = `courseGroups/${B}`;
  const stored = w.world.db.read(path);
  w.world.db.seed(path, { ...stored, ...change(stored) });
}

/** Tonight's session (week 3, Tue 17 Nov) moved to Wed 18 Nov at 3pm in Monica Partridge E02, for its week alone. */
function moveWeekThree({ reason = "Portland A21 is closed for an exam", usualRoom = "Hallward B12" } = {}) {
  changeGroupB((stored) => ({
    session: { ...stored.session, location: usualRoom },
    sessionOverrides: { w03: { weekday: 3, startTimeLocal: "15:00", location: "Monica Partridge E02", campus: "university-park" } },
    sessionChanges: { w03: { kind: "moved", reason, dateKey: "2026-11-17", byUid: "rahul", at: new Date("2026-11-16T09:00:00Z") } },
  }));
}

/** Chloe (Group B) goes to Group A's week 4 session (Thu 19 Nov, 6pm) for one week, arranged by Zach. */
function visitGroupA() {
  const path = `courseEnrolments/${RUN.agi}__chloe`;
  const stored = w.world.db.read(path);
  w.world.db.seed(path, { ...stored, visits: [{ weekNumber: 4, groupId: hostId(), arrangedByUid: "zach", arrangedAt: new Date("2026-11-16T13:40:00Z") }] });
}

/** Group A's id: the group Amara is in. */
function hostId() {
  return w.world.db.read(`courseEnrolments/${RUN.agi}__amara`).groupId;
}

describe("1. the route answers the caller's own place alone", () => {
  test("signed out, not told their group, a facilitator with no place and an admin are answered nothing; the person, their own", async () => {
    const ask = (who) => w.call(who, w.routes.nextSession.GET, { runId: RUN.agi }, { course: true });
    assert.equal((await ask(null)).status, 401);
    assert.equal((await ask("una")).status, 403, "a placement nobody told its owner about");
    assert.equal((await ask("rahul")).status, 403, "a facilitator with no place");
    assert.equal((await ask("zach")).status, 403, "an admin with no place");
    assert.equal((await w.call("chloe", w.routes.nextSession.GET, { runId: "no-such-run" }, { course: true })).status, 404);
    const own = await ask("chloe");
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.deepEqual(Object.keys(own.body).sort(), ["anotherSession", "cantMakeIt", "excused", "joiningOnline", "viewAs"]);
    assert.equal(own.body.viewAs, false);
    assert.equal(own.body.excused.groupId, B);
    assert.equal(own.body.joiningOnline.sessionKey, "w03");
    // Another member of the group is answered their own, never Chloe's.
    const farah = await ask("farah");
    assert.equal(farah.status, 200);
    assert.doesNotMatch(JSON.stringify(farah.body), /chloe/);
    // An admin looking as the member: the card is drawn and nothing can be pressed.
    const viewAs = await w.call("chloe", w.routes.nextSession.GET, { runId: RUN.agi }, { course: true, viewAs: true });
    assert.equal(viewAs.status, 200);
    assert.equal(viewAs.body.viewAs, true);
  });

  test("anybody not taking part is asked nothing", async () => {
    const empty = await answersLib.nextSessionAnswersFor(w.world.db, { user: null, run: null, enrolment: null, groups: [], takesPart: false, now: new Date() });
    assert.deepEqual(empty, answersLib.NO_ANSWERS);
  });
});

describe("1b. the answers are worked out in one place", () => {
  test("only nextSessionAnswersFor asks the three; the programme page and Home's route both ask it; both pages draw NextSessionCards", () => {
    const SRC = join(import.meta.dirname, "..", "src");
    const askers = [];
    for (const file of walkSource(SRC)) {
      const code = readFileSync(file, "utf8");
      if (/\b(cantMakeItFor|joiningOnlineFor|excusedFor)\(/.test(code)) askers.push(file.slice(SRC.length + 1));
    }
    assert.deepEqual(askers.sort(), [
      "lib/courses/cantMakeIt/seat.ts",
      "lib/courses/excused/own.ts",
      "lib/courses/joiningOnline/seat.ts",
      "lib/courses/nextSession/answers.ts",
    ]);
    const read = (rel) => readFileSync(join(SRC, rel), "utf8");
    assert.match(read("app/(app)/learn/[runId]/page.tsx"), /await nextSessionAnswersFor\(db, \{/);
    assert.match(read("app/api/courses/runs/[runId]/next-session/route.ts"), /await nextSessionAnswersFor\(db, \{/);
    assert.match(read("features/courses/RunHome.tsx"), /<NextSessionCards\b/);
    assert.match(read("app/(app)/dashboard/HomeProgramme.tsx"), /<NextSessionCards\b/);
  });
});

describe("2. Home and the programme page draw one card", () => {
  test("every state the walk passes through reads the same on both pages", async () => {
    const states = [];
    const take = async (name) => {
      const both = await bothPages("chloe");
      states.push({ name, ...both });
      return both;
    };

    // An ordinary week: tonight, week 3.
    const ordinary = await take("ordinary");
    assert.match(ordinary.homeCard.text, /^Tonight · week 3 Tue 17 Nov, 6pm to 8pm Hallward B12 R S Group B with Rahul and Sofia/);
    assert.ok(ordinary.homeCard.text.includes(J.JOINING_ONLINE), ordinary.homeCard.text);
    assert.ok(ordinary.homeCard.html.includes('data-testid="excuse-open"'), "Home offers Can't make it");
    assert.ok(
      ordinary.homeCard.text.indexOf("Go to another session this week") > ordinary.homeCard.text.indexOf(J.JOINING_ONLINE),
      "the third button, after the other two",
    );

    // Moved this week, with why and the usual slot.
    moveWeekThree();
    const moved = await take("moved");
    assert.match(moved.homeCard.text, /^Your next session · week 3 Moved this week Wed 18 Nov, 3pm to 5pm Monica Partridge E02, University Park R S Group B with Rahul and Sofia Why: Portland A21 is closed for an exam\. Usually Tuesdays, 6pm, Hallward B12\./);
    assert.doesNotMatch(moved.homeCard.text, /Room changed this week/);

    // Joining online, said, with no link yet.
    w.reset();
    assert.equal((await w.call("chloe", online.POST, { groupId: B }, { body: { sessionKey: "w03", online: true }, course: true })).status, 200);
    const joining = await take("joining online");
    assert.match(joining.homeCard.text, /^Tonight · week 3 Joining online Tue 17 Nov, 6pm to 8pm Online, with Group B, Rahul and Sofia/);
    assert.ok(joining.homeCard.text.includes(J.saidOnlineWords(false, ["Rahul", "Sofia"])), joining.homeCard.text);
    assert.ok(joining.homeCard.text.includes(J.IN_THE_ROOM_AFTER_ALL));
    assert.ok(!joining.homeCard.text.includes("Go to another session this week"), "not once they have said they are joining online");

    // Asked to be excused, waiting.
    w.reset();
    const asked = await w.call("chloe", askRoute.POST, { groupId: B }, {
      body: { sessionKeys: ["w03"], reason: "A clash I can't move.", inPerson: true, ownOnline: true, otherOnline: true },
      course: true,
    });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const waiting = await take("excused, waiting");
    assert.ok(waiting.homeCard.text.includes(O.ASKED_TO_BE_EXCUSED), waiting.homeCard.text);

    // Asked to go to another session, waiting: the request first, and their
    // own session's buttons kept beside it; only the third button goes.
    w.reset();
    const visitAsked = await w.call("chloe", visitAskRoute.POST, { runId: RUN.agi }, { body: { hostGroupId: GROUP_C }, course: true });
    assert.equal(visitAsked.status, 200, JSON.stringify(visitAsked.body));
    const visitWaiting = await take("another session, waiting");
    assert.ok(visitWaiting.homeCard.text.includes("You asked to go to Group C’s session on Wed 18 Nov, 1pm. An admin decides."), visitWaiting.homeCard.text);
    assert.ok(visitWaiting.homeCard.text.includes("Withdraw the request"));
    assert.ok(visitWaiting.homeCard.html.includes('data-testid="excuse-open"'), "Can't make it stays");
    assert.ok(visitWaiting.homeCard.text.includes(J.JOINING_ONLINE), "I'm joining online stays");
    assert.ok(!visitWaiting.homeCard.text.includes("Go to another session this week"));

    // No session to come.
    w.reset();
    at("2026-12-09T12:00:00Z");
    const over = await take("no session to come");
    assert.equal(over.homeCard.html, "");
    assert.equal(over.programmeCard.html, "");

    for (const state of states) {
      assert.equal(comparable(state.homeCard.text), comparable(state.programmeCard.text), state.name);
      assert.doesNotMatch(state.homeCard.text, /[–—]|collate/i, state.name);
    }
  });

  test("somebody not told their group is shown nothing of it on Home", async () => {
    await w.asBrowser("una");
    assert.equal((await w.answersFor("una")).status, 403);
    const home = await w.homeCard("una");
    assert.ok(home === null || !/Group C|with Rahul|Your next session/.test(home.text), home?.text);
  });
});

describe("3. moved this week says why, and only what is known", () => {
  test("with a reason and a usual room; with no usual room; with no reason", async () => {
    moveWeekThree();
    assert.ok((await bothPages("chloe")).homeCard.text.includes("Why: Portland A21 is closed for an exam. Usually Tuesdays, 6pm, Hallward B12."));
    w.reset();
    moveWeekThree({ usualRoom: "" });
    const noRoom = (await bothPages("chloe")).homeCard.text;
    assert.ok(noRoom.includes("Why: Portland A21 is closed for an exam. Usually Tuesdays, 6pm."), noRoom);
    w.reset();
    moveWeekThree({ reason: "" });
    const noReason = await bothPages("chloe");
    assert.ok(noReason.homeCard.text.includes("Group B with Rahul and Sofia Usually Tuesdays, 6pm, Hallward B12."), noReason.homeCard.text);
    assert.doesNotMatch(noReason.homeCard.text, /Why:/);
    assert.equal(comparable(noReason.homeCard.text), comparable(noReason.programmeCard.text));
  });

  test("the words, as a table", () => {
    const usual = { usualWeekday: 3, usualStartTimeLocal: "15:00" };
    assert.equal(words.movedWhyWords({ reason: "Portland A21 is closed for an exam", ...usual, usualRoom: "Portland A21" }), "Why: Portland A21 is closed for an exam. Usually Wednesdays, 3pm, Portland A21.");
    assert.equal(words.movedWhyWords({ reason: "Portland A21 is closed for an exam.", ...usual, usualRoom: "" }), "Why: Portland A21 is closed for an exam. Usually Wednesdays, 3pm.");
    assert.equal(words.movedWhyWords({ reason: " ", ...usual, usualRoom: "Portland A21" }), "Usually Wednesdays, 3pm, Portland A21.");
    assert.equal(words.movedWhyWords({ reason: "", usualWeekday: -1, usualStartTimeLocal: "", usualRoom: "" }), "");
    assert.equal(words.roomLineWords("Monica Partridge E02", "University Park"), "Monica Partridge E02, University Park");
    assert.equal(words.roomLineWords("", "Jubilee"), "Jubilee");
    assert.equal(words.cardGroupLineWords("Group C", ["Rahul"], false), "Group C with Rahul");
    assert.equal(words.cardGroupLineWords("Group C", [], false), "Group C");
    assert.equal(words.cardGroupLineWords("Group C", ["Rahul"], true), "with Rahul");
    assert.equal(words.onlineWithWords("Group C", ["Rahul"], false), "Online, with Group C and Rahul");
    assert.equal(J.saidOnlineWords(false, ["Rahul"]), "Rahul can see you’re joining online. The link to join shows here once Rahul adds it: not yet.");
    assert.equal(words.sessionEyebrow({ isToday: false, isFirst: false, startTimeLocal: "18:00", weekNumbers: [3], next: false }), "Week 3");
    assert.equal(words.sessionEyebrow({ isToday: false, isFirst: false, startTimeLocal: "18:00", weekNumbers: [2] }), "Your next session · week 2");
  });
});

describe("4. a visit on Home", () => {
  test("a visit further ahead waits below on the programme page and is not Home's card", async () => {
    visitGroupA();
    const both = await bothPages("chloe");
    assert.match(both.homeCard.text, /^Tonight · week 3 Tue 17 Nov/);
    assert.ok(both.programme.text.includes("Visiting Group A"), both.programme.text);
    assert.doesNotMatch(both.home.text, /Visiting Group A/);
  });

  test("once it comes first, Home's card is the visit, its buttons act on the host's session, and Cancel goes once the earlier session starts", async () => {
    visitGroupA();
    at("2026-11-18T12:00:00Z");
    const before = await bothPages("chloe");
    assert.match(before.homeCard.text, /^Your next session · week 4 Visiting Group A Thu 19 Nov, 6pm to 8pm/);
    assert.ok(before.homeCard.text.includes("Cancel this visit"), before.homeCard.text);
    assert.ok(before.homeCard.html.includes('aria-label="Can’t make it on Thu 19 Nov"'), before.homeCard.html);
    assert.equal(comparable(before.homeCard.text), comparable(before.programmeCard.text));
    // Their own group's session after it, on the programme page, says only its week.
    assert.match(before.programme.text, / Week 5 Tue 1 Dec, 6pm to 8pm /);
    assert.doesNotMatch(before.home.text, /Tue 1 Dec, 6pm to 8pm/);
    // Home's reading before the session is the visit week's, due at the session they go to.
    assert.match(before.home.text, /Before your session 0 of 3 done Week 4 · Week 4 readings/);
    assert.doesNotMatch(before.home.text, /Week 5 · Week 5 readings/);
    // Only the visit is called their next session.
    assert.ok(before.programme.html.includes('aria-label="Week 5"'), before.programme.html);
    assert.equal((before.programme.html.match(/aria-label="Your next session"/g) ?? []).length, 0);

    at("2026-11-19T18:30:00Z");
    const started = await bothPages("chloe");
    assert.match(started.homeCard.text, /Visiting Group A Thu 19 Nov, 6pm to 8pm/);
    assert.doesNotMatch(started.homeCard.text, /Cancel this visit/);
    assert.equal(comparable(started.homeCard.text), comparable(started.programmeCard.text));
  });
});

describe("5. what else the card says, on both pages", () => {
  test("an incubator's card names no group, on Home as on the programme page, before and after they say they are joining online", async () => {
    const asIncubator = async () => {
      // The world as the browser holds it, then the programme told it is an incubator.
      await bothPages("chloe");
      w.ui.overview = { ...w.ui.overview, programme: { ...(w.ui.overview.programme ?? { name: "AGI Strategy", leadFirstName: null }), kind: "incubator" } };
      const answer = w.ui.nextSession;
      const programme = firstCard(w.programmeHome("chloe", { cantMakeIt: answer.cantMakeIt, joiningOnline: answer.joiningOnline, excused: answer.excused, anotherSession: answer.anotherSession }).html);
      const home = firstCard((await w.homeCard("chloe")).html);
      return { home, programme };
    };
    const plain = await asIncubator();
    assert.ok(plain.home.text.includes("Hallward B12 R S with Rahul and Sofia"), plain.home.text);
    assert.doesNotMatch(plain.home.text, /Group B|\bgroup\b/i);
    assert.equal(comparable(plain.home.text), comparable(plain.programme.text));
    assert.equal((await w.call("chloe", online.POST, { groupId: B }, { body: { sessionKey: "w03", online: true }, course: true })).status, 200);
    const said = await asIncubator();
    assert.ok(said.home.text.includes("Online, with Rahul and Sofia"), said.home.text);
    assert.doesNotMatch(said.home.text, /Group B|\bgroup\b/i);
    assert.equal(comparable(said.home.text), comparable(said.programme.text));
  });

  test("joining online with a link set: the link in the row under the card, the line that says it is here, both pages alike", async () => {
    changeGroupB(() => ({ sessionOverrides: { w03: { meetingUrl: LINK } } }));
    assert.equal((await w.call("chloe", online.POST, { groupId: B }, { body: { sessionKey: "w03", online: true }, course: true })).status, 200);
    const both = await bothPages("chloe");
    assert.match(both.homeCard.text, /^Tonight · week 3 Joining online Tue 17 Nov, 6pm to 8pm Online, with Group B, Rahul and Sofia/);
    assert.ok(both.homeCard.text.includes(J.saidOnlineWords(true, ["Rahul", "Sofia"])), both.homeCard.text);
    assert.ok(both.homeCard.html.includes(`href="${LINK}"`), both.homeCard.html);
    assert.ok(both.homeCard.text.includes(`Join online ${J.FOR_JOINING_ONLINE} The link is here, not in your emails, so it can’t be forwarded.`), both.homeCard.text);
    assert.equal(comparable(both.homeCard.text), comparable(both.programmeCard.text));
  });

  test("joining online in a week moved for its week alone: the chip says joining online, and the Why line goes", async () => {
    moveWeekThree();
    assert.equal((await w.call("chloe", online.POST, { groupId: B }, { body: { sessionKey: "w03", online: true }, course: true })).status, 200);
    const both = await bothPages("chloe");
    assert.match(both.homeCard.text, /^Your next session · week 3 Joining online Wed 18 Nov, 3pm to 5pm Online, with Group B, Rahul and Sofia/);
    assert.doesNotMatch(both.homeCard.text, /Moved this week|Why:|Usually/);
    assert.equal(comparable(both.homeCard.text), comparable(both.programmeCard.text));
  });

  test("the buttons in the order the card is drawn: Can't make it, then I'm joining online", async () => {
    const both = await bothPages("chloe");
    for (const card of [both.homeCard, both.programmeCard]) {
      const cant = card.html.indexOf('data-testid="excuse-open"');
      const join = card.html.indexOf(`aria-label="${J.JOINING_ONLINE} on Tue 17 Nov"`);
      assert.ok(cant >= 0 && join > cant, card.html);
    }
  });

  test("a member of two programmes: each run's route answers about that run's place alone", async () => {
    const T = "technical-ai-safety-weekly__grp00077";
    w.world.db.seed(`courseGroups/${T}`, {
      ...w.world.db.read(`courseGroups/${B}`),
      runId: RUN.tais,
      name: "Group T",
      facilitatorUids: ["grace"],
      memberCount: 1,
      sessionChanges: {},
      sessionOverrides: {},
      sessionModes: {},
    });
    w.world.db.seed(`courseEnrolments/${RUN.tais}__chloe`, { ...w.world.db.read(`courseEnrolments/${RUN.agi}__chloe`), runId: RUN.tais, groupId: T });
    const ask = (runId) => w.call("chloe", w.routes.nextSession.GET, { runId }, { course: true });
    const agi = await ask(RUN.agi);
    const tais = await ask(RUN.tais);
    assert.equal(agi.status, 200);
    assert.equal(tais.status, 200, JSON.stringify(tais.body));
    assert.equal(agi.body.excused.groupId, B);
    assert.equal(tais.body.excused.groupId, T);
    assert.equal(agi.body.joiningOnline?.groupId ?? B, B);
    assert.equal(tais.body.joiningOnline?.groupId ?? T, T);
    assert.doesNotMatch(JSON.stringify(agi.body), new RegExp(T));
    assert.doesNotMatch(JSON.stringify(tais.body), new RegExp(B));
    // Somebody with a place on another run only is answered nothing here.
    assert.equal((await w.call("grace", w.routes.nextSession.GET, { runId: RUN.agi }, { course: true })).status, 403);
  });
});

describe("6. Home reads its buttons again after a press", () => {
  test("the request's form and its withdraw call the card's refresh beside the page's, and Home provides its own read again", () => {
    const SRC = join(import.meta.dirname, "..", "src");
    const read = (rel) => readFileSync(join(SRC, rel), "utf8");
    for (const rel of ["features/courses/excused/AskForm.tsx", "features/courses/excused/WithdrawButton.tsx"]) {
      assert.match(read(rel), /const refreshCard = useCardRefresh\(\);/, rel);
      assert.match(read(rel), /router\.refresh\(\);\n\s+refreshCard\(\);/, rel);
    }
    const home = read("app/(app)/dashboard/HomeProgramme.tsx");
    assert.match(home, /const \{ answers, reload \} = useNextSessionAnswers\(entry\.runId, true\);/);
    assert.match(home, /<CardRefresh\.Provider value=\{reload\}>\s*<NextSessionCards/);
  });

  test("a press inside Home's provider calls Home's read again; with no provider, nothing", () => {
    let heard = 0;
    let got = null;
    const Probe = () => {
      got = refresh.useCardRefresh();
      return null;
    };
    renderToStaticMarkup(createElement(refresh.CardRefresh.Provider, { value: () => (heard += 1) }, createElement(Probe)));
    got();
    assert.equal(heard, 1);
    renderToStaticMarkup(createElement(Probe));
    got();
    assert.equal(heard, 1);
  });
});
