/**
 * A first review is blind, and what makes it one is not a lead's to switch.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET   /api/admissions/forms/[roundId]/applications/[uid]                      one application, for review
 *   PUT   /api/admissions/forms/[roundId]/applications/[uid]/review               the caller's own review
 *   GET   /api/admissions/forms/[roundId]/programmes/[programmeId]/applications   a programme's list
 *   GET, PATCH /api/admissions/forms/[roundId]/programmes/[programmeId]           a programme's settings
 *
 * ## The rules this guards
 *
 * A lead or a reviewer who is not an admin is shown what anybody else gave or
 * wrote about an application only once they have saved a review of their own
 * for it (`firstReviewOf` in `src/lib/applications/scoring.ts`):
 *
 *  - WHERE THERE IS SOMETHING FOR THEM TO SCORE, that is every one of those
 *    scores.
 *  - WHERE THERE IS NOTHING FOR THEM TO SCORE, it is an overall comment of
 *    their own. A programme with scores switched off, a stream with no scored
 *    question and an applicant who left every scored question blank are all
 *    "nothing to score", and none of them is a review.
 *  - IT IS ONE ANSWER FOR THE APPLICATION, across every programme on it that
 *    the person reviews. So it is the same whichever of those programmes the
 *    application is opened under.
 *  - WHILE ANYTHING IS HELD BACK, THE SCREEN SAYS WHAT IS LEFT TO DO.
 *
 * And because scores decide what a review of a programme is:
 *
 *  - ONCE REVIEWING HAS BEGUN ON A PROGRAMME, SWITCHING ITS SCORES ON OR OFF
 *    IS AN ADMIN'S, as closing it is. Its lead is refused with a sentence,
 *    and the settings page shows them the switch switched off with the same
 *    reason. The question is asked again inside the transaction that writes.
 *
 * Real: every handler, the loaders, builders and writers, `access.ts`, the
 * eligibility bar and the contract's pure functions. Faked: `next/server`,
 * the sentinels `firebase-admin/firestore` supplies, the view-as guard, the
 * session, and the Admin SDK handle, which is `tests/lib/applicationsStore.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  INCUBATOR,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  applicationDoc,
  applicationPath,
  roundDoc,
  seedTerm,
  stringsIn,
} from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const world = { db: null, user: null };
globalThis.__blindFirst = world;

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "next/server",
    "export class NextResponse {\n" +
      "  constructor(body, init) {\n" +
      "    this.body = body;\n" +
      "    this.status = (init && init.status) || 200;\n" +
      "  }\n" +
      "  static json(body, init) { return new NextResponse(body, init); }\n" +
      "}",
  ],
  ["firebase-admin/firestore", FIELD_VALUE_STUB],
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__blindFirst.db;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__blindFirst.user;\n}"],
  ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() {\n  return null;\n}"],
]);
const { loadTs } = createLoader({ stubs: STUBS });
const FORMS = join("app", "api", "admissions", "forms", "[roundId]");
const reviewRoute = await loadTs(join(FORMS, "applications", "[uid]", "route.ts"));
const saveRoute = await loadTs(join(FORMS, "applications", "[uid]", "review", "route.ts"));
const listRoute = await loadTs(join(FORMS, "programmes", "[programmeId]", "applications", "route.ts"));
const settingsRoute = await loadTs(join(FORMS, "programmes", "[programmeId]", "route.ts"));
const words = await loadTs(join("features", "applications", "review", "otherReviewsWords.ts"));
const lock = await loadTs(join("lib", "applications", "editor", "lock.ts"));

const AT = new Date("2026-10-19T09:00:00+01:00");

// ---------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------

/**
 * One reviewer's row about one applicant. `comments` is [answer key, text]
 * pairs and `notes` is the overall comment, as it is stored.
 */
const reviewOf = (applicantUid, reviewerUid, { scores = {}, comments = [], notes = "" } = {}) => ({
  [`admissionReviews/${ROUND}__${applicantUid}__${reviewerUid}`]: {
    roundId: ROUND,
    applicantUid,
    reviewerUid,
    scores,
    total: Object.values(scores).reduce((sum, value) => sum + value, 0),
    comments: comments.map(([questionKey, text], at) => ({ id: `c${at}`, questionKey, text, createdAt: AT, updatedAt: AT })),
    notes,
    createdAt: AT,
    updatedAt: AT,
  },
});

/** What Lloyd, who reviews AGI Strategy, wrote about Amara. */
const LLOYDS = ["Clear about why this term.", "Argued from one side only.", "A bit general."];
const LLOYD_ON_AMARA = reviewOf("amara", "lloyd", {
  scores: { [`${AGI}.event`]: 3 },
  comments: [
    ["fellowships.why", LLOYDS[0]],
    [`${AGI}.event`, LLOYDS[1]],
  ],
  notes: LLOYDS[2],
});

function term({ round = {}, over = {} } = {}) {
  world.db = makeDb(seedTerm({ round, over }), { now: WHILE_DECIDING });
  return world.db;
}
const as = (uid) => {
  world.user = CAST[uid];
};
const request = (method, body, query = "") =>
  new Request(`http://naisi.invalid/api${query}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (more) => ({ params: Promise.resolve({ roundId: ROUND, ...more }) });
/** One application, as `who` is sent it, opened under `programmeId`. */
async function open(who, uid, programmeId) {
  as(who);
  const response = await reviewRoute.GET(request("GET", undefined, `?programme=${programmeId}`), params({ uid }));
  assert.equal(response.status, 200, `${who} opens ${uid} under ${programmeId}: ${JSON.stringify(response.body)}`);
  return response.body.review;
}
async function save(who, uid, body) {
  as(who);
  return saveRoute.PUT(request("PUT", body), params({ uid }));
}
async function switchScores(who, programmeId, useScores) {
  as(who);
  return settingsRoute.PATCH(request("PATCH", { useScores }), params({ programmeId }));
}
const usesScores = (programmeId) => world.db.read(`admissionRounds/${ROUND}`).programmes[programmeId].useScores;
/** Which of these texts a payload carries, anywhere in it. */
const textsIn = (payload, texts) => {
  const strings = stringsIn(payload);
  return texts.filter((text) => strings.includes(text));
};

// ---------------------------------------------------------------------------
// Scores are not a lead's to switch once reviewing has begun
// ---------------------------------------------------------------------------

describe("a programme's scores are an admin's to switch once reviewing has begun on it", () => {
  const HELD = lock.scoresHeldSentence("AGI Strategy");

  test("the sentence says why, and who can", () => {
    assert.equal(HELD, "Reviewing has started on AGI Strategy, so only an admin can switch its scores on or off now.");
  });

  test("its lead is refused, either way round, and nothing is written", async () => {
    const db = term({ over: LLOYD_ON_AMARA });
    const off = await switchScores("claudia", AGI, false);
    assert.deepEqual([off.status, off.body], [403, { error: HELD }]);
    assert.equal(usesScores(AGI), true);
    assert.deepEqual(db.stats.writes, []);

    // Off already, and reviewing has begun: switching them on is held too.
    term({ over: { ...LLOYD_ON_AMARA, [`admissionRounds/${ROUND}`]: withScores(AGI, false) } });
    const on = await switchScores("claudia", AGI, true);
    assert.deepEqual([on.status, on.body], [403, { error: HELD }]);
    assert.equal(usesScores(AGI), false);
  });

  test("an admin can, as an admin can close a programme", async () => {
    term({ over: LLOYD_ON_AMARA });
    assert.equal((await switchScores("zach", AGI, false)).status, 200);
    assert.equal(usesScores(AGI), false);
    assert.equal((await switchScores("zach", AGI, true)).status, 200);
    assert.equal(usesScores(AGI), true);
  });

  test("before anybody has reviewed, the switch is the lead's", async () => {
    term();
    assert.equal((await switchScores("claudia", AGI, false)).status, 200);
    assert.equal(usesScores(AGI), false);
  });

  test("a review of somebody who is not on the programme's list is not reviewing of it", async () => {
    // Nina ranked Technical AI Safety alone, and Tess has scored her for it.
    const over = {
      [applicationPath("nina")]: applicationDoc("nina", [TAIS]),
      ...reviewOf("nina", "tess", { scores: { [`${TAIS}.built`]: 4 } }),
    };
    term({ over });
    assert.equal((await switchScores("claudia", AGI, false)).status, 200, "nobody has reviewed for AGI Strategy");
    term({ over });
    const held = await switchScores("tess", TAIS, false);
    assert.deepEqual([held.status, held.body], [403, { error: lock.scoresHeldSentence("Technical AI Safety") }]);
  });

  test("any review that says something counts, and a row that says nothing does not", async () => {
    const SAYS_SOMETHING = [
      ["a score", { scores: { [`${AGI}.event`]: 2 } }],
      ["a comment on an answer", { comments: [["fellowships.why", "Short."]] }],
      ["an overall comment", { notes: "Short." }],
    ];
    for (const [what, row] of SAYS_SOMETHING) {
      term({ over: reviewOf("dev", "lloyd", row) });
      assert.equal((await switchScores("claudia", AGI, false)).status, 403, what);
    }
    for (const [what, row] of [["an empty row", {}], ["an overall comment of spaces", { notes: "   " }]]) {
      term({ over: reviewOf("dev", "lloyd", row) });
      assert.equal((await switchScores("claudia", AGI, false)).status, 200, what);
    }
  });

  test("the lead still changes everything else, and sending the same position is not a switch", async () => {
    const db = term({ over: LLOYD_ON_AMARA });
    as("claudia");
    const pitch = await settingsRoute.PATCH(request("PATCH", { pitch: "Six weeks on what could go wrong." }), params({ programmeId: AGI }));
    assert.equal(pitch.status, 200);
    assert.equal(db.read(`admissionRounds/${ROUND}`).programmes[AGI].pitch, "Six weeks on what could go wrong.");
    assert.equal((await switchScores("claudia", AGI, true)).status, 200, "they are on, and stay on");
  });

  test("a review saved while the switch is being made is seen: the question is asked inside the transaction", async () => {
    const db = term();
    // Nobody has reviewed when the lead presses. As the write is about to
    // land, Lloyd's first review of Amara is saved.
    db.beforeCommit = () => {
      for (const [path, doc] of Object.entries(LLOYD_ON_AMARA)) db.seed(path, doc);
    };
    const response = await switchScores("claudia", AGI, false);
    assert.deepEqual([response.status, response.body], [403, { error: HELD }]);
    assert.equal(usesScores(AGI), true);
  });

  test("so is an application sent again while it is being made: the applications are read inside the transaction too", async () => {
    // Tess has scored Nina, who ranked Technical AI Safety alone, so nothing
    // on AGI Strategy's list has been reviewed when its lead presses. As the
    // write is about to land, Nina sends her application again with AGI
    // Strategy on it.
    const over = {
      [applicationPath("nina")]: applicationDoc("nina", [TAIS]),
      ...reviewOf("nina", "tess", { scores: { [`${TAIS}.built`]: 4 } }),
    };
    term({ over });
    assert.equal((await switchScores("claudia", AGI, false)).status, 200, "with nothing sent again, the switch is hers");

    const db = term({ over });
    db.beforeCommit = () => db.seed(applicationPath("nina"), applicationDoc("nina", [TAIS, AGI]));
    const response = await switchScores("claudia", AGI, false);
    assert.deepEqual([response.status, response.body], [403, { error: HELD }]);
    assert.equal(usesScores(AGI), true);
  });

  test("the settings page is told, so the lead is shown the switch switched off with the reason", async () => {
    const view = async (who) => {
      as(who);
      return (await settingsRoute.GET(request("GET"), params({ programmeId: AGI }))).body.programme;
    };
    term();
    assert.equal((await view("claudia")).scoresHeldSentence, null);
    term({ over: LLOYD_ON_AMARA });
    assert.equal((await view("claudia")).scoresHeldSentence, HELD);
    assert.equal((await view("zach")).scoresHeldSentence, null, "an admin is never held");

    const page = readFileSync(join(REPO_ROOT, "src", "features", "applications", "editor", "ProgrammeSetup.tsx"), "utf8");
    assert.ok(page.includes("disabled={view.scoresHeldSentence !== null}"), "the switch is off for somebody who is held");
    assert.ok(page.includes("${view.scoresHeldSentence}`"), "and the reason is beside it");
  });
});

function withScores(programmeId, useScores) {
  const doc = roundDoc();
  doc.programmes[programmeId].useScores = useScores;
  return doc;
}

// ---------------------------------------------------------------------------
// Nothing to score is not a review
// ---------------------------------------------------------------------------

describe("on a programme with nothing to score, a first review is the reviewer's own overall comment", () => {
  /** AGI Strategy with its scores off, and Lloyd's review of Amara already there. */
  const scoresOff = () => term({ over: { ...LLOYD_ON_AMARA, [`admissionRounds/${ROUND}`]: withScores(AGI, false) } });

  test("its lead is shown nothing of anybody else's until she has saved one", async () => {
    scoresOff();
    const seen = await open("claudia", "amara", AGI);
    assert.deepEqual(seen.review.scorableKeys, [], "there is nothing for her to score");
    assert.deepEqual(seen.review.others, { count: 1, hidden: 1, until: { needs: "overall-comment" }, visible: [] });
    assert.deepEqual(seen.review.comments, []);
    assert.deepEqual(textsIn(seen, LLOYDS), []);
  });

  test("a comment on an answer is not it, and an overall comment is", async () => {
    scoresOff();
    const commented = await save("claudia", "amara", { programmeId: AGI, comments: [{ op: "add", key: "fellowships.why", text: "Mine." }] });
    assert.equal(commented.status, 200);
    assert.deepEqual(textsIn(commented.body.review, LLOYDS), []);
    assert.equal(commented.body.review.review.others.hidden, 1);

    const said = await save("claudia", "amara", { programmeId: AGI, overallComment: "Reads as rehearsed." });
    assert.equal(said.status, 200);
    const after = said.body.review.review;
    assert.deepEqual([after.others.hidden, after.others.until], [0, null]);
    assert.deepEqual(after.others.visible, [{ reviewerUid: "lloyd", name: "Lloyd", score: null, overallComment: LLOYDS[2] }]);
    assert.deepEqual(textsIn(said.body.review, LLOYDS).sort(), [...LLOYDS].sort());

    // Taken back, it is a first review again.
    const cleared = await save("claudia", "amara", { programmeId: AGI, overallComment: "" });
    assert.deepEqual(textsIn(cleared.body.review, LLOYDS), []);
  });

  test("switching scores off does not show anybody anything: the same payload, but for the scores themselves", async () => {
    // Scores on: Claudia has scored nothing for Amara, so everything is held.
    term({ over: LLOYD_ON_AMARA });
    const withScoresOn = await open("claudia", "amara", AGI);
    assert.deepEqual(textsIn(withScoresOn, LLOYDS), []);
    assert.deepEqual(withScoresOn.review.others.until, { needs: "scores", here: true, elsewhere: [] });

    // An admin switches them off. She is shown no more than she was.
    assert.equal((await switchScores("zach", AGI, false)).status, 200);
    const withScoresOff = await open("claudia", "amara", AGI);
    assert.deepEqual(textsIn(withScoresOff, LLOYDS), []);
    assert.deepEqual([withScoresOff.review.others.hidden, withScoresOff.review.others.visible], [1, []]);
    assert.deepEqual(withScoresOff.review.comments, withScoresOn.review.comments);
  });

  test("the screen's line says what is left to do, in each case", () => {
    assert.deepEqual(words.hiddenReviewsLine({ needs: "overall-comment" }), {
      wide: "Hidden until you save an overall comment of your own. An admin can turn them on.",
      narrow: "Hidden until you save an overall comment.",
    });
    assert.deepEqual(words.hiddenReviewsLine({ needs: "scores", here: false, elsewhere: ["Technical AI Safety"] }), {
      wide: "Hidden until you have scored their answers for Technical AI Safety too. An admin can turn them on.",
      narrow: "Hidden until you score Technical AI Safety too.",
    });
    // Answers still to score on the programme it is open under: the design's own sentence.
    for (const here of [{ needs: "scores", here: true, elsewhere: [] }, { needs: "scores", here: true, elsewhere: ["Technical AI Safety"] }]) {
      assert.deepEqual(words.hiddenReviewsLine(here), {
        wide: "Hidden on a first review. An admin can turn them on.",
        narrow: "Hidden. An admin can turn them on.",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// One answer for the application, whichever programme it is opened under
// ---------------------------------------------------------------------------

describe("what a reviewer is shown does not depend on which of their programmes the application is opened under", () => {
  /**
   * Tess leads Technical AI Safety, which scores, and the incubator, which
   * does not. Nina ranked both. Lloyd, named on both for this term, has
   * reviewed her.
   */
  const LLOYD_ON_NINA = ["Specific about the reading.", "A real project.", "Would take her."];
  const both = () => {
    const doc = roundDoc();
    doc.programmes[TAIS].reviewerUids = ["lloyd"];
    doc.programmes[INCUBATOR].reviewerUids = ["lloyd"];
    return term({
      over: {
        [`admissionRounds/${ROUND}`]: doc,
        [applicationPath("nina")]: applicationDoc("nina", [TAIS, INCUBATOR]),
        ...reviewOf("nina", "lloyd", {
          scores: { [`${TAIS}.built`]: 4 },
          comments: [
            ["fellowships.why", LLOYD_ON_NINA[0]],
            [`${TAIS}.built`, LLOYD_ON_NINA[1]],
          ],
          notes: LLOYD_ON_NINA[2],
        }),
      },
    });
  };

  test("before she has scored, neither way in shows her anything of his", async () => {
    both();
    const underScored = await open("tess", "nina", TAIS);
    const underUnscored = await open("tess", "nina", INCUBATOR);
    assert.deepEqual(textsIn(underScored, LLOYD_ON_NINA), []);
    assert.deepEqual(textsIn(underUnscored, LLOYD_ON_NINA), []);
    assert.deepEqual(underScored.review.others, { count: 1, hidden: 1, until: { needs: "scores", here: true, elsewhere: [] }, visible: [] });
    assert.deepEqual(underUnscored.review.others, {
      count: 1,
      hidden: 1,
      until: { needs: "scores", here: false, elsewhere: ["Technical AI Safety"] },
      visible: [],
    });
  });

  test("an overall comment does not stand in for scores she still has to give", async () => {
    both();
    const said = await save("tess", "nina", { programmeId: INCUBATOR, overallComment: "Mine, before his." });
    assert.equal(said.status, 200);
    assert.deepEqual(textsIn(said.body.review, LLOYD_ON_NINA), []);
    assert.deepEqual(textsIn(await open("tess", "nina", TAIS), LLOYD_ON_NINA), []);
  });

  test("once she has scored, both ways in show her all of it", async () => {
    both();
    const scored = await save("tess", "nina", { programmeId: TAIS, scores: { [`${TAIS}.built`]: 5 } });
    assert.equal(scored.status, 200);
    for (const programmeId of [TAIS, INCUBATOR]) {
      const seen = await open("tess", "nina", programmeId);
      assert.deepEqual(textsIn(seen, LLOYD_ON_NINA).sort(), [...LLOYD_ON_NINA].sort(), programmeId);
      assert.deepEqual([seen.review.others.hidden, seen.review.others.until], [0, null], programmeId);
    }
  });

  test("the list's score column waits for the same thing", async () => {
    both();
    const rowFor = async () => {
      as("tess");
      const response = await listRoute.GET(request("GET"), params({ programmeId: TAIS }));
      return response.body.board.rows.find((row) => row.uid === "nina");
    };
    assert.equal((await rowFor()).score, null);
    await save("tess", "nina", { programmeId: TAIS, scores: { [`${TAIS}.built`]: 5 } });
    assert.equal((await rowFor()).score, "4.5");
  });
});

// ---------------------------------------------------------------------------
// Whoever has saved nothing is shown nothing, everywhere
// ---------------------------------------------------------------------------

describe("nobody who has saved no review of their own is shown anybody else's, on any programme", () => {
  /** What Yusuf, named on every programme for this term, wrote about each applicant. */
  const YUSUFS = (uid) => [`Yusuf's comment on ${uid}.`, `Yusuf's overall comment on ${uid}.`];
  /**
   * A term with every kind of "nothing to score" in it: a programme with
   * scores off (the incubator), an applicant who left the scored question
   * blank (Dev), somebody who ranked only the unscored programme (Zach, the
   * admin, who has applied), and somebody who joined AGI Strategy by
   * accepting an invitation (Nina). Lloyd and Yusuf are named on all three
   * programmes, and Yusuf has reviewed everybody.
   */
  const APPLIED = ["amara", "dev", "wen", "zach", "nina"];
  const everyKind = (rows = {}) => {
    const doc = roundDoc();
    for (const programmeId of [TAIS, AGI, INCUBATOR]) doc.programmes[programmeId].reviewerUids = ["lloyd", "yusuf"];
    const dev = applicationDoc("dev", [AGI]);
    dev.sent = { ...dev.sent, answers: { ...dev.sent.answers, [AGI]: {} } };
    const over = {
      [`admissionRounds/${ROUND}`]: doc,
      [applicationPath("dev")]: dev,
      [applicationPath("zach")]: applicationDoc("zach", [INCUBATOR]),
      [applicationPath("nina")]: {
        ...applicationDoc("nina", [TAIS]),
        status: "accepted",
        result: { kind: "invited", programmeId: AGI, publishedAt: AT, email: "sent", emailedAt: AT, emailClaimedAt: null },
        invitation: { programmeId: AGI, replyBy: "2026-10-25", response: "accepted", respondedAt: AT, lastReminderOn: null },
      },
      ...rows,
    };
    for (const uid of APPLIED) {
      const [comment, overall] = YUSUFS(uid);
      // On the "why are you interested" answer, which every application has.
      Object.assign(over, reviewOf(uid, "yusuf", { comments: [["about-you.motivation", comment]], notes: overall }));
    }
    return term({ over });
  };
  /** Every way each of the three can open an application: [who, applicant, programme]. */
  const WAYS_IN = [
    ["claudia", "amara", AGI],
    ["claudia", "dev", AGI],
    ["claudia", "wen", AGI],
    ["claudia", "nina", AGI],
    ["tess", "amara", TAIS],
    ["tess", "wen", TAIS],
    ["tess", "nina", TAIS],
    ["tess", "zach", INCUBATOR],
    ["lloyd", "amara", AGI],
    ["lloyd", "amara", TAIS],
    ["lloyd", "dev", AGI],
    ["lloyd", "wen", AGI],
    ["lloyd", "wen", TAIS],
    ["lloyd", "nina", TAIS],
    ["lloyd", "nina", AGI],
    ["lloyd", "zach", INCUBATOR],
  ];

  test("with no row of their own: nothing, whatever there is or is not to score", async () => {
    everyKind();
    for (const [who, uid, programmeId] of WAYS_IN) {
      const seen = await open(who, uid, programmeId);
      const way = `${who} reading ${uid} under ${programmeId}`;
      assert.deepEqual(textsIn(seen, YUSUFS(uid)), [], way);
      assert.deepEqual(seen.review.others.visible, [], way);
      assert.deepEqual([seen.review.others.count, seen.review.others.hidden], [1, 1], `${way}: his review is counted, and held`);
      assert.notEqual(seen.review.others.until, null, `${way}: and the payload says what is left to do`);
    }
  });

  test("with a row of their own that says nothing: still nothing", async () => {
    const empty = {};
    for (const who of ["claudia", "tess", "lloyd"]) {
      for (const uid of APPLIED) Object.assign(empty, reviewOf(uid, who, { notes: "  " }));
    }
    everyKind(empty);
    for (const [who, uid, programmeId] of WAYS_IN) {
      assert.deepEqual(textsIn(await open(who, uid, programmeId), YUSUFS(uid)), [], `${who} reading ${uid} under ${programmeId}`);
    }
  });

  test("and an admin, who has saved nothing either, is shown all of it", async () => {
    everyKind();
    for (const [uid, programmeId] of [["amara", AGI], ["dev", AGI], ["nina", AGI], ["wen", TAIS]]) {
      const seen = await open("zach", uid, programmeId);
      assert.deepEqual(textsIn(seen, YUSUFS(uid)).sort(), YUSUFS(uid).sort(), `${uid} under ${programmeId}`);
      assert.deepEqual([seen.review.others.hidden, seen.review.others.until], [0, null]);
    }
  });

  test("where there is nothing to score, the one thing that ends it is their own overall comment", async () => {
    // Each of these has nothing to score: scores off, a blank answer, an invitation.
    for (const [who, uid, programmeId] of [["tess", "zach", INCUBATOR], ["claudia", "dev", AGI], ["claudia", "nina", AGI]]) {
      everyKind();
      const before = await open(who, uid, programmeId);
      assert.deepEqual(before.review.scorableKeys, [], `${who} reading ${uid}`);
      assert.deepEqual(before.review.others.until, { needs: "overall-comment" }, `${who} reading ${uid}`);
      const said = await save(who, uid, { programmeId, overallComment: "Mine first." });
      assert.equal(said.status, 200, JSON.stringify(said.body));
      assert.deepEqual(textsIn(said.body.review, YUSUFS(uid)).sort(), YUSUFS(uid).sort(), `${who} reading ${uid}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Where another reviewer's words can come from
// ---------------------------------------------------------------------------

describe("every file that names a review's overall comment says what it does with it", () => {
  /**
   * Checked both ways. A file that hands one person another reviewer's words
   * either asks the rule (`otherReviewsShownTo`) or is for an admin alone.
   */
  const NAMES_IT = new Map([
    ["lib/applications/model.ts", "declares the field on a review"],
    ["lib/applications/normalise.ts", "reads the stored `notes` into it"],
    ["lib/applications/scoring.ts", "THE RULE: with nothing to score, a review is the reviewer's own overall comment"],
    ["lib/applications/review/saveReview.ts", "writes the caller's own, on the caller's own row"],
    ["lib/applications/review/detail.ts", "hands on the caller's own, and other people's only through reviewsVisibleTo"],
    ["lib/applications/review/types.ts", "the payload and request fields it travels in"],
    ["lib/applications/decisionDay/pool.ts", "pooled applicants, which an admin alone opens, with the viewer's own application left out"],
    ["lib/firestore/memberRecords.ts", "the record kept after a term, which admins alone read"],
    ["features/applications/review/ReviewScreen.tsx", "draws what detail.ts sent, and sends the caller's own"],
  ]);

  test("the list is the tree", () => {
    const naming = [];
    const walk = (dir, under = "") => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        const name = under ? `${under}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path, name);
        else if (/\.tsx?$/.test(entry.name)) {
          const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
          if (/\boverallComment\b/.test(code)) naming.push(name);
        }
      }
    };
    walk(join(REPO_ROOT, "src"));
    assert.deepEqual(naming.sort(), [...NAMES_IT.keys()].sort());
  });

  test("the review screen's builder hands on other people's only through the rule", () => {
    const detail = readFileSync(join(REPO_ROOT, "src", "lib", "applications", "review", "detail.ts"), "utf8");
    assert.match(detail, /const visible = reviewsVisibleTo\(viewer\.uid, forProgramme, looking\)\.filter\(/);
    assert.match(detail, /const visibleOthers: OtherReview\[\] = visible\.map\(/);
    // Every other mention is of the caller's own row.
    const others = [...detail.matchAll(/(\w+)(\??)\.overallComment\b/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(others)].sort(), ["mine", "review"]);
  });
});
