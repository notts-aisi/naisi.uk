/**
 * Changing a session (Q25): the pages that offer it and the pages that show
 * what it did, as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/sessions   the Sessions view (wk-session)
 *   /learn/[runId]/group/[groupId]/sessions                                      a group's own sessions
 *   /learn/[runId]/group/[groupId]                                               "Change a session", and the notice
 *   GET /api/courses/runs/[runId]/overview, its cards rendered                   what the group reads (wk-changes)
 *
 * ## What this guards
 *
 *  1. THE SESSIONS VIEW is the lead's and an admin's, as the Groups tab's
 *     other views are: the week, each group's session in it with its slot,
 *     room and facilitators, and the dialog's every value from records.
 *  2. THE DIALOG draws the board's words, names the session on its button,
 *     and is pressable only once hydrated.
 *  3. A GROUP'S OWN PAGE offers "Change a session" to its facilitators and
 *     admins, and lists the group's sessions from today.
 *  4. WHAT PEOPLE READ: a cancelled evening's notice in the board's words, the
 *     next session covering both weeks, a moved session's day, time and room,
 *     and an online week's "Join online" with its line; never to anybody the
 *     group is not theirs, never another group's link.
 *
 * Real: the pages, the tree's gate, the loaders, the overview route, the
 * resolver, the dialog and the cards rendered to HTML. Faked: the session,
 * the Admin SDK handle, `next/link`, `next/navigation`, the stylesheets, and
 * the group page's roster and register.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, AWAY, B, C, LINK, ROUND, RUN, TUE_24, makeSessionsWorld } from "./lib/sessionsWorld.mjs";

const ui = { h: createElement };
globalThis.__sessionsPagesUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const STYLESHEETS = [
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./ProgrammeFrame.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  "./GroupsViews.module.css",
  "./SessionsBoard.module.css",
  "./InitialsChip.module.css",
  "./Chip.module.css",
  "./Button.module.css",
  "./Input.module.css",
  "./Select.module.css",
  "./Card.module.css",
  "./SessionCard.module.css",
  "./Updates.module.css",
  "@/features/courses/updates/Messages.module.css",
];
/** A card of the group page this suite is not about: it draws its name. */
const CARD = (name) => `export default function ${name}() { return globalThis.__sessionsPagesUi.h("div", null, "[${name}]"); }`;

const w = await makeSessionsWorld("__sessionsPages", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useSelectedLayoutSegment() { return 'groups'; }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
  ],
  [
    "next/link",
    "export default ({ href, className, children, ...rest }) =>\n" +
      "  globalThis.__sessionsPagesUi.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);",
  ],
  ["./session", "export async function getCurrentUser() { return globalThis.__sessionsPages.user; }"],
  ["@/features/courses/GroupRoster", CARD("GroupRoster")],
  ["@/features/courses/AttendanceGrid", CARD("AttendanceGrid")],
  ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
]);
const { world, loadTs, press, at } = w;

const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
const { default: SessionsPage } = await loadTs(join(TABS, "groups", "sessions", "page.tsx"));
const { default: GroupSessionsPage } = await loadTs(join(GROUP, "sessions", "page.tsx"));
const { default: GroupPage } = await loadTs(join(GROUP, "page.tsx"));
const { default: ChangeSessionDialog } = await loadTs(join("features", "courses", "sessionChange", "ChangeSessionDialog.tsx"));
const { default: SessionCard } = await loadTs(join("features", "courses", "SessionCard.tsx"));
const { default: SessionNotice } = await loadTs(join("features", "courses", "sessionChange", "SessionNotice.tsx"));
const cardFacts = await loadTs(join("features", "courses", "sessionChange", "cardFacts.ts"));
const overview = await w.courseRoute("runs", "[runId]", "overview");

const PAGE_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;
const GROUP_PATH = (groupId) => `/learn/${RUN.agi}/group/${groupId}`;

/** The session `getCurrentUser()` builds from the stored account, with the reviewer flag the roles writer keeps. */
function sessionFor(uid) {
  const base = w.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A page as `who` sees it: the element, its HTML, the collections it read, where it sent them, and whether it wrote. */
async function draw(Page, who, params, searchParams = {}) {
  world.user = who === null ? null : sessionFor(who);
  world.course = true;
  const reads = [];
  const collection = world.courseDb.collection;
  world.courseDb.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  const before = w.everything();
  try {
    const element = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) });
    const html = renderToStaticMarkup(element);
    return { element, html, text: text(html), reads, to: null, wrote: w.everything() !== before };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { element: null, html: "", text: "", reads, to: err.to, wrote: w.everything() !== before };
  } finally {
    world.courseDb.collection = collection;
    world.course = false;
  }
}

/** Every element below `element` whose component is called `name`. */
function find(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) find(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element);
  for (const value of Object.values(element.props ?? {})) find(value, name, out);
  return out;
}

const sessionsView = (who, query = {}) => draw(SessionsPage, who, { roundId: ROUND, programmeId: AGI }, query);
const groupSessions = (who, groupId = B) => draw(GroupSessionsPage, who, { runId: RUN.agi, groupId });
const groupPage = (who, groupId = B) => draw(GroupPage, who, { runId: RUN.agi, groupId });

/** The cards the Sessions view's board was handed. */
async function cardsFor(who, query = {}) {
  const drawn = await sessionsView(who, query);
  const [board] = find(drawn.element, "SessionsBoard");
  assert.ok(board, `no board for ${who}: ${drawn.text.slice(0, 200)}`);
  return { drawn, board: board.props, card: (name) => board.props.cards.find((each) => each.heading === name) };
}

/** What the overview route answers `who`, and their own group's card. */
async function readOverview(who) {
  const response = await w.call(who, overview.GET, { runId: RUN.agi }, { course: true });
  return { status: response.status, body: response.body, group: response.body?.group ?? null };
}

/** A real card rendered to text. */
const render = (component, props) => text(renderToStaticMarkup(createElement(component, props)));

beforeEach(() => {
  w.reset();
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
});

// ---------------------------------------------------------------------------
// 1. The Sessions view
// ---------------------------------------------------------------------------

describe("1. the Sessions view is the lead's and an admin's", () => {
  for (const who of ["claudia", "zach"]) {
    test(`${who === "zach" ? "an admin" : "the programme's lead"}: the week and each group's session in it`, async () => {
      const { drawn, board, card } = await cardsFor(who);
      assert.equal(board.heading, "Week 4 of 6 · Thu 19 to Wed 25 Nov");
      assert.deepEqual(board.previous, { href: `${PAGE_PATH}/groups/sessions?week=3`, label: "Week 3" });
      assert.deepEqual(board.next, { href: `${PAGE_PATH}/groups/sessions?week=5`, label: "Week 5" });
      assert.deepEqual(
        board.cards.map((each) => [each.heading, each.sub, each.peopleLine, each.eyebrow, each.when, each.state, each.note]),
        [
          ["Group A", "Thursdays 6pm · Portland A13", "Sofia Rossi", "Week 4", "Today, 6pm", null, null],
          ["Group B", "Tuesdays 6pm · Hallward B12", "Rahul Mehta and Sofia Rossi", "Week 4", "Tue 24 Nov, 6pm", null, null],
          ["Group C", "Wednesdays 1pm · Room B8", "Tom Fletcher", "Week 4", "Wed 25 Nov, 1pm", null, null],
        ],
      );
      assert.deepEqual(card("Group B").people.map((person) => person.name), ["Rahul Mehta", "Sofia Rossi"]);
      // The views, with Sessions first and on screen.
      assert.match(drawn.html, new RegExp(`<a href="${PAGE_PATH}/groups/sessions" class="view viewCurrent" aria-current="page">Sessions</a>`));
      assert.match(drawn.text, /Week 4 of 6 · Thu 19 to Wed 25 Nov/);
      // The facilitators' initials, then their names, as the board draws them.
      assert.match(drawn.text, /Group B Tuesdays 6pm · Hallward B12 RM SR Rahul Mehta and Sofia Rossi Week 4 Tue 24 Nov, 6pm Change a session/);
      assert.match(drawn.text, /← Week 3 Week 5 →/);
      // Pressable only once hydrated.
      assert.match(drawn.html, /<button type="button" class="changeButton" aria-expanded="false" disabled="">Change a session<\/button>/);
      assert.equal(drawn.wrote, false);
    });
  }

  test("a reviewer is told the tab is the lead's and an admin's, having read only the form", async () => {
    const drawn = await sessionsView("lloyd");
    assert.match(drawn.text, /Only the programme’s lead and admins can open Groups/);
    assert.deepEqual(drawn.reads, ["admissionRounds"]);
    assert.equal(find(drawn.element, "SessionsBoard").length, 0);
  });

  test("the lead of another programme is told there is no programme here", async () => {
    const drawn = await sessionsView("tess");
    assert.match(drawn.text, /There is no programme here/);
    assert.equal(find(drawn.element, "SessionsBoard").length, 0);
  });

  test("a track lead, a facilitator, a member and somebody signed out go to the dashboard, having read nothing", async () => {
    for (const who of ["yusuf", "rahul", "amara", "dev", "nina", "nobody", null]) {
      const drawn = await sessionsView(who);
      assert.equal(drawn.to, "/dashboard", String(who));
      assert.deepEqual(drawn.reads, [], `${who}'s request read something`);
    }
  });

  test("another week of the run, by its number; a week the run does not teach shows the week it is in", async () => {
    const six = await cardsFor("claudia", { week: "6" });
    assert.equal(six.board.heading, "Week 6 of 6 · Thu 3 to Wed 9 Dec");
    assert.equal(six.board.next, null);
    assert.equal(six.card("Group B").when, "Tue 8 Dec, 6pm");
    assert.equal((await cardsFor("claudia", { week: "9" })).board.heading, "Week 4 of 6 · Thu 19 to Wed 25 Nov");
    assert.equal((await cardsFor("claudia", { week: "4; drop" })).board.heading, "Week 4 of 6 · Thu 19 to Wed 25 Nov");
  });

  test("Group B's dialog, every value from records", async () => {
    const { card } = await cardsFor("claudia");
    const dialog = card("Group B").dialog;
    assert.deepEqual(
      {
        title: dialog.title,
        subtitle: dialog.subtitle,
        current: dialog.current,
        online: dialog.online,
        keepPace: dialog.keepPace.hint,
        push: dialog.push.hint,
        restore: dialog.restore,
        tell: dialog.tell,
        whoCan: dialog.whoCan,
        dateKey: dialog.dateKey,
        weekNumber: dialog.weekNumber,
      },
      {
        title: "Change Group B’s week 4 session",
        subtitle: "Tue 24 Nov · 6pm · Hallward B12 · Rahul and Sofia",
        current: null,
        online: {
          available: false,
          hint: "Group B has no join link yet, so it can’t be held online. Add the link to the group’s session first.",
        },
        keepPace:
          "Week 4’s reading stays open. On Tue 1 Dec the group talks about weeks 4 and 5 together, and still finishes on Tue 8 Dec.",
        push: "Group B’s last session would move to Tue 15 Dec.",
        restore: null,
        tell: {
          people: 3,
          emails: 1,
          refused: false,
          line: "Emails 1 of the 3 people in Group B and puts an update on their programme page.",
        },
        whoCan: "Rahul, Sofia, Claudia, Yusuf and admins can change a session.",
        dateKey: TUE_24,
        weekNumber: 4,
      },
    );
    assert.deepEqual(dialog.move, {
      days: ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"].map(
        (dateKey) => ({ dateKey, label: dialog.move.days.find((d) => d.dateKey === dateKey)?.label }),
      ),
      dayKey: TUE_24,
      time: "6pm",
      room: "Hallward B12",
    });
    assert.deepEqual(
      dialog.move.days.map((day) => day.label),
      ["Thu 19 Nov", "Fri 20 Nov", "Sat 21 Nov", "Sun 22 Nov", "Mon 23 Nov", "Tue 24 Nov", "Wed 25 Nov"],
    );
  });

  test("when everybody in the group can be emailed, the line is the board's", async () => {
    // Ines back on the cohort list; Omar, whose address is on the do-not-email
    // list, leaves: everybody left in Group B can be emailed.
    world.db.poke("subscriptions/cohort__ines", { subscribed: true });
    world.db.poke(`courseEnrolments/${RUN.agi}__omar`, { status: "withdrawn" });
    const { card } = await cardsFor("claudia");
    assert.equal(
      card("Group B").dialog.tell.line,
      "Emails the 2 people in Group B and puts an update on their programme page.",
    );
  });

  test("a changed session says so: cancelled, then offered back as usual", async () => {
    await press("rahul", B, { week: 4, dateKey: TUE_24, kind: "cancel" }, { tell: false });
    const { card } = await cardsFor("claudia");
    assert.equal(card("Group B").state, "cancelled");
    assert.equal(card("Group B").dialog.current, "cancelled");
    assert.deepEqual(card("Group B").dialog.restore, {
      hint: "Back to Tuesdays 6pm in Hallward B12, like the group’s other weeks.",
    });
  });

  test("a group pushed back shows the evening it lost, and its week in the next week", async () => {
    await press("rahul", B, { week: 4, dateKey: TUE_24, kind: "push" }, { tell: false });
    const four = (await cardsFor("claudia")).card("Group B");
    assert.deepEqual([four.eyebrow, four.when, four.note, four.dialog], ["Week 4", "", "Tue 24 Nov · cancelled, the rest a week later", null]);
    const five = (await cardsFor("claudia", { week: "5" })).card("Group B");
    assert.deepEqual([five.eyebrow, five.when], ["Week 4", "Tue 1 Dec, 6pm"]);
    assert.ok(five.dialog, "the pushed week's session can be changed");
  });

  test("a session under way is the register's: it says so and offers no change", async () => {
    at("2026-11-19T18:30:00Z");
    const { card } = await cardsFor("claudia");
    assert.deepEqual([card("Group A").when, card("Group A").note, card("Group A").dialog], ["Today, 6pm", "Started", null]);
    assert.ok(card("Group B").dialog);
  });
});

// ---------------------------------------------------------------------------
// 2. The dialog
// ---------------------------------------------------------------------------

describe("2. the dialog draws the board's words", () => {
  const dialogFor = async () => (await cardsFor("claudia")).card("Group B").dialog;
  const drawDialog = (facts) =>
    renderToStaticMarkup(createElement(ChangeSessionDialog, { facts, onClose() {}, onDone() {} }));

  test("every line of wk-session's dialog, with the session named on the button", async () => {
    const html = drawDialog(await dialogFor());
    const said = text(html);
    for (const line of [
      "Change Group B’s week 4 session",
      "Tue 24 Nov · 6pm · Hallward B12 · Rahul and Sofia",
      "What happens to the session",
      "Hold it online",
      "Move it One week only. Day",
      "Time",
      "Room",
      "Cancel it, and keep pace Week 4’s reading stays open. On Tue 1 Dec the group talks about weeks 4 and 5 together, and still finishes on Tue 8 Dec.",
      "Cancel it, and push the rest back a week Group B’s last session would move to Tue 15 Dec.",
      "Reason (the group sees this)",
      "Tell the group Emails 1 of the 3 people in Group B and puts an update on their programme page.",
      "Change Tue 24 Nov’s session",
      "Emails 1 person",
      "Keep it",
      "Rahul, Sofia, Claudia, Yusuf and admins can change a session.",
    ]) {
      assert.ok(said.includes(line), `missing "${line}" in: ${said}`);
    }
    assert.match(html, /role="dialog" aria-modal="false" aria-labelledby=/);
    assert.match(html, /<legend class="legend">What happens to the session<\/legend>/);
    assert.match(html, /aria-label="Close"/);
    // The house Select, never a raw one, with the week's days.
    assert.match(html, /<select[^>]*class="select /);
    assert.match(html, /<option value="2026-11-24" selected="">Tue 24 Nov<\/option>/);
    assert.match(html, /<input id="[^"]+-time" type="text"[^>]*value="6pm"/);
    assert.match(html, /<input id="[^"]+-room" type="text"[^>]*value="Hallward B12"/);
    // Nothing is pressable before the page hydrates, and the online option stays
    // off for a group with no link.
    assert.match(html, /<div class="option optionDisabled"><label class="optionLabel"><input type="radio" class="radio" disabled="" name="[^"]+" value="online"\/>/);
    assert.ok(!/<button type="button" class="btn danger/.test(html), "a kind is chosen before anybody chose one");
    assert.match(html, /role="switch" class="switchInput" disabled="" checked=""/);
    assert.match(html, /<button class="btn primary md" type="button" disabled=""><span>Change Tue 24 Nov’s session<\/span><\/button>/);
  });

  test("with a join link, Hold it online says where the link goes", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    const facts = await dialogFor();
    assert.deepEqual(facts.online, {
      available: true,
      hint: "Same day and time. The join link goes on Group B’s programme page, never in an email.",
    });
    const html = drawDialog(facts);
    assert.ok(text(html).includes("Hold it online Same day and time. The join link goes on Group B’s programme page, never in an email."));
    assert.ok(!html.includes(LINK), "the dialog carries the link");
  });

  test("nobody in the group: no way to tell them, said in words", async () => {
    for (const uid of ["amara", "ines", "omar"]) world.db.poke(`courseEnrolments/${RUN.agi}__${uid}`, { status: "withdrawn" });
    const facts = await dialogFor();
    assert.equal(facts.tell.line, "Nobody is in Group B yet, so there is nobody to tell.");
    assert.match(drawDialog(facts), /role="switch" class="switchInput" disabled=""/);
    assert.doesNotMatch(drawDialog(facts), /role="switch" class="switchInput" disabled="" checked=""/);
  });
});

// ---------------------------------------------------------------------------
// 3. A group's own page
// ---------------------------------------------------------------------------

describe("3. a group's facilitators change its sessions from its own page", () => {
  test("the group page offers Change a session beside Write to Group B", async () => {
    const drawn = await groupPage("rahul");
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH(B)}/update" class="writeLink">Write to Group B \\(3\\)</a>`));
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH(B)}/sessions" class="writeLink">Change a session</a>`));
    assert.equal(drawn.wrote, false);
  });

  test("an archived group's page offers no change", async () => {
    world.db.poke(`courseGroups/${C}`, { archived: true });
    const drawn = await groupPage("zach", C);
    assert.doesNotMatch(drawn.text, /Change a session/);
  });

  test("its sessions from today, each with the dialog behind it", async () => {
    for (const who of ["rahul", "sofia", "zach"]) {
      const drawn = await groupSessions(who);
      assert.match(drawn.text, /Group B’s sessions/, who);
      assert.match(drawn.text, /Each session from today to the group’s last\. Changing one asks for a reason, and can tell the group\. Back to the group/);
      const [board] = find(drawn.element, "SessionsBoard");
      assert.deepEqual(
        board.props.cards.map((card) => [card.heading, card.when, Boolean(card.dialog)]),
        [
          ["Week 4", "Tue 24 Nov, 6pm", true],
          ["Week 5", "Tue 1 Dec, 6pm", true],
          ["Week 6", "Tue 8 Dec, 6pm", true],
        ],
        who,
      );
      assert.equal(drawn.wrote, false);
    }
  });

  test("another group's facilitator, the lead, a member and somebody signed out are sent away", async () => {
    for (const who of ["tom", "amara", "bea", "nobody"]) {
      const drawn = await groupSessions(who);
      assert.ok(drawn.to, `${who} was shown the page`);
      assert.equal(find(drawn.element, "SessionsBoard").length, 0);
    }
    assert.equal((await groupSessions(null)).to, "/login");
  });

  test("a facilitator of an archived group is sent away", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await groupSessions("rahul")).to, `/learn/${RUN.agi}`);
  });

  test("the group page tells its facilitators about a cancelled evening, as their group reads it", async () => {
    await press("rahul", B, { week: 4, dateKey: TUE_24, kind: "cancel" }, { tell: false });
    const drawn = await groupPage("sofia");
    assert.match(
      drawn.text,
      /No session on Tue 24 Nov Tue 24 Nov is cancelled\. Rahul and Sofia are both away\. Do week 4’s reading anyway\. On Tue 1 Dec you’ll talk about weeks 4 and 5 together\./,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. What people read
// ---------------------------------------------------------------------------

describe("4. what the group's people read after each kind of change", () => {
  test("cancelled, keeping pace: the board's notice, and the next session covering both weeks", async () => {
    await press("claudia", B, { week: 4, dateKey: TUE_24, kind: "cancel" });
    const { status, group } = await readOverview("amara");
    assert.equal(status, 200);
    assert.deepEqual(group.sessionNotice, {
      kind: "cancelled",
      dateKey: TUE_24,
      startTimeLocal: "18:00",
      weekNumber: 4,
      reason: AWAY,
      next: { dateKey: "2026-12-01", weekNumbers: [4, 5] },
    });
    assert.deepEqual(group.cancelledSessions, [{ weekNumber: 4, dateKey: TUE_24, reason: AWAY }]);
    const next = group.calendar.nextSession;
    assert.deepEqual(
      [next.dateKey, next.weekNumber, next.weekNumbers, next.location, next.meetingUrl],
      ["2026-12-01", 5, [4, 5], "Hallward B12", null],
    );

    // On the evening itself, the board's three lines word for word.
    assert.equal(
      render(SessionNotice, { notice: group.sessionNotice, now: new Date("2026-11-24T12:00:00Z") }),
      "No session tonight Tue 24 Nov is cancelled. Rahul and Sofia are both away. Do week 4’s reading anyway. On Tue 1 Dec you’ll talk about weeks 4 and 5 together.",
    );
    // Before it, the heading names the evening.
    assert.match(render(SessionNotice, { notice: group.sessionNotice, now: new Date("2026-11-19T10:00:00Z") }), /^No session on Tue 24 Nov /);
    // The card under it: the next session, with the weeks it covers.
    const card = render(SessionCard, cardFacts.nextSessionCard(group));
    assert.match(card, /^Tue 1 Dec · weeks 4 and 5 /);
    assert.match(card, /Tuesday 1 December · 18:00–20:00/);
    assert.match(card, /Hallward B12/);

    // The update is on their page too.
    const updates = await w.ask.read("amara");
    assert.deepEqual(
      updates.body.updates.map((update) => [update.title, update.message, update.toWords]),
      [["Tue 24 Nov’s session is cancelled", "Rahul and Sofia are both away. Week 4’s reading stays open.", "to Group B"]],
    );
  });

  test("nobody else reads it: another group, a member not yet told, one who left", async () => {
    await press("claudia", B, { week: 4, dateKey: TUE_24, kind: "cancel" });
    const bea = await readOverview("bea");
    assert.equal(bea.status, 200);
    assert.equal(bea.group.sessionNotice, null);
    assert.deepEqual(bea.group.cancelledSessions, []);
    assert.deepEqual((await w.ask.read("bea")).body.updates, []);
    for (const who of ["dev", "nina", "nobody"]) {
      const read = await readOverview(who);
      assert.notEqual(read.status, 200, `${who} read the run`);
    }
  });

  test("the group's facilitators read it on their card; another group's do not", async () => {
    await press("claudia", B, { week: 4, dateKey: TUE_24, kind: "cancel" });
    const rahul = await readOverview("rahul");
    const own = rahul.body.groups.find((each) => each.id === B);
    assert.equal(own.sessionNotice.kind, "cancelled");
    const tom = await readOverview("tom");
    assert.ok(tom.body.groups.every((each) => each.id !== B), "Tom reads Group B's card");
    assert.ok(tom.body.groups.every((each) => each.sessionNotice === null));
  });

  test("pushed back: the evening is off, and week 4 is a week later", async () => {
    await press("claudia", B, { week: 4, dateKey: TUE_24, kind: "push" });
    const { group } = await readOverview("amara");
    assert.deepEqual(group.sessionNotice, {
      kind: "pushed",
      dateKey: TUE_24,
      startTimeLocal: "18:00",
      weekNumber: 4,
      reason: AWAY,
      next: { dateKey: "2026-12-01", weekNumbers: [4] },
    });
    assert.equal(
      render(SessionNotice, { notice: group.sessionNotice, now: new Date("2026-11-24T19:00:00Z") }),
      "No session tonight Tue 24 Nov is cancelled. Rahul and Sofia are both away. Week 4 is now on Tue 1 Dec, and every session after it moves back a week.",
    );
    assert.equal(group.calendar.lastSessionDate, "2026-12-15");
    assert.equal(group.calendar.nextSession.dateKey, "2026-12-01");
  });

  test("moved: that week's day, time and room", async () => {
    await press("rahul", B, { week: 4, dateKey: TUE_24, kind: "move", move: { dateKey: "2026-11-25", time: "7pm", room: "Portland A13" } });
    const { group } = await readOverview("amara");
    assert.equal(group.sessionNotice, null);
    const card = render(SessionCard, {
      group,
      slotStartKey: group.calendar.currentWeek.slotStartKey,
      mode: null,
      cancelled: cardFacts.cancelledIn(group, 4),
    });
    assert.match(card, /Wednesday 25 November · 19:00–21:00/);
    assert.match(card, /Portland A13/);
    assert.doesNotMatch(card, /Hallward B12/);
  });

  test("online: Join online on the page, with the board's line, and the link to nobody outside the group", async () => {
    world.db.poke(`courseGroups/${B}`, { "session.meetingUrl": LINK });
    await press("rahul", B, { week: 6, dateKey: "2026-12-08", kind: "online" });
    at("2026-12-03T10:00:00Z");
    const { group } = await readOverview("amara");
    assert.equal(group.meetingUrl, LINK);
    assert.equal(group.sessionModes.w06, "virtual");
    const card = renderToStaticMarkup(
      createElement(SessionCard, { group, slotStartKey: group.calendar.currentWeek.slotStartKey, mode: group.sessionModes.w06 }),
    );
    assert.match(card, new RegExp(`<a class="button" href="${LINK}" target="_blank" rel="noopener noreferrer">Join online</a>`));
    assert.ok(text(card).includes("The link is here, not in your emails, so it can’t be forwarded."));
    assert.ok(text(card).includes("Online this week"));
    assert.doesNotMatch(text(card), /Hallward B12/);
    // Group A's member reads no link of Group B's.
    const bea = await readOverview("bea");
    assert.ok(!JSON.stringify(bea.body).includes(LINK), "Group A's member was handed Group B's link");
    // And the update's email carried none.
    assert.ok(!JSON.stringify(world.mail).includes(LINK));
  });

  test("an online week with no link to give says where it will be, and promises no email", () => {
    const group = {
      id: B,
      name: "Group B",
      calendar: { currentWeek: null, nextSession: null },
      sessionLabel: "Tuesdays 18:00–20:00",
      weekday: 2,
      startTimeLocal: "18:00",
      durationMinutes: 120,
      location: "Hallward B12",
      meetingUrl: null,
      sessionModes: { w06: "virtual" },
      facilitatorNames: [],
      sessionNotice: null,
      cancelledSessions: [],
    };
    const said = render(SessionCard, { group, slotStartKey: "2026-12-03", mode: "virtual" });
    assert.ok(said.includes("Online this week. The link to join will be here, not in your emails."), said);
    assert.doesNotMatch(said, /send/);
  });

  test("the week page's card for a cancelled week says so, with the reason, and names no room", async () => {
    await press("rahul", B, { week: 4, dateKey: TUE_24, kind: "cancel" }, { tell: false });
    const { group } = await readOverview("amara");
    const said = render(SessionCard, {
      group,
      slotStartKey: "2026-11-19",
      mode: null,
      cancelled: cardFacts.cancelledIn(group, 4),
    });
    assert.match(said, /Cancelled/);
    assert.ok(said.includes(AWAY));
    assert.doesNotMatch(said, /Hallward B12/);
    assert.equal(cardFacts.cancelledIn(group, 5), null);
  });
});
