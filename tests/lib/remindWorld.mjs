/**
 * A running course run in its fourth week, with its weeks WRITTEN AS BLOCKS,
 * for the suites about who has done a week and Remind by hand.
 *
 * Built on `tests/lib/sessionsWorld.mjs` (Group B meets on Tuesdays at 6pm in
 * Hallward B12, Rahul and Sofia facilitating; its people Amara and Ines told
 * by Publish, Dev placed and not told, Omar told with his address on the
 * do-not-email list, Nina left; Claudia leads the programme, Yusuf is the
 * run's track lead, Tom facilitates Group C, Bea is in Group A; Zach is an
 * admin). The clock starts at Thu 19 Nov 2026, 10am in London: Group B's
 * week 3 session (Tue 17 Nov, 6pm) is over and its week 4 session (Tue 24
 * Nov, 6pm) is ahead. On top of it:
 *
 *  - WEEKS 3 AND 4 are written as blocks and published, each two readings and
 *    a reflection (part 1) and a written answer (part 2), each a task; week 5
 *    is written as blocks and NOT published.
 *  - RAHUL HOLDS A PLACE in Group B as well as facilitating it (a learner's
 *    row, told), so a Remind that ever reached a facilitator would reach him.
 *  - WEEK 3'S WORK: Amara did all of it before the session; Rahul ticked one
 *    reading; Ines and Omar did nothing.
 *
 * Real: the Remind route, the readers, the notice audience and caps, the
 * notice door, the email template, the group page's reader. Stubbed (by the
 * hand-over world): the session, view-as, `sendEmail`, which records what it
 * was handed and sends nothing.
 */
import { AWAY, B, CAST, LINK, NOW, RUN, TUE_24, makeSessionsWorld, updatesSeed } from "./sessionsWorld.mjs";
import { remindWeek } from "./remindWeek.mjs";
import { FIELD_VALUE_STUB } from "./applicationsStore.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { walkSource } from "./functionScan.mjs";

export { AWAY, B, CAST, LINK, NOW, RUN, TUE_24, remindWeek };

/** A week document as the loader stores one. */
export function blockWeekDoc(n, k, { published = true } = {}) {
  return {
    weekNumber: n,
    title: `Week ${n} theme`,
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published,
    blocks: remindWeek(k),
  };
}

const wk = (n) => `w${String(n).padStart(2, "0")}`;

/** A tick, as the ticks route writes one. */
export function tickRow(uid, weekNumber, itemId, at) {
  return [
    `courseProgress/${RUN.agi}__${uid}__${itemId}`,
    { runId: RUN.agi, uid, weekNumber, itemKind: "material", itemId, completed: true, completedAt: at, updatedAt: at },
  ];
}

/** A reflection, as its route stores one. */
export function reflectionRow(uid, weekNumber, promptId, text, at) {
  return [
    `courseExerciseResponses/${RUN.agi}__${uid}__${wk(weekNumber)}__${promptId}`,
    { runId: RUN.agi, uid, weekId: wk(weekNumber), weekNumber, exerciseId: promptId, kind: "reflection", responseType: "text", text, firstWrittenAt: at, updatedAt: at },
  ];
}

/** A written answer, sent at `sentAt` or not sent. */
export function answerRow(uid, weekNumber, answerId, words, at, sentAt = null) {
  return [
    `courseExerciseResponses/${RUN.agi}__${uid}__${wk(weekNumber)}__${answerId}`,
    {
      runId: RUN.agi,
      uid,
      weekId: wk(weekNumber),
      weekNumber,
      exerciseId: answerId,
      text: "word ".repeat(words).trim(),
      words,
      firstWrittenAt: at,
      updatedAt: at,
      ...(sentAt ? { firstSentAt: sentAt, sentAt, submittedAt: sentAt } : {}),
    },
  ];
}

/** Everything of one week of `remindWeek(k)` done by `uid` at `at`. */
export function weekDone(uid, weekNumber, k, at) {
  return Object.fromEntries([
    tickRow(uid, weekNumber, `${k}-s1`, at),
    tickRow(uid, weekNumber, `${k}-s2`, at),
    reflectionRow(uid, weekNumber, `${k}-rp1`, `${uid} thought about week ${weekNumber}.`, at),
    answerRow(uid, weekNumber, `${k}-wa`, 20, at, at),
  ]);
}

/** Before Group B's week 3 session (Tue 17 Nov, 6pm): Sun 15 Nov, 4pm. */
export const BEFORE_WEEK3 = new Date("2026-11-15T16:00:00Z");

/** The world every Remind suite starts from. `over` adds or replaces whole documents. */
export function remindSeed(over = {}) {
  const seed = updatesSeed();
  seed[`courseRuns/${RUN.agi}/weeks/w03`] = blockWeekDoc(3, "r3");
  seed[`courseRuns/${RUN.agi}/weeks/w04`] = blockWeekDoc(4, "r4");
  seed[`courseRuns/${RUN.agi}/weeks/w05`] = blockWeekDoc(5, "r5", { published: false });
  // Rahul holds a place in the group he facilitates, told by Publish.
  seed[`courseEnrolments/${RUN.agi}__rahul`] = {
    ...seed[`courseEnrolments/${RUN.agi}__amara`],
    uid: "rahul",
    applicationId: `rahul-application`,
  };
  Object.assign(seed, weekDone("amara", 3, "r3", BEFORE_WEEK3));
  Object.assign(seed, Object.fromEntries([tickRow("rahul", 3, "r3-s1", BEFORE_WEEK3)]));
  return { ...seed, ...over };
}

/**
 * The Admin SDK's sentinels the store resolves, a `Timestamp`, and a
 * `FieldPath`, which account deletion's module imports.
 */
const FIRESTORE_STUB = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
);

/** Every CSS module in `src`, stubbed to hand back each class's own name. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const STYLESHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) STYLESHEETS.add(specifier);
}

/** The world, the Remind route and short ways to ask it. */
export async function makeRemindWorld(key = "__remind") {
  globalThis.__remindUi = { h: createElement };
  const made = await makeSessionsWorld(key, [
    ["firebase-admin/firestore", FIRESTORE_STUB],
    ["next/navigation", "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }"],
    [
      "next/link",
      "export default ({ href, className, children, ...rest }) =>\n" +
        "  globalThis.__remindUi.h('a', { href, className, 'aria-label': rest['aria-label'], 'aria-current': rest['aria-current'] }, children);",
    ],
    ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
  ]);
  const { world, call, courseRoute, loadTs, reset: resetSessions } = made;
  const remind = await courseRoute("groups", "[groupId]", "remind");
  const groupPage = await loadTs("lib/courses/groupPage/load.ts");
  const groupsLib = await loadTs("lib/firestore/courseGroups.ts");
  const coursesLib = await loadTs("lib/firestore/courses.ts");

  const reset = (seed = remindSeed()) => resetSessions(seed);

  /** One request to the Remind route as `who`. */
  const ask = (who, body, { groupId = B, viewAs = false } = {}) =>
    call(who, remind.POST, { groupId }, { body, course: true, viewAs });

  /** The preview, as the panel asks it when it opens. */
  const preview = (who, week, uid = null) => ask(who, { week, preview: true, ...(uid ? { uid } : {}) });

  /** A press made as the panel makes one: the count the preview showed. */
  async function press(who, week, uid = null) {
    const shown = await preview(who, week, uid);
    const count = shown.body?.preview?.count ?? 0;
    return ask(who, { week, count, ...(uid ? { uid } : {}) });
  }

  /** The group's page as `viewer` reads it, on `week`. */
  async function page(viewer, viewerUid, week = null) {
    const run = coursesLib.normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const group = groupsLib.normalizeCourseGroup(B, world.db.read(`courseGroups/${B}`));
    return groupPage.loadGroupPage(world.courseDb, { run, group, viewer, viewerUid, now: new Date(), week });
  }

  /** Every email handed to the door for `uid`. */
  const mailTo = (uid) => world.mail.filter((message) => message.to === `${uid}@example.com`);

  /** The rows of a kind in the group's history. */
  const historyRows = (kind) =>
    world.db
      .paths()
      .filter((path) => path.startsWith("courseAudit/"))
      .map((path) => world.db.read(path))
      .filter((row) => row.kind === kind);

  const parts = {
    WeekWorkCard: (await loadTs("features/courses/groupPage/WeekWorkCard.tsx")).default,
    FacilitatorWeekWork: (await loadTs("features/courses/groupPage/FacilitatorWeekWork.tsx")).default,
    FacilitatorMeets: (await loadTs("features/courses/groupPage/FacilitatorMeets.tsx")).default,
  };

  return { ...made, remind, reset, ask, preview, press, page, mailTo, historyRows, groupPage, parts };
}
