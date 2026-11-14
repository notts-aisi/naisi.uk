/**
 * THE COPY OF A WEEK SOMEBODY MOVED MID-TERM READS AND WRITES IN, and who
 * reads their work, AS A MOVED PERSON and as one with no record of groups by
 * week.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 *  1. THE SERVER SAYS WHICH COPY THE MEMBER'S OWN WEEK PAGE READS, week by
 *     week (`forkedWeekGroups` on the overview, read in the browser through
 *     `weekCopyGroupOf` in `src/lib/courses/weekCopySource.ts`): a week they
 *     spent in another group is that group's copy, the same answer every save
 *     route gives (`ownGroupForWeek`), so every save from the page lands on
 *     the copy the page showed. With no record the overview is what it always
 *     was: the field is absent, and every listed week is their group's.
 *  2. A GROUP'S THIS WEEK'S WORK FOR WEEK N (its rows, its counts, the button's
 *     count and Remind's people) is those whose place names the group now and
 *     whose week n was the group's. So somebody moved in from a later week is
 *     on neither group's card for a week before the move, and Remind never
 *     reaches them about it; the new group's pages list them for that week
 *     with the line saying when they join (`joins`), expect them only from
 *     that week (`expectedIn`), name no word of theirs, and draw no register
 *     line for them. Both doors read the one loader (the programme-side page
 *     and the facilitator's own). With no record: the same rows, counts and
 *     Remind people as everybody in the group.
 *  3. A WEEK SPENT IN ANOTHER GROUP IS THAT GROUP'S COPY WHETHER OR NOT THE
 *     GROUP STILL MEETS (`copyGroupIdFor` in `src/lib/courses/weekCopy.ts`):
 *     archiving the group somebody was moved out of keeps their answers under
 *     the questions they answered, on their own page, in the reading view and
 *     in every save. When that group has no copy of the week, the run's own
 *     week is read, as for any group, never the new group's. Exercise submit
 *     and my-exercises give the same answer as the week page in every case.
 *  4. THE MOVE PAGE SAYS, BEFORE THE PRESS, which week from the move on the
 *     person has already written in on the old group's version where the new
 *     group's version differs (one Copies line a week); a week written in
 *     whose versions are the same, or a differing week with nothing written,
 *     says nothing. Nothing is deleted.
 *  5. WHO FINISHED counts a moved person's written answers week by week
 *     against the copy they read that week; everybody else against their
 *     group's copies, as before.
 *  6. THE WAYS IN offer a move only where the move would not be refused for
 *     what is known when the row is drawn (a programme-side group page's
 *     names and the People tab's menu): never for somebody who facilitates a
 *     group of the run, somebody not told their group, or on a run that is
 *     over, archived or being destroyed. The route refuses an archived run,
 *     and asks the run's state again inside the save's transaction.
 *  8. EVERY READER THAT PICKS A COPY, as somebody moved and with no record:
 *     the person's own saves of every kind (fill-in boxes, picks, ticks,
 *     beside the reflections, written answers and exercises above), the
 *     reading view behind the programme's door, the Coursework tab, the
 *     feedback gate, the prediction card and the page of somebody who left.
 *     WHO READS: the new group's facilitator reads an old week on the old
 *     copy with its feedback, gives feedback on it, and their first-read mark
 *     and Feedback to write follow; the old group's facilitators are refused
 *     the reading view, the feedback route, the boxes route and a first read.
 *  7. THE TREE: every file that reads a group's copy of a week (through the
 *     resolver, the coursework pages' `weeksRead`, a seat's `copyGroupId` or
 *     the week states' `copyGroupOf`) where it handles places, works by
 *     people's ids, or answers for one group's page, says whose copy it
 *     reads: one PERSON's, through the one helper (`copyGroupIdFor`, or what
 *     is made of it), or one GROUP's for the group's own page, with why.
 *  9. THE PAGE OF ONE QUESTION, on both doors, as the new group's
 *     facilitator, the lead and an admin: a row carries its person's answer,
 *     states and controls only when the week document the page reads is the
 *     one that person read that week; otherwise it says which group they did
 *     the week with, holds none of their words and is counted by no filter.
 *     A week the two groups read from one document is an ordinary row.
 * 10. "AFTER ITS DEADLINE" on the reading view is dated on the calendar of
 *     the group whose copy of the week the person read.
 * 11. THE WRITTEN ANSWER COLUMN'S LISTS date a moved person's deadline the
 *     same way, though the column draws no row for a week spent elsewhere.
 * 12. A MOVED PERSON'S OWN CARD takes its slot and link from the week of the
 *     next session they are due at in the group.
 * 13. "WEEK N IS OPEN" judges each person's earlier week on the copy they
 *     read it on (the reminders before a session leave out a covered week
 *     spent in another group: tests/course-week-reminders.test.mjs).
 * 14. THE COURSEWORK TAB keeps a week spent in a group archived since, and
 *     the run's questions for Claude and Pangram gather that group's own
 *     questions only for the people whose own record names it.
 * Section 1 also holds that "Customised by your facilitator" is said only of
 * the copy of the group the reader is in now; section 6 that only an active
 * place is offered a move, and that a group that no longer meets is refused
 * in its own sentence.
 *
 * The world is week 3 of AGI Strategy's run, written as blocks
 * (`tests/lib/facilitatorWeekWorld.mjs`). Group B (Tuesdays at 6pm, Rahul
 * and Sofia) has its own copies of weeks 1 and 3, the second with a prompt
 * only it asks and its first prompt reworded; Group D (Mondays at 6pm, Grace)
 * has its own copy of week 3 only, which drops one of the run's prompts and
 * adds one of its own. Chloe, in Group B, is moved to Group D by the
 * programme's lead, Claudia, on Wed 18 Nov at 9am, after Group B's week 3
 * session: from week 4.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import {
  A,
  AGI,
  B,
  NOW,
  ROUND,
  RUN,
  facilitatorWeekSeed,
  makeFacilitatorWeekWorld,
  reflection,
} from "./lib/facilitatorWeekWorld.mjs";
import { D } from "./lib/hubAttendanceWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorWeekWorld("__staffMoveReaders");
const moveRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "move");
const R = {
  overview: await w.courseRoute("runs", "[runId]", "overview"),
  reflect: await w.courseRoute("runs", "[runId]", "reflections", "[promptId]"),
  answer: await w.courseRoute("runs", "[runId]", "written-answers", "[answerId]"),
  remind: await w.courseRoute("groups", "[groupId]", "remind"),
  register: await w.courseRoute("groups", "[groupId]", "attendance"),
  submit: await w.courseRoute("runs", "[runId]", "exercises", "[exerciseId]", "submit"),
  myExercises: await w.courseRoute("runs", "[runId]", "my-exercises"),
};
const READING_PAGE = (await w.loadTs(join("app", "(app)", "learn", "[runId]", "group", "[groupId]", "coursework", "[uid]", "page.tsx"))).default;
const { find } = await import("./lib/facilitatorPagesWorld.mjs");
const groupPage = await w.loadTs(join("lib", "courses", "groupPage", "load.ts"));
const facilitatorGroup = await w.loadTs(join("lib", "courses", "facilitatorGroup.ts"));
const { isRowForWeek } = await w.loadTs(join("lib", "courses", "groupsByWeek.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { EXCUSED_IN_ADVANCE, ONLINE_SAID, attendanceDocId } = await w.loadTs(join("lib", "firestore", "courseAttendance.ts"));
const { weekCopyGroupOf, readsOwnGroupsVersion } = await w.loadTs(join("lib", "courses", "weekCopySource.ts"));
const { normalizeCourseWeek } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { weekReflectionPrompts } = await w.loadTs(join("lib", "courses", "weekBlocks", "reader.ts"));

const read = (path) => w.world.db.read(path);
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());
const clone = (value) => JSON.parse(JSON.stringify(value));
const r = (text) => ({ text });
const p = (...runs) => ({ type: "p", runs });

/** The run's week 3 with a written answer in a fourth part, as each copy words it. */
function week3(variant) {
  const blocks = clone(weekOneBlocks("k3"));
  blocks.push({
    id: "k3-p4",
    type: "part",
    title: "Your keeper's plan",
    time: "About 30 minutes",
    framing: [],
    blocks: [
      {
        id: "k3-wa",
        type: "writtenAnswer",
        prompt: [p(r(`${variant} wording: who keeps the lamps?`))],
        boxes: [],
        guidance: [],
        words: { min: 1, max: 200 },
        due: "dayBefore",
      },
    ],
  });
  const first = blocks.find((block) => block.id === "k3-p1").blocks[0];
  if (variant === "B") {
    first.prompts[0].text = "B wording: how many lamps?";
    blocks.find((block) => block.id === "k3-p1").blocks.push({ id: "k3-rsB", type: "reflection", prompts: [{ id: "k3-rpB", text: "Only Group B asks: which lamp is yours?" }] });
  }
  if (variant === "D") {
    first.prompts[0].text = "D wording: how many lamps?";
    first.prompts = first.prompts.filter((prompt) => prompt.id !== "k3-rp2");
    first.prompts.push({ id: "k3-rpD", text: "Only Group D asks: which lamp is brightest?" });
  }
  return weekDoc(3, blocks, `Week 3 (${variant})`);
}

function weekDoc(weekNumber, blocks, title = `Week ${weekNumber}`) {
  return { weekNumber, title, summary: "", guideBlocks: [], materials: [], exercises: [], checklist: [], questions: [], estimatedMinutes: null, published: true, blocks };
}

const SENT = new Date("2026-11-16T09:00:00Z");
function answer(uid, text) {
  return {
    runId: RUN.agi, uid, weekId: "w03", weekNumber: 3, exerciseId: "k3-wa", responseType: "text", text,
    words: text.split(/\s+/).length, submittedAt: SENT, firstSentAt: SENT, sentAt: SENT, updatedAt: SENT, reviewStatus: "unreviewed",
  };
}

/** The world: Group B's own weeks 1 and 3, Group D's own week 3, Chloe's answers on Group B's. */
function seed(over = {}) {
  return facilitatorWeekSeed({
    [`courseRuns/${RUN.agi}/weeks/w03`]: week3("Run"),
    [`courseRuns/${RUN.agi}/weeks/w01`]: weekDoc(1, weekOneBlocks("k1")),
    [`courseGroups/${B}/weeks/w03`]: { ...week3("B"), groupId: B, runId: RUN.agi },
    [`courseGroups/${B}/weeks/w01`]: { ...weekDoc(1, weekOneBlocks("k1"), "Group B's own week 1"), groupId: B, runId: RUN.agi },
    [`courseGroups/${D}/weeks/w03`]: { ...week3("D"), groupId: D, runId: RUN.agi },
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`]: answer("chloe", "Keepers should, they know the lamps."),
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-rpB`]: reflection("chloe", "k3-rpB", "The one by the harbour wall."),
    ...over,
  });
}

function fresh(over) {
  at(NOW.toISOString());
  w.reset(seed(over));
  for (const [groupId, count] of [[A, 4], [B, 4], [D, 2]]) w.world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
}

/** Claudia, the programme's lead, moves Chloe to Group D as the page does: the preview's week and count sent back. */
async function moveChloe() {
  at("2026-11-18T09:00:00Z");
  const params = { roundId: ROUND, programmeId: AGI, uid: "chloe" };
  const shown = await w.call("claudia", moveRoute.POST, params, { body: { toGroupId: D, preview: true }, course: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  assert.equal(shown.body.preview.weekNumber, 4);
  const saved = await w.call("claudia", moveRoute.POST, params, {
    body: { toGroupId: D, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails },
    course: true,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(read(`courseEnrolments/${RUN.agi}__chloe`).groupsByWeek, [
    { groupId: B, fromWeek: 1 },
    { groupId: D, fromWeek: 4 },
  ]);
}

/** The overview as `uid`, and the source a member's page hands `useWeek`, built as `WeekView` builds it. */
async function sourceOf(uid) {
  const response = await w.call(uid, R.overview.GET, { runId: RUN.agi }, { course: true });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const data = response.body;
  return {
    data,
    source: {
      groupId: data.enrolment?.groupId ?? data.group?.id ?? null,
      forkedWeekIds: data.forkedWeekIds,
      forkedWeekGroups: data.forkedWeekGroups,
    },
  };
}

/** The document the member's page reads for `weekId`, as `useWeek` addresses it. */
function pageWeek(source, weekId) {
  const groupId = weekCopyGroupOf(weekId, source);
  const path = groupId ? `courseGroups/${groupId}/weeks/${weekId}` : `courseRuns/${RUN.agi}/weeks/${weekId}`;
  const raw = read(path);
  return { groupId, path, week: raw ? normalizeCourseWeek(weekId, raw) : null };
}

const promptsOf = (week) => weekReflectionPrompts(week).map((prompt) => prompt.id);
const putReflection = (uid, promptId, weekId = "w03") =>
  w.call(uid, R.reflect.PUT, { runId: RUN.agi, promptId }, { body: { weekId, text: `${uid} again on ${promptId}` }, course: true });

describe("a moved person's own week page reads the copy the server names", () => {
  test("weeks 1 and 3 from Group B's own copies, week 4 as Group D reads it", async () => {
    fresh();
    await moveChloe();
    const { data, source } = await sourceOf("chloe");
    assert.equal(data.enrolment.groupId, D);
    assert.deepEqual(data.forkedWeekIds, ["w01", "w03"]);
    assert.deepEqual(data.forkedWeekGroups, { w01: B, w03: B });

    // Week 1: Group B's own copy, which exists (before, the page read Group D's, which does not).
    const one = pageWeek(source, "w01");
    assert.equal(one.groupId, B);
    assert.equal(one.week?.title, "Group B's own week 1");

    // Week 3: Group B's copy, with the two prompts only it carries; Group D's own prompt is not on it.
    const three = pageWeek(source, "w03");
    assert.equal(three.groupId, B);
    assert.ok(promptsOf(three.week).includes("k3-rp2"));
    assert.ok(promptsOf(three.week).includes("k3-rpB"));
    assert.ok(!promptsOf(three.week).includes("k3-rpD"));
    assert.equal(three.week.blocks.find((block) => block.id === "k3-p1").blocks[0].prompts[0].text, "B wording: how many lamps?");

    // Week 4: the run's own week, exactly as somebody in Group D with no record reads it.
    const four = pageWeek(source, "w04");
    const freya = await sourceOf("freya");
    assert.equal(freya.data.forkedWeekGroups, undefined);
    assert.equal(four.groupId, null);
    assert.equal(four.path, pageWeek(freya.source, "w04").path);
    assert.equal(pageWeek(freya.source, "w03").groupId, D, "Group D's own people read Group D's week 3");
  });

  test("every save from the week page lands on the copy the page showed", async () => {
    fresh();
    await moveChloe();
    const { source } = await sourceOf("chloe");
    const shown = promptsOf(pageWeek(source, "w03").week);
    for (const promptId of ["k3-rp1", "k3-rp2", "k3-rpB", "k3-rpD"]) {
      const saved = await putReflection("chloe", promptId);
      assert.equal(saved.status, shown.includes(promptId) ? 200 : 404, `${promptId}: ${JSON.stringify(saved.body)}`);
    }
    assert.equal(read(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-rpB`).text, "chloe again on k3-rpB");
    assert.equal(read(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-rpD`), undefined);
    const written = await w.call("chloe", R.answer.PUT, { runId: RUN.agi, answerId: "k3-wa" }, { body: { weekId: "w03", text: "Keepers should, and the town should pay." }, course: true });
    assert.equal(written.status, 200, JSON.stringify(written.body));
  });

  test("a week the new group makes its own after the move is read from the new group's copy", async () => {
    fresh();
    await moveChloe();
    w.world.db.seed(`courseGroups/${D}/weeks/w04`, { ...weekDoc(4, weekOneBlocks("k4"), "Group D's own week 4"), groupId: D, runId: RUN.agi });
    const { data, source } = await sourceOf("chloe");
    assert.deepEqual(data.forkedWeekGroups, { w01: B, w03: B, w04: D });
    assert.equal(pageWeek(source, "w04").week?.title, "Group D's own week 4");
  });

  test("\"Customised by your facilitator\" only on a week read from the copy of the group she is in now", async () => {
    fresh();
    await moveChloe();
    w.world.db.seed(`courseGroups/${D}/weeks/w04`, { ...weekDoc(4, weekOneBlocks("k4"), "Group D's own week 4"), groupId: D, runId: RUN.agi });
    const { source } = await sourceOf("chloe");
    // Weeks 1 and 3 are Group B's own copies: neither her group's now nor her facilitator's, so nothing is said.
    assert.equal(readsOwnGroupsVersion("w01", source), false);
    assert.equal(readsOwnGroupsVersion("w03", source), false);
    assert.equal(readsOwnGroupsVersion("w02", source), false, "the run's own week");
    // Group D's own week 4: hers now, and said as ever.
    assert.equal(readsOwnGroupsVersion("w04", source), true);
    // The page asks it for the chip, and for the same chip on a week written as blocks.
    const page = stripSource(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "features", "courses", "WeekView.tsx"), "utf8"), {
      keepStrings: true,
    });
    assert.match(page, /const ownGroupsVersion = week\.forked && readsOwnGroupsVersion\(weekDocId\(weekNumber\), weekSrc\);/);
    assert.match(page, /forked=\{ownGroupsVersion\}/);
    assert.match(page, /\{ownGroupsVersion && \(\s*<Chip tone="neutral" size="sm" title=\{FORKED_HINT\}>/);
    assert.doesNotMatch(page, /forked=\{week\.forked\}|\{week\.forked && \(/);
  });

  test("with no record: the chip on exactly the weeks read from a group's copy, as before", async () => {
    fresh();
    for (const [uid, weeks] of [
      ["chloe", { w01: true, w02: false, w03: true, w04: false }],
      ["freya", { w01: false, w02: false, w03: true, w04: false }],
    ]) {
      const { source } = await sourceOf(uid);
      for (const [weekId, shown] of Object.entries(weeks)) {
        assert.equal(readsOwnGroupsVersion(weekId, source), shown, `${uid} ${weekId}`);
        // Exactly when the week is read from a group's own copy, which is what the page said before.
        assert.equal(readsOwnGroupsVersion(weekId, source), weekCopyGroupOf(weekId, source) !== null, `${uid} ${weekId}`);
      }
    }
  });

  test("with no record: no new field, and every listed week is their own group's, as before", async () => {
    fresh();
    const { data, source } = await sourceOf("chloe");
    assert.equal("forkedWeekGroups" in data, false);
    assert.equal(data.enrolment.groupId, B);
    assert.deepEqual(data.forkedWeekIds, ["w01", "w03"]);
    // The resolution before this field existed: their group's copy for a listed week, else the run's.
    const before = (weekId) => (source.groupId && source.forkedWeekIds.includes(weekId) ? source.groupId : null);
    for (const weekId of ["w01", "w02", "w03", "w04"]) assert.equal(weekCopyGroupOf(weekId, source), before(weekId), weekId);
    // And the same person's saves, as before: Group B's week 3.
    assert.equal((await putReflection("chloe", "k3-rpB")).status, 200);
    assert.equal((await putReflection("chloe", "k3-rpD")).status, 404);
    // Somebody in Group D with no record: Group D's own week 3.
    const freya = await sourceOf("freya");
    assert.equal("forkedWeekGroups" in freya.data, false);
    assert.equal(weekCopyGroupOf("w03", freya.source), D);
  });
});

// ---------------------------------------------------------------------------
// 2. A group's This week's work, Remind, and the new group's pages before the move
// ---------------------------------------------------------------------------

const runDoc = () => normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
const groupDoc = (id) => normalizeCourseGroup(id, read(`courseGroups/${id}`));
/** A group's page for week 3, as the programme side (the lead) or the facilitator's own page draws it. */
const pageFor = (groupId, viewer, viewerUid, week = 3) =>
  groupPage.loadGroupPage(w.world.db, { run: runDoc(), group: groupDoc(groupId), viewer, viewerUid, now: new Date(), week });
const rowsOf = (page) => page.work.rows.map((row) => row.uid);
const remindPreview = (who, groupId, week = 3) =>
  w.call(who, R.remind.POST, { groupId }, { body: { week, preview: true }, course: true });
/** The register route for one week, as `who`. */
async function registerFor(who, groupId, week) {
  w.world.user = w.sessionFor(who);
  w.world.course = true;
  try {
    const response = await R.register.GET(new Request(`https://naisi.invalid/api?week=${week}`), { params: Promise.resolve({ groupId }) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    w.world.course = false;
  }
}

describe("a group's This week's work for a week before somebody joined it", () => {
  test("the new group's card for week 3 has no row for Chloe, on both doors, and its counts and button follow", async () => {
    fresh();
    await moveChloe();
    for (const [viewer, viewerUid] of [["lead", "claudia"], ["facilitator", "grace"]]) {
      const page = await pageFor(D, viewer, viewerUid);
      assert.deepEqual(rowsOf(page), ["freya", "yasmin"], viewer);
      assert.equal(page.work.remind.count, page.work.rows.filter((row) => row.remindable).length, viewer);
      assert.equal(page.work.remind.count, 2, viewer);
    }
    // From week 4, the week she is in Group D, she is one of its rows (the card for week 4 is drawn once the week is published).
    w.world.db.poke(`courseRuns/${RUN.agi}/weeks/w04`, { published: true, blocks: weekOneBlocks("k4") });
    const four = await pageFor(D, "lead", "claudia", 4);
    assert.ok(rowsOf(four).includes("chloe"));
    // And the old group's card for week 3 no longer has her: she is not in it now.
    assert.deepEqual(rowsOf(await pageFor(B, "lead", "claudia")), ["farah", "kofi"]);
  });

  test("Remind on the new group's week 3 reaches nobody moved in from week 4, and a press for her alone is refused", async () => {
    fresh();
    await moveChloe();
    const page = await pageFor(D, "facilitator", "grace");
    const shown = await remindPreview("grace", D);
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    assert.deepEqual(shown.body.preview.people.map((person) => person.uid), ["freya", "yasmin"]);
    assert.equal(shown.body.preview.count, page.work.remind.count, "the preview counts what the button counts");
    const mailBefore = w.world.mail.length;
    const alone = await w.call("grace", R.remind.POST, { groupId: D }, { body: { week: 3, uid: "chloe", count: 1 }, course: true });
    assert.equal(alone.status, 409);
    assert.equal(alone.body.count, 0);
    assert.equal(w.world.mail.length, mailBefore, "nothing was sent");
    // The old group's Remind on week 3 does not reach her either: she is not in it now.
    const old = await remindPreview("rahul", B);
    assert.ok(!old.body.preview.people.some((person) => person.uid === "chloe"));
  });

  test("the new group's pages before week 4: the joining line, expected from week 4, no word said, no register line", async () => {
    fresh();
    // A word stored against her name on Group D's week 3 register is still not hers to say.
    w.world.db.seed(`courseAttendance/${attendanceDocId(RUN.agi, D, 3, 1)}`, {
      runId: RUN.agi, groupId: D, weekNumber: 3, occurrence: 1, records: { chloe: "excused" },
      [EXCUSED_IN_ADVANCE]: { chloe: true }, [ONLINE_SAID]: { chloe: true },
    });
    await moveChloe();
    const page = await pageFor(D, "lead", "claudia");
    const three = page.weeks.find((week) => week.weekNumber === 3);
    assert.deepEqual(three.people.find((person) => person.uid === "chloe"), {
      uid: "chloe",
      name: "Chloe Nguyen",
      said: "coming",
      joins: { fromWeek: 4, weeksToRead: [1, 2, 3] },
    });
    assert.ok(!three.joiningOnline.includes("Chloe Nguyen"));
    assert.ok(!three.cantMakeIt.includes("Chloe Nguyen"));
    const four = page.weeks.find((week) => week.weekNumber === 4);
    assert.equal(four.people.find((person) => person.uid === "chloe").joins, undefined);
    // The facilitator's own page: expected at Group D's sessions from week 4, and the roster's line.
    const model = await facilitatorGroup.loadFacilitatorGroup(w.world.db, runDoc(), groupDoc(D), { isAdmin: false, actor: w.sessionFor("grace") }, new Date());
    assert.deepEqual(model.expectedIn, { 1: 2, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3 });
    assert.deepEqual(model.people.find((person) => person.uid === "chloe").joins, { fromWeek: 4, weeksToRead: [1, 2, 3] });
    // The register: her row is the register's only from week 4.
    for (const [week, row] of [[3, false], [4, true]]) {
      const register = await registerFor("grace", D, week);
      assert.equal(register.status, 200, JSON.stringify(register.body));
      const member = register.body.members.find((each) => each.uid === "chloe");
      assert.equal(isRowForWeek(member, week), row, `week ${week}`);
    }
  });

  test("with no record: every person in the group is a row, counted and reached as before", async () => {
    fresh();
    at("2026-11-18T09:00:00Z");
    for (const [groupId, who, people] of [[D, "grace", ["freya", "yasmin"]], [B, "rahul", ["chloe", "farah", "kofi"]]]) {
      const page = await pageFor(groupId, "facilitator", who);
      assert.deepEqual(rowsOf(page), people);
      const told = (await pageFor(groupId, "lead", "claudia")).work.rows.map((row) => row.uid);
      assert.deepEqual(told, people);
      const shown = await remindPreview(who, groupId);
      assert.deepEqual(shown.body.preview.people.map((person) => person.uid), people.filter((uid) => page.work.rows.find((row) => row.uid === uid).remindable));
      assert.equal(shown.body.preview.count, page.work.remind.count);
      const model = await facilitatorGroup.loadFacilitatorGroup(w.world.db, runDoc(), groupDoc(groupId), { isAdmin: false, actor: w.sessionFor(who) }, new Date());
      assert.ok(Object.values(model.expectedIn).every((count) => count === model.expected), "expected the same every week");
      assert.ok(model.people.every((person) => person.joins === undefined));
    }
  });
});

// ---------------------------------------------------------------------------
// 3. A week spent in a group that no longer meets is still that group's copy
// ---------------------------------------------------------------------------

/** A week written before blocks, with one exercise. */
function legacyWeek(weekNumber, exerciseId, title) {
  return {
    ...weekDoc(weekNumber, undefined, title),
    blocks: undefined,
    exercises: [{ id: exerciseId, prompt: `${title}: say one thing.`, responseType: "text", required: false, maxLength: 2000, peerVisible: false }],
  };
}

/** Week 2 written before blocks: the run's own asks one exercise, Group D's own copy another. Group B has no copy of week 2. */
const WEEK_TWO = {
  [`courseRuns/${RUN.agi}/weeks/w02`]: legacyWeek(2, "x-run2", "The run's week 2"),
  [`courseGroups/${D}/weeks/w02`]: { ...legacyWeek(2, "x-d2", "Group D's week 2"), groupId: D, runId: RUN.agi },
};

/** A route read with `?week=`, as `who` (the world's own caller sends no query). */
async function getWithWeek(who, handler, params, week) {
  w.world.user = w.sessionFor(who);
  w.world.course = true;
  try {
    const response = await handler(new Request(`https://naisi.invalid/api?week=${week}`), { params: Promise.resolve(params) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    w.world.course = false;
  }
}

const submitExercise = (uid, exerciseId, weekId) =>
  w.call(uid, R.submit.POST, { runId: RUN.agi, exerciseId }, { body: { weekId, text: `${uid} answers ${exerciseId}` }, course: true });

/** Chloe's week 3 in the reading view, through Group D's door, as Grace. */
async function readingOfChloe(week = "3") {
  const drawn = await w.draw(READING_PAGE, "grace", { runId: RUN.agi, groupId: D, uid: "chloe" }, { week });
  return find(drawn.element, "ReadingView")[0]?.props.view ?? null;
}
const promptAnswers = (view) =>
  Object.fromEntries(view.week.parts.flatMap((part) => part.prompts.map((prompt) => [prompt.id, prompt.answer?.text ?? null])));

describe("a week spent in a group that no longer meets is still that group's copy", () => {
  for (const archived of [false, true]) {
    test(`Group B ${archived ? "archived" : "still meeting"}: every reader and every save agree, week by week`, async () => {
      fresh(WEEK_TWO);
      await moveChloe();
      if (archived) w.world.db.poke(`courseGroups/${B}`, { archived: true });

      // The week page: Group B's own weeks 1 and 3; week 2, which Group B has no copy of, the run's own.
      const { data, source } = await sourceOf("chloe");
      assert.deepEqual(data.forkedWeekGroups, { w01: B, w03: B });
      assert.equal(pageWeek(source, "w02").path, `courseRuns/${RUN.agi}/weeks/w02`);
      assert.ok(promptsOf(pageWeek(source, "w03").week).includes("k3-rpB"));

      // Every save of week 3 against Group B's copy.
      assert.equal((await putReflection("chloe", "k3-rpB")).status, 200);
      assert.equal((await putReflection("chloe", "k3-rpD")).status, 404);

      // Exercise submit and my-exercises: the same copy, week by week.
      assert.equal((await submitExercise("chloe", "x-run2", "w02")).status, 200);
      assert.equal((await submitExercise("chloe", "x-d2", "w02")).status, 404, "never the new group's copy of a week spent elsewhere");
      // my-exercises reads back the answer she sent, from the copy the same helper names
      // (`copyGroupIdFor`, pinned in tests/course-schedule-changes.test.mjs).
      const mine = await getWithWeek("chloe", R.myExercises.GET, { runId: RUN.agi }, 2);
      assert.equal(mine.status, 200, JSON.stringify(mine.body));
      assert.ok(mine.body.responses.some((row) => row.exerciseId === "x-run2"));
      assert.ok(!mine.body.responses.some((row) => row.exerciseId === "x-d2"));

      // The reading view, through the new group's door: her answers under Group B's questions.
      const view = await readingOfChloe();
      const answers = promptAnswers(view);
      assert.equal(answers["k3-rpB"], "chloe again on k3-rpB");
      assert.ok("k3-rp2" in answers);
      assert.ok(!("k3-rpD" in answers));
    });
  }
});

// ---------------------------------------------------------------------------
// 4. The move page names a week from the move on already written in, whose versions differ
// ---------------------------------------------------------------------------

/** The page's lines for moving Chloe to Group D on Wed 18 Nov, as the preview answers them. */
async function previewLines() {
  at("2026-11-18T09:00:00Z");
  const shown = await w.call("claudia", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { toGroupId: D, preview: true }, course: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  return shown.body.preview.lines;
}
const copiesLines = (lines) => lines.filter((each) => each.label === "Copies").map((each) => each.text);

const B_OWN_WEEK_FOUR = { [`courseGroups/${B}/weeks/w04`]: { ...weekDoc(4, weekOneBlocks("k4"), "Group B's own week 4"), groupId: B, runId: RUN.agi } };
const CHLOE_WROTE_WEEK_FOUR = { [`courseExerciseResponses/${RUN.agi}__chloe__w04__k4-rp1`]: reflection("chloe", "k4-rp1", "Written ahead, on Group B's week 4.", 4) };
const EARLIER = "Group D’s weeks 1 and 3 differ from Group B’s. Chloe’s weeks 1 and 3 stay on Group B’s version, with Chloe’s answers.";
const AHEAD =
  "Chloe has already written in week 4, on Group B’s version. Group D’s week 4 differs, so what Chloe wrote for a question Group D doesn’t ask won’t show on Chloe’s week 4 after the move.";

describe("the move page names a week from the move on already written in, whose versions differ", () => {
  test("written in week 4 on Group B's own version, which Group D's differs from: one line, before the press, and nothing deleted", async () => {
    fresh({ ...B_OWN_WEEK_FOUR, ...CHLOE_WROTE_WEEK_FOUR });
    assert.deepEqual(copiesLines(await previewLines()), [EARLIER, AHEAD]);
    await moveChloe();
    assert.equal(read(`courseExerciseResponses/${RUN.agi}__chloe__w04__k4-rp1`).text, "Written ahead, on Group B's week 4.");
  });

  test("written in week 4 where both groups read the run's own week 4: no line", async () => {
    fresh(CHLOE_WROTE_WEEK_FOUR);
    assert.deepEqual(copiesLines(await previewLines()), [EARLIER]);
  });

  test("Group B's own week 4 differs and nothing is written in it, or only an emptied box: no line", async () => {
    fresh(B_OWN_WEEK_FOUR);
    assert.deepEqual(copiesLines(await previewLines()), [EARLIER]);
    fresh({
      ...B_OWN_WEEK_FOUR,
      [`courseExerciseResponses/${RUN.agi}__chloe__w04__k4-rp1`]: { ...reflection("chloe", "k4-rp1", "", 4), emptiedAt: new Date("2026-11-17T09:00:00Z") },
    });
    assert.deepEqual(copiesLines(await previewLines()), [EARLIER]);
  });
});

// ---------------------------------------------------------------------------
// 5. Who finished counts each week against the copy it was read on
// ---------------------------------------------------------------------------

const programmeAttendance = await w.loadTs(join("lib", "courses", "programmeAttendance.ts"));
const whoFinished = await w.loadTs(join("lib", "courses", "finishing", "whoFinished.ts"));
const { weekWrittenAnswers } = await w.loadTs(join("lib", "courses", "weekBlocks", "reader.ts"));

/** Group D's own week 3 asks a written answer of its own, in place of the run's. */
const D_OWN_ANSWER = (() => {
  const doc = week3("D");
  doc.blocks.find((block) => block.id === "k3-p4").blocks[0].id = "k3-waD";
  return { [`courseGroups/${D}/weeks/w03`]: { ...doc, groupId: D, runId: RUN.agi } };
})();

/** How many written answers weeks 1 to 3 ask, read from the copies named, published only. */
function answersAsked(copies) {
  return copies.reduce((sum, path) => {
    const raw = read(path);
    const week = raw ? normalizeCourseWeek(path.split("/").pop(), raw) : null;
    return sum + (week && week.published ? weekWrittenAnswers(week).length : 0);
  }, 0);
}

/** Who finished's tally for each person, now. */
async function tallies() {
  const records = await programmeAttendance.readRunRecords(w.world.db, RUN.agi);
  return whoFinished.readExerciseTallies(w.world.db, records);
}
const runWeek = (n) => `courseRuns/${RUN.agi}/weeks/w0${n}`;
const LATER = [4, 5, 6].map(runWeek);
const CHLOE_WEEK_THREE_ANSWER = `courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`;

describe("who finished counts each week against the copy it was read on", () => {
  test("moved: weeks 1 to 3 counted against Group B's copies, so her week 3 answer counts", async () => {
    fresh(D_OWN_ANSWER);
    const before = (await tallies()).get("chloe");
    await moveChloe();
    const moved = (await tallies()).get("chloe");
    // Weeks 1 to 3 from Group B's copies (its own 1 and 3, the run's 2), the rest as Group D reads them.
    assert.equal(moved.of, answersAsked([`courseGroups/${B}/weeks/w01`, runWeek(2), `courseGroups/${B}/weeks/w03`, ...LATER]));
    assert.deepEqual(moved, before, "the same answers, against the same copies, as before the move");
    // Her week 3 answer, on Group B's week 3, is one of them: unsent, one fewer.
    w.world.db.poke(CHLOE_WEEK_THREE_ANSWER, { submittedAt: null });
    assert.equal((await tallies()).get("chloe").done, moved.done - 1);
    // Freya, in Group D with no record: Group D's copies, as always.
    assert.equal((await tallies()).get("freya").of, answersAsked([runWeek(1), runWeek(2), `courseGroups/${D}/weeks/w03`, ...LATER]));
  });

  test("with no record: each person counted against their group's copies, as before", async () => {
    fresh(D_OWN_ANSWER);
    const counted = await tallies();
    assert.equal(counted.get("chloe").of, answersAsked([`courseGroups/${B}/weeks/w01`, runWeek(2), `courseGroups/${B}/weeks/w03`, ...LATER]));
    assert.equal(counted.get("freya").of, answersAsked([runWeek(1), runWeek(2), `courseGroups/${D}/weeks/w03`, ...LATER]));
  });
});

// ---------------------------------------------------------------------------
// 6. The ways in, and the run's state
// ---------------------------------------------------------------------------

const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const PROGRAMME_GROUP_PAGE = (await w.loadTs(join(PROGRAMME, "groups", "[groupId]", "page.tsx"))).default;
const people = await w.loadTs(join("lib", "applications", "people", "load.ts"));
const { C } = await import("./lib/hubAttendanceWorld.mjs");

/** A programme-side group page's ways to move somebody, as Claudia is shown them. */
async function moveLinksOn(groupId) {
  const drawn = await w.draw(PROGRAMME_GROUP_PAGE, "claudia", { roundId: ROUND, programmeId: AGI, groupId }, {});
  const links = find(drawn.element, "GroupPage")[0]?.props.links ?? null;
  return { move: links?.move ?? null, movable: [...(links?.movable ?? [])].sort() };
}
/** Who the People tab's menu offers a move, as Claudia is shown it. */
async function peopleMovable() {
  const out = await people.loadProgrammePeople(w.world.db, w.sessionFor("claudia"), ROUND, AGI);
  assert.equal(out.status, "ok");
  return out.view.rows.filter((row) => row.moveHref).map((row) => row.uid).sort();
}

describe("the ways in, and the run's state", () => {
  test("a group page offers a move on the names the move would not refuse: never a facilitator's, never somebody not told", async () => {
    fresh();
    // Group B: Rahul holds a place in it and facilitates it.
    assert.deepEqual((await moveLinksOn(B)).movable, ["chloe", "farah", "kofi"]);
    // Group C: Una is placed and not told by Publish.
    const c = await moveLinksOn(C);
    assert.ok(c.move);
    assert.ok(!c.movable.includes("una"));
    assert.ok(c.movable.includes("hamza"));
  });

  test("the People tab's menu: never for somebody who facilitates a group of the run, or somebody not told", async () => {
    fresh();
    assert.deepEqual(await peopleMovable(), ["amara", "bea", "dev", "tariq"]);
    w.world.db.poke(`courseGroups/${C}`, { facilitatorUids: [...read(`courseGroups/${C}`).facilitatorUids, "amara"] });
    w.world.db.poke(`courseEnrolments/${RUN.agi}__dev`, { allocatedEmailAt: null });
    assert.deepEqual(await peopleMovable(), ["bea", "tariq"]);
  });

  test("the People tab's menu and the group page: never for a place that is not active (completed), on a run still running", async () => {
    fresh();
    assert.ok((await peopleMovable()).includes("bea"));
    assert.ok((await moveLinksOn(A)).movable.includes("bea"));
    w.world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { status: "completed" });
    assert.deepEqual(await peopleMovable(), ["amara", "dev", "tariq"]);
    assert.ok(!(await moveLinksOn(A)).movable.includes("bea"));
    // The route, reached by typing the address, refuses it as it always has.
    at("2026-11-18T09:00:00Z");
    const shown = await w.call("claudia", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "bea" }, { body: { toGroupId: D, preview: true }, course: true });
    assert.deepEqual([shown.status, shown.body.error], [404, "This person doesn’t hold a place in a group on the run."]);
  });

  test("somebody whose group no longer meets: refused in its own sentence, nothing written or sent", async () => {
    fresh();
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    at("2026-11-18T09:00:00Z");
    const before = JSON.stringify(w.world.db.paths().sort().map((path) => [path, read(path)]));
    const mail = w.world.mail.length;
    const params = { roundId: ROUND, programmeId: AGI, uid: "chloe" };
    const sentence = "Group B no longer meets, so there is nothing to move Chloe from.";
    const shown = await w.call("claudia", moveRoute.POST, params, { body: { toGroupId: D, preview: true }, course: true });
    assert.deepEqual([shown.status, shown.body.error], [409, sentence]);
    const pressed = await w.call("claudia", moveRoute.POST, params, { body: { toGroupId: D, weekNumber: 4, emailCount: 2 }, course: true });
    assert.deepEqual([pressed.status, pressed.body.error], [409, sentence]);
    assert.equal(JSON.stringify(w.world.db.paths().sort().map((path) => [path, read(path)])), before);
    assert.equal(w.world.mail.length, mail);
  });

  for (const [state, patch, sentence] of [
    ["archived", { archived: true }, "The course run is archived, so nobody can be moved on it."],
    ["completed", { status: "completed" }, "The course run is over, so nobody can be moved on it."],
  ]) {
    test(`a run that is ${state}: no way in is offered, and the route refuses it in one sentence`, async () => {
      fresh();
      w.world.db.poke(`courseRuns/${RUN.agi}`, patch);
      assert.deepEqual(await moveLinksOn(B), { move: null, movable: [] });
      assert.deepEqual(await peopleMovable(), []);
      at("2026-11-18T09:00:00Z");
      const shown = await w.call("claudia", moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { body: { toGroupId: D, preview: true }, course: true });
      assert.deepEqual([shown.status, shown.body.error], [409, sentence]);
    });
  }

  test("the run archived between the page and the press: refused inside the save's transaction, nothing written or sent", async () => {
    fresh();
    at("2026-11-18T09:00:00Z");
    const params = { roundId: ROUND, programmeId: AGI, uid: "chloe" };
    const shown = await w.call("claudia", moveRoute.POST, params, { body: { toGroupId: D, preview: true }, course: true });
    assert.equal(shown.status, 200);
    const before = JSON.stringify(w.world.db.paths().filter((path) => !path.startsWith("courseRuns/")).sort().map((path) => [path, read(path)]));
    const mail = w.world.mail.length;
    // The facts are read before the transaction; the run is archived as it begins.
    const db = w.world.db;
    const own = Object.prototype.hasOwnProperty.call(db, "runTransaction");
    const original = db.runTransaction;
    db.runTransaction = async function (fn) {
      db.poke(`courseRuns/${RUN.agi}`, { archived: true });
      return original.call(this, fn);
    };
    try {
      const saved = await w.call("claudia", moveRoute.POST, params, {
        body: { toGroupId: D, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails },
        course: true,
      });
      assert.deepEqual([saved.status, saved.body.error], [409, "The course run is archived, so nobody can be moved on it."]);
    } finally {
      if (own) db.runTransaction = original;
      else delete db.runTransaction;
    }
    assert.equal(JSON.stringify(w.world.db.paths().filter((path) => !path.startsWith("courseRuns/")).sort().map((path) => [path, read(path)])), before);
    assert.equal(w.world.mail.length, mail);
    assert.equal(read(`courseEnrolments/${RUN.agi}__chloe`).groupId, B);
  });
});

// ---------------------------------------------------------------------------
// 7. The tree: whose copy of a week each reader reads
// ---------------------------------------------------------------------------

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");
/**
 * A group's copy of a week read, through any of its doors: the resolver, one
 * week or all; the coursework pages' shared read of a group's weeks
 * (`weeksRead`); a place's own copy as its seat reader answers it
 * (`ownSeatOn(...).copyGroupId`, or an overview entry's); and a person's
 * copy as the run's week states answer it (`copyGroupOf`).
 */
const READS_COPY = /\bresolveWeekDocs?\(|\bresolveWeekRef\(|\bresolveOwnWeekDocs\(|\bweeksRead\(|\.copyGroupId\b|\bcopyGroupOf\(/;
/** A file that handles places, works by people's ids, or answers for one group's page. */
const HANDLES_PLACES = /\b(?:CourseEnrolmentDoc|normalizeCourseEnrolment)\b|\.collection\(\s*["']courseEnrolments["']\s*\)/;
const BY_UID = /\buids?\b/;
const GROUP_PAGE = /\[groupId\]/;
/**
 * The one helper, and what is made of it: the seat reader's `copyGroupId`
 * and the week states' `copyGroupOf` are each made of `copyGroupIdFor`
 * (held below).
 */
const ASKS_PERSON = /\b(?:copyGroupIdFor|resolveOwnWeekDocs|readsGroupIdFor|copiesOf|copyGroupOf)\(|\.copyGroupId\b/;

/**
 * Whose copy of a week each reader reads:
 *  - `person`: one person's week, on the copy of the group their place
 *    belonged to that week (`copyGroupIdFor` in src/lib/courses/weekCopy.ts),
 *    so somebody moved mid-term is read and saves on the copy they worked in;
 *  - `group`: one group's week for that group's own page or send, on the
 *    group's copy, whoever is in it.
 */
const COPY_READERS = {
  "app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route.ts": { kind: "person", why: "an exercise answer is checked against the copy the member was shown that week" },
  "app/api/courses/runs/[runId]/weeks/[weekId]/submit/route.ts": {
    kind: "person",
    why: "the old Submit checks what a week asks against the copy the person works in that week (their seat's copyGroupId, made of copyGroupIdFor)",
  },
  "app/api/courses/runs/[runId]/written-answers/[answerId]/send/route.ts": {
    kind: "person",
    why: "sending a written answer checks it against the copy the person works in that week (their seat's copyGroupId, made of copyGroupIdFor)",
  },
  "lib/courses/coursework/tabLoad.ts": {
    kind: "person",
    why: "the Coursework tab reads each person's weeks each on the copy they worked in (readsGroupIdFor), reading the copies of a group archived since that a moved person's record names",
  },
  "lib/courses/groupWeekWork/earlier.ts": {
    kind: "person",
    why: "the earlier weeks Week N is open names as not done are judged for each person on the copy they read that week (copyGroupOf), never the group's own for a week they spent elsewhere",
  },
  "lib/scheduler/jobs/weekReminders.ts": {
    kind: "group",
    why: "the reminders before a session read the group's copy of each week the session covers, for only the people whose week it was the group's (belongsTo), so the copy read is theirs; a covered week somebody spent elsewhere is not this session's work",
  },
  "app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts": { kind: "person", why: "a fill-in box is saved against the copy of that week the person works in" },
  "app/api/courses/runs/[runId]/overview/route.ts": { kind: "person", why: "the member's own weeks, each on the copy they work in, named to the browser in forkedWeekGroups" },
  "app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts": { kind: "person", why: "a pick is saved against the copy of that week the person works in" },
  "app/api/courses/runs/[runId]/reflections/[promptId]/route.ts": { kind: "person", why: "a reflection is saved against the copy of that week the person works in" },
  "app/api/courses/runs/[runId]/sync-tasks/route.ts": { kind: "person", why: "the week's card in the member's tasks is built from the copy of that week their page opens" },
  "app/api/courses/runs/[runId]/ticks/[itemId]/route.ts": { kind: "person", why: "a tick is saved against the copy of that week the person works in" },
  "app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts": { kind: "person", why: "a written answer is saved against the copy of that week the person works in" },
  "lib/courses/coursework/questionLoad.ts": {
    kind: "person",
    why: "the page of one question reads the group's copy of the week, and asks which copy each person listed read that week: a row carries their answer only when it is the same week document, else it says which group they did the week with",
  },
  "lib/courses/coursework/readingLoad.ts": { kind: "person", why: "the reading view, behind both doors, reads one person's weeks each on the copy they worked in" },
  "lib/courses/feedback/access.ts": { kind: "person", why: "feedback is given on the copy of the week the person worked in, by whoever reads them now" },
  "lib/courses/leftView.ts": { kind: "person", why: "somebody who left is shown the titles of their own weeks, each from the copy they worked in" },
  "lib/courses/predictions/taker.ts": { kind: "person", why: "whether a sealed prediction's week is published is asked of the copy the person works in that week" },
  "app/api/courses/groups/[groupId]/exercises/route.ts": {
    kind: "group",
    why: "the summer exercises' review queue for one group and one week heads every row with the group's copy of the week, one definition for the page; a week written as blocks has no exercises here, its written answers are reviewed on the written answers page",
  },
  "app/(app)/learn/[runId]/group/[groupId]/review/page.tsx": {
    kind: "group",
    why: "the group's review page asks the group's copy of a week only to send a week written as blocks to its written answers page",
  },
  "lib/courses/allocationPublish.ts": { kind: "group", why: "Publish times each group's week 1 for the email that tells people their group, from the group's own copy; no person's week is read" },
  "lib/courses/coursework/reads.ts": {
    kind: "group",
    why: "the coursework pages' shared read of one group's weeks, or the run's own, for the group a caller names; which group's copy each person is read on is the caller's, through the one helper",
  },
  "lib/courses/getReady/read.ts": { kind: "group", why: "getting ready reads the run's own week 1, no group's copy and no person's week, so a move changes nothing it reads" },
  "lib/courses/groupWeekWork/load.ts": {
    kind: "group",
    why: "a group's This week's work and Remind for one week read the group's copy and list only the people whose place belonged to the group that week (belongsTo), so the copy read is theirs",
  },
  "lib/courses/nextWeekEmail.ts": {
    kind: "group",
    why: "Week N is open reads the group's copy of week N and reaches only the people whose group for week N is the group (the notice audience asked for the week), so it is their copy; their earlier weeks are judged one by one in groupWeekWork/earlier.ts",
  },
  "lib/courses/packsAndCases/readers.ts": {
    kind: "group",
    why: "a group's draw and pairs pages read the group's own copy of the week for the group's own handing out; a person's own pick is saved against their copy by the packs-and-cases route",
  },
  "lib/courses/pitching/write.ts": { kind: "group", why: "a pitch's paper is one of pitching week's readings as the group somebody is in now has the week, as the pitching page shows it" },
  "lib/courses/sessionReports/context.ts": {
    kind: "group",
    why: "a session report is about one group's session and reads that group's copy of the session's week, with the register's own rows for that week",
  },
  "lib/courses/teamPage/load.ts": { kind: "group", why: "a team's page names its pitch's paper from pitching week as the team's group has the week; no person's week is read" },
  "lib/courses/weekEdit/askedThen.ts": {
    kind: "group",
    why: "the earlier words of a question are read for the copy the caller names: the page of one question names its group for the rows that read that document, the reading view the person's own copy",
  },
  "lib/courses/coursework/gather.ts": {
    kind: "person",
    why: "the run's questions for Claude and Pangram are read from the run's copy and every live group's, keyed by question, so an answer is gathered under its own question whichever copy asked it; a question only the own copy of a group archived since asks is gathered only for the people whose own record names that group for its week (copyGroupIdFor)",
  },
  "lib/courses/facilitatorWeek/readers.ts": { kind: "group", why: "a group's week as its facilitators and the programme's lead read it, across the group's people, is the group's own copy" },
  "lib/courses/pitching/load.ts": { kind: "group", why: "pitching week is worked in the group somebody is in now, on that group's copy" },
  "lib/courses/programmeOverview.ts": { kind: "group", why: "the Overview's titles and each group's next week are the run's or that group's copy; no person's week is read" },
  "lib/courses/writtenAnswers/reviewPage.ts": {
    kind: "person",
    why: "This week's work's Written answer column takes the week's answer from the group's copy, and dates the deadline of somebody moved here on the copy of the group they read that week (copyGroupIdFor), by that copy's own rule",
  },
};

describe("the tree: whose copy of a week each reader reads", () => {
  const files = [...walkSource(SRC)].filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => [inSrc(file), stripSource(readFileSync(file, "utf8"), { keepStrings: true })]);

  test("every reader of a group's copy of a week that handles places, or answers for a group's page, is listed, and every entry is such a reader", () => {
    const found = files
      .filter(
        ([file, code]) =>
          file !== "lib/courses/groupResolve.ts" && READS_COPY.test(code) && (HANDLES_PLACES.test(code) || BY_UID.test(code) || GROUP_PAGE.test(file)),
      )
      .map(([file]) => file)
      .sort();
    const listed = Object.keys(COPY_READERS).sort();
    assert.deepEqual({ missing: found.filter((file) => !listed.includes(file)), extra: listed.filter((file) => !found.includes(file)) }, { missing: [], extra: [] });
    assert.deepEqual(found, listed);
  });

  test("what a `person` reader may ask instead of the one helper is made of it", () => {
    const code = (file) => files.find(([each]) => each === file)?.[1] ?? "";
    // The week states' answer: copyGroupIdFor on the person's seat.
    assert.match(code("lib/courses/weekWork/readers.ts"), /copyGroupOf: \(uid, weekNumber, fallback\) => \{[\s\S]{0,200}?copyGroupIdFor\(seat, weekNumber, seat\.groupId\)/);
    // The seat reader's: copyGroupIdFor on the learner's place.
    assert.match(code("lib/courses/weekWork/own.ts"), /const copyGroupId = learner\?\.groupId \? copyGroupIdFor\(learner, weekNumber, nowId\) : nowId;/);
  });

  test("a `person` reader asks the one helper; every reason is written down", () => {
    for (const [file, entry] of Object.entries(COPY_READERS)) {
      assert.ok(["person", "group"].includes(entry.kind), `${file}: unknown kind`);
      assert.ok(entry.why.length >= 40, `${file}: say why`);
      const code = files.find(([each]) => each === file)?.[1] ?? "";
      if (entry.kind === "person") assert.match(code, ASKS_PERSON, `${file} reads one person's week and never asks whose copy it is`);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Every reader that picks a copy, and who reads the work
// ---------------------------------------------------------------------------

const R8 = {
  boxes: await w.courseRoute("runs", "[runId]", "fill-in-boxes", "[boxId]"),
  boxesRead: await w.courseRoute("runs", "[runId]", "fill-in-boxes"),
  picks: await w.courseRoute("runs", "[runId]", "packs-and-cases", "[blockId]"),
  ticks: await w.courseRoute("runs", "[runId]", "ticks", "[itemId]"),
  feedback: await w.courseRoute("runs", "[runId]", "feedback"),
  firstRead: await w.courseRoute("runs", "[runId]", "first-read"),
};
const READING_PROGRAMME = (await w.loadTs(join(PROGRAMME, "coursework", "[uid]", "page.tsx"))).default;
const COURSEWORK_TAB = (await w.loadTs(join(PROGRAMME, "(tabs)", "coursework", "page.tsx"))).default;
const feedbackAccess = await w.loadTs(join("lib", "courses", "feedback", "access.ts"));
const taker = await w.loadTs(join("lib", "courses", "predictions", "taker.ts"));
const leftView = await w.loadTs(join("lib", "courses", "leftView.ts"));
const writtenQueue = await w.loadTs(join("lib", "courses", "writtenAnswers", "queue.ts"));
const { normalizeCourseEnrolment } = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));

/** Group B's week 3 with a box, a source and a choice only it asks; Group D's with its own of each. */
const OWN_PIECES = (() => {
  const piece = (k) => ({
    id: `k3-p5${k}`,
    type: "part",
    title: `Only Group ${k}`,
    time: "",
    framing: [],
    blocks: [
      { id: `k3-fi${k}`, type: "fillIn", title: "Plan", groups: [{ heading: "Next", boxes: [{ id: `k3-fb${k}`, label: "" }] }] },
      { id: `k3-s${k}`, type: "source", kind: "read", lead: "", title: `Group ${k}'s reading`, url: "https://example.com/r", by: "", date: "", time: "", compute: "", note: [] },
      {
        id: `k3-co${k}`, type: "chooseOne", form: "list", title: "one guide", givenBy: "fellow", kind: "read", time: "", noteHeading: "", questions: [],
        packs: [1, 2].map((n) => ({ id: n === 1 ? `k3-pk${k}` : `k3-pk${k}${n}`, name: `Guide ${n}`, time: "", note: [], read: [{ text: `Guide ${n}`, href: `https://example.com/guide-${n}` }] })),
      },
    ],
  });
  const of = (k, id) => {
    const doc = week3(k);
    doc.blocks.push(piece(k));
    return { ...doc, groupId: id, runId: RUN.agi };
  };
  return { [`courseGroups/${B}/weeks/w03`]: of("B", B), [`courseGroups/${D}/weeks/w03`]: of("D", D) };
})();

/** Each own save of week 3 as `uid`: whether its piece was found on the copy they work in. */
async function ownSaves(uid) {
  const found = (response, gone) => response.status !== 404 && response.body?.error !== gone;
  const out = {};
  for (const k of ["B", "D"]) {
    const box = await w.call(uid, R8.boxes.PUT, { runId: RUN.agi, boxId: `k3-fb${k}` }, { body: { weekId: "w03", text: `${uid} plans` }, course: true });
    const tick = await w.call(uid, R8.ticks.PUT, { runId: RUN.agi, itemId: `k3-s${k}` }, { body: { weekId: "w03", completed: true }, course: true });
    const pick = await w.call(uid, R8.picks.PUT, { runId: RUN.agi, blockId: `k3-co${k}` }, { body: { weekId: "w03", packId: `k3-pk${k}` }, course: true });
    out[k] = {
      box: found(box, "That box isn’t on this week any more. Reload the page."),
      tick: tick.status !== 404,
      pick: found(pick, "That choice isn’t on this week any more. Reload the page."),
    };
  }
  return out;
}

/** Any object in a drawn view with `uid` and `cells`: one row of the Coursework tab. */
function rowIn(value, uid) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const each of value) {
      const found = rowIn(each, uid);
      if (found) return found;
    }
    return null;
  }
  if (value.uid === uid && Array.isArray(value.cells)) return value;
  for (const each of Object.values(value)) {
    const found = rowIn(each, uid);
    if (found) return found;
  }
  return null;
}
async function tabCell(uid, weekNumber) {
  const drawn = await w.draw(COURSEWORK_TAB, "claudia", { roundId: ROUND, programmeId: AGI }, {});
  const row = rowIn(find(drawn.element, "CourseworkTable")[0]?.props.view, uid);
  return row?.cells.find((cell) => cell.weekNumber === weekNumber) ?? row?.cells[weekNumber - 1] ?? null;
}

/** Everything a reader of one person's copies answers for Chloe, read on the server. */
async function chloeReadOn() {
  const prog = await w.draw(READING_PROGRAMME, "claudia", { roundId: ROUND, programmeId: AGI, uid: "chloe" }, { week: "3" });
  const view = find(prog.element, "ReadingView")[0]?.props.view ?? null;
  const gate = await feedbackAccess.feedbackGate(w.world.db, w.sessionFor("claudia"), RUN.agi, "chloe");
  assert.equal(gate.ok, true);
  const feedbackWeek = await feedbackAccess.feedbackWeekOf(w.world.db, gate, "w03");
  const asTaker = await taker.predictionsTakerOf(w.world.db, w.sessionFor("chloe"), RUN.agi);
  assert.equal(asTaker.ok, true);
  return {
    programmeDoor: view ? Object.keys(promptAnswers(view)) : null,
    feedbackWeek: feedbackWeek?.week.title ?? null,
    predictions: [1, 2, 3, 4].map((n) => asTaker.taker.copyGroupIdOf(n)),
  };
}

describe("every reader that picks a copy, as somebody moved and with no record", () => {
  test("moved: every own save, the programme's reading view, the feedback gate and the prediction card on Group B's copy of week 3", async () => {
    fresh(OWN_PIECES);
    await moveChloe();
    assert.deepEqual(await ownSaves("chloe"), { B: { box: true, tick: true, pick: true }, D: { box: false, tick: false, pick: false } });
    const read = await chloeReadOn();
    assert.ok(read.programmeDoor.includes("k3-rpB") && !read.programmeDoor.includes("k3-rpD"), JSON.stringify(read.programmeDoor));
    assert.equal(read.feedbackWeek, "Week 3 (B)");
    assert.deepEqual(read.predictions, [B, B, B, D]);
  });

  test("with no record: the same readers on Group B's copy, as before; Group D's people on Group D's", async () => {
    fresh(OWN_PIECES);
    at("2026-11-18T09:00:00Z");
    assert.deepEqual(await ownSaves("chloe"), { B: { box: true, tick: true, pick: true }, D: { box: false, tick: false, pick: false } });
    assert.deepEqual(await ownSaves("freya"), { B: { box: false, tick: false, pick: false }, D: { box: true, tick: true, pick: true } });
    const read = await chloeReadOn();
    assert.ok(read.programmeDoor.includes("k3-rpB"));
    assert.equal(read.feedbackWeek, "Week 3 (B)");
    assert.deepEqual(read.predictions, [B, B, B, B]);
  });

  test("the Coursework tab reads her week 3 on the copy she worked in: the same cell moved as before the move", async () => {
    fresh(OWN_PIECES);
    at("2026-11-18T09:00:00Z");
    const before = await tabCell("chloe", 3);
    assert.ok(before);
    await moveChloe();
    assert.deepEqual(await tabCell("chloe", 3), before);
  });

  test("the page of somebody who left names their weeks from the copies they worked in", async () => {
    for (const moved of [true, false]) {
      fresh(OWN_PIECES);
      if (moved) await moveChloe();
      w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "withdrawn", droppedOutAt: new Date("2026-11-18T10:00:00Z") });
      const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
      const enrolment = normalizeCourseEnrolment(`${RUN.agi}__chloe`, read(`courseEnrolments/${RUN.agi}__chloe`));
      const notes = JSON.stringify(await leftView.loadOwnNotes(w.world.db, { run, enrolment }));
      assert.ok(notes.includes("Week 3 (B)"), `moved ${moved}: ${notes.slice(0, 300)}`);
      assert.ok(!notes.includes("Week 3 (D)"));
    }
  });
});

describe("who reads a moved person's old weeks: the group they are in now", () => {
  test("Grace, Group D's facilitator, reads week 3 on Group B's copy with its answers, gives feedback on it, and her first read and queue follow", async () => {
    fresh();
    await moveChloe();
    const view = await readingOfChloe();
    assert.ok(view, "the reading view is drawn for Grace");
    assert.equal(promptAnswers(view)["k3-rpB"], "The one by the harbour wall.");
    const given = await w.call("grace", R8.feedback.POST, { runId: RUN.agi }, { body: { uid: "chloe", weekId: "w03", on: "writtenAnswer", itemId: "k3-wa", text: "Clear and well argued." }, course: true });
    assert.equal(given.status, 200, JSON.stringify(given.body));
    const marked = await w.call("grace", R8.firstRead.POST, { runId: RUN.agi }, { body: { weekId: "w03", people: [{ uid: "chloe", ids: ["k3-rpB", "k3-wa"] }] }, course: true });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const record = read(`courseWeekWork/${RUN.agi}__chloe__w03`);
    assert.ok(record?.firstReadAt?.["k3-rpB"], JSON.stringify(record));
    const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
    const queueOf = async (who, groupId) =>
      ((await writtenQueue.loadWrittenQueue(w.world.db, w.sessionFor(who), run, normalizeCourseGroup(groupId, read(`courseGroups/${groupId}`)), new Date())) ?? []).map((row) => [row.uid, row.weekNumber]);
    // Feedback is given: week 3 has left Grace's Feedback to write, and was never Rahul's.
    assert.ok(!(await queueOf("grace", D)).some(([uid, n]) => uid === "chloe" && n === 3));
    assert.ok(!(await queueOf("rahul", B)).some(([uid]) => uid === "chloe"));
  });

  test("before any feedback, Chloe's week 3 is in Grace's Feedback to write and not Rahul's", async () => {
    fresh();
    await moveChloe();
    const run = normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`));
    const queueOf = async (who, groupId) =>
      ((await writtenQueue.loadWrittenQueue(w.world.db, w.sessionFor(who), run, normalizeCourseGroup(groupId, read(`courseGroups/${groupId}`)), new Date())) ?? []).map((row) => [row.uid, row.weekNumber]);
    assert.ok((await queueOf("grace", D)).some(([uid, n]) => uid === "chloe" && n === 3));
    assert.ok(!(await queueOf("rahul", B)).some(([uid]) => uid === "chloe"));
  });

  test("the old group's facilitators are refused everywhere: the reading view, feedback, the boxes and a first read", async () => {
    fresh();
    await moveChloe();
    for (const who of ["rahul", "sofia"]) {
      const drawn = await w.draw(READING_PAGE, who, { runId: RUN.agi, groupId: B, uid: "chloe" }, { week: "3" });
      assert.ok(drawn.to, `${who}: the reading view sends them away`);
      const feedback = await w.call(who, R8.feedback.POST, { runId: RUN.agi }, { body: { uid: "chloe", weekId: "w03", on: "writtenAnswer", itemId: "k3-wa", text: "Good." }, course: true });
      assert.equal(feedback.status, 403, who);
      const boxes = await getWithWeek(who, async (req, ctx) => R8.boxesRead.GET(new Request(`${req.url}&uid=chloe`), ctx), { runId: RUN.agi }, 3);
      assert.equal(boxes.status, 403, `${who}: ${JSON.stringify(boxes.body)}`);
      const before = JSON.stringify(read(`courseWeekWork/${RUN.agi}__chloe__w03`) ?? null);
      await w.call(who, R8.firstRead.POST, { runId: RUN.agi }, { body: { weekId: "w03", people: [{ uid: "chloe", ids: ["k3-rpB", "k3-wa"] }] }, course: true });
      assert.equal(JSON.stringify(read(`courseWeekWork/${RUN.agi}__chloe__w03`) ?? null), before, `${who}: no first read is marked`);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. The page of one question, for a week somebody moved did with another group
// ---------------------------------------------------------------------------

const QUESTION_PAGES = {
  group: (await w.loadTs(join("app", "(app)", "learn", "[runId]", "group", "[groupId]", "question", "page.tsx"))).default,
  programme: (await w.loadTs(join(PROGRAMME, "question", "page.tsx"))).default,
};
const { account } = await import("./lib/hubAttendanceWorld.mjs");
const { filterCounts } = await w.loadTs(join("lib", "courses", "coursework", "question.ts"));
const { didWeekWithWords } = await w.loadTs(join("lib", "courses", "coursework", "words.ts"));
const { SAID } = await import("./lib/facilitatorWeekWorld.mjs");

/** An admin of this world, made up for this suite. */
const ADMIN = "ada";
/** Week 2 written as blocks, which neither Group B nor Group D has a copy of: one document for both. */
const BLOCK_WEEK_TWO = { [`courseRuns/${RUN.agi}/weeks/w02`]: weekDoc(2, weekOneBlocks("k2")) };
/** Chloe's words in weeks 1 and 2, each her own. */
const CHLOE_WEEK_ONE = "The first lamp I saw was green.";
const CHLOE_WEEK_TWO = "A keeper's log, kept by hand.";
const WEEK_ONE_AND_TWO_WORDS = {
  [`courseExerciseResponses/${RUN.agi}__chloe__w01__k1-rp1`]: reflection("chloe", "k1-rp1", CHLOE_WEEK_ONE, 1),
  [`courseExerciseResponses/${RUN.agi}__chloe__w02__k2-rp1`]: reflection("chloe", "k2-rp1", CHLOE_WEEK_TWO, 2),
};
/** Everything Chloe wrote in week 3, in either copy. */
const CHLOE_WEEK_THREE = [...Object.values(SAID.chloe), "Keepers should, they know the lamps.", "The one by the harbour wall."];

/** The world of this section: an admin, block weeks 1 to 3, Chloe's words in each. */
function freshForQuestions(over = {}) {
  fresh({ ...BLOCK_WEEK_TWO, ...WEEK_ONE_AND_TWO_WORDS, [`users/${ADMIN}`]: account(ADMIN, "Ada Quist", "admin"), ...over });
}

/** The page of one question across Group D (or `groupId`), as `who`, through `door`; asserts the drawing wrote nothing. */
async function questionPage(who, door, query, groupId = D) {
  const drawn =
    door === "group"
      ? await w.draw(QUESTION_PAGES.group, who, { runId: RUN.agi, groupId }, query)
      : await w.draw(QUESTION_PAGES.programme, who, { roundId: ROUND, programmeId: AGI }, { group: groupId, ...query });
  assert.equal(drawn.wrote, false, `${who} drawing the ${door} side wrote something`);
  const view = find(drawn.element, "QuestionView")[0]?.props.view ?? null;
  assert.ok(view, `${who} on the ${door} side: ${drawn.to ?? drawn.text.slice(0, 120)}`);
  return { view, text: drawn.text };
}
const rowFor = (view, uid) => view.rows.find((row) => row.uid === uid) ?? null;
/** The new group's facilitator on the group's door, and the lead and an admin on both. */
const READERS_OF_D = [
  ["grace", "group"],
  ["claudia", "group"],
  ["claudia", "programme"],
  [ADMIN, "group"],
  [ADMIN, "programme"],
];

/** Whether `who` is told which group: an admin and the programme's lead are; a group's facilitator never is. */
const namesGroupTo = (who) => who !== "grace";
/** What a row says of her week `n` done with Group B, to `who`, on Group B's own version or not. */
function didWeekLine(who, n, ownCopy) {
  if (namesGroupTo(who)) return ownCopy ? `Chloe did week ${n} with Group B, on Group B’s version of the week.` : `Chloe did week ${n} with Group B.`;
  return ownCopy ? `Chloe did week ${n} with another group, on that group’s version of the week.` : `Chloe did week ${n} with another group.`;
}
/** Group B is in nothing a facilitator of Group D is handed: neither its name nor its id. */
function assertNoOldGroupFor(who, view, label) {
  if (namesGroupTo(who)) return;
  const payload = JSON.stringify(view);
  assert.ok(!payload.includes("Group B"), `${label}: Group B's name is in what a facilitator is handed`);
  assert.ok(!payload.includes(B), `${label}: Group B's id is in what a facilitator is handed`);
}

/** A row with nothing of its person's but their name, the link to their week and where they did the week. */
function assertElsewhereRow(row, weekNumber, elsewhere, label) {
  assert.ok(row, `${label}: Chloe is listed`);
  assert.deepEqual(row.elsewhere, elsewhere, label);
  assert.deepEqual(
    {
      answer: row.answer,
      notSent: row.notSent,
      read: row.read,
      feedback: row.feedback,
      late: row.late,
      afterDeadline: row.afterDeadline,
      joinedLate: row.joinedLate,
      cards: row.cards,
      own: row.own,
      mayWrite: row.mayWrite,
      team: row.team,
    },
    { answer: null, notSent: false, read: null, feedback: null, late: false, afterDeadline: false, joinedLate: false, cards: [], own: null, mayWrite: false, team: null },
    label,
  );
  assert.match(row.weekHref, new RegExp(`/coursework/chloe\\?week=${weekNumber}#`), label);
}

describe("the page of one question, for a week somebody moved did with another group", () => {
  test("week 3, on Group B's version: no words, states or controls of hers on any question, both doors, three readers", async () => {
    freshForQuestions();
    await moveChloe();
    for (const [who, door] of READERS_OF_D) {
      // Group D's week 3 asks the shared question in its own words, one only it asks, and the written answer.
      for (const question of ["k3-rp1", "k3-rpD", "k3-wa"]) {
        const label = `${who}, ${door} side, ${question}`;
        const { view, text } = await questionPage(who, door, { week: "3", question });
        assert.equal(view.question.id, question, label);
        const row = rowFor(view, "chloe");
        assertElsewhereRow(row, 3, { groupName: namesGroupTo(who) ? "Group B" : null, ownCopy: true }, label);
        // The sentence, in the name this page already shows its reader beside the link to her week: the group named
        // to an admin and the lead, never to a facilitator, in the words or in what the page is handed.
        assert.equal(row.firstName, "Chloe", label);
        assert.ok(text.includes(didWeekLine(who, 3, true)), `${label}: ${text.slice(0, 400)}`);
        assertNoOldGroupFor(who, view, label);
        assert.ok(text.includes("Open Chloe’s week"), label);
        // None of her words anywhere in what the page is handed.
        const payload = JSON.stringify(view);
        for (const words of CHLOE_WEEK_THREE) assert.ok(!payload.includes(words), `${label}: her words "${words}" are in the payload`);
        // Nothing of hers named to the first-read route; counted by no filter, though still one of everybody.
        assert.ok(!(view.firstRead?.people ?? []).some((person) => person.uid === "chloe"), label);
        assert.deepEqual(view.counts, filterCounts(view.rows), label);
        assert.equal(view.everybody, view.rows.length, label);
        for (const filter of [{ unread: "1" }, { nofeedback: "1" }, { late: "1" }]) {
          const kept = (await questionPage(who, door, { week: "3", question, ...filter })).view;
          assert.equal(rowFor(kept, "chloe"), null, `${label}: kept by the filter ${JSON.stringify(filter)}`);
        }
      }
    }
  });

  test("Group D's own people on the same page are as they were", async () => {
    freshForQuestions({
      [`courseExerciseResponses/${RUN.agi}__freya__w03__k3-rpD`]: reflection("freya", "k3-rpD", "The one at the end of the pier."),
    });
    const before = (await questionPage("grace", "group", { week: "3", question: "k3-rpD" })).view;
    await moveChloe();
    const after = (await questionPage("grace", "group", { week: "3", question: "k3-rpD" })).view;
    assert.deepEqual(rowFor(after, "freya"), rowFor(before, "freya"));
    assert.deepEqual(rowFor(after, "yasmin"), rowFor(before, "yasmin"));
    assert.equal(rowFor(after, "freya").answer.text, "The one at the end of the pier.");
    assert.equal("elsewhere" in rowFor(after, "freya"), false);
  });

  test("week 1, on Group B's own version where Group D reads the run's: the same line, with week 1", async () => {
    freshForQuestions();
    await moveChloe();
    for (const [who, door] of READERS_OF_D) {
      const { view, text } = await questionPage(who, door, { week: "1", question: "k1-rp1" });
      assertElsewhereRow(rowFor(view, "chloe"), 1, { groupName: namesGroupTo(who) ? "Group B" : null, ownCopy: true }, `${who}, ${door}`);
      assert.ok(text.includes(didWeekLine(who, 1, true)), `${who}, ${door}`);
      assertNoOldGroupFor(who, view, `${who}, ${door}`);
      assert.ok(!JSON.stringify(view).includes(CHLOE_WEEK_ONE), `${who}, ${door}`);
    }
  });

  test("week 2, which both groups read from the run's own document: an ordinary row with her answer", async () => {
    freshForQuestions();
    await moveChloe();
    for (const [who, door] of READERS_OF_D) {
      const { view } = await questionPage(who, door, { week: "2", question: "k2-rp1" });
      const row = rowFor(view, "chloe");
      assert.equal("elsewhere" in row, false, `${who}, ${door}`);
      assert.equal(row.answer?.text, CHLOE_WEEK_TWO, `${who}, ${door}`);
      assert.ok((view.firstRead?.people ?? []).some((person) => person.uid === "chloe"), `${who}, ${door}: named as first read`);
    }
  });

  test("a week Group B read from the run's own document where Group D has its own: the line without the version", async () => {
    freshForQuestions({ [`courseGroups/${D}/weeks/w02`]: { ...weekDoc(2, weekOneBlocks("k2"), "Group D's own week 2"), groupId: D, runId: RUN.agi } });
    await moveChloe();
    for (const [who, door] of READERS_OF_D) {
      const { view, text } = await questionPage(who, door, { week: "2", question: "k2-rp1" });
      assertElsewhereRow(rowFor(view, "chloe"), 2, { groupName: namesGroupTo(who) ? "Group B" : null, ownCopy: false }, `${who}, ${door}`);
      assert.ok(text.includes(didWeekLine(who, 2, false)), `${who}, ${door}`);
      assert.ok(!text.includes("version of the week"), `${who}, ${door}`);
      assertNoOldGroupFor(who, view, `${who}, ${door}`);
      assert.ok(!JSON.stringify(view).includes(CHLOE_WEEK_TWO), `${who}, ${door}`);
    }
    assert.equal(didWeekWithWords("Chloe", 2, "Group B", false), "Chloe did week 2 with Group B.");
    assert.equal(didWeekWithWords("Chloe", 3, "Group B", true), "Chloe did week 3 with Group B, on Group B’s version of the week.");
    assert.equal(didWeekWithWords("Chloe", 2, null, false), "Chloe did week 2 with another group.");
    assert.equal(didWeekWithWords("Chloe", 3, null, true), "Chloe did week 3 with another group, on that group’s version of the week.");
  });

  test("Group B archived after the move: still named to the lead and an admin, never to a facilitator, still nothing of hers", async () => {
    freshForQuestions();
    await moveChloe();
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    for (const [who, door] of READERS_OF_D) {
      const { view, text } = await questionPage(who, door, { week: "3", question: "k3-rp1" });
      assertElsewhereRow(rowFor(view, "chloe"), 3, { groupName: namesGroupTo(who) ? "Group B" : null, ownCopy: true }, `archived, ${who}, ${door}`);
      assert.ok(text.includes(didWeekLine(who, 3, true)), `archived, ${who}, ${door}`);
      assertNoOldGroupFor(who, view, `archived, ${who}, ${door}`);
    }
  });

  test("her work in a week she did elsewhere never chooses the week the page opens on", async () => {
    // Group D's people have written only in week 2; Chloe in weeks 1 to 3, weeks 1 and 3 on Group B's versions.
    freshForQuestions({
      [`courseExerciseResponses/${RUN.agi}__freya__w02__k2-rp1`]: reflection("freya", "k2-rp1", "Two lamps out on the north wall.", 2),
    });
    at("2026-11-18T09:00:00Z");
    // With no record her week 3 is Group B's page's, not this one's, so the page opens on week 2 before the move too.
    assert.equal((await questionPage("grace", "group", {})).view.weekNumber, 2);
    await moveChloe();
    // Her week 3 is on this page now, as a week she did elsewhere: it does not open the page on week 3.
    const opened = (await questionPage("grace", "group", {})).view;
    assert.equal(opened.weekNumber, 2);
    assert.equal("elsewhere" in rowFor(opened, "chloe"), false);
    // Asked for, week 3 still opens, with her line.
    assert.ok(rowFor((await questionPage("grace", "group", { week: "3" })).view, "chloe").elsewhere);
  });

  test("with no record: no row anywhere carries the field, and her answers are hers on Group B's page", async () => {
    freshForQuestions();
    at("2026-11-18T09:00:00Z");
    for (const [groupId, questions] of [
      [B, { 1: "k1-rp1", 2: "k2-rp1", 3: "k3-rpB" }],
      [D, { 1: "k1-rp1", 2: "k2-rp1", 3: "k3-rpD" }],
    ]) {
      for (const [who, door] of [["claudia", "group"], ["claudia", "programme"], [ADMIN, "programme"]]) {
        for (const [week, question] of Object.entries(questions)) {
          const { view, text } = await questionPage(who, door, { week, question }, groupId);
          for (const row of view.rows) assert.equal("elsewhere" in row, false, `${groupId} ${who} ${door} week ${week}`);
          assert.ok(!text.includes(" did week "), `${groupId} ${who} ${door} week ${week}`);
        }
      }
    }
    const chloeOnB = (await questionPage("claudia", "group", { week: "3", question: "k3-rpB" }, B)).view;
    assert.equal(rowFor(chloeOnB, "chloe").answer.text, "The one by the harbour wall.");
    assert.equal(rowFor((await questionPage("claudia", "group", { week: "1", question: "k1-rp1" }, B)).view, "chloe").answer.text, CHLOE_WEEK_ONE);
  });
});

// ---------------------------------------------------------------------------
// 10. "After its deadline" on the reading view: the calendar of the group whose copy they read
// ---------------------------------------------------------------------------

const { dueMoment } = await w.loadTs(join("lib", "courses", "weekBlocks", "due.ts"));
const { resolveSessions } = await w.loadTs(join("lib", "courses", "sessions.ts"));

/** A written answer to week 3's `k3-wa`, first and last sent at `iso`. */
function sentAnswerAt(uid, iso, text = "Keepers should, they know the lamps.") {
  const at = new Date(iso);
  return { ...answer(uid, text), submittedAt: at, firstSentAt: at, sentAt: at, updatedAt: at };
}
/** The reading view of `uid`'s week 3 through `groupId`'s door, as `who`. */
async function readingAs(who, groupId, uid) {
  const drawn = await w.draw(READING_PAGE, who, { runId: RUN.agi, groupId, uid }, { week: "3" });
  const view = find(drawn.element, "ReadingView")[0]?.props.view ?? null;
  assert.ok(view, `${who} reading ${uid} on ${groupId}: ${drawn.to ?? drawn.text.slice(0, 120)}`);
  return view;
}
/** Week 3's written answer's own deadline ("the day before") on a group's calendar, as the reading view dates it. */
const deadlineOn = (groupId) => dueMoment(resolveSessions(runDoc(), groupDoc(groupId)), 3, "dayBefore", null).at;

/** Mon 16 Nov 09:00: after Group D's deadline for week 3 (it meets Mondays), before Group B's (it meets Tuesdays). */
const BETWEEN = "2026-11-16T09:00:00Z";
/** Tue 17 Nov 10:00: after Group B's deadline, before Group B's session at 6pm. */
const AFTER_B = "2026-11-17T10:00:00Z";

describe("\"After its deadline\" on the reading view, for a week somebody moved spent in another group", () => {
  test("the two times tell the calendars apart", () => {
    fresh();
    const between = new Date(BETWEEN).getTime();
    assert.ok(deadlineOn(D).getTime() < between && between < deadlineOn(B).getTime());
    assert.ok(deadlineOn(B).getTime() < new Date(AFTER_B).getTime());
  });

  for (const archived of [false, true]) {
    test(`dated on Group B's calendar, the group she was due at that week${archived ? ", archived since" : ""}`, async () => {
      for (const [sent, expected] of [
        // Before Group B's deadline: not after it, though it is after Group D's.
        [BETWEEN, false],
        // After Group B's deadline and before its session.
        [AFTER_B, true],
      ]) {
        fresh({ [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`]: sentAnswerAt("chloe", sent) });
        // With no record, read by Group B's facilitator: the same answer either way.
        assert.equal((await readingAs("rahul", B, "chloe")).afterDeadline, expected, `before the move, sent ${sent}`);
        await moveChloe();
        if (archived) w.world.db.poke(`courseGroups/${B}`, { archived: true });
        const view = await readingAs("grace", D, "chloe");
        if (archived) {
          // A week in a group that no longer meets has no session for anybody reading it (sessionSourceFor reads
          // live groups): with no session to be due at, an answer is neither late nor after its deadline.
          assert.equal(view.due.at, null);
          assert.equal(view.afterDeadline, false, `after the move and the archive, sent ${sent}`);
        } else {
          assert.equal(view.due.at?.toISOString(), "2026-11-17T18:00:00.000Z", "due at Group B's week 3 session");
          assert.equal(view.afterDeadline, expected, `after the move, sent ${sent}`);
        }
      }
    });
  }

  test("somebody in Group D with no record: Group D's own calendar, as before", async () => {
    fresh({ [`courseExerciseResponses/${RUN.agi}__freya__w03__k3-wa`]: sentAnswerAt("freya", BETWEEN, "The harbour board, every time.") });
    at("2026-11-18T09:00:00Z");
    // Sent Monday morning: after Group D's deadline for week 3, before its session that evening.
    assert.equal((await readingAs("grace", D, "freya")).afterDeadline, true);
  });
});

// ---------------------------------------------------------------------------
// 11. The Written answer column's lists, for a week somebody moved did with another group
// ---------------------------------------------------------------------------

const reviewPage = await w.loadTs(join("lib", "courses", "writtenAnswers", "reviewPage.ts"));
/** The written answers' lists of `groupId`'s week 3 as `who` reads them, one person's entry. */
async function reviewEntry(who, groupId, uid) {
  const model = await reviewPage.loadWrittenReview(w.world.db, w.sessionFor(who), runDoc(), groupDoc(groupId), 3, new Date());
  assert.equal(model.weekNumber, 3);
  return [...model.toGive, ...model.feedbackSent, ...model.notSent].find((person) => person.uid === uid) ?? null;
}

describe("the Written answer column's lists, for a week somebody moved did with another group", () => {
  test("she is still listed on Group D's week 3 (it lists everybody in the group now), and dated on Group B's calendar", async () => {
    for (const [sent, expected] of [
      [BETWEEN, false],
      [AFTER_B, true],
    ]) {
      fresh({ [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`]: sentAnswerAt("chloe", sent) });
      assert.equal((await reviewEntry("rahul", B, "chloe")).afterDeadline, expected, `with no record, on Group B, sent ${sent}`);
      await moveChloe();
      const entry = await reviewEntry("grace", D, "chloe");
      assert.ok(entry, "the loader reaches her for a week she spent in Group B");
      assert.equal(entry.due.at, "2026-11-17T18:00:00.000Z");
      assert.equal(entry.afterDeadline, expected, `after the move, sent ${sent}`);
      // And the column never draws it: Group D's card for week 3 has no row for her (section 2).
      const page = await pageFor(D, "facilitator", "grace");
      assert.ok(!rowsOf(page).includes("chloe"));
    }
  });

  test("somebody in Group D with no record: Group D's own calendar, as before", async () => {
    fresh({ [`courseExerciseResponses/${RUN.agi}__freya__w03__k3-wa`]: sentAnswerAt("freya", BETWEEN, "The harbour board, every time.") });
    at("2026-11-18T09:00:00Z");
    assert.equal((await reviewEntry("grace", D, "freya")).afterDeadline, true);
  });
});

// ---------------------------------------------------------------------------
// 12. A moved person's own card, between the move and the week it starts
// ---------------------------------------------------------------------------

const WEEK_THREE_LINK = "https://example.com/group-c-week-3";
const WEEK_FOUR_LINK = "https://example.com/group-c-week-4";
const STANDING_LINK = "https://example.com/group-c";

/**
 * Group C (Wednesdays at 1pm) with a standing link, and its week 3 (Wed 18 Nov,
 * still to come on Wednesday morning) moved to another room with a link of
 * its own; with `ownWeekFour`, its week 4 has its own room and link too.
 */
function groupCWeeks(ownWeekFour) {
  const session = { ...groupDoc(C).session, meetingUrl: STANDING_LINK };
  w.world.db.poke(`courseGroups/${C}`, {
    memberCount: 2,
    session,
    sessionOverrides: {
      w03: { location: "Week three room", meetingUrl: WEEK_THREE_LINK, startTimeLocal: "15:00" },
      ...(ownWeekFour ? { w04: { location: "Week four room", meetingUrl: WEEK_FOUR_LINK } } : {}),
    },
  });
}

/** Claudia moves Chloe to Group C on Wed 18 Nov at 9am, before Group C's week 3 session that afternoon: from week 4. */
async function moveChloeToC() {
  at("2026-11-18T09:00:00Z");
  const params = { roundId: ROUND, programmeId: AGI, uid: "chloe" };
  const shown = await w.call("claudia", moveRoute.POST, params, { body: { toGroupId: C, preview: true }, course: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  assert.equal(shown.body.preview.weekNumber, 4);
  const saved = await w.call("claudia", moveRoute.POST, params, {
    body: { toGroupId: C, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails },
    course: true,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(read(`courseEnrolments/${RUN.agi}__chloe`).groupsByWeek, [
    { groupId: B, fromWeek: 1 },
    { groupId: C, fromWeek: 4 },
  ]);
}

/** The slot fields of `uid`'s own card on the overview. */
async function ownCard(uid) {
  const { data } = await sourceOf(uid);
  const card = data.group;
  assert.ok(card, `${uid} has a card`);
  const { sessionLabel, weekday, startTimeLocal, durationMinutes, location, meetingUrl } = card;
  return { slot: { sessionLabel, weekday, startTimeLocal, durationMinutes, location, meetingUrl }, card };
}

describe("a moved person's own card, between the move and the week it starts", () => {
  for (const ownWeekFour of [false, true]) {
    test(`the card's slot and link are week 4's, never Group C's week 3 still to come${ownWeekFour ? " (week 4 with a room and link of its own)" : ""}`, async () => {
      fresh();
      groupCWeeks(ownWeekFour);
      await moveChloeToC();
      const { slot, card } = await ownCard("chloe");
      assert.equal(card.id, C);
      assert.equal(card.calendar.currentWeek.weekNumber ?? card.calendar.currentWeek.anchorWeekNumber, 3, "Group C is still in its week 3");
      assert.equal(card.calendar.nextSession.weekNumber, 4, "her next session is Group C's week 4");
      assert.equal(slot.meetingUrl, ownWeekFour ? WEEK_FOUR_LINK : STANDING_LINK);
      assert.equal(slot.location, ownWeekFour ? "Week four room" : "Room B8");
      assert.equal(slot.startTimeLocal, "13:00");
      assert.notEqual(slot.meetingUrl, WEEK_THREE_LINK);
      // Nothing of week 3's arrangement anywhere on her card.
      assert.ok(!JSON.stringify(card).includes(WEEK_THREE_LINK));
      assert.ok(!JSON.stringify(card).includes("Week three room"));
      // Once Group C's week 3 session is over, the same week 4 slot, as anybody in the group is shown it.
      at("2026-11-19T09:00:00Z");
      assert.deepEqual((await ownCard("chloe")).slot, slot);
      assert.deepEqual((await ownCard("hamza")).slot, slot);
    });
  }

  test("somebody in Group C with no record: the card's slot and link are its current week's, as before", async () => {
    fresh();
    groupCWeeks(true);
    at("2026-11-18T09:00:00Z");
    const before = await ownCard("hamza");
    assert.equal(before.slot.meetingUrl, WEEK_THREE_LINK);
    assert.equal(before.slot.location, "Week three room");
    assert.equal(before.slot.startTimeLocal, "15:00");
    await moveChloeToC();
    assert.deepEqual((await ownCard("hamza")).card, before.card, "nobody else's card changes with the move");
  });
});

// ---------------------------------------------------------------------------
// 13. "Week N is open": an earlier week judged on the copy the person read it on
// ---------------------------------------------------------------------------

const earlierWeeks = await w.loadTs(join("lib", "courses", "groupWeekWork", "earlier.ts"));
const RUN_WEEK_THREE_PROMPTS = ["k3-rp1", "k3-rp2", "k3-rp3", "k3-rp4", "k3-rp5", "k3-rp6"];

/**
 * The run's week 3 in week 1's shape, which Group B reads; Group D's own copy
 * asks one reflection more. `writers` wrote every prompt of the run's week 3
 * and ticked both its readings.
 */
function freshForEarlierWeeks(writers) {
  const run3 = weekDoc(3, weekOneBlocks("k3"));
  const d3 = clone(run3);
  d3.blocks.find((block) => block.id === "k3-p1").blocks.push({ id: "k3-rsD", type: "reflection", prompts: [{ id: "k3-rpD", text: "Only Group D asks this." }] });
  const over = {
    [`courseRuns/${RUN.agi}/weeks/w03`]: run3,
    [`courseRuns/${RUN.agi}/weeks/w04`]: weekDoc(4, weekOneBlocks("k4")),
    [`courseGroups/${D}/weeks/w03`]: { ...d3, groupId: D, runId: RUN.agi },
  };
  for (const uid of writers) {
    for (const id of RUN_WEEK_THREE_PROMPTS) over[`courseExerciseResponses/${RUN.agi}__${uid}__w03__${id}`] = reflection(uid, id, `${uid} on ${id}`);
  }
  const world = seed(over);
  // Not this file's other copies of weeks 1 and 3, nor its other answers: Group B reads the run's own weeks here.
  delete world[`courseGroups/${B}/weeks/w03`];
  delete world[`courseGroups/${B}/weeks/w01`];
  // Week 1 written before blocks, so week 3 is the one earlier week any email here can name.
  world[`courseRuns/${RUN.agi}/weeks/w01`] = { weekNumber: 1, title: "Week 1 readings", summary: "", published: true, materials: [], checklist: [], exercises: [] };
  at(NOW.toISOString());
  w.reset(world);
  for (const [groupId, count] of [[A, 4], [B, 4], [D, 2]]) w.world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  for (const uid of writers) {
    for (const itemId of ["k3-s1", "k3-s2"]) {
      w.world.db.seed(`courseProgress/${RUN.agi}__${uid}__${itemId}`, {
        runId: RUN.agi, uid, weekNumber: 3, itemKind: "material", itemId, completed: true, completedAt: new Date("2026-11-16T10:00:00Z"),
      });
    }
  }
}
/** The earlier weeks not done that `groupId`'s week 4 email names for each of `uids`, now. */
async function earlierFor(groupId, uids) {
  return Object.fromEntries(await earlierWeeks.earlierWeeksNotDone(w.world.db, { run: runDoc(), group: groupDoc(groupId), weekNumber: 4, uids, now: new Date() }));
}

describe("\"Week N is open\": an earlier week is judged on the copy the person read it on", () => {
  test("Chloe finished week 3 on Group B's copy: neither group's week 4 email names it, before or after the move", async () => {
    freshForEarlierWeeks(["chloe"]);
    assert.equal(read(`courseGroups/${B}/weeks/w03`), undefined, "Group B reads the run's own week 3");
    at("2026-11-18T09:00:00Z");
    assert.deepEqual((await earlierFor(B, ["chloe"])).chloe, [], "Group B's week 4 email, before the move");
    await moveChloe();
    // Group D's own copy asks one reflection more, which her week 3 never asked: not named.
    assert.deepEqual((await earlierFor(D, ["chloe"])).chloe, [], "Group D's week 4 email, after the move");
    // As her own week page reads it: the run's copy, through Group B.
    const { source } = await sourceOf("chloe");
    assert.equal(pageWeek(source, "w03").path, `courseRuns/${RUN.agi}/weeks/w03`);
  });

  test("an earlier week she did not finish on Group B's copy is still named, after the move", async () => {
    freshForEarlierWeeks([]);
    at("2026-11-18T09:00:00Z");
    await moveChloe();
    assert.deepEqual((await earlierFor(D, ["chloe"])).chloe, [3]);
  });

  test("with no record: Group D's people are judged on Group D's copy, as before", async () => {
    // Freya wrote every prompt of the run's week 3 and not Group D's own: her own page shows Group D's copy, so week 3 is not done.
    freshForEarlierWeeks(["freya"]);
    at("2026-11-18T09:00:00Z");
    assert.deepEqual(await earlierFor(D, ["freya", "yasmin"]), { freya: [3], yasmin: [3] });
    // And Group B's people on the run's copy, which Group B reads.
    freshForEarlierWeeks(["chloe"]);
    at("2026-11-18T09:00:00Z");
    assert.deepEqual(await earlierFor(B, ["chloe", "farah"]), { chloe: [], farah: [3] });
  });
});

// ---------------------------------------------------------------------------
// 14. The Coursework tab, once the group somebody was moved out of is archived
// ---------------------------------------------------------------------------

describe("the Coursework tab reads a week spent in a group archived since on that group's copy", () => {
  test("Chloe's week 3 cell: the same before the move, after it, and after Group B is archived", async () => {
    fresh();
    at("2026-11-18T09:00:00Z");
    const before = await tabCell("chloe", 3);
    assert.ok(before?.counted, JSON.stringify(before));
    await moveChloe();
    assert.deepEqual(await tabCell("chloe", 3), before, "moved, Group B still meeting");
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    const archived = await tabCell("chloe", 3);
    // Read on Group B's copy still: counted, its reflections and readings as before, nothing dropped.
    assert.deepEqual({ ...archived, due: null }, { ...before, due: null }, "moved, Group B archived");
    assert.deepEqual(before.reflections, { written: 1, of: 3 });
    assert.deepEqual(before.ticks, { ticked: 1, of: 2 });
    // The one difference, by the record's own rule: a week in a group that no longer meets has no session for
    // anybody reading it (`sessionSourceFor` reads live groups), so it is undated, as on the reading view.
    assert.deepEqual(archived.due, { at: null, by: "undated" });
    assert.deepEqual((await readingOfChloe()).due, { at: null, by: "undated" });
  });
});

const gather = await w.loadTs(join("lib", "courses", "coursework", "gather.ts"));

const FARAH_B_ONLY = "The green one, past the harbour.";

describe("the run's questions for Claude and Pangram: an archived group's own question is gathered only for whoever's record names it", () => {
  /** Week 3 as the coursework door reads it, and the answers to Group B's own prompt it gathers from `writers`. */
  async function gathered(writers = ["chloe", "farah"]) {
    const { loadRunPeople, loadRunWeeks, loadAnswers, archivedRecordGroupsOf } = gather;
    const people = await loadRunPeople(w.world.db, RUN.agi);
    const live = [...people.facilitatorsOf.keys()];
    const weeks = await loadRunWeeks(w.world.db, RUN.agi, live, archivedRecordGroupsOf(people));
    const answers = await loadAnswers(w.world.db, RUN.agi, weeks, new Set(writers));
    const own = (weeks.find((week) => week.weekNumber === 3)?.questions ?? []).find((question) => question.key === "reflection:k3-rpB") ?? null;
    return {
      archived: archivedRecordGroupsOf(people),
      own,
      gatheredFor: answers.filter((answer) => answer.weekId === "w03" && answer.questionKey === "reflection:k3-rpB").map((answer) => answer.uid).sort(),
      // What dev reads and gathers: the run's own weeks and the live groups' copies, for everybody.
      dev: await (async () => {
        const devWeeks = await loadRunWeeks(w.world.db, RUN.agi, live);
        return { weeks: devWeeks, answers: await loadAnswers(w.world.db, RUN.agi, devWeeks, new Set(writers)) };
      })(),
      weeks,
      answers,
    };
  }
  /** Chloe and Farah both answered Group B's own prompt, which no other copy asks. */
  const BOTH_ANSWERED = {
    [`courseExerciseResponses/${RUN.agi}__farah__w03__k3-rpB`]: reflection("farah", "k3-rpB", FARAH_B_ONLY),
  };

  test("Chloe moved with the button, Farah on the board: once Group B is archived, Chloe's answer is gathered and Farah's is not", async () => {
    fresh(BOTH_ANSWERED);
    await moveChloe();
    // Group B still meets: its copy is a live group's, so its question is everybody's, as on dev.
    const live = await gathered();
    assert.deepEqual(live.gatheredFor, ["chloe", "farah"]);
    assert.equal(live.own?.askedOnlyIn, undefined);
    // Farah is moved off Group B on the allocation board (no record), and Group B is archived.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__farah`, { groupId: A });
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    const after = await gathered();
    assert.deepEqual(after.archived, [B]);
    assert.deepEqual(after.own?.askedOnlyIn, [B]);
    assert.deepEqual(after.gatheredFor, ["chloe"], "Farah has no record: her answer to an archived group's own question is not gathered");
    assert.ok(!JSON.stringify(after.answers).includes(FARAH_B_ONLY));
    // For Farah alone, exactly what dev gathers.
    const farah = await gathered(["farah"]);
    assert.deepEqual(farah.answers, farah.dev.answers);
  });

  test("with nobody moved: the same questions and answers as dev, Group B archived or not", async () => {
    fresh(BOTH_ANSWERED);
    for (const archived of [false, true]) {
      if (archived) w.world.db.poke(`courseGroups/${B}`, { archived: true });
      const now = await gathered();
      assert.deepEqual(now.archived, []);
      assert.deepEqual(now.weeks, now.dev.weeks, `archived ${archived}`);
      assert.deepEqual(now.answers, now.dev.answers, `archived ${archived}`);
      assert.ok(now.weeks.every((week) => week.questions.every((question) => !("askedOnlyIn" in question))));
    }
  });

  test("the coursework door reads the live groups' copies, and the archived groups a record names only for those people", () => {
    const door = stripSource(readFileSync(join(SRC, "lib", "courses", "coursework", "door.ts"), "utf8"), { keepStrings: true });
    assert.match(door, /const weeks = await loadRunWeeks\(db, runId, \[\.\.\.people\.facilitatorsOf\.keys\(\)\], archivedRecordGroupsOf\(people\)\);/);
    assert.equal((door.match(/\bloadRunWeeks\(/g) ?? []).length, 1);
    // A week's review lists such a question only with an answer gathered to it.
    const review = stripSource(readFileSync(join(SRC, "lib", "courses", "weekReview", "gather.ts"), "utf8"), { keepStrings: true });
    assert.match(review, /\.filter\(\(question\) => !question\.askedOnlyIn \|\| answers\.some\(\(answer\) => answer\.questionKey === question\.key\)\)/);
  });

  test("the Coursework tab: Farah's cell never counts anybody else's answer, with Chloe's record naming Group B or not", async () => {
    const cellOfFarah = async (moveFirst) => {
      fresh(BOTH_ANSWERED);
      at("2026-11-18T09:00:00Z");
      if (moveFirst) await moveChloe();
      w.world.db.poke(`courseEnrolments/${RUN.agi}__farah`, { groupId: A });
      w.world.db.poke(`courseGroups/${B}`, { archived: true });
      return tabCell("farah", 3);
    };
    assert.deepEqual(await cellOfFarah(true), await cellOfFarah(false));
  });
});
