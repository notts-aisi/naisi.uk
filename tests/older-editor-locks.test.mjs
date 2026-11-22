/**
 * THE OLDER COURSE EDITOR'S LOCKS, while it is retired (run via `npm test`).
 *
 *   PATCH /api/courses/runs/[runId]/weeks/[weekId]/published   { published: false }
 *   POST  /api/courses/runs/[runId]/clone-weeks                { fromRunId, overwrite }
 *
 * ## What this guards
 *
 *  1. UNPUBLISHING A WEEK. The route is the only way a published week is
 *     taken back (firestore.rules refuses the browser write, held by
 *     scripts/rules-tests/tests/course-older-editor-locks.test.mjs). Who: an
 *     admin, a course approver, the course drafter who wrote the run, its
 *     track leads and the lead of the programme that names it; a member, a
 *     facilitator, a reviewer and a drafter who did not write the run get
 *     the same 403 and nothing is written. What it refuses, with the owner's
 *     sentence and no count of people: a week anybody has ticked or written
 *     in, a week a live group's session for has passed (an archived group's
 *     does not count), and week 1 while it is open early to everybody holding
 *     a place. A refusal writes nothing.
 *  2. COPYING WEEKS IN FROM ANOTHER RUN WITH REPLACE. Refused once anybody
 *     has started the run, in its transaction, with the board's sentence,
 *     and nothing is written; copying into weeks the run does not have is
 *     never refused for it; a replace on a run nobody has started goes on.
 *  3. THE QUESTION BEFORE A STATUS MOVE. A paragraph for every move the
 *     run editor's select offers, each ending "It can’t be moved back.",
 *     the Completed one in the owner's words, and the buttons naming the
 *     status kept and the status moved to.
 *  4. THE OLDER GROUP CARD on a run a programme names sends no room, link or
 *     campus, and has no Archived switch; New group is the sentence and Open
 *     Times.
 *
 * Real: the routes, the libraries under them, the store's transactions.
 * Faked: the session, the Admin SDK handle, the view-as guard and the clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAST, GROUP, RUN, makeGroupWorld } from "./lib/groupPublishedWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Sat 24 Oct 2026, 1pm in London: before the AGI run's first session (Mon 26 Oct, 6pm). */
const BEFORE_THE_START = new Date("2026-10-24T12:00:00Z");
/** Mon 2 Nov 2026, 8pm: the Monday group's week 2 session (6pm to 7:30pm) has ended. */
const AFTER_MONDAY_WEEK_TWO = new Date("2026-11-02T20:00:00Z");

mock.timers.enable({ apis: ["Date"], now: BEFORE_THE_START });

const made = await makeGroupWorld("__olderEditorLocks");
const { world, loadTs, reset, call } = made;
const unpublish = await loadTs(join("app", "api", "courses", "runs", "[runId]", "weeks", "[weekId]", "published", "route.ts"));
const clone = await loadTs(join("app", "api", "courses", "runs", "[runId]", "clone-weeks", "route.ts"));
const words = await loadTs(join("lib", "courses", "olderEditor", "words.ts"));
const { ALLOWED_TRANSITIONS } = await loadTs(join("lib", "courses", "runStatus.ts"));

const PERMISSIONS = CAST.zach.permissions;
// A course approver and a course drafter, who reach the older editor on a permission alone.
CAST.approver = { ...CAST.nobody, uid: "approver", displayName: "Ada Approver", permissions: { ...PERMISSIONS, approveCourse: true } };
CAST.drafter = { ...CAST.nobody, uid: "drafter", displayName: "Dan Drafter", permissions: { ...PERMISSIONS, draftCourse: true } };

const weekPath = (weekId, runId = RUN.agi) => `courseRuns/${runId}/weeks/${weekId}`;
const WEEK_TWO = {
  weekNumber: 2,
  title: "Week 2",
  summary: "",
  materials: [],
  exercises: [],
  checklist: [],
  questions: [],
  published: true,
};
const snapshot = () => JSON.stringify(world.db.paths().sort().map((path) => [path, world.db.read(path)]));
const press = (who, { weekId = "w02", body = { published: false }, viewAs = false } = {}) =>
  call(who, unpublish.PATCH, { runId: RUN.agi, weekId }, { body, viewAs });

function seedStaff() {
  for (const uid of ["approver", "drafter"]) {
    world.db.seed(`users/${uid}`, { uid, email: `${uid}@example.com`, displayName: CAST[uid].displayName, role: "member" });
  }
  world.db.seed(weekPath("w02"), { ...WEEK_TWO });
}

beforeEach(() => {
  mock.timers.setTime(BEFORE_THE_START.getTime());
  reset();
  seedStaff();
});

describe("1. unpublishing a week", () => {
  test("signed out is 401, a view-as session is refused first, and a body that does not unpublish is 400", async () => {
    const before = snapshot();
    assert.equal((await press(null)).status, 401);
    assert.deepEqual([(await press("zach", { viewAs: true })).status], [403]);
    for (const body of [{}, { published: true }, { published: "false" }, null]) {
      const answer = await press("zach", { body });
      assert.equal(answer.status, 400, JSON.stringify(body));
    }
    assert.equal(snapshot(), before);
  });

  test("a member, a facilitator, a reviewer and a drafter who did not write the run get the same 403, and nothing is written", async () => {
    const before = snapshot();
    for (const who of ["amara", "tess", "lloyd", "nobody", "drafter"]) {
      const answer = await press(who);
      assert.equal(answer.status, 403, who);
      assert.match(answer.body.error, /^Only an admin, a course approver, the run’s author, its track leads or the programme’s lead/);
    }
    assert.equal(snapshot(), before);
  });

  test("each of the people who may take a week back does, and only `published` and who did it are written", async () => {
    for (const who of ["zach", "approver", "yusuf", "claudia", "drafter"]) {
      reset();
      seedStaff();
      if (who === "drafter") world.db.poke(`courseRuns/${RUN.agi}`, { authorUid: "drafter" });
      const answer = await press(who);
      assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
      assert.deepEqual(answer.body, { ok: true, week: { weekId: "w02", weekNumber: 2, published: false } });
      const stored = world.db.read(weekPath("w02"));
      assert.equal(stored.published, false, who);
      assert.equal(stored.updatedByUid, who);
      assert.equal(stored.title, "Week 2", "nothing else changes");
    }
  });

  test("a week somebody has written in stays published, in the owner's words, and nothing is written", async () => {
    // groupSeed holds two answers to week 1's exercise.
    world.db.poke(weekPath("w01"), { ready: false });
    const before = snapshot();
    const answer = await press("zach", { weekId: "w01" });
    assert.deepEqual(
      [answer.status, answer.body.error, answer.body.inUse],
      [409, "People have started week 1, so it stays published. Change its blocks instead: each save is kept in its history.", "work"],
    );
    assert.equal(snapshot(), before);
    assert.equal(world.db.read(weekPath("w01")).published, true);
  });

  test("a week somebody has ticked in stays published", async () => {
    world.db.seed(`courseProgress/${RUN.agi}__dev__m1`, {
      runId: RUN.agi,
      uid: "dev",
      weekNumber: 2,
      itemKind: "material",
      itemId: "m1",
      completed: true,
      hasPublicComment: false,
    });
    const answer = await press("claudia");
    assert.deepEqual([answer.status, answer.body.inUse], [409, "work"]);
    assert.equal(answer.body.error, words.weekStaysPublishedWords(2));
    assert.equal(world.db.read(weekPath("w02")).published, true);
  });

  test("a week whose session has passed for a live group stays published; an archived group's session does not count", async () => {
    mock.timers.setTime(AFTER_MONDAY_WEEK_TWO.getTime());
    const met = await press("zach");
    assert.deepEqual([met.status, met.body.inUse, met.body.error], [409, "met", words.weekStaysPublishedWords(2)]);
    assert.equal(world.db.read(weekPath("w02")).published, true);
    // The Monday group archived, the Thursday group's week 2 (Thu 5 Nov) still to come.
    world.db.poke(`courseGroups/${GROUP.monday}`, { archived: true });
    const archived = await press("zach");
    assert.equal(archived.status, 200, JSON.stringify(archived.body));
    assert.equal(world.db.read(weekPath("w02")).published, false);
  });

  test("week 1 stays published while it is open early to everybody holding a place; taken out of Ready, it answers as any week", async () => {
    for (const path of world.db.paths()) if (path.startsWith("courseExerciseResponses/")) world.db.seed(path, { runId: "elsewhere", weekId: "w09", uid: "x" });
    world.db.poke(weekPath("w01"), { ready: true });
    const open = await press("claudia", { weekId: "w01" });
    assert.deepEqual([open.status, open.body.inUse, open.body.error], [409, "week-one-open", words.weekStaysPublishedWords(1)]);
    world.db.poke(weekPath("w01"), { ready: false });
    const closed = await press("claudia", { weekId: "w01" });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
  });

  test("a week already unpublished is left as it is, and an address that is not a week is 404", async () => {
    world.db.poke(weekPath("w02"), { published: false, updatedByUid: "earlier" });
    const again = await press("zach");
    assert.equal(again.status, 200);
    assert.equal(world.db.read(weekPath("w02")).updatedByUid, "earlier", "nothing is written twice");
    assert.equal((await press("zach", { weekId: "w99" })).status, 404);
    assert.equal((await press("zach", { weekId: "w05" })).status, 404, "a week with no page");
  });
});

describe("2. copying weeks in from another run with Replace", () => {
  const copy = (who, overwrite) => call(who, clone.POST, { runId: RUN.agi }, { body: { fromRunId: RUN.agiSpring, overwrite } });
  function seedSource() {
    world.db.seed(weekPath("w01", RUN.agiSpring), { ...WEEK_TWO, weekNumber: 1, title: "Spring week 1" });
    world.db.seed(weekPath("w02", RUN.agiSpring), { ...WEEK_TWO, title: "Spring week 2" });
    world.db.seed(weekPath("w03", RUN.agiSpring), { ...WEEK_TWO, weekNumber: 3, title: "Spring week 3" });
  }

  test("refused once anybody has started the run, in the board's words, and nothing is written", async () => {
    seedSource();
    const before = snapshot();
    const answer = await copy("zach", true);
    assert.deepEqual(
      [answer.status, answer.body.error],
      [409, "People have started this run, so copying in can’t replace its weeks. Copy into empty weeks only."],
    );
    assert.equal(answer.body.error, words.COPY_CANT_REPLACE);
    assert.equal(snapshot(), before);
  });

  test("copying into the weeks the run does not have goes on, whoever has started", async () => {
    seedSource();
    const answer = await copy("zach", false);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual([answer.body.created, answer.body.skipped], [1, 2]);
    assert.equal(world.db.read(weekPath("w03")).title, "Spring week 3");
    assert.equal(world.db.read(weekPath("w01")).title, "Week 1", "the started week is left as it was");
  });

  test("a replace on a run nobody has started goes on, as before", async () => {
    seedSource();
    for (const path of world.db.paths()) if (path.startsWith("courseExerciseResponses/")) world.db.seed(path, { runId: "elsewhere", weekId: "w09", uid: "x" });
    const answer = await copy("zach", true);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(world.db.read(weekPath("w01")).title, "Spring week 1");
    assert.equal(world.db.read(weekPath("w02")).title, "Spring week 2");
  });

  test("a replace that would replace nothing is not refused for people having started", async () => {
    // The source holds only a week the run does not have, so nothing anybody started is touched.
    world.db.seed(weekPath("w03", RUN.agiSpring), { ...WEEK_TWO, weekNumber: 3, title: "Spring week 3" });
    const answer = await copy("zach", true);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(world.db.read(weekPath("w03")).title, "Spring week 3");
    assert.equal(world.db.read(weekPath("w01")).title, "Week 1");
  });
});

describe("3. the question before a status move", () => {
  test("every move the select offers has its paragraph, and each says it can't be moved back", () => {
    for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of tos.filter((each) => each !== "cancelled")) {
        for (const mode of ["admissions", "open"]) {
          const said = words.statusQuestionBody(from, to, mode);
          assert.ok(said, `${from} to ${to} (${mode})`);
          assert.match(said, / It can’t be moved back\.$/);
          assert.doesNotMatch(said, /[\u2013\u2014]/, "no dashes");
        }
      }
    }
    assert.equal(words.statusQuestionBody("running", "draft", "admissions"), null);
  });

  test("the Completed question is the owner's, word for word", () => {
    assert.equal(words.statusQuestionTitle("AGI Strategy", "Autumn 2026", "completed"), "Move AGI Strategy, Autumn 2026 to Completed?");
    assert.equal(
      words.statusQuestionBody("running", "completed", "admissions"),
      "The weekly emails and reminders stop, its groups leave each facilitator’s My programmes, and nobody more can be handed over or moved. It can’t be moved back.",
    );
    assert.equal(words.NOBODY_IS_EMAILED, "Nobody is emailed.");
    assert.equal(words.keepStatusWords("running"), "Keep it Running");
    assert.equal(words.moveStatusWords("completed"), "Move it to Completed");
  });

  test("the run editor's select asks first: a pick opens the question, and only its answer calls the route", () => {
    const editor = readFileSync(join(REPO_ROOT, "src", "features", "courses", "RunEditor.tsx"), "utf8");
    assert.match(editor, /onChange=\{\(next\) => pickStatus\(next as CourseRunStatus\)\}/);
    assert.match(editor, /onClick=\{\(\) => void changeStatus\(askingStatus\)\}/);
    assert.equal([...editor.matchAll(/setRunStatus\(/g)].length, 1, "one call of the status route");
  });
});

describe("4. the older group card and New group on a run a programme names", () => {
  const card = readFileSync(join(REPO_ROOT, "src", "features", "courses", "GroupEditor.tsx"), "utf8");
  const runEditor = readFileSync(join(REPO_ROOT, "src", "features", "courses", "RunEditor.tsx"), "utf8");

  test("the room, the link and the campus are sent only when the card may change them and they changed", () => {
    assert.match(card, /const roomEditable = groupPageHref === null && isAdmin;/);
    assert.match(card, /const roomChanged = roomEditable && nextLocation !== group\.session\.location;/);
    assert.match(card, /const linkChanged = roomEditable && nextMeetingUrl !== group\.session\.meetingUrl;/);
    assert.match(card, /const campusChanged = roomEditable && campus !== group\.campus;/);
    assert.match(card, /\.\.\.\(campusChanged \? \{ campus \} : \{\}\)/);
    assert.doesNotMatch(card, /\n\s+campus,\n\s+\},\n\s+enrolMode/, "the card sends the campus whatever");
  });

  test("the Archived switch is the board's sentence and link where a group page exists", () => {
    assert.equal(words.archiveOnGroupPageWords("Group C"), "Archive and restore are on Group C’s page.");
    assert.equal(words.openGroupPageWords("Group C"), "Open Group C’s page");
    assert.match(card, /\{groupPageHref \? \(\n\s+<p className=\{styles\.readOnlyHint\}>\n\s+\{archiveOnGroupPageWords\(groupName\)\}/);
  });

  test("New group is the board's sentence and Open Times on a run a programme names", () => {
    assert.equal(words.ADD_GROUPS_ON_TIMES, "Add groups on the programme’s Times view, which checks the name and the length.");
    assert.equal(words.OPEN_TIMES, "Open Times");
    assert.match(runEditor, /\{!groupPagesAt && \(\n\s+<Button/);
    assert.match(runEditor, /\{creatingGroup && !groupPagesAt && \(/);
    assert.match(runEditor, /\/groups\/times`\}>\{OPEN_TIMES\}<\/Link>/);
  });

  test("the line at the top says the editor is being retired", () => {
    assert.equal(
      words.RETIRING_LINE,
      "This editor is being retired. Groups, weeks and the run’s settings are on each programme’s own pages now.",
    );
    assert.equal(words.openProgrammeWords("AGI Strategy"), "Open AGI Strategy");
  });
});
