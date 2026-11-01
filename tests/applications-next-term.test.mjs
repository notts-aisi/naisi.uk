/**
 * Next term: who to ask, a term's page for admins.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/next-term   the page
 *   src/lib/applications/nextTerm/rows.ts         what counts, and the rows
 *   src/lib/applications/nextTerm/load.ts         what is read, and for whom
 *
 * ## What this guards
 *
 * The page lists, one tab for each thing a note can suggest somebody for, the
 * people a saved note from the term's runs suggests, with their ratings for
 * the team this term, their answer about facilitating on this term's
 * application and one comment in the team's words. Choosing people for next
 * term is using their notes and work outside the programme they came from,
 * which the privacy policy allows only for what came after they first agreed
 * to version 13. So:
 *
 *  1. WHAT COUNTS. A note counts only when it was written after its person's
 *     moment, from one of this term's runs, with a suggestion; a rating only
 *     when it is on one of the term's runs and the answer it rates was first
 *     written after the moment. A note's own words are never shown, so
 *     nothing Claude drafted is ever given as the team's. Built from fixtures
 *     that hold every way to be left out.
 *  2. WHO IS SHOWN WHAT. An admin, and nobody else: the loader refuses a lead,
 *     a reviewer and a member before it reads anything, and nobody is ever a
 *     row on their own page. Run against a stored term.
 *  3. WHERE IT IS REACHED FROM. The term page's card, for an admin once
 *     decision day has gone out.
 *  4. IT SENDS AND WRITES NOTHING.
 *
 * Real: the builder, the loader, the readers of notes and ratings it calls,
 * `access.ts`, `courseworkUse.ts` and the term page's builder. Stubbed:
 * `server-only`, the one value `firebase-admin/firestore` supplies and the
 * Admin SDK handle. The database is in memory.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { AGI, INCUBATOR, ROUND, TAIS, roundDoc, stringsIn } from "./lib/applicationsSmallTerm.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (path) => stripSource(readFileSync(join(REPO_ROOT, path), "utf8"), { keepStrings: true });

/**
 * The page is drawn for real with the store and the session of the test in
 * hand: the tree's gate hands back `__nextTermPage.user`, the Admin SDK handle
 * is `__nextTermPage.db`, a stylesheet names each class by its own name, and
 * `notFound()` throws what the test looks for.
 */
globalThis.__nextTermPage = { h: createElement, user: null, db: null };
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__nextTermPage.db; }"],
    ["@/lib/firebase/pageGates", "export async function requireAdmissionsPage() { return globalThis.__nextTermPage.user; }"],
    ["next/navigation", "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }"],
    ["next/link", "export default ({ href, className, children }) => globalThis.__nextTermPage.h('a', { href, className }, children);"],
    ["./decisionDay.module.css", CLASS_NAMES],
    ["../decisionDay/decisionDay.module.css", CLASS_NAMES],
    ["@/features/applications/kit/kit.module.css", CLASS_NAMES],
    ["./WhoToAsk.module.css", CLASS_NAMES],
  ]),
});

const rows = await loadTs(join("lib", "applications", "nextTerm", "rows.ts"));
const words = await loadTs(join("lib", "applications", "nextTerm", "words.ts"));
const load = await loadTs(join("lib", "applications", "nextTerm", "load.ts"));
const termHome = await loadTs(join("lib", "applications", "lifecycle", "termHome.ts"));
const repo = await loadTs(join("lib", "applications", "repo.ts"));
const notesModel = await loadTs(join("lib", "memberNotes", "model.ts"));
const ratingsRecord = await loadTs(join("lib", "firestore", "courseWorkRatings.ts"));

const PAGE = "src/app/(app)/admin/admissions/forms/[roundId]/next-term/page.tsx";
const LOAD = "src/lib/applications/nextTerm/load.ts";
const ROWS = "src/lib/applications/nextTerm/rows.ts";
const SCREEN = "src/features/applications/nextTerm/WhoToAsk.tsx";

// ---------------------------------------------------------------------------
// The term: two programmes on runs, the incubator on none, and another term's run
// ---------------------------------------------------------------------------

const RUN_AGI = "run-agi";
const RUN_TAIS = "run-tais";
const RUN_OLD = "run-spring-2026";

/** Everybody's moment: when they first agreed to version 13. */
const AGREED = new Date("2026-10-01T09:00:00Z");
const BEFORE = new Date("2026-09-20T09:00:00Z");
const AFTER = (day) => new Date(`2026-11-${String(day).padStart(2, "0")}T18:00:00Z`);

const PROGRAMMES = [
  { runId: RUN_TAIS, name: "Technical AI Safety" },
  { runId: RUN_AGI, name: "AGI Strategy" },
];

/** A stored note, as `memberNotes/{id}` keeps it. */
function noteDoc(uid, { runId = RUN_AGI, at = AFTER(2), suggest = ["facilitating"], week = null, text = `A note about ${uid}`, by = "rahul", claude = false } = {}) {
  return {
    uid,
    text,
    authorUid: by,
    draftedByClaude: claude,
    runId,
    programmeLabel: "AGI Strategy, Autumn 2026",
    audience: "admins",
    suggest,
    ...(week ? { kind: "weekly", weekId: `w0${week}`, weekNumber: week } : {}),
    createdAt: at,
    updatedAt: at,
  };
}

/** A stored rating, as `courseWorkRatings/{id}` keeps it. */
function ratingDoc(uid, week, rating, comment, { runId = RUN_AGI, by = "claudia", at = AFTER(10 + week), changed = null } = {}) {
  return {
    runId,
    uid,
    weekId: `w0${week}`,
    weekNumber: week,
    itemId: `answer-w${week}`,
    rating,
    comment,
    raterUid: by,
    raterRole: by === "claudia" ? "lead" : "admin",
    programmeLabel: "AGI Strategy, Autumn 2026",
    createdAt: at,
    updatedAt: changed ?? at,
  };
}

/** The written answer a rating rates, first written at `first`. */
function answerRow(uid, week, first, { runId = RUN_AGI, kind = null } = {}) {
  return {
    runId,
    uid,
    weekId: `w0${week}`,
    exerciseId: `answer-w${week}`,
    words: 240,
    ...(kind ? { kind } : {}),
    ...(first ? { firstWrittenAt: first } : {}),
  };
}

/** An account with its moment (none when `agreed` is null) and its names. */
function account(uid, full, goBy, { role = "member", agreed = AGREED } = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: full,
    role,
    profile: { preferredName: goBy, fullName: full },
    ...(agreed ? { courseworkUseAgreedAt: agreed, policyVersion: "terms.1+privacy.15", policyAgreedAt: agreed } : { policyVersion: "terms.1+privacy.12", policyAgreedAt: BEFORE }),
  };
}

const PEOPLE = {
  zach: account("zach", "Zach Levin", "Zach", { role: "admin" }),
  rahul: account("rahul", "Rahul Mehta", "Rahul", { role: "admin" }),
  claudia: account("claudia", "Claudia Reyes", "Claudia", { role: "committee" }),
  priya: account("priya", "Priya Shah", "Pri"),
  sofia: account("sofia", "Sofia Marin", "Sofia"),
  kai: account("kai", "Kai Tanaka", "Kai"),
  dev: account("dev", "Dev Patel", "Dev"),
  omar: account("omar", "Omar Haddad", "Omar", { agreed: null }),
  lena: account("lena", "Lena Novak", "Lena"),
  nina: account("nina", "Nina Petrova", "Nina"),
  tom: account("tom", "Tom Fletcher", "Tom"),
};

const CLAUDE_WORDS = "Claude wrote this: a strong week, and a natural facilitator.";

/** Every note, by id. Each one is here for a reason its comment gives. */
const NOTES = {
  // Priya: suggested for facilitating in weeks 2 and 3, and the committee in week 2.
  "priya-w2": noteDoc("priya", { week: 2, suggest: ["facilitating", "committee"], at: AFTER(9) }),
  "priya-w3": noteDoc("priya", { week: 3, suggest: ["facilitating"], at: AFTER(16) }),
  // Sofia: one note with no week.
  "sofia-note": noteDoc("sofia", { at: AFTER(4) }),
  // Kai: an early note (before the moment) suggests facilitating and counts for nothing; a later one, an incubator.
  "kai-early": noteDoc("kai", { runId: RUN_TAIS, at: BEFORE, suggest: ["facilitating", "committee"] }),
  "kai-late": noteDoc("kai", { runId: RUN_TAIS, at: AFTER(5), suggest: ["incubator"] }),
  // Dev: a note Claude drafted and an admin saved, ticked for an incubator by that admin.
  "dev-claude": noteDoc("dev", { suggest: ["incubator"], text: CLAUDE_WORDS, claude: true }),
  // Omar never agreed to version 13: nothing about him may be used outside his programme.
  "omar-note": noteDoc("omar", { suggest: ["facilitating", "committee"] }),
  // Lena's note is from last term's run.
  "lena-old": noteDoc("lena", { runId: RUN_OLD, suggest: ["committee"] }),
  // Nina's note suggests nothing.
  "nina-plain": noteDoc("nina", { suggest: [] }),
  // The admin looking is suggested too, and is never shown it.
  "about-zach": noteDoc("zach", { suggest: ["committee"], by: "rahul" }),
  // Tom facilitates Group C and holds no place, so no seat of his names a group.
  "tom-note": noteDoc("tom", { suggest: ["committee"], by: "claudia" }),
  // Somebody whose account has gone.
  "gone-note": noteDoc("gone", { suggest: ["committee"] }),
};

/** Every rating, by id, with the row it rates. */
const RATINGS = {
  // Priya: weeks 1 to 3, each on work written after her moment. The 10 is her highest.
  "priya-w1": [ratingDoc("priya", 1, 9, "Careful reading of the brief."), answerRow("priya", 1, AFTER(3))],
  "priya-w2": [ratingDoc("priya", 2, 10, "Could teach this week."), answerRow("priya", 2, AFTER(8))],
  "priya-w3": [ratingDoc("priya", 3, 8, "Solid.", { by: "zach" }), answerRow("priya", 3, AFTER(15))],
  // Sofia: two 8s on one answer; the newer one's words are chosen.
  "sofia-w3-claudia": [ratingDoc("sofia", 3, 8, "Clearest answer in Group C.", { at: AFTER(16) }), answerRow("sofia", 3, AFTER(15))],
  "sofia-w3-rahul": [ratingDoc("sofia", 3, 8, "Sharp on the trade-offs.", { by: "rahul", at: AFTER(14), changed: AFTER(17) }), null],
  // Kai: a 10 on work written before his moment counts for nothing; a 7 on later work does.
  "kai-w1": [ratingDoc("kai", 1, 10, "EARLY WORK, NEVER QUOTED", { runId: RUN_TAIS }), answerRow("kai", 1, BEFORE, { runId: RUN_TAIS })],
  "kai-w2": [ratingDoc("kai", 2, 7, "Keeps a quiet group talking.", { runId: RUN_TAIS }), answerRow("kai", 2, AFTER(10), { runId: RUN_TAIS })],
  // Kai again: a rating whose row is gone, one on a reflection's row, and one from last term.
  "kai-w3": [ratingDoc("kai", 3, 9, "ROW GONE, NEVER QUOTED", { runId: RUN_TAIS }), "gone"],
  "kai-w4": [ratingDoc("kai", 4, 9, "A BOX, NEVER QUOTED", { runId: RUN_TAIS }), answerRow("kai", 4, AFTER(20), { runId: RUN_TAIS, kind: "reflection" })],
  "kai-old": [ratingDoc("kai", 5, 10, "LAST TERM, NEVER QUOTED", { runId: RUN_OLD }), answerRow("kai", 5, AFTER(21), { runId: RUN_OLD })],
  // Omar's work is rated, and still he is listed nowhere.
  "omar-w1": [ratingDoc("omar", 1, 10, "OMAR, NEVER QUOTED"), answerRow("omar", 1, AFTER(3))],
  // Nina is rated, and nobody suggested her: no row.
  "nina-w1": [ratingDoc("nina", 1, 10, "NINA, NEVER QUOTED"), answerRow("nina", 1, AFTER(3))],
};

const ratingId = (id) => `courseWorkRatings/${id}`;

/** The seats: Priya in Group K, Sofia in Group C, Kai facilitating Group B, Dev gone from his. */
const SEATS = {
  [`${RUN_AGI}__priya`]: { runId: RUN_AGI, uid: "priya", groupId: "agi-k", status: "active", role: "learner" },
  [`${RUN_AGI}__sofia`]: { runId: RUN_AGI, uid: "sofia", groupId: "agi-c", status: "active", role: "learner" },
  [`${RUN_TAIS}__kai`]: { runId: RUN_TAIS, uid: "kai", groupId: "tais-b", status: "active", role: "learner" },
  [`${RUN_AGI}__dev`]: { runId: RUN_AGI, uid: "dev", groupId: "agi-c", status: "withdrawn", role: "learner" },
};
const GROUPS = {
  "agi-k": { runId: RUN_AGI, name: "Group K", facilitatorUids: ["claudia"], archived: false },
  "agi-c": { runId: RUN_AGI, name: "Group C", facilitatorUids: ["tom"], archived: false },
  // A group that has gone names nobody.
  "agi-old": { runId: RUN_AGI, name: "Group Z", facilitatorUids: ["tom", "priya"], archived: true },
  "tais-b": { runId: RUN_TAIS, name: "Group B", facilitatorUids: ["kai"], archived: false },
};

/** This term's applications: Priya offered, Sofia said no, Dev was never asked. Kai joined late and sent none. */
function application(uid, wantsToFacilitate) {
  return {
    formVersion: 2,
    roundId: ROUND,
    uid,
    email: `${uid}@example.com`,
    displayName: PEOPLE[uid].displayName,
    draft: {},
    sent: { rankedProgrammeIds: [AGI], wantsToFacilitate, aboutYou: { fullName: PEOPLE[uid].displayName } },
    status: "accepted",
  };
}

function seed() {
  const round = roundDoc({ status: "settled", decisionsSentAt: new Date("2026-10-23T09:00:00Z") });
  round.programmes[AGI].runId = RUN_AGI;
  round.programmes[TAIS].runId = RUN_TAIS;
  round.programmes[INCUBATOR].runId = null;
  const docs = { [`admissionRounds/${ROUND}`]: round };
  for (const [uid, data] of Object.entries(PEOPLE)) docs[`users/${uid}`] = data;
  for (const [id, data] of Object.entries(NOTES)) docs[`memberNotes/${id}`] = data;
  for (const [id, [rating, row]] of Object.entries(RATINGS)) {
    docs[ratingId(id)] = rating;
    // `null`: the row is another rating's (Sofia's two rate one answer). "gone": nobody's.
    if (row === null || row === "gone") continue;
    docs[`courseExerciseResponses/${rating.runId}__${rating.uid}__${rating.weekId}__${rating.itemId}`] = row;
  }
  for (const [id, data] of Object.entries(SEATS)) docs[`courseEnrolments/${id}`] = data;
  for (const [id, data] of Object.entries(GROUPS)) docs[`courseGroups/${id}`] = data;
  docs[`admissionApplications/${ROUND}__priya`] = application("priya", true);
  docs[`admissionApplications/${ROUND}__sofia`] = application("sofia", false);
  docs[`admissionApplications/${ROUND}__dev`] = application("dev", null);
  return docs;
}

const session = (uid, role) => ({ uid, role, suRecognised: role !== "member", email: `${uid}@example.com`, displayName: PEOPLE[uid]?.displayName ?? uid });

async function viewAs(viewer, docs = seed()) {
  const db = makeDb(docs);
  const form = await repo.loadForm(db, ROUND);
  assert.ok(form, "the term's form loads");
  const outcome = await load.loadNextTerm(db, viewer, form);
  return { db, outcome };
}

const tabOf = (view, key) => view.tabs.find((tab) => tab.key === key);
const uidsOn = (view, key) => tabOf(view, key).rows.map((row) => row.uid);

// ---------------------------------------------------------------------------
// 1. What counts
// ---------------------------------------------------------------------------

describe("what counts: notes and rated work from after the person agreed to version 13, from this term", () => {
  test("each tab lists the people a counted note suggests for it, by name, and nobody else", async () => {
    const { outcome } = await viewAs(session("zach", "admin"));
    assert.equal(outcome.status, "ok");
    const { view } = outcome;
    assert.deepEqual(view.tabs.map((tab) => [tab.key, tab.label]), [
      ["facilitating", "Facilitating"],
      ["incubator", "An incubator"],
      ["committee", "The committee"],
    ]);
    assert.deepEqual(uidsOn(view, "facilitating"), ["priya", "sofia"]);
    assert.deepEqual(uidsOn(view, "incubator"), ["dev", "kai"]);
    assert.deepEqual(uidsOn(view, "committee"), ["priya", "tom"]);
    assert.equal(view.term, "Autumn 2026");
    assert.equal(view.roundId, ROUND);
  });

  test("a note written before its person's moment counts for nothing: Kai is not suggested for facilitating or the committee", async () => {
    const { view } = (await viewAs(session("zach", "admin"))).outcome;
    assert.ok(!uidsOn(view, "facilitating").includes("kai"));
    assert.ok(!uidsOn(view, "committee").includes("kai"));
    assert.equal(tabOf(view, "incubator").rows.find((row) => row.uid === "kai").suggestedIn, "A note");
  });

  test("nobody with no moment, no account, no suggestion, a note from another term or who is looking is listed", async () => {
    const { view } = (await viewAs(session("zach", "admin"))).outcome;
    const listed = new Set(view.tabs.flatMap((tab) => tab.rows.map((row) => row.uid)));
    for (const never of ["omar", "gone", "nina", "lena", "zach"]) assert.ok(!listed.has(never), `${never} is listed`);
  });

  test("the weeks a suggestion was made in, per tab: a note's week, or \"a note\"", async () => {
    const { view } = (await viewAs(session("zach", "admin"))).outcome;
    const priya = (key) => tabOf(view, key).rows.find((row) => row.uid === "priya");
    assert.equal(priya("facilitating").suggestedIn, "Weeks 2, 3");
    assert.equal(priya("committee").suggestedIn, "Week 2");
    assert.equal(tabOf(view, "facilitating").rows.find((row) => row.uid === "sofia").suggestedIn, "A note");
    assert.equal(words.suggestedInWords([{ weekNumber: 3 }, { weekNumber: null }]), "Week 3 and a note");
    assert.equal(words.suggestedInWords([{ weekNumber: 3 }, { weekNumber: 2 }, { weekNumber: 3 }, { weekNumber: null }, { weekNumber: null }]), "Weeks 2, 3 and 2 notes");
    assert.equal(words.suggestedInWords([{ weekNumber: null }, { weekNumber: null }]), "2 notes");
  });

  test("their ratings this term, in week order: only those on the term's runs, of work written after their moment, on a row that is a written answer", async () => {
    const { view } = (await viewAs(session("zach", "admin"))).outcome;
    const row = (uid) => view.tabs.flatMap((tab) => tab.rows).find((each) => each.uid === uid);
    assert.deepEqual(row("priya").ratings, [9, 10, 8]);
    // Sofia's second rating rates the answer her first does: both count.
    assert.deepEqual(row("sofia").ratings, [8, 8]);
    // Kai: the 10 on early work, the 9 whose row is gone, the 9 on a box and the 10 from last term are all left out.
    assert.deepEqual(row("kai").ratings, [7]);
    assert.deepEqual(row("dev").ratings, []);
    assert.equal(words.ratingsWords([]), "Not rated");
    assert.equal(words.ratingsWords([9, 10, 8]), "9, 10, 8");
  });

  test("in the team's words: the comment beside their highest counted rating, the newest on a tie, with whose it is by the name rule", async () => {
    const { view } = (await viewAs(session("zach", "admin"))).outcome;
    const row = (uid) => view.tabs.flatMap((tab) => tab.rows).find((each) => each.uid === uid);
    // An admin sees the full name, with the name they go by when it adds something.
    assert.deepEqual(row("priya").words, { text: "Could teach this week.", by: "Claudia Reyes" });
    // Two 8s: Rahul's was changed after Claudia's was given, so it is the newer.
    assert.deepEqual(row("sofia").words, { text: "Sharp on the trade-offs.", by: "Rahul Mehta" });
    // Kai's highest counted rating is the 7; the 10 on early work is never quoted.
    assert.deepEqual(row("kai").words, { text: "Keeps a quiet group talking.", by: "Claudia Reyes" });
    assert.equal(row("dev").words, null);
    // The person themselves, by the same rule: "Priya Shah (Pri)".
    assert.equal(row("priya").name, "Priya Shah (Pri)");
  });

  test("no note's words are ever in the page, and nothing Claude drafted is given as the team's", async () => {
    const { view } = (await viewAs(session("zach", "admin"))).outcome;
    const said = stringsIn(view).join(" ");
    for (const note of Object.values(NOTES)) assert.ok(!said.includes(note.text), `a note's words reached the page: ${note.text}`);
    assert.ok(!said.includes(CLAUDE_WORDS));
    // The note Claude drafted still counts for what an admin ticked on it.
    assert.ok(uidsOn(view, "incubator").includes("dev"));
    for (const never of ["EARLY WORK", "ROW GONE", "A BOX", "LAST TERM", "OMAR", "NINA"]) {
      assert.ok(!said.includes(never), `an uncounted rating's comment reached the page: ${never}`);
    }
    // Names and words only: no address, and nothing of an account or an application beside them.
    assert.doesNotMatch(said, /@example\.com/);
    const keys = new Set(view.tabs.flatMap((tab) => tab.rows.flatMap((row) => Object.keys(row))));
    assert.deepEqual([...keys].sort(), ["application", "name", "places", "ratings", "suggestedIn", "uid", "words"]);
  });

  test("on their application: this term's answer about facilitating, and no answer for somebody who sent none", async () => {
    const { view } = (await viewAs(session("zach", "admin"))).outcome;
    const row = (uid) => view.tabs.flatMap((tab) => tab.rows).find((each) => each.uid === uid);
    assert.equal(row("priya").application, "offered");
    assert.equal(row("sofia").application, "no");
    assert.equal(row("dev").application, "no-answer", "a form that did not ask has no answer");
    assert.equal(row("kai").application, "no-answer", "Kai joined late and sent no application");
  });

  test("their programme and group: the group they sit in, the one they facilitate, or that they left", async () => {
    const { view } = (await viewAs(session("zach", "admin"))).outcome;
    const row = (uid) => view.tabs.flatMap((tab) => tab.rows).find((each) => each.uid === uid);
    assert.deepEqual(row("priya").places, ["AGI Strategy · Group K"]);
    assert.deepEqual(row("sofia").places, ["AGI Strategy · Group C"]);
    assert.deepEqual(row("kai").places, ["Technical AI Safety · facilitates Group B"]);
    assert.deepEqual(row("dev").places, ["AGI Strategy · left"]);
    // Facilitating lives on the group: Tom holds no place and sits in no group, and facilitates Group C.
    assert.deepEqual(row("tom").places, ["AGI Strategy · facilitates Group C"]);
  });

  test("the builder keeps the same rules on its own, whatever it is handed", () => {
    const note = (id, uid, createdAt, suggest, runId = RUN_AGI) =>
      notesModel.normalizeMemberNote(id, { uid, text: id, authorUid: "rahul", runId, suggest, createdAt, updatedAt: createdAt });
    const rating = (id, data) => ratingsRecord.normalizeCourseWorkRating(id, data);
    const people = new Map([
      ["amy", { from: AGREED, name: "Amy" }],
      ["ben", { from: null, name: "Ben" }],
      ["zach", { from: AGREED, name: "Zach" }],
    ]);
    const ratings = [
      rating("r1", ratingDoc("amy", 1, 6, "Six.")),
      rating("r2", ratingDoc("amy", 2, 6, "Six again, newer.", { at: AFTER(20) })),
      rating("r3", ratingDoc("amy", 3, 9, "Nine, on early work.")),
    ];
    const ratedRows = new Map([
      [rows.ratedRowId(ratings[0]), answerRow("amy", 1, AFTER(2))],
      [rows.ratedRowId(ratings[1]), answerRow("amy", 2, AFTER(9))],
      [rows.ratedRowId(ratings[2]), answerRow("amy", 3, AGREED)],
    ]);
    const view = rows.buildNextTerm({
      roundId: ROUND,
      term: "Autumn 2026",
      viewerUid: "zach",
      programmes: PROGRAMMES,
      notes: [
        note("a1", "amy", AFTER(3), ["committee"]),
        note("a2", "amy", AGREED, ["facilitating"]),
        note("b1", "ben", AFTER(3), ["committee"]),
        note("z1", "zach", AFTER(3), ["committee"]),
      ],
      people,
      ratings,
      ratedRows,
      raterNames: new Map([["claudia", "Claudia Reyes"]]),
      seats: [],
      facilitating: new Map(),
    });
    // A note written in the very instant of the moment is not known to have come after it.
    assert.deepEqual(uidsOn(view, "facilitating"), []);
    assert.deepEqual(uidsOn(view, "committee"), ["amy"]);
    const amy = tabOf(view, "committee").rows[0];
    // An answer first written in the very instant of the moment does not count either.
    assert.deepEqual(amy.ratings, [6, 6]);
    assert.deepEqual(amy.words, { text: "Six again, newer.", by: "Claudia Reyes" });
    // No seat on the term's runs: the programme the note came from.
    assert.deepEqual(amy.places, ["AGI Strategy"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Who is shown what
// ---------------------------------------------------------------------------

describe("who is shown what: an admin, never about themselves, and nobody else reads anything", () => {
  for (const [who, role] of [
    ["claudia", "committee"],
    ["priya", "member"],
  ]) {
    test(`${who} (${role}) is answered that the page is an admin's, before anything is read`, async () => {
      const db = makeDb(seed());
      const form = await repo.loadForm(db, ROUND);
      const before = db.stats.reads;
      const outcome = await load.loadNextTerm(db, session(who, role), form);
      assert.deepEqual(outcome, { status: "admins-only" });
      assert.equal(db.stats.reads, before, "the loader read something for somebody who does not run the term");
    });
  }

  test("an admin suggested by another admin's note is never a row on their own page, and the other admin sees them", async () => {
    const mine = (await viewAs(session("zach", "admin"))).outcome.view;
    assert.ok(!uidsOn(mine, "committee").includes("zach"));
    const theirs = (await viewAs(session("rahul", "admin"))).outcome.view;
    assert.ok(uidsOn(theirs, "committee").includes("zach"));
  });

  test("nobody whose notes all came before their moment is read any further: no rating, seat or application of theirs", async () => {
    const docs = seed();
    const db = makeDb(docs);
    const seen = [];
    const getAll = db.getAll.bind(db);
    db.getAll = async (...refs) => {
      seen.push(...refs.map((ref) => ref.path));
      return getAll(...refs);
    };
    const collection = db.collection.bind(db);
    const asked = [];
    db.collection = (path) => {
      const handle = collection(path);
      const where = handle.where;
      return { ...handle, where: (field, op, value) => (asked.push([path, field, op, value]), where(field, op, value)) };
    };
    const form = await repo.loadForm(db, ROUND);
    await load.loadNextTerm(db, session("zach", "admin"), form);
    const ratingsAsked = asked.filter(([path]) => path === "courseWorkRatings").flatMap(([, , , value]) => value);
    assert.deepEqual([...ratingsAsked].sort(), ["dev", "kai", "priya", "sofia", "tom"]);
    for (const never of ["omar", "nina", "lena", "zach"]) {
      assert.ok(!seen.some((path) => path.endsWith(`__${never}`)), `${never}'s seat or application was read`);
    }
    // The notes are read by the term's runs, with one `in`.
    assert.deepEqual(
      asked.filter(([path]) => path === "memberNotes").map(([, field, op, value]) => [field, op, [...value].sort()]),
      [["runId", "in", [RUN_AGI, RUN_TAIS].sort()]],
    );
    // Each run's groups, by one equality: who facilitates which, and their names.
    assert.deepEqual(
      asked.filter(([path]) => path === "courseGroups").map(([, field, op, value]) => [field, op, value]).sort(),
      [["runId", "==", RUN_AGI], ["runId", "==", RUN_TAIS]],
    );
  });

  test("a term whose programmes name no run lists nobody, and reads no note", async () => {
    const docs = seed();
    const round = docs[`admissionRounds/${ROUND}`];
    for (const id of Object.keys(round.programmes)) round.programmes[id].runId = null;
    const { db, outcome } = await viewAs(session("zach", "admin"), docs);
    assert.deepEqual(outcome.view.tabs.map((tab) => tab.rows.length), [0, 0, 0]);
    assert.equal(db.stats.writes.length, 0);
  });

  test("the page asks its gates in the pooled applicants page's order, and the loader asks again before its first read", () => {
    const page = code(PAGE);
    const order = [
      "requireAdmissionsPage()",
      "const form = await loadForm(db, roundId);",
      "if (!form || !canSeeForm(user, form)) notFound();",
      "if (!canRunTerm(user)) {",
      "const loaded = await loadNextTerm(db, user, form);",
    ];
    let at = -1;
    for (const step of order) {
      const next = page.indexOf(step);
      assert.ok(next > at, `the page no longer does this in order: ${step}`);
      at = next;
    }
    const loader = code(LOAD);
    const body = loader.slice(loader.indexOf("export async function loadNextTerm("));
    const gate = body.indexOf('if (!canRunTerm(viewer)) return { status: "admins-only" };');
    assert.ok(gate !== -1, "the loader no longer asks canRunTerm");
    for (const read of ["listNotesFromRuns(", "readAccounts(", "readRatingsAbout(", "readSeats(", "readFacilitating(", "readRatedRows("]) {
      assert.ok(body.indexOf(read) > gate, `${read} is asked before the gate`);
    }
  });

  test("of a written answer a rating rates, the loader keeps when it was first written and never a word", () => {
    const loader = code(LOAD);
    const reader = loader.slice(loader.indexOf("async function readRatedRows("), loader.indexOf("async function readFacilitating("));
    assert.match(reader, /if \(snap\.exists && !isOwnBoxResponse\(data\)\) out\.set\(snap\.id, \{ firstWrittenAt: data\.firstWrittenAt \}\);/);
    assert.equal((loader.match(/collection\("courseExerciseResponses"\)/g) ?? []).length, 1, "the loader reads the answers store somewhere else");
  });

  test("the browser is handed the view and nothing else: no account, note, rating or application whole", () => {
    const page = code(PAGE);
    assert.match(page, /<WhoToAsk view=\{loaded\.view\} \/>/);
    assert.equal((page.match(/<WhoToAsk\b/g) ?? []).length, 1);
    const screen = code(SCREEN);
    assert.match(screen, /^"use client";/);
    // Types only from the server's modules: nothing that reads.
    assert.doesNotMatch(screen, /from "@\/lib\/applications\/nextTerm\/load"/);
    assert.match(screen, /import type \{ NextTermRow, NextTermTab, NextTermView \} from "@\/lib\/applications\/nextTerm\/rows";/);
  });
});

// ---------------------------------------------------------------------------
// 2b. The page, drawn
// ---------------------------------------------------------------------------

const { default: NextTermPage } = await loadTs(join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "next-term", "page.tsx"));

/** The page's words, as somebody reads them. */
const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function pageAs(user, roundId = ROUND) {
  globalThis.__nextTermPage.user = user;
  globalThis.__nextTermPage.db = makeDb(seed());
  try {
    return renderToStaticMarkup(await NextTermPage({ params: Promise.resolve({ roundId }) }));
  } finally {
    globalThis.__nextTermPage.user = null;
    globalThis.__nextTermPage.db = null;
  }
}

describe("the page, drawn as each kind of person the admissions tree lets in", () => {
  test("an admin: the title, the three tabs with their counts, Facilitating's people with their rows, the box unticked, and no other list", async () => {
    const html = await pageAs(session("zach", "admin"));
    const text = textOf(html);
    for (const words of [
      "Next term: who to ask",
      "Admins only",
      "Autumn 2026. Everyone a saved note from this term suggests for next term",
      "Facilitating 2",
      "An incubator 2",
      "The committee 2",
      "Only people who offered to facilitate",
      "Person Programme and group Suggested in Team ratings On their application In the team’s words",
      "Priya Shah (Pri) AGI Strategy · Group K Weeks 2, 3 9, 10, 8 Offered “Could teach this week.” (Claudia Reyes)",
      "Sofia Marin AGI Strategy · Group C A note 8, 8 No “Sharp on the trade-offs.” (Rahul Mehta)",
      "There is no “not suggested” list",
    ]) {
      assert.ok(text.includes(words), `the page does not say: ${words}`);
    }
    // The box starts unticked, and Sofia, who said no, is on the list until somebody ticks it.
    assert.match(html, /<input type="checkbox"[^>]*\/>/);
    assert.doesNotMatch(html, /<input type="checkbox"[^>]*checked/);
    // Each name leads to that person's page, where their notes are.
    assert.ok(html.includes('href="/admin/members/priya"'));
    // The tabs and the box are dead until the page's script runs: a press before then would do nothing and say nothing.
    assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 3);
    // Only the tab showing draws its people.
    assert.ok(!text.includes("Kai Tanaka"), "another tab's people are drawn");
  });

  test("a lead or a reviewer on the form is told the page is an admin's, and nothing about anybody is read or drawn", async () => {
    const lead = session("claudia", "committee");
    lead.admissionsReviewer = true;
    // Claudia leads AGI Strategy on the small term's form.
    const html = await pageAs(lead);
    const text = textOf(html);
    assert.ok(text.includes("This page is for admins"));
    assert.ok(text.includes(words.NEXT_TERM_WORDS.adminsOnly));
    for (const never of ["Priya", "Sofia", "Kai", "Dev", "Facilitating"]) assert.ok(!text.includes(never), `a lead is shown ${never}`);
  });

  test("somebody with no role on the form, and a form that is not there, are not found", async () => {
    await assert.rejects(() => pageAs(session("priya", "member")), /NEXT_NOT_FOUND/);
    await assert.rejects(() => pageAs(session("zach", "admin"), "no-such-term"), /NEXT_NOT_FOUND/);
  });
});

// ---------------------------------------------------------------------------
// 3. Where it is reached from
// ---------------------------------------------------------------------------

describe("the term page leads to it, for an admin once decision day has gone out", () => {
  const HOME = `/admin/admissions/forms/${ROUND}`;
  const home = (over) =>
    termHome.buildTermHome({
      stage: "decided",
      canRunTerm: true,
      home: HOME,
      decisionsDay: "Fri 23 Oct",
      programmes: [],
      work: {},
      pool: { pooled: 0, needsOutcome: 0 },
      ...over,
    });

  test("the card, with no number on it", () => {
    for (const stage of ["decided", "settled", "archived"]) {
      assert.deepEqual(home({ stage }).nextTerm, {
        title: "Next term: who to ask",
        chip: "Admins only",
        line: words.NEXT_TERM_WORDS.card.line,
        link: { label: "See who to ask", href: `${HOME}/next-term` },
      }, stage);
    }
  });

  test("not before decision day, when nobody is on the term's runs yet, and never for somebody who does not run the term", () => {
    for (const stage of ["draft", "opens-later", "open", "deciding", "cancelled"]) {
      assert.equal(home({ stage }).nextTerm, null, stage);
    }
    for (const stage of ["decided", "settled", "archived"]) {
      assert.equal(home({ stage, canRunTerm: false, pool: null }).nextTerm, null, stage);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. It sends and writes nothing
// ---------------------------------------------------------------------------

describe("it sends nothing and writes nothing", () => {
  test("a whole read as an admin writes nothing", async () => {
    const { db } = await viewAs(session("zach", "admin"));
    assert.deepEqual(db.stats.writes, []);
  });

  test("no file of it writes, sends or asks Claude", () => {
    for (const file of [PAGE, LOAD, ROWS, SCREEN, "src/lib/applications/nextTerm/words.ts"]) {
      const source = code(file);
      // A Map's own `set` is not a write: what is refused is the database's.
      assert.doesNotMatch(source, /runTransaction|\.batch\(|FieldValue|\.update\(|\.create\(|\.delete\(|\.add\(|\.doc\([^)]*\)\.set\(/, `${file} writes`);
      assert.doesNotMatch(source, /sendEmail|sendNotice|notify|askClaude|claudeConfigured|fetch\(/, `${file} sends`);
    }
  });

  test("no control offers what does not exist yet: nothing on the page adds anybody to a list for next term", () => {
    for (const file of [SCREEN, "src/lib/applications/nextTerm/words.ts"]) {
      assert.doesNotMatch(code(file), /spring|add to|asks\b/i, `${file} offers to add somebody to next term's asks, which nothing holds yet`);
    }
    assert.equal((code(SCREEN).match(/<button\b/g) ?? []).length, 1, "the tabs are the page's only buttons");
  });
});
