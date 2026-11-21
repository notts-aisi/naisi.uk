/**
 * A FACILITATOR'S WEEK on their group's page, and the register opening with
 * what people said.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   1. "Before the session" as arithmetic (`beforeTheSessionOf`): each kind
 *      of person in its row, a visitor and a member away with their lines, a
 *      waiting request, and nobody at all.
 *   2. The same through the group's page's reader (`loadGroupPage`) on Group
 *      B four weeks in, as each kind of reader: the facilitator's view says
 *      who said what about the next session, by the name each goes by, and
 *      ABSENT from it are a place not told yet, a reason, when anybody asked,
 *      an address and a link; staff are given none (their week card lists
 *      the week's people). The facilitator's page draws it in order, and a
 *      facilitator of another group is sent away.
 *   3. A week's meeting link for that week only or from that week on
 *      (`planLinkSave`), over a term and through the route: a week that met
 *      keeps the link it had, a later week with its own keeps it, the
 *      every-week link is replaced from that week on, and the words of the
 *      two choices.
 *   4. The register opens with a person's word in: somebody who said they
 *      are joining online is drawn online with "Said joining online" before
 *      the tap; a register where nobody said anything draws no such thing,
 *      and its stored marks are the route's as before.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { A, B, C, RUN, makeSessionsWorld } from "./lib/sessionsWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";
import { assertNothingReorders, laptopLayout, phoneOrder } from "./lib/groupPageOrder.mjs";

const ui = { h: createElement, attendance: null };
globalThis.__facWeekUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const STYLESHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) STYLESHEETS.add(specifier);
}
const CARD = (name) => `export default function ${name}() { return globalThis.__facWeekUi.h("div", null, "[${name}]"); }`;

const w = await makeSessionsWorld("__facWeek", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
  ],
  ["next/link", "export default ({ href, className, children }) => globalThis.__facWeekUi.h('a', { href, className }, children);"],
  ["./session", "export async function getCurrentUser() { return globalThis.__facWeek.user; }"],
  ["@/features/courses/GroupRoster", CARD("GroupRoster")],
  ["@/features/courses/AttendanceGrid", CARD("AttendanceGrid")],
  ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
]);
const { world, loadTs, call, courseRoute } = w;

const model = await loadTs("lib/courses/groupPage/model.ts");
const words = await loadTs("lib/courses/groupPage/words.ts");
const plan = await loadTs("lib/courses/meetingLink/plan.ts");
const visitWords = await loadTs("lib/courses/visit/words.ts");
const linkWords = await loadTs("lib/courses/joiningOnline/words.ts");
const notForYou = await loadTs("lib/courses/notForYouWords.ts");
const { loadGroupPage } = await loadTs("lib/courses/groupPage/load.ts");
const { normalizeCourseRun } = await loadTs("lib/firestore/courses.ts");
const { normalizeCourseGroup, sessionForWeek, GROUP_FIELD_LIMITS } = await loadTs("lib/firestore/courseGroups.ts");
const { resolveSessions } = await loadTs("lib/courses/sessions.ts");
const linkRoute = await courseRoute("groups", "[groupId]", "meeting-link");
const registerRoute = await courseRoute("groups", "[groupId]", "attendance");
const LEARN_GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
const { default: FacilitatorGroupPage } = await loadTs(join(LEARN_GROUP, "page.tsx"));

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const run = () => normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
const group = (groupId = B) => normalizeCourseGroup(groupId, world.db.read(`courseGroups/${groupId}`));
const read = (viewer, viewerUid, groupId = B) =>
  loadGroupPage(world.courseDb, { run: run(), group: group(groupId), viewer, viewerUid, now: new Date() });
/** The name somebody goes by, as the page names people. */
const goesBy = (uid) => {
  const data = world.db.read(`users/${uid}`) ?? {};
  return (data.profile?.preferredName ?? "").trim() || (data.displayName ?? "").trim();
};
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const REASON = "A hospital appointment.";
const ASKED_AT = new Date("2026-11-18T17:20:00Z");

/** A request to be excused from Group B's week 4, as the ask route leaves one. */
function excuseRequest(uid, status) {
  world.db.seed(`courseRequests/req-${uid}`, {
    kind: "excused",
    runId: RUN.agi,
    groupId: B,
    subjectUid: uid,
    askedByUid: uid,
    askedAt: ASKED_AT,
    status,
    reason: REASON,
    reasonHeld: true,
    change: {
      weeks: [
        {
          sessionKey: "w04",
          weekId: "w04",
          dateKey: "2026-11-24",
          asked: "before",
          offered: { online: false },
          reply: "",
          decidedByUid: status === "waiting" ? null : "zach",
          decidedAt: status === "waiting" ? null : new Date("2026-11-18T18:00:00Z"),
          withdrawnAt: null,
          status,
        },
      ],
    },
  });
}

/** Bea (Group A) visits Group B for week 4; the visit's History row on her own group, as arranging one leaves it. */
function beaVisitsB() {
  world.db.poke(seatPath("bea"), { visits: [{ weekNumber: 4, groupId: B, arrangedByUid: "zach", arrangedAt: new Date() }] });
  world.db.seed("courseAudit/visit-bea", { kind: "member-visits", runId: RUN.agi, groupId: A, subjectUid: "bea", after: { groupId: B }, at: new Date() });
}

async function draw(who, groupId = B) {
  world.user = w.sessionOf(who);
  world.course = true;
  try {
    const element = await FacilitatorGroupPage({ params: Promise.resolve({ runId: RUN.agi, groupId }), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);
    return { html, text: text(html), to: null };
  } catch (err) {
    if (err?.message === "NEXT_REDIRECT") return { html: "", text: "", to: err.to };
    throw err;
  }
}

beforeEach(() => {
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. The arithmetic
// ---------------------------------------------------------------------------

describe("1. before the session, as arithmetic", () => {
  const person = (name, over = {}) => ({ uid: name.toLowerCase(), name, said: "coming", ...over });
  const of = (people, online = false) =>
    model.beforeTheSessionOf({ weekNumber: 2, dateKey: "2026-11-10", online, people, awayWords: visitWords.awayAtWords });

  test("each kind of person in its row, in the order a facilitator needs them, visitors and people away a row each", () => {
    const before = of([
      person("Ivy Clarke", { said: "online" }),
      person("Marcus Bell", { said: "online" }),
      person("Pri Shah", { visiting: { line: "Visiting from Group K, week 2 only. You can read Pri’s week 2; Lena gives the feedback." } }),
      person("Tom Fisher", { excuse: "waiting", said: "online" }),
      person("Una Cole", { excuse: "excused" }),
      person("Kofi Asante", { said: "cant" }),
      person("Ben Ray", { awayAt: "Group F" }),
      person("Zara Ahmed"),
      person("Elena Rossi"),
      person("Lea Moss", { joins: { fromWeek: 3, weeksToRead: [2] } }),
    ]);
    assert.deepEqual(
      before.rows.map((row) => [row.kind, row.names, row.line]),
      [
        ["waiting", ["Tom Fisher"], ""],
        ["excused", ["Una Cole", "Kofi Asante"], ""],
        ["online", ["Ivy Clarke", "Marcus Bell"], ""],
        ["visiting", ["Pri Shah"], "Visiting from Group K, week 2 only. You can read Pri’s week 2; Lena gives the feedback."],
        ["away", ["Ben Ray"], "At Group F this week"],
        ["coming", ["Zara Ahmed", "Elena Rossi"], ""],
      ],
    );
    assert.equal(before.weekNumber, 2);
    assert.ok(!JSON.stringify(before).includes("Lea Moss"), "somebody joining from a later week is not one of the week's people");
    assert.ok(!JSON.stringify(before).includes("uid"), "the rows carry names, never uids");
  });

  test("a session held online for everybody: whoever said online is simply coming, joining online", () => {
    const before = of([person("Ivy Clarke", { said: "online" }), person("Zara Ahmed")], true);
    assert.deepEqual(before.rows.map((row) => [row.kind, row.names]), [["coming", ["Ivy Clarke", "Zara Ahmed"]]]);
    assert.equal(words.beforeSaysWords("coming", true), "Joining online");
    assert.equal(words.beforeSaysWords("coming", false), "In the room");
  });

  test("nobody at all: no card", () => {
    assert.equal(of([]), null);
    assert.equal(of([person("Lea Moss", { joins: { fromWeek: 3, weeksToRead: [] } })]), null);
  });

  test("the words of each row and chip", () => {
    assert.equal(words.beforeSaysWords("waiting", false), "Asked to be excused, waiting");
    assert.equal(words.beforeSaysWords("excused", false), "Can’t make it");
    assert.equal(words.beforeSaysWords("online", false), "Joining online");
    assert.deepEqual(words.BEFORE_CHIP, { waiting: "Waiting", excused: "Excused", online: "Online", visiting: "Visiting", away: null, coming: "Coming" });
    assert.equal(words.beforeWhenWords(2, "2026-11-10"), "Week 2 · Tue 10 Nov");
  });
});

// ---------------------------------------------------------------------------
// 2. Through the reader and the page
// ---------------------------------------------------------------------------

describe("2. before the session on Group B's page, as each reader", () => {
  function worldOfWeekFour() {
    // Amara said she is joining online; Ines can't make it, on her word; Omar
    // asked to be excused and waits; Bea visits from Group A.
    world.db.seed(`courseAttendance/${RUN.agi}__${B}__w04`, {
      runId: RUN.agi,
      groupId: B,
      weekNumber: 4,
      onlineSaid: { amara: new Date("2026-11-18T09:00:00Z") },
      excusedInAdvance: { ines: new Date("2026-11-18T09:30:00Z") },
      records: { ines: "excused" },
    });
    excuseRequest("omar", "waiting");
    beaVisitsB();
  }

  test("the facilitator is told who said what about the next session, by the name each goes by", async () => {
    worldOfWeekFour();
    const view = await read("facilitator", "rahul");
    assert.deepEqual(
      [view.before.weekNumber, view.before.dateKey],
      [4, "2026-11-24"],
      "the group's next session still to end",
    );
    const rows = view.before.rows.map((row) => [row.kind, row.names]);
    assert.deepEqual(rows, [
      ["waiting", [goesBy("omar")]],
      ["excused", [goesBy("ines")]],
      ["online", [goesBy("amara")]],
      ["visiting", [goesBy("bea")]],
    ]);
    assert.match(view.before.rows[3].line, /^Visiting from Group A, week 4 only\. You can read /);
    // The cut still lists no people of its own, week by week.
    assert.ok(view.weeks.every((each) => each.people.length === 0));
  });

  test("ABSENT from the facilitator's answer: a place not told yet, the reason, when anybody asked, an address, a link", async () => {
    worldOfWeekFour();
    world.db.poke(`courseGroups/${B}`, { session: { ...world.db.read(`courseGroups/${B}`).session, meetingUrl: "https://meet.example/standing" } });
    const view = await read("facilitator", "rahul");
    const flat = JSON.stringify(view);
    assert.ok(!JSON.stringify(view.before).includes(goesBy("dev")), "dev's place is not told yet");
    assert.ok(!flat.includes(REASON), "the reason for a request");
    assert.ok(!flat.includes(ASKED_AT.toISOString()) && !/5:20pm|17:20/.test(flat), "when the request was made");
    assert.doesNotMatch(flat, /@/, "an address");
    assert.doesNotMatch(flat, /https?:\/\//, "a link");
    assert.ok(view.weeks.every((each) => ["every", "week", "none"].includes(each.link)));
  });

  test("a member away at another group's session that week is their own row, and nobody is counted twice", async () => {
    world.db.poke(seatPath("omar"), { visits: [{ weekNumber: 4, groupId: C, arrangedByUid: "zach", arrangedAt: new Date() }] });
    const view = await read("facilitator", "rahul");
    assert.deepEqual(
      view.before.rows.map((row) => [row.kind, row.names, row.line]),
      [
        ["away", [goesBy("omar")], "At Group C this week"],
        ["coming", [goesBy("amara"), goesBy("ines")].sort((a, b) => a.localeCompare(b)), ""],
      ],
    );
  });

  test("an approved request reads excused; staff are given no before, their week card lists the people", async () => {
    excuseRequest("amara", "approved");
    const view = await read("facilitator", "rahul");
    assert.deepEqual(view.before.rows.find((row) => row.kind === "excused")?.names, [goesBy("amara")]);
    for (const [viewer, uid] of [["admin", "zach"], ["lead", "claudia"]]) {
      assert.equal((await read(viewer, uid)).before, null, viewer);
    }
  });

  test("the page draws it under the box and over who has done the week, then each week's link; another group's facilitator is told the page is not theirs", async () => {
    worldOfWeekFour();
    const drawn = await draw("rahul");
    assert.equal(drawn.to, null);
    for (const said of ["Before the session", "Week 4 · Tue 24 Nov", "Asked to be excused, waiting", "Waiting", "Can’t make it", "Joining online", "Visiting", "Meeting links", "Week 1 · Tue 3 Nov · no register", "No link"]) {
      assert.ok(drawn.text.includes(said), `missing "${said}"`);
    }
    // In order, as a reader meets them: the box, then each card by its heading.
    // Meeting links is a part of how the group meets, so its heading is an h3 under that card's h2.
    const order = ['aria-label="Joining online"', ">Before the session</h2>", ">Meeting links</h3>"].map((said) => drawn.html.indexOf(said));
    assert.ok(!drawn.html.includes(">Meeting links</h2>"), "Meeting links is a heading of the same level as the card it sits in");
    assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), `out of order: ${order}`);
    assert.ok(!drawn.text.includes(REASON));
    // Everybody else is given the one calm page in place of the group's, and nothing of the group.
    for (const [who, said] of [["tom", "a facilitator of another group"], ["amara", "a member of the group"]]) {
      const refused = await draw(who);
      assert.equal(refused.to, null, `${said} was sent to ${refused.to}`);
      assert.ok(refused.text.includes(notForYou.NOT_FOR_YOU_HEADING), `${said} is not told the page is not theirs`);
      assert.ok(refused.text.includes(notForYou.NOT_FOR_YOU_GROUP_PAGE), `${said} is not told who the page is for`);
      for (const said2 of ["Before the session", "Meeting links", "Joining online", "Group B", REASON]) {
        assert.ok(!refused.text.includes(said2), `${said} is shown "${said2}"`);
      }
    }
  });

  test("the page reads in the order of a session, from one order in the markup: top to bottom on a phone, two columns on a laptop", async () => {
    worldOfWeekFour();
    const drawn = await draw("rahul");
    assert.equal(drawn.to, null);
    const { html } = drawn;
    // Each card by the attribute that names it, in the order a facilitator uses the page. A week of the summer's
    // kind: no week's work to count, no review queue's halves, no This week's work (the blocks' suite holds those).
    const at = phoneOrder(html, [
      ["the head, with Write and Change a session", '<header class="head"'],
      ["the session", 'data-testid="session-card"'],
      ["who is joining online", 'data-testid="joining-online-box"'],
      ["before the session", 'aria-labelledby="before-the-session"'],
      ["the updates", 'aria-labelledby="group-updates"'],
      ["how the group meets", 'aria-labelledby="group-meets-facilitator"'],
      ["each week's meeting link", 'aria-labelledby="meeting-links"'],
      ["the exercises to review", 'aria-labelledby="group-to-review"'],
      ["your group", 'aria-labelledby="group-people"'],
      ["the registers", 'aria-labelledby="group-registers"'],
      ["the pace", 'aria-labelledby="group-pace"'],
      ["the notes", 'aria-labelledby="group-notes"'],
    ]);
    assert.ok(drawn.html.indexOf("Write to Group B") > at["the head, with Write and Change a session"] && drawn.html.indexOf("Write to Group B") < at["the session"], "Write is not in the head");
    assertNothingReorders(html);
    // A laptop: the session across the page; who is coming on the left, the updates and how the group meets on the
    // right, the meeting links inside it; the exercises to review across the page; the group on the left, the pace
    // and the notes on the right.
    const { rows, blocks, column, inside, card } = laptopLayout(html);
    assert.equal(blocks.length, 2, "the page is not two blocks of two columns");
    const [session, group] = blocks;
    assert.ok(inside(rows, at["the session"]) && at["the session"] < session.from, "the session is not across the page over the columns");
    for (const name of ["who is joining online", "before the session"]) assert.ok(inside(column(session, "colMain"), at[name]), `${name} is not on the left`);
    for (const name of ["the updates", "how the group meets"]) assert.ok(inside(column(session, "colSide"), at[name]), `${name} is not on the right`);
    assert.ok(inside(card(at["how the group meets"]), at["each week's meeting link"]), "the meeting links are not inside how the group meets");
    assert.ok(at["the exercises to review"] > session.to && at["the exercises to review"] < group.from, "the exercises to review are not between the blocks");
    for (const name of ["your group", "the registers"]) assert.ok(inside(column(group, "colMain"), at[name]), `${name} is not on the left`);
    for (const name of ["the pace", "the notes"]) assert.ok(inside(column(group, "colSide"), at[name]), `${name} is not on the right`);
  });

  test("in a view-as session the list of links has nothing to press, as the box has nothing to press", async () => {
    const { default: MeetingLinks } = await loadTs(join("features", "courses", "groupPage", "MeetingLinks.tsx"));
    const view = await read("facilitator", "rahul");
    const live = renderToStaticMarkup(createElement(MeetingLinks, { view, canChange: true }));
    const viewAs = renderToStaticMarkup(createElement(MeetingLinks, { view, canChange: false }));
    assert.equal([...live.matchAll(/<button/g)].length, 3, "weeks 4 to 6 are still to come");
    assert.match(live, /aria-label="Set the link: Week 4"/);
    assert.doesNotMatch(viewAs, /<button/);
    assert.ok(text(viewAs).includes("Week 4 · Tue 24 Nov No link"), text(viewAs));
    // Its heading is an h2 unless its caller asks for an h3, and nothing else about it changes with the level.
    assert.match(live, /<h2 id="meeting-links" class="cardTitle">Meeting links<\/h2>/);
    const nested = renderToStaticMarkup(createElement(MeetingLinks, { view, canChange: true, headingLevel: 3 }));
    assert.match(nested, /<h3 id="meeting-links" class="cardTitle">Meeting links<\/h3>/);
    assert.equal(nested.replace(/<(\/?)h3\b/g, "<$1h2"), live);
  });

  test("nobody in the group: no card", async () => {
    for (const uid of ["amara", "ines", "omar", "dev"]) world.db.poke(seatPath(uid), { status: "withdrawn" });
    const view = await read("facilitator", "rahul");
    assert.equal(view.before, null);
    assert.ok(!(await draw("rahul")).text.includes("Before the session"));
  });
});

// ---------------------------------------------------------------------------
// 3. A week's link, for that week only or from that week on
// ---------------------------------------------------------------------------

describe("3. a week's meeting link, that week only or from that week on", () => {
  const TERM = [1, 2, 3, 4, 5, 6].map((n) => ({ weekNumber: n, weekId: `w0${n}` }));
  const at = (n) => TERM[n - 1];
  /** The term on a given week: the weeks before it have ended. */
  const termOn = (current) => TERM.map((each) => ({ ...each, ended: each.weekNumber < current }));

  /**
   * A group as stored, pressed the way the writer presses: the plan worked out
   * on it, then its field paths set and deleted. Returns the plan, and the
   * group after it.
   */
  function press(stored, { week, url, onwards, current, maxWeeks = 20 }) {
    const made = plan.planLinkSave({ week: at(week), url, onwards, standing: stored.session.meetingUrl, storedWeeks: stored.sessionOverrides, weeks: termOn(current), maxWeeks });
    if (!made.ok) return { made, stored };
    const next = structuredClone(stored);
    const put = (path, value, del) => {
      const parts = path.split(".");
      let node = next;
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      if (del) delete node[parts[parts.length - 1]];
      else node[parts[parts.length - 1]] = value;
    };
    for (const [path, value] of Object.entries(made.set)) put(path, value, false);
    for (const path of made.remove) put(path, null, true);
    return { made, stored: next };
  }
  /** What each week reads, and how the list says it. */
  function term(stored) {
    const group = normalizeCourseGroup(B, { ...world.db.read(`courseGroups/${B}`), session: { ...world.db.read(`courseGroups/${B}`).session, meetingUrl: stored.session.meetingUrl }, sessionOverrides: stored.sessionOverrides });
    return Object.fromEntries(
      TERM.map(({ weekNumber, weekId }) => [weekNumber, [group.sessionOverrides[weekId] && Object.hasOwn(group.sessionOverrides[weekId], "meetingUrl") ? group.sessionOverrides[weekId].meetingUrl : group.session.meetingUrl, plan.weekLinkKind(group, weekId)]]),
    );
  }
  const empty = () => ({ session: { meetingUrl: null }, sessionOverrides: {} });

  test("that week only: the week's own link, set on purpose; a kept week changed on its own loses its mark", () => {
    const made = plan.planLinkSave({ week: at(3), url: "https://x/3", onwards: false, standing: "https://x/every", storedWeeks: {}, weeks: TERM, maxWeeks: 20 });
    assert.deepEqual(made, { ok: true, set: { "sessionOverrides.w03.meetingUrl": "https://x/3" }, remove: [], pinned: [], keptLater: [] });
    const kept = plan.planLinkSave({ week: at(3), url: "https://x/3", onwards: false, standing: null, storedWeeks: { w03: { meetingUrl: null, linkPinned: true } }, weeks: TERM, maxWeeks: 20 });
    assert.deepEqual(kept.remove, ["sessionOverrides.w03.linkPinned"]);
  });

  test("from week 3 on: the every-week link replaced, week 3's own taken away, a later week's link set on purpose kept and named, the earlier weeks keeping the link they had, marked", () => {
    const made = plan.planLinkSave({
      week: at(3),
      url: "https://x/new",
      onwards: true,
      standing: "https://x/every",
      storedWeeks: { w01: { location: "Hallward A1" }, w03: { meetingUrl: "https://x/old3" }, w05: { meetingUrl: "https://x/five" } },
      weeks: termOn(3),
      maxWeeks: 20,
    });
    assert.deepEqual(made, {
      ok: true,
      set: {
        "session.meetingUrl": "https://x/new",
        "sessionOverrides.w01.meetingUrl": "https://x/every",
        "sessionOverrides.w01.linkPinned": true,
        "sessionOverrides.w02.meetingUrl": "https://x/every",
        "sessionOverrides.w02.linkPinned": true,
      },
      remove: ["sessionOverrides.w03"],
      pinned: [1, 2],
      keptLater: [5],
    });
  });

  test("the reviewer's two presses: week 6 onwards from week 2, then week 3 onwards a week later, every week's end state", () => {
    // Week 2, no every-week link: week 6 onwards with A keeps weeks 1 to 5 as they were (none), marked.
    let { stored } = press(empty(), { week: 6, url: "https://x/A", onwards: true, current: 2 });
    assert.deepEqual(term(stored), {
      1: [null, "none"], 2: [null, "none"], 3: [null, "none"], 4: [null, "none"], 5: [null, "none"], 6: ["https://x/A", "every"],
    });
    // A week later, week 3 onwards with B: the kept weeks from 3 on go and read B; weeks 1 and 2 have met and keep none.
    const second = press(stored, { week: 3, url: "https://x/B", onwards: true, current: 3 });
    stored = second.stored;
    assert.deepEqual(second.made.keptLater, [], "no later week has a link set on purpose");
    assert.deepEqual(term(stored), {
      1: [null, "none"], 2: [null, "none"], 3: ["https://x/B", "every"], 4: ["https://x/B", "every"], 5: ["https://x/B", "every"], 6: ["https://x/B", "every"],
    });
    assert.deepEqual(Object.keys(stored.sessionOverrides).sort(), ["w01", "w02"], "the kept entries from week 3 on are gone, not left empty");
  });

  test("three presses, and a press that moves the start later: every week reads what each press said", () => {
    // Week 1: every week from week 1 with A.
    let { stored } = press(empty(), { week: 1, url: "https://x/A", onwards: true, current: 1 });
    // Week 2: week 4 onwards with B, so weeks 1 to 3 keep A, marked.
    ({ stored } = press(stored, { week: 4, url: "https://x/B", onwards: true, current: 2 }));
    assert.deepEqual(term(stored), {
      1: ["https://x/A", "kept"], 2: ["https://x/A", "kept"], 3: ["https://x/A", "kept"], 4: ["https://x/B", "every"], 5: ["https://x/B", "every"], 6: ["https://x/B", "every"],
    });
    // Week 2 still: week 3 onwards with C replaces week 3's kept A and everything after.
    const third = press(stored, { week: 3, url: "https://x/C", onwards: true, current: 2 });
    stored = third.stored;
    assert.deepEqual(term(stored), {
      1: ["https://x/A", "kept"], 2: ["https://x/A", "kept"], 3: ["https://x/C", "every"], 4: ["https://x/C", "every"], 5: ["https://x/C", "every"], 6: ["https://x/C", "every"],
    });
    // Moving the start later: week 5 onwards with D keeps weeks 3 and 4 on C.
    ({ stored } = press(stored, { week: 5, url: "https://x/D", onwards: true, current: 3 }));
    assert.deepEqual(term(stored), {
      1: ["https://x/A", "kept"], 2: ["https://x/A", "kept"], 3: ["https://x/C", "kept"], 4: ["https://x/C", "kept"], 5: ["https://x/D", "every"], 6: ["https://x/D", "every"],
    });
  });

  test("a kept week changed on its own is set on purpose, and a later press from an earlier week keeps it and says so", () => {
    let { stored } = press(empty(), { week: 5, url: "https://x/A", onwards: true, current: 2 });
    assert.equal(term(stored)[4][1], "none");
    // Week 4 only, with W: the kept mark goes.
    ({ stored } = press(stored, { week: 4, url: "https://x/W", onwards: false, current: 2 }));
    assert.deepEqual(stored.sessionOverrides.w04, { meetingUrl: "https://x/W" });
    assert.deepEqual(term(stored)[4], ["https://x/W", "week"]);
    // Week 3 onwards with B: week 4 keeps W, set on purpose, and is named; week 3's kept none goes.
    const later = press(stored, { week: 3, url: "https://x/B", onwards: true, current: 2 });
    assert.deepEqual(later.made.keptLater, [4]);
    assert.deepEqual(term(later.stored), {
      1: [null, "none"], 2: [null, "none"], 3: ["https://x/B", "every"], 4: ["https://x/W", "week"], 5: ["https://x/B", "every"], 6: ["https://x/B", "every"],
    });
  });

  test("an earlier week with a link of its own keeps it; with no every-week link the earlier weeks keep none; the same link pins nothing", () => {
    const own = plan.planLinkSave({ week: at(4), url: "https://x/new", onwards: true, standing: null, storedWeeks: { w02: { meetingUrl: "https://x/two" } }, weeks: termOn(2), maxWeeks: 20 });
    assert.deepEqual(own.set, {
      "session.meetingUrl": "https://x/new",
      "sessionOverrides.w01.meetingUrl": null,
      "sessionOverrides.w01.linkPinned": true,
      "sessionOverrides.w03.meetingUrl": null,
      "sessionOverrides.w03.linkPinned": true,
    });
    const same = plan.planLinkSave({ week: at(4), url: "https://x/every", onwards: true, standing: "https://x/every", storedWeeks: {}, weeks: TERM, maxWeeks: 20 });
    assert.deepEqual(same, { ok: true, set: { "session.meetingUrl": "https://x/every" }, remove: [], pinned: [], keptLater: [] });
  });

  test("past the weeks a group keeps apart: that week alone is refused as full, the earlier weeks' pins as earlier-full", () => {
    const full = Object.fromEntries([7, 8, 9].map((n) => [`w0${n}`, { location: "Elsewhere" }]));
    assert.deepEqual(plan.planLinkSave({ week: at(3), url: "https://x/3", onwards: false, standing: null, storedWeeks: full, weeks: TERM, maxWeeks: 3 }), { ok: false, reason: "full" });
    assert.deepEqual(plan.planLinkSave({ week: at(3), url: "https://x/3", onwards: true, standing: null, storedWeeks: full, weeks: TERM, maxWeeks: 3 }), {
      ok: false,
      reason: "earlier-full",
    });
    assert.equal(plan.planLinkSave({ week: at(1), url: "https://x/1", onwards: true, standing: null, storedWeeks: full, weeks: TERM, maxWeeks: 3 }).ok, true, "nothing earlier to keep");
  });

  test("the kind of link each week reads: a kept one is never said to be set for that week", () => {
    const raw = { session: { meetingUrl: "https://x/every" }, sessionOverrides: { w01: { meetingUrl: null }, w02: { meetingUrl: "https://x/two" }, w03: { location: "A1" }, w05: { meetingUrl: "https://x/kept", linkPinned: true }, w06: { meetingUrl: null, linkPinned: true } } };
    const g = normalizeCourseGroup(B, { ...world.db.read(`courseGroups/${B}`), ...raw });
    assert.deepEqual(["w01", "w02", "w03", "w04", "w05", "w06"].map((id) => plan.weekLinkKind(g, id)), ["none", "week", "every", "every", "kept", "none"]);
    assert.equal(plan.weekLinkKind({ session: { meetingUrl: null }, sessionOverrides: {} }, "w04"), "none");
    assert.equal(words.weekLinkWords("kept", 5), "Kept the link it had before");
    // The mark never reaches a session: the slot every reader sees is the group's own shape.
    assert.equal(Object.hasOwn(sessionForWeek(g, "w05"), "linkPinned"), false);
    assert.equal(sessionForWeek(g, "w05").meetingUrl, "https://x/kept");
    // A mark with no link beside it is nothing.
    assert.equal(normalizeCourseGroup(B, { ...world.db.read(`courseGroups/${B}`), sessionOverrides: { w02: { location: "A1", linkPinned: true } } }).sessionOverrides.w02.linkPinned, undefined);
  });

  test("over Group B's term through the route: a week that met keeps its link and cannot be changed, a later week's own is kept", async () => {
    const OLD = "https://meet.example/old-every";
    const NEW = "https://meet.example/new-every";
    const FIVE = "https://meet.example/week-five";
    world.db.poke(`courseGroups/${B}`, {
      session: { ...world.db.read(`courseGroups/${B}`).session, meetingUrl: OLD },
      sessionOverrides: { w05: { meetingUrl: FIVE } },
    });
    const give = (who, body) => call(who, linkRoute.POST, { groupId: B }, { body, course: true });
    assert.deepEqual(await give("rahul", { sessionKey: "w04", url: NEW, everyWeek: true }), { status: 200, body: { ok: true, sessionKey: "w04", everyWeek: true } });
    const reads = () => Object.fromEntries(resolveSessions(run(), group()).filter((s) => s.occurrence === 1).map((s) => [s.weekNumber, s.session.meetingUrl]));
    assert.deepEqual(reads(), { 1: OLD, 2: OLD, 3: OLD, 4: NEW, 5: FIVE, 6: NEW });
    // Weeks 1 to 3 have met: refused, and they read what they had.
    assert.deepEqual(await give("rahul", { sessionKey: "w03", url: NEW }), { status: 409, body: { error: linkWords.MEETING_LINK_REFUSAL.over } });
    // Week 6 only, by the programme's lead; week 4 stays.
    assert.equal((await give("claudia", { sessionKey: "w06", url: "https://meet.example/six" })).status, 200);
    assert.deepEqual(reads(), { 1: OLD, 2: OLD, 3: OLD, 4: NEW, 5: FIVE, 6: "https://meet.example/six" });
    // The page's list reads the same, as words.
    const view = await read("facilitator", "rahul");
    assert.deepEqual(view.weeks.map((each) => each.link), ["kept", "kept", "kept", "every", "week", "week"], "weeks 1 to 3 kept the link they had; nobody set it for them");
    assert.ok(!JSON.stringify(view).includes("meet.example"), "the page is never handed a link");
    // The group's history says which weeks, never the link.
    const rows = world.db.paths().filter((p) => p.startsWith("courseAudit/")).map((p) => world.db.read(p)).filter((row) => row.kind === "group-link-set");
    assert.equal(rows.length, 2);
    assert.ok(!JSON.stringify(rows).includes("meet.example"));
    assert.equal(rows.find((row) => row.weekId === "w04").detail, "Set the meeting link from week 4 on, except week 5, which keeps its own. Before: a link was set.");
    // From week 5 on, week 6's link set on purpose by the lead is kept, and the line says so.
    assert.equal((await give("zach", { sessionKey: "w05", url: NEW, everyWeek: true })).status, 200);
    const latest = world.db.paths().filter((p) => p.startsWith("courseAudit/")).map((p) => world.db.read(p)).filter((row) => row.kind === "group-link-set" && row.weekId === "w05");
    assert.equal(latest[0].detail, "Set the meeting link from week 5 on, except week 6, which keeps its own. Before: a link was set.");
    assert.equal(reads()[6], "https://meet.example/six");
    assert.ok(!JSON.stringify(latest).includes("meet.example"));
  });

  test("the two choices' words, and that week only is the default", async () => {
    assert.equal(words.weekOnwardsWords(3), "Week 3 onwards");
    assert.equal(words.onlyHintWords([4, 5, 6]), "Weeks 4 to 6 keep the every-week link.");
    assert.equal(words.onlyHintWords([4]), "Week 4 keeps the every-week link.");
    assert.equal(words.onlyHintWords([4, 6]), "Weeks 4 and 6 keep the every-week link.");
    assert.equal(words.onlyHintWords([]), "Other weeks stay as they are.");
    assert.equal(words.onwardsHintWords(3, [2], true), "Replaces the every-week link from week 3. Week 2 keeps the link it had.");
    assert.equal(words.onwardsHintWords(3, [1, 2], false), "Sets it for week 3 and every later week without a link of its own. Weeks 1 and 2 keep the links they had.");
    assert.equal(words.onwardsHintWords(1, [], true), "Replaces the every-week link from week 1.");
    assert.deepEqual(["week", "every", "none"].map((kind) => words.weekLinkWords(kind, 3)), ["Set: week 3 only", "Set: every week", "No link"]);
    const facts = model.linkChoiceFacts(
      [
        { weekNumber: 2, ended: true, cancelled: false, link: "every" },
        { weekNumber: 3, ended: false, cancelled: false, link: "every" },
        { weekNumber: 4, ended: false, cancelled: false, link: "every" },
        { weekNumber: 5, ended: false, cancelled: false, link: "week" },
        { weekNumber: 6, ended: false, cancelled: true, link: "every" },
      ],
      3,
    );
    assert.deepEqual(facts, { laterOnEvery: [4], laterOwn: [5], earlier: [2] });
    assert.equal(
      words.onwardsHintWords(3, [2], true, [5]),
      "Replaces the every-week link from week 3. Week 5 keeps the link set for it, and won’t get this one. Week 2 keeps the link it had.",
    );
    assert.equal(
      words.onwardsHintWords(2, [1], false, [4, 5]),
      "Sets it for week 2 and every later week without a link of its own. Weeks 4 and 5 keep the links set for them, and won’t get this one. Week 1 keeps the link it had.",
    );
    assert.equal(words.linkSavedWords(3, true, []), "The meeting link is set for every week, from week 3. Nobody was emailed.");
    assert.equal(words.linkSavedWords(3, true, [5]), "The meeting link is set from week 3 on, except week 5, which keeps its own. Nobody was emailed.");
    assert.equal(words.linkSavedWords(3, true, [5, 6]), "The meeting link is set from week 3 on, except weeks 5 and 6, which keep their own. Nobody was emailed.");
    assert.equal(words.linkSavedWords(3, false, [5]), "The meeting link is set for week 3. Nobody was emailed.");
    const history = await loadTs("lib/courses/groupChange/words.ts");
    assert.equal(history.linkHeadline(3, true), "Set the meeting link for every week, from week 3.");
    assert.equal(history.linkHeadline(3, true, [5, 6]), "Set the meeting link from week 3 on, except weeks 5 and 6, which keep their own.");
    assert.equal(history.linkHeadline(3, false, [5]), "Set the meeting link for week 3 only.");

    // The panel opens on that week only, with both hints.
    const { default: LinkPanel } = await loadTs(join("features", "courses", "groupPage", "LinkPanel.tsx"));
    world.db.poke(`courseGroups/${B}`, { session: { ...world.db.read(`courseGroups/${B}`).session, meetingUrl: "https://meet.example/every" } });
    const view = await read("facilitator", "rahul");
    const html = renderToStaticMarkup(createElement(LinkPanel, { view, week: { weekNumber: 4, sessionKey: "w04" }, onClose() {}, onDone() {} }));
    const radios = [...html.matchAll(/<input type="radio"[^>]*>/g)].map((m) => m[0]);
    assert.equal(radios.length, 2);
    assert.match(radios[0], /checked/, "that week only is chosen");
    assert.doesNotMatch(radios[1], /checked/);
    assert.ok(text(html).includes("Week 4 only Weeks 5 and 6 keep the every-week link."), text(html));
    assert.ok(text(html).includes("Week 4 onwards Replaces the every-week link from week 4. Weeks 1 to 3 keep the links they had."), text(html));
  });
});

// ---------------------------------------------------------------------------
// 4. The register opens with a person's word in
// ---------------------------------------------------------------------------

const gridLoader = createLoader({
  stubs: new Map([
    ...[...STYLESHEETS].map((specifier) => [specifier, CLASS_NAMES]),
    ["server-only", "export {};"],
    ["next/link", "export default ({ href, className, children }) => globalThis.__facWeekUi.h('a', { href, className }, children);"],
    ["next/navigation", "export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {} });"],
    ["@/hooks/useHydrated", "export function useHydrated() { return true; }"],
    ["./useAttendance", "export default function useAttendance() { return globalThis.__facWeekUi.attendance; }"],
  ]),
});
const AttendanceGrid = (await gridLoader.loadTs(join("features", "courses", "AttendanceGrid.tsx"))).default;
const registerAs = (who) => call(who, registerRoute.GET, { groupId: B }, { course: true });
function drawRegister(payload) {
  ui.attendance = { ...payload, loading: false, loaded: true, error: null, reload() {}, mark: async () => {}, edit: async () => ({}), push: async () => ({}), saveNote: async () => ({}) };
  return renderToStaticMarkup(createElement(AttendanceGrid, { groupId: B, runId: RUN.agi }));
}

describe("4. the register opens with what people said", () => {
  test("somebody who said they are joining online: drawn online with their word before the tap, and the tap is still one", async () => {
    world.db.seed(`courseAttendance/${RUN.agi}__${B}__w04`, { runId: RUN.agi, groupId: B, weekNumber: 4, onlineSaid: { amara: new Date("2026-11-18T09:00:00Z") } });
    w.at("2026-11-24T18:30:00Z");
    const html = drawRegister((await registerAs("rahul")).body);
    // Found by its words, as a facilitator reads it under the line.
    const said = [...html.matchAll(/<span class="lineChip">Said joining online<\/span>/g)];
    assert.equal(said.length, 1, "one line said joining online");
    assert.ok(text(html).includes(linkWords.SAID_JOINING_ONLINE));
    assert.match(html, new RegExp(`aria-label="${goesBy("amara")}, week 4: not marked\\. They said they’re joining online\\. Sets Present\\."`));
    assert.equal([...html.matchAll(/class="where whereOnline whereStatic"/g)].length, 1, "their place drawn online, before any mark");
    // Drawing it wrote nothing: the word is not a mark until the tap.
    assert.equal(world.db.read(`courseAttendance/${RUN.agi}__${B}__w04`).records, undefined);
  });

  test("a register where nobody said anything draws no such line, and a tap stores what it always stored", async () => {
    w.at("2026-11-24T18:30:00Z");
    const html = drawRegister((await registerAs("rahul")).body);
    assert.doesNotMatch(html, /Said joining online|whereStatic/);
    const marked = await call("rahul", registerRoute.POST, { groupId: B }, { body: { weekNumber: 4, marks: [{ uid: "amara", status: "present" }, { uid: "ines", status: "absent" }] }, course: true });
    assert.equal(marked.status, 200);
    const stored = world.db.read(`courseAttendance/${RUN.agi}__${B}__w04`);
    assert.deepEqual(stored.records, { amara: "present", ines: "absent" });
    assert.deepEqual(stored.online, { amara: false });
    assert.equal(stored.onlineSaid, undefined);
    assert.equal(stored.markedByUid, "rahul");
  });
});

// The cap the writer keeps, named so a change to it is read here.
test("the group's cap on weeks set apart is the one the writer asks", () => {
  assert.equal(GROUP_FIELD_LIMITS.maxSessionOverrides, 20);
});
