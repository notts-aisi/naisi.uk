/**
 * Updates (Q18): the pages that write and show them, as every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/messages   the lead's Messages tab
 *   /learn/[runId]/group/[groupId]                                         a facilitator's group page
 *   /learn/[runId]/group/[groupId]/update                                  the composer for one group
 *   /learn/[runId]                                                         a member's programme page
 *
 * ## What this guards
 *
 *  1. THE MESSAGES TAB is the lead's and an admin's: the composer with every
 *     audience and its two numbers, and every update on the run with who it
 *     was to and what its email did. A reviewer is told the tab is theirs,
 *     before the run is read; somebody with no role on the programme is told
 *     there is no programme here; everybody else is sent away by the tree's
 *     gate. The tab is a link for the same two and for nobody else.
 *  2. THE GROUP PAGE has "Write to Group B (3)" and its line, counted as the
 *     press counts, and Updates for that group's page only: never another
 *     group's, even for a facilitator of both.
 *  3. THE COMPOSER FOR ONE GROUP says its group rather than offering a
 *     choice, and opens only for that group's facilitators and admins.
 *  4. THE MEMBER'S SECTION shows three updates, then "Show older updates";
 *     the composer draws the board's words and is pressable only once
 *     hydrated; a message is drawn as text with its line breaks.
 *
 * Real: the pages (server components), the tree's gate, the loaders, the
 * readers and the audiences, the composer and the lists rendered to HTML.
 * Faked: the session, the Admin SDK handle, `next/link`, `next/navigation`,
 * the stylesheets, and the three cards of the group page that are not about
 * updates (the session card, the roster, the register).
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, AGI, B, C, ROUND, RUN, makeUpdatesWorld } from "./lib/updatesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const ui = { h: createElement, segment: "messages" };
globalThis.__updatesPagesUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const STYLESHEETS = [
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./ProgrammeFrame.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  "./Chip.module.css",
  "./InitialsChip.module.css",
  "./Button.module.css",
  "./Input.module.css",
  "./Select.module.css",
  "./Updates.module.css",
  "./UpdateComposer.module.css",
  "@/features/courses/updates/Messages.module.css",
  // The facilitator's pages (boards wk-fac-group, wk-fac-home-phone): their own sheet and the
  // member's pages' shared one, since the group page and the Attendance tab draw their cards.
  "@/features/courses/weekly/weekly.module.css",
  "./facilitator.module.css",
  "@/features/courses/facilitator/facilitator.module.css",
];
/** A card of the group page that is not about updates: it draws its name. */
const CARD = (name) => `export default function ${name}() { return globalThis.__updatesPagesUi.h("div", null, "[${name}]"); }`;

const w = await makeUpdatesWorld("__updatesPages", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useSelectedLayoutSegment() { return globalThis.__updatesPagesUi.segment; }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
  ],
  [
    "next/link",
    "export default ({ href, className, children, style, ...rest }) =>\n" +
      "  globalThis.__updatesPagesUi.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);",
  ],
  // The tree's gate reads the session through its own relative import.
  ["./session", "export async function getCurrentUser() { return globalThis.__updatesPages.user; }"],
  ["@/features/courses/SessionCard", CARD("SessionCard")],
  ["@/features/courses/GroupRoster", CARD("GroupRoster")],
  ["@/features/courses/AttendanceGrid", CARD("AttendanceGrid")],
  ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
]);
const { world, press, loadTs } = w;

const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
const { default: MessagesPage } = await loadTs(join(TABS, "messages", "page.tsx"));
const { default: GroupPage } = await loadTs(join(GROUP, "page.tsx"));
const { default: UpdatePage } = await loadTs(join(GROUP, "update", "page.tsx"));
const { default: ProgrammeTabs } = await loadTs(join("features", "applications", "editor", "ProgrammeTabs.tsx"));
const { default: UpdateComposer } = await loadTs(join("features", "courses", "updates", "UpdateComposer.tsx"));
const { RunUpdatesView } = await loadTs(join("features", "courses", "updates", "RunUpdates.tsx"));
const { ReaderUpdateItem } = await loadTs(join("features", "courses", "updates", "UpdatesList.tsx"));

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
    .replace(/\s+/g, " ")
    .trim();

/** A page as `who` sees it: the element, its HTML, the collections it read, where it sent them, and whether it wrote. */
async function draw(Page, who, params) {
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
    const element = await Page({ params: Promise.resolve(params) });
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

const messages = (who) => draw(MessagesPage, who, { roundId: ROUND, programmeId: AGI });
const groupPage = (who, groupId = B) => draw(GroupPage, who, { runId: RUN.agi, groupId });
const updatePage = (who, groupId = B) => draw(UpdatePage, who, { runId: RUN.agi, groupId });

/** Updates on the run, an hour apart: one to everyone, to Group B, to Group A and to the facilitators. */
async function fourUpdates() {
  for (const [at, who, post] of [
    ["2026-11-12T09:00:00Z", "claudia", { to: "everyone", title: "Week 3 readings are up" }],
    ["2026-11-16T10:00:00Z", "rahul", { to: "group", groupId: B, title: "Room change for Group B this week" }],
    ["2026-11-16T11:00:00Z", "sofia", { to: "group", groupId: A, title: "Group A meets in A13" }],
    ["2026-11-16T12:00:00Z", "claudia", { to: "facilitators", title: "The week 3 guide", email: false }],
  ]) {
    w.setClock(at);
    const response = await press(who, post);
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
}

beforeEach(() => {
  w.reset();
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  ui.segment = "messages";
});

// ---------------------------------------------------------------------------
// 1. The Messages tab
// ---------------------------------------------------------------------------

describe("1. the Messages tab is the lead's and an admin's", () => {
  for (const who of ["claudia", "zach"]) {
    test(`${who === "zach" ? "an admin" : "the programme's lead"}: the composer with every audience, and every update`, async () => {
      await fourUpdates();
      const drawn = await messages(who);
      const [composer] = find(drawn.element, "UpdateComposer");
      assert.equal(composer.props.runId, RUN.agi);
      // The groups in People in groups' order, Monday first, as every tab of
      // the programme's page lists them (the walk of stage two's fixes, G10).
      assert.deepEqual(
        composer.props.audiences.map((a) => [a.key, a.label, a.emails]),
        [
          // The email reaches everybody told whose address is not stopped,
          // Ines among them though she unsubscribed from the cohort list: an
          // update is a notice.
          ["everyone", "Everyone on AGI Strategy (5)", 4],
          [`group:${B}`, "Group B (3)", 2],
          [`group:${C}`, "Group C (1)", 1],
          [`group:${A}`, "Group A (1)", 1],
          ["facilitators", "The facilitators (3)", 3],
        ],
      );
      const [list] = find(drawn.element, "StaffUpdatesSection");
      assert.deepEqual(
        list.props.updates.map((update) => [update.title, update.meta]),
        [
          ["The week 3 guide", "Claudia → Facilitators · Mon 16 Nov · Not emailed"],
          ["Group A meets in A13", "Sofia → Group A · Mon 16 Nov · Emailed to 1"],
          ["Room change for Group B this week", "Rahul → Group B · Mon 16 Nov · Emailed to 2"],
          ["Week 3 readings are up", "Claudia → Everyone · Thu 12 Nov · Emailed to 4"],
        ],
      );
      assert.match(drawn.text, /New update To Everyone on AGI Strategy \(5\) Group B \(3\)/);
      // Dev is placed in Group B and not yet told his group: under To the
      // composer says so, starting on the update to everyone (the walk of
      // stage two's fixes, G1).
      assert.deepEqual(
        composer.props.audiences.map((a) => [a.key, a.notYetTold]),
        [
          ["everyone", "1 person placed in groups hasn’t been told their group yet. They’ll read this once Publish tells them, and won’t be emailed it."],
          [`group:${B}`, "1 person placed in Group B hasn’t been told their group yet. They’ll read this once Publish tells them, and won’t be emailed it."],
          [`group:${C}`, null],
          [`group:${A}`, null],
          ["facilitators", null],
        ],
      );
      assert.match(
        drawn.text,
        /Or a group, or the facilitators 1 person placed in groups hasn’t been told their group yet\. They’ll read this once Publish tells them, and won’t be emailed it\. Title Message 0 \/ 4,000 Also email it Emails 4 people/,
      );
      assert.match(drawn.text, /Send a test to me Post and email 4 people/);
      assert.equal(drawn.wrote, false);
    });
  }

  test("a reviewer is told the tab is the lead's and an admin's, and only the form was read", async () => {
    const drawn = await messages("lloyd");
    assert.match(drawn.text, /Only the programme’s lead and admins can open Messages/);
    assert.match(drawn.html, new RegExp(`href="${PAGE_PATH}/applications"`));
    assert.deepEqual(drawn.reads, ["admissionRounds"]);
    assert.equal(find(drawn.element, "UpdateComposer").length, 0);
  });

  test("the lead of another programme is told there is no programme here", async () => {
    const drawn = await messages("tess");
    assert.match(drawn.text, /There is no programme here/);
    assert.deepEqual(drawn.reads, ["admissionRounds"]);
  });

  test("a track lead, a facilitator, a member and somebody signed out go to the dashboard, having read nothing", async () => {
    for (const who of ["yusuf", "rahul", "amara", "nobody", null]) {
      const drawn = await messages(who);
      assert.equal(drawn.to, "/dashboard", String(who));
      assert.deepEqual(drawn.reads, [], `${who}'s request read something`);
    }
  });

  test("a programme that names no run is told so, in words for each", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    assert.match((await messages("claudia")).text, /AGI Strategy doesn’t name a course run yet\. An admin names it/);
    assert.match((await messages("zach")).text, /AGI Strategy doesn’t name a course run yet\. Name it/);
  });

  test("the tab is a link for an admin and the lead, and drawn but not a link for a reviewer", () => {
    const tabs = (groupsOpen) =>
      renderToStaticMarkup(
        createElement(ProgrammeTabs, { base: PAGE_PATH, applications: 5, groups: 3, canEdit: groupsOpen, groupsOpen }),
      );
    assert.match(tabs(true), new RegExp(`<a href="${PAGE_PATH}/messages" class="tab tabCurrent" aria-current="page">Messages</a>`));
    assert.doesNotMatch(tabs(false), /\/messages/);
    assert.match(tabs(false), /<span class="tab tabPending" aria-disabled="true" title="Not built yet">Messages<\/span>/);
  });
});

// ---------------------------------------------------------------------------
// 2. The group page
// ---------------------------------------------------------------------------

describe("2. a facilitator's group page", () => {
  // The page drawn to wk-fac-group: "Write to Group B (7)" is one of the two
  // buttons of its head (the house link-as-button, "button"), beside "Change a
  // session", and the line saying what the update emails sits under both.
  test("Write to Group B, counted as the press counts, and the line under it", async () => {
    const drawn = await groupPage("rahul");
    assert.match(drawn.html, new RegExp(`<a href="${GROUP_PATH(B)}/update" class="button">Write to Group B \\(3\\)</a>`));
    assert.match(drawn.text, /Write to Group B \(3\) Change a session Posts an update to the group and emails 2 people\. Replies go to ai-safety@uonsu\.com\./);
    assert.equal(drawn.wrote, false);
  });

  test("Updates shows what the group's page is about: everyone, the facilitators and this group, never another group's", async () => {
    await fourUpdates();
    for (const who of ["rahul", "sofia", "zach"]) {
      const drawn = await groupPage(who);
      const [list] = find(drawn.element, "StaffUpdatesSection");
      assert.deepEqual(
        list.props.updates.map((update) => update.title),
        ["The week 3 guide", "Room change for Group B this week", "Week 3 readings are up"],
        who,
      );
    }
    // Sofia on Group A's page sees Group A's, and not B's.
    const onA = await groupPage("sofia", A);
    assert.deepEqual(
      find(onA.element, "StaffUpdatesSection")[0].props.updates.map((update) => update.title),
      ["The week 3 guide", "Group A meets in A13", "Week 3 readings are up"],
    );
    assert.match(onA.text, /Write to Group A \(1\)/);
  });

  test("the line says so when nobody in the group can be emailed yet", async () => {
    // Tariq, Group C's one person, has an address that is stopped. (Off the
    // cohort list he would still be emailed: an update is a notice.)
    world.db.seed("suppressedEmails/tariq@example.com", { email: "tariq@example.com", reason: "bounce", source: "manual" });
    const drawn = await groupPage("tom", C);
    assert.match(drawn.text, /Write to Group C \(1\) Change a session Posts an update to the group\. Nobody in it can be emailed yet\./);
  });

  test("an archived group's page, for an admin, offers no way to write to it", async () => {
    world.db.poke(`courseGroups/${C}`, { archived: true });
    const drawn = await groupPage("zach", C);
    assert.doesNotMatch(drawn.text, /Write to/);
    assert.equal(find(drawn.element, "StaffUpdatesSection").length, 1);
  });

  test("another group's facilitator and a member are sent to the run's home", async () => {
    for (const who of ["tom", "amara"]) {
      assert.equal((await groupPage(who, B)).to, `/learn/${RUN.agi}`, who);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The composer for one group
// ---------------------------------------------------------------------------

describe("3. the composer for one group", () => {
  test("its facilitator is handed that group alone, said rather than offered", async () => {
    const drawn = await updatePage("rahul");
    const [composer] = find(drawn.element, "UpdateComposer");
    // Dev is placed in Group B and not yet told his group: the composer says
    // so under To (the walk of stage two's fixes, G1), and the page's own line
    // above it does not say it a second time.
    assert.deepEqual(composer.props.audiences, [
      {
        key: `group:${B}`,
        to: "group",
        groupId: B,
        label: "Group B (3)",
        emails: 2,
        refused: false,
        notYetTold: "1 person placed in Group B hasn’t been told their group yet. They’ll read this once Publish tells them, and won’t be emailed it.",
      },
    ]);
    assert.match(drawn.text, /Write to Group B Posts an update to the group and emails 2 people\. Replies go to ai-safety@uonsu\.com\. Back to the group/);
    assert.match(
      drawn.text,
      /New update To Group B \(3\) 1 person placed in Group B hasn’t been told their group yet\. They’ll read this once Publish tells them, and won’t be emailed it\. Title Message/,
    );
    assert.doesNotMatch(drawn.html, /<select/);
    assert.equal(drawn.wrote, false);
  });

  test("an admin is handed the same", async () => {
    const [composer] = find((await updatePage("zach")).element, "UpdateComposer");
    assert.deepEqual(composer.props.audiences.map((a) => a.label), ["Group B (3)"]);
  });

  test("another group's facilitator, a member, the lead, and an archived group are all sent to the run's home", async () => {
    for (const who of ["tom", "amara", "claudia"]) {
      assert.equal((await updatePage(who)).to, `/learn/${RUN.agi}`, who);
    }
    world.db.poke(`courseGroups/${C}`, { archived: true });
    assert.equal((await updatePage("tom", C)).to, `/learn/${RUN.agi}`);
  });

  test("somebody signed out is sent to sign in", async () => {
    assert.equal((await updatePage(null)).to, "/login");
  });
});

// ---------------------------------------------------------------------------
// 4. The member's section, the composer and a message as text
// ---------------------------------------------------------------------------

const reader = (n) => ({
  id: `u${n}`,
  title: `Update ${n}`,
  message: `Message ${n}`,
  authorUid: "rahul",
  authorName: "Rahul",
  authorFirst: "Rahul",
  toWords: "to Group B",
  postedOn: "Mon 16 Nov",
});

describe("4. the member's section, the composer, and a message as text", () => {
  test("three updates, then Show older updates, which shows the rest", () => {
    const four = [1, 2, 3, 4].map(reader);
    const first = text(renderToStaticMarkup(createElement(RunUpdatesView, { updates: four, showAll: false })));
    assert.match(first, /^Updates /);
    assert.match(first, /Update 3/);
    assert.doesNotMatch(first, /Update 4/);
    assert.match(first, /Show older updates$/);
    const all = text(renderToStaticMarkup(createElement(RunUpdatesView, { updates: four, showAll: true })));
    assert.match(all, /Update 4/);
    assert.doesNotMatch(all, /Show older updates/);
    const three = text(renderToStaticMarkup(createElement(RunUpdatesView, { updates: four.slice(0, 3), showAll: false })));
    assert.doesNotMatch(three, /Show older updates/);
  });

  test("the empty and failed states have their sentences", () => {
    assert.equal(text(renderToStaticMarkup(createElement(RunUpdatesView, { updates: [], showAll: false }))), "Updates No updates yet.");
    assert.equal(
      text(renderToStaticMarkup(createElement(RunUpdatesView, { updates: null, showAll: false }))),
      "Updates The updates didn’t load. Try again",
    );
  });

  test("an update on a member's page: the writer, who it was to and the day, then the message", () => {
    const html = renderToStaticMarkup(createElement(ReaderUpdateItem, { update: reader(1) }));
    assert.equal(text(html), "R Update 1 Rahul · to Group B · Mon 16 Nov Message 1");
    assert.match(html, /<h3 class="itemTitle">Update 1<\/h3>/);
  });

  test("a message is text: typed markup is escaped and its line breaks are kept", () => {
    const html = renderToStaticMarkup(
      createElement(ReaderUpdateItem, { update: { ...reader(1), message: "Line one\n<b>Line</b> two" } }),
    );
    assert.ok(html.includes("Line one\n&lt;b&gt;Line&lt;/b&gt; two"));
    const css = readFileSync(join(SRC, "features", "courses", "updates", "Updates.module.css"), "utf8");
    assert.match(css, /\.message \{[^}]*white-space: pre-wrap;/);
  });

  test("the composer before it hydrates: the board's words, every button off", () => {
    const html = renderToStaticMarkup(
      createElement(UpdateComposer, {
        runId: RUN.agi,
        audiences: [
          { key: "everyone", to: "everyone", groupId: null, label: "Everyone on AGI Strategy (31)", emails: 31, refused: false },
          { key: `group:${B}`, to: "group", groupId: B, label: "Group B (7)", emails: 7, refused: false },
        ],
      }),
    );
    assert.equal(
      text(html),
      "New update To Everyone on AGI Strategy (31) Group B (7) Or a group, or the facilitators Title Message 0 / 4,000 " +
        "Also email it Emails 31 people Send a test to me Post and email 31 people",
    );
    assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2);
    assert.match(html, /<select[^>]*disabled=""/);
    const toggle = /<input[^>]*role="switch"[^>]*>/.exec(html)?.[0] ?? "";
    assert.match(toggle, /type="checkbox"/);
    assert.match(toggle, /checked=""/);
    assert.match(toggle, /disabled=""/);
    // Real labels on real controls.
    for (const label of ["To", "Title", "Message"]) {
      const id = new RegExp(`<label for="([^"]+)"[^>]*>${label}</label>`).exec(html)?.[1];
      assert.ok(id && html.includes(`id="${id}"`), `${label} has no control`);
    }
  });

  test("an audience nobody in can be emailed: the switch is off and says so, and the button only posts", () => {
    const html = renderToStaticMarkup(
      createElement(UpdateComposer, {
        runId: RUN.agi,
        audiences: [{ key: `group:${C}`, to: "group", groupId: C, label: "Group C (1)", emails: 0, refused: false }],
      }),
    );
    assert.match(text(html), /Also email it Nobody to email yet Send a test to me Post$/);
    assert.doesNotMatch(html, /checked=""/);
  });

  test("the button's words follow the switch: Post with it off, and with nobody to email", async () => {
    const words = await loadTs(join("lib", "courses", "updates", "words.ts"));
    assert.equal(words.postButtonWords(true, 31), "Post and email 31 people");
    assert.equal(words.postButtonWords(true, 1), "Post and email 1 person");
    assert.equal(words.postButtonWords(false, 31), "Post");
    assert.equal(words.postButtonWords(true, 0), "Post");
    assert.equal(words.emailSwitchWords(31), "Emails 31 people");
    assert.equal(words.emailSwitchWords(1), "Emails 1 person");
    assert.equal(words.emailSwitchWords(0), "Nobody to email yet");
    assert.equal(words.counterWords(141, 4000), "141 / 4,000");
  });

  test("the run home draws the section, after the marks and before the facilitator's cards", () => {
    const source = readFileSync(join(SRC, "features", "courses", "RunHome.tsx"), "utf8");
    assert.equal((source.match(/<RunUpdates runId=\{runId\} \/>/g) ?? []).length, 1);
    // The marks are "Your marks" since the restyle (board wk-programme), and
    // still drawn first: the board's column reads marks, then updates.
    assert.ok(source.indexOf("<YourMarks") > 0);
    assert.ok(source.indexOf("<YourMarks") < source.indexOf("<RunUpdates"));
    assert.ok(source.indexOf("<RunUpdates") < source.indexOf("facilitatedGroups.map("));
  });
});
