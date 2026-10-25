/**
 * The Groups tab of a programme, its Times view: the times picture, as every
 * kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/times
 *   src/lib/applications/handover/timesLoad.ts, src/features/applications/times/
 *
 * ## What this guards
 *
 *  - AN ADMIN'S AND THE PROGRAMME'S LEAD'S, DECIDED BEFORE ANYBODY IS READ.
 *    The page counts the people holding a place by when they are free and
 *    names the ones no group suits. Since the course hub's lead access (Q1)
 *    the programme's lead is drawn it as an admin is, without what only an
 *    admin can do from it (naming the run, the run editor). A reviewer is
 *    told the tab is the lead's and an admin's, and only the form's settings
 *    were read to tell them. The tree's own gate sends a run's track lead, a
 *    member, a member placed on the run and somebody signed out to the
 *    dashboard. The tab itself is a link for an admin and the lead and is
 *    drawn greyed for a reviewer.
 *  - WHO IS COUNTED IS WHO HOLDS A PLACE, by `holdingOf()`: somebody who gave
 *    their place back is not counted, an invitation is counted once it is
 *    accepted and not before, and somebody who painted nothing is counted
 *    among the people holding a place and in no cell.
 *  - IT WRITES NOTHING, and nothing of anybody's week is kept anywhere.
 *  - THE BOARD AND THE PICTURE AGREE about who can make each group: they
 *    read the painted week through one function.
 *  - EVERY STATE GETS A SENTENCE: no run named, a run that has gone,
 *    decisions not sent, a run with no groups.
 *
 * Real: the page (a server component), the tree's gate, the loader and every
 * library under it, the words, and #67's routes for the hand-over, the
 * board and a person's reply. Faked: the session, the Admin SDK handle,
 * `next/link` and `next/navigation`, and the stylesheets.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  COURSE,
  GROUP,
  ROUND,
  RUN,
  loadJoin,
  makeWorld,
  namedSeed,
  seedWorld,
} from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const made = makeWorld("__hubTimes");
const { world, reset } = made;
const { press, board, reply, place } = await loadJoin(made);

// ---------------------------------------------------------------------------
// The page, the layout over it, and the loader
// ---------------------------------------------------------------------------

const ui = { h: createElement, segment: "groups" };
globalThis.__hubTimesUi = ui;
/** A stylesheet as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SESSION = "export async function getCurrentUser() { return globalThis.__hubTimes.user; }";
const { loadTs: loadPage } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__hubTimes.db; }"],
    // The session, under both names it is imported by: the page gate's own
    // `./session`, and the alias. The gate itself is the real one.
    ["@/lib/firebase/session", SESSION],
    ["./session", SESSION],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function useSelectedLayoutSegment() { return globalThis.__hubTimesUi.segment; }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, ...rest }) =>\n" +
        "  globalThis.__hubTimesUi.h('a', { href, className, 'aria-current': rest['aria-current'] }, children);",
    ],
    ["@/components/ui/InitialsChip", "export default ({ name }) => globalThis.__hubTimesUi.h('span', null, name);"],
    [
      "@/features/applications/editor/controls",
      "export function Chip({ children }) { return globalThis.__hubTimesUi.h('span', null, children); }",
    ],
    ["./TimesPicture.module.css", CLASS_NAMES],
    ["./GroupsViews.module.css", CLASS_NAMES],
    ["./editor.module.css", CLASS_NAMES],
    ["@/features/applications/editor/editor.module.css", CLASS_NAMES],
    ["./ProgrammeFrame.module.css", CLASS_NAMES],
    ["@/features/applications/editor/ProgrammeFrame.module.css", CLASS_NAMES],
  ]),
});
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: TimesPage } = await loadPage(join(TABS, "groups", "times", "page.tsx"));
const { default: ProgrammeLayout } = await loadPage(join(TABS, "layout.tsx"));
const { loadTimesPicture } = await loadPage(join("lib", "applications", "handover", "timesLoad.ts"));

const PERMISSIONS = CAST.zach.permissions;

/**
 * The session a request arrives with, as `getCurrentUser()` builds it from
 * the stored account: the role, the committee flag, the permissions and the
 * reviewer flag the form's roles writer keeps.
 */
function sessionFor(uid, permissions = {}) {
  const base = made.sessionOf(uid);
  if (!base) return null;
  const account = world.db.read(`users/${uid}`);
  return {
    ...base,
    permissions: { ...PERMISSIONS, ...permissions },
    admissionsReviewer: account?.admissionsReviewer === true,
  };
}

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The page as `who` sees it: its HTML and text, every collection the request
 * asked the database for, where the gate sent them if it did, and whether
 * anything was written.
 */
async function draw(who, { programmeId = AGI, length, session, withLayout = false } = {}) {
  world.user = session === undefined ? sessionFor(who) : session;
  const reads = [];
  const collection = world.db.collection;
  world.db.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  const before = made.everything();
  const params = Promise.resolve({ roundId: ROUND, programmeId });
  try {
    let element = await TimesPage({
      params,
      searchParams: Promise.resolve(length === undefined ? {} : { length }),
    });
    if (withLayout) element = await ProgrammeLayout({ params, children: element });
    const html = renderToStaticMarkup(element);
    return { html, text: text(html), reads, to: null, wrote: made.everything() !== before };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { html: "", text: "", reads, to: err.to, wrote: made.everything() !== before };
  } finally {
    world.db.collection = collection;
  }
}

/** The leads and reviewers on the form, flagged as the roles writer flags them. */
function flagReviewers() {
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
}

beforeEach(() => {
  reset(namedSeed());
  flagReviewers();
});

const APPLICATIONS = "admissionApplications";
const DECISIONS = "admissionDecisions";
const PAGE_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

/** Every name the cast has that is not one of AGI Strategy's holders. */
const NOT_HOLDING = ["nina", "ines", "omar", "wen", "nobody"];

// ---------------------------------------------------------------------------
// Who is answered what
// ---------------------------------------------------------------------------

describe("the Groups tab is the lead's and an admin's, decided before anybody is read", () => {
  test("an admin is drawn the picture, and nothing is written", async () => {
    const drawn = await draw("zach");
    assert.equal(drawn.to, null);
    assert.match(drawn.text, /Who can make a 90-minute session starting at…/);
    assert.ok(drawn.reads.includes(APPLICATIONS));
    assert.equal(drawn.wrote, false);
  });

  test("the programme's lead is drawn the picture, as an admin is, and nothing is written", async () => {
    const drawn = await draw("claudia");
    assert.equal(drawn.to, null);
    assert.match(drawn.text, /Who can make a 90-minute session starting at…/);
    assert.match(drawn.text, /Monday 6pm: 2 of 3 free\. Monday evening meets then\./);
    assert.equal(drawn.wrote, false);
  });

  test("the programme's reviewer is told it is the lead's and an admin's, and only the form's settings were read", async () => {
    const drawn = await draw("lloyd");
    assert.equal(drawn.to, null);
    assert.match(drawn.text, /Only the programme’s lead and admins can open Groups/);
    assert.match(drawn.html, new RegExp(`href="${PAGE_PATH}/applications"`));
    assert.deepEqual(drawn.reads, ["admissionRounds"], "the reviewer's page read more than the form");
    for (const uid of ["amara", "dev", "tariq", "bea"]) {
      assert.ok(!drawn.text.includes(CAST[uid].displayName), `the reviewer was shown ${uid}`);
    }
  });

  test("a group's facilitator who leads another programme, and a run's track lead who authors rounds, have no role here and are told there is no programme here", async () => {
    world.db.poke(`courseGroups/${GROUP.thursday}`, { facilitatorUids: ["tess"] });
    const facilitator = await draw("tess");
    assert.match(facilitator.text, /There is no programme here/);
    assert.deepEqual(facilitator.reads, ["admissionRounds"]);

    const author = await draw("yusuf", { session: sessionFor("yusuf", { approveCourse: true }) });
    assert.match(author.text, /There is no programme here/);
    assert.deepEqual(author.reads, ["admissionRounds"]);
  });

  test("a run's track lead, a member holding a place, a member placed on the run, a member with none, and somebody signed out go to the dashboard", async () => {
    await press();
    assert.equal((await place("zach", [{ uid: "amara", groupId: GROUP.monday }])).status, 200);
    for (const [label, who] of [
      ["the AGI run's track lead", "yusuf"],
      ["a member placed on the run", "amara"],
      ["a member holding a place", "dev"],
      ["a member with no place", "nobody"],
      ["somebody signed out", null],
    ]) {
      const drawn = await draw(who, who === null ? { session: null } : {});
      assert.equal(drawn.to, "/dashboard", label);
      assert.deepEqual(drawn.reads, [], `${label}'s request read something`);
    }
  });

  test("the loader answers an admin and the lead, and anybody else from the form's settings alone", async () => {
    assert.equal((await loadTimesPicture(world.db, sessionFor("claudia"), ROUND, AGI, undefined)).view.viewer, "lead");
    assert.equal((await loadTimesPicture(world.db, sessionFor("zach"), ROUND, AGI, undefined)).view.viewer, "admin");
    const reads = [];
    const collection = world.db.collection;
    world.db.collection = (path) => {
      reads.push(path);
      return collection(path);
    };
    try {
      const answers = {};
      for (const who of ["lloyd", "yusuf", "amara", "nobody"]) {
        answers[who] = (await loadTimesPicture(world.db, sessionFor(who), ROUND, AGI, undefined)).status;
      }
      assert.deepEqual(answers, { lloyd: "not-yours", yusuf: "none", amara: "none", nobody: "none" });
      assert.deepEqual([...new Set(reads)], ["admissionRounds"]);
    } finally {
      world.db.collection = collection;
    }
  });

  test("a lead is not offered what only an admin can do: the run editor, and naming the run", async () => {
    const lead = await draw("claudia");
    assert.ok(!lead.html.includes(`/admin/courses/`), "the lead was offered the run editor");
    assert.ok(!lead.text.includes("run editor"));
    reset(seedWorld());
    flagReviewers();
    const blank = await draw("claudia");
    assert.match(blank.text, /AGI Strategy doesn’t name a course run yet\. An admin names it on the Settings tab, under Course run/);
    assert.ok(!blank.html.includes(`href="${PAGE_PATH}/setup"`), "the lead was sent to name a run");
  });

  test("a programme that is not on the form is not there, for an admin as for anybody", async () => {
    for (const programmeId of ["nothing-here", "__proto__", "constructor"]) {
      const drawn = await draw("zach", { programmeId });
      assert.match(drawn.text, /There is no programme here/, programmeId);
    }
  });
});

describe("the tab is a link for an admin and the lead, and greyed for a reviewer", () => {
  test("an admin's Groups tab links to the page, and is the current tab on it", async () => {
    const drawn = await draw("zach", { withLayout: true });
    assert.match(drawn.html, new RegExp(`<a href="${PAGE_PATH}/groups" class="tab tabCurrent" aria-current="page">Groups`));
    assert.match(drawn.text, /Who can make a 90-minute session/);
  });

  test("the lead's Groups tab links to the page too, and so does Attendance", async () => {
    const drawn = await draw("claudia", { withLayout: true });
    assert.match(drawn.html, new RegExp(`<a href="${PAGE_PATH}/groups" class="tab tabCurrent" aria-current="page">Groups`));
    assert.match(drawn.html, new RegExp(`<a href="${PAGE_PATH}/attendance" class="tab ?">Attendance</a>`));
  });

  test("a reviewer's Groups and Attendance tabs are drawn and are not links", async () => {
    const drawn = await draw("lloyd", { withLayout: true });
    assert.ok(!drawn.html.includes(`${PAGE_PATH}/groups"`), "the reviewer was handed a link to the tab");
    assert.ok(!drawn.html.includes(`${PAGE_PATH}/attendance"`), "the reviewer was handed a link to Attendance");
    assert.match(drawn.html, /<span class="tab tabPending" aria-disabled="true" title="Not built yet">Groups/);
    assert.match(drawn.html, /<span class="tab tabPending" aria-disabled="true" title="Not built yet">Attendance/);
  });

  test("somebody with no role on the programme is told there is no programme here, in place of the page", async () => {
    const drawn = await draw("tess", { withLayout: true });
    assert.match(drawn.text, /There is no programme here/);
    assert.ok(!drawn.text.includes("can open Groups"));
  });
});

// ---------------------------------------------------------------------------
// What is counted
// ---------------------------------------------------------------------------

describe("who is counted is who holds a place", () => {
  test("the people holding a place, and the ones who said when they are free", async () => {
    const { text: said } = await draw("zach");
    assert.match(said, /3 of the 4 people holding a place have said when they’re free\. Sessions last 90 minutes\./);
    // Amara and Dev can make the whole of Monday 18:00 to 19:30. Tariq has
    // half of it. Nina, who gave her place back and painted the same Monday
    // as Amara, is not counted.
    assert.match(said, /Monday 6pm: 2 of 3 free\. Monday evening meets then\./);
    assert.match(said, /Thursday 10am: 1 of 3 free\. Thursday morning meets then\./);
    assert.match(said, /Monday 9am: 0 of 3 free/);
  });

  test("nobody who does not hold a place is named or counted", async () => {
    const { text: said } = await draw("zach");
    for (const uid of NOT_HOLDING) {
      assert.ok(!said.includes(CAST[uid].displayName), `${uid} is on the page`);
    }
  });

  test("somebody who gives their place back stops being counted", async () => {
    const gave = await reply("tariq", { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    assert.equal(gave.status, 200);
    const { text: said } = await draw("zach");
    assert.match(said, /2 of the 3 people holding a place have said when they’re free\./);
    assert.ok(!said.includes("Tariq"));
  });

  test("an invitation is counted once it is accepted, and not before", async () => {
    const before = await draw("zach");
    assert.ok(!before.text.includes("Ines"));
    assert.match(before.text, /Monday 6pm: 2 of 3 free/);
    const accepted = await reply("ines", { reply: "accept-invitation" });
    assert.equal(accepted.status, 200);
    const after = await draw("zach");
    assert.match(after.text, /4 of the 5 people holding a place have said when they’re free\./);
    assert.match(after.text, /Monday 6pm: 3 of 4 free\. Monday evening meets then\./);
  });

  test("the start times run from the grid's opening to the last that fits the length", async () => {
    const { html } = await draw("zach");
    const rows = [...html.matchAll(/<th scope="row" class="time">([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(rows, ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm"]);
    const days = [...html.matchAll(/<th scope="col" class="day">([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(days, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
});

describe("what the cards say", () => {
  test("the best times, each with the group that meets then", async () => {
    const { text: said } = await draw("zach");
    assert.match(said, /Best times Mon 6pm · 2 free Monday evening Mon 5pm · 1 free Mon 7pm · 1 free Thu 9am · 1 free Thu 10am · 1 free Thursday morning Thu 11am · 1 free/);
  });

  test("each group with its day, its time and how many can make it, and a group with no time in words", async () => {
    const { text: said } = await draw("zach");
    assert.match(
      said,
      /Your 3 groups Monday evening Mon 6pm · 2 can make it Thursday morning Thu 10am · 1 can make it To be arranged No session time set/,
    );
  });

  test("who fits none of the groups, by name and with no pronoun, with a link to see them", async () => {
    const { text: said, html } = await draw("zach");
    assert.match(
      said,
      /2 of 3 can make at least one of these times\. Tariq Mensah can’t: not free for a 90-minute session at any of these start times\. See Tariq Mensah/,
    );
    assert.match(html, new RegExp(`href="${PAGE_PATH}/applications/tariq"`));
    // Bea painted nothing: she is not one of those who cannot make a time.
    assert.ok(!said.includes("Bea Lindqvist"));
  });

  test("the views are the tab's three, and the card names the run editor for an admin; nothing else is offered", async () => {
    const { html, text: said } = await draw("zach");
    const editor = new RegExp(`<a href="/admin/courses/${COURSE.agi}/runs/${RUN.agi}" class="see editorLink">(.*?)</a>`).exec(html);
    assert.ok(editor, "no link to the run editor");
    assert.equal(text(editor[1]), "Add or change groups in the run editor");
    for (const absent of ["Use for a group", "Change Group", "Add a group", "set in Settings"]) {
      assert.ok(!said.includes(absent), `the page offers ${absent}`);
    }
    assert.ok(!/<button/.test(html), "the page has a button");
    // The views are the three that exist, each a page of the tab: the run's
    // allocation board (People in groups), this one, and Facilitators.
    const views = /<nav class="views" aria-label="Groups views">(.*?)<\/nav>/.exec(html);
    assert.ok(views, "no views");
    assert.deepEqual(
      [...views[1].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[2], m[1]]),
      [
        ["People in groups", `${PAGE_PATH}/groups`],
        ["Times", `${PAGE_PATH}/groups/times`],
        ["Facilitators", `${PAGE_PATH}/groups/facilitators`],
      ],
    );
    assert.match(views[1], new RegExp(`<a href="${PAGE_PATH}/groups/times" class="view viewCurrent" aria-current="page">Times</a>`));
  });
});

describe("the length counted", () => {
  test("picked on the page from the lengths the group editor offers", async () => {
    const { html, text: said } = await draw("zach", { length: "60" });
    assert.match(said, /Sessions last 90 minutes\. This counts 1-hour sessions\./);
    assert.match(said, /Who can make a 1-hour session starting at…/);
    // Counting hour-long sessions, Tariq is free on Mondays: still no group.
    assert.match(said, /Tariq Mensah can’t: free on Mondays only\./);
    for (const minutes of [60, 90, 120]) {
      assert.match(html, new RegExp(`href="${PAGE_PATH}/groups/times\\?length=${minutes}"`));
    }
    assert.match(html, /<a href="[^"]+\?length=60" class="segment segmentCurrent" aria-current="true">1 hour<\/a>/);
  });

  test("a length nobody offers counts the default", async () => {
    for (const length of ["45", "abc", "100000"]) {
      assert.match((await draw("zach", { length })).text, /Who can make a 90-minute session/, length);
    }
  });

  test("groups of different lengths are said, and the length most of them have is counted", async () => {
    world.db.poke(`courseGroups/${GROUP.monday}`, { "session.durationMinutes": 120 });
    const { text: said } = await draw("zach");
    assert.match(
      said,
      /Your groups’ sessions last 90 minutes or 2 hours\. This counts 2-hour sessions, the length most of them have\./,
    );
    assert.match(said, /Monday evening Mon 6pm · 2 hours · 1 can make it/);
    assert.match(said, /Thursday morning Thu 10am · 90 minutes · 1 can make it/);
  });
});

describe("every state has a sentence", () => {
  test("a programme that names no run is sent to its Settings tab, and nobody's application is read", async () => {
    reset(seedWorld());
    flagReviewers();
    const drawn = await draw("zach");
    assert.match(drawn.text, /AGI Strategy doesn’t name a course run yet\. Name it on the Settings tab, under Course run/);
    assert.match(drawn.html, new RegExp(`href="${PAGE_PATH}/setup"`));
    assert.ok(!drawn.reads.includes(APPLICATIONS));
    assert.ok(!drawn.reads.includes("courseGroups"));
  });

  test("a run that has gone is said, and the Settings tab offered", async () => {
    const seed = namedSeed();
    delete seed[`courseRuns/${RUN.agi}`];
    reset(seed);
    flagReviewers();
    const drawn = await draw("zach");
    assert.match(drawn.text, /The course run AGI Strategy names is no longer on the site\./);
    assert.ok(!drawn.reads.includes(APPLICATIONS));
  });

  test("before decisions are sent, nobody holds a place and nobody is read", async () => {
    reset(namedSeed({ sent: false }));
    flagReviewers();
    const drawn = await draw("zach");
    assert.match(drawn.text, /Nobody holds a place until decisions have gone out\./);
    assert.ok(!drawn.reads.includes(APPLICATIONS));
    assert.ok(!drawn.reads.includes(DECISIONS));
    assert.ok(!drawn.text.includes("Amara"));
  });

  test("a run with no groups is drawn with a new group's length, and says where groups are made", async () => {
    const seed = namedSeed();
    for (const id of Object.values(GROUP)) delete seed[`courseGroups/${id}`];
    reset(seed);
    flagReviewers();
    const { text: said } = await draw("zach");
    assert.match(said, /No group has a session time yet\. This counts 90-minute sessions, the length a new group starts with\./);
    assert.match(said, /Your groups This run has no groups yet\. Add groups in the run editor/);
    assert.match(said, /Monday 6pm: 2 of 3 free/);
  });

  test("an archived group is left out, as the board leaves it out", async () => {
    world.db.poke(`courseGroups/${GROUP.thursday}`, { archived: true });
    const { text: said } = await draw("zach");
    assert.match(said, /Your 2 groups/);
    assert.ok(!said.includes("Thursday morning"));
  });

  test("nobody who said when they are free gets the sentence and no grid", async () => {
    for (const uid of ["amara", "dev", "tariq"]) {
      world.db.poke(`admissionApplications/${ROUND}__${uid}`, { "sent.availability.days": ["", "", "", "", "", "", ""] });
    }
    const drawn = await draw("zach");
    assert.match(drawn.text, /None of the 4 people holding a place have said when they’re free\./);
    assert.ok(!drawn.html.includes("<table"));
  });
});

describe("the board and the picture agree about who can make each group", () => {
  test("for every group, the people the board marks as able to make it are the picture's count", async () => {
    await press();
    const read = await board("zach");
    assert.equal(read.status, 200);
    const outcome = await loadTimesPicture(world.db, sessionFor("zach"), ROUND, AGI, undefined);
    assert.equal(outcome.status, "ok");
    for (const group of outcome.view.picture.groups) {
      const marked = read.body.people.filter(
        (row) =>
          row.fromForm?.holdsPlace === true &&
          row.fromForm.availability === "given" &&
          row.fromForm.canMakeGroupIds.includes(group.id),
      ).length;
      assert.equal(group.canMake ?? 0, marked, group.name);
    }
  });
});
