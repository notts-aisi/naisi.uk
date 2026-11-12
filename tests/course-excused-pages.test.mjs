/**
 * Excused weeks, the pages: what each reader is drawn, and what each page is
 * sent, from the real routes and loaders.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   the person's programme page   learn/[runId]/page.tsx -> RunHome (TicketExcuse, LastSessionCard, OwnRequests)
 *   the register                   GET .../groups/[groupId]/attendance -> AttendanceGrid
 *   the Requests page              loadRequestsPage -> RequestsList
 *   one request's page             admin/admissions/requests/[requestId]/page.tsx -> ExcusedRequestPage
 *
 * ## What this guards
 *
 *  1. THE REASON, THE REPLY AND THE COUNT reach nobody but the person (their
 *     own reason and reply) and admins: not in the page, and not in what the
 *     page is sent (the props the server page hands its client component, the
 *     register's own answer, the loaders' views). Asked as the person,
 *     another member of the group, a facilitator of the group, a facilitator
 *     of another group, the programme's lead and an admin.
 *  2. THE WAY IN: somebody taking part is offered a request an admin
 *     decides, never the instant "Can't make it"; somebody who facilitates
 *     the group they hold a place in keeps the instant button; a read that
 *     fails offers neither.
 *  3. EVERY STATE of the person's card, in the rules' words; a facilitator
 *     sees one of two facts and is asked to do nothing; an admin's page says
 *     what approving will do before it is pressed, who is emailed and how
 *     often the person has been excused, each kind apart, and offers no
 *     "Take it".
 *  4. THE WORDS, as tables: no dash of either kind, never "mark" to a member,
 *     never "collate", times through the house clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, B, C, NOW, RUN, makeLeavingWorld, registerPath, textOf } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__excusedPages");
const { world, call, routes, pages, components, ui, draw, loadTs } = w;
const ROOT = join(import.meta.dirname, "..");
const readSource = (path) => readFileSync(join(ROOT, path), "utf8");

const askRoute = await w.courseRoute("groups", "[groupId]", "excused");
const act = {
  approve: await w.courseRoute("requests", "[requestId]", "excused", "approve"),
  decline: await w.courseRoute("requests", "[requestId]", "excused", "decline"),
  withdraw: await w.courseRoute("requests", "[requestId]", "excused", "withdraw"),
  reply: await w.courseRoute("requests", "[requestId]", "excused", "reply"),
};
const O = await loadTs(join("lib", "courses", "excused", "ownWords.ts"));
const S = await loadTs(join("lib", "courses", "excused", "staffWords.ts"));
const R = await loadTs(join("lib", "courses", "excused", "requestWords.ts"));
const card = await loadTs(join("lib", "courses", "excused", "card.ts"));
const loaders = await loadTs(join("lib", "courses", "requests", "load.ts"));
const excusedPage = await loadTs(join("lib", "courses", "excused", "page.ts"));
const cover = await loadTs(join("lib", "courses", "registerCover", "pageWords.ts"));
const correctionWords = await loadTs(join("lib", "courses", "registerCorrection", "pageWords.ts"));
const { default: RequestsList } = await loadTs(join("features", "courses", "requests", "RequestsList.tsx"));
const { default: ExcusedRequestPage } = await loadTs(join("features", "courses", "requests", "ExcusedRequestPage.tsx"));
const { default: OwnRequests } = await loadTs(join("features", "courses", "excused", "OwnRequests.tsx"));
const { default: LastSessionCard } = await loadTs(join("features", "courses", "excused", "LastSessionCard.tsx"));
const requestPage = (await loadTs(join("app", "(app)", "admin", "admissions", "requests", "[requestId]", "page.tsx"))).default;

/** Something only Amara and admins may read, and something only she and admins may read back. */
const REASON = "A dentist appointment I can't move.";
const REPLY = "Thanks for telling us.";
const HOME = { runId: RUN.agi };

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

const ask = (who, body, groupId = A) => call(who, askRoute.POST, { groupId }, { body, course: true });
const decide = (who, action, requestId, body) => call(who, act[action].POST, { requestId }, { body, course: true });
const register = (who, groupId = A) => call(who, routes.register.GET, { groupId }, { course: true });

/** Amara asks to be excused from Group A's week 4 (Thu 19 Nov, 6pm), two days ahead. */
async function amaraAsks(keys = ["w04"]) {
  const answer = await ask("amara", { sessionKeys: keys, reason: REASON });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return answer.body.request.id;
}

/** The programme page as `who` is drawn it: the props its server page hands RunHome, and RunHome drawn from them. */
async function programmePage(who) {
  const page = await draw(pages.home, who, HOME);
  const props = ui.runHome;
  if (!props) return { page, props: null, text: "", html: "" };
  const overview = await call(who, routes.overview.GET, HOME, { course: true });
  ui.overview = { data: overview.body, error: null, reload: () => {} };
  const html = renderToStaticMarkup(createElement(components.RunHome, props));
  return { page, props, html, text: textOf(html) };
}

/** The register as `who` is sent it, and as its grid draws it. */
async function registerAs(who, groupId = A) {
  const answer = await register(who, groupId);
  if (answer.status !== 200) return { status: answer.status, body: answer.body, text: "" };
  const payload = answer.body;
  ui.attendance = {
    ...payload,
    loading: false,
    loaded: true,
    error: null,
    reload: () => {},
    mark: async () => {},
    edit: async () => ({}),
    push: async () => ({}),
    saveNote: async () => ({}),
  };
  const html = renderToStaticMarkup(createElement(components.AttendanceGrid, { groupId }));
  return { status: 200, body: payload, text: textOf(html), html };
}

const draws = (component, props) => {
  const html = renderToStaticMarkup(createElement(component, props));
  return { html, text: textOf(html) };
};

function noDashes(text, where) {
  assert.doesNotMatch(text, /[–—]/, `${where} carries a dash`);
  assert.doesNotMatch(text, /collate/i, `${where} uses a word the house does not`);
}

// ---------------------------------------------------------------------------
// 1. The words, as tables
// ---------------------------------------------------------------------------

describe("1. the words, one file per surface", () => {
  test("the person's: the way in, the request, and the card in each state", () => {
    const at = new Date("2026-11-09T11:15:00Z");
    const now = new Date("2026-11-09T14:00:00Z");
    for (const [said, expected] of [
      [O.cantMakeDayWords("Wed 11 Nov"), "Can’t make Wed 11 Nov?"],
      [O.joinOnlineFirstWords("Group C"), "Try joining online first. You stay in Group C."],
      [O.askFromWords({ groupName: "Group C", weekNumber: 2, occurrence: 1, when: "Wed 11 Nov, 3pm" }), "From Group C’s week 2 session, Wed 11 Nov, 3pm. An admin decides, usually the same day."],
      [O.weekChoiceWords(2, 1, "2026-11-11"), "Week 2 · Wed 11 Nov"],
      [O.waitingWords(["Rahul"]), "Waiting for an admin, usually today. Rahul sees only that you’ve asked."],
      [O.waitingWords(["Rahul", "Sofia"]), "Waiting for an admin, usually today. Rahul and Sofia see only that you’ve asked."],
      [O.approvedLineWords("Zach", at, "Hope the appointment goes well."), "Approved by Zach on Mon 9 Nov, 11:15am: “Hope the appointment goes well.”"],
      [O.declinedLineWords(3, 1, "Zach", "You could have joined online."), "Not excused for week 3. Zach: “You could have joined online.”"],
      [O.withdrewWords(new Date("2026-11-09T11:20:00Z"), now), "You withdrew your request to be excused at 11:20am."],
      [O.youAskedWithReasonWords(new Date("2026-11-09T14:50:00Z"), new Date("2026-11-09T15:05:00Z"), "My lab is running over."), "You asked at 2:50pm: “My lab is running over.”"],
      [O.afterSessionWords(["Josh"]), "An admin decides. If it’s approved, the register changes from Absent to Excused, and Josh is told."],
      [O.askForWeekWords(2), "Ask to be excused for week 2"],
      [O.lastSessionWords(2), "Last session · week 2"],
      [O.excusedForWords(2), "Excused for week 2"],
      [O.sendTheRequestWords(1), "Send the request"],
      [O.sendTheRequestWords(2), "Send the request for 2 weeks"],
      [O.ownRowLineWords({ state: "withdrawn", by: "", at: new Date("2026-11-09T11:20:00Z"), askedAt: null, now }), "Withdrawn by you, 11:20am"],
      [O.ownRowLineWords({ state: "approved", by: "Zach", at: new Date("2026-11-10T13:40:00Z"), askedAt: null, now }), "Approved by Zach, Tue 10 Nov, 1:40pm"],
    ]) {
      assert.equal(said, expected);
    }
    assert.deepEqual(O.happenRows({ weekNumbers: [2], facilitatorFirstNames: ["Rahul"] }), [
      { label: "Rahul sees", text: "That you’ve asked, then Excused if it’s approved. Never your reason." },
      { label: "Your work", text: "Week 2’s work is still due by your session, and its reminders still come." },
      { label: "If approved", text: "The register says Excused by itself. You and Rahul get an email." },
      { label: "Your reason", text: "Only admins read it, and it’s deleted when your programme closes." },
    ]);
    assert.deepEqual(O.happenRows({ weekNumbers: [6, 5], facilitatorFirstNames: [] }).map((row) => row.label), ["Decided", "Your facilitators see", "Your work", "Your reason"]);
    assert.equal(O.happenRows({ weekNumbers: [6, 5], facilitatorFirstNames: [] })[2].text, "Weeks 5 and 6 are still due by your sessions, with their reminders.");
    // Above the box, as the design puts it, and plain about who reads it.
    assert.equal(O.NO_MEDICAL_DETAILS, "Please don’t include medical details or anything about your health. A few words are enough.");
    const everything = Object.values(O)
      .filter((value) => typeof value === "string")
      .join(" ");
    noDashes(everything, "the person's words");
    assert.doesNotMatch(everything, /\bmark\b|\bgrade\b|\bscore\b/i, "a member is told about a mark");
    assert.doesNotMatch(everything, /\btimes this term\b|\bcount\b|allowance/i, "a member is told a count");
  });

  test("the facilitators' and the lead's: two facts, and nothing asks them to do anything", () => {
    assert.equal(S.factWords("waiting"), "Asked to be excused, waiting");
    assert.equal(S.factWords("excused"), "Excused");
    assert.equal(S.excuseRowWords("w04", "Amara Okafor"), "Week 4: Amara Okafor");
    assert.equal(S.excuseRowWords("w04-2", "Amara Okafor"), "Week 4, session 2: Amara Okafor");
    assert.equal(S.IF_APPROVED, "If it’s approved, Absent becomes Excused by itself. You never see why.");
    assert.equal(
      S.cameAfterAllWords("Grace", "present", false),
      "Grace came after all, so In the room counts. Being excused stays on Grace’s request; nothing else changes.",
    );
    assert.match(S.cameAfterAllWords("Grace", "present", true), /^Grace came after all, so Online counts\./);
    assert.equal(cover.setByWords({ name: "Zach Levin", at: "2026-11-10T21:10:00Z", how: "approval" }), "Zach’s approval, 9:10pm");
    const everything = [S.ASKED_TITLE, S.IF_APPROVED, S.WHAT_YOU_SEE_TITLE, S.WHAT_YOU_SEE, S.factWords("waiting")].join(" ");
    noDashes(everything, "the facilitators' words");
  });

  test("an admin's: the row, the page, how often, and Home's line", () => {
    const now = new Date("2026-11-09T14:00:00Z");
    assert.equal(R.requestTitleWords("Grace Chen", [{ weekNumber: 2, occurrence: 1 }]), "Grace Chen: excused for week 2");
    assert.equal(R.requestTitleWords("Kwame Asante", [{ weekNumber: 5, occurrence: 1 }, { weekNumber: 6, occurrence: 1 }]), "Kwame Asante: excused for weeks 5 and 6");
    assert.equal(R.sentWords("2026-11-09T09:43:00Z", now), "Sent today, 9:43am");
    assert.equal(R.sentWords("2026-11-08T09:43:00Z", now), "Sent Sun 8 Nov, 9:43am");
    assert.equal(
      R.weekLineWords({ weekNumber: 2, occurrence: 1, dateKey: "2026-11-11", startTimeLocal: "15:00", durationMinutes: 120, room: "Portland A21" }),
      "Week 2 · Wed 11 Nov, 3pm to 5pm · Portland A21",
    );
    assert.equal(R.finishedAbsentWords("Nadia", "2026-11-10T20:05:00Z", "Tom", new Date("2026-11-10T21:00:00Z")), "Nadia finished the register at 8:05pm with Tom as Absent.");
    assert.equal(R.excusedRowWeeksWords([{ weekNumber: 5, occurrence: 1, state: "approved" }, { weekNumber: 6, occurrence: 1, state: "waiting" }]), "Week 5 approved, week 6 waiting");
    assert.equal(R.decidedSaidWords({ action: "approve", firstName: "Grace", person: "sent", facilitators: 1 }), "Approved. Emailed Grace and 1 facilitator.");
    assert.equal(R.decidedSaidWords({ action: "decline", firstName: "Grace", person: "sent", facilitators: 0 }), "Declined. Emailed Grace.");
    assert.equal(R.historyWords({ what: "asked", by: "Grace Chen", weekNumber: null, occurrence: 1, personFirstName: "Grace" }), "Grace sent this");
    assert.equal(R.historyWords({ what: "approved", by: "Zach Levin", weekNumber: 5, occurrence: 1, personFirstName: "" }), "Zach approved week 5");
    // Home's To do line says what waits.
    assert.equal(correctionWords.requestsWaitingLine(1), "A facilitator has asked for a line of a register to be corrected.");
    assert.equal(correctionWords.requestsWaitingLine(1, 1), "Somebody has asked to be excused from a week.");
    assert.equal(correctionWords.requestsWaitingLine(3, 2), "2 requests to be excused are waiting. A facilitator has asked for a line of a register to be corrected.");
    const everything = Object.values(R)
      .filter((value) => typeof value === "string")
      .join(" ");
    noDashes(everything, "an admin's words");
  });

  test("every new file: no dash, never the word the house does not use, times through the house clock", () => {
    for (const path of [
      "src/lib/courses/excused/ownWords.ts",
      "src/lib/courses/excused/staffWords.ts",
      "src/lib/courses/excused/requestWords.ts",
      "src/lib/courses/excused/card.ts",
      "src/features/courses/excused/AskForm.tsx",
      "src/features/courses/excused/ExcuseSheet.tsx",
      "src/features/courses/excused/TicketExcuse.tsx",
      "src/features/courses/excused/LastSessionCard.tsx",
      "src/features/courses/excused/OwnRequests.tsx",
      "src/features/courses/excused/WithdrawButton.tsx",
      "src/features/courses/excused/api.ts",
      "src/features/courses/requests/ExcusedRequestPage.tsx",
    ]) {
      const source = readSource(path);
      noDashes(source, path);
      assert.doesNotMatch(source, /toLocale(Date|Time)?String|Intl\.DateTimeFormat/, `${path} formats a time outside the house clock`);
      assert.doesNotMatch(source, /console\.(log|info|warn|error)/, `${path} logs, and a reason must never be logged`);
    }
  });

  test("every new stylesheet ends with its phone block, and its controls are 44px", () => {
    const css = readSource("src/features/courses/excused/Excuse.module.css");
    assert.match(css, /\/\* === Mobile === \*\/\n@media \(max-width: 48rem\) \{ \/\* --bp-md \*\/[\s\S]*\}\n$/);
    for (const control of ["ticketButton", "secondary", "secondaryWide", "primary", "linkButton", "weekChoice"]) {
      const block = new RegExp(`\\.${control}[^{]*\\{[^}]*min-height: 44px`);
      const shared = /\.ticketButton,\n\.secondary,\n\.secondaryWide,\n\.primary \{[^}]*min-height: 44px/;
      assert.ok(block.test(css) || (["ticketButton", "secondary", "secondaryWide", "primary"].includes(control) && shared.test(css)), `.${control} is under 44px`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The card, decided
// ---------------------------------------------------------------------------

describe("2. the card, decided: the way in, each state, the last session, the weeks", () => {
  const session = (over = {}) => ({
    sessionKey: "w04",
    weekNumber: 4,
    occurrence: 1,
    dateKey: "2026-11-19",
    startsAt: "2026-11-19T18:00:00.000Z",
    endsAt: "2026-11-19T20:00:00.000Z",
    started: false,
    ended: false,
    cancelled: false,
    register: null,
    excuse: null,
    ask: { open: true, when: "before" },
    first: { online: true },
    ...over,
  });

  test("the way in: a request for somebody taking part, the instant button for a facilitator who holds a place, neither without a view", () => {
    assert.equal(card.ticketEntryOf({ asks: true, groupId: A }, A), "ask");
    assert.equal(card.ticketEntryOf({ asks: false, groupId: A }, A), "instant");
    assert.equal(card.ticketEntryOf(null, A), "none", "a read that failed handed somebody the instant button");
    assert.equal(card.ticketEntryOf({ asks: true, groupId: A }, B), "none");
    assert.equal(card.ticketEntryOf({ asks: true, groupId: A }, null), "none");
  });

  test("one state per row of the rules' table", () => {
    const by = { firstName: "Zach" };
    assert.deepEqual(card.cardStateOf(session()), { kind: "open" });
    assert.equal(card.cardStateOf(session({ ask: { open: false, why: "waiting" }, excuse: { kind: "waiting", requestId: "r", askedAt: "x", reason: "y" } })).kind, "waiting");
    assert.equal(card.cardStateOf(session({ started: true, excuse: { kind: "waiting", requestId: "r", askedAt: "x", reason: "y" } })).started, true);
    assert.deepEqual(card.cardStateOf(session({ excuse: { kind: "approved", requestId: "r", by, at: "x", reply: "ok" } })), { kind: "approved", by: "Zach", at: "x", reply: "ok", came: false });
    assert.equal(card.cardStateOf(session({ register: "came", excuse: { kind: "approved", requestId: "r", by, at: "x", reply: "" } })).came, true, "came anyway");
    assert.equal(card.cardStateOf(session({ excuse: { kind: "declined", requestId: "r", by, at: "x", reply: "no" } })).kind, "declined");
    assert.equal(card.cardStateOf(session({ excuse: { kind: "withdrawn", requestId: "r", at: "x" } })).again, true);
    assert.deepEqual(card.cardStateOf(session({ excuse: { kind: "time-set" } })), { kind: "time-set" });
    assert.deepEqual(card.cardStateOf(session({ excuse: { kind: "in-advance", at: "x" } })), { kind: "in-advance" });
    assert.deepEqual(card.cardStateOf(session({ ended: true, register: "absent", ask: { open: true, when: "after" } })), { kind: "after" });
    assert.deepEqual(card.cardStateOf(session({ started: true, ask: { open: false, why: "not-finished" } })), { kind: "none" });
  });

  test("the last session's card: the latest to end, while there is something to say; the weeks a request may cover", () => {
    const view = {
      runId: RUN.agi,
      groupId: A,
      asks: true,
      closesAt: null,
      closed: false,
      requests: [],
      sessions: [
        session({ sessionKey: "w02", weekNumber: 2, startsAt: "2026-11-05T18:00:00.000Z", ended: true, started: true, register: "came", ask: { open: false, why: "came" } }),
        session({ sessionKey: "w03", weekNumber: 3, startsAt: "2026-11-12T18:00:00.000Z", ended: true, started: true, register: "absent", ask: { open: true, when: "after" } }),
        session(),
        session({ sessionKey: "w05", weekNumber: 5, startsAt: "2026-11-26T18:00:00.000Z" }),
        session({ sessionKey: "w06", weekNumber: 6, startsAt: "2026-12-03T18:00:00.000Z", ask: { open: false, why: "excused" } }),
      ],
    };
    assert.equal(card.lastSessionOf(view, "w04").sessionKey, "w03");
    view.sessions[1] = { ...view.sessions[1], register: "came", ask: { open: false, why: "came" } };
    assert.equal(card.lastSessionOf(view, "w04"), null, "a session they came to gets a card");
    assert.deepEqual(card.weeksToChoose(view, "w04").map((each) => each.sessionKey), ["w04", "w05"]);
  });
});

// ---------------------------------------------------------------------------
// 3. The person's programme page
// ---------------------------------------------------------------------------

describe("3. the person's programme page: their own card, sent and drawn for them alone", () => {
  test("nothing asked: no instant button, the way in to a request, and nothing about anybody else", async () => {
    const { props, text, html } = await programmePage("amara");
    assert.equal(props.excused.asks, true);
    assert.equal(props.excused.sessions.find((each) => each.sessionKey === "w04").ask.open, true);
    assert.match(html, /data-testid="excuse-open"/, "the way in is missing");
    assert.match(html, /aria-label="Can’t make it on Thu 19 Nov"/);
    assert.doesNotMatch(text, /You’ve told us you can’t make this session/, "the instant button's line is drawn");
    assert.ok(!html.includes("I can make it after all"), "the instant button's take-back is drawn");
    // The instant button is a facilitator's only: the server page still hands
    // the instant view, and RunHome draws it only for that entry.
    assert.ok(props.cantMakeIt !== null, "the instant view is gone from the server page");
  });

  test("asked: waiting with Withdraw; her reason sent to her alone; another member, a facilitator and the lead are sent none of it", async () => {
    await amaraAsks();
    const own = await programmePage("amara");
    const week4 = own.props.excused.sessions.find((each) => each.sessionKey === "w04");
    assert.deepEqual([week4.excuse.kind, week4.excuse.reason], ["waiting", REASON]);
    assert.match(own.text, /Asked to be excused/);
    assert.match(own.text, /Waiting for an admin, usually today\. Sofia sees only that you’ve asked\./);
    assert.match(own.text, /Withdraw the request/);
    assert.match(own.text, /You can withdraw it until it’s decided\./);
    assert.match(own.text, /Your requests Excused for week 4 You asked at 12pm Waiting/);
    assert.doesNotMatch(JSON.stringify(own.props), /"count"|"counts"|timesThisTerm/, "a member was sent a count");
    for (const who of ["dev", "bea", "sofia", "tom", "claudia", "zach"]) {
      const theirs = await programmePage(who);
      const sent = JSON.stringify(theirs.props ?? {});
      assert.ok(!sent.includes(REASON), `${who} was sent Amara's reason`);
      assert.ok(!theirs.text.includes(REASON), `${who} was drawn Amara's reason`);
    }
    const dev = await programmePage("dev");
    assert.deepEqual(dev.props.excused.requests, [], "Dev was sent Amara's requests");
  });

  test("decided: excused with who approved it, when and the reply; declined with the reply; both to her alone", async () => {
    const id = await amaraAsks(["w04", "w05"]);
    assert.equal((await decide("zach", "approve", id, { sessionKey: "w04", reply: REPLY })).status, 200);
    assert.equal((await decide("zach", "decline", id, { sessionKey: "w05", reply: "Please join online that week." })).status, 200);
    const own = await programmePage("amara");
    assert.match(own.text, /Excused Approved by Zach on Tue 17 Nov, 12pm: “Thanks for telling us\.”/);
    assert.match(own.text, /Excused for week 4 Approved by Zach, 12pm Approved/);
    assert.match(own.text, /Excused for week 5 Declined by Zach, 12pm Declined/);
    for (const who of ["dev", "sofia", "claudia"]) {
      const sent = JSON.stringify((await programmePage(who)).props ?? {});
      assert.ok(!sent.includes(REPLY) && !sent.includes("Please join online"), `${who} was sent Zach's reply`);
    }
  });

  test("after the session: the last session's card offers the request while its finished register says Absent", async () => {
    // Tariq was Absent from week 3 (Thu 12 Nov), whose register is finished.
    const { props, text } = await programmePage("tariq");
    const week3 = props.excused.sessions.find((each) => each.sessionKey === "w03");
    assert.deepEqual([week3.register, week3.ask], ["absent", { open: true, when: "after" }]);
    assert.match(text, /Last session · week 3/);
    assert.match(text, /Missed it for a reason\? You can ask to be excused after a session, for example if you were ill\./);
    assert.match(text, /Ask to be excused for week 3/);
    assert.match(text, /An admin decides\. If it’s approved, the register changes from Absent to Excused, and Sofia is told\./);
    // The line about medical details is above the box.
    const at = (words) => text.indexOf(words);
    assert.ok(at("Please don’t include medical details") < at("Why (a line is enough)"));
  });

  test("somebody who facilitates the group they hold a place in keeps today's instant Can't make it", async () => {
    const amara = structuredClone(world.db.read(`courseEnrolments/${RUN.agi}__amara`));
    world.db.seed(`courseEnrolments/${RUN.agi}__sofia`, { ...amara, uid: "sofia", groupId: A });
    const { props, html } = await programmePage("sofia");
    assert.equal(props.excused.asks, false);
    assert.equal(card.ticketEntryOf(props.excused, A), "instant");
    assert.ok(!html.includes('data-testid="excuse-open"'), "a facilitator was offered the request");
    assert.match(html, /aria-label="Can’t make it on Thu 19 Nov"/, "the instant button is gone for a facilitator who holds a place");
    const refused = await ask("sofia", { sessionKeys: ["w04"], reason: REASON });
    assert.equal(refused.status, 403);
  });

  test("the instant button is drawn for the facilitator's entry alone, in the source as on the page", () => {
    const runHome = readSource("src/features/courses/RunHome.tsx");
    assert.match(runHome, /const entry = ticketEntryOf\(excused, group\?\.id \?\? null\);/);
    assert.match(runHome, /cantMakeIt=\{entry === "instant" \? ticketCantMakeIt : null\}/);
    assert.match(runHome, /ticketJoiningOnline \|\| \(entry === "instant" && ticketCantMakeIt\)/);
  });

  test("the person's own requests list and the last session's card, drawn alone", () => {
    const requests = [
      {
        id: "r1",
        askedAt: "2026-11-17T11:00:00.000Z",
        status: "waiting",
        weeks: [
          { sessionKey: "w04", weekNumber: 4, occurrence: 1, dateKey: "2026-11-19", state: "waiting", at: null, by: null, reply: "" },
          { sessionKey: "w05", weekNumber: 5, occurrence: 1, dateKey: "2026-11-26", state: "withdrawn", at: "2026-11-17T11:20:00.000Z", by: null, reply: "" },
        ],
      },
    ];
    const list = draws(OwnRequests, { requests });
    assert.match(list.text, /Your requests Excused for week 4 You asked at 11am Waiting Excused for week 5 Withdrawn by you, 11:20am Withdrawn/);
    assert.equal(draws(OwnRequests, { requests: [] }).html, "", "an empty list is drawn");
    const declined = draws(LastSessionCard, {
      session: {
        sessionKey: "w03",
        weekNumber: 3,
        occurrence: 1,
        dateKey: "2026-11-12",
        startsAt: "2026-11-12T18:00:00.000Z",
        endsAt: "2026-11-12T20:00:00.000Z",
        started: true,
        ended: true,
        cancelled: false,
        register: "absent",
        excuse: { kind: "declined", requestId: "r", by: { firstName: "Zach" }, at: "2026-11-17T10:00:00.000Z", reply: "You could have joined online." },
        ask: { open: false, why: "not-absent" },
        first: { online: false },
      },
      groupId: A,
      groupName: "Group A",
      facilitatorFirstNames: ["Sofia"],
    });
    assert.match(declined.text, /Not excused for week 3\. Zach: “You could have joined online\.” Week 3 · Thu 12 Nov Absent What the register says for this session\./);
  });
});

// ---------------------------------------------------------------------------
// 4. The register
// ---------------------------------------------------------------------------

describe("4. the register: one of two facts, for everybody who reads it, and nothing else", () => {
  test("waiting, then excused: the facilitator, the lead and an admin are sent the fact and drawn it, never the reason or the reply", async () => {
    const id = await amaraAsks();
    for (const who of ["sofia", "claudia", "zach"]) {
      const read = await registerAs(who);
      assert.equal(read.status, 200, who);
      assert.deepEqual(read.body.excuseRequests, { w04: { amara: "waiting" } }, who);
      assert.match(read.text, /Asked to be excused Week 4: Amara Okafor Asked to be excused, waiting/, who);
      assert.match(read.text, /If it’s approved, Absent becomes Excused by itself\. You never see why\./, who);
      assert.ok(!JSON.stringify(read.body).includes(REASON), `${who} was sent the reason`);
      assert.ok(!read.text.includes(REASON), `${who} was drawn the reason`);
    }
    // A facilitator of another group reads no register of this one.
    assert.notEqual((await register("tom")).status, 200);
    assert.equal((await decide("zach", "approve", id, { sessionKey: "w04", reply: REPLY })).status, 200);
    const after = await registerAs("sofia");
    assert.deepEqual(after.body.excuseRequests, { w04: { amara: "excused" } });
    assert.match(after.text, /Week 4: Amara Okafor Excused/);
    assert.doesNotMatch(after.text, /Amara Okafor can’t make it/, "the approved line is said twice");
    assert.ok(!JSON.stringify(after.body).includes(REPLY), "a facilitator was sent the reply");
    // Nothing on the register asks the facilitator to do anything.
    assert.doesNotMatch(after.text, /Approve|Decline|Withdraw the request/);
  });

  test("on a column: the fact under the mark; came anyway, and the facilitator's entry counts", async () => {
    // Tariq asks about week 3 after it, and is excused; Sofia had him Absent.
    const asked = await ask("tariq", { sessionKeys: ["w03"], reason: "I was ill." });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const read = await registerAs("sofia");
    assert.deepEqual(read.body.excuseRequests.w03, { tariq: "waiting" });
    assert.match(read.html, /data-testid="attendance-excuse-chip"[^>]*>Asked to be excused, waiting</);
    assert.equal((await decide("zach", "approve", asked.body.request.id, { sessionKey: "w03" })).status, 200);
    const approved = await registerAs("sofia");
    assert.equal(approved.body.records.w03.tariq, "excused", "the finished register's Absent became Excused");
    assert.match(approved.html, /data-testid="attendance-excuse-chip"[^>]*>Excused</);
    assert.ok(!JSON.stringify(approved.body).includes("I was ill."));
  });
});

// ---------------------------------------------------------------------------
// 5. The admin's pages
// ---------------------------------------------------------------------------

describe("5. the Requests page and one request's page: an admin's alone", () => {
  test("the list: an admin's card of requests to be excused, with no Take it; a lead is drawn none", async () => {
    const id = await amaraAsks(["w04", "w05"]);
    const asAdmin = await loaders.loadRequestsPage(world.courseDb, w.sessionOf("zach"), NOW);
    const drawn = draws(RequestsList, { view: asAdmin.view });
    assert.match(drawn.text, /Asked to be excused Amara Okafor · Excused for weeks 4 and 5/);
    assert.match(drawn.html, new RegExp(`href="/admin/admissions/requests/${id}"`));
    assert.doesNotMatch(drawn.text, /Take it|Nobody has it|has it\b/, "an excused row says who has it");
    assert.ok(!drawn.text.includes(REASON) && !JSON.stringify(asAdmin.view).includes(REASON), "the list carries the reason");
    assert.match(drawn.text, /Requests to be excused are for admins only/);
    const asLead = await loaders.loadRequestsPage(world.courseDb, w.sessionOf("claudia"), NOW);
    assert.equal(asLead.status, "ok", "the lead of the programme reads its Requests page");
    const lead = draws(RequestsList, { view: asLead.view });
    assert.doesNotMatch(lead.text, /Asked to be excused|Amara Okafor/, "a lead was drawn a request to be excused");
    assert.doesNotMatch(lead.text, /Requests to be excused are for admins only/, "a lead was told about a list they never see");
    assert.ok(!JSON.stringify(asLead.view).includes(id));
    assert.equal(asLead.view.counts.waiting, 0, "a lead's count includes a request to be excused");
  });

  test("one request's page: the reason, each week, what approving will do and who it emails, how often before, for an admin; nobody else", async () => {
    // Amara's week 2 line was excused the instant way, before requests.
    world.db.poke(registerPath(A, 2), { records: { amara: "excused" }, excusedInAdvance: { amara: new Date("2026-11-01T10:00:00Z") } });
    const id = await amaraAsks();
    const asAdmin = await draw(requestPage, "zach", { requestId: id });
    assert.equal(asAdmin.to, null);
    for (const words of [
      "Amara Okafor: excused for week 4",
      `“${REASON}”`,
      "Asks to be excused from",
      "Week 4 · Thu 19 Nov, 6pm to 8pm · Portland A13",
      "Offered first",
      "Approving The register says Excused for Amara, with nothing for Sofia to do. Week 4’s work and reminders carry on, and late counts from the session as for anyone.",
      "Told 2 emails: Amara, with your reply; and Sofia, without the reason.",
      "Approve and email 2 people",
      "Decline and email Amara",
      "Reply without deciding",
      "Excused before Staff only Once this term.",
      "Said in advance, before requests",
      "Members never see a count or an allowance.",
      "Amara sent this",
    ]) {
      assert.ok(asAdmin.text.includes(words), `an admin's page does not say: ${words}`);
    }
    assert.doesNotMatch(asAdmin.text, /Take it/);
    for (const who of ["claudia", "yusuf"]) {
      const theirs = await draw(requestPage, who, { requestId: id });
      assert.ok(!theirs.text.includes(REASON), `${who} was drawn the reason`);
      assert.ok(!theirs.text.includes("Excused before"), `${who} was drawn how often`);
    }
    for (const who of ["sofia", "amara"]) {
      const theirs = await draw(requestPage, who, { requestId: id });
      assert.equal(theirs.to, "/dashboard", `${who} reached one request's page`);
    }
  });

  test("one week waiting: its decision sits under the reply; several: each week decides its own, under the reply", async () => {
    const one = await amaraAsks();
    const single = draws(ExcusedRequestPage, { view: (await excusedPage.loadExcusedRequestPage(world.courseDb, w.sessionOf("zach"), one, NOW)).view });
    assert.equal(single.html.match(/data-testid="excused-approve"/g)?.length, 1);
    const replyAt = single.html.indexOf('data-testid="excused-reply-text"');
    assert.ok(replyAt > 0 && replyAt < single.html.indexOf('data-testid="excused-approve"'), "the reply is not typed before the decision");
    assert.match(single.text, /Approve and email 2 people Decline and email Amara Reply without deciding/);
    const two = await amaraAsks(["w05", "w06"]);
    const several = draws(ExcusedRequestPage, { view: (await excusedPage.loadExcusedRequestPage(world.courseDb, w.sessionOf("zach"), two, NOW)).view });
    assert.equal(several.html.match(/data-testid="excused-approve"/g)?.length, 2, "each week does not decide its own");
    assert.ok(several.html.indexOf('data-testid="excused-reply-text"') < several.html.indexOf('data-testid="excused-approve"'), "the reply is not typed before the decisions");
    assert.match(several.text, /Each week is decided on its own, and each decision is one email to the person\./);
  });

  test("decided weeks stay with who decided, when and the reply; once the programme closes the reason is said to be gone", async () => {
    const id = await amaraAsks();
    assert.equal((await decide("zach", "approve", id, { sessionKey: "w04", reply: REPLY })).status, 200);
    world.db.poke(`courseRequests/${id}`, { reason: "", reasonHeld: false, reasonGoneAt: new Date("2026-12-18T00:00:00Z") });
    const loaded = await excusedPage.loadExcusedRequestPage(world.courseDb, w.sessionOf("zach"), id, NOW);
    const drawn = draws(ExcusedRequestPage, { view: loaded.view });
    assert.match(drawn.text, /Approved by Zach, today, 12pm/);
    assert.match(drawn.text, new RegExp(`“${REPLY.replace(/\./g, "\\.")}”`));
    assert.match(drawn.text, /The reason was deleted when the programme closed\. Only that the person asked is kept\./);
    assert.match(drawn.text, /Every week of this request is decided or withdrawn\./);
    assert.doesNotMatch(drawn.html, /<textarea/, "a decided request still offers a reply box");
  });
});

// Unused imports are a lint error; B and C name the other groups in failures.
void B;
void C;
